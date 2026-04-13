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
- If `secure` → skip to approval gate (Step 6 — not yet implemented, skip to Step 7)
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

**Not implemented in Phase 1.** Skip to Step 7. Mark as completed:
```bash
node "$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs" state-write last_completed_stage approve
```

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

After all stages complete, display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TOPGUN ► SKILL ACQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Skill:    [name + source registry from comparison results]
 Score:    [capability / security / popularity / recency]
 Secured:  2 clean Sentinel passes (Alo Labs /audit-security-of-skill)
 Installed: [plugin | local ~/.claude/skills/]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Followed by the disclaimer: "2 clean Sentinel passes = no automated findings. Not a guarantee of zero vulnerabilities."

**Note:** In Phase 1 (stub mode), populate the header with placeholder values since sub-agents return stub data.
