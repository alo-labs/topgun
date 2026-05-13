<!-- generated-by: gsd-doc-writer -->
# TopGun

TopGun is a Claude Code plugin that automatically finds, compares, security-audits, and installs the best available skill for any job — searching 16 active registries in parallel so you never settle for a suboptimal tool.

## Quick Start

### Install via Codex Plugin System

```
codex plugin marketplace add https://github.com/alo-labs/codex-plugins.git
```

### Install via skills.sh

```
npx skills add alo-labs/topgun
```

## Usage

```
/topgun "find a deployment skill"
```

TopGun will:
1. **Search** 16 active skill registries via parallel in-process Task dispatch
2. **Compare** candidates across capability, security, popularity, and recency
3. **Audit** the top pick with bundled SENTINEL v2.3.0 (2 clean passes required)
4. **Present** the audit manifest for your approval
5. **Install** the skill and display the audit trail

## How It Works

```
Find → Compare → Secure → Install
```

The `/topgun` orchestrator dispatches four sub-skills in sequence:

| Step | Skill | What it does |
|------|-------|--------------|
| 1 | `find-skills` | 16 active registries searched in parallel via in-process `Task` sub-agents (v1.5+) |
| 2 | `compare-skills` | Multi-factor ranking: capability, security posture, popularity, recency |
| 3 | `secure-skills` | Bundled SENTINEL v2.3.0 audit — 2 consecutive clean passes required |
| 4 | `install-skills` | Installs the approved skill and writes the audit trail |

Security is a gate, not a step. A skill that fails Sentinel is never presented for installation.

## CLI Flags

| Flag | Description |
|------|-------------|
| `--registries <list>` | Comma-separated list of registries to search (default: all) |
| `--offline` | Use cached results only — no network requests |
| `--reset` | Clear state and start fresh |
| `--force-audit` | Bypass audit cache and re-run Sentinel |

## Security Model

TopGun uses **SENTINEL v2.3.0** — bundled directly in the plugin — to audit every candidate before installation. No external dependencies required.

- **Structural envelope check**: validates skill file layout and manifest integrity
- **2-clean-pass requirement**: Sentinel must return a clean result on two independent runs before a skill is considered safe
- **Audit manifest**: every installation produces a signed audit trail you can inspect

## Hook Setup

TopGun ships matching `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` manifests, both pointing at the shared `skills/` tree and the root `hooks/hooks.json` hook bundle, mirrored under `.claude-plugin/hooks/hooks.json` for Claude packaging, so Codex Settings > Hooks shows it as `Plugin · topgun` instead of `User config`.

### What the hook does

`bin/hooks/validate-partials.sh` intercepts any write to a `found-skills-*.json` file. It extracts the run hash from the filename, counts the corresponding `registry-{hash}-*.json` partial files, and blocks the write (exit 1) if fewer than 16 are present. This prevents the finder from producing an incomplete result set regardless of agent behavior.

### Upgrade migration

If an older install wrote this hook into `~/.codex/hooks.json`, `node /path/to/topgun/bin/topgun-tools.cjs init` removes only TopGun's legacy entries, refreshes the hook trust block in `~/.codex/config.toml` from the exact source each prefix names, and treats any uppercase `~/.Codex` mirror as legacy-only migration state that can be backed up and removed once the lowercase install is valid.

### Requirements

- Codex with plugin support

## License

MIT — Alo Labs

---

## skills.sh Ecosystem

### Install via skills.sh

```
npx skills add alo-labs/topgun
```

### Compatibility

TopGun's `.claude-plugin/` structure is natively compatible with the skills.sh ecosystem, and the Codex-facing `.codex-plugin/plugin.json` points to the same shared skills bundle. The bundled hook manifest lives at `hooks/hooks.json` and is mirrored under `.claude-plugin/hooks/hooks.json` for Claude packaging. The Claude marketplace metadata lives in `.claude-plugin/marketplace.json` for `alo-labs/claude-plugins`, and the Codex marketplace metadata lives in `.agents/plugins/marketplace.json` for `alo-labs/codex-plugins`. Both marketplace entries are named `Ālo Labs`.

### Registry Submission

To list TopGun on skills.sh:

1. Ensure the GitHub repository is public at `https://github.com/alo-labs/topgun`
2. Verify `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` are in `.claude-plugin/` for `alo-labs/claude-plugins`
3. Verify `.codex-plugin/plugin.json` exists and `.agents/plugins/marketplace.json` is present for `alo-labs/codex-plugins`
4. Tag a release: `git tag v0.7.7 && git push origin v0.7.7`
5. Submit via: `npx skills submit alo-labs/topgun`

### Auto-Update

TopGun keeps the Claude marketplace metadata in `.claude-plugin/marketplace.json` and the Codex marketplace metadata in `.agents/plugins/marketplace.json`, so both `Ālo Labs` marketplace entries stay aligned with the release tags.

## Updating TopGun

Keep your TopGun installation current with the built-in update skill:

```
/topgun-update
```

TopGun will:
1. **Check** the installed version against the latest GitHub release
2. **Display** the changelog delta since your installed version
3. **Verify** the commit SHA before touching anything
4. **Update** the plugin cache, stable `current` alias, and registry atomically

If the versioned cache tree was removed during a clean reinstall, TopGun first
bootstraps it from the local snapshot before refreshing the live alias and
registry rows.

```
/topgun-update --check   # check for updates without installing
```

State preserved across updates: `~/.topgun/` audit cache, keychain tokens, hook config, and the stable `current` alias.

---

## Releases

TopGun uses GitHub release tags for versioning. To create a release:

```bash
git tag -a v{version} -m "TopGun v{version} — release description"
git push origin v{version}
```

The tag triggers autoUpdate for existing installations.
