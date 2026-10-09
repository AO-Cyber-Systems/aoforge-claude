---
objective: 46-github-sync-foundations
trd: "09"
type: standard
wave: 5
depends_on: ["46-06", "46-08"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
autonomous: true
requirements: [GSF-01, GSF-02, GSF-06, GSF-08]
must_haves:
  truths:
    - "After `gh sync --all`, `sync`, `comment`, `close-issue` and `pull` all resolve the same issue for each objective, and pull finds push's baseline (success criterion 1)"
    - "Deleting `.gh-mapping.json` and `.gh-sync-state.json` and re-running `gh sync --all` leaves exactly the same issues in the fake store: zero `issue create` calls (success criterion 2)"
    - "A human edit outside managed sections survives two consecutive syncs byte-for-byte (success criterion 3)"
    - "A 403 secondary-limit response injected mid-run is retried after `retry-after`, and all writes in the run are >= 1000 ms apart on the fake clock (success criterion 4)"
    - "For v1 and v2 legacy mapping files, each command hits the right issue and no argv contains `[object Object]`"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs
      provides: "end-to-end push → pull scenario on one stateful fake GitHub, legacy-shape matrix"
  key_links:
    - "One `gh._setRunGh(fake.runGh)` call drives gh.cjs, gh-pull.cjs and every gh-* module through the gh-client seam"
---

# TRD 46-09: End-to-end push → pull on one fake GitHub (success criteria 1-4)

<objective>
Prove the objective's success criteria as one scenario against the stateful fake GitHub: push with
`sync --all`, act with `comment`/`close-issue`, read back with `pull`, lose the mapping, edit the issue
as a human, and hit a secondary rate limit. Plus the legacy mapping-shape × command matrix. Test-only
TRD: production code changes only if the scenario exposes a defect (then RED test first, fix, and
record it in the SUMMARY with the file touched — expected: none).

Output: `gh-e2e.test.cjs` (and fake extensions if an argv shape is missing).
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD applies to any production fix this scenario forces: failing test committed first. Commit via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- The fake is installed ONLY via `gh._setRunGh(fake.runGh)` (proves the single seam). Fake clock/sleep via `gh-client._setNow/_setSleep`. `HOME` and `DEVFLOW_GH_CACHE_DIR` → temp dirs. No real GitHub, never port 8080.
- Hand-built temp project; no generated data; no property-based tests; no `.feature` files.
- Research reference: `46-RESEARCH.md` → "End-to-end push -> pull (success criterion 1)", "Validation Architecture".

<embedded_context>

<codebase_examples>
Entry points (after 46-08): `gh.cmdGhSync(root, ['--all'], raw)`, `gh.cmdGhSync(root, ['02-a'], raw)`, `gh.cmdGhComment(root, ['2', 'hi'], ..)` (use whichever call shape 46-08 settled on — read its SUMMARY), `gh.cmdGhCloseIssue(root, '2', 'Verified', raw)`,
`require('./gh-pull.cjs').cmdGhPull(root, ['02-a'], raw)` and `(root, ['2', '--apply'], raw)`.
Capture output/exit by monkey-patching `process.stdout.write`, `process.stderr.write`, `process.exit` (pattern: gh.test.cjs ~1208-1239, D3).
Fake: `createFakeGitHub({repo:'o/r'})` → `issues`, `calls()`, `writes()`, `failNext(match, response)`, `humanEditBody(n, body)`.
</codebase_examples>

<anti_patterns>
- Separate fakes for push and pull (defeats criterion 1).
- Asserting on exact JSON payloads beyond the fields the criteria name (brittle).
- Real sleeping for the rate-limit step.
</anti_patterns>

<error_recovery>
- If pull needs an argv shape the fake lacks, extend the fake (it is in this TRD's files); never special-case the test.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/46-github-sync-foundations/OBJECTIVE.md
@.planning/objectives/46-github-sync-foundations/46-08-SUMMARY.md
</context>

## Test list (`gh-e2e.test.cjs`; temp project with config `github:{enabled:true, repo:'o/r'}`, ROADMAP with `## Milestones` (v1.4 🚧), objectives `02-a`, `02.1-b` each with OBJECTIVE.md, one TRD, no SUMMARY)

1. **Push:** `sync --all` → fake has issues #1 (`devflow:id=2`) and #2 (`devflow:id=2.1`); mapping v3 keys `"2"`, `"2.1"`; both OBJECTIVE.md files carry `github_issue`; sync-state keys `"2"`, `"2.1"`.
2. **Same issue everywhere (SC1):** `comment 2 hi` → #1; `comment 02.1-b hi` → #2; `pull 02-a` and `pull 2` → both `issue view 1`, report no drift and no `first_sync`; `close-issue 2 Verified` → closes #1.
3. **Drift round trip:** fake adds a label to #2 → `pull 2.1` reports drift; `pull 2.1 --apply` writes it to `02.1-b/OBJECTIVE.md`.
4. **Lost mapping (SC2):** delete `.gh-mapping.json` and `.gh-sync-state.json`; `sync --all` → `fake.issues` count still 2; `writes()` since the delete contain no `issue create`; mapping rebuilt with the same numbers.
5. **Lost mapping + lost frontmatter ref:** also remove `github_issue` from both OBJECTIVE.md files → still zero creates (marker scan), frontmatter restored.
6. **Human edit (SC3):** `humanEditBody(1, <current body with a paragraph inserted above, between criteria/trds, and below>)`; add a SUMMARY for `02-a`; `sync --all` twice → paragraphs byte-identical; summary/trds sections reflect the new SUMMARY; the second run has no `issue edit` for #1.
7. **Rate limit (SC4):** `failNext` on the next `issue edit` with `{ok:false, status:1, stderr:'HTTP 403: You have exceeded a secondary rate limit', stdout:'retry-after: 3'}`; change state; `sync 2` → recorded sleep includes 3000 ms before the retry; sync ok; all write timestamps ≥ 1000 ms apart.
8. **Legacy matrix:** for each legacy mapping `{v1: {"objectives":{"2":1,"2.1":2}}, v2: {"milestone_id":null,"objectives":{"2":{"issue_id":1,"state_comment_id":null},"2.1":{"issue_id":2,"state_comment_id":null}}}}` seeded over a fake that already holds #1/#2 (unmarked legacy bodies):
   × each command (`sync 2`, `comment 2 x`, `close-issue 2`, `pull 2`) → the right issue number is used; no argv element contains `[object Object]`; after `sync 2` the mapping file is v3.
9. **Disabled:** flip `enabled:false` → `sync --all`, `comment`, `pull` all `skipped`, exit 0, zero new fake calls.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Push, same-issue, drift and lost-mapping scenarios (tests 1-5)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs</files>
  <action>
Write tests 1-5 as one ordered `describe` with shared state (node:test runs `test` blocks in a `describe` sequentially). Build the temp project with a local
`makeProject()` factory in the test file. Run them. If any fails because of a production defect, stop, keep the failing test committed (RED), fix the
smallest production surface (record file + reason in SUMMARY), then GREEN. If all pass on first run, commit as `test(46-09): e2e push/pull and lost-mapping scenarios`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs</verify>
  <done>Tests 1-5 green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Human edit, rate limit, legacy matrix, disabled (tests 6-9)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs</files>
  <action>
Same procedure as Task 1 for tests 6-9. The matrix (test 8) is a loop generating one `test()` per (shape, command) with a fresh temp project and fake each.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs</verify>
  <done>Tests 1-9 green; SUMMARY maps each test to success criteria 1-4.</done>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs</test>
</validation_gates>

<verification>
- Test names mention `SC1`..`SC4` so the verifier can map them.
- `rg -n "setRunGh" plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs` shows only `gh._setRunGh` (plus the reset).
</verification>

<success_criteria>
Success criteria 1-4 of objective 46 are each demonstrated by a named, passing end-to-end test.
</success_criteria>

<output>
After completion, create `.planning/objectives/46-github-sync-foundations/46-09-SUMMARY.md`
</output>
