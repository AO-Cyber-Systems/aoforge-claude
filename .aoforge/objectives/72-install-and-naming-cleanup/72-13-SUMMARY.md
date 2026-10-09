---
objective: 72-install-and-naming-cleanup
trd: "13"
subsystem: doc-refs
tags: [rename, inst-01, inst-04, doc-refs, repo-gate, migration-0007, legacy-command-forms]
requires: ["72-02 legacy-names (LEGACY.commandNs/commandNsShort/commandDash)", "72-06 rename guard", "72-14 pointer plugin under plugins/<legacy>/"]
provides:
  - "skill-route.cjs NAMESPACE_RENAMES: the legacy slash namespaces (keys from LEGACY) mapped to aoforge, beside DEPRECATION_MAP and REMOVED_COMMANDS as the single rename source"
  - "doc-refs reads the colon form of every namespace (current + NAMESPACE_RENAMES) and the legacy short namespace's dash form, which counts only for a known command"
  - "the doc-refs repo gate fails on any legacy command form in its scan set and in the sibling plugins; EXEMPT names the pointer plugin and legacy-names.cjs explicitly"
  - "migration 0007 fixes the legacy forms in a project's CLAUDE.md managed block and STATE.md outside the Session Log (no 0007 code change)"
affects: [72-15, 72-17, 72-21, 72-22, 72-25]
tech-stack:
  added: []
  patterns:
    - "one rename source: a namespace map beside the command maps; every resolver input built from LEGACY/NAMES"
    - "a dash-form token is filtered against known command names before it becomes a finding, so paths and file names never match"
key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-command-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/doc-refs.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0007-doc-refs-fix.legacy.test.cjs
  modified:
    - plugins/aoforge/aoforge/bin/lib/skill-route.cjs
    - plugins/aoforge/aoforge/bin/lib/doc-refs.cjs
    - plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs
    - plugins/aoforge/aoforge/bin/lib/doc-refs.test.cjs
    - plugins/aoforge/aoforge/bin/lib/skill-route.test.cjs
key-decisions:
  - "The dash form's known commands are the live skills (liveSkills when the caller passes it; otherwise the bundled plugin's skills directory, found by the aoforge plugin.json three levels above lib/), DEPRECATION_MAP keys and REMOVED_COMMANDS. Run from the home mirror there is no manifest, so only renamed and removed commands are known there. That errs toward no rewrite, never a wrong one."
  - "rewriteText gained an optional { liveSkills } argument used only as the dash form's known set; migration 0007's call is unchanged."
  - "A legacy colon form of an unknown name resolves to prefix (e.g. /aoforge:nope), as /df: always did; the next scan reports the replacement as unknown."
  - "The sibling-plugin scan fails on prefix, renamed and removed findings (stricter than the TRD's prefix/renamed): a legacy removed command (/<legacy>:update) is a legacy form too. Unknown is ignored there."
metrics:
  duration: 39min
  completed: 2026-10-09
tokens_input: 17791936
tokens_output: 84976
tokens_cache_read: 17089874
tokens_cache_write: 701872
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 13: Legacy command forms gate Summary

**One `NAMESPACE_RENAMES` map in skill-route.cjs teaches doc-refs the `/devflow:`, `/df:` and `/df-<command>` forms. The repo gate now fails on all of them, in the AOForge text and in the sibling plugins, and migration 0007 rewrites them in projects with no code change.**

## Progress
- [x] Task 1: Fixture builder: legacy command text and a project with a legacy block — e9b78da1
- [x] Task 2: NAMESPACE_RENAMES and doc-refs legacy forms — 016de606 (RED), f3c0670c (GREEN)
- [x] Task 3: The repo gate over legacy forms, including the sibling plugins — 19d2ed31

## What was built

- **`NAMESPACE_RENAMES`** (skill-route.cjs, frozen): `{ [LEGACY.slug]: NAMES.slug, [LEGACY.commandNsShort.slice(1,-1)]: NAMES.slug }`, so `devflow` and `df` both map to `aoforge`. The header comment now names it as part of the single rename source. The export-lock tests EX1/EX3/EX4/EX5 list it (11 exports).
- **doc-refs.cjs**:
  - `NAMESPACES = [NAMES.slug, ...keys(NAMESPACE_RENAMES)]`. `TOKEN_RE` is built from them, with the same lookbehind as before.
  - `DASH_RE` matches `/df-<name>` with the slash not after an identifier character, `.`, `/` or `~`. A dash token counts only when `<name>` is a known command.
  - `resolveToken` keeps its precedence: removed -> renamed -> prefix (any NAMESPACE_RENAMES key) -> unknown -> ok. Replacements come from `NAMES.commandNs`.
  - `scanText` and `rewriteText` walk one merged, ordered token stream (`_tokens`).
  - No namespace literal remains in the module (test 6b).
- **Repo gate** (doc-refs.repo.test.cjs, items 15-18):
  - 15: the legacy sensitivity sample gives kinds `[prefix, renamed, removed, unknown, prefix]` with their replacements. The dash sample gives one finding.
  - 16: the sibling plugins (eden-ui-*, monorepo-standards, aosentry-mcp, social-media-generator, minus EXEMPT) produce no prefix, renamed or removed finding. The scan covers every sibling.
  - 17: EXEMPT names `plugins/<LEGACY.slug>/**` and `**/legacy-names.cjs` explicitly. Every legacy fixture in the raw scan set is already exempt.
  - 18: the raw scan set has no path under `.aoforge/`, the legacy planning directory or the pointer plugin, and the "Not scanned by design" comment names both planning directories.
- **0007**: no code change. Tests 10/10b run `upgrade.apply --only 0007` on both layouts:
  - the block's `/devflow:quick` becomes `/aoforge:quick` and `/devflow:progress` becomes `/aoforge:status`;
  - `/devflow:update` stays and is listed in `removed_left`;
  - prose outside the block stays byte-identical;
  - `/df:quick` above the Session Log is rewritten, and the log line stays byte-identical, with 0007's one note appended;
  - `changed_files` lists CLAUDE.md and the STATE.md path;
  - a second detect is false.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixture builder | TRD `node -e "…legacyCommandProject()…existsSync(p.root+'/CLAUDE.md')…cleanup()"` (prints `true`), plus a shape check: `.aoforge/STATE.md` and `.planning/STATE.md` for the two layouts, the rendered AOFORGE block, the cleanup removing the tree | 0 | PASS |
| 2: resolver + 0007 | `node --test doc-refs.legacy.test.cjs doc-refs.test.cjs skill-route.test.cjs migrations/0007-doc-refs-fix.legacy.test.cjs migrations/0007-doc-refs-fix.test.cjs` (+ doc-refs.repo, rename-guard.repo, regex-escape.repo, doc-staleness, help) | 0 (199/199) | PASS |
| 3: repo gate | `node --test doc-refs.repo.test.cjs` (+ rename-guard.repo) | 0 (35/35; doc-refs.repo 18/18) | PASS |
| verification | `printf '/devflow:quick\n' > <scratch>/x.md`, then `scanText` through `node -e` | 0: `[{"line":1,"col":1,"token":"quick","kind":"prefix","replacement":"/aoforge:quick"}]` | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2) | `node --test doc-refs.legacy.test.cjs migrations/0007-doc-refs-fix.legacy.test.cjs` | 1 (12 tests: 10 fail; 2 and 3 pass, because resolveToken already ranked removed/renamed above the namespace) | FAIL (correct) |
| GREEN (Task 2) | same + doc-refs, skill-route, 0007 and the repo gates | 0 (12/12, then 199/199) | PASS (correct) |
| RED (Task 3) | `node --test doc-refs.repo.test.cjs` with items 15-18 | 1 (18 tests: 17 and 18 fail; 15 and 16 pass because the Task 2 resolver is in and the siblings are clean) | FAIL (correct) |
| GREEN (Task 3) | same + rename-guard.repo | 0 (35/35) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test '<wt>/plugins/aoforge/**/!(micro).test.cjs' '<wt>/plugins/aoforge/**/*.test.js' '<wt>/scripts/**/*.test.cjs'` (absolute globs into the worktree, spec reporter to a scratch file) | 1: 11,871 tests, 11,809 pass, 51 skipped, 11 fail = 10 node-pty daemon tests (aoforge-watch 4, handoff-e2e 6; no node_modules in a worktree) + merge-driver-cli test 339 (ENOTEMPTY temp-dir cleanup under load; the file alone is 13/13) | PASS (baseline + flake) |

E2E1 (roadmap drift) did not fail. `npm test` was not run, because it includes `micro.test.cjs`, which is excluded per the dispatch.

## Discovered commands

None. The test command came from the TRD's validation gate. The stack profile resolves to `General` only.

## Estimate

`estimate trd 72-13`: 10 min (P90 19 min), $4.33 (P90 $6.93), 3 tasks, confidence low. `estimate start` was not re-run, because the wave-8 run state was already recorded. Measured: 39 min (02:14:58Z to 02:54:17Z), over P90. Reading the hand-offs of nine SUMMARYs and the full suite (about 4 min) took most of the overrun. The design of the dash form's known-command default also took time, because the TRD's rewrite test needs it without a liveSkills argument.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] skill-route.cjs export lock**
- **Found during:** Task 2
- **Issue:** `skill-route.test.cjs` EX1/EX3/EX4/EX5 pin the exact export list ("DO NOT MODIFY without updating the EX export-lock tests atomically").
- **Fix:**
  - `NAMESPACE_RENAMES` was added to the three sorted lists, and EX3's count went from 10 to 11.
  - The LOCKED banner names TRD 72-13.
- **Files modified:** plugins/aoforge/aoforge/bin/lib/skill-route.test.cjs (not in files_modified)
- **Commit:** f3c0670c

**2. [Rule 3 - Blocking] doc-refs.test.cjs RE1 pins TOKEN_RE's source**
- **Found during:** Task 2
- **Fix:** the expected source now includes the legacy namespace, built from `LEGACY.slug`. That file is under the rename guard and may not spell the legacy name.
- **Files modified:** plugins/aoforge/aoforge/bin/lib/doc-refs.test.cjs (not in files_modified)
- **Commit:** f3c0670c

### Choices the TRD left open, or where it was inexact

- **The dash form needs a known-command set even when no liveSkills is passed.** Test 5's `rewriteText` (the 0007 call) gets no options. Without a default, either `/df-quick` is never rewritten or every `/df-*` path becomes a finding.
  - The default is the bundled plugin's skills: the directory beside the `plugin.json` whose name is `aoforge`, three levels above lib/. This holds in the source tree and in the plugin cache. The SessionStart upgrade hook runs the bundled `upgrade.cjs`, so 0007 normally has it.
  - The home mirror has no such manifest. Run from there (`node ~/.claude/aoforge/bin/aof-tools.cjs upgrade`), only renamed and removed dash forms are rewritten. The next hook run fixes the rest.
- **"Not scanned by design" comment (test 18).** The TRD asks for the legacy planning directory as a literal glob, but the rename guard (72-06, `planningDir` token) flags it in a non-legacy file. The comment names it as "the legacy planning directory it replaces (LEGACY.planningDir…)", and the test asserts that wording beside `.aoforge/**`.
- **`**/__fixtures__/legacy-*` EXEMPT entry: not added.** Every legacy fixture in the raw scan set is under `plugins/aoforge/aoforge/bin/lib/__fixtures__/**`, which is already exempt. Test 17 asserts this, so a legacy fixture placed elsewhere in the scan set fails the test rather than slipping through. `**/legacy-names.cjs` is in the effective scan set and got its entry.
- **The pointer plugin entry guards future text.** `plugins/<legacy>/` is outside SCAN_INCLUDE (test 18), and its current text writes `/<legacy>:<name>` and a bare `/<legacy>:`, which the resolver matches neither of. The entry is there because the TRD wants the exemption explicit. Test 3 keeps it live, since it matches real files.
- **The sibling scan fails on `removed` too.** The TRD says prefix/renamed. A legacy `/<legacy>:update` resolves to removed, so it is included.
- **Tests beyond the list:**
  - 4b: liveSkills as the dash form's known set.
  - 4c: path negatives and positives.
  - 4d: line/col for both colon namespaces.
  - 6b: single source; no namespace literal in doc-refs.cjs.
  - 10b: the legacy planning layout.
  - Test 10 also calls the migration directly, to check `removed_left`.
- **Removed command in test 10.** Truth 4's "leaves a removed command as written" is covered by `/devflow:update` inside the block.

## Hand-off

- **Carried from 72-10/72-12 (out of scope here, not changed).** None of these is a documented command form, and none of their files is in this TRD's list.
  - `hooks/lib/edit-override.js` OVERRIDE_PHRASES still honours only the new override phrases. Whether the live gate should accept the old phrase for one release is still open: a hooks decision for 72-15/72-17, or a follow-up.
  - `lib/skill-requires.cjs` `PLUGIN_PREFIX = 'aoforge:'`. No gap in practice: a typed legacy command reaches the pointer plugin's skill, which declares no `requires:`. That skill forwards with the Skill tool as `aoforge:<name>`, which the PreToolUse(Skill) gate checks under the current prefix.
  - `init.cjs normalizeAgentKey` strips only the short install prefix. No caller passes a namespaced agent type.
- **72-21 / 72-22 (this repository's dogfood).**
  - This repo's STATE.md has 7 legacy colon forms outside its Session Log (lines 32, 140, 161, 197, 204, 252, 254). Its CLAUDE.md block has none.
  - On the first AOForge session, 0007 rewrites those 7 forms, including history rows (quick-task table, TRD completion notes), and appends one Session Log note. If 72-22 wants those rows kept as history, it should know this first.
  - `validate docs` (doc-staleness) reports W050 only for a removed command. Renamed and prefix findings are not W050.
- **72-17 (docs).** Two things are undocumented:
  - the legacy forms the gate and 0007 now handle;
  - the mirror caveat for the dash form (see the choices above).
- **72-25 (fleet sweep).** The SessionStart upgrade applies 0007 automatically. A project's legacy command forms in the CLAUDE.md block and in STATE.md above the log are fixed on the first AOForge session. Hand-written CLAUDE.md text outside the block keeps its wording.
- **Shim removal (the release after 3.0.0).**
  - Remove `NAMESPACE_RENAMES` and `DASH_RE`/`DASH_NS` together. The gate's EXEMPT entry for the pointer plugin goes with `plugins/<legacy>/`, and test 3 reports it dead once the directory is gone.
  - Keeping NAMESPACE_RENAMES longer is harmless. It is what lets 0007 keep fixing old projects.
- `.claude-plugin/marketplace.json` is not in the doc-refs scan set. Its pointer description is masked by the rename guard's span ALLOW (72-14), and it spells no command token.
- No AOForge skill name, description or argument-hint changed, so `gen-pointer-skills` was not needed.

## Post-TRD Verification

- Auto-fix cycles used: 0. Each GREEN run passed on its first run after implementation.
- Must-haves verified: 4/4
  - NAMESPACE_RENAMES, derived from LEGACY, is the third map beside DEPRECATION_MAP and REMOVED_COMMANDS, and doc-refs declares none of its own (tests 6, 6b).
  - The colon forms resolve as prefix or renamed, and the dash form only for a known command (tests 1-5, 4b-4d).
  - The repo gate fails on legacy forms in its scan set and in the sibling plugins, with the pointer plugin exempt explicitly. The scan set holds nothing under either planning directory or the pointer plugin, and the gate is green on the tree (tests 2, 15-18).
  - 0007 rewrites the block and pre-log STATE.md and leaves the removed command alone (tests 10, 10b).
- Gate failures: None beyond the documented baseline (node-pty daemon tests) and one load-timing flake that passes alone.

## Self-Check: PASSED

- FOUND: plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-command-fixtures.cjs, plugins/aoforge/aoforge/bin/lib/doc-refs.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0007-doc-refs-fix.legacy.test.cjs
- FOUND: e9b78da1, 016de606, f3c0670c, 19d2ed31 on `df/exec-72-13-legacy-command-forms-gate` (`git log --oneline 2982fa74..HEAD`)
- The worktree was clean after 19d2ed31. The repo gates (doc-refs, rename-guard, regex-escape) pass on the committed tree. No real `~/.claude`, `~/.aoforge` or `~/.devflow` path was used: every home in the tests is a temp dir.
