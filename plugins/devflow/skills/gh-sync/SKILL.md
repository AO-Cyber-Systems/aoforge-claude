---
name: gh-sync
description: |
  Operate the GitHub store, where GitHub is the system of record once `github.store` is on: migrate a project onto it (dry run first, then explicit approval), show store status, flush the outbox, pull the cache, set the repository up, generate release notes. With the store off, mirror objectives to GitHub issues.
  Triggers on: "migrate to github", "move planning to github", "github store", "flush the outbox", "sync to github", "push objectives to github", "github release notes", "sync objective".
argument-hint: "[migrate [--dry-run]|status|flush|pull|setup [--apply]|release <tag>|<objective>|--all]"
allowed-tools:
  - Read
  - Bash
  - AskUserQuestion
---
<objective>
Operate DevFlow's GitHub store. With `github.store: true`, GitHub is the system of record: issues, TRD sub-issues, comments and wiki pages hold the planning state, `.planning/` is a cache rebuilt from them, and every planning verb queues its GitHub write in the outbox. With the store off (the default), `<objective>|--all` is a one-way mirror and `.planning/` stays authoritative.

Every command below reports `skipped` (exit 0) when `github.enabled` is not true; when it is true and `gh` is not authenticated it exits 1 with the remediation.

| Mode ($ARGUMENTS) | Runs (`df-tools` = `node ~/.claude/devflow/bin/df-tools.cjs`) | Store |
|---|---|---|
| `migrate [--dry-run]` | plan: `df-tools planning import --dry-run`, `df-tools upgrade --check --only 0011`; after approval `df-tools upgrade --apply --only 0011 --confirm` | off, turns it on |
| `status` | `df-tools gh status`, `df-tools gh outbox status`, `df-tools validate health` (W057-W061) | either |
| `flush` | `df-tools gh outbox flush` | on |
| `pull` | `df-tools gh pull --all` | on |
| `setup [--apply]` | `df-tools gh setup` (dry run); `--apply` only with the user's say-so | on |
| `release <tag>` | `df-tools gh sync-release <tag>` | either |
| `<objective>` or `--all` | mirror mode: `df-tools gh sync <objective>` or `df-tools gh sync --all`; in store mode, `flush` instead | off |

No arguments: `status` in store mode, `--all` with the store off. `objectives` means `--all`. Anything that is not a mode is an objective, in any spelling (`46`, `046`, `46-github-sync-foundations`, `2.1`).
</objective>

<process>
1. **Mode and config.** `node ~/.claude/devflow/bin/df-tools.cjs planning mode` prints `local` or `store`. If `config-get github.enabled` is not true or `config-get github.repo` is empty, ask (AskUserQuestion) whether to enable GitHub and for `owner/repo`, then run `config-set github.enabled true` and `config-set github.repo <owner/repo>`. Do not proceed without that approval. Never set `github.store` by hand: `migrate` turns it on after backing up the config.

2. **`migrate [--dry-run]`** moves an existing project onto the store (migration 0011).

   a. Show the plan. Neither command writes anything or calls GitHub:
   ```bash
   node ~/.claude/devflow/bin/df-tools.cjs planning import --dry-run
   node ~/.claude/devflow/bin/df-tools.cjs upgrade --check --only 0011
   ```
   With the store off, the import dry run is a preview (`preview: true`). Report `estimate` (an upper bound of GitHub requests), the objective and TRD counts, `history` (shipped and cancelled work closed instead of left open), every `kept_local` entry with its reason, and every `refused` TRD (over 60,000 characters; the user must split it first). `upgrade --check` lists 0011 under `pending_confirm` with the plan sentence as `reason`; under `skipped`, the reason says why there is nothing to do (GitHub not enabled, `already on GitHub (backfill complete)`, or `mirror mode kept (github.mirror_only: true)`). The last one means the project recorded that it keeps GitHub in mirror mode. If it shows and the user asked to migrate, ask with AskUserQuestion, "This project recorded that it keeps mirror mode. Clear that and migrate?", before running `node ~/.claude/devflow/bin/df-tools.cjs config-set github.mirror_only false`; then re-run the two plan commands above and continue. Without that approval, stop and leave the key as it is.

   b. `--dry-run` stops here. Otherwise ask with AskUserQuestion, "Migrate this project's planning onto GitHub?", options **Migrate now** / **Not now** / **Keep mirror mode** ("don't ask again"). State the cost in the question: the estimate; writes are paced at GitHub's 80 per minute and 450 per hour, so a large backfill spans hours and resumes; `github.store` turns on at the start (the config is backed up first); until it finishes, the edit gate denies cache edits and `df-tools commit` refuses the default branch. Never apply without **Migrate now**. **Not now** leaves 0011 pending, so `validate health` keeps reporting W040. On **Keep mirror mode**, record the decision in the tracked config and commit it (the store is off, so the store-mode commit gate does not apply):
   ```bash
   node ~/.claude/devflow/bin/df-tools.cjs config-set github.mirror_only true
   node ~/.claude/devflow/bin/df-tools.cjs commit "chore: keep GitHub in mirror mode" --files .planning/config.json
   ```
   Tell the user that 0011 is now skipped while the store is off, so `upgrade --check`, W040, doctor check 21 and the SessionStart upgrade notice go quiet, and that `/devflow:gh-sync migrate` can still clear it later. Then stop: do not apply.

   c. Apply:
   ```bash
   node ~/.claude/devflow/bin/df-tools.cjs upgrade --apply --only 0011 --confirm
   ```
   It preflights (git state, the outbox journal, legacy TRD names, TRD size, `gh` auth with `repo` scope, a wiki with a first page), switches the store on, queues the whole backfill once, drains it within the budgets, checks that GitHub holds every TRD (`gh pull --all` plus the orphan report), then hands off to migration 0010, which gitignores and untracks the cache. It is re-entrant: a re-run only flushes what is still queued and never re-imports.

   d. Read the result (JSON):
   - **exit 0** — report `applied[].notes` and `changed_files`. The notes end with the commit steps (step e) and the `gh setup` order (step 6).
   - **exit 1, `failed[]` 0011 says `not an error: N of M ops remain`** — the hour budget (or connectivity) stopped the drain. Tell the user: "N ops remain; re-run `/devflow:gh-sync migrate` later or keep working (the gh-flush hook drains it)", with the resume time from the message.
   - **`the outbox halted at op <seq>`** — someone edited a managed issue body on GitHub. Show `gh outbox status`, let the user pick `gh outbox resolve <seq> --accept-remote` or `--overwrite`, then re-run migrate.
   - **any other refusal** (preflight, verify, handoff) — list each blocker with its fix as printed; re-run once fixed. Nothing done is lost.

   e. Commit the switch. Show the steps from the notes; they look like this:
   ```
   git switch -c devflow-store-cache
   DEVFLOW_SKIP_GH_GATE=1 DEVFLOW_SKIP_GH_GATE_REASON="store migration" node ~/.claude/devflow/bin/df-tools.cjs commit "chore: gitignore the planning cache (store mode)" --files .gitignore .planning/
   git push -u origin devflow-store-cache
   then open a pull request for that branch
   ```
   Run them only when the user asks; do not run a raw `git commit`. Store mode refuses commits on the default branch and on unlinked branches, so the escape is needed once; it is logged (gate `gh`, `.planning/.override-log.jsonl`).

3. **`status`** — run each, then report enablement and reachability, the queue (pending, blocked, halted, why the last flush stopped) and any W057 (unsynced writes), W058 (missing links), W059 (orphans), W060 (frozen-body drift) or W061 (the check failed) line:
   ```bash
   node ~/.claude/devflow/bin/df-tools.cjs gh status
   node ~/.claude/devflow/bin/df-tools.cjs gh outbox status
   node ~/.claude/devflow/bin/df-tools.cjs validate health
   ```

4. **`flush`** — `node ~/.claude/devflow/bin/df-tools.cjs gh outbox flush`. Exit 0 flushed, skipped or already running; 1 error; 2 halted for a human; 3 pending (offline or out of budget). Exit 2 means someone edited the issue on GitHub: do not decide for the user. Show `gh outbox status` (it names the issue and both resolve commands) and let them pick `gh outbox resolve <seq> --accept-remote` or `--overwrite`. The gh-flush hook also flushes after each `df-tools commit` and at Stop.

5. **`pull`** — `node ~/.claude/devflow/bin/df-tools.cjs gh pull --all` rebuilds the cache from GitHub. Exit 0 clean, 1 error, 2 rebuilt with attention items (list them). It never overwrites a hand-maintained ROADMAP.md and, without `--force`, never replaces a file the user edited locally.

6. **`setup [--apply]`** — `node ~/.claude/devflow/bin/df-tools.cjs gh setup` is a dry run that prints every action and its exact request. Show it; run `gh setup --apply` only with the user's say-so. It creates the default-branch ruleset with the required checks `devflow/linked-issue` and `devflow/planning-consistency`, labels, issue types and fields, the managed `.github/workflows/devflow.yml` and a pull-request-template block; it is idempotent, degrades per action, and leaves the two files uncommitted. Order after a migration: merge the migration's pull request first, then `gh setup --apply`, merge its workflow pull request with a one-time admin bypass (the required checks exist only once the workflow is on the default branch), and only then require the checks. `--refresh` retries a refused merge queue; `--require-wiki` exits 1 while the wiki has no first page.

7. **`release <tag>`** — `node ~/.claude/devflow/bin/df-tools.cjs gh sync-release "$TAG"`: generate release notes from the SUMMARY.md files since the previous tag and create or edit the GitHub release.

8. **`<objective>` or `--all` (mirror mode, store off)** — `node ~/.claude/devflow/bin/df-tools.cjs gh sync "$OBJECTIVE"` or `gh sync --all`. Each finds or creates one issue per objective, ensures its milestone, refreshes the managed body sections, the sticky state comment and the Project fields; it is idempotent. The first sync records `github_issue` in the objective's OBJECTIVE.md; do not edit that by hand (any other change goes through `df-tools objective put <id> --from <draft>`). `--all` keeps going past a failing objective, prints JSON and exits 1 if any failed. In store mode the verbs have already queued every write, so run `flush` instead; if an objective's issues are missing on GitHub, `gh sync <objective>` re-pushes its hierarchy through the outbox. A TRD over 60,000 characters makes it refuse before any GitHub call: tell the user to split it.

9. **Report** issue numbers, the release URL, the queue counts, and what remains and why. If a command was skipped or failed, say why (disabled, `gh` not installed or not authenticated, repo not set) and how to fix it.
</process>

<context>
- `.planning/.gh-mapping.json` (v3, keyed by objective id) maps objectives to issues. It is recoverable: if it is lost, `gh sync --all` (mirror) or `gh pull --all` (store) finds the issues again by their `devflow:id` marker and never duplicates one. In store mode it is cache, gitignored by migration 0010.
- Each issue body starts with `<!-- devflow:id=N -->`. DevFlow rewrites only the text between its `devflow:begin` / `devflow:end` markers; text a human wrote around them is preserved byte for byte. An issue from an older DevFlow (no markers) keeps its old text and gets the managed sections appended once.
- Writes are at least 1 s apart, and a secondary rate limit is retried after GitHub's `retry-after`. Failures never block the user's workflow.
- In store mode an objective's branch and pull request have their own verbs (`gh pr start|sync|status|merge|reconcile`), run by `/devflow:execute-objective`; `gh pr status <objective>` shows where one stands. The `gh trd` verbs need connectivity.
- Automatic syncing already happens: execute-objective syncs each objective, the verifier posts verification, and the gh-flush hook drains the outbox. This skill is for migrating, inspecting, manual fire and recovery.

## Triggers

Use when the user wants to move planning onto GitHub, check or drain the store, or push state to GitHub. Also fires on: "create github issues", "sync state".
</context>
