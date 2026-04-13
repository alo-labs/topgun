# TopGun

TopGun is a Claude Code plugin that automatically finds, compares, security-audits, and installs the best available skill for any job — searching 18+ registries in parallel so you never settle for a suboptimal tool.

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
1. **Search** 18+ skill registries in parallel
2. **Compare** candidates across capability, security, popularity, and recency
3. **Audit** the top pick with Alo Labs Sentinel (2 clean passes required)
4. **Present** the audit manifest for your approval
5. **Install** the skill and display the audit trail

## How It Works

```
Find → Compare → Secure → Install
```

The `/topgun` orchestrator dispatches four sub-skills in sequence:

| Step | Skill | What it does |
|------|-------|--------------|
| 1 | `find-skills` | Federated search across 18+ registries in parallel |
| 2 | `compare-skills` | Multi-factor ranking: capability, security posture, popularity, recency |
| 3 | `secure-skills` | Alo Labs Sentinel audit — 2 consecutive clean passes required |
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

TopGun uses **Sentinel** — the Alo Labs `/audit-security-of-skill` skill — to audit every candidate before installation.

- **Structural envelope check**: validates skill file layout and manifest integrity
- **2-clean-pass requirement**: Sentinel must return a clean result on two independent runs before a skill is considered safe
- **Audit manifest**: every installation produces a signed audit trail you can inspect

### Requirements

- Claude Code with plugin support
- Alo Labs `/audit-security-of-skill` installed locally (Sentinel dependency)

## License

MIT — Alo Labs

---

## skills.sh

<!-- skills.sh section added by 07-02 -->
