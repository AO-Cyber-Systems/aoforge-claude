---
objective: 47-github-authoritative-store
trd: "09"
type: tdd
wave: 3
depends_on: ["47-01", "47-02", "47-03", "47-05", "47-06", "47-07", "47-08"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs
  - plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs
autonomous: true
requirements: [GST-01, GST-02, GST-03, GST-04, GST-06, GST-08]
must_haves:
  truths:
    - "`planPush` is pure: it reads an objective's TRD files, validates every TRD against the 60K budget (and the 100-TRD limit) BEFORE anything is enqueued, and refuses the whole objective listing every offender — zero journal entries and zero gh writes (SC2)"
    - "Wave edges come from `depends_on`; a TRD in wave N>1 with empty `depends_on` is blocked by every TRD of the nearest lower wave; unknown deps and cycles are errors"
    - "`pushHierarchy` enqueues, in order: objective type, objective fields, TRD issue upserts (sorted by id), sub-issue links, blocked-by edges, SUMMARY comments, the VERIFICATION comment, the wiki-push of reference pages, and ONE objective `patch-body` (criteria with preserved ticks + derived wiki/trds/meta sections)"
    - "After a flush on the fake, the objective issue has the 3 fixture TRDs as native sub-issues in id order, `07-03` is blocked by `07-01`, each TRD body is the 47-01 encoding of its file, and the objective body links the wiki page at the pushed revision (SC1 push half)"
    - "On a user-owned repo without a wiki the same push yields labels + a `meta` section, native sub-issues/dependencies, and pages under `docs/devflow/` (SC5 push half)"
    - "Re-pushing an unchanged objective performs zero gh writes"
    - "`openDecision(root, trdId, {question})` enqueues a Decision issue (`<trd>-d<k>`, type Decision or label) that blocks its TRD"
    - "`reportOrphans` lists TRD issues not linked to their objective and linked TRDs with no local file; nothing is deleted"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs
      provides: "readObjectiveTrds, waveEdges, planPush, buildOps, pushHierarchy, openDecision, reportOrphans, REFERENCE_PAGES"
  key_links:
    - "47-12 `gh sync <objective>` calls pushHierarchy with the 46 objective sections so the objective body has ONE writer; 47-13 e2e drives SC1/SC2/SC5 through it"
---

# TRD 47-09: Hierarchy push — objective → TRD sub-issues → blocked-by, decisions, pages (GST-01, GST-02)

<objective>
Create `lib/gh-hierarchy.cjs`: turn one local objective (OBJECTIVE.md + TRD files + SUMMARY/VERIFICATION + reference docs) into
an ordered list of outbox ops that, when flushed, builds the GitHub hierarchy: Objective issue (type/fields or labels/meta) → TRD
sub-issues → blocked-by edges from wave order → Decision issues blocking their TRD, with SUMMARY/VERIFICATION comments, wiki
pages and the objective body's managed sections. The budget check runs before anything is enqueued.

Purpose: GST-01, GST-02, and the push half of SC1, SC2, SC5. Output: module + tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit before GREEN. Commit via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- No `ghWrite` here: every write is an outbox op. Reads only via gh-client; capability via gh-capability.
- Tests: `makeStoreProject()` (3 TRDs, 2 waves), `hermeticEnv()`, fake via `_setRunGh`, wiki via `createWikiRemote()` + `DEVFLOW_WIKI_REMOTE`;
  seed the objective issue (`<!-- devflow:id=7 -->`, label `devflow:objective`) and `mapping.objectives['7']` because objective-issue
  creation stays in 46's `findOrCreateObjectiveIssue` (wired in 47-12). Flush with `gh-outbox-flush.flush(root, {modes})` or with real
  capability detection where the test is about detection.
- No property-based tests, no generated data, never port 8080.
- Research reference: `47-RESEARCH.md` → Pattern 2, Pitfalls 3, 4, 7, 10.

## Decisions taken in planning

- **D-16 Wave edges.** Edge `blocker → blocked` for each `depends_on` id (accepts `07-01` or `07-01-alpha`; normalised with `toTrdId`).
  If `depends_on` is empty and `wave > 1`: blocked by every TRD of the highest wave below it. A dependency on a TRD outside the objective is
  ignored with a warning (cross-objective edges are out of scope for 47).
- **One objective-body writer.** `pushHierarchy(root, obj, {objectiveSections})` takes the 46 sections (summary/criteria/footer, built by
  `gh.cjs` `buildObjectiveSections`) from its caller and emits the single `patch-body` op with `preserve_ticks:true` and
  `derive:{wiki:{dir}, trds:true, meta:{type:'Objective', work, kind}}` (the flusher adds `meta` only in degraded mode). Without
  `objectiveSections` it still derives wiki/trds/meta and leaves the other sections alone.
- **Reference pages (`REFERENCE_PAGES`).** Each push enqueues one `wiki-push` naming the cache files that exist: `PROJECT.md`, `REQUIREMENTS.md`,
  `codebase/*.md`, and the objective's `OBJECTIVE.md`, `CONTEXT.md`, `*-RESEARCH.md`. Unchanged pages are no-ops in the store. The `Roadmap`
  page is rendered from issues after the flush (47-10 renderer, 47-12 call site).
- **TRD issue title** `[TRD 07-01] alpha` (slug from the file name); cosmetic only — the `devflow:file` line is authoritative (D-01).
- **Objective type/fields ops** are always enqueued; the flusher applies them natively or skips them per modes (labels/meta), so a push queued
  offline is mode-independent.
- **SUMMARY/VERIFICATION** files present locally are enqueued through `gh-comments.enqueueSummary/enqueueVerification` (GST-04). The SUMMARY
  for TRD `07-01` is any `07-01-*SUMMARY.md` / `07-01-SUMMARY.md` in the objective dir.
- **Decisions.** `openDecision` is a library function in 47 (the `decision open|answer` verbs are objective 48). Decision ids `<trd>-d<k>`
  (D-19), k = next free in the mapping; body = marker + question; ops: `upsert-issue {role:'decision', type:'Decision'}` then
  `block {blocked: trd, blocker: decision}`.
- **Writable.** If capabilities say `writable:false`, `pushHierarchy` refuses before enqueueing.

<embedded_context>

<codebase_examples>
Op order for objective 7 with TRDs 07-01 (w1), 07-02 (w1), 07-03 (w2, depends_on 07-01):
```
patch-issue      {id:'7'}                     {type:'Objective'}
set-fields       {id:'7'}                     {values:{work:'feature', kind:'plugin'}}
upsert-issue     {id:'7-01', role:'trd'}      {title:'[TRD 07-01] alpha', body:encodeTrdBody(...), labels:['devflow:trd'], milestone_title:'v9.9', type:'TRD'}
upsert-issue     {id:'7-02', ...}
upsert-issue     {id:'7-03', ...}
link-sub-issue   {parent:'7', child:'7-01'}  ... 7-02, 7-03
block            {blocked:'7-03', blocker:'7-01'}
upsert-comment   {id:'7-01', kind:'summary'}  {mode:'replace', text}
wiki-push        {store:'pages'}              {pages:['PROJECT.md','REQUIREMENTS.md','objectives/07-store-demo/OBJECTIVE.md', ...], message:'devflow: objective 7'}
patch-body       {id:'7'}                     {mode:'managed', sections:{summary,criteria,footer}, preserve_ticks:true, derive:{wiki:{dir:'07-store-demo'}, trds:true, meta:{...}}}
```
Milestone title: `gh-milestone.resolveObjectiveMilestone` (46) — reuse it; do not parse ROADMAP here.
Frontmatter parsing: `require('./frontmatter.cjs').extractFrontmatter(text)` → `wave`, `depends_on`.
</codebase_examples>

<anti_patterns>
- Enqueueing ANY op before every TRD passed the budget check (SC2 says refused before any issue is created — and before anything is queued).
- Creating the objective issue here (46's find-or-create owns it; two create paths caused 46's duplicate bugs).
- Building the criteria section here independently of 46's builder (two writers, Pitfall 10).
- Deleting links, dependencies or issues for TRDs removed locally — report them via `reportOrphans`.
</anti_patterns>

<error_recovery>
- Objective not in the mapping → `{ok:false, error:'objective 7 has no issue yet; run df-tools gh sync 7'}`.
- Budget refusal → `{ok:false, refused:'budget', over:[{id, chars}], message:'TRD 07-04 is 60,001 characters (limit 60,000): narrow it or move work to a follow-up TRD'}`.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/47-github-authoritative-store/47-RESEARCH.md
@.planning/objectives/47-github-authoritative-store/47-07-gh-outbox-flush-TRD.md
@docs/PROPOSAL-github-system-of-record.md
</context>

<gotchas>
- TRD file discovery: `<objective dir>/*-TRD.md`, id = the `NN-MM` (or `NN.N-MM`) prefix; ignore `*-SUMMARY.md` etc.
- Re-push idempotency depends on the flusher's reads (sub-issues, blocked_by, marker scan); assert `fake.writes()` delta is 0 on the second push+flush.
- The fixture TRD without a trailing newline must round-trip; do not `.trim()` file text anywhere.
</gotchas>

## Test list

Pure planning
1. `readObjectiveTrds(root, '7')` → 3 entries `{id, file, text, wave, depends_on}` sorted by id.
2. `waveEdges(trds)` → `[{blocker:'7-01', blocked:'7-03'}]`; a wave-2 TRD with empty depends_on → blocked by both wave-1 TRDs; cycle → error; unknown dep → warning, no edge.
3. `planPush` with an added `07-04-big-TRD.md` of encoded length 60,001 (`oversizedTrdText`) → `{ok:false, refused:'budget'}` naming `7-04`; 60,000 → ok with a `warn` entry; also re-assert `oversizedTrdText` lengths against `gh-trd.encodeTrdBody`.
4. `buildOps(plan, {objectiveSections})` → exactly the order in codebase_examples.

Push + flush (fake)
5. SC2: budget refusal → `gh-outbox.readJournal` has zero ops and `fake.writes()` is unchanged.
6. SC1 push half (org, wiki ok): after `pushHierarchy` + flush: `GET .../issues/{obj}/sub_issues` returns 3 children in id order; `GET .../issues/{7-03}/dependencies/blocked_by` contains 7-01; each TRD body decodes to its file; objective body `wiki` section contains `devflow:dir=07-store-demo` and the fixture remote's head sha; the wiki remote has `Objective-7-store-demo.md` equal to OBJECTIVE.md; TRD types are `TRD`; objective fields set.
7. SUMMARY: `07-01-alpha-SUMMARY.md` appears as a `kind=summary` comment on TRD 7-01 whose `decodeFileComment` equals the file.
8. Ticks preserved: tick a criterion on GitHub (`humanEditBody` changing only `[ ]`→`[x]` inside `criteria`), re-push + flush → no halt (ticks are excluded from the managed hash, D-24) and the tick is kept (preserve_ticks); changing a criterion's TEXT on GitHub instead → halt.
9. Re-push unchanged → zero new writes.
10. SC5 push half: `makeStoreProject({ownerType:'User', hasWiki:false})` with real `detectCapabilities` → TRD issues labelled `devflow:trd` with `type:null`; objective body has `meta` with `type: Objective`, `work: feature`, `kind: plugin`; sub-issues and blocked-by still native; `docs/devflow/Objective-7-store-demo.md` written; no wiki clone created.
11. Frozen TRD: `freezeTrd` + flush, change the local TRD file, re-push → body unchanged on GitHub, warning names drift; nothing halts.
12. `openDecision(root, '07-03', {question:'REST or GraphQL?'})` + flush → issue `[Decision 07-03-d1]` with type Decision (org) / label `devflow:decision` (user), and TRD 7-03 blocked_by it.
13. `reportOrphans`: a fake TRD issue with marker `7-09` not linked and no file → listed; deleting `07-02-beta-TRD.md` locally → listed as "linked, no local file"; zero writes.
14. `writable:false` → refused before enqueue.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure planning — TRD discovery, wave edges, budget gate, op order (tests 1-4)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs, plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs</files>
  <action>
RED: tests 1-4. Commit RED.
GREEN: `readObjectiveTrds(root, objectiveArg)`, `waveEdges(trds)`, `planPush(root, objectiveArg)` (reads files only; calls
`gh-trd.checkObjectiveBudgets` first and returns early on refusal), `buildOps(plan, {objectiveSections, milestoneTitle, work, kind, now})`,
`REFERENCE_PAGES(root, dir)`. Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs</verify>
  <done>Tests 1-4 pass with no gh calls.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: pushHierarchy end to end on the fake, native and degraded (tests 5-11, 14)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs, plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs</files>
  <action>
RED: tests 5-11, 14. Commit RED.
GREEN: `pushHierarchy(root, objectiveArg, {objectiveSections, flush:false, now})`:
1. `outbox.isEnabled` false → skipped. Mapping must have the objective (error_recovery).
2. `plan = planPush(...)`; refusal → return it (nothing enqueued).
3. `caps = detectCapabilities(root, {probeIssue: objective number})`; `resolveModes(caps).writable === false` → refuse.
4. ops = `buildOps(...)` + `gh-comments.enqueueSummary/enqueueVerification` payloads (build the op objects, enqueue all in ONE `outbox.enqueue`).
5. `opts.flush` → `gh-outbox-flush.flush(root, {modes: resolveModes(caps)})`; return `{ok, enqueued, flush, degraded: caps.degraded, warnings}`.
Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs</verify>
  <done>Tests 1-11 and 14 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Decisions and orphan report (tests 12-13)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs, plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs</files>
  <action>
RED: tests 12-13. Commit RED.
GREEN: `openDecision(root, trdId, {question, now})` and `reportOrphans(root, objectiveArg)` (reads: label scan of `devflow:trd`, the objective's
sub_issues, local TRD files; returns `{unlinked:[{id, number}], missing_local:[{id, number}]}`). Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs && ! rg -n "ghWrite" plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs</verify>
  <done>Tests 1-14 pass; no direct writes in the module.</done>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs plugins/devflow/devflow/bin/lib/gh-comments.test.cjs plugins/devflow/devflow/bin/lib/gh-capability.test.cjs</regression>
</validation_gates>

<verification>
- Test 5 proves SC2 (zero ops, zero writes); test 6 proves the SC1 push half; test 10 the SC5 push half.
- `rg -n "ghWrite" plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs` → no matches.
</verification>

<success_criteria>
One objective push produces the full native hierarchy (or its degraded equivalent) through the outbox, refuses oversized TRDs
before anything is queued, and is idempotent on re-push.
</success_criteria>

<output>
After completion, create `.planning/objectives/47-github-authoritative-store/47-09-gh-hierarchy-SUMMARY.md`
</output>
