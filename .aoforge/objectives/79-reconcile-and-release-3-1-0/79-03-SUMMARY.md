---
objective: 79-reconcile-and-release-3-1-0
trd: "03"
status: checkpoint
---

# Objective 79 TRD 03: Re-prove pre-bash one-process equivalence on the merged hooks Summary

## Progress
- [x] Task 1: Fixture builder and hand-built corpus — 617af45b
- [x] Task 2: Equivalence test, mutation proof, and fixes for any divergence — (this commit; every case equal on the first run, no fix needed)
- [ ] Task 3: Hook-domain triage rows and registration checks — next step: confirm no 79-01 triage row routes to 79-03 (79-01-SUMMARY "Full-suite triage"), re-run the hook domain (`node --test 'plugins/aoforge/hooks/*.test.js' hook-inventory.test.cjs doctor-checks/11-12-install.test.cjs`, scratch HOME), check hooks.json has no duplicate registration, then the full suite minus watcher-shell.test.cjs
