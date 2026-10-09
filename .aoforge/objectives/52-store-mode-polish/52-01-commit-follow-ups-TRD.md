---
objective: 52-store-mode-polish
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/commit-steps.cjs
  - plugins/devflow/devflow/bin/lib/commit-steps.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs
  - plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/21-pending-migrations.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs
  - plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.cjs
  - plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.test.cjs
autonomous: true
requirements: ["52-1"]
must_haves:
  truths:
    - "In store mode, `df-tools gh setup --apply` prints a commit follow-up that, run line by line as printed, lands the workflow and PR-template commit from the default branch AND from a linked objective branch (today line 92 prints a bare `df-tools commit` that the gate refuses)"
    - "In store mode, doctor check 21's fix note prints the same branch + logged-escape sequence instead of `commit with: ...`; in local mode its note is byte-identical to today"
    - "Migration 0010 and doctor check 20 print their existing five store-mode lines byte for byte, plus one added line that names `df-tools gh pr start <objective>` and the bare commit command to run on a linked branch"
    - "Every store-mode follow-up comes from one builder (`commit-steps.cjs branchCommitSteps`), so the four emitters cannot drift apart"
    - "In mirror or local mode, gh setup prints a runnable branch sequence (`git switch -c`, the commit, push, PR) with no DEVFLOW_SKIP_GH_GATE prefix"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/commit-steps.cjs
      provides: "commitCommand(message, files), branchCommitSteps({branch, command, reason}), DF_TOOLS_CMD"
    - path: plugins/devflow/devflow/bin/lib/commit-steps.test.cjs
      provides: "a store-mode git fixture that executes each printed follow-up as printed"
  key_links:
    - "gh-setup-cli.cjs filesLines -> commit-steps.branchCommitSteps (store: with reason; mirror/local: reason null)"
    - "doctor-checks/21-pending-migrations.cjs fix notes -> commit-steps.branchCommitSteps when planningMode.isStoreMode(root)"
    - "migrations/0010 STORE_COMMIT_STEPS and doctor-checks/20 commitNote -> commit-steps.branchCommitSteps (0011 still prints m0010().STORE_COMMIT_STEPS)"
---

# TRD 52-01: Gate-aware printed commit follow-ups (item 52-1)

<objective>
Make every `df-tools commit` follow-up that df-tools prints runnable as printed in store mode, where objective 50's
commit gate (GEN-01) refuses the default branch and any branch no objective PR names.

Purpose: the v1.4 audit (50-VERIFICATION) found that following DevFlow's own printed instruction fails in store mode. TRD
51-04 already fixed migration 0010 and doctor check 20 (branch + logged escape + push + PR), but `gh-setup-cli.cjs:92` still prints
a bare commit, doctor check 21 (`21-pending-migrations.cjs:144`) prints a bare `commit with:`, and no instruction names
`gh pr start`. This TRD adds one shared builder, routes all four emitters through it, and proves the output runs as printed.

Output: `lib/commit-steps.cjs` + test, with gh setup, doctor 21, migration 0010 and doctor 20 all built from it.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── commit-steps.cjs                       ← CREATE
├── commit-steps.test.cjs                  ← CREATE
├── gh-setup-cli.cjs                       ← MODIFY (filesLines, export it)
├── gh-setup-cli.test.cjs                  ← MODIFY
├── doctor-checks/21-pending-migrations.cjs ← MODIFY
├── doctor-checks/21-22-project.test.cjs   ← MODIFY
├── doctor-checks/20-legacy-runtime-state.cjs ← MODIFY (commitNote uses the builder)
├── doctor-checks/20-legacy-runtime-state.test.cjs ← MODIFY
├── migrations/0010-store-gitignore.cjs    ← MODIFY (STORE_COMMIT_STEPS from the builder)
└── migrations/0010-store-gitignore.test.cjs ← MODIFY
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD per task: a `test(52-01): ...` commit that fails, then `fix(52-01): ...` that makes it pass.
- Commit with the repo copy: `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. Never raw `git commit`.
- Hand-built fixtures only (no generated data). No property-based tests. No `.feature` files.
- Local mode output stays byte-identical wherever it exists today (doctor 21 `commit with: ...`, doctor 20 `commit with: ...`).
- Do not touch `gh-gate.cjs` or `misc.cjs` (TRD 52-02 owns them; it runs in the same wave).

## Test list

Outermost first.
1. As printed, store mode, on `main`: running the printed `git switch -c` line and then the escaped commit line lands the commit
   (`committed: true`, `gate_escaped: true`) on the new branch, and `.planning/.override-log.jsonl` gets a `gate: "gh"` entry whose
   reason is the printed DEVFLOW_SKIP_GH_GATE_REASON.
2. As printed, store mode, on the linked branch: the same full sequence also lands (a new branch plus the escape).
3. As printed, store mode, on the linked branch: the command from the added `gh pr start` line, run alone, lands with no `gate_escaped`
   and no override-log entry.
4. As printed, mirror mode (`github.enabled: true`, `store: false`) on `main`: the plain form (`reason: null`) lands on the new branch and
   contains no `DEVFLOW_SKIP_GH_GATE`.
5. The fixture makes zero `gh` calls (failing gh shim on PATH, call log empty).
6. `branchCommitSteps` store form: lines 1-5 equal today's 0010/doctor-20 shape with branch, reason and command substituted; line 6 names
   `df-tools gh pr start <objective>` and ends with the bare command.
7. `commitCommand('m', ['a', 'b'])` is exactly `node ~/.claude/devflow/bin/df-tools.cjs commit "m" --files a b`.
8. gh setup `--apply` with `github.store: true`: stdout contains `branchCommitSteps({branch: 'devflow-setup', reason: 'gh setup workflow', ...})`
   exactly; with store off it contains the plain form; both still match the existing `df-tools commit .* --files ...devflow.yml ...pull_request_template.md` regex.
9. Doctor 21 fix in store mode: `notes` contains the store form for branch `devflow-upgrade`; in local mode `notes` still contains
   `commit with: node ~/.claude/devflow/bin/df-tools.cjs commit "chore: upgrade DevFlow project to v<ver>" --files <changed>` byte for byte.
10. 0010 `STORE_COMMIT_STEPS` and doctor 20 store `commitNote` keep every existing assertion green and now include the `gh pr start` line.
11. As printed for all four emitters: a table of their real store-mode outputs runs as printed in the fixture (tests 1 and 3 per emitter).

<embedded_context>

<codebase_examples>
Today's store-mode text, copied twice (0010-store-gitignore.cjs:74-82 and 20-legacy-runtime-state.cjs:49-56). Lines 1-5 of the builder must reproduce it:

```js
const STORE_COMMIT_STEPS = [
  'commit on a new branch with the logged escape (gate gh; store mode refuses the default branch and unlinked ' +
    'branches), then merge it through a pull request:',
  `  git switch -c ${STORE_BRANCH}`,
  '  DEVFLOW_SKIP_GH_GATE=1 DEVFLOW_SKIP_GH_GATE_REASON="store migration" node ~/.claude/devflow/bin/df-tools.cjs ' +
    'commit "chore: gitignore the planning cache (store mode)" --files .gitignore .planning/',
  `  git push -u origin ${STORE_BRANCH}`,
  '  then open a pull request for that branch',
].join('\n');
```

Doctor 20 picks the form with the only reader of `github.store`:

```js
function commitNote(root, files) {
  const list = files.join(' ');
  if (!planningMode.isStoreMode(root)) return `commit with: ${COMMIT_COMMAND} ${list}`;
  return [ /* the five lines above, branch devflow-untrack-runtime-state, reason "untrack DevFlow runtime state" */ ].join('\n');
}
```

The two emitters still to fix:

```js
// gh-setup-cli.cjs:90-93
function filesLines(files, outcomes) {
  const lines = ['', `Written to the working tree, not committed: ${files.join(', ')}.`,
    `Commit them on a branch and open a pull request: df-tools commit "chore: add the DevFlow checks workflow and pull request template" --files ${files.join(' ')}`];
  ...
// doctor-checks/21-pending-migrations.cjs:143-145
  if (rep.changed_files.length) {
    notes.push(`commit with: ${DF_TOOLS} commit "chore: upgrade DevFlow project to v${ctx.pluginVersion}" --files ${rep.changed_files.join(' ')}`);
  }
```

The store-mode git fixture to copy (misc-commit-gate.test.cjs:102-123, `storeRepo`): `fx.makeFakeHome()`, a mkdtemp root,
a failing `gh` shim dir on PATH, `.planning/config.json` with `{commit_docs: true, github: {enabled: true, store}}`, the U-1
`.gitignore` block (`U1_BLOCK` constant in that file), `fx.initGitFixture(root, home)`, then a v3 mapping written AFTER the
init commit: `gm.setEntry(m, '50', {issue_id: 500})`, `gm.setPr(m, '50', {branch: '50-enforce'})`, `gm.writeMappingV3(root, m)`.
Run df-tools as `spawnSync(process.execPath, [TOOLS_PATH, '--cwd', dir, 'commit', ...])` with `fx.gitEnv(home)` and the
`DEVFLOW_ALLOW_RAW_COMMIT`, `DEVFLOW_SKIP_GH_GATE`, `DEVFLOW_SKIP_GH_GATE_REASON` keys deleted from the base env.
</codebase_examples>

<anti_patterns>
- A fourth hand-copied store-mode string. Every emitter calls `branchCommitSteps`.
- Evaluating the gate at print time to choose the text. The note is read later, possibly on another branch; the static sequence
  works from any branch. The `gh pr start` line covers the linked-branch case.
- Reading `github.store` directly. Use `planningMode.isStoreMode(root)` in callers; keep `commit-steps.cjs` pure (no fs, no git).
- "As printed" tests that rebuild the command themselves. Execute the emitted lines: replace only the literal prefix
  `node ~/.claude/devflow/bin/df-tools.cjs` with `"<process.execPath>" "<TOOLS_PATH>"`, run the line through `sh -c`, and skip
  only `git push` and the `then open a pull request` line (the fixture has no remote).
</anti_patterns>

<error_recovery>
- `git switch -c` fails because the branch exists: each scenario gets a fresh fixture; never reuse a repo across scenarios.
- The escaped commit returns `skipped_gitignored`: the files named in the printed command must exist and be unignored in the fixture.
  For the 0010 emitter, modify `.gitignore` so there is something to commit (`.planning/` paths are ignored and skipped by design).
- gh-setup-cli tests use `hermeticEnv` and the gh fake (`gh-setup-cli.test.cjs` `install()`/`project(github)`); pass
  `project({store: true})` for the store case rather than building a new harness.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/52-store-mode-polish/OBJECTIVE.md
@.planning/objectives/51-github-migration-and-docs/51-04-SUMMARY.md
@plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.cjs
@plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.cjs
</context>

<gotchas>
- `migrations/0011-github-store-backfill.cjs:987` dedupes on `tenNotes.includes(m0010().STORE_COMMIT_STEPS)`. Keep
  `STORE_COMMIT_STEPS` an exported string constant computed once at module load.
- `doctor-checks/20-legacy-runtime-state.cjs` exports `COMMIT_COMMAND`, and its test constant `COMMIT_CMD` depends on it: keep the export and its value.
- `0010-store-gitignore.test.cjs:458` `ESCAPED_COMMIT_RE` is multiline-anchored on a line starting with `DEVFLOW_SKIP_GH_GATE=1`.
  The new 6th line must not start with that, or the regex matches twice.
- gh setup runs with the store off as well (enablement is `github.enabled` + `github.repo`, gh-setup-cli.cjs:10). The ruleset makes
  a PR mandatory either way, so both modes print a branch sequence. Only store mode adds the escape.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: commit-steps.cjs builder and the as-printed store-mode fixture</name>
  <files>plugins/devflow/devflow/bin/lib/commit-steps.cjs, plugins/devflow/devflow/bin/lib/commit-steps.test.cjs</files>
  <action>
RED: write `commit-steps.test.cjs` covering test-list items 1-7 against the not-yet-existing module. Commit `test(52-01): ...`.

GREEN: create `commit-steps.cjs` (CommonJS, `'use strict'`, header comment naming objective 52 and GEN-01):
- `DF_TOOLS_CMD = 'node ~/.claude/devflow/bin/df-tools.cjs'`
- `commitCommand(message, files)`: `${DF_TOOLS_CMD} commit "${message}" --files ${files.join(' ')}`
- `branchCommitSteps({branch, command, reason})`: returns a `\n`-joined string.
  Store form (`reason` is a non-empty string):
    1 `commit on a new branch with the logged escape (gate gh; store mode refuses the default branch and unlinked branches), then merge it through a pull request:`
    2 `  git switch -c ${branch}`
    3 `  DEVFLOW_SKIP_GH_GATE=1 DEVFLOW_SKIP_GH_GATE_REASON="${reason}" ${command}`
    4 `  git push -u origin ${branch}`
    5 `  then open a pull request for that branch`
    6 `  or, on an objective's linked branch (\`df-tools gh pr start <objective>\`), commit there with: ${command}`
  Plain form (`reason` null or undefined): line 1 `commit on a new branch, then merge it through a pull request:`, then lines 2, `  ${command}`, 4 and 5.
  Throw a TypeError when `branch` or `command` is not a non-empty string.

The as-printed runner in the test is a small helper: for each line, trim it. A line starting with `git switch -c` goes to git. A line
starting with `DEVFLOW_SKIP_GH_GATE=1` or `node ~/.claude/devflow/bin/df-tools.cjs` is run via `sh -c` after the prefix substitution.
For the `or, on an objective's linked branch` line, take the text after `commit there with: `. Parse the df-tools JSON from stdout.
Use a hand-built fixture (see codebase_examples) with a tracked `src/x.js` that each scenario modifies.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/commit-steps.test.cjs  (the RED commit fails it; GREEN passes it)</verify>
  <done>Test-list items 1-7 pass. The store form runs as printed from `main` and from `50-enforce`, the linked-branch line lands without an escape, and the gh shim log stays empty.</done>
  <recovery>If `sh -c` quoting breaks on the message, check that `commitCommand` wraps the message in double quotes and that the test messages contain no `"` or `$`.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: gh setup and doctor check 21 print the builder's sequence</name>
  <files>plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs, plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/21-pending-migrations.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs</files>
  <action>
RED: add test-list items 8 and 9. In gh-setup-cli.test.cjs, add a store-mode variant of test 2 (`project({store: true})`) and a
mirror assertion on the existing test 2. In 21-22-project.test.cjs, add a store-mode fix case: config `github: {enabled: true, store: true}`
plus a pending auto migration so `changed_files` is non-empty, and keep a local-mode byte-identity assertion. Commit `test(52-01): ...`.

GREEN:
- gh-setup-cli.cjs `filesLines(files, outcomes)` becomes `filesLines(cwd, files, outcomes)`. It keeps the `Written to the working tree, not committed: ...` line.
  The `Commit them on a branch ...` line becomes `Commit them through a pull request:` followed by
  `branchCommitSteps({branch: 'devflow-setup', command: commitCommand('chore: add the DevFlow checks workflow and pull request template', files), reason: planningMode.isStoreMode(cwd) ? 'gh setup workflow' : null})`.
  Thread `cwd` through `runSetup` -> `applied(...)`. Keep the ruleset lines unchanged. Export `filesLines` for the table test in Task 3.
- 21-pending-migrations.cjs: when `rep.changed_files.length` is non-zero, keep the exact local `commit with:` push unless
  `planningMode.isStoreMode(ctx.projectRoot)` is true. In store mode, push
  `branchCommitSteps({branch: 'devflow-upgrade', reason: 'DevFlow upgrade', command: commitCommand(\`chore: upgrade DevFlow project to v${ctx.pluginVersion}\`, rep.changed_files)})`.
  Notes are joined with `'; '` today; the store form is multi-line, so append it last. Export a small `commitNote(root, version, files)` helper so Task 3 can table-test it.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs plugins/devflow/devflow/bin/lib/gh-setup-apply.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs</verify>
  <done>Store-mode gh setup and doctor 21 print the builder's store form. Mirror-mode gh setup prints the plain form. Local doctor 21 bytes are unchanged, and all pre-existing tests in the three files pass.</done>
  <recovery>If a pre-existing gh-setup test pins the old `Commit them on a branch` wording, update that assertion to the new wording in the same RED commit and record it in the SUMMARY.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 0010 and doctor 20 use the builder; all four emitters run as printed</name>
  <files>plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.cjs, plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.test.cjs, plugins/devflow/devflow/bin/lib/commit-steps.test.cjs</files>
  <action>
RED: in the 0010 and doctor-20 tests, assert the store-mode text contains `df-tools gh pr start <objective>` and equals the
builder's output for their branch, reason and command. In commit-steps.test.cjs, add test-list item 11: a table of the four real
store-mode emitter outputs (`m0010.STORE_COMMIT_STEPS`, doctor-20 `commitNote(storeRoot, files)`, doctor-21 `commitNote(...)`,
gh-setup `filesLines(storeRoot, files, [])`), each run as printed (scenarios 1 and 3) in a fresh fixture after creating or modifying
the files its command names. Commit `test(52-01): ...`.

GREEN:
- 0010: `STORE_COMMIT_STEPS = branchCommitSteps({branch: STORE_BRANCH, reason: 'store migration', command: commitCommand('chore: gitignore the planning cache (store mode)', ['.gitignore', '.planning/'])})`. Keep the export and the TRD 51-04 comment, and add a line referencing 52-01.
- doctor 20: the store branch of `commitNote` returns `branchCommitSteps({branch: STORE_BRANCH, reason: 'untrack DevFlow runtime state', command: \`${COMMIT_COMMAND} ${list}\`})`. Local branch unchanged.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/commit-steps.test.cjs plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.test.cjs plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.apply.test.cjs plugins/devflow/devflow/bin/lib/gh-backfill.e2e.test.cjs</verify>
  <done>All four emitters build their store text with `branchCommitSteps`, and the table test runs each as printed from `main` and from the linked branch. The 0011 apply and backfill e2e tests still pass.</done>
  <recovery>If 0011 apply tests fail on note text, they compare `m0010().STORE_COMMIT_STEPS` dynamically: check that 0011 still reads the exported constant and that you did not turn it into a function.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `rg -n 'Commit them on a branch and open a pull request: df-tools commit' plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs` returns nothing.
- `rg -n 'branchCommitSteps' plugins/devflow/devflow/bin/lib --glob '!*.test.cjs'` lists commit-steps.cjs, gh-setup-cli.cjs, 21-pending-migrations.cjs, 0010-store-gitignore.cjs and 20-legacy-runtime-state.cjs.
- The six scoped test files in Tasks 1-3 pass.
</verification>

<success_criteria>
In a store-mode fixture, the printed follow-up of each of gh setup, doctor 21, migration 0010 and doctor 20 succeeds as printed from
the default branch and from a linked objective branch. Each names `gh pr start`. Local-mode text is unchanged.
</success_criteria>

<output>
After completion, create `.planning/objectives/52-store-mode-polish/52-01-SUMMARY.md` via `df-tools summary post`.
</output>
