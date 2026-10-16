# Objective 38: Documentation auto-correction - Research

**Researched:** 2026-09-28
**Domain:** Internal tooling — self-referential documentation correctness for a Claude Code plugin (DevFlow)
**Confidence:** MEDIUM (HIGH on the stale-reference inventory and existing-infra-reuse findings; LOWER on the two genuinely undesigned pieces — STACK.md drift detection and telemetry wiring)

## Summary

This is not an external-library-adoption objective; it is "audit and fix our own repo, then keep it from rotting again." All research here is direct repo evidence (file:line), not Context7/official-docs lookups — that source hierarchy doesn't apply to an internal-tooling objective. Every claim below was verified against the live tree on 2026-09-28, not assumed from the objective's own scope sketch, which explicitly asked to be re-cut.

Two things reframe the objective's shape. First, DevFlow already has a canonical rename map — `DEPRECATION_MAP` in `plugins/devflow/devflow/bin/lib/skill-route.cjs` — used today by `df-tools deprecation log`. It is *not documented as canonical* though: it is currently duplicated three more times (an identical table in `devflow/workflows/help.md`, and prose lists in `README.md` and `docs/USER-GUIDE.md`) with no test cross-checking them, and the duplicates have already drifted — `README.md` line 548 claims these commands "were removed in v2.2" while lines 179/202/497/503/505/581 of the same file present them as live. Objective 38 should consolidate onto `DEPRECATION_MAP` as the single source of truth, not hand-author a fifth map at `references/command-renames.json`.

Second, staleness isn't only sitting in prose — DevFlow's own code is still *manufacturing* new stale text today. `lib/misc.cjs:574` embeds `/df:discuss-objective` into every freshly-created `CONTEXT.md`, and `lib/workstreams.cjs:219` embeds `/df:workstreams merge` into every freshly-created workstream-worktree `STATE.md`. Neither is legacy content to clean up once — both are live generators that need fixing at the source, or the "one-time cleanup" will be undone by the tool itself on its next run. The checker built for this objective must scan `bin/lib/*.cjs` template-literal strings, not just static Markdown.

**Primary recommendation:** Build one `lib/doc-refs.cjs` checker keyed off `DEPRECATION_MAP` (extended with the `/df:`→`/devflow:` prefix rule and the two dead-with-no-replacement commands), wire it as both a CI test (mirroring the existing precedent at `global-upgrade.test.cjs:291`) and a `validate health` Check 14 (W050+), then plug the mechanical-fix path into the upgrade runner as migration `0007` reusing `managed-block.cjs` (already built for this, per its own code comment) for CLAUDE.md and a STATE.md text-substitution pass modeled on migration `0002`/`0003`. Treat STACK.md drift detection and telemetry-advisory wiring as open design work, not wire-up — flag both explicitly for the planner rather than sizing them as done-in-passing.

## Standard Stack

This objective has no new external dependency. The "stack" is entirely existing internal DevFlow modules to build on rather than duplicate.

### Core (existing internal modules to reuse)
| Module | Purpose | Why it's the standard here |
|---|---|---|
| `plugins/devflow/devflow/bin/lib/skill-route.cjs` → `DEPRECATION_MAP` | old-name → new-command map (13 entries) | Already the canonical rename source; used by `deprecation log`; triplicated elsewhere without a source-of-truth designation |
| `plugins/devflow/devflow/bin/lib/managed-block.cjs` | versioned `<!-- DEVFLOW:START v=... -->` block rewrite | Its own header comment says "Deliberately generic: no CLAUDE.md knowledge lives here (objective 38 reuses it)" — explicit pre-built precedent |
| `plugins/devflow/devflow/bin/lib/upgrade.cjs` + `lib/migrations/NNNN-*.cjs` | migration registry/runner, `detect()`/`apply()`, backups, stamp | Standard mechanism for mechanical fixes at session start; next free id is `0007` |
| `plugins/devflow/devflow/bin/lib/notices.cjs` | one-shot notice queue, surfaced via SessionStart + `route-results.js` | Existing surface for "we changed something, here's what" |
| `plugins/devflow/devflow/bin/lib/validate.cjs` | `addIssue(level, code, message, fix, repairable)` pattern, "Check N" sections | Existing home for a new "Check 14: Documentation staleness"; next free issue-code decade is **050s** (000s core, 020s mirror/version, 030s stack-profile, 040s upgrade-state) |
| `plugins/devflow/devflow/bin/lib/telemetry.cjs` | `collect() -> {..., advisories: []}` | Right shape for advisories, but **completely unwired** (see Common Pitfalls) |

### Supporting
| Module | Purpose | When to use |
|---|---|---|
| `plugins/devflow/devflow/bin/lib/project-hygiene.cjs` → `_walkStatsReal()` | stack-based recursive directory walk with an `_runFs` injection seam for testability | Closest existing precedent for a file-tree walker; repo-wide grep for `walkDir\|readdirSync.*recursive\|glob(` across `lib/*.cjs` found **no other generic walker** — mirror this pattern rather than pull in a new dependency (e.g. `fast-glob`) for what's a same-repo, bounded directory set |
| `plugins/devflow/devflow/templates/config.json` → `awareness.peer_stale_days: 30` | existing precedent for a config-driven staleness threshold | Model `stack.review_stale_days` (default 90) the same way, rather than hardcoding 90 in code |

### Alternatives Considered
| Instead of | Could use | Tradeoff |
|---|---|---|
| Hand-rolled walker mirroring `project-hygiene.cjs` | `fast-glob`/`globby` npm dep | Repo has zero glob-library dependencies today; the file set to scan is small and known (specific plugin subdirs + repo-root docs) — a new dependency isn't justified for this |
| New `references/command-renames.json` as source of truth | Extend `DEPRECATION_MAP` directly, export/derive JSON from it if a data-file format is still wanted for the checker | Avoids a 5th copy of the same 13(+2) mappings; a JSON file can still be *generated from* the map if the checker prefers data over requiring a `.cjs` module |

**Installation:** none — no new packages.

## Architecture Patterns

### Recommended structure
```
plugins/devflow/devflow/bin/lib/
├── doc-refs.cjs                  # NEW: scans a file set for stale command refs, using DEPRECATION_MAP + prefix rule
├── doc-refs.test.cjs             # NEW: unit tests + a CI-facing "no stale refs in plugin" assertion
├── migrations/
│   └── 0007-doc-refs-fix.cjs     # NEW: safety:'auto', rewrites CLAUDE.md managed block (via managed-block.cjs)
│                                  #      + STATE.md text substitutions in a project, mirrors 0002/0005 pattern
├── skill-route.cjs               # EXISTING: DEPRECATION_MAP becomes the single source; doc-refs.cjs imports it
└── validate.cjs                  # + Check 14 "Documentation staleness", codes W050+
```

### Pattern 1: Rename map as single source of truth
**What:** `doc-refs.cjs` imports `DEPRECATION_MAP` from `skill-route.cjs` rather than re-declaring mappings, and extends it with two things that map doesn't cover: (a) a `/df:` → `/devflow:` *prefix* rule (not a per-command entry — the prefix rename applies to all 31 live skill names uniformly), and (b) commands with **no replacement** (`update`, `reapply-patches` — neither corresponds to any existing skill/workflow) which must be reported as "remove, do not rewrite" rather than silently mapped to nothing.
**When to use:** Both the CI checker and the `validate health` check should call the same resolver function so the two never disagree.
**Example:**
```javascript
// Source: plugins/devflow/devflow/bin/lib/skill-route.cjs:1-140 (existing, read 2026-09-28)
const DEPRECATION_MAP = {
  'add-objective': 'objective add',
  'insert-objective': 'objective add',
  'remove-objective': 'objective remove',
  'new-milestone': 'milestone new',
  'audit-milestone': 'milestone audit',
  'complete-milestone': 'milestone complete',
  'plan-milestone-gaps': 'milestone gaps',
  'add-todo': 'todo add',
  'check-todos': 'todo list',
  'pause-work': 'status pause',
  'resume-work': 'status resume',
  'progress': 'status',
  'health': 'status check',
};
// NOT in DEPRECATION_MAP today, needed for objective 38:
//   prefix rule:      /^\/df:/  ->  '/devflow:'
//   dead, no mapping: 'update', 'reapply-patches'
```

### Pattern 2: Slash-command-syntax matching only (avoid bare-word false positives)
**What:** Match `/devflow:<name>` / `/df:<name>` tokens specifically, never bare English words.
**When to use:** Always — confirmed false-positive risk is real in this repo.
**Example:**
```
// Source: plugins/devflow/devflow/templates/state.md (existing, read 2026-09-28)
"progress: Present status to user"      // prose use of the word — NOT a command reference
"Update progress bar"                    // prose — NOT a command reference
// plugins/devflow/devflow/templates/continue-here.md
status: in_progress                      // YAML value — NOT a command reference
```
A regex anchored on the slash (`/(?:devflow|df):[a-z-]+`) avoids all three.

### Pattern 3: Migration for mechanical doc fixes
**What:** `0007-doc-refs-fix.cjs` follows the exact shape of `0005-claude-md-block.cjs` (managed-block upsert, compares template versions, `safety: 'auto'`) for the CLAUDE.md portion, and the STATE.md-content-touching shape of `0002-job-to-trd.cjs` (rename/rewrite + append a dated `## Session Log` line) for the STATE.md portion.
**Example:**
```javascript
// Source: plugins/devflow/devflow/bin/lib/migrations/0005-claude-md-block.cjs (existing, read 2026-09-28)
// module.exports = { id: '0005', title: '...', since: '...', safety: 'auto',
//   detect(ctx) { /* compare current managed-block version to template */ },
//   apply(ctx) { managedBlock.upsert(ctx.claudeMdPath, newBlockContent, { version, src }); } }
```

### Anti-Patterns to Avoid
- **A 5th rename map:** three copies already exist (`DEPRECATION_MAP`, `help.md`'s "Removed Skill Names" table, README.md's prose list) plus a fourth that's actively wrong (`docs/USER-GUIDE.md`). Adding `references/command-renames.json` as an independently-authored fifth list guarantees the same drift recurs. Generate/derive, don't re-author.
- **Rewriting `.planning/` indiscriminately:** the objective's own scope sketch says "auto-fix for managed blocks and `.planning/` docs in projects" without qualification — that's too broad. See Common Pitfalls for the exemption list this needs.
- **Bare-word matching:** would false-positive on `templates/state.md` and `templates/continue-here.md` (see Pattern 2).

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---|---|---|---|
| Rewriting CLAUDE.md's DevFlow-owned section safely | A new "find and replace inside markers" routine | `managed-block.cjs` | Already built, already used by migration `0005`, explicitly documented as intended for this objective |
| Applying a fix at session start, with backup and idempotency | A standalone script run by a hook | `lib/upgrade.cjs` migration (`0007`) | Backup-before-write, stamp-on-success, `detect()`/`apply()` idempotency, and the `check`/`apply` CLI split all already exist |
| A new "old name → new name" table | Hand-authored JSON | `DEPRECATION_MAP` (`skill-route.cjs`) | Already canonical for `deprecation log`; three duplicates already exist and have already drifted — a fourth/fifth just adds more surfaces to keep in sync |
| Recursive directory walk of plugin subdirs | A new walker or a glob-library dependency | `project-hygiene.cjs`'s `_walkStatsReal()` pattern | Only existing precedent in `lib/*.cjs`; no glob dependency exists in the repo today |
| Reporting a repair action to the user later | A new one-off log file | `notices.cjs` | Already wired through SessionStart + `route-results.js` |

**Key insight:** almost everything objective 38 needs already exists in partially-wired form (`managed-block.cjs`, `upgrade.cjs`, `DEPRECATION_MAP`, `notices.cjs`) or fully-built-but-unwired form (`telemetry.cjs`). The work is mostly *connecting* existing pieces and *consolidating* existing duplicates, not building new infrastructure — except for the checker itself and the two genuinely new staleness computations (STACK.md drift, codebase-map commit-age).

## Common Pitfalls

### Pitfall 1: Treating "11 `/df:` refs in validate.cjs" as the checkable baseline
**What goes wrong:** The objective's scope sketch states 11; direct count is **10**.
**Why it happens:** Likely an off-by-one from the audit that seeded this objective; not independently re-verified.
**How to avoid:** Use the exact line list below as the baseline for the fix/test, not the stated count.
**Evidence:** `plugins/devflow/devflow/bin/lib/validate.cjs` lines 208, 223, 236, 241, 264, 273, 285, 367, 380, 614 — all inside `addIssue(...)` fix-text strings (e.g. `'Run /df:health --repair to auto-rename to TRD.md'`) or one `stateContent +=` literal at line 614 that gets *written into a user's STATE.md* when `regenerateState` repair runs.

### Pitfall 2: "One-time cleanup" items b and d in the scope sketch are the same set
**What goes wrong:** The scope sketch lists "11 `/df:` references in validate.cjs fix text" and "`/devflow:health` references" as two separate cleanup bullets. In practice, essentially all 10 of the `/df:` occurrences in `validate.cjs` *are* `/df:health --repair` or `/df:new-project`/`/df:new-milestone` strings — fixing one list fixes the other.
**How to avoid:** Plan these as one task, not two, to avoid double-counting effort or conflicting edits.

### Pitfall 3: The tool is still generating new stale text today
**What goes wrong:** Treating this as a one-time archaeology pass over static files misses that two *code paths* actively write `/df:` into brand-new files right now.
**Evidence:**
- `plugins/devflow/devflow/bin/lib/misc.cjs:574` — the `df-tools scaffold ... context` template literal embeds `_Decisions will be captured during /df:discuss-objective ${objective}_` into every newly-created `CONTEXT.md`.
- `plugins/devflow/devflow/bin/lib/workstreams.cjs:219` — the filtered STATE.md generator for workstream worktrees embeds `` `/df:workstreams merge` `` into every newly-created workstream `STATE.md`.
**How to avoid:** The checker must scan `bin/lib/*.cjs` template-literal source, not only `.md` files, or these two will keep re-failing the "cleaned up" state on the very next run.

### Pitfall 4: Frozen fixtures and intentional old-prefix tests look like violations but aren't
**What goes wrong:** A naive scanner flags these as stale and either fails CI wrongly or (worse) an auto-fixer rewrites them and breaks their actual purpose.
**Evidence (confirmed exemptions, do not touch):**
- `plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs` lines 184, 211 — `realCLAUDEMd()`, explicitly documented as "a faithful copy of the real file, used as a fixture for the B1 round-trip test" (TDD Playbook habit 4: no LLM-generated test data). Rewriting it breaks the round-trip test's premise.
- `plugins/devflow/hooks/route-intent.test.js` (~3 occurrences) — asserts that `/df:`-prefixed and `/devflow:`-prefixed prompts are *excluded* from intent matching, e.g. `assert.deepEqual(matchIntent('/df:plan-objective the next thing'), [])`. The old prefix is intentional test input, not a stale reference.
- `CHANGELOG.md` — 74 occurrences, all historical record, same principle as every other project's changelog.
- `.planning/**` in this repo (and in any adopting project) — historical planning artifacts (`*-SUMMARY.md`, `*-VERIFICATION.md`, completed `*-TRD.md`/`OBJECTIVE.md`) are point-in-time record, not living docs. The objective's own scope bullet ("auto-fix for managed blocks and `.planning/` docs in projects") needs narrowing — recommend the allowlist be **STATE.md + the CLAUDE.md managed block only** for v1, explicitly excluding `*-SUMMARY.md`, `*-CONTEXT.md`, `*-VERIFICATION.md`, `*-TRD.md`, `OBJECTIVE.md`, and anything under `.planning/milestones/` or `.planning/todos/`.
**How to avoid:** Build the exemption list into the checker config from day one (path-glob allowlist for CI-checked dirs, explicit denylist for auto-fix target dirs), and add a positive-control test asserting the checker does NOT flag these paths.

### Pitfall 5: `telemetry.cjs` has the right shape but no wiring — "advisories in telemetry" is a bigger task than it sounds
**What goes wrong:** The scope sketch's run-points bullet says "advisories in `status` and `telemetry`" as if both are existing surfaces to append to. `status` (`workflows/progress.md`) is a real, exercised surface but currently has **zero** references to STACK.md/codebase/advisor/staleness (confirmed by grep) — so wiring in is new work, not an append. `telemetry.cjs` is worse: `collect()` returns the right `{..., advisories: []}` shape, but repo-wide search of `df-tools.cjs`'s command switch confirms **no `case 'telemetry'`** exists (nor `session-audit`, `context`, `override`, `transcript-export` — the whole objective-31 family is unwired despite being documented in this repo's own CLAUDE.md as usable `df-tools <command>` subcommands). Only `telemetry.cjs`'s own `.test.cjs` requires it.
**How to avoid:** The planner needs to explicitly decide: (a) wire `df-tools telemetry` into the CLI switch + call it from somewhere (status workflow? a new skill?) as part of objective 38, or (b) defer telemetry wiring and route doc-staleness advisories through `status`/`validate health` only for v1. This materially changes objective size and should not be assumed away.

### Pitfall 6: The STATE.md W002 regex is checking for a convention nobody uses anymore
**What goes wrong:** `validate.cjs:246` — `const phaseRefs = [...stateContent.matchAll(/[Pp]hase\s+(\d+(?:\.\d+)?)/g)].map(m => m[1]);` — matches "Phase N" (digit). This repo's own `.planning/STATE.md` uses the convention `**Objective complete:** N` throughout (verified: lines 16-25+); the string "Phase" appears exactly once in a letter-suffixed form ("Phase A handoff snapshot committed", line 24) which the digit-anchored regex does not and should not match anyway. The check is not merely stale-worded, it structurally cannot match current STATE.md content — it's dead code that will never fire a false positive but also never do anything.
**How to avoid:** Confirmed zero test coverage exists (`grep -c "W002\|phaseRefs" validate.test.cjs` → 0 hits) — any fix must ship its first-ever test alongside the regex change, not just edit the pattern. Recommend updating the regex to match the actual current field (`\*\*Objective complete:\*\*\s+(\d+)` or a more general `objective\s+(\d+)` depending on what drift the check is meant to catch) and adding coverage.

### Pitfall 7: `regenerateState`'s repair output itself writes stale text
**What goes wrong:** `validate.cjs:614` — the `regenerateState` repair action (fired by `W002`/`E004`/`W003`) writes `` `- ${date}: STATE.md regenerated by /df:health --repair\n` `` directly into the STATE.md it creates. Fixing only the *advisory* text elsewhere and missing this line means running `--repair` re-introduces `/df:` into a freshly regenerated file.
**How to avoid:** Include this line in the same fix pass as the other 9 `validate.cjs` occurrences (see Pitfall 1) — it's part of the same 10, already counted there, but easy to miss since it's a write, not just advice text.

## Code Examples

### Existing rename map (extend, don't duplicate)
```javascript
// Source: plugins/devflow/devflow/bin/lib/skill-route.cjs (read 2026-09-28)
const DEPRECATION_MAP = {
  'add-objective': 'objective add', 'insert-objective': 'objective add',
  'remove-objective': 'objective remove', 'new-milestone': 'milestone new',
  'audit-milestone': 'milestone audit', 'complete-milestone': 'milestone complete',
  'plan-milestone-gaps': 'milestone gaps', 'add-todo': 'todo add',
  'check-todos': 'todo list', 'pause-work': 'status pause',
  'resume-work': 'status resume', 'progress': 'status', 'health': 'status check',
};
```

### Existing "no stale refs" test precedent to extend
```javascript
// Source: plugins/devflow/devflow/bin/lib/global-upgrade.test.cjs:291 (existing, read 2026-09-28)
assert.ok(!tpl.body.includes('/df:'), 'template body still references /df: commands');
```

### `validate.cjs` "Check N" pattern to follow for Check 14
```javascript
// Source: plugins/devflow/devflow/bin/lib/validate.cjs (Check 12/13 shape, read 2026-09-28)
// Check 12: Stack profile        -> codes W030-032, I030, E030
// Check 13: Upgrade state        -> code  W040
// Check 14 (NEW): Documentation staleness -> codes W050+ (next free decade)
addIssue('warning', 'W050', 'STACK.md provenance.reviewed is N days old (threshold: 90)',
  'Run /devflow:status check --repair or re-review STACK.md manually', true);
```

### STACK.md provenance field already available to key off
```yaml
# Source: plugins/devflow/devflow/templates/stack.md (existing, read 2026-09-28)
provenance:
  reviewed: "YYYY-MM-DD"   # the upstream tooling changes monthly, so re-review on toolchain bumps
  sources: []
```

### Config precedent for a staleness threshold
```json
// Source: plugins/devflow/devflow/templates/config.json (existing, read 2026-09-28)
{ "awareness": { "peer_stale_days": 30 } }
```

## State of the Art

| Old approach | Current approach | When changed | Impact |
|---|---|---|---|
| `/gsd:` prefix | `/df:` prefix | pre-fork history (per CHANGELOG) | fully retired |
| `/df:` prefix | `/devflow:` prefix | plugin rebrand | `/df:` now stale everywhere it appears outside CHANGELOG/fixtures |
| 13 single-purpose skills (progress, resume-work, pause-work, add-todo, check-todos, add-objective, insert-objective, remove-objective, new-milestone, audit-milestone, complete-milestone, plan-milestone-gaps, health) | 4 consolidated skills with subcommands (`status`, `todo`, `objective`, `milestone`) | v2.2 (per `help.md`'s own "Removed Skill Names (removed in v2.2)" section) | old names route through `DEPRECATION_MAP` for `deprecation log`, but static docs still present them as live in `README.md` and `docs/USER-GUIDE.md` |
| "Phase N" position wording | "Objective N" / "**Objective complete:** N" wording | pre-dates this repo's current STATE.md convention (GSD-era leftover) | `validate.cjs`'s W002 regex still targets the old wording and cannot fire on current files |
| `/devflow:update`, `/devflow:reapply-patches` | no replacement — fully removed | unclear from repo alone | still referenced in `README.md`/`docs/USER-GUIDE.md` as if live; not in `DEPRECATION_MAP` since there's nothing to redirect to |

**Deprecated/outdated:**
- `references/model-profiles.md:104` — `` `/df:set-profile <profile>` `` should read `/devflow:set-profile`.
- `skills/initiatives/SKILL.md:54,64` — two prose mentions of `/df:plan-objective`.
- `workflows/plan-objective.md:357` — `` `/df:plan-objective ${OBJECTIVE}` `` in a resume-support message.
- `workflows/new-project.md:57` — "Use /devflow:progress." should read `/devflow:status`.
- `.github/ISSUE_TEMPLATE/bug_report.yml:48` — `1. Run /df:...` shown to external bug reporters.

## Open Questions

1. **Is wiring `telemetry.cjs` (and the objective-31 CLI family) into `df-tools.cjs`'s switch in scope for objective 38, or a prerequisite/follow-up?**
   - What we know: `telemetry.cjs` exists, is tested in isolation, and returns the right `{advisories: []}` shape. `session-audit.cjs`, `context-audit.cjs`, `override.cjs`, `transcript-export.cjs` are in the same unwired state.
   - What's unclear: whether objective 38's "advisories in telemetry" run point means "wire the whole family" or just "make sure the shape can carry a doc-staleness advisory whenever it does get wired."
   - Recommendation: scope objective 38 to route advisories through `status`/`validate health` (both are real, exercised surfaces) and treat `df-tools telemetry` CLI wiring as an explicit stretch task or a separate follow-up objective, so the plan isn't silently blocked on an unrelated wiring gap.

2. **What exactly counts as "STACK.md declared vs detected drift"?**
   - What we know: `stack-profile.cjs` writes `provenance.reviewed` at `stack init` (line ~808) and has detector functions used at init time; no comparator between "what STACK.md currently declares" and "what the detectors would say today" exists anywhere in the 1018-line file (confirmed via full function-name grep).
   - What's unclear: which fields should be compared (`languages`? `primary_lang`? package-manager/framework detection?) and what "drift" should trigger (advisory only, or a repair-eligible issue).
   - Recommendation: MVP to a single field (e.g. `primary_lang`/`languages` list) re-run through the existing detector and diffed against STACK.md frontmatter; expand later. This is genuinely new design, size it as such.

3. **Codebase-map staleness: git-derived (no template change) or a stamped commit field (template bump)?**
   - What we know: `codebase/structure.md` template only has `**Analysis Date:** [YYYY-MM-DD]`, no commit hash. `git log -1 --format=%H -- <path>` + `git rev-list --count <sha>..HEAD` can derive "N commits behind" with zero template changes and works retroactively on existing maps.
   - What's unclear: whether "N commits behind HEAD" should count commits touching the whole repo or only commits touching the mapped subtree (noisier repos would make whole-repo counting nearly always "stale").
   - Recommendation: use `git rev-list --count <sha>..HEAD -- <mapped-paths>` scoped to what the map actually covers, not the whole repo. Note this repo has no `.planning/codebase/` of its own yet (map-codebase was never run on self) — build/verify against a scratch fixture repo, not this one.

4. **Should `references/command-renames.json` exist at all, or should the checker import `DEPRECATION_MAP` directly?**
   - What we know: a JSON data file is easier for a CI test or an external tool to consume without requiring a `.cjs` module; `DEPRECATION_MAP` is already the tested, used source.
   - What's unclear: whether any consumer actually needs the JSON form, or whether that was just the objective author's assumed shape.
   - Recommendation: derive the JSON (if built at all) from `DEPRECATION_MAP` at build/test time with an equality assertion, never hand-maintain both.

## Sources

### Primary (HIGH confidence — direct repo file:line evidence, read 2026-09-28)
- `plugins/devflow/devflow/bin/lib/skill-route.cjs` (1-140) — `DEPRECATION_MAP`, `SKILL_ROUTES`
- `plugins/devflow/devflow/bin/lib/validate.cjs` (1-50, 208-286, 365-380, 440-625) — issue codes, Check 12/13 pattern, `regenerateState`
- `plugins/devflow/devflow/bin/lib/validate.test.cjs` — W008 fix-text coupling (line 784); zero W002 coverage confirmed
- `plugins/devflow/devflow/bin/lib/upgrade.cjs` (full, 516 lines) — migration contract, registry, backups, stamp
- `plugins/devflow/devflow/bin/lib/migrations/0002-job-to-trd.cjs`, `0005-claude-md-block.cjs` (full) — migration patterns to mirror
- `plugins/devflow/devflow/bin/lib/managed-block.cjs` (header + `read()`) — explicit "objective 38 reuses it" comment
- `plugins/devflow/devflow/bin/lib/notices.cjs` (full, 209 lines)
- `plugins/devflow/devflow/bin/lib/telemetry.cjs` (full, 79 lines) + exhaustive `df-tools.cjs` switch grep confirming zero wiring
- `plugins/devflow/devflow/bin/lib/misc.cjs:565-580`, `plugins/devflow/devflow/bin/lib/workstreams.cjs:205-225` — live stale-text generators
- `plugins/devflow/devflow/bin/lib/project-hygiene.cjs` — `_walkStatsReal()` walker precedent; repo-wide grep confirming no other generic walker
- `plugins/devflow/devflow/bin/lib/stack-profile.cjs` (draftProfile section + full function grep) — `provenance` write, no drift comparator
- `plugins/devflow/devflow/bin/lib/global-upgrade.test.cjs:291` — existing "no /df:" test precedent
- `plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs:160-230` — frozen fixture exemption
- `plugins/devflow/hooks/statusline.js:40-100`, `hooks/statusline.test.js:464` — dead `/df:update` display, no writer
- `plugins/devflow/hooks/route-intent.test.js` (~195-215) — intentional old-prefix exclusion tests
- `plugins/devflow/hooks/upgrade-project.js` (full, 396 lines) — `MIGRATE_CMD` already correct (`/devflow:status check --migrate`)
- `plugins/devflow/devflow/workflows/new-project.md:57`, `plan-objective.md:357`, `progress.md` (grepped, zero staleness/advisory hooks today)
- `plugins/devflow/devflow/workflows/help.md:420-460` — duplicated "Removed Skill Names" table
- `plugins/devflow/devflow/references/model-profiles.md:104`
- `plugins/devflow/devflow/templates/stack.md`, `templates/config.json`, `templates/codebase/structure.md`, `templates/global-claude-md.md:19` (positive control — already correct)
- `README.md`, `docs/USER-GUIDE.md`, `.github/ISSUE_TEMPLATE/bug_report.yml:48`, `assets/terminal.svg:61` — retired-name inventory (grepped exhaustively, counts below)
- `.planning/STATE.md:16-25` — current "Objective complete: N" convention, confirms W002 regex cannot match it
- `.planning/objectives/38-doc-auto-correction/OBJECTIVE.md` — objective scope sketch, verified against tree above
- `package.json`, `.github/workflows/test.yml`, `.github/known-test-failures.json` — test conventions, CI gate, allowlist ratchet rules
- Direct `npm test` run, 2026-09-28: **4023 tests, 577 suites, 3990 pass, 1 fail, 0 cancelled, 32 skipped, 0 todo**, duration 56.9s. The one failure (`MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN`, `handoff-e2e.test.cjs:795`) is not in `known-test-failures.json`; `gh run list --branch main --workflow "Unit suite" --limit 3` shows the last 3 CI runs on `main` all green — this is environment-specific noise on this machine, not a gate-visible regression. This **contradicts** the "~9-10 known pre-existing daemon/timing failures" framing passed down from the orchestrator; report the measured baseline (1 local failure, non-blocking) and re-run at plan/execute time since counts can vary by machine/timing.

### Secondary / Tertiary
None used — this objective's domain is entirely internal-repo state; no WebSearch or Context7 lookups were applicable or performed.

## Metadata

**Confidence breakdown:**
- Stale-reference inventory (validate.cjs count, USER-GUIDE/README duplication, `/df:` locations, dead statusline feature, new-project.md): **HIGH** — every number is a direct grep/read result with line citations, cross-checked twice.
- Existing-infra reuse (managed-block.cjs, upgrade.cjs migration contract, DEPRECATION_MAP, notices.cjs): **HIGH** — read in full, patterns are explicit and in some cases self-documenting ("objective 38 reuses it").
- Checker architecture (what to scan, what to exempt, slash-syntax matching): **MEDIUM-HIGH** — grounded in concrete false-positive/exemption examples found in-repo, but the checker itself doesn't exist yet, so the design is a recommendation, not a verified implementation.
- STACK.md declared-vs-detected drift: **LOW** — confirmed no existing comparator; this is unscoped new design work for the planner.
- Codebase-map staleness computation: **MEDIUM** — the git-log/rev-list mechanism is standard and low-risk, but there's no in-repo dogfood example to verify against (this repo has no `.planning/codebase/` yet).
- Telemetry/status advisory wiring: **MEDIUM** — the gap (unwired CLI) is HIGH-confidence-confirmed; the right resolution is an open question left to the planner, not a research gap.
- Test baseline: **HIGH** for the specific run recorded above; note it can vary — re-run at plan/execute time rather than trusting this document's numbers indefinitely.

**Research date:** 2026-09-28
**Valid until:** ~14 days (this document cites specific line numbers and test counts in an actively-changing repo; re-verify line numbers before writing tasks if more than a couple weeks pass or if objectives 35/36/31 land first as planned dependencies)
