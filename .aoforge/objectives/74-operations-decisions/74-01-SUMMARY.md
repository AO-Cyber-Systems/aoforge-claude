---
objective: 74-operations-decisions
trd: "01"
subsystem: ci
tags: [ci, visual-judge, flutter-ui-eval, live-vision, OPS-01, secrets, github-actions]

requires:
  - objective: 32
    provides: "verify flutter-ui-eval --judge live: N live vision samples per state, evidence:'vision', gate:'binding'"
  - objective: 33
    provides: "resolveUIEvalTarget (manifest path resolution), unjudgedPolicy, expect:fail / known_failing / resolved buckets"
  - objective: 54
    provides: "scripts/workflow-permissions.test.cjs READ_ONLY_WORKFLOWS guard"
provides:
  - "scripts/ci-visual-judge.cjs: assertLiveRollup (pure), renderSummary, main(argv, {env, spawn, readFile, out, err}); exits 1 without a credential, runs the live judge, fails unless every state was judged by vision and agreed with its label"
  - "scripts/__fixtures__/visual-judge/: two real 1280x800 headless-Chrome captures of the docs home page (docs-home.png 99,416 B; docs-home-broken.png 33,496 B with an injected overflow + blank region), manifest (samples 3, flakeBudget 1, unjudgedPolicy fail, docs-home-broken expect fail), labels"
  - "scripts/__fixtures__/visual-judge-rollups.cjs: hand-written rollup builders (liveState, brokenLiveState, downgradedState, liveRollup, fixtureManifest)"
  - ".github/workflows/visual-judge.yml: push to main, workflow_dispatch, same-repo PRs touching the judge's files; secrets mapped into one step; permissions exactly contents: read"
  - "Credential redaction: every string the script prints is redacted of the credential values and cut to 1,000 characters"
affects: [74-04, 74-05, 74-08, 74-09]

tech-stack:
  added: []
  patterns:
    - "Do not trust a live CLI's gate or exit code as proof the model ran: assert on per-state evidence, the known-defect verdict and tokens spent"
    - "Deep-scrub (redact, then cut) a child's JSON before printing or asserting on it when the child may echo its own command line"

key-files:
  created:
    - scripts/ci-visual-judge.cjs
    - scripts/ci-visual-judge.test.cjs
    - scripts/__fixtures__/visual-judge-rollups.cjs
    - scripts/__fixtures__/visual-judge/manifest.json
    - scripts/__fixtures__/visual-judge/labels.json
    - scripts/__fixtures__/visual-judge/docs-home.png
    - scripts/__fixtures__/visual-judge/docs-home-broken.png
    - .github/workflows/visual-judge.yml
  modified:
    - scripts/workflow-permissions.test.cjs

key-decisions:
  - "The script redacts the credential values out of all output (Rule 2): Node's execFileSync error message is 'Command failed: <file> <args...>', so a failed curl in anthropicMessagesCall puts the x-api-key / Bearer header and the base64 image body into the rollup's state errors"
  - "renderSummary takes the manifest as a third argument: the per-state expect= comes from the manifest, which the rollup does not carry"
  - "main() returns the exit code and the CLI entry sets process.exitCode from it, so tests assert on the return value and nothing calls process.exit()"
  - "The broken capture hides the hero text blocks, mesh, sections and footer and sets the h1 to nowrap 160px with its <br> hidden and the hero's overflow visible, so the headline is cut mid-word at the real viewport edge above a blank region"

patterns-established:
  - "Code commits of a TRD that 74-04 cherry-picks hold only files_modified paths; SUMMARY checkpoints go in separate docs commits"

requirements-completed: []

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 15min
completed: 2026-10-10
tokens_input: 22584506
tokens_output: 90951
tokens_cache_read: 22323297
tokens_cache_write: 260943
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 74 TRD 01: The live visual judge job in CI Summary

**A CI job that runs `verify flutter-ui-eval --judge live` on two real docs-site screenshots and fails unless the live model judged both by vision, called the injected overflow broken, did not fail the good page, and spent tokens; a credential-less run fails instead of passing.**

## Progress
- [x] Task 1: Capture the real docs screenshots and write the fixture builders — 7a2a07ee
- [x] Task 2: scripts/ci-visual-judge.cjs, the assertion that the live model really looked — edccaca6 (RED), bb00d077 (GREEN)
- [x] Task 3: .github/workflows/visual-judge.yml, held to the read-only permissions guard — f164f8bf (RED), 109e0c08 (GREEN)

## Code commits (TRD 74-04 cherry-picks exactly these, in this order)

| # | SHA | Message | Files |
|---|---|---|---|
| 1 | 7a2a07ee | test(74-01): add the live visual judge fixtures | scripts/__fixtures__/visual-judge/{manifest.json, labels.json, docs-home.png, docs-home-broken.png}, scripts/__fixtures__/visual-judge-rollups.cjs |
| 2 | edccaca6 | test(74-01): add failing test for the credential-less visual judge run | scripts/ci-visual-judge.test.cjs |
| 3 | bb00d077 | feat(74-01): assert that the live visual judge really looked | scripts/ci-visual-judge.cjs, scripts/ci-visual-judge.test.cjs |
| 4 | f164f8bf | test(74-01): hold visual-judge.yml to contents: read | scripts/workflow-permissions.test.cjs |
| 5 | 109e0c08 | ci(74-01): run the live visual judge on pushes to main | .github/workflows/visual-judge.yml |

`git show --name-only` on each lists no `.aoforge/` path. The SUMMARY checkpoints are separate docs commits (7d6cca83, 0ea7b19d) and are not cherry-picked. `git log -- <code paths>` over `37381120..HEAD` lists only these five (74-01) commits. Without the range it also shows 3cd2d788 (54-03), which created workflow-permissions.test.cjs before this TRD.

## What was built

- **Fixture (Task 1).** Hugo built the site to the scratchpad with `--baseURL http://127.0.0.1:8091/`, `python3 -m http.server 8091 --bind 127.0.0.1` served it, and Google Chrome 155 headless (`--force-device-scale-factor=1 --window-size=1280,800 --hide-scrollbars`) captured `/` and `/broken/`. The broken page is a copy of the built `index.html` with one `<style>` before `</head>`. Both PNGs were looked at: the first is the normal home page; the second shows "Ship features,not c" cut at the right edge above a blank region. Both are 1280x800 per `sips`, at 99,416 B and 33,496 B. The server was stopped (its exit 143 is the SIGTERM). Port 8080 was never used.
- **Assertion (Task 2).** `assertLiveRollup(rollup, manifest)` fails on any of these: not a live run; a state with errors or without `evidence: 'vision'`; an expect-pass state in `fails[]`; the expect-fail state not judged broken; anything in `unjudged[]`; a state count or id mismatch; `usage.input_tokens` not above 0; or the engine's own `fail` verdict with nothing else recorded. Below-HIGH breakage and a flaky review on an expect-pass state are warnings. `main` checks only that a credential is present. It spawns `node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs verify flutter-ui-eval <abs manifest> --judge live --raw`, parses stdout whatever the exit status was (it follows `@file:`), deep-scrubs the rollup, and prints a `::group::rollup` block and the summary.
- **Workflow (Task 3).** `visual-judge.yml` uses the TRD's YAML verbatim, plus a house-style header covering what it proves, why it is not a required check, the cost (6 vision calls) and how secrets are handled. actionlint accepted `secrets.ANTHROPIC_BASE_URL || vars.ANTHROPIC_BASE_URL`, so the recovery path was not needed. If the secret is unset, the step gets an empty `ANTHROPIC_API_KEY` and the script exits 1.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixtures | `sips -g pixelWidth -g pixelHeight` on both PNGs | 0 | PASS: 1280x800 each |
| 1: fixtures | `ls -l scripts/__fixtures__/visual-judge/` | 0 | PASS: 99,416 B and 33,496 B (> 10 KB) |
| 1: fixtures | `env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL node plugins/aoforge/aoforge/bin/aof-tools.cjs verify flutter-ui-eval scripts/__fixtures__/visual-judge/manifest.json --judge labels --raw` | 0 | PASS: resolution resolved, 2 states, known_failing [docs-home-broken], fails [], unjudged [], verdict pass |
| 2: assertion | `env -u ... node --test scripts/ci-visual-judge.test.cjs` | 0 | PASS: 19/19 (cases 1-17 plus added 18, 19) |
| 2: assertion | `env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL node scripts/ci-visual-judge.cjs scripts/__fixtures__/visual-judge/manifest.json` | 1 | PASS: printed only "ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL) is not available to this run: set it as a repository secret" |
| 3: workflow | `node --test scripts/workflow-permissions.test.cjs` | 0 | PASS: 5/5, including "visual-judge.yml grants exactly contents: read at the top level" |
| 3: workflow | `actionlint .github/workflows/visual-judge.yml` | 0 | PASS: no findings |
| 3: workflow | `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` | 0 | PASS |

## TDD Evidence

The cases were worked one at a time, each red, then green, then the next. The TRD names one RED commit and one GREEN commit per task, so only the first red state of each task is committed. Every later red run is recorded here.

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED case 1 (committed edccaca6) | `node --test scripts/ci-visual-judge.test.cjs` | 1 | FAIL (correct): module not found |
| GREEN case 1 | same | 0 | PASS |
| RED case 2 | same | 1 | FAIL (correct): empty stdout, no summary |
| GREEN case 2 | same | 0 | PASS |
| case 3 | `--test-name-pattern "^3\."` | 0 then 1 under mutation | Passed on first run: case 2's minimal implementation already had to spawn. Mutation check: dropping `--raw` made it fail (deepStrictEqual); restored |
| RED/GREEN case 4 | `^4\.` / full file | 1 / 0 | `@file:` not followed, then followed |
| RED/GREEN case 5 | `^5\.` / full file | 1 / 0 | JSON.parse threw, then "could not parse the judge's output" |
| RED/GREEN case 6 | `^6\.` / full file | 1 / 0 | path.resolve(undefined) threw, then usage |
| case 7 | `^7\.` | 0 | Passed on the stub (happy path: ok with no findings is the stub's answer); every later negative case was red first |
| RED/GREEN cases 8-16 | `^8\.` ... `^16\.` / full file | 1 / 0 each | Each failed with `ok: true` (or no warning) before its rule existed |
| case 17 | `^17\.` | 0 | Passed on first run: it characterises the Task 1 fixture, which was already committed |
| RED/GREEN case 18 (added) | `^18\.` / full file | 1 / 0 | Engine verdict fail with nothing recorded |
| RED/GREEN case 19 (added) | `^19\.` / full file | 1 / 0 | RED showed the credential printed: the leak was real before the fix |
| RED Task 3 (committed f164f8bf) | `node --test scripts/workflow-permissions.test.cjs` | 1 | FAIL (correct): ENOENT visual-judge.yml |
| GREEN Task 3 | same | 0 | PASS 5/5 |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped, per task) | `node --test scripts/ci-visual-judge.test.cjs scripts/workflow-permissions.test.cjs` plus rename-guard, aoforge-workflows and model-profiles repo tests | 0 | PASS: 19/19 and 5/5; 60/60 for the repo-scoped set |
| test (full, first run) | `env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL npm --prefix <worktree> test` | 1 | 12,526 tests: 12,429 pass, 13 fail, 84 skipped. No failure involves a file of this TRD. The two causes and their resolution are below |
| test (full, final run) | the same command with `NODE_PATH=/Users/justin/dev/aoforge-claude/node_modules`, after `roadmap update-job-progress 74` | 0 | **PASS: 12,526 tests, 12,494 pass, 0 fail, 32 skipped** (the same 32 skips 73-14 recorded) |

Full-suite failures, one by one:
- **12 aoforge-watch / handoff-e2e daemon tests** (`aoforge-watch.test.cjs`: 6; `handoff-e2e.test.cjs`: 6) were environmental. The daemon log says `Cannot find module 'node-pty'`: the fresh worktree has no `node_modules`, while the main checkout does. Re-running both files in the worktree with `NODE_PATH=/Users/justin/dev/aoforge-claude/node_modules` gave **46/46 pass, 0 skipped**, including the PTY tests the suite had skipped. Nothing was installed in the worktree.
- **E2E1** (`roadmap-reconcile.test.cjs`) reported ROADMAP drift from this TRD's own checkpoint SUMMARY: the 74-01 row was unticked while its SUMMARY existed. `roadmap update-job-progress 74` in the state step clears it, and the file is re-run after that step (see Post-TRD Verification).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Redact the credential out of everything the script prints (test case 19)**
- **Found during:** Task 2
- **Issue:** when curl fails in `anthropicMessagesCall` (network, DNS or TLS failure), Node's execFileSync throws `Command failed: curl ... -H x-api-key: <key> -d <~1 MB base64 body>`, confirmed with a harmless `execFileSync('false', ...)`. The engine stores that message as the state's error. The TRD's script prints the rollup JSON and `<id>: not judged by the live model: <first error>`, so it would have printed the key into the CI log. GitHub masks registered secrets, but the TRD forbids printing one. The same message would also make a single log line about 1 MB long.
- **Fix:** `redact` (every `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` value becomes `***`), `cut` (1,000 characters, saying how much was cut) and `scrub`, a deep redact-then-cut over the parsed rollup, applied before the assertion and the print. The `out`/`err` writers redact again, and the child's stderr is redacted before its last 2,000 characters are printed.
- **Files modified:** scripts/ci-visual-judge.cjs, scripts/ci-visual-judge.test.cjs
- **Commit:** bb00d077

**2. [Spec gap] Test case 18 for the TRD's own "verdict fail backstop" rule**
- **Found during:** Task 2
- **Issue:** the TRD's module shape includes "rollup.verdict === 'fail' and no failure recorded yet -> failure", but the test list has no case for it.
- **Fix:** added case 18 (flakeBudget 0 with one review, so the engine says fail and nothing else names a state). It failed red, then went green.
- **Commit:** bb00d077

**3. [Rule 2 - Robustness] An unreadable manifest exits 1 with a message instead of a stack trace**
- **Found during:** Task 2
- **Issue:** `main` needs the manifest for the expect values, and an unguarded JSON.parse(readFile()) would throw.
- **Fix:** a guarded read that prints "could not read the manifest" and exits 1 before spawning. It is covered by a second part of case 6. This branch was written before its assertion (test-after), the one exception to the red-first loop.
- **Commit:** bb00d077

**4. [Interface] renderSummary(rollup, result, manifest)**
- The TRD gives `renderSummary(rollup, result)`, but the per-state `expect=` comes from the manifest, so the manifest is a third argument. `main` returns its exit code rather than setting it; the `require.main` block sets `process.exitCode = main()`.

**5. [Process] SUMMARY checkpoints are separate docs commits**
- The executor protocol puts the SUMMARY in each task commit. This TRD's commit discipline (74-04 cherry-picks the code commits) keeps `.aoforge/` out of them, so each checkpoint got its own `docs(74-01)` commit.

## Known false-green or false-red risks left for 74-05

- The broken fixture is blatant, but whether a live model calls it broken on at least 2 of 3 samples, and rates it HIGH, is first measured by the live run in 74-05. If the model calls it broken at medium only, the state passes into `resolved[]`. The assertion still passes, because `is_broken` is true, and the summary line shows the severity.
- The good page could draw a medium defect (for example, the mesh crossing the hero text). That is a warning, not a failure.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (real PNGs at least 360 px wide and over 10 KB; credential-less exit 1 naming ANTHROPIC_API_KEY with no spawn; the assertion's conditions, cases 7-16 and 18; workflow triggers, secret mapping and contents: read; no test reaches the network)
- Gate failures: none on the final run. The first full `npm test` exited 1 with 13 failures, none in a file of this TRD. Twelve were the worktree's missing `node_modules`, and E2E1 was ROADMAP drift, which passed 1/1 after `roadmap update-job-progress 74`. The final full run, with `NODE_PATH` set to the main checkout's `node_modules`, exited 0 with 0 failures. A fresh worktree needs `node_modules` (or `NODE_PATH`) for the node-pty daemon tests; nothing was installed in it.
- Requirement OPS-01 stays **Pending**, deliberately. It needs the user's repository secret (74-05) and a run on `main` (74-08), so it is not marked complete here.
- Nothing live happened: no push, PR, secret, workflow run or Anthropic API call. Local runs stripped all three ANTHROPIC_* variables. The only network fetch was Chrome loading the docs page's Typekit stylesheet during the capture.

## Self-Check: PASSED

- FOUND: all 9 files_modified paths (`ls -l`): ci-visual-judge.cjs, ci-visual-judge.test.cjs, visual-judge-rollups.cjs, manifest.json, labels.json, docs-home.png, docs-home-broken.png, visual-judge.yml, workflow-permissions.test.cjs
- FOUND: all 7 commits (`git log --no-walk`): 7a2a07ee, 7d6cca83, edccaca6, bb00d077, 0ea7b19d, f164f8bf, 109e0c08. `git rev-list --count 37381120..HEAD` = 7
- The worktree was clean before the final docs commit
