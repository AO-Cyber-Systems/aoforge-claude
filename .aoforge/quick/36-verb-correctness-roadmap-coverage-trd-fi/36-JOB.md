---
objective: quick-36
trd: 01
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/aoforge/aoforge/bin/lib/roadmap-coverage.cjs
  - plugins/aoforge/aoforge/bin/lib/requirement-ids.cjs
  - plugins/aoforge/aoforge/bin/lib/requirement-ids.test.cjs
  - plugins/aoforge/aoforge/bin/lib/objective-evidence.cjs
  - plugins/aoforge/aoforge/bin/lib/verify.cjs
  - plugins/aoforge/aoforge/bin/lib/mechanical-verbs.test.cjs
  - plugins/aoforge/aoforge/bin/lib/trd-finalize.cjs
  - plugins/aoforge/aoforge/bin/lib/state.cjs
  - plugins/aoforge/aoforge/bin/lib/state.test.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-mode.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-verbs.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-entity-verbs.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-drafts.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-verbs-cli.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.test.cjs
  - docs/USER-GUIDE.md
  - CLAUDE.md
  - CHANGELOG.md
autonomous: true
must_haves:
  truths:
    - "`validate roadmap-coverage` reads ROADMAP ids only through requirement-ids.cjs `roadmapRequirementIds`. `- **Requirements**: API-01` and a `**Requirements**:` label followed by bullet lines both map their ids. `**Requirements**: none (tech debt; AUTH-03 deferred)` maps nothing, so a v1 AUTH-03 is an orphan (exit 1). At 563d2388 the first two are false orphans and the third hides the orphan"
    - "A `**Requirements**` line under a heading at the objective's level or higher (for example `## Progress` after the last objective) is credited to no objective. `## Integrations (OAuth v2)` is a v1 section. A REQUIREMENTS.md with no v1 definitions exits 1 with a reason and never prints `0/0 ✓`. A REQUIREMENTS.md that defines `AUTH-01a` still maps it"
    - "`verify objective-evidence` and `verify objective-completeness` treat a SUMMARY for which misc.cjs `isCheckpointOnlySummary` is true as not done. For 2 TRDs, one final SUMMARY and one checkpoint, evidence reports `summaries: 1`, `checkpoints: [<id>]` and `completeness.complete: false`. The raw text names the checkpoint and every SUMMARY with `self_check: null`, and both verbs' raw output ends in a newline"
    - "Running `trd finalize 01-01` twice leaves each decision line and the `Objective 01 P01` metrics row in STATE_ARCHIVE.md exactly once, and the second run exits 0. `state record-metric` replaces the row for the same objective and job. An identical `state add-decision` is a no-op that exits 0"
    - "`trd finalize` passes `Cookie sessions: simpler than JWT here` as `--summary 'Cookie sessions' --rationale 'simpler than JWT here'`, and passes `Use https://example.com docs` whole. `--duration=99min` reaches record-metric. `--duration --dry-run` and a trailing `--duration` exit 1 and run nothing. A checkpoint SUMMARY is refused with exit 1. `01-1` and `1-1` resolve to 01-01"
    - "In local mode a planning verb run from a linked worktree that has its own planning directory reads and writes that worktree. This covers quick put, quick summary, summary checkpoint (for an objective only the worktree has), doc put and planning draft. Nothing lands in the main checkout, and the printed `wrote <dir>/<rel>` names the directory actually written. The reverse layout behaves the same way"
    - "Unchanged: store mode still reads and writes the MAIN checkout (D-14). A worktree with no planning directory still falls back to main. The draft directory key stays the main repo key"
    - "`npm test` has 0 failures, compared with a baseline taken at 563d2388 before any change. Nothing is pushed, tagged or released, and nothing is written under ~/.claude or /Users/justin/dev/aoforge-claude"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/planning-mode.cjs
      provides: "resolveVerbRoot(cwd): MAIN in store mode; in local mode the checkout holding cwd when it has a planning dir, else MAIN; null when there is none"
      exports: ["resolveVerbRoot"]
    - path: plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.test.cjs
      provides: "real-git CLI tests: quick put, quick summary, summary checkpoint, doc put and planning draft from a linked worktree, in both directory layouts, plus the fallback and store guards"
    - path: plugins/aoforge/aoforge/bin/lib/roadmap-coverage.cjs
      provides: "roadmapMapping built on roadmapRequirementIds over level-bounded objective sections; heading-start v1 scope rule; empty-requirements failure"
    - path: plugins/aoforge/aoforge/bin/lib/trd-finalize.cjs
      provides: "splitDecision(text) -> {summary, rationale?}; padded TRD ids; checkpoint refusal; strict --duration parsing"
      exports: ["parseTrdId", "plan", "run", "cmdTrdFinalize", "splitDecision"]
  key_links:
    - from: "roadmap-coverage.cjs roadmapMapping"
      to: "requirement-ids.cjs roadmapRequirementIds"
      via: "one call per objective section, with { objective }, the same call verify trd-pre and objective complete make"
    - from: "objective-evidence.cjs evidence + verify.cjs cmdVerifyObjectiveCompleteness"
      to: "misc.cjs isCheckpointOnlySummary"
      via: "a checkpoint-only SUMMARY is not a final SUMMARY"
    - from: "trd-finalize.cjs add-decision / record-metric steps"
      to: "state.cjs cmdStateAddDecision (--rationale, duplicate no-op) / cmdStateRecordMetric (upsert)"
      via: "spawned aof-tools subprocesses; a re-run is a safe retry"
    - from: "planning-verbs.cjs mainRoot, planning-entity-verbs.cjs contextOf, planning-drafts.cjs liveFileFor, planning-verbs-cli.cjs reseed message"
      to: "planning-mode.cjs resolveVerbRoot"
      via: "one resolver decides the read/write root for every planning verb"
---

# Quick 36: verb correctness (roadmap-coverage, trd finalize, objective-evidence, planning verbs in a worktree)

## Objective

Four verified defects in the worktree
`/private/tmp/claude-501/-Users-justin-dev-aoforge-claude/29d3d902-73eb-439c-9c64-ba469a668a6e/scratchpad/main-wt`
(branch `fix/post-77-verification`, HEAD 563d2388). This root is `<repo>` below. Work only there. Its planning tree
is the legacy planning directory. Run aof-tools as `node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <repo> ...`.
**Never write under `/Users/justin/dev/aoforge-claude`.** That is the main checkout, with its own `.aoforge/`. Until
Task 3 is GREEN, do not run `quick put`, `quick summary`, `summary checkpoint` or `doc put` against `<repo>`:
defect 4 sends those writes to the main checkout.

1. **roadmap-coverage disagrees with the shared parser.** `roadmap-coverage.cjs:21,49-51` keeps its own label regex
   and ID regex, so it disagrees with `requirement-ids.cjs:132` `roadmapRequirementIds` (used by `verify trd-pre` and
   `objective complete`). `- **Requirements**: API-01` gives no ids, so API-01 is a false orphan (exit 1). A
   bullet-block label gives no ids. `none (tech debt; AUTH-03 deferred)` counts AUTH-03 as mapped and hides a real
   orphan. Lower: `NON_V1_SECTION` (`:18`) matches `v2` anywhere, so it drops `## Integrations (OAuth v2)`. A
   Requirements line under a later `## Progress` is credited to the last objective. An empty REQUIREMENTS.md passes
   as `0/0 ✓`.
2. **trd finalize is not a safe retry.** A re-run duplicates every decision and the metrics row in STATE_ARCHIVE.md.
   Decisions are cut at the first colon (`:62-65`), so "Cookie sessions: simpler than JWT here" becomes
   "Cookie sessions" and "Use https://example.com docs" becomes "Use https". `--duration=99min` passes the flag guard
   but `:115` `indexOf` ignores it, and `--duration --dry-run` takes `--dry-run` as the value. A checkpoint SUMMARY is
   accepted, and `trd finalize 01-1` fails with "no TRD for 01-1".
3. **objective-evidence counts a checkpoint as done.** `objective-evidence.cjs:50-62,81` counts a mid-run SUMMARY
   (`## Progress`, an unticked task, no `## Self-Check`) and reports "2/2 TRDs have a SUMMARY". The
   `completeness.complete: true` it shows comes from `verify objective-completeness` (`verify.cjs:173-224`), which has
   the same blind spot. Raw output has no trailing newline here or on roadmap-coverage success.
4. **Planning verbs ignore the worktree.** `planning-verbs.cjs:112` `mainRoot` and `planning-entity-verbs.cjs:94`
   `contextOf` call `planning-mode.resolveMainRoot`. That resolver prefers the main checkout whenever it has a planning
   dir (`planning-mode.cjs:157-170`). So `quick put 34 <slug>` from `<repo>` wrote the main checkout's
   `.aoforge/quick/34-.../34-JOB.md` and printed `wrote .aoforge/quick/...`. Only `summary post|checkpoint` already use
   `resolveCheckoutRoot` (TRD 53-01, `planning-verbs.cjs:610`), and even they resolve the TRD target from main
   (`trdTarget(main, ...)`).

Intent: kind `plugin`, work `bugfix` (verified defects; a quick task has no OBJECTIVE.md, and PROJECT.md
default_work is `feature`). tdd strict with a regression test per bug, test_list_first required, fixture_strategy
inline, outside_in (CLI spawn tests before unit tests). Constraints: `no_llm_test_data` (hand-built fixtures only),
`no_property_based_default`, `no_gherkin_layer`. Test first in every task: commit RED, then GREEN.

## Locked decisions

- **D1 roadmap-coverage uses the shared parser.**
  - ROADMAP side. Walk the lines. A heading `^(#{2,4})\s+Objective\s+(\d+(?:\.\d+)?)\b` opens a section at level L
    (the number of `#`). The next heading with level <= L closes it. Deeper headings (`####` under `###`) stay inside.
    Text after a closed section belongs to no objective. Each section's ids come from
    `roadmapRequirementIds(sectionText, { objective: <num> })`. Remove `ID_RE` and `REQUIREMENTS_LINE`, and make no
    roadmap-side id regex in this module.
  - REQUIREMENTS side. A definition is still `- [ ] **ID**` or `- [x] **ID**`. Build the ID part of `DEFINITION_RE`
    from a source string that requirement-ids.cjs exports (`REQUIREMENT_ID_SRC`), so both sides accept the same
    shapes. The hyphenated branch of that source gains an optional single lowercase suffix:
    `[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+[a-z]?|[A-Z]{1,8}\d+`. Without it, `AUTH-01a`, which the old regex accepted, would
    become a false orphan. `verify trd-pre` and `objective complete` also pick up the suffix, which is intended.
  - v1 scope: a `## ` section is out of v1 only when its heading text, trimmed, **starts with** `v<N>` for N >= 2
    (`v2`, `v3`, `v10`), `out of scope`, `traceability`, `future`, `deferred` or `later` (case-insensitive, at a word
    boundary). Everything else is v1. Example: `/^(?:v(?:[2-9]|[1-9]\d+)\b|out of scope\b|traceability\b|future\b|deferred\b|later\b)/i`.
  - No v1 definitions: `{ ok: false, v1_total: 0, reason: 'no v1 requirements found in REQUIREMENTS.md', ... }`,
    exit 1. The raw line says so. Success raw output ends with `\n`. The failure path already does.
- **D2 checkpoint SUMMARYs are not done.** The single test is misc.cjs `isCheckpointOnlySummary(text)`, exported at
  `misc.cjs:1010`. Do not write a second regex.
  - objective-evidence: `summary.checkpoint: boolean` on every existing SUMMARY. In the rollup, `summaries` counts
    final SUMMARYs only, `checkpoints` is the ids of checkpoint SUMMARYs, and `no_self_check` is the ids of every
    existing SUMMARY whose `self_check` is null (checkpoints included). The raw headline is
    `Objective <n>: <k>/<t> TRDs have a final SUMMARY`. Lines `checkpoints: ...` and `no_self_check: ...` follow it
    when they are non-empty, joining the existing key lines. Raw ends with `\n`.
  - verify objective-completeness: a plan key is complete when at least one of its SUMMARY files is not
    checkpoint-only. An unreadable SUMMARY counts as complete, as `_summaryIsComplete` treats it. `incomplete_jobs`
    lists every plan without a final SUMMARY. Add `checkpoint_summaries`: plans whose SUMMARYs are all checkpoints. A
    separate error reads `Plans with only a checkpoint SUMMARY: <ids>`. `summary_count` stays the file count.
- **D3 trd finalize is a safe retry.**
  - Idempotence lives in the verbs, so a hand-run retry is safe too. `state record-metric` replaces the row whose
    first cell is `Objective {objective} P{job}` and does not append a second one. In store mode it also replaces the
    `metrics_log` entry with the same objective and job. `state add-decision` checks the Decisions section first: if
    it already holds the exact entry line, nothing is written (neither the archive nor state.json) and the verb
    outputs `{ added: false, duplicate: true, decision }` with raw `false` and exit 0. A different rationale is a
    different line and is added.
  - Decision split: `/^(.+?):\s+(\S[\s\S]*)$/`. The colon must be followed by whitespace. The part before it becomes
    `--summary` and the part after it `--rationale`, both trimmed. No match: the whole text is `--summary`, with no
    `--rationale`. Export it as `splitDecision`.
  - `--duration v` and `--duration=v` are accepted. A missing value, an empty value, or one starting with `-` is a
    usage error (`trd finalize: --duration needs a value (e.g. --duration 12min)`, exit 1). It is checked before
    `plan()`, so nothing runs, not even a dry run.
  - Refuse a checkpoint SUMMARY in `plan()`: `SUMMARY for <id> is a mid-run checkpoint (## Progress, no
    ## Self-Check): finish the TRD and post the final SUMMARY with \`summary post\` first`. Exit 1, dry run included.
  - The TRD number is zero-padded to at least 2 digits, like the objective number: `01-1`, `1-1`, `1-01` → key
    `01-01`, and `--job 01` in record-metric. `01-100` stays `01-100`.
- **D4 one root resolver for planning verbs.** Add `resolveVerbRoot(cwd)` to planning-mode.cjs and export it:
  ```js
  function resolveVerbRoot(cwd) {
    const main = resolveMainRoot(cwd);
    if (!main) return null;
    if (planningMode(main).mode !== LOCAL) return main;   // D-14: cache, ledger, journal, outbox live in main
    return resolveCheckoutRoot(cwd) || main;               // 53-01 generalised: the checkout that will commit it
  }
  ```
  - planning-verbs.cjs `mainRoot(root)` returns `planningMode.resolveVerbRoot(root)`. Every verb in that module now
    resolves targets and writes under the running checkout in local mode: plan put-trd/push, objective put/set-status,
    summary post/checkpoint (trdTarget included), verification post, doc put and summaryDraftTarget. `summaryWriteRoot`
    stays and gives the same answer. Store mode is unchanged because the resolver returns main there.
  - planning-entity-verbs.cjs `contextOf(root)` sets `main = planningMode.resolveVerbRoot(root)`. This covers todo,
    debug, quick, decision and milestone.
  - planning-drafts.cjs: `liveFileFor` and the stale-draft message resolve through `resolveVerbRoot(root)`, falling
    back to `path.resolve(root)`. `draftFileFor` keeps `repoKey(resolveMainRoot)`, so draft paths already handed out
    (including this JOB's) stay valid.
  - planning-verbs-cli.cjs:547, the reseed message, uses `resolveVerbRoot(cwd) || cwd`.
  - Out of scope: `todo-sync.cjs` passes the main root to the entity verbs explicitly (its plan reads main's archive),
    so it stays on main. Store-only callers (objective.cjs store paths, gh-*, tokens, estimate) are also untouched.
    Say so in the SUMMARY.
  - Update the comments that state the old rule: the planning-verbs.cjs header (D-01 "same path under the MAIN
    checkout's", the D-14 paragraph and the 53-01 "ONE exception" paragraph) and the contextOf doc comment.
  - Docs: `docs/USER-GUIDE.md` (around line 1351, "`summary checkpoint` and `summary post` write the checkout that
    runs them in local mode") now says every planning verb does this, falling back to main when the checkout has no
    planning directory. `CLAUDE.md` line 64 (Planning verbs) gets one clause with the same meaning.
- **D5 CHANGELOG.** Add `### Fixes (quick 36)` under `## [3.1.0] - Unreleased`, directly after the quick 35 fixes
  list, with one bullet per defect. Each task adds its own bullet in its GREEN commit. In prose (CHANGELOG, USER-GUIDE,
  CLAUDE.md, code comments) write "the legacy planning directory", never its literal name. See gotchas: rename guard.

## Test list

Outermost first. Fixtures are hand-built: `project()`/`run()` in mechanical-verbs.test.cjs,
`__fixtures__/state-position-fixtures.cjs` (`narrativeState`, `positionProject`),
`__fixtures__/upgrade-fixtures.cjs` (`makeFakeHome`, `initGitFixture`, `gitEnv`), and `mainCheckout()`/
`linkedWorktree()` in planning-mode.test.cjs.

**Task 1: mechanical-verbs.test.cjs, `validate roadmap-coverage`**
1. `- **Requirements**: API-01` (a bulleted label line) maps API-01: exit 0, full coverage.
2. `**Requirements**:` followed by `- AUTH-01` and `- AUTH-02` lines maps both.
3. `**Requirements**: none (tech debt; AUTH-03 deferred)`, with AUTH-03 a v1 id mapped nowhere else: exit 1,
   `orphans` includes AUTH-03.
4. `## Progress` after the last objective holds `**Requirements**: DATA-01`: DATA-01 is an orphan, and the last
   objective is not credited with it.
5. A `#### Notes` heading inside an objective, with the Requirements line below it, still maps (deeper headings stay
   inside).
6. `## Integrations (OAuth v2)` with an unmapped `INT-01`: INT-01 is an orphan. Ids under `## v2 Requirements`,
   `## Out of Scope`, `## Traceability`, `## Future Requirements` and `## Deferred` stay out of v1.
7. REQUIREMENTS.md with no v1 definitions (headings only): exit 1, `reason` set, raw output never contains `0/0 ✓`.
8. `AUTH-01a` defined and mapped: covered.
9. Raw success output ends with `\n`.
10. The existing four roadmap-coverage tests stay green unchanged, including the `<!-- -->` and `**Requirements:**`
    cases.

**Task 1: requirement-ids.test.cjs**
11. `extractRequirementIds('AUTH-01a, AUTH-02')` → `['AUTH-01a', 'AUTH-02']`. `REQUIREMENT_ID_SRC` is exported. The
    existing 30 tests stay green.

**Task 1: mechanical-verbs.test.cjs, `verify objective-evidence` / `objective-completeness`**
12. 01-01 has a final SUMMARY and 01-02 a checkpoint SUMMARY (`## Progress` with `- [x] Task 1` and `- [ ] Task 2`,
    no `## Self-Check`). Expect `rollup.summaries` 1, `rollup.checkpoints` `['01-02']`,
    `trds[1].summary.checkpoint` true, `completeness.complete` false, and `completeness.checkpoint_summaries`
    naming 01-02.
13. Raw output on the same fixture: a `1/2 TRDs have a final SUMMARY` headline, a line starting `checkpoints:` that
    names 01-02, and a line starting `no_self_check:` that names 01-02. It ends with `\n`.
14. `verify objective-completeness 1` on the same fixture: `complete: false`, `incomplete_jobs` covers 01-02, and an
    error names the checkpoint.
15. The existing objective-evidence tests stay green unchanged.

**Task 2: mechanical-verbs.test.cjs, `trd finalize`**
16. A real run (no `--dry-run`) twice, on a fixture where all eight steps pass (STATE.md from `narrativeState`,
    ROADMAP.md, REQUIREMENTS.md defining AUTH-01/02, TRD, final SUMMARY). Both runs exit 0. STATE_ARCHIVE.md holds each
    decision line exactly once and exactly one `| Objective 01 P01 |` row.
17. `--dry-run`: the first add-decision argv ends `--summary`, `Cookie sessions`, `--rationale`,
    `simpler than JWT here`. A SUMMARY whose decision is `Use https://example.com docs` gives
    `--summary`, `Use https://example.com docs` and no `--rationale`. Update the existing assertion that expects
    `Cookie sessions` last.
18. `--duration=99min --dry-run`: the record-metric argv carries `99min`.
19. `--duration --dry-run` exits 1, stderr names `--duration`, and STATE.md and STATE_ARCHIVE.md are byte-identical.
    A trailing `--duration` also exits 1.
20. A checkpoint SUMMARY exits 1, with and without `--dry-run`. stderr names `checkpoint` and `summary post`. No
    planning file changes.
21. `trd finalize 01-1 --dry-run` and `trd finalize 1-1 --dry-run` report id `01-01`, and the record-metric argv
    has `--job 01`.

**Task 2: state.test.cjs**
22. `state record-metric` twice for the same objective and job with durations `5min` then `7min`: one row, carrying
    `7min`, locally. In store mode, one `metrics_log` entry with `7min`.
23. `state add-decision --summary x --rationale y` twice: one archive line and one state.json entry. The second call
    exits 0 with `added: false, duplicate: true`. The same summary with rationale `z` adds a second line.
24. The pinned tests (2d, 3, 6d, 7) stay green unchanged.

**Task 3: planning-verbs-worktree.test.cjs (new, real git, `skip` when git is absent, fake HOME, TMPDIR set to a
fixture dir)**
25. Main has `.aoforge/` tracked. The worktree branch renames its tree to the legacy planning dir and commits it.
    `quick put 34 demo --from -` run from the worktree writes `<wt>/<legacy>/quick/34-demo/34-JOB.md`. `<main>/.aoforge/quick`
    does not exist. Prose output contains `wrote <legacy>/quick/34-demo/34-JOB.md`, and the `--raw` JSON `path` is
    under `<wt>`.
26. Same fixture: `quick summary 34 --from -` writes `<wt>/<legacy>/quick/34-demo/34-SUMMARY.md`.
27. Same fixture, where objective `08-wt-only` (a TRD `08-01-x-TRD.md`) exists only in the worktree:
    `summary checkpoint 08-01 --from -` exits 0 and writes the worktree's SUMMARY (RED today: TRD not found in main).
28. Same fixture: `doc put PROJECT.md --from -` writes `<wt>/<legacy>/PROJECT.md`, and main's `PROJECT.md` is
    unchanged or absent.
29. Same fixture: after (25), `planning draft quick/34-demo/34-JOB.md` seeds the draft with the worktree's text.
30. Reverse layout: main tracks the legacy dir and the worktree renames it to `.aoforge/`. `quick put` writes
    `<wt>/.aoforge/quick/...` and nothing in main.
31. Guard: the planning dir is gitignored, so the worktree has none. `quick put` falls back to main, as
    summary-worktree g2 does.

**Task 3: planning-mode.test.cjs (unit, no git spawn)**
32. `resolveVerbRoot`: local mode with the worktree's own planning dir → the worktree. Local mode without one → main.
    Store config in main → main, even when the worktree has a planning dir. A non-git dir with `.aoforge/` → that
    dir. No planning dir anywhere → null.
33. summary-worktree (6), planning-verbs test 15 (store D-14), planning-entity-verbs, planning-drafts(-cli),
    planning-verbs-cli and todo-sync stay green unchanged.

<embedded_context>
<codebase_examples>
The shared parser and how callers slice a section (`trd-pre-check.cjs:140-155`). It reads only the FIRST label in
the section text. With an empty label value it reads the bullet lines directly below:
```js
const nextHeaderMatch = afterHeader.match(/^#{2,4}\s+/m);
const section = nextHeaderMatch ? rest.slice(0, firstNewline + 1 + nextHeaderMatch.index) : rest;
return roadmapRequirementIds(section, { objective: objectiveNum });
```
Probed at 563d2388: `- **Requirements**: API-01` → `['API-01']`; label plus bullets → both ids;
`none (tech debt; AUTH-03 deferred)` → `[]`; `AUTH-01a` → `[]` (hence the suffix decision in D1).

The checkpoint test (`misc.cjs:209`, exported as `isCheckpointOnlySummary`). `estimate-rollup.cjs:33,161` imports it:
```js
const { isCheckpointOnlySummary } = require('./misc.cjs');
complete = !isCheckpointOnlySummary(fs.readFileSync(path.join(dir, summary), 'utf-8'));
```

The `--flag v` / `--flag=v` rule (`planning-verbs-cli.cjs:61-68`, not exported; copy it locally in trd-finalize.cjs):
```js
function flagValue(args, flag) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) return i + 1 < args.length ? args[i + 1] : '';
    if (args[i].startsWith(`${flag}=`)) return args[i].slice(flag.length + 1);
  }
  return undefined;
}
```
The flag guard (`flag-spec.cjs:188`, `finalize: { values: ['--duration'], bools: ['--dry-run'] }`) consumes the
token after `--duration` even when it looks like a flag. That is why the verb must reject a value starting with `-`.

The local-mode redirect already in `writeThrough` (`planning-verbs.cjs:262-264`), and the 53-01 rule D4 generalises:
```js
const target = mode === LOCAL && typeof o.writeRoot === 'string' && o.writeRoot !== '' ? o.writeRoot : main;
...
function summaryWriteRoot(root, main) {
  if (planningMode.planningMode(main).mode !== LOCAL) return main;
  return planningMode.resolveCheckoutRoot(root) || main;
}
```
`resolveCheckoutRoot` (`planning-mode.cjs:182-189`) returns the git holder when it has a planning dir (either name,
via compat `planningRoot`), else `resolveMainRoot`. It differs from `resolveMainRoot` only inside a linked worktree
that has its own planning dir. In non-git fixtures both resolve the same way, so the existing tests keep their roots.

The CLI headline (`planning-verbs-cli.cjs:152-172`) derives the directory name from `res.path`. Once the write root
is right, `wrote <dir>/<rel>` is right too. No headline change is needed.

The real-git worktree fixture to copy (`summary-worktree.test.cjs:62-114`): `envFor(p)` (fake HOME, GIT_CONFIG_GLOBAL
/dev/null, AOFORGE_ALLOW_RAW_COMMIT and the gate escapes removed), `project({config, ignorePlanning, planningDir})`
(writes config/ROADMAP/TRD, then `fx.initGitFixture`), `addWorktree(p)` (`git worktree add -q -b df/exec-07-01
<holder>/wt`), and `df(p, dir, args, input)` (spawns aof-tools with `--cwd dir` and stdin). For the cross-layout
fixture: run `git -C <wt> mv .aoforge <legacy>`, then `git -C <wt> commit -qm layout`, using `gitOk` from the test.
Also set `TMPDIR` in `envFor` to a per-test temp dir, so `planning draft` writes no drafts under the real tmpdir.

The legacy name in tests: `const { NAMES, LEGACY } = require('./legacy-names.cjs'); const OLD = LEGACY.planningDir;`.
</codebase_examples>

<anti_patterns>
- Do not add a third requirement-id regex to roadmap-coverage. The point of D1 is one parser.
- Do not fix defect 4 by teaching `resolveMainRoot` about worktrees. Config, journal, ledger, outbox, drafts' repo key
  and store-mode writes all depend on it meaning "main" (D-14).
- Do not dedupe decisions inside trd-finalize by reading STATE_ARCHIVE.md. D3 puts idempotence in the verbs.
- Do not change `output()` in helpers.cjs to append newlines globally. Many raw callers and tests pin exact bytes, so
  add `\n` only in the two verbs named.
- Do not type the legacy planning directory's literal name in any tracked file this task creates or edits (tests,
  comments, CHANGELOG, USER-GUIDE, CLAUDE.md).
- No LLM-generated fixture text, no property-based libraries, no `.feature` files.
</anti_patterns>

<error_recovery>
- A spawned verb test fails with no output: rerun it with `--raw` dropped and read stderr. `output()` exits the
  process, so in-process calls cannot continue (trd-finalize and objective-evidence spawn subprocesses for that
  reason).
- The real trd finalize run (test 16) stops at a step: `run()` reports which one in `steps[].detail`. Fix the fixture
  (for example, STATE.md needs a `## Current Position` with a Progress line for update-progress). Do not loosen the
  verb.
- The worktree test cannot `git worktree add`: confirm the fixture made an initial commit (`fx.initGitFixture`), and
  that `holder` is a separate temp dir outside `main`.
</error_recovery>
</embedded_context>

<gotchas>
- **Rename guard.** `rename-guard.repo.test.cjs` fails CI when the legacy planning dir name appears as a directory in
  a tracked file outside its ALLOW list (`**/*.legacy.test.*`, legacy-names.cjs, fixtures named `legacy-*`, ...). Build
  the name from `LEGACY.planningDir` in code and tests.
- **`roadmapRequirementIds` reads only the first label** in the text it gets. Pass one objective section at a time,
  never the whole roadmap.
- **Section level.** A `###` objective is closed by `##` or `###`, not by `####`. Do not copy trd-pre-check's
  `#{2,4}` close rule, which closes on any sub-heading.
- **Objective number in `--objective`.** trd-finalize passes `obj.objective_number` (`01`), so a re-run produces the
  same `[Objective 01]` line and the same `Objective 01 P01` row. Compare exact strings and do not normalise numbers.
- **verify.cjs pairing.** Plans and SUMMARYs pair on `trdKey` (named `NN-MM-<slug>-SUMMARY.md` included). Read the
  file for each SUMMARY of a key. One final SUMMARY makes the key complete.
- **Store-mode verbs in planning-verbs.cjs** receive `main` from `mainRoot()` and pass it to the outbox, ledger and
  mapping. `resolveVerbRoot` returns main in store mode, so none of that changes. Do not rename the variable across
  the module. The diff stays small.
- **planning-entity-verbs `quick summary`** finds the task dir with `listDir(planningRoot(ctx.main)/quick)`. After D4
  it lists the worktree, which is the fix.
- **This task's own JOB/SUMMARY drafts** sit under the main repo key (`aoforge-claude-df646fc2`). D4 keeps draft keys
  on main, so that path stays valid.
</gotchas>

<validation_gates>
- task: `npm test` (`aof-tools stack command test`; `gates.task: [test]`). Scoped form: `node --test <files>`.
- Per-file baselines at 563d2388 (tests/fail/skipped): mechanical-verbs 9/0/0, requirement-ids 30/0/0,
  summary-worktree 6/0/0, summary-pairing 14/0/0, planning-verbs 22/0/0, planning-verbs-cli 18/0/0,
  planning-mode 34/0/0, planning-drafts 13/0/0, planning-drafts-cli 6/0/0, planning-entity-verbs 20/0/0,
  state 34/0/0, todo-sync 57/0/0.
- Before Task 1, run `npm test` once at 563d2388 and record tests/pass/fail/skipped as the baseline.
</validation_gates>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: roadmap-coverage on the shared parser; checkpoint SUMMARYs are not done</name>
  <files>plugins/aoforge/aoforge/bin/lib/roadmap-coverage.cjs, plugins/aoforge/aoforge/bin/lib/requirement-ids.cjs, plugins/aoforge/aoforge/bin/lib/requirement-ids.test.cjs, plugins/aoforge/aoforge/bin/lib/objective-evidence.cjs, plugins/aoforge/aoforge/bin/lib/verify.cjs, plugins/aoforge/aoforge/bin/lib/mechanical-verbs.test.cjs, CHANGELOG.md</files>
  <action>
RED: add Test list items 1-9 and 12-14 to mechanical-verbs.test.cjs, and item 11 to requirement-ids.test.cjs. Run
`node --test plugins/aoforge/aoforge/bin/lib/mechanical-verbs.test.cjs plugins/aoforge/aoforge/bin/lib/requirement-ids.test.cjs`
and confirm each new test fails for the defect's reason (false orphan, credited AUTH-03, `0/0 ✓`, `summaries: 2`, and
so on), not because of a fixture error. Commit with
`aof-tools commit "test(verify): roadmap-coverage parity and checkpoint SUMMARYs (RED)" --files <the two test files>`.

GREEN, per D1 and D2:
1. requirement-ids.cjs: add `[a-z]?` to the hyphenated branch of `ID_SRC` and export it as `REQUIREMENT_ID_SRC`.
2. roadmap-coverage.cjs: rewrite `roadmapMapping(text)` as a level-bounded section walk that calls
   `roadmapRequirementIds(section, { objective })` per section. Build `DEFINITION_RE` from `REQUIREMENT_ID_SRC`
   (`^- \[[ xX]\] \*\*(<src>)\*\*`, flags `gm`, with the source wrapped in a group). Replace `NON_V1_SECTION` with the
   heading-start rule. Add the `v1_total === 0` failure. Append `\n` to the raw success text. Update the module comment.
3. objective-evidence.cjs: add the `checkpoint` flag per SUMMARY, the rollup keys `summaries` (final only),
   `checkpoints` and `no_self_check`, the new headline wording, and the trailing `\n`.
4. verify.cjs `cmdVerifyObjectiveCompleteness`: final-SUMMARY pairing, `checkpoint_summaries`, and the extra error.
5. CHANGELOG: add the `### Fixes (quick 36)` heading (D5) with bullets for roadmap-coverage and for evidence and
   completeness.
Commit with `aof-tools commit "fix(verify): roadmap-coverage uses the shared requirement parser; checkpoint SUMMARYs are not done" --files <changed files>`.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/mechanical-verbs.test.cjs plugins/aoforge/aoforge/bin/lib/requirement-ids.test.cjs plugins/aoforge/aoforge/bin/lib/summary-pairing.test.cjs plugins/aoforge/aoforge/bin/lib/trd-pre-check.test.cjs` passes, if that last file exists (otherwise the test file that covers `verify trd-pre`). `node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <repo> validate roadmap-coverage --raw` runs on the repo's own planning tree. Record its output in the SUMMARY: it is evidence, not a gate.</verify>
  <done>roadmap-coverage and `verify trd-pre`/`objective complete` read the same ids from any ROADMAP. A checkpoint SUMMARY never counts as a finished TRD in evidence or completeness. Both raw outputs end in a newline.</done>
  <recovery>If a summary-pairing or objective-completeness test breaks because a fixture SUMMARY has `## Progress` and no `## Self-Check`, that fixture was relying on the bug: add `## Self-Check: PASSED` to it and record that in the SUMMARY. If the `[a-z]?` suffix breaks a requirement-ids range test, keep the suffix out of the range endpoints (expandRange) and say so.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: trd finalize is a safe retry (idempotent verbs, rationale, flags, checkpoint refusal, padded ids)</name>
  <files>plugins/aoforge/aoforge/bin/lib/trd-finalize.cjs, plugins/aoforge/aoforge/bin/lib/state.cjs, plugins/aoforge/aoforge/bin/lib/state.test.cjs, plugins/aoforge/aoforge/bin/lib/mechanical-verbs.test.cjs, CHANGELOG.md</files>
  <action>
RED: add Test list items 16-21 to the `trd finalize` describe in mechanical-verbs.test.cjs, and update the existing
`Cookie sessions` assertion to the D3 argv. Add items 22-23 to state.test.cjs. Build the all-steps-pass fixture by
hand. STATE.md comes from `narrativeState()` in `__fixtures__/state-position-fixtures.cjs`, adjusted only as far as
the eight steps need. Add a ROADMAP.md with `### Objective 1: Auth` and a TRDs list, and a REQUIREMENTS.md defining
AUTH-01/02. Run the two files and confirm the new tests fail for the defect's reason. Commit with
`aof-tools commit "test(state): trd finalize retry, decision rationale, duration flag, checkpoint and padded id (RED)" --files <the two test files>`.

GREEN, per D3:
1. state.cjs `cmdStateRecordMetric`: upsert the row by its first cell, plus the store-mode `metrics_log` entry.
   `cmdStateAddDecision`: no-op on an exact duplicate entry line, with JSON `{added:false, duplicate:true, decision}`,
   raw `false` and exit 0, and no state.json append.
2. trd-finalize.cjs:
   - `parseTrdId` pads the TRD number. `key` and `--job` use the padded value.
   - Add `splitDecision`. The add-decision argv carries `--rationale` when there is one.
   - `plan()` refuses a checkpoint-only SUMMARY (use `isCheckpointOnlySummary` from misc.cjs).
   - `cmdTrdFinalize` reads `--duration` with the local `flagValue` copy and rejects missing, empty or `-`-led values
     before `plan()`.
   - Export `splitDecision`.
3. If `help.cjs` describes trd finalize's decision handling or `--duration`, keep it accurate in one line.
4. CHANGELOG: add the trd finalize bullet under `### Fixes (quick 36)`.
Commit with `aof-tools commit "fix(state): trd finalize is a safe retry; decisions keep their rationale" --files <changed files>`.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/mechanical-verbs.test.cjs plugins/aoforge/aoforge/bin/lib/state.test.cjs plugins/aoforge/aoforge/bin/lib/state-advance-job.test.cjs plugins/aoforge/aoforge/bin/lib/flag-spec.repo.test.cjs` passes, with state still at 34 or more passing and the pinned tests unchanged.</verify>
  <done>Re-running trd finalize after a failure, or after success, leaves STATE_ARCHIVE.md with one copy of each decision and metric. Decisions keep their rationale. `--duration` cannot swallow a flag or be ignored. A checkpoint SUMMARY is refused, and short TRD numbers resolve.</done>
  <recovery>If an existing state test pins a second identical add-decision appending a line, it pinned the bug: change its expectation and record it in the SUMMARY. If update-progress or advance-job fail in the real-run fixture, the fixture is short of a heading. Add the heading from templates/state.md's shape; do not skip the step.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: planning verbs write the checkout that runs them in local mode</name>
  <files>plugins/aoforge/aoforge/bin/lib/planning-mode.cjs, plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs, plugins/aoforge/aoforge/bin/lib/planning-verbs.cjs, plugins/aoforge/aoforge/bin/lib/planning-entity-verbs.cjs, plugins/aoforge/aoforge/bin/lib/planning-drafts.cjs, plugins/aoforge/aoforge/bin/lib/planning-verbs-cli.cjs, plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.test.cjs, docs/USER-GUIDE.md, CLAUDE.md, CHANGELOG.md</files>
  <action>
RED: create planning-verbs-worktree.test.cjs with Test list items 25-31, using the fixture pattern from
summary-worktree.test.cjs (see codebase_examples). Add item 32 to planning-mode.test.cjs with its existing
`mainCheckout()`/`linkedWorktree()` helpers. Confirm the failures: 25, 26, 28 and 29 write or read main, 27 fails
with TRD not found, 30 writes main, and 32 fails on the missing export. Item 31 should already pass, since it is a
guard. Commit with
`aof-tools commit "test(planning): verbs from a linked worktree write that worktree in local mode (RED)" --files <the two test files>`.

GREEN, per D4:
1. planning-mode.cjs: add and export `resolveVerbRoot`, with a doc comment stating the store/local rule and its
   relation to `resolveMainRoot` and `resolveCheckoutRoot`.
2. planning-verbs.cjs: `mainRoot` returns `planningMode.resolveVerbRoot(root)`. Update its doc comment and the module
   header paragraphs (D-01, D-14, the 53-01 "ONE exception").
3. planning-entity-verbs.cjs: change `contextOf` and its comment.
4. planning-drafts.cjs: `liveFileFor` and the stale message go through `resolveVerbRoot`. `draftFileFor` is unchanged.
5. planning-verbs-cli.cjs:547: change the reseed message root.
6. Docs: update USER-GUIDE.md (~1351) and CLAUDE.md line 64 per D4, and add the CHANGELOG bullet. Write "the legacy
   planning directory" rather than its literal name.
Commit with `aof-tools commit "fix(planning): verbs write the checkout that runs them in local mode" --files <changed files>`.

After GREEN, prove the fix on this worktree without writing anything:
`node -e "console.log(require('<repo>/plugins/aoforge/aoforge/bin/lib/planning-mode.cjs').resolveVerbRoot('<repo>'))"`
must print the realpath of `<repo>`, not `/Users/justin/dev/aoforge-claude`.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.test.cjs plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs plugins/aoforge/aoforge/bin/lib/summary-worktree.test.cjs plugins/aoforge/aoforge/bin/lib/planning-verbs.test.cjs plugins/aoforge/aoforge/bin/lib/planning-verbs-cli.test.cjs plugins/aoforge/aoforge/bin/lib/planning-entity-verbs.test.cjs plugins/aoforge/aoforge/bin/lib/planning-drafts.test.cjs plugins/aoforge/aoforge/bin/lib/planning-drafts-cli.test.cjs plugins/aoforge/aoforge/bin/lib/todo-sync.test.cjs plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/planning-writes.repo.test.cjs` passes, if the last file exists. The resolveVerbRoot check prints `<repo>`'s realpath.</verify>
  <done>In local mode every planning verb reads and writes the checkout that runs it, when that checkout has a planning directory, and its printed path is the real one. Store mode and planning-less worktrees behave as before.</done>
  <recovery>If a planning-verbs or entity-verbs test that runs from a linked worktree in LOCAL mode expected main, it encoded defect 4: update it to expect the worktree and list it in the SUMMARY. If a STORE-mode test changes result, `resolveVerbRoot` is wrong. Fix it there; do not edit the test. If summary-worktree g2 breaks, `resolveCheckoutRoot`'s fallback was bypassed: restore `|| main`.</recovery>
</task>

</tasks>

<verification>
- `npm test`: 0 failures, compared with the 563d2388 baseline. tests and pass grow only by the tests added here, and
  skipped is unchanged.
- `git log --oneline 563d2388..HEAD` shows 6 commits (a RED and a GREEN per task), all made through
  `aof-tools commit`.
- `git diff 563d2388 --stat` lists only files in `files_modified`.
- `ls /Users/justin/dev/aoforge-claude/.aoforge/quick | grep '^36-'` prints nothing (no stray write in main).
- No push, no tag, no release, and nothing written under `~/.claude` or `/Users/justin/dev/aoforge-claude`.
</verification>

<success_criteria>
- One requirement-id parser decides coverage, TRD pre-checks and objective completion.
- A mid-run SUMMARY never makes a TRD or objective look finished.
- trd finalize can be re-run after any failure without corrupting STATE_ARCHIVE.md, and records decisions intact.
- A planning verb run from a worktree writes that worktree, and says so.
</success_criteria>

<output>
Write the SUMMARY text into the draft
`/var/folders/j2/r369kq256wd5qg5yn51x376m0000gn/T/aoforge-drafts/aoforge-claude-df646fc2/quick/36-verb-correctness-roadmap-coverage-trd-fi/36-SUMMARY.md`.
Publish it only after Task 3 is GREEN and the resolveVerbRoot check prints `<repo>`'s realpath:
`node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <repo> quick summary 36 --from <that draft> --raw`.
Its JSON `path` must be under `<repo>`. If it is not, stop and report; do not retry. If Task 3 is not GREEN, leave the
draft unpublished and report its path. Do not commit the SUMMARY; the orchestrator does.
Include:
- the npm test baseline and final totals, and the per-file counts before and after;
- each RED failure message;
- the six commit hashes;
- `validate roadmap-coverage --raw` output on this repo after Task 1;
- any existing test whose expectation changed because it encoded a defect, and why;
- the out-of-scope callers left on the main root (todo-sync, store-only paths).
</output>
