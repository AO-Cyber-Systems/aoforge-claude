---
objective: 61-store-mode-rough-edges-and-observability
trd: "09"
type: standard
wave: 3
depends_on: ["61-01", "61-02", "61-03", "61-04", "61-05", "61-06", "61-07", "61-08"]
files_modified:
  - CHANGELOG.md
  - CLAUDE.md
  - docs/USER-GUIDE.md
  - scripts/gen-docs-data.cjs
  - site/content/docs/guides/telemetry.md
autonomous: true
requirements: [STOR-01, STOR-02, STOR-03, STOR-04, OBS-01, OBS-02, OBS-03, OBS-04]
must_haves:
  truths:
    - "Each success criterion is observed through the shipped commands, outside the unit tests: the setup dry run's pins and gh pr create step, W062 and doctor check 26 on a scratch project, W063 and doctor check 13 on a scratch home, the skill gate's block, deny and silence, telemetry --scan and its flag error, the SessionStart export with its throttle and skip env, and no I001"
    - "CHANGELOG [Unreleased] records every change in objective 61 under Added, Changed or Fixed"
    - "CLAUDE.md's hook inventory states the final gate-skill-requires.js and upgrade-project.js behaviour and escapes; the telemetry and model-profile notes are current; it grows by at most a few lines"
    - "USER-GUIDE documents requires:, W062, W063, telemetry --scan and the automatic transcript export, and its Known issues no longer list the dry-run pins, the missing PR command or slug PR titles"
    - "Full `npm test` passes except failures proven pre-existing on the objective's base commit"
  artifacts:
    - path: docs/USER-GUIDE.md
      provides: "hooks table rows; sections on skill requirements, checks-workflow pins, model ids, telemetry --scan and the automatic transcript export"
    - path: scripts/gen-docs-data.cjs
      provides: "HOOK_DOCS['gate-skill-requires.js'] and the updated 'upgrade-project.js' entry"
  key_links:
    - "hook-inventory.test.cjs keeps CLAUDE.md and hooks.json in step after the bullet rewrite"
    - "doc-refs.repo.test.cjs keeps command references valid"
---

# TRD 61-09: Dogfood, document, full test suite

<objective>
Close the objective.

1. **Dogfood.** Run every success criterion through the real commands, in scratch directories and scratch homes,
   never this checkout's `.planning/` or the real `~/.claude` (apart from read-only `telemetry --scan` and
   `validate health` here). Add one read-only live `gh setup` dry run against the smoke repository, and one
   best-effort live Claude Code check of the skill gate.
2. **Document.** CHANGELOG, CLAUDE.md (hook inventory and two notes), USER-GUIDE, the docs-site data in
   `scripts/gen-docs-data.cjs`, and the telemetry guide's transcript-export paragraph.
3. **Full suite.** `npm test`, with any failure shown to be pre-existing on the objective's base commit.

Purpose: every success criterion is observable outside the unit tests, and every user-facing surface states the shipped
behaviour. Output: doc edits, plus dogfood evidence in the SUMMARY.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- No production code changes in this TRD. If the dogfood finds a defect, stop. Record it in the SUMMARY as a gap, with
  the exact command and output, for the verifier and gap closure. Do not patch it here.
- Scratch work lives under the session scratchpad (outside the repository). Use the repo copy of df-tools
  (`node <checkout>/plugins/devflow/devflow/bin/df-tools.cjs`). The home mirror is stale.
- Nothing writes to GitHub. The live `gh setup` run is the dry run only: never `--apply`, never a PR, never a push.
- Do not run the transcript export against the real `~/.claude`; use a scratch HOME.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash
  call (no `&&`, `;`, pipes or `cd`). Set an env var for one run with an inline prefix (`HOME=<dir> node ...`).
- Never use port 8080. Nothing here starts a server.
- No transcript content, credentials or other-repo paths in any doc.

<embedded_context>

<codebase_examples>
Docs that already describe these surfaces and must stay consistent:

- CLAUDE.md `### Hooks`:
  - the `upgrade-project.js` bullet (Session context; escapes `DEVFLOW_SKIP_UPGRADE=1`, `DEVFLOW_SKIP_PRUNE=1`);
  - the `gate-skill-requires.js` bullet 61-08 added (Enforcement).
- CLAUDE.md `### Core Tool` → the `Telemetry & audit` bullet (names `telemetry` and `transcript-export`), and the
  model-profiles paragraph ("keep those ids current when models ship; a stale id resolves to a model that never runs").
- `docs/USER-GUIDE.md`:
  - the hooks table (columns Hook | Event | Behaviour | Escape);
  - **Opening the workflow pull request** (~line 1159), which says the steps give no command;
  - **Picking up a fixed checks workflow**;
  - **Known issues** (~line 1299). Three bullets are now fixed: the dry-run pins (~1305), the missing PR command
    (~1306) and slug PR titles (~1308, the PR half only). The note that the title is create-only stays true.
- `scripts/gen-docs-data.cjs` `HOOK_DOCS` (lines ~137-160): `'<file>': [group, purpose, escape]`. A missing entry
  renders as group "Other" with an empty purpose.
- `site/content/docs/guides/telemetry.md` `## Transcript export` says "Run it periodically"; it now runs daily on its own.
- CHANGELOG `## [Unreleased]` has `### Added`, `### Changed` and `### Fixed`.
</codebase_examples>

<anti_patterns>
- Do not dogfood in this checkout's `.planning/` or with the real HOME for anything that writes.
- Do not restate numbers from memory. Quote command output captured in Task 1.
- Do not expand CLAUDE.md beyond the bullets and two one-sentence notes. It is resident context on every turn.
- Do not document a behaviour the dogfood did not observe. If a row failed, document the shipped state and record the gap.
</anti_patterns>

<error_recovery>
- If `gh` is not authenticated, or the smoke repository cannot be cloned, record `live dry run: skipped — <exact reason>`
  and quote 61-06's `gh-setup-cli.test.cjs` test 10 output instead (run it with `--test-name-pattern`).
- If the live Claude Code check cannot load the clone's plugin (an unknown `--plugin-dir`, the installed
  `devflow@aocyber` shadowing it, auth, network, or `UserPromptExpansion` not firing in `-p` mode), record
  `live check: skipped — <exact reason>`. The stdin smoke is the required evidence.
- Pre-existing `npm test` failures: run the same failing file at the objective's base commit in a scratch worktree
  (`git worktree add <scratch> <base>`, then `node --test <file>` there, then `git worktree remove`), and record the
  comparison. MA-7 (`doctl auth init`) and the devflow-watch / handoff-e2e environmental failures are known from
  objectives 35 and 44.
</error_recovery>

</embedded_context>

<gotchas>
- `<base>`: the commit before 61-01's first commit (`git log --format=%H --reverse --grep="(61-01)" | head -1`, then
  its parent). Run that as two plain commands.
- Scratch project for D3: a temp dir with a minimal `.planning/` (PROJECT.md, ROADMAP.md, STATE.md and config.json
  copied from a `makeDoctorProject` run, or written by hand) and `.github/workflows/devflow.yml` rendered with
  `node -e "process.stdout.write(require('<checkout>/plugins/devflow/devflow/bin/lib/gh-setup.cjs').renderTemplates({}, '2.12.0').workflow)"`.
  Write it with the Write tool from the captured text. Use a version older than the installed plugin (2.13.1 on this
  machine; read it from `validate health --raw` `engine.installed`).
- Scratch HOME for D4: copy the checkout's `references/model-profiles.json` (with opus set back to `claude-opus-5`) and
  `references/model-rates.json` into `<home>/.claude/devflow/references/`, then
  `HOME=<home> node <checkout>/plugins/devflow/devflow/bin/df-tools.cjs doctor --global --json`.
- Skill-gate stdin smoke (D5): write each payload to `<scratchpad>/p-<name>.json`, then run
  `PATH=<dir> node <checkout>/plugins/devflow/hooks/gate-skill-requires.js < <scratchpad>/p-<name>.json`. `<dir>` is
  an empty scratch dir, or one holding a symlink named `gh` to `$(which gh)`.
- Live skill-gate check (best effort): in a scratch dir, make a bin dir holding symlinks to `node` and `claude` only.
  Find each with `which`; gh lives in /opt/homebrew/bin, so that dir must not be on PATH. Run
  `PATH=<bin>:/usr/bin:/bin claude -p --plugin-dir <checkout>/plugins/devflow "/devflow:gh-sync status"` with Bash
  timeout 300000. Pass: the output shows the block reason naming gh and /devflow:doctor.
- Transcript-export dogfood (D7): scratch HOME with `<home>/.claude/projects/-tmp-demo/s1.jsonl` holding two literal
  JSONL records. Run
  `HOME=<home> DEVFLOW_SKIP_UPGRADE=1 node <checkout>/plugins/devflow/hooks/upgrade-project.js < /dev/null`.
  `DEVFLOW_SKIP_UPGRADE=1` is REQUIRED: the Bash cwd is this checkout, which is a DevFlow project stamped behind the
  bundled version, so without it the hook would apply migrations here and fork a commit child. Step 0b runs before
  that check, so the escape leaves the export path intact (61-05 test 9 proves the escapes are independent).
- USER-GUIDE new sections:
  - **Skills that need a tool (`requires:`)**: the field, which skills declare what (gh-sync: gh), the block and deny
    behaviour, the remediation through `/devflow:doctor` check 14, the escape, and that the gate fails open;
  - **Stale checks-workflow pins (W062)**: what is compared (devflow-ref, DevFlow's own `uses:` ref) and what is not
    (branches, SHAs, forks), doctor check 26, and the fix (`gh setup --apply`, the `github.checks_workflow` caveat, the
    workflow PR);
  - **Model ids (W063)**: currency comes from model-rates.json; doctor check 13; the CI guard;
  - in the telemetry area: `telemetry --scan` flags and the error on unknown flags; the automatic daily transcript
    export (where the stamp lives, the index path, `DEVFLOW_SKIP_TRANSCRIPT_EXPORT=1`, a background child);
  - rewrite **Opening the workflow pull request** around the printed `gh pr create --head devflow-setup --fill`. Keep
    the stale local `devflow-setup` branch advice.
  - Every new section notes that the behaviour needs an installed plugin carrying objective 61.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Dogfood every success criterion (D1-D8)</name>
  <files>(none in the repository — scratchpad only)</files>
  <action>
Run each row and record the exact command and the relevant output lines in the SUMMARY.

| # | SC | Run | Expect |
|---|----|-----|--------|
| D1 | 1 | Clone `AO-Cyber-Systems/devflow-store-smoke` into the scratchpad (`gh repo clone ... <dir>`). Run `node <checkout>/plugins/devflow/devflow/bin/df-tools.cjs --cwd <dir> gh setup`, the dry run (read-only). | `uses:` and `devflow-ref:` lines under the workflow action (with `was` lines if it re-pins), and `gh pr create --head devflow-setup --fill` in the preview when a file would be written. If nothing would be written, record that and also quote 61-06 test 10. |
| D2 | 1 | `node --test --test-name-pattern "fresh store" <checkout>/plugins/devflow/devflow/bin/lib/gh-pr-title.test.cjs` | Passes: the PR title is the OBJECTIVE.md name. No live PR is created. |
| D3 | 2 | Scratch project with a managed workflow at 2.12.0. Run `validate health --raw` and `doctor --json --path <proj>`. Then re-render at the installed version and run both again. | W062, and `checks-workflow-pin` warn with the `gh setup --apply` fix. Then neither. |
| D4 | 2, 3 | `node -e` printing `models` from the checkout's model-profiles.json; scratch-HOME `doctor --global --json` with opus set to claude-opus-5; `validate health --raw` in this checkout. | `claude-opus-5-5` / `claude-sonnet-5-5`; `model-profiles` warns `superseded by claude-opus-5-5`; no W063 here. |
| D5 | 4 | Stdin smoke of gate-skill-requires.js: UserPromptExpansion `/devflow:gh-sync status` and Skill `devflow:gh-sync`, each with an empty PATH dir and with a gh symlink dir; `/devflow:status`; `/review`; `DEVFLOW_SKIP_SKILL_REQUIRES=1`. Then `HOME=<scratch home> DEVFLOW_DOCTOR_PLUGIN_ROOT=<checkout>/plugins/devflow PATH=<empty dir>:<node dir> node <checkout>/.../df-tools.cjs doctor --global --json`. A scratch HOME has no installed plugin, so the override (the checkout's skills, where gh-sync declares gh) is what check 14 reads; the real HOME would read the installed 2.13.1 skills, which declare nothing. Then the live check (gotchas). | block / deny naming gh and /devflow:doctor without gh; `''` with gh, for status, for review and with the escape; doctor `skill-requires` warns naming gh-sync; live check pass, fail or skipped with the reason. |
| D6 | 5 | `node <checkout>/.../df-tools.cjs telemetry --scan --limit 20 --raw`, then `telemetry --scna` | A JSON `blocks` object and a `scan` object; then exit 1 with `unknown flag: --scna`. |
| D7 | 5 | The upgrade-project.js run in a scratch HOME with `DEVFLOW_SKIP_UPGRADE=1` (gotchas), three times: plain; immediately again; with `DEVFLOW_SKIP_TRANSCRIPT_EXPORT=1` added, in a fresh scratch HOME. Afterwards confirm `git status --porcelain` in this checkout shows nothing new. | Stamp written and the index has the `s1` row (poll up to 15 s); the second run leaves the stamp bytes unchanged; the skip run writes no stamp. stdout is always empty. |
| D8 | 5 | `validate health --raw` in this checkout | No I001. |

Any row that differs from Expect is a defect: stop and record it (binding rules). Remove the scratch clones and homes at
the end. No commit.
  </action>
  <verify>The SUMMARY has the D1-D8 table with the actual outputs and the live-check results.</verify>
  <done>All eight rows match, or each mismatch is recorded as a gap with its command and output.</done>
</task>

<task type="auto">
  <name>Task 2: CHANGELOG, CLAUDE.md, USER-GUIDE, docs-site data and the telemetry guide</name>
  <files>CHANGELOG.md, CLAUDE.md, docs/USER-GUIDE.md, scripts/gen-docs-data.cjs, site/content/docs/guides/telemetry.md</files>
  <action>
1. `CHANGELOG.md` `## [Unreleased]`:
   - `### Added`:
     - `requires:` skill frontmatter, `hooks/gate-skill-requires.js` (UserPromptExpansion + PreToolUse(Skill)) and
       doctor check 14 `skill-requires`;
     - validate health W062 and doctor check 26 `checks-workflow-pin`;
     - validate health W063 and doctor check 13 stale-id detection from model-rates.json;
     - `telemetry --scan [--limit] [--since] [--root]`;
     - the SessionStart transcript export (daily, background, `DEVFLOW_SKIP_TRANSCRIPT_EXPORT=1`);
     - the `gh setup` dry run's pin lines and follow-up preview.
   - `### Changed`:
     - model-profiles.json pins `claude-opus-5-5` / `claude-sonnet-5-5`;
     - printed branch-and-PR steps end with `gh pr create --head <branch> --fill` (setup, migration 0010, doctor check 20).
   - `### Fixed`:
     - `telemetry` silently ignored `--scan` and every other flag;
     - objective PR titles used the directory slug on a fresh store;
     - the missing 09-03 SUMMARY (I001).
2. `CLAUDE.md`:
   - finalise the `gate-skill-requires.js` bullet ("needs an installed plugin carrying objective 61");
   - extend the `upgrade-project.js` bullet with the daily background transcript export and
     `DEVFLOW_SKIP_TRANSCRIPT_EXPORT`;
   - add `telemetry --scan` to the Telemetry & audit bullet;
   - add one sentence to the model-profiles paragraph: doctor check 13 and validate health W063 flag a pin that
     model-rates.json shows superseded;
   - in the Doctor bullet's check list, name 14 (skill-requires) and 26 (checks-workflow-pin).
3. `docs/USER-GUIDE.md`:
   - hooks table: a `gate-skill-requires.js` row (Event `UserPromptExpansion, PreToolUse (Skill)`, Escape
     `DEVFLOW_SKIP_SKILL_REQUIRES=1`) and the new escape on the upgrade-project row;
   - the new sections and the rewrite from the gotchas;
   - remove the three fixed Known-issues bullets (keep the create-only title note where it still applies).
4. `scripts/gen-docs-data.cjs`:
   - add `'gate-skill-requires.js': ['Enforcement', '<purpose, as in the CLAUDE.md bullet>', 'DEVFLOW_SKIP_SKILL_REQUIRES=1']`;
   - extend the `upgrade-project.js` purpose and escape with the transcript export.
5. `site/content/docs/guides/telemetry.md`: replace "Run it periodically ..." with the automatic daily export, the
   skip env and the manual command for a full copy (`--full`).

Run `node --test plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs`
and load the data script the way its header says (to a scratch output if it writes files). Commit
`docs(61-09): document skill requires, stale pins and model ids, telemetry --scan and the transcript export`.
  </action>
  <verify>`rg -n "gate-skill-requires" CHANGELOG.md CLAUDE.md docs/USER-GUIDE.md scripts/gen-docs-data.cjs` matches in all four. `rg -n "W062|W063|DEVFLOW_SKIP_TRANSCRIPT_EXPORT|telemetry --scan" docs/USER-GUIDE.md` matches each. `rg -n "then open a pull request for that branch" docs/USER-GUIDE.md plugins/devflow` matches only USER-GUIDE text that quotes the old wording as history, or nothing. hook-inventory and doc-refs pass.</verify>
  <done>Every surface describes the shipped behaviour, and the fixed Known issues are gone.</done>
</task>

<task type="auto">
  <name>Task 3: Full test suite</name>
  <files>(none)</files>
  <action>
Run `npm test` from your checkout (stack gate `test`, timeout up to 900 s; run it in the background if needed). For
every failing test file, prove it is pre-existing: run the same file at `<base>` in a scratch worktree
(error_recovery), and record `file: fails at base too (reason)` in the SUMMARY. A failure that does not reproduce at
base is a regression from this objective. Do not fix it here; record it as a gap with the failing assertion.

Record the totals (tests, pass, fail, skipped) in the SUMMARY. No commit.
  </action>
  <verify>The `npm test` totals are recorded, and every failure is matched to a base-commit run.</verify>
  <done>The suite passes except proven pre-existing failures, or each regression is recorded as a gap.</done>
</task>

</tasks>

<validation_gates>
- Objective gate (stack `gates.objective` → `test`): `npm test`.
</validation_gates>

<verification>
- D1-D8 match Expect (or the gaps are recorded), and no GitHub write happened.
- The five doc surfaces mention the shipped behaviour; hook-inventory and doc-refs pass.
- `npm test` shows no regressions (failures limited to the proven pre-existing set).
</verification>

<success_criteria>
- [ ] SC1-SC5 observed through the real commands
- [ ] CHANGELOG, CLAUDE.md, USER-GUIDE, gen-docs-data and the telemetry guide are updated
- [ ] Full suite green apart from pre-existing failures
</success_criteria>

<output>
After completion, create `.planning/objectives/61-store-mode-rough-edges-and-observability/61-09-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`.
</output>
