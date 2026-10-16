# Objective 42: Codebase-aware stack drafter - Research

**Researched:** 2026-09-28
**Domain:** DevFlow `df-tools stack init` / `adopt` drafting of `.planning/STACK.md`; Go/Dart/Flutter agent tooling (gopls MCP, dart mcp-server, agent skills); CI/local-tooling audit
**Confidence:** HIGH for code seams, machine state and MCP/tool facts (verified live); MEDIUM for report check catalogue and rollout mechanics

<user_constraints>
## User Constraints (no CONTEXT.md exists for objective 42; taken from OBJECTIVE.md and the spawning request)

### Locked Decisions
- Kind `plugin`, work `feature`: TDD, failing tests first for all `df-tools` lib code, fixtures modelled on the observed failure shapes (do not copy repo content). Suite is `node --test` (`npm test`).
- Never use port 8080 (use 8091 if a server is ever needed). Pass this to every subagent.
- Do not push, do not release. Fleet rollout commits only STACK.md / report files on each repo's CURRENT branch; dirty trees / conflicts are surfaced, not committed.
- CLI stays deterministic. MCP confirmation (gopls / dart tools) is agent-side only.
- Recommendations report is proposals only, never auto-applied.
- Requirements SDR-01..SDR-08 as written in OBJECTIVE.md.

### Claude's Discretion
- Module split and file names, data table encoding, report format, wave breakdown, how tier-2 profiles are shipped.

### Deferred Ideas (OUT OF SCOPE)
- Replacing gopls/dart MCP with `dflang mcp` (docs/PROPOSAL-stack-packs.md 6.12, long-term).
- Node/Rust/Python tier-2 profiles (not in SDR-04; listed as follow-up in Open Questions).

### Cross-Repo Considerations
- None auto-populated. Fleet survey in section 6 is the cross-repo evidence.
</user_constraints>

<phase_requirements>
## Objective Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SDR-01 | Codebase detection, components | 1.4 (detector design), 6 (layouts up to depth 3), Pitfalls 4, 5 |
| SDR-02 | Extraction hygiene | 1.1 (exact defects), 1.2 (seams), 1.3 (classification table) |
| SDR-03 | Command verification | 1.5 (resolver design), 3 (machine facts) |
| SDR-04 | Tier-2 profiles | 2 (install path + exact fixes, verified upstream) |
| SDR-05 | Skills + MCP | 2.3, 5 |
| SDR-06 | Recommendations report | 4 |
| SDR-07 | Validation fixes | 1.6 |
| SDR-08 | Fleet rollout | 6.3, 7 |
</phase_requirements>

## Summary

The current drafter is small and simple. `initProfile` (stack-profile.cjs:882) calls `pickExtends` (:732), then `draftProfile` (:784), which calls `collectEvidence` in `stack-evidence.cjs`. Evidence is only `run:` lines of `.github/workflows/*.yml`, Makefile/justfile target NAMES, `package.json` scripts and TESTING.md fences. Each line is classified independently by a token regex (`stack-evidence.cjs:26-35`) and the first entry per key wins (`stack-profile.cjs:795-803`). I reproduced every failure shape from OBJECTIVE.md in a scratch fixture: a `run: |` block is split line by line, so `gosec … \` yields nothing, `-fmt sarif ./...` becomes `format`, `flutter build ipa \` is truncated, and `--build-number=…` is a second `build` entry. Nothing reads `go.mod`, `pubspec.yaml`, `Cargo.toml`, Taskfile bodies, or `uses:` actions. That is why manifest-only repos (torrentConsole, recycling-oracle, aofamily, trades) get `commands: {}`.

Four things the objective text does not say, and the planner must design around:
1. `pickExtends` cannot tell Dart from Flutter. Both profiles have `detect: [pubspec.yaml]`, and the most-specific rule drops the ancestor, so a PURE-DART package would be given `extends: flutter`.
2. A component profile FILE (`profile: .planning/stacks/x.md`) does not follow its own `extends` (stack-profile.cjs:331-338 only parses and pushes it as one layer), and `command.cwd` is passed through but never joined with the component path (`stack-render.cjs:80`). Monorepo `components` need both fixed or they cannot be usable.
3. Shipping tier-2 profiles into `~/.claude/devflow/stacks/` by the runtime mirror would WIPE user/org profiles: `sync-runtime.js` removes each target subdir before the rename (lines ~215-230). Ship them to a different dir and resolve via `__dirname` (as `BUNDLED_PATH` already does).
4. In dart-mcp-server 1.1.2 (Dart 3.13.4), `run_tests`, `dart_fix`, `dart_format`, `create_project` and the app-lifecycle tools are DISABLED BY DEFAULT and need `--enable cli` (verified live). The CLAUDE.md fix note ("whitelist drops run_tests") is right that the whitelist is wrong, but the correct remedy is `--enable cli --disable pub_dev_search`, not a `--disable`-only list.

**Primary recommendation:** Keep the loader language-neutral (test P11 forbids stack names in `stack-profile.cjs`, and C14 in `stack-render.cjs`). Put language knowledge in data (tier-2 profile fields plus one catalogue table in a new neutral-named module), split the drafter into `stack-ci.cjs` (CI parser), `stack-runners.cjs` (Make/Task/just), `stack-detect.cjs` (manifests, components), `stack-verify.cjs` (resolvability) and `stack-report.cjs` (SDR-06), and ship the tier-2 profiles in a new mirrored `devflow/stack-profiles/` directory resolved after the user `stacks/` dir.

## Standard Stack

### Core (all already in the repo, no new dependencies)
| Module | Role in this objective | Notes |
|--------|------------------------|-------|
| `bin/lib/stack-profile.cjs` | parse/resolve/validate/draft/init/CLI | keep language-free (P11) |
| `bin/lib/stack-evidence.cjs` | command evidence readers | rewrite internals; keep `collectEvidence` signature |
| `bin/lib/stack-render.cjs` | `renderCommand`, `contextFor` | C14 neutrality test; needs component-cwd join |
| `bin/lib/yaml-lite.cjs`, `json-schema-lite.cjs` | frontmatter/schema | `anyOf`/`oneOf` supported (json-schema-lite.cjs:9) |
| `bin/lib/flutter-ui-scope.cjs` `detectPubspecFlutter` | Flutter-vs-Dart pubspec test | reuse, do not reinvent |
| `bin/lib/repo-state.cjs` | manifest to language detection | `MANIFEST_LANG` misses `pubspec`-as-Flutter and depth>0 |
| `node:test` | tests | fixtures via `__fixtures__/stack-profile-fixtures.cjs` (`makeProject`, `makeHome`, `profileMd`, `goShapedRepo`) |

### Tools on this machine (verified 2026-09-28)
| Tool | Version | Use |
|------|---------|-----|
| go | 1.27.1 | `go fix -diff` and `go mod tidy -diff` both exit non-zero on a non-empty diff (verified via `go help`) |
| gopls | v0.22.0 | `gopls mcp` works; `gopls mcp -instructions` prints model instructions |
| dart / flutter | 3.13.4 / 3.47.5 | `dart mcp-server` 1.1.2 |
| task / just / make | 3.53.1 / 1.58.0 / GNU Make 3.81 | `task --list-all --json` and `just --dump --dump-format json` both work |
| golangci-lint | v1.64.8 (v1 only) | matches CI in aocore/aodex (action v6, v1.x). A v2 `version: "2"` config would fail locally, which the verifier should surface |
| govulncheck / gosec / buf / sqlc / templ / k6 / kubeconform / trivy / maestro / helm / docker | v1.7.0 / present / 1.73.0 / v1.31.1 / present / present / present / present / 2.4.0 / present / present | present |
| MISSING | staticcheck, hadolint, pnpm, yarn, osv-scanner, ginkgo, patrol, act | report must not assume them; ginkgo is used by dfip CI |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Line-based CI parser | yaml-lite / a YAML lib | Module header (stack-evidence.cjs:14-17) rejects yaml-lite (anchors, multi-doc, `on:`); repo policy is one runtime dep. Stay line-based but structure-aware (job, step, indentation) |
| Static Make/Task/just parsing | shelling out `task --list-all --json`, `just --dump` | Exec is exact but needs the tool installed; use static parse always, and optionally enrich with exec when the runner is on PATH (never required) |
| Language knowledge in evidence code | data in tier-2 profiles | Data keeps P11/C14 green and follows the packs rule "one source" |

## Architecture Patterns

### 1. How `stack init` extracts evidence today (SDR-02 seams)

| Concern | Where | Behaviour / defect |
|---|---|---|
| Entry | `stack-profile.cjs:981-994` (`cmdStack init`), `:882-901` `initProfile` | preview by default; `--write`, `--force` |
| Extends selection | `:732-763` `pickExtends`; `:682-689` `markerMatches` | root-dir entries only (no subdir), literal or `*.ext`; ancestors dropped, so Flutter beats Dart for every `pubspec.yaml`. Object-form markers would never match (guard `typeof marker !== 'string'`) |
| Draft | `:784-824` `draftProfile` | evidence to `commands`; first entry per key wins (`:795-803`); a key is skipped only if the parent already defines a non-discover `run` |
| Date | `:806` `new Date().toISOString().slice(0,10)` | UTC: 2026-09-29 at 21:47 local (confirmed; `date` = Sep 28, `date -u` = Sep 29). Same bug at `adopt.cjs:541`, `misc.cjs`, `init.cjs`, `objective.cjs` |
| CI | `stack-evidence.cjs:103-150` `readCiWorkflows` | regex `^(\s*(?:-\s+)?)run:` (:123). Block scalar (:127-141) treats every indented line as an independent command; no `\` join, no `#` filter, no `echo`/`test`/`if`/`{` filter, no `${{ }}` handling, no `working-directory` (job/defaults/step), no `uses:` actions, no `name:` |
| Classification | `:26-35` `TOKEN_MAP`, `:44-56` | first matching key by regex over the whole line. `\btests?\b` matches `test -f x` and `# run the tests`; `\bfmt\b` matches `-fmt sarif`; `helm lint` gives `lint`; `npx playwright test` gives `test`; `gosec`/`govulncheck` unclassified |
| Make | `:154-172` | target NAME only, emits `make <t>`; the recipe body is never read; no `-C dir`; no `include` |
| just | `:176-198` | recipe name only; `just <r>` |
| npm | `:202-226` | `test` becomes `npm test`; other scripts by name/body; no pnpm/yarn/bun detection, no workspaces |
| Taskfile, go.mod, pubspec, Cargo, pyproject, Dockerfile, helm, buf, sqlc | not read | ~10 repos get `commands: {}` |
| Serialization | `:856-870` | flow-map per command; no comments, so notes can only live in the body HTML comment or in reports |
| adopt | `adopt.cjs:602-618` (`scaffold` calls `initProfile({write:true})` unverified), `:945-956` (report re-drafts to list missing test/lint/build evidence) | any fix in `draftProfile` flows into adopt automatically. `map-codebase.md` step `draft_stack_profile` (:252-266) asks the user; adopt skips it (adopt.md rule + map-codebase.md:36) |

**Minimal seams (in order):**
1. **`stack-ci.cjs`** (new): `parseWorkflows(root) -> steps[]`, each `{file, job, name, run (joined, logical command lines), uses, cwd, continueOnError}`. Algorithm: join lines ending in `\` (mind `\\`); split a block on newlines and `&&`/`;` only at top level outside quotes; drop `#` comments, blank lines and shell control fragments (`if`, `then`, `fi`, `else`, `do`, `done`, `{`, `}`, `||`-only, `set -e...`, `export`, `echo`/`printf`/`cat`/`mkdir`/`cd`-only lines); drop lines starting with `-`, `--` or `$` (bare flag / var fragments); drop any command whose remaining text is only `${{ ... }}`. `cwd` = step `working-directory` else job `defaults.run.working-directory` else workflow-level default (aocore go.yml:41-42 uses a workflow-level default of `go`).
2. **`stack-runners.cjs`** (new): `readRunners(root) -> targets[]` with `{runner: make|task|just|npm, dir, name, body[]}`. Task: line reader of `tasks:` with `cmd:`/`cmds:` (names contain `:`; support both keys); optional enrichment `task --list-all --json`. just: recipe header plus indented body; optional `just --dump --dump-format json`. Make: targets plus tab-indented recipe lines, in root and one level down (`go/Makefile`, `flutter/Makefile`); emit `make -C <dir> <t>` for non-root. Bodies are normalised to `invocations` (same shape as CI) so the SAME classifier scores them.
3. **Classifier with semantic keys** (data, see 1.3). Score the resolved TOOL and subcommand, not English tokens; a hint (target name) is only a tiebreaker when the body is opaque (`./scripts/x.sh`).
4. **Preference order per key** (SDR-02): profile-declared (`STACK.md` table / `codebase/STACK.md` Commands table) > task-runner target whose body classifies to the key > CI invocation > manifest script > profile default. Record ALL candidates in `evidence` with `source` and `confidence` so the report can show conflicts (e.g. `make test` vs CI `go test -race ./...`).
5. **`draftProfile`** merges evidence to per-component candidates, then calls `stack-verify` (1.5) before emitting a `run`; unverifiable becomes `run: discover` plus a note. Return `notes[]` so `adopt report` can render low-confidence rows (`adopt.cjs:951-956` already renders them).
6. **`localDate(now)`** helper in `helpers.cjs`, used at `stack-profile.cjs:806` and `adopt.cjs:541` (STATE/ROADMAP date shares the bug). Leave other UTC sites; note them in the SUMMARY.

### 1.3 Semantic classification table (encode as data; tier-2 profiles can extend it)

Match on the normalised invocation (env prefixes, `cd x &&` removed, `sudo`/`time` stripped). Order matters; first hit wins. "form" says whether the command CHECKS or MUTATES.

| Key | Match (tool + subcommand) | Form | Notes |
|---|---|---|---|
| `audit` | `govulncheck`, `npm audit`, `pnpm audit`, `osv-scanner`, `trivy fs`, `pip-audit`, `cargo audit` | check | |
| `sast` (custom key) | `gosec`, `semgrep`, `codeql` | check | SDR-02 says gosec to `audit`; keep `audit` for dependency vulns and use `sast` for gosec unless gosec is the only one found, then `audit`. Custom keys pass the schema (`^[a-z][a-z0-9_]*$`) |
| `format` | `gofmt -l`, `gofumpt -l`, `goimports -l`, `dart format --set-exit-if-changed`, `prettier --check`, `cargo fmt --check`, `ruff format --check`, `terraform fmt -check` | check | |
| `format` (apply) | `gofmt -w`, `dart format .` (no exit flag), `prettier --write`, `cargo fmt`, `just fmt`-style targets whose body mutates | apply | put in `apply:`, never in `run:` |
| `lint` | `go vet`, `golangci-lint run`, `staticcheck`, `dart analyze`, `flutter analyze`, `eslint`, `ruff check`, `cargo clippy` | check | repo-wide |
| `lint_helm` / `lint_docker` | `helm lint`, `kubeconform`, `hadolint` | check | never the repo-wide `lint` unless it is the only lint found and no code language detected |
| `typecheck` | `tsc --noEmit`, `mypy`, `pyright` | check | |
| `test` | `go test`, `dart test`, `flutter test` (not `integration_test`), `npm test`, `jest`, `vitest`, `pytest`, `cargo test`, `ginkgo` | check | |
| `e2e` | `npx playwright test`, `cypress run`, `maestro test`, `patrol test`, `flutter test integration_test`, `flutter drive` | check | never `test` |
| `build` | `go build`, `flutter build`, `dart compile`, `npm run build`, `docker build`, `cargo build` | build | `go build ./...` preferred over `go build -o` |
| `codegen` | `go generate`, `buf generate`, `sqlc generate`, `build_runner build`, `templ generate` | mutate | `when: sources_changed` |
| `tidy` | `go mod tidy` (`-diff` = check form) | | |
| `deps` | `flutter pub get`, `dart pub get`, `npm ci`, `go mod download` | mutate | |
| `fix` | `go fix -diff` (check) / `go fix`, `dart fix --dry-run` / `--apply` | | |
| `uses:` map | `golangci/golangci-lint-action`, `golang/govulncheck-action`, `securego/gosec`, `subosito/flutter-action` (setup only), `bufbuild/buf-action`, `actions/setup-go` (setup only) | | `uses:` gives the presence of a lint/audit step but no command; use it for the REPORT, not for draft `run` |

Drop rules (SDR-02): comment, blank, bare flag, `echo`/`printf`, `test -f`/`[ ... ]` conditionals, `${{ }}`-only, control words, `git config`, `curl`, `cd`, `export`, `mkdir`, `chmod`, `gh`, `docker login`/`doctl`.

### 1.5 Per-command resolvability (SDR-03): `stack-verify.cjs`

`verifyCommand(cmd, {root, cwd, env}) -> {status, detail}`, pure IO-free core plus injected `which` and `fs`. Statuses: `resolved`, `binary_missing`, `target_missing`, `script_missing`, `unverifiable`.

| Command shape | Check |
|---|---|
| plain binary (`go`, `dart`, `flutter`, `govulncheck`…) | PATH scan in JS (there is no shared helper: `grep` found none) then `$(go env GOPATH)/bin`, `~/go/bin`, `~/.local/bin`, `~/.maestro/bin`, mise shims. Note eden-libs `justfile` uses `~/go/bin/buf` (buf is on PATH here but not every tool is) |
| `make [-C d] T` | Makefile in `d`/cwd has target `T` (static parse; include-expanded targets are `unverifiable`, not `target_missing`) |
| `task T` | Taskfile defines `T` or an alias; runner on PATH |
| `just T` | recipe exists; runner on PATH |
| `npm run S`, `npm test`, `pnpm/yarn S` | script in the package.json of cwd; the manager on PATH |
| `npx X` | `node_modules/.bin/X` or dep in package.json, else `unverifiable` (LOW) |
| `./x.sh`, `bash x.sh` | file exists (executable for `./`) |
| `go run ./cmd/x` | directory exists |
| compound (`a && b`, pipes, `$(...)`) | verify the FIRST tool and every `make/task/just/npm` token; else `unverifiable` |

A separate `--run` mode (`df-tools stack verify --run`) EXECUTES gates for SDR-08's "confirm each command runs": default set `format, lint, typecheck, build`; `test` only with `--include test` and a `timeout_s`; NEVER `codegen`, `deps`, `tidy` apply forms, servers, or anything that binds a port (8080 forbidden; tests that need Postgres, such as aocore `ci-db-backed-tests.sh`, must be skipped and noted). Output is JSON, no file writes.

**Policy.** Missing binary is machine-specific (CI-only tools). Per SDR-03, unverifiable becomes `run: discover` plus a low-confidence note, but keep the candidate text in the body HTML comment and in the report so CI-only commands are not lost. See Open Question 2.

### 1.4 Detection and components (SDR-01): `stack-detect.cjs`

`detectAreas(root) -> [{dir, kinds:[go|dart|flutter|node|rust|python|helm|docker|proto|sqlc...], evidence}]`.
- Walk depth <= 3 (aofamily has `browser/go/go.mod`, `ai/flutter/pubspec.yaml`), skipping `node_modules .git .dart_tool build vendor third_party .worktrees .planning example test_support android ios macos linux windows web`. Skip nested git worktrees.
- Areas: `go.mod` (or `go.work`), `pubspec.yaml` (Flutter iff `detectPubspecFlutter`, i.e. `sdk: flutter`), `package.json`, `Cargo.toml`, `pyproject.toml`/`requirements.txt`, `Chart.yaml`, `Dockerfile`, `buf.yaml`/`buf.gen.yaml`, `sqlc.yaml`/`sqlc.json`, `.golangci.y*ml`, `analysis_options.yaml`, `.maestro/`, `integration_test/`, `//go:generate` and generated-file headers (first 5 lines), `*.g.dart`/`*.freezed.dart`, `build_runner` in `dev_dependencies`.
- One area (the root) becomes the project's own STACK.md; two or more language areas produce `components: [{path: "go/", profile: <id or .planning/stacks/go.md>}]`. Use TRAILING SLASHES: `matchComponent` (`:275`) is a raw `startsWith`, so `go` would match `gopher/x`.
- Non-language areas (helm, docker, proto, sqlc) are NOT components; they add custom command keys (`lint_helm`, `codegen`) on the nearest language component, or root.
- Unsupported (EdenDocs is a C++/Collabora fork; trades is Tauri = package.json + `src-tauri/Cargo.toml`): emit `extends: general`, `commands` from runners only, a note, no fabricated commands.

**Extends for a component: fix in the loader (owned by the 42-05 TRD).**
1. Walk the `extends` of a component profile FILE (call `walkExtendsChain` on `parsed.frontmatter.extends`; today lines 331-338 stop after parsing). Without this a `.planning/stacks/go.md` with `extends: go` inherits nothing.
2. In `renderCommand` (or `cmdStack command`), when `resolved.component` exists, compose `cwd = path.posix.join(component.path, cmd.cwd || '')`. Today `cwd` is passthrough only (`stack-render.cjs:80`).
3. `detect` markers: to separate Dart from Flutter use an object form `detect: [{file: pubspec.yaml, contains: "sdk: flutter"}]` (schema `anyOf` string | object; `markerMatches` gains an object branch; `matchMarkersAt`/`detectMarkers`/`repo-state` must tolerate it). Safer fallback: keep `detect` strings and let `pickExtends` take a `contentProbes` map built by `stack-detect.cjs`. Recommend the object form; the planner must schema-test `flutter.md`/`dart.md` still validate (json-schema-lite tests 18b, V13, P10).

### 1.6 SDR-07 seams
- `pin: "<sha>"`: new warning `STK010` in `runValidationRules` (`:452-539`) scanning `agent_tooling.skills[].pin` on every layer; surface it in `validate.cjs` W032 (currently filtered to STK007 at `:570`, so a new code is silently dropped unless the filter widens). All three shipped profiles currently carry `<sha>` placeholders; real pins are in 2.3.
- Positional path: `cmdStack validate` reads only `--profile` (`:961-966`); any positional (`args[1]` not starting with `-`) must call `error('stack validate takes --profile <path>, not a positional path')`.
- `provenance.reviewed`: `localDate`. Note `serializeProfile` quotes it, fine.

### Recommended Project Structure
```
plugins/devflow/devflow/
├── bin/lib/
│   ├── stack-profile.cjs      # loader; bundled-tier lookup + component extends walk (language-free)
│   ├── stack-evidence.cjs     # collectEvidence composes the readers below (signature unchanged)
│   ├── stack-ci.cjs           # NEW  workflow steps
│   ├── stack-runners.cjs      # NEW  make/task/just/npm targets
│   ├── stack-detect.cjs       # NEW  areas/components (language names allowed here, alongside the 3 detectors)
│   ├── stack-verify.cjs       # NEW  resolvability + --run
│   ├── stack-report.cjs       # NEW  SDR-06 checks, data table
│   ├── stack-mcp.cjs          # NEW  .mcp.json managed entries
│   └── __fixtures__/          # add failure-shape repos
├── stack-profiles/            # NEW  shipped tier-2: go.md dart.md flutter.md (mirrored)
└── templates/stack.md         # update guidance
```
`docs/stack-profiles/` becomes a README pointer (three tests reference it today: `stack-validate.test.cjs:255`, `stack-profile.test.cjs:166`, `json-schema-lite.test.cjs:57,274`; also `references/testing-strategy.md:27`).

### Anti-Patterns to Avoid
- Naming a language in `stack-profile.cjs` or `stack-render.cjs` (P11 / C14 fail). New knowledge goes to new modules or profile data.
- Treating `uses: golangci/golangci-lint-action` as absent because there is no `run:` (aocore, aodex use the action; the current reader sees nothing).
- Letting a `fmt`/`format` target become the `run` gate when it mutates.
- Writing a draft that passes `validate` but names commands that were never resolved.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Task/just structure | a second grammar | `task --list-all --json`, `just --dump --dump-format json` when installed (verified), static regex otherwise | both emit names, aliases, bodies |
| Pubspec Flutter test | new regexp | `detectPubspecFlutter` (`flutter-ui-scope.cjs:59`) | already the shared truth |
| Gopls/dart tool lists | hard-coded copies | `gopls mcp -instructions`, `dart mcp-server --help` | vendors change monthly; profile only names flags |
| Skill installation | copying SKILL.md | `npx skills add dart-lang/skills --skill '*' --agent universal --yes`, `dart run skills@ get` | upstream-owned |
| Commits | raw git | `df-tools commit --files` | hook gate-commits blocks raw commits; commit is limited to the named pathspecs (misc.cjs:433+); no-op when `commit_docs:false` or `.planning` ignored |
| YAML for workflows | full parser | line reader (as before) | see Alternatives |

**Key insight:** every defect in the fleet dry-run is a line-classifier defect, not a data defect. Structure first (joined logical commands with cwd), semantics second (tool table), verification third (resolve, then run).

## Common Pitfalls

### Pitfall 1: Shipping tier-2 profiles through the mirror clobbers org profiles
**What goes wrong:** adding `stacks` to `SUBDIRS` (`sync-runtime.js:188`) makes `removeDir(target)` delete `~/.claude/devflow/stacks/` (user/org profiles) on every version bump.
**How to avoid:** ship in `devflow/stack-profiles/` (add `'stack-profiles'` to SUBDIRS; the drift-guard test `sync-runtime.test.js` case B FAILS for any new devflow/ subdir not in SUBDIRS, so this is enforced) and resolve `<user>/stacks/<id>.md` first, then `<lib>/../../stack-profiles/<id>.md` (bundled). Give `resolveFromParsed`/`listOrgProfiles`/`pickExtends` an injectable `bundledDir` (default the real dir, tests pass `null`) or existing tests I2-I5 (fake home with only `golike`) start matching the shipped `go` profile.
**Warning signs:** `validate health` W030 for `go` on a machine whose mirror is stale; tests that pass with a fake home now see extra profiles.

### Pitfall 2: Pure Dart gets `extends: flutter`
See 1.4 item 3. Test: Dart package with `sdk: ^3.x`, no `flutter:` dependency, must pick `dart`.

### Pitfall 3: Component profile file loses its parent (1.4 item 1) and `cwd` is never joined (item 2)

### Pitfall 4: CI `working-directory` and preconditions
aocore CI runs everything with `defaults.run.working-directory: go` (go.yml:41-42), needs `go generate ./internal/spec/...` before vet/gosec, wraps govulncheck in `../scripts/govulncheck-gate.sh`, and runs `go test -short ./... -race -coverprofile=coverage.out -timeout 5m`. A drafter that lifts `go test ./...` to the repo root is wrong there. Record `cwd` per command and mirror preconditions as a `codegen` key with `when: sources_changed`, listed before build/lint in `loop`.

### Pitfall 5: Non-fatal analyzers look like gates
eden-biz, aodex, eden-ui-flutter, aofamily run `flutter analyze --no-fatal-infos [--no-fatal-warnings]`. Keep the repo's own flag in `lint.run`, and flag it as `weak` in the report. Do not silently upgrade to `--fatal-infos`: the executor would then fail on pre-existing infos.

### Pitfall 6: `.mcp.json` server discovery and approval
Project `.mcp.json` servers require user approval and a session restart, so an agent running `adopt` in the same session as `stack mcp --write` will not see `mcp__gopls__*`. Agent-side confirmation must be best-effort: probe the tool list, fall back to shell commands.

### Pitfall 7: Duplicate Dart server
`flutter/agent-plugins` ships a Claude plugin (`.claude-plugin/plugin.json` v1.0.6) whose `mcpServers` already declares `dart-mcp-server` (`dart mcp-server`, env `AGENT_PLUGIN=claude-code`). Managed `.mcp.json` should use its own name (`dart`) but `stack mcp` should detect the plugin under `~/.claude/plugins` and skip with a note to avoid two Dart servers.

### Pitfall 8: Fleet realities
Many repos are on feature branches with dirty trees (aodex 206 files, recycling-oracle 281, justinforme 125, eden-libs 75); `justin-donnaruma-us-go` has `.planning` gitignored (`df-tools commit` returns `skipped_gitignored`); 9 repos have no `.planning/config.json` (aocore, aocyber-deploy, devcluster, eden-biz, eden-libs, eden-platform-go, justin-donnaruma-us-go, qrCodeBuilder, trades) so `loadConfig` defaults apply. `commit --files` stages only named paths, so a dirty tree is safe unless STACK.md itself is dirty.

## Code Examples

### Reproduce the defect (scratch fixture, current code)
```yaml
# .github/workflows/ci.yml
jobs: { a: { steps: [ ... ] } }
- run: |
    gosec -exclude=G304 \
      -fmt sarif ./...        # current output: format: "-fmt sarif ./..."
- run: helm lint chart/       # current: lint
- run: |
    flutter build ipa \       # current: build: "flutter build ipa \"
      --build-number="${{ inputs.buildNumber }}"   # second build entry
```
Output of `df-tools --cwd <fx> stack init`: `format: -fmt sarif ./...`, `lint: helm lint chart/`, `test: npx playwright test`, `build: flutter build ipa \`, `reviewed: 2026-09-29`.

### Verified MCP facts (run live 2026-09-28)
```jsonc
// gopls v0.22.0: `tools/list` returns exactly 8 tools
["go_diagnostics","go_file_context","go_package_api","go_rename_symbol",
 "go_search","go_symbol_references","go_vulncheck","go_workspace"]
// no go_context, so `disabled_tools: [go_context]` in go.md is stale (drop it)

// dart mcp-server 1.1.2 default tools/list (14):
// analyze_files dtd flutter_driver_command get_runtime_errors hot_reload hot_restart lsp
// pub pub_dev_search read_package_uris rip_grep_packages roots vm_service widget_inspector
// --disable flutter  -> analyze_files dtd get_runtime_errors lsp pub pub_dev_search
//                       read_package_uris rip_grep_packages roots vm_service
// --enable cli       -> adds run_tests dart_fix dart_format create_project list_devices
// --enable all       -> adds launch_app stop_app list_running_apps get_app_logs get_active_location
// flags: --enable/--disable take FEATURE names or categories (comma list), NOT Claude tool names;
//        --tools is deprecated; categories: all dart flutter analysis cli flutter_driver
//        flutter_app_lifecycle dart_tooling_daemon package_deps
```
Not documented in the upstream README (it lists neither `--enable` nor `--disable`); the `--help` of the installed binary is the only source, so store flags in profile `args` and re-verify per SDK.

### Managed `.mcp.json` entry
```json
{ "mcpServers": {
  "gopls": { "command": "gopls", "args": ["mcp"], "env": { "DEVFLOW_MANAGED": "stack" } },
  "dart":  { "command": "dart",  "args": ["mcp-server", "--enable", "cli", "--disable", "pub_dev_search"],
             "env": { "DEVFLOW_MANAGED": "stack" } } } }
```
`DEVFLOW_MANAGED` is the ownership marker (JSON has no comments); `stack mcp --write` only touches entries carrying it and never removes a foreign entry.

## 2. Tier-2 profiles

### 2.1 Install mechanism (recommendation)
Ship `plugins/devflow/devflow/stack-profiles/{go,dart,flutter}.md`; add `'stack-profiles'` to `SUBDIRS` (`sync-runtime.js:188`); loader looks in `<home>/.claude/devflow/stacks/` first (user override wins), then the bundled dir. `BUNDLED_PATH` already resolves from `__dirname` (`stack-profile.cjs:30`), so running df-tools directly from the repo (`node plugins/devflow/devflow/bin/df-tools.cjs --cwd <repo>`) works with no mirror, which matters for SDR-08 because the `~/.claude/devflow` mirror is stale (CLAUDE.md notes a pending re-mirror). `validate.cjs:550` W030 text should mention the bundled tier. Move, don't copy: two copies drift.

### 2.2 Exact fixes to the draft profiles (verified)
| File | Line(s) | Fix |
|---|---|---|
| go.md | `format:` | `gofmt -l .` exits 0 on unformatted files. Use `run: 'test -z "$(gofmt -l .)"'`, `apply: "gofmt -w {files}"` (checked: `go fix -diff` / `go mod tidy -diff` already exit non-zero, so those two stay) |
| go.md | `agent_tooling.mcp[0].disabled_tools: [go_context]` | remove (tool absent in v0.22.0); `gopls: { min: "0.21" }` still right (`go_rename_symbol`, `go_vulncheck` present) |
| go.md | skills pin `<sha>` | `JetBrains/go-modern-guidelines` @ `155dc7ca10da` (2026-09-10, Apache-2.0; layout: `.claude-plugin`, `plugin/skills`, Go CLI installed on first use). No releases/tags |
| go.md | prose "isn't shipped in core" | update: now bundled |
| dart.md | `audit: dart pub outdated` | exits 0 always and has no exit-code flag (`dart pub outdated --help` verified; no `dart pub audit` subcommand exists in 3.13.4). Set `audit: { run: none }` and add non-gating `outdated: { run: "dart pub outdated --no-transitive" }`; the report recommends an advisory scanner (osv-scanner supports `pubspec.lock`, MEDIUM, not installed here) |
| dart.md | mcp args | `args: [mcp-server, --disable, flutter, --enable, cli, --disable, pub_dev_search]`; drop `disabled_tools` (it is informational; `.mcp.json` has no per-tool filter). Verified `--disable flutter` removes `hot_*`, `widget_inspector`, `flutter_driver_command` |
| dart.md | `dart-lang/skills` pin | `0d9f1c4a0ae2` (2026-09-28); layout `skills/<name>/SKILL.md`, 14 skills (`dart-add-unit-test`, `dart-collect-coverage`, `dart-run-static-analysis`, `dart-fix-runtime-errors`, …), BSD-3; install `npx skills add dart-lang/skills --skill '*' --agent universal --yes` (to `.agents/skills`). Skill names carry a `dart-` prefix: the current Testing section says "`collect-coverage`" and "`resolve-package-conflicts`", both stale (now `dart-collect-coverage`, `dart-resolve-package-conflicts`) |
| dart.md | `package-skills` | `dart run skills@ get` verified on dart.dev (flags `-p`, `-s`, `-a`; interactive by default; writes `.agents/skills/` and `.config/dart_skills/`). Use `-a` for unattended, and never from `stack init` (network + writes) |
| flutter.md | `enabled_tools` whitelist | replace with `args: [mcp-server, --enable, cli, --disable, pub_dev_search]` (whitelist drops `dtd`, needed before `hot_reload`/`widget_inspector`; `analyze_files` is default-on; `run_tests` needs `--enable cli`). Default flutter tool set is already right |
| flutter.md | skills | `flutter/agent-plugins` @ `8da8c54ecd74` (2026-09-28); `flutter/skills` redirects to the same repo. Skills are `flutter-add-widget-test`, `flutter-build-responsive-layout`, `flutter-fix-layout-issues`, `flutter-apply-architecture-best-practices`, `flutter-add-integration-test`, … (10). The profile's names lack the `flutter-` prefix; fix in prose. Repo has `.claude-plugin`, `.codex-plugin`, `.cursor-plugin`, `skills/`, `rules/` |
| flutter.md | maestro | add `e2e: { run: "maestro test .maestro", when: ui_changed }` (only when `.maestro/` exists, so the DRAFT enables it, not the tier-2 default) and Testing prose: Maestro/Patrol flows live in `.maestro/` or `patrol_test/` |
| flutter.md | `detect: [pubspec.yaml]` | replace with the object form from 1.4 |
| all three | `reviewed: "2026-09-27"` | bump to the ship date |
| all three | `commands.build`/`objective` gates | flutter `build: flutter build web --release` is a guess; use `run: discover` and let the drafter fill from runners/CI |

### 2.3 Skills and MCP population (SDR-05, data only)
Tier-2 already carries `agent_tooling` (atomic arrays inherited via `extends`), so a draft that extends `go|dart|flutter` inherits `mcp`/`skills`; the draft repeats them only in COMPONENT files where the component's profile differs. `stack init` must not run any installer. `df-tools stack mcp` (section 5) writes only `.mcp.json`. Skill installation stays a documented manual/agent step (`npx skills add …` or `dart run skills@ get -a`).

## 3. What is installed (verified)
See the Standard Stack tools table. Consequences for the planner:
- `gopls mcp` and `dart mcp-server` both work here: the MCP integration test can spawn them (JSON-RPC over stdio, as I did) but tests must skip when the binary is absent (`t.skip`), never fail; CI runners lack them.
- `golangci-lint` is v1; staticcheck absent; ginkgo absent (dfip); pnpm/yarn absent; osv-scanner/hadolint absent. The verifier will mark these `binary_missing` on this machine.
- macOS ships Make 3.81: no `--output-sync`, no `.ONESHELL`. Do not shell out to `make -pn` for target discovery; static parse.
- Repo tests: `npm test` currently has 2 pre-existing failures in `handoff-e2e.test.cjs` (PTY mock auth; `MA-7 doctl auth` test), unrelated. `stack-*.test.cjs` + `adopt-*.test.cjs` run 198 pass / 0 fail in ~16s; run that subset per task, the full suite per wave.

## 4. Recommendations report design (SDR-06)

**Output:** `.planning/STACK-REPORT.md` (inside `.planning`, so `adopt`'s OWNED_PATHS commit picks it up automatically, `adopt.cjs:36`), plus `--raw` JSON. Frontmatter `{generated, profile, components, counts}`. Findings: `{id, severity: gap|weak|info, component, finding, evidence[], proposal, snippet?}`. Deterministic ordering, stable IDs. CLI: `df-tools stack report [--write] [--raw]`; `adopt report` links to it and adds one `medium` row per `gap`.

**Detection model.** Normalise all sources to the same invocation records: CI steps (with `file:job`, `cwd`, `uses`, `continue-on-error`, `schedule:` presence), runner target bodies (one-level expansion: CI step `make test` or `task lint` expands to the target's body, depth <= 2, cycle guard), and wrapper scripts referenced as `./scripts/x.sh`/`bash scripts/x.sh` (scan the file once for catalogue matches; aocore `govulncheck-gate.sh`, aodex `check-govulncheck.sh`). A check is `present` if any CI record matches, `local` if any runner record matches, `weak` if matched with a non-fatal marker (`--no-fatal-*`, `continue-on-error: true`, `|| true`, bare `gofmt -l`). "No local mirror" = present in CI, absent in every runner.

**Fleet baseline (18 sampled repos' workflows, grep 2026-09-28):** `go vet` 11, `-race` 9, `flutter analyze` 10 (only 1 with `--fatal-infos`, 4 `--no-fatal-infos`), `integration_test` 5, golangci-lint 3, govulncheck 2, gofmt 2, `go mod tidy` 1, `dart format` 0, maestro 0, patrol 0, hadolint 0, trivy 2, helm lint 1. Expect many `gap` rows; severity must be tuned (below) or the report is noise.

| ID | Stack | Check | Detect present (CI / runner regex) | Weak signal | Proposal | Default severity |
|---|---|---|---|---|---|---|
| GO-FMT | Go | failing format gate | `test -z "$(gofmt -l` \| `gofmt -l .* \| .*(! grep\|grep -q)` \| `gofumpt -l` \| `goimports -l` \| `golangci-lint` with `fmt`/formatters \| `git diff --exit-code` after `gofmt -w` | bare `gofmt -l` (exit 0) | `test -z "$(gofmt -l .)"` | gap |
| GO-VET | Go | vet | `go vet` | none | `go vet ./...` | gap |
| GO-LINT | Go | linter | `golangci-lint run` \| `uses: golangci/golangci-lint-action` \| `staticcheck` | `continue-on-error`, `--issues-exit-code=0` | golangci-lint when `.golangci.y*ml` exists, else `staticcheck ./...` | weak (info if `go vet` present) |
| GO-VULN | Go | vuln scan | `govulncheck` \| `uses: golang/govulncheck-action` \| gate script | no `schedule:` trigger (new CVEs need no code change) | `govulncheck ./...` + cron | gap |
| GO-RACE | Go | race detector | `go test` with `-race` | none | `go test -race ./...` (needs CGO) | gap |
| GO-COVER | Go | coverage | `-cover` \| `-coverprofile` | no threshold | `-coverprofile=coverage.out` | info |
| GO-TIDY | Go | tidy drift | `go mod tidy -diff` \| `go mod tidy` then `git diff --exit-code` | | `go mod tidy -diff` (Go >= 1.23) | weak |
| GO-FIX | Go | modernizers | `go fix -diff` | | `go fix -diff ./...` (exit non-zero on diff, verified) | info (only when `go` directive >= 1.26) |
| GO-GEN-DRIFT | Go | generated-code drift | `git diff --exit-code` after `go generate`\|`buf generate`\|`sqlc generate`\|`templ generate` (eden-biz has `proto-gen-drift.yml`, `templ-gen-drift.yml`) | | run generator then `git diff --exit-code` | gap when generator config present (`buf.yaml`, `sqlc.yaml`, `//go:generate`) |
| GO-BUF | Go/proto | proto lint+breaking | `buf lint`, `buf breaking` | | both when `buf.yaml` exists | info |
| GO-SAST | Go | SAST | `gosec` \| CodeQL | | optional | info |
| DART-ANALYZE | Dart/Flutter | fatal analyzer | `(dart\|flutter) analyze` with no `--no-fatal-warnings` (warnings are fatal by default; `--fatal-infos` opt-in, verified via `--help`) | `--no-fatal-infos`, `--no-fatal-warnings`, none | `--fatal-infos` | weak / info |
| DART-FORMAT | Dart/Flutter | failing format gate | `dart format` with `--set-exit-if-changed` (with `--output=none`) | `dart format .` alone | `dart format --output=none --set-exit-if-changed .` | gap (0/18 in fleet) |
| DART-TEST | Dart/Flutter | tests | `dart test` \| `flutter test` | | as profile | gap |
| DART-COVER | Dart/Flutter | coverage | `--coverage` | | `flutter test --coverage`; `dart test --coverage=coverage` (MEDIUM: flag verified only for `flutter test` here) | info |
| FLUT-INTEG | Flutter | integration tests | `integration_test` in CI and dir exists | dir exists, not in CI | `flutter test integration_test -d <device>` | weak |
| FLUT-MAESTRO | Flutter apps | Maestro / Patrol flows | `maestro test` \| `patrol test` in CI or runner | `.maestro/` exists but not run | when the package is an APP (has `lib/main.dart` and a platform dir `android/ios/macos/web`) and neither `.maestro/`, `patrol_test/` nor runner target exists: propose `maestro test .maestro` (maestro 2.4.0 installed here). Existing signals: torrentConsole and videoArchive have `.maestro/` | info |
| FLUT-GOLDEN | Flutter | goldens | `--exclude-tags golden`, `--update-goldens` | goldens skipped in CI (aodex) | pinned-image golden job | info |
| DART-CODEGEN | Dart | build_runner drift | `build_runner build` then `git diff --exit-code` | | when `build_runner` in dev_dependencies and generated files committed | weak |
| DART-LOCK | Dart/Flutter | locked deps | `pub get --enforce-lockfile` (flag verified) \| `flutter pub get --enforce-lockfile` | | for apps with a committed `pubspec.lock` | info |
| DART-OUTDATED | Dart/Flutter | outdated (advisory) | `pub outdated` | | non-gating; note no `dart pub audit` exists | info |
| JS-CI | JS/TS | reproducible install | `npm ci` | `npm install` | `npm ci` | weak |
| JS-AUDIT | JS/TS | dep audit | `npm audit` (`--audit-level`) \| `pnpm audit` | | `npm audit --audit-level=high` | gap |
| JS-LINT / JS-TYPE | JS/TS | eslint / tsc | `eslint`, `tsc --noEmit` | | | gap / gap |
| JS-E2E | JS/TS | e2e | `playwright test` \| `cypress run` | | | info |
| HELM-LINT | Helm | chart validity | `helm lint` + `helm template` piped to `kubeconform` | lint only | both (aocore does; kubeconform installed here) | gap when `Chart.yaml` exists |
| DOCKER-LINT | Docker | Dockerfile lint | `hadolint` | | `hadolint Dockerfile` | info |
| DOCKER-SCAN | Docker | image scan | `trivy` \| `grype` | | `trivy image` | info |
| DOCKER-PIN | Docker | pinned base | `FROM x@sha256:` | tags only | pin digests | info |
| CI-HYGIENE | any | workflow hygiene | `permissions:` block, action pins by SHA, `timeout-minutes`, `concurrency` | | | info |
| LOCAL-MIRROR | any | local target mirrors CI | CI check present and no runner target body matches it | | add `task`/`make`/`just` target named after the STACK.md key | gap when >= 1 gate exists only in CI |
| CI-MISSING | any | no CI at all | no `.github/workflows` (10 of the sampled canonical repos: torrentConsole, recycling-oracle, navigators, justinforme, quanta-local, videoArchive has 1, …) | | propose baseline workflow per detected stack | info |

Encode this as a plain array of `{id, stack, appliesWhen(areas), ci: RegExp[], local: RegExp[], weak: RegExp[], proposal, severity}` in `stack-report.cjs`; the checks live as data so a tier-2 profile can later add rows. Snippets are short command lines, never workflow YAML edits.

## 5. Agent-side confirmation (SDR-05)

**Who drafts.** `adopt`: `skills/adopt/SKILL.md` runs `workflows/adopt.md`; step `map` follows `map-codebase.md`, then `scaffold` (`adopt.cjs:552+`) writes STACK.md unattended via `initProfile`. `map-codebase.md`'s own `draft_stack_profile` step (:252-266) is skipped in adopt (:36). The codebase-mapper `tech` agent (`agents/codebase-mapper.md`, tools `Read, Bash, Grep, Glob, Write`) only DESCRIBES; it records commands in `codebase/STACK.md` `## Commands` (:99). So both drafters are the orchestrating agent (the session running the skill), not a sub-agent.

**Recommended flow (deterministic CLI first, MCP second):**
1. CLI: `stack init --write` (new drafter) then `stack verify` then `stack report --write`. All deterministic; no MCP.
2. New workflow step `confirm_stack_profile` in `adopt.md` (after `scaffold`, before `health`) and in `map-codebase.md` after `draft_stack_profile`. Instruction to the orchestrator: if `mcp__gopls__go_workspace` (or `mcp__dart__roots`) is available (ToolSearch), then
   - Go: `go_workspace` (module layout must match the drafted components), `go_vulncheck` (confirms the `audit` key is meaningful), `go_diagnostics` on 1-2 files (confirms build/lint viability).
   - Dart/Flutter: `roots`/`add_roots` for the project dir, `analyze_files` (baseline of errors vs the drafted analyze flags), `run_tests` only if the server was started with `--enable cli`.
   - Otherwise fall back to `stack verify --run` (shell). Record the result as `medium`/`low` rows in ADOPT-REPORT; never edit STACK.md silently; corrections go to the report.
3. `df-tools stack mcp [--write] [--raw]`: pure function of the resolved profile: for each `agent_tooling.mcp[]` entry produce a `.mcp.json` server, skip entries whose `command` binary is absent (report it), skip when the `dart-flutter` plugin already declares one (Pitfall 7). `--write` merges into the project `.mcp.json` touching only entries with `env.DEVFLOW_MANAGED` (create if absent). Run it from `stack init --write` only when `--mcp` is passed (writing `.mcp.json` in a fleet repo is a separate, reviewable change) and from an `upgrade` migration `0008` (auto only if `.mcp.json` is absent or already managed; otherwise `confirm`), plus `validate health` W-check for a managed server whose binary is missing.
4. Tool grants: add `mcp__gopls__*`, `mcp__dart__*` to `executor`, `verifier`, `debugger` `tools:` (`agents/executor.md:5`, `verifier.md:4`, `debugger.md:5`) and to `allowed-tools` in `skills/adopt` and `skills/map-codebase`. Names are `mcp__<server>__<tool>` for project-scope servers (the plugin-scoped `mcp__plugin_<plugin>_<server>__` form applies only to servers a plugin declares; packs Q12). Drop unused `mcp__context7__*` (project-researcher, objective-researcher, planner) only in a separate cleanup task, since researchers actually use it.

MCP confirmation is therefore an agent-prompt/workflow concern (testable by the `adopt-skill-contract` style tests that assert workflow text and allowed-tools), while every byte written by the CLI is deterministic and unit-testable.

## 6. Survey of real repos (read-only)

### 6.1 The twelve named repos
| Repo | Layout / manifests | Runners | CI | Notes |
|---|---|---|---|---|
| aocore | `go/` (go.mod, .golangci.yml, lance-sidecar Cargo), `admin/` (Flutter), `portal/` (Flutter), `helm/*` (Chart.yaml), `sdk/python`, `dev/devedge` (go.mod); no root manifest | none at root | 11 workflows; `defaults.run.working-directory: go`; gosec, govulncheck gate script, golangci-lint action v6, helm-validate, playwright, `-race -coverprofile` | the canonical multi-component + `uses:` + cwd case. Branch `df/saas-wave2`, 22 dirty. No `.planning/config.json` |
| eden-biz | root `buf.yaml`; `go/` (sqlc.yaml, Makefile: test/build/generate/buf-generate/templ), `flutter/` (Makefile: analyze/test/build-web/ui-tests), `api-dart/` (pure Dart), `mobile/`, `pos/`; `.worktrees/` inside | 3 Makefiles (`make -C go test`) | 14 workflows; flutter analyze `--no-fatal-*`; drift workflows; `flutter build ipa \` with `${{ }}` (the fragment shape) | `.worktrees/` must be skipped. Pure Dart `api-dart/` must NOT be `flutter`. 10 dirty |
| aodex | `go/` (Makefile, sqlc.yaml under `go/sql`, .golangci.yml), `flutter/` (+ e2e package.json), `proto/`, `desktop/` | `go/Makefile` (test, openapi-verify, several `check-*`) | 7 workflows; script gates `scripts/check-*.sh`, govulncheck self-test, trivy | 206 dirty; `\` continuation truncation site |
| devflow (Go repo, not devflow-claude) | root go.mod, `vendor/`; `cmd internal pkg scripts` | none | go.yml: `go vet ./...`, `gofmt`, `gopls version | head -1` | the comment-as-`test` site. `vendor/` must be skipped for scans |
| aoinference | `control-plane/` (go.mod, Makefile: generate/manifests/drift-check/build/vet/test/lint), `helm/*` x4, `load-test/requirements.txt`, terraform, training | control-plane Makefile | 1 workflow (release.yml: `echo "Published …"` shape) | Makefile has lint/vet/test but release CI has none: the drafter must prefer the Makefile |
| eden-circle | root go.mod, `buf.yaml`, `sqlc.yaml`, `client/` (Dart), Makefile (proto sqlc migrate seed run build test) | root Makefile | ci.yml: `go build`, `go vet`, `go test -race` | `test -f x \|\| {` control fragment; single `pubspec` in `client/` |
| politihub | `go/` (Makefile), `flutter/`, `flutter-navigators/`, `third_party/executor_lib` (skip), `go/cloudflare-email-worker` (package.json) | go/Makefile | 8 workflows; `sed -i 's|…|…|'` rewrite steps, `build_runner` | `sed` pipes contain `|`: the command splitter must not split on `|` inside quotes |
| aostudio | docs only (`docs/research`, `docs/poc`), `.playwright-mcp/` | none | none | nothing to draft: `extends: general`, empty commands is CORRECT. Must not emit an error; emit an info note |
| AOSignal | empty repo (only `.planning`, `.gitignore`) | none | none | same as aostudio |
| devcluster | shell/python: `bin/*.sh` (build, test, verify, deploy, doctor, up), `lib/*.py`, `tools/devproxy/go.mod` | none (scripts are the interface) | none | manifest-less. Optional heuristic: `bin/test.sh`, `bin/build.sh`, `bin/verify.sh` as `./bin/<name>.sh` candidates (verified by file existence). No config.json |
| eden-libs | 20+ modules at depth 1: Go (`eden-platform-go` with buf/sqlc, `eden-cli`, `eden-docs`, `eden-web`), pure Dart (`eden-doc-crdt`, `eden-doc-model`, `eden-loro`, `*-api-dart`), Flutter (`eden-platform-flutter`, `eden-ui-flutter`, `eden-experience-flutter`) | root `justfile`: setup/generate/fmt(mutating)/test/lint with `(cd X && …)` bodies and `~/go/bin/buf` | 4 workflows | root runner exists but is a subshell fan-out: draft ROOT `just test`/`just lint` and `apply: just fmt` (no check), components for each module with their own commands. 75 dirty |
| dfip | root go.mod (sslip fork), Makefile: build test lint run docker, `Docker/*` | Makefile | 5 workflows: `HOME=/root ginkgo -r -p` | `ginkgo` missing locally; env-prefixed commands; clean tree (best first rollout candidate) |

### 6.2 Other shapes found in the fleet (drive fixtures)
- torrentConsole, videoArchive, qrCodeBuilder: root `pubspec.yaml` only, no CI, no runner: the fix is manifest + tier-2 defaults (`flutter test`, `flutter analyze`), plus `.maestro/` (torrentConsole, videoArchive) for `e2e`.
- recycling-oracle: `recycling-oracle-go/`, `recycling-oracle-flutter/`, `pi-agent/` + `pipeline/` (pyproject): 4 areas; python has no tier-2, so `general` + discover.
- aofamily: products nested to depth 3 (`browser/go`, `ai/flutter`, `billing/go`, `theme/`): needs the depth-3 walk.
- trades: `package.json` + `src-tauri/Cargo.toml` (Tauri). EdenDocs: C++ (Collabora): unsupported, do not draft.
- Taskfile: only `ao-terminal`, `waveterm` (fork), `aoCyberSecurity/aopentest` (Taskfile names contain `:`, `--list-all --json` verified on ao-terminal); justfiles: eden-libs, aoid, navigators, aoid-household.

### 6.3 SDR-08 candidate list (canonical = `.git` is a DIRECTORY; worktrees have a `.git` FILE, which is a reliable filter)
Canonical repos with `.planning`: ao-terminal, aocore, aocyber-deploy, aodex, aoedge, aofamily, aoid, aoinference, AOSignal, aostudio, devcluster, devflow-claude (already has STACK.md; skip), devflow-test, devflow, devflowops, dfip, eden-biz, eden-circle, eden-libs, eden-platform-go, eden-press, eden-ui-flutter, EdenDocs, github-enterprise-migration, justin-donnaruma-us-go (GITIGNORED `.planning`: blocked, cannot commit), justinforme, navigators, opsCluster, politihub, qrCodeBuilder, quanta-local, recycling-oracle, smartWellness, torrentConsole, trades, videoArchive. Worktrees to skip (`.git` file): aocore-627, aodex-{clean,desktop,obj56,prodtest,wbfix}, aoedge-main, aoid-household, aoid-plans, eden-biz-{103,autotrial}. Nested `.planning` dirs (opsCluster/control-plane, aoCyberSecurity/*, aodex-clean/{go,flutter}, aocore-wave-*/N) are components/other, not rollout targets. Current branches are mostly NOT main (e.g. `df/saas-wave2`, `fix/ci-listtile-material`, `df/riverpod3-bump`, `obj-36-initstate-audit`): the runbook must print the branch and dirty count per repo and require explicit skip decisions for repos whose branch is a feature branch under active work.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `dart mcp-server --tools all|dart` | `--enable` / `--disable` on feature names | server 1.1.2 (Dart 3.13) | `--tools` deprecated; profile args must be rewritten |
| Flutter monolithic rules.md | `flutter/agent-plugins` skills + plugin (`dart-flutter` 1.0.6) | 2026 | plugin already ships the Dart MCP config; avoid duplicate server |
| Dart skill names `collect-coverage` | `dart-collect-coverage` etc. | dart-lang/skills current main | profile prose stale |
| `go_context` in gopls MCP | removed/not listed | gopls v0.22.0 | drop from go.md |
| `flutter/skills` repo | redirects to `flutter/agent-plugins` (same SHA) | 2026 | use the canonical name |
| `gofmt -l` as a gate | `test -z "$(gofmt -l .)"` or golangci-lint fmt | always | fixes a never-failing gate |

**Deprecated/outdated:** `disabled_tools`/`enabled_tools` as a mechanism for the dart server (it filters features via flags, not Claude tool names); `dart pub outdated` as an audit gate.

## Open Questions

1. **`detect` object form vs side-channel probes**
   - What we know: schema allows `anyOf`; `markerMatches` ignores non-strings.
   - What is unclear: whether three other callers (`repo-state.cjs:88-89,214-215`, `init.cjs:1035`) should learn content predicates.
   - Recommendation: object form for `flutter.md` only, `markerMatches` handles it, other callers just reuse `matchMarkersAt` (they already go through it).
2. **Missing binary policy (SDR-03 vs CI-only tools)**
   - `target_missing`/`script_missing` mean the command is wrong: `discover`. `binary_missing` may just mean this machine lacks the tool.
   - Recommendation: literal SDR-03 (`discover`) for all three, but record the candidate string in the body comment and report. Revisit if the fleet dry-run shows too many downgrades (gosec, ginkgo, hadolint cases).
3. **Where should low-confidence notes live?** Schema has no field and `serializeProfile` cannot emit YAML comments. Recommend the body HTML comment plus STACK-REPORT `info` rows plus `draft.notes[]`; no schema change.
4. **`stack mcp --write` on fleet repos:** writing a repo-level `.mcp.json` is intrusive. Recommend NOT running it in SDR-08 by default; the fleet gets STACK.md + STACK-REPORT.md only, MCP is opt-in per repo.
5. **`policy.telemetry: off` mapping.** `dart --suppress-analytics` exists as a global flag (verified in `dart --help`), but I did not verify it applies to `mcp-server`; gopls telemetry is a `go telemetry` toggle, not a per-server env. Leave `.mcp.json` env free of telemetry claims until verified (LOW).
6. **Node/Rust/Python/Tauri tier-2 profiles.** Out of SDR-04. Without them these areas stay `general` + runner-derived commands. Trades (Tauri) and recycling-oracle (python) are the fleet cases.
7. **Whether `stack verify --run` belongs in the CLI** or in a rollout script. Recommendation: CLI (`stack verify [--run] [--include test]`), because SDR-08 and adopt both need it and it is unit-testable with fixtures.
8. **`dart test --coverage=<dir>`** could not be confirmed on this machine (help not printed outside a package). MEDIUM; verify in a fixture package during implementation.

## Sources

### Primary (HIGH confidence)
- Repo source read with line refs: `stack-profile.cjs`, `stack-evidence.cjs`, `stack-render.cjs`, `adopt.cjs`, `sync-runtime.js`, `validate.cjs`, `misc.cjs` (`cmdCommit`), `stack-*.test.cjs`, `__fixtures__/stack-profile-fixtures.cjs`, `schemas/stack-profile.schema.json`, `templates/stack.md`, `references/stack-general.md`, `workflows/adopt.md`, `workflows/map-codebase.md`, `agents/*.md` tool lines.
- Live probes 2026-09-28: `gopls mcp` `tools/list` (v0.22.0), `dart mcp-server` `tools/list` with `--disable flutter`, `--enable cli`, `--enable all` (1.1.2), `dart mcp-server --help`, `go help fix|mod tidy`, `dart pub --help`, `dart pub outdated --help`, `dart analyze --help`, `dart format --help`, `flutter pub get --help`, `task --list-all --json`, `just --dump --dump-format json`, tool inventory with `command -v`.
- `gh api`: dart-lang/skills HEAD `0d9f1c4a0ae2`, flutter/agent-plugins HEAD `8da8c54ecd74`, JetBrains/go-modern-guidelines HEAD `155dc7ca10da` (Apache-2.0), flutter/agent-plugins `.claude-plugin/plugin.json` (mcpServers).
- https://dart.dev/ai/package-skills (`dart run skills@ get`, flags, `.agents/skills/`).
- https://github.com/dart-lang/skills, https://github.com/flutter/agent-plugins (layout, skill names).

### Secondary (MEDIUM confidence)
- https://github.com/dart-lang/ai/blob/main/pkgs/dart_mcp_server/README.md: tool table with "Enabled: No" defaults; it does NOT document `--enable/--disable`, so flag semantics come from the installed binary's `--help` and live behaviour.
- Fleet grep counts (18 repos' `.github/workflows`), CI file reads for aocore/eden-biz/aodex/politihub/eden-circle.
- docs/PROPOSAL-stack-profile.md (5.1, 6, 7, 8) and PROPOSAL-stack-packs.md (6.12, Q5, Q12).

### Tertiary (LOW confidence)
- osv-scanner pub support, `dart test --coverage=<dir>`, `--suppress-analytics` for mcp-server: not verified here.

## Metadata

**Confidence breakdown:**
- Standard stack / seams: HIGH: read at line level and reproduced the defects.
- MCP and upstream facts: HIGH for gopls/dart tool lists and flags (live), MEDIUM for docs coverage.
- Report catalogue: MEDIUM: flags verified for Go/Dart, JS/Docker/Helm rows from experience plus fleet greps.
- Rollout mechanics: MEDIUM: repo states change daily.

**Research date:** 2026-09-28
**Valid until:** 2026-10-05 for MCP/skill SHAs and tool lists (fast moving; re-pin at ship time); 30 days for code seams.

## 7. Recommended TRD / wave breakdown

Constraints for every TRD: TDD (tests first, fixtures modelled on failure shapes, `no_llm_test_data` style hand-built repos via `makeRepo`/`makeProject`), run `node --test plugins/devflow/devflow/bin/lib/stack-*.test.cjs plugins/devflow/devflow/bin/lib/adopt-*.test.cjs` per task and `npm test` per wave (2 known unrelated `handoff-e2e` failures), P11/C14 neutrality preserved, never port 8080, no push/release, no version bump (release is a user action).

| Wave | TRD | Scope | Files owned | Reqs |
|---|---|---|---|---|
| 0 | 42-01 | Validation fixes: `STK010` pin warning (+ validate.cjs W032 widen), reject positional path, `localDate` helper used by draft and `adopt.cjs:541`. Quick, independent | stack-profile.cjs (validate + cmd + date only), validate.cjs, helpers.cjs, adopt.cjs (1 line), tests | SDR-07 |
| 0 | 42-02 | Tier-2 shipping: move + fix go/dart/flutter into `devflow/stack-profiles/` with real pins and verified MCP args; add to `SUBDIRS`; loader bundled-tier lookup with injectable `bundledDir`; repoint 3 tests + testing-strategy.md; docs pointer | stack-profile.cjs (resolve/list only), sync-runtime.js, profiles, 3 tests | SDR-04, part of SDR-05 |
| 1 | 42-03 | `stack-ci.cjs`: structured workflow steps (join, filter, cwd, `uses`), classifier table, failure-shape fixtures | stack-ci.cjs, classifier data, tests | SDR-02 |
| 1 | 42-04 | `stack-runners.cjs`: Make/Task/just/npm bodies, `make -C`, optional exec enrichment, apply-vs-check form, preference order | stack-runners.cjs, tests | SDR-02 |
| 1 | 42-05 | `stack-detect.cjs` + loader work: areas depth<=3, Flutter-vs-Dart (`detect` object form), `pickExtends` content probes, component profile `extends` walk, `cwd` join, trailing-slash paths | stack-detect.cjs, stack-profile.cjs (components), stack-render.cjs (cwd), schema, tests | SDR-01 |
| 2 | 42-06 | `stack-verify.cjs` (resolvability, `--run`, safe-key policy) and `stack verify` CLI | stack-verify.cjs, cmdStack, tests | SDR-03 |
| 2 | 42-07 | Drafter integration: `collectEvidence` composes 03/04, `draftProfile` per-area + verify + `discover` + `notes[]`, `serializeProfile` components; adopt scaffold/report use it (evidence keys, low rows); e2e tests on the failure fixtures | stack-evidence.cjs, stack-profile.cjs (draft/init), adopt.cjs, tests | SDR-01/02/03 |
| 3 | 42-08 | `stack-report.cjs` catalogue + `stack report [--write]`, adopt links; fixtures per check row | stack-report.cjs, CLI, adopt report hook, tests | SDR-06 |
| 3 | 42-09 | `stack-mcp.cjs` + `stack mcp [--write]`, migration `0008`, `validate health` missing-binary check, agent `tools:` grants, `confirm_stack_profile` workflow steps (adopt.md, map-codebase.md), skill `allowed-tools`, contract tests | stack-mcp.cjs, migrations/0008, validate.cjs, agents/*.md, workflows | SDR-05 |
| 4 | 42-10 | Docs: CLAUDE.md "Where we left off" cleared and adopt/stack bullet updated, `templates/stack.md`, PROPOSAL cross-refs, CHANGELOG Unreleased | docs only | all |
| 5 | 42-11 | Fleet rollout (operational, checkpointed): dry-run every canonical repo from the checkout (`--cwd`), review table, then per repo `stack init --write`, `stack verify --run` (safe keys), `stack report --write`, `commit --files`; skip worktrees, list dirty/gitignored/non-main blockers; never push. Output `42-ROLLOUT.md` table (repo, branch, dirty, action, result) | none in plugin (script under `scripts/` optional) | SDR-08 |

Sequencing rationale: 01 and 02 are independent and small (02 unblocks tests that select `go|dart|flutter`); 03/04/05 touch disjoint files so they run in parallel (05 alone owns `stack-profile.cjs` component code in this wave); 06 needs the command shapes from 03/04; 07 integrates; 08 and 09 are independent of each other but need 07's draft; rollout last, run against the checkout code, not the stale mirror.
