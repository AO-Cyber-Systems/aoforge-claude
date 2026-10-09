---
objective: 72-install-and-naming-cleanup
trd: "27"
subsystem: github
tags: [gh-client, gh-rebrand, gap-closure, maxBuffer, tdd]
requirements: [INST-04]
---

# Objective 72 TRD 27: gh-client read buffer for `gh rebrand`, proven on eden-biz (gap closure) Summary

## Progress
- [x] Task 1: Hand-built fixtures: a delaying gh shim entry and a sized, slurped issues answer — f9d41715 (RED), (this commit) (GREEN)
- [ ] Task 2: gh-client spawn runner: 256 MiB buffer, 300 s paginated timeout, named ENOBUFS/ETIMEDOUT causes — next step: add `describe('72-27 spawn runner limits')` with R1-R4 and U1-U4 to plugins/aoforge/aoforge/bin/lib/gh-client.test.cjs (shims cleaned in the existing afterEach), watch R1 fail with `spawnSync gh ENOBUFS`, commit RED
- [ ] Task 3: Prove it on eden-biz (read-only dry run), record the plan, then CHANGELOG, USER-GUIDE and the tracker

## Estimate

`node ~/.claude/aoforge/bin/aof-tools.cjs estimate trd 72-27` (recorded at 16:31Z, before any edit): **10 min (P90 19 min), $4.03 (P90 $6.58)**, 3 tasks, confidence low (weakest: Task 1, test_tdd, n=5), minutes from TRD-level history (n=73).
