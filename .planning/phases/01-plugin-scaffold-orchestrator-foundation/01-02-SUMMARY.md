---
phase: 01-plugin-scaffold-orchestrator-foundation
plan: 02
subsystem: tooling
tags: [cli, node, state, cache, keychain, schemas]
dependency_graph:
  requires: []
  provides: [bin/topgun-tools.cjs, ~/.topgun/]
  affects: [all skills and agents that use state/cache/keychain]
tech_stack:
  added: []
  patterns: [CJS module, process.argv dispatch, Node.js built-ins only]
key_files:
  created:
    - bin/topgun-tools.cjs
  modified: []
decisions:
  - "Shell metacharacter validation added to keychain-get/set (T-01-06 mitigation)"
  - "cache-write command added beyond plan spec to complete cache read/write symmetry"
  - "sessions/ and cache/ subdirs added to init (per REQ-25 full hierarchy)"
metrics:
  duration_minutes: 5
  completed_date: "2026-04-13"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
---

# Phase 01 Plan 02: topgun-tools.cjs CLI Helper Summary

**One-liner:** Node.js CJS CLI helper with 8 commands (init, state-read/write, sha256, cache-lookup/write, keychain-get/set, schemas) using only Node.js built-ins.

## What Was Built

`bin/topgun-tools.cjs` — the shared tooling layer for all TopGun skills and agents. Provides:

- **`init`** — creates `~/.topgun/` with `cache/`, `secured/`, `audit-cache/`, `sessions/`, `state.json`, `installed.json`
- **`state-read`** / **`state-write`** — read/write pipeline state from `~/.topgun/state.json`
- **`sha256`** — SHA-256 hex digest of an argument string
- **`cache-lookup`** / **`cache-write`** — 24-hour TTL cache in `~/.topgun/audit-cache/{sha}.json`
- **`keychain-get`** / **`keychain-set`** — macOS Keychain via `security` CLI with shell metacharacter validation
- **`schemas`** — outputs JSON Schema definitions for `state`, `found-skills`, `comparison-results`, `audit-manifest`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Shell injection validation for keychain args (T-01-06)**
- **Found during:** Task 1, threat model review
- **Issue:** The research skeleton used string interpolation for `security` CLI args with no validation
- **Fix:** Added `validateKeychainArg()` rejecting `"`, `'`, `;`, `$`, and backtick before passing to `execSync`
- **Files modified:** bin/topgun-tools.cjs
- **Commit:** a0170b0

**2. [Rule 2 - Completeness] Added `cache-write` command**
- **Found during:** Task 1
- **Issue:** Plan listed `cache-lookup` but not `cache-write`; a read-only cache API is non-functional
- **Fix:** Added `cache-write <sha> <json>` case that writes `{...data, cached_at: ISO}` to audit-cache
- **Files modified:** bin/topgun-tools.cjs
- **Commit:** a0170b0

**3. [Rule 2 - Completeness] Full directory hierarchy in `init`**
- **Found during:** Task 1
- **Issue:** Research skeleton only created `audit-cache/` and `secured/`; REQ-25 requires `cache/` and `sessions/` too
- **Fix:** Added `ensureDir` calls for `cache/` and `sessions/`
- **Files modified:** bin/topgun-tools.cjs
- **Commit:** a0170b0

## Verification

All plan acceptance criteria passed:

```
ALL CHECKS PASSED
- init status: ok
- sha256 "test content": 6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72
- state-write/read round-trip: ok
- schemas state: properties.current_stage present
- ~/.topgun/state.json, audit-cache/, secured/, installed.json: all exist
- test -x bin/topgun-tools.cjs: ok
```

## Self-Check: PASSED

- bin/topgun-tools.cjs exists and is executable: FOUND
- Commit a0170b0 exists: FOUND
- ~/.topgun/state.json: FOUND
- ~/.topgun/audit-cache/: FOUND
- ~/.topgun/secured/: FOUND
- ~/.topgun/installed.json: FOUND
