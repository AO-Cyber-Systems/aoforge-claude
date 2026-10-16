---
objective: 72-install-and-naming-cleanup
trd: "18"
subsystem: release
tags: [aoforge-rename, release, 3.0.0, changelog, version-sync, rehearsal]

requires:
  - phase: 72-14
    provides: "the devflow pointer plugin at 3.0.0 and gen-pointer-skills"
  - phase: 72-17
    provides: "docs/MIGRATING-TO-AOFORGE.md and the gen-docs-data hand-off"
  - phase: 72-07
    provides: "the one-time runtime-state migration the rehearsal exercised"
  - phase: 72-08
    provides: "migrations 0012/0013 the rehearsal exercised"
  - phase: 72-09
    provides: "the global block move and the outside-block diff the rehearsal exercised"
provides:
  - "Versions in step at 3.0.0: package.json, package-lock.json (was a stale 2.0.1), plugins/aoforge plugin.json, marketplace top level and the aoforge entry; the pointer plugin and its entry were already 3.0.0"
  - "Patch bumps for every sibling plugin changed in objective 72 (plugin.json and marketplace entry): social-media-generator 1.3.1, aosentry-mcp 1.0.1, eden-ui-flutter 1.0.1, eden-ui-web 1.0.1, monorepo-standards 0.1.1"
  - "CHANGELOG `## [3.0.0] - 2026-10-08` under an empty `## [Unreleased]`: a lead paragraph linking docs/MIGRATING-TO-AOFORGE.md, `### DevFlow is now AOForge (breaking)` (name map summary, one-release shims, what moves by itself, the pointer release, gh rebrand, doctor checks, the command-form gate, what does not carry over, sibling patch releases), then `### Objectives 68 to 71` over the previously unreleased entries; 56 lines added, 0 deleted"
  - "site/data/aoforge.json regenerated at v3.0.0"
  - "A validation record (suite, plugin validate x8, pointer check, guards, tag gate dry run, codemod inventory) and an end-to-end upgrade rehearsal record on a scratch clone with a fake HOME"
affects: [72-19, 72-20, 72-21, 72-23, 72-25]

tech-stack:
  added: []
  patterns:
    - "Release promotion keeps an empty `## [Unreleased]` heading and inserts the version heading under it, so the CHANGELOG diff is additions only (2.14.0, 2.15.0, 3.0.0)"
    - "Upgrade rehearsal: clone with --no-hardlinks, local identity, gpgsign off and a dead pushurl; fake HOME seeded by rsync --exclude backups; hooks run with HOME and CLAUDE_PLUGIN_ROOT pointed at the scratch copies; the real home fingerprinted before and after"

key-files:
  created: []
  modified:
    - package.json
    - package-lock.json
    - plugins/aoforge/.claude-plugin/plugin.json
    - .claude-plugin/marketplace.json
    - plugins/aosentry-mcp/.claude-plugin/plugin.json
    - plugins/eden-ui-flutter/.claude-plugin/plugin.json
    - plugins/eden-ui-web/.claude-plugin/plugin.json
    - plugins/monorepo-standards/.claude-plugin/plugin.json
    - plugins/social-media-generator/.claude-plugin/plugin.json
    - CHANGELOG.md
    - site/data/aoforge.json

key-decisions:
  - "Kept an empty `## [Unreleased]` above `## [3.0.0]` rather than renaming the heading, matching the 2.14.0 and 2.15.0 promotions; the diff adds only the 3.0.0 heading and lead section"
  - "Patch-bumped social-media-generator too: its plugin.json and SKILL.md changed in objective 72, although the TRD's files_modified list omitted it"
  - "No `[3.0.0]` compare link: the link block stops at the fork (1.20.4), no 2.x release has one, and `changelog check 3.0.0` passes without it"
  - "Rehearsal took the accepted-unscored path from 72-01: no run state: unscored"

requirements-completed: [INST-05]

duration: 9min
completed: 2026-10-08
tokens_input: 15700267
tokens_output: 59829
tokens_cache_read: 15532510
tokens_cache_write: 167525
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 18: Build and validate the 3.0.0 release artifacts Summary

**AOForge 3.0.0 is versioned, changelogged and validated without a live step, and the user's own upgrade (runtime
migration, `.planning/` to `.aoforge/` in one hook commit, config key, global block and outside-block diff) was
rehearsed end to end on a scratch clone with a fake HOME.**

Estimate (`estimate trd 72-18`, recorded at start): 10 min (P90 19 min), $3.56 (P90 $5.76), 3 tasks, confidence
medium. Measured: 9 min.

## Progress
- [x] Task 1: Versions and the CHANGELOG 3.0.0 entry — d11aea36
- [x] Task 2: Validation without live steps — 5d10c7c5
- [x] Task 3: Rehearse the user's upgrade on a scratch clone — f187d3bc

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-09T03:34:01Z
- **Completed:** 2026-10-09T03:43Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- All release manifests at 3.0.0 and every marketplace entry equal to its plugin.json (7 of 7).
- CHANGELOG 3.0.0 leads with the rename and links the migration guide; header and past entries untouched.
- Every validation that needs no live step passes (two suite failures are the known baselines, both cleared).
- The rehearsal reproduced each step of the user's upgrade on copies, and the real home and checkout were not touched.

## Task 1: versions and CHANGELOG

| File | Before | After |
|---|---|---|
| package.json, package-lock.json (root + `packages[""]`) | 2.15.0 / 2.0.1 | 3.0.0 |
| plugins/aoforge plugin.json, marketplace top level + `aoforge` | 2.15.0 | 3.0.0 |
| plugins/devflow plugin.json + `devflow` entry (pointer) | 3.0.0 | 3.0.0 (unchanged, >= POINTER_MAJOR 3) |
| social-media-generator | 1.3.0 | 1.3.1 |
| aosentry-mcp, eden-ui-flutter, eden-ui-web | 1.0.0 | 1.0.1 |
| monorepo-standards | 0.1.0 | 0.1.1 |

Every sibling changed in objective 72 (`git diff --stat bf12644a^..HEAD -- plugins/<name>`: plugin.json homepage and
repository URLs in all five, plus skill and template text in four).

`aof-tools changelog check 3.0.0` → `{"ok": true, "version": "3.0.0", "present": true}`. `git diff --numstat` on
CHANGELOG.md: `56 0`. release.yml's awk extraction of `## [3.0.0]` yields 213 lines, starting with the lead paragraph.
`node scripts/gen-docs-data.cjs` → `site/data/aoforge.json v3.0.0 skills=34 agents=13 hooks=23 workflows=41
references=37 templates=31 dfToolsCommands=83`.

## Task 2: validation without live steps

| Check | Result line |
|---|---|
| Full suite (`node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`) | tests 11941, pass 11904, fail 2, skipped 35. E2E1 is the baseline: after `roadmap update-job-progress 72` it passes (1/1). merge-driver-cli test 16 hit `ENOTEMPTY` in its temp-dir cleanup (the known flake); the file alone is 13/13. |
| `npm test` | not run: the dispatch excludes micro.test.cjs, and `npm test` includes it |
| `claude plugin validate plugins/aoforge` | exit 0, passed with warnings (22 unquoted `${CLAUDE_PLUGIN_ROOT}` hook commands, `statusLine` unknown field; both unchanged since 2.15.0) |
| `claude plugin validate plugins/devflow` | exit 0, passed (README install-line advice, deliberate per 72-14) |
| `claude plugin validate` social-media-generator, aosentry-mcp, eden-ui-flutter, eden-ui-web | exit 0, passed |
| `claude plugin validate plugins/monorepo-standards` | exit 0, passed with warnings (one unquoted `${CLAUDE_PLUGIN_ROOT}`, pre-existing) |
| `claude plugin validate .` | exit 0, passed with warnings (pointer README install-line advice) |
| `node scripts/gen-pointer-skills.cjs --check` | `gen-pointer-skills: 34 pointer skills match plugins/aoforge/skills`, exit 0 |
| rename guard, doc-refs gate, changelog, aoforge-rename, changelog-on-tag and pointer-notice tests | 130/130 pass |
| Installed gate (`~/.claude/plugins/cache/aocyber/devflow/2.15.0/hooks/changelog-on-tag.js`), `git tag -a v3.0.0 -m x HEAD` | no output (allowed). Negative control `v3.0.1`: deny "CHANGELOG.md has no entry for v3.0.1". The repo copy (`plugins/aoforge/hooks/changelog-on-tag.js`) also allows v3.0.0. |
| `aoforge-rename.cjs --rules names --inventory \| tail -1` | `unclassified=0` |
| `aoforge-rename.cjs --rules planning --inventory \| tail -1` | `unclassified=0` |

Remaining rename actions (from the dry runs, which list the files): **names** moves=0, rewrites=41 files, 102 lines,
all deliberate legacy identities the guard allows: the pointer plugin (`plugins/devflow/**`: plugin.json, README,
pointer-notice.js, 34 forwarding skills), `scripts/gen-pointer-skills.cjs`, the marketplace pointer entry, the
package.json test glob `plugins/devflow/**/*.test.js`, and `.gitignore` legacy lines (`.devflow-handoff/`,
`.devflow-notices.json`). Residuals: the `plugins/devflow` move (target exists, by design) and two monorepo-doctor
skip-list lines (manual, already carry both names). **planning** rewrites=1 file (`.gitignore`: the 13 legacy
`.planning/` lines kept beside their `.aoforge/` twins for one release). The inventory's raw counts (names 31 rename
tokens / 237 occurrences, planning 14 / 37) include these and the guard's ALLOW and ignore-region spans.

## Task 3: rehearsal (scratch clone, fake HOME)

Setup: `git clone --no-hardlinks` of HEAD 5d10c7c5 into the session scratchpad (clean tree, `.planning/` and the
`devflow{version 2.15.0}` stamp); local identity, `commit.gpgsign false`, push URL set to a dead path. Fake HOME seeded
with `rsync -a --exclude backups ~/.claude/devflow/`, a copy of `~/.claude/CLAUDE.md` and of
`~/.claude/plugins/installed_plugins.json`.

| Step | Outcome |
|---|---|
| 1. Clone | clean, `.planning/` present, `.aoforge/` absent, legacy stamp `devflow{2.15.0}` |
| 2. Fake HOME | seeded (backups excluded) |
| 3. `sync-runtime.js` | `[aoforge] runtime synced to ~/.claude/aoforge (v3.0.0)`; `.plugin-version` = 3.0.0; `.legacy-state-migrated.json` copied 42, moved 4 (the outbox journal files), skipped 0. **Run state: no run state: unscored** (72-01 records `run_state: unscored (accepted: unscored)`). The wave-start file `state/estimates/devflow-claude-d3dccfe9.json` was copied and is byte-identical. The global block moved v3 to v4 with a backup (`backups/global-<ts>`); only lines inside the block changed. |
| 4. `upgrade-project.js` | background commit `fd1f40d6 chore(aoforge): upgrade project to v3.0.0` after 1 s. `git log -1 --name-status`: 1403 `R` entries `.planning/*` → `.aoforge/*` and nothing else (R092 `config.json`, R099 `STATE.md`). No `.gitignore` change: every `.planning/` ignore line already has its `.aoforge/` twin. `.aoforge/config.json`: `aoforge{version 3.0.0, migrations_applied 0001,0004,0007,0009,0012,0013}`, no `devflow{}` key. Tree clean afterwards. `validate health --raw`: 0 errors, W066/W067 absent (only 3 x W006 for roadmap-only objectives 73 to 75, unrelated). `upgrade --check`: up to date. Project `doctor`: check 27 ok ("uses .aoforge/ and the aoforge config key"). |
| 5. `upgrade --global` (dry run) | block `none` (step 3 had moved it), outside diff 2 lines (the TDD & Quality paragraph's two DevFlow mentions), `applied: false`, file sha256 unchanged. On an untouched copy of the original file: block `updated` 3 → 4, outside 2 lines, applied false, file unchanged. |
| 6. `doctor --global --json` | status degraded, 0 errors, 7 ok, 3 warn: `legacy-plugin-runtime` (devflow@aocyber 2.15.0 enabled beside AOForge, and the leftover old home that cannot move while it is enabled), plus `runtime-mirror` and `hooks-registry` (no aoforge@aocyber in the copied installed_plugins.json, expected before install). No contract errors. |

Real environment after the rehearsal: `~/.claude/CLAUDE.md` sha256 `7b13acac…` and installed_plugins.json `5fb38c33…`
unchanged; no `~/.claude/aoforge` or `~/.aoforge`; the real `~/.claude/devflow/state/outbox/` still holds its 4 files;
this checkout's HEAD and `git status --porcelain` (the 9 pre-existing untracked `.gitkeep`s) unchanged. Scratch
directories deleted.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Versions and CHANGELOG | `node -e "for (const f of [...]) console.log(f, require('./'+f).version)" && node plugins/aoforge/aoforge/bin/aof-tools.cjs changelog check 3.0.0` | 0 (four x 3.0.0, `present: true`) | PASS |
| 2: Validation | `claude plugin validate . && node scripts/gen-pointer-skills.cjs --check` | 0 | PASS |
| 3: Rehearsal | `git -C /Users/justin/dev/devflow-claude status --porcelain` (unchanged: 9 untracked .gitkeep) + evidence above | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` | 1 (2 baseline failures: E2E1, cleared by `roadmap update-job-progress` and passing on re-run; merge-driver test 16 temp-dir flake, 13/13 alone) | PASS (baseline) |
| build | `claude plugin validate .` | 0 | PASS |

## Deviations from Plan

None that changed code. Three points differ from the TRD's wording; the first two are recorded as decisions:

- The `[Unreleased]` heading was kept (empty) above `## [3.0.0]` instead of being renamed, as in the 2.14.0 and 2.15.0
  promotions. The done criterion ("adds only the 3.0.0 heading and lead section") holds: 56 additions, 0 deletions.
- `social-media-generator` was patch-bumped although the frontmatter list omits it: the action says "for each sibling
  plugin", and it changed in objective 72.
- Step 5 of the rehearsal expected `upgrade --global` to print the block change. The SessionStart mirror (step 3)
  had already moved the block, so the dry run in the migrated home reports `none`; a second dry run on an untouched
  copy shows the `3 → 4` block change. Both left the file unchanged.

## Issues Encountered

- One known temp-dir flake (merge-driver-cli test 16, `ENOTEMPTY` on cleanup) in the full run; it passes alone.

## Hand-off

- **72-19 / 72-20 (go):** every pre-live check is green. At tag time the installed 2.15.0 `changelog-on-tag` checks
  `plugins/devflow/.claude-plugin/plugin.json` (the pointer, 3.0.0) and the marketplace `devflow` entry; the repo copy
  checks `plugins/aoforge`. Both allow `v3.0.0` on this tree. release.yml's extraction of `## [3.0.0]` is 213 lines.
- **72-21 (dogfood):** the rehearsal used a clean clone. This checkout has 9 untracked `.gitkeep`s under
  `.planning/objectives/`; per the 72-08 hand-off they make the hook leave the move staged instead of committing it.
  Commit or remove them first. The hook's notice says "committed … (2 files)" while the commit carries all 1403
  renames: `changed_files` lists only the content changes (config.json, STATE.md). Cosmetic.
- **72-22 (active docs):** 0007 rewrites 7 STATE.md lines in place (objective 37 line, four TRD notes, two quick-task
  rows). STATE.md has no `## Session Log` heading (it has `## Session Continuity`), so 0007 appends no note there.
- **72-23 (global CLAUDE.md):** on a copy of the real file the outside-block diff is exactly two lines, both in the
  "TDD & Quality" section (`DevFlow's intent model`, `DevFlow's (kind, work) defaults table` plus its
  `~/.claude/devflow/references/` path). The "DevFlow Routing" heading is inside the block and moves with it.
- **72-21 / 72-15:** on the copied state, `doctor --global` reports exactly the expected leftovers (old plugin enabled,
  old home left over) and no errors.
- `claude plugin validate` still warns about unquoted `${CLAUDE_PLUGIN_ROOT}` in hooks.json (aoforge 22,
  monorepo-standards 1). The 2.15.0 hooks have the same form. Quoting them is a separate, low-risk follow-up.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4. Versions in step, siblings bumped. CHANGELOG 3.0.0 leads with the rename and links the
  guide, header and past entries byte-identical, `changelog check` passes. Validation green without a live step. The
  rehearsal shows the mirror, the unscored run-state path, the one-commit move with the config key, no W066/W067, and
  the outside-block diff without a write.
- Gate failures: none beyond the baselines (E2E1 cleared; one temp-dir flake that passes alone).

## Self-Check: PASSED

- FOUND: CHANGELOG.md (`## [3.0.0]` at line 9, migration guide link at line 13), package.json, package-lock.json,
  plugins/aoforge/.claude-plugin/plugin.json (`"version": "3.0.0"`), .claude-plugin/marketplace.json,
  site/data/aoforge.json, docs/MIGRATING-TO-AOFORGE.md
- FOUND commits: d11aea36, 5d10c7c5, f187d3bc
