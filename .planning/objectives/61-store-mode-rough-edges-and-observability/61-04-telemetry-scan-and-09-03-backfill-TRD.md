---
objective: 61-store-mode-rough-edges-and-observability
trd: "04"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/audit-cli.cjs
  - plugins/devflow/devflow/bin/lib/telemetry.cjs
  - plugins/devflow/devflow/bin/lib/telemetry-cli.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
  - .planning/objectives/09-roadmap-disk-reconciliation/09-03-cli-skill-and-integration-SUMMARY.md
  - .planning/ROADMAP.md
autonomous: true
requirements: [OBS-02, OBS-04]
must_haves:
  truths:
    - "`df-tools telemetry --scan [--limit N] [--since YYYY-MM-DD] [--root <dir>]` runs a session audit and the JSON carries a non-null `blocks` object plus a `scan` object echoing root, limit and since"
    - "Every flag telemetry does not understand, and --limit/--since/--root without --scan, exits 1 with an error naming the flag; nothing is silently ignored"
    - "`telemetry --scan` outside a DevFlow project still reports blocks (they come from transcripts, not .planning/)"
    - "Plain `df-tools telemetry` output is unchanged (blocks null, the same advisories)"
    - "`.planning/objectives/09-roadmap-disk-reconciliation/09-03-cli-skill-and-integration-SUMMARY.md` exists, is marked as a backfill, cites the 09-03 commits and 09-VERIFICATION.md, and carries no duration or token fields"
    - "`validate health` reports no I001"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/audit-cli.cjs
      provides: "runTelemetry({argv, cwd, userHome}) -> {ok, result, text} | {ok:false, message}"
    - path: .planning/objectives/09-roadmap-disk-reconciliation/09-03-cli-skill-and-integration-SUMMARY.md
      provides: "backfilled SUMMARY for TRD 09-03"
  key_links:
    - "df-tools.cjs case 'telemetry' -> audit-cli.runTelemetry -> session-audit.analyze (only with --scan) -> telemetry.collect({sessionReport})"
    - "help.cjs 'telemetry' usage names --scan and its flags"
---

# TRD 61-04: `telemetry --scan` works, and the 09-03 SUMMARY is backfilled (OBS-02, OBS-04)

<objective>
Two small observability gaps.

**OBS-02.** The docs (`site/content/docs/guides/telemetry.md`, `site/content/docs/reference/df-tools.md`) show
`df-tools telemetry --scan --limit 150`. The dispatcher's `telemetry` case never reads its arguments: `--scan`,
`--limit` and any typo are silently dropped, and the session-audit half of `telemetry.collect` (`sessionReport`) is
unreachable. **Decision: make `--scan` work** rather than reject it. `collect` already takes the report, and
`session-audit` is already wired (TRD 39-01). The command moves into `audit-cli.cjs` as `runTelemetry`, the same pure
`{ok, result, text}` shape as `runContext` and `runSessionAudit`, so its flag handling is unit-testable:

```
telemetry                                   -> unchanged (no scan, blocks null)
telemetry --scan [--limit N] [--since D] [--root R]
                                            -> sessionAudit.analyze([root], {limit, since}) -> collect({sessionReport})
telemetry --limit 5        (no --scan)      -> error: --limit, --since and --root need --scan
telemetry --anything-else                   -> error: unknown flag: --anything-else
```

`collect()` returns early when there is no `.planning/`, which would drop a scan silently. Blocks come from
transcripts, so with a report `collect` still fills `blocks` outside a project.

**OBS-04.** `validate health` reports one info issue, I001:
`09-roadmap-disk-reconciliation/09-03-cli-skill-and-integration-TRD.md has no SUMMARY.md`. TRD 09-03 shipped on
2026-05-05 (commits `e4a112d4`, `d1e70c74`, `d48d60e7`; `09-VERIFICATION.md` passed 10/10), but its SUMMARY was never
written. Backfill it from that evidence, clearly marked as a backfill. It carries no duration and no token fields, so
`df-tools calibrate` gains no fabricated sample.

Purpose: OBS-02 and the I001 half of success criterion 5. Output: `runTelemetry`, the dispatch and help changes, the
backfilled SUMMARY, and a ROADMAP note.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD for Task 1: RED commit (`test(61-04): ...`) before GREEN (`feat(61-04): ...`). Task 2 is documentation
  backfill with no test-first step.
- Hand-built fixtures only. Transcripts are written by the test with `__fixtures__/bash-replay-fixtures.cjs`
  (`gateDenialRow`, `bashRow`, `writeTranscriptTree`) or `__fixtures__/transcript-fixtures.cjs` builders into a temp
  projects root. No generated data, no property-based libraries, no `.feature` files.
- CLI tests spawn `df-tools.cjs` with `--cwd <temp>` and `env.HOME` set to a temp home, and always pass `--root` for
  `--scan`. They never read the real `~/.claude/projects`.
- The backfilled SUMMARY must not invent facts. Every claim cites a commit, a file that exists today, or
  09-VERIFICATION.md. Where evidence is missing (duration, task timings), leave the field out.
- Write planning files only through the verbs: `planning draft`, then `summary post`. ROADMAP.md is hand-maintained in
  local mode (`planning mode` prints `local`); edit it with the Edit tool there, and skip that step in store mode.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash
  call. Never use port 8080.

## Test list

`telemetry-cli.test.cjs`:

In-process `runTelemetry({ argv, cwd, userHome })`, with a temp project that has `.planning/` and a temp transcripts
root holding one session with one gate denial:

1. `['--scan', '--root', root, '--limit', '5']` → `ok`, `result.blocks.total >= 1`, and `result.scan` is
   `{ root, limit: 5, since: null, files_scanned: <n> }`.
2. `['--scan', '--root', root]` → `result.scan.limit === 150` (`DEFAULT_LIMIT`).
3. `['--scan', '--root', root, '--limit', '0']` → limit 0 means all files (the session-audit convention).
4. `['--limit', '5']`, `['--root', root]` and `['--since', '2026-01-01']` without `--scan` → `{ ok: false }`, each
   message naming `--scan`.
5. `['--bogus']` → `{ ok: false, message: 'unknown flag: --bogus' }`; `['stray']` → `unexpected argument: stray`.
6. `['--scan', '--root', '/nonexistent/x']` → `{ ok: false }` with `transcript root not found`.
7. `['--scan', '--since', 'yesterday', '--root', root]` → `{ ok: false }` with `--since must be an ISO date`.
8. `[]` → `ok`, `result.blocks === null`, and no `scan` key: identical to `collect({ planningDir, userHome })`.
9. `--scan` with a `cwd` that has no `.planning/` → `ok`, `result.blocks` non-null, and the advisories include the
   not-a-DevFlow-project line.

CLI spawn (`--cwd`, temp `HOME`):

10. `telemetry --scan --root <root> --raw` → exit 0, and the stdout JSON has `blocks` and `scan`.
11. `telemetry --bogus` → exit 1, and stderr contains `unknown flag: --bogus`.
12. `telemetry` → exit 0, `blocks` null (the TRD 38-11 test 4 contract holds).

`telemetry.test.cjs` (existing). Its tests must stay green. If one pins `collect({ planningDir: null })` to an early
return, keep that exact behaviour when `sessionReport` is absent.

<embedded_context>

<codebase_examples>
df-tools.cjs today (case 'telemetry', ~line 869). It ignores `args`:

```js
    case 'telemetry': {
      // df-tools telemetry [--raw] — read-only summary (TRD 31-01 module, wired in TRD 38-11)
      ...
      const planningDir = fs.existsSync(path.join(cwd, '.planning')) ? path.join(cwd, '.planning') : null;
      const r = collect({ planningDir, userHome: os.homedir() });
      outputTelemetry(r, raw, r.advisories.join('\n'));
      break;
    }
```

The pattern to follow is the `context` case right below it:

```js
      const { runContext } = require('./lib/audit-cli.cjs');
      const r = runContext({ argv: args.slice(1) });
      if (!r.ok) error(r.message);
      outputAudit(r.result, raw, r.text);
```

`--raw` is spliced out of `args` before dispatch (df-tools.cjs line ~303), so `argv` never contains it.

audit-cli.cjs `runSessionAudit` (line 176) already validates `--limit`, `--since` and `--root` and calls
`sessionAudit.analyze([root], { limit: limit || undefined, since })`. Reuse `parseAuditArgs`, `validateLimit`,
`resolveRoot` and `DEFAULT_LIMIT`; do not re-implement them.

telemetry.cjs `collect` (lines 33-35) returns before the blocks section when `planningDir` is null:

```js
  if (!planningDir) return { ...out, advisories: ['no .planning/ — not a DevFlow project'] };
```
</codebase_examples>

<anti_patterns>
- Do not accept and ignore a flag. Every token is either understood or an error, which is the requirement.
- Do not default `--scan` to the real `~/.claude/projects` in tests. The default exists for users; tests pass `--root`.
- Do not change the no-flag output. Status views call `telemetry` without flags and must stay fast.
- Do not fabricate SUMMARY metrics (duration, tokens, task timings). calibrate would treat them as samples.
- Do not rename the 09-03 TRD or touch its content.
</anti_patterns>

<error_recovery>
- If `summary post 09-03` cannot resolve the objective (objective 9 lives in the v1.1 archive, and current
  ROADMAP.md lists it only as a milestone bullet), try `--file 09-03-cli-skill-and-integration-SUMMARY.md` with the
  TRD id spelled `9-03`. If both fail, stop and report the exact error. Do not write the file with the Write tool:
  planning writes go through the verb.
- If `roadmap-reconcile.test.cjs` E2E1 (the zero-drift self-test against this repo's ROADMAP) changes after the
  backfill, the SUMMARY made a TRD checkbox look done. Read the reported drift and record it. ROADMAP.md line 27 is a
  milestone bullet, not a TRD checkbox, so no drift is expected.
</error_recovery>

</embedded_context>

<gotchas>
- `runTelemetry` result: `collect(...)`'s object, plus `scan: { root, limit, since: since || null, files_scanned }`
  when `--scan` ran. Take `files_scanned` from the session-audit report's own field. Text: the advisories joined, and
  with `--scan` a first line
  `scan: <files_scanned> transcripts, <total> blocks (<devflow_owned> DevFlow-owned)`.
- In `collect`, when `planningDir` is null AND `sessionReport` is given, fill `out.blocks` (the same mapping as below)
  before returning. Without a report the early return is byte-identical.
- help.cjs `'telemetry'` usage:
  `df-tools telemetry [--scan [--limit N] [--since YYYY-MM-DD] [--root <dir>]] [--raw]`. The summary adds:
  "`--scan` adds a session audit of blocking events (default root ~/.claude/projects, --limit 150; 0 = all)".
- Backfilled SUMMARY frontmatter. Follow the current template (`templates/summary.md`):
  - `objective: 09-roadmap-disk-reconciliation`, `job: "03"`, `subsystem: roadmap`, `tags`, `requires`
    (09-02's provides), `provides`, `key-files`;
  - `requirements-completed: [SC-5, SC-6, SC-7, SC-8, SC-9, SC-10]` (the TRD's requirements, verified passed in
    09-VERIFICATION.md);
  - `backfilled: 2026-10-06` and `backfill_source: "git d1e70c74 d48d60e7 e4a112d4 + 09-VERIFICATION.md (objective 61, OBS-04)"`;
  - NO `metrics.duration` or `duration`, and NO `tokens_*` / `token_model`.
- Backfilled SUMMARY body:
  - a one-line summary;
  - `## Progress` with each task marked done and its commit, taken from `git show --stat` of the three commits;
  - `## What changed` (the `sync-roadmap` CLI with `--dry-run` and `--interactive`, the `/devflow:sync-roadmap` skill,
    the 8-entry export lock with the `LOCKED by TRD 09-03` banner, and the e2e self-test and idempotency tests);
  - `## Evidence`, citing 09-VERIFICATION.md truths 4-10;
  - a `## Backfill note` saying it was written on 2026-10-06 from history for OBS-04, with no timings recorded.
  Confirm each named file still exists before citing it (`ls`); if one was renamed later, say so.
- ROADMAP.md line 27 currently reads
  `- [x] Objective 9: Roadmap ↔ disk reconciliation (3/3 delivered; 09-03 SUMMARY.md missing — docs gap only)`.
  Change only the parenthetical, to `(3/3 delivered; 09-03 SUMMARY backfilled 2026-10-06, objective 61)`.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: telemetry --scan through runTelemetry, strict flag handling (tests 1-12)</name>
  <files>plugins/devflow/devflow/bin/lib/audit-cli.cjs, plugins/devflow/devflow/bin/lib/telemetry.cjs, plugins/devflow/devflow/bin/lib/telemetry-cli.test.cjs, plugins/devflow/devflow/bin/df-tools.cjs, plugins/devflow/devflow/bin/lib/help.cjs</files>
  <action>
RED: write tests 1-12 in `telemetry-cli.test.cjs`. Build the transcript root with the bash-replay or transcript
fixture builders, with one session holding one hook denial so `total_events >= 1`. Run the file: in-process tests fail
(no `runTelemetry`), and CLI tests 10-11 fail (flags ignored). Commit
`test(61-04): telemetry --scan runs a session audit and unknown flags fail`.

GREEN: add and export `runTelemetry` in audit-cli.cjs. Update its header comment to say it now fronts `telemetry` too.
Fill `blocks` in `collect` for the null-`planningDir` plus report case. Replace the df-tools `telemetry` case body with
the `runTelemetry` dispatch, and update help.cjs. Commit
`feat(61-04): telemetry --scan includes a session audit; unknown flags are errors`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/telemetry-cli.test.cjs plugins/devflow/devflow/bin/lib/telemetry.test.cjs plugins/devflow/devflow/bin/lib/audit-cli.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` passes (skip any of those files that do not exist). `node plugins/devflow/devflow/bin/df-tools.cjs telemetry --scan --limit 20 --raw` in this repo exits 0 with a `blocks` object, and `node plugins/devflow/devflow/bin/df-tools.cjs telemetry --scna` exits 1.</verify>
  <done>`--scan` works, every other flag is understood or rejected, and plain `telemetry` is unchanged.</done>
</task>

<task type="auto">
  <name>Task 2: Backfill the 09-03 SUMMARY from history and clear I001</name>
  <files>.planning/objectives/09-roadmap-disk-reconciliation/09-03-cli-skill-and-integration-SUMMARY.md, .planning/ROADMAP.md</files>
  <action>
1. Before writing anything, record the baselines:
   - `node plugins/devflow/devflow/bin/df-tools.cjs validate health --raw`: the I001 line;
   - `node plugins/devflow/devflow/bin/df-tools.cjs calibrate --dry-run --raw`: its sample counts. If `--raw` is not
     supported, use the plain output.
2. Gather the evidence: `git show --stat e4a112d4`, `git show --stat d1e70c74`, `git show --stat d48d60e7`, the 09-03
   TRD's must_haves, and `09-VERIFICATION.md`. Run each as a separate Bash call.
3. `node plugins/devflow/devflow/bin/df-tools.cjs planning draft objectives/09-roadmap-disk-reconciliation/09-03-cli-skill-and-integration-SUMMARY.md`.
   Fill the printed path with the Write tool (gotchas), then run
   `node plugins/devflow/devflow/bin/df-tools.cjs summary post 09-03 --from <draft path> --file 09-03-cli-skill-and-integration-SUMMARY.md`.
4. Update ROADMAP.md line 27 (gotchas), in local mode only.
5. Re-run both baseline commands. I001 is gone, and the calibrate sample counts are identical.
6. Commit `docs(09-03): backfill the missing SUMMARY from history (objective 61, OBS-04)` with `--files` naming the
   SUMMARY and ROADMAP.md.
  </action>
  <verify>`node plugins/devflow/devflow/bin/df-tools.cjs validate health --raw` lists no I001. `node --test plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs` passes. The calibrate sample counts before and after are recorded in the SUMMARY and are equal.</verify>
  <done>The 09-03 SUMMARY exists as a marked backfill, I001 is clear, and no calibration sample was added.</done>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/devflow/bin/lib/telemetry-cli.test.cjs plugins/devflow/devflow/bin/lib/telemetry.test.cjs plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs`.
</validation_gates>

<verification>
- `telemetry --scan` returns blocks. `telemetry --bogus` exits 1. Plain `telemetry` is unchanged.
- `validate health` has no I001.
</verification>

<success_criteria>
- [ ] `telemetry --scan` works, and no flag is silently ignored
- [ ] The 09-03 SUMMARY is backfilled from cited evidence, and I001 clears
- [ ] calibrate gained no fabricated sample
</success_criteria>

<output>
After completion, create `.planning/objectives/61-store-mode-rough-edges-and-observability/61-04-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`.
</output>
