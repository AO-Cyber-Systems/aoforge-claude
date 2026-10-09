---
objective: 68-milestone-and-objective-verbs
trd: "05"
type: standard
wave: 2
depends_on: ["68-03"]
files_modified:
  - plugins/devflow/devflow/bin/lib/flag-spec.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/flag-guard-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/flag-guard-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/flag-spec.repo.test.cjs
autonomous: true
requirements: [TOOL-01]
must_haves:
  truths:
    - "Every command help.cjs marks `mutates: true` (51 today) has a FLAG_SPEC entry, and every FLAG_SPEC command is a writing command; a new writing command without an entry fails CI"
    - "Every FLAG_SPEC entry, including the ones whose own parser rejects flags (`ownParser`: doctor, upgrade, calibrate, estimate, tokens, transcript-export, override, ...), exits 1 naming an unknown flag in the spawn test, with an unchanged tree and no gh call"
    - "Every df-tools invocation documented in the plugin's skills, agents, workflows, references, templates and hooks, in docs/USER-GUIDE.md and in CLAUDE.md uses only flags the spec accepts for that command, so the guard breaks no documented call"
    - "Every `anyFlags`, `ownParser` and `tailFrom` rule carries a non-empty `reason`, and the doc scan's exemption list has no stale entry"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/flag-spec.cjs
      provides: "FLAG_SPEC covering all writing commands"
      exports: ["FLAG_SPEC"]
    - path: plugins/devflow/devflow/bin/lib/flag-spec.repo.test.cjs
      provides: "completeness against help.cjs, PROBES = spec, exemption reasons, documented-invocation scan"
  key_links:
    - from: "lib/flag-spec.repo.test.cjs"
      to: "lib/help.cjs COMMANDS (mutates) and lib/flag-spec.cjs FLAG_SPEC"
      via: "set equality of writing commands and spec commands"
      pattern: "mutates"
    - from: "lib/flag-spec.repo.test.cjs"
      to: "plugins/devflow/**/*.md, hooks, docs/USER-GUIDE.md, CLAUDE.md"
      via: "documented df-tools invocations checked with checkFlags"
      pattern: "checkFlags"
---

# TRD 68-05: The unknown-flag spec covers every writing command and stays in step with the docs (TOOL-01)

<objective>
68-03 put the unknown-flag guard in the dispatcher with a spec for the planning and state writers. The other 29
writing commands (gh, stack, planning, handoff, migrate, adopt, flutter-ui, ui, generate, workstreams, changelog,
defaults-table, project-hygiene, decision-queue, initiatives, sync-roadmap, deprecation, project-decline,
project-accept, merge-driver, exec-context, global-config, and the ones with their own parsers) still ignore an unknown
flag. Add their spec entries, then add the repository test that keeps the spec honest: complete against help.cjs's
`mutates` list, one probe per entry, a reason for every exemption, and every documented invocation accepted.

Purpose: success criterion 3, "every df-tools verb that writes" (TOOL-01). Output: the rest of FLAG_SPEC, probes, a
repo test.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/68-milestone-and-objective-verbs/68-03-SUMMARY.md
@plugins/devflow/devflow/bin/lib/flag-spec.cjs
@plugins/devflow/devflow/bin/lib/flag-guard.cjs

## Binding rules
- Strict TDD on tasks 1 and 2; one test at a time.
- Do not change flag-guard.cjs's rules or the dispatcher wiring (68-03's); this TRD adds data and tests. If the checker
  truly cannot express a command, stop and report it rather than weakening the guard.
- Hand-built fixtures; temp projects, fake HOME, gh shim; nothing reads this repository's `.planning/` or `~/.claude`.
- A probe must never reach the network or a live system: the guard rejects before dispatch, and the gh shim fails any
  unmatched call loudly. `ownParser` probes go through the command's own parser, which rejects before acting (the
  probe of 2026-10-08 confirmed exit 1 for doctor, upgrade --check, calibrate --dry-run, estimate milestone,
  tokens coverage, transcript-export, override --list, stack report, stack mcp, decision-queue).
- Parallel wave (68-04, 68-06 beside it): no shared files. Address your checkout explicitly if a worktree was
  provisioned; one plain command per Bash call; commit with
  `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Doc fixes: if the scan finds a documented flag that no code reads, that is a doc bug. Correct that one line in the
  plugin file (skills, agents, workflows, references, templates; no other TRD of this objective edits them) to what the
  code accepts, and list file:line before/after in the SUMMARY. A stale flag in docs/USER-GUIDE.md or CLAUDE.md goes to
  the EXEMPT list with reason `stale doc: fixed in 68-07` instead (68-07 owns those files and removes the exemption).

## Group-2 commands and where their flags are read
Grep the arm (`rg -n "case '<cmd>'" plugins/devflow/devflow/bin/df-tools.cjs`) and the module with
`rg -o "'--[a-z][a-z0-9-]*'" <module>`; read only the parse sections.

| command | handler module(s) | notes |
|---|---|---|
| gh | gh.cjs, gh-pull.cjs, gh-store-cli.cjs (outbox, trd, orphans), gh-pr-cli.cjs, gh-setup-cli.cjs | subcommands per usage in help.cjs; nested ones (`outbox flush`, `trd confirm-scope`, `pr start`) use the union of their sub-subcommands' flags |
| stack | stack-profile.cjs `cmdStack` → stack-* modules | report, mcp: `ownParser` |
| planning | planning-verbs-cli.cjs `cmdPlanningVerb` + df-tools arm | sibling-trd-scan, draft, import (`--dry-run`), mode |
| handoff | df-tools arm | create: `tailFrom: 2` (reason: carries the user's command; `--inputs-json` is extracted from it), complete: `--exit-code --output --output-file`, list, get |
| migrate | df-tools arm (around 692) | plan, apply: `--kind --default-work --work-choices --dry-run` |
| adopt | adopt-cli.cjs | preflight, begin, scaffold, report |
| flutter-ui | flutter-ui-setup/eval/eval-bootstrap/design-review modules | setup, eval, bootstrap, design-review |
| ui | ui-metrics.cjs, ui-spec-cli.cjs | metrics, spec, sheet, lock |
| generate, workstreams, changelog, defaults-table | uat-generator, workstreams, changelog, defaults-loader | changelog update: `--version --from --to --dry-run` |
| project-hygiene, decision-queue, initiatives, sync-roadmap, deprecation | project-hygiene, decision-queue (ownParser), initiatives-cli, roadmap-reconcile-cli, skill-route | sync-roadmap: `--dry-run --interactive` |
| project-decline, project-accept, merge-driver, exec-context, global-config | decline-tracker, merge-driver-cli, exec-context, global-config | exec-context: `--repo --base --id --path` |
| doctor, upgrade, calibrate, estimate, tokens, transcript-export, override | doctor-cli, upgrade-cli, calibrate-cli, estimate-cli, tokens-cli, audit-cli | `ownParser` (reason: `<module>` rejects unknown flags) |
</context>

## Test list

`flag-guard-cli.test.cjs` (task 1; the probe loop from 68-03 now covers the whole spec):
1. Every group-2 entry, via its PROBES argv + `--zz-unknown` → exit 1, stderr names `--zz-unknown` (and the label for
   guard-rejected entries), tree unchanged, gh shim log empty. RED: today these exit 0 or write.
2. The spawn loop skips exactly the entries whose rule is `anyFlags` or `tailFrom` (today `state patch` and
   `handoff create`) and asserts that skip list; their acceptance is flag-guard.test.cjs test 9 (pure, no spawn), so no
   handoff record is ever queued by a test.
3. Positive controls for group 2: `migrate plan --dry-run`, `changelog update --dry-run --version v9.9.9` (temp project
   with a CHANGELOG.md), `planning mode`, `exec-context check --repo <root>`: stderr has no `unknown flag`.

`flag-spec.repo.test.cjs` (task 2):
4. The set of `COMMANDS` keys with `mutates: true` equals the set of FLAG_SPEC keys (both directions, offenders listed).
5. PROBES keys equal the spec's labels (each subcommand, or the command for flags-only entries).
6. Every rule with `anyFlags`, `ownParser` or `tailFrom` has a non-empty `reason` string.
7. Documented invocations: scan `plugins/devflow/{skills,agents,hooks}/**`, `plugins/devflow/devflow/{workflows,references,templates}/**`,
   `docs/USER-GUIDE.md` and `CLAUDE.md` for `df-tools(.cjs)? [--cwd <x>] <cmd> [<sub>] ...` (one invocation per match,
   ending at a backtick, `|`, `;`, `&&`, `)`, `$(`'s closing paren or end of line); for writing commands build argv
   (tokens split on spaces, quoted strings kept whole, `<placeholders>` and `{placeholders}` dropped) and assert
   `checkFlags(argv, FLAG_SPEC)` is null. Failures report `file:line` and the flag.
8. Extraction unit check on a hand-written snippet with five invocations (backticked, piped, `$(...)`, a `--cwd` form,
   a `<placeholder>` value) → exactly the expected argv arrays.
9. Every EXEMPT entry (`file:line-substring` + reason) still matches a scanned line (no stale exemptions).
Tests 7 and 9 are guarded by an `IS_DEVFLOW_CHECKOUT` check like dispatch-completeness.test.cjs.

<embedded_context>

<codebase_examples>
The repo-scan precedent and its checkout guard (`lib/dispatch-completeness.test.cjs`):

```js
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_DEVFLOW_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));
// ... EXEMPT with a reason per entry, and a test that every EXEMPT key occurs in the scanned text
```

Other repo tests that scan plugin prose and are worth copying for file walking and reporting:
`lib/doc-refs.repo.test.cjs`, `lib/planning-writes.repo.test.cjs`, `lib/rg-flag-guard.test.cjs`.

Spec rule shape (68-03, `lib/flag-spec.cjs`):

```js
handoff: { subcommands: {
  create:   { tailFrom: 2, reason: 'carries the user command; --inputs-json is extracted from it by the handoff arm' },
  complete: { values: ['--exit-code', '--output', '--output-file'] },
  list: {}, get: {},
} },
doctor: { ownParser: true, reason: 'doctor-cli.cjs parseArgs rejects unknown flags (usage: df-tools doctor [--fix] [--json] [--path <dir>] [--global])' },
```
</codebase_examples>

<anti_patterns>
- Do not mark a command `ownParser` because reading its parser is tedious: only where the probe proves the module
  rejects an unknown flag before acting.
- Do not add `anyFlags` to make a failing doc line pass; find out what the code reads.
- Do not scan `.planning/`, `CHANGELOG.md` or `site/` (history and generated text name old flags on purpose).
</anti_patterns>

<error_recovery>
- A doc-scan failure on a flag the code DOES read: add it to the spec row (record in the SUMMARY).
- A doc-scan failure on a flag no code reads: fix the plugin doc line, or EXEMPT a USER-GUIDE/CLAUDE.md line with
  `stale doc: fixed in 68-07` (binding rules); either way listed in the SUMMARY.
- A doc-scan false positive from prose (a sentence naming a flag a command refuses, e.g. "never pass --no-verify"):
  EXEMPT with reason `prose, not an invocation`.
- If a probe for an `ownParser` command writes before rejecting (tree changed), that module ignores flags after acting:
  change the entry to an explicit rule (values/bools) so the dispatcher guard rejects first, and record it.
</error_recovery>

</embedded_context>

<gotchas>
- `gh` usage nests (`gh outbox resolve <seq> --accept-remote|--overwrite`, `gh pr merge <objective>`); key the spec at
  `gh <sub>` and accept the union of the nested flags, as the context table says.
- `planning` mixes a writer (`draft`, `import`) with readers (`mode`, `sibling-trd-scan`); the whole command is
  guarded because help.cjs marks it `mutates`.
- Documented invocations often end with `--raw`, which is a global and always accepted.
- The workflows contain `node ~/.claude/devflow/bin/df-tools.cjs` and `node "$DF" ...` style calls; match the literal
  `df-tools` / `df-tools.cjs` token, and skip variables you cannot resolve.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Spec entries and probes for the remaining writing commands (tests 1-3)</name>
  <files>plugins/devflow/devflow/bin/lib/flag-spec.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/flag-guard-fixtures.cjs, plugins/devflow/devflow/bin/lib/flag-guard-cli.test.cjs</files>
  <action>
RED: add PROBES for every group-2 label (shortest realistic argv per subcommand; for `ownParser` entries an argv that
reaches the parser) and tests 2-3; test 1 is the existing probe loop, which now fails for the new labels. Commit
`test(68-05): probes for every writing command`.

GREEN: add the group-2 entries to FLAG_SPEC from the context table, each row checked against its module. Keep the
table frozen and grouped with a comment per group. Run the full suite and fix rows from real failures (error_recovery
of 68-03 applies). Commit `feat(68-05): every writing command rejects an unknown flag`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/flag-guard-cli.test.cjs plugins/devflow/devflow/bin/lib/flag-guard.test.cjs` passes; full suite at baseline.</verify>
  <done>Test 1 went RED then GREEN for every group-2 label; tests 2-3 pass; nothing reached gh or the real HOME.</done>
  <recovery>If a probe hangs (a command waiting on stdin or a daemon), give it `stdio: ['ignore', ...]` via the fixture's run(), and if it still hangs mark the probe with a per-probe timeout and report the command in the SUMMARY.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: The repo test that keeps the spec complete and the docs accepted (tests 4-9)</name>
  <files>plugins/devflow/devflow/bin/lib/flag-spec.repo.test.cjs, plugins/devflow/devflow/bin/lib/flag-spec.cjs (and only the plugin doc lines the scan proves stale, each listed in the SUMMARY)</files>
  <action>
RED: write tests 4-9 with the extractor as a function inside the test file (`extractInvocations(text) -> [{line, argv}]`).
Run them: any failures are real findings (missing spec rows, stale docs, prose false positives). Commit
`test(68-05): repo test for flag-spec completeness and documented invocations`.

GREEN: resolve each finding per error_recovery (spec row added when the code reads the flag; EXEMPT with reason
otherwise). If every test passed at first run, show sensitivity instead: temporarily delete one spec flag that a doc
uses, confirm test 7 fails naming its file:line, restore it, and record that in the SUMMARY. Commit
`fix(68-05): flag spec matches every documented invocation`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/flag-spec.repo.test.cjs` passes; full suite at baseline.</verify>
  <done>Tests 4-9 pass; every exemption has a reason; the SUMMARY lists spec rows added from the scan and any stale-doc exemptions for 68-07.</done>
  <recovery>If the extractor produces many false invocations from prose, tighten it to code spans and fenced blocks first (most real calls are there) and record the remaining exemptions; do not drop a scanned directory to make it pass.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/flag-guard-cli.test.cjs plugins/devflow/devflow/bin/lib/flag-guard.test.cjs plugins/devflow/devflow/bin/lib/flag-spec.repo.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs</test_scoped>
<!-- lint/typecheck/build: none in the stack profile. Take the failing set before the first change; only those known
     environment failures may remain. -->
</validation_gates>

<verification>
- SC-3 for every writer: test 1 (all spec entries reject), test 4 (spec = writing commands), test 5 (a probe per entry).
- No documented call is broken by the guard: test 7.
</verification>

<success_criteria>
- Tests 1-9 pass; the spec has an entry for each of the writing commands help.cjs lists; full suite at baseline.
</success_criteria>

<output>
After completion, publish `68-05-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes (stamp tokens first). List spec rows added from failures, `ownParser` entries, and every EXEMPT
entry with its reason.
</output>
