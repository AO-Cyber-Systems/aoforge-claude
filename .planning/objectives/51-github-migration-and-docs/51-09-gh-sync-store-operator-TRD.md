---
objective: 51-github-migration-and-docs
trd: "09"
type: standard
wave: 5
depends_on: ["51-07"]
files_modified:
  - plugins/devflow/skills/gh-sync/SKILL.md
  - plugins/devflow/skills/flow/SKILL.md
  - plugins/devflow/skills/sync-roadmap/SKILL.md
  - plugins/devflow/skills/help/SKILL.md
  - plugins/devflow/devflow/templates/global-claude-md.md
  - README.md
  - plugins/devflow/devflow/bin/lib/gh-sync-skill.repo.test.cjs
autonomous: true
requirements: [GMD-03]
must_haves:
  truths:
    - "`/devflow:gh-sync` keeps its name and is the operator skill for the GitHub store: its objective says GitHub is the system of record when `github.store` is on; modes `migrate [--dry-run]`, `status`, `flush`, `pull`, `setup [--apply]`, `release <tag>`, and `<objective>|--all` documented as mirror mode (store off only)"
    - "`migrate` shows the plan first (`df-tools planning import --dry-run` and `df-tools upgrade --check --only 0011`), asks the user for explicit approval, then runs `df-tools upgrade --apply --only 0011 --confirm`, and explains resume, the hourly budget, the gh-flush hook and the branch + logged-escape commit"
    - "No step tells the agent to commit `.planning/.gh-mapping.json` or hand-write planning files in store mode; `DEPRECATION_MAP` and `REMOVED_COMMANDS` are unchanged"
    - "The flow chains say `flush the outbox` in store mode, and ship-and-release uses the real mode `release <tag>`; README's GitHub bullet names `gh sync --all` (not the deprecated alias) and states the store model"
    - "doc-refs, planning-writes, df-tools-deprecations and route-intent tests stay green"
  artifacts:
    - path: plugins/devflow/skills/gh-sync/SKILL.md
      provides: "store operator skill"
    - path: plugins/devflow/devflow/bin/lib/gh-sync-skill.repo.test.cjs
      provides: "pins the repurposed modes and the absence of the mapping-commit step"
  key_links:
    - "Wraps 51-06/51-07 migration 0011 and 51-05 planning import --dry-run"
---

# TRD 51-09: repurpose `/devflow:gh-sync` as the store operator skill (GMD-03)

<objective>
Keep `/devflow:gh-sync` (user decision: repurpose in place, no rename) and make it the way users migrate a project onto GitHub and
operate the store: migrate with a dry-run first, status, flush, pull, setup, release. Fix the skills and docs that describe the old
one-way mirror as the main path.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: a small repo test pins the skill contract first (`test(51-09): ...`), then the rewrite (`docs(51-09): ...`).
- Read 51-05..51-08 SUMMARYs first: document the shipped commands, flags and exit behaviour, not this plan's guesses.
- Only commands that exist (doc-refs). No direct planning-write instructions in skills (planning-writes audit); a read-only or
  explanatory line takes `<!-- planning-audit: allow <reason of 20+ chars> -->`.
- Do not touch `skill-route.cjs` (`DEPRECATION_MAP`, `REMOVED_COMMANDS`), `workflows/help.md`'s rename table or `route-intent.js`.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.

## Decisions

- **Mode table** (gh-sync): `migrate [--dry-run]` → shows the plan via `df-tools planning import --dry-run` and
  `df-tools upgrade --check --only 0011 --raw`; with no `--dry-run`, asks (AskUserQuestion) before `df-tools upgrade --apply --only 0011
  --confirm`; on a non-zero exit with the pending refusal, reports "N ops remain; re-run `/devflow:gh-sync migrate` later or keep
  working (the gh-flush hook drains it)". `status` → `gh status` + `gh outbox status` + `validate health` W057-W061 lines.
  `flush` → `gh outbox flush`. `pull` → `gh pull --all`. `setup [--apply]` → `gh setup` (with the P7 ordering note: migrate, commit via
  PR, merge the workflow PR, then require checks). `release <tag>` → `gh sync-release`. Mirror mode (store off): `<objective>|--all`
  → `gh sync`.
- **Commit after migrate**: print the steps the migration returns (branch, `DEVFLOW_SKIP_GH_GATE=1 ... df-tools commit ... --files
  .gitignore .planning/`, push, PR); never run a raw `git commit`.
- **Description/triggers**: add "migrate to github", "move planning to github", "github store", "flush the outbox".
- **flow** (L74-79): build-and-sync / verify-and-sync say "in store mode this flushes the outbox; with the store off it mirrors";
  ship-and-release uses `/devflow:gh-sync release {tag}`.
- **global-claude-md.md** L22: `GitHub store (migrate, status, flush, setup, release) → /devflow:gh-sync`. Check
  `global-upgrade` tests that pin the template text and update them in the RED commit if needed.
- **README** L42: one sentence: opt-in GitHub store (system of record), `gh sync --all` mirror for store-off projects, migrate with
  `/devflow:gh-sync migrate`.

## Test list

1. `gh-sync-skill.repo.test.cjs`: the skill's argument-hint lists `migrate`, `status`, `flush`, `pull`, `setup`, `release`.
2. Same test: the skill never contains `.gh-mapping.json` inside a commit instruction (regex over lines with `commit`), and contains
   `upgrade --apply --only 0011 --confirm` and `planning import --dry-run`.
3. Same test: every `/devflow:gh-sync <mode>` mention in `skills/flow/SKILL.md` uses a mode from the hint.
4. Existing guards green: doc-refs, planning-writes, df-tools-deprecations, devflow-workflows repo tests; route-intent hook tests;
   global-upgrade tests.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: pin the skill contract, rewrite gh-sync (tests 1-2)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-sync-skill.repo.test.cjs, plugins/devflow/skills/gh-sync/SKILL.md</files>
  <action>
RED: tests 1-2; commit `test(51-09): gh-sync is the store operator skill`.
GREEN: rewrite SKILL.md (frontmatter description/argument-hint/allowed-tools incl. AskUserQuestion; `<objective>` mode table;
`<process>` per mode; drop the mapping-commit step). Keep it under ~120 lines. Commit
`docs(51-09): repurpose /devflow:gh-sync as the GitHub store operator`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-sync-skill.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs</verify>
  <done>Tests 1-2 pass; audits green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: flow, sync-roadmap, help, global template, README (tests 3-4)</name>
  <files>plugins/devflow/skills/flow/SKILL.md, plugins/devflow/skills/sync-roadmap/SKILL.md, plugins/devflow/skills/help/SKILL.md, plugins/devflow/devflow/templates/global-claude-md.md, README.md, plugins/devflow/devflow/bin/lib/gh-sync-skill.repo.test.cjs</files>
  <action>
RED: test 3; commit `test(51-09): flow chains use real gh-sync modes`.
GREEN: edits per Decisions; sync-roadmap L67 `df:gh-sync` → `/devflow:gh-sync`; help skill lists `migrate` where gh-sync modes are
enumerated. Commit `docs(51-09): store-mode wording in flow, help, README and the global template`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-sync-skill.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/df-tools-deprecations.repo.test.cjs plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs</verify>
  <done>Tests 3-4 pass; `rg -n "sync-objectives" README.md` is empty.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `skills/gh-sync/SKILL.md` (98 lines): current frontmatter L1-10, modes L12-22, process from L28 (step 3 commits the mapping).
- `skills/flow/SKILL.md` L17, L28, L74-79 (chains). `skills/sync-roadmap/SKILL.md` L67. `templates/global-claude-md.md` L22.
- `README.md` L42 (deprecated `gh sync-objectives`).
- `skill-route.cjs` L109, L134, L139 (rename sources; unchanged).
</codebase_examples>
<anti_patterns>
- Renaming or retiring the skill; adding a `DEPRECATION_MAP` entry.
- Instructions to edit `.planning/` files directly or run raw `git commit`.
</anti_patterns>
<error_recovery>
- If the route-intent hook test keys on the gh-sync description text, keep the old trigger phrases and add the new ones.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-sync-skill.repo.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/df-tools-deprecations.repo.test.cjs</regression>
</validation_gates>

<verification>
- GMD-03 (skill half): gh-sync repurposed, flow/README/template consistent, rename maps untouched, doc tests green.
</verification>

<success_criteria>
A user types `/devflow:gh-sync migrate`, sees the plan and its cost, approves, and is told exactly how to resume and commit.
</success_criteria>

<output>
After completion, create `.planning/objectives/51-github-migration-and-docs/51-09-SUMMARY.md` (via `summary post 51-09 --from <file>`)
</output>
