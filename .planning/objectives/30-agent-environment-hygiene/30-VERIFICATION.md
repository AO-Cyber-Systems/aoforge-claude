---
objective: 30-agent-environment-hygiene
verified: 2026-09-28
status: passed
score: 5/5
re_verification: false
verifier_trd: 41-02
commits_under_test: [6037be7, 68bd573]
gaps: []
deferred:
  - item: "Full-suite 'no regressions' claim (2797/2737/10)"
    why: "Retroactive brief allows targeted node --test only; the full-suite gate was last run by objective 40-06."
  - item: "SUMMARY follow-up: surface `override --list` in /devflow:status"
    why: "Handed to objective 31's telemetry view. That belongs in 41's verification of 31, not this report."
follow_ups:
  - id: F1
    where: plugins/devflow/agents/planner.md:730 (tools line :4)
    issue: "planner.md tells the agent to 'spawn objective-researcher via the standard Task(...) pattern', but its tools line (Read, Write, Bash, Glob, Grep, WebFetch, mcp__context7__*) declares neither Task nor Agent. agent-tools.test.cjs does not catch it because KNOWN_TOOLS (agent-tools.test.cjs:27-30) omits Task/Agent."
    in_scope: false
    why: "This is the same F-05 defect class (a prompt instructs a tool its allowlist forbids). The 30-01 must-have is scoped to the KNOWN_TOOLS call form, and that holds. Fix-TRD-worthy: either add Task/Agent to KNOWN_TOOLS and resolve planner.md, or reword planner.md:730 to hand the spawn back to the orchestrator, since subagents cannot spawn subagents."
notes:
  - kind: pending_release
    note: "live-runtime confirmation pending release. executor.md prose and the classify-session.js routing preamble go live only after a plugin version bump + sync-runtime. Verified against repo code and tests."
  - kind: superseded
    note: "`objective` was userOnly:true in 30-02 and is now userOnly:false (classifier.cjs:208-214, quick job 13), because `objective remove` is now dry-run without --confirm. The intent still holds: the flag tracks real frontmatter (objective/SKILL.md has no disable-model-invocation; milestone and workstreams have it at :8) and classifier.test.cjs enforces the match."
  - kind: scratch_only
    note: "`override` was exercised only against a mktemp-style scratch dir under the session scratchpad via --cwd. This repo's .planning/.override-log.jsonl and .edit-override do not exist (git status --porcelain is empty)."
---

# Objective 30: Agent environment hygiene, verification report

**Objective goal:** Close the long tail of F-05 environment friction:
- tool allowlists that forbid what the prompt instructs;
- routing that advertises skills the model cannot invoke;
- CWD drift and build timeouts;
- overrides that leave no trace.

**Verified:** 2026-09-28 (retroactive, TRD 41-02)
**Status:** passed
**Re-verification:** No (initial)

The 30 OBJECTIVE.md is an auto-scaffold with no must-haves. I scored the five truths in TRD 41-02 against the code as it stands.

## Observable truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 30-01: `agent-tools.test.cjs` fails when a prompt calls `ToolName(` absent from `tools:`, and executor declares TaskCreate/TaskUpdate/AskUserQuestion | VERIFIED | For every agent, `agent-tools.test.cjs:46-49` runs `\bTool\(` over KNOWN_TOOLS and asserts each match is declared. `executor.md:4` `tools: AskUserQuestion, TaskUpdate, TaskCreate, Read, ...`. Calls appear at `:205` TaskCreate(, `:502`/`:518` AskUserQuestion(, `:888` TaskUpdate(. Sensitivity was checked against history: at `6037be7^` the tools line lacked all three while the body called `TaskCreate(` (:125) and `AskUserQuestion(` (:359, :375), so the same regex would have failed. See follow-up F1 for a gap the guard's scope does not cover |
| 2 | 30-02: USER-TYPED ONLY heading; `CONSOLIDATED_SKILLS.userOnly`; `classifier.test.cjs` matches real frontmatter | VERIFIED | `classifier.cjs:89` `USER-TYPED ONLY — you CANNOT invoke these via the Skill tool`, listing milestone and workstreams. `:213-218` `userOnly` on each entry. `classifier.test.cjs:300` parses `disable-model-invocation: true` from each SKILL.md and asserts equality (`:310`). `:317-328` checks that user-only skills sit under the heading and invocable ones do not. The preamble reaches sessions via `hooks/classify-session.js` (its only requirer) |
| 3 | 30-03: executor anchors paths to the worktree root and gives explicit build/test timeouts | VERIFIED | `executor.md:827` "**Anchor every path to the worktree root.**" with `WORKTREE_ROOT=$(git rev-parse --show-toplevel)`. `:839` "**Raise the timeout for builds and test suites.**" with a table: build 300000, full suite 600000, focused test default |
| 4 | 30-04: `override --gate --reason` logs to `.override-log.jsonl`, reason is mandatory, `--list` works, 5 overrides flag `needs_rescoping` | VERIFIED | Live, scratch only (see below): record returned `ok:true` and wrote `.planning/.override-log.jsonl` plus the `.edit-override` marker. Missing reason and whitespace-only reason both give `Error: A reason is required ...` with exit 1. An unknown gate gives `Error: Unknown gate "bogus". Known: edits, commits, changelog` with exit 1. After 5 `commits` overrides, `--list` gave `by_gate:{edits:2, commits:5}` and `needs_rescoping:[{gate:"commits", overrides:5}]`, and `--raw` ended `needs rescoping: commits (5 overrides)` |
| 5 | Override log and markers are gitignored | VERIFIED | `git check-ignore -v` gives `.gitignore:49:.planning/.override-log.jsonl` and `.gitignore:50:.planning/.edit-override` |

**Score:** 5/5

## Tests run

| Command | Result |
|---------|--------|
| `node --test plugins/devflow/devflow/bin/lib/agent-tools.test.cjs` | 15 tests, 15 pass, 0 fail |
| `node --test plugins/devflow/devflow/bin/lib/classifier.test.cjs` | 47 tests, 47 pass, 0 fail |
| `node --test plugins/devflow/devflow/bin/lib/override.test.cjs` | 14 tests, 14 pass, 0 fail |
| `node --test plugins/devflow/devflow/bin/lib/audit-cli.test.cjs` (override CLI suite, tests 6-18) | 37 tests, 37 pass, 0 fail |

## Override exercise (scratch copy, quoted)

Scratch root: `<session scratchpad>/ov41`, containing only an empty `.planning/`.

```
$ df-tools --cwd <scratch> override --gate edits --reason "verify 41-02" --raw
recorded: edits — verify 41-02 (marker armed: <scratch>/.planning/.edit-override)   exit=0
$ df-tools --cwd <scratch> override --gate edits --reason "verify 41-02"
{"ok":true,"gate":"edits","reason":"verify 41-02","at":"2026-09-28T16:34:27.750Z","marker":"<scratch>/.planning/.edit-override"}
$ df-tools --cwd <scratch> override --gate edits
Error: A reason is required — an unexplained override is the signal this command exists to capture   exit=1
$ (5x) override --gate commits --reason "rescope probe N"
$ df-tools --cwd <scratch> override --list --raw
2026-09-28T16:34:34.418Z  commits  rescope probe 5
...
2026-09-28T16:34:26.450Z  edits  verify 41-02
needs rescoping: commits (5 overrides)
```

Scratch `.planning/` afterwards held `.edit-override` (73 B) and `.override-log.jsonl` (536 B). In the repo, `git status --porcelain .planning/.override-log.jsonl .planning/.edit-override` is empty.

## Key links

| From | To | Status |
|------|----|--------|
| `df-tools override` | `lib/override.cjs` (via `lib/audit-cli.cjs`, objective 39) | WIRED (live run) |
| `override.cjs` GATES.edits `.edit-override` (:28) | `hooks/gate-edits.js` consumes the marker (:12, :53 via `lib/edit-override.js`) | WIRED (code) |
| `classifier.cjs renderRoutingPreamble` | `hooks/classify-session.js` | WIRED (code) |

## Anti-patterns

None found in the 30 artifacts.

---
_Verified: 2026-09-28_
_Verifier: Claude (verifier, TRD 41-02)_
