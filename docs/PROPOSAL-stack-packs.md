# SPEC: Stack Packs for DevFlow — Go, Dart, and Flutter Agent Layer

| | |
|---|---|
| **Repo** | `AO-Cyber-Systems/devflow-claude` (marketplace) — core `devflow` plugin + new stack-pack plugins; new companion binary `dflang` (working name) |
| **Status** | Draft v0.5 — 2026-09-23. **Decision: language-agnostic core + stack packs** (see §0). Open questions: 18 of 19 closed (§8); Q18 needs the owner. |
| **Owner** | Justin Donnaruma (CInvO) |
| **Consumers** | DevFlow Claude (Claude Code plugin), DevFlow Native (`df`), forge CI |
| **Reviewed against** | `main` @ `6c0e9b5` (v2.9.0 + #88, objective 34) |

### Changes in v0.5

- §8 rewritten: every open question researched against the AO repos and upstream docs. 18 of 19 are resolved or have a recommended default; only Q18 (ui-oracle-loop W2 sequencing) needs a decision.
- §6.2: `ao_lints` is built on `analysis_server_plugin` (`custom_lint` is archived); D002 allows Riverpod only.
- §6.7: the goldens policy is set (in-repo, pinned Linux image, CI comparisons with text drawn as boxes).
- §6.8: the contract layer supports both buf + Connect and OpenAPI + oapi-codegen, because AO runs both.
- §6.12: SDK chosen (official go-sdk); parity map filled in from the current `gopls mcp` and `dart mcp-server` tool lists; telemetry policy corrected, since Go telemetry can only be switched off per user.
- §5A.1: the manifest gains `requires_tool` and `ui.must_not_extra`.
- §7, Q15: plugin dependency versions resolve from `{name}--v{version}` git tags, so the release process adds them in M0.
- §9.1: ui-oracle-loop W1a needs two changes before it executes: TRD 1a-11 moves to `analysis_server_plugin`, and eden-ui-flutter copies core's must-not vocabulary instead of authoring its own.

### Changes in v0.4

- §0 and §9 updated: ui-oracle-loop is **being built in core**, not awaiting review. Wave 0 shipped in v2.8.0; W1b merged as objective 34 (#88). W2 and W4 are planned for core.
- §0, §5A.6, §10: the `ui-evaluator` agent and the `ui-eval` / `design-review` skills are also Flutter-specific and move to the pack.
- §5A.2, §8 Q15: resolved. `plugin.json` supports `dependencies` with semver constraints. Packs declare a dependency on `devflow` rather than checking for it in a hook.
- §5A.1, §7, §10: fixed the version sequencing. Packs need the **contract release** (2.x), not 3.0.0; 3.0.0 only removes the shim.
- §1, §5A.4: resolved the conflict between "degrades gracefully" and "`missing` never counts as `pass`". `missing` blocks, and a named, logged override exists (§5A.8).
- §9, §10: audited the W1b modules. The Surface Spec code is essentially stack-neutral and **stays in core** as the UI surface contract; three inputs it currently assumes (Flutter paths, the eden-ui pattern catalogue, the must-not vocabulary) become pack or org-layer inputs.
- §5A.7: the grep guard now names its exclusions and gives the W1b cleanup it depends on.
- §8: added Q18 (W2 sequencing) and Q19 (must-not vocabulary ownership).

---

## 0. Findings from devflow-claude v2.9.0 (why this spec changed)

Reviewed `main` of `AO-Cyber-Systems/devflow-claude` on 2026-09-23 at `6c0e9b5`.

**Core is not language-agnostic today. It is opinionated toward Flutter, with a thin, generic layer for everything else.**

| Where | What's there |
|---|---|
| `plugins/devflow/devflow/bin/lib/` | 24 `flutter-*` files (bootstrap, setup, scope detection, state coverage, UI eval/VLM judge, design review, package-dir resolution) plus the `ui-*` files; together ~20% of `bin/lib`, tests included. The W1b `ui-spec*` / `ui-sheet` modules are near stack-neutral (see §9). |
| `agents/executor.md` | ~196 of 1,013 lines are Flutter/Maestro sections (bootstrap detector, per-task `flutter analyze` baseline diff, integration_test + Maestro gates) |
| `agents/planner.md` | ~280 of 1,175 lines: Flutter UI scope sub-procedure, required TRD fields (`stack: flutter`, `platform: [mobile, web]`, `tests.maestro`) |
| `agents/verifier.md` | ~104 of 927 lines: Flutter state coverage, Step 8b Maestro, orphan-flow detection |
| `agents/ui-evaluator.md` | Flutter-only agent (captures and scores Flutter UI states) |
| Agent frontmatter | Playwright and `mcp__maestro__*` tools hard-wired into the `tools:` lists of **executor, verifier, and ui-evaluator** |
| Skills | `ui-eval` and `design-review` are Flutter-only; `verify-work` carries Flutter branches |
| `df-tools.cjs` | `verify flutter-ui-bootstrap`, `verify flutter-state-coverage`, `verify flutter-ui-eval`, `detect flutter-ui-scope`, `flutter-ui setup/eval` |
| `references/` | `design-stack-flutter.md`, `flutter-state-patterns.md`; `testing-strategy.md` matrix with Rails / Go / Flutter / Node columns described as "observed AOCyber org practice" |
| In flight | **UI Oracle Loop** (`docs/PROPOSAL-ui-oracle-loop.md`, `docs/IMPLEMENTATION-PLAN-ui-oracle-loop.md`). W0 shipped (v2.8.0). W1b shipped in core (objective 34, v2.9.0): Surface Spec schema, validate/render, review sheet, look-lock, `agent-shell-harness`. **W2 (CDP probe driver, planner/executor/verifier loop) and W4 (Maestro adapter) are planned for core.** |

**Go gets essentially nothing** beyond generic examples (`go test ./...` in Bash-hygiene tables, a `go.mod` detect line, one matrix column).

**The generic parts are good and should be the seam:** `kind` × `work` defaults table, the stack-agnostic resolver `verification` text, the layer × tool × stack testing matrix, the `pm-backend.cjs` dispatcher (a backend seam with one implementation, GitHub), `api-contract.cjs`, and — new since v0.3 — the W1b Surface Spec pipeline.

**The add-on precedent already exists.** The `aocyber` marketplace ships `eden-ui-flutter`, `eden-ui-web`, and `monorepo-standards` as separate plugins. But `eden-ui-flutter` is only a design skill; the Flutter *workflow* logic landed in core instead.

**Options considered:**

1. Agnostic core + stack packs, extracting today's Flutter logic — **chosen**.
2. Openly opinionated core for the AO stack: fastest, but locks DevFlow to AO's stacks and keeps loading every stack's instructions into every run.
3. Contract now with Flutter left in core until later: lower short-term risk, but two patterns live side by side and the temporary state tends to stick.

**Decision (2026-09-23):** core `devflow` becomes language-agnostic and defines a **stack pack contract**. All language- and platform-specific support ships as add-on plugins that implement it. Today's Flutter logic, and the Playwright web path, move out of core into packs (§10). The Go/Dart/Flutter layer in this spec is built as packs from day one and is never wired into core agents.

**Rule going forward:** no new language-, framework-, or device-specific logic lands in `plugins/devflow/`. It goes in a pack, or into the contract if it's genuinely stack-neutral. **This applies to ui-oracle-loop W2 and W4** (§9).

## 1. Summary

Add a language layer to DevFlow that makes Go, Dart, and Flutter code **hard to write wrong and cheap to verify** for AI agents. The layer is tooling and constraints only — lints, generators, gates, render checks, and generated knowledge of our internal libraries. The code agents write stays plain Go and Dart.

The work splits into four deliverables:

- **A. Stack pack contract (core `devflow`)** — a language-neutral extension point: pack discovery, a standard verify result schema, and injection points for planner, executor, verifier, and debugger (§5A). Core ships **no** language-specific logic after the migration.
- **B. `dflang`** — a standalone Go binary that owns the language intelligence for Go, Dart, and Flutter: stack detection, shared analyzer daemon, **our own MCP server (§6.12)**, `verify`, codegen orchestration, internal-package skill generation, and the Flutter render harness. No Claude-specific logic, so DevFlow Native and CI use the same binary.
- **C. Stack pack plugins** — `devflow-stack-go` and `devflow-stack-flutter` (which covers Dart), each a thin plugin that registers with the contract and drives `dflang`; plus `devflow-stack-web` to hold the extracted Playwright path. Optional org layers such as `eden-ui-flutter` sit on top.
- **D. Migration** — move today's in-core Flutter and web verification logic into packs without breaking aodex, eden-biz, or other current users (§10).

**Degradation rules:**

- **No pack matches the repo** → core runs its generic verification (the TRD's Bash `verify` steps), exactly as it does today for unsupported stacks.
- **A pack matches but can't run** (e.g. `dflang` not installed) → verify reports `missing`, and `missing` **blocks the commit** like `fail`. The executor stops with the pack's install instruction rather than looping. The only way past it is an explicit, logged override (§5A.8).

"Graceful" means the failure is named and actionable, not that it's silently skipped.

## 2. Problem

Frontier models write decent Go and Flutter, but fail in consistent ways:

- **Go:** stale idioms (`io/ioutil`, `interface{}`, pre-`slog` logging), goroutine leaks, missing `context` propagation, races that only `-race` catches, inconsistent error wrapping, invented module versions.
- **Dart:** Dart 2-era code that underuses records, patterns, and sealed classes; codegen mistakes (forgetting `build_runner`, editing `.g.dart` / `.freezed.dart` directly).
- **Flutter:** code that analyzes clean but overflows or breaks at other sizes and text scales; deep widget trees that attract misplaced edits; mixed state-management styles; deprecated APIs; flailing on Gradle / CocoaPods / SPM failures.
- **Ours specifically:** agents know nothing about eden-libs, eden-ui-flutter, or AOCore client APIs, and the Go↔Flutter API boundary drifts.
- **Operational:** each parallel agent spawns its own gopls (~200–500 MB each), which breaks wave parallelism on laptops.

The official Flutter agent plugin (skills, rules, `dart mcp-server`) and the experimental gopls MCP server cover generic knowledge and analysis. They don't cover our dialect, our private code, the cross-language contract, visual verification, or a single pass/fail gate. They also carry vendor coupling we don't want in an AO product: client-specific setup (Gemini CLI, Antigravity), Google-hosted services (pub.dev search, Developer Knowledge MCP, Go module mirror and vuln DB by default), and opt-in or built-in analytics. §6.12 replaces them with one AO-owned MCP server at feature parity.

## 3. Goals

1. One command, `dflang verify`, returns a machine-readable pass/fail scoped to the diff, and DevFlow cannot commit a task without it passing.
2. AO dialect enforced as analyzer **errors with autofixes**, so stale training data becomes a mechanical fix.
3. Agents get accurate, version-pinned knowledge of our internal Go modules and Dart packages.
4. Flutter UI changes are verified by rendering, not just analysis.
5. Go↔Flutter API changes are schema-first, and the generated code on both sides can't drift.
6. One analyzer daemon per workspace, shared by all agents in a wave.
6a. One AO-owned MCP server covering Go, Dart, and Flutter at parity with `dart mcp-server` and gopls MCP, with no vendor-specific tools, services, or telemetry.
7. Measurable: an eval suite shows the layer's effect on pass rate, tool calls, and tokens for Claude and for Gemma 4 (DevFlow Native).

## 4. Non-goals

- **No DSL, transpiler, or new syntax.** New syntax has no training data; it would make agents worse.
- Not replacing the language servers themselves. We use gopls and the Dart analysis server as engines, over LSP. We **do** replace their MCP front ends and the official agent plugin with our own (§6.12); those remain reference implementations and parity targets, not runtime dependencies.
- Not a general-purpose linter product. Rules exist to serve agents and AO conventions.
- No languages beyond Go, Dart, Flutter in v1 — but the contract must be proven stack-neutral by the Node pack in §10 (core's own stack) or an equivalent second non-AO-primary stack.
- Not changing DevFlow's workflow model (objectives → TRDs → waves → atomic commits → verification). Packs plug into it; they don't fork it.

## 5. Architecture

```
┌─────────────── devflow (core plugin, language-agnostic) ────────┐
│ agents: planner / executor / verifier / debugger                │
│         (no stack logic; call `df-tools stack …` injection pts) │
│ df-tools stack: discover │ context │ verify │ plan-rules        │
│ df-tools ui spec/sheet/lock (Surface Spec — stack-neutral)      │
│ schemas: stack-pack, verify-result, surface-spec                │
└──────────────┬───────────────────────────────┬──────────────────┘
               │ pack manifest + fragments     │
┌──────────────▼──────────────┐  ┌─────────────▼──────────────────┐
│ devflow-stack-go (plugin)   │  │ devflow-stack-flutter (plugin) │
│ manifest, prompt fragments, │  │ Dart + Flutter; absorbs today's│
│ skills, hooks, .mcp.json    │  │ in-core Flutter logic (§10)    │
│ debugger playbooks          │  │ + ui-evaluator, ui-reviewer    │
└──────────────┬──────────────┘  └─────────────┬──────────────────┘
               │  optional org layers on top:  │ eden-ui-flutter, …
               └───────────────┬───────────────┘
                               │ stdio / CLI --json
┌──────────────────────────────▼──────────────────────────────────┐
│ dflang (Go binary)                                              │
│  MCP server (§6.12) — one tool surface for all three stacks     │
│  daemon (one per workspace root) ── gopls (LSP, one)            │
│                                 ── dart language-server (LSP)   │
│                                 ── Flutter daemon / VM service  │
│                                 ── registry adapters (config)   │
│  verify │ codegen │ skills gen │ render │ contract │ doctor     │
└─────────────────────────────────────────────────────────────────┘
```

- Each agent's MCP config launches `dflang mcp`, a thin stdio shim that connects to (or starts) the workspace daemon over a local socket. N agents → 1 gopls + 1 Dart analysis server.
- The daemon's socket path is derived from the workspace root and toolchain versions, so separate worktrees (workstreams) get separate daemons.
- All `dflang` subcommands also work as plain CLI calls with `--json`, so hooks and CI don't need MCP.
- Core never calls `dflang` directly. It calls whatever verify command each active pack registers. `dflang` is an implementation detail of the Go and Flutter packs.

## 5A. Stack pack contract (core `devflow`)

The contract is modeled on the existing `pm-backend.cjs` seam: core defines the interface and the dispatch, packs provide implementations. Core must behave exactly as it does for a stack with no pack today (generic Bash verification from the TRD) when no pack matches.

### 5A.1 Pack manifest

Each pack plugin ships `devflow-stack.json` at its plugin root:

```json
{
  "schema": 1,
  "name": "go",
  "contract": 1,
  "detect": { "files": ["go.mod", "go.work"], "priority": 50 },
  "verify": {
    "command": ["dflang", "verify", "--json"],
    "changed_flag": "--changed",
    "all_flag": "--all",
    "result_schema": 1
  },
  "fix": { "command": ["dflang", "fix", "--json"] },
  "install_hint": "brew install aocyber/tap/dflang",
  "requires_tool": { "dflang": ">=0.3.0" },
  "fragments": {
    "planner":  "fragments/planner.md",
    "executor": "fragments/executor.md",
    "verifier": "fragments/verifier.md",
    "debugger": "fragments/debugger.md"
  },
  "subagents": { "verifier": ["go-runtime-verifier"] },
  "trd_fields": "schemas/trd-fields.schema.json",
  "task_templates": "templates/",
  "generated_file_globs": ["*.pb.go", "**/zz_generated*.go"],
  "ui": {
    "metrics_paths": [],
    "pattern_catalogue": null,
    "must_not_extra": []
  },
  "doctor": { "command": ["dflang", "doctor", "--json"] },
  "testing_matrix": "references/testing-matrix.md"
}
```

- **Core version compatibility is not in the manifest.** It goes in the pack's `plugin.json` `dependencies` (§5A.2), which Claude Code enforces at install/enable time. `contract` is the contract schema version the pack implements; core refuses a pack whose `contract` it doesn't support and says so once per session.
- `ui` is optional. It supplies the stack-specific inputs the Surface Spec pipeline currently hard-codes (§9): the source paths `ui-metrics` scans, where the pattern catalogue comes from, and extra must-not terms that are added to core's vocabulary, never replacing it (Q19). Org layers such as `eden-ui-flutter` fill these through the pack.
- `requires_tool` pins external binaries. If one is missing or too old, verify reports `missing` with `install_hint`. Packs never download binaries themselves (Q4).

### 5A.2 Discovery

- **Dependency on core:** each pack's `plugin.json` declares

  ```json
  "dependencies": [{ "name": "devflow", "version": ">=2.10.0" }]
  ```

  where 2.10.0 stands for **the release that ships the contract** (M0). Claude Code checks this at install/enable and enables `devflow` when the pack requires it. Packs don't need a hook to check for core.
- **Reading pack files:** Claude Code rejects component paths outside a plugin's own root, so core can't read a pack's files at a known path, and skill `@path` references don't interpolate `${CLAUDE_PLUGIN_ROOT}` (the reason core's `sync-runtime` hook exists). So each pack ships a **SessionStart hook** that mirrors its manifest and fragments into `~/.claude/devflow/stacks/<name>/`, using the same `.plugin-version` marker pattern as `sync-runtime`. Core ships the mirror logic as a small reusable script that packs vendor, so there is one implementation.
- `df-tools stack discover [--raw]` lists installed packs. `df-tools stack detect <dir> --raw` returns which packs match a repo, and for monorepos, which pack owns which directory (e.g. `go/` → go, `flutter/` → flutter). It generalizes today's `flutter-package-dir.cjs`.
- A mirrored pack whose plugin is no longer enabled is ignored: `discover` cross-checks `installed_plugins.json` (the registry truth) rather than trusting the mirror directory alone.
- `.planning/config.json` can pin or disable packs: `{ "stacks": { "enabled": ["go", "flutter"], "disabled": [] } }`.

### 5A.3 Injection points (what core agents call)

Core agent prompts replace every stack-specific section with one generic step:

| Agent | Core step | Core command |
|---|---|---|
| Planner | Load stack planning rules, required TRD fields, task templates for the files a TRD touches | `df-tools stack context planner --files <list>` |
| Executor | Pre-task setup check; per-task and post-all-tasks gates | `df-tools stack context executor --trd <path>`, `df-tools stack verify --changed` |
| Verifier | Primary evidence = merged verify results from all matching packs; delegate to pack sub-agents named in `subagents` | `df-tools stack verify --all --trd <path>` |
| Debugger | Load pack playbooks for the failure classes found | `df-tools stack context debugger --findings <verify.json>` |
| Codebase mapper / researcher | Stack summary | `df-tools stack doctor` |

`df-tools stack context` returns the concatenated fragments of matching packs, capped by a token budget, so a pure Go repo never loads Flutter text and vice versa. Today every executor run carries ~196 lines of Flutter instructions whether or not the repo contains Dart.

### 5A.4 Verify result schema (stack-neutral)

`verify-result.schema.json` lives in core `schemas/`. It's the §6.3 JSON, generalized: `status` (`pass | fail | missing | error`), `scope`, `steps[]`, `findings[]` (with `id`, `severity`, `tool`, `file`, `line`, `message`, `fix_available`), `artifacts[]` (screenshots, reports, with paths under `.planning/`), `truncated`, `summary`, and `install_hint` when `status` is `missing`. Exit codes 0 / 1 / 2 as in §6.3.

Core merges results across packs, gates commits on them, and writes `.planning/verify/<task-id>.json`. Merge rule: the merged status is the worst of the pack statuses, ordered `error` > `missing` > `fail` > `pass`. **A pack that is expected but can't run reports `missing`, and `missing` never counts as `pass`** (adopting ui-oracle-loop goal 5).

### 5A.5 Hooks

Hooks stay in each pack's own `hooks.json`, since Claude Code plugins register their own hooks independently. Core adds one shared helper, `df-tools stack generated-check <file>`, so the generated-file block works from the union of all packs' `generated_file_globs` plus the `Code generated … DO NOT EDIT.` header rule.

### 5A.6 Agent tool permissions

Core's **executor, verifier, and ui-evaluator** currently hard-code Playwright and `mcp__maestro__*` in their `tools:` frontmatter. A pack can't append tools to another plugin's agent. Options (resolved in Q12 — option 1):

1. **Pack sub-agents:** packs ship their own narrow agents (`flutter-ui-verifier`, `web-ui-verifier`, `go-runtime-verifier`) with the tools they need — confirmed supported: plugin agents carry their own `tools:`. Core verifier delegates by name from the manifest `subagents` field. Keeps core frontmatter clean. **Recommended.** `ui-evaluator` moves to the Flutter pack whole.
2. **Core drops the `tools:` restriction** on executor/verifier and relies on the pack's MCP servers being present. Simpler, but broadens every agent's tool surface.

The executor's per-task gate doesn't need MCP tools — `df-tools stack verify` is a Bash call — so under option 1 the core executor keeps a stack-free `tools:` list.

### 5A.7 Acceptance

- With **no packs installed**, the full core test suite passes and a sample objective in a Go repo and a Flutter repo completes using generic verification only.
- **Neutrality guard.** This must return nothing:

  ```bash
  grep -rliE 'flutter|\bdart\b|maestro|playwright|gopls|pubspec' plugins/devflow/{agents,skills,devflow/bin/lib,devflow/workflows} --exclude-dir=__fixtures__/stack-contract
  ```

  The only allowed exceptions are the contract's own test fixtures (`__fixtures__/stack-contract/`) and the migration shim files named in §10, listed in an allowlist file the guard reads. It runs in core CI so the rule in §0 holds. It is added in M0 in **report-only** mode (prints the current count) and switched to failing when M0.5 finishes.
- For the guard to pass, the W1b modules need their Flutter references removed in M0.5: comments naming `flutter-ui-eval.cjs` and `eden-ui-flutter` in `ui-spec-cli`, `ui-spec-render`, `ui-spec-validate`; the `['flutter/lib']` default in `ui-metrics`; and `agent-shell-harness` fixtures (`__fixtures__/agent-shell/bin/{flutter,maestro,adb}`), which move with the harness (§10).
- A third pack (Node, for core's own repo) implements the contract with no core changes.

### 5A.8 Overriding a `missing` or `fail` result

A blocked commit can be released only with the existing structured override:

```bash
node ~/.claude/devflow/bin/df-tools.cjs override --gate stack-verify --reason "<why>"
```

The override is scoped to one task, is recorded in `.planning/verify/<task-id>.json` and the session audit, and shows up in `df-tools telemetry`. Agents never issue it themselves; the executor surfaces the pack's `install_hint` and stops as a checkpoint for the user.

## 6. Components (implemented in `dflang` and the Go / Flutter packs)

### 6.1 Stack detection and setup

**`dflang doctor --json`** detects:
- `go.mod` / `go.work` modules; Go toolchain version; gopls version
- `pubspec.yaml` packages; Dart and Flutter SDK versions; codegen packages in use (`build_runner`, `freezed`, `json_serializable`, …)
- Contract schema location (see 6.8), if any
- Missing tools, with install commands

**`/devflow-stack-go:setup`** and **`/devflow-stack-flutter:setup`** (one setup skill per pack; each touches only its own stack, and both can run in a monorepo):
1. Runs `dflang doctor` and writes the result to `.planning/stack.json`.
2. Installs the pack's AO-curated skills and rules (shipped in the pack plugin, not pulled from vendor repos) and adds the rules to `CLAUDE.md` inside a pack-named marker block so the other pack and core's `claude-md.cjs` don't clobber it. Upstream official skills (BSD-licensed) may be used as source material, but are reviewed and stripped of vendor-specific tooling, clients, and services before inclusion.
3. Adds `dflang mcp` to `.mcp.json` as the only language MCP server, and removes existing `gopls mcp`, `dart mcp-server`, and official Flutter plugin MCP entries (with a note in the setup output).
3a. Applies the telemetry and registry policy from §6.12.5 (disables Go, gopls, Dart, and Flutter analytics for the workspace toolchain; writes registry config).
4. Writes the AO lint configs (6.2) if absent.
5. Runs `dflang skills gen` (6.6).

**Acceptance:** on a fresh Go+Flutter repo with both packs installed, running both setup skills leaves a working `df-tools stack verify` with no manual steps other than installing missing SDKs. With only one pack installed, the other stack falls back to core's generic verification.

### 6.2 AO dialect lints

Two rule packs, versioned with `dflang`. All AO rules default to **error**; each rule has an autofix where one is mechanical, and a message that names the replacement.

**Go — `aolint`** (built on `golang.org/x/tools/go/analysis`, shipped as a multichecker inside `dflang`):

| ID | Rule | Autofix |
|---|---|---|
| G001 | No `io/ioutil` | yes |
| G002 | `any` instead of `interface{}` | yes |
| G003 | When returning a wrapped error with `fmt.Errorf`, use `%w` | yes |
| G004 | Exported funcs that do I/O or call ctx-taking funcs take `context.Context` first | no |
| G005 | No `context.Background()`/`TODO()` outside `main`, tests, and init | no |
| G006 | `go` statements must be tied to a ctx, `errgroup`, or `WaitGroup` (heuristic) | no |
| G007 | Logging via `log/slog`; no `log.Print*` or `fmt.Print*` in non-`main` packages | partial |
| G008 | No `panic` in library packages (except `Must*` helpers) | no |

Always-on companions: `go vet`, `staticcheck`, `govulncheck`, `gofmt`.

**Dart/Flutter — `ao_lints`** (built on `analysis_server_plugin`, stable since Dart 3.10; its rules and fixes run in `dart analyze` / `flutter analyze`, not just the IDE. `custom_lint` is archived and not used. See Q3):

| ID | Rule | Autofix |
|---|---|---|
| D001 | Pending `dart fix` migrations fail verify (covers upstream deprecations like `withOpacity`, `WillPopScope`) | via `dart fix` |
| D002 | Only the configured state-management package may be imported (AO default: Riverpod family; `bloc`, `provider`, `get_it`, `signals`, `mobx`, `get` forbidden — Q2) | no |
| D003 | Result/state types that are switched on must be `sealed`; switches must be exhaustive | partial |
| D004 | `build` methods over N lines or nesting depth K must extract widgets (defaults N=80, K=6) | no |
| D005 | No hardcoded `Color`, `TextStyle`, or spacing literals outside theme files — use eden-ui tokens | no |
| D006 | No imports from another package's `src/` | no |

`analysis_options.yaml` also sets `strict-casts`, `strict-inference`, `strict-raw-types`, and `--fatal-infos` in verify.

D005 overlaps the token lints planned in eden-ui-flutter W1a (`no_raw_color`, `text_style_needs_family`, `no_magic_spacing`). W1a plans them on `custom_lint`, so they have to be retargeted to `analysis_server_plugin` (§9.1). D005 then reuses those rules rather than writing a second implementation, and `ao_lints` re-exports them.

D004 and D005 apply only to packages with a `flutter` SDK dependency. Pure-Dart packages (the `*-api-dart` clients, model libraries) get D001–D003 and D006 (Q13).

Rule config (thresholds, allowed state package, token package) lives in `.devflow/lang.yaml`.

**Acceptance:** each rule has positive and negative fixtures; every autofix round-trips (fix → re-analyze → clean).

### 6.3 `dflang verify`

The single gate. Scoped by default to packages touched by the working-tree diff (`--changed`), with `--all` for CI.

Pipeline, stopping early on hard failures:

1. **Format** — `gofmt -l`, `dart format --set-exit-if-changed`
2. **Codegen drift** — run codegen (6.5) and contract generation (6.8); any resulting diff = fail
3. **Analyze** — `go vet`, `staticcheck`, `aolint`; `dart analyze --fatal-infos` with `ao_lints`; `dart fix --dry-run` must be empty
4. **Test** — `go test -race` for changed packages and their reverse deps; `flutter test` / `dart test` for changed packages
5. **Security** — `govulncheck` (changed modules only)
6. **Render** — for changed widgets that have render specs (6.7)
7. **Contract** — contract tests (6.8)

Output (`--json`):

```json
{
  "status": "fail",
  "scope": {"mode": "changed", "go_packages": ["./internal/api"], "dart_packages": ["app"]},
  "steps": [
    {"name": "analyze", "status": "fail", "duration_ms": 2140}
  ],
  "findings": [
    {
      "id": "G003", "severity": "error", "tool": "aolint",
      "file": "internal/api/users.go", "line": 42,
      "message": "wrap error with %w: fmt.Errorf(\"load user: %v\", err)",
      "fix_available": true
    }
  ],
  "truncated": false,
  "summary": "1 error in 1 file. Run `dflang fix` to apply 1 autofix."
}
```

Requirements:
- Findings are capped (default 40) and sorted by severity, then by file proximity to the diff; `truncated` reports the rest.
- `dflang fix` applies all available autofixes, then re-runs analyze.
- Exit codes: 0 pass, 1 findings, 2 tool/setup error (distinguish so the debugger doesn't "fix" a missing SDK).
- A full verify report is written to `.planning/verify/<task-id>.json`.

**Acceptance:** `verify --changed` on a one-file change in a mid-size repo completes in under 60 s warm (excluding render step).

### 6.4 Hooks (declared in each pack's `hooks.json`, not core)

| Hook | Behavior |
|---|---|
| **SessionStart** | Mirror manifest and fragments (§5A.2); `dflang doctor --quick`; warn in-session if stack changed since `.planning/stack.json` |
| **PreToolUse (Edit\|Write)** | **Block** edits to generated files: `*.g.dart`, `*.freezed.dart`, `*.pb.go`, contract-generated dirs, and any file with a `Code generated … DO NOT EDIT.` header. Message tells the agent which source file and command to use instead. |
| **PostToolUse (Edit\|Write)** | Format the file; if it's a codegen source (annotated model, schema file), run targeted codegen; return new diagnostics for that file only (short) |
| **Pre-commit (DevFlow atomic commit step)** | Owned by **core**: `df-tools stack verify --changed` runs every matching pack's registered verify and must return `pass`; otherwise the executor loop continues. Packs don't gate commits themselves. |

### 6.5 Codegen orchestration

- `dflang codegen [--changed]` runs `build_runner build --delete-conflicting-outputs` for affected Dart packages and `go generate` for affected Go packages.
- Knows which sources feed which generated files (from `build_runner` config and `//go:generate` directives) to run the minimum.
- Keeps a warm `build_runner watch` in the daemon when the repo uses heavy codegen, to avoid cold-start cost.

### 6.6 Internal package knowledge

**`dflang skills gen`** generates agent skills for every **internal** Go module and Dart package in the workspace and in dependencies that match configured internal prefixes (e.g. `github.com/ao-cyber-systems/*`, `eden_*`, `ao_*`).

Per package, the generated skill contains:
- Purpose (from package doc comment / README)
- Public API surface: exported types, funcs, widgets, with signatures and one-line docs
- Usage examples pulled from `Example*` tests and `example/` dirs
- Invariants and "don't" notes from doc comments tagged `// AGENT:` or `/// AGENT:`
- The exact version, from `go.sum` / `pubspec.lock`

Output goes to `.claude/skills/internal/<package>/SKILL.md` for DevFlow Claude, and uses Dart's package-skills format for published Dart packages so other tools pick them up too.

Regenerate on SessionStart when lockfiles change.

**Acceptance:** an agent asked to use an eden-ui-flutter widget it hasn't seen picks the right constructor and theme tokens without reading source.

### 6.7 Flutter render harness

Package `ao_render_harness` (dev dependency) plus `dflang render`.

- A widget opts in with a render spec (a `*.render.dart` file or annotation) listing named scenarios with sample data.
- `dflang render <spec|--changed>` runs each scenario headless via `flutter test` across a matrix: sizes (phone / tablet / desktop), light/dark, text scale (1.0 / 1.5 / 2.0), and optionally one RTL locale.
- Output per scenario: PNG, semantics tree (JSON), captured layout exceptions (overflow, unbounded constraints) as structured findings, and a golden diff against the baseline.
- Layout exceptions and missing semantics labels are **verify failures**. Golden diffs are **warnings** routed to the ui-reviewer agent.
- `dflang render --accept` updates goldens (human or ui-reviewer approval only).

**Goldens (Q6):** committed in-repo next to the tests. The gate compares CI goldens, which draw all text as boxes in the Ahem font so they render the same everywhere, generated in a pinned Linux container image that ships with the pack's CI workflow. Platform goldens with real text are for human review only and never gate. `--accept` regenerates inside that image.

**Overlap with ui-oracle-loop W1a:** eden-ui-flutter is building a story harness (`tool/story_test.dart`: golden light+dark + `expectUiSane` per story) and `expectUiSane`. Before building `ao_render_harness`, decide whether render specs *are* W1a stories (preferred: one harness, `dflang render` drives it) or a separate format. Don't ship two.

**Acceptance:** a deliberately overflowing `Row` fails verify with file, widget, and scenario named; no device or emulator needed.

### 6.8 Contract layer (Go ↔ Flutter)

- Schema is the source of truth for every API between Go services and Flutter clients. AO runs two systems, so the contract layer is an adapter interface (Q1):

  | Adapter | Used by | Generate | Breaking check |
  |---|---|---|---|
  | `buf` — Protobuf + Connect (**default for new APIs**) | eden-platform-go / eden-platform-api-dart, eden-biz, aoid; aodex links Connect | `buf generate` with the repo's `buf.gen.yaml` | `buf breaking` vs base branch |
  | `openapi` — OpenAPI + oapi-codegen / openapi-generator | aodex, aocore | the repo's `go generate` directive + `openapitools.json` | `oasdiff breaking` |

  `dflang` detects the adapter from `buf.yaml` / `openapi.yaml` and **reuses the repo's existing generator config**. It never writes its own. eden-biz's `proto-gen-drift.yml` is the reference drift check.
- `dflang contract gen` generates Go handlers/interfaces, Dart clients, and typed fixtures through the adapter.
- `dflang contract test` runs round-trip tests: Dart client fixtures against the Go handler in-process.
- Verify fails if generated code differs from what the schema produces, or on breaking schema changes without a version bump (`buf breaking` or equivalent).
- The planner template (6.9) requires any API change to start with a schema task.

### 6.9 Agent and workflow changes (as pack fragments)

Everything below ships as **pack fragments** (§5A.1) and is loaded through `df-tools stack context`. None of it is written into core agent prompts. Go fragments ship in `devflow-stack-go`; Dart/Flutter fragments, the render/UI items, and the ui-reviewer agent ship in `devflow-stack-flutter`; cross-stack contract templates (schema → Go → Dart → contract test) ship in `devflow-stack-go`, because the Go service owns the schema in both adapters (Q1); the Flutter pack contributes the Dart-client task template.

**Researcher:** reads `.planning/stack.json` and relevant internal-package skills before proposing approaches.

**Planner:** language-aware task templates:
- API change → schema task → Go impl task → Dart client task → contract test task
- Model change → source edit + codegen (never edit generated output)
- New widget → widget task + render spec task
- Each task's "done" = `df-tools stack verify --changed` passes for its scope (core runs `dflang verify` through the pack's registered command)

**Executor:** rules added to its prompt:
- Run `df-tools stack verify --changed` before signaling completion; apply the pack's registered fix (`dflang fix`) first
- Never hand-edit generated files
- Use internal-package skills before reading source

**Verifier:** treats the verify JSON as the primary evidence; fails the task on any error finding; adds render PNGs to its review when UI changed.

**Debugger:** playbooks (skills) for recurring failure classes:
- `-race` reports → locate shared state, prefer ownership/channels over mutexes when local
- Flutter layout exceptions → constraint diagnosis steps
- Gradle / CocoaPods / SPM failures → known fixes list; escalate to human after 2 failed attempts rather than looping
- Exit code 2 from verify → setup problem, report, don't edit code

**New agent: ui-reviewer** (in `devflow-stack-flutter`) — reviews render output (PNGs + semantics + golden diffs) against the task's intent; can approve golden updates. eden-ui conventions come from the `eden-ui-flutter` layer when installed, not from the pack.

**Wave parallelism:** all agents in a wave share the workspace daemon; workstreams in separate worktrees get separate daemons.

### 6.10 `.planning/` additions

```
.planning/
  stack.json              # core: merged `df-tools stack doctor` output (per pack, per directory)
  verify/<task-id>.json   # core: merged verify-result per task (schema §5A.4)
  render/<task-id>/       # flutter pack: render PNGs and diffs for UI tasks
  config.json             # core: + "stacks" enable/disable block (§5A.2)
.devflow/
  lang.yaml               # dflang: rule config, internal prefixes, render matrix, registries
```

`stack.json` and `verify/` are **core** files with a stack-neutral schema. Pack-specific evidence stays in pack-named subpaths.

These must also be read by DevFlow Native (keep the M7 `.planning/` compatibility promise).

### 6.11 Evals

`evals/lang/` — a suite of 30–50 AO-representative tasks, each with a repo snapshot, instructions, and hidden acceptance tests:
- Go: add an endpoint with ctx and errors done right; fix a goroutine leak; refactor to generics
- Dart: new freezed model + usage; migrate a class to sealed + exhaustive switch
- Flutter: new eden-ui screen at three sizes; fix an overflow; add a11y labels
- Cross-language: add a field end to end through the contract

Metrics: task pass rate, verify iterations to green, tool calls, input/output tokens, wall time.

Run matrix: {Claude via DevFlow Claude, Gemma 4 via DevFlow Native} × {layer off, layer on}. Results stored and charted per `dflang` release. Run in the eval lab.

### 6.12 `dflang mcp` — AO-owned, vendor-neutral MCP server

One MCP server for Go, Dart, and Flutter, written in Go and shipped inside `dflang`. It reaches parity with the official `dart mcp-server` and gopls MCP, plus the useful parts of community servers (`mcp-gopls`, `gopls-mcp`, `mcp-go-coding`, Flutter runtime inspectors), and adds the AO-specific tools (verify, codegen, contract, render, internal packages).

#### 6.12.1 Principles

1. **Open protocols only as backends.** LSP (gopls, `dart language-server`), the Dart VM Service and Dart Tooling Daemon (DTD) protocol, the `flutter` machine/daemon JSON protocol, `go test -json`, `dart test --reporter json`, `go/packages`. No calls to any vendor MCP server, and no dependency on `dart mcp-server` or `gopls mcp` at runtime.
2. **No vendor-specific tools or services.** No Google Cloud, Firebase, Gemini, Antigravity, Developer Knowledge MCP, or similar. No tool named after or hard-wired to a single registry or cloud; network lookups go through configurable adapters (§6.12.5).
3. **Client-neutral.** No client-specific config files, prompts, or behavior. Works identically from Claude Code, DevFlow Native, OpenCode-class agents, or any MCP client. Instructions ship as MCP server instructions plus a `dflang://instructions` resource.
4. **No telemetry.** The server sends nothing anywhere, and it disables toolchain analytics for the processes it spawns.
5. **Agent-friendly addressing.** Tools accept `file` + `symbol` (or `file` + 1-based `line` + `symbol`), not raw columns — agents are bad at counting columns. The server resolves positions itself.
6. **Bounded, structured output.** Every tool returns JSON with a size cap, a `truncated` flag, and a one-line `summary`.
7. **Shared engines.** All sessions in a workspace share one gopls, one Dart analysis server, and one Flutter daemon (the §5 daemon).

#### 6.12.2 Protocol and transport

- Target the MCP **2026-07-28** (stateless) spec, with fallback negotiation to 2025-11-25 for older clients.
- Transports: stdio (the per-agent shim) and Streamable HTTP on a local Unix socket / loopback port. No legacy HTTP+SSE.
- Tool annotations set on every tool (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) so clients can gate writes.
- Roots are required; every path argument is confined to declared roots. `package:` / module-cache reads are the only exception and are read-only.
- SDK: the official `github.com/modelcontextprotocol/go-sdk` (v1.8.0; 2026-07-28 support since v1.7.0). Stateless streamable HTTP accepts only 2026-07-28, and stateful sessions provide the 2025-11-25 fallback. `modelcontextprotocol/conformance` runs in CI, pinned to a commit (Q8).

#### 6.12.3 Tool catalog and parity map

Legend: **D** = official `dart mcp-server`, **G** = gopls MCP, **C** = community servers.

**Workspace**

| Tool | Langs | Replaces / covers | Backend |
|---|---|---|---|
| `workspace_info` | all | D project detection, C workspace overview | `dflang doctor` |
| `workspace_modules` | Go, Dart | C multi-module federation | `go.work`, `go list -m`, pub workspaces |

**Code intelligence** (unified schema across Go and Dart)

| Tool | Replaces / covers | Backend |
|---|---|---|
| `symbol_search` | D `resolve_workspace_symbol`, G/C workspace symbol | LSP `workspace/symbol` |
| `definition` | C definition | LSP |
| `references` | G/C references | LSP |
| `implementations` | C `FindImplementers` | LSP `textDocument/implementation` |
| `call_hierarchy` | C call hierarchy | LSP call hierarchy |
| `hover` | D `hover`, C hover | LSP |
| `signature` | D `signature_help` | LSP |
| `file_outline` | C `ListDocumentSymbols` | LSP document symbols |
| `package_api` | G package API summary | `go/packages` / Dart analyzer element model |
| `diagnostics` | D `analyze_files`, G/C diagnostics | LSP + `aolint` / `ao_lints` |
| `code_actions` / `apply_fix` | D fix, C quick fixes | LSP code actions, `dart fix`, `dflang fix` |
| `rename` | C `RenameSymbol` | LSP rename → workspace edit (applied atomically) |
| `format` | D format | `gofmt`, `dart format` |
| `read_dependency_source` | D `read_package_uris` | module cache, `package_config.json` |

**Build, test, and gates**

| Tool | Replaces / covers | Backend |
|---|---|---|
| `test` | D `run_tests`, C `go test` | `go test -json [-race]`, `dart/flutter test --reporter json`; returns failures with file:line |
| `coverage` | C coverage | `-coverprofile`, `--coverage` (lcov) |
| `verify` | new | §6.3 |
| `codegen` | new | §6.5 |
| `vuln_check` | C `govulncheck` | `govulncheck` against configured DB (§6.12.5); OSV for Dart |
| `contract_gen` / `contract_test` / `contract_breaking` | new | §6.8 |

**Dependencies** (all go through registry adapters)

| Tool | Replaces / covers | Backend |
|---|---|---|
| `deps_add` / `deps_remove` / `deps_upgrade` | D `pub`, C `go mod tidy` | `go get`/`go mod tidy`, `dart/flutter pub add/remove/upgrade` |
| `deps_outdated` / `deps_tree` | D `pub outdated`/`deps`, C module graph | `go list -m -u`, `go mod graph`, `pub outdated/deps --json` |
| `package_search` | D `pub_dev_search` (vendor-specific name and target) | Registry adapters: internal registry first, public ecosystems optional |

**Runtime — Flutter and Dart**

| Tool | Replaces / covers | Backend |
|---|---|---|
| `devices_list` | D `list_devices` | Flutter daemon |
| `app_launch` / `app_stop` / `apps_list` | D `launch_app`, `list_running_apps` | Flutter daemon (`flutter run --machine`) |
| `app_logs` | D `get_app_logs` | Flutter daemon / VM service logging stream |
| `runtime_errors` (+ clear) | D `get_runtime_errors` | VM service / DTD |
| `hot_reload` / `hot_restart` | D `hot_reload` | Flutter daemon |
| `widget_tree` / `widget_selected` / `widget_select_mode` | D `get_widget_tree`, `get_selected_widget`, `set_widget_selection_mode` | VM service inspector extensions |
| `widget_inspect` | C constraint/layout inspection | inspector extensions (constraints, size, render object) |
| `screenshot` | D flutter_driver screenshot | VM service / integration driver |
| `interact` (tap, enter text, scroll by finder) | D `flutter_driver` | driver extension; not available on web, as upstream |
| `perf_snapshot` (rebuild counts, jank frames, memory diff) | C Flutter profiling servers | VM service timeline and heap APIs |
| `render` | new | §6.7 headless harness |

Web builds: the ui-oracle-loop W1a probe bridge (`window.__edenProbe`) covers `interact`'s gap on web. Where it is present, `interact` and `widget_tree` use it for web targets instead of reporting "not available".

**Runtime — Go services**

| Tool | Covers | Backend |
|---|---|---|
| `service_run` / `service_stop` / `service_logs` | new; gives Go parity with `app_launch` | supervised process, structured log capture (`slog` JSON) |
| `goroutine_dump` | new; diagnoses leaks and deadlocks | `net/http/pprof` endpoint injected in debug builds, or `SIGQUIT` dump |
| `race_report` | new | parsed `-race` output with both stacks and the shared variable |

**Resources and prompts**

- Resources: `dflang://instructions`, `dflang://stack` (stack.json), `dflang://verify/latest`, `dflang://internal/<package>` (§6.6 generated docs), `dflang://runtime-errors`.
- Prompts (optional, client-neutral): `fix-diagnostics`, `triage-runtime-error`, `add-endpoint-end-to-end`.

**Upstream inventory (2026-09-23)** — the list the parity test (§6.12.6) diffs against:

| Upstream tool | `dflang` mapping |
|---|---|
| G `go_workspace` | `workspace_info`, `workspace_modules` |
| G `go_package_api` | `package_api` |
| G `go_diagnostics`, `go_file_diagnostics` | `diagnostics` |
| G `go_rename_symbol` | `rename` |
| G `go_symbol_references`, `go_references` | `references` |
| G `go_search` | `symbol_search` |
| G `go_file_context`, `go_file_metadata`, `go_context` | `file_outline` + `definition` + `hover` |
| G `go_vulncheck` | `vuln_check` |
| D `analyze_files` | `diagnostics` |
| D `dart_fix`, `dart_format` | `apply_fix`, `format` |
| D `hot_reload`, `hot_restart` | `hot_reload` / `hot_restart` |
| D `get_runtime_errors`, `get_app_logs` | `runtime_errors`, `app_logs` |
| D `launch_app`, `stop_app`, `list_running_apps`, `list_devices` | `app_launch`, `app_stop`, `apps_list`, `devices_list` |
| D `widget_inspector` | `widget_tree`, `widget_selected`, `widget_select_mode`, `widget_inspect` |
| D `flutter_driver_command` | `interact`, `screenshot` |
| D `run_tests` | `test` |
| D `pub` | `deps_*` |
| D `pub_dev_search` | `package_search` (registry adapter) |
| D `read_package_uris`, `rip_grep_packages` | `read_dependency_source` (with a `query` argument for search) |
| D `roots` | MCP roots (protocol-level, not a tool) |
| D `dtd`, `vm_service`, `lsp` | **excluded**: raw protocol passthroughs; covered by the typed tools above. Passthroughs defeat bounded output and the write-tool allowlist (§6.12.4) |
| D `create_project` | **excluded**: forge templates |
| D `get_active_location` | **excluded**: editor-coupled |

Explicitly **excluded**: editor-coupled tools that depend on a specific IDE session (D `get_active_location` via editor DTD registration) — DevFlow Native provides its own editor-state resource instead. `create_project` is replaced by AO project templates in the forge.

#### 6.12.4 Safety

- Write tools (`apply_fix`, `rename`, `deps_*`, `codegen`, `app_launch`, `service_run`, `interact`) are annotated destructive/open-world as appropriate and can be disabled per workspace in `.devflow/lang.yaml` (e.g. `mcp.write_tools: false` for read-only research agents).
- No arbitrary shell tool. Every spawned command comes from a fixed allowlist with argument validation.
- Refuse edits to generated files at the tool level too (same rule as the §6.4 hook).
- Redact secrets (env values, tokens matching known patterns) from logs and runtime output before returning them.
- Per-call timeouts and output caps; long operations (full test runs, app launch) report progress notifications.

#### 6.12.5 Registries, network, and telemetry policy

All outbound network access goes through adapters configured in `.devflow/lang.yaml`:

```yaml
registries:
  go:
    proxy: https://proxy.internal.aocyber.example   # sets GOPROXY
    sumdb: off | <url>                               # GOSUMDB / GONOSUMDB
    private: github.com/ao-cyber-systems/*           # GOPRIVATE
  dart:
    hosted_url: https://pub.internal.aocyber.example # PUB_HOSTED_URL
  vuln:
    go_db: https://vuln.internal.aocyber.example     # govulncheck -db
    osv: https://osv.internal.aocyber.example
  search:
    order: [internal, public]   # public adapters optional; 'internal' = forge registry
network: online | internal-only | offline
telemetry: off                  # not configurable to 'on' in v1
```

- Public registries are **optional adapters**, off in the `internal-only` and `offline` profiles. Defaults may point at public ecosystem registries for convenience, but no URL is hard-coded in the tools.
- `package_search` queries the internal forge registry first; public-ecosystem search is an adapter implementing a common interface, never a named vendor tool.
- **Dart/Flutter analytics:** every process the daemon spawns gets `DASH__SUPPRESS_ANALYTICS=true`, which suppresses analytics per process without touching user config. This variable comes from the `unified_analytics` source, not the published docs, so the §6.12.6 neutrality test must pin its behaviour.
- **Go telemetry has no per-process off switch.** `go telemetry off` is per user (it writes `os.UserConfigDir()/go/telemetry`, covering `go`, gopls and govulncheck); `GOTELEMETRY` only *reports* the mode. The default mode, `local`, uploads nothing. So the daemon **reads** the mode, reports it in `workspace_info`, and refuses to start in `internal-only`/`offline` if it is `on`. The setup skill offers `go telemetry off` as a command for the user to run; `dflang` never changes the user's global config silently.
- CI images set both (`go telemetry off` at image build time, `DASH__SUPPRESS_ANALYTICS=true` in the environment).

#### 6.12.6 Acceptance

- **Parity test:** every tool in the official `dart mcp-server` and gopls MCP tool lists either has a mapped `dflang` tool or an explicit exclusion in §6.12.3. A CI check diffs the upstream lists on each upstream release and fails on unmapped additions.
- **Neutrality test:** in `offline` mode with an empty module cache, no process spawned by `dflang` opens a non-loopback connection (verified in a network-namespaced CI job). In `internal-only` mode, only configured hosts are contacted.
- **Client test:** the same scripted session passes from Claude Code, DevFlow Native, and a reference MCP client.
- **Eval test:** on the §6.11 suite, `dflang mcp` matches or beats the official servers on pass rate with fewer tool calls and tokens.

## 7. Milestones

Version numbers below are placeholders: **2.10** = the contract release, **2.x-last** = the last 2.x minor (ships the shim), **3.0** = shim removed.

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M0 — Contract** (≈2 wks, core, ships in 2.10) | §5A: manifest schema, `df-tools stack discover/detect/context/verify/doctor/generated-check`, verify-result schema, vendorable pack mirror script, agent injection points added **alongside** today's Flutter sections, `stack-verify` override gate (§5A.8), `ui` manifest inputs wired into `ui-metrics` and `ui-spec-validate` (with today's defaults as fallback), neutrality guard in report-only mode; **release process pushes `{name}--v{version}` tags alongside `vX.Y.Z` and the changelog-on-tag gate accepts them** (Q15) | §5A.7 "no packs" acceptance passes; a stub pack round-trips through planner → executor → verifier; **ui-oracle-loop W2 can be planned against the contract** (§9) |
| **M0.5 — Extraction** (≈2–3 wks, parallel with M1) | §10 phases 1–3: move in-core Flutter modules, fragments, references, skills, `ui-evaluator`, and Maestro wiring into `devflow-stack-flutter`, and the Playwright path into `devflow-stack-web`; compat shim in core for 2.x-last | aodex and eden-biz objectives pass unchanged with the packs installed; neutrality guard switched to failing and passes except the shim allowlist |
| **M1 — Gate** (≈2–3 wks) | `dflang doctor`, `verify` (format, analyze, test, vuln), `aolint` G001–G005, `ao_lints` D001–D003, `devflow-stack-go` and Flutter-pack setup skills, generated-file globs in manifests, telemetry/registry policy (§6.12.5); packs register `dflang verify` as their verify command | Executor can't commit a failing change via core's generic gate; eval baseline recorded against the official servers |
| **M2 — MCP core + daemon** (≈3–4 wks) | `dflang mcp` with workspace, code-intelligence, build/test/gate, and dependency tools (§6.12.3); shared daemon + stdio shim; `skills gen`; codegen orchestration; PostToolUse hook; remaining lint rules; official MCP entries removed from setup | Wave of 4 agents uses 1 gopls; parity test passes for analysis/test/deps tools; neutrality test passes |
| **M3 — Eyes + runtime** (≈3–4 wks) | Flutter and Go runtime tools (§6.12.3); `render` on the W1a story harness (§6.7), `screenshot`; ui-reviewer agent; render step in verify | Full parity test passes; overflow acceptance test passes headless in CI |
| **M4 — Contract + evals** (≈3 wks) | Contract gen/test/breaking-check, planner templates, full eval suite and report | Cross-language eval tasks pass; published before/after numbers for Claude and Gemma 4 |

## 8. Open questions — resolutions

Researched 2026-09-23 against the local AO repos (`~/dev`) and upstream docs. Each item is marked **Resolved** (facts settle it), **Recommended** (a default we proceed on unless the owner objects), or **Decision needed** (the owner has to choose). Only Q18 is still a decision.

| # | Topic | State | Answer (one line) |
|---|---|---|---|
| 1 | Contract tech | Recommended | Support both systems AO already runs: buf + Connect (default for new APIs) and OpenAPI + oapi-codegen (existing aodex/aocore) |
| 2 | State management | Resolved | Riverpod |
| 3 | Dart analyzer plugins | Resolved | `analysis_server_plugin`; `custom_lint` is archived |
| 4 | `dflang` distribution | Recommended | Homebrew tap primary, checksummed GitHub release as fallback; the pack pins a minimum version |
| 5 | gopls MCP vs direct LSP | Resolved (v0.3) | Direct LSP |
| 6 | Render goldens | Recommended | In-repo, generated in a pinned Linux image, CI comparisons with text drawn as boxes |
| 7 | Forge integration | Recommended | Ship a reusable GitHub Actions required check now; the forge adopts it once it exists |
| 8 | Go MCP SDK | Resolved | Official `modelcontextprotocol/go-sdk` |
| 9 | Internal registries | Recommended | Ship `online` by default with `GOPRIVATE`; `internal-only` waits on the forge |
| 10 | Port vs clean-room | Recommended | Clean-room against the published protocols; port small pieces with BSD-3 attribution where it saves real time |
| 11 | Dart helper process | Resolved | Not needed; everything is reachable from Go |
| 12 | Agent tool permissions | Resolved | Pack sub-agents |
| 13 | Pack granularity | Resolved | One `devflow-stack-flutter` pack that also handles pure-Dart packages |
| 14 | `eden-ui-flutter` placement | Recommended | Separate org layer on top of the Flutter pack |
| 15 | Plugin dependencies | Resolved (v0.4) | `plugin.json` `dependencies`; the release process adds a tag |
| 16 | ui-oracle-loop as first consumer | Superseded | See Q18 |
| 17 | Second-stack proof | Resolved | Node pack; the org has no Rails |
| 18 | ui-oracle-loop W2/W4 sequencing | **Decision needed** | Recommend holding W2 planning until M0 ships |
| 19 | Must-not vocabulary ownership | Recommended | Core owns it; the org layer can add terms |

### Q1 — Contract tech · Recommended

**Findings.** AO runs two contract systems today:

- **buf + Connect (Eden side).** `eden-platform-go/buf.yaml` (buf v2, STANDARD lint, FILE breaking) and `buf.gen.yaml` generate `protocolbuffers/go` + `connectrpc/go` into `gen/go` and `connectrpc/dart` + `protocolbuffers/dart` into `eden-platform-api-dart/lib/src/gen`. `eden-biz` does the same and already has a drift check in CI (`.github/workflows/proto-gen-drift.yml`). `connectrpc.com/connect v1.19.1` is in the go.mod of eden-platform-go, eden-biz, aoid and aodex. The AOForge plan adopts the same layout.
- **OpenAPI + oapi-codegen (aodex, aocore).** `aodex/proto/openapi.yaml` is generated into Go through `go generate` and into Dart with openapi-generator + dio. aocore uses oapi-codegen v2 and has no `.proto` files.

**Answer.** §6.8 supports both through a contract adapter interface, rather than forcing a migration:

| Adapter | Generate | Drift check | Breaking check |
|---|---|---|---|
| `buf` (default for new APIs) | `buf generate` using the repo's `buf.gen.yaml` | regenerate and diff | `buf breaking` against the base branch |
| `openapi` | the repo's `go generate` directive + `openapitools.json` | regenerate and diff | `oasdiff breaking` |

`dflang contract` detects the adapter from `buf.yaml` / `openapi.yaml` and reuses the repo's existing generator config. It never writes a second one. Moving aodex or aocore to Connect is out of scope for this spec.

### Q2 — State-management standard · Resolved

**Riverpod.** Every Flutter app checked uses it and no alternative appears: aodex (`flutter_riverpod ^3`, `riverpod_annotation ^4`, `riverpod_generator`), eden-biz (`flutter_riverpod ^2.4`), eden-platform-flutter (Riverpod 3), aocore portal and admin, aoid portal, eden-biz pos and mobile.

D002 allows `flutter_riverpod`, `riverpod`, `hooks_riverpod`, `riverpod_annotation` and forbids `bloc`, `flutter_bloc`, `provider`, `get_it`, `signals`, `mobx`, `get`. It checks the package, not the major version. eden-biz is still on Riverpod 2; that upgrade is a separate item for eden-biz, not a lint error.

### Q3 — Dart analyzer plugin system · Resolved

**`analysis_server_plugin`.** It has been stable since Dart 3.10 (0.3.23, 2026-09-11). It supports lint rules, warnings, quick fixes and assists, is configured under a top-level `plugins:` key in `analysis_options.yaml`, and **runs from `dart analyze` / `flutter analyze`**, not only in the IDE. That last point is what makes it usable as a verify gate.

`custom_lint`'s repo was **archived 2026-03-24** and its README points to `analysis_server_plugin`. No AO repo uses either today.

**Consequences:**
- `ao_lints` is built on `analysis_server_plugin`. The `custom_lint` fallback in §6.2 is removed.
- **ui-oracle-loop W1a TRD 1a-11 plans its token lints (`no_raw_color`, `text_style_needs_family`, `no_magic_spacing`) on `custom_lint`.** Retarget it to `analysis_server_plugin` before W1a executes (§9.1). D005 then reuses those rules as planned.
- Plugin limits to design around: rules run in a separate isolate (no `print`), and changing a plugin needs an analysis-server restart. The shared daemon restarts it when `ao_lints` changes version.

### Q4 — `dflang` distribution · Recommended

A plugin `dependencies` entry can only pull in other plugins, not a binary. So:

1. **Homebrew tap** (`aocyber/tap/dflang`) is the primary channel on macOS and Linux dev machines. The setup skill proposes the command and the user runs it.
2. **GitHub Release archives** with SHA-256 checksums for CI and Linux containers. The reusable CI workflow (Q7) installs from them.
3. `go install github.com/AO-Cyber-Systems/dflang/cmd/dflang@vX.Y.Z` works for contributors.

Each pack's manifest gets `"requires_tool": { "dflang": ">=0.3.0" }`. The pack's SessionStart hook runs `dflang version --json`. If `dflang` is missing or too old, `stack verify` reports `missing` with the install hint (§5A.4). The pack never downloads or runs a binary itself.

### Q5 — gopls MCP vs direct LSP · Resolved (v0.3)

Direct LSP. The current upstream tool lists are now folded into the §6.12.3 parity map.

### Q6 — Render goldens · Recommended

**Findings.** Goldens are already committed next to their tests in aodex (128 PNGs), eden-biz, aocore/admin and eden-ui-flutter. CI handling is inconsistent: aodex CI **skips** goldens (`--exclude-tags golden`); aocore pins the Flutter version and uploads a `golden-failures` artifact. Mac-generated goldens fail on Linux CI because text renders differently.

**Answer.**
- Keep goldens **in-repo**. That's where they are today, reviewers see diffs in PRs, and the forge artifact store doesn't exist yet.
- The verify gate compares **CI goldens** that draw all text as boxes in the Ahem font, so they render the same on every platform (the alchemist approach), generated in a **pinned Linux container image** that ships with the pack's CI workflow. Platform goldens with real text are for human review only and never gate.
- `dflang render --accept` regenerates baselines inside that container, locally or in CI.
- Revisit an external store only if golden PNGs exceed ~50 MB in any repo.

### Q7 — Forge integration · Recommended

AOForge exists only as a plan (one commit: README plus architecture doc). So:

- The packs ship a **reusable GitHub Actions workflow** (`devflow-stack-{go,flutter}/ci/verify.yml`) that installs `dflang` from a release (Q4) and runs `dflang verify --all --json`. Repos opt in by making it a required check.
- The forge uses the same command as its built-in required check when it ships. Nothing in `dflang` is forge-specific.

### Q8 — Go MCP SDK · Resolved

**Official `github.com/modelcontextprotocol/go-sdk`** (v1.8.0, 2026-09-14). v1.7.0 added full 2026-07-28 support; stateless streamable HTTP (`StreamableHTTPOptions.Stateless`) accepts only 2026-07-28, and stateful sessions fall back to 2025-11-25. That matches §6.12.2 exactly.

`mark3labs/mcp-go` (v1.1.1) is active but only claims 2025-11-25. Owning our own protocol layer isn't worth it now that the official SDK covers the target spec.

Conformance: run `modelcontextprotocol/conformance` in `dflang` CI. Its last tagged release (v0.1.16) is from March, so pin a commit and confirm it covers 2026-07-28 before relying on it for the gate.

### Q9 — Internal registries · Recommended

**Findings.** There are no internal registries today. The only setting in use is `GOPRIVATE=github.com/aocybersystems/*,github.com/AO-Cyber-Systems/*` (plus `GOFLAGS=-mod=mod`) in CI, Dockerfiles and scripts. Dart packages use `publish_to: none` with path or git dependencies, so there's no pub server to point at. AOForge has no registry yet.

**Answer.**
- v1 ships with `network: online` as the default and **public adapters on**. `dflang` writes the existing `GOPRIVATE` value into the registry config instead of inventing a new one.
- `internal-only` and `offline` are fully implemented and tested (the §6.12.6 neutrality test runs in `offline`). They become the recommended profile once the forge supplies mirrors.
- Standing up mirrors is forge/datacenter work, sized separately:
  - **Go proxy:** Athens (v0.18.1, maintained) or goproxy/goproxy (maintained).
  - **Pub server:** the open-source options are dead (`pub_server` archived, `unpub` dormant). Only commercial hosts remain (Cloudsmith, JFrog, OnePub, ProGet). Because AO uses git and path dependencies, a pub server isn't needed at all unless packages start being published.
  - **Vulnerability DBs:** `govulncheck -db` accepts `file://` or an HTTPS mirror of the go.dev vulnerability DB format. `osv-scanner --offline` with a local cache covers Dart (confirm `pubspec.lock` support when implementing). Both work without a server: a nightly sync to a shared path is enough.

### Q10 — Reuse of upstream code · Recommended

**Clean-room against the published protocols** (LSP, VM Service, DTD, Flutter daemon), because `dflang` is Go and the upstream servers are Dart (`dart mcp-server`) or tied to gopls internals. Where a specific piece of upstream logic saves real time (the inspector object-group lifecycle, DTD connection handling), port it with BSD-3 attribution in `dflang/NOTICE`. The devflow-claude repo already uses the same `NOTICE.md` pattern for taste-skill.

### Q11 — Dart helper process · Resolved

**Not needed.** DTD is plain JSON-RPC 2.0 meant for any client, and a Go client can call the VM service websocket and `ext.flutter.inspector.*` directly with an `isolateId` (DevTools and third-party MCP servers do exactly this). Everything stays in Go. Constraints to design around:

- Inspector and driver extensions exist **only in debug builds**. `app_launch` always starts debug or profile builds for inspection.
- `ext.flutter.driver` exists only if the app calls `enableFlutterDriverExtension()`. `interact` uses the W1a probe bridge (`window.__edenProbe`) on web and the driver extension on device, and reports `missing` (not `fail`) when neither is present.
- `dflang` must manage inspector object groups itself (dispose on every tool call) to avoid leaks.
- The VM service URI carries an auth token. Treat it as a secret: redact it from `app_logs` output (§6.12.4).
- Changing DTD workspace roots needs the secret that only the DTD-starting process holds. So `dflang` starts its own DTD rather than attaching to an IDE's.

### Q12 — Agent tool permissions · Resolved

**Pack sub-agents** (§5A.6 option 1). Confirmed: a plugin can ship `.mcp.json`, its agents can list that server's tools as `mcp__plugin_<plugin>_<server>__<tool>`, and its hooks can match those names. Two constraints:

- `mcpServers`, `hooks` and `permissionMode` in a **plugin agent's frontmatter are ignored**. MCP servers must be declared in the pack's `.mcp.json`, not per agent.
- Hook matchers must use the full `mcp__plugin_…` name. A bare server name never fires.

### Q13 — Pack granularity · Resolved

**One pack.** AO has pure-Dart packages (`eden-platform-api-dart`, `eden-biz/api-dart`, `eden-experience-api-dart` and other `*-api-dart` client packages, `eden-loro`, `eden-doc-model`), but no pure-Dart server or CLI (`eden-cli` is Go). Every pure-Dart package is a generated client or model library consumed by a Flutter app.

`devflow-stack-flutter` therefore covers them, and `dflang` handles them by package. A `pubspec.yaml` without a `flutter` SDK dependency runs `dart analyze` / `dart test` and skips render and the Flutter-specific lints (D004, D005). Split into `devflow-stack-dart` only if a Dart server or CLI appears.

### Q14 — Where `eden-ui-flutter` sits · Recommended

**Separate org/design-system layer on top of the Flutter pack.** It supplies, through the pack's `ui` manifest inputs (§5A.1):

- the pattern catalogue
- design tokens (the D005 token package)
- any extra must-not terms (Q19)
- its `frontend-design` skill

The Flutter pack stays usable for a non-AO Flutter repo.

### Q15 — Plugin dependency declaration · Resolved (v0.4), with release-process consequences

`dependencies` entries are a bare name or `{ name, version, marketplace }`. They're auto-installed, and enabling a plugin enables its dependencies. When a dependency is missing or out of range, **the dependent plugin is disabled** until it's fixed, and the error shows in `claude plugin list --json` and the `/plugin` Errors tab (`dependency-unsatisfied`, `dependency-version-unsatisfied`, `range-conflict`, `no-matching-tag`).

Consequences:

- **Versions resolve from git tags named `{name}--v{version}`.** devflow-claude currently tags `vX.Y.Z` only. The release process must also push `devflow--vX.Y.Z` (and `devflow-stack-flutter--vX.Y.Z` and so on) or every pack fails with `no-matching-tag`. The changelog-on-tag gate should accept the prefixed form too. This lands in M0.
- Cross-marketplace dependencies are blocked unless the root marketplace allows them. All packs ship in the `aocyber` marketplace, so this doesn't apply.
- The pack cannot quietly half-work without core. It is disabled by Claude Code itself, so the packs don't need a "core missing" check.

### Q16 — ui-oracle-loop as first consumer · Superseded

The proposal is already being built (§9.1). See Q18.

### Q17 — Core's own stack · Resolved

**Node pack (`devflow-stack-node`).** The org has **no Rails**: the only Gemfiles are two small MCP-server gem lists in `eden-libs/devflow-addon`. Of ~57 top-level repos, ~38 are Go (most also with Dart and/or Node), ~16 are Node-only (including devflow-claude, devflow-codex and trades) and 4 are Dart-only.

Node is the second-largest stack and core's own, so it's both a real consumer and the neutrality proof.

Follow-up: `references/testing-strategy.md` describes a Rails column as "observed AOCyber org practice". That's stale. Drop the column when the matrix moves into packs (§9.2).

### Q18 — ui-oracle-loop W2/W4 sequencing · **Decision needed**

W2 (CDP `ui-probe`, planner/executor/verifier loop) and W4 (Maestro adapter) are planned for core, which the §0 rule forbids.

- **(a) Hold W2 planning until M0 ships (≈2 wks), then build W2 in the packs.** Recommended. W1a, W1c and W1★ run in other repos and aren't blocked, and W1★ is a hand-driven dogfood that doesn't need W2.
- (b) Build W2 in core now and add it to the M0.5 extraction list. Faster start, but it grows what has to move and doubles the review load.

### Q19 — Must-not vocabulary ownership · Recommended

**Findings.** Only core's `schemas/must_not_vocabulary.json` exists. eden-ui-flutter has no `design/` directory yet (W1a hasn't run), so "core mirrors eden-ui-flutter" is backwards today.

**Answer.** Core owns the canonical vocabulary. It describes interaction behaviour ("navigate on close", "steal focus") that is stack-neutral and belongs with the Surface Spec schema. An org layer can **add** terms through the manifest (`ui.must_not_extra`), but can't remove core terms.

Retarget W1a so eden-ui-flutter **copies core's file** (with a CI check against the pinned devflow release) instead of authoring its own.

## 9. Relationship to in-flight devflow-claude work

### 9.1 UI Oracle Loop

**Status at `6c0e9b5`:** W0 done (v2.8.0). W1b done in core (objective 34, v2.9.0). W1a, W1c, W1★ pending in other repos. W2 and W4 planned for devflow-claude core.

**Audit of what W1b put in core:**

| Module | Stack-specific content | Verdict |
|---|---|---|
| `ui-spec.cjs`, `ui-spec-lock.cjs`, `ui-sheet.cjs` | none | **Stays in core.** The Surface Spec, review sheet, and look-lock checkpoint are the stack-neutral UI surface contract. |
| `ui-spec-validate.cjs` | comments naming eden-ui-flutter; pattern catalogue read from the pinned eden-ui-flutter release | **Stays in core.** The catalogue source becomes a pack/org input (`ui.pattern_catalogue`, §5A.1); comments are cleaned in M0.5. |
| `ui-spec-render.cjs`, `ui-spec-cli.cjs` | comments naming `flutter-ui-eval.cjs` as the manifest consumer | **Stays in core.** Comments are rewritten to name "the pack's UI eval engine". |
| `ui-metrics.cjs` | `DEFAULT_PATHS = ['flutter/lib']` | **Stays in core.** Paths come from `ui.metrics_paths`; the current default is kept as a fallback only until 3.0. |
| `schemas/surface-spec.schema.json` | none found | Stays in core. |
| `schemas/must_not_vocabulary.json` | none — core's copy is the only one; eden-ui-flutter has no `design/` directory yet | **Stays in core as the canonical vocabulary**; org layers add terms via `ui.must_not_extra` (Q19). |
| `agent-shell-harness.cjs` + `__fixtures__/agent-shell/` | extracts bash blocks from the executor's **Flutter UI section**; stub binaries for `flutter`, `maestro`, `adb` | **Generalize and split.** The harness (extract a named section's bash blocks, run each under the worktree guard's rules) is stack-neutral and stays in core, pointed at **pack fragments**. The Flutter fixtures and test cases move to `devflow-stack-flutter`. |

**W1a changes needed before it executes** (eden-ui-flutter; independent of Q18):

1. **TRD 1a-11** plans `custom_lint` rules. `custom_lint` was archived on 2026-03-24, so rebuild the rules as an `analysis_server_plugin` package (Q3). `ao_lints` D005 will re-export them.
2. **Interfaces** list `design/must_not_vocabulary.json` as authored by W1a and mirrored by core. Reverse it: core is canonical, and W1a copies core's file with a CI check against the pinned devflow release (Q19).
3. **TRD 1a-03** (story harness goldens generated in Linux CI with a `ci` platform tag) already matches Q6. Use Ahem text so goldens render identically on every platform, and share the container image with the Flutter pack's CI workflow.

**W2 and W4:** retarget per Q18(a).

| Planned (core) | Retargeted to |
|---|---|
| W2 `bin/lib/ui-probe.cjs` (CDP driver: navigate, `settled()`, click, screenshot, DOM semantics) | `devflow-stack-web` (browser driver) — the Flutter pack uses it for Flutter-web targets, as with the Playwright path today |
| W2 `ui catalog / probe / doctor` | `ui catalog` and `ui sheet` stay in core (spec-level). `ui probe` and `ui doctor` are pack commands registered through the manifest. |
| W2 planner/executor/verifier changes (derive test list from spec, RENDER→CONFORM per task, verifier replay) | Split: "derive the TRD test list from a Surface Spec" and "refuse behaviour outside the spec" are **core** (the spec is core). RENDER→CONFORM steps and replay are **pack fragments** that the executor/verifier load through `stack context`. |
| W2 judge calibration, seam gate | `devflow-stack-flutter` (the judge is `flutter-ui-eval`'s) |
| W3 `ui-crawl.cjs`, `ui-explorer` agent | Pack (crawl reads `go_router` sources) |
| W4 Maestro `hierarchy` → `ProbeResult` adapter | `devflow-stack-flutter` |
| React half | future `devflow-stack-react` |

The ui-oracle-loop program's binding conventions (the `## Runtime model` brief section, `/code-review <PR> high` before merge, one worktree per objective) carry over unchanged to the pack work.

### 9.2 Other in-core work

- **`api-contract.cjs`** (core): SHA drift detection for declared contract files. It's stack-neutral and stays in core. §6.8's schema-first contract layer feeds it: the pack generates code, and core's existing `verify api-contract` checks drift.
- **`testing-strategy.md`** (core): keep the abstract layers and platform routing in core; move each stack column into its pack's `testing_matrix` reference, and have `df-tools stack context planner` assemble the matrix for the stacks present. Drop the Rails column: the org has no Rails repos (Q17).
- **`org-awareness` / eden-libs scanner** (core): AO-org opinion, not language opinion. Out of scope here, but the same argument applies; worth a separate review of whether org awareness belongs in an `aocyber-org` layer.

## 10. Migration: moving stack logic out of core

The Flutter and web verification logic in core is hard-won (DWDS blank-page wedge, web semantics, baseline-diff `flutter analyze`, Maestro web limits, VLM judge). The goal is to **relocate it intact**, not rewrite it.

**Phase 1 — Contract alongside (M0, 2.10).** Add §5A injection points to core agents next to the existing Flutter sections. Wire the `ui` manifest inputs into the Surface Spec modules with today's values as fallbacks. No behavior change.

**Phase 2 — Extract (M0.5).**

| From core | To pack (`devflow-stack-flutter` unless noted) |
|---|---|
| `bin/lib/flutter-*.cjs` (24 files, + tests, `__fixtures__/flutter-*`) | `lib/` in the pack, invoked via the pack's own CLI entry (`df-flutter`) that core calls through the manifest |
| Flutter-specific `ui-*` code | per the §9.1 audit: Surface Spec modules stay; only their Flutter inputs and comments change |
| `agent-shell-harness` Flutter fixtures and cases | pack tests; the harness itself stays in core (§9.1) |
| Executor "Flutter UI bootstrap / per-task / post-all-tasks" sections | `fragments/executor.md` |
| Planner "Flutter UI scope sub-procedure" + required TRD fields | `fragments/planner.md` + `schemas/trd-fields.schema.json` |
| Verifier "Flutter UI state coverage", Step 8b Maestro, orphan-flow detection | `fragments/verifier.md` + `flutter-ui-verifier` sub-agent |
| `agents/ui-evaluator.md` | pack `agents/` |
| `skills/ui-eval`, `skills/design-review`; Flutter branches of `skills/verify-work` | pack `skills/` (`/devflow-stack-flutter:ui-eval`, `:design-review`); `verify-work` keeps a generic path and calls `stack context verifier` |
| `mcp__maestro__*` in agent frontmatter | pack's `.mcp.json` + sub-agent `tools:` |
| `references/design-stack-flutter.md`, `flutter-state-patterns.md` | pack `references/` |
| `df-tools verify flutter-*`, `detect flutter-ui-scope`, `flutter-ui setup/eval` | pack CLI; core keeps **deprecated aliases** that forward to the pack until 3.0 |
| Playwright web path (Step 8a: readiness probe, landmark wait, seeded `storageState`), Playwright tools in agent frontmatter, `references/design-stack-web.md` | new `devflow-stack-web` pack (fragments + `web-ui-verifier` sub-agent + Playwright MCP config). Flutter-web smoke checks reference it from the Flutter pack. |

**Phase 3 — Shim and cutover.**
- **Core 2.x-last:** packs ship. Core detects a Flutter or web repo with no matching pack installed, prints a one-line install instruction once per session, and still runs the legacy in-core path. Deprecated `df-tools` aliases and skills forward to the pack when it's installed.
- **Core 3.0.0:** the legacy path, aliases, and `ui` fallbacks are removed. Removing built-in Flutter and Playwright behavior is breaking, so it takes the major bump and a CHANGELOG migration note.
- **Pack versioning:** all packs — extracted and new — declare `devflow >=2.10.0` (the contract release). Nothing in the contract changes at 3.0, so packs don't need a 3.0 floor; 3.0 only removes the shim from core.

**Phase 4 — Build on it.** M1–M4 of this spec, and ui-oracle-loop W2–W4 (§9.1), land in the packs.

**Rollout:** the marketplace adds `devflow-stack-flutter` and `devflow-stack-web` in the same release that ships the shim, so aodex and eden-biz can install them before 3.0.0. `monorepo-standards` scaffolding installs the right packs for its `go/` and `flutter/` areas.

**Acceptance:** the flutter-ui dogfood and eval-dogfood suites move with the pack and pass there; core's suite passes without them; a re-run of a recent aodex and eden-biz objective produces equivalent verification evidence before and after extraction.
