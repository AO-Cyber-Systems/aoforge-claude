---
objective: 46-github-sync-foundations
trd: "10"
type: standard
wave: 6
depends_on: ["46-08", "46-09"]
files_modified:
  - plugins/devflow/devflow/workflows/execute-objective.md
  - plugins/devflow/devflow/bin/lib/execute-objective-gh-sync.test.cjs
  - plugins/devflow/devflow/bin/lib/df-tools-deprecations.repo.test.cjs
  - plugins/devflow/skills/gh-sync/SKILL.md
  - plugins/devflow/devflow/workflows/new-project.md
  - plugins/devflow/agents/verifier.md
  - plugins/devflow/devflow/templates/objective.md
  - CLAUDE.md
  - docs/USER-GUIDE.md
  - CHANGELOG.md
autonomous: true
requirements: [GSF-03, GSF-01, GSF-02, GSF-04, GSF-05, GSF-06, GSF-07, GSF-08]
must_haves:
  truths:
    - "The post-execute sync step in `workflows/execute-objective.md` calls `gh sync \"${OBJECTIVE_DIR}\"` (the objective directory), not `${OBJECTIVE_NUMBER}`"
    - "That step has no `2>/dev/null` and no `github_issue` grep gate: GitHub disabled → the command reports `skipped` and exits 0; any failure prints a WARNING with the command's own output and the retry command, without aborting completion"
    - "Run against a fixture project with the gh PATH shim, the extracted step is quiet on success/skip and prints the failure text on failure (success criterion 5)"
    - "`df-tools gh sync <dir>` as a real process exits 0 on success, 0 on skipped, 1 on failure with JSON on stderr"
    - "No live skill, agent, workflow, template or reference instructs `gh sync-objectives` except as a deprecated alias (CI guard driven by `DF_TOOLS_DEPRECATIONS`)"
    - "The verifier posts verification comments with `--kind verification`; the gh-sync skill, new-project workflow, objective template, CLAUDE.md, USER-GUIDE and CHANGELOG `[Unreleased]` describe the new surface"
    - "`npm test` is green apart from the known environmental MA-7 failure (success criterion 6)"
  artifacts:
    - path: plugins/devflow/devflow/workflows/execute-objective.md
      provides: "rewritten 'Auto-push to GitHub' step"
    - path: plugins/devflow/devflow/bin/lib/execute-objective-gh-sync.test.cjs
      provides: "static check of the step, shim-driven run of the extracted bash, CLI exit codes"
    - path: plugins/devflow/devflow/bin/lib/df-tools-deprecations.repo.test.cjs
      provides: "CI guard: live prose uses current df-tools gh subcommands"
  key_links:
    - "The step test extracts the fenced bash block under 'Auto-push to GitHub' and runs it with bash, HOME pointed at a temp dir whose `.claude/devflow/bin` symlinks to the repo's `plugins/devflow/devflow/bin`, and the gh shim (46-01) first on PATH"
    - "df-tools-deprecations.repo.test.cjs reads skill-route.DF_TOOLS_DEPRECATIONS (46-08), the single rename source"
---

# TRD 46-10: Post-execute sync reports failures; docs, deprecation guard, changelog, full test run (GSF-03 + docs)

<objective>
1. Fix the post-execute GitHub push in `workflows/execute-objective.md`: pass the objective directory,
   stop discarding stderr, drop the `github_issue` gate (sync now creates the issue; a disabled
   integration is a clean `skipped`), and print a non-blocking warning on failure. Prove it by running
   the extracted step against a fixture with the gh shim (defect 3; success criterion 5).
2. Bring every piece of prose that drives or describes the sync in line with the new surface, add a CI
   guard so `gh sync-objectives` does not creep back into live instructions, and record the change in
   CHANGELOG `[Unreleased]`.
3. Run the whole suite (success criterion 6).
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD for tasks 1-2: commit the failing test first, then the workflow/prose change. Commit via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Spawned processes get `HOME=<tmp>/home` and the shim env from `installGhShim(...).env()`; never the real `~/.claude`, never real GitHub, never port 8080.
- In execute-objective.md only the sync step changes. CLAUDE.md edits stay inside the two named bullets (the file is resident every turn — keep additions short). Plain declaratives, no hype.
- Do not bump versions; CHANGELOG goes under `## [Unreleased]` only. Document nothing from objectives 47–51 as present.
- Read the 46-07, 46-08 and 46-09 SUMMARYs for the final command shapes before writing docs.

<embedded_context>

<codebase_examples>
Current step (execute-objective.md ~998-1009):
````markdown
**Auto-push to GitHub (TRD 18-02):**

Push state to the linked GitHub issue when the objective has one. Skipped silently when OBJECTIVE.md is absent or has no `github_issue` field. Auth failures emit a warning with remediation but don't abort.

```bash
OBJECTIVE_MD=".planning/objectives/${OBJECTIVE_DIR}/OBJECTIVE.md"
if [[ -f "$OBJECTIVE_MD" ]] && grep -qE '^github_issue:' "$OBJECTIVE_MD" 2>/dev/null; then
  node ~/.claude/devflow/bin/df-tools.cjs gh sync "${OBJECTIVE_NUMBER}" 2>/dev/null || {
    echo "Note: gh sync skipped for objective ${OBJECTIVE_NUMBER} (CLI failed; check 'gh auth status' if persistent); continuing."
  }
fi
```
````
Target step:
````markdown
**Auto-push to GitHub (objective 46, GSF-03):**

Push the objective's state to its GitHub issue (created on first sync). When `github.enabled` is not true the command reports `skipped` and exits 0. A failure never blocks completion, but it is shown, never swallowed.

```bash
if SYNC_OUT=$(node ~/.claude/devflow/bin/df-tools.cjs gh sync "${OBJECTIVE_DIR}" 2>&1); then
  :
else
  echo "WARNING: GitHub sync failed for objective ${OBJECTIVE_DIR} (completion continues):"
  printf '%s\n' "$SYNC_OUT" | head -40
  echo "Retry: node ~/.claude/devflow/bin/df-tools.cjs gh sync ${OBJECTIVE_DIR}"
fi
```
````
Confirm with `rg -n "OBJECTIVE_DIR" plugins/devflow/devflow/workflows/execute-objective.md` that `OBJECTIVE_DIR` is the bare directory name (the current step builds `.planning/objectives/${OBJECTIVE_DIR}/OBJECTIVE.md` from it). If it is a path, pass `$(basename "$OBJECTIVE_DIR")`.

Prose to update (verified at planning time):
- `plugins/devflow/skills/gh-sync/SKILL.md`: modes `objectives|release <tag>|status|<objective_id>`; bash runs `gh sync-objectives`; context says single-objective sync "requires … `github_issue` … run `objectives` mode first"; sticky marker `<!-- df:state -->`.
  New: empty args / `objectives` → `gh sync --all`; `<objective>` (any spelling) → `gh sync <objective>`; first sync creates the issue and writes `github_issue`; `<!-- devflow:id=N -->` + `devflow:begin/end` sections, text outside them preserved; legacy `<!-- df:state -->` comments adopted in place; a pre-46 issue gets managed sections appended below its old generated text once (edit it away by hand if wanted); lost mapping → just re-run `gh sync --all`; writes ≥ 1 s apart, secondary limits retried. Step 3's commit also adds changed `OBJECTIVE.md` files. `argument-hint`: `[<objective>|--all|objectives|release <tag>|status]`.
- `plugins/devflow/devflow/workflows/new-project.md:1109-1121`: `gh sync-objectives` → `gh sync --all`; keep the mapping commit and add `.planning/objectives/*/OBJECTIVE.md`; milestone bullet → "Uses each objective's `milestone:` (else the ROADMAP `## Milestones` current entry)".
- `plugins/devflow/agents/verifier.md:853-857`: `gh comment "$OBJECTIVE_NUM" "@file:$VERIFICATION_PATH"` → add `--kind verification`.
- `plugins/devflow/devflow/templates/objective.md:87`: "auto-populated by `df:gh-sync` when missing (v1.2 — for now, set manually)" → "written by `df-tools gh sync` on first sync; a differing value you set is kept and reported".
- `CLAUDE.md`: the `**GitHub integration**` bullet and one sentence in the `**Upgrade**` bullet (migration 0009, auto: converts `.planning/.gh-mapping.json` to v3 and normalises `.gh-sync-state.json` keys).
- `docs/USER-GUIDE.md`: `### GitHub Integration (1.29+)` (~397) and `## GitHub integration` (~657).
</codebase_examples>

<anti_patterns>
- Any `2>/dev/null` on the sync line, or `|| true` that hides output; re-adding a `github_issue` gate; making the failure abort completion.
- Removing every mention of `sync-objectives`: the alias exists and is documented once as deprecated.
- Rewriting unrelated sections of USER-GUIDE/CLAUDE.md.
</anti_patterns>

<error_recovery>
- Bash extraction: anchor on the heading text `**Auto-push to GitHub` and take the first ```bash fence after it; fail with a clear message if not found.
- If `npm test` shows failures other than MA-7, identify the owning TRD; fix here only if caused by prose (e.g. doc-refs); otherwise stop and report the failing test and suspected TRD in the SUMMARY.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/workflows/execute-objective.md
@plugins/devflow/devflow/bin/lib/__fixtures__/gh-shim.cjs
@plugins/devflow/skills/gh-sync/SKILL.md
</context>

## Test list

`execute-objective-gh-sync.test.cjs`
1. Static: the step's bash block contains `gh sync "${OBJECTIVE_DIR}"`, not `OBJECTIVE_NUMBER`.
2. Static: no line of the block containing `gh sync` contains `2>/dev/null`; no `grep -qE '^github_issue:'`.
3. Static: the block prints `WARNING` and the captured output on failure.
4. Run (`bash -c <block>`, `OBJECTIVE_DIR=02-a`, cwd = temp project, env = shim env + fake HOME with the bin symlink): `github.enabled:false` → exit 0, no `WARNING`, shim `readCalls()` empty.
5. Run: enabled, shim `auth status` → exit 1 `You are not logged into any GitHub hosts.` → stdout has `WARNING`, the auth text and `Retry:`; block exit 0.
6. Run: enabled, canned success table (`--version`; `auth status` with `Token scopes: 'repo'`; `issue list` → `[]`; `label create`; `api repos/o/r/milestones` → `{"number":1}`; `issue create` → `https://github.com/o/r/issues/1`;
   `api --paginate --slurp repos/o/r/issues/1/comments` → `[[]]`; `api repos/o/r/issues/1/comments` → `{"id":5}`) → no `WARNING`; `02-a/OBJECTIVE.md` has `github_issue: o/r#1`.
7-9. CLI (`node <repo>/plugins/devflow/devflow/bin/df-tools.cjs --cwd <tmp> gh sync 02-a`): success → exit 0; failing auth → exit 1 with JSON `error` on stderr; disabled → exit 0 with `skipped:true`.

`df-tools-deprecations.repo.test.cjs`
10. For each key of `DF_TOOLS_DEPRECATIONS`, scan `plugins/devflow/skills/**/*.md`, `plugins/devflow/agents/*.md`, `plugins/devflow/devflow/workflows/*.md` (skip `status: legacy`), `plugins/devflow/devflow/templates/**/*.md`, `plugins/devflow/devflow/references/*.md`: every line containing the old form also contains `deprecated` (case-insensitive); report `file:line`.
11. Every value of `DF_TOOLS_DEPRECATIONS` names a live subcommand: help.cjs HELP_TABLE `gh` usage mentions `sync` and `--all`.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Post-execute sync step — failing tests, then the workflow rewrite (tests 1-9)</name>
  <files>plugins/devflow/devflow/bin/lib/execute-objective-gh-sync.test.cjs, plugins/devflow/devflow/workflows/execute-objective.md</files>
  <action>
RED: write tests 1-9. Fixture: `fs.mkdtempSync` root with `home/.claude/devflow/bin` → `fs.symlinkSync(<repo>/plugins/devflow/devflow/bin, ...)` (resolve `<repo>` from `__dirname`),
`.planning/config.json`, `.planning/ROADMAP.md` (`## Milestones` + `### Objective 2: a`), `.planning/objectives/02-a/OBJECTIVE.md` (`milestone: v1.4`).
Expected against today's step: 1-3 and 5 fail; 7-9 pass (guards for 46-08). Commit RED `test(46-10): post-execute gh sync step reports failures`.
GREEN: replace only the heading, prose paragraph and bash block of the "Auto-push to GitHub" step with the target step. `git diff --stat` shows one small hunk.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/execute-objective-gh-sync.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs</verify>
  <done>Tests 1-9 pass; doc-refs repo test green.</done>
  <recovery>If test 6 needs more canned entries, read `readCalls()` from the failing run and add the missing entries to the table; never loosen assertions.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Deprecation guard (RED), then skill / workflow / agent / template prose (GREEN) (tests 10-11)</name>
  <files>plugins/devflow/devflow/bin/lib/df-tools-deprecations.repo.test.cjs, plugins/devflow/skills/gh-sync/SKILL.md, plugins/devflow/devflow/workflows/new-project.md, plugins/devflow/agents/verifier.md, plugins/devflow/devflow/templates/objective.md</files>
  <action>
RED: tests 10-11; test 10 fails on `skills/gh-sync/SKILL.md` and `workflows/new-project.md`. Commit RED.
GREEN: update the four prose files per the codebase example. Mention once in SKILL.md that `gh sync-objectives` is a deprecated alias of `gh sync --all`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/df-tools-deprecations.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs</verify>
  <done>Guard and doc-refs green; `rg -n "gh sync-objectives" plugins/devflow --glob '*.md'` shows only lines marked deprecated.</done>
</task>

<task type="auto">
  <name>Task 3: CLAUDE.md, USER-GUIDE, CHANGELOG [Unreleased]; full test run</name>
  <files>CLAUDE.md, docs/USER-GUIDE.md, CHANGELOG.md</files>
  <action>
- CLAUDE.md GitHub integration bullet (one or two sentences): `gh sync [<objective>|--all]` (alias `sync-objectives` deprecated), `comment`, `close-issue`, `pull`, `resolve`, `status`, `sync-release`; mapping v3 keyed by objective id with `devflow:id` markers and managed body sections; every gh call through `lib/gh-client.cjs` (writes ≥ 1 s apart, secondary-limit retry, `github.enabled` gate, exit 1 on failure); modules `gh-client|gh-mapping|gh-body|gh-issue|gh-project|gh-milestone.cjs`; project fields discovered via GraphQL and cached under `~/.claude/devflow/state/gh-project/` (override `DEVFLOW_GH_CACHE_DIR`). Upgrade bullet: the migration 0009 sentence.
- USER-GUIDE: both GitHub sections, same facts, plus the one-time legacy-body append and lost-mapping recovery (re-run `gh sync --all`).
- CHANGELOG `## [Unreleased]`: `### Fixed` (mapping shapes/keys; post-execute sync argument and hidden errors; `github_issue` write-back; milestone resolution; body overwrite of human edits; fixture-backed project fields; no rate limiting / first comment page only; `enabled` ignored; exit codes), `### Changed` (`gh sync --all`; managed body sections; `devflow:id` markers), `### Deprecated` (`gh sync-objectives`), `### Added` (migration 0009). Follow the `[2.12.0]` entry's formatting.
- Run `npm test`; record pass/fail counts in the SUMMARY. The only accepted failure is `MA-7 doctl auth init` (handoff-e2e.test.cjs).
  </action>
  <verify>npm test 2>&1 | tail -30</verify>
  <done>Docs updated; `npm test` fails only on MA-7 (or passes entirely).</done>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `rg -n 'gh sync' plugins/devflow/devflow/workflows/execute-objective.md` → the new line only, no `2>/dev/null` on it.
- `rg -n "sync-objectives" CLAUDE.md docs/USER-GUIDE.md plugins/devflow --glob '*.md'` → each hit says deprecated.
- `git diff --stat CLAUDE.md` shows a small change confined to two bullets.
- `npm test`: failures == 0, or exactly MA-7.
</verification>

<success_criteria>
The post-execute push runs for every objective and a failure is visible (SC5); users and agents are told the new surface; the suite is green (SC6).
</success_criteria>

<output>
After completion, create `.planning/objectives/46-github-sync-foundations/46-10-SUMMARY.md`
</output>
