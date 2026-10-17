---
objective: 79-reconcile-and-release-3-1-0
trd: "03"
type: standard
wave: 2
depends_on: ["79-01"]
files_modified:
  - plugins/aoforge/hooks/__fixtures__/bash-corpus.js
  - plugins/aoforge/hooks/pre-bash-equivalence.test.js
  - plugins/aoforge/hooks/pre-bash.js
  - plugins/aoforge/hooks/gate-interactive.js
  - plugins/aoforge/hooks/gate-commits.js
  - plugins/aoforge/hooks/gate-bash-writes.js
  - plugins/aoforge/hooks/changelog-on-tag.js
  - plugins/aoforge/hooks/guard-no-progress.js
  - plugins/aoforge/hooks/hook-coexistence.test.js
  - plugins/aoforge/hooks/planning-writes.audit.test.js
  - plugins/aoforge/hooks/hooks.json
  - plugins/aoforge/aoforge/bin/lib/interactive-commands.cjs
  - plugins/aoforge/aoforge/bin/lib/hook-inventory.test.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/11-12-install.test.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/12-hooks-registry.cjs
  - "other plugins/aoforge/hooks/** files only when a 79-01 triage row routed to 79-03 names them"
autonomous: true
requirements: [SC-3]
must_haves:
  truths:
    - "For every case of a hand-built corpus of Bash commands (benign, mentions, commit-gate, merge-in-progress, tag gate, interactive handoff and its exemptions, Bash writes, escapes, repeated calls, combined denials, malformed input), spawning pre-bash.js once gives the same exit code, the same permission decision, the same set of reasons, the same additionalContext and the same stderr lines (after normalising project paths and handoff ids) as spawning the five dispatched hooks one by one and merging their outputs with pre-bash's own merge()"
    - "The corpus includes objective 73's rewritten gate-interactive surface (parsed simple commands, quoted text and heredoc bodies as data, a heredoc fed to a shell read one level, ssh-keygen -l/-F/-R passing, -y without -P handed off) and a five-call repeat that crosses guard-no-progress's warn (3) and ask (5) thresholds identically in both modes"
    - "A mutation (a copy of the hooks tree whose pre-bash drops gate-interactive from DISPATCHED_HOOKS) makes the equivalence test fail on the interactive cases"
    - "hooks.json registers pre-bash.js once for PreToolUse Bash, no dispatched hook directly on Bash, and guard-no-progress on a matcher that excludes exactly Bash"
    - "Every 79-01 triage row routed to 79-03 passes (hook-coexistence, planning-writes audit, hook inventory, doctor check 12, pre-bash and per-hook tests), fixed at its source"
    - "All hook tests run with a scratch HOME and AOFORGE_* variables stripped; nothing writes the real ~/.claude"
  artifacts:
    - path: plugins/aoforge/hooks/__fixtures__/bash-corpus.js
      provides: "hand-built corpus and fixture project builder"
      contains: "CORPUS"
    - path: plugins/aoforge/hooks/pre-bash-equivalence.test.js
      provides: "one-process vs per-hook chain equivalence"
      contains: "Test list"
  key_links:
    - from: "pre-bash-equivalence.test.js"
      to: "plugins/aoforge/hooks/pre-bash.js"
      via: "spawned once per case; merge() reused for the chain"
      pattern: "merge("
    - from: "pre-bash-equivalence.test.js"
      to: "plugins/aoforge/hooks/gate-interactive.js"
      via: "spawned standalone for the chain"
      pattern: "gate-interactive"
---

# TRD 79-03: Re-prove pre-bash one-process equivalence on the merged hooks, and fix the hook-domain triage

<objective>
Perf #133 (main) replaced five PreToolUse(Bash) processes with one dispatcher, `hooks/pre-bash.js`, that runs each
hook's `main()` in-process with captured stdin, stdout, stderr and `process.exit`. That was proven against main's hooks.
The merge swapped in objective 73's rewritten `gate-interactive.js` (parsed commands via `lib/interactive-commands.cjs`,
per-call reasons, handoff queueing with session and agent ids) and objective 78's single-name compat underneath every
hook. In-process dispatch can diverge from a separate process in ways a unit test of `merge()` never sees (module state
kept between calls inside one process, an `exit` inside a nested call, a lazy `require` that fails differently). This TRD
builds a hand-made corpus and proves, case by case, that the one process decides exactly what the five separate
processes decide, then fixes every hook-domain failure 79-01 routed here.

Purpose: SC-3's "pre-bash one-process equivalence corpus re-run against the merged per-hook chain".
Output: the corpus fixture, the equivalence test with its mutation proof, source fixes, a SUMMARY with the case table.
</objective>

<file_tree>
plugins/aoforge/hooks/
├── __fixtures__/bash-corpus.js        ← CREATE
├── pre-bash-equivalence.test.js       ← CREATE
└── pre-bash.js / gate-*.js            ← MODIFY only if a divergence is found
</file_tree>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/79-reconcile-and-release-3-1-0/79-01-SUMMARY.md
@plugins/aoforge/hooks/pre-bash.js
@plugins/aoforge/hooks/pre-bash.test.js

Run tests from your CHECKOUT with `HOME=<mktemp -d>`; strip every `AOFORGE_*` variable from the child env (the
session that runs you may carry escapes such as AOFORGE_SKIP_EDIT_GATE) and set `AOFORGE_PROGRESS_GUARD_DIR` to a
per-mode scratch dir. Never port 8080 (nothing here binds a port).

Hook facts (merged tree; confirm by reading each file's header):
- pre-bash.js: `DISPATCHED_HOOKS = ['gate-commits.js','changelog-on-tag.js','gate-interactive.js','gate-bash-writes.js','guard-no-progress.js']`;
  exports `merge`, `runHook`; merge rule: exit 2 from any hook wins (that hook's stderr), then deny > ask with every
  reason of the winning decision kept, additionalContext and stderr passed through, a throwing hook skipped and named.
- Each dispatched hook reads stdin via `fs.readFileSync(0)`, runs `main()` only under `require.main === module`, exports
  `main`, carries `// DISPATCHED-BY: pre-bash.js`.
- gate-commits: denies a raw `git commit` in an AOForge project; allows when MERGE_HEAD / rebase-merge / rebase-apply /
  CHERRY_PICK_HEAD exists in the target repo's git dir, and for an inline `AOFORGE_ALLOW_RAW_COMMIT=1 git commit`;
  a `git merge X && git commit` chain stays denied with the chain message; heredoc bodies and quoted args are data.
- changelog-on-tag: blocks `git tag -a vX.Y.Z` when CHANGELOG.md lacks `## [X.Y.Z]`.
- gate-interactive (objective 73): denies TTY commands and queues a pending record (session_id, agent_id); with no live
  watcher the reason asks the user to run `! cmd`; matcher in `lib/interactive-commands.cjs` (fail-open load).
- gate-bash-writes: ambient-mode Bash write to a tracked file -> `ask` by default (`warn`), `deny` under strict; never
  for `.aoforge/`, `*.md`, untracked files, paths outside the project; a live skill marker or an override phrase exempts.
- guard-no-progress: identical tool+args repeated: stderr warning at 3, `ask` at 5, reset when the call changes; state per
  session under AOFORGE_PROGRESS_GUARD_DIR.
</context>

<embedded_context>

<codebase_examples>
pre-bash.test.js already spawns the dispatcher this way (reuse the shape):
```js
const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), cwd: project, env, encoding: 'utf8' });
// r.status, r.stdout (hookSpecificOutput JSON or text), r.stderr
```
Payload shape Claude Code sends: `{ session_id, transcript_path, cwd, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }`.
The chain side: spawn each of the five hooks with the same payload, collect `{file, stdout, stderr, code: status, error: null}`,
then `require('./pre-bash.js').merge(results)` gives what Claude Code would make of five parallel hooks.
Fixture style to follow: `hooks/__fixtures__/claude-matcher.js` (plain CommonJS, no dependencies, exported helpers).
</codebase_examples>

<anti_patterns>
- Calling `runHook` in-process for the "one process" side. Spawn pre-bash.js as Claude Code does; in-process calls in
  the test runner share module state across cases and hide exactly the divergence this test exists to find.
- Sharing one fixture project or one progress-guard dir between the two modes (handoff queue files and repeat counters
  would cross-talk). One project copy and one guard dir per mode per case.
- Comparing raw strings with absolute paths or handoff ids in them: normalise (project root -> `<P>`, home -> `<H>`,
  handoff id pattern -> `<ID>`), and say in the test what is normalised.
- Generated or random commands. Every corpus entry is hand-written with a one-line `why`.
- Fixing a divergence by changing the comparison. A real divergence is a defect in the dispatcher or a hook: fix it there
  (RED: the failing case; GREEN: the fix), or, if it is inherent and harmless, record it as a named, reasoned exception
  in the test (a decision in the SUMMARY).
</anti_patterns>

<error_recovery>
- A hook that throws in-process but not standalone (or the reverse): the dispatcher's fail-open would turn a deny into a
  silent pass. That is a blocker-class finding: fix the hook so it behaves the same both ways (usually a top-level side
  effect, a cached value keyed on process state, or `process.exitCode` instead of `process.exit`).
- gate-interactive writes its pending record somewhere outside the fixture project (e.g. under HOME): make sure HOME is
  the per-mode scratch home so nothing reaches `~/.claude`.
- Spawn timing makes the suite slow: keep the corpus near 35-45 cases; the five-call repeat counts as one case.
</error_recovery>

</embedded_context>

## Test list

pre-bash-equivalence.test.js, outermost first:

1. registration: hooks.json registers pre-bash.js once for PreToolUse `Bash`; none of the five dispatched hooks is
   registered directly on a matcher that fires for Bash; guard-no-progress's matcher fires on every tool but Bash
   (reuse `__fixtures__/claude-matcher.js`)
2. equivalence, one `test` per corpus entry: dispatcher vs chain give equal `{exit, decision, reasons (set), context, stderr lines}`
3. equivalence over a sequence: the same command five times in one session, compared step by step (warn on 3, ask on 5)
4. sanity anchors (so equivalence is not two equally broken sides): raw `git commit` in the fixture project is `deny`;
   `ls -la` is silent with exit 0; `ssh host` is `deny` with a `! ssh host` hint; `git tag -a v9.9.9 -m x` without the
   CHANGELOG section is blocked
5. mutation: against a scratch copy of the hooks tree whose pre-bash drops gate-interactive, the interactive cases
   diverge and the comparison reports them by id

Corpus (bash-corpus.js `CORPUS`, each `{id, why, command, setup?, env?}`), at least:
- benign: `ls -la`; `rg -n foo src`; `node --test x.test.cjs`; `echo "git commit -m x"` (quoted mention); a heredoc
  body mentioning `git commit` fed to `cat`
- commits: `git commit -m x`; `git -C <P> commit -m x`; inline `AOFORGE_ALLOW_RAW_COMMIT=1 git commit -m x`;
  `git commit --no-edit` with MERGE_HEAD present; `git merge side && git commit --no-edit`; `git commit` in a non-AOForge dir
- tags: `git tag -a v9.9.9 -m x` (section absent); `git tag -a v9.9.8 -m x` (section present); `git tag v9.9.9` (lightweight)
- interactive: `ssh host`; `ssh-keygen -l -f key.pub`; `ssh-keygen -F host`; `ssh-keygen -y -f key`; `vim a.txt`;
  `"ssh" host` (quoted name); `bash -c 'ssh host'` (string body); `bash <<'EOF'` + `ssh host` + `EOF` (heredoc to a shell);
  `cat <<'EOF'` + `ssh host` + `EOF` (data); `env FOO=1 ssh host`
- writes: `sed -i '' 's/a/b/' src/a.cjs` (tracked); `echo x > src/a.cjs`; `echo x > notes.txt` (untracked);
  `echo x > .aoforge/x.md`; the tracked write with a live skill marker; the tracked write with `gates.bashEditGate: strict`
- escapes: `ssh host` with AOFORGE_SKIP_INTERACTIVE_GATE=1 in the env
- combined: `git commit -m x && ssh host` (two denials, both reasons kept); `echo x > src/a.cjs && ssh host` (ask + deny)
- input edge: empty stdin; non-JSON stdin; `tool_name: "Read"` payload

<tasks>

<task type="auto">
  <name>Task 1: Fixture builder and hand-built corpus</name>
  <files>plugins/aoforge/hooks/__fixtures__/bash-corpus.js</files>
  <action>
Create `bash-corpus.js` (CommonJS, sync fs, no dependencies) exporting:
- `makeProject({ merging, marker, bashEditGate, aoforge = true })` -> `{ root, home, guardDir, env }`: a `mktemp -d`
  git repo (`git init -b main`, `-c commit.gpgsign=false`, `GIT_CONFIG_GLOBAL=/dev/null`, author env set) with
  `.aoforge/config.json` (local mode; `gates.bashEditGate` when given), a tracked `src/a.cjs`, a tracked
  `CHANGELOG.md` holding `## [9.9.8] - 2026-01-01`, one initial commit, a branch `side`; `merging: true` writes
  `.git/MERGE_HEAD` with the HEAD sha; `marker: true` writes a live `.aoforge/.skill-active` (expires_at in 8h, the
  shape gate-bash-writes reads); `aoforge: false` omits `.aoforge/`. `env` = process.env minus every `AOFORGE_*`, with
  HOME=home, AOFORGE_PROGRESS_GUARD_DIR=guardDir.
- `payload(project, command, session = 'corpus')` -> the PreToolUse Bash JSON.
- `CORPUS` (the Test list's entries, each with a one-line `why`) and `normalize(text, project)`.
- `cleanup(project)`.
Read gate-bash-writes.js and gate-commits.js for the exact marker and config shapes before writing them; record the
shapes in the file header.
Commit: `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "test(79-03): hand-built Bash corpus and fixture project" --files plugins/aoforge/hooks/__fixtures__/bash-corpus.js`.
  </action>
  <verify>`node -e "const c=require('./plugins/aoforge/hooks/__fixtures__/bash-corpus.js'); const p=c.makeProject({}); console.log(c.CORPUS.length, require('fs').existsSync(p.root+'/.aoforge/config.json')); c.cleanup(p)"` prints a count >= 35 and `true`</verify>
  <done>The fixture builds isolated projects and the corpus covers every category in the Test list.</done>
  <recovery>If a gate's expected shape differs from the context above, follow the code, not this TRD, and note the difference in the header.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Equivalence test, mutation proof, and fixes for any divergence</name>
  <files>plugins/aoforge/hooks/pre-bash-equivalence.test.js, plugins/aoforge/hooks/pre-bash.js and the dispatched hooks only if a divergence is found</files>
  <action>
Write the test (Test list 1-5). For each case: two fresh projects (dispatcher, chain); run `setup` on both; dispatcher
side spawns `node hooks/pre-bash.js` once; chain side spawns the five hooks in DISPATCHED_HOOKS order and merges with
`require('./pre-bash.js').merge`; compare the normalised `{exit, decision, reasons:set, context, stderr:lines}`. Parse
stdout JSON when it parses, else treat it as text. Mutation (case 5): copy `plugins/aoforge/hooks` and
`plugins/aoforge/aoforge/bin` into a scratch dir keeping the relative layout, remove `'gate-interactive.js'` from the
copy's DISPATCHED_HOOKS, run the interactive cases with the copy's dispatcher against the real chain, assert they diverge.

TDD: run the test before touching any hook. Every failing equivalence case is the RED evidence of a real divergence:
record it (case id, both results), commit the test (`test(79-03): RED ...` when a case fails, else `test(79-03):
pre-bash equivalence corpus`), fix the cause in the dispatcher or the hook (GREEN, `fix(79-03): ...`), re-run the
whole file and `node --test plugins/aoforge/hooks/pre-bash.test.js 'plugins/aoforge/hooks/gate-*.test.js' plugins/aoforge/hooks/guard-no-progress.test.js`.
If every case passes on first run, say so plainly in the SUMMARY; the mutation proof is then the evidence the test bites.
  </action>
  <verify>`env HOME=$(mktemp -d) node --test plugins/aoforge/hooks/pre-bash-equivalence.test.js` passes every case and the mutation case; `env HOME=$(mktemp -d) node --test plugins/aoforge/hooks/pre-bash.test.js` passes</verify>
  <done>The SUMMARY has a table: case id, category, decision (both modes), equal yes/no, fix commit if any; the mutation result is recorded.</done>
  <recovery>A divergence you cannot fix within this TRD (a design limit of in-process dispatch): stop, keep the failing case, return it as a blocker with both outputs; do not mark it expected without the user.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Hook-domain triage rows and registration checks</name>
  <files>plugins/aoforge/hooks/hook-coexistence.test.js, plugins/aoforge/hooks/planning-writes.audit.test.js, plugins/aoforge/hooks/hooks.json, plugins/aoforge/aoforge/bin/lib/hook-inventory.test.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/11-12-install.test.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/12-hooks-registry.cjs, files named by 79-03 triage rows</files>
  <action>
For each 79-01 triage row routed to 79-03: re-run it alone (scratch HOME) as RED evidence, find the cause (expected:
objective 73's new hooks (inject-handoff-results on PostToolUse `*` and Stop, route-results, the Stop timeout) meeting
main's coexistence matrix and inventory that were written before them; 78's single-name agent namespace in hook
tests; the planning-writes audit's allowlist), fix at the source, re-run (GREEN). Then run the whole hook domain once:
`node --test 'plugins/aoforge/hooks/*.test.js' plugins/aoforge/aoforge/bin/lib/hook-inventory.test.cjs plugins/aoforge/aoforge/bin/lib/doctor-checks/11-12-install.test.cjs`
(scratch HOME). Commit per cause with `aof-tools commit`.
  </action>
  <verify>`env HOME=$(mktemp -d) node --test 'plugins/aoforge/hooks/*.test.js' plugins/aoforge/aoforge/bin/lib/hook-inventory.test.cjs plugins/aoforge/aoforge/bin/lib/doctor-checks/11-12-install.test.cjs` exits 0</verify>
  <done>Every hook-domain row is green with its cause in the SUMMARY; hooks.json has no duplicate registration.</done>
  <recovery>A row whose fix lies outside the 79-03 file list: re-route it in the SUMMARY (79-02 for lib code) and leave it.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test (scoped while iterating: node --test plugins/aoforge/hooks/pre-bash-equivalence.test.js plugins/aoforge/hooks/pre-bash.test.js 'plugins/aoforge/hooks/*.test.js')</test>
</validation_gates>

<verification>
- Equivalence holds for every corpus case and the five-call sequence; the mutation proof diverges.
- Hook domain green; registrations unique.
</verification>

<success_criteria>
- The one-process Bash dispatcher is proven to decide exactly what the five separate hooks decide on the merged tree,
  including objective 73's gate-interactive.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/79-reconcile-and-release-3-1-0/79-03-SUMMARY.md` through
`node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post`.
</output>
