---
objective: 61-store-mode-rough-edges-and-observability
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/checks-pin.cjs
  - plugins/devflow/devflow/bin/lib/checks-pin.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-setup.cjs
  - plugins/devflow/devflow/bin/lib/validate.cjs
  - plugins/devflow/devflow/bin/lib/validate-checks-pin.test.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/26-checks-workflow-pin.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/26-checks-workflow-pin.test.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/22-validate-health.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/README.md
autonomous: true
requirements: [STOR-03]
must_haves:
  truths:
    - "A repository whose managed .github/workflows/devflow.yml pins devflow-ref (or the DevFlow reusable workflow's @ref) to a release older than the installed plugin gets a W062 warning from `validate health`, naming the file, the pinned ref and the installed version"
    - "`df-tools doctor` reports the same condition as check 26 (checks-workflow-pin) with severity warn and fix_command `node ~/.claude/devflow/bin/df-tools.cjs gh setup --apply`; doctor check 22 defers W062 so it is never reported twice"
    - "A workflow pinned to the installed version or newer, pinned to a branch or SHA, not managed by gh setup, or absent produces no warning"
    - "The installed version is the plugin manager's installed plugin (helpers.installedPlugin), falling back to the running engine version"
    - "The fix text names `gh setup --apply` and warns that an @ref in github.checks_workflow re-pins the same ref until it is updated"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/checks-pin.cjs
      provides: "parseWorkflowPins(text), parseReleaseRef(ref), pinStatus(pins, installedVersion), readWorkflowPin(root), collectPinFindings({projectRoot, installedVersion})"
    - path: plugins/devflow/devflow/bin/lib/doctor-checks/26-checks-workflow-pin.cjs
      provides: "project doctor check `checks-workflow-pin`"
  key_links:
    - "checks-pin.cjs owns WORKFLOW_PATH, MANAGED_HEADER and DEFAULT_CHECKS_WORKFLOW (one definition) and requires only fs and path; gh-setup.cjs imports the three from it, so 61-06's gh-setup -> checks-pin require can never be circular"
    - "validate.cjs Check 17 -> checks-pin.collectPinFindings with installedVer || runningVer from Check 11"
    - "doctor-checks/26 -> checks-pin.collectPinFindings; doctor-checks/22 DEFERRED gains W062"
    - "61-06 (gh setup dry run) prints parseWorkflowPins(text).lines; 61-07 adds W063 after this TRD's Check 17"
---

# TRD 61-01: Stale checks-workflow pins in `validate health` and `doctor` (STOR-03)

<objective>
Repositories set up on v2.13.1 keep a `.github/workflows/devflow.yml` pinned to `@v2.13.1`, whose checks crash
(the live smoke, 2026-10-05). They stay broken until someone re-runs `gh setup --apply` after a release, and nothing
tells them to. Make `validate health` (new Check 17, code **W062**) and `df-tools doctor` (new project check 26,
`checks-workflow-pin`) warn when the managed workflow is pinned to a DevFlow release older than the installed plugin.

One pure module, `lib/checks-pin.cjs`, parses the pins and decides; validate and doctor are thin callers. The parser
is also what 61-06 prints in the `gh setup` dry run, so there is exactly one reader of the pin lines.

The managed workflow (rendered from `templates/github/devflow.yml`) carries the pin twice:

```yaml
jobs:
  devflow:
    uses: AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml@v2.13.1
    with:
      devflow-ref: v2.13.1
```

Decision rules (pinStatus):

```
managed   = one of the first 5 lines matches gh-setup MANAGED_HEADER (/^#\s*devflow:managed\b/), planWorkflow's rule
compared  = [devflow-ref]  +  [uses @ref, ONLY when the path before '@' === DEFAULT_CHECKS_WORKFLOW]
release   = /^v?(\d+)\.(\d+)\.(\d+)$/  (anything else: a branch or SHA, never compared)
installed = parseReleaseRef(installedVersion)   # null -> state 'not-comparable', no finding
stale     = compared refs that are release-shaped and < installed
state     = absent | not-managed | not-comparable | stale | current | ahead
W062 only when state === 'stale'
```

Purpose: STOR-03 and half of success criterion 2. Output: the module, Check 17, doctor check 26, the deferral.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── checks-pin.cjs                              ← CREATE
├── checks-pin.test.cjs                         ← CREATE
├── gh-setup.cjs                                ← MODIFY (three consts now imported from checks-pin.cjs)
├── validate.cjs                                ← MODIFY (Check 17, W062)
├── validate-checks-pin.test.cjs                ← CREATE
└── doctor-checks/
    ├── 26-checks-workflow-pin.cjs              ← CREATE
    ├── 26-checks-workflow-pin.test.cjs         ← CREATE
    ├── 22-validate-health.cjs                  ← MODIFY (DEFERRED += W062)
    ├── 21-22-project.test.cjs                  ← MODIFY (DEFERRED pin)
    └── README.md                               ← MODIFY (20-29 row)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD (kind plugin, work feature). Each tdd task commits RED (`test(61-01): ...`) before GREEN
  (`feat(61-01): ...`).
- Hand-built fixtures only (fixture_strategy generators, constraint no_llm_test_data). Workflow text comes from the
  real template via `require('./gh-setup.cjs').renderTemplates(cfg, version).workflow`, plus literal strings written in
  the test file. No generated data, no property-based libraries, no `.feature` files.
- `validate.cjs` and `22-validate-health.cjs` are edited again by 61-07 (W063) in wave 2. Keep Check 17 self-contained
  and put it directly after Check 16, so 61-07 appends Check 18 after it.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash
  call (no `&&`, `;`, pipes or `cd`). Use the repo copy of df-tools: the home mirror is stale.
- Never use port 8080. Nothing here starts a server.

## Test list

`checks-pin.test.cjs` (pure, in-process):

1. `parseWorkflowPins(renderTemplates({}, '2.13.1').workflow)` → `managed: true`,
   `uses: 'AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml@v2.13.1'`, `uses_path` the part before
   `@`, `uses_ref: 'v2.13.1'`, `devflow_ref: 'v2.13.1'`, and `lines` equal to
   `['uses: AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml@v2.13.1', 'devflow-ref: v2.13.1']`
   (trimmed, file order).
2. `renderTemplates({ checks_workflow: 'me/fork/.github/workflows/devflow-checks.yml@main' }, '2.14.0').workflow` →
   `uses_ref: 'main'`, `devflow_ref: 'main'`.
3. A literal workflow without the `# devflow:managed` header → `managed: false` (pins still parsed).
4. Text with no `uses:` / `devflow-ref:` lines → both `null`, `lines: []`. Non-string input → the same, never throws.
5. A quoted value (`devflow-ref: "v2.13.1"`) → `devflow_ref: 'v2.13.1'`.
6. `parseReleaseRef`: `'v2.13.1'` and `'2.13.1'` → `[2, 13, 1]`; `'main'`, `'v2.13'`, `'4f2a9c1'`, `''`, `null` → `null`.
7. `pinStatus` against installed `'2.14.0'`:
   - pins at v2.13.1 (default reusable workflow) → `state: 'stale'`, `stale` lists both `devflow-ref` and `uses` with
     ref `v2.13.1`;
   - pins at v2.14.0 → `'current'`; at v2.15.0 → `'ahead'` (no stale entries);
   - pins at `main` → `'not-comparable'`;
   - a fork `uses: me/fork/.github/workflows/devflow-checks.yml@v1.0.0` with `devflow-ref: v2.14.0` → `'current'`
     (a fork's own ref is never compared);
   - installed `'v2.14.0'` gives the same answers as `'2.14.0'`; installed `null` or `'dev'` → `'not-comparable'`.
8. `collectPinFindings({ projectRoot, installedVersion: '2.14.0' })` on temp dirs:
   - no `.github/workflows/devflow.yml` → `{ applicable: false, state: 'absent', findings: [] }`;
   - managed file at v2.13.1 → exactly one finding `{ code: 'W062', message, fix }`. The message starts with
     `checks-pin-stale:` and names `.github/workflows/devflow.yml`, `v2.13.1` and `2.14.0`. The fix names
     `df-tools gh setup --apply` and `github.checks_workflow`;
   - unmanaged file at v2.13.1 → `state: 'not-managed'`, no findings.

`validate-checks-pin.test.cjs` (in-process `cmdValidateHealth`, capture pattern from `validate-gh-health.test.cjs`
`runHealth`, with `installedPluginFn: () => ({ version: '2.14.0', installPath: '/fake' })`, `mainVersionFn: () => null`
and a temp `homeDir`):

9. Managed workflow rendered at 2.13.1 → `warnings` has one W062, `repairable: false`.
10. Rendered at 2.14.0 → no W062. No workflow file → no W062. Unmanaged file at an old ref → no W062.
11. `installedPluginFn: () => null` → the running engine version is used (`pluginVersion()`): a workflow rendered at
    `0.0.1` produces W062.

`26-checks-workflow-pin.test.cjs` (doctor-fixtures `makeDoctorHome`, `makeInstalledPlugin(home, { version: '2.14.0' })`,
`makeDoctorProject({ home })`; write the workflow file into the project root):

12. Stale → `severity: 'warn'`, `fixable: false`, the finding names `v2.13.1` and `2.14.0`, `fix_command` is
    `node ~/.claude/devflow/bin/df-tools.cjs gh setup --apply`, `details.pins` and `details.installed` present.
13. Current, ahead, branch pin, unmanaged and absent → `severity: 'ok'`, each with a distinct one-line finding (the
    branch pin finding says it is not compared).
14. No installed plugin registered → `ctx.pluginVersion` is the comparison version.
15. The module meets the contract: `id: 'checks-workflow-pin'`, `scope: 'project'`, a non-empty title, no `fix`.

`21-22-project.test.cjs`:

16. `health.DEFERRED` deep-equals `['E020', 'I022', 'W040', 'W057', 'W058', 'W059', 'W060', 'W061', 'W062']`, and a
    validate health JSON whose only warning is W062 classifies as `deferred: ['W062']` with severity ok.

<embedded_context>

<codebase_examples>
`gh-setup.cjs` today (lines 225-227, 706, 855-869) defines the three constants locally and exports only
`WORKFLOW_PATH`. Move all three into checks-pin.cjs and replace the local definitions in gh-setup.cjs with one import.
Keep `WORKFLOW_PATH` in gh-setup's `module.exports`, since existing importers use it there:

```js
// gh-setup.cjs after this TRD
const { WORKFLOW_PATH, MANAGED_HEADER, DEFAULT_CHECKS_WORKFLOW } = require('./checks-pin.cjs');
// checks-pin.cjs
const WORKFLOW_PATH = '.github/workflows/devflow.yml';
const MANAGED_HEADER = /^#\s*devflow:managed\b/;
const DEFAULT_CHECKS_WORKFLOW = 'AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml';
```

checks-pin.cjs requires only `fs` and `path`. 61-06 makes gh-setup.cjs require checks-pin.cjs for `parseWorkflowPins`,
so checks-pin must never require gh-setup (a circular require hands back a half-built `module.exports`). That also keeps
validate health's new require light (gh-setup pulls in gh-client, gh-capability, gh-project and gh-outbox).

`renderTemplates(cfg, version)` fills `{{checks_workflow}}` (configured value, or the default @`v<version>`) and
`{{devflow_ref}}` (the configured @ref, else `v<version>`). It reads `templates/github/` relative to the module, so it
works from tests.

validate.cjs Check 16 (lines 725-743), the shape to copy for Check 17, placed right after it:

```js
  try {
    const r = require('./gh-health.cjs').collectStoreHealth(cwd, { home: homeDir });
    if (r && r.applicable) {
      for (const f of r.findings) addIssue('warning', f.code, f.message, f.fix, false);
    }
  } catch (e) {
    addIssue('warning', 'W061', `gh-health-check-failed: ${e.message}`, '...', false);
  }
```

`installedVer` and `runningVer` are already computed by Check 11 (lines 469-487) in the same function scope.

doctor check contract: `doctor-checks/README.md`. A project check's `run(ctx)` gets `ctx.projectRoot`, `ctx.userHome`,
`ctx.pluginVersion`. Installed version: `helpers.installedPlugin({ homeDir: ctx.userHome })` (returns
`{version, installPath}` or null), the same call `12-hooks-registry.cjs` makes. `25-gh-store-sync.cjs` is the closest
precedent of a project check over a shared collector that validate health also calls.

doctor-checks/22-validate-health.cjs line 25:

```js
const DEFERRED = ['E020', 'I022', 'W040', 'W057', 'W058', 'W059', 'W060', 'W061'];
```

Its header comment lists who owns each deferred code; add "W062 (checks-workflow pin, checks-workflow-pin, TRD 61-01)".
</codebase_examples>

<anti_patterns>
- Do not compare with string order (`'v2.9.0' > 'v2.13.1'` is true). Compare the three integers.
- Do not treat a branch or SHA pin as stale. A team pinned to `main` chose to track it.
- Do not compare the `uses:` ref of a reusable workflow other than DevFlow's default: a fork has its own versioning.
  `devflow-ref` is always DevFlow's runner ref, so it is always compared when release-shaped.
- Do not make W062 repairable and do not give the doctor check a `fix()`. Re-pinning needs `gh setup --apply` plus a
  pull request, which a health repair must never do.
- Do not read `.github/workflows/devflow.yml` in validate through gh or git. It is a local file read.
- Do not define the workflow path, header regex or default reusable workflow twice, and do not require gh-setup.cjs
  (or any gh-* module) from checks-pin.cjs.
</anti_patterns>

<error_recovery>
- If a test or module imports `MANAGED_HEADER` or `DEFAULT_CHECKS_WORKFLOW` from gh-setup.cjs
  (`rg -n "DEFAULT_CHECKS_WORKFLOW|MANAGED_HEADER" plugins`), re-export them from gh-setup.cjs as well. Do not make
  checks-pin import gh-setup.
- If `validate.test.cjs` or another existing health test starts seeing W062, a fixture there has a managed
  devflow.yml. Check that with `rg -n "devflow:managed" plugins --glob '*.test.*'`. Do not loosen Check 17. Pass
  `installedPluginFn` in that test so its version matches.
- If `21-22-project.test.cjs` has more than one place pinning the DEFERRED list, update each one.
</error_recovery>

</embedded_context>

<gotchas>
- `parseWorkflowPins` matches lines with `/^\s*uses:\s*(\S+)/` and `/^\s*devflow-ref:\s*(\S+)/`, takes the first of each,
  and strips one pair of surrounding `'` or `"`. `uses_path` and `uses_ref` split at the LAST `@`. No `@` means
  `uses_ref: null`.
- `managed` is `text.split(/\r?\n/).slice(0, 5).some((l) => MANAGED_HEADER.test(l))`, the exact test gh-setup's
  `planWorkflow` (line 371) uses to decide between `update` and `conflict`. Both must agree on what "managed" means.
- Finding message, exact shape (one line):
  `checks-pin-stale: .github/workflows/devflow.yml pins DevFlow <ref> (<fields joined ', '>), older than the installed plugin <installed>`.
  Fix: ``Run `df-tools gh setup --apply` to re-pin it, then merge the workflow pull request it prints. If github.checks_workflow in .planning/config.json names an @ref, update that first: setup re-renders the configured ref.``
  When the two fields disagree, name the older ref.
- Check 17 failure path: `addIssue('warning', 'W062', `checks-pin-check-failed: ${e.message}`, 'Run `df-tools doctor` to see why', false)`.
  This follows Check 12b, which reuses its own code for its failure line.
- Doctor check 26's ok findings (pick clear wording; tests assert they differ): absent, not managed by gh setup, pinned
  to `<ref>` (a branch or SHA, not compared), pinned to `<ref>` (installed `<v>`).
- README 20-29 row: append `` `26-checks-workflow-pin` (TRD 61-01; owns W062, which `22` defers) ``.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: checks-pin.cjs, the pin parser and the stale decision (tests 1-8)</name>
  <files>plugins/devflow/devflow/bin/lib/checks-pin.cjs, plugins/devflow/devflow/bin/lib/checks-pin.test.cjs, plugins/devflow/devflow/bin/lib/gh-setup.cjs</files>
  <action>
RED: write tests 1-8 in `checks-pin.test.cjs`. Build every workflow text with `renderTemplates` or as a literal in the
test file. Use temp dirs (`fs.mkdtempSync(path.join(os.tmpdir(), 'df-checks-pin-'))`) for test 8 and remove them in
`after`. Run the file and watch it fail (no module). Commit `test(61-01): checks workflow pin parser and stale decision`.

GREEN: create `checks-pin.cjs` (requires only fs and path) with a header comment that gives the decision rules from the
objective, the W062 contract and the consumers (validate Check 17, doctor check 26, 61-06's dry run, gh-setup's
constants). Export `WORKFLOW_PATH`, `MANAGED_HEADER`, `DEFAULT_CHECKS_WORKFLOW`, `parseWorkflowPins`,
`parseReleaseRef`, `pinStatus`, `readWorkflowPin` and `collectPinFindings`. In gh-setup.cjs replace the three local
constants with the import. `readWorkflowPin(root)` returns `{state: 'absent'}` on ENOENT and otherwise
`{state: 'present', text, pins}`. `collectPinFindings` never throws for a missing file; it may throw for an unreadable
one, and the callers catch that. Commit `feat(61-01): checks-pin decides when the DevFlow checks workflow pin is stale`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/checks-pin.test.cjs plugins/devflow/devflow/bin/lib/gh-setup.test.cjs plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs` passes.</verify>
  <done>Tests 1-8 went RED then GREEN in separate commits. gh-setup.cjs changed only where the three constants are now imported, and `rg -n "require\(" plugins/devflow/devflow/bin/lib/checks-pin.cjs` shows only fs and path.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: validate health Check 17 (W062) (tests 9-11)</name>
  <files>plugins/devflow/devflow/bin/lib/validate.cjs, plugins/devflow/devflow/bin/lib/validate-checks-pin.test.cjs</files>
  <action>
RED: write tests 9-11 in `validate-checks-pin.test.cjs`. Reuse the `runHealth` capture pattern (stdout and
`process.exit` swapped and restored in `finally`) and a minimal `.planning/` project. Copy the smallest fixture that
gets past Check 1-4: look at `validate-gh-health.test.cjs` and `validate.test.cjs` `makePlanningProject`. Commit
`test(61-01): validate health warns on a stale checks workflow pin`.

GREEN: add Check 17 after Check 16 with a header comment: objective 61 STOR-03; W062 is a warning, never repairable; a
local file read with no gh call; the comparison version is `installedVer || runningVer`; a check that cannot run is
never silent. Commit `feat(61-01): validate health Check 17 reports W062 for a stale checks workflow pin`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/validate-checks-pin.test.cjs plugins/devflow/devflow/bin/lib/validate.test.cjs plugins/devflow/devflow/bin/lib/validate-gh-health.test.cjs` passes. `node plugins/devflow/devflow/bin/df-tools.cjs validate health --raw` in this repo shows no W062 (it has no managed devflow.yml).</verify>
  <done>W062 fires only for a managed, release-pinned, older workflow. Existing health tests are unchanged and green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: doctor check 26-checks-workflow-pin and the W062 deferral (tests 12-16)</name>
  <files>plugins/devflow/devflow/bin/lib/doctor-checks/26-checks-workflow-pin.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/26-checks-workflow-pin.test.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/22-validate-health.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/README.md</files>
  <action>
RED: write tests 12-15 in the new test file. Use doctor-fixtures builders only, with homes under the OS temp dir;
never the real `~/.claude`. Update test 16's DEFERRED pin in `21-22-project.test.cjs` and add its classify case.
Commit `test(61-01): doctor check for a stale checks workflow pin`.

GREEN: create `26-checks-workflow-pin.cjs` per the contract (report only: no `fix`). Add `'W062'` to DEFERRED in
`22-validate-health.cjs` and extend its header comment. Add the README row text from the gotchas. Commit
`feat(61-01): doctor check 26 warns when the checks workflow pin is older than the plugin`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/doctor-checks/26-checks-workflow-pin.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs` passes. `node plugins/devflow/devflow/bin/df-tools.cjs doctor --json` in this repo lists a `checks-workflow-pin` result with severity ok.</verify>
  <done>The doctor reports a stale pin once, through check 26, and check 22 lists W062 as deferred.</done>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/devflow/bin/lib/checks-pin.test.cjs plugins/devflow/devflow/bin/lib/validate-checks-pin.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/26-checks-workflow-pin.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs`.
</validation_gates>

<verification>
- All new and touched test files pass. `validate.test.cjs`, `validate-gh-health.test.cjs`, `gh-setup*.test.cjs` and
  `doctor.e2e.test.cjs` are unchanged and green.
- `rg -n "W062" plugins/devflow/devflow/bin/lib --glob '!*.test.*'` shows checks-pin.cjs, validate.cjs and
  22-validate-health.cjs only.
</verification>

<success_criteria>
- [ ] `validate health` warns W062 on a managed workflow pinned older than the installed plugin, and never otherwise
- [ ] `doctor` check 26 warns on the same condition with the `gh setup --apply` fix, and check 22 defers W062
- [ ] One parser (`parseWorkflowPins`) and one decision (`pinStatus`), shared by both callers
</success_criteria>

<output>
After completion, create `.planning/objectives/61-store-mode-rough-edges-and-observability/61-01-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`.
</output>
