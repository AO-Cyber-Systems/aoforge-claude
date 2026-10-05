---
objective: 48-planning-write-path-migration
trd: "19"
subsystem: planning-prose
tags: [gwp-02, prose-migration, bootstrap, milestones, objective-add-remove, tdd, ratchet]

requires:
  - objective: 48-04
    provides: "planning-audit scanner + planning-writes.repo.test.cjs ratchet; bootstrap.json baseline (42)"
  - objective: 48-15
    provides: "exact CLI verb lines: doc put, planning draft|mode, objective add|put|remove|set-status, milestone put|complete, gh pull"
provides:
  - "bootstrap audit group at zero findings; bootstrap.json holds only _comment"
  - "verb-based prose for new-project, new-milestone, complete-milestone, audit-milestone, adopt, add/remove-objective, roadmapper, project-researcher, research-synthesizer, milestone templates"
affects: [48-23]

tech-stack:
  added: []
  patterns:
    - "draft -> publish: `planning draft <rel>` prints the path, the agent writes there, `doc put <rel> --from \"$DRAFT\"` publishes (local: same file, same bytes)"
    - "planning mode guard for generated views (ROADMAP.md, STATE.md): local = edit as today next to the guard; store = objective add/put then `gh pull --all`"

key-files:
  created:
    - .planning/objectives/48-planning-write-path-migration/48-19-SUMMARY.md
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/bootstrap.json
    - plugins/devflow/devflow/workflows/new-project.md
    - plugins/devflow/agents/roadmapper.md
    - plugins/devflow/agents/project-researcher.md
    - plugins/devflow/agents/research-synthesizer.md
    - plugins/devflow/devflow/workflows/new-milestone.md
    - plugins/devflow/devflow/workflows/complete-milestone.md
    - plugins/devflow/devflow/workflows/audit-milestone.md
    - plugins/devflow/devflow/templates/milestone.md
    - plugins/devflow/devflow/templates/milestone-archive.md
    - plugins/devflow/devflow/workflows/adopt.md
    - plugins/devflow/devflow/workflows/add-objective.md
    - plugins/devflow/devflow/workflows/remove-objective.md
    - plugins/devflow/skills/objective/SKILL.md

key-decisions:
  - "STATE.md edits in milestone/add-objective flows use the `planning mode` guard, not `state patch`: `state patch`/`state update` do not match the plain `Objective:` / `Last activity:` lines (probe: all fields `failed`), and STATE.md is a generated view in store mode"
  - "complete-milestone order differs by mode: local `milestone complete` (builds archives + base entry) then `milestone put` (replaces the entry: same `## vX.Y` heading); store `doc put milestones/vX.Y-<KIND>.md` per archive, `milestone put`, then `milestone complete` (closes the native milestone, publishes archives)"
  - "audit-milestone store mode publishes to `milestones/v{version}-MILESTONE-AUDIT.md`: `doc put` refuses the root-level `v1.0-MILESTONE-AUDIT.md` as a runtime file"
  - "The milestone entry draft path is `planning draft milestones/vX.Y.md` (the store-mode wiki page rel of `milestone put`)"
  - "Templates with zero findings (project, requirements, roadmap, state, state_archive, research-project/*) are unchanged: their only `.planning/` mentions are `Template for ...` descriptions, not write instructions"

requirements-completed: [GWP-02]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 2
  tdd_evidence: true
  test_pairing: true

duration: 40min
completed: 2026-10-01
tokens_input: 5278912
tokens_output: 68191
tokens_cache_read: 5134748
tokens_cache_write: 144072
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 48 TRD 19: Prose migration — project bootstrap, milestones, objective add/remove Summary

**Project bootstrap, milestone lifecycle and objective add/remove prose now publish through df-tools verbs: PROJECT.md, REQUIREMENTS.md and all project research (including the synthesizer's `research/SUMMARY.md`) go draft -> `doc put`; ROADMAP.md/STATE.md sit behind a `planning mode` guard (local unchanged, store = `objective add`/`objective put` + `gh pull --all`); complete-milestone uses `milestone put` + `milestone complete` with the D-05 native-milestone note; remove-objective names the store-mode `objective set-status <id> cancelled` path. The `bootstrap` audit group went from 42 findings to 0.**

## Counts

| | Findings | Files |
|---|---|---|
| Before (48-04 baseline) | 42 | 10 |
| After | 0 | 0 (`bootstrap.json` = `_comment` only) |

Per file before: new-project 14, new-milestone 7, complete-milestone 5, roadmapper 5, milestone-archive 4, research-synthesizer 3, project-researcher 1, milestone 1, add-objective 1, remove-objective 1. No inline allow markers were needed: every line was rewritten to a verb or rephrased so it no longer reads as a write.

## Task Commits

| Task | Commit | Message |
|---|---|---|
| RED | 50ea5992 | test(48-19): bootstrap group must have zero planning writes |
| 1 | a889d6bc | docs(48-19): project bootstrap publishes through verbs |
| 2 | acb7dd33 | docs(48-19): milestone flows use milestone verbs |
| 3 | 7973ad5f | docs(48-19): bootstrap group uses planning verbs |
| fix | 28701c49 | docs(48-19): new-project PROJECT.md step names no .planning path beside Write |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| RED | `node --test lib/planning-writes.repo.test.cjs` | 1 (gate lists all 42 bootstrap findings) | FAIL (correct) |
| 1 | `node --test lib/planning-writes.repo.test.cjs \| grep new-project\|roadmapper\|project-researcher\|research-synthesizer` | — | PASS: only `new-milestone.md:6` matched, because its text contains the word "new-project" (cleared in Task 2) |
| 2 | same test, grep `milestone` | — | PASS: only add-objective/remove-objective left |
| 3 | `node --test lib/planning-writes.repo.test.cjs lib/doc-refs.repo.test.cjs` | 0 (28/28) | PASS |
| verify | `rg -n "cat >.*\.planning\|Write.*\.planning/(PROJECT\|REQUIREMENTS\|research)" workflows/new-project.md` | 1 (no match, after 28701c49) | PASS |
| verify | no df-tools verb line with `2>/dev/null` in the edited files | — | PASS (none) |
| verify | `rg -n "milestone (put\|complete)" workflows/complete-milestone.md` | 0 | PASS (both present) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test planning-writes.repo.test.cjs` (empty `bootstrap.json`) | 1 | FAIL (correct) |
| GREEN | `node --test planning-writes.repo.test.cjs doc-refs.repo.test.cjs` | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test lib/planning-writes.repo.test.cjs` | 0 | PASS |
| regression | `node --test lib/doc-refs.repo.test.cjs` + adopt-*.test.cjs (in `npm test`) | 0 | PASS |
| full suite | `npm test` | 0 | 7458 tests, 7425 pass, 0 fail, 33 skipped (MA-7 did not flake this run) |

## Local-mode invariant (github.store off)

Probed on scratch projects (session scratchpad, never the real `.planning/` or `~/.claude`):
- `planning mode` -> `local`; `planning draft <rel>` prints a draft path for PROJECT.md, research/*, milestones/vX.Y.md.
- `doc put` writes `.planning/PROJECT.md`, `REQUIREMENTS.md`, `research/STACK.md`, `research/SUMMARY.md`, `milestones/v1.0-{ROADMAP,REQUIREMENTS,MILESTONE-AUDIT}.md` with the input bytes, and works before `config.json` exists (adopt's state before `scaffold`).
- `doc put` refuses ROADMAP.md, STATE.md, MILESTONES.md (generated views) and root `v1.0-MILESTONE-AUDIT.md` (runtime file) — so the prose never sends those through `doc put`.
- `milestone put v1.0` creates/splices the `## v1.0` entry; its heading regex matches the `## v1.0 Name (Shipped: ...)` entry local `milestone complete` writes, so put-after-complete replaces rather than duplicates.

Every instruction keeps the local path: local edits of ROADMAP.md/STATE.md stay "as today" next to the guard, and every verb writes the same local file.

## Deviations from Plan

1. **[Rule 1 - Bug] audit-milestone wrote `.planning/v{version}-v{version}-MILESTONE-AUDIT.md`** (doubled prefix). Its own report lines and `cmdMilestoneComplete` both use `v{version}-MILESTONE-AUDIT.md`; fixed. The local path stays where `milestone complete` picks it up; store mode publishes to `milestones/` because `doc put` refuses the root path. Commit 7973ad5f.
2. **[Rule 1 - Bug] My first Task 2 audit wording sent a root-level audit through `doc put`**, which the verb refuses. Caught by a probe in Task 3 and corrected (audit-milestone guard, and complete-milestone no longer re-publishes the audit). Commit 7973ad5f.
3. **[Interpretation] STATE.md uses the `planning mode` guard, not `state patch`.** The recipe names verbs, but `state patch`/`state update` cannot match STATE.md's plain `Field:` lines, so local edits stay as today next to the guard.
4. **[Scope] Zero-finding files in files_modified left unchanged:** `skills/new-project/SKILL.md`, `skills/milestone/SKILL.md`, `skills/adopt/SKILL.md` and all templates except milestone/milestone-archive. They hold descriptions only (`Template for .planning/X`, output lists), not write instructions. adopt.md (0 findings, but a hand write of PROJECT.md the scanner could not see) was migrated to `--cwd "$TARGET" doc put PROJECT.md`.
5. **[Process] Extra commit 28701c49** so the TRD's verification grep finds nothing in new-project.md.
6. **[Process] Preflight:** the first `exec-context check` ran from the main checkout (session cwd), which 48-22 had claimed, and reported SHARED INDEX. Re-run from the dispatched worktree with `--cwd`, as the dispatch instructed; it passed. I did not release 48-22's claim.

## Notes for later TRDs

- **48-23:** adopt.md uses `df-tools.cjs --cwd "$TARGET" doc put`. `VERB_CALL_RE` does not allow `--cwd X` between `df-tools` and the verb, so a widened scanner should accept that form.
- **`state patch` vs plain STATE.md fields:** the `state` verbs cannot set `Objective:` / `Status:` / `Last activity:` in the template's plain form. If store mode should ever take hand edits of STATE.md position fields, that needs a verb.

## Post-TRD Verification

- Auto-fix cycles used: 2 (roadmapper guard window; complete-milestone "writes" wording)
- Must-haves verified: 5/5 (group zero; bootstrap publishes via doc put / objective add/put / guard; milestone put + complete + D-05 archives; add/remove-objective verbs + D-19 line; no stderr redirects on verb lines)
- Gate failures: none

## Self-Check: PASSED

- FOUND: bootstrap.json (`_comment` only), all 13 edited prose files
- FOUND: commits 50ea5992, a889d6bc, acb7dd33, 7973ad5f, 28701c49 (returned by df-tools commit)
- STATE.md / ROADMAP.md deliberately not edited: the orchestrator updates them after the merge
