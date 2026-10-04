---
objective: 51-github-migration-and-docs
trd: "08"
type: standard
wave: 5
depends_on: ["51-07"]
files_modified:
  - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.resume.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-backfill.e2e.test.cjs
  - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs
  - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs
autonomous: true
requirements: [GMD-01, GMD-02]
must_haves:
  truths:
    - "Interrupted mid-flush (`maxOps`, then offline): done ops stay done, the rest stay pending, the resume flushes only (no re-import, no duplicate op or write) and the final GitHub state equals the uninterrupted run, compared by `devflow:id`"
    - "Killed between create and mapping write (mapping file deleted mid-run): the resume finds issues by marker; no duplicate issues"
    - "A secondary rate limit (`HTTP 403 ... retry-after: 30`) during the drain leaves the op pending with `retry_after`; the resume after the clock advances completes, and no already-done op is written twice"
    - "A human edit of a managed body between runs halts: apply refuses `halted` with `gh outbox status` guidance, 0010 never runs; after `gh outbox resolve <seq> --accept-remote` the next apply completes"
    - "A bare `upgrade --apply --confirm` on an interrupted store-on project reaches 0011 (0010 is skipped by the 51-04 rule) instead of halting on 0010 (G4)"
    - "Through the real CLI with a temp HOME: `df-tools upgrade --check --raw` shows 0011's plan reason; `df-tools planning import --dry-run` prints the estimate; `df-tools upgrade --apply --only 0011 --confirm` exits non-zero while pending and 0 once complete, all against the fake via a `gh` PATH shim"
    - "Migration 0011 spawns neither gh nor git and never calls `ghWrite(` (seam guard)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.resume.test.cjs
      provides: "SC1 interruption/resume scenarios"
    - path: plugins/devflow/devflow/bin/lib/gh-backfill.e2e.test.cjs
      provides: "CLI end-to-end through df-tools upgrade and planning import"
  key_links:
    - "Exercises 51-04 (0010 deferral), 51-05 (estimate), 51-06/51-07 (0011)"
---

# TRD 51-08: backfill resilience and CLI end to end (SC1 resume)

<objective>
Prove the backfill survives every interruption the research listed and works through the real `df-tools` entry points, then guard
the migration with the gh seam test. Fixes to 0011 found here land in this TRD.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: scenario tests first (`test(51-08): ...`); a scenario that passes on first run needs no code commit (record it in
  the SUMMARY); a failing one gets `fix(51-08): ...` in 0011.
- Fake GitHub only. For the CLI e2e use the gh PATH shim the 46-50 e2e tests use (grep `PATH` shim / `gh-shim` in
  `__fixtures__/` and the 50-12 e2e test) with `HOME`, `DEVFLOW_OUTBOX_DIR`, `DEVFLOW_GH_CACHE_DIR`, `DEVFLOW_WIKI_REMOTE` pointing
  at temp dirs. Never the real `~/.claude` or GitHub. Never port 8080.
- The CLI cannot inject a fake clock; the e2e uses `makeBackfillProject({objectives: 3})` so it fits inside one hour window, and
  forces a pending stop with an offline shim mode instead of the hour budget.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.

## Decisions

- Library-level scenarios call `upgrade.apply({projectRoot, userHome, only:['0011'], confirm:true, options:{now, sleep, maxOps}})`
  (match the real `apply` signature; read upgrade.cjs) so the runner's stamping and halting are part of what is tested.
- Equality of end states: build a `stateOf(fake)` helper in the test file: sets of `{devflow:id, state, state_reason, parent id,
  blocked-by ids}` plus comment markers; compare with `assert.deepEqual`.
- Seam guard: add `migrations/0011-github-store-backfill.cjs` to the guarded set with a `// objective 51 (TRD 51-08)` comment
  (adjust the path join if the guard reads only `lib/` top-level files).

## Test list

1. Interrupt with `maxOps: 40`: refusal `pending`; journal has done + pending; apply #2 (no maxOps): queue phase skipped (journal max
   seq unchanged before the flush), completes; `stateOf` equals an uninterrupted control run on a fresh fixture; no write repeated
   (`fake.writes()` has no duplicate POST for the same marker).
2. Offline mid-run: `fake.setOffline(true)` after K writes (via a wrapped `runGh` counter), then apply → refusal `pending`
   (offline); `setOffline(false)`, apply → complete.
3. Lost mapping: after a partial run delete `.planning/.gh-mapping.json`; apply → complete; issue count equals the control run.
4. Secondary limit: `fake.failNext(/POST .*issues$/, {ok:false, status:1, stderr:'HTTP 403: You have exceeded a secondary rate limit\nretry-after: 30'})`
   → the drain sleeps the 30 s through the injected sleep or stops pending; either way the final state equals control and no done op
   is re-sent.
5. Remote edit halt: partial run, `fake.humanEditBody(n, 'edited by a human')` on a managed issue, apply → refusal `halted`, text
   names `gh outbox status`; `.gitignore` unchanged; resolve with the outbox library `--accept-remote` equivalent, apply → complete.
6. G4: interrupted store-on state, `upgrade.apply({confirm:true})` with no `only` → result shows 0010 skipped (reason names 0011)
   and 0011 attempted (not `halted` on 0010).
7. CLI e2e: `--check --raw` JSON lists 0011 in `pending_confirm` with a reason containing `writes`; `planning import --dry-run`
   prose contains `estimate:`; offline shim → `upgrade --apply --only 0011 --confirm` exits non-zero and prints the resume command;
   online → exits 0, `git ls-files .planning` lists only `.planning/config.json` (and STACK.md if present), and the printed
   follow-up contains `DEVFLOW_SKIP_GH_GATE=1`.
8. Seam guard green with 0011 added.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: interruption, lost mapping, secondary limit (tests 1-4)</name>
  <files>plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.resume.test.cjs, plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs</files>
  <action>
RED: tests 1-4; commit `test(51-08): backfill resumes after interruption without duplicates`.
GREEN: fix any defect in 0011 (`fix(51-08): ...`).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.resume.test.cjs</verify>
  <done>Tests 1-4 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: halt and runner resume (tests 5-6)</name>
  <files>plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.resume.test.cjs, plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs</files>
  <action>
RED: tests 5-6; commit `test(51-08): remote-edit halt and bare --apply --confirm resume`.
GREEN: fixes if needed (`fix(51-08): ...`).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.resume.test.cjs plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs</verify>
  <done>Tests 5-6 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: CLI end to end and seam guard (tests 7-8)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-backfill.e2e.test.cjs, plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</files>
  <action>
RED: tests 7-8; commit `test(51-08): backfill through df-tools upgrade; seam guard covers 0011`.
GREEN: fixes if needed. Run df-tools as `node <repo>/plugins/devflow/devflow/bin/df-tools.cjs --cwd <tmp> ...` with the env above.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-backfill.e2e.test.cjs plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</verify>
  <done>Tests 7-8 pass.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `__fixtures__/gh-fake.cjs`: `failNext` ~L1628, `setOffline` L1611-1616, `humanEditBody`, `writes()`, `writeTimes()`.
- `gh-outbox-flush.test.cjs` ~L1294: secondary-limit case to copy.
- `gh-outbox-flush.cjs` L494-540: upsert by `devflow:id` marker (why a lost mapping does not duplicate).
- 50-12 / 49-14 e2e tests: CLI-through-shim setup and env isolation.
- `upgrade.cjs` L430-460 (selection, halt).
</codebase_examples>
<anti_patterns>
- Comparing issue numbers across runs (they differ); comparing with `devflow:id` sets instead.
- Real sleeps; real network; real `~/.claude`.
</anti_patterns>
<error_recovery>
- If the outbox resolve path is only in `gh-store-cli`, call its library function (not a child process) in test 5.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.resume.test.cjs plugins/devflow/devflow/bin/lib/gh-backfill.e2e.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.apply.test.cjs plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</regression>
</validation_gates>

<verification>
- SC1 "resumes after interruption": tests 1-6. GMD-02 through the CLI: test 7.
</verification>

<success_criteria>
No interruption the research named loses work, duplicates an issue, or strands the runner; the real CLI drives the whole flow.
</success_criteria>

<output>
After completion, create `.planning/objectives/51-github-migration-and-docs/51-08-SUMMARY.md` (via `summary post 51-08 --from <file>`)
</output>
