#!/usr/bin/env bash
# test-topgun-update.sh — Unit tests for the bash/jq logic in skills/topgun-update/SKILL.md.
# Covers: registry lookup, semver comparison (verbatim from SKILL.md Step 3), cache-path
# derivation, stable current-alias handling, clean reinstall bootstrap, registry
# write-back, and rm -rf safety guard.
# Run: bash bin/test-topgun-update.sh  |  npm run test:update
set -euo pipefail

PASS=0; FAIL=0
pass()      { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail()      { echo "  FAIL: $1"; echo "        expected: $2"; echo "        got:      $3"; FAIL=$((FAIL+1)); }
assert_eq() { [ "$2" = "$3" ] && pass "$1" || fail "$1" "$2" "$3"; }

assert_file_exists() {
  local desc="$1" path="$2"
  if [[ -f "$path" ]]; then
    pass "$desc"
  else
    fail "$desc" "file exists" "missing: $path"
  fi
}

assert_file_absent() {
  local desc="$1" path="$2"
  if [[ ! -e "$path" ]]; then
    pass "$desc"
  else
    fail "$desc" "file absent" "present: $path"
  fi
}

assert_contains() {
  local desc="$1" needle="$2" file="$3"
  if grep -qF "$needle" "$file"; then
    pass "$desc"
  else
    fail "$desc" "contains [$needle]" "missing in $file"
  fi
}

assert_not_contains() {
  local desc="$1" needle="$2" file="$3"
  if ! grep -qF "$needle" "$file"; then
    pass "$desc"
  else
    fail "$desc" "does not contain [$needle]" "found in $file"
  fi
}

package_hook_trust_hash() {
  node - "$REPO_ROOT" <<'NODE'
const path = require('node:path');
const { CANONICAL_PACKAGE_PREFIX, collectTrustEntriesForSource } = require(path.join(process.argv[2], 'bin', 'topgun-hook-trust.cjs'));
const entries = collectTrustEntriesForSource(path.join(process.argv[2], 'hooks', 'hooks.json'), CANONICAL_PACKAGE_PREFIX);
if (entries.length === 0) {
  process.exit(1);
}
process.stdout.write(entries[0].digest);
NODE
}

config_trust_hash() {
  local config_path="$1" trust_key="$2"
  python3 - "$config_path" "$trust_key" <<'PY'
import pathlib
import re
import sys

config_path = pathlib.Path(sys.argv[1])
trust_key = sys.argv[2]
current_key = None

for line in config_path.read_text().splitlines():
    stripped = line.strip()
    match = re.match(r'^\[hooks\.state\."(.+)"\]$', stripped)
    if match:
        current_key = match.group(1)
        continue
    if current_key == trust_key and stripped.startswith('trusted_hash = '):
        hash_match = re.match(r'^trusted_hash = "(sha256:[0-9a-f]{64})"$', stripped)
        if hash_match:
            print(hash_match.group(1))
            sys.exit(0)
    if stripped.startswith('[') and not stripped.startswith('[hooks.state.'):
        current_key = None

sys.exit(1)
PY
}

bootstrap_cache_tree() {
  local source="$1" target="$2"
  if [[ ! -d "$target" ]]; then
    mkdir -p "$target"
    rsync -a --delete "${source%/}/" "${target}/"
  fi
}

refresh_current_alias() {
  local alias_path="$1" target_path="$2"
  python3 - "$alias_path" "$target_path" <<'PY'
import pathlib
import shutil
import sys

alias_path = pathlib.Path(sys.argv[1])
target_path = pathlib.Path(sys.argv[2])

if alias_path.exists() or alias_path.is_symlink():
    if alias_path.is_dir() and not alias_path.is_symlink():
        shutil.rmtree(alias_path)
    else:
        alias_path.unlink()

alias_path.parent.mkdir(parents=True, exist_ok=True)
alias_path.symlink_to(target_path)
PY
}

backup_path() {
  local source="$1" target="$2"
  if [[ -d "$source" ]]; then
    mkdir -p "$target"
    rsync -a --delete "${source%/}/" "${target}/"
  elif [[ -f "$source" || -L "$source" ]]; then
    mkdir -p "$(dirname "$target")"
    cp -a "$source" "$target"
  fi
}

FIXTURE_DIR=$(mktemp -d)
trap 'rm -rf "$FIXTURE_DIR"' EXIT
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Fixtures — versions (1.5.0, 1.6.0) are hypothetical update-flow values, not actual releases.
cat > "$FIXTURE_DIR/installed_plugins.json" << 'EOF'
{"plugins":{"silver-bullet@silver-bullet":[{"version":"0.25.0","installPath":"/home/user/.codex/plugins/cache/silver-bullet/silver-bullet/0.25.0"}],"topgun@alo-labs-codex":[{"version":"1.5.0","installPath":"/home/user/.codex/plugins/cache/alo-labs-codex/topgun/current","lastUpdated":"2026-04-25T00:00:00Z"}],"other-plugin@org":[{"version":"2.0.0","installPath":"/home/user/.codex/plugins/cache/org/other-plugin/2.0.0"}]}}
EOF
cat > "$FIXTURE_DIR/installed_plugins_no_topgun.json" << 'EOF'
{"plugins":{"silver-bullet@silver-bullet":[{"version":"0.25.0","installPath":"/home/user/.codex/plugins/cache/silver-bullet/silver-bullet/0.25.0"}]}}
EOF
cat > "$FIXTURE_DIR/installed_plugins_caps.json" << 'EOF'
{"plugins":{"TopGun@AloLabs":[{"version":"1.3.0","installPath":"/home/user/.codex/plugins/cache/AloLabs/TopGun/1.3.0"}]}}
EOF
cat > "$FIXTURE_DIR/installed_plugins_with_aliases.json" << 'EOF'
{"plugins":{"topgun@alo-labs":[{"version":"1.4.0","installPath":"/home/user/.codex/plugins/cache/alo-labs/topgun/1.4.0"}],"topgun@alo-labs-codex-local":[{"version":"1.4.1","installPath":"/home/user/.codex/plugins/cache/alo-labs-codex-local/topgun/1.4.1"}],"topgun@alo-labs-codex":[{"version":"1.5.0","installPath":"/home/user/.codex/plugins/cache/alo-labs-codex/topgun/current","lastUpdated":"2026-04-25T00:00:00Z"}],"silver-bullet@silver-bullet":[{"version":"0.25.0","installPath":"/home/user/.codex/plugins/cache/silver-bullet/silver-bullet/0.25.0"}]}}
EOF

# ---------------------------------------------------------------------------
echo ""; echo "=== SUITE 1: Registry lookup (Step 1 jq query) ==="
TOPGUN_KEY=$(jq -r 'if .plugins["topgun@alo-labs-codex"] then "topgun@alo-labs-codex" elif .plugins["topgun@alo-labs"] then "topgun@alo-labs" elif .plugins["topgun@alo-labs-codex-local"] then "topgun@alo-labs-codex-local" else empty end' "$FIXTURE_DIR/installed_plugins.json")
assert_eq "finds canonical topgun@alo-labs-codex key" "topgun@alo-labs-codex" "$TOPGUN_KEY"
INSTALLED_VERSION=$(jq -r --arg k "topgun@alo-labs-codex" '.plugins[$k][0].version//"unknown"' "$FIXTURE_DIR/installed_plugins.json")
assert_eq "extracts installed version" "1.5.0" "$INSTALLED_VERSION"
INSTALL_PATH=$(jq -r --arg k "topgun@alo-labs-codex" '.plugins[$k][0].installPath//""' "$FIXTURE_DIR/installed_plugins.json")
assert_eq "extracts installPath" "/home/user/.codex/plugins/cache/alo-labs-codex/topgun/current" "$INSTALL_PATH"
TOPGUN_KEY_MISSING=$(jq -r '.plugins|to_entries[]|select(.key|test("topgun";"i"))|.key' "$FIXTURE_DIR/installed_plugins_no_topgun.json"|head -1)
assert_eq "returns empty when not installed" "" "$TOPGUN_KEY_MISSING"
TOPGUN_KEY_CAPS=$(jq -r '.plugins|to_entries[]|select(.key|test("topgun";"i"))|.key' "$FIXTURE_DIR/installed_plugins_caps.json"|head -1)
assert_eq "case-insensitive match (TopGun@AloLabs)" "TopGun@AloLabs" "$TOPGUN_KEY_CAPS"

# ---------------------------------------------------------------------------
echo ""; echo "=== SUITE 2: Semver comparison — canonical function from SKILL.md Step 3 ==="
# NOTE: verbatim copy of the function embedded in SKILL.md Step 3.
# Tests must stay in sync with that canonical implementation.
# SAFETY: semver_gt returns exit 1 for "false". Always call it inside an `if` or
# `&&`/`||` guard — never standalone — or set -e will abort the script on a "false" result.
semver_gt() {
  local IFS=.
  read -r -a va <<< "$1"; read -r -a vb <<< "$2"
  for i in 0 1 2; do
    local ai="${va[$i]:-0}" bi="${vb[$i]:-0}"
    if (( ai > bi )); then return 0; fi
    if (( ai < bi )); then return 1; fi
  done; return 1
}
semver_eq() { [ "$1" = "$2" ]; }

if semver_gt "1.5.1" "1.5.0"; then pass "1.5.1 > 1.5.0 (patch)";       else fail "1.5.1 > 1.5.0 (patch)"  "true"  "false"; fi
if semver_gt "1.6.0" "1.5.0"; then pass "1.6.0 > 1.5.0 (minor)";       else fail "1.6.0 > 1.5.0 (minor)"  "true"  "false"; fi
if semver_gt "2.0.0" "1.5.0"; then pass "2.0.0 > 1.5.0 (major)";       else fail "2.0.0 > 1.5.0 (major)"  "true"  "false"; fi
if ! semver_gt "1.5.0" "1.5.0"; then pass "1.5.0 not > 1.5.0 (equal)"; else fail "equal not gt"            "false" "true";  fi
if semver_gt "1.5.1" "1.5.0" && ! semver_gt "1.5.0" "1.5.1"; then
  pass "dev build: installed(1.5.1)>latest(1.5.0) AND NOT latest>installed"
else fail "dev build direction" "installed>latest AND NOT latest>installed" "wrong"; fi
if semver_eq "1.5.0" "1.5.0" && ! semver_gt "1.5.0" "1.5.0"; then
  pass "up-to-date: semver_eq true AND semver_gt false"
else fail "up-to-date detection" "eq=true,gt=false" "unexpected"; fi

# ---------------------------------------------------------------------------
echo ""; echo "=== SUITE 3: Cache path derivation (Step 5.1) ==="
# NOTE: derive_cache_root mirrors the sed + guard logic in SKILL.md Step 5.1.
# Trailing-slash installPath (e.g. ".../1.5.0/") causes sed to no-op and returns "",
# which correctly triggers the hardcoded fallback in SKILL.md — safe for standard installs.
derive_cache_root() {
  local result; result=$(echo "$1"|sed "s|/topgun/[^/]*$||")
  result="${result/.Codex/.codex}"
  [[ -z "$result" || "$result" == "$1" ]] && echo "" || echo "$result"
}
ROOT=$(derive_cache_root "/home/user/.Codex/plugins/cache/alo-labs-codex/topgun/current")
assert_eq "derives cache root from alo-labs-codex path" "/home/user/.codex/plugins/cache/alo-labs-codex" "$ROOT"
assert_eq "new cache path formed correctly" "/home/user/.codex/plugins/cache/alo-labs-codex/topgun/1.6.0" "${ROOT}/topgun/1.6.0"
ROOT2=$(derive_cache_root "/Users/alice/.codex/plugins/cache/my-org/topgun/1.4.0")
assert_eq "derives cache root with custom org" "/Users/alice/.codex/plugins/cache/my-org" "$ROOT2"
ROOT_BAD=$(derive_cache_root "/home/user/.codex/plugins/cache/alo-labs-codex/topgun")
assert_eq "no version segment → empty (triggers fallback)" "" "$ROOT_BAD"
ROOT_UNREL=$(derive_cache_root "/some/random/path/1.5.0")
assert_eq "unrelated path → empty (triggers fallback)" "" "$ROOT_UNREL"
ROOT_SLASH=$(derive_cache_root "/home/user/.codex/plugins/cache/alo-labs-codex/topgun/1.5.0/")
assert_eq "trailing slash → empty (triggers fallback)" "" "$ROOT_SLASH"

# ---------------------------------------------------------------------------
echo ""; echo "=== SUITE 4: Registry write-back (Step 6.2) ==="
UPDATED=$(jq \
  --arg key "topgun@alo-labs-codex" --arg version "1.6.0" \
  --arg path "/home/user/.codex/plugins/cache/alo-labs-codex/topgun/current" \
  --arg sha "abc1234def5678abc1234def5678abc1234def56" \
  --arg now "2026-04-26T10:00:00Z" \
  'del(.plugins["topgun@alo-labs"], .plugins["topgun@alo-labs-codex-local"]) |
   .plugins[$key][0].version=$version|.plugins[$key][0].installPath=$path|
   .plugins[$key][0].lastUpdated=$now|.plugins[$key][0].gitCommitSha=$sha' \
  "$FIXTURE_DIR/installed_plugins_with_aliases.json")
assert_eq "version updated to 1.6.0"    "1.6.0"   "$(echo "$UPDATED"|jq -r '.plugins["topgun@alo-labs-codex"][0].version')"
assert_eq "installPath updated"         "/home/user/.codex/plugins/cache/alo-labs-codex/topgun/current" \
                                        "$(echo "$UPDATED"|jq -r '.plugins["topgun@alo-labs-codex"][0].installPath')"
assert_eq "gitCommitSha written"        "abc1234def5678abc1234def5678abc1234def56" \
                                        "$(echo "$UPDATED"|jq -r '.plugins["topgun@alo-labs-codex"][0].gitCommitSha')"
assert_eq "lastUpdated written"         "2026-04-26T10:00:00Z" \
                                        "$(echo "$UPDATED"|jq -r '.plugins["topgun@alo-labs-codex"][0].lastUpdated')"
assert_eq "other plugin not touched"    "0.25.0" \
                                        "$(echo "$UPDATED"|jq -r '.plugins["silver-bullet@silver-bullet"][0].version')"
assert_eq "legacy alias removed"        "false"  "$(echo "$UPDATED" | jq -r 'has("topgun@alo-labs")')"
assert_eq "legacy local alias removed"  "false"  "$(echo "$UPDATED" | jq -r 'has("topgun@alo-labs-codex-local")')"

# ---------------------------------------------------------------------------
echo ""; echo "=== SUITE 5: rm -rf safety guard (Step 5.3 cancel / Step 5.4 install) ==="
# NOTE: safe_rm takes a mock_home parameter to avoid touching the real $HOME during tests.
# The production guard in SKILL.md uses the literal $HOME variable inline — same 3-part logic:
#   [ -n ] && [[ path == $HOME/.codex/plugins/cache/* ]] && [ -d ] && rm -rf
# If the production guard changes, update safe_rm here to match.
FAKE_HOME="$FIXTURE_DIR/home"
mkdir -p "$FAKE_HOME/.codex/plugins/cache/alo-labs-codex/topgun/1.6.0"
mkdir -p "$FAKE_HOME/.codex/plugins/cache/alo-labs-codex/topgun/1.5.0"
mkdir -p "$FAKE_HOME/tmp/decoy"
safe_rm() {
  local target="$1" mock_home="$2"
  [ -n "$target" ] && [[ "$target" == "$mock_home/.codex/plugins/cache/"* ]] \
    && [ -d "$target" ] && rm -rf "$target" && echo "DELETED" || echo "BLOCKED"
}
assert_eq "valid cache path is deleted"        "DELETED"  "$(safe_rm "$FAKE_HOME/.codex/plugins/cache/alo-labs-codex/topgun/1.6.0" "$FAKE_HOME")"
assert_eq "path outside prefix is blocked"     "BLOCKED"  "$(safe_rm "$FAKE_HOME/tmp/decoy" "$FAKE_HOME")"
[ -d "$FAKE_HOME/tmp/decoy" ] && pass "decoy dir still exists after block" || fail "decoy still exists" "exists" "deleted"
assert_eq "empty NEW_CACHE is blocked"         "BLOCKED"  "$(safe_rm "" "$FAKE_HOME")"
assert_eq "non-existent dir in prefix blocked" "BLOCKED"  "$(safe_rm "$FAKE_HOME/.codex/plugins/cache/alo-labs-codex/topgun/9.9.9" "$FAKE_HOME")"

# ---------------------------------------------------------------------------
echo ""; echo "=== SUITE 6: Clean reinstall bootstrap and stable current alias ==="
REINSTALL_HOME="$FIXTURE_DIR/reinstall-home"
SNAPSHOT_ROOT="$FIXTURE_DIR/local-snapshot"
LEGACY_BACKUP_ROOT="$FIXTURE_DIR/legacy-backup"
LEGACY_SHADOW_HOME="$FIXTURE_DIR/legacy-shadow-home"
NEW_VERSION="1.6.0"
TOPGUN_CACHE_ROOT="$REINSTALL_HOME/.codex/plugins/cache/alo-labs-codex/topgun"
LEGACY_TOPGUN_CACHE_ROOT="$LEGACY_SHADOW_HOME/.Codex/plugins/cache/alo-labs-codex/topgun"
CURRENT_ALIAS="$TOPGUN_CACHE_ROOT/current"
NEW_CACHE="$TOPGUN_CACHE_ROOT/$NEW_VERSION"
LOWER_REGISTRY="$REINSTALL_HOME/.codex/plugins/installed_plugins.json"
LOWER_CONFIG="$REINSTALL_HOME/.codex/config.toml"
LOWER_HOOKS="$REINSTALL_HOME/.codex/hooks.json"
LEGACY_REGISTRY="$LEGACY_SHADOW_HOME/.Codex/plugins/installed_plugins.json"
LEGACY_CONFIG="$LEGACY_SHADOW_HOME/.Codex/config.toml"
LEGACY_HOOKS="$LEGACY_SHADOW_HOME/.Codex/hooks.json"

mkdir -p "$SNAPSHOT_ROOT/bin" "$SNAPSHOT_ROOT/hooks" "$SNAPSHOT_ROOT/skills/topgun" "$SNAPSHOT_ROOT/.codex-plugin" "$SNAPSHOT_ROOT/.agents/plugins"
cp "$REPO_ROOT/bin/topgun-tools.cjs" "$SNAPSHOT_ROOT/bin/topgun-tools.cjs"
cp "$REPO_ROOT/hooks/hooks.json" "$SNAPSHOT_ROOT/hooks/hooks.json"
cp "$REPO_ROOT/skills/topgun/SKILL.md" "$SNAPSHOT_ROOT/skills/topgun/SKILL.md"
cp "$REPO_ROOT/.codex-plugin/plugin.json" "$SNAPSHOT_ROOT/.codex-plugin/plugin.json"
cp "$REPO_ROOT/.agents/plugins/marketplace.json" "$SNAPSHOT_ROOT/.agents/plugins/marketplace.json"

mkdir -p "$REINSTALL_HOME/.codex/plugins/cache/alo-labs-codex/topgun/1.5.0"
mkdir -p "$REINSTALL_HOME/.codex/plugins"
mkdir -p "$REINSTALL_HOME/.codex"
ln -sfn "1.5.0" "$CURRENT_ALIAS"
mkdir -p "$LEGACY_SHADOW_HOME/.Codex/plugins/cache/alo-labs-codex/topgun/1.5.0"
ln -sfn "1.5.0" "$LEGACY_TOPGUN_CACHE_ROOT/current"
cat > "$LOWER_REGISTRY" << 'EOF'
{"plugins":{"topgun@alo-labs":[{"version":"1.4.0","installPath":"/home/user/.codex/plugins/cache/alo-labs/topgun/1.4.0"}],"topgun@alo-labs-codex-local":[{"version":"1.4.1","installPath":"/home/user/.codex/plugins/cache/alo-labs-codex-local/topgun/1.4.1"}],"topgun@alo-labs-codex":[{"version":"1.5.0","installPath":"/home/user/.codex/plugins/cache/alo-labs-codex/topgun/current","lastUpdated":"2026-04-25T00:00:00Z"}],"other-plugin@org":[{"version":"2.0.0","installPath":"/home/user/.codex/plugins/cache/org/other-plugin/2.0.0"}]}}
EOF
cat > "$LEGACY_REGISTRY" << 'EOF'
{"plugins":{"topgun@alo-labs":[{"version":"1.4.0","installPath":"/home/user/.Codex/plugins/cache/alo-labs/topgun/1.4.0"}],"topgun@alo-labs-codex-local":[{"version":"1.4.1","installPath":"/home/user/.Codex/plugins/cache/alo-labs-codex-local/topgun/1.4.1"}],"topgun@alo-labs-codex":[{"version":"1.5.0","installPath":"/home/user/.Codex/plugins/cache/alo-labs-codex/topgun/current","lastUpdated":"2026-04-25T00:00:00Z"}],"other-plugin@org":[{"version":"2.0.0","installPath":"/home/user/.Codex/plugins/cache/org/other-plugin/2.0.0"}]}}
EOF
cat > "$LOWER_HOOKS" << 'EOF'
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"/Users/example/.claude/plugins/cache/alo-labs/topgun/topgun/1.3.0/bin/hooks/validate-partials.sh\"",
            "timeout": 10
          },
          {
            "type": "command",
            "command": "node \"/tmp/preserve.js\"",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
EOF
cat > "$LEGACY_HOOKS" << 'EOF'
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"/Users/example/.claude/plugins/cache/alo-labs/topgun/topgun/1.3.0/bin/hooks/validate-partials.sh\"",
            "timeout": 10
          },
          {
            "type": "command",
            "command": "node \"/tmp/preserve.js\"",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
EOF
cat > "$LOWER_CONFIG" << 'EOF'
[hooks.state]
[hooks.state."topgun@alo-labs-codex-local:hooks/hooks.json:pre_tool_use:0:0"]
trusted_hash = "sha256:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
[hooks.state."topgun@alo-labs-codex:hooks/hooks.json:pre_tool_use:0:0"]
trusted_hash = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"

[plugins."other-plugin@org"]
enabled = true
EOF
cat > "$LEGACY_CONFIG" << 'EOF'
[hooks.state]
[hooks.state."topgun@alo-labs-codex-local:hooks/hooks.json:pre_tool_use:0:0"]
trusted_hash = "sha256:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
[hooks.state."topgun@alo-labs-codex:hooks/hooks.json:pre_tool_use:0:0"]
trusted_hash = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"

[plugins."other-plugin@org"]
enabled = true
EOF

backup_path "$LEGACY_REGISTRY" "$LEGACY_BACKUP_ROOT/plugins/installed_plugins.json"
backup_path "$LEGACY_CONFIG" "$LEGACY_BACKUP_ROOT/config.toml"
backup_path "$LEGACY_HOOKS" "$LEGACY_BACKUP_ROOT/hooks.json"
backup_path "$LEGACY_TOPGUN_CACHE_ROOT" "$LEGACY_BACKUP_ROOT/plugins/cache/alo-labs-codex/topgun"
rm -f "$LEGACY_REGISTRY" "$LEGACY_CONFIG" "$LEGACY_HOOKS"
rm -rf "$LEGACY_TOPGUN_CACHE_ROOT"

for reg in "$LOWER_REGISTRY"; do
  tmp="$FIXTURE_DIR/$(basename "$reg").cleanup.tmp"
  jq 'del(.plugins["topgun@alo-labs"], .plugins["topgun@alo-labs-codex-local"], .plugins["topgun@alo-labs-codex"])' "$reg" > "$tmp"
  mv "$tmp" "$reg"
done
rm -rf "$TOPGUN_CACHE_ROOT"

assert_file_exists "legacy registry backup exists" "$LEGACY_BACKUP_ROOT/plugins/installed_plugins.json"
assert_file_exists "legacy config backup exists" "$LEGACY_BACKUP_ROOT/config.toml"
assert_file_exists "legacy hooks backup exists" "$LEGACY_BACKUP_ROOT/hooks.json"
assert_eq "legacy cache backup current alias preserved" "yes" "$(if [[ -L "$LEGACY_BACKUP_ROOT/plugins/cache/alo-labs-codex/topgun/current" ]]; then echo yes; else echo no; fi)"
assert_file_absent "legacy uppercase registry removed" "$LEGACY_REGISTRY"
assert_file_absent "legacy uppercase config removed" "$LEGACY_CONFIG"
assert_file_absent "legacy uppercase hooks removed" "$LEGACY_HOOKS"
assert_file_absent "legacy uppercase cache removed" "$LEGACY_TOPGUN_CACHE_ROOT"
assert_file_absent "clean uninstall removes lowercase versioned cache root" "$TOPGUN_CACHE_ROOT"
assert_not_contains "clean uninstall removes canonical plugin-id residue from active registry" 'topgun@alo-labs-codex' "$LOWER_REGISTRY"
assert_not_contains "clean uninstall removes stale alias residue from active registry" 'topgun@alo-labs-codex-local' "$LOWER_REGISTRY"

bootstrap_cache_tree "$SNAPSHOT_ROOT" "$NEW_CACHE"
refresh_current_alias "$CURRENT_ALIAS" "$NEW_CACHE"

tmp="$FIXTURE_DIR/$(basename "$LOWER_REGISTRY").restore.tmp"
jq --arg key "topgun@alo-labs-codex" \
   --arg version "$NEW_VERSION" \
   --arg path "$CURRENT_ALIAS" \
   --arg now "2026-04-26T10:00:00Z" \
   '.plugins[$key] = [{"version":$version,"installPath":$path,"lastUpdated":$now}]' \
   "$LOWER_REGISTRY" > "$tmp"
mv "$tmp" "$LOWER_REGISTRY"

HOME="$REINSTALL_HOME" node "$REPO_ROOT/bin/topgun-tools.cjs" init >/dev/null

assert_file_exists "bootstrapped versioned cache exists" "$NEW_CACHE/bin/topgun-tools.cjs"
assert_file_exists "bootstrapped hook manifest exists" "$NEW_CACHE/hooks/hooks.json"
assert_eq "current alias is a symlink" "yes" "$(if [[ -L "$CURRENT_ALIAS" ]]; then echo yes; else echo no; fi)"
assert_file_exists "current alias exposes bootstrapped executable" "$CURRENT_ALIAS/bin/topgun-tools.cjs"
assert_eq "canonical registry points at stable current alias" "$CURRENT_ALIAS" "$(jq -r '.plugins["topgun@alo-labs-codex"][0].installPath' "$LOWER_REGISTRY")"
assert_eq "stale alias removed after reinstall" "false" "$(jq -r 'has("topgun@alo-labs")' "$LOWER_REGISTRY")"
assert_eq "stale local alias removed after reinstall" "false" "$(jq -r 'has("topgun@alo-labs-codex-local")' "$LOWER_REGISTRY")"
assert_contains "bootstrapped cache keeps Codex hook root" 'CODEX_PLUGIN_ROOT' "$NEW_CACHE/hooks/hooks.json"
assert_not_contains "bootstrapped cache drops Claude hook root" 'CLAUDE_PLUGIN_ROOT' "$NEW_CACHE/hooks/hooks.json"

PACKAGE_HOOK_TRUST_HASH="$(package_hook_trust_hash)"
TOPGUN_HOOK_TRUST_KEY='topgun@alo-labs-codex:hooks/hooks.json:pre_tool_use:0:0'
assert_eq "canonical trust hash refreshed in Codex config" "$PACKAGE_HOOK_TRUST_HASH" "$(config_trust_hash "$LOWER_CONFIG" "$TOPGUN_HOOK_TRUST_KEY")"
assert_not_contains "stale trust alias removed from codex config" 'topgun@alo-labs-codex-local' "$LOWER_CONFIG"
if [[ -e "$LEGACY_CONFIG" ]]; then
  assert_not_contains "legacy uppercase config does not retain TopGun trust" 'topgun@alo-labs-codex' "$LEGACY_CONFIG"
fi
if [[ -e "$LEGACY_HOOKS" ]]; then
  assert_not_contains "legacy uppercase hooks does not retain TopGun hook payloads" 'validate-partials.sh' "$LEGACY_HOOKS"
fi

# ---------------------------------------------------------------------------
echo ""; echo "=== RESULTS ==="; echo "  Passed: $PASS"; echo "  Failed: $FAIL"; echo ""
if [ "$FAIL" -gt 0 ]; then echo "TESTS FAILED — $FAIL assertion(s) did not pass."; exit 1; fi
echo "ALL TESTS PASSED"; exit 0
