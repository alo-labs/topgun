---
name: compare-skills
description: >
  Sub-skill of TopGun. Evaluates skill candidates across capability, security,
  popularity, and recency dimensions. Not normally invoked directly. The topgun
  orchestrator dispatches this via the topgun-comparator agent.
---

# CompareSkills

**Status:** Phase 3 — Complete

## Overview

Evaluates skill candidates from FindSkills output across four scoring dimensions. Before any scoring, all metadata passes through structural envelope enforcement and pre-filters per REQ-09 and NFR-01.

## Pre-Filter Rules

Candidates are rejected before scoring if any string field contains:
1. **Base64 blobs** — sequences of 100+ base64 characters
2. **Zero-width characters** — U+200B-U+200F, U+2028-U+202F, U+FEFF
3. **Abuse-prone Unicode** — Variation Selectors (U+FE00-U+FE0F), Tag chars (U+E0000-U+E007F), Variation Selectors Supplement (U+E0100-U+E01EF), Bidi-isolate controls (U+2066-U+2069), Bidi-override controls (U+202A-U+202E), Private Use Area (U+E000-U+F8FF)
4. **Unicode density** — > 30% non-printable-ASCII codepoints AND > 200 chars long. Local-source skills are exempt.

Regular emoji, CJK characters, and accented Latin are NOT rejected — only abuse-prone codepoint ranges. Rejected candidates are logged with reason and excluded from scoring.

## Structural Envelope

All string metadata fields (name, description, raw_metadata values) are wrapped in `<structural_envelope>` tags with source registry and field name attributes before any agent context injection.

Numeric fields (install_count, stars, security_score) pass through unwrapped.

## Scoring Rubric

Each candidate is scored 0-100 on four dimensions:

| Dimension | Weight | Source Field | Null Default |
|-----------|--------|-------------|--------------|
| Capability Match | 55% | name + description vs query | 0 |
| Security Posture | 20% | security_score | 50 |
| Popularity | 15% | stars + install_count | 0 |
| Recency | 10% | last_updated | 10 |

**Composite (raw):** `(capability_match * 0.55) + (security_posture * 0.20) + (popularity * 0.15) + (recency * 0.10)`

**Capability floor:** if `capability_match < 30`, the composite is multiplied by `0.5`. Low-fit candidates are heavily demoted so popular/recent skills can't displace true matches just because the true match has zero stars.

**Tie-breaking:** composite DESC, then capability_match DESC, then security_posture DESC, then recency DESC, then name ASC.

**Security Warning:** Candidates with security_score < 30 are flagged with `security_warning: true` and a logged warning. They are NOT disqualified — the user sees the warning in output.

## Determinism

Same input always produces same ranked output. No randomness, no LLM-based scoring variability. Composite is a deterministic arithmetic formula; tie-breaking uses lexicographic name sort.

## Output

Writes `~/.topgun/comparison-{hash}.json` containing:
- `generated_at` — ISO 8601 timestamp
- Winner with full score breakdown
- `shortlist` — ranked list of all non-rejected candidates
- `rejected` — array of rejected candidates with their rejection reasons
- `scores_by_dimension` — weight configuration used: `{"capability_weight": 0.55, "security_weight": 0.20, "popularity_weight": 0.15, "recency_weight": 0.10, "capability_floor": 30, "capability_floor_penalty": 0.5}`

Updates `~/.topgun/state.json` with `comparison_path`, `winner_name`, `winner_registry`.

## Completion

On success, outputs:

```
## COMPARE COMPLETE

Compared {N} candidates ({M} rejected by pre-filter).
Winner: {name} from {registry} (score: {composite}).
```

## Dispatch

This skill is dispatched by the topgun orchestrator via the topgun-comparator agent. Not normally invoked directly.
