# Changelog

All notable changes to the aoforge-stack-flutter stack pack. Released with tags named `aoforge-stack-flutter--vX.Y.Z`.

## [1.0.0] - 2026-10-16

### Added

- First release: extracted from core AOForge by objective 77 (the stack pack contract). Requires aoforge >= 3.1.0.
- The pack declares the web pack as a soft dependency for platform `web` (`soft_depends`), so a Flutter project whose
  runtime or TRD `platform` includes `web` also selects aoforge-stack-web. When the web pack is not active, the
  verifier fragment records Flutter web surfaces as `? SKIPPED` and sends them to human verification (quick 38).
