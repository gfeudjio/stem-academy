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

  // ── 2. Internet-backed educational content updates tables ───────────
  await db.query(`
    CREATE TABLE IF NOT EXISTS content_updates (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      quiz_key       VARCHAR(80) NOT NULL,
      topic          VARCHAR(120) NOT NULL,
      source_url     TEXT        NOT NULL,
      source_title   VARCHAR(240) NOT NULL DEFAULT '',
      source_excerpt TEXT        NOT NULL DEFAULT '',
      payload        JSONB       NOT NULL,
      status         VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      requested_by   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      approved_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      published_at   TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_content_updates_quiz_status ON content_updates(quiz_key, status);
    CREATE INDEX IF NOT EXISTS idx_content_updates_created_at  ON content_updates(created_at DESC);
  `);

  // ── 3. Admin account ─────────────────────────────────────────────────
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
