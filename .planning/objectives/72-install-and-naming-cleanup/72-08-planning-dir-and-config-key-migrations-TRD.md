---
objective: 72-install-and-naming-cleanup
trd: "08"
type: standard
wave: 5
depends_on: ["72-06"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-migration-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0013-config-key-rename.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0013-config-key-rename.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0010-store-gitignore.cjs
  - plugins/aoforge/aoforge/bin/lib/upgrade.cjs
  - plugins/aoforge/aoforge/bin/lib/validate.cjs
  - plugins/aoforge/hooks/upgrade-project.js
  - plugins/aoforge/hooks/upgrade-project.legacy.test.js
autonomous: true
requirements: [INST-03, INST-04]
must_haves:
  truths:
    - "Migration 0012 (auto) in a clean git repo with only `.planning/` backs the tree up, runs `git mv .planning .aoforge` (untracked and ignored files inside move with it), adds the `.aoforge/` counterpart beside each legacy ignore line in `.gitignore` and `.git/info/exclude`, and reports `changed_files` = the two directories plus any ignore file it changed"
    - "0012 never runs on a tracked-dirty tree, during a merge, rebase, cherry-pick, revert or bisect, or when `.aoforge/` already exists: apply returns `deferred: <reason>` and writes nothing; outside git it renames the directory with fs"
    - "In store mode (planning cache gitignored by 0010) 0012 moves tracked files with git mv and the rest with the directory, and the 0010 ignore block is rewritten with AOForge markers covering both directory names, so the moved cache stays ignored; an existing legacy-marker 0010 block is recognised, never duplicated"
    - "Migration 0013 (auto) renames config.json's `devflow` stamp object to `aoforge` (merging when both exist; `aoforge` wins), and the runner reads either key (aoforge first) and writes only `aoforge`"
    - "The runner resolves the planning directory per migration, so 0013 and later migrations and the final stamp write land in `.aoforge/` after 0012 moved it"
    - "upgrade-project.js leaves its version fast path whenever the project still uses the legacy layout, commits a completed 0012 move in ONE background commit whose name-status is renames plus the ignore file(s), and on a deferred move writes a notice naming the reason and `aof-tools upgrade --apply --only 0012`"
    - "`validate health` reports W067 `legacy-config-key` when config.json carries only the legacy stamp key, fix `aof-tools upgrade --apply --only 0013`"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs
      provides: "auto migration: legacy planning dir -> .aoforge via git mv"
      exports: ["id", "title", "since", "safety", "detect", "apply"]
    - path: plugins/aoforge/aoforge/bin/lib/migrations/0013-config-key-rename.cjs
      provides: "auto migration: config devflow{} -> aoforge{}"
      exports: ["id", "title", "since", "safety", "detect", "apply"]
    - path: plugins/aoforge/hooks/upgrade-project.legacy.test.js
      provides: "SessionStart end to end on a legacy project: one rename commit; dirty and mid-merge deferral"
  key_links:
    - from: "hooks/upgrade-project.js commit child"
      to: "aof-tools commit --files .planning .aoforge .gitignore"
      via: "changed_files from 0012"
      pattern: "commit"
    - from: "upgrade.cjs readStamp"
      to: "config.json aoforge|devflow"
      via: "NAMES.configKey first, LEGACY.configKey second"
      pattern: "configKey"
---

# TRD 72-08: Projects move themselves: `.planning/` -> `.aoforge/` and `devflow{}` -> `aoforge{}`

<objective>
Add the two auto migrations INST-04 locks: 0012 moves a legacy planning directory to `.aoforge/` with `git mv` (history
follows), and 0013 renames the config stamp key. Make the upgrade runner re-resolve the directory after each migration
and read either stamp key, and make the SessionStart upgrade hook leave its fast path for a legacy project, commit the
move as one rename commit, and defer (with a notice) on a dirty or mid-operation tree.

Purpose: INST-04 (in-place migration) and INST-03 (readers accept the legacy key; W067 names the fix).
Output: migrations 0012 and 0013, runner and hook changes, 0010 legacy block recognition, W067.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-CONTEXT.md

Project kind `plugin`, work `feature`: TDD strict, test list first, hand-built fixtures, one test at a time.

Read narrowly: `upgrade.cjs` 1-20 (migration contract), 60-80 (registry), 131-185 (stamp), 300-360 (detect/apply
loop), 460-490 (stamp write); `migrations/0008-runtime-state-untrack.cjs` (an auto migration with git work and a
`changed_files` report: the model); `migrations/0010-store-gitignore.cjs` 60-175 (block markers, `readBlock`,
`upsertBlock`, `blockLines`); `hooks/upgrade-project.js` 1-60 (contract), 177-270 (`gitState`, `ensureExcluded`,
`skipReason`), 276-390 (`main`), 410-459 (`commitChild`); `validate.cjs` Check 21 (72-05) for placement.

Today the 0010 block markers are `# >>> <slug> store (0010) >>>` / `# <<< <slug> store (0010) <<<`; after 72-04 the
code writes the AOForge slug, so a user repo's existing block (legacy slug) is no longer recognised. Fix that here.
</context>

## Test list

**hooks/upgrade-project.legacy.test.js** (outermost; spawn the hook with CLAUDE_PLUGIN_ROOT = repo plugin, fake HOME,
cwd = fixture; wait for the detached commit child with a bounded poll)
1. Clean legacy git project with `devflow{version:"2.15.0"}` stamp: after the hook, `.aoforge/` exists, `.planning/`
   does not, `git log -1 --name-status` shows only `R100` lines for planning files plus `M .gitignore` (if changed),
   `git status --porcelain` is empty, config.json under `.aoforge/` has `aoforge.version` = bundled version and no
   `devflow` key.
2. Tracked-dirty legacy project (STATE.md modified): no move, no commit; `.aoforge/.aoforge-notices.json` is not
   created, the notice lands in `.planning/` and names "dirty" and `aof-tools upgrade --apply --only 0012`.
3. Mid-merge legacy project (`MERGE_HEAD` present): deferred with reason `merge`.
4. Second session after case 1: fast path (no migration, no commit).
5. Second session after case 2 with the tree now clean: the move happens (the legacy layout kept it off the fast path).

**0012 (in-process, ctx from the fixture)**
6. detect: legacy only -> applies; `.aoforge` only -> not; both -> not, reason names W066; not a git repo -> applies.
7. apply on a clean repo: backup dir exists and contains the old tree; `.planning/.skill-active` (untracked, excluded)
   ends up at `.aoforge/.skill-active`; `.gitignore` legacy line kept and AOForge line added after it;
   `.git/info/exclude` likewise; `changed_files` = `['.aoforge', '.gitignore', '.planning']` (sorted, existing ones).
8. apply outside git: fs rename; `changed_files` names the two dirs.
9. Store mode fixture (0010 legacy-marker block, cache untracked, config.json and STACK.md tracked): after apply the
   cache is under `.aoforge/` and still ignored (`git check-ignore`), the block has AOForge markers and both directory
   names, and there is exactly one 0010 block.

**0013 and the runner**
10. 0013 detect/apply: `{devflow:{version:'2.15.0',migrations_applied:['0001']}}` -> `{aoforge:{...same}}`; both keys ->
    merged with aoforge values winning; no legacy key -> not applicable. Other config keys keep their order.
11. `readStamp` with only `devflow` -> that stamp; with both -> `aoforge`.
12. `runUpgrade` on a legacy project applies 0012 then 0013 and writes the final stamp to `.aoforge/config.json`.
13. `validate health` on a project whose config has only the legacy key -> W067 with the 0013 fix; after 0013 -> none.

<embedded_context>

<codebase_examples>
Migration module contract (upgrade.cjs header):
```js
// { id, title, since, safety: 'auto'|'confirm', detect(ctx) -> {applies, reason},
//   apply(ctx) -> { changed_files, ... } }
```
Directory test and names come from compat / legacy-names, never literals:
```js
const { NAMES, LEGACY } = require('../legacy-names.cjs');
const compat = require('../compat.cjs');
const legacyDir = path.join(ctx.root, LEGACY.planningDir);
```
Busy-state detection already exists in the hook (`BUSY_MARKERS`: rebase-merge, rebase-apply, MERGE_HEAD, CHERRY_PICK_HEAD,
REVERT_HEAD, BISECT_LOG in the per-worktree git dir); reuse the same list inside 0012 (move it to a shared lib if the
migration cannot import the hook).
</codebase_examples>

<anti_patterns>
- Never `git add -A` or commit inside a migration; the hook's child commits `changed_files` through `aof-tools commit`.
- Never delete the legacy ignore lines in a user project (one-release fallback, and other branches may still have the
  legacy directory).
- Do not treat untracked files as "dirty" for 0012's guard: untracked files inside the directory move with it; untracked
  files elsewhere are not touched. The guard is staged or unstaged changes to tracked files.
- Do not cache the planning directory in the runner across migrations.
- Legacy names come from LEGACY (the guard enforces it); spelled legacy text only in the fixture and `*.legacy.test.*`.
</anti_patterns>

<error_recovery>
- If `git mv .planning .aoforge` leaves untracked files behind on some git version, move the remaining entries with
  `fs.renameSync` per entry after it and say so in a code comment; test 7 pins the outcome, not the mechanism.
- If `aof-tools commit --files <dir>` refuses directories or loses the rename pairing, extend the commit helper to accept
  directory paths (stage with `git add -A -- <dir>` limited to the named paths) with a test in the commit suite; record
  the file in the SUMMARY.
- Rename detection in the commit relies on git's exact-rename pass, which has no rename limit; R100 is expected.
</error_recovery>

</embedded_context>

<gotchas>
- This repository itself is migrated by this hook only after 3.0.0 is installed (72-21). Do not run the migration
  against this checkout here.
- Live runtime is DevFlow 2.15.0: commit with `node ~/.claude/devflow/bin/df-tools.cjs commit`. Never port 8080.
- Fixture commits use `-c commit.gpgsign=false`; the hook's real commit path signs if the user's config says so, and a
  signing failure is reported, never bypassed.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builder: legacy git projects in each state</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-migration-fixtures.cjs</files>
  <action>
`legacyProject({ state = 'clean' | 'dirty' | 'merge' | 'nogit', store = false, stamp = '2.15.0' })` -> `{ root, home,
cleanup }`: a typed-out legacy planning tree (reuse `legacy-layout-fixtures.cjs` `planningProject({ layout: 'legacy' })`
for the tree), config.json with the legacy stamp key, `.gitignore` with one legacy runtime line, an untracked excluded
`.planning/.skill-active`, a commit; `dirty` modifies STATE.md; `merge` writes `MERGE_HEAD` into the git dir; `store`
writes config `github.store: true`, a legacy-marker 0010 block covering the cache, and untracks the cache the way 0010
does. Check with `node -e`. Commit (`test(72-08): legacy project fixtures`).
  </action>
  <verify>node -e "const f=require('./plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-migration-fixtures.cjs');for(const s of ['clean','dirty','merge','nogit']){const p=f.legacyProject({state:s});console.log(s,require('fs').readdirSync(p.root));p.cleanup()}"</verify>
  <done>Every state builds; `git status` is clean for `clean` and `store`.</done>
  <recovery>For `store`, call 0010's own block builder with the legacy slug rather than typing the block twice.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Migration 0012 and the 0010 block's legacy markers</name>
  <files>plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0010-store-gitignore.cjs</files>
  <action>
RED: tests 6-9 (header test list first). Run: fail. Commit RED.

GREEN: `0012-planning-dir-move.cjs` (`safety: 'auto'`, `since: '3.0.0'`): detect per test 6; apply: busy/dirty guard ->
`{ deferred }`; backup via `upgrade.backup`-style helper (whole legacy dir + ignore files) under
`~/.claude/aoforge/backups/<repoKey>/<ts>/`; store mode -> re-upsert the 0010 block first; `git mv` (or fs rename
outside git); ignore-file counterparts; `changed_files`. 0010: `readBlock` recognises markers with either slug
(NAMES/LEGACY), `upsertBlock` replaces a legacy-marker block in place with AOForge markers, `blockLines` lists both
directory names for one release. Header comments state the one-release scope. Commit GREEN.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/migrations/0010-store-gitignore.test.cjs</verify>
  <done>Tests 6-9 pass; the 0010 suite passes.</done>
  <recovery>If 0010's existing tests pin the exact block text, update them to the both-names form (the fixture
generator, not hand-typed expectations, if one exists).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 0013, the runner, the hook, W067</name>
  <files>plugins/aoforge/aoforge/bin/lib/migrations/0013-config-key-rename.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0013-config-key-rename.cjs, plugins/aoforge/aoforge/bin/lib/upgrade.cjs, plugins/aoforge/aoforge/bin/lib/validate.cjs, plugins/aoforge/hooks/upgrade-project.legacy.test.js, plugins/aoforge/hooks/upgrade-project.js</files>
  <action>
RED: tests 10-13, then 1-5. Run: fail. Commit RED.

GREEN:
- `0013-config-key-rename.cjs` (auto) per test 10.
- `upgrade.cjs`: `readStamp` reads `NAMES.configKey` then `LEGACY.configKey`; the stamp write removes the legacy key;
  every migration call resolves `planningRoot(root)` fresh; the final stamp goes to the resolved config.json.
- `upgrade-project.js`: fast path requires `!compat.isLegacyPlanning(root)`; a `deferred` result from 0012 becomes a
  notice (`kind: 'deferred'`, reason, the `--only 0012` command); a completed move passes `changed_files` to the
  existing detached commit child unchanged in mechanism.
- `validate.cjs` Check 22: W067 `legacy-config-key`.
Run tests 1-13, the existing upgrade and upgrade-project suites, and the full suite. Commit GREEN.
  </action>
  <verify>node --test plugins/aoforge/hooks/upgrade-project.legacy.test.js plugins/aoforge/hooks/upgrade-project.test.js plugins/aoforge/aoforge/bin/lib/migrations/0013-config-key-rename.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/upgrade.test.cjs</verify>
  <done>Tests 1-13 pass; existing upgrade/upgrade-project suites pass; full suite at baseline.</done>
  <recovery>If the commit child cannot be awaited reliably, make the test poll `git log` for up to 20 s; never sleep a
fixed long time.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'</test>
</validation_gates>

<verification>
- `ls plugins/aoforge/aoforge/bin/lib/migrations/ | rg -e '^001[23]-'` shows both migrations and their tests.
- `node plugins/aoforge/aoforge/bin/aof-tools.cjs upgrade --check --path <scratch legacy project>` lists 0012 and 0013
  as pending auto migrations.
</verification>

<success_criteria>
- A legacy project moves to `.aoforge/` and the AOForge config key on its next session, safely, with history intact.
</success_criteria>

<output>
After completion, create `.planning/objectives/72-install-and-naming-cleanup/72-08-SUMMARY.md` through
`df-tools summary post`.
</output>
