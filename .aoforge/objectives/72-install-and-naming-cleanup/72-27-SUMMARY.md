---
objective: 72-install-and-naming-cleanup
trd: "27"
subsystem: github
tags: [gh-client, gh-rebrand, gap-closure, maxBuffer, timeout, tdd]
requirements: [INST-04]
requires:
  - objective: 72
    provides: "72-16: the gh rebrand verb (lib/gh-rebrand.cjs), unit-tested on fixtures only; 72-25: the eden-biz dry run that failed with spawnSync gh ENOBUFS"
provides:
  - "gh-client's single spawn site gives every gh call a 256 MiB output buffer (GH_MAX_BUFFER) and a --paginate call a 300 s timeout (PAGINATE_TIMEOUT_MS; others keep DEFAULT_TIMEOUT_MS 30 s); caller opts still win and fake runners still see opts exactly as passed"
  - "A gh call that overflows its buffer or outlives its timeout fails with a named cause (`gh output exceeded the read buffer of <size> (ENOBUFS)`, `gh timed out after <n> s (ETIMEDOUT)`) and no partial stdout"
  - "gh shim table entries take an optional delay_ms; gh-fixtures has buildGhResponse_issuesSlurp, a hand-built slurped issues answer of a chosen size"
  - "A recorded, read-only gh rebrand dry run against AO-Cyber-Systems/eden-biz: exit 0, ok:true, apply:false, 0 operations"
  - "INST-04 Complete in REQUIREMENTS.md; the maxBuffer todo completed"
affects: [72-verification, 73, 74, 75]
tech-stack:
  added: []
  patterns:
    - "Spawn limits live only at the spawn site (spawnOptions), never in ghRead/ghWrite/ghPaginate/attemptLoop"
    - "Regression tests over the real spawn runner use the gh PATH shim with _setRunGh(null) and env passed through opts"
key-files:
  created: []
  modified:
    - plugins/aoforge/aoforge/bin/lib/gh-client.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-client.test.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/gh-shim.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/gh-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-shim.test.cjs
    - CHANGELOG.md
    - docs/USER-GUIDE.md
    - .aoforge/REQUIREMENTS.md
    - .aoforge/todos/completed/2026-10-09-give-gh-client-a-maxbuffer-so-gh-rebrand-can-read-large-repositories.md
decisions:
  - "gh-client spawn limits: every gh spawn gets maxBuffer 256 MiB; a --paginate call gets a 300 s timeout, any other 30 s; the defaults live only in spawnOptions so fake runners and the 23 seam tests see caller opts untouched"
  - "On ENOBUFS or ETIMEDOUT the runner returns stdout '' (what was read is truncated JSON) and a named cause that gh rebrand already prefixes with the read and the repository"
  - "INST-04 closed on the read-only eden-biz dry run (exit 0, ok:true, apply:false, 0 ops); no --apply was run because no fleet repository is in store mode and a live apply needs the repository owner's own approval"
requirements-completed: [INST-04]
metrics:
  started: 2026-10-09T16:31:10Z
  completed: 2026-10-09T16:41:10Z
  duration: "10 min"
  tasks: 3
  files: 9
  estimate: "estimate trd 72-27: 10 min (P90 19 min), $4.03 (P90 $6.58), 3 tasks, confidence low (trd_level, n=73)"
tokens_input: 11364955
tokens_output: 56785
tokens_cache_read: 11179624
tokens_cache_write: 185165
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 27: gh-client read buffer for `gh rebrand`, proven on eden-biz (gap closure) Summary

**gh-client's one spawn site now gives every `gh` call a 256 MiB output buffer and a paginated read 5 minutes, and names an overflow (`ENOBUFS`) or a timeout (`ETIMEDOUT`) instead of returning truncated JSON. With that, the read-only `gh rebrand --dry-run` against AO-Cyber-Systems/eden-biz completes (exit 0, ok:true, apply:false, 0 operations), and INST-04 is Complete.**

## Progress
- [x] Task 1: Hand-built fixtures: a delaying gh shim entry and a sized, slurped issues answer — f9d41715 (RED), 46f5e23e (GREEN)
- [x] Task 2: gh-client spawn runner: 256 MiB buffer, 300 s paginated timeout, named ENOBUFS/ETIMEDOUT causes — 3077a1b8 (RED), 539b4386 (GREEN)
- [x] Task 3: Prove it on eden-biz (read-only dry run), record the plan, then CHANGELOG, USER-GUIDE and the tracker — dfefd2fd (tracker), 849dcd77 (CHANGELOG and guide)

## Estimate

`node ~/.claude/aoforge/bin/aof-tools.cjs estimate trd 72-27` (recorded at 16:31Z, before any edit): **10 min (P90 19 min), $4.03 (P90 $6.58)**, 3 tasks, confidence low (weakest: Task 1, test_tdd, n=5), minutes from TRD-level history (n=73). Actual: about 10 min (16:31:10Z to 16:41:10Z), at the median.

## What changed

- **`gh-client.cjs`**: new constants `GH_MAX_BUFFER` (256 MiB), `DEFAULT_TIMEOUT_MS` (30000) and `PAGINATE_TIMEOUT_MS` (300000), each with a one-line reason. `spawnOptions(args, opts)` builds the spawnSync options: encoding, stdio, the timeout for the call's kind (`--paginate` in args gets 300 s), the buffer, then the caller's `opts`, which win. `defaultRunGh` spawns with those options and maps two error codes before the generic fallback: `ENOBUFS` becomes `gh output exceeded the read buffer of <256 MiB | n bytes> (ENOBUFS)` and `ETIMEDOUT` becomes `gh timed out after <n> s (ETIMEDOUT)`, both with `status: null` and `stdout: ''`. `ENOENT` and every other code behave as before. The constants and `_spawnOptions` are exported, and the module header has a "Limits (72-27)" bullet. `ghRead`, `ghWrite`, `ghRun`, `ghPaginate`, `attemptLoop` and `gh-rebrand.cjs` are unchanged.
- **`__fixtures__/gh-shim.cjs`**: `shimMain` waits `delay_ms` (a positive integer only) with `Atomics.wait` after it finds the entry and before it writes anything, so a caller's timeout kills it with nothing read. The header comment and the JSDoc table type document it.
- **`__fixtures__/gh-fixtures.cjs`**: `buildGhResponse_issuesSlurp({ count, bodyBytes, perPage })` returns a runner-shaped result whose stdout is the `gh api --paginate --slurp` shape (one outer array, one inner array per page). Issue n is `{ number: n, id: 1000 + n, title: 'Issue <n>', body: 'x' * bodyBytes, labels: [], updated_at }`. It is exported under `// TRD 72-27:`.
- **Tests**: `gh-shim.test.cjs` 21g-21k (F1-F5) and `gh-client.test.cjs` `72-27 spawn runner limits` R1-R4 and U1-U4. R1 reproduced the 72-25 defect hermetically before the fix (`spawnSync gh ENOBUFS` over a 2.3 MiB slurped answer). Tests 1 (missing gh) and 23 (fake runner sees `{input}` exactly) pass unchanged.
- **CHANGELOG** `## [Unreleased]` → `### Fixed`: the `gh rebrand` large-repository entry. **USER-GUIDE** "Rebranding a repository" → Not covered: "or a single list read larger than 256 MiB or slower than 5 minutes".

## eden-biz dry-run plan

Command, from this checkout (the installed 3.0.0 mirror still has the bug): `node /Users/justin/dev/aoforge-claude/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd /Users/justin/dev/eden-biz/go gh rebrand --dry-run --raw`, with the payload written to the session scratchpad (`eden-biz-rebrand-dry-run.json`, 703 bytes; nothing from it was copied into this repository). **Exit 0, real 12.45 s** (16:36:49Z). It ran once, with no rate-limit retry.

| Field | Value |
|---|---|
| ok | true |
| apply | false |
| repo | AO-Cyber-Systems/eden-biz |
| ops | 0 (no section has any operation, so there is no per-kind count) |
| files (local paths an apply would change) | none (the payload has no `files` key and the `local` section planned nothing) |

| Section | Status | Note |
|---|---|---|
| labels | ok | none |
| issues | ok | none |
| comments | ok | none |
| wiki | skipped | the wiki is uninitialised (the wiki repository does not exist yet); nothing to rename there |
| rulesets | ok | not edited from the repository: organization ruleset 11490149 (Private Repos) |
| local | ok | none |

**Why the plan is empty (read-only corroboration, counts only).** Through this checkout's gh-client: the issues list is **876 items (525 pull requests), 6,261,086 bytes** of JSON (about 6.0 MiB, six times Node's old 1 MiB default), and the comments list is **423 comments, 1,403,804 bytes** (also over 1 MiB, the second exposure the todo named). Of eden-biz's 27 labels, **0** are in the legacy `devflow:` namespace and 0 in `aoforge:`. **0** issue bodies and **0** comment bodies are managed text by `gh-rebrand.isManagedText`. eden-biz mirrors to GitHub with the store off, and nothing AOForge-managed was ever written there, so there is nothing to rebrand. Every read the verb needs now succeeds on a repository of this size, which is what INST-04's dry-run clause required.

**eden-biz untouched.** `git -C /Users/justin/dev/eden-biz status --porcelain` before and after the dry run (diff empty):

```
 M .planning/.dup-detect-log.jsonl
?? .devflow-handoff/
?? .planning/handoffs/subscription-created-cancelled-context.md
?? .planning/objectives/720-polymorphic-coupon-redemption-source/720-VERIFICATION.md
?? .planning/objectives/723-wire-money-paths-to-coupon-resolver/OBJECTIVE.md
?? .planning/objectives/724-affiliate-entity-and-codes/OBJECTIVE.md
?? .planning/objectives/772-investor-portal-funds-vs-funding-rounds/.planning/
?? .worktrees/
```

(The same eight lines before and after: eden-biz was already dirty and on `.planning/`, as 72-25 found. It was not upgraded.)

**No `--apply` was run, against eden-biz or any repository.** The dry run was read-only. No fleet repository is in store mode (72-25), and a live `gh rebrand --apply` needs the repository owner's own explicit approval, so it was out of scope here. Since the plan has 0 operations, there is nothing to apply on eden-biz, and no follow-up "apply after approval" todo was filed (Task 3 step 7 applies only when the plan has operations).

## Tracker

- `requirements mark-complete INST-04`: line 50 reads `- [x] **INST-04**` and the traceability row reads `| INST-04 | Objective 72 | Complete |` (no draft and `doc put` repair was needed).
- `todo complete 2026-10-09-give-gh-client-a-maxbuffer-so-gh-rebrand-can-read-large-repositories`: the todo is under `.aoforge/todos/completed/`.
- Both are committed in dfefd2fd.

## Deviations from Plan

### Auto-fixed Issues

None. The TRD was executed as written.

### Notes

**1. [Observation] The dry-run payload shape differs from the TRD's description.** Task 3 step 3 described `sections` entries with `state, needs_admin, notes` and a `files` key. The actual `--raw` payload has the keys `ok, apply, repo, ops, sections`, and each section is `{ status, note }`. The table above records the real fields. Local files an apply would change are therefore read from the `local` section and the empty `ops`, which list none. No code change was needed.

**2. [Rule 2 - evidence] Added read-only corroboration of the empty plan.** A plan with 0 operations could also come from a read that returned nothing. Two read-only `ghPaginate` calls through this checkout's gh-client (no writes, no `--apply`) printed counts and byte sizes only. They show the reads are large and complete (issues 876 / 6.0 MiB, comments 423 / 1.34 MiB) and that eden-biz holds no legacy labels or managed text. No issue or comment text was printed or stored.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: shim delay_ms + sized answer fixtures | `node --test plugins/aoforge/aoforge/bin/lib/gh-shim.test.cjs` (11/11), and the 9 suites that load the fixtures (349 tests, 0 fail, 13 skipped) | 0 | PASS |
| 2: gh-client spawn limits and named causes | `node --test gh-client.test.cjs gh-shim.test.cjs gh-seam.repo.test.cjs gh-rebrand.legacy.test.cjs` (88/88), then `node --test 'plugins/aoforge/aoforge/bin/lib/gh*.test.cjs'` | 0 | PASS |
| 3: eden-biz dry run, tracker, docs | dry run exit 0 with `"ok": true, "apply": false`; porcelain diff empty; `rg -n -e 'INST-04' .aoforge/REQUIREMENTS.md` shows `[x]` (line 50) and `Complete` (line 99); the todo is listed under `todos/completed/`; `rg -n -e 'ENOBUFS' CHANGELOG.md` hits lines 13-14 under `## [Unreleased]` | 0 | PASS |

`rg -n -e 'GH_MAX_BUFFER' -e 'PAGINATE_TIMEOUT_MS' -e 'ENOBUFS' -e 'ETIMEDOUT' plugins/aoforge/aoforge/bin/lib/gh-client.cjs` shows the constants (44, 48), the defaults in `spawnOptions` only (66-67), both named causes (91-100) and the exports. `maxBuffer` appears as a default only on line 67.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Task 1 RED (f9d41715) | `node --test .../gh-shim.test.cjs` | 1 | FAIL (correct): 21g answered after 41 ms, 21h no ETIMEDOUT, 21j/21k `buildGhResponse_issuesSlurp is not a function`; 21i (kept behaviour) passed |
| Task 1 GREEN (46f5e23e) | `node --test .../gh-shim.test.cjs` | 0 | PASS (correct): 11/11 |
| Task 2 RED, R1 alone | `node --test --test-name-pattern=R1 .../gh-client.test.cjs` | 1 | FAIL (correct): `spawnSync gh ENOBUFS` (the 72-25 defect, reproduced hermetically) |
| Task 2 RED (3077a1b8) | `node --test .../gh-client.test.cjs` | 1 | FAIL (correct): R1/R2 ENOBUFS; R3 returned truncated stdout and `spawnSync gh ENOBUFS`; R4 `spawnSync gh ETIMEDOUT`; U1-U3 `_spawnOptions is not a function`; U4 constants undefined; tests 1 and 23 passed |
| Task 2 GREEN (539b4386) | `node --test gh-client gh-shim gh-seam.repo gh-rebrand.legacy` | 0 | PASS (correct): 88/88 |
| REFACTOR | none | n/a | No duplicate appeared; no refactor commit |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped, per task) | `node --test plugins/aoforge/aoforge/bin/lib/gh-client.test.cjs plugins/aoforge/aoforge/bin/lib/gh-shim.test.cjs` | 0 | PASS |
| test (doc guards, Task 3) | `node --test doc-refs.repo rename-guard.repo changelog planning-writes.repo` | 0 | PASS |
| test (full, before Task 1) | `node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` | 0 | PASS: 11942 tests, 11907 pass, 0 fail, 35 skipped |
| test (full, after Task 3) | same command | 1 | PASS with the known transient: 11955 tests (11942 + the 13 new), 11919 pass, 1 fail, 35 skipped. The one failure is `roadmap-reconcile.test.cjs` E2E1, whose only drift was the unticked `72-27` ROADMAP line (the TRD's gotcha, also seen in 72-22). After `roadmap update-job-progress 72` ticked it, `node --test --test-name-pattern=E2E1 .../roadmap-reconcile.test.cjs` exits 0 (1/1). No new failure. |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (large answer read intact over the real runner: R1, R2; limits and caller-opts precedence with test 23 unchanged: U1-U4; named causes: R3, R4; eden-biz dry run exit 0 / ok:true / apply:false with counts and identical porcelain; INST-04 `[x]` and Complete, requirements-completed, todo completed, the no-`--apply` limit stated; CHANGELOG `### Fixed`)
- Gate failures: none new. The full run after Task 3 had the transient roadmap-reconcile E2E1 (this TRD's ROADMAP box was unticked), which passes once the box is ticked.

## Proposed STACK.md correction (not applied)

`.aoforge/STACK.md` "Layout & architecture" still says the plugin lives in `plugins/devflow/`, the CLI is `devflow/bin/df-tools.cjs`, and skills call the `~/.claude/devflow` mirror. Proposed text: "The plugin lives in `plugins/aoforge/`. `aoforge/bin/aof-tools.cjs` is the CLI; its internals are CommonJS modules in `aoforge/bin/lib/*.cjs` using synchronous fs. Skills and agents call the `~/.claude/aoforge` MIRROR, not this checkout." For the user to adopt; this TRD did not edit STACK.md.

## Discovered commands

None. The test command came from the profile (`npm test`, scoped `node --test {files}`). The full-suite form that skips `micro.test.cjs` came from the TRD.

## Self-Check: PASSED

- Files: all 9 key files exist (gh-client.cjs, gh-client.test.cjs, __fixtures__/gh-shim.cjs, __fixtures__/gh-fixtures.cjs, gh-shim.test.cjs, CHANGELOG.md, docs/USER-GUIDE.md, .aoforge/REQUIREMENTS.md, todos/completed/2026-10-09-give-gh-client-a-maxbuffer-so-gh-rebrand-can-read-large-repositories.md). The artefact markers are present: `GH_MAX_BUFFER` (gh-client.cjs), `ENOBUFS` (gh-client.test.cjs), `delay_ms` (gh-shim.cjs), `buildGhResponse_issuesSlurp` (gh-fixtures.cjs).
- Commits: f9d41715, 46f5e23e, 3077a1b8, 539b4386, dfefd2fd and 849dcd77 are all in `git log 51f334d3..HEAD`, each RED before its GREEN.
- OBJECTIVE.md's uncommitted `status: verifying` (the orchestrator's) was left out of every commit.
