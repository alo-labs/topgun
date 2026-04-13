---
phase: bugfix-marketplace-schema
reviewed: 2026-04-14T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - .claude-plugin/marketplace.json
  - tests/smoke.test.cjs
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Bug Fix Review: marketplace.json Schema + Smoke Tests

**Reviewed:** 2026-04-14
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

The rewritten `.claude-plugin/marketplace.json` now correctly uses the Claude Desktop marketplace schema (`owner` / `metadata` / `plugins[]`). Cross-checking against both known-good reference marketplaces (`alo-labs` and `superpowers-marketplace`) confirms the top-level shape is correct and the single plugin entry is well-formed.

Two warnings were found: one is a field value mismatch between the top-level `name` and the installed marketplace path convention, and one is a missing optional-but-observed `ref` field that may matter for release pinning. Two info items relate to test coverage gaps and a stale adapter count assertion.

---

## Warnings

### WR-01: Top-level `name` does not match the installed directory name

**File:** `.claude-plugin/marketplace.json:2`
**Issue:** The top-level `name` field is `"topgun"`, but Claude Desktop derives the marketplace's installation directory from this field. Both reference marketplaces use a name that matches their GitHub org/repo identity (`"alo-labs"`, `"superpowers-marketplace"`). If a user has already installed the old marketplace under a different name, Claude Desktop may create a second entry rather than upgrading the existing one, or may fail to locate the marketplace on re-install. The name `"topgun"` is also the same as the single plugin entry's `name` (line 13), which creates ambiguity between the marketplace identifier and the plugin identifier.

**Fix:** Align the top-level `name` with the GitHub org identity to match convention and avoid collision with the plugin name:
```json
{
  "name": "alo-labs-topgun",
  ...
}
```
Or use `"alo-labs"` if this marketplace is intended to replace / extend the existing `alo-labs` marketplace. Confirm against whatever name was used before the schema rewrite.

---

### WR-02: Plugin `source.url` points to a branch-less git URL — no release pin

**File:** `.claude-plugin/marketplace.json:16`
**Issue:** The `source.url` is `"https://github.com/alo-labs/topgun.git"` with no `ref` field. The superpowers reference marketplace demonstrates optional `ref` usage (e.g., `"ref": "dev"`) for pinning to a branch. Without a `ref`, Claude Desktop will clone the default branch (typically `main`). This is not a bug today, but it means the installed plugin always tracks `HEAD` of `main`, which can break users on incompatible future commits. More critically, the `metadata.version` and `plugins[0].version` fields both say `"1.1.0"` but there is no tag or ref enforcing that version — the actual checked-out code may diverge.

**Fix:** Add a `ref` pointing to the `v1.1.0` tag so the declared version and the installed code are consistent:
```json
"source": {
  "source": "url",
  "url": "https://github.com/alo-labs/topgun.git",
  "ref": "v1.1.0"
}
```

---

## Info

### IN-01: Test does not validate `strict` field present on plugin entries

**File:** `tests/smoke.test.cjs:99-110`
**Issue:** Both reference marketplaces include `"strict": true` on every plugin entry. The test at line 99 validates `name`, `source`, `description`, and `version` but does not check for `strict`. If `strict` were accidentally dropped from a future entry, no test would catch it.

**Fix:** Add an assertion inside the per-plugin loop:
```javascript
assert.ok(typeof plugin.strict === 'boolean', `plugin.strict must be a boolean`);
```

---

### IN-02: Adapter count assertion is mismatched with the EXPECTED_ADAPTERS list

**File:** `tests/smoke.test.cjs:211-229`
**Issue:** `EXPECTED_ADAPTERS` lists 11 files (line 198-210), but the test on line 226 asserts `files.length === 18`. If the directory contains exactly 18 files, the explicit list is missing 7 of them. If it contains 11, the count assertion will fail. One of these must be wrong. Either the `EXPECTED_ADAPTERS` array is incomplete (7 adapters are not individually tested for existence) or the count should be 11.

**Fix:** Either expand `EXPECTED_ADAPTERS` to include all 18 adapter filenames so individual existence tests cover them all, or correct the count assertion to match the actual number. Leaving the list and count out of sync means 7 adapters are never individually verified — a missing adapter would only be caught by the count, not by a named existence test.

---

_Reviewed: 2026-04-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
