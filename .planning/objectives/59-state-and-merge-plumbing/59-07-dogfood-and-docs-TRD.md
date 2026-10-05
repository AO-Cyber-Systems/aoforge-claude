---
objective: 59-state-and-merge-plumbing
trd: "07"
type: standard
wave: 4
depends_on: ["59-04", "59-05", "59-06"]
files_modified:
  - CHANGELOG.md
  - CLAUDE.md
  - docs/USER-GUIDE.md
  - plugins/devflow/devflow/bin/lib/help.cjs
autonomous: true
requirements: [PLMB-01, PLMB-02, PLMB-03, PLMB-04, PLMB-05]
must_haves:
  truths:
    - "On a scratch clone of this repository with the driver installed, two branches that each ran the repo copy's `state add-decision` and `state record-metric` merge with no conflict, and state.json keeps both decisions"
    - "In this repository, `state advance-job --objective 59` sets STATE.md `**Status:**` to `Executing objective 59 — 6/7 TRDs complete` (not ready for verification)"
    - "A live `exec-context check` for a provisioned worktree id fails WRONG CHECKOUT from the main checkout and passes through the printed `--cwd` preflight, and the scratch worktree, branch and claim are cleaned up"
    - "`milestone complete v1.4` on a scratch copy of `.planning/` reports 13 objectives (42-54) and matches or explains the hand-written v1.4 entry's 158 TRDs; a second run reports `state_updated: false`; a repeated `objective complete 58` on the copy reports `roadmap_updated: false`"
    - "CHANGELOG [Unreleased], CLAUDE.md, docs/USER-GUIDE.md (Known issues no longer lists the state.json/STATE_ARCHIVE.md wave-merge conflict) and the exec-context help describe the changes; the full npm test passes apart from the known baseline failures"
  artifacts:
    - path: CHANGELOG.md
      provides: "[Unreleased] Added/Changed/Fixed entries for PLMB-01..05"
    - path: docs/USER-GUIDE.md
      provides: "wave-merge drivers, advance-job --objective, executor CHECKOUT/--cwd, milestone complete scope; Known issues updated"
  key_links:
    - "CLAUDE.md Core Tool bullets -> `merge-driver` and `state advance-job --objective` (dispatch-completeness requires every documented df-tools command to dispatch)"
---

# TRD 59-07: Dogfood state and merge plumbing on this repository, then document it

<objective>
Prove the five fixes on real data, then write them down.

1. **Merge (PLMB-02).** 59-01 installed the driver here before wave 2; record what wave 2's four merges did. Then a live,
   from-scratch demonstration on a scratch clone: install, two branches each running the repo copy's
   `state add-decision` and `state record-metric`, two `git merge --no-ff`, no conflict.
2. **Position (PLMB-01).** `state advance-job --objective 59` in this repository: Status becomes
   `Executing objective 59 — 6/7 TRDs complete`. Commit STATE.md and state.json.
3. **Preflight (PLMB-03).** Provision a scratch worktree with `exec-context worktree`, show WRONG CHECKOUT from the main
   checkout and a pass through the printed `--cwd` preflight, then clean everything up.
4. **Milestone and flags (PLMB-04, PLMB-05).** On a scratch COPY of `.planning/`: `milestone complete v1.4` against the
   hand-written v1.4 entry ("13 objectives (42–54), 158 TRDs"), a second run's `state_updated`, and a repeated
   `objective complete 58`'s `roadmap_updated`.
5. **Docs.** CHANGELOG [Unreleased], CLAUDE.md, USER-GUIDE, exec-context help details; `df-tools validate docs`; full
   `npm test`.

Purpose: objective-level evidence for success criteria 1-5 and the user-facing documentation.
Output: four files changed; live evidence in the SUMMARY.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Use the repo copy for every live df-tools command (`node plugins/devflow/devflow/bin/df-tools.cjs ...`); the
  `~/.claude/devflow` mirror lacks `merge-driver`, the `--objective` path and the new guard until release.
- One plain command per Bash call: no `&&`, `;`, pipes, `$(...)` or `cd`. Use `--cwd <dir>` for df-tools and `git -C
  <dir>` for git.
- `milestone complete`, `objective complete` and `objective remove` run ONLY against a scratch copy of `.planning/` in the
  session scratchpad (`--cwd <scratch>/ms`). Never against this repository: `milestone complete` appends to
  MILESTONES.md and archives files, and `objective remove` cascade-renumbers everything above the removed objective.
- The scratch clone and scratch worktree are throwaway. Commits in the scratch clone go through
  `node plugins/devflow/devflow/bin/df-tools.cjs --cwd <clone> commit "<msg>" --files <paths>`, never raw `git commit`.
- No code changes in this TRD apart from the help.cjs detail lines. If a live run exposes a defect, record it in the
  SUMMARY as a deviation with the command and output, fix nothing here, and report it for gap closure.
- Commit repository changes with `node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(59-07): ..." --files ...`.
- Never use port 8080 (nothing here needs a server).

## Test list

Evidence checks (code is tested by 59-01..59-06):

1. `merge-driver install --check --raw` in this repository → installed; `git log --merges --format='%h %s' -8` lists wave
   2's four `df/exec-59-0*` merges; `.planning/state.json` parses.
2. Scratch clone: after install, both `git -C <clone> merge --no-ff ...` exit 0, `git -C <clone> diff --name-only
   --diff-filter=U` is empty, the clone's state.json holds both new decisions and STATE_ARCHIVE.md both new rows.
3. `state advance-job --objective 59 --raw` prints `executing`; STATE.md's Status line is
   `Executing objective 59 — 6/7 TRDs complete`.
4. Scratch worktree: the check from the main checkout exits 1 with `WRONG CHECKOUT`; the `--cwd` check exits 0 with
   `checkout` = the worktree; afterwards `git worktree list` no longer lists it and `git branch --list
   'df/exec-59-07-dogfood'` prints nothing.
5. Scratch `.planning/` copy: `milestone complete v1.4` → `objectives: 13`, `objective_numbers` 42..54, `jobs` compared
   with 158; a second run → `state_updated: false`; `objective complete 58` run twice → the second reports
   `roadmap_updated: false`.
6. `df-tools validate docs --raw` prints no new advisory; `npm test` shows only the three known baseline failures.

<embedded_context>

<codebase_examples>
How 58-10 recorded live evidence (follow the same shape in the SUMMARY): an evidence table of
`| step | command | exit | result |`, then the verbatim JSON or text a command printed for the key claims.

CHANGELOG [Unreleased] has `### Added`, `### Changed` and `### Fixed` sections; entries are one bullet each, wrapped at
~120 columns, naming the command and the observed effect (see the `df-tools estimate` entry).

The USER-GUIDE Known issues bullet to replace (docs/USER-GUIDE.md, "Known issues."):

```
- Parallel executors in one wave also conflict on `.planning/STATE_ARCHIVE.md` and `.planning/state.json` when their
  branches merge, not only on STATE.md, ROADMAP.md and REQUIREMENTS.md. The documented planning-file conflict path in
  `/devflow:execute-objective` covers those three, and aborts the merge for any other conflicted path. A `state.json`
  conflict needs a JSON-aware merge (keep both `decisions` entries), then `git add` and `git commit --no-edit`.
  Extending the documented list to those two files is open.
```

CLAUDE.md's Core Tool list has a **State operations** bullet (`state load`, `state update`, ...); add
`state advance-job [--objective N]` there and one new bullet for the merge driver. Keep CLAUDE.md lean (it is resident in
every session): one line per change, details go to USER-GUIDE. Update the "Where we left off" Next list so it no longer
names the STATE_ARCHIVE.md/state.json wave-merge conflict as open.

help.cjs `exec-context` details today explain `check`, `worktree` and `release`; add: check fails `WRONG CHECKOUT` when a
worktree was provisioned for `--id` and the check ran elsewhere (no claim taken; run the `--cwd` command it prints), and
worktree prints `preflight`, the exact `--cwd` check command.
</codebase_examples>

<anti_patterns>
- Do not run any objective or milestone mutator with `--cwd` pointing at this repository.
- Do not hand-edit STATE.md or state.json; the advance-job dogfood writes them through the verb.
- Do not leave the scratch worktree, its branch or its claim behind; the cleanup is part of the evidence.
</anti_patterns>

<error_recovery>
- If `merge-driver install --check` says not installed here, 59-01's dogfood did not run or wrote elsewhere: run
  `node plugins/devflow/devflow/bin/df-tools.cjs merge-driver install`, record it as a deviation, and say whether wave 2's
  merges needed hand resolution (read the 59-0x SUMMARYs and `git log --merges`).
- If the scratch clone's merge conflicts after install, run `git -C <clone> check-attr merge -- .planning/state.json`
  and `git -C <clone> config --get merge.devflow-state-json.driver`, record both, and report it for gap closure.
- If `milestone complete v1.4` counts a jobs total other than 158, list per-objective TRD counts for 42-54 from the scratch
  copy (`find <scratch>/ms/.planning/objectives -name '4[2-9]-*-TRD.md'` and `5[0-4]`) and record whether the hand count or
  the tool is off; the objective count (13) is the success criterion.
</error_recovery>

</embedded_context>

<gotchas>
- `git clone` of this repository into the scratchpad copies committed state only: run it after 59-06's commits so the
  clone holds the new code, and use the REPO copy's bin with `--cwd <clone>` (the clone's own bin is identical).
- In the clone, `merge-driver install` records the bin that ran it (this repository's copy); that is fine for the demo.
- `exec-context worktree --base HEAD` from the main checkout; then the main-checkout check needs the same `--base`. The
  release must run against the worktree's checkout (`--cwd <worktree>`), since claims are keyed by checkout.
- The scratch `.planning/` copy is not a git repository; `milestone complete` and `objective complete` do not need git.
- 07's own SUMMARY does not exist yet when you run advance-job, so 6/7 is the expected count. If the orchestrator has
  already merged differently, record the actual D/T.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Live merge, position and preflight on this repository (evidence 1-4)</name>
  <files>(no repository files beyond .planning/STATE.md and .planning/state.json written by the advance-job verb)</files>
  <action>
Merge, in order, one command per call:
1. `node plugins/devflow/devflow/bin/df-tools.cjs merge-driver install --check --raw`;
   `git log --merges --format='%h %s' -8`; `node -e "JSON.parse(require('fs').readFileSync('.planning/state.json','utf8')); console.log('ok')"`.
2. Scratch clone (`...` below is `node plugins/devflow/devflow/bin/df-tools.cjs`):
   - `git clone --quiet /Users/justin/dev/devflow-claude <scratch>/clone`, then
     `git -C <scratch>/clone rev-parse --abbrev-ref HEAD` — note the printed name as `<base-branch>`.
   - `... --cwd <scratch>/clone merge-driver install`.
   - Branch A: `git -C <scratch>/clone switch -c demo-a`;
     `... --cwd <scratch>/clone state add-decision --objective 59 --summary "demo A"`;
     `... --cwd <scratch>/clone state record-metric --objective 59 --job 91 --duration 1min --tasks 1 --files 1`;
     `... --cwd <scratch>/clone commit "chore(demo): branch a" --files .planning/state.json .planning/STATE_ARCHIVE.md`.
   - Branch B from the same base: `git -C <scratch>/clone switch -c demo-b <base-branch>`; the same two state commands
     with `--summary "demo B"` and `--job 92`; commit `chore(demo): branch b` the same way.
   - `git -C <scratch>/clone switch <base-branch>`;
     `git -C <scratch>/clone merge --no-ff -m "merge demo-a" demo-a`;
     `git -C <scratch>/clone merge --no-ff -m "merge demo-b" demo-b`;
     `git -C <scratch>/clone diff --name-only --diff-filter=U`; then read the clone's state.json and the tail of its
     STATE_ARCHIVE.md.

Position: `node plugins/devflow/devflow/bin/df-tools.cjs state advance-job --objective 59 --raw`; read the Status line
(`rg -n '^\*\*Status:\*\*' .planning/STATE.md`); commit
`node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(59-07): advance-job --objective dogfood" --files .planning/STATE.md .planning/state.json`.

Preflight: `node plugins/devflow/devflow/bin/df-tools.cjs exec-context worktree --repo /Users/justin/dev/devflow-claude --id 59-07-dogfood --base HEAD`
(note `worktree_path`, `base_sha`, `preflight`); the check from here
`node plugins/devflow/devflow/bin/df-tools.cjs exec-context check --repo /Users/justin/dev/devflow-claude --base <base_sha> --id 59-07-dogfood`
(expect exit 1, WRONG CHECKOUT); the printed preflight with the repo bin
`node plugins/devflow/devflow/bin/df-tools.cjs --cwd <worktree_path> exec-context check --repo /Users/justin/dev/devflow-claude --base <base_sha> --id 59-07-dogfood`
(expect exit 0); cleanup `node plugins/devflow/devflow/bin/df-tools.cjs --cwd <worktree_path> exec-context release --repo /Users/justin/dev/devflow-claude --id 59-07-dogfood`,
`git worktree remove <worktree_path>`, `git branch -D df/exec-59-07-dogfood`, `git worktree list`.

Record every command, exit code and the key output in the SUMMARY evidence table.
  </action>
  <verify>Evidence 1-4 hold: install check true, the clone's two merges exit 0 with no unmerged path, Status reads `Executing objective 59 — 6/7 TRDs complete` (or the actual D/T recorded), WRONG CHECKOUT then pass, and no scratch worktree or branch remains.</verify>
  <done>The SUMMARY has an evidence table for the merge, position and preflight demonstrations, and STATE.md/state.json are committed through df-tools.</done>
  <recovery>If the clone demo conflicts, keep the clone for inspection, record check-attr and config output, and continue with the other steps. If cleanup fails, run `git worktree prune` and report what remained.</recovery>
</task>

<task type="auto">
  <name>Task 2: Milestone and change flags on a scratch copy of .planning (evidence 5)</name>
  <files>(scratch only: <scratchpad>/ms/.planning; no repository files)</files>
  <action>
`mkdir -p <scratch>/ms`; `cp -R /Users/justin/dev/devflow-claude/.planning <scratch>/ms/.planning`. Confirm the copy is
the target of every following command (each one carries `--cwd <scratch>/ms`):

1. `node plugins/devflow/devflow/bin/df-tools.cjs --cwd <scratch>/ms milestone complete v1.4 --name "GitHub as system of record"`
   → record `objectives`, `objective_numbers`, `jobs`, `tasks`, `cancelled`, `scope_source`, `state_updated`, and the
   entry appended to the copy's MILESTONES.md. Compare with the hand-written v1.4 entry (13 objectives, 158 TRDs).
2. The same command again → `state_updated: false`.
3. `node plugins/devflow/devflow/bin/df-tools.cjs --cwd <scratch>/ms objective complete 58` twice → record both
   `roadmap_updated` values (the second must be false).
4. Confirm this repository is untouched: `git status --porcelain .planning/MILESTONES.md .planning/ROADMAP.md .planning/milestones`
   prints nothing.
  </action>
  <verify>Evidence 5 holds and `git status --porcelain` shows no change to this repository's MILESTONES.md, ROADMAP.md or milestones/.</verify>
  <done>The SUMMARY records the milestone counts against the hand-written entry and both truthful flags.</done>
  <recovery>If the `--cwd` path is wrong and a command touched this repository, stop, `git restore` only the touched planning files, and report it.</recovery>
</task>

<task type="auto">
  <name>Task 3: Docs, help details and the full test run (evidence 6)</name>
  <files>CHANGELOG.md, CLAUDE.md, docs/USER-GUIDE.md, plugins/devflow/devflow/bin/lib/help.cjs</files>
  <action>
1. CHANGELOG `[Unreleased]`:
   - Added: `df-tools merge-driver install|resolve|state-json` (JSON-aware state.json merge, union STATE_ARCHIVE.md,
     installed in info/attributes + repo config, nothing committed; the scratch-clone result); `exec-context worktree`
     prints `preflight`.
   - Changed: `state advance-job --objective N` derives position and Status from disk; execute-objective installs the
     driver, resolves state.json/STATE_ARCHIVE.md conflicts with `merge-driver resolve`, and regenerates position after
     every parallel wave; the executor dispatch names `CHECKOUT` and the preflight runs with `--cwd`; `milestone complete`
     counts only the milestone's objectives and reports `objective_numbers`, `cancelled`, `absent`, `scope_source`.
   - Fixed: advance-job no longer writes `ready for verification` mid-objective (0/0 counters); `exec-context check` fails
     WRONG CHECKOUT instead of claiming the main checkout or reporting a false SHARED INDEX; `milestone complete`
     accomplishments (template one-liners) and task counts (the TRDs' task elements); `state_updated` (milestone complete) and
     `roadmap_updated` (objective remove, objective complete) report a real change.
2. CLAUDE.md: `state advance-job [--objective N]` in State operations; one Merge driver bullet; drop the wave-merge
   conflict from "Where we left off".
3. USER-GUIDE: replace the Known issues bullet with a short note that it is fixed (pointing at the new text); add a
   "Parallel wave merges" subsection beside the execute-objective documentation (`rg -n "wave" docs/USER-GUIDE.md` to place
   it) covering install, what each file does on merge, the resolve fallback, and the `--cwd` preflight; mention
   `--objective` where advance-job is described and the new `milestone complete` keys where it is described.
4. help.cjs `exec-context` details: the WRONG CHECKOUT and `preflight` lines.
5. `node plugins/devflow/devflow/bin/df-tools.cjs validate docs --raw`; `node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs`;
   `npm test`.
Commit `docs(59-07): document state and merge plumbing` with the four files.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs` passes; `npm test` shows only the three known baseline failures (MA-7 doctl handoff, roadmap-reconcile E2E1, stack-drafter-fleet github-enterprise-migration).</verify>
  <done>Docs describe all five fixes, Known issues no longer lists the wave-merge conflict on state.json/STATE_ARCHIVE.md, and the suite is at baseline.</done>
  <recovery>If dispatch-completeness flags a name, the doc spells a command that does not dispatch; use the exact command names (`merge-driver`, `state`, `exec-context`). If roadmap-reconcile E2E1 fails differently from baseline, read its message: it names the newest TRD and is a known baseline failure.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs</test_scoped>
<!-- lint/build/typecheck: none in the stack profile. -->
</validation_gates>

<verification>
- SC-1: Status after `advance-job --objective 59` mid-objective (evidence 3).
- SC-2: wave 2's merges went through the driver; the scratch clone merges two state-writing branches cleanly (evidence 1-2).
- SC-3: WRONG CHECKOUT then pass through `--cwd` (evidence 4).
- SC-4: v1.4 counted as 13 objectives on a scratch copy (evidence 5).
- SC-5: second-run `state_updated: false` and `roadmap_updated: false` (evidence 5).
</verification>

<success_criteria>
- All six evidence checks recorded in the SUMMARY; this repository's MILESTONES.md, ROADMAP.md and milestones/ untouched by
  the scratch runs; full `npm test` at baseline.
</success_criteria>

<output>
After completion, publish `59-07-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Note for the release: after re-sync, execute-objective's `merge-driver install` (mirror bin)
re-points this repository's driver from the repo copy to `~/.claude/devflow/bin/df-tools.cjs` (`changed: true` once).
</output>
