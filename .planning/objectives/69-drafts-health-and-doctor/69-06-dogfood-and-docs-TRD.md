---
objective: 69-drafts-health-and-doctor
trd: "06"
type: standard
wave: 3
depends_on: ["69-01", "69-02", "69-03", "69-04", "69-05"]
files_modified:
  - CHANGELOG.md
  - docs/USER-GUIDE.md
  - CLAUDE.md
  - .planning/todos/pending/2026-07-31-harden-df-tools-health-for-tracked-and-stale-skill-active-markers.md
  - .planning/todos/completed/2026-07-31-harden-df-tools-health-for-tracked-and-stale-skill-active-markers.md
autonomous: true
requirements: [TOOL-06, TOOL-09, TOOL-10]
must_haves:
  truths:
    - "On a scratch copy of this repository's `.planning/` (drafts under a scratch TMPDIR), with the repository df-tools: a draft edited after another `doc put` changed PROJECT.md is refused by `doc put` (exit 1, stderr names `df-tools planning draft PROJECT.md`, live sha256 unchanged), `planning draft PROJECT.md` reseeds it (stderr `reseeded`, `<draft>.stale` holds the edit), and the re-applied edit publishes (exit 0)"
    - "In a scratch git repository holding a copy of this repository's `.planning/` with a committed expired marker: `validate health` reports E006 repairable; `validate health --repair` leaves `git status --porcelain` as exactly `D  .planning/.skill-active` with HEAD unchanged; restored, `doctor --fix` (fake HOME) refuses while an unrelated file is staged and, once unstaged, untracks and removes only the marker"
    - "On this repository `validate requirements` reports no finding and `validate health` reports no E006, W064 or W065; on a scratch copy with 58-05, 58-08, 58-09 and 58-10 reverted to `requirements-completed: []`, `validate requirements --objective 58` reports exactly EST-02 and EST-04"
    - "Each of 69-01..69-05 has landed: its last commit is an ancestor of HEAD (`git merge-base --is-ancestor`) and its created files exist at HEAD (`git cat-file -e HEAD:<path>`)"
    - "CHANGELOG [Unreleased], docs/USER-GUIDE.md and CLAUDE.md describe draft reseeding and the stale-draft refusal, E006/W064 and doctor check 23, W065 and `validate requirements`; the skill-active todo is in `.planning/todos/completed/`"
  artifacts:
    - path: CHANGELOG.md
      provides: "[Unreleased] objective 69 paragraph and Added/Changed/Fixed entries"
      contains: "validate requirements"
    - path: docs/USER-GUIDE.md
      provides: "drafts paragraph, E006/W064 and W065 paragraphs, doctor row, command reference, known issues"
      contains: "W065"
    - path: CLAUDE.md
      provides: "Planning verbs, Validation and Doctor bullets updated"
      contains: "validate requirements"
  key_links:
    - from: "69-06-SUMMARY.md evidence table"
      to: "success criteria 1-3"
      via: "one scratch command per criterion with its output"
      pattern: "SC-"
---

# TRD 69-06: Dogfood on scratch copies of this repository, then document (TOOL-06, TOOL-09, TOOL-10)

<objective>
Prove the three success criteria with the repository df-tools on scratch copies of this repository's `.planning/`,
never the live tree, and record the landed state of every TRD (the todo's evidence standard: an ancestor of HEAD and
the files present at HEAD, not just a commit that exists somewhere). Then document the behaviour and complete the
skill-active todo.

Purpose: evidence for verification; documentation. Output: SUMMARY evidence table, CHANGELOG, USER-GUIDE and CLAUDE.md
edits, the todo completed.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/2026-07-31-harden-df-tools-health-for-tracked-and-stale-skill-active-markers.md

Read the five SUMMARYs (`.planning/objectives/69-drafts-health-and-doctor/69-0{1..5}-SUMMARY.md`) for the commits, file
names and any deviation before writing docs.

Docs to edit (read with offset/limit; `rg -n` first):
- `CHANGELOG.md` `## [Unreleased]` (line 7): an objective 68 lead paragraph, then `### Added` / `### Fixed`; add a
  `### Changed` heading if needed, in Keep-a-Changelog order (Added, Changed, Fixed).
- `docs/USER-GUIDE.md`: the `validate`/`doctor` rows of the Command Reference (`rg -n "/devflow:doctor \[" docs/USER-GUIDE.md`,
  ~194, and the `validate` row); **The planning write path (objective 48)** (~1092-1096: `planning draft` "prints a temp
  path seeded with the current file"); the W062 / W063 paragraphs (~599, ~1261) as the model for new code paragraphs;
  **Known issues** (~1402).
- `CLAUDE.md` `### Core Tool` bullets: **Validation** (`validate consistency`, `validate health [--repair]`),
  **Planning verbs** (`planning draft <rel>`), **Doctor** (check list). CLAUDE.md is resident on every turn: one clause
  per change, no paragraphs.

## Binding rules
- No test or source change in this TRD. If dogfood finds a defect, record it in the SUMMARY with the exact command and
  output and stop that criterion; do not patch code here.
- Every dogfood command targets a scratch path from `mktemp -d` (call it S; reuse the literal path, shell variables do
  not survive between calls) via `--cwd`, `--path`, `-C` or `TMPDIR=`. Never the live `.planning/`, never the live
  `.planning/.skill-active` (it holds the running execution's edit gate), never the real drafts tree.
- One plain command per Bash call. Scratch-repo commits need the documented inline prefix:
  `DEVFLOW_ALLOW_RAW_COMMIT=1 git -C <S>/marker -c user.name=dogfood -c user.email=dogfood@example.invalid -c commit.gpgsign=false commit -qm <msg>`.
- Doctor runs use a fake home: `HOME=<S>/home node plugins/devflow/devflow/bin/df-tools.cjs doctor ... --path <S>/marker`,
  so global checks and their fixes never touch the real `~/.claude`.
- Planning writes go through verbs: the todo moves with `df-tools todo complete`, never `mv`.
- `planning-writes.repo.test.cjs` fails CI on docs that tell readers to write `.planning/` directly: describe drafts and
  verbs, not edits.
</context>

<embedded_context>

<codebase_examples>
Dogfood command shapes (repository df-tools; `DF` = `node plugins/devflow/devflow/bin/df-tools.cjs`):

```
SC-1  TMPDIR=<S>/tmp DF --cwd <S>/drafts planning draft PROJECT.md            -> <P>
      (Edit tool: append "dogfood edit A" to <P>)
      TMPDIR=<S>/tmp DF --cwd <S>/drafts doc put PROJECT.md --from <S>/other.md   (other.md = PROJECT.md + "concurrent change B")
      shasum -a 256 <S>/drafts/.planning/PROJECT.md
      TMPDIR=<S>/tmp DF --cwd <S>/drafts doc put PROJECT.md --from <P>             -> exit 1
      shasum -a 256 <S>/drafts/.planning/PROJECT.md                               -> unchanged
      TMPDIR=<S>/tmp DF --cwd <S>/drafts planning draft PROJECT.md                -> stdout <P>, stderr "reseeded"
      cmp <P> <S>/drafts/.planning/PROJECT.md ; grep -c "dogfood edit A" <P>.stale
SC-2  DF --cwd <S>/marker validate health            (E006 repairable: true)
      DF --cwd <S>/marker validate health --repair   (repairs_performed: untrackSkillMarker, removeStaleSkillMarker)
      git -C <S>/marker status --porcelain=v1 ; git -C <S>/marker rev-parse HEAD
SC-3  DF validate requirements --raw                  (this repository: the "agrees" line)
      DF --cwd <S>/req validate requirements --objective 58
```
The expired marker body for SC-2:
`{"skill":"build","started_at":"2026-10-01T00:00:00.000Z","pid":4242,"expires_at":"2026-10-01T08:00:00.000Z"}`.
</codebase_examples>

<anti_patterns>
- Do not dogfood on the live `.planning/` or the live marker; do not `cp` scratch results back.
- Do not run `doctor --fix` with the real HOME.
- Do not describe internal function names in USER-GUIDE; describe commands, codes and behaviour.
- Do not repeat the CHANGELOG text in CLAUDE.md.
</anti_patterns>

<error_recovery>
- The commit gate refuses the scratch-repo commit even with the inline prefix: build the scratch repository with the
  69-02 fixture instead (`node -e` calling `makeMarkerProject({ marker: 'expired', tracked: true })` and printing
  `root`), copy this repository's `.planning/` files into it with `cp -R`, and note the substitution in the SUMMARY.
- `validate health --repair` on the scratch copy performs another repair (not just the marker): the copy differs from
  this repository's healthy state (a planning session found `repairable_count: 0` here on 2026-10-08); record which
  repair ran and remove its cause from the copy before repeating.
- `doctor --fix` with the fake home also applies global fixes (runtime mirror into `<S>/home`): expected; assert only
  the `skill-markers` fix entry and the scratch repository's git state.
</error_recovery>

</embedded_context>

<gotchas>
- The scratch `.planning/` copy may contain this session's live marker or other runtime files: `rm -f <S>/<copy>/.planning/.skill-active`
  before writing the controlled marker, so the copy starts clean.
- The scratch repository has no `.gitignore`, so the marker is "not ignored"; that is fine for the expired case (the
  repair removes it). Use `git add -f` only if you add an ignore rule.
- `validate health` on a scratch copy reports W006 for objectives 70-75 (ROADMAP entries without directories), exactly as
  this repository does; they are not repairable and not part of the evidence.
- In the 58 revert copy, EST-02 is listed by 58-05, 58-08 and 58-10 and EST-04 by 58-09 and 58-10: revert all four
  files or the check (correctly) finds nothing. Scratch-file edits outside the project are not gated; use `sed -i ''` or
  the Edit tool on the scratch path.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Dogfood SC-1..SC-3 on scratch copies and record landed state</name>
  <files>(none in the repository; evidence goes in 69-06-SUMMARY.md)</files>
  <action>
1. `mktemp -d` -> S. `mkdir -p <S>/tmp <S>/home <S>/drafts <S>/marker <S>/req`.
2. SC-1: `cp -R .planning <S>/drafts/.planning`; run the SC-1 sequence in codebase_examples; then re-apply
   "dogfood edit A" to `<P>` and `doc put PROJECT.md --from <P>` (exit 0; the live copy contains both A and B).
3. SC-2: `cp -R .planning <S>/marker/.planning`; `rm -f <S>/marker/.planning/.skill-active`; write the expired marker
   (Write tool, scratch path); `git -C <S>/marker init -q`; `git -C <S>/marker add -A`; commit with the inline prefix.
   Run `validate health` (record E006 and `repairable_count`), then `--repair`, then `git status --porcelain=v1`,
   `git rev-parse HEAD` (unchanged), `git diff --cached --name-only` (only the marker). Then
   `git -C <S>/marker reset -q --hard` (marker tracked again); `HOME=<S>/home DF doctor --json --path <S>/marker`
   (check `skill-markers` error with `details.codes` `["E006"]`; check `validate-health` lists E006 under deferred);
   write `<S>/marker/notes.txt`, `git -C <S>/marker add notes.txt`, `HOME=<S>/home DF doctor --fix --json --path <S>/marker`
   (skill-markers fix refused naming `staged changes present`); `git -C <S>/marker reset -q notes.txt`; run
   `doctor --fix --json` again (skill-markers applied, `changed` `[".planning/.skill-active"]`, notes carry the commit
   command); `git -C <S>/marker status --porcelain=v1` (the marker deletion plus `?? notes.txt`, nothing else from this
   check).
4. SC-3: in this repository `DF validate requirements --raw` and `DF validate health` (no E006/W064/W065; W006 rows are
   expected); `cp -R .planning <S>/req/.planning`; set `requirements-completed: []` in the copy's 58-05, 58-08, 58-09,
   58-10 SUMMARYs; `DF --cwd <S>/req validate requirements --objective 58` (exactly EST-02 and EST-04) and
   `DF --cwd <S>/req validate health` (two W065).
5. Landed state: for each of 69-01..69-05, take the last commit from its SUMMARY, run
   `git merge-base --is-ancestor <sha> HEAD` (exit 0) and `git cat-file -e HEAD:<path>` for each file it created.
6. Write the evidence table into the SUMMARY: criterion, command, exit code, the decisive output line.
  </action>
  <verify>The SUMMARY's evidence table has a row per command in steps 2-5 with its exit code and output, and every expected value above matches.</verify>
  <done>SC-1, SC-2 and SC-3 are each shown by scratch-copy commands; every TRD is an ancestor of HEAD with its files present.</done>
  <recovery>See error_recovery. A criterion that fails is recorded as a defect with its command and output; do not fix code in this TRD.</recovery>
</task>

<task type="auto">
  <name>Task 2: CHANGELOG, USER-GUIDE, CLAUDE.md and the todo</name>
  <files>CHANGELOG.md, docs/USER-GUIDE.md, CLAUDE.md, .planning/todos/pending/2026-07-31-harden-df-tools-health-for-tracked-and-stale-skill-active-markers.md, .planning/todos/completed/2026-07-31-harden-df-tools-health-for-tracked-and-stale-skill-active-markers.md</files>
  <action>
1. CHANGELOG `[Unreleased]`: an objective 69 lead paragraph above objective 68's (TOOL-06, TOOL-09, TOOL-10: drafts
   cannot publish stale content; health and doctor catch a tracked or stale skill marker and a satisfied requirement no
   SUMMARY lists; entries that need an installed plugin take effect once it carries objective 69).
   Added: E006/W064 (`validate health` Check 19, `lib/skill-marker-health.cjs`, `--repair`); W065 (Check 20,
   `lib/requirements-agreement.cjs`); `validate requirements [--objective <N>]`; `doctor-git.checkIgnored`.
   Changed: `planning draft` reseeds a stale draft (base record `<draft>.base.json`, old draft kept at `<draft>.stale`;
   stdout unchanged; `--raw` adds `seeded`/`reseeded`/`stale_copy`); `doc put` refuses a stale draft (exit 1, names
   `planning draft <rel>`); doctor check 23 handles tracked markers and owns E006/W064, check 22 defers them and counts
   only its own repairable issues.
   Fixed: objective 58 SUMMARY frontmatter lists EST-02 and EST-04 (eight files, `requirements-completed` now equals each
   TRD's `requirements`).
2. USER-GUIDE:
   - The planning write path: after "prints a temp path seeded with the current file", add how drafts stay current (base
     record, reseed and `.stale`, the stderr notice) and that `doc put` refuses a stale draft and names the fix; limits:
     only `doc put` checks the base, `--from -` and files outside the drafts tree are not checked, and a draft made
     before objective 69 is judged by mtime.
   - New paragraph **Skill-active marker (E006, W064)** beside the W062/W063 paragraphs: what makes a marker tracked or
     stale (expired, unparseable, no expires_at and older than 8h), the decision table in prose (what `--repair` and
     `doctor --fix` do in each case, the DOC-06 guard, live-and-not-ignored refused), that nothing but the marker is
     touched, the commit command, and that doctor check 23 owns both codes (check 22 defers them).
   - New paragraph **Requirements agreement (W065)**: the rule, the REQUIREMENTS-document scope and why, `validate
     requirements [--objective <N>]`, advisory and never repaired, the fix through `planning draft` + `summary post`.
   - Command Reference: the `validate` row gains `requirements [--objective <N>]`; the `/devflow:doctor` row mentions
     tracked skill markers.
   - Known issues: `hooks/gate-edits.js` still treats an unparseable marker as live (fail open) and never expires a
     marker without `expires_at`; health and doctor remove such markers. Nested `**/.planning/.skill-active` copies are
     not checked. Satisfied IDs outside any REQUIREMENTS document (pre-v1.5 objectives) are not checked.
3. CLAUDE.md: **Validation** gains `validate requirements [--objective N]` and "Check 19 E006/W064, Check 20 W065";
   **Planning verbs** notes `planning draft` reseeds a stale draft (keeps `.stale`) and `doc put` refuses one; **Doctor**
   notes check 23 also catches tracked markers and owns E006/W064 (check 22 defers them).
4. `node plugins/devflow/devflow/bin/df-tools.cjs todo complete 2026-07-31-harden-df-tools-health-for-tracked-and-stale-skill-active-markers`.
5. Run `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs`, then `npm test`.
Commit the docs with `docs(69-06): drafts, skill-marker health and requirements agreement`; the todo move is committed by
`todo complete` or with the docs commit (list both todo paths in `--files`).
  </action>
  <verify>`rg -n "validate requirements" CHANGELOG.md docs/USER-GUIDE.md CLAUDE.md` finds all three files; `rg -n "E006" docs/USER-GUIDE.md CLAUDE.md` finds both; `test -f .planning/todos/completed/2026-07-31-harden-df-tools-health-for-tracked-and-stale-skill-active-markers.md` succeeds; the doc repo tests and `npm test` show no new failure.</verify>
  <done>The docs describe the new behaviour and its limits; the todo is completed; the suite is at baseline.</done>
  <recovery>If doc-refs.repo.test.cjs flags a command reference, the text names a removed or renamed command; use the live names (`validate requirements`, `doctor --fix`, `planning draft`).</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs plugins/devflow/devflow/bin/lib/requirements-agreement.repo.test.cjs</test_scoped>
<!-- lint/typecheck/build: none in the stack profile. Only known environment failures (MA-7 handoff-e2e doctl) may
     remain. If git signing prompts hang micro.test.cjs locally, use
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'. -->
</validation_gates>

<verification>
- SC-1: task 1 step 2 (refusal with the fix named, live unchanged, reseed, publish).
- SC-2: task 1 step 3 (validate health and doctor flag the tracked marker; repair and fix touch only it; the guard
  refuses with an unrelated staged change).
- SC-3: task 1 step 4 (this repository passes; the reverted copy reproduces the 58 EST-02/EST-04 case).
- Landed state: task 1 step 5.
</verification>

<success_criteria>
- Every expected value in task 1 matches and is recorded; docs updated; todo completed; full suite at baseline.
</success_criteria>

<output>
After completion, publish `69-06-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post 69-06 --from <draft>`,
as execute-trd describes (stamp tokens first). Frontmatter `requirements-completed: [TOOL-06, TOOL-09, TOOL-10]`. The
evidence table is the body's first section.
</output>
