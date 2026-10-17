---
objective: 78-remove-the-rename-shims
trd: "11"
subsystem: compat
status: checkpoint
---

# Objective 78 TRD 11: compat single name Summary

## Progress
- [x] Task 1: RED — the shims are gone (unit, hooks, user files) — 4d7018c9
- [x] Task 2: GREEN — planning directory, project root and agent namespace — (this commit)
- [ ] Task 3: GREEN — user files from the runtime home only — next step: in plugins/aoforge/aoforge/bin/lib/compat.cjs delete resolveUserFile and legacyRuntimeHome, make userDotFile(home, name) return path.join(runtimeHome(home), name); in watcher-allowlist.cjs call userDotFile(home, `${NAMES.watch}-allow.json`) and drop the LEGACY import; rewrite the two "for one release" comments in config.cjs/init.cjs; update watcher-allowlist.test.cjs's ~/.aoforge/ cases to "ignored"; rerun the Task 3 verify set and the full suite
