---
objective: 54-codeql-cleanup
trd: "09"
type: standard
wave: 3
depends_on: ["54-01", "54-02", "54-03", "54-04", "54-05", "54-06", "54-07", "54-08"]
files_modified:
  - CHANGELOG.md
autonomous: true
requirements: ["54-A", "54-B", "54-C", "54-E", "54-F", "54-G", "54-H"]
codeql_alerts: []
must_haves:
  truths:
    - "CHANGELOG.md `## [Unreleased]` has a `### Security` and a `### Fixed` subsection describing objective 54's fixes by group, with the user-visible corrections (+build versions, decimal and out-of-order objective matching, Requirements lookup crash, table cells, config-set refusal) in Fixed"
    - "Full `npm test` passes except the known environmental MA-7 failure (handoff-e2e doctl); the pass count is at least the pre-objective baseline plus the tests added by 54-01..54-08"
    - "Every per-group static audit (listed in Task 2) reports clean on the tree that is pushed"
    - "The branch feat/stack-profile-loader is pushed to origin with all objective-54 commits; nothing is merged, tagged or released"
  artifacts:
    - path: CHANGELOG.md
      provides: "[Unreleased] Security + Fixed entries for objective 54"
  key_links:
    - "pushed branch -> TRD 54-10 (CodeQL analysis on a PR ref, then alert 95 dismissal)"
---

# TRD 54-09: CHANGELOG, full suite, static audit, push

<objective>
Close the implementation side of objective 54. Record the changes under `[Unreleased]`, prove the whole suite is green apart from
MA-7, check every alert's source pattern is gone, and push the branch so TRD 54-10 can get a CodeQL analysis.

Push is approved by the orchestrator for this verification. Merge, tag and release are NOT: release is a separate approval
(OBJECTIVE.md, Success).
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- No production or test code changes in this TRD. If the suite or an audit fails, stop and report which TRD's area failed. Do not
  patch it here (gap closure goes through `/devflow:plan-objective 54 --gaps`).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(54-09): changelog for objective 54 CodeQL cleanup" --files CHANGELOG.md`.
- One plain command per Bash call (worktree guard). Run the audits below one at a time.
- No `git merge`, `git tag`, `gh pr merge` or `gh release`.

## Test list

No new tests. Gates: full `npm test` and the static audits.

<embedded_context>

<codebase_examples>
CHANGELOG.md today:

```markdown
## [Unreleased]

## [2.13.0] - 2026-10-04
### Added
...
```

Subsection order used in this file: Added, Changed, Fixed, Deprecated, Removed. Put `### Fixed` then `### Security` under
`[Unreleased]`. Draft. Adjust wording to what the SUMMARYs actually record, and drop a bullet whose TRD changed course:

```markdown
## [Unreleased]
### Fixed
- Objective-number matching in `roadmap analyze`, `workstreams analyze/reconcile`, `objective remove/complete` and the
  detectors no longer confuses `1` with `12` or `4.1` with `4.10`/`401` (shared `objectiveNumPattern`, `lib/text-escape.cjs`).
- `objective complete` reads the Requirements line from the objective's own ROADMAP section and no longer throws when that line
  is free text (requirement IDs are escaped).
- `changelog check` finds SemVer entries with build metadata (`1.0.0+build.1`).
- OBJECTIVE.md bootstrap takes the name and goal from the right heading for decimal objectives and no longer borrows the next
  section's goal.
- ADOPT-REPORT.md and STACK-REPORT.md table cells escape backslashes before pipes, once, at render; the ADOPT high-confidence table
  has a valid three-column delimiter.

### Security
- `config-set` refuses `__proto__`, `constructor` and `prototype` key segments (prototype pollution, CodeQL alert 89).
- Regexes built from objective numbers and versions escape every metacharacter through one helper (CodeQL js/regex-injection,
  js/incomplete-sanitization).
- `stack init` notes neutralise every HTML comment terminator, including `--!>` (js/bad-tag-filter).
- The unit-suite and agent-shell-harness workflows run with a read-only `GITHUB_TOKEN` (`contents: read`), and a repo test
  requires every workflow to declare its permissions.
- Tests spawn df-tools with `execFileSync`/argv instead of shell strings (js/shell-command-injection-from-environment).
```
</codebase_examples>

<anti_patterns>
- Do not create a `## [2.13.1]` (or any version) heading. That is the release step and needs separate approval.
- Do not run `df-tools changelog update --version ...`. It writes a versioned entry.
- Do not use `git push --force`. The branch is ahead of origin with normal commits.
</anti_patterns>

<error_recovery>
- If `npm test` shows a failure other than MA-7, re-run that file alone with `node --test <file>`. If it fails alone, report it as
  a gap with the owning TRD (map the file to files_modified in 54-01..54-08). If it passes alone, it is flaky under parallel load:
  run the full suite once more and record both runs.
- If the push is rejected (non-fast-forward), stop and report. Do not rebase or force without the user.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: CHANGELOG [Unreleased] Fixed + Security entries for objective 54</name>
  <files>CHANGELOG.md</files>
  <action>
Read the eight SUMMARYs (`.planning/objectives/54-codeql-cleanup/54-0{1..8}-SUMMARY.md`) for what actually shipped. Write the
`### Fixed` and `### Security` subsections under `## [Unreleased]` (draft in codebase_examples), one bullet per user-visible change,
plain declaratives, no alert-number lists beyond the single config-set reference. Commit with the command in Binding rules.
  </action>
  <verify>node plugins/devflow/devflow/bin/df-tools.cjs changelog check Unreleased 2>&1 | tail -3; sed -n '/## \[Unreleased\]/,/## \[2.13.0\]/p' CHANGELOG.md</verify>
  <done>`[Unreleased]` contains `### Fixed` and `### Security` with the objective-54 bullets; `## [2.13.0]` and everything below it are byte-identical (`git diff CHANGELOG.md` shows additions only, above `## [2.13.0]`).</done>
</task>

<task type="auto">
  <name>Task 2: Full suite, per-group static audits, push the branch</name>
  <files>(none modified; verification and push only)</files>
  <action>
1. Full suite: `npm test 2>&1 | tail -40`. Accept only the MA-7 failure (`plugins/devflow/devflow/bin/handoff-e2e.test.cjs`, doctl
   environment). Record the pass/fail/skip totals in the SUMMARY.
2. Static audits. Run each as its own Bash call from the repo root. Each must print nothing unless noted:
   - A, first-dot escapes: `rg -n "replace\('\.'" plugins/devflow/devflow/bin/lib/objective.cjs plugins/devflow/devflow/bin/lib/roadmap.cjs plugins/devflow/devflow/bin/lib/workstreams.cjs`
   - A, dot-only escapes: `rg -n "replace\(/\\\\\./g, '\\\\\\\\\.'" plugins/devflow/devflow/bin/lib plugins/devflow/hooks`
     (a result in an unrelated file is acceptable only if it is not a RegExp source; list it in the SUMMARY)
   - A, unescaped bootstrap: `rg -n "Objective \\$\{objectiveNum\}" plugins/devflow/devflow/bin/lib/project-bootstrap.cjs`
   - A, one helper: `rg -n "function escapeRegE?x" plugins/devflow --glob '!*.test.*'` (prints only `lib/text-escape.cjs`)
   - B: `rg -n "replace\(/\\\\\|/g" plugins/devflow/devflow/bin/lib/adopt.cjs plugins/devflow/devflow/bin/lib/stack-report.cjs`
   - C: `rg -n "replace\(/-->/g" plugins/devflow/devflow/bin/lib/stack-profile.cjs`
   - D: `rg -n "dismissed as \"won't fix\"" plugins/devflow/devflow/bin/lib/handoff.cjs` (prints one line)
   - E: `rg -n "__proto__" plugins/devflow/devflow/bin/lib/config.cjs` (prints the reserved-segment set)
   - F: `rg -n "^permissions:" .github/workflows/test.yml .github/workflows/agent-shell-harness.yml` (prints two lines)
   - G: `rg -n "node \\$\{(DF_TOOLS|dfTools)\}|sh', \['-c', cmd" plugins/devflow/devflow/bin/lib/api-contract.test.cjs plugins/devflow/devflow/bin/lib/decision-queue.test.cjs plugins/devflow/devflow/bin/lib/flutter-ui-dogfood.test.cjs plugins/devflow/devflow/bin/lib/flutter-ui-eval-dogfood.test.cjs plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.test.cjs plugins/devflow/devflow/bin/lib/flutter-ui-scope.test.cjs plugins/devflow/devflow/bin/lib/project-hygiene.test.cjs plugins/devflow/devflow/bin/lib/ui-spec-cli.test.cjs plugins/devflow/devflow/bin/lib/verifier-ui-eval-invocation.test.cjs`
   - H: `rg -n "replace\('<testcase name=\"E\"|ENGINE_VERSION\.replace" scripts/ci-unit-gate.test.cjs plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs`
3. `git status --short` shows no uncommitted change to tracked source files (the pre-existing untracked `.gitkeep`/docs files from
   before the objective are fine).
4. Push: `git push origin feat/stack-profile-loader`. Record the pushed head SHA (`git rev-parse HEAD`) in the SUMMARY. TRD 54-10
   uses it.
  </action>
  <verify>git log origin/feat/stack-profile-loader -1 --format=%H</verify>
  <done>npm test: only MA-7 fails. Every audit is clean (or prints exactly the noted expected lines). `git log origin/feat/stack-profile-loader -1 --format=%H` equals `git rev-parse HEAD`.</done>
  <recovery>If an audit is not clean, do not push. Report the file and line with the owning TRD, and stop.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `npm test` totals recorded; only MA-7 fails.
- All ten audits clean as specified.
- origin/feat/stack-profile-loader == local HEAD; no tag created (`git tag --points-at HEAD` prints nothing new).
</verification>

<success_criteria>
The objective's fixes are recorded in `[Unreleased]`, proven by the full suite and by source audits, and pushed for CodeQL
analysis. No release artefact is created.
</success_criteria>

<output>
After completion, create `.planning/objectives/54-codeql-cleanup/54-09-SUMMARY.md` via `df-tools summary post`. Include the pushed
SHA and the npm test totals.
</output>
