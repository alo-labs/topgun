#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

const TOPGUN_HOME = path.join(process.env.HOME, '.topgun');
const [,, command, ...args] = process.argv;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function output(data) {
  const json = JSON.stringify(data, null, 2);
  if (json.length > 8000) {
    const tmp = path.join('/tmp', `topgun-${Date.now()}.json`);
    fs.writeFileSync(tmp, json);
    process.stdout.write(`@file:${tmp}`);
  } else {
    process.stdout.write(json);
  }
}

function validateKeychainArg(arg, name) {
  // Block shell metacharacters that could enable injection via execSync string interpolation
  if (/["';$`|\\&<>\n\r]/.test(arg)) {
    console.error(`Invalid character in ${name}: shell metacharacters are not allowed`);
    process.exit(1);
  }
}

const LEGACY_CODEX_HOOK_FILES = [
  path.join(process.env.HOME, '.codex', 'hooks.json'),
  path.join(process.env.HOME, '.Codex', 'hooks.json'),
];

function isLegacyTopgunHookCommand(command) {
  return typeof command === 'string'
    && command.includes('validate-partials.sh')
    && /topgun/i.test(command);
}

function pruneLegacyTopgunHooksFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return false;
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    return false;
  }

  if (!config || typeof config !== 'object' || !config.hooks || typeof config.hooks !== 'object') {
    return false;
  }

  let changed = false;

  for (const [eventName, eventEntries] of Object.entries(config.hooks)) {
    if (!Array.isArray(eventEntries)) {
      continue;
    }

    const nextEntries = [];

    for (const entry of eventEntries) {
      if (!entry || typeof entry !== 'object' || !Array.isArray(entry.hooks)) {
        nextEntries.push(entry);
        continue;
      }

      const originalHookCount = entry.hooks.length;
      const filteredHooks = entry.hooks.filter(hook => {
        if (!hook || typeof hook !== 'object') {
          return true;
        }

        if (hook.type !== 'command') {
          return true;
        }

        return !isLegacyTopgunHookCommand(hook.command);
      });

      if (filteredHooks.length !== originalHookCount) {
        changed = true;
      }

      if (filteredHooks.length > 0 || originalHookCount === 0) {
        nextEntries.push(filteredHooks.length === originalHookCount ? entry : { ...entry, hooks: filteredHooks });
      }
    }

    if (changed) {
      config.hooks[eventName] = nextEntries;
    }
  }

  if (!changed) {
    return false;
  }

  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
  return true;
}

function migrateLegacyCodexHooks() {
  let changed = false;
  for (const filePath of LEGACY_CODEX_HOOK_FILES) {
    if (pruneLegacyTopgunHooksFromFile(filePath)) {
      changed = true;
    }
  }
  return changed;
}

const DEFAULT_REGISTRIES = [
  'skills-sh','agentskill-sh','smithery','github','gitlab','glama','npm','lobehub',
  'osm','huggingface','langchain-hub','claude-plugins-official','cursor-directory',
  'clawhub','mcp-so','opentools','skillsmp','vskill'
];

// NOTE (v1.5.0): the dispatch-registries subprocess command was removed.
// Spawned `claude` subprocesses cannot inherit OAuth tokens from the parent
// session, which silently broke FindSkills for OAuth-authenticated users
// (Pro/Teams default — github.com/alo-labs/topgun#3). Registry adapters are now
// dispatched in-process via the Task tool from agents/topgun-finder.md, which
// inherits the parent agent's authentication context for both auth methods.

if (command === 'dispatch-registries') {
  console.error('dispatch-registries was removed in v1.5.0. Registry adapters are now dispatched in-process via the Task tool from agents/topgun-finder.md. See: https://github.com/alo-labs/topgun/issues/3');
  process.exit(2);
}

switch (command) {
  case 'init': {
    ensureDir(TOPGUN_HOME);
    ensureDir(path.join(TOPGUN_HOME, 'cache'));
    ensureDir(path.join(TOPGUN_HOME, 'audit-cache'));
    ensureDir(path.join(TOPGUN_HOME, 'secured'));
    ensureDir(path.join(TOPGUN_HOME, 'sessions'));
    const statePath = path.join(TOPGUN_HOME, 'state.json');
    if (!fs.existsSync(statePath)) {
      fs.writeFileSync(statePath, JSON.stringify({
        current_stage: null, run_id: null, started_at: null,
        task_description: null, registries: null,
        found_skills_path: null, comparison_path: null,
        audit_path: null, last_completed_stage: null
      }, null, 2));
    }
    const installedPath = path.join(TOPGUN_HOME, 'installed.json');
    if (!fs.existsSync(installedPath)) {
      fs.writeFileSync(installedPath, JSON.stringify({ skills: [], updated_at: null }, null, 2));
    }
    migrateLegacyCodexHooks();
    output({ status: 'ok', topgun_home: TOPGUN_HOME });
    break;
  }

  case 'state-read': {
    const statePath = path.join(TOPGUN_HOME, 'state.json');
    if (!fs.existsSync(statePath)) { output({ error: 'no state' }); break; }
    output(JSON.parse(fs.readFileSync(statePath, 'utf8')));
    break;
  }

  case 'state-write': {
    const statePath = path.join(TOPGUN_HOME, 'state.json');
    const field = args[0], value = args[1];
    const state = fs.existsSync(statePath)
      ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
    state[field] = value;
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    output({ status: 'ok', field, value });
    break;
  }

  case 'sha256': {
    const content = args.join(' ');
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    output({ hash });
    break;
  }

  case 'cache-lookup': {
    const sha = args[0];
    if (!sha) { output({ hit: false }); break; }

    // Parse flags
    const forceIdx = args.indexOf('--force');
    if (forceIdx !== -1) { output({ hit: false, forced: true }); break; }

    const upstreamEtagIdx = args.indexOf('--upstream-etag');
    const upstreamEtag = upstreamEtagIdx !== -1 ? args[upstreamEtagIdx + 1] : null;
    const upstreamUpdatedAtIdx = args.indexOf('--upstream-updated-at');
    const upstreamUpdatedAt = upstreamUpdatedAtIdx !== -1 ? args[upstreamUpdatedAtIdx + 1] : null;

    const cachePath = path.join(TOPGUN_HOME, 'audit-cache', `${sha}.json`);
    if (!fs.existsSync(cachePath)) { output({ hit: false }); break; }

    let cached;
    try {
      cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } catch {
      output({ hit: false });
      break;
    }

    // Check upstream etag invalidation
    if (upstreamEtag !== null && cached.etag !== undefined && upstreamEtag !== cached.etag) {
      output({ hit: false, invalidated: true, reason: 'upstream etag changed' });
      break;
    }

    // Check upstream updated_at invalidation
    if (upstreamUpdatedAt !== null && cached.updated_at !== undefined && upstreamUpdatedAt !== cached.updated_at) {
      output({ hit: false, invalidated: true, reason: 'upstream updated_at changed' });
      break;
    }

    const age = Date.now() - new Date(cached.cached_at).getTime();
    const ttl = 24 * 60 * 60 * 1000;
    const age_hours = Math.round(age / 3600000);

    if (age >= ttl) {
      output({
        hit: false,
        stale: true,
        age_hours,
        warning: `Audit cached ${age_hours} hours ago -- use --force-audit to refresh`,
        data: cached,
      });
      break;
    }

    output({ hit: true, stale: false, age_hours, data: cached });
    break;
  }

  case 'cache-write': {
    const sha = args[0];
    // Collect positional JSON (everything before first -- flag)
    const flagStart = args.findIndex((a, i) => i > 0 && a.startsWith('--'));
    const jsonData = flagStart === -1
      ? args.slice(1).join(' ')
      : args.slice(1, flagStart).join(' ');
    if (!sha || !jsonData) {
      console.error('Usage: cache-write <sha> <json> [--etag <etag>] [--updated-at <iso>]');
      process.exit(1);
    }
    ensureDir(path.join(TOPGUN_HOME, 'audit-cache'));
    const cachePath = path.join(TOPGUN_HOME, 'audit-cache', `${sha}.json`);
    let data;
    try { data = JSON.parse(jsonData); } catch {
      console.error('Invalid JSON data provided');
      process.exit(1);
    }
    data.cached_at = new Date().toISOString();
    const etagIdx = args.indexOf('--etag');
    if (etagIdx !== -1 && args[etagIdx + 1]) data.etag = args[etagIdx + 1];
    const updatedAtIdx = args.indexOf('--updated-at');
    if (updatedAtIdx !== -1 && args[updatedAtIdx + 1]) data.updated_at = args[updatedAtIdx + 1];
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
    output({ status: 'ok', sha, path: cachePath });
    break;
  }

  case 'lock-write': {
    const jsonData = args[0];
    if (!jsonData) {
      console.error('Usage: lock-write <json>');
      process.exit(1);
    }
    let incoming;
    try { incoming = JSON.parse(jsonData); } catch {
      console.error('Invalid JSON data for lock-write');
      process.exit(1);
    }
    ensureDir(TOPGUN_HOME);
    const lockPath = path.join(TOPGUN_HOME, 'topgun-lock.json');
    const lock = {
      locked_at: new Date().toISOString(),
      audits: incoming.audits || [],
      topgun_version: incoming.topgun_version || '1.0',
    };
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));
    output({ status: 'ok', path: lockPath });
    break;
  }

  case 'lock-read': {
    const lockPath = path.join(TOPGUN_HOME, 'topgun-lock.json');
    if (!fs.existsSync(lockPath)) { output({ exists: false }); break; }
    try {
      output(JSON.parse(fs.readFileSync(lockPath, 'utf8')));
    } catch {
      output({ exists: false });
    }
    break;
  }

  case 'cache-invalidate': {
    const target = args[0];
    const cacheDir = path.join(TOPGUN_HOME, 'audit-cache');
    if (target === '--all') {
      ensureDir(cacheDir);
      const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.json'));
      for (const f of files) fs.unlinkSync(path.join(cacheDir, f));
      output({ status: 'ok', count: files.length });
      break;
    }
    if (!target) {
      console.error('Usage: cache-invalidate <sha> | --all');
      process.exit(1);
    }
    const filePath = path.join(cacheDir, `${target}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      output({ status: 'ok', deleted: true });
    } else {
      output({ status: 'ok', deleted: false });
    }
    break;
  }

  case 'keychain-get': {
    const service = args[0];
    if (!service) { console.error('Usage: keychain-get <service> [account]'); process.exit(1); }
    const account = args[1] || 'topgun';
    validateKeychainArg(service, 'service');
    validateKeychainArg(account, 'account');
    try {
      const pw = execSync(
        `security find-generic-password -s "${service}" -a "${account}" -w 2>/dev/null`,
        { encoding: 'utf8' }
      ).trim();
      output({ found: true, value: pw });
    } catch { output({ found: false }); }
    break;
  }

  case 'keychain-set': {
    const service = args[0], password = args[1];
    if (!service || password === undefined) {
      console.error('Usage: keychain-set <service> <account> <password> OR keychain-set <service> <password>');
      process.exit(1);
    }
    // Support both (service, password) and (service, account, password) forms
    let account, pw;
    if (args.length >= 3) {
      account = args[1];
      pw = args[2];
    } else {
      account = 'topgun';
      pw = args[1];
    }
    validateKeychainArg(service, 'service');
    validateKeychainArg(account, 'account');
    validateKeychainArg(pw, 'password');
    try {
      execSync(`security delete-generic-password -s "${service}" -a "${account}" 2>/dev/null`);
    } catch { /* not found, ok */ }
    execSync(`security add-generic-password -s "${service}" -a "${account}" -w "${pw}"`);
    output({ status: 'ok', service });
    break;
  }

  case 'schemas': {
    const schemaName = args[0];
    const schemas = {
      'state': {
        type: 'object',
        properties: {
          current_stage: { type: ['string', 'null'], enum: ['find', 'compare', 'secure', 'approve', 'install', 'complete', null] },
          run_id: { type: ['string', 'null'] },
          started_at: { type: ['string', 'null'], format: 'date-time' },
          task_description: { type: ['string', 'null'] },
          registries: { type: ['array', 'null'], items: { type: 'string' } },
          found_skills_path: { type: ['string', 'null'] },
          comparison_path: { type: ['string', 'null'] },
          audit_path: { type: ['string', 'null'] },
          last_completed_stage: { type: ['string', 'null'] }
        },
        required: ['current_stage', 'run_id']
      },
      'found-skills': {
        type: 'object',
        properties: {
          query: { type: 'string' },
          searched_at: { type: 'string', format: 'date-time' },
          registries_searched: { type: 'array', items: { type: 'string' } },
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                source_registry: { type: 'string' },
                install_count: { type: 'number' },
                stars: { type: 'number' },
                security_score: { type: ['number', 'null'] },
                last_updated: { type: ['string', 'null'] },
                content_sha: { type: ['string', 'null'] },
                install_url: { type: 'string' },
                raw_metadata: { type: 'object' }
              },
              required: ['name', 'source_registry', 'install_url']
            }
          }
        },
        required: ['query', 'results']
      },
      'comparison-results': {
        type: 'object',
        properties: {
          compared_at: { type: 'string', format: 'date-time' },
          input_hash: { type: 'string' },
          candidates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                scores: {
                  type: 'object',
                  properties: {
                    capability: { type: 'number', minimum: 0, maximum: 100 },
                    security: { type: 'number', minimum: 0, maximum: 100 },
                    popularity: { type: 'number', minimum: 0, maximum: 100 },
                    recency: { type: 'number', minimum: 0, maximum: 100 }
                  },
                  required: ['capability', 'security', 'popularity', 'recency']
                },
                composite_score: { type: 'number' },
                rank: { type: 'number' }
              },
              required: ['name', 'scores', 'composite_score', 'rank']
            }
          },
          winner: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              composite_score: { type: 'number' }
            },
            required: ['name', 'composite_score']
          }
        },
        required: ['candidates', 'winner']
      },
      'audit-manifest': {
        type: 'object',
        properties: {
          audited_at: { type: 'string', format: 'date-time' },
          skill_name: { type: 'string' },
          content_sha: { type: 'string' },
          sentinel_passes: { type: 'number' },
          clean_passes: { type: 'number' },
          findings_fixed: { type: 'number' },
          findings_escalated: { type: 'number' },
          secured_path: { type: 'string' },
          allowed_tools: { type: 'array', items: { type: 'string' } },
          disclaimer: { type: 'string' }
        },
        required: ['skill_name', 'content_sha', 'sentinel_passes', 'clean_passes', 'disclaimer']
      }
    };
    if (schemaName && schemas[schemaName]) {
      output(schemas[schemaName]);
    } else if (schemaName) {
      console.error(`Unknown schema: ${schemaName}. Available: ${Object.keys(schemas).join(', ')}`);
      process.exit(1);
    } else {
      output(schemas);
    }
    break;
  }

  case 'validate-partials': {
    const hashIdx = args.indexOf('--hash');
    const expectedIdx = args.indexOf('--expected');
    const hash = hashIdx !== -1 ? args[hashIdx + 1] : null;
    const expected = expectedIdx !== -1 ? parseInt(args[expectedIdx + 1], 10) : 18;

    if (!hash) {
      console.error('Usage: validate-partials --hash <hash> [--expected <N>]');
      process.exit(1);
    }

    ensureDir(TOPGUN_HOME);
    let found = 0;
    try {
      found = fs.readdirSync(TOPGUN_HOME)
        .filter(f => f.startsWith(`registry-${hash}-`) && f.endsWith('.json'))
        .length;
    } catch (e) { found = 0; }

    const missing = DEFAULT_REGISTRIES.filter(reg => {
      const p = path.join(TOPGUN_HOME, `registry-${hash}-${reg}.json`);
      return !fs.existsSync(p);
    });

    const valid = found >= expected;
    output({ valid, found, expected, missing });
    if (!valid) process.exit(1);
    break;
  }

  default:
    console.error(`Unknown command: ${command}`);
    console.error('Commands: init, state-read, state-write, sha256, cache-lookup, cache-write, cache-invalidate, lock-write, lock-read, keychain-get, keychain-set, schemas, validate-partials');
    process.exit(1);
}
