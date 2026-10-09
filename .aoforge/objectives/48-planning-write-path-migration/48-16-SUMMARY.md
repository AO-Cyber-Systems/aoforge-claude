---
objective: 48-planning-write-path-migration
trd: "16"
subsystem: planning-prose
tags: [gwp-02, gwp-05, prose-migration, planner, research, discuss, discovery, ratchet, tdd]

requires:
  - objective: 48-03
    provides: "trd budget (verify trd-pre checks.trd_budget); job-checker Dimension 8"
  - objective: 48-04
    provides: "planning-audit scanner + SC1 ratchet (plan group baseline 27)"
  - objective: 48-15
    provides: "exact CLI verb forms (plan put-trd/push, doc put, objective put, summary post, planning draft/mode)"
provides:
  - "planner.md: TRDs written as planning draft -> Write draft -> plan put-trd --no-push, one plan push; ROADMAP edit guarded by planning mode; TRD scope budget (40K target / 60K ceiling / linked bulk)"
  - "researcher/research/discuss/discovery flows publish RESEARCH/CONTEXT/DISCOVERY with doc put"
  - "plan-objective pushes when the planner returns **Pushed:** no; overrides go through objective put"
  - "plan-milestone-gaps: ROADMAP guarded by planning mode (store: objective add + objective put); REQUIREMENTS via doc put"
  - "empty plan.json baseline (_comment only)"
affects: [48-22, 48-23]

tech-stack:
  added: []
  patterns:
    - "Draft-then-verb: `planning draft <rel>` -> Write/Edit the draft -> verb `--from <draft>`; rel is .planning/-relative"
    - "Mode guard: `planning mode` within 3 lines of a ROADMAP edit; local = as before, store = skip (generated)"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/plan.json
    - plugins/devflow/agents/planner.md
    - plugins/devflow/agents/objective-researcher.md
    - plugins/devflow/devflow/workflows/research-objective.md
    - plugins/devflow/skills/research-objective/SKILL.md
    - plugins/devflow/devflow/workflows/discuss-objective.md
    - plugins/devflow/skills/discuss-objective/SKILL.md
    - plugins/devflow/devflow/workflows/discovery-objective.md
    - plugins/devflow/devflow/templates/research.md
    - plugins/devflow/devflow/templates/context.md
    - plugins/devflow/devflow/templates/discovery.md
    - plugins/devflow/devflow/workflows/plan-objective.md
    - plugins/devflow/devflow/workflows/plan-milestone-gaps.md
    - plugins/devflow/devflow/templates/trd-prompt.md
    - plugins/devflow/devflow/templates/objective.md
    - plugins/devflow/devflow/templates/planner-subagent-prompt.md

key-decisions:
  - "Planner returns gain a `**Pushed:** yes|no` line; plan-objective step 10 runs `plan push` when it says no"
  - "plan-milestone-gaps store mode registers gap objectives with `objective add` + `objective put` (skipping would lose them; ROADMAP is generated)"
  - "REQUIREMENTS.md traceability edits go through draft + `doc put REQUIREMENTS.md` in both modes (planning-paths classifies it as doc put)"
  - "The research-objective CONTEXT block seeds its draft from the current CONTEXT.md, because `planning draft` never reseeds an existing (possibly stale) draft"
  - "No inline allow markers were needed: every finding was rewritten to a verb or rephrased as the read/explanation it is"

requirements-completed: [GWP-02, GWP-05]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 45min
completed: 2026-10-01
tokens_input: 7162241
tokens_output: 58073
tokens_cache_read: 7020701
tokens_cache_write: 141412
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 48 TRD 16: Prose migration — plan, research, discuss Summary

**The `plan` audit group went from 27 findings in 10 files to 0. The planner writes every TRD as `planning draft` → Write draft → `plan put-trd <obj> <file> --from <draft> --no-push`, then one `plan push`, and its `<scope_estimation>` carries the 40,000/60,000-char TRD budget and the linked-bulk rule. Research, discuss and discovery publish with `doc put`. ROADMAP edits are guarded by `planning mode`, and a local-mode smoke run shows each verb writing the same file, byte for byte.**

## Commits

| Task | Commit | Message |
|---|---|---|
| RED | 86eee7c4 | test(48-16): plan group must have zero planning writes |
| 1 | a45683e3 | docs(48-16): planner writes TRDs through plan put-trd |
| 2 | 7f8e51d2 | docs(48-16): research and discuss publish with doc put |
| 3 | 4564d417 | docs(48-16): plan group uses planning verbs |

## Violation counts (plan group)

| File | Before | After |
|---|---|---|
| agents/planner.md | 7 | 0 |
| agents/objective-researcher.md | 3 | 0 |
| workflows/plan-milestone-gaps.md | 4 | 0 |
| workflows/plan-objective.md | 4 | 0 |
| workflows/discuss-objective.md | 3 | 0 |
| skills/research-objective/SKILL.md | 2 | 0 |
| skills/discuss-objective/SKILL.md | 1 | 0 |
| workflows/research-objective.md | 1 | 0 |
| templates/objective.md | 1 | 0 |
| templates/trd-prompt.md | 1 | 0 |
| **total** | **27** | **0** |

The RED run listed these 27 lines once `plan.json` was emptied:

- objective-researcher.md: 17, 277, 315
- planner.md: 507, 546, 567, 996, 1047, 1069, 1078
- templates/objective.md: 126
- templates/trd-prompt.md: 178
- discuss-objective.md: 150, 299, 401
- plan-milestone-gaps.md: 5, 115, 129, 137
- plan-objective.md: 5, 55, 59, 201
- research-objective.md: 64
- skills/discuss-objective/SKILL.md: 28
- skills/research-objective/SKILL.md: 85, 201

The RED run also failed test 13 (planner sensitivity): `7 !== 0`.

While I worked, 4 transient findings came from my own new explanatory lines: planner 629 and 1022, researcher 323, research SKILL 81. I reworded each so it no longer read as a write, and the fixes landed in the same task's commit.

## What changed

- **planner.md**
  - `write_objective_prompt`: draft → Write draft → `plan put-trd ... --no-push` → one `plan push`. If `plan put-trd` exits non-zero, nothing was published.
  - Revision mode edits a seeded draft with Edit, then runs `plan put-trd` + `plan push`.
  - Gap-closure step 7 publishes the same way.
  - `update_roadmap` starts with `planning mode`. Store mode skips the step because ROADMAP is generated; local mode works as before. The sub-step that writes ROADMAP names the guard.
  - `git_commit` is unchanged.
  - The returns add `**Pushed:**`.
  - New `## TRD Scope Budget` in `<scope_estimation>`:
    - 40,000 target and 60,000 ceiling, measured on the encoded TRD by `verify trd-pre "$OBJECTIVE"`, run without `--raw`.
    - `plan put-trd`: over budget is a warning in local mode and a refusal in store mode.
    - Over budget: split the TRD or move work to a follow-up; never trim prose to fit.
    - Linked bulk: a fenced block over 8,000 chars, or fenced content over 40% of a TRD of 40,000+ chars, goes into the repo or wiki as a link.
- **objective-researcher.md, Step 5:** the agent drafts and runs `doc put objectives/<dir>/<NN>-RESEARCH.md` itself.
- **research-objective / plan-objective `<output>` blocks** name the draft + `doc put` path.
- **research-objective SKILL 2.5:** the Cross-Repo Considerations block builds the CONTEXT draft, then runs `doc put`.
- **discuss-objective:** `write_context` uses draft + `doc put`, and `doc put` creates the directory. "Review/edit" now points to re-running discuss.
- **discovery-objective:** `create_discovery_output` uses draft + `doc put`. "Address first" revises the draft and republishes it.
- **Templates:** research/context/discovery/objective/trd-prompt/planner-subagent-prompt name their verb. The document skeletons are unchanged.
- **plan-objective.md:**
  - The `overrides:` block goes through `objective put`.
  - Step 10 pushes on `**Pushed:** no`.
  - The `mkdir` line is reworded; the ROADMAP check there is a read.
- **plan-milestone-gaps.md:**
  - Step 6 is mode-guarded: local edits ROADMAP; store runs `objective add` + `objective put` and skips the `mkdir` step.
  - Step 7 publishes REQUIREMENTS.md through draft + `doc put`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| RED | `node --test lib/planning-writes.repo.test.cjs` (empty plan.json) | 1 (27 findings; test 13 `7 !== 0`) | FAIL (correct) |
| 1 | `node --test --test-name-pattern "13:" lib/planning-writes.repo.test.cjs`; `rg "plan put-trd\|plan push\|60,000" agents/planner.md` | 0 | PASS (no planner.md lines in the failure list) |
| 2 | `node --test lib/planning-writes.repo.test.cjs` | 1 (only Task 3 files listed) | PASS (no researcher/research/discuss/discovery lines) |
| 3 | `node --test lib/planning-writes.repo.test.cjs lib/doc-refs.repo.test.cjs lib/planning-audit.test.cjs` | 0 (45/45) | PASS |
| verify | `rg -n "Write.*\.planning/objectives" agents/planner.md` | 1 (no match) | PASS |
| verify | `rg -n "2>/dev/null"` over this TRD's files, filtered by the TRD's verb regex | none | PASS (the remaining redirects are on `ls`/`cat`/`grep`/`config-get`/`dup-detect`/`org-awareness`/`initiatives`, not verbs) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test lib/planning-writes.repo.test.cjs` | 1 (gate lists 27; test 13 fails) | FAIL (correct) |
| GREEN (T1) | `node --test --test-name-pattern "13:" lib/planning-writes.repo.test.cjs` | 0 | PASS (correct) |
| GREEN (T3) | `node --test lib/planning-writes.repo.test.cjs lib/doc-refs.repo.test.cjs lib/planning-audit.test.cjs` | 0 (45/45) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test lib/planning-writes.repo.test.cjs` | 0 | PASS |
| regression | `node --test lib/doc-refs.repo.test.cjs lib/planning-audit.test.cjs` | 0 | PASS |
| full suite | `npm test` | 1 | PASS except the known flake: 7458 tests, 7425 pass, 1 fail (MA-7), 32 skipped |

**Full suite:** the only failure is **MA-7** in the handoff PTY E2E (doctl auth init race, TRD 19-05). It is a known flake; I noted it and did not fix it. roadmap-reconcile E2E1 passed in this run. Once this SUMMARY exists and ROADMAP still shows `[ ]`, E2E1 is expected to fail until the orchestrator ticks the box.

## Invariant check (github.store off)

I ran the new command lines in a scratchpad project, never in the real `.planning/`, with `TMPDIR` scoped to it:

- `planning mode` prints `local`.
- The research SKILL 2.5 block, run verbatim for 3 rounds, does the following:
  - It creates CONTEXT.md.
  - It keeps a `## Decisions` section added between rounds outside the draft, which shows the cp-from-current seed defeats a stale draft.
  - It replaces the section body in place.
  - Each round printed `doc put: wrote .planning/objectives/07-demo/07-CONTEXT.md (local mode).`
- `plan put-trd 7 07-01-TRD.md --from <draft> --no-push` exits 0 and writes the file byte-identical to the draft (cmp).
- `plan push 7` exits 0 with `nothing to do (local mode).`
- `objective put 7` and `doc put REQUIREMENTS.md` both exit 0, and each output is byte-identical to its draft.
- `doc put .planning/objectives/...` (with the `.planning/` prefix) is refused, because that path classifies as runtime. So the prose always uses `.planning/`-relative rels and states that `<dir>` is the last segment of `objective_dir`.

## Deviations from Plan

1. **[Rule 2 - Correctness] Stale-draft guard in the research SKILL block.**
   - `planning draft` never overwrites an existing draft, and drafts persist after publish.
   - The block publishes CONTEXT.md that another flow (discuss) also writes, so it copies the current CONTEXT.md over the draft first, or removes the draft when there is no file yet.
   - Commit 7f8e51d2.
2. **[Rule 2 - Correctness] Planner `**Pushed:**` return field.** The TRD asks plan-objective to push "if the planner reports TRDs written with `--no-push` and no push". The planner's return had no field carrying that, so I added one to both returns. Commits a45683e3 and 4564d417.
3. **[Rule 2 - Correctness] Store mode in plan-milestone-gaps.**
   - Under the recipe's "skip ROADMAP in store mode" alone, the gap objectives would never be created.
   - So store mode registers them with the store-aware `objective add`, which 48-14 made store-aware, and records Goal/Requirements via `objective put`.
   - Local mode is unchanged.
4. **[Interpretation] `verify trd-pre` takes the objective number.** It does not take a TRD path, so the budget text uses `verify trd-pre "$OBJECTIVE"` (no `--raw`).
5. **[Interpretation] Rephrased, not marked.** Seven findings were explanatory or read-only lines, so I reworded them without adding an allow marker:
   - planner 507, 567 and 1069 (inside the mode-guarded step)
   - plan-objective 5 and 59
   - discuss 150 and 401

   No `planning-audit: allow` marker was added, and EXEMPT lines in planner.md are untouched (test 14 green).
6. **[Scope] No change needed in four listed files.** `agents/job-checker.md`, `workflows/list-objective-assumptions.md`, `skills/list-objective-assumptions/SKILL.md` and `skills/plan-objective/SKILL.md` had zero findings and no verb `2>/dev/null` lines, so they are unchanged. job-checker's Dimension 8 (48-03) already reads `verify trd-pre` without `--raw`.
7. **[Process] Typo fix.** On the researcher line I rewrote, "jobner" became "planner".

## Known gaps / notes for later TRDs

- **Stale drafts (48-22 / 48-23):**
  - `draftPath` seeds only when no draft exists, and nothing deletes a draft after publish.
  - If a file changes through another path between two drafts of it, the second draft starts stale. Those paths are another verb, `gh pull`, or another checkout.
  - The prose here works around it in the one scripted block. Agent-driven flows (planner revision, discuss "Update it") rely on the draft matching the last publish.
  - Suggestion: a `planning draft --fresh` flag, or reseed when the draft equals the last published bytes.
- **Store-mode end-to-end:** `objective add` / `objective put` in the plan-milestone-gaps store branch is not exercised end to end here. Store-mode subprocess tests belong to 48-22.
- **Inflected forms (48-04 limitation) are still invisible to the scanner.** Examples: researcher "RESEARCH.md created in correct format", plan-milestone-gaps "ROADMAP.md updated with new objectives" (success checklists). They are left as they are.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6
  - plan group zero, with `plan.json` holding `_comment` only
  - planner draft → put-trd → push
  - scope budget text
  - doc put for RESEARCH/CONTEXT/DISCOVERY, plus ROADMAP mode guard and state commands
  - no verb `2>/dev/null`
  - local behaviour byte-identical
- Gate failures: none from this TRD (MA-7 is a known flake)

## Self-Check: PASSED

- FOUND: all 16 modified files (edited in this session; the ratchet scans them green)
- FOUND: commits 86eee7c4, a45683e3, 7f8e51d2 (`git log da772beb..HEAD`) and 4564d417 (returned by df-tools commit)
- STATE.md / ROADMAP.md deliberately not edited: the orchestrator updates them after the merge
