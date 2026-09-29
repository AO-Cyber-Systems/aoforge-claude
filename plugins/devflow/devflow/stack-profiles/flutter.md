---
schema: 1
id: flutter
extends: dart
languages: [dart]
detect: [{file: pubspec.yaml, contains: "sdk: flutter"}]   # the Flutter SDK dependency; a pure Dart pubspec matches dart only

toolchain:
  flutter: { version_source: pubspec.yaml }  # environment.flutter, else .fvmrc / .tool-versions

commands:
  build:   { run: discover }                 # the drafter fills in the project's shipping target
  test:    { run: "flutter test", scoped: "flutter test {files}" }
  lint:    { run: "flutter analyze --fatal-infos" }
  deps:    { run: "flutter pub get", when: deps_changed }
  integration: { run: "flutter test integration_test", when: ui_changed }
  golden:  { run: "flutter test --tags golden", when: ui_changed }

loop: [format, lint, test]
gates:
  task: [format, lint, fix, test]
  objective: [deps, lint, test, integration, build]

agent_tooling:
  mcp:
    - name: dart
      command: dart
      args: [mcp-server, --enable, cli, --disable, pub_dev_search]   # feature flags; the runtime tools (hot_reload, widget_inspector, dtd) stay on
      required: false
  skills:
    - { source: "github.com/flutter/agent-plugins", pin: "8da8c54ecd74" }   # flutter-add-widget-test, flutter-build-responsive-layout, flutter-fix-layout-issues, …
    - { source: "github.com/dart-lang/skills", pin: "0d9f1c4a0ae2" }
    - { source: "package-skills" }
  policy: { telemetry: "off", network_tools: deny }

verification:
  runtime: mobile                          # or web / desktop; picks the verifier's runtime check
  runtime_check: integration

provenance:
  reviewed: "2026-09-28"
  sources:
    - https://github.com/flutter/agent-plugins
    - https://docs.flutter.dev/ai/get-started
    - https://docs.flutter.dev/ai/mcp-server
    - https://github.com/flutter/flutter/tree/master/docs/rules
---

# Stack Profile: flutter

Tier-2 profile, bundled with DevFlow (`devflow/stack-profiles/flutter.md`). It extends `dart`, so it
inherits dart's commands, Avoid rules and codegen, and overrides the SDK-specific commands.

**Upstream stance.** Flutter removed its monolithic `rules.md`. Its guidance now ships as skills in
`flutter/agent-plugins`, plus a single persistent rule (hot reload), and the `dart mcp-server` adds
runtime tools such as the widget inspector and hot reload. The profile keeps what an agent must
never forget. Everything else is a skill it can load on demand.

The `dart-flutter` Claude plugin already declares a `dart` MCP server. Configure one server, not
two: a project that runs that plugin does not need this profile's entry as well.

## Idioms

<!-- inherit -->
- After editing `lib/**` with an app running: call `hot_reload`. If you changed `initState`,
  globals or `main()`, call `hot_restart` instead. Skip reloads for changes outside `lib/` or
  comment-only changes. (This is upstream's one persistent rule.)
- Keep widgets small and `const` where possible. Extract a widget rather than nesting builders deeper.
- One state-management approach per app, as declared under Layout & architecture. Don't mix a
  second one in.
- Use `LayoutBuilder` / `MediaQuery.sizeOf` for responsive layout (the
  `flutter-build-responsive-layout` skill). Never assume one screen size or text scale.

## Avoid

<!-- inherit -->
| Stale / wrong | Use instead | Enforced by |
|---|---|---|
| Fixed sizes that overflow at other widths or text scales | Flexible / constraint-driven layout | widget test at 2+ sizes, `flutter-fix-layout-issues` skill |
| `MediaQuery.of(context).size` | `MediaQuery.sizeOf(context)` | `dart fix` |
| `WillPopScope` | `PopScope` | deprecation + `dart fix` |
| Tappable widget without semantics | `Semantics` label, ≥48×48 target | a11y guideline test (`meetsGuideline`) |
| Mixing state-management libraries | The one declared below | review |

## Layout & architecture

Upstream default: the MVVM layering from the `flutter-apply-architecture-best-practices` skill.
`ui/` is grouped by feature (View + ViewModel); `data/` (repositories, services) and optional
`domain/` are grouped by type. The project sets its state-management choice here. It replaces
today's TRD `state_management:` field. An org layer can pin it; AO pins Riverpod.

## Testing

Widget tests for every screen state (loading, empty, error, populated), written with the
`flutter-add-widget-test` skill. `integration_test/` covers flows (`flutter-add-integration-test`).
Goldens only where the project already runs them in a pinned environment.

End-to-end flows are the project's choice, not assumed. Maestro flows live in `.maestro/` and run
with `maestro test .maestro`; Patrol tests live in `patrol_test/`. A drafted STACK.md adds an `e2e`
command only when one of those directories exists.

## UI

Accessibility floor: semantic labels on interactive widgets, 48×48 touch targets, contrast per the
design system, and working text scale up to 200%. The design system is named by the project or org
layer (for example `eden-ui-flutter`), not by this profile.
