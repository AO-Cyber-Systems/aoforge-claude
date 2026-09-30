# Testing Strategy — Layers and Routing

This reference doc names the abstract verification layers (unit / integration / system / AI exploratory / visual / wrong-tenant / contract-parity) and how they route to a platform's outermost layer. The concrete tool per layer comes from the project's stack profile (`.planning/STACK.md` → `## Testing` + `commands.test`), resolved with `df-tools stack context planner`. No stack is inferred from `kind`.

Soft-bundled with `defaults-table.md` per the v1.1 design — both are read by the planner; neither is read by the resolver. The (kind, work) defaults table answers "what testing posture does this objective need?"; this doc answers "what does each layer prove, and where does the tool come from?".

## Verification layers

| Layer | What it proves | Where the tool comes from |
|---|---|---|
| Unit | A single unit (function, class, package) behaves correctly in isolation | profile `commands.test` (scoped form) + `## Testing` |
| Integration | Multiple units or a unit plus real I/O behave correctly together | profile `## Testing` |
| System / E2E | The system behaves correctly end-to-end, driven from its outermost surface | profile `verification.runtime` + `runtime_check` |
| AI exploratory | Ad hoc, judgment-driven probing beyond scripted cases | (no formal pattern) |
| Visual / golden | Rendered UI matches an approved baseline | `df-tools verify flutter-ui-eval` where a UI profile applies |
| Wrong-tenant assertion | Cross-tenant access is rejected | profile `## Testing` |
| Contract / parity (port) | A reimplementation reproduces the source's observable behavior | profile `## Testing` |

## How the planner uses this document

1. Read the resolved Testing section and commands (`df-tools stack context planner --raw`). With no STACK.md this is the bundled `general` profile.
2. Map the resolver's stack-agnostic `config.verification` phrases to the layers above; take the tool from step 1.
3. `outside_in: true` → order TRDs from the system layer down to unit.

## Example stack profiles

The former per-stack cells (Go, Flutter, Node) now live as tier-2 profiles that ship bundled in `devflow/stack-profiles/` (`go.md`, `dart.md`, `flutter.md`), mirrored to `~/.claude/devflow/stack-profiles/`. A project adopts one via `extends: <id>` in `.planning/STACK.md` with nothing to install. A user or org override goes in `~/.claude/devflow/stacks/<id>.md` and wins over the bundled profile of the same id.

| Layer | Go | Flutter (mobile + web) | Node (CLI / plugin) |
|---|---|---|---|
| Unit | `*_test.go` per-package | `flutter test` (widget + unit) | `node --test` |
| Integration | `*_test.go` with httpmock or interceptor cassettes | `integration_test/` driver harness | Fixture-driven test against real I/O |
| System / E2E | (rare — gateway level only) | `integration_test/` + Patrol (or Maestro YAML for native flows) | (rare) |
| AI exploratory | (no formal pattern in org) | (no formal pattern in org) | (no formal pattern in org) |
| Visual / golden | n/a | `df-tools verify flutter-ui-eval` — two-layer (golden net + VLM judge), shipped in DevFlow 2.4.0; `matchesGoldenFile` in use on aodex/eden-biz | n/a |
| Wrong-tenant assertion | httpmock test asserting cross-tenant 403/404 | (rarely applicable) | n/a |
| Contract / parity (port) | Recorded cassettes vs source | Widget-tree behavioral parity | I/O snapshot or daemon contract test |

## Flutter-web semantics gotcha

The Flutter integration test runner has subtly different semantics between web (browser) and mobile (real device or emulator) targets:

- On mobile, `await tester.pumpAndSettle()` waits for all pending animations + microtasks to drain.
- On web, the same call sometimes returns before browser-side `requestAnimationFrame` completions. Tests that pass on mobile occasionally flake on web.

Recommendation: for Flutter projects targeting web specifically, prefer `Patrol` (which wraps these semantics) or add an explicit `await Future.delayed(Duration(milliseconds: 100))` after navigation events. Document the failure mode in the TRD's `<gotchas>` section so executors don't lose hours debugging "this test passes on macOS but flakes on web."

## Codegen discipline

Several stacks generate code from higher-level schemas:

- ConnectRPC: `.proto` files generate Go handlers/clients
- Drift / Floor (Flutter SQLite): schema generates DAO classes
- GraphQL Codegen: schema generates typed clients

The profile's `generated` block names the globs, markers and `regenerate` command.

Discipline rule: **commit generated code to git**, not gitignore'd. Regeneration is a separate commit from the schema change. The reviewable history is:

1. `feat(rpc): add new endpoint to .proto` — schema change only
2. `chore(rpc): regenerate Go bindings` — `make generate` or equivalent
3. `feat(api): wire new handler in service` — consumer code

This makes "regen broke X" diffs distinct from "schema broke X" diffs. Tests against generated code regenerate WITH the code, not held back.

## Platform routing

Outside-in testing starts at the highest user-observable layer and drills inward. The "highest layer" varies by platform:

- **Web app:** browser driver (e.g. Playwright) then controller/route handler then service then repository
- **Mobile (Flutter):** `integration_test` driver then widget tests then service then repository
- **HTTP API:** HTTP integration test (real server or httpmock) then handler then service then repository
- **CLI:** top-level test invoking the binary or its entry function then command-tree dispatch then flag parsing then I/O snapshot
- **Plugin:** Host integration test (mocked host) then plugin contract surface then internal modules

The planner uses this routing when the resolver returns `outside_in: true` — order the TRDs from the topmost layer to the bottom, with each TRD covering one layer.

## Cross-references

- `defaults-table.md` — (kind, work) to defaults posture (orthogonal to this doc; both consulted by the planner)
- `tdd.md` — Iron Law TDD with RED to GREEN to REFACTOR commit conventions
- `verification-patterns.md` — concrete verification command examples per scenario
- `anti-patterns.md` — patterns to avoid in TRD generation

## Out of scope

Covered by future objectives, not this doc:

- Extending the shipped Flutter visual gate with a probe/conform layer (cross-stack, beyond Flutter) — see `docs/PROPOSAL-ui-oracle-loop.md` in the devflow-claude repository (the `~/.claude/devflow` mirror carries no `docs/`)
- AI-exploratory testing patterns — no observed org adoption; revisit if/when patterns emerge
- Property-based testing infrastructure — suppressed by default per the `no_property_based_default` resolver constraint
- Stack-specific tooling — declare it in the project's stack profile (`.planning/STACK.md`)

## Versioning

This doc is read at planning time by the planner agent. Changes here propagate immediately to all running planners (no rebuild needed — references are read at planning time via `@~/.claude/devflow/references/testing-strategy.md`).

When modifying the layers, also update:

- `defaults-table.md` if a new stack-aware verification command is required
- `CHANGELOG.md` if the change ships in a release
