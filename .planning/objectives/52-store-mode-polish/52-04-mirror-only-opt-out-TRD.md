---
objective: 52-store-mode-polish
trd: "04"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs
  - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs
  - plugins/devflow/devflow/bin/lib/validate.test.cjs
  - plugins/devflow/devflow/templates/config.json
  - plugins/devflow/skills/gh-sync/SKILL.md
  - plugins/devflow/devflow/workflows/health.md
autonomous: true
requirements: ["52-5"]
must_haves:
  truths:
    - "A mirror-mode project (`github.enabled: true`, `github.store` not true) with `github.mirror_only: true` gets 0011 `detect` -> `{applies: false}` with a reason naming the opt-out, so `upgrade --check` lists 0011 under `skipped` and not `pending_confirm`"
    - "`validate health` reports no W040 for such a project once it is stamped current; without the key, the same project still reports W040 (`1 need confirmation`)"
    - "`upgrade --apply --confirm` and `--apply --only 0011 --confirm` do not switch the store on while `mirror_only` is true (detect gates apply)"
    - "With `github.store: true`, `mirror_only` is ignored: an in-progress or incomplete backfill still makes 0011 apply"
    - "Only boolean `true` opts out; the store-off `applies: true` reason names `df-tools config-set github.mirror_only true` as the way to keep mirror mode"
    - "`config-get github.mirror_only` returns `false` on a project that never set it (template default)"
    - "/devflow:gh-sync migrate and the health workflow's confirm step offer 'keep mirror mode' and record it with config-set"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs
      provides: "detect honours github.mirror_only while the store is off"
    - path: plugins/devflow/devflow/templates/config.json
      provides: "github.mirror_only: false default"
  key_links:
    - "0011 detect -> client.requireEnabled(main).config.mirror_only (the github block 0011 already reads)"
    - "upgrade.check/apply skip a migration whose detect says no -> validate.cjs Check 13 W040, doctor check 21 and the upgrade-project.js pending-confirm notice all go quiet"
---

# TRD 52-04: Recorded opt-out for projects that keep GitHub in mirror mode (item 52-5)

<objective>
Give a project that enables GitHub only for mirror mode a recorded way to say "never migrate to the store", which migration 0011
and W040 respect.

Purpose: today, once `github.enabled` is true, 0011 detects `applies: true` for as long as the store is off. It stays a pending
confirm migration forever, `validate health` reports W040 ("1 need confirmation"), doctor check 21 names it, and the SessionStart
upgrade hook keeps nudging (docs/USER-GUIDE.md:763: "there is no opt-out key yet").

Output: a `github.mirror_only` config key (template default `false`), honoured by 0011 `detect` while the store is off and named
in 0011's store-off reason, with regression tests, plus the two prose entry points (gh-sync migrate, health confirm step) that record it.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD on Task 1: `test(52-04): ...` (failing) before `fix(52-04): ...`.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Do not renumber or re-order migrations. 0011 keeps its id, title, `since` and `safety: 'confirm'`.
- `detect` stays local and offline: zero gh calls, no writes (0011 test 2a pins this).
- Do not add a generic "decline any migration" mechanism to upgrade.cjs. The opt-out is a GitHub-mode decision and must stop
  applying once the store is on.
- Do not touch migration 0010 or doctor-check files (TRD 52-01, same wave).

## Decisions (locked by the planner)

- **Key:** `.planning/config.json` -> `github.mirror_only` (boolean). Tracked config, so the decision is recorded in git and shared.
  Recorded with `df-tools config-set github.mirror_only true` (config-set parses `true` as a boolean).
- **Scope:** honoured only in 0011 `detect`'s store-off branch. With the store on it is ignored, so a backfill in flight is never hidden.
- **Reason text** when opted out: `mirror mode kept (github.mirror_only: true): the GitHub store backfill is opted out. To migrate later, run \`df-tools config-set github.mirror_only false\`, then ${APPLY_COMMAND}.`
- **Store-off applies reason:** keep today's text and append ` To keep mirror mode instead: \`df-tools config-set github.mirror_only true\`.`

## Test list

Outermost first.
1. validate health (validate.test.cjs Check 13 block, same `runHealth` harness): a project stamped current, enabled, store off and
   `mirror_only: true` -> zero W040. The same project without the key -> exactly one W040 whose message says `1 need confirmation`
   (positive control).
2. `upgrade.check` on the opted-out project: 0011 is in `skipped` with the opt-out reason and not in `pending_confirm`; `up_to_date`
   holds when nothing else is pending.
3. `upgrade.apply({confirm: true})` and `apply({only: ['0011'], confirm: true})` on the opted-out project: 0011 is skipped,
   `.planning/config.json` `github.store` is still not true, and gh makes zero calls.
4. 0011 `detect`: enabled + store off + `mirror_only: true` -> `{applies: false, reason}` with the reason containing `mirror_only`.
5. 0011 `detect`: `mirror_only: "true"` (string) and `mirror_only: false` -> still applies (only boolean true opts out).
6. 0011 `detect`: store on + pending journal + `mirror_only: true` -> still applies (resume), as in test 2c.
7. 0011 `detect`: the store-off `applies: true` reason contains `config-set github.mirror_only true`.
8. config-get: `df-tools config-get github.mirror_only` in a project without the key prints `false` (template default via the 40-xx
   config-get defaults behaviour). Put this in validate.test.cjs or the 0011 test, whichever already spawns df-tools.

<embedded_context>

<codebase_examples>
0011 detect today (migrations/0011-github-store-backfill.cjs:199-212):

```js
function detect(ctx) {
  const main = mainOf(ctx);
  const gate = client.requireEnabled(main);
  if (!gate.enabled) return { applies: false, reason: `${NOT_ENABLED} (${gate.reason})` };

  if (!planningMode.isStoreMode(main)) {
    const plan = planningImport.planImport(main, { dryRun: true });
    const summary = plan.ok ? planSentence(plan) : `the plan could not be computed (${plan.error})`;
    return {
      applies: true,
      reason: `GitHub backfill not started (github.store is off): ${summary}. Full plan: ${DRY_RUN_COMMAND}; ` +
        `run it with ${APPLY_COMMAND}.`,
    };
  }
  ...
```

`client.requireEnabled(main)` returns `{enabled: true, repo, labels, milestone_prefix, config: gh}`, where `config` is the
`github` block. Read `gate.config.mirror_only === true` and check it BEFORE `planImport` (saves the dry-run cost).

upgrade.cjs apply (lines ~415-427): `if (!det.applies) { report.skipped.push(...); continue; }` runs before the confirm selection,
so a detect that says no is enough to block `--apply --confirm` and `--only 0011`.

Test harnesses: 0011-github-store-backfill.test.cjs tests 2a-2d (`useBackfillEnv`, `ctxFor(env)`, a gh call counter) for detect;
validate.test.cjs `describe('Check 13: upgrade state (W040)')` (line ~920, `runHealth(tmpProject, {homeDir: tmpHome, mainVersionFn: () => null}, false)`, `w040s(json)`).
To stamp a fixture current, run `upgrade.apply` once (as the Check 13 tests do), then set the config keys.
</codebase_examples>

<anti_patterns>
- Hiding 0011 whenever `mirror_only` is set, including in store mode: a half-done backfill would go silent.
- Recording the opt-out outside tracked config (STATE.md, a runtime dotfile, `~/.claude`): it must survive clones and be visible in review.
- Teaching skills to hand-edit config.json. Use `config-set`.
</anti_patterns>

<error_recovery>
- If the W040 positive control reports other pending migrations (e.g. 0006 kind-work), give the fixture PROJECT.md a `kind` or
  assert on `pending_confirm` ids rather than on the count text. The point is that 0011 is absent.
- If config.test.cjs or 0001-config-stamp.test.cjs pin the template's `github` keys, update the expected key list in the same commit and note it in the SUMMARY.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/52-store-mode-polish/OBJECTIVE.md
@plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs
</context>

<gotchas>
- `templates/config.json` is the source config-get uses for documented defaults. Add `"mirror_only": false` inside `github`, right after `"store": false`.
- 0011's dry run and the 51-07 drain notes do not need the opt-out text. Only `detect` changes.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 0011 detect honours github.mirror_only while the store is off</name>
  <files>plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs, plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs, plugins/devflow/devflow/bin/lib/validate.test.cjs, plugins/devflow/devflow/templates/config.json</files>
  <action>
RED: add test-list items 1-8. Put items 2-7 in a new `describe('0011 mirror-mode opt-out (52-04)')` in the 0011 test file, and
items 1 and 8 in validate.test.cjs next to Check 13. Commit `test(52-04): ...`.

GREEN:
- templates/config.json: `github.mirror_only: false`.
- 0011 `detect`: inside `if (!planningMode.isStoreMode(main))`, first check
  `if (gate.config && gate.config.mirror_only === true) return { applies: false, reason: MIRROR_ONLY };`
  with the constant `MIRROR_ONLY` holding the locked reason text. Append the locked opt-out sentence to the store-off applies reason.
  Add a header-comment line to the detect table (lines ~26-29): `store off + github.mirror_only true -> skipped (52-04)`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs plugins/devflow/devflow/bin/lib/validate.test.cjs plugins/devflow/devflow/bin/lib/config.test.cjs plugins/devflow/devflow/bin/lib/migrations/0001-config-stamp.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs</verify>
  <done>Test-list items 1-8 pass. A mirror-only project shows no W040, and 0011 never applies for it while the store is off. Existing 0011 tests (2a-2d, 3, 6-8) and config tests pass.</done>
  <recovery>If test 2b's exact reason assertion breaks on the appended sentence, change it to a prefix/regex match in the RED commit.</recovery>
</task>

<task type="auto">
  <name>Task 2: gh-sync migrate and the health confirm step offer "keep mirror mode"</name>
  <files>plugins/devflow/skills/gh-sync/SKILL.md, plugins/devflow/devflow/workflows/health.md</files>
  <action>
- skills/gh-sync/SKILL.md step 2b: the AskUserQuestion gets a third option, **Keep mirror mode** ("don't ask again"). On that answer run
  `node ~/.claude/devflow/bin/df-tools.cjs config-set github.mirror_only true`, then
  `node ~/.claude/devflow/bin/df-tools.cjs commit "chore: keep GitHub in mirror mode" --files .planning/config.json`
  (mirror mode, so the commit gate does not apply). Say that 0011 and W040 go quiet. In step 2a, add the `skipped` reason
  `mirror mode kept (github.mirror_only: true)`. If it shows and the user asked to migrate, ask before running `config-set github.mirror_only false`.
- workflows/health.md step 4: add a **0011** bullet before "Any other id". Describe the backfill from its `reason`, then ask
  Migrate now / Not now / Keep mirror mode. Migrate now hands off to `/devflow:gh-sync migrate` (never apply 0011 inline). Keep mirror
  mode runs the same config-set and includes `.planning/config.json` in step 5's commit. Change "Declined migrations stay pending; W040
  will keep reporting them." to add: "except 0011 when mirror mode is kept".
- workflows/health.md step 5: add a store-mode note. If `df-tools planning mode` prints `store` and the commit is refused
  (`default_branch`/`unlinked_branch`), commit through a pull request with the branch + logged-escape sequence (`git switch -c
  devflow-upgrade`, `DEVFLOW_SKIP_GH_GATE=1 DEVFLOW_SKIP_GH_GATE_REASON="DevFlow upgrade" node ~/.claude/devflow/bin/df-tools.cjs commit ...`,
  push, open a PR), or commit on an objective's linked branch from `df-tools gh pr start <objective>`. This is the same sequence doctor check 21 prints (TRD 52-01).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-sync-skill.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs; rg -n 'mirror_only' plugins/devflow/skills/gh-sync/SKILL.md plugins/devflow/devflow/workflows/health.md</verify>
  <done>Both prose entry points record the opt-out with config-set, health step 5 covers the store-mode commit, and the repo prose tests pass.</done>
  <recovery>If gh-sync-skill.repo.test.cjs pins the two-option question, update its expectation to the three options and note it in the SUMMARY.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- The scoped tests in Tasks 1-2 pass.
- `node plugins/devflow/devflow/bin/df-tools.cjs config-get github.mirror_only` in a scratch project without the key prints `false`.
- `rg -n 'mirror_only' plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs` shows the store-off check and the reason constant.
</verification>

<success_criteria>
A mirror-mode project with `github.mirror_only: true` shows no W040, and 0011 neither applies nor nags while the store is off. Without
the key, or once the store is on, behaviour is unchanged.
</success_criteria>

<output>
After completion, create `.planning/objectives/52-store-mode-polish/52-04-SUMMARY.md` via `df-tools summary post`.
</output>
