---
objective: 73-handoff-gaps-and-result-injection
job: "08"
subsystem: docs
tags: [docs, handoff, aoforge-watch, changelog, hooks, todo]

requires:
  - objective: 73-01
    provides: the PTY dispatch script (gaps 1 and 2) and the PTY output contract
  - objective: 73-02
    provides: handoff-results.cjs (claim, address rule, 9,000-character block) and route-results as the catch-all
  - objective: 73-03
    provides: live-window listeners (gap 3) and the MA-6 outcome
  - objective: 73-04
    provides: inject-handoff-results.js delivery and the gate-interactive address and wording
  - objective: 73-05
    provides: the attended aoforge-watch terminal, the respawn and the known limitations list
  - objective: 73-06
    provides: hook registration (PostToolUse `*`, Stop timeout 150)
  - objective: 73-07
    provides: SC-3 demonstrated live (run 2, h-abe054d2) and gaps G1 to G4
provides:
  - "docs/USER-GUIDE.md: hooks table rows for route-results.js, gate-interactive.js and inject-handoff-results.js, and the `### Interactive commands and aoforge-watch` subsection (flow, attended terminal, delivery, settings, known limitations)"
  - "site handoff guide, /aoforge:handoff skill and built-in-integration-status.md describing the three delivery points and the attended terminal"
  - "CLAUDE.md hook bullets, HOOK_DOCS and the regenerated site/data/aoforge.json for the three handoff hooks"
  - "CHANGELOG [Unreleased] Added / Changed / Fixed entries for objective 73"
  - "the 2026-04-27 seamless-handoff todo completed"
affects: [objective 73 verify-work, the next release]

tech-stack:
  added: []
  patterns:
    - "One flow block (TRD codebase_examples) is the source for every page: USER-GUIDE, site guide and skill say the same three delivery points"

key-files:
  created:
    - .aoforge/todos/completed/2026-04-27-seamless-interactive-command-handoff.md
  modified:
    - docs/USER-GUIDE.md
    - site/content/docs/guides/handoff.md
    - plugins/aoforge/skills/handoff/SKILL.md
    - docs/built-in-integration-status.md
    - CLAUDE.md
    - scripts/gen-docs-data.cjs
    - site/data/aoforge.json
    - CHANGELOG.md
    - plugins/aoforge/hooks/inject-handoff-results.js
    - .aoforge/ROADMAP.md

key-decisions:
  - "The gate-interactive false positives found in 73-07 (G1 to G3) are documented as known limitations with the AOFORGE_SKIP_INTERACTIVE_GATE=1 escape, not fixed; verify-work routes them to gap closure"
  - "MA-6 (doctl) is documented as not demonstrated live: doctl now gets a terminal, and the automated test ends on the duplicate-prompt guard when doctl rejects its token"
  - "The seamless-handoff todo is completed because 73-07 recorded SC-3 / HND-03 as met (run 2)"

requirements-completed: [HND-01, HND-02, HND-03]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: 12min
completed: 2026-10-10
tokens_input: 17322063
tokens_output: 59267
tokens_cache_read: 17105246
tokens_cache_write: 216619
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 73 TRD 08: Docs and close-out Summary

**Every user-facing description of the handoff flow now matches what objective 73 shipped: the attended aoforge-watch terminal, results delivered after the next tool call or at the end of the turn (route-results as the catch-all on the next prompt), the escapes and env vars, and the known limitations including the 73-07 gate-interactive false positives; the seamless-handoff todo is completed and the full suite has no failure caused by the code, but 4 classify-session tests fail on this machine because the aoforge-watch daemon's home `~/.aoforge/` now exists, which exposed a new gap (G5, below).**

## Progress
- [x] Task 1: User-facing docs: USER-GUIDE, the site handoff guide, the handoff skill, the integration status — bd922e71
- [x] Task 2: Inventory docs: CLAUDE.md hook bullets, HOOK_DOCS, regenerated docs data, CHANGELOG — fa8a4937
- [x] Task 3: Close the todo and run the final gate — a10c85fb (todo move); the ROADMAP tick lands in the final docs commit

## Performance

- **Duration:** about 12 min (2026-10-10T00:20Z preflight to 00:32Z)
- **Tasks:** 3 of 3
- **Files modified:** 10, plus the todo move (see key-files)
- **Commits:** bd922e71 (user-facing docs), fa8a4937 (inventory docs and CHANGELOG), a10c85fb (todo)

## Accomplishments

- **USER-GUIDE.** Hooks table rows for `route-results.js` (UserPromptSubmit), `gate-interactive.js` (PreToolUse Bash) and `inject-handoff-results.js` (PostToolUse `*`, Stop), each with its escape. New `### Interactive commands and aoforge-watch` under `## Hooks and what they enforce`: starting the attended terminal and what it prints, attended vs unattended, the flow block, the framing, Ctrl+C, the respawn, the delivery rules (claim, address, Stop-wait conditions, the 9,000-character block and the `handoff get` pointer), the 73-07 live result, a settings and escapes table, and 12 known limitations. The local-checkout section gained a `--plugin-dir` paragraph (option B from 73-07).
- **Site guide** (`site/content/docs/guides/handoff.md`). Quick start starts the attended terminal and names the three delivery points; "How it flows" is the new flow; Configuration lists `AOFORGE_WATCH_UNATTENDED`, `AOFORGE_HANDOFF_STOP_WAIT_MS`, `AOFORGE_SKIP_HANDOFF_INJECT` and `AOFORGE_SKIP_HANDOFF_RESULTS` and an "Attended and unattended" subsection; a new "Known limitations" list; "Without the daemon" and the known-gap callout kept, the callout extended with the two 73-07 false positives.
- **Handoff skill.** The three delivery points replace "on the next turn ... route-results"; Claude says in one line that the command waits in the user's aoforge-watch terminal, must not pre-answer the prompt with a flag, and reads `✗ exit ?` and stderr-in-stdout correctly. Frontmatter untouched (`gen-pointer-skills --check` passes).
- **Integration status.** `inject-handoff-results.js` cited on the PostToolUse and Stop rows, Since `pre-62, 73` and `63, 73`.
- **CLAUDE.md** (three bullets only), **HOOK_DOCS** and the regenerated **site/data/aoforge.json**: route-results as the catch-all with both escapes, gate-interactive with the session/agent address, the wording and its escape, inject-handoff-results registered on both events with both escapes. The data diff is limited to these three hooks plus `generatedAt` (inject-handoff-results now shows `registered: true`, events Stop and `PostToolUse (*)`, picked up from 73-06's hooks.json).
- **CHANGELOG** `[Unreleased]`: `### Added` (attended terminal, HND-03; delivery without a prompt, HND-02), `### Changed` (PTY output contract, HND-01; gate-interactive address and wording, HND-02), `### Fixed` (three PTY gaps, HND-01; dead shell respawned, HND-03; delivered once, HND-02), each naming objective 73, wrapped at 120 characters, ahead of the existing 72-27 entry.
- **Todo.** `2026-04-27-seamless-interactive-command-handoff` completed with `aof-tools todo complete` (73-07 recorded SC-3 / HND-03 met on run 2, h-abe054d2).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: user-facing docs | `rg -n "next turn" plugins/aoforge/skills/handoff/SKILL.md site/content/docs/guides/handoff.md` | 1 (no match) | PASS |
| 1 | `node --test .../doc-refs.repo.test.cjs .../builtin-sweep.repo.test.cjs .../rename-guard.repo.test.cjs scripts/gen-pointer-skills.legacy.test.cjs .../builtin-status.repo.test.cjs` | 0 (97/97) | PASS |
| 1 | `node --test .../planning-writes.repo.test.cjs` | 0 (11/11) | PASS |
| 2: inventory docs | `node --test .../hook-inventory.test.cjs .../changelog.test.cjs .../doc-refs.repo.test.cjs .../rename-guard.repo.test.cjs hooks/inject-handoff-results.test.js .../doctor-checks/11-12-install.test.cjs` | 0 (103/103) | PASS |
| 2 | `npm run docs:data`, then `git diff --stat site/data/aoforge.json` | 0 (12 insertions, 9 deletions: the three hooks and `generatedAt`) | PASS |
| 2 | `rg -n "objective 73" CHANGELOG.md` | 0 (7 entries) | PASS |
| 3: todo and final gate | `aof-tools todo complete 2026-04-27-seamless-interactive-command-handoff` | 0 (`completed: true`) | PASS |
| 3 | `npm test` | 1 (12,187 tests, 12,151 pass, 4 fail, 32 skipped) | see Issues: the 4 are environmental |
| 3 | `HOME=<scratch>/clean-home node --test plugins/aoforge/hooks/classify-session.test.js` | 0 (24/24) | PASS |

TRD verification: `rg -n inject-handoff-results` finds it in USER-GUIDE (4), built-in-integration-status (2), gen-docs-data (2), aoforge.json (3) and CLAUDE.md (1); `rg -n -e "route-results injects the result on your next prompt" site/content/docs/guides/handoff.md` finds nothing.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped, per task) | `node --test {files}` (above) | 0 | PASS |
| test (full) | `npm test` | 1 | 12,187 tests, 12,151 pass, 4 fail, 32 skipped. Baseline at 3ef85eb5: 12,187 / 12,155 / 0 fail / 32 skipped. The 4 failures are classify-session scenario 7, S1, S3 and S5, caused by `~/.aoforge/` on this machine (G5); with a clean HOME that file passes 24/24. No failure comes from this TRD's changes (docs and one comment) |
| lint | not_available | - | not_available |
| build | not_available (docs:build needs Hugo) | - | not_available |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] inject-handoff-results.js header said the hook was not registered**
- **Found during:** Task 2
- **Issue:** The file's header comment still read "Not registered in hooks.json yet: TRD 73-06 registers it ...", false since 73-06.
- **Fix:** The comment now says it is registered by 73-06 (PostToolUse matcher `*`, Stop with `"timeout": 150`). Comment only; the file is outside the TRD's files_modified.
- **Files modified:** `plugins/aoforge/hooks/inject-handoff-results.js`
- **Commit:** fa8a4937

**2. [Scope] The local-checkout section gained a `--plugin-dir` paragraph**
- Per the dispatch (73-07's option B worked well). Inside `docs/USER-GUIDE.md`, which the TRD lists.

### Not done on purpose

- The gate-interactive false positives (73-07 G1 to G3) and `✗ exit ?` are documented as known limitations, not fixed (dispatch and TRD: verify-work routes them to gap closure).
- No version bump, tag, push or release.

## Issues Encountered

**G5 (new gap, found by the final gate): the aoforge-watch home `~/.aoforge/` makes `$HOME` look like an AOForge project.**

- The daemon keeps its log at `~/.aoforge/aoforge-watch.log` (aoforge-watch.cjs header; the allowlist is `~/.aoforge/aoforge-watch-allow.json`). `/Users/justin/.aoforge/` was created at 2026-10-10T00:15Z by the 73-07 demo daemon and holds only that log.
- `compat.findProjectRoot` walks up with no bound at `$HOME` and accepts any directory holding `.aoforge/`. So every directory under `$HOME` without its own `.aoforge/` now resolves to the project root `$HOME`. The four classify-session fixtures live under `~/.aoforge-test-fixtures/` and got the "AOFORGE PROJECT DETECTED" directive instead of the init offer or skip.
- The same walk (`maxUp: Infinity`) is used by gate-edits.js, gate-commits.js, gate-bash-writes.js, route-intent.js, classify-session.js, verify-completion.js, verify-commits.js, guard-no-progress.js, route-results.js, gate-executor-stop.js and upgrade-project.js. In a real session in any non-AOForge repository under `$HOME`, on a machine where the daemon has run, the edit gate would deny in ambient mode and raw commits would be blocked. Not verified live; inferred from the code and the four test failures.
- Before the rename the daemon home and the planning directory had different names; objective 72 gave them the same one.
- Not fixed here: the fix is a design choice (move the daemon home, for example under `~/.claude/aoforge/state/`, with a fallback for an existing log and allowlist; or make the project walk ignore a `.aoforge/` that is the daemon home or has no planning files). Recorded as a blocker in STATE.md for verify-work and gap closure. Nothing in `~/.aoforge/` was moved or deleted; moving it aside is the user's call.

No stray handoff records: `.aoforge-handoff/pending/` in the main checkout was empty after the work (checked), and no Bash command in this TRD carried a gated command name.

## Discovered commands

None. `npm test`, `node --test {files}` and `npm run docs:data` come from `.aoforge/STACK.md`, package.json and the TRD.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/7 (CHANGELOG; USER-GUIDE rows and subsection; site guide and skill; CLAUDE.md, HOOK_DOCS and aoforge.json agree; integration status; todo completed). The 7th (full suite with no new failures) is met for the code and not on this machine: 4 environmental failures, G5.
- Gate failures: the 4 classify-session failures (G5)

## Release follow-up

Objective 73 is unreleased: its CHANGELOG entries sit under `[Unreleased]` and a later release carries them. No tag, push or deploy was done here. G5 should be closed before that release, because a released daemon would create `~/.aoforge/` on every machine that runs it.

## Self-Check: PASSED

- FOUND: docs/USER-GUIDE.md, site/content/docs/guides/handoff.md, plugins/aoforge/skills/handoff/SKILL.md, docs/built-in-integration-status.md, CLAUDE.md, scripts/gen-docs-data.cjs, site/data/aoforge.json, CHANGELOG.md, plugins/aoforge/hooks/inject-handoff-results.js (all modified)
- FOUND: .aoforge/todos/completed/2026-04-27-seamless-interactive-command-handoff.md; the pending copy is gone
- FOUND commits: bd922e71, fa8a4937, a10c85fb
- The full-suite claim is stated as measured (4 environmental failures, G5), not as green
