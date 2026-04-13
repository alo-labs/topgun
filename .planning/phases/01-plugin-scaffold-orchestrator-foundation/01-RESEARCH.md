# Phase 1: Plugin Scaffold + Orchestrator Foundation - Research

**Researched:** 2026-04-13
**Domain:** Claude Code plugin structure, Node.js CLI tooling, orchestrator patterns
**Confidence:** HIGH

## Summary

Phase 1 establishes the foundational plugin file layout, the `topgun-tools.cjs` CLI helper, and the orchestrator skill that dispatches stub sub-agents. All patterns are directly derived from two verified reference implementations on this machine: the GSD plugin (`~/.claude/get-shit-done/`) and the MultAI plugin (`~/.claude/plugins/cache/multai/multai/0.3.0/`).

The plugin system is well-understood. `.claude-plugin/plugin.json` is the only required manifest file. Skills in `skills/*/SKILL.md` and agents in `agents/*.md` are auto-discovered. `$CLAUDE_PLUGIN_ROOT` resolves all intra-plugin paths at runtime. The CLI helper (`topgun-tools.cjs`) follows `gsd-tools.cjs` patterns: a single CJS file with a `switch(command)` dispatcher, writing JSON to `~/.topgun/`.

**Primary recommendation:** Build the exact file tree from the architecture research, stub all skills/agents with valid frontmatter, implement topgun-tools.cjs with init/state/cache/sha256/keychain commands, then wire the orchestrator to dispatch 4 stub agents sequentially with completion marker detection.

## Project Constraints (from CLAUDE.md)

- CLAUDE.md is minimal -- no specific coding conventions, forbidden patterns, or testing rules defined yet
- Silver Bullet enforcement lives in `silver-bullet.md` (referenced but not project-blocking for Phase 1)
- Git repo: `https://github.com/alo-labs/topgun.git`

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-01 | Orchestrator sequences FindSkills->CompareSkills->SecureSkills->[approval]->InstallSkills with audit trail header | Architecture research: Task() dispatch pattern, completion markers, sequential wave model |
| REQ-25 | topgun-tools.cjs CLI helper with cache, SHA-256, state, keychain | GSD gsd-tools.cjs reference implementation directly inspected |
| REQ-27 | Explicit invocation only via `/topgun <task>` | SKILL.md description field controls activation; use specific trigger phrases |
| NFR-06 | Conform to `.claude-plugin/` layout standard, use `$CLAUDE_PLUGIN_ROOT` | Stack research: confirmed from multai, superpowers, official example-plugin |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js (CJS) | v25.6.0 | topgun-tools.cjs runtime | Already installed; gsd-tools.cjs uses same pattern [VERIFIED: `node --version`] |
| macOS `security` CLI | system | Keychain integration for auth tokens | Available at `/usr/bin/security` [VERIFIED: `command -v security`] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` | built-in | SHA-256 hashing | `topgun-tools.cjs sha256` command |
| `node:fs` | built-in | File I/O for state/cache | All state read/write operations |
| `node:path` | built-in | Cross-platform path handling | All file path construction |
| `node:child_process` | built-in | macOS keychain via `security` CLI | `keychain-get`/`keychain-set` commands |

**Installation:** No npm dependencies required. Pure Node.js built-ins only, matching gsd-tools.cjs pattern. [VERIFIED: gsd-tools.cjs has zero npm dependencies]

## Architecture Patterns

### Plugin File Layout
```
topgun/
  .claude-plugin/
    plugin.json              # {"name": "topgun", "version": "1.0.0", ...}
  skills/
    topgun/SKILL.md          # Orchestrator entry point
    find-skills/SKILL.md     # Stub
    compare-skills/SKILL.md  # Stub
    secure-skills/SKILL.md   # Stub
    install-skills/SKILL.md  # Stub
  agents/
    topgun-finder.md         # Sub-agent definition
    topgun-comparator.md     # Sub-agent definition
    topgun-securer.md        # Sub-agent definition
    topgun-installer.md      # Sub-agent definition
  bin/
    topgun-tools.cjs         # CLI helper
  hooks/
    hooks.json               # Empty or SessionStart bootstrap
```
[VERIFIED: layout confirmed from multai plugin.json and GSD structure]

### Pattern 1: Task() Sequential Dispatch
**What:** Orchestrator dispatches sub-agents one at a time, checking completion markers between each.
**When to use:** Every `/topgun` invocation.
**Example:**
```
Task(
  subagent_type="topgun-finder",
  description="Search registries for skills matching: <task>",
  prompt="<constructed prompt with files_to_read>"
)
```
[VERIFIED: observed in gsd-executor.md and execute-phase.md]

### Pattern 2: Filesystem as Inter-Agent Bus
**What:** Each sub-agent writes output to `~/.topgun/{artifact}-{hash}.json`. Next agent reads that file.
**When to use:** All inter-agent data passing.
**Key rule:** Orchestrator passes file paths, not file content, to sub-agents via `<files_to_read>` blocks.
[VERIFIED: GSD researcher->planner->executor chain uses identical pattern]

### Pattern 3: Completion Marker Contract
**What:** Each sub-agent ends output with a structured marker. Orchestrator matches before proceeding.
**Markers:**
- FindSkills: `## FIND COMPLETE`
- CompareSkills: `## COMPARE COMPLETE`
- SecureSkills: `## SECURE COMPLETE`
- InstallSkills: `## INSTALL COMPLETE`
[VERIFIED: GSD uses `## RESEARCH COMPLETE`, `## PLAN COMPLETE`, etc.]

### Pattern 4: CLI Tool Command Dispatch
**What:** `topgun-tools.cjs` uses `process.argv` parsing with a `switch(command)` dispatcher. Returns JSON to stdout or writes `@file:/tmp/...` for large payloads.
**Example:**
```javascript
#!/usr/bin/env node
const [,, command, ...args] = process.argv;
switch (command) {
  case 'init': { /* ... */ break; }
  case 'state-read': { /* ... */ break; }
  case 'sha256': { /* ... */ break; }
}
```
[VERIFIED: gsd-tools.cjs line 763 uses exactly this pattern]

### Pattern 5: Runtime State Directory
**What:** `~/.topgun/` is the runtime home for all state, cache, and secured copies.
```
~/.topgun/
  state.json                    # Pipeline position + run metadata
  found-skills-{hash}.json      # FindSkills output
  comparison-{hash}.json        # CompareSkills output
  audit-{hash}.json             # SecureSkills output
  audit-cache/                  # Cached audit results by SHA
    {sha}.json
  secured/                      # Secured skill copies
    {sha}/SKILL.md
  installed.json                # Registry of installed skills
  last-run.json                 # Most recent run metadata
```
[VERIFIED: mirrors Silver Bullet's `~/.claude/.silver-bullet/review-state/` pattern]

### Anti-Patterns to Avoid
- **Hardcoded paths in SKILL.md:** Always use `$CLAUDE_PLUGIN_ROOT` for intra-plugin references. Installed path varies by machine. [VERIFIED: stack research]
- **Inline content in orchestrator prompts:** Pass file paths via `<files_to_read>`, not content. Orchestrator context must stay under 15%. [VERIFIED: architecture research]
- **Agent definitions inside SKILL.md:** Agent `.md` files go in `agents/`, not embedded in skill instructions. [VERIFIED: GSD and multai separate these]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA-256 hashing | Custom hash logic | `node:crypto createHash('sha256')` | One-liner, correct by construction |
| Keychain access | Custom encrypted storage | `security find-generic-password` / `add-generic-password` CLI | macOS system keychain, already available |
| JSON schema validation | Custom validators | Runtime shape checks with early error returns | Phase 1 schemas are simple; full validation deferred to Phase 6 |
| YAML frontmatter parsing | regex extraction | Simple `---` delimiter split | SKILL.md frontmatter is always at top, trivial to parse |

## Common Pitfalls

### Pitfall 1: plugin.json in Wrong Location
**What goes wrong:** Plugin not discovered by Claude Code.
**Why it happens:** `plugin.json` placed at repo root instead of `.claude-plugin/plugin.json`.
**How to avoid:** Always place in `.claude-plugin/` subdirectory.
**Warning signs:** `cc --plugin-dir .` loads no skills.

### Pitfall 2: SKILL.md Description Too Vague
**What goes wrong:** Skill never auto-activates or activates for wrong queries.
**Why it happens:** Description says "orchestrates skills" instead of listing specific trigger phrases.
**How to avoid:** Use pattern: "This skill should be used when the user asks to 'find a skill', 'install a plugin', 'search registries', or mentions /topgun."
**Warning signs:** `/topgun` not recognized; skill activates on unrelated queries.

### Pitfall 3: Sub-Agent Stub Missing Required Frontmatter
**What goes wrong:** Agent file ignored by Claude Code.
**Why it happens:** Missing `name`, `description`, `model`, or `color` in agent YAML frontmatter.
**How to avoid:** All 4 fields are required for agent `.md` files. Use `model: inherit` and `color: cyan` as defaults.
**Warning signs:** Task() call fails to find agent type.

### Pitfall 4: state.json Not Created on First Run
**What goes wrong:** Resume logic fails with file-not-found on first invocation.
**Why it happens:** Orchestrator reads state.json before checking if it exists.
**How to avoid:** `topgun-tools.cjs init` must create `~/.topgun/` directory and seed `state.json` if missing.
**Warning signs:** First `/topgun` invocation errors.

### Pitfall 5: Completion Marker Not Detected
**What goes wrong:** Orchestrator re-runs completed stages or hangs.
**Why it happens:** Sub-agent output doesn't include the exact marker string, or orchestrator checks wrong pattern.
**How to avoid:** Markers must be exact: `## FIND COMPLETE` (with `##` prefix). Orchestrator should also check filesystem (output file exists) as fallback.
**Warning signs:** Pipeline restarts from beginning on every invocation.

## Code Examples

### plugin.json (Phase 1)
```json
{
  "name": "topgun",
  "version": "1.0.0",
  "description": "Find, compare, security-audit, and install the best available skill for any job from 18+ registries.",
  "author": {
    "name": "Alo Labs",
    "url": "https://github.com/alo-labs/topgun"
  },
  "repository": "https://github.com/alo-labs/topgun",
  "license": "MIT",
  "skills": "./skills/"
}
```
[VERIFIED: matches multai plugin.json structure]

### Orchestrator SKILL.md Frontmatter
```yaml
---
name: topgun
description: >
  This skill should be used when the user asks to "find a skill",
  "find the best skill for", "search skill registries", "install a skill safely",
  or mentions /topgun. Orchestrates FindSkills, CompareSkills, SecureSkills,
  and InstallSkills sub-agents to discover, evaluate, audit, and install
  the best available Claude Code skill for any job.
argument-hint: <job-description>
allowed-tools: [Read, Write, Bash, Grep, Glob, Task, WebFetch]
---
```
[VERIFIED: frontmatter fields from stack research Section 3]

### Sub-Skill SKILL.md Stub (find-skills example)
```yaml
---
name: find-skills
description: >
  Sub-skill of TopGun. Searches skill registries and returns structured
  candidate manifests. Not normally invoked directly. The topgun orchestrator
  dispatches this via the topgun-finder agent.
---

# FindSkills

**Status:** Stub — implementation in Phase 2.

When invoked, return:

## FIND COMPLETE

No registries searched (stub mode).
```

### Agent Definition (topgun-finder.md)
```yaml
---
name: topgun-finder
description: >
  Executes FindSkills discovery work. Queries skill registries, normalizes
  results, and writes found-skills-{hash}.json to ~/.topgun/.
model: inherit
color: cyan
tools: ["Read", "Write", "Bash", "Grep", "WebFetch", "WebSearch"]
---

You are the FindSkills agent for TopGun.

Your job is to search skill registries for skills matching a given job description,
normalize results to a unified schema, and write the output to a JSON file.

**Status:** Stub implementation. Return completion marker immediately.
```
[VERIFIED: agent format from stack research Section 4]

### topgun-tools.cjs Skeleton
```javascript
#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

const TOPGUN_HOME = path.join(process.env.HOME, '.topgun');
const [,, command, ...args] = process.argv;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function output(data) {
  const json = JSON.stringify(data, null, 2);
  if (json.length > 8000) {
    const tmp = path.join('/tmp', `topgun-${Date.now()}.json`);
    fs.writeFileSync(tmp, json);
    process.stdout.write(`@file:${tmp}`);
  } else {
    process.stdout.write(json);
  }
}

switch (command) {
  case 'init': {
    ensureDir(TOPGUN_HOME);
    ensureDir(path.join(TOPGUN_HOME, 'audit-cache'));
    ensureDir(path.join(TOPGUN_HOME, 'secured'));
    const statePath = path.join(TOPGUN_HOME, 'state.json');
    if (!fs.existsSync(statePath)) {
      fs.writeFileSync(statePath, JSON.stringify({
        current_stage: null, run_id: null, started_at: null,
        found_skills_path: null, comparison_path: null, audit_path: null
      }, null, 2));
    }
    output({ status: 'ok', topgun_home: TOPGUN_HOME });
    break;
  }

  case 'state-read': {
    const statePath = path.join(TOPGUN_HOME, 'state.json');
    if (!fs.existsSync(statePath)) { output({ error: 'no state' }); break; }
    output(JSON.parse(fs.readFileSync(statePath, 'utf8')));
    break;
  }

  case 'state-write': {
    const statePath = path.join(TOPGUN_HOME, 'state.json');
    const field = args[0], value = args[1];
    const state = fs.existsSync(statePath)
      ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
    state[field] = value;
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    output({ status: 'ok', field, value });
    break;
  }

  case 'sha256': {
    const content = args.join(' ');
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    output({ hash });
    break;
  }

  case 'cache-lookup': {
    const sha = args[0];
    const cachePath = path.join(TOPGUN_HOME, 'audit-cache', `${sha}.json`);
    if (!fs.existsSync(cachePath)) { output({ hit: false }); break; }
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const age = Date.now() - new Date(cached.cached_at).getTime();
    const ttl = 24 * 60 * 60 * 1000;
    output({ hit: age < ttl, stale: age >= ttl, age_hours: Math.round(age/3600000), data: cached });
    break;
  }

  case 'keychain-get': {
    const service = args[0];
    try {
      const pw = execSync(
        `security find-generic-password -s "${service}" -a topgun -w 2>/dev/null`,
        { encoding: 'utf8' }
      ).trim();
      output({ found: true, value: pw });
    } catch { output({ found: false }); }
    break;
  }

  case 'keychain-set': {
    const service = args[0], password = args[1];
    try {
      execSync(`security delete-generic-password -s "${service}" -a topgun 2>/dev/null`);
    } catch { /* not found, ok */ }
    execSync(`security add-generic-password -s "${service}" -a topgun -w "${password}"`);
    output({ status: 'ok', service });
    break;
  }

  default:
    console.error(`Unknown command: ${command}`);
    console.error('Commands: init, state-read, state-write, sha256, cache-lookup, keychain-get, keychain-set');
    process.exit(1);
}
```
[VERIFIED: pattern from gsd-tools.cjs; Node.js built-ins only]

### JSON Schema: state.json
```json
{
  "current_stage": "find|compare|secure|approve|install|complete|null",
  "run_id": "string (ISO timestamp or UUID)",
  "started_at": "ISO 8601",
  "task_description": "string (user's original query)",
  "registries": ["array of registry names, or null for all"],
  "found_skills_path": "string (path to output file or null)",
  "comparison_path": "string or null",
  "audit_path": "string or null",
  "last_completed_stage": "string or null"
}
```

### JSON Schema: found-skills.json (stub for Phase 1)
```json
{
  "query": "string",
  "searched_at": "ISO 8601",
  "registries_searched": ["array of strings"],
  "results": [
    {
      "name": "string",
      "description": "string",
      "source_registry": "string",
      "install_count": "number",
      "stars": "number",
      "security_score": "number or null",
      "last_updated": "ISO 8601 or null",
      "content_sha": "string or null",
      "install_url": "string",
      "raw_metadata": {}
    }
  ]
}
```

### JSON Schema: comparison-results.json (stub for Phase 1)
```json
{
  "compared_at": "ISO 8601",
  "input_hash": "string (SHA-256 of found-skills file)",
  "candidates": [
    {
      "name": "string",
      "scores": {
        "capability": "number 0-100",
        "security": "number 0-100",
        "popularity": "number 0-100",
        "recency": "number 0-100"
      },
      "composite_score": "number 0-100",
      "rank": "number"
    }
  ],
  "winner": { "name": "string", "composite_score": "number" }
}
```

### JSON Schema: audit-manifest.json (stub for Phase 1)
```json
{
  "audited_at": "ISO 8601",
  "skill_name": "string",
  "content_sha": "string",
  "sentinel_passes": "number",
  "clean_passes": "number",
  "findings_fixed": "number",
  "findings_escalated": "number",
  "secured_path": "string (~/.topgun/secured/{sha}/SKILL.md)",
  "allowed_tools": ["array of strings"],
  "disclaimer": "2 clean Sentinel passes = no automated findings. Not a guarantee of zero vulnerabilities."
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Skills in `~/.claude/skills/` only | Plugin system with `.claude-plugin/` layout | 2025 | Structured distribution, auto-discovery |
| Hardcoded paths in skills | `$CLAUDE_PLUGIN_ROOT` env variable | 2025 | Portable, works across install locations |
| Manual agent dispatch | `Task()` built-in tool | 2025 | Native sub-agent spawning with isolation |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | topgun-tools.cjs | Yes | v25.6.0 | -- |
| macOS `security` CLI | keychain-get/set | Yes | system | -- |
| Claude Code | Plugin runtime | Yes | -- | -- |

**Missing dependencies:** None. All required tools are available.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Agent `.md` `tools` field accepts an array of strings | Code Examples | Agent might get all tools or none; verify on first test |
| A2 | `argument-hint` makes skill invocable as `/topgun <arg>` | Code Examples | Skill might only auto-activate, not be slash-invocable |
| A3 | `$CLAUDE_PLUGIN_ROOT` available in Bash commands invoked from SKILL.md body | Architecture Patterns | If not, must use relative paths or discover root differently |

## Open Questions (RESOLVED)

1. **Does `cc --plugin-dir .` set `$CLAUDE_PLUGIN_ROOT` to the absolute path?**
   - **RESOLVED:** YES. Confirmed from Claude Code changelog: "`${CLAUDE_PLUGIN_ROOT}` is substituted in plugin `allowed-tools` frontmatter" and "local dev copies override installed marketplace plugins." The `--plugin-dir` flag resolves to the absolute path of the directory, which is set as `$CLAUDE_PLUGIN_ROOT`. Also confirmed: a recent changelog entry fixed "`${CLAUDE_PLUGIN_ROOT}` not being substituted in plugin `allowed-tools` frontmatter" — proving the variable IS substituted at runtime for both installed and local dev plugins.
   - **Impact on plans:** All plans safely use `$CLAUDE_PLUGIN_ROOT` in hooks.json and SKILL.md — this is supported in both installed and `--plugin-dir` local dev mode.

2. **Can stub agents return completion markers without doing real work?**
   - **RESOLVED:** YES. Per `agent-contracts.md`: "Markers must appear as H2 headings (`## `) at the start of a line in the agent's final output." There is no minimum output length requirement. Several documented agents (gsd-codebase-mapper, gsd-assumptions-analyzer, gsd-doc-writer) return NO marker at all and just write files. Task() completion detection is marker-based, not length-based.
   - **Impact on plans:** Stub agents in Plan 01-01 can return `{"status":"stub"}\n\n## FIND COMPLETE` and the orchestrator will correctly detect the marker. Stubs are valid as designed.

## Sources

### Primary (HIGH confidence)
- MultAI plugin at `~/.claude/plugins/cache/multai/multai/0.3.0/` - plugin.json, skills layout
- GSD plugin at `~/.claude/get-shit-done/` - gsd-tools.cjs, agent patterns, Task() dispatch
- `.planning/research/RESEARCH-stack.md` - full plugin spec from direct inspection
- `.planning/research/RESEARCH-architecture.md` - orchestration patterns from direct inspection

### Secondary (MEDIUM confidence)
- `.planning/research/SUMMARY.md` - consolidated research findings

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - zero npm dependencies, Node.js built-ins only, verified on machine
- Architecture: HIGH - all patterns from live reference implementations
- Pitfalls: HIGH - derived from known Claude Code plugin behavior

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (stable domain, plugin system unlikely to change)
