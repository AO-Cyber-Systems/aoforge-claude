---
objective: 79-reconcile-and-release-3-1-0
trd: "07"
subsystem: docs
tags: [CLAUDE.md, context-budget, AOF-TOOLS-REFERENCE, HOOKS-REFERENCE, USER-GUIDE, migration-guide, rename]
requires:
  - 79-01 (merged integrate/3.1.0 tree; triage rows 1 and 2 routed here)
  - 79-02..79-05 (wave 2: reconcile guard, pre-bash equivalence, worktree resolver, objective 75 records)
provides:
  - "CLAUDE.md on main's slim structure within the 200-line / 20,000-character budget, carrying the 3.1 facts"
  - "docs/AOF-TOOLS-REFERENCE.md and docs/HOOKS-REFERENCE.md holding the detail CLAUDE.md dropped, on 3.1 facts"
  - "USER-GUIDE's worktree paragraph and the migration guide's site lede on 3.1 behaviour; the guide and its mirror bodies identical"
affects: [79-08]
tech-stack:
  added: []
  patterns: ["one line per family in CLAUDE.md, the detail in the reference doc it links"]
key-files:
  created: []
  modified:
    - CLAUDE.md
    - docs/AOF-TOOLS-REFERENCE.md
    - docs/HOOKS-REFERENCE.md
    - docs/USER-GUIDE.md
    - site/content/docs/getting-started/migrating-to-aoforge.md
key-decisions:
  - "CLAUDE.md is rebuilt on main's slim skeleton; every integrate-side family description moved into docs/AOF-TOOLS-REFERENCE.md and every per-hook detail into docs/HOOKS-REFERENCE.md, both linked from CLAUDE.md. The caps (200 lines, 20,000 characters) are unchanged."
  - "Where we left off points at `state digest` and names only standing items: the objective-74 decisions (PR-only main, local-only visual judge), the pending todos (OPS-03, EST-11 follow-up, vanity mapping), the user's runtime-home move, and the deferred list. PR numbers, branch states and objective 78/79 progress paragraphs are dropped as history."
  - "The `/aoforge:ui-eval` mention (doc-refs failure) is gone with the objective-74 paragraph; the local-only judge decision is kept without naming the command, which moved to the aoforge-stack-flutter pack."
requirements-completed: []
metrics:
  duration: 10min
  started: 2026-10-17T03:37:52Z
  completed: 2026-10-17T03:48:11Z
  tasks: 2
  files: 5
tokens_input: 19565792
tokens_output: 75527
tokens_cache_read: 19306508
tokens_cache_write: 259094
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 79 TRD 07: CLAUDE.md within main's context budget, and the guides on 3.1 facts Summary

**CLAUDE.md went from 175 lines / 48,941 characters to 148 lines / 19,722 characters on main's slim structure, now states the 3.1.0 facts (single-name compat, the legacy-layout codes, retired 0012-0014, required `gh rebrand`, no pointer plugin, objective 73's handoff hooks, the reconcile and pre-bash equivalence guards), and links the two reference docs that now carry the detail; the two failures 79-01 routed here (context-budget 1, doc-refs 2) pass.**

## Progress
- [x] Task 1: CLAUDE.md on main's structure, within budget, carrying the 3.1 facts — fe0efcac
- [x] Task 2: USER-GUIDE, the migration guide and site pages on 3.1 facts — 6042e959

## What changed

**CLAUDE.md** (main's skeleton from `fix/post-77-verification`, without its 3.0.0 transition note):
- Budget comment now states both caps (200 lines, 20,000 characters) and that the caps are never raised.
- Core Tool keeps main's one-line families; changed lines carry 78's facts: Validation (W062-W069; W066 broken when only the pre-rename directory exists, a warning beside `.aoforge/`; W067, W069 never repaired, naming 3.0.x or the manual step), GitHub (`gh rebrand --apply` required on an un-rebranded repository, `lib/gh-legacy-labels.cjs`), Upgrade (0012-0014 retired, `--only` exits 1 naming 3.0.x, `legacy_layout`), Adopt and doctor (15, 16, 27 report-only; 17 keeps its fix), a new "Config, commit, changelog" line, and main's "Stack, merge driver, shims" split into "Stack and merge driver" and "Rename leftovers" (legacy-names NAMES/LEGACY/PRESERVE/SHIM_RELEASE `3.0.x`/SHIM_REMOVAL `3.1.0`; single-name compat; planning-layout, coexistence and legacy-layout-guard detect to report).
- Marketplace: no pointer plugin (removed in 3.1.0; coexistence still recognises an installed copy).
- Hooks: `inject-handoff-results.js` moved from Draft to Session (registered since objective 73); route-results is the catch-all; sync-runtime has no runtime-state migration; coexistence-guard reports every global leftover; upgrade-project's legacy-only notice; verify-commits and gate-edits trust `aoforge:` only; gate-interactive invocation-aware with the shared matcher; pre-bash names `hooks/pre-bash-equivalence.test.js` (TRD 79-03).
- Conventions: a "Repo guards" line (rename guard, reconcile guard (TRD 79-02), doc-refs, dispatch-completeness, hook-inventory).
- Intent Model keeps the integrate side's `/aoforge:status check --migrate` route in one sentence.
- Where we left off: `state digest` pointer plus standing items only (see key decisions).

**docs/AOF-TOOLS-REFERENCE.md:** State (digest, rotate-decisions, W068, the SUMMARY completeness rule moved out of CLAUDE.md), Objective/Roadmap (put, set-status, digest), Model resolution (main's precedence, focus, verdict_floor, escalate-from), Mechanical verbs (new), Validation (rewritten: W066 broken / warning, W067, W068, W069 with the 3.0.x or manual fixes; no `--only 0012/0013`), Planning verbs (`--tick`, resolveVerbRoot, the pre-rename worktree refusal from TRD 79-04), GitHub (label refusal, gh setup PR-template refusal), Upgrade (retired 0012-0014, `--global` leaves a pre-rename block untouched, 0015), Doctor (15/16/27 report-only, 17 with its fix), Stack profile (discover, doctor, pack tier), Stack packs (main's full bullet, new), "Rename shims (3.0.0)" rewritten as "Rename leftovers" (78's full text plus the pointer-plugin removal), and a new "Repo guard tests" bullet (reconcile guard detail, the doc gates).

**docs/HOOKS-REFERENCE.md:** the pre-bash paragraph names the equivalence test and corpus; sync-runtime without the runtime-state migration; route-results as catch-all; inject-handoff-results registered (no longer Draft); upgrade-project's legacy-only notice; coexistence-guard's four leftovers; verify-commits, gate-edits and gate-executor-stop without the pre-rename namespace; gate-interactive's invocation-aware matcher and the watch state under the runtime home; "via pre-bash" on the dispatched gates.

**docs/USER-GUIDE.md:** the worktree paragraph main added (line 1450) said a verb in a worktree "whose tree uses the other planning-directory name writes that tree"; rewritten to 3.1: a worktree holding only the pre-rename directory is refused with nothing written, a worktree on `.aoforge/` writes its own tree (TRD 79-04).

**site/content/docs/getting-started/migrating-to-aoforge.md:** front-matter lede "3.0.0 renamed the plugin and 3.1.0 stopped reading the old names" (body unchanged, still identical to the guide).

## Sizes

| File | Before (lines / chars / bytes) | After (lines / chars / bytes) |
|---|---|---|
| CLAUDE.md (`split('\n')` / `.length` as the budget test counts; `wc -c` bytes) | 176 / 48,941 / 49,193 | 148 / 19,722 / 19,925 |
| docs/AOF-TOOLS-REFERENCE.md (`wc -lc`) | 31 / 18,281 bytes | 34 / 25,766 bytes |
| docs/HOOKS-REFERENCE.md (`wc -lc`) | 53 / 11,345 bytes | 57 / 14,595 bytes |

`wc -l` reports 175 and 147 for CLAUDE.md (no counted line after the final newline).

## Sweep results (every remaining hit is past tense, a 3.0.x-scoped instruction, or the 3.1 refusal)

Task 1, `rg -e "for one release" -e "only 001[234]" -e "pointer plugin"` over CLAUDE.md and the two reference docs:
- CLAUDE.md:84 "The pointer plugin was removed in 3.1.0 (objective 78)" (past)
- AOF-TOOLS-REFERENCE.md:23 "`--only 0012|0013|0014` exits 1 naming AOForge 3.0.x" (the 3.1 refusal)
- AOF-TOOLS-REFERENCE.md:30 "The pointer plugin ... was removed in 3.1.0" (past)

Task 2, the TRD's sweep over docs/USER-GUIDE.md, docs/MIGRATING-TO-AOFORGE.md and site/content/docs (guide and mirror lines paired):
- guide 10 / site 14 "3.0.0 kept the old names working for one release. 3.1.0 removed those one-release shims" (past)
- guide 69 / site 73 "`--only 0012` (or 0013, 0014) names AOForge 3.0.x" (the 3.1 refusal)
- guide 247 / site 251 `upgrade --apply --only 0012` inside "The 3.0.0 checklist" → "What 3.0.x moves by itself" ("run it yourself under 3.0.x", scoped to 3.0.x)
- guide 440 / site 444 "The one-release shims are gone" (past)
- USER-GUIDE 26 "3.1.0 removed those one-release shims", 72 (`--only` names the retired migration), 400 (retired, exits 1), 1692 ("3.0.x read them for one release; since 3.1.0 it reads none") (past or the refusal)

A wider sweep (aliasLegacyEnv, legacyRuntimeHome, outside_diff, upgrade-deferred-0012, gen-pointer-skills, the runtime-state migration, "new name first", "the release after 3.0.0") found only past-tense lines and the 3.0.x section. No other site/content/docs page states a 3.0.0 shim as current (sweep for shim, 0012-0014, W066-W069, pre-rename, legacy planning, the old env prefix and directory outside the mirror: no hit).

## Handoffs

- **for 79-08:** `site/content/docs/commands/advanced-execution.md:91-93` still describes the pre-objective-73 handoff ("the `route-results` hook injects the result into Claude's next turn"); since objective 73 `inject-handoff-results.js` delivers first (after the next tool call or at Stop) and route-results is the catch-all, and the daemon is attended (`start --foreground`). Not a 3.0.0 shim, so outside this TRD's files; `site/content/docs/guides/handoff.md` already has the 73 wording to copy.
- **for 79-06 / 79-08:** nothing in CHANGELOG, versions or site/data was touched. `scripts/gen-docs-data.cjs` reads no CLAUDE.md or reference doc, so the rewrite does not change generated data.
- CLAUDE.md is at 19,722 of 20,000 characters (19,925 bytes): a later addition must move detail into a reference doc, not grow this file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] USER-GUIDE worktree paragraph claimed the two-directory fallback still worked**
- **Found during:** Task 2 (checking main's USER-GUIDE additions since 3.0.0 against 78)
- **Issue:** main's paragraph said a verb in a worktree whose tree "uses the other planning-directory name writes that tree"; 3.1 refuses a pre-rename worktree (79-04 tests 32, 33).
- **Fix:** rewritten to the 3.1 behaviour, with the reverse layout (test 30).
- **Files modified:** docs/USER-GUIDE.md
- **Commit:** 6042e959

**2. [Rule 2 - Missing] Facts the TRD's list did not name but the integrate CLAUDE.md carried**
- **Found during:** Task 1
- **Issue:** the integrate CLAUDE.md held the SUMMARY completeness rule (deferred / checkpoint SUMMARYs do not count) and the "Still deferred" items (UTC date sites, `dflang mcp`), which main's skeleton dropped.
- **Fix:** the completeness rule moved to AOF-TOOLS-REFERENCE.md State operations; the deferred items stay in CLAUDE.md's last paragraph; the user's pending runtime-home move (verified: the pre-rename runtime home still exists on this machine) kept as one clause.
- **Files modified:** CLAUDE.md, docs/AOF-TOOLS-REFERENCE.md
- **Commit:** fe0efcac

### Plan notes (not deviations)

- Tests ran with a scratch HOME under the session scratchpad, not `mktemp -d`, per the orchestrator (a `/var/folders` HOME trips repo-state's scratch detection).
- The site mirror's front matter lede changed; the body comparison strips front matter, so the mirror stays identical.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED (before) | `env HOME=<scratch> node --test context-budget.repo dispatch-completeness doc-refs.repo rename-guard.repo` | 1 (48/50: context-budget 1 "CLAUDE.md is 48941 chars (cap 20000)", doc-refs 2 "CLAUDE.md:163 ui-eval → unknown") | FAIL (expected, the routed rows) |
| 1: budget | `node -e` split/length as the test counts; `wc -lc CLAUDE.md` | 0 (148 lines / 19,722 chars; wc 147 lines / 19,925 bytes) | PASS |
| 1: gates | `env HOME=<scratch> node --test context-budget.repo dispatch-completeness doc-refs.repo rename-guard.repo hook-inventory` | 0 (55/55) | PASS |
| 1: sweep | `rg -n -e "for one release" -e "only 001[234]" -e "pointer plugin"` over the three files | 0 (3 hits, all past tense or the refusal, listed above) | PASS |
| 2: sweep | the TRD's `rg` over USER-GUIDE, the guide and site/content/docs | 0 (hits listed above, all past tense, 3.0.x-scoped or the refusal) | PASS |
| 2: mirror | `node scratchpad/mirror-compare.cjs docs/MIGRATING-TO-AOFORGE.md site/.../migrating-to-aoforge.md` (front matter and title stripped); sensitivity run against installation.md | 0 "identical (443 lines each)"; sensitivity 1 "differ at body line 1" | PASS |
| 2: validate docs | `aof-tools --cwd <checkout> validate docs --raw` | 0 "No documentation advisories" | PASS |
| 2: gates | `env HOME=<scratch> node --test rename-guard.repo doc-refs.repo context-budget.repo dispatch-completeness hook-inventory` | 0 (55/55) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (TRD scope) | `env HOME=<scratch> node --test context-budget.repo.test.cjs dispatch-completeness.test.cjs doc-refs.repo.test.cjs rename-guard.repo.test.cjs` (+ hook-inventory.test.cjs) | 0 (55/55) | PASS |
| test (every repo-level test) | `env HOME=<scratch> node --test "plugins/aoforge/aoforge/bin/lib/*.repo.test.cjs" doc-staleness rg-flag-guard hook-inventory dispatch-completeness` | 0 (346/346) | PASS |
| validate docs | `aof-tools validate docs --raw` | 0 | PASS |
| full suite | not run: no code changed; the TRD's gate is scoped; 79-08 owns the full run (which excludes `watcher-shell.test.cjs`) | — | not_available (out of scope) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (CLAUDE.md within budget on main's structure with the 3.1 facts; no doc describes a 3.0.0 shim as current; dropped detail lives in the two linked reference docs; context-budget, dispatch-completeness, doc-refs, rename guard and `validate docs` pass and the mirror body is identical)
- Gate failures: None

## Self-Check: PASSED

- FOUND: CLAUDE.md, docs/AOF-TOOLS-REFERENCE.md, docs/HOOKS-REFERENCE.md, docs/USER-GUIDE.md, site/content/docs/getting-started/migrating-to-aoforge.md
- FOUND: fe0efcac (commit), 6042e959 (commit)
