---
objective: 60-edit-gate-enforces-the-action
trd: "05"
type: standard
wave: 4
depends_on: ["60-03"]
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/bash-replay-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/session-audit.cjs
  - plugins/devflow/devflow/bin/lib/session-audit.test.cjs
  - plugins/devflow/devflow/bin/lib/audit-cli.cjs
  - plugins/devflow/devflow/bin/lib/audit-cli.test.cjs
autonomous: true
requirements: [GATE-05]
must_haves:
  truths:
    - "`df-tools session-audit` JSON carries `bash_edit_gate` (appended last), keys in this order: bash_calls, ambient_bash_calls, excluded, would_deny, by_form, false_positive_rate, false_positive_basis, threshold, recommended_default, by_period, sample"
    - "The replay runs every ambient Bash tool_use through the SAME evaluateBashWrites the hook uses, in dry-run: nothing is executed or written; git is only read (one `git log` per project root)"
    - "Ambient means: the row's cwd is inside a DevFlow project, the transcript is not a devflow:* subagent (sibling .meta.json agentType), the row is not attributed to a devflow:* skill (attributionSkill), and no skill-active window is open in that session"
    - "A target counts as tracked only if it was tracked AT THE ROW'S TIMESTAMP (last add/delete event in the project's git history at or before it), so files created by the command and committed later are not counted"
    - "false_positive_rate is the conservative upper bound would_deny / ambient_bash_calls, recommended_default = recommendDefault(rate) from bash-write-gate.cjs, and zero ambient calls give rate null and recommendation warn"
    - "A real Bash-gate denial in a transcript is classified as `devflow-bash-edit-gate` (DevFlow-owned), not `devflow-edit-gate`, and does not open an edit_gate_bypass denial"
    - "`session-audit --raw` prints one more line: `bash_edit_gate: ambient_bash_calls N, would_deny N, false_positive_rate R (upper bound), threshold 0.02, recommended_default M`"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/session-audit.cjs
      provides: "trackBashGate (accumulate), newHistoryTracker({spawn}), summarizeBashGate; analyze() reads sibling .meta.json agentType; RULES gains devflow-bash-edit-gate"
    - path: plugins/devflow/devflow/bin/lib/audit-cli.cjs
      provides: "formatSessionAuditRaw appends the bash_edit_gate line"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/bash-replay-fixtures.cjs
      provides: "hand-built transcript rows (Bash tool_use with cwd/attributionSkill/timestamp), transcript tree writer with subagent .meta.json"
  key_links:
    - "session-audit.cjs -> bash-write-gate.cjs evaluateBashWrites / recommendDefault / FP_THRESHOLD / BASH_GATE_CLASSIFIER (60-03)"
    - "audit-cli.cjs runSessionAudit -> sessionAudit.analyze -> summary.bash_edit_gate -> formatSessionAuditRaw"
    - "60-06 runs `df-tools session-audit --limit 0` over ~/.claude/projects and sets BASH_EDIT_GATE_DEFAULT from recommended_default"
---

# TRD 60-05: session-audit replays transcripts through the Bash gate and reports its false-positive rate (GATE-05)

<objective>
GATE-05 says the Bash rule ships as default `strict` only if `session-audit` measures a false-positive rate of at most
2% of ambient Bash calls, and as `warn` otherwise. This TRD builds that measurement. It replays every Bash call in the
retained transcripts through the hook's own decision (`evaluateBashWrites`, 60-03) in dry-run, with history-accurate
predicates, and reports what the rule would have done.

How false positives are counted. A transcript cannot prove whether a flagged command was a genuine write. So every
would-deny in an ambient replay is counted as a false positive: `false_positive_rate = would_deny / ambient_bash_calls`.
This is an upper bound. If even the upper bound is at most 2%, the true rate is too, and strict is safe. If it is above
2%, the rule ships `warn`. The report states the basis next to the number. A planning-time probe with the older quick-31
heuristic put this bound near 1.6% over 39K ambient-candidate calls; the real number comes from 60-06.

The replay must model what the live hook would have seen at the time. Four signals define "ambient":

- A DevFlow project: an ancestor of the row's `cwd` has `.planning/`.
- Not a DevFlow agent: no sibling `<transcript>.meta.json` with `agentType: devflow:*`.
- Not inside a DevFlow skill: no `attributionSkill: devflow:*` on the row. For rows older than that field, no open
  `skill-active --start` … `--end` window, and no devflow Skill call earlier in the session.
- Tracked at the time, from the project's git history (last add or delete at or before the row's timestamp). Without
  this, every file a command created and committed later would read as "tracked".

Override phrases are ignored. That is conservative: it counts more would-denies, never fewer.

Purpose: the measurement GATE-05 requires. Output: the replay in session-audit, a raw-output line, a new block
category, fixtures and tests.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── session-audit.cjs                       ← MODIFY (replay, RULES, analyze reads .meta.json)
├── session-audit.test.cjs                  ← MODIFY (bash_edit_gate describe block)
├── audit-cli.cjs                           ← MODIFY (raw line)
├── audit-cli.test.cjs                      ← MODIFY (line counts, new line)
└── __fixtures__/bash-replay-fixtures.cjs   ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD (kind plugin, work feature). Each task is a RED commit, then a GREEN commit (`test(60-05)`, `feat(60-05)`).
- Hand-built fixtures only: the Task 1 builders and `makeTrackedRepo` (60-03) with dated `history`. No generated data,
  no real transcripts in tests, no property-based libraries, no `.feature` files.
- Hermetic git (`gitTestEnv`). The replay's default history loader spawns git, so tests that use it must run with the
  hermetic env merged into `process.env`, or inject a spawn.
- Existing session-audit and audit-cli assertions keep their meaning. The only intended edits are the raw line count
  and position (the new line is LAST) and any test that pins the full summary key list (`bash_edit_gate` appended
  last).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash
  call.
- Never use port 8080.

## Test list

`session-audit.test.cjs`, new `describe('bash_edit_gate replay')`. The project is
`makeTrackedRepo({ history: [...] })`:

- `src/a.js` added at `2026-09-01T00:00:00Z`.
- `src/late.js` added at `2026-09-10T00:00:00Z`.
- `src/gone.js` added at `2026-09-01` and removed at `2026-09-15`.

Rows use `cwd: repo.root`.

1. An ambient main-thread `echo x > src/a.js` at `2026-09-05` → `ambient_bash_calls 1`, `would_deny 1`,
   `by_form.redirect 1`, `false_positive_rate 1`, `recommended_default 'warn'`.
2. The same command at `2026-08-20`, before the add → `would_deny 0`, because the file was untracked then.
3. `echo x > src/late.js` at `2026-09-05` → 0. At `2026-09-12` → 1.
4. `sed -i 's/a/b/' src/gone.js` at `2026-09-12` → 1. At `2026-09-20` → 0.
5. Exclusions:
   - A row with `attributionSkill: 'devflow:quick'` → `excluded.devflow_skill`.
   - A subagent transcript whose `.meta.json` has `agentType: 'devflow:executor'` → `excluded.devflow_agent`.
   - A `general-purpose` subagent → counted ambient.
   - Bash rows from a `skill-active --start` row to the next `skill-active --end` row, inclusive →
     `excluded.devflow_skill`. A row after `--end` is ambient again.
   - A `Skill` tool_use with `devflow:build` opens the window for the rest of the session, or until `--end`.
6. A `cwd` with no `.planning/` ancestor → `excluded.not_devflow_project`. A `cwd` inside a `.planning/` project that
   is not a git repository → `excluded.history_unavailable`. Neither counts toward `ambient_bash_calls`.
7. Ambient rows that never gate count as ambient with `would_deny 0`: a heredoc body mention, `>> README.md`,
   `> .planning/x.json`, `> /tmp/x`, and `ls`.
8. Rate and recommendation:
   - 1 would-deny plus 49 `ls` rows → `0.02`, `'strict'`.
   - 2 would-denies plus 48 `ls` rows → `0.04`, `'warn'`.
   - No ambient rows → rate `null`, `'warn'`.
   - `threshold === 0.02`.
   - `false_positive_basis` names the upper bound.
9. The history loader spawns git once per project root: three rows in one root plus one in a second root → 2 spawns.
   Check this with `newHistoryTracker({ spawn: countingSpawn })`.
10. Classification:
    - A failed tool_result whose text is `bashGateReason([...], root, 'strict')` → event category
      `devflow-bash-edit-gate`.
    - `DEVFLOW_OWNED` has it.
    - `edit_gate_bypass.denials` stays 0, so no edit-gate denial is opened.
11. `by_period['2026-09']` counts `{ ambient, would_deny }`. `sample` holds at most 10 entries `{ ts, command, gated }`:
    the command whitespace-collapsed and cut to 200 characters, gated paths relative to the project root.
12. Every pre-existing session-audit test passes unchanged.

`audit-cli.test.cjs`:

13. Test 10 (renamed "exactly 4 lines"): line 4 is
    `bash_edit_gate: ambient_bash_calls 0, would_deny 0, false_positive_rate n/a (upper bound), threshold 0.02, recommended_default warn`.
14. C-3 now has 6 lines. Lines 0-4 are unchanged, and line 5 is the bash_edit_gate line.
15. JSON: `json.bash_edit_gate` has exactly the keys in the first truth, in that order.

<embedded_context>

<codebase_examples>
Where the replay plugs in (`session-audit.cjs`):

```js
function accumulate(acc, row, sessionId) {
  if (!row || typeof row !== 'object') return;
  if (sessionId) acc.sessions.add(sessionId);
  trackEditGate(acc, row, sessionId);          // quick 31, reads acc.editGate only
  ...
}
function analyze(roots, opts = {}) {
  ...
  for (const file of files) {
    ...
    const sessionId = path.basename(file, '.jsonl');
    for (const line of raw.split('\n')) { ... accumulate(acc, row, sessionId); }
    endEditGateSession(acc, sessionId);
  }
  return summarize(acc);
}
// summarize(): "Appended last so every key above keeps its name, value and order."
//   edit_gate_bypass: summarizeEditGate(acc),
```

A real transcript row, keys only: `parentUuid, isSidechain, message, ..., attributionSkill, attributionPlugin, type,
uuid, timestamp, ..., cwd, sessionId, version, gitBranch`. `attributionSkill` is present on about 20% of Bash rows, from
2026-07-01 onward (planning probe: 26,547 of 136,155). Subagent transcripts live at
`<project>/<session>/subagents/agent-<id>.jsonl`, with a sibling `agent-<id>.meta.json` such as
`{"agentType":"devflow:planner","description":"...","toolUseId":"...","spawnDepth":1,...}`.

The raw formatter to extend (`audit-cli.cjs` 117-145): `formatSessionAuditRaw(summary)` builds `lines` and appends
the conditional edit_gate_by_period and sample lines. Push the bash_edit_gate line after all of them.

Test fixture style to follow: `session-audit.test.cjs` lines 37-64 (`editUse`, `denial`, `bashUse`, `skillUse`,
`userText`, `T(n)`) and `audit-cli.test.cjs` `writeTranscript(home, project, session, rows)`.
</codebase_examples>

<anti_patterns>
- Do not rewire `bashWriteTargets` or the edit_gate_bypass tracker. Their numbers are DECISION-001's recorded evidence,
  and they answer a different question ("did a Bash write follow an Edit denial?").
- Do not execute anything from a transcript. The replay only parses commands and reads git history.
- Do not check tracked-ness against today's `git ls-files`. Use history at the row's time (truth 4). The planning probe
  showed many flagged writes were `cat > new_file` that was committed afterwards.
- Do not drop rows whose project is gone. Count them in `excluded.not_devflow_project` (or `history_unavailable`), so
  the denominator's provenance is visible.
- Do not let replay errors break the audit. Any throw in `trackBashGate` for one row skips that row and is counted in
  `excluded.error`.
</anti_patterns>

<error_recovery>
- If test 9 counts more spawns than roots, the cache key is wrong. Key by `realpathDeep(projectRoot)`.
- If history parsing misses deletions, run `git -C <root> log --no-renames --relative --diff-filter=AD --name-status
  --format=@%ct` by hand on the fixture repo and compare.
- If existing audit-cli tests break beyond the line count, the summary shape changed elsewhere. `bash_edit_gate` must
  be the LAST key of `summarize()`'s return.
</error_recovery>

</embedded_context>

<gotchas>
- `analyze()`: for each transcript `file`, read `file.replace(/\.jsonl$/, '.meta.json')` once (try/catch → `null`) and
  pass `{ agentType }` as a new 4th argument: `accumulate(acc, row, sessionId, fileCtx)`. The 3-argument form keeps
  working.
- `trackBashGate(acc, row, sid, fileCtx, opts)`:
  - Assistant rows only. One step per `tool_use` block. A `Skill` block with `input.skill` starting `devflow:` opens
    the session's window.
  - For each Bash block: `bash_calls++`. A command matching `/\bskill-active\s+--start\b/` opens the window, is
    excluded, and is not evaluated. `--end` closes it and is excluded.
  - Then apply, in order:
    1. agentType devflow → `devflow_agent`.
    2. attributionSkill or open window → `devflow_skill`.
    3. No absolute `row.cwd`, or no `.planning/` ancestor (`findPlanningRoot`, cached per cwd) → `not_devflow_project`.
    4. `trackedAt` returns null → `history_unavailable`.
    5. Otherwise `ambient_bash_calls++`, then `evaluateBashWrites(cmd, { cwd: row.cwd, projectRoot, isTracked:
       abs => trackedAt(projectRoot, abs, row.timestamp) })`. When `gated` is non-empty: `would_deny++`, count
       `by_form` from the first gated write's form, and update `by_period` and `sample`.
  - Use `opts.trackedAt` (tests) or the default tracker.
- `newHistoryTracker({ spawn = child_process.spawnSync } = {})` returns `{ trackedAt(root, absList, ts), available(root) }`:
  - Per root (cached): run `git -C <root> log --no-renames --relative --diff-filter=AD --name-status --format=@%ct`,
    with `{ encoding: 'utf8', maxBuffer: 256 << 20, timeout: 60000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }`.
  - Parse `@<epoch>` lines and `A\t<path>` / `D\t<path>` lines into `Map<rel, [{t, kind}]>` sorted ascending.
  - Failure → the root is unavailable, and `trackedAt` returns `null`.
  - A row with no timestamp uses `+Infinity` (latest state).
  - `rel = path.relative(realpathDeep(root), realpathDeep(abs))`.
  - Tracked iff the last event with `t <= Date.parse(ts) / 1000` is `A`.
- Summary key order (`summarizeBashGate`): `bash_calls, ambient_bash_calls, excluded { devflow_agent, devflow_skill,
  not_devflow_project, history_unavailable, error }, would_deny, by_form { redirect, tee, sed-i, perl-i, cp, mv, python,
  node }, false_positive_rate, false_positive_basis, threshold, recommended_default, by_period, sample`. Truth 1 lists
  the top-level keys. `false_positive_rate` is rounded to 6 decimals, or `null` when ambient is 0.
  `false_positive_basis` = `'upper bound: every would-deny in the ambient replay counts as a false positive'`.
- RULES: insert `['devflow-bash-edit-gate', BASH_GATE_CLASSIFIER]` BEFORE `devflow-edit-gate`. Both texts start
  `DevFlow ambient mode active`. Add the category to `DEVFLOW_OWNED`.
- Header comment: add a paragraph "Bash write gate replay (TRD 60-05)" covering the ambient definition, the
  history-accurate tracked check, the upper-bound basis and the GATE-05 decision rule, with a pointer to 60-06's
  evidence file.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Hand-built replay fixtures: Bash rows, skill rows, a transcript tree with subagent meta</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/bash-replay-fixtures.cjs</files>
  <action>
Hand-built builders:

- `bashRow({ id, command, ts, cwd, attributionSkill, isSidechain = false })` returns an assistant row with
  `message.content = [{ type: 'tool_use', id, name: 'Bash', input: { command } }]`. `attributionSkill` is omitted when
  undefined, as in real rows.
- `skillToolRow({ id, skill, ts, cwd })` returns a `Skill` tool_use row.
- `gateDenialRow({ toolUseId, text, ts })` returns a user row with a failed `tool_result`.
- `writeTranscriptTree(root, { project = 'proj', sessions = {}, subagents = {} })` writes
  `<root>/<project>/<sid>.jsonl` per session (rows as JSONL). For each `subagents[sid]` entry `{ id, agentType, rows }`
  it writes `<root>/<project>/<sid>/subagents/<id>.jsonl` and, when `agentType` is set, `<id>.meta.json` =
  `{ agentType, description: 'fixture', spawnDepth: 1 }`. It returns the root.
- `REPLAY_HISTORY`, the dated history from the test list (a.js, late.js, gone.js), ready for `makeTrackedRepo`.

Header comment: real row shape (cwd, timestamp, attributionSkill), real subagent layout, no real transcript content.
Commit `test(60-05): bash replay transcript fixtures`.
  </action>
  <verify>`node -e "const f=require('./plugins/devflow/devflow/bin/lib/__fixtures__/bash-replay-fixtures.cjs'); const os=require('os'),fs=require('fs'),p=require('path'); const r=fs.mkdtempSync(p.join(os.tmpdir(),'br-')); f.writeTranscriptTree(r,{sessions:{s1:[f.bashRow({id:'a',command:'ls',ts:'2026-09-05T00:00:00Z',cwd:'/x'})]},subagents:{s1:[{id:'agent-1',agentType:'devflow:executor',rows:[]}]}}); console.log(fs.existsSync(p.join(r,'proj','s1','subagents','agent-1.meta.json'))); fs.rmSync(r,{recursive:true,force:true})"` prints `true`.</verify>
  <done>The builders exist and write the real on-disk transcript layout.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: The replay in session-audit: ambient detection, history-accurate tracking, rate, category (tests 1-12)</name>
  <files>plugins/devflow/devflow/bin/lib/session-audit.cjs, plugins/devflow/devflow/bin/lib/session-audit.test.cjs</files>
  <action>
RED: write tests 1-11 as a new describe block. Test 9 uses `newHistoryTracker({ spawn })` directly. The others run
`analyze([treeRoot])` against a tree whose rows point at `makeTrackedRepo` projects, under the hermetic git env (set in
`before`, restored in `after`). Commit `test(60-05): bash edit gate replay cases`.

GREEN: implement per gotchas:
- `trackBashGate`, `newHistoryTracker`, `summarizeBashGate` and `findPlanningRoot` (cached).
- `analyze()` reads `.meta.json` and passes `fileCtx`.
- `accumulate` calls `trackBashGate` after `trackEditGate`, inside a try/catch that counts `excluded.error`.
- The RULES and `DEVFLOW_OWNED` additions.
- `bash_edit_gate` appended last in `summarize()`.

`analyze(roots, opts)` accepts `opts.trackedAt` for injection. Export `newHistoryTracker` and `summarizeBashGate`. Run
the whole `session-audit.test.cjs` (test 12). Commit `feat(60-05): replay Bash calls through the edit gate's Bash rule`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/session-audit.test.cjs` passes every test, old and new.</verify>
  <done>The replay is GREEN with RED before it. Pre-existing tests are unedited (except a key-list pin, if one exists).</done>
  <recovery>If the default tracker makes tests slow, every test except test 9 and one end-to-end case can inject
  `opts.trackedAt` built from `REPLAY_HISTORY`. Keep at least one test on the real git-history path.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: session-audit --raw and JSON carry bash_edit_gate (tests 13-15)</name>
  <files>plugins/devflow/devflow/bin/lib/audit-cli.cjs, plugins/devflow/devflow/bin/lib/audit-cli.test.cjs</files>
  <action>
RED: update test 10 (4 lines) and C-3 (6 lines), and add test 15. Commit `test(60-05): session-audit raw line for the bash gate`.

GREEN: in `formatSessionAuditRaw`, after the existing lines, push
`bash_edit_gate: ambient_bash_calls ${a}, would_deny ${w}, false_positive_rate ${rate === null ? 'n/a' : rate} (upper bound), threshold ${t}, recommended_default ${m}`.
A summary with no `bash_edit_gate` reads as zeros, `n/a`, `0.02` and `warn`. Update the formatter's doc comment (the line
count). Commit `feat(60-05): report the bash gate false-positive rate in session-audit --raw`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/audit-cli.test.cjs plugins/devflow/devflow/bin/lib/session-audit.test.cjs` passes. `node plugins/devflow/devflow/bin/df-tools.cjs session-audit --raw --limit 5` exits 0 and its last line starts with `bash_edit_gate:`.</verify>
  <done>Both the JSON and the raw report carry the measurement.</done>
</task>

</tasks>

<validation_gates>
- Task gate (`test`): `node --test plugins/devflow/devflow/bin/lib/session-audit.test.cjs plugins/devflow/devflow/bin/lib/audit-cli.test.cjs`.
</validation_gates>

<verification>
- Both test files pass.
- `node plugins/devflow/devflow/bin/df-tools.cjs session-audit --limit 20` prints JSON with `bash_edit_gate` as its
  last key.
- The replay never writes. Run `git status --porcelain` in a fixture project before and after `analyze()`: identical.
</verification>

<success_criteria>
- [ ] session-audit reports the Bash-gate false-positive rate, with its basis and the recommendation (GATE-05)
- [ ] The replay uses the hook's own evaluateBashWrites, history-accurate tracking and the four ambient signals
- [ ] Real Bash-gate denials get their own DevFlow-owned category
</success_criteria>

<output>
After completion, create `.planning/objectives/60-edit-gate-enforces-the-action/60-05-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`.
</output>
