---
objective: 74-operations-decisions
trd: "02"
subsystem: ci
tags: [ci, cloudflare, pages, docs-deploy, diagnostic, preview-deploy, OPS-03]

requires:
  - objective: 72
    provides: "72-24: the docs deploy and the aoforge-docs Pages project deferred to objective 74 (OPS-03); the 8000007 lead on the org secrets"
provides:
  - "scripts/ci-cloudflare-target.cjs: a read-only report of the Cloudflare account (by name), the count of other accounts the token can see, the Pages project names and whether aoforge-docs is present; never prints an id or a token"
  - "scripts/__fixtures__/cloudflare-api-fixtures.cjs: deterministic Cloudflare API v4 response builders and a fake fetch"
  - ".github/workflows/docs.yml: runs the report before the deploy, names the Pages project once in PAGES_PROJECT, deploys to --branch=$DEPLOY_BRANCH (github.ref_name) so a dispatch off main is a preview"
affects: [74-04, 74-06, 74-08]

tech-stack:
  added: []
  patterns:
    - "A diagnostic for a public log: compare ids in-process, print names and counts, pass every line and every upstream error message through a scrubber (secrets, then any 32-hex run)"
    - "A CI diagnostic never fails the job: missing secrets, an API error and a dead network are reported and exit 0; only a usage error exits 1"

key-files:
  created:
    - scripts/ci-cloudflare-target.cjs
    - scripts/ci-cloudflare-target.test.cjs
    - scripts/__fixtures__/cloudflare-api-fixtures.cjs
  modified:
    - .github/workflows/docs.yml

key-decisions:
  - "OPS-03 is not marked complete: this TRD only adds the diagnostic and the preview-safe deploy. REQUIREMENTS ticks OPS-03 in 74-09 from the 74-08 evidence on main"
  - "The Pages project list is requested with per_page=100 and a partial listing (result_info.total_count above the list) is reported as partial, never as ABSENT"
  - "docs.yml keeps the baseURL https://devflow.cloud/ and the CLOUDFLARE_API_KEY / CLOUDFLARE_EMAIL deploy env (out of scope, as the TRD says)"

patterns-established:
  - "Code commits for a TRD that is cherry-picked onto a branch off origin/main hold only files_modified paths; planning records go in separate docs commits"

requirements-completed: []

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 8min
completed: 2026-10-10
tokens_input: 7834229
tokens_output: 52854
tokens_cache_read: 7651178
tokens_cache_write: 182937
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 74 TRD 02: Cloudflare deploy target and preview-safe docs deploy Summary

**`scripts/ci-cloudflare-target.cjs` makes the docs run name the Cloudflare account, the visible-account count and the Pages projects (never an id or token), and `docs.yml` runs it before the deploy and deploys `--branch=$DEPLOY_BRANCH` so a dispatch off `main` makes a preview instead of overwriting production.**

## Progress
- [x] Task 1: Fixture builders for Cloudflare API responses — fa4c2f0f
- [x] Task 2: scripts/ci-cloudflare-target.cjs, the read-only deploy-target report — 62d452f6 (RED), f40162a8 (GREEN)
- [x] Task 3: docs.yml runs the diagnostic and deploys preview-safe — e5f18d2e

## Code commits (TRD 74-04 cherry-picks exactly these, in this order)

| SHA | Message | Files |
|---|---|---|
| fa4c2f0f | test(74-02): add Cloudflare API fixture builders | scripts/__fixtures__/cloudflare-api-fixtures.cjs |
| 62d452f6 | test(74-02): add failing tests for the Cloudflare deploy-target report | scripts/ci-cloudflare-target.test.cjs |
| f40162a8 | feat(74-02): add the read-only Cloudflare deploy-target report | scripts/ci-cloudflare-target.cjs, scripts/ci-cloudflare-target.test.cjs |
| e5f18d2e | ci(74-02): name the Cloudflare deploy target and deploy previews from non-main branches | .github/workflows/docs.yml |

`git log --name-only 37381120..HEAD` shows no `.aoforge/` path in any of the four. The planning record (this SUMMARY, STATE, ROADMAP, state.json) is in the separate `docs(74-02)` commit that follows them; do not cherry-pick that one.

## Performance

- Started: 2026-10-10T02:54:02Z (preflight claim), finished 2026-10-10T03:10Z
- Tasks: 3 (4 code commits: Task 2 is a RED commit then a GREEN commit)
- Files: 4 code files (3 created, 1 modified) plus the planning record

## What changed

- **Fixtures (Task 1).** `cloudflare-api-fixtures.cjs` holds `ACCOUNT_ID` and `OTHER_ACCOUNT_ID` (distinct 32-hex constants), a fake `TOKEN`, `envelope`, `accountResponse`, `accountsResponse`, `projectsResponse(names, { total })`, `errorResponse` and `fakeFetch(routes)`. The fake records each call's `{ url, path, headers }`, answers an unrouted path with a 404 envelope and throws when a route is an `Error`. No randomness, no recorded real responses; names are `Example Account` and `example-site`.
- **The report (Task 2).** `scrub(text, secrets)` replaces each given secret with `<redacted>` (longest first), then every 32-hex run with `<id>`. `summarizeTarget({ account, accounts, projects }, { accountId, project, token })` returns `{ lines, accountVisible, projectPresent }`, every line scrubbed. `main(argv, { env, fetch, out, err })` returns the exit code (0 for every outcome of the check, 1 for a missing `--project`), makes three parallel GETs with `Authorization: Bearer <token>` and a 15 s timeout, and prefixes every line with `cloudflare target: ` so a run log can be grepped. The CLI wrapper sets `process.exitCode` and, on an unexpected throw, prints a scrubbed line and still exits 0.
- **The workflow (Task 3).** `scripts/ci-cloudflare-target.cjs` joins both `paths` lists; `PAGES_PROJECT: 'aoforge-docs'` is a workflow-level env; a new step "Show the Cloudflare deploy target" runs between Build and Deploy on pushes, dispatches and same-repository pull requests (secrets pass through `env:` only); the deploy step takes `DEPLOY_BRANCH: ${{ github.ref_name }}` through `env:` and runs `--project-name="$PAGES_PROJECT" --branch="$DEPLOY_BRANCH"`. The top-level `permissions:` block, the baseURL and the CLOUDFLARE_API_KEY / CLOUDFLARE_EMAIL env are untouched.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test scripts/ci-cloudflare-target.test.cjs` (module absent: `Cannot find module './ci-cloudflare-target.cjs'`) | 1 | FAIL (correct) |
| GREEN | `node --test scripts/ci-cloudflare-target.test.cjs` | 0 (19/19) | PASS (correct) |
| Mutation check | hex rule changed to `{99}` | 1 on case 7 and 10/10b | FAIL (correct; reverted) |

The first mutation check showed case 7 still green because the run's own account id is in the scrubber's secret list; case 7 was then given an error message that echoes `OTHER_ACCOUNT_ID`, an id the run was never handed, so only the 32-hex rule can catch it. The second mutation failed case 7 with the id in the output; the script was restored. That test change is in f40162a8.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixtures | `node -e "const f=require('<abs>/scripts/__fixtures__/cloudflare-api-fixtures.cjs'); console.log(Object.keys(f).join(','))"` | 0 (ACCOUNT_ID,OTHER_ACCOUNT_ID,TOKEN,envelope,accountResponse,accountsResponse,projectsResponse,errorResponse,fakeFetch) | PASS |
| 2: Report | `node --test scripts/ci-cloudflare-target.test.cjs` | 0 (19 pass) | PASS |
| 2: Report | `env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID node scripts/ci-cloudflare-target.cjs --project aoforge-docs` | 0 (`cloudflare target: Cloudflare secrets are not available to this run (a fork's pull request, or unset): nothing to check`) | PASS |
| 2: Report | same without `--project` | 1 (`usage: node scripts/ci-cloudflare-target.cjs --project <name>` on stderr) | PASS |
| 3: Workflow | `actionlint .github/workflows/docs.yml` | 0, no output | PASS |
| 3: Workflow | `node --test scripts/workflow-permissions.test.cjs` | 0 (4 pass) | PASS |
| 3: Workflow | `rg -n -e PAGES_PROJECT -e DEPLOY_BRANCH -e ci-cloudflare-target .github/workflows/docs.yml` | 0 (lines 19, 25, 40, 75, 90, 93) | PASS |
| 3: Workflow | `rg -n -F 'github.ref_name }}' .github/workflows/docs.yml` | 0 (line 90 only, an `env:` line) | PASS |
| Verification | `node --test` for the new file, workflow-permissions and `rename-guard.repo.test.cjs` | 0 (43 pass) | PASS |

No test calls the network; no live Cloudflare call and no workflow run was made.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` (final run, after the roadmap tick) | 1 | PASS for this TRD: 12,525 tests, 12,428 pass, 13 fail, 84 skipped. All 13 failures are `aoforge-watch` daemon tests (`aoforge-watch.test.cjs`, `handoff-e2e.test.cjs`, the watch-state-directory and multi-project files) that fail when run from this worktree and pass from the main checkout; no file of this TRD is involved (see Known failures) |
| lint | none in the profile; `actionlint` run by hand (see Discovered commands) | 0 | PASS |
| build | none | - | not_available |

### Known failures on this checkout (not caused by this TRD)

- **13 daemon tests, worktree-only.** `aoforge-watch.test.cjs` "foreground daemon writes PID file, status reports running, stop kills it" passes in `/Users/justin/dev/aoforge-claude` (1/1, 581 ms) and fails in this worktree (`false == true` at line 228, 54 ms) with the same base commit. The other twelve are the same family (start/stop, pid-file location, multi-project, handoff pipeline, LK-1/LK-2). The same 13 appeared in the baseline run taken after Task 1, before any script or workflow change. The cause was not investigated (outside this TRD); every parallel worktree TRD in the wave will probably see them.
- **E2E1 (roadmap-reconcile)** failed in the two runs taken while the SUMMARY checkpoint existed but the ROADMAP checkbox was unticked; `roadmap update-job-progress 74` ticked `74-02` and the final run is clean on it.
- **planning-writes audit, "10. classify-session.js [session start]"** failed once in the second full run with `spawnSync ... node EPIPE` (a hook child process, 270 ms) and passed in the next full run and alone (65/65). A transient spawn failure under load.

## Discovered commands

| Key | Command | Evidence |
|---|---|---|
| lint (workflows) | `actionlint .github/workflows/docs.yml` | named in this TRD's `<verify>`; installed at /opt/homebrew/bin/actionlint; the profile's lint key is `none`, so this is a proposal for `.aoforge/STACK.md`, not a written change |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] A paginated Pages list could report a false ABSENT**
- **Found during:** Task 2 (writing `summarizeTarget`)
- **Issue:** `GET /accounts/{id}/pages/projects` is paginated. A default-sized page on an account with many projects would omit `aoforge-docs` and the report would say "ABSENT in this account", sending the user to create a project that exists. The diagnostic exists to prevent exactly that misdirection. I could not confirm the API's default page size, and a live call is not allowed here.
- **Fix:** the projects request carries `?per_page=100`; when `result_info.total_count` exceeds the names returned, the report says `listing is partial: N of M` and `aoforge-docs: not in the N project(s) listed` instead of ABSENT. Test 11 covers it, and `projectsResponse(names, { total })` builds the partial case. The documented path is unchanged (test 9 compares paths; the accounts call keeps `per_page=50`).
- **Files modified:** scripts/ci-cloudflare-target.cjs, scripts/ci-cloudflare-target.test.cjs, scripts/__fixtures__/cloudflare-api-fixtures.cjs
- **Commit:** f40162a8 (script and tests), fa4c2f0f (the `total` option)

### Test list additions (no behaviour change to the TRD's cases)

- Cases 1a/1b (token missing, account id missing, empty strings), 2b (the `cloudflare target: ` prefix on every line), 6b (non-JSON response), 8b (`--project=name`), 10b/10c (empty secrets; a secret that is itself 32-hex), 12/12b (`summarizeTarget` flags and a failed section). The TRD's cases 1 to 10 are all present, with case 7 covering seven scenarios including an upstream error that echoes the account id, the token and an id the run was not given.
- The usage error also rejects any argument other than `--project`.

### Requirement handling

- `requirements mark-complete OPS-03` was not run. OPS-03 reads "a push to `main` deploys green"; this TRD adds the means to see why it does not and a safe deploy branch, but no deploy has succeeded. 74-09 ticks the OPS IDs whose 74-08 evidence is green. Recorded as a decision.

### Process notes

- The generic per-task protocol commits the SUMMARY checkpoint with each task commit. This TRD's commit discipline forbids an `.aoforge/` path in a code commit (74-04 cherry-picks them onto a branch off `origin/main`), so the four code commits hold code only and the planning record is a separate `docs(74-02)` commit.
- No live step was taken: no push, no PR, no secret set, no workflow run, no Cloudflare call. The pre-merge run of this workflow (74-06) is where the report first prints a real account name.

## Post-TRD Verification

- Auto-fix cycles used: 0 (one Rule 2 addition during Task 2; the first mutation check led to a stronger case 7)
- Must-haves verified: 4/4 truths (the report's content and its id/token-free output; exit 0 without secrets or on an API or network error and no fetch without secrets; docs.yml diagnostic, `--branch="$DEPLOY_BRANCH"` and one `PAGES_PROJECT`; fetch injected, no network)
- Gate failures: the 13 worktree-only daemon failures listed under Known failures; none from this TRD

## Self-Check: PASSED

- FOUND: scripts/ci-cloudflare-target.cjs, scripts/ci-cloudflare-target.test.cjs, scripts/__fixtures__/cloudflare-api-fixtures.cjs, .github/workflows/docs.yml
- FOUND commits: fa4c2f0f, 62d452f6, f40162a8, e5f18d2e (each touches only `files_modified` paths) on df/exec-74-02-cloudflare-target-and-docs-deploy, based on 37381120
