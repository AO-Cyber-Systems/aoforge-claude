# devflow (final release): DevFlow is now AOForge

This is the last release of the `devflow@aocyber` plugin. DevFlow was renamed **AOForge**, and the
plugin is now `aoforge@aocyber` in the same `aocyber` marketplace. This release only points you there.

## Move to AOForge

1. `/plugin install aoforge@aocyber`
2. Restart Claude Code.
3. `claude plugin disable devflow@aocyber`

Your projects are upgraded in place when AOForge first starts in them.

## What this release does

- **A notice at session start** that DevFlow is now AOForge and how to install it. It goes quiet once
  AOForge's runtime is present (`~/.claude/aoforge/.plugin-version`).
- **A forwarding skill for every command.** `/devflow:<name>` hands its arguments to `/aoforge:<name>`
  when AOForge is installed, and otherwise tells you how to install it. A few AOForge commands run only
  when you type them; for those, the pointer tells you the `/aoforge:` command to type instead.

It ships no agents, no gates and no runtime, so beside AOForge nothing runs twice.

This pointer is removed in the release after 3.0.0.

## Maintainers

The skills under `skills/` are generated from `plugins/aoforge/skills` and must not be edited by hand:

```bash
node scripts/gen-pointer-skills.cjs --write   # regenerate
node scripts/gen-pointer-skills.cjs --check   # in step? (run by the test suite)
```
