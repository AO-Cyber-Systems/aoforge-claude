---
objective: 72-install-and-naming-cleanup
trd: "22"
subsystem: docs
tags: [docs, rename, planning-docs, rename-guard]
requirements: [INST-06]
requires:
  - objective: 72
    provides: "72-21: AOForge 3.0.0 installed, this repository's planning tree moved to .aoforge/ (4f0ed6b8), pre-rename plugin disabled"
provides:
  - "PROJECT.md, REQUIREMENTS.md, ROADMAP.md and STATE.md read AOForge in their live parts; archived milestones, completed requirements and objectives, dated decisions, quick-task rows and the session record keep their DevFlow wording"
  - "CLAUDE.md without the objective 72 transition note; 'Where we left off' states 72's position (3.0.0 released, 72-22 of 26) and the open rollout steps 72-23..72-26"
  - "rename-guard IGNORE_REGION_FILES no longer lists CLAUDE.md, so CLAUDE.md is guarded line for line"
affects: [72-23, 72-24, 72-25, 72-26, 73, 74, 75]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - .aoforge/PROJECT.md
    - .aoforge/REQUIREMENTS.md
    - .aoforge/ROADMAP.md
    - .aoforge/STATE.md
    - CLAUDE.md
    - plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
decisions:
  - "Live vs history rule for the four planning docs: present and future text (titles, project reference, current focus and position, the v1.6 milestone description, Scope, Principles, Distribution, open objectives 73-75, pending requirements, live blockers, file-location paths) uses AOForge names; completed requirement texts, completed objective detail, archived <details> blocks, the v1.1 milestone name, dated decisions and quick-task rows keep their wording"
  - "PROJECT.md frontmatter github_repo now names AO-Cyber-Systems/aoforge-claude (the repository was renamed in 72-19 and origin already points there)"
  - "CLAUDE.md now carries no legacy spelling at all (the guard scans it whole); 'Where we left off' says 'the pre-rename plugin' and keeps only the preserved devflowops product name"
requirements-completed: []
metrics:
  started: 2026-10-09T13:49:59Z
  completed: 2026-10-09T13:58:40Z
  duration: "9 min"
  tasks: 2
  files: 6
  estimate: "estimate trd 72-22: 10 min (P90 19 min), $2.10 (P90 $3.80), 2 tasks, confidence medium (trd_level, n=73)"
tokens_input: 11464089
tokens_output: 51052
tokens_cache_read: 11277071
tokens_cache_write: 186868
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 22: Rewrite the active planning docs and CLAUDE.md in AOForge terms Summary

**This repository's live planning docs and CLAUDE.md now describe AOForge (`aoforge@aocyber`, `aof-tools`, `.aoforge/`, `aoforge-watch`, `aoforge-docs`), the transition note is gone, and the rename guard now scans CLAUDE.md line for line. History keeps its DevFlow wording, and the devflowops platform product keeps its name.**

## Progress
- [x] Task 1: PROJECT.md, REQUIREMENTS.md and ROADMAP.md live parts — ce0b4385
- [x] Task 2: STATE.md and CLAUDE.md, and the guard's ignore-region list — 67993188

## Estimate

`node ~/.claude/aoforge/bin/aof-tools.cjs estimate trd 72-22` (recorded at 13:49:59Z, before any edit; the wave run state was already started by the orchestrator, so `estimate start` was not re-run): **10 min (P90 19 min), $2.10 (P90 $3.80)**, 2 tasks, confidence medium, minutes from TRD-level history (n=73). Actual: about 9 min (13:49:59Z to 13:58:40Z).

## What changed

### Task 1 (ce0b4385): PROJECT.md and REQUIREMENTS.md through the verbs, ROADMAP.md by Edit hunks

- **PROJECT.md** (`planning draft PROJECT.md`, draft byte-equal to live by `cmp`, 41 counted replacements, `doc put`):
  - frontmatter `github_repo: AO-Cyber-Systems/aoforge-claude`; title `# AOForge`.
  - What This Is: `aoforge@aocyber`, plus one sentence that it was named DevFlow (`devflow@aocyber`, repository `devflow-claude`) until 3.0.0.
  - Current Milestone: "aof-tools correctness"; the install bullet adds "the rename to AOForge (3.0.0, Objective 72)".
  - Validated, Active: `.aoforge/` templates, `aof-tools.cjs`, `.aoforge/REQUIREMENTS.md`.
  - Scope: `/aoforge:*`, `.aoforge/`, `aof-tools` everywhere. A new **Rename compatibility** bullet covers the one-release shims, migrations 0012-0014, `gh rebrand` and the pointer release.
  - Principles: the `aoforge-watch` daemon ("shipped v1.1 as `devflow-watch`"), AOForge routing and gates, and `.aoforge/.skill-active`.
  - Distribution: `plugins/aoforge/`, the `aoforge-claude` marketplace slug, `aoforge@aocyber`, and `~/.claude/aoforge/`. The marketplace now names the `devflow` 3.0.0 pointer plugin.
  - Repo Layout: `aoforge-claude/`, `.aoforge/`, `plugins/aoforge/aoforge/bin/aof-tools.cjs`, plus a `plugins/devflow/` pointer line.
  - Context:
    - Objectives 56-64 shipped in 2.14.0.
    - The Pages deploy targets `aoforge-docs` (72-24 / OPS-03).
    - A new paragraph covers the 3.0.0 release (tag `v3.0.0` on b4a9d870) and the open rollout TRDs 72-23..72-26.
  - The footer date was updated.
- **REQUIREMENTS.md** (`doc put`, 7 replacements):
  - header path `.aoforge/todos/pending/`, and "AOForge never enters a secret value";
  - the TOOL group heading "aof-tools correctness (TOOL)";
  - HND-03 `aoforge-watch`, OPS-01 "AOForge never handles the value", OPS-03 `aoforge-docs`;
  - Out of Scope "AOForge entering secrets".
- **ROADMAP.md** (6 Edit hunks):
  - title `# Roadmap: AOForge`;
  - archived-roadmap and MILESTONES pointers under `.aoforge/`;
  - the v1.6 intro (`.aoforge/REQUIREMENTS.md`, "AOForge never enters a secret value");
  - Objective 73 SC-3 (`aoforge-watch`, "AOForge never types or reads a secret");
  - Objective 74 SC-1 ("AOForge never sees the value") and SC-3 (`aoforge-docs`).

### Task 2 (67993188): STATE.md, CLAUDE.md, rename guard

- **STATE.md** (5 Edit hunks):
  - `# AOForge State`; `See: .aoforge/PROJECT.md (updated 2026-10-09 in TRD 72-22, AOForge wording)`.
  - Building: "AOForge (formerly DevFlow Claude)".
  - Current focus: 65-71 complete, 72 at 72-22, 72-23..72-26 open.
  - Ecosystem: the codebase example, so "DevFlow (local platform CLI/daemon)" is kept.
  - Milestone: 30 requirements mapped, 65-71 complete, 72 in progress, 3.0.0 tag on b4a9d870, `.aoforge/milestones/v1.5-*`.
  - Branch: adds #128; the planning-record commits after 11e98cf4 are local and unpushed.
  - The live EST-11 blocker now says `aof-tools calibrate`.
- **CLAUDE.md**:
  - The transition-note region (the markers and the note, 4 lines plus a blank) is deleted.
  - The Rename shims bullet's `IGNORE_REGION_FILES` list drops "this file".
  - "Where we left off" (2026-10-09) states:
    - Objective 72 is at 72-22 of 26.
    - 3.0.0 is released: PR #128 merged as b4a9d870, which carries the `v3.0.0` tag, and the marketplace serves aoforge plus the pointer.
    - The session runs the installed 3.0.0 with the pre-rename plugin disabled, and the tree is `.aoforge/` (4f0ed6b8).
    - The local commits after 11e98cf4 are unpushed.
    - The open rollout steps are 72-23 (the global CLAUDE.md outside-block diff, the marketplace re-point), 72-24 (the vanity PR, the `aoforge-docs` Pages project), 72-25 (the fleet sweep, devflowops among them) and 72-26 (the checkout move and rekey, the follow-up PR).
    - The user's own `doctor --global --fix`.
    - Next: 73-75, which still need doing. Shim removal was added to Still deferred.
  - The stale "Next" items were dropped: the store backfill UAT was done in 55, the 42-53 release in 2.13.x, and migration 0009 is in `migrations_applied`.
- **rename-guard.repo.test.cjs**: CLAUDE.md held no other region, so `'CLAUDE.md'` was removed from `IGNORE_REGION_FILES`, with a one-line comment saying why.

## Items left as history (ambiguous lines listed per the TRD's recovery note)

- REQUIREMENTS.md TOOL-01 ("Every df-tools verb") and TOOL-09 (`.planning/.skill-active`): completed requirement texts, kept. Their group heading was renamed because it labels the live v1.6 list.
- REQUIREMENTS.md INST-01..INST-06 and ROADMAP.md Objective 72 (summary line, goal, SC 2-5, TRD lines): these describe the rename itself, so the legacy names are the subject, not stale wording.
- ROADMAP.md completed Objectives 65-71 detail (`~/.claude/devflow/`, `df-tools`, `.planning/`, `devflow:executor`), the `<details>` archives and the v1.1 milestone name "DevFlow Coordination Layer": history.
- ROADMAP.md progress row "72. Install and naming cleanup": the objective's old short title. `roadmap update-job-progress` keeps the row name, and it is not a product name, so it was left alone.
- STATE.md "Objective complete" lines (for example 45 "DevFlow doctor"), Recent Decisions, Branch State (post-merge, the v1.1 era), the duplicate-branch blocker, the Quick Tasks rows and Roadmap Evolution: history.
- PROJECT.md "there is no `REQUIREMENTS.md`" under Requirements is stale, because v1.6 has one, but it is not a naming issue. Not changed; a candidate one-line fix.
- `scripts/aoforge-rename.cjs:563` (a comment in a file outside this TRD) still says "CLAUDE.md's transition note names the live legacy runtime on purpose". That is the rationale for the region support added in 72-06; past tense would be a cosmetic follow-up.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 | `rg -n -e 'devflow-watch' -e 'devflow-docs' .aoforge/REQUIREMENTS.md .aoforge/ROADMAP.md` (no output: no live or archived match remains in either file) | 1 (no match) | PASS |
| 1 | `cmp <draft> .aoforge/PROJECT.md` and the same for REQUIREMENTS.md before editing (draft = live) | 0 | PASS |
| 2 | `node --test rename-guard.repo.test.cjs doc-refs.repo.test.cjs dispatch-completeness.test.cjs hook-inventory.test.cjs` | 0 | PASS: tests 50, pass 50, fail 0 |
| 2 | `rg -n "rename-guard:ignore" CLAUDE.md` (no output) | 1 (no match) | PASS |
| 2 | `head -3 .aoforge/STATE.md` gives `# AOForge State` | 0 | PASS |
| 2 | `rg -n -i "devflow\|df-tools\|\.planning\|rename-guard:ignore" CLAUDE.md` gives only line 222, `devflowops` (a PRESERVE token) | 0 | PASS |
| key link | `rg -n aoforge-docs .aoforge/REQUIREMENTS.md .aoforge/ROADMAP.md` gives OPS-03 (REQUIREMENTS:58) and Objective 74 SC-3 (ROADMAP:327), with the same name | 0 | PASS |
| truth 2 | `rg -n "Go CLI/daemon\|local platform CLI/daemon" PROJECT.md STATE.md` gives the devflow platform product in 3 places, unchanged | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (TRD gate) | `node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` (after both task commits) | 1 | tests 11942, pass 11906, fail 1, skipped 35, 92.8 s. The same totals as the 72-19 baseline (11942 / 11906 / 1 / 35). The one failure is `roadmap-reconcile.test.cjs` E2E1: its only drift was this TRD's own `72-22` ROADMAP line (the checkpoint SUMMARY existed, the box was not yet ticked) |
| E2E1 after the tick | `roadmap update-job-progress 72` (ticked 72-22, row 22/26), then `node --test plugins/aoforge/aoforge/bin/lib/roadmap-reconcile.test.cjs` | 0 | PASS: tests 63, pass 63, fail 0. The suite is green apart from `micro.test.cjs`, the known temp-dir flake that is excluded by instruction |
| rename guard | `rename-guard.repo.test.cjs` | 0 | PASS: tests 3c and 3d also hold with the shorter list |
| doc-refs | `doc-refs.repo.test.cjs` | 0 | PASS |
| dispatch-completeness | `dispatch-completeness.test.cjs` (CLAUDE.md prose vs dispatcher) | 0 | PASS: no command name was lost with the note, so the recovery path was not needed |
| hook-inventory | `hook-inventory.test.cjs` | 0 | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A drafted PROJECT.md line named the wrong release**
- **Found during:** Task 1. The draft said Objectives 56-64 "shipped in plugin 2.15.0". The CHANGELOG `## [2.14.0]` heading says v1.5 (56-64) shipped in 2.14.0, and 2.15.0 carried 66-67.
- **Fix:** the replacement was corrected to 2.14.0 before `doc put`, so the wrong text was never published.
- **Commit:** ce0b4385

**2. [Ordering] `roadmap update-job-progress 72` ran before `summary post`, not after**
- **Why:** the full suite's E2E1 fails while this TRD's SUMMARY exists and its ROADMAP box is unticked. Ticking first let the gate be re-run green before the Self-Check is written. The tick depends only on the SUMMARY file existing, so the result is the same either way.

Otherwise the TRD was executed as written. PROJECT.md and REQUIREMENTS.md went through `planning draft` and `doc put`, ROADMAP.md and STATE.md through targeted Edit hunks, and nothing was pushed, tagged or sent to a remote.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4.
  1. The live parts read AOForge, and history keeps its words.
  2. The devflowops / DevFlow platform product is intact.
  3. The CLAUDE.md note is gone, its position is current, and the guard list is shortened.
  4. The verbs and hunks were used as specified, and the gates are green.
- Gate failures: none after the 72-22 tick; before it, E2E1 failed on this TRD's in-flight checkbox only.
- INST-06 stays Pending: its global CLAUDE.md, vanity, Pages, fleet and checkout parts are 72-23..72-26.

## Hand-offs

- **72-23..72-26:** CLAUDE.md "Where we left off" now lists your steps. Update it as each one lands. CLAUDE.md is guarded line for line now, so write "the pre-rename plugin" rather than the old name, and note that devflowops is a preserved token.
- **72-26:** STATE.md's Branch line and CLAUDE.md both say the commits after 11e98cf4 are local. The follow-up PR should carry them, and the line should then be updated.
- **Candidate quick fixes:** PROJECT.md "there is no `REQUIREMENTS.md`"; the past-tense comment at `scripts/aoforge-rename.cjs:563`.

## Self-Check: PASSED

- FOUND: commits ce0b4385 (Task 1) and 67993188 (Task 2) in `git log`
- FOUND: `.aoforge/STATE.md` line 1 `# AOForge State`; `.aoforge/PROJECT.md` `# AOForge` and `github_repo: AO-Cyber-Systems/aoforge-claude`
- FOUND: `aoforge-watch` in REQUIREMENTS HND-03 and ROADMAP 73 SC-3; `aoforge-docs` in REQUIREMENTS OPS-03 and ROADMAP 74 SC-3
- FOUND: CLAUDE.md has no ignore region; `IGNORE_REGION_FILES` = USER-GUIDE, `_redirects`, the two migration guides
- MISSING: none
