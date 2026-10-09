# Objective 46: GitHub sync foundations - Research

**Researched:** 2026-09-30
**Domain:** DevFlow `gh` integration (Node CJS CLI over the `gh` binary), GitHub REST/GraphQL behaviour
**Confidence:** HIGH on code structure and defects (read directly), MEDIUM on GitHub rate-limit and search behaviour (docs plus community evidence, not live-tested)

<user_constraints>
## User Constraints (from orchestrator; no CONTEXT.md exists for this objective)

### Locked Decisions
- Design source: `docs/PROPOSAL-github-system-of-record.md` (decisions locked 2026-09-30; do not re-litigate).
- Consolidate commands NOW: fold `gh sync-objectives` into `gh sync` (per objective, or `--all`); keep `sync-objectives` as a deprecated alias. `comment`, `close-issue`, `pull`, `resolve`, `status`, `sync-release` remain but move to the one v3 mapping and one body builder.
- Mapping migration: convert v1/v2 entries locally in place to v3; on first sync verify each issue by its `<!-- devflow:id=… -->` marker and add the marker if missing. No rebuild-from-GitHub.
- Strict TDD (kind `plugin`). Tests mock `gh` via `_setRunGh`; never call real GitHub or touch the real `~/.claude`. Never use port 8080.

### Claude's Discretion
- Module decomposition, marker/section syntax, cache location and TTL, retry constants, wave breakdown, whether the mapping conversion is a migration and/or lazy.

### Deferred Ideas (OUT OF SCOPE, objectives 47+)
- Issue types, sub-issue hierarchy for TRDs, outbox, wiki, cache model, branch/PR lifecycle, `gh setup`/rulesets.
</user_constraints>

<phase_requirements>
## Objective Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GSF-01 | Mapping v3 keyed by stable id, one shape, migration v1/v2 | Sections "Mapping v3", "Migration mechanics"; defects 1-2 |
| GSF-02 | `devflow:id` marker in every body/comment; marker-lookup fallback | "Marker + managed sections", "Marker lookup" (list-and-scan, NOT search) |
| GSF-03 | Post-execute sync passes dir, surfaces failures | Defect 3; workflow lines 1001-1008; shim-based CLI test |
| GSF-04 | `github_issue` written back to OBJECTIVE.md | Defect 4; line-regex frontmatter writer pattern from `applyDrift` |
| GSF-05 | Milestone from current milestone; cache invalidates | "Current milestone" section |
| GSF-06 | One body builder, managed sections, human text preserved | "Marker + managed sections" |
| GSF-07 | Project/field IDs discovered via GraphQL, cached w/ TTL | "Project field discovery" |
| GSF-08 | Pacing, retry/backoff, pagination, `github.enabled` gate, exit codes | "gh client", "Rate limits" |
</phase_requirements>

## Summary

The GitHub integration is two generations of code glued together inside `plugins/devflow/devflow/bin/lib/gh.cjs` (1739 lines): generation 1 (`cmdGhSyncObjectives`, `cmdGhComment`, `cmdGhCloseIssue`, `cmdGhSyncRelease`, `formatIssueBody`, `readMapping`/`writeMapping`) speaks mapping v1 (`objectives: {"N": issue#}`) and keys by ROADMAP number; generation 2 (`syncObjective`, `buildIssueBody`, `readMappingV2`/`writeMappingV2`, sticky comment, Project fields) speaks v2 (`{issue_id, state_comment_id}`) and keys by `parseInt(dir prefix)`. `gh-pull.cjs`/`sync-state.cjs`/`conflict.cjs` key by the full dir name. Every one of the eight listed defects is confirmed below with file:line. The fix is structural: one id normalizer, one mapping module, one body module, one client (pacing/retry/pagination/enabled-gate) behind a single `_runGh` seam, then rewire the commands onto them.

All three of `comment`, `close-issue`, `sync-release` call the raw `runGh` (not the `_runGh` seam) so they are currently untestable without real GitHub; they must move to the seam as part of this objective.

**Primary recommendation:** Build four small new modules (`gh-client.cjs`, `gh-mapping.cjs`, `gh-body.cjs`, `gh-project.cjs`) test-first in a parallel first wave, then a single second wave that rewires `gh.cjs`/`gh-pull.cjs`/`sync-state.cjs`/`df-tools.cjs` onto them and folds `sync-objectives` into `sync`. Do the mapping conversion BOTH as an idempotent `auto` migration 0009 and lazily on read (same pure function). Find lost issues by list-and-scan on label, not by GitHub search.

## Code Map (verified by reading; line numbers as of HEAD 5055dc6)

### `lib/gh.cjs`
| Lines | Symbol | Notes |
|---|---|---|
| 33-58 | `readConfig`, `readMapping`, `writeMapping` | `readMapping` returns `objectives` verbatim: numbers (v1) or objects (v2) pass through. Root of defect 1 |
| 60-80 | `runGh`, `_runGh`, `_setRunGh` | Only ONE seam per module. `gh-pull.cjs` has its own `_runGh` and bridges into gh.cjs at call time (gh-pull.cjs:288-291) |
| 149-200 | `requireGhAuth(scopes)` | Throws `GhAuthError`; used by `syncObjective`, `cmdGhResolve`, `cmdGhPull`. `syncObjective` requires `['project','read:project','repo']` so a repo-only token cannot sync at all |
| 629-646 | `ghStatus(cwd)` | Reads `config.github.{enabled,repo,labels,milestone_prefix}`. Calls `spawnSync('which','gh')` directly (NOT mockable), then `_runGh(['auth','status'])` (mockable) |
| 651-679 | `listObjectives` | Parses ROADMAP `### Objective N: name`; `number` is the ROADMAP string ("0", "2.1") |
| 689-696 | `getMilestoneVersion` | `content.match(/v(\d+\.\d+)/)` = first `vX.Y` anywhere. In this repo returns `v1.1`. Defect 5 |
| 699-712 | `formatIssueBody` | gen-1 body, overwrites entire body. Defect 6 |
| 721-846 | `cmdGhSyncObjectives` | Milestone create/lookup cached in `mapping.milestone_id` forever (line ~747); `gh issue edit String(existingIssue)` at ~773-779 -> `[object Object]` for v2 entries; never touches OBJECTIVE.md frontmatter (defect 4); records sync-state keyed by ROADMAP number; `output(result, raw, '')` exits 0 even when items failed |
| 849-861 | `_findObjectiveDir(cwd, n)` | prefix match on zero-padded or plain number (good seed for the id resolver) |
| 863-902 | `cmdGhComment` | `mapping.objectives[key]` returns object for v2 -> `String(issue)` = `[object Object]` (~877-880). Uses raw `runGh` |
| 905-920 | `cmdGhCloseIssue` | Same defect (~912). Raw `runGh` |
| 923-1010 | `cmdGhSyncRelease` | Raw `runGh` (release view/edit/create) |
| 1017-1050 | `readMappingV2`/`writeMappingV2` | Converts numbers to objects on read but `writeMappingV2` writes numbers back unchanged |
| 1053-1089 | `buildIssueBody` | gen-2 body. Overwrites entire body. Footer path uses `state.objectiveId` |
| 1092-1140 | `buildStickyComment`/`findStickyComment` | Marker `<!-- df:state -->\n` via `startsWith`. `findStickyComment` fetches ONE page of comments (`repos/o/r/issues/N/comments`, default 30). Defect 8 |
| 1144-1190 | `upsertStickyComment` | PATCH by id, else scan, else create |
| 1193-1214 | `PRODUCT_ROADMAP_FIELDS` | IIFE at module load reading `__fixtures__/gh-cassettes/product-roadmap-fields.json`, hardcoded `_project_id: 'PVT_kwDODwqLrc4BRsOP'`. Also consumed by `awareness.cjs` (`scanOrg` default project id) and tests K1-K*, `awareness.test.cjs` O2. Defect 7 |
| 1224-1308 | `updateProjectFields` | Gate `PRODUCT_ROADMAP_FIELDS._captured`; only single-select options; adds item (`addToProject`) then one mutation per field |
| 1311-1400 | `readObjectiveState` | dir -> state; derives `number` with `parseInt` of dir prefix (so "02.1-x" becomes "2") |
| 1411-1505 | `syncObjective(objectiveId=dir, root)` | Requires `objFm.github_issue` else `ok:false` "run df:gh-sync objectives" (chicken-and-egg with defect 4); reads `mapping.objectives[state.number]` (parseInt key); does not consult `github.enabled`; builds `.planning/objectives/<id>/OBJECTIVE.md` from its first argument |
| 1507-1550 | `cmdGhSyncObjective` | JSON error to stderr + exit 1 (good); `GhAuthError` handled |
| 1557-1686 | `walkProject` | Paginated GraphQL read (reference implementation of `pageInfo` pagination with MAX_PAGES guard) |
| 1692-1739 | exports | `_runGh` exported as a forwarding wrapper (so other modules pick up injected mocks) |

### Other modules
- `gh-pull.cjs` (547 lines): own `_runGh`/`_setRunGh`; `cmdGhPull` at 260; mapping read at 307-310 via `readMappingV2` keyed by the raw arg (dir name); repo from **PROJECT.md `github_repo`** (line ~320), not `config.github.repo`; sync-state via `getLastSync(cwd, objectiveId)` (dir name); `recordSync` at 412 and 488; `_emit` exits only when code != 0; `applyDrift` writes frontmatter by line-regex (good pattern to reuse for GSF-04).
- `sync-state.cjs` (189 lines): `.planning/.gh-sync-state.json` `{version:1, objectives:{<key>:record}}`; `readSyncState`/`writeSyncState`(atomic tmp+rename)/`recordSync`/`getLastSync`/`hashFrontmatter`. Key is whatever the caller passes (ROADMAP number from push, dir name from pull) so push baselines are invisible to pull: the drift/conflict engine never had a baseline when entries came from `sync-objectives`.
- `conflict.cjs` (308 lines): consumes `recordSync`/`getLastSync` keyed by dir name; `resolveDisk` calls `gh.cmdGhSyncObjective(cwd, objectiveId, true)` via live `require` (test monkey-patch point, conflict.cjs:156-165).
- `pm-backend.cjs` (47 lines): `getBackend(cfg)` returns `require('./gh.cjs')`; not wired to call sites. Keep `gh.cjs` exporting everything it exports today.
- `helpers.cjs:25` `output(result, raw, rawValue, exitCode=0)`: the 4th argument already exists. Legacy commands just never pass it. NOTE: `output(result, raw=true, '')` prints the empty string (rawValue `''` is not `undefined`), so `--raw` output of legacy commands is blank today. Preserve or fix deliberately; do not change by accident.
- `df-tools.cjs:1067-1101`: dispatch. `sync` with an arg -> `cmdGhSyncObjective`; `sync` with no arg -> `cmdGhSyncObjectives`; error string lists subcommands. `help.cjs:260` HELP_TABLE `gh` usage string must be updated too.

### Call sites
| Site | Command | Arg passed |
|---|---|---|
| `workflows/execute-objective.md:1001-1008` | `gh sync "${OBJECTIVE_NUMBER}" 2>/dev/null \|\| echo "Note: ... skipped"` | objective NUMBER (defect 3: `cmdGhSyncObjective` needs the dir name; result `objective not found` goes to stderr which is discarded). Gate is `grep -qE '^github_issue:'` so it only runs once frontmatter has the ref, which `sync-objectives` never writes (defect 4): the whole post-execute path is dead in practice |
| `workflows/new-project.md:1109-1121` | `gh sync-objectives`, then `commit --files .planning/.gh-mapping.json` | none |
| `skills/gh-sync/SKILL.md:35-52` | `gh sync-objectives`, `gh sync-release "$TAG"`, `gh sync "$OBJECTIVE_ID"`, commit mapping | dir id; skill text describes modes `objectives`, `release`, `status`, `<id>` |
| `agents/verifier.md:853-857` | `gh comment "$OBJECTIVE_NUM" "@file:$VERIFICATION_PATH"`, `gh close-issue "$OBJECTIVE_NUM" "Verified: ..."` | objective NUMBER (works only via mapping key == number) |
| `skills/flow/SKILL.md:74-79` | chain prose only (`/devflow:gh-sync {N}`, `gh-sync sync-release {tag}`) | prose; no code |
| `hooks/route-intent.js:254` | routing regex only | n/a |
| `conflict.cjs:156-165`, `:259-295` | `cmdGhSyncObjective` call + messages | dir name |
| `templates/objective.md:87` | docs: "auto-populated by df:gh-sync when missing (v1.2 - for now, set manually)" | docs to update |

### Tests and mocking
- `gh.test.cjs` (2668 lines), `gh-pull.test.cjs` (437), `sync-state.test.cjs`, `conflict.test.cjs`, `pm-backend.test.cjs`.
- Seam: `gh._setRunGh(fn)` / `gh._setRunGh(null)` to restore; `gh-pull._setRunGh`. Mock builder: `__fixtures__/gh-fixtures.cjs` `buildMockRunGh(Map<argsJoined, {ok,status,stdout,stderr}>)` - exact key, then longest-prefix match, default `{ok:false, stderr:'[mock] no match for: ...'}`; `.calls()` returns the recorded call list. Other fixtures: `gh-pull-fixtures.cjs` `buildTempProject`, `sync-state-fixtures.cjs`, `upgrade-fixtures.cjs` (`makeV1Project`, `makeFakeHome`).
- CLI-level tests capture output by monkey-patching `process.stdout.write` and `process.exit` (gh.test.cjs ~660-800, ~1900-1915).
- Existing test **D3** (gh.test.cjs:1208-1239) asserts `cmdGhSyncObjectives` on a disabled config emits `skipped:true` and does NOT call `process.exit(1)`. GSF-08's "legacy commands exit non-zero on ok:false" must therefore exclude `skipped:true` (disabled/no-gh = exit 0 with `skipped`). Recommended rule: `ok:false && !skipped` -> exit 1; `skipped` -> exit 0.
- Existing tests K1-K*/B-group seed `PRODUCT_ROADMAP_FIELDS._captured = true` and `awareness.test.cjs` O2 reads `PRODUCT_ROADMAP_FIELDS._project_id`. Replacing the constant requires updating those tests in the same TRD (keep a deprecated export that returns `{_captured:false}` or remove and fix tests; do not leave it reading the fixture).
- `ghStatus` uses real `which gh` => any new test of an enabled flow fails on a machine without `gh`. Route the presence check through the seam (e.g. `_runGh(['--version'])`) so tests are hermetic.
- Baseline: `npm test` currently has exactly one failing test, `MA-7 doctl auth init` in `handoff-e2e.test.cjs` (pre-existing, environmental). Anything else red after this objective is a regression.
- Shim precedent for CLI-level tests: `__fixtures__/{launchctl,osascript,systemctl,notify-send}-shim.cjs`. A `gh` shim (executable script in a temp dir prepended to `PATH`, recording argv to a file and answering from a canned table) gives real exit-code coverage of `df-tools gh ...` and of the execute-objective workflow step (GSF-03) without touching GitHub.

## Standard Stack

No new npm dependencies (DevFlow is zero-dependency CJS; keep it that way).

| Piece | Choice | Why |
|---|---|---|
| Runtime | Node built-ins: `fs`, `path`, `child_process.spawnSync`, `crypto` | existing convention: sync I/O, CJS |
| GitHub access | `gh` CLI (`gh api`, `gh issue`, `gh api graphql`) via the injectable `_runGh` | existing seam; auth handled by gh |
| Sleep | `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)` | synchronous, non-busy; df-tools is fully sync. Inject `_setSleep`/`_setNow` for tests (fake clock) |
| Tests | `node:test`, `node:assert/strict`, `gh-fixtures.cjs`, new `gh` PATH shim | repo standard |

### New modules (recommended)
| Module | Owns | Requirement |
|---|---|---|
| `lib/gh-client.cjs` | the single `_runGh` seam, `ghWrite` (pace + retry), `ghRead`, `ghPaginate`, `isSecondaryLimit(stderr)`, `parseRetryAfter`, `_setSleep/_setNow`, `requireEnabled(cwd)` | GSF-08 |
| `lib/gh-mapping.cjs` | `toObjectiveId`, `resolveObjective`, `readMappingV3`, `writeMappingV3`, `migrateMapping(raw)` (pure), entry helpers | GSF-01 |
| `lib/gh-body.cjs` | marker constants, `buildObjectiveSections(state)`, `mergeManaged(existingBody, sections, id)`, `buildStateComment`, `extractMarker` | GSF-02, GSF-06 |
| `lib/gh-project.cjs` | `discoverProjectFields(projectId)`, TTL cache, `resolveFieldValue(fields, name, value)` | GSF-07 |
| `lib/migrations/0009-gh-mapping-v3.cjs` | disk conversion, `auto` | GSF-01 |

`gh.cjs` keeps its public exports (others depend on them: `awareness.cjs`, `conflict.cjs`, `gh-pull.cjs`, `pm-backend.cjs`, tests) and becomes a thin command layer. `gh.cjs._setRunGh` and `gh-pull._setRunGh` must both keep working and both must set the ONE client-module seam (delete the gh-pull bridge at 288-291 once they share it).

## Architecture Patterns

### Pattern 1: One identity function, used at every boundary (GSF-01)
**What:** `toObjectiveId(arg)` returns the canonical key; `resolveObjective(cwd, arg)` returns `{id, dir, roadmapNumber}` from ANY of: `"46"`, `"046"`, `"46-github-sync-foundations"`, `"2.1"`, `"02.1-foo"`, `"0"`/`"00-refine-defaults-table"`.
**Rule:** id = dir-name prefix `^(\d+)(\.\d+)?` with leading zeros stripped from the integer part (`"00"`->`"0"`, `"02.1"`->`"2.1"`, `"46-02"` (TRD id) stays `"46-02"` for the future `trds` map). This equals the ROADMAP number, so existing v1 keys are already canonical, and this repo's mapping key `"0"` stays valid.
**Every** entry point (`sync`, `comment`, `close-issue`, `pull`, `resolve`, conflict resolvers, sync-state read/write) calls `resolveObjective` first and then uses `.id` for mapping/sync-state and `.dir` for file paths. No module may `parseInt` a dir prefix or use a dir name as a mapping key again (a repo test can grep for it).
**Why:** defect 2's three key spaces collapse to one; decimals stop colliding (`parseInt("02.1")` is 2).

### Pattern 2: Mapping v3
```json
{
  "version": 3,
  "repo": "owner/name",
  "milestones": { "v1.4": 7 },
  "objectives": {
    "46": { "issue_id": 123, "state_comment_id": 456, "verified_at": "ISO|null" }
  },
  "trds": {}
}
```
- Keep `issue_id`/`state_comment_id` names so v2 readers in not-yet-upgraded plugin copies still parse objective entries (they only need `objectives[k].issue_id`); additive fields only.
- `milestones` is a map keyed by milestone TITLE. Replaces the single never-invalidated `milestone_id` (GSF-05): a different current milestone is simply a different key; a stale number is re-verified with `GET repos/o/r/milestones?state=all` (paginated) when a create returns 422 already_exists (existing behaviour).
- `verified_at: null` means "marker not yet confirmed on GitHub" (set by migration); first sync fetches the issue body, checks for `devflow:id=<id>`, adds it if missing (locked decision), and sets `verified_at`.
- `trds: {}` reserved for objective 47; do not populate now.
- Writer is atomic (tmp+rename; reuse `sync-state.atomicWrite`) and sorts keys numerically for stable diffs (the file is tracked in git; objective 47 later untracks).
- Unknown higher `version` -> refuse to write (return error), do not silently downgrade.

### Pattern 3: Marker and managed sections (GSF-02, GSF-06)
**Marker (issue body line 1 and every DevFlow comment line 1):** `<!-- devflow:id=46 -->` for objective issues; comments add a kind: `<!-- devflow:id=46 kind=state -->`, `kind=verification`. TRD form `devflow:id=46-02` is already reserved by the proposal.
**Sections:**
```
<!-- devflow:id=46 -->
<!-- devflow:begin summary -->
**Objective 46: GitHub sync foundations**
**Goal:** ...
**Status:** 2/5 TRDs done, current wave 1, last commit abc1234
<!-- devflow:end summary -->
<!-- devflow:begin criteria -->
- [x] SC-1: ...
<!-- devflow:end criteria -->
<!-- devflow:begin trds -->
- [ ] 46-01-... - brief
<!-- devflow:end trds -->

(anything a human writes here, above, or between sections is preserved)
```
**`mergeManaged(existingBody, sections, id)` algorithm (pure, deterministic, idempotent):**
1. If `existingBody` is empty/null: emit marker + all sections in fixed order + footer.
2. Else for each section name: if a well-formed begin/end pair exists (regex on `<!-- devflow:begin NAME -->[\s\S]*?<!-- devflow:end NAME -->`, first match only) replace ONLY the inner text; if absent, append that section at the end of the body separated by a blank line (never reorder human content).
3. Ensure the marker exists: if the body lacks `devflow:id=` add it as the first line; if it has a DIFFERENT id, abort with an error (wrong issue) rather than overwrite.
4. Malformed pair (begin without end): treat as absent and append a fresh section; report a warning; never delete text.
5. Normalise only `\r\n`->`\n` for comparison; compare merged result to existing and SKIP the `gh issue edit` when equal (saves a content-creating request and prevents `updated_at` churn that `gh pull` interprets as drift).
**Footer** (`_Tracked by DevFlow_...`) goes inside a `footer` managed section so it is not duplicated.
**Legacy bodies** (gen-1/gen-2 output, no markers): first sync after migration treats the whole old body as human text and appends marked sections below it; do NOT try to parse and remove old generated text (risk of eating human edits). Document the one-time duplication and offer `--replace-legacy-body` only if the planner wants it (recommend not).
**Sticky comment:** new marker `<!-- devflow:id=46 kind=state -->`; `findStickyComment` must accept BOTH the new marker and legacy `<!-- df:state -->` so existing comments (e.g. id 4374249280 in this repo's mapping) are edited in place, then rewritten with the new marker.
**Encoding pitfall:** pass bodies with `-f body=...` (raw string) for `gh api`, or `--body`/`--body-file` for `gh issue`. `-F body=@file` reads a file; a body starting with `@` via `-F` would be interpreted as a path. Keep using `-f`/`--body` (existing behaviour), never `-F` for free text. Bodies are capped at 65,536 chars; the builder should assert < 60,000 and fail loudly.

### Pattern 4: Marker lookup when the mapping is lost (GSF-02)
**Do not rely on GitHub search.** Official docs for `in:body` say nothing about HTML comments; informal sources say content inside `<!-- -->` is not indexed, and I could not confirm either way (LOW confidence). Search also lags indexing. The design must not depend on it.
**Use list-and-scan:** `gh issue list --repo R --label devflow:objective --state all --limit 1000 --json number,title,body,milestone` (REST alternative: `gh api --paginate --slurp "repos/R/issues?labels=devflow:objective&state=all&per_page=100"`), then regex the raw `body` for `<!-- devflow:id=(\S+?)( |-->)`. Build `{id -> issue}`; if two issues carry the same id, stop and report (never pick silently). Fallback 2 for issues created before markers existed: title match `^\[Objective <number>\]` within the label set, then add the marker.
Order of resolution in `findOrCreateObjectiveIssue`: mapping entry (verify with one `issue view --json number,body`) -> frontmatter `github_issue` ref -> marker scan -> title scan -> create. Only the last step creates, so "delete `.gh-mapping.json` and re-run" yields zero duplicates (success criterion 2). Cache the scan result per process (one list call per `sync --all`, not per objective).
Note `gh issue list` paginates internally up to `--limit`; label filter keeps it bounded. `gh issue list --search` is not needed.

### Pattern 5: `gh` client (GSF-08)
```js
// lib/gh-client.cjs  (sketch)
const MIN_WRITE_INTERVAL_MS = 1000;
let lastWriteAt = 0;
function ghWrite(args, opts) {            // args: any mutating gh invocation
  for (let attempt = 0; ; attempt++) {
    const wait = lastWriteAt + MIN_WRITE_INTERVAL_MS - now();
    if (wait > 0) sleep(wait);
    const r = _runGh(args, opts);          // the ONE seam
    lastWriteAt = now();
    if (r.ok || !isSecondaryLimit(r) || attempt >= MAX_RETRIES) return { ...r, attempts: attempt + 1 };
    sleep(retryDelayMs(r, attempt));       // retry-after if parsed, else 60s * 2^attempt, capped
  }
}
```
- **Writes are serialised by construction:** df-tools is synchronous and single-process, so "no concurrent writes" (success criterion 4) holds as long as every mutation goes through `ghWrite` and nothing spawns `gh` async. Add a repo-level test that greps `gh.cjs`/`gh-pull.cjs` for direct `runGh(`/`spawnSync('gh'` outside the client.
- **What is a write:** `issue create|edit|comment|close`, `label create`, `release create|edit`, `api ... -X POST|PATCH|PUT|DELETE` or any `-f/-F` field without `--method GET`, and every GraphQL `mutation`. Reads (`issue view|list`, `api` GET, GraphQL query) are not paced but are retried on the same classifier.
- **Classification:** `isSecondaryLimit(r)` = `!r.ok` AND stderr/stdout matches `/secondary rate limit|abuse detection|temporarily blocked from content creation/i`, or (`HTTP 403|HTTP 429` AND `/rate limit/i`). A bare 403 without rate-limit wording is a permission error: fail fast (do not retry; other projects that retried all 403s masked real auth errors).
- **Delay:** GitHub's documented order: honour `retry-after` (seconds) if present; else if `x-ratelimit-remaining` is 0 wait until `x-ratelimit-reset` (epoch seconds); else wait at least 60 s; then exponential backoff; cap attempts (recommend 4) and then return the failure. **`gh` exits 1 for every HTTP failure and only `gh api --include` exposes response headers (on stdout, before the body).** `gh issue ...` subcommands surface only the message text. So: implement `parseRetryAfter(r)` to read a `retry-after: N` header line from `r.stdout`/`r.stderr` when present (works for `gh api --include`), and otherwise fall back to the 60 s minimum with exponential growth. Tests inject the 403 response text and a fake sleep and assert the delay.
- **Docs limits to encode as constants:** 80 content-creating requests/min, 500/h (secondary), so 1 write/s keeps us under 60/min; add a per-process counter that throws a clear error past 450 writes in a run (leaves headroom; objective 47's outbox owns hourly budgeting).
- **Pagination:** `ghPaginate(path)` uses `gh api --paginate --slurp <path>` and flattens (`--slurp` wraps every page in an outer array; without it `--paginate` prints concatenated arrays `[..][..]` which `JSON.parse` rejects). `--slurp` exists in current gh (docs: valid only with `--paginate`); if an older gh rejects it, fall back to per-page loop `?per_page=100&page=N` until a short page. Use it for comments (fixes `findStickyComment`), milestones, label lists. GraphQL pagination keeps the `pageInfo { hasNextPage endCursor }` loop already in `walkProject`.
- **Enabled gate:** `requireEnabled(cwd)` returns `{enabled, repo,...}` or `{skipped:true, reason}`; called first by `sync`, `pull`, `resolve`, `comment`, `close-issue`, `sync-release`, `sync-objectives` alias. `status` alone stays informational. Repo = `config.github.repo` with fallback to PROJECT.md `github_repo` (pull currently uses only the latter; make one `resolveRepo(cwd)`).
- **Exit codes:** result emitter: `skipped` -> exit 0; `ok:false` -> exit 1; partial failure in `--all` (some objectives failed) -> exit 1 with per-objective results in the JSON so callers can see which. Use `output(result, raw, rawValue, exitCode)`.

### Pattern 6: Current milestone (GSF-05), one source
`roadmap.cjs` already exports `getMilestoneInfo(cwd)` (objective 40-01): parses the `## Milestones` bullet list, picks `🚧`, then "in progress/current", then highest `✅`, then lowest `📋`. It is the project's single milestone resolver (init.cjs uses it). **Do not write another one; delete `getMilestoneVersion`.**
But it answers "what is the project's current milestone", which is wrong for a not-yet-started milestone: this repo's ROADMAP has no 🚧 bullet, so it returns `v1.3` (highest ✅) while objective 46 declares `milestone: v1.4` (📋).
**Recommendation (precedence):** (1) the objective's own OBJECTIVE.md frontmatter `milestone:` (this field is set and is the truth for that objective), (2) `getMilestoneInfo(cwd).version`, (3) no milestone (create issue without one, warn) - never default to `v1.0`. Title = `milestone_prefix + version.replace(/^v/,'')`, so prefix `v` + `v1.4` -> `v1.4` (today's code double-strips correctly; keep). Mapping cache keyed by title (Pattern 2). STATE.md does not carry a reliable machine-readable milestone (free prose in "Current Position"), and `state.json` has none: do not use them.

### Pattern 7: Project field discovery (GSF-07)
Project id source: `org_project` from OBJECTIVE.md/PROJECT.md (already `PVT_...` node ids; resolveChain handles inheritance). Query by node id (no org/number lookup needed):
```graphql
query($id: ID!, $cursor: String) {
  node(id: $id) { ... on ProjectV2 {
    fields(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ... on ProjectV2Field { id name dataType }
        ... on ProjectV2SingleSelectField { id name options { id name } }
        ... on ProjectV2IterationField { id name configuration { iterations { id title startDate duration } completedIterations { id title startDate duration } } }
      }
    }
  } }
}
```
(Shapes verified against GitHub docs "Using the API to manage Projects": `fields(first: 20){nodes{... on ProjectV2Field{id name} ... on ProjectV2IterationField{id name configuration{iterations{startDate id}}} ... on ProjectV2SingleSelectField{id name options{id name}}}}`; `dataType`, `duration`, `completedIterations` are from the schema, MEDIUM - verify with one introspection during implementation via `__type(name:"ProjectV2IterationFieldConfiguration")`.)
Result model: `{ project_id, fetched_at, fields: { "<name>": { id, kind: 'text'|'single_select'|'iteration', options: {name->id}, iterations: {title->id} } } }`.
Value mutation shapes (docs): single select `value: { singleSelectOptionId: $o }`; iteration `value: { iterationId: $i }`; a project item must be added first (`addProjectV2ItemById`), it cannot be combined with the update. Assignees/Labels/Milestone/Repository are not settable through this mutation.
Generic lookup: `resolveFieldValue(fields, 'Quarter', 'Q3 2026')` matches option name (single select) or iteration title; an unknown option is a WARNING (skip, never fail the sync) and is what happens today, but it now reflects live options, so quarters past Q4 2027 just work once the project owner adds them.
**Cache:** out of the repo, like the awareness store: `$DEVFLOW_GH_CACHE_DIR` else `~/.claude/devflow/state/gh-project/<projectId>.json`, atomic write, TTL 6 h (config `github.project_cache_ttl_minutes`), `--refresh`/automatic refresh-once when a wanted option is missing (handles "owner just added Q1 2028"). Tests set `DEVFLOW_GH_CACHE_DIR` to a temp dir. Do NOT put it in `.planning/` (hooks audit `planning-writes.audit.test.js` forbids runtime dotfiles from hooks, and objective 47 makes `.planning/` a non-committed cache anyway).
Remove the module-load IIFE, `_captured` gating and the hard-coded id. Keep the cassette JSON only as a TEST fixture that feeds the mocked GraphQL response. Keep `PRODUCT_ROADMAP_FIELDS` exported as a deprecated getter only if needed to keep `awareness.cjs` `scanOrg` working; better: change `scanOrg`'s default project id to `projectCtx.org_project`/PROJECT.md and fix `awareness.test.cjs` O2 in the same TRD.

### Pattern 8: Frontmatter write-back (GSF-04)
After create/verify, write `github_issue: owner/repo#N` into `.planning/objectives/<dir>/OBJECTIVE.md`. Use the line-regex strategy `applyDrift` already uses (preserves comments and ordering; `extractFrontmatter` round-tripping via `reconstructFrontmatter` would drop comments like the `# OPTIONAL` notes in the template): replace `^github_issue:.*$` inside the first `---` block, else append a line before the closing `---`. Factor it into one `setFrontmatterField(path, key, value)` helper (put in `frontmatter.cjs`) and have `applyDrift` call it. Write ONLY when the value changes (idempotent, no mtime churn). If the frontmatter block is missing, warn and skip (do not create one). Never overwrite a different existing `github_issue` silently: report `frontmatter_conflict` and keep the file value (human-set ref wins; mapping is reconciled to it after marker check).
Note `extractFrontmatter` parses `owner/repo#N` values fine (no quoting needed; `#` only starts a comment after whitespace in real YAML, so write it without a trailing comment).

## Migration mechanics (GSF-01)

**Recommendation: both, sharing one pure function.**
1. `gh-mapping.migrateMapping(raw, {cwd})` -> `{mapping, changed, conflicts[]}` handles: v1 numbers, v2 objects, mixed, keys that are dir names, keys that are padded, `parseInt`-collapsed decimals. Pure; no network.
2. **Lazy on read**: `readMappingV3(cwd)` always runs it in memory (so `comment`/`close-issue`/`pull` work in a project whose plugin upgraded but whose SessionStart upgrade has not run, or for an older checkout) and the writer persists v3. The lazy path never writes by itself on a read-only command.
3. **Migration 0009 `gh-mapping-v3` (`safety: 'auto'`, `since` = next release)**: `detect` applies when `.planning/.gh-mapping.json` exists and is not `version: 3`; `apply` writes v3 (atomic), backs nothing else up (the `upgrade` runner already backs up to `~/.claude/devflow/backups/` outside the repo), `changed: ['.planning/.gh-mapping.json']`, also normalises `.planning/.gh-sync-state.json` keys to ids. It is local-only and deterministic, which is exactly the `auto` contract; `upgrade-project.js` will then commit exactly `changed_files`. Not `confirm`: there is no judgement call, and the lazy path already covers anyone who skips it. Follow the 0003/0008 test pattern (`upgrade-fixtures.cjs` `makeV1Project`, contract test, idempotency test: apply twice -> second `detect` is `applies:false`). Adding a migration will not break `doctor.e2e.test.cjs` (it asserts `pending.includes('0008')`).
4. Key disambiguation on migration: v2 keys came from `parseInt` so a `"2"` may really be objective `2.1`. Resolve by looking for an objective dir/OBJECTIVE.md whose `github_issue` ref equals that issue number; if ambiguous keep the key as-is, set `verified_at:null` and record it in `conflicts`; the first-sync marker verification is the authority (fetch issue, read `devflow:id`, re-key if different). Do not guess.
5. Collisions (two legacy keys normalising to the same id with different issue numbers): keep the one whose issue body carries the matching marker after verification; until then keep both under the canonical id in `conflicts` and refuse to write to GitHub for that id ("needs human" error). Test this explicitly.
6. This repo's own `.planning/.gh-mapping.json` (`{"milestone_id":null,"objectives":{"0":{"issue_id":20,"state_comment_id":4374249280}}}`) is the v2 fixture; copy it (hand-built) into the migration test.
7. `.gh-sync-state.json` stays `version:1` on disk (its schema is unchanged) but keys are normalised by `readSyncState`/`recordSync` through `toObjectiveId` (merge duplicates, keep the newest `last_synced_at`). `recordSync` callers keep passing whatever they have; the normaliser makes them agree. This is what lets `pull` find push's baseline.

## Command surface after consolidation

| Command | Behaviour |
|---|---|
| `gh sync <objective>` | resolve -> find-or-create issue (mapping, frontmatter, marker scan, title scan, create) -> ensure milestone -> merge managed sections -> sticky comment -> Project fields -> frontmatter write-back -> mapping + sync-state. Idempotent |
| `gh sync --all` (also bare `gh sync` and alias `gh sync-objectives`) | iterates every objective that has a dir under `.planning/objectives/` and/or a ROADMAP header; one label/milestone bootstrap, one marker scan; per-objective result array; exit 1 if any failed. Alias prints a one-line deprecation to stderr |
| `gh comment <id\|issue#> <body\|@file:p>` | via `resolveObjective` + mapping; body gets `<!-- devflow:id=N kind=comment -->` prefix (GSF-02 "every comment"); raw issue numbers (`#123` or `123` with no mapping hit) still accepted. Uses `ghWrite` |
| `gh close-issue` | same resolution; adds marker to the closing comment |
| `gh pull <objective>` | resolve; repo via `resolveRepo`; mapping + sync-state via id |
| `gh resolve`, `gh status`, `gh sync-release` | `resolve`/`sync-release` gated by `enabled`; `sync-release` moves to the seam and `ghWrite` |
Ambiguity rule for `comment`/`close-issue`: a bare number that is both a valid objective id and an issue number (e.g. `46`) resolves as **objective id first** (existing behaviour for mapped keys), `#46` forces issue number. Document it.

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---|---|---|---|
| Milestone resolution | a new ROADMAP regex | `roadmap.getMilestoneInfo` + OBJECTIVE.md `milestone:` | 40-01 already fixed the parser; the first-`vX.Y` regex is the bug |
| Atomic JSON write | ad hoc writeFileSync | `sync-state.atomicWrite` | tmp+rename already tested |
| Out-of-repo cache path / repo key | new hashing | `awareness-store.cjs` `repoKey` + env-override pattern | consistent with hooks/doctor |
| Frontmatter edit | `reconstructFrontmatter` round-trip | line-regex setter (from `applyDrift`) | preserves comments/order |
| Pagination | hand loops with page counters | `gh api --paginate --slurp`; GraphQL `pageInfo` loop from `walkProject` | avoids concatenated-array JSON |
| Issue discovery by marker | GitHub search API | `gh issue list --label ... --json body` + local regex | HTML comments probably not indexed; search lags |
| Retry policy | per-call-site sleeps | one `ghWrite` | the pacing rule must hold globally |
| Migration runner | custom "upgrade on first run" | `lib/migrations/0009-*.cjs` | backup, stamp, commit-by-hook come free |

## Common Pitfalls

1. **Partial rewire leaves two shapes alive.** If `readMapping` (gen-1) survives anywhere, `[object Object]` returns. Delete `readMapping/writeMapping/readMappingV2/writeMappingV2` bodies (keep exported names as thin delegates to v3 for back-compat, since tests and `gh-pull` import `readMappingV2`) and add a test that round-trips every legacy shape through every command with a mock asserting no argument contains `[object Object]`.
2. **Mocked `which`.** `ghStatus` shells out to real `which gh`; hermetic tests need the seam-based presence check or they fail in CI without gh.
3. **D3 back-compat.** Do not make `skipped` exit 1 (existing test D3). Only real failures.
4. **`output()` exit semantics.** `output` calls `process.exit`; tests monkey-patch it to a no-op, so code after `output(...)` still executes in tests. Return immediately after every `output` call (existing code does).
5. **Rate-limit tests must not sleep for real.** Inject `_setSleep` + `_setNow`; assert the recorded delay equals `retry-after`, that the next call happens after it, and that two writes are >= 1000 ms apart on the fake clock.
6. **Treating every 403 as rate limit** hides permission errors; classify on body text (see Pattern 5). **Treating none as rate limit** loses the 403-without-`Retry-After` case; fall back to 60 s minimum.
7. **Sticky marker migration.** Comments carrying the legacy `<!-- df:state -->` marker must still be found; otherwise every repo gets a second sticky comment on first sync.
8. **Legacy gen-1/gen-2 bodies.** The first managed-section sync appends below old generated text. Expected, one-time; call it out in SKILL docs rather than trying to strip it.
9. **`gh issue create --milestone` takes a TITLE**, the REST milestone endpoint takes a NUMBER (existing code already knows; keep the mapping as titles->numbers and use the right one per call).
10. **Label bootstrap noise.** `gh label create` on an existing label exits non-zero (the current code ignores it). Route through `ghWrite` but treat "already exists" as success and do it once per run, not per objective.
11. **`--all` decimals.** A decimal objective inserted later (`02.1-...`) sorts between 2 and 3; `listObjectives` regex `[\d.]+` already supports it; the id normalizer must not turn it into `2`.
12. **New-project workflow commits the mapping** (`new-project.md:1121`): keep that commit step; the skill also commits it. Both stay valid with v3 (same path).
13. **Project-field sync must be best-effort.** A missing `project` scope or unknown option must warn and continue; today `syncObjective` hard-requires `project` and `read:project` scopes even when no `org_project` is set. Require them only when `org_project` resolves; otherwise `['repo']`.
14. **`hasHelpFlag`:** `cmdGhResolve` honours `--help` anywhere in argv (issue #100 finding 4). Any new subcommand parsing (`--all`, `--refresh`) should do the same.
15. **Version sync / release:** plugin version bump is a release concern, but the migration's `since` needs a real semver (next release is after 2.12.0). Add a CHANGELOG `[Unreleased]` entry (repo has a changelog gate on tags).

## Code Examples

### Id normalisation (pure)
```js
// gh-mapping.cjs
function toObjectiveId(arg) {
  const m = String(arg).trim().match(/^(\d+)(\.\d+)?(?:-\d+)?(?:-.*)?$/); // "02.1-foo" -> 2.1 ; "46-github-x" -> 46
  if (!m) return null;
  return String(parseInt(m[1], 10)) + (m[2] || '');
}
```
(TRD ids like `46-02` need a separate branch before this regex: a trailing `-NN-` followed by more text is ambiguous with a slug starting with digits; planner should add the `trds` branch only when objective 47 needs it and keep 46 to objective ids.)

### Marker scan
```js
const MARK_RE = /<!--\s*devflow:id=([0-9.]+(?:-[0-9]+)?)(?:\s+kind=(\w+))?\s*-->/;
function extractMarker(body) { const m = MARK_RE.exec(body || ''); return m ? { id: m[1], kind: m[2] || null } : null; }
```

### Secondary limit classification
```js
function isSecondaryLimit(r) {
  if (r.ok) return false;
  const t = `${r.stderr}\n${r.stdout}`;
  return /secondary rate limit|abuse detection|temporarily blocked from content creation/i.test(t)
      || (/HTTP (403|429)/.test(t) && /rate limit/i.test(t));
}
```

### gh shim for CLI-level tests
```js
// __fixtures__/gh-shim.cjs : writes an executable `gh` into a temp dir, records argv as JSON lines,
// answers from a { 'issue view 46': {code, stdout, stderr} } table. Tests prepend dir to PATH and run
// `node df-tools.cjs gh sync <dir> --cwd <tmp>`; never real network, never real ~/.claude (HOME=tmp).
```

## State of the Art

| Old | Current | Impact |
|---|---|---|
| Single `milestone_id`, first-`vX.Y` regex | per-objective `milestone:` -> `getMilestoneInfo`, title-keyed map | GSF-05 |
| Fixture-loaded project field ids | live GraphQL discovery + TTL cache | GSF-07; new quarters work without a release |
| `--paginate` printing concatenated arrays | `--paginate --slurp` (single outer array) | GSF-08 comments/milestones |
| Search API for hidden markers | list-and-scan | HTML-comment indexing unverified |
| GitHub secondary limits: 80 content-creating req/min, 500/h, 900 pts/min/endpoint REST (POST/PATCH/PUT/DELETE = 5 pts), 100 concurrent | unchanged; subject to change without notice | constants, keep configurable |

**Deprecated/outdated here:** `sync-objectives` (alias only), `getMilestoneVersion`, `formatIssueBody`, `readMapping`/`writeMapping` (gen-1), `PRODUCT_ROADMAP_FIELDS` constant, the `2>/dev/null` post-execute call.

## Validation Architecture (what proves each GSF requirement)

All tests: `node:test`, hand-built fixtures, `_setRunGh`/shim, temp project dirs, `HOME` and `DEVFLOW_GH_CACHE_DIR` pointed at temp dirs. Test-first: each TRD's first commit is the failing test.

| Req | Tests (RED first) |
|---|---|
| GSF-01 | `gh-mapping.test.cjs`: `toObjectiveId` table (`"46"`, `"046"`, `"46-github-sync-foundations"`, `"2.1"`, `"02.1-x"`, `"0"`, `"00-refine-defaults-table"`); `migrateMapping` for v1, v2 (this repo's real shape), mixed, dir-name keys, collisions; idempotent (`migrate(migrate(x)) deep-equals migrate(x)`); unknown version refused. Migration 0009 contract + detect/apply/idempotency + dry-run writes nothing. Repo grep test: no `parseInt(` of a dir prefix in gh*.cjs/sync-state/conflict. **Matrix test:** for each legacy shape x each command (`sync`, `comment`, `close-issue`, `pull`) assert the mock never receives an argv element containing `[object Object]` and the right issue number is used |
| GSF-02 | `extractMarker` cases; every `ghWrite` body/comment argv in a full `sync` run contains `devflow:id=`; lost-mapping test (below); duplicate-marker on two issues -> error not pick; legacy sticky `<!-- df:state -->` still found and edited in place |
| GSF-03 | (a) repo test on `workflows/execute-objective.md`: the sync step references `OBJECTIVE_DIR`, contains no `2>/dev/null` on the `gh sync` line, and prints the failure; (b) shim-driven CLI test: `df-tools gh sync 46-x --cwd tmp` with shim returning failure -> exit 1 + stderr JSON; with success -> exit 0; runs the extracted bash snippet with `OBJECTIVE_DIR` set against the shim fixture and asserts the warning text appears on failure |
| GSF-04 | After `sync --all` on a fixture with no `github_issue`, OBJECTIVE.md contains `github_issue: owner/repo#N`, comments/ordering preserved byte-for-byte elsewhere; second run does not change file bytes/mtime; differing existing value reported, not overwritten |
| GSF-05 | objective with `milestone: v1.4` and ROADMAP whose bullets resolve to v1.3 -> milestone title `v1.4`; ROADMAP with multiple `vX.Y` strings before the milestone list no longer matters; changing the objective milestone creates/uses a different `milestones` entry (no stale reuse); unresolvable -> no `--milestone`, warning, never `v1.0` |
| GSF-06 | `mergeManaged` table: empty body; body with human text above/below/between sections (survives 2 consecutive syncs: **success criterion 3**, asserted by byte-equality of the human text and by no second `issue edit` when nothing changed); missing section appended; malformed pair; marker id mismatch -> error; CRLF; size guard |
| GSF-07 | `gh-project.test.cjs`: mocked GraphQL (feed cassette JSON as the response) -> single-select, iteration, pagination; TTL hit makes zero gh calls; expired/missing-option triggers one refresh; an option absent after refresh -> warning not failure; grep test that nothing under `lib/` (non-test) reads `__fixtures__`; option `Q3 2028` resolves when present in the mock |
| GSF-08 | fake clock: 3 writes are >= 1000 ms apart; 403 with `retry-after: 2` retried after >= 2 s then succeeds (**success criterion 4**); 403 without header uses 60 s then exp backoff, stops at max attempts returning failure; plain 403 "Resource not accessible" is NOT retried; comments pagination (mock returns 2 slurped pages, sticky found on page 2); `github.enabled:false` -> every subcommand except `status` returns `skipped` with zero gh calls (assert `calls().length === 0`) and exit 0; `ok:false` -> exit 1 for `comment`/`close-issue`/`sync`; D3 still green |

### End-to-end push -> pull (success criterion 1)
One stateful fake GitHub inside the test: a small in-memory issue store implementing the handful of `gh` argv shapes used (`issue create` returns URL, `issue edit` mutates body, `issue view --json ...` returns current issue incl. `updatedAt` that advances on each write, `issue list --label ... --json`, `issue comment`, `issue close`, `api repos/.../comments` GET/PATCH, milestone endpoints). Install via `gh._setRunGh(fake)`. Steps on a temp project with `config.github.enabled:true`, repo `o/r`, two objectives (`02-a`, `02.1-b`):
1. `sync --all` -> asserts mapping v3 keys `"2"`, `"2.1"`, frontmatter written, sync-state baseline recorded under the SAME ids.
2. `comment 2 "hi"` and `comment 2.1 ...` hit the right issue numbers; `close-issue 2`.
3. `pull 02-a` (dir name) and `pull 2` both resolve the same entry and report no drift (baseline found); then mutate the fake issue (label/assignee) -> `pull` reports drift; `--apply` writes frontmatter.
4. Delete `.gh-mapping.json` + `.gh-sync-state.json`; `sync --all` again -> store still holds exactly two issues (**criterion 2**), mapping rebuilt via frontmatter/marker scan, `create` calls == 0.
5. Human edits the fake issue body outside managed sections; sync twice; text intact (**criterion 3**).
The same fake drives the legacy-shape matrix (seed v1 or v2 mapping files instead of step 1). `gh-pull.cjs` and `gh.cjs` must share the seam for this to work with a single `_setRunGh` call; keep per-module setters for existing tests.

## Wave breakdown (recommended)

Constraint: `gh.cjs` is touched by almost everything, so wave 1 creates NEW files only, wave 2 is the only wave that edits `gh.cjs`/`gh-pull.cjs`/`sync-state.cjs`/`df-tools.cjs` (avoids same-wave file conflicts in parallel worktrees).

- **Wave 1 (independent, parallel, new files + tests only):**
  - 46-01 `gh-client.cjs` (GSF-08 pacing, retry, pagination, enabled gate, exit-code helper, shared seam) + `gh-shim` fixture
  - 46-02 `gh-mapping.cjs` (id normaliser, v3, pure migrate) + migration 0009 + sync-state key normalisation helper (GSF-01)
  - 46-03 `gh-body.cjs` (markers, managed sections, `mergeManaged`, sticky marker compat) (GSF-02 part, GSF-06)
  - 46-04 `gh-project.cjs` (discovery, TTL cache, value resolution) (GSF-07)
  - 46-05 milestone resolution helper + `setFrontmatterField` (GSF-05, GSF-04 primitive) - both tiny; may fold into 46-02/03
  - 46-06 GSF-03: workflow step rewrite (pass `${OBJECTIVE_DIR}`, drop `2>/dev/null`, print failure) + repo test. Works today because `cmdGhSyncObjective` already accepts a dir; ships the fix immediately.
- **Wave 2 (serial, single owner of the rewiring):**
  - 46-07 rewire `gh.cjs`: one `syncObjective` core (find-or-create via mapping/frontmatter/marker scan, managed body, milestone, project fields, write-back); `sync --all`; `sync-objectives` alias; `comment`/`close-issue`/`sync-release` onto the seam + mapping v3 + markers; `enabled` gate and exit codes; `df-tools.cjs` dispatch + `help.cjs`; delete gen-1 code; remove `PRODUCT_ROADMAP_FIELDS` runtime read and fix `awareness.cjs`/tests.
  - 46-08 rewire `gh-pull.cjs`, `sync-state.cjs`, `conflict.cjs` onto ids/`resolveRepo`/shared seam.
- **Wave 3:** 46-09 end-to-end push->pull + lost-mapping + human-edit tests (shared fake GitHub); docs: `skills/gh-sync/SKILL.md`, `workflows/new-project.md`, `agents/verifier.md` (still `comment`/`close-issue`, now with id semantics), `templates/objective.md`, CLAUDE.md `GitHub integration` bullet, CHANGELOG `[Unreleased]`; full `npm test` (expect only MA-7 failing).

## Open Questions

1. **Does GitHub index text inside HTML comments for `in:body` search?**
   - Known: docs silent; informal sources say no. Not live-tested (tests may not call GitHub).
   - Decision: design does not depend on it (list-and-scan). Optional one-off manual check by a human on a scratch issue; record result in objective 47 research.
2. **Does `gh` surface `retry-after` for non-`api` subcommands?** No evidence; assumed no. Fallback 60 s minimum covers it. If the planner wants exact headers, issue writes can be done through `gh api --include` (changes parsing); recommended only for bulk paths in objective 47's outbox.
3. **`gh api --paginate --slurp` minimum gh version.** Flag is documented in the current manual; the floor version is unverified. Keep the per-page fallback and a test for it.
4. **`ProjectV2` field extras (`dataType`, `duration`, `completedIterations`)** come from schema memory, not the docs page fetched; confirm by introspection at implementation time (MEDIUM).
5. **Should `gh sync` create issues when `github_issue` is absent?** Recommended yes (that is what makes `sync-objectives` foldable and GSF-04 meaningful); this changes `syncObjective`'s current "requires github_issue" contract and the execute-objective gate (`grep '^github_issue:'`), which can then be simplified to "github enabled".
6. **Legacy body duplication** on first managed sync (Pitfall 8): accept, or add an opt-in flag. Recommend accept.

## Sources

### Primary (HIGH confidence)
- Repo source read directly: `plugins/devflow/devflow/bin/lib/{gh,gh-pull,sync-state,conflict,pm-backend,helpers,roadmap,awareness-store,upgrade}.cjs`, `migrations/0003*, 0008*`, `bin/df-tools.cjs` (gh dispatch), `workflows/execute-objective.md`, `workflows/new-project.md`, `agents/verifier.md`, `skills/gh-sync/SKILL.md`, `.planning/.gh-mapping.json`, `docs/PROPOSAL-github-system-of-record.md`, test fixtures `gh-fixtures.cjs`.
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api - secondary limits (80/min, 500/h content creation, 100 concurrent, 900 points/min REST), 403/429, `retry-after`, `x-ratelimit-reset`, 1-minute minimum, exponential backoff.
- https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects - `organization.projectV2`, `fields` fragments for single select / iteration, `updateProjectV2ItemFieldValue` value shapes, add-then-update requirement.
- https://cli.github.com/manual/gh_api - `--paginate`, `--slurp`, `--include`, `-f`/`-F` semantics, GraphQL `$endCursor` requirement.

### Secondary (MEDIUM confidence)
- Community/tracker reports (cli/cli exit code 1 for every HTTP failure; hub4j/github-api#1805, renovatebot#20601, community discussions 32120/50326/56587): `Retry-After` is not always sent (seen `retry-after: 60`), secondary-limit body text strings, do not treat every 403 as auth failure.

### Tertiary (LOW confidence)
- Gist comments claiming GitHub search does not index HTML-comment text (unverified; design avoids dependency).

## Metadata

**Confidence breakdown:**
- Standard stack / module layout: HIGH - derived from the code and existing conventions
- Defects and root causes: HIGH - each confirmed in source
- Rate-limit behaviour through `gh`: MEDIUM - docs plus community reports, `gh` header exposure only via `--include`
- Search/HTML-comment indexing: LOW - avoided by design
- GraphQL field shapes: HIGH for single-select/iteration (docs), MEDIUM for extras

**Research date:** 2026-09-30
**Valid until:** 2026-10-30 (GitHub limits and gh flags change without notice; re-check rate-limit constants before objective 47)
