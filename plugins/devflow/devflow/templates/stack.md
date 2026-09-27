# STACK.md Template

Template for `.planning/STACK.md`: the project's **stack profile**. It tells DevFlow agents which
toolchain, commands, idioms, generated files and agent tooling this project uses.

**Prescriptive, not descriptive.** `.planning/codebase/STACK.md` (from map-codebase) *describes* what
the code uses. This file *directs* what agents do. map-codebase and new-project draft it from that
evidence, and a human confirms it.

**Optional.** With no STACK.md, DevFlow resolves the bundled `general` profile
(`references/stack-general.md`): discover commands from CI, the task runner and the manifest, then
apply general engineering principles. A STACK.md only needs to state what differs from that.

**Keep it short.** Sliced sections of this file reach every agent run. Link to skills, MCP servers
and docs instead of pasting them. Target ≤150 body lines; `df-tools stack validate` warns above that.

Schema: `schemas/stack-profile.schema.json`. Full design: `docs/PROPOSAL-stack-profile.md`.

<template>

```markdown
---
schema: 1
id: my-service              # this profile's id (kebab-case)
extends: general            # parent profile: `general` (implicit), or an org/pack profile id
                            # such as `go` or `flutter`, resolved from ~/.claude/devflow/stacks/<id>.md
languages: [go]             # informational; used for detection and telemetry

# versions gate which idioms are allowed (Principle 2)
toolchain:
  go: { version_source: go.mod }     # read the version from here; never restate it
  gopls: { min: "0.21" }             # agent tooling with a minimum version

# canonical, agent-runnable. Omitted keys inherit from the parent.
commands:
  build:   { run: "go build ./..." }
  test:    { run: "go test ./...", scoped: "go test -race {packages}" }
  lint:    { run: "go vet ./..." }
  format:  { run: "gofmt -l .", apply: "gofmt -w {files}" }
  fix:     { run: "go fix -diff ./...", apply: "go fix ./..." }
  audit:   { run: "govulncheck ./...", when: deps_changed }
  codegen: { run: "go generate ./...", when: sources_changed }
  # Placeholders: {files} changed files · {packages} packages/dirs owning them
  # `run: discover` = find it per general Principle 1 · `run: none` = does not exist here

loop: [format, lint, test]  # executor inner loop after each edit (command keys, in order)
gates:
  task: [format, lint, fix, test]        # must pass before each atomic commit
  objective: [build, test, audit]        # must pass before verify-work

generated:
  globs: ["**/*.pb.go"]                  # never hand-edited; excluded from fix/format
  markers: ["Code generated .* DO NOT EDIT"]
  regenerate: codegen                    # command key that rebuilds them

# referenced, not vendored. Setup installs these where each client expects.
agent_tooling:
  mcp:
    - { name: gopls, command: gopls, args: [mcp], required: false }
  skills:
    - { source: "github.com/JetBrains/go-modern-guidelines", pin: "<sha>" }
  instructions:
    - { export: "gopls mcp -instructions" }   # tool-published model instructions

verification:
  runtime: service          # none | cli | service | web | mobile | desktop
                            # selects the verifier's runtime check (verifier Step 8)

components: []              # monorepos only. Each entry: { path: "go/", profile: ".planning/stacks/go.md" }
                            # A file resolves to the component with the longest matching path prefix.

provenance:
  reviewed: "YYYY-MM-DD"      # the upstream tooling changes monthly, so re-review on toolchain bumps
  sources: []               # URLs the idioms/avoid entries came from
---

# Stack Profile: my-service

<!-- Each H2 below has a fixed name. DevFlow slices sections per agent (see the proposal §5.3).
     A section here REPLACES the parent's section of the same name. To APPEND to the parent's
     instead, make the section's first line the marker comment `inherit` (an HTML comment).
     `## Principles` from `general` is always included. -->

## Idioms

<!-- The modern forms to use, keyed to the version in toolchain.*.version_source. One line each. -->

## Avoid

| Stale / wrong | Use instead | Enforced by |
|---|---|---|
|  |  |  |

## Layout & architecture

<!-- Where things go and the one architecture pattern in use. Point to an exemplar file per kind. -->

## Testing

<!-- Layers, runner, fixtures/mocks strategy, what "scoped" means here. -->

## Dependencies

<!-- Registry, selection policy, how to verify a version exists, audit command. -->

## Generated code

<!-- Generators in use, and the edit-source-then-regenerate procedure. -->

## Security

<!-- Stack-specific additions only; general Principle 11 already applies. -->

## UI

<!-- Optional. Accessibility floor, responsive/text-scale expectations, design system in use. -->
```

</template>

<guidelines>

**Resolution (lowest → highest):** bundled `general` → org/pack profile named in `extends` →
`.planning/STACK.md` → component profile. Frontmatter merges key by key, and lists replace. Body
sections replace by H2 name unless marked `<!-- inherit -->`. `df-tools stack resolve --provenance`
shows which tier supplied each field.

**Writing Avoid rows:** name the stale form, the replacement, and the tool that enforces it
mechanically (`go fix`, `dart fix`, a lint ID). A row with no enforcing tool belongs in Idioms.

**When to update:** toolchain or language version bump, new generator, new MCP server or skill set,
or when an executor SUMMARY records a discovered command that differs from this file.

</guidelines>
