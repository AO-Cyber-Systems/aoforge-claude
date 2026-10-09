---
objective: 72-install-and-naming-cleanup
trd: "16"
subsystem: github-store
tags: [aoforge-rename, github-store, rebrand, labels, markers, wiki, rulesets, checks-pin]

requires:
  - phase: 72-07
    provides: "the AOForge runtime home and `state rekey` beside the other help/flag-spec entries"
  - phase: 72-09
    provides: "legacy-rewrite.cjs rewriteLegacyNames (PRESERVE masked) and unifiedDiff"
  - phase: 72-11
    provides: "dual-namespace gh-body readers, legacy-gh-fixtures (legacyCaller, legacyPrTemplate), checks-pin `legacy` flag and FIX_LEGACY pointing at `gh rebrand`"
provides:
  - "gh-rebrand.cjs: snapshotRepo, snapshotLocal, planRebrand, renderPlan, applyRebrand, ghRebrandClient, runRebrand, cmdGhRebrand"
  - "`aof-tools gh rebrand [--repo o/r] [--apply|--dry-run] [--raw]`: dispatched in aof-tools.cjs, in help.cjs (gh usage + details) and flag-spec.cjs; PROBES and the gh seam guard list it"
  - "__fixtures__/legacy-rebrand-fixtures.cjs: legacyRepoSnapshot, stubClient (applies and records writes), localRepo (hermetic checkout with the legacy caller, PR template, docs backend and legacy config labels)"
affects: [72-15, 72-17, 72-25]

tech-stack:
  added: []
  patterns:
    - "An injectable rebrand client (list, get, readWiki, write) separates the pure plan from GitHub; the real client is gh-client (ghPaginate/ghRead/ghWrite) plus a scratch wiki clone through gh-wiki"
    - "Resume by re-planning: apply stops at the first failed op, and a re-run re-reads the repository and plans only what is still legacy"
    - "Managed text: markers re-spelled, wording rewritten inside managed sections, only the legacy product name outside; PRESERVE tokens and the repository's own slug masked"

key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/gh-rebrand.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-rebrand.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-rebrand-fixtures.cjs
  modified:
    - plugins/aoforge/aoforge/bin/aof-tools.cjs
    - plugins/aoforge/aoforge/bin/lib/help.cjs
    - plugins/aoforge/aoforge/bin/lib/flag-spec.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/flag-guard-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-seam.repo.test.cjs

key-decisions:
  - "Managed means the first line is a marker in either namespace, or the text holds a managed section (`begin NAME`/`end NAME`, or the PR template's `NAME:start`/`NAME:end`). Only managed issues, pull requests and comments are edited. Their markers move to the AOForge namespace, the text inside managed sections gets the full wording rewrite, and the text outside them changes only where it names the legacy product (both prose spellings, with the article fixed). Titles of managed issues, wiki pages and docs-backend pages get the full wording rewrite"
  - "PRESERVE tokens are never rewritten, and neither is the repository's own owner/name (a repository whose name holds a legacy word keeps working links)"
  - "Labels: every label in the legacy namespace is renamed (PATCH new_name keeps the associations). When the AOForge label already exists, the legacy one is merged instead: the AOForge label is added to every issue carrying the legacy one, then the legacy label is deleted (marked destructive). A failed add stops the run before the delete"
  - "Rulesets: the repository's rulesets get one PUT each with only the writable fields, the legacy contexts switched (a duplicate after the switch kept once) and a legacy ruleset name rewritten, so gh setup still finds `aoforge: default branch` instead of creating a second ruleset. Organization rulesets are reported, not edited. A 403/404 on the list is `needs admin` and the rest still runs"
  - "Local files: the managed legacy caller is `git mv`ed to aoforge.yml and re-rendered from gh setup's template at the current release (new slug, workflow file, input name and pin). When aoforge.yml already exists, the legacy caller is removed (destructive). The docs backend is `git mv`ed and its pages rewritten. The PR template block is re-marked. In config.json, the legacy-namespace `github.labels` values (72-11 hand-off) and a legacy `checks_workflow` are rewritten in place, so the layout is kept. The local section runs only when the command's project is a checkout of the repository"
  - "Apply runs in the fixed order (labels, issues, comments, wiki, rulesets, local) under a zero-retry policy: a secondary rate limit stops the run with the wait time. Wiki pages are written to a scratch clone and count as done only when the one push succeeds. In store mode the outbox bases of rewritten issues and comment groups are refreshed (72-11 hand-off), so the next flush does not read the rewrite as a human edit"
  - "The commit steps are commit-steps.cjs's branch sequence on `aoforge-rebrand`, with the logged escape and the `gh pr start` route in store mode. The file list covers moved directories once"

requirements-completed: [INST-04]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 50min
completed: 2026-10-09
tokens_input: 36367082
tokens_output: 168540
tokens_cache_read: 35026229
tokens_cache_write: 1340599
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 16: `aof-tools gh rebrand` Summary

**`aof-tools gh rebrand` reads one repository and plans every rename. That covers labels (rename, or a destructive merge into an existing AOForge label), the markers and wording of managed issues, pull requests and comments, wiki pages, ruleset contexts and names, and in a checkout of the repository the caller workflow, docs backend, PR template and config.json labels. A dry run prints each change with a line diff. `--apply` runs the changes in a fixed order, stops at the first failure with what is done and what is left, and resumes on a re-run. It never commits.**

## Progress
- [x] Task 1: Fixture builder: a legacy store-mode repository snapshot — 9be0af0e
- [x] Task 2: Plan and dry run — 33219075 (RED), ef3ede76 (GREEN)
- [x] Task 3: Apply, idempotence and resume — 3e3f541d (RED), b5357f02 (GREEN)

## What was built

- **`gh-rebrand.cjs`** (all legacy forms built from `LEGACY`; the rename guard passes with it tracked):
  - `snapshotRepo(client, repo)` does reads only. It covers labels, every issue and pull request (`state=all`), every issue comment (the repository-wide endpoint, which includes PR conversation comments), the repository rulesets (each read in full by id, with organization rulesets listed apart) and the wiki. A failed label, issue or comment read fails the snapshot. Rulesets and the wiki degrade to a reported section.
  - `snapshotLocal(root, { version })` reads the legacy caller (with `parseWorkflowPins`), the new caller, the PR template, `docs/<legacy>/` and config.json. It also renders the new caller from gh setup's template, using the rewritten github config at the current version.
  - `planRebrand(snapshot, local)` is pure. It returns `{ repo, store, ops, sections }`, with ops in the fixed order. Each op carries `section`, `kind`, `target`, `before`, `after` and `destructive`, plus a `request` (`gh api` argv and the exact JSON stdin) for remote ops.
  - `renderPlan(plan)` prints one block per section with its count (or `skipped` / `needs admin` and the reason) and unified line diffs (`legacy-rewrite.unifiedDiff`).
  - `applyRebrand(plan, { client, root, runGit, env, snapshot })` is the one writer.
    - Remote ops go to `client.write`. Local ops run through `git mv` / `git rm` via gh-wiki's `runGit` seam, plus file writes inside the checkout.
    - It stops at the first failure with `{ done, left, failed, error, wait_ms? }`.
    - Staged wiki pages count as done only after their push.
    - In store mode it refreshes the existing outbox bases of each rewritten issue (`body_hash`, `managed_hash` with the PR order for `pr:` keys, `updated_at`; `frozen` is kept) and each rewritten comment group (the joined parts, as the flusher hashes them).
  - `ghRebrandClient({ root })` is the real client:
    - Reads use `ghPaginate` / `ghRead` and writes use `ghWrite` with the op's own request.
    - A secondary limit comes back as `rate_limited` with `wait_ms`.
    - The wiki is read and written in a scratch clone under the OS temp dir, through gh-wiki's `ensureClone`, `writePage` and `push`. The store's own `.aoforge/wiki/` clone is never touched.
  - `runRebrand` / `cmdGhRebrand` provide the CLI:
    - Flags: `--repo`, `--apply`, `--dry-run` and `--raw`. `--apply` together with `--dry-run` is a usage error.
    - Without `--repo` it uses `requireEnabled`. `--repo` defaults to github.repo.
    - The project root comes from `findProjectRoot`.
    - The local section is planned only in a checkout of the target repository.
    - It runs under `withRetryPolicy({ maxRetries: 0 })`.
- **Wiring**:
  - `aof-tools.cjs` dispatches `gh rebrand`, and the unknown-subcommand list names it.
  - `help.cjs` adds it to the gh usage line and to `details` (`aof-tools gh rebrand --help` documents it).
  - `flag-spec.cjs` has `rebrand: { values: ['--repo'], bools: ['--apply', '--dry-run'] }`.
  - `flag-guard-fixtures.cjs` has the `gh rebrand` probe.
  - `gh-seam.repo.test.cjs` lists gh-rebrand.cjs in GUARDED, not NO_DIRECT_WRITE: it calls `ghWrite`, like gh-setup.
- **Fixture** (`__fixtures__/legacy-rebrand-fixtures.cjs`):
  - `legacyRepoSnapshot` holds, in REST shapes:
    - five legacy labels and `bug`;
    - an objective issue with the legacy tracking line in its footer section and a person's text below;
    - a TRD issue, a todo issue, an unmanaged issue and the objective PR;
    - state, two-part summary, human and reconcile comments;
    - three wiki pages;
    - the old setup ruleset plus an organization ruleset.
  - `stubClient` applies and records each write against its own copy of that state, and has `failAt` and `rulesetsStatus` options.
  - `localRepo` builds a hermetic checkout with the legacy caller pinned to v2.12.0, the legacy PR template, `docs/<legacy>/Project.md` and legacy config labels.

## Hand-off

- **72-25 (fleet sweep)**: in each fleet repository's checkout, run `aof-tools gh rebrand` (dry run), review it at the checkpoint, then run `--apply`.
  - **Flush first.** Run `aof-tools gh outbox flush` before `--apply`. An op queued earlier that names a legacy label would make the flusher create that label again after the rename. Nothing checks for this.
  - **App variable and secret.** The re-rendered caller reads `AOFORGE_APP_CLIENT_ID` (variable) and `AOFORGE_APP_PRIVATE_KEY` (secret). The plan notes this when the legacy caller used the legacy-named pair. A secret cannot be copied through the API, so the user sets the new names, or the checks fall back to the workflow token.
  - **Admin rights.** The Rulesets section needs repository admin. Without it the section reports `needs admin` and the rest still applies.
  - **Commit the local changes** with the printed `aoforge-rebrand` branch sequence (the store form in store mode).
- **72-17 (docs)**: document `gh rebrand` in CLAUDE.md (Core Tool, GitHub integration) and the user and migration guides. Cover:
  - what is rewritten: markers; wording inside managed sections; only the product name outside them; full wording in titles, wiki pages and the docs backend;
  - what is never rewritten: unmanaged text, PRESERVE tokens, the repository's own slug;
  - the destructive label merge;
  - the App variable/secret rename;
  - the outbox-flush-first advice.
  CLAUDE.md was not edited here, to avoid a parallel-wave merge conflict.
- **72-15 (doctor)**: `checks-pin` FIX_LEGACY already names `aof-tools gh rebrand`. After a rebrand the legacy caller is gone, so W062 reads the new caller.
- **Carried item (b), deferred, not changed**: migration 0011's `recordObjectiveBases`, `readoptMapping` and `repairObjectiveBodies` still list only the configured or default AOForge labels. This TRD's files do not cover them, and the fix needs the 51-08 resume harness. If a backfill started under the old plugin halts when it resumes on 3.0.0, there are two ways out. Either run `aof-tools gh rebrand --apply` first (it renames the labels and rewrites the config label values, so the lookups find the issues), or finish the backfill on the old plugin.
- **Not covered**:
  - classic branch-protection required checks (only rulesets are read);
  - PR review comments (`pulls/comments`; AOForge writes none);
  - gen-1 `<!-- df:state -->` sticky comments (no namespace marker, so they are not "managed");
  - repositories with more issues or comments than `ghPaginate`'s cap (100 pages of 100). There the merge delete could miss carriers beyond the cap.
- **Live run**: none was made. Every test runs on the stub, on the gh-client/gh-wiki seams or on a local bare repository. Running the verb on a real repository is the later user checkpoint.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixture builder | TRD `node -e "...Object.keys(f.legacyRepoSnapshot())"` (absolute path) -> `[repo, labels, issues, comments, rulesets, wiki]`. Also checked: a stub label PATCH moves the issue's label and is recorded, and `localRepo()` tracks the 5 files with a clean status | 0 | PASS |
| 2: plan and dry run | `node --test gh-rebrand.legacy.test.cjs flag-spec.repo.test.cjs dispatch-completeness.test.cjs`, plus gh-seam, flag-guard-cli, rename-guard, help, help-delegation and gh-setup-cli | 0 (88/88, then 98/98) | PASS |
| 3: apply, idempotence, resume | `node --test gh-rebrand.legacy.test.cjs` (18/18) && `node --test lib/gh-*.test.cjs` (1998/1998) | 0 | PASS |
| verification | `node aof-tools.cjs gh rebrand --help` prints the gh usage with `rebrand [--repo <owner/name>] [--apply|--dry-run]` and the rebrand details. The fixture dry run (test 1) shows stub writes = 0 and git status unchanged | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2) | `node --test gh-rebrand.legacy.test.cjs` | 1 (`Cannot find module './gh-rebrand.cjs'`) | FAIL (correct) |
| GREEN (Task 2) | same + flag-spec, dispatch-completeness, gh-seam, flag-guard-cli, rename-guard, help | 0 (88 pass) | PASS (correct) |
| RED (Task 3) | `node --test gh-rebrand.legacy.test.cjs` | 1 (7 of 17 fail: `--apply is not wired yet` / no done-left payload / no wait_ms; tests 1-7, 11 still pass) | FAIL (correct) |
| GREEN (Task 3) | same | 1 at first (8, 9, 10: the fixture's wiki-push kind; see Deviations), then 0 (17/17, then 18/18 with test 14) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (final, in the worktree) | `node --test '<wt>/plugins/aoforge/**/!(micro).test.cjs' '<wt>/plugins/aoforge/**/*.test.js' '<wt>/plugins/devflow/**/*.test.js' '<wt>/scripts/**/*.test.cjs'` | 1: 11,883 tests, 11,824 pass, 51 skipped, 8 fail = the node-pty daemon suites only (aoforge-watch 3, handoff-e2e 5; a worktree has no node_modules) | PASS (baseline) |
| rebrand + seam after the last edit (`findProjectRoot`) | `node --test gh-rebrand.legacy.test.cjs gh-seam.repo.test.cjs` | 0 (29/29) | PASS |
| rename guard with the new files tracked | `node --test rename-guard.repo.test.cjs` | 0 (17/17) | PASS |

`npm test` was not run: it includes `micro.test.cjs`, which the dispatch says to exclude.

## Discovered commands

None. The test command came from the stack profile and the TRD.

## Estimate

`estimate trd 72-16`: 10 min (P90 19 min), $3.72 (P90 $6.01), 3 tasks, confidence medium. `estimate start` was not re-run: the wave-8 run state was already recorded. Measured: 50 min. The overrun has three sources:
- scope beyond the test list: the outbox base refresh, the ruleset name, the PR template, config `checks_workflow`, repository-slug masking and the App variable note;
- two tests added after the list: 13, the real client over the gh-client seam, and 14, the wiki path against a local bare remote;
- the full gate (about 2.5 minutes of wall time, plus the gh suites).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `gh` subcommands are dispatched in aof-tools.cjs, not gh.cjs**
- **Found during:** Task 2
- **Issue:** The TRD said to dispatch in gh.cjs, but every `gh <sub>` branch lives in `aof-tools.cjs` (`case 'gh'`).
- **Fix:** Added the `rebrand` branch there and named it in the unknown-subcommand list. gh.cjs is unchanged.
- **Commit:** ef3ede76

**2. [Rule 3 - Blocking] Two repo gates outside `files_modified`**
- **Found during:** Task 2
- **Issue:** `gh-seam.repo.test.cjs` test 23 requires every `gh-*.cjs` to be guarded. `flag-guard-cli.test.cjs` 15b requires PROBES to match FLAG_SPEC.
- **Fix:** gh-rebrand.cjs is in GUARDED, and the `gh rebrand` probe is in `flag-guard-fixtures.cjs`.
- **Commit:** ef3ede76

**3. [Rule 2 - Missing critical] Outbox base refresh (72-11 hand-off)**
- **Issue:** In store mode a rewritten managed body would read as a human edit at the next flush (managed hash) or TRD push (body hash) and halt it.
- **Fix:** `applyRebrand` refreshes the existing bases of rewritten issues and comment groups. Test 12 covers it.
- **Commit:** b5357f02

**4. [Rule 2 - Missing critical] More artefacts than the TRD listed**
- **Issue:** The TRD did not list these artefacts:
  - the legacy ruleset name: gh setup finds its ruleset by `aoforge: default branch` and would otherwise create a second one;
  - the PR template block (72-11 hand-off);
  - config.json `github.labels` (carried item a) and a legacy `checks_workflow`;
  - the case where both callers exist (the legacy one is removed, destructive).
- **Fix:** All are planned, and each is shown in the dry run. Tests 6 and 7 cover them.
- **Commits:** ef3ede76, b5357f02

**5. [Rule 2] The repository's own slug is never rewritten**
- **Issue:** A repository whose name holds a legacy word (`o/<legacy>-app`) would have its own links rewritten into a repository that does not exist.
- **Fix:** The slug is masked before both rewrites. Test 3b covers it.

**6. [Rule 1 - Bug] Fixture stub used `wiki-push`, the module and test 5 use `push`**
- **Found during:** Task 3 GREEN (tests 9 and 10: the second plan still had the wiki ops)
- **Issue:** The stub's own kind mismatch meant it never committed staged pages.
- **Fix:** Corrected in the fixture. Test 8's status regex was also corrected: a moved, then rewritten caller is `RM`, a staged rename with an unstaged rewrite.
- **Commit:** b5357f02

**7. [Rule 2] Run from a subdirectory**
- **Fix:** `runRebrand` resolves the project root with `compat.findProjectRoot`.
- **Commit:** b5357f02

### Choices the TRD left open, or where it was inexact

- **Help wording.** The TRD's help text names the legacy product. The rename guard forbids that literal in help.cjs, so the entry says "pre-rename GitHub artefacts" instead.
- **TDD sequencing.** The apply half was drafted while writing Task 2's GREEN. To keep Task 3's RED real, it was held out of the Task 2 commit (ef3ede76 answers `--apply` with "not wired yet") and restored after 3e3f541d. Tests 13 and 14 were added in the GREEN phase as checks of the real client, so they have no RED of their own. Test 13's dry-run half passed at RED.
- **Dry run and the wiki.** With the real client, the dry run reads the wiki through a scratch clone under the OS temp directory, removed afterwards. Nothing is written to the project or to GitHub.
- **Text outside managed sections changes only where it names the product.** For example, a person's `/<legacy>:status` and a TRD body's legacy CLI name stay as written; only the product name changes (test 3).

## Post-TRD Verification

- Auto-fix cycles used: 1 (the fixture kind mismatch, found by tests 9 and 10)
- Must-haves verified: 5/5
  - **Dry run** (tests 1-7): the sections, diffs and destructive merge, zero writes, git status unchanged.
  - **`--apply`** (tests 8-10c): fixed order; idempotent; stops at the first failure with done/left; resumes; rate limit stops with the wait.
  - **Managed only** (tests 3, 3b, 4): user text changes only where it names the product; PRESERVE and the repo slug are kept.
  - **Local changes** (tests 7, 8): uncommitted, with mode-specific commit steps; the printed file list is complete (a commit of exactly those files leaves a clean tree).
  - **Help and flag-spec** (test 11): help, flag-spec, the probe, the seam guard and dispatch-completeness all pass.
- Gate failures: none beyond the baseline (node-pty daemon tests in a worktree)

## Self-Check: PASSED

- **Files.** FOUND: `gh-rebrand.cjs`, `gh-rebrand.legacy.test.cjs` and `__fixtures__/legacy-rebrand-fixtures.cjs` in the worktree.
- **Commits.** FOUND on `df/exec-72-16-gh-rebrand-verb` (`git log 2982fa74..HEAD`): 9be0af0e, 33219075, ef3ede76, 3e3f541d and b5357f02. The tree was clean after b5357f02.
- **Tests.** The rebrand suite passes (18/18), and so do the gh suites (1998/1998). The full gate fails only on the node-pty daemon baseline.
- **No live call.** No real GitHub call was made. No label, issue, check or wiki on any real repository was touched.

