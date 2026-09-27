---
objective: 36-upgrade-in-place
trd: "04c"
subsystem: upgrade / migrations
tags: [upgrade, migration, claude-md, managed-block, map-codebase, tdd]
requires: ["36-01 upgrade runner + fixtures", "36-02 managed-block.cjs"]
provides:
  - "migration 0005 claude-md-block (auto) + exported loadClaudeMdTemplate() -> {version, rules}"
  - "corrected, versioned templates/claude-md.md (template_version 2)"
  - "map-codebase writes <!-- DEVFLOW:START v=<template_version> src=claude-md --> markers"
affects: ["36-05/36-06 upgrade surfaces (0005 now in the default registry)", "objective 38 (managed-block reuse)"]
tech-stack:
  added: []
  patterns:
    - "Section-scoped managed-block update: slice one owned section out of the block content, hand the whole content to upsert"
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/migrations/0005-claude-md-block.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0005-claude-md-block.test.cjs
  modified:
    - plugins/devflow/devflow/templates/claude-md.md
    - plugins/devflow/devflow/workflows/map-codebase.md
    - plugins/devflow/skills/map-codebase/SKILL.md
decisions:
  - "0005 owns only the # Development Rules section of the CLAUDE.md DEVFLOW block; every other section is project-synthesised and left byte-identical"
  - "0005 never downgrades: a block whose v is newer than the template's template_version is skipped (detect false)"
metrics:
  duration: "~20 min"
  completed: 2026-09-27
  tasks: 2
  files: 5
---

# Objective 36 TRD 04c: Migration 0005 claude-md-block Summary

Migration 0005 updates an existing project CLAUDE.md DEVFLOW block. It rewrites only the DevFlow-owned
`# Development Rules` section from the corrected template, which is now `template_version: "2"`, says
Objectives instead of Phases and uses `~/.claude/devflow/` paths. It also stamps the marker
`v=2 src=claude-md`. It never adds a block. map-codebase now writes the same versioned marker.

## What was built

- **`templates/claude-md.md`** now has `template: claude-md` / `template_version: "2"` frontmatter.
  The rules say "Objectives chain automatically" and point to `~/.claude/devflow/references/{tdd,anti-patterns}.md`,
  in both the File Template and the Good Example. The example markers are `<!-- DEVFLOW:START v=2 src=claude-md -->`.
  An ownership note sits under "## File Template", and the Merge-strategy bullets now use the versioned marker.
- **`migrations/0005-claude-md-block.cjs`** (auto, since 2.11.0) depends only on managed-block, fs and path.
  - `loadClaudeMdTemplate()` reads `template_version` with a regex inside the leading `---` fence. It
    returns the `# Development Rules` section of the first ```markdown fence under "## File Template",
    with trailing blank lines trimmed.
  - `detect` returns false in these cases: no CLAUDE.md; no block ("never adds one"); a
    ManagedBlockError, i.e. duplicate or unterminated blocks (the error message becomes the reason);
    a block newer than the template. It applies when the block is legacy or stale (`isStale`), or when
    the rules section is missing or differs from the template (drift).
  - `apply` replaces the rules section by string slicing. The new section is `rules + '\n\n'`, or just
    `rules` when it is the last section. When the block has no rules section, `apply` inserts it as the
    first section and keeps any leading blank line. It writes through `managedBlock.upsert(..., {v, src:'claude-md'})`.
    If `read` throws, nothing is written. It never calls upsert when there is no block. `dryRun` writes nothing.
- **map-codebase** (`workflows/map-codebase.md`) now uses the versioned marker from the template's
  `template_version`. Legacy unversioned markers count as the same block and get replaced. The
  Development Rules section is copied verbatim from the template. The workflow stops on duplicate or
  unterminated blocks. The success criteria and the SKILL checklist (`skills/map-codebase/SKILL.md:75`)
  name the versioned markers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Never downgrade a newer block**
- **Found during:** Task 1 (design of detect)
- **Issue:** The TRD's detect rule ("stale OR rules differ") would treat a `v=3` block written by a
  future DevFlow as drift. apply would then rewrite its rules from the v2 template and restamp it `v=2`,
  which is a silent downgrade.
- **Fix:** When `compareVersions(block.v, template_version) > 0`, detect returns
  `{applies:false, reason: /newer than template/}`. Covered by an added test 15.
- **Files modified:** 0005-claude-md-block.cjs, 0005-claude-md-block.test.cjs
- **Commit:** 96fe12f (test), 1a401bd (impl)

**2. [Rule 2] CRLF tolerance in the rules comparison**
- The rules heading regex accepts a trailing `\r`. The comparison normalises `\r\n` and trailing
  whitespace, so a CRLF CLAUDE.md whose rules already match is not rewritten on every run. No dedicated
  test (outside the 14-case list). The bytes outside the block still come from managed-block's
  slice-based replace, which 36-02 already tests for CRLF.

Otherwise the TRD was executed as written.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Corrected template + migration 0005 | `node --test plugins/devflow/devflow/bin/lib/migrations/0005-claude-md-block.test.cjs` | 0 (15/15 pass) | PASS |
| 1: done check | `rg -n "Phases\|see \.claude/devflow" plugins/devflow/devflow/templates/claude-md.md` | 1 (no output) | PASS |
| 2: map-codebase versioned marker | `rg -n "DEVFLOW:START v=" plugins/devflow/devflow/workflows/map-codebase.md plugins/devflow/skills/map-codebase/SKILL.md` | 0 (map-codebase.md:273,275,281,401; SKILL.md:75; "verbatim" at :270) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/migrations/0005-claude-md-block.test.cjs` | 1 (15/15 fail: MODULE_NOT_FOUND; test 3 on missing frontmatter) | FAIL (correct) |
| GREEN | same | 0 (15/15 pass) | PASS (correct) |
| REFACTOR | none needed | n/a | n/a |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| migrations + managed-block + upgrade | `node --test` over 0001..0006 tests, `managed-block.test.cjs`, `upgrade.test.cjs` (listed explicitly) | 0 (107/107) | PASS |
| wave regression (baseline-relative) | `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` | 1 (1 failure, pre-existing) | PASS |

**Regression gate, observed totals (information only):** tests 3720, pass 3687, fail 1, skipped 32,
cancelled 0 (duration 42.9 s). Output was kept in the session scratchpad and not written to the repo.

| Failing test | File | Classification |
|---|---|---|
| MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path | `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` | **pre-existing** (baseline-failures.tsv line 16) |

No candidate regressions. `baseline-failures.tsv` was not edited. All 15 new tests pass.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (template frontmatter/rules/markers; detect iff an existing single stale/drifted block; apply touches only the rules section; idempotent + dryRun-safe; map-codebase versioned marker + verbatim rules)
- Gate failures: None
- 0005 was never run against this repo's CLAUDE.md. All tests use mkdtemp fixture projects and a fake HOME.

## Open Issues

- None blocking. map-codebase still prepends a new block to a CLAUDE.md that has no markers, which is
  unchanged behaviour. Only 0005 is barred from adding blocks.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/migrations/0005-claude-md-block.cjs
- FOUND: plugins/devflow/devflow/bin/lib/migrations/0005-claude-md-block.test.cjs
- FOUND: commits 96fe12f, 1a401bd, b9fc98a (`git log --oneline be668ce..HEAD`)
