#!/usr/bin/env bash
# test-topgun-update.sh — Unit tests for the bash/jq logic in skills/topgun-update/SKILL.md.
# Covers: registry lookup, semver comparison (verbatim from SKILL.md Step 3), cache-path
# derivation, registry write-back, and rm -rf safety guard.
# Run: bash bin/test-topgun-update.sh  |  npm run test:update
set -euo pipefail

PASS=0; FAIL=0
pass()      { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail()      { echo "  FAIL: $1"; echo "        expected: $2"; echo "        got:      $3"; FAIL=$((FAIL+1)); }
assert_eq() { [ "$2" = "$3" ] && pass "$1" || fail "$1" "$2" "$3"; }

FIXTURE_DIR=$(mktemp -d)
trap 'rm -rf "$FIXTURE_DIR"' EXIT

# Fixtures
cat > "$FIXTURE_DIR/installed_plugins.json" << 'EOF'
{"plugins":{"silver-bullet@silver-bullet":[{"version":"0.25.0","installPath":"/home/user/.claude/plugins/cache/silver-bullet/silver-bullet/0.25.0"}],"topgun@alo-labs":[{"version":"1.5.0","installPath":"/home/user/.claude/plugins/cache/alo-labs/topgun/1.5.0","lastUpdated":"2026-04-25T00:00:00Z"}],"other-plugin@org":[{"version":"2.0.0","installPath":"/home/user/.claude/plugins/cache/org/other-plugin/2.0.0"}]}}
EOF
cat > "$FIXTURE_DIR/installed_plugins_no_topgun.json" << 'EOF'
{"plugins":{"silver-bullet@silver-bullet":[{"version":"0.25.0","installPath":"/home/user/.claude/plugins/cache/silver-bullet/silver-bullet/0.25.0"}]}}
EOF
cat > "$FIXTURE_DIR/installed_plugins_caps.json" << 'EOF'
{"plugins":{"TopGun@AloLabs":[{"version":"1.3.0","installPath":"/home/user/.claude/plugins/cache/AloLabs/TopGun/1.3.0"}]}}
EOF

# ---------------------------------------------------------------------------
echo ""; echo "=== SUITE 1: Registry lookup (Step 1 jq query) ==="
TOPGUN_KEY=$(jq -r '.plugins|to_entries[]|select(.key|test("topgun";"i"))|.key' "$FIXTURE_DIR/installed_plugins.json"|head -1)
assert_eq "finds topgun@alo-labs key" "topgun@alo-labs" "$TOPGUN_KEY"
INSTALLED_VERSION=$(jq -r --arg k "topgun@alo-labs" '.plugins[$k][0].version//"unknown"' "$FIXTURE_DIR/installed_plugins.json")
assert_eq "extracts installed version" "1.5.0" "$INSTALLED_VERSION"
INSTALL_PATH=$(jq -r --arg k "topgun@alo-labs" '.plugins[$k][0].installPath//""' "$FIXTURE_DIR/installed_plugins.json")
assert_eq "extracts installPath" "/home/user/.claude/plugins/cache/alo-labs/topgun/1.5.0" "$INSTALL_PATH"
TOPGUN_KEY_MISSING=$(jq -r '.plugins|to_entries[]|select(.key|test("topgun";"i"))|.key' "$FIXTURE_DIR/installed_plugins_no_topgun.json"|head -1)
assert_eq "returns empty when not installed" "" "$TOPGUN_KEY_MISSING"
TOPGUN_KEY_CAPS=$(jq -r '.plugins|to_entries[]|select(.key|test("topgun";"i"))|.key' "$FIXTURE_DIR/installed_plugins_caps.json"|head -1)
assert_eq "case-insensitive match (TopGun@AloLabs)" "TopGun@AloLabs" "$TOPGUN_KEY_CAPS"

# ---------------------------------------------------------------------------
echo ""; echo "=== SUITE 2: Semver comparison — canonical function from SKILL.md Step 3 ==="
# NOTE: verbatim copy of the function embedded in SKILL.md Step 3.
# Tests must stay in sync with that canonical implementation.
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
derive_cache_root() {
  local result; result=$(echo "$1"|sed "s|/topgun/[^/]*$||")
  [[ -z "$result" || "$result" == "$1" ]] && echo "" || echo "$result"
}
ROOT=$(derive_cache_root "/home/user/.claude/plugins/cache/alo-labs/topgun/1.5.0")
assert_eq "derives cache root from alo-labs path" "/home/user/.claude/plugins/cache/alo-labs" "$ROOT"
assert_eq "new cache path formed correctly" "/home/user/.claude/plugins/cache/alo-labs/topgun/1.6.0" "${ROOT}/topgun/1.6.0"
ROOT2=$(derive_cache_root "/Users/alice/.claude/plugins/cache/my-org/topgun/1.4.0")
assert_eq "derives cache root with custom org" "/Users/alice/.claude/plugins/cache/my-org" "$ROOT2"
ROOT_BAD=$(derive_cache_root "/home/user/.claude/plugins/cache/alo-labs/topgun")
assert_eq "no version segment → empty (triggers fallback)" "" "$ROOT_BAD"
ROOT_UNREL=$(derive_cache_root "/some/random/path/1.5.0")
assert_eq "unrelated path → empty (triggers fallback)" "" "$ROOT_UNREL"

# ---------------------------------------------------------------------------
echo ""; echo "=== SUITE 4: Registry write-back (Step 6.2) ==="
UPDATED=$(jq \
  --arg key "topgun@alo-labs" --arg version "1.6.0" \
  --arg path "/home/user/.claude/plugins/cache/alo-labs/topgun/1.6.0" \
  --arg sha "abc1234def5678abc1234def5678abc1234def56" \
  --arg now "2026-04-26T10:00:00Z" \
  '.plugins[$key][0].version=$version|.plugins[$key][0].installPath=$path|
   .plugins[$key][0].lastUpdated=$now|.plugins[$key][0].gitCommitSha=$sha' \
  "$FIXTURE_DIR/installed_plugins.json")
assert_eq "version updated to 1.6.0"    "1.6.0"   "$(echo "$UPDATED"|jq -r '.plugins["topgun@alo-labs"][0].version')"
assert_eq "installPath updated"         "/home/user/.claude/plugins/cache/alo-labs/topgun/1.6.0" \
                                        "$(echo "$UPDATED"|jq -r '.plugins["topgun@alo-labs"][0].installPath')"
assert_eq "gitCommitSha written"        "abc1234def5678abc1234def5678abc1234def56" \
                                        "$(echo "$UPDATED"|jq -r '.plugins["topgun@alo-labs"][0].gitCommitSha')"
assert_eq "lastUpdated written"         "2026-04-26T10:00:00Z" \
                                        "$(echo "$UPDATED"|jq -r '.plugins["topgun@alo-labs"][0].lastUpdated')"
assert_eq "other plugin not touched"    "0.25.0" \
                                        "$(echo "$UPDATED"|jq -r '.plugins["silver-bullet@silver-bullet"][0].version')"

# ---------------------------------------------------------------------------
echo ""; echo "=== SUITE 5: rm -rf safety guard (Step 5.4) ==="
FAKE_HOME="$FIXTURE_DIR/home"
mkdir -p "$FAKE_HOME/.claude/plugins/cache/alo-labs/topgun/1.6.0"
mkdir -p "$FAKE_HOME/.claude/plugins/cache/alo-labs/topgun/1.5.0"
mkdir -p "$FAKE_HOME/tmp/decoy"
safe_rm() {
  local target="$1" mock_home="$2"
  [ -n "$target" ] && [[ "$target" == "$mock_home/.claude/plugins/cache/"* ]] \
    && [ -d "$target" ] && rm -rf "$target" && echo "DELETED" || echo "BLOCKED"
}
assert_eq "valid cache path is deleted"        "DELETED"  "$(safe_rm "$FAKE_HOME/.claude/plugins/cache/alo-labs/topgun/1.6.0" "$FAKE_HOME")"
assert_eq "path outside prefix is blocked"     "BLOCKED"  "$(safe_rm "$FAKE_HOME/tmp/decoy" "$FAKE_HOME")"
[ -d "$FAKE_HOME/tmp/decoy" ] && pass "decoy dir still exists after block" || fail "decoy still exists" "exists" "deleted"
assert_eq "empty NEW_CACHE is blocked"         "BLOCKED"  "$(safe_rm "" "$FAKE_HOME")"
assert_eq "non-existent dir in prefix blocked" "BLOCKED"  "$(safe_rm "$FAKE_HOME/.claude/plugins/cache/alo-labs/topgun/9.9.9" "$FAKE_HOME")"

# ---------------------------------------------------------------------------
echo ""; echo "=== RESULTS ==="; echo "  Passed: $PASS"; echo "  Failed: $FAIL"; echo ""
if [ "$FAIL" -gt 0 ]; then echo "TESTS FAILED — $FAIL assertion(s) did not pass."; exit 1; fi
echo "ALL TESTS PASSED"; exit 0
