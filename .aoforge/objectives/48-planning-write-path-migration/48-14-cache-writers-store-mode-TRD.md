---
objective: 48-planning-write-path-migration
trd: "14"
type: tdd
wave: 3
depends_on: ["48-01", "48-11"]
files_modified:
  - plugins/devflow/devflow/bin/lib/objective.cjs
  - plugins/devflow/devflow/bin/lib/objective.test.cjs
  - plugins/devflow/devflow/bin/lib/frontmatter.cjs
  - plugins/devflow/devflow/bin/lib/frontmatter.test.cjs
  - plugins/devflow/devflow/bin/lib/templates.cjs
  - plugins/devflow/devflow/bin/lib/templates.test.cjs
  - plugins/devflow/devflow/bin/lib/misc.cjs
  - plugins/devflow/devflow/bin/lib/misc-requirements.test.cjs
autonomous: true
requirements: [GWP-01, GWP-03]
must_haves:
  truths:
    - "LOCAL MODE: `objective add|insert|remove|complete`, `frontmatter set|merge`, `template fill`, `requirements mark-complete` behave byte-identically to today (characterization tests)"
    - "STORE MODE: `objective add|insert` create the objective dir and OBJECTIVE.md through `planning-verbs.objectivePut` (so the issue is found-or-created and the ledger records it) and do not edit ROADMAP.md/STATE.md; `objective remove` refuses ('deletes are never automatic'); `objective complete` runs `objectiveSetStatus(id, 'complete')` (D-19, D-08)"
    - "STORE MODE: `frontmatter set|merge` on a cache-class path refuses naming the owning verb from planning-paths; on runtime/tracked-config/non-planning paths it works as today (D-19)"
    - "STORE MODE: `template fill` writes its draft into the cache path as today AND records it in the verb ledger, so W055 stays quiet until the flow ends in `summary post` / `verification post` / `doc put` (D-19)"
    - "STORE MODE: `requirements mark-complete` edits REQUIREMENTS.md and publishes it with `docPut` (D-19)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/objective.cjs
      provides: "store-mode branches in cmdObjectiveAdd/Insert/Remove/Complete"
    - path: plugins/devflow/devflow/bin/lib/frontmatter.cjs
      provides: "store-mode cache refusal in cmdFrontmatterSet/Merge"
    - path: plugins/devflow/devflow/bin/lib/templates.cjs
      provides: "ledger record in cmdTemplateFill (store mode)"
    - path: plugins/devflow/devflow/bin/lib/misc.cjs
      provides: "cmdRequirementsMarkComplete publishes via docPut in store mode"
  key_links:
    - "Calls 48-11 planning-verbs (objectivePut, objectiveSetStatus, docPut) and 48-01 planning-mode/paths/ledger; removes the 'obvious bypass' named in 48-RESEARCH pitfall 9"
---

# TRD 48-14: Cache writers in store mode — objective ops, frontmatter, template fill, requirements

<objective>
Close the df-tools bypasses: the existing commands that write cached planning files either route through the verbs or refuse in store
mode, so an agent cannot reach the cache through `frontmatter set` or `objective add` instead of the gated Edit tool. Local mode unchanged.

Purpose: GWP-01 (verbs cover every planning write, including df-tools' own), GWP-03 (no bypass), D-08, D-19. Output: store-mode branches in four modules + tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Characterization first: pin today's local-mode outputs for each command before changing it. Then RED → GREEN for store mode.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- These modules call `planning-verbs` functions; they never call gh libraries directly. The `cmd*` functions exit the process, so store-mode
  tests spawn `node plugins/devflow/devflow/bin/df-tools.cjs ...` in a `makeStoreProject({store:true})` temp project with the env from
  `__fixtures__/gh-shim.cjs` `installGhShim({dir, table:{}, defaultCode:1})` (`shim.env()`: shim first on PATH, temp HOME, temp
  `DEVFLOW_OUTBOX_DIR`). Every gh call fails like offline, so verbs queue (exit 3, pending) — tests assert the cache file, the ledger and the
  outbox journal ops, never GitHub objects (GitHub round-trips are 48-11/48-12/48-20). Never real GitHub/`~/.claude`, never port 8080.
- `misc.cjs` is also edited by 48-10 (wave 2, `cmdCommit`); touch only `cmdRequirementsMarkComplete` here.

## Decisions

D-08, D-19. Settled here:

- **objective add/insert (store)**: compute the new dir name exactly as today (slug rules unchanged); write OBJECTIVE.md text that today's code
  would write into the dir via `objectivePut`; skip the ROADMAP.md insertion and report `roadmap:'generated (gh pull --all)'`. Insert's decimal
  numbering still reads the cache ROADMAP/objective dirs as today.
- **objective remove (store)**: `error('objective remove is refused in store mode: deletes are never automatic. Close the objective issue with df-tools objective set-status <id> cancelled')`.
- **objective complete (store)**: `objectiveSetStatus(id,'complete')`; output keeps today's top-level keys where meaningful (`completed:true`) and adds the verb result.
- **frontmatter set|merge (store)**: resolve the target relative to the main `.planning/`; `classify(rel).class === 'cache'` → error
  `"<rel> is a GitHub-backed cache file in store mode; frontmatter edits go through <verb> (edit a draft: df-tools planning draft <rel>)"`.
  `frontmatter get|validate` unchanged.
- **template fill (store)**: after writing, `planningLedger.record(main, rel, text, {verb:'template fill'})`; output adds `publish_with:<verb>`.
- **requirements mark-complete (store)**: perform today's edit in memory, then `docPut(root, {rel:'REQUIREMENTS.md', text, message:'requirements: mark <ids> complete'})`.

## Test list

objective.cjs
1. Characterization: local `objective add "Foo bar"` → dir + OBJECTIVE.md + ROADMAP.md bytes pinned; `insert`, `remove --confirm`, `complete` pinned.
2. Store: `objective add "Foo bar"` → dir + OBJECTIVE.md created, ROADMAP.md untouched, ledger has the OBJECTIVE rel, journal holds the queued objective ops, exit 3 (pending).
3. Store: `objective remove 7 --confirm` → refused with the message; nothing deleted.
4. Store: `objective complete 7` → journal holds `patch-issue {id:'7', state:'closed', state_reason:'completed'}`; ROADMAP.md/STATE.md untouched.

frontmatter.cjs
5. Characterization: local `frontmatter set <TRD path> status done` → file updated as today.
6. Store: same → error naming `plan put-trd` and `planning draft`; file unchanged. Store on `.planning/config.json`-adjacent runtime file (`.trd-progress/7-01.md`) and on a non-planning file → works.
7. Store: `frontmatter merge` on OBJECTIVE.md → error naming `objective put`.

templates.cjs
8. Characterization: local `template fill summary ...` output file pinned.
9. Store: same → file written, ledger entry present, output `publish_with:'summary post'`.

misc requirements
10. Characterization: local `requirements mark-complete GWP-01` → REQUIREMENTS.md bytes pinned.
11. Store: → REQUIREMENTS.md updated in the cache, ledger entry present, journal holds `wiki-push` for `REQUIREMENTS.md`.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: objective add/insert/remove/complete in store mode (tests 1-4)</name>
  <files>plugins/devflow/devflow/bin/lib/objective.cjs, plugins/devflow/devflow/bin/lib/objective.test.cjs</files>
  <action>
Commit test 1 (characterization). RED: tests 2-4; commit `test(48-14): objective ops in store mode`.
GREEN: branch each command on `planning-mode.isStoreMode(cwd)` per the decisions. Keep the local code path textually unchanged (early store branch,
then the existing body). Commit `feat(48-14): objective ops route through verbs in store mode`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/objective.test.cjs</verify>
  <done>Tests 1-4 pass; existing objective tests unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: frontmatter refusal and template-fill ledger (tests 5-9)</name>
  <files>plugins/devflow/devflow/bin/lib/frontmatter.cjs, plugins/devflow/devflow/bin/lib/frontmatter.test.cjs, plugins/devflow/devflow/bin/lib/templates.cjs, plugins/devflow/devflow/bin/lib/templates.test.cjs</files>
  <action>
Commit tests 5 and 8 (characterization). RED: 6, 7, 9; commit `test(48-14): frontmatter and template fill in store mode`.
GREEN: refusal in `cmdFrontmatterSet`/`cmdFrontmatterMerge`; ledger record in `cmdTemplateFill`. Require `planning-paths`/`planning-ledger` lazily
inside the store branch (frontmatter.cjs is imported widely; keep its load cost flat). Commit `feat(48-14): frontmatter and template fill respect the cache`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/frontmatter.test.cjs plugins/devflow/devflow/bin/lib/templates.test.cjs</verify>
  <done>Tests 5-9 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: requirements mark-complete publishes via doc put (tests 10-11)</name>
  <files>plugins/devflow/devflow/bin/lib/misc.cjs, plugins/devflow/devflow/bin/lib/misc-requirements.test.cjs</files>
  <action>
Commit test 10 (characterization) in the new `misc-requirements.test.cjs`. RED: test 11; commit `test(48-14): requirements mark-complete in store mode`.
GREEN: store branch in `cmdRequirementsMarkComplete` (L730) computing the new text with the existing logic, then `docPut`. Commit
`feat(48-14): requirements mark-complete publishes to the wiki in store mode`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/misc-requirements.test.cjs plugins/devflow/devflow/bin/lib/misc-commit.test.cjs</verify>
  <done>Tests 10-11 pass; 48-10's commit tests still green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `objective.cjs` L265 `cmdObjectiveAdd`, L353 `cmdObjectiveInsert`, L480 `cmdObjectiveRemove`, L702 `cmdObjectiveComplete`.
- `frontmatter.cjs` L329 `cmdFrontmatterSet`, L343 `cmdFrontmatterMerge`; `templates.cjs` L33 `cmdTemplateFill`; `misc.cjs` L730 `cmdRequirementsMarkComplete`.
- Memory note: `df-tools objective add` slugifies the whole description and `remove` cascade-renumbers — do not change either behaviour here.
</codebase_examples>
<anti_patterns>
- Refusing `frontmatter set` in local mode: this repo and every non-GitHub project rely on it.
- Implementing a second objective-issue creator: `objectivePut` → `gh.syncObjective` is the one path (D-16).
</anti_patterns>
<error_recovery>
- If a characterization test is impossible because the command exits via `error()`, run it as a subprocess and compare files on disk.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/objective.test.cjs plugins/devflow/devflow/bin/lib/frontmatter.test.cjs plugins/devflow/devflow/bin/lib/templates.test.cjs plugins/devflow/devflow/bin/lib/misc-requirements.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/df-tools.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs</regression>
</validation_gates>

<verification>
- `rg -n "isStoreMode" plugins/devflow/devflow/bin/lib/{objective,frontmatter,templates,misc}.cjs` shows one guard per touched command.
</verification>

<success_criteria>
No df-tools command can write a cached planning file in store mode except through a verb, and none of them changed for local projects.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-14-SUMMARY.md`
</output>
