---
objective: 72-install-and-naming-cleanup
trd: "14"
subsystem: distribution
tags: [aoforge-rename, pointer-plugin, marketplace, coexistence, generated-skills]

requires:
  - phase: 72-02
    provides: "legacy-names.cjs NAMES/LEGACY/SHIM_REMOVAL (the generator builds every name from them)"
  - phase: 72-06
    provides: "the hooks on the compat resolver; the rename guard's planning-directory token"
  - phase: 72-10
    provides: "coexistence.POINTER_MAJOR = 3 (the pointer must be 3.x so AOForge's notice does not warn that its gates run twice)"
provides:
  - "plugins/devflow/: the final devflow@aocyber release, version 3.0.0: .claude-plugin/plugin.json, README.md, hooks/hooks.json (one SessionStart hook), hooks/pointer-notice.js, and 34 generated forwarding skills; no agents, no runtime, no gates"
  - "pointer-notice.js: SessionStart; with no ~/.claude/aoforge/.plugin-version prints { systemMessage, hookSpecificOutput.additionalContext } pointing at aoforge@aocyber; with the marker, or when it cannot tell (any error but ENOENT), prints nothing; always exit 0"
  - "scripts/gen-pointer-skills.cjs: renderPointerSkill(skill), parseSkill(text, dirName), plan(aoforgeSkillsDir, pointerSkillsDir) -> { missing, extra, stale }, main(argv) with --write | --check [--source] [--dest]; exit 0 / 1 out of step / 2 usage"
  - "hook-output-schema.js: sessionStartProblems(json) and SESSION_START_FIELDS (cited SessionStart model beside stopFamilyProblems)"
  - "rename guard: span-scoped ALLOW entries (`spans`: a /g RegExp masks only those spans, the file stays scanned; a span that matches nothing is a dead entry); maskAllowedSpans, scanFile"
  - "marketplace.json lists devflow (./plugins/devflow, 3.0.0) after aoforge; npm test runs 'plugins/devflow/**/*.test.js'"
affects: [72-13, 72-17, 72-18, 72-20, 72-21, 72-23]

tech-stack:
  added: []
  patterns:
    - "A generated directory is kept in step by a --check that the test suite runs against the real tree (missing, extra and stale each named)"
    - "A file that must spell a legacy name in a few places and cannot hold an ignore region gets a span-scoped ALLOW, not a whole-file one"
    - "A forwarding skill cannot reach a disable-model-invocation skill through the Skill tool; it asks the user to type the command"

key-files:
  created:
    - scripts/gen-pointer-skills.cjs
    - scripts/gen-pointer-skills.legacy.test.cjs
    - scripts/__fixtures__/legacy-pointer-fixtures.cjs
    - plugins/devflow/.claude-plugin/plugin.json
    - plugins/devflow/README.md
    - plugins/devflow/hooks/hooks.json
    - plugins/devflow/hooks/pointer-notice.js
    - plugins/devflow/hooks/pointer-notice.legacy.test.js
    - "plugins/devflow/skills/<name>/SKILL.md (34, generated)"
  modified:
    - .claude-plugin/marketplace.json
    - package.json
    - plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
    - plugins/aoforge/hooks/__fixtures__/hook-output-schema.js

key-decisions:
  - "A pointer for a disable-model-invocation AOForge skill keeps the flag and tells the user to type `/aoforge:<name> $ARGUMENTS`: the Skill tool cannot start such a skill (6 of 34: cleanup, list-objective-assumptions, milestone, set-profile, settings, workstreams)"
  - "The generator reads frontmatter with its own minimal parser: the repo's extractFrontmatter turns debug's unquoted `[issue description]` hint into an inline array; pointers always write the hint as a JSON-quoted YAML string"
  - "The pointer notice fails open to silence: only ENOENT on the runtime marker means AOForge is absent; any other error prints nothing"
  - "Span-scoped ALLOW keeps marketplace.json and package.json guarded; only the pointer's lines are masked"
  - "hooks.json quotes ${CLAUDE_PLUGIN_ROOT} (claude plugin validate warns on the unquoted form)"

requirements-completed: [INST-05]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 26min
completed: 2026-10-08
---

# Objective 72 TRD 14: The final devflow@aocyber release, a pointer to AOForge Summary

**The final devflow@aocyber release (3.0.0) is a pointer: 34 generated forwarding skills (`/devflow:<name>` hands its arguments to `/aoforge:<name>` through the Skill tool, or asks the user to type it for the 6 manual-only commands), one SessionStart notice that goes quiet once `~/.claude/aoforge/.plugin-version` exists, no agents or gates, a marketplace entry, and a `--check` that keeps the pointers in step with the AOForge skills.**

## Progress
- [x] Task 1: Fixture skills dirs for the generator — e166c226
- [x] Task 2: The generator and the forwarding skills — RED 077d4402, GREEN 67576e98
- [x] Task 3: The notice hook, the manifests, the marketplace entry — RED ee5324e4, GREEN (this commit)

## Estimate

`estimate trd 72-14` (run state was already started for the wave, not re-run): **10 min (P90 19 min) · $3.72 (P90 $6.01) · 3 tasks · confidence medium** (minutes from TRD-level history, n=73).

## What was built

- **Generator** (`scripts/gen-pointer-skills.cjs`). `parseSkill` reads the four keys a pointer needs from an AOForge SKILL.md (block-scalar descriptions with `|`, `|-`, `|+`; double-quoted values as JSON strings; single-quoted; plain values kept as raw text; a folded `>` description or a name that differs from its directory is refused). `renderPointerSkill` writes `name`, `description` (literal block), `argument-hint` (JSON-quoted, omitted when absent), `disable-model-invocation: true` for a manual-only skill, and `allowed-tools: [Skill]`. `plan` compares the two trees; `--write` writes missing and stale pointers and removes extra pointer directories; `--check` names every missing, extra and stale pointer and exits 1.
- **Forwarding skills** (`plugins/devflow/skills/*`, 34). Model-invocable: "invoke the Skill tool with skill `aoforge:<name>` and pass `$ARGUMENTS` unchanged. Do nothing else", or, when `aoforge:<name>` is not among the skills or the Skill tool does not know it, the install, restart and disable steps. Manual-only: tell the user to type `/aoforge:<name> $ARGUMENTS`; if Claude Code does not know it, the same install steps. Every pointer says it is removed in the release after 3.0.0.
- **Notice** (`plugins/devflow/hooks/pointer-notice.js`). Plain Node, no requires outside the file. `systemMessage` for the user (DevFlow is now AOForge, `/plugin install aoforge@aocyber`, restart, `claude plugin disable devflow@aocyber`), `additionalContext` for Claude ("Route every /devflow: request to the matching /aoforge: command", and the install steps until AOForge is installed). Prints nothing beside AOForge, and nothing when it cannot tell.
- **Manifests.** `plugin.json`: devflow, 3.0.0, the TRD's description, author, homepage and repository = aoforge-claude, MIT, no statusLine. `hooks.json`: one SessionStart command. `README.md`: the three move steps, what the release does, and the maintainer commands. Marketplace entry after aoforge, same description and version.
- **SessionStart output model** (`hook-output-schema.js` `sessionStartProblems`), cited from the hooks reference: universal fields, `hookSpecificOutput` with `hookEventName: "SessionStart"` and only `additionalContext`, `initialUserMessage`, `sessionTitle`, `watchPaths` (array of paths), `reloadSkills`; `decision` and `reason` are not SessionStart fields.
- **Rename guard.** ALLOW `plugins/<legacy>/**` and `scripts/gen-pointer-skills*` (whole file), and span-scoped entries for the marketplace pointer entry (`"name"`/`"source"` naming the old plugin and its `"description": "<Legacy> is now AOForge…"`) and for package.json's pointer test glob. Patterns and spans are built from LEGACY, so the guard still spells no legacy name (test 6).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The rename guard would fail on marketplace.json and package.json**
- **Found during:** Task 3 (planning the GREEN)
- **Issue:** the marketplace entry must say `"name": "devflow"` and `"source": "./plugins/devflow"`, and `npm test` must name `plugins/devflow/**`; the TRD's two ALLOW entries cover neither file, and a JSON file cannot hold an ignore region. A whole-file ALLOW would stop guarding both files.
- **Fix:** ALLOW entries may carry `spans` (a /g RegExp): the file stays in the scan set and only those spans are masked (same-length filler, line breaks kept). Test 4 also fails a span that matches nothing; new tests 9a-9c.
- **Files modified:** plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
- **Commit:** ee5324e4 (RED), Task 3 GREEN

**2. [Rule 3 - Blocking] The hook-output schema model had no SessionStart**
- **Found during:** Task 3
- **Issue:** `hook-output-schema.js` modelled only Stop and SubagentStop, and `stopFamilyProblems` throws for any other event, so "valid under the schema model" could not be checked.
- **Fix:** `sessionStartProblems(json)`, cited from "SessionStart decision control" and the decision-control table (checked 2026-10-08). Cases 5s-a and 5s-b in the pointer test. `systemMessage` is a universal field, so the TRD's recovery (drop it) was not needed.
- **Files modified:** plugins/aoforge/hooks/__fixtures__/hook-output-schema.js

**3. [Rule 2 - Missing critical functionality] Manual-only AOForge skills cannot be forwarded through the Skill tool**
- **Found during:** Task 2
- **Issue:** 6 AOForge skills set `disable-model-invocation: true`, and the skills reference says that stops the Skill tool from invoking them. The TRD's body would tell Claude to make a call that cannot succeed.
- **Fix:** their pointers keep `disable-model-invocation: true` (Claude cannot start the pointer either, as with the target) and tell the user to type `/aoforge:<name> $ARGUMENTS`. Test 1c; fixture skill gamma.
- **Files modified:** scripts/gen-pointer-skills.cjs, scripts/__fixtures__/legacy-pointer-fixtures.cjs

**4. [Rule 1 - Bug] The repo frontmatter helper misreads an unquoted bracket hint**
- **Found during:** Task 2
- **Issue:** `debug`'s `argument-hint: [issue description]` is a YAML flow sequence; `extractFrontmatter` returns `['issue description']`. The TRD preferred the repo helper when requireable.
- **Fix:** a minimal parser for the four keys keeps a plain scalar's raw text; the pointer writes it quoted. The test reads pointers back with the repo helper (an independent parser), which is safe because every pointer hint is quoted. Test 1e; fixture skill gamma.

**5. [Rule 1 - Bug] Unquoted ${CLAUDE_PLUGIN_ROOT} in the hook command**
- **Found during:** Task 3 (`claude plugin validate plugins/devflow` warned)
- **Issue:** a plugin root holding a space would split the command.
- **Fix:** `node "${CLAUDE_PLUGIN_ROOT}/hooks/pointer-notice.js"`; test 8b pins the quoted form; `claude plugin validate --strict plugins/devflow` passes.

### Other

- The fixtures live in `scripts/__fixtures__/legacy-pointer-fixtures.cjs` (over 40 lines; covered by the existing `legacy-*` SKIP and ALLOW). The complete-state pointers come from the `render` the test passes in, so the fixture does not depend on the generator. Task 1's TRD verify requires the test file, which did not exist yet; the fixture module was verified directly.
- The two whole-file ALLOW entries landed with Task 2's GREEN commit (TRD: Task 3), so no commit left the guard red.
- The test list grew: 1d (a hint with a double quote), 1e (parseSkill), 2 (no pointer directory yet), 3e (usage exits 2), 5s (the SessionStart model), 8c (only `.claude-plugin`, `README.md`, `hooks`, `skills`), 9b (npm test glob), guard 9a-9c.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixture skills dirs | `node -e "…pointerFixture(state,{render})…"` over every state: aoforge=[alpha,beta,gamma] each time; pointer = [] / all three / alpha,gamma / plus ghost / all three with alpha stale; no tmp root left; complete without render throws (the TRD's verify needs the test file, which Task 2 creates) | 0 | PASS |
| 2: generator and forwarding skills | `node --test scripts/gen-pointer-skills.legacy.test.cjs` | 0 (17/17) | PASS |
| 2: | `node scripts/gen-pointer-skills.cjs --check` | 0 ("34 pointer skills match plugins/aoforge/skills") | PASS |
| 2: cross-check | every pointer read back with the repo's `extractFrontmatter` against its AOForge skill: description, hint, manual-only flag | 0 (34 skills, 0 diffs; manual-only: cleanup, list-objective-assumptions, milestone, set-profile, settings, workstreams) | PASS |
| 3: notice, manifests, marketplace | `node --test plugins/devflow/hooks/pointer-notice.legacy.test.js` | 0 (10/10) | PASS |
| 3: | `claude plugin validate plugins/devflow` (and `--strict`) | 0 (no warnings after quoting the hook command; README install-line advice only) | PASS |
| 3: | `claude plugin validate .` | 0 (one warning, pre-existing: aoforge plugin.json `statusLine`) | PASS |
| 3: | `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` | 0 (17/17) | PASS |
| verification | `HOME=<empty fake> node plugins/devflow/hooks/pointer-notice.js` prints the notice; with the marker, nothing (tests 5 and 6) | 0 | PASS |
| verification | `ls plugins/devflow/skills` = `ls plugins/aoforge/skills` (34 each; test 4) | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` (run from the worktree, dot reporter) | 1: 13,640 marks, 14 X = the daemon tests that need node-pty, absent in a worktree (aoforge-watch.test.cjs PID/start/stop and multi-project CLI, the handoff pipeline end-to-end and LK-1/LK-2) and E2E1 roadmap drift (the 72-14 SUMMARY exists while ROADMAP still shows `[ ]`; the orchestrator's roadmap update clears it). No failure in a file this TRD touched | PASS (baseline) |
| build | `claude plugin validate plugins/devflow && claude plugin validate .` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2) | `node --test scripts/gen-pointer-skills.legacy.test.cjs` | 1 (`Cannot find module './gen-pointer-skills.cjs'`) | FAIL (correct) |
| GREEN (Task 2, before `--write`) | same | 1 (16 pass; test 4 lists 34 missing pointers) | the real-tree test waits for `--write` |
| GREEN (Task 2) | same, after `node scripts/gen-pointer-skills.cjs --write` | 0 (17 pass) | PASS (correct) |
| RED (Task 3) | `node --test plugins/devflow/hooks/pointer-notice.legacy.test.js` | 1 (10 fail: no hook, no `sessionStartProblems`, no manifests, no marketplace entry, no glob) | FAIL (correct) |
| RED (Task 3) | `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` | 1 (14 pass, 9a-9c fail: `scanFile` / `maskAllowedSpans` not defined) | FAIL (correct) |
| GREEN (Task 3) | both files | 0 (10/10 and 17/17) | PASS (correct) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (valid plugin named devflow at 3.0.0 with one SessionStart hook, one pointer per skill, no agents or other hooks; pointer skill shape and body; `--check` exit 0 and exit 1 naming missing, extra and stale; notice valid under the SessionStart model and silent beside the marker; marketplace lists both, both validations exit 0, npm test runs the pointer tests, guard allowlists the pointer paths with reasons)
- Gate failures: None beyond the documented baseline (node-pty daemon tests in a worktree, E2E1)
- State: per the dispatch, STATE.md and ROADMAP.md were not touched here (no `state` or `roadmap` commands); the orchestrator records them after the wave merge.

## Hand-off

- **Every later TRD that changes an AOForge skill's name, description or argument-hint** must run `node scripts/gen-pointer-skills.cjs --write`; `scripts/gen-pointer-skills.legacy.test.cjs` test 4 fails until it does. After the wave-7 merge, run `--check` once: a sibling that edited a skill description makes it stale.
- **72-13 (legacy command forms gate)**: `plugins/devflow/**` spells `/devflow:` on purpose (README, plugin.json description, notice), as does the marketplace pointer description. Exempt them the way the rename guard does (whole-file for `plugins/devflow/**` and `scripts/gen-pointer-skills*`, spans for the marketplace entry).
- **72-17 (docs)**: the migration guide can describe the pointer release (notice, forwarding, the 6 manual-only commands) and the maintainer commands.
- **72-18 (release 3.0.0)**: the pointer is already 3.0.0 in plugin.json and the marketplace; keep it at or above `coexistence.POINTER_MAJOR`. `changelog-on-tag` matches the marketplace entry by the aoforge plugin.json name, so the devflow entry does not disturb the version-sync check. The CHANGELOG entry can mention the pointer release.
- **Publishing** is the later user checkpoint: nothing was installed, enabled or pushed.
- **The release after 3.0.0** removes `plugins/devflow/`, `scripts/gen-pointer-skills*`, `scripts/__fixtures__/legacy-pointer-fixtures.cjs`, the marketplace entry, the package.json glob and the four ALLOW entries (test 4 reports each one dead once its files or spans are gone).
- `hook-coexistence.test.js` could check AOForge's own SessionStart hooks with `sessionStartProblems`; not wired here because sibling TRDs edit that file.
- `claude plugin validate` advises a `/plugin install devflow` line in the pointer README; deliberately absent (the README tells users to install AOForge instead). Advice only, not a warning.
