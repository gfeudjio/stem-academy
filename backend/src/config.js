'use strict';

const parseList = (v) => (
  String(v || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost',
  nodeEnv: process.env.NODE_ENV || 'development',
  bcryptRounds: 12,
  jwtExpiresIn: '15m',
  refreshExpiresInMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  approvedContentSources: parseList(process.env.APPROVED_CONTENT_SOURCES),
  contentRefreshEnabled: process.env.CONTENT_REFRESH_ENABLED !== 'false',
  contentRefreshSundayHourUtc: parseInt(process.env.CONTENT_REFRESH_SUNDAY_HOUR_UTC || '23', 10),
  contentRefreshSundayMinuteUtc: parseInt(process.env.CONTENT_REFRESH_SUNDAY_MINUTE_UTC || '0', 10),
  contentRefreshPollMinutes: parseInt(process.env.CONTENT_REFRESH_POLL_MINUTES || '15', 10),
  contentRefreshFetchTimeoutMs: parseInt(process.env.CONTENT_REFRESH_FETCH_TIMEOUT_MS || '12000', 10),
  instructorEmailWebhookUrl: process.env.INSTRUCTOR_EMAIL_WEBHOOK_URL || '',
};
