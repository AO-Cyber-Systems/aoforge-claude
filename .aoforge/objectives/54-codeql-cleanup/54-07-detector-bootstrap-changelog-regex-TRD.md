---
objective: 54-codeql-cleanup
trd: "07"
type: standard
wave: 2
depends_on: ["54-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/novel-domain.cjs
  - plugins/devflow/devflow/bin/lib/novel-domain.test.cjs
  - plugins/devflow/devflow/bin/lib/trd-pre-check.cjs
  - plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs
  - plugins/devflow/devflow/bin/lib/project-bootstrap.cjs
  - plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs
  - plugins/devflow/devflow/bin/lib/changelog.cjs
  - plugins/devflow/devflow/bin/lib/changelog.test.cjs
  - plugins/devflow/hooks/changelog-on-tag.js
autonomous: true
requirements: ["54-A"]
codeql_alerts: [91, 93, 92, 94, 110, 111, 64, 83, 101]
must_haves:
  truths:
    - "novel-domain.cjs, trd-pre-check.cjs and project-bootstrap.cjs build their ROADMAP header regexes with text-escape's objectiveNumPattern; a malformed objective argument such as `1(` never throws a SyntaxError"
    - "bootstrapObjectiveMd for `04.1-one` takes the name and goal from `### Objective 4.1:` even when `### Objective 401:` appears first (project-bootstrap.cjs escaped nothing)"
    - "bootstrapObjectiveMd does not borrow the next section's `**Goal:**` when objective N's own section has none"
    - "changelog `hasVersionEntry(cwd, '1.0.0+build.1')` is true when CHANGELOG.md has `## [1.0.0+build.1]` (the unescaped `+` made it false)"
    - "hooks/changelog-on-tag.js escapes the version with the shared escapeRegExp (required from ../devflow/bin/lib/text-escape.cjs) and its existing tests pass"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/changelog.test.cjs
      provides: "hasVersionEntry cases for +build, -rc and dotted versions"
  key_links:
    - "hooks/changelog-on-tag.js -> require('../devflow/bin/lib/text-escape.cjs') (same relative pattern as hooks/classify-session.js:35)"
    - "changelog.cmdChangelogCheck -> hasVersionEntry -> escapeRegExp"
---

# TRD 54-07: Objective and version regexes in detectors, bootstrap, changelog and the tag hook (group A, part 2 of 2)

<objective>
Route the remaining group A interpolation sites through `text-escape.cjs` (TRD 54-01) and fix the matching bugs that the missing
escapes cause.

CodeQL alerts (post-merge scan of main, 2f0ed83b):

| Alert | Rule | Site |
|---|---|---|
| 91, 93 | incomplete-sanitization, regex-injection | novel-domain.cjs:333-334 (cmdDetectNovelDomain ROADMAP header) |
| 92, 94 | incomplete-sanitization, regex-injection | trd-pre-check.cjs:132-133 (extractRoadmapRequirements header) |
| 110, 111 | regex-injection | project-bootstrap.cjs:157, :161 (bootstrapObjectiveMd heading + Goal; no escaping at all) |
| 64, 83 | regex-injection, incomplete-sanitization | changelog.cjs:120 (hasVersionEntry) |
| 101 | incomplete-sanitization | hooks/changelog-on-tag.js:220 |

What each one does today:
- novel-domain / trd-pre-check escape every dot and already have a `[:\s]` boundary. Any other metacharacter in the objective
  argument reaches `new RegExp`, and `(` throws. Swap to the helper. No other change.
- project-bootstrap escapes nothing: objective `4.1` matches heading `### Objective 401:`. Its Goal regex
  `### Objective N:[\s\S]*?\*\*Goal:\*\*` also runs past the end of the section and takes the next objective's goal when N has none.
- changelog.cjs escapes dots only. A SemVer build or pre-release version with `+` (`1.0.0+build.1`) never finds its own entry, so
  `changelog check` reports it missing.
- The hook's `TAG_RE` (changelog-on-tag.js:61) only captures `v\d+\.\d+\.\d+`, so in practice dots are the only metacharacter that
  reaches line 220. The swap there is defensive: it closes alert 101 and removes the last hand-rolled version escape.

Hooks may require bin/lib modules: `hooks/classify-session.js:35` and `hooks/awareness-cache-populate.js:40` already do
(`require('../devflow/bin/lib/...')`), and `text-escape.cjs` has no requires, so the hook stays cheap.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD per task: `test(54-07): ...` (failing) before `fix(54-07): ...`. A test for a suspected bug that passes on unmodified
  code stays as a regression guard; record it in the commit message and SUMMARY.
- The hook swap (Task 3, last step) has no reachable behaviour change, so the existing changelog-on-tag.test.js is its gate.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Hand-built fixtures inline. No generated data, no property-based tests.

## Test list

Outermost first within each module (the command/exported function is the outer surface).

novel-domain.test.cjs (use the existing in-process `runCmd(cwd, objective, raw)` harness at :64):
1. With a ROADMAP containing `### Objective 1: Something` and no objective dir, `runCmd(cwd, '1(', true)` does not throw and exits 0
   with JSON. Expected RED (SyntaxError). If the argument is rejected before the ROADMAP lookup, keep it as a guard.
2. Decimal `4.1` resolves the `### Objective 4.1:` section when `### Objective 401:` and `### Objective 4.10:` precede it. (Guard.)

trd-pre-check.test.cjs (existing `runCheck(cwd, objective)` at :71):
3. `runCheck(cwd, '1(')` with a ROADMAP present does not throw. Expected RED, same caveat as 1.
4. Requirements extraction for `4.1` ignores a preceding `### Objective 4.10:` section. (Guard.)

project-bootstrap.test.cjs (direct `bootstrapObjectiveMd(repo, id)`, as at :194):
5. ROADMAP has `### Objective 401: Wrong` (with `**Goal:** wrong goal`) before `### Objective 4.1: Right` (with
   `**Goal:** right goal`). `bootstrapObjectiveMd(repo, '04.1-right')` writes an OBJECTIVE.md whose title line is `# Right` and that
   contains `right goal`. Expected RED.
6. `### Objective 2: NoGoal` (no Goal line) followed by `### Objective 3: Has` (`**Goal:** three`): bootstrapping `02-nogoal` keeps
   the placeholder goal and does not contain `three`. Expected RED.
7. Existing integer case (`01-foo`) is unchanged. (Existing tests.)

changelog.test.cjs (new; temp dir with a hand-written CHANGELOG.md; `require('./changelog.cjs').hasVersionEntry`):
8. `## [1.0.0+build.1] - 2026-10-04` -> `hasVersionEntry(dir, '1.0.0+build.1') === true`. Expected RED.
9. Same file -> `hasVersionEntry(dir, '1.0.0') === false`.
10. `## [1.0.0-rc.1] - 2026-10-04` -> `hasVersionEntry(dir, '1.0.0-rc.1') === true`. (Guard.)
11. `## [401.0.0]` only -> `hasVersionEntry(dir, '4.1.0') === false`; `## [4.1.0]` -> true. (Guard.)
12. No CHANGELOG.md -> false. (Guard.)

<embedded_context>

<codebase_examples>
Shared helper from TRD 54-01:

```js
const { escapeRegExp, objectiveNumPattern } = require('./text-escape.cjs');
```

novel-domain.cjs:331-333 / trd-pre-check.cjs:131-133 (same shape):

```js
const numStr = String(objectiveNum);
const escapedNum = numStr.replace(/\./g, '\\.');
const headerRe = new RegExp(`^#{2,4}\\s+Objective\\s+${escapedNum}[:\\s]`, 'm');
```

Target: `const headerRe = new RegExp(\`^#{2,4}\\s+Objective\\s+${objectiveNumPattern(objectiveNum)}[:\\s]\`, 'm');` and delete
`escapedNum`. Keep `numStr` only if it is used later.

project-bootstrap.cjs:148-162:

```js
const objectiveNum = String(objectiveId).split('-')[0].replace(/^0+/, '') || '0';
...
const headingRe = new RegExp(`^### Objective ${objectiveNum}:\\s*(.+)$`, 'm');
...
const goalRe = new RegExp(`### Objective ${objectiveNum}:[\\s\\S]*?\\*\\*Goal:\\*\\*\\s*([^\\n]+)`, 'm');
```

Target: `const num = objectiveNumPattern(objectiveNum);` then `headingRe` with `${num}`, and the Goal lookup bounded to the
section:

```js
const headingRe = new RegExp(`^### Objective ${num}:\\s*(.+)$`, 'm');
const headingMatch = headingRe.exec(roadmap);
if (headingMatch) {
  objectiveName = headingMatch[1].trim();
  const rest = roadmap.slice(headingMatch.index + headingMatch[0].length);
  const next = rest.search(/\n#{2,4}\s*Objective\s+\d|\n##\s/); // next objective or milestone heading
  const section = next === -1 ? rest : rest.slice(0, next);
  const goalMatch = section.match(/\*\*Goal:\*\*\s*([^\n]+)/);
  if (goalMatch) goalLine = goalMatch[1].trim();
}
```

`'04.1'.replace(/^0+/, '')` is `'4.1'`, which is what the test expects. Leave that normalisation as is.

changelog.cjs:116-121 and hooks/changelog-on-tag.js:220 (same expression):

```js
const versionRe = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm');
```

Target in changelog.cjs: `const { escapeRegExp } = require('./text-escape.cjs');` then `${escapeRegExp(version)}`.
Target in the hook, next to its other requires (:50-53):
`const { escapeRegExp } = require('../devflow/bin/lib/text-escape.cjs');`, then the same expression.
</codebase_examples>

<anti_patterns>
- Do not make the hook require `changelog.cjs`. It pulls in helpers.cjs (model-profiles JSON load) on every PreToolUse(Bash).
  text-escape.cjs has no requires.
- Do not widen the hook's TAG_RE to accept `+`/`-rc` tags. That is a behaviour change outside this objective.
- Do not change project-bootstrap's leading-zero normalisation or its `### ` (exactly three hashes) heading convention.
- Do not stop the novel-domain/trd-pre-check section scan at a different boundary. Only the header regex changes.
</anti_patterns>

<error_recovery>
- If test 1 or 3 cannot reach the ROADMAP branch, read the function's earlier priority (OBJECTIVE.md / objective dir lookup) and
  build the fixture so that branch misses. If the argument is validated before any regex, record the test as a guard.
- If changelog-on-tag.test.js fails after the hook edit with MODULE_NOT_FOUND, the relative path is wrong: the hook lives in
  `plugins/devflow/hooks/`, the module in `plugins/devflow/devflow/bin/lib/`, so it is `'../devflow/bin/lib/text-escape.cjs'`.
</error_recovery>

</embedded_context>

<file_tree>
plugins/devflow/
├── hooks/changelog-on-tag.js                ← MODIFY (require text-escape)
└── devflow/bin/lib/
    ├── changelog.cjs                        ← MODIFY
    ├── changelog.test.cjs                   ← CREATE
    ├── novel-domain.cjs / .test.cjs         ← MODIFY
    ├── trd-pre-check.cjs / .test.cjs        ← MODIFY
    └── project-bootstrap.cjs / .test.cjs    ← MODIFY
</file_tree>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: novel-domain and trd-pre-check header regexes on objectiveNumPattern (alerts 91, 93, 92, 94)</name>
  <files>plugins/devflow/devflow/bin/lib/novel-domain.test.cjs, plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs, plugins/devflow/devflow/bin/lib/novel-domain.cjs, plugins/devflow/devflow/bin/lib/trd-pre-check.cjs</files>
  <action>
RED: add test-list items 1-2 to novel-domain.test.cjs and 3-4 to trd-pre-check.test.cjs. Run them and record which fail. Commit
`test(54-07): failing tests for metacharacter objective args in novel-domain and trd-pre-check`.

GREEN: in both modules, import objectiveNumPattern and replace the `escapedNum` construction with `objectiveNumPattern(objectiveNum)`
in the header regex (codebase_examples). Commit `fix(54-07): shared objective-number escape in novel-domain and trd-pre-check`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/novel-domain.test.cjs plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs</verify>
  <done>Items 1-4 pass; all pre-existing tests in both files pass; `rg -n "escapedNum" plugins/devflow/devflow/bin/lib/novel-domain.cjs plugins/devflow/devflow/bin/lib/trd-pre-check.cjs` prints nothing.</done>
  <recovery>If runCmd's process.exit stub swallows a thrown SyntaxError differently than expected, assert on `exitCode === 0` and a parseable stdout instead of on the absence of a throw.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: project-bootstrap heading and section-bounded Goal lookup (alerts 110, 111)</name>
  <files>plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs, plugins/devflow/devflow/bin/lib/project-bootstrap.cjs</files>
  <action>
RED: add items 5-6 to project-bootstrap.test.cjs. Create `.planning/objectives/04.1-right/` and `.planning/objectives/02-nogoal/` in
the temp repo the way the existing `01-foo` test does. Both fail today. Commit
`test(54-07): failing tests for decimal heading and goal bleed in bootstrapObjectiveMd`.

GREEN: apply the project-bootstrap target from codebase_examples. Commit
`fix(54-07): escape objective number and bound goal lookup to its section in bootstrapObjectiveMd`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs</verify>
  <done>Items 5-7 pass and every pre-existing project-bootstrap test passes.</done>
  <recovery>If an existing test expected a goal from a later section, it encoded the bleed bug; fix its fixture and say so in the SUMMARY.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: changelog version match via escapeRegExp, plus the tag hook (alerts 64, 83, 101)</name>
  <files>plugins/devflow/devflow/bin/lib/changelog.test.cjs, plugins/devflow/devflow/bin/lib/changelog.cjs, plugins/devflow/hooks/changelog-on-tag.js</files>
  <action>
RED: create changelog.test.cjs (node:test, node:assert/strict, fs, os, path; mkdtemp per test) with items 8-12. Item 8 fails today.
Commit `test(54-07): failing test for +build versions in changelog hasVersionEntry`.

GREEN:
1. changelog.cjs: import escapeRegExp; `hasVersionEntry` uses `${escapeRegExp(version)}`.
2. hooks/changelog-on-tag.js: add the require next to the existing ones and use `${escapeRegExp(version)}` at :220.
Run changelog-on-tag.test.js and the df-tools changelog cases. Commit
`fix(54-07): escape versions with the shared escapeRegExp in changelog and the tag gate`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/changelog.test.cjs plugins/devflow/hooks/changelog-on-tag.test.js</verify>
  <done>Items 8-12 pass; changelog-on-tag.test.js passes unchanged; `rg -n "replace\(/\\\\\./g" plugins/devflow/devflow/bin/lib/changelog.cjs plugins/devflow/hooks/changelog-on-tag.js` prints nothing.</done>
  <recovery>If changelog-on-tag.test.js spawns the hook from a copied location (a temp dir), the relative require breaks there; check how the test locates the hook and, if it copies the file, resolve the module with `path.join(__dirname, '..', 'devflow', 'bin', 'lib', 'text-escape.cjs')` (same thing, explicit).</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- The three task verify commands pass.
- `rg -n "replace\(/\\\\\./g|replace\('\.'" plugins/devflow/devflow/bin/lib/{novel-domain,trd-pre-check,project-bootstrap,changelog}.cjs plugins/devflow/hooks/changelog-on-tag.js` prints nothing.
- `node -e "console.log(require('./plugins/devflow/devflow/bin/lib/changelog.cjs').hasVersionEntry('.', '2.13.0'))"` prints `true` for this repo's CHANGELOG.
</verification>

<success_criteria>
Every remaining objective or version regex in group A goes through the shared helper. Decimal objectives and SemVer versions
with `+` match only themselves. Alerts 64, 83, 91-94, 101, 110 and 111 have no remaining source pattern.
</success_criteria>

<output>
After completion, create `.planning/objectives/54-codeql-cleanup/54-07-SUMMARY.md` via `df-tools summary post`.
</output>
