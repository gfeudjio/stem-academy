'use strict';

const db = require('../db');
const config = require('../config');
const { getSourcePolicyMatch } = require('./sourcePolicy');

// Requirement is explicit EST (UTC-05:00), not locale-aware Eastern time.
const FIXED_EST_OFFSET_MS = 5 * 60 * 60 * 1000;
const TARGET_WEEKDAY_EST = 0; // Sunday
const TARGET_HOUR_EST = 23; // 11:00 PM EST
const MIN_SCHEDULE_DELAY_MS = 60 * 1000;

function toInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function cleanText(value, fallback, maxLen = 120) {
  const text = String(value || fallback || '').trim();
  if (!text) return fallback;
  return text.slice(0, maxLen);
}

function summarizeRefresh(payload = {}) {
  const addedQuestions = Array.isArray(payload.addedQuestions) ? payload.addedQuestions : [];
  const addedMaterials = Array.isArray(payload.addedMaterials) ? payload.addedMaterials : [];

  const perSubject = {};
  const perTopic = {};
  const materialByType = {};
  const allowedSources = {};
  const blockedSources = [];

  for (const q of addedQuestions) {
    if (q.sourceUrl) {
      const sourceCheck = getSourcePolicyMatch(q.sourceUrl);
      if (sourceCheck.allowed) {
        allowedSources[sourceCheck.hostname] = sourceCheck.sourceLabel;
      } else {
        blockedSources.push(String(q.sourceUrl));
        continue;
      }
    }

    const count = Math.max(0, toInt(q.count || 1));
    const subject = cleanText(q.subject, 'Unknown');
    const topic = cleanText(q.topic, 'General');
    perSubject[subject] = (perSubject[subject] || 0) + count;
    perTopic[topic] = (perTopic[topic] || 0) + count;
  }

  for (const m of addedMaterials) {
    if (m.sourceUrl) {
      const sourceCheck = getSourcePolicyMatch(m.sourceUrl);
      if (sourceCheck.allowed) {
        allowedSources[sourceCheck.hostname] = sourceCheck.sourceLabel;
      } else {
        blockedSources.push(String(m.sourceUrl));
        continue;
      }
    }

    const count = Math.max(0, toInt(m.count || 1));
    const type = cleanText(m.type, 'material').toLowerCase();
    materialByType[type] = (materialByType[type] || 0) + count;
  }

  return {
    runType: payload.runType || 'manual',
    importStartedAt: payload.importStartedAt || null,
    importFinishedAt: payload.importFinishedAt || null,
    perSubject,
    perTopic,
    materialByType,
    totals: {
      addedQuestions: Object.values(perSubject).reduce((a, b) => a + b, 0),
      addedMaterials: Object.values(materialByType).reduce((a, b) => a + b, 0),
      blockedSources: blockedSources.length,
    },
    allowedSources,
    blockedSources,
    details: Array.isArray(payload.details)
      ? payload.details.slice(0, 50).map(x => cleanText(x, 'n/a', 280))
      : [],
  };
}

function summaryToLines(mapObj, emptyText = 'None') {
  const entries = Object.entries(mapObj || {});
  if (entries.length === 0) return [emptyText];
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- ${k}: ${v}`);
}

function buildInstructorSummary(summary) {
  const subjectLines = summaryToLines(summary.perSubject);
  const topicLines = summaryToLines(summary.perTopic);
  const materialLines = summaryToLines(summary.materialByType);
  const sourceLines = Object.entries(summary.allowedSources).length
    ? Object.entries(summary.allowedSources).map(([domain, label]) => `- ${domain} (${label})`)
    : ['- None'];

  const blockedLine = summary.totals.blockedSources > 0
    ? `Blocked sources skipped: ${summary.totals.blockedSources}`
    : 'Blocked sources skipped: 0';

  const emailSubject = `[STEM Academy] Weekly content refresh summary (${summary.totals.addedQuestions} questions, ${summary.totals.addedMaterials} materials)`;
  const emailBody = [
    'Weekly content refresh completed.',
    '',
    `Run type: ${summary.runType}`,
    `Import started: ${summary.importStartedAt || 'n/a'}`,
    `Import finished: ${summary.importFinishedAt || 'n/a'}`,
    '',
    'Test questions added per subject:',
    ...subjectLines,
    '',
    'Test questions added per topic:',
    ...topicLines,
    '',
    'All material added (by type):',
    ...materialLines,
    '',
    'Approved sources used:',
    ...sourceLines,
    '',
    blockedLine,
    ...(summary.details.length > 0 ? ['', 'Other relevant import details:', ...summary.details.map(x => `- ${x}`)] : []),
  ].join('\n');

  const inAppBody = [
    `🗂️ Weekly refresh completed (${summary.runType})`,
    `• Questions added: ${summary.totals.addedQuestions}`,
    `• Materials added: ${summary.totals.addedMaterials}`,
    `• By subject: ${subjectLines.join(' | ')}`,
    `• By topic: ${topicLines.join(' | ')}`,
    `• ${blockedLine}`,
  ].join('\n');

  return { emailSubject, emailBody, inAppBody };
}

async function sendInstructorInAppNotification(messageText) {
  const { rows: instructors } = await db.query(
    `SELECT id, role, created_at
     FROM users
     WHERE role IN ('admin', 'tutor')
     ORDER BY created_at ASC`
  );
  if (instructors.length === 0) return 0;

  const sender = instructors.find(u => u.role === 'admin') || instructors[0];
  const recipients = instructors.filter(u => u.id !== sender.id);
  const targetRecipients = recipients.length > 0 ? recipients : [sender];

  for (const recipient of targetRecipients) {
    await db.query(
      `INSERT INTO messages (sender_id, recipient_id, text)
       VALUES ($1, $2, $3)`,
      [sender.id, recipient.id, messageText]
    );
  }
  return targetRecipients.length;
}

async function sendInstructorEmailSummary(emailSubject, emailBody, summary) {
  const emails = config.instructorNotificationEmails;
  if (!emails.length) return { delivered: false, reason: 'No INSTRUCTOR_NOTIFICATION_EMAILS configured' };

  const payload = {
    to: emails,
    subject: emailSubject,
    body: emailBody,
    summary,
  };

  if (!config.instructorEmailWebhookUrl) {
    console.log('[content-refresh] Email summary payload (webhook not configured):', payload);
    return { delivered: false, reason: 'INSTRUCTOR_EMAIL_WEBHOOK_URL not configured' };
  }

  if (typeof fetch !== 'function') {
    return { delivered: false, reason: 'Global fetch unavailable in runtime for webhook delivery' };
  }

  const res = await fetch(config.instructorEmailWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Email webhook failed: HTTP ${res.status}`);
  }
  return { delivered: true };
}

async function runContentRefresh(payload = {}) {
  const withTiming = {
    ...payload,
    importStartedAt: payload.importStartedAt || new Date().toISOString(),
    importFinishedAt: payload.importFinishedAt || new Date().toISOString(),
  };
  const summary = summarizeRefresh(withTiming);
  const { emailSubject, emailBody, inAppBody } = buildInstructorSummary(summary);

  const [inAppDelivered, emailResult] = await Promise.all([
    sendInstructorInAppNotification(inAppBody),
    sendInstructorEmailSummary(emailSubject, emailBody, summary),
  ]);

  return {
    summary,
    instructorNotification: {
      inAppDelivered,
      email: emailResult,
    },
  };
}

function nextSunday11PmEstFrom(now = new Date()) {
  const estNow = new Date(now.getTime() - FIXED_EST_OFFSET_MS);
  const day = estNow.getUTCDay();
  const hour = estNow.getUTCHours();
  const minute = estNow.getUTCMinutes();
  const second = estNow.getUTCSeconds();
  const ms = estNow.getUTCMilliseconds();

  // daysUntil=0 is valid when it is Sunday before 11:00 PM EST (run today).
  let daysUntil = (TARGET_WEEKDAY_EST - day + 7) % 7;
  const alreadyPastTargetToday = day === TARGET_WEEKDAY_EST && (
    hour > TARGET_HOUR_EST ||
    (hour === TARGET_HOUR_EST && (minute > 0 || second > 0 || ms > 0))
  );
  if (alreadyPastTargetToday) daysUntil = 7;

  const targetEstUtcLike = Date.UTC(
    estNow.getUTCFullYear(),
    estNow.getUTCMonth(),
    estNow.getUTCDate() + daysUntil,
    TARGET_HOUR_EST,
    0,
    0,
    0
  );
  return new Date(targetEstUtcLike + FIXED_EST_OFFSET_MS);
}

function startWeeklyRefreshScheduler() {
  if (!config.weeklyRefreshEnabled) return;

  const scheduleNext = () => {
    const now = new Date();
    const nextRun = nextSunday11PmEstFrom(now);
    const rawDelay = nextRun.getTime() - now.getTime();
    const delay = Math.max(1000, rawDelay);
    if (rawDelay < MIN_SCHEDULE_DELAY_MS) {
      console.warn(`[content-refresh] Suspiciously short schedule delay (${rawDelay} ms), nextRun=${nextRun.toISOString()}`);
    }

    console.log(`[content-refresh] Next weekly refresh scheduled for ${nextRun.toISOString()} (Sunday 11:00 PM EST)`);

    setTimeout(async () => {
      const startedAt = new Date().toISOString();
      try {
        await runContentRefresh({
          runType: 'scheduled-weekly',
          importStartedAt: startedAt,
          details: ['Automatic weekly refresh executed on Sunday 11:00 PM EST schedule.'],
        });
      } catch (err) {
        console.error('[content-refresh] Scheduled refresh failed:', err);
      } finally {
        scheduleNext();
      }
    }, delay);
  };

  scheduleNext();
}

module.exports = {
  summarizeRefresh,
  buildInstructorSummary,
  runContentRefresh,
  nextSunday11PmEstFrom,
  startWeeklyRefreshScheduler,
};
