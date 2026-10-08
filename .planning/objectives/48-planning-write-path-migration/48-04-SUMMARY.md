---
objective: 48-planning-write-path-migration
trd: "04"
subsystem: planning-audit
tags: [gwp-02, sc1, ratchet, d-21, prose-audit]
requires:
  - 48-03 (job-checker.md Dimension 8 edit, measured in the baseline)
provides:
  - planning-audit.cjs (WRITE_VERB_RE, WRITE_OP_RE, ARTIFACT_RE, VERB_CALL_RE, MARKER_RE, GROUPS, GROUP_PATHS, groupOf, directiveArtifact, scanWrites, frontmatterStatus, scanSet)
  - planning-writes.repo.test.cjs (SC1 ratchet; exports EXEMPT, OWNER, measure, measuredBaselines, checkRatchet, baselineComment)
  - __fixtures__/planning-writes-baseline/{plan,execute,verify,bootstrap,work,misc}.json
affects:
  - 48-15 (adds "every verb named in prose exists in the df-tools dispatch")
  - 48-16..48-21 (each lowers its group's baseline to zero)
  - 48-23 (deletes the baselines, asserts zero findings)
tech-stack:
  added: []
  patterns: [ratchet baseline per group, inline allow marker, pinned EXEMPT with reasons]
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/planning-audit.cjs
    - plugins/devflow/devflow/bin/lib/planning-audit.test.cjs
    - plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/plan.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/execute.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/verify.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/bootstrap.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/work.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/misc.json
  modified: []
decisions:
  - "scanWrites returns {findings, allowed, badMarkers} (the Decisions shape), not the bare array the Task 1 action text names"
  - "The quoted message of a `df-tools commit \"<msg>\"` call is masked: commit messages narrate (\"docs: create roadmap\"), they do not write"
  - "A marker with a short reason does not suppress its finding; it is reported as a bad marker and the finding still counts"
  - "EXEMPT holds only regex misreads (no planning file is written) and negations the scanner cannot see; descriptions of real planning writes stay in the baseline for the owning prose TRD"
  - "Baselines are regenerated only by measuring: PLANNING_AUDIT_MEASURE=1 skips the suite so a one-off node -e can require the repo test and call measuredBaselines()"
metrics:
  duration: ~10 min
  started: 2026-10-01T12:19:50Z
  completed: 2026-10-01T12:30:00Z
  tasks: 2
  files: 9
tokens_input: 6007927
tokens_output: 70558
tokens_cache_read: 5728246
tokens_cache_write: 279591
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 48 TRD 04: SC1 audit — planning-write ratchet over skills, workflows, agents, templates Summary

A pure scanner, `planning-audit.cjs`, finds every line of DevFlow prose that tells an agent to write a planning file with no store-aware df-tools verb within 3 lines. `planning-writes.repo.test.cjs` ratchets those counts per file against six group baselines. The repo now cannot gain a new direct planning-write instruction, and each of the 159 existing ones is pinned to a group that one prose TRD (48-16 to 48-21) must drive to zero.

## What was built

- **`planning-audit.cjs`**:
  - `scanWrites(text)` is pure. It returns `{findings:[{line, text, artifact}], allowed:[{line, reason}], badMarkers:[{line, problem}]}`.
  - `scanSet(repoRoot)` does a read-only walk of `skills/*/SKILL.md`, non-legacy `workflows/*.md`, `agents/*.md` and `templates/**/*.md`. References are out of scope, and the header says why.
  - `GROUPS` is the pinned D-21 table. `GROUP_PATHS` expands it to repo paths. `groupOf` defaults to `misc`.
  - No gh, no git, and no writes.
- **`planning-writes.repo.test.cjs`**:
  - The gate test runs `checkRatchet(measure().findings, baselines)`.
  - Tests 9-12 run on injected findings and baselines.
  - Test 13 is the planner.md sensitivity check, written as baselined ? >= 1 : === 0.
  - Test 14 checks EXEMPT sanity and that there are zero bad markers.
  - Further tests: the injected `Write the SUMMARY.md file` line in `skills/todo/SKILL.md` must fail naming `file:line`; each baseline file must have the right structure; every pinned group path must exist in the scan set.
- **Six baselines**: each is `{_comment, "<path>": n}`, with keys sorted and only counts > 0. Each `_comment` names the owning TRD and 48-23.

## Final regexes

| Name | Pattern |
|---|---|
| `WRITE_VERB_RE` (word forms, `gi`, artifact <= 80 chars away) | `\b(write\|writes\|create\|creates\|update\|updates\|append\|appends\|save\|saves\|edit\|fill\|overwrite\|rewrite)\b` |
| `WRITE_OP_RE` (operator forms, any artifact on the line) | `Write\(\|Edit\(\|\bcat\s*>\|\bcat\s*<<\|(?<![\w"'=\-\/<])>>?\s*\S*\.planning\/\|\btee\b\|\bsed -i\b\|\bfrontmatter (?:set\|merge)\b\|\btemplate fill\b` |
| `ARTIFACT_RE` (case-sensitive) | `\b(TRD\|SUMMARY\|VERIFICATION\|UAT\|RESEARCH\|CONTEXT\|REQUIREMENTS\|ROADMAP\|MILESTONES)s?\b\|\b(OBJECTIVE\.md\|PROJECT\.md\|STATE\.md)\|\b(codebase\/\|todos\/\|debug\/\|quick\/\|research\/\|milestones\/\|decisions\/)` |
| `VERB_CALL_RE` (+-3 lines) | `df-tools(?:\.cjs)?\s+(plan (put-trd\|push)\|objective (put\|set-status\|add\|insert\|complete)\|summary (post\|checkpoint)\|verification post\|doc put\|decision (open\|answer)\|todo (add\|complete)\|debug (put\|resolve)\|quick (put\|summary)\|milestone (put\|complete)\|planning (draft\|import\|mode)\|state [a-z-]+\|roadmap update-job-progress\|requirements mark-complete\|template fill\|gh pull)` (verbatim from the TRD) |
| Negation (before the verb) | `\b(?:never\|not\|no\|cannot\|\w*n['']t)[*_`]*\s+(?:[^\s,.;:]+\s+){0,2}[*_`]*$` (`i`): at most two plain words between, no clause break |
| Masked before matching | `@?~/\.claude/\S*` references, the allow marker, and the quoted message of `df-tools(.cjs)? [--cwd X] commit "<msg>"` |
| `MARKER_RE` | `<!--\s*planning-audit:\s*allow\b\s*([\s\S]*?)\s*-->` (reason >= 20 chars) |

## Per-group baseline totals

| Group | Owner TRD | Files | Findings |
|---|---|---|---|
| plan | 48-16 | 10 | 27 |
| execute | 48-17 | 6 | 34 |
| verify | 48-18 | 4 | 15 |
| bootstrap | 48-19 | 10 | 42 |
| work | 48-20 | 7 | 14 |
| misc | 48-21 | 10 | 27 |
| **total** | | **47** | **159** |

The scan set has 124 files. The raw scanner finds 177 findings. Masking commit messages removes 3 (`planner.md:1099`, `new-milestone.md:343`, `new-project.md:1101`), and EXEMPT removes 15, which leaves 159. This is well under the ~400 noise ceiling, so no artifact-window tightening was needed. The baseline was measured on WAVE_BASE `fdfb4b4`, after 48-03's Dimension 8 edit. `agents/job-checker.md` has 0 findings and is absent from `plan.json`.

Hot spots: `agents/executor.md` 14, `workflows/new-project.md` 14, `workflows/execute-objective.md` 8, `workflows/help.md` 8, and 7 each in `agents/planner.md`, `agents/verifier.md` and `workflows/new-milestone.md`.

## EXEMPT (13 entries, 15 findings)

Every entry is either a regex misread, where no planning file is written, or a negation the scanner cannot see.

- **Misreads:**
  - executor.md: "before reading the TRD, before any edit" — a code edit.
  - executor.md: "create a progress task for each task in the TRD" — TaskCreate.
  - executor.md: "if the TRD asked for a direct edit" — the generated-file guard.
  - planner.md: "TRD 01: Create User ..." — 3 example TRD titles.
  - planner.md and trd-prompt.md: "When a TRD creates 2+ new files" — source files.
  - planner.md: the post-write background paragraph.
  - templates/project.md: "update Project v2 custom fields".
  - templates/research.md: `Write "No user constraints..."` — section content; CONTEXT.md is the condition.
  - gh-sync SKILL.md: "create or edit the GitHub release".
- **Negations:**
  - planner.md: "**STOP. Write no TRDs.**"
  - verifier.md: "refusing to overwrite ... do NOT regenerate".
  - templates/UAT.md: "the generator REFUSES to overwrite".

Lines that describe a real planning write stay in the baseline, so the owning prose TRD either rewords them to name a verb or adds an inline marker. Examples: help.md "Creates CONTEXT.md", the research-synthesizer lines "orchestrator writes `.planning/research/SUMMARY.md`", and gh-sync "writes `github_issue` to OBJECTIVE.md".

## Known limitation (for 48-15 / 48-23)

Only the word forms the TRD lists count, so inflected forms are invisible. Examples: `writing`, `written`, `created`, `updated`, `edits`. 48-RESEARCH counted about 33 hits in `new-project.md`, while this scanner counts 14 there; the difference is mostly lines like "Before writing PROJECT.md" and "Read the created ROADMAP.md". If 48-23 wants zero to mean zero, it should widen `WRITE_VERB_RE` there and re-measure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Commit messages counted as write directives**
- **Found during:** Task 1, a measurement pass over the repo before the GREEN commit
- **Issue:** `df-tools.cjs commit "docs: create roadmap ..." --files .planning/ROADMAP.md` matched `create` plus `ROADMAP`. A commit message narrates; it does not write.
- **Fix:** Masked the quoted commit message (`COMMIT_MSG_RE`), before the `~/.claude/` mask, because that mask would otherwise blank the `df-tools.cjs` anchor. A write instruction on the same line as a commit still counts.
  - Added test 5e. It was seen RED, then GREEN.
- **Files modified:** planning-audit.cjs, planning-audit.test.cjs
- **Commit:** 33223437. The 5e test landed with the implementation, not in the RED commit.

**2. [Rule 3 - Blocking] Committed with the worktree's df-tools**
- **Issue:** The `~/.claude` mirror is a stale 2.10.1 build without `--cwd`.
- **Fix:** Every commit used `node <worktree>/plugins/devflow/devflow/bin/df-tools.cjs --cwd <worktree> commit ...`, as the dispatch directs.

### Interpretation notes (no behaviour beyond the TRD)

- **Return shape:** the Task 1 action says `scanWrites(text) → [{line, text, artifact}]`, but the Decisions section specifies `{findings, allowed, badMarkers}`. I followed Decisions; `findings` carries `{line, text, artifact}`.
- **Where the fs walk lives:** the binding rule says "the repo test does the fs walk", but the artifacts list and Task 1 place `scanSet(repoRoot)` in `planning-audit.cjs`. `scanWrites` is pure. `scanSet` is the only fs code, and it is read-only.
- **Verb forms split in two:** `WRITE_VERB_RE` holds only the word forms, which get the 80-char rule. The operator forms are a separate `WRITE_OP_RE`, which takes any artifact on the line.
- **Redirect lookbehind:** the redirect form refuses a `>` preceded by a word character, quote, `=`, `-`, `/` or `<`, so an XML tag like `<files>.planning/STATE.md</files>` is not a write.
- **Bare references masked too:** `~/.claude/...` references without the `@` are masked as well as `@~/...`.

### Additive beyond the test list

- Unit tests:
  - 2 also checks a verb three lines above.
  - 4 also checks `Don't`, `**NOT**`, and a negation that sits in an earlier clause.
  - 5b covers the 80-char boundary, 5c the store-aware verbs on the same line, 5d the XML tag and the `config.json` redirect, and 6b the stale marker above a satisfied directive.
  - 7b checks the group order, 7c that no path is pinned twice, and 8b the skills and agents globs.
- Repo tests:
  - the baseline-file structure test;
  - 12b, non-positive counts;
  - the exact-match pass;
  - every pinned GROUPS path must exist in the scan set.

## Invariant check (github.store off)

This TRD touches no write path and no verb. `planning-audit.cjs` and the repo test only read. With `github.store` off, every verb still writes the same local `.planning/` file, `.planning/` stays tracked, and the edit gate's cache deny stays inactive.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: planning-audit.cjs scanner | `node --test plugins/devflow/devflow/bin/lib/planning-audit.test.cjs` | 0 (17/17) | PASS |
| 2: repo ratchet + six baselines | `node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-audit.test.cjs` | 0 (29/29) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (T1) | `node --test .../planning-audit.test.cjs` | 1 (`Cannot find module './planning-audit.cjs'`) | FAIL (correct) |
| GREEN (T1) | `node --test .../planning-audit.test.cjs` | 0 (16/16) | PASS (correct) |
| RED (T1, 5e) | `node --test --test-name-pattern 5e .../planning-audit.test.cjs` | 1 (`1 !== 0`) | FAIL (correct) |
| GREEN (T1, 5e) | `node --test .../planning-audit.test.cjs` | 0 (17/17) | PASS (correct) |
| RED (T2) | `node --test .../planning-writes.repo.test.cjs` (empty baselines, empty EXEMPT) | 1 (gate lists all 174 findings; test 13 fails) | FAIL (correct) |
| GREEN (T2) | `node --test .../planning-writes.repo.test.cjs .../planning-audit.test.cjs` | 0 (29/29) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test planning-audit.test.cjs planning-writes.repo.test.cjs` | 0 (29/29) | PASS |
| regression | `node --test doc-refs.repo.test.cjs hooks/planning-writes.audit.test.js` | 0 (59/59) | PASS |
| full suite | `npm test` | 1: 7,206 tests, 7,171 pass, 2 fail, 33 skipped | ENV/ORDERING (see below) |

**The two full-suite failures, neither caused by this TRD's code:**

1. **`roadmap-reconcile.test.cjs` E2E1: zero drift in this repo's ROADMAP.**
   - **Cause:** this SUMMARY now exists, but `.planning/ROADMAP.md:225` still reads `- [ ] 48-04-...` (`trd_summary_exists` drift).
   - **Why it is not fixed here:** the dispatch forbids editing ROADMAP.md, and the orchestrator ticks the line after the merge, which clears it. Every executor's SUMMARY causes the same drift until then.
2. **`hooks/planning-writes.audit.test.js` "10. classify-session.js [session start] cwd=project root".**
   - **Cause:** a timing flake under full-suite load.
   - **Evidence:** the same file passes standalone, both before the SUMMARY existed (59/59 with doc-refs) and after it (45/45).

The known-flaky MA-7 in `handoff-e2e.test.cjs` skipped through its architectural-gap path, so it did not fail this run.

## Post-TRD Verification

- Auto-fix cycles used: 1 (commit-message masking)
- Must-haves verified: 6/6
- Gate failures: none in this TRD's gates. The full suite has 2 failures: the ROADMAP-drift ordering failure that clears when the orchestrator ticks 48-04, and a classify-session timing flake that passes standalone.
- The TRD's `<verification>` item is covered by the GATE test that injects `Write the SUMMARY.md file` into a copy of `skills/todo/SKILL.md`. The failure names `plugins/devflow/skills/todo/SKILL.md:<n>`.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/planning-audit.cjs
- FOUND: plugins/devflow/devflow/bin/lib/planning-audit.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/{plan,execute,verify,bootstrap,work,misc}.json
- FOUND: commits 1ec6f7dd, 33223437, 48978fa6, 27445d68 on df/exec-48-04
