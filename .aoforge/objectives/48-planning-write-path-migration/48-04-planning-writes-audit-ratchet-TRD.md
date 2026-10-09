---
objective: 48-planning-write-path-migration
trd: "04"
type: tdd
wave: 2
depends_on: ["48-03"]
files_modified:
  - plugins/devflow/devflow/bin/lib/planning-audit.cjs
  - plugins/devflow/devflow/bin/lib/planning-audit.test.cjs
  - plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/plan.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/execute.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/verify.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/bootstrap.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/work.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/misc.json
autonomous: true
requirements: [GWP-02]
must_haves:
  truths:
    - "SC1 audit: `planning-writes.repo.test.cjs` scans every skill, non-legacy workflow, agent and template and fails, naming file:line, when a planning-file write directive has no df-tools verb within 3 lines and is not in the pinned EXEMPT list"
    - "Ratchet (D-21): per-file violation counts may only go down — `actual[file] <= baseline[file]`, a file absent from every baseline must have zero violations, and a baseline entry above the actual count fails as stale (forcing each prose TRD to lower it)"
    - "Every scanned file belongs to exactly one group (`plan`, `execute`, `verify`, `bootstrap`, `work`, `misc`) by a pinned table, and each group's baseline is its own JSON file so the six prose TRDs (48-16..48-21) edit disjoint files"
    - "Sensitivity controls pass: a synthetic `Write .planning/objectives/01-x/01-01-a-TRD.md` line is 1 finding; the same with `df-tools plan put-trd` within 3 lines is 0; the scanner finds at least one violation in today's `agents/planner.md`"
    - "The suite is green on landing (baselines equal today's counts, measured AFTER 48-03's job-checker.md Dimension 8 edit)"
    - "Inline exemption mechanism for prose TRDs: a line carrying, or directly preceded by, `<!-- planning-audit: allow <reason> -->` (reason >= 20 chars) is not a finding; a marker that suppresses nothing or has a short reason fails the repo test"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/planning-audit.cjs
      provides: "WRITE_VERB_RE, ARTIFACT_RE, VERB_CALL_RE, scanWrites, scanSet, groupOf, GROUPS"
    - path: plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs
      provides: "SC1 ratchet test over the repo's own prose"
  key_links:
    - "Modelled on `doc-refs.repo.test.cjs` (scan set from repo text, EXEMPT table with reasons >= 20 chars matching real paths, legacy workflows skipped by `status: legacy`)"
    - "48-15 adds 'every verb named in prose exists in the df-tools dispatch'; 48-23 deletes the baselines and asserts zero violations"
---

# TRD 48-04: SC1 audit — planning-write ratchet over skills, workflows, agents, templates

<objective>
Land the success-criterion-1 audit first, green, with today's violations pinned per file, so the prose migration in wave 5 is strict TDD:
each prose TRD lowers its group's baseline (RED), then rewrites prose to the verbs (GREEN).

Purpose: GWP-02 / SC1. Output: a pure scanner module with unit tests, the repo test, six group baseline files.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: scanner unit tests (RED) before `planning-audit.cjs` (GREEN); the repo test lands with generated-from-scan baselines
  (the baseline is a measurement of the repo, not test data — write it by running the scanner once and committing the JSON).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Pure scanner: `planning-audit.cjs` takes text in, findings out; the repo test does the fs walk. No gh, no git, never port 8080.
- Keep `hooks/planning-writes.audit.test.js` (hooks writing runtime dotfiles) untouched; it is a different audit.

## Decisions

D-21 (ratchet with per-group baselines). Settled here:

- **Scan set**: `plugins/devflow/skills/*/SKILL.md`, `plugins/devflow/devflow/workflows/*.md` (skip `status: legacy` frontmatter),
  `plugins/devflow/agents/*.md`, `plugins/devflow/devflow/templates/**/*.md`. References are out of scope (explanatory, not instructions);
  say so in the header comment.
- **Write directive** (one finding per line): the line matches a write verb — case-insensitive `\b(write|writes|create|creates|update|
  updates|append|appends|save|saves|edit|fill|overwrite|rewrite)\b`, or `Write(`, `Edit(`, `cat >`, `cat <<`, `>>?\s*\S*\.planning/`, `\btee\b`,
  `sed -i`, `frontmatter (set|merge)`, `template fill` — AND within the same line (<= 80 chars apart for the word forms) an artifact token:
  `TRD`, `SUMMARY`, `VERIFICATION`, `UAT`, `RESEARCH`, `CONTEXT`, `OBJECTIVE.md`, `PROJECT.md`, `REQUIREMENTS`, `ROADMAP`, `STATE.md`,
  `MILESTONES`, `codebase/`, `todos/`, `debug/`, `quick/`, `research/`, `milestones/`, `decisions/`.
- **Satisfied** when a df-tools verb call appears within ±3 lines: `/df-tools(?:\.cjs)?\s+(plan (put-trd|push)|objective (put|set-status|add|insert|complete)|
  summary (post|checkpoint)|verification post|doc put|decision (open|answer)|todo (add|complete)|debug (put|resolve)|quick (put|summary)|milestone (put|complete)|
  planning (draft|import|mode)|state [a-z-]+|roadmap update-job-progress|requirements mark-complete|template fill|gh pull)/`.
  `state`, `roadmap update-job-progress`, `requirements mark-complete` and `template fill` count because they are store-aware since 48-13/48-14;
  `planning mode` counts because a local-only edit guarded by it is correct in both modes (store mode skips it).
- **Not a directive**: lines that are read-only by construction — `Read `, `cat <file>` without redirect, `@~/.claude/...` references — and negations
  (`never write`, `do not write`, `don't edit`) within the same sentence.
- **Groups** (`GROUPS`, pinned table in `planning-audit.cjs`; `groupOf(relPath)`; default `misc`):
  - `plan`: agents/{planner,objective-researcher,job-checker}.md; workflows/{plan-objective,research-objective,discuss-objective,plan-milestone-gaps,
    discovery-objective,list-objective-assumptions}.md; skills/{plan-objective,research-objective,discuss-objective,list-objective-assumptions}; templates/{trd-prompt,objective,research,context,discovery,planner-subagent-prompt}.md
  - `execute`: agents/executor.md; workflows/{execute-objective,execute-trd,transition,build}.md; skills/{execute-objective,build};
    templates/{summary,job-prompt}.md
  - `verify`: agents/{verifier,integration-checker,ui-evaluator,security-auditor}.md; workflows/{verify-work,verify-objective,diagnose-issues,
    ui-eval,design-review,security-audit}.md; skills/{verify-work,ui-eval,design-review,security-audit}; templates/{UAT,verification-report}.md
  - `bootstrap`: agents/{roadmapper,project-researcher,research-synthesizer}.md; workflows/{new-project,new-milestone,complete-milestone,audit-milestone,
    adopt,add-objective,remove-objective}.md; skills/{new-project,milestone,adopt,objective}; templates/{project,milestone,milestone-archive,requirements,roadmap,state,state_archive}.md, templates/research-project/**
  - `work`: agents/debugger.md; workflows/{add-todo,check-todos,quick,micro}.md; skills/{todo,decide,debug,quick,micro}; templates/{DEBUG,debug-subagent-prompt}.md
  - `misc`: every other scan-set file (map-codebase, codebase-mapper, templates/codebase/**, gh-sync, sync-roadmap, status, resume, pause,
    progress, health, help, cleanup, workstreams, settings, ...). 48-21's `files_modified` enumerates each of them, so every group has an owning
    prose TRD that can reach zero.
- **Baseline files**: `__fixtures__/planning-writes-baseline/<group>.json` = `{ "<repo-relative path>": <count> }`, keys sorted, only files with
  count > 0, plus `"_comment"` explaining the ratchet. An empty group file is `{"_comment": "..."}`.
- **EXEMPT**: `[{file, line_contains, reason}]` in the repo test, reason >= 20 chars, each must match a real line (stale exemptions fail).
  Start with the ones the scan forces you to judge as read-only/explanatory (e.g. "never write STACK.md yourself" in executor/codebase-mapper);
  do not exempt real write instructions — those belong in the baseline.
- **Inline allow marker** (the exemption mechanism prose TRDs 48-16..48-21 use, since they do not own the repo test): `<!-- planning-audit: allow
  <reason> -->` on the flagged line or the line directly above it suppresses that one finding. Valid only for lines that are read-only,
  explanatory, or about runtime/tracked-config paths (STACK.md, config.json, `.trd-progress/`); reason >= 20 characters. `scanWrites` returns
  `{findings, allowed:[{line, reason}], badMarkers:[{line, problem}]}`; a marker that suppresses no finding (stale) or has a short reason is a bad
  marker, and the repo test fails on any bad marker.

## Test list

planning-audit (unit, hand-written strings)
1. `Write the TRD to .planning/objectives/01-x/01-01-a-TRD.md` → 1 finding with `artifact:'TRD'`, line 1.
2. Same line with `node ~/.claude/devflow/bin/df-tools.cjs plan put-trd 01 01-01-a-TRD.md --from "$DRAFT"` two lines later → 0 findings; four lines later → 1.
3. `cat > .planning/STATE.md <<EOF` → 1 finding; `cat .planning/STATE.md` → 0.
4. `Never write STACK.md yourself` → 0 (negation); `Do not edit the SUMMARY` → 0.
5. `Read @~/.claude/devflow/templates/summary.md` → 0; `update ROADMAP.md progress` → 1; `node df-tools.cjs frontmatter set .planning/x/OBJECTIVE.md status done` → 1.
6. A finding inside a fenced bash block counts the same as prose.
6a. `Write the SUMMARY.md` preceded by `<!-- planning-audit: allow explanatory example of the old flow -->` → 0 findings, 1 allowed; the same marker
    above a line with no finding → 1 bad marker (stale); a marker with reason `ok` → bad marker (short).
7. `groupOf('plugins/devflow/agents/planner.md') === 'plan'`, executor → execute, verifier → verify, `workflows/new-project.md` → bootstrap, `skills/todo/SKILL.md` → work, `skills/status/SKILL.md` → misc.
8. `scanSet(root)` excludes a workflow with `status: legacy` and includes templates.

planning-writes.repo (repo test)
9. Every finding in a file absent from all baselines fails with `file:line: <text>` (message lists all, not the first).
10. `actual[file] > baseline[file]` fails naming the file and both counts.
11. `baseline[file] > actual[file]` fails as stale ("lower the baseline for <file> to <n>").
12. A baseline key whose `groupOf` differs from the JSON it sits in fails.
13. Sensitivity: the scanner finds >= 1 violation in today's `agents/planner.md` text (read from disk; this assertion flips to `== 0` in 48-16,
    so write it as `if (baseline has planner.md) assert >= 1 else assert === 0`).
14. Every EXEMPT entry matches a real line and has a reason of 20+ characters; the repo scan reports zero bad inline markers.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: planning-audit.cjs scanner (tests 1-8)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-audit.cjs, plugins/devflow/devflow/bin/lib/planning-audit.test.cjs</files>
  <action>
RED: tests 1-8 and 6a (hand-written strings; test 8 uses a temp tree with one legacy workflow, one active workflow, one template).
Commit `test(48-04): planning-write scanner`.
GREEN: implement the regexes, `scanWrites(text) → [{line, text, artifact}]` (window check over ±3 lines of the same text), `scanSet(repoRoot)`
(fs walk of the four globs, legacy skip via frontmatter `status: legacy`), the inline allow-marker parsing, `GROUPS` + `groupOf`. Commit `feat(48-04): planning-write scanner`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-audit.test.cjs</verify>
  <done>Tests 1-8 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Repo ratchet test + six baselines (tests 9-14)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/plan.json, plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/execute.json, plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/verify.json, plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/bootstrap.json, plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/work.json, plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/misc.json</files>
  <action>
Write the repo test first with EMPTY baseline files and run it: it fails listing every current violation (that run is the RED; commit
`test(48-04): SC1 planning-write ratchet (red: no baseline)`). Review the list: move read-only/explanatory lines into EXEMPT with reasons;
everything else goes into the baselines. Generate the six JSON files from the scan with a one-off `node -e` using `planning-audit.cjs`
(do not hand-type counts), commit `test(48-04): pin planning-write baselines` — suite green. Header comment: what counts, the ratchet rule,
which TRDs lower which group (48-16 plan, 48-17 execute, 48-18 verify, 48-19 bootstrap, 48-20 work, 48-21 misc), and that 48-23 deletes the baselines.
Record the per-group totals in the SUMMARY.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-audit.test.cjs</verify>
  <done>Repo test green with pinned baselines; tests 9-14 exercised (9-12 via an injected fake findings/baseline pair in the same file).</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs`: scan set from repo text, EXEMPT with reasons, legacy skip — copy its structure.
- `plugins/devflow/hooks/planning-writes.audit.test.js`: pinned allowlist, failure names file:line.
- Hot spots (48-RESEARCH 1d): planner.md L546/996/1047-1099, executor.md L28/219-231/422/923/1023-1072, verifier.md L297/553/565/657-662/752-756,
  workflows/new-project.md (~33 hits).
</codebase_examples>
<anti_patterns>
- Exempting real write instructions to make the number small: the ratchet's value is that every one is migrated in wave 5.
- One shared baseline file: six parallel prose TRDs would conflict on it.
</anti_patterns>
<error_recovery>
- If the scanner is too noisy (> ~400 findings), tighten the artifact window before adding exemptions; record the final regexes in the SUMMARY.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/planning-audit.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/hooks/planning-writes.audit.test.js</regression>
</validation_gates>

<verification>
- Temporarily adding `Write the SUMMARY.md file` to a scratch copy of `skills/todo/SKILL.md` makes the repo test fail naming that line (do it in the
  test via an injected text, not by editing the skill).
</verification>

<success_criteria>
The repo can no longer gain a direct planning-write instruction, and every existing one is counted against a group that a later TRD must drive to zero.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-04-SUMMARY.md`
</output>
