# Objective 71 TRD 01: Drafter self-test and declared linters Summary

Checkpoint draft. A SUMMARY without `## Self-Check` is a checkpoint, not a completed run.

## Progress
- [x] Task 1: Realshape fixture builders for the self-test gate, the proto lint target and the guarded linter — d46f502c
- [x] Task 2: A self-test step never fills a key while its gate sibling exists — 95a1d153 (RED), (this commit) (GREEN)
- [ ] Task 3: A lint target that runs the default plus unconditional linters is the lint entry point — next step: K31 linterToolOf in stack-classify.test.cjs (RED), then AUX_LINTERS/linterToolOf and declaredLinters
