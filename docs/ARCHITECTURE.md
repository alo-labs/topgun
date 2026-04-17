<!-- generated-by: gsd-doc-writer -->
# Architecture and Design

This document captures high-level architecture and general design principles.
Detailed phase-level designs live in `docs/specs/YYYY-MM-DD-<topic>-design.md`.

## System Overview

TopGun is a Claude Code plugin that automates skill discovery, evaluation, and installation. When a user describes a task, TopGun searches 18 registries in parallel, compares candidates on multiple dimensions, runs a two-pass security audit via bundled SENTINEL v2.3.0, and installs the approved skill — all without the user needing to know which registries exist or how to evaluate security manually. The system is structured as a four-stage sequential pipeline orchestrated by a single `/topgun` skill, with each stage producing a JSON artifact consumed by the next.

## Pipeline Stages

| Stage | Agent | Output artifact |
|-------|-------|-----------------|
| Find | `topgun-finder` | `~/.topgun/found-skills-{hash}.json` |
| Compare | `topgun-comparator` | `~/.topgun/comparison-{hash}.json` |
| Secure | `topgun-securer` | `~/.topgun/audit-{hash}.json` |
| Install | `topgun-installer` | installed to `~/.claude/skills/{name}/` |

**Find** — dispatches one subprocess per registry via `bin/topgun-tools.cjs dispatch-registries`, then aggregates 18 partial result files into the found-skills artifact. The aggregation write is enforced by a PreToolUse hook (see Registry Dispatch Architecture).

**Compare** — reads the found-skills artifact and ranks candidates using a multi-factor model: capability match, security posture signals, registry popularity, and recency.

**Secure** — runs bundled SENTINEL v2.3.0 against the top-ranked candidate. Requires two consecutive clean passes. A skill that fails is never presented for installation.

**Install** — presents the audit manifest to the user for explicit approval, installs the skill to `~/.claude/skills/{name}/`, and writes the audit trail.

## Component Model

| Component | File | Responsibility |
|-----------|------|----------------|
| Orchestrator | `skills/topgun/SKILL.md` | Top-level `/topgun` skill; sequences the four stages |
| Finder agent | `agents/topgun-finder.md` | Runs dispatch, aggregates partials, writes found-skills artifact |
| Comparator agent | `agents/topgun-comparator.md` | Ranks candidates; writes comparison artifact |
| Securer agent | `agents/topgun-securer.md` | Runs SENTINEL audit; writes audit artifact |
| Installer agent | `agents/topgun-installer.md` | Gets user approval; installs skill; writes audit trail |
| topgun-tools binary | `bin/topgun-tools.cjs` | Node.js CLI: init, state I/O, sha256, dispatch-registries, validate-partials, cache, keychain, lock |
| Validate-partials hook | `bin/hooks/validate-partials.sh` | PreToolUse:Write enforcement — blocks aggregation write if < 18 partials |
| Registry adapters | `skills/find-skills/adapters/` | 18 self-contained instruction files, one per registry |
| SENTINEL | `skills/sentinel/SKILL.md` | Bundled SENTINEL v2.3.0 security auditor |

## Registry Dispatch Architecture (v1.3.0)

This is the most architecturally significant component. Before v1.3.0, the finder dispatched registry searches via LLM `Agent` sub-calls. This was unreliable: the model synthesized plausible-looking output from training data instead of actually dispatching (issue #2). v1.3.0 moved dispatch entirely out of the LLM.

### Dispatch flow

1. The finder calls `bin/topgun-tools.cjs dispatch-registries` via `Bash`.
2. The Node.js command reads the 18 adapter file paths and spawns one `claude --bare` subprocess per registry using `child_process.spawn` + `Promise.allSettled`. All 18 run concurrently.
3. Each subprocess writes a partial file: `~/.topgun/registry-{hash}-{registry}.json`. On failure or timeout the binary writes `{ "status": "unavailable" }` rather than omitting the file. Aggregation always sees exactly 18 files; missing registries are visible rather than silently absent.
4. The finder calls `bin/topgun-tools.cjs validate-partials` to self-verify the count.
5. The finder writes the aggregated `found-skills-{hash}.json` artifact.
6. Before the write lands, `bin/hooks/validate-partials.sh` fires as a `PreToolUse:Write` hook. It extracts the hash from the target filename, counts `registry-{hash}-*.json` files, and exits 1 (blocking the write) if fewer than 18 are present.

### Why three layers of enforcement

| Layer | Mechanism | Can be bypassed by agent? |
|-------|-----------|--------------------------|
| Prompt instruction | Text in SKILL.md | Yes — model can ignore |
| Binary self-check | `validate-partials` Node.js command | Theoretically yes (Bash call omitted) |
| PreToolUse hook | `validate-partials.sh` in `settings.json` | No — OS-level interception |

The hook is the only enforcement layer that cannot be bypassed by agent behavior.

### `--bare` flag on adapter subprocesses

Adapter subprocesses use `claude --bare` to skip hooks, LSP, and plugin sync for speed. `CLAUDE.md` is not auto-discovered; adapter prompts must be fully self-contained.

## State Machine

State is persisted at `~/.topgun/state.json` across agent handoffs.

| Field | Description |
|-------|-------------|
| `run_id` | Unique identifier for this invocation |
| `task_description` | User's original request |
| `current_stage` | One of: `find`, `compare`, `secure`, `install` |
| `last_completed_stage` | Last stage that wrote a clean artifact |
| `found_skills_path` | Absolute path to found-skills artifact |
| `comparison_path` | Absolute path to comparison artifact |
| `audit_path` | Absolute path to audit artifact |

The `--reset` flag clears state and starts a fresh pipeline run.

## File Layout

```
bin/
  topgun-tools.cjs           # Binary: all non-LLM operations
  hooks/
    validate-partials.sh     # PreToolUse:Write enforcement hook
agents/
  topgun-finder.md           # Find agent (tools: Read, Write, Bash, Grep, WebFetch, WebSearch)
  topgun-comparator.md       # Compare agent
  topgun-securer.md          # Secure agent
  topgun-installer.md        # Install agent
skills/
  topgun/SKILL.md            # Main orchestrator skill
  find-skills/SKILL.md       # Find sub-skill spec
  find-skills/adapters/      # 18 registry adapter instruction files
  compare-skills/SKILL.md
  secure-skills/SKILL.md
  install-skills/SKILL.md
  sentinel/SKILL.md          # Bundled SENTINEL v2.3.0
.claude-plugin/
  plugin.json                # version, agents array, skills path
  marketplace.json           # version (must match plugin.json)

~/.topgun/                   # Runtime directory (not in repo)
  state.json                 # Pipeline state
  found-skills-{hash}.json   # Find stage output
  comparison-{hash}.json     # Compare stage output
  audit-{hash}.json          # Secure stage output
  topgun-lock.json           # Reproducibility lock
  audit-cache/               # SHA-based audit result cache
  registry-{hash}-{name}.json  # Per-registry partial files
```

## Security Architecture

**Structural envelope** — all `raw_metadata` returned by registry adapters is wrapped in a structural envelope before it reaches the comparator or securer. This prevents prompt-injection payloads embedded in skill descriptions from influencing agent behavior.

**SENTINEL v2.3.0** — bundled directly in `skills/sentinel/SKILL.md`. Eliminates the external `/audit-security-of-skill` dependency; audit quality is version-locked with the plugin. Two consecutive clean passes are required before a skill is considered safe.

**Approval gate** — the installer presents the full audit manifest to the user and requires explicit approval before writing any files.

**Reproducibility lock** — `~/.topgun/topgun-lock.json` records the exact registry results and audit hash for each run, enabling reproduction of any install.

**Audit cache** — `~/.topgun/audit-cache/` stores audit results keyed by content SHA. `--force-audit` bypasses the cache and re-runs SENTINEL.

## Design Principles

**Mechanical dispatch over LLM fan-out** — LLM-driven Agent dispatch (even with `Agent` in the tools list) proved unreliable because the model synthesizes expected output shapes from training data instead of spawning actual sub-calls. Node.js subprocess fan-out via `child_process.spawn` is the only approach that provides dispatch guarantees.

**Unavailable partials always written** — if a registry subprocess fails or times out, the binary writes an `unavailable` status partial rather than omitting the file. Aggregation always sees exactly 18 files, making failures visible rather than silently absent.

**Hook as final enforcement gate** — prompt instructions and binary self-checks can both be bypassed by agent behavior in different ways. A `PreToolUse:Write` hook intercepts at the OS tool-use level and cannot be bypassed.

**Security bundled, not external** — SENTINEL is versioned with the plugin. An external audit skill dependency could be unavailable, outdated, or itself compromised. Bundling eliminates this attack surface.

**Version alignment invariant** — `plugin.json` and `marketplace.json` must carry identical version strings. Mismatch causes Claude Desktop to not expose skills or agents.
