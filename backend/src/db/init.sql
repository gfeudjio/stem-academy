-- STEM Academy — database schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email            VARCHAR(255) UNIQUE NOT NULL,
  password_hash    VARCHAR(255) NOT NULL,
  role             VARCHAR(20)  NOT NULL CHECK (role IN ('student', 'parent', 'tutor', 'admin')),
  fname            VARCHAR(100) NOT NULL,
  lname            VARCHAR(100) NOT NULL DEFAULT '',
  code             VARCHAR(20)  UNIQUE,
  avatar           VARCHAR(50)  NOT NULL DEFAULT '👩🏾‍🔬',
  photo            TEXT         NOT NULL DEFAULT '',
  career           VARCHAR(200) NOT NULL DEFAULT '',
  parent_email     VARCHAR(255) NOT NULL DEFAULT '',
  reminder_time    VARCHAR(10)  NOT NULL DEFAULT '18:00',
  lang             VARCHAR(5)   NOT NULL DEFAULT 'fr',
  xp               INTEGER      NOT NULL DEFAULT 0,
  level            INTEGER      NOT NULL DEFAULT 1,
  streak           INTEGER      NOT NULL DEFAULT 0,
  last_study       DATE,
  english_level    INTEGER      NOT NULL DEFAULT 0 CHECK (english_level BETWEEN 0 AND 100),
  subject_scores   JSONB        NOT NULL DEFAULT '{}',
  badges           JSONB        NOT NULL DEFAULT '[]',
  completed_lessons JSONB       NOT NULL DEFAULT '[]',
  quests_done      JSONB        NOT NULL DEFAULT '[]',
  quiz_weak_points JSONB        NOT NULL DEFAULT '{}',
  last_quiz_key    VARCHAR(100),
  placement_done   BOOLEAN      NOT NULL DEFAULT FALSE,
  completed_onboard BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Student ↔ Guardian links ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_links (
  guardian_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_code VARCHAR(20) NOT NULL,
  PRIMARY KEY (guardian_id, student_code)
);

-- ── Quiz history ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_history (
  id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson  VARCHAR(100) NOT NULL,
  title   VARCHAR(200) NOT NULL DEFAULT '',
  subject VARCHAR(50)  NOT NULL DEFAULT '',
  score   DECIMAL(5,2) NOT NULL DEFAULT 0,
  correct INTEGER      NOT NULL DEFAULT 0,
  total   INTEGER      NOT NULL DEFAULT 1,
  date    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Messages ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text         TEXT        NOT NULL,
  ts           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Refresh tokens ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Internet content refresh ─────────────────────────────────────────
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

-- ── Indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email         ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_code          ON users(code);
CREATE INDEX IF NOT EXISTS idx_quiz_history_user   ON quiz_history(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender     ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient  ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_content_refresh_runs_started ON content_refresh_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_library_type_topic ON content_library(type, topic);
CREATE INDEX IF NOT EXISTS idx_instructor_notifications_user_created ON instructor_notifications(user_id, created_at DESC);
