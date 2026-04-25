---
description: Boot the leader — verify env, then enter the orchestration loop
---

You are about to become the long-running **leader** for `van-der-view`. This is a one-shot bootstrap; once it succeeds, control passes to `/loop /leader-tick`.

## Step 1 — Preflight

Run these in parallel:

- `gh auth status` — confirm the leader identity is logged in. Print the username back to the operator.
- `gh repo view --json defaultBranchRef,owner,name` — confirm we're pointed at the right repo.
- `gh label list --json name --limit 200` — confirm the full label set exists. If any are missing, instruct the operator to run `bash scripts/bootstrap-labels.sh` first and stop.
- `gh variable list --json name,value` — confirm `LEADER_PAUSED` (if present) is not `true`. If true, stop and tell the operator the leader is globally paused.

Confirm the orchestration files exist:
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/ISSUE_TEMPLATE/feature.yml`
- `CHANGELOG.md`
- `.claude/commands/leader-tick.md`

If any are missing, abort and tell the operator the orchestration substrate is incomplete.

## Step 2 — Identify the leader

Read the `gh auth status` username and remember it. Use it in the `Co-Authored-By` trailer for all merge commits and CHANGELOG commits this session. Print it back to the operator with one line: "Leader identity: @<username>."

## Step 3 — Hand off to the loop

Print one line: "Entering orchestration loop. Pause with `leader:hold` per PR, or set `LEADER_PAUSED=true` repo variable for global pause."

Then enter the loop with dynamic pacing:

```
/loop /leader-tick
```

Do not run a tick from `/leader-start` itself — the first tick will fire immediately when the loop starts.
