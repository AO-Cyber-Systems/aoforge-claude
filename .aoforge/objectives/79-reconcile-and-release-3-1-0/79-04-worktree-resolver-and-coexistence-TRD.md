---
objective: 79-reconcile-and-release-3-1-0
trd: "04"
type: standard
wave: 2
depends_on: ["79-01"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.test.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-verbs-cli.test.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-mode.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs
  - plugins/aoforge/aoforge/bin/lib/legacy-layout-guard.cjs
  - plugins/aoforge/aoforge/bin/lib/compat.cjs
  - plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs
  - plugins/aoforge/aoforge/bin/lib/old-layout.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/model-profiles.test.cjs
  - plugins/aoforge/aoforge/bin/lib/model-profile-binding.test.cjs
  - plugins/aoforge/aoforge/bin/lib/config.test.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/13-model-profiles.test.cjs
  - "plugins/aoforge/aoforge/bin/lib/helpers.cjs and config.cjs (model-resolution functions only, and only if a SC-4 test needs it)"
autonomous: true
requirements: [SC-4]
must_haves:
  truths:
    - "Quick 36's worktree contract holds under objective 78's single-name compat: in local mode a planning verb run from a linked worktree that has its own `.aoforge/` reads and writes that worktree (quick put, quick summary, summary checkpoint for a worktree-only objective, doc put, planning draft seeded from the worktree under MAIN's repo key); a worktree with no planning dir falls back to main; store mode always writes MAIN (D-14)"
    - "A linked worktree whose branch moved its planning tree back to the pre-rename directory gets the one legacy-layout message from the CLI (exit 1), and nothing is written in the worktree or in main (no second planning tree, no `.aoforge/` created) — quick 36 meets 78's SC-4"
    - "The reverse layout (main still on the pre-rename directory, the worktree on `.aoforge/`) writes the worktree and leaves main's directory byte-identical"
    - "planning-verbs-worktree.test.cjs no longer imports LEGACY; every case that builds the pre-rename layout lives in planning-verbs-worktree.legacy.test.cjs"
    - "Quick 35's model precedence (OBJECTIVE/TRD override, then config model_profile, `auto` opting into the defaults table, unset staying balanced, pack-manifest tiers), objective 76's focus tiers, verdict floor and escalation ladder, and objective 78's single-name compat each pass their own tests on the merged tree, and a CLI smoke of resolve-model (plain, --focus, --escalate-from) on this repo is recorded"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.legacy.test.cjs
      provides: "the worktree cases that build the pre-rename layout"
      contains: "legacyLayoutMessage"
  key_links:
    - from: "planning-verbs-worktree.legacy.test.cjs"
      to: "plugins/aoforge/aoforge/bin/lib/legacy-layout-guard.cjs"
      via: "the CLI refuses a legacy-only worktree before dispatch"
      pattern: "exit|status, 1"
    - from: "planning-verbs-worktree.test.cjs"
      to: "plugins/aoforge/aoforge/bin/lib/planning-mode.cjs resolveVerbRoot"
      via: "aof-tools --cwd <worktree>"
      pattern: "resolveVerbRoot"
---

# TRD 79-04: Quick 36's worktree resolver on single-name compat, and the SC-4 coexistence proof

<objective>
Quick 36 (main) gave every planning verb one root resolver, `planning-mode.resolveVerbRoot`, and proved it with
cross-layout fixtures: main on `.aoforge/` and a worktree on the pre-rename directory (and the reverse). Objective 78
removed the legacy fallback from compat and made the CLI refuse a legacy-only tree. Those two contracts now meet in one
file: cases 25-29 and s1 build a worktree that 3.1 refuses by design. Rework them so quick 36's contract is proven on
the layout 3.1 supports (both checkouts on `.aoforge/`, the worktree diverged), move every pre-rename fixture into a
`.legacy.test.cjs` file that proves the refusal and the reverse layout, then prove the four features SC-4 names coexist:
quick 36's resolver, quick 35's model precedence, objective 76's focus tiers and escalation, objective 78's single-name
compat.

Purpose: SC-4.
Output: the reworked and new worktree tests, any fix they force, a SUMMARY with the coexistence table.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/79-reconcile-and-release-3-1-0/79-01-SUMMARY.md
@plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.test.cjs
@plugins/aoforge/aoforge/bin/lib/legacy-layout-guard.cjs

Run from your CHECKOUT; tests with an empty `mktemp -d` HOME. Rows of the 79-01 triage table routed to 79-04 are part
of this TRD's work.

What the merged code does (verify by reading; the tests decide):
- `resolveVerbRoot(cwd)`: `resolveMainRoot(cwd)` (main checkout when it has `.aoforge/`, else the nearest ancestor of
  cwd with `.aoforge/`, never $HOME); store mode -> main; local mode -> `resolveCheckoutRoot(cwd)` (the checkout holding
  cwd when it has `.aoforge/`) or main.
- The CLI's legacy-layout guard (78-07) runs after `--cwd` and before dispatch: `findLegacyLayoutRoot(cwd)` walks up from
  cwd, returns null as soon as a directory has `.aoforge/`, returns the first directory holding only the pre-rename
  planning directory (with a planning file in it); every mutating command and `init` then exit 1 with
  `legacyLayoutMessage(root)`.
- So: a worktree that moved `.aoforge/` back to the old name is refused at its own root; a worktree on `.aoforge/` over a
  main still on the old name is NOT refused (the walk stops at the worktree) and `resolveMainRoot` falls back to the
  worktree.
- Current quick 36 cases (main side, merged): 25-29 `crossLayout()` (main `.aoforge/`, worktree renamed to OLD), 30
  reverse layout, 31 gitignored planning dir falls back to main, s1 store config in main with the cross-layout worktree.
  Helpers: `project({config, ignorePlanning, planningDir})`, `addWorktree(p, {from, renameTo})`, `aof(p, dir, args, input)`.
- 78's convention: a test that builds a pre-rename fixture lives in a `*.legacy.test.cjs` file (rename-guard ALLOW)
  and names the old directory only through `LEGACY` from legacy-names.cjs.
</context>

<embedded_context>

<codebase_examples>
Same-layout worktree for the reworked cases (main tracks `.aoforge/`, so a plain worktree already has its own copy;
diverge it with a commit on the worktree branch):
```js
function sameLayout(opts = {}) {
  const p = project(opts);
  const wt = addWorktree(p);                         // .aoforge/ checked out from main
  write(wt, `${NEW}/objectives/08-wt-only/08-01-x-TRD.md`, '# TRD 08-01\n');
  gitOk(p, wt, 'add', `${NEW}/objectives/08-wt-only/08-01-x-TRD.md`);
  gitOk(p, wt, 'commit', '-qm', 'wt-only objective');
  return { p, wt };
}
```
Refusal assertion shape (78's legacy-layout-guard tests): `assert.equal(r.status, 1)`, the stderr (or prose) includes
`legacyLayoutMessage(wt)`; and a byte comparison of the worktree's legacy directory and main's `.aoforge/` before/after.
</codebase_examples>

<anti_patterns>
- Teaching resolveVerbRoot or compat to read the pre-rename directory again so the old cases pass. 78 removed that on
  purpose; the old cases change, not the code.
- Deleting quick 36 cases instead of moving or reworking them: every behaviour 25-31 and s1 proved must still be proved
  on a supported layout, or proved refused.
- Spelling the pre-rename directory in either file; use `LEGACY.planningDir`.
- Editing hooks, CLAUDE.md, docs or CHANGELOG (other TRDs own them).
</anti_patterns>

<error_recovery>
- The reverse-layout case (main on the old name, worktree on `.aoforge/`) is refused or writes main: that contradicts
  the walk described above. Read the guard and resolveMainRoot; if the code is right and the expectation wrong, fix the
  test and record why; if the code writes main's legacy tree or creates `.aoforge/` in main, that is a 78 SC-4 violation:
  fix it in planning-mode.cjs/legacy-layout-guard.cjs (RED first) and record it as a finding.
- A model-precedence or focus test fails: compare with the quick 35 / 76-06 / 76-07 SUMMARYs in
  `.aoforge/quick/35-*/` and the ROADMAP's objective 76 section; the fix belongs in the resolution code only when the
  merged code differs from main's (merge damage), never by changing the documented precedence.
</error_recovery>

</embedded_context>

## Test list

planning-verbs-worktree.test.cjs (supported layout; outermost first):

1. 25: from a same-layout worktree, `quick put 34 demo --from -` writes `<wt>/.aoforge/quick/34-demo/34-JOB.md`, main
   gains no `quick/34-demo`, prose says `wrote .aoforge/quick/34-demo/34-JOB.md`, `--raw` path is under the worktree
2. 26: `quick summary` finds the task in the worktree and writes its SUMMARY there
3. 27: `summary checkpoint 08-01` for the worktree-only objective exits 0 and writes the worktree
4. 28: `doc put PROJECT.md` writes the worktree; main's PROJECT.md unchanged
5. 29: `planning draft` seeds from the worktree's file; the draft stays under MAIN's repo key
6. 31 (unchanged): a worktree with no planning dir (gitignored) falls back to main
7. s1: store config in main; from a same-layout worktree whose own config says store false, `summary checkpoint` writes
   MAIN's `.trd-progress/` and leaves the worktree's `.aoforge/` untouched (D-14)

planning-verbs-worktree.legacy.test.cjs (pre-rename fixtures):

8. 32: a worktree whose branch moved `.aoforge/` to the pre-rename directory: `quick put` exits 1 with
   `legacyLayoutMessage(<wt>)`; the worktree's legacy directory and main's `.aoforge/` are byte-identical before/after;
   no `.aoforge/` exists in the worktree
9. 33: the same worktree, `planning draft PROJECT.md` and `doc put PROJECT.md` both refuse the same way (no draft file
   created under the scratch TMPDIR)
10. 30: reverse layout: main tracks the pre-rename directory, the worktree moved it to `.aoforge/`: `quick put` writes the
    worktree; main's directory is byte-identical; no `.aoforge/` appears in main

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Rework quick 36's worktree cases onto the supported layout; move the pre-rename cases to a legacy test</name>
  <files>plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.test.cjs, plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/planning-verbs-cli.test.cjs</files>
  <action>
First run `env HOME=$(mktemp -d) node --test plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.test.cjs plugins/aoforge/aoforge/bin/lib/planning-verbs-cli.test.cjs`
and record which cases fail and how (expected: 25-29 and s1 fail on the legacy-layout refusal; 30 may pass). That run is
the RED evidence for the rework.
Rewrite planning-verbs-worktree.test.cjs: replace `crossLayout()` with `sameLayout()` (codebase_examples), rework 25-29
and s1 per the Test list (keep their numbers and intent: the worktree is the write target in local mode, main in store
mode), keep 31, remove the `LEGACY` import and every OLD reference, update the header (quick 36 + "objective 79: on
objective 78's single-name compat the cross-layout worktree is refused; those cases live in the .legacy test").
Create planning-verbs-worktree.legacy.test.cjs with cases 32, 33 and 30 (same helpers, copied or required from a shared
spot inside the test files; no new fixture module unless both files need it — then put it under `__fixtures__/` and list
it in the SUMMARY). Apply the same split to planning-verbs-cli.test.cjs if it builds a pre-rename layout (move such
cases into the new legacy file, or into a `planning-verbs-cli.legacy.test.cjs`).
Commit RED/GREEN as `test(79-04): ...` (the rework is test-only unless a case exposes a code defect: then follow
error_recovery with its own RED/GREEN `fix(79-04): ...`).
  </action>
  <verify>`env HOME=$(mktemp -d) node --test plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.test.cjs plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/planning-verbs-cli.test.cjs plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs` passes; `rg -n "LEGACY" plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.test.cjs` prints nothing</verify>
  <done>Every quick 36 behaviour is proven on the supported layout, and the pre-rename worktree is proven refused with nothing written.</done>
  <recovery>If the CLI refuses a same-layout worktree (it should not), stop: that is merge damage in the guard or the resolver; RED test, fix in planning-mode.cjs or legacy-layout-guard.cjs, record.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: SC-4 coexistence — the four features' suites and a CLI smoke on this repo</name>
  <files>plugins/aoforge/aoforge/bin/lib/model-profiles.test.cjs, plugins/aoforge/aoforge/bin/lib/model-profile-binding.test.cjs, plugins/aoforge/aoforge/bin/lib/config.test.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/13-model-profiles.test.cjs, plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs, plugins/aoforge/aoforge/bin/lib/old-layout.legacy.test.cjs (edit only on a failure)</files>
  <action>
Run each group with an empty scratch HOME (one Bash call each) and record pass/fail counts:
- quick 36: planning-mode.test.cjs, planning-verbs-worktree*.test.cjs, planning-verbs-cli*.test.cjs
- quick 35 + objective 76: model-profiles.test.cjs, model-profile-binding.test.cjs, config.test.cjs, doctor-checks/13-model-profiles.test.cjs
- objective 78: compat.legacy.test.cjs, compat.home.test.cjs, compat-entry.repo.test.cjs, old-layout.legacy.test.cjs,
  every `legacy-layout-guard*.test.cjs` and `planning-layout*.test.cjs`
A failure is RED evidence: find whether it is merge damage (the merged code differs from the side that wrote the test:
`git log --oneline -3 -- <file>` on both parents of the merge commit) and fix at the source with a GREEN commit; a test
in 79-02's or 79-03's files is re-routed in the SUMMARY, not edited.
CLI smoke from the repo root (read-only; record the output in the SUMMARY):
`node plugins/aoforge/aoforge/bin/aof-tools.cjs resolve-model aoforge-executor --raw` (agent type as the CLI names it:
check `resolve-model --help`), the same with `--objective 79`, one `--focus` example on the mapper or researcher, and one
`--escalate-from` example; plus `node plugins/aoforge/aoforge/bin/aof-tools.cjs planning mode`. Each must exit 0.
  </action>
  <verify>Each group above exits 0 with an empty HOME; the CLI smoke lines exit 0 and their outputs are in the SUMMARY's coexistence table (feature, tests, result, CLI evidence)</verify>
  <done>The four SC-4 features pass their own tests on the merged tree and resolve correctly from the CLI.</done>
  <recovery>A failure you cannot place on one side of the merge: return it as a blocker with both parents' versions of the function.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test (scoped while iterating: node --test plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.test.cjs plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs plugins/aoforge/aoforge/bin/lib/model-profiles.test.cjs {files})</test>
</validation_gates>

<verification>
- Test list 1-10 green; quick 35, 76 and 78 groups green; CLI smoke recorded.
</verification>

<success_criteria>
- Quick 36's resolver, quick 35's precedence, objective 76's focus and escalation, and objective 78's single-name compat
  coexist on the merged tree, each proven by its own tests.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/79-reconcile-and-release-3-1-0/79-04-SUMMARY.md` through
`node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post`.
</output>
