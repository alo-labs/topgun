---
phase: 02-findskills-registry-adapters
verified: 2026-04-13T00:00:00Z
status: passed
score: 4/4
overrides_applied: 0
---

# Phase 2: FindSkills — Registry Adapters Verification Report

**Phase Goal:** Implement registry adapters for FindSkills so it can query 5+ registries, normalize results to a unified schema, handle timeouts, and write found-skills-{hash}.json.
**Verified:** 2026-04-13T00:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | FindSkills returns results from 5+ registries | VERIFIED | Tier-1 adapters: skills-sh.md, agentskill-sh.md, smithery.md, github.md, gitlab.md all present and substantive. Tier-2 adapters: npm.md, lobehub.md, osm.md, vskill.md, skillsmp.md, clawhub.md also present. |
| 2 | All results conform to unified 10-field schema | VERIFIED | topgun-finder.md Step 5a defines all 10 fields with defaults. SKILL.md output schema includes all 10 fields. Normalization step enforces presence/defaults for every field. |
| 3 | Registry timeout (>8s) does not stall the pipeline | VERIFIED | Every adapter specifies 8s timeout + exponential backoff on 429 + unavailable status on timeout/5xx. topgun-finder.md Step 4 enforces this contract. Pipeline continues to next registry without stalling. |
| 4 | ~/.topgun/found-skills-{hash}.json written with correct structure | VERIFIED | topgun-finder.md Step 7 writes full JSON envelope. SKILL.md Step 6 defines the identical output schema contract. $CLAUDE_PLUGIN_ROOT used for tool paths throughout. |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `agents/topgun-finder.md` | Full agent with 9+ steps, normalization, dedup, structural envelope | VERIFIED | 9 steps present: input read, hash, local search, registry dispatch, aggregation, normalization, contentSha, dedup, unavailable warning, structural envelope, output write, state update, completion marker |
| `skills/find-skills/SKILL.md` | Orchestration with ## FIND COMPLETE marker | VERIFIED | ## FIND COMPLETE at line 174, full orchestration steps present |
| `skills/find-skills/adapters/skills-sh.md` | Tier-1 adapter | VERIFIED | URL, timeout, retry, field mapping, return contract all present |
| `skills/find-skills/adapters/agentskill-sh.md` | Tier-1 adapter with contentSha | VERIFIED | Pre-flight check for ags CLI, contentSha field mapping present |
| `skills/find-skills/adapters/smithery.md` | Tier-1 adapter with auth | VERIFIED | keychain-get for smithery_token, graceful degradation if absent |
| `skills/find-skills/adapters/github.md` | Tier-1 adapter with auth | VERIFIED | keychain-get for github_token, correct API endpoint |
| `skills/find-skills/adapters/gitlab.md` | Tier-1 adapter with auth | VERIFIED | keychain-get for gitlab_token, correct API endpoint |
| `skills/find-skills/adapters/npm.md` | Tier-2 adapter | VERIFIED | Full frontmatter, field mapping, timeout/retry, $CLAUDE_PLUGIN_ROOT reference |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| topgun-finder.md Step 4 | adapters/{registry}.md | $CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/{registry}.md path | VERIFIED | Path pattern matches actual adapter file locations |
| topgun-finder.md Step 6 | raw_metadata wrapping | Structural envelope format | VERIFIED | Envelope format defined in Step 6, referenced from SKILL.md Step 6 Normalization #4 |
| topgun-finder.md Step 5d | unavailable_warning | unavailable_count >= 3 check | VERIFIED | Logic at Step 5d, output field in Step 7 schema |
| topgun-finder.md Step 5b | contentSha extraction | contentSha field from agentskill-sh, sha256 for raw SKILL.md URLs | VERIFIED | 4-case logic covers registry-provided, URL-derived, local, and pending |
| topgun-finder.md Step 7 | ~/.topgun/found-skills-{hash}.json | sha256 of task_description for filename | VERIFIED | sha256 command via topgun-tools.cjs in Steps 2 and 7 |

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| REQ-02 | Local search before external registries | VERIFIED | topgun-finder.md Step 3, SKILL.md Step 1 |
| REQ-03 | 5 Tier-1 registries queried | VERIFIED | All 5 adapter files present and substantive |
| REQ-05 | Timeout + retry contract on every WebFetch/Bash call | VERIFIED | Defined in every adapter and enforced in topgun-finder.md Step 4 |
| REQ-06 | Warning when 3+ registries unavailable | VERIFIED | topgun-finder.md Step 5d: unavailable_count >= 3 → warning + unavailable_warning: true |
| REQ-07 | contentSha extraction logic | VERIFIED | topgun-finder.md Step 5b: 4-case logic for contentSha population |
| NFR-01 | Structural envelope on all raw_metadata | VERIFIED | topgun-finder.md Step 6 defines envelope; applied to all external AND local results |

---

### Anti-Patterns Found

None detected. No TODOs, placeholders, empty implementations, or hardcoded paths found in reviewed files. `$CLAUDE_PLUGIN_ROOT` is used consistently for all tool invocations and path references.

**Note:** Tier-1 adapters (skills-sh, agentskill-sh, smithery, github, gitlab) do not explicitly map `install_count` or `security_score` in their field tables. This is acceptable — both fields default to `null` per the normalization step in topgun-finder.md Step 5a. The unified schema fields are populated at the orchestrator normalization layer, not required from each individual adapter.

---

### Human Verification Required

None. All success criteria are verifiable from static file analysis.

---

### Gaps Summary

No gaps found. All 4 observable truths verified. Phase goal is achieved:

- All 5 Tier-1 adapter files are present and substantive (skills-sh, agentskill-sh, smithery, github, gitlab)
- All 6 Tier-2 adapter files are present (npm, lobehub, osm, vskill, skillsmp, clawhub)
- The unified 10-field schema (name, description, source_registry, install_count, stars, security_score, last_updated, content_sha, install_url, raw_metadata) is enforced at normalization
- Timeout/unavailable handling is specified in every adapter and enforced in the orchestrator
- REQ-06 (3+ unavailable warning) is implemented in topgun-finder.md Step 5d
- REQ-07 (contentSha extraction) is implemented in topgun-finder.md Step 5b with 4-case logic
- NFR-01 (structural envelope on raw_metadata) is defined and referenced in both topgun-finder.md and SKILL.md
- $CLAUDE_PLUGIN_ROOT is used throughout; no hardcoded paths found

---

_Verified: 2026-04-13T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
