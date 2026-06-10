const vaultService = require("../services/vaultService");
const { handleError } = require("../utils/errorHandler");

const isAddr = (a) => /^0x[a-fA-F0-9]{40}$/.test(a);
const badReq = (res, msg) =>
  res
    .status(400)
    .json({ success: false, error_code: "VALIDATION_ERROR", message: msg });

// ═══════════════ DEPLOY ═══════════════
async function deployVault(req, res) {
  // const {
  //   min_goal_usdc,
  //   max_cap_usdc,
  //   max_per_investor,
  //   duration_seconds,
  //   refund_window_seconds,
  //   issuer_wallet,
  // } = req.body;
  const {
    min_goal_usdc,
    max_cap_usdc,
    max_per_investor,
    duration_seconds,
    refund_window_seconds,
    issuer_wallet,
    platform_fee_percent,
    platform_fee_wallet,
  } = req.body;

  if (!min_goal_usdc || !max_cap_usdc)
    return badReq(res, "Required: min_goal_usdc, max_cap_usdc");
  if (!issuer_wallet || !isAddr(issuer_wallet))
    return badReq(res, "Required: issuer_wallet (valid Ethereum address)");
  try {
    const result = await vaultService.deployVault({
      minGoalUsdc: parseFloat(min_goal_usdc),
      maxCapUsdc: parseFloat(max_cap_usdc),
      maxPerInvestor: parseFloat(max_per_investor || "2500"),
      durationSeconds: parseInt(duration_seconds || "120"),
      refundWindowSeconds: parseInt(refund_window_seconds || "172800"),
      issuerWallet: issuer_wallet,
      platformFeePercent:
        platform_fee_percent != null
          ? parseInt(platform_fee_percent)
          : undefined,
      platformFeeWallet: platform_fee_wallet || undefined,
    });
    return res.status(201).json(result);
  } catch (e) {
    return handleError(res, "Deploy Vault", e);
  }
}

// ═══════════════ INVEST (testing proxy — production uses MetaMask) ═══════════════
async function invest(req, res) {
  const {
    vault_address,
    investor_wallet,
    amount_usdc,
    risk_acknowledgement_completed,
    offering_document_confirmed,
    subscription_agreement_signed,
    subscription_timestamp,
  } = req.body;
  if (!vault_address || !investor_wallet || !amount_usdc)
    return badReq(res, "Required: vault_address, investor_wallet, amount_usdc");
  if (!isAddr(vault_address) || !isAddr(investor_wallet))
    return badReq(res, "Invalid address format");
  if (!risk_acknowledgement_completed)
    return badReq(
      res,
      "Investor must complete Risk Acknowledgement (Form 45-110F2) before investing",
    );
  if (!offering_document_confirmed)
    return badReq(
      res,
      "Investor must confirm reading the Offering Document (Form 45-110F1) before investing",
    );
  if (!subscription_agreement_signed)
    return badReq(
      res,
      "Investor must sign the Subscription Agreement before investing",
    );
  if (!subscription_timestamp)
    return badReq(
      res,
      "Required: subscription_timestamp (when investor signed the subscription agreement)",
    );
  try {
    const result = await vaultService.invest(
      vault_address,
      investor_wallet,
      parseFloat(amount_usdc),
    );
    return res.json({
      ...result,
      forms_verified: {
        risk_acknowledgement: true,
        offering_document: true,
        subscription_agreement: true,
        subscription_timestamp,
      },
    });
  } catch (e) {
    return handleError(res, "Invest", e);
  }
}

// ═══════════════ REFUND (testing proxy) ═══════════════
async function refund(req, res) {
  const { vault_address, investor_wallet } = req.body;
  if (!vault_address || !investor_wallet)
    return badReq(res, "Required: vault_address, investor_wallet");
  try {
    return res.json(await vaultService.refund(vault_address, investor_wallet));
  } catch (e) {
    return handleError(res, "Refund", e);
  }
}

// ═══════════════ RELEASE (testing proxy — production: issuer calls directly) ═══════════════
async function release(req, res) {
  const { vault_address, issuer_wallet } = req.body;
  if (!vault_address || !issuer_wallet)
    return badReq(res, "Required: vault_address, issuer_wallet");
  try {
    return res.json(
      await vaultService.releaseFunds(vault_address, issuer_wallet),
    );
  } catch (e) {
    return handleError(res, "Release Funds", e);
  }
}

// ═══════════════ FAIL (admin only) ═══════════════
async function failOffering(req, res) {
  const { vault_address } = req.body;
  if (!vault_address) return badReq(res, "Required: vault_address");
  try {
    return res.json(await vaultService.failOffering(vault_address));
  } catch (e) {
    return handleError(res, "Fail Offering", e);
  }
}

// ═══════════════ EMERGENCY REFUND (admin only) ═══════════════
async function emergencyRefund(req, res) {
  const { vault_address, investor_wallet, reason } = req.body;
  if (!vault_address || !investor_wallet)
    return badReq(res, "Required: vault_address, investor_wallet");
  if (!reason || reason.length < 10)
    return badReq(res, "Required: reason (min 10 chars explaining emergency)");
  try {
    const result = await vaultService.emergencyRefund(
      vault_address,
      investor_wallet,
    );
    return res.json({ ...result, emergency_reason: reason });
  } catch (e) {
    return handleError(res, "Emergency Refund", e);
  }
}

// ═══════════════ AMEND OFFERING (admin) ═══════════════
async function amendOffering(req, res) {
  const { vault_address } = req.body;
  if (!vault_address) return badReq(res, "Required: vault_address");
  try {
    return res.json(await vaultService.triggerAmendmentWindow(vault_address));
  } catch (e) {
    return handleError(res, "Amend Offering", e);
  }
}

// ═══════════════ READ ═══════════════
async function getVault(req, res) {
  if (!isAddr(req.params.address)) return badReq(res, "Invalid vault address");
  try {
    return res.json(await vaultService.getVaultStatus(req.params.address));
  } catch (e) {
    return handleError(res, "Get Vault", e);
  }
}

async function getInvestor(req, res) {
  try {
    return res.json(
      await vaultService.getInvestorInfo(req.params.vault, req.params.wallet),
    );
  } catch (e) {
    return handleError(res, "Get Investor", e);
  }
}

async function getHistory(req, res) {
  if (!isAddr(req.params.address)) return badReq(res, "Invalid address");
  try {
    return res.json(await vaultService.getHistory(req.params.address));
  } catch (e) {
    return handleError(res, "Get History", e);
  }
}

async function listVaults(req, res) {
  const detailed = [];
  for (const v of vaultService.deployedVaults) {
    try {
      detailed.push({
        ...v,
        ...(await vaultService.getVaultStatus(v.address)),
      });
    } catch {
      detailed.push(v);
    }
  }
  return res.json({ success: true, total: detailed.length, vaults: detailed });
}

async function getWallet(req, res) {
  if (!isAddr(req.params.address)) return badReq(res, "Invalid address");
  try {
    return res.json(await vaultService.getWalletBalance(req.params.address));
  } catch (e) {
    return handleError(res, "Get Wallet", e);
  }
}

async function recharge(req, res) {
  const { wallet_address, amount_usdc } = req.body;
  if (!wallet_address || !amount_usdc)
    return badReq(res, "Required: wallet_address, amount_usdc");
  try {
    return res.json(
      await vaultService.rechargeWallet(
        wallet_address,
        parseFloat(amount_usdc),
      ),
    );
  } catch (e) {
    return handleError(res, "Recharge", e);
  }
}

async function advanceTime(req, res) {
  const { seconds } = req.body;
  if (!seconds || seconds <= 0)
    return badReq(res, "Required: seconds (positive integer)");
  try {
    return res.json(await vaultService.advanceTime(parseInt(seconds)));
  } catch (e) {
    return handleError(res, "Advance Time", e);
  }
}

async function getTime(req, res) {
  try {
    return res.json(await vaultService.getBlockchainTime());
  } catch (e) {
    return handleError(res, "Get Time", e);
  }
}

async function getABI(req, res) {
  try {
    return res.json(await vaultService.getContractABI());
  } catch (e) {
    return handleError(res, "Get ABI", e);
  }
}

async function getFeeInfo(req, res) {
  if (!isAddr(req.params.address)) return badReq(res, "Invalid vault address");
  try {
    return res.json(await vaultService.getFeeInfo(req.params.address));
  } catch (e) {
    return handleError(res, "Get Fee Info", e);
  }
}

module.exports = {
  deployVault,
  invest,
  refund,
  release,
  failOffering,
  emergencyRefund,
  amendOffering,
  getVault,
  getInvestor,
  getHistory,
  listVaults,
  getWallet,
  recharge,
  advanceTime,
  getTime,
  getABI,
  getFeeInfo,
};
