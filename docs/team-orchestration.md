# Team orchestration

This document describes how work flows through `van-der-view`. It is the human-readable companion to the leader agent's automation.

## Roles

- **Member** — a human contributor with a GitHub account. Picks up issues that match their team, implements them, opens PRs.
- **Member's local subagent team** — whatever subagents the member spawns inside their own Claude Code (suggested: plan → explore → implement → self-review). Not centrally enforced.
- **Leader** — one always-on Claude Code session run by a maintainer (or under a dedicated bot account). Does no feature work; only orchestration. See `leader-runbook.md`.

## Lifecycle of a feature

```
┌────────────────────────────────────────────────────────────────────────┐
│  1. project-plan MR is merged                                          │
│     └─► leader runs /ingest-project-plan                               │
│         └─► creates issues #N… with team:* + priority:* + type:feature │
├────────────────────────────────────────────────────────────────────────┤
│  2. member self-assigns by commenting on the issue                     │
│     └─► creates branch <team>/<n>-<slug>                               │
│     └─► implements, commits, opens PR with `Closes #N`                 │
├────────────────────────────────────────────────────────────────────────┤
│  3. on each leader tick (every few minutes):                           │
│       a. sanity checks (Closes link, Changelog section, branch name)   │
│       b. observes CI status via `gh pr checks`                         │
│       c. spawns review subagent → posts comments / approve / changes   │
│       d. handles conflicts → adds status:needs-rebase                  │
│       e. handles staleness → adds status:stale                         │
│       f. if all merge gates met → squash-merges, deletes branch        │
├────────────────────────────────────────────────────────────────────────┤
│  4. post-merge bookkeeping:                                            │
│     └─► appends Changelog line to CHANGELOG.md on main                 │
│     └─► closes the linked issue with summary                           │
│     └─► comments on any issue listing this one in `Depends on:`        │
└────────────────────────────────────────────────────────────────────────┘
```

## Filing an issue

Use one of the issue templates (`Feature` or `Bug`). The form will require:
- A title describing the outcome.
- Acceptance criteria as a checkbox list. The leader reads these when reviewing PRs.
- A target team (becomes a `team:*` label).
- Priority.
- Optional `Depends on: #M, #K` references — the leader uses these to manage blocked/unblocked status.

If you skip the templates and open a blank issue, the leader will add `status:needs-triage` and ask the author to pick a team.

## Opening a PR

1. Branch name starts with the team prefix and issue number: `frontend/42-viewer-rotation`.
2. PR title uses Conventional Commits: `feat(viewer): add rotation gizmo`.
3. PR body comes from the template and must include:
   - `Closes #42` (or whichever issue this resolves).
   - **What & why** — short prose.
   - **Testing** — what you ran, what you checked.
   - **Changelog** — one Keep-a-Changelog line. The leader appends this to `CHANGELOG.md` on merge.
4. If you want the leader to merge alone (without waiting for a human approver), add the `leader:auto-merge` label. The leader will still require all required CI checks to pass.
5. If you want the leader to **never** merge this PR (e.g. it touches infrastructure you want to land manually), add `leader:hold`.

## Merge gates (what the leader checks)

The leader merges only when **all** are true:

- `Closes #N` is present and the linked issue exists with a `team:*` label.
- The Changelog section is filled.
- All required CI checks pass and there is at least one check (no checks = no auto-merge).
- The leader's review = approve.
- No unresolved review threads.
- Either `leader:auto-merge` is set **or** at least one human reviewer has also approved.
- `leader:hold` is **not** set.
- Branch is mergeable (no conflicts).

Failing any one of these results in a focused comment from the leader explaining what's missing, not a merge.

## Test policy

The leader is stack-agnostic: it never runs tests itself, only **observes** the GitHub status checks attached to a PR. This means the project-plan MR (which will introduce the stack) is also responsible for introducing the CI workflows that produce those checks. Until that happens, every PR will be flagged "no CI configured — requires human review" and the leader will not auto-merge.

## Distribution and triage

Beyond per-PR review, the leader also:

- **Triages** unlabeled issues by asking the author to pick a team and adding `status:needs-triage`.
- **Promotes** issues with team + priority + acceptance criteria to `status:ready`.
- **Watches dependencies** — when an issue's blockers all close, removes `status:blocked` and posts an "Unblocked by #N" comment.
- **Nudges** stalled in-progress issues that have had no commits/PR after a few days.
- **Posts a daily digest** on a pinned tracker issue: open PRs by team, blocked work, stalled assignments, queue depth.

## Pausing the leader

- Per-PR pause: add the `leader:hold` label. The leader will continue to comment but will not merge.
- Global pause: stop the `/loop` running in the leader's Claude Code session, or set the `LEADER_PAUSED=true` repo variable (the leader checks this at the top of each tick).
