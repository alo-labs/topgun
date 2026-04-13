---
phase: 03-compareskills-multi-factor-ranking
verified: 2026-04-13T00:00:00Z
status: gaps_found
score: 6/8
overrides_applied: 0
gaps:
  - truth: "Winner selection is deterministic for same input — tie-breaking by highest composite → security → recency → name"
    status: partial
    reason: "Tie-breaking in Step 5 of topgun-comparator.md only uses composite DESC then name ASC. The intermediate tie-breakers (security, then recency) specified in the phase success criteria are absent."
    artifacts:
      - path: "agents/topgun-comparator.md"
        issue: "Step 5 tie-break reads: 'Sort candidates by composite DESC. On tie, sort by name ASC (lexicographic).' Security and recency tie-breakers not present."
    missing:
      - "Add secondary tie-break: security_posture DESC before name ASC in Step 5"
      - "Add tertiary tie-break: recency DESC before name ASC in Step 5"
  - truth: "comparison-{hash}.json written with scores per dimension and ranked list — output contains fields: query, generated_at, winner, shortlist, rejected, scores_by_dimension"
    status: partial
    reason: "Output JSON uses different field names than specified. 'generated_at' is named 'compared_at'. 'shortlist' does not exist — 'ranked_list' is used instead. 'rejected' is 'rejected_count' (a count, not a list of rejected candidates). 'scores_by_dimension' does not exist as a top-level field — scores are embedded per candidate inside ranked_list entries."
    artifacts:
      - path: "agents/topgun-comparator.md"
        issue: "Step 7 output schema uses compared_at, ranked_list, rejected_count. No top-level shortlist or scores_by_dimension field defined."
    missing:
      - "Rename 'compared_at' to 'generated_at' OR confirm the field name deviation is intentional"
      - "Add 'shortlist' field OR confirm 'ranked_list' is the accepted alternative"
      - "Add 'rejected' array (rejected candidate names/reasons) OR confirm rejected_count is sufficient"
      - "Add top-level 'scores_by_dimension' summary OR confirm per-candidate scores satisfy the requirement"
---

# Phase 3: CompareSkills — Multi-Factor Ranking Verification Report

**Phase Goal:** Implement multi-factor ranking for skill candidates: structural envelope enforcement, pre-filter, four-dimension scoring, deterministic winner selection, comparison JSON output.
**Verified:** 2026-04-13T00:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | All metadata passes through structural envelope before scoring | VERIFIED | topgun-comparator.md Step 2 (pre-filter) runs before Step 3 (envelope) which runs before Step 4 (scoring). Explicit instruction: "Before injecting any candidate metadata into your reasoning context, wrap every string field in a structural envelope." |
| 2 | Candidates with security_score < 30 are flagged with warning | VERIFIED | Step 4b: "If security_score < 30: set security_warning: true on the candidate and log: SECURITY WARNING: {name} has security_score {score} (< 30 threshold)" |
| 3 | Pre-filter rejects base64 blobs (100+ chars) | VERIFIED | Step 2 defines regex `/[A-Za-z0-9+\/]{100,}={0,2}/` and rejects with logged reason |
| 4 | Pre-filter rejects High Unicode > U+2000 | VERIFIED | Step 2 defines regex `/[\u2001-\uFFFF]/` |
| 5 | Pre-filter rejects zero-width characters | VERIFIED | Step 2 defines regex `/[\u200B-\u200F\u2028-\u202F\uFEFF]/` |
| 6 | Scoring uses four dimensions with correct weights | VERIFIED | Steps 4a-4d define capability (0.40), security (0.25), popularity (0.20), recency (0.15). Composite formula present in Step 5. |
| 7 | Winner selection is deterministic — tie-break: composite → security → recency → name | FAILED | Step 5 only implements composite DESC then name ASC. Security and recency intermediate tie-breakers absent. |
| 8 | comparison-{hash}.json written with required output fields (query, generated_at, winner, shortlist, rejected, scores_by_dimension) | FAILED | Output schema uses different field names: compared_at (not generated_at), ranked_list (not shortlist), rejected_count (not rejected array), no top-level scores_by_dimension. |

**Score:** 6/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `agents/topgun-comparator.md` | Full flow: envelope → pre-filter → score → rank → JSON output → COMPARE COMPLETE | VERIFIED | All 9 steps present. Structural envelope in Step 3, pre-filter in Step 2, scoring in Steps 4-5, ranking in Step 6, output in Step 7, COMPARE COMPLETE in Step 9. |
| `skills/compare-skills/SKILL.md` | COMPARE COMPLETE marker, pre-filter documentation, envelope step | VERIFIED | Contains "## COMPARE COMPLETE" section reference, Pre-Filter Rules section, Structural Envelope section, Scoring Rubric table, Determinism section. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| topgun-comparator.md | found-skills-{hash}.json | reads normalized FindSkills output | VERIFIED | Step 1: reads state to get found-skills file path; Step 2 iterates candidates from that file |
| topgun-comparator.md | ~/.topgun/comparison-{hash}.json | Write tool | VERIFIED | Step 7: "Use the Write tool to write this JSON file to ~/.topgun/comparison-${HASH}.json" |
| topgun-comparator.md | topgun-tools.cjs | state-write for comparison_path | VERIFIED | Steps 1, 7, 8: uses `node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write` |
| $CLAUDE_PLUGIN_ROOT | bin/topgun-tools.cjs | environment variable (no hardcoded paths) | VERIFIED | All bash commands use $CLAUDE_PLUGIN_ROOT — no absolute or hardcoded paths found |

### Data-Flow Trace (Level 4)

Not applicable — this is an agent instruction document (markdown), not a runnable module. Data flow is defined declaratively and executed by the Claude agent at runtime.

### Behavioral Spot-Checks

Step 7b: SKIPPED — no runnable entry points. `topgun-comparator.md` is an agent instruction document executed by a Claude agent at runtime, not a CLI or module that can be invoked directly.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| REQ-09 | 03-01-PLAN.md | Pre-filter: base64, high Unicode, zero-width; structural envelope | SATISFIED | All three pre-filter patterns defined in Step 2; structural envelope defined in Step 3 |
| NFR-01 | 03-01-PLAN.md | Structural envelope enforcement before scoring | SATISFIED | Step 3 explicitly wraps all string fields before Step 4 scoring |
| REQ-08 | 03-02-PLAN.md, 03-03-PLAN.md | Multi-factor scoring across four dimensions with deterministic ranking | PARTIAL | Scoring rubric fully implemented. Determinism claimed but tie-break incomplete (missing security/recency intermediate steps). Output schema field names diverge from specified contract. |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| agents/topgun-comparator.md Step 5 | Tie-break only uses name ASC after composite — missing security and recency intermediate tie-breakers | Warning | Could produce non-deterministic output ordering when composite AND name happen to match across registries |
| agents/topgun-comparator.md Step 7 | Output uses `compared_at` not `generated_at`, `ranked_list` not `shortlist`, `rejected_count` not `rejected` array | Warning | Downstream consumers expecting the documented schema will receive unexpected field names |

### Human Verification Required

None identified.

### Gaps Summary

Two gaps block full goal achievement:

**Gap 1 — Incomplete tie-breaking (partial determinism)**

The phase success criteria specifies tie-breaking order as: highest composite → security → recency → name. The implementation in Step 5 of `topgun-comparator.md` only applies composite DESC then name ASC. The intermediate tie-breakers on security_posture and recency are absent. For most inputs this will produce correct results, but two candidates with identical composite scores and identical names (impossible) or same composite but different names would be ranked without considering security posture as the tiebreaker. The PLAN frontmatter only required "deterministic results for same input" which is technically satisfied, but the specific ordering contract in the success criteria is not fully met.

**Gap 2 — Output JSON field name mismatches**

The phase success criteria specifies output fields: `query`, `generated_at`, `winner`, `shortlist`, `rejected`, `scores_by_dimension`. The actual schema in Step 7 uses: `query` (matches), `compared_at` (not `generated_at`), `winner` (matches), `ranked_list` (not `shortlist`), `rejected_count` (count only, not a list), no top-level `scores_by_dimension`. The PLAN 03 frontmatter truth says "scores per dimension and ranked list" which is substantively met — scores are present per candidate. Whether the field name divergences represent intentional design choices or specification drift requires clarification.

---

_Verified: 2026-04-13T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
