# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`van-der-view` will be a web application for protein structure viewing and interaction. The full feature set and technology stack are **not yet decided** — they will land in a future "project plan" merge request. Until then, this repo only contains the **collaboration substrate** (issue templates, PR template, CHANGELOG, leader orchestration commands).

If you find yourself wanting to scaffold a frontend/backend, install dependencies, or pick a test framework — stop and ask the user. The right time for those decisions is the project-plan MR, not now.

## How work is organized

- **GitHub Issues** are the unit of work. Every issue must carry one `team:*` label (routing) and one `type:*` label.
- **Branches** follow `<team>/<issue-number>-<short-slug>` (e.g. `frontend/42-viewer-rotation`). The leader uses the prefix to cross-check that a PR matches its linked issue's team.
- **PRs** must contain `Closes #N` linking to the issue, and must fill out the **Changelog** section of the PR template. The leader will request changes if either is missing.
- **Members** (humans) self-assign issues by claiming them in a comment. The leader does not assign work to specific people.
- **The leader** is one always-on Claude Code session (driven by `/leader-start` → `/loop /leader-tick`) that triages, reviews, runs CI checks, and merges PRs. See `docs/team-orchestration.md` for the full lifecycle and `docs/leader-runbook.md` for operator notes.

## Labels (full set lives in `scripts/bootstrap-labels.sh`)

- `team:frontend` `team:backend` `team:data` `team:infra` — routing. New teams can be added on demand.
- `type:feature` `type:bug` `type:chore` `type:docs` `type:project-plan`
- `priority:p0` `priority:p1` `priority:p2`
- `status:needs-triage` `status:ready` `status:in-progress` `status:in-review` `status:blocked` `status:needs-rebase` `status:stale`
- `leader:auto-merge` — opt-in: leader may merge alone if all required CI checks pass.
- `leader:hold` — opt-out: leader will comment but never merge.

## What the leader will not do

- Execute test commands itself. It uses GitHub status checks as the source of truth for "tests passed". If no checks are configured on a PR, it refuses to auto-merge and asks for human review.
- Install tooling, edit CI workflows, or invent test commands. Those are `team:infra` issues filed by humans.
- Assign issues to specific people, force-push, or merge without the gates documented in `docs/team-orchestration.md`.

## Pattern for a member's local subagent team

When you (a human contributor) pick up an issue, the suggested local pattern in your own Claude Code is: `/plan` → Explore subagent(s) for codebase familiarity → implement → self-review subagent before opening the PR. The leader is the *second* reviewer, not your only safety net.

## Conventions

- Conventional Commits in the PR title (e.g. `feat(viewer): add rotation gizmo`). Squash-merge keeps history linear.
- The `Changelog` section of the PR template is one Keep-a-Changelog line under Added / Changed / Fixed / Removed. The leader appends it to `CHANGELOG.md` on `main` after merge — do not edit `CHANGELOG.md` in your feature PRs (avoids merge-conflict storms).
