---
objective: 45-devflow-doctor
trd: "09"
job: 45-09
subsystem: doctor
tags: [doctor, skill, route-intent, docs, dogfood]

requires: [45-01, 45-02, 45-03, 45-04, 45-05, 45-06, 45-07, 45-08, 45-10]
provides:
  - "/devflow:doctor skill (model-invocable; runs df-tools doctor --json, fixes only on --fix or a yes, runs the printed df-tools commit)"
  - "help.md and USER-GUIDE.md entries for /devflow:doctor"
  - "route-intent 'doctor' entry routing explicit doctor intent to /devflow:doctor"
  - "CLAUDE.md and CHANGELOG [Unreleased] documentation of the doctor and the runtime-hygiene changes (DOC-01..03)"
affects: []

tech-stack:
  added: []
  patterns:
    - "Skill is a thin caller of df-tools doctor / df-tools commit: no check logic, no git parsing"
    - "Doctor route is an explicit-phrase regex, so the bare word 'doctor' never fires"

key-files:
  created:
    - plugins/devflow/skills/doctor/SKILL.md
  modified:
    - plugins/devflow/devflow/workflows/help.md
    - plugins/devflow/hooks/route-intent.js
    - plugins/devflow/hooks/route-intent.test.js
    - CLAUDE.md
    - CHANGELOG.md
    - docs/USER-GUIDE.md

key-decisions:
  - "The route-intent entry sits directly after ADOPT and before NEW PROJECT; no existing test changed behaviour (117/117 route-intent tests pass)"
  - "USER-GUIDE.md has a command table and a recovery table, so doctor was added to both"
  - ".planning/.devflow-notices.json is documented as the one in-tree exception (audit allowlist {.skill-active, .edit-override, .devflow-notices.json}), per the orchestrator's decision"

requirements-completed: [DOC-07]

metrics:
  duration: "about 10 minutes"
  completed: 2026-09-30
  tasks: 3
  files: 7
tokens_input: 5541853
tokens_output: 32837
tokens_cache_read: 5397831
tokens_cache_write: 143916
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 45 TRD 09: /devflow:doctor skill, registration, docs, full suite Summary

**`/devflow:doctor [--fix] [--global] [path]` is a model-invocable skill over `df-tools doctor`, it is registered in help, USER-GUIDE and route-intent, and CLAUDE.md and CHANGELOG document the doctor and the move of runtime state out of `.planning/`. The full suite has one failure (`MA-7`, pre-existing).**

## Accomplishments

- **Skill** (`skills/doctor/SKILL.md`): no `disable-model-invocation`. Steps: run `doctor --json` with the `--global` / `--path` flags from `$ARGUMENTS`; render an `id | severity | finding | fixable` table and each report-only `fix_command` verbatim; run `--fix` only when `--fix` was passed, when the user says yes via AskUserQuestion, or when `config-get mode` is `yolo`; after an applied `legacy-runtime-state` fix, run the exact `df-tools commit ... --files ...` line from its `notes`; then show the post-fix report and the manual actions that remain. The objective text says plugin cache dirs are report-only and the index-changing fix is refused while unrelated changes are staged.
- **help.md**: `/devflow:doctor` block after `/devflow:status`, with Usage lines. The doc-refs gate recognises the command through the live skill dir.
- **route-intent**: `doctor` entry matching `devflow doctor`, `diagnose (the) devflow`, `devflow (is|seems|looks) (broken|misbehaving|slow|stale|off)` and `fix (my|the) devflow (setup|install|installation|environment)`. It does not fire on "ask the doctor about it", "doctor's appointment tomorrow", "the doctor pattern in this codebase" or a bare "devflow".
- **CLAUDE.md**: skills count 33 to 34 (live count, `ls plugins/devflow/skills | wc -l`); a `**Doctor**` bullet; sync-runtime digest marker (`.plugin-digest`, `lib/runtime-digest.cjs`) in both places it is described; the awareness cache location under `awareness-cache-populate`; migration 0008 nested coverage; the hook-marker store, the `planning-writes.audit.test.js` allowlist and `DEVFLOW_HOOK_MARKER_DIR` under verify-commits / verify-completion. The progress-guard line already named its out-of-repo location.
- **CHANGELOG [Unreleased]**: Added (doctor + skill; the runtime-dotfile audit guard). Changed (awareness cache out of the repo, no legacy fallback; hook markers out of `.planning/`; sync-runtime same-version re-mirror; 0008 nested).
- **USER-GUIDE.md**: a command-table row and a recovery-table row for `/devflow:doctor`.

## Deviations from Plan

### Auto-fixed Issues

None. The TRD was executed as written.

### Notes

- The TRD expected the dogfood run to report an error for the in-tree awareness cache. `legacy-runtime-state` reports it as a `warn` (fixable), which is the check's actual severity. No change was made.
- The awareness cache entry the TRD called 640KB is not in `awareness-state` findings; that check reports `no awareness state` because the new out-of-tree store is empty on this machine.
- Follow-up: `templates/global-claude-md.md` (the global routing block) does not list `/devflow:doctor` yet. It was left untouched on purpose because its managed-block version bump ripples into migrations.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: skill + help.md | `node --test bin/lib/doc-refs.repo.test.cjs bin/lib/doc-refs.test.cjs` (32/32) | 0 | PASS |
| 2: route-intent doctor route | `node --test hooks/route-intent.test.js` (117/117) | 0 | PASS |
| 3: docs + full suite | `npm test` (5800 tests, 5767 pass, 1 fail, 32 skipped) | 1 (MA-7 only) | PASS (only the documented failure) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (9b7bc21) | `node --test plugins/devflow/hooks/route-intent.test.js` (2 fail: INTENT_MAP list lacks `/devflow:doctor`, fire case gets no match) | 1 | FAIL (correct) |
| GREEN (45cf77f) | `node --test plugins/devflow/hooks/route-intent.test.js` (117/117) | 0 | PASS (correct) |
| REFACTOR | none needed | n/a | n/a |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none defined | n/a | n/a |
| test | `node --test plugins/devflow/hooks/route-intent.test.js plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 | PASS |
| wave | `npm test` | 1 | PASS (5800 tests: 5767 pass, 1 fail, 0 cancelled, 32 skipped; the one failure is `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN` in `bin/handoff-e2e.test.cjs`, known to fail on the base commit) |

## Read-only dogfood run

Command (no `--fix`, real HOME): `node plugins/devflow/devflow/bin/df-tools.cjs doctor --path /Users/justin/dev/devflow-claude`, then the same with `--json`. JSON: `schema_version 1`, `status degraded`, `summary {ok 7, warn 4, error 0, fixable 2}`, `fixes []`.

No-change confirmation: `git status --porcelain` was byte-identical before and after (only the nine pre-existing untracked files). A `stat` snapshot (path, size, mtime) of every entry under `~/.claude/devflow/backups` and `~/.claude/devflow/state` was identical before and after once sorted. `~/.claude/devflow/state` is empty; the four backup repo dirs and `.registry.json` / `.last-prune.json` are untouched. The findings were not acted on.

```
df-tools doctor 2.11.0 (report) — project: /Users/justin/dev/devflow-claude

[ok]    runtime-mirror — runtime mirror 2.11.0 matches installed plugin 2.11.0 (content digest equal)
[warn]  plugin-cache — 2 stale plugin cache dir(s) besides installed 2.11.0: 2.7.1 (4915636 bytes), 2.10.1 (5948763 bytes) (run: # after quitting sessions that use them:
rm -rf /Users/justin/.claude/plugins/cache/aocyber/devflow/2.7.1
rm -rf /Users/justin/.claude/plugins/cache/aocyber/devflow/2.10.1)
[ok]    hooks-registry — 14 registered hook file(s) resolve; 2 DRAFT hook(s) intentionally unregistered
[ok]    model-profiles — models: opus=claude-opus-5, sonnet=claude-sonnet-5, haiku=claude-haiku-4-5
[warn]  legacy-runtime-state — leftover files nothing reads any more: .planning/.awareness-cache.json, .planning/.progress-guard.json (fixable)
[warn]  pending-migrations — project stamped v2.10.1, DevFlow v2.11.0 (fixable)
[warn]  validate-health — validate health: 0 error(s), 47 warning(s): W001 PROJECT.md missing section: ## Core Value; W001 PROJECT.md missing section: ## Requirements; W005 Objective directory "UI-VISUAL-EVAL-CALLOUT" doesn't follow NN-name format; W005 Objective directory "UI-VISUAL-EVAL-DEVFLOW" doesn't follow NN-name format; W005 Objective directory "UI-VISUAL-EVAL-JUDGE" doesn't follow NN-name format; W007 Objective 00 exists on disk but not in ROADMAP.md; W007 Objective 01 exists on disk but not in ROADMAP.md; W007 Objective 02 exists on disk but not in ROADMAP.md; W007 Objective 03 exists on disk but not in ROADMAP.md; W007 Objective 04 exists on disk but not in ROADMAP.md; W007 Objective 05 exists on disk but not in ROADMAP.md; W007 Objective 06 exists on disk but not in ROADMAP.md; W007 Objective 07 exists on disk but not in ROADMAP.md; W007 Objective 08 exists on disk but not in ROADMAP.md; W007 Objective 09 exists on disk but not in ROADMAP.md; W007 Objective 10 exists on disk but not in ROADMAP.md; W007 Objective 11 exists on disk but not in ROADMAP.md; W007 Objective 12 exists on disk but not in ROADMAP.md; W007 Objective 13 exists on disk but not in ROADMAP.md; W007 Objective 14 exists on disk but not in ROADMAP.md; W007 Objective 15 exists on disk but not in ROADMAP.md; W007 Objective 16 exists on disk but not in ROADMAP.md; W007 Objective 17 exists on disk but not in ROADMAP.md; W007 Objective 18 exists on disk but not in ROADMAP.md; W007 Objective 19 exists on disk but not in ROADMAP.md; W007 Objective 20 exists on disk but not in ROADMAP.md; W007 Objective 21 exists on disk but not in ROADMAP.md; W007 Objective 22 exists on disk but not in ROADMAP.md; W007 Objective 23 exists on disk but not in ROADMAP.md; W007 Objective 24 exists on disk but not in ROADMAP.md; W007 Objective 25 exists on disk but not in ROADMAP.md; W007 Objective 26 exists on disk but not in ROADMAP.md; W007 Objective 27 exists on disk but not in ROADMAP.md; W007 Objective 28 exists on disk but not in ROADMAP.md; W007 Objective 29 exists on disk but not in ROADMAP.md; W007 Objective 30 exists on disk but not in ROADMAP.md; W007 Objective 31 exists on disk but not in ROADMAP.md; W007 Objective 32 exists on disk but not in ROADMAP.md; W007 Objective 33 exists on disk but not in ROADMAP.md; W007 Objective 34 exists on disk but not in ROADMAP.md; W007 Objective 35 exists on disk but not in ROADMAP.md; W007 Objective 36 exists on disk but not in ROADMAP.md; W007 Objective 37 exists on disk but not in ROADMAP.md; W007 Objective 38 exists on disk but not in ROADMAP.md; W007 Objective 39 exists on disk but not in ROADMAP.md; W007 Objective 40 exists on disk but not in ROADMAP.md; W007 Objective 41 exists on disk but not in ROADMAP.md (run: node ~/.claude/devflow/bin/df-tools.cjs validate health)
[ok]    skill-markers — no stale skill or edit-override marker
[ok]    guard-state — no guard state
[ok]    awareness-state — no awareness state
[ok]    backups — 107.4 MiB of backups across 4 repos, all within retention

2 fixable — run `df-tools doctor --fix` to apply the safe fixes

status: degraded (ok 7, warn 4, error 0, fixable 2)
```

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (skill exists without disable-model-invocation and calls only `df-tools doctor` / `commit`; help.md lists it and doc-refs passes; route-intent fire and no-fire cases pass; CLAUDE.md updated; CHANGELOG updated; full suite green apart from MA-7)
- Gate failures: MA-7 only (known on base)

## Self-Check: PASSED

- FOUND: plugins/devflow/skills/doctor/SKILL.md
- FOUND commits: 0d0e580 (skill + help), 9b7bc21 (RED), 45cf77f (GREEN), d543e4f (docs)
