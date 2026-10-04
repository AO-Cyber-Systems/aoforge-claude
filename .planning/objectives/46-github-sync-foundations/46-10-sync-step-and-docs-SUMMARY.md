---
objective: 46-github-sync-foundations
trd: "10"
subsystem: github-sync
tags: [gh, sync, workflow, docs, deprecation-guard, changelog, tdd]
requires: [46-08-command-surface, 46-09-e2e-push-pull]
provides:
  - "execute-objective post-execute step: `gh sync \"${OBJECTIVE_DIR}\"`, failure shown as WARNING plus retry command, completion never blocked"
  - "execute-objective-gh-sync.test.cjs: static check of the step, the extracted bash run against the gh shim, `df-tools gh sync <dir>` as a real process"
  - "df-tools-deprecations.repo.test.cjs: CI guard driven by DF_TOOLS_DEPRECATIONS"
  - "gh-sync skill, new-project workflow, verifier, objective template, CLAUDE.md, USER-GUIDE, CHANGELOG [Unreleased] and the proposal describe the shipped surface"
affects: []
tech-stack:
  added: []
  patterns:
    - "Extract a fenced bash block from a workflow by heading and run it with bash against a fixture project (HOME with a bin symlink, gh shim first on PATH)"
    - "A df-tools-argv deprecation guard beside doc-refs: a line naming an old form must say it is deprecated"
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/execute-objective-gh-sync.test.cjs
    - plugins/devflow/devflow/bin/lib/df-tools-deprecations.repo.test.cjs
  modified:
    - plugins/devflow/devflow/workflows/execute-objective.md
    - plugins/devflow/devflow/workflows/new-project.md
    - plugins/devflow/skills/gh-sync/SKILL.md
    - plugins/devflow/agents/verifier.md
    - plugins/devflow/devflow/templates/objective.md
    - CLAUDE.md
    - docs/USER-GUIDE.md
    - docs/PROPOSAL-github-system-of-record.md
    - CHANGELOG.md
decisions:
  - "The step normalises OBJECTIVE_DIR with basename. `init` reports `objective_dir` as `.planning/objectives/<dir>`, and a path is not a valid objective spelling for `gh sync`; the old step built `.planning/objectives/${OBJECTIVE_DIR}/OBJECTIVE.md` from it, which was wrong for the same reason."
  - "Commit lines that add OBJECTIVE.md files use `git ls-files -m -o --exclude-standard -- '.planning/objectives/*/OBJECTIVE.md'` instead of a bare glob. `df-tools commit --files` fails when a glob matches nothing, which is the normal case at new-project time."
  - "The deprecation guard scans skills, agents, non-legacy workflows, templates and references, as the TRD says. CLAUDE.md and docs are checked by the verification rg, not by the guard."
requirements-completed: [GSF-03, GSF-01, GSF-02, GSF-04, GSF-05, GSF-06, GSF-07, GSF-08]
metrics:
  duration: "~45 min"
  completed: 2026-09-30
---

# Objective 46 TRD 10: Post-execute sync reports failures; docs, deprecation guard, changelog Summary

**Result:** The post-execute GitHub push now passes the objective directory, shows a failure (WARNING, the command's own output, the retry command) and no longer skips objectives that lack a `github_issue`. The prose that drives or describes the sync says `gh sync --all` and the `devflow:id` markers, `gh sync-objectives` appears only as a deprecated alias, and a CI guard keeps it that way. The full suite is green.

## Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 | RED | 0f4645a | test(46-10): post-execute gh sync step reports failures |
| 1 | GREEN | 5d73541 | feat(46-10): post-execute gh sync passes the objective dir, shows failures and drops the github_issue gate |
| 2 | RED | 23725d0 | test(46-10): add failing CI guard so deprecated df-tools forms stay out of live prose |
| 2 | GREEN | cd347ef | docs(46-10): gh-sync skill, new-project, verifier and objective template describe gh sync --all, markers and --kind verification |
| 3 | docs | e0b5333 | docs(46-10): CLAUDE.md, USER-GUIDE, CHANGELOG [Unreleased] and proposal describe the GitHub sync surface |
| 3 | fix | c101d9e | fix(46-10): CLAUDE.md GitHub bullet names each command as gh <sub> so the dispatch-completeness extractor finds real COMMANDS keys |

## What was built

- **The step (`execute-objective.md`).** Only the heading, paragraph and bash block changed. It runs `gh sync "${OBJECTIVE_DIR}"` with the output captured. On success or `skipped` it prints nothing. On failure it prints `WARNING: GitHub sync failed for objective <dir> (completion continues):`, the first 40 lines of the command's output and `Retry: …`, and the step still exits 0. There is no `2>/dev/null`, no `github_issue` gate and no `|| true`.
- **Tests (`execute-objective-gh-sync.test.cjs`, 10 tests).**
  - Tests 1-3 read the step and assert the argument, the absence of `2>/dev/null` and the gate, and the WARNING path.
  - Tests 4, 5, 6 and 6b run the extracted bash with `bash -c`, cwd a fixture project, `HOME` set to a temp dir whose `.claude/devflow/bin` symlinks to the repo's bin, and the gh shim first on PATH. Disabled: exit 0, no WARNING, zero gh calls. Unauthenticated: WARNING, the command's output, the retry line, exit 0. Success: no output and `github_issue: o/r#1` in OBJECTIVE.md. 6b repeats that with `OBJECTIVE_DIR=.planning/objectives/02-a`.
  - Tests 7-9 run `df-tools --cwd <tmp> gh sync 02-a` as a real process: success exit 0, failing auth exit 1 with a JSON `error` on stderr, disabled exit 0 with `skipped:true` and no gh calls.
- **Guard (`df-tools-deprecations.repo.test.cjs`, 4 tests).** Test 10 reports `file:line` for any line naming a key of `DF_TOOLS_DEPRECATIONS` without the word "deprecated". 10b checks the scan set is real (over 100 files, five named anchors). 10c is a sensitivity test of the matcher and the legacy-workflow filter. Test 11 checks every replacement is a live subcommand in the help table (`gh` usage mentions `sync` and `--all`).
- **Prose.**
  - `gh-sync/SKILL.md` is rewritten for `gh sync --all`, `<objective>` in any spelling, the markers and managed sections, legacy adoption, the one-time append below an old body, lost-mapping recovery, pacing and retry, and a commit step that also adds changed OBJECTIVE.md files. `sync-objectives` is mentioned once, as deprecated.
  - `new-project.md` runs `gh sync --all`, uses the `milestone:` / ROADMAP wording, and commits the mapping plus changed OBJECTIVE.md files.
  - `verifier.md` posts gaps with `--kind verification`. `templates/objective.md` says `github_issue` is written on first sync.
  - `CLAUDE.md`: the GitHub integration bullet and one sentence in the Upgrade bullet (migration 0009). `USER-GUIDE.md`: the config table (TTL key) and the `## GitHub integration` section (triggers, how a sync treats an issue, mapping v3, recovery, skipped vs exit 1). `CHANGELOG.md` `[Unreleased]`: Added, Changed, Fixed, Deprecated. `PROPOSAL-github-system-of-record.md`: one line saying the eight defects are fixed in objective 46.

## Deviations from Plan

**1. [Rule 1 - Bug] Test 5 asserted gh's raw stderr, but the command prints its own rendering.** The TRD expected `You are not logged into any GitHub hosts.` in the output. `gh sync` renders a `GhAuthError` as JSON (`"error": "GitHub CLI is not authenticated."`, `"remediation": "gh auth login"`) and does not echo gh's stderr. The test now asserts the command's own error and remediation, which is what the step is meant to show. The assertion still proves the output is displayed and not swallowed.

**2. [Rule 1 - Bug] `OBJECTIVE_DIR` can be a path.** `init execute-objective` returns `objective_dir` as `.planning/objectives/<dir>` and a path is not a valid spelling for `gh sync`. The TRD allowed `basename` for that case; the step does `OBJECTIVE_DIR="$(basename "${OBJECTIVE_DIR}")"` first, and test 6b covers it.

**3. [Rule 1 - Bug] A bare `.planning/objectives/*/OBJECTIVE.md` in a `commit --files` list fails when nothing matches.** Checked in a scratch repo: `df-tools commit` returned `commit_failed` (`pathspec … did not match any file(s) known to git`). At new-project time there are usually no objective directories yet. Both the new-project workflow and the gh-sync skill use `$(git ls-files -m -o --exclude-standard -- '.planning/objectives/*/OBJECTIVE.md')`, which lists only files that changed, and say why.

**4. [Rule 3 - Blocking] dispatch-completeness test 5 failed on the first full run.** It reads the CLAUDE.md Core Tool bullets and takes the first word of each backtick span as a command name, so the new span list (`comment`, `pull`, `status`, …) read as seven non-commands. The spans are now `gh comment`, `gh pull` and so on, as the old bullet had them (c101d9e).

**5. Scope note.** The guard's scan set is the TRD's. CLAUDE.md, USER-GUIDE and CHANGELOG are covered by the verification `rg` below; every hit there says deprecated. The proposal's defect 4 line still names `sync-objectives` because it describes the old behaviour.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 | `node --test execute-objective-gh-sync.test.cjs doc-refs.repo.test.cjs` | 0 (10 + 14 pass) | PASS |
| 2 | `node --test df-tools-deprecations.repo.test.cjs doc-refs.repo.test.cjs` | 0 (18 pass) | PASS |
| 3 | `node --test dispatch-completeness.test.cjs doc-refs.repo.test.cjs df-tools-deprecations.repo.test.cjs` | 0 | PASS |
| 3 | `npm test` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test execute-objective-gh-sync.test.cjs` | 1 (1, 2, 3, 5, 6, 6b fail; 4, 7-9 pass as guards) | FAIL (correct) |
| GREEN (task 1) | same | 0 (10 pass) | PASS (correct) |
| RED (task 2) | `node --test df-tools-deprecations.repo.test.cjs` | 1 (test 10: gh-sync/SKILL.md:35 and :62, new-project.md:1109) | FAIL (correct) |
| GREEN (task 2) | same plus doc-refs.repo | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (run 1) | `npm test` | 1: 6187 tests, 6153 pass, 1 fail (dispatch-completeness 5, caused by the CLAUDE.md edit), 33 skipped | FAIL, fixed in c101d9e |
| test (run 2) | `npm test` | 0: 6187 tests, 6154 pass, 0 fail, 33 skipped | PASS |
| verification 1 | `rg -n 'gh sync' workflows/execute-objective.md` | the new line only; no `2>/dev/null` | PASS |
| verification 2 | `rg -n sync-objectives CLAUDE.md docs/USER-GUIDE.md plugins --glob '*.md'` | 3 hits (CLAUDE.md, USER-GUIDE, gh-sync skill), each says deprecated | PASS |

The accepted failure MA-7 and the known flakes (J1 tui, 45-02 test 10) did not fail on either run, so no isolated reruns were needed. Success criterion 6 is met with zero failures.

## Post-TRD Verification

- Auto-fix cycles used: 1 (the dispatch-completeness failure).
- Must-haves verified: 7/7. The step uses `gh sync "${OBJECTIVE_DIR}"` (test 1); it has no `2>/dev/null` or gate and prints failures (tests 2, 3, 5); it is quiet on success and skip (tests 4, 6); the CLI exits 0 / 1 / 0 (tests 7-9); the guard passes (tests 10-11); the verifier, skill, workflow, template, CLAUDE.md, USER-GUIDE and CHANGELOG are updated; the suite is green.
- Gate failures: none outstanding.

## Notes

- Tests 6, 6b and 7 take about 3.5 s each because the real `df-tools` process honours the 1 s write spacing; `MIN_WRITE_INTERVAL_MS` is not overridable from the environment. The file runs in about 12 s.
- Nothing from objectives 47-51 is documented as present. Versions were not bumped.

## Self-Check: PASSED

- Created files exist: `execute-objective-gh-sync.test.cjs` and `df-tools-deprecations.repo.test.cjs`.
- All six commits (0f4645a, 5d73541, 23725d0, cd347ef, e0b5333, c101d9e) are in `git log 55b3315..HEAD`.
- The unrelated untracked files (docs/CODEX-PORT.md, docs/PROPOSAL-visual-workflow-class.md, references/codex-agent-policy.md, the .gitkeep files) were not staged.
- STATE.md, ROADMAP.md and REQUIREMENTS.md were not touched; the orchestrator reconciles them. The requirements to mark complete are GSF-03 plus the docs coverage of GSF-01, GSF-02, GSF-04 to GSF-08.
