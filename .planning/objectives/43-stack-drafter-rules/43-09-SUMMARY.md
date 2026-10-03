# Objective 43 TRD 09: Evidence-shape fixes from real repos (Make comments, drift checks, CI env, version probes) Summary

## Progress
- [x] Task 1 RED: realshape scaffold (3 shapes) and the four KNOWN_DRIFT rows removed — (this commit)
- [ ] Task 1 GREEN: Makefile help-comment fix — next step: add RED unit tests (`t: ## a; b` body has no `b`; `t: dep ; echo x # c` keeps its inline recipe; `t: ## a` unchanged) to plugins/devflow/devflow/bin/lib/stack-runners.test.cjs, then make makePrereqs and the parseMakefile rule branch in stack-runners.cjs honour a `;` only before the first unescaped `#`
- [ ] Task 2: captured and snapshot drift checks; body-key check suffix
- [ ] Task 3: workflow env substitution; version probes
