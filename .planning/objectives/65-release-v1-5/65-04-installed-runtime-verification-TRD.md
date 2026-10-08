---
objective: 65-release-v1-5
trd: "04"
type: standard
wave: 4
depends_on: ["65-03"]
files_modified:
  - .planning/config.json
autonomous: false
requirements: [REL-02]
must_haves:
  truths:
    - "The installed plugin record (`~/.claude/plugins/installed_plugins.json`, `devflow@aocyber`) reads version 2.14.0 with an installPath ending `/devflow/2.14.0`"
    - "`~/.claude/devflow/.plugin-version` reads 2.14.0 after a session restart, which means sync-runtime mirrored the new runtime"
    - "The mirror holds the v1.5 libraries: `~/.claude/devflow/bin/lib/{todo-sync,todo-session,checks-pin,estimate-backtest,skill-requires,builtin-audit}.cjs` all exist"
    - "The installed plugin registers the v1.5 hooks: `gate-bash-writes.js` on PreToolUse(Bash), `gate-skill-requires.js` on UserPromptExpansion and PreToolUse(Skill), and `todo-sync.js` on Stop. All three files exist under the installPath"
    - "`df-tools doctor --json` (mirror) reports engine 2.14.0, `runtime-mirror` ok, `hooks-registry` ok with 20 registered hook files, `model-profiles` ok, and includes the v1.5 check ids `skill-requires` and `checks-workflow-pin`"
    - "`df-tools validate health` (mirror) reports engine 2.14.0 and none of E020, W021 or I022, so there is no mirror lag"
  artifacts: []
  key_links:
    - "merge to main (65-03) -> `claude plugin marketplace update aocyber` + `claude plugin update devflow@aocyber` -> plugin cache 2.14.0"
    - "session restart -> SessionStart sync-runtime.js -> ~/.claude/devflow mirror + .plugin-version/.plugin-digest"
    - "session restart -> SessionStart upgrade-project.js -> .planning/config.json devflow.version stamp (clears W040)"
---

# TRD 65-04: Installed runtime verification after update and restart (REL-02)

<objective>
Get the released 2.14.0 plugin installed on this machine and the runtime re-mirrored by a session restart. Then prove
that the installed runtime carries the v1.5 libraries and hooks, and that doctor and validate health report no mirror lag.

Purpose: REL-02 and roadmap criteria 3 and 4. Until this runs, the mirror is 2.13.2 and the registry says 2.13.1 (doctor:
`mirror ahead`, health: W021, I022). It has none of the v1.5 libs, and the installed hooks.json registers 16 scripts
without gate-bash-writes, gate-skill-requires or todo-sync. Objective 66 depends on the installed executor prompt that
only this release delivers.
Output: a verification record in the SUMMARY that compares the 65-01 baseline with the result after install.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/65-release-v1-5/65-03-SUMMARY.md
@.planning/objectives/65-release-v1-5/65-01-SUMMARY.md

**Why a human-action checkpoint.** A running Claude Code session cannot restart itself, and the plugin swap only takes
effect in a new session ("restart required to apply"). The restart is the one step only the user can do. Also, this repo
runs yolo with auto-advance, and `human-action` is the only checkpoint type that stops there.

**Resumption across the restart.** The restart ends this executor and orchestrator. The user resumes with
`/devflow:execute-objective 65` in the new session. 65-04 has no SUMMARY yet, so it starts again at Task 1. Task 1
therefore checks first whether the install and restart already happened, and if so continues without asking.

Baseline captured at planning time (2026-10-07), to compare against:
- `installed_plugins.json` devflow@aocyber: version 2.13.1, installPath `…/cache/aocyber/devflow/2.13.1`,
  gitCommitSha d79fed0c.
- `~/.claude/devflow/.plugin-version`: 2.13.2.
- doctor (mirror): runtime-mirror warn `mirror ahead`, hooks-registry ok `17 registered`, model-profiles shows
  `opus=claude-opus-5`, and no `skill-requires` or `checks-workflow-pin` checks.
- health (mirror): W021 `installed 2.13.1, origin/main 2.13.2`, W040 `stamped v2.13.1`, I022 `mirror-ahead`, and W006 for
  objectives 66-75.

Hard rules:
- Use one plain command per Bash call.
- Never run `rm -rf` on the stale plugin cache dirs that doctor `plugin-cache` lists. That is outside this objective.
  Record it only.
- Never use port 8080.
</context>

<embedded_context>

<codebase_examples>
Plugin manager commands (Claude Code 2.1.293, `claude plugin --help`):
```
claude plugin marketplace update aocyber     # refresh the aocyber marketplace clone from GitHub main
claude plugin update devflow@aocyber          # update to the latest version (restart required to apply)
```
In-session equivalent: `/plugin`, then aocyber, then devflow, then Update.

Read the installed record with:
```bash
node -e 'const j=require(process.env.HOME+"/.claude/plugins/installed_plugins.json");const e=(j.plugins||j)["devflow@aocyber"];console.log(JSON.stringify(e))'
```
(At planning time the top-level shape held `"devflow@aocyber": [ { scope, installPath, version, gitCommitSha, … } ]`.
Read whichever shape is present and print it, and do not assume.)

Check the hook registration in the installed hooks.json:
```bash
node -e 'const h=require(process.argv[1]).hooks;const f=(ev,s)=>(h[ev]||[]).some(g=>(g.hooks||[]).some(x=>String(x.command).includes(s)));const r={bash:f("PreToolUse","gate-bash-writes.js"),skillPre:f("PreToolUse","gate-skill-requires.js"),skillExp:f("UserPromptExpansion","gate-skill-requires.js"),todoStop:f("Stop","todo-sync.js")};console.log(JSON.stringify(r));process.exit(Object.values(r).every(Boolean)?0:1)' /Users/justin/.claude/plugins/cache/aocyber/devflow/2.14.0/hooks/hooks.json
```
</codebase_examples>

<anti_patterns>
- Verifying from the repo copy (`plugins/devflow/devflow/bin/df-tools.cjs`). This TRD is about the installed runtime,
  so every doctor and health command uses `~/.claude/devflow/bin/df-tools.cjs`.
- Running `doctor --fix` to make findings disappear. Report mode only. The single allowed write is the W040 stamp in
  Task 2, step 6.
- Calling W006 (objectives 66-75 have no directories), `plugin-cache` (stale cache dirs) or `legacy-runtime-state`
  mirror lag. They are not, so record them as unrelated.
</anti_patterns>

<error_recovery>
- `claude plugin update` says it is already at the latest version while the record still shows 2.13.1: the marketplace
  clone is stale. Run `claude plugin marketplace update aocyber` first, then update again.
- After restart `.plugin-version` is still 2.13.2: sync-runtime did not mirror, or the session started before the update
  finished. Check `ls ~/.claude/plugins/cache/aocyber/devflow/` for `2.14.0`. If doctor `runtime-mirror` is `fixable`,
  report its `fix_command`, and do not run `--fix` without the user's say-so. Re-present Task 1 asking for one more
  restart.
- doctor `runtime-mirror` reports a digest mismatch at the same version: report it with `details`. This is real lag, and
  REL-02 is not met until it clears.
- W040 is still present after restart (upgrade-project skipped, for example because the tree was dirty): see Task 2,
  step 6.
</error_recovery>

</embedded_context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Human action: update the installed plugin to 2.14.0 and restart Claude Code</name>
  <files>(none in the repo — ~/.claude/plugins/ install state and the ~/.claude/devflow mirror)</files>
  <action>
Pre-check (read-only):
- the installed record (codebase_examples node one-liner);
- `cat /Users/justin/.claude/devflow/.plugin-version`;
- `ls /Users/justin/.claude/plugins/cache/aocyber/devflow/`.

Idempotency: if the record shows 2.14.0 AND `.plugin-version` is 2.14.0, the update and restart already happened. Record
`already done (found at pre-check)` and continue to Task 2 without asking.

Otherwise STOP and present:

"2.14.0 is on main and tagged (65-03). To make it live here:
(1) Update the plugin. Run `claude plugin marketplace update aocyber` and then `claude plugin update devflow@aocyber` in
a terminal (or use `/plugin` → aocyber → devflow → Update). Or reply `run-update` and I run those two commands now.
(2) Quit every Claude Code session using DevFlow and start a new one in /Users/justin/dev/devflow-claude. SessionStart
then mirrors the runtime and stamps the project.
(3) In the new session run `/devflow:execute-objective 65`. This TRD resumes and verifies."

On `run-update`, run `claude plugin marketplace update aocyber`, then `claude plugin update devflow@aocyber`, each as its
own Bash call. Show the output, then re-present step (2), the restart, which only the user can do.
  </action>
  <instructions>
I can verify everything after a restart, but I cannot restart Claude Code. The one thing needed from you is the restart.
I can run the plugin update commands myself if you reply `run-update`.
  </instructions>
  <verification>In the new session: installed record 2.14.0, and `.plugin-version` 2.14.0.</verification>
  <resume-signal>Restart, then run `/devflow:execute-objective 65` (Task 1 detects the done state), or reply `run-update`.</resume-signal>
  <verify>
- The installed-record one-liner prints version `2.14.0` and an installPath ending `/devflow/2.14.0`
- `cat /Users/justin/.claude/devflow/.plugin-version` prints `2.14.0`
  </verify>
  <done>The installed plugin is 2.14.0 and the mirror was refreshed by a new session's SessionStart. The pre-check values
from before and after are in the SUMMARY.</done>
</task>

<task type="auto">
  <name>Task 2: Verify the installed runtime carries the v1.5 libs and hooks, and doctor and health report no mirror lag</name>
  <files>.planning/config.json (only if step 6 stamps it)</files>
  <action>
Run each as its own Bash call and record the command, output and PASS/FAIL:

1. Mirror libraries (criterion 3):
   `ls -l /Users/justin/.claude/devflow/bin/lib/todo-sync.cjs /Users/justin/.claude/devflow/bin/lib/todo-session.cjs /Users/justin/.claude/devflow/bin/lib/checks-pin.cjs /Users/justin/.claude/devflow/bin/lib/estimate-backtest.cjs /Users/justin/.claude/devflow/bin/lib/skill-requires.cjs /Users/justin/.claude/devflow/bin/lib/builtin-audit.cjs`.
   All six must exist.
2. Installed hooks (criterion 3). INSTALL = the installPath from the record:
   - `ls -l <INSTALL>/hooks/gate-bash-writes.js <INSTALL>/hooks/gate-skill-requires.js <INSTALL>/hooks/todo-sync.js`
   - the hooks.json registration one-liner (codebase_examples), with the real INSTALL path. It must exit 0, with all
     four flags true.
3. Verbs live in the mirror. Each must exit 0 and must not print `Unknown command`:
   - `node /Users/justin/.claude/devflow/bin/df-tools.cjs todo sync --help`
   - `node /Users/justin/.claude/devflow/bin/df-tools.cjs estimate backtest --help`
4. doctor (criterion 4): `node /Users/justin/.claude/devflow/bin/df-tools.cjs doctor --json`, report mode. Record each
   check's id, severity and finding. Required:
   - `engine_version` 2.14.0;
   - `runtime-mirror` severity `ok`, with details.installed == details.mirror == 2.14.0 and equal digests;
   - `hooks-registry` ok, with the finding naming 20 registered hook files;
   - `model-profiles` ok;
   - check ids include `skill-requires` and `checks-workflow-pin`.
5. validate health (criterion 4): `node /Users/justin/.claude/devflow/bin/df-tools.cjs validate health`. Required:
   `engine_version` 2.14.0, and no E020, W021 or I022 code. Record every remaining code, and say which ones are unrelated
   to mirror lag (W006 66-75).
6. W040 (project stamp; not mirror lag, but the restart should clear it). If W040 is present, run
   `node /Users/justin/.claude/devflow/bin/df-tools.cjs upgrade --check`. If it lists only `auto` migrations or just a
   stamp, run `node /Users/justin/.claude/devflow/bin/df-tools.cjs upgrade --apply`. That makes a backup under
   ~/.claude/devflow/backups. Then commit only the files it reports changed:
   `node ~/.claude/devflow/bin/df-tools.cjs commit "chore(65-04): stamp project at 2.14.0" --files <changed files>`.
   If it lists a `confirm` migration, do not confirm it. Record it as a follow-up.
7. Write a before/after table into the SUMMARY: the 65-01 baseline (and this TRD's context baseline) against the current
   results.
  </action>
  <verify>
- All six lib files are listed by `ls`
- The three hook files exist, and the registration one-liner exits 0
- `todo sync --help` and `estimate backtest --help` exit 0 from the mirror
- `doctor --json`: runtime-mirror `ok`, hooks-registry `ok` (20), model-profiles `ok`, `skill-requires` and
  `checks-workflow-pin` present, engine 2.14.0
- `validate health`: engine 2.14.0, and no E020, W021 or I022
  </verify>
  <done>Roadmap criteria 3 and 4 are shown with recorded command output. The installed runtime carries todo-sync,
checks-pin, estimate-backtest, skill-requires, builtin-audit and the three v1.5 hooks, including the todo-sync Stop hook.
doctor and validate health report no mirror lag. Any remaining warnings are listed and classified.</done>
  <recovery>If any check fails, record it with its output and do not mask it with `--fix` or an escape variable. Real
mirror lag sends the TRD back to Task 1 for a restart. A missing lib or hook in the installed 2.14.0 means the release
artifact is wrong, so return failed for a gap-closure patch release (2.14.1), which needs new approvals.</recovery>
</task>

</tasks>

<verification>
- Installed record 2.14.0, `.plugin-version` 2.14.0.
- Six v1.5 libs in the mirror, and three v1.5 hooks in the installed plugin, registered on the right events.
- doctor runtime-mirror ok, and health free of E020, W021 and I022.
</verification>

<success_criteria>
REL-02 is met: after the release and a session restart, the installed runtime mirror carries the v1.5 libs and hooks,
and doctor and validate health report no mirror lag.
</success_criteria>

<output>
After completion, create `.planning/objectives/65-release-v1-5/65-04-SUMMARY.md` through the summary verb. Include:
- the before/after table;
- each verification command with its output;
- the classification of the remaining warnings.
</output>
