---
objective: 48-planning-write-path-migration
trd: "07"
type: tdd
wave: 2
depends_on: ["48-01", "48-02", "48-05"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-cache.cjs
  - plugins/devflow/devflow/bin/lib/gh-cache.test.cjs
autonomous: true
requirements: [GWP-01, GWP-04]
must_haves:
  truths:
    - "`readRemoteModel` also lists `devflow:todo`, `devflow:debug`, `devflow:quick` issues (labels overridable in config) with their comments, Decision issues with their comments, and native milestones (read-only)"
    - "`materialize` writes each entity issue back to the exact `.planning/` path in its `devflow:file` header (todos/pending|completed, debug/ or debug/resolved, quick/<N>-<slug>/<N>-JOB.md) and a quick issue's `devflow:summary` comment to its SUMMARY path, so `check-todos` and quick/debug readers work on a fresh clone (U-3)"
    - "An entity whose header path does not classify (planning-paths) as that entity's role is rejected with a reason, never written"
    - "Decision issues materialise to `decisions/<id>.md` = question body + `## Answer` section from the `devflow:answer` comment when present"
    - "MILESTONES.md is rendered (with `GENERATED_HEADER`) from CLOSED native milestones, newest first, each with title, closed date and description; nothing is written when no milestone is closed; a hand-maintained MILESTONES.md (no header) is left alone as `hand_maintained`"
    - "`listOwnedLocal` covers every `cache`-class file per `planning-paths.classify` except `wiki/**`, so pull safety rules and W055 see entity, research, milestone and objective-doc files"
    - "Every existing gh-cache and 47 e2e test passes unchanged"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-cache.cjs
      provides: "readRemoteModel entities/decision comments/milestones; materialize entities + decisions; renderMilestones; GENERATED_FILES incl. MILESTONES.md; listOwnedLocal via classifier"
  key_links:
    - "Consumes 48-02 decodeEntityBody/ENTITY_ROLES, 48-05 page rules + gh-milestone-store.listMilestones, 48-01 classify; consumed by `gh pull --all`, 48-09 W055, 48-10 migration preconditions, 48-22 e2e"
---

# TRD 48-07: Cache materialisation for todo, debug, quick, decision issues and MILESTONES.md

<objective>
Make `gh pull --all` rebuild the new cache classes from GitHub: entity issues back to their files, Decision issues to `decisions/`,
closed native milestones to a generated MILESTONES.md, and widen the owned-file list to every cache-class path so pull's overwrite
safety and `validate` cover them.

Purpose: U-1, U-3 (check-todos works off the cache), GWP-04 (nothing in store mode lives only locally). Output: gh-cache changes + tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD; characterization first: pin `materialize(model)` output and `listOwnedLocal(root)` for the 47 store fixture (today's values) before
  changing either. Those pins must still pass after GREEN except where this TRD adds new files (assert additions explicitly).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- `gh-cache.cjs` stays read-only toward GitHub (in the seam guard's NO_DIRECT_WRITE list): reads via `client.ghPaginate`/`ghRead` or
  `gh-milestone-store.listMilestones` (a read). No writes, no spawns.
- Tests: hand-built model objects for `materialize`/`renderMilestones` (pure), and the fake GitHub (`createFakeGitHub`, `gh._setRunGh`,
  `hermeticEnv()`, `makeStoreProject({store:true})`) for `readRemoteModel`/`pullAll`. Never real GitHub/`~/.claude`, never port 8080.

## Decisions

U-1, U-3, D-02, D-03, D-05. Settled here:

- **Labels**: `DEFAULT_LABELS` gains `todo`, `debug`, `quick` from `ENTITY_ROLES`; config overrides apply the same way.
- **Entity placement**: `decodeEntityBody(body)`; the header `file` is the cache rel. Accept only when `planningPaths.classify(file)` returns class
  `cache` with `entity.role === <issue's role>` and `entity.id === <decoded id>`. Issue state is authoritative for todo/debug location: a closed
  todo whose header says `todos/pending/x.md` is placed at `todos/completed/x.md` (the `todo complete` location; a header already
  under the legacy `todos/done/` is kept there), an open one under `completed/` or `done/` goes back to `todos/pending/`, same for `debug/` ↔ `debug/resolved/`; the
  rewrite is reported in `notes`. Quick placement never moves.
- **Quick summary**: `ghComments.decodeFileComment(comments, 'quick-<N>', 'summary')`; its file must sit in the same quick dir as the JOB.
- **Decisions**: file `decisions/<decision-id>.md`; text = issue body (trimmed of the `devflow:id` line if present) + `\n\n## Answer\n\n<answer text>`
  when an `answer` comment exists (`decodeFileComment(..., 'answer')` or the marker body after the marker line). Sources key `<id>`.
- **MILESTONES.md**: `renderMilestones(milestones)` = `GENERATED_HEADER` + `# Milestones` + per closed milestone (sorted by `closed_at` desc)
  `## <title> (Shipped: <YYYY-MM-DD>)` + description. Add `'MILESTONES.md'` to `GENERATED_FILES`; `pullAll` includes it only when the render is non-null.
- **listOwnedLocal**: walk `.planning/` with `planningPaths.listByClass` and return the `cache` list minus `wiki/**`, sorted. Characterize the
  47 fixture first: today's list must be a subset of the new one.

## Test list

materialize / render (pure)
1. Characterization: 47 `STORE_FIXTURE`-shaped model → today's `files`/`sources` (captured literal).
2. Model with one open todo issue (entity body for `todos/pending/2026-07-31-a.md`) → `files['todos/pending/2026-07-31-a.md']` byte-identical to the encoded text; `sources` key `todo-2026-07-31-a`.
3. Same todo, issue closed → placed at `todos/completed/2026-07-31-a.md`, note emitted; closed with a legacy `todos/done/` header → stays in `done/`.
4. Debug issue open with header `debug/resolved/x.md` → placed at `debug/x.md`; closed with header `debug/x.md` → `debug/resolved/x.md`.
5. Quick issue `quick-12` with JOB header `quick/12-fix-x/12-JOB.md` + summary comment file `12-SUMMARY.md` → both files under `quick/12-fix-x/`.
6. Entity whose header file is `objectives/07-x/07-01-a-TRD.md` (role todo) → rejected with reason, nothing written.
7. Decision issue `7-01-d1` with answer comment → `decisions/7-01-d1.md` contains question and `## Answer` with the answer; without answer → question only.
8. `renderMilestones` with two closed + one open milestone → header, newest closed first, open one omitted; none closed → null.

remote model / pull (fake GitHub)
9. `readRemoteModel` on a fake seeded with one todo, one debug, one quick (with summary comment), one decision (with answer), two milestones → model has `todos`, `debugs`, `quicks`, `decisions` (with comments) and `milestones`.
10. `pullAll` into an empty `.planning/` writes all files from 2-8; second `pullAll` writes nothing.
11. A hand-maintained MILESTONES.md (no generated header) is reported `hand_maintained` and untouched.
12. A locally modified todo file (hash differs from baseline) is `local_modified`, not overwritten; `--force` overwrites.
13. `listOwnedLocal` on a tree with `research/a.md`, `milestones/v1.3.md`, `todos/pending/a.md`, `quick/1-x/1-JOB.md`, `quick/1-x/DECISION-001.md`, `wiki/Home.md`, `objectives/07-x/07-UAT.md` → all but the quick DECISION file and the wiki file, plus 47's owned files.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Materialise entities, decisions and MILESTONES.md (tests 1-8)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-cache.cjs, plugins/devflow/devflow/bin/lib/gh-cache.test.cjs</files>
  <action>
Commit test 1 alone (characterization). RED: tests 2-8; commit `test(48-07): materialise entity issues and milestones`.
GREEN: extend `materialize(model)` with entity, quick-summary and decision sections after the VERIFICATION loop (reuse `put`, `rejected`, add
`notes` to the return); add `renderMilestones`; add `'MILESTONES.md'` to `GENERATED_FILES`. Keep the return keys of `materialize` a superset.
Commit `feat(48-07): materialise todo, debug, quick, decision issues and MILESTONES.md`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-cache.test.cjs</verify>
  <done>Tests 1-8 pass; characterization unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Remote model, pull and owned list (tests 9-13)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-cache.cjs, plugins/devflow/devflow/bin/lib/gh-cache.test.cjs</files>
  <action>
RED: tests 9-13 (fake GitHub; seed entity issues with `encodeEntityBody` bodies and marker comments built with the same helpers 47 tests use).
Commit `test(48-07): pull entity issues and milestones`.
GREEN: in `readRemoteModel` list the three entity labels (decode with `decodeEntityBody`; undecodable → `problems.undecodable_entities`), read
comments for quick and decision issues, list milestones via `gh-milestone-store.listMilestones` (on failure: `pages_report`-style
`milestones_report` with the error, never fail the pull). In `pullAll` add `MILESTONES.md` when rendered, merge `mat.notes` into notes, add
attention lines for undecodable entities. Replace `listOwnedLocal` with the classifier walk. Commit `feat(48-07): pull --all rebuilds entity issues and milestones`.
Run the 47 e2e (`gh-store-e2e.test.cjs`) and `gh-pull*.test.cjs`; if one pins the exact pulled file set and now sees MILESTONES.md, that means a
closed milestone exists in its fixture — report in the SUMMARY rather than editing that test (not in this TRD's files).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-cache.test.cjs plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs</verify>
  <done>Tests 9-13 pass; 47 e2e green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-cache.cjs` L240 `materialize`, L336 `DEFAULT_LABELS`, L343 `listLabelled`, L434 `readRemoteModel`, L536 `listOwnedLocal`, L740 `pullAll`.
- `gh-comments.cjs` L83 `decodeFileComment(comments, id, kind)` — summary/verification comment decoding; reuse for quick summaries and answers.
- `gh-cache.cjs` L59-60 `GENERATED_HEADER`, `GENERATED_FILES` — the hand-maintained rule keys off the header.
</codebase_examples>
<anti_patterns>
- Trusting the header path blindly: a crafted issue body could otherwise place a file anywhere under `.planning/` (classify + role check is the guard; `requireSafe` still applies).
- Failing the whole pull when the milestone list errors: report it, keep the rest.
</anti_patterns>
<error_recovery>
- If test 1's literal changes because of `notes` being added to the return, assert the pre-existing keys only (`files`, `sources`, `rejected`, `no_dir`, `orphan_trds`, `unmapped_pages`).
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-cache.test.cjs</test>
<regression>node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'</regression>
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs` green: gh-cache still never calls `ghWrite`.
</verification>

<success_criteria>
A fresh clone in store mode gets todos, debug sessions, quick tasks, decisions and the shipped-milestone log back from GitHub with one `gh pull --all`.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-07-SUMMARY.md`
</output>
