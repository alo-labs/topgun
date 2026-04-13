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

Check for `--registries` flag. If present, extract the comma-separated registry list. Examples:
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

## Step 2: Resume Check

Read the state from Step 0. Check `last_completed_stage`:
- If `null` or missing → start from FindSkills (Step 3)
- If `find` → skip to CompareSkills (Step 4)
- If `compare` → skip to SecureSkills (Step 5)
- If `secure` → go to approval gate (Step 6)
- If `approve` → skip to InstallSkills (Step 7)
- If `install` or `complete` → inform user pipeline already completed for this run. Suggest `--reset` to start fresh.

## Step 3: FindSkills

Update state:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write current_stage find
```

Dispatch the finder agent:

Task(
  subagent_type="topgun-finder",
  description="Search skill registries for skills matching the job description.",
  prompt="Find skills matching this job: <task_description>. Write results to ~/.topgun/found-skills-{hash}.json where {hash} is the SHA-256 of the query string. Return ## FIND COMPLETE when done."
)

After the agent returns, verify the output contains `## FIND COMPLETE`. If not, report an error and stop.

Update state:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write last_completed_stage find
```

## Step 4: CompareSkills

Update state:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write current_stage compare
```

Dispatch the comparator agent:

Task(
  subagent_type="topgun-comparator",
  description="Evaluate and rank skill candidates from FindSkills output.",
  prompt="Read the found-skills output and score candidates. Write results to ~/.topgun/comparison-{hash}.json. Return ## COMPARE COMPLETE when done."
)

After the agent returns, verify the output contains `## COMPARE COMPLETE`. If not, report an error and stop.

Update state:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write last_completed_stage compare
```

## Step 5: SecureSkills

Update state:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write current_stage secure
```

Dispatch the securer agent:

Task(
  subagent_type="topgun-securer",
  description="Security-audit the winning skill using Sentinel.",
  prompt="Audit the winning skill from comparison results. Write audit output to ~/.topgun/audit-{hash}.json. Return ## SECURE COMPLETE when done."
)

After the agent returns, verify the output contains `## SECURE COMPLETE`. If not, report an error and stop.

Update state:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write last_completed_stage secure
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

After the agent returns, verify the output contains `## INSTALL COMPLETE`. If not, report an error and stop.

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
