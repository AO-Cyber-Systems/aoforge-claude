---
objective: 36-upgrade-in-place
verified: 2026-09-27T23:42:00Z
status: passed
score: 66/66 must-haves verified
requirements: [UPG-01, UPG-02, UPG-03, UPG-04, UPG-05, UPG-06, UPG-07, UPG-08]
deployment_verification: not_available
evidence:
  - type: log
    path: scratchpad (outside repo) suite.txt
    truth: "Regression baseline holds: 3781 tests, 3748 pass, 1 fail (MA-7, in baseline TSV), 32 skipped"
---

# Objective 36: Upgrade in place — Verification Report

**Objective Goal:** When DevFlow upgrades, every DevFlow project upgrades itself in place, and so does the global ~/.claude state. The project records the version that last touched it. Detection-based idempotent migrations run from a registry with an out-of-repo backup. Safe ones apply and auto-commit at session start, and judgement ones become a notice. `health --migrate` runs the migrations.
**Verified:** 2026-09-27
**Status:** passed
**Re-verification:** No (initial, independent)

## Method

The TRD must_haves use a free-form `truths / artifacts / wiring / key_links` shape, so `df-tools verify artifacts/key-links` cannot parse them. I verified them by hand instead:
- Every Definition-of-Done claim was re-derived with **hand-built fixtures**, independent of `upgrade-fixtures.cjs`, under the session scratchpad with a fake HOME.
- Artifacts and wiring were checked with grep.
- The regression gate was run on the full suite.

The real `~/.claude` was never touched. On this repo the only command run was `upgrade --check`.

## DoD re-derivation (independent fixtures)

| DoD item | Action | Result |
|---|---|---|
| v1 repo `--check` | flat config, 2 JOB.md, no state.json, legacy unversioned DEVFLOW block, no `kind` | pending 0001–0005 all `auto`, pending_confirm `[0006]`. PASS |
| `--apply` changes exactly `changed_files` | `diff -rq` of a before/after copy | Diff set == `changed_files` (STATE.md, config.json, 2 JOB→TRD renames, 2 OBJECTIVE.md, state.json, CLAUDE.md). PASS |
| Stamp + out-of-repo backup | inspected config.json and the fake HOME | `devflow{version:"2.10.1", migrations_applied:[0001..0005], upgraded_at}`. Backup at `<fakeHOME>/.claude/devflow/backups/proj-8483c702/<ts>/`. No `.migrate-backup-*` in the repo. PASS |
| Second `--apply` is a no-op | `diff -r` against the post-apply copy | `applied:[]`, `changed_files:[]`, `backup:null`, tree identical. PASS |
| 0005 bytes outside the block | viewed CLAUDE.md | Header and footer unchanged. Project Overview kept. Only Development Rules rewritten ("Objectives chain automatically", `~/.claude/devflow/references/...`). Marker is now `v=2 src=claude-md`. PASS |
| 0006 confirm path | `--apply --only 0006 --kind plugin` | PROJECT.md gets `kind: plugin`. No in-repo backup. The next check reports "up to date". PASS |
| W040 | `validate health` before and after | Before: `W040 project-behind: stamped never ... 5 pending, 1 need confirmation`, not repairable. After: no W040. PASS |
| 0001 semantics | own oracle script, 4 flat/mixed configs + 1 unparseable | `loadConfig(before)` deep-equals `loadConfig(after)` in all 4 cases. The second detect is false. The unparseable config is not applicable and is left untouched. PASS |
| Hook: clean repo | ran `upgrade-project.js` in a git fixture (gpgsign=false on the fixture only) with a pre-staged unrelated file | Exactly 1 new commit, `chore(devflow): upgrade project to v2.10.1`. Its files equal `changed_files`; JOB deletions show as renames. `staged.txt` is still staged and uncommitted. The notices file is added to `info/exclude`. PASS |
| Hook: rebase in progress | same, with a `rebase-merge` dir present | No commit, migrations applied, warn notice "not committed: rebase in progress". route-results run twice emits it once: run 2 has 0 bytes and all notices are `consumed:true`. PASS |
| Global, fake HOME | legacy df-* files + hand-written `# DevFlow Routing` section | Legacy files **moved** to `backups/legacy-<ts>/{skills,agents,devflow}`; `keep-me` stays. First run leaves CLAUDE.md byte-identical and queues one `global-claude-md-adopt` notice. After `--global --confirm` the block `v=1 src=global-claude-md` replaces only the routing section; `## TDD & Quality` and `# Brand` survive. PASS |
| Template bump rewrites only the block | global-upgrade.test.cjs (passing) | PASS (test evidence) |
| `/devflow:status check --migrate` runs upgrade | workflows/health.md:137,160,174 | `upgrade --check` → `--apply` → `--apply --only 0006 --kind`. PASS |

## Observable truths by TRD

| TRD | Req | Truths | Status | Key evidence |
|---|---|---|---|---|
| 36-01 | UPG-01 | 7/7 | VERIFIED | upgrade.cjs (504 lines); check/apply/backup/stamp/idempotence re-derived above; upgrade.test.cjs green |
| 36-02 | UPG-02 | 7/7 | VERIFIED | managed-block.cjs legacy marker → `{v:null,legacy:true}` (:43); multiple START throws (:80); notices take-once shown live |
| 36-03 | UPG-03 | 9/9 | VERIFIED | `case 'upgrade':` df-tools.cjs:617; HELP_TABLE help.cjs:132; W040 validate.cjs:560-586 including `upgrade-check-not-available`; health.md --migrate |
| 36-04a | UPG-04a | 5/5 | VERIFIED | 0001/0002/0003 live; seedFromStateMd extracts fields the same way the old W009 repair did; 0002 appends a Session Log line |
| 36-04b | UPG-04b | 5/5 | VERIFIED | 0004 created OBJECTIVE.md for NN-dirs; 0006 is `confirm` and writes no in-repo backup |
| 36-04c | UPG-04c | 5/5 | VERIFIED | 0005 detect says "no DEVFLOW block ... never adds one" (:101); template v=2 rules shown |
| 36-05 | UPG-05 | 9/9 | VERIFIED | hooks.json SessionStart registers upgrade-project.js (:16); clean and rebase hook probes above; skip-rule tests green |
| 36-06 | UPG-06 | 7/7 | VERIFIED | global probe above; sync-runtime.js:171-175 calls the bundled `global-upgrade.cjs`, guarded by `DEVFLOW_SKIP_GLOBAL_UPGRADE` |
| 36-07 | UPG-07 | 4/4 | VERIFIED | `rg backfillAllObjectives init.cjs` finds nothing; `bootstrap_objectives` appears 3x in each of plan-/execute-objective.md |
| 36-08 | UPG-08 | 8/8 | VERIFIED | Repo stamped `2.10.1` (applied 0001, 0004); `upgrade --check` says "up to date (v2.10.1)"; CHANGELOG `[Unreleased]` with no new heading; version files unchanged since f28f49b; no tag; upgrade-project in CLAUDE.md, USER-GUIDE and gen-docs-data; intent.cjs:249 hint |

**Score:** 66/66

## Requirements Coverage

All 8 IDs are accounted for: UPG-01, 02, 03, 04 (a/b/c), 05, 06, 07 and 08 are SATISFIED. No orphans. Five SUMMARYs (03, 04b, 04c, 05, 06) omit the `requirements-completed` frontmatter key. That is bookkeeping only; the code evidence above covers every ID.

## Regression gate

Suite command (per OBJECTIVE.md): **3781 tests, 3748 pass, 1 fail, 0 cancelled, 32 skipped** (42.6 s).

| Failure | In baseline-failures.tsv | Classification |
|---|---|---|
| `handoff-e2e.test.cjs:795:3` MA-7 doctl auth init | Yes (verbatim) | Pre-existing environment failure |

No new failures. The baseline holds, and the TSV was not edited.

## Anti-Patterns

None blocking. `rg "gpgsign|no-gpg-sign|ALLOW_RAW_COMMIT"` finds nothing in the hook's commit path; signing is never bypassed.

## Notes

- `deployment_verification: not_available`: there is no devcluster, and this is not a deployment objective.
- Functional browser/Maestro verification is skipped because there is no UI surface.

## Human Verification Required

None.

## Gaps Summary

No gaps.

---

_Verified: 2026-09-27_
_Verifier: Claude (verifier)_
