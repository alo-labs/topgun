---
name: secure-skills
description: >
  Sub-skill of TopGun. Security-audits a skill via the Alo Labs Sentinel
  (/audit-security-of-skill), fixes findings, and produces a secured copy.
  Not normally invoked directly. The topgun orchestrator dispatches this
  via the topgun-securer agent.
---

# SecureSkills

**Status:** Phase 4 — Structural envelope and pre-filters implemented.

## Capabilities

- Wraps external SKILL.md content in `<structural-envelope>` tags with source attribution and SHA-256
- Pre-filters executable body sections for phone-home patterns (curl, wget, fetch) per REQ-15
- Inspects allowed-tools frontmatter for dangerous permissions (Bash, Computer, wildcard)
- Computes and stores content SHA-256 for downstream integrity verification

## Dispatch

This skill is dispatched by the TopGun orchestrator via the `topgun-securer` agent. Not normally invoked directly.

## Completion Markers

- `## SECURE COMPLETE` — audit passed
- `## SECURE REJECTED` — pre-filter rejection (phone-home detected)
- `## SECURE ESCALATED` — finding requires user decision
