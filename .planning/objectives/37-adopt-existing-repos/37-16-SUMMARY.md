---
objective: 37-adopt-existing-repos
trd: "16"
subsystem: docs
tags: [adopt, e2e, human-verify, checkpoint, local-install]
dependency-graph:
  requires: ["37-15"]
  provides: ["objective-37-e2e-proof-b", "human-verify-verdict-adopt"]
  affects: ["docs/USER-GUIDE.md"]
tech-stack:
  added: []
  patterns: ["human-verify checkpoint recorded verbatim via orchestrator relay, not authored by the executor"]
key-files:
  created: []
  modified: []
decisions:
  - "No fix landed as a result of the human check (all step-4 checks a-f passed, revert worked), so the TRD's conditional regression gate ('If any fix lands as a result of the human check, run the gate below') was not triggered — 37-15's final gate run remains the objective's authoritative gate, cited here rather than re-run."
requirements-completed: ["ADP-07"]
verification:
  gates_defined: 0
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false
metrics:
  duration: "~15 min (Task 1 + Task 3; Task 2 was a human-verify pause outside session time)"
  completed: 2026-09-28
tokens_input: 1325312
tokens_output: 17364
tokens_cache_read: 1221812
tokens_cache_write: 103456
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 37 TRD 16: Human check — install from this checkout, `/devflow:adopt` in a fresh session (E2E proof b) Summary

**ADP-07's E2E proof (b) is closed: the user installed the plugin from this checkout in a real Claude Code session, ran `/devflow:adopt` against a factory-built `orders-service` fixture, all step-4 checks (a-f) passed, and the revert to the published `aocyber` marketplace worked — verdict "approved." relayed 2026-09-28.**

## Performance

- **Started:** 2026-09-28 (Task 1 fixture build)
- **Completed:** 2026-09-28 (Task 3, this record)
- **Tasks:** 3/3 complete (Task 2 was the blocking `checkpoint:human-verify`)
- **Files modified:** 0 (this TRD changes no repository code; only this SUMMARY is committed)

## Accomplishments

- Built two named scratch fixtures via the factory (`adopt-fixtures.cjs`) under a fresh `mkdtemp`
  directory, confirmed in the exact pre-adopt state the TRD requires, and printed their absolute
  paths for the checkpoint.
- Presented the full install → fresh-session → `/devflow:adopt` → checklist → revert procedure to
  the user with every `<D>` placeholder substituted for real absolute paths, and stopped without
  running any `/plugin` command or touching `~/.claude` myself.
- Received the user's verdict — "approved." — via orchestrator relay, closing objective 37's second
  and final E2E proof (ADP-07 proof b; proof a was 37-13/37-14's scripted rehearsal).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Build the named fixtures and print them | `git -C <D>/orders-service log --oneline` → one commit (`389c78d init`); `git -C <D>/orders-service status --porcelain` → empty; `git -C <D>/orders-dirty status --porcelain` → ` M main.go` / `?? notes.txt` | 0 | PASS |
| 2: Human check — local install, fresh session, `/devflow:adopt`, revert | User's own execution of the printed checklist (checks 4a-f, revert) | n/a (human-verify) | PASS — "approved." |
| 3: Record the human verdict | `rg -n "approved\|failed" .planning/objectives/37-adopt-existing-repos/37-16-SUMMARY.md` | 0 (this file matches after commit) | PASS |

## Task Commits

1. **Task 1: Build the named fixtures and print them** — no commit (fixtures live outside this repo, under `/private/tmp/devflow-adopt-e2e-b.V4vUg2/`; `files_modified: []` per TRD frontmatter)
2. **Task 2: Human check** — no commit (checkpoint; user's own session wrote to their real `~/.claude/devflow/backups/` and `.registry.json`, outside this repo)
3. **Task 3: Record the human verdict** — this SUMMARY, committed via `df-tools commit` immediately after this file is written

## Human-Verify Verdict (verbatim)

**Received via:** orchestrator relay (agent `a8a63f447ae7ac874`), reporting the coordinator's transcript of the user's session. This executor did not witness the user typing the response directly — the checkpoint was presented, the executor's turn ended, and the verdict below was relayed back on resume, which is the designed continuation path for a `checkpoint:human-verify` task.

**Verdict text (verbatim):** `approved.`

**Scope of the verdict, as relayed:** covers every check in step 4 (a through f) of the checklist, and confirms the revert to the published `aocyber` marketplace (step 5) worked.

**Date:** 2026-09-28

**Detail not included in the relay:** the relayed verdict did not carry the optional supporting artifacts the TRD's Task 3 action asks to record if given — no commit sha for the fixture's `devflow/adopt` commit, no `adopt-e2e-assert.cjs check` JSON output, and no `## Needs review` row text from `<D>/orders-service/.planning/ADOPT-REPORT.md`. The verdict is a pass/fail confirmation of the full checklist, not an artifact dump; nothing in the TRD requires those artifacts to be present for the checkpoint to close, only that a failure be described in detail if one occurred (it did not).

**Steps 0a/0g/0h (optional items in the checklist)** were not reported on individually; the relay confirms "every check in step 4 (a-f)" passed, which does not include the optional dirty-fixture check (4g) or the optional real-signing check (4h). Neither optional check's outcome is known one way or the other; this does not affect ADP-07 proof (b), which is scoped to the required checks 4(a-f).

## Fixture Paths (built by Task 1, referenced in the checklist presented for Task 2)

- **Fixture root (mkdtemp):** `/private/tmp/devflow-adopt-e2e-b.V4vUg2/`
- **Factory home (used only for the factory's own git identity/signing calls):** `/private/tmp/devflow-adopt-e2e-b.V4vUg2/factory-home`
- **Clean go-service fixture:** `/private/tmp/devflow-adopt-e2e-b.V4vUg2/orders-service`
  - Pre-adopt state confirmed: `git log --oneline` → `389c78d init` (one commit); `git status --porcelain` → empty; default branch `main`.
- **Dirty fixture:** `/private/tmp/devflow-adopt-e2e-b.V4vUg2/orders-dirty`
  - Pre-adopt state confirmed: `git status --porcelain` → ` M main.go` and `?? notes.txt`.

Neither fixture is a real user repository; both were created exclusively by
`plugins/devflow/devflow/bin/lib/__fixtures__/adopt-fixtures.cjs` under this session's `mkdtemp`
directory, per the objective's runtime model.

## Checklist Presented to the User (Task 2, verbatim with `<D>` substituted)

```
0. Before changing anything:
   a. In Claude Code, run /plugin and note which @aocyber plugins are enabled.
   b. Optional, read-only: node /Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/df-tools.cjs upgrade --prune --dry-run
      shows what the first prune of your real ~/.claude/devflow/backups/ would remove (it keeps
      anything younger than 14 days and the newest 5 per repo, and never touches legacy-*/global-*).

1. Install from this checkout (in any Claude Code session):
   - /plugin marketplace remove aocyber
   - /plugin marketplace add /Users/justin/dev/devflow-claude
   - /plugin install devflow@aocyber   (or enable it)
   - In a terminal: rm ~/.claude/devflow/.plugin-version
     (both builds are v2.10.1; this forces sync-runtime to re-mirror the checkout)
   - Quit that session.

2. Open a fresh session in the fixture:
   cd /private/tmp/devflow-adopt-e2e-b.V4vUg2/orders-service && claude
   Confirm the mirror is the checkout:
   node ~/.claude/devflow/bin/df-tools.cjs adopt --help
   → prints adopt usage.

3. Type /devflow:adopt

4. Check:
   a. It asked you nothing and ended with a summary naming devflow/adopt, a commit and
      .planning/ADOPT-REPORT.md.
   b. git -C /private/tmp/devflow-adopt-e2e-b.V4vUg2/orders-service branch --show-current
      → devflow/adopt
      git -C /private/tmp/devflow-adopt-e2e-b.V4vUg2/orders-service rev-list --count main..devflow/adopt
      → 1
      git -C /private/tmp/devflow-adopt-e2e-b.V4vUg2/orders-service status --porcelain
      → empty
      git -C /private/tmp/devflow-adopt-e2e-b.V4vUg2/orders-service remote -v
      → empty (nothing pushed)
   c. node /Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/lib/__fixtures__/adopt-e2e-assert.cjs check /private/tmp/devflow-adopt-e2e-b.V4vUg2/orders-service --home $HOME
      → "ok": true (read-only checks)
   d. /private/tmp/devflow-adopt-e2e-b.V4vUg2/orders-service/.planning/ADOPT-REPORT.md
      has a "## Needs review" section whose rows make sense for an orders HTTP service.
   e. head -1 /private/tmp/devflow-adopt-e2e-b.V4vUg2/orders-service/CLAUDE.md
      → <!-- DEVFLOW:START v=2 src=claude-md -->
   f. Type /devflow:adopt again → it reports an existing DevFlow project (upgrade route) and
      rev-list --count is still 1.
   g. Optional: open a session in /private/tmp/devflow-adopt-e2e-b.V4vUg2/orders-dirty, type
      /devflow:adopt → it refuses naming main.go and notes.txt;
      git -C /private/tmp/devflow-adopt-e2e-b.V4vUg2/orders-dirty status --porcelain is unchanged and
      git -C /private/tmp/devflow-adopt-e2e-b.V4vUg2/orders-dirty stash list is empty.
   h. Optional, real signing: before step 3,
      git -C /private/tmp/devflow-adopt-e2e-b.V4vUg2/orders-service config --unset commit.gpgsign
      so your global signing applies; afterwards
      git -C /private/tmp/devflow-adopt-e2e-b.V4vUg2/orders-service log --show-signature -1

5. Revert to the published build:
   - /plugin marketplace remove aocyber
   - /plugin marketplace add AO-Cyber-Systems/devflow-claude
   - /plugin install devflow@aocyber, and re-enable the plugins noted in 0a
   - In a terminal: rm ~/.claude/devflow/.plugin-version, then open a new session (re-mirrors the
     published build)
   - Confirm: node ~/.claude/devflow/bin/df-tools.cjs adopt --help
     now fails (the published v2.10.1 has no adopt).

6. Optional cleanup:
   rm -rf /private/tmp/devflow-adopt-e2e-b.V4vUg2
   rm -rf ~/.claude/devflow/backups/orders-service-*   (the backup your adopt run made)
   the .registry.json entry is harmless.
```

## Regression Gate

This TRD changes no repository code (the fixtures live under `/private/tmp`, outside the repo; only
this SUMMARY is committed) and no fix landed as a result of the human check — every step-4 check
passed on the first pass, so the TRD's conditional rule ("If any fix lands as a result of the human
check, run the gate below before completing") was not triggered.

The objective's final automated gate run remains 37-15's, cited here rather than re-run:

**Observed totals (from 37-15-SUMMARY.md):** tests 3975, suites 568, pass 3942, fail 1, cancelled 0,
skipped 32, todo 0, duration 49.1s.

**Failing tests (1):**

| Test | File:Line | In baseline-failures.tsv? | Classification |
|---|---|---|---|
| `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path` | `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` | Yes (line 16 of the TSV, identical file:line and name) | **Pre-existing** — not a regression |

**Gate verdict: HOLDS** (unchanged from 37-15). `baseline-failures.tsv` was not read, edited, or
re-evaluated by this TRD since no code changed.

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 4/4
  - Named scratch fixture repo built by the factory, absolute paths printed — confirmed (Task 1).
  - Checkpoint gave exact copy-pasteable steps (install, optional prune preview, checklist, revert)
    — confirmed (Task 2 presentation above).
  - User's verdict recorded verbatim with fixture paths — confirmed (this file).
  - Nothing in this TRD changed the user's plugin configuration automatically; every `/plugin`
    command and every real-`~/.claude` change was performed by the user, never by this executor —
    confirmed (executor ran zero `/plugin` commands, zero `rm ~/.claude/...` commands).
  - The 5th truth (post-completion ROADMAP/STATE check) is a verifier instruction, not something
    this TRD proves itself — see next section.
- **Gate failures:** None (the one observed failure is pre-existing per the TSV, per 37-15's run;
  not re-evaluated here since no code changed)

## Instruction for the Orchestrator/Verifier (post-completion check, must_haves last truth)

This TRD does not run `objective complete 37` itself (binding rules for this TRD explicitly forbid
touching ROADMAP.md/STATE.md or running `roadmap update-job-progress`). When the orchestrator runs
`objective complete 37`, it — or the verifier — must confirm:

- `git show --stat HEAD` for the completion commit touches only `ROADMAP.md`/`STATE.md` (and
  objective-37 planning files).
- `git diff HEAD~1 -- .planning/ROADMAP.md` changes only the `### Objective 37:` section and its
  `| 37. ` Progress row — every other objective's section and row byte-identical.
- `git diff HEAD~1 -- .planning/STATE.md` changes only `## Current Position` (plus STATE's own
  session/decision appends, if the completion writes them).

This is the same invariant 37-15 proved on a scratch copy of `.planning/`; this TRD does not
re-prove it on the real files since that only happens once the orchestrator actually runs
`objective complete 37`.

## Files Created/Modified

- `.planning/objectives/37-adopt-existing-repos/37-16-SUMMARY.md` — this file (the only file this
  TRD commits)

No repository source files were created or modified. The two fixture repos exist outside this
repository under `/private/tmp/devflow-adopt-e2e-b.V4vUg2/` and are not tracked by this repo.

## Decisions Made

- No fix landed as a result of the human check, so the conditional regression gate was not run;
  37-15's final gate run is cited as the objective's authoritative evidence instead of re-running an
  identical, unchanged suite.

## Deviations from Plan

None — TRD executed exactly as written. Task 2 paused as a blocking `checkpoint:human-verify`; the
verdict was relayed back through the orchestrator on resume, which is the designed continuation path
for this checkpoint type, not a deviation from it.

## Issues Encountered

None. All required checks (4a-f) and the revert (step 5) passed per the relayed verdict. The two
optional checks (4g dirty-fixture refusal, 4h real-signing) were not reported on; they are optional
and do not affect ADP-07 proof (b) or this objective's completion.

## Next Objective Readiness

Objective 37 (adopt-existing-repos) has both required E2E proofs for ADP-07 closed: proof (a) via
37-13/37-14's scripted rehearsal, and proof (b) via this TRD's human check. Nothing further is
required of TRD 37-16. The orchestrator may proceed to `objective complete 37`, applying the
post-completion check recorded above.

---
*Objective: 37-adopt-existing-repos*
*Completed: 2026-09-28*
