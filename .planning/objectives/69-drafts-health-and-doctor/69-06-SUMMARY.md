---
objective: 69-drafts-health-and-doctor
trd: "06"
subsystem: docs
tags: [dogfood, docs, changelog, user-guide, drafts, skill-active, requirements-agreement]
requires: ["69-01", "69-02", "69-03", "69-04", "69-05"]
provides:
  - "dogfood evidence for success criteria 1-3 on scratch copies of this repository's .planning/"
  - "landed-state proof for 69-01..69-05 (ancestor of HEAD, created files present at HEAD)"
affects: [objective 69 verification]
tech-stack:
  added: []
  patterns: ["dogfood on mktemp copies through --cwd / --path / TMPDIR, never the live .planning/"]
key-files:
  created: []
  modified:
    - CHANGELOG.md
    - docs/USER-GUIDE.md
    - CLAUDE.md
    - .planning/todos/completed/2026-07-31-harden-df-tools-health-for-tracked-and-stale-skill-active-markers.md
key-decisions:
  - "The E006/W064 and W065 paragraphs live in one new USER-GUIDE section, Health checks for the skill marker and requirements, after Upgrading a Project in Place: the guide has no single place holding the W062 and W063 paragraphs (they sit in Model Profiles and the GitHub enforcement section), and a reader looking for E006 or W065 should find both codes in one place."
  - "The USER-GUIDE Command Reference has no `validate` row, so `validate requirements [--objective <N>]` is added to the `/devflow:status check` row (which already names `validate health`) and documented in the new section."
  - "help.cjs is not touched: this TRD forbids source changes. Its `planning draft` text is still true but no longer complete (it omits the reseed); recorded as a follow-up."
requirements-completed: [TOOL-06, TOOL-09, TOOL-10]
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false
duration: 14min
completed: 2026-10-08
tokens_input: 16373902
tokens_output: 60926
tokens_cache_read: 16209126
tokens_cache_write: 164536
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 69 TRD 06: Dogfood and docs Summary

**Success criteria 1-3 shown on scratch copies of this repository's `.planning/` with the repository df-tools, and every earlier TRD of objective 69 confirmed landed at HEAD.**

## Dogfood Evidence

`S` = `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/363d3551-9eb1-4828-8e49-0d9566d36b8e/scratchpad/dogfood.fp9NOG` (from `mktemp -d`). `DF` = `node /Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/df-tools.cjs`. `P` = `S/tmp/devflow-drafts/drafts-a4d23d2b/PROJECT.md`. The live `.planning/` and the live drafts tree were never targeted by a dogfood command.

| Criterion | Command | Exit | Decisive output |
|---|---|---|---|
| SC-1 | `TMPDIR=S/tmp DF --cwd S/drafts planning draft PROJECT.md` (then "dogfood edit A" appended to P) | 0 | stdout is P, no stderr |
| SC-1 | `TMPDIR=S/tmp DF --cwd S/drafts doc put PROJECT.md --from S/other.md` (other.md = PROJECT.md + "concurrent change B") | 0 | `doc put: wrote .planning/PROJECT.md (local mode).` |
| SC-1 | `shasum -a 256 S/drafts/.planning/PROJECT.md` | 0 | `7cc71cdd4b8d649e157f3813262e1c3dea55a0bdac9bfb5a6505ff8350a5c06f` |
| SC-1 | `TMPDIR=S/tmp DF --cwd S/drafts doc put PROJECT.md --from P` | 1 | `doc put: refused (stale draft). Nothing was written.` ... `Run \`df-tools planning draft PROJECT.md\` to reseed it (it keeps your edits at P.stale)` |
| SC-1 | `shasum -a 256 S/drafts/.planning/PROJECT.md` after the refusal | 0 | same `7cc71cdd...5c06f`: live file unchanged |
| SC-1 | `TMPDIR=S/tmp DF --cwd S/drafts planning draft PROJECT.md` | 0 | stdout P; stderr `planning draft: reseeded P from .planning/PROJECT.md: the live file changed after the draft was seeded. Your previous draft is at P.stale.` |
| SC-1 | `cmp P S/drafts/.planning/PROJECT.md` | 0 | identical (the reseed is the live text, including concurrent change B) |
| SC-1 | `grep -c "dogfood edit A" P.stale` | 0 | `1` (the edit survived in the stale copy) |
| SC-1 | `doc put PROJECT.md --from P` after re-applying "dogfood edit A" to the reseeded P | 0 | `doc put: wrote .planning/PROJECT.md (local mode).`; `grep -c -E "^(dogfood edit A\|concurrent change B)$"` on the live copy prints `2` (both present) |
| SC-2 | `DF --cwd S/marker validate health` (scratch git repo, copy of `.planning/`, committed expired marker) | 0 | `E006 skill-marker-tracked: .planning/.skill-active is tracked in git ... (it is also stale: expired at 2026-10-01T08:00:00.000Z)`, `repairable: true`, `repairable_count: 1` |
| SC-2 | `DF --cwd S/marker validate health --repair` | 0 | `repairs_performed`: `untrackSkillMarker` success, `removeStaleSkillMarker` success (the JSON findings are the pre-repair snapshot) |
| SC-2 | `git -C S/marker status --porcelain=v1` | 0 | exactly `D  .planning/.skill-active` |
| SC-2 | `git -C S/marker rev-parse HEAD` before and after | 0 | `a026bef2d8e27bd1e30135167e80f83ee55684f0` both times |
| SC-2 | `git -C S/marker diff --cached --name-only` | 0 | `.planning/.skill-active` only |
| SC-2 | `git -C S/marker reset -q --hard`, then `HOME=S/home DF doctor --json --path S/marker` | 0 | check `skill-markers`: severity `error`, `details.codes` `["E006"]`; check `validate-health`: `details.deferred` includes `"E006"`, its own codes only `["W006"]` |
| SC-2 | `git add notes.txt`, then `HOME=S/home DF doctor --fix --json --path S/marker` | 0 | `fixes: []`; `skill-markers` `fixable: false`, `fix_command`: `commit or unstage your changes (staged changes present: notes.txt), then re-run ...doctor --fix`; `git status` is `A  notes.txt` (marker still tracked and present) |
| SC-2 | `git reset -q notes.txt`, then `HOME=S/home DF doctor --fix --json --path S/marker` | 0 | one fix entry, `skill-markers` `applied: true`, `changed: [".planning/.skill-active"]`, notes carry `commit with: ...df-tools.cjs commit "chore: untrack DevFlow runtime state" --files .planning/.skill-active` and `removed: .planning/.skill-active` |
| SC-2 | `git -C S/marker status --porcelain=v1`, `rev-parse HEAD` | 0 | `D  .planning/.skill-active` and `?? notes.txt`; HEAD `dbfe7c1b1dbd217c9571dc7e2e0114356be35f33` unchanged |
| SC-3 | `DF --cwd /Users/justin/dev/devflow-claude validate requirements --raw` | 0 | `requirements-completed agrees with VERIFICATION (60 objectives, 22 requirements checked)` |
| SC-3 | `DF --cwd /Users/justin/dev/devflow-claude validate health` | 0 | codes `{"W006":6,"I001":1}`, `repairable_count: 0`: no E006, W064 or W065 (the six W006 are ROADMAP objectives 70-75 without directories) |
| SC-3 | `DF --cwd S/req validate requirements --objective 58` (58-05, 58-08, 58-09, 58-10 set to `requirements-completed: []`) | 0 | exactly two findings: `EST-02` (candidates 58-05, 58-08, 58-10) and `EST-04` (candidates 58-09, 58-10); `checked: {objectives: 1, requirements: 4}` |
| SC-3 | `DF --cwd S/req validate health` | 0 | `{"W006":6,"W065":2,"I001":1}`, `repairable_count: 0`; the two W065 are `requirements-unlisted` for EST-02 and EST-04 |
| Landed | `git merge-base --is-ancestor <sha> HEAD` for the last code commit and the docs commit of each TRD (d09e8428, 9ec8fc99, 10afa68e, 186efd78, 0613549c, fd082c5a, f8148009, d88a7766, 4dee746b, 09b00217) | 0 each | all ten are ancestors of HEAD (`53c7a66e`) |
| Landed | `git cat-file -e HEAD:<path>` for the files each TRD created (69-01: planning-drafts.cjs, planning-drafts.test.cjs, planning-drafts-cli.test.cjs, __fixtures__/draft-fixtures.cjs; 69-02: skill-marker-health.cjs, skill-marker-health.test.cjs, validate-skill-marker.test.cjs, __fixtures__/skill-marker-fixtures.cjs; 69-03: requirements-agreement.cjs, .test.cjs, .repo.test.cjs, __fixtures__/requirements-fixtures.cjs; 69-04 (no created files): doctor-checks/23-skill-markers.cjs, 22-validate-health.cjs; 69-05: validate-requirements.test.cjs) | 0 each | 15 of 15 present; the script printed `ALL LANDED` |

### Notes on the dogfood runs

- **First doctor pass showed an unrelated fix.** In the first `doctor --fix` run the scratch repository also held `.planning/.awareness-cache.json` and `.planning/.progress-guard.json` as tracked files, because `git add -A` in a scratch repository with no `.gitignore` swept up the runtime state this repository gitignores. Doctor's `legacy-runtime-state` check (migration 0008) therefore also untracked them and wrote a `.gitignore`. The `skill-markers` fix entry was still exactly `.planning/.skill-active`. I rebuilt the scratch commit without those two files (new HEAD `dbfe7c1b...`) and repeated the doctor sequence, which is the one recorded above, so the git state is the marker deletion and `?? notes.txt` and nothing else. The same cause produced a W040 (`project-behind`, one pending migration) in the first `validate health`; it is not repairable and is gone once the two files are not tracked.
- **`fixes` is empty when the guard refuses.** With an unrelated file staged, `skill-markers` is reported `fixable: false` (the refusal text is in `finding` and `fix_command`), so doctor attempts no fix and `fixes` is `[]`. The TRD's wording ("fix refused naming `staged changes present`") is met by those two fields.
- **Doctor exit codes.** `doctor` and `doctor --fix` exited 0 in every run above, including a run with an error-severity check.

## Progress
- [x] Task 1: Dogfood SC-1..SC-3 on scratch copies and record landed state — 32b4c450
- [x] Task 2: CHANGELOG, USER-GUIDE, CLAUDE.md and the todo — ebc12ca0

## What was built

- `CHANGELOG.md` `[Unreleased]`: an objective 69 lead paragraph above objective 68's; Added (E006/W064 Check 19, W065 Check 20, `validate requirements`, `doctor-git.checkIgnored`); a new Changed heading (`planning draft` reseed and `doc put` refusal, doctor check 23 and check 22); Fixed (objective 58 SUMMARY frontmatter).
- `docs/USER-GUIDE.md`: a new section **Health checks for the skill marker and requirements (E006, W064, W065)** (what makes a marker tracked or stale, the repair table, the DOC-06 guard, the commit command, check 23 owning both codes, the W065 rule, its REQUIREMENTS-document scope, `validate requirements [--objective <N>]`); a **Drafts stay current** paragraph in the planning write path (base record, reseed and `.stale`, the stderr notice, the `doc put` refusal and its limits); the `/devflow:status check` and `/devflow:doctor` Command Reference rows; two Known issues bullets.
- `CLAUDE.md`: one clause per change in the **Validation**, **Planning verbs** and **Doctor** bullets.
- The skill-active todo moved to `.planning/todos/completed/` with `df-tools todo complete`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Dogfood SC-1..SC-3 and landed state | the Dogfood Evidence table above (one row per command, every expected value matched) | 0 | PASS |
| 2: docs | `rg -c "validate requirements" CHANGELOG.md docs/USER-GUIDE.md CLAUDE.md` printed 2, 3 and 1; `rg -c "E006" docs/USER-GUIDE.md CLAUDE.md` printed 6 and 2; `test -f .planning/todos/completed/2026-07-31-harden-df-tools-health-for-tracked-and-stale-skill-active-markers.md` | 0 | PASS |
| 2: doc repo tests | `node --test` on doc-refs.repo, planning-writes.repo, dispatch-completeness, hook-inventory, requirements-agreement.repo (38 tests) | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test plugins/devflow/devflow/bin/lib/{doc-refs.repo,planning-writes.repo,dispatch-completeness,hook-inventory,requirements-agreement.repo}.test.cjs` (38 tests, 0 fail) | 0 | PASS |
| test (full) | `npm test` in the main checkout: 11406 tests, 11371 pass, 1 fail, 34 skipped | 1 | PASS against baseline: the one failure is `roadmap-reconcile.test.cjs` E2E1 (below) |
| lint / typecheck / build | none in the stack profile | n/a | not_available |

`E2E1` ("reconcile dry-run against this repo ROADMAP shows zero drift") reports `trd_summary_exists` for `69-06`: this TRD's checkpoint SUMMARY exists beside an unticked ROADMAP checkbox. It is the same transient 69-02, 69-04 and 69-05 recorded, and it clears once `roadmap update-job-progress 69` runs after the final post. The `devflow-watch` and handoff daemon tests that fail in worktrees passed in this main checkout.

## Deviations from Plan

### Auto-fixed Issues

None to code: this TRD forbids source and test changes, and none were made.

### Adjustments inside the TRD's scope

**1. [Evidence] The first `doctor --fix` run was repeated on a cleaner scratch repository**
- **Found during:** Task 1, SC-2
- **Issue:** The scratch repository's `git add -A` tracked `.planning/.awareness-cache.json` and `.planning/.progress-guard.json` (runtime state this repository gitignores), so `doctor --fix` also applied the `legacy-runtime-state` fix beside `skill-markers`. The TRD's error_recovery anticipates a second repair and asks for its cause to be removed before repeating.
- **Fix:** removed the two files from the scratch commit and repeated the doctor sequence. The recorded run shows one fix entry, `skill-markers`, and a git state of `D  .planning/.skill-active` plus `?? notes.txt`. The first run is described under "Notes on the dogfood runs".
- **Files modified:** none in the repository
- **Commit:** n/a

**2. [Docs placement] E006/W064 and W065 are in a new USER-GUIDE section, not beside the W062/W063 paragraphs**
- **Found during:** Task 2
- **Issue:** The W063 paragraph sits in Model Profiles and the W062 paragraph in the GitHub enforcement section, so there is no single "beside" for the new paragraphs, and the guide has no `validate` row in the Command Reference to extend.
- **Fix:** one new section (**Health checks for the skill marker and requirements (E006, W064, W065)**) after **Upgrading a Project in Place**, linked from the `/devflow:status check` row, which also carries `validate requirements [--objective <N>]`.
- **Files modified:** docs/USER-GUIDE.md
- **Commit:** ebc12ca0

## Issues Encountered

- **Follow-up, not done here:** `plugins/devflow/devflow/bin/lib/help.cjs` still describes `planning draft <rel>` as printing "a draft path seeded with the current file" (lines 25 and 359). It is true but omits the reseed and the `.stale` copy. 69-01 left it for this TRD; the TRD forbids source changes, so it stays open for a later change.
- **Defects found by the dogfood:** none. Every criterion matched its expected value on the first run, apart from the scratch-repository artifact above.

## Discovered commands

None. Every command came from the stack profile (`npm test`, scoped `node --test {files}`).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5. Draft refusal, reseed and re-publish (SC-1 rows); E006 repairable, `--repair` leaving `D  .planning/.skill-active` with HEAD unmoved, and doctor's refusal then marker-only fix (SC-2 rows); no finding on this repository and exactly EST-02 and EST-04 on the reverted 58 copy (SC-3 rows); all ten commits ancestors of HEAD and 15 files present (Landed rows); CHANGELOG, USER-GUIDE and CLAUDE.md describe the behaviour and the todo is in `todos/completed/` (task 2 verify).
- Gate failures: `roadmap-reconcile.test.cjs` E2E1 only, the checkpoint-flow transient described above.

## Self-Check: PASSED

- Commits found in `git log`: 32b4c450, ebc12ca0.
- Modified files present: CHANGELOG.md, docs/USER-GUIDE.md, CLAUDE.md; `todos/completed/2026-07-31-harden-df-tools-health-for-tracked-and-stale-skill-active-markers.md` present and the pending copy gone.
- Scratch evidence directory used throughout: `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/363d3551-9eb1-4828-8e49-0d9566d36b8e/scratchpad/dogfood.fp9NOG`; the live `.planning/` and the live drafts tree were not a dogfood target.
