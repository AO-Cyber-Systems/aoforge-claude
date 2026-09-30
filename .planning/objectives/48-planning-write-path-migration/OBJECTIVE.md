---
objective: 48-planning-write-path-migration
kind: plugin
work: refactor
status: registered
milestone: v1.4
depends_on: Objective 47
---

# Objective 48 — Planning write-path migration

Registered 2026-09-30. Part of the GitHub system-of-record plan (objectives 46–51); design in
`docs/PROPOSAL-github-system-of-record.md`.

## Goal

Skills and agents change planning state only through df-tools verbs that write to GitHub, and `.planning/` becomes a gitignored cache.

## Requirements

- **GWP-01** df-tools verbs cover every planning write: `plan put-trd`, `objective put|set-status`, `summary post`, `verification post`, `decision open|answer`, `todo add`, wiki `doc put`.
- **GWP-02** Every skill, workflow and agent that writes planning files uses the verbs (planner, executor, verifier, research, discuss, new-project, adopt, milestone, todo, decide).
- **GWP-03** Edit gate denies Edit/Write/MultiEdit on cached planning files and names the verb to use; Bash writes to the cache are flagged by `validate`.
- **GWP-04** `.planning/` gitignored in GitHub mode (runtime + cache); repo keeps only `.planning/config.json` if needed.
- **GWP-05** Job-checker enforces the TRD scope budget and linked-bulk rule.

## Constraints

- Design source: `docs/PROPOSAL-github-system-of-record.md` (decisions locked 2026-09-30; do not re-litigate).
- Strict TDD (kind plugin/cli): failing test committed first.
- Tests mock `gh` via `_setRunGh` / temp dirs and env overrides; never call the real GitHub API or touch the real `~/.claude`.
- Never use port 8080.

## Success Criteria

1. A grep audit test finds no skill/agent/workflow writing planning files directly (CI test, like doc-refs).
2. The edit gate denies a direct TRD edit with a message naming `plan put-trd`.
3. Plan → execute → verify on a fixture project leaves `git status` clean apart from code.
4. `npm test` green.
