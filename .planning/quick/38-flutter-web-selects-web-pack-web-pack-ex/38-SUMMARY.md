---
objective: quick-38
trd: 01
subsystem: stack-packs
tags: [stack-packs, soft-dependency, flutter, web, executor, neutrality]
requires: [objective-77 stack pack contract]
provides: [soft_depends manifest key, projectPlatforms, softDependencyWarnings, web executor self-check fragment]
affects: [stack context, stack discover, stack doctor, agents/executor.md tools]
tech-stack:
  added: []
  patterns: [two-pass pack selection, manifest-data soft dependency, token-scoped neutrality exemption]
key-files:
  created:
    - plugins/aoforge-stack-web/fragments/executor.md
  modified:
    - plugins/aoforge/aoforge/schemas/stack-pack.schema.json
    - plugins/aoforge/aoforge/bin/lib/stack-packs.cjs
    - plugins/aoforge/aoforge/bin/lib/stack-packs-cli.cjs
    - plugins/aoforge/aoforge/bin/lib/stack-packs.test.cjs
    - plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs
    - plugins/aoforge/agents/executor.md
    - plugins/aoforge-stack-flutter/aoforge-stack.json
    - plugins/aoforge-stack-flutter/fragments/verifier.md
    - plugins/aoforge-stack-web/aoforge-stack.json
    - plugins/aoforge-stack-web/fragments/verifier.md
    - CHANGELOG.md
    - CLAUDE.md
    - docs/USER-GUIDE.md
    - docs/PROPOSAL-stack-packs.md
    - plugins/aoforge-stack-flutter/CHANGELOG.md
    - plugins/aoforge-stack-web/CHANGELOG.md
decisions:
  - "A pack manifest may declare soft_depends [{ pack, platforms }]; core reads it as data and names no pack"
  - "Pass-2 (soft-dependency) packs carry soft_dependency_of and are never hosts, so selection and warnings are one level only"
  - "An absent soft dependency is a stack doctor warning; ok and the exit code ignore warnings"
  - "The executor holds five read-only browser grants (navigate, wait_for, console_messages, snapshot, close), in their own revertible commit 60a1552c"
duration: 14min
completed: 2026-10-16
---

# Quick 38: Flutter web selects the web pack; web pack executor self-check Summary

A Flutter project whose runtime or TRD `platform` includes `web` now selects aoforge-stack-web through a new
manifest key, `soft_depends` (the Flutter pack declares `[{ pack: web, platforms: [web] }]`), so `stack context
verifier` hands Flutter web to web-ui-verifier. `stack doctor` warns, never fails, when that pack is absent. The web
pack gains an executor fragment: a read-only browser self-check before handoff. The executor holds the five read-only
browser tools it needs again.

## Progress
- [x] Task 1: soft_depends — Flutter web selects the web pack; doctor warns when absent — 67b94f54 (RED), 4ac998de (GREEN)
- [x] Task 2: web pack executor self-check, five read-only browser grants, CHANGELOG and docs — 2e19707f (RED), 7f29296c (fragment), 60a1552c (grants), 6e29a60a (docs)

## Commits

| Hash | Message |
|---|---|
| 67b94f54 | test(stack-packs): Flutter web platform selects the web pack; soft-dependency doctor warning (RED) |
| 4ac998de | feat(stack-packs): soft_depends, so a Flutter project with a web platform selects the web pack |
| 2e19707f | test(stack-web): executor self-check fragment and read-only browser grants (RED) |
| 7f29296c | feat(stack-web): executor browser self-check before handoff |
| **60a1552c** | **feat(executor): five read-only browser tools for a stack pack's self-check** (the grant commit; touches only `plugins/aoforge/agents/executor.md`, so `git revert 60a1552c` removes it alone. The `GRANT_ALLOW` entry and its test went in with RED 2e19707f and would then need a follow-up removal) |
| 6e29a60a | docs(quick-38): changelog and guide for soft dependencies and the web self-check |

All six went through `aof-tools commit`. BASE..HEAD touches only `files_modified` paths (17 files, +647 / -53).

## What changed

- **Schema** (`stack-pack.schema.json`): `soft_depends` exactly as D1 (entries need `pack` and `platforms`,
  `additionalProperties: false`).
- **stack-packs.cjs**: `projectPlatforms({ projectRoot, resolved })` (runtime + every `*-TRD.md` `platform` /
  `must_haves.platform` via `planningRoot` and `extractFrontmatter`; explicit values only); `activePacks` calls
  `discoverPacks` once and runs pass 1 (unchanged rules and reason strings) then pass 2 over the pass-1 hosts'
  `soft_depends`, lazily computing platforms only when a host declares any; result in discoverPacks order.
  `unavailableEntry(name, discovered, userHome, remedy)` is shared by `unavailableSelectedPacks` (text byte for byte
  as before) and the new `softDependencyWarnings`. Header and doc comments updated. Core names no pack.
- **stack-packs-cli.cjs**: `doctor()` returns `{ ok, packs, warnings }`; `--raw` appends one `warn:` line per warning;
  exit code still from `ok` only.
- **Flutter pack**: manifest `soft_depends`; verifier fragment Runtime mapping now maps web runtime / web TRD platform
  to the web pack's fragment and web-ui-verifier (8091, `?enable-semantics=true`, DWDS sentence kept), and records
  `? SKIPPED (web pack not active: ...)` to Step 9 when the web pack is not listed.
- **Web pack**: new `fragments/executor.md` (80 lines: when it runs, skips for no browser tools / no dev server,
  8091-only servers, navigate → wait_for → console_messages → snapshot → close, PASS/FAIL rows, `## Browser
  self-check` table for the SUMMARY draft, never fails a task); manifest `fragments.executor` and description;
  verifier fragment Step 8 reads the self-check table and passes its routes and FAIL messages to web-ui-verifier.
- **Core executor**: `tools:` gains exactly the five `mcp__plugin_playwright_playwright__browser_*` read-only grants
  plus one YAML comment; no prose change.
- **stack-neutrality.repo.test.cjs**: `GRANT_ALLOW` (five sorted tokens, only on the frontmatter `tools:` line),
  scrub in the main test, and `every GRANT_ALLOW entry is exactly the PATTERN-matching grant set on its tools line`.

## Probe output (scratch fixtures from the repo packs' mirrors)

```
web / stack context verifier: active ["flutter","web"]; fragments ["flutter:flutter/fragments/verifier.md","web:web/fragments/verifier.md"]; subagents ["aoforge-stack-web:web-ui-verifier"]
web / stack context executor: active ["flutter","web"]; fragments ["flutter:flutter/fragments/executor.md","web:web/fragments/executor.md"]; subagents []
mobile / stack context verifier: active ["flutter"]; fragments ["flutter:flutter/fragments/verifier.md"]; subagents []
mobile / stack context executor: active ["flutter"]; fragments ["flutter:flutter/fragments/executor.md"]; subagents []

web / stack discover --raw (exit 0):
active: flutter (profile extends flutter)
active: web (soft dependency of flutter for platform web)
```

(Taken at the final commit 6e29a60a; fixtures `web` = `extends: flutter` + a `platform: [mobile, web]` TRD, `mobile`
= `extends: flutter` + a `platform: [mobile]` TRD.)

`stack doctor --raw`, Flutter web fixture, web pack not installed (exit 0, flutter on PATH here):

```
flutter: ok
warn: flutter soft-depends on web for platform web, but it has no mirror: its plugin is not installed (no stack pack "web" is mirrored under <scratch>/q38-probe/stacks-flutter: install and enable its plugin (for AOForge's packs: /plugin install aoforge-stack-web@aocyber), or add "web" to config.json stacks.disabled); its web checks fall to human verification
```

## RED failure messages

Task 1 (67b94f54), 7 of 10 new tests failed; 3, 4 and 6 passed as pins of unchanged behaviour:
- 1: `packs.active` `['flutter']` expected `['flutter','web']`
- 2: discover active `[['flutter','profile extends flutter']]`, missing `['web','soft dependency of flutter for platform web']`
- 5: `undefined !== []` (doctor had no `warnings`)
- 7: `{"ok":true,"packs":[{"pack":"flutter",...}]}` — `0 !== 1` warnings
- 8: warnings `[]` expected `[['h','w','web','not_installed']]` (the host manifest was broken: unknown key)
- 9: `soft_depends: unknown key "soft_depends" — the schema declares no such property here`
- 10: `typeof packs.projectPlatforms` `'undefined'` expected `'function'`

Task 2 (2e19707f), 4 failures; test 12 and the new scrub sensitivity test passed:
- neutrality: `agents/executor.md: the tools line's pack-stack grants must be exactly GRANT_ALLOW's tokens` (`[]` vs the five tokens)
- 11: `extends: flutter with a web TRD (soft dependency)` — no `web: Read ...web/fragments/executor.md` pointer
- 13: `ENOENT ... plugins/aoforge-stack-web/fragments/executor.md`
- 14: web verifier fragment did not match `/Browser self-check/`

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: soft_depends selection + doctor warnings | `node --test plugins/aoforge/aoforge/bin/lib/stack-packs.test.cjs` (42 tests) + probe `stack context verifier` | 0 | PASS |
| 2: web self-check, grants, docs | `node --test stack-packs.test.cjs stack-neutrality.repo.test.cjs` (46 + 5 tests); `sed -n 5p agents/executor.md` ends with the five grants; `changelog check 3.1.0` → `ok: true` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | the seven-file scoped set (validation_gates) | 0 | PASS |
| test (full) | `node --test` over the npm test globs minus `watcher-shell.test.cjs`, HOME = scratch dir | 0 | PASS |
| lint / format / build | none in STACK.md (`status: none`) | - | not_available |

Per-file counts (tests/fail/skipped):

| File | BASE | End |
|---|---|---|
| stack-packs.test.cjs | 32/0/0 | 46/0/0 |
| stack-neutrality.repo.test.cjs | 3/0/0 | 5/0/0 |
| planning-writes.repo.test.cjs | 11/0/0 | 11/0/0 |
| rename-guard.repo.test.cjs | 20/0/0 | 20/0/0 |
| builtin-sweep.repo.test.cjs | 17/0/0 | 17/0/0 |
| doc-refs.repo.test.cjs | 18/0/0 | 18/0/0 |
| stack-profile.test.cjs | 53/0/0 | 53/0/0 |

Full suite (400 files, HOME = scratch, watcher-shell excluded):

| Point | tests | pass | fail | skipped |
|---|---|---|---|---|
| BASE d6b731e3 | 12097 | 12067 | 0 | 30 |
| after grant commit 60a1552c | 12113 | 12083 | 0 | 30 |
| end 6e29a60a | 12113 | 12083 | 0 | 30 |

+16 tests, all added here (stack-packs +14, stack-neutrality +2). Also run green after the grant change:
stack-agent-mcp-contract, executor-isolation, agent-shell-harness and ui-spec-lock tests (they read executor.md).

**Quick 37 attribution:** none. Quick 37 had finished (HEAD d6b731e3) before Task 1; BASE had 0 failures and no
quick 37 commits landed during this run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Soft-dependency install hint ends with the right remedy**
- **Found during:** Task 1
- **Issue:** `unavailableSelectedPacks`' not-installed hint ends "or remove "<name>" from config.json stacks.enabled",
  which is wrong advice for a soft dependency the project never put in `stacks.enabled`.
- **Fix:** `unavailableEntry` takes a `remedy` clause. Config selection keeps its text byte for byte; a soft
  dependency ends "or add "<name>" to config.json stacks.disabled". It returns null for an enabled pack.
- **Commit:** 4ac998de

**2. [Rule 2 - Correctness] Pass-2 packs are marked so warnings stay one level**
- **Found during:** Task 1
- **Issue:** D4 says "for each active host"; without a marker, a pack selected through a soft dependency would have
  its own `soft_depends` warned on while selection ignores them.
- **Fix:** pass-2 entries carry `soft_dependency_of: <host>`; `softDependencyWarnings` only reads pass-1 hosts.
  Test 8 pins it (w → x chain: x neither selected nor warned).
- **Commit:** 4ac998de

**3. [Rule 1 - Docs] Statements the change made false**
- web verifier fragment: "Playwright MCP tools, which core agents do not hold" → "which the core verifier does not
  hold", and its Step 8 trigger now names TRD `platform` as well as `must_haves.platform` (7f29296c).
- USER-GUIDE: "`aof-tools stack doctor` checks an active pack's tools" gains "and warns on an absent soft dependency"
  (6e29a60a).

### Small additions beyond the test list
- Neutrality: one extra test, `the tools-line scrub removes only the exact listed tokens` (a sixth grant, a wildcard
  grant and a body `tools:` line all still count), so the file has 5 tests, not 4.
- Test 13 also asserts no click/fill/type/evaluate/screenshot tool is named and that the manifest lists the fragment.
- Fragment step 2 says to pass the landmark to `browser_wait_for` as `text` (the tool's parameter).
- The web manifest description adds "(route load, console errors, one accessibility snapshot)" after D6's phrase.

## Port 8080 audit

`git diff d6b731e3 HEAD` mentions 8080 only in: the Flutter verifier fragment "(never 8080)", the web executor
fragment "never port 8080" and "unless it is on 8080", and test 13's negative regex
`/(localhost|127\.0\.0\.1|0\.0\.0\.0):8080|--port[ =]8080|PORT=8080/`. Every server example binds 8091.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 9/9 truths (probe + tests 1-15; doctor exit 0 with warnings on the synthetic host; schema and
  manifest data; GRANT_ALLOW exact set; Flutter fragment SKIPPED wording; full suite no new failures; nothing pushed,
  tagged or released; nothing written under ~/.claude or /Users/justin/dev/aoforge-claude)
- Gate failures: None

## Notes for the orchestrator

- No `## Pending CHANGELOG and doc lines`: all six doc files were clean, so every line went in with 6e29a60a.
- `tokens stamp` was not run: this is a quick task whose SUMMARY the orchestrator saves, and `quick summary` was not
  run either, per the dispatch.

## Self-Check: PASSED

- FOUND: plugins/aoforge-stack-web/fragments/executor.md
- FOUND commits: 67b94f54, 4ac998de, 2e19707f, 7f29296c, 60a1552c, 6e29a60a (`git log d6b731e3..HEAD`)
- Worktree clean apart from the untracked `.planning/quick/38-.../` directory
