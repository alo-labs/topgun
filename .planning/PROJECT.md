# TopGun — Project Context

## What This Is

TopGun is a Claude Code plugin that ensures the **best available skill is always used for any given job**. When a user invokes `/topgun <task>`, TopGun orchestrates four sub-agents in sequence — FindSkills, CompareSkills, SecureSkills, InstallSkills — then executes the winning skill and delivers its output with a brief audit trail header.

TopGun is invoked explicitly (`/topgun <task>`). It does not intercept other skill invocations.

## Core Value

Every `/topgun` invocation uses the most capable, security-audited skill available globally — not just whatever is locally installed.

## Who This Is For

Claude Code users who want confidence that the skill running their task is the best match available, not just the first one found, and that it has been security-hardened before use.

---

## The Four Sub-Agents

### 1. FindSkills
Searches for skills matching the job context:
- **Local first**: `~/.claude/skills/`, `~/.claude/plugins/`
- **Global**: all 18+ registries (skills.sh, SkillsMP, LobeHub, agentskill.sh, vskill, Smithery, OSM, ClawHub, Skills Directory, SkillsLLM, SkillHub, SkillNet, Agensi, Cyrus, ClaudePluginHub, MCP Market, skills.re, Gen Digital)
- **GitHub / GitLab**: direct repo search for SKILL.md-bearing repos
- **Configurable**: `--registries` flag scopes the search per invocation
- Returns a ranked candidate list with source, description, and metadata

### 2. CompareSkills
Evaluates candidates against four dimensions:
1. **Capability match** — how well the skill's documented features match the job context
2. **Security posture** — known vulnerabilities, last audit date, trust tier
3. **Popularity / stars** — GitHub stars, download counts, leaderboard position
4. **Recency** — last update date, active maintenance signals

Produces a ranked shortlist with scores per dimension. Selects the winner.

### 3. SecureSkills
Security hardens the winning skill:
- Invokes `/anthropic-skills:audit-security-of-skill` (Sentinel) against the skill
- Fixes all findings (Critical, High, Medium; Low at discretion)
- Re-runs Sentinel
- Loops until **2 consecutive clean passes**
- Produces a secured local copy of the skill

### 4. InstallSkills
Installs the secured skill:
- Attempts `/plugin install` (Claude plugin system) first
- Falls back to dropping secured `SKILL.md` into `~/.claude/skills/`
- Troubleshoots installation errors automatically
- Verifies the skill is invocable before proceeding

---

## Output Behavior

TopGun delivers an **audit trail header** before the skill output:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TOPGUN ► SKILL ACQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Skill:    [skill name + source registry]
 Score:    [capability/security/popularity/recency summary]
 Secured:  2 clean Sentinel passes
 Installed: [plugin | local ~/.claude/skills/]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Then delivers the skill's output as-is.

---

## Post-Use Behavior

Installed skills are **kept** after use. TopGun maintains a local registry of secured skills so repeat invocations can skip FindSkills/CompareSkills/SecureSkills if the same skill is the best match.

---

## Requirements

### Active

- [ ] Main TopGun orchestrator skill (`SKILL.md`) that sequences the 4 sub-agents
- [ ] FindSkills sub-agent: searches local + 18+ global registries + GitHub/GitLab for matching skills
- [ ] FindSkills: supports `--registries` flag to limit/expand search scope
- [ ] CompareSkills sub-agent: scores candidates on capability, security, popularity, recency
- [ ] CompareSkills: produces ranked shortlist and declares a winner
- [ ] SecureSkills sub-agent: runs Sentinel audit, fixes issues, loops until 2 consecutive clean passes
- [ ] SecureSkills: produces secured local copy of the skill
- [ ] InstallSkills sub-agent: installs via `/plugin install` with local-copy fallback
- [ ] InstallSkills: troubleshoots and verifies installability before proceeding
- [ ] Audit trail header displayed before skill output
- [ ] Local cache of secured skills to avoid redundant re-auditing on repeat use
- [ ] Plugin manifest (`plugin.json` / `package.json`) for distribution via skills registries
- [ ] Documentation: README, usage examples, registry submission guides

### Out of Scope

- Intercepting all skill invocations globally — TopGun is explicit-only (`/topgun <task>`)
- Building or maintaining a skill registry — TopGun consumes existing registries
- Replacing `/plugin install` for non-TopGun workflows

---

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Explicit invocation only | Avoids unintended wrapping of every skill call; user opts in deliberately | `/topgun <task>` pattern |
| All 18+ registries by default, configurable | Maximum coverage; power users can narrow scope | `--registries` flag |
| Plugin install + local copy fallback | Maximizes compatibility across Claude Code environments | Both paths implemented |
| Audit trail header (not silent, not full report) | Transparent without verbose overhead | Brief 5-line header |
| 2 consecutive Sentinel clean passes | Matches Silver Bullet's own security standard | SecureSkills loop gate |

---

## Context

This is a greenfield project. The TopGun plugin will itself be distributed via the skill registries it searches — dog-fooding its own discovery mechanism.

The plugin is being built in `/Users/shafqat/Documents/Projects/TopGun` and will be published to `https://github.com/alo-labs/topgun`.

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?

---
*Last updated: 2026-04-13 after initialization*
