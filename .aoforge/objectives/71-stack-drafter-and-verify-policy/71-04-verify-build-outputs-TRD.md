---
objective: 71-stack-drafter-and-verify-policy
trd: "04"
type: standard
wave: 2
depends_on: ["71-03"]
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/stack-verify-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/stack-verify.cjs
  - plugins/devflow/devflow/bin/lib/stack-verify-run-guard.test.cjs
autonomous: true
requirements: [SDR-10]
must_haves:
  truths:
    - "A `build` gate that creates untracked, unignored files under `bin/`, `build/`, `dist/`, `out/` or `target/` (relative to the gate's cwd) has them removed, lists them in `run.build_outputs`, keeps them in `run.mutated`, and does NOT halt the root: a later Flutter/Dart gate of another component still runs"
    - "`df-tools stack verify --run --raw` on a scratch repo whose root `build` writes `bin/app` and whose `client/` Flutter component has a lint gate prints `build resolved run=0 mutated=1 build_outputs=1` and `lint@client/ resolved run=0`, and `git status --porcelain` is identical before and after"
    - "Anything else still halts as before: a build that also changes a tracked file, a build that writes outside an output dir (`src/gen.go`), a non-build key that writes `bin/x`, or a build output that could not be removed; the halted Dart/Flutter gate is skipped `side-effect-unsafe` and its detail names the first non-output path"
    - "A gitignored output (`build/` in a repo that ignores it) is still not reported at all (existing test 6)"
    - "`RUN_POLICY.buildOutputDirs` is frozen and equals `['bin', 'build', 'dist', 'out', 'target']`, and the module header states the build-output rule"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/stack-verify.cjs
      provides: "isBuildOutput; guardEffects partitions build outputs from other changes and halts only on the others; rawTable build_outputs=<n>; RUN_POLICY.buildOutputDirs"
      contains: "build_outputs"
    - path: plugins/devflow/devflow/bin/lib/stack-verify-run-guard.test.cjs
      provides: "build-output cases 1-10 (in-process and CLI)"
      contains: "build_outputs"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/stack-verify-fixtures.cjs
      provides: "componentRepo({ rootFiles, component }) - a git repo with a non-Dart root and a Flutter component that has a resolved package config"
      exports: ["componentRepo"]
  key_links:
    - from: "stack-verify.cjs guardEffects"
      to: "stack-verify.cjs isBuildOutput"
      via: "delta partition; ctx.halted set only when a non-output path changed or restoration failed"
      pattern: "isBuildOutput\\("
    - from: "stack-verify.cjs rawTable"
      to: "run.build_outputs"
      via: "` build_outputs=<n>` after ` mutated=<n>`"
      pattern: "build_outputs="
---

# TRD 71-04: A build's own output is restored and reported, not a reason to stop other components' gates (SDR-10, artifacts)

<objective>
In the objective 43 follow-up run, eden-circle's `make build` (`go build -o bin/circle-api …`) wrote `bin/circle-api`,
which is untracked and not gitignored. The effect guard removed it correctly, then set `ctx.halted`, so every later
Dart/Flutter gate in that root was skipped `side-effect-unsafe`, including `client/`'s Flutter gates, which a Go binary
in `bin/` cannot affect.

A file a `build` creates in a conventional output directory is the build doing its job. Restore it (the run stays
read-only), report it as `build_outputs`, and do not halt. Every other change keeps today's behaviour. Success
criterion 4. Todo: `.planning/todos/pending/2026-10-04-stack-verify-run-policy-services-and-artifacts.md` (second
bullet).
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
Project kind `plugin`, work `feature`: TDD strict (RED, GREEN, optional REFACTOR as atomic commits per task), test
list first, hand-built fixtures, no property-based libraries, no `.feature` files. User playbook: failing test first,
one test at a time.

TRD 71-03 landed first and changed `stack-verify.cjs` (service policy, `runOne` order, `rawTable` ` services=allowed`)
and added `gitRepo`/`serviceWorkflow` to the verify fixtures. Re-read the current lines with `rg -n` before editing;
the numbers below are from planning (before 71-03).

Read narrowly:
- `stack-verify.cjs`: the effect-guard comment 849-866; `diffTree` 990-1011 (`change: 'added'|'deleted'|'modified'`;
  `added` = new to HEAD); `removeNonDir` 1013-1020 (never removes a directory); `restorePath` 1022-1058; `restoreTree`
  1060-1072; `haltedDetail` 1142-1144; `runOne` 1148-1205 (the Dart/Flutter halt check
  `if (dartFlutter && ctx.halted) return withSkip(it, EFFECT_REASONS.unsafe, …)`); `guardEffects` 1207-1236;
  `rawTable` 1392-1403; `RUN_POLICY` 497-531.
- `stack-verify-run-guard.test.cjs`: header test list 12-31; helpers 40-66 (`setup`, `item`, `envWith`, `porcelain`);
  test 5 154-168 (a non-flutter mutation halts flutter items: the case this TRD narrows for build outputs); test 6
  170-176 (gitignored path not reported); CLI block 243-288.
- `__fixtures__/stack-verify-fixtures.cjs`: `gitDartRepo` (its `.gitignore` ignores `.dart_tool/` and `build/`, not
  `bin/`), `gitRepo` (71-03), `mutatingToolBin`, `stubCalls`.
</context>

## Test list

Outermost first: the spawned CLI on a scratch component repo, then `runCommands` in-process. One at a time. The build
command is a stub (`fx.mutatingToolBin`) or `sh -c '…'`; the Flutter gate is a stub `flutter` that writes nothing and
records its calls.

**CLI (run-guard file, new describe `CLI: build outputs (TRD 71-04)`)**
1. `componentRepo`: root STACK.md `extends: general`, `components: [{ path: "client/", profile: flutter }]`,
   `commands: build: { run: "fakebuild" }`; `fakebuild` stub writes `bin/app`. `stack verify --run --raw` -> exit 0;
   lines include `build resolved run=0 mutated=1 build_outputs=1` and a `lint@client/ resolved run=0` line (not
   `skipped=side-effect-unsafe`); the stub flutter was called; `git status --porcelain=v1 -uall` equals the before
   value; `bin/app` does not exist.
2. Same, JSON: the build result has `run.build_outputs: ['bin/app']`, `run.mutated: [{ path: 'bin/app', change:
   'added' }]`, `run.restored: true`.

**In-process (run-guard file, new describe `build outputs are restored and do not halt (TRD 71-04)`)**
3. `item('build', "sh -c 'mkdir -p bin && echo x > bin/app'")` then `item('lint', 'flutter analyze')` -> build has
   `build_outputs: ['bin/app']`, restored; lint ran (exit 0, stub called once).
4. `dist/assets/app.js` (two levels deep) and `out/x`, `target/y` in one build -> all three in `build_outputs`.
5. Build with `cwd: 'svc'` writing `svc/bin/api` -> `build_outputs: ['svc/bin/api']` (judged relative to the cwd);
   the same build at cwd `''` writing `svc/bin/api` -> NOT an output (first segment `svc`), halts.
6. Build writing `bin/app` AND appending to tracked `README.md` -> `build_outputs: ['bin/app']`, `mutated` has both,
   the next flutter item is `side-effect-unsafe` and its detail names `README.md`.
7. Build writing `src/gen.go` -> no `build_outputs`, halts (detail names `src/gen.go`).
8. `item('lint', "sh -c 'mkdir -p bin && echo x > bin/x'")` -> no `build_outputs` (only build writes outputs), halts.
9. A build that writes into gitignored `build/` (gitDartRepo ignores it) -> no `mutated`, no `build_outputs`, no halt.
10. `RUN_POLICY.buildOutputDirs` deep-equals `['bin', 'build', 'dist', 'out', 'target']` and is frozen.

<embedded_context>

<codebase_examples>
`guardEffects` today (1213-1236):
```js
function guardEffects(it, ctx, opts, before, run) {
  const deps = { fs: ctx.fs, git: opts.git };
  const also = [...before.files.keys()];
  const after = snapshotTree(ctx.root, { ...deps, also });
  if (after === null) { run.mutated_unknown = true; ctx.halted = { key: it.key, path: null }; return; }
  const delta = diffTree(before, after);
  if (delta.length === 0) return;

  const result = restoreTree(before, delta, after, deps);
  const again = snapshotTree(ctx.root, { ...deps, also });
  const left = again === null ? null : diffTree(before, again).map((d) => d.path);
  const unrestored = [...new Set([...result.unrestored, ...(left || [])])].sort();
  run.mutated = delta;
  run.restored = result.restored && left !== null && left.length === 0;
  if (unrestored.length) run.unrestored = unrestored;
  ctx.halted = { key: it.key, path: delta[0].path };
}
```

Test 5's shape, the model for the in-process cases:
```js
const { root, bin, opts } = setup({ body: ':' });
const out = runCommands([
  item('build', "sh -c 'echo x >> README.md'"),
  item('lint', 'flutter analyze'),
], opts);
assert.deepEqual(out[0].run.mutated, [{ path: 'README.md', change: 'modified' }]);
assert.equal(out[1].skipped, 'side-effect-unsafe');
```
</codebase_examples>

<anti_patterns>
- Do not leave the output in place. `stack verify` is read-only in both modes (module header); the output is removed
  and reported.
- Do not remove directories (`removeNonDir` refuses on purpose). The emptied `bin/` stays; git does not list an empty
  directory, so the work tree status is back to before. Say so in the header.
- Do not widen the rule beyond `build`, beyond `added` (new, untracked) paths, or beyond the five directory names. A
  modified tracked file or a staged file is never an output.
- Do not change test 5's assertions: a `build` that modifies a tracked file still halts.
- Do not add a gitignore entry to fixtures to make an output "disappear": the case is precisely untracked AND unignored.
</anti_patterns>

<error_recovery>
- Case 1's flutter gate is skipped `needs-pub-get`: the component lacks `.dart_tool/package_config.json` (ignored by
  the component's `.gitignore`); `componentRepo` must write it.
- Case 1's `lint@client/` line is missing: the component view reports only keys that differ from the root's; the
  general root's `lint` is `discover` and the flutter tier's is `flutter analyze --fatal-infos`, so it is reported.
  If not, print the JSON and assert on the component's flutter key that is present.
- If 71-03's ` services=allowed` and this TRD's ` build_outputs=` both apply, order the raw suffixes: `run=`,
  `services=allowed`, `mutated=`, `build_outputs=`.
</error_recovery>

</embedded_context>

<gotchas>
- `diffTree` sees a new untracked file as `added` (`isNewToHead`). An output path relative to the gate's cwd is
  `path.posix.relative(cwd || '', d.path)`; its first segment must be in `buildOutputDirs` and it must not start with
  `..`.
- Halt when ANY non-output path changed, or when the restore did not fully succeed (`run.restored === false`), or on
  `mutated_unknown`. The halt detail (`haltedDetail`) uses `ctx.halted.path`: set it to the first non-output path.
- The guard runs only when the before-snapshot exists (a git work tree). Outside one nothing changes.
- `micro.test.cjs` hangs on commit signing: use the `!(micro)` full-suite form. Never use port 8080. Commit with
  `df-tools commit`.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builder for a root build beside a Flutter component</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/stack-verify-fixtures.cjs</files>
  <action>
Add and export `componentRepo({ rootFiles = {}, component = 'client' } = {})`: `gitRepo` (71-03) with
`README.md`, `.gitignore` (`.dart_tool/` only: NOT `bin/`, `dist/`, `out/`, `target/`), `<component>/pubspec.yaml`
(`name: client_app`, sdk constraint), `<component>/lib/main.dart`, `<component>/.gitignore` (`.dart_tool/`), and
`<component>/.dart_tool/package_config.json` (`{"configVersion":2,"packages":[]}`; ignored, so it exists but is not
committed), plus `rootFiles`. Doc comment: what the eden-circle-shaped run needs (an un-ignored `bin/`, a resolved
Flutter config) without naming a fleet repo. Check with `node -e` that `git status --porcelain` is clean and the
package config exists. Commit (`test(71-04): component repo fixture for build outputs`).
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/stack-verify-run-guard.test.cjs plugins/devflow/devflow/bin/lib/stack-verify-services.test.cjs
  </verify>
  <done>`componentRepo` is exported; existing suites pass unchanged.</done>
  <recovery>If the package config ends up tracked, the component `.gitignore` was written after `git add`: write all
files before `gitRepo` commits.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build outputs are restored, reported and do not halt (in-process)</name>
  <files>plugins/devflow/devflow/bin/lib/stack-verify-run-guard.test.cjs, plugins/devflow/devflow/bin/lib/stack-verify.cjs</files>
  <action>
RED (cases 3-10): add the describe block and extend the file's header test list (`13. build outputs (TRD 71-04)`).
Run: 3, 4, 5 (first half) and 10 fail; 6, 7, 8, 9 and 5 (second half) pass (they pin that only outputs are exempt).
Commit RED.

GREEN, stack-verify.cjs:
1. `RUN_POLICY.buildOutputDirs: Object.freeze(['bin', 'build', 'dist', 'out', 'target'])`.
2. `isBuildOutput(it, d) -> boolean`: `it.key === 'build'`, `d.change === 'added'`, and the path relative to the
   gate's cwd (posix, cwd `''` is the root) does not start with `..` and its first segment is in `buildOutputDirs`.
3. `guardEffects`: after the restore, `const outputs = delta.filter((d) => isBuildOutput(it, d)).map((d) => d.path)`;
   `const others = delta.filter((d) => !isBuildOutput(it, d))`; keep `run.mutated = delta`, `run.restored`,
   `run.unrestored` as they are; `if (outputs.length) run.build_outputs = outputs`; set
   `ctx.halted = { key: it.key, path: (others[0] || delta[0]).path }` only when `others.length || !run.restored`.
4. Header and the effect-guard comment: a paragraph "Build outputs (TRD 71-04, SDR-10)": a `build` gate's new,
   untracked, unignored files under `bin/ build/ dist/ out/ target/` (relative to its cwd) are its product: removed
   like any change (the emptied directory stays; git does not list it), listed in `run.build_outputs`, and they do not
   halt the root. Any other change, or an output that could not be removed, halts the remaining Dart/Flutter gates as
   before. Update `runCommands`' doc comment to match.
Commit GREEN.
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/stack-verify-run-guard.test.cjs plugins/devflow/devflow/bin/lib/stack-verify.test.cjs plugins/devflow/devflow/bin/lib/stack-verify-services.test.cjs
  </verify>
  <done>Cases 3-10 pass; tests 1-7d and the existing CLI test 12 pass unchanged.</done>
  <recovery>If test 5 changes, `isBuildOutput` accepted a `modified` path: it must be `added` only.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: The CLI shows build outputs and runs the other component's gate</name>
  <files>plugins/devflow/devflow/bin/lib/stack-verify-run-guard.test.cjs, plugins/devflow/devflow/bin/lib/stack-verify.cjs</files>
  <action>
RED (cases 1-2): add `describe('CLI: build outputs (TRD 71-04)')` that builds `componentRepo` with
`.planning/STACK.md` from `profileFx.profileMd({ yaml })` (`schema: 1`, `extends: general`, `components: [{ path:
"client/", profile: flutter }]`, `commands:` / `  build: { run: "fakebuild" }`), a `fakebuild` stub
(`fx.mutatingToolBin('fakebuild', 'mkdir -p bin && echo x > bin/app')`) and a non-mutating `flutter` stub, both on
PATH (two stub dirs joined with `path.delimiter`), a fake HOME, and spawns `df-tools --cwd <root> stack verify --run`
(`--raw` for case 1). Run: case 1 fails on the missing ` build_outputs=1` (and, before Task 2, on the halt). Commit RED.

GREEN, `rawTable`: after the ` mutated=<n>` part append ` build_outputs=<n>` when `r.run.build_outputs`. Update the
`rawTable` doc comment. Run the CLI block and the stack-cli suite. Commit GREEN.
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/stack-verify-run-guard.test.cjs plugins/devflow/devflow/bin/lib/stack-cli.test.cjs
  </verify>
  <done>Cases 1-2 pass: the build line shows `mutated=1 build_outputs=1`, the `lint@client/` gate ran, and the work tree
status is unchanged. The full suite shows no failure outside the 70-03 baseline (fleet escape only if 71-02 has not
landed yet).</done>
  <recovery>If the `client/` gate does not appear, see error_recovery; assert on the component key the JSON shows.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test {files}   (scoped; each task's verify line)</test>
<test>npm test   (full suite before the last commit; micro exclusion form if signing prompts)</test>
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/stack-verify-run-guard.test.cjs plugins/devflow/devflow/bin/lib/stack-verify.test.cjs` passes.
- `rg -n "buildOutputDirs|isBuildOutput|build_outputs" plugins/devflow/devflow/bin/lib/stack-verify.cjs` hits the policy,
  the predicate, `guardEffects` and `rawTable`.
</verification>

<success_criteria>
- A build that writes an untracked, unignored output directory is restored and reported, and it does not halt another
  component's gates (SC-4).
- Every other change keeps today's restore-and-halt behaviour.
</success_criteria>

<output>
After completion, create `.planning/objectives/71-stack-drafter-and-verify-policy/71-04-SUMMARY.md` through
`df-tools summary post`.
</output>
