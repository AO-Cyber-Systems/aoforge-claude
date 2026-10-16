---
objective: 59-state-and-merge-plumbing
trd: "06"
type: standard
wave: 3
depends_on: ["59-01", "59-02", "59-03"]
files_modified:
  - plugins/devflow/devflow/workflows/execute-objective.md
  - plugins/devflow/agents/executor.md
  - plugins/devflow/devflow/workflows/execute-trd.md
  - plugins/devflow/hooks/gate-commits-merge-sequence.test.js
  - plugins/devflow/devflow/bin/lib/state-merge-wiring.repo.test.cjs
autonomous: true
requirements: [PLMB-01, PLMB-02, PLMB-03]
must_haves:
  truths:
    - "execute-objective.md installs the merge driver (`df-tools merge-driver install`, one plain command) once per objective run before the first parallel wave's worktrees are provisioned, and states that the install and every wave merge run from the main checkout, never inside an executor worktree (with `merge-driver uninstall` named as the undo)"
    - "The documented Branch merge protocol resolves a conflict on `.planning/state.json` or `.planning/STATE_ARCHIVE.md` with `df-tools merge-driver resolve <planning_path>` instead of aborting, and the replay test runs that command for real and completes the merge"
    - "After every parallel wave's merges the orchestrator runs `state advance-job --objective ${OBJECTIVE_NUMBER}` with update-progress and roadmap update-job-progress, and commits STATE.md, ROADMAP.md and state.json"
    - "executor.md and execute-trd.md call `state advance-job --objective ${OBJECTIVE_NUMBER}`, and executor.md's state commands carry `--cwd <checkout>`"
    - "With the driver installed in the replay's scratch repository, a merge that appended to state.json and STATE_ARCHIVE.md on both sides takes the clean path"
  artifacts:
    - path: plugins/devflow/devflow/workflows/execute-objective.md
      provides: "install step, extended conflict classification, post-merge regeneration"
    - path: plugins/devflow/hooks/gate-commits-merge-sequence.test.js
      provides: "replay knows `merge-driver resolve`; scenarios for state.json/STATE_ARCHIVE.md conflicts and the installed-driver clean merge"
    - path: plugins/devflow/devflow/bin/lib/state-merge-wiring.repo.test.cjs
      provides: "prose pins for install, resolve, --objective and the regeneration commit"
  key_links:
    - "execute-objective step 0 -> `merge-driver install` (59-01) -> git merge uses the driver for state.json and union for STATE_ARCHIVE.md"
    - "Branch merge protocol -> `merge-driver resolve <planning_path>` (59-01) for an already-stopped merge"
    - "executor/execute-trd/post-merge -> `state advance-job --objective` (59-02)"
---

# TRD 59-06: Wire the merge driver and the disk-derived position into the build (PLMB-01, PLMB-02, PLMB-03)

<objective>
59-01 built `merge-driver install|resolve|state-json`, 59-02 made `state advance-job --objective N` derive the position
from disk, and 59-03 put `--cwd <CHECKOUT>` in the preflight. This TRD puts the first two where the build uses them and
keeps the documented merge sequence honest:

1. **execute-objective.md step 0**: once per objective run, before the first parallel wave's `exec-context worktree`,
   `node ~/.claude/devflow/bin/df-tools.cjs merge-driver install`, run from the main checkout. A failure or
   `Unknown command` is reported and does not stop the wave (the protocol's resolve path still covers a conflict when
   the command exists; an older runtime simply keeps today's behaviour). The prose states where things run: the install
   and every wave merge happen in the main checkout, where the orchestrator stands, never inside an executor
   worktree. That worktree is removed after its merge, so a driver recorded from it would be stranded (59-01 maps such a
   path to the main checkout's copy, and its wrapper degrades a missing binary to an ordinary conflict, but the prose
   should not rely on either). `merge-driver uninstall` is named as the undo.
2. **Branch merge protocol**: conflicted paths are classified three ways: take ours for STATE.md, ROADMAP.md and
   REQUIREMENTS.md (unchanged); `node ~/.claude/devflow/bin/df-tools.cjs merge-driver resolve <planning_path>` for
   state.json and STATE_ARCHIVE.md (it resolves and stages); abort for anything else.
3. **Post-merge regeneration**, after every parallel wave's merges (not only after a conflict): `state advance-job
   --objective ${OBJECTIVE_NUMBER}`, `state update-progress`, `roadmap update-job-progress`, then one commit of
   `.planning/STATE.md .planning/ROADMAP.md .planning/state.json`.
4. **Executor**: executor.md and execute-trd.md call `state advance-job --objective ${OBJECTIVE_NUMBER}`; executor.md's
   state block shows `--cwd <checkout>` on each df-tools state call (the rule 59-03 stated in the preflight step).

Purpose: success criteria 1-3 as the build runs them. Output: three prose files, the replay test extended, a repo test.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Tests first: write the new repo test and the new replay scenarios, see them fail against today's prose, commit
  (`test(59-06): ...`), then edit the prose (`docs(59-06): ...`).
- Every command documented in these files is ONE plain command per Bash call: no `&&`, `;`, pipes, `$(...)`, `cd`, or a
  merge chained with a commit (gate-commits denies it; the replay proves each line passes the hook).
- Targeted Edits only. Keep the `**Branch merge protocol**` marker, `<!-- merge-sequence:end -->`, and the
  `git checkout --ours -- <planning_path>` / `git add <planning_path>` / `git commit --no-edit` / `git merge --abort`
  spellings the replay classifies.
- The replay runs `merge-driver resolve` through the REPO copy of df-tools (substitute the documented
  `node ~/.claude/devflow/bin/df-tools.cjs` prefix with `node <repo>/plugins/devflow/devflow/bin/df-tools.cjs`): the mirror
  has no `merge-driver` until release. Hermetic git only (the file's own `gitEnv()`).
- One plain command per Bash call yourself; commit through `node plugins/devflow/devflow/bin/df-tools.cjs commit ...`.

## Test list

Replay (`gate-commits-merge-sequence.test.js`), outermost first:

1. state.json conflict (no driver installed in the scratch repo): base, main and branch each hold a state.json; main and
   branch append different decisions → the replay lists `.planning/state.json`, runs the documented
   `merge-driver resolve` line for it (for real), completes with `git commit --no-edit`; HEAD has two parents, the tree is
   clean, state.json parses and holds both decisions. Path taken: `planning-conflict`.
2. STATE_ARCHIVE.md conflict → resolved by the union strategy; both appended rows present.
3. STATE.md + state.json + STATE_ARCHIVE.md conflicting together → STATE.md takes ours, the other two resolve; merge
   completes.
4. state.json + `src/a.js` conflicting → abort path (nothing resolved; HEAD unchanged).
5. Driver installed first (`merge-driver install` via the repo bin in the scratch repo) → the same appends as 1+2 take the
   `clean` path with no conflict at all.
6. Order: `resolve` comes after `list` and before `complete`; the existing order test keeps its assertions; every
   documented command stays chain-free.

Prose pins (`state-merge-wiring.repo.test.cjs`, reads the three markdown files):

7. execute-objective.md contains the line `node ~/.claude/devflow/bin/df-tools.cjs merge-driver install` in a shell
   fence, and it appears before the first `exec-context worktree --repo` fence.
8. The merge protocol section names `.planning/state.json` and `.planning/STATE_ARCHIVE.md` and has the line
   `node ~/.claude/devflow/bin/df-tools.cjs merge-driver resolve <planning_path>`.
9. The post-merge regeneration has `state advance-job --objective "${OBJECTIVE_NUMBER}"` and its commit `--files` list
   includes `.planning/state.json`.
10. Every `state advance-job` invocation in executor.md and execute-trd.md carries `--objective`.
11. executor.md's state_updates block passes `--cwd <checkout>` on its df-tools state commands.
12. execute-objective.md says, in step 0 beside the install line and again in the Branch merge protocol's lead-in prose
    (not inside a shell fence, so the replay's classifier is unaffected), that the install and the wave merges run from
    the main checkout and never inside an executor worktree; step 0 names `merge-driver uninstall` as the undo.

<embedded_context>

<codebase_examples>
The replay's classifier and path rule today (`hooks/gate-commits-merge-sequence.test.js`):

```js
const PLANNING_ONLY = ['.planning/STATE.md', '.planning/ROADMAP.md', '.planning/REQUIREMENTS.md'];
const CATEGORIES = [
  ['merge', /^git merge --no-ff df\/exec-\S+$/],
  ['list', /^git diff --name-only --diff-filter=U$/],
  ['ours', /^git checkout --ours -- <planning_path>$/],
  ['add', /^git add <planning_path>$/],
  ['complete', /^git commit --no-edit$/],
  ['abort', /^git merge --abort$/],
  ['df-tools', /^node ~\/\.claude\/devflow\/bin\/df-tools\.cjs /],
];
    if (conflicted.every((p) => PLANNING_ONLY.includes(p))) {
      taken = 'planning-conflict';
      for (const p of conflicted) { step(ours...p); step(add...p); }
      const done = step(complete);
```

Change it to two lists (`TAKE_OURS` = the three above, `RESOLVE` = `.planning/state.json`, `.planning/STATE_ARCHIVE.md`),
a `resolve` category placed BEFORE `df-tools` (`/^node ~\/\.claude\/devflow\/bin\/df-tools\.cjs merge-driver resolve
<planning_path>$/`), and per conflicted path: TAKE_OURS → ours + add, RESOLVE → the resolve line run for real through the
repo bin (it stages the file itself). `df-tools` lines are still hook-checked only. `mkScratch` gains a `base = {}`
option so state.json and STATE_ARCHIVE.md can exist in the common base (otherwise both sides ADD the file).

The merge protocol text today (execute-objective.md, step 5b): "If EVERY listed path is `.planning/STATE.md`,
`.planning/ROADMAP.md` or `.planning/REQUIREMENTS.md`, take the integration branch's copy of each one ... If ANY other path
is listed, resolve nothing. Abort the merge". Then "Taking ours is the same 'take ours, regenerate' policy ... when a
planning-file conflict was resolved above, regenerate what it dropped" followed by `state update-progress`,
`roadmap update-job-progress` and a commit of `.planning/ROADMAP.md .planning/STATE.md`, then `<!-- merge-sequence:end -->`.

The executor state block (executor.md `state_updates`) and execute-trd.md `state_updates` both run
`node ~/.claude/devflow/bin/df-tools.cjs state advance-job` with no flag; executor.md's behaviour list says
"`state advance-job`: Increments Current TRD, detects last-plan edge case, sets status".

59-02's result: `state advance-job --objective N` → Status `Executing objective N — D/T TRDs complete`, or
`Objective N executed — T/T TRDs complete, ready for verification`; idempotent; writes state.json `current_objective`,
`current_job`, `total_jobs`, `status`. Read `59-02-SUMMARY.md` for the exact shape if anything differs.
</codebase_examples>

<anti_patterns>
- Do not describe the regeneration as conditional on a conflict any more: the merged SUMMARYs change the position after
  every parallel wave, and advance-job is idempotent.
- Do not add `merge-driver install` inside the Branch merge protocol section (the replay would try to classify it); it
  belongs in step 0.
- Do not run `merge-driver install` against this repository from a test.
</anti_patterns>

<error_recovery>
- If replay scenario 5 still conflicts, the scratch repo's install wrote to a different git dir: assert
  `git check-attr merge -- .planning/state.json` prints `devflow-state-json` in the scratch repo before merging.
- If the hook denies a new documented line, it is a compound command or names `git commit` inside a df-tools argument;
  split it or reword the argument.
- If doc-refs.repo.test.cjs or dispatch-completeness flags `merge-driver`, 59-01's dispatch arm is missing from your
  base; confirm `node plugins/devflow/devflow/bin/df-tools.cjs merge-driver --help` works.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Replay and prose pins for install, resolve and the regeneration (tests 1-11, RED)</name>
  <files>plugins/devflow/hooks/gate-commits-merge-sequence.test.js, plugins/devflow/devflow/bin/lib/state-merge-wiring.repo.test.cjs</files>
  <action>
Fixture first: `mkScratch({ base, branch, main })` (base applied before the base commit) and two hand-built content
builders in the test file: `stateJsonWith(decisions)` (`JSON.stringify({...defaults, decisions}, null, 2)`) and
`archiveWith(rows)` (the ARCHIVE_SEED shape with metrics rows).

Then the replay changes (TAKE_OURS / RESOLVE lists, `resolve` category, real resolve through the repo bin) and scenarios
1-6, and the new repo test with pins 7-12. Run both files: 1-3 and 7-12 fail against today's prose (no resolve line, no
install, no `--objective`, no main-checkout note); 4-6 may pass. Commit
`test(59-06): merge sequence resolves state.json and STATE_ARCHIVE.md`.
  </action>
  <verify>`node --test plugins/devflow/hooks/gate-commits-merge-sequence.test.js plugins/devflow/devflow/bin/lib/state-merge-wiring.repo.test.cjs` runs; the expected tests fail for the documented reason (missing prose), not for a fixture error.</verify>
  <done>The RED commit holds the replay changes, scenarios 1-6 and pins 7-11; failures name missing prose lines.</done>
  <recovery>If scenario 1 fails inside resolve itself, run the repo bin's `merge-driver resolve .planning/state.json` by hand in a scratch copy and fix the fixture (base must hold the file) before touching prose.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Prose — install, resolve, regeneration, --objective (GREEN)</name>
  <files>plugins/devflow/devflow/workflows/execute-objective.md, plugins/devflow/agents/executor.md, plugins/devflow/devflow/workflows/execute-trd.md</files>
  <action>
execute-objective.md:
1. Step 0, parallel wave, before the `exec-context worktree` fence: "Once per objective run, before the first parallel
   wave's worktrees, register the planning-file merge drivers from the main checkout (idempotent; `changed: false` on
   later runs):" + fence `node ~/.claude/devflow/bin/df-tools.cjs merge-driver install` + two sentences: state.json then
   merges JSON-aware and STATE_ARCHIVE.md by union, so neither stops a wave merge, and a failure is reported while the
   wave goes on. Run the install and every wave merge in the main checkout, never inside an executor worktree (it is
   removed after its merge); `merge-driver uninstall` reverses the install.
   In the Branch merge protocol's lead-in prose (before its first fence), add one sentence: the merges run in the main
   checkout you are standing in, the integration checkout `merge_back` names, and never inside a plan's worktree.
2. Branch merge protocol: replace the two-way rule with the three-way classification (take ours / resolve / abort), with
   a fence holding `node ~/.claude/devflow/bin/df-tools.cjs merge-driver resolve <planning_path>` ("resolves and stages
   it; run once per listed state.json or STATE_ARCHIVE.md path"). Keep the existing ours/add/commit/abort fences.
3. Regeneration: "after the wave's merges" (always), commands `state advance-job --objective "${OBJECTIVE_NUMBER}"`,
   `state update-progress`, `roadmap update-job-progress "${OBJECTIVE_NUMBER}"`, and the commit
   `node ~/.claude/devflow/bin/df-tools.cjs commit "docs(objective-{objective_number}): refresh roadmap and state after wave {N} merges" --files .planning/ROADMAP.md .planning/STATE.md .planning/state.json`.
   Keep `<!-- merge-sequence:end -->` after it.
4. Spawn prompt `<worktree_protocol>`: `state advance-job --objective {objective_number}`.

executor.md `state_updates`: `state advance-job --objective "${OBJECTIVE_NUMBER}"`; prefix each df-tools state/roadmap/
requirements call in that block with `--cwd <checkout>` (`node ~/.claude/devflow/bin/df-tools.cjs --cwd <checkout> state
...`); behaviour line → "`state advance-job --objective N`: derives Current/Total TRDs and Status from the objective's TRD
and SUMMARY files; never says ready for verification until every TRD has a SUMMARY".
execute-trd.md `state_updates`: the advance-job line carries `--objective "${OBJECTIVE_NUMBER}"`.

Commit `docs(59-06): build wires the merge driver and disk-derived position`.
  </action>
  <verify>`node --test plugins/devflow/hooks/gate-commits-merge-sequence.test.js plugins/devflow/devflow/bin/lib/state-merge-wiring.repo.test.cjs plugins/devflow/devflow/bin/lib/executor-isolation.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` passes.</verify>
  <done>Tests 1-12 pass; executor-isolation (59-03), doc-refs and planning-writes repo tests stay green.</done>
  <recovery>If planning-writes.repo.test.cjs flags a new line as a direct planning write, the line names a `.planning/` path in a non-verb command; only `git` merge-protocol lines and df-tools verbs may name planning paths, so reword accordingly.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/hooks/gate-commits-merge-sequence.test.js plugins/devflow/devflow/bin/lib/state-merge-wiring.repo.test.cjs plugins/devflow/devflow/bin/lib/executor-isolation.test.cjs</test_scoped>
<!-- lint/build/typecheck: none in the stack profile. Known baseline npm test failures: MA-7 doctl handoff,
     roadmap-reconcile E2E1, stack-drafter-fleet github-enterprise-migration. -->
</validation_gates>

<verification>
- PLMB-02: the documented sequence completes a wave merge with state.json/STATE_ARCHIVE.md conflicts (replay 1-3) and,
  with the driver installed, never conflicts on them (replay 5).
- PLMB-01: every advance-job call the build makes carries `--objective`, including the post-merge regeneration.
- PLMB-03: executor.md's state block addresses the checkout explicitly.
</verification>

<success_criteria>
- 12 named tests pass; full `npm test` at baseline (three known failures).
</success_criteria>

<output>
After completion, publish `59-06-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes.
</output>
