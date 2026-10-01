# Proposal: GitHub as the system of record

Status: accepted for planning, 2026-09-30. Objectives 46–51 implement it.
Objective 46 (foundations) and objective 47 (the authoritative store: hierarchy, TRD codec and budget,
comments, outbox, wiki store, `gh pull --all`, degraded mode) are implemented. Objective 48 (write-path
migration) is implemented: every planning write is a df-tools verb (`plan put-trd`, `summary post`,
`doc put`, ...) that writes today's file with the store off and the cache plus the outbox with it on; the
edit gate denies direct edits of cache files in store mode; `validate health` reports drift (W055);
migration 0010 untracks the cache; and skills, workflows, agents and templates hold zero direct
planning-write instructions (CI-enforced). Objective 49 (branch and PR lifecycle) is implemented:
`gh pr start|sync|status|merge|reconcile`, the scope gate (`gh trd confirm-scope|start`), the `Refs #N`
commit paragraph, the `prs` mapping map, and the fix that closes the objective issue on merge instead of
at verify-pass. Objective 50 (enforcement and setup) is implemented: the commit gate (`df-tools commit`
refuses the default and unlinked branches, escape `DEVFLOW_SKIP_GH_GATE=1` logged as gate `gh`), the
`gh-flush` hook, `validate health` Check 16 / `doctor` check 25 (W057–W061), `gh setup [--apply]`, the
reusable workflow and its caller template, and the required checks `devflow/linked-issue` and
`devflow/planning-consistency` posted as commit statuses. The store ships opt-in (`github.store`, default
false); objective 51 completes the move onto it. Known gap: `gh trd freeze|scope|fold` need connectivity
(offline they exit 1 and queue nothing), as does `gh pr start`. Open items for objective 50 are listed
after its refinements below.

### Planning refinements (objective 47)

Decisions taken while planning objective 47 that refine, and do not change, the table below:

- D-01: a TRD issue body is `<!-- devflow:id=… -->`, then `<!-- devflow:file=… -->`, then the TRD file
  verbatim; the `file` line is how `gh pull --all` rebuilds exact filenames.
- D-15: rollout is behind `github.store`, default false. Off is objective 46 byte for byte; on, the TRD,
  comment and wiki writes and the objective-body edit go through the outbox.
- D-17: the wiki clone lives at `.planning/wiki/`, excluded through `info/exclude`.
- D-24: remote-edit detection compares a body hash (`updated_at` is only a pre-filter). A change to a
  managed section or a TRD body halts the queue for a human; a change to human text only is merged.

### Planning refinements (objective 48)

Decisions taken while planning objective 48 that refine, and do not change, the table below:

- U-1 tracked set: in store mode only `.planning/config.json` and `.planning/STACK.md` stay tracked
  (`.planning/*` plus two negations, written by confirm migration 0010); the rest is cache or runtime.
- U-1/U-3 entity issues: todos, debug sessions and quick tasks are GitHub issues with outbox roles,
  mapping entries and cache materialisation. Debug and Quick use native issue types, or
  `devflow:type/Debug` / `devflow:type/Quick` labels where the org has none.
- D-05 milestones: native GitHub milestones titled `<milestone_prefix><version>`, a description of at
  most 1,000 characters linking wiki page `Milestone-vX_Y`, which holds the full entry; archives map to
  `Milestone-vX_Y-<Kind>`. MILESTONES.md is a generated view.
- Research pages: `research/` and objective RESEARCH.md are wiki pages.
- U-2 linked bulk: a fenced block over 8,000 characters, or fenced content over 40% of a TRD of 40,000+
  characters, warns (never blocks) in `verify trd-pre` and job-checker Dimension 8.
- D-12 summary checkpoints: `summary checkpoint` writes runtime `.planning/.trd-progress/<trd>.md` in
  store mode and is never enqueued; `summary post` is the single GitHub write per TRD.

### Planning refinements (objective 49)

Decisions taken while planning objective 49 that refine, and do not change, the table below:

- Verification status: locally, verification is the commit status `devflow/verification` on the PR head;
  a check run comes only from the GitHub App (objective 50), because only an App can create one.
- `gh pr start` is online-required (exit 1, nothing queued). Every later PR operation goes through the
  outbox.
- In-progress is the `github.labels.in_progress` label, added at spawn (`gh trd start`) and removed at
  `summary post`.
- `gh pr start` freezes every TRD, so a change after start is a scope comment.
- Merge method defaults to squash (`github.pr.merge_method`); the merge queue is used where the base
  branch has one. Under a queue `gh pr merge` and `gh pr reconcile` exit 3 until the queue lands the PR.
- Reconcile verifies the closure of every issue and closes stragglers; it does not rely on GitHub's
  closing-keyword limits. It trusts only the PR's `merged_at` and each issue's `state`.
- `git.branching_strategy` is replaced in store mode only (local mode prints a deprecation notice);
  `complete-milestone` no longer merges branches in store mode.
- Close-on-merge fix: store mode no longer closes the objective issue at verify-pass. It closes on merge
  (the PR's `Closes #<obj>`) or in reconcile, and `objective complete` warns while the PR is unmerged.
- Scope acceptance: a scope comment is accepted when an assignee or the App (`github.app_login`) wrote
  it, DevFlow recorded it, or an assignee confirmed it (`gh trd confirm-scope`); a confirm counts only if
  an assignee posted it.
- The `Refs #N` commit marker is a plain last paragraph (git's trailer parser needs a colon), so objective
  50's linked-issue check matches `^Refs #\d+$`. A squash merge keeps these in the PR commit list only.
- Open, unverified against the live API: the merge-queue probe reads `PullRequest.isInMergeQueue` and
  `Repository.mergeQueue(branch:)`; the fake GitHub models both.

### Planning refinements (objective 50)

Decisions taken while executing objective 50 that refine, and do not change, the table below:

- Commit gate (50-02): "linked" is a local fact, an unmerged `prs[<objective>].branch`, so the gate needs no
  network. A `df/exec-*` branch inherits the main checkout's branch when that is linked and is otherwise
  refused as unlinked; the escape is the string `1` only. The decision is a pure function; `df-tools commit`
  (50-06) records an escape after the commit lands, in the main checkout's override log.
- Required checks are commit statuses (50-08, 50-10): the runner posts `devflow/linked-issue` and
  `devflow/planning-consistency` itself on the PR head, or on the group head for `merge_group`, so the
  required-context match cannot be broken by job or `workflow_call` nesting and no App is needed. Both
  workflow files carry no path or branch filters and never use `pull_request_target`.
- `planning-consistency` (50-03) validates the GitHub issue graph, never `.planning/` files, which are an
  untracked cache in store mode: store off or no objective PR passes with a stated reason, and an objective PR
  needs the default-branch base, a closing reference for the objective issue and for every TRD issue linked
  under it (so merging closes them all), and no closing target already closed as `not_planned`.
- `linked-issue` (50-03) fails on a closing reference that is dead or is a pull request even beside a good one,
  and when the default branch is unknown. `Refs #N` is reported, never required.
- Reconcile (50-08) acts only on a merged PR whose base is the default branch (closing keywords never act
  elsewhere) and closes stragglers as completed with one marker comment. Project → Done stays with GitHub's
  built-in "Item closed" workflow: `GITHUB_TOKEN` cannot reach Projects v2.
- `gh setup` plan (50-09): the plan is data, `renderPlan` prints exactly what apply sends. A ruleset that
  already does everything asked, or more, is left alone; a weaker one is updated with the union and never has a
  rule or a bypass actor removed. A ruleset DevFlow cannot read is skipped, never overwritten. An unmanaged
  workflow file is a conflict, never overwritten.
- `gh setup` apply (50-11): the dry-run is the default and apply sends the planned request through
  `gh-client`. A 422 on a ruleset carrying the merge queue retries without that rule and records
  `{merge_queue: false}` so a second apply writes nothing (`--refresh` tries the queue again); an issue-field
  422 retries as a `text` field; a 403 or 404 on an organization endpoint is a skip. Enablement is
  `github.enabled` plus `github.repo`, not store mode. A dry-run that finds a conflicting file exits 1.
- Reusable workflow (50-10): the App token is optional (`DEVFLOW_APP_CLIENT_ID` variable,
  `DEVFLOW_APP_PRIVATE_KEY` secret), scoped to the one caller repository, with job permissions that can only
  narrow the caller's. The `uses:` target is `github.checks_workflow`, default
  `AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml@v<version>`.

Open items for objective 50 (none changes the decisions table):

- Not verified on a real repository: that `uses:` through `workflow_call` resolves the sparse checkout of
  `plugins/devflow/devflow/bin`; that `actions/create-github-app-token@v3` accepts `permission-*` with `owner`
  and `repositories`; that `github.event.repository.name` is set on `merge_group`; and that the required
  contexts match once the statuses arrive through the reusable workflow. The tests ran against the fake GitHub
  and text assertions over the YAML.
- Issue-field option shape: `{name, color, priority}` is from the documentation. A 422 falls back to a text
  field, but a wrong shape that GitHub accepts silently would not be caught. Likewise that GitHub answers a
  refused merge queue with a 422 on the ruleset POST or PUT is modelled, not observed.
- The central workflow location (`github.checks_workflow`) is owned by platform/ops, and it must be reachable
  by every repository that calls it; moving it is a one-key change per repository.
- Bootstrap: the ruleset requires two statuses that exist only once the workflow is on the default branch, so
  merge the workflow pull request first, with a one-time admin bypass if needed.
- Migration 0010 and doctor check 20 print a `df-tools commit` follow-up that the gate refuses on a store-mode
  default branch, and the `upgrade-project.js` background commit gets the same refusal. The commit needs the
  logged escape or an objective branch; the printed notes do not say so yet.
Team-review page: https://claude.ai/artifact/5WUeto6m5YYsxRAz8XJd2w (private; share before linking).

## Summary

GitHub becomes authoritative for DevFlow planning. Work items with status are
issues; reference text is the repository wiki. Local `.planning/` becomes a
cache that is never committed: a git clone of the wiki plus a read-only copy of
the issue tree. Issue writes go through a paced, offline-tolerant outbox; wiki
writes are git pushes. Each objective runs on one linked branch and ends in one
pull request. Local hooks and repository rulesets enforce both.

## Decisions (2026-09-30)

| Area | Decision |
|---|---|
| Source of truth | GitHub fully authoritative; `.planning/` is a gitignored cache |
| Hierarchy | Native GitHub milestone → Objective issue → TRD sub-issues; objective detail in the wiki |
| PR granularity | One PR per objective, targeting the default branch |
| Local enforcement | Block commits on the default branch or unlinked branches; offline-tolerant outbox; logged env-var escape |
| Identity | Developer's `gh` token locally; org GitHub App in Actions |
| Wiki review | Wiki changes made during an objective are posted to its PR as a diff |
| Scope changes | Only the objective's assignee and DevFlow; others wait for assignee confirmation |
| Merge queue | Required wherever the repo supports it; workflows get `merge_group` |
| Repos without org features or wiki | Degrade: labels + body metadata for types/fields, `docs/` for wiki content |
| Stacked PRs | Not planned |
| GitHub App owner | Platform/ops (AOCyberAI-Ops), including key rotation |
| Open | Which private repos are on a plan that includes wikis |

## Entity model

| Level | GitHub object | Holds | Detail |
|---|---|---|---|
| Milestone | Native milestone (no issue) | Objective issues, due date, % complete | Wiki retro page at close |
| Objective | Objective-type issue, milestone set, issue fields (`work`, `kind`), Project item | Short summary, success-criteria checkboxes (verifier ticks them), TRDs as native sub-issues | Wiki page `Objective-<N>-<Slug>` (goal rationale, CONTEXT, RESEARCH), linked at a pinned revision |
| TRD | TRD-type sub-issue; blocked-by edges for waves | The full execution spec; scope-change comments | Issue is the only copy |
| Decision | Decision-type issue blocking the TRD that raised it | The question; answer as comment/field | Accepted ADR as a wiki page |
| Todo | Issue labelled `devflow:todo` | — | — |
| SUMMARY | Comment on the TRD issue, marker `devflow:summary` | — | — |
| VERIFICATION | Sticky comment on the objective + check run on the PR | — | — |
| ROADMAP, STATE | Generated views; wiki `Roadmap` page rendered from issues | — | — |
| PROJECT, REQUIREMENTS, research, codebase map, architecture, retros | Wiki pages | — | — |

## TRD rules

- **Scope budget.** Target 40,000 characters, never over 60,000 (GitHub caps
  bodies at 65,536). Enforced in planner scope estimation, the job-checker, and
  `df-tools plan put-trd`. Over budget means narrow the TRD or move work to a
  follow-up TRD; never trim prose to fit. Fixtures, sample data and long
  listings go in the repo or wiki and are linked. (This repo: 262 TRDs, median
  18.4K, p90 37.6K, p99 53.6K; one over 60K, `04-01`, due to inline fixtures.)
- **Frozen at execute start.** DevFlow stops editing the body; a direct human
  edit is reported as drift.
- **Scope changes in flight** are comments marked `<!-- devflow:scope n=K -->`
  stating what changed and why. Effective spec = body + scope comments in order.
- **Scope-change budget.** If the effective spec would pass 60,000 characters,
  the overflow becomes a new TRD.
- **Fold on close.** Scope comments are folded into a consolidated body when it
  fits; the fold is logged in the `devflow:spec-rev` comment.

## Write and read paths

- Skills and agents never Edit/Write cached planning files. They call
  `df-tools` verbs (`plan put-trd`, `objective set-status`, `summary post`, …).
- Issue writes → outbox journal (paced ≤ 1 write/s, 80/min, 500/h; retried with
  backoff; idempotent upsert keyed by `<!-- devflow:id=… -->`). A flush that
  finds an issue edited on GitHub since the last pull stops for a human.
- Wiki writes → commit to the local wiki clone, rebase, push. Conflicts are git
  conflicts.
- Reads: `gh pull --all` refreshes the cache at session start, before plan, and
  after a flush. Agents read the cache.
- DevFlow writes only inside its own marked body sections; human text outside
  them is preserved. Deletes are never automatic; orphans are reported.

## Branch and PR lifecycle

| Stage | Local | GitHub |
|---|---|---|
| Plan | Planner writes via df-tools | Objective issue, TRD sub-issues, blocked-by, fields; wiki page |
| Execute start | Branch via `gh issue develop` | Linked branch; draft PR with `Closes #obj` and each TRD; pinned wiki revision in PR body |
| Each TRD | Commits carry `Refs #trd`; worktrees merge into the objective branch | TRD status moves; SUMMARY comment |
| Verify pass | Verifier result | Check run green; PR marked ready; wiki diff posted |
| Merge (queue where supported) | Cache pulls final state | Issues close; Project → Done; branch deleted |

## Enforcement

Local: `df-tools commit` refuses the default branch and unlinked branches and
adds the trailer; edit gate denies writes to cached planning files; post-commit
and Stop hooks flush the outbox and report drift; `validate health` / `doctor`
report unsynced writes, orphans and missing links; escape
`DEVFLOW_SKIP_GH_GATE=1` logged via `df-tools override`.

Remote (`df-tools gh setup`): default-branch ruleset (PR required, no
force-push/deletion, merge queue where supported); required checks
`devflow/linked-issue` and `devflow/planning-consistency`; issue types, issue
fields, labels, PR template; `merge_group` triggers; merge-time reconcile Action
run by the org GitHub App; wiki-diff hook; degraded mode detection.

## Platform constraints

- Issue types, issue fields and the `projects_v2_item` webhook are org-only.
- `GITHUB_TOKEN` cannot access Projects v2.
- Secondary limits: 80 content-creating requests/min, 500/h.
- Closing keywords fire only on PRs to the default branch.
- Wikis: no API beyond git, no review gate, first page must be created in the
  web UI before the wiki can be cloned, paid plan for private repos.
- Ruleset branch-name and commit-message patterns are Enterprise-only, so the
  linked-issue rule is a required Actions check.

## Current defects fixed first (objective 46)

All eight are fixed in objective 46 (`gh sync`, mapping v3 with migration 0009, `devflow:id` markers, `lib/gh-client.cjs`).

1. Two mapping shapes in `.gh-mapping.json` (v1 numbers, v2 objects) → `issue edit "[object Object]"`.
2. Three mapping keys (ROADMAP number, `parseInt` of dir, dir name) → pull never finds push's entries; decimals collide.
3. Post-execute sync passes an objective number where `syncObjective` needs a dir (`workflows/execute-objective.md`), hidden by `2>/dev/null`.
4. `sync-objectives` never writes `github_issue` back to OBJECTIVE.md.
5. Milestone title is the first `vX.Y` in ROADMAP; `milestone_id` cached forever.
6. `formatIssueBody` and `buildIssueBody` overwrite each other and human edits.
7. Project field IDs read from a test fixture with a hardcoded project ID (`gh.cjs` `PRODUCT_ROADMAP_FIELDS`).
8. No retry/rate limiting; first comment page only; `github.enabled` ignored by `sync`/`pull`/`resolve`; legacy commands exit 0 on `ok:false`.
