---
schema: 1
id: go
extends: general
languages: [go]
detect: [go.mod, go.work]

toolchain:
  go: { version_source: go.mod }      # the `go` directive gates which idioms and go-fix analyzers apply
  gopls: { min: "0.21" }              # MCP server; v0.21 adds go_rename_symbol and go_vulncheck
  govulncheck: {}

commands:
  build:   { run: "go build ./..." }
  test:    { run: "go test -race ./...", scoped: "go test -race {packages}" }
  lint:    { run: "go vet ./..." }
  format:  { run: 'test -z "$(gofmt -l .)"', apply: "gofmt -w {files}" }   # gofmt -l exits 0 either way; an empty listing is the pass
  fix:     { run: "go fix -diff ./...", apply: "go fix ./..." }       # Go 1.26+ modernizers
  audit:   { run: "govulncheck ./...", when: deps_changed }
  tidy:    { run: "go mod tidy -diff", apply: "go mod tidy", when: deps_changed }
  codegen: { run: "go generate ./...", when: sources_changed }

loop: [format, lint, test]
gates:
  task: [format, lint, fix, test]
  objective: [build, test, tidy, audit]

generated:
  globs: ["**/*.pb.go", "**/*_string.go", "**/zz_generated*.go"]
  markers: ["^// Code generated .* DO NOT EDIT\\.$"]      # the Go-wide convention
  regenerate: codegen

agent_tooling:
  mcp:
    - name: gopls
      command: gopls
      args: [mcp]
      required: false               # agents fall back to the CLI commands above
  instructions:
    - { export: "gopls mcp -instructions" }
  skills:
    - { source: "github.com/JetBrains/go-modern-guidelines", pin: "155dc7ca10da" }   # version-aware idioms (community)
  policy: { telemetry: "off" }

verification:
  runtime: service                  # override per project: cli | service

provenance:
  reviewed: "2026-09-28"
  sources:
    - https://go.dev/gopls/features/mcp
    - https://github.com/golang/tools/blob/master/gopls/internal/mcp/instructions.md
    - https://go.dev/blog/gofix
    - https://go.dev/blog/inliner
    - https://go.dev/blog/pkgsite-api
    - https://blog.jetbrains.com/go/2026/08/24/help-ai-coding-agents-write-up-to-date-code-with-modern-golang-skills/
---

# Stack Profile: go

Tier-2 profile, now bundled with DevFlow (`devflow/stack-profiles/go.md`). A project gets it with
`extends: go`. An org or user profile at `~/.claude/devflow/stacks/go.md` takes precedence over it.

**Upstream stance.** The Go team publishes *tooling*, not prose guidance: the gopls MCP server, its
exportable instructions, and `go fix` modernizers built because LLMs keep writing old Go. So this
profile leans on commands. Idioms that `go fix` enforces are listed under Avoid with the analyzer
name, not explained.

## Idioms

- Follow the gopls **read → edit** workflow when the MCP server is available:
  `go_workspace` → `go_search` → `go_file_context` → `go_package_api`. Before changing a definition,
  run `go_symbol_references`. After an edit, run `go_diagnostics` until clean. If go.mod changed, run
  `go_vulncheck`. Run `go test` on the affected packages only.
- `context.Context` is the first parameter of anything that does I/O or blocks. Never store it in a
  struct.
- Wrap errors with `%w` and context (`fmt.Errorf("load user %d: %w", id, err)`); compare with
  `errors.Is`/`errors.As`; combine with `errors.Join`.
- Structured logging with `log/slog`; take the logger from the caller or the package's existing pattern.
- Generics only where they remove real duplication. Prefer `slices`, `maps` and `cmp` from the
  standard library over hand-written helpers.
- Tests: table-driven with `t.Run`; `t.Context()` for per-test contexts (1.24+);
  `testing/synctest` for concurrent code with timers (1.25+); fuzz tests for parsers.

## Avoid

| Stale / wrong | Use instead | Enforced by |
|---|---|---|
| `io/ioutil` | `os` / `io` equivalents | `go fix` / staticcheck SA1019 |
| `interface{}` | `any` | `go fix -any` |
| `for i := 0; i < n; i++` over a count | `for i := range n` | `go fix -rangeint` |
| Hand-written min/max `if` | `min` / `max` builtins | `go fix -minmax` |
| Manual map-copy loops | `maps.Copy` / `maps.Collect` | `go fix -mapsloop` |
| `strings.Index` + slicing | `strings.Cut` | `go fix -stringscut` |
| `wg.Add(1); go func(){ defer wg.Done() … }()` | `wg.Go(func(){ … })` | `go fix -waitgroupgo` |
| `[]byte(fmt.Sprintf(…))` | `fmt.Appendf(nil, …)` | `go fix -fmtappendf` |
| Goroutine without a stop path | Tie its lifetime to a `context` or channel close | `go test -race`, review |
| Invented module versions | `go get mod@version` after checking pkg.go.dev | `go mod tidy`, build |

## Layout & architecture

`cmd/<binary>/main.go` stays thin. Private code goes in `internal/`. Package names are short,
singular and lower-case, with no `util` or `common`. Put interfaces where they're consumed, not
where they're implemented.

## Dependencies

Standard library first. Check versions against the pkg.go.dev API (`/v1beta`) or `go list -m -versions`.
Run `tidy` and `audit` after any go.mod change. Don't add a dependency with no tagged release.

## Generated code

Change the `//go:generate` source or the `.proto`, then run `codegen`. Files with the
`Code generated … DO NOT EDIT.` header are never edited by hand.
