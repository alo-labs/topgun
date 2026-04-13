---
name: compare-skills
description: >
  Sub-skill of TopGun. Evaluates skill candidates across capability, security,
  popularity, and recency dimensions. Not normally invoked directly. The topgun
  orchestrator dispatches this via the topgun-comparator agent.
---

# CompareSkills

**Status:** Phase 3 — Step 1 (Envelope + Pre-filter)

## Overview

Evaluates skill candidates from FindSkills output across four scoring dimensions. Before any scoring, all metadata passes through structural envelope enforcement and pre-filters per REQ-09 and NFR-01.

## Pre-Filter Rules

Candidates are rejected before scoring if any string field contains:
1. **Base64 blobs** — sequences of 100+ base64 characters
2. **High Unicode** — codepoints above U+2000 (excluding standard punctuation)
3. **Zero-width characters** — U+200B through U+200F, U+2028 through U+202F, U+FEFF

Rejected candidates are logged with reason and excluded from scoring.

## Structural Envelope

All string metadata fields (name, description, raw_metadata values) are wrapped in `<structural_envelope>` tags with source registry and field name attributes before any agent context injection.

Numeric fields (install_count, stars, security_score) pass through unwrapped.

## Scoring Rubric

Each candidate is scored 0-100 on four dimensions:

| Dimension | Weight | Source Field | Null Default |
|-----------|--------|-------------|--------------|
| Capability Match | 40% | name + description vs query | 0 |
| Security Posture | 25% | security_score | 50 |
| Popularity | 20% | stars + install_count | 0 |
| Recency | 15% | last_updated | 10 |

**Composite:** `(capability_match * 0.40) + (security_posture * 0.25) + (popularity * 0.20) + (recency * 0.15)`

**Tie-breaking:** composite DESC, then name ASC.

**Security Warning:** Candidates with security_score < 30 are flagged with `security_warning: true` and a logged warning. They are NOT disqualified — the user sees the warning in output.

## Determinism

Same input always produces same ranked output. No randomness, no LLM-based scoring variability. Composite is a deterministic arithmetic formula; tie-breaking uses lexicographic name sort.

## Dispatch

This skill is dispatched by the topgun orchestrator via the topgun-comparator agent. Not normally invoked directly.
