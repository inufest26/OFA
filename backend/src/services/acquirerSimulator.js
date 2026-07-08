/**
 * Acquirer Simulator — async sqlite3 edition
 */

const { getDb } = require('../database/init');
const logger = require('../utils/logger');

const SPECIAL_CARDS = {
  ALWAYS_SUCCESS:  '4111',
  RISKY:           '5222',
  INSUFFICIENT:    '9792',
  TIMEOUT:         '4000',
  ANOMALY_TRIGGER: '5333',
};

const acquirerState = {
  acquirer_garanti: {
    id: 'acquirer_garanti', name: 'Garanti Sanal POS',
    isActive: true, routingWeight: 1.0,
    baseSuccessRate: 0.94, currentSuccessRate: 0.94, avgResponseTime: 230,
    anomalyMode: false, totalTransactions: 0, successfulTransactions: 0,
    failedTransactions: 0, consecutiveFailures: 0, isolatedAt: null, isolationReason: null,
  },
  acquirer_yapikredi: {
    id: 'acquirer_yapikredi', name: 'Yapı Kredi Sanal POS',
    isActive: true, routingWeight: 1.0,
    baseSuccessRate: 0.91, currentSuccessRate: 0.91, avgResponseTime: 310,
    anomalyMode: false, totalTransactions: 0, successfulTransactions: 0,
    failedTransactions: 0, consecutiveFailures: 0, isolatedAt: null, isolationReason: null,
  },
  acquirer_isbank: {
    id: 'acquirer_isbank', name: 'İş Bankası Sanal POS',
    isActive: true, routingWeight: 1.0,
    baseSuccessRate: 0.88, currentSuccessRate: 0.88, avgResponseTime: 280,
    anomalyMode: false, totalTransactions: 0, successfulTransactions: 0,
    failedTransactions: 0, consecutiveFailures: 0, isolatedAt: null, isolationReason: null,
  },
};

// ── Organic Instability (Metrics Drift) ───────────────────────────────────────
// Simulates real-world network fluctuations. Base success rates and response times
// drift randomly over time. Sometimes an acquirer completely degrades.
setInterval(() => {
  for (const key of Object.keys(acquirerState)) {
    const acq = acquirerState[key];
    
    // 1% chance for a severe outage/degradation per tick (30s)
    if (Math.random() < 0.01) {
      acq.baseSuccessRate = Math.max(0.1, acq.baseSuccessRate - 0.4); // Sudden drop
      acq.avgResponseTime = Math.min(2000, acq.avgResponseTime + 500); // Sudden lag
      logger.warn(`Sudden network degradation detected for ${acq.name}!`);
    } else {
      // Normal drift
      const driftRate = (Math.random() * 0.1) - 0.05; // -5% to +5%
      acq.baseSuccessRate = Math.min(0.99, Math.max(0.20, acq.baseSuccessRate + driftRate));
      
      const driftTime = (Math.random() * 60) - 30; // -30ms to +30ms
      acq.avgResponseTime = Math.min(1000, Math.max(100, acq.avgResponseTime + driftTime));
    }
    
    // Naturally decay currentSuccessRate towards baseSuccessRate so UI moves without traffic
    acq.currentSuccessRate = acq.currentSuccessRate * 0.8 + acq.baseSuccessRate * 0.2;
    
    persistState(acq).catch(() => {});
  }
}, 30000); // Every 30 seconds

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function jitterTime(base) { return Math.round(base * (0.8 + Math.random() * 0.4)); }

function detectSpecialCard(cardNumber) {
  const prefix = cardNumber.replace(/\s/g, '').slice(0, 4);
  for (const [behaviour, p] of Object.entries(SPECIAL_CARDS)) {
    if (prefix === p) return behaviour;
  }
  return null;
}

async function persistState(acq) {
  try {
    const db = getDb();
    await db.run(
      `UPDATE acquirer_status SET
        is_active=?, routing_weight=?, current_success_rate=?, avg_response_time=?,
        anomaly_mode=?, total_transactions=?, successful_transactions=?,
        failed_transactions=?, isolated_at=?, isolation_reason=?, updated_at=CURRENT_TIMESTAMP
       WHERE acquirer_id=?`,
      acq.isActive ? 1 : 0, acq.routingWeight, acq.currentSuccessRate, acq.avgResponseTime,
      acq.anomalyMode ? 1 : 0, acq.totalTransactions, acq.successfulTransactions,
      acq.failedTransactions, acq.isolatedAt || null, acq.isolationReason || null, acq.id
    );
  } catch (e) {
    logger.error('Failed to persist acquirer state', { error: e.message });
  }
}

async function processPayment(acquirerId, transaction) {
  const acq = acquirerState[acquirerId];
  if (!acq) throw new Error(`Unknown acquirer: ${acquirerId}`);

  if (!acq.isActive) return { success: false, errorKey: 'TEMPORARY_UNAVAILABLE', responseTimeMs: 10 };

  const responseTime = jitterTime(acq.avgResponseTime);
  await sleep(responseTime);
  acq.totalTransactions += 1;

  const special = detectSpecialCard(transaction.cardNumber || '');
  let success = false, errorKey = null;

  if (special === 'ALWAYS_SUCCESS') {
    success = true;
  } else if (special === 'INSUFFICIENT') {
    success = false; errorKey = 'INSUFFICIENT_FUNDS';
  } else if (special === 'TIMEOUT') {
    success = false; errorKey = 'ACQUIRER_TIMEOUT';
  } else if (special === 'ANOMALY_TRIGGER') {
    if (!acq.anomalyMode) await activateAnomalyMode(acquirerId, 'Anomaly triggered by test card');
    success = Math.random() < 0.15;
    if (!success) errorKey = 'ACQUIRER_ERROR';
  } else if (special === 'RISKY') {
    success = Math.random() < 0.70;
    if (!success) errorKey = 'ACQUIRER_ERROR';
  } else {
    const effectiveRate = acq.anomalyMode ? Math.min(acq.baseSuccessRate, 0.15) : acq.baseSuccessRate;
    success = Math.random() < effectiveRate;
    if (!success) {
      const opts = ['ACQUIRER_ERROR', 'ACQUIRER_TIMEOUT', 'TEMPORARY_UNAVAILABLE'];
      errorKey = opts[Math.floor(Math.random() * opts.length)];
    }
  }

  if (success) { acq.successfulTransactions += 1; acq.consecutiveFailures = 0; }
  else         { acq.failedTransactions += 1;     acq.consecutiveFailures += 1; }

  // Use Exponential Moving Average (EMA) for current success rate so it drifts quickly
  if (acq.totalTransactions === 1) {
    acq.currentSuccessRate = success ? 1 : 0;
  } else {
    acq.currentSuccessRate = acq.currentSuccessRate * 0.95 + (success ? 1 : 0) * 0.05;
  }
  
  await persistState(acq);

  return { success, errorKey, responseTimeMs: responseTime };
}

async function activateAnomalyMode(acquirerId, reason = 'Anomaly detected') {
  const acq = acquirerState[acquirerId];
  if (!acq || acq.anomalyMode) return;
  acq.anomalyMode = true;
  logger.warn(`Anomaly mode activated for ${acquirerId}`, { reason });
  await persistState(acq);
}

async function deactivateAnomalyMode(acquirerId) {
  const acq = acquirerState[acquirerId];
  if (!acq) return;
  acq.anomalyMode = false;
  await persistState(acq);
}

async function isolateAcquirer(acquirerId, reason, durationMinutes) {
  const acq = acquirerState[acquirerId];
  if (!acq) return false;
  acq.isActive = false;
  acq.isolatedAt = new Date().toISOString();
  acq.isolationReason = reason;
  logger.warn(`Acquirer ${acquirerId} isolated`, { reason, durationMinutes });
  await persistState(acq);
  if (durationMinutes > 0) {
    setTimeout(() => restoreAcquirer(acquirerId), durationMinutes * 60 * 1000);
  }
  return true;
}

async function restoreAcquirer(acquirerId) {
  const acq = acquirerState[acquirerId];
  if (!acq) return false;
  acq.isActive = true; acq.anomalyMode = false;
  acq.isolatedAt = null; acq.isolationReason = null; acq.consecutiveFailures = 0;
  logger.info(`Acquirer ${acquirerId} restored`);
  await persistState(acq);
  return true;
}

async function updateRoutingWeight(acquirerId, weight) {
  const acq = acquirerState[acquirerId];
  if (!acq) return false;
  acq.routingWeight = Math.max(0, Math.min(2, weight));
  await persistState(acq);
  return true;
}

function getAllAcquirers() { return Object.values(acquirerState).map((a) => ({ ...a })); }
function getAcquirer(id)   { return acquirerState[id] ? { ...acquirerState[id] } : null; }
function getActiveAcquirers() { return Object.values(acquirerState).filter((a) => a.isActive); }
function getRankedAcquirers() {
  return getActiveAcquirers()
    .map((a) => ({ ...a, effectiveScore: a.routingWeight * a.currentSuccessRate }))
    .sort((a, b) => b.effectiveScore - a.effectiveScore);
}

module.exports = {
  processPayment, activateAnomalyMode, deactivateAnomalyMode,
  isolateAcquirer, restoreAcquirer, updateRoutingWeight,
  getAllAcquirers, getAcquirer, getActiveAcquirers, getRankedAcquirers, SPECIAL_CARDS,
};
