---
objective: 50-github-enforcement-and-setup
trd: "03"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-check.cjs
  - plugins/devflow/devflow/bin/lib/gh-check.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-events/pull_request-closes.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-events/pull_request-no-closes.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-events/pull_request-merged.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-events/merge_group.json
autonomous: true
requirements: [GEN-05]
must_haves:
  truths:
    - "`linkedIssue` fails a PR whose body has no closing reference (`Closes|Fixes|Resolves #N`, any case/tense) to an existing same-repo issue, and fails a PR whose base is not the default branch"
    - "`linkedIssue` passes a PR body with `Closes #N` where #N is an issue (not a PR)"
    - "`planningConsistency` passes a repo whose `.planning/config.json` has `github.store` not true, and a PR with no `devflow:pr=` marker"
    - "For an objective PR in store mode `planningConsistency` fails when the objective issue or any linked TRD issue is missing from the closing references, when a target is closed as not_planned, or when the base is not the default branch"
    - "`reconcilePlan` returns the still-open closing targets (plus the objective's linked TRDs) of a MERGED PR, and nothing for an unmerged one"
    - "`prNumberFromQueueRef('refs/heads/gh-readonly-queue/main/pr-123-abc')` → 123"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-check.cjs
      provides: "pure: parseClosingRefs, prNumberFromQueueRef, linkedIssue, planningConsistency, reconcilePlan, CONTEXTS"
  key_links:
    - "Called by 50-08's runner with data read from GitHub; the contexts named here are the ones 50-09's ruleset requires"
---

# TRD 50-03: the required-check logic (GEN-05, pure half)

<objective>
Define exactly what `devflow/linked-issue` and `devflow/planning-consistency` check, and what the merge-time reconcile closes, as pure
functions over plain data (PR, issues, config). No IO here: the runner (50-08) fetches and posts. This TRD settles research Open
Question 1.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(50-03): ...`), then implementation (`feat(50-03): ...`).
- `gh-check.cjs` requires nothing that spawns a process (no gh-client, no git). Only `gh-body.cjs` helpers for markers are allowed.
- Event fixtures are hand-written JSON trimmed to the fields used (`action`, `pull_request.{number,body,base.ref,head.sha,merged}`,
  `repository.{full_name,default_branch}`, `merge_group.{head_ref,head_sha,base_ref}`). No generated data.

## Decisions

- **CONTEXTS** = `{ linkedIssue: 'devflow/linked-issue', planningConsistency: 'devflow/planning-consistency' }` — the one source for the
  ruleset (50-09), the runner (50-08) and the workflow test (50-10).
- **Closing references** (`parseClosingRefs(body, repoFullName)`): keywords close/closes/closed/fix/fixes/fixed/resolve/resolves/resolved,
  case-insensitive, optional colon, followed by `#N`, `<owner>/<repo>#N` or `https://github.com/<owner>/<repo>/issues/N`. Only refs to
  THIS repo count (closing keywords only act on the default branch of the same repo for our purposes); others are reported, not counted.
  Text inside fenced code blocks and HTML comments is ignored.
- **linked-issue** = at least one counted closing ref resolving to an existing issue that is not a PR, AND `base.ref === default_branch`
  (closing keywords fire only on PRs to the default branch). `Refs #N` commit paragraphs are reported (`refs_seen`) but not required: a
  human PR has none, and the closing reference is what links the PR. Unresolvable refs (404) are failures, named.
- **planning-consistency** (Open Question 1). In store mode `.planning/` is not in git, so the check validates the GitHub graph, not
  files: (a) store mode is read from the PR head's tracked `.planning/config.json` (`github.store === true`); otherwise success
  "store mode off: planning files are reviewed in the diff" — the check still reports, so a required check never hangs; (b) no
  `<!-- devflow:pr=<id> -->` marker → success "not a DevFlow objective PR"; (c) for an objective PR: base is the default branch; the
  objective issue (the closing target whose body marker is `devflow:id=<id>`) is closed by the PR; every TRD issue linked under the
  objective (sub-issues, or the `trds` task list in degraded mode — supplied by the runner) is closed by the PR; no closing target is
  `state_reason: not_planned`. Each violation is one named line. The local `validate consistency` is not run in CI: it needs the cache.
- **reconcilePlan({pr, targets, linked})**: only when `pr.merged === true`; returns numbers of closing targets and linked TRD issues
  whose `state` is open, deduplicated, ascending. Project → Done is NOT done here: GitHub Projects' built-in "Item closed" workflow moves
  closed items, and the GITHUB_TOKEN cannot reach Projects v2 (proposal platform constraints). Local `gh pr reconcile` (49-12) still
  does the full reconcile including the cache.
- **Result shape** for both checks: `{state:'success'|'failure', description (≤140 chars), details:[string]}`; `description` is what
  the commit status shows.

## Test list

1. `parseClosingRefs('Closes #12\nfixes: #13\nResolved o/r#14', 'o/r')` → counted [12,13,14]; `x/y#5` → reported as foreign; a ref
   inside ``` fences or `<!-- -->` → ignored; `Refs #9` → not a closing ref.
2. linkedIssue: body without closing ref → failure "no closing reference"; base `dev` with default `main` → failure naming the base;
   `Closes #12` where #12 is an issue → success; where #12 is a PR (`pull_request` key) → failure; where #12 is missing → failure.
3. linkedIssue reports `refs_seen` from commit messages ending `Refs #N` but passes without them.
4. planningConsistency: config null / `store:false` → success (store off); no PR marker → success (not an objective PR).
5. Objective PR (marker `devflow:pr=50`), targets include objective issue (#100, body `<!-- devflow:id=50 -->`) and TRDs #101,#102,
   linked = {101,102} → success; drop #102 from closes → failure naming #102; objective issue missing → failure; #101 `not_planned` → failure.
6. reconcilePlan: merged PR, targets #100 closed, #101 open, linked {101,102 open} → [101,102]; unmerged → [].
7. `prNumberFromQueueRef` for `refs/heads/gh-readonly-queue/main/pr-123-abcdef` → 123; a plain branch → null.
8. Every fixture event file parses and the functions accept their shapes (load the four JSON files).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: closing refs and linked-issue (tests 1-3, 7)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-check.cjs, plugins/devflow/devflow/bin/lib/gh-check.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/gh-events/pull_request-closes.json, plugins/devflow/devflow/bin/lib/__fixtures__/gh-events/pull_request-no-closes.json, plugins/devflow/devflow/bin/lib/__fixtures__/gh-events/merge_group.json</files>
  <action>
RED: tests 1-3, 7 plus the three fixtures; commit `test(50-03): linked-issue check logic`.
GREEN: `CONTEXTS`, `parseClosingRefs`, `prNumberFromQueueRef`, `linkedIssue({pr, repo, defaultBranch, issues, commits})` where
`issues` is a `Map<number, issue|null>` the runner fills. Commit `feat(50-03): pure linked-issue check`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-check.test.cjs</verify>
  <done>Tests 1-3, 7 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: planning-consistency and reconcile plan (tests 4-6, 8)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-check.cjs, plugins/devflow/devflow/bin/lib/gh-check.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/gh-events/pull_request-merged.json</files>
  <action>
RED: tests 4-6, 8; commit `test(50-03): planning-consistency and reconcile plan`.
GREEN: `planningConsistency({pr, repo, defaultBranch, config, issues, linked})` using `gh-body.extractPrMarker` and `extractMarker`;
`reconcilePlan({pr, targets, linked})`. Put the Decisions bullets for planning-consistency in the module header verbatim enough that a
reader of the code knows why `.planning/` files are not consulted. Commit `feat(50-03): planning-consistency check and reconcile plan`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-check.test.cjs plugins/devflow/devflow/bin/lib/gh-body.test.cjs</verify>
  <done>Tests 4-6, 8 pass.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-body.cjs`: `PR_MARKER_SOURCE` L60 (`<!-- devflow:pr=<id> -->`), `extractPrMarker(body)` L122, `extractMarker(body)` L153 (`devflow:id=`),
  `extractSection(body, 'trds')` L567.
- `commit-trailer.cjs` — the `Refs #N` paragraph is the last paragraph of a message (`^Refs #\d+$`).
- `gh-hierarchy.cjs` `linkedNumbers` L633 shows how sub-issues fall back to the task list (the runner reuses it; this module takes the set).
</codebase_examples>
<anti_patterns>
- Requiring `Refs #N` on every commit (fails every human PR and every squash-only history).
- Reading `.planning/` files in the check (absent in store mode).
- Counting a closing keyword aimed at another repository.
</anti_patterns>
<error_recovery>
- If `gh-body` helpers pull in gh-client transitively, inline the two marker regexes instead and note it in the SUMMARY.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-check.test.cjs</test>
</validation_gates>

<verification>
- SC3's logic: a PR without a closing reference yields `state:'failure'` (test 2).
</verification>

<success_criteria>
Both required checks and the reconcile are fully specified, pure and fixture-tested.
</success_criteria>

<output>
After completion, create `.planning/objectives/50-github-enforcement-and-setup/50-03-SUMMARY.md`
</output>
