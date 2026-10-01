---
objective: 47-github-authoritative-store
trd: "13"
subsystem: github-store
tags: [github, e2e, store, outbox, wiki, budget, scope-comments, degraded-mode, seam-guard]

requires:
  - objective: 47-github-authoritative-store
    provides: "47-02 fake GitHub + store fixtures, 47-04 wiki store, 47-07 flusher, 47-08 comments, 47-09 hierarchy, 47-10 pull --all, 47-11 store CLI, 47-12 sync wiring"
provides:
  - "gh-store-e2e.test.cjs: objective 47 success criteria SC1-SC5 through the public commands on one stateful fake GitHub and one local wiki remote"
  - "seam guard coverage of gh-store-cli.cjs (no gh spawn, no git spawn, no direct ghWrite)"
affects: [47-14-docs-and-full-suite]

tech-stack:
  added: []
  patterns:
    - "one gh._setRunGh(fake.runGh) reaches gh.cjs, gh-pull.cjs, gh-store-cli.cjs and every gh-* module"
    - "commands run in-process under capture(); exit codes asserted from the captured process.exit"
    - "scenario describes build the pushed project in beforeEach (push:true) so each test is independent"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs

key-decisions:
  - "SC4's offline write path is `gh sync` of local edits, not the `gh trd` verbs: freeze/scope/fold read GitHub (body hash, effective spec), so offline they exit 1 and queue nothing; the e2e asserts that refusal explicitly"
  - "gh pull --all on the fixture exits 2, not 0: the fixture's hand-written ROADMAP.md is reported as hand_maintained attention; the test pins the attention list to exactly that one note"
  - "the hermetic guard compares only the store-owned dirs under the real ~/.claude/devflow/state (outbox, gh-project) and the existence of .planning/wiki and docs/devflow in this repo, because other live sessions legitimately write elsewhere under state"

patterns-established:
  - "an op that wrote nothing (unchanged TRD) is passed over when mapping journal ops to fake writes; an op whose writes all precede the previous op's write fails the order check"

requirements-completed: [GST-01, GST-02, GST-03, GST-04, GST-05, GST-06, GST-07, GST-08]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: true

duration: 2 sessions (resumed once)
completed: 2026-10-01
---

# Objective 47 TRD 13: End-to-end store scenario, SC1 to SC5 Summary

**Objective 47's five success criteria are proven through `gh sync`, `gh pull --all`, `gh outbox` and `gh trd` on one stateful fake GitHub and a local bare wiki remote: the fixture objective round-trips byte for byte, an oversized TRD is refused before any gh call, scope comments order and fold, offline writes queue and flush in order, a remote edit halts the flush, and a user-owned repo without a wiki works the same through labels, `meta` and `docs/devflow/`. No production code changed; no earlier TRD had a defect.**

## What was built

- `gh-store-e2e.test.cjs` (13 tests, 9 describes). Shared setup per test: `hermeticEnv()`, a fake clock, a local wiki remote (`createWikiRemote`) with `DEVFLOW_WIKI_REMOTE` pointing at it, `makeStoreProject({store:true})`, `createFakeGitHub(project.fakeOptions)` and a single `gh._setRunGh(fake.runGh)`. `useStore({push:true})` runs `gh sync 7` once in `beforeEach`.
- `gh-seam.repo.test.cjs`: `gh-store-cli.cjs` added to `GUARDED`, to the "never calls ghWrite" list and to test 21's "guard lists every store module" assertion. The guard passed unchanged: the CLI layer already spawns neither gh nor git and never writes to GitHub itself.
- `gh-fake.cjs` was not touched; the fake already had every shape the scenario needed.

## Success criteria and evidence

| SC | Tests | What they prove |
|---|---|---|
| SC1 | 2, 3, 4 | `gh sync 7` creates the objective issue (label `devflow:objective`, type `Objective`, fields `work=feature` `kind=plugin`), three TRD sub-issues in order with type `TRD`, the blocked-by edge 07-03 <- 07-01 by REST id, and the wiki pages `Objective-7-store-demo` (== OBJECTIVE.md on disk), `Project`, `Requirements`, `Roadmap`; the objective `wiki` section pins the remote head. After deleting the whole compare set, `gh pull --all` regenerates every file byte-identically, leaves the hand-written ROADMAP.md untouched, writes a generated STATE.md, and writes nothing to GitHub. A second pull writes `[]`; a re-sync writes nothing to GitHub. |
| SC2 | 5a, 5b | A 60,001-character `07-04` TRD: sync exits 1 with `refused:'budget'` naming 7-04, `fake.calls()` is empty (not even `auth status`), no issue exists, no journal, no wiki clone. At exactly 60,000: sync succeeds with the single warning "TRD 07-04 is 60,000 characters (target 40,000, limit 60,000)". |
| SC3 | 6 | Scope comments posted as n=2, n=1, n=3: `gh trd spec` reports `applied:[1,2,3]` with text order b, a, c and exactly body + scope comments in n order; an open TRD refuses `fold` (exit 1); after the TRD is closed, `fold` exits 0 and the body decodes to the effective spec; the spec-rev log has `scope n=2`, `scope n=1`, `scope n=3` and `fold folded_through=3 from=<hash of the old body>` with the row hash equal to `contentHash(new body)`; `spec` afterwards applies nothing (`foldedThrough` 3). |
| SC4 | 7, 8, 9 | Offline: the trd verbs refuse (exit 1, nothing queued); `gh sync 7` of local edits (two TRD bodies and a new SUMMARY) returns `outbox:'pending'`; `gh outbox flush` exits 3 and writes nothing; `outbox status` lists the queue in seq order. Reconnect: flush exits 0 and the writes reach GitHub in journal seq order (07-02 body, 07-03 body, 07-02 summary comment), every op `done`. Remote edit: after a pull and a human edit of 7-02, three local edits make the sync's flush halt on 7-02 (7-01 written before, 7-03 untouched behind); status prose names `#<n>` and both `--accept-remote` and `--overwrite`; `flush` exits 2 with zero writes after the halt; `resolve <seq> --accept-remote` exits 0, the human body is kept, and the queue behind the halt then drains. |
| SC5 | 10, 11 | User-owned repo without a wiki: sync exits 0; TRD issues carry `devflow:trd` with type null; the objective body `meta` section parses to `{type:'Objective', work:'feature', kind:'plugin'}`; no issue-field or issue-type write was attempted; sub-issues and blocked-by stay native; `docs/devflow/{Objective-7-store-demo,Project,Requirements,Roadmap}.md` exist and there is no `.planning/wiki`. `gh pull --all` (pages mode `docs`) rebuilds the compare set byte-identically; the cached capability report lists types, fields and the wiki as degraded. |
| extra | 12 | A wiki with no first page: issues and sub-issues are created, sync exits 0 with `outbox:'halted'` and a warning, `outbox status` shows `reason:'blocked'` on the `wiki-push` op with "create the first wiki page in the GitHub web UI", `flush` exits 2, and no `docs/devflow/` or wiki clone is written. |
| hermetic | 1a + root hooks | Every location a store command writes (`HOME`, outbox, cache, project root) is under the temp dir; the real `~/.claude/devflow/state/{outbox,gh-project}` listing and the existence of `.planning/wiki` / `docs/devflow` in this repo are identical before and after the whole file. No real GitHub, no network, no port. |
| seam | 13 | the seam guard (`gh-seam.repo.test.cjs`, tests 17-21) passes with `gh-store-cli.cjs` in `GUARDED` and in the no-direct-`ghWrite` list. |

## Deviations from Plan

### Auto-fixed Issues

None. The scenario exposed no defect in a 47 module, so no `fix(47-NN)` commit was needed.

### Contract differences between the TRD text and the code on disk (tests follow the code)

**1. [TRD assumption] Offline `gh trd freeze` / `gh trd scope` cannot queue (test 7)**
- **Found during:** Task 2, first run of test 7.
- **Issue:** the TRD expects `gh trd freeze 07-02` and `gh trd scope 07-03 @file:d` to report pending while offline. `freezeTrd`, `enqueueScope` and `foldTrd` all begin with `readTrdState`, which reads the issue and its comments from GitHub (they need the body hash and the effective spec to compute their spec-rev rows and the budget). Offline they return `{ok:false, error:"could not read issue #N for TRD ..."}` and the CLI exits 1.
- **Resolution:** test 7 asserts that refusal (exit 1, nothing queued, no pending ops) and proves SC4's "writes made while offline are queued" through the path that is offline-capable by design: edit local TRD files plus add a SUMMARY, run `gh sync 7` (a mapped objective offline queues the hierarchy and returns `outbox:'pending'`, per 47-12). Tests 7 and 8 then check exit 3 / exit 0 and journal order on those ops.
- **Not changed:** making the verbs offline-capable would need the base hash from the cache index and a way to compute an effective spec without GitHub, which is a design change beyond a minimal fix. Worth a decision before objective 47 is documented (47-14): either state in the docs that the `gh trd` verbs require connectivity, or open follow-up work.

**2. [TRD assumption] `gh pull --all` exits 2, not 0, on the fixture (test 3)**
- The fixture's ROADMAP.md is hand-written (no generated header), so the pull reports it as `hand_maintained` and, per 47-10, an attention item exits 2. The test pins `exitOf(r) === 2`, `hand_maintained == ['ROADMAP.md']`, a single attention entry matching ROADMAP.md, and no errors. The second pull is also exit 2 with `written: []`.

**3. [Test shaping] Test 9 edits all three TRDs**
- The TRD route (one local edit, sync, halt) leaves nothing behind the halt to prove "nothing after the halt is written". The test edits 07-01, 07-02 and 07-03 locally: 07-01 is written before the halt, 07-02 halts, 07-03's body stays at its pre-sync value until the halt is resolved, and drains after `resolve --accept-remote`.

**4. [Test shaping] Op-to-write mapping in test 8 skips no-op ops**
- Sync also queues an `upsert-issue` for the unchanged 07-01; the flusher writes nothing for it. The order check passes over an op that has no write at all and fails an op whose only writes precede the previous op's write; it requires the three edited ops (`upsert-issue:7-02`, `upsert-issue:7-03`, `upsert-comment:7-02`) to be matched.

**5. [Wording] Halt reason and message (test 12)**
- The journal halt is `reason:'blocked'` with detail "The wiki has no first page yet: create the first wiki page in the GitHub web UI, ..."; the TRD said "in the web UI". The test matches the actual sentence.

### Process note

- The edit gate denied the first `Write` (no live `.planning/.skill-active` marker for this subagent). I started the marker with `df-tools skill-active --start execute-objective` (the documented route) and ended it at the close of this TRD.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: harness + SC1, SC2 (tests 1-5) | `node --test plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs` | 0 (6 tests) | PASS |
| 2: SC3, SC4, SC5, uninitialised wiki (tests 6-12) | `node --test gh-store-e2e.test.cjs gh-e2e.test.cjs` | 0 (37 tests) | PASS |
| 3: seam guard covers gh-store-cli (test 13) | `node --test plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs` | 0 (5 tests) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test gh-store-e2e.test.cjs gh-seam.repo.test.cjs` | 0 | PASS |
| regression | `node --test gh-e2e.test.cjs gh-sync-store.test.cjs gh-store-cli.test.cjs` (with the two above: 107 tests) | 0 | PASS |
| full suite | `npm test` | 0 | 6948 tests, 6915 pass, 0 fail, 33 skipped (MA-7 did not fail on this run) |
| hermetic grep | `rg -n "8080\|api.github.com" gh-store-e2e.test.cjs` | 1 (no matches) | PASS |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (SC1-SC5, hermetic suite, seam guard covers gh-store-cli)
- Gate failures: None
- Repo left clean: no `.planning/wiki` or `docs/devflow` created in this repository by the run.

## Commits

- 3b64073 test(47-13): e2e SC1-SC2 for the authoritative store
- 64d972a test(47-13): e2e SC3-SC5
- 5e2ae7c test(47-13): guard gh-store-cli seam

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs (modified)
- FOUND: commits 3b64073, 64d972a, 5e2ae7c
- `gh-fake.cjs`, `gh-store-fixtures.cjs` and all production modules were not modified.
