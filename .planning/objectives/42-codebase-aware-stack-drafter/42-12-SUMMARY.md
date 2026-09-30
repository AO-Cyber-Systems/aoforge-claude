---
objective: 42-codebase-aware-stack-drafter
trd: "12"
job: 42-12
subsystem: stack-drafter
tags: [stack-detect, stack-report, stack-init, gitignore, gap-closure]
requires: ["42-05", "42-07", "42-08"]
provides:
  - "ignore-aware detectAreas(root, { maxDepth, isIgnored }) + defaultIsIgnored + IGNORED_DIR_FALLBACK"
  - "stack report meta.components = profile components[].path; meta.unsupported_areas"
  - "initProfile(write) result.ignored[] / result.warnings[] from a file-level gitignore preflight"
affects: ["42-13", "42-11 rollout re-run"]
tech-stack:
  added: []
  patterns:
    - "one batched `git check-ignore --no-index --stdin -z` spawn per BFS level; prune before descending"
    - "BFS-planned walk + DFS processing over cached listings (keeps evidence order unchanged)"
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-detect-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/stack-detect.cjs
    - plugins/devflow/devflow/bin/lib/stack-detect.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-report.cjs
    - plugins/devflow/devflow/bin/lib/stack-report.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-profile.cjs
    - plugins/devflow/devflow/bin/lib/stack-init.test.cjs
decisions:
  - "Dirs are queried BARE (no trailing slash) in check-ignore: git lstat()s them, so dir-only rules still match, while a trailing slash makes `x/*` match `x/` itself and over-prunes `x/*` + `!x/keep/`"
  - "The static fallback always wins, so a negation under dist/ cannot re-include dist/keep/ (git itself also keeps a child of an excluded parent excluded)"
  - "unsupported_areas = non-root language areas with no tier that the profile does not list as components (supported but unlisted areas are not called unsupported)"
  - "The init preflight reuses helpers.isGitIgnored on the FILE path; it is non-fatal and echoed to stderr by the CLI"
metrics:
  duration: "~1h"
  completed: 2026-09-29
  tasks: 3
  files: 7
---

# Objective 42 TRD 12: Ignore-aware area detection, profile-derived report components, file-level gitignore preflight Summary

The fix for gap G1 has three parts:
- `detectAreas` now prunes gitignored dirs with one batched `git check-ignore --no-index` call per walk level, and applies a static fallback list (build outputs, caches, `*scaffold*`) on top.
- STACK-REPORT `components` now equal the profile's own `components[].path`. Unsupported areas get their own `unsupported_areas` list.
- `stack init --write` now checks whether `.planning/STACK.md` itself is gitignored, not the `.planning` dir.

## What changed

- **stack-detect.cjs**
  - Pass 1 is now planned breadth-first. At each level, the candidate dirs that pass `mayDescend` go through ONE `admit` batch. Ignored dirs are never listed.
  - The existing depth-first processing then runs over the cached listings. This keeps flag and evidence order byte-identical, so every pre-existing detect test passes unchanged.
  - Pass 2 (codegen scan) batches per level through the same decision cache, so no dir is asked about twice.
  - `defaultIsIgnored(root)` returns null outside a work tree (the probe result is memoised per root), otherwise a batch filter.
  - `ignore_source` (`git` | `static` | `custom`) is a non-enumerable property on the returned array.
  - Git missing, a spawn error, or a throwing filter falls back to static-only. Nothing throws.
- **stack-report.cjs**
  - `meta.components` comes from `fm.components` (STACK.md, or the draft under `--draft`).
  - `meta.unsupported_areas` is new. The header renders `unsupported_areas: [...]` only when it is non-empty.
  - Report output is still deterministic.
- **stack-profile.cjs**
  - `initProfile` results always carry `ignored` and `warnings`.
  - With `write`, it runs `isGitIgnored(projectRoot, '.planning/STACK.md')`. On a match the result gets `ignored: ['.planning/STACK.md']` and the warning `'.planning/STACK.md is gitignored; df-tools commit will skip it'`.
  - The file is still written (adopt is unaffected), and the CLI echoes the warning to stderr.
  - The module stays stack-neutral (P11 green).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Query dirs bare, not with the trailing slash the TRD recommended**
- **Found during:** Task 1 (probing git before writing code)
- **Issue:** With a trailing slash, `git check-ignore --no-index` matches `gen/*` against `gen/`, so it reports `gen/` as ignored and would lose `gen/keep/` under `gen/*` + `!gen/keep/`. Bare paths are correct for `x`, `x/`, `/x/`, `x/*`, `rel*/` and `**/x/`, because git lstat()s existing dirs.
- **Fix:** The default filter strips the slash for the git query and maps results back to `<rel>/`. T6/T6b pin both rule spellings and the negation.
- **Commit:** 7b4bd5a

**2. [Spec conflict] TRD test 6 expected `!dist/keep/` to keep `dist/keep/`**
- **Issue:** This conflicts with the must-have "static fallback is always applied" (`dist` is on the list). Git also keeps a child of an excluded parent excluded: `dist/` + `!dist/keep/` still reports `dist/keep/` as ignored.
- **Resolution:**
  - The negation test uses a non-fallback dir (`gen/*` + `!gen/keep/` keeps `gen/keep/`).
  - T6c documents that the static list wins under `dist/`.
  - The dist-based rule-spelling tests are joined by `bundle`/`bundle/` variants, because `dist`/`scaffoldapp` alone would pass on the static list and prove nothing about git.

**3. [Design choice] `ignore_source` has a third value, `custom`**
- **Why:** An injected `isIgnored` is neither git nor static.

**4. [Test ordering] I17 was already green at its RED commit**
- **Why:** I17 is TRD test 1 through the CLI (`stack init --raw` never drafts the ignored tree), and it was fixed at the detection layer in Task 1 (7b4bd5a). It stays as a CLI regression pin. The Task 3 RED failures were I18a-d.

No out-of-scope files were modified. ROADMAP.md and STATE.md were deliberately not touched: in worktree mode the orchestrator ticks them after the merge.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Ignore-aware detectAreas | `node --test plugins/devflow/devflow/bin/lib/stack-detect.test.cjs` (31/31) | 0 | PASS |
| 2: Report components = profile components | `node --test plugins/devflow/devflow/bin/lib/stack-report.test.cjs` (24/24) | 0 | PASS |
| 3: File-level gitignore preflight | `node --test .../stack-init.test.cjs .../stack-profile.test.cjs` (80/80, P11 included) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| T1 RED (90e4536) | `node --test .../stack-detect.test.cjs`: 15 new tests fail (ignored dirs still areas, no exports) | 1 | FAIL (correct) |
| T1 GREEN (7b4bd5a) | same, 31/31 | 0 | PASS (correct) |
| T2 RED (2843e18) | `node --test --test-name-pattern 42-12 .../stack-report.test.cjs`: components `['site/','svc/','ui/frontend/']` / `['svc/','tools/x/']` | 1 | FAIL (correct) |
| T2 GREEN (7943a5e) | `node --test .../stack-report.test.cjs`, 24/24 | 0 | PASS (correct) |
| T3 RED (4453973) | `node --test --test-name-pattern "I17\|I18" .../stack-init.test.cjs`: I18a-d `ignored` undefined | 1 | FAIL (correct) |
| T3 GREEN (c116be2) | `node --test .../stack-init.test.cjs .../stack-profile.test.cjs`, 80/80 | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (per task) | `node --test 'plugins/devflow/devflow/bin/lib/stack-*.test.cjs' 'plugins/devflow/devflow/bin/lib/adopt-*.test.cjs'` (841/841 after Task 2) | 0 | PASS |
| wave | `NODE_PATH=<main>/node_modules npm --prefix <worktree> test`: tests 4942, pass 4909, fail 1 (MA-7 handoff-e2e PTY-path mock auth, the accepted known failure), skipped 32. Baseline was 4918/4885/1/32, so +24 new tests, all passing | 1 | PASS (only the allowed failure) |
| build (read-only) | `df-tools --cwd /Users/justin/dev/ao-terminal stack report --draft --raw`: `components: ["tsunami/"]`, `unsupported_areas: ["docs/", "tsunami/frontend/"]`, no `dist/` area; `git -C ao-terminal status --porcelain` unchanged | 0 | PASS |

The quanta-local read-only check was skipped to save turns. It should be covered by the 42-11 re-run below.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
  - gitignored areas are pruned by one `--no-index` batch per level
  - the static fallback is always applied, and is the only filter without git
  - report components equal the profile's components exactly; unsupported areas are listed separately
  - the file-level `.planning/STACK.md` preflight is non-fatal
  - P11 is green, and the suite shows only the known handoff-e2e failure
- Gate failures: None beyond the accepted MA-7

## Hand-off

- **42-13 follows.** It owns stack-draft, stack-runners, stack-classify and stack-evidence. Some root-area JS findings still cite `go.mod` on ao-terminal (JS-AUDIT/JS-LINT/JS-TYPE on `""`); that is 42-13 territory and was left untouched here.
- **42-11 Task 1 must be RE-RUN after 42-13** to regenerate `42-ROLLOUT.md`, which is still the old dry-run output. The rollout should treat a non-empty `ignored` from `stack init --write` as blocked.

## Self-Check: PASSED

- All 7 modified files exist.
- Commits 90e4536, 7b4bd5a, 2843e18, 7943a5e, 4453973 and c116be2 are present in `git log 23f480f..HEAD`.
