---
objective: 71-stack-drafter-and-verify-policy
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/stack-realshape-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/stack-draft.cjs
  - plugins/devflow/devflow/bin/lib/stack-draft.test.cjs
  - plugins/devflow/devflow/bin/lib/stack-classify.cjs
  - plugins/devflow/devflow/bin/lib/stack-classify.test.cjs
autonomous: true
requirements: [SDR-09]
must_haves:
  truths:
    - "For CI evidence holding a `<script> --self-test` step and a step that runs the same script without the flag (same key, same entry point, same cwd), `assembleDraft` fills the key with the gate step and records the self-test as a `self_test` note; this holds at a tier root and in a general root's primary component (cwd kept)"
    - "A self-test with no gate sibling is unchanged: `bash t0-conformance/selftest.sh` (the devcluster golden's offline test) and a lone `./gate.sh --self-test` still fill their key, and a declared row is never filtered"
    - "The realshape `selfTestGateShape` re-drafted with `df-tools stack init` gives `audit: { run: \"bash scripts/vuln-gate.sh\" }` and a `self_test` note"
    - "A task-runner `lint:` target with no prerequisite whose body is the tier default plus one or more UNCONDITIONAL linters of another tool (`buf lint`, `golangci-lint run ./...`) fills `lint` with the target (`make lint`) and carries an info note tagged `declared_linters`; a body whose extra linter has a `||` fallback, or that also runs a non-linter, or a target with a prerequisite, stays inherited as before"
    - "`buf lint` still classifies to nothing (`classifyInvocation('buf lint') === null`), so stack-evidence unitKeys and the mixed-aggregate codegen pick are unchanged; stack-evidence.test.cjs passes unedited"
    - "The realshape suite passes with `protoLintTargetShape` (lint `make lint`), `guardedLinterTargetShape` (lint absent) and `mixedAggregateCodegenShape` re-baselined to `lint: make lint`"
    - "A read-only fleet run of the harness shows, as its only new problems, `justinforme` and `smartWellness` `new conflict: lint` (draft `make lint` against the committed file's inherited `go vet ./...`); dfip stays inherited; the draft for aodex `audit` is `bash scripts/check-govulncheck.sh` (cwd go). Any other new row is narrowed in the rule or explained in the SUMMARY"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/stack-draft.cjs
      provides: "selfTestArgs/sameEntryPoint and the self_test filter in evaluateKey; declaredTarget widened for lint with declared linters, plus the declared_linters info note; header paragraphs for both rules"
      contains: "self_test"
    - path: plugins/devflow/devflow/bin/lib/stack-classify.cjs
      provides: "AUX_LINTERS (closed, frozen: buf lint) and linterToolOf(inv) -> tool | null over CLASSIFY_TABLE lint/lint_* rows and AUX_LINTERS"
      exports: ["linterToolOf", "AUX_LINTERS"]
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/stack-realshape-fixtures.cjs
      provides: "selfTestGateShape, protoLintTargetShape, guardedLinterTargetShape builders and REALSHAPE entries; mixedAggregateCodegenShape expects lint make lint"
      exports: ["selfTestGateShape", "protoLintTargetShape", "guardedLinterTargetShape"]
    - path: plugins/devflow/devflow/bin/lib/stack-draft.test.cjs
      provides: "ST1-ST7 self-test cases, DL1-DL7 declared-linter cases, DT5 re-baselined"
  key_links:
    - from: "stack-draft.cjs evaluateKey"
      to: "selfTestArgs / sameEntryPoint"
      via: "pool filter after the mixed-aggregate filter, before rank()"
      pattern: "self_test"
    - from: "stack-draft.cjs declaredTarget"
      to: "stack-classify.cjs linterToolOf"
      via: "every non-default body invocation must be an unconditional linter of another tool"
      pattern: "linterToolOf\\("
    - from: "stack-drafter-realshape.test.cjs"
      to: "REALSHAPE.selfTestGateShape / protoLintTargetShape / guardedLinterTargetShape"
      via: "table-driven: R1 re-drafts each entry with stack init"
      pattern: "selfTestGateShape"
---

# TRD 71-01: The drafter skips a gate's self-test and keeps a lint target that adds linters (SDR-09)

<objective>
Two drafter limitations the user accepted at the objective 43 decision (`accept-all`, 2026-10-03) and filed as
`.planning/todos/pending/2026-10-03-stack-drafter-self-test-and-buf-lint.md`:

1. **Self-test picked over the gate.** aodex's `go.yml` runs `bash scripts/check-govulncheck.sh --self-test` (fixtures
   only, no govulncheck) and then, in the next step, `go install …govulncheck@latest` plus `bash scripts/check-govulncheck.sh`
   (the real gate). Both reach the drafter as `audit` candidates with the same source (ci), name rank, confidence and cwd,
   so source order picks the self-test. A self-test scans nothing.
2. **buf lint invisible.** justinforme and smartWellness have `lint:` targets running `go vet ./...` then `buf lint`.
   `declaredTarget` (TRD 43-12, narrowing 1) keeps a key-named target only when its WHOLE body is the tier default, so
   these inherit `go vet ./...` and agents never run `buf lint`. dfip's `lint:` adds golangci-lint behind `|| echo …`
   (optional by its own design); the user accepted it at `go vet`.

Add two general rules (no repo names): a self-test step never fills a key while a sibling step runs the same entry
point as the gate; and a `lint:` target whose body is the tier default plus unconditional linters of other tools is the
lint entry point. Success criterion 1 and the first clause of criterion 2. The fleet tables and harness guards are
TRD 71-02.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── __fixtures__/stack-realshape-fixtures.cjs  ← MODIFY (3 builders, 3 REALSHAPE entries, 1 re-baseline)
├── stack-classify.cjs                         ← MODIFY (AUX_LINTERS, linterToolOf)
├── stack-classify.test.cjs                    ← MODIFY (K31 linterToolOf)
├── stack-draft.cjs                            ← MODIFY (self_test filter, declaredTarget widening, header)
└── stack-draft.test.cjs                       ← MODIFY (ST1-ST7, DL1-DL7, DT5 re-baseline)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
Project kind `plugin`, work `feature`: TDD strict (RED, then GREEN, then optional REFACTOR, as atomic commits per task),
test list first, hand-built fixtures (`no_llm_test_data`), no property-based libraries, no `.feature` files. User
playbook (`~/.claude/CLAUDE.md`, TDD & Quality): write the failing test before the implementation, one test at a time,
and watch it fail for the right reason.

Read narrowly (`rg -n` first, then `offset`/`limit`). Line numbers are from planning (HEAD fb2764bd):
- `stack-draft.cjs`: header 1-160 (the walk, declared target, wrapper, dedicated linter and mixed-aggregate paragraphs
  are the models for the two new paragraphs); `ATTACHABLE_KEYS`/`WHOLE_ENTRY_KEYS` 163-171; `linterOf`/`defaultToolOf`
  248-253; `equivalent` 341-345; `nameOf` 348-351; `bare` 359-372; `restatesCommand` 394-399; `declaredTarget` 413-423;
  `wraps` 429-436; `note` 532-543; `evaluateKey` starts ~783; mixed-aggregate filter 827-851; the verify walk 945-985;
  alternates 976-994.
- `stack-classify.cjs`: `is()` 41; lint rows 140-155 (`lint_helm`/`lint_docker` "never the repo-wide lint");
  `buf generate` codegen row 184; `HINT_TOKENS` 348-363; `TOOL_STACKS` (buf is `neutral`) ~1062-1075; `toolStack`
  ~1095-1105 (the `toInvocations` + `LEADING_NOISE` walk to copy); `DEDICATED_LINTERS` 1115-1128; exports 1130-1155.
- `stack-draft.test.cjs`: `GO` tier map 39-47; `ev()` 61-76; DT1-DT5 1695-1760 (DT5 1733-1742 is re-baselined here);
  wrapper W1-W5 1763; dedicated linter L1-L5 1821.
- `stack-classify.test.cjs`: K26 (selftest is a test hint) ~998-1012.
- `stack-evidence.test.cjs` 1404-1484: asserts `` `buf lint` classifies to nothing ``. Do NOT edit it; it must pass.
- `__fixtures__/stack-realshape-fixtures.cjs`: helpers 30-40 (`makeWhole`, `goMod`, `wf`, `mk`, `GO_MAIN`);
  `mixedAggregateCodegenShape` 794-889 (its `lint:` target runs `go vet ./...` + `buf lint`); REALSHAPE entries
  1673-1690 (mixedAggregate) and 1739-1754 (declaredDefaultTargetShape, the model for a tier-root shape); exports
  1792-1806.
- `stack-drafter-realshape.test.cjs` 1-20 (R1/R2 contract: compareDrift(expect, draft) must have NO row outside
  `extraAllowed`, so `expect.commands` lists every key the draft writes; `absent`, `noteTags`, `noteStatuses`).
- Fleet evidence shapes (read-only, already measured while planning): aodex both audit items carry `invokedName:
  'check-govulncheck'`, `runner: 'script'`, `cwd: 'go'`, `source: 'ci'`; justinforme `make lint` has
  `bodyInvocations: ['go vet ./...', 'buf lint']`, `resolvesTo: 'go vet ./...'`, `target.deps: []`; dfip `make lint`
  has `bodyInvocations: ['go vet ./...', 'golangci-lint run || echo "golangci-lint not installed; ran go vet only"']`
  (the `command -v` probe before `&&` is dropped by the body reader; the `||` stays in the text).
</context>

## Test list

Outermost first: the realshape suite (spawned `df-tools stack init` on an invented fixture repo), then `assembleDraft`
in-process, then the classifier. Write and run one at a time.

**Self-test rule (Task 2)**
1. R `selfTestGateShape` (tier root, extends go): CI steps `bash scripts/vuln-gate.sh --self-test` then a block step
   `go install example.invalid/vuln/cmd/govulncheck@latest` + `bash scripts/vuln-gate.sh`; the script's body runs
   `govulncheck -format json ./... > "$TMP"` and a jq filter. Draft `audit: { run: "bash scripts/vuln-gate.sh" }`;
   `noteStatuses.present` includes `self_test`; no other drafted key (expect lists exactly what the draft writes).
2. ST1 tier root, two CI audit items (`invokedName: 'vuln-gate'`, `runner: 'script'`): `--self-test` first, gate
   second -> `commands.audit = { run: 'bash scripts/vuln-gate.sh' }`; one note `{ key: 'audit', status: 'self_test',
   candidate: 'bash scripts/vuln-gate.sh --self-test' }` whose detail names the gate command.
3. ST2 general root, `go/` primary component (areas as in the B2 tests), both items `area: 'go/', cwd: 'go'` ->
   `commands.audit = { run: 'bash scripts/vuln-gate.sh', cwd: 'go' }`.
4. ST3 no sibling: a lone `./gate.sh --self-test` (audit) still fills audit; `bash t0-conformance/selftest.sh` (test,
   `invokedName: 'selftest'`) still fills test. No `self_test` note.
5. ST4 a sibling with a different entry point (`bash scripts/other-gate.sh`, `invokedName: 'other-gate'`): the self-test
   is not filtered; the ranking decides exactly as before this TRD.
6. ST5 markers: `--selftest`, `--self-test=fixtures`, `--selftest-no-divergence` and a bare `selftest` argument are
   each filtered when the gate sibling exists; `make selftest` beside `make test` (different targets) is not a pair, and
   the target word is never read as an argument.
7. ST6 a declared row (`source: 'declared'`) carrying `--self-test` is kept.
8. ST7 key-agnostic: `test` candidates `./ci/check.sh --self-test` + `./ci/check.sh` (`invokedName: 'check'`) -> test is
   `./ci/check.sh`; and a sibling at a DIFFERENT cwd is not a pair.

**Declared linters (Task 3)**
9. R `protoLintTargetShape` (tier root, extends go, `buf.yaml`): Makefile `lint:` = `go vet ./...` + `buf lint`,
   `test:` = `go test ./...`, `build:` = `go build ./...`. Draft `lint: { run: "make lint" }` only (test/build restate
   their command word and stay inherited); `noteTags.present` includes `declared_linters`.
10. R `guardedLinterTargetShape` (tier root): `lint:` = `go vet ./...` + `@command -v golangci-lint >/dev/null 2>&1 &&
    golangci-lint run || echo "golangci-lint not installed; ran go vet only"`. `absent: ['lint']`.
11. R `mixedAggregateCodegenShape` re-baselined: `expect.commands` gains `lint: { run: 'make lint' }`; codegen stays
    `make proto`, deps `make gen-sdk`, `mixed_aggregate` still present.
12. K31 `linterToolOf`: `buf lint` -> `buf`; `buf lint --path proto/x` -> `buf`; `golangci-lint run ./...` ->
    `golangci-lint`; `go vet ./...` -> `go`; `helm lint chart/` -> `helm`; `buf generate`, `go test ./...`, `make lint`,
    `''`, `null` -> null. `classifyInvocation('buf lint')` is still null. `AUX_LINTERS` is frozen and each entry is
    frozen.
13. DL1 `make lint` body `['go vet ./...', 'buf lint']` (GO tier root) -> `commands.lint = { run: 'make lint' }`;
    `inheritedKeys` lacks lint; one info note `{ key: 'lint', status: 'info', tag: 'declared_linters' }` whose detail
    names `go vet ./...` and `buf lint`.
14. DL2 body `['go vet ./...', 'golangci-lint run ./...']` -> `make lint`.
15. DL3 body `['go vet ./...', 'golangci-lint run || echo "not installed"']` -> inherited (an optional linter).
16. DL4 body `['go vet ./...', 'buf lint', 'go build ./...']` -> inherited (a non-linter extra).
17. DL5 same body as DL1 with `target.deps: ['generate']` -> inherited (prerequisite, unchanged 43-12 narrowing).
18. DL6 body `['go vet ./...', 'go vet -tags integration ./...']` (same tool as the default) -> inherited.
19. DL7 an unresolved `make lint` (verify `binary_missing`) beside a CI `go vet ./...` -> lint inherited, and the
    `make lint` failure is a note (the DT4 pattern).
20. DT5 re-baselined: the `['go vet ./...', 'buf lint']` case now fills `make lint`; the prerequisite case is unchanged.

<embedded_context>

<codebase_examples>
The mixed-aggregate pre-rank filter in `evaluateKey` (stack-draft.cjs 839-851) is the model for the self-test filter:
```js
let pool = eligible;
if (!WHOLE_ENTRY_KEYS.has(key) && eligible.some(isPure)) {
  const mixedSeen = new Set();
  pool = eligible.filter((c) => {
    const others = mixedOthers(c);
    if (!others.length) return true;
    if (!mixedSeen.has(c.command)) {
      mixedSeen.add(c.command);
      notes.push(note(c, key, 'mixed_aggregate', `also runs ${others.join(', ')}; …`));
    }
    return false;
  });
}
// The governing default's tool decides the dedicated-linter rank for lint (TRD 43-12, linterOf).
const formTool = defaultToolOf(formRun);
let ranked = rank(pool, key, formTool);
```

`declaredTarget` today (413-423) and the walk that calls it (955):
```js
function declaredTarget(item, key, defaultRun) {
  const t = item.target;
  if (!t || typeof t.name !== 'string' || !TASK_RUNNERS.has(item.runner) || !canonicalName(t.name, key)) return false;
  if (!runnable(defaultRun) || (Array.isArray(t.deps) && t.deps.length)) return false;
  const want = bare(defaultRun);
  const body = Array.isArray(item.bodyInvocations) && item.bodyInvocations.length
    ? item.bodyInvocations
    : [item.resolvesTo].filter(Boolean);
  if (!body.length || !body.every((b) => bare(b) === want)) return false;
  return !restatesCommand(t.name, defaultRun);
}
// walk:
if (c.cwdStatus !== 'missing' && equivalent(c, parentRun) && !declaredTarget(c, key, parentRun)) {
  inheritedAt = c.cwd || null;
  break;
}
```

A tagged info note (the `narrow_fallback` shape, 921-930): `{ area, key, candidate: null, status: 'info', detail, source:
null, tag: 'narrow_fallback' }`. With `note()` it is `note(c, 'lint', 'info', detail, { tag: 'declared_linters' })`.

A stack-classify tool walk to copy for `linterToolOf` (toolStack, ~1095):
```js
for (const c of toInvocations(inv)) {
  let i = 0;
  while (i < c.argv.length - 1 && LEADING_NOISE.test(c.argv[i])) i++;
  const tool = c.argv[i];
  …
}
```

A tier-root realshape entry (1739):
```js
declaredDefaultTargetShape: {
  build: declaredDefaultTargetShape,
  tools: tools(),
  expect: { extends: 'go', components: [], commands: { … } },
  absent: [], extraAllowed: [], noEvidence: [],
},
```
</codebase_examples>

<anti_patterns>
- Do not add `buf lint` to CLASSIFY_TABLE (any key). It would make `buf lint` a lint candidate on its own: in
  eden-platform-go's CI (`buf lint` before `go vet ./...`) `linterOf` would rank it first and draft `lint: buf lint`,
  and stack-evidence's `proto:` unit would become a mixed aggregate (stack-evidence.test.cjs 1484 pins it as nothing).
  AUX_LINTERS is read ONLY by `linterToolOf`, which only `declaredTarget` calls.
- Do not compose commands (`go vet ./... && buf lint`). The drafter is verbatim (42-07): a CI-only `buf lint` step with
  no lint target has no single entry point, and that stays out of scope (record it in the SUMMARY).
- Do not name a fleet repository anywhere in stack-draft.cjs, stack-classify.cjs or a realshape shape name (R2 fails on
  a shape name carrying one). Fixture content is invented (`vuln-gate.sh`, module names from `goMod('…')`).
- Do not widen ACCEPTED/OPEN or touch `stack-fleet-tables.cjs` / `stack-drafter-fleet.test.cjs` here (TRD 71-02).
- Do not read a self-test marker from the program word, the script path or a runner target name: `bash
  t0-conformance/selftest.sh` and `make selftest` are entry points, not self-test arguments.
- Do not use LLM-generated sample data; every fixture line is written by hand.
</anti_patterns>

<error_recovery>
- A golden or realshape shape other than the three named here changes its draft: read its evidence with
  `node plugins/devflow/devflow/bin/df-tools.cjs --cwd <fixture> stack init` (no `--write`), find which rule fired, and
  narrow the rule with a structural reason and a unit test (43-12's "narrow on fleet regression" pattern). Never edit
  another shape's `expect` to make it pass.
- stack-evidence.test.cjs fails: `buf lint` reached CLASSIFY_TABLE or `classifyInvocation`. Revert that part.
- The fleet run (Task 3 step 5) shows a new conflict outside justinforme/smartWellness lint: read that repo's lint
  target with `stack init` read-only. If the rule is wrong there, narrow it (unit test first); if the draft is the
  better entry point, list the row in the SUMMARY for TRD 71-02 to record as refresh-pending.
</error_recovery>

</embedded_context>

<gotchas>
- `equivalent(c, parentRun)` is already true for `make lint` (resolvesTo is `go vet ./...`), so the widening lives in
  `declaredTarget`: returning true lets the walk verify and choose the target. Keep the WHOLE-body branch first and
  unchanged (DT1-DT4 must pass untouched).
- `||` stays inside one body invocation (stack-shell splits on `&&` and `;`, not `||`), so "unconditional" is "the
  invocation text has no `||`". Two known blind spots, record them in the SUMMARY, do not chase them: a make `-` prefix
  (stack-runners strips `[@-]+` at 647) and a `command -v X && X` guard without `||` (the probe is dropped). Both look
  unconditional.
- The rule is lint-only and needs the default IN the body (`bare(b) === bare(defaultRun)` for at least one invocation).
  The tool comparison is against the default's tool (`go` for `go vet ./...`): `go vet -tags x ./...` is the same tool,
  not an extra linter (DL6).
- `selftest` is a `test` hint (HINT_TOKENS 358, K26): the devcluster golden's `bash t0-conformance/selftest.sh` is the
  offline test gate and must stay chosen (ST3). The sibling requirement is what protects it.
- The fleet harness runs in `npm test` against `~/dev`. After Task 3 it fails on justinforme/smartWellness lint until
  TRD 71-02 records them. Run the full suite with `DEVFLOW_SKIP_FLEET_HARNESS=1` and run the harness separately.
- `micro.test.cjs` hangs when git commit signing prompts. Use
  `node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` then.
- Baseline (70-03 SUMMARY, 2026-10-08): 11389 tests, 1 fail (`roadmap-reconcile.test.cjs` E2E1, a transient that
  clears after `roadmap update-job-progress`).
- Never use port 8080 (use 8091 if a server is ever needed; none is). Commit with `df-tools commit`, never raw
  `git commit`.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Realshape fixture builders for the self-test gate, the proto lint target and the guarded linter</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/stack-realshape-fixtures.cjs</files>
  <action>
Add three hand-written builders after `workspaceRunnerShape` (or the last builder), each with a doc comment in the file's
style naming the evidence SHAPE (never a fleet repo) and what is reviewed. Use `makeWhole`, `goMod`, `wf`, `mk`,
`GO_MAIN`. Export them. Do NOT register them in `REALSHAPE` yet (Tasks 2 and 3 do that in their RED steps, with the
expectations).

1. `selfTestGateShape()`: `go.mod` (`goMod('ledgerline')`), `main.go`, `scripts/vuln-gate.sh` (mode 0o755 via the
   builder's modes argument, as other shapes do), whose text is a small hand-written gate: a `self_test()` function
   that runs a fixtures check with no govulncheck, a `gate()` that runs `govulncheck -format json ./... > "$TMP"` and a
   `jq` filter, and `case "$1" in --self-test) self_test ;; "") gate ;; *) echo "unknown argument" >&2; exit 2 ;; esac`.
   `.github/workflows/ci.yml`: one job, steps `actions/checkout@v4`, `actions/setup-go@v5`, then
   `- name: vuln gate self-test` / `run: bash scripts/vuln-gate.sh --self-test`, then `- name: vuln gate` with a block
   run: `go install example.invalid/vuln/cmd/govulncheck@latest` and `bash scripts/vuln-gate.sh`.
2. `protoLintTargetShape()`: `go.mod`, `main.go`, `buf.yaml` (`version: v2\nmodules:\n  - path: proto\n`),
   `proto/ledger/v1/ledger.proto`, and a Makefile: `.PHONY: build test lint`, `build:` -> `\tgo build ./...`,
   `test:` -> `\tgo test ./...`, `lint:` -> `\tgo vet ./...` and `\tbuf lint`. No workflow.
3. `guardedLinterTargetShape()`: `go.mod`, `main.go`, a Makefile with `lint:` -> `\tgo vet ./...` and
   `\t@command -v golangci-lint >/dev/null 2>&1 && golangci-lint run || echo "golangci-lint not installed; ran go vet only"`,
   plus `test:` -> `\tgo test ./...`. No workflow.

Check each builds: `node -e` requiring the module, call each builder, list the files, then `fx.cleanup` the dir (the
drafter fixtures' cleanup). Commit (`test(71-01): realshape builders for self-test gate and lint targets`).
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/stack-drafter-realshape.test.cjs
  </verify>
  <done>The three builders are exported and build a repo each; the realshape suite is unchanged and green (they are not
registered yet); R2's shape-name guard still passes.</done>
  <recovery>If R2 fails, a builder name or export collides with a FLEET name: rename by structure.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: A self-test step never fills a key while its gate sibling exists</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/stack-realshape-fixtures.cjs, plugins/devflow/devflow/bin/lib/stack-draft.test.cjs, plugins/devflow/devflow/bin/lib/stack-draft.cjs</files>
  <action>
RED (cases 1-8): register `selfTestGateShape` in REALSHAPE (`tools: tools('bash', 'jq')` or whatever the shape's
verify needs; `expect: { extends: 'go', components: [], commands: { audit: { run: 'bash scripts/vuln-gate.sh' } } }`,
`absent: []`, `extraAllowed: []`, `noEvidence: []`, `noteStatuses: { present: ['self_test'], absent: [] }`). If the
draft writes further keys from this shape, add them to `expect` only after reading the draft and confirming they are
unrelated to this rule (say so in the commit body). Add a `describe('assembleDraft self-test steps never fill a key
beside their gate (ST1-ST7, TRD 71-01)')` block to stack-draft.test.cjs using `ev()` with `runner: 'script'`,
`invokedName`, `source: 'ci'`. Run: the realshape entry and ST1/ST2/ST5/ST7 fail on the self-test pick; ST3/ST4/ST6
already pass (they pin what must not change). Commit RED.

GREEN in stack-draft.cjs:
```js
// TRD 71-01 (SDR-09): an argument that asks a gate script to test itself rather than gate.
const SELF_TEST_ARG = /^(?:--?self-?test(?:[-=].*)?|self-?test)$/i;

/** selfTestArgs(item) -> the self-test words of item's command: never the program, a shell's script, or the target. */
function selfTestArgs(item) { /* words of bare(item.command); skip word 0, skip word 1 when word 0 is bash|sh|zsh|dash,
  skip any word equal to nameOf(item); strip surrounding quotes; keep the words SELF_TEST_ARG matches */ }

/** sameEntryPoint(a, b) -> same cwd and same named entry point (nameOf), else the same command once a's self-test
 *  words are removed (bare, squashed). */
function sameEntryPoint(a, b) { … }
```
In `evaluateKey`, right after the mixed-aggregate filter and before `formTool`/`rank`:
```js
// A self-test step (TRD 71-01): a candidate passing a self-test argument to an entry point that a sibling candidate
// runs WITHOUT one is a test of that gate, not the gate. A `self_test` note; a declared row is the user's own; with no
// gate sibling nothing changes (an offline self-test may be the only gate a repo has).
const gates = pool.filter((c) => !selfTestArgs(c).length);
const selfTestSeen = new Set();
pool = pool.filter((c) => {
  if (c.source === 'declared' || !selfTestArgs(c).length) return true;
  const gate = gates.find((g) => sameEntryPoint(c, g));
  if (!gate) return true;
  if (!selfTestSeen.has(c.command)) {
    selfTestSeen.add(c.command);
    notes.push(note(c, key, 'self_test', `a self-test of \`${nameOf(c) || bare(c.command).split(' ')[0]}\` (${selfTestArgs(c).join(' ')}); the step \`${gate.command}\` runs it as the gate, so this never fills ${key}`));
  }
  return false;
});
```
(`pool` is `let`; keep `eligible` untouched.) Add a header paragraph after "Mixed aggregates": "Self-test steps (TRD 71-01,
SDR-09). Before ranking, for every key, a candidate whose command passes a self-test argument (`--self-test`,
`--selftest`, a `--selftest-<case>` / `=<x>` variant, or a bare `selftest` word, never the program, script or target
name) to an entry point that another candidate of the same tier runs without one, at the same cwd, is a `self_test`
note. A declared row is the user's own. With no such gate the self-test stays a candidate." Run the RED tests green and
the whole stack-draft, golden and realshape suites. Commit GREEN.
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/stack-draft.test.cjs plugins/devflow/devflow/bin/lib/stack-drafter-realshape.test.cjs plugins/devflow/devflow/bin/lib/stack-drafter-golden.test.cjs plugins/devflow/devflow/bin/lib/stack-drafter-e2e.test.cjs
  </verify>
  <done>Cases 1-8 pass; every existing stack-draft, golden (including the devcluster `bash t0-conformance/selftest.sh`
test gate), realshape and drafter-e2e test passes unchanged. `rg -n "self_test" plugins/devflow/devflow/bin/lib/stack-draft.cjs`
hits the filter and the header paragraph.</done>
  <recovery>If a golden changes, the sibling or marker test is too loose: tighten `selfTestArgs` (skip rules) or
`sameEntryPoint` (cwd, name) and add the failing shape as an ST case. `git checkout -- plugins/devflow/devflow/bin/lib/stack-draft.cjs`
returns to the RED state.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: A lint target that runs the default plus unconditional linters is the lint entry point; fleet read-only check</name>
  <files>plugins/devflow/devflow/bin/lib/stack-classify.test.cjs, plugins/devflow/devflow/bin/lib/stack-classify.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/stack-realshape-fixtures.cjs, plugins/devflow/devflow/bin/lib/stack-draft.test.cjs, plugins/devflow/devflow/bin/lib/stack-draft.cjs</files>
  <action>
RED (cases 9-20): register `protoLintTargetShape` (`expect.commands: { lint: { run: 'make lint' } }`, `noteTags:
{ present: ['declared_linters'], absent: [] }`) and `guardedLinterTargetShape` (`expect.commands: {}`,
`absent: ['lint']`) in REALSHAPE; re-baseline `mixedAggregateCodegenShape` with `lint: { run: 'make lint' }` and a
comment `// TRD 71-01: the lint target runs go vet and buf lint, so it is the lint entry point (SDR-09)`. Add K31 to
stack-classify.test.cjs and a `describe('assembleDraft lint targets that add linters (DL1-DL7, TRD 71-01)')` block;
re-baseline DT5's first case to `{ run: 'make lint' }` with a comment that 71-01 (SDR-09) widened 43-12's narrowing 1
for lint. Run: K31, DL1/DL2, DT5 and the two realshape entries fail; DL3-DL7 and the guarded shape pass already. Commit
RED.

GREEN, stack-classify.cjs (after DEDICATED_LINTERS):
```js
// Linters that lint a non-language artifact and never fill a key by themselves (TRD 71-01, SDR-09). Closed and frozen.
// NOT in CLASSIFY_TABLE: `buf lint` stays unclassified, so it is never a candidate and never changes unitKeys. Only
// linterToolOf reads this, for a lint target's extra body lines.
const AUX_LINTERS = Object.freeze([
  Object.freeze({ tool: 'buf', match: (a) => is(a, 'buf', 'lint'), lints: 'proto' }),
]);

/** linterToolOf(inv) -> the tool when `inv` is a lint invocation (a CLASSIFY_TABLE lint / lint_* row, else AUX_LINTERS), else null. */
function linterToolOf(inv) { … }
```
Export `linterToolOf` and `AUX_LINTERS`.

GREEN, stack-draft.cjs: import `linterToolOf`. Add `declaredLinters(item, key, defaultRun) -> [extra invocations] | null`:
null unless key is `lint`, the item passes `declaredTarget`'s first guards (task-runner target named for the key, no
prerequisite, runnable default), the body has at least one invocation with `bare(b) === bare(defaultRun)`, at least one
other, and EVERY other invocation has no `||` and a `linterToolOf` tool that is not the default's tool (`defaultToolOf`);
and `!restatesCommand(t.name, defaultRun)`. In `declaredTarget`, keep the whole-body branch first, then
`return declaredLinters(item, key, defaultRun) !== null` where it now returns false for a body that is not all-default.
After the walk chooses a candidate, when `key === 'lint'` and `declaredLinters(chosen, key, parentRun)` returns a
list `extras`, push one note: `note(chosen, key, 'info', detail, { tag: 'declared_linters' })`, where `detail` reads
"runs the <extendsId> default `<parentRun>` and `<extra 1>`, `<extra 2>`; the target is the lint entry point".
Extend the header's declared-target paragraph: "Widened for lint (TRD 71-01, SDR-09): a `lint` target whose body is the
default plus one or more UNCONDITIONAL linters of another tool (stack-classify linterToolOf: a lint row, or AUX_LINTERS
such as `buf lint`) is the declared entry point too, with a `declared_linters` info note. An extra line with a `||`
fallback is optional by its own design and keeps the target inherited; so does any extra line that is not a linter.
`buf lint` alone is never a candidate."

Fleet read-only check (no table edits): run
`node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs` and capture each failing repo's message.
Expected: exactly `justinforme` and `smartWellness` `new conflict: lint: committed \`go vet ./...\` vs draft \`make lint\``.
Also print `node plugins/devflow/devflow/bin/df-tools.cjs --cwd ~/dev/aodex stack init` and confirm the audit line is
`audit: { run: "bash scripts/check-govulncheck.sh", cwd: "go" }`, and `--cwd ~/dev/dfip` keeps lint inherited. Record
the outputs (commands and the one-line results) in the SUMMARY under `## Fleet read-only check` for TRD 71-02. Nothing
is written into any fleet repo; confirm `git -C ~/dev/<repo> status --porcelain` is unchanged for the repos you read.
Commit GREEN.
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/stack-classify.test.cjs plugins/devflow/devflow/bin/lib/stack-draft.test.cjs plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs plugins/devflow/devflow/bin/lib/stack-drafter-realshape.test.cjs plugins/devflow/devflow/bin/lib/stack-drafter-golden.test.cjs plugins/devflow/devflow/bin/lib/stack-drafter-e2e.test.cjs
  </verify>
  <done>Cases 9-20 pass and every listed suite passes, stack-evidence.test.cjs unedited. The fleet harness shows only the
two expected lint conflicts (recorded for 71-02), aodex audit is the gate step, dfip lint stays inherited, and no fleet
work tree changed. The full suite with `DEVFLOW_SKIP_FLEET_HARNESS=1` shows no failure outside the 70-03 baseline.</done>
  <recovery>If a golden or realshape shape outside this TRD changes, narrow `declaredLinters` with a structural reason
and a DL case, as 43-12 did (record the narrowing and the data that named it). If DT1-DT4 fail, the whole-body branch
moved: restore it as the first check.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test {files}   (scoped; each task's verify line names its files)</test>
<test>npm test   (full suite before the last commit, with DEVFLOW_SKIP_FLEET_HARNESS=1 until TRD 71-02 lands; if micro.test.cjs hangs on commit signing, use node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs')</test>
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/stack-draft.test.cjs plugins/devflow/devflow/bin/lib/stack-classify.test.cjs plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs plugins/devflow/devflow/bin/lib/stack-drafter-realshape.test.cjs plugins/devflow/devflow/bin/lib/stack-drafter-golden.test.cjs` passes.
- `rg -n "AUX_LINTERS|linterToolOf" plugins/devflow/devflow/bin/lib/stack-classify.cjs` hits the table, the function and
  the exports; `rg -n "'buf', 'lint'" plugins/devflow/devflow/bin/lib/stack-classify.cjs` hits AUX_LINTERS only, never
  a CLASSIFY_TABLE `R(` row.
- `rg -n "self_test|declared_linters" plugins/devflow/devflow/bin/lib/stack-draft.cjs` hits both rules and the header.
- The SUMMARY's `## Fleet read-only check` lists the harness problems and the aodex/dfip lines.
</verification>

<success_criteria>
- A workflow with a `--self-test` step and a real gate step drafts the gate (SC-1), at a tier root and in a primary
  component.
- A `lint:` target running the tier default plus `buf lint` drafts `lint: make lint` (SC-2, first clause), and a
  guarded optional linter does not.
- No other golden, realshape or fleet row changes except the recorded justinforme/smartWellness lint rows.
</success_criteria>

<output>
After completion, create `.planning/objectives/71-stack-drafter-and-verify-policy/71-01-SUMMARY.md` through
`df-tools summary post` (with `summary checkpoint` before it if the run is interrupted). Include `## Fleet read-only check`
and the two known blind spots (make `-` prefix, `command -v X &&` guard) and the CI-only `buf lint` scope note.
</output>
