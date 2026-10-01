---
name: gh-sync
description: |
  Sync DevFlow planning state to GitHub — create/update objective issues, generate release notes, or push a single objective's state (body sections + sticky comment + Project v2 fields).
  Triggers on: "sync to github", "push objectives to github", "github release notes", "sync objective".
argument-hint: "[<objective>|--all|objectives|release <tag>|status]"
allowed-tools:
  - Read
  - Bash
  - Write
---
<objective>
One-way push from `.planning/` -> GitHub. Planning files remain authoritative. All operations report `skipped` (exit 0) when `github.enabled` is not true; when it is true and `gh` is not authenticated they exit 1 with the remediation.

Modes (parsed from $ARGUMENTS):
- empty, `--all` or `objectives` — sync every objective (`gh sync --all`): find or create one issue per objective, ensure its milestone, update the managed body sections, the sticky state comment and the Project fields
- `<objective>` (any spelling: `46`, `046`, `46-github-sync-foundations`, `2.1`) — sync ONE objective (`gh sync <objective>`). The first sync creates the issue and writes `github_issue` to the objective's OBJECTIVE.md. Idempotent — safe to run repeatedly.
- `release <tag>` — generate release notes from SUMMARY.md files since the previous tag and create or edit the GitHub release
- `status` — report whether GitHub integration is enabled and reachable

If $ARGUMENTS does not match `--all`, `objectives`, `release <tag>` or `status`, treat it as an objective and run the single-objective sync.
</objective>

<execution_context>
@~/.claude/.planning/config.json
</execution_context>

<process>
1. Check `.planning/config.json` for `github.enabled` and `github.repo`. If missing or false, ask the user whether to enable now (offer to set both interactively). Do not proceed without explicit confirmation.

2. Run the requested operation:

```bash
# Default — sync all objectives (creates/updates issues + milestones)
node ~/.claude/devflow/bin/df-tools.cjs gh sync --all

# Sync one objective (any spelling) to its GitHub issue (idempotent)
node ~/.claude/devflow/bin/df-tools.cjs gh sync "$OBJECTIVE"

# Release notes for a tag
node ~/.claude/devflow/bin/df-tools.cjs gh sync-release "$TAG"

# Status check
node ~/.claude/devflow/bin/df-tools.cjs gh status
```

`gh sync --all` keeps going past a failing objective, prints JSON on stdout and exits 1 if any objective failed. `gh sync-objectives` still works but is a deprecated alias of `gh sync --all`.

Store mode (`github.store: true`, default false; off is the behaviour above unchanged): `gh sync` also pushes the TRD sub-issues, SUMMARY/VERIFICATION comments and wiki pages through an outbox, and flushes it. If the sync reports `outbox: pending` or `halted`, run:

```bash
# What is queued, and why a flush stopped (no GitHub calls)
node ~/.claude/devflow/bin/df-tools.cjs gh outbox status

# Drain the queue. Exit 0 flushed/skipped/running, 1 error, 2 halted for a human, 3 pending (offline)
node ~/.claude/devflow/bin/df-tools.cjs gh outbox flush

# Rebuild .planning/ from GitHub (exit 2 = rebuilt, but something needs attention)
node ~/.claude/devflow/bin/df-tools.cjs gh pull --all
```

Exit 2 from `gh outbox flush` means someone edited the issue on GitHub; do not decide for the user. Show them `gh outbox status` (it names the issue and both resolve commands) and let them pick `gh outbox resolve <seq> --accept-remote` or `--overwrite`. `gh pull --all` never overwrites a hand-maintained ROADMAP.md and, without `--force`, a file the user edited locally. A TRD over 60,000 characters makes the sync refuse before any GitHub call: tell the user to split it. The `gh trd` verbs (`spec|freeze|fold|scope`) need connectivity (offline they exit 1 and queue nothing).

How a sync treats GitHub:
- Each issue body starts with `<!-- devflow:id=N -->`. DevFlow rewrites only the text between its `devflow:begin` / `devflow:end` section markers; text a human wrote above, between or below them is preserved byte for byte.
- An issue created by an earlier DevFlow (no markers) keeps its old generated text; the managed sections are appended below it once. Edit the old text away by hand if you want it gone.
- The sticky state comment carries `<!-- devflow:id=N kind=state -->` and is edited in place. A legacy `<!-- df:state -->` comment is adopted and rewritten with the new marker.
- Writes are at least 1 s apart and a secondary rate limit is retried after GitHub's `retry-after`.
- If `.planning/.gh-mapping.json` is lost, re-run `gh sync --all`: issues are found again by their `devflow:id` marker, not duplicated.

3. If the sync created or updated `.planning/.gh-mapping.json` or wrote `github_issue` into an OBJECTIVE.md, commit those files:

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "chore: sync GitHub mapping" --files .planning/.gh-mapping.json $(git ls-files -m -o --exclude-standard -- '.planning/objectives/*/OBJECTIVE.md')
```

The `git ls-files` list holds only OBJECTIVE.md files that changed; a glob that matches nothing makes `commit` fail.

4. Report the result to the user — include issue numbers created/updated, milestone link, release URL, or single-objective sync result (comment action, project fields updated). If the operation was skipped or failed, say why (disabled, `gh` not installed or not authenticated, repo not set) and how to fix it.
</process>

<context>
- The mapping file `.planning/.gh-mapping.json` (v3, keyed by objective id) records objective-to-issue numbers and sticky comment IDs. Commit it. The `devflow:id` markers on GitHub make it recoverable.
- An objective's issue is found through the mapping, the OBJECTIVE.md `github_issue`, the `devflow:id` marker, then an `[Objective N]` title, and only then created. Ambiguity (two issues with one marker or title, a conflicting mapping) stops that objective with an error; it never picks one and never creates a duplicate.
- Failures (network, rate limit, auth expired) never block the user's workflow. They are reported and the planning state remains authoritative.
- For automatic syncing, the new-project workflow calls `gh sync --all` after roadmap creation, the execute-objective workflow calls `gh sync <objective>` after completion, and the verifier agent calls `gh comment … --kind verification`. This skill is for manual fire / recovery.
- If an OBJECTIVE.md already has a `github_issue` that differs from the issue the sync resolved, the value you set is kept and the difference is reported as a warning.

## Triggers

Use when the user wants to push DevFlow state to GitHub or recover from a missed sync. Also fires on: "create github issues", "sync state".
</context>
