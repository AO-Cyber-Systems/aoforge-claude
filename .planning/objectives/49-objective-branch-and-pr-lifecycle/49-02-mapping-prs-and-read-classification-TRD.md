---
objective: 49-objective-branch-and-pr-lifecycle
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-mapping.cjs
  - plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-client.cjs
  - plugins/devflow/devflow/bin/lib/gh-client.test.cjs
autonomous: true
requirements: [GPR-01, GPR-04]
must_haves:
  truths:
    - "The v3 mapping has a top-level `prs` map keyed by objective id: `{branch, base, number, node_id, url, wiki_base_sha, merged_at, reconciled_at}`; `getPr`/`setPr` read and merge-patch it"
    - "`prs` is serialised only when non-empty, so every existing mapping file round-trips byte for byte"
    - "`setPr` keys through `toObjectiveId` (decimal ids such as `7.1` work, no `parseInt`); objective entries stay three fields (PR state never lands on `objectives[id]`)"
    - "`isWriteArgs(['issue','develop','--list',...])` and `-l` are reads; `issue develop` without them stays a write; `pr view|list|status|diff|checks` are reads; `api graphql` with a `query` (no `mutation`) is a read"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-mapping.cjs
      provides: "KNOWN_TOP_LEVEL + `prs`, serialize ordering, getPr/setPr/listPrs"
    - path: plugins/devflow/devflow/bin/lib/gh-client.cjs
      provides: "read classification for `issue develop --list`"
  key_links:
    - "Consumed by 49-05 (upsert-pr stores number/node_id), 49-07 (commit trailer reads trds/objectives), 49-08 (init reads prs), 49-09 (start writes branch/base/wiki_base_sha), 49-11/49-12"
---

# TRD 49-02: Mapping `prs` map and gh-client read classification

<objective>
Give branch and PR state a home in the v3 mapping without disturbing existing files, and stop gh-client from pacing and budgeting the
one `gh` read objective 49 might issue as a write.

Purpose: storage for GPR-01/GPR-04 lifecycle state; Pitfall 4 (objective entries are normalised to three fields) and Pitfall 6.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(49-02): ...`), then implementation (`feat(49-02): ...`).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Byte stability is the contract: an existing mapping file (no `prs`) must serialise identically. Pin it with a fixture string test.
- No `parseInt(` of ids (seam-guard test 18). Never real GitHub or `~/.claude`; never port 8080.

## Decisions

- **Top-level `prs`, not `objectives[id]` fields**: `readLegacyEntry` (L193) and `setEntry` (L491) normalise objective entries to exactly
  three fields, so PR fields there would be silently dropped. A separate map also keeps PR state independent of the objective issue.
- **Serialisation order**: `prs` is emitted after `entities` (or where `entities` would be) and only when it has at least one key.
- **Entry shape** (all optional except `branch`): `branch`, `base`, `number`, `node_id`, `url`, `wiki_base_sha`, `merged_at`,
  `reconciled_at`. Unknown keys passed to `setPr` throw `TypeError` (catch typos early). No `title`: the PR title is create-only and
  the remote title is authoritative afterwards (49-05/49-11).

## Test list

1. Round-trip: a hand-written v3 mapping JSON with no `prs` → `serializeMapping(parse(x)) === x` (byte-identical).
2. `setPr(m, '49', {branch:'df/objective-49-x', base:'main'})` then `getPr(m, '49')` returns it; serialise → `prs` present after entities.
3. `setPr` merge-patches: a second call with `{number:120, node_id:'PR_120'}` keeps branch/base.
4. Decimal objective id `7.1` → key `7.1`; `getPr(m, '07.1')` resolves the same entry through `toObjectiveId`.
5. `setPr(m, '49', {numbr: 1})` throws `TypeError` naming the unknown key.
6. `setEntry` on objective 49 after `setPr` leaves `objectives['49']` with its three fields only; `listPrs(m)` returns `[['49', {...}]]`.
7. `migrateMapping` of a v2 file with no `prs` produces no `prs` key.
8. gh-client: `isWriteArgs(['issue','develop','120','--list'])` false; `['issue','develop','120','-l']` false; `['issue','develop','120',
   '--name','b']` true; `['pr','view','5']`/`['pr','checks','5']` false; `['pr','ready','5']` true; `['api','graphql','-f','query=query{x}']`
   false; `['api','graphql','-f','query=mutation{x}']` true. (Add only the cases that fail today; keep existing assertions.)

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: `prs` map in the mapping (tests 1-7)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-mapping.cjs, plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs</files>
  <action>
RED: tests 1-7 in `describe('49-02 prs map')`; commit `test(49-02): mapping prs map`.
GREEN: add `'prs'` to `KNOWN_TOP_LEVEL` (L169); `PR_FIELDS` constant; `getPr`, `setPr`, `listPrs` (keys via `toObjectiveId` L63);
`serializeMapping` (L394) emits `prs` only when non-empty, in a fixed position; export the three accessors. Commit
`feat(49-02): mapping stores objective branch and PR state`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs</verify>
  <done>Tests 1-7 pass; every existing gh-mapping test passes unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: gh-client read classification (test 8)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-client.cjs, plugins/devflow/devflow/bin/lib/gh-client.test.cjs</files>
  <action>
RED: test 8 cases that fail today; commit `test(49-02): issue develop --list is a read`.
GREEN: in `isWriteArgs` (L144) treat `issue develop` with `--list`/`-l` as a read; confirm the `pr` read subcommands and graphql
query/mutation split (add to `READ_SUBCOMMANDS` L130 only if a case fails). Commit `fix(49-02): classify issue develop --list as a read`.
Run the gh-* suite.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-client.test.cjs && node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'</verify>
  <done>Test 8 passes; gh-* suite green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-mapping.cjs`: `toObjectiveId` L63, `KNOWN_TOP_LEVEL` L169, `readLegacyEntry` L193, `migrateMapping` (preserves unknown top-level keys ~L276), `serializeMapping` L394, `setEntry` L491, `toTrdId` L521, `getTrd` L528. `entities` (48-02) is the precedent for an optional top-level map.
- `gh-client.cjs`: `NOUN_COMMANDS`/`READ_SUBCOMMANDS` L129-130, `isWriteArgs` L144.
</codebase_examples>
<anti_patterns>
- Adding PR fields to `objectives[id]` (dropped by `readLegacyEntry`).
- Emitting `"prs": {}` for every mapping (breaks byte stability and churns users' caches).
</anti_patterns>
<error_recovery>
- If test 1 fails on key order of an existing field, the serializer was reordered; restore the original order and append `prs` only.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs plugins/devflow/devflow/bin/lib/gh-client.test.cjs</test>
<regression>node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'</regression>
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs` green (no `parseInt` of ids).
</verification>

<success_criteria>
Objective branch and PR state persists in the mapping without changing any existing file, and `issue develop --list` is not paced as a write.
</success_criteria>

<output>
After completion, create `.planning/objectives/49-objective-branch-and-pr-lifecycle/49-02-SUMMARY.md`
</output>
