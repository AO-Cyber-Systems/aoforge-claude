---
schema: 1
id: aoforge-claude
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
  reviewed: "2026-10-16"
  sources: []
---

# Stack Profile: aoforge-claude

## Layout & architecture

<!-- inherit -->
The plugin lives in `plugins/aoforge/`. `aoforge/bin/aof-tools.cjs` is the CLI; its internals are
CommonJS modules in `aoforge/bin/lib/*.cjs` using synchronous fs. Skills and agents call the
`~/.claude/aoforge` MIRROR, not this checkout. Stack-specific procedure lives in the stack packs
`plugins/aoforge-stack-flutter/` and `plugins/aoforge-stack-web/`. See CLAUDE.md "Architecture".

## Testing

<!-- inherit -->
`node --test` against `*.test.cjs` and `*.test.js` files adjacent to the source. Fixture factories live in
`aoforge/bin/lib/__fixtures__/` (and `hooks/__fixtures__/`) and build mkdtemp projects and fake homes;
tests never read the real `~/.claude`. The full suite is `npm test`, which globs
`plugins/aoforge/**/*.test.cjs`, `plugins/aoforge-stack-*/**/*.test.cjs`, `plugins/aoforge/**/*.test.js`
and `scripts/**/*.test.cjs`. On a machine with fish installed, `watcher-shell.test.cjs`'s W-3 test hangs:
run the same globs from `git ls-files` minus that one file.
