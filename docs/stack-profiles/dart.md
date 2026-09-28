---
schema: 1
id: dart
extends: general
languages: [dart]
detect: [pubspec.yaml]

toolchain:
  dart: { version_source: pubspec.yaml }   # environment.sdk gates language features (records/patterns need 3.0+)

commands:
  build:   { run: none }                    # override for CLI/server packages (e.g. `dart compile exe bin/main.dart`)
  test:    { run: "dart test", scoped: "dart test {files}" }
  lint:    { run: "dart analyze --fatal-infos" }
  format:  { run: "dart format --output=none --set-exit-if-changed .", apply: "dart format {files}" }
  fix:     { run: "dart fix --dry-run", apply: "dart fix --apply" }
  audit:   { run: "dart pub outdated", when: deps_changed }
  deps:    { run: "dart pub get", when: deps_changed }
  codegen: { run: "dart run build_runner build --delete-conflicting-outputs", when: sources_changed }

loop: [format, lint, test]
gates:
  task: [format, lint, fix, test]
  objective: [deps, lint, test, audit]

generated:
  globs: ["**/*.g.dart", "**/*.freezed.dart", "**/*.mocks.dart", "**/*.gr.dart"]
  markers: ["GENERATED CODE - DO NOT MODIFY BY HAND"]
  regenerate: codegen

agent_tooling:
  mcp:
    - name: dart
      command: dart
      args: [mcp-server]                   # Dart 3.9+
      required: false
      disabled_tools: [pub_dev_search]     # hosted service; enable per project if policy allows
  skills:
    - { source: "github.com/dart-lang/skills", pin: "<sha>" }
    - { source: "package-skills" }         # `dart run skills@ get`: skills shipped by direct dependencies
  policy: { telemetry: "off", network_tools: deny }

verification:
  runtime: none                            # library default; set cli/service for executables

provenance:
  reviewed: "2026-09-27"
  sources:
    - https://github.com/dart-lang/ai/tree/main/pkgs/dart_mcp_server
    - https://github.com/dart-lang/skills
    - https://dart.dev/ai/package-skills
    - https://flutter.dev/blog/introducing-skills-for-dart-and-flutter
    - https://dart.dev/blog/announcing-dart-3-12
---

# Stack Profile: dart

Example org/pack profile for pure Dart packages, CLIs and servers. `flutter` extends it.

**Upstream stance.** The Dart team ships task-oriented `SKILL.md` skills (`dart-lang/skills`) and the
`dart mcp-server`. Packages can also ship their own skills, which `dart run skills@ get` installs
into `.agents/skills/`. This profile references those rather than restating them. It keeps only the
commands, the Avoid rules, and the codegen procedure agents most often get wrong.

## Idioms

- Prefer MCP tools when the server is up: `analyze_files` over shelling out to `dart analyze`,
  `run_tests` over `dart test`, and `dart_fix` / `dart_format` for mechanical fixes.
- Dart 3 modelling: `sealed` class families with exhaustive `switch` expressions; records for
  small multi-value returns; destructuring patterns in `if-case` and `switch`.
- Class modifiers (`final`, `base`, `interface`) on public API types, to state intent.
- Sound null safety: `?` only where absence is real; no `!` without a proven invariant nearby.
- Doc comments use `///` in Effective Dart style on public API.
- Tests use `package:test`. Use `package:checks` for new assertions if the package has adopted it.

## Avoid

| Stale / wrong | Use instead | Enforced by |
|---|---|---|
| Dart 2 class hierarchies + `is` chains | `sealed` + exhaustive `switch` | analyzer (non-exhaustive switch error) |
| `dynamic` where a type is known | A declared type or generic | `strict-casts`, `strict-raw-types` |
| Editing `*.g.dart` / `*.freezed.dart` | Edit the annotated source, run `codegen` | `generated.globs` |
| `print` for diagnostics | `package:logging` or the project's logger | `avoid_print` |
| Deprecated APIs | Replacement named in the deprecation | `dart fix --apply` |
| Unawaited futures | `await`, or `unawaited(...)` to make it explicit | `unawaited_futures` |

## Testing

Keep unit tests in `test/` mirroring `lib/`. Use `mockito` with `@GenerateNiceMocks` (then run
`codegen`) or hand-written fakes. For coverage, use `dart test --coverage=coverage` with the
dart-lang `collect-coverage` skill.

## Dependencies

pub.dev only, unless `dependency_overrides` or a private hosted registry is declared. Resolve
conflicts with the `resolve-package-conflicts` skill. Never hand-edit `pubspec.lock`.

## Generated code

Change the annotated source (`@freezed`, `@JsonSerializable`, `@GenerateNiceMocks`), then run
`codegen`. Stale generated output shows up as analyzer errors. Regenerate; don't patch around it.
