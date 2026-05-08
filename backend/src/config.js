'use strict';

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  contentUpdateEnabled: process.env.CONTENT_UPDATE_ENABLED !== 'false',
  contentFetchTimeoutMs: parseInt(process.env.CONTENT_FETCH_TIMEOUT_MS || '8000', 10),
  contentMaxSourceChars: parseInt(process.env.CONTENT_MAX_SOURCE_CHARS || '6000', 10),
  contentSourceAllowlist: (process.env.CONTENT_SOURCE_ALLOWLIST
    || 'wikipedia.org,*.wikipedia.org,openstax.org,*.openstax.org,khanacademy.org,*.khanacademy.org')
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost',
  nodeEnv: process.env.NODE_ENV || 'development',
  bcryptRounds: 12,
  jwtExpiresIn: '15m',
  refreshExpiresInMs: 7 * 24 * 60 * 60 * 1000, // 7 days
};
