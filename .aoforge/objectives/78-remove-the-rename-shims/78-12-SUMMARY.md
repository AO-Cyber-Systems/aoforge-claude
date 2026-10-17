---
objective: 78-remove-the-rename-shims
trd: "12"
subsystem: rename-shims
tags: [rename-shims, compat, legacy-names, docs, close-out, SC-1, SC-2, SC-3, SC-4, SC-5]
requires: [78-01, 78-02, 78-03, 78-04, 78-05, 78-06, 78-07, 78-08, 78-09, 78-10, 78-11]
provides:
  - "compat.cjs with no shim and no legacy-names import (the env alias deleted)"
  - "legacy-names.cjs: SHIM_REMOVAL = '3.1.0', LEGACY.commandDash removed, a consumer test for every LEGACY key"
  - "old-layout.legacy.test.cjs: SC-4 end to end (hooks, next prompt, CLI, reporters, retired migrations, nothing created)"
  - "docs/MIGRATING-TO-AOFORGE.md (and site mirror): What 3.1.0 removed, What 3.1 still reports, Upgrading from 2.x"
affects: [main-reconcile, release-3.1.0]
tech-stack:
  added: []
  patterns:
    - "A removed name is guarded by an absence test that builds the name from parts, so a search for it finds no code"
    - "Every LEGACY key needs a reader: direct access, destructuring, or legacy-rewrite's shared-key loop"
key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/old-layout.legacy.test.cjs
  modified:
    - plugins/aoforge/aoforge/bin/lib/compat.cjs
    - plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs
    - plugins/aoforge/aoforge/bin/lib/legacy-names.cjs
    - plugins/aoforge/aoforge/bin/lib/legacy-names.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/legacy-rewrite.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/README.md
    - docs/MIGRATING-TO-AOFORGE.md
    - site/content/docs/getting-started/migrating-to-aoforge.md
    - docs/USER-GUIDE.md
    - CHANGELOG.md
    - CLAUDE.md
    - scripts/gen-docs-data.cjs
decisions:
  - "aliasLegacyEnv: REMOVE; compat.cjs holds its three current names itself and requires nothing from legacy-names (a test pins them equal to NAMES)"
  - "SHIM_REMOVAL = '3.1.0'; LEGACY.commandDash REMOVE (no reader); commandNsShort, notices, pagesProject KEEP (each has a reader)"
  - "The first-generation <!-- df:state --> sticky-comment reader: KEEP (predates the rename, rewrites its own input on the next sync, gh rebrand does not convert it)"
  - "The .gitignore legacy lines and their rename-guard ALLOW entry: KEEP until main is reconciled with 3.1"
  - "site/data/aoforge.json not regenerated (the TRD forbids editing site/data; the docs build regenerates it); .aoforge/STACK.md not edited (executor rule); proposals listed"
requirements-completed: [SC-1, SC-2, SC-3, SC-4, SC-5]
metrics:
  duration: 25min
  completed: 2026-10-16
  tasks: 3
  files: 54
status: complete
tokens_input: 52161913
tokens_output: 154991
tokens_cache_read: 51735259
tokens_cache_write: 426300
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 78 TRD 12: Close-out — the last shim, the name map, the old-layout contract, the docs, the full suite Summary

**The environment alias is deleted and compat.cjs no longer imports legacy-names; SHIM_REMOVAL is 3.1.0 and every remaining LEGACY key has a reader; one end-to-end test proves a pre-rename project gets two notices, a refusal, a broken W066, a doctor note and the retired-migration line while nothing is created; and the migration guide, USER-GUIDE, CHANGELOG and CLAUDE.md now say the shims are gone and how to upgrade from 2.x.**

## Progress
- [x] Task 1: RED + GREEN — last shim, name map, SC-4 end to end — RED 25dcd014, GREEN b26635e5
- [x] Refactor: the stale "or a legacy one" planning-directory comments and the 0012/0014-user comments handed over by 78-07/78-08/78-11 — 8d9b81ac
- [x] Task 2: Docs — guide (+ site mirror), USER-GUIDE, CHANGELOG, CLAUDE.md, doctor-checks README, gen-docs-data — c85837b6
- [x] Task 3: Full suite and the decisions roll-up — 92539825 (the one regression the suite found)

## What changed

- **compat.cjs** (Task 1): `aliasLegacyEnv`, its export and header entry are gone, and so is the `require('./legacy-names.cjs')`. The three current names it needs (the planning directory, the agent namespace, the runtime directory) are module constants; `compat.legacy.test.cjs` 16c pins them equal to `NAMES`, 16b forbids the require and any `LEGACY`, and 11 lists the alias among the deleted exports. The alias's cases 5-8 and the now-unused `legacyEnv` fixture were deleted.
- **legacy-names.cjs** (Task 1): `SHIM_REMOVAL = '3.1.0'` with the TRD's comment; `LEGACY.commandDash` removed (no reader since 78-02); the header lists the remaining consumer groups (detectors, the converter, history readers, PRESERVE, the rename guard and codemod). New test 6 fails on any `LEGACY` key with no reader under `plugins/aoforge` or `scripts` (direct `LEGACY.<key>` / `LEGACY['<key>']`, a destructuring, or legacy-rewrite's shared-key loop for the keys NAMES also has).
- **rename-guard.repo.test.cjs** (Task 1): the ALLOW reasons describe the 3.1 roles (`*.legacy.test.*`, `__fixtures__/legacy-*`, `legacy-names.cjs`, and `.gitignore`, which stays until `main` is reconciled).
- **old-layout.legacy.test.cjs** (Task 1, new): SC-4 end to end on one hand-built project with only the pre-rename planning directory, the pre-rename stamp key in its config and `<legacy prefix>SKIP_UPGRADE=1` in the environment (the variable that would have made upgrade-project skip while the alias existed): (a) upgrade-project queues exactly one global notice carrying `legacyLayoutMessage(root)`; (b) coexistence-guard queues exactly one notice naming the variable and its `AOFORGE_*` form; (c) route-results emits both once and a second prompt emits nothing; (d) `state update-progress` and `init plan-objective 1` exit 1 with the message; (e) `validate health --raw` is broken with the one W066 and its fix, `doctor --json` resolves no project and carries the note; (f) `upgrade --apply --only 0012|0013|0014` in an `.aoforge/` scratch project gives the retired line and writes nothing; (g) no `.aoforge/` anywhere under the project, its legacy directory byte-identical, `git status` unchanged.
- **compat-entry.repo.test.cjs**: the alias name is built from parts, so `rg aliasLegacyEnv plugins/aoforge scripts` finds nothing while the test still forbids it in every entry point.
- **Comments** (refactor): 32 "`.aoforge/`, or a legacy one" comments (the 78-11 list, plus config.cjs, micro.cjs, doctor checks 20/21) now name `.aoforge/` alone; `legacy-rewrite.cjs` and its test header name gh rebrand as its only user; `upgrade-cli.cjs`, migrations 0008 and 0010 call 0012 "3.0.x's"; two closure comments in `sync-runtime.test.js` and `statusline-estimate.test.js` no longer say compat reads legacy-names.
- **Docs** (Task 2): see "Docs" below.

## Docs

- `docs/MIGRATING-TO-AOFORGE.md` and its site mirror (front matter unchanged, body identical): the intro says 3.1.0 removed the one-release shims; "What keeps working until the next release" became **What 3.1.0 removed** (each item, past tense) and **What 3.1 still reports** (W066/W067/W069, the CLI refusal, the SessionStart notices, the global CLAUDE.md notice, checks 15/16/17/27, the un-rebranded-repository refusal and `gh setup`'s PR-template refusal, the 3.0.0 daemon refusal, the `.mcp.json` report); new **Upgrading from 2.x** (Option A: clone the `v3.0.0` tag, add it as the marketplace, follow the 3.0.0 checklist; Option B: the manual steps per project and per machine); the 3.0.0 sections are kept as **The 3.0.0 checklist** with a note on which steps need 3.0.x; **Check it** rewritten for 3.1; the GitHub section says `gh rebrand` is required now and how a 3.1 flush halts; **Removed in 3.1.0** replaces "Removing the shims".
- `docs/USER-GUIDE.md`: the "Renamed to AOForge (3.0.0)" section rewritten (the name map, compat's single layout, the legacy-layout surfaces, `~/.aoforge/`, runtime state, command forms, the coexistence notice, the doctor table for checks 15/16/17/27/26 with the per-check decisions, GitHub artefacts, adopt and the daemon, `.mcp.json` and todos); the doctor command row; adopt refusal rules; the 0007/0012/0013/0014 migration rows and notes; deferred migrations; the global upgrade; "Health checks for the legacy layout (W066, W067, W069)"; troubleshooting for 2.x; the recovery row; the gate-edits, verify-commits, gate-executor-stop and coexistence-guard hook rows; the `df:state` note; the rebrand section (required, the refusal text, flushing under 3.1, the backfill).
- `CHANGELOG.md` `[Unreleased]`: ten `### Changed` entries and one `### Removed` entry (each removal with its TRD, plus what was kept on purpose), including the W069/W068 reconcile note. No version bump, no promoted section, no tag.
- `CLAUDE.md`: Validation (W066/W067/W069), Upgrade (retired 0012/0013/0014, `--global`), Doctor (15/16 report-only, 17 keeps its fix, 27), "Rename leftovers" (replaces "Rename shims"), sync-runtime, coexistence-guard, verify-commits, gate-edits, gate-executor-stop, Marketplace (no pointer plugin), "Where we left off" (the old runtime home on this machine, objective 78 complete, the `main` reconcile notes) and "Still deferred". No legacy spelling, no ignore region.
- `doctor-checks/README.md`: checks 15/16 report-only, 17 keeps its fix, 27 owns W066/W067/W069; `legacyMirrorDir` comes from `coexistence.legacyRuntimeHome`.
- `scripts/gen-docs-data.cjs`: the coexistence-guard description names all four leftovers.

## Objective-wide decisions (78-01 to 78-12)

| Item | Decision | Reason | TRD |
|---|---|---|---|
| Doctor check 27 `legacy-planning-layout` | KEEP, report-only (W066 both, W067, W069; no `fix_command`) | The old layout is exactly what SC-4 must name; detection reads two directories and two files | 78-01 |
| validate W066 | KEEP: legacy-only is the one broken result (Check 0, read-only, `--repair` writes nothing); both directories stays a warning | After 78-11 nothing else can read such a project | 78-01 |
| validate W067 | KEEP, also with both keys (fix: delete the pre-rename key) | 3.1 never merges or removes the pre-rename key | 78-01 |
| W069 `legacy-claude-md-block` | ADD (validate Check 23, doctor 27, check 22 defers) | 78-08 stops reading the pre-rename markers | 78-01 |
| W069 code | W069, not W068 | `main` already uses W068 and migration 0015 | 78-01 |
| Pointer plugin, its marketplace entry, generator, test glob, four ALLOW entries | REMOVE | One-release by design; an old command form runs nowhere | 78-02 |
| doc-refs `NAMESPACE_RENAMES` and the dash form; 0007's rewrite of old forms | REMOVE | Declared one-release by 72-13; an automatic conversion of pre-rename text is 3.0.x's job | 78-02 |
| `LEGACY_AGENT_EXEMPT` (44-08 agent-path gate) | KEEP | About pre-plugin agent locations, not the rename | 78-02 |
| coexistence's pointer-version handling | KEEP | Installed pointer copies stay on users' machines | 78-02 |
| gh-body/gh-trd/gh-cache pre-rename markers; second status context | REMOVE | Dual-namespace readers were one-release shims | 78-03 |
| `gh rebrand` | KEEP (now required) | A repository's labels, markers, wiki, rulesets and caller cannot be fixed by a local `git mv`; it reads old names only to rewrite them, and it is the fix every 3.1 GitHub message names | 78-03 |
| checks-pin pre-rename caller (W062 `legacy: true`) | KEEP, detector | Reports only; its fix is the kept converter | 78-03 |
| gh-setup PR template holding the pre-rename block | Refuse, fix `gh rebrand --apply` | Appending would leave two blocks | 78-03 |
| `.mcp.json` pre-rename owner key | REMOVE the read, ADD a one-line report (`warnings`) | The entry would silently stop refreshing | 78-04 |
| Todo metadata pre-rename key | REMOVE | Only a months-old session writes it; the cost is one unsynced todo | 78-04 |
| Adopt pre-rename branch and marker | REMOVE, no detector | A one-shot bootstrap restarts on `aoforge/adopt`; nothing is lost | 78-04 |
| 0010's pre-rename block slug | REMOVE, no detector | Only a legacy-layout project can carry it, and that is refused first | 78-04 |
| 3.0.0 daemon pid/log readers, `ELEGACYDAEMON` | REMOVE; ADD `interimDaemon()` detector (start refuses, status warns) | Without a detector a second daemon would start beside a live 3.0.0 one | 78-05 |
| Doctor check 15 `legacy-df-install` | KEEP, report-only | The move stays in the objective-36 global upgrade | 78-06 |
| Doctor check 16 `legacy-plugin-runtime` | KEEP, report-only | Each leftover needs one report; the conversions belong to 3.0.x or the manual steps | 78-06 |
| Doctor check 17 `user-dot-dir` | KEEP WITH its fix | 3.0.0 wrote those files under the AOForge name; no 3.0.x release moves them | 78-06 |
| sync-runtime runtime-state migration | REMOVE | Automatic conversion of pre-rename state is 3.0.x's job | 78-06 |
| coexistence-guard + coexistence.cjs | KEEP, extended to four global leftovers in one notice | They only report | 78-06 |
| Migrations 0012 and 0013 | REMOVE (user decision), ids reserved (`RETIRED_MIGRATIONS`) | `--only` names the 3.0.x path instead of "unknown migration id" | 78-07 |
| Runner's generic `deferred` path; the hook's HEAD-only commit handling | KEEP | They name no legacy name and serve any migration | 78-07 |
| Stamp writer and the pre-rename key | No longer removes it | 3.1 touches old names only to report them; W067 names the fix | 78-07 |
| CLI guard scope | Planning-tree writes and `init` refuse; doctor/validate report; runtime-home, git-config and outside-tree commands run (`tokens` guarded) | Each exemption carries its reason in the module | 78-07 |
| Migration 0014 | REMOVE, id reserved | Automatic conversion of pre-rename text; W069 names the two-marker manual fix | 78-08 |
| Global upgrade's pre-rename block move and outside-text rewrite | REMOVE; detector plus one notice | Same reason | 78-08 |
| `legacy-rewrite.cjs` | KEEP | Its only consumer is gh rebrand | 78-08 |
| Label twins (`labelForms`, `unionByNumber`, `legacyLabel`) | REMOVE; ADD the "is this repository rebranded" check | Without it an un-rebranded repository would get duplicate issues | 78-09 |
| The env alias calls (CLI, watch daemon, every hook) | REMOVE | One-release shim | 78-10 |
| compat planning fallback, agent namespace, user-file fallbacks, four legacy-only exports | REMOVE | One-release shims | 78-11 |
| compat.cjs name and surviving signatures | KEEP | ~80 importers; renaming only multiplies conflicts with `main` | 78-11 |
| session-audit's two-namespace matcher | KEEP (history reader) | Pre-72 transcripts use the old names | 78-11 |
| benchmark and token-usage | `.aoforge/` paths only | Single-name decision; pre-72 history under the old directory no longer counts there | 78-11 |
| `aliasLegacyEnv` and the legacy-names import in compat.cjs | REMOVE | SC-1; compat holds its three current names and a test pins them to NAMES | 78-12 |
| `SHIM_REMOVAL` | `'3.1.0'` | The release that removed the shims | 78-12 |
| `LEGACY.commandDash` | REMOVE | No reader since 78-02 | 78-12 |
| `LEGACY.commandNsShort`, `notices`, `pagesProject` | KEEP | commandNsShort is fed in by doc-refs.legacy.test to prove the form is ignored; notices and pagesProject are shared keys gh rebrand's rewrite maps | 78-12 |
| First-generation `<!-- df:state -->` sticky-comment reader | KEEP | Objective 46's marker, older than the rename and not a guarded name; it rewrites its own input with the `aoforge` marker on the next sync; gh rebrand does not convert it, so removing it would duplicate sticky comments | 78-12 |
| `.gitignore` legacy lines and their ALLOW entry | KEEP until the `main` reconcile | `main` still uses the pre-rename planning directory | 78-12 |
| `legacyEnv` fixture | REMOVE | Its only user was the alias's cases | 78-12 |
| Design-history docs (`docs/handoff-watcher-guide.md`, `docs/PROPOSAL-*.md`) | Unchanged | They are history under the codemod's docs-history SKIP, never rewritten | 78-12 |

No two SUMMARY decision tables disagree.

## Notes for reconciling `main`

- `main` keeps its planning tree in the pre-rename directory. Before any 3.1 tool runs there, `git mv` it to `.aoforge/` and rename the config stamp key (3.1 refuses that layout and does not convert it). Then the legacy `.gitignore` lines, and the rename guard's `.gitignore` ALLOW entry, can go.
- W069 was chosen because `main` uses W068 (and migration 0015); confirm W069 is still free on `main`.
- `awareness.test.cjs` G2 allows the legacy `.gitignore` twin only until that reconcile (78-11).

## 78-12 hand-off ledger (every item handed to 78-12)

| From | Item | Outcome |
|---|---|---|
| 78-01 | doctor-checks/README check 27 still names `--only 0012/0013` | Done (c85837b6) |
| 78-01 | W069 vs `main`'s W068 | Recorded: CHANGELOG, CLAUDE.md, this SUMMARY |
| 78-02 | CLAUDE.md Marketplace (pointer plugin, gen-pointer-skills) | Done (c85837b6) |
| 78-02 | USER-GUIDE `gen-pointer-skills --write` | Done (the paragraph is gone) |
| 78-02 | `.aoforge/STACK.md` Layout names the pre-rename plugin directory and CLI | NOT done: the executor never writes STACK.md (the user adopts proposals). Proposal below |
| 78-02/78-06 | `scripts/gen-docs-data.cjs` coexistence-guard description | Done (c85837b6) |
| 78-02/78-06 | Regenerated docs data | NOT done: the TRD forbids touching `site/data/`; `docs.yml` regenerates `site/data/aoforge.json` at build |
| 78-03 | Ruleset requiring pre-rename contexts blocks PRs; gh setup PR-template refusal | Documented (guide, USER-GUIDE, CHANGELOG) |
| 78-03/78-09 | `<!-- df:state -->` acceptance | Decided KEEP (table above), documented |
| 78-04 | USER-GUIDE adopt lines; guide line 76; `.mcp.json` report; CHANGELOG for four removals | Done |
| 78-05 | Guide/site `ELEGACYDAEMON`; USER-GUIDE daemon lines; CLAUDE.md watchStateDir clause; document the start refusal | Done |
| 78-05 | `handoff-fixtures.cjs` writePidFile comment | Already done by 78-11 |
| 78-06 | README 15/16/17; CLAUDE.md sync-runtime and doctor; guide 15/16 rows and the clean-up step; USER-GUIDE; CHANGELOG | Done (the 3.0.0 clean-up step stays inside "The 3.0.0 checklist", marked as needing 3.0.x) |
| 78-07 | Docs for retired 0012/0013, the CLI refusal, the hook notice, the retired line | Done |
| 78-07 | Comments naming 0012: upgrade-cli.cjs:162, 0008:8, 0010:51-59/95, README | Done (8d9b81ac, c85837b6); 0010:92 was already accurate |
| 78-08 | `legacy-rewrite.cjs` header and its test header | Done (8d9b81ac) |
| 78-08 | CLAUDE.md Upgrade (0014, `--global`, `outside_diff`); USER-GUIDE line 392; guide and site | Done |
| 78-09 | Docs for the un-rebranded-repository refusal; CLAUDE.md gh-body/label lines | Done |
| 78-10/78-11 | Delete `aliasLegacyEnv`, cases 5-8, test 16b's exception, the LEGACY import | Done (b26635e5), and compat no longer requires legacy-names at all |
| 78-10 | CLAUDE.md compat bullet; USER-GUIDE line 35 | Done |
| 78-10 | `docs/handoff-watcher-guide.md`, `docs/PROPOSAL-handoff-watcher.md`, `docs/PROPOSAL-github-system-of-record.md` | Left as design history (docs-history SKIP; the watcher guide predates the rename throughout) |
| 78-11 | ~30 "or a legacy one" comments incl. hooks/gate-executor-stop.js:80 | Done (8d9b81ac), 32 comments |
| 78-11 | CLAUDE.md compat bullet and gate lines | Done |
| 78-11 | Note: benchmark and token-usage count `.aoforge/` only | Documented (USER-GUIDE, CLAUDE.md, CHANGELOG, guide) |

**Proposed `.aoforge/STACK.md` Layout edits for the user** (not applied): `id`/title `aoforge-claude`; "The plugin lives in `plugins/aoforge/`. `aoforge/bin/aof-tools.cjs` is the CLI; its internals are CommonJS modules in `aoforge/bin/lib/*.cjs` ... call the `~/.claude/aoforge` MIRROR"; fixtures under `aoforge/bin/lib/__fixtures__/`; the test command `node --test 'plugins/aoforge/**/*.test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] compat.cjs comment tripped its own source guard**
- **Found during:** Task 1 GREEN
- **Issue:** a comment spelling the dotted NAMES key of the planning directory contains the legacy directory's spelling, so test 16 failed.
- **Fix:** the comment names the keys without dotted access.
- **Commit:** b26635e5

**2. [Rule 2 - Missing] The alias's absence was unsearchable by the TRD's own verification**
- **Issue:** the TRD verifies `rg -n "aliasLegacyEnv" plugins/aoforge scripts` finds nothing, but `compat-entry.repo.test.cjs` (78-10) spelled the name to forbid it.
- **Fix:** both absence tests build the name from parts. compat-entry.repo.test.cjs is outside files_modified; behaviour unchanged.
- **Commit:** b26635e5

**3. [Rule 1 - Bug] Two closure comments became false**
- `sync-runtime.test.js` and `statusline-estimate.test.js` said compat reads legacy-names; corrected (comments only).
- **Commit:** b26635e5

**4. The TRD's mirror check is vacuous on macOS**
- `diff <(sed '1,/^---$/d' site | sed '1,/^---$/d') <(sed '1,/^# Migrating/d' guide)` compares two empty streams under BSD sed (a second `1,/re/` range with no later match deletes to the end; the title is on line 1). The bodies were compared with a script instead: site body (after its front matter) and guide body (after the title) are identical, 444 lines each.

**5. Comment refactor beyond the 78-11 list**
- config.cjs:78, micro.cjs:491 and doctor checks 20/21 carried the same "legacy one" wording; fixed with the list. Comment-only; every touched file passes `node --check` and its suites.
- **Commit:** 8d9b81ac

**6. `.aoforge/STACK.md` and `site/data/aoforge.json` not edited**
- Both were in the orchestrator's highlights. The executor rules forbid writing STACK.md (proposal above), and the TRD forbids touching `site/data/` (regenerated by the docs build).

**7. [Rule 1 - Bug] The new CLAUDE.md text broke `dispatch-completeness.test.cjs`**
- **Found during:** Task 3 (first full-suite run)
- **Issue:** that test reads the first word of every backtick span in the Core Tool bullets as an `aof-tools` command; the new Validation, Upgrade, Doctor and Rename bullets put `main`, `deferred`, `mv` and `aoforge-watch start` in backticks.
- **Fix:** the text was reworded (the test unchanged, per the TRD's "fix the text, not the test").
- **Commit:** 92539825

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED (25dcd014) | `node --test old-layout.legacy.test.cjs compat.legacy.test.cjs legacy-names.legacy.test.cjs` | 1 (case 1 a-g green as the regression contract; compat 11 and 16b, legacy-names 2, 3, 4 and 6 red for the right reasons: alias still exported, legacy-names still required, commandDash present, SHIM_REMOVAL the old string) | PASS (fails correctly) |
| 1: GREEN (b26635e5) | `node --test old-layout.legacy.test.cjs compat.legacy.test.cjs legacy-names.legacy.test.cjs rename-guard.repo.test.cjs compat-entry.repo.test.cjs` (+ sync-runtime, statusline-estimate, compat.home) | 0 (62/62 for the first four; 171 with the rest) | PASS |
| 1: no shim left | `rg -n "aliasLegacyEnv" plugins/aoforge scripts` | 1 (no match) | PASS |
| 1: guard mutation | scratch script appends one legacy product word to compat.cjs, runs rename-guard test 2, restores the file byte for byte | test 2 fails naming `compat.cjs:262 DevFlow`; file restored (Buffer.compare 0) | PASS |
| Refactor (8d9b81ac) | `node --check` on all 37 changed JS files; `node --test legacy-rewrite.legacy upgrade-cli 0010 0008 gate-executor-stop rename-guard doc-refs` | 0 / 0 (221/221) | PASS |
| 2: docs (c85837b6) | `node --test rename-guard.repo doc-refs.repo builtin-sweep.repo rg-flag-guard` | 0 (54/54 and 16/16) | PASS |
| 2: mirror | body comparison script (site after front matter vs guide after title) | identical, 444 lines each | PASS |
| 2: key link | `rg -n "Upgrading from 2.x" docs/MIGRATING-TO-AOFORGE.md` | 0 (heading at line 138) | PASS |
| 3: full suite | npm test globs via `git ls-files -co --exclude-standard` minus `watcher-shell.test.cjs`, 393 files, one `node --test` | 1: 12607 tests, 12555 pass, 2 fail (known), 50 skipped, 0 cancelled | PASS (no new failures) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (25dcd014) | `node --test old-layout.legacy.test.cjs compat.legacy.test.cjs legacy-names.legacy.test.cjs` | 1 | FAIL (correct): cases 2-3 red, case 1 green as designed |
| GREEN (b26635e5) | the Task 1 verify set | 0 | PASS (correct) |
| REFACTOR (8d9b81ac) | suites of every file whose comments changed | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (full) | `npm test` globs minus `plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs` (393 files) | 1 | PASS with known noise: 12607 tests, 12555 pass, 2 fail, 50 skipped, 0 cancelled |
| rename guard | `node --test rename-guard.repo.test.cjs` | 0 (20/20) | PASS |
| doc gates | `doc-refs.repo`, `builtin-sweep.repo`, `rg-flag-guard`, `dispatch-completeness` | 0 | PASS |

**Excluded:** `plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs` (its W-3 fish-shell test hangs to timeout on this machine). `micro.test.cjs` did not hang and ran. **The 2 failures are the known pre-existing noise:** `requirements-agreement.repo.test.cjs` 11 and `validate-requirements.test.cjs` 9, both the repository's own W065 finding (objective 75's EST-11 not in requirements-completed), shown failing at the wave base by 78-01 and present in every 78 TRD's run. The first full run (before 92539825) had a third failure, `dispatch-completeness.test.cjs` 5, caused by this TRD's CLAUDE.md text and fixed (deviation 7). No merge-driver temp-dir race occurred.

## Success criteria evidence

| SC | Evidence |
|---|---|
| SC-1 (the shims are gone, aliasLegacyEnv last) | compat.legacy.test 11 (the alias and the four 78-11 exports undefined), 16b (no legacy-names require, no LEGACY), compat-entry.repo.test 1 (no entry point names the alias); `rg aliasLegacyEnv plugins/aoforge scripts` empty; the TRD's removed-names scan finds only planning-layout's detectors (and coexistence's `legacyRuntimeHome` detector) with their callers and absence tests; `git ls-files plugins/devflow 'plugins/aoforge/aoforge/bin/lib/migrations/001[234]*'` prints nothing |
| SC-2 (legacy-names trimmed, SHIM_REMOVAL done) | legacy-names.legacy.test 4 (`'3.1.0'`), 2-3 (commandDash gone), 6 (every LEGACY key has a reader) |
| SC-3 (every per-check decision recorded) | the decisions table above; USER-GUIDE doctor table and health-check table; CLAUDE.md Doctor/Validation bullets; CHANGELOG Removed (kept on purpose) |
| SC-4 (old layout gets a clear message, nothing created) | old-layout.legacy.test.cjs a-g (7/7), plus compat.legacy.test 20, upgrade-project.legacy, coexistence-guard.legacy, legacy-layout-guard.legacy, upgrade-retired.legacy, hooks/planning-layout.legacy in the full suite |
| SC-5 (docs and suite) | guide and site mirror, USER-GUIDE, CHANGELOG, CLAUDE.md, README; the full suite above with the exclusion stated |

## Post-TRD Verification

- Auto-fix cycles used: 1 (the dispatch-completeness wording)
- Must-haves verified: 6/6 (compat: no alias, no legacy-names import; legacy-names: SHIM_REMOVAL 3.1.0, SHIM_RELEASE 3.0.x, every key read, header lists the consumers; the guard still fails outside ALLOW (mutation + 5a/3e), ALLOW reasons name the 3.1 roles, `.gitignore` entry kept with the reconcile reason; SC-4 end to end; the guide has "Upgrading from 2.x" and every doc names the removal and the decisions; full suite green apart from the known noise, exclusion stated)
- Gate failures: none introduced (2 known EST-11 items)

## Self-Check: PASSED

- FOUND: plugins/aoforge/aoforge/bin/lib/old-layout.legacy.test.cjs, compat.cjs, legacy-names.cjs, docs/MIGRATING-TO-AOFORGE.md, site/content/docs/getting-started/migrating-to-aoforge.md
- FOUND commits: 25dcd014, b26635e5, 8d9b81ac, c85837b6, 92539825
