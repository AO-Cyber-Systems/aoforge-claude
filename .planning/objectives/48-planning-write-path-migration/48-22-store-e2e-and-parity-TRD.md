---
objective: 48-planning-write-path-migration
trd: "22"
type: tdd
wave: 5
depends_on: ["48-07", "48-08", "48-09", "48-10", "48-12", "48-13", "48-14", "48-15"]
files_modified:
  - plugins/devflow/devflow/bin/lib/planning-verbs.e2e.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/planning-e2e-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
autonomous: true
requirements: [GWP-01, GWP-03, GWP-04]
must_haves:
  truths:
    - "SC3: on a fixture git repo in store mode (migration 0010 applied), plan → execute → verify driven only through the df-tools verbs leaves `git status --porcelain` listing only the code file before its commit and empty after it"
    - "After the scenario the fake GitHub holds the objective issue, 3 TRD sub-issues, 3 `devflow:summary` comments, the sticky verification comment, the closed objective, the context/research wiki pages, one todo issue and one quick issue; deleting the cache and running `gh pull --all` reproduces every cache file byte-identically"
    - "STORE-OFF PARITY (D-01 invariant): the same script with `github.store` unset writes exactly the files with exactly the bytes of the `--from` drafts (and today's ROADMAP/STATE/OBJECTIVE side effects), makes zero gh calls, creates no outbox/ledger files, and `.planning/` stays tracked — dirty after the verbs, clean after `df-tools commit`"
    - "Negative: a Bash-style `fs.writeFileSync` to a cached TRD makes `validate health` emit W055 naming the file and `plan put-trd`; an offline `plan put-trd` queues (exit 3) and the next online `gh outbox flush` exits 0"
    - "The suite is hermetic: fake GitHub via `gh._setRunGh`, local `file://` wiki remote, temp HOME/outbox dirs, no network, never port 8080"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/planning-verbs.e2e.test.cjs
      provides: "SC3 scenario, store-off parity, W055 and offline negatives"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/planning-e2e-fixtures.cjs
      provides: "makeE2eRepo({store}) — git repo + .planning config + objective dir + hand-written drafts"
  key_links:
    - "Drives 48-15 `planning-verbs-cli` functions in-process (so the fake is injectable) and spawns `df-tools commit` for git; reuses 47's `makeStoreProject`, `createFakeGitHub`, `createWikiRemote`, `hermeticEnv`"
---

# TRD 48-22: End-to-end — SC3 on the fake GitHub, store-off parity, drift and offline negatives

<objective>
Prove success criterion 3 and the objective's central invariant with one scenario run twice: in store mode it leaves the repo clean apart
from code and GitHub holding everything; with the store off it writes today's files and touches nothing remote. Add the W055 and offline
negatives.

Purpose: SC3, D-01 parity, GWP-03/04 end to end. Output: e2e test + hand-built fixture builder; fake fixes only if the scenario exposes a gap.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<!-- TDD shape: each scenario test is committed first (test commit). Behaviour was built test-first in 48-01..48-15, so a test may pass on
first run; any failure it exposes is fixed in the owning module RED → GREEN (failing test already committed, then the fix commit), never by
weakening this test. -->

## Binding rules

- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Hermetic: `hermeticEnv()`; `gh._setRunGh(fake.runGh)` + `_resetClient()`; `createWikiRemote()`; fake clock. Git via `gitTestEnv()` from
  `__fixtures__/wiki-remote.cjs` for the fixture repo. Never real GitHub/`~/.claude`, never port 8080.
- Hand-written drafts (3 short TRDs for 2 waves, CONTEXT, RESEARCH, 3 SUMMARYs, VERIFICATION, one todo, one quick JOB/SUMMARY) live in the fixture
  builder as literals. No generated data.
- If a gap in the fake blocks the scenario, add the route to `gh-fake.cjs` and describe it in the SUMMARY (gh-fake.test.cjs is not in this TRD).

## Decisions

- **Driver**: in-process calls to `planning-verbs-cli` `cmd*` functions with captured stdout and `process.exitCode`; `df-tools commit` and
  `upgrade --apply --only 0010 --confirm` are spawned (they are git/local only; spawned children cannot see the fake, and need not).
- **Store setup order**: `git init` → write config (`github.enabled/store/repo`) → initial commit of config + STACK.md → (store run) `planning import`
  is unnecessary on an empty cache; apply 0010 (preconditions pass trivially) → commit `.gitignore`.
- **Scenario** (both modes): `objective put 7` → `plan put-trd 7 <file> --no-push` ×3 → `plan push 7` → `doc put` CONTEXT and RESEARCH →
  for each TRD: write+`df-tools commit` one code file `src/t<N>.cjs`, `summary checkpoint`, `summary post` → `todo add` → `quick put 1 x` +
  `quick summary 1` → `verification post 7` → `objective set-status 7 complete`.

## Test list

1. Store: after setup, `git ls-files .planning` = `config.json`, `STACK.md`; `.gitignore` has the 0010 block.
2. Store: scenario; after each verb `git status --porcelain` is empty except the in-flight `src/t<N>.cjs` before its commit; empty at the end (SC3).
3. Store: fake state — objective issue closed/completed; 3 TRD issues as sub-issues with the 2-wave blocked-by edge; 3 summary comments; sticky verification comment; wiki pages Context/Research; one `devflow:todo` issue; one Quick issue, closed, with a summary comment.
4. Store: snapshot `.planning/` cache files, delete them (keep config/STACK/runtime), `gh pull --all` → byte-identical snapshot; second pull writes nothing.
5. Store: `validate health --raw` (spawned with the same temp HOME/outbox env) → no W055 after the scenario.
6. Store negative: `fs.writeFileSync` on `07-01-*-TRD.md` → W055 naming the rel and `plan put-trd`.
7. Store negative: `fake.setOffline(true)`; `plan put-trd 7 07-04-x-TRD.md` → exit 3, journal has the op, file in ledger; `setOffline(false)`; `gh outbox flush` → exit 0, ledger settled.
8. Parity: same scenario with store off → every written file equals its draft bytes; OBJECTIVE.md status and ROADMAP/STATE effects equal today's `objective complete` results (compare with a run of the pre-48 commands on a copy: `objective complete` subprocess on a twin repo); `fake.calls().length === 0`; no files in the temp outbox dir.
9. Parity: `git status --porcelain` shows the `.planning/` files as modified/untracked after the verbs; after `df-tools commit "docs: x" --files .planning/` it is clean (`.planning/` still tracked).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fixture builder + store setup (test 1)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/planning-e2e-fixtures.cjs, plugins/devflow/devflow/bin/lib/planning-verbs.e2e.test.cjs</files>
  <action>
Create `makeE2eRepo({store})`: temp dir, `git init` with `gitTestEnv()`, `.planning/config.json` = `{github:{enabled:true, repo:'o/r', store:true}}` for the store run and the same
without `store` for the parity run (so only `store` differs), `.planning/STACK.md` stub, objective dir
`07-store-demo`, drafts dir under the temp root (outside `.planning/`), plus `cleanup()`. Create the e2e file with a header mapping tests to SC3 /
D-01 and implement test 1. Commit `test(48-22): e2e fixture and store setup`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-verbs.e2e.test.cjs</verify>
  <done>Test 1 passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: SC3 scenario, round trip, drift and offline (tests 2-7)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-verbs.e2e.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs</files>
  <action>
Implement tests 2-7 with helpers `verb(argv)` (in-process CLI call → `{code, out}`), `gitStatus()`, `snapshot(rels)`. Any failure: fix in the
owning module test-first (separate commit), re-run. Commit `test(48-22): SC3 plan-execute-verify leaves git clean`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-verbs.e2e.test.cjs</verify>
  <done>Tests 1-7 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Store-off parity (tests 8-9)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-verbs.e2e.test.cjs</files>
  <action>
Implement tests 8-9 running the identical scenario on `makeE2eRepo({store:false})` and a twin repo driven by the pre-48 commands where a verb
delegates (`objective complete`). Commit `test(48-22): store-off parity for every verb`. Run the 47 e2e and the gate suite alongside.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-verbs.e2e.test.cjs plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs plugins/devflow/hooks/gate-edits.test.js</verify>
  <done>Tests 8-9 pass; 47 e2e and gate suites green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-store-e2e.test.cjs` (47-13): harness shape, `capture(...)`, `snapshot(root, rels)`, fake + wiki remote setup.
- `__fixtures__/gh-store-fixtures.cjs` L304 `makeStoreProject`, L399 `hermeticEnv`; `__fixtures__/wiki-remote.cjs` `createWikiRemote`, `gitTestEnv`.
- fake API: `calls()`, `writes()`, `setOffline`, `seedIssue`, `seedMilestone`, `humanEditBody`.
</codebase_examples>
<anti_patterns>
- Asserting "git status clean" while the code file is uncommitted: the criterion is "clean apart from code".
- Comparing parity against hard-coded expected bytes when a delegate command exists: run the real pre-48 command on a twin.
</anti_patterns>
<error_recovery>
- If spawned `validate health` cannot see the outbox state, pass `DEVFLOW_OUTBOX_DIR` and `HOME` from `hermeticEnv()` into the child env explicitly.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/planning-verbs.e2e.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs</regression>
</validation_gates>

<verification>
- SC3 maps to tests 2-4; D-01 parity to tests 8-9; GWP-03 to test 6.
- `rg -n "8080|api.github.com" plugins/devflow/devflow/bin/lib/planning-verbs.e2e.test.cjs` → none.
</verification>

<success_criteria>
A whole objective runs through the verbs with GitHub as the store and git seeing only code, and the same run without the store is today's DevFlow.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-22-SUMMARY.md`
</output>
