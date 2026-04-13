---
phase: 04-secureskills-sentinel-audit-loop
plan: "03"
subsystem: secure-skills
tags: [loop-cap, escalation, secured-copy, audit-trail, sentinel]
dependency_graph:
  requires: [04-01, 04-02]
  provides: [complete-topgun-securer-agent, audit-json-output, secured-copy-storage]
  affects: [agents/topgun-securer.md, skills/secure-skills/SKILL.md]
tech_stack:
  added: []
  patterns: [loop-cap-at-3-attempts, binary-escalation-choice, chmod-600-secured-copy, audit-json-with-disclaimer]
key_files:
  modified:
    - agents/topgun-securer.md
    - skills/secure-skills/SKILL.md
decisions:
  - "Loop cap set at 3 attempts per finding fingerprint before escalation — balances automation with user control"
  - "Critical findings explicitly prohibited from auto-accept code paths — must always escalate to user after 3 attempts"
  - "audit-{sha}.json disclaimer is mandatory per NFR-05 — '2 clean passes = no automated findings. Not a guarantee of zero vulnerabilities.'"
  - "Secured copy uses content SHA as directory name to ensure deterministic, collision-resistant paths"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-13"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 04 Plan 03: Loop Cap, Escalation, Secured Copy, and Audit Output Summary

Completes the SecureSkills agent (topgun-securer.md) with Steps 5-8: per-finding attempt tracking with 3-attempt loop cap, user escalation with binary accept-risk/reject-skill choice, Critical finding protection, secured copy at `~/.topgun/secured/{sha}/SKILL.md` with 600 permissions, and `audit-{sha}.json` with full findings and mandatory disclaimer.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Loop Cap, Escalation, and Critical Finding Protection | 5816f9e | agents/topgun-securer.md |
| 2 | Finalize skills/secure-skills/SKILL.md | d616d50 | skills/secure-skills/SKILL.md |

## What Was Built

**Task 1 — Steps 5-8 added to agents/topgun-securer.md:**

- **Step 5 (Loop Cap + Escalation):** Per-finding fingerprint tracking checks `findings_tracker[F].count >= 3` before attempting fixes. Findings at cap are marked `escalation_required`. User is presented with severity, location, description, and attempt count — then given a binary choice: A) Accept risk or B) Reject skill. Accept-risk records an explicit user decision in state; reject-skill writes `audit_status=rejected` and outputs `## SECURE REJECTED`.
- **Critical Finding Protection (REQ-14):** Explicit prohibition on silent downgrade — Critical findings MUST escalate after 3 attempts; no code path may change severity; audit JSON must record full resolution path.
- **Step 6 (Secured Copy, REQ-16):** After 2 clean passes, creates `~/.topgun/secured/{sha}/` directory, writes clean SKILL.md content, sets `chmod 600`, verifies `-rw-------` permissions, writes `secured_path` to state.
- **Step 7 (Audit JSON, NFR-05):** Writes `~/.topgun/audit-{sha}.json` with all required fields: skill_name, skill_source, content_sha, audited_at, sentinel_skill, total_passes, clean_passes, findings array (with fingerprint, severity, description, location, resolution, fix_attempts, first/last seen pass), accepted_risks, allowed_tools_flagged, secured_path, and mandatory disclaimer.
- **Step 8 (Completion):** Outputs `## SECURE COMPLETE` marker with summary of passes, findings fixed, risks accepted, secured path, and audit path. Includes disclaimer.

**Task 2 — skills/secure-skills/SKILL.md updated:**

- Status changed from "Structural envelope and pre-filters implemented" to "Phase 4 — Complete"
- Capabilities section expanded to cover all 11 capabilities across all 4 plans
- All four completion markers documented: SECURE COMPLETE, SECURE REJECTED, SECURE ABORTED, SECURE ESCALATED

## Decisions Made

1. Loop cap set at 3 attempts per finding fingerprint before escalation — balances automation with user control
2. Critical findings explicitly prohibited from auto-accept code paths — must always escalate to user after 3 attempts
3. `audit-{sha}.json` disclaimer is mandatory per NFR-05
4. Secured copy uses content SHA as directory name for deterministic, collision-resistant paths

## Deviations from Plan

None — plan executed exactly as written.

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|-----------|
| T-04-07 | Step 5 explicitly states "No code path may change a finding's severity from Critical to a lower level"; Critical findings always escalate |
| T-04-08 | Step 6 includes `chmod 600` and verification step confirming `-rw-------` |
| T-04-09 | Step 7 records every finding with resolution path, attempt count, and mandatory disclaimer |

## Self-Check: PASSED

- agents/topgun-securer.md contains Steps 5-8: CONFIRMED (grep PASS)
- skills/secure-skills/SKILL.md contains Phase 4 Complete + all markers: CONFIRMED (grep PASS)
- Commits 5816f9e and d616d50 exist in git log: CONFIRMED
