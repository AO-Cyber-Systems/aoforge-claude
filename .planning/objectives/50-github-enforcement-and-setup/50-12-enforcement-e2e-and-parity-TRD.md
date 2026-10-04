---
objective: 50-github-enforcement-and-setup
trd: "12"
type: standard
wave: 4
depends_on: ["50-05", "50-06", "50-07", "50-08", "50-11"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-enforcement.e2e.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-enforcement-parity.test.cjs
autonomous: true
requirements: [GEN-01, GEN-02, GEN-03, GEN-04, GEN-05]
must_haves:
  truths:
    - "SC1: through the real df-tools CLI in a store-mode temp repo, a commit on the default branch and one on an unlinked branch are refused (exit 1, nothing staged), and `DEVFLOW_SKIP_GH_GATE=1` lands the commit and appends a `gate:gh` entry that `df-tools override --list` shows"
    - "SC2: `df-tools gh setup` prints the ruleset, types and fields payloads with zero writes; `--apply` twice yields zero writes the second time"
    - "SC3: the check runner on a PR event without a closing reference posts `devflow/linked-issue` failure and exits 1; with `Closes #N` it passes"
    - "GEN-02/03 in one flow: a store-mode commit queues a write, the gh-flush hook flushes it, and `validate health` then reports no W057"
    - "D-01 parity: with `github.store` off, `df-tools commit`, the gh-flush hook (PostToolUse and Stop), `validate health` and doctor check 25 behave exactly as before and make zero gh calls"
    - "The script path the reusable workflow runs exists in the repo"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-enforcement.e2e.test.cjs
      provides: "SC1-SC3 end to end against the fake GitHub / gh shim"
    - path: plugins/devflow/devflow/bin/lib/gh-enforcement-parity.test.cjs
      provides: "store-off parity across every new behaviour except gh setup"
  key_links:
    - "Exercises 50-05, 50-06, 50-07, 50-08, 50-10, 50-11 together"
---

# TRD 50-12: enforcement end to end and store-off parity

<objective>
Prove the objective's success criteria through the real entry points (df-tools CLI, the hook script, the Actions runner), and prove the
D-01 invariant: with the store off nothing new happens and no `gh` is called — except the explicit `gh setup`.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Tests only. If a test exposes a defect, fix it in the owning module in a separate `fix(50-12): ...` commit, naming the TRD it came from
  in the SUMMARY (do not widen this TRD's files without recording it).
- First commit the failing/new tests (`test(50-12): ...`). Since the code exists, tests may pass at once; that is expected for an e2e
  TRD — record it in the SUMMARY. Hand-built fixtures only.
- Hermetic: temp HOME, `DEVFLOW_GH_CACHE_DIR`, `DEVFLOW_OUTBOX_DIR`, `DEVFLOW_HOOK_MARKER_DIR` at temp dirs; the fake via `_setRunGh`
  in-process or the gh PATH shim for child processes; `GIT_CONFIG_GLOBAL=/dev/null`. Never the real `~/.claude` or GitHub.

## Decisions

- Child-process CLI runs for SC1 (`node <repo>/plugins/devflow/devflow/bin/df-tools.cjs --cwd <tmp> commit ...`), so the dispatch,
  env reading and exit codes are all real.
- Parity uses a gh seam/shim that fails the test on ANY call, plus result-key snapshots captured from the same command in a project with
  no `github` block at all (the pre-objective-46 shape) — the two must be deep-equal.
- `gh setup` is excluded from parity by design (it is an explicit GitHub command); its disabled-config behaviour is asserted instead.

## Test list

1. SC1 default branch: store repo on `main` → exit 1 `default_branch`; `git diff --cached --name-only` empty.
2. SC1 unlinked: branch `feat/x` → exit 1 `unlinked_branch`.
3. SC1 escape: `DEVFLOW_SKIP_GH_GATE=1` on `main` → exit 0, committed; `df-tools override --list --raw` includes `gate:"gh"`.
4. SC1 linked: `prs[50].branch` = current → committed with `Refs #<objective issue>` on an unscoped message.
5. SC2: `gh setup` dry-run lists `devflow: default branch`, `devflow/linked-issue`, `devflow/planning-consistency`, `Objective`, `TRD`,
   `work`, `kind`; writes 0; `--apply` then `--apply` → second run writes 0, exit 0.
6. SC3: runner `linked-issue` on `pull_request-no-closes.json` → status failure, exit 1; on `pull_request-closes.json` → success.
7. Flow: store commit enqueues an op (via a verb that queues, e.g. `summary post` or `gh trd start`) → spawn `hooks/gh-flush.js` with a
   PostToolUse payload for that commit → queue drained → `validate health --raw` has no W057.
8. Parity: store off — commit on `main` result deep-equals the no-github-block baseline; gh-flush hook silent for both events;
   validate health codes identical to baseline; doctor check 25 `ok` "not a store-mode project"; zero gh calls throughout.
9. `gh setup` with `github.enabled:false` → skipped, exit 0, zero calls.
10. `plugins/devflow/devflow/bin/lib/gh-check-cli.cjs` exists and every `gh-check-cli.cjs <name>` in `.github/workflows/devflow-checks.yml`
    is a subcommand the runner accepts (call `main({argv:[name]})` with an unrelated event → exit 0, not "unknown check").

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: success criteria end to end (tests 1-7, 10)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-enforcement.e2e.test.cjs</files>
  <action>
Write tests 1-7 and 10 reusing `makeStoreProject`, `installGhShim`, the fake and the 50-03 event fixtures. Commit
`test(50-12): enforcement success criteria end to end`. Fix any defect found per the binding rules.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-enforcement.e2e.test.cjs</verify>
  <done>Tests 1-7 and 10 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: store-off parity (tests 8-9)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-enforcement-parity.test.cjs</files>
  <action>
Write tests 8-9 with a gh seam/shim that records and fails on any call. Commit `test(50-12): store-off parity for objective 50`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-enforcement-parity.test.cjs</verify>
  <done>Tests 8-9 pass.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `pr-lifecycle` e2e/parity from 49-14 (`ls plugins/devflow/devflow/bin/lib/*e2e*.test.cjs`) — reuse its harness style.
- `__fixtures__/gh-store-fixtures.cjs` `makeStoreProject` L304, `hermeticEnv` L399; `__fixtures__/gh-shim.cjs` `installGhShim` L79.
- `audit-cli.cjs` `override --list` output.
</codebase_examples>
<anti_patterns>
- Weakening an assertion to make an e2e pass (fix the module instead).
- Tests that depend on wall-clock timing for the hook (use the hook's timeout override).
</anti_patterns>
<error_recovery>
- If the hook's child df-tools cannot see the fake (child process), use the PATH shim table for the exact flush argv, as in 50-05.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-enforcement.e2e.test.cjs plugins/devflow/devflow/bin/lib/gh-enforcement-parity.test.cjs</test>
</validation_gates>

<verification>
- SC1, SC2, SC3 each have a named passing test; D-01 parity green.
</verification>

<success_criteria>
The objective's success criteria hold through real entry points, and store-off projects see no change.
</success_criteria>

<output>
After completion, create `.planning/objectives/50-github-enforcement-and-setup/50-12-SUMMARY.md`
</output>
