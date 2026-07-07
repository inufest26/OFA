const express = require('express');
const { getDb } = require('../database/init');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const db = getDb();
    const page   = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit  = Math.min(100, parseInt(req.query.limit || '20', 10));
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];
    if (req.query.status)   { where += ' AND status=?';      params.push(req.query.status); }
    if (req.query.acquirer) { where += ' AND acquirer_id=?';  params.push(req.query.acquirer); }
    if (req.query.from)     { where += ' AND created_at>=?';  params.push(req.query.from); }
    if (req.query.to)       { where += ' AND created_at<=?';  params.push(req.query.to); }

    const { c: total } = await db.get(`SELECT COUNT(*) AS c FROM transactions ${where}`, ...params);
    const rows = await db.all(
      `SELECT * FROM transactions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      ...params, limit, offset
    );

    const transactions = rows.map((r) => ({
      ...r,
      retryHistory: r.retry_history ? JSON.parse(r.retry_history) : [],
      mlScores: r.ml_scores ? JSON.parse(r.ml_scores) : {},
    }));
    res.json({ total, page, limit, transactions });
  } catch (err) { next(err); }
});

router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const db = getDb();
    const row = await db.get('SELECT * FROM transactions WHERE id=?', req.params.id);
    if (!row) return res.status(404).json({ error: 'Transaction not found' });
    const errorLogs = await db.all(
      'SELECT * FROM error_logs WHERE transaction_id=? ORDER BY created_at ASC', req.params.id
    );
    res.json({
      ...row,
      retryHistory: row.retry_history ? JSON.parse(row.retry_history) : [],
      mlScores: row.ml_scores ? JSON.parse(row.ml_scores) : {},
      errorLogs,
    });
  } catch (err) { next(err); }
});

module.exports = router;
