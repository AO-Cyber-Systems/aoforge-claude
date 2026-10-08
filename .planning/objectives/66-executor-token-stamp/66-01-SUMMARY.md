---
objective: 66-executor-token-stamp
job: "01"
subsystem: estimation
tags: [tokens, coverage, df-tools, EST-09]
requirements-completed: [EST-09]
duration: Xmin
completed: 2026-10-08
---

# Objective 66 TRD 01: tokens coverage command Summary

**In progress: `df-tools tokens coverage`, the read-only forward-stamp coverage report.**

## Progress
- [x] Task 1: Hand-built coverage fixtures — a1e39b06
- [x] Task 2: token-coverage.cjs library (tests 8-14) — RED 151c9fee, GREEN c2de67b7
- [ ] Task 3: tokens coverage subcommand, help and header (tests 1-7), smoke run — RED test commit (this commit); next step: add the coverage subcommand (runCoverage, readRootFor, USAGE) to plugins/devflow/devflow/bin/lib/tokens-cli.cjs, then help.cjs and the df-tools.cjs header
