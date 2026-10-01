# Proposal: GitHub as the system of record

Status: accepted for planning, 2026-09-30. Objectives 46–51 implement it.
Objective 46 (foundations) and objective 47 (the authoritative store: hierarchy, TRD codec and budget,
comments, outbox, wiki store, `gh pull --all`, degraded mode) are implemented. The store ships opt-in
(`github.store`, default false); objectives 48–51 move skills, agents, enforcement and the PR lifecycle
onto it. Known gap: `gh trd freeze|scope|fold` need connectivity (offline they exit 1 and queue nothing).

### Planning refinements (objective 47)

Decisions taken while planning objective 47 that refine, and do not change, the table below:

- D-01: a TRD issue body is `<!-- devflow:id=… -->`, then `<!-- devflow:file=… -->`, then the TRD file
  verbatim; the `file` line is how `gh pull --all` rebuilds exact filenames.
- D-15: rollout is behind `github.store`, default false. Off is objective 46 byte for byte; on, the TRD,
  comment and wiki writes and the objective-body edit go through the outbox.
- D-17: the wiki clone lives at `.planning/wiki/`, excluded through `info/exclude`.
- D-24: remote-edit detection compares a body hash (`updated_at` is only a pre-filter). A change to a
  managed section or a TRD body halts the queue for a human; a change to human text only is merged.
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
