---
objective: 65-release-v1-5
trd: "01"
subsystem: release
tags: [release, v2.14.0, changelog, version-sync, tag-gate, v1.5]

requires:
  - objective: 56-64 (milestone v1.5 Gate & Plumbing)
    provides: the hand-written CHANGELOG [Unreleased] section promoted here

provides:
  - "signed release commit fad0442b: chore(release): 2.14.0 — v1.5 Gate & Plumbing (objectives 56–64)"
  - "package.json, plugin.json and both marketplace.json devflow version fields at 2.14.0; marketplace skill count 31 -> 34"
  - "CHANGELOG ## [2.14.0] - 2026-10-07 under an empty ## [Unreleased], insert-only (9 added, 0 deleted)"
  - "pre-live validation evidence for 65-02 (suite numbers, tag-gate dry run, notes preview, health/doctor baseline, remote state)"

affects: [65-02, 65-03, 65-04]

tech-stack:
  added: []
  patterns:
    - "release section promoted by hand under [Unreleased] (pattern 20b75f3b); changelog update is never run"

key-files:
  created: []
  modified:
    - package.json
    - plugins/devflow/.claude-plugin/plugin.json
    - .claude-plugin/marketplace.json
    - CHANGELOG.md
    - site/data/devflow.json

key-decisions:
  - "Release date is 2026-10-07, from local `date +%F` at commit time (UTC was already 2026-10-08)."
  - "The lead paragraph says entries that need an installed plugin take effect once it is at 2.14.0, instead of the draft's `/plugin update` plus new-session instruction, because only `Needs an installed plugin carrying objective N` is stated in [Unreleased]."
  - "REL-01 is not marked complete: it also needs the merge to main and the tag (65-02, 65-03)."

requirements-completed: []

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: 13min
completed: 2026-10-07
tokens_input: 8339654
tokens_output: 36750
tokens_cache_read: 8192467
tokens_cache_write: 147027
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 65 TRD 01: Release artifacts and validation (2.14.0) Summary

**Release 2.14.0 is staged locally as one signed commit, `fad0442b`, and every pre-live check passes.** The commit bumps the four version fields, promotes the hand-written [Unreleased] section (objectives 56–64) to `## [2.14.0] - 2026-10-07` with 0 lines deleted, and regenerates the docs data. The tag gate allows `v2.14.0` on that commit, and the branch merges cleanly into origin/main `533d2b87`. Nothing was pushed, opened, merged or tagged.

## Release commit

- **SHA:** `fad0442bb20fc5ec637c7c45bf9a024143bc60ec` (`fad0442b`), parent `050ed493`
- **Subject:** `chore(release): 2.14.0 — v1.5 Gate & Plumbing (objectives 56–64)`
- **Files (exactly 5):** `.claude-plugin/marketplace.json` (3+/3-), `CHANGELOG.md` (9+/0-), `package.json` (1+/1-), `plugins/devflow/.claude-plugin/plugin.json` (1+/1-), `site/data/devflow.json` (3+/3-)
- **Signed:** the commit object carries a `gpgsig` header (an SSH signature), so `rg -c '^gpgsig'` = 1
- **Versions:** `2.14.0 2.14.0 2.14.0 2.14.0` (package, plugin, marketplace top level, marketplace devflow entry). The other marketplace entries are unchanged.
- **Marketplace description:** `31 skills, 13 agents` became `34 skills, 13 agents` (34 skill dirs and 13 agent files, counted with `ls`)
- **CHANGELOG headings:** `7:## [Unreleased]`, `9:## [2.14.0] - 2026-10-07`, `287:## [2.13.2] - 2026-10-05`
- **docs data:** `npm run docs:data` printed `site/data/devflow.json  v2.14.0  skills=34 agents=13 hooks=22 workflows=41 references=37 templates=31 dfToolsCommands=83`. The diff is `generatedAt`, `version` and `packageVersion` only, with no local paths.

## Progress
- [x] Task 1: Bump the three version files to 2.14.0, promote [Unreleased] to [2.14.0], regenerate docs data, commit — fad0442b
- [x] Task 2: Validate the release artifact without any live step — no commit (evidence only; see Validation results)

## Validation results (for 65-02)

| # | Check | Result | Status |
|---|---|---|---|
| 1 | `npm test` (main checkout, after the release commit) | tests 11071, pass 11036, **fail 1**, skipped 34, cancelled 0, todo 0 (150.3 s). The 1 failure is E2E1, caused by this run's own progress checkpoint (see Deviations) | see re-run |
| 1b | E2E1 alone, cwd = disposable worktree at `fad0442b` | tests 1, pass 1, fail 0 | PASS |
| 1c | `npm test` re-run (main checkout, after `sync-roadmap` ticked 65-01) | **tests 11071, suites 1785, pass 11037, fail 0, cancelled 0, skipped 34, todo 0** (271.7 s), exit 0 | PASS |
| 2 | Tag gate dry run: `git tag -a v2.14.0 -m x fad0442bb20fc5ec637c7c45bf9a024143bc60ec` piped to `changelog-on-tag.js` | stdout empty (allow) | PASS |
| 2b | Control: the same payload with `v2.15.0` | deny: "CHANGELOG.md has no entry for v2.15.0 (at commit fad0442b...)" | PASS (hook is live) |
| 3 | `node plugins/devflow/devflow/bin/df-tools.cjs changelog check 2.14.0 --raw` | `present` | PASS |
| 4 | release.yml awk extraction of `## [2.14.0]` | **277 lines**. Line 1 is blank and line 2 starts the lead (`Milestone v1.5 Gate & Plumbing (objectives 56–64; objective 55 shipped in 2.13.2). ...`). It contains `### Added` (l.9), `### Changed` (l.178) and `### Fixed` (l.231) | PASS |
| 5 | `claude plugin validate /Users/justin/dev/devflow-claude` | `✔ Validation passed with warnings`. The only warning is the pre-existing `plugin.json → statusLine: Unknown field` | PASS |
| 6a | `validate health` (repo copy) | engine_version 2.14.0, status degraded, **0 errors** | PASS |
| 6b | `doctor --json` (repo copy, report mode) | engine_version 2.14.0, summary ok 10 / warn 6 / **error 0** / fixable 2 | PASS |
| 7a | `git fetch origin` | ok (local refs only) | PASS |
| 7b | behind count `feat/stack-profile-loader..origin/feat/stack-profile-loader` | **0** | PASS |
| 7c | push count `origin/feat/stack-profile-loader..feat/stack-profile-loader` | **509** commits at the release commit (the final docs commit adds 1, so 510 at the end of this TRD) | recorded |
| 7d | `git rev-parse origin/main` | `533d2b87bc7b6948f9fad3a81baf5d2e2ef0f9f2` | recorded |
| 7e | `git merge-tree --write-tree origin/main feat/stack-profile-loader` | exit 0, tree `81c24034...` (equal to the release commit's tree) | PASS |
| 7f | `gh pr list --head feat/stack-profile-loader --base main --state open` | `[]` | PASS |
| 7g | `git ls-remote --tags origin v2.14.0` and `git tag -l v2.14.0` | both empty | PASS |

### validate health baseline (repo copy, at fad0442b)

- errors: none
- warnings: W006 x10 (objectives 66–75 in ROADMAP with no directory), W021 (`plugin-behind-main: installed 2.13.1, origin/main 2.13.2`), W040 (`project-behind: stamped v2.13.1, DevFlow v2.14.0; 0 pending, 0 need confirmation`)
- info: I001 x3 (65-02, 65-03, 65-04 have no SUMMARY), I022 (`mirror-ahead: ~/.claude/devflow is 2.13.2, installed plugin is 2.13.1`)
- engine: running 2.14.0, mirror 2.13.2, installed 2.13.1, main 2.13.2

### doctor baseline (repo copy, report mode, at fad0442b)

| Check id | Scope | Severity | Finding (short) |
|---|---|---|---|
| runtime-mirror | global | warn | mirror 2.13.2 ahead of installed 2.13.1 |
| plugin-cache | global | warn | 4 stale cache dirs (2.7.1, 2.10.1, 2.11.0, 2.12.0) |
| hooks-registry | global | ok | 17 registered hooks resolve, 2 DRAFT unregistered (installed 2.13.1) |
| model-profiles | global | warn | mirror pins claude-opus-5 / claude-sonnet-5, superseded. The repo copy shipping in 2.14.0 already pins claude-opus-5-5 / claude-sonnet-5-5 |
| skill-requires | global | ok | no skill declares requires: (installed 2.13.1 predates objective 61) |
| legacy-runtime-state | project | warn (fixable) | leftover `.planning/.awareness-cache.json`, `.planning/.progress-guard.json` |
| pending-migrations | project | warn (fixable) | stamped v2.13.1, DevFlow v2.14.0, 0 pending |
| validate-health | project | warn | W006 x10, W021 |
| skill-markers | project | ok | no stale markers |
| store-cache-tracked | project | ok | local mode |
| gh-store-sync | project | ok | not a store-mode project |
| checks-workflow-pin | project | ok | no `.github/workflows/devflow.yml` |
| guard-state | global | ok | 3 guard session files, none stale |
| awareness-state | global | ok | 4 entries, 0.6 MiB |
| backups | global | ok | 294.8 MiB across 10 repos, within retention |
| decision-resolution | project | ok | 2 resolved decisions intact |

65-04 compares against this list. After the install, runtime-mirror, model-profiles, pending-migrations (W040) and W021 should clear. hooks-registry should then list the 2.14.0 hooks (gate-bash-writes, gate-skill-requires, todo-sync).

## Performance

- **Duration:** 13min
- **Started:** 2026-10-08T02:35:57Z
- **Completed:** 2026-10-08T02:48:42Z
- **Tasks:** 2
- **Files modified:** 5 (release commit), plus the planning files in the docs commit

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] E2E1 self-test failed on this run's own progress checkpoint, so the 65-01 ROADMAP line was reconciled**
- **Found during:** Task 2, check 1 (`npm test`)
- **Issue:** `roadmap-reconcile.test.cjs` E2E1 runs a reconcile dry-run on `process.cwd()`'s ROADMAP and expects zero drift. `summary checkpoint` (before the release commit) had written `65-01-SUMMARY.md` while `- [ ] 65-01-...` was still unticked, so the reconciler reported one `trd_summary_exists` change. This was not pre-existing and was not caused by the release commit. E2E1 run with cwd set to a disposable worktree at `fad0442b` passes (1/1). Left as it was, the docs commit carrying this SUMMARY would also have failed E2E1 in the 65-02 PR's CI.
- **Fix:** `df-tools sync-roadmap --dry-run` showed exactly one change (65-01 `[ ]` to `[x]`). `df-tools sync-roadmap` applied it. This is the same reconcile the execute-objective orchestrator runs before its final commit. ROADMAP.md goes into the docs commit.
- **Files modified:** `.planning/ROADMAP.md`
- **Commit:** the final docs commit

### Deliberate departures from the executor defaults

- **The release commit does not carry the SUMMARY.** The executor protocol adds the SUMMARY to each task commit, but this TRD requires the release commit to list exactly five files. The SUMMARY and planning state go into the separate `docs(65-01)` commit.
- **The `npm test` gate ran after the commit, not before.** The TRD sequences validation (Task 2) after the release commit, and an amend is the fix path. No amend was needed.
- **No `requirements mark-complete REL-01`.** REL-01 also needs the merge to main and the tag, so ticking it now would be false.
- **The clean-tree full suite is not used for the count.** A full `npm test` in the disposable worktree at `fad0442b` gave 11071 tests, 11013 pass, 8 fail, 50 skipped. All 8 failures are devflow-watch and handoff-daemon tests, and the 16 extra skips are `node-pty unavailable`. The worktree has no `node_modules` because it is gitignored, so this is environmental to the throwaway tree. The same tests pass in the main checkout. The worktree was removed.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: version sync | `node -e '...four version fields...'` printed `2.14.0 2.14.0 2.14.0 2.14.0` | 0 | PASS |
| 1: insert-only | `git show --numstat --format= HEAD -- CHANGELOG.md` gave `9	0	CHANGELOG.md` | 0 | PASS |
| 1: heading order | `rg -n '^## \[' CHANGELOG.md --max-count 3` gave 7 Unreleased, 9 2.14.0, 287 2.13.2 | 0 | PASS |
| 1: five files + subject | `git show --stat --format=%s HEAD` showed the chore(release) subject and 5 files | 0 | PASS |
| 1: signed | `git cat-file -p HEAD` has 1 `gpgsig` header | 0 | PASS |
| 2: suite | `npm test`: first run 1 fail (E2E1, in-flight checkpoint); after the reconcile, 11071 tests, 11037 pass, 0 fail, 34 skipped | 1, then 0 | PASS |
| 2: tag gate | `printf ... v2.14.0 ... fad0442b \| node plugins/devflow/hooks/changelog-on-tag.js` printed nothing | 0 | PASS |
| 2: changelog check | `df-tools changelog check 2.14.0 --raw` printed `present` | 0 | PASS |
| 2: notes preview | release.yml awk gave 277 lines, first non-blank line is the lead | 0 | PASS |
| 2: manifests | `claude plugin validate /Users/justin/dev/devflow-claude` printed `Validation passed with warnings` (statusLine only) | 0 | PASS |
| 2: health | `df-tools validate health` (repo) gave engine 2.14.0, 0 errors | 0 | PASS |
| 2: doctor | `df-tools doctor --json` (repo) gave engine 2.14.0, error 0 | 0 | PASS |
| 2: remote | behind 0, push 509, origin/main 533d2b87, merge-tree exit 0, no open PR, no v2.14.0 tag | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` (re-run after the reconcile: 11071 / 11037 pass / 0 fail / 34 skipped) | 0 | PASS |

## Discovered commands

None. `test` came from `.planning/STACK.md` (general profile).

## Post-TRD Verification

- Auto-fix cycles used: 1 (the ROADMAP reconcile for E2E1; no amend to the release commit)
- Must-haves verified: 7/7 (versions, insert-only promotion, tag gate and `present`, notes body with lead plus Added/Changed/Fixed, suite (see 1c), not behind and merge-tree clean, nothing pushed/opened/tagged)
- Gate failures: none after the reconcile (see 1c)

## Issues for the orchestrator

- Running `summary checkpoint` before `npm test` always trips E2E1 in this repo, because the in-flight SUMMARY exists while its ROADMAP line is unticked. TRDs that run the full suite after checkpointing have to reconcile first (as done here) or checkpoint after the suite. It may be worth a todo to have E2E1 ignore a SUMMARY with no `## Self-Check` (a checkpoint, by the executor contract).
- `.planning/config.json` is still stamped 2.13.1 (W040), left alone per the TRD. The SessionStart upgrade hook stamps it after the install (65-04).
- Push count for 65-02: 510 commits once the docs commit lands (509 at the release commit).

## Self-Check: PASSED

- FOUND: package.json, plugins/devflow/.claude-plugin/plugin.json, .claude-plugin/marketplace.json, CHANGELOG.md, site/data/devflow.json
- FOUND: fad0442b (`git cat-file -t` gives commit; `git branch --contains` gives feat/stack-profile-loader)
- No push, PR, merge, tag or release: no open PR, `ls-remote --tags origin v2.14.0` and `tag -l v2.14.0` both empty
- Untracked `.gitkeep` files in objectives 26–31 and 53–55 left untouched
