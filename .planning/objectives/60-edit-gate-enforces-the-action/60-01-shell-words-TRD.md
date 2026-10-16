---
objective: 60-edit-gate-enforces-the-action
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/bash-write-cases.cjs
  - plugins/devflow/devflow/bin/lib/shell-words.cjs
  - plugins/devflow/devflow/bin/lib/shell-words.test.cjs
  - plugins/devflow/hooks/gate-commits.js
  - plugins/devflow/devflow/bin/lib/session-audit.cjs
autonomous: true
requirements: [GATE-02]
must_haves:
  truths:
    - "One module, lib/shell-words.cjs, holds the shell-text primitives: gate-commits.js and session-audit.cjs require it and no longer define stripHeredocs, stripQuoted, maskQuoted, unquoteWord, resolvePathWord or the heredoc-body regex themselves"
    - "gate-commits behaviour is unchanged: gate-commits.test.js and gate-commits-merge-sequence.test.js pass with no edits, and `require('hooks/gate-commits.js').stripHeredocs === require('lib/shell-words.cjs').stripHeredocs`"
    - "scanShell masks quoted contents, comments, arithmetic `(( ))` and `[[ ]]` contents without moving any offset, and reports ok:false on an unterminated quote"
    - "parseCommand splits a command into simple commands on && || ; | & ( ) and newline, never splits a redirection operator (2>&1, &>, >&2, >|), and attaches every heredoc body to the simple command whose line opened it"
    - "A hand-built case table (WRITE_CASES, MENTION_CASES, PATH_CASES) exists for the detector, gate, hook and replay TRDs to share"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/shell-words.cjs
      provides: "stripHeredocs, stripQuoted, maskQuoted, unquoteWord, resolvePathWord (moved), stripHeredocBodies (moved), extractHeredocs, scanShell, parseCommand (new); pure, no I/O"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/bash-write-cases.cjs
      provides: "WRITE_CASES, MENTION_CASES, PATH_CASES, TRACKED, DIRS: hand-built named command cases"
  key_links:
    - "hooks/gate-commits.js -> require(path.join(__dirname, '..', 'devflow', 'bin', 'lib', 'shell-words.cjs')) (fail-open: a failed require makes run() a no-op)"
    - "lib/session-audit.cjs -> require('./shell-words.cjs').stripHeredocBodies (re-exported under the same name)"
    - "60-02 bash-write-detect.cjs -> parseCommand, unquoteWord, resolvePathWord; 60-02..60-05 tests -> bash-write-cases.cjs"
---

# TRD 60-01: Shared shell-text primitives and the hand-built command cases (GATE-02)

<objective>
Objective 60 adds a Bash write detector (DECISION-001 option-a). DECISION-001 bounds its main risk, false positives from
a content analyser, with invocation-aware parsing: heredoc bodies and quoted arguments are data, not invocations. The
commit gate already does that parsing (TRD 27-04), but its primitives live inside `hooks/gate-commits.js`. Nothing under
`devflow/bin/lib/` can require a file in `hooks/`, because the `~/.claude/devflow` mirror carries `devflow/` only
(session-audit.cjs says so where it copies the override phrases). So the detector (60-02) and the transcript replay
(60-05) cannot reuse those primitives where they are.

This TRD moves them into `lib/shell-words.cjs` and adds the three functions the detector needs:

1. Moved verbatim from gate-commits.js: `stripHeredocs`, `stripQuoted`, `maskQuoted`, `unquoteWord`, `resolvePathWord`.
   Moved from session-audit.cjs: `stripHeredocBodies` (the variant that keeps the heredoc opener line).
2. New: `extractHeredocs(cmd)`, which returns the bodies as well as the stripped text, so an interpreter's heredoc
   (`python3 - <<'EOF'`) can be read as code while every other heredoc stays data.
3. New: `scanShell(text)`, a single left-to-right scanner. It masks quotes, comments, arithmetic and `[[ ]]` tests in one
   pass, so an apostrophe inside a comment cannot open a quote.
4. New: `parseCommand(cmd)`, which yields simple commands with masked and raw words and their heredocs.

It also writes the hand-built case table that 60-02 to 60-05 share.

gate-commits keeps its own `gitInvocations` segmenter and regex masking. Only the moved primitives change home, so its
decisions are byte-identical and its existing tests are the proof.

Purpose: GATE-02 foundation. Output: one lib module with tests, one fixture module, two requires switched.
</objective>

<file_tree>
plugins/devflow/
├── hooks/
│   └── gate-commits.js                          ← MODIFY (require shell-words; re-export stripHeredocs/stripQuoted)
└── devflow/bin/lib/
    ├── shell-words.cjs                          ← CREATE
    ├── shell-words.test.cjs                     ← CREATE
    ├── session-audit.cjs                        ← MODIFY (stripHeredocBodies from shell-words)
    └── __fixtures__/bash-write-cases.cjs        ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD (kind plugin, work feature): new behaviour goes RED first, then GREEN, in separate commits
  (`test(60-01): ...` then `feat(60-01): ...`). The moves in Task 3 are `refactor(60-01): ...` commits, and the existing
  tests are their safety net: they must pass unedited. Take one test at a time where that helps.
- Hand-built fixtures only: no generated test data, no property-based libraries, no `.feature` files.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. Use one plain command per
  Bash call (no `&&`, `;`, pipes or `cd`). gate-commits denies a raw `git commit`.
- Use the repo copy of df-tools (`node plugins/devflow/devflow/bin/df-tools.cjs ...`).
- Never use port 8080. Nothing here needs a server.

## Test list

`shell-words.test.cjs` (pure, no I/O), outermost first:

1. Identity: `require('../../../hooks/gate-commits.js').stripHeredocs` and `.stripQuoted` are the shell-words
   functions (`===`). `require('./session-audit.cjs').stripHeredocBodies === shellWords.stripHeredocBodies`.
2. Moved primitives keep their behaviour, with one named case each:
   - `stripHeredocs("cat > f <<'EOF'\nx\nEOF")` → `'cat > f  <<HEREDOC '`.
   - `stripQuoted(`a "b" 'c'`)` → `a "" ''`.
   - `maskQuoted(`x "ab" y`)` → `x "__" y` (same length).
   - `unquoteWord(`'a'"b"\c`)` → `abc`.
   - `resolvePathWord('"$X/a"', '/r')` → `null`, `resolvePathWord('src/a', '/r')` → `/r/src/a`, and
     `resolvePathWord('~/n', '/r')` → `path.join(os.homedir(), 'n')`.
3. `stripHeredocBodies("cat <<'EOF' > src/a.go\nbody > x\nEOF")` → `"cat <<'EOF' > src/a.go"`, so the opener line,
   including its redirect, survives.
4. `extractHeredocs`:
   - Two heredocs in one command return two bodies in order, each with `delimiter`, `quoted` (true for `'EOF'` /
     `"EOF"`), `body` (without the terminator) and `opener` (the offset of `<<` in the returned `text`).
   - `<<-EOF` with a tab-indented terminator is recognised.
   - An unterminated heredoc is left in `text`, and `heredocs` is `[]`.
5. `scanShell` quotes:
   - `echo "a > b" 'c > d'` masks to `echo "_____" '_____'`, the same length.
   - `\"` inside double quotes does not close them.
   - `\'` outside quotes opens nothing.
   - `$'it\'s'` is one quoted word.
   - `echo "open` gives `ok: false`.
6. `scanShell` comments:
   - `ls # x > y` blanks from `#` to end of line.
   - `a#b`, `$#` and `${#x}` are not comments.
   - `"# not"` (quoted) is not a comment.
   - `# don't\nls 'q'` blanks the first line, and the apostrophe opens no quote, so `'q'` is still masked on line 2.
7. `scanShell` operators that are not writes:
   - `$(( 3 > 2 ))` and `(( i > 0 ))` mask their contents.
   - `[[ "$a" > "$b" ]]` masks the contents between `[[` and `]]`.
8. `parseCommand` segmentation:
   - `a && b || c; d | e & f` gives 6 segments.
   - `cmd 2>&1 | tail` gives 2 segments, and the first segment's masked words include `2>&1`.
   - `make &> log` and `echo x >| f` stay one segment.
   - `a \\\n b` (backslash-newline) stays one segment.
   - `(cd x && y)` gives segments `cd x` and `y` (empty segments are dropped).
   - Every word carries `masked` and `raw`. For `echo "a b"` the second word has masked `"___"` and raw `"a b"`.
9. `parseCommand` heredoc ownership:
   - `cd sub && python3 - <<'EOF'\nprint(1)\nEOF` attaches the body `print(1)` to the `python3` segment (index 1),
     not to `cd sub`.
   - `cat <<'EOF' > f\nx\nEOF` keeps the redirect words `>` and `f` in its segment.
10. `parseCommand('echo "open > x')` → `{ ok: false, segments: [] }`.

<embedded_context>

<codebase_examples>
The primitives to move are in `plugins/devflow/hooks/gate-commits.js`: `stripHeredocs` (lines 76-81), `stripQuoted`
(87-91), `maskQuoted` (123-128), `unquoteWord` (131-155) and `resolvePathWord` (162-168). gate-commits also uses
`os` for `resolvePathWord` only, so after the move gate-commits must still require `os` only if something else uses it.
Check before deleting the require. `gitInvocations` (205-259) stays in gate-commits, calling the moved
`stripHeredocs` and `maskQuoted`.

session-audit.cjs (lines 106-114) holds the opener-keeping variant:

```js
const HEREDOC_BODY_RE = /(<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2)([^\n]*)\n[\s\S]*?^[ \t]*\3[ \t]*$/gm;
const stripHeredocBodies = cmd => String(cmd).replace(HEREDOC_BODY_RE, '$1$4');
```

`extractHeredocs` uses the same regex, in a `replace` callback that records `{delimiter: m[3], quoted: m[2] !== '',
body}` and the offset where the replacement lands in the output. The body is the text between the end of the opener line
and the terminator line, without the trailing newline. Accumulate the output length as you go, so `opener` is an offset
into the returned `text`.

Lib-to-hook require precedent (`hooks/gate-edits.js` 274-300):

```js
const PLANNING_LIB_DIR = path.join(__dirname, '..', 'devflow', 'bin', 'lib');
...
  try {
    const mode = require(path.join(PLANNING_LIB_DIR, 'planning-mode.cjs'));
```

Module style: CommonJS, `'use strict'`, sync, a header comment that states the contract, and named exports in one
`module.exports = { ... }` at the bottom (see session-audit.cjs).
</codebase_examples>

<anti_patterns>
- Do not change `gitInvocations`, `commitInvocations`, `invokesGitCommit` or any gate-commits decision. This TRD moves
  helpers. It does not improve the commit gate.
- Do not replace gate-commits' `maskQuoted` with `scanShell`. They differ on comments and arithmetic, and the commit
  gate's behaviour is pinned by 27-04/44/53 tests.
- Do not let `scanShell` move offsets. Every masked string has exactly the input length, because callers read raw words
  back by offset.
- Do not add a dependency (no shell-parser package). Plain JS, as in the rest of df-tools.
- No property-based tests. Named cases only.
</anti_patterns>

<error_recovery>
- If gate-commits tests fail after the move, diff the moved function bodies against `git show HEAD:plugins/devflow/hooks/gate-commits.js`.
  The move must be character-for-character.
- If `planning-writes.audit.test.js` (static literal scan of hooks/*.js) flags a new string literal in gate-commits.js,
  the require path is built with `path.join` from plain segments. `'devflow'`, `'bin'` and `'lib'` are not
  dotfile-shaped, so the scan should not fire. If it does, read the test's classification tables before changing
  anything.
- To back the move out: `git revert` the Task 3 refactor commit. Task 2's module is additive.
</error_recovery>

</embedded_context>

<gotchas>
- `scanShell` state machine: `normal`, `single`, `double`, `ansi` (`$'...'`, where `\'` escapes), and `comment`.
  - In `normal`, a backslash escapes the next character, and neither character starts a quote.
  - A `#` starts a comment only at word start: at text start, or after whitespace or one of `;&|()`.
  - A comment ends at `\n`. The newline itself is kept, because segmentation needs it.
  - Masked characters become `_` inside quotes and spaces inside comments. Quote characters stay as they are.
- Arithmetic and `[[ ]]` masking runs on the quote-masked string. Mask the contents of `$((…))` and `((…))`, matching
  parentheses depth-aware, and `[[…]]` (first `]]` after the opener), with `_`. Keep the delimiters.
- Segment separators: `&&`, `||`, `;`, `|`, `&`, `(`, `)`, `\n`.
  - `|` directly after `>` (`>|`) is part of the redirection.
  - `&` directly before `>` (`&>`, `&>>`) or directly after `>` or `<` (`>&2`, `2>&1`, `<&0`) is part of the
    redirection.
  - Split on the masked text, so a separator inside quotes never splits.
- Join backslash-newline (`\\\n`) to two spaces BEFORE scanning, as gate-commits does, so offsets stay aligned within
  the joined text.
- The heredoc opener can sit on a line that a separator split. Attach each heredoc to the segment whose
  `[start, end)` contains its `opener` offset.
- `parseCommand` order: `extractHeredocs` → join continuations → `scanShell` → mask arithmetic/`[[ ]]` → split → words.
  Return `{ ok, text, segments: [{ index, start, end, words: [{masked, raw, start}], heredocs }] }`. `ok: false`
  (unterminated quote) returns `segments: []`. Callers treat that as "no writes", which is the fail-open direction.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Hand-built command cases shared by 60-02 to 60-05</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/bash-write-cases.cjs</files>
  <action>
Write a data-only fixture module, hand-written with no generated data (constraint no_llm_test_data). Header comment: what
each table is for, that `cwd` and the project root are `/repo` (pure tests, no fs), and that the commands are shapes
reduced by hand from real agent commands.

Exports:

`WRITE_CASES`: `{ name, cmd, cwd: '/repo', writes: [{ form, path }] }`. For cp/mv, writes also carry `sources` and
`into`. `path` is absolute, with no trailing slash, or `null` when the target cannot be resolved statically. Forms:
`redirect | tee | sed-i | perl-i | cp | mv | python | node`.

- `w-redirect` `echo hi > src/a.js` → redirect `/repo/src/a.js`
- `w-append` `printf 'x\n' >> src/a.js` → redirect
- `w-clobber` `echo x >| src/a.js` → redirect
- `w-fd` `node gen.js 1> src/out.js 2> err.log` → redirect `/repo/src/out.js`, redirect `/repo/err.log`
- `w-both` `make &> build.log` → redirect `/repo/build.log`
- `w-attached` `cat a.txt >src/a.js` → redirect
- `w-truncate` `> src/a.js` → redirect
- `w-heredoc-before` `"cat > src/a.go <<'EOF'\npackage a\n// see > other.go\nEOF"` → redirect `/repo/src/a.go` only
- `w-heredoc-after` `"cat <<'EOF' > src/a.go\npackage a\nEOF"` → redirect `/repo/src/a.go`
- `w-tee` `go run . | tee src/out.txt` → tee
- `w-tee-multi` `echo x | tee -a src/a.txt src/b.txt` → tee `/repo/src/a.txt`, tee `/repo/src/b.txt`
- `w-sed-gnu` `sed -i 's/a/b/' src/a.js` → sed-i
- `w-sed-mac` `sed -i '' 's/a/b/' src/a.js src/b.js` → sed-i ×2
- `w-sed-suffix` `sed -i.bak -e 's/a/b/' src/a.js` → sed-i
- `w-perl` `perl -pi -e 's/a/b/' src/a.go` → perl-i
- `w-cp` `cp /tmp/a.go src/a.go` → cp `/repo/src/a.go`, sources `['/tmp/a.go']`, into false
- `w-mv` `mv src/new.go src/a.go` → mv `/repo/src/a.go`, sources `['/repo/src/new.go']`, into false
- `w-cp-into` `cp a.go b.go src/` → cp `/repo/src`, sources `['/repo/a.go','/repo/b.go']`, into true
- `w-cp-t` `cp -t src a.go` → cp `/repo/src`, sources `['/repo/a.go']`, into true
- `w-cd-rel` `cd sub && echo x > a.js` → redirect `/repo/sub/a.js`
- `w-cd-abs` `cd /other/repo; sed -i 's/a/b/' x.go` → sed-i `/other/repo/x.go`
- `w-env-prefix` `FOO=1 sed -i 's/a/b/' src/a.js` → sed-i
- `w-comment-line` `"# regenerate\necho x > src/a.js"` → redirect
- `w-sh-c` `bash -c "echo x > src/a.js"` → redirect `/repo/src/a.js`
- `w-unresolvable` `echo x > "$OUT"` → redirect `null`
- `w-py-c` `python3 -c "open('src/a.py','w').write('x')"` → python `/repo/src/a.py`
- `w-py-heredoc-var` `"python3 - <<'EOF'\np = \"src/a.py\"\ns = open(p).read()\nopen(p, \"w\").write(s)\nEOF"` → python
  `/repo/src/a.py`
- `w-py-pathlib` `python3 -c "from pathlib import Path; Path('src/a.py').write_text('x')"` → python
- `w-py-mode-kw` `python -c "open('src/a.py', mode='a').write('x')"` → python
- `w-node-e` `node -e "require('fs').writeFileSync('src/a.json', '{}')"` → node `/repo/src/a.json`
- `w-node-heredoc-const` `"node <<'EOF'\nconst f = 'src/a.json';\nrequire('fs').writeFileSync(f, '{}');\nEOF"` → node
- `w-cd-then-py` `"cd sub && python3 - <<'EOF'\nopen('a.py','w').write('x')\nEOF"` → python `/repo/sub/a.py`

`MENTION_CASES`: `{ name, cmd, cwd: '/repo' }`. Every one expects `writes: []`.

- `m-heredoc-body` `"cat <<'EOF'\nsed -i 's/a/b/' src/a.js\necho x > src/a.js\nEOF"`
- `m-body-file` `"gh issue create --title t --body-file - <<'EOF'\nRun: cp x src/a.js\nEOF"`
- `m-quoted-grep` `grep -n "> src/a.js" notes.txt`
- `m-echo-stdout` `echo "writing src/a.js"`
- `m-single-quoted` `echo 'cp x src/a.js; sed -i s/a/b/ src/a.js'`
- `m-fd-dup` `npm test 2>&1 | tail -5`
- `m-dev-null` `ls missing 2>/dev/null; echo x > /dev/stderr`
- `m-here-string` `cat <<< "x > y"`
- `m-test-cmp` `[[ "$a" > "$b" ]] && echo yes`
- `m-arith` `echo $(( 3 > 2 ))`
- `m-sed-print` `sed -n '1,5p' src/a.js`
- `m-py-read` `python3 -c "print(open('src/a.py').read())"`
- `m-py-script` `python3 tools/gen.py --out src/a.py`
- `m-cat-heredoc-code` `"cat <<EOF\nopen('src/a.py','w')\nEOF"`
- `m-comment` `ls # then: echo x > src/a.js`
- `m-apostrophe-comment` `"# don't touch src\nls src"`
- `m-git-mv` `git mv src/a.js src/b.js`
- `m-node-script` `node scripts/build.js`
- `m-unbalanced` `echo "unterminated > src/a.js`
- `m-awk` `awk '$1 > 5' data.txt`
- `m-jq` `jq '.a > 1' x.json`
- `m-proc-subst` `diff <(sort a.txt) <(sort b.txt)`

`TRACKED`: `['src/a.js', 'src/a.go', 'README.md', 'docs/guide.md', '.planning/STATE.md']`, relative to `/repo`.
`DIRS`: `['/repo/src', '/repo/docs']`.

`PATH_CASES`: `{ name, cmd, cwd: '/repo', gated: [abs], passed: [{ path, reason }] }`. Reasons:
`unresolvable | outside-project | planning | markdown | untracked`.

- `p-tracked` `echo x > src/a.js` → gated `['/repo/src/a.js']`
- `p-planning` `echo x > .planning/STATE.md` → passed planning
- `p-nested-planning` `sed -i 's/a/b/' flutter/.planning/x.json` → passed planning
- `p-markdown` `echo x >> README.md` → passed markdown
- `p-untracked` `echo x > src/new.js` → passed untracked
- `p-tmp` `echo x > /tmp/scratch.txt` → passed outside-project
- `p-scratchpad` `cp src/a.js /private/tmp/claude-501/s/scratchpad/a.js` → passed outside-project
- `p-other-repo` `cd /other && echo x > a.js` → passed outside-project (`/other/a.js`)
- `p-cp-into-tracked` `cp /tmp/a.js src/` → gated `['/repo/src/a.js']`
- `p-cp-into-new` `cp /tmp/new.js src/` → passed untracked `/repo/src/new.js`
- `p-mv-dir-dest` `mv /tmp/a.go src` → gated `['/repo/src/a.go']` (`src` is in DIRS)
- `p-unresolvable` `echo x > "$F"` → passed `{ path: null, reason: 'unresolvable' }`
- `p-mixed` `echo x > README.md; echo y > src/a.js` → gated `['/repo/src/a.js']`, passed README.md markdown
- `p-sh-c-nested-quotes` `bash -c "sed -i 's/a/b/' src/a.go"` → gated `['/repo/src/a.go']`

Freeze every table (`Object.freeze` on the arrays and the case objects). Commit
`test(60-01): hand-built bash write cases`.
  </action>
  <verify>`node -e "const c=require('./plugins/devflow/devflow/bin/lib/__fixtures__/bash-write-cases.cjs'); console.log(c.WRITE_CASES.length, c.MENTION_CASES.length, c.PATH_CASES.length, new Set([...c.WRITE_CASES,...c.MENTION_CASES,...c.PATH_CASES].map(x=>x.name)).size)"` prints `32 22 14 68` (unique names).</verify>
  <done>The table loads, every case name is unique, and the module has no require besides `path` (if any).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: lib/shell-words.cjs, the moved primitives plus extractHeredocs, scanShell, parseCommand (tests 2-10)</name>
  <files>plugins/devflow/devflow/bin/lib/shell-words.cjs, plugins/devflow/devflow/bin/lib/shell-words.test.cjs</files>
  <action>
RED: write tests 2-10 in `shell-words.test.cjs`. Run them and watch them fail because the module is missing, then commit
`test(60-01): shell-words primitives and parseCommand`.

GREEN: create `lib/shell-words.cjs`:
- Copy the five gate-commits primitives and `stripHeredocBodies` character for character. Keep their doc comments, and
  add a line naming where each came from (TRD 27-04, quick 31).
- Write `extractHeredocs`, `scanShell`, `parseCommand` and the arithmetic/`[[ ]]` masker (`maskTests`) per gotchas.
- Pseudocode for `parseCommand`:

```
parseCommand(cmd):
  { text, heredocs } = extractHeredocs(String(cmd || ''))
  joined = text.replace(/\\\n/g, '  ')            # same length, offsets stable
  { ok, masked } = scanShell(joined)
  if !ok -> { ok:false, text: joined, segments: [] }
  masked = maskTests(masked)
  bounds = split(masked)                           # [start,end) pairs, separator rules in gotchas
  segments = bounds.filter(non-blank).map((b, index) => ({
    index, start, end,
    words: every /\S+/ run of masked[start,end) -> { masked: m, raw: joined.slice(at, at+len), start: at },
    heredocs: heredocs.filter(h => h.opener >= start && h.opener < end) }))
  return { ok:true, text: joined, segments }
```

Export `{ stripHeredocs, stripQuoted, maskQuoted, unquoteWord, resolvePathWord, stripHeredocBodies, extractHeredocs,
scanShell, maskTests, parseCommand }`. Commit `feat(60-01): shell-words scanner and parseCommand`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/shell-words.test.cjs` passes tests 2-10. Test 1 fails until Task 3,
  so mark it `{ todo: 'Task 3' }` in this commit and un-todo it in Task 3.</verify>
  <done>Tests 2-10 went RED then GREEN in separate commits. The module requires only `path` and `os`.</done>
  <recovery>If the heredoc offset bookkeeping fights the regex, compute `opener` in a second pass: search `text` for the
  opener string (`m[1]`) from the previous opener's offset onward.</recovery>
</task>

<task type="auto">
  <name>Task 3: gate-commits.js and session-audit.cjs use shell-words (refactor, test 1)</name>
  <files>plugins/devflow/hooks/gate-commits.js, plugins/devflow/devflow/bin/lib/session-audit.cjs, plugins/devflow/devflow/bin/lib/shell-words.test.cjs</files>
  <action>
1. `gate-commits.js`:
   - Delete the five moved function definitions.
   - At the top, add a fail-open require:

```js
let shell = null;
try { shell = require(path.join(__dirname, '..', 'devflow', 'bin', 'lib', 'shell-words.cjs')); } catch { /* fail open */ }
const { stripHeredocs, stripQuoted, maskQuoted, unquoteWord, resolvePathWord } = shell || {};
```

   - At the top of `run()`, add `if (!shell) return;`, with a comment that the plugin always ships `devflow/` beside
     `hooks/`, so this can only fire on a broken install, and failing open is the hook contract.
   - Keep `stripHeredocs` and `stripQuoted` in `module.exports` (re-exported). gate-commits.test.js imports them.
   - Update the header comment with one line: the shell-text primitives live in `devflow/bin/lib/shell-words.cjs`
     (TRD 60-01).
2. `session-audit.cjs`:
   - Delete `HEREDOC_BODY_RE` and the local `stripHeredocBodies`.
   - Add `const { stripHeredocBodies } = require('./shell-words.cjs');`. Keep the export name.
   - Move the comment block above it to a one-line pointer.
3. Un-todo test 1 in `shell-words.test.cjs`.

Run `node --test plugins/devflow/hooks/gate-commits.test.js plugins/devflow/hooks/gate-commits-merge-sequence.test.js
plugins/devflow/devflow/bin/lib/session-audit.test.cjs plugins/devflow/devflow/bin/lib/audit-cli.test.cjs
plugins/devflow/hooks/planning-writes.audit.test.js plugins/devflow/devflow/bin/lib/shell-words.test.cjs`. Every test
must pass, with no edits to any test file other than shell-words.test.cjs. Commit
`refactor(60-01): gate-commits and session-audit share lib/shell-words`.
  </action>
  <verify>The six test files above pass. `rg -n "function (stripHeredocs|stripQuoted|maskQuoted|unquoteWord|resolvePathWord)|HEREDOC_BODY_RE" plugins/devflow/hooks plugins/devflow/devflow/bin/lib --glob '!*.test.*'` matches only shell-words.cjs.</verify>
  <done>One definition of each primitive. The commit gate's tests are unedited and green.</done>
  <recovery>If a gate-commits test fails, the move was not verbatim. Restore the old body from `git show HEAD~1:plugins/devflow/hooks/gate-commits.js`
  into shell-words.cjs, not back into the hook.</recovery>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`): `node --test <files>` scoped per task as in each `<verify>`. The objective
  gate `npm test` runs in 60-07.
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/shell-words.test.cjs` passes 10/10.
- gate-commits, merge-sequence, session-audit, audit-cli and planning-writes audit tests pass with no test-file edits.
- `git log --oneline` shows test → feat for Task 2 and a refactor commit for Task 3.
</verification>

<success_criteria>
- [ ] `lib/shell-words.cjs` is the only definition of the moved primitives
- [ ] scanShell and parseCommand behave per tests 5-10
- [ ] `bash-write-cases.cjs` has 32 write cases, 22 mention cases and 14 path cases with unique names
</success_criteria>

<output>
After completion, create `.planning/objectives/60-edit-gate-enforces-the-action/60-01-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post` (see execute-trd.md).
</output>
