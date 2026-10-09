---
objective: quick-33
trd: 01
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/estimate-format.cjs
  - plugins/devflow/devflow/bin/lib/estimate-format.test.cjs
  - plugins/devflow/devflow/bin/lib/skill-requires.test.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/14-skill-requires.test.cjs
  - plugins/devflow/hooks/gate-commits-merge-sequence.test.js
autonomous: true
must_haves:
  truths:
    - "estimate-format.cjs escapes every milestone-table and backtest-report cell it used to pipe-escape through the shared mdCell from lib/text-escape.cjs (backslash before pipe). The local `cell` and `cellText` helpers are gone and `rg -n -F \"replace(/\\|/g\" plugins/devflow --glob '!*.test.*' --glob '!*.md'` prints only text-escape.cjs"
    - "A milestone objective name and a backtest objective name containing `\\|` each render as ONE cell (the row has the header's cell count), and unescaping that cell gives back the original label"
    - "skill-requires.test.cjs and doctor-checks/14-skill-requires.test.cjs have no `.includes(` on a string literal containing a hostname. Each install hint is asserted by exact equality, either against INSTALL_HINTS.<tool> or against the exact composed string. Their counts are unchanged (42/42 and 17/17 pass)"
    - "gate-commits-merge-sequence.test.js spawns no shell. Documented commands run as argv arrays with no shell, and a runnable command with a shell metacharacter fails the test loudly instead of being run. 21/21 pass"
    - "`npm test` has 0 failures and 34 skipped, with tests = 11073 + N and pass = 11039 + N, where N is the number of tests Task 1 adds (baseline 11073/11039/0/34 at 66f64a2d)"
    - "CHANGELOG.md is not modified, and nothing is pushed"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/estimate-format.cjs
      provides: "milestoneTable and the backtest report label and class cells call mdCell. No local pipe-only escaper is left"
    - path: plugins/devflow/devflow/bin/lib/estimate-format.test.cjs
      provides: "round-trip tests: a `\\|` value in a milestone objective name and in a backtest objective name stays one cell and unescapes to the original"
    - path: plugins/devflow/devflow/bin/lib/skill-requires.test.cjs
      provides: "6a/6b/6f assert the hints exactly (lines 294, 310, 311, 335, 336)"
    - path: plugins/devflow/devflow/bin/lib/doctor-checks/14-skill-requires.test.cjs
      provides: "9/9c/10/10b/12b assert fix_command by assert.equal (lines 87, 107, 125, 132-134, 176)"
    - path: plugins/devflow/hooks/gate-commits-merge-sequence.test.js
      provides: "argvOf(cmd) + runArgv(argv, cwd) replace sh(cmd, cwd). The resolve step passes an explicit argv"
  key_links:
    - from: "estimate-format.cjs"
      to: "text-escape.cjs mdCell"
      via: "const { mdCell } = require('./text-escape.cjs'), called at the former cell()/cellText() sites (lines ~342/350, ~452/455/566)"
    - from: "replay() step() in gate-commits-merge-sequence.test.js (~line 309)"
      to: "runArgv(argv, cwd) -> spawnSync(argv[0], argv.slice(1), { cwd, env: gitEnv() })"
      via: "argv = opts.argv || argvOf(cmd), computed only when the step actually runs (df-tools lines are hook-checked only and contain `~`)"
---

# Quick 33: clear the 13 new CodeQL alerts on release PR #126

## Objective

Objective 54 brought CodeQL on main to 0 open alerts. Release PR #126 (2.14.0, objectives 56-64) adds 13 new alerts.
Clear all 13 by removing each source pattern, using objective 54's helpers and precedents. No test may lose its meaning.

| Rule | Severity | Sites | Fix |
|---|---|---|---|
| js/incomplete-url-substring-sanitization | high | 14-skill-requires.test.cjs 87, 107, 125, 132, 133, 176; skill-requires.test.cjs 310, 311, 335, 336 | exact equality against `INSTALL_HINTS` or the exact composed string (Task 2) |
| js/incomplete-sanitization | high | estimate-format.cjs 342 (`cell`), 452 (`cellText`) | the shared `mdCell` from `lib/text-escape.cjs` (54-01), test first (Task 1) |
| js/shell-command-constructed-from-input | medium | gate-commits-merge-sequence.test.js 76 (`sh -c cmd`) | argv with no shell, following 54-04 Case V1 (Task 3) |

The shell is not needed in Task 3. Every runnable documented line matches a `CATEGORIES` regex (lines 276-285) of plain words.
The only line with a shell-significant character (`~` in `node ~/.claude/...`) is either hook-checked only (`run: false`)
or already rewritten to this repository's df-tools before it runs. Spawning `[argv0, ...rest]` therefore runs the same
command `sh -c` ran. 54-05's constant-script-with-positional-parameters form is for a test where a real `sh` is the thing
under test, and that is not the case here.

No local CodeQL CLI is installed. The alerts close when the PR's CodeQL job re-runs after the user pushes. Here,
"cleared" means the flagged source pattern is gone (the post-condition greps in each task) and every test still passes.

## Locked decisions

- **No CHANGELOG change.** The escaping bug never shipped. `estimate-format.cjs` and both affected renderers
  (`estimate milestone`'s table, objective 58; `estimate backtest`'s report, objective 64) are new in 2.14.0, which is
  untagged. `git tag -l 'v2.14*'` prints nothing, and `git tag --contains` on the commit that created estimate-format.cjs
  prints nothing. The 2.14.0 `### Added` entries describe these features as they will ship, with correct escaping. A `### Fixed`
  line would describe a defect no released version had, and Keep-a-Changelog records differences between releases. Tasks
  2 and 3 change tests only. `changelog-on-tag` checks only that `## [2.14.0]` exists, so it is unaffected.
- **One escaper.** Use the existing `mdCell` (it already escapes backslash before pipe and is unit-tested as TE-12..TE-15).
  Do not add a new helper, and do not keep `cell`/`cellText` as aliases.
- **Commits:** through `node ~/.claude/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash
  call. Use types `test` and `fix` only, with subsystem scopes (as at HEAD: `test(hooks): ... (RED)` / `fix(hooks): ...`).
  Do NOT push.

## Test list (Task 1; outermost first, through the exported renderers)

1. `milestoneTable`: an objective named `a\|b` (JS `'a\\|b'`) gives a data row with 6 cells (the header's count). Its first
   cell unescapes to `80 a\|b`. At HEAD this FAILS: the old escaper emits `a\\|b`, which GFM reads as an escaped
   backslash plus a real pipe, so the row gets an extra cell.
2. `backtestReport`: an objective named `a\|b` gives a row in `### Executor estimates against actuals` with the header's
   cell count. Its first cell unescapes to `<objective> a\|b`. FAILS at HEAD for the same reason.
3. (guard, passes before and after) the existing `MS_TABLE` and backtest snapshot assertions still pass byte for byte.
   Every fixture value is plain text, so mdCell changes nothing for it.

Hand-built values only (no generated test data, no property-based library).

<embedded_context>
<codebase_examples>
`plugins/devflow/devflow/bin/lib/text-escape.cjs` (54-01, requires nothing, so a pure formatter may load it):
```js
/** A GitHub-flavoured markdown table cell: backslash first, then pipe, then newlines -> space. */
function mdCell(value) {
  const s = value === undefined || value === null ? '' : String(value);
  return s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
module.exports = { escapeRegExp, objectiveNumPattern, boldLabelPattern, mdCell };
```

The two flagged sites in `estimate-format.cjs` and their callers (only these, per `rg -n "cell(|cellText("`):
```js
// milestoneTable, line 342 / 350
const cell = (text) => String(text).replace(/\|/g, '\\|');
lines.push(`| ${cell(`${o.number} ${o.name}`)} | ${statusText(o)} | ...`);
// module scope, line 452; used at 455 (objectiveLabel) and 566 (classSection: cellText(c.class))
const cellText = (text) => String(text).replace(/\|/g, '\\|');
const objectiveLabel = (o) => cellText(o.name ? `${o.objective} ${o.name}` : o.objective);
```
`cellText` is not exported. (`roadmap-reconcile.cjs` has an unrelated local variable of the same name; leave it alone.)
mdCell differs from `String()` only for null/undefined ('' rather than 'undefined') and for newlines (a space). Every
caller passes a template string or a string field (`o.objective`, `c.class` from estimate-backtest.cjs:338), so real
output does not change.

The local cell splitter that 54-08 defined in each test file (copy it into estimate-format.test.cjs; do not share it through a fixture):
```js
function cellsOf(row) {            // splits on unescaped pipes; drops the leading/trailing empty cells
  const cells = []; let current = '';
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '\\' && i + 1 < row.length) { current += ch + row[i + 1]; i += 1; }
    else if (ch === '|') { cells.push(current); current = ''; }
    else current += ch;
  }
  cells.push(current);
  return cells.slice(1, -1).map((c) => c.trim());
}
const unescapeCell = (c) => c.replace(/\\(.)/g, '$1');
```
(Check the exact body against `plugins/devflow/devflow/bin/lib/stack-report.test.cjs:455` and copy that version.)

How `fix_command` is built (`doctor-checks/14-skill-requires.cjs` lines 111-124). This is what Task 2's exact strings
come from:
```js
const plural = missing.length > 1;
fixes.push(missing.map(m => (plural ? `${m.tool}: ${m.hint}` : m.hint)).join('; '));
if (invalid.length) fixes.push('correct requires: in the named SKILL.md (a tool name or a list of tool names) and release');
fix_command: fixes.join('; '),
```
`refusalReason` (skill-requires.cjs ~248) builds `... ${plural ? 'they are' : 'it is'} not installed: ${hints}. Run /devflow:doctor ...`,
where hints are joined with `'; '` and prefixed `tool: ` when plural. INSTALL_HINTS (skill-requires.cjs:51):
```js
gh: 'install the GitHub CLI (https://cli.github.com), then run gh auth login',
docker: 'install Docker (https://docs.docker.com/get-docker/)',
flutter: 'install Flutter (https://docs.flutter.dev/get-started/install)',
go: 'install Go (https://go.dev/dl/)',
```

The shell sink in `gate-commits-merge-sequence.test.js`. `sh` has exactly one caller, `step` inside `replay`:
```js
/** Run a plain command line the way the harness would (one command per call). */
function sh(cmd, cwd) {
  return spawnSync('sh', ['-c', cmd], { cwd, env: gitEnv(), encoding: 'utf8' });
}
...
const step = (cmd, { run = true, runAs = cmd } = {}) => {
  const verdict = runHook(cmd, root);
  assert.equal(verdict.denied, false, `gate-commits denied a documented command: ${cmd}\n${verdict.reason}`);
  return run ? sh(runAs, root) : null;
};
...  // resolve branch, ~line 344
const repoLine = documentedLine.replace(
  'node ~/.claude/devflow/bin/df-tools.cjs',
  `${JSON.stringify(process.execPath)} ${JSON.stringify(REPO_BIN)}`
);
const resolved = step(documentedLine, { runAs: repoLine });
...
for (const c of by('df-tools')) step(c, { run: false });
```
54-04 precedent (Case V1 in verifier-ui-eval-invocation.test.cjs): assert that the text has no quote, backslash, backtick
or `$`, split it on whitespace, and run it with `execFileSync`/`spawnSync` and no shell.
</codebase_examples>

<anti_patterns>
- Do NOT replace `sh -c` with `spawnSync(cmd, { shell: true })` or `execSync(cmd)`. Those are the same sink under another name.
- Do NOT swap one substring check on a URL literal for another (`indexOf`, `startsWith`, a regex with an unescaped `.`).
  Assert equality, or `includes` of a string built from `INSTALL_HINTS`.
- Do NOT loosen any assertion to make it pass. Every replaced assertion must be at least as strict as the one it replaces.
- Do NOT escape at row construction and again at render (54-08: escape once, at the render boundary).
- Do NOT edit CHANGELOG.md, `text-escape.cjs`, or any non-listed file. Do NOT push.
- Do NOT use `git commit` directly (gate-commits blocks it). Use `df-tools commit`.
</anti_patterns>

<error_recovery>
- If Task 1's RED tests pass at HEAD, the fixture value does not exercise the bug. It must contain the two-character
  sequence backslash+pipe (`'a\\|b'` in JS source). A lone pipe was already escaped correctly.
- If `FIVE` has no `objectives[i].name` field, set one on a `structuredClone(FIVE)`. `objectiveLabel` reads `o.name` and
  `o.objective`. Find the row by its leading `| <objective> ` label.
- If an existing estimate-format snapshot changes after GREEN, a fixture contains `\` or a newline. Report it and stop.
  Do not edit the snapshot.
- If Task 3's `argvOf` rejects a documented command, the workflow prose changed. Name the command in the failure. Do
  not widen the allowed set to admit shell syntax.
- If `npm test` shows a failure outside the touched files, re-run that file alone. If it fails alone too, check it
  against 66f64a2d in a scratchpad worktree (`git worktree add <scratchpad>/base 66f64a2d`). If it also fails there, it
  is pre-existing: record it in the SUMMARY and do not fix it.
</error_recovery>
</embedded_context>

<validation_gates>
- task: `npm test` (from `df-tools stack command test`)
- scoped: `node --test <file>` (the stack's scoped form, `node --test {files}`)
- Per-file baselines at 66f64a2d: estimate-format 54/54, skill-requires 42/42, 14-skill-requires 17/17,
  gate-commits-merge-sequence 21/21, text-escape 24/24 (all 0 fail, 0 skipped)
</validation_gates>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: estimate-format escapes table cells with the shared mdCell (js/incomplete-sanitization, 2 alerts)</name>
  <files>plugins/devflow/devflow/bin/lib/estimate-format.test.cjs, plugins/devflow/devflow/bin/lib/estimate-format.cjs</files>
  <action>
RED: in estimate-format.test.cjs, add local `cellsOf` and `unescapeCell` (copied from stack-report.test.cjs:455, see
codebase_examples), plus a new `describe('table cells round-trip backslash and pipe (quick 33)', ...)` with Test list
items 1 and 2:
- Item 1: `const r = structuredClone(MS_RESULT); r.objectives[0].name = 'a\\|b';`, then render
  `fmt.milestoneTable(r)`. Find the line starting `| 80 `. Assert `cellsOf(row).length === cellsOf(headerLine).length`
  (6), and `unescapeCell(cellsOf(row)[0]) === '80 a\\|b'`.
- Item 2: `const r = structuredClone(FIVE);`. Set the first objective's `name` to `'a\\|b'` (see error_recovery if the
  field is absent), then render `fmt.backtestReport(r)`. In the `### Executor estimates against actuals` section, the row
  whose first cell starts with that objective's number has the section header's cell count, and its first cell unescapes
  to `<objective> a\|b`.
Run `node --test plugins/devflow/devflow/bin/lib/estimate-format.test.cjs` and confirm both new tests FAIL on cell count
(the existing 54 still pass). Commit: `test(estimate): table cells with backslash-pipe split into extra columns (RED)`.

GREEN: in estimate-format.cjs, add `const { mdCell } = require('./text-escape.cjs');` beside the existing require. Delete
the local `const cell = ...` in `milestoneTable` and call `mdCell(...)` at line ~350. Delete the module-level `cellText` and
call `mdCell` in `objectiveLabel` and in `classSection` (`mdCell(c.class)`). Leave the header comment's "no file, no clock,
no environment" claim alone: text-escape.cjs requires nothing. Run the file again: 54 + N pass, 0 fail. Commit:
`fix(estimate): escape milestone and backtest table cells with mdCell (backslash before pipe)`.
  </action>
  <verify>
- `node --test plugins/devflow/devflow/bin/lib/estimate-format.test.cjs`: 54+N tests, 0 fail. N = 2 if items 1-2 are one test each.
- `node --test plugins/devflow/devflow/bin/lib/text-escape.test.cjs`: 24/24 (untouched).
- `rg -n -F "replace(/\|/g" plugins/devflow --glob '!*.test.*' --glob '!*.md'` prints only `text-escape.cjs:36`.
- `rg -n "cellText|const cell = " plugins/devflow/devflow/bin/lib/estimate-format.cjs` prints nothing.
  </verify>
  <done>Both former sites call mdCell. The two round-trip tests failed at HEAD and pass now. The existing snapshots are
  unchanged. There are two commits (RED then GREEN).</done>
</task>

<task type="auto">
  <name>Task 2: exact install-hint assertions in the skill-requires tests (js/incomplete-url-substring-sanitization, 10 alerts)</name>
  <files>plugins/devflow/devflow/bin/lib/doctor-checks/14-skill-requires.test.cjs, plugins/devflow/devflow/bin/lib/skill-requires.test.cjs</files>
  <action>
Test-only. Every change is the same strength or stricter, and the test names and counts stay as they are. Both files
already import `INSTALL_HINTS` (14: `const { INSTALL_HINTS } = require('../skill-requires.cjs')`; skill-requires: `sr.INSTALL_HINTS`).

doctor-checks/14-skill-requires.test.cjs:
- L87 (test 9, gh missing alone): `assert.equal(r.fix_command, INSTALL_HINTS.gh);`
- L107 (test 9c, only docker missing): `assert.equal(r.fix_command, INSTALL_HINTS.docker);`. Equality also proves gh's hint is absent, which was this line's meaning.
- L125 (test 10, docker for two skills): `assert.equal(r.fix_command, INSTALL_HINTS.docker);`
- L132-134 (test 10b, plural): replace the three `includes` lines with
  `assert.equal(r.fix_command, \`docker: ${INSTALL_HINTS.docker}; gh: ${INSTALL_HINTS.gh}\`);` (the `'; '` check is subsumed).
- L176 (test 12b, missing + invalid): `assert.equal(r.fix_command, \`${INSTALL_HINTS.gh}; correct requires: in the named SKILL.md (a tool name or a list of tool names) and release\`);`

skill-requires.test.cjs:
- L294 (6a needle list; not flagged, same pattern): replace the `'https://cli.github.com'` needle with `sr.INSTALL_HINTS.gh`.
  This is stricter: the whole hint must appear.
- L310-311 (6b): replace both with
  `assert.ok(text.includes(\`not installed: gh: ${sr.INSTALL_HINTS.gh}; docker: ${sr.INSTALL_HINTS.docker}. \`), text);`
- L335-336 (6f): `assert.equal(sr.INSTALL_HINTS.flutter, 'install Flutter (https://docs.flutter.dev/get-started/install)');`
  and `assert.equal(sr.INSTALL_HINTS.go, 'install Go (https://go.dev/dl/)');`

Commit: `test(skill-requires): assert install hints exactly, not by URL substring`.
  </action>
  <verify>
- `node --test plugins/devflow/devflow/bin/lib/skill-requires.test.cjs`: 42/42 pass.
- `node --test plugins/devflow/devflow/bin/lib/doctor-checks/14-skill-requires.test.cjs`: 17/17 pass.
- `rg -n "includes\('[^']*\.(com|dev|org|io)" plugins/devflow/devflow/bin/lib/skill-requires.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/14-skill-requires.test.cjs` prints nothing.
- `rg -n "'https://" <same two files>` prints only the two 6f `assert.equal` lines.
  </verify>
  <done>No URL-literal substring check remains in either file. Counts are unchanged and all pass. One commit.</done>
</task>

<task type="auto">
  <name>Task 3: merge-sequence replay spawns argv with no shell (js/shell-command-constructed-from-input, 1 alert)</name>
  <files>plugins/devflow/hooks/gate-commits-merge-sequence.test.js</files>
  <action>
Test-only. Replace `sh(cmd, cwd)` (lines 74-77) with two helpers and a doc comment that says why no shell is needed:

```js
// A runnable documented line is plain words (CATEGORIES admits nothing else), so splitting on whitespace and spawning
// with no shell runs the same command `sh -c` would. Anything a shell would interpret fails here instead of running
// differently. (CodeQL js/shell-command-constructed-from-input; same approach as 54-04 Case V1.)
const SAFE_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/;
function argvOf(cmd) {
  const argv = cmd.trim().split(/\s+/);
  const bad = argv.filter((w) => !SAFE_WORD.test(w));
  assert.deepEqual(bad, [], `documented command needs a shell to run: ${cmd}`);
  assert.ok(!argv[0].includes('='), `documented command starts with an env assignment: ${cmd}`);
  return argv;
}
/** Run one command as argv, no shell (one command per call, as the harness does). */
function runArgv(argv, cwd) {
  return spawnSync(argv[0], argv.slice(1), { cwd, env: gitEnv(), encoding: 'utf8' });
}
```

In `replay`, change `step` to `(cmd, { run = true, argv = null } = {})` and return `run ? runArgv(argv || argvOf(cmd), root) : null`.
argvOf must be computed only when the step runs, because the `run: false` df-tools lines contain `~`. In the resolve
branch, drop `repoLine` and its `JSON.stringify` quoting and pass
`step(documentedLine, { argv: [process.execPath, REPO_BIN, 'merge-driver', 'resolve', p] })`. Keep the existing comment
about why the run goes through this repository's df-tools. `gitEnv()` already puts node's directory on PATH, and
`spawnSync` resolves `git` through `env.PATH`, the same way `g()` does now. Do not touch `gitEnv`'s merge-driver comment:
that `sh -c` is git's, not the test's.

Commit: `test(hooks): merge-sequence replay runs documented commands as argv, no shell`.
  </action>
  <verify>
- `node --test plugins/devflow/hooks/gate-commits-merge-sequence.test.js`: 21/21 pass, 0 skipped (git is installed).
- `rg -n "'sh'|'-c'|shell:" plugins/devflow/hooks/gate-commits-merge-sequence.test.js` prints nothing.
- Guard sanity: `SAFE_WORD` rejects `;`, `~`, quotes, `$`, backslash and backtick. State this in the SUMMARY. Do not
  add a test for argvOf itself: it is a test helper, not shipped code.
  </verify>
  <done>The file spawns no shell. The planning-conflict, abort and clean paths and the resolve step still run for real.
  21/21 pass. One commit.</done>
</task>

</tasks>

<verification>
- Each touched file passes alone, with the counts above (estimate-format 54+N, skill-requires 42, 14-skill-requires 17,
  gate-commits-merge-sequence 21).
- `npm test`: fail 0, skipped 34, tests 11073+N, pass 11039+N, against the baseline 11073/11039/0/34 at 66f64a2d.
- The source-pattern greps in Tasks 1-3 all hold. Together they cover all 13 alert sites.
- `git log --oneline 66f64a2d..HEAD` shows 4 commits (test RED, fix, test, test), all made through `df-tools commit`.
  `git diff 66f64a2d --stat` lists only the 5 files in `files_modified`. CHANGELOG.md is untouched. Nothing is pushed.
</verification>

<success_criteria>
- No source pattern remains for any of the 13 alerts, so CodeQL on PR #126 should report 0 new alerts once the user pushes.
- Markdown cells in the milestone and backtest tables survive values containing a backslash and a pipe.
- No test lost meaning: the URL assertions are exact, and the replay still runs every documented command for real.
</success_criteria>

<output>
Write `.planning/quick/33-clear-codeql-alerts-on-release-pr-126/33-SUMMARY.md` through the quick summary verb. Include
the per-file counts before and after, the `npm test` totals, the RED failure messages from Task 1, the four commit
hashes, the result of every post-condition grep, and the no-CHANGELOG decision with its reason (the bug never shipped,
because estimate-format.cjs is new in the untagged 2.14.0). Note that alert closure is confirmed only by the PR's CodeQL
re-run after a push.
</output>
