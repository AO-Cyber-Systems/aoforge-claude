---
schema: 1
id: devflow-claude
extends: general
languages: [javascript]
# Node native test runner; tests sit next to the code as *.test.cjs
commands:
  test: { run: "npm test", scoped: "node --test {files}", timeout_s: 900 }
  build: { run: none }
  lint: { run: none }
  format: { run: none }
  typecheck: { run: none }
  fix: { run: none }
  codegen: { run: none }
loop: [test]
gates:
  task: [test]
  objective: [test]
verification:
  runtime: none
provenance:
  reviewed: "2026-09-27"
  sources: []
---

# Stack Profile: devflow-claude

## Layout & architecture

<!-- inherit -->
The plugin lives in `plugins/devflow/`. `devflow/bin/df-tools.cjs` is the CLI; its internals are
CommonJS modules in `devflow/bin/lib/*.cjs` using synchronous fs. Skills and agents call the
`~/.claude/devflow` MIRROR, not this checkout. See CLAUDE.md "Architecture".

## Testing

<!-- inherit -->
`node --test` against `*.test.cjs` files adjacent to the source. Fixture factories live in
`devflow/bin/lib/__fixtures__/` and build mkdtemp projects and fake homes; tests never read the real
`~/.claude`. The full suite (`npm test`) includes `micro.test.cjs`, which hangs when git commit
signing prompts — exclude it locally with
`node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`.
