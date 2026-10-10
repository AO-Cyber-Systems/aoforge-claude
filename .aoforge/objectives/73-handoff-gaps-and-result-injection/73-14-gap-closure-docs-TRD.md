---
objective: 73-handoff-gaps-and-result-injection
trd: "14"
type: standard
wave: 4
depends_on: ["73-09", "73-10", "73-11", "73-12", "73-13"]
files_modified:
  - CHANGELOG.md
  - docs/USER-GUIDE.md
  - CLAUDE.md
  - scripts/gen-docs-data.cjs
  - site/data/aoforge.json
  - site/content/docs/guides/handoff.md
  - plugins/aoforge/skills/handoff/SKILL.md
  - docs/built-in-sweep.md
  - plugins/aoforge/aoforge/workflows/settings.md
  - docs/MIGRATING-TO-AOFORGE.md
  - site/content/docs/getting-started/migrating-to-aoforge.md
autonomous: true
gap_closure: true
requirements: [HND-02, HND-03]
must_haves:
  truths:
    - "CHANGELOG.md `## [Unreleased]` records the gap closure: Fixed (repositories under $HOME are no longer detected as AOForge projects after a watcher run; gate-interactive gates only real invocations, reads flags per call and lets read-only key fingerprint forms through; the watch daemon no longer rejects a command the hook handed off, such as a compound command whose skip flag sits in another call), Changed (the watch daemon's pid, log and service logs and the user's defaults, Brave key and allowlist live in `~/.claude/aoforge/`, `~/.aoforge/` read for one release; the daemon's built-in allowlist uses the hook's own per-invocation matcher, so it accepts exactly what the hook hands off and now refuses quoted mentions, heredoc data and read-only key forms it used to accept, while user allowlist entries still match the whole command; ssh-keygen `-y` without `-P` is now always handed off, where a `-N` anywhere in the command used to exempt it), Added (doctor check 17 `user-dot-dir`)"
    - "docs/USER-GUIDE.md no longer lists the gate-interactive false positives as a known limitation (neither in Known limitations nor as 'Has known false positives' in the hook table row); it states the remaining detection limits from 73-10's SUMMARY, that ssh-keygen `-y` without `-P` is handed off, that the daemon's built-in allowlist accepts exactly what the hook hands off (and refuses the quoted mentions and read-only key forms it used to accept), the new file locations (shim paragraph, attended-terminal paragraph), that $HOME itself is never an AOForge project, and check 17 in the doctor table"
    - "The site handoff guide's 'A known gap' callout is replaced by the shipped behaviour and the remaining limits, including `-y` without `-P` being handed off; its 'Allowlist and deny list' section says the built-in allowlist is the hook's own matcher, so the daemon runs exactly what the hook hands off (quoted mentions and read-only key forms are refused), and that user entries from `AOFORGE_WATCH_ALLOW_FILE` still match the whole command"
    - "Every page that told the user to write or read `~/.aoforge/<file>` (settings workflow, handoff skill, built-in sweep inventory, migration guide and its site page) names `~/.claude/aoforge/<file>` and, where it is about migration, says 3.0.0 used `~/.aoforge/` and that `doctor --global --fix` moves it"
    - "CLAUDE.md's Doctor, Rename shims and gate-interactive bullets, `scripts/gen-docs-data.cjs` HOOK_DOCS and the regenerated `site/data/aoforge.json` agree with the shipped behaviour"
    - "The doc guards (doc-refs, rename guard, built-in sweep, hook inventory, planning writes, rg-flag guard) and the full suite pass"
  artifacts:
    - path: CHANGELOG.md
      provides: "gap-closure entries under [Unreleased]"
    - path: docs/USER-GUIDE.md
      provides: "known limitations, file locations, $HOME rule, doctor check 17"
    - path: site/data/aoforge.json
      provides: "regenerated from HOOK_DOCS"
  key_links:
    - from: "scripts/gen-docs-data.cjs HOOK_DOCS['gate-interactive.js']"
      to: "site/data/aoforge.json"
      via: "npm run docs:data"
      pattern: "gate-interactive"
---

# TRD 73-14: Docs for the gap closure

<objective>
73-08 documented G1-G3 as known limitations and named `~/.aoforge/` as the user dot directory. 73-09 to 73-13 fixed
G5 and G1-G3 and moved every file out of `~/.aoforge/`. Make the docs true: the changelog, the user guide's known
limitations, file locations and doctor table, the site handoff guide, every page that tells the user to write a file
under `~/.aoforge/`, CLAUDE.md and the generated docs data.

Purpose: keep docs true (STACK principle 13) for the gap closure. Output: updated docs and regenerated data.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
Project kind `plugin`, work `feature` (gap closure). Docs only: no TDD tasks; the doc guard tests are the checks.

Read the five SUMMARYs first, narrowly (frontmatter `provides` and `key-decisions`, plus the "remaining limits"
section of 73-10, the agreement result of 73-12 (which rows the old allowlist got wrong) and the check branches of
73-13): `73-09-SUMMARY.md` to `73-13-SUMMARY.md`.

Read narrowly (locate with `rg -n`, read with offset/limit):
- `CHANGELOG.md` 7-56 (`[Unreleased]`, objective 73 entries).
- `docs/USER-GUIDE.md`: 30-48 (the shim list: `userDotFile`, `findProjectRoot`), 100-110 (doctor table for the
  rename), 116-121 (the watch daemon started before the rename), ~1099 (attended terminal, `aoforge-watch logs`),
  ~1116-1131 (Known limitations: the "gate-interactive false positives" bullet and the "Claude may answer the prompt
  with a flag" bullet), ~960 (the hook table's `gate-interactive.js` row: "`ssh-keygen` without `-N`" and "Has known
  false positives").
- `site/content/docs/guides/handoff.md` ~30-36 (gated command list), 122-127 ("Allowlist and deny list") and 165-181
  (the "A known gap" callout).
- `plugins/aoforge/skills/handoff/SKILL.md` ~140-146 and `docs/built-in-sweep.md` row BS-101 (~121).
- `plugins/aoforge/aoforge/workflows/settings.md` lines 5, 140-160, 210 (`~/.aoforge/defaults.json`).
- `docs/MIGRATING-TO-AOFORGE.md` 30-40 and 66-74; `site/content/docs/getting-started/migrating-to-aoforge.md` 35-45 and
  70-78. Both are rename-guard IGNORE_REGION_FILES: legacy names may appear only between
  `<!-- rename-guard:ignore-start -->` and `<!-- rename-guard:ignore-end -->`; keep edits inside the existing regions
  or free of legacy names.
- `CLAUDE.md` line 66 (Doctor bullet), 69 (Rename shims bullet), 134 (gate-interactive hook bullet).
- `scripts/gen-docs-data.cjs` HOOK_DOCS `'gate-interactive.js'` (~149).
</context>

<embedded_context>

<codebase_examples>
The USER-GUIDE bullet to replace (Known limitations, ~1129), in substance:
"**gate-interactive false positives.** The gate matches the raw command text. A quoted argument or a heredoc body that
mentions a gated command is intercepted ... `ssh-keygen -lf key.pub` ... is gated. When one command holds two
`ssh-keygen` calls, the reason ... can show on a command that passes `-N` to the first ..."

Replacement, in substance (adjust to 73-10's SUMMARY): "**What gate-interactive matches.** Each simple command is
matched on its own words: quoted arguments and heredoc bodies are data, so a grep, an echo or a note that mentions a
gated command is not intercepted, while a heredoc fed to `bash`/`sh`/`zsh` is read as commands. Flags count only in
their own call, and in a compound command the reason names the call that needs your shell. Read-only key forms
(`-l`, `-F`, `-R`) and a new key with `-N` run directly; `-y` without `-P` is handed off. Not matched: a command name
inside quotes (`"npm" login`), behind a prefix such as `env`, `time` or `sudo`, or inside a double-quoted `$( )`.
The watch daemon's built-in allowlist is the same matcher, so it runs exactly what the hook hands off: it no longer
rejects a command the hook gated (for example `-y` with `-N` but no `-P`), and it refuses a quoted mention, heredoc data
or a read-only key form it used to accept. Your own allowlist entries still match the whole command.
Escape: `AOFORGE_SKIP_INTERACTIVE_GATE=1`."

USER-GUIDE hook table row (~960), in substance: "... auth logins, `passwd`, `ssh-keygen` without `-N` (or with `-y`
but no `-P`), `nvm use`, `direnv allow`, ..." and drop "Has known false positives."

Site handoff guide, "Allowlist and deny list" (append to the existing paragraph), in substance: "The built-in entries
are the hook's own matcher, so the daemon runs exactly the commands `gate-interactive` hands off and nothing it lets
through: a quoted mention, heredoc data or a read-only key form is refused. Entries you add through
`AOFORGE_WATCH_ALLOW_FILE` are regular expressions tested on the whole command."

New USER-GUIDE text for the shim list (replacing the `userDotFile` bullet at ~41) and a $HOME line, in substance:
"`userDotFile` reads `defaults.json`, the Brave API key and the watch allowlist from `~/.claude/aoforge/` first, then
from `~/.aoforge/` (where 3.0.0 kept them) and the pre-rename dot directory, for one release. The watch daemon's pid
file, log and service logs live in `~/.claude/aoforge/state/watch/`; a pid file a 3.0.0 daemon left in `~/.aoforge/` is
still read and cleared by `aoforge-watch stop`. `findProjectRoot` never returns $HOME: a planning directory exactly at
your home directory is never a project, so a leftover `~/.aoforge/` cannot turn the repositories under it into AOForge
projects. `doctor --global --fix` (check 17) moves what 3.0.0 left there."

Doctor table row (USER-GUIDE ~104 and CLAUDE.md line 66):
"| 17 `user-dot-dir` | global | a leftover `~/.aoforge/` (3.0.0's watch daemon, service logs or saved defaults) | `doctor
--global --fix` moves AOForge's files to `~/.claude/aoforge/` (or into `backups/aoforge-dot-dir-<timestamp>/` when a
newer copy exists or the pid is stale), never deletes; report-only while a daemon is live, a service still logs
there, or the directory holds planning files |"

CHANGELOG entries (Keep a Changelog sections already present under [Unreleased]; one bullet each, objective 73 gap
closure, plain past-tense statements, no gated command names needed beyond what the existing entries already use).
Beyond the $HOME, detection and file-location bullets, two come from 73-12 and 73-10: Fixed, "The watch daemon no
longer rejects a command gate-interactive handed off (a compound command whose skip flag sits in another call, or a
key read with `-y` and `-N` but no `-P`) (TRD 73-12)"; Changed, "The daemon's built-in allowlist uses gate-interactive's
per-invocation matcher: it accepts exactly what the hook hands off and now refuses quoted mentions, heredoc data and
read-only key forms it used to accept; user allowlist entries still match the whole command (TRD 73-12)", and "Key
reads with `-y` and no `-P` are handed off even when the command passes `-N` (TRD 73-10)".
</codebase_examples>

<anti_patterns>
- Do not describe behaviour from the TRDs; describe what the SUMMARYs say shipped. If a SUMMARY records a deviation,
  the docs follow the SUMMARY.
- Do not add legacy names outside the rename-guard ignore regions; build no new legacy wording at all if avoidable.
- Do not edit `docs/handoff-watcher-guide.md` or `docs/PROPOSAL-handoff-watcher.md`: they are historical (pre-rename
  paths throughout) and out of scope.
- Do not run `doctor --global --fix` on this machine; documentation describes it, the user decides when to run it.
- Do not put a TTY command name inside a quoted Bash argument or a commit message (the installed 3.0.0 gate still
  catches it); to search docs for one, put the pattern in a scratch file and use `rg -f`. Delete any stray
  `.aoforge-handoff/pending/<id>.json` a denied call leaves.
</anti_patterns>

<error_recovery>
- `doc-refs.repo.test.cjs` fails: a command spelled in the new prose is not a real command (for example a doctor flag
  that does not exist). Use the exact names from the SUMMARYs and `aof-tools doctor --help`.
- `rename-guard.repo.test.cjs` fails on a migration page: a legacy name landed outside an ignore region; move it in or
  reword.
- `builtin-sweep.repo.test.cjs` fails after the SKILL.md edit: the inventory row BS-101 must match the skill's prompt;
  change both together.
- `hook-inventory.test.cjs` fails: CLAUDE.md's hook bullet and HOOK_DOCS disagree in a way the test checks (names and
  events); keep both naming `gate-interactive.js` under PreToolUse(Bash).
- `site/data/aoforge.json` diff is larger than the gate-interactive entry: the generator picked up other drift; keep it
  (it is generated output) and mention it in the SUMMARY.
</error_recovery>

</embedded_context>

<gotchas>
- `npm run docs:data` regenerates `site/data/aoforge.json`; never hand-edit it.
- The migration guide's table row "User dot directory" sits inside an ignore region (its old column is a legacy name).
  Change the new column and add one line after the table instead of restructuring it.
- The settings workflow writes the defaults file through Claude: change its `mkdir -p` and path to
  `~/.claude/aoforge/` and keep the instruction otherwise unchanged; `planning-writes.repo.test.cjs` does not treat a
  file under `~/.claude/aoforge/` as a planning write, but run it.
- Check `rg -n -F '~/.aoforge' docs site/content plugins/aoforge CLAUDE.md` at the end: what remains must be about the
  3.0.0 location (read for one release, moved by doctor) or inside historical docs.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: File locations in user-facing pages</name>
  <files>plugins/aoforge/aoforge/workflows/settings.md, plugins/aoforge/skills/handoff/SKILL.md, docs/built-in-sweep.md, docs/MIGRATING-TO-AOFORGE.md, site/content/docs/getting-started/migrating-to-aoforge.md</files>
  <action>
Point every instruction that writes or reads `~/.aoforge/<file>` at `~/.claude/aoforge/<file>`: the settings workflow
(lines 5, 144, 151-157, 210), the handoff skill's "Extend allowlist" option and the matching BS-101 row. In both
migration pages, change the user-directory row's new column to `~/.claude/aoforge/` and add one sentence: 3.0.0 used
`~/.aoforge/`; its files are read for one release and `doctor --global --fix` moves them; the "Old user files"
bullet names the three locations in order. Commit `docs(73-14): name the runtime home for user files`.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/builtin-sweep.repo.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs plugins/aoforge/aoforge/bin/lib/planning-writes.repo.test.cjs exits 0</verify>
  <done>No user-facing page tells the user to write a file under `~/.aoforge/`; migration pages explain the 3.0.0 location and the doctor fix; guards green.</done>
  <recovery>If the built-in sweep test pins the skill option text, update the BS-101 row in the same commit so they match.</recovery>
</task>

<task type="auto">
  <name>Task 2: USER-GUIDE, site handoff guide and CHANGELOG</name>
  <files>docs/USER-GUIDE.md, site/content/docs/guides/handoff.md, CHANGELOG.md</files>
  <action>
USER-GUIDE: replace the `userDotFile` shim bullet and add the $HOME rule and file locations (codebase_examples); add
the check 17 row to the rename doctor table; in the attended-terminal paragraph say the log is in
`~/.claude/aoforge/state/watch/aoforge-watch.log`; in the "watch daemon started before the rename" paragraph add that a
daemon started by 3.0.0 keeps working until restarted; replace the "gate-interactive false positives" known
limitation with "What gate-interactive matches" (codebase_examples, adjusted to 73-10's and 73-12's SUMMARYs: it
includes the daemon-agreement sentences and `-y` without `-P`); update the hook table's `gate-interactive.js` row
(~960) the same way and drop "Has known false positives". Site handoff guide: replace the "A known gap" callout with
the shipped behaviour and the remaining limits, update the gated-list line for key generation (read-only forms pass,
`-y` without `-P` is handed off), and extend "Allowlist and deny list" with the built-in-matcher paragraph
(codebase_examples). CHANGELOG `[Unreleased]`: add the Fixed, Changed and Added bullets named in must_haves (including
the daemon allowlist and `-y` bullets), each tagged "objective 73 gap closure" and citing the TRD. Commit
`docs(73-14): document the gap closure in the guide and changelog`.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/rg-flag-guard.test.cjs exits 0; node ~/.claude/aoforge/bin/aof-tools.cjs changelog check Unreleased prints `"ok": true`</verify>
  <done>The guide and the site guide describe the shipped detection and locations, that the daemon runs exactly what the hook hands off, and that `-y` without `-P` is handed off; no known-limitation bullet or hook-table row describes a fixed bug; the changelog records the gap closure, the daemon allowlist change and the `-y` change.</done>
  <recovery>If doc-refs flags a command in the new text, copy the exact form from the SUMMARYs (`aof-tools doctor --global --fix`, `aoforge-watch stop`).</recovery>
</task>

<task type="auto">
  <name>Task 3: CLAUDE.md, HOOK_DOCS and the generated data; final suite</name>
  <files>CLAUDE.md, scripts/gen-docs-data.cjs, site/data/aoforge.json</files>
  <action>
CLAUDE.md: add check 17 (`user-dot-dir`) to the Doctor bullet (line 66); in the Rename shims bullet (line 69) say
`findProjectRoot` never returns $HOME, `userDotFile` reads the runtime home first, and name `watchStateDir` /
`resolveUserFile`; rewrite the gate-interactive bullet (line 134): invocation-aware on `shell-words.parseCommand`
(quoted text and heredoc bodies are data, a heredoc fed to a shell is read), flags and reasons per call, read-only key
forms pass and `-y` without `-P` is handed off, the matcher lives in `interactive-commands.cjs` and the daemon's
built-in allowlist uses it too, daemon read through watcher-state; drop the "known false positives" sentence. Update HOOK_DOCS
`'gate-interactive.js'` the same way (drop "It matches the raw command text ..."), run `npm run docs:data`, then the
docs guards and the full suite. Commit `docs(73-14): align CLAUDE.md and docs data with the gap closure`.
  </action>
  <verify>npm run docs:data exits 0; node --test plugins/aoforge/aoforge/bin/lib/hook-inventory.test.cjs exits 0; npm test shows no new failures against the 73-VERIFICATION baseline plus the tests 73-09 to 73-13 added</verify>
  <done>CLAUDE.md, HOOK_DOCS and the site data agree with the shipped hooks and checks; the full suite is green.</done>
  <recovery>If `npm run docs:data` changes unrelated entries, keep the regenerated file as is (generated output) and list the extra entries in the SUMMARY.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test   (full suite before the last commit; if micro.test.cjs hangs on commit signing, use node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs')</test>
<lint>not_available</lint>
<build>not_available (docs:build needs Hugo and is not part of this gate)</build>
</validation_gates>

<verification>
- `rg -n "gate-interactive false positives|Has known false positives" docs/USER-GUIDE.md` finds nothing; `rg -n "user-dot-dir" docs/USER-GUIDE.md CLAUDE.md` finds the doctor rows.
- `rg -n -i "allowlist" CHANGELOG.md site/content/docs/guides/handoff.md` finds the new daemon-allowlist bullet and the "Allowlist and deny list" paragraph saying the daemon runs exactly what the hook hands off.
- `rg -n -F '~/.aoforge/defaults.json' plugins/aoforge/aoforge/workflows/settings.md` finds nothing.
- `rg -n "A known gap" site/content/docs/guides/handoff.md` finds nothing.
- `git diff --stat` for this TRD touches only the files in `files_modified`.
- Full suite: no new failures.
</verification>

<success_criteria>
- A reader of the guide, the site or CLAUDE.md learns the behaviour that shipped: where AOForge keeps user and watcher
  files, that $HOME is never a project, what gate-interactive matches, and how to clear a leftover `~/.aoforge/`.
- No fixed bug is still documented as a known issue.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/73-handoff-gaps-and-result-injection/73-14-SUMMARY.md` (through
`aof-tools summary post`).
</output>
