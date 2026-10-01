---
objective: 48-planning-write-path-migration
trd: "05"
type: tdd
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-wiki.cjs
  - plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-milestone-store.cjs
  - plugins/devflow/devflow/bin/lib/gh-milestone-store.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
  - plugins/devflow/devflow/bin/lib/gh-fake.test.cjs
autonomous: true
requirements: [GWP-01, GWP-04]
must_haves:
  truths:
    - "PAGE_TABLE maps `research/<stem>.md` ↔ `Research-<stem>` (D-04), `milestones/vX.Y.md` ↔ `Milestone-vX_Y` and `milestones/vX.Y-<KIND>.md` ↔ `Milestone-vX_Y-<Kind>` (D-05), and other objective docs `objectives/<dir>/<N>-<SUFFIX>.md` ↔ `<ObjectivePage>-<Suffix>` (UAT, EVIDENCE, ROLLOUT, DISCOVERY...), each round-tripping through `cachePathForPage`"
    - "Existing page mappings (Project, Requirements, Roadmap, Codebase-*, objective Context/Research/page, ADR-*, Retro-*) are unchanged, and TRD/SUMMARY/VERIFICATION files still map to null"
    - "`gh-milestone-store` upserts a native milestone by title (find-or-create, 422 already_exists = lookup), patches description/state/due_on by NUMBER, lists milestones (open+closed, paginated), and closes one — every call through gh-client, never spawning gh"
    - "`milestoneDescription(entryText, pageUrl)` returns at most 1,000 characters: the entry's first paragraph (truncated on a word boundary with an ellipsis) followed by a blank line and `Full notes: <pageUrl>` (D-05)"
    - "The fake GitHub supports `PATCH repos/o/r/milestones/<n>` (title, description, state, due_on) and `GET repos/o/r/milestones/<n>`; existing fake tests unchanged"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-wiki.cjs
      provides: "PAGE_TABLE rules research, milestone, milestone-archive, objective-doc"
    - path: plugins/devflow/devflow/bin/lib/gh-milestone-store.cjs
      provides: "MILESTONE_DESC_MAX, milestoneDescription, milestonePage, findMilestone, upsertMilestone, closeMilestone, listMilestones"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
      provides: "milestone PATCH + single GET routes"
  key_links:
    - "`doc put` (48-11) accepts any rel with `pageForCachePath(rel) !== null`; `milestone put|complete` (48-12) calls gh-milestone-store; gh-cache (48-07) renders MILESTONES.md from `listMilestones`"
---

# TRD 48-05: Wiki page rules (research, milestones, objective docs) and native milestone store

<objective>
Give the remaining reference documents a wiki home (U-1, D-04, D-05) by extending 47's single page table, and add the native-milestone
write module that milestone verbs use. Extend the fake GitHub so milestone edits can be tested.

Purpose: GWP-01 coverage for research/milestones, GWP-04 (nothing left without a GitHub home). Output: PAGE_TABLE rules, `gh-milestone-store.cjs`,
fake milestone routes, tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD; characterization first: pin today's `pageForCachePath` results for every existing rule and for a TRD/SUMMARY/VERIFICATION path
  (all null) before adding rules.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- `gh-milestone-store.cjs` uses only `gh-client` (`ghRead`, `ghWrite`, `ghPaginate`); no `spawnSync`. `gh-milestone.cjs` (46-05) stays
  pure local I/O and is NOT modified. 48-15 adds the new module to the seam guard.
- Tests: `client._setRunGh(fake.runGh)` with `createFakeGitHub(...)`, `_resetClient()` in afterEach, `hermeticEnv()`. Never real GitHub,
  never real `~/.claude`, never port 8080. Hand-written fixtures.

## Decisions

D-04, D-05. Settled here:

- **Research rule**: `^research\/([A-Za-z0-9][A-Za-z0-9_-]*)\.md$` → `Research-<stem>`; invert `^Research-([A-Za-z0-9][A-Za-z0-9_-]*)$`.
  Name `research`; placed before the objective rules.
- **Milestone rules**: `^milestones\/v(\d+(?:\.\d+)*)\.md$` → `Milestone-v<X_Y>`; `^milestones\/v(\d+(?:\.\d+)*)-([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*)\.md$`
  → `Milestone-v<X_Y>-<Kind>` where Kind title-cases each hyphen part (`MILESTONE-AUDIT` → `Milestone-Audit`); inverse upper-cases it back.
- **Generic objective doc rule** (after the existing CONTEXT/RESEARCH/objective rules): `^objectives\/([^/]+)\/(\d+(?:\.\d+)?)-([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*)\.md$`
  where the number equals the dir's objective prefix and SUFFIX is not `TRD|SUMMARY|VERIFICATION|CONTEXT|RESEARCH` → `<ObjectivePage>-<Suffix>`.
  `NN-MM-...-TRD.md` never matches (the prefix must be the bare objective number).
- **Milestone title**: `<github.milestone_prefix or ''><version>` (same prefix `gh-hierarchy.configuredMilestonePrefix` reads); version normalised
  with `gh-milestone.normaliseVersion`.
- **Description**: `MILESTONE_DESC_MAX = 1000`. First paragraph = text up to the first blank line after skipping a leading `## ` heading line.
- **upsertMilestone(root, {version, description, state, due_on})**: list (paginated, `state=all`) → find by title → PATCH by number with only the
  fields that differ (no write when nothing differs); not found → POST, on 422 re-list. Returns `{ok, number, title, created, updated, warnings}`.
  Uses `client.requireEnabled(root)` for repo/gate (skipped when `github.enabled` is not true → `{ok:false, skipped:true}`).

## Test list

gh-wiki
1. Characterization: today's mappings for `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `codebase/STACK.md`, `objectives/07-store-demo/07-CONTEXT.md`, `objectives/07-store-demo/OBJECTIVE.md`, `adr/0001-x.md`, `retros/v1.3.md`; and null for `objectives/07-store-demo/07-01-a-TRD.md`, `...-SUMMARY.md`, `07-VERIFICATION.md`, `STATE.md`.
2. `research/tdd-scope-summary.md` ↔ `Research-tdd-scope-summary`.
3. `milestones/v1.3.md` ↔ `Milestone-v1_3`; `milestones/v1.3-MILESTONE-AUDIT.md` ↔ `Milestone-v1_3-Milestone-Audit`; `milestones/v1.2-ROADMAP.md` ↔ `Milestone-v1_2-Roadmap`.
4. `objectives/42-codebase-aware-stack-drafter/42-ROLLOUT.md` ↔ `Objective-42-<Slug>-Rollout` (with objectiveDirs); `48-UAT.md` likewise; `07-VERIFICATION.md` stays null; `07-01-a-TRD.md` stays null.
5. Every new rule's page name passes `validPage` (PAGE_NAME_RE).

gh-milestone-store
6. `milestoneDescription` of a 3-paragraph entry → first paragraph + `\n\nFull notes: <url>`; a 2,000-char first paragraph → total <= 1,000, ends with `…` before the link, cut on a space.
7. `upsertMilestone` on an empty fake → one POST, returns number; second call with same description → zero writes.
8. Existing milestone with a different description → one PATCH to `milestones/<number>` (by number, not title).
9. POST answered 422 already_exists (milestone created between list and post: seed the fake after the list via a hook, or call with a stale list) → resolves by re-list, no error.
10. `closeMilestone(root, 'v1.3')` → PATCH `state=closed`; already closed → no write.
11. `listMilestones` paginates (seed 120 milestones in the fake) and returns `{number,title,state,description,due_on,closed_at}`.
12. `github.enabled` false → `{ok:false, skipped:true}` and zero fake calls; fake offline → `{ok:false, error}` naming offline, nothing written.

gh-fake
13. `PATCH repos/o/r/milestones/<n>` updates description/state/title/due_on and sets `closed_at` when closing; unknown number → 404; `GET repos/o/r/milestones/<n>` returns it.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: PAGE_TABLE rules for research, milestones and objective docs (tests 1-5)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-wiki.cjs, plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs</files>
  <action>
Commit test 1 alone (characterization). RED: tests 2-5; commit `test(48-05): wiki rules for research, milestones, objective docs`.
GREEN: add the four rules to `PAGE_TABLE` in the positions above, each with `match`/`invert`, reusing `objectivePage`/`parseObjectiveDir`.
Keep the doc comment above PAGE_TABLE accurate (list the new classes). Commit `feat(48-05): wiki page rules for research and milestones`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs plugins/devflow/devflow/bin/lib/gh-cache.test.cjs</verify>
  <done>Tests 1-5 pass; gh-cache suite (which uses the table) green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Fake GitHub milestone PATCH and single GET (test 13)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs, plugins/devflow/devflow/bin/lib/gh-fake.test.cjs</files>
  <action>
RED: test 13 in `gh-fake.test.cjs`. Commit `test(48-05): fake milestone patch route`.
GREEN: in the `api` router next to `repos/.../milestones` (L676), add `^repos\/([^/]+\/[^/]+)\/milestones\/(\d+)$` handling GET and PATCH (fields from
`-f`/`-F` or `--input`), recording writes like the other routes (so `fake.writes()` sees them). Commit `feat(48-05): fake milestone patch route`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs</verify>
  <done>Test 13 passes; all existing fake tests pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: gh-milestone-store.cjs — native milestone writes (tests 6-12)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-milestone-store.cjs, plugins/devflow/devflow/bin/lib/gh-milestone-store.test.cjs</files>
  <action>
RED: tests 6-12 against the fake (`makeStoreProject()` for the config, `createFakeGitHub(project.fakeOptions)`). Commit `test(48-05): native milestone store`.
GREEN: implement the exports in the artifact list. Header comment: D-05, why these writes are direct (same documented exception as 47's milestone
bootstrap in `gh-issue.ensureMilestone`: idempotent, find-or-create by title, PATCH by number) and that offline exits before writing. Reuse
`gh-issue.ensureMilestone`'s 422 handling pattern (copy, do not import its runCtx). Commit `feat(48-05): native milestone store`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-milestone-store.test.cjs plugins/devflow/devflow/bin/lib/gh-milestone.test.cjs</verify>
  <done>Tests 6-12 pass; gh-milestone.cjs untouched and green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-wiki.cjs` L92 `objectiveDocRule(kind, suffix)` and the `retro` rule (dots ↔ underscores) — the patterns to follow.
- `gh-issue.cjs` L127 `ensureMilestone(runCtx, title)` — POST, 422 → paginated lookup by title.
- `__fixtures__/gh-fake.cjs` L676-694 — the milestones collection route; `addMilestone(title, description)`.
</codebase_examples>
<anti_patterns>
- Adding gh calls to `gh-milestone.cjs`: it is documented "Pure local I/O" and imported by code that must not reach GitHub.
- PATCHing a milestone by title: REST takes the number.
</anti_patterns>
<error_recovery>
- If a new rule shadows an existing mapping (test 1 fails), move it later in PAGE_TABLE; order is significant.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs plugins/devflow/devflow/bin/lib/gh-milestone-store.test.cjs plugins/devflow/devflow/bin/lib/gh-fake.test.cjs</test>
<regression>node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'</regression>
</validation_gates>

<verification>
- `node -e "const w=require('./plugins/devflow/devflow/bin/lib/gh-wiki.cjs');for (const r of ['research/tdd-scope-summary.md','milestones/v1.3-MILESTONE-AUDIT.md','milestones/v1.2-ROADMAP.md']) console.log(r, w.pageForCachePath(r))"` prints three pages.
</verification>

<success_criteria>
Research notes and milestone archives have wiki pages, and milestones themselves are native GitHub milestones written idempotently.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-05-SUMMARY.md`
</output>
