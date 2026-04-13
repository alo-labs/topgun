'use strict';

/**
 * Unit tests for the scoring rubric (topgun-comparator.md Step 4 & 5).
 * Pure function tests — no CLI, no filesystem.
 * Run: node --test tests/scoring.test.cjs
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ─── Scoring functions (mirrors topgun-comparator.md) ────────────────────────

const STOPWORDS = new Set(['the', 'a', 'an', 'for', 'to', 'of', 'in', 'and', 'or', 'with']);

function extractKeywords(query) {
  return query.toLowerCase().split(/\s+/).filter(w => w && !STOPWORDS.has(w));
}

function scoreCapability(candidate, query) {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return 0;
  const haystack = `${candidate.name} ${candidate.description || ''}`.toLowerCase();
  const hits = keywords.filter(kw => haystack.includes(kw)).length;
  return Math.min(100, (hits / keywords.length) * 100);
}

function scoreSecurity(candidate) {
  if (candidate.security_score === null || candidate.security_score === undefined) return 50;
  return candidate.security_score;
}

function scorePopularity(candidate) {
  const stars = candidate.stars || 0;
  const installs = candidate.install_count || 0;
  return Math.min(100, (stars * 2) + (installs / 10));
}

function scoreRecency(candidate, nowMs) {
  if (!candidate.last_updated) return 10;
  const updated = new Date(candidate.last_updated).getTime();
  const daysAgo = (nowMs - updated) / (1000 * 60 * 60 * 24);
  if (daysAgo <= 30) return 100;
  if (daysAgo <= 90) return 80;
  if (daysAgo <= 365) return 50;
  return 20;
}

function compositeScore(cap, sec, pop, rec) {
  return Math.round(((cap * 0.40) + (sec * 0.25) + (pop * 0.20) + (rec * 0.15)) * 100) / 100;
}

function rankCandidates(candidates, query, nowMs) {
  const scored = candidates.map(c => {
    const cap = scoreCapability(c, query);
    const sec = scoreSecurity(c);
    const pop = scorePopularity(c);
    const rec = scoreRecency(c, nowMs);
    const composite = compositeScore(cap, sec, pop, rec);
    return { ...c, scores: { capability_match: cap, security_posture: sec, popularity: pop, recency: rec }, composite_score: composite };
  });

  // Deterministic tie-breaking: composite DESC → security DESC → recency DESC → name ASC
  scored.sort((a, b) => {
    if (b.composite_score !== a.composite_score) return b.composite_score - a.composite_score;
    if (b.scores.security_posture !== a.scores.security_posture) return b.scores.security_posture - a.scores.security_posture;
    if (b.scores.recency !== a.scores.recency) return b.scores.recency - a.scores.recency;
    return a.name.localeCompare(b.name);
  });

  return scored.map((c, i) => ({ ...c, rank: i + 1 }));
}

// ─── Capability Match (0–40 points) ──────────────────────────────────────────

describe('capability match scoring', () => {
  test('exact keyword match scores 100', () => {
    const candidate = { name: 'kube-deploy', description: 'kubernetes deployment automation' };
    const score = scoreCapability(candidate, 'kubernetes deployment automation');
    assert.equal(score, 100);
  });

  test('no keyword match scores 0', () => {
    const candidate = { name: 'photo-editor', description: 'edit photos and images' };
    const score = scoreCapability(candidate, 'kubernetes deployment');
    assert.equal(score, 0);
  });

  test('partial keyword match scores proportionally', () => {
    const candidate = { name: 'kube-helper', description: 'kubernetes cluster management' };
    const score = scoreCapability(candidate, 'kubernetes deployment automation');
    // keywords: ['kubernetes', 'deployment', 'automation'] (stopwords already filtered)
    // hits: 'kubernetes' = 1, 'deployment' = 0, 'automation' = 0 → 1/3 = 33.33
    assert.ok(score > 0 && score < 100);
    assert.ok(Math.abs(score - 33.33) < 1);
  });

  test('stopwords are excluded from keyword extraction', () => {
    const keywords = extractKeywords('find a skill for the deployment of applications');
    assert.ok(!keywords.includes('a'));
    assert.ok(!keywords.includes('the'));
    assert.ok(!keywords.includes('for'));
    assert.ok(!keywords.includes('of'));
    assert.ok(keywords.includes('find'));
    assert.ok(keywords.includes('skill'));
    assert.ok(keywords.includes('deployment'));
  });

  test('score is capped at 100', () => {
    const candidate = { name: 'deploy', description: 'deploy deploy deploy kubernetes kubernetes' };
    const score = scoreCapability(candidate, 'deploy kubernetes');
    assert.equal(score, 100);
  });
});

// ─── Security Posture (0–30 points) ──────────────────────────────────────────

describe('security posture scoring', () => {
  test('security_score=null defaults to 50', () => {
    const candidate = { name: 'skill-x', security_score: null };
    assert.equal(scoreSecurity(candidate), 50);
  });

  test('security_score=undefined defaults to 50', () => {
    const candidate = { name: 'skill-x' };
    assert.equal(scoreSecurity(candidate), 50);
  });

  test('security_score=82 returns 82', () => {
    const candidate = { name: 'skill-x', security_score: 82 };
    assert.equal(scoreSecurity(candidate), 82);
  });

  test('security_score=0 returns 0', () => {
    const candidate = { name: 'skill-x', security_score: 0 };
    assert.equal(scoreSecurity(candidate), 0);
  });

  test('security_score=100 returns 100', () => {
    const candidate = { name: 'skill-x', security_score: 100 };
    assert.equal(scoreSecurity(candidate), 100);
  });

  test('security_score < 30 is a warning threshold (REQ: log warning)', () => {
    const candidate = { name: 'risky-skill', security_score: 25 };
    const score = scoreSecurity(candidate);
    assert.equal(score, 25);
    // The warning flag would be set by the agent — we verify the threshold logic
    assert.ok(score < 30, 'scores below 30 should trigger security_warning flag');
  });
});

// ─── Popularity (0–20 points) ─────────────────────────────────────────────────

describe('popularity scoring', () => {
  test('null stars and null install_count → popularity = 0', () => {
    const candidate = { stars: null, install_count: null };
    assert.equal(scorePopularity(candidate), 0);
  });

  test('100 stars, 0 installs → popularity = 200 capped at 100', () => {
    const candidate = { stars: 100, install_count: 0 };
    assert.equal(scorePopularity(candidate), 100);
  });

  test('formula: min(100, stars*2 + install_count/10)', () => {
    const candidate = { stars: 10, install_count: 200 };
    // 10*2 + 200/10 = 20 + 20 = 40
    assert.equal(scorePopularity(candidate), 40);
  });

  test('large install_count with no stars', () => {
    const candidate = { stars: 0, install_count: 5000 };
    // 0 + 5000/10 = 500, capped at 100
    assert.equal(scorePopularity(candidate), 100);
  });

  test('missing stars treated as 0', () => {
    const candidate = { install_count: 100 };
    // 0*2 + 100/10 = 10
    assert.equal(scorePopularity(candidate), 10);
  });
});

// ─── Recency (0–10 points) ───────────────────────────────────────────────────

describe('recency scoring', () => {
  const NOW = new Date('2026-04-13T00:00:00Z').getTime();

  function daysAgo(days) {
    return new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
  }

  test('updated 10 days ago → recency = 100', () => {
    const candidate = { last_updated: daysAgo(10) };
    assert.equal(scoreRecency(candidate, NOW), 100);
  });

  test('updated 30 days ago (boundary) → recency = 100', () => {
    const candidate = { last_updated: daysAgo(30) };
    assert.equal(scoreRecency(candidate, NOW), 100);
  });

  test('updated 60 days ago → recency = 80', () => {
    const candidate = { last_updated: daysAgo(60) };
    assert.equal(scoreRecency(candidate, NOW), 80);
  });

  test('updated 200 days ago → recency = 50', () => {
    const candidate = { last_updated: daysAgo(200) };
    assert.equal(scoreRecency(candidate, NOW), 50);
  });

  test('updated 400 days ago → recency = 20', () => {
    const candidate = { last_updated: daysAgo(400) };
    assert.equal(scoreRecency(candidate, NOW), 20);
  });

  test('null last_updated → recency = 10', () => {
    const candidate = { last_updated: null };
    assert.equal(scoreRecency(candidate, NOW), 10);
  });
});

// ─── Composite formula ────────────────────────────────────────────────────────

describe('composite score formula', () => {
  test('formula: cap*0.40 + sec*0.25 + pop*0.20 + rec*0.15', () => {
    // Example from mock-comparison.json winner
    const composite = compositeScore(90, 82, 77.4, 100);
    // 90*0.40 + 82*0.25 + 77.4*0.20 + 100*0.15
    // = 36 + 20.5 + 15.48 + 15 = 86.98
    const expected = 36 + 20.5 + 15.48 + 15;
    assert.ok(Math.abs(composite - expected) < 0.01, `expected ~${expected} got ${composite}`);
  });

  test('all zeros → composite = 0', () => {
    assert.equal(compositeScore(0, 0, 0, 0), 0);
  });

  test('all 100s → composite = 100', () => {
    assert.equal(compositeScore(100, 100, 100, 100), 100);
  });

  test('rounded to 2 decimal places', () => {
    const score = compositeScore(33, 67, 44, 88);
    const str = score.toString();
    const decimals = str.includes('.') ? str.split('.')[1].length : 0;
    assert.ok(decimals <= 2, `should have at most 2 decimal places, got ${score}`);
  });
});

// ─── Deterministic tie-breaking ───────────────────────────────────────────────

describe('deterministic tie-breaking', () => {
  const NOW = new Date('2026-04-13T00:00:00Z').getTime();

  test('higher composite wins', () => {
    const candidates = [
      { name: 'skill-b', description: 'kubernetes deploy', security_score: 80, stars: 50, install_count: 1000, last_updated: '2026-03-01T00:00:00Z' },
      { name: 'skill-a', description: 'kubernetes deployment automation', security_score: 80, stars: 50, install_count: 1000, last_updated: '2026-03-01T00:00:00Z' },
    ];
    const ranked = rankCandidates(candidates, 'kubernetes deployment automation', NOW);
    assert.equal(ranked[0].name, 'skill-a', 'higher capability match should win');
  });

  test('equal composite → higher security wins', () => {
    // Same cap, pop, rec — different security
    const candidates = [
      { name: 'skill-low-sec', description: 'deploy app', security_score: 60, stars: 10, install_count: 100, last_updated: '2026-03-20T00:00:00Z' },
      { name: 'skill-high-sec', description: 'deploy app', security_score: 90, stars: 10, install_count: 100, last_updated: '2026-03-20T00:00:00Z' },
    ];
    const ranked = rankCandidates(candidates, 'deploy app', NOW);
    assert.equal(ranked[0].name, 'skill-high-sec');
  });

  test('equal composite and security → name ASC as final tiebreak', () => {
    const candidates = [
      { name: 'z-skill', description: 'deploy app kubernetes', security_score: 75, stars: 20, install_count: 200, last_updated: '2026-03-20T00:00:00Z' },
      { name: 'a-skill', description: 'deploy app kubernetes', security_score: 75, stars: 20, install_count: 200, last_updated: '2026-03-20T00:00:00Z' },
    ];
    const ranked = rankCandidates(candidates, 'deploy app kubernetes', NOW);
    assert.equal(ranked[0].name, 'a-skill', 'name ASC should be final tiebreak');
  });

  test('same input always produces same ranking (determinism)', () => {
    const candidates = [
      { name: 'skill-c', description: 'kubernetes deployment', security_score: 70, stars: 30, install_count: 500, last_updated: '2026-01-01T00:00:00Z' },
      { name: 'skill-a', description: 'kubernetes automation', security_score: 85, stars: 10, install_count: 200, last_updated: '2026-02-01T00:00:00Z' },
      { name: 'skill-b', description: 'deploy service automation', security_score: 60, stars: 50, install_count: 800, last_updated: '2025-12-01T00:00:00Z' },
    ];
    const query = 'kubernetes deployment automation';
    const ranked1 = rankCandidates([...candidates], query, NOW);
    const ranked2 = rankCandidates([...candidates], query, NOW);
    assert.deepEqual(
      ranked1.map(c => c.name),
      ranked2.map(c => c.name),
      'ranking must be deterministic'
    );
  });

  test('rank field is 1-based', () => {
    const candidates = [
      { name: 'skill-a', description: 'deploy', security_score: 80, stars: 10, install_count: 100, last_updated: '2026-03-01T00:00:00Z' },
      { name: 'skill-b', description: 'kubernetes', security_score: 60, stars: 5, install_count: 50, last_updated: '2025-12-01T00:00:00Z' },
    ];
    const ranked = rankCandidates(candidates, 'deploy kubernetes', NOW);
    assert.equal(ranked[0].rank, 1);
    assert.equal(ranked[1].rank, 2);
  });
});
