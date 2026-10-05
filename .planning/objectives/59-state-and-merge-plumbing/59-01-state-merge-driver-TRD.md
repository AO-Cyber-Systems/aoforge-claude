---
objective: 59-state-and-merge-plumbing
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/state-merge-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/state-merge.cjs
  - plugins/devflow/devflow/bin/lib/state-merge.test.cjs
  - plugins/devflow/devflow/bin/lib/merge-driver-cli.cjs
  - plugins/devflow/devflow/bin/lib/merge-driver-cli.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
autonomous: true
requirements: [PLMB-02]
must_haves:
  truths:
    - "mergeStateJson(base, ours, theirs) keeps every decisions/blockers/session_log entry either side added, drops an entry one side removed, sums metrics counter deltas, takes the max of other numbers and the later of two ISO dates, and returns text byte-identical to what writeStateJson writes"
    - "`df-tools merge-driver install` writes one managed block to the repository's COMMON info/attributes (`**/.planning/state.json merge=devflow-state-json`, `**/.planning/STATE_ARCHIVE.md merge=union`) and a repo-local `merge.devflow-state-json.driver`; a second run reports `changed: false`; `--check` writes nothing"
    - "In a hermetic repository with the driver installed, merging two branches that each added a decision to state.json and a row to STATE_ARCHIVE.md completes with no conflict and keeps both; the same merge without install conflicts (control)"
    - "`df-tools merge-driver resolve <path>` resolves a stopped merge's state.json (JSON-aware) or STATE_ARCHIVE.md (union) from the index stages and stages the result; any other path is refused"
    - "This repository has the driver installed (pointing at the repo copy of df-tools) before wave 2's parallel merges run"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/state-merge.cjs
      provides: "mergeStateJson(baseText, oursText, theirsText) -> {ok, text, notes} | {ok:false, reason}; pure, no I/O"
    - path: plugins/devflow/devflow/bin/lib/merge-driver-cli.cjs
      provides: "cmdMergeDriver(cwd, args, raw): state-json | install [--check] | resolve <path>"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/state-merge-fixtures.cjs
      provides: "hand-built state.json / STATE_ARCHIVE.md builders and a hermetic wave repository"
  key_links:
    - "git merge -> .git/info/attributes `merge=devflow-state-json` -> config merge.devflow-state-json.driver -> `node '<bin>' merge-driver state-json %O %A %B` -> mergeStateJson"
    - "df-tools.cjs `case 'merge-driver':` and help.cjs HELP_TABLE['merge-driver'] (help.test.cjs pins dispatcher <-> help both ways)"
    - "59-06 wires `merge-driver install` and `merge-driver resolve` into execute-objective.md"
---

# TRD 59-01: A JSON-aware merge for state.json and a union merge for STATE_ARCHIVE.md (PLMB-02)

<objective>
Parallel wave merges conflict on `.planning/state.json` and `.planning/STATE_ARCHIVE.md` (USER-GUIDE, Known issues).
Every executor appends to both: `state add-decision` adds an entry to state.json `decisions` and a bullet to the archive,
`state record-metric` adds an archive table row. Two branches appending at the same place is a textual conflict, and the
documented merge path in execute-objective aborts on any conflicted path other than STATE.md, ROADMAP.md and
REQUIREMENTS.md.

This TRD builds the merge itself:

1. `lib/state-merge.cjs` — `mergeStateJson(baseText, oursText, theirsText)`, a pure 3-way merge of state.json.
2. `df-tools merge-driver state-json <base> <ours> <theirs>` — the git merge driver entry point (writes `<ours>`).
3. `df-tools merge-driver install [--check]` — registers the driver and the attributes, idempotently, in places that are
   never committed: `$(git rev-parse --git-path info/attributes)` (shared by every linked worktree) and repo-local config.
   `STATE_ARCHIVE.md` uses git's built-in `merge=union` (it is append-only), so it needs no driver.
4. `df-tools merge-driver resolve <path>` — the documented fallback for a merge that already stopped (driver not
   installed at merge time): reads the index stages, merges, writes, `git add`s.
5. Dogfood: install it in this repository at the end, so wave 2 of this objective (four parallel TRDs) merges through it.

59-06 wires install and resolve into execute-objective.md; this TRD changes no workflow prose.

Purpose: success criterion 2 (a parallel wave merge completes with no conflict on STATE_ARCHIVE.md or state.json).
Output: two lib modules with tests, a fixture module, the dispatch arm and help entry, the driver installed here.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                              ← MODIFY (case 'merge-driver', header comment)
└── lib/
    ├── help.cjs                              ← MODIFY (HELP_TABLE['merge-driver'])
    ├── state-merge.cjs                       ← CREATE
    ├── state-merge.test.cjs                  ← CREATE
    ├── merge-driver-cli.cjs                  ← CREATE
    ├── merge-driver-cli.test.cjs             ← CREATE
    └── __fixtures__/state-merge-fixtures.cjs ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD (kind plugin, work feature): every behaviour below goes RED first, then GREEN, in separate commits
  (`test(59-01): ...` then `feat(59-01): ...`). One test at a time when it helps; never write production code ahead of a
  failing test.
- Hand-built fixtures only (no generated test data, no property-based libraries, no `.feature` files).
- Every git operation in a test runs in a hermetic temp repository with `gitTestEnv(home)` from
  `__fixtures__/wiki-remote.cjs` (GIT_CONFIG_GLOBAL=/dev/null, temp HOME, explicit identity) plus a local
  `commit.gpgsign false`. Never touch this repository's git config from a test.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash
  call (no `&&`, `;`, pipes or `cd`). A raw `git commit` is denied by gate-commits.
- Use the repo copy of df-tools for every live command (`node plugins/devflow/devflow/bin/df-tools.cjs ...`): the
  `~/.claude/devflow` mirror has no `merge-driver` until the next release.
- Never use port 8080 (nothing here needs a server).

## Test list

Outermost first. Pure merge (`state-merge.test.cjs`, no I/O):

1. Both sides append a different decision → merged `decisions` = base entries, then ours' additions, then theirs'
   additions, in that order.
2. The same entry added on both sides appears once (entries compare by canonical JSON: keys sorted).
3. `blockers`: theirs removed one base entry (resolve-blocker), ours left it → removed. Ours added a blocker while theirs
   removed a different one → both effects kept.
4. `metrics`: base `jobs_completed` 2, ours 3, theirs 4 → 5 (base + both deltas). Only one side changed → that side.
5. Other numbers changed on both sides (`current_job` 3 vs 4, `progress_pct` 40 vs 60) → the max.
6. `last_activity` `2026-10-05` vs `2026-10-06` → the later; `status` changed differently on both sides → ours, with a
   note naming `status`.
7. A key added on one side only is kept; a key deleted on one side and unchanged on the other is deleted.
8. Empty or whitespace base (file added on both sides) is treated as `{}`.
9. Output text equals `JSON.stringify(merged, null, 2)` with no trailing newline — byte-identical to `writeStateJson`.
10. Unparsable ours or theirs, or a top level that is not a plain object → `{ok: false, reason}`; never throws.

CLI (`merge-driver-cli.test.cjs`, spawns the real binary; hermetic git):

11. `merge-driver state-json O A B` writes the merge into A, prints nothing on stdout, exit 0; an unparsable B → exit 1,
    reason on stderr, A untouched.
12. `merge-driver install --check` in a fresh repo → `installed: false`, nothing written. `install` → `changed: true`,
    the managed block in info/attributes (exact lines below) and `merge.devflow-state-json.driver` =
    `node '<abs path of the df-tools.cjs that ran>' merge-driver state-json %O %A %B`. Second `install` →
    `changed: false`, files byte-identical. `--check` after → `installed: true`.
13. `install` from a linked worktree (git worktree add) writes the COMMON info/attributes and the shared config:
    `git -C <main> check-attr merge -- .planning/state.json` prints `devflow-state-json`.
14. Lines a user already had in info/attributes are kept; a rerun replaces only the managed block, in place.
15. End to end: base commit with state.json (`decisions: [d0]`) and a seeded STATE_ARCHIVE.md. Branch A adds `d1` and a
    metrics row `A`; branch B adds `d2` and a row `B`. With install: `git merge --no-ff A` then `git merge --no-ff B`
    both exit 0, `git diff --name-only --diff-filter=U` is empty, state.json parses with `[d0, d1, d2]`, the archive holds
    rows A and B. Control (no install): the second merge exits 1 with both files unmerged.
16. Resolve: in the control repository, `merge-driver resolve .planning/state.json` and
    `merge-driver resolve .planning/STATE_ARCHIVE.md` each exit 0 and stage the file; `git diff --name-only
    --diff-filter=U` is empty; `git commit --no-edit` completes the merge; state.json holds d1 and d2.
17. `resolve src/a.js` → exit 1 naming the two supported files; `resolve .planning/state.json` with no merge in progress
    → exit 1 (`no conflicted stages`).

Help/dispatch: `help.test.cjs` and `dispatch-completeness.test.cjs` stay green with the new command.

<embedded_context>

<codebase_examples>
The format the driver must reproduce (`lib/state.cjs`):

```js
function writeStateJson(cwd, data) {
  const jsonPath = path.join(cwd, '.planning', 'state.json');
  const existing = readStateJson(cwd) || Object.assign({}, STATE_JSON_DEFAULTS);
  const merged = Object.assign({}, existing, data);
  if (data.metrics) {
    merged.metrics = Object.assign({}, existing.metrics || {}, data.metrics);
  }
  fs.writeFileSync(jsonPath, JSON.stringify(merged, null, 2), 'utf-8');   // no trailing newline
  return merged;
}
const STATE_JSON_DEFAULTS = { current_objective: null, current_job: 0, total_jobs: 0, progress_pct: 0, status: null,
  last_activity: null, metrics: { jobs_completed: 0, jobs_failed: 0, sessions: 0 }, decisions: [], blockers: [],
  session_log: [] };
```

A decision entry as `state add-decision` writes it to state.json: `{ "objective": "58", "summary": "...",
"rationale": null }`; the archive bullet beside it is `- [Objective 58]: <summary>`, and `record-metric` appends
`| Objective 58 P03 | 12min | 3 tasks | 4 files |` at the end of the Performance Metrics table.

The archive seed (`ARCHIVE_SEED` in state.cjs) the fixtures should mirror:

```
# State Archive

Append-only log. Written by df-tools `add-decision` and `record-metric`.
STATE.md stays lean; this file grows over time.

## Decisions

- *(none yet)*

## Performance Metrics

| Objective | Duration | Tasks | Files |
|-----------|----------|-------|-------|
```

Dispatcher arms are indented exactly four spaces (help.test.cjs parses `^ {4}case '([^']+)':`); the nearest model is:

```js
    case 'exec-context': {
      // df-tools exec-context check --repo <path> [--base <ref>] [--id <plan_id>]
      cmdExecContextRoute(cwd, args.slice(1), raw);
      break;
    }
```

HELP_TABLE entry shape (`lib/help.cjs`):

```js
  'exec-context': {
    usage: 'df-tools exec-context <check|worktree|release> --repo <path> [--base <ref>] [--id <slug>] [--path <dir>] [--raw]',
    summary: 'Prove a spawn is in the intended repo on an explicit base; provision a worktree from that base.',
    mutates: true,
    details: [ '  check     Exit 1 unless ...', ],
  },
```

Hermetic git env (`__fixtures__/wiki-remote.cjs`): `gitAvailable()`, `gitTestEnv(home)` (HOME, GIT_CONFIG_GLOBAL and
GIT_CONFIG_SYSTEM = /dev/null, GIT_TERMINAL_PROMPT=0, author/committer identity). `exec-context.cjs` shows the
`spawnSync('git', args, { cwd, encoding: 'utf-8' })` wrapper style to copy into merge-driver-cli.cjs.
</codebase_examples>

<anti_patterns>
- Do not write the attributes to a tracked `.gitattributes`: that would need a commit in every user repository and a
  merge of its own. `info/attributes` and repo-local config are per-clone, shared by linked worktrees, never committed.
- Do not resolve `git rev-parse --git-path info/attributes` relative to anything but the cwd it ran in: it prints
  `.git/info/attributes` (relative) in a main checkout and an absolute path in a linked worktree (probed).
- Do not print anything on stdout from `state-json` mode: git runs the driver inside `git merge`; diagnostics go to
  stderr.
- Do not dedupe entries inside ONE side (ours may legitimately hold repeats); dedupe only theirs' additions against ours.
- No property-based tests; named cases only.
</anti_patterns>

<error_recovery>
- Probed on git in this environment: a `merge=<name>` attribute whose driver is not configured falls back to the
  normal text merge silently (a conflict, not an error), and `merge=union` on STATE_ARCHIVE.md merged two appended lines
  cleanly. If test 15's control does NOT conflict, the fixture branches are not touching the same lines: append at the
  end of `decisions` and at the end of the metrics table on both branches.
- If the installed driver seems not to run: `git check-attr merge -- .planning/state.json` in the test repo, then
  `git config --get merge.devflow-state-json.driver`, then run the driver by hand on three temp files.
- If `git merge` hangs: GIT_EDITOR must be `true` (gitTestEnv sets it) and the merge must pass `-m` or `--no-edit`.
</error_recovery>

</embedded_context>

<gotchas>
- git runs a merge driver through `sh -c` from the repository's top level, with `%O %A %B` replaced by temp file paths.
  Single-quote the df-tools path in the driver string; refuse (exit 1 with a message) a path containing `'`.
- The driver command is `node '<bin>' ...` with `node` from PATH (version-agnostic; Claude Code's shell has it).
  `<bin>` is `path.join(__dirname, '..', 'df-tools.cjs')` resolved from merge-driver-cli.cjs: the copy that ran
  `install`. From the mirror that is `~/.claude/devflow/bin/df-tools.cjs`; in tests and in this repo's dogfood it is
  the repo copy. A later `install` from another copy rewrites the line and reports `changed: true`.
- Patterns with `**/` match at every depth, including the root: `**/.planning/state.json` also covers nested
  `.planning/` directories (migration 0008 treats those as runtime state too).
- `.git/info/` may not exist; create it. A missing info/attributes file is fine.
- The managed block is delimited by `# >>> devflow merge drivers (df-tools merge-driver install)` and
  `# <<< devflow merge drivers`; replace between the markers, append the block when absent.
- The base stage (`:1:`) is missing when both branches added the file; treat it as empty. Ours/theirs stages missing →
  nothing to resolve (test 17).
- `git merge-file -p --union <ours> <base> <theirs>` writes the union to stdout; feed it temp copies of the stages under
  `os.tmpdir()` and remove them afterwards.
- In store mode state.json is gitignored and never merges; install is harmless there. No store-mode branch is needed.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builders for state.json, the archive and a hermetic wave repository</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/state-merge-fixtures.cjs</files>
  <action>
Hand-built builders, no generated data (constraint no_llm_test_data):

- `stateDoc(overrides = {})` — a full state.json object in STATE_JSON_DEFAULTS key order (copy the defaults literally; do
  not require state.cjs, so the fixture pins the shape), shallow-merged with `overrides` (`metrics` merged one level).
- `decision(objective, summary, rationale = null)` → `{objective, summary, rationale}`.
- `stateText(obj)` → `JSON.stringify(obj, null, 2)` (no trailing newline, as writeStateJson).
- `archiveText({ decisions = [], metrics = [] })` → the ARCHIVE_SEED shape above; with decisions, the
  `- *(none yet)*` line is replaced by `- [Objective <objective>]: <summary>` bullets (the exact line
  `cmdStateAddDecision` writes); each metric is a `| Objective <objective> P<job> | <duration> | <tasks> tasks |
  <files> files |` row under the table header (the exact row `cmdStateRecordMetric` writes).
- `makeWaveRepo({ state, archive })` → a temp repo (mkdtemp under os.tmpdir(), realpath'd) with `git init -b main`,
  local `user.name`/`user.email`/`commit.gpgsign false`, `.planning/state.json` = `stateText(state)`,
  `.planning/STATE_ARCHIVE.md` = `archive`, and one base commit. Returns
  `{ root, env, git(args) (throws on non-zero, trimmed stdout), run(args) (raw spawnSync), branchWith(name, files)
  (create branch from main, write `{relPath: content}`, commit, switch back to main), cleanup() }`. All git calls use
  `{ ...process.env, ...gitTestEnv(home) }` with a temp HOME inside the mkdtemp dir.

Header comment: what each builder is for and that every git call is hermetic. Commit
`test(59-01): state merge fixture builders`.
  </action>
  <verify>`node -e "const f=require('./plugins/devflow/devflow/bin/lib/__fixtures__/state-merge-fixtures.cjs'); const r=f.makeWaveRepo({state:f.stateDoc(),archive:f.archiveText({})}); console.log(r.git(['log','--oneline']).split('\n').length); r.cleanup()"` prints `1`.</verify>
  <done>The fixture module loads, builds a one-commit hermetic repository and cleans it up; nothing outside os.tmpdir() is written.</done>
  <recovery>If `git init -b` is unsupported, `git init` then `git symbolic-ref HEAD refs/heads/main` before the first commit.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: mergeStateJson — the pure 3-way merge (tests 1-10)</name>
  <files>plugins/devflow/devflow/bin/lib/state-merge.cjs, plugins/devflow/devflow/bin/lib/state-merge.test.cjs</files>
  <action>
RED: tests 1-10 in `state-merge.test.cjs` using the Task 1 builders. Run them, watch them fail (module missing), commit
`test(59-01): mergeStateJson cases`.

GREEN: `lib/state-merge.cjs` (CommonJS, sync, no I/O, header comment stating the rules):

```
mergeStateJson(baseText, oursText, theirsText):
  base   = blank(baseText) ? {} : tryParse(baseText) ?? {}      # unparsable base: {} plus a note
  ours   = tryParse(oursText);   theirs = tryParse(theirsText)
  if ours/theirs unparsable or not plain objects -> {ok:false, reason}
  merged = mergeValue(base, ours, theirs, [], notes)
  return {ok:true, text: JSON.stringify(merged, null, 2), notes}

mergeValue(b, o, t, keyPath):
  if equal(o, t) -> o
  if equal(b, o) -> t                     # only theirs changed
  if equal(b, t) -> o                     # only ours changed
  arrays  -> mergeArray(isArray(b) ? b : [], o, t)
  objects -> mergeObject(isPlain(b) ? b : {}, o, t, keyPath)
  numbers -> keyPath[0] === 'metrics' ? o + t - (number b ? b : 0) : Math.max(o, t)
  ISO dates (/^\d{4}-\d{2}-\d{2}/ on both) -> the later string
  else -> o, notes.push(`<keyPath>: changed on both sides; kept ours`)

mergeArray(b, o, t):   # key = canonical JSON (sorted keys)
  removedByTheirs = keys(b) - keys(t)
  out = o.filter(x => !removedByTheirs.has(key(x)))
  for x of t: if key(x) not in keys(b) and not in keys(out) -> out.push(x)
  return out

mergeObject(b, o, t, keyPath):  # ours' key order first, then theirs-only keys
  both present -> mergeValue
  only in ours  -> drop if b has it and equal(b[k], o[k]) (theirs deleted it), else keep
  only in theirs -> drop if b has it and equal(b[k], t[k]) (ours deleted it), else keep
```

Export `{ mergeStateJson, canonicalJson }`. Commit `feat(59-01): JSON-aware 3-way merge for state.json`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/state-merge.test.cjs` passes 10/10.</verify>
  <done>Tests 1-10 went RED then GREEN in separate commits; the module has no fs/child_process require.</done>
  <recovery>If test 9 fails on a newline, compare against `JSON.stringify(obj, null, 2)` exactly; do not append `\n`.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: df-tools merge-driver state-json | install | resolve, then install it here (tests 11-17)</name>
  <files>plugins/devflow/devflow/bin/lib/merge-driver-cli.cjs, plugins/devflow/devflow/bin/lib/merge-driver-cli.test.cjs, plugins/devflow/devflow/bin/df-tools.cjs, plugins/devflow/devflow/bin/lib/help.cjs</files>
  <action>
RED: tests 11-17 in `merge-driver-cli.test.cjs`, spawning `process.execPath <repo>/plugins/devflow/devflow/bin/df-tools.cjs`
with the fixture repo as cwd and the fixture env; skip the git tests when `gitAvailable()` is false. Commit
`test(59-01): merge-driver CLI and wave-merge cases`.

GREEN:
1. `lib/merge-driver-cli.cjs` — `cmdMergeDriver(cwd, args, raw)` routing:
   - `state-json <base> <ours> <theirs>`: read the three files (missing base → ''), `mergeStateJson`; ok → write `text`
     to `<ours>`, notes to stderr, exit 0 (return without output()); not ok → stderr reason, `process.exit(1)`.
   - `install [--check]`: `attrPath = path.resolve(cwd, git(['rev-parse','--git-path','info/attributes']))`; desired block:
     ```
     # >>> devflow merge drivers (df-tools merge-driver install)
     **/.planning/state.json merge=devflow-state-json
     **/.planning/STATE_ARCHIVE.md merge=union
     # <<< devflow merge drivers
     ```
     desired config: `merge.devflow-state-json.name` = `DevFlow state.json 3-way merge`,
     `merge.devflow-state-json.driver` = `node '<bin>' merge-driver state-json %O %A %B` (`git config --local`).
     `--check` → `{installed, attributes_ok, driver_ok, attributes_path, driver}`, writes nothing. Otherwise write only
     what differs → `{installed: true, changed, attributes_path, driver}`. Not a git repo → error.
   - `resolve <path>`: path relative to the repo top level; json strategy for a path whose basename is `state.json` under
     a `.planning` directory, union strategy for `STATE_ARCHIVE.md` under `.planning`; anything else → error naming the
     two. Read `git show :1:<p>` ('' when missing), `:2:`, `:3:` (missing → error `no conflicted stages for <p>`).
     json: mergeStateJson (not ok → error). union: temp files + `git merge-file -p --union <ours> <base> <theirs>`
     (exit codes 0 or positive are both fine with --union; negative/127 is an error). Write the result to the working
     file, `git add -- <p>`, output `{resolved: true, path, strategy, staged: true, notes}`.
2. `df-tools.cjs`: add the arm (four-space indent) beside `exec-context`, with the three usage comment lines, calling
   `cmdMergeDriver(cwd, args.slice(1), raw)`; add the command to the header comment block.
3. `help.cjs`: `'merge-driver'` entry — usage
   `df-tools merge-driver <install [--check]|resolve <path>|state-json <base> <ours> <theirs>> [--raw]`, summary
   `Merge .planning/state.json (JSON-aware) and STATE_ARCHIVE.md (union) without conflicts in wave merges.`,
   `mutates: true`, three detail lines (one per subcommand).
Commit `feat(59-01): df-tools merge-driver install, resolve and the state.json driver`.

Then dogfood, one plain command per call, from this repository's main checkout:
`node plugins/devflow/devflow/bin/df-tools.cjs merge-driver install`, then
`git check-attr merge -- .planning/state.json .planning/STATE_ARCHIVE.md`, then
`git config --get merge.devflow-state-json.driver`. Record all three outputs verbatim in the SUMMARY: wave 2 of this
objective merges four parallel branches through this driver. Nothing to commit for the dogfood (config and
info/attributes are not tracked).
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/merge-driver-cli.test.cjs plugins/devflow/devflow/bin/lib/state-merge.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` passes; `git check-attr merge -- .planning/state.json` in this repo prints `devflow-state-json`.</verify>
  <done>Tests 11-17 went RED then GREEN; the e2e merge (test 15) is conflict-free with install and conflicts without it; this repository has the driver installed and the three dogfood outputs are in the SUMMARY.</done>
  <recovery>If help.test.cjs fails, the arm is not indented exactly four spaces or the HELP_TABLE key differs from the case label. If the dogfood install writes to an unexpected path, run `git rev-parse --git-path info/attributes` and report it; never hand-edit `.git/config`.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/state-merge.test.cjs plugins/devflow/devflow/bin/lib/merge-driver-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs</test_scoped>
<!-- lint/build/typecheck: none in the stack profile. Known baseline npm test failures: MA-7 doctl handoff,
     roadmap-reconcile E2E1, stack-drafter-fleet github-enterprise-migration. -->
</validation_gates>

<verification>
- PLMB-02 (mechanism): test 15 shows a two-branch merge that appended to both files completing with no conflict once the
  driver is installed, and conflicting without it.
- The documented fallback (`merge-driver resolve`) resolves an already-stopped merge (test 16).
- `git diff` of df-tools.cjs shows only the new arm and header lines; help.cjs only the new entry.
</verification>

<success_criteria>
- 17 named tests pass; full `npm test` shows no failures beyond the three known baseline ones.
- `git check-attr merge -- .planning/state.json .planning/STATE_ARCHIVE.md` in this repository prints
  `devflow-state-json` and `union`.
</success_criteria>

<output>
After completion, publish `59-01-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Record the merge rules, the exact driver string installed here, and the three dogfood outputs.
</output>
