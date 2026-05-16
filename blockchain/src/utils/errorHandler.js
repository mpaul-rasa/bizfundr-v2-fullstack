const logger = require('./logger');

// Map Solidity custom errors + revert strings to human-readable messages
const ERROR_MAP = {
  'VaultClosed':           { code: 'VAULT_CLOSED', message: 'This vault is permanently closed (already released or failed).', hint: 'Deploy a new vault for a new offering.' },
  'DeadlinePassed':        { code: 'DEADLINE_PASSED', message: 'The offering deadline has passed. No more investments accepted.', hint: 'Call releaseFunds (if goal met) or failOffering (if not).' },
  'DeadlineNotReached':    { code: 'DEADLINE_NOT_REACHED', message: 'The offering deadline has NOT passed yet.', hint: 'For testing, use POST /time/advance to skip forward.' },
  'GoalNotReached':        { code: 'GOAL_NOT_REACHED', message: 'Minimum funding goal has not been reached.', hint: 'Use failOffering to refund all investors.' },
  'GoalAlreadyReached':    { code: 'GOAL_ALREADY_REACHED', message: 'Funding goal WAS reached. Cannot fail this offering.', hint: 'The issuer should call releaseFunds.' },
  'RefundWindowExpired':   { code: 'REFUND_WINDOW_EXPIRED', message: 'The 48-hour refund window has expired.', hint: 'Funds locked until offering is released or failed.' },
  'NoDepositFound':        { code: 'NO_DEPOSIT', message: 'This investor has no deposit in this vault.', hint: 'Check investor info first.' },
  'ExceedsMaxCap':         { code: 'EXCEEDS_CAP', message: 'This investment would exceed the maximum raise cap.', hint: 'Check remaining capacity.' },
  'ExceedsInvestorCap':    { code: 'EXCEEDS_INVESTOR_CAP', message: 'This investor would exceed the $2,500 per-investor limit.', hint: 'Maximum $2,500 USDC per investor per offering.' },
  'AmountZero':            { code: 'AMOUNT_ZERO', message: 'Investment amount must be greater than zero.', hint: 'Provide a valid amount.' },
  'TransferFailed':        { code: 'TRANSFER_FAILED', message: 'USDC transfer failed on-chain.', hint: 'Check USDC balance and approval.' },
  'NotIssuer':             { code: 'NOT_ISSUER', message: 'Only the issuer (founder) can call this function.', hint: 'This must be called from the issuer wallet set at deployment.' },
  'FailDeadlinePassed':    { code: 'FAIL_DEADLINE_PASSED', message: 'The 5-business-day fail deadline has passed.', hint: 'Contact admin immediately.' },
  'InsufficientBalance':   { code: 'INSUFFICIENT_BALANCE', message: 'Wallet does not have enough USDC.', hint: 'Check balance and top up.' },
  'Vault is closed':       { code: 'VAULT_CLOSED', message: 'This vault is permanently closed.', hint: 'Deploy a new vault.' },
  'Deadline not reached yet': { code: 'DEADLINE_NOT_REACHED', message: 'Deadline has NOT passed on the blockchain.', hint: 'Use POST /time/advance to skip time in testing.' },
};

function parseBlockchainError(error) {
  let reason = null;

  // Try custom error name first (Solidity custom errors)
  if (error?.errorName) reason = error.errorName;

  // Try reason property
  if (!reason && error?.reason) reason = error.reason;

  // Try revert string in message
  if (!reason && error?.message) {
    const m = error.message.match(/reverted with reason string '([^']+)'/);
    if (m) reason = m[1];
  }

  // Try custom error in nested data
  if (!reason && error?.info?.error?.data?.message) {
    const m = error.info.error.data.message.match(/reverted with reason string '([^']+)'/);
    if (m) reason = m[1];
  }

  // Try error data message
  if (!reason && error?.error?.data?.message) {
    const m = error.error.data.message.match(/reverted with reason string '([^']+)'/);
    if (m) reason = m[1];
  }

  // Try hex decode
  if (!reason && error?.message) {
    const hex = error.message.match(/0x08c379a0([0-9a-fA-F]+)/);
    if (hex) {
      try {
        const { ethers } = require('ethers');
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['string'], '0x' + hex[1]);
        reason = decoded[0];
      } catch (_) {}
    }
  }

  // Non-revert errors
  if (!reason && error?.message) {
    if (error.message.includes('insufficient funds')) reason = 'InsufficientBalance';
    if (error.message.includes('USDC_ADDRESS')) reason = 'USDC contract not configured';
    if (error.message.includes('user rejected')) reason = 'User rejected the transaction in wallet';
    if (error.message.includes('nonce')) reason = 'Transaction nonce conflict — retry';
  }

  // Map to friendly message
  if (reason) {
    for (const [key, friendly] of Object.entries(ERROR_MAP)) {
      if (reason.includes(key)) {
        return { success: false, error_code: friendly.code, message: friendly.message, hint: friendly.hint, solidity_reason: reason };
      }
    }
    return { success: false, error_code: 'CONTRACT_REVERT', message: `Smart contract rejected: "${reason}"`, hint: 'Check vault status and conditions.', solidity_reason: reason };
  }

  const msg = error?.shortMessage || error?.message || 'Unknown error';
  return { success: false, error_code: 'GENERAL_ERROR', message: msg.length > 300 ? msg.substring(0, 300) + '...' : msg, hint: 'Check server logs.', solidity_reason: null };
}

function handleError(res, operation, error, statusCode = 400) {
  const parsed = parseBlockchainError(error);
  logger.error(`${operation}: ${parsed.message}`, { reason: parsed.solidity_reason, stack: error?.stack?.substring(0, 500) });
  return res.status(statusCode).json({ ...parsed, operation });
}

module.exports = { parseBlockchainError, handleError };
