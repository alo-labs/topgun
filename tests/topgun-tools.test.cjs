'use strict';

/**
 * Full unit tests for all topgun-tools.cjs commands.
 * Run: node --test tests/topgun-tools.test.cjs
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, execSync } = require('node:child_process');

const TOOLS = path.join(__dirname, '..', 'bin', 'topgun-tools.cjs');

function run(args, env = {}) {
  try {
    const result = execFileSync(process.execPath, [TOOLS, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    if (result.trim().startsWith('@file:')) {
      return JSON.parse(fs.readFileSync(result.trim().slice(6), 'utf8'));
    }
    return JSON.parse(result);
  } catch (err) {
    throw new Error(`CLI error: ${err.stderr || err.message}`);
  }
}

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'topgun-unit-'));
}

function makeInitHome() {
  const dir = makeTempHome();
  run(['init'], { HOME: dir });
  return dir;
}

// ─── init ────────────────────────────────────────────────────────────────────

describe('init', () => {
  test('creates ~/.topgun directory hierarchy', () => {
    const home = makeTempHome();
    const res = run(['init'], { HOME: home });
    assert.equal(res.status, 'ok');

    const base = path.join(home, '.topgun');
    assert.ok(fs.existsSync(base), '.topgun/ should exist');
    assert.ok(fs.existsSync(path.join(base, 'cache')), 'cache/ should exist');
    assert.ok(fs.existsSync(path.join(base, 'secured')), 'secured/ should exist');
    assert.ok(fs.existsSync(path.join(base, 'audit-cache')), 'audit-cache/ should exist');
    assert.ok(fs.existsSync(path.join(base, 'sessions')), 'sessions/ should exist');
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('creates state.json on first run', () => {
    const home = makeTempHome();
    run(['init'], { HOME: home });
    const statePath = path.join(home, '.topgun', 'state.json');
    assert.ok(fs.existsSync(statePath), 'state.json should be created');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.ok('current_stage' in state);
    assert.ok('run_id' in state);
    assert.ok('last_completed_stage' in state);
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('creates installed.json on first run', () => {
    const home = makeTempHome();
    run(['init'], { HOME: home });
    const installedPath = path.join(home, '.topgun', 'installed.json');
    assert.ok(fs.existsSync(installedPath));
    const installed = JSON.parse(fs.readFileSync(installedPath, 'utf8'));
    assert.ok(Array.isArray(installed.skills));
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('does not overwrite existing state.json', () => {
    const home = makeInitHome();
    run(['state-write', 'task_description', 'preserve me'], { HOME: home });
    run(['init'], { HOME: home }); // run init again
    const state = run(['state-read'], { HOME: home });
    assert.equal(state.task_description, 'preserve me');
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('prunes only legacy TopGun hook entries from Codex user config', () => {
    const home = makeTempHome();
    const legacyHooks = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Write',
            hooks: [
              {
                type: 'command',
                command: 'bash "/Users/example/.claude/plugins/cache/alo-labs/topgun/topgun/1.3.0/bin/hooks/validate-partials.sh"',
                timeout: 10,
              },
              {
                type: 'command',
                command: 'node "/tmp/preserve.js"',
                timeout: 5,
              },
            ],
          },
          {
            matcher: 'Write',
            hooks: [
              {
                type: 'command',
                command: 'bash "/Users/example/.claude/plugins/cache/alo-labs/topgun/topgun/1.3.0/bin/hooks/validate-partials.sh"',
                timeout: 10,
              },
            ],
          },
          {
            matcher: 'Bash',
            hooks: [
              {
                type: 'command',
                command: 'bash "/Users/example/.claude/plugins/cache/alo-labs-codex/sidekick/1.5.4/bin/hooks/validate-release-gate.sh"',
                timeout: 10,
              },
            ],
          },
        ],
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node "/tmp/session-hook.js"',
              },
            ],
          },
        ],
      },
    };

    for (const codexDir of ['.codex', '.Codex']) {
      const hooksPath = path.join(home, codexDir, 'hooks.json');
      fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
      fs.writeFileSync(hooksPath, JSON.stringify(legacyHooks, null, 2));
    }

    run(['init'], { HOME: home });

    for (const codexDir of ['.codex', '.Codex']) {
      const hooksPath = path.join(home, codexDir, 'hooks.json');
      const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
      const preToolUse = hooks.hooks.PreToolUse;

      assert.equal(preToolUse.length, 2, `${codexDir} should keep the preserved hook entry and the unrelated matcher`);
      const writeEntry = preToolUse.find(entry => entry.matcher === 'Write');
      assert.ok(writeEntry, `${codexDir} should keep a Write matcher after migration`);
      const writeCommands = writeEntry.hooks.map(hook => hook.command);
      assert.ok(writeCommands.includes('node "/tmp/preserve.js"'), `${codexDir} should preserve unrelated hook commands`);
      assert.ok(!writeCommands.some(command => command.includes('validate-partials.sh')), `${codexDir} should remove TopGun legacy hook commands`);
      const bashEntry = preToolUse.find(entry => entry.matcher === 'Bash');
      assert.ok(bashEntry, `${codexDir} should preserve unrelated Bash matcher entries`);
      assert.ok(
        bashEntry.hooks.some(hook => hook.command.includes('validate-release-gate.sh')),
        `${codexDir} should leave Sidekick hooks untouched`
      );

      assert.ok(
        hooks.hooks.SessionStart.some(entry => entry.hooks.some(hook => hook.command === 'node "/tmp/session-hook.js"')),
        `${codexDir} should preserve unrelated SessionStart hooks`
      );
    }

    fs.rmSync(home, { recursive: true, force: true });
  });
});

// ─── state-read / state-write ─────────────────────────────────────────────────

describe('state-read / state-write', () => {
  test('roundtrip: write then read returns same value', () => {
    const home = makeInitHome();
    run(['state-write', 'task_description', 'deploy k8s'], { HOME: home });
    const state = run(['state-read'], { HOME: home });
    assert.equal(state.task_description, 'deploy k8s');
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('merge semantics: write one field does not erase others', () => {
    const home = makeInitHome();
    run(['state-write', 'task_description', 'deploy k8s'], { HOME: home });
    run(['state-write', 'current_stage', 'find'], { HOME: home });
    const state = run(['state-read'], { HOME: home });
    assert.equal(state.task_description, 'deploy k8s');
    assert.equal(state.current_stage, 'find');
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('state-read returns error when state.json is missing', () => {
    const home = makeTempHome();
    // Do NOT run init — no state.json
    const res = run(['state-read'], { HOME: home });
    assert.ok(res.error, 'should return error object');
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('state-write creates state.json if missing', () => {
    const home = makeTempHome();
    fs.mkdirSync(path.join(home, '.topgun'), { recursive: true });
    run(['state-write', 'current_stage', 'find'], { HOME: home });
    const statePath = path.join(home, '.topgun', 'state.json');
    assert.ok(fs.existsSync(statePath));
    fs.rmSync(home, { recursive: true, force: true });
  });
});

// ─── sha256 ───────────────────────────────────────────────────────────────────

describe('sha256', () => {
  test('produces correct hash for "hello world"', () => {
    // SHA-256("hello world") = b94d27b9934d3e08a52e52d7da7dabfac484efe04e751d0c7e8b9a28f359c012
    // Note: node crypto("hello world") => b94d27b9934d3e08a52e52d7da7dabfac484efe04e751d0c7e8b9a28f359c012
    const res = run(['sha256', 'hello', 'world']);
    assert.ok(res.hash, 'should return a hash field');
    assert.match(res.hash, /^[0-9a-f]{64}$/);
    // Verify it matches node's own crypto output
    const crypto = require('node:crypto');
    const expected = crypto.createHash('sha256').update('hello world').digest('hex');
    assert.equal(res.hash, expected);
  });

  test('produces consistent hash for same input', () => {
    const res1 = run(['sha256', 'kubernetes', 'deployment']);
    const res2 = run(['sha256', 'kubernetes', 'deployment']);
    assert.equal(res1.hash, res2.hash);
  });

  test('produces different hashes for different inputs', () => {
    const res1 = run(['sha256', 'foo']);
    const res2 = run(['sha256', 'bar']);
    assert.notEqual(res1.hash, res2.hash);
  });

  test('returns 64-character hex string', () => {
    const res = run(['sha256', 'test-skill-content']);
    assert.equal(res.hash.length, 64);
    assert.match(res.hash, /^[0-9a-f]+$/);
  });
});

// ─── cache-lookup ─────────────────────────────────────────────────────────────
// (more extensive tests are in topgun-tools-cache.test.cjs — we add only gaps here)

describe('cache-lookup (additional cases)', () => {
  test('returns hit:false for missing sha (no args)', () => {
    const home = makeTempHome();
    fs.mkdirSync(path.join(home, '.topgun', 'audit-cache'), { recursive: true });
    const res = run(['cache-lookup'], { HOME: home });
    assert.equal(res.hit, false);
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('returns hit:false when cache file does not exist', () => {
    const home = makeTempHome();
    fs.mkdirSync(path.join(home, '.topgun', 'audit-cache'), { recursive: true });
    const res = run(['cache-lookup', 'nonexistent-sha'], { HOME: home });
    assert.equal(res.hit, false);
    fs.rmSync(home, { recursive: true, force: true });
  });
});

// ─── cache-write ──────────────────────────────────────────────────────────────

describe('cache-write', () => {
  test('writes JSON and sets cached_at automatically', () => {
    const home = makeTempHome();
    fs.mkdirSync(path.join(home, '.topgun', 'audit-cache'), { recursive: true });
    const data = JSON.stringify({ skill: 'my-skill', version: '1.0' });
    run(['cache-write', 'test-sha-write', data], { HOME: home });
    const file = path.join(home, '.topgun', 'audit-cache', 'test-sha-write.json');
    assert.ok(fs.existsSync(file));
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(cached.skill, 'my-skill');
    assert.ok(cached.cached_at, 'cached_at should be set automatically');
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('stores etag and updated_at when provided', () => {
    const home = makeTempHome();
    fs.mkdirSync(path.join(home, '.topgun', 'audit-cache'), { recursive: true });
    const data = JSON.stringify({ skill: 'etag-skill' });
    run(['cache-write', 'etag-sha', data, '--etag', 'v-etag-1', '--updated-at', '2025-06-01T00:00:00Z'], { HOME: home });
    const cached = JSON.parse(fs.readFileSync(
      path.join(home, '.topgun', 'audit-cache', 'etag-sha.json'), 'utf8'
    ));
    assert.equal(cached.etag, 'v-etag-1');
    assert.equal(cached.updated_at, '2025-06-01T00:00:00Z');
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('overwrites existing cache entry', () => {
    const home = makeTempHome();
    fs.mkdirSync(path.join(home, '.topgun', 'audit-cache'), { recursive: true });
    run(['cache-write', 'overwrite-sha', JSON.stringify({ v: 1 })], { HOME: home });
    run(['cache-write', 'overwrite-sha', JSON.stringify({ v: 2 })], { HOME: home });
    const cached = JSON.parse(fs.readFileSync(
      path.join(home, '.topgun', 'audit-cache', 'overwrite-sha.json'), 'utf8'
    ));
    assert.equal(cached.v, 2);
    fs.rmSync(home, { recursive: true, force: true });
  });
});

// ─── cache-invalidate ─────────────────────────────────────────────────────────
// (already covered in topgun-tools-cache.test.cjs, skip duplication)

// ─── lock-write / lock-read ───────────────────────────────────────────────────

describe('lock-write / lock-read', () => {
  test('lock roundtrip: write then read', () => {
    const home = makeTempHome();
    fs.mkdirSync(path.join(home, '.topgun'), { recursive: true });
    const lockData = JSON.stringify({
      audits: [{ sha: 'abc123', cached_at: new Date().toISOString(), source_registry: 'skills-sh' }],
      topgun_version: '1.0',
    });
    run(['lock-write', lockData], { HOME: home });
    const res = run(['lock-read'], { HOME: home });
    assert.ok(res.locked_at);
    assert.equal(res.topgun_version, '1.0');
    assert.ok(Array.isArray(res.audits));
    assert.equal(res.audits.length, 1);
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('lock-read returns {exists:false} when no lock file', () => {
    const home = makeTempHome();
    fs.mkdirSync(path.join(home, '.topgun'), { recursive: true });
    const res = run(['lock-read'], { HOME: home });
    assert.equal(res.exists, false);
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('lock-write adds locked_at timestamp automatically', () => {
    const home = makeTempHome();
    fs.mkdirSync(path.join(home, '.topgun'), { recursive: true });
    run(['lock-write', JSON.stringify({ audits: [], topgun_version: '2.0' })], { HOME: home });
    const lockPath = path.join(home, '.topgun', 'topgun-lock.json');
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    assert.ok(lock.locked_at, 'locked_at must be set automatically');
    // Should be a valid ISO timestamp
    assert.ok(!isNaN(Date.parse(lock.locked_at)));
    fs.rmSync(home, { recursive: true, force: true });
  });
});

// ─── keychain-get / keychain-set ─────────────────────────────────────────────

describe('keychain-get / keychain-set', () => {
  test('keychain-get returns {found:false} for nonexistent service', () => {
    const res = run(['keychain-get', 'topgun-nonexistent-service-zzzzzz']);
    assert.equal(res.found, false);
  });

  test('keychain roundtrip (macOS only)', { skip: process.platform !== 'darwin' }, () => {
    const svc = 'topgun-test-unit-' + Date.now();
    const pw = 'test-token-' + Math.random().toString(36).slice(2);
    try {
      run(['keychain-set', svc, 'topgun', pw]);
      const res = run(['keychain-get', svc]);
      assert.equal(res.found, true);
      assert.equal(res.value, pw);
    } finally {
      try {
        execSync(`security delete-generic-password -s "${svc}" -a topgun 2>/dev/null || true`);
      } catch { /* ignore */ }
    }
  });
});

// ─── schemas ──────────────────────────────────────────────────────────────────

describe('schemas', () => {
  test('schemas state returns object with required fields', () => {
    const schema = run(['schemas', 'state']);
    assert.ok(schema.properties);
    assert.ok(schema.required);
    assert.ok(schema.properties.current_stage);
    assert.ok(schema.properties.run_id);
  });

  test('schemas found-skills returns correct structure', () => {
    const schema = run(['schemas', 'found-skills']);
    assert.ok(schema.properties.results);
    assert.ok(schema.required.includes('query'));
    assert.ok(schema.required.includes('results'));
  });

  test('schemas comparison-results returns candidate schema', () => {
    const schema = run(['schemas', 'comparison-results']);
    assert.ok(schema.properties.candidates);
    assert.ok(schema.properties.winner);
    assert.ok(schema.required.includes('candidates'));
    assert.ok(schema.required.includes('winner'));
  });

  test('schemas audit-manifest returns audit schema', () => {
    const schema = run(['schemas', 'audit-manifest']);
    assert.ok(schema.properties.skill_name);
    assert.ok(schema.properties.content_sha);
    assert.ok(schema.properties.disclaimer);
    assert.ok(schema.required.includes('skill_name'));
    assert.ok(schema.required.includes('disclaimer'));
  });
});
