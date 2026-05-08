'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const config = require('../config');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// ── Helpers ─────────────────────────────────────────────────────────

function genCode(name) {
  const prefix = (name || 'USR').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
  return prefix + '-' + (Math.floor(1000 + Math.random() * 8999));
}

function generateAccessToken(userId, role) {
  return jwt.sign({ userId, role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

async function storeRefreshToken(userId, rawToken) {
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + config.refreshExpiresInMs);
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hash, expiresAt]
  );
  return hash;
}

function setRefreshCookie(res, rawToken) {
  res.cookie('refreshToken', rawToken, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: config.refreshExpiresInMs,
    path: '/api/auth/refresh',
  });
}

/**
 * Build the full user response object (used by all auth endpoints).
 * Includes quiz history, linked student codes, and linked user profiles
 * (needed by the frontend messaging system).
 */
async function buildUserResponse(userId) {
  const { rows: [u] } = await db.query(
    `SELECT id, email, role, fname, lname, code, avatar, photo, career,
            parent_email, reminder_time, lang, xp, level, streak, last_study,
            english_level, subject_scores, badges, completed_lessons,
            quests_done, quiz_weak_points, last_quiz_key,
            placement_done, completed_onboard, created_at
     FROM users WHERE id = $1`,
    [userId]
  );
  if (!u) return null;

  const { rows: quizRows } = await db.query(
    `SELECT lesson, title, subject, score, correct, total, date
     FROM quiz_history WHERE user_id = $1 ORDER BY date DESC LIMIT 200`,
    [userId]
  );

  const { rows: linkRows } = await db.query(
    'SELECT student_code FROM student_links WHERE guardian_id = $1',
    [userId]
  );
  const linkedStudents = linkRows.map(r => r.student_code);

  // Linked user profiles for the messaging feature
  let linkedUserProfiles = [];
  if (u.role !== 'student') {
    // Guardian → fetch each linked student's basic profile
    for (const code of linkedStudents) {
      const { rows: [student] } = await db.query(
        `SELECT id, fname, lname, role, code FROM users WHERE code = $1 AND role = 'student'`,
        [code]
      );
      if (student) {
        linkedUserProfiles.push({
          id: student.id,
          fname: student.fname,
          name: `${student.fname} ${student.lname}`.trim(),
          role: student.role,
          code: student.code,
          linkedStudents: [student.code],
        });
      }
    }
  } else if (u.code) {
    // Student → fetch guardians who link this student
    const { rows: guardians } = await db.query(
      `SELECT u.id, u.fname, u.lname, u.role, u.code,
              COALESCE(json_agg(sl2.student_code) FILTER (WHERE sl2.student_code IS NOT NULL), '[]') AS linked_students
       FROM users u
       JOIN student_links sl ON sl.guardian_id = u.id
       LEFT JOIN student_links sl2 ON sl2.guardian_id = u.id
       WHERE sl.student_code = $1
       GROUP BY u.id, u.fname, u.lname, u.role, u.code`,
      [u.code]
    );
    linkedUserProfiles = guardians.map(g => ({
      id: g.id,
      fname: g.fname,
      name: `${g.fname} ${g.lname}`.trim(),
      role: g.role,
      code: g.code,
      linkedStudents: Array.isArray(g.linked_students) ? g.linked_students : [],
    }));
  }

  return {
    id: u.id,
    email: u.email,
    role: u.role,
    fname: u.fname,
    lname: u.lname,
    name: `${u.fname} ${u.lname}`.trim(),
    code: u.code,
    avatar: u.avatar,
    photo: u.photo,
    career: u.career,
    parentEmail: u.parent_email,
    reminderTime: u.reminder_time,
    lang: u.lang,
    xp: u.xp,
    level: u.level,
    streak: u.streak,
    lastStudy: u.last_study,
    englishLevel: u.english_level,
    subjectScores: u.subject_scores || {},
    badges: u.badges || [],
    completedLessons: u.completed_lessons || [],
    questsDone: u.quests_done || [],
    quizWeakPoints: u.quiz_weak_points || {},
    lastQuizKey: u.last_quiz_key || null,
    placementDone: u.placement_done,
    completedOnboard: u.completed_onboard,
    linkedStudents,
    linkedUserProfiles,
    quizHistory: quizRows.map(q => ({
      lesson: q.lesson,
      title: q.title,
      subject: q.subject,
      score: parseFloat(q.score),
      correct: q.correct,
      total: q.total,
      date: q.date,
    })),
    createdAt: u.created_at,
  };
}

// ── POST /api/auth/register ──────────────────────────────────────────

router.post('/register', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('fname').trim().isLength({ min: 1, max: 100 }).escape(),
  body('lname').trim().isLength({ max: 100 }).escape().optional({ checkFalsy: true }),
  body('role').isIn(['student', 'parent', 'tutor']),
  body('career').optional().trim().isLength({ max: 200 }).escape(),
  body('parentEmail').optional().isEmail().normalizeEmail(),
  body('studentCode').optional().trim().isLength({ max: 20 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  const { email, password, fname, lname = '', role, career = '', parentEmail = '', studentCode } = req.body;

  try {
    const { rows: existing } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.length > 0) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

    // Ensure unique code
    let code;
    do {
      code = genCode(fname);
      const { rows } = await db.query('SELECT id FROM users WHERE code = $1', [code]);
      if (rows.length === 0) break;
    } while (true); // eslint-disable-line no-constant-condition

    const { rows: [newUser] } = await db.query(
      `INSERT INTO users (email, password_hash, role, fname, lname, code, career, parent_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [email, passwordHash, role, fname, lname, code, career, parentEmail]
    );

    if (role !== 'student' && studentCode) {
      const normalizedCode = studentCode.toUpperCase();
      await db.query(
        'INSERT INTO student_links (guardian_id, student_code) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [newUser.id, normalizedCode]
      );
    }

    const accessToken = generateAccessToken(newUser.id, role);
    const rawRefresh = generateRefreshToken();
    await storeRefreshToken(newUser.id, rawRefresh);
    setRefreshCookie(res, rawRefresh);

    const user = await buildUserResponse(newUser.id);
    res.status(201).json({ accessToken, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────────

router.post('/login', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input' });

  const { email, password } = req.body;
  try {
    const { rows: [u] } = await db.query(
      'SELECT id, role, password_hash FROM users WHERE email = $1',
      [email]
    );
    // Constant-time comparison protects against user enumeration
    const validPassword = u && await bcrypt.compare(password, u.password_hash);
    if (!u || !validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const accessToken = generateAccessToken(u.id, u.role);
    const rawRefresh = generateRefreshToken();
    await storeRefreshToken(u.id, rawRefresh);
    setRefreshCookie(res, rawRefresh);

    const user = await buildUserResponse(u.id);
    res.json({ accessToken, user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /api/auth/refresh ───────────────────────────────────────────

router.post('/refresh', async (req, res) => {
  const rawToken = req.cookies?.refreshToken;
  if (!rawToken) return res.status(401).json({ error: 'No refresh token' });

  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  try {
    const { rows: [rt] } = await db.query(
      `SELECT id, user_id FROM refresh_tokens
       WHERE token_hash = $1 AND expires_at > NOW()`,
      [hash]
    );
    if (!rt) return res.status(401).json({ error: 'Invalid or expired refresh token' });

    const { rows: [u] } = await db.query(
      'SELECT id, role FROM users WHERE id = $1',
      [rt.user_id]
    );
    if (!u) return res.status(401).json({ error: 'User not found' });

    // Rotate: delete old, issue new
    await db.query('DELETE FROM refresh_tokens WHERE id = $1', [rt.id]);
    const accessToken = generateAccessToken(u.id, u.role);
    const rawRefresh = generateRefreshToken();
    await storeRefreshToken(u.id, rawRefresh);
    setRefreshCookie(res, rawRefresh);

    const user = await buildUserResponse(u.id);
    res.json({ accessToken, user });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// ── POST /api/auth/logout ────────────────────────────────────────────

router.post('/logout', async (req, res) => {
  const rawToken = req.cookies?.refreshToken;
  if (rawToken) {
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hash]).catch(() => {});
  }
  res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
  res.json({ success: true });
});

// ── POST /api/auth/demo/:role ────────────────────────────────────────

router.post('/demo/:role', authLimiter, async (req, res) => {
  const { role } = req.params;
  if (!['student', 'parent', 'tutor'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const demoEmail = `demo_${role}@stemacademy.internal`;
  try {
    let { rows: [u] } = await db.query(
      'SELECT id, role FROM users WHERE email = $1',
      [demoEmail]
    );

    if (!u) {
      const profiles = {
        student: { fname: 'Amina', lname: 'Feudjio', code: 'AMI-7842' },
        parent:  { fname: 'Marie', lname: 'Feudjio', code: null },
        tutor:   { fname: 'Prof.', lname: 'Ngono',   code: null },
      };
      const { fname, lname } = profiles[role];
      const passwordHash = await bcrypt.hash(
        crypto.randomBytes(32).toString('hex'),
        config.bcryptRounds
      );
      let code = profiles[role].code || genCode(fname);
      if (!profiles[role].code) {
        while (true) { // eslint-disable-line no-constant-condition
          const { rows } = await db.query('SELECT id FROM users WHERE code = $1', [code]);
          if (rows.length === 0) break;
          code = genCode(fname);
        }
      } else {
        // Handle conflict for demo student code
        const { rows } = await db.query('SELECT id FROM users WHERE code = $1', [code]);
        if (rows.length > 0) code = genCode(fname);
      }

      const { rows: [created] } = await db.query(
        `INSERT INTO users
           (email, password_hash, role, fname, lname, code, career,
            xp, level, streak, english_level,
            badges, completed_lessons, subject_scores,
            placement_done, completed_onboard)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING id, role`,
        [demoEmail, passwordHash, role, fname, lname, code,
         'Ingénieure / Engineer',
         420, 4, 7, 18,
         JSON.stringify(['first', 'streak3', 'math']),
         JSON.stringify(['m1', 'm2', 'm3', 'p1', 'p2', 'c1', 'e1']),
         JSON.stringify({ math: 88, phys: 80, chem: 67, ela: 55, sci: 72 }),
         true, true]
      );
      u = created;

      // Demo quiz history
      const quizzes = [
        ['q_newton',    "Newton's Laws",         'phys', 80,  4, 5],
        ['q_math_eq',   'Equations & Ineq.',      'math', 100, 5, 5],
        ['q_chem_atoms','Atoms & Molecules',      'chem', 67,  2, 3],
      ];
      for (const [lesson, title, subject, score, correct, total] of quizzes) {
        await db.query(
          `INSERT INTO quiz_history (user_id, lesson, title, subject, score, correct, total)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [u.id, lesson, title, subject, score, correct, total]
        );
      }

      if (role !== 'student') {
        const studentCode = profiles.student.code;
        await db.query(
          'INSERT INTO student_links (guardian_id, student_code) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [u.id, studentCode]
        );
      }
    }

    const accessToken = generateAccessToken(u.id, u.role);
    const rawRefresh = generateRefreshToken();
    await storeRefreshToken(u.id, rawRefresh);
    setRefreshCookie(res, rawRefresh);

    const user = await buildUserResponse(u.id);
    res.json({ accessToken, user });
  } catch (err) {
    console.error('Demo login error:', err);
    res.status(500).json({ error: 'Demo login failed' });
  }
});

module.exports = router;
