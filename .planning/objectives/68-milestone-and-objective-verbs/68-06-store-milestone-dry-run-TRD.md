---
objective: 68-milestone-and-objective-verbs
trd: "06"
type: standard
wave: 2
depends_on: ["68-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/planning-entity-verbs.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
  - plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs
autonomous: true
requirements: [TOOL-01, TOOL-02]
must_haves:
  truths:
    - "In store mode `milestone complete <v> --dry-run` exits 0 and reports the GitHub milestone it would close and the `milestones/<v>-*.md` archives it would publish, with zero gh calls (reads included), no outbox journal entry, no ledger entry and no cache file written"
    - "The store-mode dry run succeeds offline (where the real run exits 1), which shows it never reaches GitHub"
    - "`milestone put` finds a version's MILESTONES.md entry with the same rule `milestone complete` uses (text-escape.milestoneHeadingPattern): `milestone put v1.0` replaces a legacy `## 1.0 ...` entry instead of adding a second, and leaves `## v1.0.1 ...` alone"
    - "Existing planning-entity-verbs.test.cjs and planning-verbs-cli.test.cjs cases (48-12 milestones, 48-15 test 7) pass unchanged"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/planning-entity-verbs.cjs
      provides: "milestoneComplete({dryRun}) store preview; spliceMilestoneEntry/entryWithHeading on milestoneHeadingPattern"
      contains: "milestoneHeadingPattern"
    - path: plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
      provides: "store branch of cmdMilestoneVerb passes --dry-run"
      contains: "dryRun"
  key_links:
    - from: "planning-verbs-cli.cjs cmdMilestoneVerb (store branch)"
      to: "planning-entity-verbs.cjs milestoneComplete"
      via: "{ version, dryRun: has(rest, '--dry-run'), ...flushOpts(rest) }"
      pattern: "dryRun"
    - from: "planning-entity-verbs.cjs spliceMilestoneEntry / entryWithHeading"
      to: "text-escape.cjs milestoneHeadingPattern (68-01)"
      via: "require('./text-escape.cjs')"
      pattern: "milestoneHeadingPattern"
---

# TRD 68-06: Store-mode `milestone complete --dry-run`, and one MILESTONES.md heading rule (TOOL-01, TOOL-02)

<objective>
68-01 gave local `milestone complete` a dry run and made it find an existing entry with
`text-escape.milestoneHeadingPattern`. Two gaps remain in the planning-entity-verbs path:

- Store mode routes `milestone complete` to `entity.milestoneComplete`, which closes the native GitHub milestone and
  publishes the archives. With 68-03's guard, `--dry-run` is an accepted flag there too, so it must preview and not act:
  an accepted flag that is ignored is the defect TOOL-01 removes.
- `milestone put` finds the version's MILESTONES.md section with its own regex (`^## +<version>(?:\s|$)`, no `v`
  tolerance). 68-01's rule treats `## 1.0` and `## v1.0` as one version; `milestone put` must agree, or a put after a
  legacy entry adds the second entry TOOL-02 forbids.

Purpose: success criterion 1 in store mode, and one heading rule for both MILESTONES.md writers (criterion 2).
Output: entity and CLI changes, tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/68-milestone-and-objective-verbs/68-01-SUMMARY.md

Read with offset/limit: `plugins/devflow/devflow/bin/lib/planning-entity-verbs.cjs` (`spliceMilestoneEntry`,
`entryWithHeading`, `milestonePut`, `milestoneComplete`, around 510-635) and
`plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs` (`report`, `headline` around 144-180, `cmdMilestoneVerb`
around 391-415). Tests: `planning-entity-verbs.test.cjs` `useProject` (around 119), describe
`48-12 store mode: milestones` (around 495); `planning-verbs-cli.test.cjs` header and test 7 (around 362).

## Binding rules
- Strict TDD on both tasks; one test at a time.
- Fixtures: reuse the existing hermetic store harnesses (`useProject({ store: true })` with the fake GitHub in
  planning-entity-verbs.test.cjs; `storeCliProject` with the offline gh shim in planning-verbs-cli.test.cjs) and
  68-01's hand-built constants (`MILESTONES_LEGACY_UNPREFIXED`, `MILESTONES_PATCH_ONLY` from
  `__fixtures__/milestone-complete-fixtures.cjs`, imported read-only). They already build every project these tests
  need, so this TRD adds no fixture module. Never real GitHub, never `~/.claude`, never port 8080.
- 68-01's local branch of `cmdMilestoneVerb` stays as it is; this TRD changes the store branch only.
- Parallel wave (68-04, 68-05 beside it): no shared files. Address your checkout explicitly if a worktree was
  provisioned; one plain command per Bash call; commit with
  `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.

## Store dry-run result
`milestoneComplete(root, { version, dryRun: true })` returns, after the version check and before any gh call:
`{ ok: true, mode: 'store', dry_run: true, version, milestone_title: milestoneStore.milestoneTitleFor(main, version),
would_close: true, would_publish: [the same `milestones/<v>-*.md` list the real run publishes], warnings: [], exit: 0 }`.
Local mode (`ctx.mode === LOCAL`) is unchanged (it returns the delegate marker; the dispatcher's local branch never
calls it). Prose output: `report()` with a `prose` field whose first line is `DRY RUN — nothing has been modified.`
followed by `Would close milestone <title>` and `Would publish: <list | (none)>`.
</context>

## Test list

`planning-verbs-cli.test.cjs` (task 1, outermost: spawned df-tools on `storeCliProject`, offline gh shim):
1. `milestone complete v1.0 --dry-run --raw` with `milestones/v1.0-ROADMAP.md` in the cache: exit 0; JSON
   `dry_run: true`, `would_close: true`, `would_publish: ['milestones/v1.0-ROADMAP.md']`; the shim log has no call;
   the project snapshot is unchanged.
2. The same without `--dry-run` exits 1 offline (control: the real run reaches gh).
3. Prose form (no `--raw`): stdout contains `DRY RUN — nothing has been modified.` and `Would close milestone v1.0`.

`planning-entity-verbs.test.cjs` (task 1, in-process with the fake GitHub):
4. After `milestonePut(v1.4)` and a seeded `milestones/v1.4-ROADMAP.md`: `milestoneComplete({version: 'v1.4', dryRun: true})`
   → `ok`, `dry_run`, `milestone_title` = `milestoneTitleFor(root, 'v1.4')`; `S.fake.calls().length` unchanged, the
   native milestone still `open`, journal and ledger unchanged, cache index unchanged.
5. A non-version (`dryRun: true`, version `nope`) still fails with the existing `not a milestone version` error.

`planning-entity-verbs.test.cjs` (task 2, local mode, `useProject({ store: false })`):
6. MILESTONES.md = `MILESTONES_LEGACY_UNPREFIXED`: `milestonePut({version: 'v1.0', text})` leaves exactly one entry
   for the version (the `## 1.0 Old` section replaced by the put text, headed `## v1.0`).
7. MILESTONES.md = `MILESTONES_PATCH_ONLY`: `milestonePut(v1.0)` inserts a v1.0 entry and leaves `## v1.0.1 Patch`
   byte-identical.
8. `entryWithHeading('## 1.0 Old\n\nx', 'v1.0')` keeps the text as is (its first line already heads the version).
9. Regression: describe `48-12 store mode: milestones`, the local milestone cases and planning-verbs-cli test 7 pass
   unchanged.

<embedded_context>

<codebase_examples>
`milestoneComplete` today (`lib/planning-entity-verbs.cjs`):

```js
function milestoneComplete(root, opts = {}) {
  const o = optsOf(opts);
  const ctx = contextOf(root);
  if (ctx.error) return fail(ctx.error);
  const version = ghMilestone.normaliseVersion(o.version);
  if (!version) return fail(`not a milestone version: ...`);
  if (ctx.mode === LOCAL) return { ok: true, mode: ctx.mode, ..., delegate: 'milestone complete', exit: EXIT.OK };
  const closed = milestoneStore.closeMilestone(ctx.main, version);      // gh: list + patch
  ...
  const archives = listDir(path.join(ctx.main, '.planning', 'milestones'))
    .filter((f) => f.startsWith(`${version}-`) && f.endsWith('.md')).map((f) => `milestones/${f}`);
  const r = docsPut(ctx.main, archives, { message: `devflow: milestone ${version} archives`, ...flushFlags(o) });
```
Compute `archives` with the same expression for the dry run (move it above `closeMilestone` into a small helper so both
paths share it).

The store branch today (`lib/planning-verbs-cli.cjs`):

```js
if (planningMode.isStoreMode(cwd)) {
  return report('milestone complete', entity.milestoneComplete(cwd, { version: args[1], ...flushOpts(rest) }), raw);
}
```

The heading rule to replace (both functions in planning-entity-verbs.cjs):

```js
const head = new RegExp(`^## +${escapeRegExp(version)}(?:\\s|$)`);                    // spliceMilestoneEntry
return new RegExp(`^## +${escapeRegExp(version)}(?:\\s|$)`).test(first) ? text : ...; // entryWithHeading
```
Replace with `new RegExp(milestoneHeadingPattern(version))` (no `m` flag: both test one line at a time).
</codebase_examples>

<anti_patterns>
- Do not call `closeMilestone`, `listRemote` or any gh-client function on the dry-run path, not even a read.
- Do not queue an outbox op or write the cache index in the dry run.
- Do not change `planning-import.cjs`'s own section parser in this TRD (a hand-maintained MILESTONES.md import; out of
  scope).
</anti_patterns>

<error_recovery>
- If `report()` prints `wrote .planning/...` for the dry run, `headline()` is reading `rel`; do not set `rel` on the
  dry-run result.
- If a 48-12 test fails after task 2, check that `milestoneHeadingPattern` receives the normalised version (`v1.4`);
  `milestonePut` normalises before splicing.
</error_recovery>

</embedded_context>

<gotchas>
- `storeCliProject` uses an offline gh shim: any gh call makes the command fail or record a call, which is what tests
  1 and 2 rely on.
- `has(rest, '--dry-run')` in the store branch: `args[1]` is the version, `rest` is everything after the subcommand.
- `milestoneHeadingPattern` matches `## 1.0` for version `v1.0`; `spliceMilestoneEntry` then replaces that section with
  the put text, so the legacy heading becomes `## v1.0 ...` (from `entryWithHeading` or the text). That is the intent.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Store-mode dry run of milestone complete (tests 1-5)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-entity-verbs.cjs, plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs, plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs, plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs</files>
  <action>
RED: tests 1-3 (planning-verbs-cli.test.cjs, a new describe using `storeCliProject` the way its existing store tests
do) and 4-5 (planning-entity-verbs.test.cjs inside a `useProject({ store: true })` describe). Commit
`test(68-06): store-mode milestone complete --dry-run touches nothing`.

GREEN: in `milestoneComplete`, after the version check and the LOCAL return, `if (o.dryRun === true) return
{...the result in the context section, prose: ...}`; share the archive listing with the real path. In
`cmdMilestoneVerb`'s store branch pass `dryRun: has(rest, '--dry-run')`. Commit
`feat(68-06): milestone complete --dry-run in store mode previews without GitHub`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs` passes.</verify>
  <done>Tests 1-5 went RED then GREEN; the dry run makes zero gh calls and writes nothing; existing store tests pass.</done>
  <recovery>If test 1 sees a gh call, find it with the shim log's argv and trace it to the code path; the dry-run return must come before `closeMilestone` and before any `contextOf`-triggered network use (contextOf reads config only; confirm).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: milestone put uses the shared heading rule (tests 6-9)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-entity-verbs.cjs, plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs</files>
  <action>
RED: tests 6-8 in planning-entity-verbs.test.cjs (local-mode describe). Commit
`test(68-06): milestone put treats 1.0 and v1.0 as one entry`.

GREEN: `spliceMilestoneEntry` and `entryWithHeading` build their RegExp from `milestoneHeadingPattern(version)`
(require it from `./text-escape.cjs` beside `escapeRegExp`). Update their doc comments to name the shared rule and
TOOL-02. Commit `fix(68-06): milestone put finds a version's entry with the shared heading rule`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs` passes; full suite at baseline.</verify>
  <done>Tests 6-8 went RED then GREEN; test 9's regressions pass unchanged.</done>
  <recovery>If test 7 fails because the v1.0 entry lands in an unexpected position, compare with the existing insertion rule (after `# Milestones` and its blank lines); only the heading match changed, not the insertion point.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs plugins/devflow/devflow/bin/lib/milestone-complete.test.cjs</test_scoped>
<!-- lint/typecheck/build: none in the stack profile. Store tests need git (wiki remote); they skip without it, as today.
     Take the failing set before the first change; only those known environment failures may remain. -->
</validation_gates>

<verification>
- SC-1 in store mode: tests 1-4 show the dry run reports what it would do and touches nothing, offline included.
- SC-2: tests 6-7 show `milestone put` and `milestone complete` agree on what one version's entry is.
</verification>

<success_criteria>
- Tests 1-9 pass; full suite at baseline.
- `rg -n "escapeRegExp\(version\)" plugins/devflow/devflow/bin/lib/planning-entity-verbs.cjs` finds nothing.
</success_criteria>

<output>
After completion, publish `68-06-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes (stamp tokens first).
</output>
