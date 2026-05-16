require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const ctrl = require('./controllers/vaultController');

const app = express();

// ═══════════ SECURITY ═══════════
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60000, max: 100, message: { success: false, error_code: 'RATE_LIMITED', message: 'Too many requests. Wait 1 minute.' } }));

// ═══════════ AUTH ═══════════
app.use((req, res, next) => {
  if (['/health', '/abi'].includes(req.path)) return next();
  const key = req.headers['x-api-key'];
  if (key !== process.env.API_KEY) return res.status(401).json({ success: false, error_code: 'UNAUTHORIZED', message: 'Invalid or missing X-API-Key header.' });
  next();
});

// ═══════════ REQUEST LOGGING ═══════════
app.use((req, res, next) => {
  if (req.path !== '/health') logger.info(`${req.method} ${req.path}`);
  next();
});

// ═══════════ ROUTES ═══════════
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'buzfundr-blockchain-api', time: new Date().toISOString() }));
app.get('/abi', ctrl.getABI);

// Write
app.post('/deploy-vault', ctrl.deployVault);
app.post('/invest', ctrl.invest);
app.post('/refund', ctrl.refund);
app.post('/release', ctrl.release);
app.post('/fail-offering', ctrl.failOffering);
app.post('/emergency-refund', ctrl.emergencyRefund);
app.post('/amend-offering', ctrl.amendOffering);

// Read
app.get('/vaults', ctrl.listVaults);
app.get('/vault/:address', ctrl.getVault);
app.get('/vault/:vault/investor/:wallet', ctrl.getInvestor);
app.get('/vault/:address/history', ctrl.getHistory);
app.get('/wallet/:address', ctrl.getWallet);

// Testing
app.post('/recharge', ctrl.recharge);
app.post('/time/advance', ctrl.advanceTime);
app.get('/time', ctrl.getTime);

// ═══════════ GLOBAL ERROR HANDLER ═══════════
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', { path: req.path, error: err.message, stack: err.stack?.substring(0, 500) });
  res.status(500).json({ success: false, error_code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', hint: 'Check server logs.' });
});

// ═══════════ 404 ═══════════
app.use((req, res) => {
  res.status(404).json({ success: false, error_code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found.`, hint: 'Check API documentation.' });
});

// ═══════════ START ═══════════
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.info(`Buzfundr Blockchain API on port ${PORT}`);
  logger.info(`USDC: ${process.env.USDC_ADDRESS || 'NOT SET'}`);
});
