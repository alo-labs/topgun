---
phase: 02-findskills-registry-adapters
plan: "02"
subsystem: find-skills
tags: [adapters, tier-2, npm, lobehub, osm, vskill, skillsmp, clawhub, graceful-degradation]
dependency_graph:
  requires: []
  provides: [npm-adapter, lobehub-adapter, osm-adapter, vskill-adapter, skillsmp-adapter, clawhub-adapter]
  affects: [agents/topgun-finder.md, skills/find-skills/SKILL.md]
tech_stack:
  added: []
  patterns: [adapter-contract, graceful-degradation, exponential-backoff, timeout-isolation]
key_files:
  created:
    - skills/find-skills/adapters/npm.md
    - skills/find-skills/adapters/skillsmp.md
    - skills/find-skills/adapters/lobehub.md
    - skills/find-skills/adapters/osm.md
    - skills/find-skills/adapters/vskill.md
    - skills/find-skills/adapters/clawhub.md
  modified: []
decisions:
  - "ClawHub: no network call made — research confirmed no REST API exists"
  - "SkillsMP 403: no retry on 403 (deterministic access restriction, not transient)"
  - "Unconfirmed endpoints (LobeHub/OSM/vskill): any non-200 returns unavailable immediately"
  - "npm content_sha: null at search time, populated by SecureSkills phase"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-13"
  tasks_completed: 2
  tasks_total: 2
  files_created: 6
  files_modified: 0
requirements: [REQ-03, REQ-05]
---

# Phase 02 Plan 02: Tier-2 Registry Adapters Summary

**One-liner:** Six Tier-2 registry adapter instruction files with graceful degradation — npm maps to unified schema, SkillsMP handles 403 without retry, LobeHub/OSM/vskill skip on any non-200, ClawHub skips immediately with no network call.

## What Was Built

Six adapter instruction files added to `skills/find-skills/adapters/`:

| Adapter | Strategy | On Failure |
|---------|----------|------------|
| npm | WebFetch `registry.npmjs.org/-/v1/search`, no auth | 5xx/timeout → unavailable |
| SkillsMP | WebFetch `skillsmp.com/api/v1/skills/search` | 403 → unavailable immediately (no retry) |
| LobeHub | WebFetch `chat-agents.lobehub.com/api/agents` (best-guess) | any non-200 → unavailable |
| OSM | WebFetch `openskillsmarket.org/api/search` (best-guess) | any non-200 → unavailable |
| vskill | WebFetch `vskill.dev/api/skills` (best-guess) | any non-200 → unavailable |
| ClawHub | No network call | immediate unavailable |

All adapters implement the same contract:
- Return: `{status, reason, results[], registry, latency_ms}`
- Timeout: 8 seconds
- Backoff: 1s/2s/4s on 429, max 3 retries
- Threat mitigations T-02-05 and T-02-06 documented in each file

## Decisions Made

1. **SkillsMP 403 — no retry:** 403 is a deterministic access restriction (not transient). Retrying would waste time. Return `status: "unavailable"` immediately.
2. **ClawHub — zero latency skip:** Research confirmed no REST API. The adapter file exists for documentation and future activation only.
3. **npm content_sha = null:** npm search does not expose content hashes. Field left null for SecureSkills phase to populate.
4. **Unconfirmed endpoints as best-guess:** LobeHub, OSM, and vskill endpoints are undocumented. Any non-200 (including 404) triggers graceful skip — this is correct behavior given endpoint uncertainty.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all adapters are complete instruction files. The "unconfirmed endpoint" adapters are intentionally designed to gracefully skip, which is the correct production behavior given the research findings.

## Self-Check: PASSED
