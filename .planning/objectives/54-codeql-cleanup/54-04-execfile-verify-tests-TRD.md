---
objective: 54-codeql-cleanup
trd: "04"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/api-contract.test.cjs
  - plugins/devflow/devflow/bin/lib/flutter-ui-dogfood.test.cjs
  - plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.test.cjs
  - plugins/devflow/devflow/bin/lib/flutter-ui-eval-dogfood.test.cjs
  - plugins/devflow/devflow/bin/lib/verifier-ui-eval-invocation.test.cjs
autonomous: true
requirements: ["54-G"]
codeql_alerts: [102, 103, 104, 105, 106, 116, 115, 117, 118, 119]
must_haves:
  truths:
    - "None of the five test files runs df-tools through a shell: every `execSync(\\`node ${DF_TOOLS} ...\\`)` becomes `execFileSync(process.execPath, [DF_TOOLS, ...args], opts)` (or spawnSync with the same argv)"
    - "String-argument helpers (`run` in flutter-ui-dogfood, `runRaw`/`runJSON` in flutter-ui-eval-dogfood) take an argv array; every caller passes an array"
    - "Every assertion in the five files is unchanged; each file's test count and pass/skip result is the same before and after"
    - "verifier-ui-eval-invocation Case V1 still executes the argument tail extracted from Step 8c, split into argv, and fails loudly if the tail ever contains a quote it cannot split safely"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/flutter-ui-eval-dogfood.test.cjs
      provides: "runRaw/runJSON over execFileSync with argv arrays"
  key_links:
    - "test files -> process.execPath + df-tools.cjs argv (no /bin/sh), which is what CodeQL js/shell-command-injection-from-environment requires"
---

# TRD 54-04: execFileSync in the verify/flutter-ui test files (group G, part 1 of 2)

<objective>
Replace shell-interpolated `execSync` template strings with `execFileSync(process.execPath, [script, ...args])` in five test files.
CodeQL flags them as `js/shell-command-injection-from-environment` because `DF_TOOLS` and fixture paths come from `__dirname`/tmpdir
and are pasted into a `/bin/sh` command line. A checkout path containing a space or `$` would break or change the command.

Alerts, verified against the post-merge scan of main (2f0ed83b):

| Alert | Site |
|---|---|
| 102, 103, 104 | api-contract.test.cjs:125, :139, :148 |
| 105, 106 | flutter-ui-dogfood.test.cjs:15 (`run` helper), :56 |
| 116 | flutter-ui-eval-planner-default.test.cjs:199 |
| 115, 117, 118 | flutter-ui-eval-dogfood.test.cjs:25 (`runRaw` helper), :385, :402 |
| 119 | verifier-ui-eval-invocation.test.cjs:170 |

TRD 54-05 covers the other four files (11 alerts). This TRD is mechanical. OBJECTIVE.md: "Assertions stay unchanged". No new tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Tests-only refactor, no production code. No new tests (orchestrator: "Group G is mechanical: no new tests needed, existing tests
  must still pass"). Commit as `test(54-04): ...`.
- Before editing, record each file's baseline: `node --test <file> 2>&1 | tail -8` (pass/fail/skip counts). After editing, the counts
  must match exactly.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Convert every `execSync` in these five files, not only the flagged lines. The done check is that no `execSync` call remains.

## Test list

No new behaviour. The existing tests in each file are the list. The before/after counts must be identical.

<embedded_context>

<codebase_examples>
The conversion, one to one. `execFileSync` has the same throw-on-nonzero semantics as `execSync` and attaches `err.stdout`,
`err.stderr` and `err.status` the same way, so `try/catch` and `assert.throws` blocks need no change:

```js
// before (api-contract.test.cjs:125)
const out = execSync(`node ${DF_TOOLS} verify api-contract ${trdPath} --raw`, { encoding: 'utf-8' });
// after
const out = execFileSync(process.execPath, [DF_TOOLS, 'verify', 'api-contract', trdPath, '--raw'], { encoding: 'utf-8' });
```

The repo's existing no-shell pattern (config.test.cjs:225):

```js
const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', dir, 'config-get', ...args], { encoding: 'utf-8' });
```

Helper conversions:

```js
// flutter-ui-dogfood.test.cjs:14 — before
function run(args, cwdArg) {
  return JSON.parse(execSync(`node ${DF_TOOLS} ${args} --raw`, { encoding: 'utf-8', cwd: cwdArg || FIXTURE_DIR }));
}
// after: argv array; callers change from run('detect flutter-ui-scope 99') to run(['detect', 'flutter-ui-scope', '99'])
function run(argv, cwdArg) {
  return JSON.parse(execFileSync(process.execPath, [DF_TOOLS, ...argv, '--raw'], { encoding: 'utf-8', cwd: cwdArg || FIXTURE_DIR }));
}

// flutter-ui-eval-dogfood.test.cjs:24-40 — runRaw(argStr, opts) / runJSON(argStr) become runRaw(argv, opts) / runJSON(argv);
// runJSON appends '--raw' as an array element: runRaw([...argv, '--raw']). 16 call sites, e.g.
//   runJSON(`verify flutter-ui-eval ${MANIFEST} --judge labels`)  ->  runJSON(['verify', 'flutter-ui-eval', MANIFEST, '--judge', 'labels'])
//   runRaw('verify flutter-ui-eval --help')                       ->  runRaw(['verify', 'flutter-ui-eval', '--help'])
```

Imports: these files import from `'node:child_process'` (api-contract :95, flutter-ui-dogfood :7, flutter-ui-eval-dogfood :17 also
imports spawnSync, planner-default :14, verifier-ui-eval-invocation :37 and a local `spawnSync` at :118). Swap `execSync` for
`execFileSync` in each destructure. Leave `spawnSync` where it is still used.

verifier-ui-eval-invocation.test.cjs:158-176 (Case V1). It runs the argument tail of the one `verify flutter-ui-eval` command in
verifier Step 8c, with `$OBJECTIVE` substituted:

```js
const argTail = matches[0][1].trim(); // e.g. `"$OBJECTIVE" --raw`
const argv = argTail.replace(/"\$OBJECTIVE"|\$OBJECTIVE/g, 'FIXTURE_OBJECTIVE_ID_PLACEHOLDER');
...
const finalArgv = argv.replace(/FIXTURE_OBJECTIVE_ID_PLACEHOLDER/g, objectiveId);
stdout = execSync(`node ${DF_TOOLS} verify flutter-ui-eval ${finalArgv}`, { cwd: root, encoding: 'utf-8' });
```

Target: after substitution, `assert.ok(!/["'\\`$]/.test(finalArgv), \`Step 8c arg tail needs shell parsing; extend the splitter: ${finalArgv}\`)`
then `const tokens = finalArgv.split(/\s+/).filter(Boolean);` and
`execFileSync(process.execPath, [DF_TOOLS, 'verify', 'flutter-ui-eval', ...tokens], { cwd: root, encoding: 'utf-8' })`.
The guard keeps V1 honest: if Step 8c ever gains a quoted argument, the test fails and names it rather than mis-splitting.
</codebase_examples>

<anti_patterns>
- Do not use `execFileSync('node', ...)` with `shell: true`, or `spawnSync('sh', ['-c', ...])`. Either is still a shell command line.
- Do not wrap paths in `JSON.stringify(...)` quotes inside the argv. Quotes were for the shell; in argv they become literal characters.
- Do not change any `assert.*` call, expected value or message.
- Do not touch the other execSync-heavy test files CodeQL did not flag (init.test.cjs, tui.test.cjs, flutter-ui-bootstrap.test.cjs,
  exec-context.test.cjs, check-todos.test.cjs, df-tools.test.cjs, project-bootstrap.test.cjs, commit-failure.test.cjs). They are out of
  scope for this objective.
</anti_patterns>

<error_recovery>
- If a converted case fails with "Unknown command", a multi-word argument was split wrong. Compare the old template string token by
  token with the new array.
- If Case V1's guard trips, Step 8c's tail contains a quote. Read the tail it printed and either strip the quotes around the single
  substituted value (as the existing `"\$OBJECTIVE"` replacement does) or extend the splitter. Do not drop the guard.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: execFileSync in api-contract, flutter-ui-dogfood and flutter-ui-eval-planner-default tests (alerts 102-106, 116)</name>
  <files>plugins/devflow/devflow/bin/lib/api-contract.test.cjs, plugins/devflow/devflow/bin/lib/flutter-ui-dogfood.test.cjs, plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.test.cjs</files>
  <action>
1. Record baselines for the three files.
2. api-contract.test.cjs: convert :125, :139, :148 to the one-to-one form.
3. flutter-ui-dogfood.test.cjs: convert `run` to argv form and update its 7 call sites (e.g. `run(\`verify api-contract ${FIXTURE_TRD}\`)`
   -> `run(['verify', 'api-contract', FIXTURE_TRD])`); convert the direct call at :56.
4. flutter-ui-eval-planner-default.test.cjs:198-201: `execFileSync(process.execPath, [DF_TOOLS, 'verify', 'flutter-ui-eval', path.join(tmpDir, 'manifest.json'), '--raw'], { encoding: 'utf-8' })`.
5. Fix the imports. Re-run each file and compare with its baseline.

Commit `test(54-04): run df-tools via execFileSync in api-contract and flutter-ui dogfood tests`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/api-contract.test.cjs plugins/devflow/devflow/bin/lib/flutter-ui-dogfood.test.cjs plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.test.cjs</verify>
  <done>Pass/fail/skip counts equal the baselines. `rg -n "\bexecSync\b" <the three files> | rg -v ":\s*//"` prints nothing.</done>
  <recovery>If a file had a pre-existing failure in its baseline, it must still be exactly that failure; record it in the SUMMARY and do not fix it here.</recovery>
</task>

<task type="auto">
  <name>Task 2: execFileSync in flutter-ui-eval-dogfood and verifier-ui-eval-invocation tests (alerts 115, 117, 118, 119)</name>
  <files>plugins/devflow/devflow/bin/lib/flutter-ui-eval-dogfood.test.cjs, plugins/devflow/devflow/bin/lib/verifier-ui-eval-invocation.test.cjs</files>
  <action>
1. Record baselines for both files.
2. flutter-ui-eval-dogfood.test.cjs: convert `runRaw`/`runJSON` to argv arrays and update all 16 call sites. Convert the direct calls
   at :385 (keep `env: strippedEnv` and the `try { } catch (err) { out = err.stdout; }`) and :402 (inside `assert.throws`, keep the
   validator). In the runJSON comment block (:28-35), change "execSync" to "execFileSync" where it describes the throw/stdout
   behaviour, so the prose stays true.
3. verifier-ui-eval-invocation.test.cjs Case V1 (:158-176): apply the quote guard + whitespace split + execFileSync from
   codebase_examples. Keep the existing `catch (e) { stdout = e.stdout; }` and every assertion after it.
4. Fix the imports. Re-run both files and compare with the baselines.

Commit `test(54-04): run df-tools via execFileSync in flutter-ui-eval dogfood and Step 8c invocation tests`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/flutter-ui-eval-dogfood.test.cjs plugins/devflow/devflow/bin/lib/verifier-ui-eval-invocation.test.cjs</verify>
  <done>Pass/fail/skip counts equal the baselines. `rg -n "\bexecSync\b" <both files> | rg -v ":\s*//"` prints nothing.</done>
  <recovery>If Case G3 (:380-397) fails to parse JSON, `out` came back undefined: execFileSync on a non-zero exit throws with `err.stdout` set only when stdio is piped (the default); make sure no `stdio: 'inherit'` slipped in.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- Both task verify commands pass with baseline-identical counts.
- `rg -n "node \\$\{DF_TOOLS\}" plugins/devflow/devflow/bin/lib/{api-contract,flutter-ui-dogfood,flutter-ui-eval-planner-default,flutter-ui-eval-dogfood,verifier-ui-eval-invocation}.test.cjs`
  prints nothing.
- `git diff --stat` touches only the five test files.
</verification>

<success_criteria>
The five files spawn df-tools with an argv array and no shell. Their tests report the same results as before. Alerts 102-106 and
115-119 have no remaining source pattern.
</success_criteria>

<output>
After completion, create `.planning/objectives/54-codeql-cleanup/54-04-SUMMARY.md` via `df-tools summary post`.
</output>
