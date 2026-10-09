---
objective: 60-edit-gate-enforces-the-action
trd: "03"
type: standard
wave: 3
depends_on: ["60-02"]
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/tracked-repo.cjs
  - plugins/devflow/devflow/bin/lib/bash-write-gate.cjs
  - plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs
autonomous: true
requirements: [GATE-01, GATE-03, GATE-04, GATE-05]
must_haves:
  truths:
    - "evaluateBashWrites gates exactly the detected writes that land on a file tracked in the project: every PATH_CASES entry yields its expected gated list and passed reasons"
    - "Writes under any `.planning/` segment, to `*.md`, outside the project root (tmp, scratchpad, other repos), to untracked files, and to unresolvable targets pass, each with a named reason"
    - "`cp`/`mv` into a directory (trailing slash, -t, or an existing directory) is judged on <dir>/<basename(source)>"
    - "gitTrackedSet asks git once per evaluation (`git --literal-pathspecs -C <root> ls-files -z -- <rels>`), resolves symlinked spellings, and returns an empty set on any failure (fail open)"
    - "effectiveBashMode is the least severe of gates.editGate and gates.bashEditGate (unset or invalid bashEditGate = BASH_EDIT_GATE_DEFAULT), so editGate warn/off always softens or disables the Bash rule"
    - "The strict-vs-warn rule lives in one place: FP_THRESHOLD = 0.02 and recommendDefault(rate) = rate <= 0.02 ? 'strict' : 'warn'; BASH_EDIT_GATE_DEFAULT is 'warn' until 60-06 sets it from the measurement"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/bash-write-gate.cjs
      provides: "evaluateBashWrites, gitTrackedSet, realpathDeep, readBashEditGate, effectiveBashMode, recommendDefault, bashGateReason, BASH_GATE_CLASSIFIER, BASH_EDIT_GATE_DEFAULT, FP_THRESHOLD, VALID_BASH_MODES"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/tracked-repo.cjs
      provides: "makeTrackedRepo({files, untracked, ignored, planningDir, history}): hermetic git repo with tracked/untracked files and dated commits"
  key_links:
    - "bash-write-gate.cjs -> bash-write-detect.cjs detectBashWrites (60-02)"
    - "60-04 hooks/gate-bash-writes.js -> evaluateBashWrites + gitTrackedSet + effectiveBashMode + bashGateReason"
    - "60-05 session-audit replay -> evaluateBashWrites with a historical isTracked; BASH_GATE_CLASSIFIER for the new category"
    - "60-06 -> BASH_EDIT_GATE_DEFAULT = recommendDefault(measured rate)"
---

# TRD 60-03: The gate decision: which detected writes are gated, and at what severity (GATE-01, 03, 04, 05)

<objective>
60-02 says which files a Bash command writes. This TRD decides which of those writes the edit gate stops. It also holds
every number and setting that GATE-04 and GATE-05 depend on, so the hook (60-04) and the transcript replay (60-05) make
the same decision from the same code.

1. `evaluateBashWrites(cmd, ctx)` classifies each detected write. It passes the write as `unresolvable`,
   `outside-project`, `planning` or `markdown`, or makes it a candidate. One tracked-set lookup then turns candidates
   into `gated` (tracked) or `untracked` (passed).
   - Predicates are injected (`isOutside`, `isDirectory`, `isTracked`), so the hook can use the live file system and
     git while the replay uses history.
   - The defaults fail open: nothing is tracked, so nothing is gated.
2. `gitTrackedSet(root, absPaths)` is the live tracked check: one `git ls-files` per evaluation, which runs only when a
   candidate exists.
3. Severity. `gates.bashEditGate` (`strict|warn|off`) is the Bash rule's own knob. When it is unset or invalid, it
   defaults to `BASH_EDIT_GATE_DEFAULT`. The effective mode is the least severe of it and the existing `gates.editGate`,
   so editGate `warn`/`off` always soften or disable the Bash rule (GATE-04).
4. GATE-05's decision rule is code, not prose: `FP_THRESHOLD = 0.02` and `recommendDefault(rate)`.
   `BASH_EDIT_GATE_DEFAULT` starts at `'warn'`, the safe value until the measurement (60-06) sets it.
5. The deny/ask reason text, plus `BASH_GATE_CLASSIFIER`, the regex session-audit uses to count it as its own category.

Purpose: one decision shared by the hook and the replay. Output: the lib, its tests, a hermetic tracked-repo fixture.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── bash-write-gate.cjs                 ← CREATE
├── bash-write-gate.test.cjs            ← CREATE
└── __fixtures__/tracked-repo.cjs       ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD (kind plugin, work feature). RED commit, then GREEN commit, per task. Take one test at a time where that
  helps.
- Hand-built fixtures only: `bash-write-cases.cjs` (60-01) and the tracked-repo builder (Task 1). No generated data, no
  property-based libraries, no `.feature` files.
- Every git call in a test runs in a hermetic temp repo, with `gitTestEnv(home)` from `__fixtures__/wiki-remote.cjs`
  and a local `commit.gpgsign false`. Never touch this repository's git config.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash
  call.
- Never use port 8080.

## Test list

`bash-write-gate.test.cjs`, outermost first.

Pure, with fake predicates built from `TRACKED` and `DIRS` and `projectRoot: '/repo'`:

1. Every `PATH_CASES` entry: `gated` deep-equals `c.gated`, and `passed` projected to `{path, reason}` and sorted
   deep-equals `c.passed`.
2. `isTracked` is not called when there are no candidates (`echo x > README.md`; `echo x > /tmp/a`), checked with a
   spy.
3. Fail-open defaults: with no `isTracked` injected, `echo x > src/a.js` gives `gated: []` and passed `untracked`.
4. The same tracked file written twice (`echo a > src/a.js; echo b >> src/a.js`) appears in `gated` once.
5. `effectiveBashMode(editGate, bashEditGate)`:

   | editGate | bashEditGate | effective |
   |---|---|---|
   | strict | null | BASH_EDIT_GATE_DEFAULT |
   | strict | strict | strict |
   | strict | warn | warn |
   | strict | off | off |
   | warn | strict | warn |
   | warn | null | least of warn and DEFAULT |
   | off | strict | off |
   | `'banana'` | strict | strict |

   An unknown editGate counts as strict, as in gate-edits.
6. `readBashEditGate(planningDir)` returns `null` for a null dir, a missing config.json, malformed JSON, no `gates` key,
   and `'banana'`. It returns `'strict'`, `'warn'` or `'off'` verbatim. It never throws.
7. `recommendDefault`: `0` → strict, `0.02` → strict, `0.0201` → warn, and `NaN`, `undefined` or `Infinity` → warn.
   `FP_THRESHOLD === 0.02`. `BASH_EDIT_GATE_DEFAULT` is in `VALID_BASH_MODES` and is not `'off'`.
8. `bashGateReason(gatedAbs, projectRoot, mode)`:
   - Strict text starts with `DevFlow ambient mode active — Bash write to tracked source denied: src/a.js`.
   - Paths are relative to the project root. The first three are listed, then `(+N more)`.
   - Warn text contains `Bash write to tracked source needs approval`.
   - Both name `/devflow:quick`, the override phrases, `gates.bashEditGate`, and what is never gated.
   - Both match `BASH_GATE_CLASSIFIER`.

Hermetic git (`makeTrackedRepo`):

9. `gitTrackedSet`:
   - Tracked `src/a.js` is in the set. Untracked `src/new.js` and ignored `build/out.js` are not.
   - A tracked `src/[x].js` matches literally (`--literal-pathspecs`).
   - Both the `os.tmpdir()` spelling and the `fs.realpathSync` spelling of the root and the target work (macOS
     `/var` → `/private/var`).
   - A directory that is not a git repository gives an empty set.
   - A nested project (`.planning/` in `pkg/`, repo top above it) finds `pkg/src/a.js`, with paths relative to `pkg`.
10. Integration with real predicates (`gitTrackedSet`, and `fs.statSync(p).isDirectory()` in a try):
    - `echo x > src/a.js` → gated.
    - `cp <tmp>/a.js src/` with `src/a.js` tracked → gated.
    - `cp <tmp>/z.js src/` → passed untracked.
    - `sed -i 's/a/b/' notes.md` → passed markdown.

<embedded_context>

<codebase_examples>
gate-edits.js already decides the Edit/Write version of these rules. Mirror its semantics, but do not require it: this
lib is mirrored to `~/.claude/devflow` without `hooks/`.

```js
// hooks/gate-edits.js
if (/\/\.planning\//.test(filePath)) return { decision: 'allow', reason: 'planning artifact' };   // any .planning segment
if (/\.md$/i.test(filePath)) return { decision: 'allow', reason: 'markdown doc' };
...
function readEditGateMode(planningDir) {      // missing/malformed/unknown -> 'strict'
  try { ... const mode = config.gates && config.gates.editGate;
        return VALID_EDIT_GATE_MODES.has(mode) ? mode : 'strict'; } catch { return 'strict'; }
}
function realpathDeep(p) {                    // realpath of the deepest existing ancestor + remaining segments
  let cur = path.resolve(p); const tail = [];
  for (;;) {
    try { return path.join(fs.realpathSync(cur), ...tail); } catch { /* keep walking up */ }
    const parent = path.dirname(cur);
    if (parent === cur) return path.resolve(p);
    tail.unshift(path.basename(cur)); cur = parent;
  }
}
```

The existing deny text (gate-edits.js 426-434) is the voice to match: one sentence per fact, the skill to use, the
override phrases. session-audit classifies that text as `devflow-edit-gate` with
`/DevFlow ambient mode active|direct Edit\/Write\/MultiEdit denied/`. 60-05 puts the Bash category in front of that
rule, so the new text may keep the `DevFlow ambient mode active` opening.

Hermetic git env: `gitAvailable()` and `gitTestEnv(home)` in `__fixtures__/wiki-remote.cjs`. The repo-builder shape to
follow is `makeWaveRepo` in `__fixtures__/state-merge-fixtures.cjs` (59-01): mkdtemp, realpath, `git init -b main`, a
local identity and `commit.gpgsign false`, `git(args)` that throws on a non-zero exit, and `cleanup()`.
</codebase_examples>

<anti_patterns>
- Do not shell out to git per target. One `ls-files` covers every candidate of a command.
- Do not use `--full-name`. Its output is relative to the repo top, which differs from the project root in a nested
  project.
- Do not treat "under os.tmpdir()" as a pass rule. Tmp and scratchpad pass because they are outside the project root.
  A project that itself lives under a temp dir (every hermetic test here) must still be gated.
- Do not read `gates.editGate` in this lib. The hook already has gate-edits' `readEditGateMode` and passes its value to
  `effectiveBashMode`. A second reader would drift.
- No property-based tests.
</anti_patterns>

<error_recovery>
- If `gitTrackedSet` returns empty in tests, check the env. The spawn inherits `process.env`, so the test must run the
  function with `GIT_CONFIG_GLOBAL=/dev/null` and the temp `HOME` merged into `process.env` for the duration. Set and
  restore them in `before`/`after`, or give `gitTrackedSet` an optional `env` parameter that the hook never passes.
- If the macOS symlink case fails, compute `rel` from `realpathDeep(root)` and `realpathDeep(target)`, and pass
  `-C root` exactly as given.
</error_recovery>

</embedded_context>

<gotchas>
- `evaluateBashWrites(cmd, { cwd, projectRoot, home, isOutside, isDirectory = () => false, isTracked = () => new Set() })`.
  `isOutside` defaults to the `path.relative` test (`..` prefix or absolute).
  Steps:

  ```
  writes = detectBashWrites(cmd, { cwd, home })
  for w of writes:
    targets = (w.form is cp|mv) && w.path && (w.into || isDirectory(w.path))
            ? w.sources.map(s => s ? path.join(w.path, path.basename(s)) : null)
            : [w.path]
    for t of targets:
      null                          -> passed {path:null, form, reason:'unresolvable'}
      isOutside(t)                  -> 'outside-project'
      relative(projectRoot,t) has a '.planning' segment -> 'planning'
      /\.md$/i                      -> 'markdown'
      else                          -> candidate
  tracked = candidates.length ? isTracked(unique(candidates)) : new Set()
  gated   = unique(candidates.filter(c => tracked.has(c)))
  passed += candidates not tracked -> 'untracked'
  return { writes, gated, passed }
  ```
- `gitTrackedSet(root, absPaths, { timeoutMs = 2000 } = {})`:
  - `rels` are relative to `realpathDeep(root)`. Drop any that start with `..`.
  - Run `spawnSync('git', ['--literal-pathspecs', '-C', root, 'ls-files', '-z', '--', ...rels], { encoding: 'utf8',
    timeout: timeoutMs, maxBuffer: 16 << 20, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })`.
  - A spawn error, a timeout or a non-zero status gives an empty Set.
  - Otherwise, map each output name back to the abs path whose rel it equals.
- `readBashEditGate(planningDir)`: read `config.json` → `gates.bashEditGate`. Return it when it is in
  `VALID_BASH_MODES`, else `null`. Unset and invalid both mean "use the shipped default". gate-edits falls back to
  strict for editGate because strict IS its default. Falling back to the default is the same principle.
- `effectiveBashMode`: `SEVERITY = { off: 0, warn: 1, strict: 2 }`. An editGate outside the three values is `strict`.
  The result is the mode with the lower severity.
- Reason text (one line each). Strict:

  `DevFlow ambient mode active — Bash write to tracked source denied: <paths>. Edit and Write are gated the same way.
  Route through a /devflow: skill (for a small fix, /devflow:quick or /devflow:micro). To bypass once, include "skip
  devflow" or "just edit" in your prompt. Never gated: .planning/, *.md, untracked files and paths outside the project.
  Severity: gates.bashEditGate (strict|warn|off) in .planning/config.json.`

  Warn swaps `denied` for `needs approval`. `BASH_GATE_CLASSIFIER = /Bash write to tracked source (?:denied|needs approval)/`.
- `BASH_EDIT_GATE_DEFAULT` carries a comment: "Set by TRD 60-06 from `recommendDefault(false_positive_rate)` of the
  session-audit replay. The evidence is references/bash-edit-gate-evidence.json, and the agreement is pinned by a test."
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Hermetic tracked-repo fixture builder</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/tracked-repo.cjs</files>
  <action>
Hand-built builder, no generated data:

```
makeTrackedRepo({ files = {}, untracked = {}, ignored = {}, planningDir = '.planning', history = [] } = {})
  -> { root, home, env, git(args), run(args), cleanup() }
```

- mkdtemp under `os.tmpdir()`. `root` is the NON-realpath'd spelling, so tests can also exercise the realpath one. A
  temp `HOME` sits inside the mkdtemp dir.
- `git init -b main` plus a local `user.name`, `user.email` and `commit.gpgsign false`. `env = { ...process.env,
  ...gitTestEnv(home) }`.
- `mkdir -p <root>/<planningDir>`. The project root is `path.dirname` of it (it is `root` itself when `planningDir` is
  `.planning`).
- `history` runs FIRST: an ordered list of `{ at: '<ISO>', add: {rel: content}, remove: [rel] }`. Each entry writes or
  removes its files, runs `git add -A`, and commits with `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE` = `at`. 60-05 needs
  dated history.
- Then write `<planningDir>/config.json` = `{}` and `files`, `git add` them and commit them together as "tracked"
  (current date).
- Then `ignored`: append to `.gitignore` (committed), write the files untracked. Then `untracked`: write only.
- `git(args)` throws on a non-zero exit and returns trimmed stdout. `run(args)` returns the raw spawnSync result.
  `cleanup()` does an `rmSync` with `recursive` and `force`.

Header comment: what it builds, that every git call is hermetic, and that `history` dates are exact (committer date)
so replay tests can place transcript rows before or after an add. Commit `test(60-03): tracked-repo fixture builder`.
  </action>
  <verify>`node -e "const {makeTrackedRepo}=require('./plugins/devflow/devflow/bin/lib/__fixtures__/tracked-repo.cjs'); const r=makeTrackedRepo({files:{'src/a.js':'x'},untracked:{'src/new.js':'y'},history:[{at:'2026-09-01T00:00:00Z',add:{'old.js':'o'}}]}); const first=Number(r.git(['log','--format=%ct','--reverse']).split('\n')[0]); console.log(r.git(['ls-files']).split('\n').sort().join(','), first===Date.parse('2026-09-01T00:00:00Z')/1000); r.cleanup()"` prints `.planning/config.json,old.js,src/a.js true`.</verify>
  <done>The builder creates and cleans up a hermetic repo with tracked, untracked, ignored and dated-history files.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: evaluateBashWrites and target classification (tests 1-4)</name>
  <files>plugins/devflow/devflow/bin/lib/bash-write-gate.cjs, plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs</files>
  <action>
RED: write tests 1-4, with fake predicates: `isTracked = abs => new Set(abs.filter(a => TRACKED.includes(path.relative('/repo', a))))`
and `isDirectory = abs => DIRS.includes(abs)`. Commit `test(60-03): bash write classification cases`.

GREEN: create `lib/bash-write-gate.cjs` with `evaluateBashWrites` per gotchas. The header comment states that this is
the one decision shared by the hook (live predicates) and the replay (historical predicates), the pass reasons, and that
the defaults fail open. Commit `feat(60-03): classify detected Bash writes against the project`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs` passes tests 1-4 (all 14 PATH_CASES).</verify>
  <done>Classification is GREEN, with the RED commit before it.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Severity, the strict-vs-warn rule, the reason text and the live tracked check (tests 5-10)</name>
  <files>plugins/devflow/devflow/bin/lib/bash-write-gate.cjs, plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs</files>
  <action>
RED: write tests 5-10, with 9 and 10 against `makeTrackedRepo`, skipped when `gitAvailable()` is false. Commit
`test(60-03): bash gate modes, threshold, reason and tracked check`.

GREEN: add `VALID_BASH_MODES`, `BASH_EDIT_GATE_DEFAULT = 'warn'` (with the gotchas comment), `FP_THRESHOLD = 0.02`,
`recommendDefault`, `readBashEditGate`, `effectiveBashMode`, `bashGateReason`, `BASH_GATE_CLASSIFIER`, `realpathDeep`
(same algorithm as gate-edits.js, with a comment saying why it is not required from there) and `gitTrackedSet`. Export
everything named in the artifact line. Commit `feat(60-03): bash gate severity, threshold and live tracked check`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs` passes 10/10. `node --test plugins/devflow/devflow/bin/lib/bash-write-detect.test.cjs plugins/devflow/devflow/bin/lib/shell-words.test.cjs` stays green.</verify>
  <done>Modes, threshold, reason and the tracked check are GREEN, with RED before them. The default is 'warn' pending
  60-06.</done>
  <recovery>If the timeout makes test 9 flaky on a cold machine, raise `timeoutMs` in the test call only. The hook's
  2000 ms default stays, because failing open on a slow git is the intended behaviour.</recovery>
</task>

</tasks>

<validation_gates>
- Task gate (`test`): `node --test plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs`.
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs` passes 10/10.
- `rg -n "BASH_EDIT_GATE_DEFAULT = 'warn'" plugins/devflow/devflow/bin/lib/bash-write-gate.cjs` matches once.
- `rg -n "editGate" plugins/devflow/devflow/bin/lib/bash-write-gate.cjs` shows no config read of `gates.editGate`.
</verification>

<success_criteria>
- [ ] All 14 PATH_CASES classify as specified (GATE-03)
- [ ] editGate warn/off always soften or disable the Bash rule (GATE-04)
- [ ] The strict-vs-warn rule is `recommendDefault` with `FP_THRESHOLD = 0.02` (GATE-05)
</success_criteria>

<output>
After completion, create `.planning/objectives/60-edit-gate-enforces-the-action/60-03-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`.
</output>
