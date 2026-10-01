---
objective: 47-github-authoritative-store
kind: plugin
work: feature
status: registered
milestone: v1.4
depends_on: Objective 46
---

# Objective 47 — GitHub authoritative store

Registered 2026-09-30. Part of the GitHub system-of-record plan (objectives 46–51); design in
`docs/PROPOSAL-github-system-of-record.md`.

## Goal

GitHub holds the full planning hierarchy and content, and DevFlow can round-trip it: push to issues and wiki, pull back into a local cache.

## Requirements

- **GST-01** Hierarchy: native milestone → Objective-type issue → TRD-type sub-issues (GraphQL `addSubIssue`), blocked-by edges from wave order (dependencies REST), issue fields `work`/`kind`; Decision-type issues block their TRD.
- **GST-02** Objective issue body: summary + success-criteria checkboxes; TRDs shown via native sub-issues; link to wiki page `Objective-<N>-<Slug>` at a pinned revision.
- **GST-03** TRD codec: body is the execution spec; scope budget (target 40K, hard 60K chars); frozen at execute start; `<!-- devflow:scope n=K -->` comments; effective spec = body + scope comments; fold on close when it fits; `devflow:spec-rev` sticky log with content hashes.
- **GST-04** SUMMARY posted as a `devflow:summary` comment on the TRD; VERIFICATION as a sticky comment on the objective.
- **GST-05** Outbox journal for issue writes: durable queue under `~/.claude/devflow/state/`, paced, resumable after rate-limit or offline; flush detects a remote edit since last pull and stops for a human.
- **GST-06** Wiki store: clone `<repo>.wiki.git` into the cache; writes are commit + rebase + push; reference docs mapped to pages (PROJECT, REQUIREMENTS, research, codebase map, objective detail, ADRs, retros).
- **GST-07** `gh pull --all` rebuilds the local `.planning/` cache (issue copy + wiki clone) from GitHub; generated ROADMAP/STATE views; wiki `Roadmap` page rendered from issues.
- **GST-08** Degraded mode for repos without org features or a wiki: labels + body metadata for types/fields, `docs/` for wiki content; detected automatically.

## Constraints

- Design source: `docs/PROPOSAL-github-system-of-record.md` (decisions locked 2026-09-30; do not re-litigate).
- Strict TDD (kind plugin/cli): failing test committed first.
- Tests mock `gh` via `_setRunGh` / temp dirs and env overrides; never call the real GitHub API or touch the real `~/.claude`.
- Never use port 8080.

## Success Criteria

1. A fixture objective with 3 TRDs in 2 waves round-trips: push creates objective + sub-issues + blocked-by + wiki page; `pull --all` regenerates identical cache content.
2. A TRD over 60K characters is refused before any issue is created.
3. Scope comments applied in order produce the effective spec; fold on close is logged in spec-rev.
4. Offline writes queue; on reconnect they flush in order; a remote edit since the last pull halts the flush with a clear report.
5. Degraded mode produces the same workflow on a user-owned repo fixture.
6. `npm test` green.

## Decisions (planning, 2026-09-30)

These settle the open questions in 47-RESEARCH.md. The proposal's decisions are unchanged. Full rationale is in the TRD that owns each one.

- **D-01 TRD body header** (47-01): the body is `<!-- devflow:id=… -->`, then `<!-- devflow:file=… -->`, then the TRD file verbatim. The `file` line is how `pull --all` rebuilds exact filenames.
- **D-03 Fold** (47-01, Q4): fold replaces the closed TRD's body with the effective spec when it is 60K or less. Scope comments are kept. spec-rev logs `fold folded_through=K from=<hash>`.
- **D-04 Oversized comments** (47-01/07/08, Q3): a SUMMARY or VERIFICATION over 60K is split losslessly into `devflow:part=i/n` comments. A scope comment over 60K is refused, because overflow becomes a new TRD.
- **D-07 Issue-field definitions** (47-02/06, Q1, LOW): one constant path sits behind one function. Any failure means body `meta` instead. Tests use only the fake.
- **D-08 Type silently dropped** (47-06/07, Q2): types are checked per type at probe time and checked again on every create response. Scan labels are always applied.
- **D-09 Wiki revision URL** (47-04, Q6, LOW): handled only in `pageRevisionUrl()`, which is pinned by one test.
- **D-10 `gh api --input -` stdin** (47-07, Q7): a client test pins it.
- **D-11 Labels** `devflow:trd` / `devflow:decision` are always applied. They let DevFlow find issues by listing and scanning, and they double as the type in degraded mode. There are no `devflow:type/*` labels.
- **D-15 Rollout**: `github.store` defaults to false. With it off, `gh sync` behaves exactly as in objective 46. With it on, every 47 write and the objective-body edit go through the outbox. 46's issue create, bootstraps, state comment and Project fields stay direct until objective 48.
- **D-17 Wiki clone** (47-04, Q5): `.planning/wiki/`, excluded via `info/exclude`.
- **D-23 Retry policy** (47-07): `gh-client.withRetryPolicy()` scopes the policy for one call and never passes it through `opts`. Hook flushes use `maxRetries:0`.
- **D-24 Remote-edit detection** (47-07): a body hash, with `updated_at` used only as a pre-filter. A halt fires on a change to managed sections or to a TRD body. A change to human text only is merged. Criterion ticks are excluded.
- **D-25 Round-trip scope** (47-10/13, Q8): OBJECTIVE, CONTEXT and RESEARCH pages, TRDs, SUMMARY, VERIFICATION, PROJECT, REQUIREMENTS and codebase docs are byte-compared. ROADMAP and STATE are generated views.
- **D-26 Pull safety** (47-10): pull never deletes. It never overwrites a locally modified file or a hand-maintained ROADMAP/STATE.
- **D-27 Freeze**: the `gh trd freeze` verb is added now. Wiring it to execute start is objective 49.
