'use strict';

const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimit');
const config = require('../config');

const router = express.Router();
router.use(requireAuth);

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

const EN_STAGE_LABEL = (level) => {
  if (level < 20) return '🇫🇷 Francophone';
  if (level < 40) return '🌱 Débutant EN';
  if (level < 60) return '⚡ Initié EN';
  if (level < 80) return '🚀 Intermédiaire';
  return '🌟 Bilingue STEM';
};

const ROLE_CAN_REQUEST_CONTENT_UPDATES = new Set(['tutor', 'admin']);

function sanitizeText(value, max = 280) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeQuestionText(text) {
  return sanitizeText(text, 400).toLowerCase();
}

function isAllowedSourceUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return config.contentSourceAllowlist.some((pattern) => {
      if (pattern.startsWith('*.')) {
        return host === pattern.slice(2) || host.endsWith(pattern.slice(1));
      }
      return host === pattern;
    });
  } catch {
    return false;
  }
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = raw.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function validateStructuredPack(pack) {
  const title = sanitizeText(pack?.title, 140);
  const questions = Array.isArray(pack?.questions) ? pack.questions : [];
  const out = [];
  const seen = new Set();
  for (const q of questions) {
    const text = sanitizeText(q?.text, 240);
    const choicesRaw = Array.isArray(q?.choices) ? q.choices : [];
    const choices = choicesRaw.map((c) => sanitizeText(c, 120)).filter(Boolean).slice(0, 4);
    const correct = Number.isInteger(q?.correct) ? q.correct : parseInt(q?.correct, 10);
    const ok = sanitizeText(q?.ok, 280);
    const bad = sanitizeText(q?.bad, 280);

    if (text.length < 8 || choices.length !== 4 || Number.isNaN(correct) || correct < 0 || correct > 3) {
      continue;
    }
    const signature = normalizeQuestionText(text);
    if (!signature || seen.has(signature)) continue;
    seen.add(signature);
    out.push({ text, choices, correct, ok, bad });
  }

  if (out.length < 3) return null;
  return {
    title: title || 'Internet Supplement',
    questions: out.slice(0, 10),
  };
}

async function fetchSourceMaterial(topic, sourceUrl) {
  const timeoutMs = Math.max(2000, config.contentFetchTimeoutMs);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    if (sourceUrl) {
      if (!isAllowedSourceUrl(sourceUrl)) {
        throw new Error('Source URL host not allowed');
      }
      const response = await fetch(sourceUrl, {
        signal: abort.signal,
        headers: { 'User-Agent': 'STEMAcademyContentUpdater/1.0' },
      });
      if (!response.ok) {
        throw new Error(`Source fetch failed (${response.status})`);
      }
      const raw = await response.text();
      const clean = sanitizeText(raw, config.contentMaxSourceChars);
      if (clean.length < 120) throw new Error('Fetched source is too short');
      return {
        sourceUrl,
        sourceTitle: topic,
        sourceExcerpt: clean,
      };
    }

    const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`;
    const response = await fetch(wikiUrl, {
      signal: abort.signal,
      headers: { 'User-Agent': 'STEMAcademyContentUpdater/1.0' },
    });
    if (!response.ok) {
      throw new Error(`Wikipedia fetch failed (${response.status})`);
    }
    const payload = await response.json();
    const extract = sanitizeText(payload.extract || '', config.contentMaxSourceChars);
    if (extract.length < 120) throw new Error('Internet source excerpt is too short');
    return {
      sourceUrl: payload?.content_urls?.desktop?.page || wikiUrl,
      sourceTitle: sanitizeText(payload.title || topic, 240),
      sourceExcerpt: extract,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function generateStructuredQuestions(topic, quizKey, sourceExcerpt) {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is required for content updates');
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1400,
    system: `You create safe middle-school educational question packs.
Return JSON only with this exact schema:
{
  "title": "string",
  "questions": [
    {
      "text": "string",
      "choices": ["a","b","c","d"],
      "correct": 0,
      "ok": "string",
      "bad": "string"
    }
  ]
}
Rules:
- 3 to 8 questions.
- No personal data, no profiling, no sexual content, no self-harm content.
- Facts must align with source material.
- Keep language clear for 8th/9th grade learners.
- Avoid markdown and HTML.`,
    messages: [{
      role: 'user',
      content: `Topic: ${topic}
Quiz key: ${quizKey}
Create supplemental questions using ONLY this source excerpt:
${sourceExcerpt}`,
    }],
  });

  const text = response.content?.[0]?.text || '';
  const parsed = extractJsonObject(text);
  const validated = validateStructuredPack(parsed);
  if (!validated) throw new Error('Generated content failed validation');
  return validated;
}

// ── POST /api/ai/chat ────────────────────────────────────────────────

router.post('/chat', aiLimiter, [
  body('messages').isArray({ min: 1, max: 50 }),
  body('messages.*.role').isIn(['user', 'assistant']),
  body('messages.*.content').isString().isLength({ min: 1, max: 4000 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input' });

  const { messages } = req.body;

  try {
    const { rows: [u] } = await db.query(
      'SELECT fname, career, english_level FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (!u) return res.status(404).json({ error: 'User not found' });

    const enLevel = u.english_level || 0;
    const system = `Tu es ARIA, tutrice IA bilingue (FR/EN) pour ${u.fname || 'une élève'}, 13 ans, Cameroun → USA. Niveau 2nde C.
Manuels: L'Excellence en Mathématiques (2nde C), L'Excellence en Physique-Chimie (2nde C).
Curriculum US cible: 8th/9th grade (Algebra I, Physical Science, Life Science, ELA, US History, Civics, Health, Financial Literacy, Computer Science).
Niveau anglais de l'élève: ${enLevel}% (${EN_STAGE_LABEL(enLevel)}).
Carrière visée: ${u.career || 'Ingénieure'}.
Adapte la proportion FR/EN selon son niveau anglais (${enLevel}<40%=surtout FR, sinon bilingue).
Exemples locaux: marchés Yaoundé/Douala, moto-taxis, mangues, ndolé, etc.
Sois encourageante, précise, pédagogique. Donne des formules, étapes, exemples. Max 300 mots.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system,
      messages: messages.map(m => ({ role: m.role, content: String(m.content) })),
    });

    res.json({ content: response.content[0]?.text || '' });
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

// ── GET /api/ai/content-updates?quizKey=q_xxx ────────────────────────

router.get('/content-updates', [
  query('quizKey').trim().isLength({ min: 3, max: 80 }).matches(/^[a-z0-9_:-]+$/i),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input' });

  try {
    const { rows } = await db.query(
      `SELECT id, quiz_key, topic, source_url, source_title, payload, created_at, published_at
       FROM content_updates
       WHERE quiz_key = $1 AND status = 'approved'
       ORDER BY published_at DESC NULLS LAST, created_at DESC
       LIMIT 8`,
      [req.query.quizKey]
    );
    const updates = rows.map((r) => ({
      id: r.id,
      quizKey: r.quiz_key,
      topic: r.topic,
      sourceUrl: r.source_url,
      sourceTitle: r.source_title,
      title: r.payload?.title || 'Internet Supplement',
      questions: Array.isArray(r.payload?.questions) ? r.payload.questions : [],
      createdAt: r.created_at,
      publishedAt: r.published_at,
    }));
    res.json({ updates });
  } catch (err) {
    console.error('GET /ai/content-updates error:', err);
    res.status(500).json({ error: 'Failed to load content updates' });
  }
});

// ── GET /api/ai/content-updates/mine ──────────────────────────────────

router.get('/content-updates/mine', async (req, res) => {
  if (!ROLE_CAN_REQUEST_CONTENT_UPDATES.has(req.user.role)) {
    return res.status(403).json({ error: 'Tutor or admin access required' });
  }
  try {
    const { rows } = await db.query(
      `SELECT id, quiz_key, topic, source_url, source_title, status, created_at, published_at
       FROM content_updates
       WHERE requested_by = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user.userId]
    );
    res.json({
      updates: rows.map((r) => ({
        id: r.id,
        quizKey: r.quiz_key,
        topic: r.topic,
        sourceUrl: r.source_url,
        sourceTitle: r.source_title,
        status: r.status,
        createdAt: r.created_at,
        publishedAt: r.published_at,
      })),
    });
  } catch (err) {
    console.error('GET /ai/content-updates/mine error:', err);
    res.status(500).json({ error: 'Failed to load your content update requests' });
  }
});

// ── POST /api/ai/content-updates/refresh ──────────────────────────────

router.post('/content-updates/refresh', aiLimiter, [
  body('quizKey').trim().isLength({ min: 3, max: 80 }).matches(/^[a-z0-9_:-]+$/i),
  body('topic').trim().isLength({ min: 3, max: 120 }).escape(),
  body('sourceUrl').optional({ checkFalsy: true }).isURL({ protocols: ['https'], require_protocol: true }),
], async (req, res) => {
  if (!ROLE_CAN_REQUEST_CONTENT_UPDATES.has(req.user.role)) {
    return res.status(403).json({ error: 'Tutor or admin access required' });
  }
  if (!config.contentUpdateEnabled) {
    return res.status(503).json({ error: 'Internet content updates are disabled' });
  }
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input' });

  const quizKey = req.body.quizKey;
  const topic = req.body.topic;
  const sourceUrl = req.body.sourceUrl || '';
  const autoApprove = req.user.role === 'admin';

  try {
    const source = await fetchSourceMaterial(topic, sourceUrl);
    const structured = await generateStructuredQuestions(topic, quizKey, source.sourceExcerpt);

    const { rows: [created] } = await db.query(
      `INSERT INTO content_updates
        (quiz_key, topic, source_url, source_title, source_excerpt, payload, status, requested_by, approved_by, published_at)
       VALUES
        ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
       RETURNING id, status, created_at, published_at`,
      [
        quizKey,
        topic,
        source.sourceUrl,
        source.sourceTitle,
        source.sourceExcerpt,
        JSON.stringify(structured),
        autoApprove ? 'approved' : 'pending',
        req.user.userId,
        autoApprove ? req.user.userId : null,
        autoApprove ? new Date() : null,
      ]
    );

    res.status(201).json({
      id: created.id,
      status: created.status,
      questionCount: structured.questions.length,
      sourceUrl: source.sourceUrl,
      sourceTitle: source.sourceTitle,
      createdAt: created.created_at,
      publishedAt: created.published_at,
      note: autoApprove
        ? 'Content update approved and available to students.'
        : 'Content update created and awaiting admin approval.',
    });
  } catch (err) {
    console.error('POST /ai/content-updates/refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh educational content from internet source' });
  }
});

// ── GET /api/ai/content-updates/moderation ────────────────────────────

router.get('/content-updates/moderation', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  try {
    const { rows } = await db.query(
      `SELECT cu.id, cu.quiz_key, cu.topic, cu.source_url, cu.source_title,
              cu.status, cu.created_at, cu.published_at,
              rq.fname AS requester_fname, rq.lname AS requester_lname
       FROM content_updates cu
       JOIN users rq ON rq.id = cu.requested_by
       ORDER BY cu.created_at DESC
       LIMIT 50`
    );
    res.json({
      updates: rows.map((r) => ({
        id: r.id,
        quizKey: r.quiz_key,
        topic: r.topic,
        sourceUrl: r.source_url,
        sourceTitle: r.source_title,
        status: r.status,
        requesterName: `${r.requester_fname || ''} ${r.requester_lname || ''}`.trim() || 'Unknown',
        createdAt: r.created_at,
        publishedAt: r.published_at,
      })),
    });
  } catch (err) {
    console.error('GET /ai/content-updates/moderation error:', err);
    res.status(500).json({ error: 'Failed to load moderation queue' });
  }
});

// ── PATCH /api/ai/content-updates/:id/status ──────────────────────────

router.patch('/content-updates/:id/status', [
  param('id').isUUID(),
  body('status').isIn(['approved', 'rejected']),
], async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input' });

  const { id } = req.params;
  const { status } = req.body;
  try {
    const { rows: [updated] } = await db.query(
      `UPDATE content_updates
       SET status = $2,
           approved_by = $3,
           published_at = CASE WHEN $2 = 'approved' THEN NOW() ELSE NULL END
       WHERE id = $1
       RETURNING id, status, published_at`,
      [id, status, req.user.userId]
    );
    if (!updated) return res.status(404).json({ error: 'Content update not found' });
    res.json({
      id: updated.id,
      status: updated.status,
      publishedAt: updated.published_at,
    });
  } catch (err) {
    console.error('PATCH /ai/content-updates/:id/status error:', err);
    res.status(500).json({ error: 'Failed to update moderation status' });
  }
});

module.exports = router;
