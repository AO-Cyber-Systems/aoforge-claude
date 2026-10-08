---
objective: 42-codebase-aware-stack-drafter
job: 42-03
trd: "03"
subsystem: stack-drafter
tags: [ci-parsing, shell-normalisation, classification, github-actions, stack-init]

requires:
  - objective: 35-stack-profile
    provides: stack-evidence.cjs (the line scraper this replaces), STANDARD_KEYS, the profile schema key pattern
provides:
  - stack-shell.cjs, shell text to logical invocations (normalizeScript, splitTopLevel, splitWords, isFragment, findHeredocs, DROP_TOOLS, DROP_SUBCOMMANDS)
  - stack-ci.cjs, structural GitHub Actions reader (parseWorkflows, _parseWorkflowText)
  - stack-classify.cjs, ordered CLASSIFY_TABLE plus classifyInvocation, classifyUses, lookupUses, WEAK_MARKERS, USES_MAP, STANDARD_KEYS_EXT
  - __fixtures__/stack-ci-fixtures.cjs, hand-built workflow builders, one per observed failure shape
affects: [42-06 stack-verify, 42-07 drafter, 42-08 report]

tech-stack:
  added: []
  patterns:
    - "Quote/$()/${{ }}-aware single-pass scanner instead of regex splitting; skip* primitives return the index past a construct and never throw"
    - "Two-phase YAML line reader: collect raw steps and defaults, resolve cwd and normalise run bodies at document end, so key order never matters"
    - "Classification as ordered data rows { key, form, tool, match }; specificity is row order and a test pins it"
    - "A hint (target/script name) is a low-confidence tiebreaker for opaque wrappers only"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-ci-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/stack-shell.cjs
    - plugins/devflow/devflow/bin/lib/stack-shell.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-ci.cjs
    - plugins/devflow/devflow/bin/lib/stack-ci.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-classify.cjs
    - plugins/devflow/devflow/bin/lib/stack-classify.test.cjs
  modified: []

key-decisions:
  - "sast is emitted by the classifier (gosec, semgrep, codeql); collapsing sast into audit when no audit exists stays 42-07's job, as the TRD states"
  - "test/[/[[ conditionals are dropped UNLESS they contain a command substitution, because test -z \"$(gofmt -l .)\" is a real format gate the research table lists"
  - "if/elif/while/until/then/do/else/! are stripped as prefixes so the command they introduce is still seen; bare control words still yield nothing"
  - "A cd persists for the rest of the script except inside a ( ... ) subshell line, matching shell semantics"
  - "cwd null means repo root; a cd back to the root normalises to null; unresolvable targets ($HOME, cd -) leave cwd unchanged"
  - "A pipeline is judged by its first stage; a gofmt -l piped into a filter is not flagged never-fails because the author composed an exit condition"
  - "Job-level continue-on-error: true is inherited by steps that do not set their own (extension beyond the step-only wording)"
  - "STANDARD_KEYS is duplicated in stack-classify.cjs rather than imported, to keep it free of fs; a test pins the two lists together"

patterns-established:
  - "Invocation record shape { text, tool, argv, cwd, env }, argv[0] is the tool, text keeps quotes, argv drops them"
  - "Classification result shape { key, form, tool, weak, confidence }; form is check | apply | build | mutate"

requirements-completed: [SDR-02]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 45min
completed: 2026-09-29
tokens_input: 12288986
tokens_output: 178689
tokens_cache_read: 11966799
tokens_cache_write: 322062
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 42 TRD 03: Structured CI parsing, shell normalisation and semantic classification Summary

**Three pure modules that read CI the way a shell and a workflow do, so a continued `gosec \` block is one command, `helm lint` is `lint_helm`, `npx playwright test` is `e2e`, and every fleet fragment class (dangling `\`, `-fmt` flag, comment-as-test, echo-as-build, `test -f x || {`) is gone at unit level.**

Nothing is wired into `stack init` yet (that is 42-07) and `stack-evidence.cjs`, `stack-profile.cjs` and `stack-render.cjs` are untouched.

## Performance

- 3 tasks, each RED then GREEN: 6 commits
- 7 files created, 0 modified
- 311 new tests (101 shell, 44 CI, 166 classifier); 0 failing

## Accomplishments

- `stack-shell.cjs`: joins odd-backslash continuations (`\\` is a literal), skips heredoc bodies and the command that consumes them, splits on newline / `&&` / `;` only at top level outside quotes, `$( )`, backticks, `${ }` and `${{ }}`, peels env / `sudo` / `time` / `env` / control-word prefixes, consumes `cd` into `cwd`, and applies the table-driven drop rules.
- `stack-ci.cjs`: an indentation-tracking reader (no YAML library) that records job, step name, `uses`, effective cwd (step > job > workflow), `continue-on-error`, workflow `schedule`, and logical invocations. Block scalars are consumed wholesale so a `script: |` under `with:` cannot forge steps. It resyncs on a dash at the steps-list indent, handles `|`, `>`, chomping indicators, CRLF, BOM, multi-document files, flow maps and anchors, and never throws.
- `stack-classify.cjs`: 81-row ordered `CLASSIFY_TABLE`, `USES_MAP`, `WEAK_MARKERS`, wrapper unwrapping (`npx`, `pnpm exec`, `python -m`, `go run <module>`, `dart run`), hint tiebreak for opaque wrappers, `test -z "$(...)"` unwrapping.

## Task Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 | RED | 1c71194 | test(42-03): add failing tests for stack-shell normaliser and CI fixtures |
| 1 | GREEN | 08ae517 | feat(42-03): add stack-shell normaliser (continuations, top-level split, drop rules, cd/env peeling) |
| 2 | RED | 48eba40 | test(42-03): add failing tests for stack-ci structural workflow reader |
| 2 | GREEN | eb023c8 | feat(42-03): add stack-ci structural workflow reader (job/step/cwd/uses, block scalars via stack-shell) |
| 3 | RED | 839b4a6 | test(42-03): add failing tests for stack-classify semantic table |
| 3 | GREEN | e1ba133 | feat(42-03): add stack-classify semantic table (tool-semantics rows, weak markers, uses map, hint tiebreak) |

The TRD defines no REFACTOR phase; none was needed.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixtures + stack-shell | `node --test plugins/devflow/devflow/bin/lib/stack-shell.test.cjs` | 0 (101/101) | PASS |
| 2: stack-ci | `node --test plugins/devflow/devflow/bin/lib/stack-ci.test.cjs plugins/devflow/devflow/bin/lib/stack-shell.test.cjs` | 0 (44 + 101) | PASS |
| 3: stack-classify | `node --test plugins/devflow/devflow/bin/lib/stack-classify.test.cjs` | 0 (166/166) | PASS |

Composition check (TRD verification section), `parseWorkflows` then `classifyInvocation` over the mixed fixture: `gosec ./...` sast, `govulncheck ./...` audit, `helm lint chart/` lint_helm, `npx playwright test` e2e, `go vet ./...` lint, `go test -race -coverprofile=c.out ./...` test, `flutter analyze --no-fatal-infos` lint with weak `--no-fatal-infos`. The reproduced research defect now yields `gosec -exclude=G304 -fmt sarif ./...`, `helm lint chart/`, `flutter build ipa --build-number="${{ inputs.buildNumber }}"` with no trailing `\` and no fragment.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (stack-shell) | `node --test .../stack-shell.test.cjs` | 1 (`MODULE_NOT_FOUND`) | FAIL (correct) |
| GREEN (stack-shell) | same | 0 (101/101) | PASS (correct) |
| RED (stack-ci) | `node --test .../stack-ci.test.cjs` | 1 (`MODULE_NOT_FOUND`) | FAIL (correct) |
| GREEN (stack-ci) | same | 0 (44/44) | PASS (correct) |
| RED (stack-classify) | `node --test .../stack-classify.test.cjs` | 1 (`MODULE_NOT_FOUND`) | FAIL (correct) |
| GREEN (stack-classify) | same | 0 (166/166) | PASS (correct) |

The RED failures are module-not-found rather than assertion failures because each test file's first act is to `require` a module that does not exist yet.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (stack/adopt subset) | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` | 0 (509/509) | PASS |
| wave (full suite) | `NODE_PATH=/Users/justin/dev/devflow-claude/node_modules npm test` | 1 (known failure only) | PASS |

Full suite: tests 4589, pass 4556, fail 1, skipped 32. Baseline before this wave was tests 4278, pass 4245, fail 1, skipped 32, so the delta is exactly +311 tests, +311 passing. The single failure is the known `MA-7 doctl auth init ...` case inside the `handoff pipeline — PTY-path mock auth (TRD 19-05)` suite.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] First full-suite run failed 11 daemon tests because the worktree has no node_modules**
- **Found during:** wave gate
- **Issue:** the first `npm test` reported fail 11 (`devflow-watch start (foreground)`, `multi-project CLI`, and the `handoff pipeline — end-to-end` suite). The daemon log showed `Cannot find module 'node-pty'`: a fresh git worktree carries no `node_modules`, so every test that spawns the real daemon cannot start it. My change adds only files that nothing else imports.
- **Fix:** none to the code. Re-ran the gate with `NODE_PATH=/Users/justin/dev/devflow-claude/node_modules` (no install, no symlink, worktree untouched). `devflow-watch.test.cjs` went 22/22, and the full suite returned to the baseline failure set.
- **Files modified:** none

**2. [Rule 1 - Bug, in my own test] Two test assertions were wrong on first run**
- **Found during:** Task 2 RED authoring and Task 2 GREEN
- **Issue:** (a) a stray malformed assertion in the `>` folding test, caught before the RED commit; (b) a miscount (4 instead of 3 steps) in the `usesActionsShape` test, caught when GREEN ran. The implementation was correct in both cases.
- **Fix:** (a) removed the line before committing, so it is already fixed in RED commit 48eba40. (b) corrected to 3 and added an assertion on the exact `uses` list; that edit is in GREEN commit eb023c8, which therefore also touches `stack-ci.test.cjs`.
- **Commit:** 48eba40 (a), eb023c8 (b)

### Additions beyond the TRD text (all inside `files_modified`)

- Extra fixture builders `scheduleShape`, `multiFileShape`, `malformedShape`, and an exported `TEXT` map, needed for TRD tests 9 and 10.
- Extra exports: `splitWords`, `findHeredocs`, `DROP_SUBCOMMANDS` (stack-shell); `lookupUses` (stack-classify).
- Extra table rows beyond the research table: `go fmt`, `gotestsum`, `yarn/pnpm/bun` equivalents of `npm test/build/audit`, `outdated` (needed because `outdated` is in `STANDARD_KEYS_EXT`), and the `--fix` apply variants of `eslint`, `ruff check` and `golangci-lint run`.
- The stray side effect of my daemon probe: reproducing the failure ran `devflow-watch start` once against the real `$HOME`, appending a few lines to `~/.devflow/devflow-watch.log`. It exited immediately and removed its own PID file.

## Auth Gates

None.

## Known Limitations

- `with:` inputs (for example `working-directory` under a `golangci-lint-action` step) are deliberately not read as the step cwd; a `uses:` step's cwd is therefore the workflow/job default.
- Multi-line plain or quoted `run:` scalars (a value continued on following lines without `|` or `>`) are not joined.
- `cd` targets built from variables other than `$GITHUB_WORKSPACE` are unresolvable and leave cwd unchanged.
- The hint token list is an English-word map applied to target/script NAMES only; it is a low-confidence tiebreaker by design.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (continuation join; drop rules and top-level splitting; per-step cwd/uses/continueOnError/schedule; classifier semantics incl. sast/audit/lint_helm/e2e/format forms; and the artifacts/key_links)
- Gate failures: none beyond the known MA-7 case

## Self-Check: PASSED

- All 7 created files exist in the worktree; `git status --short` was clean before this SUMMARY.
- All 6 task commits (1c71194, 08ae517, 48eba40, eb023c8, 839b4a6, e1ba133) are present on `df/exec-42-03`; the main checkout `/Users/justin/dev/devflow-claude` was not touched.
- `stack-evidence.cjs`, `stack-profile.cjs`, `stack-render.cjs` and their tests are unmodified.
