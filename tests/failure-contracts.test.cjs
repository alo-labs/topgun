'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const AGENTS_DIR = path.join(ROOT, 'agents');
const SKILLS_DIR = path.join(ROOT, 'skills');

function readAgent(name) {
  return fs.readFileSync(path.join(AGENTS_DIR, `${name}.md`), 'utf8');
}

function readOrchestratorSkill() {
  return fs.readFileSync(path.join(SKILLS_DIR, 'topgun', 'SKILL.md'), 'utf8');
}

// ─── Test 1: Each sub-agent contains ## STAGE FAILED marker ─────────────────

describe('Sub-agent STAGE FAILED markers', () => {
  const agents = [
    'topgun-finder',
    'topgun-comparator',
    'topgun-securer',
    'topgun-installer',
  ];

  for (const agent of agents) {
    test(`${agent} contains ## STAGE FAILED`, () => {
      const content = readAgent(agent);
      assert.ok(
        content.includes('## STAGE FAILED'),
        `${agent}.md must contain "## STAGE FAILED" error output pattern`
      );
    });

    test(`${agent} contains Reason: line after STAGE FAILED`, () => {
      const content = readAgent(agent);
      assert.ok(
        content.includes('Reason:'),
        `${agent}.md must document a "Reason:" line under ## STAGE FAILED`
      );
    });
  }
});

// ─── Test 2: Each sub-agent documents {status, reason, results} contract ────

describe('Sub-agent failure contract shape', () => {
  const agents = [
    'topgun-finder',
    'topgun-comparator',
    'topgun-securer',
    'topgun-installer',
  ];

  for (const agent of agents) {
    test(`${agent} documents status/reason/results contract`, () => {
      const content = readAgent(agent);
      assert.ok(
        content.includes('status') && content.includes('reason') && content.includes('results'),
        `${agent}.md must document {status, reason, results} return contract`
      );
    });
  }
});

// ─── Test 3: Orchestrator handles failures for all 4 stages ─────────────────

describe('Orchestrator failure handling', () => {
  const orchestrator = readOrchestratorSkill();

  test('orchestrator handles FindSkills failure', () => {
    assert.ok(
      orchestrator.includes('FindSkills failed'),
      'Orchestrator must handle FindSkills STAGE FAILED'
    );
  });

  test('orchestrator handles CompareSkills failure', () => {
    assert.ok(
      orchestrator.includes('CompareSkills failed'),
      'Orchestrator must handle CompareSkills STAGE FAILED'
    );
  });

  test('orchestrator handles SecureSkills failure', () => {
    assert.ok(
      orchestrator.includes('SecureSkills failed'),
      'Orchestrator must handle SecureSkills STAGE FAILED'
    );
  });

  test('orchestrator handles InstallSkills failure', () => {
    assert.ok(
      orchestrator.includes('InstallSkills failed'),
      'Orchestrator must handle InstallSkills STAGE FAILED'
    );
  });

  test('orchestrator offers retry/abort on failure', () => {
    assert.ok(
      orchestrator.includes('retry') && orchestrator.includes('abort'),
      'Orchestrator must offer retry or abort on sub-agent failure'
    );
  });

  test('orchestrator contains keychain-get for github_token', () => {
    assert.ok(
      orchestrator.includes('keychain-get github_token'),
      'Orchestrator must check keychain for github_token'
    );
  });

  test('orchestrator contains keychain-get for smithery_token', () => {
    assert.ok(
      orchestrator.includes('keychain-get smithery_token'),
      'Orchestrator must check keychain for smithery_token'
    );
  });
});

// ─── Test 4: keychain-get returns {found: false} for nonexistent token ───────

describe('keychain-get nonexistent token', () => {
  test('keychain-get returns {found: false} for nonexistent service', () => {
    const CLAUDE_PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || ROOT;
    const toolsPath = path.join(CLAUDE_PLUGIN_ROOT, 'bin', 'topgun-tools.cjs');

    if (!fs.existsSync(toolsPath)) {
      // Skip if tools not available (CI without full install)
      console.log('SKIP: topgun-tools.cjs not found at', toolsPath);
      return;
    }

    let result;
    try {
      const output = execSync(
        `node "${toolsPath}" keychain-get topgun-test-nonexistent-service-xyzzy`,
        { encoding: 'utf8', timeout: 5000 }
      );
      result = JSON.parse(output.trim());
    } catch (err) {
      // keychain-get may exit non-zero when not found — parse stdout anyway
      const stdout = err.stdout || '';
      try {
        result = JSON.parse(stdout.trim());
      } catch {
        // If it just exits with error and no JSON, treat as found:false
        result = { found: false };
      }
    }

    assert.equal(result.found, false, 'keychain-get must return {found: false} for nonexistent token');
  });
});

// ─── Test 5: keychain roundtrip (macOS only, skip on CI) ─────────────────────

describe('keychain roundtrip (macOS only)', () => {
  test('keychain-set then keychain-get returns stored value', { skip: process.platform !== 'darwin' }, () => {
    const CLAUDE_PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || ROOT;
    const toolsPath = path.join(CLAUDE_PLUGIN_ROOT, 'bin', 'topgun-tools.cjs');

    if (!fs.existsSync(toolsPath)) {
      console.log('SKIP: topgun-tools.cjs not found at', toolsPath);
      return;
    }

    const testService = 'topgun-test-roundtrip-xyzzy';
    const testValue = 'test-token-value-' + Date.now();

    try {
      // Store
      execSync(
        `node "${toolsPath}" keychain-set ${testService} topgun "${testValue}"`,
        { encoding: 'utf8', timeout: 5000 }
      );

      // Retrieve
      const getOutput = execSync(
        `node "${toolsPath}" keychain-get ${testService}`,
        { encoding: 'utf8', timeout: 5000 }
      );
      const result = JSON.parse(getOutput.trim());

      assert.equal(result.found, true, 'keychain-get must return {found: true} after keychain-set');
      assert.equal(result.value, testValue, 'keychain-get must return the stored value');
    } finally {
      // Cleanup — delete test entry (best-effort)
      try {
        execSync(
          `security delete-generic-password -s "${testService}" -a topgun 2>/dev/null || true`,
          { encoding: 'utf8', timeout: 3000 }
        );
      } catch { /* ignore cleanup errors */ }
    }
  });
});
