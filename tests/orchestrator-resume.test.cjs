'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

const TOOLS = path.join(__dirname, '..', 'bin', 'topgun-tools.cjs');

function runTools(args, env = {}) {
  const result = execSync(`node "${TOOLS}" ${args}`, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  // Handle @file: indirection
  if (result.trim().startsWith('@file:')) {
    const filePath = result.trim().slice('@file:'.length);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return JSON.parse(result);
}

function makeTmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'topgun-test-'));
}

// ─── Test 1: state-write + state-read roundtrip for all valid stage values ───

test('state roundtrip for all stage values', () => {
  const home = makeTmpHome();
  const env = { HOME: home };

  runTools('init', env);

  const stages = ['find', 'compare', 'secure', 'approve', 'install', 'complete'];
  for (const stage of stages) {
    runTools(`state-write last_completed_stage ${stage}`, env);
    const state = runTools('state-read', env);
    assert.equal(state.last_completed_stage, stage, `Expected last_completed_stage to be "${stage}"`);

    runTools(`state-write current_stage ${stage}`, env);
    const state2 = runTools('state-read', env);
    assert.equal(state2.current_stage, stage, `Expected current_stage to be "${stage}"`);
  }

  fs.rmSync(home, { recursive: true, force: true });
});

// ─── Test 2: state.json created by init contains all required fields ───

test('init creates state.json with all required fields', () => {
  const home = makeTmpHome();
  const env = { HOME: home };

  runTools('init', env);

  const statePath = path.join(home, '.topgun', 'state.json');
  assert.ok(fs.existsSync(statePath), 'state.json should exist after init');

  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

  const requiredFields = [
    'current_stage',
    'run_id',
    'started_at',
    'task_description',
    'registries',
    'found_skills_path',
    'comparison_path',
    'audit_path',
    'last_completed_stage',
  ];

  for (const field of requiredFields) {
    assert.ok(Object.prototype.hasOwnProperty.call(state, field), `state.json missing field: ${field}`);
  }

  fs.rmSync(home, { recursive: true, force: true });
});

// ─── Test 3: --reset simulation clears state ───

test('reset simulation clears current_stage, last_completed_stage, and run_id', () => {
  const home = makeTmpHome();
  const env = { HOME: home };

  runTools('init', env);

  // Write some state simulating a mid-pipeline run
  runTools('state-write last_completed_stage compare', env);
  runTools('state-write current_stage compare', env);
  runTools('state-write run_id "2026-01-01T00:00:00Z"', env);
  runTools('state-write found_skills_path "/tmp/found.json"', env);
  runTools('state-write comparison_path "/tmp/comparison.json"', env);

  // Simulate --reset: write null to all key fields
  runTools('state-write current_stage null', env);
  runTools('state-write last_completed_stage null', env);
  runTools('state-write run_id null', env);
  runTools('state-write found_skills_path null', env);
  runTools('state-write comparison_path null', env);
  runTools('state-write audit_path null', env);

  const state = runTools('state-read', env);

  // topgun-tools writes the literal string "null" — that is the reset value
  assert.ok(
    state.current_stage === null || state.current_stage === 'null',
    `current_stage should be null after reset, got: ${state.current_stage}`
  );
  assert.ok(
    state.last_completed_stage === null || state.last_completed_stage === 'null',
    `last_completed_stage should be null after reset, got: ${state.last_completed_stage}`
  );

  fs.rmSync(home, { recursive: true, force: true });
});

// ─── Test 4: SKILL.md contains --offline handling ───

test('SKILL.md contains --offline handling instructions', () => {
  const skillPath = path.join(__dirname, '..', 'skills', 'topgun', 'SKILL.md');
  assert.ok(fs.existsSync(skillPath), 'SKILL.md should exist');

  const content = fs.readFileSync(skillPath, 'utf8');

  assert.ok(content.includes('--offline'), 'SKILL.md must contain --offline flag handling');
  assert.ok(content.includes('--reset'), 'SKILL.md must contain --reset flag handling');
  assert.ok(
    content.includes('No cached results') || content.includes('no cache'),
    'SKILL.md must describe the --offline error message for missing cache'
  );
  assert.ok(
    content.includes('offline=true') || content.includes('offline mode'),
    'SKILL.md must describe offline=true variable or offline mode context'
  );
});

// ─── Test 5: SKILL.md contains file existence verification for each resume stage ───

test('SKILL.md contains file existence verification for all resume stages', () => {
  const skillPath = path.join(__dirname, '..', 'skills', 'topgun', 'SKILL.md');
  const content = fs.readFileSync(skillPath, 'utf8');

  assert.ok(content.includes('existsSync'), 'SKILL.md must use existsSync for file verification');
  assert.ok(content.includes('found_skills_path'), 'SKILL.md must verify found_skills_path exists');
  assert.ok(content.includes('comparison_path'), 'SKILL.md must verify comparison_path exists');
  assert.ok(content.includes('audit_path'), 'SKILL.md must verify audit_path exists');

  // All resume stage names must be present
  for (const stage of ['find', 'compare', 'secure', 'approve', 'install', 'complete']) {
    assert.ok(content.includes(`\`${stage}\``), `SKILL.md must reference stage "${stage}" in resume logic`);
  }
});

// ─── Test 6: schemas command returns state schema with all required stage enum values ───

test('schemas state command returns schema with complete stage enum', () => {
  const schema = runTools('schemas state');

  assert.ok(schema.properties, 'schema should have properties');
  assert.ok(schema.properties.current_stage, 'schema should define current_stage');

  const enumValues = schema.properties.current_stage.enum;
  assert.ok(Array.isArray(enumValues), 'current_stage should have an enum array');

  const expectedStages = ['find', 'compare', 'secure', 'approve', 'install', 'complete'];
  for (const stage of expectedStages) {
    assert.ok(enumValues.includes(stage), `enum should include stage "${stage}"`);
  }

  // null must be in the enum for the initial state
  assert.ok(enumValues.includes(null), 'enum should include null for initial/reset state');

  // required fields
  assert.ok(schema.required.includes('current_stage'), 'current_stage should be required');
  assert.ok(schema.required.includes('run_id'), 'run_id should be required');
});
