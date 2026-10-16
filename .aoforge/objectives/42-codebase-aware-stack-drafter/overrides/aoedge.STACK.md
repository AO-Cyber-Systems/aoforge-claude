---
schema: 1
id: "aoedge"
extends: "go"
commands:
  test: { run: "make test" }
  build: { run: "make build-fips" }
  lint: { run: "make lint" }
  format: { run: "test -z \"$(gofmt -l .)\"", apply: "make fmt" }
  tidy: { run: "go mod tidy -diff", apply: "make tidy", when: "deps_changed" }
  acceptance: { run: "make acceptance" }
provenance:
  reviewed: "2026-09-29"
  sources: ["Makefile", ".github/workflows/ci.yml", ".github/workflows/release.yml"]
---

# Stack Profile: aoedge

<!-- Drafted by `df-tools stack init`. Add no `## ` heading below unless this project genuinely diverges from `go`: an empty section would replace the parent's. Recognized sections: Principles, Idioms, Avoid, Layout & architecture, Testing, Dependencies, Generated code, Security, UI. -->

<!-- Hand-reviewed 2026-09-29 (objective 42 rollout): FIPS is the shipping configuration, so build is build-fips (build-dev is the non-FIPS local variant). The make acceptance* targets are scenario suites against a running edge, not the repo-wide test. Drafter notes superseded; see .planning/STACK-REPORT.md. -->
