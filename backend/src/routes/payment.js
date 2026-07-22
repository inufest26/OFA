/**
 * POST /api/payment — async sqlite3 edition
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const mlRouter = require('../services/mlRouter');
const { executeWithRetry } = require('../services/retryEngine');
const { getError } = require('../utils/errorCodes');
const { getDb } = require('../database/init');
const logger = require('../utils/logger');

const router = express.Router();
let _io = null;
function setSocketIo(io) { _io = io; }

router.post('/', async (req, res, next) => {
  try {
    const { cardNumber, cardType, amount, currency = 'TRY', source = 'real' } = req.body;
    if (!cardNumber || !cardType || !amount) {
      return res.status(400).json({ error: 'cardNumber, cardType, and amount are required' });
    }

    const transactionId = uuidv4();
    const cardBin = (cardNumber || '').replace(/\s/g, '').slice(0, 6);
    const startTime = Date.now();

    // ── ML routing
    const routingResult = await mlRouter.predict({ cardNumber, cardType, amount, currency });
    if (!routingResult.selectedAcquirer) {
      const db = getDb();
      await db.run(
        `INSERT INTO error_logs (transaction_id,acquirer_id,error_code,error_message,retry_attempted)
         VALUES (?,?,?,?,?)`,
        transactionId, 'system', 'E000', 'No active acquirers available', 0
      );
      return res.status(503).json({ error: 'No active acquirers available' });
    }

    // ── Execute with retry
    const paymentResult = await executeWithRetry(
      { cardNumber, cardType, amount, currency },
      routingResult.selectedAcquirer,
      routingResult.scores
    );

    const totalTime = Date.now() - startTime;
    const status = paymentResult.success ? 'success'
      : (paymentResult.retryCount > 0 ? 'retried' : 'failed');
    const errorDef = paymentResult.errorKey ? getError(paymentResult.errorKey) : null;

    // ── Persist
    const db = getDb();
    await db.run(
      `INSERT INTO transactions
         (id,card_bin,card_type,amount,currency,acquirer_id,status,error_code,
          response_time_ms,retry_count,retry_history,ml_scores,source)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      transactionId, cardBin, cardType, amount, currency,
      paymentResult.acquirerId, status, errorDef?.code || null,
      totalTime, paymentResult.retryCount,
      JSON.stringify(paymentResult.retryHistory),
      JSON.stringify(routingResult.scores),
      source
    );

    for (const attempt of paymentResult.retryHistory) {
      if (!attempt.success) {
        const err = getError(attempt.errorKey);
        await db.run(
          `INSERT INTO error_logs (transaction_id,acquirer_id,error_code,error_message,retry_attempted)
           VALUES (?,?,?,?,?)`,
          transactionId, attempt.acquirerId, err.code, err.description, attempt.attempt > 1 ? 1 : 0
        );
      }
    }

    // ── Calculate commission savings (honest baseline)
    // Savings = amount × (avgCommission - selectedCommission)
    // Using the average of all active acquirers as baseline.
    // If ML consistently picks cheaper acquirers, savings are positive.
    // If ML picks at random, savings hover near 0. This is the honest metric.
    let currentSavings = 0;
    if (paymentResult.success) {
      const { getAllAcquirers } = require('../services/acquirerSimulator');
      const activeAcquirers = getAllAcquirers().filter(a => a.isActive);

      if (activeAcquirers.length > 0) {
        const avgCommission = activeAcquirers.reduce((s, a) => s + (a.commissionRate || 0.019), 0) / activeAcquirers.length;
        const selectedAcq = activeAcquirers.find(a => a.id === paymentResult.acquirerId);
        const selectedCommission = selectedAcq ? (selectedAcq.commissionRate || 0.019) : avgCommission;
        const savingAmount = amount * (avgCommission - selectedCommission);

        if (savingAmount > 0) {
          await db.run(`UPDATE system_metrics SET total_savings = total_savings + ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`, savingAmount);
        }
        const row = await db.get(`SELECT total_savings FROM system_metrics WHERE id = 1`);
        if (row) {
          currentSavings = row.total_savings;
          if (_io) _io.emit('metrics:savings_update', { totalSavings: currentSavings, latestSaving: Math.max(0, savingAmount) });
        }
      }
    }

    // ── WebSocket
    const payload = { id: transactionId, cardBin, cardType, amount, currency,
      acquirerId: paymentResult.acquirerId, status, errorCode: errorDef?.code || null,
      responseTimeMs: totalTime, retryCount: paymentResult.retryCount,
      mlScores: routingResult.scores, createdAt: new Date().toISOString() };
    if (_io) _io.emit('transaction:new', payload);

    logger.info('Payment processed', { transactionId, status, acquirerId: paymentResult.acquirerId });

    res.json({
      transactionId, success: paymentResult.success, status,
      acquirerId: paymentResult.acquirerId,
      acquirerName: _acquirerName(paymentResult.acquirerId),
      responseTimeMs: totalTime, retryCount: paymentResult.retryCount,
      retryHistory: paymentResult.retryHistory, mlScores: routingResult.scores,
      mlMethod: routingResult.method, costSavingPct: routingResult.costSavingPct,
      error: errorDef ? { code: errorDef.code, message: errorDef.userMessage } : null,
    });
  } catch (err) { next(err); }
});

const NAMES = { acquirer_garanti: 'Garanti Sanal POS', acquirer_yapikredi: 'Yapı Kredi Sanal POS', acquirer_isbank: 'İş Bankası Sanal POS' };
function _acquirerName(id) { return NAMES[id] || id; }

module.exports = { router, setSocketIo };
