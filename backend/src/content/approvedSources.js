'use strict';

const config = require('../config');

const DEFAULT_APPROVED_SOURCES = [
  'https://www.khanacademy.org/.well-known/stem-academy-content.json',
  'https://www.ed.gov/.well-known/stem-academy-content.json',
  'https://www.nasa.gov/.well-known/stem-academy-content.json',
];

const OFFICIAL_HOST_ALLOWLIST = new Set([
  'www.khanacademy.org',
  'www.ed.gov',
  'www.nasa.gov',
]);

function isApprovedSourceUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:') return false;
    return OFFICIAL_HOST_ALLOWLIST.has(u.hostname) || u.hostname.endsWith('.gov');
  } catch {
    return false;
  }
}

function getApprovedSources() {
  const configured = config.approvedContentSources.length
    ? config.approvedContentSources
    : DEFAULT_APPROVED_SOURCES;
  return configured.filter(isApprovedSourceUrl);
}

module.exports = {
  getApprovedSources,
  isApprovedSourceUrl,
  OFFICIAL_HOST_ALLOWLIST,
  DEFAULT_APPROVED_SOURCES,
};
