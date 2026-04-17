<!-- generated-by: gsd-doc-writer -->
# Product Requirements Overview

This document captures the product vision and high-level requirements.
It is kept in sync with `.planning/REQUIREMENTS.md` — the authoritative requirements
source managed by GSD. Update during the FINALIZATION step of each phase.

## Product Vision

TopGun is a Claude Code plugin that automates skill discovery, evaluation, and installation. Users describe what they need in plain language; TopGun searches 18+ registries in parallel, compares candidates across multiple quality dimensions, audits the winner for security, and installs it — without the user needing to know which registries exist or how to evaluate a skill's safety manually. The goal is to make "get the best tool for this job" a single command rather than a manual research task.

## Core Value

Any skill, best quality, one command — with security audited before install.

A user should never have to manually browse registries, compare options, or wonder whether a skill is safe. TopGun handles all three concerns automatically and gates installation behind a verified audit.

## Requirement Areas

### Discovery
- Search across all 18 supported registries on every invocation
- All registry searches run in parallel (no sequential batching)
- Registry dispatch is mechanical (Node.js subprocess fan-out), not LLM-driven, to guarantee actual dispatch
- Failed or unavailable registries are recorded as `unavailable` rather than silently omitted
- Offline mode: serve cached results when network is unavailable (`--offline` flag)

### Evaluation
- Multi-factor ranking: capability match, security posture signals, registry popularity, recency
- Comparison artifact persisted so results are inspectable after the fact
- User can scope search to a subset of registries via `--registries` flag

### Security
- Every candidate audited by bundled SENTINEL v2.3.0 before installation
- Two consecutive clean passes required — one pass is not sufficient
- Structural envelope applied to all raw registry metadata to prevent prompt injection
- Audit results cached by content SHA; `--force-audit` bypasses cache
- A skill that fails audit is never presented for installation

### Installation
- User must explicitly approve the audit manifest before any files are written
- Skill installed to `~/.claude/skills/{name}/`
- Reproducibility lock written per run (`~/.topgun/topgun-lock.json`)
- Audit trail written alongside the installed skill

## Out of Scope

- **Building skills** — TopGun finds and installs existing skills; it does not scaffold or generate new skill files.
- **Publishing to registries** — TopGun does not submit skills to any registry on the user's behalf.
- **Managing installed skills** — beyond the install step, TopGun does not update, remove, or audit already-installed skills. Post-install lifecycle is out of scope.
- **Registry operation** — TopGun is a consumer of registries, not an operator. It has no ability to add, edit, or remove entries from any registry it searches.
