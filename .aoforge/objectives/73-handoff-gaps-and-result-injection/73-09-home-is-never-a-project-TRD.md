---
objective: 73-handoff-gaps-and-result-injection
trd: "09"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/home-dot-dir-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/compat.cjs
  - plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-mode.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs
  - plugins/aoforge/hooks/home-project-detection.test.js
  - plugins/aoforge/hooks/gate-edits.test.js
autonomous: true
gap_closure: true
requirements: [HND-03]
must_haves:
  truths:
    - "compat.findProjectRoot never returns $HOME: with HOME=<tmp> holding `.aoforge/aoforge-watch.log`, a start path anywhere below <tmp> that has no planning directory of its own resolves to null, and a start path equal to <tmp> resolves to null"
    - "A real project below $HOME is still found: <tmp>/proj/.aoforge/ plus <tmp>/.aoforge/ -> findProjectRoot(<tmp>/proj/sub) is <tmp>/proj"
    - "The $HOME comparison holds across symlinked forms: HOME given as a symlink to the real directory under a different name (`<base>/link -> <base>/real`, in both directions) and macOS /var vs /private/var temp paths are still recognised; a found planning directory is realpath-compared with $HOME before it is returned (one realpath per candidate, never one per directory walked)"
    - "A start path outside $HOME walks exactly as before (to the filesystem root), and with HOME unset or empty there is no $HOME stop at all"
    - "planning-mode.resolveMainRoot and resolveCheckoutRoot never return $HOME: neither through the nearest-planning-dir walk nor when $HOME itself is a git checkout holding `.aoforge/`"
    - "Spawned with HOME=<tmp> holding `.aoforge/aoforge-watch.log`, classify-session, gate-edits, gate-commits and route-intent treat a git repo at <tmp>/repo exactly as they treat the same repo under a HOME with no `.aoforge/` (byte-identical stdout); gate-edits does not deny an ambient Write there"
    - "The same hooks still treat <tmp>/proj (its own `.aoforge/`) as an AOForge project: gate-edits denies an ambient Write to a tracked file there"
    - "The full suite has no new failures; every fixture that used a project root as HOME now uses a separate temp home"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/compat.cjs
      provides: "userHomeDir, isUserHome, and the $HOME stop in findProjectRoot"
      exports: ["userHomeDir", "isUserHome", "findProjectRoot"]
    - path: plugins/aoforge/aoforge/bin/lib/__fixtures__/home-dot-dir-fixtures.cjs
      provides: "hand-built temp homes with a user dot directory, repos and projects below them"
      exports: ["mkHome", "mkRepoBelow", "mkProjectBelow", "linkHome", "rmHome"]
    - path: plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs
      provides: "unit tests for the $HOME stop"
    - path: plugins/aoforge/hooks/home-project-detection.test.js
      provides: "the regression test the verifier asked for: spawned hooks under a temp HOME holding a watcher's dot directory"
  key_links:
    - from: "planning-mode.cjs nearestPlanningRoot"
      to: "compat.findProjectRoot"
      via: "delegation (one walker, one $HOME rule)"
      pattern: "findProjectRoot\\("
    - from: "compat.findProjectRoot"
      to: "compat.homeMatcher (shared with isUserHome)"
      via: "cheap stop check before each directory is inspected; full realpath check on a found candidate"
      pattern: "homeMatcher\\("
---

# TRD 73-09: $HOME is never an AOForge project root

<objective>
Gap G5, side (a), the BLOCKING gap from `73-VERIFICATION.md`. aoforge-watch writes its log and pid file into
`~/.aoforge/`, which has the same name as the planning directory. `compat.findProjectRoot` walks up with no stop at
$HOME, so once `~/.aoforge/` exists every repository below $HOME is detected as an AOForge project: gate-edits denies
ambient edits (strict by default), gate-commits gates commits, route-intent injects routing, classify-session
classifies the session as ambient AOForge, upgrade-project tries to upgrade $HOME. In 73-08's full run this failed four
classify-session tests on this machine.

Fix the detection side: a planning directory exactly at $HOME is never a project, and the walk stops there. Every
project walker either is `compat.findProjectRoot` or goes through it (survey below); planning-mode's own walker is
switched to it and its main-checkout candidate gets the same rule. TRD 73-11 fixes the other side (the watcher's files
leave `~/.aoforge/`).

Purpose: G5 (a). Output: the $HOME stop with lib-level and spawned-hook regression tests, RED before GREEN.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
Project kind `plugin`, work `feature` (gap closure): TDD strict, test list first, hand-built fixture builders, no
property-based libraries, no `.feature` files. User playbook (`~/.claude/CLAUDE.md`, TDD & Quality): for a `plugin`
kind the failing test comes first, then the implementation; write one test at a time against the list below.

Locked decision (from the orchestrator): "a `.aoforge/` exactly at $HOME is never a project". This applies to both
planning-directory names (the legacy one too), and the walk does not continue above $HOME.

Read narrowly:
- `.aoforge/objectives/73-handoff-gaps-and-result-injection/73-VERIFICATION.md` frontmatter (the G5 gap).
- `plugins/aoforge/aoforge/bin/lib/compat.cjs` (217 lines): `statOrNull`/`isDir` 31-48, `findProjectRoot` 134-149,
  exports 201-217. Header comment 1-19 lists the primitives; add the new ones there.
- `plugins/aoforge/aoforge/bin/lib/planning-mode.cjs`: `findGitHolder` 91-100, `nearestPlanningRoot` 102-111,
  `resolveMainRoot` 157-170, `resolveCheckoutRoot` 182-189.
- `plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs` header (test list style, temp trees, no git spawn).
- `plugins/aoforge/hooks/__fixtures__/gate-fixtures.js`: `preToolUsePayload` 51, `makeAoforgeProject` 75,
  `makeGitDir` 110 (reuse them in the hook test).
- `plugins/aoforge/hooks/classify-session.test.js` 40-57 (`runHook` shape) and `gate-edits.test.js` 1346-1350
  (`runStoreHook`, which sets HOME to the project root: see gotchas).

**Walker survey (done at planning time; re-check with `rg -n "findProjectRoot|nearestPlanningRoot|resolveMainRoot" plugins/aoforge/hooks plugins/aoforge/aoforge/bin`):**
project detection goes through `compat.findProjectRoot` in classify-session, gate-edits, gate-commits,
gate-executor-stop, verify-completion, verify-commits, guard-no-progress, route-results, route-intent,
inject-org-context, upgrade-project, statusline (estimate-run-store), doctor-cli, skill-active and state-rekey; or
through planning-mode (`resolveMainRoot`/`resolveCheckoutRoot`: gh-flush, todo-sync, the store verbs). The other
walk-up loops look for `.git` (findRepoRoot / findGitDir / findGitHolder / gate-commits' git dir), for
`.aoforge-handoff/` (handoff-results.findHandoffDir), or are realpath helpers; none of them decides whether a
directory is a project. gate-edits/skill-active `sharedPlanningDir` only reads a skill marker to ALLOW an edit after a
project was already detected, so it cannot make $HOME a project. `session-audit.findPlanningRoot` (transcript
telemetry, `session-audit.cjs` 406-420) runs its own upward loop and calls `findProjectRoot(dir, { maxUp: 0 })` once
per directory: after this change $HOME reads as not-a-project there, but that loop continues above $HOME (`/Users`,
`/`). That is harmless (offline telemetry over recorded cwds, never a gate, and nothing above $HOME holds a planning
directory in practice), so it is left as is. Record this survey, including that note, in the SUMMARY.
</context>

## Test list

Outermost first. Every home is a hand-built temp tree from `home-dot-dir-fixtures.cjs`; nothing reads the real $HOME.

**Spawned hooks (`hooks/home-project-detection.test.js`):** HOME=<tmp> with `<tmp>/.aoforge/aoforge-watch.log`
(the watcher's footprint), a git repo `<tmp>/repo` with a tracked-looking file and no `.aoforge/`; a control HOME
`<ctl>` with the same repo and no `.aoforge/`.
1. classify-session (SessionStart, cwd = repo): stdout under <tmp> is byte-identical to stdout under <ctl>.
2. gate-edits (PreToolUse Write to `<repo>/src/a.txt`, no skill marker, no agent_type): no `permissionDecision` of
   `deny` in stdout, and stdout equals the control run's.
3. gate-commits (PreToolUse Bash, payload command `git commit -m x`): stdout equals the control run's (no deny).
4. route-intent (UserPromptSubmit, prompt `add a delete button to the settings page`): stdout equals the control run's.
5. Positive control: `<tmp>/proj` with its own `.aoforge/` (`makeAoforgeProject`) and `.git` dir -> gate-edits denies
   an ambient Write to `<tmp>/proj/src/a.txt` (the project below $HOME is still a project).
6. cwd = <tmp> itself (session started in $HOME) -> gate-edits allows a Write to `<tmp>/notes.txt`.

**compat (`compat.home.test.cjs`):**
7. `findProjectRoot(<tmp>/repo/sub, { home: <tmp> })` -> null when only `<tmp>/.aoforge/` exists.
8. `findProjectRoot(<tmp>, { home: <tmp> })` -> null.
9. `<tmp>/proj/.aoforge/` and `<tmp>/.aoforge/` -> `findProjectRoot(<tmp>/proj/sub, { home: <tmp> })` is `<tmp>/proj`.
10. The legacy planning directory at $HOME (name from `LEGACY.planningDir`, never spelled) -> null too.
11. Symlink with a different name: `linkHome` makes `<base>/link -> <base>/real`, with `<base>/real/.aoforge/` holding
    the watcher's log. HOME=`<base>/link`, start `<base>/real/repo` -> null; and the reverse (HOME=`<base>/real`, start
    `<base>/link/repo`) -> null. The basenames differ, so the cheap stop check never fires on this walk: only the
    candidate check (the planning directory is found at `<base>/real` or `<base>/link`, whose realpath is $HOME's) refuses
    it. No over-refusal: HOME=`<base>/real` and a project at `<base>/real/proj/.aoforge/` -> start `<base>/link/proj/sub`
    resolves to `<base>/link/proj`.
12. Outside home: home `<a>`, project `<b>/proj/.aoforge/` -> `findProjectRoot(<b>/proj/x, { home: <a> })` is `<b>/proj`.
13. Default home: with `process.env.HOME` set to <tmp> (restored after) and no `home` option -> null for `<tmp>/repo`.
14. `home: ''` (and HOME unset with `os.homedir` stubbed to `''` if needed) -> no stop: `<tmp>/.aoforge/` is found as
    before (pins that the guard is the only change).
15. `maxUp` still bounds the walk (`maxUp: 0` from `<tmp>/proj/sub` -> null).
16. `isUserHome(<tmp>, { home: <tmp> })` true; `isUserHome(<tmp>/repo, { home: <tmp> })` false.

**planning-mode (`planning-mode.test.cjs`, new describe):**
17. `<tmp>/.aoforge/` only, start `<tmp>/repo/sub` (HOME=<tmp>) -> `resolveMainRoot` null and `planningMode(...).root`
    null.
18. `<tmp>` has a `.git` directory and `.aoforge/` (a home kept in git), start `<tmp>/notes` -> `resolveMainRoot` null,
    `resolveCheckoutRoot` null.
19. Existing tests 1-4 of planning-mode still pass unchanged.

<embedded_context>

<codebase_examples>
`findProjectRoot` today (`compat.cjs` 140-149):
```js
function findProjectRoot(start, { fsImpl = fs, maxUp = 64 } = {}) {
  let dir = path.resolve(start);
  for (let i = 0; i <= maxUp; i++) {
    if (hasNewPlanDir(dir, fsImpl) || hasOldPlanDir(dir, fsImpl)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
```
Shape of the change (pseudocode, keep it cheap: PostToolUse and PreToolUse hooks call this on every tool call):
```js
const os = require('os');

/** $HOME as the hooks see it, read per call (tests and spawned hooks set HOME): env.HOME, else os.homedir(), else ''. */
function userHomeDir(env = process.env) {
  if (typeof env.HOME === 'string' && env.HOME !== '') return env.HOME;
  try { return os.homedir() || ''; } catch { return ''; }
}

function realOr(p, fsImpl) {
  if (typeof fsImpl.realpathSync !== 'function') return p;   // injected fakes may lack it
  try { return fsImpl.realpathSync(p); } catch { return p; }
}

// One matcher per walk. Two checks with different costs:
//   stopsAt(dir)  runs on EVERY directory of the walk and terminates it: exact path, or (only when the basename
//                 equals home's) a realpath comparison. A normal walk costs no extra syscalls.
//   isHome(dir)   runs only on a CANDIDATE (a directory that holds a planning directory), right before it would be
//                 returned: exact path, else realpath(dir) === realpath(home). One realpath per candidate, so a home
//                 reached under another name (<base>/link -> <base>/real, test 11) is still refused.
// home's own realpath is computed lazily, at most once per walk, and shared by both checks.
function homeMatcher(home, fsImpl) {
  if (typeof home !== 'string' || home === '') return { stopsAt: () => false, isHome: () => false };
  const resolved = path.resolve(home);
  const base = path.basename(resolved);
  let real;
  const homeReal = () => (real === undefined ? (real = realOr(resolved, fsImpl)) : real);
  return {
    stopsAt: (dir) => dir === resolved
      || (path.basename(dir) === base && realOr(dir, fsImpl) === homeReal()),
    isHome: (dir) => dir === resolved || realOr(dir, fsImpl) === homeReal(),
  };
}

/** True when `dir` is the user's home directory (any symlinked form, any name). One realpath of `dir`. */
function isUserHome(dir, { home = userHomeDir(), fsImpl = fs } = {}) {
  return homeMatcher(home, fsImpl).isHome(path.resolve(dir));
}

function findProjectRoot(start, { fsImpl = fs, maxUp = 64, home = userHomeDir() } = {}) {
  const atHome = homeMatcher(home, fsImpl);
  let dir = path.resolve(start);
  for (let i = 0; i <= maxUp; i++) {
    // CRITICAL: $HOME is never a project root, and nothing above it is searched (G5, objective 73).
    if (atHome.stopsAt(dir)) return null;
    if (hasNewPlanDir(dir, fsImpl) || hasOldPlanDir(dir, fsImpl)) {
      // GOTCHA: the stop check misses a home whose symlinked name differs; the candidate check catches it. A
      // candidate that IS $HOME ends the walk (null): the walk never continues above $HOME.
      return atHome.isHome(dir) ? null : dir;
    }
    ...unchanged
  }
}
```
planning-mode (`nearestPlanningRoot` 102-111) becomes a delegation:
```js
function nearestPlanningRoot(start) {
  return findProjectRoot(start, { maxUp: Infinity });   // compat: same names, same $HOME rule
}
```
and the git-holder candidate in `resolveMainRoot` / `resolveCheckoutRoot` is refused when `isUserHome(candidate)`
(then the code falls through to `nearestPlanningRoot`, which also stops at $HOME).
</codebase_examples>

<anti_patterns>
- Do not special-case the watcher's file names ("skip $HOME unless it holds STATE.md") here. The decision is locked:
  $HOME is never a project, whatever `~/.aoforge/` holds. 73-13's doctor check deals with what is left in it.
- Do not realpath every directory on the walk; hooks run on every tool call. Compare resolved forms first. The one
  required exception is the candidate check: when a planning directory is found at `dir`, compare `realOr(dir)` with
  home's realpath (computed once per walk, lazily) before returning `dir`. That is one realpath per candidate, not per
  directory, and test 11 needs it; this rule does not forbid it.
- Do not cache $HOME at module load (`const HOME = os.homedir()`): tests and spawned hooks change HOME per process and
  per call, and compat's header says nothing here caches.
- Do not touch the `.git` walkers, `findHandoffDir`, `sharedPlanningDir` or `session-audit.findPlanningRoot` (see the
  survey); widening this TRD into them changes behaviour nothing asked for. Do not touch gate-interactive or
  `bin/lib/interactive-commands.cjs` and its test and case table: 73-10 owns them in this wave.
- Do not edit the existing hook test files beyond the HOME fixture fix; the regression lives in one new file.
- Do not use LLM-generated data or property-based libraries; every case above is a hand-built tree.
</anti_patterns>

<error_recovery>
- A spawned-hook control comparison differs for a reason unrelated to the dot directory (a timestamp, a temp path in
  the output): normalise only that token (replace `<tmp>`/`<ctl>` with `<HOME>`), never the decision fields.
- macOS: `fs.mkdtempSync(os.tmpdir())` returns `/var/folders/...` while a spawned process's `process.cwd()` is
  `/private/var/folders/...`. Test 11 and the hook tests exist to catch exactly this; if one fails only on the
  `/private` form, the basename+realpath comparison is not being reached.
- Test 11 fails in one direction or both while the other $HOME tests pass: the candidate check (`isHome` on the found
  directory) is missing or compares basenames. The stop check alone cannot see `<base>/link` and `<base>/real` as the
  same directory, by design.
- A previously green test now fails because its project root IS its HOME: give it a separate temp home (gotchas).
</error_recovery>

</embedded_context>

<gotchas>
- `gate-edits.test.js` `runStoreHook` (line ~1349) passes `HOME: root`, so the store-mode project root is HOME and
  stops being a project after this change. Give it a sibling temp home (`fs.mkdtempSync(...)`), keep the project
  where it is. Search the whole suite for the same shape: `rg -n "HOME:\s*(root|dir|tmp|project|base)\b" plugins -g '*.test.*'`
  and read each hit (most set HOME to a directory that is not the project; leave those alone).
- `mkdtemp` homes under `os.tmpdir()` are not below the real $HOME on macOS, so existing tests that never set HOME
  keep walking as before. Tests whose fixtures live under the real home (`~/.aoforge-test-fixtures/`,
  `project-state-fixtures.cjs`) are below $HOME but find their own project first; they are unaffected.
- The real `~/.aoforge/` on this machine was removed by the verifier. If it reappears during the run (someone started
  the installed 3.0.0 watcher), that is exactly the bug; the new tests use temp homes and do not depend on it.
- Hooks running in this session are the INSTALLED plugin's, not this checkout's. The installed gate-interactive still
  matches inside quoted arguments: never put a TTY command name (the passphrase tool, auth logins, `sudo`) inside a
  quoted Bash argument or a commit message. If a Bash call is denied with a handoff id, delete the stray
  `.aoforge-handoff/pending/<id>.json` it names and rephrase.
- `aof-tools commit` messages: describe the change ("$HOME is never a project root") without naming gated commands.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fixture builders for temp homes</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/home-dot-dir-fixtures.cjs</files>
  <action>
Create hand-built builders (no generated data) used by this TRD and by 73-11 and 73-13:
- `mkHome({ dotDir = {}, prefix = 'aof-home-' } = {})` -> `{ home, dotDir }`: `fs.mkdtempSync(path.join(os.tmpdir(), prefix))`;
  writes each `name -> content` of `dotDir` into `<home>/<NAMES.userDotDir>/` (the watcher's footprint is
  `{ 'aoforge-watch.log': '[t] INFO dispatching h-1\n' }`).
- `mkRepoBelow(home, name = 'repo')` -> path: `<home>/<name>` with a `.git` directory (reuse the shape of
  `hooks/__fixtures__/gate-fixtures.js` `makeGitDir`, no git spawn) and `src/a.txt`.
- `mkProjectBelow(home, name = 'proj')` -> path: a repo as above plus `.aoforge/ROADMAP.md` and `.aoforge/objectives/`
  (the `makeAoforgeProject` shape).
- `linkHome({ dotDir = {} } = {})` -> `{ base, real, link }`: `<base>/real` and a symlink `<base>/link -> <base>/real`
  (different basenames on purpose: test 11); `dotDir` is written into `<base>/real/<NAMES.userDotDir>/` as in `mkHome`.
- `rmHome(...dirs)`: `fs.rmSync(d, { recursive: true, force: true })` for each.
Build every name from `NAMES` in `legacy-names.cjs`; spell no legacy name. Header comment: purpose, consumers
(73-09, 73-11, 73-13), "hand-built, never generated".
  </action>
  <verify>node -e "const f=require('./plugins/aoforge/aoforge/bin/lib/__fixtures__/home-dot-dir-fixtures.cjs');const h=f.mkHome({dotDir:{'x.log':'a'}});console.log(require('fs').existsSync(require('path').join(h.home,'.aoforge','x.log')));f.rmHome(h.home)" prints true</verify>
  <done>The builders exist, build only under os.tmpdir(), and spell no legacy name (`npm test` rename guard stays green).</done>
  <recovery>If the rename guard flags the file, a legacy name was spelled: build it from `LEGACY` or drop it.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: RED, the $HOME regression tests</name>
  <files>plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs, plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs, plugins/aoforge/hooks/home-project-detection.test.js</files>
  <action>
Write test list items 1-19 in that order of priority (hooks first), one at a time, each run before the next is written.
- `hooks/home-project-detection.test.js`: header with the test list and the reason (G5, 73-VERIFICATION). Spawn each
  hook with `spawnSync('node', [hook], { cwd, input, encoding: 'utf8', env })` where `env` is `process.env` minus every
  `AOFORGE_SKIP_*` key, with `HOME` set to the temp home. Payloads from `hooks/__fixtures__/gate-fixtures.js`
  (`preToolUsePayload`); for classify-session no stdin is needed (see its `runHook`); for route-intent build
  `{ hook_event_name: 'UserPromptSubmit', prompt, session_id: 's-fixture', cwd }`. Compare stdout under <tmp> with
  stdout under <ctl> after replacing each home path with `<HOME>`.
- `compat.home.test.cjs`: items 7-16, passing `home` explicitly except item 13.
- `planning-mode.test.cjs`: a new `describe('$HOME is never the main root (TRD 73-09)')` with items 17-18; set
  `process.env.HOME` in a try/finally.
Run them against the current code: items 1-4 (at least gate-edits and classify-session), 6, 7, 8, 10, 11 (both
directions; its no-over-refusal case passes), 13, 16 (`isUserHome` is missing), 17 and 18 must fail; 5, 9, 12, 14, 15
and 19 pass. Record which fail and why. Commit
the tests alone: `test(73-09): pin that $HOME is never an AOForge project root`.
  </action>
  <verify>node --test plugins/aoforge/hooks/home-project-detection.test.js plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs exits non-zero, and the failures are the $HOME cases (gate-edits denies the repo below the temp home; findProjectRoot returns the temp home)</verify>
  <done>The bug is reproduced by spawned hooks and by the libraries under a temp HOME; RED output captured for the SUMMARY.</done>
  <recovery>If a hook test passes on the old code, check that HOME really reached the child (print `process.env.HOME` from a one-line node child with the same env) and that the dot directory is at `<home>/.aoforge`, not inside the repo.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: GREEN, the $HOME stop in compat and planning-mode</name>
  <files>plugins/aoforge/aoforge/bin/lib/compat.cjs, plugins/aoforge/aoforge/bin/lib/planning-mode.cjs, plugins/aoforge/hooks/gate-edits.test.js</files>
  <action>
Implement per codebase_examples: `userHomeDir`, `homeMatcher` (internal: the cheap `stopsAt` on every directory and
the candidate `isHome` before a found directory is returned), `isUserHome` (exported), the `home` option and both
$HOME checks in `findProjectRoot`; update compat's header list ("findProjectRoot: a project root is a directory holding either planning
directory, never $HOME") and the JSDoc. In planning-mode, make `nearestPlanningRoot` delegate to
`compat.findProjectRoot(start, { maxUp: Infinity })` and refuse an `isUserHome` git-holder candidate in
`resolveMainRoot` and `resolveCheckoutRoot`. Make items 1-19 pass one at a time. Then run the full suite; fix
`gate-edits.test.js` `runStoreHook` (and any other test whose project root is its HOME) by giving it a separate temp
home, without changing what the test asserts. Commit `fix(73-09): stop the project-root walk at $HOME`.
  </action>
  <verify>node --test plugins/aoforge/hooks/home-project-detection.test.js plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs plugins/aoforge/hooks/gate-edits.test.js plugins/aoforge/hooks/classify-session.test.js exits 0; then npm test shows no new failures against the 73-VERIFICATION baseline (12,187 tests, 0 fail, 32 skipped) apart from the tests this TRD adds</verify>
  <done>No ancestor walk returns $HOME; projects below $HOME are still found; the regression tests pass; the full suite is green.</done>
  <recovery>If a test outside this TRD's files starts failing and its fixture is not "HOME is the project root", stop and read it: the $HOME stop may be over-matching (for example a basename collision that realpath should have rejected). Revert compat.cjs with `git checkout -- plugins/aoforge/aoforge/bin/lib/compat.cjs` and re-apply the change step by step.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/aoforge/hooks/home-project-detection.test.js plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs   (scoped)</test>
<test>npm test   (full suite before the last commit; if micro.test.cjs hangs on commit signing, use node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs')</test>
<lint>not_available</lint>
<build>not_available</build>
</validation_gates>

<verification>
- `rg -n "isUserHome" plugins/aoforge/aoforge/bin/lib/compat.cjs plugins/aoforge/aoforge/bin/lib/planning-mode.cjs` finds the export and both planning-mode uses.
- `rg -n "function nearestPlanningRoot" -A 3 plugins/aoforge/aoforge/bin/lib/planning-mode.cjs` shows the delegation to `findProjectRoot`.
- The RED commit precedes the GREEN commit in `git log --oneline`.
- Full suite: no new failures.
</verification>

<success_criteria>
- A `~/.aoforge/` left by any watcher run no longer turns repositories under $HOME into AOForge projects for any hook or
  for planning mode.
- Real projects below $HOME behave exactly as before.
- The verifier's requested regression test exists and fails on the pre-fix code.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/73-handoff-gaps-and-result-injection/73-09-SUMMARY.md` (through
`aof-tools summary post`) with the TDD evidence table (RED commit and failing items, GREEN commit) and the walker survey.
</output>
