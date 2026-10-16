---
schema: 1
id: "navigators"
extends: "general"
components: [{ path: "navigators-flutter/", profile: "flutter" }, { path: "navigators-go/", profile: "go" }]
commands:
  test: { run: "just test-go" }
  codegen: { run: "just generate", when: "sources_changed" }
  sqlc: { run: "just sqlc", when: "sources_changed" }
  e2e: { run: "maestro test .maestro" }
loop: ["test"]
provenance:
  reviewed: "2026-09-29"
  sources: ["justfile", ".maestro/"]
---

# Stack Profile: navigators

<!-- Drafted by `df-tools stack init`. Add no `## ` heading below unless this project genuinely diverges from `general`: an empty section would replace the parent's. Recognized sections: Principles, Idioms, Avoid, Layout & architecture, Testing, Dependencies, Generated code, Security, UI. -->

<!-- Hand-reviewed 2026-09-29 (objective 42 rollout): Multi-stack root (general): navigators-go/ and navigators-flutter/ components take their profile defaults. Root justfile recipes wrap the Go tests and proto/sqlc codegen; `just infra` starts local infra. Drafter notes superseded; see .planning/STACK-REPORT.md. -->
