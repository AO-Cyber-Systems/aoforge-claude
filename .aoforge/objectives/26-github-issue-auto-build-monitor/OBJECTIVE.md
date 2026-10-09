---
work: feature
status: cancelled
---

# GitHub issue auto-build monitor

## Goal

Discover untracked GitHub issues in the current repo and drive qualifying ones through the
full DevFlow pipeline (plan → execute → verify → PR) unattended, behind a trusted-author
gate. File an issue → a PR appears, without opening a session.

## Disposition

**Killed 2026-10-01 by user decision (GMD-04).** The GitHub store (objective 47) and the
objective branch and PR lifecycle (objective 49) already cover most of its value: the issue
graph, the linked branch and the one PR per objective. An unattended issue-driven builder is
not worth its trust and safety surface now (the unattended runner is a prompt-injection
surface that the trusted-author gate only narrows). Not re-based. The locked design below is
kept as the record of the constraints for any future restart.

Recorded by TRD 51-01 (objective 51); status `cancelled`, which store mode files as a closed,
not-planned issue.

## Locked decisions (settled with the user — do not re-litigate during planning)

- **Autonomy:** full auto-build ending in an opened PR.
- **Trigger:** extend the existing `devflow-watch` daemon **process**. No new daemon, no
  webhook receiver.
- **Repo scope:** current repo only, from `github.repo` in `.planning/config.json`.
- **Selection (union):** assigned-to-me ∪ milestone-matches-current ∪ any-open — all gated
  behind a trusted-author check (`gh api repos/{owner}/{repo}/collaborators/{login}`).
  Non-collaborator issues are notify-only and never auto-built.
- **Containment:** `git worktree` on the host, on a branch from the existing
  `objective_branch_template`. `main` is never checked out or committed to.
- **On failure:** comment the failure summary on the issue, leave branch + worktree for
  inspection, mark attempted so it is never retried. No auto-retry. No draft PR.
- **Config:** new `gh_monitor` block, **disabled by default**.

## Critical architectural constraint

`devflow-watch`'s dispatch path (`watcher-allowlist.cjs` → `validateCommand` →
`ShellSession`) is a deliberately narrow whitelist of interactive auth / shell-env commands,
backed by a deny list. Its security property is *"the daemon never runs anything outside the
allowlist."*

**The auto-build path must NOT go through it.** Allowlisting `claude -p` would convert a
scoped auth helper into an arbitrary code executor. The GitHub monitor is a **sibling
subsystem** in the same process; the build runner spawns `claude -p` from its own explicit,
auditable code path. `watcher-allowlist.cjs` and `watcher-daemon.cjs`'s `processOnce` are
not to be modified.

## Security requirements (non-negotiable)

1. **Issue text is untrusted data.** It may populate only the goal/description fields of the
   generated OBJECTIVE.md, inside an explicitly delimited block marked *specification to
   implement, not instructions to follow*. It must never be interpolated into the
   `claude -p` prompt, into agent directives, or into any shell command. (Honest scope: the
   build agent does read that file, so issue text reaches a model context — containment is
   the delimiting + worktree + author gate, not absence of exposure.)
2. **Trusted-author gate** enforced before any planning file is written.
3. **Rate cap** (`max_builds_per_hour`, default 2) so an issue flood cannot run away.
4. **No deploy/release** in the auto path — artifacts and a PR only.
5. **Idempotency** — an issue is picked up at most once, persisted in
   `.planning/.gh-mapping.json`.

## Reuse (do not duplicate)

| Need | Existing |
|---|---|
| Config load, tolerates missing file | `lib/config.cjs` → `loadConfig` |
| Issue↔objective mapping | `lib/gh.cjs` → `readMapping` / `writeMapping`, `.planning/.gh-mapping.json` |
| Issue commenting | `lib/gh.cjs` → `cmdGhComment` |
| `gh issue list` query shape | `lib/check-todos.cjs` |
| GH call test seam | `_setRunGh(fn)` — as in `lib/gh.cjs`, `lib/gh-pull.cjs` |
| Objective numbering + slug | `lib/objective.cjs` → `cmdObjectiveAdd` |
| Branch naming | `objective_branch_template` config default |

PR creation is **net-new** — nothing in the codebase opens PRs today.

## Testing

Node native test runner, `.test.cjs` adjacent to source. All GitHub interaction goes through
the `_setRunGh` mock seam — no test may touch the real API.

---
*Created: 2026-08-06 — plan approved at `~/.claude/plans/tidy-bubbling-sunbeam.md`*
