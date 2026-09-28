---
objective: 27-gate-correctness
verified: 2026-09-28
verified_at: 2026-09-28T16:36:55Z
status: passed
score: 6/6
re_verification: false
verified_by: TRD 41-01 (retroactive, independent)
gaps: []
deferred:
  - id: 27-03
    what: "Gate posture (.planning/ strict, source warn)"
    why: "Deferred by decision — DECISION-001 pending; SUMMARY recommends re-measuring the gate after the 27-01/27-02 fixes before deciding"
notes:
  - kind: live_runtime
    note: "Live-runtime confirmation pending release. Hooks run from the plugin cache, so the 27 fixes are live only after a plugin version bump + sync-runtime. Verified against repo code and tests only."
  - kind: stale_prose
    where: CLAUDE.md:35 (and :31)
    note: "Tree comment says '7 other hooks' (16 other .js hook files ship) and '12 subagent prompts' (13 ship). The hook inventory list itself is accurate. Informational; not an objective-27 truth."
  - kind: test_skip_path
    where: plugins/devflow/hooks/gate-edits.test.js:695
    note: "The git-worktree integration tests silently `return` (pass) when git is unavailable. git is present here, and an independent probe reproduced the behaviour, so no gap; worth a t.skip() so a sandboxed CI run cannot pass vacuously."
  - kind: test_coverage
    note: "skill-active.test.cjs always pins ttlAnchorMs, so it does not by itself guard the 27-01a regression (an injected historical `now` minting an expired marker). micro.test.cjs (32/32) does guard it, and so did the independent probe."
---

# Objective 27: Gate correctness. Verification report

**Objective goal (ROADMAP):** Stop DevFlow's own gates from blocking DevFlow's own agents. Close the three gate defects from the Autonomy Blocker Audit (edit-gate denials inside subagents, denials on paths outside the repo, commit-gate substring matches) and mitigate the harness worktree guard.
**Verified:** 2026-09-28, against `feat/stack-profile-loader` at HEAD `0912720`
**Status:** passed (6/6)
**Re-verification:** No. This is the first VERIFICATION.md for 27; it was written retroactively by 41-01.

Every truth below was re-run. I did not rely on SUMMARY claims. Independent probes are scratchpad scripts (`probe27.cjs`, `probe27c.cjs`). They build throwaway git repos and worktrees under `os.tmpdir()`, drive the real hook processes with PreToolUse payloads on stdin, and delete the fixtures afterwards.

## Tests re-run

| Command | Result |
|---|---|
| `node --test plugins/devflow/hooks/gate-edits.test.js` | 63/63 pass (SUMMARY: 63) |
| `node --test plugins/devflow/hooks/gate-commits.test.js` | 25/25 pass (SUMMARY: 25) |
| `node --test plugins/devflow/devflow/bin/lib/skill-active.test.cjs` | 24/24 pass (SUMMARY: 24) |
| `node --test plugins/devflow/devflow/bin/lib/micro.test.cjs` | 32/32 pass (guards the 27-01a TTL regression) |
| `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 10/10 pass (repo-wide stale `/df:` guard) |

## Observable truths

| # | Truth | Evidence command | Observed | Verdict |
|---|---|---|---|---|
| 1 | 27-01: the marker resolves from the local `.planning/` AND the MAIN checkout's `.planning/` (via the `gitdir:` parse). A real git-worktree integration test exists | `rg -n -e 'gitdir'` finds `gate-edits.js:105` and `skill-active.cjs:102`, and `hasSkillActiveMarker` (gate-edits.js:132-153) checks both dirs. The test at gate-edits.test.js:699-757 runs a real `git worktree add`. Probe on a real repo + worktree | Worktree edit with no marker anywhere: **deny**. `df-tools skill-active --start build` run from inside the worktree wrote the marker to **both** the worktree and main `.planning/`. After deleting the worktree copy (marker in main only), the worktree edit was **allowed** | VERIFIED |
| 2 | 27-01/01a: markers carry `expires_at`, 8h by default, anchored to the wall clock rather than an injected `now`. TTL and legacy markers are tested | skill-active.cjs:69 `DEFAULT_TTL_MS = 8h`. :181-191 anchors to `Date.now()` unless `ttlAnchorMs` is passed. Tests at skill-active.test.cjs:88-111 and :183-208 (expired, legacy). Probe | CLI marker `expires_at − now` = **8.00 h**. `startSkill` with an injected `now: 2020-01-01` still gave a future `expires_at`, and the gate accepted it. An expired main marker gave **deny**. A legacy marker with no `expires_at` gave **allow** | VERIFIED |
| 3 | 27-02: targets outside the project root are never gated, and the comparison is symlink-aware | `isOutsideProject` at gate-edits.js:208-227 compares both `path.resolve` and `realpathDeep` spellings; `shouldGate` :259. Probe | `isOutsideProject(/private/var/…, /var/…/src/new.cjs)` = false, and the reverse = false. Scratchpad `/private/tmp/claude-501/…` = outside. Hook result for a scratchpad Write with no marker: **allow**. In-project Write, `/var` spelling, cwd `/private/var`, no marker: **deny** (no over-widening) | VERIFIED |
| 4 | 27-02: `.planning/**` and `.md` writes without a marker behave as before | gate-edits.js:247 and :250. Probe | `.planning/NOTES.txt` gave **allow**, `docs/README.md` gave **allow**, `src/a.go` gave **deny** | VERIFIED |
| 5 | 27-04: the commit gate is invocation-aware. A heredoc or quoted mention passes and a real invocation is blocked | gate-commits.js exports `invokesGitCommit`, `stripHeredocs`, `stripQuoted`. Probe spawns the hook | Heredoc body, `echo "…"` quoted mention, `rg -n -e '…'` pattern: no output (allowed). Bare invocation, `git add && …` chain, and a real invocation after a heredoc: `permissionDecision: deny` | VERIFIED |
| 6 | 27-05/06: executor has `<worktree_command_discipline>`, the CLAUDE.md hook inventory matches hooks.json, and no stale `/df:` prefix is left in shipped prose | `rg -n -e 'worktree_command_discipline' plugins/devflow/agents/executor.md`. hooks.json `rg -o` compared with the CLAUDE.md list. `rg -n -e '/df:' plugins/devflow` | Block present at executor.md:789-852; verifier.md:908 carries the same guidance. hooks.json registers 13 hooks, and CLAUDE.md lists all 13, plus `statusline.js` (confirmed in plugin.json `statusLine`) and 2 files explicitly marked "Draft (not registered)". Every `/df:` hit is a test, a fixture, the doc-refs detector/migration, or a route-intent exclusion test. There are 0 hits in shipped prose, and doc-refs.repo.test passes | VERIFIED |

**Score: 6/6**

## Superseded vs missing

- **Truth 6, `/df:` prefix.** 27-06 was a one-off prose cleanup. It has since been superseded by a stronger mechanism, `doc-refs.cjs` + `doc-refs.repo.test.cjs` + migration `0007-doc-refs-fix`, which fails the build if a stale `/df:` reference ships. The intent holds.
- **CLAUDE.md inventory.** Objectives after 27 rewrote the inventory. It now separates the registered hooks, the statusline declared in plugin.json, and the draft hooks, and it still matches hooks.json exactly. It is superseded and correct.

## Deferred (not gaps)

- **27-03 gate posture.** Deferred by decision; DECISION-001 is pending. The current tree still allows `.planning/**` and `.md`, which is consistent with the decision to defer.

## Notes

- Live-runtime confirmation is pending release. The fixes reach users only after a plugin version bump and a `sync-runtime` mirror.
- The CLAUDE.md tree comment has stale counts ("7 other hooks", "12 subagent prompts"). This is informational.
- The worktree integration tests pass vacuously when git is missing. Converting that path to `t.skip()` is suggested.

---
_Verified: 2026-09-28T16:36:55Z · Verifier: Claude (verifier, TRD 41-01)_
