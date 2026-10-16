---
mode: quick
id: 21-sync-runtime-never-downgrades-the-home-m
title: "sync-runtime never downgrades the ~/.claude/devflow mirror"
type: standard
tasks: 3
context_target: ~30%
files_modified:
  - plugins/devflow/hooks/sync-runtime.js
  - plugins/devflow/hooks/sync-runtime.test.js
  - CHANGELOG.md
autonomous: true
must_haves:
  observable_truths:
    - "A session running an OLDER plugin (e.g. a stale 2.7.1 cache) against a NEWER mirror (2.10.1) exits 0 and leaves the mirror byte-identical: every file path, every file's content, and `.plugin-version` unchanged. The global upgrade does not run."
    - "A NEWER plugin re-mirrors an older mirror and writes the new `.plugin-version`. The compare is numeric per part, so plugin 2.10.1 over mirror 2.9.0 mirrors, and plugin 2.9.0 over mirror 2.10.1 is a no-op (a string compare gets this backwards)."
    - "Equal versions with `bin/df-tools.cjs` present are a no-op. Equal versions with `bin/df-tools.cjs` missing re-mirror (self-heal, unchanged)."
    - "A mirror `.plugin-version` that is missing, empty, or not parseable semver is always re-mirrored."
    - "A plugin version that is not parseable (`unknown`, missing `version` field, `banana`) never overwrites a mirror that has a parseable version."
    - "Prerelease handling: 2.10.1 > 2.10.1-rc.1, so plugin 2.10.1 over mirror 2.10.1-rc.1 mirrors and plugin 2.10.1-rc.1 over mirror 2.10.1 is a no-op. A leading `v` and `+build` metadata are ignored."
    - "`validate health` still reports mirror > installed as I022 (info, mirror-ahead), not E020. validate.cjs is unchanged."
  artifacts:
    - "plugins/devflow/hooks/sync-runtime.js: inline `parseSemver` / `compareSemver` / `shouldMirror` helpers replace the `installedVersion === pluginVersion` early exit. The mirror, swap, `.plugin-version` write and global-upgrade path below the gate do not change."
    - "plugins/devflow/hooks/sync-runtime.test.js: a new `describe('Quick 21: never downgrade the mirror', ...)` block of subprocess cases using the existing `makeTmpRoot` / `runHook` harness."
    - "CHANGELOG.md: one bullet under `## [Unreleased]` → `### Fixed` (the existing heading at line ~113)."
  key_links:
    - "The version gate sits at sync-runtime.js lines ~37-50, BEFORE the `fs.existsSync(sourceDir)` check, the tmp-dir sweep and the swap. A no-op must exit there, so nothing below it (sweep included) runs."
    - "validate.cjs `compareSemver` (line ~18) and the E020/I022 split (lines ~476-500) already classify the mirror-ahead case correctly. Do not import validate.cjs into the hook: the hook must stay dependency-free, and the mirror may not even exist yet."
---

<objective>
Stop `plugins/devflow/hooks/sync-runtime.js` from downgrading `~/.claude/devflow`.

Today the hook skips work only when `installedVersion === pluginVersion` and `bin/df-tools.cjs` exists. Any other difference re-mirrors, including a session started from an OLDER plugin cache. The mirror then flip-flops between versions; it was found at 2.7.1 while 2.10.1 was installed.

New rule. Mirror only when one of these holds:
- (a) the mirror's `.plugin-version` is missing or is not parseable semver;
- (b) the bundled plugin version is strictly newer than the mirror's;
- (c) the versions are equal but the content sentinel (`bin/df-tools.cjs`) is missing.

Every other case exits 0 and touches nothing. That covers a plugin older than the mirror, and an unparseable plugin version against a parseable mirror. On a downgrade refusal, write one line to stderr.

Strict test-first: the failing-test commit (`test(quick-21): ...`), then the fix commit (`fix(quick-21): ...`).
</objective>

<context>
- `kind` for this repo is plugin; the work is a bugfix. The user playbook is strict red→green for library/api/cli-shaped code, and a hook is CLI-shaped. Write one failing test at a time, and confirm each fails for the right reason before you implement.
- **Use the repo copy of df-tools for EVERY call**: `node plugins/devflow/devflow/bin/df-tools.cjs ...`. The home copy `~/.claude/devflow` is the stale 2.7.1 mirror this job is about.
- Commits: `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths...>`. Do not use a raw commit; gate-commits blocks it.
- Search with `rg -n -e <pattern>`. Never use `rg -nE`.
- Do not bump the version, tag, or push. Never use port 8080.
- The test baseline for `npm test` is 4251 tests / 4218 pass / 1 fail (MA-7, pre-existing) / 32 skipped. After this job, only the new tests should be added, and the only failure should still be MA-7.
</context>

<embedded_context>
<codebase_examples>
The current gate (sync-runtime.js ~30-50):
```js
let pluginVersion = 'unknown';
try {
  pluginVersion = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version || 'unknown';
} catch {
  process.exit(0);            // malformed/missing plugin.json → exit, untouched (keep)
}
let installedVersion = null;
try { installedVersion = fs.readFileSync(versionFile, 'utf8').trim(); } catch {}
if (installedVersion === pluginVersion && fs.existsSync(path.join(targetDir, 'bin', 'df-tools.cjs'))) {
  process.exit(0);
}
```

Test harness (sync-runtime.test.js): `makeTmpRoot()` returns `{ root, pluginRoot, devflowSrc, home, targetDir, versionFile }` and writes plugin.json with `TEST_VERSION = '9.9.9-test'`. `runHook(pluginRoot, home, extraEnv)` spawns the hook with a fake HOME and CLAUDE_PLUGIN_ROOT. `listFiles(dir)` returns relative paths. The existing Test 2 (equal + intact), Test 3 (`1.0.0-old` → `9.9.9-test` re-sync) and Test 7 (equal + missing sentinel) must keep passing unchanged. So must test 18 in the 36-06 block (the fast path does not run the global upgrade).

Reference semantics: `compareSemver` in validate.cjs ~18 is numeric per part. Do not copy it: it drops prerelease entirely (`2.10.1-rc.1` splits to `2`,`10`,`1-rc`,`1` → `[2,10,1]`, equal to `2.10.1`), so it cannot rank rc below release.
</codebase_examples>

<anti_patterns>
- Do NOT `require('./sync-runtime.js')` from the test. The hook runs top-level `process.exit(0)` and would kill the test runner. Test only through the `runHook` subprocess.
- Do NOT use string `<` / `>` or `localeCompare` for versions (`'2.9.0' > '2.10.1'` is true).
- Do NOT pass the real HOME or the repo root as CLAUDE_PLUGIN_ROOT in any test. That would overwrite the live mirror.
- Do NOT move the sweep, swap, or global-upgrade code. Do NOT change which cases run the global upgrade among those that mirror.
- No property-based libraries. Use named, hand-built cases only (constraints `no_property_based_default`, `no_llm_test_data`).
</anti_patterns>

<error_recovery>
- If an existing test breaks after the fix, check its version pair first. `9.9.9-test` is a PRERELEASE and sorts below `9.9.9`. A pre-seeded mirror of `9.9.9` would now be a no-op.
- If the byte-identical snapshot differs only by an mtime, the snapshot is wrong. Compare path lists and contents, not stats.
- `git restore plugins/devflow/hooks/sync-runtime.js` reverts a bad fix attempt. The RED commit stays.
</error_recovery>
</embedded_context>

## Test list

Each case is its own `test(...)` inside `describe('Quick 21: never downgrade the mirror', ...)`. Add two local helpers:
- `setPluginVersion(pluginRoot, v)` rewrites `.claude-plugin/plugin.json`. Pass `undefined` to get `{}` with no version field.
- `seedMirror(targetDir, versionFile, v, { sentinel = true })` creates `bin/df-tools.cjs` (when sentinel is true), a canary `bin/canary.txt`, and `.plugin-version` (skipped when `v === null`).
- `snapshot(targetDir)` returns a `{relPath: content}` map built with `listFiles`.

| # | plugin | mirror `.plugin-version` | sentinel | expected | red today? |
|---|--------|--------------------------|----------|----------|------------|
| 1 | 2.7.1 | 2.10.1 | yes | no-op; snapshot deepEqual before/after; exit 0; stderr has exactly one line mentioning both versions | RED |
| 2 | 2.9.0 | 2.10.1 | yes | no-op (numeric, not lexical) | RED |
| 3 | 2.7.1 | 2.10.1 | no | no-op; the mirror is still left alone (downgrade refused even when broken) | RED |
| 4 | 2.10.1 | 2.7.1 | yes | mirrors; `.plugin-version` = 2.10.1; canary gone | green |
| 5 | 2.10.1 | 2.9.0 | yes | mirrors (numeric per part) | green |
| 6 | 2.10.1 | 2.10.1 | yes | no-op; canary kept | green |
| 7 | 2.10.1 | 2.10.1 | no | repairs; df-tools.cjs present | green |
| 8 | 2.10.1 | `garbage` | yes | mirrors | green |
| 9 | 2.10.1 | `` (empty file) | yes | mirrors | green |
| 10 | 2.10.1 | (no file) | yes | mirrors | green |
| 11 | `unknown` | 2.10.1 | yes | no-op; snapshot identical | RED |
| 12 | (no version field) | 2.10.1 | yes | no-op | RED |
| 13 | `banana` | (no file) | n/a | mirrors (fresh install is still allowed) | green |
| 14 | 2.10.1 | 2.10.1-rc.1 | yes | mirrors | green |
| 15 | 2.10.1-rc.1 | 2.10.1 | yes | no-op | RED |
| 16 | v2.10.1 | 2.10.1+build.5 | yes | equal → no-op; canary kept | RED (strings differ) |
| 17 | 2.7.1 | 2.10.1 | yes | with the 36-06 `setup(t)` fixture (legacy home, `RUN` env): legacy files remain in place, i.e. the global upgrade did NOT run | RED |

For case 17, put the test inside the existing `TRD 36-06` describe so it can reuse `setup`, `legacyInPlace` and `RUN`. Seed `targetDir` with `.plugin-version` = 2.10.1 plus `bin/df-tools.cjs` before running.

<tasks>

<task type="auto" tdd="true">
  <name>RED: pin the no-downgrade contract in sync-runtime.test.js</name>
  <files>plugins/devflow/hooks/sync-runtime.test.js</files>
  <action>
Add the helpers and the 17 cases from the Test list. Add a header comment line listing "Quick 21: never downgrade" under the existing test-case list at the top of the file. Assert the exit status first in every case: `assert.equal(result.status, 0, result.stderr)`. For the no-op cases, take `snapshot(targetDir)` before and after and `assert.deepEqual` them. That snapshot includes `.plugin-version`, because `listFiles` walks dotfiles.

For case 1, assert on stderr like this: `result.stderr.trim().split('\n').filter(Boolean).length === 1`, and the line includes both '2.7.1' and '2.10.1'. Do NOT pin the exact wording.

Run `node --test plugins/devflow/hooks/sync-runtime.test.js`. Confirm that exactly the cases marked RED fail, and that they fail because the mirror changed or the version was rewritten. They must not fail from a harness error. If a "green" case fails, fix the test, not the hook.

Commit only the test file:
`node plugins/devflow/devflow/bin/df-tools.cjs commit "test(quick-21): RED — sync-runtime must never downgrade the mirror" --files plugins/devflow/hooks/sync-runtime.test.js`
  </action>
  <verify>`node --test plugins/devflow/hooks/sync-runtime.test.js` shows failures only in cases 1, 2, 3, 11, 12, 15, 16, 17. All pre-existing tests pass.</verify>
  <done>The RED commit exists and contains only sync-runtime.test.js. The failing set equals the RED column.</done>
</task>

<task type="auto" tdd="true">
  <name>GREEN: semver-gated mirror decision in sync-runtime.js</name>
  <files>plugins/devflow/hooks/sync-runtime.js</files>
  <action>
Replace the early-exit block (lines ~37-50) with inline helpers and a single decision. Keep the plugin.json read and its `catch { process.exit(0) }` exactly as they are. Also keep `pluginVersion` defaulting to 'unknown' when the version field is absent.

Approach:
```js
// parseSemver: /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/ on the trimmed string
//   → { nums:[M,m,p] (Number), pre: string[] (split '.') } or null
// compareSemver(a,b): nums numeric per part; then prerelease:
//   no-pre > pre; else per identifier: both numeric → numeric; numeric < alphanumeric;
//   both alpha → ASCII compare; all equal → shorter list is lower. Returns -1/0/1.
// Decision:
const mirrorSv = parseSemver(installedVersion);   // null when missing/empty/garbage
const pluginSv = parseSemver(pluginVersion);
const sentinelOk = fs.existsSync(path.join(targetDir, 'bin', 'df-tools.cjs'));
if (mirrorSv) {
  if (!pluginSv) process.exit(0);                       // unparseable plugin never overwrites a parseable mirror
  const cmp = compareSemver(pluginSv, mirrorSv);
  if (cmp < 0) {                                        // plugin older → never downgrade
    process.stderr.write(`[devflow] sync-runtime: plugin ${pluginVersion} is older than mirror ${installedVersion}; not downgrading ~/.claude/devflow\n`);
    process.exit(0);
  }
  if (cmp === 0 && sentinelOk) process.exit(0);         // equal + intact
  // cmp > 0, or equal + sentinel missing → fall through and mirror
}
// mirror missing/unparseable → fall through and mirror
```
# CRITICAL: every no-op exits BEFORE the `fs.existsSync(sourceDir)` check, the tmp sweep, and the swap.
# GOTCHA: `installedVersion` may be null (no file) or '' (empty file); parseSemver must return null for both without throwing.
# GOTCHA: '9.9.9-test' (TEST_VERSION) is a prerelease identifier `test`. It must parse.

Update the file's header design comment. Change "when the version differs" to "when the bundled plugin is newer (never downgrades)", and add a bullet that points to quick-21. Do not change anything below the gate.

Run `node --test plugins/devflow/hooks/sync-runtime.test.js` until every case passes.

Commit:
`node plugins/devflow/devflow/bin/df-tools.cjs commit "fix(quick-21): GREEN — sync-runtime mirrors only when the plugin is newer; never downgrades" --files plugins/devflow/hooks/sync-runtime.js`
  </action>
  <verify>`node --test plugins/devflow/hooks/sync-runtime.test.js` passes with 0 failures, including Tests 2, 3 and 7 and the 36-06 block.</verify>
  <done>All 17 new cases and all pre-existing sync-runtime tests pass. `git diff HEAD~1 -- plugins/devflow/hooks/sync-runtime.js` touches only the header comment and the version-gate region.</done>
  <recovery>If the fix breaks the 36-06 tests, check that `setup(t)` pre-seeds no `.plugin-version`, so those cases take the mirror-missing path. Run `git restore plugins/devflow/hooks/sync-runtime.js` and redo the fix with the gate only.</recovery>
</task>

<task type="auto">
  <name>Confirm validate E020/I022, CHANGELOG bullet, full suite</name>
  <files>CHANGELOG.md</files>
  <action>
1. Read `plugins/devflow/devflow/bin/lib/validate.cjs` lines ~470-500. Confirm that mirror > installed emits `I022` (info, mirror-ahead) and mirror < installed emits `E020`. Then run `rg -n -e "I022" plugins/devflow/devflow/bin/lib/*.test.cjs` and confirm a test covers the mirror-ahead case. Both were already true at planning time, so validate.cjs should stay untouched. Edit it (with a test first) ONLY if the classification is actually wrong. Record the finding in the SUMMARY.

2. Add one bullet at the end of the `### Fixed` list under `## [Unreleased]` in CHANGELOG.md (heading at line ~113; the section ends before `## [2.10.1]` at line ~167). Wording along these lines:
   "- `sync-runtime` no longer downgrades `~/.claude/devflow`. A session started from an older plugin cache re-mirrored over a newer mirror, so the mirror flip-flopped. It was found at 2.7.1 with 2.10.1 installed. The hook now mirrors only when the mirror's version is missing or unparseable, when the plugin is strictly newer (numeric semver, prerelease-aware), or when versions match but `bin/df-tools.cjs` is missing. An unparseable plugin version never overwrites a parseable mirror."

3. Run `node --test plugins/devflow/hooks/sync-runtime.test.js`, then `npm test`. Compare the result with the baseline (4251 / 4218 pass / 1 fail MA-7 / 32 skipped). Expected: total and pass counts rise by the number of new cases, and the only failure is still MA-7.

4. Commit:
`node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(quick-21): changelog — sync-runtime never downgrades the mirror" --files CHANGELOG.md`
  </action>
  <verify>`npm test` shows 1 failure (MA-7 only). `rg -n -e "no longer downgrades" CHANGELOG.md` hits a line between 113 and 167.</verify>
  <done>The CHANGELOG bullet is committed, the full suite matches the baseline plus the new passing tests, and the validate.cjs finding is recorded.</done>
</task>

</tasks>

<verification>
- `node --test plugins/devflow/hooks/sync-runtime.test.js`: 0 failures.
- `npm test`: the only failure is MA-7.
- `git log --oneline -3` shows test(quick-21) → fix(quick-21) → docs(quick-21), in that order.
- No change to package.json, plugin.json or marketplace.json. No tag, no push.
</verification>

<success_criteria>
The mirror cannot be moved to an older version by any session. Upgrades, first installs, garbage version files and a missing df-tools.cjs at the same version still mirror. The global upgrade still runs after every real mirror and never runs on a no-op.
</success_criteria>

<output>
Write `.planning/quick/21-sync-runtime-never-downgrades-the-home-m/21-SUMMARY.md` with: the commits, the test counts before and after, the validate.cjs finding, and any deviations.
</output>
