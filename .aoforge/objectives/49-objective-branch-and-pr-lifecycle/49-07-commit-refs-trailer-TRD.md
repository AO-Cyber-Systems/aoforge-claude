---
objective: 49-objective-branch-and-pr-lifecycle
trd: "07"
type: standard
wave: 2
depends_on: ["49-02"]
files_modified:
  - plugins/devflow/devflow/bin/lib/commit-trailer.cjs
  - plugins/devflow/devflow/bin/lib/commit-trailer.test.cjs
  - plugins/devflow/devflow/bin/lib/misc.cjs
  - plugins/devflow/devflow/bin/lib/misc-commit.test.cjs
autonomous: true
requirements: [GPR-02]
must_haves:
  truths:
    - "In store mode, `df-tools commit \"feat(49-02): x\"` records the message with a final paragraph `Refs #<TRD 49-02 issue>`; `docs(49): x` gets `Refs #<objective 49 issue>`"
    - "The mapping is read from the MAIN checkout (`planningMode.resolveMainRoot(cwd)`), so commits from a `.df-worktrees/` executor get the trailer"
    - "The trailer is added once: a message that already has `Refs #N` is unchanged; `--amend` is never touched"
    - "No resolvable scope (no scope, unknown id, no issue yet) → message unchanged, commit succeeds, result carries `refs: null` with a reason"
    - "In local mode (store off) the commit message bytes are identical to today's and zero gh calls are made"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/commit-trailer.cjs
      provides: "parseScope(subject), refsFor(main, message) → {issue, id, reason}, applyRefs(message, issue)"
    - path: plugins/devflow/devflow/bin/lib/misc.cjs
      provides: "cmdCommit appends the trailer before building commitArgs (store mode only)"
  key_links:
    - "Uses 49-02 mapping; reused by 49-09 to build the start-commit message; e2e SC2 in 49-14 asserts every objective-branch commit carries `Refs #`"
---

# TRD 49-07: `Refs #trd` trailer on DevFlow commits (GPR-02)

<objective>
Make every commit DevFlow records in store mode name the issue it serves: TRD commits reference the TRD issue, objective-level commits the
objective issue. The trailer comes from the conventional-commit scope already in every executor message, resolved through the mapping in
the main checkout so worktree executors get it too.

Purpose: GPR-02 ("commits carry `Refs #trd` trailers"). Output: a small pure-ish module plus a cmdCommit hook.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(49-07): ...`), then implementation (`feat(49-07): ...`).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>` (this repo is store-off, so your own
  commits are unaffected — that is itself the parity check).
- `commit-trailer.cjs` reads files only (mapping, config); no gh, no git spawn.
- Tests use temp git repos (`git init`, `GIT_CONFIG_GLOBAL=/dev/null`, local identity) and `makeStoreProject`-style config; a worktree
  case uses `git worktree add`. Never the real `~/.claude`; never port 8080.

## Decisions

- **Format**: literal paragraph `Refs #N` (the proposal's wording), appended as `\n\nRefs #N`. Git's default trailer separator is `:`,
  so `git interpret-trailers` will not parse it; objective 50's `devflow/linked-issue` check must match `^Refs #\d+$` (note in SUMMARY).
- **Scope parse**: subject `^[a-z]+\(([^)]+)\)!?:`; scope `49-02` → `toTrdId` → `trds[id].issue_number`; scope `49` or `07.1` →
  `toObjectiveId` → objective issue; anything else → no trailer. Decision ids (`49-02-d1`) resolve like TRDs.
- **No `--allow-empty` flag**: the only empty commit (execute start) is made by `gh pr start` through the objective-branch seam (49-04)
  with a message built by `applyRefs`. Keeping `df-tools commit` flag-free avoids a new surface.
- **Failure policy**: trailer resolution never blocks a commit (enforcement is objective 50's GEN-01).

## Test list

1. `parseScope('feat(49-02): add x')` → `'49-02'`; `'docs(49): wave 1'` → `'49'`; `'fix: y'` → null; `'feat(49-02)!: z'` → `'49-02'`.
2. `refsFor(main, 'feat(49-02): x')` with mapping trds['49-02'].issue_number=102 → `{issue:102, id:'49-02'}`; objective scope → objective
   issue; unknown id → `{issue:null, reason:'no mapping entry'}`.
3. `applyRefs('feat(49-02): x\n\nbody', 102)` → ends with `\n\nRefs #102`; applying twice yields the same string; a message already
   containing `Refs #102` is unchanged.
4. Store mode, temp repo: `cmdCommit(cwd, 'feat(49-02): x', [file])` → `git log -1 --format=%B` ends with `Refs #102`.
5. Store mode from a `git worktree add` checkout whose `.planning/` has no mapping → trailer still added (main-root lookup).
6. Store mode, `--amend` → message unchanged by the trailer logic.
7. Local mode (`github.store:false`, `enabled:true`): same commit → message byte-identical to the input; no `Refs`.
8. Store mode, no scope → commit succeeds, no trailer, raw result includes `refs: null`.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: commit-trailer module (tests 1-3)</name>
  <files>plugins/devflow/devflow/bin/lib/commit-trailer.cjs, plugins/devflow/devflow/bin/lib/commit-trailer.test.cjs</files>
  <action>
RED: tests 1-3; commit `test(49-07): Refs trailer resolution`.
GREEN: `parseScope`, `refsFor(mainRoot, message)` (reads `.planning/.gh-mapping.json` via gh-mapping's reader; returns null issue in
local mode), `applyRefs(message, issue)`. Commit `feat(49-07): resolve the Refs trailer from the commit scope`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/commit-trailer.test.cjs</verify>
  <done>Tests 1-3 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: cmdCommit appends the trailer in store mode (tests 4-8)</name>
  <files>plugins/devflow/devflow/bin/lib/misc.cjs, plugins/devflow/devflow/bin/lib/misc-commit.test.cjs</files>
  <action>
RED: tests 4-8 in misc-commit.test.cjs (`describe('49-07 Refs trailer')`); commit `test(49-07): commit adds Refs in store mode`.
GREEN: in `cmdCommit` (misc.cjs L561), before `commitArgs` is built and only when `!amend` and `planningMode.isStoreMode(cwd)`,
`message = applyRefs(message, refsFor(resolveMainRoot(cwd), message).issue)`; include `refs` in the raw result. Commit
`feat(49-07): df-tools commit adds Refs #issue in store mode`. Run commit-failure, commit-staged-removal and misc-commit tests.
# CRITICAL: local mode must not even read the mapping (byte-identical and cheap).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/misc-commit.test.cjs plugins/devflow/devflow/bin/lib/commit-failure.test.cjs plugins/devflow/devflow/bin/lib/commit-staged-removal.test.cjs</verify>
  <done>Tests 4-8 pass; existing commit tests unchanged.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `misc.cjs` `cmdCommit(cwd, message, files, raw, amend)` L561; amend branch L630; merge-in-progress check L642.
- df-tools.cjs `case 'commit'` L385-397 (no change needed).
- `planning-mode.cjs` `isStoreMode`, `resolveMainRoot` (D-14: worktrees resolve to the main checkout).
- `gh-mapping.cjs` `toObjectiveId` L63, `toTrdId` L521, `getTrd` L528.
</codebase_examples>
<anti_patterns>
- Reading the mapping from `cwd/.planning` (empty in a worktree in store mode — Pitfall 7).
- `parseInt` on ids (seam-guard test 18 scans gh modules; keep the habit here too).
</anti_patterns>
<error_recovery>
- If misc-commit tests stub `execGit`, assert on the message argument passed to the stub instead of `git log`.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/commit-trailer.test.cjs plugins/devflow/devflow/bin/lib/misc-commit.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/commit-failure.test.cjs plugins/devflow/devflow/bin/lib/commit-staged-removal.test.cjs plugins/devflow/devflow/bin/lib/cwd-flag.test.cjs</regression>
</validation_gates>

<verification>
- Local-mode parity test (7) green.
</verification>

<success_criteria>
In store mode every scoped DevFlow commit names its issue, from any checkout; in local mode commits are unchanged.
</success_criteria>

<output>
After completion, create `.planning/objectives/49-objective-branch-and-pr-lifecycle/49-07-SUMMARY.md`
</output>
