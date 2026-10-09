---
objective: 52-store-mode-polish
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-gate.cjs
  - plugins/devflow/devflow/bin/lib/gh-gate.test.cjs
  - plugins/devflow/devflow/bin/lib/misc.cjs
  - plugins/devflow/devflow/bin/lib/misc-commit-gate.test.cjs
  - plugins/devflow/agents/debugger.md
  - plugins/devflow/devflow/bin/lib/prompt-raw-commit.repo.test.cjs
autonomous: true
requirements: ["52-2", "52-4"]
must_haves:
  truths:
    - "Every gh-gate refusal shape (default branch, never-linked branch, merged objective branch, detached HEAD, executor branch whose main checkout is unlinked) carries a message naming both `df-tools gh pr start <objective>` and the `DEVFLOW_SKIP_GH_GATE=1` escape, and a test pins all five"
    - "A refused `df-tools commit --raw` still prints only the reason code on stdout and exits 1, and now writes the full refusal message, naming both remedies, to stderr (today a raw caller sees only `default_branch`)"
    - "The escape wording shows the inline form and the reason variable: prefix the commit with DEVFLOW_SKIP_GH_GATE=1 (logged as gate gh; DEVFLOW_SKIP_GH_GATE_REASON=<why> records why)"
    - "agents/debugger.md commits code fixes through `df-tools commit ... --files <paths>`; no agent or skill prompt instructs a raw `git commit`, and a repo test fails CI if one comes back"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/prompt-raw-commit.repo.test.cjs
      provides: "CI guard: zero raw `git commit` lines in agents/*.md and skills/*/SKILL.md"
  key_links:
    - "gh-gate.cjs START_HINT -> every refusal message (decide/unlinked)"
    - "misc.cjs cmdCommit gate refusal -> stderr in raw mode (output() prints only rawValue)"
---

# TRD 52-02: Gate refusals name both remedies; debugger commits through df-tools (items 52-2, 52-4)

<objective>
Make sure a store-mode commit refusal always tells the user both ways forward, whatever output mode they use. Remove the last raw
`git commit` instruction in DevFlow's agent prompts.

Purpose: 50-VERIFICATION recorded that refusals point to `gh pr start` but not to `DEVFLOW_SKIP_GH_GATE=1`. Reading the code shows
`START_HINT` (gh-gate.cjs:33) already appends the escape to the JSON `error` text. Two real gaps remain. (1) With `--raw`,
`output()` prints only `verdict.reason`, so the caller sees `default_branch` and neither remedy (misc.cjs:648-650). (2) Only the
default-branch test asserts the escape, so the other four refusal shapes could lose it unnoticed. Separately,
`agents/debugger.md:404` tells the debugger to run raw `git add` + `git commit`, which gate-commits.js blocks (48-VERIFICATION).

Output: an exhaustive refusal test, raw-mode stderr, a clearer escape wording, a df-tools commit in debugger.md, and a repo guard test.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: `test(52-02): ...` (failing) before `fix(52-02): ...`.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. Never raw `git commit`.
- `evaluateGate` stays pure and offline (no fs, no gh). The `reason` codes and the JSON result keys of a refusal do not change.
- Local mode never loads gh-gate.cjs (misc-commit-gate test 7a pins this). Do not move the require.
- Do not touch the commit-steps/migration/doctor/gh-setup files (TRD 52-01, same wave).

## Test list

Outermost first.
1. CLI: store mode on `main`, `df-tools commit ... --raw` -> exit 1, stdout exactly `default_branch`, stderr names
   `gh pr start` and `DEVFLOW_SKIP_GH_GATE=1`, nothing staged (extends misc-commit-gate test 1b).
2. CLI: store mode on an unlinked branch, `--raw` -> stdout `unlinked_branch`, and stderr names both remedies.
3. CLI: JSON mode refusal is unchanged in keys (`committed`, `hash`, `reason`, `branch`, `error`), and `error` names both remedies.
4. Unit, table-driven over the five refusal shapes (default_branch; never-linked `feat/x`; merged `50-enforce` with `merged_at`;
   detached HEAD; `df/exec-1` with main on `main`): each message matches `/gh pr start <objective>/` and `/DEVFLOW_SKIP_GH_GATE=1/`
   and `/DEVFLOW_SKIP_GH_GATE_REASON/`.
5. Unit: the escape still requires exactly `'1'` (existing test 5e and gh-gate tests stay green).
6. Repo: zero lines in `plugins/devflow/agents/*.md` or `plugins/devflow/skills/*/SKILL.md` that invoke a raw `git commit`
   (regex `/^\s*(?:[A-Z_]+=\S+\s+)*git commit\b/` on fenced-code lines, excluding lines containing `df-tools`). It fails
   today on `agents/debugger.md:404` and lists every hit as `file:line: text`.
7. Repo sensitivity: an injected `git commit -m "x"` line inside a ```bash fence in a temp copy is detected.

<embedded_context>

<codebase_examples>
gh-gate.cjs:33, used by every refusal in `decide()` and `unlinked()`:

```js
const START_HINT = 'run `df-tools gh pr start <objective>` and commit on its branch, or set DEVFLOW_SKIP_GH_GATE=1 (logged)';
```

misc.cjs:646-651 (the raw path drops the message):

```js
const verdict = ghGate.evaluateGate({ ...inputs, env: process.env });
if (!verdict.allow) {
  const result = { committed: false, hash: null, reason: verdict.reason, branch: inputs.branch, error: verdict.message };
  output(result, raw, verdict.reason, 1);
  return;
}
```

`helpers.cjs output(result, raw, rawValue, exitCode)` writes `rawValue` to stdout in raw mode and then calls `process.exit`. So any
stderr write has to happen BEFORE `output()`.

agents/debugger.md:398-407 today:

```bash
git add src/path/to/fixed-file.ts
git add src/path/to/other-file.ts
git commit -m "fix: {brief description}

Root cause: {root_cause}"
```

Repo-test pattern: planning-writes.repo.test.cjs (header comment with a test list; repo root resolved five levels up; skip the
whole file on a mirror install with no README.md at that root).
</codebase_examples>

<anti_patterns>
- Changing stdout in raw mode. Callers (and test 1b) compare stdout to the bare reason code.
- Wording the escape as "export DEVFLOW_SKIP_GH_GATE=1". Show it as an inline prefix on the commit. (For raw commits gate-commits
  needs the variable inline, objective 44. df-tools reads `process.env`, so both work here, but the prefix is the documented form.)
- A repo guard that scans workflows/ or references/: workflows/complete-milestone.md and workstreams-merge.md hold merge-completion
  `git commit` lines that are out of scope. Keep the guard to agents and skills.
</anti_patterns>

<error_recovery>
- If test 7a (local mode loads no gate module) fails, the stderr write was put outside the `if (storeMode && ...)` block. Keep it inside the refusal branch.
- If USER-GUIDE text quoting the old message needs updating, leave it to TRD 52-06 (docs). It quotes the message at docs/USER-GUIDE.md:941.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/52-store-mode-polish/OBJECTIVE.md
@plugins/devflow/devflow/bin/lib/gh-gate.cjs
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: every refusal names both remedies, including under --raw</name>
  <files>plugins/devflow/devflow/bin/lib/gh-gate.cjs, plugins/devflow/devflow/bin/lib/gh-gate.test.cjs, plugins/devflow/devflow/bin/lib/misc.cjs, plugins/devflow/devflow/bin/lib/misc-commit-gate.test.cjs</files>
  <action>
RED: add test-list items 1-4: the table-driven unit test in gh-gate.test.cjs (`describe('52-02 every refusal names both remedies')`),
and CLI cases in misc-commit-gate.test.cjs that extend 1b with a stderr assertion and add a raw unlinked case. Item 4's
`DEVFLOW_SKIP_GH_GATE_REASON` assertion and the stderr assertions fail today. Commit `test(52-02): ...`.

GREEN:
- gh-gate.cjs: `START_HINT = 'run \`df-tools gh pr start <objective>\` and commit on its branch, or prefix the commit with DEVFLOW_SKIP_GH_GATE=1 (logged as gate gh; DEVFLOW_SKIP_GH_GATE_REASON=<why> records why)'`. Leave the module header and `ESCAPE_ENV` as they are.
- misc.cjs refusal branch: `if (raw) process.stderr.write(\`${verdict.message}\n\`);` immediately before `output(result, raw, verdict.reason, 1)`.
  Add a one-line comment citing TRD 52-02 (the raw path otherwise drops the remedy).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-gate.test.cjs plugins/devflow/devflow/bin/lib/misc-commit-gate.test.cjs plugins/devflow/devflow/bin/lib/misc-commit.test.cjs plugins/devflow/devflow/bin/lib/override.test.cjs</verify>
  <done>All five refusal shapes name `gh pr start`, `DEVFLOW_SKIP_GH_GATE=1` and the reason variable. A raw refusal keeps the bare reason on stdout and puts the message on stderr. Every pre-existing test in the four files passes.</done>
  <recovery>If an existing assertion pins the old `or set DEVFLOW_SKIP_GH_GATE=1 (logged)` text, update it in the RED commit to the new wording and note it in the SUMMARY.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: debugger commits through df-tools; CI guard on raw commits in prompts</name>
  <files>plugins/devflow/agents/debugger.md, plugins/devflow/devflow/bin/lib/prompt-raw-commit.repo.test.cjs</files>
  <action>
RED: create `prompt-raw-commit.repo.test.cjs` (test-list items 6-7). Scan the fenced code blocks (``` ... ```) of
`plugins/devflow/agents/*.md` and `plugins/devflow/skills/*/SKILL.md`. Report every line matching the raw-commit regex that does not
contain `df-tools`, as `file:line: text`. Include a sensitivity case on an in-memory string. Skip the file when the repo root has no
README.md (mirror install). Commit `test(52-02): ...`. It fails on debugger.md:404.

GREEN: in agents/debugger.md, replace the "Stage and commit code changes" block (lines ~400-407) with prose. Code changes are committed
with df-tools, naming every file (never `git add -A`/`git add .`, never raw `git commit`, which gate-commits blocks; in store mode
`df-tools commit` also needs a linked objective branch, and a refusal names `gh pr start` and the escape). Then the block:

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "fix: {brief description}

Root cause: {root_cause}" --files src/path/to/fixed-file.ts src/path/to/other-file.ts
```

Keep the following planning-docs commit block exactly as is.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/prompt-raw-commit.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs; rg -n '^git commit' plugins/devflow/agents/debugger.md returns nothing</verify>
  <done>The guard passes with zero findings. debugger.md has no `git add`/`git commit` instruction lines, and the planning-writes and doc-refs repo tests still pass.</done>
  <recovery>If the guard flags a line in skills/ you did not expect, read it. If it is a real raw-commit instruction, convert it to df-tools commit in this task and list it in the SUMMARY. If it is prose the regex misjudges, tighten the regex rather than adding an exemption list.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `node --test` over the six files in Tasks 1-2 passes.
- `rg -n 'or set DEVFLOW_SKIP_GH_GATE=1 \(logged\)' plugins/devflow/devflow/bin/lib/gh-gate.cjs` returns nothing.
- `rg -n 'process.stderr.write' plugins/devflow/devflow/bin/lib/misc.cjs` shows the new refusal write inside the store-mode gate block.
</verification>

<success_criteria>
Gate refusals name both remedies (gh pr start and the logged escape) in JSON and raw mode for all five refusal shapes. No agent or
skill prompt instructs a raw `git commit`, and CI keeps it that way.
</success_criteria>

<output>
After completion, create `.planning/objectives/52-store-mode-polish/52-02-SUMMARY.md` via `df-tools summary post`.
</output>
