# Buzfundr Vault — Complete Documentation

## TABLE OF CONTENTS
1. What Is This Application?
2. Why Does It Exist?
3. System Architecture
4. All Features List
5. All API Endpoints (Node.js)
6. Execution Flows (All Scenarios)
7. Complete Test Cases (with dummy data)
8. When & Why Restarts Happen
9. Go Live — Step by Step
10. Accounts & Purchases Needed

---

## 1. WHAT IS THIS APPLICATION?

Buzfundr is a **crowdfunding platform** where startups raise money from investors using **blockchain technology**.

Instead of using Stripe or PayPal, investors send **USDC** (a cryptocurrency pegged 1:1 to the US dollar) to a **smart contract vault** on the blockchain. The vault locks the money and only releases it to the startup if enough people invest.

**Think of it as Kickstarter, but:**
- Money is held by code (smart contract), not a company
- Nobody can steal or manipulate the funds — not even the platform admin
- All transactions are visible on the blockchain
- Rules (deadlines, refund windows, caps) are enforced by code that cannot be changed

---

## 2. WHY DOES IT EXIST?

**Problem:** Canadian securities law (National Instrument 45-110) has strict rules for crowdfunding:
- Investors must be able to refund within 48 hours
- Maximum $2,500 per investor per offering
- Maximum $1,500,000 per startup per 12 months
- Investors must read risk documents before investing
- Funds must be held separately from platform funds

**Solution:** A smart contract vault that enforces ALL these rules automatically on the blockchain. The platform (Buzfundr) cannot touch investor funds. Everything is transparent and auditable.

---

## 3. SYSTEM ARCHITECTURE

```
Investor Browser                     Startup Browser
      |                                    |
      v                                    v
[React Frontend :5173]              [React Frontend :5173]
      |                                    |
      v                                    v
[Laravel API :8000] ---- Database (MySQL/SQLite) ---- 8-year audit log
      |
      v
[Node.js API :3001] ---- ethers.js ---- JSON-RPC
      |
      v
[Hardhat Blockchain :8545 / Polygon Mainnet]
      |
      v
[BuzfundrVault.sol] ---- holds USDC ---- enforces rules
```

**4 Layers:**

| Layer | Technology | Port | Purpose |
|-------|-----------|------|---------|
| Frontend | React + Vite + Tailwind | 5173 | UI for investors, issuers, admin |
| Business API | Laravel (PHP) | 8000 | Validation, database, compliance forms, audit log |
| Blockchain API | Node.js + Express + ethers.js | 3001 | Talks to smart contract, signs transactions |
| Blockchain | Hardhat (local) / Polygon (production) | 8545 | Smart contract execution, fund custody |

---

## 4. ALL FEATURES

### Smart Contract Features (on-chain, cannot be bypassed)
| Feature | Description |
|---------|-------------|
| Fund Locking | Investor USDC goes INTO the contract. Nobody can take it out without meeting conditions. |
| Per-Investor Cap | $2,500 USDC maximum per investor per offering. Enforced on-chain. |
| 48-Hour Refund Window | Each investor gets 48 hours to change their mind. Checked via block.timestamp. |
| Conditional Release | Funds only go to issuer IF: deadline passed AND total raised >= minimum goal. |
| Auto-Fail Refund | If deadline passes and goal NOT reached, admin can bulk-refund ALL investors. |
| Emergency Refund | Admin can refund a specific investor anytime (for fraud/suspicious activity only). |
| Amendment Window | When issuer changes their offering document, all refund windows reset to 48 hours. |
| Issuer-Only Release | Only the founder wallet (set at deployment) can call release. Admin cannot. |
| ReentrancyGuard | Prevents attack where someone tries to drain the contract. |
| Event Logging | Every action emits an event that's permanently recorded on the blockchain. |

### Node.js API Features
| Feature | Description |
|---------|-------------|
| Deploy Vault | Creates a new smart contract for each offering. |
| Invest (proxy) | In testing, proxies the investor's deposit call. In production, investor uses MetaMask. |
| Refund (proxy) | In testing, proxies the investor's refund call. |
| Release (proxy) | In testing, proxies the issuer's release call. |
| Fail Offering | Admin bulk-refunds all investors when goal not met. |
| Emergency Refund | Admin bypasses 48hr window for fraud cases. |
| Amend Offering | Resets all investor refund windows after document change. |
| Vault Status | Reads on-chain data: raised amount, goal, deadline, investor count. |
| Investor Info | Shows a specific investor's deposit, refund deadline, eligibility. |
| Event History | Queries all on-chain events for a vault. |
| Wallet Balance | Shows ETH + USDC balance for any address. |
| Time Advance | (Testing only) Skips blockchain time forward. |
| Recharge | (Testing only) Sends test USDC to any wallet. |
| Human-Readable Errors | All Solidity errors are translated to plain English with hints. |

### Laravel API Features
| Feature | Description |
|---------|-------------|
| Issuer Registration | With $1.5M limit check and "lying is crime" acknowledgement. |
| One-Offering Rule | Blocks creating a second offering for the same issuer. |
| Compliance Validation | Requires F1, F2, subscription agreement before allowing investment. |
| Database Records | Offerings, investments, compliance records, investors, issuers. |
| 8-Year Audit Log | Every action logged with timestamp, actor, IP, tx hash. |

### Frontend Features
| Feature | Description |
|---------|-------------|
| Dashboard | Lists all offerings with status badges. |
| Create Offering | Form with issuer compliance checkboxes. |
| 4-Step Invest Flow | Read document → Acknowledge risks → Sign agreement → Send USDC. |
| Offering Detail | Vault status, investor list, on-chain event history, action buttons. |
| Admin Panel | Fail, emergency refund, amend, time advance, recharge. |
| Issuer Management | Register startups with legal compliance. |

---

## 5. ALL API ENDPOINTS (Node.js — Port 3001)

### Authentication
All endpoints (except /health and /abi) require header: `X-API-Key: buzfundr-node-api-key-2025`

### Write Endpoints

| Method | Endpoint | Who Calls | Purpose | Required Body Fields |
|--------|----------|-----------|---------|---------------------|
| POST | /deploy-vault | Admin | Deploy new vault contract | min_goal_usdc, max_cap_usdc, max_per_investor, duration_seconds, refund_window_seconds, issuer_wallet |
| POST | /invest | Investor | Lock USDC in vault | vault_address, investor_wallet, amount_usdc, risk_acknowledgement_completed, offering_document_confirmed, subscription_agreement_signed, subscription_timestamp |
| POST | /refund | Investor | Self-refund within 48hrs | vault_address, investor_wallet |
| POST | /release | Issuer | Claim funds after deadline+goal | vault_address, issuer_wallet |
| POST | /fail-offering | Admin | Bulk refund all investors | vault_address |
| POST | /emergency-refund | Admin | Fraud refund (bypasses 48hr) | vault_address, investor_wallet, reason (min 10 chars) |
| POST | /amend-offering | Admin | Reset all refund windows | vault_address |

### Read Endpoints

| Method | Endpoint | Purpose | Returns |
|--------|----------|---------|---------|
| GET | /health | API health check | status, service name, time |
| GET | /abi | Contract ABI for frontend | vault_abi, usdc_abi, usdc_address |
| GET | /vaults | List all deployed vaults | Array of vault objects |
| GET | /vault/:address | Vault status | status, total_deposited, goal_reached, deadline_passed, investor_count, etc. |
| GET | /vault/:vault/investor/:wallet | Investor info | deposit_usdc, refund_deadline, refund_eligible, remaining_cap |
| GET | /vault/:address/history | On-chain event log | Array of deposit/refund/release/fail events with tx hashes |
| GET | /wallet/:address | Wallet balance | eth, usdc |
| GET | /time | Current blockchain time | block_time, block_number, real_time |

### Testing Endpoints (remove before production)

| Method | Endpoint | Purpose | Required Body |
|--------|----------|---------|---------------|
| POST | /recharge | Send test USDC to wallet | wallet_address, amount_usdc |
| POST | /time/advance | Skip blockchain time | seconds |

---

## 6. EXECUTION FLOWS (ALL SCENARIOS)

### FLOW A: Happy Path (Startup Gets Funded)

```
Admin creates offering
  → Smart contract deployed → vault address created
  → Vault is ACTIVE, 0 raised, deadline set

Investor recharges wallet (testing only)
  → Admin sends 5000 USDC to investor wallet

Investor completes compliance
  → Reads offering document (Form 45-110F1) ✓
  → Acknowledges risks (Form 45-110F2) ✓
  → Signs subscription agreement ✓

Investor deposits 1500 USDC
  → USDC transferred from investor wallet to vault contract
  → investorDeposits[investor] = 1500
  → totalDeposited = 1500
  → refundDeadline = now + 48 hours
  → Event: Deposited(investor, 1500, deadline)

Time passes (90 days or skip in testing)
  → block.timestamp > offeringDeadline

Admin/frontend checks vault status
  → deadline_passed = true
  → goal_reached = true (1500 >= 1000)
  → status = "ready_to_release"

Issuer calls releaseFunds()
  → Contract checks: deadline passed? YES. Goal reached? YES.
  → All 1500 USDC transferred from vault → issuer wallet
  → isActive = false, isReleased = true
  → Event: FundsReleased(issuer, 1500)
  → VAULT PERMANENTLY CLOSED
```

### FLOW B: Fail Path (Goal Not Reached)

```
Same setup as Flow A, but investor only puts in 500 USDC
  → totalDeposited = 500
  → Goal is 5000 → goal_reached = false

Time passes (deadline)

Admin calls failOffering()
  → Contract checks: deadline passed? YES. Goal reached? NO.
  → Loop through all investors:
    → Transfer 500 USDC back to investor
    → Event: Refunded(investor, 500, "Offering failed")
  → isActive = false, isFailed = true
  → Event: OfferingFailed(500, 1)
  → VAULT PERMANENTLY CLOSED
```

### FLOW C: Investor Refund (Within 48 Hours)

```
Investor deposits 800 USDC at 2:00 PM Monday
  → refundDeadline = Wednesday 2:00 PM

Investor calls refund() at 3:00 PM Monday (1 hour later)
  → Contract checks: block.timestamp <= refundDeadline? YES
  → 800 USDC transferred back to investor
  → investorDeposits[investor] = 0
  → totalDeposited -= 800
  → Event: Refunded(investor, 800, "voluntary withdrawal")
```

### FLOW D: Refund REJECTED (48 Hours Expired)

```
Investor deposits 1000 USDC
  → refundDeadline = now + 60 seconds (testing)

Time advances 70 seconds

Investor calls refund()
  → Contract checks: block.timestamp <= refundDeadline? NO
  → REVERT: "RefundWindowExpired"
  → Human-readable error: "The 48-hour refund window has expired"
  → Money stays locked
```

### FLOW E: Emergency Refund (Admin Bypass for Fraud)

```
Investor's 48hr window has expired (normal refund blocked)

Admin discovers investor submitted fake identity documents

Admin calls emergencyRefund(investor)
  → Contract checks: investor has deposit? YES
  → BYPASSES 48hr check (admin-only function)
  → USDC returned to investor
  → Event: EmergencyRefund(investor, amount, "suspicious activity")
```

### FLOW F: Offering Amendment (Document Changed)

```
Day 1: Alice invests → 48hr refund window set (expires Day 3)
Day 5: Alice's window has expired — she cannot refund normally
Day 10: Issuer updates their offering document

Admin calls triggerAmendmentWindow()
  → Contract resets ALL investor refund deadlines to now + 48 hours
  → Alice's refundDeadline = Day 10 + 48 hours = Day 12
  → Alice can now refund again!
  → Event: AmendmentWindowTriggered(newDeadline, investorCount)
```

### FLOW G: $2,500 Investor Cap Enforcement

```
Investor deposits 2000 USDC → OK (total: 2000, cap: 2500)
Investor deposits 600 more → REJECTED (2000+600=2600 > 2500)
  → Error: ExceedsInvestorCap(allowed: 500)
Investor deposits 500 more → OK (total: 2500, exactly at cap)
Investor deposits 1 more → REJECTED (2500+1=2501 > 2500)
```

### FLOW H: Max Cap Enforcement

```
Vault max_cap = 10000 USDC
Current totalDeposited = 9500

Investor tries to deposit 600
  → 9500 + 600 = 10100 > 10000
  → REJECTED: ExceedsMaxCap(remaining: 500)

Investor deposits 500 → OK (total: 10000, exactly at cap)
Next investor tries anything → REJECTED
```

---

## 7. COMPLETE TEST CASES

### Test Wallets (Hardhat)

| Role | Wallet Address | Short Name |
|------|---------------|------------|
| Admin (Platform) | 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 | admin |
| Investor 1 | 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 | investor1 |
| Issuer (Founder) | 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC | issuer |
| Investor 2 | 0x90F79bf6EB2c4f870365E785982E1f101E93b906 | investor2 |

### Test Case Table

| ID | Name | Steps | Expected Result |
|----|------|-------|-----------------|
| TC01 | Deploy vault | POST /deploy-vault with goal=1000, cap=10000, issuer=0x3C44C... | success=true, vault_address returned |
| TC02 | Deploy without issuer | POST /deploy-vault without issuer_wallet | 400 error: "Required: issuer_wallet" |
| TC03 | Recharge wallet | POST /recharge wallet=investor1, amount=5000 | success=true, new_balance=5000 |
| TC04 | Check balance | GET /wallet/investor1 | Shows ETH + USDC balance |
| TC05 | Invest 1500 | POST /invest with all compliance=true | success=true, tx_hash returned |
| TC06 | Invest without risk ack | POST /invest risk_acknowledgement=false | 400 error: compliance required |
| TC07 | Invest without doc confirm | POST /invest offering_document=false | 400 error: compliance required |
| TC08 | Invest without subscription | POST /invest subscription=false | 400 error: compliance required |
| TC09 | Invest 0 amount | POST /invest amount=0 | 400 error: AMOUNT_ZERO |
| TC10 | Invest over $2500 | POST /invest amount=3000 | 400 error: EXCEEDS_INVESTOR_CAP |
| TC11 | Invest over max cap | POST /invest amount > remaining | 400 error: EXCEEDS_MAX_CAP |
| TC12 | Invest insufficient USDC | POST /invest without recharge | error: Insufficient USDC |
| TC13 | Refund within window | POST /refund immediately after invest | success=true, USDC returned |
| TC14 | Refund after window | Advance time past window, POST /refund | 400 error: REFUND_WINDOW_EXPIRED |
| TC15 | Refund no deposit | POST /refund for non-investor | error: No deposit found |
| TC16 | Release before deadline | POST /release without time skip | 400 error: DEADLINE_NOT_REACHED |
| TC17 | Release goal not reached | Skip time, POST /release when under goal | 400 error: GOAL_NOT_REACHED |
| TC18 | Release success | Skip time, goal reached, POST /release | success=true, USDC to issuer |
| TC19 | Release non-issuer | POST /release with wrong wallet | 400 error: NOT_ISSUER |
| TC20 | Fail before deadline | POST /fail-offering without time skip | 400 error: DEADLINE_NOT_REACHED |
| TC21 | Fail goal reached | Skip time, goal reached, POST /fail | 400 error: GOAL_ALREADY_REACHED |
| TC22 | Fail success | Skip time, goal not reached, POST /fail | success=true, all refunded |
| TC23 | Emergency refund | POST /emergency-refund with reason | success=true, USDC returned |
| TC24 | Emergency no reason | POST /emergency-refund reason<10 chars | 400 error: reason required |
| TC25 | Amend offering | POST /amend-offering | success=true, windows reset |
| TC26 | Amend then refund | Amend after window expired, then refund | success=true (window reopened) |
| TC27 | Invest after deadline | Skip time past deadline, POST /invest | 400 error: DEADLINE_PASSED |
| TC28 | Action on closed vault | Release, then try invest | 400 error: VAULT_CLOSED |
| TC29 | Multiple investors | Invest from investor1 + investor2 | Both tracked, both can refund |
| TC30 | Vault status check | GET /vault/:address at each stage | Correct status at each stage |

---

## 8. WHEN & WHY RESTARTS HAPPEN

### In Testing (Hardhat Local) — Restarts Happen Because:

| Situation | What Happens | Solution |
|-----------|-------------|----------|
| You restart Hardhat node | ALL blockchain state wiped (contracts, balances, nonces reset to 0) | Redeploy contracts, recharge wallets, recreate offerings |
| You restart Node.js API | API state wiped (deployed vaults list cleared) but blockchain state preserved if Hardhat still running | Just restart API. Vaults still exist on-chain. |
| Computer restarts | Everything stops | Start all 4 terminals again from scratch |
| Hardhat crashes | Blockchain gone | Restart Hardhat, redeploy everything |

### WHEN You Need Full Restart:
- Hardhat node was stopped/restarted → FULL restart (redeploy + recreate)
- Node.js API crashed → Just restart API (`npm start`)
- Laravel crashed → Just restart Laravel (`php artisan serve`)
- React crashed → Just restart React (`npm run dev`)

### Complete Restart Procedure (only when Hardhat was stopped):
```bash
# Terminal 1:
npx hardhat node

# Terminal 2:
npx hardhat run scripts/deploy.js --network localhost
# Copy USDC address to .env
npm start

# Terminal 3:
php artisan migrate:fresh --seed
php artisan serve --port=8000

# Terminal 4:
npm run dev
```

### In Production (Polygon Mainnet) — RESTARTS ARE DIFFERENT:

**Blockchain NEVER restarts.** Polygon mainnet runs 24/7/365. Your contracts, balances, and all state persist forever. There is ZERO nonce issue because the blockchain never resets.

**Node.js API can restart freely.** Since every transaction creates a fresh wallet+provider (our nuclear fix), the API has no cached state. Restart it anytime without issues.

**What you DO need in production:**

| Concern | Solution |
|---------|----------|
| Node.js crashes | Use PM2 process manager: `pm2 start src/index.js --name buzfundr-api` — auto-restarts on crash |
| Server reboots | PM2 startup script: `pm2 startup` — auto-starts on boot |
| Multiple instances | PM2 cluster mode: `pm2 start src/index.js -i max` — uses all CPU cores |
| Zero-downtime deploy | `pm2 reload buzfundr-api` — restarts without dropping connections |
| Logs | `pm2 logs buzfundr-api` — real-time log viewing |
| Monitoring | `pm2 monit` — CPU/memory dashboard |

**Production startup script (run once):**
```bash
npm install -g pm2
pm2 start src/index.js --name buzfundr-api
pm2 save
pm2 startup    # Follow the printed command to enable auto-start
```

**The nonce problem ONLY exists on Hardhat** because Hardhat resets its blockchain on every restart. Polygon mainnet never resets, so nonces always increment correctly.

---

## 9. GO LIVE — STEP BY STEP

### Stage 1: Local Development (Done ✅)
What you have now. Hardhat + MockUSDC. Free. No real money.

### Stage 2: Polygon Amoy Testnet (Free — Real Wallets, Fake Money)

**Step 1: Install MetaMask**
- Go to https://metamask.io
- Install browser extension
- Create a new wallet (SAVE YOUR SEED PHRASE!)
- You now have an Ethereum address

**Step 2: Add Polygon Amoy Testnet to MetaMask**
- Open MetaMask → Settings → Networks → Add Network
```
Network Name:     Polygon Amoy Testnet
RPC URL:          https://rpc-amoy.polygon.technology
Chain ID:         80002
Currency Symbol:  MATIC
Explorer URL:     https://amoy.polygonscan.com
```

**Step 3: Get Free Test MATIC**
- Go to https://faucet.polygon.technology
- Select "Amoy" network
- Paste your MetaMask wallet address
- Click "Submit" — you'll receive free test MATIC for gas fees

**Step 4: Deploy to Testnet**
- Copy your MetaMask private key (MetaMask → Account → Export Private Key)
- Put it in `blockchain/.env`:
```
RPC_URL=https://rpc-amoy.polygon.technology
CHAIN_ID=80002
PRIVATE_KEY=0xyour_metamask_private_key_here
```
- Run: `npx hardhat run scripts/deploy.js --network amoy`
- MockUSDC is deployed on testnet

**Step 5: Test Everything**
- Use MetaMask to interact with the vault contract
- Send test USDC between wallets
- Verify on https://amoy.polygonscan.com

**Cost: $0** — Everything is free on testnet.

### Stage 3: Polygon Mainnet (REAL MONEY)

**Step 1: Create Accounts**

| Account | Where | Cost | Why |
|---------|-------|------|-----|
| Coinbase/Binance account | coinbase.com or binance.com | Free | Buy MATIC tokens for gas fees |
| Alchemy account | alchemy.com | Free tier | Reliable RPC endpoint (better than public) |
| DigitalOcean account | digitalocean.com | $5/mo | Host the Node.js API server |
| Namecheap account | namecheap.com | $12/yr | Domain name (api.buzfundr.com) |
| Ledger hardware wallet | ledger.com | $79 one-time | Secure admin private key storage |

**Step 2: Buy MATIC Tokens**
- Sign up on Coinbase (or Binance)
- Buy $20 worth of MATIC (Polygon)
- Withdraw MATIC to your MetaMask wallet on Polygon network
- This pays for gas fees (contract deployment + transactions)

**Step 3: Get a Production RPC URL**
- Sign up at https://alchemy.com (free)
- Create a new app → Select "Polygon Mainnet"
- Copy the HTTPS URL (looks like: `https://polygon-mainnet.g.alchemy.com/v2/your-api-key`)

**Step 4: Set Up Production Server**
- Create a DigitalOcean Droplet ($6/mo — Ubuntu 24)
- SSH into the server
```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Clone your project
git clone your-repo-url
cd buzfundr/blockchain

# Install dependencies
npm install

# Create production .env
nano .env
```

Production `.env`:
```
PORT=3001
API_KEY=your-very-strong-random-api-key-here
NODE_ENV=production
RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/your-alchemy-key
CHAIN_ID=137
PRIVATE_KEY=0xyour_PRODUCTION_private_key_NOT_hardhat
USDC_ADDRESS=0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
GAS_LIMIT=500000
```

**CRITICAL:** The `PRIVATE_KEY` must be your **production admin wallet**, NOT the Hardhat test key. The Hardhat key is public — anyone can use it.

**Step 5: Deploy Smart Contract to Polygon Mainnet**
```bash
npx hardhat run scripts/deploy.js --network polygon
```
This will NOT deploy MockUSDC (real USDC already exists on Polygon at `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`).

You only deploy `BuzfundrVault` contracts (one per offering) via the API.

**Step 6: Start with PM2**
```bash
npm install -g pm2
pm2 start src/index.js --name buzfundr-api
pm2 save
pm2 startup
```

**Step 7: Set Up Domain + SSL**
```bash
sudo apt install nginx certbot python3-certbot-nginx

# Configure nginx
sudo nano /etc/nginx/sites-available/buzfundr
```

Nginx config:
```
server {
    server_name api.buzfundr.com;
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/buzfundr /etc/nginx/sites-enabled/
sudo certbot --nginx -d api.buzfundr.com
sudo systemctl restart nginx
```

**Step 8: Verify Contract on Polygonscan**
```bash
npx hardhat verify --network polygon DEPLOYED_CONTRACT_ADDRESS constructor_args...
```
This makes your contract source code public and verifiable — builds trust with investors.

---

## 10. ACCOUNTS & PURCHASES SUMMARY

### Free (no cost)

| Item | Where |
|------|-------|
| MetaMask wallet | metamask.io |
| Alchemy RPC | alchemy.com (free tier: 300M compute units/mo) |
| Polygon Amoy testnet | faucet.polygon.technology |
| Let's Encrypt SSL | certbot (free with any server) |
| PM2 process manager | npm install -g pm2 |

### One-Time Purchases

| Item | Cost | Where | Why |
|------|------|-------|-----|
| MATIC tokens | $20 | Coinbase/Binance | Gas fees for deployment + transactions |
| Ledger Nano S Plus | $79 | ledger.com | Secure admin private key (recommended) |
| Smart contract audit | $2,000-5,000 | CertiK, Hacken, etc. | Security review before real money (recommended) |

### Monthly Costs

| Item | Cost/Month | Where | Why |
|------|-----------|-------|-----|
| VPS Server | $6 | DigitalOcean | Host Node.js API |
| Domain | $1 | Namecheap ($12/yr) | api.buzfundr.com |
| Alchemy (if exceed free) | $0-49 | alchemy.com | Only if >300M requests/month |

### Total to Launch

| Category | Minimum | Recommended |
|----------|---------|-------------|
| Gas fees | $20 | $20 |
| Hosting | $6/mo | $6/mo |
| Domain | $12/yr | $12/yr |
| Hardware wallet | $0 | $79 |
| Contract audit | $0 | $3,000 |
| **Total to start** | **~$40** | **~$3,120** |
| **Monthly ongoing** | **$6/mo** | **$6/mo** |

---

## APPENDIX: IMPORTANT ADDRESSES

### Hardhat Local (Testing)
```
Admin:     0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Investor1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
Issuer:    0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
Investor2: 0x90F79bf6EB2c4f870365E785982E1f101E93b906
MockUSDC:  (displayed after deploy script runs)
```

### Polygon Mainnet (Production)
```
Real USDC: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
Chain ID:  137
RPC:       https://polygon-rpc.com (or your Alchemy URL)
Explorer:  https://polygonscan.com
```

---

*Document version: 2.0 | Last updated: February 2026 | Author: Buzfundr Development Team*
