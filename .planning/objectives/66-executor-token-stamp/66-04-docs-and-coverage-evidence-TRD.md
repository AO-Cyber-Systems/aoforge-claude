---
objective: 66-executor-token-stamp
trd: "04"
type: standard
wave: 3
depends_on: ["66-01", "66-02", "66-03"]
files_modified:
  - CHANGELOG.md
  - docs/USER-GUIDE.md
  - CLAUDE.md
autonomous: true
requirements: [EST-09]
must_haves:
  truths:
    - "CHANGELOG [Unreleased], docs/USER-GUIDE.md (Estimation data, hooks table) and the CLAUDE.md Estimation-data and gate-executor-stop bullets describe `tokens coverage`, the stop gate's token branch, the never-inline rule and the explicit continuation prompt. Each entry that needs an installed plugin says so"
    - "SC-1 evidence is recorded: the installed 2.14.0 `agents/executor.md` contains `tokens stamp {objective}-{trd} --draft` (line quoted). tokens-cli test 11 passes on the repository copy and FAILS on a scratch copy with the stamp line deleted, so the repo test demonstrably guards the step"
    - "SC-2 evidence is recorded: 66-01, 66-02 and 66-03 SUMMARYs carry `tokens_input`, `tokens_output` and `tokens_source: \"live\"`, and no `tokens backfill --write` ran in this objective (git log of the objective's planning files shows no backfill commit)"
    - "SC-3 evidence is recorded: the verbatim output of the repository copy's `tokens coverage --milestone v1.6` (text and JSON), with the exact fraction and the floored decimal, `met` true or false as measured, and no rounding. If it is below 95%, the SUMMARY says so plainly and gives the arithmetic: with 65-02/65-03 permanently missing, at least 40 counted v1.6 TRDs and no further miss are needed"
    - "EST-09 stays Pending in REQUIREMENTS.md unless the measured coverage is at least 0.95. The release that carries objective 66 to the installed runtime is recorded as a follow-up, not done"
  artifacts:
    - path: CHANGELOG.md
      provides: "[Unreleased] Added/Changed/Fixed entries for objective 66"
    - path: docs/USER-GUIDE.md
      provides: "`tokens coverage` in Estimation data; gate-executor-stop row updated"
    - path: CLAUDE.md
      provides: "Estimation data bullet names `tokens trd|stamp|backfill|coverage` and token-coverage.cjs; gate-executor-stop bullet names the token branch"
  key_links:
    - "66-01 tokens coverage -> the SC-3 measurement recorded here"
    - "66-02 gate + 66-03 workflow -> CHANGELOG/USER-GUIDE/CLAUDE.md entries -> next release (follow-up)"
---

# TRD 66-04: Documentation, and the SC-1/SC-2/SC-3 evidence with the measured coverage (EST-09)

<objective>
Document what 66-01..03 shipped. Then collect the objective's evidence in one place, using the repository copy where
the installed runtime does not yet have the code:

- SC-1: the installed executor prompt has the stamp step, and the repo test fails without it (a mutation proof on a
  scratch copy).
- SC-2: this objective's executor SUMMARYs are live-stamped with no backfill.
- SC-3: the measured v1.6 forward-stamp coverage, printed by `tokens coverage` and recorded verbatim.

Purpose: EST-09 is judged on measured numbers. The SUMMARY must let a verifier check each criterion without
re-deriving anything, and must state the coverage honestly even when it is below target.
Output: three doc files updated, and a SUMMARY carrying the evidence.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- **Never raise the number.** Do not run `tokens backfill --write` or `tokens stamp` on any SUMMARY other than your
  own draft. Do not hand-edit any SUMMARY's token fields. Do not mark EST-09 complete unless measured coverage is at
  least 0.95. Paste outputs verbatim, and never round.
- **Run the repository copy** for anything new in this objective:
  `node <checkout>/plugins/devflow/devflow/bin/df-tools.cjs …`. The installed 2.14.0 runtime has no `tokens coverage`.
  Your own SUMMARY is still stamped with the installed `tokens stamp`, as the self_check says.
- **The mutation proof never touches a tracked file.** It runs on a scratch copy outside the checkout.
- **No release, tag, push or plugin install.** Record the release as a follow-up only.
- One plain command per Bash call. Never use port 8080.

<!-- TDD-EXCEPTION: documentation and evidence collection; no production logic is written in this TRD. -->

<embedded_context>

<codebase_examples>
**CHANGELOG [Unreleased] is empty today** (CHANGELOG.md line 7). Follow 2.14.0's style: `### Added` / `### Changed` /
`### Fixed`, one bullet per change, the objective number in parentheses, and plain sentences. The 2.14.0 header also
says "Entries that need an installed plugin take effect once the installed plugin is at 2.14.0". Add a matching note
to each hook or workflow entry ("needs an installed plugin carrying objective 66").

Entries to write, adapting the wording:
- Added: `df-tools tokens coverage [--milestone <v> | --objective <N>]` (objective 66, EST-09). It reports
  forward-stamp coverage (`tokens_source: "live"` over counted TRD SUMMARYs) as an exact fraction and a decimal
  floored at 6 places. It separates backfilled, unlabeled, missing and in-progress SUMMARYs, gives each missing one a
  reason (`stamp_skipped` or `no_transcript`), and is read-only.
- Changed: `gate-executor-stop.js` also blocks an executor once when its final SUMMARY has no
  `tokens_input`/`tokens_output`, with the exact stamp-and-repost commands (objective 66; 64-09 and 64-10 skipped the
  stamp).
- Changed: execute-objective runs every TRD in an executor, including checkpoint-only TRDs, and never writes a TRD's
  SUMMARY itself (65-02 and 65-03 ran inline and cannot be stamped). The objective report gains a `**Token stamp:**`
  line.
- Fixed: execute-objective pointed continuation spawns at a `continuation-prompt.md` template that does not exist. The
  continuation prompt is now inline and carries `PLAN_ID:` / `REPO_ROOT:`, so a continuation's tokens count toward its
  TRD and the stop gate recognises it.

**USER-GUIDE Estimation data** (docs/USER-GUIDE.md ~line 257). It has a command block (lines ~261-266) and one bullet
per command (`tokens` ~271, `tokens backfill` ~272). Add the line
`node ~/.claude/devflow/bin/df-tools.cjs tokens coverage                       # forward-stamp coverage of the current milestone`
to the block, and a `**`tokens coverage`.**` bullet after the backfill bullet. Cover the classes, the denominator
rule, the floored decimal, the integer target check (95%), the missing reasons, that it is read-only, and that the
objective report prints it. Extend the `tokens` bullet's "Executors run it before `summary post`" sentence with "and
the SubagentStop gate sends an executor back once if its final SUMMARY has no token fields".

**USER-GUIDE hooks table row** (~line 776):
```
| `gate-executor-stop.js` | SubagentStop | Blocks a `devflow:executor` once when it stops naturally and its TRD has no SUMMARY.md yet, telling it to finish or write the `## Progress` checkpoint. Never blocks twice in a row; fails open. | `DEVFLOW_SKIP_EXECUTOR_STOP_GATE=1` |
```
Add "or when its final SUMMARY (with `## Self-Check`) has no `tokens_input`/`tokens_output`, telling it to stamp and
re-post".

**CLAUDE.md** is resident on every turn, so keep the edits minimal:
- Estimation data bullet (line 64): `tokens trd|stamp|backfill` → `tokens trd|stamp|backfill|coverage`. Add
  "`tokens coverage [--milestone|--objective]` reports forward-stamp coverage (live/counted, floored, read-only)" in
  one clause, and add `token-coverage.cjs` to the "Implemented in" list after `tokens-cli.cjs`.
- gate-executor-stop bullet (line 134): after "has no `<id>-SUMMARY.md` in any checkout", add "or its final SUMMARY
  has no `tokens_input`/`tokens_output` (objective 66)".
</codebase_examples>

<anti_patterns>
- Do NOT describe the 95% target as met unless the command prints `met` true. "Expected to reach" is not evidence.
- Do NOT use `toFixed`, a percentage rounded in your head, or "~". Paste the fraction and the floored decimal exactly
  as printed.
- Do NOT edit `agents/executor.md` for the mutation proof. Work on the scratch copy only.
- Do NOT add a "Where we left off" rewrite to CLAUDE.md. It is out of scope.
</anti_patterns>

<error_recovery>
- If `tokens coverage` fails from the repository copy, paste the error verbatim, check 66-01's SUMMARY for the
  interface, and stop the SC-3 step with the failure recorded. Do not patch tokens-cli.cjs from this TRD.
- If a 66-01..03 SUMMARY is NOT live-stamped, record which one, its `tokens_source` and
  `node <checkout>/plugins/devflow/devflow/bin/df-tools.cjs tokens trd 66-0N` output, as an SC-2 finding. Do not
  stamp it after the fact: that would be a backfill and would not count.
- If the mutation proof does not fail, test 11 does not guard the step. Record it as a blocker in the SUMMARY with the
  test output. Do not loosen or rewrite test 11 here.
- If `npm test` hangs in `micro.test.cjs` (git signing prompt), run
  `node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` and say so.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/66-executor-token-stamp/OBJECTIVE.md
@.planning/objectives/66-executor-token-stamp/66-01-SUMMARY.md
@.planning/objectives/66-executor-token-stamp/66-02-SUMMARY.md
@.planning/objectives/66-executor-token-stamp/66-03-SUMMARY.md

Read CHANGELOG.md lines 1-40, docs/USER-GUIDE.md lines 255-275 and 770-780, and CLAUDE.md lines 60-66 and 130-136
only.
</context>

<gotchas>
- `--raw` on `df-tools tokens …` prints the TEXT. Without it the dispatcher prints JSON. Record both for SC-3.
- At the time you measure, your own 66-04 SUMMARY is a `## Progress` checkpoint (or absent), so it is `in progress
  (not counted)`. That is expected. Say the measurement predates the 66-04 SUMMARY, and that the verifier re-runs the
  same command after it.
- `doc-refs.repo.test.cjs` fails on stale command references, and `validate docs` (W050-W054) is advisory. Run both
  after the doc edits.
- The test name pattern for the mutation proof is a regex. Use `--test-name-pattern "11\\. executor.md"` (escape the
  dot).
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: CHANGELOG, USER-GUIDE and CLAUDE.md entries</name>
  <files>CHANGELOG.md, docs/USER-GUIDE.md, CLAUDE.md</files>
  <action>
Write the entries in codebase_examples. Read each SUMMARY of 66-01..03 first and use their actual flags, class names,
text format and test counts. Where a SUMMARY records a deviation from its TRD, the SUMMARY wins. Keep CLAUDE.md edits
to the two bullets. Then run the doc checks:
`node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-surfaces.test.cjs`
and `node plugins/devflow/devflow/bin/df-tools.cjs validate docs`.
Commit: `docs(66-04): tokens coverage, stop-gate token branch, never-inline rule and continuation prompt`.
  </action>
  <verify>`rg -n "tokens coverage" CHANGELOG.md docs/USER-GUIDE.md CLAUDE.md` finds an entry in each file. `rg -n "trd\|stamp\|backfill\|coverage" CLAUDE.md` finds the bullet. The two doc tests pass, and `validate docs` reports no new W05x for these files.</verify>
  <done>All three documents describe the objective-66 changes, with the installed-plugin note on the hook and workflow entries.</done>
  <recovery>If doc-refs flags a reference, fix the wording in the doc you just edited. Never edit DEPRECATION_MAP to silence it.</recovery>
</task>

<task type="auto">
  <name>Task 2: SC-1, SC-2 and SC-3 evidence, the measured coverage, and the full suite</name>
  <files>.planning/objectives/66-executor-token-stamp/66-04-SUMMARY.md (published only through `summary post`; no source file changes)</files>
  <action>
Collect evidence with one plain command per Bash call, and paste every output verbatim into a `## Evidence` section of
the SUMMARY draft, under SC-1 / SC-2 / SC-3 headings.

**SC-1 (installed prompt + repo test guards it):**
1. `rg -n "tokens stamp \{objective\}-\{trd\} --draft" ~/.claude/plugins/cache/aocyber/devflow/2.14.0/agents/executor.md`
   (expect line ~1066). Also read `~/.claude/devflow/.plugin-version` (expect 2.14.0).
2. Control on the real checkout:
   `node --test --test-name-pattern "11\\. executor.md" <checkout>/plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs`
   should give pass 1, fail 0.
3. Mutation proof on a scratch copy. `mktemp -d` gives `<T>`. Then `cp <checkout>/README.md <T>/README.md`,
   `mkdir -p <T>/plugins`, `cp -R <checkout>/plugins/devflow <T>/plugins/devflow`, and delete the stamp command line
   in the COPY:
   `sed -i '' '/df-tools.cjs tokens stamp {objective}-{trd} --draft/d' <T>/plugins/devflow/agents/executor.md`.
   Run `node --test --test-name-pattern "11\\. executor.md" <T>/plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs`
   and expect fail 1, with the message `self_check names the tokens stamp command`. Run `rm -rf <T>`. Then
   `git -C <checkout> status --porcelain plugins/devflow/agents/executor.md` should be empty.

**SC-2 (live stamps, no backfill):**
4. For each of 66-01, 66-02 and 66-03:
   `node <checkout>/plugins/devflow/devflow/bin/df-tools.cjs frontmatter get <checkout>/.planning/objectives/66-executor-token-stamp/66-0N-SUMMARY.md --field tokens_source`,
   and the same for `tokens_input` and `tokens_output`. Expect `live` and integers.
5. `git -C <checkout> log --format=%h%x20%s -- .planning/objectives/66-executor-token-stamp` should show no commit
   that mentions backfill. Also run `rg -n "backfill" <checkout>/.planning/objectives/66-executor-token-stamp/66-0[123]-SUMMARY.md`
   and check that no `tokens_source: "backfill"` appears.

**SC-3 (measured coverage):**
6. `node <checkout>/plugins/devflow/devflow/bin/df-tools.cjs --cwd <checkout> tokens coverage --milestone v1.6 --raw`
7. `node <checkout>/plugins/devflow/devflow/bin/df-tools.cjs --cwd <checkout> tokens coverage --milestone v1.6`
   (JSON: copy `counts` and `forward` into the SUMMARY).
8. `node <checkout>/plugins/devflow/devflow/bin/df-tools.cjs --cwd <checkout> tokens coverage --objective 66 --raw`.
   In the SUMMARY's frontmatter-free body, write one plain sentence:
   "Measured v1.6 forward-stamp coverage: <numerator>/<denominator> = <ratio_text> (target 95%: met|not met), measured
   before the 66-04 SUMMARY existed."
   If not met, add the arithmetic: 65-02 and 65-03 have no executor transcript and can never be forward-stamped, so
   95% needs at least 40 counted v1.6 TRDs with no further miss (38/40 = 0.95).

**Status and follow-up:**
9. Keep EST-09 Pending in REQUIREMENTS.md unless step 6 printed `met`. Set your SUMMARY's
   `requirements-completed: []` unless met. Under `## Follow-ups`, write: "A plugin release carries objective 66
   (`tokens coverage`, the gate-executor-stop token branch, the execute-objective rule and continuation prompt, and the
   executor.md sentence) to the installed runtime. Until then, executors and orchestrators run the 2.14.0 behavior."
10. Run the full suite with `npm test` (or the micro exclusion) and record the pass/fail/skip counts.
  </action>
  <verify>The SUMMARY draft has `## Evidence` with SC-1 (installed line, control pass, mutation fail, clean status), SC-2 (three live stamps, no backfill) and SC-3 (verbatim text + JSON counts/forward, the plain sentence), plus `## Follow-ups` and the suite counts. `git -C <checkout> status --porcelain plugins/devflow/agents/executor.md` is empty.</verify>
  <done>Each success criterion has verbatim evidence. The measured coverage is stated exactly and honestly. No SUMMARY other than 66-04's own was stamped or edited, and no tracked file was mutated. The 66-04 SUMMARY is live-stamped via `tokens stamp 66-04`.</done>
  <recovery>If `frontmatter get` has a different flag shape in this runtime, use `rg -n "^tokens_" <file>` instead and note it. If the scratch copy's test cannot find its fixtures, check that `cp -R` copied `devflow/bin/lib/__fixtures__/`, then retry once.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-surfaces.test.cjs</test>
<test>npm test</test>
</validation_gates>

<verification>
- `rg -n "tokens coverage" CHANGELOG.md docs/USER-GUIDE.md CLAUDE.md` finds three files.
- The 66-04 SUMMARY quotes the installed executor.md line, the mutation-proof failure, three live stamps and the verbatim v1.6 coverage output.
- EST-09 is Pending in REQUIREMENTS.md unless measured coverage is at least 0.95.
- The 66-04 SUMMARY frontmatter has `tokens_input`, `tokens_output` and `tokens_source: "live"`.
</verification>

<success_criteria>
- SC-1, SC-2 and SC-3 are each backed by verbatim evidence a verifier can re-run.
- The measured coverage is printed and recorded without rounding, with its gap to target stated if there is one.
- Documentation matches what shipped, and the release is a recorded follow-up.
</success_criteria>

<output>
After completion, publish `.planning/objectives/66-executor-token-stamp/66-04-SUMMARY.md` through `planning draft` →
`tokens stamp 66-04 --draft <path>` → `summary post 66-04 --from <path>`.
</output>
