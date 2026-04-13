# TopGun — Roadmap

**Milestone 1:** v1.0 — Full Pipeline  
**Status:** Not started  
**Last updated:** 2026-04-13

---

## Phase Overview

| Phase | Name | Key Deliverable | Requirements |
|-------|------|-----------------|--------------|
| 1 | Plugin Scaffold + Orchestrator | Working plugin shell, topgun-tools.cjs, local testability | REQ-01, REQ-25, REQ-27, NFR-06 |
| 2 | 3/3 | Complete   | 2026-04-13 |
| 3 | 1/3 | In Progress|  |
| 4 | 2/3 | In Progress|  |
| 5 | InstallSkills + Approval Gate | Approval gate, install verification, fallback, allowed-tools | REQ-17–22, REQ-21 |
| 6 | Caching, State, Resilience | Audit cache, stage resumption, --offline, failure contracts | REQ-23–24, REQ-26, NFR-04 |
| 7 | Distribution + Marketplace | marketplace.json, GitHub release, skills.sh listing | REQ-28 |

---

## Phase 1: Plugin Scaffold + Orchestrator Foundation

**Goal:** A correctly structured, locally installable Claude Code plugin with a working orchestrator skill that dispatches stub sub-agents, manages state, and completes with structured markers.

**Why first:** Nothing else works without the correct file layout and a validated install pipeline. Establishes the data contract (JSON schemas) and topgun-tools.cjs before any sub-agent logic is built.

**Plans:** 3 plans
- [x] 04-01-PLAN.md — Structural envelope + pre-filters (phone-home, allowed-tools)
- [x] 04-02-PLAN.md — Sentinel invocation loop (SHA-256 gating, fingerprint tracking)
- [ ] 04-03-PLAN.md — Loop cap, escalation, secured copy, audit-{hash}.json
- **1-01:** Plugin structure — `.claude-plugin/plugin.json`, all 5 SKILL.md stubs, all 4 agent `.md` stubs, `$CLAUDE_PLUGIN_ROOT` validation
- **1-02:** topgun-tools.cjs — `init`, `state-read`, `state-write`, `cache-lookup`, `sha256`, `keychain-get/set` commands; `~/.topgun/` directory hierarchy
- **1-03:** Orchestrator logic — state.json resume check, sequential Task() dispatch, completion marker detection, audit trail header skeleton, `--registries` flag parsing

**Success criteria:**
- `cc --plugin-dir . /topgun "find a deployment skill"` activates the skill
- Orchestrator dispatches all 4 stub sub-agents in sequence
- `~/.topgun/state.json` written and readable between invocations
- `topgun-tools.cjs sha256 <content>` returns correct hash

**Research needed:** None — multai and GSD are direct reference implementations.

---

## Phase 2: FindSkills — Registry Search Adapters

**Goal:** FindSkills agent queries all reachable registries in parallel, normalizes results to a unified schema, extracts contentSha, and writes `found-skills-{hash}.json`.

**Why second:** Pipeline entry point. CompareSkills and everything downstream depend on the normalized schema being stable.

**Plans:** 3/3 plans complete
- **2-01:** Tier-1 registry adapters — skills.sh (WebFetch), agentskill.sh (`ags search --json`), Smithery (REST + Bearer), GitHub/GitLab (REST search)
- **2-02:** Tier-2 registry adapters — SkillsMP, LobeHub, OSM, vskill, ClawHub (headless attempt), npm, and remaining registries from the report; graceful skip for unavailable registries
- **2-03:** Normalization layer — unified schema, deduplication by package identity, contentSha extraction, 3+ unavailable warning, found-skills-{hash}.json output

**Success criteria:**
- FindSkills returns results from ≥5 registries for a common query (e.g., "deployment skill")
- All results conform to unified schema (validated against JSON schema)
- A registry timeout (>8s) does not stall the pipeline
- `~/.topgun/found-skills-{hash}.json` written with correct structure

**Research needed:** Phase 2 needs targeted research on SkillsMP API access, LobeHub/OSM rate limits, and ClawHub REST availability before planning execution.

---

## Phase 3: CompareSkills — Multi-Factor Ranking

**Goal:** CompareSkills agent normalizes metadata, applies four-dimension scoring rubric, declares a winner, and writes `comparison-{hash}.json`.

**Why third:** Depends on FindSkills' normalized schema. Straightforward logic but must implement structural envelope for all metadata before any agent context injection.

**Plans:** 1/3 plans executed
- **3-01:** Structural envelope enforcement + pre-filter (base64, Unicode > U+2000, zero-width char detection)
- **3-02:** Scoring rubric — capability match (semantic similarity to job context), security posture (registry security score), popularity (install count + stars), recency (last_updated); weighted composite score
- **3-03:** Ranked shortlist output, winner selection, `comparison-{hash}.json`

**Success criteria:**
- All metadata passes through structural envelope before scoring
- Candidates with `security_score < 30` flagged with warning
- Winner selection is deterministic for same input
- `comparison-{hash}.json` written with scores per dimension and ranked list

**Research needed:** None — scoring heuristics well-documented from skills.sh leaderboard and features research.

---

## Phase 4: SecureSkills — Sentinel Audit Loop

**Goal:** SecureSkills agent wraps SKILL.md in structural envelope, invokes the Alo Labs `/audit-security-of-skill` Skill, runs the fix loop until 2 consecutive clean passes (capped at 3 attempts per finding), verifies SHA-256 integrity between passes, and writes `audit-{hash}.json`.

**Why fourth:** Most security-critical phase. Must be correct before any installation happens. Loop termination, integrity gating, and escalation logic all need to be right.

**Plans:** 2/3 plans executed
- [ ] 04-01-PLAN.md — Structural envelope + pre-filters (phone-home, allowed-tools)
- [ ] 04-02-PLAN.md — Sentinel invocation loop (SHA-256 gating, fingerprint tracking)
- [ ] 04-03-PLAN.md — Loop cap, escalation, secured copy, audit-{hash}.json
- **4-01:** Structural envelope application to SKILL.md + pre-filters (phone-home detection, allowed-tools inspection)
- **4-02:** Sentinel invocation loop — Skill tool call to `/audit-security-of-skill`, SHA-256 gating, finding fingerprint tracking, fix application, 2-clean-pass detection
- **4-03:** Loop cap + escalation — max 3 attempts per finding fingerprint, user escalation on Sentinel-resistant findings, secured copy write to `~/.topgun/secured/{sha}/SKILL.md` with `600` perms, `audit-{hash}.json` output

**Success criteria:**
- Structural envelope applied before first Sentinel invocation
- SHA-256 hash computed and compared after each pass; mismatch → abort
- Loop terminates after exactly 2 consecutive clean passes
- Same finding appearing 3+ times → user escalation (not silent skip)
- Secured copy written with `600` permissions
- `audit-{hash}.json` includes disclaimer text about Sentinel scope

**Research needed:** Phase 4 needs empirical validation of Sentinel (`/audit-security-of-skill`) output schema, severity labels, and response structure before implementing the fix parser.

---

## Phase 5: InstallSkills + User Approval Gate

**Goal:** Orchestrator presents audit manifest to user and requires approval. InstallSkills agent installs the secured skill via `/plugin install` with local-copy fallback, verifies installation, and validates allowed-tools.

**Why fifth:** Final execution phase after security is confirmed. User approval gate is the last human checkpoint before any skill is installed.

**Plans:** 3 plans
- [ ] 04-01-PLAN.md — Structural envelope + pre-filters (phone-home, allowed-tools)
- [ ] 04-02-PLAN.md — Sentinel invocation loop (SHA-256 gating, fingerprint tracking)
- [ ] 04-03-PLAN.md — Loop cap, escalation, secured copy, audit-{hash}.json
- **5-01:** User approval gate in orchestrator — present audit manifest (skill name, source, scores, Sentinel summary, allowed-tools), require explicit yes/no
- **5-02:** `/plugin install` path — install, read `installed_plugins.json` to verify, test-invoke, write entry manually on persistence bug (#12457 mitigation)
- **5-03:** Local-copy fallback — write to `~/.claude/skills/` on plugin install failure, verify invocability, update `~/.topgun/installed.json`

**Success criteria:**
- No installation proceeds without explicit user approval
- `Bash`/`Computer`/wildcard `allowed-tools` trigger permission warning before approval gate
- Post-install verification reads `installed_plugins.json` AND test-invokes skill
- Local-copy fallback activates on install failure and produces working skill
- `~/.topgun/installed.json` updated after successful install

**Research needed:** None — plugin install bugs confirmed with workarounds; patterns straightforward.

---

## Phase 6: Caching, State, and Resilience

**Goal:** Production-grade `~/.topgun/` cache hierarchy, contentSha audit cache with TTL, stage resumption, `--offline` flag, registry auth token management via OS keychain, and failure contracts across all sub-agents.

**Why sixth:** Cache and state work is built incrementally during earlier phases but needs a dedicated hardening pass to be production-grade before distribution.

**Plans:** 3 plans
- [ ] 04-01-PLAN.md — Structural envelope + pre-filters (phone-home, allowed-tools)
- [ ] 04-02-PLAN.md — Sentinel invocation loop (SHA-256 gating, fingerprint tracking)
- [ ] 04-03-PLAN.md — Loop cap, escalation, secured copy, audit-{hash}.json
- **6-01:** Audit cache — `~/.topgun/audit-cache/{sha}.json`, 24h TTL, `updated_at`/`etag` invalidation, stale-with-warning serving, `--force-audit` bypass, `topgun-lock.json`
- **6-02:** Stage resumption — `~/.topgun/state.json` schema, resume-from-stage logic in orchestrator, `--reset` flag to clear state
- **6-03:** Auth token management — topgun-tools.cjs keychain integration (macOS Keychain), first-run token prompt, `--offline` flag, cascading failure contracts (`{status, reason, results}` from every sub-agent)

**Success criteria:**
- Interrupted pipeline resumes from last completed stage on next invocation
- Cached audit served for same contentSha within 24h; re-audited if stale
- `--offline` serves from cache; errors clearly if no cache exists
- GitHub + Smithery tokens stored in Keychain, never in config files
- Any sub-agent failure returns `{status: "failed", reason: "..."}` without crashing orchestrator

**Research needed:** None — GSD tools.cjs and Silver Bullet review-state patterns are direct references.

---

## Phase 7: Distribution + Marketplace

**Goal:** TopGun distributed via Claude plugin system and skills.sh ecosystem, with autoUpdate enabled and GitHub release tagging.

**Why last:** Distribution is only meaningful once the full pipeline is tested and hardened.

**Plans:** 3 plans
- [ ] 04-01-PLAN.md — Structural envelope + pre-filters (phone-home, allowed-tools)
- [ ] 04-02-PLAN.md — Sentinel invocation loop (SHA-256 gating, fingerprint tracking)
- [ ] 04-03-PLAN.md — Loop cap, escalation, secured copy, audit-{hash}.json
- **7-01:** `.claude-plugin/marketplace.json`, autoUpdate config, GitHub release tags (v1.0.0), `/plugin install alo-labs/topgun` support
- **7-02:** skills.sh listing, `npx skills add alo-labs/topgun` support, README and usage examples, registry submission guides

**Success criteria:**
- `npx @anthropic-ai/claude-code --allowedTools "Bash,Read,Write,Glob,Grep" -p '/plugin install alo-labs/topgun'` succeeds in a clean environment
- `npx skills add alo-labs/topgun` installs from skills.sh
- autoUpdate configured and tested

**Research needed:** None — marketplace format confirmed from production examples.

---

## Dependencies Between Phases

```
1 → 2 → 3 → 4 → 5 → 6 → 7
         ↑
         (schema must be stable)
```

Phases 1–5 are strictly sequential (each depends on the previous output). Phase 6 can overlap with 4 and 5 for cache/state scaffolding but needs a dedicated pass after Phase 5. Phase 7 is always last.

---

## Milestone Success Criteria

TopGun v1.0 is complete when:
1. `/topgun <task>` invocation completes the full pipeline end-to-end
2. All 28 functional requirements and 6 NFRs satisfied
3. Plugin installable via `/plugin install` and `npx skills add`
4. All Phases 1–7 verified via `/gsd:verify-work`
