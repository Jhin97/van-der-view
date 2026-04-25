---
description: Parse the merged project-plan MR and create per-feature issues with team/priority/dependency labels
---

This command runs when a PR labeled `type:project-plan` has been merged into `main`. It reads the project-plan document, diffs it against the previously ingested version, and creates GitHub issues for any new or changed features.

Arguments: optionally a specific PR number; otherwise the most recently merged `type:project-plan` PR.

## Step 1 — Find the project plan PR

If a PR number was passed, use it. Otherwise:

```
gh pr list --state merged --label type:project-plan --limit 1 --json number,mergeCommit,headRefName,title
```

Read the PR's merge commit SHA. We'll diff against its parent.

## Step 2 — Locate the plan document

By convention the plan lives at `docs/PROJECT_PLAN.md`. If it doesn't exist there, search the merge commit for any new/modified `.md` file with a top-level `# Project plan` heading.

## Step 3 — Parse the structured features section

The plan must contain a `## Features` section with one feature per `### <id> — <title>` subheading. Each feature has at minimum:

```markdown
### F-12 — Structure rotation

**Team:** frontend
**Priority:** p1
**Depends on:** F-3, F-7

Short description goes here.

#### Acceptance
- [ ] Mouse drag rotates the active structure
- [ ] Reset button returns to identity orientation
```

Tolerate small variations: case-insensitive field labels, `Depends on:` may be empty or `none`. If any required field is missing on a feature, skip it and report it in the summary comment instead of failing.

## Step 4 — Diff against the previously ingested version

Determine which features are **new** vs **changed**:

- For each `F-<id>` in the new plan, check if a GitHub issue exists with title prefix `[F-<id>]`. The leader uses this prefix as the join key (so `F-12` ↔ `[F-12] Structure rotation`).
- New features (no matching issue) → create an issue (Step 5).
- Existing features whose `Acceptance` section, `Team`, `Priority`, or `Depends on` changed → post an update comment on the existing issue, do not duplicate. Update the labels to match the new Team/Priority. Do not re-open closed issues automatically — surface the change in the summary comment for human attention.
- Features removed from the plan → do nothing automatic. Surface in the summary comment.

## Step 5 — Create issues for new features

For each new feature, build the issue body from the plan's text:

```markdown
<!-- ingested from project plan PR #<plan-pr> at commit <sha> -->

<short description from the plan>

## Acceptance criteria
<the checkbox list verbatim>

## Depends on
#<resolved issue numbers, looked up by F-id prefix>
```

Then:

```
gh issue create \
  --title "[F-<id>] <title>" \
  --body-file <tmpfile> \
  --label "type:feature,team:<team>,priority:p<n>,status:ready"
```

If any `Depends on` reference can't be resolved (its target feature hasn't been ingested yet), still create the issue but add `status:blocked` and include the unresolved `F-<id>` in the body so a follow-up tick can fix it.

## Step 6 — Resolve forward references

After all new issues are created, walk the just-created issues and rewrite their `## Depends on` sections to use real `#N` numbers (now that all targets exist). Where dependencies all close, the regular `/leader-tick` Step 1 will unblock them automatically; nothing extra to do here.

## Step 7 — Milestones (if the plan defines phases)

If the plan has `## Phases` with `### Phase N — <name>` and assigns features to phases, create one milestone per phase via `gh api repos/:owner/:repo/milestones -f title=...` and assign each issue via `gh issue edit <n> --milestone <name>`.

## Step 8 — Summary comment on the plan PR

Post one comment on the project-plan PR:

```
Ingested at <sha>:

**Created:** N issues
- #<n> [F-<id>] <title>
- ...

**Updated:** M issues
- #<n> [F-<id>] <title> — <what changed>

**Skipped (missing required fields):** K
- F-<id> <title> — missing <field>

**Removed from plan (no automatic action):** R
- F-<id> <title> — was #<n>
```

This is the operator's confirmation that ingestion ran cleanly.
