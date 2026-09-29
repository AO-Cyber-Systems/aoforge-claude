---
schema: 1
id: "edendocs"
extends: "general"
components: [{ path: "wopi-host/", profile: "go" }]
commands:
  build: { run: "./scripts/eden/build.sh" }
  test: { run: "discover" }
  smoke: { run: "./scripts/eden/smoke-test.sh" }
  branding: { run: "./scripts/eden/verify-branding.sh" }
  e2e: { run: "./wopi-host/scripts/wopi-e2e.sh" }
provenance:
  reviewed: "2026-09-29"
  sources: ["engine/compilerplugins/Makefile", ".github/workflows/build.yml", ".github/workflows/codeql-analysis.yml", ".github/workflows/docker-publish.yml", ".github/workflows/wopi-host.yml", "browser/package.json", "qt/test/package.json"]
---

# Stack Profile: edendocs

<!-- Drafted by `df-tools stack init`. Add no `## ` heading below unless this project genuinely diverges from `general`: an empty section would replace the parent's. Recognized sections: Principles, Idioms, Avoid, Layout & architecture, Testing, Dependencies, Generated code, Security, UI. -->

<!-- Hand-reviewed 2026-09-29 (objective 42 rollout): Collabora Online (C++/JS, autotools) fork with a Go wopi-host/ sidecar component (go profile gates run there). Build needs Linux: run scripts/eden/build-deps.sh (system POCO, apt) and fetch-engine-assets.sh first - deliberately not a `deps` command because it installs system packages. Unit tests are autotools `make check`, only available after configure, so `test` is discover. CI runs the WOPI e2e with COOLWSD_MODE=native (coolwsd :9980, wopi-host :8091). Drafter notes superseded; see .planning/STACK-REPORT.md. -->
