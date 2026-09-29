---
objective: 42-codebase-aware-stack-drafter
trd: "05"
job: 42-05
subsystem: stack-drafter
tags: [stack-detect, areas, dart-vs-flutter, detect-markers, components, cwd-join]

requires:
  - objective: 42-codebase-aware-stack-drafter
    provides: "42-02 bundled tier-2 profiles (go/dart/flutter) + bundledDir lookup; 42-06 stack verify component views (cwd taken from renderCommand as-is)"
provides:
  - "stack-detect.detectAreas(root, {maxDepth=3}) -> [{dir, kinds, tier, evidence, flags, unsupported?}], sorted by dir; '' = root, other dirs carry a trailing slash"
  - "stack-detect.AREA_MARKERS (language/flag/tauri/cpp/generated marker data) and SKIP_DIRS"
  - "Object-form detect marker {file, contains} in the schema (anyOf string|object) and in stack-profile markerMatches/matchMarkersAt/pickExtends"
  - "flutter.md detects {file: pubspec.yaml, contains: \"sdk: flutter\"}: pure Dart picks dart, Flutter picks flutter"
  - "Component profile FILES walk their own extends chain (hops before the file, deduped against the root chain)"
  - "renderCommand joins component.path with the command cwd (the only place the join happens)"
affects: [42-07, 42-08]

tech-stack:
  added: []
  patterns:
    - "Non-language markers are flags on the nearest enclosing language area (or root), never areas/components"
    - "Two-pass detection: a bounded manifest walk (depth < maxDepth), then a bounded source scan (<=200 .go files, 5-line header check, Dart codegen by suffix)"
    - "Content markers stay generic in the loader: the loader reads `contains` text, only profile data knows what it means (P11 holds)"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/stack-detect.cjs
    - plugins/devflow/devflow/bin/lib/stack-detect.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-detect-fixtures.cjs
  modified:
    - plugins/devflow/devflow/schemas/stack-profile.schema.json
    - plugins/devflow/devflow/stack-profiles/flutter.md
    - plugins/devflow/devflow/bin/lib/stack-profile.cjs
    - plugins/devflow/devflow/bin/lib/stack-render.cjs
    - plugins/devflow/devflow/bin/lib/json-schema-lite.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-profile.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-init.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-profiles-content.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-render.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-verify.test.cjs

key-decisions:
  - "The walk skips the TRD's list globally (node_modules .git .dart_tool build vendor third_party .worktrees .planning example test_support android ios macos linux windows web), plus every other dot-dir for descent, plus any child with a `.git` file or dir. `.maestro/` is still seen as an entry of its parent."
  - "Depth: dirs at depth < maxDepth are read (root = 0), so product/go/go.mod (path depth 3) is found and a/b/c/go.mod is not"
  - "The C/C++-only note is a root entry with kinds [] (zero language areas), tier null, unsupported 'cpp', flag 'unsupported'. It fires only when no language area exists"
  - "Tauri = package.json + src-tauri/Cargo.toml in one dir: one area with kinds [node, rust], unsupported 'tauri'. src-tauri/ is not descended"
  - "An area with no tier gets the `unsupported` flag plus an `unsupported` field (tauri, else the first of python/rust/node present). A node package.json beside a pubspec/go.mod does not make that area unsupported"
  - "Extra flag `analysis_options` (analysis_options.yaml) and `generated` (Go `// Code generated ... DO NOT EDIT.` in the first 5 lines; *.g.dart/*.freezed.dart/*.gr.dart/*.mocks.dart) were added per 42-RESEARCH 1.4"
  - "An object marker's `file` must be a literal root entry, so a path-shaped `file` never matches and the content read cannot leave the root. A content marker with no root, or a read error, is no match"
  - "matchComponent appends `/` to a non-empty component path before the prefix test; component.path itself is reported unchanged"
  - "renderCommand leaves cwd alone for a root-shaped component path ('', './', '.') and for an absolute command cwd"

patterns-established:
  - "detectAreas is the single source of language areas for the drafter (42-07) and the report (42-08)"

requirements-completed: [SDR-01, SDR-04]

duration: ~45min
completed: 2026-09-28
---

# Objective 42 TRD 05: Codebase detection, Dart-vs-Flutter, and usable components Summary

**`stack-detect.detectAreas` walks a repo to depth 3. It reports language areas (go/dart/flutter tiers, unsupported python/rust/node/tauri/cpp) with helm/docker/buf/sqlc/golangci/maestro/integration_test/build_runner/go_generate/generated flags on the nearest area. flutter.md now detects `{file: pubspec.yaml, contains: "sdk: flutter"}`, so pure Dart picks `dart`. Component profile files inherit through `extends`, and component commands render with the component cwd.**

## Performance

- **Duration:** ~45 min (two executor sessions; the first hit its turn limit after Task 2)
- **Completed:** 2026-09-28
- **Tasks:** 3/3
- **Files modified:** 13 (3 created, 10 modified)

## Accomplishments

- `detectAreas(root, {maxDepth})` works over every 6.1/6.2 shape, built as invented fixtures: multi-area (svc/admin/portal/chart/sdk-python), pure-Dart sibling, depth-3 products, skip list, single root Go with buf/sqlc/go:generate, Tauri, C++-only, empty and docs-only. An unreadable or missing root never throws.
- Detect markers now accept an object form. The schema takes `anyOf` string | `{file, contains}`. `markerMatches` reads the file when `contains` is set. `pickExtends` renders the reason as `file(contains)`. repo-state and init.cjs needed no edits (regression test M4).
- A `.planning/stacks/svc.md` with `extends: go` now inherits go. The hop sits before the file layer and is deduped against the root chain.
- `renderCommand` joins `component.path` with `cmd.cwd`. 42-06's `stack verify` test 4 now sees `cwd: 'svc'`, never `svc/svc`. stack-verify.cjs is unchanged.

## Task Commits

1. **Task 1: detect fixtures + stack-detect.cjs**: RED `5b060ba`, GREEN `7780799`
2. **Task 2: object-form detect markers (schema, markerMatches, flutter.md)**: RED `da8c323`, GREEN `248d663`
3. **Task 3: component extends walk + component cwd join**: RED `906aa97`, GREEN `49dd22b`

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| T1 RED | `node --test .../stack-detect.test.cjs` | 1 (module missing) | FAIL (correct) |
| T1 GREEN | `node --test .../stack-detect.test.cjs` | 0 (16/16) | PASS (correct) |
| T2 RED | `node --test json-schema-lite stack-profile stack-init stack-profiles-content repo-state` | 1 (8 fail / 136) | FAIL (correct) |
| T2 GREEN | same | 0 (136/136) | PASS (correct) |
| T3 RED | `node --test stack-profile stack-render stack-verify` | 1 (5 fail / 154) | FAIL (correct) |
| T3 GREEN | same | 0 (154/154) | PASS (correct) |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: detectAreas | `node --test plugins/devflow/devflow/bin/lib/stack-detect.test.cjs` | 0 | PASS (16/16) |
| 2: object markers | `node --test json-schema-lite stack-profile stack-init stack-profiles-content repo-state` | 0 | PASS (136/136) |
| 3: component extends + cwd | `node --test stack-profile stack-render` (+ stack-verify) | 0 | PASS (154/154) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test 'bin/lib/stack-*.test.cjs' 'bin/lib/adopt-*.test.cjs' json-schema-lite repo-state` | 0 | PASS (776/776; P11 + C14 green) |
| build | `df-tools stack validate --profile stack-profiles/{flutter,dart,go}.md` | 0 | PASS (ok, no errors, no warnings, all three) |
| verification | `df-tools --cwd <tmp pure-Dart> stack init` / `--cwd <tmp Flutter> stack init` (fake HOME) | 0 | PASS (`extends: "dart"` / `extends: "flutter"`) |
| wave | `npm test` | 1 | PASS by the wave rule: tests 4816, pass 4783, fail 1, skipped 32. The one failure is the pre-existing handoff-e2e "PTY-path mock auth (TRD 19-05)" MA-7. Baseline was 4783/4750/1/32, so this TRD adds +33 tests, all passing |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] stack-verify test 4 fixture command assumed root cwd**
- **Found during:** Task 3 GREEN
- **Issue:** The component fixture's `test: make -C svc test` was written for the pre-join world. With the component cwd `svc`, it resolves `svc/svc/Makefile` and `stack verify` exits 1.
- **Fix:** Changed the fixture to `make test`, which runs in its component dir, and updated its `command` assertion. This is a test-only edit in stack-verify.test.cjs, which is in files_modified. stack-verify.cjs is untouched. The `cwd === 'svc'` and `!== 'svc/svc'` assertions are as the TRD specifies.
- **Files modified:** plugins/devflow/devflow/bin/lib/stack-verify.test.cjs
- **Commit:** 49dd22b

No files outside files_modified were touched (apart from this SUMMARY and ROADMAP.md).

## Issues Encountered

- `~/.claude/devflow/bin/df-tools.cjs` (the home mirror) does not accept the global `--cwd` flag, and the session cwd was the objective dir, so the first commit attempt failed on pathspecs. Every commit was made with the checkout's `plugins/devflow/devflow/bin/df-tools.cjs --cwd /Users/justin/dev/devflow-claude commit ... --files`. The failed attempt staged nothing.

## Post-TRD Verification

- Auto-fix cycles used: 1
- Must-haves verified: 7/7
- Gate failures: None

## Next Readiness

- 42-07 can call `detectAreas` and then emit `components: [{path: '<dir>/', profile: <tier>}]` for areas with a tier. Unsupported areas (the `unsupported` field) become notes.
- 42-08 can gate checks on `area.tier` / `area.kinds` / `area.flags`.

## Self-Check: PASSED

- Created files present: stack-detect.cjs, stack-detect.test.cjs, __fixtures__/stack-detect-fixtures.cjs
- Commits present: 5b060ba, 7780799, da8c323, 248d663, 906aa97, 49dd22b
