---
objective: 79-reconcile-and-release-3-1-0
trd: "02"
subsystem: release-integration
tags: [guard, compat, repo-test, reconcile, 3.1.0, sc-2]
requires:
  - "79-01 (the merged integrate/3.1.0 tree, afbe19a4 and its two fixes)"
  - "objective 78 (compat.cjs single-name, SC-2)"
provides:
  - "reconcile-guard.repo.test.cjs: a repo test that fails on a reference to a compat export that does not exist, on the five removed names, and on a tracked pre-rename planning path"
  - "the rename, stack-neutrality, compat-entry, legacy-names and reconcile guards green on the merged tree with no new ALLOW entry"
affects: [79-03, 79-04, 79-05, 79-06, 79-07, 79-08]
tech-stack:
  added: []
  patterns: ["a small lexer (comments, strings, templates, regex literals blanked) plus regexes, so a reference is resolved by the module it comes from, not by a name search"]
key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/reconcile-guard.repo.test.cjs
  modified:
    - plugins/aoforge/aoforge/bin/aof-tools.cjs
key-decisions:
  - "The guard reads compat's export list from the module (Object.keys of the compat.cjs inside the checked root), never a hard-coded copy; a reference to a name not in it is `bad`, a reference to one of the five removed names is `removed` (a separate list, so each failure appears once), and compat exporting a removed name again fails case 3 on its own."
  - "The pre-rename planning path check is root-level (`git ls-files -- <LEGACY.planningDir>`), as the objective states it; a nested tracked fixture directory with that name is not flagged."
  - "A file that mentions compat.cjs and that the lexer cannot finish is reported (`unlexable`) and fails case 2: the guard must not be blinded silently by a file it cannot read."
metrics:
  duration: 12min
  started: 2026-10-17T03:18:02Z
  completed: 2026-10-17T03:30:00Z
  tasks: 3
  files: 2
tokens_input: 13267870
tokens_output: 87188
tokens_cache_read: 13036522
tokens_cache_write: 231194
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 79 TRD 02: A repo guard for compat imports and the legacy planning path, and the wave-2 sweep Summary

**`reconcile-guard.repo.test.cjs` makes the 79-01 class impossible to bring back: it resolves every compat reference in 177 tracked source files against compat's real 14-name export list, forbids the five removed names and a tracked pre-rename planning path, and bites on a scratch-repo mutation; the five guards pass on the merged tree and no wave-2 triage row was routed here.**

## Progress
- [x] Task 1: RED then GREEN reconcile-guard.repo.test.cjs with its scanner and mutation proof — ea51fff8 (RED), a5a26af2 (GREEN), 341cb9f8 (header note)
- [x] Task 2: Run the rename, neutrality, compat-entry, legacy-names and reconcile guards over the merged tree; fix findings at their source; sweep the prompts for 3.0.0 shim prose — e38cd8f8
- [x] Task 3: Confirm no 79-01 triage row is routed to 79-02, and run file-identities.legacy.test.cjs, planning-layout.legacy.test.cjs and the pack and scripts domain suite — (this commit; no code change was needed)

## What was built

`plugins/aoforge/aoforge/bin/lib/reconcile-guard.repo.test.cjs` (30 subtests under the 10 listed cases):

- **Scanner.** `lex(text)` blanks comments, string and template bodies and regex literals (offsets, newlines and
  delimiters kept, so line numbers hold; a template's `${...}` is code). The one string body that survives is a call
  argument naming `compat.cjs`, which is what a reference is resolved from. `scan`/`compatRefs(text)` then finds, on the
  blanked text: destructuring from a compat require (multi-line, renames, defaults, rest skipped), `require(...).name`
  (including optional chaining and the hooks' fail-open try/catch), a bound identifier and its dot uses and its own
  destructuring, and a pack's `require('./core.cjs')('compat.cjs')` / `core('compat.cjs')`. Absence probes
  (`typeof`, `=== undefined`, `, undefined)`) are not references; `'x' in compat` and `compat[name]` never were.
  A same-named export required from planning-layout, coexistence or a fixture is a different module, so it is not found.
- **Tree check.** `checkTree(root)` returns `{bad, removed, legacyPaths, unlexable}` from `git ls-files` under
  `plugins/` and `scripts/`, with the export list read from the compat.cjs inside `root`.
- **Real tree (cases 1-3).** `legacyPaths`, `bad` + `unlexable`, and `removed` + "compat exports a removed name again"
  must all be empty; case 3's message names SC-2 of objective 79 and says to fix the caller, not compat.cjs. The five
  names are built from parts (`rg` for the joined spellings finds nothing in the file).
- **Mutation (case 4).** A scratch `git init -b main` repository (global and system git config off, scratch HOME) holding
  a copy of compat.cjs: one call to a removed export lands in `removed`, the same repo without it passes, an unknown name
  lands in `bad`, a tracked pre-rename planning path lands in `legacyPaths`, and an unfinished template literal lands
  in `unlexable`.

Lexer sanity (one-off, not in the suite): all 818 tracked `.js`/`.cjs` files under `plugins/` and `scripts/` lex to a
clean end; 177 mention `compat.cjs`; the scan finds all 14 compat exports in use (planningRoot 113, planningRel 46,
findProjectRoot 47, planningDirLabel 32, PLANNING_DIR_NAMES 21, planningDirName 16, isOwnAgentType 13, watchStateDir 13,
userDotFile 12, isPlanningDirName 7, isUserHome 6, runtimeHome 6, isOwnExecutor 5, userHomeDir 1) and nothing else; the
whole lex takes about 0.4 s.

## Guard results on the merged tree

| Guard | Command (scratch HOME) | Result |
|---|---|---|
| reconcile (new) | `node --test plugins/aoforge/aoforge/bin/lib/reconcile-guard.repo.test.cjs` | 30/30 pass |
| rename | `node --test .../rename-guard.repo.test.cjs` | 20/20 pass (50/50 together with the reconcile file), no new ALLOW entry |
| stack-neutrality | `node --test .../stack-neutrality.repo.test.cjs` | 7/7 pass, no new ALLOW entry |
| compat-entry + legacy-names | `node --test .../compat-entry.repo.test.cjs .../legacy-names.legacy.test.cjs` | 33/33 pass |
| all five together | one `node --test` over the five files | 90/90 pass, 0 skipped |

Neither the rename guard nor the neutrality guard raised a finding, so there was nothing to fix at a source and no
ALLOW entry was added or needed.

## 79-01 triage ledger (rows routed to 79-02)

79-01's suite triage routed **no failing test to 79-02** (its own words: no compat import failure, no hook failure, no
CHANGELOG/version/site-data failure). The ledger is therefore empty by construction. What was done instead:

| Item | Test | Result | Commit |
|---|---|---|---|
| main-modified legacy tests still describe 78's rules | `file-identities.legacy.test.cjs`, `planning-layout.legacy.test.cjs` | 68/68 pass; the latter pins W066 `broken` for a legacy-only project, W067 fixes without `--only`, and a `RETIRED` regex (`--only 001[23]`, "for one release") | none needed |
| pack and scripts domain | `node --test 'plugins/aoforge-stack-*/**/*.test.cjs' 'scripts/**/*.test.cjs'` | 557/557 pass | none needed |
| handoff "for 79-02": aof-tools lazy-loading comment | no test; reworded | the comment no longer lists compat among the modules that stay eager (only `planning sibling-trd-scan` requires it, lazily) | e38cd8f8 |

79-01's other handoff (no caller of the five removed compat exports) is now enforced by case 3 instead of asserted by a
one-off `rg`.

## Prose sweep (Task 2)

`rg -n -e "for one release" -e "only 0012" -e "only 0013" -e "only 0014" -e "pointer plugin" -e "or a legacy one"` over
skills, agents, workflows, references, templates, both stack packs and scripts: **no hit**, so nothing to correct. A
wider sweep (`one-release`, `shim`, `legacy planning/directory/runtime`, `3.0.0`, `3.0.x`, `df-`) over the same trees
(tests and fixtures excluded) found only these, all kept:

- `scripts/ci-unit-gate.cjs`, `scripts/estimate-window-eval.cjs`, `plugins/aoforge-stack-flutter/lib/flutter-ui-eval.cjs`,
  `bin/lib/helpers.cjs`: `df-...` temp-directory and file prefixes (not a shim claim).
- `scripts/aoforge-rename.cjs`: the codemod spells the legacy names on purpose (its SKIP/PRESERVE lists and the rename guard
  share them); it is the tool, not a prompt.
- `scripts/gen-docs-data.cjs:170`: the coexistence-guard description, already in 3.1 wording.
- `plugins/aoforge/agents/executor.md:62`: `.df-worktrees/` is the real worktree directory name.
- `references/model-profiles.md` (lines 24, 136, 194-210), `references/model-profiles.json` (header comment),
  `references/escalation-policy.md:25`, `templates/codebase/structure.md` (129, 151-152): the `df-` agent-key spelling that
  `resolve-model` normalises (TRD 28-02, still true and pinned by `model-profiles.test.cjs`) and 2.x agent names in
  examples. They are older naming, not a 3.0.0 shim described as working, so they are outside this sweep (listed under
  findings).

## Deviations from Plan

None - TRD executed as written. Two notes that are not deviations:

- Task 1 produced a third commit (341cb9f8, a header comment naming the one reference form the guard does not cover,
  the `lazy('<path>', [names])` forwarders of aof-tools.cjs: none points at compat today).
- Task 3 needed no code change, so it has no commit of its own; its evidence is below and its checkpoint rides the final
  SUMMARY commit.

## Findings handed to other TRDs

- **Environment, for the orchestrator and every wave-2/3 full-suite run (not a code defect):** with `HOME=$(mktemp -d)` on
  macOS the HOME lands under `/var/folders/`, which `repo-state.isScratchDir` treats as a scratch prefix. Then
  `project-state.test.cjs` cases 23 and 29 and `classify-session.test.js` S3 fail (their brownfield fixture is built under
  `$HOME/.aoforge-test-fixtures/`). With `HOME` set to a directory outside `/var/folders` and `/tmp` (here a folder under the
  Claude scratchpad) those three files pass 56/56. My full-suite run therefore shows 13 failures, 10 of them 79-01's
  routed rows and 3 of them this artifact.
- **for 79-04:** `planning-verbs-worktree.test.cjs` 25-29 and s1 still fail on the merged tree exactly as 79-01 routed them
  (quick 36's cross-layout fixture meets 78-07's legacy-layout refusal). Unchanged by this TRD.
- **for 79-05:** `requirements-agreement.repo.test.cjs` 11 and `validate-requirements.test.cjs` 9 (EST-11 in objective 75)
  still fail, unchanged. `.aoforge/STACK.md` Layout still says `plugins/devflow/` (the stack context printed at executor
  start shows it).
- **for 79-07:** `context-budget.repo.test.cjs` 1 (CLAUDE.md 48,941 chars vs the 20,000 cap) and `doc-refs.repo.test.cjs` 2
  (`ui-eval` at CLAUDE.md:163) still fail, unchanged.
- **Unowned, comment-only, outside every wave-2 file list (suggested edits; I did not touch them because they are not named
  by a triage row or a guard finding):**
  - `plugins/aoforge/aoforge/bin/lib/gh-check.cjs:15`: "CONTEXTS stays AOForge-only: gh-check-cli posts each verdict under
    the legacy twin as well, for one release." is false in 3.1 (`gh-check-cli.cjs:12`: TRD 78-03 posts once; 3.0.0 posted
    the twin). Suggest: "gh-check-cli posts each verdict once, under the AOForge context (TRD 78-03)."
  - `plugins/aoforge/aoforge/bin/lib/gh-rebrand.cjs:9`: "72-11 keeps all of that readable for one release" is stale for the
    label twins (78-09) and the check-context twin (78-03). Suggest: "3.0.0 (TRD 72-11) kept all of that readable for one
    release; 3.1 no longer reads the label and check-context twins (TRDs 78-03, 78-09), so this verb renames it, one
    repository at a time, after a full preview."
- **Optional, any later pass:** the `df-` prose in `references/model-profiles.md`, `references/escalation-policy.md` and
  `templates/codebase/structure.md` (above) names agents the way DevFlow 2.x did.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 RED | `env HOME=$(mktemp -d) node --test plugins/aoforge/aoforge/bin/lib/reconcile-guard.repo.test.cjs` | 1 | PASS (27 fail, all `compatRefs`/`checkTree is not defined`) |
| 1 GREEN | same command | 0 | PASS (30/30) |
| 1 | `rg -n -e "alias""LegacyEnv" -e "resolve""UserFile" plugins/aoforge/aoforge/bin/lib/reconcile-guard.repo.test.cjs` | 1 (no match) | PASS |
| 2 | the four guard commands above, then all five in one run | 0 | PASS (90/90) |
| 2 | `rg` prose sweep (six TRD terms) over the prompt and pack trees | 1 (no match) | PASS |
| 2 | `node --check plugins/aoforge/aoforge/bin/aof-tools.cjs`; `aof-tools --help` | 0 | PASS |
| 3 | `node --test file-identities.legacy.test.cjs planning-layout.legacy.test.cjs` | 0 | PASS (68/68) |
| 3 | `env HOME=$(mktemp -d) node --test 'plugins/aoforge-stack-*/**/*.test.cjs' 'scripts/**/*.test.cjs'` | 0 | PASS (557/557) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `env HOME=$(mktemp -d) node --test plugins/aoforge/aoforge/bin/lib/reconcile-guard.repo.test.cjs` | 1 | FAIL (correct): 27 of 27, `ReferenceError: compatRefs is not defined` (23) and `checkTree is not defined` (4) |
| GREEN | same | 0 | PASS (correct): 30/30 |

Two defects in my first GREEN were caught by the RED-authored cases and fixed in the same task: the bound-identifier scan
matched `compat.cjs` inside the require's own path (fixed by blanking require sources before scanning identifier uses), and
the pack form needed the `require('<loader>')('compat.cjs')` shape rather than a bare `)(`.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (loop, scoped) | `node --test {files}` per task (above) | 0 | PASS |
| test (task gate, whole suite) | `env HOME=<scratch> xargs node --test < files.txt`: npm test's globs (409 files), `watcher-shell.test.cjs` excluded and named (its W-3 fish-shell test hangs on this machine), `node_modules` symlinked for node-pty and removed afterwards | 1 | 12,800 tests, 12,760 pass, 13 fail, 27 skipped: 10 are 79-01's routed rows (79-04, 79-05, 79-07), 3 are the `/var/folders` HOME artifact above and pass 56/56 with another HOME. None is in this TRD's domain |

## Post-TRD Verification

- Auto-fix cycles used: 2 (both inside Task 1 GREEN, see TDD Evidence)
- Must-haves verified: 6/6 (the repo test names `file:line:name` for destructuring, member, bound and pack forms and ignores
  absence probes and other modules' same-named exports; the five removed names fail case 3 with an SC-2 message and are
  built from parts; a tracked pre-rename planning path fails case 1; the scratch-repo mutation fails and the real tree
  passes; the rename and neutrality guards pass with no new ALLOW entry; no triage row was routed to 79-02)
- Gate failures: the whole-suite gate, only by rows owned by 79-04, 79-05 and 79-07 and by the HOME artifact

## Self-Check: PASSED

- FOUND: `plugins/aoforge/aoforge/bin/lib/reconcile-guard.repo.test.cjs`
- FOUND: ea51fff8, a5a26af2, e38cd8f8, 341cb9f8 in `git log`
- FOUND: `aof-tools.cjs` comment reworded (compat no longer listed as eager); `git status --short` clean before this SUMMARY
