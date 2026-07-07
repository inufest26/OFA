const express = require('express');
const { getDashboardMetrics, getTimeline } = require('../services/monitoringService');
const { getAllAcquirers } = require('../services/acquirerSimulator');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.get('/', authMiddleware, async (req, res, next) => {
  try { res.json(await getDashboardMetrics()); } catch (err) { next(err); }
});

router.get('/acquirers', authMiddleware, (req, res) => {
  res.json(getAllAcquirers());
});

router.get('/timeline', authMiddleware, async (req, res, next) => {
  try {
    const acquirerId = req.query.acquirerId;
    const limit = parseInt(req.query.limit || '20', 10);
    if (!acquirerId) {
      const all = getAllAcquirers();
      const result = {};
      for (const a of all) result[a.id] = await getTimeline(a.id, limit);
      return res.json(result);
    }
    res.json(await getTimeline(acquirerId, limit));
  } catch (err) { next(err); }
});

module.exports = router;
