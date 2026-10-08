---
objective: 60-edit-gate-enforces-the-action
trd: "04"
type: standard
wave: 4
depends_on: ["60-03"]
files_modified:
  - plugins/devflow/hooks/gate-bash-writes.js
  - plugins/devflow/hooks/gate-bash-writes.test.js
  - plugins/devflow/hooks/hooks.json
  - plugins/devflow/hooks/planning-writes.audit.test.js
  - CLAUDE.md
autonomous: true
requirements: [GATE-01, GATE-02, GATE-03, GATE-04]
must_haves:
  truths:
    - "In a DevFlow project in ambient mode with gates.bashEditGate strict, a Bash command that writes a tracked source file (redirect, heredoc opener redirect, tee, sed -i, cp, mv, inline python, inline node) gets permissionDecision deny with a reason naming the file"
    - "With no gates.bashEditGate set, the decision is the one BASH_EDIT_GATE_DEFAULT maps to (deny for strict, ask for warn), so the shipped default is whatever 60-06 measured"
    - "Commands that only mention a write, and writes to .planning/, *.md, untracked files, tmp/scratchpad and other repos, produce no output"
    - "A live .skill-active marker (local or main checkout), agent_type devflow:*, a fresh .edit-override marker, DEVFLOW_SKIP_EDIT_GATE=1, gates.editGate off, and gates.bashEditGate off each produce no output; gates.editGate warn turns a deny into ask"
    - "The .edit-override marker is consumed only by a Bash call that would otherwise be gated; an ordinary Bash call (`ls`) leaves it for the next gated write"
    - "The hook is registered under PreToolUse matcher Bash beside gate-commits, runs as its own process, exits 0 on every path, and fails open when its libs are missing or throw"
  artifacts:
    - path: plugins/devflow/hooks/gate-bash-writes.js
      provides: "PreToolUse(Bash) hook; exports run(input, {cwd, env, deps}) -> hook output object | null"
    - path: plugins/devflow/hooks/hooks.json
      provides: "PreToolUse Bash group gains `node ${CLAUDE_PLUGIN_ROOT}/hooks/gate-bash-writes.js`"
  key_links:
    - "gate-bash-writes.js -> ./gate-edits.js (findPlanningDir, sharedPlanningDir, hasSkillActiveMarker, readEditGateMode, isDevflowAgent, isOutsideProject) so every escape is the Edit gate's own code"
    - "gate-bash-writes.js -> ./lib/edit-override.js consumeEditOverrideMarker (lazy: only when a write would be gated)"
    - "gate-bash-writes.js -> ../devflow/bin/lib/bash-write-detect.cjs mayWrite + bash-write-gate.cjs evaluateBashWrites/gitTrackedSet/effectiveBashMode/readBashEditGate/bashGateReason"
    - "hook-inventory.test.cjs pins the CLAUDE.md bullet; planning-writes.audit.test.js test 10a pins the RUNS entry"
---

# TRD 60-04: The PreToolUse(Bash) hook: gate-bash-writes.js (GATE-01 to GATE-04)

<objective>
Wire the decision from 60-03 into Claude Code. The planning brief left two designs open: extend `gate-edits.js` to Bash,
or register a separate PreToolUse(Bash) hook. **Decision: a separate hook, `hooks/gate-bash-writes.js`,** registered in
the existing `PreToolUse` `Bash` group beside gate-commits, for four reasons:

1. `gate-edits.js`'s Edit/Write path stays byte-identical. It is the most-fired gate, and its 1,538-line test file pins
   it, including `shouldGate` returning `noop` for Bash.
2. Fail-open boundaries stay independent. A crash while parsing a strange Bash command can never affect Edit/Write
   gating, and gate-commits is untouched.
3. The Bash rule has its own severity knob and default (`gates.bashEditGate`, 60-03), while `gates.editGate` still
   softens or disables it.
4. The escapes are the Edit gate's own code anyway. The hook requires gate-edits.js's exported helpers (gate-edits runs
   `main()` only under `require.main === module`), so "the same escapes as Edit/Write" is true by construction, not by
   copy.

The decision order is cheapest first, so the common Bash call costs one regex:

```
env DEVFLOW_SKIP_EDIT_GATE=1 -> exit
stdin JSON; tool_name !== 'Bash' or no command -> exit
!mayWrite(cmd) -> exit                                    # no fs, no git
cwd = absolute input.cwd || process.cwd(); planningDir = findPlanningDir(cwd); none -> exit
mode = effectiveBashMode(readEditGateMode(planningDir), readBashEditGate(planningDir)); 'off' -> exit
isDevflowAgent(input.agent_type) -> exit
hasSkillActiveMarker(planningDir, sharedPlanningDir(cwd)) -> exit
r = evaluateBashWrites(cmd, { cwd, projectRoot, isOutside: isOutsideProject(projectRoot, ·),
                             isDirectory: statSync(·).isDirectory(), isTracked: gitTrackedSet(projectRoot, ·) })
r.gated empty -> exit                                     # git ran only if an in-project candidate existed
consumeEditOverrideMarker(planningDir) -> exit            # consumed ONLY by a write that would be gated
emit { permissionDecision: mode === 'warn' ? 'ask' : 'deny', permissionDecisionReason: bashGateReason(...) }
```

Purpose: success criteria 1-4 live in the harness. Output: the hook, its tests, its registration, its inventory entries.
</objective>

<file_tree>
plugins/devflow/hooks/
├── gate-bash-writes.js             ← CREATE
├── gate-bash-writes.test.js        ← CREATE
├── hooks.json                      ← MODIFY (PreToolUse Bash group)
└── planning-writes.audit.test.js   ← MODIFY (RUNS entry)
CLAUDE.md                           ← MODIFY (### Hooks bullet, Enforcement group)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD (kind plugin, work feature). The hook tests go RED (`test(60-04): ...`) before the hook exists
  (`feat(60-04): ...`).
- Hand-built fixtures only. Use `makeTrackedRepo` (60-03) for the project, plus `preToolUsePayload` and
  `makeDevflowProject`-style helpers from `hooks/__fixtures__/gate-fixtures.js`. No generated data, no property-based
  libraries, no `.feature` files.
- Hermetic git. Every spawn of the hook gets `env = { ...process.env, ...gitTestEnv(home) }`, with `DEVFLOW_SKIP_EDIT_GATE`
  and `DEVFLOW_ALLOW_RAW_COMMIT` deleted from it.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash
  call.
- This session runs the INSTALLED plugin (2.13.x), which does not have this hook. Nothing here gates your own Bash
  calls. Write files with Edit/Write anyway.
- Never use port 8080.

## Test list

`gate-bash-writes.test.js`. Subprocess e2e: spawn `process.execPath gate-bash-writes.js`, with the payload on stdin from
`preToolUsePayload({ tool: 'Bash', command, cwd: repo.root })` (pass `cwd` explicitly; the builder defaults to the
runner's cwd). The repo is `makeTrackedRepo({ files: { 'src/a.js', 'src/a.go', 'package.json', 'README.md',
'.planning/STATE.md' } })`, with `gates.bashEditGate: 'strict'` in `.planning/config.json` unless a test says otherwise.

1. GATE-01: each command → `permissionDecision: 'deny'`, a reason matching `BASH_GATE_CLASSIFIER`, and the reason
   names the file:
   - `echo x > src/a.js`
   - `"cat > src/a.go <<'EOF'\npackage a\nEOF"`
   - `printf x | tee src/a.js`
   - `sed -i 's/a/b/' src/a.js`
   - `cp <tmp>/x.js src/a.js`
   - `mv <tmp>/x.js src/a.js`
   - `python3 -c "open('src/a.js','w').write('x')"`
   - `node -e "require('fs').writeFileSync('package.json','{}')"`
   - `cd src && echo x > a.js`
2. Shipped default: with no `bashEditGate` key, `echo x > src/a.js` → `permissionDecision` is `'deny'` when
   `BASH_EDIT_GATE_DEFAULT === 'strict'` and `'ask'` when it is `'warn'`. Read the constant from the lib, so 60-06 can
   change it without touching this test.
3. GATE-02: each → stdout `''`, exit 0:
   - `"cat <<'EOF'\nsed -i 's/a/b/' src/a.js\nEOF"`
   - `grep -n "> src/a.js" README.md`
   - `echo "writing src/a.js"`
   - `npm test 2>&1 | tail -5`
   - `ls # echo x > src/a.js`
4. GATE-03: each → stdout `''`:
   - `echo x >> .planning/STATE.md`
   - `echo x >> README.md`
   - `echo x > src/new.js` (untracked)
   - `echo x > <os.tmpdir()>/bash-gate-<rand>.txt`
   - `cp src/a.js <scratch dir outside repo>/a.js`
   - `cd <second makeTrackedRepo root with a tracked a.js> && echo x > a.js`
5. GATE-04 escapes. Each → stdout `''` unless stated:
   - (a) A `.skill-active` marker with `expires_at` one hour ahead. Control: an expired marker → deny.
   - (b) The marker only in the MAIN checkout, with the payload cwd in a real linked worktree
     (`repo.git(['worktree', 'add', <dir>, '-b', 'wt'])`). The worktree checks out `src/a.js`, tracked there too.
   - (c) `agent_type: 'devflow:executor'`. Control: `agent_type: 'general-purpose'` → deny.
   - (d) A fresh `.edit-override` marker (`writeEditOverrideMarker`): allowed, and the marker file is gone afterwards.
   - (e) `DEVFLOW_SKIP_EDIT_GATE=1` in the hook env.
   - (f) `gates.editGate: 'off'` with `bashEditGate: 'strict'`.
   - (g) `gates.bashEditGate: 'off'`.
   - (h) `gates.editGate: 'warn'` with `bashEditGate: 'strict'` → `permissionDecision: 'ask'`.
   - (i) `gates.bashEditGate: 'warn'` → `'ask'`.
6. Lazy override: with a fresh `.edit-override` marker, `ls -la` → stdout `''` and the marker STILL exists. Then
   `echo x > src/a.js` → stdout `''` and the marker is gone. Then `echo x > src/a.js` again → deny.
7. No-ops:
   - A directory with no `.planning/` → `''`.
   - `tool_name: 'Edit'` → `''`.
   - Malformed stdin (`not json`) → `''`, exit 0.
   - Empty command → `''`.
8. Payload cwd wins: spawn with process cwd `os.tmpdir()` and payload `cwd: repo.root`, run `echo x > src/a.js` → deny.
9. Fail open: copy `gate-bash-writes.js`, `gate-edits.js` and `lib/edit-override.js` into a temp `hooks/` dir with NO
   `devflow/` sibling, and run test 1's first command against the repo → stdout `''`, exit 0.
10. In-process `run(input, { cwd, env, deps })` with spies `deps.gitTrackedSet` and `deps.findPlanningDir` (defaults
    are the real functions):
    - `ls -la` → returns null, and neither spy is called.
    - `echo x > README.md` → `gitTrackedSet` is not called.
    - `agent_type: 'devflow:executor'` with `echo x > src/a.js` → `gitTrackedSet` is not called.

Registration (`hooks/hook-inventory` and audit suites, run in Task 2):

11. `hook-inventory.test.cjs` passes, which needs a CLAUDE.md bullet. `planning-writes.audit.test.js` passes, which
    needs the RUNS entry, test 10a, and no unclassified dotfile literal (test 11).

<embedded_context>

<codebase_examples>
gate-edits.js entry point (lines 446-492). Copy its output shape exactly:

```js
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: editGateMode === 'warn' ? 'ask' : 'deny',
      permissionDecisionReason: result.reason,
    },
  };
  process.stdout.write(JSON.stringify(out));
```

gate-edits exports (line 502): `OVERRIDE_PHRASES, hasSkillActiveMarker, sharedPlanningDir, findRepoRoot,
isOutsideProject, hasOverridePhrase, shouldGate, isDevflowAgent, findPlanningDir, readEditGateMode,
VALID_EDIT_GATE_MODES, readStoreMode, _setPlanningLibs`. Its `main()` runs only under `require.main === module`, so
requiring it has no side effect.

gate-commits fail-open wrapper:

```js
function main() {
  try { run(); } catch { /* Fail open: a gate bug must never block the user's command. */ }
}
```

The test harness pattern (`gate-edits.test.js` 251-280): `runHook(payload, { cwd, extraEnv })` spawns the hook with
`spawnSync(process.execPath, [HOOK_PATH], { input: JSON.stringify(payload), cwd, env, encoding: 'utf8' })`.

hooks.json PreToolUse Bash group today:

```json
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/gate-commits.js" },
          { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/changelog-on-tag.js" },
          { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/gate-interactive.js" }
        ]
      },
```

`planning-writes.audit.test.js` RUNS entry shape (the gate-edits entries at 428-438). The audit world tracks
`src/x.js` and has an `editOverride` world option. PreToolUse entries carry no `expect` (`expect: 'block'` is for Stop
hooks).

CLAUDE.md `### Hooks` → `**Enforcement (active gates):**`. Bullets read
`` - `gate-edits.js` — PreToolUse(Edit/Write/MultiEdit); ... ``.
</codebase_examples>

<anti_patterns>
- Do not consume `.edit-override` before you know the command would be gated. gate-edits consumes it on every
  Edit/Write. For Bash, an ordinary `ls` would eat the user's one-shot override (test 6).
- Do not modify gate-edits.js or gate-commits.js. Require gate-edits' exports. If one you need is missing, stop and
  report; do not reimplement it.
- Do not decide from `process.cwd()` alone. The payload `cwd` is the session's working directory, and it is what
  relative targets mean (test 8).
- No dotfile-shaped string literals in the hook (the static audit, test 11). Planning-dir discovery and markers come
  from the gate-edits and edit-override helpers.
- Never exit non-zero, and never write stderr on the allow path.
</anti_patterns>

<error_recovery>
- If test 5(b) cannot find the main marker, check that the worktree's `.git` FILE points into
  `<main>/.git/worktrees/<name>`, which is what `sharedPlanningDir` parses. `git worktree add` from the fixture writes
  exactly that.
- If tracked checks return empty inside the hook, the spawn env is missing the hermetic git vars, or `GIT_DIR` leaked in
  from the runner. Delete `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` from the test env.
- If `planning-writes.audit.test.js` test 11 names a literal in the new hook, remove the literal (route through a
  helper). Do not add a classification row unless the literal is genuinely read-only, and give the row a reason.
- To back the hook out without reverting code: remove its line from hooks.json. Users can set
  `gates.bashEditGate: "off"`.
</error_recovery>

</embedded_context>

<gotchas>
- `cwd`: `typeof input.cwd === 'string' && path.isAbsolute(input.cwd) ? input.cwd : process.cwd()`. Use it for
  `findPlanningDir`, `sharedPlanningDir` and as the `cwd` passed to `evaluateBashWrites`. `projectRoot =
  path.dirname(planningDir)`.
- `isOutside: (abs) => isOutsideProject(projectRoot, abs)`. It is symlink-aware (macOS `/var` vs `/private/var`) and
  shared with the Edit gate.
- `isDirectory: (abs) => { try { return fs.statSync(abs).isDirectory(); } catch { return false; } }`.
- Libs are loaded with `require(path.join(__dirname, '..', 'devflow', 'bin', 'lib', '<name>.cjs'))` inside a
  try/catch. If either is missing, `run` returns null (test 9).
- `run(input, { cwd: processCwd = process.cwd(), env = process.env, deps = {} } = {})` returns the output object or
  null. `main()` reads stdin, calls `run` in a try/catch, and writes `JSON.stringify(out)` only when it is non-null.
  `deps` defaults to the real functions; tests override `gitTrackedSet` and `findPlanningDir`.
- Header comment: the decision order above; why this is a separate hook (the four reasons); the escapes and that they
  are gate-edits' own; what is never gated (with the 60-02 false-negative list); the severity rule (least of editGate
  and bashEditGate, default `BASH_EDIT_GATE_DEFAULT`); fail-open; DECISION-001 and TRD 60-04 references.
- CLAUDE.md bullet, in the Enforcement group right after gate-edits.js:
  `` - `gate-bash-writes.js` — PreToolUse(Bash); denies a Bash write to a tracked source file in ambient mode
  (redirect, tee, sed -i, cp/mv, inline python/node), the same as Edit/Write (DECISION-001, objective 60). Mentions
  (heredoc bodies, quoted args) and writes to .planning/, *.md, untracked files and paths outside the project are never
  gated. Same escapes as gate-edits. Severity is the least of `gates.editGate` and `gates.bashEditGate`. Escape:
  `DEVFLOW_SKIP_EDIT_GATE=1` ``.
  60-07 finalises the wording with the measured default. This TRD needs only enough for hook-inventory to pass.
- RUNS entry: `'gate-bash-writes.js': [{ label: 'ambient Bash write to a tracked file', payload: (ctx) => preTool('Bash',
  { command: "sed -i 's/1/2/' src/x.js" })(ctx) }, { label: 'override armed and consumed by a gated write', world: {
  editOverride: true }, payload: (ctx) => preTool('Bash', { command: 'echo 2 > src/x.js' })(ctx) }]`.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: gate-bash-writes.js with its subprocess and in-process tests (tests 1-10)</name>
  <files>plugins/devflow/hooks/gate-bash-writes.js, plugins/devflow/hooks/gate-bash-writes.test.js</files>
  <action>
RED: write tests 1-10 in `gate-bash-writes.test.js`. Require `makeTrackedRepo` from
`../devflow/bin/lib/__fixtures__/tracked-repo.cjs`, `preToolUsePayload` from `./__fixtures__/gate-fixtures.js`,
`writeEditOverrideMarker` from `./lib/edit-override.js`, and `BASH_EDIT_GATE_DEFAULT` and `BASH_GATE_CLASSIFIER` from
the lib. Skip the git-backed tests when `gitAvailable()` is false. Run them and watch them fail (no hook file), then
commit `test(60-04): bash write gate hook e2e`.

GREEN: create `hooks/gate-bash-writes.js` per the objective's decision order and the gotchas. Export `{ run }`, with
`main()` under `require.main === module`. Commit `feat(60-04): gate Bash writes to tracked source in ambient mode`.
  </action>
  <verify>`node --test plugins/devflow/hooks/gate-bash-writes.test.js` passes. `node --test plugins/devflow/hooks/gate-edits.test.js plugins/devflow/hooks/gate-commits.test.js` is unchanged and green.</verify>
  <done>Tests 1-10 went RED then GREEN in separate commits. gate-edits.js and gate-commits.js are untouched (`git diff --stat` shows neither).</done>
</task>

<task type="auto">
  <name>Task 2: Register the hook, plus the CLAUDE.md inventory bullet and the planning-writes audit entry (test 11)</name>
  <files>plugins/devflow/hooks/hooks.json, CLAUDE.md, plugins/devflow/hooks/planning-writes.audit.test.js</files>
  <action>
1. `hooks.json`: append `{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/gate-bash-writes.js" }` to
   the PreToolUse `Bash` group, after `gate-interactive.js`. Change nothing else, and keep the two-space JSON
   formatting.
2. `CLAUDE.md`: add the bullet from the gotchas under `**Enforcement (active gates):**`, right after the gate-edits.js
   bullet.
3. `planning-writes.audit.test.js`: add the RUNS entry from the gotchas, after `'gate-edits.js'`.
4. Run `node --test plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs plugins/devflow/hooks/planning-writes.audit.test.js
   plugins/devflow/hooks/gate-bash-writes.test.js`. Also run any other test that reads hooks.json
   (`rg -l "hooks\.json" plugins --glob '*.test.*'`), and fix only what the new registration legitimately changes.

Commit `feat(60-04): register gate-bash-writes on PreToolUse(Bash)`.
  </action>
  <verify>`node -e "const h=require('./plugins/devflow/hooks/hooks.json'); const g=h.hooks.PreToolUse.find(x=>x.matcher==='Bash'); console.log(g.hooks.map(x=>x.command.split('/').pop()).join(','))"` prints `gate-commits.js,changelog-on-tag.js,gate-interactive.js,gate-bash-writes.js`. hook-inventory and planning-writes audit tests pass.</verify>
  <done>The hook is registered, documented in the CLAUDE.md inventory and covered by the planning-writes audit.</done>
  <recovery>If the audit's behavioural run shows a changed dotfile for the new hook, that is a real bug: only the
  `.edit-override` deletion is allowed. Fix the hook, not the allowlist.</recovery>
</task>

</tasks>

<validation_gates>
- Task gate (`test`): `node --test plugins/devflow/hooks/gate-bash-writes.test.js plugins/devflow/hooks/planning-writes.audit.test.js plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs`.
</validation_gates>

<verification>
- All gate-bash-writes tests pass, and gate-edits, gate-commits, hook-inventory and planning-writes audit tests pass.
- `git diff --stat <base>..HEAD -- plugins/devflow/hooks/gate-edits.js plugins/devflow/hooks/gate-commits.js` is empty
  for this TRD's commits.
</verification>

<success_criteria>
- [ ] GATE-01 forms are denied, GATE-02 mentions and GATE-03 paths pass, in a real subprocess against a real git repo
- [ ] Every GATE-04 escape lets the write through, and editGate warn yields ask
- [ ] The override marker is consumed only by a would-be-gated write
- [ ] Registered on PreToolUse(Bash), and the inventory and audit tests are green
</success_criteria>

<output>
After completion, create `.planning/objectives/60-edit-gate-enforces-the-action/60-04-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`.
</output>
