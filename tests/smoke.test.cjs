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
const CURRENT_VERSION = '0.7.7';
const TOPGUN_SKILL_SHA256 = 'c648ae758fd9ad0d66b0b788a2f58af5818b926e6a9a92118834e360c7824820';

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

function assertPluginManifest(relPath) {
  const data = readJSON(relPath);
  assert.ok(typeof data === 'object' && data !== null, `${relPath} must parse as JSON`);
  assert.equal(data.name, 'topgun', `${relPath} must have name topgun`);
  assert.equal(data.version, CURRENT_VERSION, `${relPath} must stay aligned to version ${CURRENT_VERSION}`);
  assert.equal(data.forge_skill_md_sha256, TOPGUN_SKILL_SHA256, `${relPath} must carry the TopGun skill SHA-256`);
  assert.equal(data.skills, './skills/', `${relPath} must point skills at ./skills/`);
  assert.equal(data.hooks, './hooks/hooks.json', `${relPath} must point hooks at ./hooks/hooks.json`);
  assert.ok(Array.isArray(data.agents) && data.agents.length > 0, `${relPath} must have a non-empty agents array`);
  for (const agentPath of data.agents) {
    assert.ok(typeof agentPath === 'string' && agentPath.length > 0, `${relPath} agent entries must be non-empty string paths`);
    const resolved = agentPath.startsWith('./') ? agentPath.slice(2) : agentPath;
    assert.ok(fs.existsSync(path.join(ROOT, resolved)), `${relPath} declared agent file not found: ${agentPath}`);
  }
}

describe('.claude-plugin/plugin.json', () => {
  test('parses as valid JSON and exposes shared skills', () => {
    assertPluginManifest('.claude-plugin/plugin.json');
  });
});

describe('.codex-plugin/plugin.json', () => {
  test('parses as valid JSON and exposes shared skills', () => {
    assertPluginManifest('.codex-plugin/plugin.json');
    const data = readJSON('.codex-plugin/plugin.json');
    assert.ok(data.interface && typeof data.interface === 'object', '.codex-plugin/plugin.json must include interface metadata');
    assert.equal(data.interface.displayName, 'TopGun', 'codex interface displayName must be TopGun');
    assert.ok(typeof data.interface.shortDescription === 'string' && data.interface.shortDescription.length > 0, 'codex interface shortDescription must exist');
    assert.ok(typeof data.interface.longDescription === 'string' && data.interface.longDescription.length > 0, 'codex interface longDescription must exist');
    assert.equal(data.interface.developerName, 'Alo Labs', 'codex interface developerName must be Alo Labs');
    assert.equal(data.interface.category, 'Development', 'codex interface category must be Development');
    assert.ok(Array.isArray(data.interface.capabilities) && data.interface.capabilities.length > 0, 'codex interface capabilities must be a non-empty array');
    assert.ok(typeof data.interface.websiteURL === 'string' && data.interface.websiteURL.length > 0, 'codex interface websiteURL must exist');
    assert.ok(Array.isArray(data.interface.defaultPrompt) && data.interface.defaultPrompt.length > 0, 'codex interface defaultPrompt must be a non-empty array');
    assert.ok(typeof data.interface.brandColor === 'string' && data.interface.brandColor.length > 0, 'codex interface brandColor must exist');
  });
});

describe('hooks/hooks.json', () => {
  test('parses as valid JSON and matches the Claude hook bundle', () => {
    const rootHooks = readJSON('hooks/hooks.json');
    const claudeHooks = readJSON('.claude-plugin/hooks/hooks.json');
    assert.deepEqual(rootHooks, claudeHooks, 'hooks/hooks.json must match .claude-plugin/hooks/hooks.json');
    const serialized = JSON.stringify(rootHooks);
    assert.ok(serialized.includes('CODEX_PLUGIN_ROOT'), 'hooks/hooks.json must use CODEX_PLUGIN_ROOT');
    assert.ok(!serialized.includes('CLAUDE_PLUGIN_ROOT'), 'hooks/hooks.json must not use CLAUDE_PLUGIN_ROOT');
  });
});

describe('.claude-plugin/marketplace.json', () => {
  test('parses as valid JSON', () => {
    const data = readJSON('.claude-plugin/marketplace.json');
    assert.ok(typeof data === 'object' && data !== null);
  });

  test('has required field: name = Ālo Labs', () => {
    const data = readJSON('.claude-plugin/marketplace.json');
    assert.equal(data.name, 'Ālo Labs', 'marketplace.json must be named Ālo Labs');
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
      assert.ok(typeof plugin.source.repo === 'string' && plugin.source.repo.length > 0, `plugin.source.repo must be a non-empty string`);
      assert.ok(typeof plugin.description === 'string' && plugin.description.length > 0, `plugin.description must be a non-empty string`);
      assert.ok(typeof plugin.version === 'string' && plugin.version.length > 0, `plugin.version must be a non-empty string`);
      assert.ok(typeof plugin.strict === 'boolean', `plugin.strict must be a boolean`);
    }
  });
});

describe('.agents/plugins/marketplace.json', () => {
  test('parses as valid JSON', () => {
    const data = readJSON('.agents/plugins/marketplace.json');
    assert.ok(typeof data === 'object' && data !== null);
  });

  test('has required field: name = Ālo Labs', () => {
    const data = readJSON('.agents/plugins/marketplace.json');
    assert.equal(data.name, 'Ālo Labs', 'marketplace.json must be named Ālo Labs');
  });

  test('has required field: interface.displayName', () => {
    const data = readJSON('.agents/plugins/marketplace.json');
    assert.ok(data.interface && typeof data.interface === 'object', 'marketplace.json must have interface object');
    assert.equal(data.interface.displayName, 'Ālo Labs', 'interface.displayName must be Ālo Labs');
  });

  test('has required field: plugins (non-empty array)', () => {
    const data = readJSON('.agents/plugins/marketplace.json');
    assert.ok(Array.isArray(data.plugins) && data.plugins.length > 0, 'marketplace.json must have non-empty plugins array');
  });

  test('plugin entry points at the shared Codex bundle', () => {
    const data = readJSON('.agents/plugins/marketplace.json');
    assert.equal(data.plugins.length, 1, 'codex marketplace should contain exactly one plugin');
    const [plugin] = data.plugins;
    assert.equal(plugin.name, 'topgun', 'codex marketplace plugin name must be topgun');
    assert.ok(plugin.source && typeof plugin.source === 'object', 'plugin.source must be an object');
    assert.equal(plugin.source.source, 'local', 'codex marketplace must use local source');
    assert.equal(plugin.source.path, '../../.codex-plugin', 'codex marketplace must point at ../../.codex-plugin');
    assert.ok(plugin.policy && typeof plugin.policy === 'object', 'plugin.policy must be an object');
    assert.equal(plugin.policy.installation, 'AVAILABLE', 'codex marketplace installation policy must be AVAILABLE');
    assert.equal(plugin.policy.authentication, 'ON_INSTALL', 'codex marketplace authentication policy must be ON_INSTALL');
    assert.equal(plugin.category, 'Development', 'codex marketplace category must be Development');

    const pluginRoot = path.join(ROOT, '.agents/plugins', plugin.source.path);
    assert.ok(fs.existsSync(path.join(pluginRoot, 'plugin.json')), 'codex marketplace source must resolve to a plugin.json');
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

  test('has 0.7.7 version', () => {
    const data = readJSON('package.json');
    assert.equal(data.version, CURRENT_VERSION, 'package.json version must match the current release version');
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

// ─── Adapter files (16 active) ────────────────────────────────────────────────

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
  'skills-sh.md',
  'skillsmp.md',
  'smithery.md',
];

describe('adapter files — all 16 active present', () => {
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

  test('adapter count is exactly 16', () => {
    const files = fs.readdirSync(adaptersDir).filter(f => f.endsWith('.md'));
    assert.equal(files.length, 16, `expected 16 adapters, found ${files.length}: ${files.join(', ')}`);
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

  test('contains the GitHub-published Codex marketplace path', () => {
    const content = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    assert.ok(
      content.includes('codex plugin marketplace add https://github.com/alo-labs/codex-plugins.git'),
      'README.md must contain the GitHub-published Codex marketplace add command'
    );
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

// ─── .claude-plugin/hooks/hooks.json ─────────────────────────────────────────

describe('.claude-plugin/hooks/hooks.json', () => {
  test('parses as valid JSON', () => {
    const data = readJSON('.claude-plugin/hooks/hooks.json');
    assert.ok(typeof data === 'object' && data !== null);
  });

  test('registers validate-partials.sh as a plugin-owned PreToolUse hook', () => {
    const data = readJSON('.claude-plugin/hooks/hooks.json');
    const preToolUse = Array.isArray(data.hooks?.PreToolUse) ? data.hooks.PreToolUse : [];
    const writeEntry = preToolUse.find(entry => entry.matcher === 'Write');
    assert.ok(writeEntry, 'hooks.json must register a PreToolUse Write matcher');
    const commands = Array.isArray(writeEntry.hooks) ? writeEntry.hooks.map(hook => hook.command) : [];
    assert.ok(
      commands.some(command => typeof command === 'string' && command.includes('validate-partials.sh')),
      'hooks.json must invoke validate-partials.sh'
    );
  });
});
