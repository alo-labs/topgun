'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const TOOLS = path.join(__dirname, '..', 'bin', 'topgun-tools.cjs');

function run(args, env = {}) {
  try {
    const result = execFileSync(process.execPath, [TOOLS, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    if (result.startsWith('@file:')) {
      return JSON.parse(fs.readFileSync(result.slice(6), 'utf8'));
    }
    return JSON.parse(result);
  } catch (err) {
    throw new Error(`CLI error: ${err.stderr || err.message}`);
  }
}

function makeTempHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'topgun-test-'));
  fs.mkdirSync(path.join(dir, '.topgun', 'audit-cache'), { recursive: true });
  return dir;
}

function writeCache(homeDir, sha, data) {
  const p = path.join(homeDir, '.topgun', 'audit-cache', `${sha}.json`);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

// ─── Task 1 Tests ────────────────────────────────────────────────────────────

test('Test 1: fresh cache (age < 24h, matching etag) returns hit:true stale:false', () => {
  const home = makeTempHome();
  const sha = 'abc123';
  writeCache(home, sha, {
    skill: 'test-skill',
    cached_at: new Date().toISOString(),
    etag: 'etag-v1',
    updated_at: '2024-01-01T00:00:00Z',
  });
  const res = run(
    ['cache-lookup', sha, '--upstream-etag', 'etag-v1', '--upstream-updated-at', '2024-01-01T00:00:00Z'],
    { HOME: home }
  );
  assert.equal(res.hit, true);
  assert.equal(res.stale, false);
  assert.ok(res.age_hours !== undefined);
});

test('Test 2: expired cache (age > 24h) returns hit:false stale:true with warning', () => {
  const home = makeTempHome();
  const sha = 'abc456';
  const old = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
  writeCache(home, sha, { skill: 'test-skill', cached_at: old });
  const res = run(['cache-lookup', sha], { HOME: home });
  assert.equal(res.hit, false);
  assert.equal(res.stale, true);
  assert.ok(res.age_hours >= 25);
  assert.ok(typeof res.warning === 'string');
  assert.ok(res.warning.includes('hours ago'));
  assert.ok(res.data !== undefined);
});

test('Test 3: --force flag returns hit:false forced:true regardless of age', () => {
  const home = makeTempHome();
  const sha = 'abc789';
  writeCache(home, sha, { skill: 'test-skill', cached_at: new Date().toISOString() });
  const res = run(['cache-lookup', sha, '--force'], { HOME: home });
  assert.equal(res.hit, false);
  assert.equal(res.forced, true);
});

test('Test 4: mismatched upstream_etag returns hit:false invalidated:true', () => {
  const home = makeTempHome();
  const sha = 'def123';
  writeCache(home, sha, {
    skill: 'test-skill',
    cached_at: new Date().toISOString(),
    etag: 'etag-old',
  });
  const res = run(['cache-lookup', sha, '--upstream-etag', 'etag-new'], { HOME: home });
  assert.equal(res.hit, false);
  assert.equal(res.invalidated, true);
  assert.ok(res.reason.includes('etag'));
});

test('Test 5: mismatched upstream_updated_at returns hit:false invalidated:true', () => {
  const home = makeTempHome();
  const sha = 'def456';
  writeCache(home, sha, {
    skill: 'test-skill',
    cached_at: new Date().toISOString(),
    updated_at: '2024-01-01T00:00:00Z',
  });
  const res = run(
    ['cache-lookup', sha, '--upstream-updated-at', '2024-06-01T00:00:00Z'],
    { HOME: home }
  );
  assert.equal(res.hit, false);
  assert.equal(res.invalidated, true);
});

test('Test 6: stale cache returns data in response with warning string containing age in hours', () => {
  const home = makeTempHome();
  const sha = 'def789';
  const old = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
  writeCache(home, sha, { skill: 'stale-skill', cached_at: old });
  const res = run(['cache-lookup', sha], { HOME: home });
  assert.equal(res.hit, false);
  assert.equal(res.stale, true);
  assert.ok(res.data && res.data.skill === 'stale-skill');
  assert.ok(res.warning.match(/\d+\s*hours ago/));
});

// ─── Task 2 Tests ────────────────────────────────────────────────────────────

test('cache-write stores etag and updated_at in cached file', () => {
  const home = makeTempHome();
  const sha = 'write-test';
  const data = JSON.stringify({ skill: 'my-skill' });
  run(['cache-write', sha, data, '--etag', 'etag-v2', '--updated-at', '2025-01-01T00:00:00Z'], { HOME: home });
  const cached = JSON.parse(
    fs.readFileSync(path.join(home, '.topgun', 'audit-cache', `${sha}.json`), 'utf8')
  );
  assert.equal(cached.etag, 'etag-v2');
  assert.equal(cached.updated_at, '2025-01-01T00:00:00Z');
  assert.ok(cached.cached_at);
});

test('lock-write creates topgun-lock.json', () => {
  const home = makeTempHome();
  const lockData = JSON.stringify({ audits: [{ sha: 'abc', cached_at: new Date().toISOString(), source_registry: 'hub' }], topgun_version: '1.0' });
  const res = run(['lock-write', lockData], { HOME: home });
  assert.equal(res.status, 'ok');
  const lockPath = path.join(home, '.topgun', 'topgun-lock.json');
  assert.ok(fs.existsSync(lockPath));
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.ok(lock.locked_at);
  assert.ok(Array.isArray(lock.audits));
  assert.equal(lock.topgun_version, '1.0');
});

test('lock-read returns topgun-lock.json contents', () => {
  const home = makeTempHome();
  const lockData = JSON.stringify({ audits: [], topgun_version: '1.0' });
  run(['lock-write', lockData], { HOME: home });
  const res = run(['lock-read'], { HOME: home });
  assert.ok(res.locked_at);
  assert.equal(res.topgun_version, '1.0');
});

test('lock-read returns {exists:false} when no lock file', () => {
  const home = makeTempHome();
  const res = run(['lock-read'], { HOME: home });
  assert.equal(res.exists, false);
});

test('cache-invalidate deletes single cache file', () => {
  const home = makeTempHome();
  const sha = 'inv-single';
  writeCache(home, sha, { skill: 'x', cached_at: new Date().toISOString() });
  const res = run(['cache-invalidate', sha], { HOME: home });
  assert.equal(res.status, 'ok');
  assert.equal(res.deleted, true);
  assert.ok(!fs.existsSync(path.join(home, '.topgun', 'audit-cache', `${sha}.json`)));
});

test('cache-invalidate returns deleted:false for missing sha', () => {
  const home = makeTempHome();
  const res = run(['cache-invalidate', 'not-exist'], { HOME: home });
  assert.equal(res.status, 'ok');
  assert.equal(res.deleted, false);
});

test('cache-invalidate --all deletes all cache files', () => {
  const home = makeTempHome();
  writeCache(home, 'sha-a', { skill: 'a', cached_at: new Date().toISOString() });
  writeCache(home, 'sha-b', { skill: 'b', cached_at: new Date().toISOString() });
  const res = run(['cache-invalidate', '--all'], { HOME: home });
  assert.equal(res.status, 'ok');
  assert.equal(res.count, 2);
  const files = fs.readdirSync(path.join(home, '.topgun', 'audit-cache'));
  assert.equal(files.length, 0);
});
