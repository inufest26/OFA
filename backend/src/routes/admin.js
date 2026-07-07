const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { getDb } = require('../database/init');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username !== config.adminUsername || password !== config.adminPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ username, role: 'admin' }, config.jwtSecret, { expiresIn: '12h' });
  res.json({ token, username });
});

router.get('/logs', authMiddleware, async (req, res, next) => {
  try {
    const db = getDb();
    const page   = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit  = Math.min(100, parseInt(req.query.limit || '50', 10));
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];
    if (req.query.acquirer)  { where += ' AND acquirer_id=?'; params.push(req.query.acquirer); }
    if (req.query.errorCode) { where += ' AND error_code=?';  params.push(req.query.errorCode); }

    const { c: total } = await db.get(`SELECT COUNT(*) AS c FROM error_logs ${where}`, ...params);
    const logs = await db.all(
      `SELECT * FROM error_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      ...params, limit, offset
    );
    res.json({ total, page, limit, logs });
  } catch (err) { next(err); }
});

module.exports = router;
