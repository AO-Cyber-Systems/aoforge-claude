---
objective: 46-github-sync-foundations
trd: "06"
type: standard
wave: 2
depends_on: ["46-01", "46-02"]
files_modified:
  - plugins/devflow/devflow/bin/lib/frontmatter.cjs
  - plugins/devflow/devflow/bin/lib/frontmatter.test.cjs
  - plugins/devflow/devflow/bin/lib/sync-state.cjs
  - plugins/devflow/devflow/bin/lib/sync-state.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-pull.cjs
  - plugins/devflow/devflow/bin/lib/gh-pull.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/conflict.cjs
  - plugins/devflow/devflow/bin/lib/conflict.test.cjs
autonomous: true
requirements: [GSF-01, GSF-04, GSF-08]
must_haves:
  truths:
    - "Sync-state keys are objective ids: `recordSync(cwd, '02-a', r)` and `getLastSync(cwd, '2')` address the same record; a file holding both `02-a` and `2` reads as one record (newest `last_synced_at` wins)"
    - "`gh pull 2`, `gh pull 02-a` and `gh pull 002` resolve the same objective, the same v3 mapping entry and the same sync-state baseline"
    - "`gh pull` reads the mapping only through gh-mapping (v1 and v2 files work in memory, `[object Object]` never reaches gh) and the repo through `resolveRepo` (config `github.repo`, then PROJECT.md `github_repo`)"
    - "`gh pull` with `github.enabled` not true returns `skipped:true`, exits 0 and makes zero gh calls"
    - "`setFrontmatterField(path, key, value)` replaces or appends one line inside the first `---` block; every other byte (comments, order, body) is unchanged; an equal value changes neither bytes nor mtime"
    - "`setFrontmatterField(..., {ifAbsentOrEqual:true})` reports `conflict` and keeps the file when a different value exists; a file without frontmatter is left untouched with a warning"
    - "`applyDrift` writes frontmatter through `setFrontmatterField` (comments and order preserved)"
    - "gh-pull's gh calls go through gh-client; `gh-pull._setRunGh(fn)` installs `fn` on the gh-client seam"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/frontmatter.cjs
      provides: "setFrontmatterField(filePath, key, value, opts) -> {ok, changed, conflict?, existing?, warning?}"
    - path: plugins/devflow/devflow/bin/lib/sync-state.cjs
      provides: "id-normalised readSyncState/recordSync/getLastSync"
    - path: plugins/devflow/devflow/bin/lib/gh-pull.cjs
      provides: "cmdGhPull on resolveObjective + readMappingV3 + resolveRepo + requireEnabled + gh-client"
  key_links:
    - "sync-state.cjs → gh-mapping.toObjectiveId / normalizeSyncStateKeys"
    - "gh-pull.cjs → gh-mapping.resolveObjective/readMappingV3, gh-client.requireEnabled/resolveRepo/ghRead/_setRunGh, frontmatter.setFrontmatterField"
    - "46-07 writes `github_issue` back to OBJECTIVE.md with setFrontmatterField (GSF-04)"
    - "conflict.cjs resolvers receive the objective DIR for file paths; their sync-state reads/writes land on the id key via sync-state normalisation"
---

# TRD 46-06: Frontmatter setter; pull, sync-state and conflict resolution on one objective id (GSF-01, GSF-04, GSF-08)

<objective>
Add `frontmatter.setFrontmatterField` (the comment-preserving line setter that 46-07 uses for the `github_issue`
write-back, GSF-04 / defect 4), then move the pull side onto the foundations: sync-state keys normalise to objective ids, `gh pull` resolves
any objective spelling to one id + dir, reads mapping v3 and the configured repo, honours
`github.enabled`, uses the gh-client seam, and writes frontmatter through the shared setter.
gh.cjs is NOT edited here (46-07 owns it); the existing bridge to gh.cjs `requireGhAuth` stays until 46-07.

Purpose: defect 2 (push keyed by ROADMAP number, pull by dir name, so pull never found push's
baseline) and the pull half of defect 8 (`enabled` ignored).
Output: `setFrontmatterField`; rewired `sync-state.cjs`, `gh-pull.cjs`, `conflict.cjs` + tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit before GREEN. Commit via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Mock gh with `gh-pull._setRunGh(buildMockRunGh(...))` or the gh-client seam; restore in `afterEach`. No real GitHub, no real `~/.claude`. Never port 8080.
- Existing gh-pull/sync-state/conflict tests must stay green; change a test only where it encoded a defect (dir-name keys, PROJECT.md-only repo, pull running with github disabled) and say which in the SUMMARY.
- Research reference: `46-RESEARCH.md` → "Other modules", "Migration mechanics" item 7, "Pattern 8: Frontmatter write-back".
- Setter anti-patterns: no `extractFrontmatter`/`reconstructFrontmatter` round trip (drops `# OPTIONAL` comments); no write when nothing changed (mtime churn reads as drift); escape the key before building the line regex.

<embedded_context>

<codebase_examples>
Current pull entry (gh-pull.cjs:286-330):
```js
const { requireGhAuth, _setRunGh: ghSetRunGh } = require('./gh.cjs');
const runGhBridge = _runGh; ghSetRunGh(runGhBridge);      // bridge: keep until 46-07
requireGhAuth(['repo']);
const { readMappingV2 } = require('./gh.cjs');             // replace with gh-mapping.readMappingV3
const entry = mapping.objectives[objectiveId];            // raw arg as key → replace with resolved.id
... projectFm.github_repo ...                              // replace with gh-client.resolveRepo(cwd)
```
`fetchGhIssue(issueRef)` (66-95) calls `_runGh(['issue','view',N,'--repo',R,'--json','state,labels,assignees,milestone,updatedAt'])` → switch to `ghRead`.
`_emit(payload, prose, raw, exitCode)` (29) — keep; for `skipped` use exit 0.
`applyDrift` (202-245) line-regex loop — the pattern the setter factors out:
```js
const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
const lineRe = new RegExp(`^${field}:.*$`, 'm');
yamlBlock = lineRe.test(yamlBlock) ? yamlBlock.replace(lineRe, `${field}: ${serialized}`) : yamlBlock + `\n${field}: ${serialized}`;
```
(it rebuilds the closing separator as `---\n`; the setter must reproduce the original separator exactly). After the setter exists, `applyDrift` should call `setFrontmatterField(objPath, field, serializeYamlValue(ghVal))` per field.
conflict.cjs resolvers take `{cwd, objectiveId, ...}` and use it both for `path.join(..., 'objectives', objectiveId, 'OBJECTIVE.md')`
and for `getLastSync/recordSync` — after this TRD the caller passes the DIR name, and sync-state normalises the key.
</codebase_examples>

<anti_patterns>
- Keying anything by the raw CLI argument.
- Re-implementing id normalisation in sync-state (import `toObjectiveId` / `normalizeSyncStateKeys` from gh-mapping).
- Writing the mapping from `pull` (read-only command; lazy conversion stays in memory).
- Removing the gh.cjs bridge now (gh.cjs still has its own seam until 46-07).
</anti_patterns>

<error_recovery>
- Unknown objective → `{ok:false, error:'objective not found: <arg>'}`, exit 1.
- No mapping entry → message now says `Run \`df-tools gh sync <id>\` first` (not `sync-objectives`).
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/gh-pull.cjs
@plugins/devflow/devflow/bin/lib/sync-state.cjs
@plugins/devflow/devflow/bin/lib/conflict.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-fixtures.cjs
</context>

## Test list

setFrontmatterField (`frontmatter.test.cjs`, new `describe`)
F1. Frontmatter with `# OPTIONAL: set manually` comment lines and no `github_issue:` → key appended as the last frontmatter line; comments, key order and body byte-identical.
F2. Existing `github_issue: o/r#1` → replaced with `o/r#2`; nothing else changes.
F3. Same value already present → `changed:false`; file bytes and `mtimeMs` unchanged.
F4. `{ifAbsentOrEqual:true}`, existing `o/r#1`, new `o/r#2` → `{ok:true, changed:false, conflict:true, existing:'o/r#1'}`, file unchanged.
F5. No frontmatter block → unchanged file, warning. Missing file → `{ok:false}`.
F6. `github_issue` text in the BODY (below the closing `---`) is never touched.
F7. `owner/repo#12` is written unquoted and round-trips through `extractFrontmatter` as the same string.

sync-state
1. `recordSync(tmp,'02-a',r1)` then `getLastSync(tmp,'2')` returns r1; `getLastSync(tmp,'002')` too.
2. On-disk file with keys `02-a` (older) and `2` (newer) → `readSyncState` returns one key `2` with the newer record; `recordSync` rewrites the file with only `2`.
3. Decimal: `recordSync(tmp,'02.1-b',r)` stored under `2.1`, distinct from `2`.
4. Non-objective keys (unparseable) are kept verbatim (defensive; no data loss).

gh-pull
5. Temp project with mapping v2 `{"objectives":{"2":{"issue_id":7,"state_comment_id":null}}}`, config enabled repo `o/r`:
   `pull 02-a`, `pull 2`, `pull 002` each call `issue view 7 --repo o/r ...`; no argv element contains `[object Object]`.
6. Mapping v1 `{"objectives":{"2":7}}` → same as 5.
7. `recordSync` from a push-style id key (`2`) is found as the baseline by `pull 02-a` (no `first_sync` flag).
8. Repo from config `github.repo` when PROJECT.md lacks `github_repo`; PROJECT.md used as fallback.
9. `github.enabled:false` → stdout JSON `{skipped:true}`, exit 0, mock `calls().length === 0`.
10. Unknown objective → exit 1; missing mapping entry → exit 1 with `gh sync` in the message.
11. `--apply` drift on an OBJECTIVE.md with `# OPTIONAL` comment lines → changed field updated, comment lines byte-identical.
12. `gh-pull._setRunGh(fake)` → a call made via `require('./gh-client.cjs').ghRead` hits `fake`.

conflict
13. `resolveGh({cwd, objectiveId:'02-a', ...})` writes OBJECTIVE.md in `02-a` and records sync-state under `2`.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: setFrontmatterField and id-normalised sync-state keys (tests F1-F7, 1-4)</name>
  <files>plugins/devflow/devflow/bin/lib/frontmatter.cjs, plugins/devflow/devflow/bin/lib/frontmatter.test.cjs, plugins/devflow/devflow/bin/lib/sync-state.cjs, plugins/devflow/devflow/bin/lib/sync-state.test.cjs</files>
  <action>
RED: tests F1-F7 (frontmatter.test.cjs) and 1-4 (sync-state.test.cjs). Commit RED.

GREEN (setter): add and export `setFrontmatterField(filePath, key, value, opts = {})` in `frontmatter.cjs`:
1. Read; match `/^---\r?\n([\s\S]*?)\r?\n---/` at file start, capturing offsets so the rebuild is byte-exact.
2. `lineRe = new RegExp('^' + escapeRe(key) + ':[ \\t]*(.*)$', 'm')` over the captured block.
3. Present: compare with the trimmed, unquoted existing value. Equal → `{ok:true, changed:false}`. `opts.ifAbsentOrEqual` and different → conflict. Else replace the line.
4. Absent: append `\n${key}: ${value}` to the block.
5. Splice the block back at the same offsets; `fs.writeFileSync` only when content differs. Existing exports unchanged.

GREEN (sync-state): `readSyncState` passes parsed objectives through `gh-mapping.normalizeSyncStateKeys`, wrapped so unparseable keys are kept
verbatim (gh-mapping.cjs is not in this TRD's files — wrap, do not edit it). `recordSync`/`getLastSync` key through
`toObjectiveId(objectiveId) || objectiveId`. `writeSyncState` unchanged (still `version: 1`).
# CRITICAL: gh-mapping requires sync-state (atomicWrite) at module top, so sync-state must `require('./gh-mapping.cjs')` lazily INSIDE its functions — a top-level require is a cycle.
  <verify>node --test plugins/devflow/devflow/bin/lib/frontmatter.test.cjs plugins/devflow/devflow/bin/lib/sync-state.test.cjs</verify>
  <done>Tests F1-F7 and 1-4 pass with all existing frontmatter and sync-state tests.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: gh pull on resolveObjective, mapping v3, resolveRepo, enabled gate and the client seam (tests 5-12)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-pull.cjs, plugins/devflow/devflow/bin/lib/gh-pull.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-fixtures.cjs</files>
  <action>
RED: tests 5-12. Update `buildTempProject` in `gh-pull-fixtures.cjs` to accept `{githubEnabled = true, repo = 'o/r', mapping}` and write
`.planning/config.json` accordingly (existing callers get an enabled config so their assertions keep meaning). Commit RED.

GREEN in `cmdGhPull(cwd, args, raw)`:
1. Parse args as today (keep `hasHelpFlag`-style `--help` handling if present).
2. `gate = requireEnabled(cwd)`; skipped → `_emit({ok:false, skipped:true, reason}, reason+'\n', raw, 0)`; return.
3. `resolved = resolveObjective(cwd, arg)`; null → exit 1.
4. Auth via the existing bridge (unchanged), then `mapping = readMappingV3(cwd)`; `entry = getEntry(mapping, resolved.id)`.
5. `repo = gate.repo` (already `resolveRepo`); `issueRef = ${repo}#${entry.issue_id}`.
6. Use `resolved.dir` for every OBJECTIVE.md path and pass `objectiveId: resolved.dir` to conflict resolvers; sync-state calls pass `resolved.id`.
7. `_setRunGh(fn)`: set local runner AND `require('./gh-client.cjs')._setRunGh(fn)`; `fetchGhIssue` uses `ghRead`.
8. `applyDrift` uses `setFrontmatterField` per field (keep its return shape `{ok, applied}`).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-pull.test.cjs</verify>
  <done>Tests 5-12 pass; existing gh-pull tests green (fixture now enables github).</done>
  <recovery>If an existing test depends on PROJECT.md-only repo resolution, keep it (resolveRepo falls back to PROJECT.md) and give the fixture no config repo for that test.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Conflict resolvers on dir paths + id-keyed sync-state (test 13)</name>
  <files>plugins/devflow/devflow/bin/lib/conflict.cjs, plugins/devflow/devflow/bin/lib/conflict.test.cjs</files>
  <action>
RED: test 13 (plus: `resolveDisk` still calls `gh.cmdGhSyncObjective(cwd, objectiveId, true)` via live require — keep the monkey-patch point). Commit RED.

GREEN: minimal — document in the resolver headers that `objectiveId` is the objective DIR (for paths) and that sync-state keys normalise;
update any user-facing message that tells the user to run `gh sync-objectives` to `gh sync <id>`. No logic change if test 13 already passes after Task 1 —
in that case commit the test as a regression guard and note "no production change needed" in the SUMMARY.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/conflict.test.cjs plugins/devflow/devflow/bin/lib/gh-pull.test.cjs plugins/devflow/devflow/bin/lib/sync-state.test.cjs</verify>
  <done>Test 13 passes; conflict, pull and sync-state suites green.</done>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/frontmatter.test.cjs plugins/devflow/devflow/bin/lib/sync-state.test.cjs plugins/devflow/devflow/bin/lib/gh-pull.test.cjs plugins/devflow/devflow/bin/lib/conflict.test.cjs</test>
</validation_gates>

<verification>
- `rg -n "readMappingV2|projectFm.github_repo" plugins/devflow/devflow/bin/lib/gh-pull.cjs` → no matches (repo comes from `requireEnabled`/`resolveRepo`).
- `rg -n "sync-objectives" plugins/devflow/devflow/bin/lib/gh-pull.cjs plugins/devflow/devflow/bin/lib/conflict.cjs` → no matches.
</verification>

<success_criteria>
Pull finds push's mapping entry and baseline by one id, whatever spelling the user types.
</success_criteria>

<output>
After completion, create `.planning/objectives/46-github-sync-foundations/46-06-SUMMARY.md`
</output>
