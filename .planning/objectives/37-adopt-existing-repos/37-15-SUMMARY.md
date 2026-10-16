---
objective: 37-adopt-existing-repos
trd: "15"
subsystem: docs
tags: [adopt, backup-prune, docs, changelog, roadmap-completion-integrity]
dependency-graph:
  requires: ["37-11", "37-12", "37-13", "37-14"]
  provides: ["objective-37-user-facing-docs", "objective-37-completion-integrity-rehearsal"]
  affects: ["docs/USER-GUIDE.md", "CHANGELOG.md", "CLAUDE.md", "scripts/gen-docs-data.cjs"]
tech-stack:
  added: []
  patterns: ["scratch-copy dry-run rehearsal of a destructive df-tools command before running it for real"]
key-files:
  created: []
  modified:
    - docs/USER-GUIDE.md
    - CHANGELOG.md
    - CLAUDE.md
    - scripts/gen-docs-data.cjs
decisions:
  - "Local-checkout doc section generalized to `<checkout>`/`<your-fixture>` placeholders rather than the literal 37-16 `<D>/orders-service` paths, since this section lives in USER-GUIDE.md for any future local-checkout trial, not just the 37-16 run."
  - "No CHANGELOG `### Fixed` entry added for objective 37 — 37-11 through 37-14 SUMMARYs report zero Rule-1/2/3 auto-fixed defects, so there is nothing to list."
metrics:
  duration: "~45 min"
  completed: 2026-09-28
tokens_input: 7296544
tokens_output: 34595
tokens_cache_read: 7196116
tokens_cache_write: 100280
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 37 TRD 15: Document what shipped; prove completion leaves ROADMAP/STATE intact Summary

Wrote the objective-37 user-facing docs (adopt, backup pruning, local-checkout trial) and repo
inventory, then rehearsed `objective complete 37` on a scratch copy of `.planning/` to prove the
cbf238d ROADMAP-corruption fix holds for this objective's own completion, before running the full
regression gate as the objective's final automated gate.

## What Was Built

### Task 1 — Docs, changelog, inventory (commit `c224073`)

- **docs/USER-GUIDE.md**:
  - Brownfield & Utilities table: new `/devflow:adopt [path]` row.
  - New `### Adopting an Existing Repo (/devflow:adopt)` section: what it does, the routing rules
    (devflow→upgrade, empty→new-project, existing codebase→adopt pipeline), the refusal rules
    (dirty/mid-rebase-merge/detached-HEAD/non-git), the `devflow/adopt` branch with one commit and
    no push, `ADOPT-REPORT.md`, resume behavior, `df-tools adopt preflight|begin|scaffold|report`
    and the global `--cwd <dir>` flag.
  - `Backup pruning` paragraph appended to the Upgrade section: once-per-24h SessionStart
    throttling, 14 days / newest 5 per repo defaults, `backups.retain_days` / `backups.keep_min` in
    `~/.claude/devflow/global-config.json`, `df-tools upgrade --prune [--dry-run]` /
    `upgrade --register`, `DEVFLOW_SKIP_PRUNE=1`, and an explicit note that a cron line is
    user-owned/opt-in — DevFlow installs no scheduler.
  - Usage Examples → Existing Codebase now leads with `/devflow:adopt`, keeping map-codebase +
    new-project as the manual alternative.
  - Hooks table `upgrade-project.js` row: mentions the throttled prune and both escape vars.
  - New `## Trying a Local Checkout of DevFlow` section: the 37-16 checkpoint's numbered
    install/verify/revert procedure, generalized with `<checkout>`/`<your-fixture>` placeholders
    (0: note enabled plugins + optional dry-run prune preview; 1: remove+add marketplace, install,
    `rm ~/.claude/devflow/.plugin-version`; 2: fresh session in a scratch fixture; 3: exercise the
    feature; 4: revert; 5: optional cleanup), keeping the "both builds report the same version"
    gotcha verbatim.
  - Brownfield Workflow diagram: one added line pointing at `/devflow:adopt` as the unattended
    alternative.
- **CHANGELOG.md** `## [Unreleased]`: `### Added` entries for `/devflow:adopt` (routing, refusal
  rules, `devflow/adopt` branch, ADOPT-REPORT.md, `df-tools adopt preflight|begin|scaffold|report`,
  global `--cwd`, `repo-state.cjs`, `map-codebase --non-interactive`) and backup pruning
  (throttled SessionStart run, retention policy, `--prune`/`--register`, `DEVFLOW_SKIP_PRUNE=1`);
  `### Changed` entries for the repo-state delegation and the adopt-routing wiring
  (init-offer, route-intent phrases, global routing template v2, new-project offering adopt). No
  `### Fixed` entry — 37-11..14 SUMMARYs report no auto-fixed defects. First heading is still
  `## [Unreleased]`.
- **CLAUDE.md**: plugin-layout tree skill count `32` → `33` (`ls plugins/devflow/skills | wc -l`
  confirmed 33, `adopt/` among them); df-tools list gained an **Adopt** bullet
  (`adopt preflight|begin|scaffold|report [--cwd dir]`, `lib/adopt.cjs`/`lib/adopt-cli.cjs`/
  `lib/repo-state.cjs`) and a sentence on the global `--cwd <dir>` flag; the **Upgrade** bullet now
  names `--prune [--dry-run]` and `--register` plus `lib/backup-prune.cjs`; the
  `upgrade-project.js` hooks-list entry mentions the throttled prune and
  `DEVFLOW_SKIP_PRUNE=1` alongside the existing `DEVFLOW_SKIP_UPGRADE=1`.
- **scripts/gen-docs-data.cjs**: `HOOK_DOCS['upgrade-project.js']` third element (escape column)
  changed to `'DEVFLOW_SKIP_UPGRADE=1, DEVFLOW_SKIP_PRUNE=1'`, description gained the pruning
  sentence. `node scripts/gen-docs-data.cjs` ran clean (`skills=33 agents=13 hooks=16 workflows=41
  references=37 templates=30 dfToolsCommands=66`, exit 0); it wrote into the tracked
  `site/data/devflow.json`, which was restored with `git restore` immediately after (confirmed
  clean via `git status --porcelain site/`).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Docs/changelog/inventory | `rg -n "devflow:adopt" docs/USER-GUIDE.md CHANGELOG.md CLAUDE.md` | 0 | PASS (hits in all three) |
| 1: done — DEVFLOW_SKIP_PRUNE | `rg -n "DEVFLOW_SKIP_PRUNE" CLAUDE.md docs/USER-GUIDE.md scripts/gen-docs-data.cjs` | 0 | PASS (hits in all three) |
| 1: done — no release-artifact diff | `git diff HEAD -- package.json plugins/devflow/.claude-plugin/plugin.json .claude-plugin/marketplace.json` | 0 | PASS (empty) |
| 1: done — CHANGELOG heading | `rg -n "^## \[" CHANGELOG.md \| head -1` | 0 | PASS (`## [Unreleased]`) |
| 2: dry-run section checker | `node <scratch>/check-sections.cjs .planning/ROADMAP.md <scratch>/.planning/ROADMAP.md 37` | 0 | PASS |
| 2: real files untouched | `git status --porcelain .planning/ROADMAP.md .planning/STATE.md` | 0 | PASS (empty) |
| 2: final regression gate | `node --test ...` (full suite) | 1 (process exit; see classification below) | PASS by baseline-relative rule — the only failure is pre-existing |

## Task 2 — Dry-run completion integrity rehearsal

Ran entirely on a scratch copy under
`/private/tmp/claude-501/-Users-justin-dev-devflow-claude/93fad3ef-03e9-445d-8200-6b34fdb012b2/scratchpad/rehearsal-37-15/`,
built with `cp -R .planning <scratch>/.planning`. The real repo's `.planning/` was never written —
confirmed both before starting (only read operations preceded the copy) and after
(`git status --porcelain .planning/ROADMAP.md .planning/STATE.md` empty).

Commands run (checkout CLI, `--cwd` pointed at the scratch copy):

```
node plugins/devflow/devflow/bin/df-tools.cjs --cwd <scratch> validate health --raw   # health-before.json
node plugins/devflow/devflow/bin/df-tools.cjs --cwd <scratch> objective complete 37 --raw   # complete-output.json
node plugins/devflow/devflow/bin/df-tools.cjs --cwd <scratch> validate health --raw   # health-after.json
```

`objective complete 37` did **not** refuse for missing 37-15/37-16 SUMMARYs (no stub SUMMARYs were
needed) and returned:

```json
{
  "completed_objective": "37",
  "objective_name": "adopt-existing-repos",
  "jobs_executed": "14/16",
  "next_objective": "38",
  "next_objective_name": "doc-auto-correction",
  "is_last_objective": false,
  "date": "2026-09-28",
  "roadmap_updated": true,
  "state_updated": true
}
```

`health-before.json` and `health-after.json` are byte-identical (`diff` exit 0) — no new
`validate health` error or warning was introduced by the completion.

### ROADMAP.md diff (real vs. scratch, verbatim)

```diff
--- .planning/ROADMAP.md (real)
+++ <scratch>/.planning/ROADMAP.md (after `objective complete 37`)
@@ -89,7 +89,7 @@
 | 34. UI Oracle Loop W1b — Surface Spec | v1.3 | 11/11 | Complete | 2026-09-22 |
 | 35. Stack profile loader | v1.3 | 11/11 | Complete | 2026-09-27 |
 | 36. Upgrade in place | v1.3 | 10/10 | Complete | 2026-09-27 |
-| 37. /devflow:adopt + backup pruning | v1.3 | 0/16 | Planned | — |
+| 37. /devflow:adopt + backup pruning | v1.3 | 0/16 | Complete | 2026-09-28 |
 | 38. Doc auto-correction | v1.3 | 0/— | Registered | — |

 ### Objective 27: Gate correctness ✅
@@ -272,7 +272,7 @@
 **Goal:** A user in any repo types `/devflow:adopt [path]` and DevFlow turns it into a DevFlow project unattended: map the code, infer PROJECT.md/STACK.md, scaffold config/STATE/ROADMAP (no invented objectives), add the CLAUDE.md block, stamp the version, and make one signed commit on a `devflow/adopt` branch (no push) with an ADOPT-REPORT.md of low-confidence items. Backups under `~/.claude/devflow/backups/` are pruned daily (14 days / keep 5 per repo, SessionStart-throttled; Claude Code has no persistent local scheduler).
 **Depends on:** Objective 36 (stamp, upgrade runner, managed blocks, SessionStart hook); the ROADMAP-corruption fix (`/devflow:debug`, done first).
 **Decisions (user, 2026-09-28):** re-scoped away from batch-adopting the user's 11 repos (out of scope, never touched); fully unattended; E2E proof = simulated run on scratch fixtures + a local-dev-install human check.
-**Jobs:** 0/16 complete — 16 TRDs in 13 waves (planned 2026-09-28; objective-local requirement IDs ADP-01..ADP-07; simulated runs 37-11→37-14 chained in depends_on so each runs alone and owns its own gate; 37-16 is a human-verify checkpoint, not autonomous)
+**Jobs:** 14/16 jobs complete — 0/16 complete — 16 TRDs in 13 waves (planned 2026-09-28; objective-local requirement IDs ADP-01..ADP-07; simulated runs 37-11→37-14 chained in depends_on so each runs alone and owns its own gate; 37-16 is a human-verify checkpoint, not autonomous)

 Jobs:
 - [x] 37-01-TRD.md — Wave 1: `__fixtures__/adopt-fixtures.cjs` scratch-repo factory (Go, Flutter, Node, empty, DevFlow, dirty) + `lib/repo-state.cjs` detector (devflow|greenfield|brownfield|scratch)
```

### STATE.md diff (real vs. scratch)

Empty — `objective complete 37` made **no changes at all** to STATE.md in this run (`diff` exit 0,
zero output). This trivially satisfies "STATE.md changes only inside `## Current Position`" since
there were zero changes to check.

### `check-sections.cjs` output

Wrote `<scratch>/check-sections.cjs` (Write tool; scratch-only, not committed) per the TRD's spec:
splits both ROADMAPs on lines starting with `### Objective ` / `## `, asserts every section except
`### Objective 37:` and `## Progress` is byte-identical, and within `## Progress` asserts only the
`| 37. ` row differs.

```
$ node <scratch>/check-sections.cjs .planning/ROADMAP.md <scratch>/.planning/ROADMAP.md 37
OK: only "### Objective 37:" and the | 37. row of ## Progress differ
$ echo $?
0
```

**Exit 0 — no other objective's section and no other Progress row changed.**

### Finding: does the reported column-drop defect appear here?

**No — not in `objective complete 37`.** The orchestrator's dispatch flagged that
`roadmap update-job-progress 37` (a *different* df-tools command, run directly against the real
repo earlier in this session, then reverted) had dropped the Milestone cell from the Progress row
(4 cells instead of 5, `v1.3` missing) and lost the `**Jobs:**` line's planning note. Neither defect
appears in this rehearsal: the Progress row above keeps all 5 cells (`37. …`, `v1.3`, `0/16`,
`Complete`, `2026-09-28`) and the `**Jobs:**` line's planning note (`16 TRDs in 13 waves...`) is
fully preserved. This TRD only exercises `objective complete 37` (via `lib/objective.cjs` +
`lib/roadmap-progress.cjs`, "fixed at cbf238d" per the TRD's wiring note) — it does not call
`roadmap update-job-progress` at all, so this rehearsal cannot and does not confirm that the
`update-job-progress` defect is fixed; it only confirms `objective complete` itself is clean.

**A second, smaller defect was found in `objective complete 37` itself**, worth recording even
though it is not the column-drop bug and is not a must-have blocker for this TRD (the diff still
passed `check-sections.cjs`, since the change is entirely inside the `## Progress` `| 37. ` row and
the `### Objective 37:` section, both of which are allowed to change): the `**Jobs:**` line goes
from
`**Jobs:** 0/16 complete — 16 TRDs in 13 waves...` to
`**Jobs:** 14/16 jobs complete — 0/16 complete — 16 TRDs in 13 waves...` —
it **prepends** `"14/16 jobs complete — "` instead of **replacing** `"0/16 complete"`, so the stale
`0/16 complete` fragment survives alongside the new, correct `14/16 jobs complete` fragment. This is
a cosmetic double-count bug in whatever string-replace logic `objective complete` uses to update the
`**Jobs:**` line (not the Progress *table* row, which updates the job-count cell correctly to
`0/16` — unrelated, that cell is not meant to track completed-job count, only wave/TRD totals per
the existing table convention seen for objectives 34-36). Per the TRD's binding rules, this is not
fixed here (out of scope unless the TRD explicitly asks; it does not) — flagged for
`/devflow:debug` if the maintainer wants it cleaned up. It does **not** block this TRD's must-haves:
the required invariant (only objective 37's section and its Progress row change; every other
section/row byte-identical) held exactly.

## Regression Gate (baseline-relative, final for objective 37)

Ran from the repo root:
```
node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'
```
Output written to session scratchpad only (`<scratch>/gate-output.txt`), never the repo.

**Observed totals:** tests 3975, suites 568, pass 3942, fail 1, cancelled 0, skipped 32, todo 0,
duration 49.1s.

**Failing tests (1):**

| Test | File:Line | In baseline-failures.tsv? | Classification |
|---|---|---|---|
| `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path` | `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` | Yes (line 16 of the TSV, identical file:line and name) | **Pre-existing** — not a regression |

No candidate regressions (i.e. no failing test outside the TSV) were found, so no re-run-per-file
step (gate rule 4) was needed. `baseline-failures.tsv` was not edited.

**Gate verdict: HOLDS.** The only failure matches the baseline exactly; this objective's own added
tests (37-01 through 37-14) all pass.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (docs truths; CHANGELOG truth; CLAUDE.md truth; gen-docs-data truth;
  dry-run completion integrity truth; release-artifacts-unchanged truth; regression-gate truth —
  all confirmed above)
- Gate failures: None (the one observed test failure is pre-existing per the TSV)

## Deviations from Plan

None requiring Rule 1-4 action. One informational finding recorded above (the `**Jobs:**` line
prepend-not-replace cosmetic bug in `objective complete`) — not fixed per binding-rules scope, not
a must-have blocker, flagged for a future `/devflow:debug`.

## Self-Check: PASSED

- `docs/USER-GUIDE.md`, `CHANGELOG.md`, `CLAUDE.md`, `scripts/gen-docs-data.cjs` — FOUND, modified,
  committed at `c224073`.
- Commit `c224073` — FOUND (`git log --oneline` confirms).
- Scratch rehearsal artifacts (`health-before.json`, `complete-output.json`, `health-after.json`,
  `roadmap.diff`, `state.diff`, `check-sections.cjs`, `gate-output.txt`) — FOUND under
  `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/93fad3ef-03e9-445d-8200-6b34fdb012b2/scratchpad/rehearsal-37-15/`.
- Real `.planning/ROADMAP.md` and `.planning/STATE.md` — untouched (`git status --porcelain` empty
  for both), confirmed after the rehearsal ran.
- `site/data/devflow.json` — restored to its committed state after `gen-docs-data.cjs` ran
  (`git status --porcelain site/` empty).

## Commits

| Hash | Message |
|---|---|
| `c224073` | `docs(37-15): adopt, backup pruning and local-checkout docs; changelog and inventory` |
