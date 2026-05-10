# Testing Strategy

TopGun is a Claude Code plugin — its "tests" are pipeline runs and security audits rather than unit test suites.

## Test Approach

**Manual pipeline runs** — run `/topgun find <task>` end-to-end and verify:
- `~/.topgun/registry-{hash}-*.json` partial files exist (18 files)
- `found-skills-{hash}.json` is written with `registries_searched` count == 18
- `validate-partials` hook in `.claude-plugin/hooks/hooks.json` blocks writes when partial count < 16
- Comparison artifact scores candidates correctly
- SENTINEL audit runs 2 consecutive passes before install

**Hook validation** — verify `.claude-plugin/hooks/hooks.json` routes to `bin/hooks/validate-partials.sh`, which blocks writes when partial files are absent:
```bash
# Create a dummy found-skills file with no partials
# Attempt write — hook should exit 1 and block it
```

**Dispatch verification** — verify the in-process `Task` dispatch in `agents/topgun-finder.md` Step 4 produces all 18 partial files (v1.5+):
```bash
# Run /topgun <task> end-to-end and immediately check
ls ~/.topgun/registry-*.json | wc -l  # should be 18
```
Each partial corresponds to a `general-purpose` `Task` sub-agent dispatched by `topgun-finder` in a single parallel batch. Sub-agents inherit the parent session's auth context, so this works for both OAuth (Pro/Teams) and API-key auth — see ARCHITECTURE.md "Auth inheritance" and issue #3 for the rationale.

## Coverage Goals

| Area | Goal |
|------|------|
| Registry dispatch | 18 partials always written (including unavailable) |
| Hook enforcement | Write blocked when partials < 18 |
| State machine | Stage transitions write correct artifacts |
| SENTINEL integration | 2-pass requirement enforced |

## Future Work

Automated integration tests via `topgun-tools.cjs` test commands are on the roadmap for v2.0.
