---
schema: 1
id: "ao-terminal"
extends: "go"
components: [{ path: "tsunami/", profile: "go" }]
commands:
  deps: { run: "npm ci", when: "deps_changed" }
  build: { run: "task build:backend" }
  test: { run: "go test ./...", scoped: "go test -race {packages}" }
  test_frontend: { run: "npx vitest --run" }
  typecheck: { run: "task check:ts" }
  codegen: { run: "task generate", when: "sources_changed" }
  tidy: { run: "go mod tidy -diff", apply: "go mod tidy", when: "deps_changed" }
  bootstrap: { run: "task init" }
provenance:
  reviewed: "2026-09-29"
  sources: ["Taskfile.yml", ".github/workflows/ao-build.yml", ".github/workflows/ao-egress-guard.yml", ".github/workflows/codeql.yml", ".github/workflows/copilot-setup-steps.yml", ".github/workflows/deploy-docsite.yml", "package.json", "docs/package.json", "tsunami/frontend/package.json", ".planning/codebase/TESTING.md"]
---

# Stack Profile: ao-terminal

<!-- Drafted by `df-tools stack init`. Add no `## ` heading below unless this project genuinely diverges from `go`: an empty section would replace the parent's. Recognized sections: Principles, Idioms, Avoid, Layout & architecture, Testing, Dependencies, Generated code, Security, UI. -->

<!-- Hand-reviewed 2026-09-29 (objective 42 rollout): Wave Terminal fork: Go backend (wavesrv/wsh) + Electron/TypeScript frontend at the root, so typecheck and test_frontend are root keys. tsunami/ is a Go component; docs/ and tsunami/frontend/ are node sub-projects with their own package.json. `task go:mod:tidy` and `task npm:install` are internal (not CLI-invocable), so tidy applies with plain go mod tidy. `task init` is the one-shot dev bootstrap (also installs docs/). Drafter notes superseded; see .planning/STACK-REPORT.md. -->
