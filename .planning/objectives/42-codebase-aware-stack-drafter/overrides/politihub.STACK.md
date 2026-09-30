---
schema: 1
id: "politihub"
extends: "general"
components: [{ path: "flutter-navigators/", profile: "flutter" }, { path: "flutter/", profile: "flutter" }, { path: "go/", profile: "go" }]
commands:
  build: { run: "make build", cwd: "go" }
  test: { run: "make test", cwd: "go", scoped: "go test {packages}" }
loop: ["test"]
provenance:
  reviewed: "2026-09-29"
  sources: ["go/Makefile", ".github/workflows/deploy.yml", ".github/workflows/flutter.yml", ".github/workflows/go.yml", ".github/workflows/navigators-pages.yml", ".github/workflows/navigators-release.yml", ".github/workflows/navigators.yml", ".github/workflows/pages.yml", ".github/workflows/tiles-regen.yml", "go/cloudflare-email-worker/package.json"]
---

# Stack Profile: politihub

<!-- Drafted by `df-tools stack init`. Add no `## ` heading below unless this project genuinely diverges from `general`: an empty section would replace the parent's. Recognized sections: Principles, Idioms, Avoid, Layout & architecture, Testing, Dependencies, Generated code, Security, UI. -->

<!-- Hand-reviewed 2026-09-29 (objective 42 rollout): Multi-stack root (general): Go API in go/ (go/Makefile), Flutter apps in flutter/ and flutter-navigators/ (component defaults). infra/tiles/build.sh builds map tiles, not the product, so it is not the root build. Drafter notes superseded; see .planning/STACK-REPORT.md. -->
