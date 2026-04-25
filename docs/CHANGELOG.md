<!-- generated-by: gsd-doc-writer -->
# Task Log

> Rolling log of completed tasks. One entry per non-trivial task, written at step 15.
> Most recent entry first.

---

<!-- Entry format:
## YYYY-MM-DD — task-slug
**What**: one sentence description
**Commits**: abc1234, def5678
**Skills run**: brainstorming, write-spec, security, ...
**Virtual cost**: ~$0.04 (Sonnet, medium complexity)
**KNOWLEDGE.md**: updated (architecture patterns, known gotchas) | no changes
-->

<!-- ENTRIES BELOW — newest first -->

## 2026-04-26 — v1.7.2

**What**: Patch release adding automatic old-cache cleanup to `/topgun-update` so stale plugin version directories are removed after every successful update.

**Changed**:
- `skills/topgun-update/SKILL.md` — added Step 6.3: after the registry write succeeds, all version directories under the TopGun plugin cache root are deleted except the newly installed one; deleted paths are collected and displayed in the Step 7 summary.

**Migration**: zero user-facing migration. Existing installs continue to work; the next `/topgun-update` run will clean up any leftover version directories automatically.

---

## 2026-04-26 — v1.7.1

**What**: Patch release fixing the GitLab adapter, activating ClawHub via WebSearch, removing two confirmed-dead registry adapters, and updating stale "18 registry" references throughout docs and site.

**Fixed**:
- `adapters/gitlab.md` — `order_by=stars` is not a valid GitLab API v4 parameter (returns HTTP 400); corrected to `order_by=star_count`.
- `adapters/clawhub.md` — replaced `status: skip` with a WebSearch fallback (`site:clawhub.com OR site:clawhub.ai {query} skill`); ClawHub is now an active registry.
- `site/help/concepts/index.html` — removed stale OSM and vskill rows from the registry adapter table.
- `docs/pre-release-quality-gate.md` — updated all "18 registries" references to "16" following removal of vskill and osm in v1.7.0.

**Removed**:
- `skills/find-skills/adapters/vskill.md` — domain `vskill.dev` confirmed ECONNREFUSED; fully removed (was added as SKIP marker in v1.7.0, now deleted).
- `skills/find-skills/adapters/osm.md` — domain `openskillsmarket.org` confirmed ECONNREFUSED; fully removed (same pattern).

**Migration**: zero user-facing migration. Registry count unchanged at 16 active registries.

---

## 2026-04-26 — v1.7.0

**What**: Fix finder hallucination — sub-agents were synthesising results from training data instead of making real HTTP calls because `$CLAUDE_PLUGIN_ROOT` was passed as an unresolved literal into Task prompts. Added WebSearch fallbacks for three API-blocked registries and SKIP markers for two confirmed-dead domains.

**Changed**:
- `agents/topgun-finder.md` — added explicit CLAUDE_PLUGIN_ROOT resolution step before dispatching Tasks; injected concrete path into all 16 sub-agent prompts; added NO-HALLUCINATION POLICY block requiring each sub-agent to emit `FETCHED: {url} → HTTP {status}` after every real network call; updated registry count from 18 to 16.
- `bin/hooks/validate-partials.sh` — corrected partial-file threshold from 18 to 16 (was blocking the pipeline after the active registry count was reduced).
- `skills/find-skills/SKILL.md` — default registry list now enumerates exactly 16 active registries; vskill and osm removed from dispatch list; adapter table updated with current statuses.

**Added**:
- `skills/find-skills/adapters/vskill.md` (SKIP marker) — domain `vskill.dev` confirmed ECONNREFUSED; adapter returns `status: unavailable` immediately without a network call.
- `skills/find-skills/adapters/osm.md` (SKIP marker) — domain `openskillsmarket.org` confirmed ECONNREFUSED; same immediate-return pattern.

**Fixed**:
- `adapters/skills-sh.md` — primary API returns 404; replaced with WebSearch `site:skills.sh` query with domain-filtered results.
- `adapters/lobehub.md` — API returns 403; replaced with WebSearch with `lobehub.com` URL filter.
- `adapters/mcp-so.md` — API returns 403; replaced with WebSearch `site:mcp.so` query.
- `adapters/opentools.md` — primary WebFetch returns off-topic results; added relevance filter (claude/mcp/skill keywords) and WebSearch fallback.
- `adapters/skillsmp.md` — `source_registry` casing corrected from `"SkillsMP"` to `"skillsmp"` (Step 7 validation was silently dropping all SkillsMP results); status updated from degraded to active (confirmed 200 on 2026-04-26).

**Migration**: zero user-facing migration. The orchestrator and topgun-finder interface are unchanged.

---

## 2026-04-26 — v1.6.0

**What**: Added `/topgun-update` skill for in-place plugin upgrades with changelog diff and SHA verification.

**Added**:
- `skills/topgun-update/SKILL.md` — new `/topgun-update` skill: checks installed vs. latest GitHub release, displays changelog delta, verifies commit SHA before touching anything, and updates the plugin cache and registry atomically. `--check` flag for dry-run.
- Full test suite for topgun-update (240 tests passing).

**Changed**:
- `skills/secure-skills/SKILL.md` — pinned SENTINEL version reference to "bundled SENTINEL v2.3.0" explicitly to prevent floating references.
- `README.md` — documented `/topgun-update` usage, `--check` flag, and state-preservation guarantee.

**Migration**: zero user-facing migration. Existing installations get the update skill automatically on next plugin refresh.

---

## 2026-04-25 — v1.5.0

**What**: Fix #3 — replace the `dispatch-registries` subprocess (which silently broke FindSkills for OAuth-authenticated Claude Code users) with in-process parallel `Task()` dispatch. Also eliminates the secondary issue where Silver Bullet's `dev-cycle-check.sh` hook was blocking the orchestrator's `dispatch-registries` Bash call on substring-match for "install".

**Changed**:
- `agents/topgun-finder.md` — Step 4 rewritten to dispatch all 18 registry adapter sub-agents in a single message via the `Task` tool (`subagent_type: "general-purpose"`). Inherits the parent session's authentication context, so OAuth and API-key auth both work. `Task` and `Glob` added to the agent's `tools` list.
- `bin/topgun-tools.cjs` — `dispatch-registries` command removed; calling it now prints a deprecation message pointing to issue #3 and exits 2. The `spawn` import was dropped.

**Fixed**:
- `#3` — FindSkills returning "all 18 registries unavailable" for users on Claude Code Pro/Teams (OAuth auth, the default). Root cause: spawned `claude` subprocesses cannot inherit the parent's OAuth session token, so they exit 1 with "Not logged in" before any adapter logic runs.
- Secondary: orchestrator no longer triggers SB's path+keyword hook because `dispatch-registries` is no longer invoked at all.

**Migration**: zero user-facing migration. The orchestrator and `topgun-finder` interface are unchanged; only the internal dispatch mechanism is different.

---

## 2026-04-18 — v1.4.1

**What**: Patch release removing stale `/audit-security-of-skill` references from the public help center that v1.4.0 missed, and broadening the Stage 3 gate scope so the miss cannot recur.

**Changed**:
- `site/help/getting-started/index.html` — removed the "Alo Labs Audit Skill" prerequisite card and the install-order warning; replaced the SENTINEL prerequisites callout with bundled SENTINEL v2.3.0 content
- `site/help/concepts/index.html` — updated the 4-stage pipeline step 3 description and the SENTINEL Audit section intro to reference the bundled path `skills/sentinel/SKILL.md`
- `site/help/troubleshooting/index.html` — rewrote the "SENTINEL Not Found" troubleshooting card: the fix is now "reinstall TopGun to restore the bundled SENTINEL file," not "install the external audit skill first"
- `site/help/search.js` — updated two stale search-index excerpts (Install TopGun, SENTINEL Not Found) to reflect bundled SENTINEL
- `docs/pre-release-quality-gate.md` — broadened Stage 3 Step 3 scope from `site/index.html` to the full `site/**` tree (including `site/help/**/*.html` and `site/help/search.js`) so public help-center content is always audited before release
- `plugin.json` / `marketplace.json` — bumped version to 1.4.1

---

## 2026-04-18 — v1.4.0

**What**: Added pre-release gate enforcement hook and fixed stale site references to the now-bundled SENTINEL.

**Added**:
- `bin/hooks/validate-release-gate.sh` — `PreToolUse:Bash` hook that blocks `gh release create` unless all 4 quality-gate stage markers are present in `~/.claude/.silver-bullet/state`

**Changed**:
- `site/index.html` — version badge updated from v1.1 to v1.4; replaced two stale references to "Alo Labs /audit-security-of-skill" with "bundled SENTINEL v2.3.0"
- `docs/pre-release-quality-gate.md` — corrected Stage 1 batching check to reflect single-batch dispatch (v1.2.0 change); updated Stage 2 docs structure check to reflect current `docs/` layout
- `plugin.json` / `marketplace.json` — bumped version to 1.4.0

---

## 2026-04-18 — doc-scheme-restructure

**What**: Restructured docs/ to comply with the Silver Bullet doc-scheme — renamed Architecture-and-Design.md to ARCHITECTURE.md, replaced placeholder TESTING.md, split KNOWLEDGE.md into knowledge/INDEX.md + knowledge/2026-04.md + lessons/2026-04.md, and added doc-scheme.md.

**Added**:
- `docs/TESTING.md` — testing strategy replacing 3-line placeholder
- `docs/knowledge/INDEX.md` — gateway index replacing KNOWLEDGE.md Part 1
- `docs/knowledge/2026-04.md` — project-scoped intelligence (migrated from KNOWLEDGE.md Part 2)
- `docs/lessons/2026-04.md` — portable lessons (extracted from KNOWLEDGE.md Part 2)
- `docs/doc-scheme.md` — Silver Bullet doc-scheme reference

**Changed**:
- `docs/Architecture-and-Design.md` → `docs/ARCHITECTURE.md` (git mv, content preserved)

**Removed**:
- `docs/KNOWLEDGE.md` — fully migrated; content split across knowledge/ and lessons/
- `docs/Testing-Strategy-and-Plan.md` — replaced by TESTING.md

---

## 2026-04-18 — v1.3.0

**What**: Replaced LLM-driven Agent fan-out with a mechanical Node.js subprocess dispatcher and added a PreToolUse:Write enforcement hook to guarantee all 18 registry partials are written before aggregation.

**Added**:
- `bin/topgun-tools.cjs dispatch-registries` — Node.js command that spawns one `claude --bare` subprocess per registry via `child_process.spawn` + `Promise.allSettled`; writes `status: "unavailable"` partial on failure/timeout
- `bin/hooks/validate-partials.sh` — `PreToolUse:Write` hook installed in `~/.claude/settings.json`; blocks aggregation write if fewer than 18 partial files exist
- `bin/topgun-tools.cjs validate-partials` — synchronous partial-count check used by finder for self-verification

**Changed**:
- `agents/topgun-finder.md` — removed `Agent` from tools list; finder now calls `dispatch-registries` via Bash
- `skills/topgun/SKILL.md` — updated Step 1 to reference mechanical dispatch
- `plugin.json` — bumped version to 1.3.0
- `marketplace.json` — bumped version to 1.3.0

**Fixed**:
- Issue #2 — LLM fabricating registry results from training data instead of dispatching sub-calls; mechanical dispatcher closes this permanently

---

## 2026-04-18 — v1.2.1

**What**: Added prompt-based enforcement gate (Step 4a partial file check) as a pre-write validation step; later superseded by the mechanical hook in v1.3.0.

**Added**:
- `skills/find-skills/SKILL.md` — Step 4a: explicit pre-write partial file count check in prompt instructions

**Note**: This enforcement relied on the LLM following prompt instructions and was recognized as insufficient since agent behavior can bypass prompt-level gates. Replaced by `validate-partials.sh` hook in v1.3.0.

---

## 2026-04-18 — v1.2.0

**What**: Parallelized all 18 registry searches to run simultaneously by removing the concurrency cap of 5, and added the `Agent` tool to the finder to enable sub-call dispatch.

**Changed**:
- `skills/find-skills/SKILL.md` — removed concurrency cap; all 18 registries dispatched in a single parallel batch
- `agents/topgun-finder.md` — added `Agent` to tools list
- `plugin.json` — bumped version to 1.2.0
- `marketplace.json` — bumped version to 1.2.0; corrected manifest alignment

---

## 2026-04-13 — v1.1.0

**What**: Expanded from 11 to 18 skill registries, bundled SENTINEL v2.3.0 eliminating external dependency, fixed code review findings in adapters, and added 4-stage pre-release quality gate.

**Added**:
- 7 new Tier-3 registry adapters: `glama.md`, `huggingface.md`, `langchain-hub.md`, `claude-plugins-official.md`, `cursor-directory.md`, `mcp-so.md`, `opentools.md`
- `skills/sentinel/SKILL.md` — SENTINEL v2.3.0 bundled directly into plugin (no external dependency)
- `docs/pre-release-quality-gate.md` — 4-stage quality gate adapted for TopGun

**Changed**:
- `agentskill-sh.md` — upgraded to WebFetch primary with Bash CLI `ags` fallback
- `find-skills/SKILL.md` — default registry list expanded to 18, batching updated to 4 batches of 5/5/5/3
- `secure-skills/SKILL.md` — switched from external `/audit-security-of-skill` to bundled SENTINEL (REQ-10)
- `topgun/SKILL.md` — Step 8 audit trail template updated to reference bundled SENTINEL v2.3.0
- `README.md` — removed stale external Sentinel dependency requirement
- `site/index.html` — updated registry count to 18, refreshed positioning copy
- `plugin.json` — bumped version to 1.1.0

**Fixed**:
- `claude-plugins-official.md` — added explicit 4xx → unavailable handling + Degradation Notice
- `glama.md` — added description sanitization (truncate 500 chars, strip HTML/markdown)
- `cursor-directory.md` — documented word-level filtering rationale
- `agentskill-sh.md` — added `status: "error"` path for CLI non-JSON output

---

## 2026-04-13 — registry-adapter-expansion-sentinel-bundle

**What**: Added 7 new Tier-3 registry adapters, upgraded agentskill-sh to WebFetch primary with CLI fallback, and bundled SENTINEL v2.3.0 directly into the plugin eliminating the external audit-security-of-skill dependency.

**Changes**:
- Added adapters: `glama.md`, `huggingface.md`, `langchain-hub.md`, `claude-plugins-official.md`, `cursor-directory.md`, `mcp-so.md`, `opentools.md`
- Upgraded: `agentskill-sh.md` — WebFetch primary, Bash CLI `ags` fallback
- Updated: `find-skills/SKILL.md` — default registry list expanded to 18, batching updated to 4 batches of 5/5/5/3
- Updated: `secure-skills/SKILL.md` — switched from external `/audit-security-of-skill` to bundled SENTINEL (REQ-10)
- Added: `sentinel/SKILL.md` — SENTINEL v2.3.0 bundled into plugin
- Fixed: `topgun/SKILL.md` Step 8 audit trail template — updated stale `audit-security-of-skill` reference to `bundled SENTINEL v2.3.0`
- Fixed: `README.md` — removed stale external Sentinel dependency requirement

**Skills run**: quality-gates (9-dimension), code-review, testing-strategy, documentation, deploy-checklist, tech-debt, test-driven-development, verification-before-completion
