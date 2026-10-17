---
objective: 79-reconcile-and-release-3-1-0
trd: "05"
type: standard
wave: 2
depends_on: ["79-01"]
files_modified:
  - .aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-VERIFICATION.md
  - .aoforge/STACK.md
  - plugins/aoforge-stack-flutter/profiles/flutter.md
  - plugins/aoforge-stack-flutter/profiles/dart.md
  - "plugins/aoforge/aoforge/bin/lib/stack-profiles-content.test.cjs (only if the profile wording change needs it)"
autonomous: true
requirements: [SC-3]
must_haves:
  truths:
    - "75-VERIFICATION.md's Requirements Coverage row for EST-11 no longer says SATISFIED: it reads NOT SATISFIED with the honest reason (verdict not met, the report and the follow-up todo), matching 75-01-SUMMARY (`requirements-completed: []`, 'reported, not met') and REQUIREMENTS.md (unticked, trace row 'Not met'); a dated correction note names objective 79"
    - "`requirements-agreement.repo.test.cjs` and `validate-requirements.test.cjs` pass with no change to their code, and `aof-tools validate requirements --raw` reports no finding (W065 gone)"
    - "`.aoforge/STACK.md` carries the 78-12 proposal: id and title `aoforge-claude`, the Layout naming `plugins/aoforge/`, `aoforge/bin/aof-tools.cjs`, `aoforge/bin/lib/*.cjs` and the `~/.claude/aoforge` mirror, the stack packs' directories, fixtures under `aoforge/bin/lib/__fixtures__/`, and the current test globs with the named watcher-shell exclusion; `aof-tools stack validate` passes"
    - "The Flutter and Dart pack profiles no longer say they are bundled with core: they name the aoforge-stack-flutter pack as their home"
  artifacts:
    - path: .aoforge/STACK.md
      provides: "the project stack profile under the AOForge names"
      contains: "aoforge-claude"
  key_links:
    - from: "75-VERIFICATION.md Requirements Coverage"
      to: "plugins/aoforge/aoforge/bin/lib/requirements-agreement.cjs"
      via: "a row counts only when it says SATISFIED and not NOT SATISFIED"
      pattern: "NOT SATISFIED"
---

# TRD 79-05: Fix objective 75's EST-11 record at its source, and adopt the stack-profile text left from 78-12

<objective>
Two repo tests have failed since objective 75 (on 3a7dd445 and in every objective 78 run): the repository's own W065
finding. 75-VERIFICATION.md marks EST-11 SATISFIED ("as an honest report; verdict not met") while 75-01's SUMMARY,
correctly, lists no completed requirement and REQUIREMENTS.md leaves EST-11 unticked as not met. The record that is wrong
is the VERIFICATION row: EST-11 was not met. Correct that row through the planning verb, and the tests pass with no code
change. Then fold in the small text items left open: `.aoforge/STACK.md` still describes the pre-rename layout (78-12
proposed the edit for the user, who asked for it to be folded into this objective), and the Flutter and Dart profiles
still say they are bundled with core although objective 77 moved them into the stack pack.

Purpose: SC-3 ("the two pre-existing requirements-agreement failures are fixed at their source") and the stale text.
Output: a corrected VERIFICATION, STACK.md, two profile edits, a SUMMARY.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-VERIFICATION.md
@.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-01-SUMMARY.md
@.aoforge/STACK.md

Facts (checked at planning):
- Failing now: `requirements-agreement.repo.test.cjs` test 11 (`actual: [{objective: '75-prospective-estimate-retest-and-todo-sweep', requirement: 'EST-11', verification: '75-VERIFICATION.md', ...}]`)
  and `validate-requirements.test.cjs` test 9 (`['75-prospective-estimate-retest-and-todo-sweep:EST-11']`).
- The rule (requirements-agreement.cjs): a Requirements Coverage row counts when its remaining cells say SATISFIED and do
  not say NOT SATISFIED or PARTIALLY SATISFIED; each counted ID must be in some SUMMARY's `requirements-completed`.
- 75-VERIFICATION.md line ~32: `| EST-11 | SATISFIED (as an honest report; verdict not met) | REQUIREMENTS.md line 19 unticked with "not met" note and trace row pointing to report and follow-up todo. |`
- Planning writes go through verbs: `planning draft <rel>` gives a draft seeded with the current file; `verification post
  <objective> --from <draft> [--file <name>]` writes it (local mode: the file, byte for byte). Never Edit the file under
  `.aoforge/` directly.
- `.aoforge/STACK.md` today: `id: devflow-claude`; Layout "The plugin lives in `plugins/devflow/`. `devflow/bin/df-tools.cjs`
  is the CLI ... call the `~/.claude/devflow` MIRROR"; Testing names `devflow/bin/lib/__fixtures__/` and an exclusion
  command for `micro.test.cjs` over `plugins/devflow/**` globs.
- 78-12's proposal (adopted here by the user's direction for objective 79, 2026-10-17; this is the reviewed text the
  executor rule "never write STACK.md yourself" defers to, not a discovered command): id/title `aoforge-claude`; "The
  plugin lives in `plugins/aoforge/`. `aoforge/bin/aof-tools.cjs` is the CLI; its internals are CommonJS modules in
  `aoforge/bin/lib/*.cjs` ... call the `~/.claude/aoforge` MIRROR"; fixtures under `aoforge/bin/lib/__fixtures__/`; the
  test command over the current globs. Since 78-12, the merge added `plugins/aoforge-stack-*/**/*.test.cjs` to
  `npm test`, and the local exclusion that matters is `watcher-shell.test.cjs` (its W-3 fish-shell test hangs on this
  machine), not micro.test.cjs (78-12 ran it without a hang).
- `plugins/aoforge-stack-flutter/profiles/flutter.md` line ~51: "Tier-2 profile, bundled with AOForge
  (`aoforge/stack-profiles/flutter.md`)."; check dart.md for the same sentence.
</context>

<embedded_context>

<codebase_examples>
STACK.md frontmatter stays schema 1; only `id` and `provenance.reviewed` change there:
```yaml
schema: 1
id: aoforge-claude
extends: general
...
provenance:
  reviewed: "2026-10-16"
```
Layout body (keep the `<!-- inherit -->` marker the file already uses above each section).
</codebase_examples>

<anti_patterns>
- Editing requirements-agreement.cjs or the two tests to make EST-11 pass. The data was wrong; the checker was right.
- Ticking EST-11 or listing it in a SUMMARY's `requirements-completed`. It was not met (75-RETEST-REPORT.md).
- Changing any other row, score or verdict of 75-VERIFICATION.md.
- Writing `.aoforge/` files with Edit/Write directly (use `planning draft` + `verification post`; STACK.md is the one
  file the edit gate allows directly, and only because the user adopted the text).
- Inventing a mirror path for the pack profiles: read `plugins/aoforge-stack-flutter/hooks/sync-pack.cjs` for it.
</anti_patterns>

<error_recovery>
- `verification post` rewrites more than the row (a formatter): diff the result against the original; if anything
  besides the row and the note changed, restore with a fresh draft and post again with only the intended change.
- `stack validate` rejects the new STACK.md: fix the field it names; keep the commands block unchanged.
- stack-profiles-content.test.cjs asserts the old sentence: update the assertion to the pack wording (record it).
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: Correct the EST-11 coverage row through the planning verb</name>
  <files>.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-VERIFICATION.md</files>
  <action>
RED evidence: `env HOME=$(mktemp -d) node --test plugins/aoforge/aoforge/bin/lib/requirements-agreement.repo.test.cjs plugins/aoforge/aoforge/bin/lib/validate-requirements.test.cjs`
(2 failures, the EST-11 ones; record).
`node plugins/aoforge/aoforge/bin/aof-tools.cjs planning draft objectives/75-prospective-estimate-retest-and-todo-sweep/75-VERIFICATION.md`
prints DRAFT. With the Edit tool on DRAFT, change only the EST-11 row's status cell to
`NOT SATISFIED (reported honestly: the prospective retest's verdict is not met; see 75-RETEST-REPORT.md and todo est-11-follow-up-objective-75)`
and add one line under the Requirements Coverage table:
`Corrected 2026-10-16 (objective 79, TRD 79-05): this row said SATISFIED while 75-01-SUMMARY and REQUIREMENTS.md record EST-11 as not met; validate requirements (W065) flagged the disagreement.`
Publish: `node plugins/aoforge/aoforge/bin/aof-tools.cjs verification post 75 --from <DRAFT> --file 75-VERIFICATION.md`
(check `verification --help` for the exact flags first). Then `git diff --stat` must show only that file with a few
lines. Commit (if the verb did not): `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "docs(79-05): EST-11 is not met in 75-VERIFICATION, matching its SUMMARY and REQUIREMENTS" --files .aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-VERIFICATION.md`.
  </action>
  <verify>
- `env HOME=$(mktemp -d) node --test plugins/aoforge/aoforge/bin/lib/requirements-agreement.repo.test.cjs plugins/aoforge/aoforge/bin/lib/validate-requirements.test.cjs` exits 0
- `node plugins/aoforge/aoforge/bin/aof-tools.cjs validate requirements --raw` reports no finding
- `git diff HEAD~1 --stat` (or the verb's commit) touches only 75-VERIFICATION.md
  </verify>
  <done>The two pre-existing failures pass because the record now tells the truth; no code or test changed.</done>
  <recovery>If another objective's row also fires once EST-11 clears, record it and fix it the same way only if its SUMMARY and REQUIREMENTS agree it was not met; otherwise return the case.</recovery>
</task>

<task type="auto">
  <name>Task 2: STACK.md under the AOForge names, and the pack profiles' home</name>
  <files>.aoforge/STACK.md, plugins/aoforge-stack-flutter/profiles/flutter.md, plugins/aoforge-stack-flutter/profiles/dart.md</files>
  <action>
STACK.md (the adopted 78-12 proposal, updated for the merge): `id: aoforge-claude`, `provenance.reviewed: "2026-10-16"`,
title `# Stack Profile: aoforge-claude`. Layout: "The plugin lives in `plugins/aoforge/`. `aoforge/bin/aof-tools.cjs` is
the CLI; its internals are CommonJS modules in `aoforge/bin/lib/*.cjs` using synchronous fs. Skills and agents call the
`~/.claude/aoforge` MIRROR, not this checkout. Stack-specific procedure lives in the stack packs
`plugins/aoforge-stack-flutter/` and `plugins/aoforge-stack-web/`. See CLAUDE.md \"Architecture\"." Testing: `node --test`
against `*.test.cjs`/`*.test.js` adjacent to the source; fixture factories in `aoforge/bin/lib/__fixtures__/` (and
`hooks/__fixtures__/`) build mkdtemp projects and fake homes; tests never read the real `~/.claude`. The full suite is
`npm test` (globs `plugins/aoforge/**/*.test.cjs`, `plugins/aoforge-stack-*/**/*.test.cjs`, `plugins/aoforge/**/*.test.js`,
`scripts/**/*.test.cjs`); on a machine with fish installed `watcher-shell.test.cjs`'s W-3 test hangs: run the same globs
from `git ls-files` minus that file. Keep the commands block as is. (Edit tool on `.aoforge/STACK.md` directly: the edit
gate allows it, and this text is user-adopted.)
Profiles: read `plugins/aoforge-stack-flutter/hooks/sync-pack.cjs` for where the pack mirrors its profiles; replace
"bundled with AOForge (`aoforge/stack-profiles/flutter.md`)" with the pack wording, e.g. "Tier-2 profile shipped by the
`aoforge-stack-flutter` stack pack (`plugins/aoforge-stack-flutter/profiles/flutter.md`; the pack's SessionStart hook
mirrors it to <path from sync-pack.cjs>)"; the same for dart.md if it carries the sentence.
Checks: `node plugins/aoforge/aoforge/bin/aof-tools.cjs stack validate`, `... stack resolve` (id aoforge-claude, gates
unchanged), `env HOME=$(mktemp -d) node --test plugins/aoforge/aoforge/bin/lib/stack-profiles-content.test.cjs plugins/aoforge/aoforge/bin/lib/stack-profile.test.cjs plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs`.
Commit: `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "docs(79-05): STACK.md and the pack profiles name the AOForge layout" --files .aoforge/STACK.md plugins/aoforge-stack-flutter/profiles/flutter.md plugins/aoforge-stack-flutter/profiles/dart.md`
(add stack-profiles-content.test.cjs only if you had to change it).
  </action>
  <verify>
- `rg -n -e "devflow" -e "df-tools" .aoforge/STACK.md` prints nothing
- `rg -n "bundled with" plugins/aoforge-stack-flutter/profiles` prints nothing
- `node plugins/aoforge/aoforge/bin/aof-tools.cjs stack validate` exits 0 and the three tests pass
  </verify>
  <done>STACK.md and the pack profiles describe the tree as it is in 3.1.0.</done>
  <recovery>If `stack resolve` output changes beyond `id` and provenance (a gate or command moved), revert to the previous commands block and keep only the text change.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test (scoped: node --test plugins/aoforge/aoforge/bin/lib/requirements-agreement.repo.test.cjs plugins/aoforge/aoforge/bin/lib/validate-requirements.test.cjs plugins/aoforge/aoforge/bin/lib/stack-profiles-content.test.cjs)</test>
</validation_gates>

<verification>
- The two known failures pass with no code change; W065 is gone; STACK.md and the profiles are current.
</verification>

<success_criteria>
- The repository's own records agree about EST-11, and its stack profile describes the AOForge tree.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/79-reconcile-and-release-3-1-0/79-05-SUMMARY.md` through
`node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post`.
</output>
