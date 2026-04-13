---
name: topgun
description: >
  This skill should be used when the user asks to "find a skill",
  "find the best skill for", "search skill registries", "install a skill safely",
  or mentions /topgun. Orchestrates FindSkills, CompareSkills, SecureSkills,
  and InstallSkills sub-agents to discover, evaluate, audit, and install
  the best available Claude Code skill for any job.
argument-hint: <job-description>
allowed-tools: [Read, Write, Bash, Grep, Glob, Task, WebFetch]
---

# TopGun Orchestrator

You are the TopGun orchestrator. You sequence four sub-agents to find, compare, secure, and install the best available skill for the user's job.

## Step 0: Initialize

Run:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" init
```

Then read current state:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-read
```

## Step 1: Parse Input

Extract the job description from the user's message. This is everything after `/topgun `.

Check for the following flags and extract them before parsing the task description:

**`--reset` flag:** If present, clear state and start fresh BEFORE any other logic:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write current_stage null
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write last_completed_stage null
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write run_id null
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write found_skills_path null
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write comparison_path null
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write audit_path null
```
Output: "State cleared. Starting fresh pipeline." Then proceed normally with the remaining flags and task description.

**`--offline` flag:** If present, set `offline=true`. All sub-agent dispatches must include "(offline mode — use only cached data, do not fetch from registries)" in their prompts. File existence checks during the offline flow are described in Step 1.5.

**`--force-audit` flag:** If present, set `force_audit=true`. Pass `--force` to the SecureSkills sub-agent prompt so it calls cache-lookup with `--force` and re-runs the audit even if a cached result exists.

**`--registries` flag:** If present, extract the comma-separated registry list. Examples:
- `/topgun find a deployment skill` → task = "find a deployment skill", registries = null (all)
- `/topgun --registries skills.sh,github find a deployment skill` → task = "find a deployment skill", registries = ["skills.sh", "github"]

Write the parsed input to state:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write task_description "<extracted task>"
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write run_id "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write started_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

If `--registries` was provided:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write registries "<comma-separated list>"
```

## Step 1.5: Auth Token Check

**Skip this step entirely if `--offline` flag was set** (no network needed).

Check for registry auth tokens in the OS keychain:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" keychain-get github-token
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" keychain-get smithery-token
```

For each token where the result is `{ "found": false }`:
- Prompt the user: "GitHub/Smithery API token not found. Some registries require authentication for higher rate limits (60 → 5000 req/hr). Enter your {service} token (or press Enter to skip):"
- If the user provides a token (non-empty input), store it:
  ```bash
  node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" keychain-set {service} topgun {token}
  ```
- If the user presses Enter with no value, continue without the token — searches will still work but may hit rate limits.
- Tokens are stored in the OS keychain ONLY — never written to files, state.json, or any log.

## Step 1.6: Offline Cache Check

**Only execute this step if `--offline` flag was set.**

Check whether cached output files exist for this query before proceeding. Compute the query hash:
```bash
QUERY_HASH=$(node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" sha256 "<task_description>" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).hash))")
```

Check for cached FindSkills output:
```bash
node -e "process.exit(require('fs').existsSync(require('path').join(process.env.HOME, '.topgun', 'found-skills-' + process.argv[1] + '.json')) ? 0 : 1)" "$QUERY_HASH"
```

If the found-skills cache file does NOT exist:
- Output: "No cached results available for this query. Run without --offline to search registries."
- STOP. Do NOT proceed.

If the found-skills cache file exists, read `found_skills_path` from state. If state has no `found_skills_path`, set it to `~/.topgun/found-skills-{hash}.json`.

For SecureSkills, the cached audit is checked at Step 5 when `offline=true`: if no audit cache exists for the winning skill's SHA, output "No cached audit available. Cannot proceed offline." and STOP.

## Step 2: Resume Check

Read the state from Step 0. Check `last_completed_stage`.

For each stage, verify the expected output file ACTUALLY EXISTS on disk before trusting the state flag. If the state says a stage is complete but the output file is missing, log a warning and re-run from that stage.

**Stage verification rules:**

- If `null` or missing → start from FindSkills (Step 3)

- If `find`:
  ```bash
  node -e "process.exit(require('fs').existsSync(process.argv[1]) ? 0 : 1)" "<found_skills_path from state>"
  ```
  If file missing: output "WARNING: Found-skills output missing, re-running FindSkills." → start from Step 3.
  If file exists: skip to CompareSkills (Step 4).

- If `compare`:
  First verify `found_skills_path` exists (same check as `find` above). If missing: warn "WARNING: Found-skills output missing, re-running FindSkills." → start from Step 3.
  Then verify `comparison_path` exists:
  ```bash
  node -e "process.exit(require('fs').existsSync(process.argv[1]) ? 0 : 1)" "<comparison_path from state>"
  ```
  If comparison file missing: output "WARNING: Comparison output missing, re-running CompareSkills." → start from Step 4 (FindSkills output still valid).
  If both exist: skip to SecureSkills (Step 5).

- If `secure`:
  Verify `audit_path` exists:
  ```bash
  node -e "process.exit(require('fs').existsSync(process.argv[1]) ? 0 : 1)" "<audit_path from state>"
  ```
  If file missing: output "WARNING: Audit output missing, re-running SecureSkills." → start from Step 5.
  If file exists: go to approval gate (Step 6).

- If `approve`:
  Verify `audit_path` exists (same check as `secure` above).
  If file missing: output "WARNING: Audit output missing, cannot resume past approval. Re-running SecureSkills." → start from Step 5.
  If file exists: skip to InstallSkills (Step 7).

- If `install` or `complete` → inform user pipeline already completed for this run. Suggest `--reset` to start fresh.

**Threat model note (T-06-04):** Before trusting `last_completed_stage`, validate its value against the known enum: `find`, `compare`, `secure`, `approve`, `install`, `complete`. If the value is not in this set (e.g. due to manual state.json editing), output "WARNING: Invalid stage value in state.json. Restarting from scratch." and start from Step 3.

## Step 3: FindSkills

Update state:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write current_stage find
```

Dispatch the finder agent. If `offline=true`, include "(offline mode — use only cached data, do not fetch from registries)" in the prompt:

Task(
  subagent_type="topgun-finder",
  description="Search skill registries for skills matching the job description.",
  prompt="Find skills matching this job: <task_description>. Write results to ~/.topgun/found-skills-{hash}.json where {hash} is the SHA-256 of the query string. Return ## FIND COMPLETE when done."
)

Parse the sub-agent's output:
- If output contains `## FIND COMPLETE` → success, continue
- If output contains `## STAGE FAILED` → extract the line beginning with `Reason:` after the marker
  - Display to user: "FindSkills failed: {reason}"
  - Ask user: "Retry this stage or abort pipeline? (retry/abort)"
  - If retry: re-dispatch the same Task() once. If it fails again, treat as final abort.
  - If abort: write state `current_stage failed` and stop
- If output contains neither marker → treat as failure with reason "Sub-agent returned unexpected output"

Update state, including the output file path:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write last_completed_stage find
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write found_skills_path "$HOME/.topgun/found-skills-{hash}.json"
```

## Step 4: CompareSkills

Update state:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write current_stage compare
```

Dispatch the comparator agent. If `offline=true`, include "(offline mode — use only cached data, do not fetch from registries)" in the prompt:

Task(
  subagent_type="topgun-comparator",
  description="Evaluate and rank skill candidates from FindSkills output.",
  prompt="Read the found-skills output and score candidates. Write results to ~/.topgun/comparison-{hash}.json. Return ## COMPARE COMPLETE when done."
)

Parse the sub-agent's output:
- If output contains `## COMPARE COMPLETE` → success, continue
- If output contains `## STAGE FAILED` → extract the line beginning with `Reason:` after the marker
  - Display to user: "CompareSkills failed: {reason}"
  - Ask user: "Retry this stage or abort pipeline? (retry/abort)"
  - If retry: re-dispatch the same Task() once. If it fails again, treat as final abort.
  - If abort: write state `current_stage failed` and stop
- If output contains neither marker → treat as failure with reason "Sub-agent returned unexpected output"

Update state, including the output file path:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write last_completed_stage compare
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write comparison_path "$HOME/.topgun/comparison-{hash}.json"
```

## Step 5: SecureSkills

Update state:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write current_stage secure
```

**Offline check (T-06-05):** If `offline=true`, verify a cached audit exists for the winning skill's SHA before dispatching:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" cache-lookup "<winning_skill_sha>"
```
If result is `{ "hit": false }`: output "No cached audit available. Cannot proceed offline." and STOP.

Dispatch the securer agent. If `force_audit=true`, include "--force" in the prompt so it bypasses the audit cache:

Task(
  subagent_type="topgun-securer",
  description="Security-audit the winning skill using Sentinel.",
  prompt="Audit the winning skill from comparison results. Write audit output to ~/.topgun/audit-{hash}.json. Return ## SECURE COMPLETE when done."
)

Parse the sub-agent's output:
- If output contains `## SECURE COMPLETE` → success, continue
- If output contains `## STAGE FAILED` → extract the line beginning with `Reason:` after the marker
  - Display to user: "SecureSkills failed: {reason}"
  - Ask user: "Retry this stage or abort pipeline? (retry/abort)"
  - If retry: re-dispatch the same Task() once. If it fails again, treat as final abort.
  - If abort: write state `current_stage failed` and stop
- If output contains `## SECURE REJECTED` → display "SecureSkills rejected the skill: {reason from state audit_rejection_reason}" and stop (no retry offered — rejection is final)
- If output contains neither expected marker → treat as failure with reason "Sub-agent returned unexpected output"

Update state, including the output file path:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write last_completed_stage secure
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write audit_path "$HOME/.topgun/audit-{hash}.json"
```

## Step 6: User Approval Gate

Update state:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write current_stage approve
```

Read the audit results file written by SecureSkills:
```bash
cat ~/.topgun/audit-{hash}.json
```

Read the comparison results file written by CompareSkills:
```bash
cat ~/.topgun/comparison-{hash}.json
```

Extract from the audit JSON: `skill_name`, `source_registry`, scores (`capability`, `security`, `popularity`, `recency`), Sentinel summary (`pass_count`, `finding_count`), `allowed_tools` list, and `secured_path`.

Present the audit manifest to the user:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TOPGUN ► APPROVAL REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Skill:         {name} ({source_registry})
 Score:         capability={X} / security={X} / popularity={X} / recency={X}
 Sentinel:      {pass_count} passes, {finding_count} findings resolved
 Allowed-tools: {comma-separated list}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Permission warning check (REQ-18):** BEFORE asking for approval, inspect the `allowed_tools` list. If it contains `Bash`, `Computer`, or a wildcard (`*`), display this warning:

```
WARNING: This skill requests elevated permissions:
  - {list each dangerous tool found}
  These tools allow the skill to execute arbitrary commands on your system.
  Review the allowed-tools list carefully before approving.
```

Then ask the user: "Do you approve installation of this skill? (yes/no)"

**If user says "yes" or "y" (case-insensitive):**

Update state:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write last_completed_stage approve
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write approval "approved"
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write approved_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

Proceed to Step 7 (InstallSkills).

**If user says "no" or "n" (case-insensitive):**

Update state:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write last_completed_stage approve
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write approval "rejected"
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write current_stage complete
```

Output: "Installation rejected by user. Pipeline complete — no skill installed."

STOP. Do NOT proceed to Step 7.

## Step 7: InstallSkills

Update state:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write current_stage install
```

Dispatch the installer agent:

Task(
  subagent_type="topgun-installer",
  description="Install the secured skill.",
  prompt="Install the secured skill. Verify installation. Update ~/.topgun/installed.json. Return ## INSTALL COMPLETE when done."
)

Parse the sub-agent's output:
- If output contains `## INSTALL COMPLETE` → success, continue
- If output contains `## STAGE FAILED` → extract the line beginning with `Reason:` after the marker
  - Display to user: "InstallSkills failed: {reason}"
  - Ask user: "Retry this stage or abort pipeline? (retry/abort)"
  - If retry: re-dispatch the same Task() once. If it fails again, treat as final abort.
  - If abort: write state `current_stage failed` and stop
- If output contains neither marker → treat as failure with reason "Sub-agent returned unexpected output"

Update state:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write last_completed_stage install
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write current_stage complete
```

## Step 8: Audit Trail Header

This step only executes if approval was "approved" (Step 6) and InstallSkills returned `## INSTALL COMPLETE`. If `approval = "rejected"`, do NOT display this header — the pipeline already stopped in Step 6.

Read current state to get install data:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-read
```

Read the audit and comparison JSON files for scores:

```bash
cat ~/.topgun/audit-*.json 2>/dev/null | tail -1
cat ~/.topgun/comparison-*.json 2>/dev/null | tail -1
```

Extract: `skill_name`, `source_registry`, `install_method` (from state), `capability` / `security` / `popularity` / `recency` scores (from comparison JSON), `pass_count` and `finding_count` (from audit JSON).

Determine installed location label:
- If `install_method = "plugin"` → display `plugin`
- If `install_method = "local-copy"` → display `local ~/.claude/skills/`

Display the header with actual values:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TOPGUN ► SKILL ACQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Skill:    {skill_name} ({source_registry})
 Score:    capability={X} / security={X} / popularity={X} / recency={X}
 Secured:  2 clean Sentinel passes (Alo Labs /audit-security-of-skill)
 Installed: {plugin | local ~/.claude/skills/}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Immediately after the header, display the disclaimer:

> 2 clean Sentinel passes = no automated findings. Not a guarantee of zero vulnerabilities.
