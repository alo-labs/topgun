# Architecture Research: TopGun Plugin

**Dimension:** Architecture
**Researched:** 2026-04-13
**Confidence:** HIGH — all findings drawn from direct inspection of live reference implementations

---

## Research Sources

All findings below are directly observed from:

- `~/.claude/get-shit-done/` — GSD plugin (workflows, agent definitions, references)
- `~/.claude/plugins/cache/multai/multai/0.3.0/` — MultAI plugin (multi-skill orchestrator)
- `~/.claude/plugins/cache/superpowers-marketplace/superpowers/5.0.5/` — Superpowers plugin
- `~/.claude/agents/` — registered agent definitions
- `~/.claude/skills/` — installed skills (extensibility, find-skills, gsd-execute-phase, etc.)

Confidence levels reflect whether a pattern was observed in multiple independent sources.

---

## Q1: How do Claude Code plugins structure multi-agent orchestration?

**Finding: The orchestrator-as-coordinator pattern is universal.**

Every multi-agent plugin observed follows the same structural separation:

- The **main skill** (orchestrator) is a thin coordinator. It: loads context via a CLI tool or init script, describes what it is about to do, then dispatches sub-agents using `Task()`. It does not execute business logic itself.
- **Sub-agents** do all heavy lifting. They each receive a precise prompt constructed by the orchestrator, read their own context from disk via `<files_to_read>` blocks, and return a structured completion marker.

The GSD `execute-phase.md` workflow states this explicitly:

> "Orchestrator coordinates, not executes. Each subagent loads the full execute-plan context. Orchestrator: discover plans → analyze deps → group waves → spawn agents → handle checkpoints → collect results."

**The `Task()` call signature** observed across GSD and Superpowers:

```
Task(
  subagent_type="<agent-type-name>",   # resolves to ~/.claude/agents/<name>.md
  description="<short human label>",
  model="{resolved_model_var}",
  isolation="worktree",                # optional: gives agent an isolated git worktree
  run_in_background: true,             # optional: for fire-and-wait parallelism
  prompt="<constructed prompt string>"
)
```

`subagent_type` auto-loads the agent definition file — the orchestrator never reads agent `.md` files itself (context budget rule).

**MultAI's pattern for sequential specialist routing** is slightly different: the main `orchestrator` skill detects intent (via keyword matching), then delegates entirely to a specialist skill by calling it inline as a function, not as a `Task()`. This is a "soft routing" pattern appropriate when the orchestrator and specialist share the same execution context.

**The TopGun pattern** (FindSkills → CompareSkills → SecureSkills → InstallSkills) maps to GSD's sequential wave execution model, where Wave N must complete before Wave N+1 begins.

---

## Q2: How to pass state/context between sequential sub-agents?

**Finding: Filesystem is the canonical inter-agent communication bus.**

There is no in-memory state passing between agents. Each agent writes its output to a known file path, and the next agent reads that file. The orchestrator's prompt construction is the handoff mechanism.

**Pattern observed in GSD (researcher → planner → executor chain):**

1. `gsd-phase-researcher` writes `RESEARCH.md` to the phase directory
2. `gsd-planner` is spawned with `<files_to_read>` that includes `RESEARCH.md` — it reads it fresh from disk
3. `gsd-executor` is spawned with `<files_to_read>` listing plan files + prior wave SUMMARY.md files

The orchestrator passes *file paths*, not file content:

```
<files_to_read>
Read these files at execution start using the Read tool:
- {phase_dir}/{plan_file}
- .planning/PROJECT.md
- .planning/STATE.md
- {phase_dir}/*-RESEARCH.md
- {prior_wave_summaries}
</files_to_read>
```

**Why file paths over inline content:** Inline content inflates orchestrator context. Agents have fresh 200k–1M token windows; they can afford to read full files. The orchestrator's context must stay under ~15%.

**For TopGun's sequential pipeline the recommended pattern is:**

- FindSkills writes `~/.claude/topgun/found-skills.json` after completion
- CompareSkills reads `found-skills.json`, writes `~/.claude/topgun/comparison-results.json`
- SecureSkills reads `comparison-results.json`, writes `~/.claude/topgun/audit-manifest.json`
- InstallSkills reads `audit-manifest.json` and performs installations

The orchestrator's prompt for each stage should include:

```
<files_to_read>
- ~/.claude/topgun/found-skills.json   (output from FindSkills)
</files_to_read>
```

**State file for run continuity:** GSD uses a `STATE.md` file with YAML frontmatter to track pipeline position, last activity, and stopped-at information. For TopGun, a lightweight `~/.claude/topgun/run-state.json` should track: `{ current_stage, run_id, started_at, found_skills_path, comparison_path, audit_path }`.

**Completion markers:** Every GSD agent ends its response with a structured marker like `## RESEARCH COMPLETE` or `## PLAN COMPLETE`. The orchestrator matches this marker to confirm success before proceeding to the next stage. TopGun sub-agents should do the same:

- FindSkills ends with: `## FIND COMPLETE`
- CompareSkills ends with: `## COMPARE COMPLETE`
- SecureSkills ends with: `## SECURE COMPLETE`
- InstallSkills ends with: `## INSTALL COMPLETE`

---

## Q3: How to cache results between invocations — file-based? JSON?

**Finding: JSON files with known paths, written atomically, read via the Read tool.**

GSD uses several caching strategies observed directly:

**1. CLI tool output caching (`gsd-tools.cjs`):**
The `init` command returns a JSON blob with all context needed for the workflow. It caches computed values (model selection, project state, plan inventory) so each invocation is fast. The output is either an inline JSON string or `@file:/tmp/...` path reference if the payload is large.

**2. Config as persistent state (`config.json`):**
`.planning/config.json` stores settings that survive across sessions: model profiles, workflow flags, feature toggles. Read once at startup, never re-read unless config changes.

**3. SUMMARY.md frontmatter as execution cache:**
Each executed plan writes a `SUMMARY.md` with YAML frontmatter. The orchestrator checks `has_summary: true` in the plan index to skip already-complete plans on re-run. This is the "already done" detection mechanism.

**4. Silver Bullet's review state:**
From Silver Bullet's STATE.md decisions: *"Reviewer state stored as JSON keyed by 8-char SHA256 of artifact absolute path in `~/.claude/.silver-bullet/review-state/`"* — this is the exact pattern TopGun should follow for caching audit results between invocations.

**Recommended cache structure for TopGun:**

```
~/.claude/topgun/
  cache/
    skills-manifest-{hash}.json    # found skills, keyed by registry query hash
    comparison-{hash}.json          # comparison results, keyed by skills hash
    audit-{hash}.json               # security audit, keyed by comparison hash  
    last-run.json                   # most recent run metadata
  state.json                        # current pipeline position
```

**Invalidation strategy:** Hash the inputs. If the registry query or skill set hasn't changed since last run, reuse the cached result. FindSkills hashes the query parameters; each downstream stage hashes its input file. If the hash matches the cached file, skip that stage and read from cache.

**JSON, not markdown, for machine-readable data.** Markdown (SUMMARY.md, RESEARCH.md) is for human-readable summaries consumed by agents in `<files_to_read>`. JSON is for structured data consumed programmatically by the orchestrator or CLI tool.

---

## Q4: Recommended structure for a plugin with main + 4 sub-skills?

**Finding: One SKILL.md per skill, one agent definition per sub-agent, flat skills/ directory.**

From direct inspection of MultAI (1 orchestrator + 5 specialist skills) and GSD (1 main + 14+ sub-agents):

**Plugin directory layout:**

```
topgun/                          # plugin root
  .claude-plugin/
    plugin.json                  # name, version, author, "skills": "./skills/"
  skills/
    topgun/                      # main orchestrator skill (entry point)
      SKILL.md
    find-skills/                 # sub-skill 1
      SKILL.md
    compare-skills/              # sub-skill 2
      SKILL.md
    secure-skills/               # sub-skill 3
      SKILL.md
    install-skills/              # sub-skill 4
      SKILL.md
  agents/                        # agent definitions (for Task() sub-agent types)
    topgun-finder.md
    topgun-comparator.md
    topgun-securer.md
    topgun-installer.md
  bin/
    topgun-tools.cjs             # CLI helper for init, cache, state management
  cache/                         # runtime cache directory
    .gitkeep
```

**SKILL.md frontmatter for the main skill:**

```yaml
---
name: topgun
description: >
  Main orchestrator. Runs FindSkills → CompareSkills → SecureSkills → InstallSkills
  to discover, evaluate, audit, and install Claude Code skills from the registry.
  Use when the user wants to find and install new skills safely.
---
```

**SKILL.md frontmatter for sub-skills:**

```yaml
---
name: find-skills
description: >
  Sub-skill of TopGun. Searches the skills registry and returns a structured manifest
  of candidates. Not normally invoked directly — the topgun orchestrator calls it.
  Can be invoked standalone for discovery without installation.
---
```

**Agent definition files** (in `agents/`) follow the pattern from `~/.claude/agents/gsd-executor.md`:

```yaml
---
name: topgun-finder
description: Executes FindSkills sub-agent work. Queries registry, scores candidates, writes found-skills.json.
model: sonnet
tools: Read, Write, Bash, WebSearch
color: cyan
---
```

**plugin.json minimum viable structure** (from multai reference):

```json
{
  "name": "topgun",
  "version": "1.0.0",
  "description": "Discovers, compares, audits and installs Claude Code skills safely.",
  "skills": "./skills/"
}
```

---

## Q5: How do existing multi-skill plugins organize directory structure?

**Finding: Two patterns observed — flat skills with routing vs. skills-as-phases with a CLI tool.**

**MultAI pattern (routing-based):**

```
multai/
  skills/
    orchestrator/      # main entry point — routes to specialists
      SKILL.md
      engine/          # Python runtime for this skill
    landscape-researcher/
      SKILL.md
    solution-researcher/
      SKILL.md
    comparator/
      SKILL.md
    consolidator/
      SKILL.md
  .claude-plugin/
    plugin.json
```

Each specialist skill is self-contained: it knows how to get input, do its work, and produce output. The orchestrator routes to them by invoking them inline (not via Task()). Skills call back to shared sub-systems (the engine) via filesystem paths, not imports.

**GSD pattern (pipeline-based with external CLI):**

```
get-shit-done/
  workflows/           # skill implementations (Markdown instructions)
  agents/              # agent definitions for Task() dispatch
  bin/
    gsd-tools.cjs      # CLI tool for init, state, caching, config
  references/          # shared context files
  templates/           # output file templates
```

Skills (called "workflows" in GSD) are markdown instruction files. Agents are registered separately in `~/.claude/agents/`. The CLI tool (`gsd-tools.cjs`) handles all stateful operations: computing init context, reading config, writing state, managing cache.

**Key structural decisions to make for TopGun:**

1. **Does each sub-skill need its own Python/Node runtime?** MultAI's `orchestrator/engine/` pattern shows how to bundle a compiled runtime inside a skill. TopGun likely does not need this — pure markdown instructions with Bash for registry queries is sufficient.

2. **Does the CLI tool live in the plugin or as a shared dependency?** GSD's `gsd-tools.cjs` lives inside the plugin. This is the right choice for TopGun — `topgun-tools.cjs` handles cache lookup, state writes, and registry calls.

3. **Are agent definitions inside the plugin or in `~/.claude/agents/`?** GSD registers agents globally in `~/.claude/agents/`. For a distributable plugin, agents should live in the plugin's own `agents/` directory and be registered on install.

---

## Q6: Patterns for graceful degradation when registry is unreachable?

**Finding: Fallback chains, status codes, and cached data are the three levers.**

From MultAI's failure handling (directly observed):

**1. Status codes per dependency:** MultAI tracks per-platform status as `complete | partial | failed | timeout | rate_limited | needs_login`. The orchestrator reads `status.json` after each run and routes based on status — it does not treat all failures the same.

**2. Automatic retry with countdown:** For `needs_login` status, MultAI waits 90 seconds, tells the user to authenticate, then retries. For `failed` status with API key available, it retries with a browser-use fallback agent.

**3. Cache-first reads:** GSD's orchestrator checks `has_summary: true` before spawning executors. If a plan already has a summary, it is skipped. This means a partially-completed pipeline can be re-run safely — completed stages are not re-executed.

**4. Explicit fallback routing from GSD execute-phase:**

> "If a spawned agent completes its work (commits visible, SUMMARY.md exists) but the orchestrator never receives the completion signal, treat it as successful based on spot-checks and continue. Never block indefinitely waiting for a signal — always verify via filesystem and git state."

This is the "filesystem as truth" fallback: if the output artifact exists on disk, the stage succeeded regardless of whether the completion signal arrived.

**Recommended degradation strategy for TopGun:**

| Stage | Registry Unreachable | Degraded Behavior |
|-------|----------------------|-------------------|
| FindSkills | Cannot reach registry | Check cache for recent manifest (< 24h); if found, use it with staleness warning; if not, exit with `FIND BLOCKED` |
| CompareSkills | No found-skills.json | Cannot proceed; surface `COMPARE BLOCKED` with instructions to re-run FindSkills |
| SecureSkills | Audit API unreachable | Check cache for prior audit of same skill set; if found, present with timestamp; if not, offer `--skip-security` flag with explicit user consent gate |
| InstallSkills | `npx skills add` fails | Detect exit code, surface error verbatim, offer retry or manual install command |

**The `--offline` flag pattern:** GSD's `gsd-tools.cjs` checks config flags before any network call. TopGun should support `--offline` flag in the main skill to force cache-only operation, skipping all registry calls. This is useful in CI or air-gapped environments.

**Rate limiting:** MultAI's rate-limit state persistence (`~/.chrome-playwright/rate-limit-state.json`) is a direct model for TopGun's registry throttle tracking. If `npx skills find` is rate-limited, cache the 429 timestamp and surface a "try again in X minutes" message rather than a generic failure.

---

## Architecture Summary for TopGun

### Recommended Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `topgun` skill | Orchestrator — reads config, dispatches sub-agents sequentially, handles errors | Reads: config.json, state.json. Dispatches: Task() for each sub-agent |
| `topgun-finder` agent | Queries skills registry, scores results, writes found-skills.json | Reads: query params from prompt. Writes: cache/found-skills-{hash}.json |
| `topgun-comparator` agent | Evaluates and ranks skill candidates, writes comparison-results.json | Reads: found-skills.json. Writes: cache/comparison-{hash}.json |
| `topgun-securer` agent | Audits top candidates for security, writes audit-manifest.json | Reads: comparison-results.json. Writes: cache/audit-{hash}.json |
| `topgun-installer` agent | Executes `npx skills add` for approved skills, reports results | Reads: audit-manifest.json. Writes: state.json (post-install status) |
| `topgun-tools.cjs` | CLI helper — cache lookup, state management, config, hash computation | Used by: orchestrator skill and sub-agents via Bash |

### Data Flow

```
User invokes /topgun
  ↓
Orchestrator reads ~/.claude/topgun/state.json (resume check)
  ↓
Task(topgun-finder) → writes found-skills-{hash}.json
  ↓ (orchestrator reads completion marker, reads file path from response)
Task(topgun-comparator) → reads found-skills-{hash}.json, writes comparison-{hash}.json
  ↓
Task(topgun-securer) → reads comparison-{hash}.json, writes audit-{hash}.json
  ↓
[User approval gate — orchestrator presents audit results, waits for confirmation]
  ↓
Task(topgun-installer) → reads audit-{hash}.json, installs, writes last-run.json
  ↓
Orchestrator reports ## TOPGUN COMPLETE
```

### Critical Design Rules (from reference implementations)

1. **Orchestrator context budget stays under 15%.** Never inline large file contents into sub-agent prompts. Pass file paths. Sub-agents read with their own fresh context windows.

2. **Filesystem is ground truth.** If a sub-agent's output file exists and is valid JSON, that stage succeeded — regardless of whether Task() returned a clean completion signal. Always check filesystem before re-running a stage.

3. **Agent definitions are separate from skill instructions.** SKILL.md contains the orchestrator's instructions for invoking a workflow. Agent `*.md` files in `agents/` contain what the sub-agent itself does. These are different files, different roles.

4. **Completion markers are the handoff contract.** Each agent's final output must contain a known marker (`## FIND COMPLETE`, etc.). The orchestrator matches this marker before proceeding. Without this, partial outputs get treated as successes.

5. **Cache invalidation via input hashing.** Don't rely on mtime or manual cache clearing. Hash the inputs (query string, found-skills list, comparison result) to generate cache keys. On re-invocation, compute hash first; if cache hit, skip the stage.

6. **User approval gate before installation.** SecureSkills produces the audit manifest; the orchestrator presents it to the user before spawning InstallSkills. This matches GSD's checkpoint protocol and MultAI's "data-sharing notice" pattern — the user must explicitly consent before a destructive action.

---

## Confidence Assessment

| Finding | Confidence | Source |
|---------|------------|--------|
| Task() call structure | HIGH | Directly observed in gsd-executor.md, execute-phase.md |
| Filesystem as inter-agent bus | HIGH | Observed across GSD, MultAI, Superpowers |
| files_to_read pattern | HIGH | Directly quoted from execute-phase.md agent prompts |
| Completion marker contracts | HIGH | agent-contracts.md reference doc, directly read |
| JSON cache with hash keys | HIGH | Silver Bullet review-state decision, gsd-tools patterns |
| plugin.json structure | HIGH | Directly read from multai plugin.json |
| Skills directory layout | HIGH | Directly observed in multai and superpowers |
| Degradation via status codes | HIGH | MultAI status.json pattern, directly observed |
| Context budget rules | HIGH | Directly quoted from context-budget.md reference |
