<!-- generated-by: gsd-doc-writer -->
# Architecture and Design

This document captures high-level architecture and general design principles.
Detailed phase-level designs live in `docs/specs/YYYY-MM-DD-<topic>-design.md`.

## System Overview

TopGun is a Claude Code plugin that automates skill discovery, evaluation, and installation. When a user describes a task, TopGun searches 16 active registries in parallel, compares candidates on multiple dimensions, runs a two-pass security audit via bundled SENTINEL v2.3.0, and installs the approved skill — all without the user needing to know which registries exist or how to evaluate security manually. The system is structured as a four-stage sequential pipeline orchestrated by a single `/topgun` skill, with each stage producing a JSON artifact consumed by the next.

## Pipeline Stages

| Stage | Agent | Output artifact |
|-------|-------|-----------------|
| Find | `topgun-finder` | `~/.topgun/found-skills-{hash}.json` |
| Compare | `topgun-comparator` | `~/.topgun/comparison-{hash}.json` |
| Secure | `topgun-securer` | `~/.topgun/audit-{hash}.json` |
| Install | `topgun-installer` | installed to `~/.codex/skills/{name}/` |

**Find** — dispatches one in-process `Task` sub-agent per registry from `topgun-finder` (in a single parallel batch), then aggregates 16 partial result files into the found-skills artifact. The aggregation write is enforced by a PreToolUse hook (see Registry Dispatch Architecture).

**Compare** — reads the found-skills artifact and ranks candidates using a multi-factor model: capability match, security posture signals, registry popularity, and recency.

**Secure** — runs bundled SENTINEL v2.3.0 against the top-ranked candidate. Requires two consecutive clean passes. A skill that fails is never presented for installation.

**Install** — presents the audit manifest to the user for explicit approval, installs the skill to `~/.codex/skills/{name}/`, and writes the audit trail.

## Component Model

| Component | File | Responsibility |
|-----------|------|----------------|
| Orchestrator | `skills/topgun/SKILL.md` | Top-level `/topgun` skill; sequences the four stages |
| Finder agent | `agents/topgun-finder.md` | Runs dispatch, aggregates partials, writes found-skills artifact |
| Comparator agent | `agents/topgun-comparator.md` | Ranks candidates; writes comparison artifact |
| Securer agent | `agents/topgun-securer.md` | Runs SENTINEL audit; writes audit artifact |
| Installer agent | `agents/topgun-installer.md` | Gets user approval; installs skill; writes audit trail |
| topgun-tools binary | `bin/topgun-tools.cjs` | Node.js CLI: init, state I/O, sha256, validate-partials, cache, keychain, lock |
| Claude plugin manifest | `.claude-plugin/plugin.json` | Claude-facing plugin manifest; points at shared `skills/`, `agents/`, and plugin-owned hooks |
| Codex plugin manifest | `.codex-plugin/plugin.json` | Codex-facing plugin manifest; points at the same shared `skills/` tree |
| Codex marketplace manifest | `.agents/plugins/marketplace.json` | Codex-facing marketplace metadata for the shared `.codex-plugin/` bundle |
| Plugin hook manifest | `hooks/hooks.json` (mirrored to `.claude-plugin/hooks/hooks.json`) | PreToolUse:Write enforcement — blocks aggregation write if < 16 partials |
| Registry adapters | `skills/find-skills/adapters/` | 16 self-contained instruction files, one per active registry |
| SENTINEL | `skills/sentinel/SKILL.md` | Bundled SENTINEL v2.3.0 security auditor |

## Registry Dispatch Architecture (v1.5.0)

This is the most architecturally significant component. The dispatch model has now been through three iterations:

| Version | Model | Why it failed |
|---------|-------|---------------|
| ≤ v1.2 | LLM `Agent` fan-out (model dispatches 18 sub-agents inline) | Model hallucinated plausible-looking outputs instead of actually dispatching (issue #2) |
| v1.3 – v1.4 | Mechanical `child_process.spawn('claude --bare', ...)` from `bin/topgun-tools.cjs dispatch-registries` | Spawned subprocesses cannot inherit OAuth tokens — silently broke FindSkills for Pro/Teams users (issue #3) |
| v1.5+ | In-process parallel `Task` dispatch from `topgun-finder` | Inherits parent agent auth context for both OAuth and API-key |

### Dispatch flow (v1.5+)

1. `topgun-finder` parses the registry list (defaults to all 16 active registries) and computes the query hash.
2. The agent emits **one assistant turn containing 16 `Task` tool blocks**, one per active registry, all using `subagent_type: "general-purpose"`. The runtime executes them concurrently.
3. Each adapter sub-agent reads the adapter instruction file, performs registry-specific HTTP/WebSearch calls under the parent's auth, applies the structural envelope and HTTPS scheme check, and writes `~/.topgun/registry-{hash}-{registry}.json`.
4. After all 16 Tasks complete, `topgun-finder` runs `ls ~/.topgun/registry-{hash}-*.json | wc -l`. Any missing registries are treated as `status: "unavailable"` during aggregation; missing registries are still visible rather than silently absent.
5. The finder writes the aggregated `found-skills-{hash}.json` artifact.
6. Before the write lands, `bin/hooks/validate-partials.sh` fires as a `PreToolUse:Write` hook. It extracts the hash from the target filename, counts `registry-{hash}-*.json` files, and exits 1 (blocking the write) if fewer than 16 are present.

### Why two layers of enforcement

| Layer | Mechanism | Can be bypassed by agent? |
|-------|-----------|--------------------------|
| Prompt instruction | Text in SKILL.md and `topgun-finder.md` | Yes — model can ignore |
| PreToolUse hook | `validate-partials.sh` in `hooks/hooks.json` | No — OS-level interception |

The hook is the only enforcement layer that cannot be bypassed by agent behavior. With v1.3's intermediate `validate-partials` Node.js self-check now removed (the binary still exposes the command, but the dispatch path no longer relies on it), the hook is the canonical guarantee.

### Auth inheritance — why in-process dispatch works

A `Task` sub-agent runs inside the same Claude Code session as its parent and uses the same auth context: OAuth session tokens, API keys, or first-party credentials. A `child_process.spawn('claude', ...)` subprocess starts a fresh CLI invocation that re-authenticates from `ANTHROPIC_API_KEY` env var alone — OAuth refresh tokens, the Pro/Teams default, are not inheritable across process boundaries. v1.5 picks the model that works for the majority case.

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
hooks/
  hooks.json                 # Root hook manifest used by Codex installs
agents/
  topgun-finder.md           # Find agent (tools: Read, Write, Bash, Grep, Glob, Task, WebFetch, WebSearch)
  topgun-comparator.md       # Compare agent
  topgun-securer.md          # Secure agent
  topgun-installer.md        # Install agent
skills/
  topgun/SKILL.md            # Main orchestrator skill
  find-skills/SKILL.md       # Find sub-skill spec
  find-skills/adapters/      # 16 registry adapter instruction files
  compare-skills/SKILL.md
  secure-skills/SKILL.md
  install-skills/SKILL.md
  sentinel/SKILL.md          # Bundled SENTINEL v2.3.0
.claude-plugin/
  plugin.json                # version, agents array, skills path
  hooks/hooks.json           # Claude-compatible mirror of the hook manifest
  marketplace.json           # version (must match plugin.json)
.codex-plugin/
  plugin.json                # Codex manifest pointing at the shared skills tree
.agents/
  plugins/
    marketplace.json         # Codex marketplace metadata

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

**In-process `Task` dispatch over LLM-narrated `Agent` fan-out** — early `Agent`-tool dispatch (≤ v1.2) was unreliable because the model synthesized plausible-looking outputs without spawning actual sub-calls. The structured `Task` tool is the right primitive for parallel adapter dispatch: the runtime, not the model, guarantees the sub-calls execute.

**In-process `Task` dispatch over `child_process.spawn`** — the v1.3-v1.4 subprocess approach gave dispatch guarantees but broke OAuth auth (issue #3). `Task` sub-agents inherit the parent's auth context, work for both OAuth and API-key, and remove the dependency on `claude` being on `$PATH`.

**Unavailable partials are inferred from set difference** — with subprocess dispatch retired, missing partials are detected by comparing the 16 active registry names against the basenames of present `registry-{hash}-*.json` files. Missing registries become `status: "unavailable"` during aggregation, preserving the v1.3 visibility guarantee.

**Hook as final enforcement gate** — prompt instructions and binary self-checks can both be bypassed by agent behavior in different ways. A `PreToolUse:Write` hook intercepts at the OS tool-use level and cannot be bypassed.

**Security bundled, not external** — SENTINEL is versioned with the plugin. An external audit skill dependency could be unavailable, outdated, or itself compromised. Bundling eliminates this attack surface.

**Version alignment invariant** — `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and `.claude-plugin/marketplace.json` must carry identical version strings. Mismatch causes the runtime to not expose skills or agents.
