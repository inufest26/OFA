const express = require('express');
const { askAgent } = require('../services/agentService');
const { getDb } = require('../database/init');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.post('/ask', authMiddleware, async (req, res, next) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'question is required' });
    const answer = await askAgent(question);
    res.json({ answer });
  } catch (err) { next(err); }
});

router.post('/trigger/acquirer-fault', authMiddleware, async (req, res, next) => {
  try {
    const { investigate } = require('../services/agentService');
    const anomalies = [{ type: 'manual_trigger', detail: 'Demo Senaryosu: Yapı Kredi altyapısında genel kesinti. Acquirer hata oranları çok yüksek.' }];
    const fakeMetrics = { successRate: 0.15, total: 200, avgResponseTime: 450, errors: { 'ACQUIRER_ERROR': 170, 'ACQUIRER_TIMEOUT': 0 } };
    investigate('acquirer_yapikredi', anomalies, fakeMetrics).catch(err => console.error(err));
    res.json({ success: true, message: 'Acquirer fault analysis triggered' });
  } catch (err) { next(err); }
});

router.post('/trigger/merchant-fault', authMiddleware, async (req, res, next) => {
  try {
    const { investigate } = require('../services/agentService');
    const anomalies = [{ type: 'manual_trigger', detail: 'Demo Senaryosu: Belirli bir üye işyeri (M-1024) özelinde hata oranı yüksek. Genel acquirer sağlığı normal.' }];
    const fakeMetrics = { successRate: 0.92, total: 500, avgResponseTime: 230, errors: { 'ACQUIRER_ERROR': 40 } };
    investigate('acquirer_garanti', anomalies, fakeMetrics).catch(err => console.error(err));
    res.json({ success: true, message: 'Merchant fault analysis triggered' });
  } catch (err) { next(err); }
});

router.get('/incidents', authMiddleware, async (req, res, next) => {
  try {
    const db = getDb();
    const status = req.query.status;
    const limit  = parseInt(req.query.limit || '50', 10);
    let sql = 'SELECT id,title,severity,acquirer_id,status,created_at,resolved_at FROM incidents';
    const params = [];
    if (status) { sql += ' WHERE status=?'; params.push(status); }
    sql += ' ORDER BY created_at DESC LIMIT ?'; params.push(limit);
    res.json(await db.all(sql, ...params));
  } catch (err) { next(err); }
});

router.get('/incidents/:id', authMiddleware, async (req, res, next) => {
  try {
    const db = getDb();
    const incident = await db.get('SELECT * FROM incidents WHERE id=?', req.params.id);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });
    const actions = await db.all(
      'SELECT * FROM agent_actions WHERE incident_id=? ORDER BY created_at ASC', req.params.id
    );
    res.json({
      ...incident,
      reasoningChain: incident.reasoning_chain ? JSON.parse(incident.reasoning_chain) : [],
      actionsTaken:   incident.actions_taken    ? JSON.parse(incident.actions_taken)   : [],
      recommendations:incident.recommendations  ? JSON.parse(incident.recommendations) : [],
      actions,
    });
  } catch (err) { next(err); }
});

router.post('/incidents/:id/acknowledge', authMiddleware, async (req, res, next) => {
  try {
    const db = getDb();
    const inc = await db.get('SELECT id FROM incidents WHERE id=?', req.params.id);
    if (!inc) return res.status(404).json({ error: 'Incident not found' });
    await db.run("UPDATE incidents SET status='acknowledged' WHERE id=?", req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/escalations', authMiddleware, async (req, res, next) => {
  try {
    const db = getDb();
    const onlyOpen = req.query.open === 'true';
    let sql = 'SELECT * FROM escalations';
    if (onlyOpen) sql += ' WHERE acknowledged=0';
    sql += ' ORDER BY created_at DESC LIMIT 100';
    const rows = (await db.all(sql)).map((e) => ({
      ...e,
      attemptedActions: e.attempted_actions ? JSON.parse(e.attempted_actions) : [],
    }));
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/escalations/:id/acknowledge', authMiddleware, async (req, res, next) => {
  try {
    const db = getDb();
    const esc = await db.get('SELECT id FROM escalations WHERE id=?', req.params.id);
    if (!esc) return res.status(404).json({ error: 'Escalation not found' });
    await db.run(
      'UPDATE escalations SET acknowledged=1, acknowledged_at=CURRENT_TIMESTAMP WHERE id=?',
      req.params.id
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
