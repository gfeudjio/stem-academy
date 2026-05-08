'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const config = require('../config');
const { getSourceAllowlist } = require('../content/sourcePolicy');
const { runContentRefresh } = require('../content/refreshService');

const MAX_QUESTIONS_PER_REFRESH = 1000;
const MAX_MATERIALS_PER_REFRESH = 1000;
const MAX_DETAILS_PER_REFRESH = 200;

const router = express.Router();
router.use(requireAuth);

// All routes require admin role
router.use((req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
});

// ── GET /api/admin/users ─────────────────────────────────────────────
// Returns all users grouped by role, with student link counts

router.get('/users', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.role, u.fname, u.lname, u.code,
              u.xp, u.level, u.streak, u.english_level,
              u.placement_done, u.completed_onboard, u.created_at,
              COUNT(sl.student_code) AS linked_count
       FROM users u
       LEFT JOIN student_links sl ON sl.guardian_id = u.id
       WHERE u.role != 'admin'
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );

    const students = rows.filter(u => u.role === 'student').map(u => ({
      id: u.id,
      email: u.email,
      fname: u.fname,
      lname: u.lname,
      code: u.code,
      xp: u.xp,
      level: u.level,
      streak: u.streak,
      englishLevel: u.english_level,
      placementDone: u.placement_done,
      completedOnboard: u.completed_onboard,
      createdAt: u.created_at,
    }));

    const parents = rows.filter(u => u.role === 'parent').map(u => ({
      id: u.id,
      email: u.email,
      fname: u.fname,
      lname: u.lname,
      linkedCount: parseInt(u.linked_count, 10),
      createdAt: u.created_at,
    }));

    const tutors = rows.filter(u => u.role === 'tutor').map(u => ({
      id: u.id,
      email: u.email,
      fname: u.fname,
      lname: u.lname,
      linkedCount: parseInt(u.linked_count, 10),
      createdAt: u.created_at,
    }));

    res.json({ students, parents, tutors });
  } catch (err) {
    console.error('GET /admin/users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ── DELETE /api/admin/users/:id ──────────────────────────────────────

router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;
  // Basic UUID check to avoid passing arbitrary strings to the query
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  try {
    const { rowCount } = await db.query(
      `DELETE FROM users WHERE id = $1 AND role != 'admin'`,
      [id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /admin/users error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ── GET /api/admin/content/policy ──────────────────────────────────────

router.get('/content/policy', (_req, res) => {
  res.json({
    sources: getSourceAllowlist(),
    weeklySchedule: {
      weekday: 'Sunday',
      time: '11:00 PM',
      timezone: config.weeklyRefreshTimezoneLabel,
    },
  });
});

// ── POST /api/admin/content/refresh ────────────────────────────────────

router.post('/content/refresh', [
  body('runType').optional().isIn(['manual', 'scheduled-weekly']),
  body('importStartedAt').optional().isISO8601(),
  body('importFinishedAt').optional().isISO8601(),
  body('addedQuestions').optional().isArray({ max: MAX_QUESTIONS_PER_REFRESH }),
  body('addedMaterials').optional().isArray({ max: MAX_MATERIALS_PER_REFRESH }),
  body('details').optional().isArray({ max: MAX_DETAILS_PER_REFRESH }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input', details: errors.array() });

  try {
    const result = await runContentRefresh(req.body || {});
    res.json(result);
  } catch (err) {
    console.error('POST /admin/content/refresh error:', err);
    res.status(500).json({ error: 'Failed to process content refresh' });
  }
});

module.exports = router;
