'use strict';

const bcrypt = require('bcryptjs');
const db = require('./index');
const config = require('../config');

/**
 * Runs on every API startup.
 * 1. Ensures the users.role constraint includes 'admin' (safe to run on an
 *    existing database that was created before the admin role was added).
 * 2. If ADMIN_EMAIL is set in the environment, creates or promotes that user
 *    to the admin role.  If ADMIN_PASSWORD is also set, it is used as the
 *    password when creating a brand-new admin account.
 */
async function runMigrations() {
  // ── 1. Role constraint ───────────────────────────────────────────────
  await db.query(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('student', 'parent', 'tutor', 'admin'));
  `);

  await db.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS quiz_weak_points JSONB NOT NULL DEFAULT '{}';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_quiz_key VARCHAR(100);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS content_library (
      id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      type        VARCHAR(20)  NOT NULL CHECK (type IN ('course', 'question', 'test')),
      external_id VARCHAR(100) NOT NULL,
      source_url  TEXT         NOT NULL,
      title       VARCHAR(200) NOT NULL,
      topic       VARCHAR(100) NOT NULL,
      payload     JSONB        NOT NULL DEFAULT '{}',
      published   BOOLEAN      NOT NULL DEFAULT FALSE,
      published_at TIMESTAMPTZ,
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE (type, external_id)
    );
    CREATE TABLE IF NOT EXISTS content_refresh_runs (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      triggered_by  VARCHAR(120) NOT NULL,
      status        VARCHAR(20)  NOT NULL CHECK (status IN ('running', 'success', 'failed')),
      started_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      completed_at  TIMESTAMPTZ,
      summary_json  JSONB,
      error_summary VARCHAR(1000)
    );
    CREATE TABLE IF NOT EXISTS instructor_notifications (
      id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title        VARCHAR(200) NOT NULL,
      body         TEXT         NOT NULL,
      summary_json JSONB        NOT NULL DEFAULT '{}',
      channel      VARCHAR(40)  NOT NULL DEFAULT 'content_refresh',
      email_sent   BOOLEAN      NOT NULL DEFAULT FALSE,
      created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      read_at      TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_content_refresh_runs_started ON content_refresh_runs(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_content_library_type_topic ON content_library(type, topic);
    CREATE INDEX IF NOT EXISTS idx_instructor_notifications_user_created ON instructor_notifications(user_id, created_at DESC);
  `);

  // ── 2. Admin account ─────────────────────────────────────────────────
  const adminEmail    = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminFname    = process.env.ADMIN_FNAME || 'Admin';

  if (!adminEmail) return;

  const { rows: [existing] } = await db.query(
    'SELECT id, role FROM users WHERE email = $1',
    [adminEmail]
  );

  if (existing) {
    if (existing.role !== 'admin') {
      await db.query('UPDATE users SET role = $1 WHERE id = $2', ['admin', existing.id]);
      console.log(`[migrate] Promoted ${adminEmail} to admin`);
    }
  } else {
    if (!adminPassword) {
      console.warn('[migrate] ADMIN_EMAIL set but ADMIN_PASSWORD is missing — skipping admin creation');
      return;
    }
    const hash = await bcrypt.hash(adminPassword, config.bcryptRounds);
    await db.query(
      `INSERT INTO users (email, password_hash, role, fname, lname)
       VALUES ($1, $2, 'admin', $3, '')`,
      [adminEmail, hash, adminFname]
    );
    console.log(`[migrate] Created admin account for ${adminEmail}`);
  }
}

module.exports = runMigrations;
