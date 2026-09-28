# PROPOSAL: Stack Profile — a per-project `.planning/STACK.md`

| | |
|---|---|
| **Status** | Implemented §6.1–6.5 (objective 35); §6.6 open |
| **Owner** | Justin Donnaruma |
| **Reviewed against** | `docs/stack-packs-proposal` @ `09a06ba` (v2.10.1) |
| **Relates to** | `PROPOSAL-stack-packs.md` v0.5 (the profile is the declarative floor packs build on, §8) · `PROPOSAL-kind-and-work.md` (same resolution style) |
| **Ships with this proposal** | `templates/stack.md` · `references/stack-general.md` · `schemas/stack-profile.schema.json` · example profiles in `docs/stack-profiles/{go,dart,flutter}.md` |

## 1. Summary

A project declares its stack in one file, `.planning/STACK.md`. It holds YAML frontmatter
(toolchain, commands, gates, generated files, agent tooling, runtime) and a short body with fixed
sections (Idioms, Avoid, Layout & architecture, Testing, Dependencies, Generated code, Security, UI).
DevFlow resolves it through tiers, bundled `general` → org/pack profile → project → component, and
hands each agent only the slice it needs.

**With no STACK.md, DevFlow uses `general`.** That profile names no technology. It tells agents to
discover commands from CI, the task runner and the manifest, and applies general engineering
principles. Stack opinions become data that a project opts into, not branches in agent prompts.

## 2. Why: where DevFlow is opinionated today

Audit at `09a06ba`. Line counts are approximate; details are in the audit notes behind this
proposal.

| Opinion | Where | Size | Effect |
|---|---|---|---|
| **Flutter + Maestro + Playwright UI verification** | executor.md (bootstrap, per-task `flutter analyze` diff, `flutter build apk`/`adb`/`maestro`), planner.md Flutter UI scope sub-procedure, verifier.md Steps 8/8b/8c/8d/9, `ui-evaluator` agent, `ui-eval` + `design-review` skills, 12 `flutter-*.cjs` modules (~3.6k lines), `trd-artifacts.cjs` (`tests.widget/integration/maestro`), `templates/trd-prompt.md` (`stack: flutter`, `platform: [mobile, web]`, `state_management`), `references/flutter-state-patterns.md` | ~1,000 prompt/ref lines + ~3,900 lib lines | Hard; changes behaviour |
| **Playwright/Maestro tool grants** | `tools:` frontmatter of executor, verifier, ui-evaluator; `verify-work` allowed-tools | 4 lines | Hard; every run carries them |
| **Next.js / TypeScript probes** | integration-checker.md (`src/app/api/**/route.ts`, `--include=*.ts`) | ~200 | Hard in practice; fails silently on other stacks |
| **Stack matrix + kind→stack guess** | `references/testing-strategy.md` (Rails, Go/ConnectRPC, Flutter, Node columns; app→Flutter, api→Go/Rails) | 90 | Hard; the planner routes through it. The Rails column is stale (the org has no Rails) |
| **Verifier runtime selector** | verifier.md Step 8 reads "`.planning/project.md` stack", **a field that does not exist**, so any other stack is SKIPPED | 145 | Hard, and broken |
| **Web/UI foundations** | `design-stack-web.md` (Hugo+Tailwind), `design-stack-flutter.md` (eden-ui), design-craft/preflight "foundations are usually already chosen" | ~700 | Default for UI work |
| **Verification patterns** | `verification-patterns.md`: React/Next/Express/Prisma/Drizzle only | ~480 | De facto default; the only concrete patterns the verifier has |
| **Service/CLI tables** | `checkpoints.md` (Vercel, Supabase, Stripe, Convex, Next/Vite ports) | ~160 | Default |
| **Detectors missing whole stacks** | `project-state.cjs` MANIFEST_LANG, `init.cjs` hasCode, `brownfield-detector.cjs` EXTS: none of them know `pubspec.yaml`/`.dart` | 4 sites | Default; silent gaps |
| **Org/vendor defaults** | eden-libs scanner (`org-awareness.cjs`, ~320), org Project ID in `project.md`/`config.json` templates, port 8091, devcluster | — | Vendor opinion; out of scope here (§9) |
| **Illustrative examples** | npm/Jest/Prisma/Supabase samples across tdd.md, trd-spec.md, codebase templates | ~350 | Cosmetic |

**How stack is recorded today:** nowhere in a machine-readable form. PROJECT.md has `kind` but no
stack. map-codebase writes a prose `codebase/STACK.md` with no commands section (commands appear
only in `codebase/TESTING.md`). The planner scrapes them into TRD `<validation_gates>`.
`project-state.cjs` computes `primary_lang` per session and never persists it. TRD `stack:` accepts
only `flutter`.

The pattern: each stack opinion is a **branch in a prompt** that every run pays for. It detects
the stack ad hoc, and falls through to "SKIPPED" when the guess misses.

## 3. What the Go, Dart and Flutter teams ship (the standard)

Reviewed 2026-09-27 from primary sources (URLs are in each example profile's `provenance.sources`).

| | Go | Dart | Flutter |
|---|---|---|---|
| Guidance files | **None official.** Tooling only; community skills (JetBrains `go-modern-guidelines`, `spf13/go-skills`) | `dart-lang/skills`: 14 task-oriented agentskills.io `SKILL.md` files. **Package skills**: pub packages ship `skills/`, installed by `dart run skills@ get` into `.agents/skills/` | `flutter/agent-plugins`: 10 skills + **one** persistent rule (hot reload, glob `lib/**/*.dart`). The monolithic `rules.md` was **removed** |
| MCP | gopls built-in (`gopls mcp`, v0.20+): `go_workspace`, `go_search`, `go_file_context`, `go_package_api`, `go_symbol_references`, `go_diagnostics`, `go_rename_symbol`, `go_vulncheck`; token-heavy tools off by default | `dart mcp-server` (3.9+), 24 tools: `analyze_files`, `dart_fix`, `dart_format`, `run_tests`, `pub`, `pub_dev_search`, `hot_reload`, `widget_inspector`, … | Same server; runtime tools (widget inspector, hot reload/restart, runtime errors) |
| Model instructions | `gopls mcp -instructions`: read workflow (4 steps), edit workflow (7 steps: refs before edit, diagnostics until clean, scoped tests, no `./...` unless asked) | Inside each SKILL.md "Workflow" checklist | Inside skills; architecture skill (MVVM, ChangeNotifier, feature-grouped `ui/`) |
| Deterministic guardrails | `go fix` modernizers (Go 1.26), gated on the go.mod version; built because "LLMs write old-style Go" | `dart fix`, `dart format`, strict analyzer modes | Same, plus `flutter analyze` |
| Vendor coupling | Gemini CLI documented as one client; telemetry opt-in | Skill metadata records Gemini models; hosted `pub_dev_search` | Antigravity-only a11y agent; hosted Developer Knowledge MCP; Firebase defaults in app docs |

**Five conclusions shape the design:**

1. **Short rules, task-oriented skills.** Flutter measured that documentation dumps underperform
   and deleted `rules.md`. A stack profile is therefore a *pointer file*: commands and hard rules
   inline, and knowledge by reference to skills and MCP.
2. **Tools are the guardrails.** All three turn diagnostics, fixers and formatters into the agent's
   inner loop. The profile names that loop explicitly (`loop`, `gates`).
3. **The language version gates idioms.** Go's modernizers apply only where go.mod allows them,
   and Dart features depend on `environment.sdk`. The profile points at the version *source* and
   never restates the version.
4. **Stale idioms are the common failure.** Each ecosystem names it, so `## Avoid` is a first-class
   table with an *enforced-by* column.
5. **Navigate before reading.** Both MCP servers push symbol and package-API tools over whole-file
   reads. This matches DevFlow's own context discipline, so general Principle 4 states it without
   naming a tool.

## 4. Design goals and non-goals

**Goals:** one authoritative, hand-editable file per project. It works with **zero packs
installed**. The default is stack-free. Per-agent slicing keeps context small. Field-level
provenance works like `intent resolve`. It is readable by DevFlow Native (`.planning/` compatibility).

**Non-goals:** it doesn't replace skills or MCP servers; it references them. It doesn't implement
verification engines (that stays with packs). It doesn't vendor upstream prose into core. It isn't
a linter config (it *names* the lint command).

## 5. The file

### 5.1 Location and tiers

| Tier (low → high) | Path | Provided by |
|---|---|---|
| 1. bundled | `references/stack-general.md` (mirrored to `~/.claude/devflow/`) | core; always present |
| 2. org / pack | `~/.claude/devflow/stacks/<id>.md` | stack packs (via their SessionStart mirror), or an org layer, or the user |
| 3. project | `.planning/STACK.md` | the project; `extends: <id>` selects tier 2 |
| 4. component | `.planning/stacks/<name>.md`, listed in STACK.md `components` | monorepos; a file resolves to the longest matching `path` prefix |

`extends` chains are allowed (`flutter` → `dart` → `general`), capped at depth 4 with no cycles.
Every chain ends at `general`.

**Naming.** `.planning/STACK.md` is prescriptive. `.planning/codebase/STACK.md` (map-codebase) and
`.planning/research/STACK.md` (new-project research) stay descriptive and are its **inputs**. The
stack-packs `.planning/stack.json` (§6.10 there) is *detected* state. Drift between declared and
detected state is a `validate health` warning. It is never silently reconciled.

### 5.2 Frontmatter

Full schema: `schemas/stack-profile.schema.json`. Annotated template: `templates/stack.md`.

| Field | Purpose | Replaces today |
|---|---|---|
| `id`, `extends`, `languages`, `detect` | Identity and inheritance; `detect` is only for drafting | ad-hoc detectors in `project-state`, `init`, `brownfield-detector`, `flutter-ui-scope` |
| `toolchain.<tool>.{version_source,min,max}` | Where the version lives; minimum versions of agent tooling | nothing (idioms float free of versions) |
| `commands.<key>.{run,scoped,apply,when,timeout_s,cwd}` | Canonical commands. Standard keys: `build test lint format fix typecheck audit codegen deps`; projects may add keys. `run: discover` / `run: none` are explicit | TRD `<validation_gates>` scraped from `codebase/TESTING.md`; the executor's `flutter analyze` / `flutter test` hard-coding; the Bash timeout table |
| `loop` | Ordered command keys the executor runs after each edit | the Flutter per-task baseline-diff section |
| `gates.task`, `gates.objective` | What must pass before a commit or before verify-work | the Flutter post-all-tasks section |
| `generated.{globs,markers,regenerate}` | Never hand-edit; how to rebuild | the codegen discipline in `testing-strategy.md`; the stack-packs `generated_file_globs` |
| `agent_tooling.{mcp,skills,instructions,policy}` | Upstream MCP servers, skill sources (pinned), tool-published instructions, telemetry/network policy | hard-wired `mcp__maestro__*` / Playwright grants (partly; see §6 step 4) |
| `verification.{runtime,runtime_check}` | Which runtime check the verifier runs | verifier Step 8's non-existent `project.md` stack field; TRD `platform:` |
| `components[]` | Monorepo areas | `flutter-package-dir.cjs` probing `''` / `flutter/` |
| `provenance.{reviewed,sources}` | Upstream tooling changes monthly; the profile says when it was last checked | — |

### 5.3 Body sections and per-agent slices

The H2 names are fixed so `df-tools` can slice them. A section replaces the parent's section of the
same name. An `inherit` marker comment on the first line appends to the parent's instead.
`## Principles` comes only from `general` and can't be replaced. A project may add a
`## Principles` section that appends.

| Section | planner | executor | verifier | debugger | mapper / researcher |
|---|:-:|:-:|:-:|:-:|:-:|
| Principles (general) | ✓ | ✓ | ✓ | ✓ | ✓ |
| commands / loop / gates (frontmatter, rendered) | ✓ | ✓ | ✓ | ✓ | |
| Idioms | ✓ | ✓ | | | |
| Avoid | | ✓ | ✓ | ✓ | |
| Layout & architecture | ✓ | ✓ | | | ✓ |
| Testing | ✓ | | ✓ | | |
| Dependencies | ✓ | ✓ | | | ✓ |
| Generated code | | ✓ | | ✓ | |
| Security | | ✓ | ✓ | | |
| UI | ✓ (UI TRDs) | ✓ (UI TRDs) | ✓ (UI TRDs) | | |

Budget: `df-tools stack context <agent>` caps its output (default 2,500 tokens) and reports any
truncation. `stack validate` warns when a body is over 150 lines. Today the executor carries
~240 Flutter lines on every run, Go repos included. After this change a Go repo carries none.

### 5.4 Semantics that matter

- **Missing command ≠ pass.** A gate key whose command resolves to `discover` and can't be found, or
  that fails to launch, is reported `not_available`, and the gate does not pass. This is the
  `deployment-verification.md` stance and the stack-packs `missing` rule. `run: none` is a
  deliberate absence and is skipped.
- **Discovered commands are written back as a proposal, never automatically.** The executor records them
  in SUMMARY. `/devflow:status check` then offers to add them to STACK.md.
- **Precedence against TRDs:** TRD frontmatter > OBJECTIVE `overrides` > component profile >
  STACK.md > org/pack > `general`. This matches `intent resolve`, and `stack resolve --provenance`
  reports the tier that supplied each field.

## 6. How DevFlow consumes it (implementation plan)

Each step is independently shippable. Steps 1–3 add capability with no behaviour change for
projects without a STACK.md.

1. **Loader + CLI** (`bin/lib/stack-profile.cjs`, modelled on `defaults-loader.cjs`).
   The CLI commands:
   - `df-tools stack resolve [--file <path>] [--provenance] [--raw]`
   - `stack context <agent> [--files …]`
   - `stack validate`
   - `stack init [--from codebase|research] [--extends <id>]`
   - `stack command <key> [--files …]`: prints the resolved invocation with placeholders filled.

   Tests go in `stack-profile.test.cjs` and use the four tiers as fixtures.

   **Parse with `yaml-lite.cjs`, not `frontmatter.cjs`.** `frontmatter.cjs` returns flow maps
   (`{ run: … }`) as raw strings. `yaml-lite` parses all five shipped/example profiles, and
   `extends: null` comes out as a real null. It rejects a trailing comment on a block-opening key
   (`commands:   # …`), so the template puts those comments on their own line. Quote `"off"` and
   dates: other YAML parsers read bare `off` as `false` and bare dates as date objects.
2. **Drafting.**
   - map-codebase (`tech` focus) and new-project (after research synthesis) call
     `stack init`. It picks `extends` from installed tier-2 profiles by `detect`, lifts commands out
     of CI config and `codebase/TESTING.md`, and asks the user to confirm.
   - `templates/codebase/stack.md` gains a Commands section so that evidence exists.
3. **Validation.** `validate health` checks the schema, that `extends` resolves, that loop/gates keys
   exist, and declared-vs-detected drift. `/devflow:health --migrate` offers `stack init` to
   existing projects.
4. **Agents read the profile instead of branching.**
   - Planner: fills `<validation_gates>` from `gates.task` via `stack command`, and replaces the
     `testing-strategy.md` kind→stack guess with the resolved Testing section.
   - Executor: runs `loop` and `gates.task`, and refuses edits to `generated` matches.
   - Verifier: selects Step 8 by `verification.runtime` (this fixes the dangling field) and runs
     `gates.objective`.
   - Debugger: loads Avoid and commands.
   - Integration-checker: takes probe globs from Layout & architecture, not from hard-coded
     `src/app/api`.
   - Tool grants are unchanged here. Moving them out is the stack-packs §5A.6 sub-agent work.
5. **Neutralise references.**
   - `testing-strategy.md` keeps its abstract layers; the stack columns move to example profiles or
     packs, and the Rails column is dropped.
   - `verification-patterns.md` keeps its patterns but is labelled as examples for web/TS profiles.
   - The detectors read `detect` from tier-2 profiles instead of hard-coded language lists, which
     fixes the missing-`pubspec` gaps.
6. **Flutter logic becomes a profile plus a pack.**
   - The TRD fields `stack`, `platform` and `state_management` become profile fields
     (`extends: flutter`, `verification.runtime`, Layout & architecture).
   - The executable Flutter/Maestro engines move out as `PROPOSAL-stack-packs.md` §10 describes. The
     profile is how those packs are *selected* and configured per project.

## 7. Where upstream artifacts land

The profile references upstream material; setup installs it where each client already looks. None
of it is copied into core.

| Upstream artifact | Profile field | Installed to (by `stack init --install` or a pack setup skill) |
|---|---|---|
| gopls MCP, `dart mcp-server` | `agent_tooling.mcp` | project `.mcp.json` |
| `gopls mcp -instructions` | `agent_tooling.instructions` | cached at `.planning/stack-cache/`, not inlined into CLAUDE.md |
| `dart-lang/skills`, `flutter/agent-plugins`, JetBrains Go skills | `agent_tooling.skills` (pinned) | `.claude/skills/` or `.agents/skills/` |
| Dart package skills | `skills: [{source: package-skills}]` | `dart run skills@ get` → `.agents/skills/` |
| Flutter hot-reload rule | the flutter profile's Idioms | resolved slice (no CLAUDE.md block needed) |
| `go fix` / `dart fix` | `commands.fix` + Avoid "Enforced by" | — |
| Hosted services (`pub_dev_search`, Developer Knowledge MCP), telemetry | `agent_tooling.policy` | disabled unless the profile allows them |

## 8. Relationship to `PROPOSAL-stack-packs.md`

The profile is the **declarative floor**; packs are **optional engines**.

- A project with STACK.md and **no pack** gets correct commands, gates, generated-file protection,
  idioms and runtime selection, all driven by the profile through the generic Bash path. That is
  most of the value the packs spec attributes to M0.
- A pack adds what a file can't: `dflang verify`, the render harness, analyzers, sub-agents with
  tool grants. It ships its profile as tier 2 (`stacks/<id>.md`). Its manifest's `detect`,
  `generated_file_globs` and `testing_matrix` **move into that profile**, so there is one source.
  The manifest keeps only executable concerns (`verify`, `fix`, `doctor`, `fragments`,
  `subagents`, `requires_tool`).
- **Pack selection comes from the profile.** `extends: flutter` plus `stacks.enabled` in
  `config.json` states intent. Detection only proposes it. This removes the packs spec's reliance
  on runtime detection for every run.
- The packs spec's "no stack logic in core" rule holds. Core ships only `general`, the loader and
  the schema. The Go, Dart and Flutter profiles here are examples that the packs adopt.

## 9. Out of scope

Org/vendor opinions (eden-libs scanner, the AO Cyber project ID in templates, port 8091,
devcluster) aren't stack opinions. The same move applies to them, as an `aocyber-org` layer that
supplies tier-2 defaults, but that's a separate review (stack-packs §9.2 already flags it).

## 10. Open questions

1. **File name.** `.planning/STACK.md` is the most discoverable, but it shares a basename with
   `codebase/STACK.md` and `research/STACK.md`. The alternative is `.planning/TOOLCHAIN.md`.
   *Recommend STACK.md*, with the prescriptive/descriptive split stated in both templates.
2. **Install skills into `.claude/skills/` or `.agents/skills/`?** Upstream Dart/Flutter use
   `.agents/skills/`, and Claude Code reads `.claude/skills/`. *Recommend* installing to
   `.agents/skills/` (cross-client, and what `dart run skills@ get` writes) and symlinking
   `.claude/skills/<name>`. This needs a check on Codex/DevFlow Native behaviour.
3. **Should `general` ship Avoid rows at all,** or only Principles? *Recommend keeping the seven
   generic rows.* They are the stack-free cases that reviewers keep catching.
4. **Pinning.** Skills pinned by SHA go stale. A `provenance.reviewed` date older than 90 days
   triggers a `status` advisory.
