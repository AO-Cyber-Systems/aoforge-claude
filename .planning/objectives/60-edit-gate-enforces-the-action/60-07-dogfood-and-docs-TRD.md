---
objective: 60-edit-gate-enforces-the-action
trd: "07"
type: standard
wave: 6
depends_on: ["60-06"]
files_modified:
  - CHANGELOG.md
  - CLAUDE.md
  - docs/USER-GUIDE.md
  - scripts/gen-docs-data.cjs
autonomous: true
requirements: [GATE-01, GATE-02, GATE-03, GATE-04, GATE-05]
must_haves:
  truths:
    - "On a scratch clone of this repository (a real DevFlow project, no skill marker), the registered hook denies a Bash write to a tracked source file (gates.bashEditGate strict), applies the measured default when the key is unset, passes mentions and .planning/ / .md / untracked / tmp writes, and lets every escape through; the target files are never modified"
    - "CHANGELOG [Unreleased] records the hook, gates.bashEditGate, the measured default with its numbers, the session-audit bash_edit_gate replay and the new block category, and the shell-words move"
    - "CLAUDE.md's hook inventory states the final gate-bash-writes.js behaviour and default, and the gate-edits.js bullet points to it"
    - "USER-GUIDE documents what the Bash rule gates and never gates, the escapes, the severity rule (least of editGate and bashEditGate), where the default lives and how it was decided, how to re-measure, and the accepted false negatives"
    - "Full `npm test` passes except failures proven pre-existing on the objective's base commit"
  artifacts:
    - path: docs/USER-GUIDE.md
      provides: "hooks table row for gate-bash-writes.js and a 'Bash writes and the edit gate' section"
    - path: scripts/gen-docs-data.cjs
      provides: "HOOK_DOCS['gate-bash-writes.js']"
  key_links:
    - "USER-GUIDE -> references/bash-edit-gate-evidence.json (the measured numbers) and `df-tools session-audit --limit 0` (re-measure)"
    - "hook-inventory.test.cjs keeps CLAUDE.md and hooks.json in step after the bullet rewrite"
---

# TRD 60-07: Dogfood on a scratch clone, document, full test suite

<objective>
Close the objective.

1. **Dogfood.** Prove the registered hook makes the right call inside a real DevFlow repository: a scratch clone of
   this one, where no skill marker is live. The executor's own checkout has a live `.skill-active` marker while
   execute-objective runs, so the gate would correctly allow everything there. Use the stdin contract Claude Code uses,
   and run one best-effort live check through Claude Code itself.
2. **Document.** CHANGELOG, CLAUDE.md (the hook inventory), USER-GUIDE, and the docs-site data in
   `scripts/gen-docs-data.cjs`. The measured default and its numbers come from
   `references/bash-edit-gate-evidence.json` (60-06). Quote them; do not re-derive them.
3. **Full suite.** `npm test`, with any failure shown to be pre-existing on the objective's base commit.

Purpose: every success criterion is observable outside the unit tests, and every user-facing surface states what the
gate does. Output: doc edits, plus dogfood evidence in the SUMMARY.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- No production code changes in this TRD. If the dogfood finds a defect, stop. Record it in the SUMMARY as a gap, with
  the exact payload and output, for the verifier and gap closure. Do not patch it here.
- All dogfood runs in a scratch clone under the session scratchpad (outside the repository). Never in this checkout.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash
  call (no `&&`, `;`, pipes or `cd`).
- Never use port 8080. Nothing here starts a server.
- No transcript content, credentials or other-repo paths in any doc. Quote the evidence file's aggregates only.

<embedded_context>

<codebase_examples>
Payload shape (the hook reads `tool_name`, `tool_input.command`, `cwd`, `agent_type`):

```json
{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"sed -i '' 's/x/x/' plugins/devflow/hooks/gate-commits.js"},"session_id":"dogfood","cwd":"<clone>"}
```

Expected deny output shape:

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"DevFlow ambient mode active — Bash write to tracked source denied: plugins/devflow/hooks/gate-commits.js. ..."}}
```

Docs that already describe the edit gate and must stay consistent:
- CLAUDE.md `### Hooks` → the `gate-edits.js` bullet (Enforcement group), plus the `gate-bash-writes.js` bullet 60-04
  added.
- `docs/USER-GUIDE.md` line ~715: the hooks table row for `gate-edits.js` (columns: Hook | Event | Behaviour | Escape).
- `scripts/gen-docs-data.cjs` `HOOK_DOCS` (lines 137-158): `'<file>': [group, purpose, escape]`. An entry missing from
  the map renders as group "Other" with an empty purpose.
- CHANGELOG `## [Unreleased]` already has `### Added` (the quick-31 edit_gate_bypass line is the closest precedent) and
  `### Changed`.
</codebase_examples>

<anti_patterns>
- Do not dogfood in the executor's own checkout or in the main checkout. A live skill marker makes every result
  "allowed", which proves nothing, and a mistake would write tracked files.
- Do not run any write command for real to "see if it is blocked" outside Claude Code. The stdin smoke only feeds the
  hook a payload. The command in the payload is never executed.
- Do not restate the measured numbers from memory. Read them from the evidence file.
- Do not expand CLAUDE.md beyond the hook bullets. It is resident context on every turn.
</anti_patterns>

<error_recovery>
- If the clone has no `node_modules`, that does not matter. The hook and libs have no dependencies.
- If the live Claude Code check cannot load the clone's plugin (unknown `--plugin-dir`, the installed `devflow@aocyber`
  shadows it, or an auth or network failure), record `live check: skipped — <exact reason>`. The stdin smoke is the
  required evidence. The live check is corroboration.
- Pre-existing `npm test` failures: run the same failing file at the objective's base commit, in a scratch worktree
  (`git worktree add <scratch> <base>`, then `npm test` or `node --test <file>` there, then `git worktree remove`).
  Record the comparison. MA-7 (`doctl auth init`) and the devflow-watch/handoff-e2e environmental failures are known
  from objectives 35 and 44.
</error_recovery>

</embedded_context>

<gotchas>
- Scratch clone: `git clone --local --no-hardlinks <your checkout> <scratchpad>/df60-clone`. Clone your own checkout,
  which carries waves 1-5. In the clone, set a local `commit.gpgsign false`; you never commit there.
- Edit the clone's `.planning/config.json` with the Edit tool. It is outside this repository, so no gate applies.
- Write each payload to `<scratchpad>/p-<name>.json` with the Write tool, then run
  `node <clone>/plugins/devflow/hooks/gate-bash-writes.js` with stdin from that file, one Bash call each. To set an
  env var for one run (`DEVFLOW_SKIP_EDIT_GATE=1`), prefix the command. That is the inline form, and it reaches the
  process.
- Markers in the clone:
  - `.skill-active`: write `{"skill":"dogfood","expires_at":"<now + 1h ISO>"}` to `<clone>/.planning/.skill-active`.
  - Override: write `{"created_at":"<now ISO>"}` to `<clone>/.planning/.edit-override`.
  - Remove each marker after its row.
- Live check (best effort), from cwd `<clone>`, with `gates.bashEditGate: "strict"` in the clone config:
  `claude -p --plugin-dir <clone>/plugins/devflow --allowedTools "Bash(sed:*)" "Run exactly this one Bash command and
  then report the tool result verbatim, nothing else: sed -i '' 's/x/x/' plugins/devflow/hooks/gate-commits.js"`.
  Pass: the reported result contains `Bash write to tracked source denied`, and the clone's `git status --porcelain`
  shows no change to that file. Use a single Bash call with a 300000 ms timeout.
- USER-GUIDE section. Put "Bash writes and the edit gate" right after the hooks table. Include:
  - what is gated: the forms;
  - what is never gated: mentions, `.planning/`, `*.md`, untracked files, outside the project (tmp, scratchpad, other
    repos), unresolvable targets;
  - the escapes, the same as Edit/Write: marker, devflow agent, override phrase (consumed only by a gated write),
    `DEVFLOW_SKIP_EDIT_GATE=1`;
  - a severity table: editGate × bashEditGate → effective;
  - the default: its value, `BASH_EDIT_GATE_DEFAULT` in `bin/lib/bash-write-gate.cjs`, the evidence file's numbers,
    the ≤2% rule, and the upper-bound basis;
  - how to re-measure: `df-tools session-audit --limit 0`, the `bash_edit_gate` key and the raw line;
  - known false negatives, from 60-02's list;
  - the subshell `cd` approximation;
  - that it ships with the next release: the installed plugin must carry objective 60.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Dogfood the hook on a scratch clone (stdin smoke matrix and a best-effort live Claude Code check)</name>
  <files>(none in the repository — scratchpad only)</files>
  <action>
Create the scratch clone (gotchas). Run the matrix below, recording each row's payload command, config, env, marker and
the hook's exact stdout. "Tracked" means `plugins/devflow/hooks/gate-commits.js`, and "Mention" is a heredoc whose body
contains `sed -i` on it.

| # | Setup | Command | Expect |
|---|---|---|---|
| S1 | config has no `bashEditGate` | `sed -i '' 's/x/x/' <tracked>` | decision per `BASH_EDIT_GATE_DEFAULT` (deny or ask) |
| S2 | `bashEditGate: "strict"` | same | deny, reason names the file |
| S3 | strict | `cat > <tracked> <<'EOF'` heredoc | deny |
| S4 | strict | `python3 -c "open('<tracked>','w')"` | deny |
| S5 | strict | mention heredoc / `grep -n "> <tracked>" README.md` / `echo "x > y"` | `''` each |
| S6 | strict | `>> README.md`, `>> .planning/STATE.md`, `> new-untracked.js`, `> <scratchpad>/x.txt` | `''` each |
| S7 | strict + live `.skill-active` | S2 command | `''` |
| S8 | strict, payload `agent_type: "devflow:executor"` | S2 command | `''` |
| S9 | strict + fresh `.edit-override` | `ls` then S2 command then S2 command | `''`, `''` (consumed), deny |
| S10 | strict, inline `DEVFLOW_SKIP_EDIT_GATE=1` | S2 command | `''` |
| S11 | strict + `editGate: "off"` | S2 command | `''` |
| S12 | strict + `editGate: "warn"` | S2 command | ask |
| S13 | `bashEditGate: "off"` | S2 command | `''` |

Then:
- Confirm `git -C <clone> status --porcelain` shows only `.planning/config.json` (and no tracked source change).
- Run the live check (gotchas), and record pass, fail or skipped with the exact reason.
- Run `node plugins/devflow/devflow/bin/df-tools.cjs session-audit --raw --limit 0` once more in this checkout. Record
  its last line (the `bash_edit_gate:` line) for the docs, and confirm it matches the evidence file. Any difference is
  new transcripts since 60-06; note the delta, and do not update the evidence.

Any row that differs from "Expect" is a defect: stop and record it (binding rules). Remove the clone at the end. No
commit (nothing in the repository changes).
  </action>
  <verify>The SUMMARY has the S1-S13 table with actual outputs, the clean `git status` of the clone, the live-check
  result and the current raw audit line.</verify>
  <done>All 13 rows match, or each mismatch is recorded as a gap with its payload and output.</done>
</task>

<task type="auto">
  <name>Task 2: CHANGELOG, CLAUDE.md, USER-GUIDE and docs-site data</name>
  <files>CHANGELOG.md, CLAUDE.md, docs/USER-GUIDE.md, scripts/gen-docs-data.cjs</files>
  <action>
Read `plugins/devflow/devflow/references/bash-edit-gate-evidence.json` first. Every number below comes from it.

1. `CHANGELOG.md` `## [Unreleased]`:
   - `### Added`, one bullet each:
     - (a) `hooks/gate-bash-writes.js` (PreToolUse(Bash)): what it denies, what it never gates, the escapes, and
       DECISION-001.
     - (b) `gates.bashEditGate` (`strict|warn|off`), its shipped default `<default>` measured as
       `<would_deny>/<ambient_bash_calls> = <rate>` (an upper bound, threshold 0.02) over `<files_scanned>`
       transcripts, and the least-of rule with `gates.editGate`.
     - (c) `session-audit` `bash_edit_gate` (history-accurate replay through the hook's decision, the raw line) and
       the `devflow-bash-edit-gate` block category.
   - `### Changed`: the shell-text primitives moved to `bin/lib/shell-words.cjs`, now shared by gate-commits and
     session-audit, with no behaviour change. List any 60-06 detector fixes only if they changed shipped behaviour
     (they did not ship before, so normally none).
2. `CLAUDE.md` `### Hooks`:
   - Rewrite the `gate-bash-writes.js` bullet to its final form: the forms, never-gated, the escapes, severity
     (`gates.bashEditGate`, default `<default>` measured at `<rate>`; `gates.editGate` warn/off soften or disable it),
     the escape env, and "needs an installed plugin carrying objective 60".
   - Append one sentence to the `gate-edits.js` bullet: "Bash writes to the same files are gated by
     `gate-bash-writes.js`."
   - Keep both bullets to one paragraph each.
3. `docs/USER-GUIDE.md`: add a `gate-bash-writes.js` row to the hooks table, after `gate-edits.js`, with Event
   `PreToolUse (Bash)` and Escape `DEVFLOW_SKIP_EDIT_GATE=1, gates.bashEditGate: off`. Add the "Bash writes and the
   edit gate" section (gotchas).
4. `scripts/gen-docs-data.cjs`: add
   `'gate-bash-writes.js': ['Enforcement', '<one-paragraph purpose, as in the CLAUDE.md bullet>', 'DEVFLOW_SKIP_EDIT_GATE=1']`,
   and append the Bash pointer sentence to the `gate-edits.js` purpose.

Run `node --test plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs`
and `node scripts/gen-docs-data.cjs --help 2>/dev/null` (or run it the way its header says, to a scratch output, if it
writes files) to confirm the data script still loads. Commit
`docs(60-07): document the Bash edit gate, its measured default and the session-audit replay`.
  </action>
  <verify>`rg -n "gate-bash-writes" CHANGELOG.md CLAUDE.md docs/USER-GUIDE.md scripts/gen-docs-data.cjs` matches in all four. `rg -n "bashEditGate" docs/USER-GUIDE.md` matches the severity table. hook-inventory and doc-refs tests pass.</verify>
  <done>All four surfaces describe the shipped behaviour and the measured default with its numbers.</done>
</task>

<task type="auto">
  <name>Task 3: Full test suite</name>
  <files>(none)</files>
  <action>
Run `npm test` from your checkout (stack gate `test`, with a timeout of up to 900 s; run it in the background if
needed). For every failing test file, prove it is pre-existing: run the same file at the objective's base commit in a
scratch worktree (error_recovery), and record `file: fails at base too (reason)` in the SUMMARY. A failure that does
not reproduce at base is a regression from this objective. Do not fix it here. Record it as a gap with the failing
assertion.

Record the totals (tests, pass, fail, skipped) in the SUMMARY. No commit.
  </action>
  <verify>The `npm test` totals are recorded, and every failure is matched to a base-commit run.</verify>
  <done>The suite passes except proven pre-existing failures, or regressions are recorded as gaps.</done>
</task>

</tasks>

<validation_gates>
- Objective gate (stack `gates.objective` → `test`): `npm test`.
</validation_gates>

<verification>
- The dogfood table S1-S13 matches its Expect column on a clone with no live marker. The tracked files are unchanged.
- The four doc surfaces mention gate-bash-writes. USER-GUIDE has the severity table, the re-measure command and the
  false-negative list.
- `npm test` shows no regressions (failures limited to the proven pre-existing set).
</verification>

<success_criteria>
- [ ] SC1-SC4 observed through the real hook on a real DevFlow repository
- [ ] SC5's number and default are documented from the evidence file
- [ ] CHANGELOG, CLAUDE.md, USER-GUIDE and gen-docs-data are updated
- [ ] Full suite green apart from pre-existing failures
</success_criteria>

<output>
After completion, create `.planning/objectives/60-edit-gate-enforces-the-action/60-07-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`.
</output>
