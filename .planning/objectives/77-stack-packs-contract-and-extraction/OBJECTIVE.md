---
work: refactor
---

# Stack packs: contract and extraction

## Goal

Core AOForge names no stack. Flutter, Dart and web procedure ships in stack pack plugins that a project selects through its stack profile, and core reaches them only through the pack contract: `docs/PROPOSAL-stack-packs.md` M0 (contract) and M0.5 (extraction).

## Decisions (2026-10-15, with the user)

- Scope: contract and extraction, all in this repo. `dflang` (M1-M4) is a separate effort.
- No compatibility shim: the in-core Flutter and Playwright path and its commands are removed in 3.1.0, a planned breaking change in a minor release. Packs depend on `aoforge >=3.1.0`.
- Same branch and PR as Objective 76.

## Design notes

- Fragments are delivered as one Read pointer per active pack in `stack context <agent>`, outside the profile slice budget, so a repo with no pack pays nothing.
- Selection is by intent: `extends:` a pack profile, config `stacks.enabled`/`disabled`, or `select.runtime` against `verification.runtime`. Detection only proposes.
- Maestro runs through its CLI from the verifier fragment, so the Flutter pack needs no verifier sub-agent; the web drive needs Playwright MCP tools, so the web pack's `web-ui-verifier` agent holds them and the verifier delegates with the Agent tool (nesting is allowed up to three levels).
- `gopls`/`dart` MCP grants stay on core agents: a pack cannot add tools to another plugin's agent, and a grant for an absent server is inert.
- `design-stack-flutter.md` and `design-stack-web.md` stay in core references: the separate design-system skills read them from `~/.claude/aoforge/references/`.
- Left for later (allowlisted as data in the neutrality guard): stack-verify's pub effect guard, org-awareness's Dart export extractor, the Surface Spec catalogue source, trd-artifacts' `tests.*` keys, and the integration-checker/codebase-mapper TypeScript recipes.
