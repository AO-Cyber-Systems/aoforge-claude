---
objective: quick-39
trd: 01
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs
  - plugins/aoforge/aoforge/workflows/verify-work.md
  - plugins/aoforge/aoforge/references/checkpoints.md
  - plugins/aoforge/aoforge/references/verification-patterns.md
  - plugins/aoforge/aoforge/references/defaults-table.md
  - plugins/aoforge/aoforge/references/model-profiles.json
  - plugins/aoforge/aoforge/references/model-profiles.md
  - plugins/aoforge/aoforge/references/testing-strategy.md
  - plugins/aoforge/aoforge/templates/trd-prompt.md
  - plugins/aoforge/aoforge/templates/UAT.md
  - plugins/aoforge/aoforge/templates/stack.md
  - plugins/aoforge/aoforge/templates/codebase/stack.md
  - plugins/aoforge/aoforge/templates/codebase/testing.md
  - plugins/aoforge-stack-web/fragments/executor.md
  - plugins/aoforge-stack-web/CHANGELOG.md
  - plugins/aoforge-stack-flutter/fragments/planner.md
  - plugins/aoforge-stack-flutter/fragments/verifier.md
  - plugins/aoforge-stack-flutter/profiles/flutter.md
  - plugins/aoforge-stack-flutter/CHANGELOG.md
  - CHANGELOG.md
autonomous: true
must_haves:
  truths:
    - "stack-neutrality.repo.test.cjs scans the whole core plugin: `.claude-plugin`, `agents`, `skills`, `hooks` and all of `aoforge/` (bin, workflows, templates, references, schemas, stack-profiles), skipping only `*.test.(c)js|mjs`, `__fixtures__` and `node_modules`. Its PATTERN is `/flutter|\\bdart\\b|maestro|playwright|pubspec|browser_[a-z]/i`, so a body line such as `browser_navigate(url=...)` in any core file fails CI"
    - "GRANT_ALLOW is byte-identical to quick 38: exactly the five read-only Playwright tokens, only on agents/executor.md's frontmatter `tools:` line. A sixth Playwright grant, a Playwright wildcard, or a non-Playwright browser grant such as `mcp__chrome__browser_click` on that line fails the scrub test"
    - "No core file outside ALLOW names flutter, dart, maestro, playwright, pubspec or a `browser_*` tool. The seven new ALLOW entries are data or cross-plugin references only (design-craft.md, design-preflight.md, design-stack-flutter.md recorded as known debt, deployment-verification.md, and three schemas), each with a reason of 20+ characters"
    - "verify-work.md drives no UI. A UI test's pre-verification reuses the evidence the active packs already produced (VERIFICATION.md runtime rows, SUMMARY pack self-check tables). Failing that, it spawns at most once per session the agent that `stack context verifier --raw` lists under `packs.subagents`. With neither, the test is presented without a Pre-verified block"
    - "checkpoints.md and verification-patterns.md name no browser tool. They point at the pre-check an active pack's executor fragment contributes and at the UI drive its verifier agent runs. The web pack's executor fragment gains a `## Before a UI checkpoint:human-verify` section that uses its existing read-only check, and states that click and screenshot evidence stays with web-ui-verifier"
    - "trd-prompt.md has no Flutter fields. It documents `stack`, `platform` and `type: ui` as pack-defined, read through `stack context planner`, and keeps the core `api_contract` field with a neutral example path. The Flutter planner fragment carries the moved YAML example and field table. No manifest key, schema change or new abstraction is added"
    - "UAT.md has a neutral `## Pack-generated UAT` section that keeps the exact text `the generator REFUSES to overwrite`. The Flutter verifier fragment's Step 9 carries every fact the old section held. testing-strategy.md has no Flutter column, gotcha or routing line; those live in plugins/aoforge-stack-flutter/profiles/flutter.md `## Testing`, whose body stays under 150 lines"
    - "The moved-text token check (Task 3) prints no MISS line. Every fact dropped from core either appears in pack text or is listed in the SUMMARY as deliberately dropped, with a reason"
    - "`npm test` has no new failures against BASE. stack-neutrality goes from 5 tests to at least 7, all passing. planning-writes, builtin-sweep, ui-spec-lock, ui-spec-skill-contract, context-budget, model-profiles, intent, defaults-loader, stack-packs, rename-guard, doc-refs, planning-audit and the Flutter pack suite keep their BASE pass counts. Nothing is pushed, tagged or released, nothing is written under ~/.claude or /Users/justin/dev/aoforge-claude, and the diff adds no port 8080"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs
      provides: "whole-plugin ROOTS, browser_ in PATTERN, seven data ALLOW entries, sensitivity + coverage tests; GRANT_ALLOW unchanged"
    - path: plugins/aoforge-stack-web/fragments/executor.md
      provides: "`## Before a UI checkpoint:human-verify`: the per-route check run on the checkpoint's routes, rows shown as pre-verified evidence"
    - path: plugins/aoforge-stack-flutter/fragments/planner.md
      provides: "`## TRD frontmatter for type: ui`: example YAML + field table moved from templates/trd-prompt.md"
    - path: plugins/aoforge-stack-flutter/fragments/verifier.md
      provides: "Step 9 complete: row sources, per-platform expansion, state descriptions, format, refusal, publish and later edits"
    - path: plugins/aoforge-stack-flutter/profiles/flutter.md
      provides: "`## Testing`: layer cells, outside-in route, codegen note and the web pumpAndSettle gotcha moved from testing-strategy.md"
  key_links:
    - from: "workflows/verify-work.md stack pre-verification step"
      to: "aoforge-stack-web:web-ui-verifier"
      via: "`stack context verifier --raw` → `packs.subagents[].agent`, spawned with the Task tool"
    - from: "references/checkpoints.md `## Stack Pre-Verification Before Checkpoints`"
      to: "plugins/aoforge-stack-web/fragments/executor.md `## Before a UI checkpoint:human-verify`"
      via: "`stack context executor` Read pointer"
    - from: "templates/trd-prompt.md stack fields"
      to: "plugins/aoforge-stack-flutter/fragments/planner.md `## TRD frontmatter for type: ui`"
      via: "`stack context planner` (existing `fragments.planner` contract)"
    - from: "templates/UAT.md `## Pack-generated UAT`"
      to: "plugins/aoforge-stack-flutter/fragments/verifier.md Step 9"
      via: "`stack context verifier` Read pointer"
    - from: "references/testing-strategy.md (planner Step 4)"
      to: "plugins/aoforge-stack-flutter/profiles/flutter.md `## Testing`"
      via: "`stack context planner --raw` resolved Testing section"
---

# Quick 39: Move the remaining web and Flutter procedure out of core; tighten the neutrality guard

## Objective

The work happens in the worktree
`/private/tmp/claude-501/-Users-justin-dev-aoforge-claude/29d3d902-73eb-439c-9c64-ba469a668a6e/scratchpad/main-wt`
on branch `fix/post-77-verification` (HEAD 764626d8 at planning time), written `<repo>` below. Work only there. Its
planning tree is the legacy planning directory. Run aof-tools as
`node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <repo> ...`. **Never write under
`/Users/justin/dev/aoforge-claude`** (the main checkout) or `~/.claude`.

Objective 77 moved the Flutter, Dart and Playwright procedure out of the core agents, but the guard only scanned
`agents`, `skills`, `hooks`, `aoforge/bin` and `aoforge/workflows`, and it did not match `browser_*`. So stack
procedure survived in `templates/`, `references/` and one workflow. verify-work.md still tells the orchestrator to
call `browser_navigate/snapshot/click/take_screenshot`, which 1cce9f50 removed from the skill's tools. Those
instructions cannot run, and they tell a Go or CLI project to drive a browser.

**The user's decision: move and tighten.** Move each piece of procedure into the matching pack, replace it in core
with a neutral, pack-supplied step, and extend the guard so the gap cannot reopen.

Purpose: core stays stack-neutral, and no fact is lost on the way out.
Output: a guard that scans all of core, neutral core text, pack fragments and profile carrying the moved procedure,
and changelog entries.

## Locked decisions

1. **Guard scope is the whole core plugin.** `ROOTS = ['.claude-plugin', 'agents', 'skills', 'hooks', 'aoforge']`.
   This is a superset of "templates/ and references/". It also picks up `schemas/` and `stack-profiles/`, so the next
   new directory cannot slip past either. Tests, `__fixtures__` and `node_modules` stay skipped.
2. **PATTERN** is `/flutter|\bdart\b|maestro|playwright|pubspec|browser_[a-z]/i`. `browser_` has no leading `\b`, so
   a browser tool from any MCP server matches (`mcp__chrome__browser_click`), not only Playwright's.
3. **GRANT_ALLOW does not change.** It keeps the same five tokens, the same line, the same reason and the same
   sorted order. The GRANT_ALLOW exactness test must still pass under the new PATTERN, because all five tokens match `browser_` as well as
   `playwright`.
4. **ALLOW grows by data and cross-plugin entries only.** These are the seven files in the Disposition table marked
   ALLOW, added in Task 1, so the RED offender list holds exactly the procedure to move. The header comment gains a
   second class: "design-set references other plugins read from the core mirror". `design-stack-flutter.md` is
   **known debt**: eden-ui-flutter's frontend-design skill reads it via `@~/.claude/aoforge/references/`, and
   ui-spec-skill-contract.test.cjs pins it, so it moves with the design set (a cross-plugin change), not into a stack
   pack. Say so in its reason.
5. **TRD-template Flutter fields use the existing contract.** The pack contract already lets a pack define its TRD
   fields: `fragments.planner`, read through `stack context planner`, which already makes these fields semantically
   required. The fields therefore move into `plugins/aoforge-stack-flutter/fragments/planner.md`, and core keeps a
   neutral "stack fields are pack-defined" note. **Add no manifest key, no schema property and no new agentKey. No
   allowlisted debt for trd-prompt.md.** `platform` stays documented in core because core reads it (quick 38
   soft-dependency selection). `api_contract` stays because `bin/lib/api-contract.cjs` is core.
6. **verify-work uses only what it already has.** It has the `Task` tool, and `stack context verifier --raw` already
   returns `packs.subagents: [{ pack, agent, when }]`. The neutral step reuses that. Do not add an agentKey such as
   `uat`.
7. **The executor gets no new grants.** The web pack's checkpoint pre-check uses the five read-only tools the
   executor holds. The old checkpoint text's `browser_click` and `browser_take_screenshot` steps are dropped from
   the executor path on purpose, because the executor holds no click or screenshot tool. web-ui-verifier keeps both.
   Record this in the moved-text map as "deliberately dropped: no grant; web-ui-verifier covers it".
8. **Diff before delete.** Before removing a core block, save it with
   `git show HEAD:<path> | sed -n '<a>,<b>p' > <scratch>/<name>.orig`, and map each fact to pack text (already
   present, or added by this task). The token check in Task 3 makes the result mechanical.

## Disposition (every hit of the new scan at 764626d8)

Simulated scan: 447 files, 19 offending files outside the current ALLOW (12 MOVE/NEUTRAL + 7 new ALLOW).

| Core file | Lines | Disposition | Target / reason |
|---|---|---|---|
| aoforge/workflows/verify-work.md | 243-259 | MOVE, Task 2 | The drive (navigate, wait, snapshot, click + re-snapshot, screenshot) is already in web-ui-verifier.md `**Drive:**`. Core gets the neutral pack-evidence step |
| aoforge/references/checkpoints.md | 626-640, 696-697 | MOVE, Task 2 | web `fragments/executor.md` gets a new checkpoint section. Click and screenshot are deliberately dropped (decision 7) |
| aoforge/references/verification-patterns.md | 18, 126-131, 597 | MOVE, Task 2 | The calls are already in web-ui-verifier `**Drive:**`. Core becomes neutral |
| aoforge/templates/codebase/stack.md, codebase/testing.md | 41, 170 | NEUTRAL rewrite, Task 2 | A placeholder example (`"Playwright for E2E"`) |
| aoforge/references/defaults-table.md | 133, 136, 144 | NEUTRAL rewrite, Task 2 | The concrete tools come from the profile's Testing section (Maestro and integration_test are in the Flutter profile; Playwright is in the web pack) |
| aoforge/references/model-profiles.json, model-profiles.md | 4; 50, 77 | NEUTRAL rewrite, Task 2 | It names `flutter-ui-eval.cjs`, which now lives in the Flutter pack, and it still reads core `models{}` |
| aoforge/templates/stack.md | 26, 131, 139-140, 157 | NEUTRAL rewrite, Task 2 | Line 26 wrongly says dart and flutter are bundled. The lookup is user, then pack, then bundled (`profileLookup`, stack-profile.cjs:176) |
| aoforge/templates/trd-prompt.md | 33-53, 198, 224-239 | MOVE, Task 3 | flutter `fragments/planner.md` gets the YAML example and field table (decision 5) |
| aoforge/templates/UAT.md | 74-101 | MOVE, Task 3 | Into flutter `fragments/verifier.md` Step 9 |
| aoforge/references/testing-strategy.md | 15, 27-35, 39-46, 53, 70-71, 89 | MOVE, Task 3 | Into flutter `profiles/flutter.md` `## Testing` |
| aoforge/references/design-craft.md | 4 hits | ALLOW, Task 1 | The design set the eden-ui-web and eden-ui-flutter skills read from the core mirror. It names each surface |
| aoforge/references/design-preflight.md | 5 hits | ALLOW, Task 1 | A shared design checklist with per-surface sections side by side (Hugo + Tailwind beside Flutter + eden-ui) |
| aoforge/references/design-stack-flutter.md | 27 hits | ALLOW, Task 1, known debt | Decision 4 |
| aoforge/references/deployment-verification.md | 82 | ALLOW, Task 1 | A worked `impact` example. `eden-ui-flutter` is a library name beside `eden-platform-go` |
| aoforge/schemas/must_not_vocabulary.json | 3 | ALLOW, Task 1 | Source attribution (copied from eden-ui-flutter design data) |
| aoforge/schemas/stack-profile.schema.json | 35, 48 | ALLOW, Task 1 | Field descriptions that list manifests across languages (go.mod, pubspec.yaml, package.json) |
| aoforge/schemas/surface-spec.schema.json | 319 | ALLOW, Task 1 | Pattern-library ids are pinned to the eden-ui-flutter release: a package name in a description |
| agents/executor.md | 5 | GRANT_ALLOW, unchanged | The five quick-38 tokens. `mcp__dart__*` and `mcp__gopls__*` (also on debugger.md, verifier.md, and the adopt and map-codebase skills) are project-MCP grants. `\bdart\b` does not match `__dart__` |
| 13 existing ALLOW entries (bin/lib, adopt.md, map-codebase.md) | | Unchanged | Language-neutral data tables |
| hooks/__fixtures__/*, `*.test.cjs` | | Not scanned | Fixtures and tests |

The executor copies this table into the SUMMARY with the final state of each row.

## Test list

Outermost first. All in `stack-neutrality.repo.test.cjs`.

1. **Real-tree scan** (the existing test 1, now over the whole plugin): there are no offenders outside ALLOW. It is
   RED after Task 1 and lists exactly the twelve MOVE and NEUTRAL files above. It shrinks after Task 2 and is GREEN
   after Task 3.
2. **PATTERN sensitivity** (new): `browser_navigate(url="http://localhost:{port}/")` matches, and
   `tools: Read, mcp__chrome__browser_click` matches. `The browser renders the page` does not, and
   `mcp__dart__*, mcp__gopls__*` does not.
3. **Scrub** (extend the existing test 3): the five tokens scrub clean. A sixth Playwright grant, a
   `mcp__plugin_playwright_playwright__*` wildcard, and `mcp__chrome__browser_click` appended to the line each
   still match.
4. **GRANT_ALLOW exactness** (existing test 2, unchanged code): passes under the new PATTERN.
5. **Coverage** (extend the existing test 5): `files` includes `.claude-plugin/plugin.json`,
   `aoforge/templates/trd-prompt.md`, `aoforge/templates/UAT.md`, `aoforge/references/checkpoints.md`,
   `aoforge/references/testing-strategy.md`, `aoforge/schemas/stack-pack.schema.json`, `aoforge/stack-profiles/go.md`
   and `aoforge/workflows/verify-work.md`. No entry ends in `.test.cjs` or contains `/__fixtures__/`. The three
   pack-owned "gone" paths stay absent.
6. **ALLOW hygiene** (existing test 4): the seven new entries exist, match PATTERN, and have reasons of 20+
   characters.

<embedded_context>
<codebase_examples>
Guard shape today (`plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs`, 136 lines): `PLUGIN` is the
core plugin root. `walk(rel)` recurses, skipping `__fixtures__`, `node_modules` and `*.test.(c?js|mjs)`. `ALLOW` is
alphabetical, `{ rel: reason }`. `GRANT_ALLOW['agents/executor.md'] = { tokens: [5 sorted], reason }`.
`toolsLineIndex(lines)` finds the frontmatter `tools:` line. `scrubGrants(line, tokens)` drops exact tokens only.
Keep every helper. Change only `ROOTS`, `PATTERN`, `ALLOW`, the header comment, and tests 3 and 5, and add test 2.

`stack context <agent> --raw` JSON (stack-profile.cjs:1234 + stack-packs.cjs `agentExtras`):
```json
{ "agent": "verifier", "text": "...", "packs": { "active": ["web"],
  "fragments": [{ "pack": "web", "path": "<stacks>/web/fragments/verifier.md" }],
  "subagents": [{ "pack": "web", "agent": "aoforge-stack-web:web-ui-verifier",
                  "when": "the runtime check is a web UI drive" }] } }
```
The text form prints `- web: Read \`<path>\` and follow it where its gates say it applies.` and `- web: delegate
to the \`aoforge-stack-web:web-ui-verifier\` agent when ...`. A model comes from
`node ~/.claude/aoforge/bin/aof-tools.cjs resolve-model <name after the colon> --raw`, the same way the web
verifier fragment does it.

The web-ui-verifier `**Drive:**` block (already in the pack) covers the old verify-work and verification-patterns
calls: `browser_navigate` → `browser_wait_for(text=landmark)` → `browser_snapshot` → click key interactive
elements, re-snapshot → `browser_take_screenshot` to `evidence/` → `browser_close`. Its return is a
`## WEB UI VERIFICATION` table (`✓ FUNCTIONAL / ⚠ PARTIAL / ✗ BROKEN / ? SKIPPED / ? UNCERTAIN`).

The web executor fragment's `## The check (per route)` is navigate → wait_for landmark → console_messages (count
errors) → one snapshot. Its rows are `PASS`, `FAIL (<n> console errors: ...)` and `FAIL (landmark "<x>" missing)`.
The new checkpoint section reuses exactly this check. Do not restate the tool list.

Profile id lookup (`stack-profile.cjs` `profileLookup`): `~/.claude/aoforge/stacks/<id>.md` (user/org) first, then
an enabled pack's profile of that id, then bundled `aoforge/stack-profiles/<id>.md` (only `go.md` ships in core).

Moved facts already present in the Flutter pack at 764626d8 (planning-time probe): planner.md has
`tests.widget|integration|maestro`, `mobile-dev-inc/maestro#2591`, `FRONTMATTER_SCHEMAS.trd`,
`test_driver/integration_test.dart` and `platform: [mobile, web]`. verifier.md has `generate uat`,
`refusing to overwrite`, `(state, platform)` and `flutter drive`. profiles/flutter.md has `Patrol`,
`integration_test` and `flutter test`.
**Missing, to be added:** planner.md lacks the YAML example, `provider`, and "single platform". verifier.md lacks
state descriptions (`initial`, custom states), the `result: [pending]` format, and the "REQUIRED by default"
per-platform rule. flutter.md lacks `pumpAndSettle`, `requestAnimationFrame`, `Future.delayed`,
`matchesGoldenFile`, `flutter-ui-eval`, `behavioral parity` and `Drift`. The web executor fragment lacks any
checkpoint text.

`state_management: provider`: `flutter-ui-scope.cjs` returns only `riverpod|bloc|setState|other`, and
`flutter-state-coverage.cjs` treats any value outside the catalogue like `other`. Carry `provider` across with that
caveat. Do not silently drop it.
</codebase_examples>

<anti_patterns>
- Do not swap one stack for another in neutral text ("Cypress for E2E", `cargo fix` instead of `dart fix`). Neutral
  means a role (`<browser E2E runner>`, "a lint ID"), not a different tool.
- Do not name the web or Flutter pack in a core *instruction* ("spawn web-ui-verifier"). Core points at
  `stack context <agent>` output. A pack name in an example JSON comment is fine only if it does not match PATTERN.
- Do not widen GRANT_ALLOW, scan pack files, or add an ALLOW entry for a file that carries procedure (trd-prompt,
  UAT, testing-strategy, checkpoints, verification-patterns, verify-work, defaults-table).
- Do not touch the `look-lock` section of checkpoints.md. ui-spec-lock.test.cjs (Case P1) pins it.
- Do not remove or reword the two `<!-- builtin-audit: allow free-text ... -->` markers in verify-work.md, and do
  not add a prose choice prompt (builtin-sweep.repo.test.cjs).
- Do not paste whole moved blocks twice. If the pack already says it, cite where in the moved-text map and add
  nothing.
- No property-based libraries, no `.feature` files, no LLM-generated fixtures. The new guard tests use literal
  strings.
</anti_patterns>

<error_recovery>
- **planning-writes.repo.test.cjs fails on a moved line** (the UAT text in the Flutter verifier fragment, or the
  neutral UAT.md paragraph): put the `doc put` verb within 3 lines of the write sentence, or add an inline
  `<!-- planning-audit: allow <20+ char reason> -->` only for a read-only or forbidding line. Its EXEMPT entry for
  `templates/UAT.md` needs the substring `the generator REFUSES to overwrite`. Keep that substring rather than
  editing the test. If you must edit EXEMPT, add the test file to the commit and say so in the SUMMARY.
- **defaults-loader or intent tests fail after the defaults-table rewrite:** a test pins the old string. Read the
  assertion. If it pins the value for the (app, feature) cell, update the expected string in that test (add the file
  to the commit and list it). Never restore the tool names.
- **model-profiles.test.cjs fails:** the `_comment` array must stay valid JSON with the same number of lines.
  Rewrite line 4 in place.
- **`stack validate --profile plugins/aoforge-stack-flutter/profiles/flutter.md` gains a new error or STK007:**
  shorten the Testing additions to bullets. Keep the body under 150 lines.
- **A Task 2 or Task 3 commit leaves an unrelated suite red:** revert only your file with
  `git show HEAD~1:<path> > <path>` (never `git checkout -- <path>` or `git restore`), re-read, and redo the edit.
</error_recovery>
</embedded_context>

<gotchas>
- **Safe git only.** Never run `git add -A`, `git add .`, `git commit -a`, `git stash`, `git reset`, `git restore`
  or `git checkout -- <path>`. Commit only with
  `node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <repo> commit "<msg>" --files <only this task's files>`.
  If another executor's commits appear on the branch, leave its files alone.
- **The guard stays RED across Task 2.** Task 1 commits RED, Task 2 shrinks the offender list, and Task 3 turns it
  GREEN. Every other suite must stay green after every commit.
- **Baseline at 764626d8** (tests/pass, all 0 fail and 0 skipped): stack-neutrality 5/5, planning-writes 11/11,
  builtin-sweep 17/17, ui-spec-lock 18/18, ui-spec-skill-contract 15/15, context-budget 6/6, model-profiles 32/32,
  intent 57/57, defaults-loader 22/22, stack-packs 46/46, rename-guard 20/20, doc-refs 18/18, planning-audit 17/17,
  Flutter pack `lib/*.test.cjs` 268/268. Re-measure at BASE in Task 1, because HEAD may have moved.
- **Rename guard.** Do not type the legacy planning directory's literal name or any pre-rename product name in a
  file you edit.
- **Skill footprint.** verify-work's skill footprint (SKILL.md + workflow + UAT.md) is capped at 90,000 chars by
  context-budget.repo.test.cjs. This task shrinks it, so do not grow it back.
- **References are read lazily.** The executor reads checkpoints.md only for checkpoint TRDs, and verification-
  patterns.md only when a verify command is unclear. Keep neutral replacements short. Point at
  `stack context <agent>`, not at a pack file path.
- **Port rule.** No 8080 anywhere. The existing `localhost:3000` examples in checkpoints.md may stay.
- **`\bdart\b` with the `i` flag matches "Dart" in prose.** Neutral rewrites must avoid the word, not just the
  lowercase form.
</gotchas>

<validation_gates>
- task: `npm test` (`aof-tools stack command test` → `npm test`; `gates.task: [test]`). Scoped form:
  `node --test <files>`. There is no lint, format or build gate (`status: none`).
- Scoped set after each commit (run from `<repo>`):
  `node --test plugins/aoforge/aoforge/bin/lib/{stack-neutrality.repo,planning-writes.repo,builtin-sweep.repo,ui-spec-lock,ui-spec-skill-contract,context-budget.repo,model-profiles,intent,defaults-loader,stack-packs,rename-guard.repo,doc-refs.repo,planning-audit}.test.cjs`
  plus `node --test plugins/aoforge-stack-flutter/lib/*.test.cjs` after Task 3.
</validation_gates>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Guard scans all of core and matches browser_ tools (RED)</name>
  <files>plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs</files>
  <action>
Step 0. Record `BASE=$(git -C <repo> rev-parse HEAD)`, run full `npm test` once from `<repo>`, and save the totals
and any failing test names to the scratchpad. These are the baseline. Re-run the scoped set and compare with the
gotchas numbers.

Step 1. Edit the guard (decisions 1-4):
- `const ROOTS = ['.claude-plugin', 'agents', 'skills', 'hooks', 'aoforge'];`
- `const PATTERN = /flutter|\bdart\b|maestro|playwright|pubspec|browser_[a-z]/i;`
- Add seven ALLOW entries, keeping the object alphabetical. Each reason is one line of 20+ characters that says
  why the entry is data or a cross-plugin reference:
  - `aoforge/references/deployment-verification.md`
  - `aoforge/references/design-craft.md`
  - `aoforge/references/design-preflight.md`
  - `aoforge/references/design-stack-flutter.md` (its reason begins "known debt:")
  - `aoforge/schemas/must_not_vocabulary.json`
  - `aoforge/schemas/stack-profile.schema.json`
  - `aoforge/schemas/surface-spec.schema.json`
- Update the header comment. It scans the whole core plugin; ALLOW now covers language-neutral data *and*
  design-set references that other plugins read from the core mirror (known debt is marked in the reason); and
  `browser_` is matched because a browser tool call is web procedure whichever MCP server serves it.
- Add the PATTERN-sensitivity test (Test list 2) and extend the scrub and coverage tests (Test list 3 and 5).
  Leave GRANT_ALLOW and the existing "every GRANT_ALLOW entry is exactly ..." test as they are.

Step 2. Run the guard. Test 1 must fail, listing exactly the twelve MOVE/NEUTRAL files from the Disposition table.
All the other guard tests pass. If a file outside the table appears, stop and add it to the table in the SUMMARY
with a disposition before going on.

Step 3. Commit RED:
`test(stack-neutrality): scan all of core and match browser_ tool calls (RED)`.

# PATTERN: keep `scrubGrants` and `toolsLineIndex` byte for byte. The executor exemption must stay exact.
# GOTCHA: `files` is computed at module load. Coverage asserts use `files.includes('<rel>')` with the `aoforge/...`
#   relative form, the same as ALLOW keys.
  </action>
  <verify>
`node --test <repo>/plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs`: 7+ tests. Only the real-tree
scan fails, and its message lists checkpoints.md, verification-patterns.md, defaults-table.md, model-profiles.json,
model-profiles.md, testing-strategy.md, trd-prompt.md, UAT.md, stack.md, codebase/stack.md, codebase/testing.md
and verify-work.md lines, and nothing else. The other suites in the scoped set are unchanged from BASE.
  </verify>
  <done>The RED commit exists. GRANT_ALLOW is unchanged (`git diff BASE -- <guard> | rg -n 'GRANT_ALLOW|tokens'`
shows no change to the token list). The baseline numbers are saved.</done>
  <recovery>If the GRANT_ALLOW exactness test fails under the new PATTERN, a grant other than the five matches
`browser_`. Report it as a finding. Do not add it to GRANT_ALLOW.</recovery>
</task>

<task type="auto">
  <name>Task 2: Browser pre-verification leaves core; neutral rewrites with no pack target</name>
  <files>plugins/aoforge/aoforge/workflows/verify-work.md, plugins/aoforge/aoforge/references/checkpoints.md, plugins/aoforge/aoforge/references/verification-patterns.md, plugins/aoforge-stack-web/fragments/executor.md, plugins/aoforge/aoforge/references/defaults-table.md, plugins/aoforge/aoforge/references/model-profiles.json, plugins/aoforge/aoforge/references/model-profiles.md, plugins/aoforge/aoforge/templates/stack.md, plugins/aoforge/aoforge/templates/codebase/stack.md, plugins/aoforge/aoforge/templates/codebase/testing.md</files>
  <action>
Save each block you remove first (decision 8).

**A. verify-work.md `present_test` (lines 237-262).** Replace "Browser pre-verification (for UI tests)" and its
five numbered `browser_*` steps with this neutral step. Keep the CHECKPOINT box that follows, because its
`Page renders at {url}`, `Key elements found` and `{interaction tested}` lines are neutral:

```
**Stack pre-verification (UI tests):** core drives no UI. Once per session, before the first UI test:
1. Reuse what the active stack packs already recorded for these surfaces: runtime-check rows in the
   objective's VERIFICATION.md and any pack self-check section in the TRD SUMMARYs.
2. If none covers a UI test, run `node ~/.claude/aoforge/bin/aof-tools.cjs stack context verifier --raw`.
   When `packs.subagents` lists an agent whose `when` fits, spawn it once with the Task tool for every
   uncovered UI test (objective dir; each test's route and landmark; start command and URL if known;
   model from `aof-tools resolve-model <name after the colon> --raw`) and keep its rows.
3. With no pack evidence and no listed agent, present the test without a **Pre-verified** block.
```
Then: "Fill the box's Pre-verified lines from the pack's row for this test." Rewrite line 284 to "skip stack
pre-verification". Do not touch the builtin-audit markers.

**B. checkpoints.md `## Browser Pre-Verification Before Checkpoints` (lines 624-642).** Retitle it
`## Stack Pre-Verification Before Checkpoints`. Its body says: before presenting a `checkpoint:human-verify` for a
UI feature, run the pre-check an active stack pack's executor fragment contributes
(`node ~/.claude/aoforge/bin/aof-tools.cjs stack context executor` lists them; each fragment says when it
applies); with no such fragment, present the checkpoint as usual. Keep the "If pre-verification fails / passes"
paragraphs, the evidence template, and the "Never present a checkpoint with broken verification environment"
paragraph as they are (they are neutral). Remove only the fenced `browser_*` block. Table rows 696-697 become
`| Pre-verify UI renders correctly | Yes (stack pack pre-check) | YES |` and
`| Pre-verify interactive flows work | Yes (stack pack UI drive) | YES |`.

**C. Web pack `fragments/executor.md`: add `## Before a UI checkpoint:human-verify`** after "The check (per
route)". When a TRD has a `checkpoint:human-verify` for something a browser renders (same runtime/platform
condition as "When it runs"), run The check on that checkpoint's routes (at most three) before presenting it,
with the same preconditions and skips. If a row FAILs, fix it first: the user should only see working features.
Present the rows as the checkpoint's pre-verified evidence: page loads at {url}, landmark present, {n} console
errors. In autonomous mode the checkpoint auto-approves; still add the rows to `## Browser self-check`. You hold no
click, fill or screenshot tool, so leave interaction steps in the checkpoint's how-to-verify for the user; the
verifier's web-ui-verifier drive covers interactions and screenshots. Keep it to about 12 lines and keep the port
rule wording.

**D. verification-patterns.md.** Line 18: "Level 4 can be partially automated by the UI drive an active stack pack
contributes (`stack context verifier` lists it) ...". Lines 126-131: replace `*Automated via Playwright MCP:*` and
its fenced calls with `*Automated by the active stack pack's UI drive* (the verifier delegates to the agent
\`stack context verifier\` lists):` and keep the three question bullets. Line 597: "Use the active stack pack's UI
drive first ...". Rewrite "**Automate with browser tools first:**" to "**Automate with the pack's UI drive
first:**", and keep its bullets.

**E. Neutral rewrites (no pack target).**
- defaults-table.md (app, feature): `tdd: "strict; outside-in (UI flow driver→integration→widget/component→unit)"`
  and `verification: "UI flow + integration + component render"`. (app, port): `tdd: "build first, test after;
  verify UI parity via UI flow drivers"`. Keep the YAML quoting and alignment.
- model-profiles.json line 4: `"models{}: tier -> concrete API model id. Live: a stack pack's vision judge sends it to the",`
  (the same line count). model-profiles.md line 50: "`models{}` is live, not documentation: a stack pack's vision
  judge reads it and sends the id to the Messages API." Line 77: "Stack pack agents (a pack's visual judge, for
  example) take their tiers from the pack manifest's `models`, not this table."
- templates/stack.md. Line 25-27 comment: `extends: general (implicit), or a profile id such as go`, looked up as
  `~/.claude/aoforge/stacks/<id>.md`, then an enabled stack pack's profile of that id, then the bundled
  `aoforge/stack-profiles/<id>.md`. Line 131: "(`go fix`, a lint ID)". Lines 139-140: "a tier id (`go`, or one a
  stack pack ships: user/org profile first, then the pack's, then the bundled one)". Line 157: "... and do not halt
  the root for later guarded gates (the tools a pack's gate policy guards), while any other change is put back and
  does." Confirm the wording against stack-verify.cjs:1383-1387 before writing it.
- templates/codebase/stack.md:41 and codebase/testing.md:170: `[e.g., "<browser E2E runner> for E2E"]`.

Commit in two commits:
- `refactor(stack-web): UI pre-verification leaves core checkpoints, verification patterns and verify-work` with
  A-D's four files.
- `refactor(core): stack-neutral defaults, model-profile and STACK.md template wording` with E's six files.
  </action>
  <verify>
The guard's real-tree scan lists only trd-prompt.md, UAT.md and testing-strategy.md. Run
`rg -n -i 'browser_[a-z]|playwright' <repo>/plugins/aoforge --glob '!**/*.test.*' --glob '!**/__fixtures__/**'`.
It should list only agents/executor.md (the `tools:` line), testing-strategy.md (Task 3), and the ALLOW-listed
stack-classify.cjs and stack-report.cjs. In the scoped set, builtin-sweep, ui-spec-lock, context-budget,
planning-writes, model-profiles, intent and defaults-loader are at their BASE counts.
`node -e "JSON.parse(require('fs').readFileSync('<repo>/plugins/aoforge/aoforge/references/model-profiles.json','utf8'))"`
exits 0.
  </verify>
  <done>verify-work, checkpoints and verification-patterns carry no browser procedure. The web executor fragment has
the checkpoint section. The six neutral files no longer match PATTERN. Two commits exist.</done>
  <recovery>If builtin-sweep flags the new verify-work text, it reads as a choice prompt. Rephrase it as an
instruction and keep the existing box as the only user-facing prompt.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Flutter TRD fields, UAT generation and testing cells leave core (GREEN); changelogs</name>
  <files>plugins/aoforge/aoforge/templates/trd-prompt.md, plugins/aoforge/aoforge/templates/UAT.md, plugins/aoforge/aoforge/references/testing-strategy.md, plugins/aoforge-stack-flutter/fragments/planner.md, plugins/aoforge-stack-flutter/fragments/verifier.md, plugins/aoforge-stack-flutter/profiles/flutter.md, CHANGELOG.md, plugins/aoforge-stack-flutter/CHANGELOG.md, plugins/aoforge-stack-web/CHANGELOG.md</files>
  <action>
Save each removed block first (decision 8).

**A. trd-prompt.md → Flutter planner fragment.**
- In the pack's `fragments/planner.md`, append `## TRD frontmatter for type: ui`. Carry over the old YAML example
  verbatim (stack, platform, state_management and the commented `must_haves.artifacts` example with
  `states`/`tests.widget|integration|maestro`; leave out `api_contract`, which stays in core) and the field table
  from trd-prompt.md:224-235 for `stack`, `platform`, `state_management` and the `states`/`tests.*` rows. Add
  "Narrow only if a TRD genuinely targets a single platform". For `state_management`, list
  `riverpod|bloc|setState|other` (the detector's output) and note that `provider` is accepted, has no catalogue,
  and is scored like `other`. Fold in the "Enforcement model" and "Web verification mechanism" paragraphs where
  they add facts that are not already in steps 2 and 4. Do not repeat what the fragment already says.
- In core trd-prompt.md, replace lines 33-53 with a neutral block:
  ```yaml
  # ── Stack fields (OPTIONAL — defined by an active stack pack) ──
  # Core reads `platform`: a pack's soft dependency selects another pack for these platforms.
  # `type: ui`, `stack` and any further fields, and which are required, come from the active pack's planner
  # fragment: node ~/.claude/aoforge/bin/aof-tools.cjs stack context planner
  stack: <pack id>
  platform: [<platform>, ...]
  api_contract:                  # SHA pinning for referenced API contract files (api-contract.cjs)
    - path: "<contract file>"
      sha: "ab12cd34ef..."
  ```
  Line 198 becomes `| Stack fields | None | Optional; defined by the active stack pack's planner fragment |`. Lines
  224-239 become `### Stack fields (optional; defined by a stack pack)`, with rows for `stack`, `platform` (core
  reads it for pack selection) and `api_contract` (core helper, advisory drift), plus one sentence: the fields are
  not in `FRONTMATTER_SCHEMAS.trd.required`, and a pack's planner fragment, read in
  `<step name="break_into_tasks">`, adds its own fields and halts with `## PLANNING INCONCLUSIVE` when a required
  one is missing. Keep `type: standard  # standard | tdd | ui` and `| \`type\` | Yes | \`standard\`, \`tdd\`, or \`ui\` |`.
  `ui` is neutral.

**B. UAT.md → Flutter verifier fragment Step 9.**
- In the pack's verifier.md Step 9, add the facts it lacks: rows per `(state, platform)` across `type: ui` TRDs
  ("3 states × [mobile, web] = 6 rows per artifact"), REQUIRED by default and never opt-in; one mobile-only row per
  `.maestro/` YAML file; the full web row command `flutter drive --driver=test_driver/integration_test.dart
  --target=<tests.integration> -d chrome`; human-readable text for `loading`, `data`, `error`, `empty` and
  `initial`, and a generic "the `<state>` state UI is rendered correctly" for custom states; the generated body
  uses the standard `### N. {test name}` / `expected:` / `result: [pending]` format, a walkthrough of about 5
  minutes; every later edit goes through a `planning draft` of that path and `doc put`; and the pointer to
  `flutter-state-patterns.md` "Web verification mechanism".
- In core UAT.md, replace lines 74-101 with `## Pack-generated UAT`, 6-8 lines that name no stack. An active stack
  pack's verifier fragment can generate this file from the objective's TRDs (`stack context verifier` lists it).
  The body uses the format above. Publish the generated bytes with
  `node ~/.claude/aoforge/bin/aof-tools.cjs doc put objectives/<obj-dir>/<obj>-UAT.md --from <generated path>`.
  Every later edit goes through a `planning draft` of that path and `doc put`. Then the line
  `**Safety:** the generator REFUSES to overwrite an existing UAT.md with non-pending results.` (keep that exact
  substring).

**C. testing-strategy.md → Flutter profile `## Testing`.**
- In `profiles/flutter.md` `## Testing`, add compact bullets:
  - the layer cells: unit `flutter test` (widget + unit); integration `integration_test/` driver harness;
    system `integration_test/` + Patrol (or Maestro for native flows); visual `aof-flutter verify
    flutter-ui-eval` (golden net + VLM judge; `matchesGoldenFile` where goldens run pinned); parity is widget-tree
    behavioral parity;
  - the outside-in route: `integration_test` driver, then widget tests, then service, then repository;
  - codegen: Drift / Floor schemas generate DAO classes, and the generated code is committed;
  - the web gotcha: on web, `pumpAndSettle` can return before `requestAnimationFrame` completions. Prefer Patrol,
    or add `await Future.delayed(Duration(milliseconds: 100))` after navigation, and note it in the TRD's
    `<gotchas>`.
  Keep the body under 150 lines.
- In core testing-strategy.md:
  - Line 15's visual row: "the active stack pack's visual gate, where one applies (`stack context verifier`)".
  - Line 27: Go ships bundled as `aoforge/stack-profiles/go.md`; other stacks' profiles ship in their stack pack
    (`stack discover` lists packs); the user/org override path stays.
  - Drop the Flutter column from the table, and keep Go and Node.
  - Delete the `## Flutter-web semantics gotcha` section.
  - Line 53: "Drift / Floor (SQLite ORMs)".
  - Lines 70-71: "**Web app:** browser driver (from the stack profile or an active pack) then ..." and
    "**Mobile:** the platform's integration driver (from the stack profile) then widget/component tests then
    service then repository".
  - Line 89: "Extending a stack pack's visual gate with a probe/conform layer (cross-stack) — see ...".

**D. Moved-text token check** (scratch script, not committed). Assert that each token is in its pack file with
`grep -qF`, and print `MISS <file> :: <token>` otherwise:
- web-ui-verifier.md: `browser_navigate`, `browser_snapshot`, `browser_take_screenshot`,
  `Click key interactive elements, re-snapshot`, `readiness probe`
- web fragments/executor.md: `checkpoint:human-verify`, `click`
- flutter planner.md: `provider`, `single platform`, `state_management: riverpod`, `tests.maestro`,
  `mobile-dev-inc/maestro#2591`, `test_driver/integration_test.dart`, `FRONTMATTER_SCHEMAS.trd`
- flutter verifier.md: `initial`, `result: [pending]`, `REQUIRED`, `.maestro/`, `-d chrome`, `planning draft`,
  `refusing to overwrite`
- flutter profiles/flutter.md: `pumpAndSettle`, `requestAnimationFrame`, `Future.delayed`, `matchesGoldenFile`,
  `flutter-ui-eval`, `behavioral parity`, `Drift`, `Patrol`, `Maestro`

Then walk each saved `.orig` block once by eye. Write the moved-text map (core block → pack location →
present/added/deliberately dropped + reason) into the SUMMARY. Deliberately dropped items include: the executor
click/screenshot steps (decision 7), the empty "AI exploratory" and "Wrong-tenant (rarely applicable)" Flutter
cells, and the `REQ-10-01`/`TRD 10-0x` provenance tags if you do not carry them.

**E. GREEN + changelogs.**
- Root CHANGELOG.md: under `## [3.1.0] - 2026-10-16`, directly after the quick 38 subsection, add
  `### Stack packs: the rest of the web and Flutter procedure leaves core (quick 39)` with 3-4 bullets:
  - verify-work, checkpoints.md and verification-patterns.md no longer instruct browser tool calls; UI
    pre-verification comes from the active packs' evidence or their verifier agent;
  - the TRD template's Flutter UI fields, the UAT template's auto-generated section and testing-strategy's Flutter
    cells moved to the Flutter pack (planner fragment, verifier fragment, profile);
  - neutral wording in defaults-table, model-profiles and the STACK.md template;
  - `stack-neutrality.repo.test.cjs` now scans all of core (templates, references, schemas, stack-profiles), and
    matches `browser_*` tool names; the executor's five-token exemption is unchanged; ALLOW gains seven
    data/design-set entries, with `design-stack-flutter.md` marked as known debt.
- Each pack CHANGELOG: add bullets under its existing `## [1.0.0] - 2026-10-16` (not released yet).
  - web: the executor fragment's checkpoint pre-check.
  - Flutter: the planner fragment's TRD field reference, Step 9's complete UAT rules, and the profile's testing
    cells and web gotcha.

Commits:
- `refactor(stack-flutter): TRD fields, UAT generation and testing cells leave core` with the six A-C files (guard
  GREEN).
- `docs(quick-39): changelogs for the core neutrality sweep` with the three CHANGELOGs.
  </action>
  <verify>
- `node --test <repo>/plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs`: all tests pass, 7 or more.
- `rg -n -i 'flutter|\bdart\b|maestro|playwright|pubspec|browser_[a-z]' <repo>/plugins/aoforge --glob '!**/*.test.*' --glob '!**/__fixtures__/**' -l`
  shows only ALLOW files and agents/executor.md.
- The token check prints no MISS.
- `node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <repo> stack validate --profile plugins/aoforge-stack-flutter/profiles/flutter.md --raw`
  shows no new error and no STK007.
- The Flutter pack suite stays at 268/268, and every file in the scoped set is at its BASE count except
  stack-neutrality, which is higher.
- Full `npm test` has no new failures against BASE.
  </verify>
  <done>The guard is GREEN. Core names no pack-owned stack outside ALLOW. Every moved fact is located in pack text or
listed as deliberately dropped. The changelogs are updated. There are four or five commits after BASE in total.</done>
  <recovery>If the planner fragment grows past about 11 KB, move the field table into a new pack reference
`plugins/aoforge-stack-flutter/references/trd-ui-fields.md` and link it from the fragment. Add the file to the
commit and to the SUMMARY. Still add no manifest key.</recovery>
</task>

</tasks>

<verification>
- `npm test`: no new failures against BASE. The total grows only by the new guard tests, and `skipped` is
  unchanged.
- `git log --oneline BASE..HEAD` shows the RED commit, the two Task 2 commits, the GREEN commit and the docs
  commit, all made through `aof-tools commit`.
- `git diff BASE --stat` lists only files in `files_modified`, plus any recovery-path file named in the SUMMARY.
- `git diff BASE -- plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs` leaves the GRANT_ALLOW block
  untouched.
- `git diff BASE | rg -n '8080'` prints nothing. There is no push, tag or release, and nothing is written under
  `~/.claude` or `/Users/justin/dev/aoforge-claude`.
</verification>

<success_criteria>
- Core gives no stack procedure to a project whose stack does not use it: no browser calls in verify-work,
  checkpoints or verification patterns, and no Flutter fields, UAT rows or testing cells in templates or references.
- Every moved fact is in the Flutter or web pack, or is a recorded, reasoned drop.
- The neutrality guard covers all of core, catches browser tool calls from any MCP server, and keeps the quick 38
  executor exemption exact.
</success_criteria>

<output>
Write the SUMMARY into the draft
`/var/folders/j2/r369kq256wd5qg5yn51x376m0000gn/T/aoforge-drafts/aoforge-claude-df646fc2/quick/39-move-remaining-web-and-flutter-procedure/39-SUMMARY.md`.
Publish it with
`node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <repo> quick summary 39 --from <that draft> --raw`.
Its JSON `path` must be under `<repo>`. If it is not, stop and report. Do not commit the SUMMARY: the orchestrator
does that. Include:
- BASE, the npm test totals at BASE and at the end, and the scoped per-file counts before and after;
- the RED failure message (the offender list);
- every commit hash;
- the Disposition table with each row's final state;
- the moved-text map and the token-check output;
- any test file edited on a recovery path, and why.
</output>
