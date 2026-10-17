# Migrating to AOForge

<!-- rename-guard:ignore-start -->
AOForge 3.0.0 is the plugin you knew as DevFlow, under its new name. The plugin, the slash commands, the agent types,
the CLI, the runtime directory, the project planning directory, the environment variables and the GitHub artefacts all
take the AOForge name. The workflow itself does not change: the same skills, agents, gates and planning files, spelled
differently.
<!-- rename-guard:ignore-end -->

AOForge 3.0.0 kept the old names working for one release. **AOForge 3.1.0 removed those one-release shims.** 3.1 reads
only the AOForge names. It still detects what the rename left behind and tells you how to fix it, but it no longer
converts anything for you.

- **On 3.0.x, with the 3.0.0 checklist done:** nothing to do. Run the checks under [Check it](#check-it) once after you
  install 3.1.
- **Coming from 2.x, or a project that 3.0.x never moved:** see [Upgrading from 2.x](#upgrading-from-2x). Every 3.1
  message about the old layout points there.

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
| User dot directory | `~/.devflow/` | `~/.claude/aoforge/` |
| Watch daemon | `devflow-watch` | `aoforge-watch` |
| Adopt branch | `devflow/adopt` | `aoforge/adopt` |
| GitHub labels and hidden markers | `devflow:<name>` | `aoforge:<name>` |
| GitHub check contexts | `devflow/<check>` | `aoforge/<check>` |
| Checks workflow (reusable, caller) | `devflow-checks.yml`, `.github/workflows/devflow.yml` | `aoforge-checks.yml`, `.github/workflows/aoforge.yml` |
| Checks App variable and secret | `DEVFLOW_APP_CLIENT_ID`, `DEVFLOW_APP_PRIVATE_KEY` | `AOFORGE_APP_CLIENT_ID`, `AOFORGE_APP_PRIVATE_KEY` |
| Docs site Pages project | `devflow-docs` | `aoforge-docs` |
<!-- rename-guard:ignore-end -->

AOForge 3.0.0 itself kept the user files and the watch daemon's pid file and log in `~/.aoforge/`. They now live in
the runtime home, `~/.claude/aoforge/` (the daemon's in `state/watch/`). 3.1 no longer reads `~/.aoforge/`;
`aof-tools doctor --global --fix` moves what 3.0.0 left there.

The docs site keeps its address, https://devflow.cloud, for now. Its CLI reference page moved to
`/docs/reference/aof-tools/`, and the old URL redirects there.

## What 3.1.0 removed

<!-- rename-guard:ignore-start -->
Everything 3.0.0 kept working "until the next release" is gone:

- **Old commands.** The pointer release of `devflow@aocyber` left the marketplace, so `/devflow:<name>` no longer
  forwards to `/aoforge:<name>`. The doc-reference check and migration 0007 no longer read or rewrite the old command
  forms (`/devflow:`, `/df:`, the dash form); they are plain text now. If an installed copy of the pointer is still
  enabled, the session-start notice below names its disable command.
- **Old environment variables.** No `DEVFLOW_*` variable is read. The `AOFORGE_*` name is the only one that works.
- **The old planning directory.** No tool falls back to `.planning/`. A project that holds only `.planning/` is not an
  AOForge project to any hook, and the CLI refuses to write it (see below).
- **Migrations 0012, 0013 and 0014** (the planning-directory move, the config-key rename, the CLAUDE.md rebrand) are
  retired. Their ids stay reserved: `aof-tools upgrade --apply --only 0012` (or 0013, 0014) names AOForge 3.0.x and
  this guide instead of "unknown migration id".
- **The old config key.** The upgrade runner reads the `aoforge{}` stamp only. A `devflow{}` key alone reads as "no
  stamp", which is safe because every migration is detection-based; 3.1 never edits or deletes the old key.
- **The old CLAUDE.md markers.** A managed block under the `DEVFLOW` markers is no longer read or updated, in a
  project or in `~/.claude/CLAUDE.md`. The global upgrade no longer moves a pre-rename block and no longer offers to
  rewrite hand-written text outside the block (no `outside_diff`; `upgrade --global --confirm` never rewrites it).
- **Old agent types.** The edit gates, the executor stop gate and the commit check trust `aoforge:<agent>` only.
- **Old GitHub artefacts.** Store and mirror reads no longer accept `devflow:` labels or hidden markers, and the
  checks post each verdict under the `aoforge/` context only.
- **Old user files.** `defaults.json`, the Brave API key and the watch allowlist are read from `~/.claude/aoforge/`
  only, never from `~/.aoforge/` or `~/.devflow/`.
- **The 3.0.0 watch daemon's files.** `aoforge-watch` reads its pid file and log in `~/.claude/aoforge/state/watch/`
  only.
- **The runtime-state migration.** The first session no longer copies `~/.claude/devflow/` into `~/.claude/aoforge/`.
- **Doctor fixes for checks 15 and 16.** Both checks still report; `doctor --global --fix` no longer moves the old
  runtime home or the `df-*` skills and agents.
- **An adopt started before the rename** no longer resumes on `devflow/adopt`. A new adopt starts on `aoforge/adopt`
  and leaves the old branch and marker as they are.
- **The pre-rename `.mcp.json` owner key and todo metadata key** are no longer read (see the `.mcp.json` report below).
- **Old ignore lines.** Nothing adds a `.aoforge/` twin to a `.gitignore` line that names `.planning/` any more, and
  the store-mode ignore block and the merge-driver attributes name `.aoforge/` only.
<!-- rename-guard:ignore-end -->

## What 3.1 still reports

<!-- rename-guard:ignore-start -->
3.1 reads an old name only to tell you about it. Each report names its fix:

- **A project still on `.planning/`.** `aof-tools validate health` returns one broken result, **W066**, and writes
  nothing (`--repair` included). `aof-tools doctor` resolves no project and prints the same message as a note. Every
  `aof-tools` command that writes the planning tree, and `init` (which every skill calls first), refuses with it:

  ```text
  <root> still uses the pre-rename planning directory .planning/, which AOForge no longer reads. Move it with
  AOForge 3.0.x (`aof-tools upgrade --apply`) or by hand: `git mv .planning .aoforge`, then rename a "devflow" key in
  .aoforge/config.json to "aoforge" (see docs/MIGRATING-TO-AOFORGE.md, "Upgrading from 2.x").
  ```

  Read-only commands, and commands that touch only the runtime home, git config or transcripts, still run. At session
  start, the
  `upgrade-project` hook queues the same message once as a global notice; it runs no migration and commits nothing.
- **Both `.planning/` and `.aoforge/` in one project.** W066 as a warning: the old directory is ignored.
- **The old config key.** **W067** when `.aoforge/config.json` has the `devflow{}` key: alone, rename it to
  `aoforge`; beside an `aoforge{}` key, delete it.
- **The old CLAUDE.md markers.** **W069** `legacy-claude-md-block` when the project CLAUDE.md holds a block under the
  `DEVFLOW` markers: rename `<!-- DEVFLOW:START` and `<!-- DEVFLOW:END` to `AOFORGE`, and the next upgrade refreshes
  the block. Migrations 0005 and 0007 skip such a file with the same reason. In `~/.claude/CLAUDE.md`, a pre-rename
  block or a hand-written "DevFlow Routing" section is left untouched with one notice: rename the markers, or delete
  that section so the next upgrade adds the AOForge block.
- **Leftovers in your home** (the `coexistence-guard` SessionStart hook, one notice per session): the old plugin still
  enabled (with its `claude plugin disable devflow@aocyber` command), `DEVFLOW_*` variables in the environment (each
  with its `AOFORGE_*` name), the old runtime home never migrated by a 3.0.x session, and files 3.0.0 left in
  `~/.aoforge/`.
- **Doctor checks 15, 16, 17 and 27.** Check 15 `legacy-df-install` and check 16 `legacy-plugin-runtime` report only;
  check 17 `user-dot-dir` keeps its fix (`aof-tools doctor --global --fix` moves 3.0.0's files from `~/.aoforge/`
  into `~/.claude/aoforge/`); check 27 reports W066, W067 and W069. See [Check it](#check-it).
- **A GitHub repository that still has a pre-rename label.** `gh sync`, `gh pull`, `gh orphans`, the outbox flush
  and the planning-consistency check refuse to look issues up by an AOForge label while the repository still has its
  `devflow:` twin (a lookup by the new label alone would miss those issues and create duplicates). The message names
  `aof-tools gh rebrand --apply`, which 3.1 keeps. `gh setup` refuses to touch a PR template that holds the old block,
  with the same fix, and doctor check 26 reports a pre-rename checks caller (W062).
- **A running 3.0.0 watch daemon.** `aoforge-watch start` refuses while the daemon 3.0.0 started from `~/.aoforge/` is
  still alive, and names `kill <pid>` (or reinstalling the login service); `aoforge-watch status` prints the same
  warning on stderr.
- **A `.mcp.json` entry owned through the pre-rename key.** `aof-tools stack mcp` lists it in `warnings` (and with
  `--write` leaves it as it is): rename its `DEVFLOW_MANAGED` env key to `AOFORGE_MANAGED`, or delete the entry.
<!-- rename-guard:ignore-end -->

## Upgrading from 2.x

<!-- rename-guard:ignore-start -->
3.1 cannot move a 2.x install or project. Pick one path.

**Option A: AOForge 3.0.x once (recommended).** It runs every conversion for you.

1. Get the release: clone the `v3.0.0` tag of the repository (the latest `v3.0.*` tag, if there is a later one),
   remove the `aocyber` marketplace if you have it (`/plugin marketplace remove aocyber`), and add the checkout as
   the marketplace.

   ```bash
   git clone --branch v3.0.0 https://github.com/AO-Cyber-Systems/aoforge-claude ~/aoforge-3.0
   ```

   ```text
   /plugin marketplace add ~/aoforge-3.0
   /plugin install aoforge@aocyber
   ```

2. Follow [The 3.0.0 checklist](#the-300-checklist) below, including opening every project once so it moves to
   `.aoforge/`, and `aof-tools gh rebrand --apply` in every repository with GitHub integration.
3. Install 3.1: remove the local marketplace, add `AO-Cyber-Systems/aoforge-claude` again
   (`/plugin marketplace add AO-Cyber-Systems/aoforge-claude`) and update the plugin.
4. Run the checks under [Check it](#check-it).

**Option B: by hand.** For each project, on a clean tree:

1. Move the planning directory and commit the move:

   ```bash
   git mv .planning .aoforge
   ```

2. In `.aoforge/config.json`, rename the `devflow` key to `aoforge` (or delete it when an `aoforge` key exists).
3. In the project CLAUDE.md, rename `<!-- DEVFLOW:START` and `<!-- DEVFLOW:END` to `AOFORGE`.
4. Update `.gitignore` lines that name `.planning/` to `.aoforge/`.
5. Run the upgrade, which brings the rest forward (`aof-tools` is short for `node ~/.claude/aoforge/bin/aof-tools.cjs`):

   ```bash
   aof-tools upgrade --apply
   ```

6. In each repository with GitHub integration, run `aof-tools gh rebrand --apply` (see [Repositories with GitHub
   integration](#repositories-with-github-integration)).

Then, once per machine:

1. Disable the old plugin: `claude plugin disable devflow@aocyber`.
2. Rename your `DEVFLOW_*` variables to `AOFORGE_*` wherever you set them (shell profile, the environment Claude Code
   is launched from, CI secrets and variables).
3. In `~/.claude/CLAUDE.md`, rename the `DEVFLOW` markers to `AOFORGE`, or delete a hand-written "DevFlow Routing"
   section so the next upgrade adds the AOForge block.
4. Copy what you still need from `~/.claude/devflow/` into `~/.claude/aoforge/`: `calibration.json`, `audit.log`,
   `transcript-index.jsonl`, `stacks/` and `state/` (move `state/outbox/` rather than copy it, so no queued GitHub
   write exists twice). Then move `~/.claude/devflow/` aside, for example into
   `~/.claude/aoforge/backups/legacy-devflow-runtime-<date>/`. Doctor check 16 prints that `mv` command.
5. Move any `~/.claude/skills/df-*` and `~/.claude/agents/df-*` aside (`aof-tools upgrade --global --apply` moves them
   into `~/.claude/aoforge/backups/legacy-<timestamp>/`).
6. Point scripts and aliases at `~/.claude/aoforge/bin/aof-tools.cjs`, and type `/aoforge:<skill>` for every old
   command.
7. If you run the watch daemon as a login service, uninstall the old one and install `aoforge-watch install-service
   --project <path>`.
8. A `.mcp.json` entry with `DEVFLOW_MANAGED`: rename the key to `AOFORGE_MANAGED`.
<!-- rename-guard:ignore-end -->

## The 3.0.0 checklist

<!-- rename-guard:ignore-start -->
This is what AOForge **3.0.x** does and asks of you (Option A above). 3.1 does none of the automatic steps, and steps
5, 6 and 9 below need 3.0.x: under 3.1 `--global --confirm` no longer rewrites text outside the block, `doctor --global
--fix` no longer moves the old runtime home, and opening a project no longer moves it.
<!-- rename-guard:ignore-end -->

### What 3.0.x moves by itself

<!-- rename-guard:ignore-start -->
**On the first AOForge 3.0.x session** (the `sync-runtime` SessionStart hook):

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
0012 ... for later"), and every later session start retries it. To run it yourself under 3.0.x once the tree is clean:

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs upgrade --apply --only 0012
```

Untracked files inside `.planning/` move with it, but they make the hook leave the move staged instead of committing
it. Commit or remove them first, or run the command above and commit the move by hand.
<!-- rename-guard:ignore-end -->

### What you do under 3.0.x

In this order. `aof-tools` below is short for `node ~/.claude/aoforge/bin/aof-tools.cjs`.

<!-- rename-guard:ignore-start -->
1. **Install AOForge.** In Claude Code, refresh the marketplace and install the new plugin:

   ```text
   /plugin marketplace update aocyber
   /plugin install aoforge@aocyber
   ```

   The repository was renamed to `AO-Cyber-Systems/aoforge-claude`, and GitHub redirects the old name. If the update
   fails, remove the `aocyber` marketplace and add it again with `/plugin marketplace add AO-Cyber-Systems/aoforge-claude`.
   For 3.0.x specifically, use the `v3.0.0` checkout from Option A.

2. **Restart Claude Code.** The first session mirrors the runtime and does everything under "On the first AOForge
   3.0.x session" above.

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
    runtime state to the new path. Preview, then apply (this command is in 3.1 too):

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
Run the last two inside each project. What to look for under 3.1:

| Finding | Meaning | Fix |
|---|---|---|
| doctor check 15 `legacy-df-install` | `df-*` skills or agents are back under `~/.claude` (report-only) | `aof-tools upgrade --global --apply` moves them into `backups/legacy-<timestamp>/` (a session start after a plugin update does the same), or move them by hand |
| doctor check 16 `legacy-plugin-runtime` | the old plugin is still enabled, the old runtime home was never migrated, it is left over after a 3.0.x migration, or `DEVFLOW_*` variables are set (report-only) | disable the old plugin; for a home never migrated, run 3.0.x once or copy by hand ([Upgrading from 2.x](#upgrading-from-2x)); for a leftover, run the `mv` the check prints; rename the variables |
| doctor check 17 `user-dot-dir` | `~/.aoforge/` still holds files AOForge 3.0.0 wrote, which 3.1 no longer reads | `aof-tools doctor --global --fix` moves them into `~/.claude/aoforge/` (report-only while a 3.0.0 daemon there is alive) |
| W066 `legacy-planning-dir` (broken; doctor prints a note) | the project has only `.planning/`, which 3.1 does not read | [Upgrading from 2.x](#upgrading-from-2x) |
| W066 `legacy-planning-dir` (warning, doctor check 27) | the project holds both directories; the old one is ignored | move what you still need into `.aoforge/` and delete `.planning/` yourself |
| W067 `legacy-config-key` (doctor check 27) | `.aoforge/config.json` has the `devflow{}` key | alone: rename it to `aoforge`; beside `aoforge{}`: delete it |
| W069 `legacy-claude-md-block` (doctor check 27) | the project CLAUDE.md holds a managed block under the `DEVFLOW` markers | rename the two markers to `AOFORGE`; the next upgrade refreshes the block |
| W062 (doctor check 26) on `.github/workflows/devflow.yml` | the checks caller still has its old name | `aof-tools gh rebrand --dry-run`, then `--apply` (never a re-pin with `gh setup`) |
| `... still has the pre-rename label "devflow:<name>"` from a `gh` command | the repository was never rebranded | `aof-tools gh rebrand --apply`, then retry |

Doctor check 22 (validate health) leaves W066, W067 and W069 to check 27, so each shows once. A clean result: no W066,
W067 or W069, checks 15, 16 and 17 `ok`, and `aof-tools gh rebrand` reporting nothing to do.
<!-- rename-guard:ignore-end -->

## Repositories with GitHub integration

<!-- rename-guard:ignore-start -->
`aof-tools gh rebrand` renames one repository's GitHub artefacts to AOForge. 3.1 keeps it and needs it: until a
repository is rebranded, the lookups listed under "What 3.1 still reports" refuse, and a ruleset that still requires
`devflow/<check>` contexts blocks pull requests, because 3.1 posts each verdict under `aoforge/` only. It needs
`github.enabled` (store mode or mirror). It is a dry run unless you pass `--apply`. Run it from a checkout of the
repository so the local files are included; `--repo <owner/name>` defaults to `github.repo`.

1. **Flush the outbox first**, under 3.0.x if you still can. A write queued before the rebrand can name an old label,
   and flushing it after the rename would create that label again. Nothing checks for this.

   ```bash
   aof-tools gh outbox flush
   ```

   Under 3.1, a flush that has to look an issue up by label halts with `legacy-namespace` while the repository still
   has a pre-rename label; nothing is created. Rebrand (steps 2 and 3), then clear the halt the way
   `aof-tools gh outbox status` prints it and flush again.

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

- Required checks in **classic branch protection** (only rulesets are read). 3.1 posts each verdict under `aoforge/`
  only, so a required `devflow/` context never passes: switch it to `aoforge/`.
- PR review comments (AOForge writes none) and first-generation `<!-- df:state -->` sticky comments (they carry no
  namespace marker). 3.1 still adopts such a sticky comment and rewrites it with the `aoforge` marker on the next sync.
- A repository with more than 10,000 issues or comments: the label merge may miss carriers beyond that.

**A GitHub backfill (migration 0011) started under the old plugin** halts when it resumes on 3.1 while the repository
still has the old labels. Run `aof-tools gh rebrand --apply` before you resume it (it renames the labels and the
`config.json` label values, so the lookups find the issues), or finish the backfill on the old plugin before you
switch.
<!-- rename-guard:ignore-end -->

## Removed in 3.1.0

<!-- rename-guard:ignore-start -->
The one-release shims are gone (see [What 3.1.0 removed](#what-310-removed)). What 3.1 keeps reads an old name only to
detect and report it, to convert it on request (`gh rebrand`), or to read history recorded before the rename (session
audits and agent-overhead measurement still count pre-rename transcripts; the benchmark and token readers count
`.aoforge/` paths only). The detectors and `gh rebrand` go in a later release, once no repository needs them.
<!-- rename-guard:ignore-end -->
