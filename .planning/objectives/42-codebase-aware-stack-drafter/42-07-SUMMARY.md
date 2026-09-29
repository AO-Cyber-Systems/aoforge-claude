---
objective: 42-codebase-aware-stack-drafter
trd: "07"
job: 42-07
subsystem: stack-drafter
tags: [stack-init, drafter, evidence, verification, components, adopt, e2e]

requires:
  - objective: 42-codebase-aware-stack-drafter
    provides: "42-02 bundled go/dart/flutter tiers; 42-03 stack-shell/stack-ci/stack-classify; 42-04 stack-runners + hasTarget; 42-05 stack-detect.detectAreas + component walk/cwd join; 42-06 stack-verify.verifyCommand/describeInvocation"
provides:
  - "stack-draft.assembleDraft({areas, evidence, tierCommands, verify, extendsId}) -> {extendsId, components, commands, loop?, notes, sources, resolvedKeys, inheritedKeys} (pure; verify injected)"
  - "stack-evidence.collectEvidence(root, {from, areas}) -> structured items {key, command, form, source, sourceFile, cwd, area, runner, confidence, weak, tool}"
  - "stack-profile.draftProfile/initProfile accept verifyOpts/verify and return notes/resolvedKeys/inheritedKeys; renderDraftBody exported"
  - "adopt marker.scaffold.stack gains resolved_keys/inherited_keys/notes; report emits one low row per note"
  - "__fixtures__/stack-drafter-fixtures.cjs: whole-repo failure-shape builders + fakeToolchain/fakeEmptyHome"
affects: [42-08 report, 42-09 stack mcp, 42-11 fleet rollout]

tech-stack:
  added: []
  patterns:
    - "Draft = detect areas -> structured evidence -> rank -> verify -> emit; the loader only wires it (lazy requires, P11 intact)"
    - "Evidence is typed by source kind (declared/runner/ci/manifest/docs) with the file in sourceFile"
    - "A command that cannot be represented (component-specific, unverified) becomes a note, never a guess"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/stack-draft.cjs
    - plugins/devflow/devflow/bin/lib/stack-draft.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-drafter-e2e.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-drafter-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/stack-evidence.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-profile.cjs
    - plugins/devflow/devflow/bin/lib/stack-init.test.cjs
    - plugins/devflow/devflow/bin/lib/adopt.cjs
    - plugins/devflow/devflow/bin/lib/adopt-scaffold.test.cjs
    - plugins/devflow/devflow/bin/lib/adopt-report.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-verify.test.cjs

key-decisions:
  - "A candidate EQUAL to the tier default's run (or a runner target whose body is that text) stops the walk and the key stays inherited, so the tier's scoped form survives"
  - "A re-emitted command run by the same tool as the tier default (not behind a runner) keeps the tier's scoped/apply forms"
  - "Runner-target candidates are invoked from their own dir (`make test` + cwd), matching 42-05's component cwd semantics"
  - "Single non-root area: every runnable tier command is re-emitted with the area cwd, not only the keys with candidates"
  - "Multi-area: only root-area items fill root keys; e2e/lint_helm/lint_docker also come from non-component areas with their cwd; everything else is one note per (area, key) unless equal to that area's tier default"
  - "A `${{ }}` command is unverifiable without asking the verifier"
  - "gosec collapses into audit only when no audit candidate exists anywhere (accepted SDR-02 deviation, per the TRD)"
  - "adopt report: no missing-evidence row for a key that has evidence (its unverified candidate already has a note row)"

patterns-established:
  - "Note shape {area, key, candidate, status, detail, source, weak?}; status is a verify status or info"

requirements-completed: [SDR-01, SDR-02, SDR-03, SDR-05]

verification:
  gates_defined: 4
  gates_passed: 4
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: ~25min
completed: 2026-09-29
---

# Objective 42 TRD 07: Drafter integration (grounded, verified `stack init`) Summary

**`stack init` now detects areas, reads CI, runner and manifest evidence by tool semantics, ranks each key (declared > runner > ci > manifest > docs > tier default), and verifies every candidate before proposing it. Unverifiable candidates become `run: discover` plus a note. Drafts extend the detected tier and name components by tier id. `stack init` writes only `.planning/STACK.md`. An e2e suite proves ROADMAP criterion 1 on 11 invented fleet failure shapes.**

## Performance

- **Duration:** about 25 min (the executor was resumed once, after the Task 1 GREEN code was written)
- **Started:** 2026-09-29T03:31Z
- **Completed:** 2026-09-29
- **Tasks:** 3/3, each RED then GREEN (6 commits)
- **Files:** 4 created, 8 modified

## Accomplishments

- **`collectEvidence` returns structured items.** It reads declared STACK.md rows, then runner targets. A runner target is classified by its BODY; its name counts only as a low-confidence tiebreaker, and a target whose body only echoes is dropped. Next come CI invocations from `parseWorkflows`: a `make x`, `npm run x` or `./scripts/x.sh` step is classified by the body it runs. Then package.json scripts (as manifest) and TESTING.md fences (as docs). Each item carries cwd, area, form, runner, confidence, weak and tool.
- **`assembleDraft` is pure, with an injected verifier.** It decides extends and components, ranks candidates, and verifies them with a cache. It also covers:
  - weak-gate notes;
  - `${{ }}` rejection;
  - the sast-to-audit collapse;
  - maestro only when `.maestro/` exists;
  - cwd for a single non-root area;
  - `when` for codegen/deps;
  - `loop` for a general extends;
  - resolved and inherited key lists.
- **`draftProfile` runs the whole pipeline.** It chains detectAreas, per-area `pickExtends`, collectEvidence, per-tier resolved commands and assembleDraft. The verifier is stack-verify with `verifyOpts`, or an injected `verify`. The body gains a notes comment capped at 40 lines. `provenance.sources` now lists evidence files.
- **adopt consumes the draft.** It records draft keys and notes, and the report turns each note into a low row.

## Task Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 | RED | f757f72 | test(42-07): add failing tests for structured collectEvidence and whole-repo drafter fixtures |
| 1 | GREEN | d1df35e | feat(42-07): recompose collectEvidence from stack-ci, stack-runners and stack-classify |
| 2 | RED | b8195d3 | test(42-07): add failing tests for assembleDraft and grounded draftProfile/initProfile |
| 2 | GREEN | 9a9333f | feat(42-07): assemble grounded, verified drafts in stack-draft and wire draftProfile/initProfile |
| 3 | RED | f9f7cc0 | test(42-07): add e2e failure-shape suite and failing adopt draft-integration tests |
| 3 | GREEN | 6b73ffc | feat(42-07): adopt scaffold/report consume the grounded draft |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixtures + collectEvidence | `node --test plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs` | 0 (14/14) | PASS |
| 2: stack-draft + draftProfile | `node --test stack-draft.test.cjs stack-init.test.cjs stack-profile.test.cjs` | 0 (95/95) | PASS |
| 3: e2e + adopt | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` | 0 (769/769) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED T1 | `node --test .../stack-evidence.test.cjs` (6 of 14 failing: E1, E6-E8, E11, E12) | 1 | FAIL (correct) |
| GREEN T1 | same (14/14) | 0 | PASS (correct) |
| RED T2 | `node --test stack-draft stack-init stack-profile` (stack-draft.cjs missing; I16a-c failing) | 1 | FAIL (correct) |
| GREEN T2 | same (95/95) | 0 | PASS (correct) |
| RED T3 | `node --test stack-drafter-e2e adopt-scaffold adopt-report` (adopt 17 x2 failing) | 1 | FAIL (correct) |
| GREEN T3 | stack/adopt subset (769/769) | 0 | PASS (correct) |

Two tests passed in their RED commits, and each is called out in its commit body:
- **I7c.** The existing serializer already emits `components` as a flow array of flow maps that round-trips exactly. I7c stays as a regression pin.
- **The e2e suite (tests 1-10).** The drafter logic it proves landed in the Task 2 GREEN commit. The Task 3 RED failures are the adopt test-17 cases.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none (the repo has no lint command) | n/a | n/a |
| test | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` (769) | 0 | PASS |
| build | `node plugins/devflow/devflow/bin/df-tools.cjs stack validate --profile .planning/STACK.md` | 0 (`ok: true`) | PASS |
| wave | `NODE_PATH=/Users/justin/dev/devflow-claude/node_modules npm test` | 1 (known failure only) | PASS (by the wave rule) |

The full suite reported tests 4857, pass 4824, fail 1, cancelled 0, skipped 32. The baseline was 4816 / 4783 / 1 / 32, so the delta is exactly +41 tests, all of them passing. The single failure is the pre-existing `MA-7 doctl auth init ...` case in the `handoff pipeline - PTY-path mock auth (TRD 19-05)` suite, which this TRD does not touch. No roadmap-reconcile failure appeared. The worktree has no node_modules, so the run used `NODE_PATH=/Users/justin/dev/devflow-claude/node_modules`, and nothing was installed.

**Read-only smoke:** `df-tools --cwd /Users/justin/dev/dfip stack init --raw` (preview, no `--write`) drafted `extends: "go"`, `build: make build`, `test: make test` and no fragments. Afterwards `git -C /Users/justin/dev/dfip status --porcelain` was empty.

## e2e outcomes (fake PATH of stub tools, empty HOME)

| Shape | extends | Key result |
|---|---|---|
| multi-area CI (aocore) | general | components admin/ and app/ (flutter), svc/ (go); `lint_helm: helm lint chart/`. Playwright is e2e (`discover`: no npx on PATH, noted). gosec is a `sast` note on svc/, and the wrapper script is the audit. There is no format key. |
| fragment build (eden-biz) | general | components api-dart/ (**dart**), app/ (flutter), svc/ (go); no root commands; the component builds are notes. No `${{` in any run. |
| comment test (devflow) | go | `commands: {}`: go vet and the gofmt gate equal the tier, so both are inherited. No comment is evidence. |
| echo release (aoinference) | go | `make lint/test/build` with `cwd: control-plane`; the rest of the go tier is re-emitted with that cwd; no echo. |
| control fragment (eden-circle) | go | `test: make test`; no `test -f`/`{`/`}`/`exit`/`echo` evidence |
| continuation + sed | go | `test: go test -race -coverprofile=cover.out ./...` (joined, tier scoped kept); sed never classified |
| manifest-only Flutter + .maestro | flutter | only `e2e: maestro test .maestro`; `stack resolve` shows the flutter chain and the `dart` MCP server |
| empty / docs-only | general | `commands: {}` plus an info note, exit 0 |
| gosec-only | go | `audit: gosec -exclude=G104 ./...`, no sast |
| ginkgo missing | go | `test: discover`; a `binary_missing` note; the body comment names `ginkgo -r -p` |

## Deviations from Plan

### Auto-fixed / auto-added (Rules 1-3)

**1. [Rule 1 - obsolete test outside files_modified] stack-verify.test.cjs `--draft` case**
- **Found during:** Task 2 GREEN (subset run)
- **Issue:** `a draft command whose target is missing is reported missing (exit 1)` assumed the pre-42-07 draft, which proposed `make test` without verifying it. The drafter now uses the same resolver and env before proposing a command, so it drafts `test: discover` and `stack verify --draft` exits 0.
- **Fix:** The case is rewritten to assert the new contract: an unresolvable draft candidate is proposed as `discover` and verify exits 0. This is a test-only change; stack-verify.cjs is untouched.
- **Files modified:** plugins/devflow/devflow/bin/lib/stack-verify.test.cjs (not in files_modified)
- **Commit:** 9a9333f

**2. [Rule 3 - test hermeticity] Fake PATH holds only stub tools, not stubs plus the node dir**
- **Issue:** The TRD suggests `PATH = fakeToolchain dir + node dir`. On Homebrew or nvm installs the node dir also holds real tools (npm, npx, and possibly ginkgo or gosec), which would make the binary_missing cases machine-dependent.
- **Fix:** The e2e suite spawns `process.execPath` directly with `PATH = stub dir only`. stack-init I12 does the same with a `go` stub.

**3. [Rule 2 - design completions the TRD left implicit]**
- **Tier-default equality.** Equality also covers a runner target whose body IS the tier run. This keeps I6's intent: the inherited scoped form survives.
- **Scoped/apply on same-tool re-emits.** A re-emitted command run by the same tool keeps the tier's `scoped`/`apply`. This keeps I12's DoD, `stack command test --packages ./pkg` gives `go test -race ./pkg`.
- **Single non-root area.** Every runnable tier command is re-emitted with the cwd. Otherwise the inherited go commands would run at a root with no go.mod.
- **`${{ }}` commands** are unverifiable.
- **CI `continue-on-error`** marks an item weak.
- **The adopt report** gives no missing-evidence row for a key that has evidence; its note row explains the key instead.

### Updated test expectations (the old value was the defect; each is justified in its commit body)

- **E1, E6, E7:** `source` is now the evidence kind. The file moved to `sourceFile`, as the TRD's item shape specifies.
- **E8:** `ci test` and `maketool test` classified only through the English token `test`. The test now uses real tools and asserts runner > ci > manifest, where 35-04 was CI-first.
- **I6:** 35-04 proposed an unverified `make lint` with no Makefile and dropped all evidence for keys the parent had already resolved. The test now asserts an inherited key when the candidate equals the parent run, and a filled key from a real Makefile target.
- **I12:** stack init now needs a verifiable `go`, supplied by a stub PATH.

## Auth Gates

None.

## Known Limitations

- **Per-component commands are notes, not commands.** `stack init` never writes `.planning/stacks/*.md`, so a component's repo-specific command is only a note. So is a root command pointed into a component, because the 42-05 renderCommand joins component.path with cmd.cwd.
- **Each (area, key) note covers only the best-ranked candidate.** Lower-ranked candidates in a component or unsupported area are not listed.
- **Runner bodies are classified by their first recognised invocation.** A `check:` target that runs vet then test counts as `lint`.
- **Runner files are read two levels deep (`maxDepth: 2`).** detectAreas reads three.

## Post-TRD Verification

- Auto-fix cycles used: 1 (the stack-verify `--draft` test)
- Must-haves verified: 9/9. Each truth maps to e2e tests 1-10 plus D11-D20, I16 and adopt 17. The artifacts and key_links are present. P11 is green, and stack-draft.cjs requires no stack-profile or fs.
- Gate failures: none beyond the known MA-7 handoff-e2e case

## Self-Check

- FOUND: stack-draft.cjs, stack-draft.test.cjs, stack-drafter-e2e.test.cjs, __fixtures__/stack-drafter-fixtures.cjs
- FOUND: commits f757f72, d1df35e, b8195d3, 9a9333f, f9f7cc0, 6b73ffc on df/exec-42-07
- STATE.md and ROADMAP.md were not edited (the orchestrator owns them). No fleet repo was written to.

## Self-Check: PASSED
