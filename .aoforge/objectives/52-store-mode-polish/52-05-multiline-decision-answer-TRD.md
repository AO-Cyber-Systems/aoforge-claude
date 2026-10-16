---
objective: 52-store-mode-polish
trd: "05"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/frontmatter.cjs
  - plugins/devflow/devflow/bin/lib/frontmatter.test.cjs
  - plugins/devflow/devflow/bin/lib/decision-queue.cjs
  - plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs
  - plugins/devflow/devflow/bin/lib/planning-import.cjs
  - plugins/devflow/devflow/bin/lib/planning-import.test.cjs
autonomous: true
requirements: ["52-6"]
must_haves:
  truths:
    - "Local mode: `df-tools decision answer DECISION-NNN --from <file>` with a multi-line answer (including a line with a colon and a line that is exactly `---`) writes a resolved decision whose `resolution`, read back with extractFrontmatter, equals the answer text (CRLF normalised, trailing whitespace trimmed); `status` and `resolved_at` survive"
    - "reconstructFrontmatter writes any string containing a newline as a YAML `|-` block scalar indented two spaces past its key, and extractFrontmatter parses `|`, `|-` and `|+` block scalars back to the exact text, at top level and one nesting level down"
    - "Single-line values serialise byte-identically to today (no existing frontmatter output changes)"
    - "planning import reads a block-scalar `resolution` in full and queues the full multi-line answer (today `frontmatterField` returns only `|-`)"
    - "Store mode: a multi-line `decision answer` round-trips through the answer comment and `gh pull --all` into `decisions/<id>.md` intact (regression guard)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/frontmatter.cjs
      provides: "block-scalar support in extractFrontmatter and reconstructFrontmatter"
  key_links:
    - "decision-queue.resolveDecision -> frontmatter.spliceFrontmatter (writes resolution) -> frontmatter.extractFrontmatter (decision-queue list, /devflow:decide)"
    - "planning-import.frontmatterField('resolution') -> planning-entity-verbs.decisionAnswer (0011 backfill carries the full answer to GitHub)"
---

# TRD 52-05: Multi-line `decision answer` round-trips intact (item 52-6)

<objective>
Fix the bug where a multi-line `decision answer` keeps only its first line, and pin the fix with regression tests.

Purpose: the planner reproduced it against the repo df-tools. Answering DECISION-001 with `Option B.\nReason: second line with colon\n---\nthird line\n`
writes this frontmatter:

```
resolution: "Option B.
Reason: second line with colon
---
third line
"
resolved_at: "2026-10-04T13:49:05.343Z"
```

and `extractFrontmatter` reads it back as `{resolution: "Option B.", Reason: "second line with colon"}`: the answer is truncated, a
spurious `Reason` key appears, and the `---` line ends the frontmatter early, so `resolved_at` is lost.

Root cause: `reconstructFrontmatter` (frontmatter.cjs:84-146) emits every string scalar on one line, quoting only on `:`/`#`,
with no newline handling, and `extractFrontmatter` (frontmatter.cjs:9-82) is line-based with no block-scalar support.
`planning-import.cjs:104 frontmatterField` has the same single-line limit, so the 0011 backfill would carry the truncated answer to GitHub.
docs/USER-GUIDE.md:1109 lists it as a known issue.

Output: block-scalar support in the shared frontmatter serializer and parser, a multi-line-aware `frontmatterField`, CRLF/trailing
normalisation in `resolveDecision`, and regression tests in local mode, store mode and import.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD per task: `test(52-05): ...` (failing) before `fix(52-05): ...`.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- frontmatter.cjs is used everywhere. Single-line output must stay byte-identical, so the block-scalar path triggers only for strings containing `\n`.
- No YAML library. Keep the hand parser and extend it narrowly.
- Out of scope: recovering resolved decisions written before the fix (their extra lines are already mangled by the old format), and
  the `recommendation:` empty-string -> `{}` quirk. TRD 52-06 documents the legacy case.

## Test list

Outermost first.
1. CLI, local mode: a git-less temp project with `.planning/config.json` `{}`. `decision open 52-01 --question "Pick?"`, then
   `decision answer DECISION-001 --from ans.md` where ans.md is `Option B.\nReason: second line with colon\n---\n  indented line\n\nlast\n`.
   Read `.planning/decisions/resolved/DECISION-001.md` with extractFrontmatter: `resolution` === `Option B.\nReason: second line with colon\n---\n  indented line\n\nlast`;
   `status` === `resolved`; `resolved_at` is set; there is no `Reason` key.
2. Verb, local (planning-entity-verbs.test.cjs, next to test 2): `ev.decisionAnswer(S.root, {id, text: 'a\r\nb\r\n'})` -> resolution `a\nb`.
3. Verb, store (next to test 9, gh fake): a multi-line answer -> the answer comment payload text is the full answer, the cache
   `decisions/7-01-d1.md` ends with `## Answer\n\n<full answer>\n`, and pull rebuilds the same bytes.
4. Import: a resolved local decision whose frontmatter holds `resolution: |-` plus two indented lines -> the queued answer op text is both lines.
5. Import regression: the existing single-line `resolution: B` seed (planning-import.test.cjs:139) still queues `B`.
6. Unit, frontmatter: reconstruct `{a: 'x\ny'}` -> `a: |-\n  x\n  y`; nested `{o: {k: 'x\ny'}}` -> `o:\n  k: |-\n    x\n    y`.
7. Unit, frontmatter: extract parses `|-`, `|` (one trailing newline) and `|+` (keeps trailing newlines), blank lines inside the block,
   lines with extra leading spaces past the block indent, and a block followed by another key.
8. Unit, frontmatter: round trip `extract(splice(content, obj))` preserves every multi-line string exactly, including lines `---`,
   `key: value` and `- item`.
9. Unit, frontmatter regression: every existing frontmatter.test.cjs case passes; single-line reconstruct output is unchanged.

<embedded_context>

<codebase_examples>
reconstructFrontmatter's scalar branches (frontmatter.cjs:131-141 top level; the nested `subval` branch at :125-128 is similar):

```js
} else {
  const sv = String(value);
  if (sv.includes(':') || sv.includes('#') || sv.startsWith('[') || sv.startsWith('{')) {
    lines.push(`${key}: "${sv}"`);
  } else {
    lines.push(`${key}: ${sv}`);
  }
}
```

extractFrontmatter's key branch (frontmatter.cjs:37-57): `value === ''` or `'['` pushes a nested context; inline arrays; otherwise
`current.obj[key] = value.replace(/^["']|["']$/g, '')`. Lines that are neither `key:` nor `- ` are silently dropped. That is the truncation.

The frontmatter block regex `^---\n([\s\S]+?)\n---` matches only a column-0 `---`. A block-scalar line is always indented, so an answer
line `---` becomes `  ---` and can no longer end the frontmatter.

decision-queue.resolveDecision (decision-queue.cjs:301-317): `fm.resolution = choice; ... spliceFrontmatter(content, fm)`.

planning-import.cjs:104-109:

```js
function frontmatterField(text, key) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  const m = fm ? new RegExp(`^${key}:[ \\t]*(.*?)\\s*$`, 'm').exec(fm[1]) : null;
  const v = m ? m[1].replace(/^(['"])(.*)\1$/, '$2').trim() : '';
  return v === '' ? null : v;
}
```

Store path (planning-entity-verbs.cjs:470-505, gh-cache.cjs:482-499) already keeps the answer in the body after `## Answer`. Test 3 is a guard, not a RED.
</codebase_examples>

<anti_patterns>
- Fixing only decision-queue (JSON-escaping the value, or moving the answer to the body). The serializer emits invalid YAML for any
  multi-line string; fix the root cause once in frontmatter.cjs.
- Block-scalar detection on values like `a | b`: only a value that is exactly `|`, `|-`, `|+`, `>`, `>-` or `>+` (after trim) starts a block.
- Stripping "minimum indentation" when parsing. Strip exactly `keyIndent + 2` columns so leading spaces in the content survive. A
  non-blank line with indent <= keyIndent ends the block. Blank lines inside the block become empty lines.
- Emitting trailing spaces on blank block lines. Emit an empty line.
</anti_patterns>

<error_recovery>
- If an unrelated suite breaks after the frontmatter change, look for a writer that already stored a multi-line string (now a block
  scalar) and whose test pinned the broken shape. Update that expectation and list it in the SUMMARY. Do not special-case the serializer.
- If `>` folded scalars are hard to fold correctly, parse `>`/`>-`/`>+` as literal (no folding) and say so in a comment. The serializer never emits them.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/52-store-mode-polish/OBJECTIVE.md
@plugins/devflow/devflow/bin/lib/frontmatter.cjs
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: block scalars in the shared frontmatter serializer and parser</name>
  <files>plugins/devflow/devflow/bin/lib/frontmatter.cjs, plugins/devflow/devflow/bin/lib/frontmatter.test.cjs</files>
  <action>
RED: add test-list items 6-9 to frontmatter.test.cjs. Commit `test(52-05): ...`.

GREEN:
- reconstructFrontmatter: for a top-level string and a nested `subval` string containing `\n`, emit `${pad}${key}: |-`, then each line of
  `value.replace(/\r\n/g, '\n')` as `${pad}  ${line}` (an empty line for an empty content line). Trailing newlines are not represented (`|-` strips them).
  Leave the third-level `subsubval` branch alone unless a test needs it.
- extractFrontmatter: in the key branch, when `value` (trimmed) matches `/^[|>][+-]?$/`, collect the following lines: every line that is
  blank or indented more than the key's indent. Strip `indent + 2` leading columns (or all leading whitespace when the line is shorter).
  Join with `\n` and apply chomping: `-` strips all trailing newlines; none keeps exactly one; `+` keeps all. Assign it as a string, then
  continue the main loop after the block. Restructure the `for...of` as an index loop if needed.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/frontmatter.test.cjs plugins/devflow/devflow/bin/lib/decision-queue.test.cjs</verify>
  <done>Items 6-9 pass. Multi-line strings round-trip exactly; single-line output and parsing are unchanged.</done>
  <recovery>If an existing test breaks, compare the reconstruct output for single-line values byte for byte. Only `\n`-bearing strings may change.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: decision answer round-trips in local and store mode</name>
  <files>plugins/devflow/devflow/bin/lib/decision-queue.cjs, plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs</files>
  <action>
RED: add test-list items 1-3 to planning-entity-verbs.test.cjs. Item 1 spawns the real CLI (`node <TOOLS_PATH> --cwd <tmp> decision ...`).
Item 2 fails today on `\r`. Item 3 is expected green (a guard). Commit `test(52-05): ...`.

GREEN in decision-queue.resolveDecision: normalise first, `const text = String(choice).replace(/\r\n/g, '\n').trimEnd();`. Use `text` for
the options check and for `fm.resolution`. Task 1's serializer does the rest.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs plugins/devflow/devflow/bin/lib/decision-queue.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs</verify>
  <done>A multi-line local answer reads back intact with status and resolved_at present. The store-mode answer round-trips through comment and pull. Existing decision tests pass.</done>
  <recovery>If item 1 shows the answer intact on disk but truncated on read, the CLI path is reading through another parser: grep `resolution` readers and route them through extractFrontmatter.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: planning import carries a multi-line resolution to GitHub</name>
  <files>plugins/devflow/devflow/bin/lib/planning-import.cjs, plugins/devflow/devflow/bin/lib/planning-import.test.cjs</files>
  <action>
RED: add test-list items 4-5 to planning-import.test.cjs next to the existing DECISION-001 seed (line ~139). Assert on the queued answer
op's text (find how that test reads queued ops). Commit `test(52-05): ...`.

GREEN: in `frontmatterField(text, key)`, after the regex match, if the captured value matches `/^[|>][+-]?$/`, return
`extractFrontmatter(text.replace(/\r\n/g, '\n'))[key]` when that is a non-empty string, else null. Require `extractFrontmatter` from
`./frontmatter.cjs`. The single-line path is unchanged.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-import.test.cjs plugins/devflow/devflow/bin/lib/planning-import-backfill.test.cjs</verify>
  <done>Import queues the full multi-line answer, single-line import is unchanged, and both import test files pass.</done>
  <recovery>If requiring frontmatter.cjs from planning-import creates a cycle (frontmatter.cjs requires helpers.cjs only), check with `node -e "require('./plugins/devflow/devflow/bin/lib/planning-import.cjs')"`.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- The three scoped test commands pass.
- Re-run the planner's reproduction in a scratch dir (decision open, then decision answer with the 4-line file). `extractFrontmatter`
  shows the full `resolution`, `resolved_at` is present, and there is no `Reason` key.
</verification>

<success_criteria>
A multi-line `decision answer` round-trips intact in local mode (file -> parser), in store mode (comment -> pull), and through
`planning import` onto GitHub. Single-line frontmatter is byte-identical to before.
</success_criteria>

<output>
After completion, create `.planning/objectives/52-store-mode-polish/52-05-SUMMARY.md` via `df-tools summary post`.
</output>
