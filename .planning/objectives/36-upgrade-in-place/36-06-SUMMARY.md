---
objective: 36-upgrade-in-place
trd: "06"
subsystem: upgrade / global state
tags: [upgrade, global, claude-md, managed-block, notices, sync-runtime, tdd]
requires: ["36-01 upgrade fixtures (makeFakeHome, HAND_WRITTEN_ROUTING, snapshot)", "36-02 managed-block.cjs + notices.cjs"]
provides:
  - "lib/global-upgrade.cjs: findLegacy, moveLegacy, findRoutingSection, loadGlobalTemplate, planBlock, runGlobalUpgrade (+ KEYS, SRC, DEFAULT_TEMPLATE_PATH)"
  - "templates/global-claude-md.md (template: global-claude-md, template_version \"1\")"
  - "sync-runtime.js runs the BUNDLED global upgrade after a successful mirror; DEVFLOW_SKIP_GLOBAL_UPGRADE=1 skips it"
affects: ["36-03 `df-tools upgrade --global [--confirm]` calls runGlobalUpgrade", "36-05 route-results emits the global notices"]
tech-stack:
  added: []
  patterns:
    - "Plan/apply split: planBlock is pure (text in, plan out); runGlobalUpgrade does all I/O, so dryRun is the same plan without the writes"
    - "Supersede-by-key: the confirm path re-queues the adopt key at level info, replacing an unshown action notice"
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/global-upgrade.cjs
    - plugins/devflow/devflow/bin/lib/global-upgrade.test.cjs
    - plugins/devflow/devflow/templates/global-claude-md.md
  modified:
    - plugins/devflow/hooks/sync-runtime.js
    - plugins/devflow/hooks/sync-runtime.test.js
decisions:
  - "A DEVFLOW block in ~/.claude/CLAUDE.md with a foreign src (not global-claude-md) is treated as blocked (warn, no write) rather than overwritten"
  - "Created/updated blocks queue an info notice (key global-claude-md-block); adoption re-queues key global-claude-md-adopt at info so a pending action notice is superseded"
  - "The routing-section heading scan skips fenced code blocks, so a `# comment` inside a fence neither starts nor ends the section"
metrics:
  duration: "~8 min"
  completed: 2026-09-27
  tasks: 2
  files: 5
---

# Objective 36 TRD 06: Global upgrade Summary

The global `~/.claude` state now upgrades itself. `global-upgrade.cjs` moves the legacy v1 install
(`skills/df-*`, `agents/df-*`, `devflow/VERSION`) into `devflow/backups/legacy-<ts>/`. It deletes nothing.
It also maintains a version-stamped `<!-- DEVFLOW:START v=1 src=global-claude-md -->` block in
`~/.claude/CLAUDE.md`:

- **Hand-written "DevFlow Routing" section, first run:** notice only.
- **`confirm`:** adopts the section into the block.
- **Template version bump:** rewrites the block automatically.

`sync-runtime.js` runs the bundled module after a good mirror. The call is failure-isolated.

**The real `~/.claude` was not touched.** Every test used a fake home from `makeFakeHome` under
`os.tmpdir()`. The lib test also points `HOME` at a throwaway dir as a second fence. The hook tests spawn
with `HOME=<fake>`. No manual run of `runGlobalUpgrade` or `sync-runtime.js` was made against the real home,
and the real `~/.claude/CLAUDE.md` was never opened. After the full suite, a read-only `ls` confirmed that
`/Users/justin/.claude/devflow/backups` and `/Users/justin/.claude/devflow/.devflow-notices.json` do not
exist.

## What was built

- **`findLegacy(userHome)`** lists `df-`-prefixed entries under `.claude/skills` and `.claude/agents`, plus
  `.claude/devflow/VERSION`. Paths are relative to `.claude`.
- **`moveLegacy`** uses `renameSync` into `backups/legacy-<ts>/<rel>`, with a `-1`, `-2`… suffix if the
  directory already exists. On `EXDEV` only, it copies, verifies the copy byte-for-byte and then removes
  the original. If verification fails, the original stays in place.
- **`findRoutingSection`** matches heading lines only (`^#{1,6} `) whose text starts with `DevFlow Routing`.
  The section ends at the next heading of any level, and fenced code is skipped.
- **`planBlock`** is pure. It returns one of `none | created | updated | adopt_pending | adopted | blocked`.
  An existing block always wins over the hand-written section.
- **`runGlobalUpgrade`** takes `{userHome (required, absolute), pluginVersion, templatePath, confirm, dryRun, now}`
  and returns `{dryRun, legacy:{moved, backupDir}, block:{action, backup, from, to}, notices}`.
  - It loads the template before touching anything.
  - Before any CLAUDE.md write, it backs up the previous file to `backups/global-<ts>/CLAUDE.md`.
  - Writes go through temp + rename, following a symlinked CLAUDE.md to its real target.
- **Notice keys:**
  - `global-legacy-moved` (info)
  - `global-claude-md-adopt` (action while pending, info once adopted)
  - `global-claude-md-block` (info)
  - `global-claude-md-blocked` (warn)
- **sync-runtime:** the call sits after the `.plugin-version` write, inside the outer try, with its own
  try/catch. It is guarded by `existsSync(sourceDir/bin/lib/global-upgrade.cjs)` and loads the bundled
  module, never the mirror copy.

## Deviations from Plan

### Auto-fixed / additions

**1. [Rule 2 - Missing critical] Foreign-src block is blocked, not overwritten**
- **Found during:** Task 1
- **Issue:** If `~/.claude/CLAUDE.md` holds a block with another template's `src` (for example `claude-md` pasted from a project), the spec'd flow would overwrite it with global content.
- **Fix:** `planBlock` returns `blocked` with a reason, which produces a warn notice and no write. Blocks with no `src`, or legacy blocks, are still treated as ours and follow the staleness rules.
- **Commit:** 5525f5c

**2. [Rule 2 - Missing critical] Symlinked CLAUDE.md preserved**
- **Found during:** Task 1
- **Issue:** Renaming a temp file over a symlinked `~/.claude/CLAUDE.md` (common with dotfile repos) would replace the link with a plain file.
- **Fix:** `writeFileAtomic` resolves `realpathSync` first and preserves the file mode.
- **Commit:** 5525f5c

**3. [Rule 2] Fence-aware heading scan and pending-notice supersede** (see decisions). No test in the TRD
list covers them; they do not change any listed behaviour.

**Note on TDD for Task 2:** tests 16 (skip flag) and 18 (fast path) are negative guards. They passed at
RED because there was no wiring yet. The RED gate held through tests 15 and 17 (exit 1). All four pass at
GREEN.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (T1) | `node --test plugins/devflow/devflow/bin/lib/global-upgrade.test.cjs` | 1 (0/14 pass, MODULE_NOT_FOUND) | FAIL (correct) |
| GREEN (T1) | `node --test plugins/devflow/devflow/bin/lib/global-upgrade.test.cjs` | 0 (14/14) | PASS (correct) |
| Baseline (T2) | `node --test plugins/devflow/hooks/sync-runtime.test.js` | 0 (15/15) | PASS |
| RED (T2) | `node --test --test-name-pattern "TRD 36-06" plugins/devflow/hooks/sync-runtime.test.js` | 1 (15, 17 fail; 16, 18 pass as guards) | FAIL (correct) |
| GREEN (T2) | `node --test plugins/devflow/hooks/sync-runtime.test.js plugins/devflow/devflow/bin/lib/global-upgrade.test.cjs` | 0 (33/33: sync-runtime 19 = 15 + 4, global-upgrade 14) | PASS (correct) |

No REFACTOR commits were needed.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: global-upgrade.cjs + template (tests 1-14) | `node --test plugins/devflow/devflow/bin/lib/global-upgrade.test.cjs` | 0 | PASS |
| 2: sync-runtime wiring (tests 15-18) | `node --test plugins/devflow/hooks/sync-runtime.test.js plugins/devflow/devflow/bin/lib/global-upgrade.test.cjs` | 0 | PASS |
| No real home in lib | `rg -n "os.homedir\(\)\|homedir" plugins/devflow/devflow/bin/lib/global-upgrade.cjs` | 1 (no matches) | PASS |
| Template skill names | `ls plugins/devflow/skills` contains build, plan-objective, execute-objective, verify-work, debug, quick, micro, new-project, status, milestone, todo, gh-sync, discuss-objective, help | — | PASS |

## Validation Gate Results (regression gate, baseline-relative)

Command: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`
(output saved to the session scratchpad at `gate-36-06.txt`, not the repo). Exit 1.

The observed totals are for information only. There were **3738 tests: 3705 pass, 1 fail, 32 skipped**, with 0 cancelled.

| Failing test | File | Classification |
|---|---|---|
| MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path | plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795 | **pre-existing** (name is in `baseline-failures.tsv`) |

This TRD introduced no new failures, so there were no candidate regressions to re-run. `baseline-failures.tsv` was not edited.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7. The legacy move, notice-only first adoption, confirm adoption and version-bump rewrite are covered by tests 2–10. The backup and blocked path are covered by 6, 8 and 11. The required `userHome` and built-ins-only rule are covered by 1 and 14. sync-runtime isolation, the skip flag and the fast path are covered by 15–18.
- Gate failures: None new (1 pre-existing).

## Open Items

- 36-03 still has to expose `df-tools upgrade --global [--confirm]`. The adopt notice already names that command.
- 36-05 (route-results) is what surfaces the global notices file.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/global-upgrade.cjs
- FOUND: plugins/devflow/devflow/bin/lib/global-upgrade.test.cjs
- FOUND: plugins/devflow/devflow/templates/global-claude-md.md
- FOUND: commits 3272f3f, 5525f5c, 493e390, 17990df
