---
objective: 50-github-enforcement-and-setup
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-gate.cjs
  - plugins/devflow/devflow/bin/lib/gh-gate.test.cjs
  - plugins/devflow/devflow/bin/lib/override.cjs
  - plugins/devflow/devflow/bin/lib/override.test.cjs
autonomous: true
requirements: [GEN-01]
must_haves:
  truths:
    - "`evaluateGate` refuses the default branch (`default_branch`), a branch no `prs` entry names or whose PR is merged (`unlinked_branch`), and a detached HEAD (`detached_head`)"
    - "A branch named by an unmerged `prs[<objective>].branch` is allowed and returns that objective id"
    - "A `df/exec-*` executor branch is allowed when the main checkout's branch is linked, and refused (`unlinked_branch`) otherwise"
    - "`DEVFLOW_SKIP_GH_GATE=1` turns a refusal into `{allow:true, escaped:true}` carrying the refusal it overrode; it never marks an allowed commit as escaped"
    - "`gh` is a known override gate (`df-tools override --gate gh --reason ...` is accepted and logged)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-gate.cjs
      provides: "evaluateGate({branch, mainBranch, defaultBranch, prs, env}) pure; readGateInputs(cwd) offline (git + main-root mapping)"
    - path: plugins/devflow/devflow/bin/lib/override.cjs
      provides: "GATES.gh = null (env-driven, logged only)"
  key_links:
    - "Called from cmdCommit by 50-06; exercised end to end by 50-12 SC1"
---

# TRD 50-02: the commit gate decision (GEN-01, pure half)

<objective>
Decide, offline and without GitHub, whether a store-mode commit may land on the current branch. The decision is a pure function over
the branch names and the mapping's `prs` map, plus a thin reader that collects those inputs. Output: `gh-gate.cjs` and the `gh` override gate.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(50-02): ...`), then implementation (`feat(50-02): ...`).
- `gh-gate.cjs` never calls `gh` and never writes. Git is read only through `objective-branch.cjs` (`currentBranch`, `defaultBranch`,
  `_setRunGit` for tests). The mapping is read from the MAIN checkout (`planningMode.resolveMainRoot(cwd)`), because worktrees hold none.
- Tests use temp git repos (`git init`, `GIT_CONFIG_GLOBAL=/dev/null`, local identity) or the `_setRunGit` seam; never the real `~/.claude`.

## Decisions

- **Linked = local mapping fact.** A branch is linked when `ghMapping.listPrs(mapping)` has an entry whose `branch` equals it and that
  has no `merged_at`. `gh pr start` writes that entry only after creating the GitHub linked branch, so a local hit is sufficient and the
  gate works offline. No GitHub call, ever.
- **Executor branches.** `df/exec-<id>` (exec-context.cjs L424) merge back into the objective branch, so they are allowed when the main
  checkout's current branch is linked (they inherit its objective). Otherwise refused as `unlinked_branch` with a message naming the
  main checkout's branch. Workstream branches (`df/ws-*`) get no special case: in store mode each workstream runs `gh pr start`.
- **Default branch unknown** (`defaultBranch` returns `branch:null`): only the linked test applies.
- **Detached HEAD**: refused (`detached_head`) — the commit would belong to no branch.
- **Escape**: `env.DEVFLOW_SKIP_GH_GATE === '1'` only (not "true"). Result keeps `reason` and adds `escaped:true`; recording the
  override is the caller's job (50-06) so this module stays pure.
- **Override gate** `gh: null` in `override.GATES` — env-driven and logged only, like `commits` and `changelog`. `audit-cli.runOverride`
  validates against GATES, so `df-tools override --gate gh` works with no other change.

## Test list

1. Default branch `main`, current `main` → `{allow:false, reason:'default_branch'}`; message names `gh pr start <objective>`.
2. Current `feat/x`, prs empty → `unlinked_branch`.
3. prs `{50:{branch:'50-github-enforcement'}}`, current `50-github-enforcement` → `{allow:true, objective:'50'}`.
4. Same entry with `merged_at` set → `unlinked_branch` (message says the PR is merged).
5. Current `df/exec-50-03`, main checkout on the linked branch → allow with `objective:'50'`; main checkout on `main` → `unlinked_branch`.
6. Current `null` (detached) → `detached_head`.
7. Escape env on a refused case → `{allow:true, escaped:true, reason:'default_branch'}`; escape env on an allowed case → no `escaped`.
8. Escape value `'true'` → still refused.
9. `defaultBranch` null + linked branch → allow; + unlinked branch → `unlinked_branch`.
10. `readGateInputs(worktreeCwd)` in a `git worktree add` checkout reads the mapping from the main checkout and reports both branches.
11. `override.recordOverride({planningDir, gate:'gh', reason:'x'})` → ok, appended to `.override-log.jsonl`, no marker written.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: evaluateGate (tests 1-9) and the gh override gate (test 11)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-gate.cjs, plugins/devflow/devflow/bin/lib/gh-gate.test.cjs, plugins/devflow/devflow/bin/lib/override.cjs, plugins/devflow/devflow/bin/lib/override.test.cjs</files>
  <action>
RED: tests 1-9 in gh-gate.test.cjs (table-driven over plain inputs) and test 11 in override.test.cjs; commit
`test(50-02): commit gate decision and gh override gate`.
GREEN: `evaluateGate({branch, mainBranch, defaultBranch, prs, env})` where `prs` is `listPrs` output (`[[objectiveId, entry]]`).
Return `{allow, reason?, objective?, escaped?, message?}`. Messages are actionable: default branch → "run `df-tools gh pr start
<objective>` and commit on its branch, or set DEVFLOW_SKIP_GH_GATE=1 (logged)". Add `gh: null` to GATES with a comment naming 50-02.
Commit `feat(50-02): pure commit gate decision; gh override gate`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-gate.test.cjs plugins/devflow/devflow/bin/lib/override.test.cjs plugins/devflow/devflow/bin/lib/audit-cli.test.cjs</verify>
  <done>Tests 1-9 and 11 pass; audit-cli tests unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: readGateInputs (test 10)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-gate.cjs, plugins/devflow/devflow/bin/lib/gh-gate.test.cjs</files>
  <action>
RED: test 10 (temp repo with a store-mode `.planning/config.json` and a mapping holding `prs`; `git worktree add -b df/exec-50-03`);
commit `test(50-02): gate inputs from the main checkout`.
GREEN: `readGateInputs(cwd)` → `{branch, mainBranch, defaultBranch, prs}`: `currentBranch(cwd)`, `main = resolveMainRoot(cwd) || cwd`,
`currentBranch(main)`, `defaultBranch(main).branch`, `listPrs(readMappingV3WithReport(main).mapping)` (unreadable mapping → `prs: []`,
so the gate refuses rather than crashing). Commit `feat(50-02): read commit gate inputs offline`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-gate.test.cjs</verify>
  <done>Test 10 passes.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `objective-branch.cjs`: `currentBranch(root)` L117, `defaultBranch(root)` L208 (origin/HEAD then main/master; `branch:null` unknown), `_setRunGit` L61.
- `gh-mapping.cjs`: `listPrs` (~L749), `getPr` L694, PR_FIELDS L691 (`merged_at`), `readMappingV3WithReport`.
- `commit-trailer.cjs` L47-75 shows the main-root + mapping-read + "never throw" style to copy.
- `override.cjs` GATES L27-32, `recordOverride` L51.
</codebase_examples>
<anti_patterns>
- Calling `gh` or `git fetch` from the gate (commit must work offline).
- `parseInt` on ids — use `ghMapping.toObjectiveId`.
</anti_patterns>
<error_recovery>
- If `currentBranch` returns an error object for detached HEAD rather than null, normalise it in `readGateInputs`, keep `evaluateGate` on plain strings.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-gate.test.cjs plugins/devflow/devflow/bin/lib/override.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/audit-cli.test.cjs plugins/devflow/devflow/bin/lib/objective-branch.test.cjs</regression>
</validation_gates>

<verification>
- Pure function covered for every reason code and the escape; reader covered from a worktree.
</verification>

<success_criteria>
A single offline call answers "may this commit land here?" with a reason, an objective, or a logged-escape marker.
</success_criteria>

<output>
After completion, create `.planning/objectives/50-github-enforcement-and-setup/50-02-SUMMARY.md`
</output>
