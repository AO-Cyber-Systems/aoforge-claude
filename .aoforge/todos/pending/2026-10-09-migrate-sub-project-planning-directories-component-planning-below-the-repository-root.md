---
title: migrate sub-project planning directories (component .planning/ below the repository root)
area: upgrade
files: [plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs, plugins/aoforge/aoforge/bin/lib/planning-layout.cjs, plugins/aoforge/aoforge/bin/lib/compat.cjs]
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
