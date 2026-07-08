/**
 * Agentic AI Service — Gemini Function Calling, async sqlite3 edition
 * All prompts are in English.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getDb } = require('../database/init');
const {
  getAcquirer, getAllAcquirers,
  isolateAcquirer, restoreAcquirer, updateRoutingWeight,
} = require('./acquirerSimulator');
const { collectWindowMetrics } = require('./monitoringService');
const config = require('../config');
const logger = require('../utils/logger');

let _io = null;
function setSocketIo(io) { _io = io; }

const activeInvestigations = new Set();
const genAI = new GoogleGenerativeAI(config.geminiApiKey);

// ── Exponential backoff for Gemini 429 AND empty-response errors ───────────────
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = String(err?.message || '');
      const status = err?.status || err?.response?.status || err?.code;
      const is429 = status === 429 || msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate limit');
      const isEmpty = msg.toLowerCase().includes('must contain either output text') || msg.toLowerCase().includes('cannot both be empty');
      const shouldRetry = is429 || isEmpty;
      if (!shouldRetry || attempt === maxRetries) throw err;
      const delay = is429
        ? Math.min(2000 * Math.pow(2, attempt), 30000)  // 2s, 4s, 8s for quota
        : Math.min(500 * (attempt + 1), 3000);            // 0.5s, 1s, 1.5s for empty
      logger.warn(`Gemini ${is429 ? '429' : 'empty-response'} — retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// Preferred model
const GEMINI_MODEL = config.geminiModel || 'gemini-2.0-flash-lite';

// ── Safe content extraction helper ──────────────────────────────────────────
function extractText(response) {
  try {
    const parts = response?.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) return null;
    return parts.filter((p) => p.text).map((p) => p.text).join('') || null;
  } catch (_) { return null; }
}

function isErrorResponse(err) {
  const msg = String(err?.message || '');
  return {
    is429: msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate limit'),
    isEmpty: msg.toLowerCase().includes('must contain either output text or tool calls') || msg.toLowerCase().includes('cannot both be empty'),
    is404: msg.includes('404') || msg.includes('not found'),
  };
}

// ── Pre-fetch system context locally (no API calls) ──────────────────────────
async function buildSystemContext() {
  const db = getDb();
  const acquirers = getAllAcquirers();

  // Recent metrics (last 30 min)
  const since30m = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const recentTx = await db.all(
    'SELECT acquirer_id, status, error_code FROM transactions WHERE created_at >= ? LIMIT 50',
    since30m
  );

  const txSummary = {};
  for (const tx of recentTx) {
    if (!txSummary[tx.acquirer_id]) txSummary[tx.acquirer_id] = { total: 0, success: 0, errors: {} };
    txSummary[tx.acquirer_id].total += 1;
    if (tx.status === 'success') txSummary[tx.acquirer_id].success += 1;
    if (tx.error_code) {
      txSummary[tx.acquirer_id].errors[tx.error_code] =
        (txSummary[tx.acquirer_id].errors[tx.error_code] || 0) + 1;
    }
  }

  // Overall stats
  const { c: totalTx }   = await db.get('SELECT COUNT(*) AS c FROM transactions');
  const { c: successTx } = await db.get("SELECT COUNT(*) AS c FROM transactions WHERE status='success'");
  const { c: openInc }   = await db.get("SELECT COUNT(*) AS c FROM incidents WHERE status='open'");
  const { c: openEsc }   = await db.get('SELECT COUNT(*) AS c FROM escalations WHERE acknowledged=0');

  // Recent incidents
  const incidents = await db.all(
    "SELECT title, severity, status, acquirer_id, created_at FROM incidents ORDER BY created_at DESC LIMIT 5"
  );

  return {
    timestamp: new Date().toISOString(),
    overallStats: { totalTransactions: totalTx, successRate: totalTx > 0 ? (successTx / totalTx).toFixed(3) : 'N/A', openIncidents: openInc, openEscalations: openEsc },
    acquirers: acquirers.map((a) => ({
      id: a.id, name: a.name, isActive: a.isActive, anomalyMode: a.anomalyMode,
      currentSuccessRate: a.currentSuccessRate.toFixed(3), avgResponseTime: a.avgResponseTime.toFixed(0) + 'ms',
      routingWeight: a.routingWeight, consecutiveFailures: a.consecutiveFailures,
    })),
    last30minTxByAcquirer: txSummary,
    recentIncidents: incidents,
  };
}

// ── Tool declarations ─────────────────────────────────────────────────────────

const agentToolDeclarations = [
  {
    name: 'query_transaction_logs',
    description: 'Query recent transaction logs for a specific time window. Returns a summary including error distributions.',
    parameters: { type: 'OBJECT', properties: {
      minutes:     { type: 'NUMBER', description: 'Look-back window in minutes (1-60)' },
      acquirer_id: { type: 'STRING', description: 'Optional: filter by acquirer ID' },
      error_code:  { type: 'STRING', description: 'Optional: filter by error code (e.g. E101)' },
    }, required: ['minutes'] },
  },
  {
    name: 'get_acquirer_metrics',
    description: 'Get current real-time metrics for a specific acquirer.',
    parameters: { type: 'OBJECT', properties: {
      acquirer_id: { type: 'STRING', description: 'The acquirer ID to query' },
    }, required: ['acquirer_id'] },
  },
  {
    name: 'get_error_distribution',
    description: 'Get the distribution of error codes for a given time window.',
    parameters: { type: 'OBJECT', properties: {
      minutes:     { type: 'NUMBER', description: 'Look-back window in minutes' },
      acquirer_id: { type: 'STRING', description: 'Optional: filter by acquirer ID' },
    }, required: ['minutes'] },
  },
  {
    name: 'get_all_acquirer_statuses',
    description: 'Get the current status of all acquirers in the system.',
    parameters: { type: 'OBJECT', properties: {}, required: [] },
  },
  {
    name: 'update_routing_weight',
    description: 'Update the routing weight for an acquirer. 0=no traffic, 1=normal, 2=double traffic.',
    parameters: { type: 'OBJECT', properties: {
      acquirer_id: { type: 'STRING', description: 'The acquirer ID' },
      weight:      { type: 'NUMBER', description: 'New routing weight (0.0 to 2.0)' },
    }, required: ['acquirer_id', 'weight'] },
  },
  {
    name: 'isolate_acquirer',
    description: 'Temporarily remove an acquirer from the routing pool.',
    parameters: { type: 'OBJECT', properties: {
      acquirer_id:       { type: 'STRING', description: 'The acquirer ID to isolate' },
      reason:            { type: 'STRING', description: 'Reason for isolation' },
      duration_minutes:  { type: 'NUMBER', description: 'Duration in minutes before auto-restore' },
    }, required: ['acquirer_id', 'reason', 'duration_minutes'] },
  },
  {
    name: 'restore_acquirer',
    description: 'Restore a previously isolated acquirer back to active status.',
    parameters: { type: 'OBJECT', properties: {
      acquirer_id: { type: 'STRING', description: 'The acquirer ID to restore' },
    }, required: ['acquirer_id'] },
  },
  {
    name: 'create_incident_report',
    description: 'Create a formal incident report documenting the issue and resolution steps.',
    parameters: { type: 'OBJECT', properties: {
      title:          { type: 'STRING', description: 'Short incident title' },
      severity:       { type: 'STRING', description: 'Severity: low | medium | high | critical' },
      root_cause:     { type: 'STRING', description: 'Root cause analysis' },
      actions_taken:  { type: 'ARRAY', items: { type: 'STRING' }, description: 'List of actions taken' },
      recommendations:{ type: 'ARRAY', items: { type: 'STRING' }, description: 'Future recommendations' },
    }, required: ['title', 'severity', 'root_cause', 'actions_taken', 'recommendations'] },
  },
  {
    name: 'escalate_to_admin',
    description: 'Escalate an unresolved issue to human admin when the agent cannot resolve it autonomously.',
    parameters: { type: 'OBJECT', properties: {
      title:             { type: 'STRING', description: 'Short escalation title' },
      severity:          { type: 'STRING', description: 'Severity: low | medium | high | critical' },
      description:       { type: 'STRING', description: 'Detailed description of the problem' },
      attempted_actions: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Actions already tried' },
      recommendation:    { type: 'STRING', description: 'What the agent recommends admin to do' },
    }, required: ['title', 'severity', 'description', 'attempted_actions', 'recommendation'] },
  },
];

// ── Tool implementations ──────────────────────────────────────────────────────

async function toolQueryTransactionLogs({ minutes, acquirer_id, error_code }) {
  const db = getDb();
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  let sql = 'SELECT status, acquirer_id, error_code, response_time_ms FROM transactions WHERE created_at>=?';
  const params = [since];
  if (acquirer_id) { sql += ' AND acquirer_id=?'; params.push(acquirer_id); }
  if (error_code)  { sql += ' AND error_code=?';  params.push(error_code);  }
  const rows = await db.all(sql, ...params);
  const total   = rows.length;
  const success = rows.filter((r) => r.status === 'success').length;
  return { totalTransactions: total, successCount: success, failureCount: total - success,
    successRate: total > 0 ? (success / total).toFixed(3) : 'N/A', windowMinutes: minutes,
    sampleErrors: rows.filter((r) => r.status !== 'success').slice(0, 10) };
}

async function toolGetAcquirerMetrics({ acquirer_id }) {
  const acq = getAcquirer(acquirer_id);
  if (!acq) return { error: `Acquirer ${acquirer_id} not found` };
  const windowMetrics = await collectWindowMetrics(acquirer_id, 5);
  return { ...acq, last5MinMetrics: windowMetrics };
}

async function toolGetErrorDistribution({ minutes, acquirer_id }) {
  const db = getDb();
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  let sql = "SELECT error_code, COUNT(*) AS count FROM transactions WHERE status!='success' AND created_at>=?";
  const params = [since];
  if (acquirer_id) { sql += ' AND acquirer_id=?'; params.push(acquirer_id); }
  sql += ' GROUP BY error_code ORDER BY count DESC';
  return db.all(sql, ...params);
}

function toolGetAllAcquirerStatuses() { return getAllAcquirers(); }

async function toolUpdateRoutingWeight({ acquirer_id, weight }) {
  const ok = await updateRoutingWeight(acquirer_id, weight);
  if (_io) _io.emit('acquirer:update', getAllAcquirers());
  return { success: ok, acquirerId: acquirer_id, newWeight: weight };
}

async function toolIsolateAcquirer({ acquirer_id, reason, duration_minutes }) {
  const ok = await isolateAcquirer(acquirer_id, reason, duration_minutes);
  if (_io) _io.emit('acquirer:update', getAllAcquirers());
  return { success: ok, acquirerId: acquirer_id, reason, durationMinutes: duration_minutes };
}

async function toolRestoreAcquirer({ acquirer_id }) {
  const ok = await restoreAcquirer(acquirer_id);
  if (_io) _io.emit('acquirer:update', getAllAcquirers());
  return { success: ok, acquirerId: acquirer_id };
}

async function toolCreateIncidentReport(args, incidentId, acquirerId) {
  const db = getDb();
  const { lastInsertRowid } = await db.run(
    `INSERT INTO incidents (title,severity,acquirer_id,root_cause,actions_taken,recommendations,status)
     VALUES (?,?,?,?,?,?,'resolved')`,
    args.title, args.severity, acquirerId, args.root_cause,
    JSON.stringify(args.actions_taken), JSON.stringify(args.recommendations)
  );
  if (_io) _io.emit('agent:incident', { incidentId: lastInsertRowid, acquirerId, status: 'resolved' });
  return { incidentId: lastInsertRowid, status: 'created' };
}

async function toolEscalateToAdmin(args, acquirerId) {
  const db = getDb();
  const { lastInsertRowid } = await db.run(
    `INSERT INTO escalations (title,severity,description,attempted_actions,recommendation)
     VALUES (?,?,?,?,?)`,
    args.title, args.severity, args.description,
    JSON.stringify(args.attempted_actions), args.recommendation
  );
  const escalation = await db.get('SELECT * FROM escalations WHERE id=?', lastInsertRowid);
  if (_io) _io.emit('agent:escalation', { ...escalation, attemptedActions: args.attempted_actions });
  return { escalationId: lastInsertRowid, status: 'escalated' };
}

async function dispatchTool(toolName, args, context) {
  logger.info(`Agent tool call: ${toolName}`, { args });
  switch (toolName) {
    case 'query_transaction_logs':    return toolQueryTransactionLogs(args);
    case 'get_acquirer_metrics':      return toolGetAcquirerMetrics(args);
    case 'get_error_distribution':    return toolGetErrorDistribution(args);
    case 'get_all_acquirer_statuses': return toolGetAllAcquirerStatuses();
    case 'update_routing_weight':     return toolUpdateRoutingWeight(args);
    case 'isolate_acquirer':          return toolIsolateAcquirer(args);
    case 'restore_acquirer':          return toolRestoreAcquirer(args);
    case 'create_incident_report':    return toolCreateIncidentReport(args, context.incidentId, context.acquirerId);
    case 'escalate_to_admin':         return toolEscalateToAdmin(args, context.acquirerId);
    default:                          return { error: `Unknown tool: ${toolName}` };
  }
}

// ── Main investigation ────────────────────────────────────────────────────────

async function investigate(acquirerId, anomalies, metrics) {
  if (activeInvestigations.has(acquirerId)) return;
  activeInvestigations.add(acquirerId);

  const db = getDb();
  const { lastInsertRowid: incidentId } = await db.run(
    `INSERT INTO incidents (title,severity,acquirer_id,root_cause,status)
     VALUES (?,'high',?,'Under investigation','open')`,
    `Anomaly detected on ${acquirerId}`, acquirerId
  );

  const reasoningChain = [];
  logger.info('Agent investigation started', { acquirerId, incidentId });
  if (_io) _io.emit('agent:action', { type: 'investigate', acquirerId, incidentId, timestamp: new Date().toISOString() });

  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      tools: [{ functionDeclarations: agentToolDeclarations }],
      systemInstruction: `You are SmartPay Agent, an autonomous AI monitoring system for a payment gateway.
You have detected anomalies in the payment acquirer system and must investigate and resolve them.
Your goal is to:
1. Investigate the root cause using the available tools
2. Take corrective action (update routing weights, isolate acquirers if absolutely necessary)
3. Create a formal incident report documenting what happened and what was done
4. If you cannot resolve the issue confidently, escalate to human admin

Always reason step by step. Be decisive but careful.
Available acquirer IDs: acquirer_garanti, acquirer_yapikredi, acquirer_isbank.`,
    });

    const anomalyDescription = anomalies.map((a) => `- ${a.type}: ${a.detail}`).join('\n');
    const initialPrompt = `ANOMALY ALERT — Immediate investigation required.

Affected acquirer: ${acquirerId}
Detected anomalies:
${anomalyDescription}

Current metrics (last 5 minutes):
- Total transactions: ${metrics.total}
- Success rate: ${metrics.successRate !== null ? (metrics.successRate * 100).toFixed(1) + '%' : 'N/A'}
- Failed transactions: ${metrics.failed}
- Avg response time: ${metrics.avgResponseTime.toFixed(0)}ms

Please investigate, take appropriate corrective actions, and create an incident report.`;

    const chat = model.startChat();
    let response = await retryWithBackoff(() => chat.sendMessage(initialPrompt));
    let iteration = 0;

    while (iteration < 12) {
      iteration++;
      const content = response.candidates?.[0]?.content;
      if (!content) break;

      const toolCalls = content.parts?.filter((p) => p.functionCall) || [];
      if (toolCalls.length === 0) {
        const finalText = content.parts?.map((p) => p.text || '').join('') || '';
        reasoningChain.push({ type: 'conclusion', text: finalText, timestamp: new Date().toISOString() });
        break;
      }

      const toolResults = [];
      for (const part of toolCalls) {
        const { name, args } = part.functionCall;
        reasoningChain.push({ type: 'tool_call', tool: name, args, timestamp: new Date().toISOString() });
        const result = await dispatchTool(name, args, { incidentId, acquirerId });
        reasoningChain.push({ type: 'tool_result', tool: name, result, timestamp: new Date().toISOString() });
        if (_io) _io.emit('agent:reasoning', { incidentId, step: { tool: name, args, result }, timestamp: new Date().toISOString() });
        toolResults.push({ functionResponse: { name, response: { result } } });
      }

      response = await retryWithBackoff(() => chat.sendMessage(toolResults));
    }

    await db.run(
      `UPDATE incidents SET reasoning_chain=?, status='resolved', resolved_at=CURRENT_TIMESTAMP WHERE id=?`,
      JSON.stringify(reasoningChain), incidentId
    );
    if (_io) _io.emit('agent:incident', { incidentId, acquirerId, status: 'resolved' });
  } catch (err) {
    logger.error('Agent investigation error', { acquirerId, error: err.message });
    await db.run("UPDATE incidents SET status='open' WHERE id=?", incidentId).catch(() => {});
  } finally {
    activeInvestigations.delete(acquirerId);
  }
}

// ── Admin chat — Context Injection Pattern (1 API call per question) ─────────
// Instead of multi-round tool calling, we pre-fetch all data locally from
// the database and in-memory state, then send ONE generateContent request.

async function askAgent(question) {
  try {
    // 1. Collect real-time context locally — zero API calls
    const ctx = await buildSystemContext();

    // 2. Build a rich, structured prompt
    const systemPrompt = `You are SmartPay Agent, an AI monitoring assistant for a payment gateway system.
You will be given real-time system data and must answer the admin's question based on that data.
Be concise, factual, and actionable. Respond in the same language as the question (Turkish or English).
If you see anomalies or issues in the data, proactively highlight them.`;

    const userPrompt = `=== REAL-TIME SYSTEM SNAPSHOT (${ctx.timestamp}) ===

OVERALL STATS:
${JSON.stringify(ctx.overallStats, null, 2)}

ACQUIRER HEALTH:
${ctx.acquirers.map((a) => `- ${a.name} [${a.id}]:
  Active: ${a.isActive}, Anomaly: ${a.anomalyMode}
  Success Rate: ${(parseFloat(a.currentSuccessRate) * 100).toFixed(1)}%
  Avg Response: ${a.avgResponseTime}
  Routing Weight: ${a.routingWeight}x
  Consecutive Failures: ${a.consecutiveFailures}`).join('\n')}

LAST 30 MIN TRANSACTIONS BY ACQUIRER:
${Object.entries(ctx.last30minTxByAcquirer).length > 0
  ? Object.entries(ctx.last30minTxByAcquirer).map(([id, s]) =>
    `- ${id}: ${s.total} total, ${s.success} success (${s.total > 0 ? ((s.success/s.total)*100).toFixed(1) : 0}%), errors: ${JSON.stringify(s.errors)}`
  ).join('\n')
  : '(no transactions in last 30 minutes)'}

RECENT INCIDENTS:
${ctx.recentIncidents.length > 0
  ? ctx.recentIncidents.map((i) => `- [${i.severity}] ${i.title} — ${i.status} (${i.acquirer_id})`).join('\n')
  : '(none)'}

=== ADMIN QUESTION ===
${question}`;

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    // Single concatenated string — avoid array format which can trigger empty-response SDK errors
    const fullPrompt = systemPrompt + '\n\n' + userPrompt;
    const response = await retryWithBackoff(() => model.generateContent(fullPrompt));

    const text = extractText(response);
    if (text) return text;

    return 'Agent şu anda yanıt üretemedi. Lütfen tekrar deneyin.';

  } catch (err) {
    const errInfo = isErrorResponse(err);
    if (errInfo.is429) {
      logger.warn('Gemini rate limit on askAgent', { error: err.message });
      return '⚠️ API kota limiti aşıldı. Lütfen 30-60 saniye bekleyip tekrar deneyin.';
    }
    if (errInfo.isEmpty) {
      logger.warn('Gemini empty response on askAgent', { error: err.message });
      return '⚠️ Model boş yanıt döndürdü. Lütfen sorunuzu yeniden ifade edip tekrar deneyin.';
    }
    if (errInfo.is404) {
      logger.error('Gemini model not found', { model: GEMINI_MODEL, error: err.message });
      return `⚠️ Model bulunamadı: ${GEMINI_MODEL}. .env dosyasındaki GEMINI_MODEL değerini kontrol edin.`;
    }
    logger.error('askAgent error', { error: err.message });
    return `⚠️ Hata: ${err.message}`;
  }
}

module.exports = { investigate, askAgent, setSocketIo };
