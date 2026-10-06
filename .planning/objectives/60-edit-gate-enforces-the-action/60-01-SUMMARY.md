# Objective 60 TRD 01: Shared shell-text primitives and hand-built command cases Summary

## Progress
- [x] Task 1: Hand-built command cases shared by 60-02 to 60-05 — 5def9a64
- [ ] Task 2: lib/shell-words.cjs (moved primitives plus extractHeredocs, scanShell, parseCommand) — RED committed (this commit), next step: create plugins/devflow/devflow/bin/lib/shell-words.cjs so shell-words.test.cjs goes green, then commit feat(60-01)
- [ ] Task 3: gate-commits.js and session-audit.cjs require shell-words — next step: delete the five moved definitions from plugins/devflow/hooks/gate-commits.js and HEREDOC_BODY_RE from session-audit.cjs, then run the six test files
