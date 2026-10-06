---
objective: 60-edit-gate-enforces-the-action
trd: "07"
subsystem: hooks
tags: [bash-write-gate, edit-gate, dogfood, docs, changelog]

requires:
  - objective: 60-edit-gate-enforces-the-action
    provides: "gate-bash-writes.js, bash-write-gate.cjs, the session-audit bash_edit_gate replay and the measured default (60-01..06)"
provides:
  - "S1-S13 dogfood evidence for the registered hook on a scratch clone of this repository"
  - "CHANGELOG, CLAUDE.md, USER-GUIDE and docs-site data describing the Bash edit gate, its measured default and its escapes"
affects: []

tech-stack:
  added: []
  patterns:
    - "Dogfood by stdin contract on a scratch clone: the payload is fed to the hook, the command in it is never executed"

key-files:
  created: []
  modified:
    - CHANGELOG.md
    - CLAUDE.md
    - docs/USER-GUIDE.md
    - scripts/gen-docs-data.cjs

key-decisions:
  - "The live Claude Code check is skipped: loading the clone with --plugin-dir would run its SessionStart sync-runtime hook, which rewrites the runtime mirror (~/.claude/devflow) with no override"
  - "Every doc says DEVFLOW_SKIP_EDIT_GATE=1 works only in the environment Claude Code was launched from, never as an inline command prefix on the Bash command (S10b shows the prefix is denied)"
  - "The tracked site/data/devflow.json snapshot is not regenerated: it is not in this TRD's files and the docs build regenerates it (a scratch run shows the new hook renders under Enforcement)"

requirements-completed: [GATE-01, GATE-02, GATE-03, GATE-04, GATE-05]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: 13min
completed: 2026-10-06
---

# Objective 60 TRD 07: Dogfood, document, full suite Summary

**The registered `gate-bash-writes.js` made the right call on all 13 smoke rows on a scratch clone with no live marker, the Bash gate and its measured `warn` default (633/17,957 = 0.035251) are documented in CHANGELOG, CLAUDE.md, USER-GUIDE and the docs-site data, and the full suite passes except two failures that fail the same way at the objective's base commit.**

## Progress
- [x] Task 1: Dogfood the hook on a scratch clone (S1-S13) — (no commit, scratchpad only; recorded below)
- [x] Task 2: CHANGELOG, CLAUDE.md, USER-GUIDE and docs-site data — 426c5644
- [x] Task 3: Full test suite — (no commit; totals and the base comparison below)

## Accomplishments

- No production code changed. The dogfood found no defect, so no gap is recorded.
- CHANGELOG `[Unreleased]`: three `### Added` bullets (the hook; `gates.bashEditGate` with its measured default and numbers; the `session-audit` `bash_edit_gate` replay and the `devflow-bash-edit-gate` category) and one `### Changed` bullet (the shell-text primitives moved to `lib/shell-words.cjs`, no behaviour change, shared by gate-commits and session-audit).
- CLAUDE.md: the `gate-bash-writes.js` bullet rewritten to its final form (forms, never-gated list, escapes, severity, the `warn` default and its measurement, the escape-environment rule, "needs an installed plugin carrying objective 60"), one sentence appended to the `gate-edits.js` bullet, and that bullet's `DEVFLOW_SKIP_EDIT_GATE=1` worded as "set in the environment Claude Code was launched from". Both stay one paragraph.
- USER-GUIDE: a `gate-bash-writes.js` row after `gate-edits.js` in the hooks table (the gate-edits escape cell also names the launch environment) and a "Bash writes and the edit gate" section right after the table: what is gated, what never is, the escapes (with the launch-environment rule and the contrast with gate-commits), the editGate x bashEditGate severity table, the default and how it was decided (the evidence table, the 2% rule, the upper-bound basis, `BASH_EDIT_GATE_DEFAULT`), how to re-measure (`df-tools session-audit --limit 0`, the `bash_edit_gate` key and the raw line), the accepted false negatives, the subshell `cd` approximation and the release note.
- `scripts/gen-docs-data.cjs`: a `HOOK_DOCS['gate-bash-writes.js']` entry and the Bash pointer appended to the `gate-edits.js` purpose. A scratch run of the script (copied to the scratchpad with a symlinked `plugins/`, so the repository's tracked `site/data/devflow.json` was not touched) printed `hooks=20` and rendered the new hook under group Enforcement with escape `DEVFLOW_SKIP_EDIT_GATE=1`.
- Every number in the docs is from `references/bash-edit-gate-evidence.json`: 2,263 files, 2,258 sessions, 138,304 Bash calls, 17,957 ambient, 633 would-deny (python 489, cp 54, redirect 41, sed-i 32, perl-i 14, mv 3, tee 0, node 0), 0.035251 against 0.02, default `warn`.

## Dogfood: S1-S13 on a scratch clone

Scratch clone of this checkout at 87b77e22 (carries waves 1-5), no live skill marker, `commit.gpgsign false`. Payloads fed to `node <clone>/plugins/devflow/hooks/gate-bash-writes.js` on stdin, `cwd` = the clone. `<tracked>` = `plugins/devflow/hooks/gate-commits.js`.

| # | Setup | Command | Expect | Actual |
|---|---|---|---|---|
| S1 | no `bashEditGate` key | `sed -i '' 's/x/x/' <tracked>` | per `BASH_EDIT_GATE_DEFAULT` (warn: ask) | ask |
| S2 | `bashEditGate: strict` | same | deny, names the file | deny, reason names `plugins/devflow/hooks/gate-commits.js` |
| S3 | strict | `cat > <tracked> <<'EOF'` heredoc | deny | deny |
| S4 | strict | `python3 -c "open('<tracked>','w')"` | deny | deny |
| S5a | strict | heredoc whose body holds `sed -i` on `<tracked>` | `''` | `''` |
| S5b | strict | `grep -n "> <tracked>" README.md` | `''` | `''` |
| S5c | strict | `echo "x > y"` | `''` | `''` |
| S6a | strict | `echo hi >> README.md` | `''` | `''` |
| S6b | strict | `echo hi >> .planning/STATE.md` | `''` | `''` |
| S6c | strict | `echo hi > new-untracked.js` | `''` | `''` |
| S6d | strict | `echo hi > <scratchpad>/x.txt` | `''` | `''` |
| S7 | strict + live `.skill-active` | S2 command | `''` | `''` (control: marker removed, S2 command denies) |
| S8 | strict, `agent_type: devflow:executor` | S2 command | `''` | `''` |
| S9 | strict + fresh `.edit-override` | `ls`, then S2 command, then S2 command | `''`, `''`, deny | `''` (marker still on disk), `''` (marker consumed), deny |
| S10 | strict, `DEVFLOW_SKIP_EDIT_GATE=1` in the hook process environment | S2 command | `''` | `''` |
| S10b | strict, no env var; the command text starts `DEVFLOW_SKIP_EDIT_GATE=1 sed -i ...` | inline prefix | deny (a prefix is not in the hook's environment) | deny |
| S11 | strict + `editGate: off` | S2 command | `''` | `''` |
| S12 | strict + `editGate: warn` | S2 command | ask | ask |
| S13 | `bashEditGate: off` | S2 command | `''` | `''` |

All 13 rows (19 hook runs) match their Expect column. The deny reason is `DevFlow ambient mode active — Bash write to tracked source denied: plugins/devflow/hooks/gate-commits.js. Edit and Write are gated the same way. ... Severity: gates.bashEditGate (strict|warn|off) in .planning/config.json.` The ask reason says `needs approval` instead of `denied`.

`git -C <clone> status --porcelain` after the matrix: ` M .planning/config.json` and nothing else, so no tracked source changed and no payload command was ever run. The clone is removed.

S10 sets the variable in the hook's own environment, which models launching Claude Code with it exported. S10b is the case the plan-checker note describes: the same variable written as a prefix in the Bash command text is not in the hook's environment (a hook runs in Claude Code's own process), so it does not bypass the gate. The TRD's gotcha called the inline prefix "the form that reaches the process"; that holds for this stdin smoke (the prefix is on the `node` hook invocation) but not in a live session, which is why every doc says "the environment Claude Code was launched from".

S1 followed the shipped default: with no key, the decision is `ask`, the measured `warn`.

Two runs overlapped with a config edit when first issued in parallel (S11, and the `ls` marker check in S9). Each was re-checked on its own: S11 was re-run after the config was settled, and S9's second row proves the marker survived the `ls` (the S2 command was allowed by the override, then the marker was gone and the third row denied).

## Live Claude Code check

`live check: skipped — the method needs the clone's plugin loaded with --plugin-dir, and that plugin's SessionStart hook sync-runtime.js mirrors its devflow/ tree to ~/.claude/devflow whenever the version or content digest differs (the target path is hard-coded; only DEVFLOW_SKIP_GLOBAL_UPGRADE skips the follow-on global upgrade). The installed mirror is 2.13.1 and has no bash-write-gate.cjs or shell-words.cjs, the clone is 2.13.2 with them, so the run would have rewritten the runtime mirror, which this dispatch forbids. The installed devflow@aocyber plugin has the same name and would shadow the clone in any case.` The stdin smoke is the required evidence.

## Current raw audit line

`node plugins/devflow/devflow/bin/df-tools.cjs session-audit --raw --limit 0` (run in this checkout):

```
bash_edit_gate: ambient_bash_calls 17957, would_deny 633, false_positive_rate 0.035251 (upper bound), threshold 0.02, recommended_default warn
```

It matches `references/bash-edit-gate-evidence.json` exactly (17,957, 633, 0.035251, warn), so there is no delta since 60-06 and the evidence is unchanged.

## Full suite

`npm test` (`node --test 'plugins/devflow/**/*.test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`), run twice.

| Run | tests | pass | fail | skipped | cancelled |
|---|---|---|---|---|---|
| 1 (after the docs commit) | 10,137 | 10,102 | 3 | 32 | 0 |
| 2 (after `roadmap update-job-progress 60` and `state advance-job --objective 60`) | 10,137 | 10,103 | 2 | 32 | 0 |

Failures, each compared with the objective's base commit `05a5b5f4` (the parent of the first 60-01 commit) in a scratch `git worktree add --detach`, with `node_modules` symlinked in (without it node-pty is missing and every handoff test fails for a different reason), removed afterwards:

| Test | Result | At base 05a5b5f4 |
|---|---|---|
| `handoff-e2e.test.cjs` MA-7 "doctl auth init with unset DIGITALOCEAN_TOKEN" | fails in runs 1 and 2 | fails the same way (`stderr should match arch-gap, resolution-failure, or timeout+detector-msg path; got: {"status":"done","exit_code":0,"stderr":""}`). Pre-existing, environmental: `doctl` resolves auth on this machine |
| `stack-drafter-fleet.test.cjs` "github-enterprise-migration: draft has no unaccepted conflict with the committed STACK.md" | fails in runs 1 and 2 | fails the same way (`new conflict: lint ... vs draft discover`, `new conflict: test ... vs draft discover`; 2 !== 0). Pre-existing: depends on `~/dev/github-enterprise-migration`'s committed STACK.md |
| `roadmap-reconcile.test.cjs` E2E1 "reconcile dry-run against this repo ROADMAP shows zero drift" | fails in run 1 only | Not a regression: run 1 happened after the checkpointed `60-07-SUMMARY.md` was on disk but before ROADMAP.md had 60-07 ticked (`trd_summary_exists`, `60-07`, `[ ]` to `[x]`). `roadmap update-job-progress 60` ticked it, and the file then passes alone (63/63) and in run 2 |

`gh-pr-cli` 13j (flaky in the full run in earlier TRDs) passed in both runs.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Dogfood S1-S13 | `node <clone>/plugins/devflow/hooks/gate-bash-writes.js < p-<row>.json` (19 runs), then `git -C <clone> status --porcelain` | 0 each; porcelain ` M .planning/config.json` only | PASS |
| 1: Raw audit line | `node plugins/devflow/devflow/bin/df-tools.cjs session-audit --raw --limit 0` | 0, last line matches the evidence file | PASS |
| 2: Surfaces | `rg -c "gate-bash-writes" CHANGELOG.md CLAUDE.md docs/USER-GUIDE.md scripts/gen-docs-data.cjs` | 0 (1, 2, 2, 2 matches) | PASS |
| 2: Inventory and doc refs | `node --test .../hook-inventory.test.cjs .../doc-refs.repo.test.cjs` (19 tests), `hook-inventory.test.cjs` again after the last CLAUDE.md edit (5 tests) | 0 | PASS |
| 2: Data script | scratch copy of `scripts/gen-docs-data.cjs` run against a symlinked `plugins/` | 0, `hooks=20` | PASS |
| 3: Full suite | `npm test` | 1 (run 2: 2 failures, both reproduced at base) | PASS with proven pre-existing failures |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| objective: test | `npm test` | 1 | PASS apart from MA-7 and github-enterprise-migration, both failing identically at base 05a5b5f4 |
| task: test | `node --test .../hook-inventory.test.cjs .../doc-refs.repo.test.cjs` | 0 | PASS (19 tests) |

## Deviations from Plan

1. **[Environment] Live Claude Code check skipped.** The TRD makes it best effort and the dispatch forbids touching the runtime mirror; loading the clone's plugin would run `sync-runtime.js` against `~/.claude/devflow`. Reason recorded above. The stdin smoke carries the evidence.
2. **[Scope] Extra smoke row S10b** (the inline-prefix command text is denied) and an `export`-in-the-environment wording in every doc, to carry the plan-checker note. No production code involved.
3. **[Scope] Two extra doc edits beyond the TRD's list:** the `gate-edits.js` CLAUDE.md bullet and the USER-GUIDE `gate-edits.js` escape cell now say the variable must be in the environment Claude Code was launched from, so no current-behaviour mention in those surfaces implies an inline prefix works. A historical CHANGELOG entry (2.x) that lists the variable is left as released.
4. **[Process] Full suite run twice,** the second after the ROADMAP and STATE updates, because the first run's E2E1 failure was a transient of the SUMMARY existing before ROADMAP.md was ticked.
5. **[Observation] `site/data/devflow.json` is a tracked snapshot** with 19 hooks and no `gate-bash-writes`. It is regenerated by `npm run docs:data` before `hugo`, is not in this TRD's `files_modified`, and was left alone.

## Discovered commands

None. The stack profile (`general`) names `npm test` and `node --test {files}`, and both were used as given.

## Flutter UI Evidence

Not applicable (non-UI TRD).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
  - the registered hook, on a scratch clone of this repository with no skill marker, denies a strict Bash write to a tracked file, applies the measured default (`ask`) when the key is unset, passes mentions and `.planning/` / `.md` / untracked / scratchpad writes and honours every escape; the target files were never modified (S1-S13, clean `git status`)
  - CHANGELOG `[Unreleased]` records the hook, `gates.bashEditGate`, the measured default with its numbers, the `bash_edit_gate` replay with the new block category and the shell-words move
  - CLAUDE.md's inventory states the final hook behaviour and default, and the `gate-edits.js` bullet points to it (`hook-inventory.test.cjs` passes)
  - USER-GUIDE documents what is and is not gated, the escapes, the severity table, the default and its basis, how to re-measure, the false negatives, the `cd` approximation and the release note
  - the full suite passes except two failures proven pre-existing at the objective's base commit
- Gate failures: MA-7 and github-enterprise-migration (pre-existing, see Full suite)

## Self-Check: PASSED

- FOUND: `CHANGELOG.md`, `CLAUDE.md`, `docs/USER-GUIDE.md`, `scripts/gen-docs-data.cjs` (each mentions gate-bash-writes)
- FOUND commit: `426c5644` (docs(60-07): document the Bash edit gate, its measured default and the session-audit replay)
- FOUND: `plugins/devflow/devflow/references/bash-edit-gate-evidence.json` (numbers quoted from it)
- Scratch clone and base worktree removed; `git worktree list` shows only the checkout and the pre-existing `.claude/worktrees/mystifying-gates`
