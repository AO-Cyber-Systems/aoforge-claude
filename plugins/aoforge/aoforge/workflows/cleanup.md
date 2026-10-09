---
status: active
---
<purpose>

Archive accumulated objective directories from completed milestones into `.aoforge/milestones/v{X.Y}-objectives/`. Identifies which objectives belong to each completed milestone, shows a dry-run summary, and moves directories on confirmation.

</purpose>

<required_reading>

1. `.aoforge/MILESTONES.md`
2. `.aoforge/milestones/` directory listing
3. `.aoforge/objectives/` directory listing

</required_reading>

<process>

<step name="identify_completed_milestones">

Read `.aoforge/MILESTONES.md` to identify completed milestones and their versions.

```bash
cat .aoforge/MILESTONES.md
```

Extract each milestone version (e.g., v1.0, v1.1, v2.0).

Check which milestone archive dirs already exist:

```bash
ls -d .aoforge/milestones/v*-objectives 2>/dev/null
```

Filter to milestones that do NOT already have a `-objectives` archive directory.

If all milestones already have objective archives:

```
All completed milestones already have objective directories archived. Nothing to clean up.
```

Stop here.

</step>

<step name="determine_objective_membership">

For each completed milestone without a `-objectives` archive, read the archived ROADMAP snapshot to determine which objectives belong to it:

```bash
cat .aoforge/milestones/v{X.Y}-ROADMAP.md
```

Extract objective numbers and names from the archived roadmap (e.g., Objective 1: Foundation, Objective 2: Auth).

Check which of those objective directories still exist in `.aoforge/objectives/`:

```bash
ls -d .aoforge/objectives/*/ 2>/dev/null
```

Match objective directories to milestone membership. Only include directories that still exist in `.aoforge/objectives/`.

</step>

<step name="show_dry_run">

Present a dry-run summary for each milestone:

```
## Cleanup Summary

### v{X.Y} — {Milestone Name}
These objective directories will be archived:
- 01-foundation/
- 02-auth/
- 03-core-features/

Destination: .aoforge/milestones/v{X.Y}-objectives/

### v{X.Z} — {Milestone Name}
These objective directories will be archived:
- 04-security/
- 05-hardening/

Destination: .aoforge/milestones/v{X.Z}-objectives/
```

If no objective directories remain to archive (all already moved or deleted):

```
No objective directories found to archive. Objectives may have been removed or archived previously.
```

Stop here.

Ask before moving anything:

```
AskUserQuestion([
  {
    header: "Archive",
    question: "Proceed with archiving the objective directories listed above?",
    multiSelect: false,
    options: [
      { label: "Cancel (Recommended)", description: "Leave every objective directory where it is" },
      { label: "Archive listed objectives", description: "Move them to .aoforge/milestones/v{X.Y}-objectives/" }
    ]
  }
])
```

If "Cancel": Stop.
If "Archive listed objectives": Continue to archive_objectives.

</step>

<step name="archive_objectives">

For each milestone, move objective directories:

```bash
mkdir -p .aoforge/milestones/v{X.Y}-objectives
```

For each objective directory belonging to this milestone:

```bash
mv .aoforge/objectives/{dir} .aoforge/milestones/v{X.Y}-objectives/
```

Repeat for all milestones in the cleanup set.

</step>

<step name="commit">

Commit the changes:

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs commit "chore: archive objective directories from completed milestones" --files .aoforge/milestones/ .aoforge/objectives/
```

</step>

<step name="report">

```
Archived:
{For each milestone}
- v{X.Y}: {N} objective directories → .aoforge/milestones/v{X.Y}-objectives/

.aoforge/objectives/ cleaned up.
```

</step>

</process>

<success_criteria>

- [ ] All completed milestones without existing objective archives identified
- [ ] Objective membership determined from archived ROADMAP snapshots
- [ ] Dry-run summary shown and user confirmed
- [ ] Objective directories moved to `.aoforge/milestones/v{X.Y}-objectives/`
- [ ] Changes committed

</success_criteria>
