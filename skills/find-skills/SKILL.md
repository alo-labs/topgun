---
name: find-skills
description: >
  Sub-skill of TopGun. Searches skill registries and returns structured
  candidate manifests. Not normally invoked directly. The topgun orchestrator
  dispatches this via the topgun-finder agent.
---

# FindSkills Orchestration

This skill defines how the `topgun-finder` agent searches for skills across local
installations and external registries. Follow all steps in order.

---

## Step 1: Local Search (REQ-02)

Search locally installed skills **before** querying any external registry.

1. Use Glob to find all SKILL.md files under `~/.claude/skills/`:
   - Pattern: `~/.claude/skills/*/SKILL.md`
2. Use Glob to find all SKILL.md files under `~/.claude/plugins/`:
   - Pattern: `~/.claude/plugins/*/skills/*/SKILL.md`
3. For each file found, Read it and check whether the `name` or `description`
   fields semantically match the query. Simple substring or keyword match is
   sufficient.
4. For each match, compute a `content_sha`:
   ```bash
   node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" sha256 "<SKILL.md file contents>"
   ```
5. Add each match to results using the unified schema with `source_registry: "local"`.

---

## Step 2: Parse Registries Filter

Read `registries` from `~/.topgun/state.json`. If the field is absent or empty,
default to all registries: `["skills-sh", "agentskill-sh", "smithery", "github", "gitlab"]`.

---

## Step 3: Adapter Dispatch

For each enabled registry, execute its adapter by following the corresponding
instruction file at `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/{registry}.md`.

**Concurrency cap: process at most 5 adapters simultaneously (batch of 5).**
Since there are exactly 5 Tier-1 registries, all 5 may run in the same batch.

Each adapter must return the following contract object:

```json
{
  "registry": "string",
  "status": "ok" | "unavailable" | "error",
  "reason": "string or null",
  "results": [],
  "latency_ms": 0
}
```

---

## Step 4: Timeout + Retry Contract (REQ-05)

Apply these rules to **every** WebFetch or Bash call made by an adapter:

- **Timeout:** 8 seconds maximum per call.
- **HTTP 429 (rate limit):** Exponential backoff — wait 1s, retry; wait 2s, retry;
  wait 4s, retry. After 3 retries mark `status: "unavailable"`, reason: "rate limited".
- **Timeout / HTTP 5xx:** Mark `status: "unavailable"`, log the reason, continue to
  next registry without stalling. Do NOT throw or abort the overall search.
- **Record `latency_ms`** from start to finish for each adapter call.

---

## Step 5: Unified Result Schema

Every result object — from any registry, including local — must conform to:

```json
{
  "name": "string",
  "description": "string",
  "install_url": "string or null",
  "stars": "number or null",
  "last_updated": "ISO string or null",
  "content_sha": "string or null",
  "source_registry": "string",
  "raw_metadata": {}
}
```

`raw_metadata` **must** be wrapped with the structural envelope (NFR-01) before
being placed in context. See topgun-finder.md for the envelope format.

---

## Adapter Instruction Files

| Registry | File |
|----------|------|
| skills.sh | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/skills-sh.md` |
| agentskill.sh | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/agentskill-sh.md` |
| Smithery | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/smithery.md` |
| GitHub | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/github.md` |
| GitLab | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/gitlab.md` |
