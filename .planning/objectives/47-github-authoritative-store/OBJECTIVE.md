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
