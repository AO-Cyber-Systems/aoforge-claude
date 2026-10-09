---
schema: 1
id: "devflowops"
extends: "go"
components: [{ path: "flutter/", profile: "flutter" }]
commands:
  deps: { run: "make deps", when: "deps_changed" }
  build: { run: "make build" }
  test: { run: "make test", scoped: "go test {packages}" }
  lint: { run: "make lint", apply: "make lint-fix" }
  format: { run: "make fmt-check", apply: "make fmt" }
  tidy: { run: "make tidy-check", apply: "make tidy", when: "deps_changed" }
  codegen: { run: "make generate", when: "sources_changed" }
  audit: { run: "make security-check" }
  e2e: { run: "make playwright" }
provenance:
  reviewed: "2026-09-29"
  sources: ["Makefile", "contrib/gitea-monitoring-mixin/Makefile", "flutter/Makefile", ".github/workflows/flutter-ci.yml", ".github/workflows/pull-compliance.yml", ".github/workflows/pull-db-tests.yml", ".github/workflows/pull-e2e-tests.yml"]
---

# Stack Profile: devflowops

<!-- Drafted by `df-tools stack init`. Add no `## ` heading below unless this project genuinely diverges from `go`: an empty section would replace the parent's. Recognized sections: Principles, Idioms, Avoid, Layout & architecture, Testing, Dependencies, Generated code, Security, UI. -->

<!-- Hand-reviewed 2026-09-29 (objective 42 rollout): Gitea fork; Makefile aggregate targets cover Go backend + frontend. Drafter rejected them as off-stack (objective 43). Drafter notes superseded; see .planning/STACK-REPORT.md. -->
