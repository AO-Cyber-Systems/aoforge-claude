---
objective: 54-codeql-cleanup
trd: "06"
type: standard
wave: 2
depends_on: ["54-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/objective.cjs
  - plugins/devflow/devflow/bin/lib/objective.test.cjs
  - plugins/devflow/devflow/bin/lib/roadmap.cjs
  - plugins/devflow/devflow/bin/lib/roadmap.test.cjs
  - plugins/devflow/devflow/bin/lib/workstreams.cjs
  - plugins/devflow/devflow/bin/lib/workstreams.test.cjs
autonomous: true
requirements: ["54-A"]
codeql_alerts: [87, 76, 77, 78, 79, 82, 84, 65, 85, 66, 68, 74]
must_haves:
  truths:
    - "Every RegExp in objective.cjs, roadmap.cjs and workstreams.cjs that interpolates an objective number builds it with text-escape's objectiveNumPattern (or escapeRegExp where a boundary already follows); no `.replace('.', '\\\\.')` or `.replace(/\\./g, '\\\\.')` escaping is left in these files"
    - "`roadmap analyze` reports objective 1 as not checked when the ROADMAP checklist lists a checked Objective 12 above an unchecked Objective 1 (roadmap.cjs:281 had no trailing boundary)"
    - "`workstreams analyze` does not take Objective 12's checkbox as Objective 1's (workstreams.cjs:48)"
    - "`objective complete 2` marks only objective 2's requirement IDs in REQUIREMENTS.md, reading the Requirements line from objective 2's own section, not from the first `**Requirements:**` after any mention of `Objective 2`"
    - "`objective complete N` does not throw when the objective's Requirements line is free text with regex metacharacters (e.g. `none (tech debt; see OBJECTIVE.md)`); each requirement ID is escaped before it is compiled"
    - "Decimal objectives: removing or completing 4.1 never touches 4.10 or 4.1.2 rows, checkboxes or sections"
    - "objective.cjs's local escapeRegExp copy is gone; it imports text-escape.cjs"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/workstreams.test.cjs
      provides: "regression tests for workstreams checkbox matching"
  key_links:
    - "objective.cjs / roadmap.cjs / workstreams.cjs -> require('./text-escape.cjs') {escapeRegExp, objectiveNumPattern}"
---

# TRD 54-06: Objective-number regexes in objective.cjs, roadmap.cjs and workstreams.cjs (group A, part 1 of 2)

<objective>
Route every objective-number RegExp in the three ROADMAP-editing modules through `text-escape.cjs` (TRD 54-01), and fix the
matching bugs that missing escapes and missing trailing boundaries cause.

CodeQL alerts (post-merge scan of main, 2f0ed83b):

| Alert | Rule | Site |
|---|---|---|
| 87 | incomplete-sanitization | objective.cjs:742 (`targetObjective.replace(/\./g, '\\.')`, cmdObjectiveRemove) |
| 76, 77, 78 | regex-injection | objective.cjs:744 (section), :750 (checkbox), :754 (table row) |
| 79 | regex-injection | objective.cjs:876 (cmdObjectiveComplete checkbox, `.replace('.', ...)` first dot only) |
| 82 | regex-injection | objective.cjs:904 (Requirements lookup) |
| 84, 65 | incomplete-sanitization, regex-injection | roadmap.cjs:105-106 (getRoadmapObjectiveInternal header) |
| 85, 66, 68 | incomplete-sanitization, regex-injection | roadmap.cjs:146, :150, :158 (cmdRoadmapGetObjective header + checklist fallback) |
| 74 | regex-injection | roadmap.cjs:399 (cmdRoadmapUpdateJobProgress checkbox; escaped at :380 with first-dot `.replace`) |

The same bug class exists at sites CodeQL did not flag. They are in scope because OBJECTIVE.md asks for "one shared `escapeRegExp`
at every interpolation site":

- `objective.cjs:883` assigns an `objectiveEscaped` that is never used (dead). Delete it.
- `objective.cjs:914` and `:919` compile `reqId` (read from ROADMAP) unescaped. The planner reproduced a crash: a Requirements line
  such as `none (security/correctness tech debt; see \`...OBJECTIVE.md\`)` (objective 54's own line) makes `new RegExp` throw
  `Unterminated group`. Any project with a REQUIREMENTS.md and a free-text Requirements line crashes `objective complete`.
- `roadmap.cjs:281` (cmdRoadmapAnalyze checkbox) has no trailing boundary. `Objective\s+1` matches `Objective 12`.
- `workstreams.cjs:48, :357, :363, :397` use first-dot `.replace('.', '\\.')`, and `:48`/`:357` have no trailing boundary.
- `objective.cjs:904`'s `Objective\s+N[\s\S]*?\*\*Requirements:\*\*` starts at the first mention of `Objective N` (usually the
  checklist line at the top), so it lazily captures the first `**Requirements:**` after it, which belongs to whichever section
  follows. Anchor it to objective N's own section.

Output: three modules on the shared helper, with RED-first regression tests for each real matching bug.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: `test(54-06): ...` (failing) before each `fix(54-06): ...`. A test written for a suspected bug that passes on
  unmodified code stays as a regression guard; say so in the commit message and the SUMMARY. Do not drop it.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Hand-built ROADMAP/REQUIREMENTS fixtures inline in the tests. No generated data, no property-based tests.
- Leave the `0*` leading-zero handling at objective.cjs:1024/:1088 unchanged. Those sites already use escapeRegExp; only switch
  their import.
- `roadmap-progress.cjs` is TRD 54-01's. Do not edit it here, even though updateJobsLine's `(?:[.:]|\s|$)` lets `4` match a
  `4.1` header; that is noted for a follow-up, not fixed in this objective.

## Test list

Outermost first (CLI via `run([...], cwd)` / spawnSync of df-tools, matching each file's existing harness).

roadmap.test.cjs:
1. `roadmap analyze --raw` on a ROADMAP whose checklist has `- [x] **Objective 12: Done**` ABOVE `- [ ] **Objective 1: Todo**`
   (sections `### Objective 1: Todo`, `### Objective 12: Done`): objective 1's `roadmap_complete` is `false`. Expected RED (:281).
2. `roadmap get-objective 4.1 --raw` with sections `### Objective 4.10: Ten` (first) and `### Objective 4.1: One`: name is `One`.
   (Boundary already present via `:`; regression guard.)
3. `roadmap update-job-progress 4.1` with checklist lines for 4.10 (first) and 4.1, objective 4.1 complete on disk: only the 4.1
   checkbox flips. (Regression guard; the `[:\s]` boundary exists today.)

objective.test.cjs:
4. `objective complete 2` with REQUIREMENTS.md (`- [ ] **R-1**`, `- [ ] **R-2**`, traceability rows Pending) and a ROADMAP with a
   checklist naming Objectives 1 and 2 ABOVE `### Objective 1:` (`**Requirements:** R-1`) and `### Objective 2:`
   (`**Requirements:** R-2`): R-2 becomes `[x]`/Complete and R-1 stays `[ ]`/Pending. Expected RED (:904).
5. `objective complete 1` where objective 1's section has `**Requirements:** none (tech debt; see OBJECTIVE.md)` and REQUIREMENTS.md
   exists: exit 0, REQUIREMENTS.md unchanged. Expected RED (throws at :914).
6. `objective remove 4.1` with sections/checklist/table rows for 4.1, 4.10 and 4.1.2 present: only 4.1's section, checkbox and row
   are removed; 4.10 and 4.1.2 survive. (Regression guard. Follow the existing remove tests' fixture for decimal objectives.)
7. `objective complete 4.1` with checklist lines for `4.1.2` (first) and `4.1`: only 4.1's checkbox gets `[x]`. (Regression guard.
   The `[:\s]` after the number already rejects `4.1.2`; the test pins it across the helper swap.)

workstreams.test.cjs (new file; spawn `df-tools --cwd <tmp> workstreams analyze --raw`, using the fixture shape of
df-tools.test.cjs:3005-3110 for the ROADMAP):
8. Checklist `- [x] Objective 12: Done` above `- [ ] Objective 1: Todo`: objective 1 is not complete in the analyze output.
   Expected RED (:48).
9. Decimal: `- [x] Objective 4.10` above `- [ ] Objective 4.1`: objective 4.1 not complete.

<embedded_context>

<codebase_examples>
Shared helper from TRD 54-01 (`plugins/devflow/devflow/bin/lib/text-escape.cjs`):

```js
const { escapeRegExp, objectiveNumPattern } = require('./text-escape.cjs');
// objectiveNumPattern('4.1') === '4\\.1(?!\\.?\\d)'  -> never matches 4.10, 4.1.2 or 401; allows "4.1." at a sentence end
```

Conversions (apply objectiveNumPattern everywhere a number is followed by free text; it is harmless where `:`/`[:\s]` already
follows):

```js
// roadmap.cjs:281 — before (no boundary: "Objective 1" matches "Objective 12")
const checkboxPattern = new RegExp(`-\\s*\\[(x| )\\]\\s*.*Objective\\s+${objectiveNum.replace('.', '\\.')}`, 'i');
// after
const checkboxPattern = new RegExp(`-\\s*\\[(x| )\\]\\s*.*Objective\\s+${objectiveNumPattern(objectiveNum)}`, 'i');

// objective.cjs:742 — before
const targetEscaped = targetObjective.replace(/\./g, '\\.');
// after (used at :744, :750, :754)
const targetEscaped = objectiveNumPattern(targetObjective);

// objective.cjs:914 / :919 — escape requirement IDs read from ROADMAP
new RegExp(`(-\\s*\\[)[ ](\\]\\s*\\*\\*${escapeRegExp(reqId)}\\*\\*)`, 'gi')
new RegExp(`(\\|\\s*${escapeRegExp(reqId)}\\s*\\|[^|]+\\|)\\s*Pending\\s*(\\|)`, 'gi')
```

Note on :754 (table row `\\|\\s*${targetEscaped}\\.?\\s`): with objectiveNumPattern the lookahead runs before `\\.?\\s`. `| 4.1 Name |`
and `| 4.1. Name |` still match (`.` followed by a space is allowed by `(?!\.?\d)`).

Section-anchored Requirements lookup for :902-905. Replace the unanchored regex with:

```js
const headerRe = new RegExp(`^#{2,4}\\s*Objective\\s+${objectiveNumPattern(objectiveNum)}\\s*:`, 'im');
const header = headerRe.exec(roadmapContent);
let reqMatch = null;
if (header) {
  const rest = roadmapContent.slice(header.index + header[0].length);
  const next = rest.search(/\n#{2,4}\s*Objective\s+\d/i);
  const section = next === -1 ? rest : rest.slice(0, next);
  reqMatch = section.match(/\*\*Requirements:\*\*\s*([^\n]+)/i);
}
```

The same section-slicing idiom already exists in workstreams.cjs:24-28 and roadmap-progress.cjs updateJobsLine.

Test harness (objective.test.cjs:72 and roadmap.test.cjs:61 both define):

```js
function run(args, cwd) {
  const r = spawnSync(process.execPath, [DF_TOOLS, ...args], { cwd, encoding: 'utf-8' /* ... */ });
```
</codebase_examples>

<anti_patterns>
- Do not use `\b` after the number. `\b` matches between `1` and `.`, so `Objective 4\b` still matches `Objective 4.1`.
- Do not "fix" :904 by only adding the boundary. The checklist line `- [ ] **Objective 2: Name**` is a legitimate match for
  `Objective 2`, and the lazy scan still crosses into the next section. Anchor to the `#{2,4}` header.
- Do not filter non-ID tokens out of the Requirements line. Free text like `none (...)` should simply match nothing once escaped.
- Do not edit df-tools.test.cjs. Put the workstreams regression tests in the new workstreams.test.cjs.
- Do not reorder or rewrite unrelated ROADMAP logic in these functions.
</anti_patterns>

<error_recovery>
- If an existing objective/roadmap test breaks after the swap, print the old and new pattern sources for its input. The only
  intended differences are full escaping and the `(?!\.?\d)` lookahead. A test that relied on `Objective 1` matching `Objective 10`
  encoded the bug: fix its fixture and say so in the SUMMARY.
- If test 4 cannot reach the REQUIREMENTS block, `objective complete` may bail earlier on missing TRD/SUMMARY files. Seed the
  objective dir the way the existing `objective complete` tests do (`rg -n "objective', 'complete'|'complete'" objective.test.cjs`).
</error_recovery>

</embedded_context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: roadmap.cjs and workstreams.cjs on objectiveNumPattern (alerts 84, 65, 85, 66, 68, 74 + unflagged :281, workstreams)</name>
  <files>plugins/devflow/devflow/bin/lib/roadmap.test.cjs, plugins/devflow/devflow/bin/lib/workstreams.test.cjs, plugins/devflow/devflow/bin/lib/roadmap.cjs, plugins/devflow/devflow/bin/lib/workstreams.cjs</files>
  <action>
RED: add test-list items 1-3 to roadmap.test.cjs and create workstreams.test.cjs with items 8-9. Run them; record which fail (1 and
8 are expected to). Commit `test(54-06): failing tests for objective-number boundaries in roadmap and workstreams`.

GREEN:
- roadmap.cjs: `const { objectiveNumPattern } = require('./text-escape.cjs');`. Replace the escaping at :105, :146, :281 and :380 with
  `objectiveNumPattern(objectiveNum)` (`.toString()` at :105 is no longer needed, since the helper coerces). The regexes at :106, :150,
  :158, :281 and :399 use the new variable.
- workstreams.cjs: same import; replace the four `.replace('.', '\\.')` interpolations at :48, :357, :363, :397 with
  `objectiveNumPattern(...)`.
Commit `fix(54-06): escape objective numbers with a trailing boundary in roadmap and workstreams`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/roadmap.test.cjs plugins/devflow/devflow/bin/lib/workstreams.test.cjs plugins/devflow/devflow/bin/lib/roadmap-progress.test.cjs plugins/devflow/devflow/bin/df-tools.test.cjs</verify>
  <done>Items 1-3, 8, 9 pass. `rg -n "replace\('\.'|replace\(/\\\\\./g" plugins/devflow/devflow/bin/lib/roadmap.cjs plugins/devflow/devflow/bin/lib/workstreams.cjs` prints nothing. df-tools.test.cjs workstreams/roadmap cases still pass.</done>
  <recovery>If df-tools.test.cjs is slow or has a known pre-existing failure, compare its failure list before and after with `node --test --test-reporter=spec plugins/devflow/devflow/bin/df-tools.test.cjs 2>&1 | rg "^\s*✖"`. The list must not grow.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: objective.cjs on the shared helper; section-anchored, escaped Requirements update (alerts 87, 76, 77, 78, 79, 82)</name>
  <files>plugins/devflow/devflow/bin/lib/objective.test.cjs, plugins/devflow/devflow/bin/lib/objective.cjs</files>
  <action>
RED: add test-list items 4-7 to objective.test.cjs. Items 4 and 5 are expected to fail; record what 6 and 7 do. Commit
`test(54-06): failing tests for objective remove/complete matching and requirement IDs`.

GREEN in objective.cjs:
1. Replace the local `escapeRegExp` (:1068-1070) with `const { escapeRegExp, objectiveNumPattern } = require('./text-escape.cjs');`
   at the top with the other requires. :1024 and :1088 keep calling `escapeRegExp`.
2. cmdObjectiveRemove :742: `const targetEscaped = objectiveNumPattern(targetObjective);`.
3. cmdObjectiveComplete :876: `${objectiveNumPattern(objectiveNum)}` in place of `.replace('.', '\\.')`. Delete the dead
   `objectiveEscaped` at :883.
4. :902-905: replace with the section-anchored lookup from codebase_examples.
5. :914 and :919: wrap `reqId` in `escapeRegExp(...)`.
Commit `fix(54-06): shared escapes in objective remove/complete; anchor Requirements lookup to the objective's section`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/objective.test.cjs plugins/devflow/devflow/bin/lib/objective-branch.test.cjs plugins/devflow/devflow/bin/lib/text-escape.test.cjs</verify>
  <done>Items 4-7 pass and every existing objective test passes. `rg -n "function escapeRegExp|replace\('\.'|replace\(/\\\\\./g" plugins/devflow/devflow/bin/lib/objective.cjs` prints nothing.</done>
  <recovery>If item 4 still marks R-1, check that the header regex has the `m` flag and the `^` anchor; without them the checklist line `**Objective 2: B**` can match a header pattern that lacks `#{2,4}`.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- Both task verify commands pass.
- `rg -n "replace\('\.'|replace\(/\\\\\./g" plugins/devflow/devflow/bin/lib/{objective,roadmap,workstreams}.cjs` prints nothing.
- In a scratch copy of this repo's `.planning/`, with a stub REQUIREMENTS.md added, `objective complete` on an objective whose Requirements
  line is free text exits 0.
</verification>

<success_criteria>
The three ROADMAP-editing modules escape objective numbers through one helper with a correct trailing boundary. The Requirements
update reads the right section and cannot crash on free text. Alerts 65, 66, 68, 74, 76-79, 82, 84, 85 and 87 have no remaining
source pattern.
</success_criteria>

<output>
After completion, create `.planning/objectives/54-codeql-cleanup/54-06-SUMMARY.md` via `df-tools summary post`.
</output>
