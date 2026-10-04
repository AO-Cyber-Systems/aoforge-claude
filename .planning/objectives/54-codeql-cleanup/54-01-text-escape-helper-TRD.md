---
objective: 54-codeql-cleanup
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/text-escape.cjs
  - plugins/devflow/devflow/bin/lib/text-escape.test.cjs
  - plugins/devflow/devflow/bin/lib/roadmap-progress.cjs
  - plugins/devflow/devflow/bin/lib/gh-wiki.cjs
  - plugins/devflow/devflow/bin/lib/watcher-shell.cjs
  - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
autonomous: true
requirements: ["54-A", "54-B"]
codeql_alerts: []
must_haves:
  truths:
    - "One module, lib/text-escape.cjs, exports escapeRegExp, objectiveNumPattern and mdCell; it requires nothing (no fs, no helpers.cjs), so a hook can load it cheaply"
    - "escapeRegExp escapes every regex metacharacter `. * + ? ^ $ { } ( ) | [ ] \\`; new RegExp(escapeRegExp(s)) matches s literally for every s in the test list"
    - "objectiveNumPattern('4.1') used as `Objective\\s+` + pattern matches `Objective 4.1:`, `Objective 4.1 ` and `Objective 4.1.` (sentence end) but not `Objective 4.10`, `Objective 401` or `Objective 4.1.2`; objectiveNumPattern('4') does not match `Objective 4.1`, `Objective 41` or `Objective 40`"
    - "mdCell escapes backslash first, then pipe, then turns CR/LF newlines into a space; null and undefined become ''"
    - "The four duplicate escape helpers (roadmap-progress.cjs escapeRegExp, gh-wiki.cjs escapeRegExp, watcher-shell.cjs escapeRegex, objective.cjs left to TRD 54-06) and the two quick-29 cell helpers (0011 `cell`, planning-verbs-cli `tableCell`) are replaced by imports; their existing tests pass unchanged"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/text-escape.cjs
      provides: "escapeRegExp, objectiveNumPattern, mdCell"
    - path: plugins/devflow/devflow/bin/lib/text-escape.test.cjs
      provides: "hand-built cases for all three helpers"
  key_links:
    - "text-escape.escapeRegExp -> objective.cjs / roadmap.cjs / workstreams.cjs (TRD 54-06), novel-domain / trd-pre-check / project-bootstrap / changelog / hooks/changelog-on-tag.js (TRD 54-07)"
    - "text-escape.mdCell -> adopt.cjs render tables and stack-report.cjs cell (TRD 54-08); 0011 cell and planning-verbs-cli tableCell (this TRD)"
---

# TRD 54-01: One shared escape module (enabler for groups A and B)

<objective>
Create `plugins/devflow/devflow/bin/lib/text-escape.cjs` with the three escapes this objective needs everywhere, and fold the
existing duplicate copies into it.

Purpose: OBJECTIVE.md group A asks for "one shared `escapeRegExp` at every interpolation site", and group B for "one `mdCell`
helper (backslash first, then pipe, then newlines)" that also absorbs the quick-29 fixes. Today there are four copies of the regex
escape (`objective.cjs:1069`, `roadmap-progress.cjs:26`, `gh-wiki.cjs:110`, `watcher-shell.cjs:506` as `escapeRegex`) and two copies
of the cell escape (`migrations/0011-github-store-backfill.cjs:102` `cell`, `planning-verbs-cli.cjs:379` `tableCell`). TRDs 54-06,
54-07 and 54-08 (wave 2) consume this module.

This TRD closes no CodeQL alert by itself. It is the dependency for the 26 alerts in groups A and B.

Output: the module with a paired test, and the duplicates replaced by imports. `objective.cjs` keeps its local copy until TRD
54-06, which owns that file.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD for Task 1: `test(54-01): ...` (failing, module missing) before `feat(54-01): ...`.
- Task 2 is a mechanical swap with no behaviour change. The existing tests are the regression gate; add no new tests there.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>` (repo df-tools; the home mirror is 2.12.0).
- Hand-built test cases only (constraint `no_llm_test_data`). No property-based library (`no_property_based_default`).
- Do NOT touch `objective.cjs` (TRD 54-06 owns it) or `adopt.cjs` / `stack-report.cjs` (TRD 54-08 owns them).
- `text-escape.cjs` must require nothing. `hooks/changelog-on-tag.js` will require it on every PreToolUse(Bash) call (TRD 54-07),
  and `helpers.cjs` loads model-profiles JSON at require time.

## Test list

Unit only (pure functions). Outermost-first ordering does not apply.

escapeRegExp:
1. Each metacharacter on its own (`.`, `*`, `+`, `?`, `^`, `$`, `{`, `}`, `(`, `)`, `|`, `[`, `]`, `\`): `new RegExp('^' + escapeRegExp(c) + '$').test(c)` is true.
2. `4.1` does not match `401` (`new RegExp('^' + escapeRegExp('4.1') + '$')`).
3. `1.0.0+build.1` matches itself and does not match `1.0.00build.1`.
4. `1.0.0-rc.1` matches itself.
5. `(` and `[` do not throw when compiled.
6. A non-string (number 12) is coerced: `escapeRegExp(12) === '12'`.

objectiveNumPattern (tested through `new RegExp('Objective\\s+' + objectiveNumPattern(n))`):
7. `4.1` matches `Objective 4.1:`, `Objective 4.1 x` and `see Objective 4.1.` (sentence end).
8. `4.1` does not match `Objective 4.10`, `Objective 401`, `Objective 4.1.2`.
9. `4` does not match `Objective 4.1`, `Objective 41`, `Objective 40`; it matches `Objective 4:` and `Objective 4 `.
10. `12` does not match `Objective 120` or `Objective 12.1`; matches `Objective 12:`.
11. A number argument (4) behaves like `'4'`.

mdCell:
12. `a|b` -> `a\|b`.
13. `a\|b` (backslash then pipe) -> `a\\\|b`, i.e. escaped backslash then escaped pipe.
14. `C:\tmp` -> `C:\\tmp`.
15. `line1\nline2` and `line1\r\nline2` -> `line1 line2`.
16. `null` and `undefined` -> `''`; `0` -> `'0'`; `false` -> `'false'`.
17. Round trip guard: for the cell `x\|y`, splitting the rendered row `| ${mdCell('x\\|y')} | z |` on pipes NOT preceded by an odd run
    of backslashes gives exactly two cells. Implement the splitter inline in the test (scan chars; `\` skips the next char).

<embedded_context>

<codebase_examples>
The pattern every copy already uses (keep it byte for byte, it is the one CodeQL recognises as a sanitizer):

```js
// plugins/devflow/devflow/bin/lib/objective.cjs:1068
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

quick-29's cell escape, the behaviour mdCell must reproduce (null/undefined -> ''):

```js
// plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs:102
const cell = (s) => String(s === undefined || s === null ? '' : s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
// plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs:379
const tableCell = (s) => String(s).replace(/\r?\n/g, ' ').replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
```

Duplicates to replace in Task 2:

```js
// roadmap-progress.cjs:18-28 (keep a one-line pointer comment, drop the copy)
function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// gh-wiki.cjs:109-112 (same body; used once at :116)
// watcher-shell.cjs:506-508 escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }  (used at :397)
```

Target module shape:

```js
'use strict';
// lib/text-escape.cjs — dependency-free escapes shared by lib modules and hooks (objective 54).

/** Escape every RegExp metacharacter so `s` matches literally. */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * An objective number as a RegExp source fragment with a trailing boundary: `4.1` never matches
 * `4.10`, `4.1.2` or `401`, and `4` never matches `4.1` or `41`. A sentence-ending period is allowed.
 */
function objectiveNumPattern(n) {
  return `${escapeRegExp(n)}(?!\\.?\\d)`;
}

/** A GitHub-flavoured markdown table cell: backslash first, then pipe, then newlines -> space. */
function mdCell(value) {
  const s = value === undefined || value === null ? '' : String(value);
  return s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

module.exports = { escapeRegExp, objectiveNumPattern, mdCell };
```
</codebase_examples>

<anti_patterns>
- Do not escape the pipe before the backslash. `a\|b` would become `a\\|b`, and GFM reads `\\` as a literal backslash followed by
  an unescaped pipe that splits the cell. That is the bug CodeQL flags.
- Do not use a `\b` word boundary for objectiveNumPattern. `\b` sits between `1` and `.`, so `Objective 4\b` matches `Objective 4.1`.
- Do not add the module to helpers.cjs. Hooks would pay helpers.cjs's require-time JSON load.
- Do not change behaviour while swapping in Task 2. `planning-verbs-cli` `tableCell` currently turns `undefined` into `'undefined'`.
  Check its callers (`stayLocalTable`, :390) first; switch to mdCell only if every caller passes a defined value. Otherwise keep a
  one-line wrapper `(s) => mdCell(String(s))` and note it in the SUMMARY.
</anti_patterns>

<error_recovery>
- If a swapped module's test fails, diff the old local helper against text-escape's. The only allowed difference is `String()`
  coercion in watcher-shell (its callers pass strings).
- If `require('./text-escape.cjs')` from `migrations/0011-github-store-backfill.cjs` fails, the path is `'../text-escape.cjs'`
  (migrations/ is one level down).
</error_recovery>

</embedded_context>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── text-escape.cjs                         ← CREATE
├── text-escape.test.cjs                    ← CREATE
├── roadmap-progress.cjs                    ← MODIFY (import escapeRegExp)
├── gh-wiki.cjs                             ← MODIFY (import escapeRegExp)
├── watcher-shell.cjs                       ← MODIFY (import escapeRegExp as escapeRegex call sites)
├── planning-verbs-cli.cjs                  ← MODIFY (tableCell -> mdCell)
└── migrations/0011-github-store-backfill.cjs ← MODIFY (cell -> mdCell)
</file_tree>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create lib/text-escape.cjs with escapeRegExp, objectiveNumPattern and mdCell</name>
  <files>plugins/devflow/devflow/bin/lib/text-escape.test.cjs, plugins/devflow/devflow/bin/lib/text-escape.cjs</files>
  <action>
RED: write `text-escape.test.cjs` (node:test + node:assert/strict, `require('./text-escape.cjs')`) covering test-list items 1-17 as
named tests (`'TE-1 escapeRegExp: every metacharacter matches literally'`, ...). Run it: it fails with MODULE_NOT_FOUND. Commit
`test(54-01): failing tests for shared text-escape helpers`.

GREEN: create `text-escape.cjs` with the module shape in codebase_examples. `'use strict'`, CommonJS, zero requires. Commit
`feat(54-01): add dependency-free text-escape module (escapeRegExp, objectiveNumPattern, mdCell)`.

# CRITICAL: the escapeRegExp body must be byte-identical to objective.cjs:1069. CodeQL recognises that exact sanitizer shape.
# GOTCHA: the lookahead is `(?!\\.?\\d)` in a template literal, i.e. the RegExp source `(?!\.?\d)`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/text-escape.test.cjs</verify>
  <done>All 17 cases pass. `node -e "console.log(Object.keys(require('./plugins/devflow/devflow/bin/lib/text-escape.cjs')))"` prints the three names. `rg -n "require\(" plugins/devflow/devflow/bin/lib/text-escape.cjs` prints nothing.</done>
  <recovery>If item 7's sentence-end case fails, the lookahead is consuming the period wrongly: it must be a negative lookahead for "optional dot, then digit", not "dot or digit".</recovery>
</task>

<task type="auto">
  <name>Task 2: Replace the duplicate escape helpers with imports from text-escape.cjs</name>
  <files>plugins/devflow/devflow/bin/lib/roadmap-progress.cjs, plugins/devflow/devflow/bin/lib/gh-wiki.cjs, plugins/devflow/devflow/bin/lib/watcher-shell.cjs, plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs, plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs</files>
  <action>
For each file, delete the local helper and import from the shared module. Keep call sites unchanged where possible.

- `roadmap-progress.cjs`: replace the `escapeRegExp` function (lines ~25-28) with `const { escapeRegExp } = require('./text-escape.cjs');`.
  Shorten the js/regex-injection comment block above it (lines ~18-24) to two lines pointing at text-escape.cjs. Leave the regexes at
  :90 and :178 unchanged (no boundary change in this TRD).
- `gh-wiki.cjs`: same swap for lines ~109-112 (used at :116). Keep the "CodeQL alert 145" note as one line.
- `watcher-shell.cjs`: delete `escapeRegex` (~:506-508); add `const { escapeRegExp } = require('./text-escape.cjs');` with the other
  requires and change the one call at :397 to `escapeRegExp(end)`.
- `migrations/0011-github-store-backfill.cjs`: `const { mdCell } = require('../text-escape.cjs');` and `const cell = mdCell;`, or
  replace the `cell(` calls at :199 and :921 with `mdCell(`. Behaviour is identical (null/undefined -> '').
- `planning-verbs-cli.cjs`: replace `tableCell` (:379) per the anti_patterns note on `undefined`.

Run each module's existing test file after its edit. Commit once at the end:
`refactor(54-01): route duplicate regex and table-cell escapes through text-escape.cjs`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/roadmap-progress.test.cjs plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.apply.test.cjs plugins/devflow/devflow/bin/lib/text-escape.test.cjs</verify>
  <done>`rg -n "function escapeRegE?x|const (cell|tableCell) = \(s\)" plugins/devflow/devflow/bin/lib --glob '!*.test.cjs'` lists only objective.cjs:1069 (removed by 54-06). The listed test files pass with no assertion changes.</done>
  <recovery>If watcher-shell.test.cjs fails on a non-string `end`, the old helper would also have thrown; check the caller passes a string and do not add coercion elsewhere.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- Both task verify commands pass.
- `node --test plugins/devflow/devflow/bin/lib/text-escape.test.cjs` reports at least 17 passing tests.
- No new `escapeRegExp`/`escapeRegex`/cell-escape definitions exist outside text-escape.cjs, except objective.cjs:1069.
</verification>

<success_criteria>
text-escape.cjs exists, requires nothing, and is the single source for regex escaping, objective-number boundaries and markdown
cell escaping. Every module that had its own copy now imports it, and its tests pass unchanged.
</success_criteria>

<output>
After completion, create `.planning/objectives/54-codeql-cleanup/54-01-SUMMARY.md` via `df-tools summary post`.
</output>
