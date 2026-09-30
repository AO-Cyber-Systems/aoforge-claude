---
objective: 45-devflow-doctor
trd: "10"
job: 45-10
subsystem: hooks
tags: [sc1, hook-markers, verify-commits, verify-completion, audit, tdd, fail-open]

requires:
  - objective: 44-autonomy-hardening
    provides: "verify-commits.js / verify-completion.js autonomous retry and resume logic (semantics preserved unchanged)"
  - objective: quick-25
    provides: "progress-guard-store.cjs pattern: builtins only, fail-open, env override for tests"
provides:
  - "bin/lib/hook-marker-store.cjs: markerRoot(env, home), markerDir(projectRoot, {env, home}), markerFile(projectRoot, name, {env, home}), sanitize(name), cleanStale(dir, nowMs, ttlMs, prefix)"
  - "verify-commits retry marker at <markerRoot>/<repo-key>/autonomous-retry-<agent>; verify-completion resume counter at <markerRoot>/<repo-key>/autonomous-resume-<objective>; neither is under .planning/"
  - "hooks/planning-writes.audit.test.js: the SC1 behavioral + static audit (45 tests)"
affects: [45-06 legacy-runtime-state check (cleans leftover in-tree .autonomous-retry-* / .autonomous-resume-*), 45-01 awareness cache move, any future hook that writes into .planning/]

tech-stack:
  added: []
  patterns:
    - "Runtime hook state lives under ~/.claude/devflow/state/<store>/<repo-key>/, keyed by upgrade.repoKey, with an env override for tests"
    - "A marker that cannot be written means the hook does not block (write precedes the block output), never an endless block"
    - "SC1 is guarded by two audits: behavioral (spawn every registered hook, diff .planning dotfiles) and static (classify every dotfile literal, naming file:line)"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/hook-marker-store.cjs
    - plugins/devflow/devflow/bin/lib/hook-marker-store.test.cjs
    - plugins/devflow/hooks/planning-writes.audit.test.js
  modified:
    - plugins/devflow/hooks/verify-commits.js
    - plugins/devflow/hooks/verify-commits.test.js
    - plugins/devflow/hooks/verify-completion.js
    - plugins/devflow/hooks/verify-completion.test.js

key-decisions:
  - "Both autonomous markers move to the hook marker store rather than being gitignored: SC1 is about the file watcher attaching in-tree files, and an ignored file is still watched"
  - "The audit allowlist stays exactly {.skill-active, .edit-override, .devflow-notices.json}; .devflow-notices.json is the one documented exception (written only when an upgrade produces a notice, cleared on emission)"
  - "In-tree legacy markers are neither read nor written; tests prove a legacy counter at the cap and a legacy retry marker are ignored and left untouched for the doctor"
  - "The static table gained two extra buckets (NOT_UNDER_PLANNING, EXTENSIONS) beyond ALLOWED_WRITES / READ_ONLY, because a lexical scan cannot tell a .planning-relative literal from '.git' or '.json' without an explicit classification"
  - "awareness-cache-populate is called in-process with a stubbed spawn instead of spawned, so its detached df-tools child never outlives the test"

patterns-established:
  - "Audit variants declare expect: 'block' (must reach the decision branch) and expectChanged (must write a named allowlisted dotfile), so the audit cannot pass vacuously"
  - "The audit runs hooks with a minimal env (PATH, HOME, TMPDIR, store overrides): a developer's DEVFLOW_SKIP_* can never mask a write"

requirements-completed: [DOC-01]

metrics:
  duration: "about 14 minutes (11:12Z to 11:26Z), including one resume"
  completed: 2026-09-30
  tasks: 3
  files: 7

verification:
  gates_defined: 3
  gates_passed: 3
---

# Objective 45 TRD 10: Autonomous hook markers leave `.planning/`, plus the SC1 audit Summary

**verify-commits' retry marker and verify-completion's resume counter now live in `~/.claude/devflow/state/hook-markers/<repo-key>/` via a new fail-open `hook-marker-store.cjs`, and a 45-test audit (behavioral + static) fails CI whenever any hook writes a new dotfile into `.planning/`.**

## What changed

- `hook-marker-store.cjs` (new): `markerRoot` is `$DEVFLOW_HOOK_MARKER_DIR` else `<home>/.claude/devflow/state/hook-markers`. `markerDir` appends `upgrade.repoKey(<dir containing .planning>)`, falling back to the sanitized directory name when the path cannot be resolved. `markerFile` sanitizes the name to `[A-Za-z0-9_-]` (agent ids and objective keys are external input). `cleanStale` removes only regular files with the given prefix older than the TTL. Node builtins plus `upgrade.cjs` (which loads only fs/path/crypto).
- `verify-commits.js`: `retryMarkerPath(planningDir, agentId, env)` returns the store path, the marker write does `mkdir -p` first, and `cleanStaleMarkers(planningDir, env)` sweeps the store directory (1h TTL, `autonomous-retry-` prefix). Export names unchanged. Retry-once semantics unchanged.
- `verify-completion.js`: `resumeCounterPath`, `readResumeCount`, `writeResumeCount`, `clearResumeCount` route through the store. `env` is an optional trailing argument defaulting to `process.env`. Counting and clearing semantics unchanged. `.route-recommendation` handling untouched (read-only).
- `planning-writes.audit.test.js` (new): tests 10a/10 (behavioral, 40 cases), 11/11b (static), 12 (allowlist pin), plus two scanner self-checks.

## Order actually used (RED evidence)

The TRD allowed the audit to be written before Task 1's GREEN so it could prove it catches the pre-fix tree. The real order:

1. `ce22adc` Task 1 RED: store tests plus rewritten verify-commits tests. Both files failed to load (`Cannot find module hook-marker-store.cjs`).
2. `c62472b` Task 3: the audit, committed while both markers were still in-tree. 45 tests: 38 pass, 7 fail. The failures name exactly the two offenders and nothing else:
   - `hook verify-commits.js [autonomous, mid-execution, no recent commits, cwd .] wrote .planning/.autonomous-retry-audit-agent-project` (and the same from the nested `flutter/.planning/`)
   - `hook verify-completion.js [autonomous, mid-execution, cwd .] wrote .planning/.autonomous-resume-45` (both variants, both cwds)
   - static test 11: `hooks/verify-commits.js:110` and `:126` `'.autonomous-retry-'`, `hooks/verify-completion.js:174` `'.autonomous-resume-'` unclassified
3. `15f4fa9` Task 1 GREEN: store plus verify-commits.
4. `c79a1a9` Task 2 RED: 9 of 42 verify-completion tests fail against the in-tree counter.
5. `c33f7bd` Task 2 GREEN: verify-completion through the store.

The audit file was not edited after its RED commit; it went green solely because Tasks 1 and 2 landed (45/45).

## Hooks found beyond the two markers

None. Every other registered hook (sync-runtime, upgrade-project fast and apply paths, awareness-cache-populate, classify-session, auto-continue, gate-executor-stop, route-intent, route-results, gate-commits, changelog-on-tag, gate-interactive, gate-edits, guard-no-progress, statusline) creates or modifies only allowlisted dotfiles. The audit's `expectChanged` checks confirm it observes real allowlisted writes: `.devflow-notices.json` from upgrade-project's apply path and from route-results, `.edit-override` from route-intent.

## Interaction with sibling TRD 45-01 (awareness cache)

At this base, `awareness-cache-populate.js` only READS `.planning/.awareness-cache.json`; the detached `df-tools awareness` child it forks does the write (via `lib/awareness.cjs`). So the audit, which stubs that spawn, sees no write from the hook and the literal `.awareness-cache.json` is classified READ_ONLY (reason recorded in the table). After 45-01 lands the literal disappears from the hook. The static test does not require table entries to stay in use, so it remains correct both before and after 45-01. I did not touch `awareness-cache-populate.js`.

Audit gap to be aware of: because the spawn is stubbed, the audit does not observe the child's write. Until 45-01 lands that write still goes into `.planning/`; after it lands, nothing audits the child's write path. Covering it means running the real `df-tools awareness show --refresh` against the fixture, which needs the network or a scan stub, and I left that out of scope.

## Deviations from Plan

### Auto-fixed Issues

None. There were no bugs or blockers in existing code.

### Plan-level adjustments

**1. Extra classification buckets in the static audit**
- **Why:** A lexical scan sees `'.git'`, `'.claude'`, `'.json'` and `'.planning'` as dotfile-shaped literals. The TRD's two tables (ALLOWED_WRITES, READ_ONLY) would have forced those into READ_ONLY, which is false.
- **What:** Added NOT_UNDER_PLANNING (`.planning`, `.git`, `.claude`, `.claude-plugin`, `.devflow`, `.devflow-handoff`, `.plugin-version`) and EXTENSIONS (`.json`, `.md`, `.tmp`), each with a reason. Test 11b asserts the four tables do not overlap and every entry carries a reason. Test 12 still pins the allowlist to exactly the three names.

**2. Store functions take `env` as an optional trailing argument**
- **Why:** The TRD specified `resumeCounterPath(planningDir, key, env)`; extending that to read/write/clear lets in-process tests avoid mutating `process.env`. Defaults preserve the existing call sites.

**3. Extra tests beyond the TRD list**
- verify-completion: counter increments 1 to 2 across stops, in-tree legacy counter at the cap is ignored (stop still blocked, legacy file untouched), hostile objective key stays inside the store dir.
- verify-commits: second stop is allowed after a real first stop, `.planning/` gains no dotfile.

### Environment notes (not code deviations)

- **Accidental handoff record.** One of my `rg` commands contained the phrase `npm login`, which tripped `gate-interactive.js` and wrote `.devflow-handoff/pending/h-d721fa70.json` into the main checkout (`/Users/justin/dev/devflow-claude`, my Bash cwd). I deleted exactly that file; the other three pre-existing records there are untouched.
- **Probe of the watcher daemon.** When triaging the full-suite failures below I ran `devflow-watch.cjs start ... --foreground` once directly. It exited immediately (exit 3, no PID file, no lingering process) but appended a few lines to the real `~/.devflow/devflow-watch.log`. That was a mistake: it touched real home state rather than a temp HOME. No other real-home writes; every test in this TRD uses a temp HOME and store overrides.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: hook-marker-store + verify-commits | `node --test plugins/devflow/devflow/bin/lib/hook-marker-store.test.cjs plugins/devflow/hooks/verify-commits.test.js` | 0 (37 pass, 0 fail) | PASS |
| 2: verify-completion resume counter | `node --test plugins/devflow/hooks/verify-completion.test.js` | 0 (42 pass, 0 fail) | PASS |
| 3: SC1 planning-writes audit | `node --test plugins/devflow/hooks/planning-writes.audit.test.js` | 0 (45 pass, 0 fail) | PASS |

Done-criteria check for Task 1: the only remaining `.autonomous` text in `verify-commits.js` is a header comment; no `planningDir`-joined marker path remains.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test hook-marker-store.test.cjs verify-commits.test.js` | 1 (both files fail to load: module missing) | FAIL (correct) |
| RED (task 3 audit, pre-fix tree) | `node --test planning-writes.audit.test.js` | 1 (38 pass, 7 fail: both autonomous markers, dynamic and static) | FAIL (correct) |
| GREEN (task 1) | `node --test hook-marker-store.test.cjs verify-commits.test.js` | 0 (37/37) | PASS (correct) |
| RED (task 2) | `node --test verify-completion.test.js` | 1 (33 pass, 9 fail) | FAIL (correct) |
| GREEN (task 2) | `node --test verify-completion.test.js` | 0 (42/42) | PASS (correct) |
| GREEN (audit, final tree) | `node --test planning-writes.audit.test.js` | 0 (45/45) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (per task) | `node --test` on each task's files | 0 | PASS |
| wave | `npm --prefix <worktree> test` | 1 (5505 tests, 5445 pass, 10 fail) | PASS with the 10 environmental failures below |

The 10 failures are all in `devflow/bin/devflow-watch.test.cjs` (5) and `devflow/bin/handoff-e2e.test.cjs` (5): the watcher daemon cannot start because `node-pty` is not installed in the worktree (`Cannot find module 'node-pty'`, from `lib/watcher-shell.cjs`; the worktree has no `node_modules`). The same `devflow-watch.test.cjs` passes 22/22 in the main checkout, which has the module, and none of the files this TRD touches are involved. Nothing in this TRD changed daemon, watcher or handoff code.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (retry marker out of `.planning/`; resume counter out of `.planning/`; markerRoot/repo-key rule; store-dir stale sweep with in-tree leftovers ignored; SC1 audit with the pinned three-name allowlist and an explicit static table)
- Gate failures: none attributable to this TRD (10 environmental, see above)

## Self-Check: PASSED

- Created files present: `hook-marker-store.cjs`, `hook-marker-store.test.cjs`, `planning-writes.audit.test.js`, and this SUMMARY.
- Commits present on `df/exec-45-10`: `ce22adc`, `c62472b`, `15f4fa9`, `c79a1a9`, `c33f7bd`.
- Untouched, per the TRD's file ownership: `awareness-cache-populate.js`, `upgrade-project.js`, migration 0008, `sync-runtime.js`, `hooks.json`, `notices.cjs`, `CLAUDE.md`, `CHANGELOG`, `.planning/STATE.md`, `.planning/ROADMAP.md`.
