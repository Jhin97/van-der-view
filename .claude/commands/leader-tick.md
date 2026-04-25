---
description: One orchestration tick — triage issues, distribute work, review/merge open PRs, post bookkeeping
---

You are the **leader** for `van-der-view`. This command runs once per `/loop` cycle. Be terse — this loop runs many times. Do not narrate; act.

## Step 0 — Pause check

Read repo variable `LEADER_PAUSED` via `gh variable list --json name,value`. If set to `true`, exit immediately with a single line: `paused`.

## Step 1 — Triage issues

```
gh issue list --state open --limit 100 --json number,title,labels,body,createdAt
```

For each open issue:

- **Missing `team:*` label** → if no `status:needs-triage` already, add it and post:
  > Hi! I'm the orchestrator. Please add a `team:*` label so this gets routed to the right group. See [team-orchestration.md](../docs/team-orchestration.md).
  Skip further checks on this issue this tick.
- **Has `team:*` + `priority:*` + a non-empty Acceptance Criteria section, no `status:*` label** → add `status:ready`.
- **Has `Depends on: #N, #M, ...` in body** → if all listed issues are closed, remove `status:blocked` (if set) and comment `Unblocked by ${closed_issues}.` Add `status:ready` if not already present.
- **`status:in-progress` for >5 days with no commits on the matching `<team>/<n>-…` branch** → post a polite check-in: "Still on this? Add `leader:hold` if you'd like me to stop nudging."

Idempotency rule: never post the same kind of comment twice on the same issue. Before posting, fetch existing comments and look for the leader's marker line (use a hidden HTML comment on each post: `<!-- leader: <kind> -->`).

## Step 2 — Process open PRs

```
gh pr list --state open --json number,title,body,labels,headRefName,isDraft,mergeable,reviewDecision,statusCheckRollup,author --limit 100
```

For each non-draft PR, run the **Per-PR subroutine** below.

## Per-PR subroutine

### 2a. Sanity checks — fail fast

Apply each, posting one focused comment + `gh pr review --request-changes` *only if* the equivalent change-request comment is not already there:

| Check | If missing |
|---|---|
| Body contains `Closes #<n>` and the issue exists | Request changes: "Please add `Closes #<issue>` so I can link this PR to its issue." |
| Linked issue has a `team:*` label | Comment (don't block): "Linked issue is missing a `team:*` label." |
| Branch name starts with `<team>/<n>-` matching the linked issue's team | Comment (warning, don't block): "Branch prefix doesn't match the linked issue's team — convention is `<team>/<n>-<slug>`." |
| Body has a non-empty `## Changelog` section with at least one Added/Changed/Fixed/Removed line | Request changes: "Please fill the Changelog section in the PR template — I append it to `CHANGELOG.md` on merge." |

If the PR fails any required check, **do not** proceed to review or merge this PR this tick.

### 2b. CI status

Read `statusCheckRollup`:
- `SUCCESS` and ≥1 check exists → continue.
- `FAILURE` → fetch failing check names; post (idempotently) a focused comment: "CI failing on: `<check name>` — see <run URL>." Do not auto-merge.
- `PENDING` → skip merge this tick; check again next tick.
- **Empty / no checks** → comment once: "No CI checks are configured on this PR. I cannot verify correctness — this PR requires human review and a manual merge for now." Do not auto-merge regardless of any labels.

### 2c. Conflicts and staleness

- `mergeable: CONFLICTING` → add `status:needs-rebase`, post (idempotent) comment naming the conflicting paths if you can fetch them via `gh pr diff` failure output.
- Last commit > 7 days old and no `status:stale` → add `status:stale`, ping the author.

### 2d. Substantive review

Spawn an Explore subagent with this prompt (paraphrase):

> Review the diff for PR #N. Acceptance criteria from issue #M are: <list>. Repo conventions are in `CLAUDE.md`. Identify: (a) any acceptance criterion not satisfied, (b) any clear bug, (c) any violation of CLAUDE.md conventions. Be specific — file:line references. Do not nitpick style. Return a JSON array of findings: `[{file, line, severity: "blocker"|"comment", message}]`.

Translate the findings into `gh pr review` calls:

- Any `blocker` → `gh pr review --request-changes -b "<summary>"` plus `gh pr review --comment` for each finding with `--body` and the file/line.
- All `comment` (or no findings) → `gh pr review --approve -b "Acceptance criteria look met. CI green."`

Only post a fresh review if your prior review's state is older than the latest commit on the PR (so we don't re-approve on every tick).

### 2e. Merge decision

Auto-merge **only if all** are true:

1. All required status checks pass and ≥1 check exists.
2. Leader's most recent review is `APPROVED`.
3. `reviewDecision` is `APPROVED` (no unresolved blocking reviews).
4. PR has label `leader:auto-merge` **or** `reviewDecision == APPROVED` from a non-leader human reviewer.
5. PR does **not** have label `leader:hold`.
6. `mergeable: MERGEABLE`.

If all hold:

```
gh pr merge <N> --squash --delete-branch \
  --subject "<conventional-commit-title>" \
  --body "$(cat <<EOF
Closes #<linked-issue>

<optional 1-line summary>

Co-Authored-By: <leader-identity> <noreply@anthropic.com>
EOF
)"
```

### 2f. Post-merge bookkeeping

After a successful merge:

1. Read the merged PR's Changelog section. Determine its subsection (Added / Changed / Fixed / Removed).
2. Pull `main`, append `- <changelog line> (#<PR> by @<author>)` under the right subsection of `## [Unreleased]` in `CHANGELOG.md`. Commit:
   ```
   git add CHANGELOG.md
   git commit -m "chore(changelog): record #<PR>" -m "Co-Authored-By: <leader-identity> <noreply@anthropic.com>"
   git push origin main
   ```
3. Close the linked issue with comment: `Merged in #<PR> (<short-sha>). See CHANGELOG.`
4. For any open issue whose body lists this issue in `Depends on:`, post (idempotent): `Unblocked by #<this-issue> (merged in #<PR>).`

## Step 3 — Daily digest (only once per UTC day)

Find the pinned tracker issue (search for issues with title "Leader status" or label `status:tracker` and `pinned`). Edit (don't append) its first comment with a Markdown summary:

```
### Daily digest — <YYYY-MM-DD UTC>

#### Open PRs
| PR | Team | Status |
|---|---|---|
| #<n> <title> | team:<x> | <ci status> · <review decision> |

#### Blocked
- #<n> <title> — Depends on #<m>

#### Stalled (status:in-progress with no commits in 5+ days)
- #<n> <title> — last activity <when>

#### Queue depth (status:ready by team)
- team:frontend: <count>
- team:backend: <count>
- team:data: <count>
- team:infra: <count>
```

Track the last-digest date in a file at `.leader/last-digest.txt` on `main` to avoid posting twice. (Create `.leader/.gitkeep` if the dir doesn't exist.)

## Step 4 — Self-throttle

At the end of the tick, choose the next wake-up via `ScheduleWakeup`:

- Open non-draft PRs exist with `PENDING` CI: 90s (cache-warm).
- Open non-draft PRs exist, all CI resolved: 270s.
- No open non-draft PRs: 1800s.

Pass the same `/leader-tick` input back as the wake-up prompt.
