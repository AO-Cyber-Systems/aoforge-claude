# Changelog

All notable changes to the aoforge-stack-web stack pack. Released with tags named `aoforge-stack-web--vX.Y.Z`.

## [1.0.0] - 2026-10-16

### Added

- First release: extracted from core AOForge by objective 77 (the stack pack contract). Requires aoforge >= 3.1.0.
- An executor fragment adds a light browser self-check before handoff: load the route, no console errors, one
  accessibility snapshot, through the Playwright MCP tools. It records a `## Browser self-check` table for the
  verifier, skips with a reason when the browser tools or a dev server are unavailable, and binds servers to port 8091.
  The verifier fragment passes those routes to web-ui-verifier (quick 38).
- The executor fragment's `## Before a UI checkpoint:human-verify` runs the same per-route check on a
  `checkpoint:human-verify`'s routes before it is presented, and shows the rows as pre-verified evidence. It replaces
  the browser steps core's `checkpoints.md` used to carry; click and screenshot evidence stays with web-ui-verifier,
  since the executor holds no click or screenshot tool (quick 39).
