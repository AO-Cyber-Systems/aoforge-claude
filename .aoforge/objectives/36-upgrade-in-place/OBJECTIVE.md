---
objective: 36-upgrade-in-place
kind: plugin
work: feature
tdd: tdd
status: planned
overrides:
  tdd: tdd
---

# Objective 36 — Upgrade in place

Approved plan: `~/.claude/plans/buzzing-waddling-glade.md`. Source: the 2026-09-27 upgrade/bootstrap
audit, summarised in the plan's Context. Branch: `feat/stack-profile-loader` (continues after
objective 35; it needs `stack init`).

## Goal

When DevFlow upgrades, every DevFlow project upgrades itself in place, and so does the global
`~/.claude` state, with no one running anything. Each project records which DevFlow version last
upgraded it. A registry of detection-based, idempotent migrations brings it forward, backing up
outside the repo first. Safe migrations apply and **auto-commit** at session start. Migrations that
need judgement become a one-line notice. `health --migrate` finally does what it advertises.

## Decisions (user, 2026-09-27 — LOCKED)

- **Auto-upgrade = apply AND auto-commit.** The commit contains only the files the migrations
  changed, named by explicit path. It is skipped if any of these hold:
  - a rebase, merge, cherry-pick or bisect is in progress;
  - HEAD is detached;
  - a changed file had uncommitted user edits before the migration;
  - signing fails.

  When skipped, the change stays applied and uncommitted, and a notice says so. **Signing is never
  bypassed.**
- **Global scope:**
  - (1) Move the legacy `~/.claude/skills/df-*`, `~/.claude/agents/df-*` and
    `~/.claude/devflow/VERSION` into a backup dir. Move, never delete.
  - (2) A managed, version-stamped DevFlow block in `~/.claude/CLAUDE.md`. The first adoption over an
    existing hand-written "DevFlow Routing" section is notice-only until
    `df-tools upgrade --global --confirm`. After that it updates automatically. Text outside the
    markers is never touched.
- Backups live **outside the repo**: `~/.claude/devflow/backups/<repo-slug>-<hash>/<ts>/`.
- The SessionStart hook uses the **bundled** `${CLAUDE_PLUGIN_ROOT}/devflow/bin/df-tools.cjs`, not
  the mirror. SessionStart hooks run in parallel with `sync-runtime`. It applies synchronously and
  commits in a **detached background process** so session start is never held waiting on
  1Password.

## Deliverables (the planner may re-cut, not re-scope)

| Wave | TRD | What |
|---|---|---|
| 1 | 36-01 | `lib/upgrade.cjs`: registry loader (`lib/migrations/NNNN-*.cjs`), contract validation, id ordering, out-of-repo backup, `config.json` `devflow{version, migrations_applied, upgraded_at}` stamp, report `{from,to,applied,pending_confirm,skipped,changed_files,backup}` |
| 1 | 36-02 | `lib/managed-block.cjs`: `<!-- DEVFLOW:START v=<ver> src=<template> -->`…`<!-- DEVFLOW:END -->`; read/upsert/isStale; legacy unversioned markers count as stale; bytes outside the block are preserved exactly |
| 2 | 36-03 | `df-tools upgrade [--check\|--apply] [--only id] [--confirm] [--path dir] [--global]`; HELP_TABLE; health **W040** (behind); `workflows/health.md` `--migrate` runs upgrade |
| 2 | 36-04 | Migrations: 0001 config-stamp (auto; also replaces the stale flat-key `--repair` config writer); 0002 job-to-trd (auto; moved out of validate W008); 0003 state-json-seed (auto; from W009); 0004 objective-md-backfill (auto; revives `backfillAllObjectives`); 0005 claude-md-block (auto; only where a block exists; corrected `templates/claude-md.md`); 0006 kind-work (confirm; wraps `migrate.cjs`) |
| 3 | 36-05 | `hooks/upgrade-project.js` + hooks.json: fast path, sync apply, detached commit with skip rules, `.planning/.devflow-notices.json` (gitignored), emitted once through `route-results.js` |
| 3 | 36-06 | `lib/global-upgrade.cjs` + `templates/global-claude-md.md` + a call from `sync-runtime.js` after a successful mirror |
| 3 | 36-07 | plan-objective/execute-objective workflows surface `init` `bootstrap`/`bootstrap_objectives` changes in one line; remove the dead import |
| 4 | 36-08 | Dogfood `upgrade` on this repo (stamp); CHANGELOG `[Unreleased]`; repo CLAUDE.md hook inventory; USER-GUIDE; `intent.cjs:249` points at `upgrade`. **No version bump or tag** |

## Migration contract

Each migration exports `id`, `title`, `since`, `safety` (`auto` | `confirm`), `detect(ctx)` →
`{applies, reason}`, and `apply(ctx)` → `{changed:[relative paths], notes}`.

`ctx` = `{projectRoot, userHome, pluginVersion, dryRun}`.

Migrations are **idempotent** and **detection-based**. `detect` reads the files and never trusts the
stamp alone, because hand-edited projects exist. A second `--apply` is a no-op.

## Runtime model (binding — same as objective 35)

- CommonJS, synchronous fs, no new npm dependencies. YAML via `yaml-lite.cjs`.
- `userHome` is injected. **Tests never read or write the real `~/.claude`**; use mkdtemp fake homes.
- Git fixtures in tests set `commit.gpgsign=false` **on the fixture repo only**. Never on this repo
  and never globally.
- Commits go through `df-tools commit` only. If signing fails, stop and report; never bypass.
- **Serialize signing:** same-wave TRDs run one after another in the main checkout, not in parallel
  worktrees.
- One plain command per Bash call. No DevFlow gate is bypassed. Never use port 8080.
- A check that could not run reports `not_available`, never pass.

## TDD contract

36-01, -02, -04, -05 and -06 are `type: tdd`: test list first, RED proven by exit code, then GREEN.
Commits go `test:` → `feat:` → optional `refactor:`. 36-03, -07 and -08 are `type: standard` with
runnable verification.

## Regression baseline

Use `baseline-failures.tsv` in this directory: 21 known environment failures on this machine. That's
objective 35's 10 (the 1Password signing timeouts, which appear only while 1Password is locked, plus
MA-7) and the 11 daemon/PID tests that fail in any git worktree, reproduced on base `0fb49ae`.

Gate command:

```
node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'
```

Classify the results with objective 35's rule:
- A failure listed in the TSV is pre-existing.
- Any other failure is re-run on its own. If it still fails and the TRD's change touched code it
  exercises, it's a regression. If not, it's an environment flake with evidence.
- Never edit the TSV to pass a gate.

## Definition of done

- A temp repo shaped like a v1.x project (flat config.json, JOB.md files, no state.json, an
  unversioned CLAUDE.md DEVFLOW block):
  - `upgrade --check` lists 0001–0005 as `auto` and 0006 as `confirm`.
  - `upgrade --apply` changes exactly those files, stamps the version, and writes a backup outside
    the repo.
  - A second `--apply` reports nothing to do.
- The hook, simulated at SessionStart in a behind project, applies and makes one background commit
  containing only `changed_files`. With a rebase in progress there is no commit, and the notice is
  emitted exactly once.
- Global, with a fake HOME:
  - Legacy files are moved, not deleted.
  - An existing hand-written "DevFlow Routing" section gets a notice and no change on the first run.
  - After `upgrade --global --confirm` the block exists.
  - A template bump rewrites only the block.
- `validate health` reports W040 on a behind project, and `/devflow:status check --migrate` runs
  `upgrade`.
- The regression baseline holds.

## Out of scope

- Adopting non-DevFlow repos (objective 37).
- The command-reference checker, staleness advisories and the cleanup of DevFlow's own stale docs
  (objective 38).
- A release version bump or tag.
