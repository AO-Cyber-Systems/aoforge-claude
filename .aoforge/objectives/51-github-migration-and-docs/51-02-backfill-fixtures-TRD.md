---
objective: 51-github-migration-and-docs
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-backfill-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/gh-backfill-fixtures.test.cjs
autonomous: true
requirements: [GMD-01, GMD-02]
must_haves:
  truths:
    - "`makeBackfillProject()` builds, in a temp dir, a git-initialised local-mode DevFlow project with 20 objectives x 5 TRDs, `github: {enabled: true, repo: 'o/r'}` and store OFF"
    - "Objectives 1-15 are shipped (`status: complete`, every TRD has a SUMMARY), 16-18 in progress (some SUMMARYs), 19 `status: cancelled`, 20 planned (no SUMMARYs); one shipped objective has a deferred TRD with no SUMMARY"
    - "The project carries 3 todos, 1 debug session, 1 quick task, PROJECT.md, REQUIREMENTS.md, research/a.md, MILESTONES.md with two shipped `## vX.Y` sections, a decision with `trd:` and one without"
    - "Variants `{legacyTrd: true}` and `{oversizeTrd: true}` add a legacy-named TRD and a 61,000-char TRD respectively; the default has neither"
    - "Two builds with the same options produce byte-identical trees (deterministic, hand-built content)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/gh-backfill-fixtures.cjs
      provides: "makeBackfillProject(opts), BACKFILL_SHAPE (expected counts), useBackfillEnv() (fake clock + fake GitHub + hermetic env + wiki remote)"
  key_links:
    - "Consumed by 51-03 (history ops), 51-05 (calibration), 51-06/07/08 (migration scenarios)"
---

# TRD 51-02: the 20-objective backfill fixture

<objective>
A hand-built fixture builder for a realistic pre-store project, so the backfill (GMD-01), its estimate (GMD-02) and SC1/SC2 are tested
against the same shape. Fixture-first per the resolved `fixture_strategy: generators`. Test-only code.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: fixture shape tests first (`test(51-02): ...`), then the builder (`feat(51-02): ...`).
- Hand-built content only (constraint `no_llm_test_data`): fixed strings and simple loops; no random data, no property-based tests,
  no Gherkin. Keep each TRD body ~1 KB: op count matters, not size.
- Never touch the real `~/.claude`: `hermeticEnv()` sets HOME, `DEVFLOW_OUTBOX_DIR`, `DEVFLOW_GH_CACHE_DIR` and git isolation.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.

## Decisions

- **Layout** (mirror `makeStoreProject`, gh-store-fixtures.cjs L304, and `upgrade-fixtures.cjs` `objectiveMd`/`planMd` helpers):
  `.planning/config.json` `{github:{enabled:true, repo:'o/r'}, devflow:{version:'2.12.0', migrations_applied:[...0001-0009]}}`;
  ROADMAP.md with a milestone list, `### Objective N: Title` headers (resolver regex gh-mapping.cjs L124) and a `## Progress` table
  whose rows read `Complete` for 1-15, `In progress` for 16-18, `Cancelled` for 19, `Registered` for 20; dirs `NN-objective-NN/`.
- **TRDs**: `NN-MM-step-MM-TRD.md`, frontmatter `objective, trd, wave, depends_on`; waves 1,1,2,2,3 so `waveEdges` produce blocked-by
  edges. SUMMARY `NN-MM-SUMMARY.md` for every TRD of 1-15 except `03-05` (deferred), for TRDs 01-02 of 16-18; VERIFICATION
  `NN-VERIFICATION.md` (`status: passed`) for odd shipped objectives.
- **Milestones**: MILESTONES.md sections `## v0.1` (objectives 1-8) and `## v0.2` (9-15); ROADMAP milestone list marks both shipped.
- **Git**: `initGitFixture(root, home)` (upgrade-fixtures.cjs L306) commits everything, so 0010's `git rm --cached` has work to do.
- **`useBackfillEnv(t, opts)`** helper (copy the `useProject` pattern from `planning-import.test.cjs` L35-65): builds the project, a
  `createFakeGitHub({hasWiki:true, ...opts.fake})`, `createWikiRemote()` with a seeded first page + `applyGitTestEnv`, a fake clock
  (`client._resetClient(); client._setNow(() => clock.t); client._setSleep((ms) => { clock.t += ms; })`), `gh._setRunGh(fake.runGh)`,
  and restores everything in `t.after`. Returns `{root, home, fake, clock, wiki, env}`.
- **`BACKFILL_SHAPE`**: frozen expected counts `{objectives:20, trds:100, summaries, verifications, shipped:15, cancelled:1,
  todos:3, debug:1, quick:1, decisionsWithTrd:1, decisionsWithoutTrd:1, milestones:2}` derived by the builder's own loops (not by
  re-reading the tree), so tests compare tree vs intent.

## Test list

1. Default build: 20 objective dirs, 100 TRD files, SUMMARY/VERIFICATION counts equal `BACKFILL_SHAPE`.
2. Objective statuses: 1-15 `complete`, 16-18 `in_progress`, 19 `cancelled`, 20 `planned`; `03-05` has no SUMMARY.
3. `planning mode` on the tree is `local`; `config.json` has `github.enabled: true`, no `store` key.
4. `git ls-files .planning | wc -l` equals the number of files written (all tracked, clean tree).
5. `{legacyTrd:true}` adds exactly one `NN-MM-PLAN.md`/`*-JOB.md`-style legacy name (use the pattern `LEGACY_TRD_RE` in
   planning-import.cjs matches); `{oversizeTrd:true}` adds one TRD over 60,000 chars (reuse `oversizedTrdText`).
6. Determinism: two builds → identical `snapshot()` maps (upgrade-fixtures.cjs L407), modulo the root path.
7. `useBackfillEnv` restores `_setRunGh(null)` and the client clock after the test (a second test sees no fake).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: builder and shape (tests 1-6)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/gh-backfill-fixtures.cjs, plugins/devflow/devflow/bin/lib/gh-backfill-fixtures.test.cjs</files>
  <action>
RED: tests 1-6; commit `test(51-02): 20-objective backfill fixture shape`.
GREEN: `makeBackfillProject({objectives=20, trdsPerObjective=5, git=true, legacyTrd=false, oversizeTrd=false, home} = {})` returning
`{root, home, shape}`. Reuse helpers from `upgrade-fixtures.cjs` and `gh-store-fixtures.cjs` (require them; do not copy). Commit
`feat(51-02): makeBackfillProject fixture builder`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-backfill-fixtures.test.cjs</verify>
  <done>Tests 1-6 pass in under 10 s.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: useBackfillEnv harness (test 7)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/gh-backfill-fixtures.cjs, plugins/devflow/devflow/bin/lib/gh-backfill-fixtures.test.cjs</files>
  <action>
RED: test 7 plus a smoke case (`fake.calls().length === 0` right after setup); commit `test(51-02): backfill test harness`.
GREEN: `useBackfillEnv(t, opts)` per Decisions; skip cleanly (`t.skip`) when `gitAvailable()` is false, like the wiki tests do.
Commit `feat(51-02): useBackfillEnv harness with fake clock and wiki remote`.
# GOTCHA: set env vars through the hermeticEnv helper and restore them; parallel test files share process.env only within a file.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-backfill-fixtures.test.cjs plugins/devflow/devflow/bin/lib/planning-import.test.cjs</verify>
  <done>Test 7 passes; planning-import tests unchanged.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `__fixtures__/gh-store-fixtures.cjs`: `makeStoreProject` L304, `oversizedTrdText` L346, `hermeticEnv` L399.
- `__fixtures__/upgrade-fixtures.cjs`: `objectiveMd` L137, `planMd` L147, `makeFakeHome` L183, `initGitFixture` L306, `snapshot` L407.
- `__fixtures__/wiki-remote.cjs`: `createWikiRemote`, `gitAvailable`, `applyGitTestEnv`.
- `planning-import.test.cjs` L35-65 `useProject` (fake clock + seam + restore).
</codebase_examples>
<anti_patterns>
- Random or generated content; reading the real home; leaving `_setRunGh` set after a test.
</anti_patterns>
<error_recovery>
- If `initGitFixture` is slow for ~250 files, commit with one `git add -A` (it already does); do not commit per file.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-backfill-fixtures.test.cjs</test>
</validation_gates>

<verification>
- The fixture is the shared ground truth for SC1/SC2; its counts are pinned by test 1.
</verification>

<success_criteria>
One call yields a deterministic 20-objective project and a hermetic fake-GitHub harness with a fake clock.
</success_criteria>

<output>
After completion, create `.planning/objectives/51-github-migration-and-docs/51-02-SUMMARY.md` (via `summary post 51-02 --from <file>`)
</output>
