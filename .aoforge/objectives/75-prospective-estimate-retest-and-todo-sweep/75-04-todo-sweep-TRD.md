---
objective: 75-prospective-estimate-retest-and-todo-sweep
trd: "04"
type: standard
wave: 2
depends_on: ["75-01", "75-02", "75-03"]
files_modified:
  - .aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-TODO-SWEEP.md
  - .aoforge/todos/pending/2026-05-23-clean-up-devflow-dual-install-and-slash-command-naming.md
  - .aoforge/todos/pending/2026-10-08-confirm-verify-commits-js-s-top-level-subagentstop-block-on-a-live-subagentstop-after-the-next-release.md
  - .aoforge/todos/pending/2026-10-08-refresh-justinforme-and-smartwellness-committed-stack-md-lint-to-make-lint.md
  - .aoforge/todos/pending/2026-10-09-add-aoforge-claude-to-the-vanity-mapping-once-git-aocyber-ai-is-configured.md
  - .aoforge/todos/pending/2026-10-09-create-the-aoforge-docs-pages-project-and-deploy-the-docs-from-main.md
  - .aoforge/todos/pending/2026-10-09-fix-0012-failing-after-0002-in-the-same-upgrade-run-then-finish-or-undo-trades.md
  - .aoforge/todos/pending/2026-10-09-keep-the-user-s-untracked-planning-files-out-of-the-upgrade-commit.md
  - .aoforge/todos/pending/2026-10-09-make-migration-0008-gitignore-and-untrack-dup-detect-log-jsonl.md
  - .aoforge/todos/pending/2026-10-09-make-roadmap-reconcile-treat-a-checkpoint-summary-no-self-check-as-incomplete.md
  - .aoforge/todos/pending/2026-10-09-migrate-sub-project-planning-directories-component-planning-below-the-repository-root.md
  - .aoforge/todos/pending/2026-10-09-plan-for-worktree-branches-that-still-have-planning-after-a-repository-moved-to-aoforge.md
  - .aoforge/todos/pending/recalibrate-estimate-minutes-est-08-not-met.md
  - .aoforge/todos/pending/ship-executor-token-stamp-forward-stamp-8-of-41.md
  - .aoforge/todos/pending/est-11-follow-up-objective-75.md
  - .aoforge/todos/completed/2026-05-23-clean-up-devflow-dual-install-and-slash-command-naming.md
  - .aoforge/todos/completed/2026-10-08-confirm-verify-commits-js-s-top-level-subagentstop-block-on-a-live-subagentstop-after-the-next-release.md
  - .aoforge/todos/completed/2026-10-09-make-roadmap-reconcile-treat-a-checkpoint-summary-no-self-check-as-incomplete.md
  - .aoforge/todos/completed/recalibrate-estimate-minutes-est-08-not-met.md
  - .aoforge/todos/completed/ship-executor-token-stamp-forward-stamp-8-of-41.md
autonomous: true
requirements: [TODO-01]
must_haves:
  truths:
    - "Every todo pending when the sweep started has an outcome. Either it was moved to .aoforge/todos/completed by `todo complete`, after a `## Resolution (objective 75)` section citing checkable evidence; or it is still pending with the disposition fields (disposition, disposition_reason, disposition_target, disposition_date, disposition_by) and a `## Disposition (objective 75)` section"
    - "No todo is completed on intent: each completion names a command and its result, or a commit or SUMMARY that proves the work is done"
    - "Each user-deferred item keeps the user's own words in its disposition_reason or Disposition section: the vanity mapping, the aoforge-docs Pages project / OPS-03, and the fleet STACK.md refresh"
    - "75-TODO-SWEEP.md lists every todo at sweep start (stem, created, outcome, evidence or reason, target) and the mechanical SC-4 check's output"
    - "The SC-4 check passes: every file in .aoforge/todos/pending/ has a non-empty `disposition_reason:`"
  artifacts:
    - path: .aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-TODO-SWEEP.md
      provides: "Sweep table and SC-4 check output"
      contains: "disposition_reason"
  key_links:
    - from: each completed todo
      to: "75-02 / 75-03 / 75-01 SUMMARYs, objective 66/67/72 records"
      via: "Resolution section cites the evidence"
      pattern: "## Resolution"
    - from: each still-pending todo
      to: "75-TODO-SWEEP.md row"
      via: "disposition_reason + disposition_target"
      pattern: "disposition_reason"
---

# TRD 75-04: Sweep every pending todo (TODO-01)

<objective>
Give every pending todo an outcome through the existing verbs. A todo whose work is done (by this objective or an
earlier one) is completed with `todo complete`, after its evidence is written into it. Every other todo is explicitly
re-scoped: the reason and the target are written into the todo itself, with a disposition record that a check can read.
Publish a sweep table.

Purpose: SC-4 (`todo list` shows no pending todo without a recorded reason) and TODO-01.
Output: completed todos, re-scoped todos, `75-TODO-SWEEP.md`.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/OBJECTIVE.md
@.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-02-SUMMARY.md
@.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-03-SUMMARY.md

Read narrowly: `75-RETEST-REPORT.md` frontmatter and `## Verdict` only. Each todo file in full (they are 1-9 KB).
`.aoforge/objectives/74-operations-decisions/74-06-SUMMARY.md`: the user's deferral wording.
`.aoforge/objectives/72-install-and-naming-cleanup/72-24-SUMMARY.md`: the vanity deferral wording.

Verbs (repo copy and installed are equivalent for these; use the installed one, `node ~/.claude/aoforge/bin/aof-tools.cjs`):
- `list-todos --raw`: the inventory (JSON `{count, todos:[{file, created, title, area, path}]}`). There is no
  `todo list` subcommand. `/aoforge:todo list` is the skill view.
- `planning draft todos/pending/<stem>.md`: a draft seeded from the current file.
- `todo add --stem <stem> --from <draft>`: local mode rewrites `.aoforge/todos/pending/<stem>.md` with the draft's bytes
  (verified at planning: `writeThrough` overwrites).
- `todo complete <stem>.md`: prepends `completed: <date>` and moves the file to `todos/completed/`.
</context>

<embedded_context>

<codebase_examples>
Disposition record (OBJECTIVE.md "Scope decisions"). These are added to the frontmatter of every todo left pending,
existing keys kept:
```yaml
disposition: re-scoped            # or follow-up (a todo this objective created)
disposition_reason: "<one sentence: why it is not done here, with the user's words when it is their deferral>"
disposition_target: "<where it goes: e.g. 'OPS-03 resume, on the user's go-ahead'>"
disposition_date: 2026-10-10      # the execution date
disposition_by: objective 75 (TODO-01)
```
plus a body section, appended:
```markdown
## Disposition (objective 75, <date>)

<what is done already, with hashes; what remains; why it is not done here; the target; what resuming needs>
```

A completion is recorded first and then moved:
```markdown
## Resolution (objective 75, <date>)

<the evidence: commands with their output lines, commits, SUMMARY paths>
```
then `todo complete <stem>.md`.
</codebase_examples>

<anti_patterns>
- Do not complete a todo because "it is probably done". Run the evidence command, and if it fails, re-scope with the
  failing evidence instead.
- Do not write under `.aoforge/` with Write/Edit/Bash. Only `planning draft` + `todo add --stem --from`,
  `todo complete` and `doc put`.
- Do not perform any deferred or live action: no push, PR, Cloudflare, vanity, fleet repo commit or upgrade, and no
  `doctor --fix`. Re-scoping records; it does not act.
- Do not delete a todo, and do not shorten its body. Append the Disposition or Resolution section; history stays.
- Do not change `title:` (the inventory and the skill view key on it).
</anti_patterns>

<error_recovery>
- `todo add --stem` writes a NEW file instead of overwriting (stem mismatch): `todo add` prints the path it wrote.
  Compare it with the original. On a mismatch, `todo complete` the stray (it is a duplicate), note it, and redo with the
  exact stem (the filename without `.md`).
- A draft is stale (another TRD touched the todo): re-run `planning draft` (it reseeds), and re-apply your section.
- The inventory at sweep start differs from the 14 below (a todo was added since planning): triage each extra with the
  same rules, and list it in the table.
</error_recovery>

</embedded_context>

<gotchas>
- The verify-commits evidence search must tell a real hook block apart from text that merely contains the reason (a
  session that read `verify-commits.js` or this TRD contains the string too). First find a known SubagentStop block
  from `gate-executor-stop.js` (66, "SUMMARY has no tokens_input") in a subagent transcript. Learn the record shape
  Claude Code writes for a Stop/SubagentStop hook's `decision: block` feedback. Then look for that same shape carrying
  the verify-commits reason ("executor produced no commits in the last 10 minutes"). Only hook-feedback records after
  the 3.0.0 install count. The 3.0.0 install was TRD 72-21, about 2026-10-09T13:38Z: read the exact time from its SUMMARY.
- Transcripts live under `~/.claude/projects/-Users-justin-dev-aoforge-claude/` and, before the checkout move (72-26),
  `~/.claude/projects/-Users-justin-dev-devflow-claude/`, including `*/subagents/` subdirectories if present. Use `rg -l
  -F` first, then read only the matching lines (`rg -n -F ... | cut -c1-400`).
- The shipped executor prompt to check is the installed plugin cache copy:
  `~/.claude/plugins/cache/aocyber/aoforge/3.0.0/agents/executor.md`.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Inventory, evidence and completions</name>
  <files>.aoforge/todos/pending/ (the five candidates below), .aoforge/todos/completed/ (the same stems once completed)</files>
  <action>
1. `node ~/.claude/aoforge/bin/aof-tools.cjs list-todos --raw`: save the inventory (expected 13, plus
   `est-11-follow-up-objective-75` if 75-01's verdict was not met). Read each file.
2. Gather evidence, one plain command per call. Then for each todo below whose evidence holds: draft
   (`planning draft todos/pending/<stem>.md`), append `## Resolution (objective 75, <date>)` with the evidence, run
   `todo add --stem <stem> --from <draft>`, then `todo complete <stem>.md`.
   - `2026-05-23-clean-up-devflow-dual-install-and-slash-command-naming`. Evidence: `ls ~/.claude/skills
     ~/.claude/agents` piped to `rg -c '^df-'` prints nothing or 0. `~/.claude/settings.json` `enabledPlugins` has the
     pre-rename plugin `false` and `aoforge@aocyber` `true` (read with `node -e`). `node ~/.claude/aoforge/bin/aof-tools.cjs
     doctor --global --json` (read-only, NO `--fix`) shows check 15 (`legacy-df-install`) ok. REQUIREMENTS INST-01
     Complete. Note in the Resolution that the leftover pre-rename runtime home registers nothing, that doctor check 16
     reports it, and that moving it is the user's own call (CLAUDE.md).
   - `2026-10-08-confirm-verify-commits-js-s-top-level-subagentstop-block-on-a-live-subagentstop-after-the-next-release`.
     Run the transcript search in <gotchas>. Complete only on a hook-feedback record carrying the verify-commits reason
     after the 3.0.0 install, citing the transcript path, timestamp and the retry that followed. Otherwise it goes to
     Task 2 with the search as its evidence (number of transcripts searched, time window, zero qualifying records).
   - `2026-10-09-make-roadmap-reconcile-treat-a-checkpoint-summary-no-self-check-as-incomplete`. Evidence: 75-03
     SUMMARY (fix commit hash, E2E1 pass, analyze before/after identical), together with objective 74's status rule
     (commits 2586fbc4, 8bcf11cc, fea136f9).
   - `recalibrate-estimate-minutes-est-08-not-met`. Evidence: objective 67 recalibrated by a frozen method (EST-10
     Complete, DECISION-003, 67-FREEZE.md: trd_level, window 10, through 66). Objective 75 ran the "next check" this
     todo asks for: the prospective retest on the next objectives, with the run-state estimates
     (`75-RETEST-REPORT.md`, its verdict line quoted). Name `est-11-follow-up-objective-75` as the carrier of any
     further work when it exists.
   - `ship-executor-token-stamp-forward-stamp-8-of-41`. Evidence: `rg -n "tokens stamp"
     ~/.claude/plugins/cache/aocyber/aoforge/3.0.0/agents/executor.md` matches. The repo test that fails without the
     step: `rg -n "tokens stamp" plugins/aoforge/aoforge/bin/lib/tokens-cli.test.cjs`, then name the test. Then
     `node ~/.claude/aoforge/bin/aof-tools.cjs tokens coverage`: paste its first line verbatim (the forward stamp now
     reaches executor SUMMARYs without backfill). EST-09 itself is decided in 75-05; say so.
3. Commit: `aof-tools commit "docs(75-04): complete todos with recorded evidence" --files <every rewritten pending path,
   now removed> <every new completed path> <summary>`. `aof-tools commit` records the removals.
  </action>
  <verify>`ls .aoforge/todos/completed/` lists each completed stem; each has `^completed: ` as line 1 and a `## Resolution (objective 75` section (`rg -n -e '^## Resolution \(objective 75' .aoforge/todos/completed/`); none of them remains in `list-todos --raw`</verify>
  <done>Each todo whose work is verifiably done is completed through `todo complete`, with the evidence inside it.</done>
  <recovery>If an evidence command fails, do not complete. Move that todo to Task 2 and record the failing output as its reason.</recovery>
</task>

<task type="auto">
  <name>Task 2: Re-scope the rest with a recorded reason and target, then publish the sweep table</name>
  <files>.aoforge/todos/pending/*.md (the ones re-scoped below), .aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-TODO-SWEEP.md</files>
  <action>
1. For each remaining pending todo, add the disposition fields and the `## Disposition (objective 75, <date>)` section
   (draft, then `todo add --stem <stem> --from <draft>`). Reasons and targets, to be confirmed against each file:
   - `2026-10-08-confirm-verify-commits-...` (if not completed in Task 1): re-scoped. Reason: no qualifying live
     SubagentStop block has occurred since 3.0.0 was installed (the search counts). The shape is pinned by
     `verify-commits.test.js` and `hook-coexistence.test.js` against the cited schema. Target: observe on the next
     autonomous executor stop with no commit in 10 minutes, any objective.
   - `2026-10-08-refresh-justinforme-and-smartwellness-committed-stack-md-lint-to-make-lint`: re-scoped. Reason: a
     commit in each of two other repositories, which needs the user's per-repository approval (43-ROLLOUT option (c)).
     Objective 75 has no live or cross-repository step. Target: fleet follow-up on the user's approval, then remove the
     two OPEN rows from `stack-fleet-tables.cjs`.
   - `2026-10-09-add-aoforge-claude-to-the-vanity-mapping-once-git-aocyber-ai-is-configured`: re-scoped. Reason: quote
     the user's deferral from the todo ("Defer that until we are completely done - that vanity URL is not configured
     yet."). Target: when git.aocyber.ai is configured and the user resumes it. The vanity mapping is "decided, not yet
     deployed" (global CLAUDE.md).
   - `2026-10-09-create-the-aoforge-docs-pages-project-and-deploy-the-docs-from-main`: re-scoped. Reason: OPS-03,
     deferred by the user on 2026-10-10 in TRD 74-06 ("Skip this for now - we aren't doing this right now."). Target:
     OPS-03 resume on the user's go-ahead. The todo already holds the steps; PR #130 stays open.
   - `2026-10-09-fix-0012-failing-after-0002-...`: re-scoped (remainder). Done: the code fix (75-02 commit hashes).
     Reason it stays: the fix reaches users only with the next plugin release, and redoing trades (and the first
     session in recycling-oracle) needs a release plus the user's per-repository approval. Target: after the next
     release, per-repository approval. Keep the `AOFORGE_SKIP_UPGRADE=1` advice until then.
   - `2026-10-09-make-migration-0008-gitignore-and-untrack-dup-detect-log-jsonl`: re-scoped (remainder). Done: steps 1
     and 2 (75-02 commits and dotfile audit). Remaining: step 3, the fleet (EdenDocs `git rm --cached` with approval;
     devflowops and eden-biz become movable after the release). Target: after the next release, per-repository
     approval.
   - `2026-10-09-keep-the-user-s-untracked-planning-files-out-of-the-upgrade-commit`: re-scoped. Reason: a medium
     change to 0012's `changed` contract, the hook's background commit and `upgrade --check` output, larger than this
     objective's sweep scope. The five held repositories stay held. Workaround: commit or ignore untracked planning files
     before upgrading. Target: an upgrade-hardening objective before the shim removal (the release after 3.0.0).
   - `2026-10-09-migrate-sub-project-planning-directories-...`: re-scoped. Reason: needs a policy decision (migrate
     nested projects, or report them) and a feature, and it blocks `SHIM_REMOVAL`. Target: the same pre-shim-removal
     objective.
   - `2026-10-09-plan-for-worktree-branches-that-still-have-planning-after-a-repository-moved-to-aoforge`: re-scoped.
     Reason: needs a scratch-repository experiment, docs and possibly a helper. Target: the same pre-shim-removal
     objective.
   - `est-11-follow-up-objective-75` (if present): check it already carries all five fields (75-01 created it so).
     Add any missing field.
   Each reason is one sentence in `disposition_reason`; detail goes in the section.
2. Mechanical SC-4 check (read-only `node -e`, not committed): read `list-todos --raw`, open each `path`, extract the
   frontmatter, and print `<file>: OK` or `<file>: MISSING disposition_reason`. Exit 1 on any MISSING. All must be OK.
3. Draft `objectives/75-prospective-estimate-retest-and-todo-sweep/75-TODO-SWEEP.md` (`planning draft`), with:
   frontmatter (`objective`, `type: todo-sweep`, `requirement: TODO-01`, `swept`, `completed`, `re_scoped`,
   `follow_up`, `generated`); a table with one row per todo at sweep start (stem, created, outcome, evidence or reason,
   target); the SC-4 check's output verbatim; and a note that `todo list` is `/aoforge:todo list` / `list-todos`
   (there is no `todo list` subcommand), with the check standing in for "shows no pending todo without a recorded
   reason". Publish with `doc put`.
4. Commit: `aof-tools commit "docs(75-04): re-scope remaining todos with recorded reasons; sweep table" --files
   <re-scoped todo paths> <sweep doc> <summary>`.
  </action>
  <verify>The SC-4 `node -e` check exits 0 with every pending file OK; `rg -c -e '^disposition_reason: .+' .aoforge/todos/pending/` gives 1 per file; `rg -n -e 'type: todo-sweep' .aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-TODO-SWEEP.md` matches; the table's row count equals the sweep-start inventory count</verify>
  <done>No pending todo is without a recorded reason and target. The sweep table accounts for every todo at sweep start.</done>
  <recovery>If a todo does not fit any reason above, decide by the objective's rule (small and in scope: no fix lands in this TRD, so re-scope it with the honest reason), and record the decision in the SUMMARY.</recovery>
</task>

</tasks>

<validation_gates>
<test>not_available for this TRD (planning records only); 75-05 runs npm test</test>
</validation_gates>

<verification>
- Inventory at start = completed + re-scoped + follow-up (counts in the sweep frontmatter add up).
- Every completed todo has a Resolution section with evidence. Every pending todo has a disposition_reason.
- `git log --format=%s -3` shows the two 75-04 commits; no file outside `.aoforge/` changed.
</verification>

<success_criteria>
- SC-4: no pending todo from v1.6 start (or since) is left without a recorded reason. Each was completed through
  `todo complete` or explicitly re-scoped.
</success_criteria>

<output>
After completion, write `75-04-SUMMARY.md` through `node ~/.claude/aoforge/bin/aof-tools.cjs summary post 75-04 --from <draft>`
(after `tokens stamp 75-04 --draft <draft>`). Include the counts, the verify-commits search result, and the SC-4 check
output.
</output>
