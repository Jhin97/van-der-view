#!/usr/bin/env bash
# Bootstrap (or refresh) the full label set used by the team-orchestration
# workflow. Idempotent — safe to re-run; --force overwrites color/description
# but does not delete existing issues' label assignments.
#
# Requires the `gh` CLI authenticated against the van-der-view repo.
# Usage:
#   bash scripts/bootstrap-labels.sh [owner/repo]
# If [owner/repo] is omitted, gh uses the current directory's remote.

set -euo pipefail

REPO_FLAG=()
if [[ "${1:-}" != "" ]]; then
  REPO_FLAG=(--repo "$1")
fi

create_label() {
  local name="$1" color="$2" desc="$3"
  gh label create "$name" --color "$color" --description "$desc" --force "${REPO_FLAG[@]}"
}

# team:* — routing labels (slate blue family)
create_label "team:frontend" "1F6FEB" "Routing label: frontend (viewer/UI)"
create_label "team:backend"  "0E7C66" "Routing label: backend / services"
create_label "team:data"     "8957E5" "Routing label: data / protein pipelines"
create_label "team:infra"    "BF8700" "Routing label: infrastructure / CI / build"

# type:*
create_label "type:feature"      "0E8A16" "New capability"
create_label "type:bug"          "D73A4A" "Something broken"
create_label "type:chore"        "C5DEF5" "Maintenance, refactors, deps"
create_label "type:docs"         "0075CA" "Documentation only"
create_label "type:project-plan" "5319E7" "Adds or revises the master project plan; leader ingests on merge"

# priority:*
create_label "priority:p0" "B60205" "Drop everything"
create_label "priority:p1" "D93F0B" "Important, current cycle"
create_label "priority:p2" "FBCA04" "Nice to have"

# status:*
create_label "status:needs-triage"  "EDEDED" "Awaiting team assignment / clarification"
create_label "status:ready"         "C2E0C6" "Triaged, ready for someone to pick up"
create_label "status:in-progress"   "FBCA04" "Someone has claimed and started"
create_label "status:in-review"     "0052CC" "PR open, awaiting review"
create_label "status:blocked"       "B60205" "Cannot proceed; see Depends on"
create_label "status:needs-rebase"  "E99695" "Branch has conflicts with main"
create_label "status:stale"         "BFBFBF" "No activity in 7+ days; nudged"

# leader:*
create_label "leader:auto-merge" "0E8A16" "Opt-in: leader may merge alone if all required CI checks pass"
create_label "leader:hold"       "B60205" "Opt-out: leader comments but never merges this PR"

echo "Label bootstrap complete."
