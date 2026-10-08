# Objective 71 TRD 01: Drafter self-test and declared linters Summary

Checkpoint draft. A SUMMARY without `## Self-Check` is a checkpoint, not a completed run.

## Progress
- [x] Task 1: Realshape fixture builders for the self-test gate, the proto lint target and the guarded linter — (this commit)
- [ ] Task 2: A self-test step never fills a key while its gate sibling exists — next step: register selfTestGateShape in REALSHAPE and add the ST1-ST7 cases to /Users/justin/dev/.df-worktrees/devflow-claude/71-01-drafter-self-test-and-declared-linters/plugins/devflow/devflow/bin/lib/stack-draft.test.cjs (RED), then add selfTestArgs/sameEntryPoint and the evaluateKey pool filter in stack-draft.cjs
- [ ] Task 3: A lint target that runs the default plus unconditional linters is the lint entry point — next step: K31 linterToolOf in stack-classify.test.cjs (RED), then AUX_LINTERS/linterToolOf and declaredLinters
