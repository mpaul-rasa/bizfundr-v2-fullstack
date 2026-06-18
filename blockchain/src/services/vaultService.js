const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");
require("dotenv").config();

const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const VAULT_ABI = [
  "function deposit(uint256 amount)",
  "function refund()",
  "function releaseFunds()",
  "function failOffering()",
  "function emergencyRefund(address investor)",
  "function triggerAmendmentWindow()",
  "function getVaultInfo() view returns (bool,bool,bool,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool,bool,address)",
  "function getInvestorInfo(address) view returns (uint256,uint256,bool,uint256)",
  "function getInvestorCount() view returns (uint256)",
  "function getInvestorAtIndex(uint256) view returns (address)",
  "function investorDeposits(address) view returns (uint256)",
  "function totalDeposited() view returns (uint256)",
  "function isActive() view returns (bool)",
  "function isReleased() view returns (bool)",
  "function isFailed() view returns (bool)",
  "function issuer() view returns (address)",
  "event Deposited(address indexed investor, uint256 amount, uint256 refundDeadline, uint256 totalAfter)",
  "event Refunded(address indexed investor, uint256 amount, string reason)",
  // "event FundsReleased(address indexed issuer, uint256 amount, uint256 investorCount)",
  // "event FundsReleased(address indexed issuer, uint256 issuerAmount, uint256 platformFee, uint256 investorCount)",
  "event FundsReleased(address indexed issuer, uint256 issuerAmount, uint256 platformFee, uint256 feePercent, uint256 investorCount)",
  "event OfferingFailed(uint256 totalRefunded, uint256 investorCount)",
  "event EmergencyRefund(address indexed investor, uint256 amount, string reason)",
  "event AmendmentWindowTriggered(uint256 newDeadline, uint256 investorCount)",
  "function usdc() view returns (address)",
  "function recordComplianceHash(bytes32 hash)",
  "function complianceHashes(address) view returns (bytes32)",
  "event ComplianceRecorded(address indexed investor, bytes32 hash, uint256 timestamp)",
  "function platformFeeWallet() view returns (address)",
  "function pauseVault()",
  "function unpauseVault()",
  "function paused() view returns (bool)",
  "function emergencySweep(address token, address to, uint256 amount)",
  "function recordAuditReport(bytes32 reportHash, string calldata auditorName)",
  "function getAuditCount() view returns (uint256)",
  "function auditRecords(uint256) view returns (bytes32 reportHash, string auditorName, uint256 recordedAt)",
  "event AuditReported(bytes32 indexed reportHash, string auditorName, uint256 timestamp)",
  "function getFeeInfo() view returns (address,uint256,uint256,uint256)",
  // "event PlatformFeeCollected(address indexed feeWallet, uint256 feeAmount, address indexed vault)",
  "event PlatformFeeCollected(address indexed feeWallet, uint256 feeAmount, uint256 feePercent, address indexed vault)",
];


class VaultService {
  constructor() {
    this.rpcUrl = process.env.RPC_URL;
    this.adminKey = process.env.PRIVATE_KEY;
    this.usdcAddress = process.env.USDC_ADDRESS;
    this.deployedVaults = [];
    this.gasLimit = parseInt(process.env.GAS_LIMIT || "500000");
  }

  // ═══════════════════════════════════════════════════════════
  // FRESH instances for EVERY transaction — kills nonce caching
  // ═══════════════════════════════════════════════════════════

  _newProvider() {
    return new ethers.JsonRpcProvider(this.rpcUrl);
  }
  _newAdmin() {
    return new ethers.Wallet(this.adminKey, this._newProvider());
  }
  _newSigner(address) {
    // Production: investors sign via MetaMask — this service does not hold wallet keys
    throw new Error(`Wallet signing not supported server-side for ${address}. Use MetaMask on the frontend.`);
  }
  _newUsdc(signer) {
    return new ethers.Contract(
      this.usdcAddress,
      USDC_ABI,
      signer || this._newAdmin(),
    );
  }
  _newVault(addr, signer) {
    return new ethers.Contract(addr, VAULT_ABI, signer || this._newAdmin());
  }

  // Read-only (no nonce issues)
  _roVault(addr) {
    return new ethers.Contract(addr, VAULT_ABI, this._newProvider());
  }
  _roUsdc() {
    return new ethers.Contract(this.usdcAddress, USDC_ABI, this._newProvider());
  }

  // ═══════════════════ DEPLOY VAULT ═══════════════════

  // async deployVault({
  //   minGoalUsdc,
  //   maxCapUsdc,
  //   maxPerInvestor,
  //   durationSeconds,
  //   refundWindowSeconds,
  //   issuerWallet,
  //   platformFeePercent,
  //   platformFeeWallet
  // }) {
  //     logger.info("Deploying BuzfundrVault", {
  //     minGoalUsdc,
  //     maxCapUsdc,
  //     issuerWallet,
  //     platformFeePercent,
  //     platformFeeWallet,
  //   });

  //   const artifactPath = path.join(
  //     __dirname,
  //     "../../artifacts/contracts/BuzfundrVault.sol/BuzfundrVault.json",
  //   );
  //   if (!fs.existsSync(artifactPath))
  //     throw new Error("BuzfundrVault not compiled. Run: npx hardhat compile");
  //   const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  //   const admin = this._newAdmin();
  //   const factory = new ethers.ContractFactory(
  //     artifact.abi,
  //     artifact.bytecode,
  //     admin,
  //   );

  //   const platformFeeWallet =
  //     process.env.PLATFORM_FEE_WALLET || this._newAdmin().address; //

  //   const vault = await factory.deploy(
  //     this.usdcAddress,
  //     issuerWallet,
  //     platformFeeWallet,
  //     ethers.parseUnits(minGoalUsdc.toString(), 6),
  //     ethers.parseUnits(maxCapUsdc.toString(), 6),
  //     ethers.parseUnits((maxPerInvestor || 2500).toString(), 6),
  //     durationSeconds || 7776000,
  //     refundWindowSeconds || 172800,
  //     { gasLimit: this.gasLimit * 6 },
  //   );
  //   await vault.waitForDeployment();
  //   const vaultAddr = await vault.getAddress();

  //   this.deployedVaults.push({
  //     address: vaultAddr,
  //     issuerWallet,
  //     minGoalUsdc,
  //     maxCapUsdc,
  //     deployedAt: new Date().toISOString(),
  //   });
  //   logger.info("Vault deployed", { address: vaultAddr });

  //   return {
  //     success: true,
  //     vault_address: vaultAddr,
  //     issuer_wallet: issuerWallet,
  //     min_goal_usdc: minGoalUsdc,
  //     max_cap_usdc: maxCapUsdc,
  //     max_per_investor: maxPerInvestor || 2500,
  //     duration_seconds: durationSeconds || 7776000,
  //     platform_fee_wallet: platformFeeWallet,
  //     platform_fee_percent: 7,
  //   };
  // }

  async deployVault({
    minGoalUsdc,
    maxCapUsdc,
    maxPerInvestor,
    durationSeconds,
    refundWindowSeconds,
    issuerWallet,
    platformFeePercent,
    platformFeeWallet,
  }) {
    logger.info("Deploying BuzfundrVault", {
      minGoalUsdc,
      maxCapUsdc,
      issuerWallet,
      platformFeePercent,
      platformFeeWallet,
    });

    const artifactPath = path.join(
      __dirname,
      "../../artifacts/contracts/BuzfundrVault.sol/BuzfundrVault.json",
    );
    if (!fs.existsSync(artifactPath))
      throw new Error("BuzfundrVault not compiled. Run: npx hardhat compile");
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

    // Use parameter from Laravel DB, fallback to .env, fallback to admin wallet
    const feeWallet =
      platformFeeWallet ||
      process.env.PLATFORM_FEE_WALLET ||
      this._newAdmin().address;
    const feePercent =
      platformFeePercent ?? parseInt(process.env.PLATFORM_FEE_PERCENT || "7");

    if (feePercent < 0 || feePercent > 30) {
      throw new Error("Fee percent must be between 0 and 30");
    }

    const admin = this._newAdmin();
    const factory = new ethers.ContractFactory(
      artifact.abi,
      artifact.bytecode,
      admin,
    );

    // 9 constructor args (was 8 — added feePercent as 4th arg)
    const vault = await factory.deploy(
      this.usdcAddress, // 1. _usdc
      issuerWallet, // 2. _issuer
      feeWallet, // 3. _platformFeeWallet
      feePercent, // 4. _platformFeePercent ← NEW!
      ethers.parseUnits(minGoalUsdc.toString(), 6), // 5. _minGoal
      ethers.parseUnits(maxCapUsdc.toString(), 6), // 6. _maxCap
      ethers.parseUnits((maxPerInvestor || 2500).toString(), 6), // 7. _maxPerInvestor
      durationSeconds || 7776000, // 8. _durationSeconds
      refundWindowSeconds || 172800, // 9. _refundWindowSeconds
      { gasLimit: this.gasLimit * 6 },
    );
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();

    this.deployedVaults.push({
      address: vaultAddr,
      issuerWallet,
      minGoalUsdc,
      maxCapUsdc,
      feePercent,
      feeWallet,
      deployedAt: new Date().toISOString(),
    });
    logger.info("Vault deployed", {
      address: vaultAddr,
      feePercent,
      feeWallet,
    });

    return {
      success: true,
      vault_address: vaultAddr,
      issuer_wallet: issuerWallet,
      min_goal_usdc: minGoalUsdc,
      max_cap_usdc: maxCapUsdc,
      max_per_investor: maxPerInvestor || 2500,
      duration_seconds: durationSeconds || 7776000,
      platform_fee_wallet: feeWallet,
      platform_fee_percent: feePercent, // Dynamic! Not hardcoded 7
    };
  }

  // ═══════════════════ INVEST ═══════════════════

  async invest(vaultAddress, investorWallet, amountUsdc) {
    const amount = ethers.parseUnits(amountUsdc.toString(), 6);

    // Check balance (read-only)
    const bal = await this._roUsdc().balanceOf(investorWallet);
    if (bal < amount)
      throw new Error(
        `Insufficient USDC: has ${ethers.formatUnits(
          bal,
          6,
        )}, needs ${amountUsdc}`,
      );

    // Step 1: Approve — fresh signer
    const signer1 = this._newSigner(investorWallet);
    if (!signer1)
      throw new Error(
        `No private key for ${investorWallet}. In production, investor uses MetaMask.`,
      );
    const usdc1 = new ethers.Contract(this.usdcAddress, USDC_ABI, signer1);
    logger.info("Approving USDC...");
    const tx1 = await usdc1.approve(vaultAddress, amount, {
      gasLimit: this.gasLimit,
    });
    await tx1.wait();
    logger.info("Approved");

    // Step 2: Deposit — BRAND NEW fresh signer (signer1 nonce is now stale)
    const signer2 = this._newSigner(investorWallet);
    const vault2 = new ethers.Contract(vaultAddress, VAULT_ABI, signer2);
    logger.info("Depositing...");
    const tx2 = await vault2.deposit(amount, { gasLimit: this.gasLimit });
    const receipt = await tx2.wait();
    logger.info("Deposit confirmed", { txHash: receipt.hash });

    const info = await this._roVault(vaultAddress).getInvestorInfo(
      investorWallet,
    );
    return {
      success: true,
      tx_hash: receipt.hash,
      block_number: receipt.blockNumber,
      investor: investorWallet,
      amount_usdc: amountUsdc,
      refund_deadline: new Date(Number(info[1]) * 1000).toISOString(),
      message: `Locked ${amountUsdc} USDC in vault.`,
    };
  }

  // ═══════════════════ REFUND ═══════════════════

  async refund(vaultAddress, investorWallet) {
    const deposit = await this._roVault(vaultAddress).investorDeposits(
      investorWallet,
    );
    if (deposit === 0n) throw new Error("No deposit found");

    const signer = this._newSigner(investorWallet);
    if (!signer) throw new Error(`No private key for ${investorWallet}.`);
    const vault = new ethers.Contract(vaultAddress, VAULT_ABI, signer);
    const tx = await vault.refund({ gasLimit: this.gasLimit });
    const receipt = await tx.wait();

    return {
      success: true,
      tx_hash: receipt.hash,
      investor: investorWallet,
      amount_refunded_usdc: ethers.formatUnits(deposit, 6),
    };
  }

  // ═══════════════════ RELEASE ═══════════════════

  async releaseFunds(vaultAddress, issuerWallet) {
    const total = await this._roVault(vaultAddress).totalDeposited();

    const signer = this._newSigner(issuerWallet);
    if (!signer) throw new Error(`No private key for ${issuerWallet}.`);
    const vault = new ethers.Contract(vaultAddress, VAULT_ABI, signer);
    const tx = await vault.releaseFunds({ gasLimit: this.gasLimit });
    const receipt = await tx.wait();

    return {
      success: true,
      tx_hash: receipt.hash,
      issuer: issuerWallet,
      amount_released_usdc: ethers.formatUnits(total, 6),
    };
  }

  // ═══════════════════ FAIL ═══════════════════

  async failOffering(vaultAddress) {
    const total = await this._roVault(vaultAddress).totalDeposited();
    const count = await this._roVault(vaultAddress).getInvestorCount();

    const vault = this._newVault(vaultAddress); // fresh admin
    const tx = await vault.failOffering({ gasLimit: this.gasLimit * 3 });
    const receipt = await tx.wait();

    return {
      success: true,
      tx_hash: receipt.hash,
      total_refunded_usdc: ethers.formatUnits(total, 6),
      investors_refunded: Number(count),
    };
  }

  // ═══════════════════ EMERGENCY REFUND ═══════════════════

  async emergencyRefund(vaultAddress, investorWallet) {
    const deposit = await this._roVault(vaultAddress).investorDeposits(
      investorWallet,
    );
    if (deposit === 0n) throw new Error("No deposit found for this investor");

    const vault = this._newVault(vaultAddress); // fresh admin
    const tx = await vault.emergencyRefund(investorWallet, {
      gasLimit: this.gasLimit,
    });
    const receipt = await tx.wait();

    return {
      success: true,
      tx_hash: receipt.hash,
      investor: investorWallet,
      amount_refunded_usdc: ethers.formatUnits(deposit, 6),
    };
  }

  // ═══════════════════ AMENDMENT WINDOW ═══════════════════

  async triggerAmendmentWindow(vaultAddress) {
    const vault = this._newVault(vaultAddress); // fresh admin
    const tx = await vault.triggerAmendmentWindow({
      gasLimit: this.gasLimit * 2,
    });
    const receipt = await tx.wait();
    return {
      success: true,
      tx_hash: receipt.hash,
      message: "All investor refund windows reset to 48 hours from now.",
    };
  }

  // ═══════════════════ READ: Vault Status ═══════════════════

  async getVaultStatus(vaultAddress) {
    const vault = this._roVault(vaultAddress);
    const [
      active,
      released,
      failed,
      total,
      minG,
      maxC,
      maxPI,
      deadline,
      failDL,
      invCount,
      remaining,
      dlPassed,
      goalReached,
      iss,
    ] = await vault.getVaultInfo();

    let status = "active",
      summary = "";
    if (released) {
      status = "released";
      summary = "FUNDED - Funds released to issuer.";
    } else if (failed) {
      status = "failed";
      summary = "FAILED - All investors refunded.";
    } else if (dlPassed && goalReached) {
      status = "ready_to_release";
      summary =
        "Deadline passed, goal reached. Issuer can call releaseFunds().";
    } else if (dlPassed && !goalReached) {
      status = "ready_to_fail";
      summary =
        "Deadline passed, goal NOT reached. Admin must call failOffering().";
    } else {
      summary = `Active. ${ethers.formatUnits(total, 6)} / ${ethers.formatUnits(
        minG,
        6,
      )} USDC raised.`;
    }

    return {
      success: true,
      vault_address: vaultAddress,
      status,
      summary,
      issuer: iss,
      is_active: active,
      is_released: released,
      is_failed: failed,
      total_deposited_usdc: ethers.formatUnits(total, 6),
      min_goal_usdc: ethers.formatUnits(minG, 6),
      max_cap_usdc: ethers.formatUnits(maxC, 6),
      max_per_investor_usdc: ethers.formatUnits(maxPI, 6),
      remaining_capacity_usdc: ethers.formatUnits(remaining, 6),
      deadline: new Date(Number(deadline) * 1000).toISOString(),
      fail_deadline: new Date(Number(failDL) * 1000).toISOString(),
      deadline_passed: dlPassed,
      goal_reached: goalReached,
      investor_count: Number(invCount),
    };
  }

  // ═══════════════════ READ: Investor Info ═══════════════════

  async getInvestorInfo(vaultAddress, investorWallet) {
    const vault = this._roVault(vaultAddress);
    const [dep, dl, eligible, remainCap] = await vault.getInvestorInfo(
      investorWallet,
    );
    return {
      success: true,
      investor: investorWallet,
      deposit_usdc: ethers.formatUnits(dep, 6),
      refund_deadline:
        Number(dl) > 0 ? new Date(Number(dl) * 1000).toISOString() : null,
      refund_eligible: eligible,
      remaining_investor_cap_usdc: ethers.formatUnits(remainCap, 6),
    };
  }

  // ═══════════════════ READ: Event History ═══════════════════

  async getHistory(vaultAddress) {
    const vault = this._roVault(vaultAddress);
    const events = [];
    const filters = [
      [vault.filters.Deposited(), "deposit"],
      [vault.filters.Refunded(), "refund"],
      [vault.filters.FundsReleased(), "release"],
      [vault.filters.OfferingFailed(), "fail"],
      [vault.filters.EmergencyRefund(), "emergency_refund"],
      [vault.filters.AmendmentWindowTriggered(), "amendment"],
      [vault.filters.PlatformFeeCollected(), "platform_fee"],
    ];
    for (const [filter, type] of filters) {
      for (const e of await vault.queryFilter(filter, 0)) {
        const entry = {
          type,
          tx_hash: e.transactionHash,
          block_number: e.blockNumber,
        };
        if (type === "deposit") {
          entry.investor = e.args[0];
          entry.amount_usdc = ethers.formatUnits(e.args[1], 6);
        } else if (type === "refund" || type === "emergency_refund") {
          entry.investor = e.args[0];
          entry.amount_usdc = ethers.formatUnits(e.args[1], 6);
          entry.reason = e.args[2];
        }
        // else if (type === "release") {
        //   entry.issuer = e.args[0];
        //   entry.amount_usdc = ethers.formatUnits(e.args[1], 6);
        // }
        // else if (type === "release") {
        //   entry.issuer = e.args[0];
        //   entry.issuer_amount_usdc = ethers.formatUnits(e.args[1], 6);
        //   entry.platform_fee_usdc = ethers.formatUnits(e.args[2], 6);
        // }
        else if (type === "release") {
          entry.issuer = e.args[0];
          entry.issuer_amount_usdc = ethers.formatUnits(e.args[1], 6);
          entry.platform_fee_usdc = ethers.formatUnits(e.args[2], 6);
          entry.fee_percent = Number(e.args[3]);
        } else if (type === "fail") {
          entry.total_refunded_usdc = ethers.formatUnits(e.args[0], 6);
          entry.investor_count = Number(e.args[1]);
        }
        // else if (type === "platform_fee") {
        //   entry.fee_wallet = e.args[0];
        //   entry.fee_amount_usdc = ethers.formatUnits(e.args[1], 6);
        // }
        else if (type === "platform_fee") {
          entry.fee_wallet = e.args[0];
          entry.fee_amount_usdc = ethers.formatUnits(e.args[1], 6);
          entry.fee_percent = Number(e.args[2]);
        }
        events.push(entry);
      }
    }
    events.sort((a, b) => a.block_number - b.block_number);
    return {
      success: true,
      vault: vaultAddress,
      total_events: events.length,
      history: events,
    };
  }

  // ═══════════════════ WALLET / TIME / RECHARGE ═══════════════════

  async getWalletBalance(address) {
    const provider = this._newProvider();
    const eth = await provider.getBalance(address);
    const usdcBal = await this._roUsdc().balanceOf(address);
    return {
      success: true,
      wallet: address,
      eth: ethers.formatEther(eth),
      usdc: ethers.formatUnits(usdcBal, 6),
    };
  }

  async rechargeWallet(toAddress, amountUsdc) {
    const amount = ethers.parseUnits(amountUsdc.toString(), 6);
    const usdc = this._newUsdc(); // fresh admin
    const tx = await usdc.transfer(toAddress, amount, {
      gasLimit: this.gasLimit,
    });
    await tx.wait();
    const newBal = await this._roUsdc().balanceOf(toAddress);
    return {
      success: true,
      to: toAddress,
      amount_usdc: amountUsdc,
      new_balance_usdc: ethers.formatUnits(newBal, 6),
      tx_hash: tx.hash,
    };
  }

  async advanceTime(seconds) {
    const provider = this._newProvider();
    await provider.send("evm_increaseTime", [seconds]);
    await provider.send("evm_mine", []);
    const block = await provider.getBlock("latest");
    return {
      success: true,
      seconds_advanced: seconds,
      new_block_time: new Date(block.timestamp * 1000).toISOString(),
      block_number: block.number,
    };
  }

  async getBlockchainTime() {
    const block = await this._newProvider().getBlock("latest");
    return {
      success: true,
      block_time: new Date(block.timestamp * 1000).toISOString(),
      block_number: block.number,
      real_time: new Date().toISOString(),
    };
  }

  async getContractABI() {
    return {
      vault_abi: VAULT_ABI.filter((a) => !a.startsWith("event")),
      usdc_abi: USDC_ABI,
      usdc_address: this.usdcAddress,
    };
  }

  async getFeeInfo(vaultAddress) {
    const vault = this._roVault(vaultAddress);
    const [feeWallet, feePercent, estimatedFee, estimatedIssuerAmount] =
      await vault.getFeeInfo();
    const feeWalletBalance = await this._roUsdc().balanceOf(feeWallet);

    return {
      success: true,
      vault_address: vaultAddress,
      fee_wallet: feeWallet,
      fee_percent: Number(feePercent),
      estimated_fee_usdc: ethers.formatUnits(estimatedFee, 6),
      estimated_issuer_amount_usdc: ethers.formatUnits(
        estimatedIssuerAmount,
        6,
      ),
      fee_wallet_total_balance_usdc: ethers.formatUnits(feeWalletBalance, 6),
    };
  }
}

module.exports = new VaultService();
