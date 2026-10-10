---
title: "Changelog and releases"
weight: 60
lede: "Generating Keep-a-Changelog entries from conventional commits, and the gate that stops an undocumented release tag."
---

## Generating an entry

```bash
aof-tools changelog update --version v2.6.0
aof-tools changelog update --version v2.6.0 --dry-run
aof-tools changelog update --version 1.27.4 --from 6aafba1 --to dcfba83
aof-tools changelog check 2.5.0
```

Commits since the last tag are grouped by conventional-commit type:

| Prefix | Section |
|---|---|
| `feat` | Added |
| `fix` | Fixed |
| `perf` | Performance |
| `refactor` | Changed |
| `docs` | Documentation |
| `test`, `chore` | grouped accordingly |
| unrecognised | Other |

`--from` / `--to` let you backfill an older release with an explicit commit range.

## The tag gate

`changelog-on-tag` is a `PreToolUse(Bash)` hook that fires when an annotated
version tag is about to be created. It enforces two invariants:

1. **`CHANGELOG.md` has a `## [X.Y.Z]` heading** for that version.
2. **The three release manifests carry matching versions:**

```text
package.json
plugins/aoforge/.claude-plugin/plugin.json
.claude-plugin/marketplace.json        (the plugin entry matching plugin.json .name)
```

Either failure denies the tag with an actionable message. Escape hatch:
`AOFORGE_SKIP_CHANGELOG_GATE=1`.

The version-sync half exists because three-file drift is silent — the marketplace
advertises one version, the plugin manifest another, and users get whichever the
resolver happens to pick.

{{< callout title="A mention is not an invocation" type="ok" >}}
`gate-commits` and this gate strip heredoc bodies and quoted arguments before
matching, and `gate-interactive` matches each call of a command on its own words
(objective 73), so text that merely *mentions* a tag command or an auth command,
such as a heredoc writing documentation, is not gated.
{{< /callout >}}

## Release notes on GitHub

With the [GitHub integration](/docs/guides/github/) enabled:

```bash
aof-tools gh sync-release v2.6.0
```

Generates release notes from the `SUMMARY.md` files written since the previous tag
— what each job actually did, rather than a flat list of commit subjects — and
creates or edits the GitHub release.

## A release, end to end

1. Bump the three manifests to the same version.
2. Generate the changelog entry:
   `aof-tools changelog update --version v2.6.0`
3. Review it, then commit on a release branch: `aof-tools commit "chore(release): v2.6.0"`
4. Push the branch, open a pull request to `main` and merge it once its required
   checks are green.
5. Create the annotated tag on the merge commit. The gate verifies the changelog
   entry and the three manifests before allowing it. Then push the tag on its own:
   `git push origin v2.6.0`.
6. Generate release notes: `aof-tools gh sync-release v2.6.0`

{{< callout title="AOForge's own main takes changes only through a pull request" type="warn" >}}
In this repository `main` is protected by the ruleset `aoforge: default branch`
(objective 74; its text is `.github/rulesets/main.json`). A direct push or a
force-push to `main` is rejected, and `main` cannot be deleted. A change reaches
`main` only through a pull request with the check `test (npm test, gated)` green.
A repository admin can merge a pull request without waiting for its checks
(`gh pr merge <number> --admin`), but never push or force-push to `main`. Tags are
not covered by the ruleset, so pushing a release tag works as before.
{{< /callout >}}
