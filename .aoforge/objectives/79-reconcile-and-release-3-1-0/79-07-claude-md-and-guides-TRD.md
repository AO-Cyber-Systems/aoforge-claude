---
objective: 79-reconcile-and-release-3-1-0
trd: "07"
type: standard
wave: 3
depends_on: ["79-02", "79-03", "79-04", "79-05"]
files_modified:
  - CLAUDE.md
  - docs/USER-GUIDE.md
  - docs/AOF-TOOLS-REFERENCE.md
  - docs/HOOKS-REFERENCE.md
  - docs/MIGRATING-TO-AOFORGE.md
  - site/content/docs/getting-started/migrating-to-aoforge.md
  - "other site/content/docs/** pages only where they state a 3.0.0 shim as current"
autonomous: true
requirements: [SC-1, SC-3]
must_haves:
  truths:
    - "CLAUDE.md passes main's context budget (at most 200 lines and 20,000 characters, `context-budget.repo.test.cjs` test 1) with main's slim structure, and states the 3.1 facts the integrate line added: single-name compat and the legacy-layout reporting (W066 broken for a legacy-only project, W067, W069; doctor 15/16 report-only, 17 with its fix, 27), retired migrations 0012-0014, `gh rebrand` required on an un-rebranded repository, no pointer plugin, objective 73's handoff delivery hooks, the reconcile guard and the pre-bash equivalence test"
    - "No doc in CLAUDE.md, docs/USER-GUIDE.md, docs/AOF-TOOLS-REFERENCE.md, docs/HOOKS-REFERENCE.md or site/content/docs describes a 3.0.0 shim as working in this release (no 'for one release', no `--only 0012|0013|0014` fix, no pointer plugin as shipped, no pre-rename agent namespace or env prefix accepted)"
    - "The detail CLAUDE.md drops lives in docs/AOF-TOOLS-REFERENCE.md (CLI families) or docs/HOOKS-REFERENCE.md (hooks), which CLAUDE.md links"
    - "context-budget, dispatch-completeness, doc-refs, rename guard and `aof-tools validate docs` pass; the migration guide's site mirror body is identical to docs/MIGRATING-TO-AOFORGE.md"
  artifacts:
    - path: CLAUDE.md
      provides: "resident project guidance within budget"
    - path: docs/AOF-TOOLS-REFERENCE.md
      provides: "the CLI catalogue with the 3.1 facts"
  key_links:
    - from: "CLAUDE.md"
      to: "docs/AOF-TOOLS-REFERENCE.md and docs/HOOKS-REFERENCE.md"
      via: "links for the detail moved out"
      pattern: "AOF-TOOLS-REFERENCE"
---

# TRD 79-07: CLAUDE.md within main's context budget, and the guides on 3.1 facts

<objective>
Main's perf #133 cut CLAUDE.md to 149 lines / 18.5K characters and made a repo test cap it at 200 lines and 20,000
characters, moving detail to `docs/AOF-TOOLS-REFERENCE.md` and `docs/HOOKS-REFERENCE.md`. The integrate line grew its
CLAUDE.md to 229 lines / 47K describing objectives 72-78. Main's new reference docs, written against 3.0.0, still say the
rename shims work "for one release". After 79-01's marker-free union, CLAUDE.md is over budget and the guides contradict
each other. Rewrite CLAUDE.md on main's structure carrying the 3.1 facts, move the detail into the two reference docs,
and make every guide state what 3.1.0 actually does.

Purpose: the docs half of SC-1 (CLAUDE.md, USER-GUIDE union) and the docs gates in SC-3.
Output: CLAUDE.md, the guides, a SUMMARY with before/after sizes and the gate results.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/79-reconcile-and-release-3-1-0/79-01-SUMMARY.md
@.aoforge/objectives/78-remove-the-rename-shims/78-12-SUMMARY.md

Run in your CHECKOUT; tests with an empty `mktemp -d` HOME. 79-06 runs in parallel and owns CHANGELOG, versions and
`site/data`: do not touch them. 79-01 triage rows for tests that read CLAUDE.md or docs/ are yours; the wave-2
SUMMARYs (79-02..79-05) list any docs findings they routed to 79-07.

Sources:
- Main's slim CLAUDE.md: `git show fix/post-77-verification:CLAUDE.md` (149 lines). Its sections: What This Is,
  Commands, Publishing, Architecture (Plugin Layout; Core Tool with families pointing at docs/AOF-TOOLS-REFERENCE.md;
  Skills; Agents; Templates, References, Hooks, Marketplace; Hooks), Context management, Conventions, User-Facing
  Workflow, Intent Model, Where we left off (points at `aof-tools state digest --raw`).
- The integrate side's facts: 78-12's decisions table and its CLAUDE.md edits (Validation W066/W067/W069; Upgrade retired
  0012/0013/0014 and `--global`; Doctor 15/16 report-only, 17 fix, 27; "Rename leftovers"; sync-runtime; coexistence-guard;
  verify-commits; gate-edits; gate-executor-stop; Marketplace without the pointer plugin); objective 73's hooks
  (inject-handoff-results, route-results catch-all, gate-interactive invocation-aware, watch state under the runtime home);
  objective 79's new guard tests (reconcile-guard.repo.test.cjs, pre-bash-equivalence.test.js).
- Stale 3.0.0 statements found at planning in main's docs: docs/AOF-TOOLS-REFERENCE.md line ~15 (validate: W066/W067
  "read for one release; fix --only 0012/0013") and ~28 ("Rename shims (3.0.0, objective 72)" bullet), docs/HOOKS-REFERENCE.md
  ~32 (verify-commits "for one release also the pre-rename namespace's executor") and ~40 (gate-edits, same).
- Gates: `context-budget.repo.test.cjs` (BUDGET.CLAUDE_MD_LINES 200, CLAUDE_MD_CHARS 20000; do not raise them),
  `dispatch-completeness.test.cjs` (backticked command words in CLAUDE.md must be real commands: 78-12 hit this),
  `doc-refs.repo.test.cjs` (stale command references), `rename-guard.repo.test.cjs` (CLAUDE.md and the reference docs
  are not ignore-region files: no pre-rename spelling there), `aof-tools validate docs` (W050-W054).
- docs/USER-GUIDE.md and the two migration-guide files ARE ignore-region files for the rename guard (old spellings only
  inside their regions).
</context>

<embedded_context>

<codebase_examples>
Main's one-line family style in CLAUDE.md (keep this density; detail goes to the reference doc it names):
```markdown
- **GitHub** — `gh sync|pull|outbox|trd|pr|orphans|setup|status|rebrand` (opt-in `github.enabled`; store mode `github.store`). Module family `lib/gh*.cjs`; detail in `docs/USER-GUIDE.md`.
```
A 3.1 fact in the same style (example wording, verify each claim against the 78 SUMMARYs):
```markdown
- **Rename leftovers** (objective 78) — 3.1.0 reads only AOForge names; `lib/planning-layout.cjs` detects a pre-rename layout to report it (W066 broken when only the old directory exists, W067, W069; doctor 27), `lib/legacy-names.cjs` keeps NAMES, LEGACY, PRESERVE and `SHIM_REMOVAL = '3.1.0'`. Detail: `docs/AOF-TOOLS-REFERENCE.md`.
```
</codebase_examples>

<anti_patterns>
- Raising a context-budget cap, or splitting CLAUDE.md into an `@`-included file to dodge the count (the budget is about
  what is resident).
- Dropping a fact instead of moving it: every integrate-side CLAUDE.md fact either stays (one line) or moves to a
  reference doc that CLAUDE.md links.
- Writing a legacy spelling in CLAUDE.md or the reference docs (build the sentence around "the pre-rename name").
- Updating "Where we left off" with PR numbers or branch states that will be stale after the release: point at
  `state digest` as main does, and name only standing open items (OPS-03 deferred, the EST-11 follow-up todo).
- Editing CHANGELOG, versions or site/data (79-06).
</anti_patterns>

<error_recovery>
- Over budget after the rewrite: move the longest family bullets into AOF-TOOLS-REFERENCE.md and keep one line each in
  CLAUDE.md; measure with `wc -lc CLAUDE.md` after every pass.
- dispatch-completeness flags a backticked word that is not a command: un-backtick it (78-12's fix 92539825).
- The migration guide and its site mirror differ: compare bodies with a node script (78-12 found the sed form vacuous on
  macOS), fix the mirror to the guide.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: CLAUDE.md on main's structure, within budget, carrying the 3.1 facts</name>
  <files>CLAUDE.md, docs/AOF-TOOLS-REFERENCE.md, docs/HOOKS-REFERENCE.md</files>
  <action>
Measure first: `wc -lc CLAUDE.md` and run `env HOME=$(mktemp -d) node --test plugins/aoforge/aoforge/bin/lib/context-budget.repo.test.cjs plugins/aoforge/aoforge/bin/lib/dispatch-completeness.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs`
(record the failures: the RED evidence for this task).
Rebuild CLAUDE.md from main's slim version as the skeleton. Into it, as single lines in the matching sections: the
Validation/Upgrade/Doctor facts of 78 (W066-W069 codes, retired 0012-0014 naming the 3.0.x path, doctor 15/16/17/27),
"Rename leftovers" (legacy-names.cjs keeps NAMES, LEGACY, PRESERVE and SHIM_REMOVAL '3.1.0'; planning-layout.cjs detects
the old layout to report it; compat.cjs is single-name; `gh rebrand --apply` is required on an un-rebranded repository),
the Marketplace line without a pointer plugin, objective 73's hook lines (in the Hooks section, brief), and the two new
guard tests in Conventions or Architecture. Where main's skeleton already says something 78 changed, take 78's fact.
Move the integrate side's long family descriptions into docs/AOF-TOOLS-REFERENCE.md (rewrite its "Rename shims (3.0.0)"
bullet as the 3.1 "Rename leftovers" bullet; fix its validate line to W066 broken / W067 / W068 / W069 with the 3.0.x or
manual fixes) and the hook detail into docs/HOOKS-REFERENCE.md (verify-commits and gate-edits: `aoforge:` namespace only;
objective 73's hooks). "Where we left off": main's pointer to `state digest`, plus standing open items only.
Iterate until the three tests pass and `wc -lc CLAUDE.md` is <= 200 lines and <= 20000 characters.
Commit: `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "docs(79-07): CLAUDE.md within the context budget, on 3.1 facts" --files CLAUDE.md docs/AOF-TOOLS-REFERENCE.md docs/HOOKS-REFERENCE.md`.
  </action>
  <verify>
- `wc -lc CLAUDE.md` <= 200 lines and <= 20000 characters
- `env HOME=$(mktemp -d) node --test plugins/aoforge/aoforge/bin/lib/context-budget.repo.test.cjs plugins/aoforge/aoforge/bin/lib/dispatch-completeness.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` passes
- `rg -n -e "for one release" -e "only 001[234]" -e "pointer plugin" CLAUDE.md docs/AOF-TOOLS-REFERENCE.md docs/HOOKS-REFERENCE.md` shows only past-tense removal statements (each listed in the SUMMARY)
  </verify>
  <done>CLAUDE.md fits the budget, says what 3.1.0 is, and links the reference docs that hold the detail.</done>
  <recovery>If the budget cannot be met without losing a fact, keep the fact in the reference doc and a one-line pointer in CLAUDE.md; never raise the cap.</recovery>
</task>

<task type="auto">
  <name>Task 2: USER-GUIDE, the migration guide and site pages on 3.1 facts</name>
  <files>docs/USER-GUIDE.md, docs/MIGRATING-TO-AOFORGE.md, site/content/docs/getting-started/migrating-to-aoforge.md, other site/content/docs pages with stale shim text</files>
  <action>
Sweep: `rg -n -e "for one release" -e "only 0012" -e "only 0013" -e "only 0014" -e "pointer plugin" -e "or a legacy one" -e "one-release" docs/USER-GUIDE.md docs/MIGRATING-TO-AOFORGE.md site/content/docs`.
For each hit: past-tense history (what 3.0.0 did, what 3.1.0 removed) stays; a statement that the shim works now is
rewritten to the 3.1 fact (78-12 decisions table). Read main's USER-GUIDE additions since 3.0.0 (stack packs, model
efficiency, release tooling: `git diff v3.0.0 fix/post-77-verification -- docs/USER-GUIDE.md`) and make sure each still
reads true with 78 (for example a W066 `--only 0012` fix, or a pointer-plugin install note). Keep old spellings only
inside the rename guard's ignore regions. Confirm the migration guide's site mirror body equals the guide body with a
node script (strip the site front matter and the guide's title line, compare), fixing the mirror if they differ.
Run `node plugins/aoforge/aoforge/bin/aof-tools.cjs validate docs --raw` and the rename guard; fix what they report in
these files. Commit: `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "docs(79-07): guides state what 3.1.0 does" --files <files changed>`.
  </action>
  <verify>
- the sweep's remaining hits are past-tense only (listed in the SUMMARY)
- the mirror comparison script prints `identical`
- `node plugins/aoforge/aoforge/bin/aof-tools.cjs validate docs --raw` reports no W050-W054 finding in these files; `env HOME=$(mktemp -d) node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs` passes
  </verify>
  <done>No guide contradicts 3.1.0; the migration guide and its mirror agree.</done>
  <recovery>A page whose correct wording needs a fact you cannot confirm from code or a SUMMARY: leave it, list it in the SUMMARY as an open docs item.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test (scoped: node --test plugins/aoforge/aoforge/bin/lib/context-budget.repo.test.cjs plugins/aoforge/aoforge/bin/lib/dispatch-completeness.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs)</test>
</validation_gates>

<verification>
- CLAUDE.md within 200 lines / 20,000 chars; docs gates green; no doc describes a removed shim as current.
</verification>

<success_criteria>
- Every resident and published doc tells a 3.1.0 reader the same, true story, and CLAUDE.md costs what main budgeted.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/79-reconcile-and-release-3-1-0/79-07-SUMMARY.md` through
`node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post`.
</output>
