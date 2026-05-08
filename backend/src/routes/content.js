'use strict';

const express = require('express');
const requireAuth = require('../middleware/auth');
const { runContentRefresh, getLatestRefreshRun } = require('../content/refreshService');
const { getApprovedSources } = require('../content/approvedSources');

const router = express.Router();
router.use(requireAuth);

router.get('/refresh-status', async (req, res) => {
  if (!['admin', 'tutor'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Instructor access required' });
  }
  try {
    const latest = await getLatestRefreshRun();
    res.json({
      approvedSources: getApprovedSources(),
      latest,
    });
  } catch (err) {
    console.error('GET /content/refresh-status error:', err);
    res.status(500).json({ error: 'Failed to load refresh status' });
  }
});

router.post('/refresh', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  try {
    const result = await runContentRefresh(`manual:${req.user.userId}`);
    res.status(result.skipped ? 202 : 201).json(result);
  } catch (err) {
    console.error('POST /content/refresh error:', err);
    res.status(500).json({ error: 'Refresh failed' });
  }
});

module.exports = router;
