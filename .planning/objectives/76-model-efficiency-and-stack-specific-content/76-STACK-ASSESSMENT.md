# Objective 76: stack-specific content assessment

Assessed 2026-10-15 for TRD 76-05. Paths are under `plugins/aoforge/`.

## How stack content reaches agents today

- Resolution is bundled `general` (always), then the tier-2 profile named by `extends` (`stack-profiles/{go,dart,flutter}.md`), then `.aoforge/STACK.md`, then the component profile. A project with no STACK.md still resolves to `general`.
- Profile H2 sections are a fixed set (`SECTION_NAMES`, `lib/stack-profile.cjs`); STK006 rejects any other H2.
- `AGENT_SLICES` (`lib/stack-render.cjs`) gives each agent a fixed list of sections under a 2,500-token budget; sections past the budget are dropped from the end. security-auditor, job-checker and ui-evaluator have no entry; `UI` is included only with `--ui`, which no agent passes.
- Every Flutter block is gated on TRD frontmatter (`type: ui` + `stack: flutter`), never on the resolved profile.

## Decision: on-demand references behind the TRD gate, not profile sections

The slice mechanism cannot carry procedure: fixed sections, a 2,500-token budget against about 15 KB of executor procedure, and STK006. Profile-driven delivery would also drop the procedure for a Flutter repo with no STACK.md, which resolves to `general`. So stack-specific *procedure* moves to `references/` files the agent reads only when the existing TRD gate fires; stack *data* (globs, layout) is taken from the profile's Layout section, the way integration-checker already does.

## Hotspots

| Location | Size | Stack | Plan | Status |
|---|---|---|---|---|
| executor bootstrap, per-task, post-all-tasks | 15 KB | Flutter | `references/flutter-executor.md` + stub | **Done** (executor 62 → 48 KB) |
| verifier state coverage, Semantics | 1.5 KB | Flutter | `references/verifier-flutter-ui.md` | To do |
| verifier Step 8b Maestro, orphan flows | 3.7 KB | Flutter mobile | same file | To do |
| verifier Steps 8c/8d UI eval, Step 9 auto-UAT | 11.5 KB | UI-eval engine (ui kind) | same file; keep 8c/8d heading stubs (`verifier-ui-eval-invocation.test.cjs`) | To do |
| verifier Step 4 wiring greps (`*.ts/*.tsx`, `src/`) and `workflows/verify-objective.md` | 0.5 KB | TS | take globs from the profile's Layout section, TS as fallback | To do |
| verifier Step 8a Playwright | 1.8 KB | web runtime | keep; gate on `verification.runtime: web` only after checking `general`'s default | Later |
| planner UI scope sub-procedure | 7.4 KB | Flutter UI | `references/planner-flutter-ui.md` + stub (`flutter-ui-scope.test.cjs` asserts its key terms) | To do |
| integration-checker Next.js route/auth/flow recipes | 6 KB | Next.js/TS | `references/integration-web.md`; profile-first already | To do |
| codebase-mapper concerns greps | 0.4 KB | TS | profile Layout globs | To do |
| security-auditor grep blocks | 6.9 KB | multi-language | not stack-specific; replaced by `security sweep` in TRD 76-04 instead | 76-04 |
| `tools:` frontmatter (gopls, dart, maestro, playwright MCP) | ~0.5 KB each | per stack | cannot move: frontmatter is static (`stack-agent-mcp-contract.test.cjs`) | Keep |

## Savings for a non-Flutter project

About 14 KB per executor spawn (done), 16 KB per verifier, 7 KB per planner, 6 KB per integration-checker: roughly 11K tokens per objective before multiplying by TRD count. A Flutter project pays it back as one Read when the gate fires.

## Later, optional

A `procedures:` frontmatter map in the profile format (`{executor: references/..., verifier: ...}`), printed by `stack context` as a one-line pointer, would let org and project profiles add procedures without editing agents. It needs `stack context --file` in monorepos and keeps the TRD gate as the fallback.
