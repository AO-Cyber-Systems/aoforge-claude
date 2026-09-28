---
objective: 38-doc-auto-correction
trd: "05"
subsystem: docs
tags: [doc-refs, deprecation-map, prose, agents, workflows, help]

# Dependency graph
requires: []
provides:
  - "Agents, references, templates, initiatives skill, remaining workflows, bug template and terminal art name only live commands"
  - "help.md `## Removed Skill Names` table fenced by doc-refs ignore markers (the single allowed ignore region)"
affects: [38-01, 38-06, 38-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "doc-refs ignore fence: `<!-- doc-refs:ignore-start — ... -->` / `<!-- doc-refs:ignore-end -->` around the one prose copy of DEPRECATION_MAP"

key-files:
  created: []
  modified:
    - plugins/devflow/agents/project-researcher.md
    - plugins/devflow/agents/verifier.md
    - plugins/devflow/agents/roadmapper.md
    - plugins/devflow/devflow/references/continuation-format.md
    - plugins/devflow/devflow/references/model-profiles.md
    - plugins/devflow/devflow/templates/state.md
    - plugins/devflow/skills/initiatives/SKILL.md
    - plugins/devflow/devflow/workflows/new-project.md
    - plugins/devflow/devflow/workflows/resume-project.md
    - plugins/devflow/devflow/workflows/transition.md
    - plugins/devflow/devflow/workflows/design-review.md
    - plugins/devflow/devflow/workflows/help.md
    - .github/ISSUE_TEMPLATE/bug_report.yml
    - assets/terminal.svg

key-decisions:
  - "roadmapper.md's decimal-objective bullet now says insertion was retired in v1.2 and that `/devflow:objective add` appends the next integer. It no longer points at a removed command; decimals in older roadmaps remain valid history."
  - "help.md's rename table rows were left byte-identical. Only the two fence comments were added, so 38-09 can deep-equal the 13 pairs against DEPRECATION_MAP."

patterns-established:
  - "One fenced rename table: help.md is the only file carrying a doc-refs ignore region."

requirements-completed:
  - "DOC-04 (part B): agents, references, templates, skills, remaining workflows, bug template and terminal art name live commands"
  - "DOC-01 (help table): help.md's Removed Skill Names table is fenced by doc-refs ignore markers (the ONE allowed ignore region; 38-09 asserts it equals DEPRECATION_MAP)"

# Verification evidence
verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

# Metrics
duration: 6min
completed: 2026-09-28
---

# Objective 38 TRD 05: Agents, references, templates, skills and remaining workflows (part B) Summary

**16 stale command references across 13 files now name live commands (`/devflow:milestone new|complete`, `/devflow:todo add|list`, `/devflow:status`, `/devflow:set-profile`, `/devflow:plan-objective`, `/devflow:help`). help.md's 13-row rename table is fenced by the doc-refs ignore markers, and its rows are unchanged.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-09-28T12:24:57Z (exec-context claim)
- **Completed:** 2026-09-28T12:31Z
- **Tasks:** 2/2
- **Files modified:** 14

## Rewrites (file:line old → new)

### Task 1: Agents, references, templates, initiatives skill (`7c3d83e`)

| File:line | Old | New |
|---|---|---|
| `plugins/devflow/agents/project-researcher.md:9` | `/devflow:new-milestone` | `/devflow:milestone new` |
| `plugins/devflow/agents/verifier.md:658` | `/devflow:add-todo` | `/devflow:todo add` |
| `plugins/devflow/agents/roadmapper.md:186` | ``- Created via `/devflow:insert-objective` `` | ``- Retired in v1.2 — new work is appended with `/devflow:objective add` as the next integer; decimals in older roadmaps are history, keep them`` |
| `plugins/devflow/devflow/references/continuation-format.md:172` | `/devflow:new-milestone` | `/devflow:milestone new` |
| `plugins/devflow/devflow/references/model-profiles.md:104` | `/df:set-profile <profile>` | `/devflow:set-profile <profile>` |
| `plugins/devflow/devflow/templates/state.md:114` | `/devflow:add-todo` | `/devflow:todo add` |
| `plugins/devflow/devflow/templates/state.md:117` | `/devflow:check-todos` | `/devflow:todo list` |
| `plugins/devflow/skills/initiatives/SKILL.md:54` | `/df:plan-objective` | `/devflow:plan-objective` |
| `plugins/devflow/skills/initiatives/SKILL.md:64` | `/df:plan-objective` | `/devflow:plan-objective` |

`templates/state.md` lines 114/117 are in the guidance section, not in the file-template fence at lines 9-49.

### Task 2: Remaining workflows, help fence, bug template, terminal art (`872c347`)

| File:line | Old | New |
|---|---|---|
| `plugins/devflow/devflow/workflows/new-project.md:57` | `` Use `/devflow:progress`. `` | `` Use `/devflow:status`. `` |
| `plugins/devflow/devflow/workflows/resume-project.md:130` | `/devflow:check-todos to review` | `/devflow:todo list to review` |
| `plugins/devflow/devflow/workflows/transition.md:466` | `SlashCommand("/devflow:complete-milestone {version}")` | `SlashCommand("/devflow:milestone complete {version}")` (call shape kept) |
| `plugins/devflow/devflow/workflows/transition.md:483` | `` `/devflow:complete-milestone {version}` `` | `` `/devflow:milestone complete {version}` `` |
| `plugins/devflow/devflow/workflows/design-review.md:92` | `/devflow:add-todo` | `/devflow:todo add` |
| `plugins/devflow/devflow/workflows/help.md:446` | — | inserted `<!-- doc-refs:ignore-start — rename table; asserted equal to DEPRECATION_MAP by doc-refs.repo.test.cjs -->` |
| `plugins/devflow/devflow/workflows/help.md:462` | — | inserted `<!-- doc-refs:ignore-end -->` |
| `.github/ISSUE_TEMPLATE/bug_report.yml:48` | `1. Run /df:...` | `1. Run /devflow:...` |
| `assets/terminal.svg:61` | `<tspan class="cyan">/df:help</tspan>` | `<tspan class="cyan">/devflow:help</tspan>` |

The help.md diff contains only the two inserted comment lines (`git diff --unified=0`: `@@ -445,0 +446 @@` and `@@ -460,0 +462 @@`). All 13 table rows (now lines 449-461) are unchanged. They match `DEPRECATION_MAP` in `plugins/devflow/devflow/bin/lib/skill-route.cjs:105-124` pair for pair.

Target commands were confirmed live: `skills/{milestone,todo,status,set-profile,plan-objective,help,objective}/SKILL.md` all exist, and `skills/milestone/SKILL.md` has `argument-hint: "<new|audit|complete|gaps> [args...]"`, so `/devflow:milestone complete {version}` is a valid invocation.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Agents, references, templates, initiatives skill | `rg -n '/df:[a-z]\|/devflow:(insert-objective\|new-milestone\|add-todo\|check-todos)\b' <7 files>` | 1 (no matches) | PASS — no output |
| 2a: Remaining workflows, bug template, terminal art | `rg -n '/df:\|/devflow:(progress\|check-todos\|complete-milestone\|add-todo)\b' <6 files>` | 1 (no matches) | PASS — no output |
| 2b: help.md fence | `rg -c 'doc-refs:ignore-(start\|end)' plugins/devflow/devflow/workflows/help.md` | 0 | PASS — `2` |
| 2c: SVG well-formed | `xmllint --noout assets/terminal.svg` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| must-have sweep (all 14 files, full retired-name regex) | `rg -n '/df:[a-z]\|/devflow:(add-objective\|insert-objective\|remove-objective\|new-milestone\|audit-milestone\|complete-milestone\|plan-milestone-gaps\|add-todo\|check-todos\|pause-work\|resume-work\|progress\|health\|update\|reapply-patches)\b' <14 files>` | 0 | PASS — 13 hits, all `help.md:449-461`, inside the fence at 446/462 |
| help table == DEPRECATION_MAP (manual pre-check for 38-09) | `rg -n -A 18 'DEPRECATION_MAP\s*=' plugins/devflow` | 0 | PASS — 13 pairs match |
| full regression suite | `npm --prefix <worktree> test` | 1 | PASS vs baseline — see below |

### Regression tallies

`npm --prefix /Users/justin/dev/.df-worktrees/devflow-claude/38-05 test`, 80.3s:

- tests **4023** · suites 577 · pass **3963** · fail **10** · cancelled 0 · skipped 50 · todo 0

All 10 failures are daemon/timing tests, and each is listed in `.planning/objectives/38-doc-auto-correction/baseline-failures.tsv`:

| Failing test | In baseline |
|---|---|
| `devflow-watch.test.cjs:145:3` foreground daemon writes PID file… | yes (row 1) |
| `devflow-watch.test.cjs:177:3` start refuses when daemon already running | yes (row 2) |
| `devflow-watch.test.cjs:353:3` C-2 start --project /p (single)… | yes (row 4) |
| `devflow-watch.test.cjs:380:3` C-1 start --project /p1,/p2… | yes (row 5) |
| `handoff-e2e.test.cjs:254:3` write pending → daemon executes… | yes (row 10) |
| `handoff-e2e.test.cjs:271:3` disallowed command produces rejected done record… | yes (row 11) |
| `handoff-e2e.test.cjs:285:3` idempotency: route-results emits once… | yes (row 12) |
| `handoff-e2e.test.cjs:298:3` multi-record: 3 queued commands… | yes (row 13) |
| `handoff-e2e.test.cjs:327:3` LK-1: teardown reaps the daemon… | yes (row 14) |
| `handoff-e2e.test.cjs:344:3` LK-2: SIGTERM kills the daemon… | yes (row 15) |

**Regressions: 0.** No test reads any of the 14 edited files; an `rg` over `*.test.*` for the rewritten strings and file names found only an unrelated prompt-matching assertion in `hooks/route-intent.test.js:210`. The baseline TSV was not edited.

## Deviations from Plan

None - TRD executed exactly as written.

Environment notes, which are not changes to the plan:

1. **The installed df-tools lacks the global `--cwd` flag.** `node ~/.claude/devflow/bin/df-tools.cjs --cwd … exec-context check` failed with `Unknown command: --cwd`, because the home mirror is older than the repo. The preflight and both task commits used the worktree's own bundled `plugins/devflow/devflow/bin/df-tools.cjs --cwd <worktree>`. The preflight then passed (`ok: true`, `base_visible: true`, `is_worktree: true`).
2. **The TRD verify commands use `rg -nE`.** In ripgrep, `-E` is `--encoding`, not extended regex, so the command as written would treat the pattern as an encoding name. The checks were run as `rg -n '<pattern>'`. Ripgrep's default Rust regex already supports `|` alternation and `\b`. 38-09 and future TRDs should drop the `-E`.
3. The first full-suite attempt appended `--test-reporter*` flags after the globs, where `node --test` ignores them. The suite was re-run with stdout redirected to the session scratchpad, and the tallies above come from that run.

## Authentication Gates

None.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (new-project.md:57 reads `Use /devflow:status.`; retired-name sweep hits only the fenced table; fence markers exactly as specified with 13 rows unchanged; roadmapper decimal bullet reworded; state.md / model-profiles.md / initiatives SKILL.md / bug_report.yml / terminal.svg name live commands)
- Gate failures: None

## Self-Check: PASSED

- FOUND: 7c3d83e `docs(38-05): agents, references, templates and initiatives skill name live commands`
- FOUND: 872c347 `docs(38-05): remaining workflows, help rename-table fence, bug template, terminal art`
- FOUND: all 14 files in `key-files.modified` (each one appears in the two commits; no files created)
- No edits to `.planning/STATE.md`, `.planning/ROADMAP.md`, the baseline TSV or any historical planning record
