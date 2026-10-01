---
objective: 48-planning-write-path-migration
trd: "01"
type: tdd
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/planning-mode.cjs
  - plugins/devflow/devflow/bin/lib/planning-mode.test.cjs
  - plugins/devflow/devflow/bin/lib/planning-paths.cjs
  - plugins/devflow/devflow/bin/lib/planning-paths.test.cjs
  - plugins/devflow/devflow/bin/lib/planning-ledger.cjs
  - plugins/devflow/devflow/bin/lib/planning-ledger.test.cjs
autonomous: true
requirements: [GWP-01, GWP-03, GWP-04]
must_haves:
  truths:
    - "`planningMode(root)` returns `store` only when the MAIN checkout's config has `github.enabled === true && github.store === true` (strict booleans); every other config, a missing config, or malformed JSON returns `local` (D-01)"
    - "`resolveMainRoot(cwd)` returns the main checkout root from inside a linked worktree by reading the worktree `.git` file and its `commondir`, without spawning git; from the main checkout or a non-git dir it returns the nearest ancestor holding `.planning/` (D-14)"
    - "`classify(rel)` is total over `.planning/` paths and returns exactly one of `tracked-config | cache | generated | runtime` with, for cache and generated, the verb string and a one-line hint (D-02, U-1)"
    - "A TRD path classifies as `cache` with verb `plan put-trd`; ROADMAP.md / STATE.md / MILESTONES.md as `generated`; config.json and STACK.md as `tracked-config`; `.skill-active`, `state.json`, `workstreams/x` as `runtime`"
    - "`gitignoreLines()` returns exactly `.planning/*`, `!.planning/config.json`, `!.planning/STACK.md` (U-1)"
    - "The ledger records `rel -> contentHash` in `<stateDir>/<repoKey>.verb-writes.json` beside the outbox journal and cache index (never under the repo), `settle` clears entries, and nothing is written when the outbox state dir env override points at a temp dir (D-15)"
    - "None of the three modules spawns `gh` or `git`"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/planning-mode.cjs
      provides: "planningMode, isStoreMode, resolveMainRoot, readPlanningConfig"
    - path: plugins/devflow/devflow/bin/lib/planning-paths.cjs
      provides: "CLASSES, classify, relToPlanning, VERB_TABLE, gitignoreLines, TRACKED_CONFIG, listByClass"
    - path: plugins/devflow/devflow/bin/lib/planning-ledger.cjs
      provides: "ledgerPath, readLedger, record, forget, matches, settleCandidates"
  key_links:
    - "Consumed by every later 48 TRD: verbs (48-11/12), gate (48-08), validate W055 (48-09), migration 0010 (48-10), existing writers (48-13/48-14), audit test (48-04; VERB_TABLE checked against the dispatch in 48-15)"
    - "planning-ledger uses gh-outbox `stateDir`/`repoKey` and gh-trd `contentHash` so its location and hashes match the 47 cache index"
---

# TRD 48-01: Planning mode switch, path classifier, verb-write ledger

<objective>
Create the three small modules every other piece of objective 48 calls: the mode switch (`local` vs `store`), the total classifier of
`.planning/` paths (which class, which verb, git and gate treatment), and the verb-write ledger that lets `validate` tell a pending verb
write from a direct Bash write.

Purpose: the single source for D-01, D-02, D-14, D-15 and U-1. Output: three pure CommonJS modules with paired tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD (kind plugin, work refactor): RED commit before GREEN for every behaviour below. Commit with
  `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- `planning-mode.cjs` and `planning-paths.cjs` are fs-only and importable from hooks: `require` only `fs`, `path`, `os`. No `child_process`.
  `planning-ledger.cjs` may require `gh-outbox.cjs` (for `stateDir`, `repoKey`) and `gh-trd.cjs` (`contentHash`); it must not spawn anything.
- Tests use temp dirs (`fs.mkdtempSync(os.tmpdir())`) and `hermeticEnv()` from `__fixtures__/gh-store-fixtures.cjs` (sets
  `DEVFLOW_OUTBOX_DIR` and HOME to temps). Never touch the real `~/.claude`, never real GitHub, never port 8080. Hand-built fixtures
  only; no property-based tests.
- Do not read `github.store` anywhere else in this TRD's code; later TRDs call `planningMode`.

## Decisions (from OBJECTIVE.md `## Decisions`)

U-1 (tracked set), D-01 (mode), D-02 (classes), D-14 (main checkout), D-15 (ledger). Settled here:

- **Class table** (first match wins; `rel` is POSIX, relative to `.planning/`, no leading `./`):

| Pattern | Class | Verb | Hint |
|---|---|---|---|
| `config.json`, `STACK.md` | tracked-config | - | - |
| first segment starts with `.` (e.g. `.skill-active`, `.trd-progress/x.md`) | runtime | - | - |
| `state.json`, `STATE_ARCHIVE.md`, `SESSION_PICKUP.md`, `evidence/**`, `workstreams/**` | runtime | - | - |
| `ROADMAP.md`, `STATE.md`, `MILESTONES.md` | generated | `gh pull --all` | "generated view; regenerate with `df-tools gh pull --all`" |
| `objectives/<dir>/*-TRD.md` | cache | `plan put-trd` | "`df-tools plan put-trd <objective> <file> --from <draft>`" |
| `objectives/<dir>/OBJECTIVE.md` | cache | `objective put` | "`df-tools objective put <id> --from <draft>` or `objective set-status <id> <status>`" |
| `objectives/<dir>/*-SUMMARY.md` | cache | `summary post` | "`df-tools summary post <trd> --from <draft>`" |
| `objectives/<dir>/*-VERIFICATION.md` | cache | `verification post` | "`df-tools verification post <objective> --from <draft>`" |
| `objectives/<dir>/<prefix>-<SUFFIX>.md` (any other uppercase suffix: CONTEXT, RESEARCH, UAT, EVIDENCE, ...) | cache | `doc put` | "`df-tools doc put <rel> --from <draft>`" |
| `PROJECT.md`, `REQUIREMENTS.md`, `codebase/*.md`, `adr/*.md`, `retros/*.md`, `research/*.md`, `milestones/*.md`, `wiki/**` | cache | `doc put` | as above |
| `todos/pending/*.md`, `todos/completed/*.md`, `todos/done/*.md` (legacy) | cache | `todo add` | "`df-tools todo add --from <draft>` / `todo complete <stem>`" |
| `debug/*.md`, `debug/resolved/*.md` | cache | `debug put` | "`df-tools debug put <slug> --from <draft>` / `debug resolve <slug>`" |
| `quick/<N>-<slug>/<N>-JOB.md`, `.../<N>-SUMMARY.md` | cache | `quick put` | "`df-tools quick put <N> --from <draft>` / `quick summary <N> --from <draft>`" |
| `decisions/**` | cache | `decision open` | "`df-tools decision open <trd> --question <text>` / `decision answer <id> --from <draft>`" |
| anything else (incl. other files in a quick dir, legacy `*-JOB.md`) | runtime | - | - |

  `classify` also returns `entity` for entity paths (`{role:'todo', id:'todo-<stem>', state:'open'|'closed'}`, `{role:'debug', id:'debug-<stem>', ...}`,
  `{role:'quick', id:'quick-<N>', part:'job'|'summary'}`) so 48-12 and 48-07 reuse one parser.
- **`VERB_TABLE`**: frozen list of every verb string named above (used by 48-15 to assert each exists in the df-tools dispatch).
- **Main root** (`resolveMainRoot(cwd)`): walk up from `cwd` to the first dir containing `.git`. If `.git` is a FILE (`gitdir: <path>`),
  read `<gitdir>/commondir` (relative to gitdir), resolve the common dir, and its parent is the main root. If `.git` is a dir, that dir's
  parent is the root. Then prefer the root if it has `.planning/`; otherwise fall back to the nearest ancestor of `cwd` with `.planning/`;
  else `null`. Use `fs.realpathSync` on the result (outbox `repoKey` hashes realpath).
- **Ledger file**: `path.join(outbox.stateDir(), `${outbox.repoKey(root)}.verb-writes.json`)` — the same `<repoKey><suffix>` scheme
  `gh-outbox.cjs` `repoFile()` (L341) uses for the journal (`.json`), lock (`.lock`) and cache index. This TRD does not own gh-outbox.cjs,
  so build the path from the exported `stateDir` + `repoKey`.
  JSON shape `{version:1, entries:{rel:{hash, at, verb}}}`; written with `sync-state.atomicWrite`.

## Test list

planning-mode
1. No `.planning/config.json` → `{mode:'local'}`; malformed JSON → local; `{github:{enabled:true}}` → local; `{github:{enabled:true,store:'true'}}` → local; `{github:{enabled:true,store:true}}` → store; `{github:{enabled:false,store:true}}` → local.
2. `resolveMainRoot` from the main checkout root and from a nested subdir → main root (realpath).
3. Worktree fixture built by hand (no git spawn): `main/.git/` dir with `worktrees/wt1/commondir` = `../..`, `wt/.git` file `gitdir: <main>/.git/worktrees/wt1` → `resolveMainRoot(wt)` is `main`; `planningMode(wt)` reads MAIN's config (store) even when `wt/.planning/config.json` says local.
4. Non-git temp dir with `.planning/` → that dir; no `.planning` anywhere → null.

planning-paths
5. Every row of the class table with at least one positive path, asserting class, verb and that the hint contains the verb.
6. Negative/edge: `objectives/48-x/48-01-foo-TRD.md` (cache, plan put-trd) vs `objectives/48-x/notes.md` (runtime); `todos/pending/a.md` → entity `{role:'todo', id:'todo-a', state:'open'}`; `todos/completed/a.md` and legacy `todos/done/a.md` state closed; `debug/resolved/x.md` → `{role:'debug', id:'debug-x', state:'closed'}`; `quick/12-fix-x/12-JOB.md` → `{role:'quick', id:'quick-12', part:'job'}`; `quick/12-fix-x/DECISION-001.md` → runtime.
7. `relToPlanning(abs, planningDir)` → rel for inside paths, `null` for outside, handles a symlinked tmp dir (`/private/tmp` vs `/tmp` on macOS) via realpath of the deepest existing ancestor.
8. Unsafe rels (`../x`, absolute, NUL, backslash) → throws `TypeError`.
9. `gitignoreLines()` deep-equals the three U-1 lines; `TRACKED_CONFIG` deep-equals `['config.json','STACK.md']`.
10. `listByClass(planningDir)` on a hand-built tree returns `{cache:[...], generated:[...], runtime:[...], 'tracked-config':[...]}` sorted, skipping `wiki/.git/**`.
11. The runtime dotfiles pinned by `hooks/planning-writes.audit.test.js` (`.skill-active`, `.edit-override`, `.devflow-notices.json`, `.progress-guard.json`, `.awareness-cache.json`) all classify runtime (literal list; comment cross-references that test).

planning-ledger
12. `record(root, 'objectives/07-x/07-01-a-TRD.md', text, {verb:'plan put-trd', now})` writes the entry with `hash = contentHash(text)`; file lives beside the cache index under the hermetic state dir; nothing appears under `root`.
13. `matches(root, rel, text)` true for the recorded text, false after the file changes; `forget(root, [rel])` removes it; reading a missing/corrupt ledger returns empty entries (corrupt file is not overwritten silently: `readLedger` returns `{entries:{}, corrupt:true}`).
14. `settleCandidates(root, readFile)` returns rels whose current bytes still match the ledger (the ones 48-11 may baseline after a flush) and rels that drifted.
15. Two different roots get two different ledger files (repoKey).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: planning-mode.cjs — mode switch and main-checkout resolution (tests 1-4)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-mode.cjs, plugins/devflow/devflow/bin/lib/planning-mode.test.cjs</files>
  <action>
RED: write tests 1-4 in `planning-mode.test.cjs` (node:test, `describe`/`test`, temp dirs built with `fs.mkdirSync`/`writeFileSync`; the
worktree layout is written by hand — do not run `git worktree`). Commit `test(48-01): mode switch and main root`.

GREEN: implement `readPlanningConfig(root)` (returns parsed object or null; never throws), `planningMode(root)` → `{mode, reason}`,
`isStoreMode(root)` → boolean, `resolveMainRoot(cwd)`. `planningMode(cwdOrRoot)` first calls `resolveMainRoot`, so callers may pass any cwd.
Header comment: the D-01 invariant (local = today's behaviour) and that this is the ONLY reader of `github.store` for planning writes
(`gh.cjs storeEnabled` keeps serving the sync path). Commit `feat(48-01): planning-mode switch`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-mode.test.cjs</verify>
  <done>Tests 1-4 pass; module requires only fs/path/os.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: planning-paths.cjs — total classifier, verb table, gitignore lines (tests 5-11)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-paths.cjs, plugins/devflow/devflow/bin/lib/planning-paths.test.cjs</files>
  <action>
RED: tests 5-11 with literal path tables (hand-written arrays of `[rel, expectedClass, expectedVerb]`). Commit `test(48-01): planning path classifier`.

GREEN: implement the class table above as an ordered array of `{test(rel) → match|null, class, verb, hint(match)}` rules; `classify(rel)`
returns `{class, verb|null, hint|null, entity|null}` and never returns undefined (final rule = runtime). Export `CLASSES`, `VERB_TABLE`
(deduplicated verbs, frozen), `TRACKED_CONFIG`, `gitignoreLines()`, `relToPlanning`, `listByClass`. Use the objective-dir regex shape from
`gh-hierarchy.cjs` `TRD_FILE_RE` / `gh-cache.cjs` `OWNED_OBJECTIVE_FILE_RE` (copy the pattern, do not require those modules: this file
must stay hook-safe). Commit `feat(48-01): planning path classifier`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-paths.test.cjs</verify>
  <done>Tests 5-11 pass; every class-table row covered; module requires only fs/path.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: planning-ledger.cjs — verb-write ledger (tests 12-15)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-ledger.cjs, plugins/devflow/devflow/bin/lib/planning-ledger.test.cjs</files>
  <action>
RED: tests 12-15 under `hermeticEnv()`; assert the ledger is `<stateDir>/<repoKey>.verb-writes.json` (same directory as the journal). Commit `test(48-01): verb-write ledger`.

GREEN: implement `ledgerPath(root)`, `readLedger(root)`, `record(root, rel, text, {verb, now})`, `forget(root, rels)`, `matches(root, rel, text)`,
`settleCandidates(root, readFile)`. Use `outbox.stateDir()`/`repoKey(root)` for location, `ghTrd.contentHash` for hashes, `sync-state.atomicWrite`
for writes. Do NOT touch the cache-index format (47 tests pin it). Commit `feat(48-01): verb-write ledger`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-ledger.test.cjs plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs</verify>
  <done>Tests 12-15 pass; gh-outbox suite unchanged and green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-outbox.cjs` `readGithubConfig(projectRoot)` (L352) and `isEnabled` (L362): the JSON read to mirror in `readPlanningConfig`.
- `hooks/gate-edits.js` `sharedPlanningDir(start)` (L104): existing worktree → main `.planning` resolution; keep the semantics compatible.
- `gh-cache.cjs` L511 `OWNED_OBJECTIVE_FILE_RE = /^(?:OBJECTIVE|(?:.+-)?(?:CONTEXT|RESEARCH|TRD|SUMMARY|VERIFICATION))\.md$/`.
</codebase_examples>
<anti_patterns>
- Reading `github.store` with truthiness (`if (gh.store)`): the string `"true"` must stay local.
- Spawning `git rev-parse` in planning-mode: hooks call it on every Edit; fs-only parsing keeps it cheap and fail-open.
- Classifying unknown paths as cache: the gate would deny files no verb can write. Unknown = runtime.
</anti_patterns>
<error_recovery>
- If `commondir` is absent (older git), treat `gitdir`'s grandparent's parent (`<main>/.git/worktrees/<n>` → `<main>`) as the root.
- macOS `/var` vs `/private/var`: compare realpaths in tests.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/planning-mode.test.cjs plugins/devflow/devflow/bin/lib/planning-paths.test.cjs plugins/devflow/devflow/bin/lib/planning-ledger.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs plugins/devflow/devflow/bin/lib/gh-cache.test.cjs</regression>
</validation_gates>

<verification>
- `rg -n "child_process" plugins/devflow/devflow/bin/lib/planning-mode.cjs plugins/devflow/devflow/bin/lib/planning-paths.cjs plugins/devflow/devflow/bin/lib/planning-ledger.cjs` → no matches.
- `rg -n "github.store|\.store\b" plugins/devflow/devflow/bin/lib/planning-*.cjs` → only in planning-mode.cjs.
</verification>

<success_criteria>
One module decides the mode, one decides what any `.planning/` path is and which verb owns it, and one records verb writes outside the repo.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-01-SUMMARY.md`
</output>
