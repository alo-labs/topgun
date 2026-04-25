---
phase: 07-distribution-marketplace
reviewed: 2026-04-25T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - skills/topgun-update/SKILL.md
  - bin/test-topgun-update.sh
  - package.json
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-04-25
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Three files were reviewed: the `topgun-update` skill definition (a prose+bash instruction document consumed by Claude agents), its dedicated unit test script, and the root `package.json`.

The skill logic is well-structured with deliberate safety gates (path prefix check before `rm -rf`, SHA confirmation before registry write, integrity verification before touching the registry). No critical security vulnerabilities were found. However, four warnings were identified — the most impactful being a non-namespaced `/tmp` file path that can cause registry corruption under concurrent execution, and a test-to-production coupling gap where the `safe_rm` helper in tests uses a different signature than the guard in the actual skill, making the tests capable of diverging silently from production behavior.

---

## Warnings

### WR-01: Non-namespaced `/tmp` file risks registry corruption under concurrent updates

**File:** `skills/topgun-update/SKILL.md:177`
**Issue:** The registry write-back uses a hardcoded intermediate file at `/tmp/topgun-plugins-update.json`. On a shared system or if the update command is triggered concurrently (e.g., two Claude sessions running simultaneously), two processes can write to the same temp path and one will overwrite the other's jq output before the `mv` completes, silently corrupting `installed_plugins.json`.
**Fix:**
```bash
TMPFILE=$(mktemp /tmp/topgun-plugins-update.XXXXXX.json)
jq ... "$HOME/.claude/plugins/installed_plugins.json" > "$TMPFILE" \
  && mv "$TMPFILE" "$HOME/.claude/plugins/installed_plugins.json"
```
Using `mktemp` ensures a unique, race-free temp file. The `.json` suffix is advisory; `mktemp` with a suffix requires a `--suffix` flag on GNU or the trailing template suffix approach shown above.

---

### WR-02: `safe_rm` test helper diverges from production guard signature

**File:** `bin/test-topgun-update.sh:108-117`
**Issue:** The test's `safe_rm` function accepts `(target, mock_home)` — the home directory is a parameter. The production SKILL.md guard (Step 5.3) hardcodes `$HOME` inline. If anyone updates the SKILL.md guard (e.g., adds an additional condition or renames the variable), the tests will continue to pass against the old parameterized helper while the production code silently loses protection. The tests don't actually execute the production shell fragment — they test a re-implemented equivalent.
**Fix:** Add a comment in both files explicitly naming the coupling:
```bash
# test-topgun-update.sh, Suite 5:
# safe_rm() mirrors the guard in SKILL.md Step 5.3 verbatim (except $HOME → $mock_home).
# If you change the production guard, update this function and vice versa.
```
Consider extracting the guard into a shared sourced function if the skill ever becomes a real shell script.

---

### WR-03: Trailing-slash edge case in cache path derivation

**File:** `skills/topgun-update/SKILL.md:123`
**Issue:** The sed pattern `s|/topgun/[^/]*$||` strips the version segment from `INSTALL_PATH`. If the plugin system ever records a trailing slash in `installPath` (e.g., `/path/alo-labs/topgun/1.5.0/`), the `$` anchor won't match after the trailing slash and the substitution silently no-ops, leaving `CACHE_ROOT` equal to the full original path. The subsequent check `[[ -z "$CACHE_ROOT" || "$CACHE_ROOT" == "$INSTALL_PATH" ]]` catches the equal-to-original case and triggers the fallback — so this won't cause a crash — but the fallback silently uses `$HOME/.claude/plugins/cache/alo-labs` regardless of the actual organization, which may be wrong for non-standard installs.

The test suite (Suite 3) tests only paths without trailing slashes, so this edge case is not covered.
**Fix:**
```bash
# Strip optional trailing slash before derivation
INSTALL_PATH_NORMALIZED="${INSTALL_PATH%/}"
CACHE_ROOT=$(echo "$INSTALL_PATH_NORMALIZED" | sed "s|/topgun/[^/]*$||")
```
Add a corresponding test case:
```bash
ROOT_TRAILING=$(derive_cache_root "/home/user/.claude/plugins/cache/alo-labs/topgun/1.5.0/")
assert_eq "trailing slash handled" "/home/user/.claude/plugins/cache/alo-labs" "$ROOT_TRAILING"
```

---

### WR-04: `set -euo pipefail` creates silent abort risk for future `semver_gt` callers

**File:** `bin/test-topgun-update.sh:6,44-52`
**Issue:** The script runs under `set -euo pipefail`. The `semver_gt` function returns exit code 1 when the first argument is not greater than the second. Under `set -e`, calling `semver_gt` outside of an `if`/`&&`/`||` conditional context would cause the script to abort immediately without printing a `FAIL` line or incrementing `$FAIL`. All current call sites use `if semver_gt ...`, which is safe. However, this is a latent trap: a future test author who writes `semver_gt "$A" "$B"; result=$?` would cause the script to silently exit on a false result rather than reporting the failure.
**Fix:** Document the constraint prominently above the function definition:
```bash
# IMPORTANT: semver_gt returns 1 (false) for "not greater than".
# Under set -e, ALWAYS call it inside: if semver_gt ...; then ... fi
# Never call it standalone — the script will abort on a false return.
semver_gt() { ... }
```

---

## Info

### IN-01: Step 5.3/5.4 label mismatch between SKILL.md and test comments

**File:** `bin/test-topgun-update.sh:103` / `skills/topgun-update/SKILL.md` (Step 5)
**Issue:** The test suite labels Suite 5 as "Step 5.4" in the comment (`rm -rf safety guard (Step 5.4)`), but SKILL.md only defines sub-steps 5.1, 5.2, and 5.3. There is no Step 5.4 in the skill document. The cancel-cleanup guard lives in Step 5.3.
**Fix:** Update the test comment to reference Step 5.3:
```bash
echo "=== SUITE 5: rm -rf safety guard (Step 5.3 — cancel cleanup) ==="
```

---

### IN-02: Registry lookup tested with decomposed jq vs. SKILL.md's single-pipeline expression

**File:** `bin/test-topgun-update.sh:29-38`
**Issue:** SKILL.md Step 1 extracts key, version, and installPath in one jq pipeline producing tab-separated output. The tests run three separate `jq -r --arg k ...` invocations on the same file. The tests validate equivalent logic but not the exact expression. A typo in the single-pipeline query (e.g., wrong field name) would not be caught.
**Fix:** Consider adding one test that runs the exact SKILL.md pipeline and verifies the full tab-separated output:
```bash
FULL_LINE=$(jq -r '.plugins | to_entries[]
  | select(.key | test("topgun"; "i"))
  | "\(.key)\t\(.value[0].version // "unknown")\t\(.value[0].installPath // "")"' \
  "$FIXTURE_DIR/installed_plugins.json" | head -1)
assert_eq "single-pipeline produces tab-separated line" \
  "topgun@alo-labs	1.5.0	/home/user/.claude/plugins/cache/alo-labs/topgun/1.5.0" \
  "$FULL_LINE"
```

---

### IN-03: `package.json` missing `engines` field

**File:** `package.json`
**Issue:** `npm run test` uses `node --test` which requires Node.js 18+. Without an `engines` field, users on older Node versions will get a cryptic error rather than a helpful message.
**Fix:**
```json
"engines": {
  "node": ">=18.0.0"
}
```

---

### IN-04: `package.json` version significantly behind test fixture versions

**File:** `package.json:3` / `bin/test-topgun-update.sh:18`
**Issue:** `package.json` declares `"version": "1.1.2"` but the test fixture hardcodes installed version `1.5.0` and SKILL.md examples reference `1.5.x`. If `package.json` version is used anywhere programmatically (e.g., in a release script or a future `--version` flag), this mismatch will produce incorrect output.
**Fix:** Align `package.json` version with the actual current release, or add a comment explaining why they are intentionally decoupled.

---

### IN-05: `curl` timeout asymmetry between Step 2 (30s) and Step 4 (10s)

**File:** `skills/topgun-update/SKILL.md:55,95`
**Issue:** The GitHub releases API call uses `-m 30` but the changelog fetch uses `-m 10`. On slow connections the changelog fetch may time out unnecessarily, falling through to "Could not fetch changelog — proceeding." This is not a bug (the fallback is handled gracefully) but may cause confusing UX where the update proceeds without showing the user what changed.
**Fix:** Normalize both timeouts to 20s, or raise the changelog timeout to 30s:
```bash
curl -s -m 30 "https://raw.githubusercontent.com/alo-labs/topgun/refs/tags/v${LATEST_VERSION}/docs/CHANGELOG.md"
```

---

_Reviewed: 2026-04-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
