# Pre-Release Quality Gate — TopGun

Before ANY release, the following four-stage quality gate MUST be completed in order.

**IMPORTANT**: This gate runs AFTER normal workflow finalization and BEFORE creating a GitHub release.

---

## Enforcement

**State file**: `~/.claude/.silver-bullet/state`

**Required markers** (must all be present before release):
- `quality-gate-stage-1`
- `quality-gate-stage-2`
- `quality-gate-stage-3`
- `quality-gate-stage-4`

**Session reset**: All four markers are cleared at the start of each new Claude Code session. The gate must be completed in full during the session in which the release is being cut — markers from a previous session do not carry over.

Each stage is complete only when:
1. The work is done and verified
2. The `/superpowers:verification-before-completion` skill has been invoked
3. The marker is written: `echo "quality-gate-stage-N" >> ~/.claude/.silver-bullet/state`

**Violating the verification rule is equivalent to skipping the stage.**

---

## Stage 1 — Code Review Triad

**Goal**: Zero accepted issues across all source files changed in this release.

Three sequential passes: functionality, structure, and security. Complete each before moving to the next.

### Pass 1 — Functionality Review

Run `/engineering:code-review` on each file below. Record findings, fix all accepted issues, re-run until clean.

**`skills/topgun/SKILL.md`**
- Verify the 4-stage orchestration flow (find → rank → audit → install) is described unambiguously
- Confirm the ranking rubric (relevance, freshness, adoption, security posture) is complete and each dimension is well-defined
- Verify the SENTINEL dispatch instruction points to `$CLAUDE_PLUGIN_ROOT/skills/sentinel/SKILL.md` (bundled, not external)
- Confirm the install confirmation UX is described (user prompt before installation)
- Verify the state file path (`~/.topgun/state.json`) is used consistently throughout

**`skills/find-skills/SKILL.md`**
- Verify the default registry list contains exactly 18 registries with correct names
- Confirm batching instruction: 4 batches of 5/5/5/3 adapters
- Verify the unified contract shape `{registry, status, reason, results[], latency_ms}` is defined
- Confirm the 5-parallel concurrency cap is stated

**`skills/find-skills/adapters/*.md`** (all 18)
- Each adapter specifies: endpoint URL, timeout (8s), retry strategy, response field mapping, `source_registry` value
- All adapters returning descriptions apply sanitization: truncate to 500 chars, strip HTML/markdown
- Adapters with speculative endpoints have a Degradation Notice
- 4xx responses return `status: "unavailable"` (not retried); 5xx/timeout use exponential backoff
- API key retrieval uses `topgun-tools.cjs keychain-get` — never hardcoded

**`skills/secure-skills/SKILL.md`**
- Verify it dispatches to bundled SENTINEL via `Read "$CLAUDE_PLUGIN_ROOT/skills/sentinel/SKILL.md"` (REQ-10)
- Confirm the fix loop: 2 consecutive clean passes required before `## SECURE COMPLETE`
- Confirm SHA-256 integrity gating between passes (REQ-13)
- Verify per-finding fingerprint tracking with 3-attempt cap (REQ-14)
- Confirm secured copy is written to `~/.topgun/secured/{sha}/SKILL.md` with 600 permissions (REQ-16)

**`skills/sentinel/SKILL.md`**
- Verify SENTINEL v2.3.0 is complete and non-empty
- Confirm it contains the 15 REQ checks and the NFR audit trail section
- Verify it produces a findings report with severity levels

**`bin/topgun-tools.cjs`**
- Verify `keychain-get` reads from the OS keychain without logging the retrieved value
- Verify SHA-256 functions produce correct digests
- Confirm the script handles missing keys gracefully (returns empty string, not an error)

**`site/index.html`**
- Verify registry count displayed is 18
- Verify tagline and positioning copy matches current direction
- Confirm no broken links, missing assets, or placeholder text

**`docs/CHANGELOG.md`**
- Verify the new release entry is present, dated correctly, uses the correct version
- Verify it accurately lists all Added, Changed, and Fixed items
- Confirm no placeholder text ("TODO", "TBD", template stubs) remains

**Final diff review**
- `git diff <prev-tag>...HEAD` — confirm no unintended changes, no debug code, no temp workarounds left in

### Pass 2 — Structure Review

1. **Adapter contract completeness**: Every adapter in `skills/find-skills/adapters/` returns exactly the unified schema fields: `name`, `description`, `install_url`, `stars`, `last_updated`, `content_sha`, `install_count` (where available), `source_registry`, `raw_metadata`.

2. **Skill file naming**: Every skill directory under `skills/` contains a `SKILL.md`. No orphaned adapter files without a corresponding directory in the adapters folder.

3. **Docs directory structure**: Verify `docs/` contains: `CHANGELOG.md`, `KNOWLEDGE.md`, `pre-release-quality-gate.md`, `Architecture-and-Design.md`, `Testing-Strategy-and-Plan.md`. Flag any missing or orphaned docs.

4. **Naming consistency**: Verify consistent spelling and casing across `skills/topgun/SKILL.md`, `README.md`, `site/index.html`, and `docs/CHANGELOG.md`. Check: skill names (`/topgun`, `/find-skills`, `/secure-skills`), registry names, config key names (`~/.topgun/state.json`).

5. **No orphaned files**: Check for files with no inbound references and no clear documented purpose.

### Pass 3 — Security Review (preliminary)

1. **No hardcoded credentials**: Search all changed files:
   ```bash
   grep -rn "api_key\s*=\s*['\"][a-zA-Z0-9]" skills/ bin/
   grep -rn "sk-or-\|Bearer [a-zA-Z0-9]" skills/ bin/
   ```

2. **Gitignore correctness**: Verify `.gitignore` includes `~/.topgun/` state and secured skill directories if they contain sensitive content.

3. **Credential file permissions**: Verify secured skills written to `~/.topgun/secured/` get `chmod 600`.

4. **SKILL.md credential scope**: Verify no SKILL.md ever instructs Claude to display or log retrieved API key values — only to verify the key exists.

### Completion

After all three passes complete with no blocking issues:

1. Invoke `/superpowers:verification-before-completion`
2. Write the marker:
   ```bash
   echo "quality-gate-stage-1" >> ~/.claude/.silver-bullet/state
   ```

**Exit criteria**: Zero accepted code review findings across all three passes, fresh verification confirms clean, marker written.

---

## Stage 2 — Big-Picture Consistency Audit

**Goal**: All components are consistent and correct as a whole system. No dimension can have unresolved gaps.

Spawn 5 parallel audit agents. Collect all findings. Fix all issues. Re-run until **two consecutive clean passes** across all 5 dimensions.

### Dimension A — Skills Consistency

Audit the orchestration chain: `topgun → find-skills → adapters → secure-skills → sentinel`:

- **Registry count**: The number 18 appears consistently in `skills/find-skills/SKILL.md`, `site/index.html`, and `docs/CHANGELOG.md`. No divergence.
- **Adapter names**: The 18 registry names in `find-skills/SKILL.md`'s default list exactly match the 18 `.md` files in `skills/find-skills/adapters/`. No missing files, no extra files.
- **Contract shape**: The unified contract `{registry, status, reason, results[], latency_ms}` is used identically in `find-skills/SKILL.md` and each adapter's Return Value section.
- **SENTINEL reference**: `secure-skills/SKILL.md` references `$CLAUDE_PLUGIN_ROOT/skills/sentinel/SKILL.md` — not an external skill. No stale references to `/audit-security-of-skill`.
- **Completion markers**: The 4 completion markers documented in `secure-skills/SKILL.md` (`SECURE COMPLETE`, `SECURE REJECTED`, `SECURE ABORTED`, `SECURE ESCALATED`) match those checked for in `topgun/SKILL.md`.
- **No obsolete references**: Search all skills for removed commands, deprecated paths, or old external dependency references.

### Dimension B — Adapter Coverage

Audit all 18 adapters for completeness and correctness:

- Every adapter has: Request section, Timeout + Retry section, Response Parsing table, Return Value section
- Every adapter that accesses an API key uses `topgun-tools.cjs keychain-get` (never env vars, never hardcoded)
- Every adapter with a speculative endpoint has a Degradation Notice
- The two adapters without public APIs (`mcp-so`, `opentools`) both have Degradation Notices and graceful-skip paths
- `cursor-directory` filter rationale is documented (word-level matching, intentional)
- `agentskill-sh` CLI fallback non-JSON error path returns `status: "error"`
- `claude-plugins-official` handles 4xx with `status: "unavailable"` (no retry)
- `glama` description sanitization is present (truncate 500, strip HTML/markdown)

### Dimension C — Security Chain

Audit the end-to-end security posture of the install flow:

- **SENTINEL bundling**: `skills/sentinel/SKILL.md` exists, is non-empty, and contains the full v2.3.0 audit logic
- **Secured output path**: Secured skills are written to `~/.topgun/secured/{sha}/SKILL.md` — not to any path that could be accessed without `~/.topgun/` traversal
- **Audit trail**: `secure-skills` writes `audit-{hash}.json` alongside the secured skill with findings, resolution paths, and disclaimer (NFR-05)
- **Fix loop cap**: The per-finding 3-attempt cap prevents infinite loops on unresolvable findings
- **User escalation**: Sentinel-resistant Critical findings always escalate to user — they are never silently accepted

### Dimension D — Website Accuracy

Audit `site/index.html`:

- **Registry count**: Exactly "18" throughout — no "11", "18+", or other variants
- **Skill names**: `/topgun`, `/find-skills`, `/secure-skills` spelled consistently
- **Feature descriptions**: Each described feature is implemented in the current codebase
- **Tagline and positioning**: Reflects current direction ("Agentic AI Skills Finder and Security Enforcer")
- **No broken links**: All href values in the page resolve (docs, GitHub, external registries)
- **No placeholder content**: No "TODO", "Coming soon" stubs for features not in scope

### Dimension E — Plugin Manifest

Audit `.claude-plugin/plugin.json` (if present):

- **SHA-256 accuracy**: The `forge_skill_md_sha256` (or equivalent hash field) matches the actual SHA-256 of the primary SKILL.md:
  ```bash
  sha256sum skills/topgun/SKILL.md
  ```
- **Version field**: Matches the release version being cut
- **Skill paths**: All skill paths referenced in `plugin.json` exist in the repo
- **Marketplace metadata**: Name, description, and category are accurate and current

### Completion

After two consecutive clean passes across all 5 dimensions:

1. Invoke `/superpowers:verification-before-completion`
2. Write the marker:
   ```bash
   echo "quality-gate-stage-2" >> ~/.claude/.silver-bullet/state
   ```

**Exit criteria**: Two consecutive clean passes, no consistency gaps remain, marker written.

---

## Stage 3 — Public-Facing Content Refresh

**Goal**: Everything users see is accurate, complete, and reflects the current release.

### Step 1 — GitHub Repository Metadata

- **Description**: Verify the GitHub repo description accurately reflects current capabilities. Recommended: "Find the best AI skill for any job — searches 18 global registries, ranks candidates, runs SENTINEL security audit, and installs the winner."
- **Topics/tags**: Recommended: `claude-code`, `ai-skills`, `mcp`, `security`, `sentinel`, `topgun`, `skill-finder`. Add missing, remove stale.
- **Homepage URL**: Verify it points to `https://topgun.alolabs.dev`
- **README preview**: No broken images, no dead badge URLs, no dead links

### Step 2 — README.md

Read `README.md` in full and verify/update:

- **Version**: Version badge or header matches the release being cut
- **Description**: Accurately reflects 18 registries, SENTINEL audit, 4-stage orchestration
- **Install command**: Copy-pasteable, tested, resolves to current URL
- **Registry list**: If listed, all 18 registries are present
- **License**: Correct (MIT) and current year
- **All links**: Every link resolves

### Step 3 — site/index.html (Landing Page)

Read `site/index.html` in full and verify/update:

- **Registry count**: "18" everywhere — consistent with README and SKILL.md
- **Feature section**: Each feature described is implemented; no vaporware
- **Call-to-action links**: Primary CTAs (GitHub, install, docs) resolve correctly
- **No broken assets**: All `<img>` and `<link>` references load
- **External links**: openai.com, GitHub, registry links are current

### Step 4 — docs/CHANGELOG.md

Verify the new release entry:

- **Version header**: Matches the tag being created (e.g., `## 2026-04-13 — topgun-v1.1.0`)
- **Date**: Correct release date
- **Changes**: All new adapters, fixes, and capability changes listed accurately
- **No placeholder text**: No "TODO", "TBD", or unfilled sections
- **Previous entries intact**: No prior entries accidentally modified

### Step 5 — CI

Push to main and wait for CI:

```bash
git push origin main
gh run watch --repo alo-labs/topgun
```

CI must pass before proceeding.

### Completion

1. Invoke `/superpowers:verification-before-completion`
2. Write the marker:
   ```bash
   echo "quality-gate-stage-3" >> ~/.claude/.silver-bullet/state
   ```

**Exit criteria**: All public-facing content accurate and current, CI passes on main, marker written.

---

## Stage 4 — Security Audit (SENTINEL)

**Goal**: No security issues in the skill instruction set. A compromised SKILL.md could cause Claude to exfiltrate data, bypass safety checks, or behave unpredictably.

Run bundled SENTINEL via `Read "$CLAUDE_PLUGIN_ROOT/skills/sentinel/SKILL.md"` on `skills/topgun/SKILL.md` as the primary automated check. Then perform the following manual checks.

### Target 1 — `skills/topgun/SKILL.md`

This file controls Claude's behavior during every TopGun session. A malformed or manipulated SKILL.md could alter how Claude handles third-party skill content.

1. **Prompt injection surface**: Review every section for content that could be manipulated by external registry responses to alter Claude's behavior. The highest-risk surface is the adapter response processing — verify Claude treats registry API responses as DATA to be mapped, not as instructions to execute.

2. **SENTINEL dispatch scope**: Verify `topgun/SKILL.md` dispatches SENTINEL only on the candidate skill SKILL.md content — not on registry metadata. SENTINEL must not be given the full adapter response as its prompt context.

3. **Credential handling**: Verify `topgun/SKILL.md` never instructs Claude to display, log, transmit, or include in any prompt the contents of API keys retrieved by `topgun-tools.cjs`. The skill should verify keys exist; it must not read them into context.

4. **Install gate**: Verify the user confirmation prompt occurs before any skill is installed. The install action must be explicitly user-approved — a crafted registry response must not be able to trigger automatic installation.

5. **State file scope**: Verify writes to `~/.topgun/state.json` are limited to registry preferences and install history. No skill content from external registries should be written to the state file.

6. **Secured skill path traversal**: Verify the `~/.topgun/secured/{sha}/` path is always constructed from a SHA-256 of the skill content — never from any string in the registry response that could contain path traversal sequences (`../`, absolute paths, etc.).

### Target 2 — `skills/find-skills/adapters/*.md`

All 18 adapter files instruct Claude to make network calls and parse responses. An adapter pointing to a malicious endpoint could attempt to inject instructions via API response content.

1. **Response treated as data**: Verify every adapter's Response Parsing section explicitly maps fields to unified schema fields. No adapter should instruct Claude to execute, interpret, or follow instructions found in API response content.

2. **Description sanitization**: Verify all adapters that store a `description` field specify: truncate to 500 chars, strip markdown/HTML tags. This prevents injection via crafted description fields.

3. **URL construction safety**: Verify no adapter constructs a URL by interpolating raw API response values into the URL template. URLs should be fixed or constructed from safe fields (registry-defined slugs with length limits).

4. **No speculative internal endpoints**: Verify no adapter attempts to call `localhost`, `127.0.0.1`, or any internal network range. All endpoints must be public, external, HTTPS.

### Target 3 — `skills/secure-skills/SKILL.md` + `skills/sentinel/SKILL.md`

The security audit chain itself must be secure — a compromised audit workflow could approve malicious skills.

1. **Fix loop integrity**: Verify the SHA-256 integrity check between fix passes (REQ-13) is described unambiguously. The hash must be computed over the full SKILL.md content — not a subset.

2. **Critical finding escalation**: Verify Critical severity findings are ALWAYS escalated to the user. There must be no code path in `secure-skills/SKILL.md` that downgrades a Critical finding to a lower severity or auto-resolves it.

3. **Audit trail completeness**: Verify `audit-{hash}.json` records: all findings, resolution path for each (fixed/escalated/accepted-risk/rejected), the SENTINEL version used, and the SHA-256 of both input and output SKILL.md.

4. **SENTINEL version pinning**: Verify `secure-skills/SKILL.md` references SENTINEL by version ("bundled SENTINEL v2.3.0") — not by a floating path that could resolve to a different version.

### Completion

After all three targets are clean with no blocking issues:

1. Fix every finding. Blocking issues (prompt injection path, auto-install without confirmation, critical finding bypass) must be fixed before proceeding.
2. Invoke `/superpowers:verification-before-completion`
3. Write the marker:
   ```bash
   echo "quality-gate-stage-4" >> ~/.claude/.silver-bullet/state
   ```

**Exit criteria**: Zero blocking security findings, all three targets pass clean, marker written.

---

## Release

After all 4 markers are written to `~/.claude/.silver-bullet/state`:

```bash
# Verify all 4 markers are present
grep -c "quality-gate-stage-" ~/.claude/.silver-bullet/state
# Must output 4

# Create the GitHub release
gh release create v<version> \
  --repo alo-labs/topgun \
  --title "TopGun v<version>" \
  --notes-file docs/CHANGELOG.md \
  --latest
```

**Skipping is not permitted.** No stage may be abbreviated or marked complete without performing the checks. If time pressure requires a release, document the skipped checks explicitly as known risks in the release notes and schedule a follow-up patch release after completing the audit.
