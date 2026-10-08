---
objective: 72-install-and-naming-cleanup
trd: "16"
type: standard
wave: 6
depends_on: ["72-07", "72-09", "72-11"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-rebrand-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-rebrand.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-rebrand.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/gh.cjs
  - plugins/aoforge/aoforge/bin/lib/help.cjs
  - plugins/aoforge/aoforge/bin/lib/flag-spec.cjs
autonomous: true
requirements: [INST-04]
must_haves:
  truths:
    - "`aof-tools gh rebrand` (dry run by default) reads one repository and prints every change it would make, grouped: legacy-namespace labels to rename (or merge when the AOForge label already exists), AOForge-managed issues and comments whose markers or legacy wording change (each with a line diff), wiki pages whose name or text changes, ruleset required-status contexts to switch, and local files to change (the managed caller workflow, a docs-backend directory); it writes nothing, local or remote"
    - "`aof-tools gh rebrand --apply` performs exactly the dry run's operations in a fixed order (labels, issue titles and bodies, comments, wiki, rulesets, local files), is idempotent (a second apply finds nothing to do), and stops at the first failed operation with a report of what was done and what is left (re-running resumes)"
    - "Only AOForge-managed issues and comments (those carrying an AOForge or legacy marker) are edited; user text outside managed sections changes only where it spells a legacy product name, and PRESERVE tokens never change"
    - "Local file changes (caller workflow renamed and rewritten with the new repo slug, workflow file, input name and current pin; `docs/<legacy>/` moved to `docs/aoforge/`) are left in the working tree with the exact commit steps printed for the project's mode (store mode: the linked-branch sequence from commit-steps.cjs); the verb never commits or pushes"
    - "`gh rebrand` is in help and flag-spec (`--apply`, `--dry-run`, `--repo`, `--raw`; unknown flags exit 1) and dispatches; flag-spec and dispatch-completeness repo tests pass"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/gh-rebrand.cjs
      provides: "snapshotRepo, planRebrand, renderPlan, applyRebrand"
      exports: ["snapshotRepo", "planRebrand", "renderPlan", "applyRebrand"]
    - path: plugins/aoforge/aoforge/bin/lib/gh-rebrand.legacy.test.cjs
      provides: "plan, dry-run CLI, apply order, idempotence, resume, local-file changes"
  key_links:
    - from: "gh-rebrand.cjs planRebrand"
      to: "legacy-rewrite.cjs rewriteLegacyNames + gh-body.cjs parsers"
      via: "wording rewrite with PRESERVE; markers via the dual-namespace parsers"
      pattern: "rewriteLegacyNames"
    - from: "gh-rebrand.cjs applyRebrand"
      to: "gh-client ghWrite"
      via: "PATCH label (new_name), PATCH issue/comment, wiki git push, PUT ruleset"
      pattern: "ghWrite"
---

# TRD 72-16: `aof-tools gh rebrand`: preview, then rename one repository's GitHub artefacts

<objective>
Store-mode repositories carry DevFlow names on GitHub: labels, hidden body markers, wiki text, required-check contexts,
the managed caller workflow and DevFlow wording in managed issues. 72-11 keeps them readable; this verb renames them,
outward-facing, so it previews everything with a dry run first and applies one repository at a time only when asked.
72-25 runs it per fleet repository behind a checkpoint.

Purpose: INST-04's GitHub store bulk rename.
Output: `gh-rebrand.cjs` and the `gh rebrand` verb.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-CONTEXT.md

Project kind `plugin`, work `feature`: TDD strict, test list first, hand-built fixtures (stubbed gh client; recorded
cassette shape), one test at a time. No live GitHub call in any test.

Read narrowly: `gh-client.cjs` (the `ghWrite`/`getJson` seam and its test setter), `gh-setup.cjs` (ruleset read/write
and label creation: reuse its request shapes), `gh-wiki.cjs` (clone, write, push path; `_setRunGit`), `gh-body.cjs`
section helpers (72-11 dual namespace), `legacy-rewrite.cjs` (72-09), `checks-pin.cjs` (72-11 `legacy` flag),
`commit-steps.cjs` (`branchCommitSteps`), how `gh` subcommands are dispatched (`rg -n "case 'setup'" plugins/aoforge/aoforge/bin/lib/gh.cjs`).
</context>

## Test list

**gh-rebrand.legacy.test.cjs** (snapshot built by the fixture, client stubbed)
1. CLI dry run: `aof-tools gh rebrand --repo o/r` (stub) prints sections Labels, Issues, Comments, Wiki, Rulesets,
   Local files, each with counts and diffs; exit 0; the stub recorded zero writes; `git status` of the local fixture is
   unchanged.
2. Labels: legacy `<ns>:objective` with no AOForge label -> op `rename`; legacy `<ns>:trd` when `aoforge:trd` exists ->
   op `merge` (add AOForge label to each issue, then delete the legacy label), marked destructive in the preview.
3. Issues: a managed issue with a legacy id marker, a legacy begin/end section and the legacy tracking line ->
   rewritten body (markers AOForge, wording AOForge, user text outside sections unchanged except legacy product names);
   a title "DevFlow doctor" -> "AOForge doctor"; an unmanaged issue mentioning DevFlow -> untouched; `devflowops` never
   changes.
4. Comments: a managed comment with legacy markers -> rewritten; an unmanaged comment -> untouched.
5. Wiki: a page whose text mentions the legacy product -> rewritten; page names change only if they contain a legacy
   name.
6. Rulesets: a ruleset requiring the legacy contexts -> op switches them to the AOForge contexts (both posted during the
   shim, so the switch is safe).
7. Local: a legacy caller workflow -> planned `git mv` to `aoforge.yml` with slug, workflow file, input name and the
   current pin; a `docs/<legacy>/` backend dir -> planned move to `docs/aoforge/`.
8. `--apply`: the stub sees operations in the fixed order; local files changed in the working tree (not committed); the
   printed commit steps match the project's mode.
9. `--apply` twice: the second plan is empty (`nothing to rebrand`).
10. Failure on the 3rd issue PATCH: apply stops, reports done/left, exit 1; re-running resumes from the remaining ops.
11. `--bogus` exits 1 (flag-spec); `--apply` together with `--dry-run` exits 1.

<embedded_context>

<codebase_examples>
Label rename keeps every issue association (GitHub REST):
`PATCH /repos/{owner}/{repo}/labels/{name}` with `{ "new_name": "aoforge:objective" }` (URL-encode the colon).
Ruleset update: `GET /repos/{owner}/{repo}/rulesets/{id}` then `PUT` the same document with the
`required_status_checks` contexts switched.
</codebase_examples>

<anti_patterns>
- Never apply without `--apply`; the default is the dry run.
- Never touch unmanaged issues' text, never close/reopen anything, never delete a label without first moving every
  issue onto the AOForge label.
- Never commit or push the local file changes; print the steps.
- No live calls in tests; no generated fixture data.
</anti_patterns>

<error_recovery>
- Secondary rate limit (403/429 with retry-after): stop with the remaining ops reported and the wait time; never loop.
- An uninitialised or disabled wiki: report and skip the Wiki section (gh-wiki's classification).
- No admin permission for rulesets: report the Rulesets section as `needs admin` and continue with the rest.
</error_recovery>

</embedded_context>

<gotchas>
- 72-07 already added `state rekey` to help.cjs and flag-spec.cjs; add `gh rebrand` beside the other `gh` entries.
- Live runtime is DevFlow 2.15.0: commit with `node ~/.claude/devflow/bin/df-tools.cjs commit`. Never port 8080.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builder: a legacy store-mode repository snapshot</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-rebrand-fixtures.cjs</files>
  <action>
`legacyRepoSnapshot({ withAoforgeLabels = [] })` -> typed-out JSON for labels, three managed issues (objective, TRD,
todo) using 72-11's `legacy-gh-fixtures.cjs` bodies, one unmanaged issue, comments, two wiki pages, one ruleset with the
legacy contexts; `stubClient(snapshot, { failAt })` recording writes; `localRepo({ store })` (git repo with a legacy
caller workflow from `legacyCaller()` and a `docs/<legacy>/Project.md`). Check with `node -e`. Commit
(`test(72-16): legacy store repo snapshot`).
  </action>
  <verify>node -e "const f=require('./plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-rebrand-fixtures.cjs');console.log(Object.keys(f.legacyRepoSnapshot()))"</verify>
  <done>Snapshot, stub client and local repo builders exist.</done>
  <recovery>Reuse cassette shapes from `__fixtures__/gh-cassettes/` for the JSON field names.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Plan and dry run</name>
  <files>plugins/aoforge/aoforge/bin/lib/gh-rebrand.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/gh-rebrand.cjs, plugins/aoforge/aoforge/bin/lib/gh.cjs, plugins/aoforge/aoforge/bin/lib/help.cjs, plugins/aoforge/aoforge/bin/lib/flag-spec.cjs</files>
  <action>
RED: tests 1-7 and 11. Run: fail. Commit RED.

GREEN: `snapshotRepo(client, repo)`, `planRebrand(snapshot, local)` -> `{ ops: [{ section, kind, target, before,
after, destructive }] }`, `renderPlan(plan)` (sections, counts, line diffs via `legacy-rewrite.unifiedDiff`); dispatch
`gh rebrand` in gh.cjs; help entry ("Preview, then rename one repository's DevFlow-era GitHub artefacts to AOForge;
dry run by default"); flag-spec entry. Commit GREEN.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/gh-rebrand.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/flag-spec.repo.test.cjs plugins/aoforge/aoforge/bin/lib/dispatch-completeness.test.cjs</verify>
  <done>Tests 1-7 and 11 pass; flag-spec and dispatch-completeness pass.</done>
  <recovery>If `gh` subcommands need `requireEnabled(cwd)`, the dry run still requires a configured repo or `--repo`.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Apply, idempotence and resume</name>
  <files>plugins/aoforge/aoforge/bin/lib/gh-rebrand.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/gh-rebrand.cjs</files>
  <action>
RED: tests 8-10. Run: fail. Commit RED.

GREEN: `applyRebrand(plan, { client, root, mode })` executing ops in section order; local ops via `git mv` and file
writes; stop-on-failure report `{ done, left, error }` with exit 1; idempotence falls out of re-planning from a fresh
snapshot. Print the commit steps (commit-steps.cjs) after local changes. Run all gh suites and the full suite. Commit
GREEN.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/gh-rebrand.legacy.test.cjs && node --test plugins/aoforge/aoforge/bin/lib/gh-*.test.cjs</verify>
  <done>Tests 1-11 pass; gh suites pass; full suite at baseline.</done>
  <recovery>If a merge-label op needs many issue writes, page them and count them in the report so a stop mid-merge
resumes cleanly.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'</test>
</validation_gates>

<verification>
- `node plugins/aoforge/aoforge/bin/aof-tools.cjs gh rebrand --help` (or `help gh`) documents the verb.
- In a fixture repo, the dry run writes nothing (stub writes = 0, git status unchanged).
</verification>

<success_criteria>
- A store-mode repository can be rebranded completely, after a full preview, one repository at a time, safely
  re-runnable.
</success_criteria>

<output>
After completion, create `.planning/objectives/72-install-and-naming-cleanup/72-16-SUMMARY.md` through
`df-tools summary post`.
</output>
