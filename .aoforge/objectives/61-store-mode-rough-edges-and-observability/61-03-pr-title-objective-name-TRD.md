---
objective: 61-store-mode-rough-edges-and-observability
trd: "03"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/objective-name.cjs
  - plugins/devflow/devflow/bin/lib/objective-name.test.cjs
  - plugins/devflow/devflow/bin/lib/gh.cjs
  - plugins/devflow/devflow/bin/lib/gh-pr.cjs
  - plugins/devflow/devflow/bin/lib/gh-pr-title.test.cjs
autonomous: true
requirements: [STOR-02]
must_haves:
  truths:
    - "On a fresh store (no ROADMAP entry for the objective), `gh pr start` opens the objective PR titled `Objective <N>: <name from OBJECTIVE.md's heading>`, not the directory slug"
    - "The PR title's name and the objective issue's name come from one function, so they cannot drift: ROADMAP name, then the OBJECTIVE.md heading, then the slug without its number prefix"
    - "A ROADMAP name still wins over the OBJECTIVE.md heading, and the existing gh-pr title test ('Objective 7: Store demo') is unchanged"
    - "Titles stay create-only: `gh pr sync` never sends a title, so a PR opened before this change keeps its slug title"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/objective-name.cjs
      provides: "objectiveHeadingName(objDir), bareSlug(dirName), objectiveDisplayName({roadmapName, objDir, dirName, number})"
  key_links:
    - "gh.cjs readObjectiveState name -> objective-name.objectiveDisplayName (issue title)"
    - "gh-pr.cjs objectiveName -> objective-name.objectiveDisplayName (PR title)"
---

# TRD 61-03: Objective PR titles use the objective name (STOR-02)

<objective>
55-04 fixed the objective **issue** title on a fresh store. `readObjectiveState` names an objective by
`ROADMAP name || OBJECTIVE.md heading || slug without its number`. The **PR** title did not get the fix.
`gh-pr.cjs` `objectiveName` (line 115) still falls back from ROADMAP to `info.objective_name`, which is the directory
slug. The live re-run produced `Objective 2: goodbye-cli` beside the issue `[Objective 2] Goodbye CLI`.

Move the name chain into one small module, `lib/objective-name.cjs`, and have both titles call it:

```
objectiveDisplayName({ roadmapName, objDir, dirName, number })
  = roadmapName                          # getRoadmapObjectiveInternal(...).objective_name / findRoadmapObjective name
 || objectiveHeadingName(objDir)         # moved verbatim from gh.cjs:1105
 || bareSlug(dirName)                    # '02-goodbye-cli' -> 'goodbye-cli'
 || `objective ${number}`
```

The PR title is set on create only (gh-pr.cjs line ~369: "the title is create-only, the remote one is kept"). This TRD
does not rename existing PRs, as 55-04 did not rename existing issues.

Purpose: STOR-02 and the second half of success criterion 1. Output: the shared module, the two call sites, tests.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── objective-name.cjs           ← CREATE
├── objective-name.test.cjs      ← CREATE
├── gh.cjs                       ← MODIFY (objectiveHeadingName moves out; readObjectiveState calls the module)
├── gh-pr.cjs                    ← MODIFY (objectiveName uses the module)
└── gh-pr-title.test.cjs         ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit (`test(61-03): ...`) before GREEN (`feat(61-03): ...` or `refactor(61-03): ...`).
- Hand-built fixtures only. Projects come from `gh-store-fixtures.makeStoreProject`, GitHub is the in-memory
  `gh-fake`, and git is `git-remote.makeGitRemote`, all as `gh-pr.test.cjs` builds them. OBJECTIVE.md and ROADMAP text
  are literals in the test. No generated data, no property-based libraries, no `.feature` files.
- Hermetic: nothing touches the real `~/.claude`, a real remote or GitHub. Never use port 8080.
- Task 1 is a pure move. `gh-store-naming.test.cjs` and `gh-sync.test.cjs` must pass unchanged before and after it.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash
  call.

## Test list

`objective-name.test.cjs` (pure; temp dirs for OBJECTIVE.md):

1. `objectiveHeadingName(dir)`:
   - `---\nwork: feature\n---\n\n# Objective 7: Store demo\n` → `'Store demo'`;
   - `# Objective 7 — Store demo` and `# Objective 7 - Store demo` → `'Store demo'`;
   - `# Store demo` → `'Store demo'`;
   - `# Objective 7` alone → `null`;
   - no OBJECTIVE.md → `null`;
   - a `# ` line inside the frontmatter is ignored.
2. `bareSlug('07-store-demo')` → `'store-demo'`; `'07.1-hotfix'` → `'hotfix'`; `'store-demo'` → `'store-demo'`;
   `''` and `null` → `null`.
3. `objectiveDisplayName`: the ROADMAP name wins; the heading wins over the slug; the slug wins over
   `objective <number>`; all empty → `objective 7`.

`gh-pr-title.test.cjs`. Reuse `gh-pr.test.cjs`'s `setup()` shape: copy the minimal parts (store project, fake GitHub,
git remote) into this file rather than requiring the other test file.

4. Fresh-store case (RED today): remove the `### Objective 7: Store demo` heading from the project's
   `.planning/ROADMAP.md` and overwrite `.planning/objectives/07-store-demo/OBJECTIVE.md` with
   `# Objective 7: Goodbye CLI`. Then `prLib.startObjectivePr(root, '7')`, the call `gh-pr.test.cjs` makes, opens one
   PR whose title is `Objective 7: Goodbye CLI`. Today it is `Objective 7: store-demo`. The fixture already writes
   `# Objective 7 — Store demo`; the distinct name proves the heading, not the fixture's ROADMAP, supplied it.
5. ROADMAP name wins: ROADMAP heading `### Objective 7: Store demo` (the fixture's) and OBJECTIVE.md
   `# Objective 7: Heading name` → `Objective 7: Store demo`.
6. No ROADMAP entry and an OBJECTIVE.md with no `# ` heading → `Objective 7: store-demo` (never `07-store-demo`).
7. Parity: for the fixture in test 4, `require('./gh.cjs').readObjectiveState('07-store-demo', root).name` equals the
   name in the PR title, so the issue and the PR read alike.
8. `prLib.syncObjectivePr(root, '7')` after test 4's start sends no title (the queued upsert payload has no `title`
   key), so a remote title is never overwritten.

<embedded_context>

<codebase_examples>
gh-pr.cjs today (lines 114-119 and 330):

```js
/** The objective's display name for the PR title: ROADMAP's heading, else the directory slug. */
function objectiveName(root, id, info) {
  const fromRoadmap = getRoadmapObjectiveInternal(root, id);
  if (fromRoadmap && fromRoadmap.objective_name) return fromRoadmap.objective_name;
  return (info && info.objective_name) || `objective ${id}`;
}
...
  const payload = { branch, base, title: `Objective ${id}: ${objectiveName(root, id, info)}`, ...(wiki ? { wiki } : {}) };
```

`info` is `findObjectiveInternal(root, id)`: `info.directory` is relative (`.planning/objectives/07-store-demo`), and
`info.objective_name` is the slug.

gh.cjs (lines 1105-1116 and 1203):

```js
function objectiveHeadingName(objDir) {
  let text;
  try { text = fs.readFileSync(path.join(objDir, 'OBJECTIVE.md'), 'utf-8'); } catch { return null; }
  const m = /^#\s+(.+?)\s*$/m.exec(text.replace(/^---\n[\s\S]*?\n---\n/, ''));
  if (!m) return null;
  const name = m[1].replace(/^Objective\s+[\d.]+\s*(?:[—–:-]\s*)?/i, '').trim();
  return name || null;
}
...
    name: (found && found.name) || objectiveHeadingName(objDir) || String(objectiveId).replace(/^[\d.]+-/, ''),
```

`objectiveHeadingName` is not exported from gh.cjs (`rg -n objectiveHeadingName plugins` shows only gh.cjs), so moving
it breaks no importer.

gh-pr.test.cjs: `setup({ mapObjective, trds, wiki })` builds the store project, fake and remote; `prRecords()` reads
the fake's PRs; the existing title assertion is at line 173 (`'Objective 7: Store demo'`, from the fixture's ROADMAP).
</codebase_examples>

<anti_patterns>
- Do not keep two copies of the chain. gh.cjs and gh-pr.cjs both call `objectiveDisplayName`.
- Do not send a title from `gh pr sync`, and do not rename existing PRs. Titles are create-only on purpose (a human may
  have edited the remote title).
- Do not require gh.cjs from objective-name.cjs or from gh-pr.cjs at the top level. gh.cjs is large and already
  lazily required by gh-pr. objective-name.cjs needs only `fs` and `path`.
</anti_patterns>

<error_recovery>
- If test 4 cannot remove the ROADMAP heading without breaking `findObjectiveInternal` (it should find the objective by
  directory), keep the heading line but empty its name (`### Objective 7:`). `getRoadmapObjectiveInternal` then returns
  no name. Record the choice.
- If `startObjectivePr` needs options the fixture does not give (a wiki clone, mapped TRDs), copy the matching
  `setup({ mapObjective, trds, wiki })` arguments from the `gh-pr.test.cjs` test at line 151.
</error_recovery>

</embedded_context>

<gotchas>
- `objectiveDisplayName` takes plain values, never the root, so it stays pure apart from the OBJECTIVE.md read inside
  `objectiveHeadingName`.
- In gh-pr.cjs, compute `objDir = info && info.directory ? path.join(root, info.directory) : null` and
  `dirName = info && info.directory ? path.basename(info.directory) : null`.
- In gh.cjs, `readObjectiveState` passes `roadmapName: found && found.name`, `objDir`, `dirName: objectiveId` and
  `number`. The resulting name must be byte-identical to today's for every input (the gh-store-naming suite pins it).
- Update the doc comment on gh-pr's `objectiveName` to name the full chain and STOR-02.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: objective-name.cjs, and gh.cjs's issue name moves onto it (tests 1-3)</name>
  <files>plugins/devflow/devflow/bin/lib/objective-name.cjs, plugins/devflow/devflow/bin/lib/objective-name.test.cjs, plugins/devflow/devflow/bin/lib/gh.cjs</files>
  <action>
RED: write tests 1-3 and run them (no module). Commit `test(61-03): one objective display-name chain`.

GREEN: create `objective-name.cjs` with `objectiveHeadingName` (moved verbatim), `bareSlug` and
`objectiveDisplayName`. Delete the function from gh.cjs and call the module from `readObjectiveState`. Commit
`refactor(61-03): issue titles take their name from objective-name.cjs`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/objective-name.test.cjs plugins/devflow/devflow/bin/lib/gh-store-naming.test.cjs plugins/devflow/devflow/bin/lib/gh-sync.test.cjs plugins/devflow/devflow/bin/lib/gh-body.test.cjs` passes.</verify>
  <done>One name chain lives in objective-name.cjs. Issue titles are unchanged (the store-naming suite is green and untouched).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: gh-pr's PR title uses the objective name (tests 4-8)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-pr.cjs, plugins/devflow/devflow/bin/lib/gh-pr-title.test.cjs</files>
  <action>
RED: write tests 4-8. Tests 4 and 7 fail today (slug title). Tests 5, 6 and 8 may already pass; keep them as guards.
Commit `test(61-03): objective PR titles use the objective name on a fresh store`.

GREEN: make `objectiveName(root, id, info)` call `objectiveDisplayName`. Commit
`fix(61-03): objective PR titles use the objective name, not the directory slug`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/gh-pr-title.test.cjs plugins/devflow/devflow/bin/lib/gh-pr.test.cjs plugins/devflow/devflow/bin/lib/gh-pr-cli.test.cjs plugins/devflow/devflow/bin/lib/gh-pr-e2e.test.cjs plugins/devflow/devflow/bin/lib/gh-pr-reconcile.test.cjs` passes.</verify>
  <done>A fresh-store objective PR is titled after the objective, the same name as its issue. Every existing gh-pr suite is green.</done>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/devflow/bin/lib/objective-name.test.cjs plugins/devflow/devflow/bin/lib/gh-pr-title.test.cjs plugins/devflow/devflow/bin/lib/gh-pr.test.cjs plugins/devflow/devflow/bin/lib/gh-store-naming.test.cjs`.
</validation_gates>

<verification>
- `rg -n "function objectiveHeadingName" plugins/devflow/devflow/bin/lib` matches objective-name.cjs only.
- Every gh-pr and gh-store-naming suite passes.
</verification>

<success_criteria>
- [ ] A fresh-store objective PR title uses the OBJECTIVE.md heading name
- [ ] Issue and PR titles come from one chain
- [ ] Titles stay create-only
</success_criteria>

<output>
After completion, create `.planning/objectives/61-store-mode-rough-edges-and-observability/61-03-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`.
</output>
