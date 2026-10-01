---
objective: 51-github-migration-and-docs
trd: "04"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.cjs
  - plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.test.cjs
autonomous: true
requirements: [GMD-01]
must_haves:
  truths:
    - "With store on and the outbox journal holding pending ops (no blocked or halted), 0010 `detect` returns `applies: false` with a reason naming the backfill resume command `df-tools upgrade --apply --only 0011 --confirm`, so a bare `upgrade --apply --confirm` reaches 0011 instead of halting on 0010 (G4)"
    - "0010 `migrate` called directly still refuses on a pending, blocked or halted journal (unchanged)"
    - "With a blocked or halted journal 0010 `detect` still applies and `migrate` refuses with the existing text"
    - "0010's printed commit follow-up is the store-mode sequence: create a branch, `DEVFLOW_SKIP_GH_GATE=1` commit of `.gitignore .planning/` (logged as gate `gh`), push, open a PR (G6)"
    - "Doctor check 20 prints that escape form only when the project is in store mode; its local-mode text is byte-identical"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.cjs
      provides: "detect defers to an in-progress backfill; STORE_COMMIT_STEPS text"
  key_links:
    - "51-07 hands off to `0010.migrate`; 51-08 tests the bare `--apply --confirm` resume through the runner"
---

# TRD 51-04: 0010 defers to an in-progress backfill; store-mode commit guidance

<objective>
Remove the two traps the research found around migration 0010: the runner halting on 0010 before it reaches 0011 on a resume (G4),
and the printed commit command that store mode refuses on the default branch (G6, also in doctor check 20).
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: `test(51-04): ...` before `feat(51-04): ...`/`fix(51-04): ...`.
- Do not renumber or reorder migrations. 0010 keeps id, title, `since: '2.13.0'`, `safety: 'confirm'`.
- Tests in temp dirs with an injected `userHome`; the journal dir via `DEVFLOW_OUTBOX_DIR` (`hermeticEnv`).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.

## Decisions

- **Detect rule**: inside the store-mode branch of `detect` (L217), before the "applies" result: if the journal has `pending > 0` and
  `blocked === 0` and not `halted` → `{applies:false, reason:'GitHub backfill in progress: N outbox ops pending. Resume it with
  `df-tools upgrade --apply --only 0011 --confirm`, or let the gh-flush hook drain it; 0010 runs after the drain.'}`. Pending
  without an 0011 backfill (an ordinary unflushed write) gets the same deferral: 0010 cannot succeed until the drain anyway, and
  "skipped with a reason" is better than "failed". Reuse `journalBlockers(root)` (L241) data; no gh call.
- **Blocked/halted** keep today's behaviour (applies, migrate refuses) because a human must act.
- **Commit text**: replace `COMMIT_COMMAND` (L67) with `STORE_COMMIT_STEPS`, a short multi-line note:
  `git switch -c devflow-store-cache` / `DEVFLOW_SKIP_GH_GATE=1 DEVFLOW_SKIP_GH_GATE_REASON="store migration" node ~/.claude/devflow/bin/df-tools.cjs commit "chore: gitignore the planning cache (store mode)" --files .gitignore .planning/`
  / `git push -u origin devflow-store-cache` and open a PR. Export the constant (51-07 prints it after 0011). Keep exporting
  `COMMIT_COMMAND` only if another module imports it (grep first); otherwise remove it.
- **Doctor check 20**: `planningMode.isStoreMode(root)` (the only reader of `github.store`) chooses the escape form; local mode
  keeps `COMMIT_COMMAND` exactly (its test constant `COMMIT_CMD` must keep passing).

## Test list

1. 0010 detect, store on, journal with 2 pending ops → `applies:false`, reason contains `--only 0011`.
2. 0010 migrate, same state → still throws/returns the refusal (unchanged text).
3. 0010 detect, store on, a blocked op or halted journal → `applies:true`.
4. 0010 detect, store on, empty journal, cache tracked → `applies:true` (unchanged).
5. 0010 notes after a successful migrate contain `DEVFLOW_SKIP_GH_GATE=1`, `git switch -c` and `--files .gitignore .planning/`.
6. Doctor check 20 in store mode → note uses the escape form; local mode → byte-identical to today's note.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 0010 detect defers on a pending journal (tests 1-4)</name>
  <files>plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.cjs, plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs</files>
  <action>
RED: tests 1-4; commit `test(51-04): 0010 defers to an in-progress backfill`. Check existing 0010 tests that seed a pending journal
and assert `applies:true` from `detect`: if any, they encode the trap; update them in the RED commit with a comment citing G4.
GREEN: the detect rule. Comment `// TRD 51-04 (G4): ...`. Commit `fix(51-04): 0010 detect defers while the outbox has pending ops`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs plugins/devflow/devflow/bin/lib/upgrade.test.cjs</verify>
  <done>Tests 1-4 pass; the rest of the 0010 and upgrade suites unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: store-mode commit guidance (tests 5-6)</name>
  <files>plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.cjs, plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.test.cjs</files>
  <action>
RED: tests 5-6; commit `test(51-04): store-mode commit follow-up`.
GREEN: `STORE_COMMIT_STEPS` in 0010 `notesFor` (L315-323) and the store branch in check 20 (L211). Commit
`fix(51-04): print the branch + logged escape commit in store mode (G6)`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.test.cjs plugins/devflow/devflow/bin/lib/doctor.test.cjs</verify>
  <done>Tests 5-6 pass; doctor suite green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `0010-store-gitignore.cjs`: `COMMIT_COMMAND` L67, `detect` L217, `journalBlockers` L241, `notesFor` L315-323, `migrate` L338,
  `apply` L383, exports L393.
- `doctor-checks/20-legacy-runtime-state.cjs` L36 (`COMMIT_COMMAND`), L211 (note), L228 (export).
- `upgrade.cjs` L430-460: selection and `halted` on a failed apply (why G4 matters).
- 50-13-SUMMARY.md "Open items" (the printed-command hazard).
</codebase_examples>
<anti_patterns>
- Making 0010 detect call into 0011 (circular); reading `github.store` outside `planning-mode.cjs`.
</anti_patterns>
<error_recovery>
- If `upgrade.test.cjs` pins 0010's reason text, update the pin in the RED commit and say so in the SUMMARY.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/upgrade.test.cjs plugins/devflow/devflow/bin/lib/doctor.test.cjs</regression>
</validation_gates>

<verification>
- G4 detect rule (tests 1-3), G6 text (tests 5-6), local parity (test 6).
</verification>

<success_criteria>
A resumed backfill is never blocked by 0010, and every printed commit instruction works in store mode.
</success_criteria>

<output>
After completion, create `.planning/objectives/51-github-migration-and-docs/51-04-SUMMARY.md` (via `summary post 51-04 --from <file>`)
</output>
