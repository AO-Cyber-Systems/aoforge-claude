---
quick: 18
title: Stack profile proposal — per-project .planning/STACK.md with general-purpose default
date: 2026-09-27
status: complete
---

# Quick 18 — Stack profile proposal

## What changed

Added the stack-profile design and its artifacts. These are docs, reference, template and schema
files only. Nothing is wired into agents, skills, hooks or df-tools.

| Path | What |
|---|---|
| `docs/PROPOSAL-stack-profile.md` | Design: audit of stack opinions in core; Go/Dart/Flutter upstream AI tooling as the standard; file spec, tiers, per-agent slicing; implementation plan; relationship to PROPOSAL-stack-packs |
| `plugins/devflow/devflow/references/stack-general.md` | Bundled default profile (`id: general`); stack-free principles; every command `discover` |
| `plugins/devflow/devflow/templates/stack.md` | Annotated template for `.planning/STACK.md` |
| `plugins/devflow/devflow/schemas/stack-profile.schema.json` | JSON Schema (draft 2020-12) for profile frontmatter |
| `docs/stack-profiles/{go,dart,flutter}.md` | Example tier-2 profiles (not shipped in core; honours the no-stack-logic-in-core rule) |

## Evidence

- All 7 files are `cmp`-identical to the pre-validated drafts.
- All 5 profiles (general, go, dart, flutter, and the template's frontmatter) validate against
  the schema with `jsonschema`, and parse with the repo's own `yaml-lite.cjs`.
- Every `loop`/`gates`/`regenerate`/`runtime_check` key resolves to a command through the
  profile's `extends` chain.
- `frontmatter.cjs` does **not** parse flow maps, which is recorded in proposal §6 step 1.

## Test suite

`npm test` does not complete on this machine. The cause is the environment, not this change:

- Global git config has `commit.gpgsign true` with `gpg.ssh.program` set to 1Password's
  `op-ssh-sign`. Any test that commits in a temp repo waits on a 1Password approval and times out.
- `micro.test.cjs` hangs indefinitely (`--test-timeout=0`). It **also hangs on a clean
  worktree of base `09a06ba` without these files**, killed at 150 s.
- Excluding `micro.test.cjs`: 3450 tests, **3408 pass**, 32 skipped, **10 fail**.
  - 9 of the 10 are ~60 s timeouts in tests that `git commit` in temp repos:
    `df-tools.test.cjs` `--files` commit cases ×4, `project-state.test.cjs` cases 21a/23/26/29,
    and `verify-commits.test.js` Test 5.
  - The 10th is `handoff-e2e` MA-7, an auth/env-dependent test.
  - None reads `templates/`, `references/`, `schemas/` or `docs/`.
- Fix (not applied; out of scope): the test git helpers should set `commit.gpgsign=false` in their
  temp repos, e.g. `git -c commit.gpgsign=false commit` or `GIT_CONFIG_GLOBAL=/dev/null`.

The executor stopped at its 50-turn limit after the copy step. Its commit was blocked on the same
signing prompt. The orchestrator verified the copies, ran the suite and wrote this summary.
