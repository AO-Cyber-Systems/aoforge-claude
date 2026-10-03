# 43-ROLLOUT — fleet `stack verify --run` (TRD 43-07)

## Header

- Date: 2026-10-03 (survey taken 2026-10-03T16:56Z)
- Branch: `feat/stack-profile-loader` at `b8bf755d` (devflow-claude, WAVE_BASE)
- Runtime mirror: `~/.claude/devflow` re-synced from this checkout with `DEVFLOW_SKIP_GLOBAL_UPGRADE=1` (`sync-runtime: same version 2.12.0, content changed; re-mirroring`). Version `2.12.0`, digest `sha256:f6a61ba45d32e3ea167cdd198201d8d75c57161f9096329a849e98d01d449981`. `cmp` exit 0 for `stack-verify.cjs`, `stack-draft.cjs`, `stack-evidence.cjs` and `stack-runners.cjs` (checkout vs mirror).
- Mode: **Task 1 (run plan) and Task 3 (approved gates run, results recorded) are done; Task 2 (approval) is recorded below.** Run plan and Approval sections are as committed before any gate ran. Results, Dry-run drift and Summary were added by Task 3.
- D10 (binding): results are recorded in this file only. Nothing is written, committed, staged or stashed in any fleet repo.
- Supersedes: the resolve-only rows of `42-ROLLOUT.md` for 30 repos, and re-opens its three `--run` rows (ao-terminal, aodex, aoedge) because they ran before the D8 effect guard existed.

### How the plan was surveyed (all read-only)

- Per repo: existence, branch, HEAD, `git status --porcelain=v1 -uall` line count, and a STATIC `stack verify` through the mirror's `df-tools --cwd <repo>` (JSON, no `--run`). Git ran with `GIT_OPTIONAL_LOCKS=0` and only `rev-parse`, `status` and `hash-object` (no `-w`).
- Policy preview: the mirror's `verifyStack({ run: true })` called with a NO-OP `spawn`. Every verdict below (key policy, deny and skip scans, cwd containment, `flutter --no-pub` rewrite, package-config check, effect-guard halts) is therefore the exact one a real `--run` applies, and no gate command was executed. Run twice per repo: default keys, and with every opt-in key included (so the opt-in column shows what `--include` would add).
- Read-only proof: a signature of each repo (the porcelain bytes plus a content hash of every listed path) was taken before and after the whole survey. **All 33 signatures are identical and every HEAD is unchanged.**
- Port 8080: the run policy denies any command or runner-target body that names it, and this plan never uses it. The policy cannot see a test source that binds it, so a text scan of test sources is shown in the notes column.

## Run plan

Columns. `dirty` = `git status --porcelain=v1 -uall` lines now (42 recorded smaller numbers for aocore, aodex, justinforme, recycling-oracle and others). `HEAD` = 12-char prefix; Task 3 checks it is unchanged after the runs. `default gates` = format, lint, typecheck and build items the preview says WOULD spawn, as `key@component: command (cwd)`; a Flutter `analyze` or `test` shows the `--no-pub` text the runner executes. ~~Struck~~ = the preview refuses it, with the reason. `opt-in candidates` = test, e2e, audit, sast, lint_helm and lint_docker items as they would run if their key were included. Nothing in that column runs unless the human approves it. `proposed --include` is `none` for every repo (the TRD default).

| repo | branch | HEAD | dirty | default gates (key@component: command, cwd) | opt-in candidates | proposed --include | notes |
|---|---|---|---|---|---|---|---|
| ao-terminal | ao-main | `ff97b2ea8f41` | 1 | lint: `go vet ./...` (cwd .)<br>format: `test -z "$(gofmt -l .)"` (cwd .)<br>~~build~~ skipped: unverifiable-body<br>~~typecheck~~ skipped: unverifiable-body | test: `go test ./...` (cwd .)<br>audit: `govulncheck ./...` (cwd .) | none | 42 ran --run: lint=1 format=1 (pre-existing red), no delta; 8080 appears in 2 test file(s); not run by policy: fix, codegen, tidy, deps, test_frontend, bootstrap |
| aocore | df/110-developer-console | `62ea74b9b43b` | 137 | build: `go build ./...` (cwd go)<br>lint: `golangci-lint run ./...` (cwd go)<br>lint@admin/: `flutter analyze --fatal-infos --no-pub` (cwd admin)<br>format@admin/: `dart format --output=none --set-exit-if-changed .` (cwd admin)<br>build@dev/devedge/: `go build ./...` (cwd dev/devedge)<br>lint@dev/devedge/: `go vet ./...` (cwd dev/devedge)<br>format@dev/devedge/: `test -z "$(gofmt -l .)"` (cwd dev/devedge)<br>build@go/: `go build ./...` (cwd go)<br>lint@go/: `go vet ./...` (cwd go)<br>format@go/: `test -z "$(gofmt -l .)"` (cwd go)<br>lint@portal/: `flutter analyze --fatal-infos --no-pub` (cwd portal)<br>format@portal/: `dart format --output=none --set-exit-if-changed .` (cwd portal) | test: `go test -short -race ./... -timeout 5m` (cwd go)<br>audit: `govulncheck ./...` (cwd go)<br>test@admin/: `flutter test --no-pub` (cwd admin)<br>test@dev/devedge/: `go test -race ./...` (cwd dev/devedge)<br>audit@dev/devedge/: `govulncheck ./...` (cwd dev/devedge)<br>test@go/: `go test -race ./...` (cwd go)<br>audit@go/: `govulncheck ./...` (cwd go)<br>test@portal/: `flutter test --no-pub` (cwd portal) | none | 42: the flutter lint gate rewrote analysis_options.yaml and bumped pubspec.lock here (the case D8 guards); 8080 appears in 14 test file(s); not run by policy: codegen, helm_lint, portal_codegen, fix, outdated, deps, integration, golden, tidy |
| aodex | fix/ci-listtile-material | `0db281387e6c` | 257 | build: `make build` (cwd go)<br>lint@flutter/: `flutter analyze --fatal-infos --no-pub` (cwd flutter)<br>format@flutter/: `dart format --output=none --set-exit-if-changed .` (cwd flutter)<br>build@go/: `go build ./...` (cwd go)<br>lint@go/: `go vet ./...` (cwd go)<br>format@go/: `test -z "$(gofmt -l .)"` (cwd go) | test: `make test` (cwd go)<br>test@flutter/: `flutter test --no-pub` (cwd flutter)<br>test@go/: `go test -race ./...` (cwd go)<br>audit@go/: `govulncheck ./...` (cwd go) | none | 42 ran --run: build=0, flutter lint=1 format=1, go build=0 lint=0 format=1, no delta; 8080 appears in 13 test file(s); not run by policy: codegen, guards, fix, outdated, deps, integration, golden, tidy |
| aoedge | fix/strip-inbound-aoid-trust-headers | `bedacb4dfeb3` | 1 | build: `make build-fips` (cwd .)<br>lint: `make lint` (cwd .)<br>format: `test -z "$(gofmt -l .)"` (cwd .) | test: `make test` (cwd .)<br>audit: `govulncheck ./...` (cwd .) | none | 42 ran --run: build=0 lint=0 format=1 (pre-existing red), no delta; 8080 appears in 1 test file(s); not run by policy: fix, codegen, tidy, acceptance |
| aofamily | df/riverpod3-rebase | `94fb09086f51` | 4 | lint@ai/flutter/: `flutter analyze --fatal-infos --no-pub` (cwd ai/flutter)<br>format@ai/flutter/: `dart format --output=none --set-exit-if-changed .` (cwd ai/flutter)<br>build@ai/go/: `go build ./...` (cwd ai/go)<br>lint@ai/go/: `go vet ./...` (cwd ai/go)<br>format@ai/go/: `test -z "$(gofmt -l .)"` (cwd ai/go)<br>build@billing/go/: `go build ./...` (cwd billing/go)<br>lint@billing/go/: `go vet ./...` (cwd billing/go)<br>format@billing/go/: `test -z "$(gofmt -l .)"` (cwd billing/go)<br>lint@browser/flutter/: `flutter analyze --fatal-infos --no-pub` (cwd browser/flutter)<br>format@browser/flutter/: `dart format --output=none --set-exit-if-changed .` (cwd browser/flutter)<br>build@browser/go/: `go build ./...` (cwd browser/go)<br>lint@browser/go/: `go vet ./...` (cwd browser/go)<br>format@browser/go/: `test -z "$(gofmt -l .)"` (cwd browser/go)<br>lint@connect/flutter/: `flutter analyze --fatal-infos --no-pub` (cwd connect/flutter)<br>format@connect/flutter/: `dart format --output=none --set-exit-if-changed .` (cwd connect/flutter)<br>build@connect/go/: `go build ./...` (cwd connect/go)<br>lint@connect/go/: `go vet ./...` (cwd connect/go)<br>format@connect/go/: `test -z "$(gofmt -l .)"` (cwd connect/go)<br>lint@theme/: `flutter analyze --fatal-infos --no-pub` (cwd theme)<br>format@theme/: `dart format --output=none --set-exit-if-changed .` (cwd theme) | test: `go test ./...` (cwd .)<br>test@ai/flutter/: `flutter test --no-pub` (cwd ai/flutter)<br>test@ai/go/: `go test -race ./...` (cwd ai/go)<br>audit@ai/go/: `govulncheck ./...` (cwd ai/go)<br>test@billing/go/: `go test -race ./...` (cwd billing/go)<br>audit@billing/go/: `govulncheck ./...` (cwd billing/go)<br>test@browser/flutter/: `flutter test --no-pub` (cwd browser/flutter)<br>test@browser/go/: `go test -race ./...` (cwd browser/go)<br>audit@browser/go/: `govulncheck ./...` (cwd browser/go)<br>test@connect/flutter/: `flutter test --no-pub` (cwd connect/flutter)<br>test@connect/go/: `go test -race ./...` (cwd connect/go)<br>audit@connect/go/: `govulncheck ./...` (cwd connect/go)<br>test@theme/: `flutter test --no-pub` (cwd theme) | none | 42: same flutter lint mutation as aocore; 8080 appears in 1 test file(s); not run by policy: fix, codegen, outdated, deps, integration, golden, tidy |
| aoid | main | `1def47413b6c` | 76 | build: `go build ./...` (cwd .)<br>lint: `go vet ./...` (cwd .)<br>format: `test -z "$(gofmt -l .)"` (cwd .)<br>lint@portal/: `flutter analyze --fatal-infos --no-pub` (cwd portal)<br>format@portal/: `dart format --output=none --set-exit-if-changed .` (cwd portal) | audit: `govulncheck ./...` (cwd .)<br>test@portal/: `flutter test --no-pub` (cwd portal)<br>~~test~~ skipped: unverifiable-body | none | 42: same flutter lint mutation as aocore; 8080 appears in 1 test file(s); not run by policy: fix, codegen, tidy, deps, outdated, integration, golden |
| aoinference | fix/obj31-oci-source-label | `c9f1bdccc2da` | 3 | build: `go build ./...` (cwd control-plane)<br>lint: `make lint` (cwd control-plane)<br>format: `test -z "$(gofmt -l .)"` (cwd control-plane) | test: `make test` (cwd control-plane)<br>audit: `govulncheck ./...` (cwd control-plane) | none | 8080 appears in 1 test file(s); not run by policy: fix, codegen, tidy |
| AOSignal | main | `37ccb12cf30f` | 1 | - | - | none | no commands drafted: nothing to run; no 8080 in test sources |
| aostudio | main | `7dd81bdc89b7` | 4 | - | - | none | no commands drafted: nothing to run; no 8080 in test sources |
| devcluster | main | `e038d4b7f62a` | 11 | lint: `shellcheck bin/*.sh lib/*.sh t0-conformance/*.sh` (cwd .)<br>build@tools/devproxy/: `go build ./...` (cwd tools/devproxy)<br>lint@tools/devproxy/: `go vet ./...` (cwd tools/devproxy)<br>format@tools/devproxy/: `test -z "$(gofmt -l .)"` (cwd tools/devproxy) | test@tools/devproxy/: `go test -race ./...` (cwd tools/devproxy)<br>audit@tools/devproxy/: `govulncheck ./...` (cwd tools/devproxy)<br>~~test~~ skipped: body:port-8080-forbidden | none | 8080 appears in 3 test file(s); not run by policy: cluster_test, fix, codegen, tidy |
| devflow | main | `36a8eb11ae0f` | 2 | build: `go build ./...` (cwd .)<br>lint: `go vet ./...` (cwd .)<br>format: `test -z "$(gofmt -l .)"` (cwd .) | test: `go test ./...` (cwd .)<br>audit: `govulncheck ./...` (cwd .) | none | 8080 appears in 1 test file(s); not run by policy: fix, codegen, tidy |
| devflow-test | main | `3baa599b39bc` | 3 | - | - | none | no commands drafted: nothing to run; no 8080 in test sources |
| devflowops | main | `0083c974c6ff` | 2 | lint@flutter/: `flutter analyze --fatal-infos --no-pub` (cwd flutter)<br>format@flutter/: `dart format --output=none --set-exit-if-changed .` (cwd flutter)<br>~~build~~ skipped: unverifiable-body<br>~~lint~~ skipped: unverifiable-body<br>~~format~~ skipped: unverifiable-body | audit: `make security-check` (cwd .)<br>test@flutter/: `flutter test --no-pub` (cwd flutter)<br>~~test~~ skipped: unverifiable-body<br>~~e2e~~ skipped: unverifiable-body | none | 8080 appears in 2 test file(s); not run by policy: fix, codegen, tidy, deps, outdated, integration, golden |
| dfip | main | `ffcff7d12360` | 0 | build: `make build` (cwd .)<br>lint: `go vet ./...` (cwd .)<br>format: `test -z "$(gofmt -l .)"` (cwd .) | test: `make test` (cwd .)<br>audit: `govulncheck ./...` (cwd .) | none | no 8080 in test sources; not run by policy: fix, codegen, tidy |
| eden-biz | main | `e6756547ba77` | 13 | lint@api-dart/: `dart analyze --fatal-infos` (cwd api-dart)<br>format@api-dart/: `dart format --output=none --set-exit-if-changed .` (cwd api-dart)<br>lint@flutter/: `flutter analyze --fatal-infos --no-pub` (cwd flutter)<br>format@flutter/: `dart format --output=none --set-exit-if-changed .` (cwd flutter)<br>build@go/: `go build ./...` (cwd go)<br>lint@go/: `go vet ./...` (cwd go)<br>format@go/: `test -z "$(gofmt -l .)"` (cwd go)<br>lint@mobile/: `flutter analyze --fatal-infos --no-pub` (cwd mobile)<br>format@mobile/: `dart format --output=none --set-exit-if-changed .` (cwd mobile)<br>lint@pos/: `flutter analyze --fatal-infos --no-pub` (cwd pos)<br>format@pos/: `dart format --output=none --set-exit-if-changed .` (cwd pos)<br>~~build~~ skipped: unverifiable-body | test: `make test` (cwd go)<br>test@api-dart/: `dart test` (cwd api-dart)<br>test@flutter/: `flutter test --no-pub` (cwd flutter)<br>test@go/: `go test -race ./...` (cwd go)<br>audit@go/: `govulncheck ./...` (cwd go)<br>test@mobile/: `flutter test --no-pub` (cwd mobile)<br>test@pos/: `flutter test --no-pub` (cwd pos) | none | 8080 appears in 124 test file(s); not run by policy: codegen, e2e_env, fix, outdated, deps, integration, golden, tidy |
| eden-circle | obj-36-initstate-audit | `25c2cfa45097` | 36 | build: `make build` (cwd .)<br>lint: `go vet ./...` (cwd .)<br>format: `test -z "$(gofmt -l .)"` (cwd .)<br>lint@client/: `flutter analyze --fatal-infos --no-pub` (cwd client)<br>format@client/: `dart format --output=none --set-exit-if-changed .` (cwd client) | test: `make test` (cwd .)<br>audit: `govulncheck ./...` (cwd .)<br>test@client/: `flutter test --no-pub` (cwd client) | none | no 8080 in test sources; not run by policy: fix, codegen, tidy, outdated, deps, integration, golden |
| eden-libs | main | `d321277288c9` | 77 | build: `just build-flutter-explorer` (cwd .)<br>lint: `just lint` (cwd .)<br>build@eden-cli/: `go build ./...` (cwd eden-cli)<br>lint@eden-cli/: `go vet ./...` (cwd eden-cli)<br>format@eden-cli/: `test -z "$(gofmt -l .)"` (cwd eden-cli)<br>lint@eden-doc-crdt/: `dart analyze --fatal-infos` (cwd eden-doc-crdt)<br>format@eden-doc-crdt/: `dart format --output=none --set-exit-if-changed .` (cwd eden-doc-crdt)<br>lint@eden-doc-model/: `dart analyze --fatal-infos` (cwd eden-doc-model)<br>format@eden-doc-model/: `dart format --output=none --set-exit-if-changed .` (cwd eden-doc-model)<br>lint@eden-doc-render/: `flutter analyze --fatal-infos --no-pub` (cwd eden-doc-render)<br>format@eden-doc-render/: `dart format --output=none --set-exit-if-changed .` (cwd eden-doc-render)<br>build@eden-docs/: `go build ./...` (cwd eden-docs)<br>lint@eden-docs/: `go vet ./...` (cwd eden-docs)<br>format@eden-docs/: `test -z "$(gofmt -l .)"` (cwd eden-docs)<br>lint@eden-experience-api-dart/: `dart analyze --fatal-infos` (cwd eden-experience-api-dart)<br>format@eden-experience-api-dart/: `dart format --output=none --set-exit-if-changed .` (cwd eden-experience-api-dart)<br>lint@eden-experience-flutter/: `flutter analyze --fatal-infos --no-pub` (cwd eden-experience-flutter)<br>format@eden-experience-flutter/: `dart format --output=none --set-exit-if-changed .` (cwd eden-experience-flutter)<br>lint@eden-justinforme-api-dart/: `dart analyze --fatal-infos` (cwd eden-justinforme-api-dart)<br>format@eden-justinforme-api-dart/: `dart format --output=none --set-exit-if-changed .` (cwd eden-justinforme-api-dart)<br>lint@eden-loro/: `dart analyze --fatal-infos` (cwd eden-loro)<br>format@eden-loro/: `dart format --output=none --set-exit-if-changed .` (cwd eden-loro)<br>lint@eden-loro/example_mobile/: `flutter analyze --fatal-infos --no-pub` (cwd eden-loro/example_mobile)<br>format@eden-loro/example_mobile/: `dart format --output=none --set-exit-if-changed .` (cwd eden-loro/example_mobile)<br>lint@eden-platform-api-dart/: `dart analyze --fatal-infos` (cwd eden-platform-api-dart)<br>format@eden-platform-api-dart/: `dart format --output=none --set-exit-if-changed .` (cwd eden-platform-api-dart)<br>lint@eden-smartwellness-api-dart/: `dart analyze --fatal-infos` (cwd eden-smartwellness-api-dart)<br>format@eden-smartwellness-api-dart/: `dart format --output=none --set-exit-if-changed .` (cwd eden-smartwellness-api-dart)<br>lint@eden-ui-docs/: `flutter analyze --fatal-infos --no-pub` (cwd eden-ui-docs)<br>format@eden-ui-docs/: `dart format --output=none --set-exit-if-changed .` (cwd eden-ui-docs)<br>build@eden-web/: `go build ./...` (cwd eden-web)<br>lint@eden-web/: `go vet ./...` (cwd eden-web)<br>format@eden-web/: `test -z "$(gofmt -l .)"` (cwd eden-web) | test: `just test` (cwd .)<br>test@eden-cli/: `go test -race ./...` (cwd eden-cli)<br>audit@eden-cli/: `govulncheck ./...` (cwd eden-cli)<br>test@eden-doc-crdt/: `dart test` (cwd eden-doc-crdt)<br>test@eden-doc-model/: `dart test` (cwd eden-doc-model)<br>test@eden-doc-render/: `flutter test --no-pub` (cwd eden-doc-render)<br>test@eden-docs/: `go test -race ./...` (cwd eden-docs)<br>audit@eden-docs/: `govulncheck ./...` (cwd eden-docs)<br>test@eden-experience-api-dart/: `dart test` (cwd eden-experience-api-dart)<br>test@eden-experience-flutter/: `flutter test --no-pub` (cwd eden-experience-flutter)<br>test@eden-justinforme-api-dart/: `dart test` (cwd eden-justinforme-api-dart)<br>test@eden-loro/: `dart test` (cwd eden-loro)<br>test@eden-loro/example_mobile/: `flutter test --no-pub` (cwd eden-loro/example_mobile)<br>test@eden-platform-api-dart/: `dart test` (cwd eden-platform-api-dart)<br>test@eden-smartwellness-api-dart/: `dart test` (cwd eden-smartwellness-api-dart)<br>test@eden-ui-docs/: `flutter test --no-pub` (cwd eden-ui-docs)<br>test@eden-web/: `go test -race ./...` (cwd eden-web)<br>audit@eden-web/: `govulncheck ./...` (cwd eden-web) | none | 8080 appears in 4 test file(s); not run by policy: codegen, deps, fix, tidy, outdated, integration, golden |
| eden-platform-go | fix/cf-email-retry-on-throttle | `0326e888ccfe` | 19 | build: `go build ./cmd/aoid` (cwd .)<br>lint: `go vet ./...` (cwd .)<br>format: `test -z "$(gofmt -l .)"` (cwd .) | test: `go test ./... -v -race` (cwd .)<br>audit: `govulncheck ./...` (cwd .) | none | 8080 appears in 1 test file(s); not run by policy: fix, codegen, tidy |
| eden-press | main | `40e4c9ea414f` | 4 | build: `go build ./...` (cwd .)<br>lint: `go vet ./...` (cwd .)<br>format: `test -z "$(gofmt -l .)"` (cwd .)<br>lint@bind/dart/: `flutter analyze --fatal-infos --no-pub` (cwd bind/dart)<br>format@bind/dart/: `dart format --output=none --set-exit-if-changed .` (cwd bind/dart) | test: `make test` (cwd .)<br>audit: `govulncheck ./...` (cwd .)<br>test@bind/dart/: `flutter test --no-pub` (cwd bind/dart) | none | 8080 appears in 3 test file(s); not run by policy: fix, codegen, tidy, outdated, deps, integration, golden |
| eden-ui-flutter | main | `f8b04879d2b9` | 2 | lint: `flutter analyze --no-fatal-infos --no-pub` (cwd .)<br>format: `dart format --output=none --set-exit-if-changed .` (cwd .)<br>~~build~~ skipped: unverifiable-body | test: `flutter test --no-pub` (cwd .)<br>e2e: `maestro test .maestro` (cwd .) | none | 8080 appears in 1 test file(s); not run by policy: fix, codegen, outdated, deps, integration, golden |
| EdenDocs | eden-main | `50e3b4496459` | 4 | build@wopi-host/: `go build ./...` (cwd wopi-host)<br>lint@wopi-host/: `go vet ./...` (cwd wopi-host)<br>format@wopi-host/: `test -z "$(gofmt -l .)"` (cwd wopi-host)<br>~~build~~ skipped: unverifiable-body | test@wopi-host/: `go test -race ./...` (cwd wopi-host)<br>audit@wopi-host/: `govulncheck ./...` (cwd wopi-host)<br>~~e2e~~ skipped: body:container-run | none | no 8080 in test sources; not run by policy: smoke, branding, fix, codegen, tidy |
| github-enterprise-migration | main | `93e316264e03` | 2 | - | - | none | no commands drafted: nothing to run; no 8080 in test sources |
| justinforme | df/riverpod3-bump | `e4305601c406` | 585 | build: `make build` (cwd .)<br>lint: `go vet ./...` (cwd .)<br>format: `test -z "$(gofmt -l .)"` (cwd .)<br>lint@flutter/admin/: `flutter analyze --fatal-infos --no-pub` (cwd flutter/admin)<br>format@flutter/admin/: `dart format --output=none --set-exit-if-changed .` (cwd flutter/admin)<br>lint@flutter/volunteer/: `flutter analyze --fatal-infos --no-pub` (cwd flutter/volunteer)<br>format@flutter/volunteer/: `dart format --output=none --set-exit-if-changed .` (cwd flutter/volunteer) | test: `make test` (cwd .)<br>audit: `govulncheck ./...` (cwd .)<br>test@flutter/admin/: `flutter test --no-pub` (cwd flutter/admin)<br>test@flutter/volunteer/: `flutter test --no-pub` (cwd flutter/volunteer) | none | 8080 appears in 7 test file(s); not run by policy: fix, codegen, tidy, deps, outdated, integration, golden |
| navigators | df/riverpod3-bump | `c3a82748f306` | 54 | lint@navigators-flutter/: `flutter analyze --fatal-infos --no-pub` (cwd navigators-flutter)<br>format@navigators-flutter/: `dart format --output=none --set-exit-if-changed .` (cwd navigators-flutter)<br>build@navigators-go/: `go build ./...` (cwd navigators-go)<br>lint@navigators-go/: `go vet ./...` (cwd navigators-go)<br>format@navigators-go/: `test -z "$(gofmt -l .)"` (cwd navigators-go) | test: `just test-go` (cwd .)<br>e2e: `maestro test .maestro` (cwd .)<br>test@navigators-flutter/: `flutter test --no-pub` (cwd navigators-flutter)<br>test@navigators-go/: `go test -race ./...` (cwd navigators-go)<br>audit@navigators-go/: `govulncheck ./...` (cwd navigators-go) | none | no 8080 in test sources; not run by policy: codegen, sqlc, fix, outdated, deps, integration, golden, tidy |
| opsCluster | main | `a547076a0dae` | 8 | build: `go build ./...` (cwd control-plane)<br>lint: `go vet ./...` (cwd control-plane)<br>format: `test -z "$(gofmt -l .)"` (cwd control-plane) | test: `go test -p 1 ./... -race` (cwd control-plane)<br>audit: `govulncheck ./...` (cwd control-plane) | none | 8080 appears in 3 test file(s); not run by policy: fix, codegen, tidy, deps |
| politihub | main | `686cb0b82a9f` | 6 | build: `make build` (cwd go)<br>lint@flutter-navigators/: `flutter analyze --fatal-infos --no-pub` (cwd flutter-navigators)<br>format@flutter-navigators/: `dart format --output=none --set-exit-if-changed .` (cwd flutter-navigators)<br>lint@flutter/: `flutter analyze --fatal-infos --no-pub` (cwd flutter)<br>format@flutter/: `dart format --output=none --set-exit-if-changed .` (cwd flutter)<br>build@go/: `go build ./...` (cwd go)<br>lint@go/: `go vet ./...` (cwd go)<br>format@go/: `test -z "$(gofmt -l .)"` (cwd go) | test: `make test` (cwd go)<br>test@flutter-navigators/: `flutter test --no-pub` (cwd flutter-navigators)<br>test@flutter/: `flutter test --no-pub` (cwd flutter)<br>test@go/: `go test -race ./...` (cwd go)<br>audit@go/: `govulncheck ./...` (cwd go) | none | 8080 appears in 8 test file(s); not run by policy: fix, codegen, outdated, deps, integration, golden, tidy |
| qrCodeBuilder | main | `e55991bbb12b` | 4 | lint: `flutter analyze --no-pub` (cwd .)<br>format: `dart format --output=none --set-exit-if-changed .` (cwd .) | test: `flutter test --no-pub` (cwd .) | none | no 8080 in test sources; not run by policy: fix, codegen, outdated, deps, integration, golden |
| quanta-local | main | `3b9e5d34be0f` | 0 | ~~build~~ skipped: body:container-build | - | none | no default gate would run; no 8080 in test sources; not run by policy: preflight, verify |
| recycling-oracle | main | `78190b8a6abb` | 428 | lint@recycling-oracle-flutter/: `flutter analyze --fatal-infos --no-pub` (cwd recycling-oracle-flutter)<br>format@recycling-oracle-flutter/: `dart format --output=none --set-exit-if-changed .` (cwd recycling-oracle-flutter)<br>build@recycling-oracle-go/: `go build ./...` (cwd recycling-oracle-go)<br>lint@recycling-oracle-go/: `go vet ./...` (cwd recycling-oracle-go)<br>format@recycling-oracle-go/: `test -z "$(gofmt -l .)"` (cwd recycling-oracle-go) | test@recycling-oracle-flutter/: `flutter test --no-pub` (cwd recycling-oracle-flutter)<br>test@recycling-oracle-go/: `go test -race ./...` (cwd recycling-oracle-go)<br>audit@recycling-oracle-go/: `govulncheck ./...` (cwd recycling-oracle-go) | none | no 8080 in test sources; not run by policy: fix, codegen, outdated, deps, integration, golden, tidy |
| smartWellness | df/riverpod3-bump | `23271c475cab` | 4 | build: `make build` (cwd .)<br>lint: `go vet ./...` (cwd .)<br>format: `test -z "$(gofmt -l .)"` (cwd .)<br>lint@flutter/admin/: `flutter analyze --fatal-infos --no-pub` (cwd flutter/admin)<br>format@flutter/admin/: `dart format --output=none --set-exit-if-changed .` (cwd flutter/admin) | test: `make test` (cwd .)<br>audit: `govulncheck ./...` (cwd .)<br>test@flutter/admin/: `flutter test --no-pub` (cwd flutter/admin) | none | no 8080 in test sources; not run by policy: fix, codegen, tidy, deps, outdated, integration, golden |
| torrentConsole | main | `3aca26f7f354` | 0 | lint: `flutter analyze --fatal-infos --no-pub` (cwd .)<br>format: `dart format --output=none --set-exit-if-changed .` (cwd .) | test: `flutter test --no-pub` (cwd .)<br>e2e: `maestro test .maestro` (cwd .) | none | no 8080 in test sources; not run by policy: fix, codegen, outdated, deps, integration, golden |
| trades | main | `1c9ba00c0232` | 0 | build: `npm run build` (cwd .) | test: `npx vitest --run` (cwd .)<br>audit: `npm run audit:chunks` (cwd .)<br>e2e: `npm run test:e2e` (cwd .) | none | no 8080 in test sources; not run by policy: codegen, deps |
| videoArchive | main | `61f039d04dc1` | 24 | build: `flutter build ios --release --no-codesign` (cwd .)<br>lint: `flutter analyze --no-pub` (cwd .)<br>format: `dart format --output=none --set-exit-if-changed .` (cwd .) | test: `flutter test --no-pub` (cwd .)<br>e2e: `maestro test .maestro` (cwd .) | none | no 8080 in test sources; not run by policy: fix, codegen, outdated, deps, integration, golden |

### Totals (default keys, no `--include`)

- Repos in the plan: 33 of 33 present, none `absent`. 28 have at least one default gate that would run. 4 have no drafted commands and nothing to run: AOSignal, aostudio, devflow-test, github-enterprise-migration. 1 (quanta-local) has a default gate, but it is a `docker build` the policy skips as `container-build`, so nothing runs there either.
- Default gates that would run: 166 (lint 68, format 65, build 33, typecheck 0). Refused by policy before spawning: 9. Eight are `unverifiable-body` (the runner target's body cannot be read statically): ao-terminal build and typecheck, devflowops root build, lint and format, eden-biz build, eden-ui-flutter build, EdenDocs build. One is `container-build` (quanta-local build).
- Opt-in items that would run if every opt-in key were included: 108 (test 72 across 28 repos, audit 31 across 24 repos, e2e 5 across 5 repos). Refused by policy: 5 (aoid test, devflowops test and e2e: `unverifiable-body`; devcluster test: `body:port-8080-forbidden`; EdenDocs e2e: `body:container-run`).
- Never run, whatever is approved: `codegen`, `deps`, `*.apply` forms, `e2e_env`, anything not in the default or opt-in sets, and any command naming a deploy, push, release or port 8080.
- Each gate is capped at 300 s (`--timeout` overrides). A slow gate is recorded as `timeout`, and the batch continues.

### Not in the plan

| repo | why |
|---|---|
| aocyber-deploy | skipped in 42 by user decision (PoC / reference-only) |
| devflow-claude | this repository (`self`); its own gates are the validation gates of this TRD |
| justin-donnaruma-us-go | blocked in 42 (`stack-files-gitignored`); D10 says this TRD does not clear it |
| other `~/dev/*` clones and worktrees | not among the 33 committed fleet repos (aocore-wave-*, aodex-*, aoedge-*, eden-biz-* ...) |

### Gates worth a second look before approving

1. **videoArchive `build`: `flutter build ios --release --no-codesign`** is a default gate. It is a full iOS release build: slow against the 300 s cap, runs CocoaPods, and may rewrite `ios/` files. A mutation is restored by the guard but halts the repo's remaining Flutter gates (`side-effect-unsafe`). Option: `--keys lint,format` for this repo.
2. **eden-libs `build`: `just build-flutter-explorer`** runs `flutter build web` then `flutter test tool/emit_flutter_manifest.dart`, which emits a file. If it mutates, the guard restores it and then skips the remaining Flutter/Dart gates under this root. That root has 33 default gates, so eden-libs is also the longest run. Option: `--keys lint,format`.
3. **aocore, aofamily, aoid**: their `flutter analyze --fatal-infos` gate is the one that rewrote `analysis_options.yaml` and bumped `pubspec.lock` in 42. This run is the first live test of the D8 guard on them. Expect `mutated` with `restored: true` at worst. A surviving delta stops the rollout.
4. **Large dirty trees**: justinforme 585, recycling-oracle 428, aodex 257, aocore 137. The guard hashes every dirty file around each gate, so these runs are slower, and the Task 3 harness snapshot will be large. Dirty state is never cleaned up here.
5. **e2e keys** (`maestro test .maestro` in eden-ui-flutter, navigators, torrentConsole, videoArchive; `npm run test:e2e` in trades) need a device or browser and a stack. Not recommended even if `test` is opted in.
6. **`audit` (`govulncheck ./...`)** is read-only but fetches the vulnerability database over the network.
7. **`test` and port 8080.** The run policy refuses 8080 in a command or runner body, but cannot see a test source that binds it. 8080 appears in test sources of 18 repos (ao-terminal 2, aocore 14, aodex 13, aoedge 1, aofamily 1, aoid 1, aoinference 1, devcluster 3, devflow 1, devflowops 2, eden-biz 124, eden-libs 4, eden-platform-go 1, eden-press 3, eden-ui-flutter 1, justinforme 7, opsCluster 3, politihub 8). Most are likely URL string fixtures, but a text match cannot tell a fixture from a bind. Treat those 18 as not safe to opt in without a decision.

### Proposed `--include`

Default: **none** for every repo (the table). If the human wants test evidence, the candidates whose test sources do not mention 8080 and whose `test` item the preview says would run are: dfip, eden-circle, EdenDocs (wopi-host), navigators, qrCodeBuilder, recycling-oracle, smartWellness, torrentConsole, trades, videoArchive. Syntax per repo: `stack verify --run --include test`. This is a heuristic (a text scan, not proof), and a suite may still need local services.

## HAND_ONLY acceptance

43-06 kept `devcluster.build` and `aocore.portal_codegen` (the two the user confirmed). It proposes **ten more** author-named, non-canonical keys, each needing a yes or no. The drafter emits the canonical keys around each of them. A table test asserts that HAND_ONLY never covers a canonical key beyond `devcluster.build`.

| Shape.key | Override value | Why no general rule derives it |
|---|---|---|
| ao-terminal.test_frontend | `npx vitest --run` | The root node frontend's suite sits beside the Go root's `test`. The drafter emits one `test` and notes the off-stack one. The key name is the author's split. |
| ao-terminal.bootstrap | `task init` | A one-shot setup that only calls internal tasks. No gate for a classifier to read. |
| aodex.guards | `make check-… check-… check-…` | One CI step runs several boundary checks. Both the grouping and the key name are the author's. |
| aoedge.acceptance | `make acceptance` | Scenario suites against a live edge: a non-repo-wide test (an alternate note), named after the target. |
| devcluster.cluster_test | `./bin/test.sh` | Asserts a live cluster, so an `env_unnamed` note, never `test`. |
| EdenDocs.smoke | `./scripts/eden/smoke-test.sh` | Single-purpose: a narrow note under test. |
| EdenDocs.branding | `./scripts/eden/verify-branding.sh` | Runs no gate a classifier reads. |
| navigators.sqlc | `just sqlc` | A second codegen recipe. The drafter emits one `codegen` (`just generate`). |
| quanta-local.preflight | `make preflight` | Host checks no classifier reads. Key is the target name. |
| quanta-local.verify | `make verify` | Needs the environment up (a compose run): noted, never `test`. |

Also from 43-06 (informational, no decision): KEY_ALIASES `helm_lint` to `lint_helm` (aocore); EXTRA_ALLOWED is empty.

**Modelling assumption to confirm (43-06 deviation 5): devcluster's offline gate.** The devcluster override lists only `bin/build.sh` and `bin/test.sh` as sources. A drafter cannot derive `test: bash t0-conformance/selftest.sh` and `lint: shellcheck …` without some evidence, so the golden fixture models them as coming from an offline CI workflow (shellcheck plus the self-test), the gate the override comment calls "the offline gate". The override's sources do not list that workflow. If the real repo has no such workflow, those two keys depend on the real evidence shape. Confirm the model, or say it should be changed.

Live cross-check from this survey: devcluster's committed STACK.md currently resolves `lint: shellcheck bin/*.sh lib/*.sh t0-conformance/*.sh` at the root (a default gate that would run), and its root `test` is refused as `body:port-8080-forbidden`.

## Approval

Recorded before any gate ran. The user approved this decision in chat on 2026-10-03. The reply, verbatim:

> Option: approve-edited
> - Every repo in the run plan runs default keys only (format, lint, typecheck, build).
> - These two repos are limited to `--keys lint,format`:
>   - videoArchive, to avoid the full iOS release build
>   - eden-libs, to avoid the manifest-emitting `flutter build web`
> - `--include test` only for: dfip, eden-circle, EdenDocs (wopi-host), qrCodeBuilder, smartWellness, trades. These have no 8080 in their test sources. Every other repo gets no `--include`.
> - No audit runs, and no e2e runs anywhere.
>
> HAND_ONLY: accept all 10 additions:
> - ao-terminal.test_frontend
> - ao-terminal.bootstrap
> - aodex.guards
> - aoedge.acceptance
> - devcluster.cluster_test
> - EdenDocs.smoke
> - EdenDocs.branding
> - navigators.sqlc
> - quanta-local.preflight
> - quanta-local.verify
>
> devcluster modelling assumption: REJECTED as stated. A read-only check found that the real devcluster has no `.github/workflows`. `shellcheck` appears there only as `# shellcheck` directives, and `selftest.sh` appears only in README/DEVELOPING prose. A real-repo `stack init` today drafts `build: ./bin/build.sh` and `test: ./bin/test.sh`, the live-cluster script, and no `lint`.
>
> The user chose remedy (a): add an offline CI workflow to devcluster that runs shellcheck and the selftest. The orchestrator does this AFTER Task 3, because Task 3 pins HEADs. In Task 3's `## Dry-run drift` table, report devcluster honestly as drift: test and lint differ, so it needs a hand-fix today. Note the reason "pending remedy (a): devcluster CI workflow, follow-up after 43-07". Do not count it as a match.


**Revised 2026-10-03, after Task 3 (user reply: "c").** Remedy (a) was withdrawn before anything was written to devcluster, for two reasons. First, `t0-conformance/selftest.sh` copies manifests out of a separate gitops checkout (`config/apps.yaml` -> `.gitops.path`) and needs `yq`, so a CI runner cannot run it offline. Second, devcluster has staged work in progress on `main`. The user chose remedy (c): devcluster stays a known hand-fix row (`lint`, `test`), and no change is made to the repo.

### Effective run list (derived from the reply, applied in plan order)

| Group | Repos | Invocation |
|---|---|---|
| `--keys lint,format` | videoArchive, eden-libs | `stack verify --run --keys lint,format --raw` |
| default keys plus `--include test` | dfip, eden-circle, EdenDocs, qrCodeBuilder, smartWellness, trades | `stack verify --run --include test --raw` |
| default keys only | every other repo in the plan with a gate that would run (ao-terminal, aocore, aodex, aoedge, aofamily, aoid, aoinference, devcluster, devflow, devflowops, eden-biz, eden-platform-go, eden-press, eden-ui-flutter, justinforme, navigators, opsCluster, politihub, quanta-local, recycling-oracle, torrentConsole) | `stack verify --run --raw` |
| nothing to run, dry-run drift only | AOSignal, aostudio, devflow-test, github-enterprise-migration | static `stack verify`, `stack init` dry run |

Never run, whatever the list: audit, e2e, e2e_env, codegen, deps, `*.apply` forms, deploy, push, release, port 8080. Each gate is capped at 300 s.

### HAND_ONLY outcome

All 10 additions accepted. The `devcluster` modelling assumption in 43-06 deviation 5 is rejected, so a devcluster row is never counted as a `match` for `test` or `lint` (see the drift table).

### Mirror state at approval (deviation from the Task 1 record)

When this continuation started, the runtime mirror no longer matched the checkout: `~/.claude/devflow/.plugin-digest` read `sha256:eee82d8c94188cde89adfd492d3a46903dd72497c9ff54a5c655c1e1ffcc525f` (not the `f6a61ba4...` Task 1 recorded), `cmp` differed for `stack-verify.cjs`, `stack-draft.cjs`, `stack-evidence.cjs`, `stack-runners.cjs` and `df-tools.cjs`, and the mirror's `stack-verify.cjs` had **no effect guard** (0 occurrences of `restored`, 18 in the checkout). Something re-mirrored an older bundle after Task 1; the cause was not investigated. No gate was run on that mirror. The TRD's own Task 1 sync command was re-run (`CLAUDE_PLUGIN_ROOT=<checkout>/plugins/devflow DEVFLOW_SKIP_GLOBAL_UPGRADE=1 node <checkout>/plugins/devflow/hooks/sync-runtime.js`), after which `cmp` exits 0 for all five files and the digest is `sha256:f6a61ba45d32e3ea167cdd198201d8d75c57161f9096329a849e98d01d449981`, equal to the Task 1 record. Task 3 re-checks the mirror against the checkout before every repo and stops if it drifts again.

## Results

Run window 2026-10-03T17:41:28Z to 17:52:22Z (gate time 642 s across 32 repos), branch `feat/stack-profile-loader`, through the runtime mirror (`~/.claude/devflow`, digest `sha256:f6a61ba4...`). The mirror was compared with the checkout (six files plus the digest) before every repo, and no check failed.

**Invocations** are the approved ones: `--keys lint,format` for videoArchive and eden-libs; `--include test` for dfip, eden-circle, EdenDocs, qrCodeBuilder, smartWellness, trades; default keys for every other repo. No audit, e2e, e2e_env, codegen, deps, apply, deploy or port-8080 command ran; the run policy refused none of them because none was selected.

**Method.** One sequential driver script (see Deviations in the SUMMARY), one repo at a time, in Run plan order. Per repo: the mirror check, then `git rev-parse HEAD` against the pinned prefix (a mismatch skips the repo), then the harness snapshot (`git status --porcelain=v1 -z -uall` bytes plus the permission bits and content hash of every listed path), then `df-tools --cwd <repo> stack verify --run [flags]` (JSON mode, so every gate carries its exit code, duration and any `mutated` record), then the snapshot again and a diff, then the `stack init` dry run (no `--write`), then a final snapshot and diff. A surviving delta or a guard `restored: false` would have stopped the rollout. Neither happened.

**Reading the table.** `key=exit (seconds)`. `skipped` lists what the policy or the effect guard refused; `+N items outside the approved key set` counts the items this run did not select (opt-in keys that were not approved, never-run keys such as fix, tidy, codegen and deps, and keys with no command). `[cause]` on a red gate says why it is red, judged from the last 600 bytes of its output: `repo state` is what the tool says about the repository; `host toolchain` is this machine's toolchain failing; `deps not installed` is a missing `node_modules` or package config. A host or deps cause means the gate says nothing about the repository.

| repo | invocation | gates run (key=exit, duration) | skipped (key: reason) | mutated (paths, restored) | harness delta | gate-red notes |
|---|---|---|---|---|---|---|
| ao-terminal | default | lint=1 (1.9s)<br>format=1 (0.4s) | build: unverifiable-body<br>typecheck: unverifiable-body<br>+8 items outside the approved key set | - | none | lint exit 1 [repo state]: ../../go/pkg/mod/google.golang.org/grpc@v1.80.0/internal/transport/handler_server.go:271:18: undefined: htt...<br>format exit 1 [repo state]: no output |
| aocore | default | build=1 (4.2s)<br>lint=3 (0.1s)<br>lint@admin/=0 (7.3s)<br>format@admin/=1 (0.6s)<br>build@dev/devedge/=0 (0.3s)<br>lint@dev/devedge/=0 (0.1s)<br>format@dev/devedge/=0 (0.0s)<br>build@go/=1 (2.6s)<br>lint@go/=0 (2.0s)<br>format@go/=1 (0.2s)<br>lint@portal/=1 (2.5s)<br>format@portal/=1 (0.1s) | +36 items outside the approved key set | - | none | build exit 1 [host toolchain]: clang: error: linker command failed with exit code 1 (use -v to see invocation)<br>lint exit 3 [host toolchain]: Failed executing command with error: can't load config: the Go language version (go1.26) used to build gola...<br>format@admin/ exit 1 [repo state]: Formatted 404 files (299 changed) in 0.50 seconds.<br>build@go/ exit 1 [host toolchain]: clang: error: linker command failed with exit code 1 (use -v to see invocation)<br>format@go/ exit 1 [repo state]: no output<br>lint@portal/ exit 1 [repo state]: 17 issues found. (ran in 2.0s)<br>format@portal/ exit 1 [repo state]: Formatted 22 files (13 changed) in 0.02 seconds. |
| aodex | default | build=0 (3.4s)<br>lint@flutter/=1 (6.9s)<br>format@flutter/=1 (2.1s)<br>build@go/=0 (1.7s)<br>lint@go/=0 (1.0s)<br>format@go/=1 (0.1s) | +22 items outside the approved key set | - | none | lint@flutter/ exit 1 [repo state]: 97 issues found. (ran in 6.5s)<br>format@flutter/ exit 1 [repo state]: Formatted 1256 files (787 changed) in 2.03 seconds.<br>format@go/ exit 1 [repo state]: no output |
| aoedge | default | build=2 (2.8s)<br>lint=0 (0.8s)<br>format=1 (0.0s) | +7 items outside the approved key set | - | none | build exit 2 [host toolchain]: make: *** [build-fips] Error 1<br>format exit 1 [repo state]: no output |
| aofamily | default | lint@ai/flutter/=1 (3.2s)<br>format@ai/flutter/=1 (0.2s)<br>build@ai/go/=0 (1.0s)<br>lint@ai/go/=0 (0.4s)<br>format@ai/go/=1 (0.0s)<br>build@billing/go/=0 (0.6s)<br>lint@billing/go/=0 (0.2s)<br>format@billing/go/=1 (0.0s)<br>lint@browser/flutter/=1 (3.3s)<br>format@browser/flutter/=1 (0.2s)<br>build@browser/go/=0 (0.5s)<br>lint@browser/go/=0 (0.2s)<br>format@browser/go/=1 (0.0s)<br>lint@connect/flutter/=1 (3.0s)<br>format@connect/flutter/=1 (0.3s)<br>build@connect/go/=0 (0.6s)<br>lint@connect/go/=0 (0.3s)<br>format@connect/go/=1 (0.0s)<br>lint@theme/=0 (2.6s)<br>format@theme/=1 (0.1s) | +60 items outside the approved key set | - | none | lint@ai/flutter/ exit 1 [repo state]: 22 issues found. (ran in 2.8s)<br>format@ai/flutter/ exit 1 [repo state]: Formatted 92 files (64 changed) in 0.10 seconds.<br>format@ai/go/ exit 1 [repo state]: no output<br>format@billing/go/ exit 1 [repo state]: no output<br>lint@browser/flutter/ exit 1 [repo state]: 45 issues found. (ran in 2.8s)<br>format@browser/flutter/ exit 1 [repo state]: Formatted 82 files (53 changed) in 0.12 seconds.<br>format@browser/go/ exit 1 [repo state]: no output<br>lint@connect/flutter/ exit 1 [repo state]: 10 issues found. (ran in 2.5s)<br>format@connect/flutter/ exit 1 [repo state]: Formatted 105 files (66 changed) in 0.18 seconds.<br>format@connect/go/ exit 1 [repo state]: no output<br>format@theme/ exit 1 [repo state]: Formatted 5 files (4 changed) in 0.01 seconds. |
| aoid | default | build=1 (2.3s)<br>lint=0 (0.8s)<br>format=1 (1.1s)<br>lint@portal/=1 (3.5s)<br>format@portal/=1 (0.2s) | +16 items outside the approved key set | - | none | build exit 1 [host toolchain]: clang: error: linker command failed with exit code 1 (use -v to see invocation)<br>format exit 1 [repo state]: no output<br>lint@portal/ exit 1 [repo state]: 4 issues found. (ran in 3.0s)<br>format@portal/ exit 1 [repo state]: Formatted 87 files (54 changed) in 0.12 seconds. |
| aoinference | default | build=1 (2.4s)<br>lint=2 (2.9s)<br>format=1 (0.0s) | +6 items outside the approved key set | - | none | build exit 1 [host toolchain]: clang: error: linker command failed with exit code 1 (use -v to see invocation)<br>lint exit 2 [repo state]: make: *** [lint] Error 1<br>format exit 1 [repo state]: no output |
| AOSignal | default | - | +8 items outside the approved key set | - | none | no gate ran (every item skipped) |
| aostudio | default | - | +8 items outside the approved key set | - | none | no gate ran (every item skipped) |
| devcluster | default | lint=1 (3.4s)<br>build@tools/devproxy/=1 (0.6s)<br>lint@tools/devproxy/=0 (0.3s)<br>format@tools/devproxy/=0 (0.0s) | +13 items outside the approved key set | - | none | lint exit 1 [repo state]: https://www.shellcheck.net/wiki/SC2097 -- This assignment is only seen by t...<br>build@tools/devproxy/ exit 1 [host toolchain]: clang: error: linker command failed with exit code 1 (use -v to see invocation) |
| devflow | default | build=0 (2.3s)<br>lint=0 (1.0s)<br>format=1 (0.2s) | +6 items outside the approved key set | - | none | format exit 1 [repo state]: no output |
| devflow-test | default | - | +8 items outside the approved key set | - | none | no gate ran (every item skipped) |
| devflowops | default | lint@flutter/=1 (5.3s)<br>format@flutter/=1 (1.0s) | build: unverifiable-body<br>lint: unverifiable-body<br>format: unverifiable-body<br>+17 items outside the approved key set | - | none | lint@flutter/ exit 1 [repo state]: 1 issue found. (ran in 4.9s)<br>format@flutter/ exit 1 [repo state]: Formatted 843 files (565 changed) in 0.94 seconds. |
| dfip | --include test | build=0 (3.2s)<br>test=2 (2.6s)<br>lint=0 (0.6s)<br>format=1 (0.0s) | +5 items outside the approved key set | - | none | test exit 2 [host toolchain]: make: *** [test] Error 1<br>format exit 1 [repo state]: no output |
| eden-biz | default | lint@api-dart/=0 (1.2s)<br>format@api-dart/=1 (1.8s)<br>lint@flutter/=1 (11.0s)<br>format@flutter/=1 (5.3s)<br>build@go/=0 (7.6s)<br>lint@go/=0 (2.4s)<br>format@go/=1 (0.3s)<br>lint@mobile/=0 (4.9s)<br>format@mobile/=1 (0.2s)<br>lint@pos/=1 (6.4s)<br>format@pos/=1 (0.3s) | build: unverifiable-body<br>+47 items outside the approved key set | - | none | format@api-dart/ exit 1 [repo state]: Formatted 529 files (452 changed) in 1.73 seconds.<br>lint@flutter/ exit 1 [repo state]: 1028 issues found. (ran in 10.5s)<br>format@flutter/ exit 1 [deps not installed]: Failed to resolve package URI "package:flutter_lints/flutter.yaml" in include at "/Users/justin/dev/eden-bi...<br>format@go/ exit 1 [repo state]: no output<br>format@mobile/ exit 1 [repo state]: Formatted 29 files (25 changed) in 0.09 seconds.<br>lint@pos/ exit 1 [repo state]: 5 issues found. (ran in 5.9s)<br>format@pos/ exit 1 [repo state]: Formatted 96 files (70 changed) in 0.19 seconds. |
| eden-circle | --include test | build=2 (8.8s)<br>test=2 (4.3s)<br>lint=0 (2.5s)<br>format=1 (0.7s)<br>test@client/=1 (129.8s)<br>lint@client/=1 (5.9s)<br>format@client/=1 (0.5s) | +13 items outside the approved key set | - | none | build exit 2 [host toolchain]: make: *** [build] Error 1<br>test exit 2 [host toolchain]: make: *** [test] Error 1<br>format exit 1 [repo state]: no output<br>test@client/ exit 1 [host toolchain]: ^<br>lint@client/ exit 1 [repo state]: 20 issues found. (ran in 5.4s)<br>format@client/ exit 1 [repo state]: Formatted 233 files (168 changed) in 0.45 seconds. |
| eden-libs | --keys lint,format | lint=3 (1.3s)<br>lint@eden-cli/=0 (0.9s)<br>format@eden-cli/=1 (0.0s)<br>lint@eden-doc-crdt/=0 (0.6s)<br>format@eden-doc-crdt/=0 (0.2s)<br>lint@eden-doc-model/=0 (0.5s)<br>format@eden-doc-model/=1 (0.3s)<br>lint@eden-doc-render/=0 (4.2s)<br>format@eden-doc-render/=1 (0.1s)<br>lint@eden-docs/=0 (0.4s)<br>format@eden-docs/=1 (0.0s)<br>lint@eden-experience-api-dart/=3 (0.5s)<br>format@eden-experience-api-dart/=1 (0.1s)<br>lint@eden-experience-flutter/=0 (3.4s)<br>format@eden-experience-flutter/=1 (0.2s)<br>lint@eden-justinforme-api-dart/=1 (2.3s)<br>format@eden-justinforme-api-dart/=1 (0.7s)<br>lint@eden-loro/=0 (2.2s)<br>format@eden-loro/=0 (0.3s)<br>lint@eden-loro/example_mobile/=0 (2.1s)<br>format@eden-loro/example_mobile/=0 (0.1s)<br>lint@eden-platform-api-dart/=3 (0.6s)<br>format@eden-platform-api-dart/=1 (0.4s)<br>lint@eden-smartwellness-api-dart/=1 (0.9s)<br>format@eden-smartwellness-api-dart/=1 (0.2s)<br>lint@eden-ui-docs/=0 (3.6s)<br>format@eden-ui-docs/=0 (0.2s)<br>lint@eden-web/=0 (0.2s)<br>format@eden-web/=1 (0.0s) | +111 items outside the approved key set | - | none | lint exit 3 [repo state]: error: recipe `lint` failed on line 29 with exit code 3<br>format@eden-cli/ exit 1 [repo state]: no output<br>format@eden-doc-model/ exit 1 [repo state]: Formatted 71 files (6 changed) in 0.22 seconds.<br>format@eden-doc-render/ exit 1 [repo state]: Formatted 7 files (2 changed) in 0.04 seconds.<br>format@eden-docs/ exit 1 [repo state]: no output<br>lint@eden-experience-api-dart/ exit 3 [repo state]: 821 issues found.<br>format@eden-experience-api-dart/ exit 1 [deps not installed]: Failed to resolve package URI "package:lints/recommended.yaml" in include at "/Users/justin/dev/eden-libs/e...<br>format@eden-experience-flutter/ exit 1 [repo state]: Formatted 146 files (125 changed) in 0.16 seconds.<br>lint@eden-justinforme-api-dart/ exit 1 [repo state]: 21 issues found.<br>format@eden-justinforme-api-dart/ exit 1 [repo state]: Formatted 148 files (127 changed) in 0.58 seconds.<br>lint@eden-platform-api-dart/ exit 3 [repo state]: 14 issues found.<br>format@eden-platform-api-dart/ exit 1 [repo state]: Formatted 133 files (115 changed) in 0.33 seconds.<br>lint@eden-smartwellness-api-dart/ exit 1 [repo state]: 1 issue found.<br>format@eden-smartwellness-api-dart/ exit 1 [repo state]: Formatted 21 files (15 changed) in 0.16 seconds.<br>format@eden-web/ exit 1 [repo state]: no output |
| eden-platform-go | default | build=1 (2.4s)<br>lint=0 (4.5s)<br>format=1 (0.7s) | +6 items outside the approved key set | - | none | build exit 1 [host toolchain]: clang: error: linker command failed with exit code 1 (use -v to see invocation)<br>format exit 1 [repo state]: no output |
| eden-press | default | build=1 (1.3s)<br>lint=0 (0.6s)<br>format=0 (0.1s)<br>lint@bind/dart/=0 (3.1s)<br>format@bind/dart/=1 (0.1s) | +15 items outside the approved key set | - | none | build exit 1 [host toolchain]: clang: error: linker command failed with exit code 1 (use -v to see invocation)<br>format@bind/dart/ exit 1 [repo state]: Formatted 10 files (3 changed) in 0.01 seconds. |
| eden-ui-flutter | default | lint=0 (5.6s)<br>format=1 (2.8s) | build: unverifiable-body<br>+10 items outside the approved key set | - | none | format exit 1 [repo state]: Formatted 1100 files (966 changed) in 2.71 seconds. |
| EdenDocs | --include test | build@wopi-host/=0 (1.1s)<br>test@wopi-host/=1 (2.3s)<br>lint@wopi-host/=0 (0.2s)<br>format@wopi-host/=0 (0.0s) | build: unverifiable-body<br>+14 items outside the approved key set | - | none | test@wopi-host/ exit 1 [repo state]: FAIL |
| github-enterprise-migration | default | - | +8 items outside the approved key set | - | none | no gate ran (every item skipped) |
| justinforme | default | build=2 (9.5s)<br>lint=0 (2.9s)<br>format=1 (0.4s)<br>lint@flutter/admin/=1 (8.7s)<br>format@flutter/admin/=1 (0.6s)<br>lint@flutter/volunteer/=0 (6.6s)<br>format@flutter/volunteer/=1 (0.3s) | +25 items outside the approved key set | - | none | build exit 2 [host toolchain]: make: *** [build] Error 1<br>format exit 1 [repo state]: no output<br>lint@flutter/admin/ exit 1 [repo state]: 199 issues found. (ran in 8.2s)<br>format@flutter/admin/ exit 1 [repo state]: Formatted 280 files (242 changed) in 0.51 seconds.<br>format@flutter/volunteer/ exit 1 [repo state]: Formatted 93 files (76 changed) in 0.22 seconds. |
| navigators | default | lint@navigators-flutter/=1 (7.3s)<br>format@navigators-flutter/=1 (0.5s)<br>build@navigators-go/=1 (0.4s)<br>lint@navigators-go/=1 (0.1s)<br>format@navigators-go/=1 (0.0s) | +23 items outside the approved key set | - | none | lint@navigators-flutter/ exit 1 [repo state]: 25 issues found. (ran in 6.8s)<br>format@navigators-flutter/ exit 1 [repo state]: Formatted 122 files (93 changed) in 0.42 seconds.<br>build@navigators-go/ exit 1 [repo state]: go mod tidy<br>lint@navigators-go/ exit 1 [repo state]: go mod tidy<br>format@navigators-go/ exit 1 [repo state]: no output |
| opsCluster | default | build=0 (2.0s)<br>lint=0 (1.1s)<br>format=1 (0.0s) | +7 items outside the approved key set | - | none | format exit 1 [repo state]: no output |
| politihub | - | - | - | - | - | **head-changed**: HEAD bede7bd6f3a9 != pinned 686cb0b82a9f; repo skipped |
| qrCodeBuilder | --include test | test=1 (193.6s)<br>lint=0 (5.5s)<br>format=1 (0.3s) | +9 items outside the approved key set | - | none | test exit 1 [host toolchain]: ^<br>format exit 1 [repo state]: Formatted 111 files (103 changed) in 0.22 seconds. |
| quanta-local | default | - | build: body:container-build<br>+9 items outside the approved key set | - | none | no gate ran (every item skipped) |
| recycling-oracle | default | lint@recycling-oracle-flutter/=1 (4.7s)<br>format@recycling-oracle-flutter/=1 (0.2s)<br>build@recycling-oracle-go/=1 (2.9s)<br>lint@recycling-oracle-go/=1 (0.9s)<br>format@recycling-oracle-go/=1 (0.0s) | +21 items outside the approved key set | - | none | lint@recycling-oracle-flutter/ exit 1 [repo state]: 19 issues found. (ran in 4.3s)<br>format@recycling-oracle-flutter/ exit 1 [repo state]: Formatted 31 files (30 changed) in 0.07 seconds.<br>build@recycling-oracle-go/ exit 1 [repo state]: cmd/oracle-api/main.go:79:41: cannot use authStore (variable of type *AuthStoreAdapter) as "github.com/aocy...<br>lint@recycling-oracle-go/ exit 1 [repo state]: vet: cmd/oracle-api/auth_store.go:212:9: cannot use &AuthStoreAdapter{…} (value of type *AuthStoreAdapter) ...<br>format@recycling-oracle-go/ exit 1 [repo state]: no output |
| smartWellness | --include test | build=0 (5.6s)<br>test=0 (1.3s)<br>lint=0 (0.7s)<br>format=1 (0.2s)<br>test@flutter/admin/=1 (0.1s)<br>lint@flutter/admin/=1 (5.1s)<br>format@flutter/admin/=1 (0.2s) | +14 items outside the approved key set | - | none | format exit 1 [repo state]: no output<br>test@flutter/admin/ exit 1 [repo state]: Test directory "test" not found.<br>lint@flutter/admin/ exit 1 [repo state]: 8 issues found. (ran in 4.7s)<br>format@flutter/admin/ exit 1 [repo state]: Formatted 34 files (29 changed) in 0.10 seconds. |
| torrentConsole | default | lint=0 (2.6s)<br>format=0 (0.1s) | +11 items outside the approved key set | - | none | - |
| trades | --include test | build=127 (0.1s)<br>test=1 (4.6s) | +8 items outside the approved key set | - | none | build exit 127 [deps not installed]: sh: vite: command not found<br>test exit 1 [deps not installed]: } |
| videoArchive | --keys lint,format | lint=0 (5.3s)<br>format=1 (0.5s) | +11 items outside the approved key set | - | none | format exit 1 [repo state]: Formatted 84 files (65 changed) in 0.37 seconds. |

politihub was **not run**: its HEAD is now `bede7bd6f3a9`, not the pinned `686cb0b82a9f`. The two newer commits are the user's own (`3f3c270` and `bede7bd`, 13:27 EDT, after the plan survey). The rule is to record that and skip, so no gate and no dry run touched it.

### Red gates by cause

98 of the 161 gates that ran exited non-zero. None is a rollout failure; each is a result.

| cause | gates | what it is |
|---|---|---|
| repo state | 79 | `gofmt -l` lists files, `dart format --set-exit-if-changed` would change files, `dart analyze` issues, a failing test (EdenDocs `oidcauth`: `status 302, want 4xx`), `go.mod` needs `go mod tidy` (navigators), a compile error in a dependency (ao-terminal `http2.TrailerPrefix`, recycling-oracle `AuthStoreAdapter`), `make lint` typecheck errors (aoinference), shellcheck findings (devcluster), no `test/` directory (smartWellness `flutter/admin`). |
| host toolchain | 15 | 12: cgo link fails on this machine (`tapi error: malformed file ... Security.tbd: unknown architecture arm64e.x1-macos` from the `MacOSX27.0.sdk` stubs, then `clang: linker command failed`), in aocore build and build@go, aoedge, aoid, aoinference, devcluster build@tools/devproxy, dfip test, eden-circle build and test, eden-platform-go, eden-press, justinforme. 1: aocore `golangci-lint` was built with go1.26 and the repo targets 1.27.1. 2: `flutter test` in eden-circle `client` and qrCodeBuilder, where the installed Flutter SDK source needs the `dot-shorthands` language feature. |
| deps not installed | 4 | trades `build` (`vite: command not found`) and `test` (`ERR_MODULE_NOT_FOUND`), eden-biz `format@flutter` and eden-libs `format@eden-experience-api-dart` (`Failed to resolve package URI`: no `pub get` here). |

### The approved `--include test` runs

| repo | test gates | outcome |
|---|---|---|
| dfip | `test=2` | host toolchain (cgo link), inconclusive for the repo |
| eden-circle | `test=2`, `test@client/=1` | host toolchain on both (cgo link; Flutter `dot-shorthands`), inconclusive for the repo |
| EdenDocs | `test@wopi-host/=1` | repo state: a real failing test in `internal/oidcauth` |
| qrCodeBuilder | `test=1` | host toolchain (Flutter `dot-shorthands`), inconclusive for the repo |
| smartWellness | `test=0`, `test@flutter/admin/=1` | `make test` passes; `flutter/admin` has no `test/` directory |
| trades | `test=1` | deps not installed (`ERR_MODULE_NOT_FOUND`), inconclusive for the repo |

## Dry-run drift

For each repo that ran, `df-tools --cwd <repo> stack init` (JSON, no `--write`) was parsed and compared with the repo's committed `.planning/STACK.md` (read from `HEAD`; no repo lacks one, and none was read from the work tree). The comparison scope is the one the 43-06 golden test uses: `extends`, the `components` set, and per command key the effective `run`, `apply` and `cwd` (the file's own entry, else the one it inherits from its `extends` tier), over the union of both files' own keys. `when`, `scoped`, `timeout_s`, `loop` and `provenance` are out of scope. Keys accepted as HAND_ONLY at the checkpoint are skipped and named in the row, so a row that differs only on them counts as `match`; the `helm_lint` to `lint_helm` alias applies.

A drift row falls into one of two kinds. A **conflict** is a different concrete command, a key or an `apply` the draft lacks, a draft `discover` where the reviewed file has a command, or a different `extends` or `components`: a hand-fix is needed to reach the reviewed file. **More specific** means the draft only adds a key or resolves a committed `discover`: nothing needs fixing to use the draft, but it is not equal to the reviewed file. The last column says which.

| repo | result | differing keys (committed STACK.md vs `stack init` draft) | would need a hand-fix? |
|---|---|---|---|
| ao-terminal | drift | deps: committed `npm ci` vs draft `task init`<br>(HAND_ONLY skipped: bootstrap, test_frontend) | yes: deps |
| aocore | drift | audit: committed `govulncheck ./... (cwd go)` vs draft `../scripts/govulncheck-gate.sh (cwd go)`<br>build: committed `go build ./... (cwd go)` vs draft `go build -tags dev -o /tmp/dev-edge ./cmd/dev-edge (cwd go)`<br>lint: committed `golangci-lint run ./... (cwd go)` vs draft `go vet ./... (cwd go)`<br>lint_helm: committed `helm lint helm/aocore-gateway/` vs draft `kubeconform -v`<br>test: committed `go test -short -race ./... -timeout 5m (cwd go)` vs draft `go test -short -p 1 ./... -race -skip "${SKIP}" -coverprofile=unit.out -timeout 35m (cwd go)`<br>(HAND_ONLY skipped: portal_codegen) | yes: audit, build, lint, lint_helm, test |
| aodex | drift | audit: committed `discover` vs draft `bash scripts/check-govulncheck.sh --self-test (cwd go)`<br>build: committed `make build (cwd go)` vs draft `discover`<br>codegen: committed `make openapi-verify (apply: make openapi-regen) (cwd go)` vs draft `make openapi-regen (cwd go)`<br>lint: committed `discover` vs draft `go vet ./... (cwd go)`<br>(HAND_ONLY skipped: guards) | yes: build, codegen; also draft is more specific on audit, lint |
| aoedge | drift | lint: committed `make lint` vs draft `go vet ./...`<br>(HAND_ONLY skipped: acceptance) | yes: lint |
| aofamily | drift | build: committed `discover` vs draft `go build ./... (cwd ai/go)`<br>deps: draft only `go mod download (cwd ai/go)`<br>lint: committed `discover` vs draft `go vet ./... (cwd ai/go)` | no, but not equal: the draft is more specific than the reviewed file on build, deps, lint (resolves a committed `discover` or adds a key) |
| aoid | match | none | no |
| aoinference | drift | extends committed=go draft=general<br>components committed-only=[] draft-only=[control-plane\|go]<br>audit: committed `govulncheck ./... (cwd control-plane)` vs draft `discover`<br>build: committed `go build ./... (cwd control-plane)` vs draft `make build (cwd control-plane)`<br>codegen: committed `go generate ./... (cwd control-plane)` vs draft `make drift-check (apply: make generate) (cwd control-plane)`<br>fix: committed `go fix -diff ./... (apply: go fix ./...) (cwd control-plane)` vs draft `discover`<br>format: committed `test -z "$(gofmt -l .)" (apply: gofmt -w {files}) (cwd control-plane)` vs draft `discover`<br>tidy: committed only `go mod tidy -diff (apply: go mod tidy) (cwd control-plane)` | yes: extends/components, audit, build, codegen, fix, format, tidy |
| AOSignal | match | none | no |
| aostudio | match | none | no |
| devcluster | drift | lint: committed `shellcheck bin/*.sh lib/*.sh t0-conformance/*.sh` vs draft `discover`<br>test: committed `bash t0-conformance/selftest.sh` vs draft `./bin/test.sh`<br>(HAND_ONLY skipped: build, cluster_test)<br>Reason: known hand-fix row (user decision 2026-10-03, remedy (c)) | yes: lint, test (known hand-fix row (user decision 2026-10-03, remedy (c))) |
| devflow | match | none | no |
| devflow-test | match | none | no |
| devflowops | drift | format: committed `make fmt-check (apply: make fmt)` vs draft `test -z "$(gofmt -l .)" (apply: make fmt)`<br>tidy: committed `make tidy-check (apply: make tidy)` vs draft `go mod tidy -diff (apply: make tidy)` | yes: format, tidy |
| dfip | match | none | no |
| eden-biz | drift | build: committed `make build (cwd go)` vs draft `make build-web (cwd flutter)`<br>codegen: committed `make generate (cwd go)` vs draft `make buf-generate (cwd go)`<br>deps: draft only `flutter pub get (cwd flutter)`<br>e2e: draft only `make e2e-db-reset`<br>e2e_env: committed `make e2e-stack-up` vs draft `make e2e-stack-down`<br>lint: committed `discover` vs draft `make analyze (cwd flutter)`<br>test: committed `make test (cwd go)` vs draft `make test (cwd flutter)` | yes: build, codegen, e2e_env, test; also draft is more specific on deps, e2e, lint |
| eden-circle | match | none | no |
| eden-libs | drift | build: committed `just build-flutter-explorer` vs draft `just package-docs`<br>codegen: committed `just generate` vs draft `discover`<br>format: committed `discover (apply: just fmt)` vs draft `discover`<br>test: committed `just test` vs draft `dart test (cwd eden-platform-api-dart)` | yes: build, codegen, format, test |
| eden-platform-go | match | none | no |
| eden-press | match | none | no |
| eden-ui-flutter | match | none | no |
| EdenDocs | drift | deps: draft only `discover`<br>(HAND_ONLY skipped: branding, smoke) | no, but not equal: the draft is more specific than the reviewed file on deps (resolves a committed `discover` or adds a key) |
| github-enterprise-migration | match | none | no |
| justinforme | drift | codegen: committed `make proto` vs draft `make generate`<br>e2e: draft only `make smoke-canvass` | yes: codegen; also draft is more specific on e2e |
| navigators | match | HAND_ONLY keys accepted at the checkpoint, skipped: sqlc | no |
| opsCluster | drift | extends committed=go draft=general<br>components committed-only=[] draft-only=[control-plane\|go]<br>audit: committed `govulncheck ./... (cwd control-plane)` vs draft `discover`<br>codegen: committed `go generate ./... (cwd control-plane)` vs draft `discover`<br>fix: committed `go fix -diff ./... (apply: go fix ./...) (cwd control-plane)` vs draft `discover`<br>format: committed `test -z "$(gofmt -l .)" (apply: gofmt -w {files}) (cwd control-plane)` vs draft `discover`<br>tidy: committed only `go mod tidy -diff (apply: go mod tidy) (cwd control-plane)` | yes: extends/components, audit, codegen, fix, format, tidy |
| politihub | head-changed | - | - |
| qrCodeBuilder | match | none | no |
| quanta-local | match | HAND_ONLY keys accepted at the checkpoint, skipped: preflight, verify | no |
| recycling-oracle | match | none | no |
| smartWellness | drift | codegen: committed `make proto` vs draft `make generate` | yes: codegen |
| torrentConsole | match | none | no |
| trades | match | none | no |
| videoArchive | match | none | no |

devcluster is reported as drift on `lint` and `test` and is not counted as a match, as the user ruled: known hand-fix row (user decision 2026-10-03, remedy (c)). It stays out of the match count even after that follow-up lands until a fresh dry run says otherwise.

## Summary

**Scope.** 33 repos in the plan. 32 ran; 1 was skipped because its HEAD moved (politihub). 0 absent. 27 of the 32 had at least one gate that ran; 5 had nothing to run (AOSignal, aostudio, devflow-test, github-enterprise-migration, and quanta-local, whose only default gate is a `docker build` the policy skips as `body:container-build`).

**Gates.** 161 ran: 63 exited 0, 98 exited non-zero (79 repo state, 15 host toolchain, 4 deps not installed), 0 timed out. 30 of the 161 ran with the `--no-pub` rewrite. 591 items did not run: 9 refused by the run policy (8 `unverifiable-body`, 1 `body:container-build`, exactly the 9 the Run plan predicted), 0 refused by the effect guard, 582 outside the approved key set or without a command.

**Safety.** 0 mutations caught by the effect guard, 0 unrestored, 0 harness deltas (32 of 32 repos: the snapshot before equals the snapshot after the run and after the dry run), and no HEAD moved in any of the 32 repos that ran. 32 of 33 HEADs equal the pinned value; the 33rd is politihub, moved by the user's own commits before the run. This was the first live run of the D8 guard on aocore, aofamily and aoid, the three where objective 42's `flutter analyze --fatal-infos` rewrote `analysis_options.yaml` and bumped `pubspec.lock`. With `--no-pub` those gates ran and exited normally and nothing in those work trees changed. Nothing was written, staged or committed in any fleet repo.

**Dry-run drift.** 32 evaluated: **18 match** (navigators and quanta-local match with their accepted HAND_ONLY keys skipped), **14 drift**. Of the 14, **12 are conflicts that need a hand-fix**: ao-terminal, aocore, aodex, aoedge, aoinference, devcluster, devflowops, eden-biz, eden-libs, justinforme, opsCluster, smartWellness. The other 2 (aofamily, EdenDocs) differ only by the draft being more specific. politihub was not evaluated.

**Against SDR-08 and OBJECTIVE.md Success.**

- SDR-08 asked for real `stack verify --run` results across the fleet instead of 3 of 33. Real results are now recorded for 32 of 33, including the 3 that ran in 42 (re-run, now guarded). The 33rd, politihub, stays open: its HEAD moved after the plan was approved, and the rule is to skip, not to re-pin. Re-running it needs a fresh decision.
- The OBJECTIVE.md Success line, "the full fleet dry run shows no row needing a hand-fix", is **not met**. 12 of 32 evaluated rows still need one. The 43-06 golden tests pass on hand-built fixture shapes; on the real repos the drafter still differs from the reviewed files, for instance on ao-terminal (`deps` drafted as `task init`), aocore (`audit`, `build`, `lint`, `lint_helm` and `test`), aoinference and opsCluster (a Go root under `control-plane/` drafted as `extends: general` plus a component, with `audit`, `fix` and `format` reduced to `discover` and `tidy` dropped), devcluster (`lint`, `test`) and eden-biz (seven keys).
- 19 of the 98 red gates (15 host toolchain, 4 deps not installed) say nothing about the repository, so the gate evidence for those is inconclusive. The cgo link failure alone hides the `build` result for 9 repos and the `test` result for 2 (dfip, eden-circle).

**Follow-ups this TRD does not do** (each needs the human or a new TRD): re-run politihub at its new HEAD if wanted; add the offline CI workflow to devcluster (remedy (a)); fix the host linker (Command Line Tools versus the macOS 27 SDK) and install trades' `node_modules`, then re-run the host-blocked rows; decide what to do about the 12 conflict rows (drafter rules, or accept the hand-fixes as the permanent answer); then `/devflow:milestone audit` to re-audit v1.4.

## Gap closure: stale STACK.md refresh (TRD 43-14)

Read-only preview taken 2026-10-03 with the checkout drafter at devflow-claude HEAD `f6d6af79` (`node plugins/devflow/devflow/bin/df-tools.cjs --cwd <repo> stack init`, no `--write`). Nothing was written, staged or committed in aoinference or opsCluster. Both repos carry objective 42's committed shape (`extends: go`, no components) for a Go module under `control-plane/`. The final drafter drafts `extends: general` plus a `control-plane/` component (43-05 D3).

### Preflight

All git calls used `GIT_OPTIONAL_LOCKS=0`.

| Check | aoinference | opsCluster |
|---|---|---|
| branch | `fix/obj31-oci-source-label` | `main` |
| HEAD | `c9f1bdccc2da9747fbdd9d45a7c8f98d04e4f2a1` | `a547076a0daeaec58675ca2848c2ad1fd85d2d25` |
| detached | no | no |
| rebase / merge / cherry-pick in progress | none (`rebase-merge`, `rebase-apply`, `MERGE_HEAD`, `CHERRY_PICK_HEAD` absent) | none |
| staged (`diff --cached --name-only`) | empty | empty |
| unmerged paths | none | none |
| dirty (`status --porcelain=v1 -uall`) | 3 lines: `?? .claude/settings.json`, `?? .planning/.dup-detect-log.jsonl`, `?? docs/MODEL-SELECTION-2026-09.md` | 8 lines: ` M .claude/agent-memory/devflow-verifier/MEMORY.md`, ` M .planning/.progress-guard.json`, ` M control-plane/.planning/.progress-guard.json`, `?? .claude/agent-memory/devflow-verifier/obj64-eden-dataroom-artifact-verified.md`, `?? .claude/agent-memory/devflow-verifier/obj67-ghscim-verified.md`, `?? .claude/settings.json`, `?? .planning/objectives/67-github-emu-scim-sync-from-google-workspace-keyless-wif-cronj/.gitkeep`, `?? dataroom-login.png` |
| stack files tracked | both | both |
| stack files dirty | no (neither listed in porcelain) | no |
| stack files gitignored (`check-ignore --no-index`, exit 1 expected) | exit 1, not ignored | exit 1, not ignored |
| `commit_docs` | true | true (via `planning.commit_docs`) |
| `github.store` | false (key unset) | false |
| verdict | ok | ok |

### Preview: aoinference `.planning/STACK.md` (committed vs draft)

In both STACK.md diffs the long `<!-- Drafted by ... -->` comment line is shortened to `...` after the word `diverges from`; the real line continues with the same fixed text in the old and new file, and only the profile name differs.

```diff
--- a/.planning/STACK.md
+++ b/.planning/STACK.md
@@ -1,27 +1,25 @@
 ---
 schema: 1
 id: "aoinference"
-extends: "go"
+extends: "general"
+components: [{ path: "control-plane/", profile: "go" }]
 commands:
-  build: { run: "go build ./...", cwd: "control-plane" }
+  build: { run: "make build", cwd: "control-plane" }
+  codegen: { run: "make drift-check", apply: "make generate", when: "sources_changed", cwd: "control-plane" }
   lint: { run: "make lint", cwd: "control-plane" }
   test: { run: "make test", cwd: "control-plane" }
-  format: { run: "test -z \"$(gofmt -l .)\"", apply: "gofmt -w {files}", cwd: "control-plane" }
-  fix: { run: "go fix -diff ./...", apply: "go fix ./...", cwd: "control-plane" }
-  audit: { run: "govulncheck ./...", when: "deps_changed", cwd: "control-plane" }
-  codegen: { run: "go generate ./...", when: "sources_changed", cwd: "control-plane" }
-  tidy: { run: "go mod tidy -diff", apply: "go mod tidy", when: "deps_changed", cwd: "control-plane" }
+loop: ["lint", "test"]
 provenance:
-  reviewed: "2026-09-29"
+  reviewed: "2026-10-03"
   sources: ["control-plane/Makefile"]
 ---
 
 # Stack Profile: aoinference
 
-<!-- Drafted by `df-tools stack init`. Add no `## ` heading below unless this project genuinely diverges from `go`: ... -->
+<!-- Drafted by `df-tools stack init`. Add no `## ` heading below unless this project genuinely diverges from `general`: ... -->
 
 <!-- stack init notes (see .planning/STACK-REPORT.md):
 - load-test/ stack — info (unsupported area (python): no tier-2 profile, so it is not a component; only its own commands are noted)
-- control-plane/ codegen: make generate-all — off_stack (tool stack unknown does not match extends go)
+- control-plane/ stack — info (primary component control-plane/ (go): 4 build/test/lint evidence items of 7)
 - control-plane/ lint: make vet — alternate (canonical pick: make lint)
 -->
```

Draft validation: ok, 0 errors, 0 warnings. Resolved keys: build, codegen, lint, test. `audit`, `fix`, `format` and `tidy` leave the file: with `extends: general` they are inherited as `discover`, and `tidy` has no general default.

### Preview: opsCluster `.planning/STACK.md` (committed vs draft)

```diff
--- a/.planning/STACK.md
+++ b/.planning/STACK.md
@@ -1,22 +1,23 @@
 ---
 schema: 1
 id: "opscluster"
-extends: "go"
+extends: "general"
+components: [{ path: "control-plane/", profile: "go" }]
 commands:
   deps: { run: "go mod download all", when: "deps_changed", cwd: "control-plane" }
   lint: { run: "go vet ./...", cwd: "control-plane" }
   test: { run: "go test -p 1 ./... -race", scoped: "go test -race {packages}", cwd: "control-plane" }
   build: { run: "go build ./...", cwd: "control-plane" }
-  format: { run: "test -z \"$(gofmt -l .)\"", apply: "gofmt -w {files}", cwd: "control-plane" }
-  fix: { run: "go fix -diff ./...", apply: "go fix ./...", cwd: "control-plane" }
-  audit: { run: "govulncheck ./...", when: "deps_changed", cwd: "control-plane" }
-  codegen: { run: "go generate ./...", when: "sources_changed", cwd: "control-plane" }
-  tidy: { run: "go mod tidy -diff", apply: "go mod tidy", when: "deps_changed", cwd: "control-plane" }
+loop: ["lint", "test"]
 provenance:
-  reviewed: "2026-09-29"
+  reviewed: "2026-10-03"
   sources: [".github/workflows/go.yml"]
 ---
 
 # Stack Profile: opscluster
 
-<!-- Drafted by `df-tools stack init`. Add no `## ` heading below unless this project genuinely diverges from `go`: ... -->
+<!-- Drafted by `df-tools stack init`. Add no `## ` heading below unless this project genuinely diverges from `general`: ... -->
+
+<!-- stack init notes (see .planning/STACK-REPORT.md):
+- control-plane/ stack — info (primary component control-plane/ (go): 2 build/test/lint evidence items of 3)
+-->
```

Draft validation: ok, 0 errors, 0 warnings. Resolved keys: deps, lint, test, build. `format`, `fix`, `audit`, `codegen` and `tidy` leave the file.

### Preview: `.planning/STACK-REPORT.md` (committed vs `stack report --draft`)

`stack report --write` runs after the STACK.md write, so the real report says `profile_source: file`, not `draft`. The `generated` date is the day of the write.

aoinference:

```diff
--- a/.planning/STACK-REPORT.md
+++ b/.planning/STACK-REPORT.md
@@ -1,8 +1,8 @@
 ---
-generated: "2026-09-29"
-profile: "go"
-profile_source: file
-components: []
+generated: "2026-10-03"
+profile: "general"
+profile_source: draft
+components: ["control-plane/"]
 unsupported_areas: ["load-test/"]
 counts: { gap: 5, weak: 2, info: 9 }
 ---
@@ -43,6 +43,6 @@
 
 | Key | Candidate | Status | Source |
 |---|---|---|---|
-| codegen | `make generate-all` | off_stack | runner |
+| — | — | info | — |
 | lint | `make vet` | alternate | runner |
 | — | — | info | — |
```

opsCluster:

```diff
--- a/.planning/STACK-REPORT.md
+++ b/.planning/STACK-REPORT.md
@@ -1,9 +1,9 @@
 ---
-generated: "2026-09-29"
-profile: "go"
-profile_source: file
-components: []
-counts: { gap: 3, weak: 1, info: 8 }
+generated: "2026-10-03"
+profile: "general"
+profile_source: draft
+components: ["control-plane/"]
+counts: { gap: 3, weak: 1, info: 9 }
 ---
 
 # Stack Report: opscluster
@@ -41,3 +41,4 @@
 
 | Key | Candidate | Status | Source |
 |---|---|---|---|
+| — | — | info | — |
```

### Task 3 plan (runs only after approval, per approved repo)

The checkout df-tools: `DF=/Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/df-tools.cjs`. One plain command per call.

1. Re-check HEAD against the value above (a moved HEAD skips the repo) and `diff --cached --name-only` (non-empty stops the repo).
2. Snapshot P0 (porcelain plus `git hash-object` of every listed path) to the scratchpad.
3. `node $DF --cwd /Users/justin/dev/<repo> stack init --write --force`, then `stack validate`, `stack verify` (static, no `--run`), `stack report --write`.
4. Delta check against P0: only `.planning/STACK.md` and `.planning/STACK-REPORT.md` may differ.
5. `node $DF --cwd /Users/justin/dev/<repo> commit "docs(stack): refresh STACK.md to the objective 43 drafter (general + control-plane component)" --files .planning/STACK.md .planning/STACK-REPORT.md`, on the current branch (aoinference `fix/obj31-oci-source-label`, opsCluster `main`). Nothing is pushed.
6. Here: remove aoinference and opsCluster from KNOWN_DRIFT, run `node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs`, add a Results table, commit.

### Approval

Human reply, 2026-10-03, in chat, recorded verbatim before the first write in either repo. It covers BOTH repos (aoinference and opsCluster):

> approved

The approval record was committed in devflow-claude (`3cdee2af`) before the first write in either repo.

### Results

Task 3 ran on 2026-10-03 with the checkout df-tools. Before each write the HEAD and the staged index were re-checked against the Task 1 pins (both unchanged, index empty) and a snapshot P0 was taken (porcelain lines plus `git hash-object`, no `-w`, of every listed path). opsCluster's P0 was retaken immediately before its write and was identical to the first one.

| Check | aoinference | opsCluster |
|---|---|---|
| branch | `fix/obj31-oci-source-label` | `main` |
| HEAD before | `c9f1bdccc2da9747fbdd9d45a7c8f98d04e4f2a1` (equals pin) | `a547076a0daeaec58675ca2848c2ad1fd85d2d25` (equals pin) |
| staged before | none | none |
| `stack init --write --force` | written, matches the preview | written, matches the preview |
| `stack validate` | ok, 0 errors, 0 warnings | ok, 0 errors, 0 warnings |
| `stack verify` (static, no `--run`) | resolved 12, missing 0, unverifiable 0, discover 4, ran 0 | resolved 12, missing 0, unverifiable 0, discover 5, ran 0 |
| `stack report --write` | written, `profile_source: file`, gap 5 / weak 2 / info 9 | written, `profile_source: file`, gap 3 / weak 1 / info 9 |
| delta check vs P0 | none outside the two stack files | none outside the two stack files |
| commit | `87ea0e1a2ff274e219cd48339c8593ab5669b020` | `9f22c0d62849566e6bc6efa7b443e734b4d34bf5` |
| files in the commit (`show --name-only`) | `.planning/STACK-REPORT.md`, `.planning/STACK.md` | `.planning/STACK-REPORT.md`, `.planning/STACK.md` |
| user work tree after commit vs P0 | identical (only the `head` field differs) | identical (only the `head` field differs) |
| porcelain lines after commit | 3 (as before) | 8 (as before) |
| pushed | no | no |
| fleet harness row | matches | matches |

The delta check compared porcelain status and content hash for every path in P0 and P1. In both repos the only paths that changed between P0 and the write were `.planning/STACK.md` and `.planning/STACK-REPORT.md`; the dirty user paths (listed in the Preflight table) kept the same status and hash. `git status -sb` after the commits shows aoinference `ahead 6` of its remote (5 before this commit). opsCluster shows `ahead 207, behind 1` against `origin/main`; that gap existed before this commit (local `main` was already far ahead), and nothing was pushed.

Static `stack verify` records only that each command resolves on this host (a make target exists, `go`, `gofmt` and `govulncheck` are on PATH); it did not run any gate.

Fleet harness: `node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs` after removing both repos from KNOWN_DRIFT: 36 tests, 36 pass, 0 fail. aoinference and opsCluster both report "draft has no unaccepted conflict with the committed STACK.md", and the ratchet does not flag them.

KNOWN_DRIFT after this TRD (both residual, both closed by 43-15):

| Repo | Keys | Closes | Why it remains |
|---|---|---|---|
| aocore | `test` | 43-15 | flag-only residual: flag order and `-coverprofile` differ from the CI lane |
| ao-terminal | `deps` | 43-15 | flag-only residual: CI adds `--no-audit --no-fund`, the reviewed value dropped them |

ACCEPTED is unchanged (devcluster `lint`, `test`).
