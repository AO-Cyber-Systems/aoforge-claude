---
objective: 49-objective-branch-and-pr-lifecycle
trd: "05"
type: standard
wave: 2
depends_on: ["49-01", "49-02"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-body.cjs
  - plugins/devflow/devflow/bin/lib/gh-body.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-outbox.cjs
  - plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs
  - plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs
autonomous: true
requirements: [GPR-01, GPR-03]
must_haves:
  truths:
    - "`upsert-pr {id}` creates the objective's PR once (draft, base = repo default branch, head = objective branch) and re-flushes are no-ops; it finds an existing PR by `prs[id].number`, else by `pulls?head=<owner>:<branch>&state=all`, before POSTing"
    - "The PR body's `closes` section has one `Closes #N` line per issue: the objective issue plus every mapping TRD entry (role trd) of that objective, derived at FLUSH time so gap-closure TRDs added later are included"
    - "The PR body carries a distinct marker `<!-- devflow:pr=<objId> -->` (never `devflow:id=`), so no objective/TRD id scan can mistake the PR for an issue; flusher scans skip records with `pull_request`"
    - "`mergeManaged(body, sections, id, {order, marker})` accepts a section order and a marker kind: with `{order: PR_SECTION_ORDER, marker: 'pr'}` it keeps `closes`/`wiki`/`summary`, writes and matches `<!-- devflow:pr=<id> -->`, and a PR body round-trips (merge of its own output is identical); with no options it is byte-identical to today (objective order, `devflow:id=` marker, refusal of a mismatched marker)"
    - "Human text in the PR description outside managed sections survives every update; a human edit inside a managed section halts the queue (D-24 body-hash model)"
    - "`title` is required only to create the PR; on an existing PR the handler never sends a title, so the remote (possibly human-renamed) title is kept — the `prs` map does not store titles"
    - "`upsert-pr` whose base is not the default branch halts with a message (closing keywords only fire on default-branch PRs)"
    - "A 422 `No commits between` on POST classifies as pending (retry), not a halt (Pitfall 1)"
    - "`pr-ready {id}` marks the PR ready via `markPullRequestReadyForReview`; already-ready is a no-op with zero writes"
    - "`patch-issue` accepts `labels_remove`; removing an absent label is a no-op"
    - "Every existing outbox and flusher test passes unchanged"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-body.cjs
      provides: "PR_SECTION_ORDER, prMarker, closesSection(numbers), buildPrBody, mergeManaged `{order, marker}` options"
    - path: plugins/devflow/devflow/bin/lib/gh-outbox.cjs
      provides: "OP_KINDS upsert-pr, pr-ready; patch-issue labels_remove"
    - path: plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs
      provides: "handleUpsertPr, handlePrReady, labels_remove in handlePatchIssue, PR base hash, 422-no-commits → pending"
  key_links:
    - "Uses 49-01 fake pulls routes + GraphQL ready; 49-02 getPr/setPr; consumed by 49-09 (start/sync), 49-11 (summary/verify hooks)"
---

# TRD 49-05: Outbox ops for the objective PR body and ready state

<objective>
Teach the outbox (the single GitHub writer) to create and maintain the one PR per objective — draft, closing every TRD, pinning the wiki
revision — and to mark it ready, plus `labels_remove` for TRD status. Every PR write inherits the outbox's pacing, offline queueing,
idempotent replay and remote-edit halts.

Purpose: GPR-01 (draft PR with `Closes #obj` and every TRD, pinned wiki revision), GPR-03 (PR marked ready; TRD label status).
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(49-05): ...`), then implementation (`feat(49-05): ...`).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- `gh-outbox.cjs` stays hook-cheap: node builtins + sync-state only; new `check()`s require nothing else.
- The flusher stays the only writer; all calls through `getJson`/`getList`/`sendJson`/`client.ghWrite`.
- Tests: `createFakeGitHub({...project.fakeOptions, viewer, refs})`, `client._setRunGh(fake.runGh)`, fake clock (`_setNow/_setSleep`),
  `_resetClient()` afterEach, `hermeticEnv()`, `makeStoreProject({store:true})`. Never real GitHub/`~/.claude`; never port 8080.

## Decisions

- **Op shapes** (exact keys; unknown keys rejected):
  - `upsert-pr`: target `{id}` (objective id); payload `{branch, base, title?, wiki?, summary?}` where `wiki` is the `buildWikiSection`
    args object and `summary` a short markdown string. `closes` is never in the payload: the handler derives it from the mapping.
    **Title (decision for the 49-11 refresh):** optional. Needed only on create (`gh pr start` passes it); a create without a title
    halts with `title needed to create the PR for objective <id>`. On an existing PR the title is never PATCHed, so the remote title
    (including a human rename) is kept and `prs` (49-02) does not store titles. 49-11 refreshes send `{branch, base}` from `prs[id]`
    and a section, no title.
  - `pr-ready`: target `{id}`; payload `{}`.
  - `patch-issue`: add optional `labels_remove: string[]`.
- **PR sections**: `PR_SECTION_ORDER = ['closes', 'wiki', 'summary']`, all optional; marker line `<!-- devflow:pr=<objId> -->` first.
  Today `mergeManaged` (L400) filters `sections` to `SECTION_ORDER + OPTIONAL_SECTIONS` (L405) and refuses a body whose marker is not
  `devflow:id=<cid>` (L428), so a PR body would lose `closes` and be refused. Add options `{order, marker}`: `order` replaces the
  section list (default today's), `marker: 'id'|'pr'` selects the marker line written and matched (default `'id'`). The marker parser
  learns `devflow:pr=` as a distinct kind. Defaults keep every existing call byte-identical.
- **Closes order**: objective issue first, then TRDs in id order (`toTrdId` sort, decimals honoured). Decision issues are NOT closed by the
  PR (they close when answered).
- **Remote edit**: PR base hash saved under key `pr:<objId>` with `saveBase`; the objective-body rule applies (managed-section change →
  halt; human-only change → merge and continue).
- **Base check**: handler reads `repos/{r}` `default_branch` once per flush (cached on ctx) and halts if `payload.base` differs.
- **Mapping**: on create/find, `setPr(m, id, {number, node_id, url})`.
- **Draft** is always true on create (draft PRs exist on every plan since 2025-05-01; no degraded mode).

## Test list

1. gh-body: `closesSection([120,121,122])` → three `Closes #N` lines; `buildPrBody({id:'49', sections})` starts with
   `<!-- devflow:pr=49 -->`; `mergeManaged` with PR sections keeps a human paragraph above and below.
1a. Round-trip: `mergeManaged(buildPrBody(x), x.sections, '49', {order: PR_SECTION_ORDER, marker:'pr'})` → identical body, `closes`
    kept; same call without options → refused (marker mismatch) exactly as today; a body with `devflow:pr=50` merged as `'49'` with
    `marker:'pr'` → refused.
1b. `mergeManaged` with no options on an objective body → byte-identical to today's output (existing gh-body tests are the guard).
2. gh-body: `findCommentsByMarker`/id-marker scans do not match `devflow:pr=49` as id 49.
3. outbox `validateOp`: valid upsert-pr/pr-ready accepted (with and without `title`); upsert-pr with `closes` in payload, missing branch, or unknown key rejected;
   `patch-issue` with `labels_remove:['devflow:in-progress']` accepted, with a non-array rejected.
4. Flush upsert-pr on a store project whose mapping has objective 49 (#100) and TRDs 49-01 (#101), 49-02 (#102); fake ref
   `df/objective-49-x` one commit ahead → one draft PR, body closes #100, #101, #102 in order; `prs['49'].number` and `node_id` set.
5. Re-flush the same op → zero writes. Clear `prs['49'].number` and flush again → PR found by head, no second PR.
6. Add TRD 49-03 (#103) to the mapping, enqueue upsert-pr again → PR body now closes #103; human paragraph preserved.
7. Human edits the `closes` section on the fake → next upsert-pr halts with a report naming the PR; human edits only outside → merged.
8. `payload.base:'release'` with default `main` → halt naming both branches.
9. Head ref equal to base tip → op stays pending (exit 3 semantics), not halted; after `pushRef` it creates the PR on the next flush.
9a. Create without `title` → halted with `title needed to create the PR`; refresh of an existing PR without `title` → body updated,
    title unchanged; after a human renames the PR on the fake, a refresh with a `title` in the payload still leaves the human title.
10. pr-ready on a draft → `isDraft:false`; second flush → zero writes.
11. patch-issue `labels_remove` on #101 carrying `devflow:in-progress` → removed; absent label → no write.
12. A flusher scan over all issues with the PR present does not resolve the PR as objective 49 or any TRD (records with `pull_request`
    are skipped).
13. Every existing gh-outbox and gh-outbox-flush test passes.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: PR body sections in gh-body; op schemas in gh-outbox (tests 1-3)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-body.cjs, plugins/devflow/devflow/bin/lib/gh-body.test.cjs, plugins/devflow/devflow/bin/lib/gh-outbox.cjs, plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs</files>
  <action>
RED: tests 1, 1a, 1b, 2, 3; commit `test(49-05): PR body sections and op schemas`.
GREEN: gh-body `PR_SECTION_ORDER`, `prMarker(id)`, `closesSection(numbers)`, `buildPrBody`, `mergeManaged` `{order, marker}` options
(defaults unchanged); make sure the id-marker regexes do not match `devflow:pr=`. gh-outbox `OP_KINDS['upsert-pr']`, `OP_KINDS['pr-ready']`, `labels_remove` in `patch-issue` (L194-214). Commit
`feat(49-05): PR body sections and PR op schemas`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-body.test.cjs plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs</verify>
  <done>Tests 1-3 pass; prior gh-body/gh-outbox tests unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Flusher handlers upsert-pr, pr-ready, labels_remove (tests 4-13)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs, plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs</files>
  <action>
RED: tests 4-12 (with 9a) in `describe('49-05 objective PR')`; commit `test(49-05): flusher upserts the objective PR`.
GREEN, in order:
1. `createContext` (L173): lazily cached `defaultBranch`, `repoNodeId`.
2. `handleUpsertPr(ctx, op)`: resolve objective issue number (mapping), derive TRD issue numbers for that objective (`role:'trd'`,
   excluding `-dK` decisions), find PR (mapping number → head lookup → POST draft), `mergeManaged(..., {order: PR_SECTION_ORDER, marker:'pr'})` + PATCH body only (never title) on change; POST requires `title`, `saveBase`
   key `pr:<id>`, `setPr`. Base mismatch → halt result.
3. `classifyFailure` (L86): 422 whose message contains `No commits between` → pending.
4. `handlePrReady`: GraphQL `markPullRequestReadyForReview(input:{pullRequestId})` with `prs[id].node_id`; skip when `draft === false`
   (read `pulls/{n}` first).
5. `handlePatchIssue`: `labels_remove` via `DELETE repos/{r}/issues/{n}/labels/{name}` only for labels present.
6. Any scan that lists issues without a label filter skips `pull_request` records.
Register both in `HANDLERS` (L1086); add `upsert-pr` to the refresh-base list (L1267) if PR bodies need refresh. Commit
`feat(49-05): flusher writes the objective PR`. Run the gh-* suite.
# CRITICAL: derive closes at flush, not enqueue — a TRD added after `gh pr start` must still close on merge.
# GOTCHA: send the PR body via stdin (`--input -`), like issue bodies, never as a `-f body=` argv (length and escaping).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs && node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'</verify>
  <done>Tests 4-13 pass; gh-* suite green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-outbox.cjs`: `ID_RE` L57, `OP_KINDS` L145 (`patch-issue` L194, `upsert-comment` L249 as the shape to copy), `validateOp` L302, `enqueue` L533, `BUDGET` L47.
- `gh-outbox-flush.cjs`: `classifyFailure` L86, `getJson/getList/sendJson` L131-160, `createContext` L173, `saveBase`/`remoteEditCheck` L353-378, `handlePatchIssue` ~L646, `HANDLERS` L1086, `executeOp` L1104, refresh list L1267.
- `gh-body.cjs`: `SECTION_ORDER` L32, `OPTIONAL_SECTIONS` L39, `commentMarker` L89, `mergeManaged` L400, `buildWikiSection` L523.
- `patch-body` `derive.trds` is the precedent for deriving TRD lists at flush time.
</codebase_examples>
<anti_patterns>
- `Closes #1, #2, #3` on one line: only #1 closes (Pitfall 4).
- Storing `closes` in the payload: stale the moment a gap-closure TRD is planned.
- `gh pr create` argv: returns a URL, not JSON; REST POST returns number/node_id/body for the mapping and base hash.
</anti_patterns>
<error_recovery>
- Do not copy `mergeManaged` into a PR variant; the options are the contract 49-11's refresh relies on.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs plugins/devflow/devflow/bin/lib/gh-body.test.cjs</test>
<regression>node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'</regression>
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs` green: no new spawn, flusher still the only writer.
</verification>

<success_criteria>
Enqueuing `upsert-pr` for an objective yields exactly one draft PR whose closing references equal the objective plus its TRD issues, kept
current as TRDs are added, and `pr-ready` flips it ready.
</success_criteria>

<output>
After completion, create `.planning/objectives/49-objective-branch-and-pr-lifecycle/49-05-SUMMARY.md`
</output>
