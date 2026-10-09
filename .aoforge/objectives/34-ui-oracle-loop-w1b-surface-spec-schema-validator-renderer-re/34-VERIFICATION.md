---
objective: 34-ui-oracle-loop-w1b-surface-spec
verified: 2026-09-28
status: human_needed
score: 9/9 must-have groups verified (DoD 7/7 clauses; 12/12 broken fixtures rejected with distinct codes)
re_verification: false
verifier: Claude (retroactive, TRD 41-05)
gaps: []
deferred:
  - item: "Mark the `Agent shell harness` job as a REQUIRED status check on `main`"
    why: "Repo setting, out of band of code (TRD 41-05 binding rule). Probed: `gh api repos/AO-Cyber-Systems/devflow-claude/branches/main/protection` -> 404 `Branch not protected`, so the path-filtered job is currently NOT required. The workflow file itself documents this (lines 9-11)."
    owner: human
human_verification:
  - test: "Enable branch protection on main with `Agent shell harness / harness` as a required check"
    expected: "A PR touching plugins/devflow/agents/** cannot merge on a skipped/absent harness run"
    why_human: "GitHub repo setting; not code. 34-10 key_link names REQUIRED as the mitigation for the path-filtered false-green class."
notes:
  - kind: superseded
    item: "34-11 version trio = 2.9.0"
    successor: "package.json / plugin.json / marketplace.json now read 2.10.1 (releases v2.10.0, v2.10.1). `git show v2.9.0:package.json` reads 2.9.0; tag v2.9.0 exists; CHANGELOG.md:264 `## [2.9.0] - 2026-09-22`."
  - kind: superseded
    item: "34-04/05/06/07 'exit 0' on a completed-but-MISSING run (ui spec validate without --patterns, ui sheet with no renders)"
    successor: "v2.10.0 (#90, CHANGELOG.md:195-207) — exit 2 = nothing violated but a check did not run / artifact produced with MISSING rows; `complete` + `unchecked` fields added. Intent (MISSING is never pass) is strengthened, not lost."
  - kind: superseded
    item: "34-07 `lock: 'held'|'cleared'|'absent'` as a bare string"
    successor: "`lock` is now an object `{lock, reason, locked_by, locked_at}` with a fourth value `MISSING` (acceptance block without `locked_shape_hash`). SKILL.md step reads all four. Intent held."
  - kind: superseded
    item: "34-08 'build mode step 0'"
    successor: "In frontend-design/SKILL.md it is numbered step 5 by position, with an explicit note (line 100) that proposal §4/§8.1 call it step 0; design read (1) and greenfield/redesign detection (2) still precede it."
  - kind: superseded
    item: "34-07 acceptance block = {locked_sheet, locked_by, locked_at, locked_shape_hash}"
    successor: "ui lock additionally writes `locked_section_hashes {routes, controls, states}` so `cleared` can name which section moved."
  - kind: observation
    item: "The committed projects-rail.md positive control validates with `lock: MISSING` (its hand-written acceptance block has no locked_shape_hash)"
    note: "Correct per the MISSING semantics; the fixture is a validator control, not a lock control. Lock transitions were verified on a scratch copy."
  - kind: observation
    item: "`ui lock` on an invalid spec prints a `lock.reason` of 'the spec could not be read' although the spec was read and failed ROUTE002"
    note: "Cosmetic wording only; the refusal (exit 1, no write) is correct. Not fix-TRD-worthy on its own."
  - kind: observation
    item: "ROADMAP.md Objective 34 job list: '34-06 ... template edit- [x] 34-07' is missing a newline"
    note: "Formatting only; ROADMAP not edited by this TRD."
---

# Objective 34: UI Oracle Loop W1b — Surface Spec — Verification Report

**Objective Goal:** DevFlow can parse and validate a Surface Spec, derive the ui-eval manifest, navigation graph and control table from it, render a review sheet a human approves, record that approval as a look-lock later phases anchor on, and run agent prose that encodes shell semantics against a real harness.
**Verified:** 2026-09-28 against the current tree on `feat/stack-profile-loader` (engine 2.10.1)
**Status:** human_needed (all code checks pass; one out-of-band repo setting)
**Re-verification:** No — retroactive initial verification

All CLI evidence below was produced with the repo copy `node plugins/devflow/devflow/bin/df-tools.cjs`. `ui sheet` / `ui lock` ran only on scratch copies in the session scratchpad. `git status --porcelain` over the 34 objective dir and `bin/lib/__fixtures__` is empty.

## Tests re-run (targeted)

| Suite | Tests | Pass | Fail |
|---|---|---|---|
| yaml-lite.test.cjs | 19 | 19 | 0 |
| ui-spec.test.cjs | 16 | 16 | 0 |
| ui-spec-validate.test.cjs | 46 | 46 | 0 |
| ui-spec-cli.test.cjs | 34 | 34 | 0 |
| ui-spec-render.test.cjs | 22 | 22 | 0 |
| ui-sheet.test.cjs | 17 | 17 | 0 |
| ui-spec-lock.test.cjs | 18 | 18 | 0 |
| ui-spec-skill-contract.test.cjs | 15 | 15 | 0 |
| agent-shell-harness.test.cjs | 37 | 37 | 0 |
| **Total** | **224** | **224** | **0** |

## Definition of done

| # | Clause | Command | Observed | Verdict |
|---|---|---|---|---|
| D1 | `ui spec validate` rejects each known-broken fixture with its own code | `ui spec validate broken/<f>.md --patterns pattern-catalogue.json --raw` x12 | 12 x exit 1, 12 distinct single codes (table below) | VERIFIED |
| D2 | accepts the `projects-rail` example | `ui spec validate projects-rail.md --patterns ... --raw` | exit 0, `ok:true`, `complete:true`, `errors:[]`, `engine_version:2.10.1`, `schema_version:1` | VERIFIED |
| D3 | `ui spec render` manifest states carry `state_id`/`seed`/`as`/`fault`/`references` | `ui spec render projects-rail.md --patterns ... --manifest --raw` | 8 states in spec order; e.g. `error` -> fault `projects-list-500`; `guard-denied` -> as `non-member`; `fault:null` (not absent) where none; `populated.references=["locked/populated.png"]` | VERIFIED |
| D4 | `ui sheet` static HTML, `sheet_hash` stable across template edits, `MISSING` for unrendered state | `ui sheet <scratch copy> --out <scratch>/sheet.html --raw` + library probe | exit 2 (artifact written, 8 missing), `sheet_hash e4ab5470...`; HTML has 17 `MISSING`, 0 `<link`/`<script src`/`http(s)://`; editing the template changed HTML but not the hash; renaming a state changed the hash | VERIFIED |
| D5 | `ui lock` writes acceptance; cleared by routes/controls/states change, not by prose | `ui lock <scratch copy> --sheet-hash e4ab... --by verifier@example.invalid` then `ui spec validate` on variants | lock exit 0, body byte-identical; locked -> `held`; +prose -> `held`; seed change in `states` -> `cleared` ("`states` changed") with `ok:true`; acceptance removed -> `absent`; bad hash / no `--by` / invalid spec -> exit 1, no write | VERIFIED |
| D6 | `frontend-design` build mode refuses to compose without a valid, locked spec | read SKILL.md:98-160; ui-spec-skill-contract 15/15 | Refusal names `ok:false` and every `lock` other than `held` (absent/cleared/MISSING, each "Do not compose"); points at checkpoints.md look-lock | VERIFIED |
| D7 | harness FAILS on bare `cd X && cmd`, PASSES on `( cd X && cmd )`; current executor.md Flutter section passes end-to-end | independent `checkSection` probe on hand-written md + harness suite R1-R5 | bare -> `ok:false`, finding `cwd-leak`; subshell -> `ok:true`; absent section -> `missing` set, `ok:false`; R1/R2/R3 (three executor.md Flutter sections, 5/6/11 calls) pass; R5 broken copy fails for `cwd-leak` | VERIFIED |

## Known-broken fixture table (observed via CLI, `--patterns` supplied)

| Fixture | Code | Exit |
|---|---|---|
| behaviors-missing-narrow.md | CTRL004 | 1 |
| behaviors-overlapping-when.md | CTRL003 | 1 |
| control-two-does.md | CTRL001 | 1 |
| entry-control-unknown.md | ROUTE003 | 1 |
| flow-ends-mid-route.md | FLOW002 | 1 |
| guard-without-denied-state.md | GUARD001 | 1 |
| hit-rect-overlap.md | HIT001 | 1 |
| hit-rect-within-and-disjoint.md | HIT002 | 1 |
| outage-equals-empty.md | STATE002 | 1 |
| route-without-back.md | ROUTE002 | 1 |
| state-without-seed.md | STATE001 | 1 |
| unknown-pattern.md | PAT001 | 1 |
| **projects-rail.md (positive control)** | none | **0** |

Without `--patterns`, `unknown-pattern.md` exits **2** with `PAT000 status: MISSING`, `complete:false` — I5 unchecked is reported as unchecked, not pass (post-#90 contract).

## Per-TRD must-have groups

| # | Group | Command / evidence | Observed | Verdict |
|---|---|---|---|---|
| 1 | 34-01 yaml-lite | yaml-lite suite 19/19; `node -e parseYamlLite(...)`; package.json deps | nested maps OK; `2026-09-18` -> string; `sha256:abc` one string; `&x` -> `YamlLiteError` line 1; duplicate key -> line 2; deps = `{"node-pty":"1.1.0"}` only | VERIFIED |
| 2 | 34-02 schema + parser + positive control | ui-spec suite 16/16; files exist: `schemas/surface-spec.schema.json`, `schemas/must_not_vocabulary.json`, `__fixtures__/ui-spec/projects-rail.md` | projects-rail validates (D2) | VERIFIED |
| 3 | 34-03/04 validator I1-I8 + CLI arm | validate suite 46/46, cli suite 34/34, fixture table | 12 distinct codes, exit 1 each; `engine_version` + `schema_version` on every output | VERIFIED |
| 4 | 34-05 renderer | render suite 22/22 (M1 loads through the real `flutter-ui-eval.loadManifest()`); CLI `--manifest/--graph/--table` | graph and controls outputs `cmp`-identical to `snapshots/`; manifest identical except `engine_version` which the snapshot stores as the `<engine_version>` placeholder by design (render.test.cjs:671-717); `--bogus` exit 1 naming the three flags | VERIFIED |
| 5 | 34-06 review sheet | sheet suite 17/17; D4 probe; committed `__fixtures__/ui-spec/sheet/projects-rail.sheet.html` (21,633 B) | CLI hash equals library `sheetHash(buildSheetModel())` | VERIFIED |
| 6 | 34-07 look-lock | lock suite 18/18; D5 transitions; `references/checkpoints.md:93` `### look-lock variant`, `:384`; `agents/executor.md:487,498` reference it without restating | all four lock states observed | VERIFIED |
| 7 | 34-08 frontend-design step 0 | skill-contract 15/15; `design-stack-flutter.md:281 ## Composition and semantics`, `:310 ## Surface Spec` | step present (numbered 5 by position, see notes) | VERIFIED |
| 8 | 34-09/10 harness + CI | harness suite 37/37; fixture `__fixtures__/agent-shell/{bin/(adb,df-tools,flutter,jq,maestro,pgrep),scratch-repo/factory.cjs}`; `.github/workflows/agent-shell-harness.yml` | workflow path-filtered on agents/**, workflows/**, harness sources, itself; runs `node --test agent-shell-harness.test.cjs`; REQUIRED check not set (human item) | VERIFIED (code) |
| 9 | 34-11 release 2.9.0 | `git tag -l v2.9.0`; `rg -n -e '^## \[2\.9\.0\]' CHANGELOG.md`; `ui-spec.cjs` exports | tag present; CHANGELOG.md:264; `parseSurfaceSpec`/`validateSurfaceSpec`/`renderSurfaceSpec` all functions; trio now 2.10.1 (superseded) | VERIFIED |

**Score:** 9/9 groups.

## Checkpoints (scored as recorded, not re-opened)

- 34-04 I6 hit-rect decision: HIT001 / HIT002 fixtures both reject with their own codes, consistent with the recorded decision.
- 34-06 human-verify (sheet eyeballed): approved 2026-09-26 per ROADMAP; committed fixture sheet present.

## Superseded items

See frontmatter `notes` (kind: superseded): version trio 2.9.0 -> 2.10.1; exit-0-on-MISSING -> exit 2 (v2.10.0 #90); `lock` string -> object with fourth value `MISSING`; "step 0" -> step 5 by position; extra `locked_section_hashes`. In each case the intent holds.

## Human Verification Required

### 1. Required status check for the agent shell harness

**Test:** In GitHub settings, protect `main` and require the `Agent shell harness` job.
**Expected:** A PR touching agent prose cannot merge without the harness having run.
**Why human:** Repo setting. `main` is currently unprotected (API 404).

## Gaps Summary

No code gaps. Every Definition-of-done clause was re-run against the current tree and holds. The only open item is the out-of-band branch-protection setting, which the objective's own workflow file flags.

---

_Verified: 2026-09-28_
_Verifier: Claude (verifier, TRD 41-05)_
