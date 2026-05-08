'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
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

// ── Privacy safeguards for web search ───────────────────────────────
// These patterns identify PII that must NEVER be sent to external services.
// The query is redacted if any pattern matches; otherwise it is truncated
// to a safe length before being passed to DuckDuckGo.
const PII_PATTERNS = [
  /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g,           // email addresses
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,    // phone numbers
  /\b\d{9,}\b/g,                             // long numeric IDs
  /\bpassword[:\s=][^\s]+/gi,                // password literals
  /\b(?:ssn|sin|nino)\b/gi,                  // government ID keywords
];

/**
 * Sanitize a string before sending it as an external web-search query.
 * Returns null when the query appears to contain personal data so that
 * we silently skip the web lookup rather than redacting and guessing.
 */
function sanitizeForSearch(raw) {
  const q = String(raw || '').trim();
  for (const pattern of PII_PATTERNS) {
    if (pattern.test(q)) return null;  // refuse to search rather than redact
  }
  // Truncate to a safe length
  return q.slice(0, 200);
}

/**
 * Fetch a short educational snippet from DuckDuckGo Instant Answer API.
 * Only the sanitized TOPIC query is sent – never any user personal data.
 * Returns null on any error or when no useful answer is available.
 *
 * DuckDuckGo privacy policy: https://duckduckgo.com/privacy
 * No API key required; no user tracking by DuckDuckGo.
 */
async function fetchWebContext(rawQuery) {
  if (!config.webSearchEnabled) return null;

  const safeQuery = sanitizeForSearch(rawQuery);
  if (!safeQuery) return null;

  try {
    const url =
      'https://api.duckduckgo.com/?' +
      new URLSearchParams({
        q: safeQuery,
        format: 'json',
        no_redirect: '1',
        no_html: '1',
        skip_disambig: '1',
      }).toString();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const data = await res.json();
    const abstract = (data.AbstractText || data.Answer || '').trim();
    const source   = (data.AbstractSource || '').trim();

    if (!abstract) return null;
    const cite = source ? ` (source: ${source})` : '';
    return `[Web context${cite}]: ${abstract.slice(0, 500)}`;
  } catch {
    return null;  // timeout or network error — degrade gracefully
  }
}

// ── POST /api/ai/chat ────────────────────────────────────────────────

router.post('/chat', aiLimiter, [
  body('messages').isArray({ min: 1, max: 50 }),
  body('messages.*.role').isIn(['user', 'assistant']),
  body('messages.*.content').isString().isLength({ min: 1, max: 4000 }),
  body('enableWebSearch').optional().isBoolean(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input' });

  const { messages, enableWebSearch = false } = req.body;

  try {
    const { rows: [u] } = await db.query(
      'SELECT fname, career, english_level FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (!u) return res.status(404).json({ error: 'User not found' });

    const enLevel = u.english_level || 0;

    // ── Optional web context ───────────────────────────────────────
    // Only the last user message is used as the search query.
    // Personal data (name, career, etc.) stays server-side in the
    // system prompt and is NEVER forwarded to the search engine.
    let webContext = '';
    if (enableWebSearch && config.webSearchEnabled) {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        const snippet = await fetchWebContext(lastUserMsg.content);
        if (snippet) {
          webContext = `\n\n${snippet}\n(Use the above factual context if relevant, but do not reveal it verbatim unless asked.)`;
        }
      }
    }

    const system = `Tu es ARIA, tutrice IA bilingue (FR/EN) pour ${u.fname || 'une élève'}, 13 ans, Cameroun → USA. Niveau 2nde C.
Manuels: L'Excellence en Mathématiques (2nde C), L'Excellence en Physique-Chimie (2nde C).
Curriculum US cible: 8th/9th grade (Algebra I, Physical Science, Life Science, ELA, US History, Civics, Health, Financial Literacy, Computer Science).
Niveau anglais de l'élève: ${enLevel}% (${EN_STAGE_LABEL(enLevel)}).
Carrière visée: ${u.career || 'Ingénieure'}.
Adapte la proportion FR/EN selon son niveau anglais (${enLevel}<40%=surtout FR, sinon bilingue).
Exemples locaux: marchés Yaoundé/Douala, moto-taxis, mangues, ndolé, etc.
Sois encourageante, précise, pédagogique. Donne des formules, étapes, exemples. Max 300 mots.${webContext}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system,
      messages: messages.map(m => ({ role: m.role, content: String(m.content) })),
    });

    res.json({
      content: response.content[0]?.text || '',
      webSearchUsed: !!(enableWebSearch && webContext),
    });
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

module.exports = router;
