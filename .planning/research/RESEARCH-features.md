# Feature Research: TopGun — Skill Discovery, Comparison, Audit, and Orchestration

**Researched:** 2026-04-13
**Mode:** Ecosystem (features focus)
**Overall confidence:** MEDIUM — primary sources verified via official docs and live sites; some registry internals are inferred from CLI behavior

---

## Q1: How do existing skill discovery tools expose their search APIs?

### skills.sh (Vercel)

- **CLI-first**. Primary interface is `npx skills` (no global install needed).
- Key commands: `npx skills find <keywords>`, `npx skills add <owner/repo>`, `npx skills list`, `npx skills remove <skill-name>`.
- The `find` command queries the **https://skills.sh/api/skills** endpoint (confirmed via the `skills-search` skill's source code on playbooks.com).
- No publicly documented REST API beyond what the CLI uses. Search is keyword-based; no GraphQL surface found.
- Source: https://skills.sh/docs/cli, https://medium.com/@jacklandrin/skills-cli-guide-using-npx-skills-to-supercharge-your-ai-agents-38ddf3f0a826

### agentskill.sh (`ags` CLI)

- **CLI + REST**. Published as `@agentskill.sh/cli` on npm.
- Key commands: `ags search <query>`, `ags install <slug>`, `ags list`, `ags update`, `ags remove`, `ags feedback <slug> <1-5>`.
- All commands support `--json` output flag and `--platform <name>` override.
- The `/learn` skill (for in-agent use) calls the same API and sorts results by install count.
- A security score (0–100) is displayed in the preview before installation; skills below 30 trigger a warning.
- Source: https://github.com/agentskill-sh/ags

### ClawHub / clawskills.sh

- **Web UI + curated index**. No published standalone CLI confirmed.
- The site (`clawskills.sh`) indexes 5,147+ skills, filters spam/duplicates, and ranks by download count and stars.
- Metadata visible in the UI: name, description, install count, contributor, category tags (40+ integrations shown).
- ClawHub has a post-publication scanning pipeline; no REST API documentation found for third-party access.
- Source: https://clawskills.sh/

### Smithery (MCP-oriented registry)

- **REST API with authentication**. Endpoint: `GET https://registry.smithery.ai/servers`.
- Auth: Bearer token (from smithery.ai/account/api-keys).
- Query parameters: `q` (semantic + full-text), `page`, `pageSize` (1–100), `topK` (10–500), `ids`, `namespace`, `qualifiedName`, `remote`, `isDeployed`, `verified`, `ownerId`, `repoOwner`, `repoName`, `fields`, `seed`.
- Response fields: `id`, `qualifiedName`, `namespace`, `slug`, `displayName`, `description`, `iconUrl`, `homepage`, `verified` (bool), `isDeployed`, `remote`, `useCount`, `score`, `createdAt`, `owner`.
- An MCP server wraps this API so agents can call it directly.
- Source: https://smithery.ai/docs/concepts/registry_search_servers

### SkillsMP

- **REST API**. Endpoints: `/api/v1/skills/search` (keyword) and `/api/v1/skills/ai-search` (semantic).
- Documented at `skillsmp.com/docs/api` but the page returned 403 during research; endpoint names confirmed by search result summaries.
- Community-run aggregator; not affiliated with Anthropic or OpenAI.
- Confidence: LOW for exact schema detail.

### Summary table

| Registry | Interface | Auth Required | Search Type |
|----------|-----------|---------------|-------------|
| skills.sh | CLI (`npx skills find`) + undocumented REST | No | Keyword |
| agentskill.sh | CLI (`ags search`) + REST (`--json`) | No (public) | Keyword, sorted by installs |
| clawskills.sh | Web UI only (no confirmed REST) | N/A | Keyword + category |
| Smithery | REST `GET /servers` + MCP server | Bearer token | Semantic + keyword + filters |
| SkillsMP | REST `/api/v1/skills/search` and `/ai-search` | Unknown | Keyword + semantic |

---

## Q2: What metadata do skill registries expose?

### Anthropic-spec required fields (SKILL.md frontmatter)

From the official Anthropic Agent Skills spec (platform.claude.com):

```yaml
name:        # string, max 64 chars, lowercase + hyphens only
description: # string, max 1024 chars, includes "what" and "when to use"
```

These are the only two required fields. The spec intentionally stays minimal.

### agentskill.sh injected metadata (per installed skill)

Every installed skill has a metadata header injected:

```
slug          # registry identifier
owner         # publisher handle
contentSha    # SHA-256 of skill file content (used for update detection)
installed     # ISO timestamp
source        # origin registry URL
```

### Smithery per-server response fields

`id`, `qualifiedName`, `namespace`, `slug`, `displayName`, `description`, `iconUrl`, `homepage`, `verified`, `isDeployed`, `remote`, `useCount`, `score`, `createdAt`, `owner`

### skills.sh leaderboard + audit data (via skills-search skill)

From `https://skills.sh/api/skills`, the `skills-search` skill receives:
- name, install count, source repository, install command

The skills.sh audits page (`skills.sh/audits`) additionally aggregates third-party audit results per skill:
- Gen Agent Trust Hub verdict (Safe / not safe)
- Socket alert count
- Snyk risk classification (Low / Medium / High / Critical)
- Socket composite scores: license, maintenance, quality, supply chain, vulnerability (0.0–1.0)

### Common metadata fields across registries

| Field | skills.sh | agentskill.sh | Smithery | ClawHub |
|-------|-----------|---------------|---------|---------|
| name | Y | Y | Y | Y |
| description | Y | Y | Y | Y |
| install/use count | Y | Y | Y (useCount) | Y |
| security score | via audits page | Y (0–100) | N | via scan pipeline |
| stars | via GitHub link | N | N | Y |
| last updated | N | via contentSha | createdAt | N |
| verified flag | N | N | Y | N |
| category/tags | N | N | N | Y (40+ categories) |
| owner/namespace | Y | Y | Y | Y |

---

## Q3: Are there existing skill comparison or ranking tools? How do they score?

### Current ranking approaches (all confirmed MEDIUM confidence)

**1. Install count (primary signal — most common)**
- skills.sh leaderboard ranks by install count. Top five as of March 2026: `find-skills` (418.6K), `vercel-react-best-practices` (176.4K), `web-design-guidelines` (137.0K), `remotion-best-practices` (126.0K), `frontend-design` (124.1K).
- agentskill.sh `ags search` also sorts by install count by default.

**2. GitHub stars**
- OpenAIToolsHub.org ranks 349 Claude Code skills by GitHub stars. Stars are treated as "the closest proxy to usage in the open-source ecosystem."
- Multi-factor systems supplement stars with recency (skills updated in last 90 days score higher) and documentation quality.

**3. Security scoring (Snyk + Socket + Gen)**
- skills.sh/audits aggregates three vendors per skill.
- Snyk scores: Low / Medium / High / Critical categorical risk with issue codes (W011: third-party content exposure, W012: external dependencies).
- Socket scores: numeric 0.0–1.0 across license, maintenance, quality, supply chain, vulnerability dimensions.
- Gen Agent Trust Hub: binary Safe/Not Safe verdict.

**4. agentskill.sh server-side score (0–100)**
- Evaluates 12 threat categories including command injection, data exfiltration, obfuscation.
- Displayed in CLI preview before install. Below 30 = warning.

**5. User feedback**
- `ags feedback <slug> <1-5> [msg]` allows 1–5 star ratings.

**No dedicated cross-registry skill comparison tool found.** The ecosystem has per-registry rankings but nothing that normalizes and compares across all registries in a unified view as of April 2026.

---

## Q4: What does the Anthropic Sentinel security audit produce?

The specific slash command `/anthropic-skills:audit-security-of-skill` was not found in any official Anthropic documentation, Claude Code docs, or community sources. This command name does not appear to exist as a shipped feature.

**What does exist:**

### pors/skill-audit (open-source CLI, most complete spec found)

Output formats: terminal (default), JSON, SARIF (CI/CD / GitHub Actions integration).
Exit codes: 0 = pass, 1 = fail (errors found, or warnings in strict mode), 2 = tool execution error.
Distinguishes errors vs. warnings; `--strict` flag promotes warnings to failures.

Checks performed:
- Prompt analysis: jailbreak patterns ("ignore previous instructions", "DAN mode"), role manipulation, data exfiltration instructions, safety bypass attempts.
- Code analysis: hardcoded secrets/credentials, dangerous shell patterns (`rm -rf`, `eval`), arbitrary code execution risks, subprocess injection.
- External scanners integrated: trufflehog/gitleaks (secrets), shellcheck (bash), semgrep (Python/JS).

Source: https://github.com/pors/skill-audit

### Cisco AI Defense skill-scanner

Severity levels: CRITICAL, HIGH, MEDIUM, LOW, INFO.
Output formats: Summary, JSON, Markdown, Table, SARIF, HTML (interactive with collapsible findings, taint flow diagrams).
`--fail-on-severity` flag for CI thresholds.
Combines signature-based detection, LLM semantic analysis, behavioral dataflow analysis.
Source: https://github.com/cisco-ai-defense/skill-scanner

### Snyk agent-scan CLI (Invariant Labs research, open-source)

Categorical: Risky, Critical severity levels with numeric scores (example scores seen: 82, 83 out of 100).
Checks: prompt injection variants (including base64-obfuscated), malware payloads, credential mishandling, toxic flow patterns, suspicious external downloads.

### Assessment for TopGun

There is no shipped `anthropic-skills:audit-security-of-skill` command. TopGun will need to either call the Anthropic Skills API audit endpoints (if any exist in beta), integrate one of the above open-source tools, or call Snyk/Socket/Gen APIs directly to produce audit output. The community standard output format emerging is JSON + SARIF for machine consumption with severity levels of CRITICAL / HIGH / MEDIUM / LOW / INFO.

---

## Q5: Leading patterns for caching/memoizing skill audit results

### Pattern 1: contentSha header (agentskill.sh standard)

Every installed skill receives a `contentSha` (SHA-256 of file content) in its metadata header. On `ags update`, the CLI compares local content hash against the registry version — skip re-auditing if hashes match.

This is the ecosystem's de facto "skip audit if unchanged" signal.

### Pattern 2: Content-Hash Cache (content-hash-cache-pattern skill)

Source: claudepluginhub.com / affaan-m/everything-claude-code

Implementation:
1. Compute SHA-256 of skill file contents (chunked 64KB reads for large files).
2. Check if `~/.cache/skill-audit/{hash}.json` exists.
3. On hit: return cached result immediately.
4. On miss: run audit, write `{hash}.json`, return result.
5. CLI exposes `--cache` / `--no-cache` / `--force` flags.

This achieves O(1) lookup with no index file. Cache key is content-derived, so renames/moves get a cache hit; any content change auto-invalidates.

### Pattern 3: skill-lock.json (SkillFortify pattern)

Source: https://github.com/qualixar/skillfortify/blob/main/docs/skill-lock-json.md

Similar to `package-lock.json`. Each skill entry: `sha256:<hex>` integrity hash + version + declared capabilities + trust metadata.

Workflow: audit once, commit lockfile. To verify: regenerate and diff. Mismatch = skill changed since approval. No re-audit needed if hash matches committed lockfile.

### Pattern 4: Registry-side audit caching (Snyk/Socket/Gen via skills.sh/audits)

The skills.sh audits leaderboard pre-fetches and caches third-party audit results registry-side. Skills are scanned once on publish; results are served from the registry cache. Per-skill detail page shows cached scores without re-calling vendor APIs.

### Recommended caching strategy for TopGun

Use contentSha as cache key (already present in agentskill.sh metadata). Store audit results as `~/.topgun/audit-cache/{contentSha}.json`. On subsequent installs of the same skill version, return cached result. Expose `--force-audit` flag to bypass cache. Include a lockfile (`topgun-lock.json`) for reproducible installs in teams.

---

## Q6: Existing Claude Code plugins that do multi-registry search or skill orchestration

### What exists (confirmed)

**jeremylongshore/claude-code-plugins-plus-skills**
- 340 plugins + 1367 agent skills in one repository.
- CCPI package manager CLI: `ccpi search <keyword>`, `ccpi install <plugin>`, `ccpi list --installed`, `ccpi update`, `ccpi validate <path>`.
- Federated model: primary catalog + external syncing (e.g., wondelai/skills). MCP ecosystem integration referenced.
- Does NOT do live multi-registry search at query time — it's a curated aggregate, not a meta-search engine.
- Source: https://github.com/jeremylongshore/claude-code-plugins-plus-skills

**openclaw/skills — skills-search skill**
- A skill that calls `https://skills.sh/api/skills` from within an agent session.
- Keyword search, sorted by install count. Single registry only (skills.sh).
- Source: https://playbooks.com/skills/openclaw/skills/skills-search

**claude-plugins.dev**
- Web directory: 2793 skills across 423 plugins. Searchable.
- No multi-registry orchestration; single aggregated index.

**affaan-m/everything-claude-code**
- 182 specialized agents, 16 multi-agent orchestrators, 149 agent skills, 96 commands.
- Production orchestration patterns including content-hash caching.
- Source: https://github.com/affaan-m/everything-claude-code

### Gap: No true multi-registry orchestration exists

No tool found (as of April 2026) that:
- Queries 18+ registries in parallel at search time.
- Normalizes metadata across registries (different field names, scoring scales).
- Runs comparative security scoring across registries before install.
- Orchestrates sub-agents for find / compare / audit / install as a coordinated pipeline.

TopGun occupies an unbuilt niche in the ecosystem. The closest analogues are curated aggregators (jeremylongshore, claude-plugins.dev) or single-registry CLIs (ags, npx skills), not live federated search with security gatekeeping.

---

## Feature Implications for TopGun

### Must-Have (Table Stakes)

| Feature | Rationale |
|---------|-----------|
| `npx skills find`-compatible keyword search | Users expect this from skills.sh |
| Security score display before install | agentskill.sh sets this expectation (score 0–100, warn below 30) |
| JSON output flag for all commands | Standard across ags, Smithery, ccpi |
| contentSha-based audit cache | Ecosystem standard; prevents redundant work |
| Support `name` + `description` + `install count` + `stars` in result display | Minimum metadata users expect |

### Differentiators TopGun Can Own

| Feature | Why Unique |
|---------|------------|
| Parallel query across 18+ registries | No existing tool does this |
| Normalized metadata comparison (unified schema) | Every registry uses different field names |
| Aggregated security score from multiple vendors (Snyk + Socket + Gen) | skills.sh/audits does this per-skill, but not at search time |
| Sub-agent orchestration (find → compare → audit → install) | No existing tool uses an agent pipeline for this |
| skill-lock.json output for team reproducibility | SkillFortify pattern, not widely adopted |

### Anti-Features to Avoid

| Anti-Feature | Why Avoid |
|--------------|-----------|
| Building a new registry | Too much maintenance; piggyback on existing ones |
| Requiring auth for search | Skills.sh and agentskill.sh are auth-free for search; adding friction kills adoption |
| Re-auditing on every command | Slow and expensive; contentSha caching is the community answer |
| GraphQL API for internal communication | No registry uses it; REST + JSON is universal |

---

## Sources

- https://skills.sh/docs/cli
- https://medium.com/@jacklandrin/skills-cli-guide-using-npx-skills-to-supercharge-your-ai-agents-38ddf3f0a826
- https://github.com/agentskill-sh/ags
- https://clawskills.sh/
- https://smithery.ai/docs/concepts/registry_search_servers
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- https://skills.sh/audits
- https://playbooks.com/skills/openclaw/skills/skills-search
- https://snyk.io/blog/snyk-tessl-partnership/
- https://github.com/pors/skill-audit
- https://github.com/cisco-ai-defense/skill-scanner
- https://github.com/qualixar/skillfortify/blob/main/docs/skill-lock-json.md
- https://www.claudepluginhub.com/skills/affaan-m-everything-claude-code/content-hash-cache-pattern
- https://github.com/jeremylongshore/claude-code-plugins-plus-skills
- https://www.openaitoolshub.org/en/blog/best-claude-code-skills-2026
