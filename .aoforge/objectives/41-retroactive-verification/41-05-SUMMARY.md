---
objective: 41-retroactive-verification
trd: "05"
job: 41-05
requirements: [VER-34]
status: complete
verdict: human_needed
score: 9/9
key-files:
  created:
    - .planning/objectives/34-ui-oracle-loop-w1b-surface-spec-schema-validator-renderer-re/34-VERIFICATION.md
    - .planning/objectives/41-retroactive-verification/41-05-SUMMARY.md
---

# 41-05 SUMMARY — Verify objective 34 (Surface Spec W1b)

**Verdict:** human_needed. **Score:** 9/9 must-have groups, 7/7 Definition-of-done clauses.

## Gaps

None in code. Nothing is worth a fix TRD.

- Out of band (human): `main` has no branch protection (`gh api .../branches/main/protection` -> 404), so the path-filtered `agent-shell-harness` job is not a required check. `.github/workflows/agent-shell-harness.yml:9-11` already names this as a mitigation that still has to be applied.
- Cosmetic, not worth a fix TRD: when `ui lock` refuses an invalid spec it reports `lock.reason` "the spec could not be read". The spec was in fact read, and the refusal itself behaves correctly.
- Formatting, not worth a fix TRD: the Objective 34 job list in ROADMAP.md is missing a newline between 34-06 and 34-07.

## Superseded (not missing)

- The version trio was 2.9.0 and now reads 2.10.1. The `v2.9.0` tag and the `## [2.9.0]` heading at CHANGELOG.md:264 both exist.
- A run where a check was MISSING used to exit 0 and now exits 2 (v2.10.0, #90).
- The `lock` field was a string and is now an object with four values, including `MISSING`.
- What the proposal calls "step 0" is SKILL.md step 5, numbered by position and annotated as such.

## Evidence

- Targeted tests: 9 suites, 224/224 pass (yaml-lite 19, ui-spec 16, ui-spec-validate 46, ui-spec-cli 34, ui-spec-render 22, ui-sheet 17, ui-spec-lock 18, ui-spec-skill-contract 15, agent-shell-harness 37).
- CLI: the 12 broken fixtures exit 1, each with its own code. `projects-rail` exits 0. Render graph and table output is byte-identical to the snapshots, and the manifest matches except for the `<engine_version>` placeholder.
- Sheet (on a scratch copy): 17 `MISSING` cells and no external assets. The hash stays the same when the template is edited and changes when the spec changes.
- Lock (on a scratch copy): held, held after a prose edit, cleared after a `states` edit (`ok` stays true), absent without an acceptance block. A bad hash, a missing `--by`, or an invalid spec each exit 1.
- Harness: my own probe fails a bare `cd` with `cwd-leak`, passes the subshell form, and reports an absent section as `missing`.

## Tree hygiene

`git status --porcelain .planning/objectives/34-ui-oracle-loop-w1b-surface-spec-schema-validator-renderer-re plugins/devflow/devflow/bin/lib/__fixtures__` printed nothing before the report was written. After writing, the only new file under 34 is 34-VERIFICATION.md. No existing 34 file and no fixture was modified. Nothing was committed.
