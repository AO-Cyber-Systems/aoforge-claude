# Objective 47: GitHub authoritative store - Research

**Researched:** 2026-09-30
**Domain:** GitHub REST/GraphQL (sub-issues, dependencies, issue types/fields, milestones), wiki git, and a Node CJS CLI over `gh` and `git`
**Confidence:** HIGH on repo structure and reuse points (read directly). MEDIUM on GitHub API shapes (official docs fetched, not live-tested). LOW on issue-field discovery paths and the wiki revision-URL format.

<user_constraints>
## User Constraints (from OBJECTIVE.md and docs/PROPOSAL-github-system-of-record.md; no CONTEXT.md exists)

### Locked Decisions
- Design source: `docs/PROPOSAL-github-system-of-record.md`. Decisions are locked 2026-09-30; do not re-litigate.
- Source of truth: GitHub is fully authoritative. `.planning/` is a gitignored cache.
- Hierarchy: native milestone -> Objective issue -> TRD sub-issues. Objective detail lives in the wiki.
- TRD rules: target 40,000 chars, hard 60,000 (GitHub caps at 65,536). Frozen at execute start. Scope changes are `<!-- devflow:scope n=K -->` comments. Effective spec = body + scope comments in order. Fold on close when it fits, logged in `devflow:spec-rev`.
- Issue writes go through a paced outbox: <= 1 write/s, 80/min, 500/h, backoff, idempotent upsert keyed by `<!-- devflow:id=... -->`. A flush that finds an issue edited on GitHub since the last pull stops for a human.
- Wiki writes: commit, rebase, push. Conflicts are git conflicts.
- DevFlow writes only inside its own marked body sections. Deletes are never automatic; orphans are reported.
- Repos without org features or wiki degrade to labels + body metadata for types/fields and `docs/` for wiki content, detected automatically.
- Strict TDD (kind plugin): failing test committed first. Tests mock `gh` via `_setRunGh` / temp dirs and env overrides. Never call real GitHub, never touch the real `~/.claude`, never use port 8080.

### Claude's Discretion
- Module decomposition, journal format and location, capability-detection mechanics, wiki page naming, wave breakdown, how the fake GitHub is extended.

### Deferred Ideas (OUT OF SCOPE)
- Objective 48: the `plan put-trd`, `objective set-status`, `summary post`, `verification post`, `decision open|answer`, `todo add` and `doc put` verbs; the edit gate; gitignoring `.planning/`.
- Objective 49: branch and PR lifecycle, `gh issue develop`, `Closes #`, check runs.
- Objective 50: `gh setup`, rulesets, creating issue types/fields and the wiki's first page.
- Objective 51: migration of existing repos and docs.
- Stacked PRs.

### Cross-Repo Considerations
None provided.
</user_constraints>

<phase_requirements>
## Objective Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GST-01 | Hierarchy, blocked-by edges, fields, Decision blocks TRD | "GitHub API facts" (sub-issues, dependencies, types, fields); `gh-hierarchy.cjs` |
| GST-02 | Objective body: summary + criteria checkboxes + wiki link at pinned rev | gh-body managed sections (add `meta`/`wiki`); wiki store `headSha()` |
| GST-03 | TRD codec, scope budget, frozen, scope comments, spec-rev, fold | `gh-trd.cjs` (pure codec) |
| GST-04 | SUMMARY comment on TRD; VERIFICATION sticky on objective | gh-body `commentMarker(id,'summary')`, sticky upsert; `gh-comments.cjs` |
| GST-05 | Outbox journal, paced, resumable, remote-edit halt | "Outbox design"; `gh-outbox.cjs` + `gh-outbox-flush.cjs` |
| GST-06 | Wiki store: clone `.wiki.git`, commit + rebase + push, page mapping | "Wiki git"; `gh-wiki.cjs` |
| GST-07 | `gh pull --all` rebuilds cache; generated ROADMAP/STATE; wiki Roadmap | `gh-cache.cjs`; extend `gh-pull.cjs` |
| GST-08 | Degraded mode, auto-detected | `gh-capability.cjs`; degraded backend in `gh-hierarchy.cjs` |
</phase_requirements>

## Summary

Objective 46 left the right foundation: `gh-client.cjs` (single `_runGh` seam, paced `ghWrite`, secondary-limit retry, `ghPaginate`, enabled gate), `gh-body.cjs` (pure markers and managed sections; the id regex already accepts the TRD form `47-01` and `kind=` comments), `gh-mapping.cjs` (v3 with an empty `trds: {}` reserved for this objective), `gh-issue.cjs` (marker list-and-scan, never GitHub search), `gh-milestone.cjs` and the stateful `__fixtures__/gh-fake.cjs`. Nothing for sub-issues, dependencies, types, fields, outbox or wiki exists in `bin/lib` except a one-off `linkSubIssue` in `gh.cjs:477` (GraphQL, node-id based, used by `resolve`). It is reusable as a pattern but not as the TRD linker.

The work is mostly new modules built on those seams, not edits to `gh.cjs` (already 1,724 lines): a pure TRD codec, a capability detector, a hierarchy pusher with a native and a degraded backend, an outbox store plus flusher, a wiki store, a cache rebuilder, and thin command wiring. The hard problems are: (1) the fake GitHub must grow REST create with ids distinct from numbers, sub-issues, dependencies, types, fields, wiki and offline simulation, because the real APIs key on the database `id`, not the issue number; (2) remote-edit detection cannot rely on `updated_at` alone, because DevFlow's own sub-issue links, comments and labels bump the parent's `updated_at`; (3) a byte-identical round trip (SC1) needs a defined canonical cache layout, so the TRD issue body is the verbatim TRD file after the marker line, and OBJECTIVE.md is verbatim in a wiki page.

**Primary recommendation:** Use REST for everything except `gh issue create`-style convenience. Create TRDs with `POST /repos/{o}/{r}/issues` via `--input -` (returns `id`, `number`, `type`), link with `POST .../sub_issues {sub_issue_id: <id>}`, add waves with `POST .../dependencies/blocked_by {issue_id: <id>}`. Enqueue every issue write as a logical op in a file-backed outbox, executed through `ghWrite`. Detect capabilities once per repo and cache the answer.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `gh-client.cjs` (repo) | 46 | The only gh spawn site; pacing, retry, pagination, enabled gate | Locked by 46; `gh-seam.repo.test.cjs` guards it |
| `gh-body.cjs` (repo) | 46 | `devflow:id` markers, managed sections, comment markers | Already handles `47-01` ids and `kind=summary|spec-rev|verification` |
| `gh-mapping.cjs` (repo) | v3 | id -> issue number, `trds` map | `trds` reserved for this objective; `setEntry` is objective-only so add a `trds` setter |
| `gh-fake.cjs` (repo fixture) | 46 | Stateful fake GitHub | Must be extended in-place, not forked |
| `git` (CLI) via `child_process.spawnSync` | 2.50 on dev box | Wiki clone/commit/rebase/push | No wiki API exists |
| `crypto` sha256 (node builtin) | node | Content hashes (spec-rev, base hashes, idempotency keys) | Matches `sync-state.cjs` `sha256:<hex>` convention |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sync-state.cjs` `atomicWrite` | repo | tmp + rename writes | Journal, capability cache, base-hash store |
| `awareness-store.cjs` `repoKey` pattern | repo | `<slug>-<hash8>` of realpath, env-overridable dir | Template for the outbox and capability stores |
| `helpers.cjs` `execGit` | repo | git wrapper | Do NOT use for wiki: it shells through `execSync` and returns trimmed output only. Write a small `runGit` seam in `gh-wiki.cjs` (spawnSync argv array, injectable) |

No new npm dependencies. The repo is CommonJS, synchronous, node builtins only for libs.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| REST sub-issues | GraphQL `addSubIssue` (as in `gh.cjs:477`) | GraphQL needs 2 extra read calls for node ids; REST needs the integer `id`, which the REST create already returns. REST is cheaper and fakeable without a GraphQL handler. Keep GraphQL only for reads that REST lacks (issue types per issue are in REST `type`) |
| `gh issue create` | REST create with `--input -` | `gh issue create` returns only a URL, cannot set `type` and forces a second call to learn the `id`. REST sets title, body, labels, milestone (number), `type` in one write and saves the 500/h budget |
| Clone wiki into `~/.claude/devflow/state/` | Clone into `<project>/.planning/wiki/` | Proposal says "git clone of the wiki into the cache", and agents Read `.planning/`. Use `.planning/wiki/` and add it to `.git/info/exclude` on clone (local only); objective 48 gitignores the rest |

**Installation:** none.

## GitHub API facts (verified against docs.github.com 2026-09-30 unless noted)

| Need | Call | Notes |
|------|------|-------|
| Create issue | `POST /repos/{o}/{r}/issues` body `{title, body, labels[], milestone:<number>, type:"TRD"}` | `type` is silently dropped without push access, and is only meaningful where org issue types are enabled. ALWAYS check `response.type` after create and warn. Milestone is the number, not the title (the `gh issue create --milestone` flag takes a title) |
| Update issue | `PATCH /repos/{o}/{r}/issues/{n}` | `type` also settable; `state`+`state_reason` for close |
| List sub-issues | `GET /repos/{o}/{r}/issues/{n}/sub_issues?per_page=100` | paginate; response issues carry `sub_issues_summary`, `parent_issue_url` |
| Parent | `GET .../issues/{n}/parent` | 404 when none |
| Add sub-issue | `POST .../issues/{n}/sub_issues` `{sub_issue_id:<issue id>, replace_parent?:bool}` | `id`, not `number`. Child must have the same repo OWNER. Secondary limits apply |
| Remove sub-issue | `DELETE .../issues/{n}/sub_issue` (singular) `{sub_issue_id}` | Not automatic in DevFlow (never delete); report orphans only |
| Reorder | `PATCH .../sub_issues/priority` `{sub_issue_id, after_id|before_id}` | Optional; order TRDs by number at creation instead |
| Blocked-by list | `GET .../issues/{n}/dependencies/blocked_by` | and `.../blocking`; issue JSON has `issue_dependencies_summary` |
| Add blocker | `POST .../issues/{n}/dependencies/blocked_by` `{issue_id:<blocking issue id>}` | `n` is the blocked issue. 422 also means "spammed" |
| Remove blocker | `DELETE .../dependencies/blocked_by/{issue_id}` | |
| Org issue types | `GET /orgs/{org}/issue-types` | 404 for a user-owned repo's owner. Entries: `id, name, is_enabled`. Creating types needs org admin (that is objective 50) |
| Issue fields (values) | `GET/POST/PUT .../issues/{n}/issue-field-values`; POST body `{issue_field_values:[{field_id:int, value}]}`; `PUT` replaces | Org-level fields only; 403 without push; field ids needed |
| Issue fields (definitions) | org-level list endpoint: path NOT confirmed in docs fetched | LOW. Resolve at implementation by `gh api graphql` introspection or the org issue-fields REST page; until then treat "cannot list fields" as "fields unavailable" (degrade) |
| Native milestones | existing `gh-milestone.cjs` and `ensureMilestone` in `gh-issue.cjs` | No change needed |
| Repo facts | `GET /repos/{o}/{r}` | `owner.type` (`Organization`|`User`), `has_wiki`, `permissions.push`, `private` |
| Limits | 100 sub-issues per parent (closed ones count), 8 nesting levels, one parent per issue | Objective -> TRD is depth 1; a 100-TRD objective is impossible in practice but refuse >100 with a clear error |
| Body size | 65,536 chars for an issue body and for each comment (GitHub error "body is too long"); docs do not state it, community-confirmed (MEDIUM) | DevFlow budget: target 40,000, refuse > 60,000 |

Sub-issues, dependencies and milestones are NOT org-only: they work on user-owned repos (same-owner rule). Issue types and issue fields are org-only. So degraded mode (GST-08) is mainly types, fields and wiki, not the hierarchy. Keep a third fallback for hosts without the sub-issues API (older GHES): a managed `trds` task list `- [ ] #N` in the objective body (probe: sub-issues GET returns 404 on a known issue, vs 200 with `[]`).

### Capability detection (GST-08)

One module, one cached answer per repo (`{org_types, issue_fields, sub_issues, dependencies, wiki, push, owner_type, checked_at}`), TTL 360 min (reuse `github.project_cache_ttl_minutes` pattern), forced refresh with a flag.

| Capability | Probe | Absent means |
|------------|-------|--------------|
| owner / push | `GET repos/o/r` -> `owner.type`, `permissions.push` | no push: abort writes with a clear error |
| issue types | `owner.type==='Organization'` AND `GET orgs/o/issue-types` 200 AND names `Objective`,`TRD`,`Decision` enabled | per-type fallback to label `devflow:type/<name>` + body meta line |
| issue fields | org owner AND definitions listable AND `work`,`kind` exist | body `meta` section: `work: feature` / `kind: plugin` |
| sub-issues | `GET repos/o/r/issues/{any}/sub_issues` not 404, or probe after first create | task-list fallback |
| wiki | `has_wiki` false -> `disabled`; true then `git ls-remote <wiki url>` exit 128 -> `uninitialised` (first page must be created in the web UI; proposal constraint); exit 0 -> `ok` | `docs/` mode (below) |

A probe 403/404 on one capability must never fail the push. Record `degraded: [..]` and print it. A repo that is degraded writes labels `devflow:type/objective|trd|decision` (created lazily through the existing label bootstrap) and a managed `meta` section in the body; add `meta` to `SECTION_ORDER` in `gh-body.cjs` (currently `summary, criteria, trds, footer`).

Never silently fall back from a configured wiki to `docs/`: `uninitialised` is reported with the instruction "create the first wiki page in the web UI", and only an explicit `disabled` selects `docs/` automatically.

### Wiki git behaviour (GST-06)

- Remote: `https://github.com/{o}/{r}.wiki.git`. Default branch is `master` and cannot be changed; only `master` is displayed. Always `push origin HEAD:master`; if you must `git init`, use `-b master`.
- Repo does not exist until a first page is created in the UI. Clone of an uncreated wiki exits 128 "Repository not found". There is no API to create it. Pushing a fresh local repo is reported unreliable (sometimes "succeeds" but nothing shows). So: `uninitialised` is a reportable state, not auto-fixed (objective 50 `gh setup` documents the manual step).
- Private-repo wikis need a paid plan (open question in the proposal: which repos). A private repo on a free plan returns `has_wiki:true` but the clone fails; classify as `uninitialised` or `unavailable` with the git stderr included.
- Auth: do not embed tokens in URLs. Use `git -c credential.helper= -c credential.helper='!gh auth git-credential' ...` with `GIT_TERMINAL_PROMPT=0` (MEDIUM; standard gh behaviour). Tests inject the remote URL.
- Write path: `git add -A`; `git commit` (skip when `git diff --cached --quiet`); `git pull --rebase origin master`; `git push origin HEAD:master`. On rebase conflict: `git rebase --abort`, return `{ok:false, conflict:true, files:[...]}`, never force-push, never auto-resolve. Non-fast-forward after the rebase (a racing push): retry pull/push up to 3 times.
- Read path (`pull --all`): `git fetch` + `git reset --hard origin/master` is only safe when there are no local unpushed commits; otherwise `pull --rebase`. Report "wiki ahead by N" so the outbox `wiki-push` op can finish.
- Page revision pin (GST-02): `git rev-parse HEAD` of the wiki clone after push. Link form `https://github.com/{o}/{r}/wiki/{Page}/{sha}` (LOW: widely used in practice for page history, not documented in the docs fetched; keep it isolated in one function and cover it with a test so it is trivial to change).
- Page naming: flat namespace, file `Objective-<N>-<Slug>.md` (title from filename, hyphens become spaces). Mapping (single table in `gh-wiki.cjs`): `PROJECT.md`->`Project`, `REQUIREMENTS.md`->`Requirements`, `ROADMAP` view->`Roadmap`, `codebase/<NAME>.md`->`Codebase-<Name>`, objective `OBJECTIVE.md`->`Objective-<N>-<Slug>`, `CONTEXT.md`->`Objective-<N>-<Slug>-Context`, `RESEARCH.md`->`Objective-<N>-<Slug>-Research`, ADR->`ADR-<NNNN>-<slug>`, milestone retro->`Retro-<vX.Y>`. Decimal objectives (`2.1`) must keep the dot out of the filename (`Objective-2-1-...`) or collide; test it.
- `docs/` degraded mode: the same page table writes to `docs/devflow/<Page>.md` in the project working tree and is committed by the user's normal flow. It is repo content, not cache; `pull --all` reads it back from the tree. Decide path under `docs/devflow/` (do not scatter into `docs/`).

## Architecture Patterns

### Recommended project structure (all in `plugins/devflow/devflow/bin/lib/`, tests adjacent)
```
gh-trd.cjs            # pure: TRD codec, budget, scope comments, effective spec, fold, spec-rev
gh-capability.cjs     # detect + cache {org_types, fields, sub_issues, wiki, ...}
gh-outbox.cjs         # journal store: enqueue/coalesce/list/mark, lock, hourly budget
gh-outbox-flush.cjs   # executor: ordering, idempotent ops, remote-edit halt, offline stop
gh-hierarchy.cjs      # push: milestone -> objective issue -> TRD sub-issues -> blocked-by; native + degraded backends
gh-comments.cjs       # summary / verification / spec-rev / scope comment upserts
gh-wiki.cjs           # clone, page put/get, commit+rebase+push, revision, docs/ backend
gh-cache.cjs          # rebuild .planning/ from issues + wiki; ROADMAP/STATE views; Roadmap wiki page
__fixtures__/gh-fake.cjs   # extended in place (see Test strategy)
__fixtures__/wiki-remote.cjs  # new: temp bare repo helper standing in for .wiki.git
```
Extend (do not rewrite): `gh-body.cjs` (`meta`/`wiki` sections, comment kinds), `gh-mapping.cjs` (`getTrd/setTrd` for the `trds` map; keys `47-01`), `gh-pull.cjs` (`--all`), `gh.cjs`/`df-tools.cjs` (dispatch only), `templates/config.json` (`github.outbox`, `github.wiki` defaults, `github.trd_budget`).

### Pattern 1: TRD codec (GST-03), pure
- Issue body = `<!-- devflow:id=47-01 -->\n` + the verbatim TRD file text (frontmatter included). Round trip is then trivially byte-exact, `wave` and `depends_on` come straight from the frontmatter, and the planner/executor read the same text. Pull strips only the first marker line.
- Budget: `budget(text) -> {chars, status: 'ok'|'warn'|'over'}`, `chars` counted on the FINAL body (marker + any managed overhead). JS `.length` counts UTF-16 units, GitHub counts characters; `.length` is conservative for emoji, so use it. Target 40,000 = warn; > 60,000 = error. The check runs inside the push planner BEFORE the first create (SC2: "refused before any issue is created"); validate every TRD in the objective first, then create.
- Scope comments: `<!-- devflow:scope n=K -->\n<what changed and why>`. The existing `MARKER_SOURCE` does NOT match this form; add a dedicated scanner in the codec. Order by `n`, never by `created_at`. Effective spec = body + `\n\n` + comments in `n` order. Posting is idempotent by `n` (skip when a comment with that `n` exists). If effective length > 60,000, return `{overflow:true}`; the caller (objective 48's `put-trd`) turns it into a new TRD. 47 only supplies the decision function.
- `devflow:spec-rev` sticky comment (`commentMarker('47-01','spec-rev')`): append-only log lines `rev | at | event(freeze|scope n=K|fold) | sha256 | chars`. `freeze` is logged at execute start with the body hash. Drift = current body hash != last logged hash (reported, not repaired).
- Fold on close: only when `effective.length <= 60,000`. New body = effective spec; log `fold` with the before and after hashes and `folded_through=K`. Scope comments are left in place (never deleted); `folded_through` tells the reader that the body already contains them, so effective-spec computation ignores `n <= folded_through`.
- Frozen enforcement lives in the library: `assertEditable(trdState)` is what objective 48's verb will call; in 47 it only guards `gh-hierarchy` updates (a push never overwrites the body of a frozen TRD; it reports drift).

### Pattern 2: Hierarchy push with two backends (GST-01, GST-02, GST-08)
```
plan = planPush(objectiveDir)        // pure: validates budgets, resolves waves -> edges, no gh calls
ops  = toOps(plan, capabilities)     // logical ops, in dependency order
outbox.enqueue(ops); flush()         // all writes go through the outbox
```
Order of ops for one objective: milestone ensure -> objective issue upsert (type/fields or labels+meta) -> TRD issues upsert (sorted by id) -> `link-sub-issue(objective, trd)` per TRD -> `block(trd_b, blocked_by=trd_a)` for each `depends_on` edge (wave order: a TRD in wave N is blocked by its declared `depends_on`; if `depends_on` is empty but wave > 1, block on all TRDs of wave N-1) -> Decision issues (`Decision` type, blocks the TRD that raised it) -> objective body managed sections (criteria, trds, wiki link).
- Upsert = find by marker (existing `gh-issue` scan; extend the run context's marker index to TRD ids) then create or PATCH; write the number into mapping `trds["47-01"] = {issue_id, issue_number, comment_ids:{summary, spec_rev}}`.
- Idempotent re-push: link-sub-issue first reads `GET .../sub_issues` (paginated once per parent) and skips known children; `block` reads `blocked_by` once per TRD. 422 "already exists" is success.
- Objective body: managed `summary`, `criteria` (`- [ ] text`, the verifier ticks them; a re-push must not un-tick: merge existing checkbox state by criterion text), `trds` (native sub-issues render themselves, so `trds` holds only a one-line count and a link), `wiki` (page link at pinned revision), `meta` (degraded).
- Decision-type issues block the TRD (`POST dependencies/blocked_by` on the TRD with the decision's id). 47 only provides `openDecision(trdId, question)` as a library function; the CLI verb is 48.

### Pattern 3: Outbox (GST-05) - see next section.

### Pattern 4: Cache rebuild (GST-07)
`pull --all`: (1) `GET` all `devflow:objective`-labelled issues and TRD sub-issues (list-and-scan with `ghPaginate`, never search); (2) fetch comments per issue with `ghPaginate` (first page only is defect 8 of 46); (3) wiki fetch; (4) materialize into `.planning/`: `objectives/<dir>/OBJECTIVE.md` from the wiki page, `<id>-TRD.md` from the issue body (marker stripped), `<id>-SUMMARY.md` from the `summary` comment, `<N>-VERIFICATION.md` from the sticky comment, `ROADMAP.md`, `STATE.md` generated, `PROJECT.md`/`REQUIREMENTS.md`/`research`/`codebase` from wiki pages; (5) write atomically, never write a file whose bytes are unchanged (the file watcher attaches changed in-tree files to tool results), and never delete a local file that GitHub lacks: report it as an orphan.
- SC1 requires "identical cache content". Define canonical layout in one function and test with a byte compare of the materialized tree before push vs after pull, including trailing newline and line-ending normalisation (GitHub may return CRLF in bodies; normalise `\r\n` to `\n` on both sides and test it).
- Generated views carry a header `<!-- generated by devflow; do not edit -->`. ROADMAP groups objectives by milestone title; STATE shows position from issue states. Keep the generator pure so the wiki `Roadmap` page and the local `ROADMAP.md` share one renderer.
- `gh pull <objective>` (existing, drift detection) is untouched; `--all` is a new branch in `cmdGhPull`. Note the existing `pull` takes an objective id; today there is no `--all`.

## Outbox design (GST-05)

**Location:** `$DEVFLOW_OUTBOX_DIR`, else `~/.claude/devflow/state/outbox/<repoKey>.json` (same `<slug>-<hash8>` key as awareness-store and hook-marker-store; reuse `awareness-store.repoKey` logic, do not require `upgrade.cjs` from a hook-reachable path). A second file `<repoKey>.base.json` holds the last-pull base hashes (below). Both written with `atomicWrite`. The module must fail soft on read (corrupt journal -> rename to `.corrupt-<ts>` and report; never silently drop queued writes). Hook-safe: node builtins only plus `sync-state.cjs`, since post-commit and Stop hooks will call a flush (objective 49/50).

**Journal shape:**
```json
{ "version": 1, "repo": "o/r",
  "ops": [ { "seq": 1, "key": "sha256:..", "kind": "upsert-issue|link-sub-issue|block|set-fields|post-comment|patch-comment|wiki-push|close-issue",
             "target": {"id":"47-01"}, "payload": {}, "base": {"issue_number":12,"body_hash":"sha256:..","updated_at":".."} ,
             "status": "pending|done|blocked", "attempts": 0, "last_error": null, "queued_at": "..", "done_at": null } ],
  "halted": null,
  "writes": ["2026-09-30T10:00:01Z"] }
```
- Ops are LOGICAL (not raw argv), so a resume after a crash re-resolves state (marker scan, existing links) and cannot double-create. Idempotency key = sha256(kind + target + payload hash). Enqueue coalesces: an existing `pending` op with the same `kind`+`target` is replaced in place (latest payload wins, original `seq` kept so ordering is stable).
- Ordering: strict FIFO by `seq`. A later op is never run past an earlier one that is `pending` or `blocked`. Creates precede links precede blocks because the planner enqueues in that order.
- Concurrency: lockfile `<repoKey>.lock` created with `O_EXCL` containing pid and time; stale after 10 min; a second flusher exits 0 with "flush already running". The post-commit hook and a manual flush can overlap.
- Budget across processes: `writes` keeps timestamps; the flusher refuses to start an op if >= 80 in the last 60 s (waits via the client's pacing) or >= 450 in the last hour (stop, report "budget; resume later"). `gh-client`'s counter (450 per process) cannot enforce 500/h across processes and must not be the only guard. Record a timestamp for every `ghWrite` the flusher performs.
- Retry policy: `ghWrite` already retries secondary limits with `retry-after` or >= 60 s sleeps up to 15 min each, synchronously (`Atomics.wait`). That is wrong inside a Stop hook. Add a retry-policy parameter to the client (a module-level `_setRetryPolicy({maxRetries})` or an options argument that is NOT spread into `spawnSync`; note `attemptLoop` currently spreads `opts` into `spawnSync`, so do not smuggle policy through `opts`). Interactive CLI keeps 4 retries; the flusher in hook mode uses 0 and leaves the op pending with `retry_after`.
- Failure classification (new pure function `classifyFailure(r)`): `offline` (status null, or stderr matches `could not resolve host|connection refused|timed out|network is unreachable|dial tcp|EOF`) -> stop, leave pending, exit code "pending"; `rate_limited` (existing `isSecondaryLimit`) -> stop, pending; `permission` (403 non-limit) -> blocked, human; `validation` (422) -> blocked unless it is "already exists" which is success; `not_found` on a mapped issue -> blocked (deleted on GitHub; report orphan).
- Remote-edit detection: for ops that PATCH an issue body or a comment, the op carries `base` (issue number, `body_hash`, `updated_at` as of the last pull or the last successful write). Before executing: `GET` the issue (1 read), hash the CURRENT body, compare with `base.body_hash`. Different -> set `halted = {reason:'remote-edit', seq, target, diff summary}` and stop; do not write. Reasons for hashing instead of comparing only `updated_at`: DevFlow's own sub-issue add, dependency add, comment, label and state changes all bump the issue's `updated_at`, so an `updated_at` check would halt every flush after the first link. Use `updated_at` only as a cheap pre-filter (equal -> skip the hash); when it differs, the body hash decides. After a successful write, store the new hash from the response (never recompute locally). Hash the entire body (human text outside managed sections counts as an edit that must be preserved; the existing `mergeManaged` already re-merges onto the freshly read body, so a halt is only for edits INSIDE managed regions or to a frozen TRD body).
  - Refinement: when only text OUTSIDE the managed sections changed, merge and continue (that is the existing preserve-human-text contract); halt only when a managed section or a frozen body changed. Test both.
- Human resolution (minimal CLI in 47): `gh outbox status`, `gh outbox flush`, `gh outbox resolve <seq> --accept-remote|--overwrite` (accept-remote drops the op and refreshes the base; overwrite re-bases and runs it). Exit codes: 0 all flushed, 1 error, 2 halted for a human (remote edit or blocked op), 3 pending (offline or rate-limited, nothing wrong). `emitResult` today maps any `ok:false` to 1; add explicit exit codes for 2 and 3 in the outbox command only.
- Offline simulation in tests: the fake's `failNext` returns `{ok:false,status:null,stderr:'...could not resolve host'}`; add a persistent `fake.setOffline(true|false)` so a whole flush fails, then reconnect and assert FIFO.
- `enabled` gate: `requireEnabled` already returns zero gh calls when `github.enabled` is false; the outbox must still ACCEPT enqueues when disabled? Recommendation: no. When disabled, enqueue is a no-op returning `skipped` (matches 46's contract); degraded behaviour is not the same as disabled.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Spawning gh, pacing, retry, pagination | another spawn wrapper | `gh-client.cjs` | Seam is guarded by `gh-seam.repo.test.cjs`; a second spawn site fails CI |
| Markers, managed sections | new regexes | `gh-body.cjs` (extend with `scope`, `spec-rev` scanners) | Handles CRLF, human text preservation, sticky markers |
| Issue lookup after losing the mapping | GitHub search | `gh-issue` list-and-scan on label | Search does not reliably index HTML comments (46 decision) |
| Atomic file writes | writeFileSync | `sync-state.atomicWrite` | Crash safety for journal and cache |
| Per-repo state dir keys | new hashing | `awareness-store.repoKey` pattern | Same keys as backups and markers |
| Wiki conflict resolution | auto-merge | git rebase abort + report | Proposal: "Conflicts are git conflicts" |
| Issue number <-> id | assuming equal | store both from the REST create response | The sub-issue and dependency endpoints take `id`; number-as-id silently links the wrong issue |
| Rate limiting across processes | in-memory counters | journal `writes` timestamps | 500/h spans sessions |

**Key insight:** every correctness bug in 46 came from two writers or two shapes for one thing. Keep exactly one codec (TRD), one builder (body), one queue (outbox), one wiki mapping table, one capability probe.

## Common Pitfalls

### Pitfall 1: Using the issue number where GitHub wants the database id
**What goes wrong:** `sub_issue_id` and `issue_id` are the integer `id`, not `number`. A wrong value links an unrelated issue or 404s.
**How to avoid:** the stateful fake assigns ids that never equal numbers (for example `1_000_000 + number`); store both in mapping `trds[k]`. Add a test that fails when a number is sent as an id.
**Warning signs:** link succeeds in tests but the fake's parent has the wrong child.

### Pitfall 2: `updated_at` is not a remote-edit signal
**What goes wrong:** DevFlow's own links, comments and labels bump the parent's `updated_at`; flush halts on its own writes.
**How to avoid:** body-hash comparison with `updated_at` only as a pre-filter (above).

### Pitfall 3: Issue type silently dropped
**What goes wrong:** REST create returns 201 but `type` is null (no push access, or types not enabled), and the issue is untyped forever.
**How to avoid:** verify `response.type.name`; on mismatch apply the degraded label for that type and report.

### Pitfall 4: Size budget measured on the wrong string
**What goes wrong:** the body checked is the TRD file, but the posted body also has the marker line (and for objective bodies, managed delimiters). Or comments are forgotten: each comment also caps at 65,536.
**How to avoid:** measure the final posted string. Apply the same limit to SUMMARY comments. A SUMMARY over 60K must be split into `part=1/2` comments (`kind=summary`) or linked to the wiki; never trim prose. Decide in planning (Open Question 3).

### Pitfall 5: Scope comments ordered by time
**What goes wrong:** edited or re-posted comments reorder; effective spec differs between machines.
**How to avoid:** order strictly by `n`; reject gaps or duplicates with a report; idempotent post by `n`.

### Pitfall 6: Wiki not initialised or master vs main
**What goes wrong:** clone exits 128 with `has_wiki:true`; pushes to `main` never display.
**How to avoid:** the capability probe distinguishes `disabled` / `uninitialised` / `ok`; always push `HEAD:master`; the test bare repo is created with `git init --bare -b master` and the wiki store never assumes `init.defaultBranch`. Tests must also set `-c user.name -c user.email` and `GIT_CONFIG_GLOBAL=/dev/null` so a developer's global git config (hooks, signing, `commit.gpgsign`) cannot leak in.

### Pitfall 7: Hierarchy partial failure leaves orphans
**What goes wrong:** crash after creating TRD issues but before linking.
**How to avoid:** outbox ops are idempotent and resumable; re-push scans markers first. Never delete; `status` lists orphans (TRD issue not linked, link to a TRD with no local file).

### Pitfall 8: Secondary limit blocking a hook
**What goes wrong:** `ghWrite` sleeps up to 15 minutes inside a Stop hook.
**How to avoid:** retry policy parameter; hook-mode flush does not sleep.

### Pitfall 9: Cache churn
**What goes wrong:** rewriting unchanged files makes the watcher attach them to every tool result and the repo look dirty.
**How to avoid:** byte-compare before write; wiki clone under `.planning/wiki/` excluded via `.git/info/exclude`.

### Pitfall 10: Objective checkbox state lost on re-push
**What goes wrong:** the managed `criteria` section is regenerated and unticks what the verifier ticked.
**How to avoid:** merge by criterion text; a test ticks a box, re-pushes, asserts it stays ticked.

### Pitfall 11: Round-trip equality
**What goes wrong:** CRLF, trailing newline and marker-line stripping differ between push and pull so SC1's "identical" fails.
**How to avoid:** one `normalise()` used on both sides; assert on bytes in the e2e.

## Code Examples

```js
// REST create with type, one write (Source: docs.github.com/en/rest/issues/issues)
ghWrite(['api', '--method', 'POST', `repos/${repo}/issues`, '--input', '-'],
        { input: JSON.stringify({ title, body, labels, milestone: milestoneNumber, type: 'TRD' }) });
// response: { id, number, type: {name}|null, ... }  -> store id AND number
```
`defaultRunGh` spreads `opts` into `spawnSync`, so `{input}` works unchanged, and `isWriteArgs` already counts `--input` as a write. The fake's `runGh(args)` ignores a second argument today; it must accept `(args, opts)` and read `opts.input`.

```js
// Link and block (Source: docs.github.com/en/rest/issues/sub-issues, .../issue-dependencies)
ghWrite(['api', '--method', 'POST', `repos/${repo}/issues/${parent.number}/sub_issues`, '-F', `sub_issue_id=${child.id}`]);
ghWrite(['api', '--method', 'POST', `repos/${repo}/issues/${blocked.number}/dependencies/blocked_by`, '-F', `issue_id=${blocker.id}`]);
```
`-F` coerces to an integer; `-f` would send a string and 422.

```js
// Wiki write (git, master only)
git(['add', '-A']); if (!git(['diff', '--cached', '--quiet']).ok) git(['commit', '-m', msg]);
git(['pull', '--rebase', 'origin', 'master']) || (git(['rebase', '--abort']), conflict());
git(['push', 'origin', 'HEAD:master']);
```

## Test strategy (strict TDD, hermetic)

- **Every TRD starts with a failing-test commit** (kind plugin; `trd-tdd.cjs` already validates the pairing).
- **Extend `__fixtures__/gh-fake.cjs` in place** (one TRD owns the file), with cases added to `gh-fake.test.cjs` first:
  - `runGh(args, opts)` reading `opts.input` (JSON), so create/patch can carry arrays and ints.
  - REST: `POST/PATCH repos/o/r/issues[/n]` (`id = 1_000_000 + number`, `type` stored, `milestone` by number); `GET repos/o/r`; `GET issues/n/sub_issues`, `POST sub_issues`, `GET parent`, `DELETE sub_issue`; `GET/POST/DELETE dependencies/blocked_by` and `blocking`; `GET orgs/o/issue-types` (404 when `owner:'User'`); issue-field-values GET/POST/PUT; 100-child and one-parent rules; 422 on duplicate link; same-owner rule.
  - Options: `createFakeGitHub({ ownerType:'Organization'|'User', hasWiki, types:[...], fields:[...] })`; controls `setOffline(bool)`, `humanEditBody` (exists), `humanEditComment`.
  - It keeps `--search` unsupported and loud.
- **Wiki fixture** `__fixtures__/wiki-remote.cjs`: `mkdtemp` a bare repo (`git init --bare -b master`), seed a `Home.md` through a scratch clone, expose `remoteUrl` (`file://`), `commit(page, text)` to simulate a human edit, `reject()` to simulate offline (move the dir). `gh-wiki.cjs` takes the remote URL as a parameter and a `_setRunGit` seam, so unit tests need no git while integration tests use the real local git. Pass an env with `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM=/dev/null`, `HOME` = temp, author/committer identity, `GIT_TERMINAL_PROMPT=0`. Skip with a visible reason if `git` is missing.
- **Hermetic state dirs:** every test sets `DEVFLOW_OUTBOX_DIR`, `DEVFLOW_GH_CACHE_DIR` (capability cache lives next to the project cache) and `HOME` to temp dirs; assert the real `~/.claude/devflow/state` mtime/listing is unchanged in one guard test. Install the fake only via `gh-client._setRunGh`, and reset clocks with `_setNow/_setSleep/_resetClient` in `afterEach`, as `gh-e2e.test.cjs` does.
- **Pure units:** codec (budget boundaries 39,999/40,000/60,000/60,001, scope ordering, gaps, fold, hash log), body sections (`meta`, `wiki`, ticked-box merge), wiki page mapping (decimal ids), outbox store (coalesce, FIFO, lock stale, corrupt journal), `classifyFailure`.
- **E2E (new `gh-store-e2e.test.cjs`):** one fixture objective, 3 TRDs in 2 waves, fake + wiki remote:
  - SC1: push -> assert objective + 3 sub-issues + blocked-by edges + wiki page; wipe `.planning/`; `pull --all`; byte-compare the tree.
  - SC2: a 60,001-char TRD -> assert zero write calls on the fake.
  - SC3: scope comments `n=2,1,3` posted out of order -> effective spec ordered; fold on close -> `spec-rev` shows `fold` with hashes.
  - SC4: `setOffline(true)`, enqueue, flush reports pending; reconnect, flush in FIFO; then `humanEditBody` between pull and flush -> exit 2, nothing written, report names the issue.
  - SC5: `ownerType:'User', hasWiki:false` -> same flow, assert labels + `meta` section + `docs/devflow/` pages and the same pull result.
- **Hygiene tests:** `gh-seam.repo.test.cjs` still passes (no new spawn of `gh` outside the client; `git` spawns are allowed only in `gh-wiki.cjs`; extend the seam guard to name that exception rather than relaxing it). Command-surface test for `gh outbox ...` and `gh pull --all`, including the dispatch-completeness extractor that CLAUDE.md warns about (name each command as `gh <sub>` in CLAUDE.md).
- `npm test` must be green (baseline from 46: 6,187 tests, 0 failures).

## Suggested wave decomposition

Files named per TRD so waves are parallel-safe (no two same-wave TRDs share a file).

**Wave 1 (independent, mostly pure):**
- 47-01 `gh-trd.cjs` TRD codec, budget, scope comments, fold, spec-rev (GST-03; SC2, SC3 units).
- 47-02 extend `gh-fake.cjs` + `gh-fake.test.cjs` (REST create/patch with ids, sub-issues, dependencies, types, fields, repo meta, offline, `opts.input`) and new `wiki-remote.cjs` fixture. Fixture only; no production code.
- 47-03 `gh-outbox.cjs` journal store (enqueue/coalesce/FIFO/lock/budget/classifyFailure, `DEVFLOW_OUTBOX_DIR`) (GST-05 store).
- 47-04 `gh-wiki.cjs` wiki store + page mapping + `docs/` backend, tested against a local bare repo created inline (does not depend on 47-02's fixture file; uses its own temp helper, then 47-02's helper can be swapped in later) (GST-06).
- 47-05 extend `gh-body.cjs` (`meta`, `wiki`, criteria tick-merge, scope/spec-rev scanners) and `gh-mapping.cjs` `trds` accessors (GST-02/04 primitives).

**Wave 2 (needs W1):**
- 47-06 `gh-capability.cjs` (probe + cache + degraded decision; uses the fake) (GST-08).
- 47-07 `gh-outbox-flush.cjs` (ordering, idempotent ops, remote-edit halt, offline/rate-limit stop, client retry-policy parameter in `gh-client.cjs`) (GST-05).
- 47-08 `gh-comments.cjs` summary/verification/spec-rev/scope upserts (GST-03, GST-04).

**Wave 3 (needs W2):**
- 47-09 `gh-hierarchy.cjs` push planner + native and degraded backends, Decision issues, enqueue (GST-01, GST-02, GST-08).
- 47-10 `gh-cache.cjs` rebuild + generated ROADMAP/STATE + wiki Roadmap page + `gh-pull.cjs --all` (GST-07).

**Wave 4:**
- 47-11 command surface: `gh sync` pushes the hierarchy, `gh outbox status|flush|resolve`, `gh pull --all`, df-tools dispatch, `config.json` defaults, seam guard update (touches `gh.cjs`, `df-tools.cjs`, `templates/config.json`).
- 47-12 e2e `gh-store-e2e.test.cjs` for SC1-SC5.

**Wave 5:**
- 47-13 docs (CLAUDE.md GitHub bullet naming each command as `gh <sub>`, USER-GUIDE, CHANGELOG `[Unreleased]`, proposal status), full `npm test`, verification evidence.

If the planner wants fewer TRDs, merge 47-05 into 47-01 and 47-08 into 47-09; keep fixture work (47-02) and the outbox pair separate.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Task lists in issue bodies | Native sub-issues (REST + GraphQL), 100 per parent, 8 deep | GA 2025 (REST Dec 2024) | Hierarchy is first-class; keep the task-list only as a fallback |
| Labels as types | Org issue types, REST `type` | 2025 | Org only; labels are the degraded form |
| Project custom fields only | Org issue fields with REST values (public preview Mar 2026, all orgs May 2026; one source says GA) | 2026 | Status uncertain; treat as capability-detected |
| "blocked by" text | Native issue dependencies REST | 2025 | Use edges for wave order |

**Deprecated/outdated in this repo:** `gh.cjs` `linkSubIssue` (GraphQL, node-id lookups, 2 reads + 1 write per link) should be re-pointed at the REST path once the new linker exists; keep its signature for `resolve`.

## Open Questions

1. **Issue-field definition discovery path.**
   - Known: values endpoints are documented; definitions "REST API for organization issue fields" exists.
   - Unclear: exact list path and whether GraphQL needs a preview header now.
   - Recommendation: resolve in 47-06 by one manual `gh api` check by a human; until confirmed, treat failure to list as "fields unavailable" and degrade. Non-blocking.
2. **Does an unset org type (types enabled but `TRD` not defined) reject or silently drop?**
   - Docs say silently dropped without push access; behaviour for an unknown name is unverified.
   - Recommendation: per-type verification of the response and per-type label fallback.
3. **SUMMARY or scope comment over the 65,536 limit.**
   - Recommendation: `kind=summary` split into numbered parts with a shared marker; refuse scope comments > 60K (they should be a new TRD per the proposal). Planner to confirm.
4. **Does fold rewrite the body of a closed TRD or leave comments marked?**
   - Recommendation: replace the body, keep comments, record `folded_through`. Confirm with the planner since "frozen" semantics apply to execution only.
5. **Where wiki clone lives.** Recommendation above: `.planning/wiki/` plus `.git/info/exclude`. Objective 48 (gitignore `.planning/`) must not conflict.
6. **Wiki revision URL format** (LOW) and the private-repo-plan question (proposal open item): keep both behind one function and a capability report string.
7. **Does `gh api --input -` pass stdin when `opts.input` is set?** `spawnSync` supports it with `stdio: pipe`; confirmed by reading `defaultRunGh`, but there is no existing test; add one in 47-07.
8. **Round-trip scope for OBJECTIVE.md.** Recommendation: the full file is stored verbatim as the wiki page, the issue body is a summary view. Confirm that CONTEXT/RESEARCH pages should also be in the SC1 byte comparison.

## Sources

### Primary (HIGH confidence)
- Repo source read directly: `plugins/devflow/devflow/bin/lib/gh-client.cjs`, `gh-body.cjs`, `gh-mapping.cjs`, `gh-issue.cjs`, `gh-pull.cjs`, `gh.cjs` (`linkSubIssue`), `awareness-store.cjs`, `hook-marker-store.cjs`, `sync-state.cjs`, `helpers.cjs` (`execGit`), `__fixtures__/gh-fake.cjs`, `gh-fake.test.cjs`, `gh-shim.test.cjs`, `gh-e2e.test.cjs`, `templates/config.json`.
- `docs/PROPOSAL-github-system-of-record.md`, `.planning/objectives/46-github-sync-foundations/46-RESEARCH.md` and `46-VERIFICATION.md`, objectives 47-49 OBJECTIVE.md.
- https://docs.github.com/en/rest/issues/sub-issues - endpoints, `sub_issue_id`, same-owner rule, `replace_parent`
- https://docs.github.com/en/rest/issues/issue-dependencies - `blocked_by` endpoints, `issue_id`
- https://docs.github.com/en/rest/orgs/issue-types - org endpoints, admin requirement
- https://docs.github.com/en/rest/issues/issues - `type` and `milestone` params, silent drop without push
- https://docs.github.com/en/rest/issues/issue-field-values - values endpoints, org-only

### Secondary (MEDIUM confidence)
- https://github.blog/changelog/2026-05-21-issue-fields-are-now-in-public-preview-for-all-organizations/ and community discussion #189141 - issue fields status (preview vs GA conflict)
- https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues and community discussion #139932 - 100 sub-issues, 8 levels, closed children count
- Community discussions on wiki clone failing until a first page exists, and wiki default branch `master` (community #175621, #48537)

### Tertiary (LOW confidence)
- Wiki page revision URL form `/wiki/<Page>/<sha>`; 65,536 comment body limit (community-confirmed, not in the REST docs); `gh auth git-credential` helper usage for wiki clone.

## Metadata

**Confidence breakdown:**
- Standard stack and reuse points: HIGH, read from source.
- Architecture and outbox design: MEDIUM, derived from locked proposal and existing store patterns; no prototype run.
- GitHub API shapes: MEDIUM, official docs, not live-tested (tests cannot call GitHub).
- Pitfalls: MEDIUM-HIGH.

**Research date:** 2026-09-30
**Valid until:** 2026-10-30 for stack, 2026-10-14 for issue fields and sub-issue limits (fast-moving)
