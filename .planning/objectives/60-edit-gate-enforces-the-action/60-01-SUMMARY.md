# Objective 60 TRD 01: Shared shell-text primitives and hand-built command cases Summary

## Progress
- [x] Task 1: Hand-built command cases shared by 60-02 to 60-05 — 5def9a64
- [x] Task 2: lib/shell-words.cjs (moved primitives plus extractHeredocs, scanShell, parseCommand) — 7074f5f9 (RED), (this commit) (GREEN)
- [ ] Task 3: gate-commits.js and session-audit.cjs require shell-words — next step: delete the five moved definitions and the unused `os` require from plugins/devflow/hooks/gate-commits.js and HEREDOC_BODY_RE from session-audit.cjs, un-todo the two identity tests in shell-words.test.cjs, then run the six test files
