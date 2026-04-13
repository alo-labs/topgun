# TopGun — Requirements

**Version:** 1.0  
**Status:** Active  
**Last updated:** 2026-04-13

---

## Functional Requirements

### REQ-01 — Orchestrator Skill
The `/topgun <task>` skill MUST sequence FindSkills → CompareSkills → SecureSkills → [approval gate] → InstallSkills and deliver the installed skill's output with an audit trail header.

### REQ-02 — FindSkills: Local Search
FindSkills MUST search locally installed skills (`~/.claude/skills/`, `~/.claude/plugins/`) before querying external registries.

### REQ-03 — FindSkills: Global Registry Search
FindSkills MUST query all 18+ global registries in parallel. Default scope = all registries. Scope configurable per invocation via `--registries` flag.

### REQ-04 — FindSkills: GitHub and GitLab Search
FindSkills MUST search GitHub (`topic:claude-skill`) and GitLab for SKILL.md-bearing repositories.

### REQ-05 — FindSkills: Per-Registry Adapters
Each registry MUST have its own adapter (REST WebFetch or CLI shell call). Adapters MUST: enforce 8-second timeout, apply exponential backoff on 429 (1s/2s/4s, max 3 retries), treat timeout/5xx as unavailable (log + skip), cap concurrency at 5 simultaneous queries.

### REQ-06 — FindSkills: Rate-Limit Warning
If 3 or more registries are unavailable during a search, FindSkills MUST warn the user before proceeding.

### REQ-07 — FindSkills: Normalized Output Schema
FindSkills MUST normalize all registry results to a unified schema: `{name, description, source_registry, install_count, stars, security_score, last_updated, content_sha, install_url, raw_metadata}`. Written to `~/.topgun/found-skills-{hash}.json`.

### REQ-08 — CompareSkills: Multi-Factor Scoring
CompareSkills MUST score each candidate across four dimensions: capability match (vs. job context), security posture, popularity (stars + install count), recency (last updated). Produces a ranked shortlist and declares a winner. Written to `~/.topgun/comparison-{hash}.json`.

### REQ-09 — CompareSkills: Structural Envelope
CompareSkills MUST wrap all registry metadata fields in the structural envelope pattern before injecting into agent context. Pre-filters MUST reject SKILL.md files containing base64 blobs, Unicode > U+2000, or zero-width characters.

### REQ-10 — SecureSkills: Alo Labs Sentinel Invocation
SecureSkills MUST invoke `/audit-security-of-skill` (Alo Labs locally installed skill) via the Skill tool. This is the security auditor. Findings MUST be categorized by severity.

### REQ-11 — SecureSkills: Structural Envelope for SKILL.md Content
SecureSkills MUST wrap all external SKILL.md content in the structural envelope before passing to any agent context.

### REQ-12 — SecureSkills: Two Consecutive Clean Passes
SecureSkills MUST iterate: run Sentinel → fix findings → re-run Sentinel. Loop continues until Sentinel returns zero findings on two consecutive passes.

### REQ-13 — SecureSkills: SHA-256 Integrity Gating
SecureSkills MUST compute SHA-256 of the SKILL.md content immediately after each Sentinel pass and assert both passes operated on identical content. If hashes differ, abort with "Registry instability detected."

### REQ-14 — SecureSkills: Loop Cap and Escalation
If the same finding (by fingerprint) persists after 3 fix attempts, SecureSkills MUST escalate to the user with a binary choice: accept risk / reject skill. SecureSkills MUST NOT silently downgrade Critical findings.

### REQ-15 — SecureSkills: Runtime Phone-Home Rejection
SecureSkills MUST reject any SKILL.md containing `curl`, `wget`, or `fetch` in executable body sections. Rejection logged with reason.

### REQ-16 — SecureSkills: Secured Copy Storage
Secured copies MUST be written to `~/.topgun/secured/{sha}/SKILL.md` with `600` permissions.

### REQ-17 — InstallSkills: User Approval Gate
Before any installation, the orchestrator MUST present the audit manifest to the user and require explicit approval. Installation MUST NOT proceed without user consent.

### REQ-18 — InstallSkills: Allowed-Tools Warning
If the skill's `allowed-tools` includes `Bash`, `Computer`, or a wildcard, InstallSkills MUST display an explicit warning listing the requested permissions before proceeding.

### REQ-19 — InstallSkills: Dual Install Path
InstallSkills MUST attempt `/plugin install` first. On failure or persistence bug, MUST fall back to writing secured `SKILL.md` to `~/.claude/skills/`.

### REQ-20 — InstallSkills: Post-Install Verification
After install, InstallSkills MUST: (1) verify entry in `installed_plugins.json`, writing manually if missing; (2) attempt a test invocation of the installed skill. If both checks fail, surface error and offer local-copy fallback.

### REQ-21 — Audit Trail Header
TopGun MUST display a 5-line audit trail header before the skill's output:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TOPGUN ► SKILL ACQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Skill:    [name + source registry]
 Score:    [capability / security / popularity / recency]
 Secured:  2 clean Sentinel passes (Alo Labs /audit-security-of-skill)
 Installed: [plugin | local ~/.claude/skills/]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
Audit trail MUST include the disclaimer: "2 clean Sentinel passes = no automated findings. Not a guarantee of zero vulnerabilities."

### REQ-22 — Installed Skills Kept
Skills installed via TopGun MUST be kept after use (not ephemeral). TopGun MUST maintain a local registry at `~/.topgun/installed.json`.

### REQ-23 — Audit Cache
Audit results MUST be cached at `~/.topgun/audit-cache/{sha}.json` with a 24-hour TTL. Cache MUST be invalidated if upstream `updated_at`/`etag` changes. `--force-audit` flag bypasses cache. `--offline` flag uses cache-only mode.

### REQ-24 — Stage Resumption
If a TopGun pipeline is interrupted, the orchestrator MUST resume from the last completed stage using `~/.topgun/state.json`.

### REQ-25 — topgun-tools.cjs CLI Helper
A Node.js CJS helper (`bin/topgun-tools.cjs`) MUST provide: cache lookup, SHA-256 computation, state read/write, OS keychain integration for auth tokens. Available from Phase 1.

### REQ-26 — Auth Token Security
Registry auth tokens (GitHub, Smithery) MUST be stored in OS keychain (macOS Keychain), never in plaintext config files or SKILL.md.

### REQ-27 — Explicit Invocation Only
TopGun MUST only activate on explicit `/topgun <task>` invocation. It MUST NOT intercept or wrap other skill invocations.

### REQ-28 — Plugin Distribution
TopGun MUST be distributable via: (1) Claude plugin system (`/plugin install`), (2) `npx skills add`. Requires `.claude-plugin/marketplace.json` and GitHub release tags.

---

## Non-Functional Requirements

### NFR-01 — Security: Structural Envelope Everywhere
The structural envelope pattern MUST be applied to all external content in ALL four sub-agents. This is a project-wide standard, not sub-agent-specific.

### NFR-02 — Security: No Sensitive Data in Skill Files
Auth tokens, API keys, and cache paths MUST NOT appear in SKILL.md or agent `.md` files. Use `topgun-tools.cjs` and OS keychain.

### NFR-03 — Performance: Registry Search Timeout
Total FindSkills execution MUST complete within 60 seconds for a default (all-registries) search.

### NFR-04 — Resilience: Cascading Failure Isolation
A failure in any single registry adapter MUST NOT stall the pipeline. Each adapter returns `{status, reason, results}` — `status: "unavailable"` is a valid non-blocking result.

### NFR-05 — Correctness: Sentinel Audit Honesty
The audit trail MUST accurately represent what Sentinel checked and what it found. No false "fully secured" claims.

### NFR-06 — Compatibility: Claude Code Plugin Standard
TopGun MUST conform to the `.claude-plugin/` layout standard and use `$CLAUDE_PLUGIN_ROOT` for all intra-plugin path references.

---

## Out of Scope (v1)

- Building or maintaining a skill registry
- Intercepting all skill invocations globally (TopGun is explicit-only)
- OS-level sandbox isolation of installed skills (deferred to v2)
- GUI or web dashboard
- Requiring auth for all registry searches (auth is optional quality enhancement)
