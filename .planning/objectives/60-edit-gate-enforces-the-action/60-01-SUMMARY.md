# Objective 60 TRD 01: Shared shell-text primitives and hand-built command cases Summary

## Progress
- [x] Task 1: Hand-built command cases shared by 60-02 to 60-05 — (this commit)
- [ ] Task 2: lib/shell-words.cjs (moved primitives plus extractHeredocs, scanShell, parseCommand) — next step: write tests 2-10 in plugins/devflow/devflow/bin/lib/shell-words.test.cjs, run them RED, commit, then create shell-words.cjs
- [ ] Task 3: gate-commits.js and session-audit.cjs require shell-words — next step: delete the five moved definitions from plugins/devflow/hooks/gate-commits.js and HEREDOC_BODY_RE from session-audit.cjs, then run the six test files
