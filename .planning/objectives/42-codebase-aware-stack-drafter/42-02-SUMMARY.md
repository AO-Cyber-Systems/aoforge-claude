---
objective: 42-codebase-aware-stack-drafter
trd: "02"
job: 42-02
subsystem: stack-profile
tags: [stack-profile, tier-2, go, dart, flutter, loader, sync-runtime]

requires:
  - objective: 42-01
    provides: "STK010 placeholder-pin warning, helpers.localDate"
provides:
  - "Bundled tier-2 profiles at plugins/devflow/devflow/stack-profiles/{go,dart,flutter}.md (git mv from docs/stack-profiles/)"
  - "BUNDLED_STACKS_DIR + profileLookup: extends ids resolve user tier first, then bundled tier"
  - "bundledDir option (default BUNDLED_STACKS_DIR, null = off) on resolveFromParsed/resolveProfile/validateProfile/validateProfileText/listOrgProfiles/detectMarkers/pickExtends/draftProfile/initProfile"
  - "listOrgProfiles entries carry tier: 'user'|'bundled'; user shadows bundled by id"
  - "Resolved chain hops carry source: 'user'|'bundled'"
  - "sync-runtime SUBDIRS mirrors 'stack-profiles'"
affects: [42-05, 42-07, 42-08, 42-09, 42-10]

tech-stack:
  added: []
  patterns:
    - "Two-tier profile lookup: <home>/.claude/devflow/stacks/<id>.md, then <lib>/../../stack-profiles/<id>.md"
    - "Tests that must not see shipped profiles pass bundledDir: null (never an expectation edit)"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/stack-profiles-content.test.cjs
  modified:
    - plugins/devflow/devflow/stack-profiles/go.md (moved from docs/stack-profiles/go.md)
    - plugins/devflow/devflow/stack-profiles/dart.md (moved from docs/stack-profiles/dart.md)
    - plugins/devflow/devflow/stack-profiles/flutter.md (moved from docs/stack-profiles/flutter.md)
    - plugins/devflow/devflow/bin/lib/stack-profile.cjs
    - plugins/devflow/devflow/bin/lib/validate.cjs
    - plugins/devflow/hooks/sync-runtime.js
    - plugins/devflow/devflow/bin/lib/stack-profile.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-validate.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-init.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-detectors.test.cjs
    - plugins/devflow/devflow/bin/lib/json-schema-lite.test.cjs
    - plugins/devflow/devflow/bin/lib/validate.test.cjs

key-decisions:
  - "Bundled hops keep layer tier 'org' (so the schema, id selection and provenance code is unchanged) and add a separate `source: 'user'|'bundled'` field on the layer and chain entry"
  - "With bundledDir null, EXTENDS_UNRESOLVED messages are byte-identical to the pre-42-02 text; with it on, the message names every path looked at"
  - "listOrgProfiles lists user entries first, then unshadowed bundled entries, so detectMarkers/repo-state give the user tier first pick"
  - "pickExtends tie-breaking between a user and a bundled profile with unrelated ids stays alphabetical (the TRD specifies id shadowing only); a user profile that extends the bundled one wins through the existing ancestor rule"
  - "dart mcp-server flags re-verified live with `dart mcp-server --help` (dart on PATH): --enable/--disable accept cli, flutter, pub_dev_search"

patterns-established:
  - "Content tests pin profile fixes as behaviour: the go format gate is run against real unformatted/formatted files when gofmt is on PATH"

requirements-completed: [SDR-04, SDR-05]

verification:
  gates_defined: 4
  gates_passed: 4
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 45min
completed: 2026-09-28
---

# Objective 42 TRD 02: Ship fixed go/dart/flutter as bundled tier-2 profiles Summary

**The go/dart/flutter profiles now ship fixed in `devflow/stack-profiles/`. The loader resolves an `extends` id from the user tier first and the bundled tier second, so a go.mod repo with no user profiles drafts `extends: "go"` and `flutter.md` validates clean through the bundled `dart`.**

## Performance

- Tasks: 2/2, each committed as RED then GREEN
- Commits: 4 task commits, plus this SUMMARY

## Accomplishments

- **Profiles moved and fixed (Task 1).** `git mv` into `plugins/devflow/devflow/stack-profiles/`, so history follows and `docs/stack-profiles/` holds no profile. go: `format.run` is `test -z "$(gofmt -l .)"` (a single-quoted YAML scalar, parse round-trip tested), `disabled_tools: [go_context]` dropped, JetBrains skill pinned `155dc7ca10da`, prose says "bundled with DevFlow". dart: `audit: { run: none }`, a non-gating `outdated` (`dart pub outdated --no-transitive`), `audit` removed from `gates.objective`, MCP `args: [mcp-server, --disable, flutter, --enable, cli, --disable, pub_dev_search]`, `dart-lang/skills` pinned `0d9f1c4a0ae2`, `dart-` skill names and the install commands in prose. flutter: MCP `args: [mcp-server, --enable, cli, --disable, pub_dev_search]` (no tool lists), `build: { run: discover }`, `flutter/agent-plugins` pinned `8da8c54ecd74`, `flutter-` skill names, and Maestro (`.maestro/`, `maestro test .maestro`) and Patrol (`patrol_test/`) in Testing prose. Maestro is not a default `e2e` command. The prose also notes the `dart-flutter` plugin's duplicate server. `reviewed: "2026-09-28"` on all three.
- **SUBDIRS (Task 1).** `sync-runtime.js` SUBDIRS gained `'stack-profiles'` in the same commit that created the directory, so drift-guard case B stays green. `'stacks'` is not in the list.
- **Bundled-tier loader (Task 2).** `BUNDLED_STACKS_DIR = path.join(__dirname, '../../stack-profiles')` and `profileLookup(id, { userHome, bundledDir })` return `{ path, tier } | null`. `bundledDir` is threaded through every exported resolve, validate, list and draft entry point. A null `userHome` no longer short-circuits when the bundled tier resolves. The resolve cache key includes `bundledDir`. STK009 uses the same lookup. `stack-profile.cjs` still names no stack, and P11 is green.
- **W030.** The text is now `extends "<id>" not found in ~/.claude/devflow/stacks/ or the bundled stack-profiles/`.

## Commits

| Hash | Message |
|---|---|
| a11c461 | test(42-02): add failing content tests for bundled go/dart/flutter profiles |
| 017ffbb | feat(42-02): ship fixed go/dart/flutter as bundled tier-2 stack profiles |
| 41a6792 | test(42-02): add failing tests for the bundled tier-2 profile lookup |
| e6f2fb8 | feat(42-02): resolve extends ids from the bundled stack-profiles tier after the user tier |

## files_modified threshold (≤15)

The job-checker capped this TRD at 15 files. The `docs/stack-profiles/README.md` pointer, the stacks-survive regression test, and the `references/testing-strategy.md` / `docs/PROPOSAL-stack-profile.md` pointers moved to 42-10. The one-line `SUBDIRS` edit stayed here, so drift-guard case B is green in every wave. This TRD touched 15 listed paths plus `validate.test.cjs` (see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing test] W030 message assertion in validate.test.cjs**
- **Found during:** Task 2 RED
- **Issue:** The W030 text change in `validate.cjs` had no failing test anywhere in files_modified. Only `validate.test.cjs` drives `validate health`.
- **Fix:** Added one `assert.match` to the existing H4 test (the RED commit), so the text change is covered.
- **Files modified:** plugins/devflow/devflow/bin/lib/validate.test.cjs (outside files_modified)
- **Commit:** 41a6792

### Notes (not fixed; outside this TRD's files)

- `repo-state.cjs` `detectManifest`'s doc comment still says the org-marker fallback is `[]` when `userHome` is null. The bundled markers now apply with a null home. The only new behaviour is that a root with `go.work` but no `go.mod` reports `primary_lang: go`, because `go.mod` and `pubspec.yaml` are already built-in manifests. The comment should be refreshed in 42-10 or a later loader TRD.
- Tests that shifted only because bundled profiles became visible got `bundledDir: null` with no expectation edits: I1, I2 (stack-init) and D1, D2 (stack-detectors). No adopt, repo-state, project-state or init test shifted.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Move + fix profiles | `node --test stack-profiles-content sync-runtime json-schema-lite stack-validate stack-profile` (133 tests) + `stack validate --profile` go.md, dart.md (ok, 0 warnings) | 0 | PASS |
| 2: Bundled-tier lookup | `node --test stack-*.test.cjs adopt-*.test.cjs repo-state validate project-state init sync-runtime` + `stack validate --profile flutter.md` (ok, 0 warnings) + `HOME=<empty> df-tools --cwd <go.mod repo> stack init` (previews `extends: "go"`, validation ok) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (T1) | `node --test stack-profiles-content.test.cjs` (17/21 fail) | 1 | FAIL (correct) |
| GREEN (T1) | Task 1 verify set | 0 | PASS (correct) |
| RED (T2) | stack-profiles-content, stack-profile, stack-validate, stack-init, stack-detectors, validate tests (C1b, B1-B6, V13, V13b, V15, I14a/b, D12, H4 fail) | 1 | FAIL (correct) |
| GREEN (T2) | Task 2 subset + repo-state/project-state/init/sync-runtime | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none (repo has no lint command) | n/a | PASS |
| test | `node --test 'stack-*.test.cjs' 'adopt-*.test.cjs' sync-runtime.test.js` | 0 | PASS |
| build | `df-tools stack validate --profile plugins/devflow/devflow/stack-profiles/flutter.md` | 0 | PASS |
| wave | `NODE_PATH=/Users/justin/dev/devflow-claude/node_modules npm test` | 1 | PASS (only the known failure) |

Wave totals: tests 4695, pass 4662, fail 1, skipped 32. The baseline at WAVE_BASE was 4661/4628/1/32, so this TRD adds 34 tests and all of them pass. The one failure is the pre-existing handoff-e2e "PTY-path mock auth (TRD 19-05)" MA-7, which is allowed.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6
- Gate failures: None (wave gate: only the known handoff-e2e MA-7)

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/stack-profiles/{go,dart,flutter}.md; docs/stack-profiles/ holds no profile .md
- FOUND: plugins/devflow/devflow/bin/lib/stack-profiles-content.test.cjs
- FOUND: commits a11c461, 017ffbb, 41a6792, e6f2fb8 on df/exec-42-02
- FOUND: `'stack-profiles'` in sync-runtime.js SUBDIRS (no `'stacks'`)
