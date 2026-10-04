---
objective: 48-planning-write-path-migration
trd: "18"
type: tdd
wave: 5
depends_on: ["48-04", "48-15"]
files_modified:
  - plugins/devflow/agents/verifier.md
  - plugins/devflow/agents/integration-checker.md
  - plugins/devflow/agents/ui-evaluator.md
  - plugins/devflow/agents/security-auditor.md
  - plugins/devflow/devflow/workflows/verify-work.md
  - plugins/devflow/skills/verify-work/SKILL.md
  - plugins/devflow/devflow/workflows/verify-objective.md
  - plugins/devflow/devflow/workflows/diagnose-issues.md
  - plugins/devflow/devflow/workflows/ui-eval.md
  - plugins/devflow/skills/ui-eval/SKILL.md
  - plugins/devflow/devflow/workflows/design-review.md
  - plugins/devflow/skills/design-review/SKILL.md
  - plugins/devflow/devflow/workflows/security-audit.md
  - plugins/devflow/skills/security-audit/SKILL.md
  - plugins/devflow/devflow/templates/UAT.md
  - plugins/devflow/devflow/templates/verification-report.md
  - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/verify.json
autonomous: true
requirements: [GWP-02]
must_haves:
  truths:
    - "The `verify` audit group has zero violations (`verify.json` holds only `_comment`; SC1 repo test green)"
    - "The verifier publishes VERIFICATION through `verification post <objective> --from <draft>` and ticks success criteria / sets status with `objective set-status`; UAT and other objective docs (UAT.md, drift/notes appends) go through `doc put`"
    - "UI/design debt todos raised by verify flows use `todo add --from <draft>`; security-audit reports use `doc put` on their objective-doc path"
    - "No df-tools verb line in these files redirects stderr; local-mode outputs are the same files as before"
  artifacts:
    - path: plugins/devflow/agents/verifier.md
      provides: "verification post / doc put / todo add flows"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/verify.json
      provides: "empty verify-group baseline"
  key_links:
    - "Command lines from 48-15; VERIFICATION in store mode is the sticky `devflow:verification` comment (47-08)"
---

# TRD 48-18: Prose migration — verify, UAT, UI eval, design review, security audit (audit group `verify`)

<objective>
Rewrite the verifier and verification-side workflows so VERIFICATION, UAT, appended notes, follow-up todos and audit reports go through
df-tools verbs. Drive the `verify` group to zero.

Purpose: GWP-02 for verification. Output: prose edits + empty `verify.json`.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<!-- TDD shape for prose: the test is planning-writes.repo.test.cjs (48-04). RED = empty this group's baseline; GREEN = rewrite until green. -->

## Binding rules

- RED first: empty `verify.json`, run the repo test, commit `test(48-18): verify group must have zero planning writes`.
- Every violation in this group is resolved in this TRD — no leftover: rewrite it to the verb, rephrase an explanatory line so it no
  longer reads as a write, or mark a genuinely read-only / runtime / tracked-config line with `<!-- planning-audit: allow <reason> -->` (48-04's
  inline mechanism; never for a real write). The group baseline ends as `{"_comment": ...}` only.
- Targeted `Edit`s; exact 48-15 command lines (`node ~/.claude/devflow/bin/df-tools.cjs ...`). Commit with
  `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. Never port 8080; no real GitHub.

## Rewrite recipe

| Old | New |
|---|---|
| "Write/Create `<obj>-VERIFICATION.md`" | draft → `verification post <objective> --from "$DRAFT"` |
| Tick success-criteria checkboxes / mark objective verified | `objective set-status <id> verifying|complete` (criteria ticks live in the objective issue body; local mode keeps the OBJECTIVE.md edit via `objective put` from a draft) |
| Write/append UAT.md, drift notes, design-review notes in the objective dir | draft (seeded with current content by `planning draft`) → append → `doc put objectives/<dir>/<file> --from "$DRAFT"` |
| "Create a todo file in .planning/todos/pending" for UI/design debt | draft → `todo add --from "$DRAFT"` |
| Security audit report written to the objective dir | draft → `doc put` |
| `template fill verification ...` then edit | continue from a `planning draft` of the filled path |
| verb line with `2>/dev/null` | drop the redirect |

## Test list

1. (RED) repo test fails listing `verify`-group violations once `verify.json` is emptied.
2. After Task 1: `agents/verifier.md` absent from failures; `rg -n "verification post|doc put|todo add" plugins/devflow/agents/verifier.md` shows each used.
3. After Task 2: group clean; repo and doc-refs tests green.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED baseline + verifier and checker agents</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/verify.json, plugins/devflow/agents/verifier.md, plugins/devflow/agents/integration-checker.md, plugins/devflow/agents/ui-evaluator.md, plugins/devflow/agents/security-auditor.md</files>
  <action>
Empty `verify.json`; run; commit RED. Rewrite verifier.md hot spots (48-RESEARCH 1d: L297, 553, 565, 657-662, 752-756) and any write lines in the
three other agents per the recipe. Commit `docs(48-18): verifier publishes through verification post`.
  </action>
  <verify>! node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs 2>&1 | rg -q "agents/(verifier|integration-checker|ui-evaluator|security-auditor)"</verify>
  <done>No agent in this TRD appears in the failure list.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Verify/UI/design/security workflows, skills, templates — group green</name>
  <files>plugins/devflow/devflow/workflows/verify-work.md, plugins/devflow/skills/verify-work/SKILL.md, plugins/devflow/devflow/workflows/verify-objective.md, plugins/devflow/devflow/workflows/diagnose-issues.md, plugins/devflow/devflow/workflows/ui-eval.md, plugins/devflow/skills/ui-eval/SKILL.md, plugins/devflow/devflow/workflows/design-review.md, plugins/devflow/skills/design-review/SKILL.md, plugins/devflow/devflow/workflows/security-audit.md, plugins/devflow/skills/security-audit/SKILL.md, plugins/devflow/devflow/templates/UAT.md, plugins/devflow/devflow/templates/verification-report.md</files>
  <action>
Apply the recipe across the remaining files. Commit `docs(48-18): verification flows use planning verbs`. Run repo + doc-refs tests and record
before/after group counts in the SUMMARY.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs</verify>
  <done>Repo test green with an empty `verify.json`; doc-refs green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- 48-RESEARCH 1d: verifier.md L297, 553, 565, 657-662, 752-756; verify-work.md; diagnose-issues.md (todo files for UI debt).
- 47-08: VERIFICATION is a sticky `devflow:verification` comment on the objective issue in store mode.
</codebase_examples>
<anti_patterns>
- Appending to a cache file with `>>` in Bash: W055 flags it; use a draft + `doc put`.
</anti_patterns>
<error_recovery>
- If a flow appends to VERIFICATION.md across several steps, keep one draft for the whole run and post once at the end.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs</regression>
</validation_gates>

<verification>
- `rg -n "Write.*VERIFICATION" plugins/devflow/agents/verifier.md` → only draft-path lines.
</verification>

<success_criteria>
Verification results, UAT notes, follow-up todos and audit reports reach GitHub (or today's files locally) only through verbs.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-18-SUMMARY.md`
</output>
