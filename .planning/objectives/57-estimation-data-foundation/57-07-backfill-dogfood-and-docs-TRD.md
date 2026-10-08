---
objective: 57-estimation-data-foundation
trd: "07"
type: standard
wave: 4
depends_on: ["57-06"]
files_modified:
  - ".planning/objectives/*/*-SUMMARY.md"
  - CHANGELOG.md
  - CLAUDE.md
  - docs/USER-GUIDE.md
autonomous: true
requirements: [EST-06, EST-07, EST-01]
must_haves:
  truths:
    - "This repo's historical SUMMARYs whose executor transcripts survive carry tokens_input/tokens_output (tokens_source: \"backfill\"), and the run reported recovered and unrecovered counts by reason"
    - "The backfill diff touches only *-SUMMARY.md files and only adds tokens_*/token_model lines: zero removed lines, zero other added lines"
    - "A second dry run after the write reports recovered 0 (idempotent)"
    - "`df-tools calibrate` wrote ~/.claude/devflow/calibration.json from this repo's history with a sample count per class, and a second run reported unchanged with an identical sha256"
    - "This TRD's own SUMMARY was stamped live by `tokens stamp` before `summary post`, so a new executor SUMMARY carries tokens_input and tokens_output"
    - "CHANGELOG [Unreleased], CLAUDE.md and docs/USER-GUIDE.md describe tokens trd|stamp|backfill, calibrate and model-rates.json"
  artifacts:
    - path: CHANGELOG.md
      provides: "[Unreleased] entries for objective 57"
    - path: CLAUDE.md
      provides: "Estimation data bullet in the df-tools capability list"
    - path: docs/USER-GUIDE.md
      provides: "Estimation data section (tokens, calibrate, calibration.json shape, rates file)"
  key_links:
    - "tokens backfill --write -> token-backfill.applyBackfill -> summary post -> historical SUMMARY frontmatter (EST-07, live)"
    - "calibrate -> ~/.claude/devflow/calibration.json (EST-01, live; re-run identical = criterion 4)"
    - "tokens stamp 57-07 --draft -> summary post (EST-06, live)"
---

# TRD 57-07: Backfill this repo's history, calibrate for real, document (EST-07, EST-01, EST-06)

<objective>
Run the new commands against this repository and record what they found:

1. **Backfill (EST-07, success criterion 2).** Dry run, then `--write`, on this repo's ~390 SUMMARYs. Only SUMMARY
   frontmatter changes, which a scripted diff guard proves before commit. Record recovered vs unrecovered counts by
   reason. Many older transcripts are gone to retention; that is expected.
2. **Calibrate (EST-01, success criteria 3 and 4).** Write the real `~/.claude/devflow/calibration.json` from this
   checkout's history (now including the backfilled tokens). Run it again and show the same sha256 and `unchanged`.
3. **Forward stamp, live (EST-06, success criterion 1).** Stamp this TRD's own SUMMARY draft with `tokens stamp` before
   `summary post`. Use the repo copy of df-tools, because the runtime mirror predates objective 57 until the next
   release and re-sync.
4. **Docs.** CHANGELOG [Unreleased], a short CLAUDE.md bullet, and a USER-GUIDE section.

Purpose: close the objective against real data, not only fixtures.
Output: stamped historical SUMMARYs (one commit), calibration.json on this machine, docs.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Use the REPO copy of df-tools for every 57 command: `node plugins/devflow/devflow/bin/df-tools.cjs ...` (relative to
  your worktree). `~/.claude/devflow/bin/df-tools.cjs` does not have `tokens` or `calibrate` yet.
- One plain command per Bash call. No pipes, `&&`, `;` or `$(...)`; `node -e "<script>"` is one command.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- The backfill may change **only** `*-SUMMARY.md` frontmatter token lines. If the diff guard finds anything else, run
  `git restore -- .planning/objectives`, do not commit, and report the guard output as a deviation.
- Do not edit any `bin/lib` source in this TRD. A defect found here is a deviation to report (with the failing command and
  output), not something to patch in a docs TRD.
- Writing `~/.claude/devflow/calibration.json` is intended: it is the command's output (success criterion 3). Write
  nothing else under `~/.claude`.

<embedded_context>

<codebase_examples>
Commands (from TRD 57-06; run from your worktree root):

```text
node plugins/devflow/devflow/bin/df-tools.cjs tokens backfill --raw              # dry run: 2 report lines
node plugins/devflow/devflow/bin/df-tools.cjs tokens backfill --write --raw      # apply: 3 report lines
node plugins/devflow/devflow/bin/df-tools.cjs calibrate --raw                    # writes ~/.claude/devflow/calibration.json
node plugins/devflow/devflow/bin/df-tools.cjs calibrate --out <scratch>/calibration-2.json --raw
```

Inside your worktree, backfill matches transcripts against the main checkout (`/Users/justin/dev/devflow-claude`, what
REPO_ROOT in executor prompts names) and writes the worktree's SUMMARYs, so the commit lands on your branch and the wave
merge delivers it.

Diff guard, one command (prints JSON; expect `bad_count: 0` and `non_summary: []`):

```bash
node -e "const {execFileSync}=require('child_process');const run=(a)=>execFileSync('git',a,{encoding:'utf8',maxBuffer:1<<28});const names=run(['diff','--name-only','--','.planning/objectives']).split('\n').filter(Boolean);const bad=[];for(const l of run(['diff','-U0','--','.planning/objectives']).split('\n')){if(l.startsWith('--- a/')||l.startsWith('+++ b/')||l.startsWith('--- /dev/null'))continue;if(l.startsWith('-'))bad.push(l);else if(l.startsWith('+')&&!/^\+(tokens_(input|output|cache_read|cache_write|source)|token_model): /.test(l))bad.push(l);}console.log(JSON.stringify({files:names.length,non_summary:names.filter(n=>!/-SUMMARY\.md$/.test(n)),bad_count:bad.length,bad:bad.slice(0,10)}))"
```

Existing doc anchors:
- CHANGELOG.md `## [Unreleased]` already has `### Added`, `### Changed` and `### Fixed`. Append to them; do not create a
  second Unreleased block.
- CLAUDE.md "### Core Tool" bullet list (`- **Telemetry & audit** (2.5+) — ...`, `- **Upgrade** (Unreleased) — ...`).
  Add one **Estimation data** (Unreleased) bullet in the same style, at most 4 lines: CLAUDE.md is resident context on
  every turn.
- docs/USER-GUIDE.md "## Command Reference" has `### Upgrading a Project in Place (\`df-tools upgrade\`)` (line ~221).
  Add `### Estimation data (\`df-tools tokens\`, \`df-tools calibrate\`)` after that section and before
  `### Integration & Release (1.28+)`.
</codebase_examples>

<anti_patterns>
- Hand-editing any SUMMARY to add or fix token numbers.
- Re-running `--write` with `--force` to "improve" numbers. Live stamps (`tokens_source: "live"`) stay as written.
- Long CLAUDE.md prose. Detail goes in USER-GUIDE.
</anti_patterns>

<error_recovery>
- The diff guard fails: `git restore -- .planning/objectives`, record the guard JSON, and stop Task 1 as a deviation.
  Tasks 2-3 can still run, since calibrate works without backfilled tokens (fewer token samples).
- `tokens backfill --write` exits 1 (write_failed): record the failures, then run the diff guard on what was written.
  Commit only if it passes.
- calibrate's second run reports `changed`: do not commit docs claiming determinism. Record both sha256 values and the
  `cmp` output as a deviation for a gap-closure TRD.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/57-estimation-data-foundation/57-06-SUMMARY.md
@.planning/objectives/57-estimation-data-foundation/57-05-SUMMARY.md
</context>

<gotchas>
- `df-tools commit --files .planning/objectives/` stages the stamped SUMMARYs. Before committing, `git status --short`
  must show only modified `*-SUMMARY.md` under `.planning/objectives/`. The diff guard's `non_summary` list checks the
  same thing.
- Your own 57-07 SUMMARY does not exist yet when you backfill, so the backfill cannot touch it. It gets the live stamp in
  the output step.
- Known baseline `npm test` failures: stack-drafter-fleet (real fleet) and handoff-e2e MA-7. Anything else is yours.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Backfill this repo's SUMMARY history (dry run, write, guard, commit, idempotence check)</name>
  <files>.planning/objectives/*/*-SUMMARY.md</files>
  <action>
1. `git status --short -- .planning/objectives` must be empty.
2. Dry run: `node plugins/devflow/devflow/bin/df-tools.cjs tokens backfill --raw`. Record both lines (summaries,
   already stamped, recovered, unrecovered by reason; executor-transcript index counts).
3. Write: `node plugins/devflow/devflow/bin/df-tools.cjs tokens backfill --write --raw`. Record the three lines.
4. Run the diff guard (codebase_examples). On `bad_count > 0` or a non-empty `non_summary`, restore and stop (error_recovery).
5. Spot-check one recovered SUMMARY with a narrow read: `rg -n "^tokens_|^token_model" <one stamped SUMMARY path>` shows
   six lines.
6. Commit: `node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(57-07): backfill executor token usage into historical SUMMARY frontmatter" --files .planning/objectives/`.
7. Idempotence: `node plugins/devflow/devflow/bin/df-tools.cjs tokens backfill --raw` reports `recovered 0`.
  </action>
  <verify>The diff guard printed `bad_count: 0` and `non_summary: []` before the commit; the post-commit dry run reports `recovered 0`; `git status --short -- .planning/objectives` is empty.</verify>
  <done>Success criterion 2 holds live: token data filled for every recoverable historical TRD, with recovered/unrecovered counts (by reason) recorded in the SUMMARY.</done>
  <recovery>`git restore -- .planning/objectives` undoes an uncommitted write. After a commit, `git revert --no-edit HEAD` (one command) undoes it; record why.</recovery>
</task>

<task type="auto">
  <name>Task 2: Calibrate for real and prove the rerun is byte-identical</name>
  <files>~/.claude/devflow/calibration.json (generated; outside the repo, not committed)</files>
  <action>
1. `node plugins/devflow/devflow/bin/df-tools.cjs calibrate --raw` and record the line (TRDs, tasks, with tokens, classes).
2. `shasum -a 256 /Users/justin/.claude/devflow/calibration.json` and record it.
3. Run step 1 again; the line must say `unchanged`. Repeat step 2; the hash must be identical.
4. `node plugins/devflow/devflow/bin/df-tools.cjs calibrate --out <scratchpad>/calibration-2.json --raw`, then
   `cmp /Users/justin/.claude/devflow/calibration.json <scratchpad>/calibration-2.json` (exit 0).
5. Read a narrow slice for the SUMMARY:
   `node -e "const c=require('/Users/justin/.claude/devflow/calibration.json');console.log(JSON.stringify({samples:c.samples,data_as_of:c.data_as_of,classes:Object.fromEntries(Object.entries(c.task_classes).map(([k,v])=>[k,[v.samples,v.minutes.p50,v.minutes.p90]])),probabilities:c.probabilities,unpriced:c.unpriced_models}))"`.
  </action>
  <verify>Both runs give the same sha256; the second `--raw` line says `unchanged`; `cmp` exits 0; the slice shows a sample count per class.</verify>
  <done>Success criteria 3 and 4 hold on real data; the per-class samples/p50/p90 are recorded in the SUMMARY.</done>
  <recovery>If the hashes differ, keep both files (copy the first to the scratchpad before rerunning), `cmp -l` them to locate the byte, and record the deviation. Do not patch calibrator.cjs here.</recovery>
</task>

<task type="auto">
  <name>Task 3: CHANGELOG, CLAUDE.md and USER-GUIDE for estimation data</name>
  <files>CHANGELOG.md, CLAUDE.md, docs/USER-GUIDE.md</files>
  <action>
- CHANGELOG.md `[Unreleased]`:
  - Added: `df-tools tokens trd|stamp|backfill` (per-TRD executor token usage from Claude Code transcripts, counted once
    per API message; dry run unless `--write`); `df-tools calibrate` (per-task-class p50/P90 minutes, tokens and dollars,
    written deterministically to `~/.claude/devflow/calibration.json`); `references/model-rates.json` (per-model USD
    rates, each with source and as_of).
  - Changed: executors stamp `tokens_input`/`tokens_output` into the SUMMARY draft before `summary post`; TRD
    identification moved to `lib/trd-identify.cjs` (the executor-stop hook re-exports it); `context-audit` exposes
    `forEachRecord`.
  - Fixed: executor.md's `state record-metric` example passes `--job`.
  Include the live numbers from Tasks 1-2 (recovered/unrecovered, calibration samples) in one sentence.
- CLAUDE.md: one **Estimation data** (Unreleased) bullet (codebase_examples) naming the commands, the default output
  path, `DEVFLOW_CALIBRATION_PATH`, the rates file, and the modules (`lib/token-usage.cjs`, `token-backfill.cjs`,
  `tokens-cli.cjs`, `calibration-inputs.cjs`, `calibrator.cjs`, `calibrate-cli.cjs`, `trd-identify.cjs`).
- docs/USER-GUIDE.md: the new section. Cover what each command does, the flags, the env overrides, the calibration.json
  top-level keys (`samples`, `task_classes`, `trd_level`, `probabilities`, `models`, `data_as_of`, `inputs_digest`), how
  rates are updated (re-read the pricing page, edit model-rates.json, keep source/as_of), and that unrecoverable history is
  normal.
Commit `docs(57-07): document estimation data commands`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-surfaces.test.cjs plugins/devflow/devflow/bin/lib/changelog.test.cjs` passes, then the full `npm test` (only the two known baseline failures).</verify>
  <done>The docs describe the shipped commands. dispatch-completeness confirms every `df-tools <name>` CLAUDE.md mentions is dispatched.</done>
  <recovery>If dispatch-completeness rejects a name extracted from the new prose (e.g. a subcommand read as a command), reword the sentence so only top-level names follow `df-tools`.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- Criterion 1: this TRD's published SUMMARY has `tokens_input` and `tokens_output` from `tokens stamp` (output step).
- Criterion 2: the backfill counts (recovered / unrecovered by reason) are recorded, and the diff guard passed.
- Criterion 3: `~/.claude/devflow/calibration.json` exists, built from SUMMARY frontmatter, STATE_ARCHIVE metrics and
  model rates, with `samples` per class.
- Criterion 4: identical sha256 across two runs and `cmp` against an `--out` copy.
</verification>

<success_criteria>
- All four ROADMAP success criteria for Objective 57 demonstrated on this repository's real history.
- Full `npm test` shows no failures beyond the two known baseline ones.
</success_criteria>

<output>
Finish the SUMMARY draft (`node plugins/devflow/devflow/bin/df-tools.cjs planning draft objectives/57-estimation-data-foundation/57-07-SUMMARY.md`).
Include the backfill report lines, the diff-guard JSON, both sha256 values and the calibration slice. Then stamp it live
with the repo copy and post it, as two separate commands:
`node plugins/devflow/devflow/bin/df-tools.cjs tokens stamp 57-07 --draft <draft path>`, then
`node plugins/devflow/devflow/bin/df-tools.cjs summary post 57-07 --from <draft path>`.
Confirm the published SUMMARY's frontmatter shows `tokens_source: "live"`.
</output>
