---
title: migrate sub-project planning directories (component .planning/ below the repository root)
area: upgrade
files: [plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs, plugins/aoforge/aoforge/bin/lib/planning-layout.cjs, plugins/aoforge/aoforge/bin/lib/compat.cjs]
disposition: re-scoped
disposition_reason: "It needs a policy decision (migrate nested component projects, or report them) and a new feature, and it blocks the shim removal."
disposition_target: "The same upgrade-hardening objective, not yet planned, done before the shim removal in the release after 3.0.0."
disposition_date: 2026-10-10
disposition_by: objective 75 (TODO-01)
---

## Problem

`upgrade --apply --path <repo>` (0012) moves only the top-level `.planning/`. W066 and doctor check 27 also look only at the top level. Several fleet repositories carry complete DevFlow projects in sub-directories with tracked content (TRD 72-25 Task 1):

- aocore/go (149 tracked files)
- aodex/flutter (129) and aodex/go (2)
- aofamily/ai, browser, connect (15/28/10)
- eden-biz/flutter (246) and eden-biz/go (1003), both with `github.enabled: true` and 0009 pending
- opsCluster/control-plane (only `.progress-guard.json`)
- aohealth/flutter (216) and aohealth/go (2), with no top-level project at all

They keep working only through the compat fallback (`planningRoot` / `findProjectRoot` read `.planning/`), which `SHIM_REMOVAL` deletes in the release after 3.0.0. After that these projects silently stop being found.

## Solution

1. Decide the policy: either migrate component projects (discover `<dir>/.planning/` at depth up to N under the repository root, with the same guards as 0012), or report them (a W066 variant for nested legacy directories, plus a doctor finding) and leave the move to `upgrade --apply --path <repo>/<dir>`.
2. Whichever way, keep `SHIM_REMOVAL` blocked until no known fleet repository has a nested legacy directory.
3. Fleet follow-up: run `upgrade --check --path <repo>/<dir>` for each directory above. Each one is its own project root and shows 0012 pending.

## Disposition (objective 75, 2026-10-10)

Re-scoped by the objective 75 todo sweep (TRD 75-04), not completed. Reason and target are in the frontmatter above; the detail follows.

- **Nothing done here.** The todo's Solution step 1 is a decision, not a fix: migrate component projects (discover `<dir>/.planning/` to a depth N with the same guards as 0012), or report them (a W066 variant for nested legacy directories plus a doctor finding) and leave the move to `upgrade --apply --path <repo>/<dir>`. The user has not made that call, and either branch is a feature larger than a sweep fix.
- **Why it matters.** Several fleet repositories carry complete projects in sub-directories (aocore/go, aodex/flutter and /go, aofamily/ai, browser and connect, eden-biz/flutter and /go, opsCluster/control-plane, aohealth/flutter and /go). They work only through the compat fallback (`planningRoot` / `findProjectRoot`), which `SHIM_REMOVAL` ("the release after 3.0.0", `lib/legacy-names.cjs`) deletes. After that these projects silently stop being found.
- **Constraint to keep.** The shim removal stays blocked until no known fleet repository has a nested legacy directory (Solution step 2). Solution step 3 (`upgrade --check --path <repo>/<dir>` per directory) is read-only but spans other repositories, so it waits for the same objective.
- **Target.** An upgrade-hardening objective in the next milestone, together with the other two upgrade todos that block the shim removal.
