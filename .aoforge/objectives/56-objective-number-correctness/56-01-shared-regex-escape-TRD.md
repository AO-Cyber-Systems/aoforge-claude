---
objective: 56-objective-number-correctness
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/regex-escape.repo.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs.cjs
  - plugins/devflow/devflow/bin/lib/planning-entity-verbs.cjs
  - plugins/devflow/devflow/bin/lib/frontmatter.cjs
  - plugins/devflow/devflow/bin/lib/frontmatter.test.cjs
  - plugins/devflow/devflow/bin/lib/stack-verify.cjs
  - plugins/devflow/devflow/bin/lib/state.cjs
  - plugins/devflow/devflow/bin/lib/state.test.cjs
  - plugins/devflow/devflow/bin/lib/watcher-daemon.cjs
  - plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs
  - plugins/devflow/devflow/bin/lib/stack-ci.cjs
  - plugins/devflow/devflow/bin/lib/stack-ci.test.cjs
  - plugins/devflow/devflow/bin/lib/planning-import.cjs
  - plugins/devflow/hooks/gate-executor-stop.js
  - plugins/devflow/hooks/gate-executor-stop.test.js
autonomous: true
requirements: [ONUM-01]
must_haves:
  truths:
    - "No production file under plugins/devflow/devflow/bin or plugins/devflow/hooks except lib/text-escape.cjs contains a hand-rolled regex escape (a `.replace(/[...]/g, '\\\\$&')` or a `.replace('.', '\\\\.')` / `.replace(/\\./g, '\\\\.')` dot escape)"
    - "regex-escape.repo.test.cjs fails, naming file:line, when a hand-rolled escape is planted in a scanned production file, and ignores test files, __fixtures__, comment lines and text-escape.cjs"
    - "The 12 former sites (state.cjs x5, gh-hierarchy, planning-verbs, planning-entity-verbs, frontmatter, watcher-daemon, stack-verify, hooks/gate-executor-stop.js) escape through require('./text-escape.cjs').escapeRegExp (the hook through '../devflow/bin/lib/text-escape.cjs')"
    - "stateExtractField(content, 'Progress (%)') reads `**Progress (%):** 40` as '40' (the field name is escaped, not compiled as a group)"
    - "stack-ci expandsAny('x $AxB', ['A.B']) is false: a name is matched literally"
    - "A resolved watcher secret containing regex metacharacters is redacted from the done record"
    - "Every pre-existing test of the touched modules passes unchanged"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/regex-escape.repo.test.cjs
      provides: "repo guard: scanner + planted-sample self-test + live-tree assertion"
    - path: plugins/devflow/devflow/bin/lib/state.cjs
      provides: "stateExtractField / snapshot extractField / 5 former inline escapes through escapeRegExp"
    - path: plugins/devflow/hooks/gate-executor-stop.js
      provides: "summaryExists escapes the TRD id with the shared escapeRegExp"
  key_links:
    - "npm test -> regex-escape.repo.test.cjs -> scanTree(bin, hooks) -> [] (fails CI on a new hand-rolled escape)"
    - "state/gh-hierarchy/planning-verbs/planning-entity-verbs/frontmatter/stack-verify/watcher-daemon/stack-ci/planning-import -> text-escape.cjs escapeRegExp"
    - "hooks/gate-executor-stop.js -> ../devflow/bin/lib/text-escape.cjs escapeRegExp"
---

# TRD 56-01: One regex escape, guarded in CI (ONUM-01)

<objective>
Route every regex escape in df-tools and the hooks through `lib/text-escape.cjs`, and add a repository test that fails CI
when someone hand-rolls a new one.

Objective 54 created `text-escape.cjs` (`escapeRegExp`, `objectiveNumPattern`, `mdCell`) and moved four copies onto it. Twelve
hand-rolled escapes remain in eight production files. Five other sites interpolate text into a `new RegExp(...)` source with
no escape at all. Each is a small swap; the guard keeps them from coming back.

Purpose: the milestone's objective lookups (56-02 onward) build regexes from objective numbers, labels and IDs. They need one
escape that CI enforces.
Output: `regex-escape.repo.test.cjs` (new), twelve hand-rolled sites removed, five unescaped interpolations wrapped.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD per task: a failing `test(56-01): ...` commit before the `fix(56-01): ...` / `refactor(56-01): ...` commit.
  Task 2 is a behaviour-preserving refactor and has no new behaviour test. Its RED is the Task 1 guard.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>` (repo source, not the
  `~/.claude/devflow` mirror). Use one plain command per Bash call, because the worktree guard refuses compound commands.
- Edit the repo source under `plugins/devflow/`, never `~/.claude/devflow/`.
- Fixtures are hand-built: planted source strings and mkdtemp trees. Do not use generated sample data or property-based tests.
- Do NOT touch `lib/text-escape.cjs`, `helpers.cjs`, `objective.cjs`, `misc.cjs`, `roadmap*.cjs`, `trd-pre-check.cjs` or
  `novel-domain.cjs`. TRD 56-02 owns them in this wave.
- Production code only: `*.test.cjs`, `*.test.js` and `__fixtures__/` keep their own local escapes (six test files have one).
  The requirement names df-tools modules, and test helpers are not modules.
- Do not change the replacement semantics of state.cjs's `content.replace(pattern, \`$1${value}\`)`. A `$` in a value is a
  separate issue. This TRD fixes regex sources only.

## Test list

Outermost first.

Repo guard (`regex-escape.repo.test.cjs`, new):
1. Live tree: `scanTree([<bin>, <hooks>])` returns `[]`. RED today; the failure message lists all 12 sites as `file:line`
   (state.cjs:106,129,200,241,276; gh-hierarchy.cjs:267; planning-verbs.cjs:567; planning-entity-verbs.cjs:511;
   frontmatter.cjs:222; watcher-daemon.cjs:187; stack-verify.cjs:655; hooks/gate-executor-stop.js:300).
2. Non-vacuous walk: the scan visited at least 100 production files, and at least one of them is under `hooks/`.
3. The exemption is real: `lib/text-escape.cjs` still contains the canonical `'\\$&'` escape and the scanner skips it.
4. Planted tree (mkdtemp): `lib/bad.cjs` with `s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` is reported. So are a
   double-quoted variant with a different metachar class (`x.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")`), `n.replace('.', '\\.')`
   and `n.replace(/\./g, '\\.')`, each with the right file and line.
5. Planted tree: the same lines in `lib/bad.test.cjs`, `lib/__fixtures__/f.cjs`, `lib/text-escape.cjs` and a comment line
   (`// ... .replace('.', '\\.')`) are NOT reported. `slug.replace(/\./g, '_')` and `escapeRegExp(s)` are not reported.

Unescaped interpolations (unit, in each module's existing test file):
6. state.test.cjs: `stateExtractField('**Progress (%):** 40\n', 'Progress (%)')` returns `'40'`. RED: `(%)` compiles as a
   group today, so the result is null.
7. stack-ci.test.cjs: `expandsAny('x $AxB', ['A.B'])` is false and `expandsAny('x ${A}', ['A'])` is still true. RED: `.` is a
   wildcard today.
8. watcher-daemon.test.cjs: a TP-5 copy whose secret is `p.ss(w)rd+$1[x]` (length >= 8) and whose fake tool echoes it.
   The done record's stdout no longer contains it. This guard passes today and pins the swap.
9. frontmatter.test.cjs: `parseMustHavesBlock` still reads `truths` / `artifacts` / `key_links` (existing tests). This guard
   passes unchanged.
10. hooks/gate-executor-stop.test.js: `summaryExists('12.1-03', [root])` is false when only `1201-03-SUMMARY.md` and
    `12x1-03-SUMMARY.md` exist, and true for `12.1-03-x-SUMMARY.md`. This guard passes today and pins the swap.

<embedded_context>

<codebase_examples>
The shared helper (lib/text-escape.cjs). It requires nothing, so hooks can load it on every call:

```js
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
module.exports = { escapeRegExp, objectiveNumPattern, mdCell };
```

How a hook already imports it (hooks/changelog-on-tag.js:54):

```js
const { escapeRegExp } = require('../devflow/bin/lib/text-escape.cjs');
```

Repo-guard shape to follow (lib/gh-seam.repo.test.cjs): `node:test` + `node:assert/strict`, a header comment that names the
TRD and the invariant, static reads of production files with `fs.readFileSync`, and assertion messages that list offending
`file:line` entries.

Scanner sketch. Export nothing; keep it local to the test file:

```js
const LIB = __dirname;                                   // plugins/devflow/devflow/bin/lib
const BIN = path.resolve(LIB, '..');                     // plugins/devflow/devflow/bin
const HOOKS = path.resolve(LIB, '..', '..', '..', 'hooks'); // plugins/devflow/hooks

// '\\$&' in source: a backslash-prefixed whole-match back-reference exists only to escape regex metacharacters.
const META_ESCAPE = /(['"`])\\\\\$&\1/;
// .replace('.', '\\.') or .replace(/\./g, '\\.'): a partial (dot-only) escape.
const DOT_ESCAPE = /\.replace\(\s*(?:(['"])\.\1|\/\\\.\/g?)\s*,\s*(['"`])\\\\\.\2\s*\)/;
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);
const skipFile = (rel) => /\.test\.c?js$/.test(rel) || rel.split(path.sep).includes('__fixtures__')
  || rel.split(path.sep).includes('node_modules') || path.basename(rel) === 'text-escape.cjs';

function findHandRolled(text) { /* per line: !isComment && (META_ESCAPE || DOT_ESCAPE) -> {line, kind} */ }
function scanTree(roots) { /* recursive walk; .cjs under bin, .js under hooks; skipFile; returns [{file, line, kind}] */ }
```

Module-level lambdas to delete (all used only inside their own file, none exported):

```js
// gh-hierarchy.cjs:267, planning-verbs.cjs:567, planning-entity-verbs.cjs:511
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// frontmatter.cjs:222, stack-verify.cjs:655
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
```

Unescaped interpolations to wrap:

```js
// state.cjs:100 stateExtractField (exported; migration 0003 calls it) and :607 cmdStateSnapshot's extractField
new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`, 'i')
// stack-ci.cjs:304 expandsAny (exported)
names.some((n) => new RegExp(`\\$(?:\\{${n}(?![A-Za-z0-9_])|${n}(?![A-Za-z0-9_]))`).test(t))
// planning-import.cjs:111 frontmatterField (internal; called with 'trd' and 'resolution')
new RegExp(`^${key}:[ \\t]*(.*?)\\s*$`, 'm')
// frontmatter.cjs:332 parseMustHavesBlock (called with 'truths' | 'artifacts' | 'key_links')
new RegExp(`^ {${childIndent}}${blockName}:\\s*$`)
```
</codebase_examples>

<anti_patterns>
- Do not add a second escape helper (`escapeRe`, `escapeRegex`, `esc`) anywhere. Import `escapeRegExp`.
- Do not edit `text-escape.cjs`. The 54-01 SUMMARY records that its return line is character-identical to the sanitizer
  shape CodeQL recognises.
- Do not loosen the scanner to make the live tree pass. If it flags a line that is not an escape, fix the line, or make the
  rule exact and add a planted negative case for it.
- `childIndent` in frontmatter.cjs is a number and stays as is. Wrap only `blockName`.
</anti_patterns>

<error_recovery>
- A hook that throws on require fails open in some hooks and blocks in others. After the hook edit, run
  `node -e "require('./plugins/devflow/hooks/gate-executor-stop.js')"` from the repo root. It must print nothing and exit 0.
- If `gh-hierarchy.cjs` / `planning-verbs.cjs` / `planning-entity-verbs.cjs` previously threw on a non-string (`s.replace`)
  and a test relied on that, keep the test and coerce at the call site. Do not reintroduce a local helper.
- If the planted-tree test is flaky on path separators, compare `path.relative(root, file).split(path.sep).join('/')`.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/text-escape.cjs
@plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs
</context>

<gotchas>
- `hooks/` holds `.js` files. `devflow/bin` holds `.cjs` files, plus `lib/migrations/*.cjs`. Walk both recursively.
- Six test files hand-roll an escape (handoff-e2e.test.cjs, model-profiles.test.cjs, planning-writes.repo.test.cjs,
  devflow-workflows.repo.test.cjs, agent-shell-harness.test.cjs, hooks/gate-interactive.test.js). They are out of scope
  and must be skipped, not converted.
- `roadmap-progress.cjs:21` has a comment mentioning `.replace('.', '\\.')`. The comment-line skip must keep it silent.
- The worktree-isolation harness guard refuses compound Bash commands (`cd x && y`). Use absolute paths and one command per call.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Hand-built planted fixtures + the regex-escape repo guard (RED)</name>
  <files>plugins/devflow/devflow/bin/lib/regex-escape.repo.test.cjs</files>
  <action>
Create `regex-escape.repo.test.cjs` with a header comment ("TRD 56-01, ONUM-01: every regex escape in production df-tools
and hooks goes through lib/text-escape.cjs"). Implement `findHandRolled(text)` and `scanTree(roots)` as sketched in
codebase_examples.

Fixture builder first: write a `plantTree(files)` helper that takes `{ 'lib/bad.cjs': '...', ... }`, writes each file under
a `fs.mkdtempSync(path.join(os.tmpdir(), 'regex-escape-'))` root, and returns the root. Remove the root in `afterEach`.
Write each planted line by hand (test list items 4-5).

Then write tests 1-5 from the Test list. Test 1's assertion message must print every offending `file:line kind`
(relative to the plugin root), so the RED run doubles as the work list for Tasks 2-3.

Commit RED: `test(56-01): repo guard against hand-rolled regex escapes`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/regex-escape.repo.test.cjs` fails only test 1, and its message lists exactly the 12 sites named in the Test list. Tests 2-5 pass.</verify>
  <done>The guard exists. Its self-tests prove that it catches a planted escape and skips tests, fixtures, comments and text-escape.cjs. The live-tree test is RED and lists the 12 sites.</done>
  <recovery>If the walk reaches fewer than 100 files, the root resolution is wrong. Print `BIN` and `HOOKS` and fix the `path.resolve` segments before going on.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Delete the five module-level escapeRe lambdas (gh-hierarchy, planning-verbs, planning-entity-verbs, frontmatter, stack-verify)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs, plugins/devflow/devflow/bin/lib/planning-verbs.cjs, plugins/devflow/devflow/bin/lib/planning-entity-verbs.cjs, plugins/devflow/devflow/bin/lib/frontmatter.cjs, plugins/devflow/devflow/bin/lib/stack-verify.cjs, plugins/devflow/devflow/bin/lib/frontmatter.test.cjs</files>
  <action>
In each of the five modules:
1. Add `const { escapeRegExp } = require('./text-escape.cjs');` next to the existing local requires.
2. Delete the `const escapeRe = ...` line.
3. Rename every `escapeRe(` call in that file to `escapeRegExp(`. Use `rg -n "escapeRe\(" <file>` to find them:
   gh-hierarchy :276, planning-verbs :600, planning-entity-verbs :528 and :551, frontmatter :269, stack-verify :676 and :688.

In frontmatter.cjs also wrap `blockName` in `parseMustHavesBlock` (:332):
`new RegExp(\`^ {${childIndent}}${escapeRegExp(blockName)}:\\s*$\`)`. Add a frontmatter.test.cjs case showing that
`parseMustHavesBlock(content, 'artifacts')` still returns the same entries as before. Reuse an existing fixture in that file.

This is a behaviour-preserving refactor. Run each module's existing tests after its edit. Commit:
`refactor(56-01): module-level escapes use the shared escapeRegExp`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs plugins/devflow/devflow/bin/lib/frontmatter.test.cjs plugins/devflow/devflow/bin/lib/stack-verify.test.cjs` passes. `rg -n "const escapeRe\b" plugins/devflow/devflow/bin/lib --glob '!*.test.cjs'` prints nothing. The repo guard now lists only 7 sites (state x5, watcher-daemon, the hook).</verify>
  <done>The five lambdas are gone, and each module imports escapeRegExp. Their existing suites pass unchanged.</done>
  <recovery>If a suite fails, `git diff` that one file. A wrong rename (an `escapeRe` left behind, or a missing require) is the usual cause. Revert that file with `git checkout -- <file>` and redo it.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Inline escapes and unescaped interpolations (state, watcher-daemon, gate-executor-stop hook, stack-ci, planning-import) to GREEN</name>
  <files>plugins/devflow/devflow/bin/lib/state.cjs, plugins/devflow/devflow/bin/lib/state.test.cjs, plugins/devflow/devflow/bin/lib/watcher-daemon.cjs, plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs, plugins/devflow/hooks/gate-executor-stop.js, plugins/devflow/hooks/gate-executor-stop.test.js, plugins/devflow/devflow/bin/lib/stack-ci.cjs, plugins/devflow/devflow/bin/lib/stack-ci.test.cjs, plugins/devflow/devflow/bin/lib/planning-import.cjs</files>
  <action>
RED first. Add tests 6, 7, 8 and 10 from the Test list to state.test.cjs, stack-ci.test.cjs, watcher-daemon.test.cjs and
hooks/gate-executor-stop.test.js. Tests 6 and 7 fail. Tests 8 and 10 are guards and pass. Commit:
`test(56-01): metacharacter field names, shell names, secrets and TRD ids match literally`.

Then GREEN:
- state.cjs: require `escapeRegExp`. Replace the five inline `X.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` expressions (:106,
  :129, :200, :241, :276) with `escapeRegExp(X)`. Wrap `fieldName` in `stateExtractField` (:100) and in
  `cmdStateSnapshot`'s `extractField` (:607).
- watcher-daemon.cjs `_redactSecrets` (:187): `const esc = escapeRegExp(sec.value);`.
- hooks/gate-executor-stop.js: `const { escapeRegExp } = require('../devflow/bin/lib/text-escape.cjs');` beside the other
  requires (:38-40). At :300, use `new RegExp(\`^${escapeRegExp(id)}(?:-.+)?-SUMMARY\\.md$\`)`.
- stack-ci.cjs `expandsAny` (:304): escape `n` once per name and use it in both alternatives.
- planning-import.cjs `frontmatterField` (:111): `escapeRegExp(key)`.

Commit GREEN: `fix(56-01): route every regex escape through text-escape.cjs`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/regex-escape.repo.test.cjs plugins/devflow/devflow/bin/lib/state.test.cjs plugins/devflow/devflow/bin/lib/stack-ci.test.cjs plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs plugins/devflow/devflow/bin/lib/planning-import.test.cjs plugins/devflow/hooks/gate-executor-stop.test.js` passes, including repo-guard test 1. `node -e "require('./plugins/devflow/hooks/gate-executor-stop.js')"` exits 0.</verify>
  <done>The repo guard is green. No production file outside text-escape.cjs hand-rolls an escape. The five interpolation sites are escaped, tests 6-7 flipped from RED to GREEN, and guard tests 8 and 10 still pass.</done>
  <recovery>If a state.test.cjs characterization test (48-13) changes bytes, the swap altered an input. Diff the escaped value before and after: `escapeRegExp` must give the same string as the inline expression for every string input.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/regex-escape.repo.test.cjs plugins/devflow/devflow/bin/lib/state.test.cjs plugins/devflow/devflow/bin/lib/stack-ci.test.cjs plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs plugins/devflow/devflow/bin/lib/frontmatter.test.cjs plugins/devflow/hooks/gate-executor-stop.test.js</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/regex-escape.repo.test.cjs` passes.
- `rg -n -F "'\\\\\$&'" plugins/devflow/devflow/bin plugins/devflow/hooks --glob '!*.test.*' --glob '!**/__fixtures__/**'` prints only `lib/text-escape.cjs`.
- Plant `const e = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');` in any lib module and rerun the guard. It fails and names that file:line. Revert the plant.
- The touched modules' suites pass. ONUM-01 holds for the requirement's list plus stack-verify and the gate-executor-stop hook.
</verification>

<success_criteria>
- Success criterion 1 of objective 56 holds: no df-tools module hand-rolls a regex escape, and a repo test fails CI when one appears.
- Tests 6-7 went RED then GREEN. Tests 8 and 10 pin the swaps.
</success_criteria>

<output>
After completion, publish `56-01-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as execute-trd
describes. List the 12 removed sites and the 5 wrapped interpolations by file:line.
</output>
