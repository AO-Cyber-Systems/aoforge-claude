---
objective: 72-install-and-naming-cleanup
trd: "27"
subsystem: github
tags: [gh-client, gh-rebrand, gap-closure, maxBuffer, tdd]
requirements: [INST-04]
---

# Objective 72 TRD 27: gh-client read buffer for `gh rebrand`, proven on eden-biz (gap closure) Summary

## Progress
- [x] Task 1: Hand-built fixtures: a delaying gh shim entry and a sized, slurped issues answer — f9d41715 (RED), 46f5e23e (GREEN)
- [ ] Task 2: gh-client spawn runner: 256 MiB buffer, 300 s paginated timeout, named ENOBUFS/ETIMEDOUT causes — next step: RED committed (this commit); in plugins/aoforge/aoforge/bin/lib/gh-client.cjs add GH_MAX_BUFFER/DEFAULT_TIMEOUT_MS/PAGINATE_TIMEOUT_MS, spawnOptions + describeBytes, the ENOBUFS/ETIMEDOUT branches in defaultRunGh and the exports, then run the gh*.test.cjs suites green
- [ ] Task 3: Prove it on eden-biz (read-only dry run), record the plan, then CHANGELOG, USER-GUIDE and the tracker

## Estimate

`node ~/.claude/aoforge/bin/aof-tools.cjs estimate trd 72-27` (recorded at 16:31Z, before any edit): **10 min (P90 19 min), $4.03 (P90 $6.58)**, 3 tasks, confidence low (weakest: Task 1, test_tdd, n=5), minutes from TRD-level history (n=73).
