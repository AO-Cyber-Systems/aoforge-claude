---
objective: 46-github-sync-foundations
trd: "05"
subsystem: github-sync
tags: [github, find-or-create, idempotency, milestones, markers, test-fixture, node-test]

requires:
  - objective: 46-github-sync-foundations
    provides: "46-01 gh-client (ghRead/ghWrite/ghPaginate/requireEnabled), 46-02 gh-mapping v3 (readMappingV3WithReport/getEntry/setEntry/conflicts), 46-03 gh-body (indexByMarker/parseTitleNumber/markerLine)"
provides:
  - "lib/gh-issue.cjs: createRunContext, ensureObjectiveLabel, ensureMilestone, ensureObjectiveMilestone, scanObjectiveIssues, verifyIssue, findOrCreateObjectiveIssue, parseIssueUrl"
  - "lib/gh-milestone.cjs: normaliseVersion, milestoneTitle, resolveObjectiveMilestone (objective frontmatter, then ROADMAP Milestones list, else none)"
  - "__fixtures__/gh-fake.cjs: createFakeGitHub, the stateful fake GitHub for 46-07, 46-08 and 46-09"
affects: [46-07-sync-core-rewire, 46-08-command-surface, 46-09-e2e-push-pull]

tech-stack:
  added: []
  patterns:
    - "Resolution chain where only the last step may create (mapping -> frontmatter -> marker scan -> title scan -> create)"
    - "Per-run context object: one label create, one issue list, title-keyed milestone cache, mapping mutated in memory and persisted once by the caller"
    - "Loud fake: an unimplemented argv shape or unknown flag returns [gh-fake] unsupported instead of quietly succeeding"
    - "Ambiguity is an error, not a create: duplicate markers, duplicate titles, conflicts, an unreadable issue list and an unverifiable mapped issue all stop resolution"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-milestone.cjs
    - plugins/devflow/devflow/bin/lib/gh-milestone.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-issue.cjs
    - plugins/devflow/devflow/bin/lib/gh-issue.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
    - plugins/devflow/devflow/bin/lib/gh-fake.test.cjs
  modified: []

key-decisions:
  - "getMilestoneInfo is consulted only when the ROADMAP Milestones section has a versioned bullet, and its answer is accepted only if that section names it (its legacy fallback would otherwise return the first vX.Y or v1.0)"
  - "Any refused milestone create falls back to a paginated lookup by title, not only a 422, so resolution does not depend on where gh puts the error detail"
  - "A mapped or frontmatter issue that cannot be verified for a reason other than 'not found' stops resolution (verify_failed); it never falls through to create"
  - "A failed issue list is cached for the run and stops resolution (scan_failed); an unreadable list is never read as 'no issues'"
  - "Re-keying a mapping entry onto an id that already names a different issue moves both claims into conflicts and leaves the existing entry in place"

patterns-established:
  - "findOrCreateObjectiveIssue returns the found issue's title and body, so the 46-07 body merge needs no second fetch"
  - "Result-level warnings: every warning raised while resolving one objective is returned on that result and also kept on runCtx.warnings"

requirements-completed: [GSF-01, GSF-02, GSF-05]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 28min
completed: 2026-09-30
tokens_input: 9569071
tokens_output: 116627
tokens_cache_read: 9190762
tokens_cache_write: 378183
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 46 TRD 05: Find-or-create objective issues without duplicates Summary

**`lib/gh-issue.cjs` finds an objective's issue through mapping, frontmatter, marker scan and title scan before it will create one, `lib/gh-milestone.cjs` answers the milestone from the objective then the ROADMAP list (never a guess), and `__fixtures__/gh-fake.cjs` is the stateful fake GitHub the rest of the objective tests against.**

## Performance

- **Duration:** about 28 min (claim 18:12Z, finished about 18:40Z)
- **Tasks:** 3 of 3, each as a RED commit then a GREEN commit
- **Files:** 6 created, 0 modified
- **Tests:** 83 across the three gate files (gh-fake 21, gh-milestone 12, gh-issue 50), all passing

## Accomplishments

- **Success criterion 2 holds at module level (test 14).** With no `.gh-mapping.json` and no `github_issue` references, two existing marked issues are both found by the marker scan and `fake.writes()` is empty: no `issue create`, no label create, no milestone create. The mapping is rebuilt in memory (`"2"` and `"2.1"` point at the existing numbers).
- **One list per run.** Resolving any number of objectives costs one `issue list` call; the label is created once; milestones are cached by title, so `v1.4` and `v1.3` are separate keys.
- **Nothing is picked silently.** Two issues with the same `devflow:id` return `duplicate_marker` naming both numbers; two unmarked issues with the same `[Objective N]` title return `duplicate_title`; an id in mapping `conflicts` returns `needs_human` with zero gh calls.
- **A wrong mapping entry repairs itself.** An entry whose issue carries another id is re-keyed to that id (state comment id moves with it), or both claims go to `conflicts` when that id is already taken by a different issue. Resolution for the requested id then continues.
- **GSF-05 (defect 5) is closed.** The milestone comes from the objective's `milestone:` first, then the ROADMAP `## Milestones` list, else none. Objective 46 resolves to `v1.4`, not `v1.1`. No resolved milestone means the issue is created without `--milestone` and a warning names the objective; there is no `v1.0` default anywhere.
- **The fake is honest.** It answers in `gh`'s real shapes (`--json` subsets, label and milestone objects, paged comments with `--paginate`/`--slurp`, `422 already_exists`, `label ... already exists`), refuses unknown flags (notably `--search`), and fails loudly on shapes it does not implement.

## Task Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 | RED | b9e0c6b | test(46-05): add failing tests for the stateful fake GitHub |
| 1 | GREEN | f4a131d | feat(46-05): add stateful fake GitHub fixture |
| 2 | RED | 9a2279c | test(46-05): add failing tests for milestone resolver, run context, label and milestone cache |
| 2 | GREEN | 8d27a45 | feat(46-05): add milestone resolver, run context, label and title-keyed milestone cache |
| 3 | RED | 34ba64e | test(46-05): add failing tests for the find-or-create resolution chain |
| 3 | GREEN | a4c2999 | feat(46-05): add find-or-create objective issue resolution chain |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Result warnings missed the helpers' warnings**
- **Found during:** Task 3 GREEN (first run: 49 of 50 passing; test 21b failed)
- **Issue:** `findOrCreateObjectiveIssue` kept its own `warnings` array, but `ensureObjectiveMilestone` and `ensureObjectiveLabel` push straight to `runCtx.warnings`. The "no milestone resolved" warning was on the run context but absent from the result the caller receives.
- **Fix:** The result's `warnings` is now `runCtx.warnings.slice(start)`, where `start` is the length when resolution began.
- **Files modified:** `gh-issue.cjs`. **Commit:** a4c2999 (folded into the Task 3 GREEN commit; the RED commit already pinned the behaviour).

### Judgment calls where the TRD was silent or ambiguous

**2. [Rule 2 - Missing critical functionality] Stricter guard before trusting `getMilestoneInfo`**
- **Issue:** The TRD says to trust `getMilestoneInfo` only when ROADMAP contains `^## Milestones`. But `getMilestoneInfo` falls back to the first `vX.Y` anywhere (then `v1.0`) when the section exists with no parseable bullet, which is exactly the defect and the `v1.0` default the must-haves forbid.
- **Fix:** `roadmap.getMilestoneInfo` is called only when the Milestones section has a bullet naming a version, and its answer is accepted only if that section names it. Tests M3b (heading with no bullets) and M3c (no ROADMAP) pin it. `roadmap.cjs` is untouched.
- **Files:** `gh-milestone.cjs`. **Commit:** 8d27a45.

**3. Milestone create falls back to a lookup on any failure.** The TRD says "create → 422 → found via paginated list". Real `gh api` puts the validation detail in stdout or stderr depending on version, and I could not confirm which, so `ensureMilestone` does the read-only lookup after any refused create rather than pattern-matching a 422. Unresolvable means `null` plus a warning; nothing is cached.

**4. Test 21 is split across two tasks.** Test 21 needs a create, which does not exist until Task 3. Task 2 tests the resolution half (`ensureObjectiveMilestone`: null title, null number, warning naming the objective, zero gh calls). Task 3 adds 21b (create argv has no `--milestone`, issue milestone is null, no milestone API call).

**5. Additions beyond the listed artifacts.**
- Extra exports from `gh-issue.cjs`: `ensureObjectiveMilestone`, `verifyIssue`, `scanObjectiveIssues`, `parseIssueUrl`, all used by the tests and useful to 46-07.
- `createRunContext` warns when the mapping's `repo` differs from the configured repo (issue numbers are still verified before use) and returns `{ok:false, error}` for a mapping newer than version 3.
- Extra fake behaviours: `seedIssue`, `seedComment`, `seedMilestone`, `issue reopen`, `api` GET/PATCH of a single comment, and `--json` field validation.
- Extra test cases beyond the TRD's list: 1b, 2b, 3b, 4b, 5b-5d, 8b-8f (fake); M3b, M3c, M6-M8 (milestone); 10b, 10c, 12b, 12c, 13b, 13c, 16b, 16c, 18b-18d, 21c-21e and the scan-failure case (issue).

**6. Fake strictness downstream TRDs must respect.** `createFakeGitHub` requires `--repo` on issue and label commands, and like real `gh` it refuses `issue create --label X` when label X does not exist and `--milestone T` when milestone T does not exist. Code under test gets these through `ensureObjectiveLabel` and `ensureMilestone`; tests that create issues directly should use `seedIssue` (which registers its labels) or create the label and milestone first.

**7. Edge decisions in the resolution chain** (none contradict the TRD):
- A mapping entry whose issue is marked for a non-objective id (for example the reserved TRD form `46-02`) is dropped with a warning instead of being re-keyed into `objectives`.
- A `github_issue` whose issue is marked for another objective is ignored with a warning; unlike a mapping entry, there is nothing of ours to re-key.
- `issue create` failing on the milestone is retried once, after deleting the cached number and re-ensuring it. gh resolves the milestone before it creates anything, so that failure leaves no issue behind. A retry that cannot re-ensure the milestone proceeds without `--milestone` and with a warning.
- `gh issue create` succeeding with no readable URL returns `create_unparseable`; the next run's marker scan finds the issue.

**8. Output filename.** The TRD's `<output>` block names `46-05-SUMMARY.md`; the dispatch required `46-05-gh-issue-resolution-SUMMARY.md` (the job index matches the full plan id). I used the latter.

### Process notes

- The `df-tools commit` helper was used for all six task commits. `.planning/STATE.md` and `.planning/ROADMAP.md` were not touched (46-06 runs in parallel), so the state-advance and `requirements mark-complete` steps are left to the orchestrator; `requirements-completed` above lists GSF-01, GSF-02 and GSF-05.
- Real-`gh` fidelity that I could not verify here (no network): the exact stdout/stderr split of a `gh api` 422, and the `[..][..]` output of `--paginate` without `--slurp` (taken from the `ghPaginate` comment in gh-client). Neither is load-bearing: `ensureMilestone` does not parse the 422, and every DevFlow caller uses `--slurp`.

## Auth Gates

None.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Stateful fake GitHub (tests 1-8) | `node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs` | 0 | PASS (21 tests) |
| 2: Milestone resolver, run context, label and milestone cache (M1-M5, 19-21) | `node --test plugins/devflow/devflow/bin/lib/gh-milestone.test.cjs plugins/devflow/devflow/bin/lib/gh-issue.test.cjs` | 0 | PASS (31 tests) |
| 3: Resolution chain (9-18, 22) | `node --test plugins/devflow/devflow/bin/lib/gh-issue.test.cjs` | 0 | PASS (50 tests in file) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs plugins/devflow/devflow/bin/lib/gh-milestone.test.cjs plugins/devflow/devflow/bin/lib/gh-issue.test.cjs` | 0 | PASS (83 tests, 0 fail) |

## TDD Evidence

The TRD is `type: standard` with `tdd="true"` on all three tasks. Each RED commit precedes its GREEN commit in `git log`.

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../gh-fake.test.cjs` | 1 | FAIL (correct): `Cannot find module './__fixtures__/gh-fake.cjs'` |
| GREEN (task 1) | `node --test .../gh-fake.test.cjs` | 0 | PASS (correct): 21/21 |
| RED (task 2) | `node --test .../gh-milestone.test.cjs .../gh-issue.test.cjs` | 1 | FAIL (correct): both files fail to load their missing modules |
| GREEN (task 2) | same | 0 | PASS (correct): 31/31 |
| RED (task 3) | `node --test .../gh-issue.test.cjs` | 1 | FAIL (correct): 31 new tests fail (`is not a function`), the 19 Task 2 tests pass |
| GREEN (task 3) | `node --test .../gh-issue.test.cjs` | 0 | PASS (correct): 50/50, after one fix cycle (49/50 on the first run; deviation 1) |

No separate REFACTOR commits.

## Verification Greps (from the TRD)

- `rg -n "spawnSync|require\('child_process'\)" gh-issue.cjs`: no matches.
- `rg -n "search" gh-issue.cjs`: no matches (test 22 asserts this too).
- `rg -n -F 'match(/v(' gh-milestone.cjs`: no matches (test M8 asserts this and the absence of a `v1.0` default).

## Full Suite

`NODE_PATH=/Users/justin/dev/devflow-claude/node_modules npm --prefix <worktree> test`, run once (output in the session scratchpad, not committed): 6081 tests, 6045 pass, **3 fail**, 0 cancelled, 32 skipped, 1 todo. This TRD added 83 of those tests; its three test files all pass.

| Failing test | Cause | Mine? |
|---|---|---|
| MA-7 `doctl auth init` (`handoff-e2e.test.cjs`) | The accepted baseline failure. | No |
| J1 `df-tools tui --once --raw exits 0 within 10s` (`tui.test.cjs`) | `ETIMEDOUT` at 10 s while the suite and a parallel worktree were loading the machine. Re-run alone: passes in 1.2 s. | No (load) |
| 45-02 test 10 (`hooks/upgrade-project.test.js`) | The detached commit child missed its 20 s window at 49 s under the same load. Re-run alone: passes in 0.9 s. | No (load) |

The fourth `✖` line is **X2** in `gh-project.test.cjs` ("no lib/ module outside tests reads `__fixtures__`"). It is declared `todo: 'enabled by 46-07'`, so Node counts it as the 1 todo and not a failure. Its offenders are `gh.cjs`, `runtime-digest.cjs` and `flutter-ui-eval-bootstrap.cjs`; none of this TRD's modules appear (`rg __fixtures__` on `gh-issue.cjs` and `gh-milestone.cjs` finds nothing). 46-07 will need to clear `gh.cjs` for X2 to pass when it is enabled.

## gh-fake API (for 46-07, 46-08, 46-09)

`createFakeGitHub({repo='o/r', scopes=['repo','project','read:project'], commentPageSize=30})` returns:

- `runGh(argv)`: install ONLY via `gh-client._setRunGh(fake.runGh)`. Returns `{ok, status, stdout, stderr}`.
- Live stores: `issues` (`{number,title,body,labels:[name],milestone:title|null,assignees,state:'OPEN'|'CLOSED',createdAt,updatedAt}`), `comments` (`{id,issue_number,body,...}`), `milestones`, `labels`. `--json` output converts to gh's shapes.
- `calls()` (every argv), `writes()` (argv where gh-client `isWriteArgs` is true; includes attempts that `failNext` failed).
- `failNext(match, response)`: `match` is a function of argv, a string (substring of the joined argv) or a RegExp; `response` defaults to `{ok:false, status:1, stdout:'', stderr:''}`. Fires once, on the first matching call.
- `humanEditBody(n, body)`: edits the body and advances `updatedAt` without recording a call. `seedIssue({title,body,labels,milestone,state,assignees})` returns the number and registers the labels; `seedComment(n, body)`, `seedMilestone(title)`.
- Implemented shapes: `issue create|view|list|edit|comment|close|reopen`, `label create`, `auth status`, `--version`, and `api` for `repos/R/milestones` (POST, GET), `repos/R/issues/N/comments` (GET, POST) and `repos/R/issues/comments/ID` (GET, PATCH). Anything else, any unknown flag (including `--search`) and a missing `--repo` return `[gh-fake] unsupported: ...`.
- `updatedAt` is a counter clock (+1 s per real mutation; an edit that changes nothing does not advance it). `issue create` fails like gh for an unknown label or milestone.

## Post-TRD Verification

- Auto-fix cycles used: 1 (deviation 1)
- Must-haves verified: 9/9 (find order and only-last-creates: tests 9-13; lost mapping with zero creates: 14; `duplicate_marker` naming both numbers: 15; re-key or conflict: 16, 16b, 16c; `needs_human` with no writes: 17; one scan per run: 11, 13b; title-keyed milestone cache and warning-without-milestone: 20, 21, 21b; every gh call through gh-client: 22; milestone source order and title rule: M1-M8)
- Gate failures: none for this TRD's gate

## Self-Check: PASSED

- All six created files exist under `plugins/devflow/devflow/bin/lib/` (`gh-milestone.cjs`, `gh-milestone.test.cjs`, `gh-issue.cjs`, `gh-issue.test.cjs`, `gh-fake.test.cjs`, `__fixtures__/gh-fake.cjs`); the three test files ran green in the gate and the full suite.
- All six task commits (b9e0c6b, f4a131d, 9a2279c, 8d27a45, 34ba64e, a4c2999) are on `df/exec-46-05-gh-issue-resolution` between `abc8a0b` and HEAD.
- The worktree was clean apart from this SUMMARY before it was committed. `STATE.md` and `ROADMAP.md` were not touched.

## Notes for downstream TRDs

- **46-07 (`syncObjective`):** call `createRunContext(cwd)` once per run (it returns the `skipped` result unchanged when github is disabled), then `findOrCreateObjectiveIssue(runCtx, resolved, {name, createBody})` per objective. Build `createBody` with `gh-body` so it carries the marker; without one the fallback is a bare marker line. A hit returns the issue's current `title` and `body`, so merge with `mergeManaged` without a second fetch, and do that merge when `needs_marker` is true (that is what writes the marker). Persist `runCtx.mapping` once at the end with `writeMappingV3`; this module never writes it. Also write `github_issue` back to OBJECTIVE.md.
- **Errors to surface, not retry:** `needs_human`, `duplicate_marker`, `duplicate_title`, `verify_failed`, `scan_failed`, `create_failed`, `create_unparseable`. Each carries a `message`; the first three also carry the issue numbers.
- **46-09 / 46-08:** install the fake only with `gh-client._setRunGh(fake.runGh)` and a fake clock via `_setNow`/`_setSleep` (write pacing sleeps otherwise). Wave-1 shapes to remember: `ghPaginate` returns `{ok, items}`; `indexByMarker(...).byId` maps id to the issue NUMBER; `mergeManaged` returns `{ok:false, error}` with no body on refusal; mapping v3 drops entry fields other than `issue_id`, `state_comment_id`, `verified_at` on write. Extend `gh-fake.cjs` (not the tests) for new argv shapes such as `release view|edit|create`.
- The marker scan only sees issues carrying the objective label. An objective issue that lost its label is still found through the mapping or `github_issue`, but not by a lost-mapping rebuild.
