# Objective 48: Planning write-path migration - Research

**Researched:** 2026-10-01
**Domain:** DevFlow plugin internals (df-tools verbs, edit gate hook, validate, upgrade migration, prompt audit). No external libraries; everything is read from this repo and objective 47's modules.
**Confidence:** HIGH on the code facts (read directly), MEDIUM on the design choices marked "recommend", LOW on the linked-bulk rule (the proposal never defines it, see Open Questions).

<user_constraints>
## User Constraints (no CONTEXT.md exists for objective 48)

Source: `.planning/objectives/48-planning-write-path-migration/OBJECTIVE.md` and `docs/PROPOSAL-github-system-of-record.md` (decisions LOCKED 2026-09-30, do not re-litigate).

### Locked decisions (verbatim from the proposal table)
- Source of truth: GitHub fully authoritative; `.planning/` is a gitignored cache.
- Skills and agents never Edit/Write cached planning files; they call `df-tools` verbs (`plan put-trd`, `objective set-status`, `summary post`, ...).
- Issue writes go to the outbox journal; wiki writes are commits to the local wiki clone + push.
- TRD scope budget: target 40,000 chars, never over 60,000; enforced in planner scope estimation, the job-checker, and `df-tools plan put-trd`. Over budget means narrow the TRD or move work to a follow-up TRD; never trim prose to fit. Fixtures, sample data and long listings go in the repo or wiki and are linked.
- Enforcement: edit gate denies writes to cached planning files.

### From the task brief (design constraint)
- Verbs must work in BOTH modes. `github.store` off (default; this repo's config) means every verb writes the local `.planning/` file exactly as today and `.planning/` stays tracked. Only store mode routes through outbox/hierarchy/wiki, gitignores `.planning/`, and makes the gate strict on cache files.

### Project constraints
- Strict TDD (kind plugin, work refactor): failing test committed first. Tests never call real GitHub (`_setRunGh` + `__fixtures__/gh-fake.cjs`), never touch the real `~/.claude` (`hermeticEnv()`), never port 8080.

### Deferred (OUT OF SCOPE)
- Branch/PR lifecycle, `df-tools commit` default-branch refusal, post-commit/Stop flush hooks (objective 49); `gh setup`, rulesets, required checks (50); stacked PRs (never).
</user_constraints>

<phase_requirements>
## Objective Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GWP-01 | Verbs cover every planning write | Inventory (section 1); 47 libs already provide enqueue primitives; four gaps need small additive 47-lib changes (todo role, decision answer, status op, doc put) |
| GWP-02 | Skills/workflows/agents use the verbs | ~45 prose files, audit-driven ratchet (section 6) |
| GWP-03 | Gate denies cache edits naming the verb; validate flags Bash writes | Section 2 (gate placement), section 3 (ledger-based detection) |
| GWP-04 | `.planning/` gitignored in store mode | Section 4: confirm migration 0010 + per-path commit-skip fix |
| GWP-05 | Job-checker enforces budget + linked-bulk | Section 5: extend `verify trd-pre` and job-checker Dimension 8 |
</phase_requirements>

## Summary

Objective 47 shipped every storage primitive 48 needs: `gh-hierarchy.pushHierarchy` (TRDs, edges, summaries, verification, pages), `gh-comments.enqueueSummary/enqueueVerification/enqueueScope`, `gh-hierarchy.openDecision`, `gh-trd.budget/checkObjectiveBudgets/assertEditable`, `gh-wiki.pageForCachePath` (the single page table), `gh-outbox.enqueue`, `gh-cache.recordCacheBaseline/listOwnedLocal`, and the `gh-store-cli.queuedResult` enqueue-then-flush pattern (`--no-flush`, exit codes 0/2/3/1). 48 is therefore mostly a thin verb layer plus enforcement plus ~45 prose edits. It adds no storage mechanism.

The mode switch is one tiny pure module, `planning-mode.cjs`, that every verb, the gate and `validate` call. Mode is `store` only when `github.enabled === true && github.store === true` (strict booleans, the same rule as `gh.storeEnabled` plus `outbox.isEnabled`); otherwise `local`. In `local`, a verb is a validated, atomic write of the same file at the same path today's prose writes, so non-GitHub projects (and this repo) are byte-for-byte unaffected. In `store`, the verb writes the cache file, enqueues the outbox op, flushes unless `--no-flush`, and records the baseline.

Three things the brief did not anticipate and the planner must handle: (1) 47's op set has no `todo` role, no decision answer, and no objective-status semantics, so three small additive library changes land first; (2) `.planning/` contains many non-cache paths (todos, debug, quick, research, decisions, milestones, state.json, STACK.md) that nothing in 47 syncs, so gitignoring the whole directory would silently stop versioning them; they need an explicit classification (section 4); (3) the outbox and cache are keyed by `realpath(root)`, so verbs run from an executor worktree would use a different journal and no cache at all; verbs must resolve the main checkout.

**Primary recommendation:** Build `planning-mode.cjs` + `planning-paths.cjs` (classifier) first as pure modules; every other piece (verbs, gate, validate, migration, audit test) consumes them. Make the SC1 audit test a ratchet (pinned per-file violation baseline that shrinks to zero), so prose migration can be split across parallel TRDs under TDD.

## 1. Inventory of planning writes

### 1a. Artifact → verb map (the classifier table `planning-paths.cjs` must encode)

| Cache path (relative to `.planning/`) | Store-mode home | Verb (both modes) | Existing command covering it today |
|---|---|---|---|
| `objectives/<dir>/*-TRD.md` | TRD sub-issue body (issue is the only copy) | `plan put-trd` | none (agents Write the file); `frontmatter set/merge` mutates TRD frontmatter in place |
| `objectives/<dir>/OBJECTIVE.md` | Objective issue body sections + wiki `Objective-<N>-<Slug>` | `objective put` | `project-bootstrap.cjs` writes a stub; `gh sync` pushes it |
| objective status (frontmatter `status:`, ROADMAP checkbox) | issue state / Project Status | `objective set-status` | `objective complete`, `roadmap update-job-progress` |
| `objectives/<dir>/*-SUMMARY.md` | `devflow:summary` comment on TRD issue | `summary post` | `template fill summary` writes the skeleton; `state advance-job` etc. read counts |
| `objectives/<dir>/*-VERIFICATION.md` | sticky `devflow:verification` comment on objective | `verification post` | `template fill verification`, `uat-generator` (UAT.md) |
| `objectives/<dir>/*-CONTEXT.md`, `*-RESEARCH.md` | wiki pages `...-Context`, `...-Research` | `doc put` | none |
| `PROJECT.md`, `REQUIREMENTS.md`, `codebase/*.md`, `adr/*.md`, `retros/*.md` | wiki pages (PAGE_TABLE rules) | `doc put` | `requirements mark-complete` edits REQUIREMENTS.md; `project-bootstrap` edits PROJECT.md |
| Decision issue (`<trd>-d<k>`) | Decision-type issue blocking its TRD | `decision open` / `decision answer` | `decision-queue add|resolve|list` (local `.planning/decisions/pending/DECISION-NNN.md`) |
| Todo | issue labelled `devflow:todo` | `todo add` | `todo complete`, `check-todos`, `add-todo` workflow writes `todos/pending/*.md` |
| `ROADMAP.md`, `STATE.md` | generated views (`gh-cache.renderRoadmap/renderState`, `GENERATED_HEADER`) | none; regenerated by `gh pull --all` | `roadmap *`, `state *`, `objective add|insert|remove|complete`, `milestone complete`, `sync-roadmap`, `workstreams`, `micro` write them directly |

`doc put <rel>` accepts only paths for which `gh-wiki.pageForCachePath(rel) !== null`; anything else is a usage error that names the nearest class. `gh-outbox-flush.handleWikiPush` reads the CURRENT cache file when it flushes (it does not carry text in the op payload), so `doc put` = write the cache file + enqueue `wiki-push {pages:[rel], message}`.

### 1b. Existing df-tools writers that need store-mode behaviour

| Writer (lib) | Writes | Store-mode behaviour (recommend) |
|---|---|---|
| `state.cjs` (`update/patch/advance-job/record-metric/add-decision/add-blocker/resolve-blocker/record-session/update-progress`) | `STATE.md`, `state.json`, `STATE_ARCHIVE.md` | STATE.md is a generated view in store mode (`renderState` carries only position + objectives), so these mutators write `state.json` (per-clone runtime state, exempt) and skip STATE.md. They never claim to sync decisions/blockers. See Open Question 2. |
| `roadmap.cjs`, `roadmap-reconcile.cjs`, `sync-roadmap` | `ROADMAP.md` | no-op with a message ("generated; run `gh pull --all`"), exit 0 |
| `objective.cjs` `add/insert/remove/complete` | dirs + ROADMAP rows | `add/insert`: create dir + OBJECTIVE.md then `objective put`; `remove`: refuse in store mode (deletes are never automatic, proposal); `complete`: `objective set-status complete` |
| `misc.cjs` `cmdTodoComplete`, scaffold, requirements | `todos/done/*`, REQUIREMENTS.md | `todo complete` closes the issue; `requirements mark-complete` becomes `doc put REQUIREMENTS.md` |
| `frontmatter.cjs` `set|merge` | any file, incl. TRD/SUMMARY/OBJECTIVE | on a cache path in store mode: refuse and name the verb (TRD frozen / body is the only copy) |
| `templates.cjs` `template fill` | skeleton SUMMARY/VERIFICATION/UAT/CONTEXT | writes the cache file as a draft; the flow then ends in `summary post` / `verification post` (which reads that file) |
| `decision-queue.cjs`, `check-todos.cjs`, `uat-generator.cjs`, `workstreams.cjs`, `micro.cjs`, `initiatives.cjs` | decisions/todos/UAT/workstream state | decisions and todos get verbs; UAT.md joins the verification flow; workstreams/micro/initiatives are local-only (see classification below) |
| `adopt.cjs`, `init new-project`, `project-bootstrap.cjs` | config, STATE, ROADMAP, PROJECT, OBJECTIVE stubs | stay LOCAL-mode only. Bootstrap precedes opting into the store; store mode is entered afterwards (`gh sync --all` pushes, migration 0010 gitignores). Skills call `doc put` in local mode, which is today's write. |

### 1c. Exempt from verbs and from the gate (runtime or config)
`.skill-active`, `.edit-override`, `.devflow-notices.json`, `.progress-guard.json`, `.awareness-cache.json`, `.override-log.jsonl`, `.deprecation-log.jsonl`, `.dup-detect-log.jsonl`, `.check-todos-cache.json`, `.autonomous-*`, `.micro-description`, `config.json`, `state.json`, `wiki/` internals (`wiki/.git`), `evidence/` screenshots. Rule: any dot-prefixed file directly under `.planning/` is exempt; `config.json` and `state.json` are exempt by name. This is the same pinned set as `hooks/planning-writes.audit.test.js` `ALLOWED_WRITES`/`READ_ONLY`; reuse its vocabulary and keep the two tests consistent.

### 1d. Prose write sites (what the audit and migration must touch)
Found with `rg` over `skills/`, `devflow/workflows/`, `agents/` (heuristic: write verb within 80 chars of an artifact name). Hot spots, by file:

| Group | Files | Artifacts written today |
|---|---|---|
| Plan | `agents/planner.md` (L546, 996, 1047-1099), `workflows/plan-objective.md`, `agents/roadmapper.md` (L476-480), `workflows/plan-milestone-gaps.md` | TRD files, ROADMAP rows, STATE, REQUIREMENTS traceability; commit line at planner L1099 |
| Research/discuss | `agents/objective-researcher.md` (Step 5), `skills/research-objective`, `workflows/discuss-objective.md`, `skills/discuss-objective` | RESEARCH.md, CONTEXT.md |
| Execute | `agents/executor.md` (L28, 219-231, 422, 923, 1023-1072), `workflows/execute-objective.md`, `workflows/execute-trd.md`, `workflows/quick.md` | SUMMARY.md (progress checkpoint rewritten per task!), STATE, ROADMAP progress, REQUIREMENTS |
| Verify | `agents/verifier.md` (L297, 553, 565, 657-662, 752-756), `workflows/verify-work.md`, `workflows/diagnose-issues.md`, `workflows/build.md` | VERIFICATION.md, UAT.md, drift/notes appends, todo files for UI debt |
| Bootstrap | `workflows/new-project.md` (20 hits), `workflows/new-milestone.md`, `workflows/complete-milestone.md`, `workflows/transition.md`, `agents/project-researcher.md`, `agents/research-synthesizer.md` (orchestrator writes `research/SUMMARY.md`) | PROJECT, REQUIREMENTS, ROADMAP, MILESTONES, `research/*` |
| Todos/decisions | `workflows/add-todo.md` (L92-124), `workflows/check-todos.md`, `skills/decide`, `skills/todo` | `todos/pending/*.md`, `decisions/pending/*` |
| Codebase | `workflows/map-codebase.md`, `agents/codebase-mapper.md` (writes directly to `.planning/codebase/`) | `codebase/*.md`, `STACK.md` |
| Misc | `workflows/add-objective.md`, `insert-objective.md` (legacy), `remove-objective.md`, `workstreams-*.md`, `skills/gh-sync` (OBJECTIVE.md), `skills/sync-roadmap`, `skills/debug` (`debug/`), `skills/quick` | various |

Two special cases: (a) the executor rewrites SUMMARY.md after EVERY task (a `## Progress` checkpoint). Posting a comment per task would burn the outbox write budget (80/min, 500/h). Recommend: the per-task progress checkpoint stays a LOCAL runtime file (add `*-SUMMARY.progress.md`? no: keep it as a dotfile-style draft outside the cache set) and only the final `summary post` is a verb. (b) `agents/executor.md` and `agents/codebase-mapper.md` say "never write STACK.md yourself"; STACK.md is classified below, not a cache file.

## 2. Edit gate (GWP-03 first half)

### Current structure (`plugins/devflow/hooks/gate-edits.js`)
`shouldGate()` order: tool check, empty path, then line 272 `if (/\/\.planning\//.test(filePath)) return allow 'planning artifact'` (so today NOTHING under `.planning/` is ever gated), `.md` allow, no planningDir noop, outside-project allow, `isDevflowAgent(agentType)` allow, `skillActive` allow, `overrideActive` allow, default deny. `main()` handles `DEVFLOW_SKIP_EDIT_GATE=1` and `gates.editGate = off|warn|strict` before calling it; `warn` converts deny to `ask`.

### Recommended change
Insert the cache check BEFORE line 272 and make it unconditional in store mode:

```js
// hooks/gate-edits.js (sketch). planningMode/classify come from the pure libs; require inside try/catch, fail open.
const hit = storeMode && classifyPlanningPath(relToPlanning(filePath, planningDir)); // {class:'cache'|'generated', verb, hint}
if (hit && (hit.class === 'cache' || hit.class === 'generated')) {
  return { decision: 'deny', reason: `${filePath} is a read-only cache of GitHub... use: ${hit.hint}` };
}
```

Rules:
- The new deny ignores `skillActive` and `isDevflowAgent`, because those are exactly the actors the verbs exist to constrain. It is checked first for planning paths only; non-planning code edits keep today's logic untouched.
- Still honoured, unchanged, because `main()` returns before `shouldGate`: `DEVFLOW_SKIP_EDIT_GATE=1` and `gates.editGate: off`. `warn` yields `ask`. The override phrase (`overrideActive`): recommend honouring it (explicit human intent) but only for the cache deny, via the existing `.edit-override` marker; document it. Do NOT add a new escape.
- Local mode (store off): zero behaviour change; the existing `planning artifact` allow stays. This preserves every case in `gate-edits.test.js` (test "ALLOW: any path matching /.planning/").
- The deny text names the verb per class: TRD to `plan put-trd`; OBJECTIVE to `objective put` / `objective set-status`; SUMMARY to `summary post`; VERIFICATION to `verification post`; CONTEXT/RESEARCH/PROJECT/REQUIREMENTS/codebase/adr/retros and `wiki/*` to `doc put`; ROADMAP/STATE to "generated view, run `gh pull --all`". SC2 needs the TRD message to contain `plan put-trd`.
- Path resolution: the payload `file_path` is absolute; compute the relative path against the NEAREST `.planning` (`planningDir`) and also the main checkout's (`sharedPlanningDir`) so worktree paths classify identically. Resolve symlinks with the existing `realpathDeep`.
- Mode read: add `readStoreMode(planningDir)` next to `readEditGateMode`, by calling `planning-mode.cjs` (hooks already `require('../devflow/bin/lib/...')`, e.g. `guard-no-progress.js`), wrapped to fail open on any error.

### The 47-13 finding (executor Write denied in the main checkout)
Cause found: not a logic bug. The installed plugin cache under `~/.claude/plugins/cache/aocyber/devflow/` holds 2.7.1, 2.10.1, 2.11.0 and `.plugin-version` says 2.11.0, while the repo is 2.12.0. The objective-44 allowance (`isDevflowAgent`, CHANGELOG 2.12.0) is absent from the installed `gate-edits.js` (`grep -c isDevflowAgent` on the 2.11.0 copy returns 0). Hooks run from `${CLAUDE_PLUGIN_ROOT}`, i.e. the installed copy, so the executor was denied by the pre-fix gate and 47-13 worked around it with `skill-active --start`. Confidence MEDIUM-HIGH (installed state verified; I did not replay the denial). Recommendation: 48 should NOT change allowance logic for it. It should (a) add a regression test pinning `agent_type: 'devflow:executor'` + main-checkout code path = allow in the same test file, and (b) note in the objective's USER-GUIDE/CHANGELOG entry that the gate behaviour needs plugin >= 2.12.0 (a `doctor` check on "installed plugin older than repo" already exists as W021, so just cite it).

## 3. `validate` flags Bash writes to the cache (GWP-03 second half)

Git cannot see the cache (ignored) and mtime is unreliable (pull rewrites files). Use content hashes against a verb ledger:

- `gh-cache` already keeps a baseline map `outbox.readCacheIndex(root)` (`rel -> contentHash`), updated by `writeCache` and `recordCacheBaseline` after a completed flush. A file whose hash differs from the baseline is either (a) a verb write whose flush is still pending, or (b) a direct write. The baseline alone cannot tell them apart.
- Add a small ledger `verb-writes.json` beside the cache index (outbox state dir, never in the repo): every verb records `rel -> contentHash` at write time and clears the entry when the flush completes and the baseline is recorded. New module `planning-ledger.cjs`; do not change the cache-index format (47 tests pin it).
- Check (new `validate health` Check 15, code **W055**, advisory, never repaired, same shape as W050-W054; W055-W059 are free): for each file in `gh-cache.listOwnedLocal(root)` plus generated files, flag `hash != baseline && hash != ledger[rel]` as "`<rel>` was changed outside a df-tools verb; run `<verb>` or `gh pull --all --force` to restore". Missing baseline (never pulled) and not in ledger is also flagged. Store mode only; local mode returns "not applicable" with no issue.
- Why this matters beyond hygiene: `handleWikiPush` publishes whatever bytes are in the cache file at flush time, so an unverified Bash edit to a wiki-owned file would be published by the next unrelated flush.
- Pitfall to avoid: do NOT record the baseline at enqueue time. `gh-cache.writeCache` treats `baseline == local hash` as "safe to overwrite from remote", so `gh pull --all` before the flush would revert the new local file to the old remote content. Record the baseline only after a completed flush (this is what `gh.cjs pushedCachePaths` + `recordCacheBaseline` already do). A pending verb write then differs from baseline, pull leaves it alone as `local_modified` (attention, exit 2), and the ledger makes `validate` quiet.
- Optional hardening (not required by GWP-03): a PreToolUse(Bash) heuristic for `>`/`tee`/`sed -i` aimed at cache paths. Heuristic and bypassable; recommend deferring.

## 4. GWP-04: gitignore in store mode

### Classification of everything under `.planning/` (the part the brief left open)
`listOwnedLocal` / PAGE_TABLE only cover PROJECT, REQUIREMENTS, `codebase|adr|retros`, and `objectives/*/{OBJECTIVE,CONTEXT,RESEARCH,TRD,SUMMARY,VERIFICATION}`. This repo's `.planning/` also has `debug/`, `quick/`, `research/`, `decisions/`, `milestones/`, `todos/`, `MILESTONES.md`, `SESSION_PICKUP.md`, `STATE_ARCHIVE.md`, `STACK.md`, `state.json`, `config.json`. Gitignoring the directory wholesale would stop versioning every one of those with no GitHub home. Recommend four classes in `planning-paths.cjs`:

| Class | Members | Gate | Git |
|---|---|---|---|
| `cache` (verb-owned) | owned set above + `wiki/**` | deny, names verb | ignored |
| `generated` | `ROADMAP.md`, `STATE.md` | deny, "generated" | ignored |
| `runtime` | dotfiles, `state.json`, `STATE_ARCHIVE.md`, `SESSION_PICKUP.md`, `evidence/` | allow | ignored |
| `tracked-config` | `config.json`, `STACK.md` | allow | NOT ignored |
| `local-work` | `todos/`, `decisions/`, `debug/`, `quick/`, `research/`, `milestones/`, `MILESTONES.md`, `workstreams/` | allow | see Open Question 1 |

Recommendation for `local-work`: `todos` and `decisions` get verbs (so they become cache-backed issues and move into `cache`); `research/` (project-level research) should get a PAGE_TABLE rule `Research-<Name>` (a small additive change to `gh-wiki.cjs`, in the same wave as the other 47-lib additions); `debug/`, `quick/`, `milestones/`, `MILESTONES.md` stay local and the migration leaves them TRACKED with negation entries, so GWP-04's "runtime + cache" holds without data loss. This is a design call the user may want to confirm.

### Mechanism
- A new `confirm` migration `0010-store-gitignore.cjs` (id next after 0009; `safety: 'confirm'`). Not `auto`: it untracks a tree (`git rm -r --cached`) and is only valid once everything is pushed; `upgrade-project.js` applies only `auto` migrations and reports `confirm` ones as a notice, so it will never run unattended. Detection: mode is `store`, and (some owned/generated/runtime path is tracked, or `.planning/` is not ignored). Apply (only with `--confirm`): refuse unless the outbox journal is empty AND `gh pull --all` produces no `local_modified` AND `listOwnedLocal` files all have baselines (guarantees the content exists on GitHub); then write a managed `.gitignore` block, `git rm -r --cached` the ignored classes, leave working copies. Back up to `~/.claude/devflow/backups/` as the other migrations do. Reuse 0008's helpers: `git check-ignore --no-index`, redirected-git-env scrubbing, the "pathspec commit would re-add" lesson, and its nested `**/.planning/` handling. 0008's entries for runtime dotfiles stay valid and redundant.
- Gitignore shape: `.planning/*` followed by negations `!.planning/config.json`, `!.planning/STACK.md` and one per tracked `local-work` dir. A bare `.planning/` rule would hide `config.json`, so a fresh clone could not even detect store mode (`findPlanningDir`, gate, hooks all key off `.planning/config.json`).
- Interaction with `df-tools commit` (`misc.cjs cmdCommit`, L507-533): it computes `blocked` from `isGitIgnored(cwd, '.planning')`. With `.planning/*` + negations the directory itself is NOT matched by `check-ignore`, so `blocked` is null and `git add .planning/foo` of an ignored file errors ("paths are ignored"). Fix in 48: make the gating per path (`git check-ignore` each requested planning path, drop ignored ones with `skipped_planning`), keeping today's whole-dir behaviour for local mode. If this is not fixed, every existing `commit "docs(...)" --files .planning/...` line in workflows breaks in store mode. With the fix, those prose commit lines are harmless no-ops in store mode and need not all be removed (they still matter for tracked classes).
- Interaction with `upgrade-project.js`: it background-commits changed files; migration 0010 never runs there, but its notice should say "run `df-tools upgrade --apply --only 0010 --confirm`". Doctor/validate should report W040-style "store mode on but `.planning/` still tracked".
- Worktrees: in store mode `.planning/` is ignored, so a worktree checkout has NO cache and no `.skill-active`. `exec-context worktree` gives each executor its own tree. Verbs and readers must resolve the MAIN checkout's `.planning/` (use the `repo_root`/`is_worktree` logic in `exec-context.cjs`, or `git rev-parse --git-common-dir`). `gh-outbox.repoKey` hashes `realpath(root)`, so running a verb with `cwd` inside a worktree would open a different, empty journal. The verb layer must normalise the root before touching any store.

## 5. GWP-05 job-checker

- Scope budget machinery is complete: `gh-trd.budget(body)` (`ok` below 40,000; `warn` 40,000-60,000 inclusive; `over` above 60,000, measured on the ENCODED body including the two header lines, so use `encodeTrdBody` not `file.length`), `checkObjectiveBudgets(trds)` (names every offender, also the 100-TRD cap). `planPush` already refuses with `refused:'budget'`.
- Where to enforce: (1) `plan put-trd` (store: refuse over 60,000, warn 40,000+; local: warn only, because non-GitHub projects have no 65,536 cap and this repo's own `04-01` is 69K); (2) a deterministic `trd_budget` check added to `lib/trd-pre-check.cjs` (`df-tools verify trd-pre <objective>`, already the job-checker's cheap preflight, pure, under 2 s; it already has a `scope_sanity` check to extend); (3) job-checker.md new "Dimension 8: TRD Size and Bulk" that reads the `trd_budget` result (severity blocker in store mode, warning in local); (4) planner `<scope_estimation>` gets the 40K/60K numbers and the instruction to split rather than trim.
- Linked-bulk rule: **the proposal never names it.** The only source is proposal lines 67-69: "Fixtures, sample data and long listings go in the repo or wiki and are linked." Treat as: bulk content inside a TRD body must be a link (repo path or wiki page), not inline. Proposed detector (new pure `lib/trd-bulk.cjs`, shared by `verify trd-pre` and `plan put-trd`): flag any fenced block over 8,000 chars, and any TRD over 40,000 chars whose fenced content exceeds 40% of it. Calibrated on this repo's 285 TRDs: median fenced block 790 chars, p90 5,355, p99 12,315; 42 TRDs have a block over 4,000 and 8 over 8,000; the over-60K outlier `04-01` has a 13,165-char block. Do not match prose such as "inline fixtures" (it appears in 40-02, 40-04 on purpose). Severity: warning, escalating to blocker only when the TRD is also at or over the 40K target. Confidence LOW on the exact thresholds: ask the user (Open Question 3).

## 6. Test design

### SC1 audit test (`plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs`)
Model: `doc-refs.repo.test.cjs` (scan set from the repo's own text, `EXEMPT` table with reasons >= 20 chars and each matching a real path, sensitivity controls, legacy workflows exempt by `status: legacy` frontmatter) plus `hooks/planning-writes.audit.test.js` (pinned allowlist, failure names file:line).
- Scan set: `skills/*/SKILL.md`, `devflow/workflows/*.md` (skip `status: legacy`), `agents/*.md`, `devflow/templates/*.md`.
- Detector `scanWrites(text)`: a write directive = line (or fenced command) where a write verb (`write|create|update|append|save|edit|fill`, `Write(`, `cat >`, `tee`, `sed -i`, `frontmatter set|merge`, `template fill` targeting a cache/generated path) co-occurs with an artifact name from the classifier (TRD, SUMMARY, VERIFICATION, RESEARCH, CONTEXT, OBJECTIVE, PROJECT, REQUIREMENTS, ROADMAP, STATE, `codebase/`, `todos/pending`). It passes when a `df-tools <verb>` invocation (`plan put-trd`, `summary post`, `verification post`, `doc put`, `objective put|set-status`, `decision open|answer`, `todo add`) appears within +/-3 lines, or the line is in the pinned EXEMPT list (read-only mentions, "never write STACK.md", local-work classes).
- Ratchet: land the test first with `BASELINE` = per-file violation counts (the current state, so the suite stays green), assert `actual[file] <= BASELINE[file]` and that stale baseline entries are removed. Each prose TRD lowers its files' baseline in the same commit; the final TRD asserts `BASELINE` is empty. This is what lets prose migration be parallel and still strict-TDD.
- Sensitivity controls: a synthetic `Write the file .planning/objectives/01-x/01-01-TRD.md` yields 1 finding; the same with a `plan put-trd` call within 3 lines yields 0; the scanner finds >= 1 violation in a copy of today's `agents/planner.md` L996.
- Also assert the classifier is total: every path the gate denies has a verb string that exists in the df-tools dispatch (so a deny message never names a verb that does not exist) and every verb named in prose is a real `df-tools` subcommand (reuse `doc-refs`-style resolution against `help.cjs` entries).
- Add the new modules to `gh-seam.repo.test.cjs` `GUARDED` (and its "never calls ghWrite" list). New verb modules must not spawn `gh` or `git` themselves; they go through `gh-client`/`gh-wiki`.

### SC2 gate test (`hooks/gate-edits.test.js`)
Pure `shouldGate` cases with `storeMode: true`: Write to `.../objectives/07-x/07-01-x-TRD.md` is deny and the reason contains `plan put-trd`, with skillActive true, with `agentType: 'devflow:executor'`, with overrideActive false; same path with store off is allow; `.planning/config.json` and `.planning/.skill-active` allow in store mode; `editGate: warn` yields `ask`. One spawn-level test feeding a real PreToolUse JSON through `main()` (reuse `realPreToolUsePayload`) with a temp project whose config has `github: {enabled:true, store:true}`.

### SC3 fixture e2e (`planning-verbs.e2e.test.cjs`)
- `makeStoreProject({store:true})` + `createFakeGitHub(project.fakeOptions)` + `gh._setRunGh(fake.runGh)` + `hermeticEnv()` (it sets git isolation). The fixture is NOT a git repo, so the test runs `git init`, writes the gitignore through migration 0010 (call `apply` with `--confirm` semantics), keeps `.planning/config.json` tracked, makes the initial commit, and a fake clock.
- Script the three phases through the public verbs only: plan (`objective put`, `plan put-trd` x3, `doc put` CONTEXT/RESEARCH), execute (a code file is edited and committed with `df-tools commit`; `summary post` per TRD; `objective set-status`), verify (`verification post`, `objective set-status complete`). Assert `git status --porcelain` lists nothing except the one code file before its commit and is empty after; the fake GitHub holds 3 TRD issues, summary comments, the sticky verification comment and the wiki pages; `gh pull --all` into a deleted cache reproduces the cache byte-identically; `validate` reports no W055.
- Mode parity test: the SAME script with `store:false` writes the same local files that `df-tools` produced before (golden compare against the verbs' local write path), zero gh calls, and `.planning/` still tracked and dirty-then-committed as today. This is the load-bearing proof for non-GitHub projects.
- Include a negative: a Bash-style direct write to a TRD cache file makes `validate` emit W055 naming the file and verb; offline put-trd queues, `outbox flush` exits 3.

## 7. Mode switch proposal (answers the critical design question)

**Where it lives:** `plugins/devflow/devflow/bin/lib/planning-mode.cjs`, pure, fs-only, no gh/git, importable from hooks. Reads `.planning/config.json` (resolved against the MAIN checkout root).

```js
// planning-mode.cjs
function planningMode(root) {
  const gh = readGithubConfig(root);              // same JSON read as gh-outbox.readGithubConfig
  const store = !!gh && gh.enabled === true && gh.store === true;  // strict booleans, like gh.storeEnabled
  return { mode: store ? 'store' : 'local', reason: store ? 'github.enabled && github.store' : 'github.store is not true' };
}
```

Single call sites: every verb (`planning-verbs.cjs`), `gate-edits.js`, `validate` Check 15, migration 0010 detection, `objective/state/roadmap` store-mode behaviour in 1b. No other code reads `github.store` for planning decisions (`gh.cjs storeEnabled` stays for the sync path). Verb shape: `writeThrough(root, {rel, text, enqueue})`: local = validate + atomic write (`sync-state.atomicWrite`, same bytes, same path) + optional budget WARNING; store = validate (budget refuse) + atomic write to cache + ledger record + `enqueue()` + flush unless `--no-flush` (reuse `gh-store-cli.queuedResult`; export it) + baseline record after a completed flush. Same flags in both modes (`--raw`, `--no-flush` is a no-op locally). Exit codes: reuse `EXIT` from `gh-store-cli.cjs` in store mode; local mode always 0/1. A project with `github.enabled` but `store` unset behaves as `local` for planning writes, so objective 46 sync behaviour is unchanged.

Known remaining direct writes in store mode from 47 (documented in `gh.cjs` L1228-1236 as "deferred to objective 48"): objective-issue create, label/milestone bootstraps, sticky state comment, Project v2 fields. They are idempotent find-or-create operations driven by `gh sync`; `objective put` should call `gh.syncObjective(id, root)` for them rather than reimplement. Decide in planning whether 48 outbox-ifies them or leaves them (recommend: leave, note in docs; moving them is not needed for any GWP criterion).

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---|---|---|---|
| TRD body/budget | own length check | `gh-trd.encodeTrdBody` + `budget` + `checkObjectiveBudgets` | limit applies to the encoded body incl. header, counts JS `.length`, names every offender |
| Cache-path to wiki page | regex per path | `gh-wiki.pageForCachePath` / `PAGE_TABLE` | one table; adding a class there updates flush, pull, gate |
| Enqueue/flush/exit codes | custom queue | `gh-outbox.enqueue` + `gh-store-cli.queuedResult` + `gh-outbox-flush.flush` | pacing, backoff, idempotent keys, halt-on-remote-edit |
| Atomic writes | `fs.writeFileSync` | `sync-state.atomicWrite` | already what `gh-cache` and `gh-wiki` use |
| Gitignore/untrack | string-matching `.gitignore` | 0008's `git check-ignore --no-index` + `managed-block.cjs` patterns | decided lessons (42-14 D5) |
| Cache baseline | new hash store | `gh-cache.recordCacheBaseline` + `outbox.readCacheIndex` | pull logic already depends on these semantics |
| Test GitHub | stubs per test | `__fixtures__/gh-fake.cjs` via `gh._setRunGh`, `hermeticEnv()` | already hermetic and stateful |

## Common Pitfalls

1. **Baseline recorded too early** (section 3): pull reverts unflushed verb writes. Record baseline only post-flush; use the ledger for pending.
2. **Worktree root** (section 4): verbs run from an executor worktree open a different journal (`repoKey` = realpath hash) and see no cache. Normalise to the main checkout first.
3. **`commit` with ignored paths**: `.planning/*` + negations defeats the whole-dir ignore probe; fix `cmdCommit` per path or every workflow commit line breaks in store mode.
4. **Per-task SUMMARY rewrite** (executor): one comment per task blows the write budget; keep the progress checkpoint local, post once.
5. **Frozen TRDs**: `plan put-trd` in store mode must call `ghTrd.assertEditable` (via `gh-comments.readTrdState`), refusing and pointing at `gh trd scope`. `readTrdState` needs connectivity (known 47 gap: `gh trd` verbs exit 1 offline). Offline: warn and proceed (freeze is wired at execute start by objective 49, so before that nothing is frozen).
6. **Objective with no issue yet**: `pushHierarchy` returns "has no issue yet; run gh sync" for a new objective. `objective put` must find-or-create first (`gh.syncObjective`), and `plan put-trd` should only write cache + validate and then call `pushHierarchy` (idempotent, coalescing by op key); with N TRDs called in sequence, dependency edges to not-yet-written siblings generate warnings, so provide `plan put-trd ... --no-push` and a final `plan push <obj>`, or have the planner call put-trd for all TRDs and let the last call push. Decide in planning (recommend `--no-push` + explicit `plan push`).
7. **Prose with `2>/dev/null`**: objective 46 defect 3 was a swallowed error. Verbs must exit non-zero with a message on any failure, and prose must not redirect stderr away.
8. **Doc counts drift**: CLAUDE.md states "34 skills / 12 agents"; adding verbs touches `help.cjs` and USER-GUIDE; `doc-refs.repo.test.cjs` fails on stale command references, so update `DEPRECATION_MAP`-adjacent docs and `help.cjs` in the same TRD as the dispatch.
9. **`frontmatter set/merge` and `template fill`** still write cache files in store mode; either route or refuse (1b), else they are the obvious bypass.
10. **Executor and verifier `allowed-tools`** include Write; the gate is the backstop but the prompts must be rewritten, or agents will hit denials mid-run.

## State of the Art

Not applicable (internal tooling). Current conventions to follow: migrations are detection-based, idempotent, backed up (`lib/migrations/NNNN-*.cjs`); `validate` warnings are advisory (W0xx); doctor checks live in `lib/doctor-checks/NN-<id>.cjs` (add a store-mode check there too if cheap: tracked-but-should-be-ignored).

## Open Questions

1. **Which `.planning/` classes stay tracked in store mode?** (`debug/`, `quick/`, `milestones/`, `MILESTONES.md`, `STACK.md`, `research/`.) Recommendation in section 4: negation-track config, STACK.md, debug, quick, milestones; wiki-ify `research/`; todos/decisions become issues. OBJECTIVE says "repo keeps only config.json if needed", which would leave those untracked and unsynced. Needs a user call before planning; default to the recommendation.
2. **STATE.md decisions/blockers/metrics/session in store mode.** `renderState` carries none of them. Recommend `state.json` only (per-clone, lost on a fresh clone), STATE.md untouched. Alternative: `state add-decision` maps to a closed Decision issue. Not required by any GWP criterion.
3. **Linked-bulk thresholds** (section 5): 8,000-char fenced block, 40% fenced share at >= 40K. LOW confidence; the proposal defines no numbers.
4. **`objective set-status` vocabulary.** `patch-issue` supports `type|state|state_reason|labels_add` only; there is no label removal and Project v2 Status writes are direct (not outbox). Recommend v1 statuses `complete` (closed/completed), `cancelled` (closed/not_planned), `reopened` (open), plus non-terminal statuses stored in OBJECTIVE.md frontmatter and the Project Status field via the existing direct path. Confirm which statuses the verifier/executor actually need.
5. **Decision answers**: recommend `upsert-comment {kind:'answer'}` on the decision issue + `patch-issue {state:'closed'}`. Need to confirm `handleUpsertComment` resolves a decision id (`<trd>-d<k>`) to an issue number (mapping keys decisions under `trds`); verify in the first TDD test.
6. **Todo issue identity**: `ROLES = ['trd','decision']` in `gh-outbox.cjs`; a `todo` role needs an id scheme (`todo-<slug>`?), a mapping entry, a flusher branch, and a `materialize` rule so todos reappear in the cache for `check-todos`. This is the largest additive change to 47 code; if it threatens the schedule, `todo add` can ship as local-only with the other `local-work` classes (and the open question above).
7. **Installed plugin lag** (section 2) means store mode needs plugin >= 2.12.0 for the agent allowance; confirm release cadence before turning the cache deny on.

## Suggested waves (disjoint files per wave, strict TDD in every TRD)

| Wave | TRD | Files (disjoint) | Notes |
|---|---|---|---|
| 1 | 48-01 mode + path classifier + ledger | `planning-mode.cjs`, `planning-paths.cjs`, `planning-ledger.cjs` + tests | pure; everything else depends on it |
| 1 | 48-02 47-lib additions | `gh-outbox.cjs`, `gh-outbox-flush.cjs`, `gh-hierarchy.cjs` (todo role, decision answer path, status op), `gh-wiki.cjs` (`research/` rule) + tests | keep 47's 1107 gh-* tests green |
| 1 | 48-03 budget + bulk checker | `trd-bulk.cjs`, `trd-pre-check.cjs` + tests | pure; serves GWP-05 and put-trd |
| 1 | 48-04 SC1 audit ratchet (baseline = today) | `planning-writes.repo.test.cjs` | lands green with a full baseline |
| 2 | 48-05 verb library | `planning-verbs.cjs` (+ test), extract `queuedResult` | needs 01, 02, 03 |
| 2 | 48-06 edit gate | `hooks/gate-edits.js`, `gate-edits.test.js` | needs 01 only; SC2 |
| 2 | 48-07 validate W055 + doctor check | `validate.cjs`, `doctor-checks/NN-*.cjs` | needs 01 (ledger) |
| 2 | 48-08 migration 0010 + commit per-path fix | `migrations/0010-*.cjs`, `misc.cjs` | needs 01; confirm-type |
| 3 | 48-09 CLI wiring | `planning-verbs-cli.cjs`, `df-tools.cjs` dispatch, `help.cjs`, `gh-seam.repo.test.cjs` GUARDED | `df-tools.cjs` is a hotspot, keep serial; also store-mode behaviour of `state/roadmap/objective/frontmatter/template` (1b) |
| 4 | 48-10 prose: plan and research | planner, roadmapper, objective-researcher, job-checker (Dimension 8), plan-objective, research-objective, discuss, plan-milestone-gaps | lowers audit baseline for these files |
| 4 | 48-11 prose: execute and verify | executor, verifier, execute-objective, execute-trd, verify-work, diagnose-issues, quick, transition, build | |
| 4 | 48-12 prose: bootstrap and misc | new-project, new-milestone, complete-milestone, map-codebase, add-todo, decide, adopt, check-todos, project-researcher, research-synthesizer, codebase-mapper, workstreams | |
| 5 | 48-13 SC3 e2e + parity + docs | `planning-verbs.e2e.test.cjs`, CLAUDE.md, CHANGELOG, USER-GUIDE, proposal status; audit baseline to empty; `npm test` | |

Wave 4 TRDs touch disjoint prose files, so they run in parallel; each commit lowers `BASELINE` for exactly its files.

## Sources

### Primary (HIGH confidence, read in this repo)
- `docs/PROPOSAL-github-system-of-record.md`; `.planning/objectives/48-planning-write-path-migration/OBJECTIVE.md`; `47-VERIFICATION.md`, `47-13-SUMMARY.md`
- `bin/lib/`: `gh-store-cli.cjs`, `gh-hierarchy.cjs` (planPush, buildOps, pushHierarchy, openDecision), `gh-comments.cjs`, `gh-outbox.cjs` (OP_KINDS, ROLES, repoKey), `gh-outbox-flush.cjs` (handleWikiPush, HANDLERS), `gh-wiki.cjs` (PAGE_TABLE, writePage), `gh-cache.cjs` (writeCache, recordCacheBaseline, listOwnedLocal, materialize), `gh-trd.cjs` (budget), `gh.cjs` (storeEnabled, L1228-1236), `misc.cjs` (cmdCommit), `validate.cjs`, `trd-pre-check.cjs`, `migrations/0008`, `0009`, `upgrade.cjs`
- `plugins/devflow/hooks/gate-edits.js`, `gate-edits.test.js`, `planning-writes.audit.test.js`, `upgrade-project.js`
- `~/.claude/plugins/cache/aocyber/devflow/` (installed versions) and `CHANGELOG.md` 2.12.0 entry (objective 44 agent_type allowance)
- Own measurement of this repo's 285 TRD/PLAN files (length and fenced-block distribution)

### Tertiary (LOW confidence)
- The 8,000-char / 40% bulk thresholds are my calibration, not a documented rule.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, all primitives exist and were read.
- Architecture (mode switch, gate placement, ledger): MEDIUM, design choices consistent with 47 internals, not yet prototyped.
- Pitfalls: HIGH for 1-3 (read directly from code), MEDIUM for 5-6.
- Linked-bulk rule: LOW.

**Research date:** 2026-10-01
**Valid until:** 2026-10-15 (47's modules are still moving; re-check `gh-outbox.cjs` ROLES/OP_KINDS before planning 48-02)
