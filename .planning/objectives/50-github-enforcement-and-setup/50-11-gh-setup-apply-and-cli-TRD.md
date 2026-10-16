---
objective: 50-github-enforcement-and-setup
trd: "11"
type: standard
wave: 3
depends_on: ["50-09", "50-10"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-setup.cjs
  - plugins/devflow/devflow/bin/lib/gh-setup-apply.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs
  - plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
  - plugins/devflow/devflow/templates/config.json
autonomous: true
requirements: [GEN-04]
must_haves:
  truths:
    - "`df-tools gh setup` (no flag) is a dry-run: prints the plan with exact payloads, exits 0, and the fake records zero writes"
    - "`df-tools gh setup --apply` creates the ruleset, labels, types, fields, repo settings and local workflow/PR-template files; a second `--apply` makes zero GitHub writes and changes no file (idempotent, SC2)"
    - "A 422 on the merge_queue rule retries the ruleset without it, records the fact, reports 'merge queue unavailable on this plan', and does not fail the run"
    - "A 422 on a single_select field with options retries it as `text` and reports the degradation; a 403 on org types/fields is a skip with the degraded note; a 403 on a repo-level action fails the run (exit 1) after the remaining actions are attempted"
    - "With `github.enabled` false the command prints skipped, exits 0 and makes zero gh calls; it does NOT require `github.store`"
    - "`gh setup` is dispatched, listed in the 'Unknown gh subcommand' list and in help; dispatch-completeness and help tests pass"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-setup.cjs
      provides: "applySetup(root, actions, deps) + renderTemplates(cfg, version)"
    - path: plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs
      provides: "cmdGhSetup(cwd, args, raw): --apply, --refresh, --require-wiki, --raw"
    - path: plugins/devflow/devflow/templates/config.json
      provides: "github.app_id (\"\"), github.checks_workflow (\"\")"
  key_links:
    - "Plans from 50-09, templates from 50-10, fake routes from 50-01; SC2 e2e in 50-12"
---

# TRD 50-11: `df-tools gh setup` apply and command (GEN-04)

<objective>
Turn the 50-09 plan into a command: dry-run by default, `--apply` executes each action through gh-client (paced), writes the local
files into the working tree, degrades per action, and is idempotent.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(50-11): ...`), then implementation (`feat(50-11): ...`).
- Writes only through `gh-client.ghWrite` with the action's `request` argv/input (what the dry-run printed is what is sent).
- Tests: temp project dirs, the 50-01 fake via `_setRunGh`, `DEVFLOW_GH_CACHE_DIR` temp; CLI tests spawn df-tools with the gh PATH shim
  or call `cmdGhSetup` in-process with the fake (follow `gh-pr-cli.test.cjs`). Never the real `~/.claude` or GitHub.

## Decisions

- **Enablement**: `gh setup` needs `github.enabled` + `github.repo` (`client.requireEnabled(cwd)`), not store mode — a repository can be
  set up before store mode is turned on. Disabled → `skipped`, exit 0, zero gh calls (same as every other gh verb).
- **Exit codes**: 0 dry-run or applied (degradations and advisories included); 1 when any repo-level action failed, a local file is a
  `conflict`, or `--require-wiki` and the wiki is not ready. Output via gh-store-cli's `result(EXIT.x, payload, text)` + `emit`.
- **Local files** are written to the working tree, never committed; the summary tells the user to commit them on a branch and open a
  PR (`df-tools commit --files .github/workflows/devflow.yml .github/pull_request_template.md`). `conflict` files are never touched.
- **Templates**: `renderTemplates(cfg, version)` reads `templates/github/devflow.yml` and `pull_request_template.md` relative to
  `__dirname` (`../../templates/github/`), substitutes `{{checks_workflow}}` (config `github.checks_workflow`, default
  `AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml@v<plugin version>`) and `{{devflow_ref}}` (`v<plugin version>`,
  from package/plugin.json version the way other modules read it).
- **Config template**: add `"app_id": ""` and `"checks_workflow": ""` under `github` in templates/config.json (empty = default/unpinned);
  `config-get github.app_id` returns `""`.
- **Merge queue 422**: retry the same POST/PUT without the `merge_queue` rule; on success write `{merge_queue:false, at}` to the setup
  record (`<DEVFLOW_GH_CACHE_DIR>/setup/<owner>__<repo>.json`) so the next plan omits it; `--refresh` deletes the record first.
- **Field 422** with options: retry once with `data_type:'text'` and no options; report "field <name> created as text: single-select
  options were not accepted". 403/404 on org endpoints → `skip` "needs an organization owner; DevFlow uses labels and body metadata".
- Order: the plan's order; every action is attempted even after a failure; the report lists each action's outcome.

## Test list

1. Dry-run on a bare Organization fake → exit 0, output contains the ruleset JSON, the five type names and both field names; writes 0.
2. `--apply` → fake has the ruleset (with merge_queue), labels, types, fields (with header), `has_wiki`/`delete_branch_on_merge` true;
   `.github/workflows/devflow.yml` and `.github/pull_request_template.md` exist with placeholders substituted.
3. Second `--apply` → zero new fake writes; both local files byte-identical (SC2 idempotency).
4. `mergeQueueAllowed:false` → first apply exits 0 with "merge queue unavailable"; ruleset stored without merge_queue; a second apply
   makes zero writes; `--refresh --apply` tries merge_queue again (one 422, still exit 0).
5. `fieldOptionsAccepted:false` → field created as text, advisory printed, exit 0.
6. `orgAdmin:false` → types/fields skipped with the degraded note, exit 0; `isAdmin:false` → ruleset fails 403, labels/files still
   attempted, exit 1.
7. Existing unmanaged `.github/workflows/devflow.yml` → `conflict`, file untouched, exit 1.
8. `github.enabled:false` → skipped, exit 0, zero calls (throwing seam).
9. `df-tools gh nope` error lists `setup`; `help` includes the `gh setup` usage; dispatch-completeness passes.
10. `config-get github.app_id` → `""`.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: applySetup and templates (tests 2-7)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-setup.cjs, plugins/devflow/devflow/bin/lib/gh-setup-apply.test.cjs</files>
  <action>
RED: tests 2-7 calling `readSetupState` → `planSetup` → `applySetup` in-process (new test file to keep 50-09's file stable); commit
`test(50-11): apply repository setup`.
GREEN: `renderTemplates`, `applySetup(root, actions, {now})` returning `{ok, outcomes:[{kind, target, status, error?, note?}]}` with the
422/403 handling and setup record writes. Commit `feat(50-11): apply the setup plan idempotently with per-action degradation`.
# GOTCHA: pass `-H 'X-GitHub-Api-Version: 2026-03-10'` only on issue-field requests (it is part of the planned `request`).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-setup-apply.test.cjs plugins/devflow/devflow/bin/lib/gh-setup.test.cjs</verify>
  <done>Tests 2-7 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: CLI, dispatch, help, config template (tests 1, 8-10)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs, plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs, plugins/devflow/devflow/bin/df-tools.cjs, plugins/devflow/devflow/bin/lib/help.cjs, plugins/devflow/devflow/templates/config.json</files>
  <action>
RED: tests 1, 8-10; commit `test(50-11): gh setup command`.
GREEN: `cmdGhSetup(cwd, args, raw)`; in df-tools.cjs `case 'gh'` add `else if (subcommand === 'setup')` with a usage comment
(`df-tools gh setup [--apply] [--refresh] [--require-wiki] [--raw]`, exit codes) and append `setup` to the "Unknown gh subcommand" list;
extend the `gh` usage string in help.cjs L317; add the two config keys. Commit `feat(50-11): df-tools gh setup (dry-run by default)`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/config.test.cjs plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</verify>
  <done>Tests 1, 8-10 pass; dispatch, help, config and seam tests green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `df-tools.cjs` `case 'gh'` L1088-1134 (dispatch chain and the error list at L1133).
- `gh-store-cli.cjs` `EXIT` L35, `emit` L55, `result(...)`; `gh-pr-cli.cjs` for a recent CLI module + test in this style.
- `gh-client.cjs` `requireEnabled` L404, `ghWrite` L285, `classify`/HTTP status extraction used by gh-capability `httpStatus` L53.
- `help.cjs` L317 gh usage string.
</codebase_examples>
<anti_patterns>
- Committing the written workflow/PR template (the user does that through a PR).
- Aborting the whole apply on the first failure (report every action).
- Requiring store mode for setup.
</anti_patterns>
<error_recovery>
- If dispatch-completeness parses comments for usage, match the exact comment form used by the `pr` branch.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-setup-apply.test.cjs plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/config.test.cjs plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</regression>
</validation_gates>

<verification>
- SC2: tests 1 (dry-run lists exact payloads) and 3 (second apply writes nothing).
</verification>

<success_criteria>
One command shows and then applies everything a repository needs for DevFlow enforcement, safely re-runnable and degradation-aware.
</success_criteria>

<output>
After completion, create `.planning/objectives/50-github-enforcement-and-setup/50-11-SUMMARY.md`
</output>
