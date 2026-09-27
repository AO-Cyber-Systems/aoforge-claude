---
schema: 1
id: general
extends: null              # root of every chain; nothing sits below it
languages: []              # stack-neutral
# every command is discovered, never assumed (Principle 1)
commands:
  build:   { run: discover }
  test:    { run: discover }
  lint:    { run: discover }
  format:  { run: discover }
  fix:     { run: discover }
  typecheck: { run: discover }
  audit:   { run: discover, when: deps_changed }
  codegen: { run: discover, when: sources_changed }
loop: [format, lint, typecheck, test]   # inner loop after each edit; absent commands are skipped and reported
gates:
  task: [format, lint, typecheck, test]         # before each atomic commit (test = scoped form if one exists)
  objective: [build, test, audit]               # before verify-work
generated:
  globs: []
  # header conventions shared across ecosystems
  markers:
    - "Code generated .* DO NOT EDIT"
    - "@generated"
    - "DO NOT EDIT"
    - "AUTO-GENERATED"
verification:
  runtime: none             # none | cli | service | web | mobile | desktop — project profiles set this
provenance:
  reviewed: "2026-09-27"
---

# Stack Profile: general

The default profile. DevFlow uses it when a project has no `.planning/STACK.md`, and every other
profile inherits its **Principles** section. The Principles can be extended but not removed.
It names no language, framework, package manager or tool. It tells an agent how to *find* those
things in the repo in front of it, and what good engineering looks like anywhere.

## Principles

1. **Discover, don't assume.** Take commands and toolchain from the repo, in this order:
   `.planning/STACK.md` → CI config (`.github/workflows/`, `.gitlab-ci.yml`, …) → task runner
   (`Makefile`, `justfile`, `Taskfile.yml`, manifest scripts) → the package manifest itself →
   `README` / `CONTRIBUTING`. CI is the best evidence, because it is what the project actually
   enforces. Record what you found in the SUMMARY. If STACK.md exists and is wrong, propose the
   correction; don't silently work around it.
2. **Match the declared language version.** Read it from the manifest (the `go` directive,
   `environment.sdk`, `engines`, `requires-python`, `rust-version`, …). Use the idioms that version
   allows. Don't write older idioms than the surrounding code uses, and don't use features newer than
   the declared version. Never bump a toolchain or language version unless that is the task.
3. **Local convention beats general preference.** Before writing something new, find the nearest
   existing example of the same kind (handler, test, component, migration) and copy its shape:
   naming, error handling, layout, test style.
4. **Navigate before you read.** Search for symbols and references first, then read narrow ranges.
   Before changing a signature or exported definition, find every caller.
5. **Smallest correct change.** No drive-by refactors or renames. Don't reformat lines you didn't
   touch unless the project's formatter owns the whole tree; in that case run the formatter.
6. **Tight feedback loop.** After each edit, run the fastest relevant check (format → lint/typecheck
   → scoped tests). Widen to the full suite before the task commits. A check you could not run is
   reported as `not_available` and never counts as a pass.
7. **Tests prove behaviour.** Test at the lowest layer that proves the behaviour. Keep tests
   deterministic: control time, randomness, network and filesystem. A bug fix starts with a
   regression test that fails for the right reason.
8. **Errors are part of the interface.** Never swallow an error. Add context when you propagate it.
   Validate input at trust boundaries and fail loudly there, not deep inside.
9. **Dependencies are decisions.** Prefer the standard library, then dependencies the project
   already has. Never invent a package name or version: confirm it against the lockfile or the
   registry. Record why a new dependency was added. Run the ecosystem's audit or vulnerability
   check whenever dependencies change.
10. **Generated code is output, not source.** Never hand-edit a file that matches `generated.globs`
    or carries a `generated.markers` header. Change its source and regenerate. Commit the generated
    output only if the repo already does.
11. **Security by default.** No secrets in code, logs or fixtures. Parameterize queries. Don't
    disable TLS or certificate verification. Grant least privilege.
12. **No machine-specific assumptions.** No hard-coded absolute paths, hosts or ports. Don't change
    global machine state: global installs, shell profiles, system settings.
13. **Keep docs true.** Update any comment, README or doc that the change makes false.

## Avoid

| Pattern | Do instead |
|---|---|
| Empty `catch` / ignored error return | Handle it, or propagate it with context |
| `sleep` in tests to wait for work | Wait on the actual condition, with a timeout |
| Disabling a lint rule or skipping a test to get green | Fix the cause, or record a scoped, justified suppression |
| Commented-out code left behind | Delete it; history is in git |
| Copy-pasting a block a third time | Extract once the duplication is real (the third copy) |
| Adding a dependency for a few lines of code | Write the few lines |
| Mocking the unit under test | Mock only its collaborators at a boundary |

## Testing

Test the layers the project already tests. Reuse the existing harness, fixtures and naming. If the
project has no tests, add them at the unit layer first, next to the code they cover, using the
ecosystem's default runner. Say which runner you picked and why.

## Dependencies

Adding a dependency or upgrading a major version needs a stated reason in the TRD or SUMMARY. It
also needs the audit command run, if one exists.
