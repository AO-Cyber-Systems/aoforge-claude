---
objective: 43-stack-drafter-rules
trd: "04"
job: 43-04
subsystem: stack-drafter
tags: [stack-classify, stack-evidence, stack-draft, e2e_env, scenario, gap-closure, SDR-08]
requires: ["43-01", "43-02"]
provides:
  - "stack-classify: `e2e_env` key (STANDARD_KEYS_EXT, right after e2e); name rule (environment token + scenario token) and body rule (docker compose up|run|start, kind create, k3d cluster create, kubectl, helm install|upgrade, tilt up); classifyHint exported"
  - "stack-evidence: a name carrying a scenario-class key (e2e, e2e_env) keeps it over a body's first classified line (classifyTarget and the classifyStep script branch); `singlePurpose` and `scenarioNamed` item flags"
  - "stack-draft: breadthOf reads singlePurpose (narrow, reason `single-purpose script`); rankOf puts a scenario-named e2e_env ahead of a body-only one"
  - "stack-drafter-fixtures: envBringUpShape and scenarioWrapperShape; e2e 20 and 21"
affects: ["43-05", "43-06 fleet rollout"]
tech-stack:
  added: []
  patterns:
    - "the name outranks the body for scenario-class keys; the body still supplies tool, stack and scope"
    - "new facts are item fields computed in stack-evidence and only read in stack-draft (D20 purity kept)"
    - "e2e_env stays out of RUN_POLICY defaultKeys and optInKeys, so --run reports key-not-runnable"
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/stack-classify.cjs
    - plugins/devflow/devflow/bin/lib/stack-classify.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-draft.cjs
    - plugins/devflow/devflow/bin/lib/stack-draft.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-verify.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-drafter-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/stack-drafter-e2e.test.cjs
decisions:
  - "Name precedence is limited to the keys classifyHint can produce for a scenario: e2e and e2e_env. `scenario`, `integration` and `smoke` alone are not hint tokens, so they carry no key to keep; `integration-env-up` is covered by the e2e_env pair rule."
  - "When a scenario name overrides the body's key the item is low confidence (the key came from a name), keeps the body's tool and weak markers, and drops resolvesTo (the body line no longer describes it). When the body already agrees, the body result is kept unchanged."
  - "singlePurpose is computed by describing the item's first invocation (a script file whose basename matches ^(check|verify)[-_] or _test.sh$), so it covers runner scripts, CI steps and `bash x.sh`, never `make check-x`, and never test.sh, check.sh or run-tests.sh."
  - "scenarioNamed ranks e2e_env only, in the slot right after source. A flagged e2e candidate ranks as before (D34d)."
metrics:
  duration: "~12m wall clock for the final turn (the first turn stopped at the turn limit after the RED commit for Task 1; the work was resumed from git log)"
  completed: 2026-10-03
  tasks: 2
  files: 9
tokens_input: 11455842
tokens_output: 79364
tokens_cache_read: 11247089
tokens_cache_write: 208607
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 43 TRD 04: Environment and scenario targets get their own key (D4) Summary

Environment bring-up and scenario scripts are no longer drafted as `test`, `e2e` or `build`. A bring-up is the new key `e2e_env`, a wrapper named for a scenario keeps `e2e` whatever its body starts with, and a single-purpose check script can never become the repo-wide `test`. `e2e_env` is never executed by `stack verify --run`.

## What changed

### Classifier (Task 1, stack-classify.cjs)
- `classifyHint` tokenises the name with the existing splitter. One environment token (`up down stack env seed infra cluster compose start stop`) plus one scenario token (`e2e integration scenario`) is `e2e_env` (form `check`, low confidence), checked before the HINT_TOKENS walk. Whole tokens only: `setup`, `restart`, `upstream` and `stacked` do not match.
- Six CLASSIFY_TABLE rows, placed right after the e2e rows, classify bodies as `e2e_env` in `mutate` form: `docker compose|docker-compose up|run|start` (a `composeVerb` helper skips `-f file`, `-p name`, `--profile x` and docker's own `-c`/`-H` values), `kind create`, `k3d cluster create`, `kubectl` (any verb), `helm install|upgrade`, `tilt up`. `docker build` stays `build` and `helm lint` stays `lint_helm`.
- `e2e_env` joins STANDARD_KEYS_EXT after `e2e`, and `classifyHint` is exported.

### Evidence precedence and single-purpose scripts (Task 2, stack-evidence.cjs and stack-draft.cjs)
- `keyFromName(name, bodyHit)` is used by `classifyTarget` and the script branch of `classifyStep`. A scenario-class name (`e2e`, `e2e_env`) that differs from the body's key wins. Neutral names (`run.sh`) keep today's body-first-line behaviour.
- `singlePurpose: true` is set (only then present) for a script named `check-*`, `verify-*` or `*_test.sh`. `breadthOf` returns `narrow` / `single-purpose script` for it before reading any invocation.

### Recovery found by the read-only spot check (stack-evidence.cjs and stack-draft.cjs)
- The first eden-biz preview drafted `e2e_env: make infra-up` (cwd `go`), not the golden `make e2e-stack-up`. `infra-up` runs `cd .. && docker compose up -d`, so the body rule gives it high confidence, while `e2e-stack-up` is `e2e_env` by name only (low). Confidence ranked the generic target first.
- `scenarioNamed: true` is computed in stack-evidence (the item's target or script name classifies to the item's own scenario key). `rankOf` gets one slot right after source for `e2e_env` only, so a scenario-named target outranks a body-only one. Other keys are unaffected (D34d).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Hand-built RED tests masked the behaviour under test**
- **Found during:** Task 2 GREEN
- **Issue:** D33 and D33b built draft items with no `bodyStacks`, so the draft's root-override gate turned them into `off_stack` notes before the breadth check could run. E16g used `verify-schema.sh`, a name the classifier cannot key, so no evidence item existed.
- **Fix:** D33 items carry `bodyStacks: ['go']`, as real evidence does. E16g uses `verify-tests.sh`. Both changed in the GREEN commit, not the RED one.
- **Commit:** fff3ca5f

**2. [Rule 1 - Bug] e2e 20 could not go RED with the TRD's body for the check script**
- **Found during:** Task 2 RED
- **Issue:** The TRD names the body `go test ./migrations/...`. testBreadth already judges that narrow (single-path), so the script was never drafted as `test` and the single-purpose rule had nothing to fix.
- **Fix:** The invented script's body is `go run ./cmd/migrate verify --dir ./migrations`. testBreadth reads it as `unknown` (treated as broad), the name hint keys it `test`, and the go-stack body overrides the go tier's test. That reproduces the fleet defect (before: `test: ./go/scripts/check-migrations_test.sh`).
- **Files modified:** `__fixtures__/stack-drafter-fixtures.cjs`
- **Commit:** 6c3bd39a

**3. [Rule 1 - Bug] Spot-check shortfall: a generic compose target outranked the scenario-named one**
- **Found during:** TRD verification section (read-only eden-biz preview)
- **Issue and fix:** see "Recovery found by the read-only spot check". It sits outside the TRD's two task descriptions but inside its success criteria and `files_modified`. RED commit ed1b5d51 (D34, E17, e2e 20 gains a generic `infra-up` target listed first), GREEN commit f2962edc.

### Behaviour change recorded, not a defect fix
- A runner target whose NAME carries `e2e` now keys `e2e` even when its recipe is `go test ...` (a Make target `test-e2e`). Before, it was a narrow `test` candidate and a note. E16e pins it. No existing test encoded the old behaviour, so no existing expectation was changed.

## Spot checks (read-only `stack init --raw`, repo df-tools, `git status --porcelain` identical before and after in all three)

- **eden-biz:** `e2e_env: make e2e-stack-up`. `test` is not the migration script: `root test: ./go/scripts/check-migrations_test.sh - narrow (single-purpose script)`.
- **EdenDocs:** `e2e: ./wopi-host/scripts/wopi-e2e.sh`, never `build`.
- **aoedge:** `build: make build-fips` (`build-dev` and the others are `alternate` notes); every `make acceptance*` is a `narrow` note, none is `test`.

## Observations for 43-05 and 43-06 (not changed here)

- `make e2e-stack-down` is also `e2e_env` (the `down` token, as the TRD specifies). It loses to `e2e-stack-up` only because that target comes first in the Makefile. A bring-up-over-tear-down tie-break was not added.
- eden-biz still drafts `e2e: make e2e-db-reset`, `deps: flutter/web_e2e/scripts/run-embed-ci.sh` and `test: discover`, and the golden has none of them. EdenDocs still promotes `cwd: wopi-host` onto build and test. These are placement and rollout matters (43-05 D3/D2/D6, 43-06).
- aoedge's `acceptance*` suites are notes under `test`; the golden's `acceptance` key is a hand key.
- `docker-compose`, `kubectl`, `kind`, `k3d` and `tilt` are not in TOOL_STACKS, so `toolStack` returns null for them. That is harmless today (no tier supplies `e2e_env`, so nothing gates it).
- 43-01's follow-ups (devflowops `off_stack` / `mixed_stack` notes beside a correct `make build`, ao-terminal `deps: task init` against the golden `bootstrap`) are placement and classification outside D4. 43-04 did not investigate or change them; they remain for 43-05.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: e2e_env classification by name and body | `node --test plugins/devflow/devflow/bin/lib/stack-classify.test.cjs plugins/devflow/devflow/bin/lib/stack-verify.test.cjs` | 0 | PASS (401 tests) |
| 2: name precedence, single-purpose scripts, e2e shapes | `node --test plugins/devflow/devflow/bin/lib/stack-*.test.cjs` | 0 | PASS (1031 tests) |
| Recovery: scenario-named ranking | `node --test plugins/devflow/devflow/bin/lib/stack-*.test.cjs` | 0 | PASS (1037 tests) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test .../stack-classify.test.cjs .../stack-verify.test.cjs` | 1 | FAIL (correct): 37 K23 cases; the two runCommands e2e_env guards pass already (allow lists unchanged) |
| GREEN (Task 1) | same | 0 | PASS (correct) |
| RED (Task 2) | `node --test .../stack-evidence.test.cjs .../stack-draft.test.cjs .../stack-drafter-e2e.test.cjs` | 1 | FAIL (correct): E16a/b/e/g, D33/D33b/D33c, e2e 20 (`test: ./go/scripts/check-migrations_test.sh`), e2e 21 (`build: ./docsvc/scripts/docs-e2e.sh`); E16c/d/f/h and D33d/e pass as guards |
| GREEN (Task 2) | `node --test .../stack-*.test.cjs` | 0 | PASS (correct) |
| RED (recovery) | evidence + draft + e2e | 1 | FAIL (correct): D34, E17, e2e 20; D34b/c/d and E17b pass as guards |
| GREEN (recovery) | `node --test .../stack-*.test.cjs` | 0 | PASS (correct) |

Commits: `38fe50fe` (RED 1), `3409f02f` (GREEN 1), `6c3bd39a` (RED 2), `fff3ca5f` (GREEN 2), `ed1b5d51` (RED recovery), `f2962edc` (GREEN recovery).

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none (the repo has no lint command) | - | not_available |
| test | `node --test plugins/devflow/devflow/bin/lib/stack-*.test.cjs` | 0 | PASS (1037 tests, 0 failed, 0 skipped; includes the D20 purity test) |
| build | none | - | not_available |

Full `npm test` is 43-06's job and was not run.

## Discovered commands

None. The profile's test command was `node --test` over the touched files, matching the TRD's gates.

## Post-TRD Verification

- Auto-fix cycles used: 0 (the three items under Deviations are test-side corrections and one extra RED/GREEN pair)
- Must-haves verified: 5/5 (e2e_env by name; e2e_env by body; name-carried key beats a script's first body line; single-purpose scripts are narrow; e2e_env is key-not-runnable under --run)
- Gate failures: None

## Self-Check: PASSED

- All nine modified files exist and match the TRD `files_modified` list; `stack-verify.cjs` and `stack-profile.cjs` are untouched (`git diff --stat 061faa41..HEAD`).
- Commits found: 38fe50fe, 3409f02f, 6c3bd39a, fff3ca5f, ed1b5d51, f2962edc.
- The pre-existing untracked files (`.gitkeep` under objectives 26-31, `docs/CODEX-PORT.md`, `docs/PROPOSAL-visual-workflow-class.md`, `references/codex-agent-policy.md`) were not touched.
