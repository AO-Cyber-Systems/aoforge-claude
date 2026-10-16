---
objective: 78-remove-the-rename-shims
trd: "78-02"
subsystem: rename-shims
tags: [rename, pointer-plugin, doc-refs, marketplace, changelog-gate, sc-2]
requires: []
provides:
  - "The pre-rename pointer plugin, its marketplace entry, its generator and fixtures, the package.json glob and their rename-guard ALLOW entries are gone"
  - "doc-refs reads `/aoforge:<name>` only (NAMESPACES = [NAMES.slug]); skill-route exports no NAMESPACE_RENAMES"
  - "changelog-on-tag.js reads one plugin manifest (PLUGIN_MANIFEST, exported)"
  - "old-commands.legacy.test.cjs: the repo contract that the pointer release and the legacy command forms are gone"
affects: [doc-refs, skill-route, migration-0007, doc-staleness, rename-guard, changelog-on-tag, marketplace]
key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/old-commands.legacy.test.cjs
  modified:
    - .claude-plugin/marketplace.json
    - package.json
    - plugins/aoforge/aoforge/bin/lib/doc-refs.cjs
    - plugins/aoforge/aoforge/bin/lib/skill-route.cjs
    - plugins/aoforge/hooks/changelog-on-tag.js
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-command-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/doc-refs.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/doc-refs.test.cjs
    - plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs
    - plugins/aoforge/aoforge/bin/lib/skill-route.test.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0007-doc-refs-fix.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0007-doc-refs-fix.test.cjs
    - plugins/aoforge/aoforge/bin/lib/doc-staleness.test.cjs
    - plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
    - plugins/aoforge/hooks/changelog-on-tag.test.js
  deleted:
    - plugins/devflow/ (45 files)
    - scripts/gen-pointer-skills.cjs
    - scripts/gen-pointer-skills.legacy.test.cjs
    - scripts/__fixtures__/legacy-pointer-fixtures.cjs
decisions:
  - "doc-refs NAMESPACE_RENAMES and the dash form: REMOVE. TRD 72-13 declared them one-release; with the pointer release gone an old command form no longer runs anywhere, and 0007's rewrite of them is an automatic conversion of pre-rename text that 3.1 leaves to 3.0.x. The rename guard still fails on any legacy name outside its ALLOW list. DEPRECATION_MAP/REMOVED_COMMANDS stay."
  - "LEGACY_AGENT_EXEMPT and the 44-08 agent-path gate in doc-refs.repo.test.cjs: KEEP. They concern pre-plugin agent locations, not the 3.0 rename."
  - "coexistence.cjs keeps its pointer-version handling (78-06 owns it): installed copies of the pointer release stay on users' machines after it leaves the marketplace."
  - "resolveToken keeps its (prefix, name) signature and returns ok for any prefix other than the AOForge namespace, so a legacy form is never classified, even when called directly."
  - "changelog-on-tag: a tree from before the objective 72 rename has no AOForge manifest, so its version-sync check is skipped like any repo without the three manifests (case 17 now expects pass-through)."
metrics:
  duration: "about 17 minutes wall clock (2026-10-16T23:16Z to 23:33Z), about 5 of them a full-suite run"
  completed: 2026-10-16
  tasks: 3
  files: 64
tokens_input: 28683711
tokens_output: 110241
tokens_cache_read: 28358293
tokens_cache_write: 325180
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 78 TRD 02: Old commands and pointer plugin Summary

One-liner: the pre-rename pointer plugin (45 files), its marketplace entry, generator, fixture, test glob and four rename-guard ALLOW entries are deleted, doc-refs reads only `/aoforge:<name>` (no `NAMESPACE_RENAMES`, no dash form), migration 0007 now leaves pre-rename command text alone, and the tag gate reads one plugin manifest.

## Progress
- [x] Task 1: RED — repo contract for the removal — 0842a2db
- [x] Task 2: GREEN — delete the pointer release and its entries — 4d37a235
- [x] Task 3: GREEN — doc-refs reads the AOForge namespace only — f37046bb

## What changed

- **Pointer release removed (Task 2).** `git rm -r plugins/devflow` (34 SKILL.md, hooks.json, pointer-notice.js and its legacy test, README.md, `.claude-plugin/plugin.json`), `scripts/gen-pointer-skills.cjs`, `scripts/gen-pointer-skills.legacy.test.cjs`, `scripts/__fixtures__/legacy-pointer-fixtures.cjs`. The marketplace keeps its other six entries and formatting; `scripts.test` drops `'plugins/devflow/**/*.test.js'`.
- **Rename guard.** The four pointer ALLOW entries (plugin directory, generator, the span-scoped marketplace and package.json entries) are gone; test 4 (no dead entry) passes. Tests 9a-9c now pass a synthetic span-scoped entry (`fixture.json`, spans built from LEGACY) to `scanFile`/`maskAllowedSpans`, and 9a also checks in a scratch git repo that a span-scoped file stays in the scan set and only line 6 is a finding. 9a asserts ALLOW itself holds no span entry.
- **Tag gate.** `changelog-on-tag.js` has `PLUGIN_MANIFEST = plugins/aoforge/.claude-plugin/plugin.json` (exported), no LEGACY import and no fallback loop. The `aliasLegacyEnv` line is untouched (78-10).
- **doc-refs (Task 3).** `NAMESPACES = [NAMES.slug]`; DASH_NS/DASH_RE, `_bundledSkillsDir`, `defaultLiveSkills`, `_isKnownCommand` and the `prefix` kind are gone; `resolveToken` returns `ok` for any non-AOForge prefix and otherwise keeps removed -> renamed -> unknown -> ok; `rewriteText` rewrites `renamed` only. No LEGACY or NAMESPACE_RENAMES import.
- **skill-route.** `NAMESPACE_RENAMES` (definition, export, comments) and the now-unused legacy-names import are removed; the EX export-lock lists drop it (10 exports).
- **doc-refs repo gate.** The pointer EXEMPT entry and test 17 are removed; test 18 drops the pointer; test 15 becomes "a legacy form is not a command reference: zero findings" with a current-namespace control; test 7's sample drops its legacy token; the `**/legacy-names.cjs` EXEMPT entry (72-13, needed only while the legacy forms were read) is removed. `LEGACY_AGENT_EXEMPT` and tests 11-14 are untouched.

## Decisions Made

| Decision | Reason |
|---|---|
| doc-refs `NAMESPACE_RENAMES` and the dash form: **REMOVE** | TRD 72-13 declared them one-release ("removed with the other one-release shims in the release after 3.0.0"); with the pointer release gone an old command form no longer runs anywhere, and migration 0007's rewrite of them is an automatic conversion of pre-rename text, which 3.1 leaves to 3.0.x. The rename guard still fails on any legacy name outside its ALLOW list, so no stale form can return unnoticed. DEPRECATION_MAP/REMOVED_COMMANDS (objective 38) stay. |
| `LEGACY_AGENT_EXEMPT` / the 44-08 agent-path gate in doc-refs.repo.test.cjs: **KEEP** | It is about pre-plugin agent locations, not the 3.0 rename. |
| coexistence.cjs keeps its pointer-version handling (78-06 owns it) | Installed copies of the pointer release stay on users' machines after it leaves the marketplace, so the notice still distinguishes them. |
| `resolveToken(prefix, name)` keeps its signature; a non-AOForge prefix is `ok` | Smallest change for callers; a direct call can never classify a legacy form. |
| A pre-rename tree is not version-gated by the tag hook | It has no AOForge manifest, the same as any repo without the three manifests; case 17 (556f8d3) now expects pass-through. |

## Deleted paths

- `plugins/devflow/` — 45 tracked files: `.claude-plugin/plugin.json`, `README.md`, `hooks/hooks.json`, `hooks/pointer-notice.js`, `hooks/pointer-notice.legacy.test.js`, and `skills/<name>/SKILL.md` for adopt, awareness, build, cleanup, debug, decide, design-review, discuss-objective, doctor, execute-objective, flow, gh-sync, handoff, help, initiatives, list-objective-assumptions, map-codebase, micro, milestone, new-project, objective, plan-objective, quick, research-objective, security-audit, set-profile, settings, status, sync-roadmap, todo, tui, ui-eval, verify-work, workstreams
- `scripts/gen-pointer-skills.cjs`
- `scripts/gen-pointer-skills.legacy.test.cjs`
- `scripts/__fixtures__/legacy-pointer-fixtures.cjs`
- The marketplace entry named and sourced as the legacy plugin, and the `'plugins/devflow/**/*.test.js'` glob in package.json `scripts.test`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] doc-refs.repo.test.cjs pointer pieces moved from Task 3 to Task 2**
- **Found during:** Task 2
- **Issue:** The TRD put the pointer EXEMPT entry, test 17 and test 18's pointer check in Task 3, but deleting `plugins/devflow/` in Task 2 makes them fail (test 3: EXEMPT matches no path; 17/18: pointer must have files). The same rule as the rename guard's ALLOW (a dead entry must go in the same commit as the files) applies.
- **Fix:** Removed them in the Task 2 commit; Task 3 removed the rest (legacy-names entry, header, test 7).
- **Commit:** 4d37a235

**2. [Rule 3 - Blocking] test 15 rework moved into the RED commit**
- **Found during:** Task 1
- **Issue:** Trimming `legacy-command-fixtures.cjs` removed the `sensitivity`/`dashMix` strings test 15 read, so test 15 had to be rewritten with the fixture.
- **Fix:** Test 15 was rewritten to the new behaviour (zero findings for legacy forms) in the RED commit, where it failed for the right reason.
- **Commit:** 0842a2db

**3. [Rule 3 - Blocking] two tests outside files_modified switched off `/df:` samples**
- **Found during:** Task 3
- **Issue:** `migrations/0007-doc-refs-fix.test.cjs` (cases 3, 4, 5, 7, 10, 11, 12, 13) and `doc-staleness.test.cjs` (case 17) used `/df:` commands as their stale input; with the legacy forms no longer read, 0007 would not apply and case 17 became vacuous. Both are in the TRD's Task 3 verify command, and the error_recovery allows the doc-staleness switch.
- **Fix:** `/df:plan-objective` -> `/aoforge:add-objective` (renamed to `/aoforge:objective add`), `/df:health` -> `/aoforge:health`; the assertions follow. Behaviour under test is unchanged.
- **Commit:** f37046bb

**4. [Rule 1 - Bug] doc-refs.repo.test.cjs test 6 lost its fixture sample**
- **Found during:** Task 3
- **Issue:** Test 6 proves the `__fixtures__/**` EXEMPT does real work by scanning `intent-fixtures.cjs`, whose only findings were `/df:` forms; after the change it has none, so the test failed.
- **Fix:** Test 6 scans `legacy-command-fixtures.cjs` instead (its control line holds renamed and removed `/aoforge:` commands: 4 findings); the EXEMPT reason names both fixtures.
- **Commit:** f37046bb

**5. [Rule 2 - Missing] `**/legacy-names.cjs` doc-refs EXEMPT entry removed**
- **Found during:** Task 3
- **Issue:** TRD 72-13 added it only because doc-refs read the legacy command forms that module spells; with them gone it exempts nothing (a dead exemption is a bug by this gate's own rule).
- **Fix:** Removed with a comment saying why.
- **Commit:** f37046bb

## Follow-ups for later TRDs (not done here: outside this TRD's files)

- `migrations/0007-doc-refs-fix.cjs` comments still say it rewrites "bare /df: prefixes" (line 5) and counts "renamed/prefix tokens" (line 54). 78-08 owns that file.
- `CLAUDE.md` (Marketplace section: the pointer plugin and `gen-pointer-skills`), `docs/USER-GUIDE.md:103` (`gen-pointer-skills --write`), and the `.aoforge/STACK.md` Layout section (still names the pre-rename plugin directory and CLI) are stale. 78-12 owns the docs.
- `scripts/gen-docs-data.cjs` describes the coexistence guard's softer notice for "a pointer release" (78-06 owns coexistence).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED contract | `node --test old-commands.legacy.test.cjs doc-refs.legacy.test.cjs migrations/0007-doc-refs-fix.legacy.test.cjs` (+ doc-refs.repo test 15) | 1 | RED as required: 12/13 fail (pointer present, legacy forms read, NAMESPACE_RENAMES exported; 1e version agreement passes as a guard), test 15 fails |
| 2: delete the pointer release | `node --test old-commands.legacy.test.cjs rename-guard.repo.test.cjs hooks/changelog-on-tag.test.js scripts/ci-unit-gate.test.cjs` | 0 | PASS 139/139 after Task 3 (at the Task 2 commit only case 2, Task 3's skill-route export, failed); `test -d plugins/devflow` fails; `rg -i pointer` on marketplace.json/package.json finds nothing |
| 3: doc-refs one namespace | `node --test doc-refs.legacy doc-refs doc-refs.repo skill-route migrations/0007-doc-refs-fix(.legacy) doc-staleness` | 0 | PASS 160/160; `rg "NAMESPACE_RENAMES\|DASH_RE\|commandDash\|commandNsShort"` in lib (excluding legacy-names, *.legacy.test.*, __fixtures__) finds only stack-ci.cjs's unrelated YAML `DASH_RE` |
| TRD verification | `node --test rename-guard.repo.test.cjs doc-refs.repo.test.cjs scripts/*.test.cjs` | 0 | PASS 292/292; `git ls-files plugins/devflow scripts/gen-pointer-skills.cjs` prints nothing |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test old-commands.legacy.test.cjs doc-refs.legacy.test.cjs 0007-doc-refs-fix.legacy.test.cjs` | 1 | FAIL (correct): 12 of 13 fail for the right reason |
| RED | `node --test --test-name-pattern="15:" doc-refs.repo.test.cjs` | 1 | FAIL (correct): legacy line yields 6 findings |
| RED | `node --test --test-name-pattern="case 17" hooks/changelog-on-tag.test.js` | 1 | FAIL (correct): legacy manifest read, PLUGIN_MANIFEST undefined |
| GREEN (Task 2) | `node --test old-commands.legacy rename-guard.repo changelog-on-tag ci-unit-gate` | 1 | only case 2 (Task 3's) fails |
| GREEN (Task 3) | the Task 3 verify set | 0 | PASS 160/160 |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | the three verify sets above | 0 | PASS |
| test (full) | `npm test` file set minus `plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs` (392 files, scratch HOME, via a scratchpad runner using scripts/ci-unit-gate.cjs's glob resolver) | 1 | PASS for this TRD: 12441 tests, 12385 pass, 16 fail, 40 skipped; every failure is pre-existing or load-related (below) |

**Full-suite failures, all unrelated:** 11 fail identically at the wave base 268a7a47 (run on a `git archive` extract with the same scratch-HOME runner): handoff-e2e.test.cjs (6, daemon never writes its PID file), project-state.test.cjs cases 23 and 29 and classify-session.test.js S3 (brownfield git history under a scratch HOME), requirements-agreement.repo.test.cjs 11 and validate-requirements.test.cjs 9 (objective 75's EST-11 agreement). aoforge-watch.test.cjs had 5 failures in the full run; run alone it has the same 2 failures as the base (the other 3 were 3-second timeouts under full-suite load).

**Excluded:** `plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs` (its W-3 fish-shell test hangs to timeout on this machine), per the dispatch.

## Post-TRD Verification

- Auto-fix cycles used: 1 (test 6's fixture sample)
- Must-haves verified: 6/6 (pointer gone and marketplace/package.json/generator clean; no pointer ALLOW entry, test 4 passes, span mechanism tested with a synthetic entry; no NAMESPACE_RENAMES, doc-refs reads `/aoforge:` only with DEPRECATION_MAP/REMOVED_COMMANDS unchanged; 0007 leaves pre-rename forms untouched and still rewrites renamed `/aoforge:` commands; changelog-on-tag reads only the AOForge manifest; versions agree at 3.0.0, no bump)
- Gate failures: None from this TRD (pre-existing failures listed above)

## Self-Check: PASSED

- FOUND: plugins/aoforge/aoforge/bin/lib/old-commands.legacy.test.cjs
- FOUND: plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-command-fixtures.cjs (trimmed, still imported)
- GONE: plugins/devflow/, scripts/gen-pointer-skills.cjs, scripts/gen-pointer-skills.legacy.test.cjs, scripts/__fixtures__/legacy-pointer-fixtures.cjs (git ls-files prints nothing)
- FOUND commits: 0842a2db, 4d37a235, f37046bb
