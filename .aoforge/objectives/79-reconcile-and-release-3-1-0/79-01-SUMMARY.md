---
objective: 79-reconcile-and-release-3-1-0
trd: "01"
subsystem: release-integration
tags: [merge, reconcile, 3.1.0, planning-layout, gitignore]
requires:
  - objective 78 (feat/remove-rename-shims, 20fe0db2)
  - fix/post-77-verification (7fced4d9)
provides:
  - "integrate/3.1.0 as one tree: merge commit afbe19a4 (parents e7fd81e7, 7fced4d9)"
  - "main's planning records for objectives 76/77 and quick 34-39 under .aoforge/"
  - "a loadable PreToolUse(Bash) dispatcher on the merged tree"
  - "the full-suite triage table routing every failure to 79-02..79-07"
affects: [79-02, 79-03, 79-04, 79-05, 79-06, 79-07, 79-08]
tech-stack:
  added: []
  patterns: ["one --no-ff merge, conflicts resolved as unions, records moved with git mv"]
key-files:
  created: []
  modified:
    - plugins/aoforge/aoforge/bin/aof-tools.cjs
    - plugins/aoforge/aoforge/bin/lib/help.cjs
    - plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs
    - plugins/aoforge/aoforge/bin/lib/ui-metrics.cjs
    - plugins/aoforge-stack-flutter/lib/flutter-ui-setup.cjs
    - plugins/aoforge-stack-flutter/lib/flutter-ui-setup.test.cjs
    - package.json
    - .claude-plugin/marketplace.json
    - site/data/aoforge.json
    - .aoforge/ROADMAP.md
    - .aoforge/STATE.md
    - .aoforge/REQUIREMENTS.md
    - CHANGELOG.md
    - CLAUDE.md
    - docs/USER-GUIDE.md
    - plugins/aoforge/hooks/pre-bash.js
    - .gitignore
    - plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
    - plugins/aoforge/aoforge/bin/lib/awareness.test.cjs
key-decisions:
  - "CLAUDE.md is resolved as a union with objective 78's shim facts winning (no pointer plugin, no env alias, 0012-0014 retired, one planning directory); main's compact skeleton, pre-bash, stack packs, mechanical verbs and model precedence folded in. The 200-line / 20,000-char budget is left to 79-07."
  - "The three pre-rename runtime leftovers on this machine are excluded in .git/info/exclude (local, untracked) instead of being kept in .gitignore or deleted."
metrics:
  duration: 24min
  started: 2026-10-17T02:52:08Z
  completed: 2026-10-17T03:15:43Z
  tasks: 3
  files: 19
tokens_input: 30550204
tokens_output: 97075
tokens_cache_read: 29863637
tokens_cache_write: 686275
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 79 TRD 01: Merge `fix/post-77-verification` into `integrate/3.1.0` Summary

**One signed `--no-ff` merge commit (afbe19a4) joins main's objectives 76/77, perf #133 and quick 34-39 to the objective 78 line, with all 15 conflicts resolved as unions, main's 18 planning records `git mv`ed into `.aoforge/`, the pre-bash dispatcher loading again, and the legacy `.gitignore` lines gone.**

## Progress
- [x] Task 1: Start the merge and resolve the nine code, manifest and data conflicts — afbe19a4 (staged into the merge commit)
- [x] Task 2: Resolve the six docs/planning conflicts, move main's planning records, commit the merge — afbe19a4
- [x] Task 3A: pre-bash drops the env alias objective 78 removed — ef2dae22
- [x] Task 3B: legacy ignore lines, their rename-guard ALLOW entry and awareness G2's twin removed; machine leftovers excluded locally — 85b5066c
- [x] Task 3C-D: smoke (`state load`, `validate health`) and full-suite triage, read-only (no commit of its own; recorded in this SUMMARY)

## Merge record

| Item | Value |
|---|---|
| PRE_MERGE_HEAD | e7fd81e76828a9f7f6e97f386be658b3be686aec (the objective-79 planning commit on top of 5c89d0b6) |
| fix/post-77-verification | 7fced4d900b128f010a9623fff97191c5a6c7f8d (unchanged since planning) |
| feat/remove-rename-shims | 20fe0db2d658c35a8259cadb123cf669d99344f4 (ancestor of HEAD before the merge: exit 0) |
| MERGE_COMMIT | afbe19a45ab99d63987d08f3362b2c8a5c4fbfd7, SSH-signed |
| HEAD^1 / HEAD^2 | e7fd81e7 / 7fced4d9 |
| `merge-base --is-ancestor` fix branch / shims branch | both exit 0 |
| Merge size vs PRE_MERGE_HEAD | 302 files changed, 17,313 insertions, 2,322 deletions (79 non-merge commits from the fix side) |

Pre-checks: branch `integrate/3.1.0`; `git status --porcelain` showed only `?? amp`. The merge ran as
`git -c merge.renameLimit=20000 merge --no-ff --no-commit fix/post-77-verification` and reported exactly the 15
planned conflict paths (no extra path, no modify/delete conflict). The merge was completed with
`git commit -F <message file>` while MERGE_HEAD existed; no rebase, squash, cherry-pick or `-X ours|theirs`.

## Conflict ledger

| Path | Integrate side (78 line) | Main side (fix branch) | Resolution |
|---|---|---|---|
| `plugins/aoforge/aoforge/bin/aof-tools.cjs` | nothing (78 deleted the alias call) | the `aliasLegacyEnv()` call plus the lazy-loading block | main's `lazyCache`/`loadLazy`/`lazy`/`lazyModule` kept, the three alias lines dropped; `rg aliasLegacyEnv` empty |
| `bin/lib/help.cjs` (validate `details`) | W066 broken/warning, W067 alone/beside, W069, the 3.0.x path | `--only 0012/0013` fixes plus the roadmap-coverage sentence | integrate sentence plus main's roadmap-coverage sentence verbatim; the 0012/0013 text dropped (retired) |
| `bin/lib/planning-mode.test.cjs` | describe `$HOME is never the main root (TRD 73-09)`, tests 17/18 | describe `resolveVerbRoot ... (quick 36)`, tests 6a-6e | both describe blocks complete, braces closed; `node --check` clean; 82/82 with ui-metrics and flutter-ui-setup |
| `bin/lib/ui-metrics.cjs` | `DEFAULT_PATHS = ['flutter/lib']`, single-name comment | `defaultPaths(cwd)` from active packs' `ui.metrics_paths`, comment "or a legacy one" | main's `defaultPaths`; `DEFAULT_PATHS` dropped; comment in 78's single-name wording |
| `plugins/aoforge-stack-flutter/lib/flutter-ui-setup.cjs` | `require('./watcher-state.cjs')` (core path) | `require('./core.cjs')('watcher-state.cjs')` plus a comment on a 3.0.0 `legacy` daemon record | pack's core loader, no legacy-record comment; `rg legacy` in the file finds nothing |
| `plugins/aoforge-stack-flutter/lib/flutter-ui-setup.test.cjs` | `handoff.cjs` and `compat.watchStateDir` (core paths) | `require('./core.cjs')('handoff.cjs')` only | both through the pack's core loader: `handoff.cjs` and `compat.cjs` `watchStateDir` |
| `package.json` `scripts.test` | core and scripts globs | adds `plugins/aoforge-stack-*/**/*.test.cjs` and the pointer plugin's `*.test.js` glob | main's globs minus the pointer plugin glob; version 3.1.0 |
| `.claude-plugin/marketplace.json` | no pointer entry | `aoforge-stack-flutter` 1.0.0, `aoforge-stack-web` 1.0.0, the pointer plugin 3.0.0 | the two pack entries kept, the pointer entry dropped; top level and aoforge entry 3.1.0; JSON parses |
| `site/data/aoforge.json` | 3.0.x data | 3.1.0 data | `checkout --theirs`, then regenerated by `node scripts/gen-docs-data.cjs` from the merged tree (v3.1.0, skills=32 agents=12 hooks=24 workflows=39 references=36 templates=31 commands=84) |
| `.aoforge/ROADMAP.md` | 72-75 executed, 78/79 sections, Progress rows 72-79 | 76/77 sections after the Progress table, Progress rows 72-77 (stale 72-75) | 76/77 sections (main's text, TRD lists kept) placed between 75 and 78; Progress rows: integrate's for 72-75/78/79, main's for 76/77; each of 74-79 exactly one section |
| `.aoforge/STATE.md` | Recent Decisions block extended | that block deleted (decision rotation, migration 0015) | integrate block kept (79-08 runs 0015); main's quick 34-39 rows already link `./quick/...`, which resolves after the move; no `.planning/` links to rewrite |
| `.aoforge/REQUIREMENTS.md` | EST-11 / TODO-01 traceability with evidence | EST-11 / TODO-01 Pending plus MEF-01..06, STK-01, PCK-01..04 rows | integrate's EST-11/TODO-01 rows plus main's 11 new rows; definitions merged cleanly; coverage line 0/30 to 28/41 (see deviations) |
| `CHANGELOG.md` | `## [Unreleased]` Added/Changed/Removed/Fixed (objectives 72-75, 78) | `## [3.1.0] - 2026-10-16` | `## [Unreleased]` with the integrate entries, then main's `## [3.1.0] - 2026-10-16`, then `## [3.0.0]` unchanged; 79-06 folds them |
| `CLAUDE.md` (4 hunks) | long form with 78's shim facts | compact rewrite (146 lines), transition note, budget comment, pre-bash, stack packs | hunk 1: budget comment kept, stale transition note dropped; hunk 2: integrate's detailed Core Tool bullets plus main's state digest/rotation, objective put/set-status, roadmap digest, model precedence, mechanical verbs, roadmap-coverage, `--tick`, `resolveVerbRoot`, migration 0015, stack packs; hunk 3: integrate's per-hook detail plus pre-bash.js and "via pre-bash", inject-handoff-results kept as registered (it is, in the merged hooks.json); hunk 4: main's state-digest pointer plus integrate's status paragraphs and one line on objective 79. Outside the hunks, main's marketplace bullet no longer claims the pointer plugin, the test-location line names the packs, and the intent paragraph keeps the integrate side's migration detail. dispatch-completeness and hook-inventory pass (12/12) |
| `docs/USER-GUIDE.md` | `route-results.js` row | `pre-bash.js` row | both rows; no main-side "for one release" shim claim remained |

## Records moved (18, `git mv`, one call per directory)

- `.planning/objectives/76-model-efficiency-and-stack-specific-content/{.gitkeep,76-STACK-ASSESSMENT.md,OBJECTIVE.md}` to `.aoforge/objectives/76-.../`
- `.planning/objectives/77-stack-packs-contract-and-extraction/{.gitkeep,77-GO-PACK-ASSESSMENT.md,OBJECTIVE.md}` to `.aoforge/objectives/77-.../`
- `.planning/quick/{34..39}-*/{NN-JOB.md,NN-SUMMARY.md}` (12 files) to `.aoforge/quick/`

`git ls-files .planning` prints nothing; the empty `.planning/{quick,objectives}` directories were removed with
`rmdir`, so `.planning` does not exist on disk. Against HEAD^2 every non-empty moved file is `R100` (text
unchanged). The two empty `.gitkeep` files pair with arbitrary empty files in rename detection, which is cosmetic.

## Local excludes added (`.git/info/exclude`, untracked)

```
# pre-rename runtime leftovers on this machine (objective 79; not in the repo)
/.devflow-handoff/
/.aoforge/.devflow-notices.json
/.aoforge/objectives/37-adopt-existing-repos/.devflow-handoff/
```

These three were the only `!!` paths that a legacy `.gitignore` line alone matched (`git check-ignore -v`:
lines 26 and 62). `devflow-companion/` is ignored by `node_modules/`, not by a legacy line. After the change,
`git status --porcelain` shows no new untracked path.

## ROADMAP section check (job-checker)

`rg -o '^### Objective 7[4-9]' .aoforge/ROADMAP.md | sort | uniq -c`, run as `rg -o` (one plain command, no pipe):

```
      1 ### Objective 74
      1 ### Objective 75
      1 ### Objective 76
      1 ### Objective 77
      1 ### Objective 78
      1 ### Objective 79
```

`rg -c '^### Objective (7[4-9]):' .aoforge/ROADMAP.md` prints 6.

## Smoke on the merged tree (Task 3C)

- `node plugins/aoforge/aoforge/bin/aof-tools.cjs --help` exits 0 (after Task 1) and `state load` returns the config
  and the STATE digest (after Task 3B).
- The dispatcher loads: the benign Bash payload `{"tool_name":"Bash","tool_input":{"command":"ls"},"session_id":"t"}`
  piped (as a file redirect) into `plugins/aoforge/hooks/pre-bash.js` under a scratch HOME exits 0 with no output and
  no stack trace. `rg aliasLegacyEnv plugins/aoforge/hooks plugins/aoforge/aoforge/bin/aof-tools.cjs` prints nothing.
- `validate health --raw`: status `degraded`, **no errors**; warnings W040 (stamped v3.0.0, 1 pending migration),
  W065 (objective 75 EST-11 not in any SUMMARY's requirements-completed) and W068 (149 decisions in STATE.md);
  I001 for the nine TRDs 79-02..79-10 with no SUMMARY yet. Not fixed here, per the TRD: W040/W068 are 79-08's
  upgrade (migration 0015), W065 is 79-05.

## Full-suite triage (Task 3D, read-only)

Run from the repo root with `HOME` set to an empty scratch directory, over the file list
`git ls-files -co --exclude-standard -- 'plugins/aoforge/*.test.cjs' 'plugins/aoforge/*.test.js'
'plugins/aoforge-stack-*/*.test.cjs' 'scripts/*.test.cjs'` (409 files) **minus
`plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs`** (excluded and named: its W-3 fish-shell test hangs on this
machine), so 408 files, as `env HOME=<S>/home xargs node --test < files.txt`. `node_modules` (node-pty) was present;
no symlink was needed.

| tests | suites | pass | fail | cancelled | skipped | todo | duration |
|---|---|---|---|---|---|---|---|
| 12,770 | 2,110 | 12,733 | 10 | 0 | 27 | 0 | 90.4 s |

Every failure, routed to exactly one TRD:

| # | Test file | Failing test | First assertion / error | Cause | Route |
|---|---|---|---|---|---|
| 1 | `plugins/aoforge/aoforge/bin/lib/context-budget.repo.test.cjs` | 1. CLAUDE.md stays under the line and character caps | `CLAUDE.md is 48941 chars (cap 20000)` | the CLAUDE.md union carries objective 78's long Core Tool and Hooks detail on main's budgeted skeleton (175 lines; the line cap holds, the char cap does not); this TRD deliberately did not meet the budget | 79-07 |
| 2 | `plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs` | 2: zero findings across the scan set minus EXEMPT minus legacy workflows | `CLAUDE.md:163  ui-eval → unknown` | the integrate side's "Where we left off" names `/aoforge:ui-eval --judge live`; objective 77 moved `ui-eval` into the `aoforge-stack-flutter` pack, so core no longer knows the command | 79-07 |
| 3 | `plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.test.cjs` | 25. quick put writes the worktree's legacy planning dir and says so; main gains nothing | exit `1 !== 0`; stderr `<wt> still uses the pre-rename planning directory .planning/, which AOForge no longer reads ...` | quick 36's cross-layout fixture (main on `.aoforge/`, worktree renamed to the pre-rename dir) now meets objective 78's legacy-layout guard, which refuses that layout | 79-04 |
| 4 | same file | 26. quick summary finds the task in the worktree and writes its SUMMARY there | exit `1 !== 0` | same fixture as 25 (its `quick put` precondition fails first) | 79-04 |
| 5 | same file | 27. summary checkpoint for an objective only the worktree has writes the worktree | exit `1 !== 0`; the same legacy-layout message | same cause | 79-04 |
| 6 | same file | 28. doc put PROJECT.md writes the worktree; main's PROJECT.md is unchanged | exit `1 !== 0`; the same legacy-layout message | same cause | 79-04 |
| 7 | same file | 29. planning draft seeds from the worktree's file; the draft stays under the MAIN repo key | exit `1 !== 0` | same cause | 79-04 |
| 8 | same file | s1. store config in main: summary checkpoint from the worktree writes MAIN's .trd-progress (D-14) | exit `1 !== 0`; the same legacy-layout message | same cross-layout fixture | 79-04 |
| 9 | `plugins/aoforge/aoforge/bin/lib/requirements-agreement.repo.test.cjs` | 11. no satisfied requirement is missing from every SUMMARY of its objective | `requirements-unlisted: objective 75 (75-VERIFICATION.md) marks EST-11 satisfied, but no SUMMARY ... lists it` | known pre-existing failure (objective 75 records) | 79-05 |
| 10 | `plugins/aoforge/aoforge/bin/lib/validate-requirements.test.cjs` | 9. this repository (read-only): validate requirements finds nothing | `actual: ['75-prospective-estimate-retest-and-todo-sweep:EST-11']` | same EST-11 record as #9 | 79-05 |

Nothing routes to 79-02, 79-03 or 79-06 from the suite: no compat import failure, no hook failure and no
CHANGELOG/version/site-data test failure on the merged tree (pre-bash.test.js 9/9; rename guard, legacy-names,
dispatch-completeness and hook-inventory pass). Their TRDs still own their non-suite work (below).

## Findings handed to other TRDs

- **for 79-02:** `plugins/aoforge/aoforge/bin/aof-tools.cjs` keeps main's lazy-loading comment, which lists `compat`
  among the modules that "stay eager"; with the alias call gone, aof-tools no longer requires compat at load (only a
  lazy `require('./lib/compat.cjs').planningRoot` at the config path, line ~1270). Reword the comment in the sweep. A
  `rg` for the five removed export names finds no `compat` caller: every hit is planning-layout's or coexistence's own
  detector, a fixture, or a test asserting the export is gone.
- **for 79-05:** `.aoforge/STACK.md` frontmatter still says `id: devflow-claude` (already in 79-05's scope: STACK.md
  under AOForge names).
- **for 79-06:** `CHANGELOG.md` holds `## [Unreleased]` (integrate) above `## [3.1.0] - 2026-10-16` (main) on purpose;
  fold them. Its line 3 still says "All notable changes to DevFlow". The marketplace aoforge description (main's text)
  says "32 skills, 12 agents"; `gen-docs-data` counts skills=32 agents=12, so it agrees today.
- **for 79-07:** CLAUDE.md is 175 lines / 48,941 chars against main's 200-line / 20,000-char cap (failure #1); the
  `/aoforge:ui-eval` mention at line 163 (failure #2); the "Objective 78 ... Reconciling with `main`" paragraph is now
  history (this TRD did the reconcile) and the new objective-79 line is interim.
- **for 79-08:** ROADMAP's milestone line still reads "v1.6 — Objectives 65–75 (in progress)" and its objectives list
  has no entries for 76/77 (main never added them); main's 76/77 TRD lists name TRD files main never committed (the
  objective directories hold only `.gitkeep`, the assessment and OBJECTIVE.md); STATE.md Current Position still says
  "Current focus: Objective 73" and "30 requirements mapped"; W040/W068 wait for the upgrade (migration 0015).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] REQUIREMENTS coverage line and ROADMAP's v1.6 requirement count follow the union**
- **Found during:** Task 2
- **Issue:** both sides kept `**Coverage:** 0/30 complete` and ROADMAP's "30 mapped to Objectives 65-75", but the union
  holds 41 requirement definitions (28 ticked) mapped to objectives 65-77.
- **Fix:** `**Coverage:** 28/41 complete` (counted from the file's own checkboxes) and "41 mapped to Objectives 65-77".
  The ROADMAP line sat outside a conflict hunk; it is the "N requirements" count line the gotchas asked to adjust.
- **Files modified:** `.aoforge/REQUIREMENTS.md`, `.aoforge/ROADMAP.md`
- **Commit:** afbe19a4

**2. [Rule 1 - Bug] CLAUDE.md statements outside the conflict hunks that contradicted objective 78**
- **Found during:** Task 2
- **Issue:** main's merged-in (non-conflicting) marketplace bullet still described the pointer plugin and its generator
  as shipping; the test-location line omitted the stack packs; main's Draft hook group listed `inject-handoff-results.js`
  as unregistered while the merged hooks.json registers it (objective 73).
- **Fix:** marketplace bullet rewritten to 78's fact (pointer removed in 3.1.0, `POINTER_MAJOR` still recognised);
  packs added to the test location; the Draft group keeps only `inject-org-context.js`. hook-inventory and
  dispatch-completeness pass on the result.
- **Files modified:** `CLAUDE.md`
- **Commit:** afbe19a4

### Plan notes (not deviations)

- Tasks 1 and 2 share the merge commit by design: Task 1 stages its nine paths into the in-progress merge and Task 2
  commits it. The SUMMARY joined the commits from Task 3A on, so the merge commit carries no file outside the merge.
- The TRD's `# tests/# pass` lines are TAP; node's default reporter wrote the spec form (`ℹ tests ...`), read
  instead. A wait loop keyed on the TAP line never matched and was stopped after the suite finished.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: nine code/manifest/data conflicts | `git diff --name-only --diff-filter=U` (only the six docs/planning paths left) | 0 | PASS |
| 1 | `rg -n '^(<<<<<<< \|>>>>>>> )' plugins/aoforge/aoforge/bin plugins/aoforge-stack-flutter/lib package.json .claude-plugin site/data` (no output) | 1 (no match) | PASS |
| 1 | `node -e ...version` for package.json, plugin.json, marketplace.json (+ aoforge entry) | 0 | PASS (3.1.0 x4) |
| 1 | `node plugins/aoforge/aoforge/bin/aof-tools.cjs --help` | 0 | PASS |
| 1 | `node --check` on the six .cjs files; `node --test planning-mode.test.cjs ui-metrics.test.cjs flutter-ui-setup.test.cjs` (scratch HOME) | 0 | PASS (82/82) |
| 2: docs/planning conflicts, moves, merge commit | `git rev-parse HEAD HEAD^1 HEAD^2` = afbe19a4 / e7fd81e7 / 7fced4d9 | 0 | PASS |
| 2 | `git merge-base --is-ancestor fix/post-77-verification HEAD` and `... feat/remove-rename-shims HEAD` | 0, 0 | PASS |
| 2 | `git ls-files .planning` (empty); `.aoforge/quick/3[4-9]-*` 12 files; 76/77 dirs 6 files | 0 | PASS |
| 2 | `rg -n '^(<<<<<<< \|>>>>>>> )' .aoforge CHANGELOG.md CLAUDE.md docs/USER-GUIDE.md` (no output) | 1 (no match) | PASS |
| 2 | `rg -n '^## \[(Unreleased\|3\.1\.0\]\|3\.0\.0\])' CHANGELOG.md` (7, 201, 397: each once, in order) | 0 | PASS |
| 2 | `rg -c '^### Objective (7[4-9]):' .aoforge/ROADMAP.md` = 6, each of 74-79 once | 0 | PASS |
| 3A | `node --test plugins/aoforge/hooks/pre-bash.test.js` (scratch HOME) | 0 | PASS (9/9) |
| 3A | `env HOME=<S>/home node plugins/aoforge/hooks/pre-bash.js < payload.json` | 0 | PASS (no trace) |
| 3B | `rg -n -e '\.planning/' -e 'devflow' .gitignore` (no output) | 1 (no match) | PASS |
| 3B | `node --test rename-guard.repo.test.cjs awareness.test.cjs legacy-names.legacy.test.cjs` (scratch HOME) | 0 | PASS (137 pass, 9 skipped) |
| 3C | `aof-tools state load`; `aof-tools validate health --raw` | 0; 0 | PASS (degraded: W040/W065/W068, no errors) |
| 3D | full suite minus watcher-shell (408 files, scratch HOME) | 1 | RECORDED (10 failures, all routed above) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (loop, scoped) | `node --test {files}` per task (above) | 0 | PASS |
| test (task gate, as the triage) | `env HOME=<scratch> xargs node --test < files.txt` (npm test's globs, watcher-shell.test.cjs excluded and named) | 1 | FAIL as expected for a pre-wave-2 tree: 10 failures, each routed to 79-04, 79-05 or 79-07 |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (one merge commit with the right parents and ancestry; 15 paths marker-free with both
  sides' behaviour; `git ls-files .planning` empty; 3.1.0 in all three manifests and the aoforge entry; pre-bash loads
  and `state load` runs; `.gitignore` has no legacy line, its ALLOW entry and G2's twin are gone, rename guard passes;
  triage table routes every failure)
- Gate failures: the full-suite gate, by design at this point (triage above)

## Self-Check: PASSED

- FOUND: `.aoforge/objectives/77-stack-packs-contract-and-extraction/OBJECTIVE.md`
- FOUND: `.aoforge/quick/39-move-remaining-web-and-flutter-procedure/39-SUMMARY.md`
- FOUND: `plugins/aoforge/aoforge/bin/aof-tools.cjs` contains `function lazyModule` (1)
- FOUND: `plugins/aoforge/hooks/pre-bash.js` contains `DISPATCHED_HOOKS`, no `aliasLegacyEnv`
- FOUND: afbe19a4 (merge, parents e7fd81e7 + 7fced4d9), ef2dae22, 85b5066c in `git log`
