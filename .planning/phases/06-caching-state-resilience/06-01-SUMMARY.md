---
phase: 06-caching-state-resilience
plan: 01
subsystem: cache
tags: [cache, ttl, etag, lock-file, resilience]
dependency_graph:
  requires: []
  provides: [hardened-audit-cache, topgun-lock.json, cache-invalidate]
  affects: [bin/topgun-tools.cjs]
tech_stack:
  added: []
  patterns: [stale-with-warning, etag-invalidation, TTL-enforcement, lock-file]
key_files:
  created:
    - tests/topgun-tools-cache.test.cjs
  modified:
    - bin/topgun-tools.cjs
decisions:
  - "Stale cache returns hit:false (not hit:true) with data attached, so orchestrator must opt-in via --allow-stale if it wants to use stale data"
  - "--force flag chosen over --force-audit at CLI level for terseness; warning text still references --force-audit for user messaging"
  - "lock-write merges locked_at server-side so callers cannot inject arbitrary timestamps"
metrics:
  duration_minutes: 15
  completed_date: 2026-04-13
  tasks_completed: 2
  files_modified: 2
---

# Phase 6 Plan 01: Audit Cache Hardening Summary

Cache hardened with 24h TTL enforcement, upstream etag/updated_at invalidation, stale-with-warning serving, --force bypass, topgun-lock.json write/read, and cache-invalidate command.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Enhance cache-lookup + write tests (TDD) | b0f471b | bin/topgun-tools.cjs, tests/topgun-tools-cache.test.cjs |
| 2 | Add lock-write, lock-read, cache-invalidate | b0f471b | bin/topgun-tools.cjs |

## Changes Made

### bin/topgun-tools.cjs

**cache-lookup** — enhanced:
- `--force` flag: immediately returns `{hit: false, forced: true}` — bypasses all cache logic
- `--upstream-etag <etag>`: if cached.etag differs from provided value, returns `{hit: false, invalidated: true, reason: "upstream etag changed"}`
- `--upstream-updated-at <iso>`: same pattern for updated_at field
- Stale path (age >= 24h): returns `{hit: false, stale: true, age_hours, warning: "Audit cached N hours ago -- use --force-audit to refresh", data: cached}`
- Fresh path: returns `{hit: true, stale: false, age_hours, data: cached}`
- Malformed cache file (JSON parse error) treated as cache miss — satisfies T-06-01

**cache-write** — enhanced:
- Accepts `--etag <etag>` and `--updated-at <iso>` flags
- Stores etag and updated_at in the cached JSON for future invalidation checks

**lock-write** (new):
- Accepts JSON string, writes `~/.topgun/topgun-lock.json` with `locked_at` (server-generated), `audits[]`, `topgun_version`

**lock-read** (new):
- Returns topgun-lock.json contents or `{exists: false}` if missing

**cache-invalidate** (new):
- `cache-invalidate <sha>`: deletes single audit cache file, returns `{status:"ok", deleted:true|false}`
- `cache-invalidate --all`: deletes all .json files in audit-cache/, returns `{status:"ok", count:N}`

### tests/topgun-tools-cache.test.cjs (new)

13 tests using Node built-in test runner (node:test + node:assert/strict). All tests use isolated temp directories — no pollution of ~/.topgun. Tests cover: fresh hit, stale miss, force bypass, etag mismatch, updated_at mismatch, stale-data-in-response, cache-write with etag, lock-write, lock-read, lock-read missing, cache-invalidate single, cache-invalidate missing, cache-invalidate --all.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — lock file contains only SHAs and timestamps (T-06-03 satisfied by design).

## Self-Check: PASSED

- bin/topgun-tools.cjs: FOUND
- tests/topgun-tools-cache.test.cjs: FOUND
- commit b0f471b: FOUND
- All 13 tests pass
