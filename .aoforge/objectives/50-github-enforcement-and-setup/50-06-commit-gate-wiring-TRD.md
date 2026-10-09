---
objective: 50-github-enforcement-and-setup
trd: "06"
type: standard
wave: 2
depends_on: ["50-02"]
files_modified:
  - plugins/devflow/devflow/bin/lib/misc.cjs
  - plugins/devflow/devflow/bin/lib/misc-commit-gate.test.cjs
  - plugins/devflow/devflow/bin/lib/commit-trailer.cjs
  - plugins/devflow/devflow/bin/lib/commit-trailer.test.cjs
autonomous: true
requirements: [GEN-01]
must_haves:
  truths:
    - "In store mode `df-tools commit` on the default branch exits 1 with `reason: default_branch`, commits nothing and leaves the index exactly as it was"
    - "In store mode a commit on a branch with no unmerged `prs` entry exits 1 with `reason: unlinked_branch`; on the linked branch it commits"
    - "A commit from a `df/exec-*` worktree whose main checkout is on the linked branch commits"
    - "With `DEVFLOW_SKIP_GH_GATE=1` the refused commit lands, the result carries `gate_escaped: true`, and `.override-log.jsonl` in the main checkout's `.planning/` gains a `gate: gh` entry"
    - "On a linked branch an unscoped message still gets `Refs #<objective issue>`"
    - "In local mode the commit result keys, message bytes and index behaviour are identical to before, with zero gh calls"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/misc.cjs
      provides: "cmdCommit runs the gate (store mode) before any git add"
    - path: plugins/devflow/devflow/bin/lib/commit-trailer.cjs
      provides: "refsFor falls back to the linked branch's objective issue when the message names no scope"
  key_links:
    - "Uses 50-02 evaluateGate/readGateInputs and override.recordOverride; SC1 e2e in 50-12"
---

# TRD 50-06: `df-tools commit` refuses the default and unlinked branches (GEN-01)

<objective>
Wire the 50-02 decision into `cmdCommit` so a store-mode commit on the wrong branch is refused before anything is staged, the
documented escape is logged through `df-tools override`, and every commit on a linked branch carries a `Refs #` paragraph.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(50-06): ...`), then implementation (`feat(50-06): ...`).
- New test file `misc-commit-gate.test.cjs` (keeps misc-commit.test.cjs untouched for parallel safety). Temp git repos with
  `GIT_CONFIG_GLOBAL=/dev/null`, a bare `origin` so `defaultBranch` resolves (or `_setRunGit`), store config via `makeStoreProject`-style
  config. Run df-tools as a child process (`node <repo>/plugins/devflow/devflow/bin/df-tools.cjs --cwd <tmp> commit ...`) with
  `DEVFLOW_ALLOW_RAW_COMMIT` unset; never the real `~/.claude`.
- This repo is store-off, so your own commits exercise the local path — that is itself the parity check.

## Decisions

- **Placement**: in `cmdCommit` (misc.cjs L561) after the planning-path filter returns (so a fully skipped commit stays `skipped`, exit 0)
  and BEFORE the `git add` loop (~L603), so a refusal never touches the index. Store mode only (`planningMode.isStoreMode(cwd)`); local
  mode does not even `require('./gh-gate.cjs')`.
- **Merge/rebase in progress**: skip the gate (the existing `merge_in_progress` refusal and raw-commit completion path own that case).
  Reuse `mergeInProgress(cwd)`; add the rebase check the same way gate-commits.js detects `rebase-merge`/`rebase-apply` in the git dir.
- **Amend** is gated like any commit (amending on the default branch is still a default-branch commit).
- **Refusal output**: `output({committed:false, hash:null, reason, branch, error}, raw, reason, 1)` — same shape as `merge_in_progress`.
- **Escape logging**: `override.recordOverride({planningDir: path.join(mainRoot, '.planning'), gate:'gh', reason})` with reason
  `process.env.DEVFLOW_SKIP_GH_GATE_REASON || 'env DEVFLOW_SKIP_GH_GATE=1 (<reason code> on <branch>)'`. The log is gitignored in store
  mode (migration 0010's `.planning/*`). A logging failure does not block the escaped commit: the result carries `gate_log_error`.
  df-tools reads its own environment, so an exported variable works (unlike the gate-commits hook caveat).
- **Trailer fallback**: `refsFor(mainRoot, message, {objective})` — when the scope is absent (`no scope` / `unrecognised scope`) and the
  gate returned an objective, use that objective's `issue_id`. A scoped message keeps today's resolution. Result keeps `refs`/`refs_reason`.

## Test list

1. Store mode, on `main` (origin/HEAD → main) → exit 1, `reason: default_branch`; `git diff --cached` empty and HEAD unchanged.
2. Store mode, on `feat/x` with no prs → `unlinked_branch`, nothing staged.
3. Store mode, on `50-enforce` with `prs[50].branch = '50-enforce'` → committed.
4. Store mode, `git worktree add -b df/exec-50-03` from a main checkout on `50-enforce` → committed from the worktree.
5. `DEVFLOW_SKIP_GH_GATE=1` on `main` → committed, `gate_escaped: true`; main `.planning/.override-log.jsonl` last line has `gate:"gh"`.
6. Store mode, linked branch, message `wip: notes` (no scope), objective 50 issue 500 → last paragraph `Refs #500`; `feat(50-02): x`
   with TRD issue 502 → `Refs #502` (unchanged 49-07 behaviour).
7. Local mode (store off, enabled true) on `main` → committed exactly as before, result has none of `gate_escaped`/`refs` keys; a gh seam
   that throws is never hit.
8. Store mode with every requested path ignored (`.planning/STATE.md` only) → still `skipped_gitignored`, exit 0 (gate not reached).
9. Store mode, merge in progress on `main` → `merge_in_progress` (gate skipped).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: trailer fallback (test 6, unit half)</name>
  <files>plugins/devflow/devflow/bin/lib/commit-trailer.cjs, plugins/devflow/devflow/bin/lib/commit-trailer.test.cjs</files>
  <action>
RED: in commit-trailer.test.cjs add `refsFor(main, 'wip: notes', {objective:'50'})` → `{issue:500, id:'50'}`; scoped messages ignore
the option; `{objective}` absent keeps `no scope`. Commit `test(50-06): Refs fallback to the linked objective`.
GREEN: optional third parameter; resolve via `ghMapping.getEntry(mapping, objective).issue_id`. Commit
`feat(50-06): unscoped commits on a linked branch reference the objective issue`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/commit-trailer.test.cjs</verify>
  <done>New and existing trailer tests pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: gate in cmdCommit (tests 1-9)</name>
  <files>plugins/devflow/devflow/bin/lib/misc.cjs, plugins/devflow/devflow/bin/lib/misc-commit-gate.test.cjs</files>
  <action>
RED: tests 1-9; commit `test(50-06): df-tools commit refuses default and unlinked branches`.
GREEN: insert the gate block described in Decisions, with a comment `// TRD 50-06 (GEN-01): ...` in the style of the 49-07 comment.
Pass `gate.objective` to `refsFor`. Commit `feat(50-06): df-tools commit enforces the objective branch in store mode`.
Then run the existing commit suites.
# CRITICAL: refusal before `git add`; local mode byte-identical (no new result keys, no new requires).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/misc-commit-gate.test.cjs plugins/devflow/devflow/bin/lib/misc-commit.test.cjs plugins/devflow/devflow/bin/lib/commit-failure.test.cjs plugins/devflow/devflow/bin/lib/commit-staged-removal.test.cjs</verify>
  <done>Tests 1-9 pass; existing commit suites unchanged.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `misc.cjs` `cmdCommit` L561: planning filter L581-601, `git add` loop ~L603, store-mode trailer block ~L627-636, `merge_in_progress`
  refusal ~L647 (output shape to copy).
- `hooks/gate-commits.js` — how `rebase-merge` / `rebase-apply` / `CHERRY_PICK_HEAD` are detected in the per-worktree git dir.
- `override.cjs` `recordOverride({planningDir, gate, reason, now})` L51.
- `planning-mode.cjs` `resolveMainRoot` (D-14).
</codebase_examples>
<anti_patterns>
- Gating after `git add` (a refused commit would leave files staged).
- Reading `.planning/` of the worktree for the override log (use the main root).
</anti_patterns>
<error_recovery>
- If test repos cannot resolve `origin/HEAD`, set it with `git remote set-head origin main` after pushing to a bare remote, or rely on
  the `main`/`master` fallback in `defaultBranch`.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/misc-commit-gate.test.cjs plugins/devflow/devflow/bin/lib/commit-trailer.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/misc-commit.test.cjs plugins/devflow/devflow/bin/lib/commit-failure.test.cjs plugins/devflow/devflow/bin/lib/commit-staged-removal.test.cjs plugins/devflow/devflow/bin/lib/cwd-flag.test.cjs</regression>
</validation_gates>

<verification>
- SC1 locally: tests 1, 2, 5. D-01: test 7.
</verification>

<success_criteria>
Store-mode commits land only on the objective's linked branch (or its executor worktrees), the escape is logged, and local mode is unchanged.
</success_criteria>

<output>
After completion, create `.planning/objectives/50-github-enforcement-and-setup/50-06-SUMMARY.md`
</output>
