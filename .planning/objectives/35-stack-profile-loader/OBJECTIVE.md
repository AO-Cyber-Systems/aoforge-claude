---
objective: 35-stack-profile-loader
kind: plugin
work: feature
tdd: tdd
status: planned
overrides:
  tdd: tdd
---

# Objective 35 — Stack profile: loader, CLI, drafting, validation, agent wiring, neutral references

Spec: `docs/PROPOSAL-stack-profile.md` §5 (the file) and §6 steps 1–5 (this objective). The
artifacts it consumes are already committed (`2946f97`): `references/stack-general.md`,
`templates/stack.md`, `schemas/stack-profile.schema.json`, and the example profiles in
`docs/stack-profiles/`. Approved plan: `~/.claude/plans/buzzing-waddling-glade.md`.
Branch: `feat/stack-profile-loader`, stacked on `docs/stack-packs-proposal` @ `f1106e5`.

## Goal

DevFlow resolves a per-project stack profile (`.planning/STACK.md` over the tiers bundled `general`
→ `~/.claude/devflow/stacks/<id>.md` → project → component), validates it, drafts it from repo
evidence, and hands each agent its slice. The planner, executor, verifier, debugger and
integration-checker read that profile instead of branching on stack in prose. With **no STACK.md**,
behaviour is exactly as today, except that the verifier states a reason instead of "stack not
detected".

## Deliverables (the planner may re-cut, not re-scope)

| Wave | TRD | What |
|---|---|---|
| 1 | 35-01 | `lib/json-schema-lite.cjs`: extract the walker from `ui-spec-validate.cjs`; add `propertyNames`, `minLength`, `uniqueItems`, `const`, union `type`, `format: date`. ui-spec suites unchanged |
| 1 | 35-02 | `lib/stack-profile.cjs`: parse (yaml-lite, `parseSurfaceSpec` fence rules), H2 sections + `inherit`, tiers + `extends` chain (depth ≤4, cycles), component by longest prefix, merge + provenance, `renderCommand`, `contextFor(agent)` with §5.3 matrix + token cap |
| 2 | 35-03 | `validateProfile` (schema + cross-field) and the CLI `df-tools stack resolve\|context\|validate\|command`; HELP_TABLE entry |
| 3 | 35-04 | `df-tools stack init [--from codebase\|research] [--extends] [--write] [--force]`; codebase/stack.md Commands section; map-codebase + new-project confirm steps |
| 3 | 35-05 | `validate health` Check 12 (E/W/I codes), not auto-repaired |
| 4 | 35-06 | planner `<validation_gates>` from `stack command`; executor loop + generated-file refusal + "Discovered commands" |
| 4 | 35-07 | verifier Step 8 keyed on `verification.runtime` + `gates.objective`; debugger; integration-checker probe globs |
| 5 | 35-08 | neutral references: testing-strategy (drop kind→stack guess and Rails), verification-patterns/checkpoints labelled as examples; planner Step 4 reads the Testing section |
| 5 | 35-09 | detectors (project-state, init ×2, brownfield) + `detectMarkers()` union with tier-2 `detect`; Dart/Kotlin/Swift; codebase-mapper command list |
| 6 | 35-10 | dogfood `.planning/STACK.md` for this repo; proposal status; CHANGELOG `[Unreleased]`; USER-GUIDE. **No version bump or tag** |

## Runtime model (binding)

- Skills and agents invoke `node ~/.claude/devflow/bin/df-tools.cjs`, which is the MIRROR, not this
  checkout. Tests `require()` lib modules directly.
- CommonJS `.cjs` under `plugins/devflow/devflow/bin/lib/`, synchronous fs, **no new npm
  dependencies**. Parse with `yaml-lite.cjs`, **not** `frontmatter.cjs` (it returns flow maps as
  strings).
- The org tier is read only when `userHome` is passed, as in `defaults-loader.cjs`. The CLI passes
  `os.homedir()`, and tests pass an `mkdtemp` fake home. **Never read the real `~/.claude` in a
  test.**
- `~/.claude/devflow/stacks/` is outside `sync-runtime`'s SUBDIRS, so nothing may be written into
  a mirrored subdir expecting it to persist.
- A check that could not run reports `not_available`, never pass.
- One plain command per Bash call (worktree guard). No DevFlow gate is bypassed.
- **Neutrality:** new lib code names no specific stack, except the detector marker lists in 35-09.
- Commit signing goes through 1Password. If a commit fails with `1Password: agent returned an
  error`, stop and report it; **never** retry with `commit.gpgsign=false`.

## TDD contract

The lib TRDs (35-01, -02, -03, -04, -05, -09) are `type: tdd`: write the test list in the TRD first,
prove RED by exit code, then GREEN. Commits go `test:` → `feat:` → optional `refactor:`. The prose
TRDs (35-06, -07, -08, -10) are `type: execute`, with grep/assert verification of the exact
wording they introduce.

## Regression baseline

Full suite excluding `bin/lib/micro.test.cjs` (it hangs on 1Password commit signing, which is
pre-existing): **3450 tests / 3408 pass / 32 skipped / 10 fail**. The 10 failures are 9 git-signing
timeouts and handoff-e2e MA-7. Each wave must leave the same 10 and no new failures.

## Definition of done

- In a temp repo with no STACK.md, `stack resolve --provenance` reports every field as `bundled`.
- `stack init --write` on a Go-shaped fixture writes a profile that `stack validate` accepts, and
  `stack command test --packages ./pkg` prints the scoped command.
- `stack validate` rejects a cycle, an unresolved `extends`, and an undefined gate key, each with
  its own code.
- `validate health` shows Check 12.
- Verifier Step 8 no longer reads `project.md` for a stack.
- A Dart-only repo is detected as Dart by all three detectors.
- The regression baseline holds.

## Out of scope

- Flutter/Maestro/Playwright extraction (proposal §6 step 6, and `PROPOSAL-stack-packs.md`); the
  existing Flutter sections in agents stay untouched.
- Tool-grant changes in agent frontmatter.
- Installing upstream skills or MCP servers (`agent_tooling` is read and reported, not acted on).
- A release version bump or tag.
