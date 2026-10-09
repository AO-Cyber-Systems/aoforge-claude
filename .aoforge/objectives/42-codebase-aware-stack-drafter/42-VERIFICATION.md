---
objective: 42-codebase-aware-stack-drafter
verified: 2026-09-29T14:20:25Z
status: gaps_found
score: 5/6 success criteria verified (SC6 met by letter; SDR-08 "confirm each command runs" unmet)
deployment_verification: not_applicable
gaps:
  - truth: "`stack verify --run` executes only safe (read-only) keys (SDR-03 / 42-06 / 42-11)"
    status: failed
    reason: "The safe-key policy is key-based, not effect-based. flutter `lint` (`flutter analyze --fatal-infos`) rewrites analysis_options.yaml (adds analyzer.exclude) and its implicit pub get bumps pubspec.lock. This mutated aocore, aofamily and aoid during the rollout. The delta check caught it and the coordinator restored 5 files by hand. The code is unchanged on this branch."
    artifacts:
      - path: plugins/devflow/devflow/bin/lib/stack-verify.cjs
        issue: "RUN_POLICY.defaultKeys includes lint/format/build for every stack. It has no Flutter/Dart side-effect guard."
    missing:
      - "Run Flutter/Dart gates with --no-pub, or against a temp copy / git worktree. Otherwise refuse them under --run as `side-effect-unsafe`."
      - "Add a post-run porcelain delta guard inside runCommands, so the command itself reports a mutation and it is not left to the rollout harness."
      - "Add a regression fixture with a stub `flutter` that writes analysis_options.yaml (objective 43 defect 8)."
  - truth: "SDR-08: for each fleet repo, confirm each proposed command runs"
    status: partial
    reason: "Only 3 of 33 committed repos (ao-terminal, aodex, aoedge) ran `verify --run`. The other 30 used resolve-only after the halt. Their commands are confirmed to RESOLVE (binary/target exist) but have not been confirmed to RUN. Even in the 3 repos that ran, 6 gates exited non-zero (pre-existing gate-red)."
    artifacts:
      - path: .planning/objectives/42-codebase-aware-stack-drafter/42-ROLLOUT.md
        issue: "The Results table marks 30 rows `resolve-only (run disabled: flutter side effects)`"
    missing:
      - "Once gap 1 is fixed, re-run `stack verify --run` across the 30 resolve-only repos (read-only, no commit) and record the results in 42-ROLLOUT.md or an objective 43 rollout table"
  - truth: "Real-repo drafts are correct without hand edits (objective goal: 'correct, verified STACK.md for real repos')"
    status: partial
    reason: "SC1/SC2 pass on the TRD fixtures, but 11 of 33 committed fleet STACK.md files are hand-reviewed overrides (overrides/*.STACK.md). Examples: aocore's dry run drafted lint_helm=`kubeconform -v` and build=`bash portal/build.sh`. The drafter defects that remain are registered as objective 43 defects 1-6 (aggregate targets rejected as off_stack, sub-area filter only protects Go roots, a manifest-less root takes a subfolder's language, scenario targets proposed as test/e2e/build, internal Taskfile tasks resolve, thin coverage for recipe-wrapped component commands)."
    artifacts:
      - path: plugins/devflow/devflow/bin/lib/stack-draft.cjs
        issue: "Root-override / aggregate-target / sub-area policy gaps (objective 43 D1-D4, D6)"
      - path: plugins/devflow/devflow/bin/lib/stack-verify.cjs
        issue: "Taskfile `internal: true` tasks report `resolved` (objective 43 D5)"
    missing:
      - "Close objective 43 D1-D6, using each overrides/*.STACK.md as a golden fixture. Success test: re-drafting those 11 repos needs no override."
notes:
  - kind: new_defect_not_in_obj43
    path: plugins/devflow/devflow/bin/lib/stack-mcp.cjs
    note: "buildServers dedups agent_tooling.mcp by name with the LAST view winning. In a repo with both a flutter/ component and a pure-Dart component, the single `dart` server gets the dart profile's `--disable flutter`, which turns off Flutter MCP tools (reproduced in a scratch fixture: components flutter/, go/, packages/core/ -> dart args include --disable flutter). Opt-in path only (`stack mcp --write`), but worth adding to objective 43: prefer the flutter args whenever any component resolves to flutter."
  - kind: df_commit_gitignore
    note: "objective 43 D7: `df-tools commit` gitignore check is directory-level (justin-donnaruma-us-go was correctly blocked by the stack-file preflight instead)."
  - kind: tooling
    note: "`df-tools verify artifacts <TRD>` returns 'No must_haves.artifacts found' for all 15 TRDs (the frontmatter parser does not read these must_haves blocks), so artifacts and key links were checked manually."
  - kind: agent_mcp_path
    note: "SC3 agent confirmation (confirm_stack_profile via gopls/dart MCP) is verified at the contract level (workflow text + tool grants + stack-agent-mcp-contract tests). It was not exercised in the rollout, which ran df-tools only."
---

# Objective 42: Codebase-aware stack drafter — Verification Report

**Objective Goal:** `stack init` / `/devflow:adopt` draft a correct, verified `.planning/STACK.md` grounded in the codebase, wired to language skills + MCP, with a CI/CD + local-testing recommendations report; then roll out to every canonical DevFlow repo in `~/dev`.
**Verified:** 2026-09-29T14:20:25Z
**Status:** gaps_found
**Re-verification:** No (initial verification)

## Tests

| Suite | Total | Pass | Fail | Notes |
|---|---|---|---|---|
| `node --test stack-*.test.cjs adopt-*.test.cjs` | 1015 | 1015 | 0 | 150 suites |
| `npm test` (full) | 5110 | 5077 | 1 | Only failure: handoff-e2e MA-7 (`doctl auth init`), one of the 2 known pre-existing handoff-e2e failures. The remainder are skipped/todo. |

## Success Criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Failure-shape fixtures -> correct keys, no fragments/comments/echo, `discover` when unverifiable | VERIFIED (fixtures) | stack-drafter-e2e tests 1-17 cover aocore/eden-biz/devflow/aoinference/eden-circle/aodex-politihub/manifest-only/empty shapes plus D1-D5. Independent scratch repo (aocore-shaped): `gosec … \` joined, comment/echo/`test -f … {` dropped, gosec->sast, helm lint->lint_helm, playwright at an untracked cwd -> note, `${{ }}` build -> `discover` + note. The real fleet still needed 11 overrides (gap 3). |
| 2 | go/dart/flutter repos `extends` the fixed tier-2 profiles; monorepo areas become components | VERIFIED | `stack-profiles/{go,dart,flutter}.md` validate with 0 warnings and carry the fixes (gofmt `test -z`, dart audit none + outdated, `--enable cli/--disable` flags, flutter `{file, contains}` detect). Scratch monorepo -> components `flutter/`=flutter, `go/`=go, `packages/core/`=dart (pure Dart is not flutter). Fleet: 12 extends go, 3 extends flutter. |
| 3 | Drafts carry `agent_tooling.mcp` + skills; the agent path confirms via gopls/dart MCP | VERIFIED (contract level) | Inherited via extends/components. `stack mcp` preview yields gopls + dart servers, env exactly `{DEVFLOW_MANAGED: stack}`, writes nothing. `confirm_stack_profile` steps in workflows/adopt.md and map-codebase.md. mcp__gopls__/mcp__dart__ grants in executor/verifier/debugger agents and adopt/map-codebase skills. W033 is in validate.cjs. Note: the mixed flutter+dart dedup issue. |
| 4 | STACK-REPORT.md lists CI/CD + local-testing recommendations, never auto-applied | VERIFIED | `stack report --draft` renders "Proposals only — nothing here has been applied", with gap/weak/info tables and draft notes. adopt.cjs links it and adds rows. Fleet reports committed in 33 repos. |
| 5 | `validate` warns on `<sha>` pins and rejects positional paths; `reviewed` is the local date | VERIFIED | Positional path -> exit 1 with the exact message. `<sha>` pin -> STK010 warning, ok:true. `TZ=Pacific/Kiritimati` -> reviewed 2026-09-30 and `TZ=Pacific/Pago_Pago` -> 2026-09-29, each matching local `date`. |
| 6 | Every canonical repo has a committed, validated STACK.md (unpushed), or is listed as blocked with a reason | VERIFIED (by letter) | Canonical set independently recomputed (top-level `.git` dir + `.planning/`) = 36, an exact match with 42-ROLLOUT results. For all 33 committed repos, checked read-only: the commit contains exactly `.planning/STACK.md` + `.planning/STACK-REPORT.md`, is an ancestor of HEAD, is on 0 remote branches, `stack validate` ok with 0 warnings/0 errors, and the stack files are clean. Skipped: aocyber-deploy (user), devflow-claude (self). Blocked: justin-donnaruma-us-go (`.gitignore:14:.planning/` confirmed). |

## Requirements Coverage

| Req | Verdict | Evidence / gap |
|---|---|---|
| SDR-01 Codebase detection | SATISFIED | stack-detect.cjs detectAreas (depth 3, ignore-aware, nested-repo exclusion), Dart-vs-Flutter, flags, unsupported areas. Fleet gap: a manifest-less root takes a subfolder's language (obj 43 D3). |
| SDR-02 Command hygiene | SATISFIED (fixtures) / PARTIAL (fleet) | stack-shell/-ci/-classify/-runners plus the canonical-target and breadth rules. Fleet overrides were needed for aggregate targets, sub-area, and scenario targets (obj 43 D1, D2, D4, D6). |
| SDR-03 Command verification | PARTIAL | Static resolution works (resolved/binary_missing/target_missing/script_missing/unverifiable/cwd_missing -> `discover` + note). `--run` is not side-effect-free for Flutter (gap 1). Internal Taskfile tasks false-resolve (obj 43 D5). |
| SDR-04 Tier-2 profiles | SATISFIED | Bundled `devflow/stack-profiles/`, user tier wins, sync-runtime SUBDIRS includes `stack-profiles`. |
| SDR-05 Skills + MCP | SATISFIED (with note) | stack-mcp opt-in `--write`, managed-only merge, W033, grants, confirm_stack_profile. Mixed flutter+dart arg dedup (see notes). |
| SDR-06 Recommendations report | SATISFIED | stack-report.cjs catalogue, `--write`/`--draft`, adopt link + medium rows. |
| SDR-07 Validation fixes | SATISFIED | STK010/W032, positional rejection, helpers.localDate used in stack-profile.cjs and adopt.cjs. |
| SDR-08 Fleet rollout | PARTIAL | All 36 accounted for, two-file commits, unpushed, dirty trees untouched per results. However, "confirm each command runs" was done in only 3 of 33 repos (gap 2), and 11 of 33 used hand overrides (gap 3). |

No orphaned requirements: SDR-01..08 are each claimed by 2-7 TRDs (there is no .planning/REQUIREMENTS.md; OBJECTIVE.md is the source).

## Artifacts and Key Links (manual; df-tools could not parse these must_haves)

All listed artifacts exist and are substantive: stack-{shell,ci,classify,runners,detect,verify,evidence,draft,report,mcp,render}.cjs (about 19k lines together with stack-profile.cjs), 7 fixture builders, bundled profiles, schema, docs (CLAUDE.md, CHANGELOG [Unreleased], templates/stack.md, docs/stack-profiles/README.md pointer, testing-strategy.md). Key links checked: cmdStack lazy dispatch -> verify/report/mcp; localDate in draftProfile and adopt; adopt.cjs -> stack-report; stack-mcp -> resolveBinary; validate W033; RUN_POLICY deny list (incl. 8080, push, kubectl/helm deploy).

## Functional Verification

_Skipped (Step 8): CLI/library objective, no UI. The CLI was exercised directly on scratch fixtures instead (see SC1, SC2, SC3, SC5)._

## Human Verification Required

None beyond the gaps. The agent-driven MCP confirmation path (SC3) is checked by contract tests only.

## Gaps Summary

The code satisfies the fixture-based contract (SC1-SC5), and the rollout satisfies SC6 by letter. The objective goal is only partly met on real repos, for three related reasons. First, `verify --run` is not side-effect-free for Flutter/Dart, which is a real safety defect in shipped code. Second, because of that, 30 of 33 fleet repos were only resolve-checked and never run-checked. Third, 11 of 33 fleet drafts needed hand-reviewed overrides. Both gap cycles are spent, and all three gaps (plus the new MCP-dedup note) belong to **objective 43**. Route closure there rather than through `/devflow:plan-objective 42 --gaps`.

---

_Verified: 2026-09-29T14:20:25Z_
_Verifier: Claude (verifier)_
