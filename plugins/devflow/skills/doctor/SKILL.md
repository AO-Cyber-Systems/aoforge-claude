---
name: doctor
description: |
  Diagnose and safely repair DevFlow environment problems: a stale runtime mirror, runtime state
  committed or left untracked inside a repo, pending migrations, stale markers, guard state,
  awareness cache and backups, hook registry drift, and out-of-date model ids. Read-only by
  default; `--fix` applies only safe, reversible repairs.
  Use when DevFlow behaves oddly, after a plugin update, or when a repo shows .planning runtime
  files changing.
  Triggers on: "devflow doctor", "diagnose devflow", "devflow is broken", "fix my devflow setup"
argument-hint: "[--fix] [--global] [path]"
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
---

<objective>
Run the DevFlow doctor against the project at [path] (default: the current directory, walking up to
the nearest `.planning/`) and the global install under `~/.claude`, then present what it found.
`--global` limits the run to the global checks.

The doctor checks the runtime mirror against the installed plugin, the plugin cache and hook
registry, model ids, runtime state that leaked into a repo (including nested `.planning/` dirs),
pending migrations, `validate health`, stale skill markers, progress-guard state, the awareness
cache and backup retention.

It is read-only by default. `--fix` applies only the fixes each check marks safe and reversible,
then re-runs every check. It refuses the index-changing fix (untracking runtime state) while
unrelated changes are staged, and it never commits: the commit is a separate `df-tools commit`
step. Plugin cache directories are report-only. The doctor never deletes them.
</objective>

<process>
This skill only calls `df-tools doctor` and `df-tools commit`. It does not re-implement any check
and does not read git state itself.

1. **Run the report.** Build the command from $ARGUMENTS: pass `--global` through, and pass a
   path argument as `--path <path>`. Do NOT pass `--fix` yet.

   `node ~/.claude/devflow/bin/df-tools.cjs doctor --json [--global] [--path <path>]`

2. **Present the findings.** Render a compact table with one row per check:
   `id | severity | finding | fixable`. Show errors first, then warnings, then ok checks in one
   line. Under the table, list every check that is not fixable but carries a `fix_command`,
   quoting that command verbatim. Give the `summary` counts and the overall `status`.

3. **Decide whether to fix.**
   - `--fix` appeared in $ARGUMENTS: run the same command with `--fix` added (still with `--json`).
   - Otherwise, when `summary.fixable` is greater than 0, ask with AskUserQuestion whether to apply
     the fixable repairs, naming each fixable check. Apply only on a yes. In yolo mode
     (`node ~/.claude/devflow/bin/df-tools.cjs config-get mode` prints `yolo`) apply without asking.
   - When `summary.fixable` is 0, or the user declines, do not run `--fix`.
   A bare invocation never applies a fix on its own.

4. **Commit a legacy-runtime-state or pending-migrations fix.** Both fixes leave changed files and
   print the commit for them. If the `--fix` report has a `fixes` entry for `legacy-runtime-state`
   (check 20) or `pending-migrations` (check 21) with `applied: true`, handle each entry the same way:
   - Local mode: its `notes` contain a line
     `commit with: node ~/.claude/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. Run that
     exact command with the Bash tool.
   - Store mode (`github.store: true`): the notes hold a multi-line sequence instead, because
     `df-tools commit` refuses the default branch there. Its branch is `devflow-untrack-runtime-state`
     for check 20 and `devflow-upgrade` for check 21. Run its `git switch -c` line and its
     `DEVFLOW_SKIP_GH_GATE=1 ... commit` line, then show the user the push and pull-request steps
     and the last line (`or, on an objective's linked branch ...`), the route that needs no escape.
   Never use raw `git commit`. When the notes say `nothing to commit (working files only)`, there is
   nothing to commit. When the entry has `refused`, report the reason and the manual command; do not
   work around the guard.

5. **Report the outcome.** Show the post-fix report (the `checks` in the `--fix` output are the
   post-fix results), list which fixes were applied or refused and any `backup` path, then list the
   remaining manual actions, each with its `fix_command`.
</process>
