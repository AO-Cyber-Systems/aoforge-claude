---
objective: 60-edit-gate-enforces-the-action
trd: "06"
type: standard
wave: 5
depends_on: ["60-04", "60-05"]
files_modified:
  - plugins/devflow/devflow/references/bash-edit-gate-evidence.json
  - plugins/devflow/devflow/bin/lib/bash-write-gate.cjs
  - plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs
  - plugins/devflow/devflow/bin/lib/bash-write-detect.cjs
  - plugins/devflow/devflow/bin/lib/bash-write-detect.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/bash-write-cases.cjs
autonomous: true
requirements: [GATE-05]
must_haves:
  truths:
    - "`df-tools session-audit --limit 0` has been run over every retained transcript in ~/.claude/projects, and its bash_edit_gate numbers are recorded in references/bash-edit-gate-evidence.json (aggregates only: no commands, paths or transcript text)"
    - "BASH_EDIT_GATE_DEFAULT equals recommendDefault(false_positive_rate) of that run: 'strict' when the rate is at most 0.02 of ambient Bash calls, 'warn' otherwise"
    - "A test fails if BASH_EDIT_GATE_DEFAULT, the evidence's default and recommendDefault(evidence.false_positive_rate) ever disagree, or if the evidence threshold is not FP_THRESHOLD"
    - "Every detector misparse found in the sampled would-denies was fixed test-first (a hand-reduced case RED, then the fix) before the final run; the ambient definition, the threshold and the tracked rule were not changed to move the number"
  artifacts:
    - path: plugins/devflow/devflow/references/bash-edit-gate-evidence.json
      provides: "measured_at, command, corpus{files_scanned, sessions}, bash_calls, ambient_bash_calls, excluded, would_deny, by_form, false_positive_rate, false_positive_basis, threshold, recommended_default, default, detector_fixes"
    - path: plugins/devflow/devflow/bin/lib/bash-write-gate.cjs
      provides: "BASH_EDIT_GATE_DEFAULT set from the measurement"
  key_links:
    - "session-audit replay (60-05) -> bash_edit_gate.recommended_default -> BASH_EDIT_GATE_DEFAULT (bash-write-gate.cjs) -> hook default when gates.bashEditGate is unset (60-04)"
    - "bash-write-gate.test.cjs agreement test -> references/bash-edit-gate-evidence.json"
---

# TRD 60-06: Measure the false-positive rate on real transcripts and set the shipped default (GATE-05)

<objective>
GATE-05: the Bash rule ships as default `strict` only if the measured false-positive rate is at most 2% of ambient Bash
calls, and as `warn` otherwise. 60-05 built the measurement and 60-03 put the rule in code (`recommendDefault`,
`FP_THRESHOLD = 0.02`). This TRD runs the measurement over the real corpus, records it and sets the default from it.
After this TRD, the default is a number with a source, and CI fails if the two drift.

The order matters:

1. Run the replay. Read the sampled would-denies. Where one is a detector misparse (the command does not write that
   path at a position the shell executes), fix it test-first, then run the replay again. Do not change anything to
   move the number: not the ambient definition, not the threshold, not the tracked-at-time rule. Do not relabel hits.
   The rate is an upper bound by design (60-05).
2. Record the aggregates in `references/bash-edit-gate-evidence.json` and set
   `BASH_EDIT_GATE_DEFAULT = recommended_default`.
3. Pin the agreement with a test.

Where the default lives (documented in 60-07):
- `BASH_EDIT_GATE_DEFAULT` in `plugins/devflow/devflow/bin/lib/bash-write-gate.cjs` is used when `gates.bashEditGate`
  is unset or invalid.
- The evidence sits beside it in references/.
- Per project, `gates.bashEditGate` overrides it, and `gates.editGate` `warn`/`off` always soften or disable it.

Purpose: GATE-05's decision, made from data. Output: an evidence file, the default, an agreement test, and possibly
detector fixes.
</objective>

<file_tree>
plugins/devflow/devflow/
├── references/bash-edit-gate-evidence.json      ← CREATE
└── bin/lib/
    ├── bash-write-gate.cjs                      ← MODIFY (BASH_EDIT_GATE_DEFAULT)
    ├── bash-write-gate.test.cjs                 ← MODIFY (agreement test)
    ├── bash-write-detect.cjs                    ← MODIFY only if a misparse is found
    ├── bash-write-detect.test.cjs               ← MODIFY only if a misparse is found
    └── __fixtures__/bash-write-cases.cjs        ← MODIFY only if a misparse is found (new MENTION case)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD for any detector change: first add a hand-reduced case to `MENTION_CASES` (or a named unit test) and
  watch it fail (`test(60-06): ...`), then fix it (`fix(60-06): ...`). The agreement test also goes RED before the
  evidence exists.
- **Hand-reduce, never copy.** Transcript commands can carry credentials, tokens and paths into other repositories. A
  fixture case keeps only the command's SHAPE, with neutral names (`src/a.js`, `/repo`). The evidence file holds counts
  only. Nothing from a transcript is committed verbatim. The SUMMARY describes misparses by shape too.
- The scratchpad, `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/<session>/scratchpad/` (use the session's
  own path), is for raw audit output and triage scripts. Never put them in the repository.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash
  call.
- Never use port 8080.

## Test list

1. Agreement (`bash-write-gate.test.cjs`, `describe('shipped default agrees with the measurement')`): read
   `../../references/bash-edit-gate-evidence.json` and assert:
   - `evidence.threshold === FP_THRESHOLD`.
   - `evidence.recommended_default === recommendDefault(evidence.false_positive_rate)`.
   - `evidence.default === evidence.recommended_default`.
   - `BASH_EDIT_GATE_DEFAULT === evidence.default`.
   - `evidence.ambient_bash_calls >= 1000`.
   - `0 <= evidence.would_deny <= evidence.ambient_bash_calls`.
   - `evidence.false_positive_rate === round6(would_deny / ambient_bash_calls)`.
   - The file has no key named `sample`, and no string value containing `/Users/` or a newline (aggregates only).
2. For each misparse found (if any): one new `MENTION_CASES` entry (or a named detector unit test) with the
   hand-reduced shape, RED before the fix.

<embedded_context>

<codebase_examples>
The measurement command and the shape it returns (60-05):

```
node plugins/devflow/devflow/bin/df-tools.cjs session-audit --limit 0
  -> { ..., bash_edit_gate: { bash_calls, ambient_bash_calls, excluded: {...}, would_deny, by_form: {...},
       false_positive_rate, false_positive_basis, threshold, recommended_default, by_period, sample } }
```

`--limit 0` means no limit (`validateLimit` accepts 0, and `limit || undefined` disables the cap). The default limit is
150 files, which is NOT the whole corpus. The planning-time probe saw 2,227 transcript files (3.5 GB) and 136,155 Bash
calls. It took a few minutes, so run it with a long Bash timeout (600000 ms) or in the background.

Planning-time probe (old quick-31 heuristic, today's `git ls-files`, attributionSkill and meta exclusions): 618 hits
over 39,175 ambient-candidate calls, or 1.58%. The real replay differs in both directions:
- History-accurate tracking removes new files that were committed later, which lowers the rate.
- Python name binding and `cd` tracking find more writes, which raises it.

Treat the probe as orientation, not a prediction.
</codebase_examples>

<anti_patterns>
- Do not edit the threshold, the ambient signals or the history rule after seeing the number.
- Do not add an exclusion for a project, a session or a period to get under 2%.
- Do not commit the `sample`, any command text, or absolute paths.
- Do not run the audit with `--since`. The decision uses all retained history. A `by_period` note in the SUMMARY is
  fine.
- Do not "fix" a true write. A hit where the command really writes a tracked file in an ambient session is the rule
  working, even if it was an innocent edit. Only parse errors are misparses.
</anti_patterns>

<error_recovery>
- If the run is too slow or runs out of memory: run it in the background with output to the scratchpad. If memory is
  the problem, run `node --max-old-space-size=8192 plugins/devflow/devflow/bin/df-tools.cjs session-audit --limit 0`.
- If `ambient_bash_calls < 1000`, STOP. The corpus is too small to be evidence. Leave the default at `'warn'`, write no
  evidence file, and return a blocker in the SUMMARY with the numbers. Do not lower the minimum.
- If `excluded.history_unavailable` is large (more than 20% of `bash_calls`), list the project roots whose history
  failed in the SUMMARY (shape only), and check the git invocation in `newHistoryTracker` before trusting the rate. A
  bug there is a measurement bug, so fix it test-first.
</error_recovery>

</embedded_context>

<gotchas>
- Triage needs more than the 10 sampled hits. Write a scratchpad script that requires
  `plugins/devflow/devflow/bin/lib/session-audit.cjs` and the lib functions, walks the same transcripts and prints
  every would-deny (command collapsed to 200 characters, plus the gated relative paths) to a scratchpad file. Read that
  file. It stays in the scratchpad.
- A misparse means the detector saw a write the shell would not do. Classic shapes: `>` inside an unquoted
  `[ ]`/`test` that IS a real redirect (not a misparse); `>` in a mid-command heredoc the stripper missed; a `cd` that
  ran inside a subshell; a python name bound in a function scope. Decide by reading the shell semantics, not by whether
  the write seemed harmless.
- `round6(x) = Math.round(x * 1e6) / 1e6`. Use the same rounding session-audit used. If 60-05 rounded differently,
  match it.
- Evidence JSON key order is as in the artifact line. `measured_at` is the run's local date (`YYYY-MM-DD`).
  `detector_fixes` is an array of one-line shape descriptions (`[]` when none). `command` is the exact command string,
  `"df-tools session-audit --limit 0"`.
- `references/` is mirrored to `~/.claude/devflow/references/` by sync-runtime. That is harmless, because the file holds
  aggregates only. If a test inventories `references/` (`rg -l "references" plugins/devflow --glob '*.test.*'` and
  check), register the new file there.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Run the replay over the real corpus, triage the would-denies, and fix any detector misparse test-first</name>
  <files>plugins/devflow/devflow/bin/lib/bash-write-detect.cjs, plugins/devflow/devflow/bin/lib/bash-write-detect.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/bash-write-cases.cjs</files>
  <action>
1. Run `node plugins/devflow/devflow/bin/df-tools.cjs session-audit --limit 0` with the output redirected to
   `<scratchpad>/bash-gate-audit-1.json`. Use one command, a long timeout or the background.
2. Print `bash_edit_gate` without `sample` and record the numbers in your notes.
3. Run the full would-deny listing (gotchas) into `<scratchpad>/bash-gate-hits-1.txt`, and read all of it if there are
   up to 300 hits, otherwise every hit in a systematic sample (every Nth) of 300. Classify each as `write`
   (a real write to a then-tracked file) or `misparse` (a reason by shell semantics).
4. For each distinct misparse shape:
   - Add a hand-reduced `MENTION_CASES` entry (or a named unit test) and run it RED. Commit
     `test(60-06): <shape> is not a write`.
   - Fix the detector (or shell-words, if the masking is at fault, with its own RED test). Commit
     `fix(60-06): <shape>`.
   - Keep the full detector, gate and shell-words test files green.
5. If anything was fixed, re-run steps 1-2 into `...-2.json` and repeat the triage on the new hits until a pass finds no
   misparse. The final run's JSON is the evidence source.

If no misparse is found, this task changes no repository file. Record the triage outcome (counts per class, shapes) for
the SUMMARY, with no commit.
  </action>
  <verify>The final audit JSON exists in the scratchpad, with `ambient_bash_calls >= 1000`. `node --test plugins/devflow/devflow/bin/lib/bash-write-detect.test.cjs plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs plugins/devflow/devflow/bin/lib/shell-words.test.cjs` passes. Every fix has a RED commit before it.</verify>
  <done>A final measurement with no known misparse among the triaged hits, and every fix test-first.</done>
  <recovery>If the triage turns up more than five distinct misparse shapes, the detector needs design work beyond this
  TRD. Stop after fixing the three most frequent shapes, record the rest in the SUMMARY as follow-ups, and let the
  measurement decide the default as it stands.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Record the evidence, set BASH_EDIT_GATE_DEFAULT from it, and pin the agreement (test 1)</name>
  <files>plugins/devflow/devflow/references/bash-edit-gate-evidence.json, plugins/devflow/devflow/bin/lib/bash-write-gate.cjs, plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs</files>
  <action>
RED: add test 1 to `bash-write-gate.test.cjs`. It fails because the evidence file is missing. Commit
`test(60-06): shipped bash gate default agrees with the measurement`.

GREEN:
1. Write `references/bash-edit-gate-evidence.json` from the final audit JSON's `bash_edit_gate` plus `files_scanned`
   and `sessions` (gotchas key order). Set `"default"` to `recommended_default`. Pretty-print with 2 spaces and a
   trailing newline.
2. Set `BASH_EDIT_GATE_DEFAULT` to that value in `bash-write-gate.cjs`. The comment cites the evidence file and the
   measured rate (`<would_deny>/<ambient> = <rate>, threshold 0.02`).
3. Run `node --test plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs plugins/devflow/hooks/gate-bash-writes.test.js`.
   60-04 test 2 reads the constant, so it follows the new default without edits.

Commit `feat(60-06): ship the Bash edit gate default measured from transcripts`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs plugins/devflow/hooks/gate-bash-writes.test.js` passes. `node -e "const e=require('./plugins/devflow/devflow/references/bash-edit-gate-evidence.json'); const g=require('./plugins/devflow/devflow/bin/lib/bash-write-gate.cjs'); console.log(e.false_positive_rate, e.default, g.BASH_EDIT_GATE_DEFAULT, g.recommendDefault(e.false_positive_rate))"` prints the rate and the same mode three times.</verify>
  <done>The default is the measured recommendation, the evidence is committed as aggregates only, and CI pins their
  agreement.</done>
</task>

</tasks>

<validation_gates>
- Task gate (`test`): `node --test plugins/devflow/devflow/bin/lib/bash-write-gate.test.cjs plugins/devflow/devflow/bin/lib/bash-write-detect.test.cjs plugins/devflow/hooks/gate-bash-writes.test.js`.
</validation_gates>

<verification>
- The agreement test passes, and the evidence file contains no command text or absolute path.
- `git log --oneline` shows the RED agreement commit before the default change, and any `fix(60-06)` commit after its
  RED test.
- The SUMMARY reports `would_deny / ambient_bash_calls = rate`, the resulting default, the triage counts per class
  and the misparse shapes fixed (if any).
</verification>

<success_criteria>
- [ ] The real-corpus replay ran with no file limit
- [ ] The default is `strict` iff the rate is at most 0.02, and the agreement is CI-pinned
- [ ] Only aggregates are committed
</success_criteria>

<output>
After completion, create `.planning/objectives/60-edit-gate-enforces-the-action/60-06-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`.
</output>
