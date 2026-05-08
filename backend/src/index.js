'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { apiLimiter } = require('./middleware/rateLimit');
const { startWeeklyRefreshScheduler } = require('./content/refreshService');

const runMigrations = require('./db/migrate');
const app = express();

// ── Reverse-proxy trust ───────────────────────────────────────────────
// Synology's built-in reverse proxy sits in front of nginx which sits
// in front of this app — that is two hops.  Telling Express to trust
// two proxy layers ensures:
//   • req.ip        = real client IP   (correct rate-limit keying)
//   • req.protocol  = https            (secure cookie flag works)
//   • X-Forwarded-* headers are used   (instead of the internal Docker IP)
app.set('trust proxy', 2);

// ── Security headers ─────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // CSP is handled by the nginx frontend
}));

// ── CORS ─────────────────────────────────────────────────────────────
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsing & cookies ───────────────────────────────────────────
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());

// ── Global rate limit ────────────────────────────────────────────────
app.use(apiLimiter);

// ── Routes ───────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/users',    require('./routes/users'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/ai',       require('./routes/ai'));
app.use('/api/admin',    require('./routes/admin'));

// ── Health check ─────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ── 404 catch-all ────────────────────────────────────────────────────
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Start ─────────────────────────────────────────────────────────────
runMigrations()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`[STEM Academy API] Listening on port ${config.port} (${config.nodeEnv})`);
    });
    startWeeklyRefreshScheduler();
  })
  .catch(err => {
    console.error('[STEM Academy API] Migration failed, aborting startup:', err);
    process.exit(1);
  });
