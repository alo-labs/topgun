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
  if (/["';$`]/.test(arg)) {
    console.error(`Invalid character in ${name}: shell metacharacters are not allowed`);
    process.exit(1);
  }
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
    const cachePath = path.join(TOPGUN_HOME, 'audit-cache', `${sha}.json`);
    if (!fs.existsSync(cachePath)) { output({ hit: false }); break; }
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const age = Date.now() - new Date(cached.cached_at).getTime();
    const ttl = 24 * 60 * 60 * 1000;
    output({ hit: age < ttl, stale: age >= ttl, age_hours: Math.round(age / 3600000), data: cached });
    break;
  }

  case 'cache-write': {
    const sha = args[0];
    const jsonData = args.slice(1).join(' ');
    if (!sha || !jsonData) {
      console.error('Usage: cache-write <sha> <json>');
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
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
    output({ status: 'ok', sha, path: cachePath });
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

  default:
    console.error(`Unknown command: ${command}`);
    console.error('Commands: init, state-read, state-write, sha256, cache-lookup, cache-write, keychain-get, keychain-set, schemas');
    process.exit(1);
}
