---
objective: 71-stack-drafter-and-verify-policy
trd: "02"
type: standard
wave: 2
depends_on: ["71-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/stack-drift-compare.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs
  - plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs
autonomous: true
requirements: [SDR-09]
must_haves:
  truths:
    - "`ACCEPTED` in stack-fleet-tables.cjs no longer holds `aodex.audit`; the harness's pinned `ACCEPTED_ROWS` list matches (12 rows), and every other ACCEPTED row is byte-identical"
    - "`OPEN` holds one `pending: 'refresh'` entry each for `justinforme` `lint` and `smartWellness` `lint` (draft `make lint` against the committed file's inherited `go vet ./...`), plus any row 71-01's fleet check classified the same way, and nothing else"
    - "The harness reports a `pending: 'refresh'` OPEN row as refresh-pending (diagnostic, never a failure) while it drifts, and fails it with `remove it from OPEN` once it stops drifting (the existing ratchet), so if the declared-linters rule regresses the two lint rows fail"
    - "Per fleet repo, the harness fails when a drafted command carries a self-test argument while the draft's evidence holds a same-key item that runs the same entry point without one (`selfTestDrafts`), so a regression of the self-test rule on aodex fails"
    - "`selfTestDrafts` and the refresh-pending classification are covered by synthetic tests that run without any fleet repo"
    - "`node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs` passes against `~/dev` (33 repo tests, the table guards, the synthetic tests), and every fleet repo's HEAD and work tree are unchanged"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/stack-drift-compare.cjs
      provides: "selfTestDrafts({ commands, evidence }) -> [{ key, run, gate }], pure, written independently of stack-draft.cjs"
      exports: ["selfTestDrafts"]
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs
      provides: "ACCEPTED without aodex.audit; OPEN refresh-pending rows; header documents `pending: 'refresh'`"
      contains: "pending: 'refresh'"
    - path: plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs
      provides: "assess() refresh-pending diagnostics; per-repo self-test guard; OPEN `pending` table guard; synthetic tests"
      contains: "selfTestDrafts"
  key_links:
    - from: "stack-drafter-fleet.test.cjs per-repo test"
      to: "stack-drift-compare.cjs selfTestDrafts"
      via: "stackInit returns the init JSON's evidence beside the frontmatter"
      pattern: "selfTestDrafts\\("
    - from: "stack-drafter-fleet.test.cjs assess"
      to: "stack-fleet-tables.cjs OPEN[repo][].pending"
      via: "refresh-pending note text; ratchet unchanged"
      pattern: "pending"
---

# TRD 71-02: Fleet tables record what the new rules closed, and the harness guards both rules (SDR-09)

<objective>
TRD 71-01 changed two drafts in the real fleet. aodex `audit` is now the govulncheck gate step, so the ACCEPTED row that
excused the self-test pick (`aodex.audit`, more-specific, user decision 2026-10-03) describes a draft that no longer
exists: remove it. justinforme and smartWellness `lint` now draft `make lint` (go vet plus buf lint), while their
committed STACK.md files inherit `go vet ./...`. The drafter is right and the committed files are stale; refreshing them
is a commit in each of those repos, which needs the user (43-ROLLOUT option (c): "until then the row is OPEN"). Record
both as OPEN `pending: 'refresh'` rows.

"The fleet harness guards them" (success criterion 2): removing a more-specific row from ACCEPTED guards nothing,
because the harness only reports more-specific rows. So add a per-repo self-test guard (fails if any fleet draft fills a
key with a self-test while its gate is in the evidence), and rely on the OPEN ratchet for the two lint rows (if the
declared-linters rule regresses, those rows stop drifting and fail with "remove it from OPEN"). Success criterion 2,
second clause.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
Project kind `plugin`, work `feature`: TDD strict (RED, GREEN, optional REFACTOR as atomic commits per task), test
list first, hand-built fixtures, no property-based libraries, no `.feature` files. User playbook: failing test first,
one test at a time.

Read first: `.planning/objectives/71-stack-drafter-and-verify-policy/71-01-SUMMARY.md` `## Fleet read-only check`. Its
list of new harness problems is the input to Task 2. Planning expected exactly the justinforme and smartWellness lint
conflicts.

Read narrowly:
- `__fixtures__/stack-fleet-tables.cjs` (148 lines): header 1-31 (the table contract; `OPEN rows keep the objective at
  gaps_found for the verifier` is the sentence to amend); `ACCEPTED.aodex` 79-95 (the `audit` entry 80-86 goes; the
  `lint` entry stays); `OPEN = {}` 138-140.
- `stack-drafter-fleet.test.cjs` (322 lines): header test list 12-22; `stackInit` 82-99 (returns `{ ok, fm }`; the init
  JSON also has `evidence` and `notes`); `assess` 105-152; per-repo test 162-206; `ACCEPTED_ROWS` 218-221; the OPEN
  guard 247-268; synthetic `assess` tests 270-322.
- `__fixtures__/stack-drift-compare.cjs` (124 lines): pure, no fs; `formatRow`; exports 124.
- The fleet: `~/dev/<repo>` for the 33 FLEET repos. Read-only. `DEVFLOW_FLEET_ROOT` overrides the root.
</context>

## Test list

Outermost first: the real-fleet per-repo tests, then the table guards, then the synthetic (pure) tests.

**Real fleet (Task 2)**
1. aodex: no `new conflict`; `audit` is reported as a more-specific note (draft `bash scripts/check-govulncheck.sh`
   (cwd go) vs committed `discover`); `selfTestDrafts` returns `[]`.
2. justinforme and smartWellness: the `lint` conflict is tolerated as OPEN refresh-pending (a diagnostic naming
   `refresh`), not a problem.
3. dfip: lint still matches (no row).
4. Every repo: HEAD and `git status --porcelain=v1 -uall` unchanged (existing check 14).

**Table guards (Task 2)**
5. `ACCEPTED_ROWS` equals the 12 remaining rows (`aodex.audit` gone, `aodex.lint` kept).
6. Every OPEN entry with a `pending` field has `pending === 'refresh'`; a refresh entry's `reason` names both the
   draft and the committed value (contains `draft` and `committed`).
7. The module still exports exactly FLEET, ACCEPTED and OPEN.

**Synthetic (Task 1)**
8. `selfTestDrafts`: drafted `audit: { run: 'bash scripts/gate.sh --self-test', cwd: 'go' }` with an evidence item
   `{ key: 'audit', command: 'bash scripts/gate.sh', cwd: 'go' }` -> one finding `{ key: 'audit', run: …, gate:
   'bash scripts/gate.sh' }`.
9. The same draft with no gate item in the evidence -> `[]` (a lone self-test is allowed).
10. A gate item at another cwd, or for another key -> `[]`.
11. Markers `--selftest`, `--self-test=x`, `--selftest-no-divergence`, bare `selftest` after the script -> found;
    `bash t0/selftest.sh` (the script name) and `make selftest` (a target) -> not a self-test.
12. A drafted entry as a bare string, a `discover` / `none` run, and a missing `commands` -> `[]`, never a throw.
13. `assess` with OPEN `{ keys: ['lint'], pending: 'refresh', reason }` and a lint conflict row -> no problem; one note
    containing `refresh pending`.
14. The same OPEN entry with no row -> problem `r.lint no longer drifts: remove it from OPEN` (ratchet unchanged).

<embedded_context>

<codebase_examples>
`assess` today (stack-drafter-fleet.test.cjs 121-152), the OPEN branch to extend:
```js
const acc = acceptedEntries.find((entry) => entry.kind === row.kind && entry.keys.includes(row.key));
if (acc) {
  notes.push(`${repo}: accepted by ${acc.by} ${acc.decided} (${row.kind}): ${formatRow(row)}`);
} else if (openEntries.some((entry) => entry.keys.includes(row.key))) {
  notes.push(`${repo}: OPEN (${row.kind}): ${formatRow(row)}`);
} else if (row.kind === 'conflict') {
  problems.push(`new conflict: ${formatRow(row)}`);
}
…
for (const key of openEntries.flatMap((entry) => entry.keys)) {
  if (!drifting.has(key)) problems.push(`${repo}.${key} no longer drifts: remove it from OPEN`);
}
```

An ACCEPTED entry's shape (the aodex `lint` entry that stays):
```js
{
  keys: ['lint'],
  kind: 'more_specific',
  reason: 'draft `golangci-lint run ./...` (cwd go), from the CI golangci action with working-directory go, vs committed `discover`',
  decided: DECIDED,
  by: 'user',
},
```

The OPEN entry shape this TRD adds:
```js
const OPEN = {
  justinforme: [
    {
      keys: ['lint'],
      pending: 'refresh',
      reason: 'TRD 71-01 (SDR-09): the draft `make lint` runs go vet AND buf lint; the committed file (reviewed 2026-09-29) '
        + 'inherits `go vet ./...`. The drafter is right; refreshing the committed file is a commit in justinforme and needs the user',
    },
  ],
  smartWellness: [ /* same shape */ ],
};
```
</codebase_examples>

<anti_patterns>
- Do not add anything to ACCEPTED. It grows only by a user decision, and this TRD has none. Removing a row a rule
  closed is allowed (the todo and success criterion 2 say so).
- Do not commit into, write into, or run `stack init --write` / `stack verify --run` in any fleet repo. The harness is
  read-only and asserts it.
- Do not import stack-draft.cjs into the guard. `selfTestDrafts` reads the draft and the evidence with its own small
  marker test, so a broken drafter predicate cannot hide its own regression.
- Do not add a third exported table (the harness pins exactly FLEET, ACCEPTED and OPEN).
- Do not relax `assess`: a refresh-pending row is tolerated only while it drifts, exactly like any OPEN row.
</anti_patterns>

<error_recovery>
- The fleet harness shows a problem 71-01 did not record: re-read that repo's draft with
  `node plugins/devflow/devflow/bin/df-tools.cjs --cwd ~/dev/<repo> stack init` (read-only). If a 71-01 rule is wrong
  there, stop: report it as a 71-01 gap in the SUMMARY (this TRD does not edit stack-draft.cjs). If the repo moved
  since 71-01 (its HEAD changed), record it and treat the row on its merits.
- `stackInit` output arrives as `@file:<path>`: `parseInitOutput` already handles it; keep using it for the evidence.
- A fleet repo is missing locally: the harness skips it per repo; record which.
</error_recovery>

</embedded_context>

<gotchas>
- The fleet harness takes a minute or two (33 `stack init` runs). It skips entirely under
  `DEVFLOW_SKIP_FLEET_HARNESS=1` or when fewer than half the repos are under the fleet root, so run it WITHOUT the
  escape to get real evidence.
- After this TRD the harness is green again; the full suite no longer needs `DEVFLOW_SKIP_FLEET_HARNESS=1`.
- `formatRow` renders `(cwd go)`; keep refresh reasons in the same wording style as existing reasons.
- `micro.test.cjs` hangs on commit signing: use the `!(micro)` form from the 71-01 gotchas if it does.
- Never use port 8080. Commit with `df-tools commit`, never raw `git commit`.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: `selfTestDrafts` guard and refresh-pending OPEN rows, on synthetic data</name>
  <files>plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/stack-drift-compare.cjs</files>
  <action>
RED (cases 8-14): in stack-drafter-fleet.test.cjs add `describe('selfTestDrafts: a drafted self-test beside its gate
(TRD 71-01 guard)')` and extend `describe('assess: …')` with cases 13-14. Import `selfTestDrafts` from
stack-drift-compare.cjs. Run: they fail (`selfTestDrafts` is not exported; the refresh note text is absent). Commit RED.

GREEN, stack-drift-compare.cjs (stays pure, no require):
```js
// A self-test argument (TRD 71-02, guarding TRD 71-01's rule). Written here on purpose, not imported from stack-draft:
// the guard must not share the drafter's predicate.
const SELF_TEST_WORD = /^(?:--?self-?test(?:[-=].*)?|self-?test)$/i;

/**
 * selfTestDrafts({ commands, evidence }) -> [{ key, run, gate }]
 * A drafted own command whose run passes a self-test argument (any word after the program, and after the script when
 * the program is bash|sh|zsh|dash, that is not the item's target name) while `evidence` holds an item for the same key,
 * at the same cwd (null and '' are the root), whose command equals the drafted run with those words removed
 * (whitespace squashed). Never throws.
 */
function selfTestDrafts({ commands = {}, evidence = [] } = {}) { … }
```
Export it beside `compareDrift`. In the harness `assess`, when the matching OPEN entry has `pending === 'refresh'`, push
`${repo}: OPEN, refresh pending (${row.kind}): ${formatRow(row)}` instead of the plain OPEN note. Update the header
test list (add `17 self-test guard` and the refresh wording). Commit GREEN.
  </action>
  <verify>
DEVFLOW_SKIP_FLEET_HARNESS=1 node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs plugins/devflow/devflow/bin/lib/stack-drafter-realshape.test.cjs
  </verify>
  <done>Cases 8-14 pass with the fleet skipped; the realshape suite (which also imports stack-drift-compare.cjs) passes
unchanged.</done>
  <recovery>If the realshape suite breaks, an existing export of stack-drift-compare.cjs changed: restore it and add
only the new function.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Tables updated, per-repo self-test guard wired, real-fleet run green</name>
  <files>plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs</files>
  <action>
RED (cases 1-7): in the harness, drop `'aodex.audit'` from `ACCEPTED_ROWS`; extend the OPEN guard test with case 6;
change `stackInit` to return `{ ok, fm, evidence }` (from the same parsed JSON) and, in the per-repo test after the
`problems` assert, add
`assert.deepEqual(selfTestDrafts({ commands: draft.commands, evidence: init.evidence }), [], `${repo}: a drafted self-test sits beside its gate`)`.
Run the harness against `~/dev`: the ACCEPTED pin fails (aodex.audit still in the table) and justinforme /
smartWellness fail on `new conflict: lint`. Commit RED.

GREEN, stack-fleet-tables.cjs:
1. Delete the `aodex` `audit` entry (keep the `lint` entry and its comment block).
2. `OPEN`: one `pending: 'refresh'` entry for justinforme `lint` and one for smartWellness `lint`, each with a reason
   naming the draft (`make lint`, go vet + buf lint) and the committed value (inherited `go vet ./...`) and "a commit in
   <repo>, needs the user". Add any further row only if 71-01's SUMMARY classified it as "draft is the better entry
   point"; a row 71-01 called a rule error is not tabled (it is a 71-01 gap: report it).
3. Header: in the OPEN paragraph add that an entry may carry `pending: 'refresh'` ("a drafter rule closed the gap and
   the repo's committed STACK.md predates it; refreshing that file is a commit in the repo and needs the user, tracked
   as a todo"), that such rows are follow-ups and not drafter gaps, and that the ratchet still applies. Replace the
   `Nothing is OPEN` comment above `const OPEN` with one naming the 71-02 rows. Mention that `aodex.audit` left ACCEPTED
   in 71-02 because TRD 71-01's self-test rule drafts the gate.

Run `node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs` (no skip): all pass. Capture the
diagnostics for aodex, justinforme and smartWellness (`--test-reporter=spec` shows them) for the SUMMARY. Commit GREEN.
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs
  </verify>
  <done>The harness passes against `~/dev` (no `skipped` reason at the describe level), with aodex `audit` as a
more-specific note, justinforme and smartWellness `lint` as refresh-pending notes, and no fleet work tree changed. The
full suite (no fleet escape) shows no failure outside the 70-03 baseline.</done>
  <recovery>If a repo shows a problem not in 71-01's list, follow error_recovery; never add it to ACCEPTED. Revert the
table with `git checkout -- plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs` to retry.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test {files}   (scoped; each task's verify line)</test>
<test>npm test   (full suite before the last commit, fleet harness included; micro exclusion form if signing prompts)</test>
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs` passes against `~/dev`.
- `rg -n "aodex" plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs` shows the `lint` entry only (plus
  FLEET and the header mention).
- `rg -n "pending: 'refresh'" plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs` hits the justinforme
  and smartWellness entries.
- `rg -n "selfTestDrafts" plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs` hits the per-repo guard and the
  synthetic tests.
</verification>

<success_criteria>
- `aodex.audit` is removed from ACCEPTED, and the harness fails if any fleet draft picks a self-test beside its gate
  (SC-2, second clause, self-test rule).
- justinforme and smartWellness `lint` are OPEN refresh-pending rows that the ratchet holds to the declared-linters
  rule (SC-2, second clause, buf lint rule).
- The real-fleet harness is green and read-only.
</success_criteria>

<output>
After completion, create `.planning/objectives/71-stack-drafter-and-verify-policy/71-02-SUMMARY.md` through
`df-tools summary post`. Include the harness diagnostics for aodex, justinforme and smartWellness, and note that the
committed-file refresh for the two lint rows is a follow-up for TRD 71-05's todo.
</output>
