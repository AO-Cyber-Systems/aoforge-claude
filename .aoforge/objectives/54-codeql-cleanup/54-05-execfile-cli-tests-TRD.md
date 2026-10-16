---
objective: 54-codeql-cleanup
trd: "05"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/decision-queue.test.cjs
  - plugins/devflow/devflow/bin/lib/flutter-ui-scope.test.cjs
  - plugins/devflow/devflow/bin/lib/project-hygiene.test.cjs
  - plugins/devflow/devflow/bin/lib/ui-spec-cli.test.cjs
autonomous: true
requirements: ["54-G"]
codeql_alerts: [112, 113, 107, 108, 109, 96, 97, 98, 99, 100, 122]
must_haves:
  truths:
    - "decision-queue, flutter-ui-scope and project-hygiene tests spawn df-tools as `execFileSync(process.execPath, [script, ...argv], opts)` (or spawnSync), with no shell"
    - "flutter-ui-scope Case E3 captures stdout and stderr together without `2>&1`, and still asserts the help text names flutter-ui-scope"
    - "ui-spec-cli `gateFails` still runs the gate idiom `cmd || echo GATE_FAILED` in a real `sh`, but the script and arguments reach sh as positional parameters (`\"$0\" \"$@\"`), never interpolated into the -c string"
    - "Every assertion in the four files is unchanged; each file's pass/fail/skip counts match the pre-change baseline"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/ui-spec-cli.test.cjs
      provides: "gateFails with a constant sh -c script and positional argv"
  key_links:
    - "ui-spec-cli gateFails -> sh -c 'node \"$0\" \"$@\" >/dev/null 2>&1 || echo GATE_FAILED' DF_TOOLS ...argv"
---

# TRD 54-05: execFileSync in the CLI test files (group G, part 2 of 2)

<objective>
Remove shell interpolation of `__dirname`/tmpdir-derived paths from four more test files (CodeQL
`js/shell-command-injection-from-environment`). Alerts, verified against the post-merge scan of main (2f0ed83b):

| Alert | Site |
|---|---|
| 112, 113 | decision-queue.test.cjs:402 (`runCli` helper), :438 |
| 107, 108, 109 | flutter-ui-scope.test.cjs:163, :174, :184 (`2>&1`) |
| 96, 97, 98, 99, 100 | project-hygiene.test.cjs:204, :215, :225, :382, :392 |
| 122 | ui-spec-cli.test.cjs:777 (`gateFails`, `sh -c` with an interpolated command) |

TRD 54-04 covers the other five files. Mechanical refactor: assertions stay unchanged, and no new tests are added.

`gateFails` is a special case. Its claim is about what a real `sh` does with the exit code (`cmd || fail`), so it must keep running
`sh`. The fix keeps sh and moves the variable parts out of the script string into positional parameters.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Tests-only refactor, no production code, no new tests. Commit as `test(54-05): ...`.
- Record each file's baseline (`node --test <file> 2>&1 | tail -8`) before editing. The counts must match after.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Convert every `execSync` in these four files, not only the flagged lines.

## Test list

No new behaviour. The existing tests in each file are the list. The before/after counts must be identical.

<embedded_context>

<codebase_examples>
One-to-one conversion (execFileSync throws on non-zero with `err.status`, `err.stdout` and `err.stderr`, exactly like execSync):

```js
// project-hygiene.test.cjs:204 — before
const out = execSync(`node ${dfTools} project-hygiene check`, { cwd: fx.dir, encoding: 'utf-8' });
// after
const out = execFileSync(process.execPath, [dfTools, 'project-hygiene', 'check'], { cwd: fx.dir, encoding: 'utf-8' });
```

decision-queue `runCli` (decision-queue.test.cjs:399-405) takes a string with shell-quoted values. Convert it to argv and unquote at
the call sites:

```js
function runCli(tmpDir, argv) {
  const env = { ...process.env, NOTIFIER_DISABLE: '1' };
  return execFileSync(process.execPath, [DF_TOOLS, 'decision-queue', ...argv], { cwd: tmpDir, encoding: 'utf-8', env });
}
// runCli(tmp, 'add --objective 10 --trd 10-03 --title "SmokeTest" --context "SomeContext" --options "option-a,option-b" --recommendation option-a')
// -> runCli(tmp, ['add', '--objective', '10', '--trd', '10-03', '--title', 'SmokeTest', '--context', 'SomeContext',
//                 '--options', 'option-a,option-b', '--recommendation', 'option-a'])
```

flutter-ui-scope Case E3 (:181-189), currently `execSync(\`node ${DF_TOOLS} detect bogus 2>&1\`)` in a try/catch that already
concatenates `e.stdout + e.stderr`:

```js
const r = spawnSync(process.execPath, [DF_TOOLS, 'detect', 'bogus'], { encoding: 'utf-8' });
const out = (r.stdout || '') + (r.stderr || '');
assert.ok(/flutter-ui-scope/.test(out), `expected help text to mention flutter-ui-scope, got: ${out}`);
```

The import there is a local `const { execSync } = require('node:child_process');` at :132. Change it to
`const { execFileSync, spawnSync } = require('node:child_process');`.

ui-spec-cli `gateFails` (:775-779), before:

```js
function gateFails(argv) {
  const cmd = `node ${JSON.stringify(DF_TOOLS)} ${argv} >/dev/null 2>&1 || echo ${GATE_SENTINEL}`;
  const r = spawnSync('sh', ['-c', cmd], { cwd: LIB_DIR, encoding: 'utf-8' });
  return (r.stdout || '').includes(GATE_SENTINEL);
}
```

After: a constant script, with the node binary, script and arguments as positional parameters:

```js
// The gate idiom runs in a REAL sh (the claim is about sh's `||`); everything variable is a positional
// parameter, so nothing from the environment is parsed as shell syntax.
const GATE_SCRIPT = `"$0" "$@" >/dev/null 2>&1 || echo ${GATE_SENTINEL}`;
function gateFails(argv) {
  const r = spawnSync('sh', ['-c', GATE_SCRIPT, process.execPath, DF_TOOLS, ...argv], { cwd: LIB_DIR, encoding: 'utf-8' });
  return (r.stdout || '').includes(GATE_SENTINEL);
}
```

`$0` is `process.execPath` and `"$@"` is `DF_TOOLS` plus the argv. `GATE_SENTINEL` is the constant `'GATE_FAILED'`, so interpolating
it is fine. The three callers (:785, :793, :798) become arrays:
`gateFails(['ui', 'spec', 'validate', spec])`,
`gateFails(['ui', 'spec', 'validate', spec, '--patterns', PATTERN_CATALOGUE])` (drop the `JSON.stringify` quoting, which existed
only for the shell), and `gateFails(['ui', 'spec', 'validate', '__fixtures__/ui-spec/broken/route-without-back.md'])`.
</codebase_examples>

<anti_patterns>
- Do not replace `gateFails` with `spawnSync(process.execPath, ...)` and `status !== 0`. The file's own comment (:770-774) says that
  restates the assertion instead of testing what sh does.
- Do not keep `JSON.stringify(path)` inside argv arrays. The quotes would become part of the path.
- Do not change assertions, expected values or messages.
- Do not touch unflagged execSync users in other files (init.test.cjs and others). They are out of scope.
</anti_patterns>

<error_recovery>
- If Case G1 flips (the gate no longer fails for the unchecked spec), print `r.stdout`/`r.stderr` without the `>/dev/null 2>&1`
  redirect. A wrong `$0`/`$@` order makes sh run the script path as the binary, so the gate "fails" for the wrong reason, or never
  runs.
- If a project-hygiene `assert.throws` case stops throwing, the subcommand token was merged with the next one. Compare argv arrays
  with the old strings.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: execFileSync in decision-queue, flutter-ui-scope and project-hygiene tests (alerts 96-100, 107-109, 112-113)</name>
  <files>plugins/devflow/devflow/bin/lib/decision-queue.test.cjs, plugins/devflow/devflow/bin/lib/flutter-ui-scope.test.cjs, plugins/devflow/devflow/bin/lib/project-hygiene.test.cjs</files>
  <action>
1. Record baselines for the three files.
2. decision-queue.test.cjs: convert `runCli` to argv and update its 5 callers (unquoting `"..."` values); convert :438 inside
   `assert.throws` (keep `cwd`, `env` and the validator).
3. flutter-ui-scope.test.cjs: convert :163 and :174 one to one (keep `cwd: tmp`); rewrite E3 per codebase_examples; fix the :132 import.
4. project-hygiene.test.cjs: convert the five calls at :204, :215, :225, :382, :392 (keep `cwd` and `stdio: 'pipe'`); update the
   import at :8.
5. Re-run each file and compare with its baseline.

Commit `test(54-05): run df-tools via execFileSync in decision-queue, flutter-ui-scope and project-hygiene tests`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/decision-queue.test.cjs plugins/devflow/devflow/bin/lib/flutter-ui-scope.test.cjs plugins/devflow/devflow/bin/lib/project-hygiene.test.cjs</verify>
  <done>Counts equal the baselines. `rg -n "\bexecSync\b|2>&1" <the three files> | rg -v ":\s*//"` prints nothing.</done>
  <recovery>If decision-queue case 19 fails JSON.parse, a value with a comma (`option-a,option-b`) was split into two argv entries; it must stay one element.</recovery>
</task>

<task type="auto">
  <name>Task 2: gateFails keeps a real sh but passes everything variable as positional parameters (alert 122)</name>
  <files>plugins/devflow/devflow/bin/lib/ui-spec-cli.test.cjs</files>
  <action>
1. Record the baseline for ui-spec-cli.test.cjs.
2. Replace `gateFails` with the `GATE_SCRIPT` + positional form from codebase_examples. Update its doc comment: the gate still runs in
   a real `sh`, and variable parts are positional parameters.
3. Convert the three callers to argv arrays.
4. Re-run and compare with the baseline. Case G1's two halves (unchecked spec fails the gate; the same spec with `--patterns` passes
   it) must both hold.

Commit `test(54-05): pass gate argv to sh as positional parameters in ui-spec-cli gate test`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/ui-spec-cli.test.cjs</verify>
  <done>Counts equal the baseline; Case G1 passes both halves; the `sh -c` script string in gateFails contains no `${` interpolation other than GATE_SENTINEL.</done>
  <recovery>If CodeQL is expected to still see the constant-plus-sentinel template as tainted, inline the literal `GATE_FAILED` into GATE_SCRIPT; the sentinel constant stays for the `.includes` check.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- Both task verify commands pass with baseline-identical counts.
- `rg -n "node \\$\{(DF_TOOLS|dfTools)\}" plugins/devflow/devflow/bin/lib/{decision-queue,flutter-ui-scope,project-hygiene,ui-spec-cli}.test.cjs` prints nothing.
- `git diff --stat` touches only the four test files.
</verification>

<success_criteria>
The four files spawn df-tools without shell interpolation. The one test that must use sh keeps sh, with a constant script. All results
match the baseline. Alerts 96-100, 107-109, 112, 113 and 122 have no remaining source pattern.
</success_criteria>

<output>
After completion, create `.planning/objectives/54-codeql-cleanup/54-05-SUMMARY.md` via `df-tools summary post`.
</output>
