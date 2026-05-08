'use strict';

const DEFAULT_ALLOWLIST = [
  {
    id: 'cm-minesec',
    label: 'Cameroon Ministry of Secondary Education',
    domains: ['minesec.gov.cm', '*.minesec.gov.cm'],
    notes: 'Official Cameroon Ministry of Secondary Education sources.',
  },
  {
    id: 'us-official-curriculum',
    label: 'Official United States school curriculum sources',
    domains: ['ed.gov', '*.ed.gov', '*.k12.*.us', '*.state.*.us'],
    notes: 'Official U.S. federal/state public education curriculum and standards domains.',
  },
  {
    id: 'us-approved-curriculum-books',
    label: 'Approved educational books associated with official curricula',
    domains: ['openstax.org', '*.openstax.org', 'corestandards.org', '*.corestandards.org'],
    notes: 'Official/approved educational book and curriculum-standard sources.',
  },
];

function hostnameMatches(hostname, pattern) {
  const host = String(hostname || '').toLowerCase();
  const rule = String(pattern || '').toLowerCase();
  if (!host || !rule) return false;
  const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const wildcardRegex = new RegExp(`^${escaped.replace(/\\\*/g, '.*')}$`);
  return wildcardRegex.test(host);
}

function getSourceAllowlist() {
  return DEFAULT_ALLOWLIST.map(entry => ({ ...entry }));
}

function getSourcePolicyMatch(urlValue) {
  try {
    const parsed = new URL(String(urlValue || ''));
    const hostname = parsed.hostname.toLowerCase();
    for (const policy of DEFAULT_ALLOWLIST) {
      if (policy.domains.some(domain => hostnameMatches(hostname, domain))) {
        return {
          allowed: true,
          sourceId: policy.id,
          sourceLabel: policy.label,
          hostname,
        };
      }
    }
    return { allowed: false, hostname };
  } catch {
    return { allowed: false, hostname: '' };
  }
}

module.exports = {
  getSourceAllowlist,
  getSourcePolicyMatch,
};
