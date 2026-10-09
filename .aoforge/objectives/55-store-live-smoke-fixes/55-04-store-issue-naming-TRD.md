---
objective: 55-store-live-smoke-fixes
trd: "04"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh.cjs
  - plugins/devflow/devflow/bin/lib/gh-body.cjs
  - plugins/devflow/devflow/bin/lib/gh-body.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-sync.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-store-naming.test.cjs
autonomous: true
requirements: ["55-6"]
must_haves:
  truths:
    - "In store mode, `objective add \"Hello CLI\"` on a project whose ROADMAP has no entry for the new objective creates the objective issue titled `[Objective 1] Hello CLI`, not `[Objective 1] 01-hello-cli`"
    - "When ROADMAP.md names the objective, that name is still the title (unchanged); with neither a ROADMAP name nor an OBJECTIVE.md heading the title is the directory slug without its number prefix"
    - "In store mode the managed objective-issue footer says the issue is the source of truth and `.planning/` is a local cache; it never says `.planning/objectives/... in this repo`"
    - "With the store off (mirror mode) the footer is byte-identical to today's, so every existing mirror test passes unchanged"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh.cjs
      provides: "readObjectiveState name fallback (ROADMAP -> OBJECTIVE.md heading -> slug); store flag passed to the body builders"
    - path: plugins/devflow/devflow/bin/lib/gh-body.cjs
      provides: "buildObjectiveSections store-mode footer"
    - path: plugins/devflow/devflow/bin/lib/gh-store-naming.test.cjs
      provides: "store-mode title and footer regression tests"
  key_links:
    - "objective add (store) -> planning-verbs.objectivePut -> gh.syncObjective -> readObjectiveState.name -> gh-issue.findOrCreateObjectiveIssue title"
    - "gh.syncObjective -> buildObjectiveSections(state with store flag) -> footer"
---

# TRD 55-04: Store-mode objective issue titles and footer (item 55-6, first two minors)

<objective>
Two wording defects the live smoke showed on the objective issue.

**Title.** The issue was created as `[Objective 1] 01-hello-cli`. Cause, traced while planning: store `objective add` ->
`planning-verbs.objectivePut` -> `gh.syncObjective` -> `readObjectiveState(resolved.dir, ...)` (gh.cjs:1095). Its name is
`found ? found.name : objectiveId` (gh.cjs:1173), and `objectiveId` is the directory name. On a fresh store, ROADMAP.md has no
entry yet (in store mode it is generated from the issues), so the directory name became the title. The generated ROADMAP then
echoed it back (`### Objective 1: 01-hello-cli`). `findOrCreateObjectiveIssue` uses `opts.name` first (gh-issue.cjs:468), so its
own `slugFromDir` fallback never ran. Fix the name at its source, in this order: the ROADMAP name, then the OBJECTIVE.md title
heading (the smoke's read `# Objective 1 — Hello CLI`), then the slug without its number prefix.

**Footer.** `buildObjectiveSections` (gh-body.cjs:260-262) and `buildIssueBody` (gh.cjs:958-959) end the body with
"Source of truth: `.planning/objectives/<dir>/` in this repo". In store mode that is wrong: the issue is the record and
`.planning/` is a gitignored cache. Give the builders a store flag and a store-mode footer. Mirror mode keeps today's bytes.

Out of scope here: renaming issues that already exist (the title is set on create only), and the fresh-store `state.json`/stamp
minor. That one needs no code: `df-tools upgrade --apply` seeds `state.json` (0003) and stamps the project, and the SessionStart
`upgrade-project.js` hook runs it whenever a session opens in the project. The smoke drove everything with `--cwd` from another
session, so the hook never ran. TRD 55-06 confirms it live, and TRD 55-08 documents it and records the deferral of an automatic
store bootstrap in new-project.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: `test(55-04): ...` (failing) before `fix(55-04): ...`, per task.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- New store-mode tests go in a NEW file `gh-store-naming.test.cjs`. Build it on `__fixtures__/gh-store-fixtures.cjs`
  (`makeStoreProject`, `hermeticEnv`) and `createFakeGitHub`, the way planning-verbs-pr.test.cjs does. Do not edit
  `__fixtures__/gh-fake.cjs` or `gh-store-e2e.test.cjs`: other wave-1 TRDs own them.
- Hand-built fixtures; drive creation through the real store `objective add` code path (`objective.cjs` store branch), not a
  hand-written issue.

## Test list

Outermost first.

Title (gh-store-naming.test.cjs):
1. Store project with an empty ROADMAP (no objective entries). The store `objective add "Hello CLI"` path creates an objective
   issue whose title is `[Objective N] Hello CLI` (N is the number the add assigned). RED today: `[Objective N] NN-hello-cli`.
2. The same project with a ROADMAP entry `### Objective N: Greeting tool`: the title is `[Objective N] Greeting tool`. The ROADMAP
   wins, as today.
3. A directory with an OBJECTIVE.md that has no `# ` heading, and no ROADMAP entry: the title is `[Objective N] hello-cli` (the
   slug without `NN-`), never `NN-hello-cli`.

Footer:
4. (gh-store-naming.test.cjs) Store mode: the created objective issue body ends with the store footer. It contains
   `source of truth` and `cache`, and does not contain `in this repo`.
5. (gh-body.test.cjs) `buildObjectiveSections({...state, store: true}).footer` is the store text.
   `buildObjectiveSections(state)` without the flag is byte-identical to today (existing assertions).
6. (gh-sync.test.cjs) Mirror-mode sync bodies: the existing `Source of truth` assertions pass unchanged.

<embedded_context>

<codebase_examples>
Name today (gh.cjs:1149-1174):

```js
  const all = listObjectives(projectRoot);
  const found = all.find(o => mappingLib.toObjectiveId(o.number) === number);
  ...
  return {
    objectiveId,
    number,
    name: found ? found.name : objectiveId,      // <- objectiveId is the dir name, e.g. 01-hello-cli
```

Fallback helper (gh.cjs, next to readObjectiveState; `objDir` is already computed above in that function):

```js
/** OBJECTIVE.md's title heading without its `Objective N —|:|-` prefix, or null. */
function objectiveHeadingName(objDir) {
  let text;
  try { text = fs.readFileSync(path.join(objDir, 'OBJECTIVE.md'), 'utf-8'); } catch { return null; }
  const m = /^#\s+(.+?)\s*$/m.exec(text.replace(/^---\n[\s\S]*?\n---\n/, ''));
  if (!m) return null;
  const name = m[1].replace(/^Objective\s+[\d.]+\s*(?:[—–:-]\s*)?/i, '').trim();
  return name || null;
}
// name: (found && found.name) || objectiveHeadingName(objDir) || String(objectiveId).replace(/^[\d.]+-/, '')
```

Check what `newObjectiveText` (objective.cjs) writes as the heading for a store `objective add`, and make test 1 match the real
output. If it writes no heading, the description is the name: carry it through. Either way, test 1 asserts `Hello CLI`.

Footer today (gh-body.cjs:260-262):

```js
  const objDir = s.dir || s.objectiveId || '';
  const footer =
    '_Tracked by [DevFlow](https://github.com/AO-Cyber-Systems/devflow-claude). ' +
    `Source of truth: \`.planning/objectives/${objDir}/\` in this repo._`;
```

Store variant, suggested text: `_Tracked by [DevFlow](https://github.com/AO-Cyber-Systems/devflow-claude). This issue is the source
of truth (store mode); \`.planning/\` in a checkout is a local cache rebuilt from it._`. Apply the same flag to
`buildIssueBody` (gh.cjs:958-959). Set `state.store` in gh.cjs where the state is built for sync
(`planningMode.isStoreMode(projectRoot)`, or whatever store check gh.cjs already uses near :1498).
</codebase_examples>

<anti_patterns>
- Do not change `slugFromDir` or the title format `[Objective N] <name>`: gh-cache.cjs:113 and :647 parse that shape back.
- Do not make the footer depend on anything but the store flag: the managed-section hash would churn.
- Do not touch mirror-mode bytes. The D-01 invariant (store off writes today's bytes) applies to issue bodies too.
</anti_patterns>

<error_recovery>
- Changing the store footer changes the managed-section hash, so the next sync of an existing store objective sends one body patch
  per objective. That is expected. If a store test asserts "zero writes on a second sync", it must still hold: the second sync
  already carries the new footer.
- If gh-cache.cjs parses the footer (grep `Tracked by`), keep the parse tolerant of both texts and add a case to its test.
</error_recovery>

</embedded_context>

<context>
- Smoke artefacts: OBJECTIVE.md heading `# Objective 1 — Hello CLI`; generated ROADMAP `### Objective 1: 01-hello-cli  (#3, closed)`.
- The ROADMAP in store mode is generated (`<!-- generated by devflow; do not edit -->`) from issue titles, so a right title fixes
  the ROADMAP too.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Objective issue title falls back to the OBJECTIVE.md heading, then the bare slug</name>
  <files>plugins/devflow/devflow/bin/lib/gh.cjs, plugins/devflow/devflow/bin/lib/gh-store-naming.test.cjs</files>
  <action>
RED: tests 1-3 in the new gh-store-naming.test.cjs (header comment with the test list, hermetic env as in
planning-verbs-pr.test.cjs). Commit `test(55-04): store objective issue title uses the objective name`.
GREEN: add `objectiveHeadingName` and the fallback chain in `readObjectiveState`. Commit
`fix(55-04): name a new objective issue from OBJECTIVE.md, not its directory`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-store-naming.test.cjs plugins/devflow/devflow/bin/lib/gh-sync.test.cjs plugins/devflow/devflow/bin/lib/gh-issue.test.cjs</verify>
  <done>Tests 1-3 pass; test 1 failed before with the `NN-hello-cli` title; gh-sync and gh-issue suites pass.</done>
  <recovery>If the store `objective add` path cannot run in the fixture (it needs a ROADMAP file), seed an empty generated ROADMAP (`<!-- generated by devflow; do not edit -->\n# Roadmap\n`) as the smoke had, and note it.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Store-mode footer on objective issue bodies</name>
  <files>plugins/devflow/devflow/bin/lib/gh-body.cjs, plugins/devflow/devflow/bin/lib/gh-body.test.cjs, plugins/devflow/devflow/bin/lib/gh.cjs, plugins/devflow/devflow/bin/lib/gh-store-naming.test.cjs, plugins/devflow/devflow/bin/lib/gh-sync.test.cjs</files>
  <action>
RED: tests 4-5 (test 6 is the unchanged mirror suite). Commit `test(55-04): store footer names the issue as the source of truth`.
GREEN: the store flag in `buildObjectiveSections` and `buildIssueBody`, set from gh.cjs. Commit
`fix(55-04): store-mode issue footer`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-body.test.cjs plugins/devflow/devflow/bin/lib/gh-sync.test.cjs plugins/devflow/devflow/bin/lib/gh-store-naming.test.cjs plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs plugins/devflow/devflow/bin/lib/gh-cache.test.cjs</verify>
  <done>Tests 4-6 pass; `rg -n "in this repo" plugins/devflow/devflow/bin/lib/gh-body.cjs plugins/devflow/devflow/bin/lib/gh.cjs` shows only the mirror-mode branch.</done>
  <recovery>If gh.cjs has no single place to set the flag, pass it as a second argument to the builders. Keep the default (no flag) as mirror mode.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/gh-store-naming.test.cjs plugins/devflow/devflow/bin/lib/gh-body.test.cjs plugins/devflow/devflow/bin/lib/gh-sync.test.cjs</test_scoped>
</validation_gates>

<verification>
- Scoped suites pass; `npm test` has no new failures (MA-7 only).
</verification>

<success_criteria>
- A new store objective issue is named after the objective. The store footer tells the truth. Mirror mode is untouched.
</success_criteria>

<output>
After completion, publish `55-04-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as execute-trd
describes. Quote the new footer text.
</output>
