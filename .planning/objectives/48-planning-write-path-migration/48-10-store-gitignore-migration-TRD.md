---
objective: 48-planning-write-path-migration
trd: "10"
type: tdd
wave: 2
depends_on: ["48-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.cjs
  - plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs
  - plugins/devflow/devflow/bin/lib/misc.cjs
  - plugins/devflow/devflow/bin/lib/misc-commit.test.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/24-store-cache-tracked.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/24-store-cache-tracked.test.cjs
autonomous: true
requirements: [GWP-04]
must_haves:
  truths:
    - "Migration 0010 (`safety: 'confirm'`) is applicable only in store mode when `.planning/` content outside the U-1 tracked set is tracked, or the managed gitignore block is missing; in local mode `detect` is never applicable (this repo is untouched)"
    - "`apply` refuses — writing nothing — unless the outbox journal has no pending/blocked ops and every cache-class file's hash equals its cache baseline; the refusal lists each blocking file/op and says to run `df-tools planning import`, `gh outbox flush`, `gh pull --all` first"
    - "When allowed, `apply` backs up, writes a managed `.gitignore` block with exactly `.planning/*`, `!.planning/config.json`, `!.planning/STACK.md` (U-1), removes every other tracked `.planning/` path from the INDEX only, and leaves every working file in place; re-running is a no-op"
    - "The report lists files with no GitHub home (runtime class, e.g. workstreams/, STATE_ARCHIVE.md, quick-dir extras) as 'local only after untrack' (D-17)"
    - "`df-tools commit` checks ignore status PER requested planning path: ignored ones are reported in `skipped_planning` and not staged; non-ignored planning paths (config.json, STACK.md) and code still commit; local mode (nothing ignored) behaves exactly as today (D-20)"
    - "Doctor check `store-cache-tracked` warns when store mode is on and 0010 is applicable, with `fix_command` `df-tools upgrade --apply --only 0010 --confirm`, report-only (not fixable by doctor --fix)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.cjs
      provides: "id 0010, safety confirm, detect, apply, discover, preconditions"
    - path: plugins/devflow/devflow/bin/lib/misc.cjs
      provides: "cmdCommit per-path ignore filter"
    - path: plugins/devflow/devflow/bin/lib/doctor-checks/24-store-cache-tracked.cjs
      provides: "doctor project check for store-mode tracking"
  key_links:
    - "Reuses 0008's approach (`git check-ignore --no-index`, scrubbed git env, index-only removal, staged-removal-safe commit in cmdCommit) and `managed-block.cjs`; classification from planning-paths (48-01)"
---

# TRD 48-10: Migration 0010 — gitignore `.planning/` in store mode; per-path commit filter; doctor check (GWP-04)

<objective>
Turn the U-1 tracked set into a repository state: a confirm-only migration that, once everything is safely on GitHub, ignores
`.planning/*` except config.json and STACK.md and untracks the rest; make `df-tools commit` handle the new partially ignored layout; let
doctor report a store-mode project that still tracks its cache.

Purpose: GWP-04, D-17, D-20. Output: migration 0010, cmdCommit fix, doctor check 24, tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: characterization first for cmdCommit — pin today's results for (a) planning-only commit, (b) planning + code, (c) `.planning`
  wholly ignored, (d) `commit_docs:false`. RED before GREEN everywhere.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Git fixtures: real `git init` in temp dirs with the same isolated env 0008's tests use (`GIT_CONFIG_GLOBAL=/dev/null`, author env, scrubbed
  redirect vars). No network, no real `~/.claude` (backups go to a temp `userHome`), never port 8080.
- The migration never runs `gh` or a pull; preconditions are local (journal + cache index). It never deletes or rewrites working files.
- `upgrade-project.js` must never apply it (confirm migrations are notices only) — assert via the upgrade runner in a test, not by editing the hook.

## Decisions

U-1, D-17, D-20. Settled here:

- **Discovery** (`discover(ctx)`): `git ls-files -z -- .planning` → classify each path (strip `.planning/`); `track` = class `tracked-config`;
  everything else is `untrack`. Nested `**/.planning/` is out of scope for 0010 (store mode is a root-level config); note it in the header.
- **detect**: `planningMode(projectRoot).mode === 'store'` AND (`untrack` non-empty OR the managed block is absent/different). Local mode → not applicable.
- **Preconditions** (apply only): (1) `gh-outbox` journal for this root has no op with status `pending` or `blocked` and no `halted`; (2) for every
  cache-class file on disk, `contentHash(text) === readCacheIndex(root)[rel]`. Each failure is listed: `outbox: N pending op(s)`; `<rel>: not on
  GitHub yet (no baseline)` / `<rel>: changed since last sync`. Refusal returns `{applied:false, refused:'<reason>', details}`.
- **Gitignore**: managed block via `managed-block.cjs` with markers `# >>> devflow store (0010) >>>` / `# <<< devflow store (0010) <<<`, body =
  `planningPaths.gitignoreLines()`. Verify with `git check-ignore --no-index` that config.json and STACK.md are NOT ignored and a TRD path IS.
- **Untrack**: `git rm -r --cached --quiet -- <paths>` in batches (argv length safe); report counts by class.
- **Report**: `{applied, untracked:{cache, generated, runtime}, local_only:[runtime rels], gitignore:'.gitignore', backup}`; `local_only` text:
  "kept on this machine only after untrack (no GitHub home)".
- **cmdCommit**: replace the whole-dir probe with: if `commit_docs` false → today's behaviour; else compute `ignoredPlanning` = requested planning
  paths for which `git check-ignore -q --no-index <path>` succeeds (single `git check-ignore --stdin -z --no-index` call). Drop them into
  `skipped_planning`; keep `reason:'skipped_gitignored'` when the drop empties the list (today's result shape). When `.planning` itself is ignored
  the result equals today's.
- **Doctor 24**: `scope:'project'`, runs `m0010.detect`; applicable → `warn`, finding "store mode is on but N .planning/ path(s) are still tracked",
  `fixable:false`, `fix_command:'df-tools upgrade --apply --only 0010 --confirm'`; otherwise `ok`.

## Test list

cmdCommit (`misc-commit.test.cjs`, new file)
1-4. Characterization (a)-(d) above: committed files and JSON result keys as today.
5. Repo with the U-1 block: `commit "docs: x" --files .planning/objectives/07-x/07-01-a-TRD.md .planning/config.json src/a.cjs` → commits config.json and src/a.cjs; `skipped_planning` = the TRD path; exit 0.
6. Same repo, only ignored planning paths requested → `{committed:false, reason:'skipped_gitignored'}`.
7. Local repo (no block): planning path commits as today (no `skipped_planning`).

migration 0010
8. Local mode project with tracked `.planning/` → `detect` not applicable.
9. Store mode, outbox has a pending op → `apply` refuses naming `1 pending op`; `.gitignore` and index unchanged.
10. Store mode, a TRD with no baseline → refusal lists `<rel>: not on GitHub yet`.
11. Store mode, all cache files baselined, empty journal → applies: block written; `git ls-files .planning` = config.json + STACK.md; working files byte-identical; `local_only` lists `workstreams/a.md`, `STATE_ARCHIVE.md`.
12. Re-run → not applicable; `.gitignore` unchanged.
13. `upgrade.apply({projectRoot})` without `--confirm` / `only` does not run 0010 (confirm safety honoured).
14. Backup written under the temp `userHome` backups dir before changes.

doctor 24
15. Store mode + applicable → warn with the exact fix_command, `fixable:false`; local mode → ok; no `.planning` → ok.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Per-path ignore filter in df-tools commit (tests 1-7)</name>
  <files>plugins/devflow/devflow/bin/lib/misc.cjs, plugins/devflow/devflow/bin/lib/misc-commit.test.cjs</files>
  <action>
Create `misc-commit.test.cjs` (call `cmdCommit` through `node plugins/devflow/devflow/bin/df-tools.cjs commit ... --raw` with `cwd` = temp repo).
Commit tests 1-4 (characterization, green). RED: tests 5-7; commit `test(48-10): commit filters ignored planning paths per path`.
GREEN: implement the per-path filter in `cmdCommit` (L507-533) keeping the order comment (commit_docs first, then ignore probe, before the 44-06
removal detection). Add a helper `ignoredPaths(cwd, paths)` next to `isGitIgnored`. Commit `fix(48-10): commit skips ignored planning paths per path`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/misc-commit.test.cjs plugins/devflow/devflow/bin/df-tools.test.cjs</verify>
  <done>Tests 1-7 pass; df-tools.test.cjs commit cases unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Migration 0010 store-gitignore (tests 8-14)</name>
  <files>plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.cjs, plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs</files>
  <action>
RED: tests 8-14 (temp git repos; store-mode config; outbox journal + cache index seeded under `hermeticEnv()` via `gh-outbox.enqueue` and
`gh-cache.recordCacheBaseline`). Commit `test(48-10): migration 0010 store gitignore`.
GREEN: implement `0010-store-gitignore.cjs` exporting `{id:'0010', title:'Gitignore the planning cache in GitHub store mode', since:'2.13.0',
safety:'confirm', detect, apply, discover}`; header comment explains U-1, the preconditions, why confirm-only, and the 0008 lessons reused.
Commit `feat(48-10): migration 0010 gitignores the planning cache in store mode`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs plugins/devflow/devflow/bin/lib/upgrade.test.cjs</verify>
  <done>Tests 8-14 pass; upgrade suite green (registry picks up 0010 by filename).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Doctor check 24 store-cache-tracked (test 15)</name>
  <files>plugins/devflow/devflow/bin/lib/doctor-checks/24-store-cache-tracked.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/24-store-cache-tracked.test.cjs</files>
  <action>
RED: test 15 using `__fixtures__/doctor-fixtures.cjs` helpers. Commit `test(48-10): doctor store-cache-tracked`.
GREEN: implement per the doctor-checks README contract; require `../migrations/0010-store-gitignore.cjs` (never re-implement discovery). Commit
`feat(48-10): doctor reports a tracked cache in store mode`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/doctor-checks/24-store-cache-tracked.test.cjs plugins/devflow/devflow/bin/lib/doctor.test.cjs</verify>
  <done>Test 15 passes; doctor engine suite green (loader picks up 24-*).</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `migrations/0008-runtime-state-untrack.cjs` (header L1-34): `git check-ignore --no-index`, `gitEnv()` scrubbing, index-only removal, `discover(ctx)` exported for doctor.
- `misc.cjs` L507 `cmdCommit`, L520 the whole-dir probe, L481 `stagedRemovalsOnDisk` (whole-index commit when a removal is still on disk).
- `doctor-checks/20-legacy-runtime-state.cjs` — a doctor check built on a migration's `discover`.
</codebase_examples>
<anti_patterns>
- A bare `.planning/` ignore rule: it hides config.json, so a fresh clone cannot detect store mode.
- Running `gh pull --all` inside the migration: upgrade must stay offline; preconditions are checked against local state only.
</anti_patterns>
<error_recovery>
- If `git rm --cached` partially fails, restore the index from the backup's recorded path list (`git reset -q -- <paths>`) and refuse with the git stderr.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/misc-commit.test.cjs plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/24-store-cache-tracked.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/migrations/*.test.cjs plugins/devflow/devflow/bin/lib/upgrade*.test.cjs plugins/devflow/hooks/upgrade-project.test.js</regression>
</validation_gates>

<verification>
- `node plugins/devflow/devflow/bin/df-tools.cjs upgrade --check --raw` in this repo (store off): 0010 not applicable.
</verification>

<success_criteria>
A store-mode project can safely stop versioning its cache with one confirmed command, commits keep working afterwards, and doctor says when that step is still due.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-10-SUMMARY.md`
</output>
