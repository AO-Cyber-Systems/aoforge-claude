---
schema: 1
id: "eden-biz"
extends: "general"
components: [{ path: "api-dart/", profile: "dart" }, { path: "flutter/", profile: "flutter" }, { path: "go/", profile: "go" }, { path: "mobile/", profile: "flutter" }, { path: "pos/", profile: "flutter" }]
commands:
  build: { run: "make build", cwd: "go" }
  test: { run: "make test", cwd: "go", scoped: "go test {packages}" }
  codegen: { run: "make generate", cwd: "go", when: "sources_changed" }
  e2e_env: { run: "make e2e-stack-up" }
loop: ["test"]
provenance:
  reviewed: "2026-09-29"
  sources: ["Makefile", "flutter/Makefile", "go/Makefile", ".github/workflows/build-app.yml", ".github/workflows/cms-e2e.yml", ".github/workflows/flutter-integration-macos.yml", ".github/workflows/flutter.yml", ".github/workflows/go.yml", ".github/workflows/mobile.yml", ".github/workflows/portal-spec-validate.yml", ".github/workflows/pos.yml", ".github/workflows/proto-gen-drift.yml", ".github/workflows/seed-profiles.yml", ".github/workflows/spec-validate.yml", ".github/workflows/templ-gen-drift.yml", ".github/workflows/web-e2e.yml", "flutter/web_e2e/package.json", "flutter/.maestro/"]
---

# Stack Profile: eden-biz

<!-- Drafted by `df-tools stack init`. Add no `## ` heading below unless this project genuinely diverges from `general`: an empty section would replace the parent's. Recognized sections: Principles, Idioms, Avoid, Layout & architecture, Testing, Dependencies, Generated code, Security, UI. -->

<!-- Hand-reviewed 2026-09-29 (objective 42 rollout): Multi-stack root (general). Go API build/test/codegen live in go/Makefile; flutter/, mobile/, pos/, api-dart/ components take their profile defaults. `make e2e-stack-up` brings up the live e2e environment (infra, migrate, seed, biz-api :8091) - it is an environment key, not a test runner. Drafter notes superseded; see .planning/STACK-REPORT.md. -->
