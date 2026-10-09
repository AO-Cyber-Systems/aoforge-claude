---
objective: 61-store-mode-rough-edges-and-observability
trd: "07"
type: standard
wave: 2
depends_on: ["61-01"]
files_modified:
  - plugins/devflow/devflow/references/model-profiles.json
  - plugins/devflow/devflow/references/model-profiles.md
  - plugins/devflow/devflow/bin/lib/model-currency.cjs
  - plugins/devflow/devflow/bin/lib/model-currency.test.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/13-model-profiles.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/13-model-profiles.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/doctor-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/validate.cjs
  - plugins/devflow/devflow/bin/lib/validate-model-ids.test.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/22-validate-health.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs
autonomous: true
requirements: [OBS-01]
must_haves:
  truths:
    - "references/model-profiles.json pins models.opus = claude-opus-5-5 and models.sonnet = claude-sonnet-5-5 (haiku stays claude-haiku-4-5, which model-rates.json aliases to claude-haiku-4-5-20251001)"
    - "Whether a pinned id is current is derived from data, not a hard-coded list: an id is stale when model-rates.json lists a newer version of the same family (opus, sonnet, haiku, fable)"
    - "`df-tools doctor` check 13 (model-profiles) warns on a stale or unpriced pinned id, naming the tier, the pinned id and the current id"
    - "`validate health` warns W063 on the same condition for the running engine's model-profiles.json, and doctor check 22 defers W063 to check 13"
    - "A repo test fails CI when the shipped model-profiles.json pins an id that the shipped model-rates.json shows superseded"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/model-currency.cjs
      provides: "parseModelId, compareModelVersions, currentByFamily(rates), staleModelIds(models, rates)"
    - path: plugins/devflow/devflow/references/model-profiles.json
      provides: "current tier ids"
  key_links:
    - "model-currency.cjs -> calibration-inputs.cjs normalizeModelId/rateFor (the same id normalisation estimates use)"
    - "doctor-checks/13 -> model-currency.staleModelIds over the same copy's model-rates.json (mirror, else installed, else the engine's RATES_PATH)"
    - "validate.cjs Check 18 (after 61-01's Check 17) -> model-currency.staleModelIds(helpers MODEL_PROFILES_PATH, calibration-inputs RATES_PATH)"
---

# TRD 61-07: Current model ids, and stale-id detection from data (OBS-01)

<objective>
`references/model-profiles.json` still pins `opus: claude-opus-5` and `sonnet: claude-sonnet-5`. The current ids are
`claude-opus-5-5` and `claude-sonnet-5-5`. `models{}` is live: `flutter-ui-eval.cjs` and
`flutter-ui-design-review.cjs` send it to the Messages API, and `resolve-model` reports it as `model_id`. Nothing
catches a stale id today. Doctor check 13 says, deliberately, that it "carries no 'latest model' table", because a
hard-coded list goes stale itself.

**Decision: currency is derived from `references/model-rates.json`,** the priced table that 57-02 keeps current from
the pricing page (each entry has a `source` and an `as_of`). No new list. For each family, the newest version in that
table is current:

```
parseModelId('claude-opus-5-5')            -> { family: 'opus',  version: [5, 5], snapshot: null }
parseModelId('claude-haiku-4-5-20251001')  -> { family: 'haiku', version: [4, 5], snapshot: '20251001' }
parseModelId('claude-opus-4-7[1m]')        -> { family: 'opus',  version: [4, 7], snapshot: null }   # [1m] stripped
currentByFamily(rates)  over rates.models keys (aliases resolve to models):
  { fable: 'claude-fable-5-1', haiku: 'claude-haiku-4-5-20251001', opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5' }
staleModelIds(models, rates) -> [{ tier, id, reason, current }]
  reason 'superseded'  same family, lower version than current            (opus: claude-opus-5 -> claude-opus-5-5)
  reason 'unpriced'    rateFor(rates, id) is null (unknown to the table; currency cannot be judged, and estimates
                       cannot price it either)
  an equal version with a different snapshot or alias is current         (claude-haiku-4-5 vs ...-20251001)
```

When the next model ships and someone adds its rates, doctor and validate start flagging model-profiles.json, and the
repo test fails CI until the pin moves. The rate table and the pins cannot drift silently.

Purpose: OBS-01 and the model half of success criteria 2 and 3. Output: the pins, `model-currency.cjs`, doctor check 13
stale detection, validate Check 18 (W063), the deferral.
</objective>

<file_tree>
plugins/devflow/devflow/references/
├── model-profiles.json                       ← MODIFY (opus, sonnet ids)
└── model-profiles.md                         ← MODIFY (the tier → id table)
plugins/devflow/devflow/bin/lib/
├── model-currency.cjs                        ← CREATE
├── model-currency.test.cjs                   ← CREATE
├── validate.cjs                              ← MODIFY (Check 18, W063)
├── validate-model-ids.test.cjs               ← CREATE
├── __fixtures__/doctor-fixtures.cjs          ← MODIFY (MODEL_PROFILES_JSON ids, new MODEL_RATES_JSON literal)
└── doctor-checks/
    ├── 13-model-profiles.cjs                 ← MODIFY (stale detection)
    ├── 13-model-profiles.test.cjs            ← MODIFY
    ├── 22-validate-health.cjs                ← MODIFY (DEFERRED += W063)
    └── 21-22-project.test.cjs                ← MODIFY (DEFERRED pin)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit (`test(61-07): ...`) before GREEN (`feat(61-07): ...`).
- Hand-built fixtures only. Rates and profiles in unit tests are small literal objects. doctor-fixtures gains a
  literal `MODEL_RATES_JSON` (a handful of entries with the real file's shape). No generated data, no property-based
  libraries, no `.feature` files.
- Hermetic: doctor tests use fake homes and write their own `references/model-rates.json` into the fake mirror or
  installed plugin; validate tests inject paths. Only the repo guard (test 6) reads the shipped files, on purpose.
- Depends on 61-01: Check 18 goes directly after 61-01's Check 17, and DEFERRED already contains W062.
- Do not touch `model-rates.json`. Its ids belong to 57-02 and its comment says so. Read it only.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash
  call. Never use port 8080.

## Test list

`model-currency.test.cjs`:

1. `parseModelId`:
   - `claude-opus-5-5` → opus [5, 5];
   - `claude-opus-5` → opus [5];
   - `claude-haiku-4-5-20251001` → haiku [4, 5] with snapshot `20251001`;
   - `claude-opus-4-7[1m]` → opus [4, 7];
   - `claude-fable-5-1` → fable [5, 1];
   - `opus-latest`, `claude-3-5-sonnet-20241022`, `''` and `null` → `null`.
2. `compareModelVersions`: [5, 5] > [5]; [5] equals [5, 0]; [4, 8] < [5]; [4, 5] equals [4, 5].
3. `currentByFamily(literalRates)`. The literal holds opus-4-8, opus-5, opus-5-5, sonnet-5, sonnet-5-5,
   haiku-4-5-20251001 (with the alias `claude-haiku-4-5`) and fable-5-1. The result maps each family to its newest id;
   aliases never become the current id.
4. `staleModelIds`:
   - `{ opus: 'claude-opus-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-4-5' }` →
     `[{ tier: 'opus', id: 'claude-opus-5', reason: 'superseded', current: 'claude-opus-5-5' }]`;
   - `{ opus: 'claude-opus-9' }` (newer than the table, unpriced) → reason `unpriced`, `current: 'claude-opus-5-5'`;
   - `{ opus: 'claude-opus-5-5[1m]' }` → `[]`;
   - a non-object models value or rates value → `[]`, never throws.
5. The result is sorted by tier name, so the output is deterministic.
6. Repo guard: the shipped `references/model-profiles.json` against the shipped `references/model-rates.json` (via
   `calibration-inputs.loadRates()`) → `staleModelIds(...)` is `[]`. RED today: opus and sonnet are superseded.

`13-model-profiles.test.cjs` (fake homes; rates written next to the profiles):

7. Mirror profiles `opus: claude-opus-5` with mirror rates `MODEL_RATES_JSON` → `severity: 'warn'`. The finding contains
   `models.opus = claude-opus-5 is superseded by claude-opus-5-5`. `details.stale` lists it. `fix_command` is the
   existing SOURCE_HINT. `fixable` stays false.
8. Current pins (the updated `MODEL_PROFILES_JSON`) → `ok`. The existing 12a-12d expectations hold: 12a uses the real
   file, which is now current.
9. Rates resolution order:
   - mirror profiles use mirror rates;
   - no mirror rates file → the installed copy's rates;
   - neither → the engine's `calibration-inputs.RATES_PATH`. Assert `details.rates_source` is `mirror`, `installed` or
     `engine`.
10. An unpriced pinned id warns with `is not in model-rates.json`.
11. Structural problems and drift (the existing 13a/13b and drift tests) still report as before. Stale findings are
    appended, and the `+N more` cap still applies.

`validate-model-ids.test.cjs` (in-process `cmdValidateHealth`, the `runHealth` capture pattern, with options
`modelProfilesPath` / `modelRatesPath` pointing at temp literal files):

12. Stale opus → `warnings` has W063, message
    `model-id-stale: models.opus = claude-opus-5 is superseded by claude-opus-5-5 (model-rates.json)`, `repairable: false`.
13. Current pins → no W063. An unpriced pin → W063 with `model-id-unknown:`.
14. Unreadable profiles path → W063 `model-id-check-failed:`; the health run still completes.
15. Without the options, the engine's own files are used, and since the shipped pins are current (test 6), there is
    no W063.

`21-22-project.test.cjs`:

16. DEFERRED deep-equals `[..., 'W061', 'W062', 'W063']`, and a report whose only warning is W063 classifies as deferred.

<embedded_context>

<codebase_examples>
model-profiles.json today:

```json
  "models": {
    "opus":   "claude-opus-5",
    "sonnet": "claude-sonnet-5",
    "haiku":  "claude-haiku-4-5"
  },
```

Keep the column alignment. Change only the two values.

model-rates.json `models` keys: `claude-fable-5-1`, `claude-opus-5-5`, `claude-opus-5`, `claude-opus-4-8`,
`claude-sonnet-5-5`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`; `aliases: { 'claude-haiku-4-5': 'claude-haiku-4-5-20251001' }`.

calibration-inputs.cjs exports `RATES_PATH`, `loadRates(file)` (returns `{ ok, models, aliases, ... }` or
`{ ok: false, error }`), `normalizeModelId(id)` (trims and strips a trailing `[...]`) and `rateFor(rates, id)` (direct,
alias, then the same two with a trailing `-YYYYMMDD` removed). helpers.cjs exports `MODEL_PROFILES_PATH`.

doctor check 13 `run(ctx)` picks `preferred` = the mirror copy, else installed (`load(path.join(dir, REL))`), validates
the structure and compares the mirror against installed. Add, after `validate(preferred.doc)`: load the rates from the
same directory as `preferred`, fall back to the engine's `RATES_PATH`, then push each stale entry onto `issues`.
Rewrite the module header: the check still holds no hard-coded list, because currency comes from model-rates.json.

doctor-fixtures `MODEL_PROFILES_JSON.models` is `{ opus: 'claude-opus-5', sonnet: 'claude-sonnet-5', haiku: 'claude-haiku-4-5' }`.
Update it to the current ids and export a new `MODEL_RATES_JSON` literal (the real file's shape, at least the seven ids
above, the alias, plus `source` and `as_of` on each entry so `loadRates` accepts it).
</codebase_examples>

<anti_patterns>
- Do not add a `current` list to any file. The rate table is the list.
- Do not compare ids as strings. `claude-opus-5-5` versus `claude-opus-5` needs numeric version arrays, and a date
  snapshot is not a version.
- Do not flag a pinned alias or undated id as stale when its version equals the current one.
- Do not make W063 repairable or give check 13 a `fix()`. The ids change in the plugin source and ship with a release.
- Do not read `os.homedir()` in check 13. Rates paths derive from `ctx.paths.mirrorDir` and the installed plugin's
  `installPath`.
</anti_patterns>

<error_recovery>
- If changing `MODEL_PROFILES_JSON` breaks a doctor e2e expectation elsewhere (`rg -n "MODEL_PROFILES_JSON" plugins`),
  that test pinned the old ids. Update the assertion to the fixture's value and name it in the SUMMARY.
- If `model-profiles.test.cjs` (TRD 28-02) or a resolve-model test pins `model_id: 'claude-opus-5'`, update it to read
  the id from the JSON rather than a literal.
- If `ui-sheet.test.cjs`, `flutter-ui-eval` tests or `gh-enforcement.e2e.test.cjs` read model-profiles.json and pin an
  id, update the literal. Never revert the pin to make a test pass.
</error_recovery>

</embedded_context>

<gotchas>
- `parseModelId`: normalise with `normalizeModelId`, then match `/^claude-([a-z]+)-(\d+(?:-\d+)*)$/`. A last segment of
  exactly 8 digits is the snapshot; the rest is the version.
- `currentByFamily` considers only `rates.models` keys (real entries). On an equal version, prefer the undated id; if
  every id is dated, take the lexically greatest snapshot. Families come from the data.
- Doctor finding fragments:
  - superseded: `models.<tier> = <id> is superseded by <current> (model-rates.json)`;
  - unpriced: `models.<tier> = <id> is not in model-rates.json, so its currency cannot be checked`.
- validate Check 18, with its header comment (objective 61 OBS-01; data-driven currency; warning, never repairable):
  ```js
  try {
    const profiles = JSON.parse(fs.readFileSync(options.modelProfilesPath || MODEL_PROFILES_PATH, 'utf-8'));
    const rates = loadRates(options.modelRatesPath || RATES_PATH);
    if (!rates.ok) throw new Error(rates.error);
    for (const s of staleModelIds(profiles.models, rates)) addIssue('warning', 'W063', <message>, <fix>, false);
  } catch (e) { addIssue('warning', 'W063', `model-id-check-failed: ${e.message}`, 'Run `df-tools doctor` to see why', false); }
  ```
  Fix text:
  ``Update the plugin (`/plugin update devflow@aocyber`); in the DevFlow source, update models in references/model-profiles.json``.
- model-profiles.md: update the `opus` and `sonnet` rows of the tier table (lines ~37-38). Add one sentence: doctor
  check 13 and validate health W063 flag a pin that model-rates.json shows superseded.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: model-currency.cjs and the current pins (tests 1-6)</name>
  <files>plugins/devflow/devflow/bin/lib/model-currency.cjs, plugins/devflow/devflow/bin/lib/model-currency.test.cjs, plugins/devflow/devflow/references/model-profiles.json, plugins/devflow/devflow/references/model-profiles.md</files>
  <action>
RED: write tests 1-6. Test 6 fails on the shipped pins, which is the point. Commit
`test(61-07): model id currency from the rate table, and the shipped pins are current`.

GREEN: create `model-currency.cjs` (requires only `./calibration-inputs.cjs` for normalisation and `rateFor`). Set
opus and sonnet to `claude-opus-5-5` and `claude-sonnet-5-5` in model-profiles.json, and update model-profiles.md.
Commit `feat(61-07): pin claude-opus-5-5 and claude-sonnet-5-5; derive model id currency from model-rates.json`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/model-currency.test.cjs plugins/devflow/devflow/bin/lib/model-profiles.test.cjs plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs` passes. `node plugins/devflow/devflow/bin/df-tools.cjs resolve-model planner` reports `model_id` `claude-opus-5-5` (quality profile) or the sonnet id, per this repo's profile.</verify>
  <done>The pins are current, and a repo test fails the day model-rates.json gains a newer model while the pins stand still.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Doctor check 13 flags stale and unpriced pinned ids (tests 7-11)</name>
  <files>plugins/devflow/devflow/bin/lib/doctor-checks/13-model-profiles.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/13-model-profiles.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/doctor-fixtures.cjs</files>
  <action>
RED: update `MODEL_PROFILES_JSON` to the current ids, add `MODEL_RATES_JSON`, and write tests 7-11, with the fake
mirror and installed copies getting `references/model-rates.json` where a test needs one. Commit
`test(61-07): doctor flags a stale pinned model id`.

GREEN: add stale detection to check 13 (rates resolution order: same copy, else installed, else engine;
`details.rates_source`, `details.stale`). Rewrite the header comment. Commit
`feat(61-07): doctor check 13 warns when a pinned model id is superseded`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/doctor-checks/13-model-profiles.test.cjs plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/11-12-install.test.cjs` passes.</verify>
  <done>Check 13 names the tier, pinned id and current id of every superseded pin. Existing structural and drift reporting is unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: validate health Check 18 (W063) and its deferral (tests 12-16)</name>
  <files>plugins/devflow/devflow/bin/lib/validate.cjs, plugins/devflow/devflow/bin/lib/validate-model-ids.test.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/22-validate-health.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs</files>
  <action>
RED: write tests 12-15 and update test 16's DEFERRED pin. Commit `test(61-07): validate health warns on a stale pinned model id`.

GREEN: add Check 18 directly after Check 17, with the `modelProfilesPath` / `modelRatesPath` options. Add `'W063'` to
DEFERRED and name check 13 as its owner in 22's header comment. Commit
`feat(61-07): validate health Check 18 reports W063 for a stale pinned model id`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/validate-model-ids.test.cjs plugins/devflow/devflow/bin/lib/validate.test.cjs plugins/devflow/devflow/bin/lib/validate-checks-pin.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs` passes. `node plugins/devflow/devflow/bin/df-tools.cjs validate health --raw` in this repo shows no W063.</verify>
  <done>validate health and doctor both catch a stale pinned id, and doctor reports it once (check 13).</done>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/devflow/bin/lib/model-currency.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/13-model-profiles.test.cjs plugins/devflow/devflow/bin/lib/validate-model-ids.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs`.
</validation_gates>

<verification>
- `node -e "console.log(require('./plugins/devflow/devflow/references/model-profiles.json').models)"` prints
  `claude-opus-5-5` and `claude-sonnet-5-5`.
- Every touched suite and `doctor.e2e.test.cjs` pass.
</verification>

<success_criteria>
- [ ] model-profiles.json pins `claude-opus-5-5` and `claude-sonnet-5-5`
- [ ] doctor check 13 and validate health W063 flag a superseded or unpriced pinned id
- [ ] Currency comes from model-rates.json, and CI fails when the pins fall behind it
</success_criteria>

<output>
After completion, create `.planning/objectives/61-store-mode-rough-edges-and-observability/61-07-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`.
</output>
