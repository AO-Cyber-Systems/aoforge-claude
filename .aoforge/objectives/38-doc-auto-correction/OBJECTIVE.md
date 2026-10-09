---
objective: 38-doc-auto-correction
kind: plugin
work: feature
status: registered
---

# Objective 38 — Documentation auto-correction

Registered 2026-09-27; plan with `/devflow:plan-objective 38` after objective 36. Source: the
2026-09-27 audit, section A. Depends on objective 36 (`managed-block.cjs`, the upgrade runner and
notices).

## Goal

DevFlow keeps its own documentation, project documentation and global documentation current as it
runs. Stale DevFlow-owned text is corrected automatically, stale project documents are flagged, and
references to renamed commands can't rot unnoticed.

## Scope sketch (the planner re-cuts)

- **Command-reference checker** against the live skill list, plus a rename map (`references/command-renames.json`: `/df:`→`/devflow:`, progress/resume-work/pause-work→status, add-todo/check-todos→todo, add-objective→objective add, `/devflow:health`→`status check`, …).
  - A CI test over the plugin's own agents, skills, workflows, references and CLI fix text.
  - An auto-fix for managed blocks and `.planning/` docs in projects.
- **Staleness advisories:**
  - STACK.md `provenance.reviewed` older than 90 days.
  - STACK.md declared vs detected drift.
  - `codebase/*.md` maps N commits behind HEAD.
  - The STATE.md W002 regex still matching the retired "Phase N" wording.
- **One-time cleanup of DevFlow's own stale docs:**
  - USER-GUIDE retired commands.
  - 11 `/df:` references in `validate.cjs` fix text.
  - The statusline `/df:update` with no cache writer.
  - `/devflow:health` references.
  - `new-project.md` pointing at `/devflow:progress`.
- **Run points:** mechanical fixes through 36's upgrade runner at session start, and advisories in
  `status` and `telemetry`.

## Requirements (objective-local, planned 2026-09-28)

- **DOC-01 — One rename source.** `DEPRECATION_MAP` + a new `REMOVED_COMMANDS` list in `lib/skill-route.cjs` are the only authored rename data. `lib/doc-refs.cjs` resolves slash-anchored `/df:<x>` and `/devflow:<x>` tokens to ok | prefix | renamed | removed | unknown. The `help.md` table is asserted equal to the map. README and USER-GUIDE point at `/devflow:help` instead of keeping their own lists. No hand-maintained `references/command-renames.json` (no consumer needs it).
- **DOC-02 — CI check.** `npm test` fails when any live DevFlow-owned text has a stale or unknown command reference. The scan covers agents, skills, workflows, references, templates, non-test bin/hooks source, README, CLAUDE.md, USER-GUIDE, site/content and .github. There is an explicit, justified exemption list with positive and sensitivity controls.
- **DOC-03 — Generators fixed.** `misc.cjs` (CONTEXT scaffold), `workstreams.cjs` (worktree STATE), and the `validate.cjs` fix text and `regenerateState` log line no longer write stale commands.
- **DOC-04 — One-time cleanup.** Clean DevFlow's own stale docs: workflows, agents, references, templates, skills, README/USER-GUIDE (including `/devflow:update` and `/devflow:reapply-patches`), the bug template, `assets/terminal.svg`, the dead statusline `/df:update` segment, and the init todo preview.
- **DOC-05 — Project auto-fix.** Migration `0007-doc-refs-fix` is auto, detection-based and idempotent, and gets its backup from the runner. It rewrites renamed and `/df:` references only inside the project CLAUDE.md DEVFLOW block and STATE.md (outside `## Session Log`), then logs one Session Log line. It never touches historical records and never rewrites removed commands.
- **DOC-06 — Staleness advisories (warn only, never repaired):**
  - W050: removed-command reference in a project's live docs.
  - W051: STACK.md `provenance.reviewed` is missing or older than 90 days (configurable).
  - W052: STACK.md declared `languages` vs detected primary language drift.
  - W053: codebase maps are N commits behind HEAD, git-derived and scoped to the repo outside `.planning/`.
- **DOC-07 — W002 retargeted.** It now matches the current `Objective` position fields, counts archived milestone dirs and is no longer repairable, so it can never trigger the destructive `regenerateState`. First tests added.
- **DOC-08 — Run points.** Run points are:
  - `validate health` Check 14
  - `df-tools validate docs`
  - `/devflow:status` shows doc advisories
  - `df-tools telemetry` wired into the CLI and help, with doc advisories merged in

  Mechanical fixes run through the objective-36 runner at session start.
- **DOC-09 — Docs + gate.** Update CHANGELOG [Unreleased], CLAUDE.md (including the correction that only `telemetry` of the objective-31 family is on the CLI) and USER-GUIDE. The full suite must show no regressions vs `baseline-failures.tsv`. No version bump or tag.

## Planning decisions (orchestrator discretion, 2026-09-28)

- Telemetry: `df-tools.cjs` has no `case 'telemetry'`, verified by `df-tools telemetry` returning `Unknown command`. CLAUDE.md is wrong on this point. Wiring takes a case, a help entry and one call, so it gets its own severable TRD (38-11). `context`, `session-audit`, `override` and `transcript-export` stay unwired, and CLAUDE.md is corrected to say so.
- STACK drift MVP: compare the project STACK.md's own `languages` against `detectManifest().primary_lang`, with aliases. The check is silent when `languages` is not declared (`stack init` drafts don't write it).
- Codebase-map staleness: git-derived only, with no template change. Tested on scratch fixture repos.
- `/devflow:<x>` is namespaced by plugin, so the live set is `plugins/devflow/skills` only. The `/devflow:new-monorepo` and `/devflow:monorepo-doctor` references in `plugins/monorepo-standards` are a sibling-plugin issue and out of scope (not scanned).
- Baseline at `100cade`: 4023 tests, 1 failure (MA-7, pre-existing). `baseline-failures.tsv` is carried from objective 37.
