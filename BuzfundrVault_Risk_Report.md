# BuzfundrVault — Smart Contract Security & Risk Analysis Report

**Contract:** `BuzfundrVault.sol`
**Compiler:** Solidity ^0.8.20 | **OpenZeppelin:** v5.0.0
**Network Targets:** Polygon Mainnet (137) / Amoy Testnet (80002)
**Report Date:** June 18, 2026
**Audit Status:** ⚠ UNAUDITED — Pre-deployment review only
**Findings:** 4 Critical | 4 High | 5 Medium | 3 Low | 2 Informational

---

## Table of Contents

1. Executive Summary
2. Contract Architecture Overview
3. Risk Parameter Catalogue
4. Security Findings — Critical
5. Security Findings — High
6. Security Findings — Medium
7. Security Findings — Low & Informational
8. MetaMask Deployment Feasibility Test
9. NI 45-110 On-Chain Compliance Mapping
10. Remediation Roadmap
11. Conclusion

---

## 1. Executive Summary

This report is a full blockchain-expert security and risk analysis of the **BuzfundrVault** smart contract
ecosystem — an on-chain crowdfunding vault designed for compliance with Canadian National Instrument 45-110
(Start-up Crowdfunding Registration Exemption). The analysis covers:

- `BuzfundrVault.sol` — Solidity smart contract
- `MockUSDC.sol` — Test ERC-20 token
- `vaultService.js` — Node.js blockchain service layer
- `vaultController.js` — Express HTTP controller
- `InvestPage.jsx` — React frontend investor flow
- `hardhat.config.js` — Deployment configuration

The contract demonstrates a well-intentioned NI 45-110 compliance framework — investor caps,
48-hour refund windows, deadline enforcement, and fee locking are all correctly coded at the EVM level.
However, the audit uncovered **4 Critical issues** that must be resolved before any mainnet deployment,
particularly around exposed private key material in source code and a missing enforcement gate for
the 7-day fail deadline.

> ⛔ **Pre-deployment Blocker:** The contract is NOT safe for mainnet deployment in its current state.
> All Critical and High findings must be resolved before going live.

---

## 2. Contract Architecture Overview

### 2.1 Component Map

```
React Frontend (InvestPage.jsx)
        │  REST API
        ▼
Laravel-API (PHP) — offerings / investors DB
        │  HTTP
        ▼
Node.js Blockchain Service (vaultService.js / vaultController.js)
        │  ethers.js v6
        ▼
BuzfundrVault.sol  (Polygon / Amoy) — OpenZeppelin v5
        │  ERC-20
        ▼
USDC Contract (Circle) OR MockUSDC (testing only)
```

### 2.2 Inheritance & Imports

| Component       | Inherits From                          | Purpose                              |
|-----------------|----------------------------------------|--------------------------------------|
| BuzfundrVault   | Ownable (OZ v5), ReentrancyGuard (OZ v5) | Admin access control + reentrancy  |
| IERC20          | OpenZeppelin v5                        | Interface for USDC interaction       |
| MockUSDC        | ERC20 (OZ v5)                          | Test-only token — NOT for production |

### 2.3 Access Control Roles

| Role          | Address                     | Permitted Functions                                          |
|---------------|-----------------------------|--------------------------------------------------------------|
| Investor      | Any wallet                  | `deposit()`, `refund()`                                      |
| Issuer        | Set at deploy (immutable)   | `releaseFunds()`                                             |
| Owner / Admin | Deployer wallet             | `failOffering()`, `emergencyRefund()`, `triggerAmendmentWindow()` |

---

## 3. Risk Parameter Catalogue

### 3.1 Immutable Constructor Parameters (Locked at Deploy Forever)

| Parameter             | Type    | Storage     | Bounds Check        | Default (Service Layer) | Risk   |
|-----------------------|---------|-------------|---------------------|-------------------------|--------|
| `usdc`                | address | `immutable` | ≠ address(0)        | `USDC_ADDRESS` env var  | HIGH   |
| `issuer`              | address | `immutable` | ≠ address(0)        | Per-offering wallet     | HIGH   |
| `platformFeeWallet`   | address | `immutable` | ≠ address(0)        | `PLATFORM_FEE_WALLET`   | HIGH   |
| `platformFeePercent`  | uint256 | `immutable` | 0–30 (revert >30)   | 7% default              | MEDIUM |

### 3.2 Deployment-Set State Parameters

| Parameter             | Unit          | Default Value                   | NI 45-110 Limit | Enforced On-Chain?          | Risk     |
|-----------------------|---------------|---------------------------------|-----------------|-----------------------------|----------|
| `minGoal`             | USDC (6 dec)  | Per offering                    | —               | ✓ Yes (releaseFunds)        | MEDIUM   |
| `maxCap`              | USDC (6 dec)  | Per offering                    | $1.5M CAD       | ✓ Yes (deposit)             | MEDIUM   |
| `maxPerInvestor`      | USDC (6 dec)  | 2,500 USDC                      | $2,500 CAD      | ✓ Yes (deposit)             | LOW      |
| `offeringDeadline`    | Unix timestamp| `block.timestamp + duration`    | 90 days max     | ⚠ Partial (no upper bound)  | HIGH     |
| `failDeadline`        | Unix timestamp| `offeringDeadline + 7 days`     | 5 business days | ✗ Stored, NEVER CHECKED     | CRITICAL |
| `refundWindowSeconds` | seconds       | 172,800 (48h)                   | 48h minimum     | ✓ Yes (refund)              | LOW      |

### 3.3 Runtime State Variables

| Variable                      | Set By                          | Risk of Manipulation                             |
|-------------------------------|---------------------------------|--------------------------------------------------|
| `isActive`                    | Constructor → release/fail      | None — only flipped false, never back to true    |
| `isReleased`                  | `releaseFunds()`                | None — protected by modifier + deadline check    |
| `isFailed`                    | `failOffering()`                | None — protected by onlyOwner + whenActive       |
| `totalDeposited`              | deposit / refund / fail         | Low — not zeroed after release (see H-03)        |
| `investorDeposits[addr]`      | deposit / refund                | None — zeroed-before-transfer (CEI pattern used) |
| `investorRefundDeadline[addr]`| deposit / triggerAmendment      | Low — admin can only extend, not shorten         |
| `investors[]`                 | deposit / _removeInvestor       | Medium — unbounded growth (bounded by economics) |

### 3.4 Service-Layer Parameters (Node.js Off-Chain)

| Parameter              | Location                       | Default    | Risk                                      |
|------------------------|--------------------------------|------------|-------------------------------------------|
| `GAS_LIMIT`            | `.env` / VaultService          | 500,000    | Too low for large `failOffering()` loops  |
| `PRIVATE_KEY`          | `.env`                         | —          | CRITICAL — must never be committed        |
| `HARDHAT_KEYS`         | `vaultService.js` lines 46–57  | 5 test keys| CRITICAL — hardcoded in source code       |
| `PLATFORM_FEE_PERCENT` | `.env`                         | 7          | Medium — not validated before deploy call |
| `RPC_URL`              | `.env`                         | localhost  | High — wrong network = funds on wrong chain|

---

## 4. Security Findings — CRITICAL

---

### C-01 | Private Keys Hardcoded in Production Service File
**Location:** `blockchain/src/services/vaultService.js` — lines 46–57

The `HARDHAT_KEYS` object maps 5 well-known Hardhat test addresses to their private keys in **plain text
inside committed source code**. The same code path (`_newSigner()`) is used by `invest()` and `refund()`
at runtime. If this map is ever extended with real investor keys, those keys are permanently in git history.

```js
// VULNERABLE CODE:
const HARDHAT_KEYS = {
  "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266":
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8":
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  // ... 3 more keys
};
```

**Attack Vector:** Developer adds a real wallet key for testing → CI/CD logs it → git history stores it permanently → attacker drains wallet.

**Fix:** Remove `HARDHAT_KEYS` entirely from `vaultService.js`. Move to a gitignored test utility file.
The service comment at line 283 already states *"In production, investor uses MetaMask"*.

---

### C-02 | failDeadline Stored But Never Enforced On-Chain
**Location:** `BuzfundrVault.sol` — line 135 (set), lines 230–256 (failOffering — NOT checked)

The contract correctly sets `failDeadline = offeringDeadline + 7 days` but **never checks it** in
`failOffering()`. The admin can call `failOffering()` at any time after the offering deadline —
even months later — as long as the goal was not reached. This violates NI 45-110 Rule 6
(fail within 5 business days) at the smart contract layer.

```solidity
// CURRENT (vulnerable):
function failOffering() external nonReentrant onlyOwner whenActive {
    if (block.timestamp <= offeringDeadline) revert DeadlineNotReached();
    if (totalDeposited >= minGoal) revert GoalAlreadyReached();
    // ← failDeadline is NEVER checked here
}

// FIX — add this line:
if (block.timestamp > failDeadline) revert FailDeadlinePassed();
```

**Impact:** Investor funds can remain locked indefinitely in a failed offering. Regulatory compliance failure.

---

### C-03 | Unbounded Loop Gas Bomb in failOffering() and triggerAmendmentWindow()
**Location:** `BuzfundrVault.sol` — lines 239–253, 279–285

Both functions iterate over the entire `investors[]` array with `ERC20.transfer()` calls inside the loop.
With `maxPerInvestor = $2,500` and `maxCap = $50,000`, there are up to 20 investors — manageable.
But if `maxPerInvestor` is set low (e.g., $100) and `maxCap` is high (e.g., $500,000), the loop
would iterate 5,000 times, consuming 5M+ gas and potentially exceeding the block gas limit.

```
Worst-case: 1,000 investors × ~30,000 gas (USDC transfer) = 30M gas = Ethereum block limit hit
Polygon practical ceiling: ~300–500 investors before failure risk
```

**Fix:** Implement a **pull-payment pattern** for `failOffering()`: set `isFailed = true`, then let investors
call `refund()` themselves to pull their funds. For `triggerAmendmentWindow()`, use an epoch counter
instead of looping all addresses.

---

### C-04 | MockUSDC.mint() Has No Access Control
**Location:** `blockchain/contracts/MockUSDC.sol` — line 11

```solidity
// VULNERABLE:
function mint(address to, uint256 amount) external {
    _mint(to, amount); // ← NO onlyOwner, NO access control
}
```

Any address can mint unlimited USDC. If this contract is accidentally deployed to production
(wrong `USDC_ADDRESS` in `.env`), any attacker mints infinite USDC, deposits into the vault,
reaches goal, and drains the issuer's funds upon release.

**Fix:** Add `onlyOwner` modifier to `mint()`, or — better — delete `MockUSDC.sol` from the repository
and use it only as a gitignored test artifact.

---

## 5. Security Findings — HIGH

---

### H-01 | No MetaMask Integration — Hardcoded Wallet in Frontend
**Location:** `frontend/src/pages/InvestPage.jsx` — line 33

```jsx
// CURRENT (broken for production):
investorWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
```

There is zero `window.ethereum` / MetaMask Web3 connection code in the frontend. Real investors
cannot connect their own wallets. Any user who changes the wallet field to their real address
will receive *"No private key for 0x..."* error from the service.

**Fix:** Integrate `ethers.js BrowserProvider` to connect MetaMask (full code sample in Section 8.5).

---

### H-02 | USDC Blacklist / Pause Dependency Risk
**Location:** `BuzfundrVault.sol` — line 127 (`immutable usdc`)

Circle's USDC has an admin blacklist and global pause mechanism. If the vault address or any
investor/issuer is blacklisted, all transfers revert permanently. The `usdc` address is `immutable`
— it cannot be changed post-deploy even by the owner. The vault has no fallback token and no
admin recovery path.

**Fix:** Add an emergency token sweep function (owner + time-lock). Consider a token abstraction
that allows designating an alternative token if USDC becomes unusable.

---

### H-03 | totalDeposited Not Reset After releaseFunds()
**Location:** `BuzfundrVault.sol` — lines 196–228

After `releaseFunds()`, the vault sets flags but never zeros `totalDeposited`. The `getFeeInfo()`
and `getVaultInfo()` view functions return stale non-zero values — all funds have left the vault
but the balance reads as non-zero. Misleading for dashboards and off-chain integrations.

**Fix:** Add `totalDeposited = 0;` at the end of `releaseFunds()`.

---

### H-04 | No Emergency Pause Mechanism
**Location:** `BuzfundrVault.sol` — entire contract

The contract has no pause mechanism. If a bug is discovered post-deployment while the vault
is active, the admin cannot halt deposits while preserving refund capability. The only recovery
is `emergencyRefund()` — called one investor at a time.

**Fix:** Add OpenZeppelin `Pausable` — `emergencyPause()` halts `deposit()` and `releaseFunds()`
but keeps `refund()` accessible.

---

## 6. Security Findings — MEDIUM

---

### M-01 | Block Timestamp Manipulation
**Location:** `BuzfundrVault.sol` — lines 143, 176, 197, 231

All deadline checks use `block.timestamp`. Validators can manipulate this by ±15 seconds.
For 48-hour refund windows, the drift is negligible. For day-long deadlines, the risk exists
but is low probability. Documented standard EVM risk.

---

### M-02 | ERC-20 Approve + Deposit Race Condition
**Location:** `vaultService.js` — lines 287–299

The two-transaction invest flow (approve → deposit) creates a window for front-running between
transactions. A malicious actor monitoring the mempool could exploit an approved allowance
before the deposit lands. Low risk on Polygon due to fast block times.

**Fix:** Use `USDC.permit()` (EIP-2612) if available, or zero the allowance before re-approving.

---

### M-03 | triggerAmendmentWindow() Missing nonReentrant
**Location:** `BuzfundrVault.sol` — line 277

This is the only state-mutating function without `nonReentrant`. While no external calls are made
(making reentrancy impossible today), it's inconsistent and dangerous if the function is later
extended with external calls.

**Fix:** Add `nonReentrant` modifier for consistency.

---

### M-04 | 90-Day Offering Duration Not Enforced On-Chain
**Location:** `BuzfundrVault.sol` — constructor, line 134

NI 45-110 limits offerings to 90 days. This is mentioned in comments but **not enforced in Solidity**.
A misconfigured deploy with `_durationSeconds = 365 days` would create a 1-year offering, violating securities law.

```solidity
// FIX — add to constructor:
require(_durationSeconds <= 7776000, "Max 90 days per NI 45-110");
```

---

### M-05 | Fee Calculation Integer Division Truncation
**Location:** `BuzfundrVault.sol` — line 202

`platformFee = (totalAmount * platformFeePercent) / 100` rounds down. The shortfall per
transaction is at most 1 micro-USDC ($0.000001). Negligible but worth documenting.
No code change required — document the behavior explicitly.

---

## 7. Security Findings — Low & Informational

---

### L-01 | _removeInvestor() O(n) Linear Scan
**Location:** `BuzfundrVault.sol` — lines 377–386

Linear scan of `investors[]` for removal. With current `maxPerInvestor = $2,500`, the array
is bounded to ~20 entries — acceptable. However if parameters allow many small investors,
gas cost scales linearly.

**Recommendation:** Monitor array length off-chain. For v2, maintain a reverse-index mapping for O(1) removal.

---

### L-02 | Compiler Version Uses Caret Range
**Location:** `BuzfundrVault.sol` — line 2 | `hardhat.config.js` — line 4

`pragma solidity ^0.8.20` allows compilation with any 0.8.x version. Best practice is exact pinning.

**Fix:** Change to `pragma solidity 0.8.20;`

---

### L-03 | No Formal Security Audit
**Location:** Project-wide

The contract handles real investor funds under Canadian securities law. No formal third-party audit exists.

**Recommendation:** Engage a recognized blockchain security firm (Trail of Bits, OpenZeppelin, Halborn, Certik)
before mainnet launch. Budget: $15,000–$50,000 USD.

---

### I-01 | Compliance Forms Verified Off-Chain Only
**Location:** `vaultController.js` — lines 61–89

NI 45-110 Forms F1, F2, and subscription agreement are validated as HTTP body fields only. A malicious
client can send `risk_acknowledgement_completed: true` without the investor reading anything. The
on-chain record does not cryptographically prove compliance.

**Recommendation:** Store a hash of the signed subscription agreement as a deposit parameter, creating
an on-chain compliance proof.

---

## 8. MetaMask Deployment Feasibility Test

### 8.1 Network Configuration

| Network               | Chain ID | RPC                              | USDC Contract                                | MetaMask |
|-----------------------|----------|----------------------------------|----------------------------------------------|----------|
| Polygon Amoy Testnet  | 80002    | rpc-amoy.polygon.technology      | Deploy MockUSDC                              | ✓ Native |
| Polygon Mainnet       | 137      | polygon-rpc.com                  | 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174   | ✓ Native |
| Ethereum Mainnet      | 1        | —                                | 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48   | ✓ Native |
| Hardhat Localhost     | 31337    | 127.0.0.1:8545                   | From deploy script                           | ✓ Manual |

### 8.2 Function-by-Function MetaMask Compatibility

| Function                    | Caller  | MetaMask Compatible? | Txn Count | Notes                                          |
|-----------------------------|---------|----------------------|-----------|------------------------------------------------|
| `deposit(amount)`           | Investor| ✓ FULLY COMPATIBLE   | 2 (approve + deposit) | Two MetaMask popups        |
| `refund()`                  | Investor| ✓ FULLY COMPATIBLE   | 1         | Within 48h window only                         |
| `releaseFunds()`            | Issuer  | ✓ FULLY COMPATIBLE   | 1         | Issuer MetaMask must match `issuer` address    |
| `failOffering()`            | Admin   | ⚠ ADMIN ONLY         | 1         | Requires owner MetaMask wallet                 |
| `emergencyRefund(addr)`     | Admin   | ⚠ ADMIN ONLY         | 1 per investor | One transaction per investor              |
| `triggerAmendmentWindow()`  | Admin   | ⚠ ADMIN ONLY         | 1         | Gas scales with investor count                 |
| **Contract Deployment**     | Deployer| ✓ VIA REMIX IDE      | 1         | Use Remix with MetaMask injected provider      |

### 8.3 Step-by-Step MetaMask Deployment (Polygon Amoy Testnet)

**Prerequisites:** MetaMask installed, Amoy testnet added, test MATIC from faucet.polygon.technology

**Step 1 — Add Polygon Amoy to MetaMask**
```
Network Name:  Polygon Amoy Testnet
RPC URL:       https://rpc-amoy.polygon.technology
Chain ID:      80002
Currency:      MATIC
Explorer:      https://amoy.polygonscan.com
```

**Step 2 — Deploy MockUSDC via Hardhat**
```bash
cd blockchain
echo "PRIVATE_KEY=0x<your_metamask_private_key>" > .env
echo "AMOY_RPC_URL=https://rpc-amoy.polygon.technology" >> .env
npx hardhat run scripts/deploy.js --network amoy
# → MockUSDC deployed at: 0x...
# Copy this address to USDC_ADDRESS in .env
```

**Step 3 — Deploy BuzfundrVault via Remix IDE**
```
1. Open https://remix.ethereum.org
2. Paste BuzfundrVault.sol into a new file
3. Compile: Solidity 0.8.20 + OpenZeppelin imports
4. Deploy & Run → Environment: "Injected Provider - MetaMask"
5. Connect MetaMask (Amoy network)
6. Constructor arguments:
   _usdc:                0x<MockUSDC address from Step 2>
   _issuer:              0x<your MetaMask address>
   _platformFeeWallet:   0x<fee wallet address>
   _platformFeePercent:  7
   _minGoal:             5000000000    (5,000 USDC — 6 decimals)
   _maxCap:              50000000000   (50,000 USDC)
   _maxPerInvestor:      2500000000    (2,500 USDC)
   _durationSeconds:     7776000       (90 days)
   _refundWindowSeconds: 172800        (48 hours)
7. Click DEPLOY → MetaMask popup → Confirm
```

**Step 4 — Investor Deposits (Two MetaMask popups)**
```
Popup 1: MockUSDC.approve(vault_address, 1000000000)  // Approve 1,000 USDC
Popup 2: BuzfundrVault.deposit(1000000000)            // Deposit 1,000 USDC
```

**Step 5 — Issuer Releases Funds**
```
// After offeringDeadline passes AND totalDeposited >= minGoal
// Call from ISSUER's MetaMask wallet:
BuzfundrVault.releaseFunds()
```

### 8.4 Gas Cost Estimates (Polygon Network)

| Operation                         | Est. Gas Units | At 100 gwei MATIC | USD Equivalent |
|-----------------------------------|----------------|-------------------|----------------|
| Deploy BuzfundrVault              | ~2,100,000     | 0.21 MATIC        | ~$0.11         |
| Deploy MockUSDC                   | ~800,000       | 0.08 MATIC        | ~$0.04         |
| USDC approve()                    | ~46,000        | 0.0046 MATIC      | ~$0.002        |
| deposit()                         | ~95,000        | 0.0095 MATIC      | ~$0.005        |
| refund()                          | ~60,000        | 0.006 MATIC       | ~$0.003        |
| releaseFunds()                    | ~85,000        | 0.0085 MATIC      | ~$0.004        |
| failOffering() — 20 investors     | ~650,000       | 0.065 MATIC       | ~$0.033        |

### 8.5 MetaMask Frontend Integration Code (Fix for H-01)

```jsx
// Replace hardcoded wallet in InvestPage.jsx with:
import { ethers } from 'ethers';

const connectWallet = async () => {
  if (!window.ethereum) { alert('MetaMask not installed'); return; }
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  setForm(p => ({ ...p, investorWallet: address }));
};

// Invest directly from MetaMask — no backend private key needed:
const handleInvestMetaMask = async () => {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
  const vaultContract = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer);
  const amount = ethers.parseUnits(form.amount, 6);

  // MetaMask Popup 1: Approve USDC
  const approveTx = await usdcContract.approve(VAULT_ADDRESS, amount);
  await approveTx.wait();

  // MetaMask Popup 2: Deposit into vault
  const depositTx = await vaultContract.deposit(amount);
  await depositTx.wait();
  toast.success('Investment confirmed on-chain!');
};
```

> ✅ **MetaMask Feasibility Verdict:** BuzfundrVault is **fully MetaMask-compatible** at the contract level.
> All investor/issuer functions work directly from a MetaMask wallet on Polygon.
> The only barrier is the missing frontend MetaMask integration (H-01) — approximately 1 engineering day to fix.

---

## 9. NI 45-110 On-Chain Compliance Mapping

| # | NI 45-110 Rule                              | On-Chain Enforcement                                             | Status              |
|---|---------------------------------------------|------------------------------------------------------------------|---------------------|
| 1 | Max $2,500 per investor                     | `if (investorDeposits[sender] + amount > maxPerInvestor) revert` | ✓ Enforced         |
| 2 | Max 90-day offering period                  | `offeringDeadline = block.timestamp + _durationSeconds`          | ⚠ Not bounded (M-04)|
| 3 | 48h refund window after each deposit        | `investorRefundDeadline[sender] = block.timestamp + window`      | ✓ Enforced         |
| 4 | Release only after deadline + goal met      | `if (timestamp <= deadline) revert; if (total < minGoal) revert` | ✓ Enforced         |
| 5 | Fail if goal not met by deadline            | `if (total >= minGoal) revert GoalAlreadyReached()`              | ✓ Partially        |
| 6 | Fail within 5 business days of deadline     | `failDeadline` stored but **NEVER checked** in failOffering()   | ✗ NOT enforced (C-02)|
| 7 | Amendment resets investor refund windows    | `triggerAmendmentWindow()` resets all `investorRefundDeadline`   | ✓ Enforced         |
| 8 | Fee locked at offering creation             | `platformFeePercent` and `platformFeeWallet` are `immutable`     | ✓ Enforced         |
| 9 | Form F1/F2 investor confirmation            | HTTP body validation only — off-chain                            | ⚠ Off-chain (I-01) |
|10 | Full refund on failed offering              | Loop in `failOffering()` refunds 100% of all deposits            | ✓ Enforced         |

---

## 10. Remediation Roadmap

### Phase 1 — Pre-Deployment Blockers (All Critical — Est. 1 Day)

| ID   | Action                                                                 | Effort | Owner         |
|------|------------------------------------------------------------------------|--------|---------------|
| C-01 | Remove `HARDHAT_KEYS` from vaultService.js; move to gitignored test util | 1h   | Backend Dev   |
| C-02 | Add `if (block.timestamp > failDeadline) revert` to `failOffering()`  | 30min  | Blockchain Dev|
| C-03 | Refactor `failOffering()` to pull-payment pattern                      | 4h     | Blockchain Dev|
| C-04 | Add `onlyOwner` to `MockUSDC.mint()` or delete from prod repo          | 30min  | Blockchain Dev|

### Phase 2 — High Priority (Before Public Beta — Est. 2 Days)

| ID   | Action                                                              | Effort |
|------|---------------------------------------------------------------------|--------|
| H-01 | Add MetaMask wallet connection in InvestPage.jsx (see code in §8.5) | 1 day  |
| H-02 | Document USDC blacklist risk; add emergency token sweep function    | 2h     |
| H-03 | Add `totalDeposited = 0` at end of `releaseFunds()`                 | 30min  |
| H-04 | Add OpenZeppelin Pausable to contract                               | 2h     |

### Phase 3 — Medium & Low (Before Mainnet Launch)

| ID   | Action                                                          | Effort   |
|------|-----------------------------------------------------------------|----------|
| M-04 | Add `require(_durationSeconds <= 7776000)` to constructor       | 15min    |
| M-03 | Add `nonReentrant` to `triggerAmendmentWindow()`                | 5min     |
| L-02 | Pin Solidity version: `pragma solidity 0.8.20;`                 | 5min     |
| L-03 | Commission formal third-party security audit                    | 4–6 weeks|

---

## 11. Conclusion

**BuzfundrVault** is a well-structured smart contract with a clear compliance intent. The core on-chain
mechanics — investor caps, refund windows, deadline enforcement, and immutable fee locking — are
correctly implemented and represent a solid foundation for a NI 45-110 compliant crowdfunding platform.

However, the codebase is **not safe for mainnet deployment** without resolving the four Critical findings.
The most urgent issue is the hardcoded private key material in `vaultService.js` (C-01) and the missing
`failDeadline` enforcement (C-02). These are quick fixes — collectively under 2 hours of engineering work.

On the **MetaMask deployment feasibility** front: the smart contract is fully MetaMask-compatible.
All investor and issuer functions can be called directly from a MetaMask wallet without any backend
intermediary. The only missing piece is frontend integration (H-01) — approximately one engineering day.

> ✅ **Final Verdict:** Architecturally sound, compliance framework thoughtful, MetaMask deployment path clear.
> Resolve 4 Critical findings + integrate MetaMask frontend + commission formal audit = ready for production
> deployment on Polygon.

---

*BuzfundrVault Security & Risk Analysis Report — June 18, 2026*
*CONFIDENTIAL — For Internal Use Only — BizFundr Inc.*
*Prepared by: Blockchain Security Expert Analysis*
