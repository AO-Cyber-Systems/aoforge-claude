---
objective: 47-github-authoritative-store
trd: "09"
subsystem: github-sync
tags: [hierarchy, sub-issues, blocked-by, decisions, orphans, outbox, budget-gate, tdd]

requires:
  - objective: 47-github-authoritative-store
    provides: "47-01 gh-trd codec, 47-02 fake GitHub + store fixtures, 47-03 gh-outbox, 47-05 gh-body/gh-mapping extensions, 47-06 gh-capability, 47-07 gh-outbox-flush, 47-08 gh-comments"
provides:
  - "lib/gh-hierarchy.cjs: padId, readObjectiveTrds, waveEdges, planPush, buildOps, pushHierarchy, openDecision, reportOrphans, REFERENCE_PAGES"
affects: [47-10, 47-11, 47-12, 47-13]

tech-stack:
  added: []
  patterns:
    - "pure planning first (files only), one outbox.enqueue second, flush last: the budget gate runs before any op is queued"
    - "no gh write in the module: every write is an outbox op the flusher applies; reads limited to capability detection and the orphan report"
    - "pure helpers take an optional {warnings} sink so their return value stays a plain array"
    - "the objective body has ONE writer: caller sections are filtered to summary/criteria/footer, wiki/trds/meta are derived by the flusher"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs
    - plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs
  modified: []

key-decisions:
  - "planPush refuses the WHOLE objective on any over-budget TRD, a TRD count above 100, or a depends_on cycle, naming every offender, before capability detection and before the first enqueue (zero journal ops, zero gh calls)"
  - "caller objectiveSections are filtered to {summary, criteria, footer}; a `trds`, `wiki` or `meta` entry from 46's builder is dropped because derive.* is authoritative (one body writer, Pitfall 10)"
  - "a provisional (offline) capability answer is never used to flush: the ops are queued and flush() is called without modes so the flusher re-detects, and the queue stays pending until GitHub answers"
  - "a Decision is not linked as a sub-issue; it only blocks its TRD (as planned). reportOrphans therefore considers TRD-labelled issues only"
  - "reportOrphans reads linkage from sub_issues, and from the objective's `trds` task-list `#N` references when the sub-issues endpoints answer 404 (tasklist hierarchy)"

patterns-established:
  - "display ids (`07-03`, `07-03-d1`) are derived by padId from the canonical id; the canonical id (`7-03`) is the only key in targets, mapping and results"

requirements-completed: [GST-01, GST-02, GST-03, GST-04, GST-06, GST-08]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 2 sessions (resumed once)
completed: 2026-10-01
---

# Objective 47 TRD 09: Hierarchy push - objective to TRD sub-issues to blocked-by, decisions, pages Summary

**`lib/gh-hierarchy.cjs` turns one local objective into an ordered outbox batch (objective type and fields, TRD issues, sub-issue links, wave-ordered blocked-by edges, SUMMARY and VERIFICATION comments, reference pages, one objective `patch-body`) behind a pre-queue budget gate, with `openDecision` and a read-only `reportOrphans`.**

## Accomplishments

- **Planning (pure).** `readObjectiveTrds` discovers `<NN>-<MM>-<slug>-TRD.md` files (text never trimmed, so the fixture TRD without a trailing newline round-trips), `waveEdges` builds D-16 edges (declared `depends_on`, else every TRD of the nearest lower wave; slug forms normalised; unknown or cross-objective deps warn; cycles throw `code:'CYCLE'`), `planPush` runs `checkObjectiveBudgets` over all TRDs at once and resolves work, kind, milestone, labels, SUMMARY and VERIFICATION files.
- **Op order.** `buildOps` emits `patch-issue` (Objective), `set-fields`, `upsert-issue` per TRD by id, `link-sub-issue` per TRD, `block` per edge, SUMMARY comments, the VERIFICATION comment, one `wiki-push`, and ONE managed `patch-body` with `preserve_ticks:true` and `derive:{wiki, trds, meta}`. Every op passes `outbox.validateOp`.
- **pushHierarchy.** Checks in order: github enabled, objective in the mapping, budget/cycle gate, capability detection (read-only token refused), then one `outbox.enqueue`; `flush:true` drains with the detected modes and caps.
- **Verified end to end on the fake.** Org with a wiki: sub-issues in id order, `7-03` blocked by `7-01`, TRD bodies decode to their files, types and fields set, the objective `wiki` section pins the pushed wiki revision, the wiki holds `Objective-7-store-demo`. User-owned without a wiki: labels plus a `meta` section, native sub-issues and dependencies, pages under `docs/devflow/`, no wiki clone. Re-push of an unchanged objective: zero gh writes. A tick made on GitHub survives; an edited criterion text halts with `remote-edit`.
- **openDecision / reportOrphans.** A Decision issue `<trd>-d<k>` (k counts across mapping and queue) blocks its TRD; orphans are reported, never deleted.

## API contract for 47-11 / 47-12

| Function | Contract |
|---|---|
| `pushHierarchy(root, objectiveArg, {objectiveSections, flush, flushOptions, now})` | -> `{ok:true, objective, enqueued:[seq], coalesced:[seq], ops, degraded:[...], modes, warnings:[string], flush?}` · `{ok:true, skipped:true, reason}` (github disabled) · `{ok:false, refused:'budget', over:[{id,chars}], invalid, message}` · `{ok:false, refused:'cycle', error}` · `{ok:false, refused:'readonly', error}` · `{ok:false, error}` (unknown objective; `objective 7 has no issue yet; run df-tools gh sync 7`; capability detection failed). `ok` is false for a requested flush that ends in `status:'error'`; `halted` and `pending` are not failures. `flush` is the 47-07 result (`status`, `done`, `pending`, `halted`, `warnings:[{seq,kind,message}]`). `objectiveSections` is 46's `buildObjectiveSections` output; only `summary`, `criteria`, `footer` are used. 47-12 passes it so the objective body has one writer. Nothing is queued on any `ok:false`. `flushOptions` is merged into the flush options (`wait`, `sleep`, `maxOps`, `wikiRemote`); `modes`/`caps` are supplied by the push unless detection was provisional |
| `planPush(root, objectiveArg)` | local files only (no gh, no outbox): `{ok:true, objective:{id,dir}, trds:[{id,file,text,wave,depends_on}], edges:[{blocker,blocked}], warn:[{id,chars}], warnings, summaries:[{trdId,file,text}], verification:{file,text}\|null, pages, work, kind, milestone_title, labels:{trd,decision}}` or the refusals above |
| `buildOps(plan, {objectiveSections, milestoneTitle, work, kind})` | the ordered op array; `milestoneTitle`/`work`/`kind` override the plan |
| `readObjectiveTrds(root, objectiveArg, {warnings})` / `waveEdges(trds, {warnings})` | arrays; `warnings` is an optional sink array; unknown objective and cycles throw |
| `REFERENCE_PAGES(root, dir)` | `.planning/`-relative paths of existing, wiki-mappable cache files (PROJECT, REQUIREMENTS, `codebase/*.md`, OBJECTIVE, `*CONTEXT`, `*RESEARCH`). The `Roadmap` page is NOT included: 47-10/47-12 render it from issues after the flush |
| `openDecision(root, trdId, {question, now})` | `{ok:true, id:'7-03-d1', trd, enqueued:[seq,seq], coalesced}` or `{ok:true, skipped:true}` or `{ok:false, error}` (bad TRD id, empty question, TRD with no issue and none queued). Queues `upsert-issue {role:'decision'}` (title `[Decision 07-03-d1] <first line of question>`, body = id marker + question, type `Decision` or the label fallback) then `block {blocked: trd, blocker: decision}`. Not linked as a sub-issue |
| `reportOrphans(root, objectiveArg)` | `{ok:true, objective, unlinked:[{id,number}], missing_local:[{id,number}]}` (read-only); `{ok:true, skipped:true, ...}` when disabled; `{ok:false, error}` |
| `padId(id)` | `7-01` -> `07-01` (display form only) |

## Deviations from Plan

None - TRD executed as written. No file outside `files_modified` was touched.

### Interpretations and additions (not defects)

- **Warning sinks.** Test 2 requires `waveEdges(trds)` to return the bare edge array, so warnings go to an optional `{warnings}` sink on `waveEdges` and `readObjectiveTrds` instead of the return value.
- **`planPush` extras.** Returns `warn` (the 40,000-60,000 budget entries) beside the string `warnings`, and `refused:'cycle'` for a dependency cycle (not in the TRD's error list, but a cycle must also refuse before anything is queued).
- **Caller sections filtered.** `objectiveSections` entries other than `summary`, `criteria`, `footer` are dropped; otherwise 46's `trds` section would override the derived native count line (the flusher merges `{...derived, ...payload.sections}`).
- **Provisional capabilities.** When detection was offline-provisional, the push still queues and then flushes without passing modes, so the flusher re-detects and stays `pending` (reason `offline`) rather than writing with guessed modes or field ids.
- **Title and ids.** TRD titles are `[TRD 07-01] alpha` (padded id from `padId`, slug from the file name); cosmetic only, the `devflow:id` and `devflow:file` lines are authoritative.
- **Extra tests** beyond the 14 listed: 1b/1c (discovery edge cases), 3b-3d (TRD count limit, cycle refusal, plan contents, reference pages), 4b/4c (shrunk plan, VERIFICATION order), 5b (disabled / no issue yet), 5c (offline push then online flush), 12b-12d (decision validation, disabled, labels fallback), 13b/13c (clean objective, task-list linkage). 28 tests in total.
- **SUMMARY filename** `47-09-SUMMARY.md` per the dispatch (the TRD `<output>` names `47-09-gh-hierarchy-SUMMARY.md`).

### Known limits

- A Decision is not attached under its TRD as a sub-issue; only the blocked-by edge is created (as the TRD specifies). The `decision open|answer` verbs belong to objective 48.
- If several SUMMARY files match one TRD, or several VERIFICATION files exist, the first by name is pushed and a warning names the rest.
- A TRD file name with a letter suffix (`10-04a`) is skipped with a warning: gh-mapping's TRD id form is strict.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: pure planning (tests 1-4) | `node --test plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs` | 0 (11 pass, no gh calls) | PASS |
| 2: pushHierarchy on the fake (tests 5-11, 14) | `node --test plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs` | 0 (21 pass) | PASS |
| 3: decisions and orphans (tests 12-13) | `node --test plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs && ! rg -n "ghWrite" plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs` | 0 (28 pass); rg exit 1 (no match) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED 1 (abe506e) | `node --test gh-hierarchy.test.cjs` | 1 (module missing) | FAIL (correct) |
| GREEN 1 (db7f77f) | same | 0, 11 pass | PASS (correct) |
| RED 2 (4a2e7ba) | same | 1, 10 fail (`pushHierarchy is not a function`), 11 pass | FAIL (correct) |
| GREEN 2 (a41ddf8) | same | 0, 21 pass | PASS (correct) |
| RED 3 (9a04ea5) | same | 1, 7 fail (`openDecision` / `reportOrphans` not functions), 21 pass | FAIL (correct) |
| GREEN 3 (62ce51b) | same | 0, 28 pass | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs` | 0 (28 pass) | PASS |
| regression | `node --test gh-outbox-flush.test.cjs gh-comments.test.cjs gh-capability.test.cjs gh-hierarchy.test.cjs` | 0 (258 pass, 0 fail) | PASS |
| no direct writes | `rg -n "ghWrite\|spawnSync\|child_process" gh-hierarchy.cjs` | 1 (no match) | PASS |
| full suite | `npm test` | 1 | 6805 tests, 6772 pass, 1 fail, 32 skipped; the one failure is the known pre-existing `handoff-e2e.test.cjs` MA-7 (doctl auth), not caused by this TRD |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 (pure planning and budget gate: 1-4; SC2 zero ops/writes/calls: 5; SC1 push half: 6, 7; ticks and halt: 8; idempotent re-push: 9; SC5 push half: 10; frozen TRD: 11; Decision blocks TRD: 12; orphans, nothing deleted: 13; read-only refusal: 14)
- Gate failures: None (MA-7 pre-existing)

## Self-Check: PASSED

- Files exist: `plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs`, `plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs`
- Commits exist on `df/exec-47-09`: abe506e, db7f77f, 4a2e7ba, a41ddf8, 9a04ea5, 62ce51b
