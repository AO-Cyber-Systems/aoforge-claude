---
objective: 46-github-sync-foundations
trd: "05"
type: standard
wave: 2
depends_on: ["46-01", "46-02", "46-03"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-milestone.cjs
  - plugins/devflow/devflow/bin/lib/gh-milestone.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-issue.cjs
  - plugins/devflow/devflow/bin/lib/gh-issue.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
  - plugins/devflow/devflow/bin/lib/gh-fake.test.cjs
autonomous: true
requirements: [GSF-01, GSF-02, GSF-05]
must_haves:
  truths:
    - "The issue for an objective is found in this order: mapping entry (verified by one `issue view`) → OBJECTIVE.md `github_issue` → marker scan → `[Objective N]` title scan → create; only the last step creates"
    - "With `.gh-mapping.json` deleted, resolving objectives whose issues already exist performs zero `issue create` calls (success criterion 2)"
    - "Two issues carrying the same `devflow:id` stop resolution with a `duplicate_marker` error naming both numbers; nothing is picked silently"
    - "A mapping entry whose issue carries a different id is re-keyed to that id (or moved to conflicts when that id is taken) and resolution continues for the requested id"
    - "An id listed in mapping `conflicts` returns `needs_human` and performs no GitHub writes"
    - "The marker scan runs once per run (one `issue list` call for any number of objectives)"
    - "The milestone title comes from gh-milestone; its number is cached in mapping `milestones[title]`; a changed milestone uses a different key; none resolved → issue created without `--milestone` plus a warning"
    - "Every gh call goes through gh-client (`ghRead`/`ghWrite`/`ghPaginate`)"
    - "The milestone for an objective comes from its OBJECTIVE.md `milestone:` first, then `roadmap.getMilestoneInfo(cwd)` only when ROADMAP has a `## Milestones` section, else none: never the first `vX.Y` anywhere in ROADMAP, never a `v1.0` default"
    - "Milestone title = `milestone_prefix` + version without its leading `v` (prefix `v` + `v1.4` → `v1.4`)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-milestone.cjs
      provides: "normaliseVersion, milestoneTitle, resolveObjectiveMilestone(cwd, objDir, prefix) -> {title|null, version|null, source:'objective'|'roadmap'|'none', warning?}"
    - path: plugins/devflow/devflow/bin/lib/gh-issue.cjs
      provides: "createRunContext, ensureObjectiveLabel, ensureMilestone, scanObjectiveIssues, verifyIssue, findOrCreateObjectiveIssue, parseIssueUrl"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
      provides: "createFakeGitHub({repo, scopes}) -> {runGh, issues, comments, milestones, labels, calls(), writes(), failNext(match, response), humanEditBody(n, body)}"
  key_links:
    - "46-07 syncObjective calls createRunContext + findOrCreateObjectiveIssue, then merges the body with gh-body and writes back github_issue"
    - "46-09 e2e reuses gh-fake as the single stateful fake for push → pull"
---

# TRD 46-05: Find-or-create objective issues without duplicates; current milestone (GSF-02, GSF-01, GSF-05)

<objective>
Create `lib/gh-issue.cjs`: given a resolved objective (`{id, dir, roadmapNumber}` from gh-mapping),
find its GitHub issue through mapping → frontmatter → marker scan → title scan, creating only when all
four miss; ensure the objective label and the objective's milestone once per run. The milestone comes
from a new `lib/gh-milestone.cjs` resolver (objective frontmatter, then the ROADMAP `## Milestones` list).
Also create the stateful fake GitHub used by every later test in this objective.

Purpose: GSF-02's "lost mapping never recreates issues", GSF-01's verification of migrated entries
(locked: verify by marker, add it if missing — the marker itself is written by 46-07's body merge),
and GSF-05 (defect 5: milestone was the first `vX.Y` in ROADMAP — `v1.1` in this repo while objective 46
declares `milestone: v1.4` — and `milestone_id` was cached forever; now a title-keyed cache).
Output: `gh-milestone.cjs`, `gh-issue.cjs`, `__fixtures__/gh-fake.cjs`, tests.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── gh-milestone.cjs          ← CREATE
├── gh-milestone.test.cjs     ← CREATE
├── gh-issue.cjs              ← CREATE
├── gh-issue.test.cjs         ← CREATE
├── gh-fake.test.cjs          ← CREATE
└── __fixtures__/
    └── gh-fake.cjs           ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit before GREEN. Commit via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Inject the fake with `require('./gh-client.cjs')._setRunGh(fake.runGh)`, a fake clock/sleep via `_setNow`/`_setSleep`, and `_resetClient()` after each test. No real GitHub, no real `~/.claude`, never port 8080.
- Hand-built fixtures (temp projects, the fake's seed issues). No property-based tests, no `.feature` files.
- Research reference: `46-RESEARCH.md` → "Pattern 4: Marker lookup", "Pattern 6: Current milestone", "Pattern 2" (milestones map), "Migration mechanics" items 4-5, Pitfalls 9-11, "End-to-end push -> pull" (fake GitHub argv list).

<embedded_context>

<codebase_examples>
Existing conventions to keep (gh.cjs `cmdGhSyncObjectives`, 721-846):
- Label: `(labels && labels.objective) || 'devflow:objective'`, created with
  `['label','create', L, '--repo', R, '--color','0e8a16','--description','DevFlow objective tracking']` (non-zero on "already exists" → treat as success).
- Title: `` `[Objective ${number}] ${name}` `` (use the ROADMAP number / id and the ROADMAP or dir name).
- Create: `['issue','create','--repo',R,'--title',T,'--body',B,'--label',L]` + `['--milestone', title]` (TITLE, not number). stdout is the issue URL.
- Milestone create: `['api', `repos/${R}/milestones`, '-f', `title=${T}`, '-f', `description=DevFlow milestone for ${project}`]`;
  on failure look it up by title in `repos/${R}/milestones?state=all` (now via `ghPaginate`).

gh-client (46-01): `ghRead(args)`, `ghWrite(args)`, `ghPaginate(path)`, `requireEnabled(cwd)`.
gh-mapping (46-02): `readMappingV3WithReport(cwd)`, `getEntry/setEntry`, mapping `milestones`, `conflicts`.
gh-body (46-03): `extractMarker`, `indexByMarker`, `parseTitleNumber`.
gh-milestone (this TRD, Task 2): `resolveObjectiveMilestone(cwd, dir, prefix)`.

Milestone source to reuse, not rewrite: `roadmap.getMilestoneInfo(cwd)` (roadmap.cjs:68, exported) → `{version:'v1.3', name}` from the
`## Milestones` bullets (🚧, then "in progress/current", then highest ✅, then lowest 📋). Its legacy fallback (no `## Milestones`
section) still returns the first `vX.Y` or `'v1.0'`; `parseMilestoneBullets`/`pickMilestone` are not exported and roadmap.cjs is not in
this TRD's files — so only trust `getMilestoneInfo` when ROADMAP contains `^## Milestones`. Title rule today
(`cmdGhSyncObjectives`): `` `${prefix || 'v'}${version.replace(/^v/, '')}` `` — keep. Do not read STATE.md prose or state.json for the milestone.
</codebase_examples>

<anti_patterns>
- GitHub search (`gh search issues`, `--search`) for markers: HTML comments are probably not indexed and search lags. List-and-scan only.
- One `issue list` per objective. Scan once per run context and reuse.
- Creating on any ambiguity. Duplicates, conflicts and wrong-repo refs are errors/warnings, never a create.
- Writing the mapping file from this module. It mutates the in-memory `runCtx.mapping`; the caller (46-07) persists once.
</anti_patterns>

<error_recovery>
- `issue view` of a mapped number returns "Could not resolve to an issue" → drop the mapping entry in memory (warning `mapped issue #N not found`) and continue the chain.
- `issue create` fails mentioning milestone → delete `mapping.milestones[title]`, re-run `ensureMilestone` once, retry the create once.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/46-github-sync-foundations/46-RESEARCH.md
@plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs
</context>

<gotchas>
- `gh issue list --json body` returns full bodies; `--limit 1000` with the label filter keeps it bounded. Title fallback only considers issues with NO marker.
- Frontmatter `github_issue` of a different repo than `runCtx.repo` → warning `github_issue points at another repo`, skip that step.
- A mapped issue with no marker and no parseable title is accepted with `needs_marker:true` (locked decision: add the marker — 46-07 does it via mergeManaged).
- Record provenance: `source` ∈ `mapping|frontmatter|marker|title|created`.
</gotchas>

## Test list

Fake GitHub (`gh-fake.test.cjs`) — keep the fake honest before relying on it
1. `issue create` returns `https://github.com/o/r/issues/<n>` and stores `{number, title, body, labels, milestone, state:'OPEN', updatedAt}`; numbers increment from 1.
2. `issue view N --repo o/r --json number,title,body,state,updatedAt,labels,assignees,milestone` returns the stored issue (only requested keys); unknown N → ok:false `Could not resolve to an issue`.
3. `issue list --repo o/r --label L --state all --limit 1000 --json number,title,body` returns matching issues.
4. `issue edit N --repo o/r --body B` mutates body and advances `updatedAt`; `issue comment N --repo o/r --body B`, `issue close N --repo o/r [--comment C]` recorded.
5. `api --paginate --slurp repos/o/r/issues/N/comments` returns `[[...page1], [...page2]]` with page size 30 (so tests can place a comment on page 2); `api -X PATCH repos/o/r/issues/comments/ID -f body=B` edits; `api repos/o/r/issues/N/comments -f body=B` creates.
6. Milestones: `api repos/o/r/milestones -f title=T ...` creates (422 `already_exists` on duplicate title); `api --paginate --slurp repos/o/r/milestones?state=all` lists.
7. `label create` (second time → exit 1 `already exists`), `auth status` (stdout includes `Token scopes: 'repo', 'project', 'read:project'` or the scopes passed in), `--version`.
8. `failNext(matchFn, response)` makes the next matching call return `response` once; `calls()` / `writes()` (via gh-client `isWriteArgs`) list argv arrays; `humanEditBody(n, body)` edits without recording a DevFlow call.

gh-milestone (`gh-milestone.test.cjs`, temp dirs, no gh calls)
M1. OBJECTIVE.md `milestone: v1.4`, ROADMAP `## Milestones` bullets resolving to v1.3 → `{title:'v1.4', version:'v1.4', source:'objective'}`.
M2. No `milestone:`, ROADMAP `## Milestones` with a 🚧 `v2.0` bullet and prose mentioning `v1.1` earlier → `v2.0`, source `roadmap`.
M3. No `milestone:`, ROADMAP without `## Milestones` but `v1.1` in prose → `{title:null, source:'none', warning:/no milestone/}`.
M4. Prefix `M-` + `v1.4` → `M-1.4`; prefix `v` → `v1.4`; `milestone: 1.4` (no v) → `v1.4`.
M5. Objective dir null (ROADMAP-only objective) → falls through to roadmap/none.

gh-issue (`gh-issue.test.cjs`, temp project with config `github:{enabled:true, repo:'o/r'}`, objectives `02-a` (milestone v1.4) and `02.1-b`)
9. Mapping entry `"2"→#1` whose body has `devflow:id=2` → `{source:'mapping', issue_number:1, created:false}`; one `issue view`, zero writes.
10. Empty mapping, OBJECTIVE.md `github_issue: o/r#1` → `source:'frontmatter'`.
11. Empty mapping, no frontmatter, fake issue #1 with marker `devflow:id=2` → `source:'marker'`; resolving `2` and `2.1` performs ONE `issue list`.
12. Empty mapping, unmarked fake issue `[Objective 2.1] b` → `source:'title'`, `needs_marker:true`.
13. Nothing matches → `issue create` with title `[Objective 2] a`, label, `--milestone v1.4`; `source:'created'`; `created:true`.
14. **Lost mapping (SC2 at module level):** seed fake with marked #1 (id 2) and #2 (id 2.1); empty mapping and no frontmatter refs → resolving both creates nothing (`writes()` has no `issue create`).
15. Duplicate marker: #1 and #3 both `devflow:id=2` → `{ok:false, error:'duplicate_marker', issues:[1,3]}`.
16. Mapping `"2"→#2` where #2's marker says `2.1` → entry moved to `"2.1"` in `runCtx.mapping`, resolution for `2` continues (marker scan / create); warning recorded.
17. `conflicts["2"]` present → `{ok:false, error:'needs_human'}`, zero calls.
18. Mapped issue not found → entry dropped, chain continues.
19. `ensureObjectiveLabel` twice in one run → one `label create` call; "already exists" treated as ok.
20. `ensureMilestone(runCtx,'v1.4')` on empty cache → one create, `mapping.milestones['v1.4'] = N`; second call → zero calls; create → 422 → found via paginated list; a different title `v1.5` → separate key.
21. No milestone resolved (ROADMAP without `## Milestones`, no `milestone:`) → create without `--milestone`, warning present, never `v1.0`.
22. Every call recorded by the fake came through gh-client (assert by installing the fake ONLY via `gh-client._setRunGh`).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Stateful fake GitHub fixture (tests 1-8)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs, plugins/devflow/devflow/bin/lib/gh-fake.test.cjs</files>
  <action>
RED: tests 1-8. Commit RED.

GREEN: `createFakeGitHub({ repo = 'o/r', scopes = ['repo','project','read:project'], commentPageSize = 30 })`.
`runGh(args)` parses argv with a small dispatcher keyed on `args[0]`/`args[1]` and flags (`--repo`, `--title`, `--body`, `--label`,
`--milestone`, `--json`, `--comment`, `-X`, `-f`, `--paginate`, `--slurp`). Return `{ok, status, stdout, stderr}`.
Unknown shapes → `{ok:false, status:1, stderr:'[gh-fake] unsupported: ' + args.join(' ')}` so gaps are loud.
Header comment: hand-built fixture, no network; extend here (not in tests) when later TRDs need new argv shapes; later TRDs (46-07, 46-08, 46-09) may extend it.
`updatedAt` is an ISO string from an internal counter clock, advancing 1 s per mutation.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs</verify>
  <done>Tests 1-8 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Milestone resolver, run context, label and milestone cache (tests M1-M5, 19-21)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-milestone.cjs, plugins/devflow/devflow/bin/lib/gh-milestone.test.cjs, plugins/devflow/devflow/bin/lib/gh-issue.cjs, plugins/devflow/devflow/bin/lib/gh-issue.test.cjs</files>
  <action>
RED: tests M1-M5 and 19-21. Commit RED.

GREEN:
- `gh-milestone.cjs`: `normaliseVersion(v)` → `'v' + String(v).trim().replace(/^v/i, '')` when it matches `/^v?\d+(\.\d+)+$/`, else null;
  `milestoneTitle(prefix, version)`; `resolveObjectiveMilestone(cwd, objDir, prefix)`: (1) OBJECTIVE.md `milestone` → source `objective`;
  (2) ROADMAP has `^## Milestones` → `roadmap.getMilestoneInfo(cwd).version` → source `roadmap`; (3) `{title:null, version:null, source:'none', warning:'no milestone resolved; issue created without one'}`.
- `createRunContext(cwd)` → `requireEnabled(cwd)`; skipped → return it. Else `{cwd, repo, label, prefix, mapping, conflicts, warnings:[], _scan:null, _labelEnsured:false, projectName}`
  (`projectName` from PROJECT.md first `# ` heading or repo name).
- `ensureObjectiveLabel(runCtx)` (once).
- `ensureMilestone(runCtx, title)` → number|null (cache hit, create, 422 → paginated lookup). Title null → null.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-milestone.test.cjs plugins/devflow/devflow/bin/lib/gh-issue.test.cjs</verify>
  <done>Tests M1-M5 and 19-21 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: findOrCreateObjectiveIssue resolution chain (tests 9-18, 22)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-issue.cjs, plugins/devflow/devflow/bin/lib/gh-issue.test.cjs</files>
  <action>
RED: tests 9-18 and 22. Commit RED.

GREEN: `findOrCreateObjectiveIssue(runCtx, resolved, { name, createBody })` → `{ok, issue_number, source, created, needs_marker, body, title, warnings}` or `{ok:false, error, ...}`.
Approach:
1. `runCtx.conflicts[id]` → needs_human (no calls).
2. Mapping entry → `verifyIssue(runCtx, n)` (`issue view n --repo R --json number,title,body,state`).
   marker id === id → hit. marker id !== id → re-key (move to that id if free, else push to conflicts), continue.
   no marker: title id === id or unparseable → hit with `needs_marker:true`; title id !== id → re-key as above.
3. OBJECTIVE.md `github_issue` (same repo) → verify the same way.
4. `scanObjectiveIssues(runCtx)` (cached): `issue list ... --json number,title,body` → `indexByMarker`; duplicates for id → error; hit → `source:'marker'`.
5. Title scan among `unmarked` issues: exactly one `[Objective <id>]` match → `source:'title', needs_marker:true`; more than one → `duplicate_title` error.
6. Create: `ensureObjectiveLabel`, `resolveObjectiveMilestone` → `ensureMilestone`, `issue create` with `createBody` (already carries the marker —
   caller builds it via gh-body), `parseIssueUrl(stdout)`; add the new issue to the scan cache so a later objective in the same run cannot re-find it wrongly.
7. On every hit, `setEntry(runCtx.mapping, id, {issue_id, state_comment_id: existing||null, verified_at: existing||null})`.
# CRITICAL: only step 6 may call `issue create`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-issue.test.cjs</verify>
  <done>Tests 9-22 pass; test 14 asserts zero `issue create` writes.</done>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs plugins/devflow/devflow/bin/lib/gh-milestone.test.cjs plugins/devflow/devflow/bin/lib/gh-issue.test.cjs</test>
</validation_gates>

<verification>
- `rg -n "spawnSync|require\('child_process'\)" plugins/devflow/devflow/bin/lib/gh-issue.cjs` → no matches.
- `rg -n "search" plugins/devflow/devflow/bin/lib/gh-issue.cjs` → no gh search usage.
- `rg -n -F 'match(/v(' plugins/devflow/devflow/bin/lib/gh-milestone.cjs` → no matches (no first-`vX.Y` regex).
</verification>

<success_criteria>
A lost mapping resolves to existing issues with zero creates; duplicates and conflicts stop for a human.
</success_criteria>

<output>
After completion, create `.planning/objectives/46-github-sync-foundations/46-05-SUMMARY.md`
</output>
