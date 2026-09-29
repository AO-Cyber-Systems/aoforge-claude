# 42-ROLLOUT — fleet dry run (TRD 42-11)

## Header

- Date: 2026-09-29T13:50:54.291Z
- DF: `/Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/df-tools.cjs`
- devflow-claude HEAD: `f8f9b9d` (feat/stack-profile-loader)
- Mode: READ-ONLY dry run (Task 1, re-run after gap fixes 42-12/42-13; supersedes the earlier table and Approval section). Nothing written or committed in any other repo. Awaiting Task 2 human review.
- Defaults (user decision 2026-09-29): clean AND dirty repos -> approve (dirty shown as `approve (dirty: N)`, commit = the two stack files only); aocyber-deploy -> skip (PoC); blockers checked on the stack FILES for gitignore.
- Canonical repos: 36 (git dir + .planning/, depth 1 of /Users/justin/dev)

## Dry run

| repo | branch | dirty | decision | extends | components | drafted commands (key=command) | verify (all keys incl. inherited) | report (g/w/i + top gaps) | notes |
|---|---|---|---|---|---|---|---|---|---|
| ao-terminal | ao-main | 1 | approve (dirty: 1) | go | tsunami/(go) | build=`task build:backend`<br>typecheck=`task check:ts`<br>codegen=`task generate`<br>tidy=`go mod tidy -diff`<br>deps=`task init`<br>test=`go test ./...` | resolved 10 | 19/4/42 GO-FMT,GO-RACE,GO-VET | unsupported areas: docs/, tsunami/frontend/; docs/: info — unsupported area (node): no tier-2 profile, so it is not a component;; tsunami/frontend/: info — unsupported area (node): no tier-2 profile, so it is not a component;; (root) deps `task docs:npm:install`: sub_area — runs in docs/: not the primary stack; never a root command; (root) build `task docsite:build:public`: sub_area — runs in docs |
| aocore | df/saas-wave2 | 22 | approve (dirty: 22) | general | admin/(flutter), dev/devedge/(go), go/(go), portal/(flutter) | lint_helm=`kubeconform -v`<br>build=`bash portal/build.sh` | resolved 36 | 15/7/29 LOCAL-MIRROR,DART-FORMAT,JS-AUDIT | unsupported areas: admin/e2e/, go/lance-sidecar/, sdk/python/; admin/e2e/: info — unsupported area (node): no tier-2 profile, so it is not a component;; go/lance-sidecar/: info — unsupported area (rust): no tier-2 profile, so it is not a component;; sdk/python/: info — unsupported area (python): no tier-2 profile, so it is not a component; admin/e2e/ deps `npm ci`: sub_area — runs in admin/e2e/: n |
| aocyber-deploy | main | 0 | skip (user: PoC/reference-only) | general |  |  |  | 0/0/2 | (root): info — no language area and no command evidence found: drafted extends genera |
| aodex | fix/ci-listtile-material | 206 | approve (dirty: 206) | general | flutter/(flutter), go/(go) | build=`discover` | resolved 17 | 7/6/20 DART-FORMAT,LOCAL-MIRROR,JS-AUDIT | unsupported areas: flutter/e2e/; flutter/e2e/: info — unsupported area (node): no tier-2 profile, so it is not a component;; flutter/e2e/ e2e `npm test`: sub_area — runs in flutter/e2e/: not the primary stack; never a root command; (root) build `docker build --target builder -t aodex-web-builder --build-a`: unverifiable — contains a GitHub Actions ${{ }} expression; it only runs inside a wor; go/  |
| aoedge | fix/strip-inbound-aoid-trust-headers | 1 | approve (dirty: 1) | go |  | test=`make test`<br>build=`make build-fips`<br>format=`test -z "$(gofmt -l .)"`<br>tidy=`go mod tidy -diff` | resolved 8 | 4/1/30 GO-FMT,GO-RACE,GO-VULN | (root) test `make acceptance`: narrow — not the repo-wide test (single-path: tests one package or path, not th; (root) test `make acceptance-tls`: narrow — not the repo-wide test (run-filter: runs only the tests a name filter; (root) test `make acceptance-routing`: narrow — not the repo-wide test (run-filter: runs only the tests a name filter; (root) test `make acceptance-waf`: narrow — not the re |
| aofamily | df/riverpod3-rebase | 4 | approve (dirty: 4) | general | ai/flutter/(flutter), ai/go/(go), billing/go/(go), browser/flutter/(flutter), browser/go/(go), connect/flutter/(flutter), connect/go/(go), theme/(flutter) | test=`go test ./...` | resolved 69 | 23/12/54 DART-FORMAT,LOCAL-MIRROR,GO-FMT | (root) test `go test ./internal/filtering/...`: narrow — not the repo-wide test (single-path: tests one package or path, not th; (root) test `go test -run TestClassifier ./...`: narrow — not the repo-wide test (run-filter: runs only the tests a name filter; (root) test `flutter test test/widget_test.dart`: narrow — not the repo-wide test (single-path: tests one package or path, not th; ai/go/ deps |
| aoid | main | 14 | approve (dirty: 14) | go | portal/(flutter) | test=`just test`<br>deps=`go mod download` | resolved 18 | 6/2/14 GO-FMT,GO-GEN-DRIFT,GO-RACE | (root) build `docker buildx build --platform linux/amd64 --build-context e`: off_stack — tool stack docker does not match extends go; portal/ lint `just portal-analyze`: resolved — component portal/ uses tier flutter; a per-area command is not written; portal/ build `just portal-build`: resolved — component portal/ uses tier flutter; a per-area command is not written |
| aoinference | fix/obj31-oci-source-label | 3 | approve (dirty: 3) | go |  | build=`go build ./... (cwd control-plane)`<br>lint=`make lint (cwd control-plane)`<br>test=`make test (cwd control-plane)`<br>format=`test -z "$(gofmt -l .)" (cwd control-plane)`<br>fix=`go fix -diff ./... (cwd control-plane)`<br>audit=`govulncheck ./... (cwd control-plane)`<br>codegen=`go generate ./... (cwd control-plane)`<br>tidy=`go mod tidy -diff (cwd control-plane)` | resolved 8 | 5/2/9 HELM-LINT,GO-FMT,GO-RACE | unsupported areas: load-test/; load-test/: info — unsupported area (python): no tier-2 profile, so it is not a component; control-plane/ codegen `make generate-all`: off_stack — tool stack unknown does not match extends go; control-plane/ lint `make vet`: alternate — canonical pick: make lint |
| AOSignal | main | 1 | approve (dirty: 1) | general |  |  |  | 0/0/2 | (root): info — no language area and no command evidence found: drafted extends genera |
| aostudio | main | 3 | approve (dirty: 3) | general |  |  |  | 0/0/2 | (root): info — no language area and no command evidence found: drafted extends genera |
| devcluster | main | 11 | approve (dirty: 11) | go |  | build=`go build ./... (cwd tools/devproxy)`<br>test=`go test -race ./... (cwd tools/devproxy)`<br>lint=`go vet ./... (cwd tools/devproxy)`<br>format=`test -z "$(gofmt -l .)" (cwd tools/devproxy)`<br>fix=`go fix -diff ./... (cwd tools/devproxy)`<br>audit=`govulncheck ./... (cwd tools/devproxy)`<br>codegen=`go generate ./... (cwd tools/devproxy)`<br>tidy=`go mod tidy -diff (cwd tools/devproxy)` | resolved 8 | 0/0/3 | (root) build `./bin/build.sh`: off_stack — tool stack unknown does not match extends go; (root) test `./bin/test.sh`: off_stack — tool stack python does not match extends go |
| devflow | main | 2 | approve (dirty: 2) | go |  | test=`go test ./...` | resolved 8 | 4/1/5 GO-FMT,GO-RACE,GO-VULN |  |
| devflow-claude | feat/stack-profile-loader | 10 | skip (self) | general |  | deps=`npm ci`<br>build=`npm run docs:build`<br>test=`npm test` | resolved 3 | 2/0/3 JS-AUDIT,JS-LINT | existing STACK.md valid; (root): info — unsupported area (node): no tier-2 profile, so it is not a component;; (root) test `npm test`: breadth-unknown — what this command runs could not be read; kept as the repo-wide test |
| devflow-test | main | 3 | approve (dirty: 3) | general |  |  |  | 0/0/2 | (root): info — no language area and no command evidence found: drafted extends genera |
| devflowops | main | 2 | approve (dirty: 2) | go | flutter/(flutter) | build=`go build -o gitea_no_gcc`<br>deps=`make node_modules`<br>lint=`make lint-spell`<br>e2e=`make playwright` | resolved 19 | 10/3/58 GO-FMT,GO-RACE,GO-VET | unsupported areas: flutter/scripts/; flutter/scripts/: info — unsupported area (node): no tier-2 profile, so it is not a component;; flutter/scripts/ deps `npm install`: sub_area — runs in flutter/scripts/: not the primary stack; never a root command; (root) build `make build`: off_stack — tool stack unknown does not match extends go; (root) build `make docker`: off_stack — tool stack docker does  |
| dfip | main | 0 | approve | go |  | build=`make build`<br>test=`make test` | resolved 8 | 5/2/9 GO-FMT,GO-GEN-DRIFT,GO-RACE | (root) build `make docker`: off_stack — tool stack docker does not match extends go; (root) test `ginkgo -r -p spec/`: narrow — not the repo-wide test (single-path: tests one package or path, not th |
| eden-biz | main | 9 | approve (dirty: 9) | general | api-dart/(dart), flutter/(flutter), go/(go), mobile/(flutter), pos/(flutter) | e2e=`make e2e-stack-up`<br>codegen=`make buf-generate (cwd go)`<br>test=`./go/scripts/check-migrations_test.sh` | resolved 45 | 14/9/31 DART-FORMAT,DART-TEST,DART-FORMAT | unsupported areas: flutter/web_e2e/; flutter/web_e2e/: info — unsupported area (node): no tier-2 profile, so it is not a component;; flutter/ deps `make e2e-web`: sub_area — runs in flutter/web_e2e/: not the primary stack; never a root command; flutter/web_e2e/ e2e `npx playwright test --project=flows tests/framework.smoke.sp`: sub_area — runs in flutter/web_e2e/: not the primary stack; never a ro |
| eden-circle | obj-36-initstate-audit | 36 | approve (dirty: 36) | go | client/(flutter) | build=`make build`<br>codegen=`make proto`<br>test=`make test` | resolved 17 | 5/4/13 GO-FMT,GO-VULN,LOCAL-MIRROR | (root) build `make web-e2ee-worker`: off_stack — tool stack dart does not match extends go; client/ lint `flutter analyze > analyze_output.txt 2>&1 \|\| true`: resolved — component client/ uses tier flutter; a per-area command is not written |
| eden-libs | main | 75 | approve (dirty: 75) | general | eden-cli/(go), eden-doc-crdt/(dart), eden-doc-model/(dart), eden-doc-render/(flutter), eden-docs/(go), eden-experience-api-dart/(dart), eden-experience-flutter/(flutter), eden-justinforme-api-dart/(dart), eden-loro/(dart), eden-loro/example_mobile/(flutter), eden-platform-api-dart/(dart), eden-smartwellness-api-dart/(dart), eden-ui-docs/(flutter), eden-web/(go) | build=`just build-flutter-explorer`<br>format=`discover`<br>codegen=`just generate`<br>lint=`just lint`<br>deps=`just setup`<br>test=`just test` | resolved 114 | 31/16/45 GO-FMT,GO-VULN,LOCAL-MIRROR | unsupported areas: eden-docs/e2e/, eden-loro/tool/; eden-docs/e2e/: info — unsupported area (node): no tier-2 profile, so it is not a component;; eden-loro/tool/: info — unsupported area (node): no tier-2 profile, so it is not a component;; (root) lint `go vet ./...`: cwd_nested_repo — eden-platform-go is inside a nested git repository; the command is nev; (root) test `go test ./... -v -race`: cwd |
| eden-platform-go | fix/cf-email-retry-on-throttle | 3 | approve (dirty: 3) | go |  | build=`go build ./cmd/aoid`<br>test=`go test ./... -v -race` | resolved 8 | 4/1/8 GO-FMT,GO-GEN-DRIFT,GO-VULN |  |
| eden-press | main | 3 | approve (dirty: 3) | go | bind/dart/(flutter), internal/latex2mathml/(go) | test=`make test` | resolved 17 | 10/3/12 GO-FMT,GO-RACE,GO-VULN | unsupported areas: tools/corpus-gen/; tools/corpus-gen/: info — unsupported area (node): no tier-2 profile, so it is not a component;; tools/corpus-gen/ codegen `npm run gen`: sub_area — runs in tools/corpus-gen/: not the primary stack; never a root command; (root) build `docker build --build-arg CHROME_VERSION="${CHROME_VERSION}" `: off_stack — tool stack docker does not match extends go; (root)  |
| eden-ui-flutter | main | 2 | approve (dirty: 2) | flutter | lints/(dart) | lint=`flutter analyze --no-fatal-infos`<br>build=`bash tool/probe_guard.sh example/probe_smoke`<br>e2e=`maestro test .maestro` | resolved 11 | 4/4/9 DART-FORMAT,LOCAL-MIRROR,DART-FORMAT | (root) lint `bash tool/lint_gate_assert.sh`: off_stack — tool stack unknown does not match extends flutter; (root) lint `flutter analyze --no-fatal-infos`: resolved — weak gate kept verbatim: --no-fatal-infos; (root) test `flutter test test/stories/registry_drift_test.dart test/stor`: narrow — not the repo-wide test (single-path: tests one package or path, not th; (root) test `flutter test test/st |
| EdenDocs | eden-main | 3 | approve (dirty: 3) | go |  | build=`./wopi-host/scripts/wopi-e2e.sh`<br>test=`go test -race ./... -count=1 (cwd wopi-host)`<br>deps=`go mod download (cwd wopi-host)`<br>lint=`go vet ./... (cwd wopi-host)`<br>format=`test -z "$(gofmt -l .)" (cwd wopi-host)`<br>fix=`go fix -diff ./... (cwd wopi-host)`<br>audit=`govulncheck ./... (cwd wopi-host)`<br>codegen=`go generate ./... (cwd wopi-host)`<br>tidy=`go mod tidy -diff (cwd wopi-host)` | resolved 9 | 13/1/20 JS-AUDIT,JS-LINT,JS-TYPE | unsupported areas: browser/, cypress_test/, cypress_test/eslint_plugin/, engine/rust_uno/, qt/test/; browser/: info — unsupported area (node): no tier-2 profile, so it is not a component;; cypress_test/: info — unsupported area (node): no tier-2 profile, so it is not a component;; cypress_test/eslint_plugin/: info — unsupported area (node): no tier-2 profile, so it is not a component;; engine/rust |
| github-enterprise-migration | main | 2 | approve (dirty: 2) | general |  |  |  | 0/0/2 | (root): info — no language area and no command evidence found: drafted extends genera |
| justin-donnaruma-us-go | df/riverpod3-bump | 0 | blocked (stack-files-gitignored) | go | flutter/(flutter) | build=`make build`<br>codegen=`make proto`<br>test=`make test`<br>deps=`go mod download`<br>e2e=`./scripts/t3.sh` | resolved 19 | 8/2/15 GO-FMT,GO-GEN-DRIFT,GO-VULN | (root) build `docker build -f app/deploy/Dockerfile.server.ci -t $IMAGE:${`: off_stack — tool stack docker does not match extends go; (root) build `docker build -f deploy/Dockerfile.web -t $IMAGE:${{ github.s`: off_stack — tool stack docker does not match extends go; flutter/ build `make flutter-build`: resolved — component flutter/ uses tier flutter; a per-area command is not writte; flutter/ lin |
| justinforme | df/riverpod3-bump | 125 | approve (dirty: 125) | go | flutter/admin/(flutter), flutter/volunteer/(flutter) | test=`make test`<br>build=`make build`<br>deps=`make gen-dart`<br>codegen=`make proto` | resolved 27 | 0/0/12 | unsupported areas: cloudflare-email-worker/; cloudflare-email-worker/: info — unsupported area (node): no tier-2 profile, so it is not a component;; cloudflare-email-worker/ test `npm test`: sub_area — runs in cloudflare-email-worker/: not the primary stack; never a root; cloudflare-email-worker/ typecheck `npm run typecheck`: sub_area — runs in cloudflare-email-worker/: not the primary stack; nev |
| navigators | df/riverpod3-bump | 24 | approve (dirty: 24) | general | navigators-flutter/(flutter), navigators-go/(go) | e2e=`maestro test .maestro` | resolved 18 | 0/0/4 | navigators-go/ codegen `just generate`: resolved — component navigators-go/ uses tier go; a per-area command is not writt; navigators-go/ test `just test-go`: resolved — component navigators-go/ uses tier go; a per-area command is not writt |
| opsCluster | main | 7 | approve (dirty: 7) | go |  | deps=`go mod download all (cwd control-plane)`<br>lint=`go vet ./... (cwd control-plane)`<br>test=`go test -p 1 ./... -race (cwd control-plane)`<br>build=`go build ./... (cwd control-plane)`<br>format=`test -z "$(gofmt -l .)" (cwd control-plane)`<br>fix=`go fix -diff ./... (cwd control-plane)`<br>audit=`govulncheck ./... (cwd control-plane)`<br>codegen=`go generate ./... (cwd control-plane)`<br>tidy=`go mod tidy -diff (cwd control-plane)` | resolved 9 | 3/1/8 GO-FMT,GO-VULN,LOCAL-MIRROR |  |
| politihub | main | 2 | approve (dirty: 2) | general | flutter-navigators/(flutter), flutter/(flutter), go/(go) | build=`./build.sh (cwd infra/tiles)` | resolved 27 | 10/4/23 DART-FORMAT,LOCAL-MIRROR,DART-FORMAT | unsupported areas: go/cloudflare-email-worker/; go/cloudflare-email-worker/: info — unsupported area (node): no tier-2 profile, so it is not a component;; go/cloudflare-email-worker/ test `npm test`: sub_area — runs in go/cloudflare-email-worker/: not the primary stack; never a ro; go/cloudflare-email-worker/ typecheck `npm run typecheck`: sub_area — runs in go/cloudflare-email-worker/: not the pr |
| qrCodeBuilder | main | 2 | approve (dirty: 2) | flutter |  | lint=`flutter analyze`<br>build=`discover` | resolved 9 | 2/0/6 DART-FORMAT,LOCAL-MIRROR | (root) test `flutter test test/data_tab_sync_test.dart`: narrow — not the repo-wide test (single-path: tests one package or path, not th; (root) build `flutter build ios --release --no-codesign --build-number=${{`: unverifiable — contains a GitHub Actions ${{ }} expression; it only runs inside a wor |
| quanta-local | main | 0 | approve | general |  | build=`make build` | resolved 1 | 0/0/20 | unsupported areas: api/, billing/, marketing/, mocks/, portal/, seed/cli/; api/: info — unsupported area (node): no tier-2 profile, so it is not a component;; billing/: info — unsupported area (node): no tier-2 profile, so it is not a component;; marketing/: info — unsupported area (node): no tier-2 profile, so it is not a component;; mocks/: info — unsupported area (node): no tier-2 profile, so i |
| recycling-oracle | main | 281 | approve (dirty: 281) | general | recycling-oracle-flutter/(flutter), recycling-oracle-go/(go) |  | resolved 17 | 0/0/6 | unsupported areas: pi-agent/, pipeline/; pi-agent/: info — unsupported area (python): no tier-2 profile, so it is not a component; pipeline/: info — unsupported area (python): no tier-2 profile, so it is not a component |
| smartWellness | df/riverpod3-bump | 4 | approve (dirty: 4) | go | flutter/admin/(flutter) | build=`make build`<br>deps=`make gen-dart`<br>codegen=`make proto`<br>test=`make test` | resolved 18 | 7/3/18 GO-FMT,GO-GEN-DRIFT,GO-RACE | (root) build `make verify-deploy`: alternate — canonical pick: make build; (root) test `make test-migrations`: narrow — not the repo-wide test (run-filter: runs only the tests a name filter; (root) test `go test ./app/cms/...`: narrow — not the repo-wide test (single-path: tests one package or path, not th; (root) test `go test -run TestValidateBlocks ./app/cms`: narrow — not the repo-wide test (r |
| torrentConsole | main | 0 | approve | flutter |  | e2e=`maestro test .maestro` | resolved 10 | 0/1/1 |  |
| trades | main | 0 | approve | general |  | deps=`npm ci`<br>typecheck=`discover`<br>build=`npm run build`<br>test=`npx vitest --run`<br>audit=`npm run audit:chunks`<br>codegen=`npm run db:generate`<br>e2e=`npm run test:e2e` | resolved 6 | 3/0/15 JS-AUDIT,JS-LINT,LOCAL-MIRROR | (root): info — unsupported area (tauri): no tier-2 profile, so it is not a component;; (root) typecheck `npx tsc --noEmit`: unverifiable — tsc is neither installed under node_modules/.bin nor a declared depend; (root) test `npm run test:api`: narrow — not the repo-wide test (single-path: tests one package or path, not th; (root) test `npm run test:dependencies`: narrow — not the repo-wide test (si |
| videoArchive | main | 16 | approve (dirty: 16) | flutter |  | build=`flutter build ios --release --no-codesign`<br>lint=`flutter analyze`<br>e2e=`maestro test .maestro` | resolved 11 | 2/3/3 DART-FORMAT,DART-TEST | (root) test `flutter test test/widget_test.dart`: narrow — not the repo-wide test (single-path: tests one package or path, not th |

## Skipped (worktree)

- aocore-627 (.git is a file)
- aodex-clean (.git is a file)
- aodex-desktop (.git is a file)
- aodex-obj56 (.git is a file)
- aodex-prodtest (.git is a file)
- aodex-wbfix (.git is a file)
- aoedge-main (.git is a file)
- aoid-household (.git is a file)
- aoid-plans (.git is a file)
- eden-biz-103 (.git is a file)
- eden-biz-autotrial (.git is a file)
- eden-biz-mobile (no .planning)

## Approval

Edit a line to `approve` / `skip` / `report-only` / `force`, append `+test` where local tests are safe. Defaults below.

`override:<path>` (added 2026-09-29, user decision "hand-fix rows, then roll out"): instead of `stack init --write`, copy the hand-reviewed file at `<path>` (relative to this dir) to the repo's `.planning/STACK.md`, then continue with validate / verify --run / report --write / two-file commit exactly as for `approve`. The 11 overrides fix drafter defects tracked as objective 43.

- ao-terminal: approve override:overrides/ao-terminal.STACK.md (dirty: 1)
- aocore: approve override:overrides/aocore.STACK.md (dirty: 22)
- aocyber-deploy: skip (user: PoC/reference-only)
- aodex: approve override:overrides/aodex.STACK.md (dirty: 206)
- aoedge: approve override:overrides/aoedge.STACK.md (dirty: 1)
- aofamily: approve (dirty: 4)
- aoid: approve (dirty: 14)
- aoinference: approve (dirty: 3)
- AOSignal: approve (dirty: 1)
- aostudio: approve (dirty: 3)
- devcluster: approve override:overrides/devcluster.STACK.md (dirty: 11)
- devflow: approve (dirty: 2)
- devflow-claude: skip (self)
- devflow-test: approve (dirty: 3)
- devflowops: approve override:overrides/devflowops.STACK.md (dirty: 2)
- dfip: approve
- eden-biz: approve override:overrides/eden-biz.STACK.md (dirty: 9)
- eden-circle: approve (dirty: 36)
- eden-libs: approve (dirty: 75)
- eden-platform-go: approve (dirty: 3)
- eden-press: approve (dirty: 3)
- eden-ui-flutter: approve (dirty: 2)
- EdenDocs: approve override:overrides/EdenDocs.STACK.md (dirty: 3)
- github-enterprise-migration: approve (dirty: 2)
- justin-donnaruma-us-go: blocked (stack-files-gitignored)
- justinforme: approve (dirty: 125)
- navigators: approve override:overrides/navigators.STACK.md (dirty: 24)
- opsCluster: approve (dirty: 7)
- politihub: approve override:overrides/politihub.STACK.md (dirty: 2)
- qrCodeBuilder: approve (dirty: 2)
- quanta-local: approve override:overrides/quanta-local.STACK.md
- recycling-oracle: approve (dirty: 281)
- smartWellness: approve (dirty: 4)
- torrentConsole: approve
- trades: approve
- videoArchive: approve (dirty: 16)

```json baseline
{
  "canonical_count": 36,
  "repos": {
    "/Users/justin/dev/ao-terminal": {
      "porcelain_sha1": "c654f11232a234dd9f312c3f63ae5d9b6c487b6d",
      "head": "1e7ffb39321e9ef449a1b5d9852387170142356a",
      "dirty": 1,
      "dirty_paths": [
        ".planning/.progress-guard.json"
      ],
      "decision": "approve",
      "reason": "dirty: 1"
    },
    "/Users/justin/dev/aocore": {
      "porcelain_sha1": "ab715cdb5ae7a3ac0b89f691f97064542ace3ae0",
      "head": "8eac8e0077f04ac7b960481c35a6ef845ff5cca7",
      "dirty": 22,
      "dirty_paths": [
        ".planning/.awareness-cache.json",
        ".planning/.progress-guard.json",
        "admin/analysis_options.yaml",
        "admin/pubspec.lock",
        "go/.planning/.awareness-cache.json",
        "92-provenance-graph.png",
        "admin-dashboard.png",
        "admin/e2e/uat-report/",
        "assets/",
        "cover.png",
        "docs/architecture/aoaudit-observability-decision.md",
        "docs/architecture/observability-build-assessment.md",
        "docs/architecture/observability-build-plan.md",
        "docs/compliance/PQC_GAP.md",
        "docs/compliance/PQC_TRD_01_fips140-mlkem-curve-pinning.md",
        "docs/compliance/PQC_TRD_02_post-quantum-signatures-now.md",
        "docs/compliance/pqc-probe/",
        "docs/marketing/",
        "docs/review/",
        "go/.planning/.progress-guard.json",
        "graph-initial.png",
        "review-queue.png"
      ],
      "decision": "approve",
      "reason": "dirty: 22"
    },
    "/Users/justin/dev/aocyber-deploy": {
      "porcelain_sha1": "da39a3ee5e6b4b0d3255bfef95601890afd80709",
      "head": "787937feb4d9fb28f6fb5c0ddbd0f48a85d3338f",
      "dirty": 0,
      "dirty_paths": [],
      "decision": "skip",
      "reason": "user: PoC/reference-only"
    },
    "/Users/justin/dev/aodex": {
      "porcelain_sha1": "6e09dc8773dc61f5b77d9de649e73483f071a8d4",
      "head": "3f1d747346845e572ad8b3d01c56036fe7b1528d",
      "dirty": 206,
      "dirty_paths": [
        ".planning/.awareness-cache.json",
        ".planning/.progress-guard.json",
        "CLAUDE.md",
        "flutter/.planning/.progress-guard.json",
        "flutter/analysis_options.yaml",
        "flutter/pubspec.lock",
        "flutter/test/ui_eval/failures/grid-edited_isolatedDiff.png",
        "flutter/test/ui_eval/failures/grid-edited_maskedDiff.png",
        "flutter/test/ui_eval/failures/grid-edited_masterImage.png",
        "flutter/test/ui_eval/failures/grid-edited_testImage.png",
        "flutter/test/ui_eval/failures/grid-narrow-mobile_isolatedDiff.png",
        "flutter/test/ui_eval/failures/grid-narrow-mobile_maskedDiff.png",
        "flutter/test/ui_eval/failures/grid-narrow-mobile_masterImage.png",
        "flutter/test/ui_eval/failures/grid-narrow-mobile_testImage.png",
        "flutter/test/ui_eval/failures/grid-populated_isolatedDiff.png",
        "flutter/test/ui_eval/failures/grid-populated_maskedDiff.png",
        "flutter/test/ui_eval/failures/grid-populated_masterImage.png",
        "flutter/test/ui_eval/failures/grid-populated_testImage.png",
        "flutter/test/ui_eval/failures/narrow_viewport_isolatedDiff.png",
        "flutter/test/ui_eval/failures/narrow_viewport_maskedDiff.png",
        "flutter/test/ui_eval/failures/narrow_viewport_masterImage.png",
        "flutter/test/ui_eval/failures/narrow_viewport_mobile_isolatedDiff.png",
        "flutter/test/ui_eval/failures/narrow_viewport_mobile_maskedDiff.png",
        "flutter/test/ui_eval/failures/narrow_viewport_mobile_masterImage.png",
        "flutter/test/ui_eval/failures/narrow_viewport_mobile_testImage.png",
        "flutter/test/ui_eval/failures/narrow_viewport_testImage.png",
        "flutter/test/ui_eval/failures/preview-only_isolatedDiff.png",
        "flutter/test/ui_eval/failures/preview-only_maskedDiff.png",
        "flutter/test/ui_eval/failures/preview-only_masterImage.png",
        "flutter/test/ui_eval/failures/preview-only_testImage.png",
        "go/.planning/.progress-guard.json",
        ".claude/",
        ".devflow-handoff/",
        ".repro/",
        "dev-local-aocore.sh",
        "docs/AODex-as-a-Harness.pdf",
        "flutter/test/ui_eval/failures/already_added_remove_isolatedDiff.png",
        "flutter/test/ui_eval/failures/already_added_remove_maskedDiff.png",
        "flutter/test/ui_eval/failures/already_added_remove_masterImage.png",
        "flutter/test/ui_eval/failures/already_added_remove_testImage.png",
        "flutter/test/ui_eval/failures/choose_base_multi_isolatedDiff.png",
        "flutter/test/ui_eval/failures/choose_base_multi_maskedDiff.png",
        "flutter/test/ui_eval/failures/choose_base_multi_masterImage.png",
        "flutter/test/ui_eval/failures/choose_base_multi_testImage.png",
        "flutter/test/ui_eval/failures/copy_vs_live_copy_isolatedDiff.png",
        "flutter/test/ui_eval/failures/copy_vs_live_copy_maskedDiff.png",
        "flutter/test/ui_eval/failures/copy_vs_live_copy_masterImage.png",
        "flutter/test/ui_eval/failures/copy_vs_live_copy_testImage.png",
        "flutter/test/ui_eval/failures/copy_vs_live_link_isolatedDiff.png",
        "flutter/test/ui_eval/failures/copy_vs_live_link_maskedDiff.png",
        "flutter/test/ui_eval/failures/copy_vs_live_link_masterImage.png",
        "flutter/test/ui_eval/failures/copy_vs_live_link_testImage.png",
        "flutter/test/ui_eval/failures/default-badge_isolatedDiff.png",
        "flutter/test/ui_eval/failures/default-badge_maskedDiff.png",
        "flutter/test/ui_eval/failures/default-badge_masterImage.png",
        "flutter/test/ui_eval/failures/default-badge_testImage.png",
        "flutter/test/ui_eval/failures/desktop_expanded_isolatedDiff.png",
        "flutter/test/ui_eval/failures/desktop_expanded_maskedDiff.png",
        "flutter/test/ui_eval/failures/desktop_expanded_masterImage.png",
        "flutter/test/ui_eval/failures/desktop_expanded_testImage.png",
        "flutter/test/ui_eval/failures/empty_bases_no_documents_isolatedDiff.png",
        "flutter/test/ui_eval/failures/empty_bases_no_documents_maskedDiff.png",
        "flutter/test/ui_eval/failures/empty_bases_no_documents_masterImage.png",
        "flutter/test/ui_eval/failures/empty_bases_no_documents_testImage.png",
        "flutter/test/ui_eval/failures/empty_isolatedDiff.png",
        "flutter/test/ui_eval/failures/empty_maskedDiff.png",
        "flutter/test/ui_eval/failures/empty_masterImage.png",
        "flutter/test/ui_eval/failures/empty_testImage.png",
        "flutter/test/ui_eval/failures/error_isolatedDiff.png",
        "flutter/test/ui_eval/failures/error_maskedDiff.png",
        "flutter/test/ui_eval/failures/error_masterImage.png",
        "flutter/test/ui_eval/failures/error_testImage.png",
        "flutter/test/ui_eval/failures/failed_document_with_reason_isolatedDiff.png",
        "flutter/test/ui_eval/failures/failed_document_with_reason_maskedDiff.png",
        "flutter/test/ui_eval/failures/failed_document_with_reason_masterImage.png",
        "flutter/test/ui_eval/failures/failed_document_with_reason_testImage.png",
        "flutter/test/ui_eval/failures/failure_mobile_isolatedDiff.png",
        "flutter/test/ui_eval/failures/failure_mobile_maskedDiff.png",
        "flutter/test/ui_eval/failures/failure_mobile_masterImage.png",
        "flutter/test/ui_eval/failures/failure_mobile_testImage.png",
        "flutter/test/ui_eval/failures/failure_sentence_isolatedDiff.png",
        "flutter/test/ui_eval/failures/failure_sentence_maskedDiff.png",
        "flutter/test/ui_eval/failures/failure_sentence_masterImage.png",
        "flutter/test/ui_eval/failures/failure_sentence_testImage.png",
        "flutter/test/ui_eval/failures/favorites-sorted_isolatedDiff.png",
        "flutter/test/ui_eval/failures/favorites-sorted_maskedDiff.png",
        "flutter/test/ui_eval/failures/favorites-sorted_masterImage.png",
        "flutter/test/ui_eval/failures/favorites-sorted_testImage.png",
        "flutter/test/ui_eval/failures/flat_rail_expanded_isolatedDiff.png",
        "flutter/test/ui_eval/failures/flat_rail_expanded_maskedDiff.png",
        "flutter/test/ui_eval/failures/flat_rail_expanded_masterImage.png",
        "flutter/test/ui_eval/failures/flat_rail_expanded_testImage.png",
        "flutter/test/ui_eval/failures/folder_picker_multi_desktop_isolatedDiff.png",
        "flutter/test/ui_eval/failures/folder_picker_multi_desktop_maskedDiff.png",
        "flutter/test/ui_eval/failures/folder_picker_multi_desktop_masterImage.png",
        "flutter/test/ui_eval/failures/folder_picker_multi_desktop_testImage.png",
        "flutter/test/ui_eval/failures/four_ways_menu_isolatedDiff.png",
        "flutter/test/ui_eval/failures/four_ways_menu_maskedDiff.png",
        "flutter/test/ui_eval/failures/four_ways_menu_masterImage.png",
        "flutter/test/ui_eval/failures/four_ways_menu_testImage.png",
        "flutter/test/ui_eval/failures/linked_with_copy_isolatedDiff.png",
        "flutter/test/ui_eval/failures/linked_with_copy_maskedDiff.png",
        "flutter/test/ui_eval/failures/linked_with_copy_masterImage.png",
        "flutter/test/ui_eval/failures/linked_with_copy_testImage.png",
        "flutter/test/ui_eval/failures/long_names_isolatedDiff.png",
        "flutter/test/ui_eval/failures/long_names_maskedDiff.png",
        "flutter/test/ui_eval/failures/long_names_masterImage.png",
        "flutter/test/ui_eval/failures/long_names_testImage.png",
        "flutter/test/ui_eval/failures/narrow-viewport-mobile_isolatedDiff.png",
        "flutter/test/ui_eval/failures/narrow-viewport-mobile_maskedDiff.png",
        "flutter/test/ui_eval/failures/narrow-viewport-mobile_masterImage.png",
        "flutter/test/ui_eval/failures/narrow-viewport-mobile_testImage.png",
        "flutter/test/ui_eval/failures/newly-added-filter_isolatedDiff.png",
        "flutter/test/ui_eval/failures/newly-added-filter_maskedDiff.png",
        "flutter/test/ui_eval/failures/newly-added-filter_masterImage.png",
        "flutter/test/ui_eval/failures/newly-added-filter_testImage.png",
        "flutter/test/ui_eval/failures/notifications_badge_isolatedDiff.png",
        "flutter/test/ui_eval/failures/notifications_badge_maskedDiff.png",
        "flutter/test/ui_eval/failures/notifications_badge_masterImage.png",
        "flutter/test/ui_eval/failures/notifications_badge_testImage.png",
        "flutter/test/ui_eval/failures/one_base_unreachable_isolatedDiff.png",
        "flutter/test/ui_eval/failures/one_base_unreachable_maskedDiff.png",
        "flutter/test/ui_eval/failures/one_base_unreachable_masterImage.png",
        "flutter/test/ui_eval/failures/one_base_unreachable_testImage.png",
        "flutter/test/ui_eval/failures/pending_isolatedDiff.png",
        "flutter/test/ui_eval/failures/pending_maskedDiff.png",
        "flutter/test/ui_eval/failures/pending_masterImage.png",
        "flutter/test/ui_eval/failures/pending_testImage.png",
        "flutter/test/ui_eval/failures/picker_with_already_added_isolatedDiff.png",
        "flutter/test/ui_eval/failures/picker_with_already_added_maskedDiff.png",
        "flutter/test/ui_eval/failures/picker_with_already_added_masterImage.png",
        "flutter/test/ui_eval/failures/picker_with_already_added_testImage.png",
        "flutter/test/ui_eval/failures/populated_isolatedDiff.png",
        "flutter/test/ui_eval/failures/populated_maskedDiff.png",
        "flutter/test/ui_eval/failures/populated_masterImage.png",
        "flutter/test/ui_eval/failures/populated_multi_base_isolatedDiff.png",
        "flutter/test/ui_eval/failures/populated_multi_base_maskedDiff.png",
        "flutter/test/ui_eval/failures/populated_multi_base_masterImage.png",
        "flutter/test/ui_eval/failures/populated_multi_base_testImage.png",
        "flutter/test/ui_eval/failures/populated_testImage.png",
        "flutter/test/ui_eval/failures/project_move_leaves_no_trace_isolatedDiff.png",
        "flutter/test/ui_eval/failures/project_move_leaves_no_trace_maskedDiff.png",
        "flutter/test/ui_eval/failures/project_move_leaves_no_trace_masterImage.png",
        "flutter/test/ui_eval/failures/project_move_leaves_no_trace_testImage.png",
        "flutter/test/ui_eval/failures/project_picker_multi_desktop_isolatedDiff.png",
        "flutter/test/ui_eval/failures/project_picker_multi_desktop_maskedDiff.png",
        "flutter/test/ui_eval/failures/project_picker_multi_desktop_masterImage.png",
        "flutter/test/ui_eval/failures/project_picker_multi_desktop_testImage.png",
        "flutter/test/ui_eval/failures/selection_desktop_isolatedDiff.png",
        "flutter/test/ui_eval/failures/selection_desktop_maskedDiff.png",
        "flutter/test/ui_eval/failures/selection_desktop_masterImage.png",
        "flutter/test/ui_eval/failures/selection_desktop_testImage.png",
        "flutter/test/ui_eval/failures/settings_data_isolatedDiff.png",
        "flutter/test/ui_eval/failures/settings_data_maskedDiff.png",
        "flutter/test/ui_eval/failures/settings_data_masterImage.png",
        "flutter/test/ui_eval/failures/settings_data_testImage.png",
        "flutter/test/ui_eval/failures/settings_empty_isolatedDiff.png",
        "flutter/test/ui_eval/failures/settings_empty_maskedDiff.png",
        "flutter/test/ui_eval/failures/settings_empty_masterImage.png",
        "flutter/test/ui_eval/failures/settings_empty_testImage.png",
        "flutter/test/ui_eval/failures/settings_error_isolatedDiff.png",
        "flutter/test/ui_eval/failures/settings_error_maskedDiff.png",
        "flutter/test/ui_eval/failures/settings_error_masterImage.png",
        "flutter/test/ui_eval/failures/settings_error_testImage.png",
        "flutter/test/ui_eval/failures/settings_loading_isolatedDiff.png",
        "flutter/test/ui_eval/failures/settings_loading_maskedDiff.png",
        "flutter/test/ui_eval/failures/settings_loading_masterImage.png",
        "flutter/test/ui_eval/failures/settings_loading_testImage.png",
        "flutter/test/ui_eval/failures/settings_narrow_isolatedDiff.png",
        "flutter/test/ui_eval/failures/settings_narrow_maskedDiff.png",
        "flutter/test/ui_eval/failures/settings_narrow_masterImage.png",
        "flutter/test/ui_eval/failures/settings_narrow_testImage.png",
        "flutter/test/ui_eval/failures/settings_saving_isolatedDiff.png",
        "flutter/test/ui_eval/failures/settings_saving_maskedDiff.png",
        "flutter/test/ui_eval/failures/settings_saving_masterImage.png",
        "flutter/test/ui_eval/failures/settings_saving_testImage.png",
        "flutter/test/ui_eval/failures/shared_root_narrow_isolatedDiff.png",
        "flutter/test/ui_eval/failures/shared_root_narrow_maskedDiff.png",
        "flutter/test/ui_eval/failures/shared_root_narrow_masterImage.png",
        "flutter/test/ui_eval/failures/shared_root_narrow_testImage.png",
        "flutter/test/ui_eval/failures/solo_account_no_teams_isolatedDiff.png",
        "flutter/test/ui_eval/failures/solo_account_no_teams_maskedDiff.png",
        "flutter/test/ui_eval/failures/solo_account_no_teams_masterImage.png",
        "flutter/test/ui_eval/failures/solo_account_no_teams_testImage.png",
        "flutter/test/ui_eval/failures/sorted_by_base_isolatedDiff.png",
        "flutter/test/ui_eval/failures/sorted_by_base_maskedDiff.png",
        "flutter/test/ui_eval/failures/sorted_by_base_masterImage.png",
        "flutter/test/ui_eval/failures/sorted_by_base_testImage.png",
        "flutter/test/ui_eval/failures/switcher_open_personal_isolatedDiff.png",
        "flutter/test/ui_eval/failures/switcher_open_personal_maskedDiff.png",
        "flutter/test/ui_eval/failures/switcher_open_personal_masterImage.png",
        "flutter/test/ui_eval/failures/switcher_open_personal_testImage.png",
        "flutter/test/ui_eval/failures/switcher_open_team_isolatedDiff.png",
        "flutter/test/ui_eval/failures/switcher_open_team_maskedDiff.png",
        "flutter/test/ui_eval/failures/switcher_open_team_masterImage.png",
        "flutter/test/ui_eval/failures/switcher_open_team_testImage.png",
        "flutter/test/ui_eval/failures/tile_menu_desktop_isolatedDiff.png",
        "flutter/test/ui_eval/failures/tile_menu_desktop_maskedDiff.png",
        "flutter/test/ui_eval/failures/tile_menu_desktop_masterImage.png",
        "flutter/test/ui_eval/failures/tile_menu_desktop_testImage.png",
        "flutter/test/ui_eval/failures/truncated_covers_loaded_only_isolatedDiff.png",
        "flutter/test/ui_eval/failures/truncated_covers_loaded_only_maskedDiff.png",
        "flutter/test/ui_eval/failures/truncated_covers_loaded_only_masterImage.png",
        "flutter/test/ui_eval/failures/truncated_covers_loaded_only_testImage.png",
        "openapitools.json",
        "unpushed-e2e/"
      ],
      "decision": "approve",
      "reason": "dirty: 206"
    },
    "/Users/justin/dev/aoedge": {
      "porcelain_sha1": "bda2d708bf5b7b262dfffcd2796d66f439676900",
      "head": "512b35a1b7f2a45a1ed7024c02a5dab8fdc1016b",
      "dirty": 1,
      "dirty_paths": [
        ".planning/PROJECT.md"
      ],
      "decision": "approve",
      "reason": "dirty: 1"
    },
    "/Users/justin/dev/aofamily": {
      "porcelain_sha1": "8fea5836c7c4fd10954598adeece9d5bb2914fe9",
      "head": "69406407c58450179e934f561494d1b2e0016955",
      "dirty": 4,
      "dirty_paths": [
        ".planning/.progress-guard.json",
        "ai/.planning/.progress-guard.json",
        "browser/.planning/.progress-guard.json",
        "connect/.planning/.progress-guard.json"
      ],
      "decision": "approve",
      "reason": "dirty: 4"
    },
    "/Users/justin/dev/aoid": {
      "porcelain_sha1": "b92af15e6af1cea2f16d466693fcf429132c5b65",
      "head": "02d6f4bb3541a85524cbece8929d2c08fcf02015",
      "dirty": 14,
      "dirty_paths": [
        ".planning/.awareness-cache.json",
        ".claude/",
        ".planning/.micro-description",
        ".planning/.progress-guard.json",
        ".planning/objectives/50-aoid-flutter-embed-sdk-eden-platform-flutter-aoid-module-aod/50-16-SUMMARY.md",
        ".planning/quick/5-tolerant-golden-comparator-ci-robust-mar/",
        ".planning/reports/50-25-baseline-artifacts/",
        ".planning/reports/50-25-eden-biz-devcluster-baseline.md",
        ".planning/reports/riverpod3-analyze-baseline-aofamily.txt",
        ".planning/reports/riverpod3-analyze-baseline-aoid-plans.txt",
        ".planning/reports/riverpod3-analyze-baseline-navigators.txt",
        ".planning/reports/riverpod3-analyze-baseline-smartwellness.txt",
        ".playwright-mcp/",
        "light-live.png"
      ],
      "decision": "approve",
      "reason": "dirty: 14"
    },
    "/Users/justin/dev/aoinference": {
      "porcelain_sha1": "8859e40fc94c052680f98d2dc102fe2a99163c20",
      "head": "b2cc37d6e1960bbdf6faf0d630f328ce026fe1ff",
      "dirty": 3,
      "dirty_paths": [
        ".claude/",
        ".planning/.dup-detect-log.jsonl",
        "docs/MODEL-SELECTION-2026-09.md"
      ],
      "decision": "approve",
      "reason": "dirty: 3"
    },
    "/Users/justin/dev/AOSignal": {
      "porcelain_sha1": "08e77568e7fc0cde3e0a6621505957f448e70e43",
      "head": "c58a14229878c08105a29c4d6ae8af32183a3346",
      "dirty": 1,
      "dirty_paths": [
        ".planning/config.json"
      ],
      "decision": "approve",
      "reason": "dirty: 1"
    },
    "/Users/justin/dev/aostudio": {
      "porcelain_sha1": "970208d7067f6128d3de3659509c29c5414c216b",
      "head": "6325c0f77d32ceb5694a043575a80ccbd6f8dd0a",
      "dirty": 3,
      "dirty_paths": [
        ".planning/.awareness-cache.json",
        ".planning/.progress-guard.json",
        ".playwright-mcp/"
      ],
      "decision": "approve",
      "reason": "dirty: 3"
    },
    "/Users/justin/dev/devcluster": {
      "porcelain_sha1": "d98a79bdbe95e9f9ff2bba2c0a9227c83410b6d5",
      "head": "0a887cf4f3fd30cd51b50f0feceba9b0bbb70612",
      "dirty": 11,
      "dirty_paths": [
        "bin/deploy.sh",
        "config/apps.yaml",
        "t2-cluster/ctl.sh",
        "t2-cluster/tenants/dev.yaml",
        "t2-cluster/values/aoedge.yaml",
        ".planning/.awareness-cache.json",
        ".planning/.progress-guard.json",
        ".planning/PROJECT.md",
        ".planning/REQUIREMENTS.md",
        ".planning/objectives/01-developer-auth-personas/01-CONTEXT.md",
        ".planning/objectives/01-developer-auth-personas/OBJECTIVE.md"
      ],
      "decision": "approve",
      "reason": "dirty: 11"
    },
    "/Users/justin/dev/devflow": {
      "porcelain_sha1": "b39e1cd68bae3a4002242095eab5431e035a68b0",
      "head": "e04007e8713960fe533adf4572315d6a1bf457d0",
      "dirty": 2,
      "dirty_paths": [
        ".planning/.progress-guard.json",
        ".planning/journal.jsonl"
      ],
      "decision": "approve",
      "reason": "dirty: 2"
    },
    "/Users/justin/dev/devflow-claude": {
      "porcelain_sha1": "50cbcd5cd8b3425615edf3ca25f77bc0736677f4",
      "head": "f8f9b9db00b1c5a64cc018eae39a4d39ae2ab685",
      "dirty": 10,
      "dirty_paths": [
        ".planning/objectives/26-github-issue-auto-build-monitor/.gitkeep",
        ".planning/objectives/27-gate-correctness/.gitkeep",
        ".planning/objectives/28-model-tier-binding-and-escalation/.gitkeep",
        ".planning/objectives/29-context-discipline/.gitkeep",
        ".planning/objectives/30-agent-environment-hygiene/.gitkeep",
        ".planning/objectives/31-telemetry-and-retention/.gitkeep",
        ".planning/objectives/42-codebase-aware-stack-drafter/42-ROLLOUT.md",
        "docs/CODEX-PORT.md",
        "docs/PROPOSAL-visual-workflow-class.md",
        "plugins/devflow/devflow/references/codex-agent-policy.md"
      ],
      "decision": "skip",
      "reason": "self"
    },
    "/Users/justin/dev/devflow-test": {
      "porcelain_sha1": "ae552a66a9656e02e7bee3299a7223647130e7bf",
      "head": "b54f726217f10e7aa1c9ee58da027f9c73bd0285",
      "dirty": 3,
      "dirty_paths": [
        ".planning/config.json",
        ".planning/.dup-detect-log.jsonl",
        ".planning/objectives/01-scaffold-config-and-model-client/OBJECTIVE.md"
      ],
      "decision": "approve",
      "reason": "dirty: 3"
    },
    "/Users/justin/dev/devflowops": {
      "porcelain_sha1": "0b94b9fd8c46a7257b54ca843a75ea7f30831996",
      "head": "1d17dd4ba8a9c5e37d3fc3233915bf63b07911ea",
      "dirty": 2,
      "dirty_paths": [
        ".planning/.dup-detect-log.jsonl",
        ".planning/.progress-guard.json"
      ],
      "decision": "approve",
      "reason": "dirty: 2"
    },
    "/Users/justin/dev/dfip": {
      "porcelain_sha1": "da39a3ee5e6b4b0d3255bfef95601890afd80709",
      "head": "4ee5228cb637cd6ecc5e69fb71ce119b718c3527",
      "dirty": 0,
      "dirty_paths": [],
      "decision": "approve",
      "reason": ""
    },
    "/Users/justin/dev/eden-biz": {
      "porcelain_sha1": "bcddb5cedb10b39ec62b02e661b2d00b8d5e6e37",
      "head": "7637aa12400d2f3af9f49f078775f719910b7e90",
      "dirty": 9,
      "dirty_paths": [
        ".planning/.awareness-cache.json",
        ".planning/.dup-detect-log.jsonl",
        ".planning/.progress-guard.json",
        "go/.planning/.progress-guard.json",
        ".devflow-handoff/",
        ".planning/handoffs/subscription-created-cancelled-context.md",
        ".planning/objectives/720-polymorphic-coupon-redemption-source/720-VERIFICATION.md",
        ".planning/objectives/723-wire-money-paths-to-coupon-resolver/OBJECTIVE.md",
        ".worktrees/"
      ],
      "decision": "approve",
      "reason": "dirty: 9"
    },
    "/Users/justin/dev/eden-circle": {
      "porcelain_sha1": "4258255c98dc2c730caa0ab3de68e8d5d795496a",
      "head": "bf6fc191c9fa41e388d4d5bac165ac92f338f4e0",
      "dirty": 36,
      "dirty_paths": [
        ".claude/agent-memory/devflow-verifier/MEMORY.md",
        ".planning/.awareness-cache.json",
        ".planning/.progress-guard.json",
        "test/calling-harness/ev-01-callee-incall.jpg",
        "test/calling-harness/ev-01-ringing.jpg",
        "test/calling-harness/ev-stale-ringing.jpg",
        ".claude/agent-memory/devflow-verifier/obj35-return-to-dm-verification.md",
        ".claude/agent-memory/devflow-verifier/obj36-initstate-audit-verification.md",
        ".claude/worktrees/agent-a02a016504515c389/",
        ".claude/worktrees/agent-a0f2da42d71cdae0a/",
        ".claude/worktrees/agent-a29bc72737c050fce/",
        ".claude/worktrees/agent-a31aa1669ad8af627/",
        ".claude/worktrees/agent-a4c444a0ec0e4aac3/",
        ".claude/worktrees/agent-a4d0e05bd19e258bb/",
        ".claude/worktrees/agent-a6179bfcb0b4b0167/",
        ".claude/worktrees/agent-a6dfa12ab075b892e/",
        ".claude/worktrees/agent-a7b64309fa550f535/",
        ".claude/worktrees/agent-a7eaa5cb296c69f3c/",
        ".claude/worktrees/agent-a9ce5cd17ba97bb1c/",
        ".claude/worktrees/agent-a9fa711663f361d4b/",
        ".claude/worktrees/agent-aa2187ce47e0bac27/",
        ".claude/worktrees/agent-aa25694135c4166ca/",
        ".claude/worktrees/agent-ae35a0d7836f78e6f/",
        ".claude/worktrees/agent-ae98ef9b5c5ca82f0/",
        ".claude/worktrees/agent-af10575e667838bd9/",
        ".claude/worktrees/agent-af49017a5684f2be4/",
        ".playwright-mcp/acceptcall.network-response",
        ".playwright-mcp/console-2026-09-01T02-26-28-299Z.log",
        ".playwright-mcp/console-2026-09-01T02-26-30-210Z.log",
        ".playwright-mcp/initiatecall.network-request",
        ".playwright-mcp/initiatecall.network-response",
        ".playwright-mcp/listchannels.network-response",
        ".playwright-mcp/page-2026-09-01T02-26-28-355Z.yml",
        ".playwright-mcp/page-2026-09-01T02-26-30-246Z.yml",
        ".playwright-mcp/prekeybundle.network-response",
        ".playwright-mcp/scenario1-incoming-call.png"
      ],
      "decision": "approve",
      "reason": "dirty: 36"
    },
    "/Users/justin/dev/eden-libs": {
      "porcelain_sha1": "f4f0a6ca03884c1fbaab7651add89c0199220b26",
      "head": "1b094806ec8a05af5861c0af3a27af48d51dec69",
      "dirty": 75,
      "dirty_paths": [
        ".claude/worktrees/ws-platform-household-claims-go",
        ".planning/.micro-description",
        "eden-experience-flutter/pubspec.lock",
        "eden-platform-api-dart/.dart_tool/package_config.json",
        "eden-platform-api-dart/.dart_tool/package_graph.json",
        ".claude/worktrees/ws-aofamily-billing-ent-go/",
        ".devflow-handoff/",
        ".planning/.awareness-cache.json",
        ".planning/.dup-detect-log.jsonl",
        ".planning/.progress-guard.json",
        ".planning/STATE_ARCHIVE.md",
        ".planning/objectives/37-html-explorer-workshop/OBJECTIVE.md",
        ".planning/objectives/38-flutter-explorer/38-RESEARCH.md",
        ".planning/objectives/38-flutter-explorer/OBJECTIVE.md",
        ".planning/objectives/42-eden-document-editor-phase-0b-headless-selection-model-and-c/.gitkeep",
        ".planning/objectives/43-eden-document-editor-phase-0c-loro-dart-binding-vertical-sli/.gitkeep",
        ".planning/quick/3-web-autofill-geometry-shim-so-password-m/3-JOB.md",
        ".planning/quick/5-relax-eden-doc-model-meta-pin-to-1-17-0-/",
        ".planning/state.json",
        ".playwright-mcp/console-2026-09-24T16-57-16-749Z.log",
        ".playwright-mcp/console-2026-09-28T13-26-28-498Z.log",
        ".playwright-mcp/console-2026-09-28T20-07-01-347Z.log",
        ".playwright-mcp/dr-01-top.png",
        ".playwright-mcp/dr-02.png",
        ".playwright-mcp/dr-03.png",
        ".playwright-mcp/dr-04.png",
        ".playwright-mcp/dr-05-table.png",
        ".playwright-mcp/dr-06-end.png",
        ".playwright-mcp/page-2026-09-16T15-08-51-650Z.yml",
        ".playwright-mcp/page-2026-09-24T16-34-52-641Z.yml",
        ".playwright-mcp/page-2026-09-24T16-35-46-664Z.yml",
        ".playwright-mcp/page-2026-09-24T16-35-51-211Z.yml",
        ".playwright-mcp/page-2026-09-24T16-57-16-781Z.yml",
        ".playwright-mcp/page-2026-09-24T16-58-25-414Z.yml",
        ".playwright-mcp/page-2026-09-24T17-00-23-169Z.yml",
        ".playwright-mcp/page-2026-09-24T17-01-43-971Z.yml",
        ".playwright-mcp/page-2026-09-24T17-04-00-776Z.yml",
        ".playwright-mcp/page-2026-09-24T17-04-07-615Z.yml",
        ".playwright-mcp/page-2026-09-25T16-02-43-219Z.yml",
        ".playwright-mcp/page-2026-09-25T16-03-29-852Z.png",
        ".playwright-mcp/page-2026-09-25T16-03-50-194Z.png",
        ".playwright-mcp/page-2026-09-25T16-04-12-000Z.png",
        ".playwright-mcp/page-2026-09-25T16-04-30-173Z.png",
        ".playwright-mcp/page-2026-09-25T16-04-48-935Z.png",
        ".playwright-mcp/page-2026-09-25T16-05-11-928Z.png",
        ".playwright-mcp/page-2026-09-25T16-06-13-521Z.png",
        ".playwright-mcp/page-2026-09-25T20-14-22-894Z.yml",
        ".playwright-mcp/page-2026-09-28T13-26-28-541Z.yml",
        ".playwright-mcp/page-2026-09-28T13-28-05-497Z.yml",
        ".playwright-mcp/page-2026-09-28T13-28-17-456Z.png",
        ".playwright-mcp/page-2026-09-28T17-58-13-515Z.yml",
        ".playwright-mcp/page-2026-09-28T18-15-00-086Z.yml",
        ".playwright-mcp/page-2026-09-28T18-15-45-557Z.png",
        ".playwright-mcp/page-2026-09-28T18-42-22-640Z.yml",
        ".playwright-mcp/page-2026-09-28T18-42-24-152Z.png",
        ".playwright-mcp/page-2026-09-28T18-43-01-442Z.yml",
        ".playwright-mcp/page-2026-09-28T18-43-03-079Z.png",
        ".playwright-mcp/page-2026-09-28T18-43-20-093Z.png",
        ".playwright-mcp/page-2026-09-28T18-49-07-502Z.yml",
        ".playwright-mcp/page-2026-09-28T20-07-01-408Z.yml",
        ".playwright-mcp/page-2026-09-28T20-07-03-000Z.png",
        ".playwright-mcp/page-2026-09-28T20-07-25-739Z.png",
        ".playwright-mcp/page-2026-09-28T20-08-21-695Z.png",
        ".playwright-mcp/page-2026-09-28T20-09-04-679Z.png",
        ".playwright-mcp/page-2026-09-28T20-09-36-576Z.png",
        ".playwright-mcp/render-body.png",
        ".playwright-mcp/render-final.png",
        ".playwright-mcp/render-masthead.png",
        ".playwright-mcp/render-narrow.png",
        ".playwright-mcp/render-softbreak-fixed.png",
        ".playwright-mcp/render-top.png",
        "EDEN_APP_LAYER_ARCHITECTURE.md",
        "FLUTTER_UI_GENERALIZATION_REVIEW.md",
        "axe-core-4.12.1.tgz",
        "eden-ui-docs/.devflow-handoff/"
      ],
      "decision": "approve",
      "reason": "dirty: 75"
    },
    "/Users/justin/dev/eden-platform-go": {
      "porcelain_sha1": "d98125470f9431ca4d24f05ea0e8b2ab324f7e0a",
      "head": "08481d08960b44eec2758cc4c7125a0f378bab50",
      "dirty": 3,
      "dirty_paths": [
        ".claude/",
        ".planning/.progress-guard.json",
        ".planning/objectives/40-platform-telephony/"
      ],
      "decision": "approve",
      "reason": "dirty: 3"
    },
    "/Users/justin/dev/eden-press": {
      "porcelain_sha1": "e154cec12f09b3c0238021b3e978431f3582a344",
      "head": "d4e7548a42c99f4ee5b39ba326de3fa458899be4",
      "dirty": 3,
      "dirty_paths": [
        ".claude/",
        ".planning/.awareness-cache.json",
        ".planning/.dup-detect-log.jsonl"
      ],
      "decision": "approve",
      "reason": "dirty: 3"
    },
    "/Users/justin/dev/eden-ui-flutter": {
      "porcelain_sha1": "e93cfab108f386f26fef67cf86ba1801367484ae",
      "head": "44d01cb587e984748134123e43e3b7cf8940c5ad",
      "dirty": 2,
      "dirty_paths": [
        "analysis_options.yaml",
        ".planning/.progress-guard.json"
      ],
      "decision": "approve",
      "reason": "dirty: 2"
    },
    "/Users/justin/dev/EdenDocs": {
      "porcelain_sha1": "e4178acc644f8a6f337864a9c2f869cef5b6648e",
      "head": "7689c50b2640c47d6a51a97d796d53cb640219d5",
      "dirty": 3,
      "dirty_paths": [
        ".planning/.awareness-cache.json",
        ".planning/.dup-detect-log.jsonl",
        ".planning/state.json"
      ],
      "decision": "approve",
      "reason": "dirty: 3"
    },
    "/Users/justin/dev/github-enterprise-migration": {
      "porcelain_sha1": "54f60ac8f4b1c56b51dbb30692af1f4a4245e02b",
      "head": "31942e5babcad253d3ddb413c59b52a914c0eea8",
      "dirty": 2,
      "dirty_paths": [
        ".planning/.awareness-cache.json",
        ".planning/.progress-guard.json"
      ],
      "decision": "approve",
      "reason": "dirty: 2"
    },
    "/Users/justin/dev/justin-donnaruma-us-go": {
      "porcelain_sha1": "da39a3ee5e6b4b0d3255bfef95601890afd80709",
      "head": "d617eb3b0275e4b42344ab16d418f0ad9c3759b5",
      "dirty": 0,
      "dirty_paths": [],
      "decision": "blocked",
      "reason": "stack-files-gitignored"
    },
    "/Users/justin/dev/justinforme": {
      "porcelain_sha1": "31b18b12bd6b8ae59faf853d2d7d5cbac2bdd2c5",
      "head": "1eea3c7d72487437152855388f9927344645cee1",
      "dirty": 125,
      "dirty_paths": [
        ".planning/.awareness-cache.json",
        ".planning/.dup-detect-log.jsonl",
        ".planning/objectives/39-policy-alignment-content-refresh/39-01-alice-canonical-callout-block-TRD.md",
        ".planning/objectives/39-policy-alignment-content-refresh/39-07-homepage-refresh-TRD.md",
        ".planning/objectives/39-policy-alignment-content-refresh/39-11-strategic-frame-grep-gate-TRD.md",
        ".planning/state.json",
        "vendor/github.com/aocybersystems/eden-platform-go/platform/server/interceptors.go",
        ".claude/",
        ".planning/debug/admin-flutter-pre-auth-fetches.md",
        ".planning/debug/donate-cancel.html",
        ".planning/debug/donate-status.html",
        ".planning/debug/donate-success.html",
        ".planning/debug/donate.html",
        ".planning/debug/verify-server.log",
        ".planning/debug/verify-web.log",
        ".planning/debug/verify-web2.log",
        ".planning/debug/web-8091.log",
        ".planning/objectives/33-tailwind-cdn-to-bundle/33-VERIFICATION.md",
        ".planning/objectives/37-stripe-payments-fundraising/37-01-stripe-sdk-env-boot-guards-TRD.md",
        ".planning/objectives/37-stripe-payments-fundraising/37-02-compliance-constants-disclaimers-TRD.md",
        ".planning/objectives/37-stripe-payments-fundraising/37-03-contributions-migration-queries-TRD.md",
        ".planning/objectives/37-stripe-payments-fundraising/37-04-payments-service-handler-TRD.md",
        ".planning/objectives/37-stripe-payments-fundraising/37-05-stripe-webhook-handler-TRD.md",
        ".planning/objectives/37-stripe-payments-fundraising/37-06-donate-page-handlers-templates-TRD.md",
        ".planning/objectives/37-stripe-payments-fundraising/37-07-donation-tiers-wiring-maine-disclaimer-TRD.md",
        ".planning/objectives/37-stripe-payments-fundraising/37-08-admin-contribution-ledger-flutter-TRD.md",
        ".planning/objectives/37-stripe-payments-fundraising/37-09-traction-paid-contributions-rollup-TRD.md",
        ".planning/objectives/37-stripe-payments-fundraising/37-11-idempotency-limits-refund-tests-TRD.md",
        ".planning/objectives/37-stripe-payments-fundraising/37-JOB-CHECK.md",
        ".planning/objectives/37-stripe-payments-fundraising/37-RESEARCH.md",
        ".planning/objectives/37-stripe-payments-fundraising/OBJECTIVE.md",
        ".planning/objectives/38-public-site-design-polish/38-01-layout-core-rhythm-TRD.md",
        ".planning/objectives/38-public-site-design-polish/38-02-page-chrome-headers-cta-TRD.md",
        ".planning/objectives/38-public-site-design-polish/38-03-content-cms-seeds-TRD.md",
        ".planning/objectives/38-public-site-design-polish/38-04-donate-preset-tiers-TRD.md",
        ".planning/objectives/38-public-site-design-polish/38-RESEARCH.md",
        ".planning/objectives/38-public-site-design-polish/38-VERIFICATION.md",
        ".planning/objectives/38-public-site-design-polish/OBJECTIVE.md",
        ".planning/objectives/38-public-site-design-polish/evidence/",
        ".planning/objectives/39-policy-alignment-content-refresh/39-CONTEXT.md",
        ".planning/objectives/39-policy-alignment-content-refresh/OBJECTIVE.md",
        ".planning/policy-docs/",
        ".planning/quick/4-fix-admin-flutter-pre-auth-fetches-stick/4-JOB.md",
        ".playwright-mcp/",
        ".wrangler/",
        "38-02-events-empty-state.png",
        "38-02-issues-grid.png",
        "38-02-supporters-eyebrow.png",
        "38-03-blog-index.png",
        "38-03-faq.png",
        "38-03-issues-property-tax.png",
        "after-blog.png",
        "after-issue-detail-fresh.png",
        "after-issue-detail.png",
        "after-issues-balanced.png",
        "after-issues-balanced2.png",
        "after-issues-index.png",
        "cms-bio-editor.png",
        "cms-hub.png",
        "flutter/admin/.metadata",
        "flutter/admin/.wrangler/",
        "flutter/admin/README.md",
        "flutter/volunteer/.metadata",
        "flutter/volunteer/.wrangler/",
        "flutter/volunteer/README.md",
        "flutter/volunteer/ios/.gitignore",
        "flutter/volunteer/ios/Flutter/",
        "flutter/volunteer/ios/Podfile",
        "flutter/volunteer/ios/Podfile.lock",
        "flutter/volunteer/ios/Runner.xcodeproj/project.xcworkspace/",
        "flutter/volunteer/ios/Runner.xcodeproj/xcshareddata/",
        "flutter/volunteer/ios/Runner.xcworkspace/",
        "flutter/volunteer/ios/Runner/AppDelegate.swift",
        "flutter/volunteer/ios/Runner/Assets.xcassets/",
        "flutter/volunteer/ios/Runner/Base.lproj/",
        "flutter/volunteer/ios/Runner/Info.plist",
        "flutter/volunteer/ios/Runner/Runner-Bridging-Header.h",
        "flutter/volunteer/ios/Runner/SceneDelegate.swift",
        "flutter/volunteer/ios/RunnerTests/",
        "marketing/",
        "obj23-analytics-overview.png",
        "obj23-dashboard-3200.png",
        "obj23-dashboard-after-7d.png",
        "obj23-dashboard-final.png",
        "obj23-dashboard-fresh.png",
        "obj23-dashboard-fullpage.png",
        "obj23-dashboard-tall-final.png",
        "obj23-dashboard-tall.png",
        "obj23-dashboard-with-live-traffic.png",
        "obj23-dashboard-with-traffic.png",
        "obj23-form-success-1.png",
        "obj23-login.png",
        "obj24-contact-detail.png",
        "obj24-crm-contacts.png",
        "obj24-form-submissions-tab.png",
        "obj24-inbox-screen.png",
        "obj24-loading.png",
        "obj24-login-init.png",
        "obj32-showcase-desktop-v2.png",
        "photo-gallery-desktop-v2.png",
        "photo-gallery-desktop.png",
        "photo-gallery-lightbox.png",
        "photo-gallery-with-votes.png",
        "policy.zip",
        "review-about.png",
        "review-ask.png",
        "review-blog-index.png",
        "review-donate-mobile.png",
        "review-donate.png",
        "review-events.png",
        "review-faq.png",
        "review-get-involved.png",
        "review-home-desktop.png",
        "review-home-mobile.png",
        "review-issue-detail.png",
        "review-issues-index.png",
        "review-privacy.png",
        "review-showcase-desktop.png",
        "review-showcase-loaded.png",
        "review-supporters.png",
        "server",
        "tp-list-empty.png",
        "vol-login.png",
        "web",
        "web.test"
      ],
      "decision": "approve",
      "reason": "dirty: 125"
    },
    "/Users/justin/dev/navigators": {
      "porcelain_sha1": "a4dcf971871a87d2408600b708bab11d63990b2d",
      "head": "997524bd8f8bee769ff1b48f9323a1abf7dfea85",
      "dirty": 24,
      "dirty_paths": [
        ".planning/.awareness-cache.json",
        ".planning/objectives/02-voter-data-pipeline/02-04-TRD.md",
        ".planning/objectives/08-tasks-collaboration/08-04-TRD.md",
        ".planning/objectives/10-volunteer-management-events/10-03-TRD.md",
        ".playwright-mcp/",
        "01-landing-page.png",
        "02-after-login.png",
        "03-after-relogin.png",
        "04-mainegop-login.png",
        "05-after-permission-fix.png",
        "06-dashboard-working.png",
        "07-onboarding-step2.png",
        "08-04-cold-start-login.png",
        "08-04-warm-start-login.png",
        "08-onboarding-step3.png",
        "09-admin-dashboard.png",
        "10-voters-tab.png",
        "11-map-tab.png",
        "12-messages-tab.png",
        "13-tasks-tab.png",
        "14-events-tab.png",
        "15-import-tab.png",
        "navigators-presentation.pdf",
        "seed_data.sql"
      ],
      "decision": "approve",
      "reason": "dirty: 24"
    },
    "/Users/justin/dev/opsCluster": {
      "porcelain_sha1": "5ae726e48612c6c87132323dbd172656e710992a",
      "head": "17773a6fda7c7db0d743f7e736c4be91826e0d0f",
      "dirty": 7,
      "dirty_paths": [
        ".claude/agent-memory/devflow-verifier/MEMORY.md",
        ".planning/.progress-guard.json",
        "control-plane/.planning/.progress-guard.json",
        ".claude/agent-memory/devflow-verifier/obj64-eden-dataroom-artifact-verified.md",
        ".claude/agent-memory/devflow-verifier/obj67-ghscim-verified.md",
        ".planning/objectives/67-github-emu-scim-sync-from-google-workspace-keyless-wif-cronj/.gitkeep",
        "dataroom-login.png"
      ],
      "decision": "approve",
      "reason": "dirty: 7"
    },
    "/Users/justin/dev/politihub": {
      "porcelain_sha1": "c67610910c3913bba3d80d4301c4e75bae600ae7",
      "head": "f6c011b4735633bf394046ed10cd7ed119595591",
      "dirty": 2,
      "dirty_paths": [
        ".planning/.progress-guard.json",
        ".devflow-handoff/"
      ],
      "decision": "approve",
      "reason": "dirty: 2"
    },
    "/Users/justin/dev/qrCodeBuilder": {
      "porcelain_sha1": "02098efe10f9130e02667df596171722ea7dc7f9",
      "head": "7d688c1be853e8ce660c96751ef77ecc01eeb71f",
      "dirty": 2,
      "dirty_paths": [
        ".claude/",
        ".devflow-handoff/"
      ],
      "decision": "approve",
      "reason": "dirty: 2"
    },
    "/Users/justin/dev/quanta-local": {
      "porcelain_sha1": "da39a3ee5e6b4b0d3255bfef95601890afd80709",
      "head": "b85283b600488b783a21e91ddb4f69ff26a95622",
      "dirty": 0,
      "dirty_paths": [],
      "decision": "approve",
      "reason": ""
    },
    "/Users/justin/dev/recycling-oracle": {
      "porcelain_sha1": "debdb16cf16b24082071a8518f03c3783e55fb66",
      "head": "8680cf593115da5ff1d73a2251c5e9f33847cdb2",
      "dirty": 281,
      "dirty_paths": [
        ".env",
        ".env.example",
        ".planning/objectives/04-business-rules-engine/04-02-JOB.md",
        "bin/dev",
        "dashboard/.dockerignore",
        "dashboard/.gitattributes",
        "dashboard/.github/dependabot.yml",
        "dashboard/.github/workflows/ci.yml",
        "dashboard/.gitignore",
        "dashboard/.kamal/hooks/docker-setup.sample",
        "dashboard/.kamal/hooks/post-app-boot.sample",
        "dashboard/.kamal/hooks/post-deploy.sample",
        "dashboard/.kamal/hooks/post-proxy-reboot.sample",
        "dashboard/.kamal/hooks/pre-app-boot.sample",
        "dashboard/.kamal/hooks/pre-build.sample",
        "dashboard/.kamal/hooks/pre-connect.sample",
        "dashboard/.kamal/hooks/pre-deploy.sample",
        "dashboard/.kamal/hooks/pre-proxy-reboot.sample",
        "dashboard/.kamal/secrets",
        "dashboard/.rubocop.yml",
        "dashboard/.ruby-version",
        "dashboard/Dockerfile",
        "dashboard/Gemfile",
        "dashboard/Gemfile.lock",
        "dashboard/README.md",
        "dashboard/Rakefile",
        "dashboard/app/assets/images/.keep",
        "dashboard/app/assets/stylesheets/application.css",
        "dashboard/app/controllers/admin_settings_controller.rb",
        "dashboard/app/controllers/application_controller.rb",
        "dashboard/app/controllers/audit_log_controller.rb",
        "dashboard/app/controllers/billing_reports_controller.rb",
        "dashboard/app/controllers/concerns/.keep",
        "dashboard/app/controllers/dashboard_controller.rb",
        "dashboard/app/controllers/dep_reports_controller.rb",
        "dashboard/app/controllers/review_items_controller.rb",
        "dashboard/app/controllers/sessions_controller.rb",
        "dashboard/app/controllers/shared_links_controller.rb",
        "dashboard/app/controllers/users_controller.rb",
        "dashboard/app/helpers/application_helper.rb",
        "dashboard/app/helpers/dashboard_helper.rb",
        "dashboard/app/jobs/application_job.rb",
        "dashboard/app/jobs/recalculate_session_job.rb",
        "dashboard/app/jobs/session_timeout_job.rb",
        "dashboard/app/mailers/application_mailer.rb",
        "dashboard/app/models/application_record.rb",
        "dashboard/app/models/concerns/.keep",
        "dashboard/app/models/container_event.rb",
        "dashboard/app/models/deposit_config.rb",
        "dashboard/app/models/distributor.rb",
        "dashboard/app/models/processing_session.rb",
        "dashboard/app/models/product.rb",
        "dashboard/app/models/review_item.rb",
        "dashboard/app/models/role.rb",
        "dashboard/app/models/shared_link.rb",
        "dashboard/app/models/user.rb",
        "dashboard/app/models/user_role.rb",
        "dashboard/app/policies/admin_settings_policy.rb",
        "dashboard/app/policies/application_policy.rb",
        "dashboard/app/policies/audit_log_policy.rb",
        "dashboard/app/policies/billing_report_policy.rb",
        "dashboard/app/policies/dashboard_policy.rb",
        "dashboard/app/policies/dep_report_policy.rb",
        "dashboard/app/policies/processing_session_policy.rb",
        "dashboard/app/policies/review_item_policy.rb",
        "dashboard/app/policies/shared_link_policy.rb",
        "dashboard/app/policies/user_policy.rb",
        "dashboard/app/services/billing_csv_generator.rb",
        "dashboard/app/services/billing_pdf_generator.rb",
        "dashboard/app/services/billing_report_service.rb",
        "dashboard/app/services/dashboard_stats_service.rb",
        "dashboard/app/services/dep_csv_generator.rb",
        "dashboard/app/services/dep_pdf_generator.rb",
        "dashboard/app/services/dep_report_service.rb",
        "dashboard/app/services/deposit_calculator.rb",
        "dashboard/app/services/redis_stream_consumer.rb",
        "dashboard/app/services/redis_stream_publisher.rb",
        "dashboard/app/services/review_resolution_service.rb",
        "dashboard/app/services/session_csv_generator.rb",
        "dashboard/app/services/session_pdf_generator.rb",
        "dashboard/app/services/session_summary_service.rb",
        "dashboard/app/views/admin_settings/edit.html.erb",
        "dashboard/app/views/audit_log/index.html.erb",
        "dashboard/app/views/billing_reports/_preview_table.html.erb",
        "dashboard/app/views/billing_reports/index.html.erb",
        "dashboard/app/views/dashboard/_activity_feed.html.erb",
        "dashboard/app/views/dashboard/_activity_item.html.erb",
        "dashboard/app/views/dashboard/_bar_chart.html.erb",
        "dashboard/app/views/dashboard/_connection_banner.html.erb",
        "dashboard/app/views/dashboard/_distributor_row.html.erb",
        "dashboard/app/views/dashboard/_distributor_table.html.erb",
        "dashboard/app/views/dashboard/_session_controls.html.erb",
        "dashboard/app/views/dashboard/_stat_cards.html.erb",
        "dashboard/app/views/dashboard/show.html.erb",
        "dashboard/app/views/dep_reports/index.html.erb",
        "dashboard/app/views/dep_reports/show.html.erb",
        "dashboard/app/views/layouts/application.html.erb",
        "dashboard/app/views/layouts/mailer.html.erb",
        "dashboard/app/views/layouts/mailer.text.erb",
        "dashboard/app/views/layouts/shared_link.html.erb",
        "dashboard/app/views/pwa/manifest.json.erb",
        "dashboard/app/views/pwa/service-worker.js",
        "dashboard/app/views/review_items/_review_item.html.erb",
        "dashboard/app/views/review_items/_review_panel.html.erb",
        "dashboard/app/views/review_items/index.html.erb",
        "dashboard/app/views/shared_links/_shared_link_row.html.erb",
        "dashboard/app/views/shared_links/show.html.erb",
        "dashboard/app/views/users/_user_row.html.erb",
        "dashboard/app/views/users/edit.html.erb",
        "dashboard/app/views/users/index.html.erb",
        "dashboard/app/views/users/new.html.erb",
        "dashboard/bin/brakeman",
        "dashboard/bin/bundler-audit",
        "dashboard/bin/ci",
        "dashboard/bin/dev",
        "dashboard/bin/docker-entrypoint",
        "dashboard/bin/jobs",
        "dashboard/bin/kamal",
        "dashboard/bin/rails",
        "dashboard/bin/rake",
        "dashboard/bin/rubocop",
        "dashboard/bin/setup",
        "dashboard/bin/thrust",
        "dashboard/config.ru",
        "dashboard/config/application.rb",
        "dashboard/config/boot.rb",
        "dashboard/config/bundler-audit.yml",
        "dashboard/config/cable.yml",
        "dashboard/config/cache.yml",
        "dashboard/config/ci.rb",
        "dashboard/config/credentials.yml.enc",
        "dashboard/config/database.yml",
        "dashboard/config/deploy.yml",
        "dashboard/config/environment.rb",
        "dashboard/config/environments/development.rb",
        "dashboard/config/environments/production.rb",
        "dashboard/config/environments/test.rb",
        "dashboard/config/initializers/content_security_policy.rb",
        "dashboard/config/initializers/devise.rb",
        "dashboard/config/initializers/eden_ui.rb",
        "dashboard/config/initializers/filter_parameter_logging.rb",
        "dashboard/config/initializers/inflections.rb",
        "dashboard/config/initializers/redis.rb",
        "dashboard/config/locales/devise.en.yml",
        "dashboard/config/locales/en.yml",
        "dashboard/config/puma.rb",
        "dashboard/config/queue.yml",
        "dashboard/config/recurring.yml",
        "dashboard/config/routes.rb",
        "dashboard/config/storage.yml",
        "dashboard/db/cable_schema.rb",
        "dashboard/db/cache_schema.rb",
        "dashboard/db/migrate/20260224000001_create_distributors.rb",
        "dashboard/db/migrate/20260224000002_create_products.rb",
        "dashboard/db/migrate/20260224000003_create_container_events.rb",
        "dashboard/db/migrate/20260225000001_create_versions.rb",
        "dashboard/db/migrate/20260225000002_create_deposit_configs.rb",
        "dashboard/db/migrate/20260225000003_create_processing_sessions.rb",
        "dashboard/db/migrate/20260225000004_add_business_rules_to_container_events.rb",
        "dashboard/db/migrate/20260225000005_add_damage_fields_to_container_events.rb",
        "dashboard/db/migrate/20260225000006_create_review_items.rb",
        "dashboard/db/migrate/20260225100001_devise_create_users.rb",
        "dashboard/db/migrate/20260225100002_create_roles.rb",
        "dashboard/db/migrate/20260225100003_create_user_roles.rb",
        "dashboard/db/migrate/20260225100004_create_shared_links.rb",
        "dashboard/db/migrate/20260225100005_add_user_fk_to_review_items.rb",
        "dashboard/db/migrate/20260225100006_add_billing_index_to_container_events.rb",
        "dashboard/db/migrate/20260225200001_add_compliance_fields.rb",
        "dashboard/db/queue_schema.rb",
        "dashboard/db/schema.rb",
        "dashboard/db/seeds.rb",
        "dashboard/lib/tasks/.keep",
        "dashboard/lib/tasks/stream_consumer.rake",
        "dashboard/lib/tasks/upc_cache.rake",
        "dashboard/log/.keep",
        "dashboard/public/400.html",
        "dashboard/public/404.html",
        "dashboard/public/406-unsupported-browser.html",
        "dashboard/public/422.html",
        "dashboard/public/500.html",
        "dashboard/public/icon.png",
        "dashboard/public/icon.svg",
        "dashboard/public/robots.txt",
        "dashboard/script/.keep",
        "dashboard/storage/.keep",
        "dashboard/test/controllers/.keep",
        "dashboard/test/fixtures/files/.keep",
        "dashboard/test/helpers/.keep",
        "dashboard/test/integration/.keep",
        "dashboard/test/mailers/.keep",
        "dashboard/test/models/.keep",
        "dashboard/test/test_helper.rb",
        "dashboard/tmp/.keep",
        "dashboard/tmp/pids/.keep",
        "dashboard/tmp/storage/.keep",
        "dashboard/vendor/.keep",
        "data/seeds/distributors.csv",
        "data/seeds/products.csv",
        "pipeline/src/pipeline/capture/factory.py",
        "recycling-oracle-flutter/lib/core/api/api_client.dart",
        "recycling-oracle-flutter/lib/main.dart",
        "recycling-oracle-go/migrations/007_seed_data.up.sql",
        ".claude/",
        ".devflow-handoff/",
        ".planning/.awareness-cache.json",
        ".planning/.dup-detect-log.jsonl",
        ".planning/objectives/01-foundation-and-infrastructure/OBJECTIVE.md",
        ".planning/objectives/02-container-detection-and-tracking/OBJECTIVE.md",
        ".planning/objectives/03-barcode-identification/03-RESEARCH.md",
        ".planning/objectives/03-barcode-identification/OBJECTIVE.md",
        ".planning/objectives/04-business-rules-engine/OBJECTIVE.md",
        ".planning/objectives/05-label-recognition-and-container-classification/OBJECTIVE.md",
        ".planning/objectives/06-live-dashboard/OBJECTIVE.md",
        ".planning/objectives/07-review-queue-and-billing/OBJECTIVE.md",
        ".planning/objectives/08-compliance-and-audit/08-RESEARCH.md",
        ".planning/objectives/08-compliance-and-audit/OBJECTIVE.md",
        ".planning/objectives/09-platform-migration/09-01-JOB.md",
        ".planning/objectives/09-platform-migration/09-02-JOB.md",
        ".planning/objectives/09-platform-migration/09-03-JOB.md",
        ".planning/objectives/09-platform-migration/09-04-JOB.md",
        ".planning/objectives/09-platform-migration/09-05-JOB.md",
        ".planning/objectives/09-platform-migration/09-06-JOB.md",
        ".planning/objectives/09-platform-migration/09-07-JOB.md",
        ".planning/objectives/09-platform-migration/09-UAT.md",
        ".planning/objectives/09-platform-migration/OBJECTIVE.md",
        ".planning/objectives/10-master-dep-upc-catalog/OBJECTIVE.md",
        ".planning/objectives/11-demo-and-catalog-admin/OBJECTIVE.md",
        ".planning/objectives/16-vlm-primary-counting/16-14-TRD.md",
        ".planning/objectives/full-system-UAT.md",
        ".planning/reports/2026-06-19-vlm-hardware-spec-and-throughput.md",
        ".playwright-mcp/",
        "RecyclingOracle-Capabilities-Statement-CONFIDENTIAL.pdf",
        "bin/deploy-orin",
        "bin/deploy-pi",
        "bin/generate-jwt-keys",
        "bin/setup",
        "cam0_debayered.jpg",
        "cam0_test.jpg",
        "dashboard.png",
        "flutter-after-login.png",
        "flutter-audit.png",
        "flutter-billing.png",
        "flutter-compliance.png",
        "flutter-dashboard.png",
        "flutter-login-attempt2.png",
        "flutter-login-attempt3.png",
        "flutter-login.png",
        "flutter-review.png",
        "flutter-sessions.png",
        "flutter-settings.png",
        "flutter-shared-links.png",
        "flutter-users.png",
        "hardware-design/",
        "login-after-keyboard.png",
        "login-after-type.png",
        "login-attempt2.png",
        "login-page.png",
        "pi-agent/build.sh",
        "pi-agent/config",
        "pi-agent/image-site/",
        "pi-agent/pyproject.toml",
        "pi-agent/setup-pi.sh",
        "pi-agent/src/pi_agent/__init__.py",
        "pi-agent/src/pi_agent/main.py",
        "pi-agent/src/pi_agent/web.py",
        "pi-agent/stage-camera/",
        "pi-agent/templates/",
        "pipeline/requirements.jetson.txt",
        "pipeline/src/pipeline/capture/camera.py",
        "pipeline/src/pipeline/capture/rtsp.py",
        "pipeline/tools/export_model.py",
        "pipeline/yolo11s.pt",
        "pricing/",
        "recycling-oracle-flutter/.gitignore",
        "recycling-oracle-flutter/.metadata",
        "recycling-oracle-flutter/README.md",
        "recycling-oracle-go/oracle-admin",
        "tools/",
        "video0_snap.jpg",
        "video0_test.jpg",
        "webcam_test.jpg"
      ],
      "decision": "approve",
      "reason": "dirty: 281"
    },
    "/Users/justin/dev/smartWellness": {
      "porcelain_sha1": "6ae57a6f8146bab32288ec71865fb1f0855a09a7",
      "head": "548f9a5f39ff1108d9a8c30200d22873a56b8282",
      "dirty": 4,
      "dirty_paths": [
        ".planning/.awareness-cache.json",
        ".planning/.micro-description",
        ".review/mob-nav-collapsed.jpeg",
        ".review/mob-nav-expanded.jpeg"
      ],
      "decision": "approve",
      "reason": "dirty: 4"
    },
    "/Users/justin/dev/torrentConsole": {
      "porcelain_sha1": "da39a3ee5e6b4b0d3255bfef95601890afd80709",
      "head": "5c08d5486ae1fe46dd572a451e7afbd576990868",
      "dirty": 0,
      "dirty_paths": [],
      "decision": "approve",
      "reason": ""
    },
    "/Users/justin/dev/trades": {
      "porcelain_sha1": "da39a3ee5e6b4b0d3255bfef95601890afd80709",
      "head": "225e5a1ec78cd639e91bec1d11d18b80b61694a4",
      "dirty": 0,
      "dirty_paths": [],
      "decision": "approve",
      "reason": ""
    },
    "/Users/justin/dev/videoArchive": {
      "porcelain_sha1": "fbcccb03c30524f637a96addb75ebdd6508fd6d1",
      "head": "b296cf2996d94b34aa1a3ade4cde9e9f9d81b91c",
      "dirty": 16,
      "dirty_paths": [
        "ios/Podfile.lock",
        "ios/Runner.xcodeproj/project.pbxproj",
        "ios/Runner.xcodeproj/xcshareddata/xcschemes/Runner.xcscheme",
        "pubspec.lock",
        ".claude/",
        ".planning/.awareness-cache.json",
        ".planning/.dup-detect-log.jsonl",
        ".planning/.progress-guard.json",
        ".planning/.skill-active",
        ".planning/objectives/04-player-rebuild/evidence/analyze-baseline.txt",
        ".planning/objectives/04-player-rebuild/evidence/analyze-current.txt",
        ".planning/objectives/05-ux-defect-sweep-hygiene/05-ux-defect-sweep-hygiene-UAT.md",
        ".planning/objectives/07-adaptive-layout-accessibility/OBJECTIVE.md",
        ".planning/state.json",
        "format_picker_sheet.png",
        "picker_open_720p.png"
      ],
      "decision": "approve",
      "reason": "dirty: 16"
    }
  }
}
```


## Results

Run 2026-09-29. Task 3 was halted once after 8 rows: the safe-key flutter `lint` gate (`flutter analyze --fatal-infos`) rewrote `analysis_options.yaml` and bumped `pubspec.lock` in aocore, aofamily and aoid. The delta check stopped each of those repos. The coordinator restored the 5 side-effect files, and every remaining row plus the 4 retries (aocore, aofamily, aoid, aoinference, re-snapshotted) ran with **resolve-only** `stack verify` (no gate commands executed). ao-terminal, aodex and aoedge had committed before the halt with `--run`. Their results are shown as such, and those runs left no delta.

| repo | branch | decision | action | verify | report g/w/i | hash or reason | info | pre-existing dirty paths (untouched) |
|---|---|---|---|---|---|---|---|---|
| ao-terminal | ao-main | approve override:overrides/ao-terminal.STACK.md (dirty: 1) | committed | --run (before halt): ran 2 [lint=1 format=1]; unverifiable-body 2 | 19/4/42 | ff97b2ea | gate-red (pre-existing): lint=1,format=1 | ?? .planning/.progress-guard.json |
| aocore | df/saas-wave2 | approve override:overrides/aocore.STACK.md (dirty: 22) | committed | resolve-only (run disabled: flutter side effects): resolved 41 | 15/7/29 | 48e6a0784 | retry after halt (first attempt: porcelain-delta) |  M .planning/.awareness-cache.json<br> M .planning/.progress-guard.json<br> M admin/analysis_options.yaml<br> M admin/pubspec.lock<br> M go/.planning/.awareness-cache.json<br>?? 92-provenance-graph.png<br>?? admin-dashboard.png<br>?? admin/e2e/uat-report/interaction-sweep.json (+129 more) |
| aocyber-deploy | main | skip (user: PoC/reference-only) | skipped |  |  | user: PoC/reference-only |  |  |
| aodex | fix/ci-listtile-material | approve override:overrides/aodex.STACK.md (dirty: 206) | committed | --run (before halt): ran 6 [build=0 flutter/:lint=1 flutter/:format=1 go/:build=0 go/:lint=0 go/:format=1]; unverifiable-body 0 | 7/6/20 | 68b545e2 | gate-red (pre-existing): flutter/:lint=1,flutter/:format=1,go/:format=1 |  M .planning/.awareness-cache.json<br> M .planning/.progress-guard.json<br> M CLAUDE.md<br> M flutter/.planning/.progress-guard.json<br> M flutter/analysis_options.yaml<br> M flutter/pubspec.lock<br> M flutter/test/ui_eval/failures/grid-edited_isolatedDiff.png<br> M flutter/test/ui_eval/failures/grid-edited_maskedDiff.png (+249 more) |
| aoedge | fix/strip-inbound-aoid-trust-headers | approve override:overrides/aoedge.STACK.md (dirty: 1) | committed | --run (before halt): ran 3 [build=0 lint=0 format=1]; unverifiable-body 0 | 4/1/30 | bedacb4 | gate-red (pre-existing): format=1 |  M .planning/PROJECT.md |
| aofamily | df/riverpod3-rebase | approve (dirty: 4) | committed | resolve-only (run disabled: flutter side effects): resolved 69 | 23/12/54 | 94fb090 | retry after halt (first attempt: porcelain-delta) | ?? .planning/.progress-guard.json<br>?? ai/.planning/.progress-guard.json<br>?? browser/.planning/.progress-guard.json<br>?? connect/.planning/.progress-guard.json |
| aoid | main | approve (dirty: 14) | committed | resolve-only (run disabled: flutter side effects): resolved 18 | 6/2/14 | 1def474 | retry after halt (first attempt: porcelain-delta) |  M .planning/.awareness-cache.json<br>?? .claude/worktrees/agent-a0bf2f67124fe3426/<br>?? .claude/worktrees/agent-a0e11a608c4633978/<br>?? .claude/worktrees/agent-a21e8034d7e10ee11/<br>?? .claude/worktrees/agent-a328d1ff3e373edb6/<br>?? .claude/worktrees/agent-a389375d1a58909f0/<br>?? .claude/worktrees/agent-a4772248efc74ce51/<br>?? .claude/worktrees/agent-a56c96f9c9c756b7d/ (+68 more) |
| aoinference | fix/obj31-oci-source-label | approve (dirty: 3) | committed | resolve-only (run disabled: flutter side effects): resolved 8 | 5/2/9 | c9f1bdc | retry after halt (first attempt: rollout halted mid verify --run (flutter-analyze mutation found in other repos); our STACK.md deleted) | ?? .claude/settings.json<br>?? .planning/.dup-detect-log.jsonl<br>?? docs/MODEL-SELECTION-2026-09.md |
| AOSignal | main | approve (dirty: 1) | committed | resolve-only (run disabled: flutter side effects):  | 0/0/2 | 37ccb12 |  |  M .planning/config.json |
| aostudio | main | approve (dirty: 3) | committed | resolve-only (run disabled: flutter side effects):  | 0/0/2 | 7dd81bd |  | ?? .planning/.awareness-cache.json<br>?? .planning/.progress-guard.json<br>?? .playwright-mcp/console-2026-09-12T19-23-27-759Z.log<br>?? .playwright-mcp/page-2026-09-12T19-23-27-865Z.yml |
| devcluster | main | approve override:overrides/devcluster.STACK.md (dirty: 11) | committed | resolve-only (run disabled: flutter side effects): resolved 11 | 0/0/3 | e038d4b |  |  M t2-cluster/ctl.sh<br>?? .planning/.awareness-cache.json<br>?? .planning/.progress-guard.json<br>?? .planning/PROJECT.md<br>?? .planning/REQUIREMENTS.md<br>?? .planning/objectives/01-developer-auth-personas/01-CONTEXT.md<br>?? .planning/objectives/01-developer-auth-personas/OBJECTIVE.md<br>A  t2-cluster/values/aoedge.yaml (+3 more) |
| devflow | main | approve (dirty: 2) | committed | resolve-only (run disabled: flutter side effects): resolved 8 | 4/1/5 | 36a8eb1 |  | ?? .planning/.progress-guard.json<br>?? .planning/journal.jsonl |
| devflow-claude | feat/stack-profile-loader | skip (self) | skipped |  |  | self |  |  |
| devflow-test | main | approve (dirty: 3) | committed | resolve-only (run disabled: flutter side effects):  | 0/0/2 | 3baa599 |  |  M .planning/config.json<br>?? .planning/.dup-detect-log.jsonl<br>?? .planning/objectives/01-scaffold-config-and-model-client/OBJECTIVE.md |
| devflowops | main | approve override:overrides/devflowops.STACK.md (dirty: 2) | committed | resolve-only (run disabled: flutter side effects): resolved 19 | 10/3/58 | 0083c97 |  |  M .planning/.dup-detect-log.jsonl<br>?? .planning/.progress-guard.json |
| dfip | main | approve | committed | resolve-only (run disabled: flutter side effects): resolved 8 | 5/2/9 | ffcff7d |  |  |
| eden-biz | main | approve override:overrides/eden-biz.STACK.md (dirty: 9) | committed | resolve-only (run disabled: flutter side effects): resolved 46 | 14/9/31 | 6f1b8f15d | head-moved-since-dry-run |  M .planning/.awareness-cache.json<br> M .planning/.dup-detect-log.jsonl<br> M .planning/.progress-guard.json<br> M go/.planning/.progress-guard.json<br>?? .devflow-handoff/pending/h-183d024e.json<br>?? .planning/handoffs/subscription-created-cancelled-context.md<br>?? .planning/objectives/720-polymorphic-coupon-redemption-source/720-VERIFICATION.md<br>?? .planning/objectives/723-wire-money-paths-to-coupon-resolver/OBJECTIVE.md (+2 more) |
| eden-circle | obj-36-initstate-audit | approve (dirty: 36) | committed | resolve-only (run disabled: flutter side effects): resolved 17 | 5/4/13 | 25c2cfa |  |  M .claude/agent-memory/devflow-verifier/MEMORY.md<br> M .planning/.awareness-cache.json<br> M .planning/.progress-guard.json<br> M test/calling-harness/ev-01-callee-incall.jpg<br> M test/calling-harness/ev-01-ringing.jpg<br> M test/calling-harness/ev-stale-ringing.jpg<br>?? .claude/agent-memory/devflow-verifier/obj35-return-to-dm-verification.md<br>?? .claude/agent-memory/devflow-verifier/obj36-initstate-audit-verification.md (+28 more) |
| eden-libs | main | approve (dirty: 75) | committed | resolve-only (run disabled: flutter side effects): resolved 114 | 31/16/45 | d321277 |  |  D .planning/.micro-description<br> M .claude/worktrees/ws-platform-household-claims-go<br> M eden-experience-flutter/pubspec.lock<br> M eden-platform-api-dart/.dart_tool/package_config.json<br> M eden-platform-api-dart/.dart_tool/package_graph.json<br>?? .claude/worktrees/ws-aofamily-billing-ent-go/<br>?? .devflow-handoff/pending/h-a9f39b48.json<br>?? .planning/.awareness-cache.json (+68 more) |
| eden-platform-go | fix/cf-email-retry-on-throttle | approve (dirty: 3) | committed | resolve-only (run disabled: flutter side effects): resolved 8 | 4/1/8 | 0326e88 |  | ?? .claude/worktrees/agent-a008f790ccf1585c2/<br>?? .claude/worktrees/agent-a00b178874edcc1a6/<br>?? .claude/worktrees/agent-a3c9dff6a14add2ce/<br>?? .claude/worktrees/agent-a51febcb42b439952/<br>?? .claude/worktrees/agent-a649a958774bc9e72/<br>?? .claude/worktrees/agent-a7466c7167a066ee3/<br>?? .claude/worktrees/agent-a7dc2bd453a9bdfb4/<br>?? .claude/worktrees/agent-a8a70d4735736e49e/ (+11 more) |
| eden-press | main | approve (dirty: 3) | committed | resolve-only (run disabled: flutter side effects): resolved 17 | 10/3/12 | 40e4c9e |  | ?? .claude/agent-memory/devflow-verifier/MEMORY.md<br>?? .claude/agent-memory/devflow-verifier/eden-press-requirements-drift.md<br>?? .planning/.awareness-cache.json<br>?? .planning/.dup-detect-log.jsonl |
| eden-ui-flutter | main | approve (dirty: 2) | committed | resolve-only (run disabled: flutter side effects): resolved 11 | 4/4/9 | f8b0487 |  |  M analysis_options.yaml<br>?? .planning/.progress-guard.json |
| EdenDocs | eden-main | approve override:overrides/EdenDocs.STACK.md (dirty: 3) | committed | resolve-only (run disabled: flutter side effects): resolved 12 | 13/1/20 | 50e3b449645 | changed-since-dry-run | ?? .planning/.awareness-cache.json<br>?? .planning/.dup-detect-log.jsonl<br>?? .planning/.progress-guard.json<br>?? .planning/state.json |
| github-enterprise-migration | main | approve (dirty: 2) | committed | resolve-only (run disabled: flutter side effects):  | 0/0/2 | 93e3162 |  | ?? .planning/.awareness-cache.json<br>?? .planning/.progress-guard.json |
| justin-donnaruma-us-go | df/riverpod3-bump | blocked (stack-files-gitignored) | blocked |  |  | stack-files-gitignored |  |  |
| justinforme | df/riverpod3-bump | approve (dirty: 125) | committed | resolve-only (run disabled: flutter side effects): resolved 27 | 0/0/12 | e430560 |  |  M .planning/.awareness-cache.json<br> M .planning/.dup-detect-log.jsonl<br> M .planning/objectives/39-policy-alignment-content-refresh/39-01-alice-canonical-callout-block-TRD.md<br> M .planning/objectives/39-policy-alignment-content-refresh/39-07-homepage-refresh-TRD.md<br> M .planning/objectives/39-policy-alignment-content-refresh/39-11-strategic-frame-grep-gate-TRD.md<br> M .planning/state.json<br> M vendor/github.com/aocybersystems/eden-platform-go/platform/server/interceptors.go<br>?? .claude/scheduled_tasks.lock (+577 more) |
| navigators | df/riverpod3-bump | approve override:overrides/navigators.STACK.md (dirty: 24) | committed | resolve-only (run disabled: flutter side effects): resolved 21 | 0/0/4 | c3a8274 | changed-since-dry-run | ?? .planning/.awareness-cache.json<br>?? .planning/.progress-guard.json<br>?? .planning/objectives/02-voter-data-pipeline/02-04-TRD.md<br>?? .planning/objectives/08-tasks-collaboration/08-04-TRD.md<br>?? .planning/objectives/10-volunteer-management-events/10-03-TRD.md<br>?? .playwright-mcp/console-2026-04-12T00-10-23-013Z.log<br>?? .playwright-mcp/console-2026-04-12T00-16-06-849Z.log<br>?? .playwright-mcp/console-2026-04-12T00-16-14-143Z.log (+46 more) |
| opsCluster | main | approve (dirty: 7) | committed | resolve-only (run disabled: flutter side effects): resolved 9 | 3/1/8 | 51d0f15 |  |  M .claude/agent-memory/devflow-verifier/MEMORY.md<br> M .planning/.progress-guard.json<br> M control-plane/.planning/.progress-guard.json<br>?? .claude/agent-memory/devflow-verifier/obj64-eden-dataroom-artifact-verified.md<br>?? .claude/agent-memory/devflow-verifier/obj67-ghscim-verified.md<br>?? .planning/objectives/67-github-emu-scim-sync-from-google-workspace-keyless-wif-cronj/.gitkeep<br>?? dataroom-login.png |
| politihub | main | approve override:overrides/politihub.STACK.md (dirty: 2) | committed | resolve-only (run disabled: flutter side effects): resolved 28 | 10/4/23 | 686cb0b |  |  M .planning/.progress-guard.json<br>?? .devflow-handoff/pending/h-db90c47b.json<br>?? .devflow-handoff/pending/h-ffb0c75c.json |
| qrCodeBuilder | main | approve (dirty: 2) | committed | resolve-only (run disabled: flutter side effects): resolved 9 | 2/0/6 | e55991b |  | ?? .claude/agent-memory/devflow-verifier/MEMORY.md<br>?? .claude/agent-memory/devflow-verifier/project_inert_test_history.md<br>?? .devflow-handoff/pending/h-3a8c8570.json<br>?? .devflow-handoff/pending/h-99a13878.json |
| quanta-local | main | approve override:overrides/quanta-local.STACK.md | committed | resolve-only (run disabled: flutter side effects): resolved 3 | 0/0/20 | 3b9e5d3 |  |  |
| recycling-oracle | main | approve (dirty: 281) | committed | resolve-only (run disabled: flutter side effects): resolved 17 | 0/0/6 | 78190b8 |  |  D dashboard/.dockerignore<br> D dashboard/.gitattributes<br> D dashboard/.github/dependabot.yml<br> D dashboard/.github/workflows/ci.yml<br> D dashboard/.gitignore<br> D dashboard/.kamal/hooks/docker-setup.sample<br> D dashboard/.kamal/hooks/post-app-boot.sample<br> D dashboard/.kamal/hooks/post-deploy.sample (+420 more) |
| smartWellness | df/riverpod3-bump | approve (dirty: 4) | committed | resolve-only (run disabled: flutter side effects): resolved 18 | 7/3/18 | 23271c4 |  |  D .planning/.micro-description<br> M .planning/.awareness-cache.json<br>?? .review/mob-nav-collapsed.jpeg<br>?? .review/mob-nav-expanded.jpeg |
| torrentConsole | main | approve | committed | resolve-only (run disabled: flutter side effects): resolved 10 | 0/1/1 | 3aca26f |  |  |
| trades | main | approve | committed | resolve-only (run disabled: flutter side effects): resolved 6 | 3/0/15 | 1c9ba00c |  |  |
| videoArchive | main | approve (dirty: 16) | committed | resolve-only (run disabled: flutter side effects): resolved 11 | 2/3/3 | 61f039d |  |  M ios/Podfile.lock<br> M ios/Runner.xcodeproj/project.pbxproj<br> M ios/Runner.xcodeproj/xcshareddata/xcschemes/Runner.xcscheme<br> M pubspec.lock<br>?? .claude/agent-memory/devflow-verifier/MEMORY.md<br>?? .claude/agent-memory/devflow-verifier/project_videoarchive_known_issues.md<br>?? .claude/agent-memory/devflow-verifier/project_videoarchive_verification_quality.md<br>?? .claude/settings.json (+16 more) |

**Totals:** committed 33 / skipped 2 / blocked 1 / stopped 0 = 36 (canonical 36). Nothing pushed; no `.mcp.json` written.

```json results
{
  "/Users/justin/dev/ao-terminal": {
    "action": "committed",
    "hash": "ff97b2ea",
    "reason": "",
    "verify_mode": "run"
  },
  "/Users/justin/dev/aocore": {
    "action": "committed",
    "hash": "48e6a0784",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/aocyber-deploy": {
    "action": "skipped",
    "hash": null,
    "reason": "user: PoC/reference-only",
    "verify_mode": null
  },
  "/Users/justin/dev/aodex": {
    "action": "committed",
    "hash": "68b545e2",
    "reason": "",
    "verify_mode": "run"
  },
  "/Users/justin/dev/aoedge": {
    "action": "committed",
    "hash": "bedacb4",
    "reason": "",
    "verify_mode": "run"
  },
  "/Users/justin/dev/aofamily": {
    "action": "committed",
    "hash": "94fb090",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/aoid": {
    "action": "committed",
    "hash": "1def474",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/aoinference": {
    "action": "committed",
    "hash": "c9f1bdc",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/AOSignal": {
    "action": "committed",
    "hash": "37ccb12",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/aostudio": {
    "action": "committed",
    "hash": "7dd81bd",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/devcluster": {
    "action": "committed",
    "hash": "e038d4b",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/devflow": {
    "action": "committed",
    "hash": "36a8eb1",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/devflow-claude": {
    "action": "skipped",
    "hash": null,
    "reason": "self",
    "verify_mode": null
  },
  "/Users/justin/dev/devflow-test": {
    "action": "committed",
    "hash": "3baa599",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/devflowops": {
    "action": "committed",
    "hash": "0083c97",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/dfip": {
    "action": "committed",
    "hash": "ffcff7d",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/eden-biz": {
    "action": "committed",
    "hash": "6f1b8f15d",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/eden-circle": {
    "action": "committed",
    "hash": "25c2cfa",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/eden-libs": {
    "action": "committed",
    "hash": "d321277",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/eden-platform-go": {
    "action": "committed",
    "hash": "0326e88",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/eden-press": {
    "action": "committed",
    "hash": "40e4c9e",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/eden-ui-flutter": {
    "action": "committed",
    "hash": "f8b0487",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/EdenDocs": {
    "action": "committed",
    "hash": "50e3b449645",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/github-enterprise-migration": {
    "action": "committed",
    "hash": "93e3162",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/justin-donnaruma-us-go": {
    "action": "blocked",
    "hash": null,
    "reason": "stack-files-gitignored",
    "verify_mode": null
  },
  "/Users/justin/dev/justinforme": {
    "action": "committed",
    "hash": "e430560",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/navigators": {
    "action": "committed",
    "hash": "c3a8274",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/opsCluster": {
    "action": "committed",
    "hash": "51d0f15",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/politihub": {
    "action": "committed",
    "hash": "686cb0b",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/qrCodeBuilder": {
    "action": "committed",
    "hash": "e55991b",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/quanta-local": {
    "action": "committed",
    "hash": "3b9e5d3",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/recycling-oracle": {
    "action": "committed",
    "hash": "78190b8",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/smartWellness": {
    "action": "committed",
    "hash": "23271c4",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/torrentConsole": {
    "action": "committed",
    "hash": "3aca26f",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/trades": {
    "action": "committed",
    "hash": "1c9ba00c",
    "reason": "",
    "verify_mode": "resolve-only"
  },
  "/Users/justin/dev/videoArchive": {
    "action": "committed",
    "hash": "61f039d",
    "reason": "",
    "verify_mode": "resolve-only"
  }
}
```
