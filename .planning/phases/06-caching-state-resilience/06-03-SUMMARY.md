---
phase: 06-caching-state-resilience
plan: "03"
subsystem: orchestrator-resilience
tags: [keychain, auth-tokens, failure-contracts, error-handling, sub-agents]
dependency_graph:
  requires: [06-01, 06-02]
  provides: [first-run-token-prompt, cascading-failure-contracts]
  affects: [skills/topgun/SKILL.md, agents/topgun-finder.md, agents/topgun-comparator.md, agents/topgun-securer.md, agents/topgun-installer.md]
tech_stack:
  added: []
  patterns: [OS-keychain-token-storage, STAGE-FAILED-marker-protocol, retry-abort-user-gate]
key_files:
  created:
    - tests/failure-contracts.test.cjs
  modified:
    - skills/topgun/SKILL.md
    - agents/topgun-finder.md
    - agents/topgun-comparator.md
    - agents/topgun-securer.md
    - agents/topgun-installer.md
decisions:
  - "STAGE FAILED used as unified failure marker across all sub-agents; distinct from SECURE REJECTED (phone-home) and SECURE ABORTED (SHA mismatch) in securer"
  - "Retry offered once per stage — second failure is final abort (T-06-09 mitigation)"
  - "Token prompt skipped when --offline flag set — no network needed"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-13"
  tasks_completed: 2
  files_modified: 6
---

# Phase 06 Plan 03: First-Run Token Prompt and Failure Contracts Summary

OS keychain token prompting and structured STAGE FAILED failure contracts wired into orchestrator and all 4 sub-agents, with 21 passing integration tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | First-run token prompt and orchestrator failure handling | 30d7a9c | skills/topgun/SKILL.md |
| 2 | Sub-agent failure contracts and integration tests | 0e84221 | agents/topgun-{finder,comparator,securer,installer}.md, tests/failure-contracts.test.cjs |

## What Was Built

### Task 1 — Orchestrator (skills/topgun/SKILL.md)

Added **Step 1.5: Auth Token Check** between input parsing and the offline cache check:
- Runs `keychain-get github-token` and `keychain-get smithery-token`
- For each token with `found: false`, prompts user once with rate-limit context (60 → 5000 req/hr)
- Stores provided tokens via `keychain-set {service} topgun {token}` — OS keychain only, never written to files
- Skips entirely when `--offline` flag is set

Updated all 4 sub-agent dispatch blocks (Steps 3, 4, 5, 7) to parse output for `## STAGE FAILED`:
- Extracts `Reason:` line and surfaces it to the user
- Offers retry (once) or abort
- Handles unexpected output (no recognized marker) as failure

### Task 2 — Sub-agents and Tests

Added an **Error Handling** section to all 4 sub-agents documenting:
- `## STAGE FAILED` + `Reason:` output protocol
- `{status, reason, results}` contract for all adapter calls
- Specific terminal failure conditions per agent

Created `tests/failure-contracts.test.cjs` with 21 tests across 5 suites:
- STAGE FAILED marker presence in all 4 agents
- `{status, reason, results}` contract documentation in all 4 agents
- Orchestrator failure handling for all 4 stages + retry/abort + keychain-get calls
- `keychain-get` returns `{found: false}` for nonexistent service (live test)
- keychain roundtrip: `keychain-set` then `keychain-get` verifies stored value (macOS only)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary changes introduced. Token storage uses existing `keychain-set` path documented in threat model as T-06-07 (mitigated).

## Self-Check: PASSED

- tests/failure-contracts.test.cjs: EXISTS
- skills/topgun/SKILL.md: EXISTS and contains keychain-get, STAGE FAILED, retry/abort (14 matches)
- agents/topgun-finder.md: EXISTS and contains ## STAGE FAILED
- agents/topgun-comparator.md: EXISTS and contains ## STAGE FAILED
- agents/topgun-securer.md: EXISTS and contains ## STAGE FAILED
- agents/topgun-installer.md: EXISTS and contains ## STAGE FAILED
- Commit 30d7a9c: verified in git log
- Commit 0e84221: verified in git log
- All 21 tests pass: `node --test tests/failure-contracts.test.cjs` — 21 pass, 0 fail
