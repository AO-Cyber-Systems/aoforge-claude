---
objective: 45-devflow-doctor
kind: plugin
work: feature
status: registered
milestone: v1.4
---

# Objective 45 — DevFlow doctor + runtime hygiene

Registered 2026-09-30 at the user's request, following quick-25 (progress-guard state moved out of the repo).
Evidence: the 2026-09-29 session where `.planning/.progress-guard.json` was re-attached to tool results on
every call (~800 tokens each), aodex still tracked it (root and `flutter/.planning/`), and the runtime mirror
stayed at 2.10.1 while 2.11.0 was installed.

## Goal

DevFlow can diagnose and repair the environment problems that make it run suboptimally, and no DevFlow
runtime state churns inside a project's working tree.

## Requirements

- **DOC-01** Awareness cache moves out of the repo to `~/.claude/devflow/state/awareness/<repo-key>.json`
  (repo-key = stable hash of the project root realpath; env override for tests). Every reader and writer follows
  (awareness-cache-populate.js, awareness.cjs, init.cjs, tui skill). No fallback to the legacy in-tree file.
- **DOC-02** Migration 0008 detects and fixes nested runtime state: any tracked `**/.planning/.progress-guard.json`
  / `**/.planning/.awareness-cache.json` (via `git ls-files`). Idempotent, auto.
- **DOC-03** sync-runtime's marker is version + content digest of the bundled `devflow/` tree; a same-version
  build with different content re-mirrors.
- **DOC-04** `df-tools doctor [--fix] [--json] [--path <dir>] [--global]`: read-only by default; each check
  reports id, severity (ok|warn|error), finding, fixable. `--fix` applies only safe, reversible fixes, with
  backups per upgrade conventions. Composes validate health, upgrade, backup-prune, telemetry rather than
  duplicating them.
- **DOC-05** Doctor checks at minimum: runtime mirror vs installed plugin (version + digest; fix = re-mirror);
  stale plugin cache dirs (report only); legacy in-tree runtime state tracked/unignored/present (fix = 0008 +
  delete untracked copies); pending migrations (auto fixable, confirm reported with exact command); validate
  health findings; expired/orphaned `.skill-active` markers (fix = remove); stale guard state + oversized
  awareness state (fix = prune); backup dir size (fix = prune); model-profiles.json model ids (report);
  hooks.json ↔ hook files consistency (report).
- **DOC-06** Safety: a fix never touches working-tree changes beyond its own paths; if the target repo has other
  staged changes, the index-changing fix is reported, not applied.
- **DOC-07** `/devflow:doctor` skill (model-invocable), registered in help, CLAUDE.md (skills count, df-tools
  command list, hooks), route-intent table if appropriate; CHANGELOG [Unreleased]; `npm test` green.

## Constraints

- Strict TDD (kind plugin/cli): failing test committed first.
- Tests use temp dirs + env overrides only; never the real `~/.claude`.
- Do not touch `~/dev/aodex` or any other repo during the build (another session is active there).
- Never use port 8080.

## Success Criteria

1. No DevFlow hook writes a file under a project's `.planning/` on a per-call or per-session basis except planning artifacts.
2. 0008 on a fixture with nested tracked runtime files untracks and ignores all of them; re-run is a no-op.
3. Changing a bundled runtime file without a version bump causes sync-runtime to re-mirror.
4. `df-tools doctor --json` on a fixture reproducing today's aodex/runtime state reports every problem above; `--fix` resolves the fixable ones and a second run is clean.
5. Doctor refuses the index-changing fix when unrelated changes are staged.
6. `/devflow:doctor` exists and is documented; `npm test` green.
