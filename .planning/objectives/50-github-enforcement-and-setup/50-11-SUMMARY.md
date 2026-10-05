---
objective: 50-github-enforcement-and-setup
trd: "11"
subsystem: github-enforcement
tags: [github, gh-setup, rulesets, merge-queue, issue-types, issue-fields, apply, idempotency, degradation, cli, node-test]

requires:
  - objective: 50-09
    provides: "readSetupState / planSetup / renderPlan, the action contract (request {args, input}, file {path, content}), setupRecordPath"
  - objective: 50-10
    provides: "templates/github/devflow.yml and pull_request_template.md with {{checks_workflow}} / {{devflow_ref}} placeholders"
  - objective: 50-01
    provides: "gh-fake routes and refusals (mergeQueueAllowed, fieldOptionsAccepted, orgAdmin, isAdmin)"
provides:
  - "gh-setup.cjs: renderTemplates(cfg, version) and applySetup(root, actions, {repo, refresh, now, env}) -> {ok, outcomes}"
  - "gh-setup-cli.cjs: cmdGhSetup(cwd, args, raw) with --apply, --refresh, --require-wiki, --raw (dry-run by default)"
  - "df-tools gh setup dispatched, listed in the Unknown gh subcommand error and in the gh usage string"
  - "templates/config.json: github.app_id and github.checks_workflow, both empty by default"
affects: [50-12 e2e (SC2), 50-13 live verification and docs]

tech-stack:
  added: []
  patterns:
    - "Apply sends exactly the planned request through gh-client.ghWrite: what the dry-run printed is what is sent"
    - "Per-action degradation: a 422 retries the same request in a weaker shape, a 403/404 on an org endpoint is a skip, anything else is a failure, and every action is attempted"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-setup-apply.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs
    - plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh-setup.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/templates/config.json
    - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs

key-decisions:
  - "A 422 on a ruleset that carries a merge_queue rule is treated as the plan refusing the queue: the same POST/PUT is retried without that rule, and only a successful retry writes the setup record {merge_queue:false, at}. A 422 for any other reason fails the retry too and is reported as failed, with no record written"
  - "`--refresh` deletes the setup record inside applySetup (deps.refresh) and reads with refresh:true; a dry-run with --refresh ignores the record but never deletes it, so a dry-run stays side-effect free"
  - "A local conflict (an unmanaged .github/workflows/devflow.yml) exits 1 in a dry-run too: the plan already knows apply would leave the file alone and fail, and the exit code lets CI use the dry-run as a readiness check"
  - "--require-wiki reads 'ready' as the wiki action being `exists` (first page present) in both modes; in --apply the settings action may enable the wiki in the same run, which is still not ready until the first page exists, so the run exits 1"
  - "Outcome statuses are created | updated | exists | skipped | manual | conflict | advisory | failed; the plan's skip/manual/conflict/advisory pass through with the plan's description as the note"
  - "A prose report for a failing run goes to stderr (emit, as gh pr does); --raw always prints the JSON on stdout"

patterns-established:
  - "CLI result shape {code, payload, prose} with emit(): stdout for exit 0, stderr for exit 1, raw JSON on stdout"

requirements-completed: [GEN-04]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: ~45min
completed: 2026-10-01
tokens_input: 9884906
tokens_output: 81523
tokens_cache_read: 9680759
tokens_cache_write: 204021
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 50 TRD 11: `gh setup` apply and command Summary

**`df-tools gh setup` is now a command: with no flag it prints the full plan with exact payloads and changes nothing; `--apply` executes each planned request through gh-client, writes the workflow and PR template into the working tree, degrades per action (merge queue dropped, fields as text, org writes skipped), reports every action's outcome, and a second `--apply` makes zero GitHub writes and changes no file.**

## Performance

- **Duration:** about 45 min
- **Tasks:** 2 of 2 (both TDD; 4 task commits)
- **Files:** 8 (3 created, 5 modified)

## Accomplishments

- `renderTemplates(cfg, version)` reads `templates/github/` relative to the module (works from the checkout and the home mirror), fills `{{checks_workflow}}` (`github.checks_workflow`, else `AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml@v<version>`) and `{{devflow_ref}}` (`v<version>`) in one pass with a function replacer, so GitHub's own `${{ vars... }}` expressions and a value containing `$&` are untouched.
- `applySetup` runs the plan in order, never stopping at a failure. A request action goes through `client.ghWrite(request.args, {input})` exactly as planned (the dated `X-GitHub-Api-Version: 2026-03-10` header only appears on issue-field requests because it is part of the planned argv). Handling per kind: ruleset 422 with `merge_queue` retries without it and records `{merge_queue:false, at}` at `setupRecordPath`; issue-field 422 with options retries once as `text` with no options; issue-type / issue-field 403 or 404 is a `skipped` outcome with "needs an organization owner; DevFlow uses labels and body metadata"; a label that already exists (created between the read and the write) is `exists`; everything else, including a 403 on repo settings or the ruleset, is `failed` with the one-line gh error.
- Local files: a planned `file` is written with `mkdirSync` + `writeFileSync` (refusing a path outside the project); a `conflict` has no file and is never touched; an `exists` file is not rewritten (mtime asserted).
- `cmdGhSetup` reads (reads only), renders, plans, then prints `renderPlan` plus a "Dry run ... nothing was changed" line, or applies and prints one `[status] kind target - note` line per action, a count line, "Nothing to change" on a re-run, and, when files were written, the uncommitted-files notice with the `df-tools commit ... --files .github/workflows/devflow.yml .github/pull_request_template.md` command and the bootstrapping hazard from 50-09 (the ruleset requires `devflow/linked-issue` and `devflow/planning-consistency`, which exist only once the workflow is on the default branch, so merge the workflow PR first, with a one-time admin bypass if needed).
- Enablement is `github.enabled` + `github.repo` only (not store mode); disabled or no repo prints the reason, exits 0 and makes zero gh calls (asserted with a throwing seam, and through a spawned df-tools).
- Dispatch: `case 'gh'` gains `setup` with the usage comment in the form of the `pr` branch and `setup` is appended to the Unknown-gh-subcommand list; the `gh` usage string in help.cjs names `setup [--apply] [--refresh] [--require-wiki]` and its exit codes.
- Config template: `github.app_id` and `github.checks_workflow` default to `""`; `config-get github.app_id` prints `""`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: applySetup and templates (tests 2-7) | `node --test .../lib/gh-setup-apply.test.cjs .../lib/gh-setup.test.cjs` | 0 (16 + 79 pass) | PASS |
| 2: CLI, dispatch, help, config (tests 1, 8-10) | `node --test .../lib/gh-setup-cli.test.cjs .../lib/dispatch-completeness.test.cjs .../lib/help.test.cjs .../lib/config.test.cjs .../lib/gh-seam.repo.test.cjs` | 0 (19 pass, plus the suites below) | PASS |

## Task Commits

1. **Task 1: applySetup and templates** - `6fd4101c` (test, RED), `48ffee2a` (feat, GREEN)
2. **Task 2: CLI, dispatch, help, config** - `48c2508b` (test, RED), `45c10511` (feat, GREEN)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test .../lib/gh-setup-apply.test.cjs .../lib/gh-setup-cli.test.cjs` | 0 | PASS (16 + 19 tests) |
| regression | `node --test dispatch-completeness help config gh-seam.repo` plus gh-setup, planning-writes.repo, doc-refs.repo, devflow-workflows.repo, validate, migrations/0001-config-stamp, gh-sync-store, awareness | 0 | PASS (446 tests: 437 pass, 0 fail, 9 skipped; the skips are the pre-existing GIT_INTEGRATION / live-capture tests) |
| extra | `node --test plugins/devflow/devflow/bin/df-tools.test.cjs` | 0 | PASS (153 tests) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test .../gh-setup-apply.test.cjs` | 1 | FAIL (correct): 16 of 16 failed, `setup.renderTemplates is not a function` |
| GREEN (Task 1) | `node --test .../gh-setup-apply.test.cjs` | 0 | PASS (correct): 16 of 16 |
| RED (Task 2) | `node --test .../gh-setup-cli.test.cjs` | 1 | FAIL (correct): `Cannot find module './gh-setup-cli.cjs'` |
| GREEN (Task 2) | `node --test .../gh-setup-cli.test.cjs` | 0 | PASS (correct): 19 of 19 |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 (dry-run prints the plan with exact payloads and the fake records zero writes; `--apply` creates ruleset, labels, types, fields, settings and both files and a second `--apply` makes zero writes and leaves both files byte-identical with unchanged mtime; merge-queue 422 retries without the rule, records it, reports "merge queue unavailable on this plan" and exits 0, a second apply is write-free and `--refresh` tries again; field-options 422 becomes a text field, org 403 is a skip, repo-level 403 exits 1 after the remaining actions ran; disabled github is skipped with zero calls and no store requirement; `setup` is dispatched, listed and in help)
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/gh-setup.cjs` - `renderTemplates`, `applySetup` and their helpers added (the read and plan functions are unchanged)
- `plugins/devflow/devflow/bin/lib/gh-setup-apply.test.cjs` - 16 tests: renderTemplates (3) and applySetup (13: tests 2-7 plus the header, PR-template, `--refresh`, race and drift cases)
- `plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs` - the command (about 190 lines)
- `plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs` - 19 tests: in-process command (15) and spawned dispatch, help and config (4)
- `plugins/devflow/devflow/bin/df-tools.cjs`, `lib/help.cjs`, `templates/config.json` - dispatch, usage string, two config keys
- `plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs` - `gh-setup-cli.cjs` added to `GUARDED` and `NO_DIRECT_WRITE`

## Decisions Made

See key-decisions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Registered gh-setup-cli.cjs in the gh seam guard**
- **Found during:** Task 2 GREEN
- **Issue:** `gh-seam.repo.test.cjs` test 23 fails for any `gh-*.cjs` module not in `GUARDED`, and the new CLI module must also be held to never writing (it only calls `applySetup`).
- **Fix:** Added `'gh-setup-cli.cjs'` to `GUARDED` and to `NO_DIRECT_WRITE`, in the Task 2 GREEN commit (`45c10511`). `gh-setup.cjs` stays out of `NO_DIRECT_WRITE`, as 50-09 decided, because `applySetup` calls `ghWrite`.
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs`
- **Commit:** `45c10511`

### Interpretations of the TRD (no code was wrong; stated so a reviewer can disagree)

- **Dry-run exit code with a conflict.** The TRD says a dry-run exits 0 and also that a `conflict` exits 1, without saying which wins in a dry-run. A dry-run that finds a conflicting local file exits 1 (the plan is still printed, on stderr as for any exit 1), because the conflict is already known and apply would fail on it. A clean dry-run exits 0, which is the case the must-haves and test 1 describe. `--require-wiki` likewise applies to a dry-run.
- **`--refresh` in a dry-run** ignores the setup record (so the merge queue is planned again) but does not delete it; only `--apply --refresh` deletes it.

### Additions beyond the TRD (all inside the owned files)

- A label that exists when its create runs (made by someone else after the read) is `exists`, not a failure.
- `renderTemplates` throws a `TypeError` when no version is given instead of rendering `vundefined`.
- `--help` / `help` and unknown flags or stray positionals print the usage (exit 0 / exit 1) with no gh call.
- A write that would leave the project directory is refused (`failed`), though the planned paths are constants.

### Process note

The edit gate denied the first `Write` (no live `.planning/.skill-active` marker; the dispatching skill had not left one). I marked the `execute-objective` workflow I was executing active with `df-tools skill-active --start execute-objective`, which is the mechanism the gate's own message names, and ended it when the work was done. No gate setting, hook or config was changed.

**Total deviations:** 1 (a repo-guard registration), plus the two interpretations and the additions above.
**Impact on plan:** none on the deliverable.

## Issues Encountered

None beyond the deviation.

## Notes for downstream TRDs (50-12 e2e, 50-13 live verification and docs)

- **SC2 for 50-12:** a dry-run on a bare Organization fake prints `devflow: default branch`, `devflow/linked-issue`, `devflow/planning-consistency`, the five type names and both field names with `fake.writes()` empty; `--apply` twice leaves the second run with zero writes. Both are already asserted in `gh-setup-cli.test.cjs` (tests 1 and 3); 50-12 can reuse the in-process `capture()` + fake pattern or spawn df-tools with the gh PATH shim.
- **Unverified against live GitHub (carry to 50-13):** (a) the issue-field option shape `{name, color, priority}` (Open Question 3: the text fallback on a 422 covers a wrong guess, but a wrong shape that GitHub accepts silently would not be caught); (b) that GitHub answers a merge-queue refusal with a 422 on the ruleset POST/PUT (modelled by the 50-01 fake from the research); (c) the required-context naming through the reusable workflow.
- **Any 422 on a ruleset that carries `merge_queue` is retried without it.** If GitHub 422s the ruleset for a different reason, the retry fails the same way and the outcome is `failed` (no record written), so the user sees the real error.
- **Docs:** `docs/USER-GUIDE.md` and the CLAUDE.md gh paragraph do not mention `gh setup` yet; the TRD did not own them.
- **Write budget:** a full first apply is about 20 writes (settings, 6 labels, 5 types, 2 fields, ruleset), far below gh-client's 450-per-run budget, and paced at 1 s each (about 20 s on a real repository).

## User Setup Required

None. `df-tools gh setup` was not run against any real repository (dry-run or apply); every run was against the 50-01 fake.

## Self-Check: PASSED

- Files exist: `plugins/devflow/devflow/bin/lib/gh-setup.cjs`, `gh-setup-apply.test.cjs`, `gh-setup-cli.cjs`, `gh-setup-cli.test.cjs`, plus the modified `df-tools.cjs`, `help.cjs`, `templates/config.json`, `gh-seam.repo.test.cjs` (the tests ran against them).
- Commits exist on `feat/stack-profile-loader` (`git log --oneline fa6f815c..HEAD`): `6fd4101c`, `48ffee2a`, `48c2508b`, `45c10511`.
