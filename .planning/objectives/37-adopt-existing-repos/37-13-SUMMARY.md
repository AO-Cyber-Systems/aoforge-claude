---
objective: 37-adopt-existing-repos
job: "13"
subsystem: testing
tags: [adopt, e2e, flutter, dart, simulated-run, structural-checker, generate-claude-md]

requires:
  - objective: 37-01..37-12
    provides: the adopt skill, adopt.md/map-codebase.md workflows, adopt-cli.cjs, adopt.cjs, the flutter-app/adopt-e2e-assert fixtures, and 37-11/37-12's proven command sequence
provides:
  - "E2E proof (a), Flutter: the simulated run on a Flutter app fixture passes the structural checker, and map-codebase's generate_claude_md is exercised end-to-end (map writes the versioned CLAUDE.md block, scaffold correctly keeps it)"
affects: []

tech-stack:
  added: []
  patterns:
    - "Task-tool-unavailable mapper fallback (reused from 37-11/37-12): perform each of the 4 mapper foci (tech, arch, quality, concerns) directly in sequence, writing the same 8 .planning/codebase/*.md documents the parallel agents would have written"
    - "generate_claude_md exercised end-to-end: the map step writes CLAUDE.md with the versioned DEVFLOW block BEFORE `adopt scaffold` runs, so scaffold's own claude_md-exists check finds it and reports claude_md: \"unchanged\" (adopt.cjs's internal wording: \"kept the existing\") rather than creating/prepending a second block"

key-files:
  created:
    - ".planning/objectives/37-adopt-existing-repos/37-13-SUMMARY.md"
  modified: []

key-decisions:
  - "Reused 37-11/37-12's exact command sequence and cwd/HOME/--cwd discipline rather than re-deriving it, per this TRD's binding rules"
  - "Wrote CLAUDE.md during the map step (before adopt scaffold), synthesizing it from the 8 codebase-map documents per map-codebase.md's generate_claude_md step and the claude-md.md template — this is what let scaffold's claude_md check observe an existing versioned block and report \"unchanged\" (kept), satisfying this TRD's must_haves requirement to exercise generate_claude_md specifically"

requirements-completed: ["ADP-06"]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: ~55min
completed: 2026-09-28
---

# Objective 37 TRD 13: Simulated `/devflow:adopt` run — Flutter app (E2E proof a) Summary

**An agent followed the checkout's `skills/adopt/SKILL.md` + `workflows/adopt.md` verbatim, unattended, against a scratch Flutter-app fixture (no Flutter SDK required — nothing is built or run); the structural checker (`adopt-e2e-assert.cjs check`) reports every check `ok: true`, exit 0, and the map step's `generate_claude_md` synthesis is confirmed exercised — scaffold's own `claude_md` check reports `"unchanged"` (kept the block the map step wrote) rather than creating a second one — with no real repo or real `~/.claude` touched.**

## Runtime paths

- Fake HOME: `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/93fad3ef-03e9-445d-8200-6b34fdb012b2/scratchpad/adopt-sim-37-13/home`
- Fixture repo (`$ARGUMENTS` / `$TARGET`): `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/93fad3ef-03e9-445d-8200-6b34fdb012b2/scratchpad/adopt-sim-37-13/flutter-app`
- Invocation form: `[path]` from the repo root as cwd (cwd ≠ fixture) — every `df-tools.cjs` call used `--cwd "$TARGET"` from `/Users/justin/dev/devflow-claude`, with `HOME=<fake home>` prefixed to every `node`/`git` call touching the fixture.

## Setup

| Command | Result |
|---|---|
| `mkdir -p <scratch>/adopt-sim-37-13` | ok |
| `adopt-fixtures.cjs home <home>` | `{"home":"<home>"}` |
| `adopt-fixtures.cjs make flutter-app <fixture> --home <home>` | `{"root":"<fixture>"}` |
| `ls -la ~/.claude/devflow/backups` (before) | `devflow-claude-d3dccfe9` only — saved to `real-backups-before.txt` |

Fixture contents (7 files, Dart/Flutter, SDK `>=3.0.0 <4.0.0`, no third-party pub packages, no CI
file): `pubspec.yaml`, `lib/main.dart` (`runApp(const HabitApp())`), `lib/src/app.dart`
(`MaterialApp`/`Scaffold`/`AppBar` shell, hardcoded `const` habit list), `lib/src/habit_list.dart`
(`ListView` over `ListTile`s), `test/habit_list_test.dart` (one `testWidgets` case),
`analysis_options.yaml` (`flutter_lints`), `README.md`.

## Workflow steps followed (adopt.md, verbatim, non-interactive)

| Step | Command | Result |
|---|---|---|
| `resolve_target` | n/a — target = fixture path (exists) | continue |
| `preflight` | `df-tools --cwd <fixture> adopt preflight` | `route: "adopt"`, `repo_state.state: "brownfield"` (not `scratch` — fixture lives under `/private/tmp/...`, same as 37-11/37-12), `primary_lang: "dart"`, `is_scratch_dir: false` |
| `begin` | `df-tools --cwd <fixture> adopt begin` | `created_branch: true`, branch `devflow/adopt`, marker written, `base_sha: 8e00a03` |
| `begin` (marker) | `df-tools --cwd <fixture> skill-active --start adopt` | `.planning/.skill-active` written |
| `map` (mapper foci) | Task tool unavailable → performed all 4 mapper foci (tech, arch, quality, concerns) directly, writing the same 8 documents to `<fixture>/.planning/codebase/` | STACK.md(34), INTEGRATIONS.md(33), ARCHITECTURE.md(43), STRUCTURE.md(45), CONVENTIONS.md(40), TESTING.md(38), PATTERNS.md(38), CONCERNS.md(37) — all >20 lines, none flagged short |
| `map` (`generate_claude_md`) | Read the 8 docs + `~/.claude/devflow/templates/claude-md.md`; synthesized and wrote `<fixture>/CLAUDE.md` wrapped in `<!-- DEVFLOW:START v=2 src=claude-md -->` / `<!-- DEVFLOW:END -->` (no prior CLAUDE.md existed — fresh-file branch) | 72-line CLAUDE.md: Project Overview, Development Rules (verbatim), Code Style, Architecture Rules, File Placement, Testing Requirements, Code Patterns, Critical Warnings, Common Commands — all sourced from the 8 maps just written |
| `map` (`scan_for_secrets`) | `grep -E '(sk-\|ghp_\|AKIA...)' .planning/codebase/*.md CLAUDE.md` | no match (exit 1 = clean); non-interactive mode does not pause on this regardless |
| `map` (`commit_codebase_map`) | skipped per `map-codebase.md`'s `<non_interactive_mode>`: *"skipped. `/devflow:adopt` makes the only commit for the whole run."* | no separate map commit made |
| `infer_project` | Wrote `<fixture>/.planning/PROJECT.md` (`kind: app`, `default_work: feature`) and `<fixture>/.planning/.adopt-inferences.json` (11 entries: kind, default_work, core_value, 4 Validated, 4 Constraints) | kind=`app` at **high** confidence (`lib/main.dart` `runApp(const HabitApp())`, no server/CLI/plugin evidence anywhere); default_work and core_value at **medium** (no repo doc states otherwise) |
| `scaffold` | `df-tools --cwd <fixture> adopt scaffold` | created `.planning/{STATE,ROADMAP,STACK}.md`; **`claude_md: "unchanged"`, `CLAUDE.md` in `skipped`** — scaffold found the versioned block the map step had already written and left it alone, rather than creating/prepending a new one; `stack.action: "written"`, `ok: true`; upgrade migrations `0001`,`0003` applied; backup written under the **fake** home's `.claude/devflow/backups/flutter-app-1f99a0ae/...` |
| `health` | `df-tools --cwd <fixture> validate health --raw` | `status: "healthy"`, `errors: []` — repair step skipped (not needed) |
| `report` | `df-tools --cwd <fixture> adopt report` | `needs_review`: 6 rows (3 `low` — no command evidence for `test`/`lint`/`build`; 3 `medium` — `default_work`→feature, `core_value`, and the missing-`pubspec.lock` constraint); `redactions: 0`; `health_errors: []`; `commit_files`: 16 paths (all under `.planning/` or `CLAUDE.md`); `commit_message: "chore(devflow): adopt repository (DevFlow v2.10.1)"` |
| `commit` (end marker) | `df-tools --cwd <fixture> skill-active --end` | `removed: true` |
| `commit` | `df-tools --cwd <fixture> commit "chore(devflow): adopt repository (DevFlow v2.10.1)" --files <16 paths>` | `committed: true`, hash `d29724d` |
| `summary` | `git -C <fixture> log --oneline -3` (HOME=fake) | `d29724d chore(devflow): adopt repository (DevFlow v2.10.1)` / `8e00a03 init` — exactly one adopt commit above `init` |

**No question was asked at any point.** The workflow reached its `summary` step unattended.

## generate_claude_md — exercised, per this TRD's must_haves

This TRD specifically requires proof that the map step's `generate_claude_md` synthesis ran (not
just that a CLAUDE.md happened to exist). Evidence:

1. `<fixture>/CLAUDE.md` did **not** exist before the `map` step (confirmed: fixture-factory output
   listed above has no `CLAUDE.md`).
2. The `map` step wrote it with the versioned marker `<!-- DEVFLOW:START v=2 src=claude-md -->`,
   content synthesized from the 8 just-written `.planning/codebase/*.md` documents, following the
   `claude-md.md` template's section structure (Project Overview ← STACK/ARCHITECTURE; Code Style ←
   CONVENTIONS; Architecture Rules ← ARCHITECTURE; File Placement ← STRUCTURE; Testing Requirements
   ← TESTING; Code Patterns ← PATTERNS; Critical Warnings ← CONCERNS/INTEGRATIONS; Common Commands ←
   STACK; Development Rules copied verbatim per the template's instruction).
3. `adopt scaffold` ran **after** and reported `"claude_md": "unchanged"` with `CLAUDE.md` in its
   `skipped` list — this is `adopt.cjs`'s "already exists" branch (`claudeBlock` truthy →
   `claudeAction = 'unchanged'`), the exact code path that only fires when a versioned block is
   already present. Had the map step not run `generate_claude_md`, scaffold would instead have taken
   the `created`/`prepended` branch.
4. The structural checker's `claude_block_versioned` check independently confirms `v=2 src=claude-md`
   is present in the committed file.

**Conclusion:** the map step's `generate_claude_md` ran and produced the block; scaffold correctly
recognized and kept it (`"unchanged"` = "kept the existing", per `adopt.cjs`'s own report wording).

## Deviations

1. **[Expected, pre-declared, reused from 37-11/37-12] Task-tool mapper fallback.** `adopt.md`'s
   `map` step explicitly authorizes: *"If the Task tool is unavailable in this run, perform each
   mapper focus (tech, arch, quality, concerns) yourself in sequence instead of spawning agents."* As
   this executor agent cannot spawn subagents per this TRD's binding rules, all 4 mapper foci were
   performed inline, writing the same 8 `.planning/codebase/*.md` documents a parallel agent run
   would have produced.

No other deviations. No auto-fixes (Rules 1-3) were needed — every step succeeded on the first
attempt.

## Structural checker (acceptance command)

`HOME=<fake home> node .../adopt-e2e-assert.cjs check <fixture> --home <fake home>` → **exit 0**,
`"ok": true`, all 13 checks `ok: true`:

| Check | ok | Detail |
|---|---|---|
| `branch_is_adopt` | true | HEAD branch: devflow/adopt |
| `one_commit` | true | commit count since base_sha: 1 |
| `tree_clean` | true | clean |
| `not_pushed` | true | no upstream; no remote branch contains HEAD |
| `health_no_errors` | true | errors: [] |
| `stack_valid` | true | ok |
| `roadmap_zero_objectives` | true | 0 entries under .planning/objectives |
| `claude_block_versioned` | true | v=2 src=claude-md |
| `stamp_current` | true | stamp version 2.10.1, expected 2.10.1 |
| `report_needs_review` | true | heading present; 3 low/medium field(s) accounted for |
| `project_kind_valid` | true | kind="app" default_work="feature" |
| `commit_contents` | true | 16 file(s), all under .planning/ or CLAUDE.md |
| `no_secrets` | true | clean |

## Needs-review rows (ADOPT-REPORT.md, from `adopt report` JSON)

| # | Field | Confidence | Detail |
|---|---|---|---|
| 1 | no command evidence for `test` | low | no CI file/Makefile declares the test command |
| 2 | no command evidence for `lint` | low | no CI file/Makefile declares the lint command |
| 3 | no command evidence for `build` | low | no CI file/Makefile declares the build command |
| 4 | `default_work` | medium | inferred `feature`, no repo doc states otherwise |
| 5 | `core_value` | medium | inferred from the single-screen widget tree + one-line README |
| 6 | constraint: missing `pubspec.lock` | medium | no lockfile committed |

This is the exact TRD gotcha: the fixture has no CI file, so all three of the `test`/`lint`/`build`
loop-command rows correctly surface as needs-review (`low` confidence, `(none)` inferred) rather than
being silently invented or silently dropped. 8 `high`-confidence inferences (kind + 4 Validated + 3
of the 4 Constraints) all landed in the accepted set. No secret-scan finding (0 redactions). Kind
rubric landed on `app` (evidence: `lib/main.dart` `runApp(const HabitApp())` — a Flutter end-user
application entry point, no server/CLI/plugin evidence anywhere) — the only kind with direct
evidence.

## Gotcha check — Flutter UI scope detector / ui-eval gates NOT invoked

Per this TRD's `<gotchas>`: the Flutter UI scope detector and ui-eval gates belong to planning, not
adoption. Confirmed: `adopt.md`'s steps (`preflight`/`begin`/`map`/`infer_project`/`scaffold`/
`health`/`report`/`commit`/`summary`) never reference `flutter-ui-bootstrap`, `ui-eval`, or any
planning-time gate; none of the `df-tools` subcommands invoked above touch those paths. No defect
found.

## Real-home check

`ls -la ~/.claude/devflow/backups` before and after the entire run: identical — only
`devflow-claude-d3dccfe9` present both times (`diff` of the two listings produced no output; saved
at `<scratch>/adopt-sim-37-13/real-backups-before.txt` and `real-backups-after.txt`). The
adopt-scaffold backup for the fixture landed under the **fake** home
(`<fake home>/.claude/devflow/backups/flutter-app-1f99a0ae/...`), never the real one.

## This repo's state

`git status --porcelain` in `/Users/justin/dev/devflow-claude` shows only the pre-existing untracked
files named in this TRD's binding rules (`.planning/objectives/26-*`, `27-*..31-*/.gitkeep`,
`docs/CODEX-PORT.md`, `docs/PROPOSAL-visual-workflow-class.md`,
`plugins/devflow/devflow/references/codex-agent-policy.md`) plus this SUMMARY.md — no code edits
were made; no test-first fix was needed.

## Regression gate (baseline-relative)

Ran: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs'
'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` from the repo root (via a self-contained
`( cd /Users/justin/dev/devflow-claude && ... )` subshell, reusing 37-11/37-12's exact approach —
this harness resets the Bash tool's cwd between calls, and the gate's globs/assertions are
cwd-relative).

**Observed totals:** tests 3975, suites 568, pass 3942, fail 1, cancelled 0, skipped 32, todo 0.

**Failing test:** `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` — `MA-7 doctl auth init
with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path`.

**Classification: pre-existing.** This exact `file:line` + name pair is line 16 of
`.planning/objectives/37-adopt-existing-repos/baseline-failures.tsv` (confirmed by direct grep). No
re-run or further investigation needed (TSV match is definitive per the gate's rule 3) — no candidate
regressions, no fixes required, `baseline-failures.tsv` untouched. Identical result to 37-11's and
37-12's runs of the same gate.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Follow /devflow:adopt verbatim on the Flutter fixture | `git -C <fixture> log --oneline -3` | 0 | PASS (devflow/adopt, 1 commit above init) |
| 2: Structural checks + real-home check + SUMMARY | `adopt-e2e-assert.cjs check <fixture> --home <home>` | 0 | PASS (13/13 checks ok) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| structural checker | `adopt-e2e-assert.cjs check <fixture> --home <home>` | 0 | PASS |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 3/3 (DoD checker all-ok; generate_claude_md exercised by map + kept by
  scaffold, recorded above; unattended/`[path]`-form/`HOME=<fake home>`/real-home-unchanged/
  this-repo-unchanged-except-SUMMARY)
- Gate failures: None (regression gate: 1 pre-existing failure, 0 regressions)

## Self-Check: PASSED

- FOUND: `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/93fad3ef-03e9-445d-8200-6b34fdb012b2/scratchpad/adopt-sim-37-13/flutter-app/.planning/ADOPT-REPORT.md`
- FOUND: fixture commit `d29724d` (`git -C <fixture> log` confirms)
- FOUND: `.planning/objectives/37-adopt-existing-repos/37-13-SUMMARY.md` (this file)
