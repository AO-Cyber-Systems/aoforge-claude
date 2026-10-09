---
objective: 52-store-mode-polish
verified: 2026-10-04T00:00:00Z
status: passed
score: 32/32 must-have truths verified (6/6 tech-debt items closed)
notes:
  - kind: accepted_follow_up
    note: "`df-tools micro commit` makes its source commit with raw git, so the store-mode commit gate does not check its branch. Found by this objective, outside item 52-3's scope (STATE.md drift), and recorded in docs/USER-GUIDE.md Known issues and CLAUDE.md Next as 52-06 required."
  - kind: accepted_follow_up
    note: "Resolved decisions written before objective 52 keep their mangled multi-line resolutions (no repair migration). Recorded in USER-GUIDE Known issues."
---

# Objective 52: Store-mode polish Verification Report

**Objective Goal:** Clear the store-mode rough edges the v1.4 audit logged as tech debt: printed follow-ups and gate messages that the GitHub gates refuse or under-explain, store-mode writers that drift the generated views, and the mirror-mode / `decision answer` gaps from objective 51.
**Verified:** 2026-10-04
**Status:** passed
**Re-verification:** No. This is the initial verification.

## Tech-debt item accounting (no REQUIREMENTS.md)

| Item | Description | TRD | Status | Evidence |
| ---- | ----------- | --- | ------ | -------- |
| 52-1 | Printed `df-tools commit` follow-ups refused by GEN-01 | 52-01 | SATISFIED | `lib/commit-steps.cjs` `branchCommitSteps` is the single builder, used by gh-setup-cli.cjs:104, doctor-checks/20:54, doctor-checks/21:52, migrations/0010:79 (0011:998 re-prints `m0010().STORE_COMMIT_STEPS`). commit-steps.test.cjs runs every printed line in a git fixture, from main and from a linked branch, for all four emitters (test 11). |
| 52-2 | Gate refusals omit the escape | 52-02 | SATISFIED | gh-gate.cjs:33 `START_HINT` names `df-tools gh pr start <objective>` and `DEVFLOW_SKIP_GH_GATE=1 (logged as gate gh; DEVFLOW_SKIP_GH_GATE_REASON=<why> records why)`. It is interpolated into all five refusal shapes (lines 83, 86, 110, 115, 128). misc.cjs:650 writes the message to stderr in `--raw` mode. Pinned by gh-gate.test.cjs `52-02 every refusal names both remedies` and misc-commit-gate.test.cjs. |
| 52-3 | micro appends a STATE.md row in store mode | 52-03 | SATISFIED | micro.cjs:331 reads `isStoreMode` and skips the STATE.md check, row and second commit, returning `state_commit_hash: null, state_row: 'skipped_store_mode'`. micro.test.cjs SM-4 asserts that `findCacheDrift` reports nothing for STATE.md, so there is no W055. workflows/micro.md and skills/micro/SKILL.md say the row is written in local mode only. |
| 52-4 | debugger.md instructs a raw `git commit` | 52-02 | SATISFIED | agents/debugger.md:398-406 now commits with `df-tools commit ... --files`. The remaining `git commit` mentions in agents/skills are all prohibitions. prompt-raw-commit.repo.test.cjs is a CI guard and passes. |
| 52-5 | No mirror-mode opt-out (0011 pending and W040 reported forever) | 52-04 | SATISFIED | 0011 detect:215 returns `applies:false` with the MIRROR_ONLY reason while the store is off. The store-off applies reason names `config-set github.mirror_only true` (KEEP_MIRROR). templates/config.json:48 sets `mirror_only: false`. validate.test.cjs 16 (no W040 with the opt-out) and 18 (`config-get` prints false) pass, along with the 0011 tests (skipped under `--check` and `--apply --confirm`, ignored with store on). gh-sync SKILL and health.md offer "keep mirror mode". |
| 52-6 | Multi-line `decision answer` bug | 52-05 | SATISFIED | frontmatter.cjs writes multi-line strings as `|-` block scalars and parses `|`/`|-`/`|+`. My independent probe round-tripped `"Line one: with colon\n---\n  indented\nlast"` at top level and one level of nesting, and single-line values serialised unchanged. planning-entity-verbs.test 52-05 #1 (CLI local), #2 (CRLF), #3 (store round-trip through `gh pull --all`) and planning-import.test 52-05 #4 all pass. |

## Goal Achievement

### Observable Truths (by TRD)

| TRD | Truths | Status | Evidence |
| --- | ------ | ------ | -------- |
| 52-01 | 5 | VERIFIED | The `git diff 22f0c86e~1..a127631b` diff shows lines 1-5 of the 0010 and doctor-20 store text are byte-identical to 51-04, with only line 6 (the `gh pr start` route) added. Doctor 21 local note is still `commit with: <cmd>`. The plain form (mirror/local) has no DEVFLOW_SKIP_GH_GATE line, per commit-steps.test 4/6c. |
| 52-02 | 4 | VERIFIED | See items 52-2 and 52-4. The raw stdout stays the bare reason code with exit 1 (misc.cjs:651 `output(result, raw, verdict.reason, 1)`). |
| 52-03 | 5 | VERIFIED | See item 52-3. The local path still returns the `no-state-file` refusal (micro.cjs:338) and makes two commits. |
| 52-04 | 7 | VERIFIED | See item 52-5. Detect gates apply, so `--apply --confirm` leaves `github.store` off and `mirror_only` true (0011 test, line 487). |
| 52-05 | 5 | VERIFIED | See item 52-6. |
| 52-06 | 6 | VERIFIED | CHANGELOG [Unreleased] has an Added entry for `github.mirror_only` (line 177) and Fixed entries for all six items (lines 347-372). In USER-GUIDE, the "no opt-out key yet" text is gone, line 949 quotes the new refusal wording, line 768 documents mirror_only, and Known issues records both follow-ups (micro raw-git commit, pre-52 mangled resolutions). The doctor skill step 4 covers check 21. CLAUDE.md "Where we left off" (2026-10-04) names objective 52 done, and Next drops the opt-out and decision-answer items. |

**Score:** 32/32 truths verified

### Required Artifacts

| Artifact | Status | Details |
| -------- | ------ | ------- |
| `bin/lib/commit-steps.cjs` | VERIFIED | Exports `DF_TOOLS_CMD`, `commitCommand` and `branchCommitSteps`. The module is pure, has input validation, and is imported by 4 emitters. |
| `bin/lib/commit-steps.test.cjs` | VERIFIED | Runs the printed lines through `sh -c` against a real git fixture with a failing gh shim on PATH. |
| `bin/lib/prompt-raw-commit.repo.test.cjs` | VERIFIED | Passes. |
| `bin/lib/micro.cjs` | VERIFIED | Store-mode branch wired through planning-mode.isStoreMode. |
| `bin/lib/migrations/0011-github-store-backfill.cjs` | VERIFIED | `mirror_only` honoured only while the store is off. |
| `templates/config.json` | VERIFIED | `github.mirror_only: false`. |
| `bin/lib/frontmatter.cjs` | VERIFIED | Block-scalar read and write, confirmed by the probe. |
| `CHANGELOG.md` | VERIFIED | Objective 52 entries present. |

### Key Link Verification

| From | To | Status |
| ---- | -- | ------ |
| gh-setup-cli filesLines | branchCommitSteps (reason by isStoreMode) | WIRED (gh-setup-cli.cjs:104-107) |
| doctor-checks/21 | branchCommitSteps when store | WIRED (:51-52) |
| 0010 STORE_COMMIT_STEPS / doctor-20 commitNote | branchCommitSteps; 0011 re-prints the 0010 constant | WIRED (0010:79, d20:54, 0011:998) |
| gh-gate START_HINT | all refusal messages | WIRED (5 sites) |
| misc cmdCommit refusal | stderr in raw mode | WIRED (misc.cjs:650) |
| micro commitMicro | planning-mode.isStoreMode | WIRED (micro.cjs:331) |
| 0011 detect | requireEnabled(main).config.mirror_only | WIRED (:215) |
| decision-queue resolve, then spliceFrontmatter, then extractFrontmatter | frontmatter block scalars | WIRED (CLI test 52-05 #1) |
| planning-import frontmatterField('resolution') | full block | WIRED (import test 52-05 #4) |
| USER-GUIDE refusal quote | START_HINT | MATCHES (USER-GUIDE:949) |

### Objective gates (`gates.objective`)

| Gate | Command | Result |
| ---- | ------- | ------ |
| test | `npm test` (re-run 2026-10-04) | PASS apart from the known MA-7: 8856 tests, 8823 pass, 1 fail (`MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN`, the documented environmental failure), 32 skipped. roadmap-reconcile E2E1, a transient failure in the 52-06 run, now passes. |

Targeted run (16 files: commit-steps, gh-gate, misc-commit-gate, prompt-raw-commit.repo, micro, 0010, 0011, frontmatter, planning-entity-verbs, planning-import, gh-setup-cli, doctor 20 and 21/22, validate, roadmap-reconcile, decision-queue): 495/495 pass, 0 skipped.

### Anti-Patterns Found

None. The new and modified modules contain no TODO, FIXME or placeholder markers or stub returns.

### Functional Verification

_Skipped: `verification.runtime: none` in STACK.md (plugin/CLI objective; no UI). Behaviour is proven by executed-as-printed git fixtures and CLI subprocess tests._

### Human Verification Required

None.

### Gaps Summary

There are no gaps. All six tech-debt items are closed in code and covered by passing tests, and the success criteria in OBJECTIVE.md hold:
- Printed follow-ups run as printed on a linked branch (commit-steps test 11).
- Refusals name both remedies.
- micro leaves no W055 drift.
- A mirror-mode project with the opt-out shows no W040.
- A multi-line answer round-trips.
- `npm test` is green apart from MA-7.

Two follow-ups this objective found are documented as accepted known issues, not gaps:
- micro's raw-git source commit bypasses the store-mode gate.
- Decisions answered before objective 52 keep their mangled resolutions.

---

_Verified: 2026-10-04_
_Verifier: Claude (verifier)_
