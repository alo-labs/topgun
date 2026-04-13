'use strict';

/**
 * Unit tests for the normalization schema contract (Step 5a/5b/5c of topgun-finder).
 * These tests construct mock adapter outputs and verify normalization logic inline.
 * Run: node --test tests/normalization.test.cjs
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// ─── Inline normalization functions (mirrors topgun-finder.md Step 5a/5b/5c) ─

const UNIFIED_SCHEMA_FIELDS = [
  'name', 'description', 'source_registry', 'install_count',
  'stars', 'security_score', 'last_updated', 'content_sha',
  'install_url', 'raw_metadata'
];

function normalizeResult(raw, source_registry) {
  // Step 5a: ensure all 10 fields with defaults
  if (!raw.name || raw.name === '') return null; // skip unnamed

  const result = {
    name: raw.name,
    description: typeof raw.description === 'string' ? raw.description : null,
    source_registry: raw.source_registry || source_registry,
    install_count: typeof raw.install_count === 'number' ? raw.install_count : null,
    stars: typeof raw.stars === 'number' ? raw.stars : null,
    security_score: typeof raw.security_score === 'number' ? raw.security_score : null,
    last_updated: isValidISO(raw.last_updated) ? raw.last_updated : null,
    content_sha: extractContentSha(raw),
    install_url: typeof raw.install_url === 'string' ? raw.install_url : null,
    raw_metadata: (raw.raw_metadata && typeof raw.raw_metadata === 'object') ? raw.raw_metadata : {},
  };

  return result;
}

function isValidISO(value) {
  if (!value || typeof value !== 'string') return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function extractContentSha(raw) {
  // Step 5b: 4 cases
  if (raw.contentSha) return raw.contentSha;
  if (raw.sha256) return raw.sha256;
  if (raw._content) {
    return crypto.createHash('sha256').update(raw._content).digest('hex');
  }
  return null;
}

function deduplicateResults(results) {
  // Step 5c: identity key = lowercase(name) + '|' + source_registry
  // Same registry: keep more recent last_updated; different registry: keep all
  const seen = new Map();
  const dedupedSameRegistry = [];
  let dedup_removed = 0;

  for (const r of results) {
    const key = r.name.toLowerCase() + '|' + r.source_registry;
    if (seen.has(key)) {
      const existing = seen.get(key);
      const existDate = existing.last_updated ? new Date(existing.last_updated) : null;
      const newDate = r.last_updated ? new Date(r.last_updated) : null;
      if (newDate && (!existDate || newDate > existDate)) {
        seen.set(key, r);
      }
      dedup_removed++;
    } else {
      seen.set(key, r);
    }
  }

  return { results: Array.from(seen.values()), dedup_removed };
}

function countUnavailable(registriesSearched) {
  return registriesSearched.filter(r => r.status !== 'ok').length;
}

// ─── Tests: 10-field unified schema ──────────────────────────────────────────

describe('unified schema — 10 fields present', () => {
  test('all 10 fields are present after normalization', () => {
    const raw = {
      name: 'kube-deploy',
      description: 'Kubernetes deployment automation',
      source_registry: 'skills-sh',
      install_count: 4200,
      stars: 187,
      security_score: 82,
      last_updated: '2026-03-01T00:00:00Z',
      contentSha: 'abc123',
      install_url: 'https://skills.sh/kube-deploy/SKILL.md',
      raw_metadata: { author: 'alo-labs' },
    };
    const result = normalizeResult(raw, 'skills-sh');
    for (const field of UNIFIED_SCHEMA_FIELDS) {
      assert.ok(field in result, `missing field: ${field}`);
    }
  });

  test('stars with non-number value is normalized to null', () => {
    const raw = { name: 'test-skill', stars: 'many', source_registry: 'hub' };
    const result = normalizeResult(raw, 'hub');
    assert.equal(result.stars, null);
  });

  test('last_updated with invalid string is normalized to null', () => {
    const raw = { name: 'test-skill', last_updated: 'not-a-date', source_registry: 'hub' };
    const result = normalizeResult(raw, 'hub');
    assert.equal(result.last_updated, null);
  });

  test('missing raw_metadata defaults to empty object', () => {
    const raw = { name: 'test-skill', source_registry: 'hub' };
    const result = normalizeResult(raw, 'hub');
    assert.deepEqual(result.raw_metadata, {});
  });

  test('missing description defaults to null', () => {
    const raw = { name: 'test-skill', source_registry: 'hub' };
    const result = normalizeResult(raw, 'hub');
    assert.equal(result.description, null);
  });
});

// ─── Tests: contentSha extraction (4 cases) ──────────────────────────────────

describe('contentSha extraction — 4 cases', () => {
  test('case 1: contentSha field present — use as-is', () => {
    const raw = { name: 'skill-a', source_registry: 'agentskill-sh', contentSha: 'sha-from-registry' };
    const result = normalizeResult(raw, 'agentskill-sh');
    assert.equal(result.content_sha, 'sha-from-registry');
  });

  test('case 2: sha256 field present — use as-is', () => {
    const raw = { name: 'skill-b', source_registry: 'github', sha256: 'sha256-value' };
    const result = normalizeResult(raw, 'github');
    assert.equal(result.content_sha, 'sha256-value');
  });

  test('case 3: content available — compute SHA-256 from content', () => {
    const content = '---\nname: skill-c\ndescription: test\n---\n# Skill C\n';
    const expected = crypto.createHash('sha256').update(content).digest('hex');
    const raw = { name: 'skill-c', source_registry: 'local', _content: content };
    const result = normalizeResult(raw, 'local');
    assert.equal(result.content_sha, expected);
  });

  test('case 4: none of the above — content_sha is null', () => {
    const raw = { name: 'skill-d', source_registry: 'smithery' };
    const result = normalizeResult(raw, 'smithery');
    assert.equal(result.content_sha, null);
  });
});

// ─── Tests: deduplication ────────────────────────────────────────────────────

describe('deduplication by (name, source_registry)', () => {
  test('two identical (name, registry) entries — keep the more recent one', () => {
    const results = [
      { name: 'kube-deploy', source_registry: 'skills-sh', last_updated: '2025-01-01T00:00:00Z' },
      { name: 'kube-deploy', source_registry: 'skills-sh', last_updated: '2026-03-01T00:00:00Z' },
    ];
    const { results: deduped, dedup_removed } = deduplicateResults(results);
    assert.equal(deduped.length, 1);
    assert.equal(dedup_removed, 1);
    assert.equal(deduped[0].last_updated, '2026-03-01T00:00:00Z');
  });

  test('same name but different registries — keep both (cross-registry)', () => {
    const results = [
      { name: 'kube-deploy', source_registry: 'skills-sh', last_updated: '2026-03-01T00:00:00Z' },
      { name: 'kube-deploy', source_registry: 'github', last_updated: '2026-02-01T00:00:00Z' },
    ];
    const { results: deduped, dedup_removed } = deduplicateResults(results);
    assert.equal(deduped.length, 2);
    assert.equal(dedup_removed, 0);
  });

  test('dedup_removed counter is accurate', () => {
    const results = [
      { name: 'skill-x', source_registry: 'hub', last_updated: '2025-01-01T00:00:00Z' },
      { name: 'skill-x', source_registry: 'hub', last_updated: '2025-06-01T00:00:00Z' },
      { name: 'skill-x', source_registry: 'hub', last_updated: '2025-09-01T00:00:00Z' },
    ];
    const { results: deduped, dedup_removed } = deduplicateResults(results);
    assert.equal(deduped.length, 1);
    assert.equal(dedup_removed, 2);
  });

  test('null last_updated — keep first seen when both are null', () => {
    const results = [
      { name: 'skill-y', source_registry: 'hub', last_updated: null },
      { name: 'skill-y', source_registry: 'hub', last_updated: null },
    ];
    const { results: deduped, dedup_removed } = deduplicateResults(results);
    assert.equal(deduped.length, 1);
    assert.equal(dedup_removed, 1);
  });
});

// ─── Tests: unnamed result is skipped ────────────────────────────────────────

describe('normalization skips unnamed results', () => {
  test('result with empty name returns null', () => {
    const raw = { name: '', description: 'some desc', source_registry: 'hub' };
    assert.equal(normalizeResult(raw, 'hub'), null);
  });

  test('result with missing name returns null', () => {
    const raw = { description: 'some desc', source_registry: 'hub' };
    assert.equal(normalizeResult(raw, 'hub'), null);
  });
});

// ─── Tests: unavailable registry warning threshold ────────────────────────────

describe('unavailable registry counting', () => {
  test('2 unavailable registries — no warning (below threshold)', () => {
    const registries = [
      { registry: 'skills-sh', status: 'ok' },
      { registry: 'smithery', status: 'ok' },
      { registry: 'github', status: 'ok' },
      { registry: 'agentskill-sh', status: 'unavailable' },
      { registry: 'gitlab', status: 'unavailable' },
    ];
    const count = countUnavailable(registries);
    assert.equal(count, 2);
    assert.equal(count < 3, true, 'should not trigger warning below 3');
  });

  test('3 unavailable registries — triggers warning flag (REQ-06)', () => {
    const registries = [
      { registry: 'skills-sh', status: 'ok' },
      { registry: 'smithery', status: 'unavailable' },
      { registry: 'github', status: 'unavailable' },
      { registry: 'agentskill-sh', status: 'unavailable' },
      { registry: 'gitlab', status: 'ok' },
    ];
    const count = countUnavailable(registries);
    assert.equal(count, 3);
    assert.equal(count >= 3, true, 'should trigger warning at 3+');
  });

  test('error status also counts as unavailable', () => {
    const registries = [
      { registry: 'skills-sh', status: 'ok' },
      { registry: 'smithery', status: 'error' },
      { registry: 'github', status: 'unavailable' },
      { registry: 'agentskill-sh', status: 'error' },
      { registry: 'gitlab', status: 'unavailable' },
    ];
    const count = countUnavailable(registries);
    assert.equal(count, 4);
  });
});
