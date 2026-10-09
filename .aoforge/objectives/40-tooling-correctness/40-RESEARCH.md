# Objective 40: Tooling Correctness - Research

**Researched:** 2026-09-28
**Domain:** DevFlow CLI (`df-tools.cjs` + `lib/*.cjs`) bug fixes — 8 defects surfaced by the v1.3 audit and objective 39's dogfooding run
**Confidence:** HIGH (all 8 defects reproduced live against this repo or a scratch `--cwd` copy; every root cause traced to an exact file:line; baseline test suite run and green)

## Summary

This is a bugfix objective (`work: bugfix`, `kind: plugin`), not a greenfield research objective — there is no new stack to select. All 8 defects were reproduced against the real repo (read-only commands) or a scratch copy under the session scratchpad (`--cwd`, mutating commands), so every finding below is empirical, not inferred from reading code alone.

**Cross-cutting pattern:** five of the eight defects (1, 2, 5, 6, 7) share one root cause shape — code written against an **older assumed shape of `STATE.md`/`ROADMAP.md`/objective directories** that no longer matches what this repo's own dogfooded files actually look like today:
- `STATE.md` moved from a legacy template schema (`**Current Objective:**` etc.) to a narrative schema (running `**Objective complete:** N — ...` log + a single `**Status:**` line + a plain-text, non-bold `## Session Continuity` section) — defects 2 and 7 are both "the parser only recognizes the old shape."
- Objective directories are `NN-slug-name` (e.g. `40-tooling-correctness`), but `intent resolve --objective <id>` is fed the bare `objective_number` field and does an exact-match `path.join(..., objectiveId, 'OBJECTIVE.md')` instead of the prefix-match every other objective-lookup function in this codebase already uses — defect 5.
- Reconciliation of nested TRD checkboxes in ROADMAP.md exists (`roadmap-reconcile.cjs`) but is wired only to a manual, user-typed command (`/devflow:workstreams reconcile`), not to the per-job command executors actually call mid-run (`roadmap update-job-progress`) — defect 6.
- `getMilestoneInfo()` grabs the *first* `v\d+\.\d+` anywhere in ROADMAP.md (the oldest, shipped one) instead of the one marked 🚧 in-progress — defect 1.

**Primary recommendation:** Fix each defect at its narrowest scope (see per-defect sections). Two defects (1 and 6) both land in `plugins/devflow/devflow/bin/lib/roadmap.cjs` — do not parallelize their TRDs in the same wave against that file; either combine them into one TRD or sequence them. Every other defect touches a disjoint file. Defect 3 requires no source-code fix (see below) — the live plugin tree is already clean; the remaining work is preventive (guidance + optional guard test). Defect 8 is a one-line `.gitignore` fix.

## Defect 1 — `init milestone-op` reports the wrong milestone version

**Location:** `plugins/devflow/devflow/bin/lib/roadmap.cjs:12-24`, function `getMilestoneInfo(cwd)`.

```js
function getMilestoneInfo(cwd) {
  try {
    const roadmap = fs.readFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), 'utf-8');
    const versionMatch = roadmap.match(/v(\d+\.\d+)/);
    const nameMatch = roadmap.match(/## .*v\d+\.\d+[:\s]+([^\n(]+)/);
    return {
      version: versionMatch ? versionMatch[0] : 'v1.0',
      name: nameMatch ? nameMatch[1].trim() : 'milestone',
    };
  } catch {
    return { version: 'v1.0', name: 'milestone' };
  }
}
```

**Repro (live, read-only):**
```
$ node plugins/devflow/devflow/bin/df-tools.cjs init milestone-op
{
  "commit_docs": true,
  "milestone_version": "v1.1",
  "milestone_name": "candidates",
  ...
```
ROADMAP.md's actual milestone markers (`.planning/ROADMAP.md:5-8`):
```
5:- ✅ **v1.1 — DevFlow Coordination Layer** ... (shipped 2026-05-06)
6:- ✅ **v1.2 — Token Efficiency + Ambient Mode + Handoff Polish** ... (shipped 2026-07-22)
7:- 🚧 **v1.3 — Autonomy hardening, stack profile, upgrade/adopt, doc auto-correction** ... (in progress; audit 2026-09-28 gaps_found → 39–41)
8:- 📋 **v1.4 — not yet planned** — candidate: Objective 26 ...
```
The regex `/v(\d+\.\d+)/` matches the *first* version token in the file — v1.1, the oldest shipped one, not v1.3 (🚧 in progress). `nameMatch` independently latches onto an unrelated `### 📋 v1.4 candidates` header later in the file, producing `milestone_name: "candidates"`.

**Root cause:** No status-awareness — the function scans for the first version-shaped substring and the first heading-shaped substring anywhere in the document, rather than parsing the `## Milestones` bullet list and picking the entry marked 🚧 (falling back to the highest-numbered ✅ if none is 🚧, then to the lowest 📋 if nothing is in progress).

**Blast radius:** `getMilestoneInfo` is exported from `roadmap.cjs:548` and consumed at 5 call sites: `init.cjs:347, 651, 907, 1061` (covers `init execute-objective-op`, `init plan-objective-op`, `init milestone-op`, and a 4th init compound) and `validate.cjs:661`. One fix in `roadmap.cjs` corrects all 5.

**Existing test coverage:** None. `grep -rn getMilestoneInfo plugins/devflow/devflow/bin/lib/*.test.cjs` returns zero hits — this function has never been unit tested.

**Recommended fix:** Rewrite `getMilestoneInfo` to parse the `## Milestones` bullet list specifically (lines matching `^- (✅|🚧|📋) \*\*v(\d+\.\d+)`), prefer the 🚧 entry, fall back to the highest ✅ version if no 🚧 exists, fall back to the lowest 📋 if neither exists, and only fall back to the current first-match behavior (or `v1.0`/`'milestone'`) if the `## Milestones` section itself is absent (keeps back-compat with any fixture/project that predates the bullet-list convention).

**Files touched:** `plugins/devflow/devflow/bin/lib/roadmap.cjs` only (source). New test cases in `plugins/devflow/devflow/bin/lib/roadmap.test.cjs` (function is defined there; no separate `milestone.test.cjs` exists).

**Test command:** `node --test plugins/devflow/devflow/bin/lib/roadmap.test.cjs`

---

## Defect 2 — `objective complete <N>` reports `state_updated: true` but leaves STATE.md unchanged

**Location:** `plugins/devflow/devflow/bin/lib/objective.cjs:696-869`, function `cmdObjectiveComplete`.

The STATE.md-touching block (lines ~800-855) is correctly guarded:
```js
const isLegacyStateSchema = /\*\*Current Objective:\*\*/m.test(stateContent);
if (isLegacyStateSchema) {
  // ...replace Current Objective / Status / Current Job / Last Activity...
  fs.writeFileSync(statePath, stateContent, 'utf-8');
}
```
This guard is intentional and correct — this repo's STATE.md uses the narrative schema (no `**Current Objective:**` field), so the legacy-template rewrite correctly does **not** fire, avoiding the exact regression the code comment describes (overwriting the narrative `**Status:**` line and stomping the running log). **But** the reported result object doesn't reflect that:
```js
const result = {
  ...
  roadmap_updated: fs.existsSync(roadmapPath),
  state_updated: fs.existsSync(statePath),   // true whenever the file exists, regardless of whether it was written
};
```

**Repro (scratch `--cwd`, STATE.md + objective 39's directory copied in):**
```
$ node plugins/devflow/devflow/bin/df-tools.cjs --cwd $SCRATCH objective complete 39
{
  "completed_objective": "39",
  ...
  "roadmap_updated": true,
  "state_updated": true
}
$ md5 $SCRATCH/.planning/STATE.md
MD5 (...) = f13e950a86bcd8d27df37d6e8cc55b4b   # identical to the pre-run md5 — STATE.md was never written
```

**Root cause:** `state_updated` is computed from `fs.existsSync(statePath)` (file presence) instead of tracking whether the write branch actually executed.

**Existing test coverage:** `plugins/devflow/devflow/bin/lib/objective.test.cjs:262-278` — `describe('objective complete — STATE.md narrative schema (no **Current Objective:** field)')`, test `'does not reset **Status:** to "Ready to plan"; narrative content survives byte-identical'` — this LOCKS the "don't touch narrative STATE.md" *content* behavior (asserts STATE.md text is byte-identical), but does **not** assert on the `state_updated` field in the result JSON, which is why the misleading flag shipped undetected. Lines 279-297 cover the legacy-schema path (where the flag is currently accurate).

**Recommended fix:** Track whether `fs.writeFileSync(statePath, ...)` actually ran (e.g. `let stateWritten = false;` set `true` only inside the `if (isLegacyStateSchema) { ...; stateWritten = true; }` block) and report `state_updated: stateWritten` instead of `fs.existsSync(statePath)`. Minimal, does not touch the narrative-preservation guard itself, so the existing byte-identical test keeps passing unmodified. Add a new test asserting `state_updated === false` when the narrative schema is present (mirrors the existing byte-identical test's fixture) and `state_updated === true` when the legacy schema is present and fields actually change.

**Files touched:** `plugins/devflow/devflow/bin/lib/objective.cjs` only. Test additions to the existing `plugins/devflow/devflow/bin/lib/objective.test.cjs`.

**Test command:** `node --test plugins/devflow/devflow/bin/lib/objective.test.cjs`

---

## Defect 3 — Planner/TRD templates emit `rg -nE` (ripgrep `-E` = `--encoding`, not extended regex)

**Finding — this is already fixed in the live plugin tree.** A full sweep found **zero** occurrences of `rg -nE` / bare `rg -E` anywhere under `plugins/devflow` (agents, skills, workflows, references, templates):
```
$ rg -n -e 'rg -nE|rg -E' plugins/devflow -g '!*.test.cjs'
(no output)
```
Every remaining occurrence is confined to `.planning/` **historical records**, which the task explicitly says must not be rewritten:
- `.planning/objectives/38-doc-auto-correction/38-04-TRD.md`, `38-05-TRD.md`, `38-06-TRD.md` — `<verify>` blocks written with `rg -nE` before the bug was understood.
- `.planning/objectives/38-doc-auto-correction/38-05-SUMMARY.md:157` and `38-06-SUMMARY.md:100` — the objective-38 executor's own writeup of exactly this bug ("`rg -nE`... `-E` is `--encoding` in ripgrep, not extended regex... 38-09 and future TRDs should drop the `-E`").
- `.planning/v1.3-MILESTONE-AUDIT.md:61` and `.planning/ROADMAP.md:330` and this objective's own `OBJECTIVE.md:21` — describing the bug (not exhibiting it as live guidance).

So the literal defect ("templates + agent prose emit `rg -nE`") does not currently reproduce — it was corrected during objective 38. What's still open is **prevention**: nothing in the live reference/template set states the rule ("`-E` is `--encoding` in ripgrep — use `rg -n -e PATTERN` or `rg -nP`"), so a future planner run, working from training-data instinct that `-E` means "extended regex" (true in GNU grep/egrep, false in ripgrep), can reintroduce it — which is exactly what happened in objective 38's TRDs before this correction.

**Recommended fix:**
1. Add a short, explicit rule to `plugins/devflow/devflow/references/verification-patterns.md` (read by `executor.md`, `execute-trd.md`, `verify-objective.md` — the files that write and run `<verify>` blocks) and/or `plugins/devflow/devflow/references/trd-spec.md` (the TRD authoring spec the planner uses): *"Use `rg -n -e PATTERN` or `rg -nP` for `<verify>` commands. Never `rg -nE` — in ripgrep, `-E` is `--encoding`, not extended regex (unlike GNU grep/egrep)."*
2. Optionally, add a cheap guard test modeled on `plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` (which already provides reusable `walkFiles`/`scanText` from `doc-refs.cjs:118,237` plus an `EXEMPT`-list pattern) that scans the same live-file glob set (agents, skills, workflows, references, templates — explicitly excluding `.planning/`) for `rg -nE` / bare `rg -E` and fails if found. This is cheap because the scanning infrastructure (`walkFiles`, `effectiveScanSet`-style globbing, EXEMPT-with-justification convention) already exists and can be reused rather than rebuilt.

**Existing test coverage:** None specific to this pattern (`doc-refs.repo.test.cjs` scans for stale `/devflow:`/`/df:` command references, not shell-flag correctness — a new, narrow test is needed, not an extension of that file, to keep its existing locked scope clean).

**Files touched:** `plugins/devflow/devflow/references/verification-patterns.md` (guidance) — does not overlap with any other defect's files. Optionally a new test file, e.g. `plugins/devflow/devflow/bin/lib/rg-flag-guard.test.cjs` (net-new, no conflict).

**Test command (if guard test added):** `node --test plugins/devflow/devflow/bin/lib/rg-flag-guard.test.cjs`

---

## Defect 4 — `remove-objective.md:16` says "integer or decimal"

**Location:** `plugins/devflow/devflow/workflows/remove-objective.md:16`:
```
- Argument is the objective number to remove (integer or decimal)
```

**Root cause:** Stale wording. Decimal objective **add/insert** were deprecated in v1.2 (`plugins/devflow/devflow/bin/lib/objective.cjs:177,355` both throw explicit deprecation errors: *"decimal-objective commands were deprecated in v1.2; use df-tools objective add to append instead"*). Decimal **removal** is still legacy-supported for cleaning up pre-v1.2 decimal directories (`objective.cjs:496`: `const isDecimal = targetObjective.includes('.');`, with sibling renumbering explicitly skipped for decimals per TRD 12-06) — so "decimal" isn't wrong for `remove` specifically, but the phrasing reads as if decimal objectives are still a normal, ongoing addressing scheme, which is misleading now that only integers are ever created going forward.

**Recommended fix:** Reword to something like: *"Argument is the objective number to remove (integer; legacy decimal directories from before v1.2 are also accepted for removal, but decimals are never created anymore — see `objective add`)."*

**Existing test coverage:** None (prose-only file, not exercised by any `*.test.cjs`).

**Files touched:** `plugins/devflow/devflow/workflows/remove-objective.md` only. No test needed — this is a doc-only fix with no behavioral change.

**Test command:** none required (optionally re-run `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` to confirm the reworded line doesn't trip the existing stale-reference guard).

---

## Defect 5 — `intent resolve --objective <id>` ignores OBJECTIVE.md's `work:` frontmatter for bare-number IDs

**Location:** `plugins/devflow/devflow/bin/lib/intent.cjs:194-199`, function `readObjectiveMd`:
```js
function readObjectiveMd(projectRoot, objectiveId) {
  const objPath = path.join(projectRoot, '.planning', 'objectives', objectiveId, 'OBJECTIVE.md');
  if (!fs.existsSync(objPath)) return null;
  const content = fs.readFileSync(objPath, 'utf-8');
  return extractFrontmatter(content) || {};
}
```
Called from `resolve()` at line 238: `const objectiveFm = objectiveId ? readObjectiveMd(projectRoot, objectiveId) : null;`, feeding the work-precedence block at lines 254-268:
```js
if (trdFm && trdFm.work) { work = trdFm.work; workSource = 'TRD'; }
else if (objectiveFm && objectiveFm.work) { work = objectiveFm.work; workSource = 'OBJECTIVE.md'; }
else if (projectFm.default_work) { work = projectFm.default_work; workSource = 'PROJECT.md default_work'; }
else { work = 'feature'; workSource = 'fallback'; }
```

**Repro (live, read-only):**
```
$ grep -n '^work:' .planning/objectives/40-tooling-correctness/OBJECTIVE.md
4:work: bugfix

$ node plugins/devflow/devflow/bin/df-tools.cjs intent resolve --objective 40
{
  "kind": "plugin",
  "work": "feature",
  "workSource": "PROJECT.md default_work",
  "workInherited": true,
  ...
```
`work` should be `bugfix` (`workSource: "OBJECTIVE.md"`); instead it silently falls through to PROJECT.md's `default_work: feature` because `readObjectiveMd(projectRoot, '40')` builds the path `.planning/objectives/40/OBJECTIVE.md`, which does not exist — the real directory is `.planning/objectives/40-tooling-correctness/OBJECTIVE.md`. `fs.existsSync` returns `false`, the function returns `null`, and the caller treats "not found" identically to "no `work:` field set" — no warning is emitted either (`warnings: []` in the full output).

**Root cause:** `readObjectiveMd` requires an exact directory-name match. Every other objective-lookup function in this codebase already handles the slugged-directory case correctly — e.g. `findObjectiveInternal` in `objective.cjs:90+` uses `dirs.find(d => d.startsWith(normalized + '-') || d === normalized)`. `intent.cjs` doesn't import `objective.cjs` (no circular-dependency risk in adding equivalent local logic) or reuse that helper.

**Trigger in practice:** `plugins/devflow/agents/planner.md:212` calls `df-tools intent resolve --objective <id>` without specifying which ID form to pass; the init JSON's `objective_number`/`padded_objective` fields (`init.cjs:482,825`) are bare zero-padded numbers, while `objective_dir` holds the full slugged name (`init.cjs:364,478,776,821`) — a planner naturally reaching for `objective_number` (the more obviously-named field) triggers this bug on every bugfix/refactor/port objective that overrides `work` away from the project default.

**Existing test coverage:** `plugins/devflow/devflow/bin/lib/intent.test.cjs` — confirmed via grep that every test case passes `objectiveId: '01-foo'` style (full slugged form); zero coverage of the bare-number form, which is exactly the blind spot that let this ship.

**Recommended fix:** In `readObjectiveMd`, if the exact `path.join(..., objectiveId, ...)` doesn't exist, fall back to a prefix scan of `.planning/objectives/` for a directory matching `^${objectiveId}(-|$)` (mirroring `findObjectiveInternal`'s pattern), before returning `null`. Add test cases to `intent.test.cjs` covering both `objectiveId: '40'` (bare) against a `40-tooling-correctness` fixture directory, and the existing full-slug form (regression guard). Also worth a 1-line courtesy note in `planner.md:212` clarifying `objective_number` (bare) is the correct field to pass and that it now resolves via prefix match.

**Files touched:** `plugins/devflow/devflow/bin/lib/intent.cjs` (source). Test additions to `plugins/devflow/devflow/bin/lib/intent.test.cjs` (and optionally `intent-cli.test.cjs` for a CLI-spawn-level regression case). Optionally a 1-line clarification in `plugins/devflow/agents/planner.md` — does not overlap with any other defect's files.

**Test command:** `node --test plugins/devflow/devflow/bin/lib/intent.test.cjs plugins/devflow/devflow/bin/lib/intent-cli.test.cjs`

---

## Defect 6 — `roadmap update-job-progress` never ticks nested TRD checkboxes

**Location:** `plugins/devflow/devflow/bin/lib/roadmap.cjs:273-338`, function `cmdRoadmapUpdateJobProgress`.

The function updates three things on every call: the Progress table row (`updateProgressTableRow`), the objective's `**Jobs:**` summary line (`updateJobsLine`), and — only when `summaryCount >= jobCount` — the top-level objective checkbox (`- [ ] Objective N: ...` → `- [x] ...`). It never touches the **nested per-TRD checkboxes** that live under each objective section, e.g.:
```
- [ ] 39-01-TRD.md — ...
- [x] 39-02-TRD.md — ...
```
This is exactly the shape `roadmap-reconcile.cjs`'s `_walkTrdLines` / `reconcile()` was built to maintain — but `roadmap.cjs` doesn't import `roadmap-reconcile.cjs` at all, and `reconcile()` is wired to exactly one CLI command: `workstreams reconcile` (dispatch in `df-tools.cjs` at the `workstreams` case, `subcommand === 'reconcile'`, calling `cmdSyncRoadmapRoute` from `roadmap-reconcile-cli.cjs:199`) — which is a **user-typed-only command** (per the ambient-mode routing directive: `disable-model-invocation: true` because it mutates planning state; agents cannot invoke it via the Skill tool).

Meanwhile, `roadmap update-job-progress` is what actually runs mid-execution, autonomously, per job: both `plugins/devflow/devflow/workflows/execute-trd.md:226` and `plugins/devflow/agents/executor.md:1026` call it directly after each TRD. So the nested checkboxes only get reconciled if a human separately, manually runs `/devflow:workstreams reconcile` — which explains why they drift silently during autonomous execution runs (the real-world symptom the objective's scope note references, from objective 39's run).

**Confirms it's not currently causing drift right now:** `plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs`'s self-test `E2E1: SELF-TEST — reconcile dry-run against this repo ROADMAP shows zero drift` (line 984) passes today against this repo's real ROADMAP.md — i.e., ROADMAP.md is currently caught up (someone ran `workstreams reconcile` or hand-fixed it since objective 39), but the gap in `roadmap update-job-progress` itself is unfixed and will drift again on the next autonomous run.

**Root cause:** `reconcile()` (the correct, already-built logic for ticking nested TRD checkboxes from SUMMARY.md presence/pass-fail) is architecturally isolated behind a human-only command, and never invoked from the per-job path that agents actually exercise.

**Existing test coverage:** `roadmap-reconcile.test.cjs` covers `reconcile()` itself extensively (self-test + fixtures) but has no case exercising `roadmap.cjs`'s `cmdRoadmapUpdateJobProgress` calling `reconcile()`, because that call doesn't exist yet. `roadmap.test.cjs`'s "roadmap update-job-progress" describe blocks (5-column/4-column table shapes, Jobs-line heal logic) cover the top-level table/checkbox update thoroughly but never assert on nested TRD lines.

**Recommended fix:** At the end of `cmdRoadmapUpdateJobProgress` (after its existing `fs.writeFileSync(roadmapPath, ...)`), call `reconcile.reconcile({ projectRoot: cwd, mode: 'write' })` (import `roadmap-reconcile.cjs` — confirmed to have no circular-dependency risk; it only requires `fs`/`path`). This is safe to call on every job-progress update: `reconcile()` is idempotent (proven by the existing zero-drift self-test) and `_updateProgressTable`'s regex (lines 310-360 of `roadmap-reconcile.cjs`) is confirmed to be a no-op against this repo's actual Progress-table row format (`| 12. Objective under test | v1.1 | 9/10 | In Progress | — |` — a "N. slug" compound first cell, not the bare `Objective N`/`N` shape `_updateProgressTable` requires), so it will not double-write or corrupt the row `cmdRoadmapUpdateJobProgress` just wrote via `updateProgressTableRow`. `reconcile.cjs`'s module exports are commented **"LOCKED by TRD 09-03 (8-entry surface; SC-7)"** — the fix must call the existing exported `reconcile` function, not add new exports.

**Wave-conflict warning:** this fix and Defect 1's fix both land in `plugins/devflow/devflow/bin/lib/roadmap.cjs`, and both add test cases to `plugins/devflow/devflow/bin/lib/roadmap.test.cjs`. Do not run these as two independent parallel TRDs in the same wave — either combine them into a single TRD, or sequence them (Defect 1 first, since it's the smaller, more isolated change inside `getMilestoneInfo`; Defect 6 second, touching `cmdRoadmapUpdateJobProgress` further down the same file).

**Files touched:** `plugins/devflow/devflow/bin/lib/roadmap.cjs` (add `require('./roadmap-reconcile.cjs')` + one call at the end of `cmdRoadmapUpdateJobProgress`) — **same file as Defect 1**. Test additions to `plugins/devflow/devflow/bin/lib/roadmap.test.cjs` — **same file as Defect 1's tests**.

**Test command:** `node --test plugins/devflow/devflow/bin/lib/roadmap.test.cjs plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs`

---

## Defect 7 — `state record-session` is a no-op on this repo's STATE.md

**Location:** `plugins/devflow/devflow/bin/lib/state.cjs:82-89` (`stateReplaceField`) and `:427-459` (`cmdStateRecordSession`).
```js
function stateReplaceField(content, fieldName, newValue) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(\\*\\*${escaped}:\\*\\*\\s*)(.*)`, 'i');   // requires **Field:** (bold markdown)
  ...
}
function cmdStateRecordSession(cwd, options, raw) {
  ...
  let result = stateReplaceField(content, 'Last session', now);
  ...
  result = stateReplaceField(content, 'Stopped At', options.stopped_at);
  if (!result) result = stateReplaceField(content, 'Stopped at', options.stopped_at);
  ...
  result = stateReplaceField(content, 'Resume File', resumeFile);
  if (!result) result = stateReplaceField(content, 'Resume file', resumeFile);
  ...
  if (updated.length > 0) { fs.writeFileSync(statePath, content, 'utf-8'); output({recorded: true, ...}); }
  else { output({recorded: false, reason: 'No session fields found in STATE.md'}, raw, 'false'); }
}
```

**Repro (scratch `--cwd`):**
```
$ node plugins/devflow/devflow/bin/df-tools.cjs --cwd $SCRATCH state record-session --resume-file ".planning/SESSION_PICKUP.md" --stopped-at "test marker for repro"
{
  "recorded": false,
  "reason": "No session fields found in STATE.md"
}
$ md5 $SCRATCH/.planning/STATE.md   # unchanged, confirmed
```
This repo's real `## Session Continuity` section (`.planning/STATE.md:229-233`) is plain, non-bold text:
```
Last session: 2026-09-28 — Objective 39 TRD 39-05 executed ...
Resume file: `.planning/SESSION_PICKUP.md`
Stopped at: Completed 39-05-TRD.md (2026-09-28); ...
```
No line anywhere in STATE.md matches `\*\*(Last session|Last Date|Stopped At|Stopped at|Resume File|Resume file):\*\*` — `stateReplaceField`'s regex is hardcoded to bold-markdown fields only, so every call returns `null` and nothing is ever updated. At least this defect **reports honestly** (`recorded: false` with a truthful reason), unlike Defect 2's misleading `state_updated: true`.

**Root cause:** `stateReplaceField` was written for the legacy bold-field template schema and never extended to also match the plain non-bold `Label: value` lines this repo's narrative `## Session Continuity` section actually uses.

**Existing test coverage:** **None.** No `state.test.cjs` file exists anywhere in the repo (`plugins/devflow/devflow/bin/lib/state.cjs` has zero adjacent test coverage — confirmed by directory listing).

**Recommended fix:** Extend `stateReplaceField` (or add a sibling matcher used only by `cmdStateRecordSession`) to also try a plain-text pattern: `` `^${escaped}:\s*(.*)$` `` (multiline, case-insensitive) when the bold pattern doesn't match, replacing only the value portion and preserving the line's leading label text and any trailing inline formatting (e.g. the backtick-wrapped resume-file path). Scope the plain-text fallback to the `## Session Continuity` section specifically (mirroring how `cmdStateSnapshot`/blocker-removal functions elsewhere in this file already scope their edits to a named section) to avoid false-matching an unrelated plain-text line elsewhere in STATE.md that happens to start with e.g. `Resume file:`.

**Files touched:** `plugins/devflow/devflow/bin/lib/state.cjs` only — no overlap with any other defect. **New** test file needed: `plugins/devflow/devflow/bin/lib/state.test.cjs` (does not exist today; create fresh, no merge/conflict risk).

**Test command:** `node --test plugins/devflow/devflow/bin/lib/state.test.cjs` (new file)

---

## Defect 8 — `.planning/.edit-override` is not in `.gitignore`

**Location:** repo-root `.gitignore`. The `.planning`-scoped ephemeral-marker block (`.gitignore:19-49`) covers 10 sibling markers (`.awareness-cache.json`, `.dup-detect-log.jsonl`, `.check-todos-cache.json`, `.deprecation-log.jsonl`, `.autonomous-resume-*`, `.autonomous-retry-*`, `.skill-active`, `.devflow-notices.json`, `.progress-guard.json`, `.override-log.jsonl`) but has no entry for `.planning/.edit-override`:
```
$ grep -n 'edit-override' .gitignore
NOT FOUND in .gitignore
```
The marker's canonical name is confirmed in `plugins/devflow/devflow/bin/lib/override.cjs:27-31`:
```js
const GATES = {
  edits: '.edit-override',
  commits: null,   // env-var driven (DEVFLOW_ALLOW_RAW_COMMIT); logged only
  changelog: null, // env-var driven (DEVFLOW_SKIP_CHANGELOG_GATE); logged only
};
```
It's written as a session-local override marker for `gate-edits.js` — the same class of ephemeral runtime state as `.skill-active` (which *is* gitignored) — so its absence looks like an oversight rather than a deliberate choice.

**Scope check (per the task's instruction to check both repo-root and scaffolding):**
- No template `.gitignore` exists anywhere under `plugins/devflow/devflow/templates/` — new-project/adopt scaffolding writes no gitignore entries for any of these markers at all; they only ever get gitignored by hand-editing the repo-root `.gitignore` (as this repo has done for its own 10 markers).
- `plugins/devflow/devflow/workflows/new-project.md`'s "If commit_docs = Yes: No additional gitignore entries needed" line is stale/wrong given this repo's own accumulated need for 10 marker entries even with `commit_docs: true` — flagged as a broader systemic gap, but out of this defect's minimal scope (the task's numbered defect is specifically about `.edit-override`).
- No test asserts `.gitignore` content anywhere in the suite.

**Root cause:** Simple omission — `.edit-override` was added to `override.cjs`'s `GATES` map without a corresponding `.gitignore` entry, unlike every other ephemeral `.planning/.*` marker.

**Recommended fix (minimal, in-scope):** Add one line to the repo-root `.gitignore`, in the existing ephemeral-marker block:
```
.planning/.edit-override
```
**Stretch/follow-up (flagged, not required for this defect):** correct `new-project.md`'s stale gitignore guidance and/or add gitignore-writing logic to the `adopt`/`new-project` scaffolding so future DevFlow projects don't have to hand-accumulate these 11 (now 11, with this fix) entries the way this repo did. Recommend deferring this broader fix to a follow-up objective unless the planner judges it trivially in-scope.

**Existing test coverage:** None (no test reads `.gitignore`).

**Recommended optional guard test:** a small test asserting every `GATES` value in `override.cjs` that resolves to a marker filename (i.e. non-null `edits: '.edit-override'`) has a corresponding `.planning/<marker>` line in the repo-root `.gitignore` — cheap, and prevents this exact class of omission recurring if a future gate adds a new file-based marker.

**Files touched:** `.gitignore` (repo root) only, for the minimal fix — no overlap with any other defect. Optional stretch touches `plugins/devflow/devflow/workflows/new-project.md` and adopt-scaffold files (separate, disjoint from everything else).

**Test command:** none required for the minimal fix. If the optional guard test is added: `node --test plugins/devflow/devflow/bin/lib/<new-guard-test-file>.test.cjs`

---

## Files-Touched Matrix (for disjoint `files_modified` per wave)

| Defect | Source file(s) | Test file(s) | Conflicts with |
|---|---|---|---|
| 1 — milestone version | `bin/lib/roadmap.cjs` (`getMilestoneInfo`) | `bin/lib/roadmap.test.cjs` | **Defect 6** (same 2 files) |
| 2 — `state_updated` flag | `bin/lib/objective.cjs` | `bin/lib/objective.test.cjs` | none |
| 3 — `rg -nE` guidance | `devflow/references/verification-patterns.md` | new: `bin/lib/rg-flag-guard.test.cjs` (optional) | none |
| 4 — remove-objective wording | `devflow/workflows/remove-objective.md` | none | none |
| 5 — intent resolve | `bin/lib/intent.cjs` (+ optional 1-line note in `agents/planner.md`) | `bin/lib/intent.test.cjs`, `bin/lib/intent-cli.test.cjs` | none |
| 6 — TRD checkbox reconcile | `bin/lib/roadmap.cjs` (`cmdRoadmapUpdateJobProgress`) | `bin/lib/roadmap.test.cjs`, `bin/lib/roadmap-reconcile.test.cjs` | **Defect 1** (same 2 files) |
| 7 — record-session no-op | `bin/lib/state.cjs` | new: `bin/lib/state.test.cjs` (doesn't exist yet) | none |
| 8 — gitignore | `.gitignore` (+ optional `devflow/workflows/new-project.md`, adopt scaffold) | none (optional new guard test) | none |

**Planner guidance:** 6 of the 8 defects are mutually disjoint and safe to run as parallel TRDs in one wave. Defects 1 and 6 are the only pair sharing files (`roadmap.cjs` + `roadmap.test.cjs`) — combine them into a single TRD, or place them in sequential waves/sequential-within-wave, not parallel. This directly answers the task's stated concern ("parallel TRDs that each edit STATE.md/ROADMAP.md conflicted last time").

## Baseline Test Health

Full suite for the four files with existing coverage, run clean before any fix (confirms none of these defects are currently caught, i.e. all 8 are real gaps, and confirms the starting point is green):
```
$ node --test plugins/devflow/devflow/bin/lib/roadmap.test.cjs plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs plugins/devflow/devflow/bin/lib/objective.test.cjs plugins/devflow/devflow/bin/lib/intent.test.cjs
ℹ tests 133
ℹ pass 133
ℹ fail 0
```
`state.cjs` has no adjacent test file at all (`state.test.cjs` does not exist — confirmed via directory listing), so it contributes 0 to that count.

## Test Commands Reference

| Defect | Command |
|---|---|
| 1 | `node --test plugins/devflow/devflow/bin/lib/roadmap.test.cjs` |
| 2 | `node --test plugins/devflow/devflow/bin/lib/objective.test.cjs` |
| 3 | `node --test plugins/devflow/devflow/bin/lib/rg-flag-guard.test.cjs` (new, if added) |
| 4 | none (doc-only); optionally `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` |
| 5 | `node --test plugins/devflow/devflow/bin/lib/intent.test.cjs plugins/devflow/devflow/bin/lib/intent-cli.test.cjs` |
| 6 | `node --test plugins/devflow/devflow/bin/lib/roadmap.test.cjs plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs` |
| 7 | `node --test plugins/devflow/devflow/bin/lib/state.test.cjs` (new file) |
| 8 | none required; optional new guard test |
| Full regression | `npm test` (repo root — Node native test runner over all `*.test.cjs`) |

## Open Questions

1. **Defect 3's scope: prose-only or also a code guard test?**
   - What we know: the live plugin tree is already clean (zero `rg -nE` occurrences); the historical `.planning/objectives/38-*` records must not be touched.
   - What's unclear: whether the objective wants the guard test built now (preventive) or deferred, since nothing is currently broken.
   - Recommendation: treat the guidance-doc addition (verification-patterns.md) as required, the guard test as a cheap stretch — the planner can size it as a small task within the same TRD or its own micro-TRD.

2. **Defect 8's broader scaffolding gap (new-project.md / adopt) — in scope or follow-up?**
   - What we know: the one-line `.gitignore` fix fully resolves the literally-stated defect; the broader "adopt/new-project don't write gitignore entries at all" issue is a separate, larger gap this repo itself has been absorbing by hand (11 markers accumulated over time).
   - What's unclear: whether objective 40's scope (as a "tooling correctness" bugfix objective) is meant to include that systemic fix or just the immediate omission.
   - Recommendation: fix the immediate line; note the broader gap as a candidate for a future objective (already partially true — v1.4 candidates section exists in ROADMAP.md) rather than expanding this objective's scope.

## Sources

### Primary (HIGH confidence — direct reproduction against live code)
- `plugins/devflow/devflow/bin/lib/roadmap.cjs` — read in full, `getMilestoneInfo` (12-24) and `cmdRoadmapUpdateJobProgress` (273-338) reproduced live
- `plugins/devflow/devflow/bin/lib/objective.cjs` — `cmdObjectiveComplete` (696-869) reproduced via scratch `--cwd` copy against real objective-39 fixtures
- `plugins/devflow/devflow/bin/lib/intent.cjs` — `readObjectiveMd`/`resolve` (194-268) reproduced live via `intent resolve --objective 40`
- `plugins/devflow/devflow/bin/lib/state.cjs` — `stateReplaceField`/`cmdStateRecordSession` (82-89, 427-459) reproduced via scratch `--cwd` copy
- `plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs` and `roadmap-reconcile-cli.cjs` — read in full for wiring/export-lock verification
- `.gitignore`, `override.cjs` GATES map — read in full
- `plugins/devflow/devflow/workflows/remove-objective.md:16` — read directly
- Full-repo `rg` sweep for `rg -nE`/`rg -E` across `plugins/devflow` (zero hits) and `.planning` (10 historical hits, all in objective-38 records + audit docs)
- `node --test` baseline run: 133/133 passing across the 4 existing relevant test files

### Secondary
- `.planning/objectives/40-tooling-correctness/OBJECTIVE.md` — authoritative scope list, confirmed to match the 8 defects verbatim (defects 5-8 noted as added from objective 39's run, 2026-09-28)
- `.planning/STATE.md`, `.planning/ROADMAP.md` — read for ground-truth format verification (narrative STATE.md schema; 5-column ROADMAP.md Progress table + Milestones bullet list confirmed)

## Metadata

**Confidence breakdown:**
- Root causes (all 8): HIGH — every defect reproduced live with command + output shown above, not inferred from static reading alone.
- Recommended fixes: HIGH for defects 1, 2, 5, 6, 7, 8 (minimal, narrowly-scoped, consistent with existing code patterns already used elsewhere in the same files). MEDIUM for defect 3 (the fix is preventive/documentation — no wrong behavior currently exists to verify a fix against).
- Files-touched matrix: HIGH — derived directly from reading each function's location, not guessed.

**Research date:** 2026-09-28
**Valid until:** stable until the next STATE.md/ROADMAP.md schema migration or the next `reconcile()`/`intent.cjs` refactor — no fast-moving external dependency involved (pure internal CLI code), so no short expiry needed.
