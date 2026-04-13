---
phase: 05-installskills-approval-gate
plan: "03"
subsystem: install-pipeline
tags: [install, fallback, registry, audit-trail]
dependency_graph:
  requires: [05-01, 05-02]
  provides: [local-copy-fallback, installed-registry, audit-trail-header]
  affects: [agents/topgun-installer.md, skills/topgun/SKILL.md, skills/install-skills/SKILL.md]
tech_stack:
  added: []
  patterns: [local-copy-fallback, json-registry-append, state-driven-display]
key_files:
  created: []
  modified:
    - agents/topgun-installer.md
    - skills/topgun/SKILL.md
    - skills/install-skills/SKILL.md
decisions:
  - "Local-copy fallback writes to ~/.claude/skills/ (same root as plugin installs) for consistency"
  - "Registry write failure is a warning, not a blocking error — install still succeeds"
  - "Audit trail header reads from both state and JSON files to populate all fields"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-13T04:25:11Z"
  tasks_completed: 2
  files_modified: 3
---

# Phase 05 Plan 03: Local-Copy Fallback, Installed Registry, and Audit Trail Header Summary

Local-copy fallback to ~/.claude/skills/ with installed.json registry and real-data audit trail header.

## What Was Built

### Task 1: Local-Copy Fallback + Installed Registry (agents/topgun-installer.md)

Added Step 5 (Local-Copy Fallback) and Step 6 (Registry Update) to the installer agent:

- **Step 5** activates when /plugin install fails or post-install verification fails
- Copies secured SKILL.md from `~/.topgun/secured/{sha}/` to `~/.claude/skills/{skill_name}/`
- Verifies invocability via Task tool test invocation after the copy
- If local-copy also fails: surfaces a clear error with the secured path, never silently proceeds
- **Step 6** appends an entry to `~/.topgun/installed.json` after any successful install (plugin or local-copy) with: `name`, `source_registry`, `install_method`, `installed_at`, `secured_path`, `install_path`
- Registry write failure is a non-blocking warning

Restructured flow: try plugin install -> verify -> if failed, local-copy fallback -> update registry -> INSTALL COMPLETE.

### Task 2: Audit Trail Header + install-skills SKILL.md (skills/topgun/SKILL.md, skills/install-skills/SKILL.md)

**Step 8 in orchestrator** now:
- Only executes when `approval = "approved"` and INSTALL COMPLETE was returned (rejection case handled)
- Reads `skill_name`, `source_registry`, `install_method` from state
- Reads capability/security/popularity/recency scores from `comparison-{hash}.json`
- Reads `pass_count` / `finding_count` from `audit-{hash}.json`
- Displays populated SKILL ACQUIRED header with all real values
- Displays disclaimer immediately after: "2 clean Sentinel passes = no automated findings. Not a guarantee of zero vulnerabilities."
- Removed Phase 1 stub note

**install-skills/SKILL.md** replaced stub with:
- Description of what InstallSkills does and how it is dispatched
- "## Completion Markers" section documenting `## INSTALL COMPLETE` and `## INSTALL FAILED — FALLBACK NEEDED`

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 6bcaefa | feat(05-03): add local-copy fallback and installed.json registry to topgun-installer |
| 2 | 8dec289 | feat(05-03): audit trail header with real data and install-skills SKILL.md update |

## Self-Check: PASSED

- agents/topgun-installer.md: modified with Steps 5 and 6
- skills/topgun/SKILL.md: Step 8 populated with real-data logic and disclaimer
- skills/install-skills/SKILL.md: stub replaced with full description and Completion Markers
- Commits 6bcaefa and 8dec289 exist in git log
