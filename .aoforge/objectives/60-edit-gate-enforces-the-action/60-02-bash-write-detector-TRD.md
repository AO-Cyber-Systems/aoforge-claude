---
objective: 60-edit-gate-enforces-the-action
trd: "02"
type: standard
wave: 2
depends_on: ["60-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/bash-write-detect.cjs
  - plugins/devflow/devflow/bin/lib/bash-write-detect.test.cjs
autonomous: true
requirements: [GATE-01, GATE-02]
must_haves:
  truths:
    - "detectBashWrites reports every write in WRITE_CASES with the expected form and resolved absolute path: redirection (> >> >| N> &>), tee, sed -i (GNU, macOS '' and suffix forms), perl -i, cp/mv onto a file or into a directory, and inline python/node writes from -c/-e code or a heredoc fed to the interpreter"
    - "detectBashWrites reports nothing for every MENTION_CASES entry: heredoc bodies fed to non-interpreters, quoted arguments, echo to stdout, fd duplication, /dev/* targets, here-strings, [[ ]] and arithmetic comparisons, comments, sed without -i, git mv, script-file interpreters, unbalanced quotes"
    - "Relative targets resolve against the payload cwd as changed by earlier `cd`/`pushd` simple commands in the same command; a target that cannot be resolved statically ($VAR, backticks, unknown cwd) is reported with path null, never guessed"
    - "`bash|sh|zsh|dash -c CODE` and a heredoc fed to a shell are parsed as commands (recursion depth 3), because their text is executed, not mentioned"
    - "The module is pure: no fs, no child_process"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/bash-write-detect.cjs
      provides: "detectBashWrites(cmd, {cwd, home?, depth?}) -> [{form, path, raw, segment, sources?, into?}]; mayWrite(cmd) -> boolean prefilter; inlineWrites(lang, code, base) -> [{form, path}]"
  key_links:
    - "bash-write-detect.cjs -> shell-words.cjs parseCommand / unquoteWord / resolvePathWord (60-01)"
    - "60-03 bash-write-gate.cjs evaluateBashWrites -> detectBashWrites; 60-04 hook -> mayWrite as the cheap prefilter"
---

# TRD 60-02: The Bash write detector (GATE-01, GATE-02)

<objective>
DECISION-001 option-a gates the action, not the tool name. The Autonomy Blocker Audit found 331 Bash calls that wrote a
file the edit gate had just denied, using `cat > f <<'EOF'`, `sed -i`, `tee` and inline python. This TRD builds the pure
function that reads a Bash command and says which files it writes:

```
detectBashWrites(cmd, { cwd, home = os.homedir(), depth = 0 })
  -> [{ form, path, raw, segment, sources?, into? }]
```

- `form` is one of `redirect | tee | sed-i | perl-i | cp | mv | python | node`.
- `path` is an absolute path, or `null` when the target cannot be resolved statically.

It decides nothing about policy. Whether a write is gated (tracked, in the project, not markdown or `.planning/`) is
60-03's job. Detection is invocation-aware, as in gate-commits:

- Heredoc bodies and quoted arguments are data.
- The two exceptions are text that is executed: the code operand of an interpreter (`python3 -c`, `node -e`,
  `bash -c`), and a heredoc fed to an interpreter that reads its program from stdin (`python3 - <<'EOF'`).

False negatives are acceptable, because this is a routing nudge. False positives are the risk DECISION-001 names.
Anything ambiguous therefore resolves to "no write" or `path: null`, never to a guess.

Purpose: GATE-01 detection, GATE-02 non-detection. Output: one pure module with its tests.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── bash-write-detect.cjs        ← CREATE
└── bash-write-detect.test.cjs   ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD (kind plugin, work feature). RED commit, then GREEN commit, per task (`test(60-02): ...`,
  `feat(60-02): ...`). Take one test at a time where that helps.
- Hand-built fixtures only. Every case comes from `__fixtures__/bash-write-cases.cjs` (60-01) or from the named unit
  cases below. No generated data, no property-based libraries, no `.feature` files.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash
  call.
- Never use port 8080.

## Test list

`bash-write-detect.test.cjs`. A `project(writes)` helper keeps `{form, path}` (plus `sources` and `into` for cp/mv) and
sorts by `form`, then `path`. Expected values are sorted the same way.

Table-driven, outermost first:

1. Every `WRITE_CASES` entry: `project(detectBashWrites(c.cmd, { cwd: c.cwd }))` deep-equals `project(c.writes)`.
2. Every `MENTION_CASES` entry returns `[]`.

Named unit cases:

3. `cd && echo x > a` with `{ cwd: '/repo', home: '/h' }` → redirect `/h/a`.
4. `cd "$D" && echo x > a.js` → redirect `null`. `cd "$D" && echo x > /abs/a.js` → redirect `/abs/a.js`, because an
   absolute target still resolves.
5. `popd; echo x > a` → redirect `null`. `cd -; echo x > a` → redirect `null`.
6. `bash -c "echo x > a"` with `{ depth: 3 }` → `[]`, because the depth is exhausted.
7. `bash <<'EOF'\nsed -i 's/a/b/' src/a.js\nEOF` → sed-i `/repo/src/a.js`, since the heredoc is fed to a shell.
   `bash run.sh <<'EOF'\nsed -i x f\nEOF` → `[]`, since a script operand means the body is that script's stdin.
8. `sudo tee /etc/hosts` → tee `/etc/hosts`. `env -i PATH=/bin sed -i 's/a/b/' f` → sed-i `/repo/f`.
9. `sed -i -f fix.sed src/a.js src/b.js` → sed-i ×2, and `fix.sed` is not a target.
   `sed --in-place=.bak 's/a/b/' f` → sed-i `/repo/f`.
10. `cp -r lib dest/` → cp `/repo/dest`, sources `['/repo/lib']`, into true. `cp a` (one operand) → `[]`.
    `cp -- -a b` → cp `/repo/b`, sources `['/repo/-a']`.
11. Python name assigned two different literals (`"python3 - <<'EOF'\np='a.py'\np='b.py'\nopen(p,'w')\nEOF"`) →
    python `null`.
12. `node -e "require('fs').writeFileSync(\`${d}/a.json\`, '')"` → node `null`, because of the template expansion.
13. `python3 - < gen.py` → `[]`. Stdin comes from a file, and the input redirect is not a write.
14. `mayWrite`: false for `ls -la`, `git status`, `npm test` and `rg -n foo src`. True for every `WRITE_CASES` command.
15. Purity: the module source has no `require('fs')` or `require('child_process')`.

<embedded_context>

<codebase_examples>
From 60-01, `lib/shell-words.cjs`:
- `parseCommand(cmd)` → `{ ok, text, segments: [{ index, start, end, words: [{ masked, raw, start }], heredocs: [{
  delimiter, quoted, body, opener }] }] }`.
- Masked words have quotes, comments, `(( ))` and `[[ ]]` blanked. Raw words are the original text at the same offsets.
- `unquoteWord(raw)` removes one level of quoting.
- `resolvePathWord(raw, base)` → absolute path, or `null` on `$` or a backtick. It expands `~/`.

The quick-31 bypass heuristic, `bashWriteTargets` in `lib/session-audit.cjs` (lines 131-180), shows the forms agents
actually use (inline `open(...)`, `Path(...).write_text(`, `writeFileSync(`; shell `tee`, `sed -i`, `perl -i`, `cp/mv`).
It is a deliberately over-inclusive regex over raw text: it scans heredoc bodies of every command for inline code. Do not
copy that over-inclusion. Here, inline code is read only from an interpreter's own program text.

Real shapes from the transcript corpus that the detector must catch, hand-reduced:

```
cd ~/dev/aocore/go; python3 - <<'EOF'
p="internal/credstore/envelope.go"; s=open(p).read()
...
open(p,'w').write(s)
EOF
cd ~/dev/aocore/go; sed -i '' 's/svc.upsertModel(ctx, "m-byok-only", "openai")/.../' internal/llm/supply_sync_test.go
cd ~/dev/aocore/go; perl -pi -e "s/FROM credentials WHERE .../" cmd/seed-sisap-knowledge/main.go
```
</codebase_examples>

<anti_patterns>
- Do not scan raw text with regexes for `>`. Redirects are read from masked words only, so quoted `>` and heredoc
  bodies can never match.
- Do not treat a mid-word `>` (`a->b`) as a redirect. Only a word that STARTS with an optional fd number or `&`
  followed by `>` is an operator. The shell would redirect there, but missing that write is an accepted false negative,
  and treating it as one invites false positives on arrows in unquoted text.
- Do not guess a path. Unknown cwd, `$VAR` or backticks give `path: null`.
- Do not detect git operations (`git mv`, `git checkout -- f`, `git apply`, `patch`) or `rm`. They are out of scope for
  GATE-01 and stay undetected (documented in 60-07).
- No fs access, not even `existsSync`. "cp into an existing directory" is decided by 60-03 from `into`, or from an
  injected `isDirectory`.
</anti_patterns>

<error_recovery>
- If a MENTION case fails, print `parseCommand(cmd).segments.map(s => s.words.map(w => w.masked))`. The masked words
  should show the quoted, heredoc or comment text blanked. If they do not, the bug is in shell-words. Fix it there with a
  RED test in `shell-words.test.cjs`, in this TRD's commits.
- If a WRITE case resolves to the wrong directory, log the per-segment `base`. `cd` tracking must apply to later
  segments only, never to the `cd` segment's own words.
</error_recovery>

</embedded_context>

<gotchas>
- Redirect operators, read from masked words, in any segment position (including before the command word):
  - The regex is `/^(\d+|&)?(>>|>\||>)(.*)$/`.
  - The target is the rest of the word, or the raw text of the next word in the same segment.
  - Skip the operator when the rest starts with `&` (`2>&1`, `>&2`), with `(` (process substitution), or when there
    is no target word.
  - Words starting with `<` (input, `<<` heredoc openers, `<<<` here-strings) are never writes.
  - Device targets are dropped: `/dev/null`, `/dev/stdout`, `/dev/stderr`, `/dev/tty` and `/dev/fd/N`.
- Command word: skip leading `NAME=value` words. Then skip the wrappers `env` (plus its `-x` flags and assignments),
  `command`, `sudo` (plus its `-x` flags), `nohup` and `time`. Take `path.posix.basename(unquoteWord(word.raw))`.
  Arguments are the words after the command word, minus redirect operators, their target words and `<<` opener words.
- `cd`/`pushd`:
  - With no argument, the base becomes `home`.
  - With `-`, or with an argument that does not resolve, the base becomes `null`.
  - Otherwise the base becomes `resolvePathWord(arg.raw, base)`. A relative argument with a `null` base gives `null`.
  - `popd` sets the base to `null`.
  - The base persists to the end of the command. Subshell scoping `(cd x; ...)` is not modelled. That approximation is
    documented, and its error direction is a wrong path, which 60-03's tracked check absorbs.
- Resolving a word with a `null` base: absolute and `~/` words still resolve; a relative word gives `null`. Guard
  before calling `resolvePathWord`, because `path.resolve(null, …)` throws.
- `sed`/`gsed`:
  - In-place is any `-i…` word, `--in-place` or `--in-place=…`. A bare `-i` followed by an empty word (`''` or `""`,
    macOS) consumes that word as the suffix.
  - `-e X`, `--expression=X`, `-f X` and `--file=X` give the script. Without them, the first non-option operand is the
    script.
  - Every remaining operand is a file.
- `perl`: in-place when a flag cluster ends in `i` (`/^-[A-Za-z]*i(\.\S+)?$/`, so `-Mstrict` is not `-i`). `-e X` and
  `-E X` consume their code. The remaining non-option operands are files.
- `cp`/`mv`:
  - `-t DIR` and `--target-directory=DIR` mean `into: true`, `path: DIR` and `sources` = the operands.
  - `--` ends the options.
  - Otherwise, with two or more operands, `path` = the last operand and `sources` = the rest. `into` is true when the
    raw dest ends with `/`.
  - Strip any trailing slash from `path`.
- Shell recursion: for `bash|sh|zsh|dash`, `-c CODE` gives `detectBashWrites(unquoteWord(CODE.raw), { cwd: base,
  home, depth: depth + 1 })`, and a heredoc with no script operand recurses on its body. Stop at `depth >= 3`.
- Interpreters:
  - The command word matches `/^(python(\d+(\.\d+)?)?|node)$/`.
  - The code comes from `-c CODE` (python) or `-e|--eval|-p CODE` (node), unquoted. When there is no script operand,
    or the operand is `-`, and the segment owns a heredoc, the code is the heredoc body.
  - A script-file operand means no code.
- `inlineWrites(lang, code, base)`:
  - Names: python `NAME = 'lit'` or `NAME = Path('lit')`, at statement start (line start or after `;`). Node
    `const|let|var NAME = 'lit'` (template literals containing `${` do not count). A name bound to more than one
    distinct literal is unresolvable.
  - Python writes: `open(ARG, MODE)` or `open(ARG, mode=MODE)` where MODE contains one of `w`, `a`, `x` or `+`;
    `Path(ARG).write_text(` / `.write_bytes(`; `NAME.write_text(` / `NAME.write_bytes(`.
  - Node writes: `(writeFileSync|appendFileSync|writeFile|appendFile|createWriteStream)\(\s*ARG`.
  - ARG is a string literal or a NAME. Anything else (concatenation, f-string, `path.join`, template with `${`) gives
    `path: null`.
- `mayWrite(cmd)`: `/>|\btee\b|\bsed\b|\bperl\b|\bcp\b|\bmv\b|\bpython|\bnode\b|\b(?:ba|z|da)?sh\b/`. It is a cheap
  superset test for the hook. A false "true" only costs a parse.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Shell forms: redirect, tee, sed -i, perl -i, cp/mv, cd tracking, wrappers, shell recursion, mayWrite (tests 1-10, 13-15)</name>
  <files>plugins/devflow/devflow/bin/lib/bash-write-detect.cjs, plugins/devflow/devflow/bin/lib/bash-write-detect.test.cjs</files>
  <action>
RED: write tests 1-10 and 13-15. In test 1, mark the table cases whose expected forms include `python` or `node` as
`{ todo: 'Task 2' }`. Commit `test(60-02): bash write detector shell forms`.

GREEN: create `lib/bash-write-detect.cjs`. The header comment states the contract (pure; forms; null paths; mentions
are data; interpreter code is not), the accepted false negatives (mid-word `>`, git operations, `rm`, `dd`, `install`,
awk/xargs/find -exec writes) and the subshell-cd approximation. Pseudocode:

```
detectBashWrites(cmd, { cwd, home = os.homedir(), depth = 0 } = {}):
  if depth >= 3 -> []
  p = parseCommand(cmd); if !p.ok -> []
  base = cwd (absolute) or null; out = []
  for seg of p.segments:
    { redirects, consumed } = scanRedirects(seg.words)          # operator + target indices
    out.push(...redirects.map(r => ({ form:'redirect', path: resolve(r.raw, base), raw: r.raw, segment: seg.index })))
    k = commandWordIndex(seg.words, consumed); if k < 0 continue
    name = basename(unquoteWord(seg.words[k].raw)); args = operands after k not in consumed
    switch name:
      cd|pushd -> base = nextBase(args, base, home); continue
      popd     -> base = null; continue
      tee      -> args non-option -> tee writes
      sed|gsed -> sedFiles(args) when in-place
      perl     -> perlFiles(args) when -i cluster
      cp|mv    -> cpMv(name, args, base)
      bash|sh|zsh|dash -> recurse on -c code / owned heredoc body (depth + 1, cwd: base)
      python*|node -> Task 2 (return nothing yet)
  return out
```

Export `{ detectBashWrites, mayWrite, inlineWrites }`, with `inlineWrites` a stub that returns `[]` until Task 2.
Commit `feat(60-02): detect Bash shell-form writes`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/bash-write-detect.test.cjs`: tests 1-10 and 13-15 pass. Only the
  python/node table rows are todo.</verify>
  <done>Shell-form detection is GREEN, with the RED commit before it, and all 22 MENTION cases return `[]`.</done>
  <recovery>If test 2 fails on a case such as `m-test-cmp` or `m-arith`, the masking belongs to shell-words
  (`maskTests`). Add the failing case to `shell-words.test.cjs` first.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Inline interpreter writes: python and node from -c/-e code and stdin heredocs (tests 1 python/node rows, 11-12)</name>
  <files>plugins/devflow/devflow/bin/lib/bash-write-detect.cjs, plugins/devflow/devflow/bin/lib/bash-write-detect.test.cjs</files>
  <action>
RED: remove the `todo` from the python/node table rows and add tests 11-12. Commit
`test(60-02): inline python and node writes`.

GREEN: implement `inlineWrites(lang, code, base)` per gotchas. Wire the interpreter arm of `detectBashWrites`: find the
code operand (`-c` for python; `-e`, `--eval` or `-p` for node), or the owned heredoc body when there is no script
operand (or the operand is `-`). Unquote the operand, call `inlineWrites`, and stamp each result with `segment` and
`raw: ARG text`. Relative literals resolve against the segment's `base` (`null` base and a relative literal give
`null`). Commit `feat(60-02): detect inline python and node writes`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/bash-write-detect.test.cjs` passes every test, with no todo left.</verify>
  <done>All 32 WRITE cases and 22 MENTION cases pass. `w-py-heredoc-var` and `w-node-heredoc-const` resolve through the
  name binding.</done>
  <recovery>If `m-py-read` starts failing, the mode check is matching the path literal. Anchor MODE to the second
  argument: after the first top-level comma, or after `mode=`.</recovery>
</task>

</tasks>

<validation_gates>
- Task gate (`test`): `node --test plugins/devflow/devflow/bin/lib/bash-write-detect.test.cjs plugins/devflow/devflow/bin/lib/shell-words.test.cjs`.
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/bash-write-detect.test.cjs` passes 15/15, plus the 54 table rows.
- `rg -n "require\\('(fs|child_process)'\\)" plugins/devflow/devflow/bin/lib/bash-write-detect.cjs` matches nothing.
- The commit log shows test → feat for each task.
</verification>

<success_criteria>
- [ ] Every GATE-01 form is detected with the right absolute path (WRITE_CASES)
- [ ] No GATE-02 mention is detected (MENTION_CASES)
- [ ] Unresolvable targets give `path: null`, and the module is pure
</success_criteria>

<output>
After completion, create `.planning/objectives/60-edit-gate-enforces-the-action/60-02-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`.
</output>
