---
objective: 38-doc-auto-correction
verified: 2026-09-28T13:22:31Z
status: passed
score: 9/9 requirements verified (DOC-01..DOC-09)
---

# Objective 38: Documentation auto-correction Verification Report

**Objective Goal:** DevFlow keeps its own, project and global documentation current as it runs: a
command-reference checker + rename map (a CI test on the plugin, an auto-fix in projects),
staleness advisories (STACK.md review age and drift, codebase-map age, W002), and a one-time
cleanup of DevFlow's own stale docs.

**Verified:** 2026-09-28T13:22:31Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths / Requirements Coverage (DOC-01..DOC-09)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| DOC-01 | One rename source; `doc-refs.cjs` resolver; help.md table asserted equal; no `command-renames.json` | ✓ VERIFIED | `skill-route.cjs` exports `DEPRECATION_MAP` (13 entries, unchanged) + `REMOVED_COMMANDS = ['update','reapply-patches']` (lines 109-134). `doc-refs.cjs` exports `resolveToken, scanText, rewriteText, liveSkillNames, walkFiles, TOKEN_RE, DocRefsError` (all present, `TOKEN_RE` matches spec regex exactly). `references/command-renames.json` does not exist (confirmed via `ls`/`find` and repo test 9 "SINGLE SOURCE"). `doc-refs.repo.test.cjs` test 5 "help.md fenced rename table deep-equals DEPRECATION_MAP" passes. |
| DOC-02 | CI check fails `npm test` on stale/unknown command refs, with justified exemption list | ✓ VERIFIED | `doc-refs.repo.test.cjs` — 10/10 tests pass (`GATE`, `EXEMPT sanity`, `IGNORE`, `SENSITIVITY` a+b, `LEGACY`, `SINGLE SOURCE`, `MIGRATION TARGETS`). Full scan of agents/skills/workflows/references/templates/bin/hooks/README/CLAUDE.md/USER-GUIDE/site/.github/assets returns zero findings. Runs in 148-185ms (< 2s requirement). |
| DOC-03 | Generators fixed: validate.cjs fix text, misc.cjs CONTEXT scaffold, workstreams.cjs worktree STATE | ✓ VERIFIED | `rg -n '/df:' validate.cjs misc.cjs workstreams.cjs` → empty. Live fix text confirmed (`/devflow:new-project`, `/devflow:milestone new`, `/devflow:status check --repair` throughout validate.cjs). |
| DOC-04 | One-time cleanup: workflows, agents, references, templates, skills, README/USER-GUIDE, bug template, terminal.svg, statusline, init todo preview | ✓ VERIFIED | Zero stale-command matches across all 20+ listed files (grep -E against the full retired-command alternation). `statusline.js` has no `df-update-check` read/render (test "objective 38: no update segment" passes). `init.cjs` `_buildCheckTodosPreview` reads `/devflow:todo list`. `terminal.svg` shows `/devflow:help`; `bug_report.yml` placeholder is generic `/devflow:...`. `roadmapper.md` decimal-objectives bullet correctly reads "Retired in v1.2". |
| DOC-05 | Migration 0007 auto-fixes CLAUDE.md DEVFLOW block + STATE.md (outside Session Log); historical records untouched; removed commands never rewritten | ✓ VERIFIED | `0007-doc-refs-fix.cjs` exports `{id:'0007', title:'Rewrite stale DevFlow command references in live project docs', since:'2.11.0', safety:'auto'}` exactly as specified. 13/13 tests pass, including idempotency (#11), historical-record exemption (#12), and 0005-coexistence (#13). Dogfooded: `df-tools upgrade --check` shows 0007 registered and `skipped` (0 stale refs) with exit 0. |
| DOC-06 | Staleness advisories W050-W053 (warn-only, never repaired) | ✓ VERIFIED | `doc-staleness.cjs` implements all four codes exactly per spec (`collect()` signature, `checked` shape, alias map for W052, git-derived W053 with `_setRunGit`/`_resetRunGit` seam). 52/52 tests pass across W050/W051/W052/W053/general suites. No issue is ever `repairable:true` (asserted by test 18). |
| DOC-07 | W002 retargeted to current STATE.md wording, milestone dirs counted, not repairable | ✓ VERIFIED | `validate.cjs` Check 4: the three position regexes match spec exactly (multiline, no retired `[Pp]hase\s+N`), `knownObjectives` unions `.planning/objectives/` and 1-2 levels under `.planning/milestones/`, `addIssue('warning','W002',...,false)` (not repairable), no `regenerateState` push on W002. Confirmed on live repo: `validate health` shows no W002. |
| DOC-08 | Run points: `validate health` Check 14, `validate docs`, `/devflow:status` doc advisories, `df-tools telemetry` wired | ✓ VERIFIED | Check 14 present in validate.cjs (calls `doc-staleness.collect`, W054 on throw). `df-tools validate docs --raw` runs, exit 0, prints "no documentation advisories" on this clean repo. `df-tools telemetry` — was previously `Unknown command` (per TRD claim); now `case 'telemetry'` exists in df-tools.cjs, runs, exit 0, merges `doc-staleness.collect()` into `out.docs`. `progress.md` step `report` calls `validate docs --raw` and renders a `## Documentation` section conditionally. `help.cjs` has a `telemetry` entry. |
| DOC-09 | CHANGELOG [Unreleased], CLAUDE.md (incl. objective-31 CLI correction), USER-GUIDE updated; full suite no regressions; no version bump/tag | ✓ VERIFIED | CHANGELOG `## [Unreleased]` → `### Added` covers doc-refs.cjs, CI gate, migration 0007, Check 14/W050-054, `validate docs`, `telemetry`, Documentation section; `### Fixed` covers W002, stale-text generators, README/USER-GUIDE/workflows cleanup. CLAUDE.md line 57 corrected (`telemetry` wired; context/session-audit/transcript-export/override are libraries, not wired) and line 58 adds the "Documentation correctness" bullet (2 lines net growth). USER-GUIDE has "Keeping documentation current" section with both config keys documented. `git diff 100cade -- package.json plugin.json marketplace.json` → empty; latest tag is v2.9.0 (no new tag). Full suite: **4119 tests / 4086 pass / 1 fail (MA-7, listed in baseline-failures.tsv) / 32 skipped** — independently re-run and matches orchestrator figures exactly; zero regressions. |

**Score:** 9/9 requirements verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `plugins/devflow/devflow/bin/lib/doc-refs.cjs` | resolver: resolveToken/scanText/rewriteText/liveSkillNames/walkFiles | ✓ VERIFIED | All exports present, behavior matches spec, 21 sub-suites pass |
| `plugins/devflow/devflow/bin/lib/skill-route.cjs` | REMOVED_COMMANDS export | ✓ VERIFIED | Present, 2 entries, comment names it single source with doc-refs.cjs |
| `plugins/devflow/devflow/bin/lib/doc-staleness.cjs` | collect(), DEFAULTS, git seam | ✓ VERIFIED | All present, 52 tests pass |
| `plugins/devflow/devflow/bin/lib/migrations/0007-doc-refs-fix.cjs` | auto migration, two allowlisted targets | ✓ VERIFIED | Registry-contract-compliant, 13 tests pass, dogfooded skipped:0 |
| `plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | CI gate | ✓ VERIFIED | 10 tests pass, scans full live tree, zero findings |
| `plugins/devflow/devflow/bin/lib/validate.cjs` | Check 14 + cmdValidateDocs + W002 retarget + live fix text | ✓ VERIFIED | All present and wired |
| `plugins/devflow/devflow/bin/lib/telemetry.cjs` | doc-staleness merged into collect() | ✓ VERIFIED | `out.docs`, per-issue advisory formatting, tests pass |
| `plugins/devflow/devflow/bin/df-tools.cjs` | `telemetry` + `validate docs` dispatch | ✓ VERIFIED | Both cases present and functional |
| `CHANGELOG.md`, `CLAUDE.md`, `docs/USER-GUIDE.md` | objective-38 documentation | ✓ VERIFIED | All three updated per spec |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| doc-refs.cjs | skill-route.cjs | `require` DEPRECATION_MAP + REMOVED_COMMANDS | ✓ WIRED |
| doc-staleness.cjs | doc-refs.cjs, managed-block.cjs, stack-profile.cjs, project-state.cjs | 4 `require`s confirmed | ✓ WIRED |
| validate.cjs Check 14 | doc-staleness.collect | direct call, W054 on throw | ✓ WIRED |
| df-tools.cjs `validate docs` | cmdValidateDocs → doc-staleness.collect | dispatch confirmed | ✓ WIRED |
| df-tools.cjs `telemetry` | telemetry.collect → doc-staleness.collect | dispatch + merge confirmed | ✓ WIRED |
| workflows/progress.md | `validate docs --raw` | shell call + `## Documentation` section | ✓ WIRED |
| migrations/0007 | doc-refs.rewriteText + managed-block.read | require confirmed, tests pass | ✓ WIRED |
| help.md fenced table | DEPRECATION_MAP | doc-refs.repo.test.cjs deep-equal assertion (passing) | ✓ WIRED |

### Anti-Patterns Found

None. Scanned new/modified modules (`doc-refs.cjs`, `doc-staleness.cjs`, `migrations/0007-doc-refs-fix.cjs`) for TODO/FIXME/PLACEHOLDER — zero matches.

### Functional Verification

Not a UI objective — CLI/lib only. Skipped per Step 8 guidance; static + live-CLI verification (commands run against this real dogfooded repo, not mocks) substitutes:

- `node df-tools.cjs telemetry --raw` → exit 0, "nothing needs attention"
- `node df-tools.cjs validate docs --raw` → exit 0, "no documentation advisories"
- `node df-tools.cjs validate health --raw` → exit 0, no W002/W050-W054 present
- `node df-tools.cjs upgrade --check` → exit 0, 0007 registered and `skipped` (0 stale refs)

### Requirements Coverage

All 9 objective-local requirement IDs (DOC-01 through DOC-09) are claimed across the 12 TRDs (38-01..38-12) and independently confirmed against the codebase above. No orphaned requirements.

### Human Verification Required

None. This objective is entirely CLI/library/CI surface with no UI or subjective component; every must_have was mechanically checkable and was checked directly against live code and live command output.

### Gaps Summary

None found. All 9 requirements (DOC-01..DOC-09) verified with direct evidence against the actual
codebase — exports, wiring, and behavior all match TRD must_haves precisely, not just SUMMARY
claims. Full test suite independently re-run: 4119 tests / 4086 pass / 1 pre-existing failure
(MA-7, listed in baseline-failures.tsv, unrelated to this objective) / 32 skipped — identical to
the orchestrator's reported figures, confirming zero regressions. No version bump or tag, as
required.

---

_Verified: 2026-09-28T13:22:31Z_
_Verifier: Claude (verifier)_
