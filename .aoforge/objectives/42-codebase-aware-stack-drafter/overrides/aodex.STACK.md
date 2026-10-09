---
schema: 1
id: "aodex"
extends: "general"
components: [{ path: "flutter/", profile: "flutter" }, { path: "go/", profile: "go" }]
commands:
  build: { run: "make build", cwd: "go" }
  test: { run: "make test", cwd: "go", scoped: "go test {packages}" }
  codegen: { run: "make openapi-verify", apply: "make openapi-regen", cwd: "go", when: "sources_changed" }
  guards: { run: "make check-no-billing-writes check-no-chromedp check-dev-bypass-boundary", cwd: "go" }
loop: ["test"]
provenance:
  reviewed: "2026-09-29"
  sources: ["go/Makefile", ".github/workflows/build-ios.yml", ".github/workflows/build-macos.yml", ".github/workflows/flutter.yml", ".github/workflows/go.yml", ".github/workflows/release-flutter.yml", "flutter/e2e/package.json", "flutter/.maestro/"]
---

# Stack Profile: aodex

<!-- Drafted by `df-tools stack init`. Add no `## ` heading below unless this project genuinely diverges from `general`: an empty section would replace the parent's. Recognized sections: Principles, Idioms, Avoid, Layout & architecture, Testing, Dependencies, Generated code, Security, UI. -->

<!-- Hand-reviewed 2026-09-29 (objective 42 rollout): Multi-stack root (general): Go server in go/ (go/Makefile), Flutter client in flutter/ (flutter component defaults). codegen checks OpenAPI idempotency (openapi-verify) and applies with openapi-regen. `guards` runs the go/ boundary checks (no billing writes, chromedp only in export-sidecar, dev auth bypass absent from default builds). Drafter notes superseded; see .planning/STACK-REPORT.md. -->
