---
objective: 45-devflow-doctor
trd: "05"
job: 45-05
subsystem: tooling
tags: [df-tools, doctor, runtime-mirror, plugin-cache, hooks-registry, model-profiles]

requires: ["45-03", "45-04"]
provides:
  - "doctor check runtime-mirror (10): version + content-digest comparison of ~/.claude/devflow against the installed plugin, with a re-mirror fix"
  - "doctor check plugin-cache (11): stale plugin cache dirs with byte sizes, report only"
  - "doctor check hooks-registry (12): hooks.json / statusLine targets exist and every hook file is registered or DRAFT, report only"
  - "doctor check model-profiles (13): model-profiles.json structure, id shape, mirror-vs-installed ids, report only"
affects: [45-08, 45-09]

tech-stack:
  added: []
  patterns:
    - "A fix re-classifies before acting, forces a mirror by dropping the markers, then judges success from the mirror itself (sync-runtime exits 0 on failure)"
    - "Spawned children always get HOME/USERPROFILE = ctx.userHome; ctx.env is spread so DEVFLOW_SKIP_GLOBAL_UPGRADE passes through"
    - "DEVFLOW_DOCTOR_PLUGIN_ROOT is a test/dev plugin-root override for hooks-registry, used only when no plugin is registered"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/doctor-checks/10-runtime-mirror.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/10-runtime-mirror.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/11-plugin-cache.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/12-hooks-registry.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/11-12-install.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/13-model-profiles.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/13-model-profiles.test.cjs
  modified: []

key-decisions:
  - "runtime-mirror is fixable only when the installed plugin ships hooks/sync-runtime.js and devflow/; otherwise it reports the /plugin update hint, so fixable never promises a fix that cannot run"
  - "The fix reports applied:false (refused 'sync-runtime did not converge: <stderr tail>') unless a re-run of the check is ok; the version/digest markers stay removed on failure so the next session self-heals"
  - "plugin-cache with cache dirs but no installed registry entry warns without any rm advice; the installed dir is matched by version name or by realpath of installPath"
  - "hooks-registry treats plugin.json statusLine targets as registrations, so hooks/statusline.js is not reported unregistered"
  - "model-profiles flags a missing copy only when both copies are missing; a garbage copy always warns; the mirror-vs-installed drift warning suggests re-mirroring instead of a source edit"

patterns-established:
  - "Same-version mirror freshness is judged from digestTree of the real mirror files, never from .plugin-version alone"

requirements-completed: [DOC-05]

verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 6min
completed: 2026-09-30
---

# Objective 45 TRD 05: Doctor global install checks Summary

**Four machine-level doctor checks (runtime mirror with a digest-aware re-mirror fix, stale plugin cache dirs, hooks.json consistency, model-profiles ids) covering the 2026-09-29 stale-2.10.1-mirror incident.**

## Accomplishments

- `runtime-mirror` classifies against the plugin manager's own registry: mirror behind installed is an error, equal versions compare `digestTree(mirror)` with `digestTree(installPath/devflow)` (content drift is an error), mirror ahead of installed is a non-fixable warn (dev checkout), no registry entry is a non-fixable warn, and no mirror is an error. The fix drops `.plugin-version` and `.plugin-digest`, spawns the installed `hooks/sync-runtime.js` with `CLAUDE_PLUGIN_ROOT=installPath` and `HOME=userHome`, and reports `applied:true` only when a re-classification is ok.
- `plugin-cache` lists every cache dir other than the installed version with recursive byte sizes and an `rm -rf` line per stale dir, preceded by "after quitting sessions that use them". It never deletes and exports no `fix()`.
- `hooks-registry` resolves every `${CLAUDE_PLUGIN_ROOT}/...` path in hooks.json and the plugin.json statusLine, and requires each top-level non-test `hooks/*.js` to be registered or carry a `DRAFT` header in its first 40 lines. A copy of the shipped `hooks/` + `plugin.json` passes (regression guard).
- `model-profiles` validates the mirror copy (else the installed one): every `agents[*][tier]` names a defined `models` key, every id matches `^claude-[a-z]+-\d+(-\d+)*(\[1m\])?$`, and mirror ids differ from installed ids produce a warn listing both. Ok findings read `models: opus=<id>, sonnet=<id>, haiku=<id>`.

## Task Commits

| Task | Name | RED | GREEN |
|------|------|-----|-------|
| 1 | runtime-mirror check + re-mirror fix | 597772b | 2d3d619 |
| 2 | plugin-cache + hooks-registry checks | dc11d30 | 8f00e40 |
| 3 | model-profiles check | e84b666 | 8bc0b7a |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: runtime-mirror | `node --test .../doctor-checks/10-runtime-mirror.test.cjs` | 0 (15 pass) | PASS |
| 2: plugin-cache + hooks-registry | `node --test .../doctor-checks/11-12-install.test.cjs` | 0 (18 pass) | PASS |
| 3: model-profiles | `node --test .../doctor-checks/13-model-profiles.test.cjs` | 0 (13 pass) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../10-runtime-mirror.test.cjs` | 1 (Cannot find module ./10-runtime-mirror.cjs) | FAIL (correct) |
| GREEN (task 1) | same | 0 | PASS (correct) |
| RED (task 2) | `node --test .../11-12-install.test.cjs` | 1 (Cannot find module ./11-plugin-cache.cjs) | FAIL (correct) |
| GREEN (task 2) | same | 0 | PASS (correct) |
| RED (task 3) | `node --test .../13-model-profiles.test.cjs` | 1 (Cannot find module ./13-model-profiles.cjs) | FAIL (correct) |
| GREEN (task 3) | same | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test doctor-checks/10-runtime-mirror.test.cjs doctor-checks/11-12-install.test.cjs doctor-checks/13-model-profiles.test.cjs` | 0 (46 pass) | PASS |
| engine regression | `node --test lib/doctor.test.cjs lib/doctor-cli.test.cjs` | 0 (51 pass) | PASS |
| verification scenario | worktree `df-tools doctor --global --json` (and `--fix`) with `HOME` = temp fake home: mirror 2.10.1 / installed 2.11.0 / caches 2.7.1+2.10.1 | 0 | PASS |

The verification scenario ran through the real default check loader: before `--fix`, `runtime-mirror: error fixable=true`, `plugin-cache: warn`, `hooks-registry: ok`, `model-profiles: ok`. After `--fix`, `runtime-mirror: ok`, `plugin-cache` still `warn`, and `fixes` held one applied entry with `changed:["~/.claude/devflow"]`. `npm test` was not run in the worktree: it has no `node_modules`, so devflow-watch/handoff-e2e failures are expected there and were not chased.

## Deviations from Plan

### Auto-fixed Issues

None - TRD executed as written. Additive choices within the TRD's intent:

- **[Rule 2 - Missing critical functionality]** `runtime-mirror` reports `fixable:false` when the installed plugin has no `hooks/sync-runtime.js` or no `devflow/` dir (TRD says "fixable when installed >= mirror"), since a fix that cannot run must not be advertised. Covered by test 5d and the `installPath` guard.
- **[Rule 2]** `model-profiles` uses a re-mirror `fix_command` when the only issue is mirror-vs-installed drift, and the TRD's source-edit string otherwise; a stale mirror is fixed by re-mirroring, not by editing plugin source.
- Extra tests beyond the TRD's 15 (5a-5d, 6b, 7b, 8b, 9c-9e, 10d-10i, 12b-12d, 13c, 15c-15d, plus a cross-check verification scenario); none change behavior the TRD specified.

`doctor.cjs`, `doctor-cli.cjs`, `doctor-fixtures.cjs`, the README, `sync-runtime.js`, `df-tools.cjs` and `help.cjs` were not edited.

## Auth gates

None.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (runtime-mirror, plugin-cache, hooks-registry, model-profiles truths, and the runtime-mirror fix convergence)
- Gate failures: None
- Real-home safety: test 6 snapshots the real `~/.claude/devflow/.plugin-version` and `.plugin-digest` (content + mtime, read-only) before and after the fix and asserts no change; every spawned child gets `HOME` and `USERPROFILE` set to the temp home. The scratch e2e used a `df-upgrade-home-*` temp dir under the OS temp root.

## Self-Check: PASSED

All seven created files exist under `plugins/devflow/devflow/bin/lib/doctor-checks/`, and the six task commits (597772b, 2d3d619, dc11d30, 8f00e40, e84b666, 8bc0b7a) are on `df/exec-45-05`.
