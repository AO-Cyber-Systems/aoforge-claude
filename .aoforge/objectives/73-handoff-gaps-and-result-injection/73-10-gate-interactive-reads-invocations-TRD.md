---
objective: 73-handoff-gaps-and-result-injection
trd: "10"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/aoforge/hooks/gate-interactive.js
  - plugins/aoforge/hooks/gate-interactive.test.js
  - plugins/aoforge/hooks/planning-writes.audit.test.js
autonomous: true
gap_closure: true
requirements: [HND-02]
must_haves:
  truths:
    - "A gated command name inside a quoted argument or a heredoc body is not gated: `grep -n \"ssh-keygen\" notes.md`, `rg \"a|ssh-keygen\" file`, `echo 'run gh auth login'` and `cat > notes.md <<'EOF'` with a body line `npm login` all return null from detectInteractive"
    - "A real invocation is still gated at every command position: start of line, after `;`, `&&`, `||`, `|`, `&`, `(` and a newline, and inside an unquoted `$( ... )`"
    - "A heredoc fed to a shell (`bash <<'EOF'` / `sh` / `zsh` with a body line `npm login`) is still gated: its body is read as commands"
    - "`ssh-keygen -lf key.pub`, `ssh-keygen -l -f key.pub`, `ssh-keygen -F host`, `ssh-keygen -R host` and `ssh-keygen -t ed25519 -f k -N \"\"` are not gated; `ssh-keygen -t ed25519 -f k` and `ssh-keygen -y -f k` (no -P) are gated; `ssh-keygen -y -f k -P \"\"` is not"
    - "Flags are read per call: in `ssh-keygen -t ed25519 -f a -N \"\"; ssh-keygen -t ed25519 -f b` the second call is gated and the deny reason names that call (`ssh-keygen -t ed25519 -f b`); `-N` in one call never exempts another, and a skip flag in another segment (`gh auth login; echo --with-token`) never exempts a gated call"
    - "For a single-call command the deny reason is unchanged from today, so the existing daemon-live and daemon-absent wording tests pass as they are"
    - "gate-interactive reads the daemon through watcher-state.cjs (pid file location, override variable, liveness); a record read from the pre-rename daemon's file counts as no daemon, as today; if watcher-state cannot load, the hook behaves as daemon-absent"
    - "If shell-words.cjs cannot load, or the command has an unterminated quote, the hook exits 0 with no output (fail open, like gate-commits)"
  artifacts:
    - path: plugins/aoforge/hooks/gate-interactive.js
      provides: "invocation-aware detection on shell-words.parseCommand; per-call skip rules; ssh-keygen read-only and passphrase rules; daemon read through watcher-state"
      exports: ["detectInteractive", "INTERACTIVE_PATTERNS", "CMD_POS", "sshKeygenFlags", "isWatcherLive", "readWatcherInfo", "pidFilePath", "buildDenyReason"]
    - path: plugins/aoforge/hooks/gate-interactive.test.js
      provides: "RED-first tests for G1, G2, G3 and the watcher-state read"
  key_links:
    - from: "gate-interactive.js detectInteractive"
      to: "aoforge/bin/lib/shell-words.cjs parseCommand"
      via: "require('../aoforge/bin/lib/shell-words.cjs')"
      pattern: "parseCommand"
    - from: "gate-interactive.js readWatcherInfo"
      to: "aoforge/bin/lib/watcher-state.cjs readPidFile"
      via: "require('../aoforge/bin/lib/watcher-state.cjs')"
      pattern: "watcher-state\\.cjs"
---

# TRD 73-10: gate-interactive reads invocations, not mentions

<objective>
Gaps G3 and G1/G2 from `73-VERIFICATION.md` (documented follow-ups the orchestrator scheduled now, because G3 fires on
ordinary greps).

- **G3:** `gate-interactive.js` matches its patterns against the raw command text. `CMD_POS` (line 54) treats a `|`
  inside quotes as a pipe, so `rg "a|ssh-keygen" file` is gated, and a heredoc body that mentions a gated command is
  gated. The verifier reproduced it and had to delete a stray pending record; this planning session did too. With a
  watcher running, the false positive is dispatched to the user's terminal.
- **G1:** the `ssh-keygen` pattern (line 108) gates read-only, never-prompting forms (`-l`, `-lf`, `-F`, `-R`).
- **G2:** `(?!.*\s-N\s)` looks across the whole rest of the command, and every `skipIf` is tested on the whole
  command, so a flag in one call exempts or blames another, and the reason can name the wrong call.

Fix: detect on `shell-words.parseCommand` segments (the same primitives gate-commits and the Bash write detector use,
TRD 27-04 / 60-01): quoted text and heredoc bodies are data; each simple command is matched on its own, its skip flags
are read from its own words, and the reason quotes the call that matched when the command has more than one. Also
read the daemon through `watcher-state.cjs` instead of a private copy of the pid path, so TRD 73-11's move of the pid
file reaches this hook with no further edit.

Purpose: G3, G1, G2. Output: the rewritten detection, its tests (RED first), the watcher-state read.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
Project kind `plugin`, work `feature` (gap closure): TDD strict, test list first, hand-built fixtures, no
property-based libraries, no `.feature` files. User playbook (`~/.claude/CLAUDE.md`, TDD & Quality): failing test
first, one test at a time. Fixture strategy `generators` is met by existing builders: the command strings are literal
table rows, payloads come from the test file's `runHook`, and pid files from
`plugins/aoforge/aoforge/bin/lib/__fixtures__/handoff-fixtures.cjs` `writePidFile` (73-02). No new builder is needed.

Read narrowly:
- `plugins/aoforge/hooks/gate-interactive.js` (328 lines): header 1-37, `CMD_POS` 47-54, `INTERACTIVE_PATTERNS`
  56-179 (ssh-keygen 107-111), `detectInteractive` 185-192, `pidFilePath` 194-200, `isWatcherLive` 202-218,
  `readWatcherInfo` 220-228, `buildDenyReason` 269-288, `main` 290-317, exports 320-328.
- `plugins/aoforge/aoforge/bin/lib/shell-words.cjs`: header 1-33 (known limits), `extractHeredocs` 156-174,
  `scanShell` 193-240, `splitBounds` 294-336, `parseCommand` 342-387, `unquoteWord` 82-106.
- `plugins/aoforge/hooks/gate-commits.js` 60-95: how a hook loads shell-words fail-open.
- `plugins/aoforge/aoforge/bin/lib/watcher-state.cjs` 20-110: `pidFilePath`, `readPidFile` (`legacy: true` marking),
  `AOFORGE_HANDOFF_PID_FILE` override.
- `plugins/aoforge/hooks/gate-interactive.test.js`: detect groups 24-190 (the quoted-strings group 83-106 carries a
  comment calling heredocs a known limitation: update it), daemon-aware group 214, PTY messaging 403, 73-04 group 491;
  pattern-count assertion line 49 (23 patterns: keep 23).
- `plugins/aoforge/hooks/planning-writes.audit.test.js` 77-87: `NOT_UNDER_PLANNING` has a duplicate `'.aoforge'` key
  whose text is "the watcher's ~/.aoforge pid directory". Once this hook stops joining that path itself, delete the
  duplicate entry (the first `'.aoforge'` entry stays).
</context>

## Test list

Outermost first: the spawned hook, then `detectInteractive`, then `sshKeygenFlags`.

**Spawned hook (`runHook`, temp cwd, `AOFORGE_HANDOFF_PID_FILE` into the temp dir):**
1. A Bash payload whose command is `rg -n "a|ssh-keygen" notes.md` -> no stdout, exit 0, and no file under
   `<cwd>/.aoforge-handoff/pending/` (the stray-record symptom).
2. A payload `ssh-keygen -t ed25519 -f k` -> deny, and a pending record is written (unchanged behaviour).
3. A payload `ssh-keygen -t ed25519 -f a -N ""; ssh-keygen -t ed25519 -f b` -> deny whose reason contains
   `` `ssh-keygen -t ed25519 -f b` `` and does not contain `-f a`.
4. Daemon via watcher-state: with `AOFORGE_HANDOFF_PID_FILE` unset and `HOME` = temp home, a pid file written where
   `watcher-state.pidFilePath()` says (computed in the test by requiring watcher-state with that HOME) holding
   `{ pid: process.pid, watching: [cwd] }` -> the daemon-live reason (`aoforge-watch terminal`).
5. A pre-rename daemon's pid file only (`handoff-fixtures.writePidFile(home, { legacy: true })`) -> the daemon-absent
   reason (`! `), as today.
6. Unterminated quote (`echo "npm login`) -> no output, exit 0.

**detectInteractive (not gated -> null):**
7. Quoted mentions: `grep -n "ssh-keygen" notes.md`, `rg "a|ssh-keygen" file`, `echo 'gh auth login'`,
   `git commit -m "docs: npm login flow"`, `printf '%s\n' 'aws sso login'`.
8. Heredoc data: `cat > notes.md <<'EOF'` + newline + `npm login` + newline + `EOF`; the same with `<<EOF` (unquoted
   delimiter) and `<<-EOF`.
9. Read-only key forms: `ssh-keygen -lf key.pub`, `ssh-keygen -l -f key.pub`, `ssh-keygen -E sha256 -lf key.pub`,
   `ssh-keygen -F github.com`, `ssh-keygen -R github.com`.
10. Passphrase given: `ssh-keygen -t ed25519 -f k -N ""`, `ssh-keygen -t ed25519 -f k -N ''`,
    `ssh-keygen -q -t rsa -N "" -f k`, `ssh-keygen -y -f k -P ""`.
11. Every existing null case in the file (quoted-strings group, false-position guards, skipIf group, aws configure
    subcommands) still null.

**detectInteractive (gated -> hit with the right reason and `segment`):**
12. Every existing positive case in the file (command position, separators including `(`, newline and leading
    whitespace, shell-flow group) still gated, `hit.reason` and `hit.category` unchanged.
13. `ssh-keygen -t ed25519 -f k` -> gated; `hit.segment` is `ssh-keygen -t ed25519 -f k`.
14. `ssh-keygen -y -f k` (no `-P`) -> gated; `ssh-keygen -y -N "" -f k` -> gated (`-N` does not cover `-y`).
15. Per-call flags: `ssh-keygen -t ed25519 -f a -N ""; ssh-keygen -t ed25519 -f b` -> gated, `hit.segment` names `-f b`;
    `gh auth login; echo --with-token` -> gated (the skip flag is in another call);
    `echo hi && gh auth login --with-token < t` -> null (the flag is in the gated call).
16. Shell heredoc: `bash <<'EOF'` + newline + `npm login` + newline + `EOF` -> gated (body read as commands); the same
    with `sh` and `zsh`.
17. Unquoted substitution: `echo $(gh auth login)` -> gated.

**sshKeygenFlags (pure):**
18. `['-lf', 'key.pub']` -> has `l` and `f`, not `N`; `['-f', '-l']` -> `f` only (`-l` is `-f`'s argument);
    `['-N', '', '-t', 'rsa']` -> `N`, `t`; `['-qN', '', '-f', 'k']` -> `q`, `N`, `f`; `['--', '-l']` -> empty.

**buildDenyReason:**
19. Single-call hit (no `segment`, or `segment` equal to the trimmed command) -> both wordings byte-identical to today
    (the existing PTY-messaging and 73-04 tests are the pin).
20. Multi-call hit -> the parenthesis reads `` (`<segment>`: <reason>; category: <category>) `` in both wordings.

<embedded_context>

<codebase_examples>
How gate-commits loads the shared primitives (`gate-commits.js` 62-66), the pattern to copy:
```js
let shell = null;
try { shell = require(path.join(__dirname, '..', 'aoforge', 'bin', 'lib', 'shell-words.cjs')); } catch { /* fail open */ }
```
`parseCommand` output (shell-words 356-363): `{ ok, text, segments: [{ index, start, end, words: [{ masked, raw, start }], heredocs: [{ delimiter, quoted, body, opener }] }] }`.
Quoted contents are `_` in `masked` (the quote characters stay); heredoc bodies are removed from `text` and attached to
the segment that opened them.

Detection shape (pseudocode):
```js
// Each pattern's `match` is now anchored at the start of ONE simple command, e.g. /^ssh-keygen\b/,
// /^gh\s+auth\s+login\b/, /^passwd\b(?!\s*=)/, /^aws\s+configure\b(?!\s+(get|list|set|import|export|sso))/.
// CMD_POS stays exported (unused by detection) so nothing that imports it breaks; say so in a comment.
// `skipIf` (regex) is tested on the segment's RAW text; new optional `skipArgs(args)` gets the unquoted words after
// the command name.
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);

function detectInteractive(cmd, depth = 0) {
  if (!shell) return null;                                   // fail open
  const parsed = shell.parseCommand(String(cmd || ''));
  if (!parsed.ok) return null;                               // unterminated quote: fail open
  const many = parsed.segments.length > 1;
  for (const seg of parsed.segments) {
    const masked = seg.words.map((w) => w.masked).join(' ');
    const raw = parsed.text.slice(seg.start, seg.end).trim();
    const args = seg.words.slice(1).map((w) => shell.unquoteWord(w.raw));
    for (const p of INTERACTIVE_PATTERNS) {
      if (!p.match.test(masked)) continue;
      if (p.skipIf && p.skipIf.test(raw)) continue;
      if (p.skipArgs && p.skipArgs(args)) continue;
      return { ...p, segment: raw, compound: many };
    }
    // GOTCHA: a heredoc fed to a shell is code, not data (today's raw match gated it; keep that).
    const name = seg.words[0] && path.basename(shell.unquoteWord(seg.words[0].raw));
    if (depth === 0 && SHELLS.has(name)) {
      for (const h of seg.heredocs) { const hit = detectInteractive(h.body, 1); if (hit) return hit; }
    }
  }
  return null;
}
```
ssh-keygen flags, getopt style (an option letter that takes an argument consumes the rest of its cluster or the next
word):
```js
const SSH_KEYGEN_ARG_FLAGS = 'abCDEFfIJjMmNnOPRrSsTtVWwYZz';
function sshKeygenFlags(args) {
  const flags = new Set();
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    if (w === '--') break;
    if (!/^-[A-Za-z]/.test(w)) continue;
    for (let k = 1; k < w.length; k++) {
      flags.add(w[k]);
      if (SSH_KEYGEN_ARG_FLAGS.includes(w[k])) { if (k === w.length - 1) i++; break; }
    }
  }
  return flags;
}
// ssh-keygen pattern:
//   match: /^ssh-keygen\b/
//   skipArgs: (args) => { const f = sshKeygenFlags(args);
//     if (f.has('l') || f.has('F') || f.has('R')) return true;   // fingerprint / find / remove: never prompt
//     if (f.has('y')) return f.has('P');                          // reads a private key: prompts unless -P
//     return f.has('N'); }                                        // new key or -p: no new-passphrase prompt with -N
//   reason: 'ssh-keygen prompts for a passphrase without -N (or, with -y, without -P)'
```
`buildDenyReason` keeps both wordings; only the parenthesis changes, and only for `hit.compound && hit.segment`:
```js
const what = hit.compound && hit.segment ? `\`${hit.segment}\`: ${hit.reason}` : hit.reason;
// `This command needs the user's shell (${what}; category: ${hit.category}).`  (daemon live)
// `This command requires the user's shell (${what}; category: ${hit.category}).` (daemon absent)
```
Daemon read (replaces `pidFilePath`, `isWatcherLive`, `readWatcherInfo` bodies, same names exported):
```js
let watcherState = null;
try { watcherState = require(path.join(__dirname, '..', 'aoforge', 'bin', 'lib', 'watcher-state.cjs')); }
catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
function pidFilePath() { return watcherState ? watcherState.pidFilePath() : null; }
function readWatcherInfo() {
  const info = watcherState ? watcherState.readPidFile() : null;
  return info && !info.legacy ? info : null;     // a pre-rename daemon never serves this hook's records (as today)
}
function isWatcherLive() {
  const info = readWatcherInfo();
  if (!info || typeof info.pid !== 'number') return false;
  try { process.kill(info.pid, 0); return true; } catch { return false; }
}
```
</codebase_examples>

<anti_patterns>
- Do not write a new quote stripper or reuse `stripQuoted` with the old regexes: `stripQuoted` changes offsets and
  cannot attach heredocs to calls. `parseCommand` already gives per-call masked and raw words.
- Do not widen what is gated (no `env FOO=1 npm login`, no `sudo` prefix, no backtick substitution). This TRD removes
  false positives and fixes flag scoping; command coverage stays as it is, apart from the `-y` tightening the
  orchestrator asked for.
- Do not change the pending-record fields, the escape hatch, the exported names or the daemon-absent `! cmd`
  instruction. For single-call commands the reason text must stay byte-identical.
- Do not run any gated command live (the passphrase tool above all), and do not put a gated command name inside a
  quoted Bash argument or a commit message: the installed (old) gate in this session still catches those and leaves a
  stray `.aoforge-handoff/pending/<id>.json`. Test strings live in the test file, written with the Write/Edit tools.
- No generated test data, no property-based libraries.
</anti_patterns>

<error_recovery>
- An existing positive case turns null: its pattern's `match` was not re-anchored (still carries `${CMD_POS}`, which
  needs a separator that the segment no longer contains) or the masked words were joined differently from the
  pattern's `\s+`. Test `match` on `seg.words.map(w => w.masked).join(' ')`.
- `echo $(gh auth login)` turns null: `splitBounds` splits on `(`, so the inner call is its own segment; if it is not,
  check that the `$` is not glued to the first word (`$` stays in the previous segment's text).
- The coexistence suite (`hook-coexistence.test.js`, gate-interactive's RUNS entry) or `handoff.test.cjs` /
  `handoff-e2e.test.cjs` fail: they spawn this hook with commands that were gated before. Read the command: if it is a
  quoted mention, the test pinned the false positive; change the test's command to a real invocation and say so in the
  SUMMARY. Never change the hook to make a mention gated again.
- A `.aoforge-handoff/` directory appears in the repo root during the run: a Bash call of yours was gated by the
  installed hook. Delete the record it names, rephrase, carry on.
</error_recovery>

</embedded_context>

<gotchas>
- `parseCommand` drops heredoc bodies before splitting, so a heredoc body can never reach `match`; that is why the
  shell-heredoc rule (item 16) is explicit. Limit it to depth 1.
- Known shell-words limits stay (header lines 29-32): a quote inside `$( ... )` inside double quotes is not tracked
  separately, so `echo "$(gh auth login)"` is masked and not gated. That is the fail-open direction; list it in the
  SUMMARY as a remaining limit for 73-14's docs.
- `sshKeygenFlags` reads `-N''` (no space) as `-N` followed by the next word as its argument, which is what getopt
  does after the shell removes the quotes. Do not "fix" that.
- The pattern-count test (line 49) expects 23 patterns with a tty/shell-flow split: keep one ssh-keygen entry.
- Line 84-88 of the test file say heredoc bodies trigger the hook as a known limitation: rewrite that comment.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED, invocation-aware detection and per-call flags</name>
  <files>plugins/aoforge/hooks/gate-interactive.test.js</files>
  <action>
Add test list items 1-3, 6-20 to `gate-interactive.test.js` in new describe blocks named after the gaps
(`G3: quoted text and heredoc bodies are data`, `G1: read-only key forms`, `G2: flags and reasons per call`), one test
at a time. Import `sshKeygenFlags` (missing today: those tests fail on the import, which is the expected RED). Keep
every existing test. Run the file: items 1, 3, 7, 8, 9, 10 (except the plain `-N ""` cases, which pass today), 14
(`-y -N`), 15 (`-f b` segment and the other-call skip), 18 and 20 fail. Commit the tests alone:
`test(73-10): pin invocation-aware detection in gate-interactive`.
  </action>
  <verify>node --test plugins/aoforge/hooks/gate-interactive.test.js exits non-zero; the failures are the G1, G2 and G3 cases listed above and the existing tests still pass</verify>
  <done>G1, G2 and G3 are reproduced by tests that fail against the current hook; RED output captured.</done>
  <recovery>If a G3 case passes on the old code, it is not a false positive today (for example a mention with no separator before it): keep it as a regression pin and add the `rg "a|..."` shape, which the verifier reproduced.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN, detection on parseCommand segments</name>
  <files>plugins/aoforge/hooks/gate-interactive.js</files>
  <action>
Load shell-words fail-open, re-anchor every `match` at the start of a simple command, add `skipArgs` and
`sshKeygenFlags` (exported), rewrite `detectInteractive` per the pseudocode (per-segment match, raw-text `skipIf`,
`skipArgs`, shell heredoc at depth 1, `segment`/`compound` on the hit), and change `buildDenyReason`'s parenthesis for
compound hits only. Update the header (lines 26-37): detection is invocation-aware (quoted text and heredoc bodies are
data, a heredoc fed to a shell is read as commands), flags are read per call, read-only key forms pass. Make items
1-3 and 6-20 pass one at a time, then run the hook's neighbours. Commit `fix(73-10): gate only real invocations of
interactive commands`.
  </action>
  <verify>node --test plugins/aoforge/hooks/gate-interactive.test.js plugins/aoforge/hooks/hook-coexistence.test.js plugins/aoforge/aoforge/bin/lib/handoff.test.cjs plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs exits 0</verify>
  <done>Quoted mentions and heredoc data are never gated, real invocations still are, flags and reasons are per call, read-only key forms pass, `-y` without `-P` is gated; single-call wording unchanged.</done>
  <recovery>If the neighbours fail on a command that was a quoted mention, follow error_recovery (fix the test's command, never the hook). If too much changes at once, revert with `git checkout -- plugins/aoforge/hooks/gate-interactive.js` and re-anchor one pattern group at a time.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: the daemon is read through watcher-state</name>
  <files>plugins/aoforge/hooks/gate-interactive.js, plugins/aoforge/hooks/gate-interactive.test.js, plugins/aoforge/hooks/planning-writes.audit.test.js</files>
  <action>
Write test list items 4 and 5 first. Item 4 fails today only if the hook's private path differs from
watcher-state's; if it passes, keep it (it pins the wiring 73-11 relies on) and add a unit assertion that
`require('./gate-interactive.js').pidFilePath()` equals `require('../aoforge/bin/lib/watcher-state.cjs').pidFilePath()`
under the same HOME and with the override variable unset and set (that one fails today only when the paths diverge;
record either way). Then replace the bodies of `pidFilePath`, `readWatcherInfo` and `isWatcherLive` per
codebase_examples, drop the now-unused `os` require if nothing else uses it, and delete the duplicate `'.aoforge'`
entry ("the watcher's ~/.aoforge pid directory") from `planning-writes.audit.test.js` `NOT_UNDER_PLANNING`. Run the
hook tests, the planning-writes audit, the coexistence suite and the full suite. Commit
`refactor(73-10): read the watch daemon through watcher-state`.
  </action>
  <verify>node --test plugins/aoforge/hooks/gate-interactive.test.js plugins/aoforge/hooks/planning-writes.audit.test.js plugins/aoforge/hooks/hook-coexistence.test.js exits 0; then npm test shows no new failures</verify>
  <done>The hook has no pid path of its own; a live AOForge daemon is seen wherever watcher-state finds it; a pre-rename daemon still counts as absent; the audit allowlist no longer lists the watcher's dot directory.</done>
  <recovery>If the planning-writes audit flags a dotfile literal after the change, the hook still spells the dot directory somewhere (a comment is fine; a string literal is not): remove it.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/aoforge/hooks/gate-interactive.test.js plugins/aoforge/hooks/hook-coexistence.test.js plugins/aoforge/aoforge/bin/lib/handoff.test.cjs   (scoped)</test>
<test>npm test   (full suite before the last commit; if micro.test.cjs hangs on commit signing, use node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs')</test>
<lint>not_available</lint>
<build>not_available</build>
</validation_gates>

<verification>
- `rg -n "parseCommand|sshKeygenFlags|watcher-state" plugins/aoforge/hooks/gate-interactive.js` finds the detection, the flag parser and the daemon read.
- `rg -n "aoforge-watch\.pid" plugins/aoforge/hooks/gate-interactive.js` finds nothing (no private pid path).
- `ls .aoforge-handoff/pending 2>/dev/null` in the repo root lists no record left by this TRD's own Bash calls.
- RED commit precedes GREEN commits; full suite has no new failures.
</verification>

<success_criteria>
- Ordinary greps, notes and commit messages that mention an interactive command are no longer intercepted, and no
  stray pending records are created for them.
- Real interactive invocations are still handed off, and the reason names the call that needs the user's shell.
- Read-only key fingerprint forms run directly in Claude's Bash.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/73-handoff-gaps-and-result-injection/73-10-SUMMARY.md` (through
`aof-tools summary post`) with the TDD evidence table, the remaining detection limits (quoted `$( )`, prefixes such as
`env` or `time`), and any neighbour test whose command was changed from a mention to an invocation.
</output>
