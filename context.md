# TopGun — Session Context

**Date:** 2026-04-13  
**Session:** v1.1.0 release completion + registry research

---

## Project

- **Name:** @alo-labs/topgun
- **Version:** 1.1.0 (released)
- **Repo:** https://github.com/alo-labs/topgun.git
- **Stack:** Node.js (CJS), no runtime dependencies
- **Description:** Finds, compares, secures, and installs Claude skills across 18 registries

---

## Architecture

4-agent pipeline:

1. **topgun-finder** (`agents/topgun-finder.md`) — queries adapters in parallel, returns unified results
2. **topgun-comparator** (`agents/topgun-comparator.md`) — ranks/deduplicates results
3. **topgun-securer** (`agents/topgun-securer.md`) — security-checks top candidates
4. **topgun-installer** (`agents/topgun-installer.md`) — installs chosen skill

Orchestrated by `skills/topgun/SKILL.md`.

---

## Current Registries (18)

Adapters live in `skills/find-skills/adapters/`:

| # | File | Registry |
|---|------|----------|
| 1 | agentskill-sh.md | AgentSkill.sh |
| 2 | claude-plugins-official.md | Claude Plugins (official) |
| 3 | clawhub.md | ClawHub |
| 4 | cursor-directory.md | Cursor Directory (awesome-cursorrules) |
| 5 | github.md | GitHub Topics |
| 6 | gitlab.md | GitLab |
| 7 | glama.md | Glama |
| 8 | huggingface.md | HuggingFace Spaces (MCP + agent filter) |
| 9 | langchain-hub.md | LangChain Hub |
| 10 | lobehub.md | LobeHub |
| 11 | mcp-so.md | MCP.so |
| 12 | npm.md | npm |
| 13 | opentools.md | OpenTools |
| 14 | osm.md | OpenSkillsMarket |
| 15 | skills-sh.md | Skills.sh |
| 16 | skillsmp.md | SkillsMP |
| 17 | smithery.md | Smithery |
| 18 | vskill.md | VSkill |

---

## Tests

- `tests/smoke.test.cjs` — structural validity (JSON, frontmatter, adapter count)
- `tests/failure-contracts.test.cjs` — agent STAGE FAILED contracts, keychain roundtrip
- **Count:** 240/240 passing (as of v1.1.0)
- Smoke test asserts adapter count = 18; must be updated when adding new adapters

---

## v1.1.0 Release

- **Tag:** v1.1.0 (pushed)
- **GitHub Release:** Created at alo-labs/topgun
- **Title:** "TopGun v1.1.0 — 18 Registries + Bundled SENTINEL"
- **What was new:**
  - 7 new adapters: cursor-directory, glama, huggingface, langchain-hub, mcp-so, opentools, claude-plugins-official
  - SENTINEL security checker embedded in topgun-securer
  - `--auto-approve` flag for non-interactive installs
  - `keychain-get/set` via `bin/topgun-tools.cjs`
  - hooks/hooks.json for Claude Code hooks integration

---

## Next: Registries 19 & 20

Candidates to reach 20 total adapters:

| Candidate | Why | API |
|-----------|-----|-----|
| **e2b.dev** | Sandbox-native agent marketplace; curated MCP/agent tools | Public REST API |
| **Wordware** | Prompt-as-app registry with public directory | Web scrape or API |
| FlowiseAI Hub | Open-source LLM flow marketplace | GitHub-based |
| Langbase | Hosted prompt/pipe marketplace | REST API |

**Recommendation:** e2b.dev + Wordware

When adding:
1. Create adapter `.md` file in `skills/find-skills/adapters/`
2. Update `EXPECTED_ADAPTERS` array in `tests/smoke.test.cjs`
3. Update adapter count assertion from 18 → 20

---

## Key Files

| File | Purpose |
|------|---------|
| `skills/topgun/SKILL.md` | Main orchestrator skill |
| `skills/find-skills/SKILL.md` | FindSkills sub-skill |
| `skills/compare-skills/SKILL.md` | CompareSkills sub-skill |
| `skills/secure-skills/SKILL.md` | SecureSkills sub-skill |
| `skills/install-skills/SKILL.md` | InstallSkills sub-skill |
| `agents/topgun-finder.md` | Finder agent |
| `agents/topgun-comparator.md` | Comparator agent |
| `agents/topgun-securer.md` | Securer agent |
| `agents/topgun-installer.md` | Installer agent |
| `bin/topgun-tools.cjs` | CLI tool (keychain, etc.) |
| `.claude-plugin/plugin.json` | Plugin manifest |
| `.claude-plugin/marketplace.json` | Marketplace metadata |
| `hooks/hooks.json` | Claude Code hooks |

---

## Silver Bullet Enforcement

- State file: `~/.claude/.silver-bullet/state`
- Quality gate requires 4 stages, each with `verification-before-completion-stage-N` before `quality-gate-stage-N`
- `dev-cycle-check.sh` enforces whitelisted echo patterns for stage markers
