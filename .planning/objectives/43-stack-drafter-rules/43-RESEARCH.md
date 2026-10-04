# Objective 43: Stack drafter rules - Research

**Researched:** 2026-10-02
**Domain:** `df-tools stack init|verify` drafter (plugins/devflow/devflow/bin/lib/stack-*.cjs), `df-tools commit`, `verify artifacts`
**Confidence:** MEDIUM-HIGH (D1, D5, D7, D11 reproduced locally; D2, D3, D4, D6 located by code reading; D8 flag support verified on Flutter 3.47.5 / Dart 3.13.4)

No CONTEXT.md exists for this objective, so there is no `<user_constraints>` block. Constraints come from OBJECTIVE.md (11 defects, requirements SDR-08 and SDR-03).

<phase_requirements>
## Objective Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SDR-03 | `--run` safety is effect-based | D8: porcelain-delta guard inside `runOne`, `--no-pub` injection, stub-flutter fixture |
| SDR-08 | Every fleet command confirmed to run | D10: 30 resolve-only repos listed below; human-checkpoint TRD |
| (42 truth) | Real-repo drafts correct with no hand edit | D1-D7 each mapped to an override golden |
</phase_requirements>

## Summary

All drafter logic is concentrated in four places: `stack-evidence.cjs` (what an item is and where it runs), `stack-classify.cjs` (key from tool or name hint), `stack-runners.cjs` (Makefile/Taskfile/justfile readers) and `stack-draft.cjs` (placement and ranking). D1, D5 and D3 are small, local fixes. D2, D4 and D6 share one design change: a "primary component" concept for a multi-stack `general` root. D8 is the only safety-critical change. D7 turns out to be largely closed already by 48-10 and needs a reproducing test first.

**Primary recommendation:** do the runner/classifier fixes first (D1, D5, D4), then the placement rework (D3, D2, D6) as one TRD against all 11 goldens, with D8 and D11/D9/D7 as independent parallel TRDs, and D10 last as a human-checkpoint TRD.

## Per-defect findings

### D1 Aggregate targets rejected as off-stack
- **Location:** `stack-runners.cjs:175-241` (`parseMakefile`) has no variable handling; recipe bodies keep `$(GO)` verbatim. Consequence in `stack-evidence.cjs:364-385` (`scopeOf`) and `stack-draft.cjs:354-367` (D3 gate).
- **Root cause (reproduced):** I built a fixture with `build: frontend backend`, `backend:\n\t$(GO) build -o gitea_no_gcc`. `$(GO) build` is an unknown tool, so it does not classify to `build`. `scopeOf` judges only units that classify to the key, leaving `bodyScopes = [node]`. The gate sees no go stack at root and emits `off_stack`. Replacing `$(GO)` with `go` in the same fixture gives `build/test/lint = make build/test/lint` correctly (aggregate and mixed-stack logic already works). `make test` was missing for the same reason. The real devflowops Gitea Makefile uses `GO ?= go` and `$(GO)` throughout.
- **Fix:** in `parseMakefile`, collect simple assignments (`VAR ?= v`, `:=`, `::=`, `=`; first definition wins for `?=`), then expand `$(VAR)` and `${VAR}` in recipe lines (bounded depth 3; leave unknown or `$(shell ...)` refs untouched). Do this in the parser so `hasTarget` and evidence share it. Optional hardening in `scopeOf`: when a unit is unclassified but `toolStack` is known, still count its stack in `bodyScopes` (already does: it is only `keyed` filtering that drops it; consider widening `basis` to `units` for stack purposes, keep `keyed` for area).
- **Tests to extend:** `stack-runners.test.cjs` ("readRunners - Makefile") for expansion; `stack-draft.test.cjs` D29/D30b region for the mixed aggregate; add shape `aggregateMakeShape` to `__fixtures__/stack-drafter-fixtures.cjs` and e2e test 18 in `stack-drafter-e2e.test.cjs`.
- **Golden:** `devflowops.STACK.md` (build/test/lint/format/tidy/codegen/audit/e2e/deps all `make X`; `lint apply: make lint-fix`, `format apply: make fmt` come from apply-form targets).

### D2 Sub-area filter only protects Go roots
- **Location:** `stack-evidence.cjs:122-129` `areaFor` (any dir that is not a detected language area collapses to `''`), and `stack-draft.cjs:329-339` placement. The D3 off-stack gate at `stack-draft.cjs:354` is a no-op when `family` is null (`extends general`), so general roots are unprotected.
- **Root cause:** (a) `./build.sh` with cwd `infra/tiles` (politihub) is in no language area, so `area=''` and it is a root candidate. (b) `bash portal/build.sh` (aocore) is invoked from root; `unitCwd` ignores the script's own directory, so effectiveArea is `''` though the script lives in a flutter component. (c) With `extends general` nothing gates root keys.
- **Fix:** (1) `scopeOf` effective area: when a unit's cwd is non-root and in no language area, use that dir as a pseudo-area (it lands in the `subArea` bucket and becomes a `sub_area` note). (2) For `kind: 'script'` units with no `cd`, fall back to `areaFor(dirname(scriptFile))`. (3) For `extends general` with components, gate root keys by the primary component's stack (see D6 design) so no stray key survives.
- **Tests:** `stack-draft.test.cjs` D31/D31b; `stack-evidence.test.cjs` (effectiveArea cases); new e2e shapes for aocore and politihub.
- **Goldens:** `aocore.STACK.md`, `politihub.STACK.md` (note `portal_codegen` in aocore is a hand-added key and is not derivable; do not assert it).

### D3 Manifest-less root takes one subfolder's language
- **Location:** `stack-draft.cjs:220-222` (`supported.length === 1` => `extendsId = that tier`, `single = dir`) plus the re-emit loop at `:470-475`.
- **Root cause:** a lone non-root supported area is promoted to the root extends with `cwd: D` on every command. Correct for aoinference-style repos where the product lives in `control-plane/`, wrong for devcluster (bash + `tools/devproxy`) and EdenDocs (C++/JS root + `wopi-host/`).
- **Fix:** if no supported area is at the root, `extends: general` and every supported area is a component. Then the D6 rework supplies root keys from the primary component. **Conflict to resolve in planning:** existing tests D15c (`stack-draft.test.cjs:175`), e2e 4 (aoinference), e2e 14 (checkout path) and e2e 11 assert the single-area promotion. Decision needed (Open Question 1); my recommendation is the literal rule from OBJECTIVE.md, with D6 guaranteeing aoinference-shaped repos still get `build/test/lint` with `cwd` from the primary component, and updating those tests to the new expected shape.
- **Golden:** `devcluster.STACK.md` (note `build: none` is human judgment: `bin/build.sh <app>` builds other repos' images; the drafter cannot derive it, so assert equivalence modulo `build`), `EdenDocs.STACK.md`.

### D4 Environment/scenario targets proposed as test/e2e/build
- **Location:** `stack-classify.cjs:284-300` (`HINT_TOKENS`: `e2e` token -> key `e2e`); `stack-evidence.cjs:200-212` (`classifyTarget`) and `:230-245` (`classifyStep`/script branch use the FIRST classified invocation in a script body); `stack-draft.cjs:150-157` (`breadthOf`).
- **Root cause (three separate cases):**
  1. eden-biz `make e2e-stack-up`: name has `e2e`, so it is the `e2e` key; it actually brings up an environment.
  2. EdenDocs `wopi-e2e.sh`: `classifyBody` takes the first classified line in the script, a `go build`, so the script is `build`. The scenario name never gets a vote.
  3. eden-biz `./go/scripts/check-migrations_test.sh`: script name ends `_test`, taken as repo-wide `test`; `breadthOf` has no rule for single-purpose scripts.
- **Fix:** add a scenario/environment classification step before key assignment: tokens `up|down|stack|env|seed|infra|cluster|compose|start|stop` together with an `e2e|integration|scenario` token => key `e2e_env` (golden key name); a wrapper script whose name carries `e2e|smoke|scenario|integration` keeps that key and ignores its body's first-line classification; a script (runner `script`) named `check-*|verify-*|*_test.sh` that is not exactly `test` is `narrow` in `breadthOf`. Body signal: `docker compose up|run`, `kubectl`, `kind create` bodies are `e2e_env`, never build/test.
- **Tests:** `stack-classify.test.cjs` (hint table, add `e2e_env` cases), `stack-draft.test.cjs` D21-D24 region for the narrow script, `stack-evidence.test.cjs` for scripts; e2e shapes for eden-biz and EdenDocs.
- **Goldens:** `eden-biz.STACK.md` (`e2e_env: make e2e-stack-up`), `EdenDocs.STACK.md` (`e2e` = wopi-e2e.sh; `smoke` and `branding` are hand keys). Also `aoedge.STACK.md` (`acceptance: make acceptance`; `make acceptance*` are scenario suites, `build-fips` beats `build-dev` already by canonical rank D25).
- Also check `stack-verify.cjs` `SERVER_TARGET_NAME` (up/start) so `e2e_env` is never executed under `--run` (it is not in `defaultKeys`/`optInKeys`, so it is `key-not-runnable`; keep it that way).

### D5 Internal Taskfile tasks verified as resolvable
- **Location:** `stack-runners.cjs:475-496` (`readTaskProps` never reads `internal:`), `:505-530` (`parseTaskfile`), `:628-652` (`collectTask`), and `hasTarget` `case 'task'` at ~`:980`. `stack-verify.cjs:305-322` (`checkRunner`) turns `hasTarget === false` into `target_missing`.
- **Root cause:** `internal: true` is ignored. ao-terminal `go:mod:tidy` and `npm:install` are reported `resolved`.
- **Fix:** read `e.key === 'internal'` (boolean scalar) in `readTaskProps`; carry `internal` on the parsed task and the runner target. `hasTarget` returns `false` for an internal task matched by name/alias (so verify says `target_missing`, detail "internal task: not invocable from the CLI"). `readRunnerTargets` (`stack-evidence.cjs:433`) must skip internal targets as candidates. Keep them in `ctx.index` so `targetUnits`/dep expansion still sees their bodies.
- **Tests:** `stack-runners.test.cjs` "readRunners - Taskfile" (internal flag; `hasTarget`), `stack-verify.test.cjs` "task, just and npm-family scripts", fixture builder in `stack-runner-fixtures.cjs`; e2e: tidy falls to `go mod tidy -diff` with `apply: go mod tidy`.
- **Golden:** `ao-terminal.STACK.md` (`tidy: { run: "go mod tidy -diff", apply: "go mod tidy" }`; `deps: npm ci`, `bootstrap: task init`).

### D6 Thin coverage when a recipe wraps a component command
- **Location:** `stack-draft.cjs:329-339` and `:477-491`: any item whose effectiveArea is a component goes to `elsewhere`, which only ever produces notes ("a per-area command is not written to STACK.md").
- **Root cause:** with a `general` root and components there is no path for a component-area runner/CI command to become a root key, even when the root has none. navigators `just test-go` (`cd navigators-go && go test ./...`), aodex/politihub/eden-biz `go/Makefile`, aocore `go` CI jobs.
- **Fix (shared design with D2, D3):** for `extends general` with 2+ components, pick a **primary component** (rule: the component holding the most runner+CI evidence; tie break go > dart/flutter > other; record it in notes). Items whose effectiveArea is the primary component participate in root-key ranking, keep their `cwd` (golden `build: make build, cwd: go`; navigators keeps the root `just test-go` with no cwd since the recipe itself does the `cd`), and only fill keys where no root-area candidate exists (devcluster keeps its root bash/shellcheck keys). Candidates from non-primary components stay notes. `component equal to tier default` skip at `:484` stays.
- **Tests:** `stack-draft.test.cjs` D17b (currently asserts component-only commands become notes: update), new e2e shapes aodex, navigators, politihub, eden-biz; `stack-detect` unaffected.
- **Goldens:** `aodex.STACK.md`, `navigators.STACK.md`, `politihub.STACK.md`, `eden-biz.STACK.md`, `aocore.STACK.md`.

### D7 `df-tools commit` gitignore check is directory-level
- **Location:** `misc.cjs:593-594` (`isGitIgnored(cwd, '.planning')`, defined at `helpers.cjs:205`), with the per-path probe `ignoredPaths` at `misc.cjs:545` added by 48-10.
- **Reproduced:** a `.planning/` rule plus a tracked `.planning/config.json`: `git check-ignore -q -- .planning` exits 1 (index-aware), so `blocked` is null. But 48-10's `ignoredPaths(--no-index)` then drops an untracked ignored `.planning/STACK.md` correctly (`skipped_gitignored`), and tracked files still commit. So the **planning-path case is already fixed on this branch**; OBJECTIVE.md predates it.
- **Residual gap (reproduced):** non-`.planning` ignored paths passed to `--files` are never probed; `git add` fails silently and the commit reports `commit_failed` ("pathspec ... did not match any file(s) known to git"). Also `blocked` should use `ignoredPaths` for `.planning/` consistency.
- **Fix:** run `ignoredPaths` over ALL requested paths (not only planning ones), report them in `skipped_planning` (or a new `skipped_ignored`) with reason `skipped_gitignored`; keep tracked-path and staged-removal exemptions. Replace the directory-level `isGitIgnored` with the same probe.
- **Tests:** `misc-commit.test.cjs` (case 3 area) and `misc-commit-gate.test.cjs` case 8; add "tracked child under ignored dir" and "ignored non-planning file".
- **Planning note:** confirm with the user whether D7 is considered closed (only the residual remains); keep this TRD small.

### D8 `stack verify --run` safe keys are not read-only (SDR-03)
- **Location:** `stack-verify.cjs:480-490` `RUN_POLICY.defaultKeys = format, lint, typecheck, build` (key-based); `runOne` `:806-860` (spawn at ~`:842`); `runCommands` `:888`.
- **What runs for Flutter/Dart.** Defaults come from the bundled profiles (`stack-profiles/dart.md`, `flutter.md`; flutter extends dart; component views report only overrides):
  | key | dart | flutter | runs under default `--run`? |
  |---|---|---|---|
  | format | `dart format --output=none --set-exit-if-changed .` | inherited | yes |
  | lint | `dart analyze --fatal-infos` | `flutter analyze --fatal-infos` | yes (the mutating one) |
  | build | `none` | `discover` | no (not runnable) |
  | typecheck | not defined | not defined | n/a |
  | test | `dart test` | `flutter test` | only with `--include test` |
  | integration/golden/fix/audit/outdated/deps | | | no (`key-not-runnable`, `never-run-key`, `not-selected`) |
- **`--no-pub` support (verified locally, Flutter 3.47.5 / Dart 3.13.4):** `flutter analyze --[no-]pub` yes; `flutter test --[no-]pub` yes (help text "Whether to run flutter pub get before executing this command"); `dart analyze` has **no** `--pub` flag (only `--fatal-infos`, `--[no-]fatal-warnings`); `dart test` and `dart format` have no pub flag (format does not resolve). So `--no-pub` covers flutter analyze/test only; Dart packages need the effect guard.
- **Design (defence in depth, effect guard is authoritative):**
  1. **Prevention:** in `runOne`, when the command's invocations are exactly `flutter analyze|test ...` and lack `--pub`/`--no-pub`, run with `--no-pub` appended. Never rewrite the stored profile command; only the executed text, and record `run.rewritten`. If `.dart_tool/package_config.json` is absent, `--no-pub` will fail: report `skipped: needs-pub-get` rather than run `pub get`.
  2. **Effect guard (inside `runOne` around `opts.spawn`):** before spawning, `snapshot(root)`: `git -C root status --porcelain=v1 -z -uall` (+ `--ignored=no`), then for every listed path `lstat` size+mtimeNs and a content hash (via `git hash-object`) and keep file bytes up to 1 MB for restore. After the run, take the same snapshot and diff: new paths, removed paths, and any path whose hash changed. The porcelain line alone is NOT sufficient: the rollout repos (aocore, aodex) were already dirty on `analysis_options.yaml` / `pubspec.lock`, so "M" before and after hides a second modification; compare content, not status codes.
  3. **On delta:** restore changed/new/removed files from the in-memory snapshot (clean-before paths via `git checkout -- <p>` / remove untracked), set `run.mutated = [{path, change}]` and `run.restored: true|false`, exit-code reported as normal, and skip the remaining Flutter/Dart items for that root as `side-effect-unsafe` (halt rule, so one mutation does not cascade).
  4. **Not a git work tree / git failure:** refuse Dart/Flutter gates under `--run` (`skipped: side-effect-unproven`) because no effect can be observed; other tools keep today's behaviour.
  5. Optional: copy the component to a temp dir; not recommended (large repos, relative path deps).
- **Injected `spawn`:** existing tests (`stack-verify.test.cjs:702-845`) inject a fake `spawn` that never touches the fs, so the guard sees no delta there and those tests stay green. The new regression test must use the real spawn with a stub `flutter` script on PATH (`fx.fakeToolchain`, `fx.gitOnlyBin` already exist in `stack-drafter-fixtures.cjs`) that appends `analyzer: exclude:` to `analysis_options.yaml` and rewrites `pubspec.lock`, in a `git init` fixture with one pre-dirty file; assert `mutated` lists both, files restored byte-exact, the pre-dirty edit preserved, and the second flutter item skipped.
- **Tests to extend:** `stack-verify.test.cjs` "runCommands: executor (test 3)" and "CLI: stack verify --run (test 3)"; `RUN_POLICY shape` for any new reason names.
- **Confidence:** flag support HIGH (checked against the installed SDKs); `dart analyze` implicit pub get behaviour LOW (not exercised; the guard makes it moot).

### D9 `stack mcp` drops Flutter tools in mixed Flutter + pure-Dart repos
- **Location:** `stack-mcp.cjs:160-165` (`chosen.delete(name); chosen.set(name, ...)`: later view wins). Existing test 5b (`stack-mcp.test.cjs:199`) covers root dart + one flutter component only; a pure-Dart component listed after the flutter one wins and its profile args carry `--disable flutter`.
- **Fix:** conflict by name is resolved by a precedence function, not order: an entry whose view resolves through a `flutter` profile (or, without naming stacks in the loader, whose args do not contain `--disable` followed by `flutter`) beats one that disables flutter; otherwise keep today's last-wins. Keep test "a later view overrides an earlier one by name (component beats root)" green.
- **Tests:** add 5c in `stack-mcp.test.cjs` (components `flutter/`, `go/`, `packages/core/` dart; assert dart args have no `--disable flutter`, in both orders).

### D10 Run the gates for real (SDR-08)
- **Fleet source:** `42-ROLLOUT.md` (36 canonical repos; 3 not committed: aocyber-deploy skip, devflow-claude self, justin-donnaruma-us-go blocked by gitignored stack files; 33 committed). Ran `verify --run` before the halt: **ao-terminal, aodex, aoedge** (6 gates exited non-zero, pre-existing gate-red).
- **Only resolve-checked (30):** aocore, aofamily, aoid, aoinference, AOSignal, aostudio, devcluster, devflow, devflow-test, devflowops, dfip, eden-biz, eden-circle, eden-libs, eden-platform-go, eden-press, eden-ui-flutter, EdenDocs, github-enterprise-migration, justinforme, navigators, opsCluster, politihub, qrCodeBuilder, quanta-local, recycling-oracle, smartWellness, torrentConsole, trades, videoArchive. (AOSignal, aostudio, devflow-test and github-enterprise-migration have no drafted commands, so they are trivially "nothing to run".) Plus justin-donnaruma-us-go if its gitignore block is cleared.
- **Mechanics:** `stack verify --run` is read-only by design with D8 fixed; it needs no commit. But `stack report` has no section for run results (`stack-report.cjs` `buildReport`/`cli` only take `--write --draft`), so "record in each STACK-REPORT.md" would require a new report feature AND a write plus commit into 30 repos in `~/dev`.
- **Recommendation:** record results in `43-ROLLOUT.md` (a table in this objective, the alternative 42-VERIFICATION itself allows), write nothing into other repos. This TRD must be `autonomous: false` with checkpoints: (1) human approves the repo list and the `--include` set (default format/lint/build only; `test` opt-in per repo, no port 8080, no deploy keys) before any gate runs; (2) human reviews the table before any STACK-REPORT.md is written or committed into another repo. Many repos are dirty (see the baseline JSON in 42-ROLLOUT.md); run the porcelain-delta check before and after each repo as the rollout harness did, now redundant with the D8 guard.
- **Depends on:** D8 complete and shipped to the `~/.claude/devflow` mirror (sync-runtime) before any real run.

### D11 `verify artifacts` can't parse `must_haves`
- **Location:** `frontmatter.cjs:238-300` `parseMustHavesBlock` hardcodes the block header at exactly 4 spaces (`^\s{4}${blockName}:`), items at 6 spaces and continuation keys at 8; called by `verify.cjs:293` and `:348`.
- **Root cause (reproduced):** the template (`templates/job-prompt.md:32-35`) and all real TRDs (42-01-TRD.md) put `artifacts:` at 2 spaces and items at 4. The parser expects `must_haves` nested one level deeper, so it returns `[]` and `verify artifacts` prints "No must_haves.artifacts found". Secondary: `trd-artifacts.cjs` (`parseMustHavesArtifacts`) uses the correct 2/4 layout, so two readers disagree. Tertiary: 42's `key_links` are plain strings (`"a -> b -> c"`), which `cmdVerifyKeyLinks` silently skips (`typeof link === 'string'`), so after the indent fix key-links would report empty/no results; decide whether to report "string key_links are not machine-checkable".
- **Fix:** locate `must_haves:` first, derive the child indent from its first non-blank line (2 or 4), and parse items relative to that (`- ` at child+2, continuation keys at child+4). Accept both layouts so the legacy tests keep passing. Better: reuse one shared scanner with `trd-artifacts.cjs`. Fix quoted values containing `"` (the kv regex `"?([^"]*)"?\s*$` mis-parses `provides` strings with inner quotes).
- **Tests:** `frontmatter.test.cjs` (comments at ~97 and ~184 describe current behaviour; add a 2/4-indent fixture and real 42-01-TRD frontmatter), and a CLI test for `verify artifacts` against a 2/4 layout TRD. Regression: run `verify artifacts` over all 15 TRDs of objective 42 and assert non-empty.

## Standard Stack

No new dependencies. Everything is CommonJS (`.cjs`), Node native test runner (`npm test`, `node --test`), synchronous fs, `spawnSync` for git. Do not add a YAML or Makefile parser library (project convention, P11: `stack-profile.cjs` must not name stacks; `stack-draft.cjs` stays PURE with no fs or require of `stack-profile.cjs`, enforced by test D20).

## Architecture Patterns

- **Goldens as fixtures:** build an invented repo per override in `__fixtures__/stack-drafter-fixtures.cjs`, run `stack init` through `stack-drafter-e2e.test.cjs`'s `stackInit(repo)` helper (PATH is a stub toolchain, HOME empty, so results are deterministic), assert command equivalence against the override's `commands` (modulo hand-only keys: aocore `portal_codegen`, devcluster `build: none`, EdenDocs `smoke`/`branding`/`test: discover`, quanta-local `preflight`/`verify`, ao-terminal `bootstrap`, aodex `guards`). Do not copy real repo content.
- **Placement stays in `stack-draft.cjs` (pure); path/area facts stay in `stack-evidence.cjs`.** New facts (pseudo-area, `internal`, scenario class) are item fields so the pure module only reads them.
- **Defence in depth for `--run`:** policy (what may run) then prevention (`--no-pub`) then effect guard (what changed).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Working-tree delta | custom file watcher | `git status --porcelain=v1 -z -uall` + `git hash-object` | handles untracked, renamed, deleted; already used in `misc.cjs` `gitInput` |
| Ignore matching | glob re-implementation | `git check-ignore --no-index --stdin -z -v -n` (existing `ignoredPaths`, `stack-profile.cjs:1059` `ignoredTargets`) | negations and nested rules |
| Make variable semantics | full make evaluator | bounded literal substitution of simple assignments only | `$(shell)`/conditionals stay opaque; fail safe to today's behaviour |
| must_haves parsing | a third YAML reader | one shared scanner (`trd-artifacts.cjs` style) | two readers already disagree |

## Common Pitfalls

1. **Status-only porcelain compare misses re-modification of already-dirty files** (aocore, aodex were dirty on exactly the files flutter touches). Compare content hashes.
2. **Over-fixing D3 breaks single-area repos** (aoinference, opsCluster, `eden-platform-go`-style): their expected output must be re-baselined with D6 supplying `cwd` keys; check `42-ROLLOUT.md` dry-run rows (build/test/lint with `(cwd control-plane)`) as regression targets.
3. **Pseudo-area for non-area dirs can demote legitimate root commands** (`make -C docs`, `scripts/`): limit to non-root cwds and keep notes (`sub_area`) so nothing is lost silently.
4. **Make variable expansion beyond literals** (`$(shell ...)`, recursive `=`): leave untouched.
5. **`internal: true` tasks still needed for body expansion** in `targetUnits`; only hide them as candidates and as invocable targets.
6. **Fake `spawn` in existing tests** will not exercise the D8 guard; the regression needs the real spawn and a real stub binary.
7. **No port 8080** in any fixture or `--include test` run (RUN_POLICY already denies it; keep scenario ports at 8091).
8. Hook gate: raw `git commit` is blocked in this repo; scratch repos in tests must use the helper that sets `DEVFLOW_ALLOW_RAW_COMMIT=1` in the spawned env, not the shell prefix.

## Code Examples (shape only)

```js
// D8 inside runOne, around the existing spawn (stack-verify.cjs ~:842)
const before = snapshotTree(ctx.root, { fs: ctx.fs });          // null => not a work tree
if (before === null && isDartFlutter(it.command)) return withSkip(it, 'side-effect-unproven', 'not a git work tree');
const r = opts.spawn('sh', ['-c', commandToRun], { ... });
const delta = before ? diffTree(before, snapshotTree(ctx.root)) : [];
if (delta.length) { restoreTree(before, delta); run.mutated = delta; haltRoot(ctx, it); }
```

## State of the Art

| Old | Current | Impact |
|---|---|---|
| Key-based `--run` allow list | effect-based guard plus key policy | SDR-03 closed |
| `flutter analyze` implicit pub get | `flutter analyze --no-pub` (Flutter 3.47.5) | avoids lockfile bumps; `dart analyze` has no equivalent |

## Open Questions

1. **D3 vs single-area promotion.** Literal rule (always `general` + component when no root manifest) changes aoinference, opsCluster, EdenDocs-like rows and 4 existing tests. Recommend literal rule plus D6; confirm.
2. **D10 recording location.** Recommend `43-ROLLOUT.md`, not 30 STACK-REPORT.md writes; confirm, since OBJECTIVE.md says "each STACK-REPORT.md".
3. **D7 may already be closed** by 48-10 for planning paths; confirm scope (non-planning ignored paths only).
4. **Primary-component tie-break** (D6) is heuristic; the 5 multi-stack goldens all have a Go component with the product build, so go-first holds, but this is untested on the rest of the fleet.
5. **`build: none` (devcluster) and aocore `portal_codegen`** are human judgments, not derivable; the success criterion should be "equivalent modulo hand-only keys".
6. `dart analyze` implicit pub get behaviour not verified (LOW); guard covers it regardless.

## Sources

### Primary (HIGH)
- Local code reading with file:line as cited; local repros in the scratchpad (D1 Makefile fixture, D7 git repro, D11 `df-tools verify artifacts` on 42-01-TRD.md).
- `flutter analyze|test --help`, `dart analyze --help` on Flutter 3.47.5 / Dart 3.13.4 (installed).
- `42-ROLLOUT.md`, `42-VERIFICATION.md`, `overrides/*.STACK.md`, `OBJECTIVE.md`.

### Secondary (MEDIUM)
- Defect narratives in OBJECTIVE.md for D2, D4, D6 (code paths read, not all reproduced against the real fleet repos).

## Metadata
**Confidence breakdown:** stack = HIGH (no new deps); architecture = MEDIUM (D2/D6 design not prototyped); pitfalls = HIGH.
**Research date:** 2026-10-02. **Valid until:** 2026-10-30 (internal code; stale if stack-*.cjs changes).

## Suggested TRD breakdown and waves

- **Wave 1 (parallel, disjoint files):**
  - 43-01 D1 + D5 (stack-runners.cjs, stack-evidence readRunnerTargets, stack-verify checkRunner): runner readers.
  - 43-02 D8 (stack-verify.cjs runOne/runCommands): SDR-03, real-spawn stub-flutter fixture.
  - 43-03 D11 + D9 + D7 (frontmatter.cjs/verify.cjs, stack-mcp.cjs, misc.cjs): small independent fixes.
- **Wave 2 (depends on 43-01):**
  - 43-04 D4 (stack-classify.cjs, stack-evidence classifyStep/scripts, breadthOf).
- **Wave 3 (depends on 43-01, 43-04; one TRD, touches stack-draft.cjs and stack-evidence.cjs together):**
  - 43-05 D3 + D2 + D6 primary-component placement, plus the golden e2e shapes for all 11 overrides.
- **Wave 4 (autonomous: false):**
  - 43-06 D10 fleet `--run` pass (depends on 43-02 and the plugin re-mirror); human checkpoints before running and before writing any other repo; record in 43-ROLLOUT.md.
- Final: `/devflow:milestone audit` re-audit.
