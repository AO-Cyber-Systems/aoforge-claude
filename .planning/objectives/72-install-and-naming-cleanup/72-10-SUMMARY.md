---
objective: 72-install-and-naming-cleanup
trd: "10"
subsystem: hooks
tags: [aoforge-rename, coexistence, legacy-agent-types, transcript-readers, shims]

requires:
  - phase: 72-02
    provides: "legacy-names.cjs NAMES/LEGACY; compat.cjs isOwnAgentType and aliasLegacyEnv"
  - phase: 72-06
    provides: "hooks on the compat resolver (the require-after-alias pattern this TRD's hook follows)"
provides:
  - "bin/lib/coexistence.cjs: detectLegacyPlugin({ userHome, fsImpl }) -> { installed, enabled, version, pointer }; coexistenceMessage(result); POINTER_MAJOR"
  - "hooks/coexistence-guard.js: SessionStart, registered last; one global notice per session (key coexistence:<session_id>, source coexistence-guard, level action, info for the pointer) naming the old plugin's version and `claude plugin disable <LEGACY.plugin>`; stdout empty, exit 0, fail open; AOFORGE_SKIP_COEXISTENCE=1 (legacy prefix aliased)"
  - "compat.isOwnAgentType now requires a non-empty agent name; compat.isOwnExecutor(t) = the executor in either namespace, exactly"
  - "gate-edits isAoforgeAgent = compat.isOwnAgentType (gate-bash-writes follows through its import); verify-commits and gate-executor-stop act on compat.isOwnExecutor"
  - "agent-overhead AGENT_PREFIX_RE built from NAMES.agentNs, LEGACY.agentNs and LEGACY.installPrefix"
  - "session-audit: legacy gate denial texts, the legacy skill and command namespace and the legacy override phrases count as the new ones (category ids unchanged)"
  - "__fixtures__/legacy-plugin-fixtures.cjs: pluginHome, writePluginState, seedEnabledLegacyPlugin, subagentStopPayload, preToolUsePayload"
affects: [72-07, 72-08, 72-09, 72-11, 72-12, 72-14, 72-15, 72-17]

tech-stack:
  added: []
  patterns:
    - "A hook that only informs writes a global notice through notices.cjs and keeps stdout empty; route-results shows it on the next prompt"
    - "A notice that must appear once per session keys on the session id and refuses a second pending notice of the same prefix"
    - "A transcript reader's legacy names are derived from NAMES/LEGACY (escapeRegExp alternations, slug substitution), never spelled"

key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-plugin-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/coexistence.cjs
    - plugins/aoforge/aoforge/bin/lib/coexistence.legacy.test.cjs
    - plugins/aoforge/hooks/coexistence-guard.js
    - plugins/aoforge/hooks/coexistence-guard.legacy.test.js
    - plugins/aoforge/hooks/agent-types.legacy.test.js
    - plugins/aoforge/aoforge/bin/lib/transcript-names.legacy.test.cjs
  modified:
    - plugins/aoforge/hooks/hooks.json
    - CLAUDE.md
    - plugins/aoforge/aoforge/bin/lib/compat.cjs
    - plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs
    - plugins/aoforge/hooks/gate-edits.js
    - plugins/aoforge/hooks/verify-commits.js
    - plugins/aoforge/hooks/gate-executor-stop.js
    - plugins/aoforge/aoforge/bin/lib/agent-overhead.cjs
    - plugins/aoforge/aoforge/bin/lib/session-audit.cjs
    - plugins/aoforge/hooks/classify-session.test.js
    - plugins/aoforge/hooks/hook-coexistence.test.js
    - plugins/aoforge/hooks/planning-writes.audit.test.js
    - plugins/aoforge/hooks/__fixtures__/coexistence-fixtures.js

key-decisions:
  - "Coexistence notice is one per session: key coexistence:<session_id>; a later SessionStart of the same session (resume, compact) queues nothing even after it was read, and a new session never adds a second pending one"
  - "Enabled = installed and not explicitly false in ~/.claude/settings.json or settings.local.json (the local file wins); a version-1 installed_plugins.json is read too; the user-scope entry's version wins"
  - "The pointer release is the old plugin at major 3 or above: still told (level info), without the gates-run-twice warning"
  - "compat.isOwnAgentType now rejects a bare namespace: gate-edits trusted only a non-empty name, and its existing test pins that, so the shim was tightened rather than the gate loosened"
  - "isOwnExecutor matches `<ns>executor` exactly (stricter than the TRD's endsWith(':executor'), which would accept `<ns>x:executor`)"
  - "session-audit keeps OVERRIDE_PHRASES identical to the hook (D-1) and adds HISTORY_OVERRIDE_PHRASES for transcripts; category ids are unchanged, the old texts map to them"

requirements-completed: [INST-03, INST-05]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 15min
completed: 2026-10-09
tokens_input: 26535741
tokens_output: 97517
tokens_cache_read: 26288009
tokens_cache_write: 247448
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 10: AOForge beside the old plugin, and old identities still recognised Summary

**A new SessionStart hook tells a user who still has the old plugin enabled, once per session, which version it is and the exact `claude plugin disable` command. The gates treat the old agent namespace as their own for one release, and calibration and the session audit keep counting history recorded under the old agent, skill, command and gate names.**

## Progress
- [x] Task 1: Fixture builder: fake homes with plugin installs — 7f5c52b7
- [x] Task 2: Coexistence detection and the SessionStart guard — 35e2a155 (RED), 18594c35 (GREEN)
- [x] Task 3: Old agent types in the gates, old names in the transcript readers — 53cfd96e (RED), a798b67a (GREEN)

## What was built

- **Coexistence detection** (`bin/lib/coexistence.cjs`). `detectLegacyPlugin({ userHome, fsImpl })` reads `<home>/.claude/plugins/installed_plugins.json` (v2 arrays and a v1 single object; the user-scope entry's version wins) and `enabledPlugins` in `settings.json` and `settings.local.json` (local wins; absent everywhere = enabled). It returns `{ installed, enabled, version, pointer }`, with `pointer` for major 3 or above. `coexistenceMessage` is one line naming the version and `claude plugin disable devflow@aocyber`; only the non-pointer text says the gates may run twice. `userHome` is required, and corrupt files never throw.
- **`hooks/coexistence-guard.js`**, registered as the last SessionStart entry. It aliases the legacy env first, then `AOFORGE_SKIP_COEXISTENCE=1` returns before anything is read. It queues a global notice (`source: coexistence-guard`, `key: coexistence:<session_id>`, level `action`, or `info` for the pointer) through `notices.cjs`, which route-results renders on the next prompt. There is one notice per session (resume and compact stay quiet even after it was read), never two pending, and stdout stays empty. It exits 0 and fails open. `run()` is exported for the in-process skip test.
- **Agent types.** `compat.isOwnAgentType` now requires a non-empty name, and `compat.isOwnExecutor` was added. gate-edits' `isAoforgeAgent` is `isOwnAgentType`, and gate-bash-writes follows through its import. verify-commits and gate-executor-stop act on `isOwnExecutor`. gate-executor-stop's now-unused `EXECUTOR_AGENT_TYPE` was dropped; verify-commits keeps its exported constant (Schema 12 pins it).
- **Transcript readers.** agent-overhead's prefix regex is built from `NAMES.agentNs`, `LEGACY.agentNs` and `LEGACY.installPrefix`. session-audit:
  - Its edit, commit and changelog rules also match the product, CLI and env-prefix parts of the old texts.
  - Skill calls, the bash-replay agent and skill exclusion, and the skill window accept both namespaces.
  - A typed `/devflow:` command and the old override phrases (`HISTORY_OVERRIDE_PHRASES`, derived by slug substitution) route an edit-gate denial.
  - The category ids are unchanged.
- **CLAUDE.md**: a `coexistence-guard.js` bullet. The gate-edits, verify-commits and gate-executor-stop bullets now mention the legacy namespace.
- End to end, run by hand on a fake HOME: the guard queued the notice, and `route-results.js` rendered `- [action] The DevFlow plugin (devflow@aocyber v2.15.0) is still enabled beside AOForge, so its hooks and gates may run twice. Disable it: claude plugin disable devflow@aocyber`.

## Hand-off

- **72-14 (pointer plugin)**: `coexistence.POINTER_MAJOR = 3`. The pointer release must be 3.x or later, or the notice will warn that its gates run twice. The notice key prefix is `coexistence:` (`coexistence-guard.KEY_PREFIX`).
- **72-12 / 72-13**: `hooks/lib/edit-override.js` OVERRIDE_PHRASES has only the new phrases. A user who types the old override phrase is no longer honored by the live gate (the audit reads it from history only). Decide whether the live hook should accept it for one release.
- **72-12**: `lib/skill-requires.cjs` `PLUGIN_PREFIX = 'aoforge:'` (gate-skill-requires) and `init.cjs normalizeAgentKey` (`/^df-/` only) still know one namespace. They are not transcript readers, so they are out of this TRD's scope.
- **72-17**: `site/data/aoforge.json` was not regenerated. `npm run docs:data` picks up the new hook. The user guide does not describe the coexistence notice yet.
- `rg -n "isOwnAgentType" plugins/aoforge/hooks` shows gate-edits. The two executor checks call `compat.isOwnExecutor`, which is built on `isOwnAgentType`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: plugin install fixtures | TRD `node -e "…pluginHome({devflow:{version:'2.15.0',enabled:true}})…"` prints `true`, plus a shape matrix (none/absent/disabled/local/pointer/corrupt: files, enabledPlugins, versions, no leak after cleanup) | 0 | PASS |
| 2: coexistence + guard | `node --test coexistence.legacy.test.cjs coexistence-guard.legacy.test.js hook-inventory.test.cjs` (+ route-results, hook-coexistence, planning-writes.audit, rename-guard) | 0 (353/353) | PASS |
| 3: agent types + transcript names | `node --test agent-types.legacy.test.js transcript-names.legacy.test.cjs gate-edits.test.js verify-commits.test.js gate-executor-stop.test.js agent-overhead.test.cjs session-audit.test.cjs` (+ compat.legacy, gate-bash-writes) | 0 (456/456) | PASS |
| verification | hooks.json SessionStart commands list `coexistence-guard.js` last; rename-guard, hook-inventory, doc-refs, planning-writes repo gates | 0 (44/44) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2) | `node --test plugins/aoforge/aoforge/bin/lib/coexistence.legacy.test.cjs plugins/aoforge/hooks/coexistence-guard.legacy.test.js` | 1 (module not found; 9 hook tests fail) | FAIL (correct) |
| GREEN (Task 2) | same | 0 (17 pass) | PASS (correct) |
| RED (Task 3) | `node --test agent-types.legacy.test.js transcript-names.legacy.test.cjs compat.legacy.test.cjs` | 1 (10-13, 15, 16, compat 13b fail; 14, the 16a full-line case and the controls pass) | FAIL (correct) |
| GREEN (Task 3) | same + the touched suites | 0 (456 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (after Task 1) | `node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'` | 0: 11,649 tests, 11,614 pass, 35 skipped, 0 fail | PASS |
| test (after Task 2) | same | 1: 11,679 tests, 3 fail = E2E1 (baseline: the 72-10 checkpoint SUMMARY, cleared by `roadmap update-job-progress`) + classify-session cases 14/15 (fixed before the GREEN commit, 24/24) | PASS (baseline) |
| test (after Task 3) | same | 1: 11,704 tests, 11,668 pass, 35 skipped, 1 fail = E2E1 (baseline, the 72-10 line only) | PASS (baseline) |

`npm test` itself was not run because it includes `micro.test.cjs`, which hangs on commit signing (as in 72-04 to 72-06).

## Discovered commands

None. The test command came from the stack profile and the TRD.

## Estimate

`estimate trd 72-10`: 10 min (P90 19 min), $3.72 (P90 $6.01), 3 tasks, confidence medium. `estimate start` was not re-run, because the orchestrator had already recorded wave 6's start (`estimate wave 72 6 --start`) and re-running would rewrite that run state. Measured: 15 min.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Three suites pin the hook registrations**
- **Found during:** Task 2 (full-suite gate)
- **Issue:**
  - `classify-session.test.js` cases 14/15 pinned 4 SessionStart entries with classify-session last.
  - `hook-coexistence.test.js` test 9 and `planning-writes.audit.test.js` require a RUNS entry for every registered hook.
- **Fix:**
  - Cases 14/15 now expect 5 entries, with coexistence-guard last and classify-session right before it.
  - RUNS entries were added in both suites, each with a `legacyPlugin` world option (`seedEnabledLegacyPlugin`), so the guard's real write path runs there instead of a vacuous no-op.
- **Files modified:** classify-session.test.js, hook-coexistence.test.js, planning-writes.audit.test.js, hooks/__fixtures__/coexistence-fixtures.js
- **Commit:** 18594c35

**2. [Rule 1 - Bug] `compat.isOwnAgentType` trusted a bare namespace**
- **Found during:** Task 3 (planning the `isAoforgeAgent = isOwnAgentType` swap)
- **Issue:** `isOwnAgentType('aoforge:')` was true. gate-edits' own test (44-03) requires an empty name to be denied, so the literal swap would have loosened the gate.
- **Fix:** both namespaces now need a non-empty name, covered by compat test 13b (RED first).
- **Commit:** 53cfd96e (test), a798b67a (fix)

### Choices the TRD left open, or where it was inexact

- **The CLAUDE.md bullet does not use the TRD's literal wording.** The TRD's text spelled the legacy product word and plugin id outside the ignore region, which the rename guard (test 2) fails on. The bullet points at `LEGACY.plugin` and says "the `claude plugin disable` command" instead.
- **"One notice per session"** is keyed on the SessionStart `session_id`, plus a no-second-pending rule. A plain constant key would re-queue after every compact once the first notice was read.
- **`isOwnExecutor`** is an exact match, stricter than the TRD's `endsWith(':executor')`.
- **session-audit**:
  - The full old edit-gate line already classified correctly through the product-neutral alternate (`direct Edit/Write/MultiEdit denied`). Test 16a therefore adds cases that carry only the product-, CLI- or env-specific part.
  - The old override phrases (a history-only list) and the bash replay's agent and skill exclusion go beyond the TRD's two named checks. They are in scope: "transcript readers keep counting history".
- **The guard reads `settings.local.json` as well as `settings.json`.** This is the TRD's error-recovery path, applied up front.

## Post-TRD Verification

- Auto-fix cycles used: 1 (the registration pins after Task 2)
- Must-haves verified: 4/4
  - Coexistence notice: tests 6-9 cover installed and enabled, disabled, absent, corrupt, the skip and its legacy alias, and empty stdout with exit 0. The fake-HOME end-to-end run rendered the notice.
  - Registration: hooks.json lists the guard last, and hook-inventory passes.
  - Gates: gate-edits and gate-bash-writes allow `devflow:*`; verify-commits and gate-executor-stop block `devflow:executor` with the same shape. `Explore` is unchanged (tests 10-14).
  - Transcript readers: agent-overhead normalizes all three prefixes and counts a `devflow:verifier` spawn. session-audit maps the old texts, skills, commands and phrases (tests 15-16).
- Gate failures: None beyond the E2E1 baseline.

## Self-Check: PASSED

- FOUND: the 7 created files (fixtures, coexistence.cjs + test, coexistence-guard.js + test, agent-types and transcript-names tests)
- FOUND: commits 7f5c52b7, 35e2a155, 18594c35, 53cfd96e, a798b67a
