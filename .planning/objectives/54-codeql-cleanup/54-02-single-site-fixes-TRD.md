---
objective: 54-codeql-cleanup
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/stack-profile.cjs
  - plugins/devflow/devflow/bin/lib/stack-profile.test.cjs
  - plugins/devflow/devflow/bin/lib/config.cjs
  - plugins/devflow/devflow/bin/lib/config.test.cjs
  - plugins/devflow/devflow/bin/lib/handoff.cjs
autonomous: true
requirements: ["54-C", "54-E", "54-D"]
codeql_alerts: [129, 89, 95]
must_haves:
  truths:
    - "renderDraftBody's notes comment cannot be closed early: a note whose text contains `-->`, `--->` or `--!>` renders with no HTML comment terminator inside the note line (CodeQL js/bad-tag-filter alert 129)"
    - "A note candidate such as `flutter test --no-pub` keeps its `--no-pub` flag intact (only terminator-shaped sequences are neutralised)"
    - "`df-tools config-set` exits 1 with an error naming the segment, and leaves config.json unchanged, when any dot segment is exactly `__proto__`, `constructor` or `prototype` (CodeQL js/prototype-pollution-utility alert 89)"
    - "`config-set workflow.research false` and other ordinary dotted keys behave exactly as before; a key such as `prototype_x` is allowed"
    - "handoff.cjs carries a comment at the `new RegExp(s.prompt_match)` site stating that the manifest author's own regex is compiled by design (alert 95 is dismissed by TRD 54-10, not fixed)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/stack-profile.cjs
      provides: "noteLine neutralises every HTML comment terminator"
    - path: plugins/devflow/devflow/bin/lib/config.cjs
      provides: "cmdConfigSet reserved-segment guard"
  key_links:
    - "stack-profile.noteLine -> renderDraftBody -> `stack init --write` .planning/STACK.md notes comment"
    - "df-tools.cjs `config-set` -> config.cmdConfigSet -> .planning/config.json"
---

# TRD 54-02: HTML comment filter, config-set prototype guard, handoff comment (groups C, E, D)

<objective>
Fix three single-site CodeQL findings and annotate the one intended pattern.

- **C, alert 129, `js/bad-tag-filter`, `stack-profile.cjs:903`.** `noteLine` only replaces `-->`. HTML5 also ends a comment at
  `--!>`, so a drafted note whose detail contains `--!>` closes the notes comment in `.planning/STACK.md` early and leaks the rest
  of the notes into the rendered profile body.
- **E, alert 89, `js/prototype-pollution-utility`, `config.cjs:173`.** `cmdConfigSet` walks `keyPath.split('.')` from argv and
  assigns through it. `config-set __proto__.polluted 1` walks into `Object.prototype` and writes there (exit 0, `updated: true`).
- **D, alert 95, `js/regex-injection`, `handoff.cjs:50`.** Intended. A handoff manifest declares the regex that recognises the
  user's own secret prompt, so compiling it is the feature. Add a code comment only. TRD 54-10 dismisses the alert on GitHub after
  the fixes are pushed.

`config-get` (`getPath`, config.cjs:229) already walks own properties only and only reads, so it needs no change. It is the only
other dotted-path walker over argv in bin/lib (the YAML-like parsers in frontmatter.cjs / trd-artifacts.cjs /
flutter-state-coverage.cjs build objects from file keys, not argv paths, and are out of scope).
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD for Tasks 1 and 2: `test(54-02): ...` (failing) before `fix(54-02): ...`.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Hand-built fixtures only. No property-based testing.
- Design choice for C, flagged to the user: OBJECTIVE.md says "preferably by breaking any `--`". This TRD neutralises only
  terminator-shaped sequences (`--` runs followed by optional `!` and `>`), because note candidates are commands such as
  `flutter test --no-pub` and breaking every `--` would mangle the flags a user copies from the note. If the user overrides this, the
  alternative is `.replace(/-(?=-)/g, '- ')` (breaks every `--`, including `--->`). Task 1's tests then change item 2 only.

## Test list

Outermost first: `renderDraftBody` is the public surface of the note line.

C (stack-profile.test.cjs, `sp.renderDraftBody(id, extendsId, notes)`):
1. A note with `detail: 'ends early --!> leaked'` renders a notes comment whose ONLY terminator is the final `-->` line: in the text
   after `<!-- stack init notes`, the first match of `/--!?>/` is at the final closing `-->`.
2. A note with `candidate: 'flutter test --no-pub'` keeps `--no-pub` verbatim in the rendered line.
3. Notes containing `-->` and `--->` render with no `/--!?>/` match before the closing line (`-->` keeps today's `-- >` output).
4. A note with a newline in `detail` stays on one line (existing behaviour, regression guard).

E (config.test.cjs, spawn `df-tools --cwd <dir> config-set ...` like `runConfigGet` at :225):
5. `config-set __proto__.polluted 1` -> status 1, stderr contains `__proto__`, config.json content byte-identical to before.
6. `config-set constructor.prototype.polluted 1` -> status 1, stderr names `constructor`.
7. `config-set workflow.__proto__.x 1` (reserved segment in the middle) -> status 1.
8. `config-set workflow.prototype 1` (reserved segment last) -> status 1.
9. `config-set workflow.research false` -> status 0, config.json `workflow.research === false` (regression guard).
10. `config-set prototype_x 1` -> status 0 (only exact segment names are reserved).

<embedded_context>

<codebase_examples>
Current note sanitiser (stack-profile.cjs:898-904):

```js
function noteLine(n) {
  const where = n.area ? n.area : 'root';
  const what = n.candidate ? `${n.key}: ${n.candidate}` : (n.key || 'stack');
  const detail = n.detail ? ` (${n.detail})` : '';
  // Never close the HTML comment early, never break it across lines.
  return `- ${where} ${what} — ${n.status}${detail}`.replace(/\r?\n/g, ' ').replace(/-->/g, '-- >');
}
```

Target: replace `.replace(/-->/g, '-- >')` with `.replace(/(--!?)>/g, '$1 >')` and update the comment to say HTML5 ends a comment at
`-->` (after any run of dashes) and at `--!>`. Worked examples: `-->` -> `-- >`, `--->` -> `--- >`, `--!>` -> `--! >`,
`--no-pub` unchanged.

Current config-set walk (config.cjs:163-173):

```js
const keys = keyPath.split('.');
let current = config;
for (let i = 0; i < keys.length - 1; i++) {
  const key = keys[i];
  if (current[key] === undefined || typeof current[key] !== 'object') {
    current[key] = {};
  }
  current = current[key];
}
current[keys[keys.length - 1]] = parsedValue;
```

Target: before reading config.json, validate every segment:

```js
const RESERVED_KEY_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);
// in cmdConfigSet, right after the usage check:
const keys = keyPath.split('.');
const bad = keys.find((k) => RESERVED_KEY_SEGMENTS.has(k));
if (bad !== undefined) error(`config-set: refusing key segment "${bad}" in "${keyPath}" (reserved object property)`);
```

and make the walk own-property based: `if (!hasOwn(current, key) || current[key] === null || typeof current[key] !== 'object')`.
`hasOwn` is already defined at config.cjs:222; move it above cmdConfigSet if needed (it is a `const`, so it must be declared before
the call executes, which it is at runtime, but keep the declaration order readable).

Test harness pattern (config.test.cjs:222-230):

```js
const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
function runConfigGet(dir, args) {
  const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', dir, 'config-get', ...args], { encoding: 'utf-8' });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}
```

Add a sibling `runConfigSet(dir, args)`. `buildPlanningDirWithConfig` (`__fixtures__/autonomous-fixtures.cjs`) gives a temp project.

handoff.cjs:48-50 (Task 3 target):

```js
    try {
      // Compile-test the regex; new RegExp() throws SyntaxError on malformed pattern.
      new RegExp(s.prompt_match);
```
</codebase_examples>

<anti_patterns>
- Do not "fix" alert 95 by escaping `prompt_match`. Escaping turns the user's regex into a literal and breaks every handoff manifest
  that uses a pattern. The value is the user's own manifest input.
- Do not filter reserved segments by deleting them silently. The user must see an error and exit 1 (OBJECTIVE.md E).
- Do not use `Object.create(null)` for the parsed config as the only defence. JSON.stringify output would be unchanged, but the
  explicit refusal is what OBJECTIVE.md asks for and what the test asserts.
- Do not change `config-get`. It already walks own properties only (config.cjs:229-238).
</anti_patterns>

<error_recovery>
- If test 1 fails because the drafted body has a second `-->` from the FIRST comment (the "Drafted by" comment), scope the search to
  the substring starting at `<!-- stack init notes`.
- If test 5 shows status 0, the guard runs after the walk. Move it before `fs.readFileSync(configPath)`.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: noteLine neutralises every HTML comment terminator (alert 129)</name>
  <files>plugins/devflow/devflow/bin/lib/stack-profile.test.cjs, plugins/devflow/devflow/bin/lib/stack-profile.cjs</files>
  <action>
RED: add a `describe('renderDraftBody notes comment (54-C)')` block to stack-profile.test.cjs with test-list items 1-4, using
`sp.renderDraftBody('go', 'general', [ { key: 'test', candidate: ..., status: 'candidate', detail: ... } ])`. Items 1 and 3
(`--!>`, `--->`) fail on current code. Commit `test(54-02): failing tests for HTML comment terminators in stack notes`.

GREEN: in `noteLine` (stack-profile.cjs:898-904) replace `.replace(/-->/g, '-- >')` with `.replace(/(--!?)>/g, '$1 >')` and
update the comment. Commit `fix(54-02): neutralise every HTML comment terminator in stack init notes`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/stack-profile.test.cjs plugins/devflow/devflow/bin/lib/stack-drafter-e2e.test.cjs</verify>
  <done>Items 1-4 pass; stack-drafter-e2e assertions on `<!-- stack init notes ... -->` still pass.</done>
  <recovery>If stack-drafter-e2e fails, a fixture note contained `-->` and its expected text was `-- >`; that output is unchanged by this regex, so look for a `--!>` or `--->` fixture instead.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: config-set refuses __proto__, constructor and prototype segments (alert 89)</name>
  <files>plugins/devflow/devflow/bin/lib/config.test.cjs, plugins/devflow/devflow/bin/lib/config.cjs</files>
  <action>
RED: add `describe('config-set reserved key segments (54-E)')` to config.test.cjs with items 5-10 via a new `runConfigSet` helper.
Capture config.json bytes before each refused call and assert they are unchanged after. Items 5-8 fail today (status 0).
Commit `test(54-02): failing tests for config-set prototype-pollution guard`.

GREEN: in `cmdConfigSet` (config.cjs:140) add the reserved-segment check right after the usage check (before reading config.json),
using `error()` from helpers (prints `Error: ...` to stderr, exits 1). Make the walk own-property based per codebase_examples.
Commit `fix(54-02): refuse reserved object keys in config-set dotted paths`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/config.test.cjs</verify>
  <done>Items 5-10 pass and every pre-existing config.test.cjs test passes.</done>
  <recovery>If an existing test sets a key through an inherited name, the hasOwn change is the cause; the reserved-segment guard alone closes alert 89, so keep the walk as it was and note it in the SUMMARY.</recovery>
</task>

<task type="auto">
  <name>Task 3: Document the intended prompt_match regex in handoff.cjs (alert 95)</name>
  <files>plugins/devflow/devflow/bin/lib/handoff.cjs</files>
  <action>
Replace the one-line comment above `new RegExp(s.prompt_match)` (handoff.cjs:49) with a short block:

```js
      // prompt_match IS a regex by contract: the handoff manifest author declares the pattern that
      // recognises their own secret prompt, and watcher-daemon.cjs compiles the same value to match it.
      // Compiling user-declared input as a RegExp is the feature, not injection. CodeQL
      // js/regex-injection (alert 95) is dismissed as "won't fix" for this reason (objective 54).
      // Here we only compile-test it: new RegExp() throws SyntaxError on a malformed pattern.
```

No behaviour change. Commit `docs(54-02): explain the intended prompt_match regex in handoff.cjs`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/handoff.test.cjs</verify>
  <done>The comment is present at the compile site; handoff.test.cjs passes; `git diff --stat` for handoff.cjs shows comment lines only.</done>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- The three task verify commands pass.
- `node plugins/devflow/devflow/bin/df-tools.cjs --cwd "$(mktemp -d)" config-set __proto__.x 1; echo $?` prints an `Error:` line and `1`.
- `rg -n "replace\(/-->/g" plugins/devflow/devflow/bin/lib/stack-profile.cjs` prints nothing.
</verification>

<success_criteria>
Alerts 129 and 89 have no remaining source pattern. Alert 95's site is documented for the dismissal in TRD 54-10. Ordinary
`config-set` keys and drafted notes with `--flags` are unchanged.
</success_criteria>

<output>
After completion, create `.planning/objectives/54-codeql-cleanup/54-02-SUMMARY.md` via `df-tools summary post`.
</output>
