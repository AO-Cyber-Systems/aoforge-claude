---
schema: 1
id: "aocore"
extends: "general"
components: [{ path: "admin/", profile: "flutter" }, { path: "dev/devedge/", profile: "go" }, { path: "go/", profile: "go" }, { path: "portal/", profile: "flutter" }]
commands:
  codegen: { run: "go generate ./internal/spec/...", cwd: "go", when: "sources_changed" }
  build: { run: "go build ./...", cwd: "go" }
  test: { run: "go test -short -race ./... -timeout 5m", scoped: "go test -race {packages}", cwd: "go" }
  lint: { run: "golangci-lint run ./...", cwd: "go" }
  audit: { run: "govulncheck ./...", cwd: "go", when: "deps_changed" }
  helm_lint: { run: "helm lint helm/aocore-gateway/" }
  portal_codegen: { run: "bash portal/build.sh", when: "sources_changed" }
loop: ["test"]
provenance:
  reviewed: "2026-09-29"
  sources: [".github/workflows/flutter-heavy.yml", ".github/workflows/flutter.yml", ".github/workflows/go-heavy.yml", ".github/workflows/go.yml", ".github/workflows/helm-validate.yml", ".github/workflows/portal.yml", "admin/e2e/package.json"]
---

# Stack Profile: aocore

<!-- Drafted by `df-tools stack init`. Add no `## ` heading below unless this project genuinely diverges from `general`: an empty section would replace the parent's. Recognized sections: Principles, Idioms, Avoid, Layout & architecture, Testing, Dependencies, Generated code, Security, UI. -->

<!-- Hand-reviewed 2026-09-29 (objective 42 rollout): Multi-stack root (general), no task runner: commands mirror CI. The Go service lives in go/ and needs `go generate ./internal/spec/...` before build/test (CI runs it first). admin/ and portal/ are flutter components; portal/build.sh validates the OpenAPI spec and refreshes the portal client (portal_codegen). Helm chart lint mirrors helm-validate.yml. Drafter notes superseded; see .planning/STACK-REPORT.md. -->
