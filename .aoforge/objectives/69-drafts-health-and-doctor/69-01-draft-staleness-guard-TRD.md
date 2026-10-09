---
objective: 69-drafts-health-and-doctor
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/draft-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/planning-drafts.cjs
  - plugins/devflow/devflow/bin/lib/planning-drafts.test.cjs
  - plugins/devflow/devflow/bin/lib/planning-drafts-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs
autonomous: true
requirements: [TOOL-06]
must_haves:
  truths:
    - "`df-tools planning draft PROJECT.md` on a draft whose live file changed after the draft was seeded rewrites the draft with the live text, prints only the same path on stdout, prints a `reseeded` notice on stderr, and keeps the replaced draft at `<draft>.stale`"
    - "A draft with no base record whose mtime is older than the live file is reseeded the same way (drafts made before this change)"
    - "A draft edited after seeding, whose base is still the live file, is never overwritten by `planning draft`"
    - "`df-tools doc put PROJECT.md --from <draft>` exits 1 when the draft's base is no longer the live file; stderr says `refused (stale draft)` and names `df-tools planning draft PROJECT.md` as the fix; the live file is byte-identical afterwards"
    - "In store mode the same refusal queues no outbox op and makes no gh call"
    - "After a successful `doc put` from a draft, a second `doc put` from the same unchanged draft succeeds (the base record follows the published text)"
    - "`doc put --from -` and `--from <a file outside the drafts tree>` publish exactly as before (there is no base to compare)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/planning-drafts.cjs
      provides: "draft base records: draftFileFor, prepareDraft, checkDraftBase, recordPublished"
      exports: ["DRAFTS_DIR", "BASE_SUFFIX", "STALE_SUFFIX", "draftFileFor", "liveFileFor", "prepareDraft", "checkDraftBase", "recordPublished"]
    - path: plugins/devflow/devflow/bin/lib/planning-drafts-cli.test.cjs
      provides: "spawned df-tools: stale draft refused, reseed, publish, re-publish, stdin unchanged"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/draft-fixtures.cjs
      provides: "makeDraftProject(): local-mode temp project with an isolated TMPDIR and a spawn helper"
  key_links:
    - from: "planning-verbs.cjs docPut"
      to: "planning-drafts.cjs checkDraftBase / recordPublished"
      via: "base check before writeThrough; base refresh after a successful write"
      pattern: "checkDraftBase\\("
    - from: "planning-verbs-cli.cjs cmdPlanningVerb `draft`"
      to: "planning-drafts.cjs prepareDraft"
      via: "stdout path unchanged; reseed notice on stderr; --raw JSON gains seeded/reseeded/stale_copy"
      pattern: "prepareDraft\\("
    - from: "planning-verbs-cli.cjs cmdDoc `put`"
      to: "verbs.docPut({ from })"
      via: "withInput passes readFrom's `from` to its callback"
      pattern: "from"
---

# TRD 69-01: A stale planning draft is reseeded, and `doc put` refuses one (TOOL-06)

<objective>
`df-tools planning draft <rel>` prints a draft path under `<os.tmpdir()>/devflow-drafts/<repoKey>/<rel>` and seeds it
from the live `.planning/` file only when the draft does not exist yet. An existing draft is never touched, however old.
So a draft left over from an earlier session, or seeded before someone else changed the live file, is handed back as if
it were current, and `doc put <rel> --from <draft>` publishes it: the other change is silently overwritten (in store
mode, pushed to the wiki).

Fix it with a base record per draft. When `planning draft` seeds a draft it writes a sidecar `<draft>.base.json` holding
the sha256 of the live text it was seeded from. A draft is stale when the live file's sha256 no longer equals that base
(drafts with no base record fall back to mtime: draft older than the live file). `planning draft` reseeds a stale draft
(keeping the replaced draft at `<draft>.stale`), and `doc put` refuses a stale draft with a message naming the fix.

Purpose: success criterion 1. Output: `lib/planning-drafts.cjs`, wiring in planning-verbs(.cjs, -cli.cjs), unit, CLI and
store-mode tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
Read with offset/limit (do not read whole files):
- `plugins/devflow/devflow/bin/lib/planning-verbs.cjs`: helpers 84-135 (`DRAFTS_DIR`, `mainRoot`, `safeRel`,
  `planningFile`, `readOrNull`), `writeThrough` 240-285, `docPut` 932-965, `draftPath` 968-985, exports 987-1001.
- `plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs`: `readFrom` 100-124 (returns `{text, from}`; `from` is
  the absolute resolved path or `'-'`), `report`/`headline` 143-178, `withInput` 183-188, `cmdDoc` 258-268,
  `cmdPlanningVerb` draft arm 470-481.
- `plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs`: harness 1-60, `useProject`, test 16 (`draftPath`) 208-232,
  the store-mode doc put test (search `12.`).

## Binding rules
- Strict TDD on tasks 2 and 3; one test at a time (RED, GREEN, commit pairs).
- Hand-built fixtures only (no generated data). Temp projects with a realpath'd `mkdtemp` root and an isolated `TMPDIR`;
  never this repository's `.planning/` and never the real `os.tmpdir()/devflow-drafts/devflow-claude-*` tree.
- Parallel wave: 69-02 edits `validate.cjs` and `doctor-git.cjs`, 69-03 adds `requirements-agreement*.cjs` and edits
  objective 58 SUMMARYs. Do not edit those files. One plain command per Bash call; commit with
  `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- No new CLI flag: `flag-spec.cjs` stays unchanged.
- Only `doc put` checks the base in this objective (TOOL-06). Do not wire `checkDraftBase` into `plan put-trd`,
  `summary post` or the other `--from` verbs.

## Staleness rule (one function serves `planning draft` and `doc put`)

```
live = text of <mainRoot>/.planning/<rel>, or null
base = JSON of <draft>.base.json -> { rel, sha256: hex|null, seeded_at }, or null when missing/unparseable/rel differs
stale(draft):
  live === null                 -> false   (nothing to be stale against)
  base !== null                 -> base.sha256 !== sha256(live)          reason 'base-changed'
  base === null                 -> mtimeMs(draft) < mtimeMs(livePath)    reason 'older-than-live'
```
`doc put` applies the mtime fallback only when `--from` is the canonical draft path for `<rel>`; a file elsewhere with
no base record is not a draft and is never checked.
</context>

## Test list

`planning-drafts-cli.test.cjs` (task 3, spawns `node plugins/devflow/devflow/bin/df-tools.cjs --cwd <root>` with the
fixture's env; outermost first):
1. Stale draft refused: `planning draft PROJECT.md` -> P; write `my edit\n` to P; `doc put PROJECT.md --from <Q>` (Q a
   file outside the drafts tree with different text) -> exit 0; `doc put PROJECT.md --from P` -> exit 1, stderr contains
   `doc put: refused (stale draft)` and `df-tools planning draft PROJECT.md` and `${P}.stale`; live PROJECT.md === Q's text.
2. Reseed: `planning draft PROJECT.md` -> stdout is exactly `${P}\n`; stderr contains `reseeded`; P === live text;
   `${P}.stale` === `my edit\n`.
3. Publish after reseed: write new text to P; `doc put PROJECT.md --from P` -> exit 0; live === P's text.
4. Re-publish: `doc put PROJECT.md --from P` again, P unchanged -> exit 0 (base followed the published text).
5. `planning draft PROJECT.md --raw` -> JSON `{ ok: true, rel, path, seeded, reseeded, stale_copy }` with the right
   booleans for a fresh seed and for a reseed.
6. Stdin is unchecked: after the live file changes, `doc put PROJECT.md --from -` (input piped) -> exit 0.

`planning-drafts.test.cjs` (task 2, in-process; `process.env.TMPDIR` set to the fixture's tmp dir in beforeEach and
restored in afterEach, because `os.tmpdir()` reads TMPDIR on every call):
7. No draft, live exists: `prepareDraft` writes the live text, base sha256 === sha256(live), `seeded: true`,
   `reseeded: false`; the draft is written (not `copyFileSync`), so its mtime is not older than the live file's.
8. No draft, no live: no draft file, a base with `sha256: null`, `seeded: false`; the draft's directory exists.
9. Draft edited after seeding, live unchanged: `reseeded: false`, the draft text is untouched.
10. Live changed after seeding: `reseeded: true`, `stale_copy === draft + '.stale'` holding the old draft text, the draft
    holds the live text, the base holds the new sha256.
11. Live changed but the draft text already equals it: `reseeded: false`, no `.stale` file, base refreshed.
12. No base record (legacy draft): mtime set older than the live file with `fs.utimesSync` -> reseeded; set newer ->
    kept, and a base with sha256(live) is written (adopted).
13. An unparseable `.base.json` is treated as no base (mtime rule applies).
14. The live file is missing while the draft exists -> kept, not stale.
15. `checkDraftBase`: `'-'` -> ok; a foreign file with no base -> ok; base === live -> ok; base !== live ->
    `{ ok: false, refused: 'stale draft' }` with an error matching `/planning draft PROJECT\.md/` and `/\.stale/`;
    base sha256 null and the live file now exists -> refused; canonical legacy draft older than live -> refused; a base
    whose `rel` differs -> ok. The draft path is compared by realpath (macOS `/var` vs `/private/var`).
16. `recordPublished`: rewrites the base to sha256(text) for a draft with a base or at the canonical path; for `'-'` or a
    foreign file it writes nothing (no sidecar appears next to a user's file).
17. An unsafe rel (`../escape.md`) throws TypeError from `prepareDraft` and `draftFileFor`.

`planning-verbs.test.cjs` (task 3, store section, existing harness):
18. Store mode: seed a draft of a wiki-backed doc, change the cache file through `docPut` from another file, then
    `docPut` from the stale draft -> `ok: false`, `refused: 'stale draft'`, the cache file unchanged, no new gh call
    (`S.fake.calls()` length unchanged) and no new outbox op.
Existing test 16 must still pass (an edited draft whose base is current is not overwritten); reword only its message.

<embedded_context>

<codebase_examples>
Today's seed-once rule (`planning-verbs.cjs` 976-985), which becomes `prepareDraft`:

```js
function draftPath(root, rel) {
  const r = safeRel(rel);
  const main = mainRoot(root) || path.resolve(String(root));
  const file = path.join(os.tmpdir(), DRAFTS_DIR, outbox.repoKey(main), ...r.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    const cache = planningFile(main, r);
    if (fs.existsSync(cache)) fs.copyFileSync(cache, file);
  }
  return file;
}
```

How a refusal is reported (`planning-verbs-cli.cjs` `headline`): a result with `refused` prints
`${verb}: refused (${res.refused}). Nothing was written.` and `report` adds `Error: <res.error>` on stderr with exit 1.
`fail(error, base, extra)` in planning-verbs.cjs builds `{ ok: false, ..., error, exit: EXIT.ERROR }`; pass
`{ refused: 'stale draft' }` as `extra`.

Atomic writes: `const { atomicWrite } = require('./sync-state.cjs')` (already used by planning-verbs.cjs).
</codebase_examples>

<anti_patterns>
- Do not decide staleness by mtime when a base record exists: the agent's own edit makes the draft newer than a live
  file that changed after seeding, so mtime would miss exactly the case TOOL-06 is about.
- Do not discard the old draft on reseed: always write it to `<draft>.stale` first (unless it equals the live text).
- Do not print anything but the path on stdout from `planning draft` without `--raw`: callers capture it with
  `DRAFT=$(df-tools planning draft <rel>)`.
- Do not put base records in one shared manifest: parallel executors would lose each other's updates. One sidecar per
  draft.
- Do not add a `--force` flag; the fix is reseeding.
</anti_patterns>

<error_recovery>
- Test 7 fails on mtime: you used `copyFileSync` (on macOS it can preserve the source mtime). Read the text and
  `atomicWrite` it.
- Test 15 path comparison fails only on macOS: compare `fs.realpathSync` of both paths when they exist, else
  `path.resolve` strings.
- A spawned test writes into the real temp dir: the spawn env is missing `TMPDIR`; the fixture must pass it.
</error_recovery>

</embedded_context>

<gotchas>
- `os.tmpdir()` on macOS returns `/var/folders/...` while `fs.realpathSync` returns `/private/var/folders/...`; the
  path `planning draft` prints is the non-realpath form and is what agents pass to `--from`.
- `outbox.repoKey(main)` keys the drafts tree on the main checkout, so a linked worktree shares drafts with main, and
  `doc put` writes the main checkout (writeThrough with no writeRoot). The live file is always
  `<mainRoot>/.planning/<rel>`.
- `fail()` already sets `ok: false`; the headline adds "Nothing was written.", so the error text itself should not
  repeat it.
- `docPut` validates `rel` and the text before anything else; run the base check after those and before `writeThrough`,
  and `recordPublished` only when the write result is `ok`.
</gotchas>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── planning-drafts.cjs                    ← CREATE (base records, staleness, reseed, check)
├── planning-drafts.test.cjs               ← CREATE (tests 7-17)
├── planning-drafts-cli.test.cjs           ← CREATE (tests 1-6)
├── planning-verbs.cjs                     ← MODIFY (draftPath delegates; docPut checks and records)
├── planning-verbs-cli.cjs                 ← MODIFY (draft notice; withInput passes from)
├── planning-verbs.test.cjs                ← MODIFY (test 18; test 16 message)
└── __fixtures__/draft-fixtures.cjs        ← CREATE (makeDraftProject)
</file_tree>

<tasks>

<task type="auto">
  <name>Task 1: Draft-project fixture builder</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/draft-fixtures.cjs</files>
  <action>
Hand-built module (CommonJS, node built-ins only plus the repo df-tools path):
- `makeDraftProject({ project = '# Project\n\nv1\n' } = {})` -> creates `root = fs.realpathSync(fs.mkdtempSync(os.tmpdir() + '/df-drafts-'))`
  with `root/proj/.planning/config.json` (`{}`, local mode) and `root/proj/.planning/PROJECT.md` (the `project` text),
  plus `root/tmp` (the isolated TMPDIR) and `root/home` (fake HOME). Returns
  `{ dir: root/proj, tmp, home, env, livePath(rel), setLive(rel, text), setMtime(file, ms), run(argv, { input } = {}), cleanup() }`.
  `env` = `{ ...process.env, TMPDIR: tmp, HOME: home }` with every `DEVFLOW_*` variable removed. `run` spawns
  `node <repo>/plugins/devflow/devflow/bin/df-tools.cjs --cwd <dir> ...argv` (`spawnSync`, `encoding: 'utf8'`,
  `input` when given, 20 s timeout) and returns `{ status, stdout, stderr }`. `setMtime` calls `fs.utimesSync(file, t, t)`
  with `t = new Date(ms)`. `cleanup` removes `root` recursively.
Commit `test(69-01): draft project fixture`.
  </action>
  <verify>`node -e "const f=require('./plugins/devflow/devflow/bin/lib/__fixtures__/draft-fixtures.cjs'); const p=f.makeDraftProject(); const r=p.run(['planning','draft','PROJECT.md']); console.log(r.status, r.stdout.trim().startsWith(p.tmp)); p.cleanup()"` prints `0 true`.</verify>
  <done>The fixture spawns df-tools against an isolated project whose drafts land under its own TMPDIR.</done>
  <recovery>If the draft path does not start with `p.tmp`, compare realpaths (`fs.realpathSync`); macOS may report `/private/var` for one side.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: planning-drafts.cjs (tests 7-17)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-drafts.cjs, plugins/devflow/devflow/bin/lib/planning-drafts.test.cjs</files>
  <action>
RED: tests 7-17 in `planning-drafts.test.cjs` using `makeDraftProject`. Commit `test(69-01): draft base records and staleness`.

GREEN `lib/planning-drafts.cjs` (requires: fs, os, path, crypto, `./planning-paths.cjs` (classify for safeRel),
`./planning-mode.cjs` (resolveMainRoot), `./gh-outbox.cjs` (repoKey), `./sync-state.cjs` (atomicWrite)):

```
DRAFTS_DIR = 'devflow-drafts'; BASE_SUFFIX = '.base.json'; STALE_SUFFIX = '.stale'
sha256(text)            crypto sha256 hex of utf8
mainOf(root)            planningMode.resolveMainRoot(root) || path.resolve(String(root))
draftFileFor(root, rel) planningPaths.classify(rel) (throws TypeError); join(os.tmpdir(), DRAFTS_DIR, repoKey(mainOf(root)), ...rel.split('/'))
liveFileFor(root, rel)  join(mainOf(root), '.planning', ...rel.split('/'))
readBase(draft)         JSON of draft+BASE_SUFFIX if an object with string rel, else null
writeBase(draft, rel, sha, now)  atomicWrite(draft+BASE_SUFFIX, JSON {rel, sha256: sha, seeded_at: now.toISOString()} + '\n')
staleness(root, rel, draft, {canonicalOnlyFallback})  -> {stale, reason, live, liveSha}  (the rule in <context>)

prepareDraft(root, rel, {now = new Date()} = {}):
  file = draftFileFor(root, rel); mkdir -p dirname(file)
  live = readOrNull(liveFileFor(root, rel))
  if !exists(file): if live !== null atomicWrite(file, live); writeBase(file, rel, live === null ? null : sha256(live), now)
                    return {path: file, seeded: live !== null, reseeded: false, stale_copy: null, reason: null}
  s = staleness(...); if live === null -> return unchanged result
  if !s.stale: if no usable base -> writeBase(file, rel, s.liveSha, now)   # adopt a legacy draft
               return {path: file, seeded: false, reseeded: false, stale_copy: null, reason: null}
  old = read(file)
  if old === live: writeBase(...); return {..., reseeded: false}
  atomicWrite(file + STALE_SUFFIX, old); atomicWrite(file, live); writeBase(file, rel, s.liveSha, now)
  return {path: file, seeded: false, reseeded: true, stale_copy: file + STALE_SUFFIX, reason: s.reason}

checkDraftBase(root, rel, from):
  if typeof from !== 'string' || from === '' || from === '-' -> {ok: true}
  abs = path.resolve(from); canonical = draftFileFor(root, rel); base = readBase(abs)
  if base && base.rel !== rel -> {ok: true}
  if !base && !samePath(abs, canonical) -> {ok: true}
  s = staleness(...); if !s.stale -> {ok: true}
  -> {ok: false, refused: 'stale draft', reason: s.reason, draft: from, error:
      `the draft ${from} is stale: .planning/${rel} changed after the draft was seeded, so publishing it would overwrite that change. ` +
      `Run \`df-tools planning draft ${rel}\` to reseed it (it keeps your edits at ${from}${STALE_SUFFIX}), re-apply them, then run doc put again.`}

recordPublished(root, rel, from, text, {now}): same `from` gating as checkDraftBase (base with this rel, or canonical
  path); then writeBase(abs, rel, sha256(text), now). Never creates a sidecar beside a foreign file.
samePath(a, b): realpath both when they exist, else path.resolve; string equality.
```
Header comment: why a base hash and not mtime (anti_patterns), the sidecar files, the legacy mtime fallback and its
limit (a legacy draft seeded from an older version but edited after the live change cannot be detected; it is adopted).
Commit `feat(69-01): draft base records, reseed and stale check`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/planning-drafts.test.cjs` passes.</verify>
  <done>Tests 7-17 went RED then GREEN; the module is pure apart from fs (no process.exit, no output).</done>
  <recovery>If requiring gh-outbox.cjs pulls in heavy state at load time, copy nothing: confirm `outbox.repoKey` is a pure function of the path (planning-verbs.cjs already requires it the same way).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Wire `planning draft` and `doc put` (tests 1-6, 18)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-verbs.cjs, plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs, plugins/devflow/devflow/bin/lib/planning-drafts-cli.test.cjs, plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs</files>
  <action>
RED: `planning-drafts-cli.test.cjs` tests 1-6 and test 18 in planning-verbs.test.cjs (tests 1, 2, 5 and 18 fail today).
Commit `test(69-01): stale drafts are reseeded and refused by doc put`.

GREEN:
1. planning-verbs.cjs: `const drafts = require('./planning-drafts.cjs')`. `DRAFTS_DIR` re-exported from drafts.
   `draftPath(root, rel)` becomes `return drafts.prepareDraft(root, rel).path;` (kept for API compatibility; update its
   doc comment). `docPut`: after the rel/text checks, `const chk = drafts.checkDraftBase(root, rel, o.from); if (!chk.ok)
   return fail(chk.error, { rel }, { refused: chk.refused });` then `const r = writeThrough(...)`; when `r.ok`, call
   `drafts.recordPublished(root, rel, o.from, o.text)` (wrap in try/catch and push a warning on failure: the publish
   already happened). Document `from` in docPut's comment.
2. planning-verbs-cli.cjs: `withInput` calls `fn(input.text, input.from)`. `cmdDoc` put passes `from` to `docPut`.
   The `draft` arm calls `drafts.prepareDraft(cwd, pos[0])` (TypeError -> the existing usage report). Without `--raw`:
   stdout `${res.path}\n`; when `res.reseeded`, stderr
   `planning draft: reseeded ${res.path} from .planning/${rel}: the live file changed after the draft was seeded. Your previous draft is at ${res.stale_copy}.`
   With `--raw`: `{ ok: true, rel, path, seeded, reseeded, stale_copy }`. Update `FROM_USAGE` to say the draft is
   reseeded when the live file has changed.
3. planning-verbs.test.cjs test 16: reword the "never overwritten" message to "an edited draft whose base is current is
   never overwritten"; add test 18 in the store section with the existing fake GitHub harness.
Commit `feat(69-01): planning draft reseeds stale drafts; doc put refuses them`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/planning-drafts-cli.test.cjs plugins/devflow/devflow/bin/lib/planning-drafts.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs.e2e.test.cjs` passes; the full suite (validation_gates) has no new failure.</verify>
  <done>Tests 1-6 and 18 went RED then GREEN; `planning draft` stdout is still only the path; a stale draft cannot reach writeThrough.</done>
  <recovery>If an existing test that drafts and then publishes now fails as stale, check whether it changes the live file between draft and publish on purpose; if it does, it should re-draft, and if it does not, the base is being written wrongly (compare the sidecar's sha256 with the live file's).</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/planning-drafts.test.cjs plugins/devflow/devflow/bin/lib/planning-drafts-cli.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs.e2e.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs</test_scoped>
<!-- lint/typecheck/build: none in the stack profile. Record the failing set before the first change; only those known
     environment failures (MA-7 handoff-e2e doctl) may remain. If git signing prompts hang micro.test.cjs locally, use
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'. -->
</validation_gates>

<verification>
- SC-1: tests 1-2 show `doc put` refusing a stale draft with the fix named and `planning draft` reseeding it; test 18
  shows the refusal publishes nothing in store mode; tests 3-4 and 6 show normal publishing is unchanged.
</verification>

<success_criteria>
- Tests 1-18 pass (RED first where listed); full suite at baseline.
- `rg -n "checkDraftBase\(" plugins/devflow/devflow/bin/lib/planning-verbs.cjs` finds exactly one call, inside `docPut`.
</success_criteria>

<output>
After completion, publish `69-01-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post 69-01 --from <draft>`,
as execute-trd describes (stamp tokens first). Frontmatter `requirements-completed: [TOOL-06]`.
</output>
