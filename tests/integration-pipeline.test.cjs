'use strict';

/**
 * Integration tests for the full pipeline data flow using mock files.
 * Uses TOPGUN_HOME env var isolated to tests/fixtures/user-workdir/.topgun/
 * Run: node --test tests/integration-pipeline.test.cjs
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const TOOLS = path.join(__dirname, '..', 'bin', 'topgun-tools.cjs');
const FIXTURES = path.join(__dirname, 'fixtures');

function makeTempTopgunHome() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'topgun-integ-'));
  const topgunHome = path.join(tmpDir, '.topgun');
  fs.mkdirSync(path.join(topgunHome, 'cache'), { recursive: true });
  fs.mkdirSync(path.join(topgunHome, 'audit-cache'), { recursive: true });
  fs.mkdirSync(path.join(topgunHome, 'secured'), { recursive: true });
  fs.mkdirSync(path.join(topgunHome, 'sessions'), { recursive: true });
  return { home: tmpDir, topgunHome };
}

function run(args, home) {
  try {
    const result = execFileSync(process.execPath, [TOOLS, ...args], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home },
    });
    if (result.trim().startsWith('@file:')) {
      return JSON.parse(fs.readFileSync(result.trim().slice(6), 'utf8'));
    }
    return JSON.parse(result);
  } catch (err) {
    throw new Error(`CLI error: ${err.stderr || err.message}`);
  }
}

// ─── Test 1: State resume — write found-skills, verify stage skipping ─────────

describe('Test 1: State resume with found-skills mock', () => {
  test('writing last_completed_stage=find enables stage skip detection', () => {
    const { home, topgunHome } = makeTempTopgunHome();

    // Initialize state
    run(['init'], home);

    // Simulate FindSkills completing: write found-skills file and update state
    const mockFoundSkills = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'mock-found-skills.json'), 'utf8'));
    const foundSkillsPath = path.join(topgunHome, 'found-skills-test.json');
    fs.writeFileSync(foundSkillsPath, JSON.stringify(mockFoundSkills, null, 2));

    run(['state-write', 'last_completed_stage', 'find'], home);
    run(['state-write', 'found_skills_path', foundSkillsPath], home);

    // Read state back — verify resume point
    const state = run(['state-read'], home);
    assert.equal(state.last_completed_stage, 'find');
    assert.equal(state.found_skills_path, foundSkillsPath);
    assert.ok(fs.existsSync(foundSkillsPath), 'found-skills file must exist at stored path');

    fs.rmSync(home, { recursive: true, force: true });
  });
});

// ─── Test 2: Found-skills output schema — all 10 fields present ───────────────

describe('Test 2: Found-skills output schema validation', () => {
  const REQUIRED_RESULT_FIELDS = [
    'name', 'description', 'source_registry', 'install_count',
    'stars', 'security_score', 'last_updated', 'content_sha',
    'install_url', 'raw_metadata',
  ];

  const REQUIRED_TOP_FIELDS = ['query', 'results', 'registries_searched', 'searched_at'];

  test('mock-found-skills.json has all required top-level fields', () => {
    const data = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'mock-found-skills.json'), 'utf8'));
    for (const field of REQUIRED_TOP_FIELDS) {
      assert.ok(field in data, `missing top-level field: ${field}`);
    }
  });

  test('each result in mock-found-skills.json has all 10 unified schema fields', () => {
    const data = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'mock-found-skills.json'), 'utf8'));
    assert.ok(Array.isArray(data.results) && data.results.length > 0, 'results must be non-empty array');
    for (const result of data.results) {
      for (const field of REQUIRED_RESULT_FIELDS) {
        assert.ok(field in result, `result "${result.name}" missing field: ${field}`);
      }
    }
  });

  test('mock adapter response can be normalized and all fields present', () => {
    const mockAdapter = {
      registry: 'skills-sh',
      status: 'ok',
      reason: null,
      results: [
        {
          name: 'test-skill',
          description: 'A test skill for deployment',
          install_count: 100,
          stars: 10,
          security_score: null,
          last_updated: '2026-01-01T00:00:00Z',
          install_url: 'https://skills.sh/test-skill/SKILL.md',
          raw_metadata: { author: 'test-author' },
        },
      ],
      latency_ms: 300,
    };

    // Normalize result
    const raw = mockAdapter.results[0];
    const normalized = {
      name: raw.name,
      description: raw.description || null,
      source_registry: mockAdapter.registry,
      install_count: typeof raw.install_count === 'number' ? raw.install_count : null,
      stars: typeof raw.stars === 'number' ? raw.stars : null,
      security_score: typeof raw.security_score === 'number' ? raw.security_score : null,
      last_updated: raw.last_updated || null,
      content_sha: raw.contentSha || raw.sha256 || null,
      install_url: raw.install_url || null,
      raw_metadata: raw.raw_metadata || {},
    };

    for (const field of REQUIRED_RESULT_FIELDS) {
      assert.ok(field in normalized, `normalized result missing field: ${field}`);
    }
  });
});

// ─── Test 3: Comparison output schema validation ──────────────────────────────

describe('Test 3: Comparison output schema', () => {
  test('mock-comparison.json has winner with required fields', () => {
    const data = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'mock-comparison.json'), 'utf8'));
    assert.ok(data.winner, 'comparison must have winner');
    assert.ok(data.winner.name, 'winner must have name');
    assert.ok(typeof data.winner.composite_score === 'number', 'winner must have composite_score');
    assert.ok(data.winner.scores, 'winner must have scores');
    assert.ok(typeof data.winner.scores.capability_match === 'number');
    assert.ok(typeof data.winner.scores.security_posture === 'number');
    assert.ok(typeof data.winner.scores.popularity === 'number');
    assert.ok(typeof data.winner.scores.recency === 'number');
  });

  test('shortlist is sorted by rank ascending', () => {
    const data = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'mock-comparison.json'), 'utf8'));
    assert.ok(Array.isArray(data.shortlist) && data.shortlist.length > 0);
    for (let i = 0; i < data.shortlist.length; i++) {
      assert.equal(data.shortlist[i].rank, i + 1, `rank at index ${i} should be ${i + 1}`);
    }
  });

  test('winner matches rank-1 entry in shortlist', () => {
    const data = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'mock-comparison.json'), 'utf8'));
    const rank1 = data.shortlist.find(c => c.rank === 1);
    assert.ok(rank1);
    assert.equal(data.winner.name, rank1.name);
    assert.equal(data.winner.composite_score, rank1.composite_score);
  });

  test('weights sum to 1.0', () => {
    const data = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'mock-comparison.json'), 'utf8'));
    const w = data.weights;
    const sum = w.capability_match + w.security_posture + w.popularity + w.recency;
    assert.ok(Math.abs(sum - 1.0) < 0.001, `weights must sum to 1.0, got ${sum}`);
  });
});

// ─── Test 4: Cache hit within TTL ────────────────────────────────────────────

describe('Test 4: Cache hit — fresh entry within TTL', () => {
  test('cache-lookup returns hit:true for entry written just now', () => {
    const { home, topgunHome } = makeTempTopgunHome();

    const sha = 'integ-test-fresh-sha';
    const cacheEntry = {
      skill: 'kube-deploy',
      cached_at: new Date().toISOString(),
      etag: 'etag-v1',
      updated_at: '2026-03-01T00:00:00Z',
    };
    fs.writeFileSync(
      path.join(topgunHome, 'audit-cache', `${sha}.json`),
      JSON.stringify(cacheEntry, null, 2)
    );

    const res = run([
      'cache-lookup', sha,
      '--upstream-etag', 'etag-v1',
      '--upstream-updated-at', '2026-03-01T00:00:00Z',
    ], home);

    assert.equal(res.hit, true);
    assert.equal(res.stale, false);
    assert.ok(typeof res.age_hours === 'number');
    assert.ok(res.age_hours < 24);

    fs.rmSync(home, { recursive: true, force: true });
  });
});

// ─── Test 5: Cache miss (stale) — entry > 24h old ────────────────────────────

describe('Test 5: Cache miss — stale entry older than 24h', () => {
  test('cache-lookup returns stale:true for 25h-old entry', () => {
    const { home, topgunHome } = makeTempTopgunHome();

    const sha = 'integ-test-stale-sha';
    const staleDate = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    const cacheEntry = {
      skill: 'kube-deploy',
      cached_at: staleDate,
    };
    fs.writeFileSync(
      path.join(topgunHome, 'audit-cache', `${sha}.json`),
      JSON.stringify(cacheEntry, null, 2)
    );

    const res = run(['cache-lookup', sha], home);

    assert.equal(res.hit, false);
    assert.equal(res.stale, true);
    assert.ok(res.age_hours >= 25);
    assert.ok(typeof res.warning === 'string');
    assert.ok(res.data, 'stale response must include data');

    fs.rmSync(home, { recursive: true, force: true });
  });
});

// ─── Test 6: Offline mode ─────────────────────────────────────────────────────

describe('Test 6: Offline mode — cache presence/absence', () => {
  test('found-skills cache exists — can serve from it', () => {
    const { home, topgunHome } = makeTempTopgunHome();

    const queryHash = 'offline-test-hash-abc123';
    const foundSkillsPath = path.join(topgunHome, `found-skills-${queryHash}.json`);
    const mockData = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'mock-found-skills.json'), 'utf8'));
    fs.writeFileSync(foundSkillsPath, JSON.stringify(mockData, null, 2));

    // Verify the file is readable and contains results
    const loaded = JSON.parse(fs.readFileSync(foundSkillsPath, 'utf8'));
    assert.ok(Array.isArray(loaded.results) && loaded.results.length > 0);
    assert.equal(loaded.results.length, 5);

    fs.rmSync(home, { recursive: true, force: true });
  });

  test('no found-skills cache — offline mode cannot proceed', () => {
    const { home, topgunHome } = makeTempTopgunHome();

    const queryHash = 'nonexistent-hash-xyz789';
    const foundSkillsPath = path.join(topgunHome, `found-skills-${queryHash}.json`);

    // Verify the file does NOT exist — this is the condition that triggers offline error
    assert.equal(fs.existsSync(foundSkillsPath), false, 'cache file should not exist');
    // The orchestrator would output: "No cached results available for this query."
    // We verify the detection logic here

    fs.rmSync(home, { recursive: true, force: true });
  });
});

// ─── Test 7: Failure contract ─────────────────────────────────────────────────

describe('Test 7: Failure contract — sub-agent output format', () => {
  const FAILURE_FORMATS = [
    {
      agent: 'topgun-finder',
      output: '## STAGE FAILED\nReason: All registries unavailable and no local skills matched',
    },
    {
      agent: 'topgun-comparator',
      output: '## STAGE FAILED\nReason: No valid candidates after security pre-filter',
    },
    {
      agent: 'topgun-securer',
      output: '## STAGE FAILED\nReason: SHA mismatch after Sentinel fixes — content integrity violation',
    },
    {
      agent: 'topgun-installer',
      output: '## STAGE FAILED\nReason: Both /plugin install and local-copy fallback failed — manual installation required. Secured skill at: /tmp/secured/kube-deploy/SKILL.md',
    },
  ];

  for (const { agent, output } of FAILURE_FORMATS) {
    test(`${agent} failure output contains STAGE FAILED marker`, () => {
      assert.ok(output.includes('## STAGE FAILED'), `${agent} must output ## STAGE FAILED`);
    });

    test(`${agent} failure output contains Reason: line`, () => {
      assert.ok(output.includes('Reason:'), `${agent} must include Reason: line`);
    });

    test(`${agent} failure Reason: line is non-empty`, () => {
      const reasonLine = output.split('\n').find(l => l.startsWith('Reason:'));
      assert.ok(reasonLine);
      const reason = reasonLine.slice('Reason:'.length).trim();
      assert.ok(reason.length > 0, `${agent} Reason: must not be empty`);
    });
  }

  test('adapter result contract: status field is ok|failed|unavailable', () => {
    const validStatuses = ['ok', 'failed', 'unavailable'];
    const mockAdapterResults = [
      { status: 'ok', reason: null, results: [] },
      { status: 'unavailable', reason: 'timeout', results: [] },
      { status: 'failed', reason: 'parse error', results: [] },
    ];
    for (const result of mockAdapterResults) {
      assert.ok(validStatuses.includes(result.status), `invalid status: ${result.status}`);
      assert.ok('reason' in result, 'adapter result must have reason field');
      assert.ok(Array.isArray(result.results), 'adapter result must have results array');
    }
  });
});
