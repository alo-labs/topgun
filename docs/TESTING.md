# Testing Strategy

TopGun is a Claude Code plugin — its "tests" are pipeline runs and security audits rather than unit test suites.

## Test Approach

**Manual pipeline runs** — run `/topgun find <task>` end-to-end and verify:
- `~/.topgun/registry-{hash}-*.json` partial files exist (16 files)
- `found-skills-{hash}.json` is written with `registries_searched` count == 16
- `validate-partials` hook in `hooks/hooks.json` blocks writes when partial count < 16
- Comparison artifact scores candidates correctly
- SENTINEL audit runs 2 consecutive passes before install

**Hook validation** — verify `hooks/hooks.json` routes to `bin/hooks/validate-partials.sh`, and that `.claude-plugin/hooks/hooks.json` matches it, which blocks writes when partial files are absent:
```bash
# Create a dummy found-skills file with no partials
# Attempt write — hook should exit 1 and block it
```

**Hook trust validation** — verify the live `config.toml` trust entries are seeded from the exact hook source each prefix names. For TopGun that means `topgun@alo-labs-codex:hooks/hooks.json` is trusted from `hooks/hooks.json`, and any intentionally mirrored user-config hook file should be trusted from that file rather than from the package bundle. The active Codex trust surface lives under `~/.codex`; any uppercase `~/.Codex` residue is migration-only.

**Plugin manifest validation** — verify `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` both expose the shared `skills/` tree and point hooks at `./hooks/hooks.json`. Also verify `hooks/hooks.json` exists, `.claude-plugin/hooks/hooks.json` matches it, and `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json` are both named `Ālo Labs`. A mismatch means one runtime will see the skills while the other will not.

**Dispatch verification** — verify the in-process `Task` dispatch in `agents/topgun-finder.md` Step 4 produces all 16 partial files (v1.5+):
```bash
# Run /topgun <task> end-to-end and immediately check
ls ~/.topgun/registry-*.json | wc -l  # should be 16
```
Each partial corresponds to a `general-purpose` `Task` sub-agent dispatched by `topgun-finder` in a single parallel batch. Sub-agents inherit the parent session's auth context, so this works for both OAuth (Pro/Teams) and API-key auth — see ARCHITECTURE.md "Auth inheritance" and issue #3 for the rationale.

## Coverage Goals

| Area | Goal |
|------|------|
| Registry dispatch | 16 partials always written (including unavailable) |
| Hook enforcement | Write blocked when partials < 16 |
| State machine | Stage transitions write correct artifacts |
| SENTINEL integration | 2-pass requirement enforced |

## Future Work

Automated integration tests via `topgun-tools.cjs` test commands are on the roadmap for v2.0.
