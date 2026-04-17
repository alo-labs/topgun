# Testing Strategy

TopGun is a Claude Code plugin — its "tests" are pipeline runs and security audits rather than unit test suites.

## Test Approach

**Manual pipeline runs** — run `/topgun find <task>` end-to-end and verify:
- `~/.topgun/registry-{hash}-*.json` partial files exist (18 files)
- `found-skills-{hash}.json` is written with `registries_searched` count == 18
- `validate-partials` hook blocks writes when partial count < 18
- Comparison artifact scores candidates correctly
- SENTINEL audit runs 2 consecutive passes before install

**Hook validation** — verify `bin/hooks/validate-partials.sh` blocks writes when partial files are absent:
```bash
# Create a dummy found-skills file with no partials
# Attempt write — hook should exit 1 and block it
```

**Dispatch verification** — verify `dispatch-registries` spawns real subprocesses:
```bash
# Run dispatch-registries
# Check partial file count immediately after
ls ~/.topgun/registry-*.json | wc -l  # should be 18
```

## Coverage Goals

| Area | Goal |
|------|------|
| Registry dispatch | 18 partials always written (including unavailable) |
| Hook enforcement | Write blocked when partials < 18 |
| State machine | Stage transitions write correct artifacts |
| SENTINEL integration | 2-pass requirement enforced |

## Future Work

Automated integration tests via `topgun-tools.cjs` test commands are on the roadmap for v2.0.
