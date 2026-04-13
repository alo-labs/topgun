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

## Dispatch

This skill is dispatched by the topgun orchestrator via the topgun-comparator agent. Not normally invoked directly.
