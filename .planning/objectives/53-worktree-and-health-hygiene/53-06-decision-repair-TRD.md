---
objective: 53-worktree-and-health-hygiene
trd: "06"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/decision-repair.cjs
  - plugins/devflow/devflow/bin/lib/decision-repair.test.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/33-decision-resolution.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/33-decision-resolution.test.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/README.md
autonomous: true
requirements: ["53-8"]
must_haves:
  truths:
    - "`df-tools doctor` reports each resolved decision whose `resolution` was flattened by the pre-52 one-line writer, classified as repairable or unrecoverable, and reports ok when there are none"
    - "`df-tools doctor --fix` (local mode) rewrites each repairable decision so `resolution` is a `|-` block scalar holding the full answer, `resolved_at` and every other key are intact, the body after the frontmatter is byte-identical, and a backup is taken first"
    - "A repair is written only when re-parsing the rewritten file with extractFrontmatter gives exactly the recovered answer and the original resolved_at; otherwise the file is left untouched and reported as unrecoverable with the hand-fix instruction"
    - "A single-line resolution (including DECISION-002's trailing blank line) and an already-block-scalar resolution are intact and never rewritten"
    - "In store mode the check is report-only (fixable false): the decision file is a cache of GitHub, so the finding points at the hand fix and the GitHub copy"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/decision-repair.cjs
      provides: "pure classifyDecision(text) -> {state: intact|repairable|unrecoverable, answer?, reason?} and repairDecision(text) -> {ok, text?, reason?}"
    - path: plugins/devflow/devflow/bin/lib/doctor-checks/33-decision-resolution.cjs
      provides: "doctor check id decision-resolution (scope project) with a backed-up, verified fix"
  key_links:
    - from: plugins/devflow/devflow/bin/lib/decision-repair.cjs
      to: plugins/devflow/devflow/bin/lib/frontmatter.cjs
      via: "extractFrontmatter (verification) and the 52-05 block-scalar serializer"
      pattern: "extractFrontmatter"
    - from: plugins/devflow/devflow/bin/lib/doctor-checks/33-decision-resolution.cjs
      to: plugins/devflow/devflow/bin/lib/upgrade.cjs
      via: "upgrade.backup before any write"
      pattern: "backup"
---

# TRD 53-06: Repair decisions flattened before objective 52 (item 53-8)

<objective>
Add a `df-tools doctor` check that finds resolved decisions whose multi-line `resolution` was mangled by the pre-52 writer. `doctor --fix`
repairs each one where the full answer can be recovered from the file, and the check reports the rest for hand-fixing.

Why recovery is usually possible: the pre-52 serializer (frontmatter.cjs before 4ab2e30a) wrote every string on one line, adding `"…"` only when the value held `:` or `#`,
and it never escaped newlines. So the raw file still holds every byte of the answer. It is the PARSE that is lossy. The 52-05
reproduction (answer `Option B.\nReason: second line with colon\n---\nthird line\n`) left this on disk:
```
resolution: "Option B.
Reason: second line with colon
---
third line
"
resolved_at: "2026-10-04T13:49:05.343Z"
```
extractFrontmatter reads that back as `{resolution: '"Option B.', Reason: 'second line with colon'}` and stops at the inner `---`, so
`resolved_at` is lost. The text between the `resolution:` line and the following `resolved_at:` line is the answer: strip the opening `"`
and the closing `"` line when quoted, then apply 52-05's normalisation (CRLF to LF, trimEnd). `resolveDecision` always writes `resolution` and then
`resolved_at` last, so that span is well defined.

When recovery is impossible: the file was re-serialized after mangling, the closing `resolved_at:` line is missing, or the rebuilt file
does not re-parse to the recovered answer. Then the check reports the file with USER-GUIDE's hand-fix instruction (write
`resolution: |-` followed by the answer lines, each indented two spaces).

This repo has one resolved decision, DECISION-002. Its single-line answer is followed by a blank line, so it is intact and must not be rewritten.

Output: a pure `decision-repair.cjs` module, doctor check `33-decision-resolution`, tests, and the README range table updated.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: `test(53-06): ...` (failing) before `feat(53-06): ...`.
- Use the repo df-tools. Commit with its `commit … --files`, one plain command per Bash call.
- Follow doctor-checks/README.md: no `os.homedir()`/`process.env` (use `ctx.userHome`/`ctx.env`), no `output()`/`error()`, and `fixable`
  only when the fix is safe and reversible now. The fix takes `upgrade.backup({projectRoot, userHome: ctx.userHome, now: ctx.now})` first and
  never commits. It is a working-tree edit, not an index change.
- Use `require('../planning-mode.cjs').isStoreMode(root)` for the store check.
- Fixtures are hand-built from the exact pre-52 shapes above (no generated text).
- Decision files live at `.planning/decisions/resolved/DECISION-NNN.md`. Pending decisions have no resolution, so skip them.

## Test list

Outermost first.
1. **Doctor e2e (33-decision-resolution.test.cjs, fake home, temp project):** with one repairable and one intact decision, `run()` returns `warn`,
   `fixable: true`, and a finding naming the repairable id. `fix()` returns `applied: true` with `changed` = the repairable file's
   project-relative path and a `backup` path under the fake home. A re-run returns `ok`. The intact file is byte-identical.
2. **Store mode:** the same fixture with `.planning/config.json` `{github: {enabled: true, store: true}}`. `run()` gives `warn`, `fixable: false`,
   and a finding that says the repair is a hand fix in store mode.
3. **No decisions dir / only pending decisions:** `ok`, not fixable.
4. **Unit: the 52-05 quoted shape** (inner `---`, `Reason:` line). classifyDecision gives `repairable` with
   answer `Option B.\nReason: second line with colon\n---\nthird line`. repairDecision's text re-parses to that answer, keeps
   `resolved_at: "2026-10-04T13:49:05.343Z"`, has no `Reason` key, and its body (from `## Decision` on) is byte-identical.
5. **Unit: unquoted multi-line** (`resolution: first line` / `second line` / `resolved_at: "…"`, no `:` or `#` in the answer) gives `repairable`
   with answer `first line\nsecond line`.
6. **Unit: intact shapes:** DECISION-002's shape (one line, then a blank line, then `resolved_at`) gives `intact`. `resolution: |-` with
   indented lines gives `intact`. A plain `resolution: B` gives `intact`.
7. **Unit: unrecoverable:** `resolution: "Option B.` with continuation lines and no later `resolved_at:` line gives `unrecoverable`, with a reason.
   repairDecision refuses, and the input is never changed.
8. **Unit: verification guard:** repairDecision takes an optional `{ parse }` seam (default `extractFrontmatter`). When a stub parser
   returns a different `resolution`, or drops `resolved_at`, for the rebuilt text, repairDecision refuses and classifyDecision with the same seam
   gives `unrecoverable`. Do not try to build a natural input for this: 52-05 showed DevFlow's own parser round-trips leading-space lines.
9. **This repo smoke (record in the SUMMARY):** `node plugins/devflow/devflow/bin/df-tools.cjs doctor --json` lists `decision-resolution`
   as `ok` (DECISION-002 intact). Do not run `--fix` on this repo.

<embedded_context>

<codebase_examples>
Doctor check contract (doctor-checks/README.md):
```js
module.exports = {
  id: 'decision-resolution', title: 'Resolved decisions keep their full answer', scope: 'project',
  run(ctx) { return { severity, finding, fixable, fix_command?, details? }; },
  fix(ctx, result) { return { applied, refused?, changed?, backup?, notes? }; },
};
```
Pattern for a backed-up fix: doctor-checks/20-legacy-runtime-state.cjs:177-215. It re-discovers state inside fix() (the state may
have moved since run()), calls `upgrade.backup(...)`, then writes.

The pre-52 quoting rule (git show 4ab2e30a^:plugins/devflow/devflow/bin/lib/frontmatter.cjs, reconstructFrontmatter):
```js
if (sv.includes(':') || sv.includes('#') || sv.startsWith('[') || sv.startsWith('{')) lines.push(`${key}: "${sv}"`);
else lines.push(`${key}: ${sv}`);
```
No escaping, so a quoted value ends at the LAST `"` before the `resolved_at:` line.

Repair approach (decision-repair.cjs):
1. Split the raw text into lines. Find the first line matching `/^resolution:\s?(.*)$/` and the first later line matching `/^resolved_at:\s/`.
   Pre-flight: the file must start with `---`.
2. span = [the resolution value, ...the lines strictly between]. Quoted when the value starts with `"`: drop that `"`, and drop the trailing `"`
   (a final line that is exactly `"`, or a trailing `"` on the last non-blank line).
3. answer = span.join('\n').replace(/\r\n/g, '\n').trimEnd().
4. intact when the lines between hold only blanks, the value is a block indicator (`|`, `|-`, `|+`, `>`…), or `extractFrontmatter(text).resolution === answer`.
5. rebuilt = lines before resolution + the block form of `resolution` (from frontmatter.cjs's serializer, e.g.
   `reconstructFrontmatter({resolution: answer})`, so the shape matches 52-05 exactly) + the lines from `resolved_at:` onwards, unchanged.
6. Verify: `extractFrontmatter(rebuilt)` gives `resolution === answer` and `resolved_at` equal to the original value, and the text after the
   frontmatter is unchanged. Otherwise refuse (`unrecoverable`).
Check frontmatter.cjs exports for the serializer name (`reconstructFrontmatter` / `spliceFrontmatter`) before using it.
</codebase_examples>

<anti_patterns>
- Do not route the repair through `decision answer`. It takes pending decisions only.
- Do not parse-then-reserialize the whole file with extractFrontmatter. The broken parse is the problem, and it would drop the body text after the
  inner `---`.
- Do not "repair" store-mode cache files. Their source of truth is GitHub.
- Do not run `doctor --fix` against this repo during execution.
</anti_patterns>

<error_recovery>
- If doctor.e2e.test.cjs pins an exact set of check ids, add `decision-resolution` where its fixture expects project checks. Its fixture has
  no decisions, so the result is `ok`. Record the change.
- If the serializer emits a different indentation than 52-05's `|-` + 2 columns, use it as it is. The verification step is the contract.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: pure decision-repair module (classify, recover, rebuild, verify)</name>
  <files>plugins/devflow/devflow/bin/lib/decision-repair.cjs, plugins/devflow/devflow/bin/lib/decision-repair.test.cjs</files>
  <action>
RED: write Test list items 4-8 in decision-repair.test.cjs and confirm they fail (the module is absent). Commit `test(53-06): ...`.
GREEN: implement `classifyDecision(text)` and `repairDecision(text)` per the codebase_examples approach. Both are pure: no fs, no git. Export them.
Commit `feat(53-06): ...`.
# CRITICAL: repairDecision never returns text that fails its own re-parse verification.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/decision-repair.test.cjs plugins/devflow/devflow/bin/lib/frontmatter.test.cjs</verify>
  <done>Items 4-8 pass. Quoted and unquoted shapes are recovered exactly, intact shapes are untouched, and unrecoverable shapes are refused.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: doctor check 33-decision-resolution with a backed-up, verified fix</name>
  <files>plugins/devflow/devflow/bin/lib/doctor-checks/33-decision-resolution.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/33-decision-resolution.test.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/README.md</files>
  <action>
RED: write Test list items 1-3 and confirm they fail. Commit `test(53-06): ...`.
GREEN: the check scans `.planning/decisions/resolved/*.md` and classifies each file with decision-repair. Severity: `warn` when any file is
repairable or unrecoverable, else `ok`. `fixable` is true only when at least one file is repairable and the project is NOT in store mode.
`details` lists `{id, state, reason?}`. The finding names the ids, and for unrecoverable files it gives the hand-fix instruction. fix() re-scans,
takes the backup, rewrites each repairable file (atomic write), and returns `changed` (project-relative posix paths) plus `backup`.
README.md: name `33-decision-resolution` in the 30-39 row. Then run Test list item 9 against this repo (read-only) and record it.
Commit `feat(53-06): ...`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/doctor-checks/33-decision-resolution.test.cjs plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/30-31-state.test.cjs && node plugins/devflow/devflow/bin/df-tools.cjs doctor --json</verify>
  <done>Doctor reports flattened decisions and repairs the recoverable ones with a backup. Store mode is report-only, the doctor e2e passes, and this repo reports `decision-resolution: ok`.</done>
  <recovery>If the engine rejects the module (contract violation shows as an `invalid doctor check` error result), compare its exports with README's contract: kebab id, non-empty title, scope 'project', fix a function.</recovery>
</task>

</tasks>

<validation_gates>
- test (task): `node --test` on the files in each task's `<verify>`.
- test (objective gate, run once in 53-07): `npm test`.
</validation_gates>

<verification>
- decision-repair and 33-decision-resolution tests pass, and the doctor e2e is green.
- `df-tools doctor --json` in this repo: `decision-resolution` ok.
</verification>

<success_criteria>
A decision flattened before objective 52 is detected. `doctor --fix` repairs it in place, with a backup, when its full answer is recoverable
from the file. Otherwise it is reported for hand-fixing. Intact decisions and store-mode caches are never rewritten.
</success_criteria>

<output>
Publish the SUMMARY with `summary checkpoint` / `summary post` 53-06 and commit it with your docs commit.
</output>
