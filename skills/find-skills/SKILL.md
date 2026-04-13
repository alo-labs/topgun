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
default to all registries: `["skills-sh", "agentskill-sh", "smithery", "github", "gitlab", "npm", "lobehub", "osm", "vskill", "skillsmp", "clawhub", "glama", "huggingface", "langchain-hub", "claude-plugins-official", "cursor-directory", "mcp-so", "opentools"]`.

---

## Step 3: Adapter Dispatch

For each enabled registry, execute its adapter by following the corresponding
instruction file at `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/{registry}.md`.

**Concurrency cap: process at most 5 adapters simultaneously (batch of 5).**
With 18 registries, dispatch in 4 batches of 5, 5, 5, 3.

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

| Registry | File | Tier |
|----------|------|------|
| skills.sh | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/skills-sh.md` | 1 |
| agentskill.sh | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/agentskill-sh.md` | 1 — WebFetch primary, CLI fallback |
| Smithery | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/smithery.md` | 1 |
| GitHub | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/github.md` | 1 |
| GitLab | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/gitlab.md` | 1 |
| npm | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/npm.md` | 2 |
| LobeHub | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/lobehub.md` | 2 |
| OSM | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/osm.md` | 2 |
| vSkill | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/vskill.md` | 2 |
| SkillsMP | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/skillsmp.md` | 2 |
| ClawHub | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/clawhub.md` | 2 — skip (no API) |
| Glama.ai | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/glama.md` | 3 — confirmed REST API |
| Hugging Face | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/huggingface.md` | 3 — confirmed REST API |
| LangChain Hub | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/langchain-hub.md` | 3 — confirmed REST API |
| Claude Plugins Official | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/claude-plugins-official.md` | 3 — static manifest |
| Cursor Directory | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/cursor-directory.md` | 3 — GitHub Contents API |
| MCP.so | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/mcp-so.md` | 3 — best-guess, graceful skip |
| OpenTools.ai | `$CLAUDE_PLUGIN_ROOT/skills/find-skills/adapters/opentools.md` | 3 — best-guess, graceful skip |

---

## Step 6: Normalization Orchestration

After all adapter dispatches complete (Step 3) and results are aggregated, the agent must execute the following steps in order before writing any output:

1. **Normalize** all results to the unified schema (10 fields). Reject any result where `name` is missing or empty (log: `Skipped unnamed result from {registry}`). Set missing fields to `null`.
2. **Deduplicate** by identity key = lowercase(`name`) + `|` + `source_registry`. Within the same registry keep the result with the most recent `last_updated`; keep first if tied. Cross-registry duplicates (same name, different registry) are kept — they are needed for CompareSkills comparison. Track `dedup_removed` count.
3. **Compute contentSha** for each result: use registry-provided `contentSha` if present; fetch and SHA-256 if `install_url` points to a raw SKILL.md; reuse computed sha for local results; set `"pending"` otherwise.
4. **Apply structural envelope** to every `raw_metadata` value (NFR-01). See topgun-finder.md Step 6 for the exact envelope format.
5. **Check unavailable count**: if `unavailable_count >= 3`, display a warning to the user listing the unavailable registries and their reasons. Set `unavailable_warning: true` in output.
6. **Write output JSON** to `~/.topgun/found-skills-{hash}.json` with the full schema documented below.

---

## Output Schema

File: `~/.topgun/found-skills-{hash}.json`
Hash: SHA-256 of the original task description

```json
{
  "query": "original task description",
  "query_hash": "sha256 hash",
  "searched_at": "ISO 8601 timestamp",
  "total_elapsed_ms": 0,
  "registries_searched": [
    {
      "registry": "name",
      "status": "ok|unavailable|error",
      "reason": null,
      "latency_ms": 0,
      "result_count": 0
    }
  ],
  "unavailable_count": 0,
  "unavailable_warning": false,
  "dedup_removed": 0,
  "results": [
    {
      "name": "string",
      "description": "string",
      "source_registry": "string",
      "install_count": null,
      "stars": null,
      "security_score": null,
      "last_updated": "ISO 8601 or null",
      "content_sha": "string",
      "install_url": "string or null",
      "raw_metadata": {}
    }
  ],
  "total_results": 0
}
```

This schema is the contract for CompareSkills (Phase 3).

---

## Step 7: Completion Marker

After writing the output file, output exactly:

```
## FIND COMPLETE

Found {total_results} skills from {registries_count} registries ({unavailable_count} unavailable).
Results: ~/.topgun/found-skills-{hash}.json
```

Where:
- `{total_results}` = total count of result objects after deduplication
- `{registries_count}` = total number of registries searched (local + external)
- `{unavailable_count}` = number of registries with unavailable/error status
- `{hash}` = the query hash
