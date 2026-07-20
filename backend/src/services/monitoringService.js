
const { getDb } = require('../database/init');
const { getAllAcquirers, setPredictiveRisk } = require('./acquirerSimulator');
const logger = require('../utils/logger');

const WINDOW_MINUTES = 5;
const SNAPSHOT_INTERVAL_MS = 5_000;
const ANOMALY_SUCCESS_THRESHOLD = 0.50;
const PREDICTIVE_RISK_THRESHOLD = 0.75;
const ANOMALY_CONSEC_FAILURES = 3;

let _io = null;
let _agentService = null;
const lastInvestigatedAt = new Map(); // acquirerId -> timestamp
const INVESTIGATION_COOLDOWN_MS = 60_000; // 60 seconds between investigations per acquirer
let _monitorTimer = null;

function setSocketIo(io) { _io = io; }
function setAgentService(svc) { _agentService = svc; }

async function collectWindowMetrics(acquirerId, windowMinutes = WINDOW_MINUTES) {
  const db = getDb();
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const rows = await db.all(
    `SELECT status, response_time_ms FROM transactions WHERE acquirer_id=? AND created_at>=?`,
    acquirerId, since
  );
  const total = rows.length;
  const successful = rows.filter((r) => r.status === 'success').length;
  const avgResponseTime = total > 0
    ? rows.reduce((s, r) => s + (r.response_time_ms || 0), 0) / total : 0;
  return { total, successful, failed: total - successful,
    successRate: total > 0 ? successful / total : null, avgResponseTime };
}

async function saveSnapshot(acquirerId, metrics) {
  const db = getDb();
  const now   = new Date().toISOString();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
  await db.run(
    `INSERT INTO metric_snapshots
       (acquirer_id, success_rate, avg_response_time, transaction_count, error_count, period_start, period_end)
     VALUES (?,?,?,?,?,?,?)`,
    acquirerId, metrics.successRate ?? 1, metrics.avgResponseTime,
    metrics.total, metrics.failed, since, now
  );
}

async function getTimeline(acquirerId, limit = 20) {
  const db = getDb();
  const rows = await db.all(
    `SELECT success_rate, avg_response_time, transaction_count, period_end AS time
     FROM metric_snapshots WHERE acquirer_id=? ORDER BY created_at DESC LIMIT ?`,
    acquirerId, limit
  );
  return rows.reverse();
}

function broadcastAcquirerStates() {
  if (!_io) return;
  _io.emit('acquirer:update', getAllAcquirers());
}

async function monitoringTick() {
  const acquirers = getAllAcquirers();
  for (const acq of acquirers) {
    const metrics = await collectWindowMetrics(acq.id);
    await saveSnapshot(acq.id, metrics);
    const anomalies = [];
    const consec = acq.consecutiveFailures;
    let isPredictiveRisk = false;

    if (consec >= ANOMALY_CONSEC_FAILURES) {
      anomalies.push({
        type: 'ardışık_hata',
        detail: `${consec} ardışık hata`,
      });
    }

    if (metrics.total >= 1) {
      if (metrics.successRate !== null) {
        if (metrics.successRate < ANOMALY_SUCCESS_THRESHOLD) {
          anomalies.push({
            type: 'düşük_başarı_oranı',
            detail: `Başarı oranı ${(metrics.successRate * 100).toFixed(1)}% (< ${(ANOMALY_SUCCESS_THRESHOLD * 100)}%)`,
          });
        } else if (metrics.successRate < PREDICTIVE_RISK_THRESHOLD && consec >= 1) {
          isPredictiveRisk = true;
          anomalies.push({
            type: 'tahmini_ariza',
            detail: `Başarı oranında ani düşüş eğilimi (${(metrics.successRate * 100).toFixed(1)}%). Olası arıza tahmini.`,
          });
        }
      }
      if (metrics.avgResponseTime > 0 && acq.avgResponseTime > 0 &&
          metrics.avgResponseTime > acq.avgResponseTime * 2) {
        anomalies.push({
          type: 'yüksek_yanıt_süresi',
          detail: `Ortalama yanıt süresi ${metrics.avgResponseTime.toFixed(0)}ms (> 2× normal değer)`,
        });
      }
    }

    if (anomalies.length > 0) {
      logger.warn('Anomaly detected', { acquirerId: acq.id, anomalies });
      if (_io) _io.emit('acquirer:anomaly', { acquirerId: acq.id, anomalies, metrics });
      if (_agentService) {
        const lastTime = lastInvestigatedAt.get(acq.id) || 0;
        const cooldownOk = Date.now() - lastTime > INVESTIGATION_COOLDOWN_MS;
        if (cooldownOk) {
          lastInvestigatedAt.set(acq.id, Date.now());
          _agentService.investigate(acq.id, anomalies, metrics)
            .catch((e) => logger.error('Agent investigation failed', { error: e.message }));
        } else {
          logger.info('Investigation cooldown active, skipping', { acquirerId: acq.id, remainingSec: Math.round((INVESTIGATION_COOLDOWN_MS - (Date.now() - lastTime)) / 1000) });
        }
      }
    }
    
    // Update predictive risk state in the simulator
    setPredictiveRisk(acq.id, isPredictiveRisk);
  }
  broadcastAcquirerStates();
}

function startMonitoring() {
  if (_monitorTimer) return;
  logger.info(`Monitoring started (interval: ${SNAPSHOT_INTERVAL_MS / 1000}s)`);
  _monitorTimer = setInterval(() => {
    monitoringTick().catch((e) => logger.error('Monitoring tick failed', { error: e.message }));
    checkIsolatedAcquirers().catch((e) => logger.error('Health check failed', { error: e.message }));
  }, SNAPSHOT_INTERVAL_MS);
  monitoringTick().catch((e) => logger.error('Initial monitoring tick failed', { error: e.message, stack: e.stack }));
}

async function checkIsolatedAcquirers() {
  const acquirers = getAllAcquirers();
  for (const acq of acquirers) {
    if (!acq.isActive && acq.isolatedAt && acq.baseSuccessRate > 0.85 && _agentService) {
      logger.info(`Self-healing check: ${acq.id} looks healthy, asking agent to evaluate.`);
      const anomalies = [{ type: 'iyileşme_tespit_edildi', detail: 'Sistem sağlıklı görünüyor.' }];
      const metrics = { total: 10, successRate: acq.baseSuccessRate, failed: 0, avgResponseTime: acq.avgResponseTime };
      const lastTime = lastInvestigatedAt.get(acq.id) || 0;
      if (Date.now() - lastTime > INVESTIGATION_COOLDOWN_MS) {
        lastInvestigatedAt.set(acq.id, Date.now());
        _agentService.investigate(acq.id, anomalies, metrics, true)
          .catch((e) => logger.error('Agent recovery failed', { error: e.message }));
      }
    }
  }
}

function stopMonitoring() {
  if (_monitorTimer) { clearInterval(_monitorTimer); _monitorTimer = null; }
}

async function getDashboardMetrics() {
  const db = getDb();
  const { c: total }        = await db.get('SELECT COUNT(*) AS c FROM transactions');
  const { c: success }      = await db.get("SELECT COUNT(*) AS c FROM transactions WHERE status='success'");
  const { c: openIncidents }= await db.get("SELECT COUNT(*) AS c FROM incidents WHERE status='open'");
  const { c: openEscalations } = await db.get('SELECT COUNT(*) AS c FROM escalations WHERE acknowledged=0');
  const row = await db.get('SELECT total_savings FROM system_metrics WHERE id = 1');
  const totalSavings = row ? row.total_savings : 0;
  const active = getAllAcquirers().filter((a) => a.isActive).length;
  return { totalTransactions: total, successRate: total > 0 ? success / total : 0,
    activeAcquirers: active, openIncidents, openEscalations, totalSavings };
}

module.exports = { startMonitoring, stopMonitoring, setSocketIo, setAgentService,
  getDashboardMetrics, collectWindowMetrics, getTimeline, broadcastAcquirerStates };
