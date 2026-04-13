# Stack Research: TopGun — Claude Code Plugin

**Project:** TopGun  
**Researched:** 2026-04-13  
**Source:** Direct inspection of installed plugins at `~/.claude/plugins/cache/` and `~/.claude/plugins/marketplaces/`  
**Confidence:** HIGH — all findings from production installed plugins on this machine

---

## 1. Plugin Directory Structure

The canonical layout, confirmed from `anthropics/claude-plugins-official` `example-plugin` and `plugin-dev`:

```
top-gun/
├── .claude-plugin/
│   └── plugin.json          # REQUIRED — plugin manifest
├── commands/                # Slash commands (.md files) — auto-discovered
├── agents/                  # Subagent definitions (.md files) — auto-discovered
├── skills/                  # Skills — each in a subdirectory
│   ├── find-skills/
│   │   └── SKILL.md
│   ├── compare-skills/
│   │   └── SKILL.md
│   ├── secure-skills/
│   │   └── SKILL.md
│   └── install-skills/
│       └── SKILL.md
├── hooks/
│   └── hooks.json           # Event handler config
├── .mcp.json                # Optional MCP server definitions
└── scripts/                 # Shared helper scripts
```

**Critical rules:**
- `.claude-plugin/` must be at plugin root. `plugin.json` goes inside it.
- `commands/`, `agents/`, `skills/` must be at plugin root — NOT inside `.claude-plugin/`.
- Each skill lives in its own subdirectory under `skills/`. The file must be named `SKILL.md` exactly.
- Auto-discovery: Claude Code scans `commands/*.md`, `agents/*.md`, and `skills/*/SKILL.md` automatically.
- No restart required after changes — takes effect on next Claude Code session.

---

## 2. plugin.json — Manifest Format

Location: `.claude-plugin/plugin.json`

### Minimum valid manifest

```json
{
  "name": "top-gun"
}
```

### Full recommended manifest (from real production plugins)

```json
{
  "name": "top-gun",
  "version": "1.0.0",
  "description": "Orchestrates 4 sub-agents to find, compare, security-audit, and install the best available skill for a given job, searching 18+ global skill registries.",
  "author": {
    "name": "Your Name",
    "url": "https://github.com/your-org/top-gun"
  },
  "homepage": "https://github.com/your-org/top-gun",
  "repository": "https://github.com/your-org/top-gun",
  "license": "MIT",
  "keywords": ["skills", "orchestration", "registry", "install", "security"],
  "skills": "./skills/",
  "hooks": "./hooks/hooks.json"
}
```

### Optional component path overrides (from `plugin-structure` skill docs)

```json
{
  "name": "top-gun",
  "commands": "./custom-commands",
  "agents": ["./agents", "./specialized-agents"],
  "hooks": "./config/hooks.json",
  "mcpServers": "./.mcp.json"
}
```

Custom paths **supplement** defaults, not replace. Both default and custom-path components load.

**Name rules:** kebab-case, lowercase, no spaces/underscores, must be unique across installed plugins.  
**Version:** semver (MAJOR.MINOR.PATCH).

---

## 3. SKILL.md Specification

### Required frontmatter fields

```yaml
---
name: skill-name
description: >
  This skill should be used when the user asks to "specific phrase 1",
  "specific phrase 2", or mentions [keyword]. Detailed trigger conditions.
---
```

Only `name` and `description` are required. Everything else is optional.

### Full frontmatter (all known fields)

```yaml
---
name: find-skills                    # required — kebab-case identifier
description: >                       # required — trigger conditions for auto-activation
  This skill should be used when the user asks to "find skills", "search
  registries", or wants to discover installable capabilities.
version: 1.0.0                       # optional — semver
license: MIT                         # optional
argument-hint: <job-description>     # optional — shown in /help for user-invoked skills
allowed-tools: [Read, Bash, Grep]    # optional — pre-approve tools, reduces prompts
model: inherit                       # optional — inherit/sonnet/opus/haiku
---
```

### Body guidelines (from `skill-development` skill)

- **Write in imperative/infinitive form** — verb-first, not second person. "To do X, run Y" not "You should do X".
- **Description field uses third person** — "This skill should be used when the user asks to..."
- **Target 1,500–2,000 words** for body. Hard cap 5,000 words.
- **Progressive disclosure**: put detailed content in `references/`, scripts in `scripts/`, templates in `assets/`.

### Skill subdirectory optional structure

```
skills/find-skills/
├── SKILL.md                  # required — core instructions (~1,500 words)
├── references/               # optional — detailed docs, loaded as needed
│   └── registry-list.md
├── examples/                 # optional — working examples
│   └── search-example.sh
├── assets/                   # optional — files used in output (not loaded into context)
│   └── report-template.md
└── scripts/                  # optional — helper scripts (executed without reading into context)
    └── search-registries.sh
```

**Three loading levels (progressive disclosure):**
1. Metadata (`name` + `description`) — always in context (~100 words)
2. `SKILL.md` body — loaded when skill triggers (<5,000 words)
3. Bundled resources — loaded as needed by Claude, or executed without reading

### Auto-activation mechanism

Claude Code reads the `description` field and activates the skill when the user's request matches the described trigger conditions. This is semantic matching, not keyword matching. The description must include specific phrases users would actually say.

**Good description pattern (from official `plugin-dev` plugin):**
```yaml
description: This skill should be used when the user asks to "create a hook",
  "add a PreToolUse hook", "validate tool use", "implement prompt-based hooks",
  or mentions hook events (PreToolUse, PostToolUse, Stop).
```

**Bad description patterns:**
```yaml
description: Provides hook guidance.           # No trigger phrases
description: Use this skill when hooks needed. # Not third person
```

---

## 4. Agent Definitions (Sub-Agent Format)

Agents live in `agents/` directory as `.md` files. All files are auto-discovered.

### Full agent frontmatter

```yaml
---
name: find-skills-agent
description: Use this agent when the user needs to search skill registries or
  discover available plugins. Examples:

  <example>
  Context: User wants to find tools for a specific job
  user: "Find me the best skill for writing TypeScript tests"
  assistant: "I'll search the skill registries for TypeScript testing skills."
  <commentary>
  User explicitly wants to find/discover a skill — trigger find-skills-agent.
  </commentary>
  </example>

  <example>
  Context: Orchestrator routes a search subtask
  user: "Search npm, GitHub, and skills.sh for security audit skills"
  assistant: "Running parallel search across all 18 registries."
  <commentary>
  Search subtask delegated from orchestrator — this agent owns discovery.
  </commentary>
  </example>

model: inherit
color: blue
tools: ["Read", "Bash", "Grep", "WebSearch"]
---

You are a skill discovery agent specializing in searching 18+ global skill registries...
```

### Frontmatter field reference

| Field | Required | Values | Notes |
|-------|----------|--------|-------|
| `name` | Yes | kebab-case, 3-50 chars | Lowercase, alphanumeric + hyphens only |
| `description` | Yes | Text + `<example>` blocks | Most critical field — drives triggering |
| `model` | Yes | `inherit`, `sonnet`, `opus`, `haiku` | Use `inherit` unless specific need |
| `color` | Yes | `blue`, `cyan`, `green`, `yellow`, `magenta`, `red` | Visual ID in UI |
| `tools` | No | Array of tool names | Omit = all tools. Use least-privilege |

### Model values

- `inherit` — same model as parent Claude (recommended default)
- `sonnet` — Claude Sonnet (balanced cost/capability)
- `opus` — Claude Opus (most capable, expensive)
- `haiku` — Claude Haiku (fast, cheap)

### Agent system prompt (body)

The markdown body becomes the agent's system prompt. Write in **second person** ("You are..."), unlike SKILL.md which uses imperative form.

```markdown
You are a skill-discovery agent specializing in exhaustive registry search.

**Your Core Responsibilities:**
1. Search all 18 configured registries in parallel
2. Deduplicate results by package identity
3. Score each skill by install count, stars, recency, and source reputation

**Analysis Process:**
1. Receive a job description from the orchestrator
2. Derive search terms from the job description
3. Run parallel searches across all registries
4. Return ranked results with metadata

**Output Format:**
Return a JSON array: [{ "name", "source", "installs", "url", "score" }]
```

### Tool list (known valid values)

`Read`, `Write`, `Edit`, `MultiEdit`, `Bash`, `Grep`, `Glob`, `WebSearch`, `WebFetch`, `Task`, `Agent`

---

## 5. Distribution / Publishing

### Self-hosted GitHub marketplace (current standard)

A "marketplace" is a GitHub repo containing a `.claude-plugin/marketplace.json` at root.

**Marketplace repo structure:**
```
your-org/top-gun/
├── .claude-plugin/
│   ├── marketplace.json     # marketplace definition
│   └── plugin.json          # plugin definition  
├── skills/
│   └── ...
└── README.md
```

**`.claude-plugin/marketplace.json` format:**
```json
{
  "name": "top-gun",
  "owner": {
    "name": "Your Org",
    "email": "you@example.com"
  },
  "metadata": {
    "description": "TopGun skill registry orchestrator",
    "version": "1.0.0"
  },
  "plugins": [
    {
      "name": "top-gun",
      "source": {
        "source": "url",
        "url": "https://github.com/your-org/top-gun.git"
      },
      "description": "Find, compare, secure-audit, and install the best available skill for any job.",
      "version": "1.0.0",
      "author": {
        "name": "Your Org",
        "url": "https://github.com/your-org"
      },
      "license": "MIT",
      "keywords": ["skills", "registry", "orchestration", "security"]
    }
  ]
}
```

A marketplace can list multiple plugins (see `superpowers-marketplace` which lists 7+ plugins in one repo).

### User installation flow

**Register marketplace (one-time):**
```
/plugin add-marketplace your-org/top-gun
```

This adds to `~/.claude/settings.json`:
```json
"extraKnownMarketplaces": {
  "top-gun": {
    "source": {
      "source": "github",
      "repo": "your-org/top-gun"
    },
    "autoUpdate": true
  }
}
```

**Install plugin from marketplace:**
```
/plugin install top-gun@top-gun
```

Or directly from URL:
```
/plugin install https://github.com/your-org/top-gun
```

### Install locations

Plugins install to: `~/.claude/plugins/cache/{marketplace}/{plugin-name}/{version}/`

Example: `~/.claude/plugins/cache/top-gun/top-gun/1.0.0/`

The plugin root becomes `$CLAUDE_PLUGIN_ROOT` at runtime.

### `$CLAUDE_PLUGIN_ROOT` environment variable

Available in all hooks and scripts at runtime. Always use it for intra-plugin path references:

```json
{
  "command": "bash ${CLAUDE_PLUGIN_ROOT}/scripts/search-registries.sh"
}
```

Never use hardcoded paths.

### Local development testing

```bash
# Test plugin locally without publishing
cc --plugin-dir /path/to/top-gun

# Or install from local path
/plugin install /path/to/top-gun
```

### autoUpdate

Set `"autoUpdate": true` in the marketplace entry in `settings.json` for automatic updates on session start (see `multai` and `silver-bullet` in the machine's settings).

---

## 6. Hooks System

Location: `hooks/hooks.json` at plugin root (or inline in `plugin.json` via `"hooks": "./hooks/hooks.json"`).

### hooks.json format

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/on-session-start.sh",
            "async": false
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/validate.js",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

### Available hook events

`SessionStart`, `SessionEnd`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`, `UserPromptSubmit`, `PreCompact`, `Notification`

### One-time setup pattern

The `sidekick` plugin uses this pattern for one-time bootstrap on first install:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "test -f \"${CLAUDE_PLUGIN_ROOT}/.installed\" || (bash \"${CLAUDE_PLUGIN_ROOT}/install.sh\" && touch \"${CLAUDE_PLUGIN_ROOT}/.installed\")"
          }
        ]
      }
    ]
  }
}
```

This is the right pattern for TopGun if it needs to bootstrap any dependencies at install time.

---

## 7. Scripting Inside Skills

SKILL.md can reference and execute any script the host machine supports. Real-world examples from installed plugins:

### Bash

```bash
python3 - <<'EOF'
import sys, shutil
# detect platform
print(sys.platform)
EOF
```

```bash
ls skills/orchestrator/engine/.venv/bin/python 2>/dev/null && echo "venv OK" || echo "venv MISSING"
```

### Python

Real multai plugin uses Python scripts for its engine:
```bash
python3 skills/orchestrator/engine/orchestrator.py \
    --prompt-file /tmp/prompt.md \
    --mode REGULAR \
    --task-name "TopGun Search"
```

Python virtual environments work inside skill dirs:
- `skills/orchestrator/engine/.venv/` — a `.venv` inside a skill subdir is valid and functional

### Node.js

```bash
npx skills find typescript-testing
npx skills add vercel-labs/agent-skills@react -g -y
```

### All tools available to Claude Code

Skills can use the full Claude Code tool suite: `Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob`, `WebSearch`, `WebFetch`, `Task`, `Agent`. The tool list in agent frontmatter (`tools:`) restricts which tools that specific agent can call.

### MCP tools

Skills can invoke MCP tools if configured in `.mcp.json`. Example from `context7-plugin`:
```markdown
Call `resolve-library-id` with libraryName: "[library]"
Call `query-docs` with libraryId: [resolved ID]
```

---

## 8. The `npx skills` Ecosystem (Alternative to Claude Code Plugin System)

There is a parallel ecosystem at **https://skills.sh** using `npx skills` CLI. This is different from Claude Code's `/plugin` system.

| Feature | `npx skills` (skills.sh) | `/plugin` (Claude Code) |
|---------|--------------------------|------------------------|
| Install command | `npx skills add owner/repo@skill` | `/plugin install plugin@marketplace` |
| Registry | skills.sh, GitHub | GitHub repos as marketplaces |
| Format | `SKILL.md` in `.claude/skills/` | `SKILL.md` in plugin `skills/` dir |
| Scope | `~/.claude/skills/` (global) or `.claude/skills/` (project) | `~/.claude/plugins/cache/` |
| Distribution | npm package or GitHub | GitHub repo |

The file format (SKILL.md with YAML frontmatter) is shared. A skill written for one system works in the other because Claude Code loads from both locations.

**TopGun should support both installation paths** — publish to GitHub as a Claude Code plugin (for `/plugin install`) AND list on skills.sh (for `npx skills add`).

---

## 9. Recommended TopGun Plugin Structure

Based on all research, the concrete file layout for TopGun:

```
top-gun/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── skills/
│   ├── orchestrate-skills/        # Entry point — routes to sub-agents
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── registry-list.md   # All 18 registries documented
│   ├── find-skills/               # FindSkills sub-agent skill
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       └── search-all.sh
│   ├── compare-skills/            # CompareSkills sub-agent skill
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── scoring-rubric.md
│   ├── secure-skills/             # SecureSkills sub-agent skill
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── security-checks.md
│   └── install-skills/            # InstallSkills sub-agent skill
│       ├── SKILL.md
│       └── scripts/
│           └── install.sh
├── agents/
│   ├── find-skills-agent.md       # Sub-agent for registry search
│   ├── compare-skills-agent.md    # Sub-agent for comparison/scoring
│   ├── secure-skills-agent.md     # Sub-agent for security audit
│   └── install-skills-agent.md    # Sub-agent for installation
├── hooks/
│   └── hooks.json
└── README.md
```

### Orchestration pattern (from multai)

The `orchestrate-skills` skill (entry SKILL.md) is the PRIMARY ENTRY POINT. It:
1. Receives the user's job description
2. Announces routing decision
3. Spawns FindSkills sub-agent in parallel → returns ranked candidates
4. Spawns CompareSkills sub-agent → scores and ranks
5. Spawns SecureSkills sub-agent → audits top candidates
6. Spawns InstallSkills sub-agent → installs the winner

The sub-agents are defined in `agents/` and invoked via Claude Code's `Task`/`Agent` tool.

---

## 10. Key Facts for Implementation

1. **`plugin.json` minimum**: just `"name"`. Everything else is metadata.
2. **SKILL.md minimum**: `name` + `description` in frontmatter + any markdown body.
3. **Agent minimum**: `name` + `description` + `model` + `color` in frontmatter.
4. **`$CLAUDE_PLUGIN_ROOT`** is set at runtime in all hook commands and scripts.
5. **Skills auto-activate** based on description matching — no user `/` invocation required unless you add `argument-hint` to make it user-invocable.
6. **Skills can also be user-invoked** as slash commands by adding `argument-hint` frontmatter.
7. **Hooks run on lifecycle events** — use `SessionStart` for bootstrap, `PreToolUse`/`PostToolUse` for enforcement.
8. **Python virtual envs** inside skill dirs work fine. Multai ships a full `.venv` inside `skills/orchestrator/engine/`.
9. **The `version` field in `marketplace.json`** controls updates — bump it to trigger user updates.
10. **Testing locally**: `cc --plugin-dir /absolute/path/to/top-gun`.
