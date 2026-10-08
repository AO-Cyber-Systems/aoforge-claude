---
objective: 65-release-v1-5
trd: "03"
subsystem: release
tags: [release, v2.14.0, merge, tag, github-release]

requires:
  - objective: 65-02
    provides: green release PR #126 at e7dc109c

provides:
  - "main = 8295a169 `Merge #126: release 2.14.0 — v1.5 Gate & Plumbing (objectives 56–64)`, parents 533d2b87 (main before) and e7dc109c (PR head); `git diff e7dc109c 8295a169` is empty"
  - "annotated tag v2.14.0 on 8295a169, pushed; ls-remote peels to 8295a169"
  - "GitHub release `Release 2.14.0 — v1.5 Gate & Plumbing (objectives 56–64)`, non-draft, created by release.yml run 37770949978 (success)"

affects: [65-04, 74]

key-files:
  created: []
  modified: []

key-decisions:
  - "Merged with `gh pr merge 126 --merge` and the TRD's exact subject and body. No --admin, squash or branch delete."
  - "changelog-on-tag dry run against 8295a169 printed nothing (exit 0), and the real `git tag -a` was not denied. No escape variable was used."
  - "The docs deploy failure is recorded as a follow-up for objective 74 (OPS-03), not rolled back."

requirements-completed: [REL-01]

duration: ~15min
completed: 2026-10-08
---

# 65-03 Summary: merge, tag and GitHub release

## Outcome
- **Merge:** the user approved it. PR #126 state is MERGED, at commit 8295a169fe108c3af2d76d2480d1c0f95c1f6dcf. origin/main points to that commit. Its first parent is 533d2b87 and its second is e7dc109c. The tree is identical to the CI-validated head.
- **Tag:** the user approved it. `git cat-file -t v2.14.0` prints `tag`, and `v2.14.0^{commit}` is 8295a169. The push printed `* [new tag] v2.14.0 -> v2.14.0`, and ls-remote shows `refs/tags/v2.14.0^{}` at 8295a169.
- **Release:** the `Release on tag` workflow succeeded. https://github.com/AO-Cyber-Systems/devflow-claude/releases/tag/v2.14.0 is published (isDraft false).
- **Main-branch runs:**
  - The `Unit suite` on main is recorded in the objective completion notes.
  - The `Docs site` run (37770895912) **failed**. Wrangler reported `Project not found... [code: 8000007]` for `/accounts/***/pages/projects/devflow-docs`. This is the open OPS-03 item owned by Objective 74, which makes the project exist or fixes the account and token. It is not caused by the release content.
