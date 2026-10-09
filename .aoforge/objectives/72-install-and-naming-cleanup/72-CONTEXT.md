# Objective 72: Rename to AOForge and naming cleanup - Context

**Gathered:** 2026-10-08
**Status:** Ready for planning

<domain>
## Objective Boundary

Scope change from the roadmap entry "Install and naming cleanup" (INST-01). 72 now delivers both:

1. **Rename DevFlow → AOForge.** Every DevFlow name changes: the plugin, the slash namespace, agent types, the CLI, the runtime path, env vars, the project planning directory, config and CLAUDE.md markers, GitHub store artefacts, and the external surfaces (repo, docs site, CI workflow, watch daemon, adopt branch). The distribution is "AOForge-claude". Old names keep working for exactly one release via shims.
2. **Original INST-01 cleanup.** No legacy `df-*` skills or agents under `~/.claude` (moved to backup, never deleted). `doctor` flags any that reappear. A repo test fails on legacy command forms (`/df-`, `/df:`, and now `/devflow:`) in user-facing files; changelogs and archives are exempt. Every user-facing reference uses `/aoforge:<name>`.

The ROADMAP entry for 72 (title, goal, success criteria) and requirement INST-01 must be rewritten to this scope as part of planning.

</domain>

<decisions>
## Implementation Decisions

### Name map (locked)
| Old | New |
|---|---|
| DevFlow (prose) | **AOForge** (one word; lowercase `aoforge` in identifiers) |
| repo `AO-Cyber-Systems/devflow-claude` | `AO-Cyber-Systems/aoforge-claude` |
| plugin `devflow@aocyber` | `aoforge@aocyber` |
| `/devflow:<skill>` | `/aoforge:<skill>` |
| agent types `devflow:<agent>` | `aoforge:<agent>` |
| `df-tools.cjs` | `aof-tools.cjs` |
| `~/.claude/devflow/` | `~/.claude/aoforge/` |
| `DEVFLOW_*` env vars | `AOFORGE_*` |
| `.planning/` (project dir) | `.aoforge/` |
| config.json `devflow{}` stamp | `aoforge{}` |
| banner `DF ►` | `AOF ►` |
| Cloudflare Pages `devflow-docs` | `aoforge-docs` |
| `devflow-checks.yml`, `devflow-watch`, `devflow/adopt` branch | `aoforge-checks.yml`, `aoforge-watch`, `aoforge/adopt` |

### Compatibility (one-release shims, removed in the release after 3.0.0)
- `DEVFLOW_*` env vars are still honored (the `AOFORGE_*` form wins when both are set).
- `~/.claude/devflow/` state (calibration, backups, estimates, hook markers, awareness, progress guard, transcript export, stacks overrides) migrates to `~/.claude/aoforge/` with a backup first.
- Gates still recognize `devflow:` agent types as their own.
- **`.planning/` fallback:** every tool resolves `.aoforge/` first and falls back to `.planning/`, emitting a new W-code advisory that names the migration. New projects get `.aoforge/`.
- The old CLAUDE.md managed-block markers are still recognized, so a block is never duplicated.
- Readers accept either the `devflow{}` or the `aoforge{}` config key.

### Project-file migrations
- **`.planning/` → `.aoforge/`: auto migration.** The SessionStart upgrade hook performs it with `git mv` (so history follows) and background-commits only the move. It obeys the existing upgrade-hook safety rules: skip on a dirty tree or mid-merge/rebase, take a backup first, and handle a gitignored store-mode cache correctly.
- **config.json `devflow{}` → `aoforge{}`**: migration renames the key.
- **CLAUDE.md managed blocks and "DevFlow Routing" text**: auto migration rewrites the markers and routing text to AOForge and `/aoforge:`.
- **GitHub store bulk rename (store-mode projects): everything.** This covers labels, hidden issue-body markers, wiki page names, and DevFlow wording in issue titles and bodies. It is outward-facing: dry-run preview first, then one user checkpoint per repo.

### This repo
- `git mv .planning .aoforge` for the whole tree.
- Rewrite the active docs to AOForge wording: PROJECT.md, ROADMAP.md, STATE.md, REQUIREMENTS.md and CLAUDE.md. Archived milestones and past TRD/SUMMARY/VERIFICATION files keep their DevFlow wording as history; only their paths change.
- CHANGELOG: past entries untouched, file header unchanged. The 3.0.0 entry leads with the rename and links a migration guide.

### Brand & identity
- Use the real gold AO emblem (`https://aocyber.ai/images/ao-icon.svg`) with an "AOForge" wordmark wherever the docs site or README shows an identity, per the AO Cyber brand guide (dark + gold, Proxima Nova). No new mark in this objective.
- Docs site: rename the Pages project to `aoforge-docs` (user checkpoint).

### Release & version
- The rename ships as **3.0.0** (breaking, even with shims). All three version files are synced.
- **Pointer release of the old plugin:** a final `devflow@aocyber` version whose SessionStart hook tells the user to install `aoforge@aocyber`, and whose skills forward to the `/aoforge:` equivalents. It is dropped in the following release.
- **Coexistence:** aoforge's SessionStart detects an installed devflow plugin and tells the user to disable it. The old devflow hooks no-op when they see aoforge's runtime marker, so the same gate never runs twice.

### Rollout of the user's setup (all live steps are user checkpoints)
- **Global CLAUDE.md:** `aof-tools upgrade --global` rewrites the managed block to `/aoforge:` routing (backup first). Hand-written text outside the block (e.g. the "DevFlow Routing" heading and TDD section) is shown as a diff for the user to approve before it is written.
- **GitHub repo rename** devflow-claude → aoforge-claude: checkpoint. The marketplace slug and every `devflow-claude` reference are updated.
- **Local checkout** `~/dev/devflow-claude` → `~/dev/aoforge-claude`: checkpoint. The user moves the directory, the git remote is updated, and the Claude memory directory keyed to the old path is copied to the new key.
- **Vanity mapping:** draft a PR in `AOCyberAI-Ops` adding the `aoforge-claude` entry to the git.aocyber.ai Worker mapping (supply-chain sensitive; the user reviews and merges).
- **Fleet sweep:** run the upgrade across every fleet repo already using DevFlow (devflowops and the other AOCyber repos) inside 72, one checkpoint per repo.

### Scoring
- 72 remains one of EST-11's five scored objectives, and **all of 72 is scored**, including checkpoint-heavy rollout TRDs (the user accepted that minutes include wait time). The run-state estimate must be recorded before execution starts, as for 68-71.

### Claude's Discretion
- How to split the work into TRDs and waves, and in what order. The rename touches ~500 files, including the gates that are live in this session, so order it so the repo stays green and the running hooks keep working mid-objective.
- The new W-code numbers and doctor check ids for `.planning/` fallback, `devflow` leftovers and `df-*` reappearance.
- The coexistence guard mechanism between the devflow and aoforge plugins.
- Mechanics of the shim layer (env-var aliasing helper, path resolver for `.aoforge/` with fallback).
- Exact repo-test allowlist for history (CHANGELOG past entries, milestones, past TRD/SUMMARY files, NOTICE/fork attribution "Fork of GSD").

</decisions>

<specifics>
## Specific Ideas

- Consistent with the AO product family (AODex, AOSentry): one-word "AO"-prefixed name.
- Two-letter→three-letter CLI prefix: `aof-tools`, matching the `AOF ►` banner.
- Fork attribution (GSD v1.20.4) and NOTICE.md (taste-skill MIT) stay intact.
- The DEPRECATION_MAP / REMOVED_COMMANDS in `lib/skill-route.cjs` is the single rename source; `/devflow:*` → `/aoforge:*` should flow through it so `doc-refs` and migration 0007-style fixes reuse it.

</specifics>

<deferred>
## Deferred Ideas

- A dedicated AOForge mark/logo (separate design task).
- A custom docs domain (e.g. forge.aocyber.ai): Objective 74 (operations).
- Removing the shims, the `.planning/` fallback and the devflow pointer plugin: the release after 3.0.0.

</deferred>

---

*Objective: 72-install-and-naming-cleanup*
*Context gathered: 2026-10-08*
