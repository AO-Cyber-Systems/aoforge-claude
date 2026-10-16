completed: 2026-10-08
---
created: 2026-10-03T18:00:00.000Z
title: Stack drafter rules for govulncheck self-test steps and buf lint coverage
area: stack-drafter
files: [plugins/devflow/devflow/bin/lib/stack-draft.cjs, plugins/devflow/devflow/bin/lib/stack-classify.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs]
---

## Problem

Under the objective 43 accept-all decision (2026-10-03), the user accepted these drafter limitations as the current state. They were acknowledged at the 43 re-verification, with a todo to add a general rule later:

- **aodex.audit**: the draft picks a govulncheck `--self-test` CI step, which scans nothing, over the real gate step in the same workflow.
- **justinforme.lint / smartWellness.lint**: `make lint` runs `go vet` plus `buf lint`. The draft and the committed file both carry only `go vet`, so the buf lint gate is invisible to agents.
- **ao-terminal.deps / aocore.test**: the hand-edited flags differ from the verbatim CI commands. The drafter stays verbatim by design, so no rule is planned here, unless the user changes that policy.

## Solution

Two general rules, with no repo names:
- A CI step whose arguments mark it a self-test (`--self-test`, `selftest`) of a gate script never fills `audit`/`lint`/`test` when a sibling step runs the same script as a gate.
- A key-named runner target whose body runs the tier default plus an additional linker or linter for another declared tool (buf, golangci-lint) should be preferred over the inherited default. 43-12 deliberately kept the default, so revisit that narrowing.

When each rule closes a row, remove it from ACCEPTED in `stack-fleet-tables.cjs`. The fleet harness then guards it.
