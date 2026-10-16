---
objective: quick-29
trd: 01
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/stack-classify.cjs
  - plugins/devflow/devflow/bin/lib/stack-classify.test.cjs
  - plugins/devflow/devflow/bin/lib/stack-evidence.cjs
  - plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-wiki.cjs
  - plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs
  - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs
  - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/frontmatter.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-setup.test.cjs
  - CHANGELOG.md
autonomous: true
must_haves:
  truths:
    - "`driftCheckAt('$(git ' + '-C -A '.repeat(50000))` returns -1 in under 200ms (alert 138, js/redos)"
    - "Every existing stack-classify test (K25*, K27*, captured `git diff` shapes) still passes: `git -C /repo diff`, `git -c k=v diff`, `git --no-pager diff`, `git -Cfoo diff` all still read as a captured git diff"
    - "stack-evidence strips the trailing connective with no regex backtracking: `'a' + '||'.repeat(50000) + 'x'` returns unchanged in under 200ms (alert 139, js/redos)"
    - "The trailing-connective strip gives the same output as the old regex for every case in the characterization table below"
    - "No PAGE_TABLE rule exposes a method named `match`, so `pageForCachePath` no longer calls `<x>.match(<cli string>)` (alert 145, js/regex-injection). Forward/inverse mapping behaviour is unchanged."
    - "0011 `planText` and planning-verbs-cli `stayLocalTable` escape `\\` before `|`: a rel of `a\\|b.md` renders as the cell `a\\\\\\|b.md` (alerts 143, 144)"
    - "frontmatter.test.cjs:482/484 and gh-setup.test.cjs:723 build no RegExp from a string; they use substring checks (alerts 140, 141, 142)"
    - "`npm test` passes except the known MA-7 handoff-e2e failure"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/stack-classify.cjs
      provides: "GIT_DIFF where a single-dash `-C`/`-c` followed by whitespace parses only as the option-with-value"
    - path: plugins/devflow/devflow/bin/lib/stack-evidence.cjs
      provides: "stripTrailingConnective(s), a loop replacing the TRAILING_CONNECTIVE regex, exported for tests"
    - path: plugins/devflow/devflow/bin/lib/gh-wiki.cjs
      provides: "PAGE_TABLE rules use `toPage(rel)` + `invert(page, ctx)`; objectiveDocRule escapes `kind` with a local escapeRegExp"
    - path: plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs
      provides: "cell() escapes backslash before pipe"
    - path: plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
      provides: "tableCell() escapes backslash before pipe; stayLocalTable exported for tests"
    - path: CHANGELOG.md
      provides: "a `## [2.13.0]` `### Fixed` bullet for the eight CodeQL alerts"
  key_links:
    - from: "driftCheckAt (stack-classify.cjs ~line 493)"
      to: "CAPTURED_GIT_DIFF built from GIT_DIFF (~line 429-430)"
      via: "the global regex is exec'd over the raw recipe text, so the GIT_DIFF fix is what bounds driftCheckAt"
    - from: "rawDriftCheck (stack-evidence.cjs ~line 241)"
      to: "stripTrailingConnective"
      via: "`.replace(TRAILING_CONNECTIVE, '')` becomes `stripTrailingConnective(...)`"
    - from: "pageForCachePath (gh-wiki.cjs ~line 268)"
      to: "each PAGE_TABLE rule"
      via: "`rule.match(r)` becomes `rule.toPage(r)`; gh-wiki.test.cjs:145 asserts the new method name"
---

# Quick 29: fix the 8 new CodeQL alerts on release PR #121

## Objective

Release PR #121 (2.13.0) has eight new CodeQL alerts, numbers 138-145. Clear them before the
2.13.0 tag. Apart from the one ReDoS edge case noted in Task 1, behaviour does not change.

| Alert | Rule | Site |
|---|---|---|
| 138 | js/redos | stack-classify.cjs:429 `GIT_DIFF` (backtracks on `git ` + many `-C -A `) |
| 139 | js/redos | stack-evidence.cjs:230 `TRAILING_CONNECTIVE` (backtracks on many `\|\|`) |
| 140, 141 | js/incomplete-sanitization | frontmatter.test.cjs:482, :484 |
| 142 | js/incomplete-sanitization | gh-setup.test.cjs:723 |
| 143 | js/incomplete-sanitization | migrations/0011-github-store-backfill.cjs:101 `cell` |
| 144 | js/incomplete-sanitization | planning-verbs-cli.cjs:378 `tableCell` |
| 145 | js/regex-injection | gh-wiki.cjs:268 `rule.match(r)` |

All paths are under `plugins/devflow/devflow/bin/lib/`.

<context>
- Repo copy of df-tools: `node plugins/devflow/devflow/bin/df-tools.cjs`. Commit with
  `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths...>`, one commit per
  task (`fix(quick-29): ...`, `test(quick-29): ...` for RED). Never use raw `git commit`.
- Leave the untracked unrelated files alone: the `.planning/objectives/*/.gitkeep` files,
  `docs/CODEX-PORT.md`, `docs/PROPOSAL-visual-workflow-class.md` and
  `plugins/devflow/devflow/references/codex-agent-policy.md`. Never `git add -A` or `git add .`.
- Never use port 8080. Nothing here needs a server.
- TDD: write the failing test first, see it fail, then fix (CLAUDE.md TDD Playbook). One test at a time.
- Use hand-built literal inputs (no generated data). No property-based libraries.
- Alert 145 is the CodeQL `String.prototype.match(string)` model. `rule.match(r)` looks to CodeQL like
  `str.match(<string>)`, which compiles its argument as a regex, and `r` is a CLI-derived path.
  Escaping does not clear it. Renaming the rule method does. The `kind` in `objectiveDocRule`'s
  `new RegExp` comes from in-code constants, so escaping it is defensive only.
</context>

<embedded_context>
<codebase_examples>
Existing escape helper (objective.cjs:1069; roadmap-progress.cjs:26 has the same local copy, with a
comment citing js/regex-injection):
```js
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```
Current sites:
```js
// stack-classify.cjs:429
const GIT_DIFF = 'git(?:\\s+(?:-[Cc]\\s+\\S+|--?[A-Za-z][\\w-]*(?:=\\S+)?))*\\s+diff\\b';
// stack-evidence.cjs:230 (used once, at :241 in rawDriftCheck)
const TRAILING_CONNECTIVE = /(?:\s|&&|\|\||[;|!{(]|\b(?:if|then|elif|else|while|until|do)\b)+$/;
// 0011-github-store-backfill.cjs:101 (used in planText ~198 and ~920)
const cell = (s) => String(s === undefined || s === null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
// planning-verbs-cli.cjs:378 (used in stayLocalTable ~389)
const tableCell = (s) => String(s).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
```
`driftCheckAt` is already exported from stack-classify.cjs (tested at stack-classify.test.cjs:912/943).
`planText` is already exported from the 0011 migration. `gh-backfill.renderEstimate` tolerates a missing
estimate, so `planText({ ok: true, queued: {}, kept_local: [...] })` renders.
</codebase_examples>

<anti_patterns>
- Do not keep a copy of the old vulnerable regexes in a test file. CodeQL scans tests too (alerts
  140-142 are in tests). Hard-code the characterization outputs instead.
- Do not replace TRAILING_CONNECTIVE with another `(...)+$` regex, even an unambiguous one. With a `$`
  anchor every start position rescans to the end, which is quadratic on 50000 chars and fails the 200ms
  bound. A `\s+$` regex can also trigger js/polynomial-redos. Use the loop.
- Do not use `.replace(/\s+$/, '')` inside the loop. Use `trimEnd()`, which strips the same character set
  as ECMAScript `\s`.
- Do not change the forward or inverse page mapping in gh-wiki. Rename the method only.
</anti_patterns>

<error_recovery>
- A RED timing test against the OLD code at 50000 reps never finishes. To watch RED, run it with the
  small N from the Test list (old code takes about 5 s), then raise N to 50000 once GREEN.
- If an existing stack-classify test fails after the GIT_DIFF change, check whether it relies on a bare
  `-C`/`-c` FLAG followed by whitespace (`git -C diff`). That is the only reading the new pattern drops.
  If a real fixture needs it, stop and report rather than widening the pattern back into ambiguity.
- If `toPage` collides with an existing identifier in gh-wiki.cjs (`rg -n "toPage" gh-wiki.cjs` first),
  use `pageOf` instead.
</error_recovery>
</embedded_context>

## Test list

Outermost first. Each test is a descriptive `test('...')` in the paired test file; follow the file's
existing ID scheme (next free K27x in stack-classify.test.cjs and so on).

**stack-classify (Task 1)**
1. ReDoS: `driftCheckAt('$(git ' + '-C -A '.repeat(N))` returns -1 in under 200ms. Watch RED with
   N=28 (old pattern takes about 5.3 s), then raise to N=50000 when GREEN (new pattern takes about 1 ms).
2. Still recognised, through the existing suite plus one explicit case if none exists:
   `$(git -Cfoo diff)` and `` `git -C "$d" diff` `` are still captured git diffs.

**stack-evidence (Task 1)**
3. ReDoS: `stripTrailingConnective('a' + '||'.repeat(N) + 'x')` returns the input unchanged in under
   200ms. RED with N=20 (old regex takes about 4 s). Then N=50000. Also run `'|'.repeat(50000)` → `''`
   in under 200ms.
4. Characterization: same output as the old regex. These values were computed against the current regex:

| input | expected |
|---|---|
| `go generate ./... && if !` | `go generate ./...` |
| `make gen; then` | `make gen` |
| `a \|\|` | `a` |
| `a \|` | `a` |
| `a \|\| b` | `a \|\| b` |
| `echo gif` | `echo gif` |
| `xdo` | `xdo` |
| `x elif` | `x` |
| `foo-do` | `foo-` |
| `x &&&` | `x &` |
| `do` | `` (empty) |
| `until` | `` (empty) |
| `` (empty) | `` (empty) |
| `cmd {(` | `cmd` |
| `x ! { (` | `x` |
| `run  \t` (two spaces + tab) | `run` |

**gh-wiki (Task 2)**
5. Each PAGE_TABLE rule has `toPage` and `invert` functions and no `match` property. This updates the
   existing gh-wiki.test.cjs:142-147 test.
6. `pageForCachePath` on regex-metacharacter paths (`objectives/(/TRD.md`, `objectives/[x/UAT.md`,
   `codebase/a+b.md`) returns null and does not throw. The existing round-trip tests stay green.

**cell / tableCell (Task 2)**
7. 0011 `planText({ ok: true, queued: {}, kept_local: [{ rel: 'a\\|b.md', reason: 'c\\d' }] })` contains
   the row `  | a\\\\\\|b.md | c\\\\d |` (JS literal; the text is `a\\\|b.md` and `c\\d`).
8. planning-verbs-cli `stayLocalTable({ kept_local: [{ rel: 'a\\|b.md', reason: 'c\\d' }] })` contains the
   same row. Newline flattening still works in both: `'x\ny'` → `x y`.

## Tasks

<task type="auto" tdd="true">
  <name>Task 1: Remove the exponential backtracking in GIT_DIFF and TRAILING_CONNECTIVE (alerts 138, 139)</name>
  <files>plugins/devflow/devflow/bin/lib/stack-classify.cjs, plugins/devflow/devflow/bin/lib/stack-classify.test.cjs, plugins/devflow/devflow/bin/lib/stack-evidence.cjs, plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs</files>
  <action>
**stack-classify.cjs:429.** The option alternatives overlap. `-C` matches both `-[Cc]\s+\S+` and
`--?[A-Za-z][\w-]*`, and `\S+` can swallow the next `-A`, so `-C -A -C -A …` has exponentially many
parses. Split the second alternative so a single-dash `-C`/`-c` followed by whitespace can only be the
option-with-value:

```js
const GIT_DIFF = 'git(?:\\s+(?:-[Cc]\\s+\\S+|--[A-Za-z][\\w-]*(?:=\\S+)?|-(?![Cc]\\s)[A-Za-z][\\w-]*(?:=\\S+)?))*\\s+diff\\b';
```

This pattern was checked during planning. These are still captured: `$(git diff)`,
`$(git -C /repo diff --quiet)`, `$$(git -c core.x=y --no-pager diff)`, `` `git -C "$d" diff` ``,
`$(git --git-dir=.git diff)` and `$(git -Cfoo diff)`. `$(git log)` is not, and the 50000-rep adversarial
input takes about 1 ms. Add a 2-3 line comment above it: each token now has one reading
(js/redos, CodeQL alert 138), and the one dropped shape is `git -C diff`, which chdirs into `diff` with
no subcommand and is not a real diff.

**stack-evidence.cjs:230.** Replace the `TRAILING_CONNECTIVE` regex with a loop:

```js
const CONNECTIVE_WORDS = ['if', 'then', 'elif', 'else', 'while', 'until', 'do'];
function stripTrailingConnective(s) {
  let out = String(s);
  for (;;) {
    out = out.trimEnd();
    if (out.endsWith('&&')) { out = out.slice(0, -2); continue; }
    if (out && ';|!{('.includes(out[out.length - 1])) { out = out.slice(0, -1); continue; }
    const w = CONNECTIVE_WORDS.find((k) => out.endsWith(k) && !/\w/.test(out.charAt(out.length - k.length - 1)));
    if (w) { out = out.slice(0, -w.length); continue; }
    return out;
  }
}
```

The old `\|\|` alternative was redundant with `|` in the char class, and that overlap was the exponential
source. The `\w` check on the character before a word reproduces the old leading `\b`. Stripping `elif`
does not fall into `if` because the `l` before `if` is a word character. Keep the existing comment above
it, add a js/redos note, and replace the `.replace(TRAILING_CONNECTIVE, '')` call at ~line 241 with
`stripTrailingConnective(...)`. Export `stripTrailingConnective` from module.exports.

Order: write Test list items 1-4 first and watch 1 and 3 go RED at the small N. Item 3 also goes RED
with "not a function" until the export exists. Item 4's table was computed against the old regex, so
it is the parity oracle. Then make the change, raise N to 50000, and commit
(`fix(quick-29): bound GIT_DIFF and trailing-connective parsing (CodeQL js/redos)`), with a separate
`test(quick-29)` RED commit first if that is your usual rhythm.

# GOTCHA: CAPTURED_GIT_DIFF is a global /g regex, so driftCheckAt resets lastIndex. Don't add a second use without resetting it.
# PATTERN: time a call with `process.hrtime.bigint()` and assert `elapsedMs < 200`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/stack-classify.test.cjs plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs` passes, including the new ReDoS and characterization tests. Also `rg -n "TRAILING_CONNECTIVE" plugins/devflow/devflow/bin/lib/stack-evidence.cjs` returns nothing.</verify>
  <done>Both adversarial inputs at 50000 reps finish in under 200ms, every characterization row matches, and all pre-existing tests in both files are green.</done>
  <recovery>`git restore` the two source files and re-run. If a pre-existing fixture needs the `git -C diff` reading, stop and report (see error_recovery).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Rename the gh-wiki rule method and escape backslash in table cells (alerts 143, 144, 145)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-wiki.cjs, plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs, plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs, plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs, plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs, plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs</files>
  <action>
**gh-wiki.cjs.** Every PAGE_TABLE rule object (9 of them; `rg -n "^\s+match\(" gh-wiki.cjs`), plus
the object returned by `objectiveDocRule` (~line 109), renames `match(rel)` to `toPage(rel)`. Update
the single caller at ~line 268 (`rule.match(r)` → `rule.toPage(r)`) and any header or JSDoc comment
that names the method (`rg -n "\bmatch\b" gh-wiki.cjs`, and update only the comments that mean the rule
method). Leave `invert` and every `rel.match(SOME_RE)` / `page.match(/…/)` call alone: those are real
String.prototype.match with constant regexes. Also add a local
`function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }`. Mirror the
roadmap-progress.cjs copy and its one-line provenance comment. Use it on `kind` in `objectiveDocRule`'s
`new RegExp(...)`. Check nothing outside gh-wiki calls `<rule>.match`: `rg -n "PAGE_TABLE" plugins/`.
Only gh-wiki.test.cjs uses it. Update gh-wiki.test.cjs:145 to assert `typeof rule.toPage === 'function'`
and `rule.match === undefined`, and add Test list item 6.

**0011-github-store-backfill.cjs:101.**
`const cell = (s) => String(s === undefined || s === null ? '' : s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');`
Backslash comes first, or the backslash added before `|` gets doubled.

**planning-verbs-cli.cjs:378.**
`const tableCell = (s) => String(s).replace(/\r?\n/g, ' ').replace(/\\/g, '\\\\').replace(/\|/g, '\\|');`
Add `stayLocalTable` to module.exports (test-visible; no CLI change).

Write Test list items 7-8 first. On the old code a `\|` input renders `a\\|b.md`, which breaks the
cell, so the tests go RED. Then fix. Commit
`fix(quick-29): escape backslash in table cells, rename wiki rule method (CodeQL)`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs` passes. `rg -n "rule\.match|^\s+match\(rel" plugins/devflow/devflow/bin/lib/gh-wiki.cjs` returns nothing.</verify>
  <done>No rule has a `match` method, the wiki round-trip tests are green, and both table renderers emit `a\\\|b.md` for an `a\|b.md` input.</done>
  <recovery>If the 0011 apply/resume tests snapshot a stay-local table, a changed snapshot means the input already held a backslash. Check before updating it.</recovery>
</task>

<task type="auto">
  <name>Task 3: Replace regex-built test assertions with substring checks, add the CHANGELOG bullet and run the full suite (alerts 140, 141, 142)</name>
  <files>plugins/devflow/devflow/bin/lib/frontmatter.test.cjs, plugins/devflow/devflow/bin/lib/gh-setup.test.cjs, CHANGELOG.md</files>
  <action>
**frontmatter.test.cjs:482 and :484.** Swap the `new RegExp(... .replace(/[.]/g, '\\.') ...)` matches
for substring assertions. Building no regex is cleaner than a full escape:
`strict.ok(r.stderr.includes(\`${FM_TRD_REL} is a GitHub-backed cache file in store mode\`), r.stderr);`
and `strict.ok(r.stderr.includes(\`df-tools planning draft ${FM_TRD_REL}\`), r.stderr);`.

**gh-setup.test.cjs:723.**
`assert.ok(a.desc.includes(a.target), \`${a.desc} names ${a.target}\`);`

Then `rg -n "replace\(/\[\.\]/g" plugins/devflow/devflow/bin/lib/` should return nothing in these files.
Leave other files' pre-existing alerts alone; they are out of scope.

**CHANGELOG.md.** At the end of `## [2.13.0]` → `### Fixed`, just before `### Deprecated` (~line 449),
add one bullet in the style of the 2.11.0 "Two CodeQL alerts new in PR #114" entry (~line 790):
"Eight CodeQL alerts new in PR #121:", then the two ReDoS fixes (`stack-classify` GIT_DIFF option
parsing, the `stack-evidence` trailing-connective strip, now a loop), backslash escaping in the 0011 and
`planning import` stay-local table cells, the gh-wiki page-table method renamed from `match` to
`toPage` (js/regex-injection), and three test assertions that no longer build regexes. Name the CodeQL
rule ids. Do not touch `## [Unreleased]`.

Run the full suite: `npm test`. The only acceptable failure is the known MA-7 handoff-e2e test. Commit
`fix(quick-29): drop regex-built test assertions; changelog for PR #121 CodeQL alerts`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/frontmatter.test.cjs plugins/devflow/devflow/bin/lib/gh-setup.test.cjs` passes. `npm test` fails only MA-7 handoff-e2e. `node plugins/devflow/devflow/bin/df-tools.cjs changelog check 2.13.0` passes.</verify>
  <done>The three test sites use `.includes`, the CHANGELOG 2.13.0 Fixed section has the bullet, and the full suite is green apart from MA-7.</done>
</task>

<validation_gates>
- test: `npm test` (stack profile `gates.task`)
- scoped: `node --test <file...>` for the files each task touches (no `test_scoped` command in the stack profile)
</validation_gates>

<verification>
1. Every new test passes, and the ReDoS tests run at 50000 reps.
2. `rg -n "TRAILING_CONNECTIVE|rule\.match|replace\(/\[\.\]/g" plugins/devflow/devflow/bin/lib/{stack-evidence.cjs,gh-wiki.cjs,frontmatter.test.cjs,gh-setup.test.cjs}` returns nothing.
3. `npm test`: everything green except MA-7 handoff-e2e.
4. `git status --short` shows only this JOB's files changed, and the untracked unrelated files are untouched.
5. Optional, after push: `gh api "repos/AO-Cyber-Systems/devflow-claude/code-scanning/alerts?pr=121&state=open" --jq '.[].number'` no longer lists 138-145 once CodeQL re-runs.
</verification>

## Success criteria

- CodeQL alerts 138-145 are fixed at the source, with no suppressions or `// lgtm` comments.
- The ReDoS regressions are pinned by linear-time tests at 50000 reps, and the cell escaping by backslash tests.
- The only behaviour change is `git -C diff` no longer counting as a captured diff (not a valid git invocation).
- Three atomic commits via `df-tools commit`, scoped to the JOB's files.

## Output

Write `.planning/quick/29-fix-new-codeql-alerts-on-release-pr-121/29-SUMMARY.md` via
`node plugins/devflow/devflow/bin/df-tools.cjs quick summary 29 --from <path>`.
