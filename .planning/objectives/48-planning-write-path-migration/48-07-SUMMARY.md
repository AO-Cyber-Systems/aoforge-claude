---
objective: 48-planning-write-path-migration
trd: "07"
subsystem: github-sync
tags: [gh-cache, pull, entities, todo, debug, quick, decision, milestones, planning-paths, node-test, tdd]

requires:
  - objective: 48-planning-write-path-migration
    provides: "48-01 planning-paths classify/listByClass; 48-02 decodeEntityBody/ENTITY_ROLES; 48-05 gh-milestone-store.listMilestones"
provides:
  - "gh-cache.materialize: todo/debug/quick entity issues placed by header path (classify + role + id check, issue state picks pending|completed / debug|resolved), quick summary comment, decisions/<id>.md (question + ## Answer); new `notes` return key"
  - "gh-cache.renderMilestones(milestones): generated MILESTONES.md from closed native milestones, newest first; null when none closed"
  - "gh-cache.GENERATED_FILES includes MILESTONES.md (hand_maintained rule applies)"
  - "gh-cache.readRemoteModel: todos/debugs/quicks (labels overridable), decision ids + comments, quick comments, milestones + milestones_report, problems.undecodable_entities"
  - "gh-cache.pullAll: writes MILESTONES.md when rendered, merges materialize notes, attention for undecodable entities and a failed milestone list; result key `milestones`"
  - "gh-cache.listOwnedLocal (now exported): planning-paths cache class minus wiki/**"
affects: [48-09, 48-10, 48-12, 48-22]

tech-stack:
  added: []
  patterns:
    - "A header path from GitHub is trusted only when planning-paths classifies it as that entity's own file (role + id + quick part)"
    - "Issue state is authoritative for todo/debug location; a move is reported in notes, never silent"
    - "A secondary read (milestones) that fails is reported in a *_report and never fails the pull (pages_report precedent)"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/gh-cache.cjs
    - plugins/devflow/devflow/bin/lib/gh-cache.test.cjs

key-decisions:
  - "Entity comment markers (`<!-- devflow:id=quick-12 kind=summary -->`) are read by a local entity-grammar fallback because gh-body's marker grammar refuses entity ids at this base; gh-body's own decodeFileComment is used whenever it knows the id"
  - "Decision id comes from the FIRST body line marker and must be the `<trd>-d<k>` form; an id-less decision issue is rejected (attention), a duplicate id collides via put"
  - "Decision answer: decodeFileComment(..., 'answer') when it carries a file line, else the joined marker body; text = question.trimEnd() + `\\n\\n## Answer\\n\\n` + answer.trimEnd() + `\\n`; no answer = question verbatim (leading blank lines after the marker dropped)"
  - "Todo and debug comments are not read (the whole file is the body); quick and decision comments are"
  - "MILESTONES.md heading `## <title> (Shipped: <YYYY-MM-DD>)`, sorted closed_at desc then number desc; a missing closed_at renders `unknown` and sorts last"
  - "listOwnedLocal drops the 47 OWNED_OBJECTIVE_FILE_RE / markdownIn / subdirsOf helpers; planning-paths' objective rules already subsume that regex"

requirements-completed: [GWP-01, GWP-04]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 12min
completed: 2026-10-01
---

# Objective 48 TRD 07: Cache materialisation for todo, debug, quick, decision issues and MILESTONES.md Summary

**`gh pull --all` now rebuilds todos, debug sessions, quick tasks (JOB and SUMMARY), decisions (question plus `## Answer`) and a generated MILESTONES.md from GitHub. Each entity's header path has to classify, under planning-paths, as that entity's own file before it is written. The owned-file list now covers every cache-class path except `wiki/**`.**

## What was built

**Task 1, pure layer.** `materialize(model)` gained three sections after the VERIFICATION loop:

- **Entity issues.** `model.todos`, `model.debugs` and `model.quicks` are decoded with `decodeEntityBody`. A file is accepted only when `classify(file)` is `cache` with `entity.role` equal to the list's role and `entity.id` equal to the decoded id (for quick, `part === 'job'`). For todo and debug, the issue state decides placement. A closed todo moves from `pending/` to `completed/`, while one already in legacy `done/` stays put. An open todo moves from `completed/` or `done/` to `pending/`. Debug moves between `debug/` and `debug/resolved/` the same way. Every move is reported in `notes`. Quick placement never moves.
- **Quick summary.** The `summary` comment's bare file name is placed in the JOB's directory and must classify as that quick task's `summary` part. A mismatch is rejected as `quick-summary`.
- **Decisions.** The output is `decisions/<id>.md`, keyed by source `<id>`.

`renderMilestones` and the `MILESTONES.md` entry in `GENERATED_FILES` were also added. Every return key `materialize` had before is unchanged, and `notes` is new.

**Task 2, remote/pull.** `DEFAULT_LABELS` now includes `todo`, `debug` and `quick` from `ENTITY_ROLES`, and config overrides apply to them. `readRemoteModel` lists all three labels. It reads comments for quick and decision issues, puts undecodable entities in `problems.undecodable_entities`, and lists milestones through `gh-milestone-store.listMilestones`. If that list fails, the failure goes into `milestones_report` and the pull continues. `pullAll` adds MILESTONES.md when it renders, merges `mat.notes`, and raises attention for undecodable entities or a failed milestone list. `listOwnedLocal` is now the classifier walk.

## Task Commits

1. **Task 1** (tests 1-8): `aec2a13` (test, characterization), `7c6eb72` (test, RED), `ca655bd` (feat, GREEN)
2. **Task 2** (tests 9-13): `729cc03` (test, RED), `bcb1e46` (feat, GREEN)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Materialise entities, decisions, MILESTONES.md | `node --test plugins/devflow/devflow/bin/lib/gh-cache.test.cjs` | 0 | PASS (68/68) |
| 2: Remote model, pull, owned list | `node --test .../gh-cache.test.cjs .../gh-store-e2e.test.cjs .../gh-pull.test.cjs .../gh-seam.repo.test.cjs` | 0 | PASS (133/133) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-cache.test.cjs` | 0 | PASS (78/78) |
| regression | `node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'` | 0 | PASS (1193/1193) |
| seam guard | `node --test plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs` | 0 | PASS: gh-cache never calls `ghWrite(` |
| full suite | `npm test` | 1 | 7168 pass / 1 fail / 32 skipped. The failure is MA-7 in handoff-e2e.test.cjs, which is known to be flaky. |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Characterization | `node --test --test-name-pattern=48-07 .../gh-cache.test.cjs` | 0 | PASS (pins today's values) |
| RED (T1) | same | 1 | FAIL (correct): 12 failing, no entity/decision layout and no renderMilestones |
| GREEN (T1) | `node --test .../gh-cache.test.cjs` | 0 | PASS 68/68 |
| RED (T2) | `node --test --test-name-pattern=48-07 .../gh-cache.test.cjs` | 1 | FAIL (correct): 9 failing |
| GREEN (T2) | `node --test .../gh-cache.test.cjs` + e2e/pull/seam | 0 | PASS 133/133 |

One RED test passed before GREEN by construction. Test 10b ("no closed milestone means no MILESTONES.md") passed because nothing wrote MILESTONES.md before this TRD. It now guards the null-render path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] gh-body's marker grammar refuses entity ids**
- **Found during:** Task 1.
- **Issue:** `ghComments.decodeFileComment(comments, 'quick-12', 'summary')` goes through gh-body `findCommentsByMarker`, whose `ID_RE`/`MARKER_SOURCE` accept only objective, TRD and decision ids, so it returns `invalid devflow id`. gh-body is not in this TRD's files, and 48-06 is running in parallel against the flusher.
- **Fix:** `fileCommentOf(comments, id, kind)` in gh-cache uses `decodeFileComment` whenever `ghBody.markerLine(id)` accepts the id. Otherwise it reads the same `<!-- devflow:id=<id> kind=<kind> -->` first line through the 48-02 entity grammar, with the same `joinParts` and `devflow:file` parse and the same result shape. If gh-body later learns entity ids, the first branch takes over with no change in output.
- **Commit:** `ca655bd`

**2. [Explicit additions] Two existing 47 test expectations name the new files (the TRD's "assert additions explicitly" rule)**
- **Found during:** Task 1 and Task 2 GREEN.
- **Issue:** The must-have says "every existing gh-cache test passes unchanged", but the 47 fixture contains things this TRD now materialises or owns:
  - `seedIssues` seeds the Decision issue `7-01-d1` with no answer. Under this TRD's test 7 it now becomes `decisions/7-01-d1.md` = `Use REST.\n`.
  - writeCache test 12 writes `objectives/<dir>/07-UAT.md`, which is cache-class under planning-paths (test 13 requires it to be owned), so it is now an orphan.
- **Fix:** One `TREE` entry for the decision file, which tests 5, 6, 7 and 8, pull 6, and "cache index records" all share, plus one entry in writeCache test 12's expected orphans. Both are commented `48-07 addition`. Nothing else in the 47 tests changed. The 47 e2e (`gh-store-e2e.test.cjs`) and `gh-pull.test.cjs` pass unmodified: neither fixture has a closed milestone or a decision that changes their pinned sets.
- **Files modified:** `gh-cache.test.cjs`
- **Commits:** `ca655bd`, `bcb1e46`

---

**Total deviations:** 2 (1 blocking, 1 explicit-additions). **Impact:** additive only. Every pre-48 return key and behaviour of `materialize`, `writeCache` and `pullAll` is unchanged for a model without entities, decisions or closed milestones, and both characterization pins still pass.

## Notes for later TRDs

- **48-06 / gh-body:** if the flusher posts entity comments through `bodyLib.commentMarker(ref.id, kind)`, gh-body's `ID_RE` and `MARKER_SOURCE` must accept `todo-*`, `debug-*` and `quick-N`, because today `commentMarker('quick-12', 'summary')` throws. Either way, gh-cache's reader matches the identical marker line.
- **Bases for entities and decisions:** `refreshBases` still records bases only for objectives and TRDs, as the TRD scoped it. If 48-06's remote-edit check needs bases for entity or decision issues after a fresh-clone pull, add them in `refreshBases`. `mat.sources` already carries the keys (`todo-*`, `quick-12#summary`, `7-01-d1`).
- **48-09 (W055) / 48-10:** `listOwnedLocal` now includes `decisions/**`, so the local decision-queue files (`decisions/pending/DECISION-NNN.md`) are owned too. They show up as orphans of a pull until decisions move to issues. Under the classifier this is correct, but expect it on this repo.
- **Cost:** `readRemoteModel` (also used by `gh.cjs` `pushRoadmapPage`) now makes three more label lists, one comment read per decision or quick issue, and one milestone list. All are reads.
- `planning-paths.cjs` comments and test 6h's name still mention the removed `gh-cache OWNED_OBJECTIVE_FILE_RE` as a historical shape reference, which does no harm.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7. That covers the entity, decision-comment and milestone reads; the placement and role check; the decision answer; the generated, hand-maintained-safe MILESTONES.md; and `listOwnedLocal` through the classifier. The seventh must-have, existing tests passing, needed two explicit `48-07 addition` expectations (Deviation 2). The 47 e2e itself is unchanged.
- Gate failures: None. The full suite's single failure is the known-flaky MA-7.
- Invariant: with `github.store` off, nothing here runs outside `gh pull --all` / `readRemoteModel`. No verb, the edit gate and `.planning/` tracking are all untouched.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/gh-cache.cjs
- FOUND: plugins/devflow/devflow/bin/lib/gh-cache.test.cjs
- FOUND commits: aec2a13, 7c6eb72, ca655bd, 729cc03, bcb1e46
