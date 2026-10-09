---
objective: 67-minutes-recalibration
job: "06"
subsystem: release
tags: [release, v2.15.0, changelog, version-sync, tag-gate, v1.6, EST-10]

requires:
  - objective: 67-minutes-recalibration
    provides: "67-05: calibrate defaults to trd_level; CHANGELOG [Unreleased] holds objectives 66 and 67"
  - objective: 66-forward-stamp-coverage
    provides: "the [Unreleased] entries for the stop-gate token check and every-TRD-in-an-executor"

provides:
  - "signed release commit f0df50dc: chore(release): 2.15.0 — v1.6 token stamp and minutes recalibration (objectives 66–67)"
  - "package.json, plugin.json and both marketplace.json devflow version fields at 2.15.0; marketplace skill and agent counts unchanged (34, 13)"
  - "CHANGELOG ## [2.15.0] - 2026-10-08 under an empty ## [Unreleased], insert-only (10 added, 0 deleted)"
  - "pre-live validation evidence for 67-07 (suite numbers, tag-gate dry run, notes preview, health and doctor baseline, remote state)"

affects: [67-07, 67-08, 67-09]

tech-stack:
  added: []
  patterns:
    - "release section promoted by hand under [Unreleased] (pattern of 65-01 and 20b75f3b); changelog update is never run"

key-files:
  created: []
  modified:
    - package.json
    - plugins/devflow/.claude-plugin/plugin.json
    - .claude-plugin/marketplace.json
    - CHANGELOG.md
    - site/data/devflow.json

key-decisions:
  - "Release date is 2026-10-08, from local `date +%F` at commit time."
  - "The lead paragraph says entries that need an installed plugin take effect once the installed plugin is at 2.15.0, instead of the draft's `/plugin update` plus new-session instruction, because only `Needs an installed plugin carrying objective N` is stated in [Unreleased] (the same call 65-01 made). It also says the minutes method is chosen by a pre-registered rule, the CHANGELOG's own wording, instead of the draft's `frozen before it is scored`."
  - "EST-09 and EST-11 are not claimed met; the lead names EST-11 as the prospective test, as the [Unreleased] text does."
  - "The release commit does not carry the SUMMARY, because the TRD requires it to list exactly five files; the SUMMARY and planning state go into the docs commit."

requirements-completed: []

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: 14min
completed: 2026-10-08
tokens_input: 2992593
tokens_output: 21707
tokens_cache_read: 2812801
tokens_cache_write: 179724
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 67 TRD 06: Release artifacts and validation (2.15.0) Summary

**Release 2.15.0 is staged locally as one signed commit, `f0df50dc`, and every pre-live check passes.** The commit bumps the four version fields, promotes the hand-written [Unreleased] section (objectives 66 and 67) to `## [2.15.0] - 2026-10-08` with 0 lines deleted, and regenerates the docs data. The tag gate allows `v2.15.0` on that commit, the full suite is green, and the branch merges cleanly into origin/main `8295a169`. Nothing was pushed, opened, merged or tagged (push count 0).

## Release commit

- **RELEASE_SHA:** `f0df50dc44de0b0060b303cb39d581080e617974` (`f0df50dc`), parent `16fec470`
- **Subject:** `chore(release): 2.15.0 — v1.6 token stamp and minutes recalibration (objectives 66–67)`
- **Files (exactly 5):** `.claude-plugin/marketplace.json` (2+/2-), `CHANGELOG.md` (10+/0-), `package.json` (1+/1-), `plugins/devflow/.claude-plugin/plugin.json` (1+/1-), `site/data/devflow.json` (3+/3-); 17 insertions, 7 deletions in all
- **Signed:** the commit object carries one `gpgsig` header (`rg -c '^gpgsig'` = 1)
- **Versions:** `2.15.0 2.15.0 2.15.0 2.15.0` (package, plugin, marketplace top level, marketplace devflow entry). The other marketplace entries are unchanged.
- **Marketplace description:** `34 skills, 13 agents` re-measured (34 skill dirs, 13 agent files); unchanged
- **CHANGELOG headings:** `7:## [Unreleased]`, `9:## [2.15.0] - 2026-10-08`, `70:## [2.14.0] - 2026-10-07`. The first non-blank line after `## [Unreleased]` is the 2.15.0 heading.
- **docs data:** `npm run docs:data` printed `site/data/devflow.json  v2.15.0  skills=34 agents=13 hooks=22 workflows=41 references=37 templates=31 dfToolsCommands=83`. The diff is `generatedAt`, `version` and `packageVersion` only.
- **Lead paragraph:** every named token (`SubagentStop`, `forward-stamp coverage`, `EST-09`, `EST-10`, `EST-11`, `calibrate --minutes`, `--through`, `method` block, `trd_level`, `ship_default: true`, `pre-registered`, `runs every TRD in an executor`, `refuses a version 3 calibration`, `the prospective test`) was checked with `rg -F` against the former [Unreleased] text (lines 7-59) and found there.

## Progress
- [x] Task 1: Bump to 2.15.0, promote [Unreleased] to [2.15.0], regenerate docs data, commit — f0df50dc
- [x] Task 2: Validate the release artifact without any live step — no commit (evidence only; see Validation results)

## Validation results (for 67-07)

| # | Check | Result | Status |
|---|---|---|---|
| 1 | `npm test` (main checkout, after the release commit) | **tests 11187, suites 1804, pass 11153, fail 0, cancelled 0, skipped 34, todo 0**, exit 0 (duration_ms 90449) | PASS |
| 2 | Tag gate dry run: `git tag -a v2.15.0 -m x f0df50dc44de0b0060b303cb39d581080e617974` piped to `changelog-on-tag.js` | stdout empty (allow) | PASS |
| 2b | Control: the same payload with `v2.16.0` | deny: "CHANGELOG.md has no entry for v2.16.0 (at commit f0df50dc...)" | PASS (hook is live) |
| 3 | `node plugins/devflow/devflow/bin/df-tools.cjs changelog check 2.15.0 --raw` | `present` | PASS |
| 4 | release.yml awk extraction of `## [2.15.0]` | **60 lines**. Line 1 is blank and line 2 starts the lead (`Milestone v1.6, objectives 66 and 67 (objective 65 shipped 2.14.0). Executor SUMMARYs stamp their own token usage: ...`). It contains `### Added`, `### Changed` and `### Fixed` | PASS |
| 5 | `claude plugin validate /Users/justin/dev/devflow-claude` | `✔ Validation passed with warnings`. The only warning is the pre-existing `plugins[0] plugin.json → statusLine: Unknown field` | PASS |
| 6a | `validate health` (repo copy) | engine_version 2.15.0, status degraded, **0 errors** | PASS |
| 6b | `doctor --json` (repo copy, report mode) | engine_version 2.15.0, summary ok 12 / warn 4 / **error 0** / fixable 1 | PASS |
| 7a | `git fetch origin` | ok (local refs only) | PASS |
| 7b | behind count `feat/stack-profile-loader..origin/feat/stack-profile-loader` | **0** | PASS |
| 7c | push count `origin/feat/stack-profile-loader..feat/stack-profile-loader` | **61** commits at the release commit (the docs commit that carries this SUMMARY adds 1, so 62 at the end of this TRD) | recorded |
| 7d | `git rev-parse origin/main` | `8295a169fe108c3af2d76d2480d1c0f95c1f6dcf` (the 2.14.0 merge, as expected) | recorded |
| 7e | `git merge-tree --write-tree origin/main feat/stack-profile-loader` | exit 0, tree `3d1b939ea49b7cef6b0674491050dd3e2fb245c1` (equal to the release commit's tree) | PASS |
| 7f | `gh pr list --head feat/stack-profile-loader --base main --state open --json number,url` | `[]` | PASS |
| 7g | `git ls-remote --tags origin v2.15.0` and `git tag -l v2.15.0` | both empty | PASS |

### validate health baseline (repo copy, at f0df50dc)

- errors: none
- warnings: W006 x8 (objectives 68-75 in ROADMAP with no directory), W040 (`project-behind: stamped v2.14.0, DevFlow v2.15.0; 0 pending, 0 need confirmation`)
- info: I001 x3 (67-07, 67-08, 67-09 have no SUMMARY)
- engine: running 2.15.0, mirror 2.14.0, installed 2.14.0, main 2.14.0 (W021 and I022 from the 65-01 baseline are gone)

### doctor baseline (repo copy, report mode, at f0df50dc)

| Check id | Scope | Severity | Finding (short) |
|---|---|---|---|
| runtime-mirror | global | ok | mirror 2.14.0 matches installed plugin 2.14.0 (content digest equal) |
| plugin-cache | global | warn | 5 stale cache dirs (2.7.1, 2.10.1, 2.11.0, 2.12.0, 2.13.1) |
| hooks-registry | global | ok | 20 registered hooks resolve, 2 DRAFT unregistered (installed 2.14.0) |
| model-profiles | global | ok | opus=claude-opus-5-5, sonnet=claude-sonnet-5-5, haiku=claude-haiku-4-5 |
| skill-requires | global | ok | every required tool on PATH (gh for gh-sync) |
| legacy-runtime-state | project | warn (fixable) | leftover `.planning/.awareness-cache.json`, `.planning/.progress-guard.json` |
| pending-migrations | project | warn | stamped v2.14.0, DevFlow v2.15.0, 0 pending (fix refused here: `.planning/ROADMAP.md` uncommitted at the time) |
| validate-health | project | warn | W006 x8 |
| skill-markers | project | ok | no stale markers |
| store-cache-tracked | project | ok | local mode |
| gh-store-sync | project | ok | not a store-mode project |
| checks-workflow-pin | project | ok | no `.github/workflows/devflow.yml` |
| guard-state | global | ok | 5 guard session files, none stale |
| awareness-state | global | ok | 4 entries, 0.6 MiB |
| backups | global | ok | 294.8 MiB across 10 repos, within retention |
| decision-resolution | project | ok | 3 resolved decisions intact |

67-09 compares against this list. After the install of 2.15.0, runtime-mirror should stay ok at 2.15.0, hooks-registry and skill-requires should read the 2.15.0 cache, pending-migrations (W040) should clear once the SessionStart upgrade stamps `.planning/config.json`, and plugin-cache will list 2.14.0 as one more stale dir.

## Performance

- **Duration:** 14min
- **Started:** 2026-10-08T14:20:20Z
- **Completed:** 2026-10-08T14:34:16Z
- **Tasks:** 2
- **Files modified:** 5 (release commit), plus the planning files in the docs commit

## Deviations from Plan

### Auto-fixed Issues

None. The one gate failure 65-01 hit (E2E1 tripped by an in-flight checkpoint SUMMARY with an unticked ROADMAP line) was avoided: `sync-roadmap --dry-run` showed exactly one change (67-06 `[ ]` to `[x]`) after `summary checkpoint`, `sync-roadmap` applied it before the suite ran, and `npm test` passed on its first run. `.planning/ROADMAP.md` goes into the docs commit.

### Deliberate departures from the executor defaults

- **The release commit does not carry the SUMMARY.** The executor protocol adds the SUMMARY to each task commit, but this TRD requires the release commit to list exactly five files. The SUMMARY and planning state go into the separate `docs(67-06)` commit.
- **The `npm test` gate ran after the commit, not before.** The TRD sequences validation (Task 2) after the release commit, and an amend is the fix path. No amend was needed.
- **No `requirements mark-complete`.** `requirements-completed: []` per the TRD: EST-10 is not complete until 67-09 shows the installed estimator reading the new calibration.
- **Lead paragraph wording.** Two phrases of the TRD's draft were replaced (see key-decisions) so every sentence restates the [Unreleased] text and nothing is invented.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: version sync | `node -e '...four version fields...'` printed `2.15.0 2.15.0 2.15.0 2.15.0` | 0 | PASS |
| 1: insert-only | `git show --numstat --format= HEAD -- CHANGELOG.md` gave `10	0	CHANGELOG.md` | 0 | PASS |
| 1: heading order | `rg -n '^## \[' CHANGELOG.md --max-count 3` gave 7 Unreleased, 9 2.15.0, 70 2.14.0 | 0 | PASS |
| 1: five files + subject | `git show --stat --format=%s HEAD` showed the chore(release) subject and 5 files | 0 | PASS |
| 1: signed | `git cat-file -p HEAD \| rg -c '^gpgsig'` printed 1 | 0 | PASS |
| 2: suite | `npm test`: 11187 tests, 11153 pass, 0 fail, 34 skipped | 0 | PASS |
| 2: tag gate | `printf ... v2.15.0 ... f0df50dc \| node plugins/devflow/hooks/changelog-on-tag.js` printed nothing | 0 | PASS |
| 2: changelog check | `df-tools changelog check 2.15.0 --raw` printed `present` | 0 | PASS |
| 2: notes preview | release.yml awk gave 60 lines, first non-blank line is the lead | 0 | PASS |
| 2: manifests | `claude plugin validate /Users/justin/dev/devflow-claude` printed `Validation passed with warnings` (statusLine only) | 0 | PASS |
| 2: health | `df-tools validate health` (repo) gave engine 2.15.0, 0 errors | 0 | PASS |
| 2: doctor | `df-tools doctor --json` (repo) gave engine 2.15.0, error 0 | 0 | PASS |
| 2: remote | behind 0, push 61, origin/main 8295a169, merge-tree exit 0, no open PR, no v2.15.0 tag | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` (11187 tests / 11153 pass / 0 fail / 34 skipped) | 0 | PASS |

## Discovered commands

None. `test` came from `.planning/STACK.md` (general profile).

## Post-TRD Verification

- Auto-fix cycles used: 0 (no amend to the release commit)
- Must-haves verified: 5/5 (versions, insert-only promotion, tag gate and `present` and notes body starting with the lead, suite plus plugin validate plus not-behind plus merge-tree 0, nothing pushed/opened/tagged)
- Gate failures: None

## Issues for the orchestrator

- `.planning/config.json` is still stamped 2.14.0 (W040), left alone per the TRD. The SessionStart upgrade hook stamps it after the install (67-09).
- Push count for 67-07: 62 commits once the docs commit lands (61 at the release commit). origin/main is `8295a169`, unchanged since the 2.14.0 merge.
- The local `date +%F` is 2026-10-08, so the [2.15.0] heading reads that date; if the merge and tag happen on a later day, the heading date is the release-commit date.

## Self-Check: PASSED

- FOUND: package.json, plugins/devflow/.claude-plugin/plugin.json, .claude-plugin/marketplace.json, CHANGELOG.md, site/data/devflow.json
- FOUND: f0df50dc (a commit on feat/stack-profile-loader, HEAD at validation time)
- No push, PR, merge, tag or release: no open PR, `ls-remote --tags origin v2.15.0` and `tag -l v2.15.0` both empty; push count 0
- Untracked `.gitkeep` files in objectives 26-31 and 53-55 left untouched
