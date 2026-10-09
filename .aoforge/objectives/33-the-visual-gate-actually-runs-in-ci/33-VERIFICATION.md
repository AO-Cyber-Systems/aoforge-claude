---
objective: 33-the-visual-gate-actually-runs-in-ci
verified: 2026-09-28
status: passed
score: 22/22 truths verified against current tree (0 missing, 0 superseded-away)
re_verification: false
verifier: 41-04 (retroactive, independent)
gaps: []
superseded:
  - item: "33-01 lookup order (evidence/ui_eval/manifest.json only)"
    by: "06ee9cc fix(ui-eval): never resolve an unscoped repo manifest — adds Tier-3 `ui_eval/manifests/*.manifest.json` + `flutter/ui_eval/manifests/*.manifest.json` to searched[]; a match reports absent + reason:'unscoped-candidates' and is never auto-picked. Extension; all four 33-01 statuses unchanged"
  - item: "handler skip JSON shape"
    by: "5a80ef7 / 8b5bd88 — engine_version + schema_version stamped on resolution-skip and rollup output (additive)"
  - item: "Step 8c routing list"
    by: "9d650a7 fix(72) known_broken[] bullet; 35-07 (d424cf1) and 38-05 (7c3d83e) touched verifier.md elsewhere. Four-resolution table and binding rule intact"
deferred:
  - id: D1
    item: "gate:'binding' in CI depends on objective 32's unmet ANTHROPIC_API_KEY deferral (32-VERIFICATION D1)"
    note: "33's goal (gate executes instead of routing to SKIPPED) holds; the gate runs advisory in CI. Not a 33 gap."
notes:
  - "No objective in this repo is type:ui + stack:flutter, so Step 8c resolves not_applicable for all 47 objective dirs. The visual gate has no real surface to judge here yet; its contract is pinned in CI via npm test (test.yml -> scripts/ci-unit-gate.cjs), which runs verifier-ui-eval-invocation and flutter-ui-eval-resolve tests."
  - "The CLI rollup does not echo the parsed `manifest` field (has_manifest=false on CLI output). This is correct: the M8 contract is on resolveUIEvalTarget's return value, which carries it (probe below)."
---

# Objective 33: The visual gate actually runs in CI — Verification Report

**Goal (ROADMAP):** verifier Step 8c invokes the visual-eval engine with something the engine can load, so the gate executes instead of routing to SKIPPED.
**Verified:** 2026-09-28, against `feat/stack-profile-loader` working tree (engine_version 2.10.1)
**Status:** passed
**Re-verification:** No (retroactive initial)

## Re-executed evidence (offline only)

| # | Command / action | Result |
|---|---|---|
| E1 | `node --test bin/lib/flutter-ui-eval-resolve.test.cjs` | 24/24 pass (A1-A4, M1-M8, C1-C6, R1) |
| E2 | `node --test bin/lib/verifier-ui-eval-invocation.test.cjs` | 14/14 pass (V1-V4, S1-S6, S-exactly-one) |
| E3 | `df-tools verify flutter-ui-eval 33 --raw` | **exit 0**; `resolution:"not_applicable"`, `reason:"no type:ui + stack:flutter TRD"`, `ok:true` (32 and 41 same) |
| E4 | Loop over all 47 `.planning/objectives/*` ids | 47/47 `not_applicable`, rc=0; zero non-NA |
| E5 | **Independent Step 8c execution** (scratchpad run8c.sh): awk-extracted the Step 8c block from verifier.md, verbatim line `UI_EVAL=$(node ~/.claude/devflow/bin/df-tools.cjs verify flutter-ui-eval "$OBJECTIVE" --raw)`, swapped only the binary for the repo copy, `eval`'d it against hand-built fixture objectives | 77 (ui+flutter, json manifest) -> `resolved`, verdict `pass`, `gate:advisory`, rc 0 · 78 (ui, no manifest) -> `absent`, searched[] = 3 locations, rc 0 · 79 (manifest.yaml only) -> `invalid`, `yaml-manifest-unsupported`, rc 0 · 80 (malformed json) -> `invalid`, JSON parse reason, rc 0 · 81 (tdd, no ui) -> `not_applicable`, rc 0 |
| E6 | Direct `resolveUIEvalTarget` probe on the same tree | resolved results carry `manifest` (`states` is an Array); absent/invalid/not_applicable carry no `manifest`; explicit file path -> `manifest_path` VERBATIM + `manifest` |
| E7 | Direct `classifyUIEvalOutcome` probe | not_applicable->`skip` silent · absent+!visual_gate->`missing`, keeps_human_verification, todo · absent+visual_gate->`gap` · invalid->`gap` carrying reason · resolved->`score` |
| E8 | `rg` resolve module requires | fs, path, ./objective.cjs `findObjectiveInternal`, ./frontmatter.cjs `extractFrontmatter`, ./flutter-ui-eval.cjs `loadManifest`; no fetch/http/yaml parser |
| E9 | `rg` flutter-ui-eval.cjs | handler requires resolver (:705-706), consumes `target.manifest` (:757), `target.manifest_path` (:756) |
| E10 | `rg` verifier.md | :593 invocation; :600-607 four-resolution table incl. MISSING, ratchet, invalid->gap; :619-620 binding-only rule |
| E11 | `rg` workflows/ui-eval.md | :34 delegates to `resolveUIEvalTarget`; :38 `evidence/ui_eval/manifest.json`; :41 "The engine reads JSON, not YAML" |

## Observable truths

| TRD | # | Truth (condensed) | Status | Evidence |
|---|---|---|---|---|
| 33-01 | 1 | No ui+flutter TRD -> `not_applicable` | VERIFIED | E6 (81), E3 |
| 33-01 | 2 | UI TRDs, no manifest -> `absent` + `searched[]` naming every location | VERIFIED | E5/E6 (78) |
| 33-01 | 3 | evidence/ui_eval/manifest.json -> `resolved`, manifest_path, parsed manifest | VERIFIED | E6 (77) |
| 33-01 | 4 | Unparseable -> `invalid` + reason, distinct from absent | VERIFIED | E6 (80) |
| 33-01 | 5 | yaml without json sibling -> `invalid`, `yaml-manifest-unsupported` | VERIFIED | E6 (79) |
| 33-01 | 6 | Existing file arg -> `resolved`, path verbatim, with manifest | VERIFIED | E6 explicit-path row |
| 33-01 | 7 | `manifest` on every resolved, absent on every non-resolved | VERIFIED | E6; M8 in E1 |
| 33-01 | 8 | FS only, no network, no new dep, no YAML parser | VERIFIED | E8; R1 |
| 33-02 | 1 | Test extracts Step 8c command, substitutes $OBJECTIVE, executes it | VERIFIED | verifier-ui-eval-invocation.test.cjs:131-166; E2; independently reproduced E5 |
| 33-02 | 2 | RED recorded verbatim (`manifest/captureResults not found`) | VERIFIED (record) | 33-02-SUMMARY.md:313 |
| 33-02 | 3 | Extracted invocation + manifest -> `resolved` + rollup verdict | VERIFIED | E5 (77) |
| 33-02 | 4 | Extracted invocation, UI TRDs, no manifest -> `absent`, exit 0 | VERIFIED | E5 (78) |
| 33-02 | 5 | Manifest-path callers unchanged | VERIFIED | 32 dogfood 22/22 pass; 32-VERIFICATION E4 |
| 33-02 | 6 | Inverted differential control, clean restore | VERIFIED (record) | 33-02-SUMMARY.md:200-290 |
| 33-03 | 1 | not_applicable -> skip, silent, exit 0 | VERIFIED | E7, E3 |
| 33-03 | 2 | absent + !visual_gate -> missing, stays on human list, todo | VERIFIED | E7 |
| 33-03 | 3 | absent + visual_gate -> gap | VERIFIED | E7 |
| 33-03 | 4 | invalid -> gap with reason, differs from absent | VERIFIED | E7 |
| 33-03 | 5 | Step 8c prose names all four resolutions; grep test pins it | VERIFIED | E10; S1-S5 |
| 33-03 | 6 | 32-03 binding-only rule preserved | VERIFIED | verifier.md:619-620; S6 |
| 33-03 | 7 | workflows/ui-eval.md delegates, names .json not .yaml | VERIFIED | E11 |
| 33-03 | 8 | Against this repo, `verify flutter-ui-eval <current objective>` -> not_applicable, exit 0 | VERIFIED | E3, E4 (47/47) |

**Score:** 22/22

## Key links

| Link | Status | Evidence |
|---|---|---|
| resolver -> findObjectiveInternal / extractFrontmatter (reuse, no re-glob) | WIRED | E8 |
| handler -> resolveUIEvalTarget -> target.manifest into scoring loop | WIRED | E9 |
| resolution status -> ok:true envelope (not {error}) | WIRED | E3, E5 |
| Step 8c bash block -> executing test (V4 guard) | WIRED | E2, E5 |
| resolveUIEvalTarget -> classifyUIEvalOutcome -> Step 8c table | WIRED | E7, E10, S-cases |

## Anti-patterns

None found in flutter-ui-eval-resolve.cjs.

## Human verification

None specific to 33. The binding-in-CI credential is objective 32's D1.

_Verified: 2026-09-28 · Verifier: Claude (41-04, retroactive)_
