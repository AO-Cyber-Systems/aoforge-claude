# Stack profiles

The go, dart and flutter profiles that used to live here moved to `plugins/devflow/devflow/stack-profiles/`
(objective 42). They ship bundled with DevFlow, and `sync-runtime` mirrors them to `~/.claude/devflow/stack-profiles/`.

A profile `<id>` resolves from `~/.claude/devflow/stacks/<id>.md` first, then from the bundled dir, so put a user or org override
in `~/.claude/devflow/stacks/<id>.md`. The mirror never touches `stacks/`. Never edit the mirrored `stack-profiles/`: the next
mirror replaces it.

Draft a project's own profile with `df-tools stack init`; see `plugins/devflow/devflow/templates/stack.md` for the format.
