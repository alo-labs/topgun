---
name: topgun-update
description: >
  Updates the local TopGun installation to the latest release from GitHub.
  Invoke when the user says "update topgun", "upgrade topgun", "topgun update",
  "check for topgun updates", or "/topgun-update". Checks the installed version
  against the latest GitHub release, displays the changelog delta, verifies the
  commit SHA, and installs the update using the same mechanism as the official
  Claude plugin system.
argument-hint: [--check]
allowed-tools: [Read, Write, Bash]
---

# /topgun-update — Update TopGun

Updates the local TopGun installation to the latest release.

**`--check` flag:** Check version and STOP — do not prompt or update.

---

## Step 1: Prerequisites and Plugin Lookup

```bash
command -v jq  >/dev/null 2>&1 || { echo "❌ jq required: brew install jq / sudo apt install jq"; exit 1; }
command -v git >/dev/null 2>&1 || { echo "❌ git is required but not found."; exit 1; }
```

Locate the TopGun entry in the plugin registry:

```bash
cat "$HOME/.claude/plugins/installed_plugins.json" 2>/dev/null \
  | jq -r '.plugins | to_entries[]
           | select(.key | test("topgun"; "i"))
           | "\(.key)\t\(.value[0].version // "unknown")\t\(.value[0].installPath // "")"' \
  2>/dev/null | head -1
```

Extract `TOPGUN_KEY`, `INSTALLED_VERSION`, `INSTALL_PATH` from the tab-separated output.

Display: `━━━ TOPGUN ► UPDATE ━━━  |  Installed: v{INSTALLED_VERSION}`

**If not found** (`TOPGUN_KEY` empty or version "unknown"):
```
❌ TopGun not installed via Claude plugin system.
   Install: /plugin install alo-labs/topgun  |  npx skills add alo-labs/topgun
```
STOP.

---

## Step 2: Check Latest Version from GitHub

```bash
curl -s -m 30 https://api.github.com/repos/alo-labs/topgun/releases/latest \
  | jq -r '.tag_name // empty' | sed 's/^v//'
```

Capture as `LATEST_VERSION`. On failure or empty result:
```
⚠️  Could not reach GitHub (offline or rate-limited).
    Update via: /plugin install alo-labs/topgun  |  npx skills add alo-labs/topgun
```
STOP.

---

## Step 3: Compare Versions

Execute this canonical semver function verbatim:

```bash
semver_gt() {
  local IFS=.
  read -r -a va <<< "$1"; read -r -a vb <<< "$2"
  for i in 0 1 2; do
    local ai="${va[$i]:-0}" bi="${vb[$i]:-0}"
    if (( ai > bi )); then return 0; fi
    if (( ai < bi )); then return 1; fi
  done; return 1
}
```

| Condition | Output | Action |
|-----------|--------|--------|
| `INSTALLED == LATEST` | `✓ Already on v{X.Y.Z} — latest.` | STOP |
| `semver_gt "$INSTALLED" "$LATEST"` | `Dev build v{X.Y.Z} ahead of latest v{A.B.C}.` | STOP |
| `--check` flag AND update available | `Update available: v{X.Y.Z} → v{A.B.C}. Run /topgun-update to install.` | STOP |

---

## Step 4: Fetch Changelog and Confirm

```bash
curl -s -m 10 "https://raw.githubusercontent.com/alo-labs/topgun/refs/tags/v${LATEST_VERSION}/docs/CHANGELOG.md"
```

Extract entries newer than `INSTALLED_VERSION`. On failure: "Could not fetch changelog — proceeding."

Display:
```
━━━ TOPGUN ► UPDATE AVAILABLE ━━━
 Installed: v{X.Y.Z}   Latest: v{A.B.C}
 What's New
 ──────────────────────────────────
 {changelog entries}
 ──────────────────────────────────
 ⚠️  Clones new release into plugin cache; updates registry.
     ~/.topgun/ state, audit cache, and keychain tokens are preserved.
 💡 Official alternative: /plugin install alo-labs/topgun
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Ask: `Proceed with update to v{LATEST_VERSION}? A. Yes  B. No (cancel)` → B: STOP.

---

## Step 5: Clone the New Release

**5.1 Derive cache path:**

```bash
CACHE_ROOT=$(echo "$INSTALL_PATH" | sed "s|/topgun/[^/]*$||")
if [[ -z "$CACHE_ROOT" || "$CACHE_ROOT" == "$INSTALL_PATH" ]]; then
  CACHE_ROOT="$HOME/.claude/plugins/cache/alo-labs"
fi
NEW_CACHE="${CACHE_ROOT}/topgun/${LATEST_VERSION}"
[[ "$NEW_CACHE" == "$HOME/.claude/plugins/cache/"* ]] \
  || { echo "❌ Derived path outside expected prefix: $NEW_CACHE"; exit 1; }
```

**5.2 Clone:**

```bash
git clone --depth 1 --branch "v${LATEST_VERSION}" \
  https://github.com/alo-labs/topgun.git "$NEW_CACHE" 2>&1
```

On failure: `❌ Clone failed. Try: /plugin install alo-labs/topgun` → STOP.

**5.3 Security gate — show SHA before registry write:**

```bash
COMMIT_SHA=$(git -C "$NEW_CACHE" rev-parse HEAD)
SHORT_SHA="${COMMIT_SHA:0:12}"
```

Display: `⚠️ SHA: {COMMIT_SHA}  Verify at: github.com/alo-labs/topgun/releases/tag/v{LATEST_VERSION}`

Ask: `Install at commit {SHORT_SHA}? A. Yes  B. Cancel`

On cancel — clean up cloned dir then STOP:
```bash
[ -n "$NEW_CACHE" ] && [[ "$NEW_CACHE" == "$HOME/.claude/plugins/cache/"* ]] \
  && [ -d "$NEW_CACHE" ] && rm -rf "$NEW_CACHE"
```

---

## Step 6: Verify Integrity, then Update Registry

**6.1 Verify clone before touching registry:**

```bash
[ -f "${NEW_CACHE}/bin/topgun-tools.cjs" ]       || { echo "❌ Clone incomplete — bin/topgun-tools.cjs missing."; exit 1; }
[ -f "${NEW_CACHE}/skills/topgun/SKILL.md" ]     || { echo "❌ Clone incomplete — skills/topgun/SKILL.md missing."; exit 1; }
```

**6.2 Write to registry:**

```bash
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TMPFILE=$(mktemp)
jq --arg key "$TOPGUN_KEY" --arg version "$LATEST_VERSION" \
   --arg path "$NEW_CACHE" --arg sha "$COMMIT_SHA" --arg now "$NOW" \
   '.plugins[$key][0].version=$version | .plugins[$key][0].installPath=$path |
    .plugins[$key][0].lastUpdated=$now | .plugins[$key][0].gitCommitSha=$sha' \
   "$HOME/.claude/plugins/installed_plugins.json" > "$TMPFILE" \
   && mv "$TMPFILE" "$HOME/.claude/plugins/installed_plugins.json" \
   || { rm -f "$TMPFILE"; false; }
```

On failure: display path to `NEW_CACHE` and suggest `/plugin install alo-labs/topgun`. STOP.

**6.3 Purge old cache versions:**

After the registry write succeeds, delete all version directories under the TopGun cache root except the newly installed one:

```bash
TOPGUN_CACHE_DIR="${CACHE_ROOT}/topgun"
DELETED=()
while IFS= read -r -d '' old_dir; do
  if rm -rf "$old_dir"; then
    DELETED+=("$old_dir")
  else
    echo "⚠️ Could not delete $old_dir — remove manually."
  fi
done < <(find "$TOPGUN_CACHE_DIR" -mindepth 1 -maxdepth 1 -type d \
           ! -name "$LATEST_VERSION" -print0)
```

On success: deleted paths are collected in `DELETED` for display in Step 7.
On `rm` failure: warning is printed inline and the loop continues (non-fatal).

---

## Step 7: Re-initialize and Display Result

```bash
node "${NEW_CACHE}/bin/topgun-tools.cjs" init 2>/dev/null && echo "INIT_OK" || echo "INIT_SKIP"
```

Then display:
```
╔══════════════════════════════════════════════╗
║  TopGun Updated: v{OLD} → v{LATEST_VERSION}  ║
╚══════════════════════════════════════════════╝
⚠️  Restart Claude Desktop / Claude Code to activate.
Commit SHA: {COMMIT_SHA}
New cache:  {NEW_CACHE}
Cleaned up: {DELETED paths, or "none" if DELETED is empty}
~/.topgun/ state, audit cache, and keychain tokens unchanged.
🔗 https://github.com/alo-labs/topgun/releases/tag/v{LATEST_VERSION}
```
