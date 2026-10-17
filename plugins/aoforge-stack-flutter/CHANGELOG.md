# Changelog

All notable changes to the aoforge-stack-flutter stack pack. Released with tags named `aoforge-stack-flutter--vX.Y.Z`.

## [1.0.0] - 2026-10-16

### Added

- First release: extracted from core AOForge by objective 77 (the stack pack contract). Requires aoforge >= 3.1.0.
- The pack declares the web pack as a soft dependency for platform `web` (`soft_depends`), so a Flutter project whose
  runtime or TRD `platform` includes `web` also selects aoforge-stack-web. When the web pack is not active, the
  verifier fragment records Flutter web surfaces as `? SKIPPED` and sends them to human verification (quick 38).
- Moved from core (quick 39): the planner fragment's `## TRD frontmatter for type: ui` (the YAML example and field
  table core's TRD template used to carry; `provider` is accepted and scored like `other`), Step 9's complete UAT
  generation rules in the verifier fragment (row sources, per-platform expansion, state text, format, refusal and
  later edits), and the profile's `## Testing` layer cells, outside-in route, codegen note and web `pumpAndSettle`
  gotcha.
- The `flutter` and `dart` profiles name this pack as their home and the path its SessionStart hook mirrors them to
  (`~/.claude/aoforge/stacks/aoforge-stack-flutter/profiles/<name>.md`); they said "bundled with AOForge". The header
  comment of the vendored `hooks/sync-pack.cjs` names `stack-packs.test.cjs`, the test that keeps it byte-identical
  across packs (objective 79).
