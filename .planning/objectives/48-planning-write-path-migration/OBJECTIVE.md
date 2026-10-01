---
objective: 48-planning-write-path-migration
kind: plugin
work: refactor
status: registered
milestone: v1.4
depends_on: Objective 47
---

# Objective 48 — Planning write-path migration

Registered 2026-09-30. Part of the GitHub system-of-record plan (objectives 46–51); design in
`docs/PROPOSAL-github-system-of-record.md`.

## Goal

Skills and agents change planning state only through df-tools verbs that write to GitHub, and `.planning/` becomes a gitignored cache.

## Requirements

- **GWP-01** df-tools verbs cover every planning write: `plan put-trd`, `objective put|set-status`, `summary post`, `verification post`, `decision open|answer`, `todo add`, wiki `doc put`.
- **GWP-02** Every skill, workflow and agent that writes planning files uses the verbs (planner, executor, verifier, research, discuss, new-project, adopt, milestone, todo, decide).
- **GWP-03** Edit gate denies Edit/Write/MultiEdit on cached planning files and names the verb to use; Bash writes to the cache are flagged by `validate`.
- **GWP-04** `.planning/` gitignored in GitHub mode (runtime + cache); repo keeps only `.planning/config.json` if needed.
- **GWP-05** Job-checker enforces the TRD scope budget and linked-bulk rule.

## Constraints

- Design source: `docs/PROPOSAL-github-system-of-record.md` (decisions locked 2026-09-30; do not re-litigate).
- Strict TDD (kind plugin/cli): failing test committed first.
- Tests mock `gh` via `_setRunGh` / temp dirs and env overrides; never call the real GitHub API or touch the real `~/.claude`.
- Never use port 8080.

## Success Criteria

1. A grep audit test finds no skill/agent/workflow writing planning files directly (CI test, like doc-refs).
2. The edit gate denies a direct TRD edit with a message naming `plan put-trd`.
3. Plan → execute → verify on a fixture project leaves `git status` clean apart from code.
4. `npm test` green.

## Decisions

Recorded 2026-10-01 at planning. U-n are user decisions (binding); D-n are planning decisions that settle the research open
questions using the research recommendations. TRDs cite them by id.

### User decisions (binding)

- **U-1 Store-mode tracked set.** Only `.planning/config.json` and `.planning/STACK.md` stay tracked in store mode (gitignore
  `.planning/*` plus two negations). Everything else under `.planning/` is gitignored cache or runtime.
  - `debug/` sessions and `quick/` tasks become typed GitHub issues: issue types `Debug` and `Quick`; degraded mode records them as
    `devflow:type/Debug` / `devflow:type/Quick` labels plus the role label, following objective 47's degraded pattern. They get outbox
    roles, mapping entries, flusher branches and cache materialisation, like todos.
  - Milestones map to native GitHub milestones (`milestone` verbs, `milestones/` archives and MILESTONES.md content). Where a
    milestone description will not hold the detail, it goes to the wiki (see D-05).
  - `research/` and objective RESEARCH.md are wiki pages.
- **U-2 Linked-bulk rule (GWP-05).** Warn on any fenced block over 8,000 characters, and on fenced content over 40% of a TRD that
  is 40,000 characters or longer. A warning, never a block. Lives in `df-tools verify trd-pre` and a job-checker dimension.
- **U-3 Todos ship as GitHub issues in 48:** new `todo` outbox role, id scheme, mapping, flusher branch and materialisation, so
  `check-todos` keeps working off the cache.

### Planning decisions

- **D-01 Mode switch.** `lib/planning-mode.cjs` (pure, fs-only) is the only reader of `github.store` for planning decisions: mode is
  `store` iff `github.enabled === true && github.store === true` in the MAIN checkout's `.planning/config.json`; otherwise `local`.
  **Invariant:** in `local` mode (the default and this repo's config) every verb writes the same `.planning/` file, at the same path,
  with the same bytes as today; `.planning/` stays tracked; the gate's cache deny is inactive. A store-off parity test pins it (48-22).
- **D-02 Path classes** (`lib/planning-paths.cjs`, total over `.planning/`): `tracked-config` (config.json, STACK.md), `cache`
  (verb-owned: objective docs, TRDs, SUMMARY, VERIFICATION, UAT, PROJECT, REQUIREMENTS, codebase/adr/retros, research/, milestones/,
  todos/, debug/, quick JOB/SUMMARY, decisions/, wiki/), `generated` (ROADMAP.md, STATE.md, MILESTONES.md), `runtime` (any
  dot-prefixed first segment, state.json, STATE_ARCHIVE.md, SESSION_PICKUP.md, evidence/, workstreams/, any other quick-dir file,
  and the default for anything unclassified).
- **D-03 Entity issues.** Ids `todo-<stem>`, `debug-<stem>`, `quick-<N>`. Body = entity codec (`devflow:id` + `devflow:file` header,
  file verbatim), separate from the strict TRD codec. Todo: label `devflow:todo`, no issue type (the proposal's entity table). Debug /
  Quick: types `Debug` / `Quick`, labels `devflow:debug` / `devflow:quick`. Debug and Quick are OPTIONAL types: a missing one degrades
  that type only and never flips the repo-wide `types` mode or the degraded notice for Objective/TRD/Decision. `todos/completed/*` (the
  `todo complete` location, `init.cjs completed_dir`; the legacy `todos/done/*` used by check-todos.md is read as closed too) and
  `debug/resolved/*` are closed (completed); quick closes on `quick summary`.
- **D-04 Research to wiki.** `research/<stem>.md` ↔ wiki `Research-<stem>`; objective `*-RESEARCH.md` keeps 47's
  `Objective-<N>-<Slug>-Research`. Other objective-dir docs (`*-UAT.md`, `*-EVIDENCE.md`, `*-ROLLOUT.md`, `*-DISCOVERY.md`, ...) get a
  generic `Objective-<N>-<Slug>-<Suffix>` rule.
- **D-05 Milestones.** Native milestone titled `<milestone_prefix><version>`; description is at most 1,000 characters: the entry's
  first paragraph plus a link to wiki page `Milestone-v<X_Y>` (dots to underscores, like 47's `Retro-v1_3`), which holds the full
  MILESTONES.md entry (cache `milestones/vX.Y.md`). Archives `milestones/vX.Y-<KIND>.md` ↔ `Milestone-v<X_Y>-<Kind>`. MILESTONES.md is a generated view in store mode. Milestone writes
  are direct, idempotent gh-client calls in the new `gh-milestone-store.cjs` (46's `gh-milestone.cjs` stays pure local I/O) (find-or-create by title, PATCH by number), the same documented
  exception as 47's milestone bootstrap; offline the verb exits 1 before any remote write.
- **D-06 Budget.** `plan put-trd`: store mode refuses an encoded body over 60,000 and warns at 40,000+; local mode warns only (this
  repo has a 69K TRD). `verify trd-pre` `trd_budget`: over 60K is a blocker in store mode, a warning locally; linked-bulk (U-2) is
  always a warning.
- **D-07 STATE.md in store mode (OQ2).** STATE.md is a generated view; `state *` mutators write `state.json` only and say so. `state
  add-decision` also prints a hint that durable decisions belong in `decision open`. Local mode unchanged.
- **D-08 `objective set-status` vocabulary (OQ4).** `planned | in_progress | verifying | complete | cancelled | reopened`. Terminal
  ones enqueue `patch-issue`: complete → closed/completed, cancelled → closed/not_planned, reopened → open. Non-terminal ones write
  OBJECTIVE.md frontmatter `status:` through `objective put` (wiki push); the Project v2 Status field follows on the next `gh sync`
  (47's direct path). Local mode: frontmatter `status:`; `complete` also runs today's `objective complete`.
- **D-09 Decision answers (OQ5).** `decision answer <trd>-d<k>` enqueues `upsert-comment {kind:'answer'}` + `patch-issue {state:closed,
  state_reason:completed}`; the flusher's `issueRef` already resolves `-dK` ids through mapping `trds` (pinned by a test in 48-06).
  Local mode: `decision open|answer` = today's `decision-queue add|resolve` files.
- **D-10 Plugin version lag (OQ7).** The cache deny takes effect only once the installed plugin is at least the release carrying 48.
  48 does not change the agent allowance; it adds a regression test (`agent_type: devflow:executor` on a code path = allow), and the
  docs cite the doctor plugin-cache check. No release or rollout happens inside 48 (separate explicit approval).
- **D-11 Push batching.** `plan put-trd ... --no-push` + one `plan push <objective>`; without `--no-push` put-trd enqueues the push.
- **D-12 Executor progress.** `summary checkpoint <trd> --from <file>`: local writes SUMMARY.md exactly as today; store writes runtime
  `.planning/.trd-progress/<trd>.md`, never enqueued. `summary post` is the single GitHub write per TRD.
- **D-13 Drafts.** Verbs take content with `--from <path>` (or `-` for stdin). `planning draft <rel>` prints an absolute draft path
  under `os.tmpdir()/devflow-drafts/<repo-key>/` seeded with the current cache content, so agents edit drafts, never the cache.
- **D-14 Worktrees.** Verbs, gate and validate resolve the MAIN checkout (`planning-mode.resolveMainRoot`, fs-only `.git` file →
  `commondir`) before touching any store, so worktree runs share one journal and cache.
- **D-15 Ledger + W055.** Verb writes are recorded in `verb-writes.json` beside the cache index (outbox state dir, never in the repo).
  Baselines are recorded only after a completed flush; `gh outbox flush` settles the ledger. `validate health` W055 flags a cache file
  whose hash matches neither baseline nor ledger (store mode only, advisory).
- **D-16 47's direct writes stay direct** (objective issue create, labels, milestone bootstrap, sticky state comment, Project fields);
  `objective put` calls `gh.syncObjective` for find-or-create.
- **D-17 Migration 0010** (`confirm`): writes the U-1 gitignore block and untracks ignored classes, only when the outbox is empty, a pull
  shows no `local_modified`, and every cache-class file has a baseline. `planning import` enqueues pre-existing todos, debug, quick,
  research, milestones and decisions first. Files with no GitHub home are listed as "local only after untrack"; working copies stay.
- **D-18 Gate.** In store mode the cache/generated deny is checked first for planning paths and ignores `skillActive` and devflow agents;
  `DEVFLOW_SKIP_EDIT_GATE=1`, `gates.editGate: off|warn` and the `.edit-override` phrase still apply. No new escape.
- **D-19 Existing writers in store mode.** `roadmap *` / `sync-roadmap`: no-op exit 0 ("generated; run `gh pull --all`"). `objective
  remove`: refused. `objective add|insert`: dir + OBJECTIVE.md, then `objective put`. `frontmatter set|merge` on a cache path: refused,
  naming the verb. `template fill`: writes the draft cache file and records it in the ledger. `requirements mark-complete`: `doc put`.
- **D-20 Commit per path.** `df-tools commit` checks ignore status per requested planning path and reports ignored ones in
  `skipped_planning`; local whole-directory behaviour unchanged.
- **D-21 Audit ratchet.** SC1 test lands first with per-group baseline files (`plan`, `execute`, `verify`, `bootstrap`, `work`, `misc`);
  each prose TRD empties its own group; 48-23 deletes the baselines and asserts zero.
