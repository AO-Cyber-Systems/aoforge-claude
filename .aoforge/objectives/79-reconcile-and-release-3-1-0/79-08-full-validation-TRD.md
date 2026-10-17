---
objective: 79-reconcile-and-release-3-1-0
trd: "08"
type: standard
wave: 4
depends_on: ["79-06", "79-07"]
files_modified:
  - .aoforge/config.json
  - .aoforge/STATE.md
  - .aoforge/STATE_ARCHIVE.md
  - "site/data/aoforge.json (only if regeneration differs)"
autonomous: true
requirements: [SC-1, SC-2, SC-3, SC-4]
must_haves:
  truths:
    - "This repository is current with its own 3.1.0 runtime: `upgrade --check` reports nothing pending after `upgrade --apply` (migration 0015 rotated STATE.md's decision log into STATE_ARCHIVE.md; the config stamp is `aoforge{version: 3.1.0}` with no pre-rename key)"
    - "`validate health`, `validate consistency`, `validate requirements`, `validate docs` and `doctor --json` run on this repo with no error; every warning left is listed with its reason (none of W040, W065, W066, W067, W069)"
    - "The full suite (npm test's globs, `watcher-shell.test.cjs` excluded and named for its W-3 fish hang) passes with 0 failures and 0 cancelled under an empty HOME, and the CI gate's self-test passes; when Docker is available, the CI-equivalent run (node:26, `node scripts/ci-unit-gate.cjs`) passes"
    - "The named gates pass individually: rename guard, stack-neutrality guard, reconcile guard, pre-bash equivalence corpus, context budget; the local fleet STACK.md drafter test runs against /Users/justin/dev with its pass/skip counts recorded"
    - "The installed changelog gate allows `git tag -a v3.1.0`; `git ls-files .planning` is empty; no conflict marker is tracked; the working tree is clean except the user's untracked `amp`; VALIDATED_SHA is recorded"
  artifacts: []
  key_links:
    - from: "79-08 SUMMARY VALIDATED_SHA"
      to: "79-09 push precondition"
      via: "only .aoforge/ planning files may differ between VALIDATED_SHA and the pushed head"
      pattern: "VALIDATED_SHA"
---

# TRD 79-08: Prove the merged tree green, and record the head that may be pushed

<objective>
Everything is merged, swept and documented. Before any live step, prove the whole tree green the way CI will see it, and
bring this repository's own planning state forward to its 3.1.0 runtime (main's migration 0015 has never run on the
merged planning tree). Record VALIDATED_SHA, the only head 79-09 may push.

Purpose: SC-3 in full, plus the evidence matrix for SC-1, SC-2 and SC-4.
Output: an upgrade commit, a SUMMARY with every number, VALIDATED_SHA and the SC evidence table. No live step.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/79-reconcile-and-release-3-1-0/79-01-SUMMARY.md
@.aoforge/objectives/79-reconcile-and-release-3-1-0/79-06-SUMMARY.md
@.aoforge/objectives/79-reconcile-and-release-3-1-0/79-07-SUMMARY.md

Single-TRD wave: you run in `/Users/justin/dev/aoforge-claude` on `integrate/3.1.0`. Use the repo copy
`node plugins/aoforge/aoforge/bin/aof-tools.cjs`. Tests run with an empty `mktemp -d` HOME. Never push, tag, open a PR or
dispatch a workflow here. Never port 8080.

Expected, not failures (record them):
- `doctor --json` global checks may report this machine's pre-rename leftovers (old runtime home, check 16): the user's
  own call (`doctor --global --fix`); never run `--fix` here.
- ROADMAP's objective 76/77 TRD lists name TRD files main never committed (main tracked only OBJECTIVE.md and the
  assessments). A consistency warning about them is a recorded main-side condition, not a defect to fabricate files for.
- Objective 74 is in progress (OPS-03 deferred by the user).
- `watcher-shell.test.cjs`: excluded locally (W-3 fish hang); CI's node:26 image has no fish, so it runs there.
- Node here is 24.13.1; CI pins 26 (#101: a describe-scoped `after()` that throws exits 0 on 22/24). The Docker run is
  the way to see that failure class before CI does.
- Installed plugin for the changelog gate dry run: `~/.claude/plugins/cache/aocyber/aoforge/3.0.0/hooks/changelog-on-tag.js`
  (list the directory first; use the version present).
</context>

<embedded_context>

<codebase_examples>
Full-suite run, as 78-12 and 79-01 did it (each line its own Bash call; S = a `mktemp -d` path written literally):
```
git -C /Users/justin/dev/aoforge-claude ls-files -co --exclude-standard -- 'plugins/aoforge/*.test.cjs' 'plugins/aoforge/*.test.js' 'plugins/aoforge-stack-*/*.test.cjs' 'scripts/*.test.cjs'   (> S/all.txt)
rg -v 'watcher-shell\.test\.cjs$' S/all.txt   (> S/files.txt)
env HOME=S/home xargs node --test < S/files.txt > S/suite.txt 2>&1     (run_in_background; wait for it)
rg -n -e '^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)' -e '^not ok' S/suite.txt
```
Changelog gate dry run (no output = allowed):
```
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git tag -a v3.1.0 -m x HEAD"},"cwd":"/Users/justin/dev/aoforge-claude"}' | node ~/.claude/plugins/cache/aocyber/aoforge/3.0.0/hooks/changelog-on-tag.js
```
</codebase_examples>

<anti_patterns>
- Calling a failure "known" without the exclusion being named and reasoned; the only named exclusion is watcher-shell.
- Fixing a newly found failure in this TRD beyond a one-line obvious fix: a real defect returns `failed` with the list, so
  the orchestrator plans a gap TRD (and validation re-runs after it).
- `doctor --fix`, `validate health --repair`, or `upgrade --global` here.
- Adding entries to `.github/known-test-failures.json` to make the CI gate pass.
</anti_patterns>

<error_recovery>
- `upgrade --apply` wants a confirm migration or defers: record the notice and stop at `--check` output; return with the
  question (it should be auto-only: 0015).
- The Docker run cannot start (`docker info` fails, no network for `node:26` or `npm ci`): record the reason; the PR's CI
  run in 79-09 is then the first node:26 run, and its result decides.
- The fleet test skips everything (fleet root absent or under half the repos): record the skip reason; it is not a failure.
- The suite hangs past 25 minutes: stop it, find the file from the last `# Subtest` lines, return failed naming it.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: Bring this repo's planning state to 3.1.0 and run the health checks</name>
  <files>.aoforge/config.json, .aoforge/STATE.md, .aoforge/STATE_ARCHIVE.md</files>
  <action>
`node plugins/aoforge/aoforge/bin/aof-tools.cjs upgrade --check --raw` (record pending migrations: expect 0015 and the
version stamp). `... upgrade --apply --raw` (record changed_files and the backup path it prints). `git diff --stat` must
show only `.aoforge/` files; commit them: `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "chore(79-08): bring this repository's planning state to 3.1.0 (migration 0015)" --files <changed_files>`.
Then, one per Bash call, record each result: `upgrade --check --raw` (nothing pending); `validate health --raw`;
`validate consistency --raw`; `validate requirements --raw`; `validate docs --raw`; the roadmap-coverage check named in
`validate --help` (objective 76-04); `stack validate`; `doctor --json`. Check `.aoforge/config.json`:
`node -e "const c=require('./.aoforge/config.json'); console.log(c.aoforge && c.aoforge.version, Object.keys(c).filter(k=>k!=='aoforge' && /forge|flow/i.test(k)))"`
prints `3.1.0 []`.
  </action>
  <verify>`upgrade --check` reports nothing pending; `validate health --raw` has `status` other than broken and none of W040/W065/W066/W067/W069; each remaining warning is in the SUMMARY with its reason</verify>
  <done>The repository's planning state is stamped 3.1.0 with 0015 applied, and every health surface has been read and explained.</done>
  <recovery>A health error caused by the merge (for example a malformed ROADMAP row): fix it through the matching verb if the fix is one line, else return failed with the finding.</recovery>
</task>

<task type="auto">
  <name>Task 2: Full suite, CI-equivalent run, named gates, fleet test, release preconditions; record VALIDATED_SHA</name>
  <files>(none unless site/data regeneration differs; read-only otherwise)</files>
  <action>
1. Full suite per codebase_examples (background; wait). Must be 0 fail, 0 cancelled. Record tests/pass/fail/skipped and
   the excluded file with its reason.
2. CI gate self-test: `env HOME=<S>/home node --test scripts/ci-unit-gate.test.cjs`.
3. CI-equivalent: `docker info` (if it fails, record and skip); else, from the repo root, in the background:
   `docker run --rm -v /Users/justin/dev/aoforge-claude:/src:ro node:26 bash -c 'cp -a /src /repo && cd /repo && rm -rf node_modules && npm ci && node scripts/ci-unit-gate.cjs'`
   and record the gate's verdict lines.
4. Named gates, one per call (scratch HOME): `rename-guard.repo.test.cjs`, `stack-neutrality.repo.test.cjs`,
   `reconcile-guard.repo.test.cjs`, `context-budget.repo.test.cjs` (all under plugins/aoforge/aoforge/bin/lib), and
   `plugins/aoforge/hooks/pre-bash-equivalence.test.js`.
5. Fleet: `env HOME=<S>/home AOFORGE_FLEET_ROOT=/Users/justin/dev node --test plugins/aoforge/aoforge/bin/lib/stack-drafter-fleet.test.cjs`
   (read-only: `stack init` without `--write`); record per-repo pass/skip.
6. Site data stable: `node scripts/gen-docs-data.cjs` then `git status --porcelain site/data` empty (if not, commit the
   regenerated file with `aof-tools commit "chore(79-08): regenerate docs data" --files site/data/aoforge.json` and re-run 4).
7. Release preconditions: the changelog gate dry run (codebase_examples) prints nothing; `git ls-files .planning` empty;
   `git grep -n -e '^<<<<<<< ' -e '^>>>>>>> ' -- . ':!*.md'` and the same over `*.md` print nothing; versions 3.1.0 (the
   79-06 node check); `git -C /Users/justin/dev/aoforge-claude status --porcelain` shows only `?? amp`.
8. VALIDATED_SHA = `git rev-parse HEAD` (after any commit in this TRD, before your SUMMARY). Write the SC evidence table:
   SC-1 (merge parents, conflict ledger from 79-01, versions, one 3.1.0 section), SC-2 (no `.planning`, legacy ignore
   lines gone, reconcile guard), SC-3 (every gate above with numbers; EST-11 records fixed), SC-4 (79-04's table).
Any failure in 1-7 that is not a one-line obvious fix: return `failed` with the list (no live step may follow).
  </action>
  <verify>Suite 0 fail / 0 cancelled with the one named exclusion; every named gate passes; the changelog gate allows v3.1.0; working tree clean except `amp`; VALIDATED_SHA and the SC evidence table are in the SUMMARY</verify>
  <done>The merged tree is proven green locally (and on node:26 when Docker ran), and the pushable head is recorded.</done>
  <recovery>On failure the TRD returns failed; it never pushes, and 79-09 refuses to start without a PASS here.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test (full; watcher-shell.test.cjs excluded locally and named; the CI-equivalent is node scripts/ci-unit-gate.cjs on node:26)</test>
</validation_gates>

<verification>
- Planning state at 3.1.0; health explained; full suite and gates green; VALIDATED_SHA recorded with the SC matrix.
</verification>

<success_criteria>
- There is one validated head, and every success criterion of objective 79 short of the live release has evidence.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/79-reconcile-and-release-3-1-0/79-08-SUMMARY.md` through
`node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post`. It must carry VALIDATED_SHA and the verdict PASS or FAIL.
</output>
