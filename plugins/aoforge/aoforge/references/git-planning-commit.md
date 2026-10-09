# Git Planning Commit

Commit planning artifacts using the aof-tools CLI, which automatically checks `commit_docs` config and gitignore status.

## Commit via CLI

Always use `aof-tools.cjs commit` for `.aoforge/` files — it handles `commit_docs` and gitignore checks automatically:

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs commit "docs({scope}): {description}" --files .aoforge/STATE.md .aoforge/ROADMAP.md
```

The CLI will return `skipped` (with reason) if `commit_docs` is `false` or `.aoforge/` is gitignored. No manual conditional checks needed.

## Amend previous commit

To fold `.aoforge/` file changes into the previous commit:

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs commit "" --files .aoforge/codebase/*.md --amend
```

## Commit Message Patterns

| Command | Scope | Example |
|---------|-------|---------|
| plan-objective | objective | `docs(phase-03): create authentication plans` |
| execute-objective | objective | `docs(phase-03): complete authentication objective` |
| new-milestone | milestone | `docs: start milestone v1.1` |
| remove-objective | chore | `chore: remove objective 17 (dashboard)` |
| insert-objective | objective | `docs: insert objective 16.1 (critical fix)` |
| add-objective | objective | `docs: add objective 07 (settings page)` |

## When to Skip

- `commit_docs: false` in config
- `.aoforge/` is gitignored
- No changes to commit (check with `git status --porcelain .aoforge/`)
