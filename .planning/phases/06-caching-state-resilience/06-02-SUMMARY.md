---
phase: 06-caching-state-resilience
plan: "02"
subsystem: orchestrator
tags: [resume, offline, reset, state, hardening]
dependency_graph:
  requires: []
  provides: [hardened-resume, offline-mode, reset-flag, file-existence-checks]
  affects: [skills/topgun/SKILL.md, tests/orchestrator-resume.test.cjs]
tech_stack:
  added: []
  patterns: [file-existence-before-resume, state-path-tracking, offline-cache-guard]
key_files:
  created:
    - tests/orchestrator-resume.test.cjs
  modified:
    - skills/topgun/SKILL.md
decisions:
  - "Validate last_completed_stage against known enum before trusting state (T-06-04)"
  - "File existence verified with node -e process.exit(existsSync) inline pattern"
  - "state-write null used for --reset; topgun-tools stores the literal string 'null' which is the reset sentinel"
  - "--force-audit flag passed through as text in sub-agent prompt, not a new CLI flag"
metrics:
  duration: "12 minutes"
  completed_date: "2026-04-13"
  tasks_completed: 2
  files_modified: 2
---

# Phase 06 Plan 02: Harden Resume Logic, --offline, --reset Summary

Hardened the TopGun orchestrator with file-existence resume verification, --offline cache-only mode, and --reset pipeline restart — backed by 6 passing integration tests.

## What Was Built

### Task 1 — SKILL.md Hardened Resume Logic

**Step 1 flag parsing additions:**

- `--reset`: clears all 6 state fields (current_stage, last_completed_stage, run_id, found_skills_path, comparison_path, audit_path) before any other logic. Outputs "State cleared. Starting fresh pipeline."
- `--offline`: sets offline=true. Passes offline context to all sub-agent dispatches. Triggers Step 1.5 cache check.
- `--force-audit`: sets force_audit=true. Passed through to SecureSkills prompt to bypass audit cache.

**Step 1.5 — Offline Check (new step):**

Computes query hash, checks `~/.topgun/found-skills-{hash}.json` with `existsSync`. If missing: outputs "No cached results available for this query. Run without --offline to search registries." and stops (T-06-05 mitigation).

**Step 2 — Hardened Resume Check:**

Each stage now runs an `existsSync` check before skipping:
- `find`: verifies `found_skills_path` on disk; re-runs Step 3 if missing
- `compare`: verifies both `found_skills_path` AND `comparison_path`; resumes from earliest missing
- `secure`: verifies `audit_path`; re-runs Step 5 if missing
- `approve`: verifies `audit_path`; re-runs Step 5 if missing (T-06-06 approval gate hardening)
- Invalid stage value: warns and restarts from Step 3 (T-06-04)

**Steps 3/4/5 — Output path tracking:**

After each sub-agent completes, the output file path is written to state:
- Step 3: `state-write found_skills_path`
- Step 4: `state-write comparison_path`
- Step 5: `state-write audit_path`

Step 5 also checks the audit cache before dispatching in offline mode (T-06-05).

### Task 2 — Tests (tests/orchestrator-resume.test.cjs)

6 tests, all passing:

| # | Test | Result |
|---|------|--------|
| 1 | state roundtrip for all 6 stage values | PASS |
| 2 | init creates state.json with all 9 required fields | PASS |
| 3 | --reset simulation clears current_stage, last_completed_stage, run_id | PASS |
| 4 | SKILL.md contains --offline handling with error message | PASS |
| 5 | SKILL.md contains existsSync checks for all 3 output file paths | PASS |
| 6 | schemas state command enum covers all 6 stages + null | PASS |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 7c791b0 | feat(06-02): harden resume logic with file verification, --offline, --reset, --force-audit |
| 2 | 43a830d | test(06-02): add orchestrator resume and --offline/--reset integration tests |

## Deviations from Plan

### Auto-added (Rule 2)

**1. [Rule 2 - Missing critical functionality] Added --force-audit flag**
- Found during: Task 1
- Issue: Plan listed --force-audit as a required flag to parse in Step 1 but the task description omitted it from the action summary
- Fix: Added --force-audit detection alongside --offline and --reset in Step 1; passes `--force` to SecureSkills prompt
- Files modified: skills/topgun/SKILL.md

**2. [Rule 2 - Security] Enum validation in Step 2**
- Found during: Task 1
- Issue: T-06-04 threat requires validation of stage values before trusting them; plan mentioned it but didn't specify the implementation location
- Fix: Added explicit enum guard at start of Step 2 resume logic
- Files modified: skills/topgun/SKILL.md

**3. [Rule 2 - Test coverage] Added Test 6 for schema enum completeness**
- Found during: Task 2
- Issue: Plan specified 5 tests; schema completeness was called out in verification criteria but not as an explicit test
- Fix: Added Test 6 covering the `schemas state` command enum values
- Files modified: tests/orchestrator-resume.test.cjs

## Known Stubs

None — all logic is complete prose in SKILL.md (orchestrator is an LLM instruction document, not executable code).

## Self-Check: PASSED

- skills/topgun/SKILL.md: FOUND
- tests/orchestrator-resume.test.cjs: FOUND
- Commit 7c791b0: FOUND
- Commit 43a830d: FOUND
- All 6 tests: PASS
