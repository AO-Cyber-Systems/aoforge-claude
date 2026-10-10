---
objective: 74-operations-decisions
job: "03"
subsystem: ci
tags: [github-rulesets, branch-protection, gh-api, node-test]

requires:
  - objective: 50-github-enforcement-and-setup
    provides: SETUP_RULESET_NAME and the repository-admin bypass role in gh-setup.cjs
provides:
  - ".github/rulesets/main.json, the exact ruleset text the user is asked to approve"
  - "scripts/ruleset-check.cjs: compare (read the applied ruleset back by name) and checks (every required context reports, from the pinned app, on sampled pull requests)"
  - "A recorded live read-only inventory and the pre-apply baseline"
affects: [74-07-apply-main-ruleset, 74-08-merge-and-verify-on-main]

tech-stack:
  added: []
  patterns:
    - "Injected gh runner (gh(args) -> { status, stdout, stderr }) plus assertReadOnly on every call, so a tool whose job is to read GitHub cannot write to it"
    - "main() returns the exit code and the CLI wrapper sets process.exitCode, so tests never touch the real one"

key-files:
  created:
    - .github/rulesets/main.json
    - scripts/ruleset-check.cjs
    - scripts/ruleset-check.test.cjs
    - scripts/__fixtures__/ruleset-fixtures.cjs

key-decisions:
  - "Bypass actor is the repository admin role in bypass_mode pull_request, not gh-setup's always: an always-mode actor may force-push, which breaks the no-force-push requirement"
  - "Only test (npm test, gated), pinned to integration_id 15368, is required: harness and build are path-filtered and never report on pull requests that do not touch their paths"
  - "OPS-02 is NOT marked complete by this TRD: nothing is applied until 74-07 runs behind the user's approval"

requirements-completed: []

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 9min
completed: 2026-10-10
tokens_input: 8609033
tokens_output: 54905
tokens_cache_read: 8466635
tokens_cache_write: 142266
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 74 TRD 03: The main ruleset record Summary

The `main` ruleset exists as a reviewable file (`.github/rulesets/main.json`) and `scripts/ruleset-check.cjs` proves, read-only, both that its required check reports on real pull requests into `main` and (after 74-07 applies it) that the applied ruleset matches the file. Nothing on GitHub was changed.

## Progress
- [x] Task 1: Fixture builders and the ruleset record — f0fd79e8
- [x] Task 2: scripts/ruleset-check.cjs, compare and checks — 77d3bf6c
- [x] Task 3: Record the live read-only inventory against the real repository — no commit (read-only; findings below)

## What was built

- `.github/rulesets/main.json`: name `aoforge: default branch` (equals `SETUP_RULESET_NAME`, so a later `gh setup --apply` unions into it instead of adding a second ruleset), branch target `~DEFAULT_BRANCH`, `active`, rules `deletion`, `non_fast_forward`, `pull_request` (0 approvals; merge, squash, rebase allowed) and `required_status_checks` with one check, `test (npm test, gated)` pinned to app 15368. One bypass actor: repository admin role (actor_id 5), `bypass_mode: pull_request`.
- `scripts/ruleset-check.cjs`: pure `compareRuleset` and `missingContexts`, `assertReadOnly`, `parseJsonStream`, and `main(argv, { gh, readFile, out, err })` with `compare` and `checks`. Exit 0 ok, 1 mismatch or missing check, 2 usage or gh error. Lists are compared as sets, bypass actors by role and mode, server metadata is never read, and a parameter only the reply carries is listed as a server default and not counted.
- `scripts/ruleset-check.test.cjs`: 16 tests (RC-1 to RC-16), no network. `scripts/__fixtures__/ruleset-fixtures.cjs`: hand-written builders.

## Live read-only inventory (Task 3, 2026-10-10)

Commands and results, all GET or view only:

1. `gh pr list --repo AO-Cyber-Systems/aoforge-claude --base main --state all --limit 3 --json number,state,title`
   - #129 OPEN "Post-release: AOForge dogfood (.aoforge move, docs, rollout records)"; #128 MERGED "Release 3.0.0: DevFlow is now AOForge"; #127 MERGED "Release 2.15.0 — v1.6 token stamp and minutes recalibration (objectives 66–67)".
2. `node scripts/ruleset-check.cjs checks --repo AO-Cyber-Systems/aoforge-claude --file .github/rulesets/main.json --prs 129,128,127` exit 0:
   ```
   #129  abc18a9  ok       test (npm test, gated)  (reported by app 15368)
   #128  11e98cf  ok       test (npm test, gated)  (reported by app 15368)
   #127  bcd255b  ok       test (npm test, gated)  (reported by app 15368)
   every required check reported on 3 pull request(s)
   ```
3. `gh api repos/AO-Cyber-Systems/aoforge-claude/rulesets`: one entry, id 11490149 "Private Repos", `source_type: Organization`, `target: repository`, enforcement active. No repository ruleset.
4. `gh api repos/AO-Cyber-Systems/aoforge-claude/branches/main/protection`: HTTP 404 `{"message":"Branch not protected"}`. No classic protection.
5. `node scripts/ruleset-check.cjs compare --repo AO-Cyber-Systems/aoforge-claude --file .github/rulesets/main.json` exit 1: `no ruleset named 'aoforge: default branch' on AO-Cyber-Systems/aoforge-claude`. This is the pre-apply baseline.

The command TRD 74-07 runs after the user approves the exact text of `.github/rulesets/main.json`. It was NOT run here:

```
gh api --method POST repos/AO-Cyber-Systems/aoforge-claude/rulesets --input .github/rulesets/main.json
```

Then `node scripts/ruleset-check.cjs compare --repo AO-Cyber-Systems/aoforge-claude --file .github/rulesets/main.json` should exit 0.

`checks` proves a context was reported by the pinned app, not that it passed. A check run that reported a failure counts as reported, which is the right test for "this required check will not hang a merge" and the wrong test for "this pull request is mergeable".

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixture builders and the ruleset record | `node -e "JSON.parse(...main.json...)"` and `node -e "console.log(Object.keys(require('./scripts/__fixtures__/ruleset-fixtures.cjs')))"` | 0 | PASS (14 exports listed) |
| 2: ruleset-check compare and checks | `node --test scripts/ruleset-check.test.cjs` | 0 | PASS (16 of 16) |
| 2: rename guard | `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` | 0 | PASS (20 of 20) |
| 3: live inventory | the five commands above | 0, 0, 0, 1 (404), 1 (absent) | PASS: the 404 and the "no ruleset" exit 1 are the expected baseline |
| 3: no write request | `git log -1 --format=%s -- .github/rulesets/main.json` is a 74-03 commit; every gh call in the session was a GET, `pr list`, `pr view` or `api` without `--method` | 0 | PASS |

## TDD Evidence

Task 2 was driven in three RED/GREEN pairs.

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (cases 1, 2, 5) | `node --test scripts/ruleset-check.test.cjs` | 1 | FAIL, module not found (correct) |
| GREEN | same | 0 | PASS (3 of 3) |
| RED (cases 3, 4, 9, 10) | same | 1 | FAIL, RC-3, RC-4, RC-9 failing (RC-10 already held) |
| GREEN | same | 0 | PASS (7 of 7) |
| RED (cases 6, 7, 8 and RC-12 to RC-16) | same | 1 | FAIL, 7 failing (correct) |
| GREEN | same | 0 | PASS (15 of 15), then 16 of 16 with RC-11 |

Commits: RED 9f2c0886, GREEN a031752a, RED 8abfbadd, GREEN bcd3bf4c, RED 7eb9d358, GREEN 77d3bf6c.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test scripts/ruleset-check.test.cjs` | 0 | PASS |
| test (full) | `npm test`, first run in the bare worktree | 1 | 12522 tests, 12424 pass, 14 fail, 84 skipped. 13 failures were the aoforge-watch daemon and handoff-e2e tests: the worktree had no `node_modules`, so node-pty was missing and the daemon would not start. 1 failure was E2E1 (reconcile drift, see Deviations). |
| test (the 14, re-run) | `aoforge-watch.test.cjs` + `handoff-e2e.test.cjs` with the gitignored `node_modules` symlinked from the main checkout, then `roadmap-reconcile.test.cjs` after `roadmap update-job-progress` | 0, 0 | PASS: 46 of 46 and 63 of 63. The full suite was not re-run end to end. |

No plugin source was touched by this TRD, so the 14 cannot have been caused by it; the main checkout's `aoforge-watch.test.cjs` also passes 33 of 33 at base.

## Deviations from Plan

**1. [Rule 3 - Blocking] Worktree has no node_modules.** The provisioned worktree lacked `node_modules`, so the first `npm test` failed 13 daemon and handoff tests on a missing node-pty. Fixed by symlinking the main checkout's gitignored `node_modules` into the worktree (not committed), then re-ran those files green. Left for the orchestrator: worktree provisioning should link `node_modules`, or the task gate `npm test` reports 13 spurious failures on every parallel TRD.

**2. [Rule 1 - Bug avoided] E2E1 reconcile drift while a checkpoint SUMMARY exists.** Once `summary checkpoint` writes `74-03-SUMMARY.md`, E2E1 expects the ROADMAP line for 74-03 to be `[x]`. It was `[ ]`, so E2E1 failed in the first full run. `roadmap update-job-progress 74` ticks it and E2E1 passes. Any TRD that runs the full suite before its roadmap update will see this.

**3. [Process] Grouped TDD cycles.** The TRD asks for one failing test at a time. Tests were added in three groups, each observed RED and then driven GREEN. RC-5, RC-10, RC-14 and RC-11 passed on first run (the earlier GREEN already covered them); they are characterization tests of behaviour that was built earlier.

**4. [Rule 2 - Missing critical] Tests beyond the list.** Added RC-12 (paginated `gh --paginate` output is a concatenation of JSON objects), RC-13 (a failed gh call exits 2, never reads as a missing context), RC-14 (usage errors exit 2 and nothing reaches GitHub), RC-15 (`missingContexts` directly) and RC-16 (`assertReadOnly` refuses every gh form that could write). `assertReadOnly` runs on every gh call so the checker cannot be turned into a writer by a mistaken argument.

**5. [Process] OPS-02 left unchecked.** The workflow marks the TRD's `requirements` complete, and `requirements mark-complete OPS-02` ticked it. That reads "Branch protection on `main` is set", which is false until 74-07 applies the ruleset, so the change to `.aoforge/REQUIREMENTS.md` was reverted before committing. 74-07 lists OPS-02 too and should mark it.

**6. [Interface] `main` returns the exit code** instead of setting `process.exitCode` (the CLI wrapper does), so the tests can call it in-process without failing the test run.

## Authentication gates

None.

## Discovered commands

None. The test command came from `.aoforge/STACK.md` (`npm test`, scoped `node --test {files}`).

## Issues Encountered

None beyond the deviations above.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (the file's safety properties by RC-11; `checks` exit 0 on live data; `compare` exit 1 before the apply; the inventory recorded above)
- Gate failures: none attributable to this TRD (see Validation Gate Results)

## Next Phase Readiness

74-07 can show the user `.github/rulesets/main.json` as the exact text to approve, apply it with the command above and verify with `compare`. These files stay on this branch and reach `main` with the next release PR; they are not cherry-picked by 74-04.

## Self-Check: PASSED

All four created files exist (`.github/rulesets/main.json`, `scripts/ruleset-check.cjs`, `scripts/ruleset-check.test.cjs`, `scripts/__fixtures__/ruleset-fixtures.cjs`). All seven task commits exist: f0fd79e8, 9f2c0886, a031752a, 8abfbadd, bcd3bf4c, 7eb9d358, 77d3bf6c.
