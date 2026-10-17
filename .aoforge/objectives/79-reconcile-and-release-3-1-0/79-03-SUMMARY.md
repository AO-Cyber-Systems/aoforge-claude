---
objective: 79-reconcile-and-release-3-1-0
trd: "03"
subsystem: hooks
tags: [pre-bash, dispatcher, equivalence, corpus, mutation, gate-interactive, hooks.json]
requires:
  - 79-01 (merge commit afbe19a4, pre-bash alias fix ef2dae22)
provides:
  - "a hand-built 51-case Bash corpus and an isolated fixture-project builder (hooks/__fixtures__/bash-corpus.js)"
  - "a spawned one-process vs five-process equivalence test with a mutation proof (hooks/pre-bash-equivalence.test.js)"
  - "a lasting hooks.json duplicate-registration check (test 1b)"
affects: [79-08]
tech-stack:
  added: []
  patterns: ["both sides spawned as processes; per-case, per-mode fixture projects; normalised comparison"]
key-files:
  created:
    - plugins/aoforge/hooks/__fixtures__/bash-corpus.js
    - plugins/aoforge/hooks/pre-bash-equivalence.test.js
  modified: []
key-decisions:
  - "No divergence: every corpus case and both five-call sequences were equal on the first run, so no hook and no dispatcher line changed. The mutation proof is the evidence the test bites."
  - "The interactive family uses `gh auth login`: the merged gate-interactive does not gate `ssh` or `vim` (not in INTERACTIVE_PATTERNS). `ssh host` and `vim a.txt` stay in the corpus as silent cases and the sanity anchor checks `! gh auth login`."
  - "The comparison also covers side effects: the handoff records gate-interactive queues, the progress guard's per-session count, and whether the single-turn override marker was consumed."
requirements-completed: [SC-3]
metrics:
  duration: 15min
  started: 2026-10-17T03:18:17Z
  completed: 2026-10-17T03:33:20Z
  tasks: 3
  files: 2
tokens_input: 13781674
tokens_output: 87531
tokens_cache_read: 13558200
tokens_cache_write: 223322
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 79 TRD 03: Re-prove pre-bash one-process equivalence on the merged hooks Summary

**The single pre-bash.js process makes the same decision as the five separately spawned hooks merged with pre-bash's `merge()` on all 51 hand-written Bash commands and on two five-call repeat sequences. Compared: exit code, decision, reasons, context, stderr, queued handoff records, progress-guard count and override-marker consumption. This holds on the merged tree, including objective 73's gate-interactive. A dispatcher copy without gate-interactive diverges on exactly the 6 gated interactive cases, reported by id.**

## Progress
- [x] Task 1: Fixture builder and hand-built corpus — 617af45b
- [x] Task 2: Equivalence test, mutation proof, and fixes for any divergence — f2487a58 (every case equal on the first run, no fix needed); refinement 0d21d302 (chain spawned one by one, as the TRD specifies)
- [x] Task 3: Hook-domain triage rows and registration checks — b3c753f2 (no 79-01 row routed to 79-03; hook domain 1652/1652; duplicate-registration check added as test 1b)

## What was built

- `plugins/aoforge/hooks/__fixtures__/bash-corpus.js`. It exports `makeProject({merging, marker, bashEditGate, aoforge})`, which makes a mktemp git repo with `.aoforge/config.json` (local mode) and `ROADMAP.md`, a tracked `src/a.cjs` and `CHANGELOG.md` (`## [9.9.8]`), one commit and branch `side`, plus a scratch HOME and a guard dir. The env drops every `AOFORGE_*` and `GIT_*` variable. Other exports: `payload`, `caseInput`, `CORPUS` (51 entries, each with a one-line `why` and the expected decision), `SEQUENCES` (2), `normalize` and `cleanup`. The file header records the marker, config, override and pid-file shapes it read from the code.
- `plugins/aoforge/hooks/pre-bash-equivalence.test.js`, 60 tests:
  - Test 1 checks that pre-bash.js is the only PreToolUse hook that fires for Bash and that guard-no-progress fires on every tool except Bash.
  - Test 1b finds no duplicate registration. It includes a sensitivity control.
  - Test 2 runs once per corpus case.
  - Test 3 runs the two sequences.
  - Tests 4a-4d are the sanity anchors.
  - Test 5 is the mutation.

  Both sides are spawned as processes: pre-bash.js once, and each of the five hooks one by one in `DISPATCHED_HOOKS` order, merged with `pre.merge`. Each side gets its own project. Cases run up to 8 at a time. The whole file takes 11 s.
- What the comparison normalises: project root and its realpath become `<P>`, home `<H>`, guard dir `<G>`, mktemp base `<B>`, and a handoff id `h-xxxxxxxx` becomes `<ID>`. Nothing else is rewritten.

## Corpus case table

Both modes were spawned and compared in full ({exit, decision, reasons (set), context, text, stderr lines, handoffs, guard, overrideLeft}). "Decision" is the merged `permissionDecision`. Every case was equal on the first run, so no fix commit exists.

| Case id | Category | Command | Decision (dispatcher) | Decision (chain) | Equal | Fix |
|---|---|---|---|---|---|---|
| benign-ls | benign | `ls -la` | silent | silent | yes | none |
| benign-rg | benign | `rg -n foo src` | silent | silent | yes | none |
| benign-node-test | benign | `node --test x.test.cjs` | silent | silent | yes | none |
| benign-quoted-commit | benign | `echo "git commit -m x"` | silent | silent | yes | none |
| benign-heredoc-commit | benign | `cat <<'EOF'` / `git commit -m x` / `EOF` | silent | silent | yes | none |
| commit-raw | commits | `git commit -m x` | deny | deny | yes | none |
| commit-dash-c | commits | `git -C <P> commit -m x` | deny | deny | yes | none |
| commit-inline-allow | commits | `AOFORGE_ALLOW_RAW_COMMIT=1 git commit -m x` | silent | silent | yes | none |
| commit-merge-head | commits | `git commit --no-edit` (MERGE_HEAD present) | silent | silent | yes | none |
| commit-merge-chain | commits | `git merge side && git commit --no-edit` | deny | deny | yes | none |
| commit-non-aoforge | commits | `git commit -m x` (no `.aoforge/`) | silent | silent | yes | none |
| tag-missing-section | tags | `git tag -a v9.9.9 -m x` | deny | deny | yes | none |
| tag-present-section | tags | `git tag -a v9.9.8 -m x` | silent | silent | yes | none |
| tag-lightweight | tags | `git tag v9.9.9` | deny | deny | yes | none |
| tag-commitish | tags | `git tag -a v9.9.9 -m x HEAD` | deny | deny | yes | none |
| int-gh-auth | interactive | `gh auth login` | deny | deny | yes | none |
| int-ssh-host | interactive | `ssh host` | silent | silent | yes | none |
| int-vim | interactive | `vim a.txt` | silent | silent | yes | none |
| int-keygen-fingerprint | interactive | `ssh-keygen -l -f key.pub` | silent | silent | yes | none |
| int-keygen-find | interactive | `ssh-keygen -F host` | silent | silent | yes | none |
| int-keygen-remove | interactive | `ssh-keygen -R host` | silent | silent | yes | none |
| int-keygen-y | interactive | `ssh-keygen -y -f key` | deny | deny | yes | none |
| int-keygen-y-p | interactive | `ssh-keygen -y -P 'pw' -f key` | silent | silent | yes | none |
| int-quoted-name | interactive | `"gh" auth login` | silent | silent | yes | none |
| int-bash-c | interactive | `bash -c 'gh auth login'` | silent | silent | yes | none |
| int-heredoc-shell | interactive | `bash <<'EOF'` / `gh auth login` / `EOF` | deny | deny | yes | none |
| int-heredoc-data | interactive | `cat <<'EOF'` / `gh auth login` / `EOF` | silent | silent | yes | none |
| int-env-prefix | interactive | `env FOO=1 gh auth login` | silent | silent | yes | none |
| int-compound | interactive | `echo start && gh auth login` | deny | deny | yes | none |
| int-shell-flow | interactive | `nvm use 20` | deny | deny | yes | none |
| int-watcher-live | interactive | `gh auth login` (live pid file, agent_id set) | deny | deny | yes | none |
| write-sed-tracked | writes | `sed -i '' 's/a/b/' src/a.cjs` | ask | ask | yes | none |
| write-redirect-tracked | writes | `echo x > src/a.cjs` | ask | ask | yes | none |
| write-untracked | writes | `echo x > notes.txt` | silent | silent | yes | none |
| write-planning | writes | `echo x > .aoforge/x.md` | silent | silent | yes | none |
| write-skill-marker | writes | `echo x > src/a.cjs` (live skill marker) | silent | silent | yes | none |
| write-strict | writes | `echo x > src/a.cjs` (`bashEditGate: strict`) | deny | deny | yes | none |
| write-aoforge-agent | writes | `echo x > src/a.cjs` (`agent_type: aoforge:executor`) | silent | silent | yes | none |
| write-override-marker | writes | `echo x > src/a.cjs` (fresh `.edit-override`, consumed in both) | silent | silent | yes | none |
| esc-interactive | escapes | `gh auth login` + AOFORGE_SKIP_INTERACTIVE_GATE=1 | silent | silent | yes | none |
| esc-raw-commit | escapes | `git commit -m x` + AOFORGE_ALLOW_RAW_COMMIT=1 | silent | silent | yes | none |
| esc-edit-gate | escapes | `echo x > src/a.cjs` + AOFORGE_SKIP_EDIT_GATE=1 | silent | silent | yes | none |
| esc-changelog | escapes | `git tag -a v9.9.9 -m x` + AOFORGE_SKIP_CHANGELOG_GATE=1 | silent | silent | yes | none |
| combo-commit-interactive | combined | `git commit -m x && gh auth login` (2 reasons kept) | deny | deny | yes | none |
| combo-write-interactive | combined | `echo x > src/a.cjs && gh auth login` (ask reason dropped) | deny | deny | yes | none |
| combo-tag-commit | combined | `git tag -a v9.9.9 -m x && git commit -m y` (2 reasons kept) | deny | deny | yes | none |
| edge-empty-stdin | input | stdin `''` | silent | silent | yes | none |
| edge-non-json | input | stdin `not json {` | silent | silent | yes | none |
| edge-json-null | input | stdin `null` | silent | silent | yes | none |
| edge-read-tool | input | `tool_name: "Read"` payload (guard counts it once) | silent | silent | yes | none |
| edge-no-command | input | Bash payload, `tool_input: {}` | silent | silent | yes | none |

Totals: 51 cases, 51 equal. Decisions: 16 deny, 2 ask, 33 silent.

Sequences (test 3), compared step by step, with one guard count per step in both modes:

| Sequence | Steps 1-5 (both modes) | Guard stderr warning | Equal |
|---|---|---|---|
| repeat-ls (`ls -la` x5) | silent, silent, silent (warning), silent, ask | step 3 only | yes, all 5 steps |
| repeat-commit (`git commit -m x` x5) | deny x5; at step 5 the commit deny outranks the guard's ask, whose reason is dropped | step 3 only | yes, all 5 steps |

## Mutation proof (test 5)

The test copies `plugins/aoforge/hooks` and `plugins/aoforge/aoforge/bin` into a scratch directory with the same relative layout. It deletes the `'gate-interactive.js',` line from the copy's `DISPATCHED_HOOKS` and asserts the copy no longer names it. It then runs all 16 interactive cases with the copy's dispatcher against the real chain.

- Diverged, by id: **int-compound, int-gh-auth, int-heredoc-shell, int-keygen-y, int-shell-flow, int-watcher-live**. The test asserts that this list is exactly the interactive cases the corpus expects gate-interactive to deny (6 of 16). In every diverging case the mutant let the command through (decision null, no handoff record) while the real chain denied it.
- The 10 silent interactive cases stayed equal, as did 4 controls on the copy (benign-ls, commit-raw, tag-missing-section, write-redirect-tracked). So the copy is otherwise sound and the divergence comes from the mutation alone.
- Result: PASS. The test fails when a hook drops out of the dispatcher.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixture builder and corpus | `node -e "const c=require('.../__fixtures__/bash-corpus.js'); const p=c.makeProject({}); console.log(c.CORPUS.length, fs.existsSync(p.root+'/.aoforge/config.json')); c.cleanup(p)"` printed `51 true` | 0 | PASS |
| 2: Equivalence test + mutation | `env HOME=<scratch> node --test plugins/aoforge/hooks/pre-bash-equivalence.test.js`: 60/60 (all corpus cases, both sequences, 4 anchors, mutation) | 0 | PASS |
| 2: pre-bash and per-hook tests | `env HOME=<scratch> node --test pre-bash.test.js 'gate-*.test.js' guard-no-progress.test.js changelog-on-tag.test.js`: 647/647 | 0 | PASS |
| 3: Hook domain | `env HOME=<scratch> node --test 'plugins/aoforge/hooks/*.test.js' hook-inventory.test.cjs doctor-checks/11-12-install.test.cjs`: 1652/1652 | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2: run before touching any hook) | `env HOME=<scratch> node --test plugins/aoforge/hooks/pre-bash-equivalence.test.js`: 59/59 on the first run | 0 | No case failed, so no divergence existed to fix. The mutation case is the evidence that the test bites. |
| GREEN | none needed | n/a | No hook or dispatcher change |
| RED (Task 3) | 79-01's triage routed no row to 79-03, so there was nothing to re-run as RED. Test 1b's sensitivity control (a synthetic doubled registration is reported as `PreToolUse(Bash): a`, `Stop: x`) shows the new check bites. | 0 | n/a |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (loop, scoped) | `node --test plugins/aoforge/hooks/pre-bash-equivalence.test.js plugins/aoforge/hooks/pre-bash.test.js` | 0 | PASS |
| test (task gate, hook domain) | `node --test 'plugins/aoforge/hooks/*.test.js' hook-inventory.test.cjs 11-12-install.test.cjs` | 0 | PASS (1652/1652) |
| test (full suite, `npm test`'s globs, **`plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs` excluded**: its W-3 fish-shell test hangs on this machine) | 409 files from the checkout, empty scratch HOME, no AOFORGE_* variables; `node_modules` symlinked temporarily for node-pty and removed afterwards | 1 | Expected FAIL: 12,830 tests, 12,793 pass, 10 fail, 27 skipped. These are the same 10 failures 79-01 triaged, none of them in the hook domain: context-budget #1 and doc-refs #2 belong to 79-07, planning-verbs-worktree 25-29 and s1 to 79-04, requirements-agreement #11 and validate-requirements #9 to 79-05. The test count rose by 60, which is this TRD's file. |

The scratch HOME after the full suite held `.aoforge-test-fixtures`, `.cache`, `.config`, `.dart-tool`, `.local` and `Library`, and no `.claude`.

## Hook-domain triage (Task 3)

79-01's full-suite triage routed **no** row to 79-03. Its words: "Nothing routes to 79-02, 79-03 or 79-06 from the suite ... pre-bash.test.js 9/9; ... hook-inventory pass". That leaves no cause to fix at a source. The rows the TRD names were re-run together under a scratch HOME and all pass: hook-coexistence, the planning-writes audit, hook inventory, doctor check 12 (11-12-install), pre-bash and the per-hook tests. hooks.json has one PreToolUse(Bash) registration (pre-bash.js). guard-no-progress is registered on `^(?!Bash$).*`. No command fires twice for one event and tool, and test 1b now keeps it that way.

## Deviations from Plan

### Followed the code, not the TRD context (recovery clause of Task 1)

**1. The interactive family uses `gh auth login`, not `ssh host`**
- **Found during:** Task 1, reading `lib/interactive-commands.cjs`
- **Issue:** The TRD's corpus and anchor 4 assume gate-interactive denies `ssh host` (and lists `vim a.txt`). On the merged tree, INTERACTIVE_PATTERNS covers only auth logins, passwd, ssh-keygen and shell-flow tools. Neither `ssh` nor `vim` is gated.
- **Fix:** The `"ssh" host`, `bash -c 'ssh host'`, heredoc and `env FOO=1` variants use `gh auth login` instead. `ssh host` and `vim a.txt` stay as silent cases. Anchor 4c checks `! gh auth login` and also asserts that `ssh host` is silent. Both points are recorded in the fixture header.

**2. The fixture writes `.aoforge/ROADMAP.md`**
- **Issue:** gate-commits denies only when `.aoforge/ROADMAP.md` or `.aoforge/objectives/` exists (TRD 23-02). The TRD's fixture spec names only config.json, and with that alone the commit gate never fires.
- **Fix:** makeProject writes ROADMAP.md. This is recorded in the header.

**3. A lightweight `git tag v9.9.9` is gated**
- **Issue:** The TRD lists it as a separate case without saying what to expect. changelog-on-tag's TAG_RE makes `-a` optional, so a lightweight tag is denied the same way an annotated one is.
- **Fix:** The case expects deny. Both modes agree.

### Additions beyond the Test list (strengthen, do not weaken)
- The test also compares side effects: queued handoff records (with session_id and agent_id), the progress-guard count, and override-marker consumption. It asserts each case's expected decision, and the reason count for the combined cases, so that equivalence cannot hold between two equally broken sides on any case.
- Test 1b, the duplicate-registration check, turns Task 3's "registrations unique" into a lasting check.
- The corpus has 51 cases, above the 35-45 guidance. Cases run 8 at a time, so the file takes 11 s and the speed concern behind that guidance does not apply.

**Total deviations:** 3 TRD-context corrections (the code was followed) and 0 auto-fixes. **Impact:** none on scope. The proof covers every category the Test list names.

## Observations (no change made)

- In-process, gate-commits's `deny()` calls `process.exit(0)` inside `main()`'s catch-all `try`. pre-bash's stub turns that `exit` into a thrown `HookExit`, and gate-commits's own `catch {}` swallows it. This is harmless today: the deny JSON is already on stdout, the code is 0 either way, and nothing runs after the catch (`commit-raw`, `combo-*` and `repeat-commit` all prove equality). A future hook that exits **2** inside its own catch-all would lose the block in-process, while standalone it would keep it. One possible hardening in pre-bash.js `runHook` is to record the code inside the `process.exit` stub, so a swallowed `HookExit` still sets the result's code. This was not done because no divergence was found and the TRD says to modify pre-bash.js only for one. It is recorded for whoever next touches the dispatcher.

## Findings handed to other TRDs

None new. The full-suite failures are unchanged from 79-01's triage (79-04, 79-05, 79-07).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6. Corpus equivalence: 51/51. The objective 73 surface and the five-call warn/ask sequence: 2/2. The mutation diverges by id. Registrations are unique and correct. The hook-domain rows pass (none were routed). Every hook test ran with a scratch HOME and AOFORGE_* stripped.
- Gate failures: the full-suite gate fails on the 10 known rows owned by 79-04, 79-05 and 79-07. None is in this TRD's domain.

## Self-Check: PASSED

- FOUND: plugins/aoforge/hooks/__fixtures__/bash-corpus.js
- FOUND: plugins/aoforge/hooks/pre-bash-equivalence.test.js
- FOUND: 617af45b, f2487a58, b3c753f2, 0d21d302 (on df/exec-79-03-pre-bash-equivalence-and-hooks)
- Worktree clean after every test run; the temporary node_modules symlink was removed; no bash-corpus-* or pre-bash-mutant-* directory was left in the temp dir.
