'use strict';

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
  weeklyRefreshEnabled: process.env.WEEKLY_REFRESH_ENABLED !== 'false',
  weeklyRefreshTimezoneLabel: process.env.WEEKLY_REFRESH_TIMEZONE_LABEL || 'EST (UTC-05:00)',
  instructorNotificationEmails: String(process.env.INSTRUCTOR_NOTIFICATION_EMAILS || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean),
  instructorEmailWebhookUrl: process.env.INSTRUCTOR_EMAIL_WEBHOOK_URL || '',
  // Set WEB_SEARCH_ENABLED=true to allow the AI to look up educational facts
  // via the DuckDuckGo Instant Answer API. No API key required.
  // Personal data is NEVER sent to the external search service (see ai.js).
  webSearchEnabled: process.env.WEB_SEARCH_ENABLED === 'true',
};
