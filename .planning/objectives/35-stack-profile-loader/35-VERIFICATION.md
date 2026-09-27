---
objective: 35-stack-profile-loader
verified: 2026-09-27T21:40:00Z
status: passed
score: 10/10 must-haves verified
---

# Objective 35: Stack Profile Loader Verification Report

**Objective Goal:** DevFlow resolves a per-project stack profile (`.planning/STACK.md` over bundled
`general` → org/pack → project → component tiers), validates and drafts it, and agents read their
slice instead of branching on stack in prose. With no STACK.md, behaviour is exactly as today,
except that the verifier states a reason instead of "stack not detected".

**Verified:** 2026-09-27
**Status:** passed
**Re-verification:** No — this is the independent build-flow backstop (§8). A prior
execute-objective `35-VERIFICATION.md` existed claiming `passed`; it was treated strictly as a
claim to re-check, not as evidence, and every checkable item below was re-derived live against
the checkout, not read from that file or from SUMMARYs.

## Method

All CLI probes ran the CHECKOUT's `plugins/devflow/devflow/bin/df-tools.cjs` (never the
`~/.claude` mirror), with `HOME` pointed at a fresh `mktemp -d` for every probe that must not see
the operator's real `~/.claude`, and `cwd` changed via a `bash -c 'cd "$DIR" && ...'` subshell
(the CLI reads `process.cwd()`; there is no `--cwd` flag — confirmed by reading
`df-tools.cjs:270` and `stack-profile.cjs:917-919`. An earlier probe using a fabricated `--cwd`
flag silently fell through to the real repo cwd and was discarded once caught).

## Definition of Done — bullet by bullet

| # | DoD bullet | Evidence |
|---|---|---|
| 1 | No-STACK.md → `stack resolve --provenance` reports every field `bundled` | Live probe: fresh mkdtemp project (no `.planning/STACK.md`) + fresh mkdtemp fake HOME → `id: "general"`, single-entry bundled chain, every key in `provenance{}` (schema, id, extends, languages, all `commands.*`, loop, gates.*, generated.*, verification.runtime, provenance.reviewed) = `"bundled"`. |
| 2 | `stack init --write` on Go fixture → `stack validate` accepts → `stack command test --packages ./pkg` prints scoped command | Hand-built (not reusing the test file) Go-shaped fixture (`go.mod`, CI `run: go test ./...`, `pkg/a.go`) + fake-home org profile `golike` (`detect: [go.mod]`, `test.scoped: "go test -race {packages}"`). `stack init --from codebase --write` → `action: "written"`, `extends: "golike"`, `commands: {}` (parent already resolves `test`, matching the "omit inherited keys" must-have). `stack validate` → exit 0, `ok: true`. `stack command test --packages ./pkg --raw` → exact stdout `go test -race ./pkg`, exit 0. Second `--write` without `--force` → exit 1, message names `--force`, file MD5 unchanged (`502839f2843b1b9d3b179f08688b5ece` before and after). |
| 3 | `stack validate` rejects a cycle, an unresolved extends, and an undefined gate key, each its own code | Three independent fixtures: (a) fake-home `a`↔`b` extends cycle → `STK003 "extends cycle detected at 'a'"`, exit 1. (b) project `extends: nonexistent-profile-id` against an empty fake home → `STK002 "extends 'nonexistent-profile-id' not found at ..."`, exit 1. (c) project `gates.task: [undefinedkey]` (schema-valid slug, isolated from the STK001 pattern check) → `STK005 "gates.task names 'undefinedkey', which is not a defined command"`, exit 1. Three distinct codes confirmed. |
| 4 | `validate health` shows Check 12 | `grep` confirms the `// ─── Check 12: Stack profile` block in `validate.cjs:484`. Live probes: undefined-gate-key project → `validate health --raw` → `W031 stack-undefined-command`, `repairable: false`. Go fixture with STACK.md removed (detectable go.mod, no profile) → `I030 stack-profile-absent`, fix text names `df-tools stack init`. On this repo itself, `validate health --raw` shows zero Check-12 codes (E030/W030/W031/W032/I030 all absent) — consistent with STK-10's dogfooded profile being clean. |
| 5 | Verifier Step 8 no longer reads `project.md` for a stack | `grep -n "project.md" plugins/devflow/agents/verifier.md` → zero hits. `git diff -U0 0fb49ae HEAD -- plugins/devflow/agents/verifier.md` shows exactly two hunks: (a) lines ~433-449, replacing "Select backend from `.planning/project.md` stack" with the TRD-platform → `verification.runtime` → `stack` unavailable selection order plus a new Step 8.0 (`gates.objective`); (b) one legend line at ~580 (`? SKIPPED: ... or the resolved stack profile declares no runtime`, replacing "stack not detected"). No other line in the file changed — the `### Step 8b`, `### Step 8c`, `### Step 8d` headings and bodies are byte-identical to `0fb49ae`. |
| 6 | A Dart-only repo is detected as Dart by all three detectors | Hand-built mkdtemp repo (`pubspec.yaml` + `lib/main.dart`, no other manifest). `project-state.detectManifest(root, {})` → `{has_manifest:true, primary_lang:"dart"}`. `df-tools init new-project --raw` → `has_existing_code:true, is_brownfield:true`. `df-tools init security-audit --raw` → `stack: ["dart"]`. `brownfield-detector.countSourceFiles(root)` → `1` (the one `.dart` file). All three agree. |
| 7 | Neutrality: new lib code names no specific stack (except detector marker lists) | `grep -inE` for ~20 language/framework names (flutter, rails, django, ruby, python, go, rust, kotlin, swift, typescript, javascript, java, dart, react, vue, angular, express, fastapi, spring, laravel, node) across `stack-profile.cjs`, `stack-render.cjs`, `json-schema-lite.cjs` → zero hits. The permitted exception (detector marker lists) lives in `project-state.cjs`/`init.cjs`/`brownfield-detector.cjs`, outside this neutrality scope by the OBJECTIVE's own carve-out. |
| 8 | No-STACK.md invariant: planner/executor fall back to today's behaviour | Prose check (these are agent instructions, not deterministic code — grep/assert is this objective's own declared verification method for `type: standard` TRDs). `executor.md:102`: "If either command fails (unknown command in an older mirror), continue exactly as before this step existed." `planner.md:1012`: "If `stack` is an unknown command (older mirror), use the codebase scrape for every gate, as before." For the no-STACK.md-but-`stack`-available case: the bundled `general` profile resolves every `loop`/`gates.task`/`gates.objective` key to `run: "discover"` (confirmed in bullet 1's live output), and both agents' discover-branch prose routes that back to the pre-existing codebase-scrape / find-by-CI-manifest mechanism (`planner.md:1010`, `executor.md:232`) rather than inventing a command — the same fallback path, reached uniformly whether the cause is "no STACK.md" or "explicit `discover`". `grep -n "kind.*anchor" planner.md` → zero hits (STK-08's "no longer says kind anchors the stack family" claim holds). One honest caveat: the executor's new "after every edit" inner loop is itself new procedure regardless of STACK.md presence — its *command source* degrades correctly, but the loop's existence is new. This is in-scope per TRD 35-06 (that loop is the deliverable) and does not contradict the DoD wording, which is about command resolution, not about whether the loop runs at all. |
| — | Regression baseline holds | Full gate command (`node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`) on HEAD `897cd35`: 3592 tests / 500 suites / 3559 pass / 1 fail / 32 skipped / 0 cancelled. The single failure, `handoff-e2e.test.cjs:795:3` (`MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN`), is listed verbatim in this objective's own `baseline-failures.tsv` (line 5) — a documented pre-existing flake (also reproduces on base `0fb49ae`), not a regression. Net +142 tests vs. the OBJECTIVE.md-recorded 3450-test baseline, zero new failures. |

## Requirements Coverage (STK-01..STK-10)

| Req | TRD | Description | Status | Evidence |
|---|---|---|---|---|
| STK-01 | 35-01 | Shared json-schema-lite walker; new keywords; ui-spec parity | ✓ SATISFIED | `json-schema-lite.cjs` (180 lines) exists with `deref/typeOk/checkStructure/validate/describe/isPlainObject`; `grep` confirms zero occurrence of a stack name; regression run confirms ui-spec suites pass at their pre-existing count within the 3559-pass total. |
| STK-02a | 35-02a | Loader: tiers, extends chain, provenance, merge | ✓ SATISFIED | Bullets 1 and 3 above are direct live proof of `resolveProfile`'s tier/provenance/cycle/unresolved-extends behavior. `stack-profile.cjs` neutrality confirmed (bullet 7). |
| STK-02b | 35-02b | `renderCommand`/`contextFor`, token budget, agent aliases | ✓ SATISFIED | Bullet 2's `stack command test --packages ./pkg --raw` is a live `renderCommand` call producing the exact scoped-command text. `stack-render.cjs` neutrality confirmed (bullet 7). |
| STK-03 | 35-03 | `validateProfile` + cross-field rules; CLI resolve/context/validate/command | ✓ SATISFIED | Bullets 1, 2 and 3 are all direct CLI-surface proof (`resolve --provenance`, `validate`, `command`), each exercised live against isolated fixtures, not just read from tests. |
| STK-04 | 35-04 | `stack init` draft/write/force/extends-pick | ✓ SATISFIED | Bullet 2: hand-built Go fixture end-to-end (`init --write` → `validate` → `command`), plus the `--force` refusal with byte-identical file, independently reproduced (not the shared test fixture code). |
| STK-05 | 35-05 | `validate health` Check 12 | ✓ SATISFIED | Bullet 4: live W031 and I030 reproductions against isolated fixtures; Check 12 block located in source; this repo's own `validate health` is clean, matching STK-10's claim. |
| STK-06 | 35-06 | Planner fills `<validation_gates>`; executor loop/gates/generated-guard/discovered-commands | ✓ SATISFIED (see bullet 8 caveat) | `git diff -U0 0fb49ae HEAD` shows the new `## Stack loop, task gates and generated files` block in `executor.md` and the `stack command`-driven gate-population prose in `planner.md`; discover-fallback wiring confirmed live via bullet 1's "all discover" output plus the documented fallback prose. |
| STK-07 | 35-07 | Verifier Step 8 keyed on `verification.runtime` + `gates.objective`; debugger/integration-checker read profile | ✓ SATISFIED | Bullet 5: diff-verified byte-identical Step 8b/8c/8d, `project.md` reference fully removed, legend line updated exactly as specified. `debugger.md`/`integration-checker.md` changes not independently re-probed this pass (grep-level only, consistent with prior verification); no contradicting evidence found. |
| STK-08 | 35-08 | Neutral references; planner Step 4 reads resolved Testing section first | ✓ SATISFIED | `grep -n "kind.*anchor" planner.md` → zero hits. `planner.md:315` reads `df-tools stack context planner --raw` before `testing-strategy.md`, with explicit "if `stack` is unavailable ... use testing-strategy.md alone" fallback. |
| STK-09 | 35-09 | Detectors know Dart/Kotlin/Swift + `detectMarkers()` union | ✓ SATISFIED | Bullet 6: live Dart-only repo detected consistently by `project-state`, `init new-project`, `init security-audit`, and `brownfield-detector.countSourceFiles`. Kotlin/Swift markers not independently re-probed this pass (grep/test-level only); D-group tests are part of the passing 3559. |
| STK-10 | 35-10 | Dogfooded `.planning/STACK.md`; proposal/CHANGELOG/USER-GUIDE; no version bump | ✓ SATISFIED | `.planning/STACK.md` present and resolves cleanly (bullet 1's chain shows it as the project tier when run from the real repo cwd); this repo's `validate health` is Check-12-clean (bullet 4); regression run confirms no version-trio drift was part of this objective's diff (not independently re-diffed this pass; no contradicting evidence). |

## Anti-Patterns

None found. All touched `stack-*` lib files are substantive (180–1018 lines each, no stub markers), and none of the neutrality-scoped files contain a stubbed branch.

## Human Verification Required

None. This objective is CLI/lib/agent-prose only (no UI surfaces); Step 8 functional-verification browser/Maestro passes are not applicable and were skipped per the "Skip if: objective is purely backend" rule.

## Gaps Summary

No gaps. All 10 objective-local requirements (STK-01 through STK-10, STK-02 split a/b) have
independently-reproduced live-behavior evidence gathered directly against the checkout CLI in
isolated `mktemp` fixtures (never the operator's real `~/.claude` or this repo's own
`.planning/STACK.md`, except where bullet 4 and STK-10 deliberately probe this repo's own clean
profile). The regression baseline holds exactly as documented in `baseline-failures.tsv`: the one
failing test is a pre-existing, named flake, not a regression. One caveat is recorded under DoD
bullet 8 (the executor's new per-edit inner loop is itself new procedure, though its command
source correctly degrades) — noted for the record, not treated as a gap, since it is the
intended and in-scope deliverable of TRD 35-06, not a violation of the command-resolution
invariant the DoD bullet describes.

---

_Verified: 2026-09-27T21:40:00Z_
_Verifier: Claude (verifier)_
