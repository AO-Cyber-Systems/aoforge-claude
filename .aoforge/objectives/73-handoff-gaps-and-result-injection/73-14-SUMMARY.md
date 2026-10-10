---
objective: 73-handoff-gaps-and-result-injection
trd: "14"
subsystem: docs
tags: [docs, gap-closure, gate-interactive, watcher, runtime-home, doctor, G1, G2, G3, G5]

requires:
  - objective: 73
    provides: "73-09: findProjectRoot and the planning-mode lookups never return $HOME"
  - objective: 73
    provides: "73-10: interactive-commands.cjs, the per-invocation matcher, and its remaining detection limits"
  - objective: 73
    provides: "73-11: resolveUserFile / userDotFile read order (runtime home, ~/.aoforge, pre-rename) and watchStateDir"
  - objective: 73
    provides: "73-12: the daemon's pid file and log in state/watch, the 3.0.0 read, the allowlist on the shared matcher (12 agreement rows)"
  - objective: 73
    provides: "73-13: service logs in state/watch and doctor check 17 user-dot-dir (branches, .DS_Store note)"
provides:
  - "CHANGELOG [Unreleased]: Added (doctor check 17), Changed (runtime-home file locations, daemon allowlist on the hook's matcher, -y without -P handed off), Fixed ($HOME is never a project, gate-interactive gates invocations, daemon no longer rejects what the hook hands off)"
  - "docs/USER-GUIDE.md: shim list (userDotFile/resolveUserFile order, watchStateDir), 'What 3.0.0 left in ~/.aoforge/', '$HOME is never a project', doctor row 17, 3.0.0 daemon keeps working until restarted, log path, hook-table row, 'What gate-interactive matches' with the remaining limits"
  - "site handoff guide: key-generation line, built-in-matcher paragraph under 'Allowlist and deny list', 'What gate-interactive matches' section and a 'What it does not match' callout replacing 'A known gap'"
  - "settings workflow, handoff skill, BS-101, both migration pages name ~/.claude/aoforge/ for user files"
  - "CLAUDE.md Doctor / Rename shims / gate-interactive bullets and HOOK_DOCS (regenerated site/data/aoforge.json) match the shipped behaviour"
affects: [74, 75, release notes for the release after 3.0.0]

tech-stack:
  added: []
  patterns:
    - "Docs claims about a matcher are probed against the shipped module (a scratch script requiring interactive-commands.cjs and watcher-allowlist.cjs) before they are written"

key-files:
  created: []
  modified:
    - CHANGELOG.md
    - docs/USER-GUIDE.md
    - CLAUDE.md
    - scripts/gen-docs-data.cjs
    - site/data/aoforge.json
    - site/content/docs/guides/handoff.md
    - site/content/docs/guides/releases.md
    - plugins/aoforge/skills/handoff/SKILL.md
    - docs/built-in-sweep.md
    - plugins/aoforge/aoforge/workflows/settings.md
    - docs/MIGRATING-TO-AOFORGE.md
    - site/content/docs/getting-started/migrating-to-aoforge.md

key-decisions:
  - "The remaining gate-interactive limits are documented as 'not matched, runs in Claude's Bash as before' (fail open), including the two 73-10 listed beyond the TRD's example: a path-qualified command name and a backtick substitution"
  - "The releases guide's raw-string callout was corrected too (outside files_modified): gate-commits and changelog-on-tag strip heredocs and quotes, and gate-interactive matches per call, so no page still documents the fixed bug"
  - "73-13's .DS_Store note is documented as behaviour (unknown files are listed and left, so the directory stays), not as a planned change"

patterns-established:
  - "A migration page's ignore-region table changes only its new column; the 3.0.0 explanation goes in a sentence after the region, free of legacy names"

requirements-completed: [HND-02, HND-03]

verification:
  gates_defined: 3
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: FILL
completed: 2026-10-10
---

# Objective 73 TRD 14: Docs for the gap closure Summary

**The changelog, user guide, site handoff and releases guides, migration pages, settings workflow, handoff skill, CLAUDE.md and the generated docs data now describe what 73-09 to 73-13 shipped: user and watcher files in `~/.claude/aoforge/`, $HOME never a project, doctor check 17, and a per-invocation gate-interactive whose matcher the daemon shares, with its remaining fail-open limits.**

## Progress
- [x] Task 1: File locations in user-facing pages — 6090a928
- [x] Task 2: USER-GUIDE, site handoff guide and CHANGELOG — e38512e7
- [x] Task 3: CLAUDE.md, HOOK_DOCS and the generated data; final suite — (this commit)

## What changed

- **User-file locations (Task 1).** The settings workflow writes `~/.claude/aoforge/defaults.json` (`mkdir -p ~/.claude/aoforge`), the handoff skill's "Extend allowlist" option and its BS-101 row name `~/.claude/aoforge/aoforge-watch-allow.json`. Both migration pages: the user-directory row's new column is `~/.claude/aoforge/`, a sentence after the table says 3.0.0 kept the files in `~/.aoforge/`, that they are read for one release and that `aof-tools doctor --global --fix` moves them; "Old user files" names the three locations in order.
- **USER-GUIDE (Task 2).** Shim list: `userDotFile` over `resolveUserFile` (runtime home, then `~/.aoforge/`, then pre-rename; first found wins, nothing merged, writes only to the runtime home) and `watchStateDir`. New paragraphs "What 3.0.0 left in `~/.aoforge/`" (the 3.0.0 daemon is found by status/start/stop/add/remove and gate-interactive, `stop` clears its pid file, `logs` falls back) and "Your home directory is never a project". Doctor table gains row 17 with 73-13's branches (backups, never delete or overwrite, symlink kept, report-only cases, unknown files such as `.DS_Store` left so the directory stays). The pre-rename daemon paragraph adds that a 3.0.0 daemon keeps working, with its 3.0.0 code and allowlist, until restarted. The attended-terminal paragraph names the log path. The hook-table row adds "or with `-y` but no `-P`" and per-call matching, and drops "Has known false positives". The "gate-interactive false positives" limitation is replaced by "What gate-interactive matches".
- **Site (Task 2).** Handoff guide: the key-generation line (read-only forms pass, `-y` without `-P` handed off), the built-in-matcher paragraph under "Allowlist and deny list", and a "What gate-interactive matches" section with a "What it does not match" callout in place of "A known gap". Releases guide: the "Both this gate and gate-interactive match on the raw command string" callout is replaced (see Deviations).
- **CHANGELOG (Task 2).** Added: doctor check 17. Changed: files in the runtime home, the daemon allowlist on the hook's matcher, `-y` without `-P` handed off despite `-N`. Fixed: $HOME is never a project, gate-interactive gates invocations, the daemon no longer rejects what the hook hands off. Each bullet is tagged "objective 73 gap closure" with its requirement and TRD.
- **CLAUDE.md and generated data (Task 3).** Doctor bullet: check 17 in its own clause ("for what 3.0.0 left behind"). Rename shims bullet: the $HOME rule on `findProjectRoot`, `userDotFile`/`resolveUserFile` order, `watchStateDir`. gate-interactive bullet: invocation-aware on `shell-words.parseCommand`, per-call flags and reasons, read-only key forms and `-y`/`-P`, the matcher in `lib/interactive-commands.cjs` shared with the daemon allowlist, the daemon read through `watcher-state.cjs`, the not-matched list; the "known false positives" sentence is gone. HOOK_DOCS `gate-interactive.js` rewritten the same way; `npm run docs:data` changed only that entry and `generatedAt` in `site/data/aoforge.json`.

## Documented remaining limits (from 73-10, probed against the shipped matcher)

A scratch probe (`require` of `interactive-commands.cjs` and `watcher-allowlist.cjs`, case strings in the script file, never on the command line) confirmed each documented case before it was written:

| Case | Hook | Daemon built-in allowlist |
|---|---|---|
| `"npm" login`, `env FOO=1 …`, `FOO=1 …`, `time …`, `/usr/bin/ssh-keygen …` | not gated | refused (no match) |
| `sudo …` | not gated | refused by the deny list |
| `$( )` inside double quotes, backticks, `bash -c '…'` body | not gated | refused |
| `$( )` unquoted, `bash <<'EOF'` body, `gh auth login; echo --with-token` | gated, compound, reason names the call | accepted |
| `ssh-keygen -y -N "" -f k`, `ssh-keygen -y -f k` | gated | accepted |
| `ssh-keygen -y … -P ""`, `-lf`, `-F`, `-R`, new key with `-N` | not gated | refused (non-interactive form) |
| `rg "a\|<gated>" file`, `cat > notes.md <<'EOF'` with a gated body | not gated | refused |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: File locations | `node --test` rename-guard, builtin-sweep, doc-refs, planning-writes repo tests | 0 (66/66) | PASS |
| 2: Guide, site, changelog | `node --test` doc-refs, rename-guard, rg-flag-guard; `aof-tools changelog check Unreleased` | 0 (54/54); `"ok": true` | PASS |
| 3: CLAUDE.md, HOOK_DOCS, data | `npm run docs:data`; `node --test` hook-inventory + all six doc guards | 0; 0 (87/87) | PASS |
| 3: full suite | `npm test` | FILL | FILL |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | FILL | FILL |
| lint | none | - | not_available |
| build | none (docs:build needs Hugo, not part of this gate) | - | not_available |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The releases guide still documented the fixed gate-interactive behaviour**
- **Found during:** Task 2 (searching the site for callouts about raw-string matching)
- **Issue:** `site/content/docs/guides/releases.md` had a warn callout, "Both this gate and gate-interactive match on the raw command string", saying `changelog-on-tag` and `gate-interactive` do not strip heredocs and quotes. Both claims are false: `changelog-on-tag.js` strips heredoc bodies and quoted arguments with gate-commits' helpers, and gate-interactive matches per call since 73-10. Leaving it would break the success criterion "no fixed bug is still documented as a known issue".
- **Fix:** replaced with an `ok` callout, "A mention is not an invocation", stating the shipped behaviour of all three gates.
- **Files modified:** site/content/docs/guides/releases.md (not in the TRD's files_modified)
- **Commit:** e38512e7

### Process notes

- **Stray pending record:** one early `rg` call put a gated command name inside a quoted pattern; the installed 3.0.0 gate denied it and wrote `plugins/aoforge/.aoforge-handoff/pending/h-92da0c76.json` (the session's working directory). The record and its two empty directories were deleted at once; every later search read its pattern from a scratchpad file (`rg -f`) or put the cases in a scratch script. The repo root's `.aoforge-handoff/pending/` was already present and empty, and was left alone.
- `doctor --global --fix` was not run on this machine; the docs describe it and the user decides when to run it.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 truths (CHANGELOG entries, USER-GUIDE limitations/locations/$HOME/check 17, site handoff guide, file-location pages, CLAUDE.md + HOOK_DOCS + data, doc guards and full suite)
- Verification greps: no "gate-interactive false positives", "Has known false positives" or "A known gap" left; `user-dot-dir` is in USER-GUIDE and CLAUDE.md; no `~/.aoforge/defaults.json` in the settings workflow; every remaining `~/.aoforge` in docs, site, CLAUDE.md and plugin markdown is about the 3.0.0 location
- Gate failures: FILL
