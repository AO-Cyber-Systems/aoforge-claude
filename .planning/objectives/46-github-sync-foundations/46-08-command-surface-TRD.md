---
objective: 46-github-sync-foundations
trd: "08"
type: standard
wave: 4
depends_on: ["46-07"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh.cjs
  - plugins/devflow/devflow/bin/lib/gh.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-commands.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
  - plugins/devflow/devflow/bin/lib/help.test.cjs
  - plugins/devflow/devflow/bin/lib/skill-route.cjs
  - plugins/devflow/devflow/bin/lib/skill-route.test.cjs
autonomous: true
requirements: [GSF-01, GSF-02, GSF-08]
must_haves:
  truths:
    - "`gh sync --all` (and bare `gh sync`) syncs every objective with one run context: one label bootstrap, one marker scan, per-objective results, exit 1 when any objective failed"
    - "`gh sync-objectives` still works as a deprecated alias for `gh sync --all` and prints one deprecation line to stderr; the rename is registered next to DEPRECATION_MAP in skill-route.cjs"
    - "`comment`, `close-issue`, `pull`, `sync` all resolve `2`, `02`, `02-a` to the same issue through mapping v3; `#N` forces a raw issue number"
    - "Comments posted for an objective start with `<!-- devflow:id=<id> kind=<kind> -->` (`kind` defaults to `comment`; verifier passes `--kind verification`; close comments use `kind=close`)"
    - "`github.enabled:false` → every subcommand except `status` returns `skipped:true`, exits 0 and makes zero gh calls"
    - "`ok:false` without `skipped` exits 1 for `sync`, `sync-objectives`, `comment`, `close-issue`, `sync-release`, `resolve`"
    - "`gh status` is hermetic: gh presence is checked through the seam, not `which gh`"
    - "No module under `lib/` spawns `gh` except gh-client, and gen-1 code (`formatIssueBody`, `getMilestoneVersion`, gen-1 `readMapping`/`writeMapping`) is gone"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh.cjs
      provides: "cmdGhSync(cwd, args, raw), syncAll(root), cmdGhComment/cmdGhCloseIssue/cmdGhSyncRelease/cmdGhResolve/ghStatus on gh-client + mapping v3; cmdGhSyncObjectives = deprecated delegate"
    - path: plugins/devflow/devflow/bin/lib/skill-route.cjs
      provides: "DF_TOOLS_DEPRECATIONS {'gh sync-objectives': 'gh sync --all'}"
    - path: plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs
      provides: "repo guard: single gh spawn site; no dir-prefix parseInt; no [object Object]"
  key_links:
    - "df-tools.cjs `gh` dispatch → cmdGhSync / alias → syncAll → syncObjective(arg, root, {runCtx})"
    - "agents/verifier.md (46-10) calls `gh comment <id> @file:... --kind verification` and `gh close-issue <id>`"
    - "46-10 execute-objective step relies on `gh sync <dir>` exit codes"
---

# TRD 46-08: One push command and a consistent command surface (GSF-01, GSF-02, GSF-08)

<objective>
Fold `gh sync-objectives` into `gh sync` (per objective or `--all`), keep `sync-objectives` as a
deprecated alias, and move `comment`, `close-issue`, `sync-release`, `resolve` and `status` onto the
one seam, one mapping, one marker scheme, the enabled gate and the exit-code rule. Remove gen-1 code.
Update dispatch and help.

Purpose: the remainder of defects 1, 2 and 8 (`comment`/`close-issue` use gen-1 mapping and raw
`runGh`; `enabled` ignored; legacy commands exit 0 on `ok:false`) and the locked command consolidation.
Output: gh.cjs command layer, dispatch/help, deprecation registration, `gh-commands.test.cjs`, repo guard.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit before GREEN per task. Commit via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Tests use gh-fake via `gh._setRunGh`, temp projects, `HOME`/`DEVFLOW_GH_CACHE_DIR` temp dirs, monkey-patched `process.exit`/`process.stdout.write`/`process.stderr.write`. Never real GitHub, never port 8080.
- Existing test D3 (`cmdGhSyncObjectives` with no config → `skipped:true`, no exit 1) must stay green.
- Research reference: `46-RESEARCH.md` → "Command surface after consolidation" (incl. ambiguity rule), "Pattern 5" (enabled gate, exit codes), Pitfalls 1-4, 10, 14.

<embedded_context>

<codebase_examples>
Current dispatch (df-tools.cjs:1066-1100):
```js
case 'gh': {
  const subcommand = args[1];
  if (subcommand === 'status') cmdGhStatus(cwd, raw);
  else if (subcommand === 'sync-objectives') cmdGhSyncObjectives(cwd, raw);
  else if (subcommand === 'comment') cmdGhComment(cwd, args[2], args[3], raw);
  else if (subcommand === 'close-issue') cmdGhCloseIssue(cwd, args[2], args[3] || null, raw);
  else if (subcommand === 'sync-release') cmdGhSyncRelease(cwd, args[2], raw);
  else if (subcommand === 'resolve') cmdGhResolve(cwd, args[2], raw, args.slice(2));
  else if (subcommand === 'sync') { if (args[2]) cmdGhSyncObjective(cwd, args[2], raw); else cmdGhSyncObjectives(cwd, raw); }
  else if (subcommand === 'pull') { require('./lib/gh-pull.cjs').cmdGhPull(cwd, args.slice(2), raw); }
  else error('Unknown gh subcommand. Available: status, sync, pull, sync-objectives, resolve, comment, close-issue, sync-release');
}
```
Help (help.cjs:259-262): `'gh': { usage: 'df-tools gh <status|sync [objective]|pull <objective> [--apply]|sync-objectives|resolve <objective>|comment <issue> <body>|close-issue <issue> [comment]|sync-release <tag>> [--raw]', ... }`.

Current `cmdGhComment` (gh.cjs:863-902): gen-1 `readMapping`, `parseInt`, raw `runGh`, `output(..., raw, '')` with no exit code.
`cmdGhCloseIssue` (905-920) same pattern. `cmdGhSyncRelease` (923-1010) raw `runGh` for `release view|edit|create`.
Rename registry: skill-route.cjs `DEPRECATION_MAP` (slash-command names) + `REMOVED_COMMANDS`; doc-refs imports both.
</codebase_examples>

<anti_patterns>
- Treating a bare number as an issue before trying it as an objective id (ambiguity rule: objective first; `#N` forces issue).
- Keeping two sync implementations. `cmdGhSyncObjectives` becomes a 3-line delegate.
- Changing `--raw` output of legacy commands by accident: today they print `''` under `--raw`. Keep `rawValue` as it is per command; only the exit code changes.
- Putting `gh sync-objectives` into `DEPRECATION_MAP` itself: that map is keyed by slash-command names and doc-refs would read it as `/devflow:sync-objectives`. Use the sibling `DF_TOOLS_DEPRECATIONS` map in the same module (same single source of rename truth).
</anti_patterns>

<error_recovery>
- `--all` with one failing objective: continue the rest, collect `{id, ok:false, error}`, exit 1 at the end.
- `sync-release` with no tag → usage error, exit 1.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/gh.cjs
@plugins/devflow/devflow/bin/lib/skill-route.cjs
</context>

<gotchas>
- `syncObjective(arg, root, {runCtx})` must accept a shared run context (created once in `syncAll`) so the marker scan and label bootstrap happen once; mapping is written once at the end of `--all` as well as after each single sync.
- `--all` objective list = `listObjectiveIndex(root)` (dirs ∪ ROADMAP headers), numeric order, decimals kept (`2.1` sorts between `2` and `3`).
- `hasHelpFlag`: `--help` anywhere in `gh sync ...` prints usage and exits 0 (issue #100 finding 4 precedent in `cmdGhResolve`).
- `comment <target> @file:<path>` keeps working; add optional `--kind <k>` anywhere after the target.
- A comment on a raw `#N` with no mapped objective is posted without a marker (no id is known) — record this in the result as `marker:false`.
</gotchas>

## Test list (`gh-commands.test.cjs` unless noted)

sync / alias
1. `cmdGhSync(root, ['--all'])` on objectives `02-a`, `02.1-b`, `03-c` → three results, ONE `issue list` call, ONE `label create`; exit 0.
2. Bare `cmdGhSync(root, [])` behaves like `--all`.
3. One objective fails (fake `failNext` on its `issue create` with a non-rate-limit error) → others still synced, JSON lists the failure, exit 1.
4. `df-tools gh sync-objectives` path (`cmdGhSyncObjectives`) → same result as `--all` plus stderr line matching `/deprecated.*gh sync --all/`.
5. `skill-route.DF_TOOLS_DEPRECATIONS['gh sync-objectives'] === 'gh sync --all'` (in `skill-route.test.cjs`).
6. `gh sync --help` → usage on stdout, exit 0, zero gh calls.

comment / close-issue
7. After `sync --all`: `comment 2 "hi"`, `comment 02-a "hi"`, `comment 02 "hi"` all post to the same issue; body starts `<!-- devflow:id=2 kind=comment -->`.
8. `comment 2.1 "x"` posts to 2.1's issue, not 2's.
9. `comment #7 "x"` posts to issue 7 raw, `marker:false`.
10. `comment 2 @file:<tmp>/V.md --kind verification` → body is the file content prefixed with `<!-- devflow:id=2 kind=verification -->`.
11. `close-issue 2 "Verified"` → `issue close <n> --repo o/r --comment <marker kind=close + text>`.
12. Legacy mappings: for v1 `{"objectives":{"2":1}}` and v2 `{"objectives":{"2":{"issue_id":1,"state_comment_id":null}}}` files (no sync first), `comment 2` and `close-issue 2` hit issue 1 and no argv contains `[object Object]`.
13. Failure (`failNext` on `issue comment`) → exit 1; unknown objective with no numeric fallback → exit 1.

enabled gate / exit codes / status
14. `enabled:false`: `sync`, `sync --all`, `sync-objectives`, `comment`, `close-issue`, `sync-release v1`, `resolve 2`, `pull 2` → each `skipped:true`, exit 0, fake `calls()` empty. `status` still reports `enabled:false`.
15. `ghStatus` with the fake answering `--version` ok and `auth status` ok → `enabled:true`; `--version` failing (status null) → `reason:/gh CLI not installed/`. No `which`.
16. D3 (existing, `gh.test.cjs`) unchanged and green.

repo guard (`gh-seam.repo.test.cjs`)
17. Across `gh.cjs`, `gh-pull.cjs`, `gh-issue.cjs`, `gh-project.cjs`, `gh-mapping.cjs`, `gh-body.cjs`, `gh-milestone.cjs`, `sync-state.cjs`, `conflict.cjs`, `awareness.cjs`: no `spawnSync('gh'`, no `spawnSync("gh"`, no `runGh(` except the forwarding wrappers; only `gh-client.cjs` spawns gh.
18. Same files: no `parseInt(` whose argument mentions `dir`, `objectiveId`, `split('-')` or `match(/^(\d+)` (list offending lines in the assertion message).
19. gh.cjs exports no `formatIssueBody` / `getMilestoneVersion`; `readMapping`/`writeMapping` are absent; `readMappingV2`/`writeMappingV2` (kept for importers) return/accept v3.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: `gh sync [--all|<objective>]`, alias, deprecation registry, dispatch and help (tests 1-6)</name>
  <files>plugins/devflow/devflow/bin/lib/gh.cjs, plugins/devflow/devflow/bin/lib/gh-commands.test.cjs, plugins/devflow/devflow/bin/lib/skill-route.cjs, plugins/devflow/devflow/bin/lib/skill-route.test.cjs, plugins/devflow/devflow/bin/df-tools.cjs, plugins/devflow/devflow/bin/lib/help.cjs, plugins/devflow/devflow/bin/lib/help.test.cjs</files>
  <action>
RED: tests 1-6 (+ help test asserting the new usage string mentions `sync [<objective>|--all]` and marks `sync-objectives` deprecated). Commit RED.

GREEN:
- `syncAll(root)` → `runCtx = createRunContext(root)` (skipped → return it); loop `listObjectiveIndex`; `syncObjective(id, root, {runCtx})`; `writeMappingV3` at end; `{ok: failed===0, results, failed}`.
- `cmdGhSync(cwd, args, raw)`: help flag → usage; `--all` or no positional → `syncAll`; else `cmdGhSyncObjective(cwd, positional, raw)`. Emit via `gh-client.emitResult`.
- `cmdGhSyncObjectives(cwd, raw)` → stderr `Note: \`gh sync-objectives\` is deprecated; use \`gh sync --all\`.` (text from `DF_TOOLS_DEPRECATIONS`) then `cmdGhSync(cwd, ['--all'], raw)`.
- skill-route.cjs: add + export `DF_TOOLS_DEPRECATIONS` beside `DEPRECATION_MAP` with a comment that it holds df-tools subcommand renames.
- df-tools.cjs: `sync` → `cmdGhSync(cwd, args.slice(2), raw)`; `comment` passes `args.slice(2)` (for `--kind`); error string lists `status, sync, pull, resolve, comment, close-issue, sync-release (sync-objectives: deprecated alias)`.
- help.cjs usage: `df-tools gh <status|sync [<objective>|--all]|pull <objective> [--apply]|resolve <objective>|comment <objective|#issue> <body|@file:path> [--kind k]|close-issue <objective|#issue> [comment]|sync-release <tag>> [--raw]  (sync-objectives: deprecated alias of sync --all)`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-commands.test.cjs plugins/devflow/devflow/bin/lib/skill-route.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.test.cjs</verify>
  <done>Tests 1-6 pass; help and skill-route suites green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: comment / close-issue / sync-release / resolve / status on the seam, v3 mapping, markers, gate and exit codes (tests 7-16)</name>
  <files>plugins/devflow/devflow/bin/lib/gh.cjs, plugins/devflow/devflow/bin/lib/gh-commands.test.cjs, plugins/devflow/devflow/bin/lib/gh.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs</files>
  <action>
RED: tests 7-15 (extend gh-fake for `release view|edit|create` if needed). Commit RED.

GREEN:
- `resolveTarget(cwd, target)`: `#N` → `{issue:N, id:null}`; `resolveObjective` hit with mapping entry → `{issue, id}`; objective hit without entry → error `no GitHub issue for objective <id>; run gh sync <id>`;
  no objective and `^\d+$` → `{issue:N, id:null}`.
- `cmdGhComment(cwd, argsOrTarget, body, raw)`: accept both old positional call shape and the args array; gate via `requireEnabled`; `@file:` handling kept;
  `withCommentMarker(id, kind, text)` when id known; `ghWrite(['issue','comment',N,'--repo',repo,'--body',b])`; `emitResult`.
- `cmdGhCloseIssue`: same resolution; `--comment` text marked `kind=close`; `ghWrite`.
- `cmdGhSyncRelease`, `cmdGhResolve`: gate first; every gh call via `ghRead`/`ghWrite`; `emitResult`.
- `ghStatus`: replace `spawnSync('which',...)` with `ghRead(['--version'])` (`status === null` or ENOENT text → not installed).
- Convert the remaining direct `_runGh` call sites (`findRoadmapIssue`, `addToProject`, `linkSubIssue`, `walkProject`, `readIssueState`, `requireGhAuth`, `resolveChain` helpers) to `ghRead`/`ghWrite`.
Update affected legacy groups in `gh.test.cjs` (enabled config in fixtures; exit-code expectations) and list them in the SUMMARY.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-commands.test.cjs plugins/devflow/devflow/bin/lib/gh.test.cjs</verify>
  <done>Tests 7-16 pass; D3 unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Delete gen-1 code; repo guard (tests 17-19)</name>
  <files>plugins/devflow/devflow/bin/lib/gh.cjs, plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs, plugins/devflow/devflow/bin/lib/gh.test.cjs</files>
  <action>
RED: tests 17-19 (they fail while gen-1 code and `which` remain). Commit RED.

GREEN: delete `formatIssueBody`, `getMilestoneVersion`, gen-1 `readMapping`/`writeMapping`, the old `cmdGhSyncObjectives` body, and the local `runGh` spawn
(gh.cjs `_runGh` becomes a pure forwarder to gh-client). `readMappingV2(cwd)` → `readMappingV3(cwd)`; `writeMappingV2(cwd, m)` → `writeMappingV3(cwd, migrateMapping(m).mapping)`
(comment: kept for importers; v3 only). Remove tests that exercised deleted helpers only (list them in the SUMMARY).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs plugins/devflow/devflow/bin/lib/gh.test.cjs plugins/devflow/devflow/bin/lib/gh-commands.test.cjs plugins/devflow/devflow/bin/lib/gh-sync.test.cjs plugins/devflow/devflow/bin/lib/gh-pull.test.cjs plugins/devflow/devflow/bin/lib/conflict.test.cjs plugins/devflow/devflow/bin/lib/awareness.test.cjs plugins/devflow/devflow/bin/lib/pm-backend.test.cjs</verify>
  <done>All listed suites green; `rg -n "spawnSync" plugins/devflow/devflow/bin/lib/gh.cjs` → no matches.</done>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh*.test.cjs plugins/devflow/devflow/bin/lib/skill-route.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs</test>
</validation_gates>

<verification>
- `node plugins/devflow/devflow/bin/df-tools.cjs gh sync --help` prints the new usage and exits 0.
- In a temp project without config: `node .../df-tools.cjs --cwd <tmp> gh comment 2 hi; echo $?` → `skipped`, 0.
</verification>

<success_criteria>
One push command; every gh subcommand shares the seam, mapping, markers, enabled gate and exit-code rule.
</success_criteria>

<output>
After completion, create `.planning/objectives/46-github-sync-foundations/46-08-SUMMARY.md`
</output>
