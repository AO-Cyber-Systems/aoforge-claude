---
objective: 48-planning-write-path-migration
trd: "12"
type: tdd
wave: 3
depends_on: ["48-02", "48-05", "48-06", "48-07", "48-11"]
files_modified:
  - plugins/devflow/devflow/bin/lib/planning-entity-verbs.cjs
  - plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs
  - plugins/devflow/devflow/bin/lib/planning-import.cjs
  - plugins/devflow/devflow/bin/lib/planning-import.test.cjs
autonomous: true
requirements: [GWP-01, GWP-04]
must_haves:
  truths:
    - "LOCAL MODE INVARIANT: `decisionOpen|decisionAnswer` write today's `decisions/pending|resolved/DECISION-NNN.md` via decision-queue `addDecision`/`resolveDecision`; `todoAdd` writes `todos/pending/<stem>.md`; `todoComplete` moves it to `todos/completed/` with the `completed:` line exactly like `cmdTodoComplete`; `debugPut|debugResolve` write `debug/<slug>.md` / move to `debug/resolved/`; `quickPut|quickSummary` write `quick/<N>-<slug>/<N>-JOB.md|SUMMARY.md`; `milestonePut` writes the MILESTONES.md entry; zero gh calls"
    - "STORE MODE: todo/debug/quick verbs enqueue `upsert-issue` with role todo/debug/quick and an entity-codec body; completion/resolution enqueues `patch-issue` closed/completed and rewrites the header path; `quickSummary` enqueues a `devflow:summary` comment then closes the quick issue (U-1, U-3, D-03)"
    - "STORE MODE: `decisionOpen(trd, question)` uses 47's `gh-hierarchy.openDecision`; `decisionAnswer(id, text)` enqueues `upsert-comment {kind:'answer'}` + `patch-issue closed/completed` (D-09)"
    - "STORE MODE: `milestonePut(version, entry)` upserts the native milestone (description <= 1,000 chars with the wiki link) then `docPut('milestones/vX.Y.md')`; `milestoneComplete(version)` closes the milestone and `docPut`s any `milestones/vX.Y-*.md` archives; offline the milestone call fails with exit 1 before any write (D-05)"
    - "`planning import [--dry-run]` (store mode only) enqueues every pre-existing todo, debug, quick, research, milestone archive, MILESTONES.md entry and objective (hierarchy push) that has no baseline, reports TRDs refused by the budget and decision files with no TRD to block as 'kept local', and is idempotent (D-17)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/planning-entity-verbs.cjs
      provides: "decisionOpen, decisionAnswer, todoAdd, todoComplete, debugPut, debugResolve, quickPut, quickSummary, milestonePut, milestoneComplete, entityIdFor"
    - path: plugins/devflow/devflow/bin/lib/planning-import.cjs
      provides: "planImport(root, {dryRun}) -> {queued, skipped, kept_local, refused}"
  key_links:
    - "Built on 48-11 `writeThrough`/`docPut`; 48-02 codec/roles; 48-05 gh-milestone-store; 48-06 flusher entity branches; 48-07 materialisation (round-trip tested here)"
---

# TRD 48-12: Entity verbs (decision, todo, debug, quick, milestone) and `planning import`

<objective>
Add the verbs for everything that is not an objective document: decisions, todos, debug sessions, quick tasks and milestones, each
writing today's local files in local mode and the U-1 GitHub homes in store mode. Add `planning import`, which moves a project's existing
local-work into the store before migration 0010 untracks it.

Purpose: GWP-01 (decision open|answer, todo add + debug/quick/milestone per U-1), GWP-04 (no data left without a home), D-03/D-05/D-09/D-17.
Output: `planning-entity-verbs.cjs`, `planning-import.cjs`, tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD; LOCAL-mode characterization for each verb first: produce today's file with today's code path (decision-queue functions,
  `cmdTodoComplete` via `node df-tools.cjs todo complete` in a temp project, debugger/quick layouts from the workflows) and assert the verb's
  local output is byte-identical. Then RED/GREEN for store mode.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- No spawns, no stdout/exit (library). gh via 47 libraries; milestone writes via `gh-milestone-store` (direct, D-05).
- Tests: `hermeticEnv()`, `makeStoreProject`, `createFakeGitHub({...types incl. Debug, Quick})`, `gh._setRunGh`, `createWikiRemote()`, fake clock,
  `_resetClient()`. Hand-written todo/debug/quick texts modelled on this repo's real files (shape only). Never real GitHub/`~/.claude`, never port 8080.

## Decisions

D-03, D-05, D-09, D-17, U-1, U-3. Settled here:

- **Ids** (`entityIdFor(rel)` delegates to `planningPaths.classify(rel).entity`): `todo-<stem>`, `debug-<slug>`, `quick-<N>`.
- **Titles**: todo → frontmatter `title:`; debug → first `# ` heading or slug; quick → `Quick <N>: <slug words>`. Labels per role from config.
- **todoAdd(root, {text, stem?})**: stem defaults to `<YYYY-MM-DD>-<slug(title)>` exactly as `workflows/add-todo.md` names files today.
- **todoComplete(root, {stem})**: local = byte-identical to `cmdTodoComplete` (prepend `completed: <date>\n`, move to `todos/completed/`).
  Store = same file move in the cache (both rels go through the ledger), upsert body with the new header path, `patch-issue` closed/completed.
- **debugResolve**: local = move `debug/<slug>.md` → `debug/resolved/<slug>.md` (debugger.md L363-364); store adds body re-upsert + close.
- **quickPut(root, {n, slug, text})** → `quick/<n>-<slug>/<n>-JOB.md`; **quickSummary(root, {n, text})** → `<n>-SUMMARY.md`; store = summary comment
  (`gh-comments.enqueueFileComment` with id `quick-<n>`, kind `summary`) + close.
- **decisionOpen**: store requires a TRD id; local without a TRD id still works (decision-queue has no TRD requirement).
- **milestonePut(root, {version, text})**: local = replace-or-insert the `## <version> ...` section in MILESTONES.md (insert after `# Milestones`);
  store = `milestoneDescription(text, pageUrl)` → `upsertMilestone` → on success `docPut('milestones/<version>.md', text)`. Page URL from
  `gh-wiki` page naming + repo (`https://github.com/<repo>/wiki/Milestone-v1_3`).
- **milestoneComplete(root, {version})**: store only (local is today's `cmdMilestoneComplete`, wired by 48-15) = `closeMilestone` + `docPut` each
  `milestones/<version>-*.md` present.
- **planImport**: store mode only (local → `{ok:false, error:'planning import needs github.store: true'}`). Walk `listByClass` cache files with no
  baseline; group: entities → their verb; research/milestones/objective docs/PROJECT/REQUIREMENTS/codebase → `docPut` (one wiki-push with all
  pages); objectives → `pushHierarchy` per objective with `--no-flush`, then one flush; MILESTONES.md (hand-maintained) → one `milestonePut` per
  `## vX.Y` section. Budget refusals are collected in `refused` (e.g. `04-01` 69K) with the hint "split it or move bulk to a linked file".
  `decisions/` files without a `trd:` frontmatter field → `kept_local`. `--dry-run` enqueues nothing and returns the same report.

## Test list

local parity
1. `todoAdd` text → `todos/pending/2026-10-01-fix-thing.md` byte-identical to the input; `todoComplete` → file in `todos/completed/` byte-identical to what `df-tools todo complete` produces from the same pending file (run both in two temp projects).
2. `decisionOpen`/`decisionAnswer` → files byte-identical to `decision-queue addDecision`/`resolveDecision` output for the same inputs (fixed clock).
3. `debugPut` + `debugResolve` → `debug/x.md` then `debug/resolved/x.md`; `quickPut` + `quickSummary` → files in `quick/12-fix-x/`.
4. `milestonePut('v1.4', entry)` on an existing MILESTONES.md → section inserted after `# Milestones`; second call replaces it; zero gh calls in 1-4.

store
5. `todoAdd` → `devflow:todo` issue, mapping entity, cache file + baseline after flush; `gh pull --all` into a wiped cache reproduces the file byte-identically.
6. `todoComplete` → issue closed/completed; cache file at `todos/completed/`; pull reproduces it there.
7. `debugPut` → issue with native `Debug` type (types enabled) and labels-only when the fake lacks `Debug`; `debugResolve` closes it.
8. `quickPut` + `quickSummary` → Quick issue with summary comment, closed; pull rebuilds both files in the quick dir.
9. `decisionOpen('7-01', 'A or B?')` → Decision issue blocking TRD 7-01 (47 behaviour); `decisionAnswer('7-01-d1', 'B')` → answer comment + closed; pull writes `decisions/7-01-d1.md` with `## Answer`.
10. `milestonePut('v1.4', entry)` → native milestone `v1.4` with description <= 1,000 chars ending in the wiki link + wiki page `Milestone-v1_4`; `milestoneComplete('v1.4')` closes it; fake offline → exit 1, zero writes, no wiki commit.
11. `planImport` on a store project seeded with 1 todo, 1 debug, 1 quick dir, `research/a.md`, `milestones/v1.3-ROADMAP.md`, a MILESTONES.md with one section, a 61,000-char TRD, and a decision file without `trd:` → queued counts per kind, `refused` names the TRD, `kept_local` names the decision; `--dry-run` writes nothing; running import twice enqueues nothing the second time.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Todo, debug and quick verbs (tests 1, 3, 5-8)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-entity-verbs.cjs, plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs</files>
  <action>
Commit local-parity tests 1 and 3 first (they fail only because the module does not exist — that is the RED). Then store tests 5-8; commit
`test(48-12): todo, debug and quick verbs`. GREEN: implement on `writeThrough` with `enqueue` callbacks building `upsert-issue`
(`{id, role}`, `{title, body: encodeEntityBody(...), labels:[label], type?}`) and `patch-issue`. Moves = two writeThrough calls (write new rel,
remove old rel via a `removeThrough` helper that deletes the cache file and forgets the ledger entry). Commit `feat(48-12): todo, debug and quick verbs`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs</verify>
  <done>Tests 1, 3, 5-8 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Decision and milestone verbs (tests 2, 4, 9-10)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-entity-verbs.cjs, plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs</files>
  <action>
RED: tests 2, 4, 9-10; commit `test(48-12): decision and milestone verbs`. GREEN: implement `decisionOpen`/`decisionAnswer` (local delegates to
decision-queue functions, which take `cwd` and write files — pass the main root), `milestonePut`/`milestoneComplete`. Commit
`feat(48-12): decision and milestone verbs`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs plugins/devflow/devflow/bin/lib/decision-queue.test.cjs</verify>
  <done>Tests 2, 4, 9-10 pass; decision-queue suite unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: planning import (test 11)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-import.cjs, plugins/devflow/devflow/bin/lib/planning-import.test.cjs</files>
  <action>
RED: test 11 (plus a local-mode refusal case). Commit `test(48-12): planning import`.
GREEN: implement `planImport(root, {dryRun})` per the decisions; one flush at the end (exit code from 47 EXIT). Header comment: why import exists
(D-17: 0010 refuses while any cache file has no baseline) and what stays local. Commit `feat(48-12): planning import moves local work into the store`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-import.test.cjs</verify>
  <done>Test 11 passes, including idempotency and dry-run.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `misc.cjs` L645 `cmdTodoComplete` (moves to `todos/completed/`, prepends `completed: <date>`).
- `decision-queue.cjs` exports `addDecision`, `resolveDecision`, `nextDecisionId`, `renderDecisionMarkdown`.
- `agents/debugger.md` L117, L363-364 (debug/resolved layout); `.planning/quick/1-add-release-on-tag-github-actions-workfl/` (`1-JOB.md`, `1-SUMMARY.md`, `DECISION-001.md`).
- `gh-hierarchy.cjs` L562 `openDecision(root, trdArg, opts)`.
</codebase_examples>
<anti_patterns>
- Re-implementing decision-queue file rendering for local mode: delegate, so parity is structural.
- Importing objectives with one flush per objective: one batch, one flush (write budget 80/min).
</anti_patterns>
<error_recovery>
- If `openDecision` needs connectivity for the blocked-by edge, accept a pending exit (3) in the offline test; the edge flushes later.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs plugins/devflow/devflow/bin/lib/planning-import.test.cjs</test>
<regression>node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs' plugins/devflow/devflow/bin/lib/decision-queue.test.cjs plugins/devflow/devflow/bin/lib/check-todos.test.cjs</regression>
</validation_gates>

<verification>
- After test 5's pull, `check-todos` (library call) lists the todo from the rebuilt cache (U-3).
</verification>

<success_criteria>
Todos, debug sessions, quick tasks, decisions and milestones each have one verb that writes today's file locally and the right GitHub object in store mode, and existing local work can be imported.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-12-SUMMARY.md`
</output>
