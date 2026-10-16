---
schema: 1
id: "quanta-local"
extends: "general"
commands:
  build: { run: "make build" }
  test: { run: "discover" }
  preflight: { run: "make preflight" }
  verify: { run: "make verify" }
provenance:
  reviewed: "2026-09-29"
  sources: ["Makefile", "api/package.json", "marketing/package.json", "mocks/package.json", "portal/package.json"]
---

# Stack Profile: quanta-local

<!-- Drafted by `df-tools stack init`. Add no `## ` heading below unless this project genuinely diverges from `general`: an empty section would replace the parent's. Recognized sections: Principles, Idioms, Avoid, Layout & architecture, Testing, Dependencies, Generated code, Security, UI. -->

<!-- Hand-reviewed 2026-09-29 (objective 42 rollout): Docker-compose local environment for Quanta (node services in api/, billing/, portal/, ...). There is no unit-test entry point at the root: `make verify` runs host checks plus in-network runner tests and needs `make up` first, so it is the verify key and test stays discover. Drafter notes superseded; see .planning/STACK-REPORT.md. -->
