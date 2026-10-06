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
  - "Every doc says DEVFLOW_SKIP_EDIT_GATE=1 works only in the environment Claude Code was launched from, never as an inline prefix on the Bash command"

requirements-completed: [GATE-01, GATE-02, GATE-03, GATE-04, GATE-05]

duration: in progress
completed: 2026-10-06
---

# Objective 60 TRD 07: Dogfood, document, full suite Summary

**In progress.**

## Progress
- [x] Task 1: Dogfood the hook on a scratch clone (S1-S13) — (no commit, scratchpad only; recorded in this SUMMARY)
- [x] Task 2: CHANGELOG, CLAUDE.md, USER-GUIDE and docs-site data — (this commit)
- [ ] Task 3: Full test suite — next step: run `npm test` in the background to a scratchpad file, then prove each failing file fails at base 87b77e22 in a scratch worktree

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

S10 sets the variable in the hook's own environment, which models launching Claude Code with it exported. S10b is the case the plan-checker note describes: the same variable written as a prefix in the Bash command text is not in the hook's environment (a hook runs in Claude Code's own process), so it does not bypass the gate.

S1 followed the shipped default: with no key, the decision is `ask`, the measured `warn`.

## Live Claude Code check

`live check: skipped — the method needs the clone's plugin loaded with --plugin-dir, and that plugin's SessionStart hook sync-runtime.js mirrors its devflow/ tree to ~/.claude/devflow whenever the version or content digest differs (target path is hard-coded, only DEVFLOW_SKIP_GLOBAL_UPGRADE skips the follow-on global upgrade). The installed mirror is 2.13.1 and has no bash-write-gate.cjs or shell-words.cjs, the clone is 2.13.2 with them, so the run would have rewritten the runtime mirror, which this dispatch forbids. The installed devflow@aocyber plugin has the same name and would shadow the clone in any case.` The stdin smoke is the required evidence.

## Current raw audit line

`node plugins/devflow/devflow/bin/df-tools.cjs session-audit --raw --limit 0` (run in this checkout):

```
bash_edit_gate: ambient_bash_calls 17957, would_deny 633, false_positive_rate 0.035251 (upper bound), threshold 0.02, recommended_default warn
```

It matches `references/bash-edit-gate-evidence.json` exactly (17,957, 633, 0.035251, warn), so there is no delta since 60-06 and the evidence is unchanged.
