'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Allowed mutable columns and their JS → SQL name mapping
const FIELD_MAP = {
  avatar:           'avatar',
  career:           'career',
  lang:             'lang',
  reminderTime:     'reminder_time',
  xp:               'xp',
  level:            'level',
  streak:           'streak',
  lastStudy:        'last_study',
  englishLevel:     'english_level',
  subjectScores:    'subject_scores',
  badges:           'badges',
  completedLessons: 'completed_lessons',
  questsDone:       'quests_done',
  quizWeakPoints:   'quiz_weak_points',
  lastQuizKey:      'last_quiz_key',
  placementDone:    'placement_done',
  completedOnboard: 'completed_onboard',
};

// ── GET /api/users/me ────────────────────────────────────────────────

router.get('/me', async (req, res) => {
  try {
    const { rows: [u] } = await db.query(
       `SELECT id, email, role, fname, lname, code, avatar, photo, career,
               parent_email, reminder_time, lang, xp, level, streak, last_study,
               english_level, subject_scores, badges, completed_lessons,
               quests_done, quiz_weak_points, last_quiz_key,
               placement_done, completed_onboard
        FROM users WHERE id = $1`,
      [req.user.userId]
    );
    if (!u) return res.status(404).json({ error: 'User not found' });

    const { rows: qh } = await db.query(
      'SELECT lesson, title, subject, score, correct, total, date FROM quiz_history WHERE user_id = $1 ORDER BY date DESC LIMIT 200',
      [req.user.userId]
    );
    const { rows: links } = await db.query(
      'SELECT student_code FROM student_links WHERE guardian_id = $1',
      [req.user.userId]
    );

    res.json({
      id: u.id, email: u.email, role: u.role,
      fname: u.fname, lname: u.lname, name: `${u.fname} ${u.lname}`.trim(),
      code: u.code, avatar: u.avatar, photo: u.photo, career: u.career,
      parentEmail: u.parent_email, reminderTime: u.reminder_time, lang: u.lang,
      xp: u.xp, level: u.level, streak: u.streak, lastStudy: u.last_study,
      englishLevel: u.english_level,
      subjectScores: u.subject_scores || {},
      badges: u.badges || [],
      completedLessons: u.completed_lessons || [],
      questsDone: u.quests_done || [],
      quizWeakPoints: u.quiz_weak_points || {},
      lastQuizKey: u.last_quiz_key || null,
      placementDone: u.placement_done,
      completedOnboard: u.completed_onboard,
      linkedStudents: links.map(l => l.student_code),
      quizHistory: qh.map(q => ({
        lesson: q.lesson, title: q.title, subject: q.subject,
        score: parseFloat(q.score), correct: q.correct, total: q.total, date: q.date,
      })),
    });
  } catch (err) {
    console.error('GET /users/me error:', err);
    res.status(500).json({ error: 'Failed to retrieve user data' });
  }
});

// ── PATCH /api/users/me ──────────────────────────────────────────────

router.patch('/me', [
  body('avatar').optional().isString().isLength({ max: 20 }),
  body('career').optional().trim().isLength({ max: 200 }).escape(),
  body('lang').optional().isIn(['fr', 'en']),
  body('reminderTime').optional().matches(/^\d{2}:\d{2}$/),
  body('xp').optional().isInt({ min: 0 }),
  body('level').optional().isInt({ min: 1 }),
  body('streak').optional().isInt({ min: 0 }),
  body('lastStudy').optional({ nullable: true }).isISO8601(),
  body('englishLevel').optional().isInt({ min: 0, max: 100 }),
  body('subjectScores').optional().isObject(),
  body('badges').optional().isArray(),
  body('completedLessons').optional().isArray(),
  body('questsDone').optional().isArray(),
  body('quizWeakPoints').optional().isObject(),
  body('lastQuizKey').optional({ nullable: true }).isString().isLength({ max: 100 }),
  body('placementDone').optional().isBoolean(),
  body('completedOnboard').optional().isBoolean(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input', details: errors.array() });

  // Columns stored as JSON in Postgres — must be serialized to string
  const JSON_COLS = new Set(['subject_scores', 'badges', 'completed_lessons', 'quests_done', 'quiz_weak_points']);

  const updates = {};
  for (const [jsKey, col] of Object.entries(FIELD_MAP)) {
    if (req.body[jsKey] !== undefined) {
      updates[col] = JSON_COLS.has(col) ? JSON.stringify(req.body[jsKey]) : req.body[jsKey];
    }
  }
  if (Object.keys(updates).length === 0) return res.json({ success: true });

  const cols = Object.keys(updates);
  const vals = Object.values(updates);
  const setClause = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');

  try {
    await db.query(`UPDATE users SET ${setClause} WHERE id = $1`, [req.user.userId, ...vals]);
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /users/me error:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// ── POST /api/users/link-student ─────────────────────────────────────

router.post('/link-student', [
  body('studentCode').trim().toUpperCase().isLength({ min: 4, max: 20 }),
], async (req, res) => {
  if (!['parent', 'tutor'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only parents or tutors can link students' });
  }
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid student code' });

  const { studentCode } = req.body;
  try {
    const { rows: [student] } = await db.query(
      `SELECT id FROM users WHERE code = $1 AND role = 'student'`,
      [studentCode]
    );
    if (!student) return res.status(404).json({ error: 'Student code not found' });

    await db.query(
      'INSERT INTO student_links (guardian_id, student_code) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.userId, studentCode]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('link-student error:', err);
    res.status(500).json({ error: 'Failed to link student' });
  }
});

// ── GET /api/users/linked-students ───────────────────────────────────

router.get('/linked-students', async (req, res) => {
  if (!['parent', 'tutor'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only parents or tutors can access this' });
  }
  try {
    const { rows: links } = await db.query(
      'SELECT student_code FROM student_links WHERE guardian_id = $1',
      [req.user.userId]
    );
    const students = [];
    for (const { student_code } of links) {
      const { rows: [u] } = await db.query(
        `SELECT id, fname, lname, code, xp, level, streak, english_level,
                subject_scores, badges, completed_lessons, last_study
         FROM users WHERE code = $1`,
        [student_code]
      );
      if (!u) continue;
      const { rows: qh } = await db.query(
        'SELECT lesson, subject, score, date FROM quiz_history WHERE user_id = $1 ORDER BY date DESC LIMIT 20',
        [u.id]
      );
      students.push({
        ...u,
        name: `${u.fname} ${u.lname}`.trim(),
        englishLevel: u.english_level,
        subjectScores: u.subject_scores || {},
        completedLessons: u.completed_lessons || [],
        badges: u.badges || [],
        lastStudy: u.last_study,
        quizHistory: qh,
      });
    }
    res.json(students);
  } catch (err) {
    console.error('linked-students error:', err);
    res.status(500).json({ error: 'Failed to get linked students' });
  }
});

// ── GET /api/users/instructor-notifications ──────────────────────────

router.get('/instructor-notifications', async (req, res) => {
  if (!['admin', 'tutor'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Instructor access required' });
  }
  try {
    const { rows } = await db.query(
      `SELECT id, title, body, summary_json, channel, email_sent, created_at, read_at
       FROM instructor_notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user.userId]
    );
    res.json(rows.map(r => ({
      id: r.id,
      title: r.title,
      body: r.body,
      summary: r.summary_json || {},
      channel: r.channel,
      emailSent: r.email_sent,
      createdAt: r.created_at,
      readAt: r.read_at,
    })));
  } catch (err) {
    console.error('GET /users/instructor-notifications error:', err);
    res.status(500).json({ error: 'Failed to retrieve notifications' });
  }
});

// ── POST /api/users/instructor-notifications/:id/read ────────────────

router.post('/instructor-notifications/:id/read', async (req, res) => {
  if (!['admin', 'tutor'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Instructor access required' });
  }
  try {
    const { rowCount } = await db.query(
      `UPDATE instructor_notifications
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('POST /users/instructor-notifications/:id/read error:', err);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

module.exports = router;
