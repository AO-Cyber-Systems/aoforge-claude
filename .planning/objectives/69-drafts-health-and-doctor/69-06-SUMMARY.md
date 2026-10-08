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
  modified: []
key-decisions: []
requirements-completed: [TOOL-06, TOOL-09, TOOL-10]
verification:
  gates_defined: 1
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false
duration: in progress
completed: 2026-10-08
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
- [x] Task 1: Dogfood SC-1..SC-3 on scratch copies and record landed state — (this commit)
- [ ] Task 2: CHANGELOG, USER-GUIDE, CLAUDE.md and the todo — next step: edit the `## [Unreleased]` section of /Users/justin/dev/devflow-claude/CHANGELOG.md (an objective 69 lead paragraph above objective 68's, then Added/Changed/Fixed entries)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Dogfood SC-1..SC-3 and landed state | the Dogfood Evidence table above (one row per command, every expected value matched) | 0 | PASS |
