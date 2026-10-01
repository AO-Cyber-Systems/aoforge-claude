---
objective: 49-objective-branch-and-pr-lifecycle
trd: "05"
subsystem: github-store
tags: [gh-outbox, gh-body, pull-request, upsert-pr, pr-ready, labels_remove, remote-edit, byte-stability]

requires:
  - objective: 49-01
    provides: fake GitHub pulls routes, `markPullRequestReadyForReview`, PR records on `issue.pr`, `pushRef`
  - objective: 49-02
    provides: mapping `prs` map (`getPr` / `setPr`)
provides:
  - "gh-body: PR_SECTION_ORDER, prMarker, extractPrMarker, closesSection, buildPrBody, and mergeManaged `{order, marker}` options"
  - "gh-outbox: op kinds `upsert-pr` and `pr-ready`, `patch-issue` `labels_remove`, base-store key `pr:<objective>`"
  - "gh-outbox-flush: handleUpsertPr, handlePrReady, labels_remove, `pending` failure class, PR base hash, resolveHalt for upsert-pr"
affects: [49-09, 49-10, 49-11, 49-12]

tech-stack:
  added: []
  patterns:
    - "A PR is marked `<!-- devflow:pr=<objective id> -->`, a distinct marker kind: no `devflow:id=` scan can read it"
    - "mergeManaged takes `{order, marker}` instead of a PR-specific copy; with neither option it is byte-identical to before"
    - "A section list and base key per body kind: managedHash / baseFromIssue / saveBase / remoteEditCheck take an optional section order"
    - "A failure class that is neither a halt nor an outage (`pending`) keeps the op queued and the queue stopped without a human"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/gh-body.cjs
    - plugins/devflow/devflow/bin/lib/gh-body.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-outbox.cjs
    - plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs
    - plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs

key-decisions:
  - "A body carrying the OTHER marker kind is refused by mergeManaged (a PR body with `devflow:id=`, an issue body with `devflow:pr=`), so a no-option merge of a PR body fails with `does not match` as the TRD's test 1a requires"
  - "The failure class for `No commits between` is the literal `pending`; the flush loop marks the op pending, keeps `retry_after` null and returns `{status:'pending', reason:'pending', detail}`"
  - "`labels_remove` is one PATCH of the remaining label set (with `labels_add` in the same call), not one DELETE per label: the fake has no `DELETE issues/{n}/labels/{name}` route and 49-05 does not own the fake"
  - "pr-ready reads the live PR (`pulls/{n}`, else by head) and uses its `node_id`; the mapped `node_id` is only a fallback"
  - "A found PR that is closed or merged is left alone with a warning: it is not recreated and its body is not edited"

patterns-established:
  - "An op that must wait for the world (not a human) returns a failure with class `pending`"

requirements-completed: [GPR-01, GPR-03]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 10min
completed: 2026-10-01
---

# Objective 49 TRD 05: Outbox ops for the objective PR body and ready state Summary

**The outbox now creates the one draft PR per objective (closing the objective issue and every TRD issue, derived at flush time), keeps its managed `closes`/`wiki`/`summary` sections current without touching human text or the title, marks it ready, and removes labels.**

## Performance

- **Duration:** about 10 min
- **Tasks:** 2 of 2 (each RED committed before GREEN)
- **Files:** 6 modified (3 source, 3 test)

## Accomplishments

- `mergeManaged(body, sections, id, {order, marker})`: `{order: PR_SECTION_ORDER, marker: 'pr'}` writes and matches `<!-- devflow:pr=<id> -->` and keeps `closes`/`wiki`/`summary`; a PR body round-trips unchanged. With no options the output is byte-identical (pinned by a hand-written expected body).
- `upsert-pr {id}` finds the PR by `prs[id].number` (a 404 falls through), else by `pulls?head=<owner>:<branch>&state=all`, else POSTs a draft with the body on stdin. A re-flush writes nothing. A `closes` line is written per issue (`Closes #N`), objective issue first, then mapped TRDs in natural id order; Decisions are not closed.
- Remote edits use the objective-body rule under the key `pr:<objective>`: a human edit inside a managed section halts (the report names `pull request #N`), a human edit outside is merged. `resolveHalt` (overwrite / accept-remote) refreshes that base.
- The title is create-only: no title on create halts with `title needed to create the PR for objective <id>`; an existing PR is PATCHed with `{body}` only, so a human rename survives even a refresh that carries a title.
- A `base` that is not the repository default branch halts, naming both. `repos/{r}` is read once per context (`ctx.defaultBranch`, `ctx.repoNodeId`).
- `422 No commits between` classifies as `pending`: the op stays queued, the flush returns `status: 'pending'` (exit 3 semantics), and the next flush after a push creates the PR.
- `pr-ready` runs `markPullRequestReadyForReview`; an already-ready (or closed/merged) PR writes nothing.
- `patch-issue` `labels_remove`: removes only labels present, never one the same op adds, in one PATCH with any `labels_add`.

## Task Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 | RED | 8d87b925 | test(49-05): PR body sections and op schemas |
| 1 | GREEN | 0bafec19 | feat(49-05): PR body sections and PR op schemas |
| 2 | RED | 36aeb3c8 | test(49-05): flusher upserts the objective PR |
| 2 | GREEN | a2d72824 | feat(49-05): flusher writes the objective PR |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: PR body sections and op schemas | `node --test gh-body.test.cjs gh-outbox.test.cjs` (gh-body 114 pass, was 102; gh-outbox 95 pass, was 87) | 0 | PASS |
| 2: flusher handlers | `node --test gh-outbox-flush.test.cjs` (124 pass, was 102) then `node --test 'gh-*.test.cjs'` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1, gh-body) | `node --test --test-name-pattern="49-05" gh-body.test.cjs` | 1 (11 of 12 fail: `closesSection`/`prMarker`/`buildPrBody`/`extractPrMarker` missing, PR options ignored; the 1b byte-stability pin passes by design) | FAIL (correct) |
| RED (task 1, gh-outbox) | `node --test --test-name-pattern="49-05" gh-outbox.test.cjs` | 1 (8 of 8 fail: unknown op kinds, `labels_remove`, `pr:` base key) | FAIL (correct) |
| GREEN (task 1) | `node --test gh-body.test.cjs gh-outbox.test.cjs` | 0 (209 pass) | PASS (correct) |
| RED (task 2) | `node --test --test-name-pattern="49-05" gh-outbox-flush.test.cjs` | 1 (22 of 22 fail: `no handler for op kind "upsert-pr"`, label not removed, class not `pending`) | FAIL (correct) |
| GREEN (task 2) | `node --test gh-outbox-flush.test.cjs` | 0 (124 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test gh-outbox-flush.test.cjs gh-outbox.test.cjs gh-body.test.cjs` | 0 | PASS |
| regression | `node --test 'gh-*.test.cjs'` (1356 tests, 232 suites, 0 fail) | 0 | PASS |
| verification | `node --test *.repo.test.cjs` (35 pass, includes `gh-seam.repo.test.cjs`: no new spawn, flusher still the only writer) | 0 | PASS |

The full `npm test` was not run (the worktree has no `node_modules`; `devflow-watch` / `handoff-e2e` fail there for that reason only, as recorded in 49-02).

## Test list coverage

TRD tests 1, 1a, 1b, 2 are `describe('49-05 PR body sections')`; test 3 is `describe('49-05 PR op schemas')`; tests 4-12 (with 9a) are `describe('49-05 objective PR')`; test 13 is the untouched pre-existing suites. Extra cases beyond the TRD list: 3a (classifier pins), 4b (no objective issue), 4c (default branch read once), 5b (stale mapped number), 6b (natural TRD order), 6c (refresh keeps earlier wiki/summary), 7c (resolveHalt overwrite and accept-remote), 9b (closed PR left alone), 10b (pr-ready with no PR / closed PR), 11b (labels_add with labels_remove).

Test 12 (scans skip `pull_request` records) is a characterization pin: `scanByLabel`, `gh-comments.scanForTrdIssue` and `gh-hierarchy` already skip them, so it passed as soon as a PR could be created; no scan needed changing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Base-store key `pr:<objective>` was refused by `setBase`**
- **Found during:** Task 2 design
- **Issue:** the TRD saves the PR base under `pr:<objId>`, but `BASE_KEY_RE` accepts only `<id>` or `<id>#<kind>`; every save would have become a "could not record the base" warning and remote-edit detection would never have worked.
- **Fix:** `BASE_KEY_RE` also accepts `pr:\d+(\.\d+)?` (covered by a test in task 1; `pr:`, `pr:x`, `pr:49-01`, `pr:49#summary` stay refused).
- **Files modified:** gh-outbox.cjs, gh-outbox.test.cjs
- **Commit:** 0bafec19

**2. [Rule 3 - Blocking] `managedHash` ignored the `closes` section**
- **Found during:** Task 2 design
- **Issue:** `managedHash` hashed `SECTION_ORDER + OPTIONAL_SECTIONS`, which has no `closes`, so a human edit inside a PR's `closes` section could not halt (test 7).
- **Fix:** `managedHash`, `baseFromIssue`, `saveBase` and `remoteEditCheck` take an optional section order (default unchanged); the PR path passes `PR_SECTION_ORDER`.
- **Files modified:** gh-outbox-flush.cjs
- **Commit:** a2d72824

**3. [Rule 3 - Blocking] `labels_remove` is a PATCH, not a DELETE per label**
- **Found during:** Task 2 design
- **Issue:** the TRD names `DELETE repos/{r}/issues/{n}/labels/{name}`; the fake GitHub (49-01, not owned by this TRD) has no such route, so the behaviour could not be tested.
- **Fix:** one PATCH carrying the remaining labels (plus any `labels_add`), which is the form `patch-issue` already uses and which the fake supports. A removal of an absent label sends nothing.
- **Files modified:** gh-outbox-flush.cjs
- **Commit:** a2d72824

**4. [Rule 1 - Bug] RED test misused `enqueue`**
- **Found during:** Task 1 GREEN
- **Issue:** the RED test passed a single op to `outbox.enqueue`, which takes an array.
- **Fix:** the test now enqueues arrays and asserts the coalescing result (`coalesced: [1]`). Shipped with the Task 1 GREEN commit.
- **Commit:** 0bafec19

**5. [Rule 3 - Blocking] Existing test 1a enumerated `OP_KINDS`**
- The pre-existing `gh-outbox.test.cjs` test `1a` asserts the op kinds equal its `VALID` table and that there are 9. Adding two kinds required adding `upsert-pr` and `pr-ready` to `VALID` and changing 9 to 11. No assertion was weakened. "Every existing test passes unchanged" holds for every other test.

### Additions beyond the TRD (no behaviour contradicts it)

- `extractPrMarker(body)` is exported from gh-body (needed internally for the marker-kind refusal; useful to 49-12 to recognise a PR body).
- `upsert-pr` / `pr-ready` target ids must be objective ids (`49`, `2.1`); a TRD id is refused at enqueue. `branch` and `base` must be safe git branch names (no whitespace, `~^:?*[\`, `..`).
- `resolveHalt` handles `upsert-pr` (re-reads the PR and refreshes the `pr:<id>` base), which the TRD's refresh-base note allowed for.
- A POST that answers `already exists` (a race the head lookup did not see) re-runs the lookup and updates that PR instead of blocking.

## Notes for dependents

- **49-09 (start / sync / status):** enqueue `{kind:'upsert-pr', target:{id}, payload:{branch, base, title, wiki?, summary?}}`. `title` is needed only for the first create. `branch` may be recorded in `prs[id]` first; if it is not, the handler records `branch` and `base` itself on the first PR. A pending result is `status:'pending', reason:'pending', detail:<gh message>` (exit 3); `gh-store-cli.pendingWhy` has no case for `reason: 'pending'` yet, so it prints the default "run it again". A base that is not the default branch halts as `blocked`.
- **49-10 (status comment / merge ops):** `OP_KINDS` is now 11 kinds; `VALID` in `gh-outbox.test.cjs` and its count (11) must be extended again. The PR base key is `pr:<objective>`, with the managed order `PR_SECTION_ORDER`. `findObjectivePr(ctx, id, branch)` and `repoInfo(ctx)` (default branch and node id on `ctx`) are module-private; export them if the merge handler needs them.
- **49-11 (summary / verify hooks):** refresh with `{branch, base}` from `prs[id]` plus one section (`summary` or `wiki`); no title. Sections left out of the payload keep their current text. `closes` is always re-derived, never sent.
- **Fake contract:** a PR created by this op has `draft: true`; `fake.issues.filter(i => i.pr)` lists them; PR GraphQL ids are `PR_<number>`.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 11/11 (create once and idempotent re-flush; closes derived at flush with one line per issue; distinct `devflow:pr=` marker; `mergeManaged` options with PR round-trip and byte-identical defaults; human text and managed-section edit halt; title create-only; non-default base halts; `No commits between` pending; pr-ready no-op when ready; `labels_remove`; existing suites unchanged)
- Gate failures: None

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/gh-body.cjs, gh-body.test.cjs, gh-outbox.cjs, gh-outbox.test.cjs, gh-outbox-flush.cjs, gh-outbox-flush.test.cjs (all in the worktree)
- FOUND commits on `df/exec-49-05` (`git log --oneline 92bd5656..HEAD`): 8d87b925, 0bafec19, 36aeb3c8, a2d72824
- Worktree clean apart from this SUMMARY at the time of the check
