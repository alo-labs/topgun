'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CANONICAL_PLUGIN_ID = 'topgun@alo-labs-codex';
const CANONICAL_PACKAGE_PREFIX = `${CANONICAL_PLUGIN_ID}:hooks/hooks.json`;
const LEGACY_PLUGIN_PREFIXES = [
  'topgun@alo-labs',
  'topgun@alo-labs-codex-local',
];

function eventSlug(name) {
  return String(name).replace(/(?<!^)(?=[A-Z])/g, '_').toLowerCase();
}

function trustedHash(command) {
  return `sha256:${crypto.createHash('sha256').update(String(command)).digest('hex')}`;
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function loadHooksSource(sourcePath) {
  const data = readJsonFile(sourcePath);
  if (!data || typeof data !== 'object' || !data.hooks || typeof data.hooks !== 'object') {
    return null;
  }

  return data.hooks;
}

function collectTrustEntriesForSource(sourcePath, prefix) {
  const hooks = loadHooksSource(sourcePath);
  if (!hooks) {
    return [];
  }

  const entries = [];

  for (const [eventName, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) {
      continue;
    }

    const slug = eventSlug(eventName);

    for (const [groupIndex, group] of groups.entries()) {
      if (!group || !Array.isArray(group.hooks)) {
        continue;
      }

      for (const [hookIndex, hook] of group.hooks.entries()) {
        if (!hook || typeof hook !== 'object' || typeof hook.command !== 'string') {
          continue;
        }

        entries.push({
          key: `${prefix}:${slug}:${groupIndex}:${hookIndex}`,
          digest: trustedHash(hook.command),
        });
      }
    }
  }

  return entries;
}

function renderTrustEntries(entries) {
  const lines = [];

  for (const { key, digest } of entries) {
    lines.push(`[hooks.state."${key}"]`);
    lines.push(`trusted_hash = "${digest}"`);
    lines.push('');
  }

  return lines;
}

function rewriteConfigTrustState(configPath, entries, prefixesToRemove) {
  const text = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const lines = text.split(/\r?\n/);
  const renderedEntries = renderTrustEntries(entries);
  const prefixes = [...prefixesToRemove].filter(Boolean);
  const shouldRemove = key => prefixes.some(prefix => key.startsWith(prefix));
  const headerIndex = lines.findIndex(line => line.trim() === '[hooks.state]');
  let output;

  if (headerIndex === -1) {
    output = lines.slice();
    if (output.length > 0 && output[output.length - 1] !== '') {
      output.push('');
    }
    output.push('[hooks.state]');
    output.push(...renderedEntries);
  } else {
    let endIndex = lines.length;
    for (let i = headerIndex + 1; i < lines.length; i += 1) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('[') && !trimmed.startsWith('[hooks.state.')) {
        endIndex = i;
        break;
      }
    }

    const body = lines.slice(headerIndex + 1, endIndex);
    const filteredBody = [];

    for (let i = 0; i < body.length; i += 1) {
      const trimmed = body[i].trim();
      const match = trimmed.match(/^\[hooks\.state\."(.+)"\]$/);
      if (match && shouldRemove(match[1])) {
        i += 1;
        while (i < body.length) {
          const nextTrimmed = body[i].trim();
          if (nextTrimmed.startsWith('[') && !nextTrimmed.startsWith('[hooks.state.')) {
            i -= 1;
            break;
          }
          if (nextTrimmed.match(/^\[hooks\.state\."(.+)"\]$/)) {
            i -= 1;
            break;
          }
          i += 1;
        }
        continue;
      }
      filteredBody.push(body[i]);
    }

    output = [
      ...lines.slice(0, headerIndex + 1),
      ...filteredBody,
      ...renderedEntries,
      ...lines.slice(endIndex),
    ];
  }

  const newText = output.join('\n').replace(/\n+$/, '\n');
  if (newText === text) {
    return false;
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, newText);
  return true;
}

function pruneConfigTrustState(configPath, prefixesToRemove) {
  const text = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  if (!text) {
    return false;
  }

  const lines = text.split(/\r?\n/);
  const prefixes = [...prefixesToRemove].filter(Boolean);
  const shouldRemove = key => prefixes.some(prefix => key.startsWith(prefix));
  const headerIndex = lines.findIndex(line => line.trim() === '[hooks.state]');
  if (headerIndex === -1) {
    return false;
  }

  let endIndex = lines.length;
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('[') && !trimmed.startsWith('[hooks.state.')) {
      endIndex = i;
      break;
    }
  }

  const body = lines.slice(headerIndex + 1, endIndex);
  const filteredBody = [];

  for (let i = 0; i < body.length; i += 1) {
    const trimmed = body[i].trim();
    const match = trimmed.match(/^\[hooks\.state\."(.+)"\]$/);
    if (match && shouldRemove(match[1])) {
      i += 1;
      while (i < body.length) {
        const nextTrimmed = body[i].trim();
        if (nextTrimmed.startsWith('[') && !nextTrimmed.startsWith('[hooks.state.')) {
          i -= 1;
          break;
        }
        if (nextTrimmed.match(/^\[hooks\.state\."(.+)"\]$/)) {
          i -= 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    filteredBody.push(body[i]);
  }

  const output = [
    ...lines.slice(0, headerIndex + 1),
    ...filteredBody,
    ...lines.slice(endIndex),
  ];

  const newText = output.join('\n').replace(/\n+$/, '\n');
  if (newText === text) {
    return false;
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, newText);
  return true;
}

function seedHookTrustState({
  packageRoot = path.resolve(__dirname, '..'),
  configPaths = [
    path.join(process.env.HOME, '.codex', 'config.toml'),
  ],
  legacyConfigPaths = [],
  sourceSpecs = [
    {
      prefix: CANONICAL_PACKAGE_PREFIX,
      sourcePath: path.join(path.resolve(packageRoot), 'hooks', 'hooks.json'),
    },
  ],
} = {}) {
  const allEntries = [];
  const prefixesToRemove = new Set(LEGACY_PLUGIN_PREFIXES);

  for (const spec of sourceSpecs) {
    if (!spec || typeof spec.prefix !== 'string' || typeof spec.sourcePath !== 'string') {
      continue;
    }

    const entries = collectTrustEntriesForSource(spec.sourcePath, spec.prefix);
    if (entries.length === 0) {
      continue;
    }

    allEntries.push(...entries);
    prefixesToRemove.add(spec.prefix);
  }

  if (allEntries.length === 0) {
    return { changed: false, entries: [] };
  }

  const writtenConfigs = [];

  for (const configPath of configPaths) {
    if (!configPath) {
      continue;
    }

    if (rewriteConfigTrustState(configPath, allEntries, prefixesToRemove)) {
      writtenConfigs.push(configPath);
    }
  }

  const cleanedConfigs = [];
  for (const configPath of legacyConfigPaths) {
    if (!configPath || configPaths.includes(configPath)) {
      continue;
    }

    if (pruneConfigTrustState(configPath, prefixesToRemove)) {
      cleanedConfigs.push(configPath);
    }
  }

  return {
    changed: writtenConfigs.length > 0 || cleanedConfigs.length > 0,
    entries: allEntries,
    configPaths: writtenConfigs,
    cleanedPaths: cleanedConfigs,
  };
}

module.exports = {
  CANONICAL_PACKAGE_PREFIX,
  CANONICAL_PLUGIN_ID,
  LEGACY_PLUGIN_PREFIXES,
  collectTrustEntriesForSource,
  eventSlug,
  rewriteConfigTrustState,
  pruneConfigTrustState,
  seedHookTrustState,
  trustedHash,
};
