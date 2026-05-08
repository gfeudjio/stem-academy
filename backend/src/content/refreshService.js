'use strict';

const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const { getApprovedSources } = require('./approvedSources');

let _schedulerStarted = false;
let _refreshInProgress = false;
const MAX_QUESTIONS_PER_TEST = 100;
const MAX_SUMMARY_TOPICS = 20;
const MAX_ERROR_MESSAGE_LENGTH = 1000;

function toTopic(value) {
  return String(value || '').trim().slice(0, 100);
}

function toTitle(value) {
  return String(value || '').trim().slice(0, 200);
}

function toExternalId(item, prefix) {
  const provided = String(item?.id || '').trim().slice(0, 100);
  if (provided) return provided;
  return `${prefix}-${crypto.createHash('sha256').update(JSON.stringify(item || {})).digest('hex').slice(0, 16)}`;
}

function validateIncomingItem(type, item) {
  if (!item || typeof item !== 'object') return null;
  const title = toTitle(item.title);
  const topic = toTopic(item.topic);
  if (!title || !topic) return null;
  const normalized = {
    externalId: toExternalId(item, type),
    title,
    topic,
    payload: item,
  };
  if (type === 'test') {
    const questionCount = Array.isArray(item.questions) ? item.questions.length : 0;
    if (questionCount < 1 || questionCount > MAX_QUESTIONS_PER_TEST) return null;
  }
  return normalized;
}

async function fetchSourcePayload(sourceUrl) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), config.contentRefreshFetchTimeoutMs);
  try {
    const res = await fetch(sourceUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    const parsed = await res.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (err) {
    console.warn('[content-refresh] source fetch failed:', sourceUrl, err?.name || 'Error');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function upsertContentItems(type, items, sourceUrl) {
  let upserted = 0;
  let published = 0;
  const topics = new Set();
  for (const item of items || []) {
    const valid = validateIncomingItem(type, item);
    if (!valid) continue;
    topics.add(valid.topic);
    const publishDirectly = type === 'test';
    await db.query(
      `INSERT INTO content_library
         (type, external_id, source_url, title, topic, payload, published, published_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, $6::jsonb, $7, CASE WHEN $7 THEN NOW() ELSE NULL END, NOW())
       ON CONFLICT (type, external_id)
       DO UPDATE SET
         source_url = EXCLUDED.source_url,
         title = EXCLUDED.title,
         topic = EXCLUDED.topic,
         payload = EXCLUDED.payload,
         published = CASE WHEN EXCLUDED.type = 'test' THEN TRUE ELSE content_library.published END,
         published_at = CASE
           WHEN EXCLUDED.type = 'test' AND content_library.published = FALSE THEN NOW()
           ELSE content_library.published_at
         END,
         updated_at = NOW()`,
      [type, valid.externalId, sourceUrl, valid.title, valid.topic, JSON.stringify(valid.payload), publishDirectly]
    );
    upserted += 1;
    if (publishDirectly) published += 1;
  }
  return { upserted, published, topics: [...topics] };
}

function summarizeSource(sourceUrl, courses, questions, tests) {
  const topics = [...new Set([...courses.topics, ...questions.topics, ...tests.topics])];
  return {
    source: sourceUrl,
    coursesUpdated: courses.upserted,
    questionsUpdated: questions.upserted,
    testsUpdated: tests.upserted,
    testsPublished: tests.published,
    topics,
  };
}

function buildInstructorSummary(sourceSummaries) {
  const totals = sourceSummaries.reduce((acc, s) => {
    acc.coursesUpdated += s.coursesUpdated;
    acc.questionsUpdated += s.questionsUpdated;
    acc.testsUpdated += s.testsUpdated;
    acc.testsPublished += s.testsPublished;
    s.topics.forEach(t => acc.topics.add(t));
    return acc;
  }, {
    coursesUpdated: 0,
    questionsUpdated: 0,
    testsUpdated: 0,
    testsPublished: 0,
    topics: new Set(),
  });
  return {
    coursesUpdated: totals.coursesUpdated,
    questionsUpdated: totals.questionsUpdated,
    testsUpdated: totals.testsUpdated,
    testsPublished: totals.testsPublished,
    topics: [...totals.topics].slice(0, MAX_SUMMARY_TOPICS),
    sources: sourceSummaries,
  };
}

function summaryText(summary) {
  const topics = summary.topics.length ? summary.topics.join(', ') : 'general';
  return `Weekly content refresh completed. Courses: ${summary.coursesUpdated}, questions: ${summary.questionsUpdated}, tests updated: ${summary.testsUpdated}, tests published: ${summary.testsPublished}. Topics: ${topics}.`;
}

async function notifyInstructors(summary) {
  const { rows: instructors } = await db.query(
    `SELECT id, email
     FROM users
     WHERE role IN ('tutor', 'admin')
     ORDER BY created_at ASC`
  );
  const title = 'Weekly content refresh completed';
  const body = summaryText(summary);

  for (const instructor of instructors) {
    const { rows: [notification] } = await db.query(
      `INSERT INTO instructor_notifications
         (user_id, title, body, summary_json, channel, email_sent, created_at)
       VALUES ($1, $2, $3, $4::jsonb, 'content_refresh', FALSE, NOW())
       RETURNING id`,
      [instructor.id, title, body, JSON.stringify(summary)]
    );
    instructor.notificationId = notification?.id || null;
  }

  if (!config.instructorEmailWebhookUrl || instructors.length === 0) {
    return { delivered: 0, queued: 0 };
  }

  let delivered = 0;
  for (const instructor of instructors) {
    try {
      const resp = await fetch(config.instructorEmailWebhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          to: instructor.email,
          subject: title,
          text: body,
          summary,
        }),
      });
      if (resp.ok) {
        delivered += 1;
        await db.query(
          `UPDATE instructor_notifications
           SET email_sent = TRUE
           WHERE id = $1`,
          [instructor.notificationId]
        ).catch((err) => {
          console.warn('[content-refresh] failed to mark email_sent:', err?.message || err);
        });
      }
    } catch {
      console.warn('[content-refresh] instructor email webhook delivery failed for', instructor.email);
    }
  }
  return { delivered, queued: instructors.length };
}

async function runContentRefresh(trigger = 'manual') {
  if (_refreshInProgress) return { skipped: true, reason: 'refresh_already_running' };
  _refreshInProgress = true;
  const { rows: [runRow] } = await db.query(
    `INSERT INTO content_refresh_runs (triggered_by, status, started_at)
     VALUES ($1, 'running', NOW())
     RETURNING id`,
    [trigger]
  );
  try {
    const approvedSources = getApprovedSources();
    const sourceSummaries = [];
    for (const sourceUrl of approvedSources) {
      const payload = await fetchSourcePayload(sourceUrl);
      if (!payload) continue;
      const courses = await upsertContentItems('course', payload.courses, sourceUrl);
      const questions = await upsertContentItems('question', payload.questions, sourceUrl);
      const tests = await upsertContentItems('test', payload.tests, sourceUrl);
      sourceSummaries.push(summarizeSource(sourceUrl, courses, questions, tests));
    }

    const summary = buildInstructorSummary(sourceSummaries);
    const email = await notifyInstructors(summary);

    await db.query(
      `UPDATE content_refresh_runs
       SET status = 'success', completed_at = NOW(), summary_json = $2::jsonb
       WHERE id = $1`,
      [runRow.id, JSON.stringify({ ...summary, email })]
    );
    return { ok: true, summary: { ...summary, email } };
  } catch (err) {
    await db.query(
      `UPDATE content_refresh_runs
       SET status = 'failed', completed_at = NOW(), error_summary = $2
       WHERE id = $1`,
      [runRow.id, String(err?.message || 'Unknown refresh error').slice(0, MAX_ERROR_MESSAGE_LENGTH)]
    ).catch(() => {});
    throw err;
  } finally {
    _refreshInProgress = false;
  }
}

async function hasSuccessfulRunThisWeek() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const { rows: [row] } = await db.query(
    `SELECT id
     FROM content_refresh_runs
     WHERE status = 'success' AND completed_at >= $1
     ORDER BY completed_at DESC
     LIMIT 1`,
    [start.toISOString()]
  );
  return Boolean(row);
}

async function checkAndRunScheduledRefresh() {
  if (!config.contentRefreshEnabled) return;
  const now = new Date();
  const isSunday = now.getUTCDay() === 0;
  const scheduledTime = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    config.contentRefreshSundayHourUtc,
    config.contentRefreshSundayMinuteUtc,
    0,
    0
  ));
  if (!isSunday || now < scheduledTime) return;
  if (await hasSuccessfulRunThisWeek()) return;
  await runContentRefresh('scheduled').catch((err) => {
    console.error('[content-refresh] scheduled refresh failed:', err);
  });
}

function startContentRefreshScheduler() {
  if (_schedulerStarted || !config.contentRefreshEnabled) return;
  _schedulerStarted = true;
  const pollMs = Math.max(1, config.contentRefreshPollMinutes) * 60 * 1000;
  setInterval(() => {
    checkAndRunScheduledRefresh().catch((err) => {
      console.error('[content-refresh] schedule check failed:', err);
    });
  }, pollMs);
  checkAndRunScheduledRefresh().catch((err) => {
    console.error('[content-refresh] initial schedule check failed:', err);
  });
}

async function getLatestRefreshRun() {
  const { rows: [row] } = await db.query(
    `SELECT id, triggered_by, status, started_at, completed_at, error_summary, summary_json
     FROM content_refresh_runs
     ORDER BY started_at DESC
     LIMIT 1`
  );
  return row || null;
}

module.exports = {
  startContentRefreshScheduler,
  runContentRefresh,
  getLatestRefreshRun,
};
