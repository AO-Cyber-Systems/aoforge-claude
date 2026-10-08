---
objective: 69-drafts-health-and-doctor
trd: "05"
type: standard
wave: 2
depends_on: ["69-02", "69-03"]
files_modified:
  - plugins/devflow/devflow/bin/lib/validate.cjs
  - plugins/devflow/devflow/bin/lib/validate-requirements.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
  - plugins/devflow/devflow/bin/lib/flag-spec.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/flag-guard-fixtures.cjs
autonomous: true
requirements: [TOOL-10]
must_haves:
  truths:
    - "`df-tools validate health` reports W065 `requirements-unlisted` (a warning, never repairable) for each requirement a VERIFICATION marks satisfied that no SUMMARY in the objective lists, with a fix naming the candidate TRDs and the `summary post` command"
    - "`df-tools validate requirements [--objective <N>]` prints the same findings as JSON (default) or as `W065 ...` lines with `--raw`, and `requirements-completed agrees with VERIFICATION (<n> objectives, <m> requirements checked)` when clean; it writes nothing and exits 0"
    - "On this repository, `validate requirements` reports no finding and `validate health` reports no W065"
    - "A failing requirements check is reported as W065 `requirements-check-failed`, never silent"
    - "`validate requirements --zz` exits 1 naming the flag (flag-spec entry + probe)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/validate.cjs
      provides: "Check 20 (W065) and cmdValidateRequirements"
      exports: ["cmdValidateRequirements"]
    - path: plugins/devflow/devflow/bin/lib/validate-requirements.test.cjs
      provides: "spawned and in-process tests for W065 and `validate requirements`"
  key_links:
    - from: "validate.cjs Check 20 and cmdValidateRequirements"
      to: "requirements-agreement.cjs scan / findingMessage / findingFix"
      via: "one scan per run, rendered as W065 issues or the command's report"
      pattern: "findingMessage\\("
    - from: "df-tools.cjs case 'validate'"
      to: "cmdValidateRequirements"
      via: "`requirements` subcommand with `--objective <N>` / `--objective=<N>`"
      pattern: "cmdValidateRequirements\\("
    - from: "flag-spec.cjs validate.subcommands"
      to: "flag-guard-fixtures.cjs PROBES 'validate requirements'"
      via: "flag-spec.repo.test.cjs keeps spec and probes equal"
      pattern: "validate requirements"
---

# TRD 69-05: `validate health` and `validate requirements` report unlisted satisfied requirements (TOOL-10, wiring)

<objective>
69-03 built `lib/requirements-agreement.cjs` and corrected objective 58. Surface it where people look: `validate health`
Check 20 renders each finding as W065 (advisory, never repaired: which SUMMARY should list a requirement is a judgement),
so `/devflow:status check` and doctor check 22 show it with no further wiring. Add `validate requirements
[--objective <N>]`, a read-only, network-free form for one objective, because full `validate health` does a git fetch in
Check 11 (the same reason `validate docs` exists).

Purpose: success criterion 3 (the check users run). Output: Check 20, `cmdValidateRequirements`, dispatch, help,
flag-spec entry and probe, tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@plugins/devflow/devflow/bin/lib/requirements-agreement.cjs

Read with offset/limit:
- `plugins/devflow/devflow/bin/lib/validate.cjs`: Check 19 (69-02, after Check 18, search `Check 19`), `cmdValidateDocs`
  (search `function cmdValidateDocs`, about 35 lines: the read-only command pattern), exports at the end.
- `plugins/devflow/devflow/bin/df-tools.cjs`: the import at line ~262 (`cmdValidateConsistency, cmdValidateHealth,
  cmdValidateDocs`), the header comment's `Validation:` block (~68-70), `case 'validate':` (~879-891).
- `plugins/devflow/devflow/bin/lib/help.cjs` 226-232 (`validate` usage/summary).
- `plugins/devflow/devflow/bin/lib/flag-spec.cjs` 170-176 (`validate.subcommands`).
- `plugins/devflow/devflow/bin/lib/__fixtures__/flag-guard-fixtures.cjs` 171-230 (`PROBES`, `'validate docs'` at ~224).
- `plugins/devflow/devflow/bin/lib/__fixtures__/requirements-fixtures.cjs` (69-03): `makeRequirementsProject`,
  `fiftyEightShape`, `summaryText`.
- `plugins/devflow/devflow/bin/lib/validate-model-ids.test.cjs` 1-80 (in-process validate health harness).

## Binding rules
- Strict TDD on both tasks; one test at a time.
- Fixtures from requirements-fixtures.cjs; temp projects only for the fixture tests. Reading this repository's
  `.planning/` is allowed only in the read-only repository assertions (test 9).
- Parallel wave: 69-04 edits doctor-checks/22, 23 and README. Do not edit those or requirements-agreement.cjs. One plain
  command per Bash call; commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- `helpers.output(result, raw, rawText)` prints JSON by default and `rawText` with `--raw` (as `validate docs` does).

## Output of `validate requirements`
- JSON: `{ findings: [{ objective, number, requirement, verification, candidates, message, fix }], checked: { objectives, requirements }, skipped }`.
- `--raw` text: per finding `W065 <message>` then `  fix: <fix>`; when there is none,
  `requirements-completed agrees with VERIFICATION (${n} objective${n === 1 ? '' : 's'}, ${m} requirement${m === 1 ? '' : 's'} checked)`.
- No `.planning/`: `{ findings: [], checked: {}, note: 'no .planning/' }` / `no .planning/`.
- Exit 0 in every case (advisory, like `validate docs`).
</context>

## Test list

`validate-requirements.test.cjs`:
1. Spawned `df-tools --cwd <fixture> validate requirements` on `fiftyEightShape()` (EST-02 and EST-04 unlisted) -> exit
   0; JSON `findings` has EST-02 (candidates `['58-05','58-08','58-10']`) and EST-04 (`['58-09','58-10']`), each with
   `message` starting `requirements-unlisted:` and a `fix` containing `summary post`.
2. Spawned with `--raw` -> stdout lines `W065 requirements-unlisted: objective 58 ...` and `  fix: ...`.
3. After the fixture SUMMARYs list EST-02 and EST-04 -> `--raw` prints
   `requirements-completed agrees with VERIFICATION (1 objective, 4 requirements checked)`.
4. `--objective 57` on a fixture with a clean objective 57 and the 58 gap -> no finding; `--objective=58` -> the two
   findings.
5. No `.planning/` -> `{ findings: [], checked: {}, note: 'no .planning/' }`, exit 0.
6. In-process `cmdValidateHealth` (homeDir temp, `mainVersionFn` stub) on the 58-shaped fixture -> warnings contain two
   W065 issues, `repairable: false`, fix text names the candidates; `repairable_count` does not include them.
7. Injected `options.requirementsAgreement = { scan() { throw new Error('boom') } }` -> W065
   `requirements-check-failed: boom`.
8. `validate requirements --zz-unknown` -> exit 1, stderr names `--zz-unknown` and `validate requirements` (covered by
   the PROBES loop in flag-guard-cli.test.cjs once the probe exists; assert it there, not twice).
9. Repository (read-only, skipped outside a DevFlow checkout): `validate requirements` on `REPO_ROOT` -> `findings: []`.

<embedded_context>

<codebase_examples>
The read-only command to mirror (validate.cjs `cmdValidateDocs`):

```js
function cmdValidateDocs(cwd, raw) {
  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) {
    output({ issues: [], checked: {}, note: 'no .planning/' }, raw, 'no .planning/');
    return;
  }
  ...
  output({ issues, checked }, raw, rawText);
}
```

The dispatcher arm today (df-tools.cjs):

```js
} else if (subcommand === 'docs') {
  cmdValidateDocs(cwd, raw);
} else {
  error('Unknown validate subcommand. Available: consistency, health, docs');
}
```
</codebase_examples>

<anti_patterns>
- Do not make W065 repairable or let `--repair` edit SUMMARYs: the fix is a reviewed `summary post`.
- Do not scan twice in one `validate health` run or re-implement the scan here: call `scan` once and render.
- Do not exit non-zero on findings: W065 is a warning, and scripts read the JSON.
- Do not add `--objective` to `validate health`; the filter belongs to the standalone command.
</anti_patterns>

<error_recovery>
- flag-spec.repo.test.cjs fails "spec and probes differ": add the `'validate requirements': ['validate', 'requirements']`
  probe beside `'validate docs'`.
- help.test.cjs or dispatch-completeness.test.cjs fails on the usage string: they compare help usage with the dispatcher;
  keep the usage form `df-tools validate <consistency|health [--repair]|docs|requirements [--objective <N>]> [--raw]`.
- Test 9 finds something: 69-03's correction did not land in this checkout (wave order) or a new objective added a gap;
  print the finding and stop rather than editing a SUMMARY here.
</error_recovery>

</embedded_context>

<gotchas>
- `--objective` reaches the dispatcher as `args` after `--raw`/`--cwd` are removed: read `args[args.indexOf('--objective') + 1]`
  or the `--objective=` form.
- `scan`'s findings carry no message/fix; add them in the command's JSON with `findingMessage` / `findingFix`.
- Check 20 goes after Check 19 and before "Perform repairs"; take `planningDir` from the existing local in
  `cmdValidateHealth`.
- Every validate health check that cannot run reports under its own code; W065 doubles as the failure code, as W063 does.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: validate health Check 20 (tests 6-7)</name>
  <files>plugins/devflow/devflow/bin/lib/validate.cjs, plugins/devflow/devflow/bin/lib/validate-requirements.test.cjs</files>
  <action>
RED: tests 6-7. Commit `test(69-05): validate health reports unlisted satisfied requirements`.

GREEN in validate.cjs after Check 19:
```js
// ─── Check 20: requirements-completed agrees with VERIFICATION (objective 69, TOOL-10) ─────
// W065: a requirement an objective's VERIFICATION marks SATISFIED that no SUMMARY in that objective lists in
// requirements-completed (requirements-agreement.cjs; only IDs defined in a REQUIREMENTS document). Advisory and never
// repairable: choosing the SUMMARY is a reviewed `summary post`. A check that cannot run is never silent.
try {
  const ra = options.requirementsAgreement || require('./requirements-agreement.cjs');
  for (const f of ra.scan(planningDir).findings) addIssue('warning', 'W065', ra.findingMessage(f), ra.findingFix(f), false);
} catch (e) {
  addIssue('warning', 'W065', `requirements-check-failed: ${e.message}`, 'Run `df-tools validate requirements` to see why', false);
}
```
(When `options.requirementsAgreement` is a stub without `findingMessage`, test 7 only exercises the throw path.)
Commit `feat(69-05): validate health Check 20 (W065)`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/validate-requirements.test.cjs plugins/devflow/devflow/bin/lib/validate.test.cjs plugins/devflow/devflow/bin/lib/validate-skill-marker.test.cjs` passes.</verify>
  <done>Tests 6-7 went RED then GREEN; W065 is never repairable.</done>
  <recovery>If an existing validate test now sees W065 on its fixture, the fixture has a VERIFICATION with SATISFIED rows and REQUIREMENTS-defined IDs; make its SUMMARY list them rather than weakening Check 20.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: `validate requirements` command (tests 1-5, 8-9)</name>
  <files>plugins/devflow/devflow/bin/lib/validate.cjs, plugins/devflow/devflow/bin/lib/validate-requirements.test.cjs, plugins/devflow/devflow/bin/df-tools.cjs, plugins/devflow/devflow/bin/lib/help.cjs, plugins/devflow/devflow/bin/lib/flag-spec.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/flag-guard-fixtures.cjs</files>
  <action>
RED: tests 1-5 and 9, plus the probe in flag-guard-fixtures.cjs PROBES (`'validate requirements': ['validate', 'requirements']`)
so flag-guard-cli.test.cjs fails until the spec and dispatcher exist (test 8). Commit
`test(69-05): validate requirements command`.

GREEN:
1. validate.cjs `cmdValidateRequirements(cwd, { objective } = {}, raw)` per "Output of validate requirements"; export it.
2. df-tools.cjs: import it; `else if (subcommand === 'requirements') { const i = args.indexOf('--objective'); const eq = args.find((a) => a.startsWith('--objective=')); const objective = eq ? eq.slice('--objective='.length) : (i >= 0 ? args[i + 1] : null); cmdValidateRequirements(cwd, { objective }, raw); }`;
   the unknown-subcommand error lists `consistency, health, docs, requirements`; header comment `Validation:` block gains
   `validate requirements [--objective N]  SUMMARY requirements-completed vs VERIFICATION`.
3. help.cjs `validate`: usage `df-tools validate <consistency|health [--repair]|docs|requirements [--objective <N>]> [--raw]`;
   summary `Check .planning/ integrity, objective numbering, documentation staleness, and SUMMARY/VERIFICATION requirement agreement.`
4. flag-spec.cjs `validate.subcommands.requirements: { values: ['--objective'] }`.
Commit `feat(69-05): validate requirements command`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/validate-requirements.test.cjs plugins/devflow/devflow/bin/lib/flag-spec.repo.test.cjs plugins/devflow/devflow/bin/lib/flag-guard-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` passes; `node plugins/devflow/devflow/bin/df-tools.cjs validate requirements --raw` in this repository prints the "agrees" line; the full suite (validation_gates) has no new failure.</verify>
  <done>Tests 1-5, 8 and 9 went RED then GREEN; the command is read-only and exits 0.</done>
  <recovery>If the flag guard rejects `--objective` before the dispatcher sees it, the flag-spec row is missing or misspelled; compare with `validate.subcommands.health`.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/validate-requirements.test.cjs plugins/devflow/devflow/bin/lib/validate.test.cjs plugins/devflow/devflow/bin/lib/flag-spec.repo.test.cjs plugins/devflow/devflow/bin/lib/flag-guard-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs</test_scoped>
<!-- lint/typecheck/build: none in the stack profile. Record the failing set before the first change; only known
     environment failures (MA-7 handoff-e2e doctl) may remain. If git signing prompts hang micro.test.cjs locally, use
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'. -->
</validation_gates>

<verification>
- SC-3: tests 1-4 and 6 show the check flagging the 58-shaped gap through both entry points; test 9 and the command run
  in this repository show it passes here after 69-03's correction.
</verification>

<success_criteria>
- Tests 1-9 pass (RED first where listed); full suite at baseline.
- `node plugins/devflow/devflow/bin/df-tools.cjs validate requirements --raw` in this repository prints
  `requirements-completed agrees with VERIFICATION (...)`.
</success_criteria>

<output>
After completion, publish `69-05-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post 69-05 --from <draft>`,
as execute-trd describes (stamp tokens first). Frontmatter `requirements-completed: [TOOL-10]`.
</output>
