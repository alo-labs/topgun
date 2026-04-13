'use strict';

/**
 * Smoke tests — structural validity of the plugin.
 * Verifies JSON files parse correctly, required fields exist,
 * SKILL.md files have valid frontmatter, and adapters are all present.
 * Run: node --test tests/smoke.test.cjs
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function readJSON(relPath) {
  const absPath = path.join(ROOT, relPath);
  assert.ok(fs.existsSync(absPath), `File not found: ${relPath}`);
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

function parseFrontmatter(content) {
  // Simple YAML frontmatter parser: extract between first --- delimiters
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fm = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    // Strip inline YAML quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Multi-line block scalar indicator (>)
    if (value === '>') value = '(block-scalar)';
    if (key) fm[key] = value;
  }
  return fm;
}

// ─── Plugin JSON files ────────────────────────────────────────────────────────

describe('.claude-plugin/plugin.json', () => {
  test('parses as valid JSON', () => {
    const data = readJSON('.claude-plugin/plugin.json');
    assert.ok(typeof data === 'object' && data !== null);
  });

  test('has required field: name', () => {
    const data = readJSON('.claude-plugin/plugin.json');
    assert.ok(data.name, 'plugin.json must have name field');
  });

  test('has required field: version', () => {
    const data = readJSON('.claude-plugin/plugin.json');
    assert.ok(data.version, 'plugin.json must have version field');
  });

  test('has required field: skills', () => {
    const data = readJSON('.claude-plugin/plugin.json');
    assert.ok(data.skills, 'plugin.json must have skills field');
  });

  test('has required field: agents (non-empty array of paths)', () => {
    const data = readJSON('.claude-plugin/plugin.json');
    assert.ok(Array.isArray(data.agents) && data.agents.length > 0, 'plugin.json must have non-empty agents array');
    for (const agentPath of data.agents) {
      assert.ok(typeof agentPath === 'string' && agentPath.length > 0, 'each agent entry must be a non-empty string path');
    }
  });

  test('all declared agent files exist on disk', () => {
    const data = readJSON('.claude-plugin/plugin.json');
    assert.ok(Array.isArray(data.agents), 'agents must be an array');
    for (const agentPath of data.agents) {
      const resolved = agentPath.startsWith('./') ? agentPath.slice(2) : agentPath;
      assert.ok(fs.existsSync(path.join(ROOT, resolved)), `agent file declared in plugin.json not found: ${agentPath}`);
    }
  });
});

describe('.claude-plugin/marketplace.json', () => {
  test('parses as valid JSON', () => {
    const data = readJSON('.claude-plugin/marketplace.json');
    assert.ok(typeof data === 'object' && data !== null);
  });

  test('has required field: name (string)', () => {
    const data = readJSON('.claude-plugin/marketplace.json');
    assert.ok(typeof data.name === 'string' && data.name.length > 0, 'marketplace.json must have name string');
  });

  test('has required field: owner with name and email', () => {
    const data = readJSON('.claude-plugin/marketplace.json');
    assert.ok(data.owner && typeof data.owner === 'object', 'marketplace.json must have owner object');
    assert.ok(typeof data.owner.name === 'string' && data.owner.name.length > 0, 'owner.name must be a non-empty string');
    assert.ok(typeof data.owner.email === 'string' && data.owner.email.length > 0, 'owner.email must be a non-empty string');
  });

  test('has required field: metadata with description and version', () => {
    const data = readJSON('.claude-plugin/marketplace.json');
    assert.ok(data.metadata && typeof data.metadata === 'object', 'marketplace.json must have metadata object');
    assert.ok(typeof data.metadata.description === 'string' && data.metadata.description.length > 0, 'metadata.description must be a non-empty string');
    assert.ok(typeof data.metadata.version === 'string' && data.metadata.version.length > 0, 'metadata.version must be a non-empty string');
  });

  test('has required field: plugins (non-empty array)', () => {
    const data = readJSON('.claude-plugin/marketplace.json');
    assert.ok(Array.isArray(data.plugins) && data.plugins.length > 0, 'marketplace.json must have non-empty plugins array');
  });

  test('each plugin entry has name, source, description, version, and strict', () => {
    const data = readJSON('.claude-plugin/marketplace.json');
    assert.ok(Array.isArray(data.plugins), 'plugins must be an array');
    for (const plugin of data.plugins) {
      assert.ok(typeof plugin.name === 'string' && plugin.name.length > 0, `plugin.name must be a non-empty string`);
      assert.ok(plugin.source && typeof plugin.source === 'object', `plugin.source must be an object`);
      assert.ok(typeof plugin.source.source === 'string', `plugin.source.source must be a string`);
      assert.ok(typeof plugin.source.url === 'string' && plugin.source.url.length > 0, `plugin.source.url must be a non-empty string`);
      assert.ok(typeof plugin.description === 'string' && plugin.description.length > 0, `plugin.description must be a non-empty string`);
      assert.ok(typeof plugin.version === 'string' && plugin.version.length > 0, `plugin.version must be a non-empty string`);
      assert.ok(typeof plugin.strict === 'boolean', `plugin.strict must be a boolean`);
    }
  });
});

// ─── package.json ─────────────────────────────────────────────────────────────

describe('package.json', () => {
  test('parses as valid JSON', () => {
    const data = readJSON('package.json');
    assert.ok(typeof data === 'object' && data !== null);
  });

  test('has @alo-labs/topgun name', () => {
    const data = readJSON('package.json');
    assert.equal(data.name, '@alo-labs/topgun');
  });

  test('has claude-skill keyword', () => {
    const data = readJSON('package.json');
    assert.ok(Array.isArray(data.keywords), 'keywords should be array');
    assert.ok(data.keywords.includes('claude-skill'), 'must include claude-skill keyword');
  });
});

// ─── SKILL.md files ───────────────────────────────────────────────────────────

const SKILL_FILES = [
  'skills/topgun/SKILL.md',
  'skills/find-skills/SKILL.md',
  'skills/compare-skills/SKILL.md',
  'skills/secure-skills/SKILL.md',
  'skills/install-skills/SKILL.md',
];

describe('SKILL.md files — existence and frontmatter', () => {
  for (const relPath of SKILL_FILES) {
    test(`${relPath} exists`, () => {
      assert.ok(fs.existsSync(path.join(ROOT, relPath)), `${relPath} must exist`);
    });

    test(`${relPath} has valid YAML frontmatter with name`, () => {
      const content = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
      const fm = parseFrontmatter(content);
      assert.ok(fm, `${relPath} must have YAML frontmatter`);
      assert.ok(fm.name, `${relPath} frontmatter must have name field`);
    });

    test(`${relPath} has valid YAML frontmatter with description`, () => {
      const content = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
      const fm = parseFrontmatter(content);
      assert.ok(fm, `${relPath} must have YAML frontmatter`);
      assert.ok(fm.description, `${relPath} frontmatter must have description field`);
    });
  }
});

// ─── Agent .md files ──────────────────────────────────────────────────────────

const AGENT_FILES = [
  'agents/topgun-finder.md',
  'agents/topgun-comparator.md',
  'agents/topgun-securer.md',
  'agents/topgun-installer.md',
];

describe('Agent .md files — existence and frontmatter', () => {
  for (const relPath of AGENT_FILES) {
    test(`${relPath} exists`, () => {
      assert.ok(fs.existsSync(path.join(ROOT, relPath)), `${relPath} must exist`);
    });

    test(`${relPath} has valid YAML frontmatter with name`, () => {
      const content = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
      const fm = parseFrontmatter(content);
      assert.ok(fm, `${relPath} must have YAML frontmatter`);
      assert.ok(fm.name, `${relPath} frontmatter must have name field`);
    });

    test(`${relPath} has valid YAML frontmatter with description`, () => {
      const content = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
      const fm = parseFrontmatter(content);
      assert.ok(fm, `${relPath} must have YAML frontmatter`);
      assert.ok(fm.description, `${relPath} frontmatter must have description field`);
    });
  }
});

// ─── Adapter files (11 total) ─────────────────────────────────────────────────

const EXPECTED_ADAPTERS = [
  'agentskill-sh.md',
  'claude-plugins-official.md',
  'clawhub.md',
  'cursor-directory.md',
  'github.md',
  'gitlab.md',
  'glama.md',
  'huggingface.md',
  'langchain-hub.md',
  'lobehub.md',
  'mcp-so.md',
  'npm.md',
  'opentools.md',
  'osm.md',
  'skills-sh.md',
  'skillsmp.md',
  'smithery.md',
  'vskill.md',
];

describe('adapter files — all 11 present', () => {
  const adaptersDir = path.join(ROOT, 'skills', 'find-skills', 'adapters');

  test('adapters directory exists', () => {
    assert.ok(fs.existsSync(adaptersDir), 'skills/find-skills/adapters/ must exist');
  });

  for (const adapterFile of EXPECTED_ADAPTERS) {
    test(`adapter ${adapterFile} exists`, () => {
      const fullPath = path.join(adaptersDir, adapterFile);
      assert.ok(fs.existsSync(fullPath), `adapter file ${adapterFile} must exist`);
    });
  }

  test('adapter count is exactly 18', () => {
    const files = fs.readdirSync(adaptersDir).filter(f => f.endsWith('.md'));
    assert.equal(files.length, 18, `expected 18 adapters, found ${files.length}: ${files.join(', ')}`);
  });
});

// ─── bin/topgun-tools.cjs ─────────────────────────────────────────────────────

describe('bin/topgun-tools.cjs', () => {
  test('file exists', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'bin', 'topgun-tools.cjs')));
  });

  test('file is executable', () => {
    try {
      fs.accessSync(path.join(ROOT, 'bin', 'topgun-tools.cjs'), fs.constants.X_OK);
    } catch {
      assert.fail('bin/topgun-tools.cjs must be executable (chmod +x)');
    }
  });
});

// ─── README.md ────────────────────────────────────────────────────────────────

describe('README.md', () => {
  test('exists', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'README.md')));
  });

  test('contains "plugin install"', () => {
    const content = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    assert.ok(content.includes('plugin install'), 'README.md must contain "plugin install"');
  });

  test('contains "/topgun"', () => {
    const content = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    assert.ok(content.includes('/topgun'), 'README.md must contain "/topgun"');
  });
});

// ─── --auto-approve flag ──────────────────────────────────────────────────────

describe('skills/topgun/SKILL.md — --auto-approve flag', () => {
  const skillPath = path.join(ROOT, 'skills', 'topgun', 'SKILL.md');

  test('contains --auto-approve flag documentation', () => {
    const content = fs.readFileSync(skillPath, 'utf8');
    assert.ok(
      content.includes('--auto-approve'),
      'skills/topgun/SKILL.md must document the --auto-approve flag'
    );
  });

  test('contains auto_approve state variable', () => {
    const content = fs.readFileSync(skillPath, 'utf8');
    assert.ok(
      content.includes('auto_approve'),
      'skills/topgun/SKILL.md must reference the auto_approve state variable'
    );
  });
});

// ─── hooks/hooks.json ─────────────────────────────────────────────────────────

describe('hooks/hooks.json', () => {
  test('parses as valid JSON', () => {
    const data = readJSON('hooks/hooks.json');
    assert.ok(typeof data === 'object' && data !== null);
  });
});
