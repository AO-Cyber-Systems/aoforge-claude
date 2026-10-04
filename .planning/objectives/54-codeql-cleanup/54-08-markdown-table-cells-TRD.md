---
objective: 54-codeql-cleanup
trd: "08"
type: standard
wave: 2
depends_on: ["54-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/adopt.cjs
  - plugins/devflow/devflow/bin/lib/adopt-report.test.cjs
  - plugins/devflow/devflow/bin/lib/stack-report.cjs
  - plugins/devflow/devflow/bin/lib/stack-report.test.cjs
autonomous: true
requirements: ["54-B"]
codeql_alerts: [130, 131, 132, 133, 135]
must_haves:
  truths:
    - "ADOPT-REPORT.md tables escape every cell at render time with text-escape's mdCell (backslash, then pipe, then newlines), so each needs-review row has exactly 5 cells and each high-confidence row exactly 3, whatever the inference, note or finding text contains"
    - "The four per-site `.replace(/\\|/g, '\\\\|')` calls in adopt.cjs (alerts 130-133) are gone; values are escaped once, at render"
    - "Rows that were never escaped before (inference field/value/evidence at adopt.cjs:945-950, the literal `expected confidence: high|medium|low` evidence) now render as single cells"
    - "renderHighTable's delimiter row has three columns (`|---|---|---|`) to match its three-column header"
    - "STACK-REPORT.md's `cell` escapes backslash before pipe via mdCell and keeps its `—` placeholder for empty values (alert 135)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/adopt.cjs
      provides: "renderNeedsReviewTable / renderHighTable escape every cell with mdCell"
    - path: plugins/devflow/devflow/bin/lib/stack-report.cjs
      provides: "cell() = placeholder + mdCell"
  key_links:
    - "adopt.report -> renderNeedsReviewTable / renderHighTable -> mdCell -> .planning/ADOPT-REPORT.md"
    - "stack-report.renderReport -> cell -> mdCell -> .planning/STACK-REPORT.md"
---

# TRD 54-08: Markdown table cells in adopt and stack-report (group B)

<objective>
Escape markdown table cells correctly in the two report writers CodeQL flags (`js/incomplete-sanitization`: pipe escaped, backslash
not):

| Alert | Site |
|---|---|
| 130, 131 | adopt.cjs:979, :981 (stack draft-note rows: `item`, `evidence`) |
| 132, 133 | adopt.cjs:1024, :1025 (STACK-REPORT gap rows: `item`, `inferred`) |
| 135 | stack-report.cjs:1104 (`cell`) |

A value ending in a backslash, such as a Windows path `C:\tmp\` or a regex in a note, followed by the escaped pipe `\|`, renders as
`\\|`. GFM reads that as a literal backslash plus a real pipe, which splits the cell and shifts every column after it.

adopt.cjs has a bigger version of the same bug. It escapes pipes at four row-construction sites only, and its renderers
(`renderNeedsReviewTable` :821, `renderHighTable` :830) interpolate cells raw. So inference rows (:945-950: `entry.field`,
`entry.value`, `entry.evidence`) are not escaped at all, and the malformed-inference row's evidence is the literal
`expected confidence: high|medium|low` (:941), which today renders as three extra columns. Fix it at the render boundary: escape
every cell once in the two renderers and remove the per-site escapes, so nothing is escaped twice. `renderHighTable` also emits a
two-column delimiter `|---|---|` under a three-column header, so GFM does not render it as a table. Fix that in the same function.

Uses `mdCell` from `text-escape.cjs` (TRD 54-01).
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD per task: `test(54-08): ...` (failing) before `fix(54-08): ...`.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Hand-built fixtures (the existing `scaffoldedFixture` / marker helpers in adopt-report.test.cjs and the fixtures in
  stack-report.test.cjs). No generated data.
- Escape once. After this TRD, no value reaching `renderNeedsReviewTable`/`renderHighTable` may be pre-escaped.

## Test list

Outermost first: the `report` CLI output, then the render function.

Shared test helper (define in each test file): `cellsOf(row)` splits a markdown table row on pipes that are NOT escaped. Scan the
characters: on `\` skip the next character; on `|` close a cell. Drop the empty leading and trailing cells. Hand-written, no
library.

adopt-report.test.cjs (via `runAdopt(root, 'report')`, as in test 1 at :128):
1. An inference `{ field: 'kind', value: 'api|cli', confidence: 'low', evidence: 'C:\\tmp\\' }`: its needs-review row has exactly 5
   cells; the Inferred cell is `api\|cli`; the Evidence cell is `C:\\tmp\\` (each backslash doubled). Expected RED (inference rows
   are not escaped today).
2. A malformed-confidence inference (as in test 4 at :190): the `expected confidence: high|medium|low` row has exactly 5 cells.
   Expected RED.
3. A stack draft note `{ key: 'test', candidate: 'go test ./...', status: 'note', detail: 'path C:\\x\\| y', source: 'ci' }` (as in
   test 17 at :246): its row has exactly 5 cells and contains no unescaped pipe inside the Evidence cell. Expected RED (backslash
   not escaped before the pipe).
4. A high-confidence inference with value `a|b`: the high-confidence table row has exactly 3 cells, and the table's delimiter row
   is `|---|---|---|`. Expected RED.
5. Existing adopt-report tests (1-17) pass unchanged. If one asserted raw `|` text inside a cell, it encoded the bug: update it to
   the escaped form and say so.

stack-report.test.cjs (`require('./stack-report.cjs').renderReport(...)`, or `runCli` like :399):
6. A finding whose `finding` text is `a\|b` (backslash then pipe) renders a row with exactly 5 cells, and the Finding cell is
   `a\\\|b`. Expected RED.
7. A null/empty component still renders `(root)`, and other empty cells render `—`. (Guard.)
8. The existing table assertions at :249-251 and :399 pass unchanged.

<embedded_context>

<codebase_examples>
Renderers today (adopt.cjs:821-834):

```js
function renderNeedsReviewTable(rows) {
  if (rows.length === 0) {
    return 'Nothing needs review — every inference was high confidence.\n';
  }
  const lines = ['| # | Item | Inferred | Confidence | Evidence |', '|---|---|---|---|---|'];
  rows.forEach((r, i) => lines.push(`| ${i + 1} | ${r.item} | ${r.inferred} | ${r.confidence} | ${r.evidence} |`));
  return lines.join('\n') + '\n';
}

function renderHighTable(rows) {
  const lines = ['| Item | Value | Evidence |', '|---|---|'];
  for (const r of rows) lines.push(`| ${r.item} | ${r.value} | ${r.evidence} |`);
  return lines.join('\n') + '\n';
}
```

Target:

```js
const { mdCell } = require('./text-escape.cjs');
...
rows.forEach((r, i) => lines.push(`| ${i + 1} | ${mdCell(r.item)} | ${mdCell(r.inferred)} | ${mdCell(r.confidence)} | ${mdCell(r.evidence)} |`));
...
const lines = ['| Item | Value | Evidence |', '|---|---|---|'];
for (const r of rows) lines.push(`| ${mdCell(r.item)} | ${mdCell(r.value)} | ${mdCell(r.evidence)} |`);
```

Remove the per-site escapes (they would double-escape now):

```js
// adopt.cjs:979, :981
item: item.replace(/\|/g, '\\|'),                                             -> item,
evidence: String(n.detail || `stack init ${n.source || 'draft'}`).replace(/\|/g, '\\|'), -> evidence: String(n.detail || `stack init ${n.source || 'draft'}`),
// adopt.cjs:1024, :1025
item: `${f.id}: ${f.finding}`.replace(/\|/g, '\\|'),                          -> item: `${f.id}: ${f.finding}`,
inferred: proposal.replace(/\|/g, '\\|'),                                     -> inferred: proposal,
```

stack-report.cjs:1102-1105 today:

```js
function cell(value) {
  const s = value === null || value === undefined || value === '' ? '—' : String(value);
  return s.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}
```

Target (placeholder kept, escaping delegated):

```js
const { mdCell } = require('./text-escape.cjs');
function cell(value) {
  return value === null || value === undefined || value === '' ? '—' : mdCell(value);
}
```

Callers at :1118 and :1128 stay unchanged.
</codebase_examples>

<anti_patterns>
- Do not keep the per-site `.replace(/\|/g, '\\|')` AND add render-time escaping. `a|b` would become `a\\\|b` (a doubled backslash
  plus an escaped pipe), which renders as `a\|b`.
- Do not escape inside `adopt.report`'s JSON result. Only the markdown rendering changes. The `rows` data in any JSON payload keeps
  raw values.
- Do not escape the `#` index or the header and delimiter rows.
- Do not change stack-report's `—` placeholder or the `(root)` default at :1118.
</anti_patterns>

<error_recovery>
- If an e2e adopt test compares a whole ADOPT-REPORT.md snapshot, regenerate the expectation by hand for the changed rows only
  (escaped pipes, the 3-column delimiter) and confirm every other line is byte-identical.
- If test 3's note row is not where you expect, remember `MAX_STACK_NOTES` caps note rows. Keep the fixture to two notes.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: adopt.cjs escapes every table cell once, at render (alerts 130-133)</name>
  <files>plugins/devflow/devflow/bin/lib/adopt-report.test.cjs, plugins/devflow/devflow/bin/lib/adopt.cjs</files>
  <action>
RED: add the `cellsOf` helper and test-list items 1-4 to adopt-report.test.cjs. All four fail today. Commit
`test(54-08): failing tests for pipes and backslashes in ADOPT-REPORT tables`.

GREEN in adopt.cjs: import mdCell; apply it to every data cell in `renderNeedsReviewTable` and `renderHighTable`; fix the
`renderHighTable` delimiter to `|---|---|---|`; remove the four per-site `.replace(/\|/g, '\\|')` calls at :979, :981, :1024, :1025.
Then run the whole adopt suite (item 5). Commit
`fix(54-08): escape ADOPT-REPORT table cells once at render with mdCell; three-column delimiter for the high table`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/adopt-report.test.cjs plugins/devflow/devflow/bin/lib/adopt-e2e.test.cjs plugins/devflow/devflow/bin/lib/adopt-scaffold.test.cjs plugins/devflow/devflow/bin/lib/adopt-preflight.test.cjs</verify>
  <done>Items 1-5 pass. `rg -n "replace\(/\\\\\|/g" plugins/devflow/devflow/bin/lib/adopt.cjs` prints nothing.</done>
  <recovery>If adopt-e2e fails on a row text match, check whether it asserted an unescaped value that contains `|` or `\`; that expectation encoded the bug.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: stack-report cell escapes backslash before pipe via mdCell (alert 135)</name>
  <files>plugins/devflow/devflow/bin/lib/stack-report.test.cjs, plugins/devflow/devflow/bin/lib/stack-report.cjs</files>
  <action>
RED: add `cellsOf` and test-list items 6-7 to stack-report.test.cjs. Item 6 fails today. Commit
`test(54-08): failing test for backslash-pipe in STACK-REPORT cells`.

GREEN: replace `cell` in stack-report.cjs with the placeholder + mdCell form. Commit
`fix(54-08): escape STACK-REPORT cells with the shared mdCell`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/stack-report.test.cjs plugins/devflow/devflow/bin/lib/adopt-report.test.cjs</verify>
  <done>Items 6-8 pass. `rg -n "replace\(/\\\\\|/g" plugins/devflow/devflow/bin/lib/stack-report.cjs` prints nothing.</done>
  <recovery>If a stack-report test passes a non-string evidence join, `mdCell` coerces with String(); the output is identical for strings.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- Both task verify commands pass.
- `rg -n "replace\(/\\\\\|/g" plugins/devflow/devflow/bin/lib/{adopt,stack-report}.cjs` prints nothing.
- In a scratch copy of a fixture, `df-tools adopt report` writes an ADOPT-REPORT.md in which every row in each table has the same
  cell count as the header (check with the `cellsOf` logic in a `node -e` one-off).
</verification>

<success_criteria>
Both report writers escape table cells through one helper, once, backslash first. ADOPT-REPORT and STACK-REPORT tables keep their
column structure for any input. Alerts 130-133 and 135 have no remaining source pattern.
</success_criteria>

<output>
After completion, create `.planning/objectives/54-codeql-cleanup/54-08-SUMMARY.md` via `df-tools summary post`.
</output>
