---
title: "aof-tools CLI"
weight: 10
lede: "The central CLI that skills and agents drive. 66 commands, invoked from the runtime mirror."
---

`aof-tools` is a CommonJS CLI, not a library. Roughly fifty skill and agent files
call it. Skills resolve it through the home mirror:

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs <command> [args] [--raw]
```

`--raw` emits compact JSON instead of pretty-printed — use it when piping.

Throughout this site the command is written `aof-tools <command>` for brevity.

### `--help` is always safe

```bash
aof-tools --help             # every command; the ones that write are marked *
aof-tools commit --help      # usage for one command
```

`--help` and `-h` are answered by the dispatcher **before** it selects a
subcommand, so no subcommand can receive a help flag *addressed to aof-tools* as
data. This used to be false in the worst possible place: `aof-tools commit --help`
took `--help` as the commit message, found no `--files`, and committed whatever
was dirty ([#87](https://github.com/AO-Cyber-Systems/aoforge-claude/issues/87)).
`config-set`, `milestone complete`, `handoff create`, `micro start`,
`changelog update` and `project-decline` all wrote something too.

Three boundaries make that guarantee exact
([#100](https://github.com/AO-Cyber-Systems/aoforge-claude/issues/100)):

- **A handful of commands print their own, richer help** — `awareness`,
  `org-awareness`, `dup-detect`, `defaults-table init`, `flutter-ui`
  `bootstrap`/`eval`/`design-review`, `verify flutter-ui-eval`, `gh resolve`.
  The dispatcher delegates to them, and each honours `--help` or `-h` at **any**
  argv position and returns before doing any work. `flutter-ui bootstrap ./app
  --help` used to scaffold five files; `flutter-ui eval -h` used to look for an
  objective named `-h`.
- **Some argv is carried, not read.** `handoff create <command...>` hands its
  tail to your shell, so `aof-tools handoff create gh auth login --help` is a
  handoff of `gh auth login --help` — aof-tools does not answer for `gh`. A
  literal `--` ends the flag region anywhere.
- **A name that is not a command is a typo, not a question.** `aof-tools` with no
  arguments, and `aof-tools <typo> --help`, print the listing and exit **1**, so a
  script that builds an empty or misspelled command name cannot read success.

## Complete command surface

{{< dftools >}}

## The commands you will use directly

### State

```bash
aof-tools state                                  # load and print
aof-tools state get <key>
aof-tools state patch --key value
aof-tools state advance-job
aof-tools state update-progress
aof-tools state add-decision --objective 4 --summary "..." --rationale "..."
aof-tools state add-blocker --text "..."
aof-tools state resolve-blocker --text "..."
aof-tools state record-metric --objective 4 --job 02 --duration 620 --tasks 3 --files 7
aof-tools state record-session --stopped-at "..." --resume-file <path>
aof-tools state-snapshot
```

### Commits

```bash
aof-tools commit "feat(api): add rate limiting" --files src/a.go src/b.go
aof-tools commit "docs(12-03): complete TRD" --files .aoforge/STATE.md
aof-tools commit "..." --amend
```

This is what `gate-commits` redirects raw `git commit` to. It preserves objective
scope and task IDs and updates `STATE.md`.

Two safety rules, both from [#87](https://github.com/AO-Cyber-Systems/aoforge-claude/issues/87):

- **A message starting with `--` is refused.** It is far likelier a mistyped flag
  than an intended subject line.
- **`--files` scopes the commit to those pathspecs**, so a parallel executor's
  staged work is never swept in. Omit it and the commit is scoped to
  `.aoforge/` — the planning docs the command is named for — and still never
  the rest of the working tree. Pass `--files` anyway: it is the only form that
  says what you meant.

A commit that did **not** happen now exits non-zero and says why
([#100](https://github.com/AO-Cyber-Systems/aoforge-claude/issues/100)). The
pathspec form above is a *partial commit*, and git refuses one while a merge is
in progress — which surfaced as `{"reason": "nothing_to_commit"}` and `rc=0`, the
one wording that makes you stop looking. Resolving a merge now reports
`reason: "merge_in_progress"`, names the merge, and tells you to finish it with
the whole index; any other git failure is `reason: "commit_failed"`. Only a
genuinely empty commit is still `nothing_to_commit` with `rc=0`.

### Validation and health

```bash
aof-tools validate consistency
aof-tools validate health              # --repair to fix what it safely can
aof-tools verify-summary <path> --check-count 2
aof-tools verify job-structure <path>
aof-tools verify objective-completeness <objective>
aof-tools verify references <path>
aof-tools verify commits <args>
aof-tools verify artifacts <path>
aof-tools verify key-links <path>
aof-tools verify trd-pre <path>
aof-tools verify api-contract <trd-path>
```

### Objectives and roadmap

```bash
aof-tools find-objective <query>
aof-tools objectives list
aof-tools objective add|remove|complete|next-decimal
aof-tools roadmap get-objective <n>
aof-tools roadmap analyze
aof-tools roadmap update-job-progress
aof-tools requirements mark-complete <id>
aof-tools milestone complete
aof-tools objective-job-index
aof-tools summary-extract <path>
```

{{< callout title="objective remove renumbers" type="danger" >}}
`objective remove` cascade-renumbers every objective above the one removed,
including directory names. `objective add` slugifies the entire description into
the directory name. Both are why `/aoforge:objective` is user-typed only.
{{< /callout >}}

### Intent model

```bash
aof-tools intent resolve --objective 4
aof-tools defaults-table init --scope=org|project
aof-tools resolve-model <agent-type>
```

### Telemetry

```bash
aof-tools context --limit 150
aof-tools session-audit --limit 150 --since YYYY-MM-DD
aof-tools telemetry --scan --limit 150
aof-tools transcript-export --out <file> --full <dir> --limit N
aof-tools override --gate <name> --reason "<why>"
aof-tools override --list --limit 20
```

### GitHub

```bash
aof-tools gh status
aof-tools gh sync-objectives
aof-tools gh sync <objectiveId>
aof-tools gh pull <objectiveId> [--apply]
aof-tools gh resolve <objectiveId>
aof-tools gh comment <issue|objective> <body|@file:path>
aof-tools gh close-issue <issue|objective> [comment]
aof-tools gh sync-release <tag>
```

### Changelog

```bash
aof-tools changelog update --version vX.Y.Z [--from <ref> --to <ref>] [--dry-run]
aof-tools changelog check <version>
```

### Skill and micro lifecycle

```bash
aof-tools skill-active --start <name>    # writes the marker gate-edits checks for
aof-tools skill-active --end
aof-tools skill-active --status

aof-tools micro start "<description>"
aof-tools micro commit [--files <path>...]
aof-tools micro abort
```

### Config

```bash
aof-tools config-get <key>
aof-tools config-set <key> <value>
aof-tools config-ensure-section <section>
aof-tools global-config get|set <key> [value]
```

### Project classification

```bash
aof-tools project-state [<cwd>]
aof-tools project-decline [<cwd>] [--duration-days N]
aof-tools project-accept [<cwd>]
aof-tools detect novel-domain <objective>
aof-tools detect brownfield-map [<cwd>]
aof-tools detect flutter-ui-scope <objective>
```

### Awareness and coordination

```bash
aof-tools awareness <subcommand>
aof-tools org-awareness <subcommand>
aof-tools initiatives <subcommand>
aof-tools check-todos
aof-tools tui
aof-tools decision-queue
aof-tools handoff create|complete|list|get
aof-tools planning sibling-trd-scan <objective-num>
```

### Templates and scaffolding

```bash
aof-tools template select <type>
aof-tools template fill <type> --objective N --job YY --name "..." --fields '{"k":"v"}'
aof-tools frontmatter get|set|merge|validate <file> [--field <f>] [--value <v>]
aof-tools scaffold <args>
aof-tools generate uat <objective>
aof-tools generate-slug "<text>"
aof-tools current-timestamp
```

### Compound init

`init` bundles the state loading a skill needs into one call, so a skill costs one
`aof-tools` invocation rather than six:

```bash
aof-tools init execute-objective
aof-tools init plan-objective
aof-tools init new-project
aof-tools init new-milestone
aof-tools init quick
aof-tools init resume
aof-tools init verify-work
aof-tools init objective-op
aof-tools init todos
aof-tools init milestone-op
aof-tools init map-codebase
aof-tools init security-audit
aof-tools init progress
```
