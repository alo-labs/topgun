<!-- generated-by: gsd-doc-writer -->
# TopGun

TopGun is a Claude Code plugin that automatically finds, compares, security-audits, and installs the best available skill for any job — searching 16 active registries in parallel so you never settle for a suboptimal tool.

## Quick Start

### Install via Claude Plugin System

```
/plugin install alo-labs/topgun
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

TopGun ships a `PreToolUse:Write` enforcement hook that guarantees all 16 active registry partial files are written before the finder aggregates results. The hook must be registered in `~/.claude/settings.json`.

### What the hook does

`bin/hooks/validate-partials.sh` intercepts any write to a `found-skills-*.json` file. It extracts the run hash from the filename, counts the corresponding `registry-{hash}-*.json` partial files, and blocks the write (exit 1) if fewer than 16 are present. This prevents the finder from producing an incomplete result set regardless of agent behavior.

### Installing the hook

Run the init command after installing the plugin:

```bash
node ~/.claude/plugins/alo-labs/topgun/bin/topgun-tools.cjs init
```

This adds the following entry to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/topgun/bin/hooks/validate-partials.sh"
          }
        ]
      }
    ]
  }
}
```

### Version bump note

The hook path in `settings.json` includes the plugin version. When upgrading TopGun, re-run `topgun-tools.cjs init` to update the path to the new version.

### Requirements

- Claude Code with plugin support

## License

MIT — Alo Labs

---

## skills.sh Ecosystem

### Install via skills.sh

```
npx skills add alo-labs/topgun
```

### Compatibility

TopGun's `.claude-plugin/` structure is natively compatible with the skills.sh ecosystem. The `plugin.json` and `marketplace.json` files provide all metadata needed for discovery and installation.

### Registry Submission

To list TopGun on skills.sh:

1. Ensure the GitHub repository is public at `https://github.com/alo-labs/topgun`
2. Verify `plugin.json` and `marketplace.json` are in `.claude-plugin/`
3. Tag a release: `git tag v1.7.4 && git push origin v1.7.4`
4. Submit via: `npx skills submit alo-labs/topgun`

### Auto-Update

TopGun is configured with `autoUpdate.enabled: true` in marketplace.json. When a new GitHub release is tagged, installations will auto-update within 24 hours.

## Updating TopGun

Keep your TopGun installation current with the built-in update skill:

```
/topgun-update
```

TopGun will:
1. **Check** the installed version against the latest GitHub release
2. **Display** the changelog delta since your installed version
3. **Verify** the commit SHA before touching anything
4. **Update** the plugin cache and registry atomically

```
/topgun-update --check   # check for updates without installing
```

State preserved across updates: `~/.topgun/` audit cache, keychain tokens, and hook config.

---

## Releases

TopGun uses GitHub release tags for versioning. To create a release:

```bash
git tag -a v{version} -m "TopGun v{version} — release description"
git push origin v{version}
```

The tag triggers autoUpdate for existing installations.
