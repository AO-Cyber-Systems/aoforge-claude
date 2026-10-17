---
objective: 79-reconcile-and-release-3-1-0
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - .aoforge/REQUIREMENTS.md
  - .aoforge/ROADMAP.md
  - .aoforge/STATE.md
  - .claude-plugin/marketplace.json
  - CHANGELOG.md
  - CLAUDE.md
  - docs/USER-GUIDE.md
  - package.json
  - plugins/aoforge-stack-flutter/lib/flutter-ui-setup.cjs
  - plugins/aoforge-stack-flutter/lib/flutter-ui-setup.test.cjs
  - plugins/aoforge/aoforge/bin/aof-tools.cjs
  - plugins/aoforge/aoforge/bin/lib/help.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs
  - plugins/aoforge/aoforge/bin/lib/ui-metrics.cjs
  - site/data/aoforge.json
  - ".planning/objectives/76-model-efficiency-and-stack-specific-content/** -> .aoforge/objectives/76-model-efficiency-and-stack-specific-content/** (git mv)"
  - ".planning/objectives/77-stack-packs-contract-and-extraction/** -> .aoforge/objectives/77-stack-packs-contract-and-extraction/** (git mv)"
  - ".planning/quick/{34..39}-*/** -> .aoforge/quick/{34..39}-*/** (git mv)"
  - plugins/aoforge/hooks/pre-bash.js
  - .gitignore
  - plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
  - plugins/aoforge/aoforge/bin/lib/awareness.test.cjs
autonomous: true
requirements: [SC-1, SC-2]
must_haves:
  truths:
    - "`integrate/3.1.0` has exactly one new merge commit whose parents are the pre-merge head (5c89d0b6 or the objective-79 planning commit on top of it) and `fix/post-77-verification` (7fced4d9); `git merge-base --is-ancestor fix/post-77-verification integrate/3.1.0` and `git merge-base --is-ancestor feat/remove-rename-shims integrate/3.1.0` both exit 0; no rebase, no squash, no `-X ours|theirs`"
    - "The 15 conflicted paths carry no conflict markers and keep both sides' behaviour: main's lazy CLI loading without the env alias, the help text of both sides, both planning-mode test blocks, main's pack-derived ui-metrics defaults, the pack's core loader in flutter-ui-setup, main's stack-pack marketplace entries and package.json glob without the pre-rename pointer plugin"
    - "`git ls-files .planning` prints nothing: the 18 main-side files (objectives 76/77, quick 34-39) live under `.aoforge/` with their history (moved with git mv)"
    - "package.json, plugins/aoforge/.claude-plugin/plugin.json and .claude-plugin/marketplace.json (top level and the aoforge entry) read 3.1.0"
    - "pre-bash.js no longer calls the env alias objective 78 removed, so the PreToolUse(Bash) dispatcher loads; `node plugins/aoforge/aoforge/bin/aof-tools.cjs state load` runs on the merged tree"
    - ".gitignore holds no line naming the pre-rename planning directory or product; its rename-guard ALLOW entry and awareness G2's legacy-twin allowance are gone; the rename guard passes"
    - "The SUMMARY carries a triage table of every full-suite failure on the merged tree, each routed to exactly one of 79-02..79-07"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/aof-tools.cjs
      provides: "main's lazy loader, no env alias"
      contains: "function lazyModule"
    - path: .aoforge/objectives/77-stack-packs-contract-and-extraction/OBJECTIVE.md
      provides: "main's objective 77 record under the AOForge planning tree"
    - path: .aoforge/quick/39-move-remaining-web-and-flutter-procedure/39-SUMMARY.md
      provides: "quick 39 record moved"
  key_links:
    - from: "merge commit"
      to: "fix/post-77-verification 7fced4d9"
      via: "second parent"
      pattern: "Merge fix/post-77-verification"
    - from: "plugins/aoforge/hooks/pre-bash.js"
      to: "plugins/aoforge/aoforge/bin/lib/compat.cjs"
      via: "no call to a removed export"
      pattern: "DISPATCHED_HOOKS"
---

# TRD 79-01: Merge `fix/post-77-verification` into `integrate/3.1.0`, resolve the 15 conflicts as unions, move main's planning records

<objective>
Make `integrate/3.1.0` one tree: objective 78's single-name AOForge line (it already contains PR #129's
`feat/stack-profile-loader` and objective 78) merged with `fix/post-77-verification` (origin/main ee93e66f with
objectives 76/77 and perf #133, plus quick 34-39 and the 3.1.0 version) through ONE merge commit. Resolve each of the 15
text conflicts so both sides' behaviour survives, move the 18 files main still keeps under the pre-rename planning
directory into `.aoforge/` with `git mv`, then make the merged tree load (the dispatcher's env-alias call), drop the
legacy `.gitignore` lines, and triage the full suite so the wave-2 TRDs know exactly what is theirs.

Purpose: SC-1 (one merge commit, unions, 3.1.0) and the load-bearing part of SC-2 (no tracked legacy planning path,
legacy ignore lines gone). Everything after this TRD builds on its merge commit.
Output: the merge commit, two or three follow-up commits, and a SUMMARY with the conflict ledger and the triage table.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/ROADMAP.md
@.aoforge/objectives/78-remove-the-rename-shims/78-12-SUMMARY.md

Facts established at planning (2026-10-16/17; re-check each before relying on it):

- This runs in the main checkout `/Users/justin/dev/aoforge-claude` on `integrate/3.1.0` (a single-TRD wave runs in
  REPO_ROOT). Use the repo copy of the CLI: `node plugins/aoforge/aoforge/bin/aof-tools.cjs` (the installed 3.0.0 mirror
  lacks objective 78).
- `git -c merge.renameLimit=20000 merge-tree --write-tree integrate/3.1.0 fix/post-77-verification` gives exactly these
  15 content conflicts: `.aoforge/REQUIREMENTS.md`, `.aoforge/ROADMAP.md`, `.aoforge/STATE.md`,
  `.claude-plugin/marketplace.json`, `CHANGELOG.md`, `CLAUDE.md` (4 hunks), `docs/USER-GUIDE.md`, `package.json`,
  `plugins/aoforge-stack-flutter/lib/flutter-ui-setup.cjs`, `plugins/aoforge-stack-flutter/lib/flutter-ui-setup.test.cjs`,
  `plugins/aoforge/aoforge/bin/aof-tools.cjs`, `plugins/aoforge/aoforge/bin/lib/help.cjs`,
  `plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs`, `plugins/aoforge/aoforge/bin/lib/ui-metrics.cjs`,
  `site/data/aoforge.json`. Every other file is one hunk except CLAUDE.md. Without the raised rename limit, rename
  detection degrades and main's `.planning/` edits do not follow into `.aoforge/`.
- Rename detection carries main's edits to `.planning/{ROADMAP,STATE,REQUIREMENTS,STATE_ARCHIVE}.md` into `.aoforge/`.
  Main's `.planning/config.json` and `state.json` are unchanged since the base 11e98cf4, so `.aoforge/config.json` keeps
  the `aoforge{}` stamp. 18 main-side files are new and stay under `.planning/`:
  `objectives/76-model-efficiency-and-stack-specific-content/{.gitkeep,76-STACK-ASSESSMENT.md,OBJECTIVE.md}`,
  `objectives/77-stack-packs-contract-and-extraction/{.gitkeep,77-GO-PACK-ASSESSMENT.md,OBJECTIVE.md}`, and
  `quick/{34..39}-*/{NN-JOB.md,NN-SUMMARY.md}`. Numbers do not collide (this line has objectives up to 75 plus 78/79 and
  quick up to 33; warning codes W068 main vs W069 here).
- `hooks/hooks.json` merges cleanly (pre-bash.js is the one PreToolUse(Bash) registration; guard-no-progress uses
  `^(?!Bash$).*`). `.git/info/attributes` already routes `.aoforge/state.json` to the JSON merge driver and
  `.aoforge/STATE_ARCHIVE.md` to union.
- Main-side code calling exports objective 78 deleted: `aof-tools.cjs` (inside the conflict hunk) and
  `plugins/aoforge/hooks/pre-bash.js:30` (`require('../aoforge/bin/lib/compat.cjs').aliasLegacyEnv()`, NOT a conflict:
  it merges silently and then throws a TypeError at load, which the `MODULE_NOT_FOUND` guard does not catch, so every
  Bash gate stops running). The full sweep and its repo test are 79-02; this TRD fixes only these two load blockers.
- 78-12 kept the legacy `.gitignore` lines (lines 24-29 comments, 26 `.devflow-handoff/`, every `.planning/...` twin,
  `.aoforge/.devflow-notices.json`) and the rename guard's `.gitignore` ALLOW entry "until main is reconciled"; this is
  that reconcile. `awareness.test.cjs` G2 allows the legacy twin "only until that reconcile".
- On disk (ignored, not tracked): `.devflow-handoff/`, `.aoforge/.devflow-notices.json`,
  `.aoforge/objectives/37-adopt-existing-repos/.devflow-handoff/`. An untracked `amp` file at the repo root is the
  user's: never stage, move or delete it.
- Commit signing is on (ssh). The merge-completion `git commit` is allowed by the commit gate because MERGE_HEAD exists;
  every other commit goes through `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit`.
</context>

<embedded_context>

<codebase_examples>
The conflict in `aof-tools.cjs` (merged tree line ~227): the integrate side is empty (78 deleted the alias call), the
main side adds the alias call plus the lazy-loading block. The resolution keeps everything from
`// ─── Lazy module loading` through `function lazyModule(mod) {...}` and drops exactly these three lines:
```js
// Objective 72: the legacy environment prefix keeps working for one release (the new prefix
// wins when both are set). First, so no module below reads the environment before it runs.
require('./lib/compat.cjs').aliasLegacyEnv();
```

`help.cjs` (validate `details`): keep the integrate sentence (W066 broken/warning, W067 alone/beside, W069, the 3.0.x
path) and append main's last sentence verbatim: `roadmap-coverage checks that every v1 requirement maps to exactly one
ROADMAP objective (orphans, duplicates, unknown ids); exit 1 on a gap (TRD 76-04).` Drop main's `--only 0012/0013` text:
those migrations are retired in 3.1.

`ui-metrics.cjs`: keep main's `function defaultPaths(cwd)` (pack manifests' `ui.metrics_paths`, else `--paths`) and drop
`const DEFAULT_PATHS = ['flutter/lib'];` (objective 77 moved the stack default out of core). Keep the comment as
`// relative to the project's resolved planning directory (\`.aoforge/\`)` (78's single-name wording).

`flutter-ui-setup.cjs` (pack): `const watcherState = require('./core.cjs')('watcher-state.cjs');` and NO comment about a
`legacy` daemon record (78-05 removed 3.0.0 daemon records). `flutter-ui-setup.test.cjs`:
```js
const { validateInputsSchema } = require('./core.cjs')('handoff.cjs');
const { watchStateDir } = require('./core.cjs')('compat.cjs');
```

`package.json` `scripts.test`:
`node --test 'plugins/aoforge/**/*.test.cjs' 'plugins/aoforge-stack-*/**/*.test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'`
(main's glob minus the removed pointer plugin's `plugins/<pre-rename>/**/*.test.js`).

`.claude-plugin/marketplace.json`: main's `aoforge-stack-flutter` 1.0.0 and `aoforge-stack-web` 1.0.0 entries; NOT the
pre-rename pointer entry (`"source": "./plugins/<pre-rename>"`, removed by 78-02).
</codebase_examples>

<anti_patterns>
- `git checkout --ours/--theirs <file>` or `-X ours|theirs` for a whole file with real content on both sides. The only
  whole-side pick allowed is `site/data/aoforge.json`, which is regenerated right after.
- Rebasing, squashing, cherry-picking or a second merge commit. One `git merge --no-ff`, one merge commit.
- `git add -A` / `git add .` (would stage `amp`). Stage paths by name.
- Moving `.planning/` files with `mv` + `git add` (loses rename tracking in review) or editing their contents while
  moving. History files (JOB, SUMMARY, assessments) keep their text, including any `.planning/` path they mention.
- Restoring a removed compat export to make main's code load. Objective 78's single-name compat is the contract: fix the
  caller.
- Deleting the on-disk legacy leftovers (`.devflow-handoff/` etc.). They are the user's machine state; exclude them
  locally instead (Task 3).
- Committing with `git commit` outside the merge (use `aof-tools commit`), `--no-verify`, or `--no-gpg-sign`.
</anti_patterns>

<error_recovery>
- The merge reports a conflict outside the 15 listed paths, or a modify/delete conflict: stop resolving, record the
  extra path in the SUMMARY, resolve it with the same union rule; if its semantics are unclear, `git merge --abort`
  (nothing is committed yet) and return blocked with the path and both sides' log (`git log --oneline
  11e98cf4..<side> -- <path>`).
- A resolution turns out wrong after the merge commit: fix it in a follow-up commit (`aof-tools commit`), never amend or
  reset the merge.
- Commit signing prompts or fails: do not bypass; return blocked naming the signing error (the user unlocks the agent).
- `git mv` refuses because the destination exists: compare the two files; if identical, `git rm` the `.planning/` copy;
  if different, stop and record (a numbering collision was ruled out at planning, so this means something changed).
- `node scripts/gen-docs-data.cjs` fails: its input is the merged plugin tree; fix the input (usually a conflict-marker
  leftover), never hand-edit the JSON.
</error_recovery>

</embedded_context>

<gotchas>
- `planning-mode.test.cjs`: the conflict hunk cuts across two `describe` blocks (78's `$HOME is never the main root
  (TRD 73-09)` with tests 17/18, and quick 36's `resolveVerbRoot ... (quick 36)` with 6a-6d). Keep both complete; check
  every brace closes with `node --check` and run the file.
- `CHANGELOG.md`: keep `## [Unreleased]` with the integrate side's Added/Changed/Removed/Fixed entries under it, then
  main's `## [3.1.0] - 2026-10-16` block, then `## [3.0.0]` unchanged. 79-06 folds them into one 3.1.0 section; do not
  do it here.
- `CLAUDE.md` (4 hunks): resolve to a coherent, marker-free union where 78's statements win wherever the two disagree on
  the shims (no pointer plugin, no env alias, retired 0012/0013/0014, single planning directory). Do NOT try to meet
  main's context budget (200 lines / 20,000 chars) here; 79-07 rewrites the file.
- `.aoforge/ROADMAP.md`: one section per objective. Main placed its `### Objective 76`/`77` sections after the Progress
  table and still has `TRDs: TBD` sections for 74/75; the integrate side executed 72-75, so its sections win for those.
  Place 76 and 77 between 75 and 78 (above `## Progress`), keep main's text for them (their TRD lists name files main
  never committed: keep the lines, 79-08 records it). Progress table: one row per objective; main's rows only for 76/77.
- `.aoforge/STATE.md`: main deleted a block (decision rotation by migration 0015) that the integrate side extended. Keep
  the integrate block; 79-08 runs migration 0015, which rotates it. Where main-side STATE text links a moved file
  (`.planning/quick/3N-...`, `.planning/objectives/7[67]-...`), rewrite the link to `.aoforge/...`.
- `.aoforge/REQUIREMENTS.md`: add main's requirement definitions and traceability rows (the 76/77 families) beside the
  integrate side's; adjust any "N requirements" count line to the union.
- `docs/USER-GUIDE.md`: union; where main's text says a shim still works "for one release", take 78's wording.
</gotchas>

<tasks>

<task type="auto" caution="pause-before-destructive">
  <name>Task 1: Start the merge and resolve the nine code, manifest and data conflicts</name>
  <files>plugins/aoforge/aoforge/bin/aof-tools.cjs, plugins/aoforge/aoforge/bin/lib/help.cjs, plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs, plugins/aoforge/aoforge/bin/lib/ui-metrics.cjs, plugins/aoforge-stack-flutter/lib/flutter-ui-setup.cjs, plugins/aoforge-stack-flutter/lib/flutter-ui-setup.test.cjs, package.json, .claude-plugin/marketplace.json, site/data/aoforge.json</files>
  <action>
Pre-checks (one plain command per Bash call), recorded in the SUMMARY:
`git -C /Users/justin/dev/aoforge-claude branch --show-current` (must be `integrate/3.1.0`);
`git -C ... status --porcelain` (only `?? amp` may remain; anything else: stop, return blocked);
`git -C ... rev-parse HEAD fix/post-77-verification feat/remove-rename-shims` (record PRE_MERGE_HEAD; fix side must be
7fced4d9; if it moved, record the new sha and the commits since);
`git -C ... merge-base --is-ancestor feat/remove-rename-shims HEAD` (exit 0).

Start: `git -C /Users/justin/dev/aoforge-claude -c merge.renameLimit=20000 merge --no-ff --no-commit fix/post-77-verification`.
Then `git -C ... diff --name-only --diff-filter=U` and compare with the 15 listed paths (record any difference).

Resolve, following codebase_examples and gotchas (Edit tool, file by file; read each hunk with `rg -n '^(<<<<<<<|=======|>>>>>>>)' <file>` then
Read with offset/limit):
1. `aof-tools.cjs`: main's lazy loader, no alias call. Then `rg -n "aliasLegacyEnv" plugins/aoforge/aoforge/bin/aof-tools.cjs` must print nothing.
2. `help.cjs`: the union sentence. 3. `planning-mode.test.cjs`: both describe blocks. 4. `ui-metrics.cjs`: main's
`defaultPaths`. 5./6. the pack's flutter-ui-setup pair (also `rg -n "legacy" plugins/aoforge-stack-flutter/lib/flutter-ui-setup.cjs`
and remove any 3.0.0-daemon `legacy` record branch the merge carried in, matching what 78-05 did to the core copy).
7. `package.json`: main's globs minus the pointer plugin glob; `"version": "3.1.0"`. 8. `marketplace.json`: main's
pack entries, no pointer entry, top-level and aoforge entry `3.1.0`; validate with `node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8'))"`.
9. `site/data/aoforge.json`: `git -C ... checkout --theirs site/data/aoforge.json`, then after steps 1-8,
`node scripts/gen-docs-data.cjs` (run from the repo root) to regenerate it from the merged tree.

`git add` each resolved path by name. Check: `node --check` on each of the six .cjs files; then
`node --test plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs plugins/aoforge/aoforge/bin/lib/ui-metrics.test.cjs plugins/aoforge-stack-flutter/lib/flutter-ui-setup.test.cjs`
with `HOME` set to an empty `mktemp -d` directory (these may still fail for semantic reasons owned by wave 2: record,
do not chase; a syntax error or a missing-module error from YOUR resolution must be fixed now).
  </action>
  <verify>
- `git -C /Users/justin/dev/aoforge-claude diff --name-only --diff-filter=U` lists only the six docs/planning paths left for Task 2
- `rg -n '^(<<<<<<< |>>>>>>> )' plugins/aoforge/aoforge/bin plugins/aoforge-stack-flutter/lib package.json .claude-plugin site/data` prints nothing
- `node -e "for (const f of ['package.json','plugins/aoforge/.claude-plugin/plugin.json','.claude-plugin/marketplace.json']) console.log(f, JSON.parse(require('fs').readFileSync(f,'utf8')).version)"` prints 3.1.0 three times, and the aoforge marketplace entry is 3.1.0
- `node plugins/aoforge/aoforge/bin/aof-tools.cjs --help` exits 0 (the CLI loads)
  </verify>
  <done>The nine paths are resolved and staged with both sides' behaviour; versions read 3.1.0; site data regenerated from the merged tree.</done>
  <recovery>Before the merge commit nothing is final: `git merge --abort` returns to PRE_MERGE_HEAD (the untracked `amp` is untouched). Record why and return blocked rather than committing a doubtful resolution.</recovery>
</task>

<task type="auto">
  <name>Task 2: Resolve the six docs/planning conflicts, move main's planning records, commit the merge</name>
  <files>.aoforge/REQUIREMENTS.md, .aoforge/ROADMAP.md, .aoforge/STATE.md, CHANGELOG.md, CLAUDE.md, docs/USER-GUIDE.md, .planning/** -> .aoforge/** (18 files)</files>
  <action>
Resolve ROADMAP, STATE, REQUIREMENTS, CHANGELOG, CLAUDE.md and USER-GUIDE per gotchas (unions; 78 wins on shim facts;
CHANGELOG keeps two headings for 79-06). `git add` each by name.

Move main's records (each its own Bash call, from the repo root):
`git mv .planning/objectives/76-model-efficiency-and-stack-specific-content .aoforge/objectives/76-model-efficiency-and-stack-specific-content`
`git mv .planning/objectives/77-stack-packs-contract-and-extraction .aoforge/objectives/77-stack-packs-contract-and-extraction`
and one `git mv .planning/quick/<dir> .aoforge/quick/<dir>` per quick directory 34-39 (list them with
`git ls-files .planning/quick`). Then `git ls-files .planning` must print nothing and `.planning` must not exist on disk
(`test ! -e .planning`; remove an empty leftover directory with `rmdir`).

Check before committing: `git diff --name-only --diff-filter=U` empty; `git diff --cached --check` reports no conflict
marker (whitespace warnings in history files are acceptable: record them); `git status --porcelain` shows only staged
changes and `?? amp`.

Commit the merge (allowed: MERGE_HEAD exists). Write the message to a file in a `mktemp -d` scratch directory with the
Write tool, then `git -C /Users/justin/dev/aoforge-claude commit -F <file>`. Message:
```
Merge fix/post-77-verification into integrate/3.1.0 (objective 79)

One tree for 3.1.0: main (objectives 76/77, perf #133) and quick 34-39 (the 3.1.0
version) merged with the AOForge line (PR #129: objectives 72-75 and the .aoforge/
move) and objective 78 (the rename shims removed).

Conflicts resolved as unions (15): .aoforge/{REQUIREMENTS,ROADMAP,STATE}.md,
.claude-plugin/marketplace.json, CHANGELOG.md, CLAUDE.md, docs/USER-GUIDE.md,
package.json, plugins/aoforge-stack-flutter/lib/flutter-ui-setup{,.test}.cjs,
plugins/aoforge/aoforge/bin/aof-tools.cjs, bin/lib/help.cjs,
bin/lib/planning-mode.test.cjs, bin/lib/ui-metrics.cjs, site/data/aoforge.json
(regenerated). Objective 78 wins on the shims; main wins on stack packs and lazy
loading. Main's planning records for objectives 76/77 and quick 34-39 moved from
the pre-rename planning directory to .aoforge/ with git mv.
```
(If the commit gate's own text check rejects a line, adjust wording, not the gate.)
Record MERGE_COMMIT = `git rev-parse HEAD` and its parents (`git rev-parse HEAD^1 HEAD^2`).
  </action>
  <verify>
- `git -C /Users/justin/dev/aoforge-claude rev-parse HEAD^2` == `git rev-parse fix/post-77-verification`; `HEAD^1` == PRE_MERGE_HEAD
- `git -C ... merge-base --is-ancestor fix/post-77-verification HEAD` and `... feat/remove-rename-shims HEAD` both exit 0
- `git -C ... ls-files .planning` prints nothing; `git -C ... ls-files .aoforge/quick | rg -c '/3[4-9]-'` prints 12; `git -C ... ls-files .aoforge/objectives/76-model-efficiency-and-stack-specific-content .aoforge/objectives/77-stack-packs-contract-and-extraction` lists 6 files
- `rg -n '^(<<<<<<< |>>>>>>> )' .aoforge CHANGELOG.md CLAUDE.md docs/USER-GUIDE.md` prints nothing
- `rg -n '^## \[(Unreleased|3\.1\.0\]|3\.0\.0\])' CHANGELOG.md` shows Unreleased, then 3.1.0, then 3.0.0, each once
- `rg -c '^### Objective (7[4-9]):' .aoforge/ROADMAP.md` shows each of 74-79 exactly once (count 6)
  </verify>
  <done>One merge commit with both parents; 15 conflicts resolved; no tracked legacy planning path; merge recorded in the SUMMARY with MERGE_COMMIT.</done>
  <recovery>If something is wrong after the commit, fix forward with `aof-tools commit` (never `git reset`, never amend the merge).</recovery>
</task>

<task type="auto">
  <name>Task 3: Make the merged tree load, retire the legacy ignore lines, triage the full suite</name>
  <files>plugins/aoforge/hooks/pre-bash.js, .gitignore, plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs, plugins/aoforge/aoforge/bin/lib/awareness.test.cjs, .git/info/exclude (local, untracked)</files>
  <action>
A. pre-bash.js: delete line 30 (`try { require('../aoforge/bin/lib/compat.cjs').aliasLegacyEnv(); } catch ...`) and
nothing else (every other hook already lost its call in objective 78). Run
`node --test plugins/aoforge/hooks/pre-bash.test.js` with an empty scratch HOME (9/9 expected; a failure from gate
semantics is 79-03's: record). Commit: `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "fix(79-01): pre-bash drops the env alias objective 78 removed" --files plugins/aoforge/hooks/pre-bash.js`.

B. Legacy ignore lines. First list what each legacy line still ignores on disk:
`git -C /Users/justin/dev/aoforge-claude status --porcelain --ignored` (record the `!!` paths that only a legacy line
matches: expected `.devflow-handoff/`, `.aoforge/.devflow-notices.json`,
`.aoforge/objectives/37-adopt-existing-repos/.devflow-handoff/`). Append exactly those leftover paths, under a comment
`# pre-rename runtime leftovers on this machine (objective 79; not in the repo)`, to `.git/info/exclude` (local,
untracked; the rename guard reads only `git ls-files`). Then edit `.gitignore`: remove every `.planning/...` line, the
`.devflow-handoff/` line, the `.aoforge/.devflow-notices.json` line, and the comments that only explained the one-release
twins (lines 24, 28-29 on the pre-merge file); keep every `.aoforge/...` line and every unrelated entry. In
`rename-guard.repo.test.cjs` delete the `.gitignore` ALLOW entry (and update header comment 5a/5b wording that says
the tree passes "with ALLOW entries for .gitignore and the monorepo doctor"). In `awareness.test.cjs` G2 drop the
legacy twin from `allowed` and its comment, and drop the `LEGACY` import if nothing else in the file uses it.
Run `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/awareness.test.cjs`
(scratch HOME): both pass; `git status --porcelain` shows no new untracked leftovers.
Commit: `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "chore(79-01): drop the legacy planning-directory ignore lines after the main reconcile" --files .gitignore plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/awareness.test.cjs`.

C. Smoke: `node plugins/aoforge/aoforge/bin/aof-tools.cjs state load` and `... validate health --raw` (record the
result; do not fix W040/W068 here: 79-08 runs the upgrade).

D. Triage run (read-only). In a `mktemp -d` scratch dir S: write the file list with
`git -C /Users/justin/dev/aoforge-claude ls-files -co --exclude-standard -- 'plugins/aoforge/*.test.cjs' 'plugins/aoforge/*.test.js' 'plugins/aoforge-stack-*/*.test.cjs' 'scripts/*.test.cjs'`
(redirected to S/all.txt), drop `plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs` (its W-3 fish test hangs on
this machine; name the exclusion) into S/files.txt, create S/home, then run the suite in the background (Bash
`run_in_background`), from the repo root: `env HOME=S/home xargs node --test < S/files.txt > S/suite.txt 2>&1`
(substitute the literal S path). When it finishes, read the `# tests/# pass/# fail/# skipped/# cancelled` lines and every
`not ok` with its file. Write the triage table into the SUMMARY: test file, failing test names, first assertion/error
line, routed TRD, using this routing:
- `plugins/aoforge/hooks/**`, `hook-inventory.test.cjs`, `doctor-checks/11-12-install.test.cjs`,
  `doctor-checks/12-hooks-registry*` -> 79-03
- `planning-mode.test.cjs`, `planning-verbs-worktree*.test.cjs`, `planning-verbs-cli.test.cjs`,
  `model-profiles.test.cjs`, `model-profile-binding.test.cjs`, `config.test.cjs`, `doctor-checks/13-model-profiles.test.cjs`,
  `compat.legacy.test.cjs`, `compat.home.test.cjs`, `old-layout.legacy.test.cjs`, `legacy-layout-guard*.test.cjs` -> 79-04
- `requirements-agreement*.test.cjs`, `validate-requirements.test.cjs`, `stack-profiles-content.test.cjs` -> 79-05
- tests that read the repo's CHANGELOG, versions or `site/data` (e.g. `changelog*.test.cjs` repo cases, docs-data
  checks) -> 79-06; tests that read CLAUDE.md or `docs/` (`context-budget.repo.test.cjs`,
  `dispatch-completeness.test.cjs`, `doc-refs.repo.test.cjs`) -> 79-07
- everything else -> 79-02
The two known failures (`requirements-agreement.repo.test.cjs` 11, `validate-requirements.test.cjs` 9) are expected and
routed to 79-05.
  </action>
  <verify>
- `rg -n "aliasLegacyEnv" plugins/aoforge/hooks plugins/aoforge/aoforge/bin/aof-tools.cjs` prints nothing
- `printf '%s' '{"tool_name":"Bash","tool_input":{"command":"ls"},"session_id":"t"}' | env HOME=<S>/home node plugins/aoforge/hooks/pre-bash.js; echo "exit $?"` prints `exit 0` with no stack trace
- `rg -n -e '\.planning/' -e 'devflow' .gitignore` prints nothing
- `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` passes with no `.gitignore` ALLOW entry
- the SUMMARY's triage table has a route for every `not ok` in S/suite.txt
  </verify>
  <done>The dispatcher loads, the legacy ignore lines and their guard allowance are gone (machine leftovers excluded locally), and every merged-tree failure is triaged to one wave-2/3 TRD.</done>
  <recovery>If removing an ignore line makes a tracked-file test fail (some test asserting the legacy line), route it in the triage table rather than restoring the line. If the suite run hangs past 20 minutes, stop it, record the file it was in (last `# Subtest` lines) and add it to the named exclusions with the reason.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test is the gate, run here only as the triage (Task 3 D, watcher-shell excluded and named); scoped while resolving: node --test {files}</test>
</validation_gates>

<verification>
- One merge commit (parents PRE_MERGE_HEAD and 7fced4d9), no markers anywhere, `git ls-files .planning` empty.
- Versions 3.1.0 in the three files; marketplace has the two stack packs and no pointer plugin.
- pre-bash loads; rename guard and awareness pass without the legacy ignore allowance.
- Triage table complete and routed.
</verification>

<success_criteria>
- `integrate/3.1.0` holds every commit of both lines through one merge commit, with every conflict resolved as a union
  that keeps both sides' behaviour, and wave 2 knows exactly which failures are its own.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/79-reconcile-and-release-3-1-0/79-01-SUMMARY.md` through
`node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post`. Include: PRE_MERGE_HEAD, MERGE_COMMIT and parents, the
conflict ledger (path, what each side brought, the resolution), the 18 moves, the local excludes added, the suite
numbers and the triage table.
</output>
