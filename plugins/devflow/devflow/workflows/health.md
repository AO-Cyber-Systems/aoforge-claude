---
status: active
---
<purpose>
Validate `.planning/` directory integrity and report actionable issues. Checks for missing files, invalid configurations, inconsistent state, and orphaned jobs. Optionally repairs auto-fixable issues.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="parse_args">
**Parse arguments:**

Check if `--repair` flag is present in the command arguments.

```
REPAIR_FLAG=""
if arguments contain "--repair"; then
  REPAIR_FLAG="--repair"
fi
```

`--migrate` means **run the upgrade flow**: after the health check, the `migrate` step
below brings the project forward to the running DevFlow version with `df-tools upgrade`
(automatic migrations, then the confirm migrations the user accepts, then a commit).
It does not change which flags are passed to `validate health` itself. It still
triggers the stack-profile offer in `offer_repair` whenever a Check 12 issue (I030,
W030, W031, E030) is present — a migration is exactly when a project is likely to
still be running on the general profile.

```
MIGRATE_FLAG=""
if arguments contain "--migrate"; then
  MIGRATE_FLAG="--migrate"
fi
```
</step>

<step name="run_health_check">
**Run health validation:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs validate health $REPAIR_FLAG
```

Parse JSON output:
- `status`: "healthy" | "degraded" | "broken"
- `errors[]`: Critical issues (code, message, fix, repairable)
- `warnings[]`: Non-critical issues
- `info[]`: Informational notes
- `engine`: `{ running, mirror, installed, main }` — engine-lag row (`running` = the version the invoked df-tools reports; `mirror` = `~/.claude/devflow/.plugin-version`; `installed` = plugin-registry version; `main` = `origin/main`; any may be `null` when unknown)
- `repairable_count`: Number of auto-fixable issues
- `repairs_performed[]`: Actions taken if --repair was used
</step>

<step name="format_output">
**Format and display results:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DevFlow Health Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Status: HEALTHY | DEGRADED | BROKEN
Engine: running <r> · mirror <m> · installed <i> · main <n>
Errors: N | Warnings: N | Info: N
```

(`Engine:` prints each `engine` field; substitute `n/a` for any `null`.)

**If repairs were performed:**
```
## Repairs Performed

- ✓ config.json: Created with defaults
- ✓ STATE.md: Regenerated from roadmap
```

**If errors exist:**
```
## Errors

- [E001] config.json: JSON parse error at line 5
  Fix: Run /devflow:status check --repair to reset to defaults

- [E002] PROJECT.md not found
  Fix: Run /devflow:new-project to create
```

**If warnings exist:**
```
## Warnings

- [W001] STATE.md references objective 5, but only objectives 1-3 exist
  Fix: Run /devflow:status check --repair to regenerate

- [W005] Objective directory "1-setup" doesn't follow NN-name format
  Fix: Rename to match pattern (e.g., 01-setup)

- [W040] project-behind: stamped never, DevFlow v2.10.1; 5 pending, 1 need confirmation
  Fix: Run `df-tools upgrade --apply` (or /devflow:status check --migrate)
```

W040 is listed like any other warning. It is never auto-repaired by `--repair`: the
migrations are the repair. `upgrade-check-not-available: …` means the upgrade check
itself could not run — show it, never treat it as a pass.

**If info exists:**
```
## Info

- [I001] 02-implementation/02-01-JOB.md has no SUMMARY.md
  Note: May be in progress
```

**Footer (if repairable issues exist and --repair was NOT used):**
```
---
N issues can be auto-repaired. Run: /devflow:status check --repair
```

**Footer (if W040 is present and --migrate was NOT used):**
```
This project is behind DevFlow. Run: /devflow:status check --migrate
```
</step>

<step name="migrate">
**Only when `--migrate` was passed.** Runs after the health check, before `offer_repair`.

1. **Check.** Run:

   ```bash
   node ~/.claude/devflow/bin/df-tools.cjs upgrade --check
   ```

   If the output says `Unknown command` (an older mirror without `upgrade`), tell the
   user the installed DevFlow predates `df-tools upgrade`, fall back to the old
   behaviour (the stack-profile offer in `offer_repair` only), and skip the rest of
   this step. If it exits 1 with `not a DevFlow project`, report that and stop.

2. **Show the plan.** From the JSON, list `pending` (automatic: `id`, `title`,
   `reason`) and `pending_confirm` (needs the user: `id`, `title`, `reason`), plus
   `from` → `to`. If `up_to_date` is true, say "Project is up to date (v<to>)" and go
   to step 6. If `failed` is non-empty, show each `id`/`phase`/`error` and stop — a
   check that could not run is never treated as nothing to do.

3. **Automatic migrations.** If `pending` is non-empty, ask:

   ```
   Apply N automatic migrations? (a backup is taken outside the repo first)
   ```

   On yes:

   ```bash
   node ~/.claude/devflow/bin/df-tools.cjs upgrade --apply
   ```

   Show `applied` (ids), `changed_files` and `backup`. A non-zero exit means a
   migration failed: show `failed`, point at `backup`, and stop (nothing later ran).
   On no, skip to step 4 anyway — confirm migrations are independent.

4. **Confirm migrations.** For each entry in `pending_confirm`, one at a time:
   - **0006** (project kind / default work): ask the user to choose `kind` —
     `api | app | library | ui-lib | cli | plugin` — and a default `work` —
     `feature | port | refactor | foundation | bugfix | prototype | spike`. Never
     guess the kind. Then run:

     ```bash
     node ~/.claude/devflow/bin/df-tools.cjs upgrade --apply --only 0006 --kind <kind> --default-work <work>
     ```

     (Omit `--default-work <work>` if the user declines to pick one.)
   - **0011** (GitHub store backfill): describe the backfill from its `reason` (the
     objective and TRD counts, the history closes and the GitHub request estimate),
     then ask with three options: **Migrate now** / **Not now** / **Keep mirror mode**
     ("don't ask again"). Never apply 0011 inline here.
     - **Migrate now:** hand off to `/devflow:gh-sync migrate`, which shows the full
       plan, asks for approval, applies, drains and prints the commit steps.
     - **Not now:** leave it pending.
     - **Keep mirror mode:** record the decision in the tracked config, then include
       `.planning/config.json` in step 5's commit:

       ```bash
       node ~/.claude/devflow/bin/df-tools.cjs config-set github.mirror_only true
       ```

       0011 is then skipped while the store is off, so W040 stops reporting it.
   - **Any other id:** describe it using its `title` and `reason`, ask, and on yes run
     `node ~/.claude/devflow/bin/df-tools.cjs upgrade --apply --only <id>`.

   Declined migrations stay pending; W040 will keep reporting them, except 0011 when
   mirror mode is kept.

5. **Commit.** Collect the union of `changed_files` from every apply run above and
   commit exactly those paths:

   ```bash
   node ~/.claude/devflow/bin/df-tools.cjs commit "chore(devflow): upgrade project to v<to>" --files <changed_files…>
   ```

   If commit signing fails or hangs, report it and stop — never bypass signing. Then
   re-run `node ~/.claude/devflow/bin/df-tools.cjs validate health` so `offer_repair`
   works from the upgraded project (the migrations already did what W008/W009/W003
   repairs would).

   **Store mode.** If `node ~/.claude/devflow/bin/df-tools.cjs planning mode` prints
   `store` and the commit is refused (`default_branch` or `unlinked_branch`), commit
   through a pull request: create a branch, commit with the logged escape (it is
   recorded as gate gh), push it and open a pull request:

   ```bash
   git switch -c devflow-upgrade
   DEVFLOW_SKIP_GH_GATE=1 DEVFLOW_SKIP_GH_GATE_REASON="DevFlow upgrade" node ~/.claude/devflow/bin/df-tools.cjs commit "chore(devflow): upgrade project to v<to>" --files <changed_files…>
   git push -u origin devflow-upgrade
   ```

   Then open a pull request for `devflow-upgrade`. Or, on an objective's linked branch
   (from `node ~/.claude/devflow/bin/df-tools.cjs gh pr start <objective>`), run the
   plain commit there. This is the same sequence doctor check 21 prints.

6. **Stack profile.** Continue to `offer_repair`, which makes the existing
   stack-profile offer whenever `--migrate` is passed.
</step>

<step name="offer_repair">
**If repairable issues exist and --repair was NOT used:**

Ask user if they want to run repairs:

```
Would you like to run /devflow:status check --repair to fix N issues automatically?
```

If yes, re-run with --repair flag and display results.

**Stack profile (Check 12) is never auto-repaired.** For I030 (and whenever
`--migrate` is passed), offer: preview with `node ~/.claude/devflow/bin/df-tools.cjs
stack init --raw`, and on the user's yes run `stack init --write`. For W030/W031/E030,
show `node ~/.claude/devflow/bin/df-tools.cjs stack validate` output and let the user
edit `.planning/STACK.md`. If `stack` is an unknown command (older mirror), say so and
skip.
</step>

<step name="verify_repairs">
**If repairs were performed:**

Re-run health check without --repair to confirm issues are resolved:

```bash
node ~/.claude/devflow/bin/df-tools.cjs validate health
```

Report final status.
</step>

</process>

<error_codes>

| Code | Severity | Description | Repairable |
|------|----------|-------------|------------|
| E001 | error | .planning/ directory not found | No |
| E002 | error | PROJECT.md not found | No |
| E003 | error | ROADMAP.md not found | No |
| E004 | error | STATE.md not found | Yes |
| E005 | error | config.json parse error | Yes |
| W001 | warning | PROJECT.md missing required section | No |
| W002 | warning | STATE.md references invalid objective | Yes |
| W003 | warning | config.json not found | Yes |
| W004 | warning | config.json invalid field value | No |
| W005 | warning | Objective directory naming mismatch | No |
| W006 | warning | Objective in ROADMAP but no directory | No |
| W007 | warning | Objective on disk but not in ROADMAP | No |
| I001 | info | Plan without SUMMARY (may be in progress) | No |
| E020 | error | mirror behind installed plugin (~/.claude/devflow stale) | No |
| W021 | warning | installed plugin behind origin/main | No |
| I022 | info | mirror ahead of installed plugin (dev checkout) | No |
| E030 | error | Check 12: `.planning/STACK.md` invalid (schema, parse, cycle, depth, unknown section, missing component) | No |
| W030 | warning | Check 12: `extends` in `.planning/STACK.md` cannot be resolved | No |
| W031 | warning | Check 12: a loop/gates/generated/verification key names an undefined command | No |
| W032 | warning | Check 12: profile body over 150 lines | No |
| I030 | info | Check 12: no `.planning/STACK.md` but a manifest is present (general profile in use) | No |
| W033 | warning | Check 12b: a `.mcp.json` server owned by `stack mcp --write` (`env.DEVFLOW_MANAGED: stack`) names a command that is not installed. Fix: install it, or `df-tools stack mcp --write` to prune | No |
| W040 | warning | Check 13: project behind the running DevFlow (`project-behind: …`), or the upgrade check could not run (`upgrade-check-not-available: …`). Fix: `df-tools upgrade --apply` or `/devflow:status check --migrate` | No |

</error_codes>

<repair_actions>

| Action | Effect | Risk |
|--------|--------|------|
| createConfig | Create config.json with defaults | None |
| resetConfig | Delete + recreate config.json | Loses custom settings |
| regenerateState | Create STATE.md from ROADMAP structure | Loses session history <!-- planning-audit: allow describes what df-tools validate health --repair does itself; no agent write --> |

**Not repairable (too risky):**
- PROJECT.md, ROADMAP.md content
- Objective directory renaming
- Orphaned plan cleanup

</repair_actions>
