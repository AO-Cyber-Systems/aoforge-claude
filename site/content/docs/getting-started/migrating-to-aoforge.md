---
title: "Migrating to AOForge"
weight: 15
lede: "3.0.0 renames the plugin. What moves by itself, what you do, and how to check it."
---

<!-- rename-guard:ignore-start -->
AOForge 3.0.0 is the plugin you knew as DevFlow, under its new name. The plugin, the slash commands, the agent types,
the CLI, the runtime directory, the project planning directory, the environment variables and the GitHub artefacts all
take the AOForge name. The workflow itself does not change: the same skills, agents, gates and planning files, spelled
differently.
<!-- rename-guard:ignore-end -->

The old names keep working for one release. Most of the move happens by itself the first time AOForge starts. What is
left for you is a short checklist: install, disable the old plugin, review one diff, and rebrand each GitHub repository
that uses the integration. The one-release shims are removed in **the release after 3.0.0**, so finish the checklist
before you take that release.

The rename changes no behaviour. If something works differently after the move, that is a bug: open an issue.

## Name map

<!-- rename-guard:ignore-start -->
| What | Before (2.x) | After (3.0.0) |
|---|---|---|
| Product | DevFlow | AOForge |
| Repository | `AO-Cyber-Systems/devflow-claude` | `AO-Cyber-Systems/aoforge-claude` |
| Plugin | `devflow@aocyber` | `aoforge@aocyber` |
| Slash commands | `/devflow:<skill>` | `/aoforge:<skill>` |
| Pre-plugin command forms | `/df:<skill>`, `/df-<skill>` | `/aoforge:<skill>` |
| Agent types | `devflow:<agent>` | `aoforge:<agent>` |
| CLI | `node ~/.claude/devflow/bin/df-tools.cjs` | `node ~/.claude/aoforge/bin/aof-tools.cjs` |
| Runtime home | `~/.claude/devflow/` | `~/.claude/aoforge/` |
| Environment variables | `DEVFLOW_*` | `AOFORGE_*` |
| Project planning directory | `.planning/` | `.aoforge/` |
| `config.json` upgrade stamp | `devflow{}` | `aoforge{}` |
| CLAUDE.md managed block | `<!-- DEVFLOW:START ... -->` | `<!-- AOFORGE:START ... -->` |
| Banner | `DF ►` | `AOF ►` |
| User dot directory | `~/.devflow/` | `~/.aoforge/` |
| Watch daemon | `devflow-watch` | `aoforge-watch` |
| Adopt branch | `devflow/adopt` | `aoforge/adopt` |
| GitHub labels and hidden markers | `devflow:<name>` | `aoforge:<name>` |
| GitHub check contexts | `devflow/<check>` | `aoforge/<check>` |
| Checks workflow (reusable, caller) | `devflow-checks.yml`, `.github/workflows/devflow.yml` | `aoforge-checks.yml`, `.github/workflows/aoforge.yml` |
| Checks App variable and secret | `DEVFLOW_APP_CLIENT_ID`, `DEVFLOW_APP_PRIVATE_KEY` | `AOFORGE_APP_CLIENT_ID`, `AOFORGE_APP_PRIVATE_KEY` |
| Docs site Pages project | `devflow-docs` | `aoforge-docs` |
<!-- rename-guard:ignore-end -->

The docs site keeps its address, https://devflow.cloud, for now. Its CLI reference page moved to
`/docs/reference/aof-tools/`, and the old URL redirects there.

## What keeps working until the next release

<!-- rename-guard:ignore-start -->
- **Old commands.** The final `devflow@aocyber` release (3.0.0) is a pointer. It has one forwarding skill per command:
  `/devflow:<name>` hands its arguments to `/aoforge:<name>`, or tells you how to install AOForge when it is missing.
  Six AOForge commands run only when you type them (`cleanup`, `list-objective-assumptions`, `milestone`,
  `set-profile`, `settings`, `workstreams`); for those the pointer names the `/aoforge:` command to type instead. Its
  session-start notice goes quiet once the AOForge runtime is present. It ships no agents, gates or runtime, so beside
  AOForge nothing runs twice.
- **Old environment variables.** Every `DEVFLOW_*` variable is still read. When both forms are set, the `AOFORGE_*`
  one wins.
- **The old planning directory.** Every tool looks for `.aoforge/` first and falls back to `.planning/`.
  `aof-tools validate health` reports **W066** while a project still uses the old directory.
- **The old config key.** The upgrade runner reads the `devflow{}` stamp in `config.json` when there is no `aoforge{}`
  one. `validate health` reports **W067** while the old key is the only one.
- **The old CLAUDE.md markers.** A managed block under the `DEVFLOW` markers is recognised, so it is updated in place
  and never duplicated.
- **Old agent types.** The edit gates, the executor stop gate and the commit check treat a `devflow:<agent>` subagent
  as their own.
- **Old GitHub artefacts.** Store and mirror reads accept the `devflow:` labels and hidden markers beside the new ones,
  and the checks post every verdict under both the `aoforge/` and the `devflow/` context, so a required check under
  either name still passes.
- **Old user files.** `defaults.json`, the Brave API key and the watch allowlist are read from `~/.aoforge/` first and
  from `~/.devflow/` second.
- **An adopt started before the rename** resumes on the `devflow/adopt` branch.
- **Old ignore lines.** Every `.gitignore` line that names `.planning/` gets a `.aoforge/` twin, and the old line stays.

Three things do not carry over:

- The old edit-gate override phrases. Type `skip aoforge`, `bypass aoforge`, `just edit` or `force edit`.
- The old CLI path. Once the old plugin is disabled, `~/.claude/devflow/bin/df-tools.cjs` is a stale copy that no
  longer updates. Point scripts and aliases at `~/.claude/aoforge/bin/aof-tools.cjs`.
- A running `devflow-watch` daemon. It watches only its own handoff directories, so AOForge does not hand it work, and
  `aoforge-watch add-project` refuses it (`ELEGACYDAEMON`). Stop it with `aoforge-watch stop`, then start
  `aoforge-watch`.
<!-- rename-guard:ignore-end -->

## What moves by itself

<!-- rename-guard:ignore-start -->
**On the first AOForge session** (the `sync-runtime` SessionStart hook):

- **Runtime state.** `calibration.json`, `audit.log`, `transcript-index.jsonl`, your stack overrides (`stacks/`) and
  `state/` (estimate run state and history, the awareness cache, hook markers, the progress guard, the
  transcript-export stamp) are copied from `~/.claude/devflow/` to `~/.claude/aoforge/`. The GitHub outbox
  (`state/outbox/`) and `backups/` are moved, never copied, so no queued GitHub write exists twice. Nothing in the new
  home is overwritten, and the old copy stays as the backup. The marker `~/.claude/aoforge/.legacy-state-migrated.json`
  records what was copied, moved and skipped. It runs once: a failure part-way leaves no marker, and the next session
  finishes the job.
- **Legacy skills and agents.** Any `~/.claude/skills/df-*` and `~/.claude/agents/df-*` left from the pre-plugin
  install are moved into a backup under `~/.claude/aoforge/backups/legacy-<timestamp>/`, never deleted.
- **Your global CLAUDE.md block.** The managed block in `~/.claude/CLAUDE.md` moves to the `AOFORGE` markers and the
  `/aoforge:` routing, with a backup first. Hand-written text outside the block is never rewritten here: you get a
  notice with a diff, and you confirm it yourself (step 5 below).
- **A notice** if the old plugin is still enabled (the `coexistence-guard` hook), naming its version and the exact
  disable command. It never edits your settings.

**In each project, at the next session start there** (the `upgrade-project` SessionStart hook, which commits only
what it changed):

| Migration | What it does |
|---|---|
| 0012 planning-dir move (auto) | `git mv .planning .aoforge`, so history follows; untracked and ignored files move with the directory. Takes a backup first. Each `.gitignore` line naming `.planning/` gets a `.aoforge/` twin and keeps the old line. In store mode the cache's ignore block is rewritten first, so the moved cache stays ignored. |
| 0013 config-key rename (auto) | Renames the `devflow{}` stamp in `config.json` to `aoforge{}` in place. When both exist they are merged and the new values win. |
| 0014 CLAUDE.md rebrand (auto) | Moves the project CLAUDE.md managed block to the `AOFORGE` markers and rewrites the names inside it. Text outside the block is never touched. |
| 0007 command references (auto) | Rewrites the old slash command forms (`/devflow:`, `/df:` and the dash form) to `/aoforge:` in the CLAUDE.md block and in STATE.md above its Session Log. |

0012 waits for a safe moment. It does nothing while the tree has tracked changes, while a merge, rebase, cherry-pick,
revert or bisect is in progress, or when `.aoforge/` already exists. Then you get one notice ("AOForge left migration
0012 ... for later"), and every later session start retries it. To run it yourself once the tree is clean:

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs upgrade --apply --only 0012
```

Untracked files inside `.planning/` move with it, but they make the hook leave the move staged instead of committing
it. Commit or remove them first, or run the command above and commit the move by hand.
<!-- rename-guard:ignore-end -->

## What you do

In this order. `aof-tools` below is short for `node ~/.claude/aoforge/bin/aof-tools.cjs`.

<!-- rename-guard:ignore-start -->
1. **Install AOForge.** In Claude Code, refresh the marketplace and install the new plugin:

   ```text
   /plugin marketplace update aocyber
   /plugin install aoforge@aocyber
   ```

   The repository was renamed to `AO-Cyber-Systems/aoforge-claude`, and GitHub redirects the old name. If the update
   fails, remove the `aocyber` marketplace and add it again with `/plugin marketplace add AO-Cyber-Systems/aoforge-claude`.

2. **Restart Claude Code.** The first session mirrors the runtime and does everything under "On the first AOForge
   session" above.

3. **Disable the old plugin.**

   ```bash
   claude plugin disable devflow@aocyber
   ```

   Do this straight after the first AOForge session. Until it is disabled, the old plugin keeps writing
   `~/.claude/devflow/`, and the runtime-state copy does not run a second time.

4. **If you run the watch daemon as a login service**, replace the old service while the old runtime is still in place:

   ```bash
   node ~/.claude/devflow/bin/devflow-watch.cjs uninstall-service
   node ~/.claude/aoforge/bin/aoforge-watch.cjs install-service --project <path>
   ```

5. **Review, then confirm, the global CLAUDE.md text.** Print the diff of your hand-written lines outside the managed
   block (for example a "DevFlow Routing" heading), read it, and write it only if you agree:

   ```bash
   aof-tools upgrade --global --raw
   aof-tools upgrade --global --confirm
   ```

   `--confirm` takes a backup first. If you would rather edit the text yourself, skip the second command.

6. **Clean up the old runtime home.**

   ```bash
   aof-tools doctor --global --fix
   ```

   With the old plugin disabled and the state migrated, this moves what is left of `~/.claude/devflow/` into
   `~/.claude/aoforge/backups/legacy-devflow-runtime-<timestamp>/`. It refuses while the old plugin is still enabled.

7. **Rename your `DEVFLOW_*` variables** to `AOFORGE_*` wherever you set them: shell profile, the environment Claude
   Code is launched from, CI secrets and variables. `aof-tools doctor --global` lists the old ones it can see.

8. **Update scripts and aliases** that call `~/.claude/devflow/bin/df-tools.cjs` to
   `~/.claude/aoforge/bin/aof-tools.cjs`.

9. **Open each project once.** The session-start upgrade moves it (see the table above) and commits the move. Then
   update any hand-written CLAUDE.md text outside the managed block that still names the old plugin or `.planning/`.

10. **Rebrand each GitHub repository** that uses the integration. See [Repositories with GitHub
    integration](#repositories-with-github-integration).

11. **If you moved a checkout** (for example `~/dev/devflow-claude` to `~/dev/aoforge-claude`), carry its repo-keyed
    runtime state to the new path. Preview, then apply:

    ```bash
    aof-tools state rekey --from ~/dev/devflow-claude --to ~/dev/aoforge-claude --dry-run
    aof-tools state rekey --from ~/dev/devflow-claude --to ~/dev/aoforge-claude
    ```

    It copies the estimate run state and history, the awareness cache, hook markers, the outbox journal, backups and
    planning drafts to the new key. It never deletes, and it merges into what the new path already has. Run it once
    the old checkout is retired: the outbox journal is copied, not moved.
<!-- rename-guard:ignore-end -->

## Check it

```bash
aof-tools doctor --global
aof-tools doctor
aof-tools validate health
```

<!-- rename-guard:ignore-start -->
Run the last two inside each project. What to look for:

| Finding | Meaning | Fix |
|---|---|---|
| doctor check 15 `legacy-df-install` | `df-*` skills or agents are back under `~/.claude` | `aof-tools doctor --global --fix` moves them into `backups/legacy-<timestamp>/` |
| doctor check 16 `legacy-plugin-runtime` | the old plugin is still enabled (report-only), the old runtime home is not migrated, or it is left over after the migration; also lists `DEVFLOW_*` variables (report-only) | disable the old plugin, then `aof-tools doctor --global --fix`. One step per run: the first run migrates, the next moves the leftover home |
| W066 `legacy-planning-dir` (doctor check 27) | the project still uses `.planning/`, or holds both directories (the old one is ignored) | `aof-tools upgrade --apply --only 0012`; with both, move what you still need into `.aoforge/` and delete `.planning/` yourself |
| W067 `legacy-config-key` (doctor check 27) | `config.json` records its upgrades only under the `devflow{}` key | `aof-tools upgrade --apply --only 0013` |
| W062 (doctor check 26) on `.github/workflows/devflow.yml` | the checks caller still has its old name | `aof-tools gh rebrand --dry-run`, then `--apply` (never a re-pin with `gh setup`) |

Doctor check 22 (validate health) leaves W066 and W067 to check 27, so each shows once. A clean result: no W066, no
W067, check 15 and 16 `ok`, and `aof-tools gh rebrand` reporting nothing to do.
<!-- rename-guard:ignore-end -->

## Repositories with GitHub integration

<!-- rename-guard:ignore-start -->
`aof-tools gh rebrand` renames one repository's GitHub artefacts to AOForge. It needs `github.enabled` (store mode or
mirror). It is a dry run unless you pass `--apply`. Run it from a checkout of the repository so the local files are
included; `--repo <owner/name>` defaults to `github.repo`.

1. **Flush the outbox first.** A write queued before the rebrand can name an old label, and flushing it after the
   rename would create that label again. Nothing checks for this.

   ```bash
   aof-tools gh outbox flush
   ```

2. **Preview.**

   ```bash
   aof-tools gh rebrand
   ```

   It prints one block per section with a count and line diffs:

   - **Labels.** Every `devflow:` label is renamed, which keeps its issues. When the `aoforge:` label already exists,
     the two are merged instead: the new label is added to every issue that carries the old one, then the old label is
     **deleted**. The plan marks that delete as destructive.
   - **Issues, pull requests and comments that AOForge manages** (the first line is an AOForge or DevFlow marker, or the
     text holds a managed section). Markers move to the `aoforge` namespace, the text inside managed sections gets the
     full rewrite, and the text outside them changes only where it names the product. Titles of managed issues are
     rewritten in full.
   - **Wiki pages** and their names, rewritten in full.
   - **Rulesets.** Required check contexts switch from `devflow/` to `aoforge/`, and an old ruleset name is rewritten,
     so `gh setup` still finds it. Organization rulesets are reported, not edited. This section needs repository admin:
     without it the section reports `needs admin` and the rest still applies.
   - **Local files** (in a checkout of the repository): the managed caller `.github/workflows/devflow.yml` is moved to
     `aoforge.yml` and re-rendered for the current release; the docs backend directory is moved and its pages
     rewritten; the PR template block is re-marked; and `config.json` label values and a `checks_workflow` in the old
     namespace are rewritten in place.

   Never rewritten: text AOForge does not manage, product names that are not this plugin (devflowops, the devflow.cloud
   domain), and the repository's own owner and name, so links keep working.

3. **Apply.**

   ```bash
   aof-tools gh rebrand --apply
   ```

   It runs the sections in that order and stops at the first failure with what is left; run it again to resume (it
   re-reads the repository and plans only what is still old). A secondary rate limit stops it with the wait time. In
   store mode it refreshes the outbox's recorded bases for every issue and comment it rewrote, so the next flush does
   not mistake the rewrite for a human edit. It never commits or pushes: it prints the commit steps for the local
   changes on an `aoforge-rebrand` branch (the store form in store mode). Run them.

4. **Set the checks App variable and secret by hand** if the repository used the App-token path. The re-rendered caller
   reads `AOFORGE_APP_CLIENT_ID` (a repository variable) and `AOFORGE_APP_PRIVATE_KEY` (a secret). A secret cannot be
   copied through the API, so set the new names yourself. Until you do, the checks fall back to the workflow token.

Not covered by `gh rebrand`, so check these by hand:

- Required checks in **classic branch protection** (only rulesets are read). The `devflow/` contexts still pass during
  3.x, because every verdict is posted under both names; switch them to `aoforge/` before the next release.
- PR review comments (AOForge writes none) and first-generation `<!-- df:state -->` sticky comments (they carry no
  namespace marker).
- A repository with more than 10,000 issues or comments: the label merge may miss carriers beyond that.

**A GitHub backfill (migration 0011) started under the old plugin** may halt when it resumes on 3.0.0, because its
resume looks issues up by the AOForge labels only. Either run `aof-tools gh rebrand --apply` before you resume it (it
renames the labels and the `config.json` label values, so the lookups find the issues), or finish the backfill on the
old plugin before you switch.
<!-- rename-guard:ignore-end -->

## Removing the shims

<!-- rename-guard:ignore-start -->
The release after 3.0.0 removes everything listed under "What keeps working": the `DEVFLOW_*` aliases, the `.planning/`
fallback and migrations 0012 and 0013, the `devflow{}` key read, the old block markers, the old agent types, the
dual-namespace GitHub readers and the `devflow/` check contexts, and the pointer plugin. The legacy `.gitignore` lines
can go then too.

Before you take that release:

- Open every project once under 3.x, so 0012 moves its planning directory. A project still on `.planning/` after the
  shims are gone is not found.
- Run `aof-tools gh rebrand --apply` in every repository with GitHub integration.
- Make sure `aof-tools doctor --global` and `aof-tools doctor` report no check 15, 16 or 27 findings and no W066 or
  W067.
<!-- rename-guard:ignore-end -->
