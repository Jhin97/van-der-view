# Leader runbook

Operator notes for the always-on **leader** Claude Code session that orchestrates `van-der-view`.

## Identity

The leader needs a GitHub identity with permission to comment on issues, review PRs, label/unlabel, and merge into `main`. Two options:

1. **Dedicated bot account** *(recommended)* — create a new GitHub user (e.g. `vdv-leader-bot`), add it as a collaborator with **Maintain** access, and generate a fine-grained PAT scoped to this repo only. Cleaner audit trail (`git log` and review history clearly attribute leader actions).
2. **Maintainer's PAT** *(faster bootstrap)* — use a fine-grained PAT on an existing maintainer account. Quicker, but leader actions are indistinguishable from that maintainer's manual work.

The `Co-Authored-By` trailer in squash-merge messages should always include the leader identity so individual commits are also auditable, regardless of which option is used.

### Required token scopes (fine-grained PAT)

Repository permissions on `van-der-view` only:
- **Actions**: read & write (to re-run workflows / observe status checks)
- **Contents**: read & write (to push CHANGELOG commits to `main`)
- **Issues**: read & write (triage, comment, close, label)
- **Pull requests**: read & write (review, comment, label, merge)
- **Metadata**: read (always required)

Do not grant `Administration` — the leader should not be able to change branch protection or repo settings.

## Starting the leader

```
cd /path/to/van-der-view
export GH_TOKEN=<the-leader-token>     # gh CLI picks this up automatically
claude
```

Inside the Claude Code session:

```
/leader-start
```

That command verifies `gh auth status`, the token's scopes, and the presence of the orchestration files, then launches `/loop /leader-tick` with dynamic pacing (short interval when PRs are in flight, long when idle).

The session must stay open. Run it on a machine that doesn't sleep, or under a process supervisor.

## Pausing

- **Per PR**: a maintainer adds the `leader:hold` label. The leader will continue to comment on that PR but will not merge it. Removing the label resumes normal behavior on the next tick.
- **Globally — quick**: in the leader's terminal, hit Ctrl-C to stop the `/loop`. Restart with `/leader-start`.
- **Globally — declarative**: set the GitHub repo variable `LEADER_PAUSED=true` (Settings → Variables). The leader checks this at the start of each tick and exits early when set. This is the right option when you want a paused state to survive restarts.

## What to check if the leader misbehaves

- **Leader never comments on a new PR** — confirm `/loop` is still running in its terminal (it may have exited on an error). Confirm `gh auth status` shows the leader identity.
- **Leader merges things it shouldn't** — first add `leader:hold` to anything in flight, then audit. Most likely cause: a PR has `leader:auto-merge` set inappropriately, or required CI checks are not actually marked "required" in branch protection (so the leader's "all checks pass" condition is satisfied even when checks are missing).
- **Leader posts duplicate comments** — it should be idempotent (each comment kind is only posted once per PR state); if you see duplicates, that's a bug in `leader-tick.md` worth filing.
- **Leader ate context budget** — the loop should be self-throttling; if it's not, lengthen the idle interval inside `leader-tick.md` or restart with a longer cadence (`/loop 30m /leader-tick`).

## Bootstrapping a fresh repo

1. `bash scripts/bootstrap-labels.sh` — creates / updates the full label set via `gh label create --force`.
2. Configure branch protection on `main` in repo settings:
   - Require a pull request before merging.
   - Require status checks to pass (mark them required once they exist — until then, the leader will refuse to auto-merge anyway).
   - Require linear history.
   - Allow the leader identity to merge.
3. Open a tracker issue titled "Leader status" and pin it. The leader will edit a comment on this issue with each daily digest.
4. Start the leader (`/leader-start`).
