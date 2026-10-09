---
objective: 61-store-mode-rough-edges-and-observability
job: "02"
subsystem: skills
tags: [skill-frontmatter, requires, path-lookup, doctor, store-mode]

requires: []
provides:
  - "`requires:` as a parsed, validated SKILL.md frontmatter field (tool name or list)"
  - "lib/skill-requires.cjs: parseRequires, readSkillRequires, listSkillRequires, skillNameFromInvocation, findOnPath, missingTools, refusalReason, hintFor, INSTALL_HINTS, SKIP_ENV"
  - "doctor global check 14 `skill-requires` (report only)"
  - "/devflow:gh-sync declares `requires: [gh]`"
affects: [61-08 hooks/gate-skill-requires.js, 61-09 dogfood and docs, objective 62 skill sweep]

tech-stack:
  added: []
  patterns:
    - "stat-only PATH lookup (executable regular file in a PATH directory), no spawn"
    - "fail-open library: every exported function returns null, [] or { ok: false } instead of throwing"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/skill-requires.cjs
    - plugins/devflow/devflow/bin/lib/skill-requires.test.cjs
    - plugins/devflow/devflow/bin/lib/skill-requires.repo.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/14-skill-requires.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/14-skill-requires.test.cjs
  modified:
    - plugins/devflow/skills/gh-sync/SKILL.md
    - plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs

key-decisions:
  - "Enforcement lives in a hook (61-08) on UserPromptExpansion and PreToolUse(Skill), not in a df-tools preflight each SKILL.md calls: a skill cannot refuse itself, a preflight depends on the model obeying the body, and it would edit every skill that objective 62 sweeps"
  - "requires: refuses the whole skill, so only gh-sync declares it; skills that need a tool for some subcommands (initiatives sync, awareness) do not"
  - "skillNameFromInvocation accepts only DevFlow-namespaced names (devflow:<skill> or a /devflow: prompt); a bare command_name is another plugin's or the user's own skill"
  - "doctor check 14 is ok (not warn) when no plugin is installed, because hooks-registry already warns about the install"

patterns-established:
  - "A skill name is validated against /^[a-z0-9][a-z0-9-]*$/ before any path is built from it"

requirements-completed: []

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 8min
completed: 2026-10-06
tokens_input: 6936020
tokens_output: 55790
tokens_cache_read: 6792376
tokens_cache_write: 143534
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 61 TRD 02: `requires:` in skill frontmatter, the tool lookup and the doctor check Summary

Skills can declare `requires: [gh]` in frontmatter; `skill-requires.cjs` finds tools on PATH with stat calls only, builds a refusal that names `/devflow:doctor` and the `DEVFLOW_SKIP_SKILL_REQUIRES=1` escape, and doctor check 14 reports missing tools with install hints.

STOR-04 is delivered in part: the declaration, lookup, message and doctor remediation. The refusal itself (the hook and its two registrations) is TRD 61-08, so STOR-04 is not marked complete here.

## Progress
- [x] Task 1: skill-requires.cjs, the frontmatter field, skill-name resolution, PATH lookup and refusal text (tests 1-7) — e9629f0b (RED), 0994be40 (GREEN)
- [x] Task 2: doctor check 14-skill-requires, the gh-sync declaration and the repo contract (tests 8-18) — a9e8cfc8 (RED), 17ffb3d5 (GREEN)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `doctor.e2e.test.cjs` pins the global check ids**
- **Found during:** Task 2 verification
- **Issue:** test 7 (`--global runs only the global checks`) deep-equals the id list against `GLOBAL_IDS`, so adding a global check failed it.
- **Fix:** added `'skill-requires'` to `GLOBAL_IDS`. This is the change the TRD's `<recovery>` names as the only legitimate one there.
- **Files modified:** plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs
- **Commit:** 17ffb3d5

**2. [Rule 3 - Blocking] `hintFor` exported from skill-requires.cjs**
- **Found during:** Task 2
- **Issue:** the doctor check needs the same install-hint lookup, including the generic hint for an unknown tool, as `refusalReason`. Copying it would let the two texts drift.
- **Fix:** exported `hintFor` (an addition to the artifact's export list; nothing removed).
- **Files modified:** plugins/devflow/devflow/bin/lib/skill-requires.cjs
- **Commit:** 17ffb3d5

### Scope notes

- **STOR-04 not marked complete.** The TRD frontmatter lists `requirements: [STOR-04]`, but the requirement text says invoking a skill without the tool "is refused", which is 61-08's hook. `requirements mark-complete` was not run; 61-08 (and 61-09) own it.
- Test 17 also asserts that at least one skill declares `requires:`, so it fails RED before gh-sync is edited (the TRD only expected test 16 to).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: skill-requires.cjs and tests 1-7 | `node --test plugins/devflow/devflow/bin/lib/skill-requires.test.cjs` (42 tests) | 0 | PASS |
| 1: require surface | `rg -n "require\(" plugins/devflow/devflow/bin/lib/skill-requires.cjs` (fs, path, ./frontmatter.cjs only) | 0 | PASS |
| 2: doctor check 14 and repo contract | `node --test .../doctor-checks/14-skill-requires.test.cjs .../skill-requires.repo.test.cjs` (22 tests) | 0 | PASS |
| 2: neighbouring doctor tests | `node --test .../doctor.e2e.test.cjs .../doctor-checks/11-12-install.test.cjs` (8 + 18 tests) | 0 | PASS |
| 2: doctor lists the check | `node plugins/devflow/devflow/bin/df-tools.cjs doctor --global --json` shows `skill-requires` (severity ok on the installed 2.13.1, which predates `requires:`) | 0 | PASS |
| 2: real skills, no gh on PATH | `check.run` with `DEVFLOW_DOCTOR_PLUGIN_ROOT` = this checkout and `PATH=/usr/bin` | n/a | warn: `gh (needed by /devflow:gh-sync)` with the install hint |
| 2: gh-sync diff | `git diff <base> -- plugins/devflow/skills/gh-sync/SKILL.md` | 0 | two added lines, frontmatter only |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test plugins/devflow/devflow/bin/lib/skill-requires.test.cjs` | 1 | FAIL (module not found), correct |
| GREEN (task 1) | same | 0 | PASS (42 tests), correct |
| RED (task 2) | `node --test .../14-skill-requires.test.cjs .../skill-requires.repo.test.cjs` | 1 | FAIL (check missing; tests 16 and 17), correct |
| GREEN (task 2) | same plus `skill-requires.test.cjs` | 0 | PASS (64 tests), correct |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task, scoped) | `node --test plugins/devflow/devflow/bin/lib/skill-requires.test.cjs plugins/devflow/devflow/bin/lib/skill-requires.repo.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/14-skill-requires.test.cjs` | 0 | PASS (64/64) |
| test (full suite, informational) | `npm test` | 1 | 10,140 pass, 11 fail, 50 skipped; none caused by this TRD (see below) |

### Full-suite failures (none touch files this TRD changed)

- `E2E1` in `roadmap-reconcile.test.cjs`: reports `61-02` as `trd_summary_exists` drift (ROADMAP line unticked while a SUMMARY exists). Cleared by `roadmap update-job-progress`, run in the state step below.
- `github-enterprise-migration` in `stack-drafter-fleet.test.cjs`: fails identically in the main checkout at `/Users/justin/dev/devflow-claude` (depends on the local fleet of repos).
- `devflow-watch.test.cjs` (5 tests) and `handoff-e2e.test.cjs` (daemon start/stop, route-results): the daemon does not write its PID file when started from this worktree path; the same file passes 22/22 in the main checkout. Neither file references skills, doctor or gh-sync.

## Discovered commands

None. `npm test` (scoped form `node --test {files}`) came from the general stack profile.

## Baseline for 61-08: `claude plugin validate`

`claude plugin validate /Users/justin/dev/.df-worktrees/devflow-claude/61-02-skill-requires-lib/plugins/devflow` (run from the worktree by absolute path; a relative path validates the main checkout instead) ends with:

`✔ Validation passed with warnings`

1 manifest warning (`statusLine: Unknown field 'statusLine'`) and 18 hooks warnings (`${CLAUDE_PLUGIN_ROOT}` unquoted in every hook command). It does not validate skill frontmatter, so it neither accepts nor rejects `requires:`. 61-08 adds two registrations, so its count is expected to rise by the same unquoted-placeholder warning per new command.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (declaration parsed and validated; stat-only lookup; refusal text names skill, tools, hints, doctor and escape; doctor check 14 warns with tool, skills and hint; gh-sync declares gh with a repo test pinning every declared tool to a hint)
- Gate failures: none attributable to this TRD

## Self-Check: PASSED

All six created or modified source files exist, and commits e9629f0b, 0994be40, a9e8cfc8 and 17ffb3d5 are present on `df/exec-61-02-skill-requires-lib`.
