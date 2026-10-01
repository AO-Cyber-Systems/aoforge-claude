---
objective: 50-github-enforcement-and-setup
trd: "04"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-health.cjs
  - plugins/devflow/devflow/bin/lib/gh-health.test.cjs
autonomous: true
requirements: [GEN-03]
must_haves:
  truths:
    - "`collectStoreHealth(root)` in local mode returns `{applicable:false, findings:[]}` without reading the outbox, the mapping or calling gh"
    - "In store mode it reports unsynced writes (pending, blocked, halted, recovered journal) as W057 findings"
    - "It reports missing links (a TRD file with no mapped issue, an objective with TRDs but no objective issue, a `prs` entry with no PR number) as W058"
    - "It reports orphans (a mapped TRD whose file is gone, a `prs` entry for an objective with no directory) as W059"
    - "It reports frozen-body drift (a frozen TRD's local text no longer encodes to the recorded body hash) as W060"
    - "It never calls GitHub (gh seam that throws on any call stays silent) and any internal error becomes one W061 finding, never a throw"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-health.cjs
      provides: "collectStoreHealth(root, opts) -> {applicable, findings:[{code, message, fix, objective?, id?}]}; CODES"
  key_links:
    - "Consumed by validate Check 16 and doctor check 25 in 50-07"
---

# TRD 50-04: store-mode health collector (GEN-03, pure half)

<objective>
One offline function that answers "what does this store-mode project have that GitHub does not know, or disagrees about?" from local
state only: the outbox journal, the sync bases, the mapping and the cache files. Output: `gh-health.cjs` with W057-W061 findings that
validate and doctor (50-07) render.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(50-04): ...`), then implementation (`feat(50-04): ...`).
- Offline only: no `gh`, no network, no git writes. Tests install a gh seam (`gh-client._setRunGh`) that throws, and set
  `DEVFLOW_OUTBOX_DIR`, `DEVFLOW_GH_CACHE_DIR` to temp dirs. Build store projects with `makeStoreProject` (gh-store-fixtures.cjs L304).
- Store mode check first: `planningMode.planningMode(root).mode !== STORE` returns before anything else is read (the pattern in
  `planning-drift.findCacheDrift` L159-161).

## Decisions

- **Codes** (verified free: W057+ unused): W057 unsynced writes; W058 missing links; W059 orphans; W060 frozen-body drift; W061 the
  health check itself failed (W056-style, never silent).
- **Offline orphans.** The GitHub-side orphan scan (`gh orphans`, 47) needs the network, so health reports the offline half: mapping
  entries with no local file/dir. Every W059 `fix` names `df-tools gh orphans <objective>` for the online confirmation.
- **Frozen drift.** A TRD is frozen when its sync base (`outbox.getBase(root, id)`) has `frozen:true`. Drift = the cache TRD file, encoded
  with `gh-trd.encodeTrdBody({id, file, text})` and hashed with `gh-trd.contentHash`, differs from `base.body_hash`. Confirm the hash
  convention against how `gh-outbox-flush` computes `body_hash` (`baseFromIssue` L366) before relying on it; if TRD issue bodies carry
  more than the codec output, compare via `trd.normalise` of the decoded body instead and record which in the SUMMARY. Fix text: "a frozen
  TRD changes only through a scope comment: `df-tools gh trd scope ...`; restore the file with `df-tools gh pull --all --force`".
- **Unsynced.** From `outbox.status(root)`: `pending + blocked > 0` → one W057 with counts and fix `df-tools gh outbox flush`; `halted` →
  a W057 naming the halt reason and `df-tools gh outbox resolve <seq> ...`; `recovered` → a W057 naming the corrupt journal file.
- Findings are data; this module never prints, never exits, never repairs.

## Test list

1. Local mode project (store off) → `{applicable:false, findings:[]}`; the throwing gh seam is never hit; outbox dir untouched.
2. Store mode, empty outbox, consistent mapping → `{applicable:true, findings:[]}`.
3. Two pending ops → one W057 "2 pending"; a halted journal → W057 naming the reason; a `.corrupt-*` journal → W057 naming it.
4. TRD file `50-03-x-TRD.md` with no `trds['50-03']` → W058; objective dir with TRDs and no objective entry → W058; `prs[50]` with
   no `number` → W058.
5. `trds['50-09']` mapped, no file → W059 with `gh orphans 50` in the fix; `prs[77]` with no objective 77 dir → W059.
6. Frozen base for 50-02 with the matching hash → no finding; edit the file → W060.
7. Unreadable mapping (invalid JSON) → one W061, no throw; the other checks that do not need the mapping still run.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: mode guard, unsynced writes and links (tests 1-4, 7)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-health.cjs, plugins/devflow/devflow/bin/lib/gh-health.test.cjs</files>
  <action>
RED: tests 1-4, 7; commit `test(50-04): store health collector - unsynced writes and links`.
GREEN: `collectStoreHealth(root, opts = {})` with sections run independently inside try/catch (one failure → W061 for that section).
Use `gh-hierarchy.readObjectiveTrds` (L121) for local TRDs per objective dir, `ghMapping.readMappingV3WithReport`, `getTrd`, `getEntry`,
`listPrs`. Commit `feat(50-04): offline store health - unsynced writes and missing links`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-health.test.cjs</verify>
  <done>Tests 1-4 and 7 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: orphans and frozen-body drift (tests 5-6)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-health.cjs, plugins/devflow/devflow/bin/lib/gh-health.test.cjs</files>
  <action>
RED: tests 5-6 (seed a frozen base with `outbox.setBase(root, '50-02', {..., frozen:true, body_hash})`); commit
`test(50-04): store health - orphans and frozen drift`.
GREEN: the two sections. Commit `feat(50-04): offline store health - orphans and frozen-body drift`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-health.test.cjs</verify>
  <done>Tests 5-6 pass.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `planning-drift.cjs` `findCacheDrift` L159 (store guard, notes → never silent).
- `gh-outbox.cjs` `status(projectRoot, opts)` L896, `getBase` L1093, `setBase` L1113.
- `gh-trd.cjs` `encodeTrdBody` L161, `contentHash` L53, `normalise` L42.
- `gh-hierarchy.cjs` `readObjectiveTrds` L121; `gh-mapping.cjs` `getTrd`, `getEntry`, `listPrs`, `toTrdId`.
- `__fixtures__/gh-store-fixtures.cjs` `makeStoreProject` L304, `hermeticEnv` L399.
</codebase_examples>
<anti_patterns>
- `gh-hierarchy.reportOrphans` here (it calls GitHub).
- Throwing out of `collectStoreHealth` (validate must never crash on a bad journal).
</anti_patterns>
<error_recovery>
- If `readObjectiveTrds` warns on non-TRD files, pass a `warnings` array and ignore it; do not surface parse warnings as findings.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-health.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/planning-drift.test.cjs</regression>
</validation_gates>

<verification>
- Local-mode test (1) asserts zero gh calls and no reads of the outbox dir.
</verification>

<success_criteria>
Store-mode sync problems are visible offline as coded findings; local mode is untouched.
</success_criteria>

<output>
After completion, create `.planning/objectives/50-github-enforcement-and-setup/50-04-SUMMARY.md`
</output>
