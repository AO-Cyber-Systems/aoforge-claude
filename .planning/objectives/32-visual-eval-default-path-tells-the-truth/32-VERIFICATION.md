---
objective: 32-visual-eval-default-path-tells-the-truth
verified: 2026-09-28
status: human_needed
score: 23/23 truths verified (22 live against current tree + 1 superseded by current baseline; 0 missing)
re_verification: false
verifier: 41-04 (retroactive, independent)
gaps: []
superseded:
  - item: "32-03 Step 8c routing prose (single SKIPPED line for any {error})"
    by: "Objective 33 (33-03) rewrote Step 8c around four resolutions; 32-03's binding-only clearance rule survives verbatim (verifier.md:619-620, pinned by verifier-ui-eval-invocation Case S6)"
  - item: "32-04 truth: 'Step 8c routes a not-found manifest {error} to SKIPPED'"
    by: "Objective 33 (33-02): not-found now returns named `resolution` on ok:true envelope; dogfood Case X4 re-pointed, still asserts exit 0"
  - item: "32-04 truth: 'full bin/lib suite green apart from three known pre-existing failures'"
    by: "Current CI baseline (scripts/ci-unit-gate.cjs allowlist, test.yml). Historical claim not re-scored per 41 binding rules"
  - item: "Step 8c rollup shape / routing list"
    by: "Extended (not replaced) by 9d650a7 fix(72) known_broken[] bullet and 8b5bd88/5a80ef7 engine_version+schema_version stamping"
deferred:
  - id: D1
    item: "CI credential for --judge live (ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN+ANTHROPIC_BASE_URL)"
    state: "Recorded as UNMET in 32-03-SUMMARY.md:219-243 (gh secret list --repo empty; org scope 403). No .github/workflows/* references ANTHROPIC_*."
    consequence: "gate:'binding' is reachable only on a credentialed local machine; every CI run is advisory and can never retire a human visual check. This is the honest state, not a code gap."
    owner: human — provision the secret and wire --judge live, or explicitly accept the deferral
human_verification:
  - test: "Decide on D1: provision ANTHROPIC_API_KEY for the CI context that runs the verifier and wire --judge live, or accept advisory-only CI permanently"
    expected: "A recorded decision; if provisioned, a CI run shows gate:'binding'"
    why_human: "Repository/org secret provisioning is a human action; the live judge makes network calls and was deliberately not run"
notes:
  - "flutter-ui-eval.cjs:646-649 JSDoc on outputRollup still says not-found paths 'exit 0 via output() — Step 8c routes that shape to SKIPPED'. Stale after 33-02/33-03 (exit 0 still holds; SKIPPED wording does not). Comment-only, info."
  - "verifier.md Step 8c does not state in prose that a fail verdict exits 1; the capture `UI_EVAL=$(...)` (verifier.md:593) tolerates it without set -e. Info."
---

# Objective 32: Visual-eval default path tells the truth — Verification Report

**Goal (ROADMAP):** the default `verify flutter-ui-eval` stops reporting green for states nothing judged; an unlabelled `state_id` resolves to review/fail, never pass; the offline path stops emitting fabricated `confidence`.
**Verified:** 2026-09-28, against `feat/stack-profile-loader` working tree (engine_version 2.10.1)
**Status:** human_needed (all truths hold; one recorded human deferral D1)
**Re-verification:** No (retroactive initial)

## Re-executed evidence (offline only — no `--judge live`, no network)

| # | Command / action | Result |
|---|---|---|
| E1 | `node --test bin/lib/flutter-ui-eval.test.cjs` | 49/49 pass |
| E2 | `node --test bin/lib/flutter-ui-eval-dogfood.test.cjs` | 22/22 pass (D2, DF1-3, N1, U1, A1, G1-G5, X1-X5) |
| E3 | `node --test bin/lib/flutter-ui-eval-planner-default.test.cjs` | 12/12 pass (A2, A2b) |
| E4 | `df-tools verify flutter-ui-eval __fixtures__/flutter-ui-eval/manifest.json --raw` | **exit 1**; verdict `fail`, `fails:["broken-overflow"]`, counts pass:1 fail:1, `gate:"advisory"`, `network:false`, `judge:"offline-label-echo"`, both states `evidence:"label"`, no `confidence`/`matches_expected` |
| E5 | same with `--judge labels` | exit 1, identical rollup, `gate:"advisory"` |
| E6 | same with `--judge bogus` | exit 1, `Error: unrecognised --judge value 'bogus' — expected 'live' or 'labels' ...; refusing to silently fall through to the offline path` |
| E7 | Independent hand-built manifest (scratchpad): `labelled-ok` (labelled), `never-labelled` (no label), `{id:"id-keyed"}` (no label, non-canonical key) | exit 0; verdict `pass-with-reviews`; `unjudged:["never-labelled","id-keyed"]`; `reviews:[]` (flake budget untouched); advisory `unjudged: no label ... — nothing examined this state`; `id-keyed` attributed by name with fallback advisory; no `null` anywhere |
| E8 | Direct `validateJudgeResult` probe | label+no conf: no conf/matches errors; label+`confidence`: rejected "must be absent for evidence:label"; vision bare: demands `confidence`+`matches_expected`; legacy (no evidence) unchanged — demands both |
| E9 | `buildManifestStub({})` | `states[0].state_id` present, no `id` |
| E10 | `rg` in flutter-ui-eval.cjs | `process.exitCode = verdict === 'fail' ? 1 : 0` (:663); `gate = liveJudge ? 'binding' : 'advisory'` (:773); unjudged bucket (:269-295, :861-868); verdict rule (:309-321) |
| E11 | `rg binding/advisory` verifier.md, skills/ui-eval/SKILL.md | verifier.md:611, :619-620, :678; SKILL.md:4, :23-25, :44-59 |

## Observable truths

| TRD | # | Truth (condensed) | Status | Evidence |
|---|---|---|---|---|
| 32-01 | 1 | Unlabelled state -> `review`, named in top-level `unjudged[]` | VERIFIED | E7 |
| 32-01 | 2 | Advisory says nothing examined it; distinguishable from judge disagreement | VERIFIED | E7 advisory text; `unjudged:true` flag vs `reviews[]` |
| 32-01 | 3 | Unjudged excluded from flake budget; run never clean `pass` | VERIFIED | E7 (`reviews:[]`, verdict pass-with-reviews); cjs:316-318 |
| 32-01 | 4 | Fully-labelled fixture unchanged: `fail`, `fails:['broken-overflow']`, pass:1 fail:1 | VERIFIED | E4 |
| 32-01 | 5 | RED observed and recorded | VERIFIED (record) | 32-01-SUMMARY.md (RED section, :132 original line) |
| 32-01 | 6 | Differential control: reintroduce `|| { is_broken: false }` -> U1 fails by name; `git diff` empty | VERIFIED (record) | 32-01-SUMMARY.md:72, :173 |
| 32-02 | 1 | Offline result `evidence:'label'`, no `confidence`/`matches_expected` | VERIFIED | E4, E7 |
| 32-02 | 2 | Vision result `evidence:'vision'` with both fields | VERIFIED | cjs:563 (parseVisionResponse), :852; unit suite E1 (P-cases). Not run live by rule |
| 32-02 | 3 | `validateJudgeResult` evidence-aware; legacy unchanged | VERIFIED | E8; cjs:101-120 |
| 32-02 | 4 | Rollup per-state detail surfaces `evidence` | VERIFIED | E4 `states[].evidence`; cjs:887 |
| 32-02 | 5 | State keyed `id` attributable; no `null` in `reviews[]` | VERIFIED | E7 |
| 32-02 | 6 | `buildManifestStub` emits `state_id` | VERIFIED | E9, E3 |
| 32-03 | 1 | Default reports `gate:'advisory'` | VERIFIED | E4 |
| 32-03 | 2 | `--judge live` -> `binding`; `--judge labels` -> `advisory` | VERIFIED | E5; cjs:773; dogfood G3 (credential-stripped, no network) passes |
| 32-03 | 3 | Unknown `--judge` -> usage error | VERIFIED | E6 |
| 32-03 | 4 | verifier.md Step 8c: only `binding` pass removes from human list | VERIFIED (superseded prose, rule intact) | verifier.md:619-620, :678; Case S6 |
| 32-03 | 5 | Default path zero network: `network:false`, `judge:'offline-label-echo'` | VERIFIED | E4; D2/N1 pass |
| 32-03 | 6 | CI credential recorded, not assumed | VERIFIED via recorded-unmet branch | 32-03-SUMMARY.md:219-243; no ANTHROPIC_* in `.github/workflows/` -> **D1 deferred** |
| 32-04 | 1 | `verdict: fail` exits non-zero | VERIFIED | E4, E5 exit 1; cjs:663 |
| 32-04 | 2 | `pass` / `pass-with-reviews` exit 0 | VERIFIED | E7 exit 0; X2/X3 pass |
| 32-04 | 3 | Five dogfood fail-fixture call sites updated deliberately, not weakened | VERIFIED | dogfood.test.cjs:27-41 `runJSON` catches and parses `err.stdout`, content assertions unchanged; D2 :52, DF1 :74, DF2 :82, DF3 :93, N1 :101 all pass |
| 32-04 | 4 | Step 8c captures via `$(...)`; non-zero exit does not crash the verifier | VERIFIED | verifier.md:593 `UI_EVAL=$(...)`; independently executed in 41-04 33 probe (run8c.sh), capture survived |
| 32-04 | 5 | Suite green except three named pre-existing failures | SUPERSEDED | Historical baseline claim; current baseline is the CI gate allowlist (41 binding rule) |

**Score:** 23/23 (22 live + 1 superseded; 0 gaps)

## Key links

| Link | Status | Evidence |
|---|---|---|
| labels.json miss -> review (the old :328 line) | WIRED | cjs:415-423 returns `{unjudged:true, reason}`; :381-385 routes it past validation |
| unjudged[] -> run verdict | WIRED | cjs:316-318 |
| evidence tag -> consumer trust | WIRED | E4 `states[].evidence` |
| planner stub key -> engine reader | WIRED | E9 + A2b (stub through engine, no fallback advisory) |
| rollup `gate` -> Step 8c -> Step 9 list | WIRED | verifier.md:611, :619-620, :678 |
| verdict -> exit code -> CI | WIRED | cjs:663; test.yml runs the suite (includes these tests) |

## Anti-patterns

None blocking. Info: stale JSDoc at flutter-ui-eval.cjs:646-649 (see notes).

## Human verification

1. **D1 CI credential decision.** Provision `ANTHROPIC_API_KEY` where the verifier runs and wire `--judge live`, or accept that CI stays advisory-only. This needs a human because it involves secret provisioning and a network judge.

_Verified: 2026-09-28 · Verifier: Claude (41-04, retroactive)_
