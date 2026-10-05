# Objective 59 TRD 02: advance-job from disk Summary

## Progress
- [x] Task 1: Fixture builders for position projects — a4b79cb2
- [ ] Task 2: Disk-derived advance-job and the no_position guard (tests 1-13) — RED committed (this commit: 14 of 17 tests fail, 3 legacy controls pass); next step: in plugins/devflow/devflow/bin/lib/state.cjs add advanceFromDisk and the no_position guard to cmdStateAdvanceJob(cwd, options, raw), then the --objective arm in df-tools.cjs and the help.cjs usage string, and run node --test on state-advance-job, state and help tests.
