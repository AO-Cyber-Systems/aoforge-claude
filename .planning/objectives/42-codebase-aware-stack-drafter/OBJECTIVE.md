---
objective: 42-codebase-aware-stack-drafter
kind: plugin
work: feature
status: registered
milestone: v1.4
---

# Objective 42 — Codebase-aware stack drafter

Registered 2026-09-28 at the user's request after a fleet dry-run of `df-tools stack init` across ~35 repos in `~/dev`.

## Goal

`df-tools stack init` / `/devflow:adopt` produce a **correct, verified** `.planning/STACK.md` for real repos: grounded in the codebase (not first-match CI scraping), wired to the language's skills and MCP tools, and accompanied by a reviewable CI/CD + local-testing recommendations report. Then roll it out to every canonical DevFlow repo in `~/dev`.

## Observed failures (fixtures — reproduce these shapes, don't copy repo content)

- aocore: `format` = `gosec … \` (dangling continuation), `lint` = `helm lint`, `test` = `npx playwright test` — first CI match wins, wrong key classification.
- eden-biz: `build` = `--build-number="${{ inputs.buildNumber }}"` — bare flag fragment from a continued line.
- devflow: `test` = `# …` — a shell comment.
- aoinference: `build` = `echo "Published …"`.
- eden-circle: `test` = `test -f eden-platform-go/go.mod || {` — shell control fragment.
- aodex, politihub: truncated at `\` continuations.
- ~10 repos get `commands: {}` (aostudio, AOSignal, devcluster, torrentConsole, recycling-oracle, …) despite having manifests/task runners.
- Every draft is `extends: general` — no tier-2 profiles installed in `~/.claude/devflow/stacks/`.
- `provenance.reviewed` uses the UTC date (2026-09-29) instead of the local date.

## Requirements

- **SDR-01 Codebase detection.** Detect languages/frameworks from manifests and source: go.mod, pubspec.yaml (Flutter vs pure Dart), package.json, Cargo.toml, pyproject/requirements, Taskfile/Makefile/justfile, Dockerfile/helm, buf, sqlc, codegen markers. Monorepo areas (e.g. `go/`, `flutter/`, `portal/`) become `components` with their own profiles.
- **SDR-02 Command extraction hygiene.** Join `\` continuations; drop comments, bare flag fragments, `echo`/control fragments, `${{ }}`-only lines; prefer task-runner targets (Taskfile/Makefile/justfile) over raw CI steps; classify by tool semantics (gosec/govulncheck → `audit`, gofmt/dart format → `format`, helm lint → not the repo-wide `lint` unless it's the only stack).
- **SDR-03 Command verification.** Each proposed command is checked to resolve (binary on PATH or via the task runner; the target exists) before being proposed. Unverifiable → `run: discover` + a low-confidence note. Missing command ≠ pass.
- **SDR-04 Tier-2 profiles.** Fix the known issues in `docs/stack-profiles/{go,dart,flutter}.md` (gofmt -l never fails; `dart pub outdated` always exits 0; flutter enabled_tools whitelist → `disabled_tools`; drop stale `go_context`; add maestro to flutter) and ship/install them as tier-2 so drafts `extends: go|dart|flutter`.
- **SDR-05 Skills + MCP.** Populate `agent_tooling.mcp` (gopls mcp, dart mcp-server) and `agent_tooling.skills` (dart-lang/skills, flutter/agent-plugins, package skills) per detected stack. When drafting runs inside an agent (adopt / map-codebase), the agent uses those MCP tools (gopls go_workspace/go_diagnostics, dart analyze_files/run_tests) to confirm the configuration. Add `df-tools stack mcp [--write]` to generate managed `.mcp.json` entries if needed.
- **SDR-06 Recommendations report.** Compare the repo's CI and local tooling against the resolved profile and write `.planning/STACK-REPORT.md` (or ADOPT-REPORT section): missing lint/format/vuln gates in CI, missing race/coverage flags, no local task-runner target mirroring CI, missing Maestro/integration tests for Flutter apps, etc. Proposals only, never auto-applied.
- **SDR-07 Validation fixes.** `stack validate` warns on `pin: "<sha>"` placeholders and rejects a positional path. `provenance.reviewed` uses the local date.
- **SDR-08 Fleet rollout.** For each canonical git repo in `~/dev` with `.planning/` (skip git worktrees: aocore-627, aodex-*, eden-biz-103/-autotrial, aocore-wave-*, aoedge-main, aoid-household/-plans; nested `.planning` dirs are components), draft STACK.md + report, confirm each command runs, commit only those files on the current branch. Never push. **User decision 2026-09-29:** dirty working trees are approved by default: only `.planning/STACK.md` + `.planning/STACK-REPORT.md` are written and committed (pathspec-limited `df-tools commit --files`), and in-progress changes are left untouched. This is guarded by a per-repo pre-write snapshot and a stop on any other change. Dirty `.planning/STACK*` paths, conflicts, rebase/merge in progress, detached HEAD, gitignored stack files and `commit_docs: false` stay blocked (surfaced, not committed). aocyber-deploy is skipped (user: PoC/reference-only).

## Constraints

- TDD (kind: plugin) — failing tests first for all `df-tools` lib code, fixtures modelled on the failure shapes above.
- Never port 8080. Don't push, don't release.
