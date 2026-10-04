---
objective: 53-worktree-and-health-hygiene
trd: "06"
subsystem: doctor
tags: [doctor, decisions, frontmatter, repair, tdd]
requires:
  - phase: 52-05
    provides: "block-scalar serializer and parser in frontmatter.cjs (reconstructFrontmatter, extractFrontmatter)"
  - phase: 45-06
    provides: "doctor check contract, upgrade.backup, doctor fixtures"
provides:
  - "pure decision-repair.cjs: classifyDecision(text, {parse}) and repairDecision(text, {parse})"
  - "doctor check 33-decision-resolution (scope project), backed-up verified fix, report-only in store mode"
affects: [53-07]
tech-stack:
  added: []
  patterns:
    - "recover by text span anchored on the writer's last key, then prove the rebuild by re-parsing it through an injectable parser seam"
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/decision-repair.cjs
    - plugins/devflow/devflow/bin/lib/decision-repair.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/33-decision-resolution.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/33-decision-resolution.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/doctor-checks/README.md
decisions:
  - "Intact is decided with the real extractFrontmatter, never the parse seam. The seam applies only to verifying the rebuilt text, so a stub parser cannot make a broken file look intact."
  - "A resolution that the parser already reads back as the full answer is intact even when a stray quote line remains (TRD rule 4). It is not rewritten."
metrics:
  duration: 28min
  completed: 2026-10-04
requirements: ["53-8"]
---

# Objective 53 TRD 06: Decision repair Summary

`df-tools doctor` now finds resolved decisions whose multi-line `resolution` the pre-52 one-line writer flattened. `doctor --fix` rewrites each recoverable one as a `|-` block scalar, after a backup and after proving the rebuild re-parses to the recovered answer. Unrecoverable files are reported with the hand-fix instruction, and store mode is report-only.

## Progress
- [x] Task 1: pure decision-repair module (classify, recover, rebuild, verify) — RED 93170889, GREEN 0ab98a1c
- [x] Task 2: doctor check 33-decision-resolution with a backed-up, verified fix — RED 14ca765b, GREEN 301d99c1

## Accomplishments

- `decision-repair.cjs` (pure, no fs/git/env). The raw file still holds every byte of the answer, so it recovers the span between the `resolution:` and `resolved_at:` lines. It strips the writer's quotes, normalises to LF with `trimEnd`, and rebuilds with `reconstructFrontmatter`, so the shape matches 52-05 exactly. The rebuilt text is returned only if `parse(rebuilt)` gives `resolution === answer`, the original `resolved_at`, and the text after the frontmatter unchanged.
- Doctor check `33-decision-resolution`. It scans `.planning/decisions/resolved/DECISION-NNN.md` and reports `repairable` and `unrecoverable` files (`warn`); `fixable` only when something is repairable and the project is not in store mode. `fix()` re-scans, calls `upgrade.backup` first, re-reads each file to confirm its bytes are unchanged, writes atomically (temp file in the same directory, mode kept) and returns project-relative `changed` paths plus `backup`. It is a working-tree edit: it never stages and never commits.
- Store mode: `run()` is `fixable: false` with a finding that calls it a hand fix on the decision's GitHub copy followed by `gh pull --all` (also given as `fix_command`). `fix()` called directly refuses.
- README range table: `33-decision-resolution` named in the 30-39 row.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: decision-repair module | `node --test plugins/devflow/devflow/bin/lib/decision-repair.test.cjs plugins/devflow/devflow/bin/lib/frontmatter.test.cjs` | 0 (88 pass, 0 fail) | PASS |
| 2: doctor check 33 | `node --test .../doctor-checks/33-decision-resolution.test.cjs .../doctor.e2e.test.cjs .../doctor-checks/30-31-state.test.cjs` | 0 (41 pass, 0 fail) | PASS |
| 2: smoke on this repo | `node plugins/devflow/devflow/bin/df-tools.cjs doctor --json` (report only) | 0 | PASS |
| extra: doctor-adjacent | `node --test .../doctor-cli.test.cjs .../doctor.test.cjs .../doctor-checks/25-gh-store-sync.test.cjs .../commit-steps.test.cjs` | 0 (82 pass, 0 fail) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../decision-repair.test.cjs` | 1 (`Cannot find module './decision-repair.cjs'`) | FAIL (correct) |
| GREEN (task 1) | `node --test .../decision-repair.test.cjs .../frontmatter.test.cjs` | 0 | PASS (correct) |
| RED (task 2) | `node --test .../33-decision-resolution.test.cjs` | 1 (`Cannot find module './33-decision-resolution.cjs'`) | FAIL (correct) |
| GREEN (task 2) | `node --test .../33-decision-resolution.test.cjs ...` | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task 1) | `node --test` scoped to the files in the task's verify | 0 | PASS |
| test (task 2) | `node --test` scoped to the files in the task's verify | 0 | PASS |
| test (objective) | `npm test` | not run here | not_available (runs once in 53-07, per the TRD) |

## Smoke on this repo (test list item 9)

`df-tools doctor --json` (no `--fix`, run from this TRD's worktree, which carries the same DECISION-002):

```
decision-resolution: severity ok, fixable false
  finding: "1 resolved decision(s) checked: every resolution is intact"
fixes: []
```

DECISION-002 (one line, then the writer's blank line, then `resolved_at`) is intact and was not rewritten. `doctor --fix` was never run against this repo or `~/.claude`.

## Additional verification (scratchpad only, not committed)

The fixtures are hand-built, as the TRD requires, and that is a claim about the old writer. I checked it against the real pre-52 writer: `git show 4ab2e30a^:.../frontmatter.cjs`, run through the old `spliceFrontmatter` exactly as `resolveDecision` did. 18 answers were covered: colon, `#`, `[` and `{` starts, quote starts, CRLF, a leading newline, an inner `---`, blank runs, trailing spaces and the 52-05 repro. All 18 were recovered exactly, or were already read back whole by the parser (single-line). The body after the frontmatter stayed byte-identical in every repaired case.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test expectation] Stray-quote single-line shape is intact, not repairable**
- **Found during:** Task 1 GREEN
- **Issue:** My RED test expected `resolution: "a: b` plus a lone `"` line to classify as repairable. The real parser already reads it back as `a: b` (it strips a leading quote even when unclosed), so under the TRD's own intact rule 4 (`extractFrontmatter(text).resolution === answer`) it is intact.
- **Fix:** Corrected the test to pin the TRD rule rather than loosening the module. No production change.
- **Files modified:** `decision-repair.test.cjs`
- **Commit:** 0ab98a1c

**2. [Rule 3 - Tooling] `summary checkpoint` wrote the main checkout, not the worktree**
- **Found during:** first progress checkpoint
- **Issue:** The planning verb resolves the main checkout (the known bug 53-01 is fixing). It created `/Users/justin/dev/devflow-claude/.planning/objectives/53-worktree-and-health-hygiene/53-06-SUMMARY.md` as an untracked file and nothing in the worktree.
- **Fix:** Called the verb once only. From then on, wrote this SUMMARY directly into the worktree and committed it on `df/exec-53-06`, as the dispatch instructs. The stray main-checkout file was not touched or deleted.
- **Needs the orchestrator:** remove or overwrite that untracked file in the main checkout before merging this branch, or the merge will report an untracked-file conflict on `53-06-SUMMARY.md`.

**3. [Rule 3 - Tooling] `state record-metric` takes `--job`, not `--trd`**
- **Found during:** state updates
- **Issue:** The executor doc names `--trd`; the CLI answers "objective, job, and duration required".
- **Fix:** Used `--job 06`. Recorded as `Objective 53 P06 | 28min | 2 tasks | 5 files` in STATE_ARCHIVE.md.

**4. [Preflight] First `exec-context check` ran from the main checkout**
- **Found during:** step 1
- **Issue:** My shell was rooted in the main checkout, so the first check passed there (`is_worktree: false`) and claimed the main checkout for 53-06, which proves nothing about the worktree.
- **Fix:** Released only that claim (`exec-context release --id 53-06`), re-ran the check with `--cwd` set to the worktree (`checkout` = the worktree, `branch` = `df/exec-53-06`, `base_visible: true`) and used absolute worktree paths throughout.

### Not changed, as the TRD anticipated

- `doctor.e2e.test.cjs` needed no edit: it pins the exact id set only for `--global`, and check 33 is project-scoped. Its fixture has no decisions, so the new check reports `ok` there.

## Authentication Gates

None.

## Discovered commands

None. Every command came from `.planning/STACK.md` (`test`, scoped `node --test {files}`).

## Notes for later work

- A recovered answer that is a single line (a quoted answer with a trailing newline) is rewritten as whatever the serializer writes for it, not forcibly as a `|-` block. In practice the parser already reads those back whole, so they classify as intact and are never rewritten. The `|-` block form applies to every multi-line answer.
- A key hand-inserted between `resolution:` and `resolved_at:` would be folded into the recovered answer. `resolveDecision` never writes one, the TRD defines the span by those two lines, and the pre-fix backup covers the case.
- `state.json` `progress_pct` moved 98 to 97 as a side effect of `roadmap update-job-progress 53` now counting objective 53. Expect a trivial merge conflict on STATE/ROADMAP/`state.json` with the sibling TRDs.
- `requirements mark-complete 53-8` reported "REQUIREMENTS.md not found": this repo has no REQUIREMENTS.md, and `53-8` is item 8 of OBJECTIVE.md. Nothing to tick.

## Flutter UI Evidence

Not applicable (type: standard, no Flutter stack).

## Post-TRD Verification

- Auto-fix cycles used: 1 (the test expectation in deviation 1)
- Must-haves verified: 5/5 truths (report with classification; `--fix` rewrite with backup and intact keys and body; write only after re-parse verification; single-line and block shapes never rewritten; store mode report-only)
- Gate failures: None

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/decision-repair.cjs
- FOUND: plugins/devflow/devflow/bin/lib/decision-repair.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/doctor-checks/33-decision-resolution.cjs
- FOUND: plugins/devflow/devflow/bin/lib/doctor-checks/33-decision-resolution.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/doctor-checks/README.md (33-decision-resolution row)
- FOUND commits on df/exec-53-06: 93170889, 0ab98a1c, 14ca765b, 301d99c1
