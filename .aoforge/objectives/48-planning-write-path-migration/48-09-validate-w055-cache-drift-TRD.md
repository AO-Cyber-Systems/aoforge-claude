---
objective: 48-planning-write-path-migration
trd: "09"
type: tdd
wave: 2
depends_on: ["48-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/planning-drift.cjs
  - plugins/devflow/devflow/bin/lib/planning-drift.test.cjs
  - plugins/devflow/devflow/bin/lib/validate.cjs
  - plugins/devflow/devflow/bin/lib/validate.test.cjs
autonomous: true
requirements: [GWP-03]
must_haves:
  truths:
    - "In store mode `validate health` reports W055 for each cache or generated file whose content hash matches neither its cache baseline nor its verb-ledger entry, naming the file and the verb to use (or `gh pull --all --force` to restore) (D-15)"
    - "A file written by a verb whose flush is still pending (ledger hash matches) is NOT flagged; a file freshly pulled (baseline matches) is NOT flagged"
    - "A cache file that has neither a baseline nor a ledger entry is flagged (never pulled, never written by a verb)"
    - "Store off (local mode): Check 15 adds no issue at all and reads no outbox state"
    - "W055 is advisory and never repairable; a check that cannot run reports W054-style `W056 planning-drift-check-failed` instead of being silent"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/planning-drift.cjs
      provides: "findCacheDrift(root, {readIndex, readLedger}) -> {applicable, drift:[{rel, verb, reason}]}"
    - path: plugins/devflow/devflow/bin/lib/validate.cjs
      provides: "Check 15: planning cache drift (W055, W056)"
  key_links:
    - "Reads 47's cache index (`gh-outbox.readCacheIndex`) and 48-01's ledger (`planning-ledger.readLedger`); classifies with `planning-paths`; mode from `planning-mode`"
---

# TRD 48-09: `validate` flags Bash writes to the cache — W055 (GWP-03 second half)

<objective>
Git cannot see the cache in store mode and mtimes are unreliable, so detect direct writes by content: a cached planning file whose bytes
match neither the last pulled/flushed baseline nor a pending verb write was changed outside the verbs. Report it as W055 in
`validate health`.

Purpose: GWP-03 (Bash writes flagged by validate), D-15. Output: `planning-drift.cjs` + Check 15 in `validate.cjs`, with tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: characterization first — pin today's `validate health --raw` issue codes for a local-mode temp project, so Check 15's
  "not applicable in local mode" is proven additive. RED before GREEN.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- `planning-drift.cjs` takes its readers as injectable options (defaults: `gh-outbox.readCacheIndex`, `planning-ledger.readLedger`); no gh, no git.
- Tests: temp project + `hermeticEnv()` (outbox state under a temp `DEVFLOW_OUTBOX_DIR`); baselines written with `gh-cache.recordCacheBaseline`
  or the index writer the 47 tests use; ledger entries with `planning-ledger.record`. Never real `~/.claude`, never port 8080.

## Decisions

D-15. Settled here:

- **Scope**: files from `planningPaths.listByClass(planningDir)` with class `cache` (minus `wiki/**`, whose truth is the wiki clone's git) or
  `generated`. Mode from `planningMode(root).mode`; `local` → `{applicable:false, drift:[]}`.
- **Rule** per file: `h = contentHash(text)`; flag when `h !== index[rel]` and `!ledger.matches(rel, h)`. Reasons: `no-baseline` (no index entry,
  no ledger entry), `changed` (index entry differs). Generated files: also flag when the text lacks `GENERATED_HEADER` (reason `hand-edited`).
- **Message**: `W055 <rel> was changed outside a df-tools verb (<reason>); use \`df-tools <verb>\` to publish it, or \`df-tools gh pull --all --force\`
  to restore GitHub's version`; for generated files the verb text is "regenerate with `df-tools gh pull --all`". `fix` = same text. `repairable:false`.
- **Failure**: any exception → `W056 planning-drift-check-failed: <message>` with fix "Run `df-tools validate health --raw` after `gh pull --all`".
- **Cost**: hash only files that exist; cap at 5,000 files with a W056 note beyond that.

## Test list

planning-drift (pure, injected readers)
1. Local mode config → `{applicable:false, drift:[]}` and the injected readers are never called.
2. Store mode; TRD file with index hash equal → no drift.
3. Store mode; TRD file changed after baseline, no ledger → drift `{rel, verb:'plan put-trd', reason:'changed'}`.
4. Same file changed by a verb (ledger hash equals current) → no drift; ledger hash stale (file changed again) → drift.
5. Cache file with no index and no ledger entry → drift `no-baseline`.
6. ROADMAP.md with header and matching baseline → none; ROADMAP.md without `GENERATED_HEADER` → drift `hand-edited`, verb text mentions `gh pull --all`.
7. Runtime (`state.json`, `.skill-active`) and tracked-config (`config.json`, `STACK.md`) files never flagged; `wiki/Home.md` never flagged.
8. Todo/debug/quick entity files are checked like other cache files (verb `todo add` / `debug put` / `quick put`).

validate Check 15
9. Characterization: local-mode temp project → issue codes identical to the pinned list; no W055/W056.
10. Store-mode temp project with one drifted TRD → `validate health --raw` warnings include one W055 naming the rel and `plan put-trd`, `repairable:false`.
11. `--repair` does not touch the drifted file (bytes unchanged).
12. Reader throws (inject via a module-level `_setDriftReaders` seam in planning-drift) → one W056, other checks still run.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: planning-drift.cjs (tests 1-8)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-drift.cjs, plugins/devflow/devflow/bin/lib/planning-drift.test.cjs</files>
  <action>
RED: tests 1-8 with hand-built temp trees and injected `readIndex`/`readLedger` stubs (plain objects). Commit `test(48-09): cache drift detection`.
GREEN: implement `findCacheDrift(root, opts)` per the rule above; export `_setDriftReaders` for validate tests. Commit `feat(48-09): cache drift detection`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-drift.test.cjs</verify>
  <done>Tests 1-8 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Check 15 in validate health — W055/W056 (tests 9-12)</name>
  <files>plugins/devflow/devflow/bin/lib/validate.cjs, plugins/devflow/devflow/bin/lib/validate.test.cjs</files>
  <action>
Commit test 9 alone (characterization). RED: tests 10-12; commit `test(48-09): validate W055`.
GREEN: after Check 14 add `// ─── Check 15: Planning cache drift (objective 48) ───` calling `findCacheDrift(cwd)` and `addIssue('warning', 'W055', ...)`
per drift, try/catch → W056. Update the code list in the module header if there is one and any `W05x` code table in `validate.cjs`/`help.cjs`
that this TRD owns (only validate.cjs). Commit `feat(48-09): validate health reports W055 cache drift`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/validate.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs</verify>
  <done>Tests 9-12 pass; doctor's validate-health check suite green (W055 is a plain warning, not in DEFERRED).</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `validate.cjs` L686-704 Check 14 (advisory W050-W054 pattern with a W054 "check failed" fallback) — copy its shape.
- `gh-outbox.cjs` L915-919 `readJsonFile(repoFile(root, suffix))` — the cache index store; `readCacheIndex(root)` returns `{rel: hash}`.
- 48-RESEARCH section 3: baseline is recorded only after a completed flush; the ledger covers pending verb writes.
</codebase_examples>
<anti_patterns>
- Using mtime or `git status`: pull rewrites files and the cache is ignored.
- Repairing W055 automatically: the right action depends on intent (publish vs restore); keep it advisory.
</anti_patterns>
<error_recovery>
- If `doctor-checks/22-validate-health.cjs` treats any new warning as a severity bump that breaks its tests, check its DEFERRED list semantics and report in the SUMMARY; do not edit doctor files here.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/planning-drift.test.cjs plugins/devflow/devflow/bin/lib/validate.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/doctor-checks/*.test.cjs plugins/devflow/devflow/bin/lib/doc-staleness.test.cjs</regression>
</validation_gates>

<verification>
- `node plugins/devflow/devflow/bin/df-tools.cjs validate health --raw` in this repo (store off) shows no W055/W056.
</verification>

<success_criteria>
In store mode, a cache file edited with Bash shows up in `validate health` with the verb that should have been used; nothing changes for local projects.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-09-SUMMARY.md`
</output>
