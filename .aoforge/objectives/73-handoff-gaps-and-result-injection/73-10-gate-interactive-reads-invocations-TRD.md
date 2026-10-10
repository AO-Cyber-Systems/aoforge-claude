---
objective: 73-handoff-gaps-and-result-injection
trd: "10"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/interactive-command-cases.cjs
  - plugins/aoforge/aoforge/bin/lib/interactive-commands.cjs
  - plugins/aoforge/aoforge/bin/lib/interactive-commands.test.cjs
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
    - "The per-invocation matcher lives in the shared module `aoforge/bin/lib/interactive-commands.cjs` (patterns with a `label` each, `sshKeygenFlags`, `matchInvocations`, `detectInteractive`); the hook requires it and re-exports `detectInteractive`, `INTERACTIVE_PATTERNS`, `CMD_POS` and `sshKeygenFlags` under the same names, so 73-12's daemon allowlist can reuse the same matcher"
    - "If interactive-commands.cjs (or the shell-words module it requires) cannot load, or the command has an unterminated quote, the hook exits 0 with no output (fail open, like gate-commits); a copy of the hook spawned with no lib directory beside it proves it"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/interactive-commands.cjs
      provides: "the one per-invocation matcher: shell-words.parseCommand segments, per-call skip rules, ssh-keygen read-only and passphrase rules, shell heredocs read as commands, the pattern labels the daemon reports"
      exports: ["INTERACTIVE_PATTERNS", "CMD_POS", "sshKeygenFlags", "matchInvocations", "detectInteractive"]
    - path: plugins/aoforge/aoforge/bin/lib/interactive-commands.test.cjs
      provides: "lib-level tests over the shared case table, sshKeygenFlags, labels and skipped forms"
    - path: plugins/aoforge/aoforge/bin/lib/__fixtures__/interactive-command-cases.cjs
      provides: "hand-built GATED_CASES and NOT_GATED_CASES shared by the hook, the lib and (73-12) the daemon allowlist tests"
      exports: ["GATED_CASES", "NOT_GATED_CASES"]
    - path: plugins/aoforge/hooks/gate-interactive.js
      provides: "loads the shared matcher fail-open and re-exports it; deny reason names the matching call; daemon read through watcher-state"
      exports: ["detectInteractive", "INTERACTIVE_PATTERNS", "CMD_POS", "sshKeygenFlags", "isWatcherLive", "readWatcherInfo", "pidFilePath", "buildDenyReason"]
    - path: plugins/aoforge/hooks/gate-interactive.test.js
      provides: "RED-first tests for G1, G2, G3 at the hook, the fail-open copy and the watcher-state read"
  key_links:
    - from: "gate-interactive.js"
      to: "aoforge/bin/lib/interactive-commands.cjs"
      via: "require(path.join(__dirname, '..', 'aoforge', 'bin', 'lib', 'interactive-commands.cjs')) in a try/catch (fail open)"
      pattern: "interactive-commands\\.cjs"
    - from: "interactive-commands.cjs matchInvocations"
      to: "shell-words.cjs parseCommand"
      via: "require('./shell-words.cjs')"
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
are read from its own words, and the reason quotes the call that matched when the command has more than one. The
matcher goes in a shared module, `aoforge/bin/lib/interactive-commands.cjs`, which the hook requires fail-open: the
daemon's `watcher-allowlist.cjs` carries its own copy of the old regexes today and must accept exactly what the hook
hands off, so TRD 73-12 switches it to this module (this TRD does not touch the allowlist). Also read the daemon
through `watcher-state.cjs` instead of a private copy of the pid path, so TRD 73-12's move of the pid file reaches this
hook with no further edit.

Purpose: G3, G1, G2. Output: the shared matcher and its case table, the hook on it, their tests (RED first), the
watcher-state read.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
Project kind `plugin`, work `feature` (gap closure): TDD strict, test list first, hand-built fixtures, no
property-based libraries, no `.feature` files. User playbook (`~/.claude/CLAUDE.md`, TDD & Quality): failing test
first, one test at a time. Fixture strategy `generators`: the command strings are a hand-built case table,
`bin/lib/__fixtures__/interactive-command-cases.cjs` (precedent: `bash-write-cases.cjs`, TRD 60-01, one frozen table
shared by every consumer so they agree); payloads come from the test file's `runHook`, and pid files from
`plugins/aoforge/aoforge/bin/lib/__fixtures__/handoff-fixtures.cjs` `writePidFile` (73-02).

Read narrowly:
- `plugins/aoforge/hooks/gate-interactive.js` (328 lines): header 1-37, `CMD_POS` 47-54, `INTERACTIVE_PATTERNS`
  56-179 (ssh-keygen 107-111), `detectInteractive` 185-192, `pidFilePath` 194-200, `isWatcherLive` 202-218,
  `readWatcherInfo` 220-228, `buildDenyReason` 269-288, `main` 290-317, exports 320-328.
- `plugins/aoforge/aoforge/bin/lib/shell-words.cjs`: header 1-33 (known limits), `extractHeredocs` 156-174,
  `scanShell` 193-240, `splitBounds` 294-336, `parseCommand` 342-387, `unquoteWord` 82-106.
- `plugins/aoforge/hooks/gate-commits.js` 60-95: how a hook loads shell-words fail-open.
- `plugins/aoforge/aoforge/bin/lib/__fixtures__/bash-write-cases.cjs` header 1-30: the case-table style to copy.
- `plugins/aoforge/aoforge/bin/lib/watcher-allowlist.cjs` 26-67 (read only): its `DEFAULT_PATTERNS` labels
  (`'doctl auth init'`, ..., `'ssh-keygen'`, `'rbenv shell'`). Give each shared pattern the same `label`, so 73-12 can
  build the daemon's built-in entries from this module with no label change.
- `plugins/aoforge/aoforge/bin/lib/watcher-state.cjs` 20-110: `pidFilePath`, `readPidFile` (`legacy: true` marking),
  `AOFORGE_HANDOFF_PID_FILE` override.
- `plugins/aoforge/hooks/gate-interactive.test.js`: detect groups 24-190 (the quoted-strings group 83-106 carries a
  comment calling heredocs a known limitation: update it), daemon-aware group 214, PTY messaging 403, 73-04 group 491;
  pattern-count assertion line 49 (23 patterns: keep 23).
- `plugins/aoforge/hooks/planning-writes.audit.test.js` 77-87: `NOT_UNDER_PLANNING` has a duplicate `'.aoforge'` key
  whose text is "the watcher's ~/.aoforge pid directory". Once this hook stops joining that path itself, delete the
  duplicate entry (the first `'.aoforge'` entry stays).
</context>

<file_tree>
plugins/aoforge/
├── hooks/
│   ├── gate-interactive.js                      ← MODIFY (loads the shared matcher fail-open, re-exports it)
│   ├── gate-interactive.test.js                 ← MODIFY
│   └── planning-writes.audit.test.js            ← MODIFY (Task 3)
└── aoforge/bin/lib/
    ├── interactive-commands.cjs                 ← CREATE (the one per-invocation matcher)
    ├── interactive-commands.test.cjs            ← CREATE
    └── __fixtures__/interactive-command-cases.cjs ← CREATE (shared with 73-12)
</file_tree>

## Test list

Outermost first: the spawned hook, then `detectInteractive`, then `sshKeygenFlags`. Items 1-6b, 11, 12 and 19-21 live
in `hooks/gate-interactive.test.js`. Items 7-10 and 13-17 are rows of the case table (`interactive-command-cases.cjs`:
`GATED_CASES` rows `{ cmd, label, segment }`, `NOT_GATED_CASES` rows `{ cmd, why }`, frozen, every heredoc row a
literal string with `\n`); they, 17b and 18 are asserted in `bin/lib/interactive-commands.test.cjs` against the module
directly.

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
6b. Fail open without the libs: copy `hooks/gate-interactive.js` alone into `<tmp>/hooks/gate-interactive.js` (no
    `<tmp>/aoforge/` beside it), spawn that copy with a payload `npm login` and cwd `<tmp>/work` -> exit 0, empty stdout,
    no `<tmp>/work/.aoforge-handoff/`. (Today's hook needs no lib to detect, so it denies: this is a real RED.)

**Hook agreement (`gate-interactive.test.js`):**
21. Through the hook's export, `detectInteractive(row.cmd)` is non-null for every `GATED_CASES` row and null for every
    `NOT_GATED_CASES` row; and the hook's `detectInteractive`, `INTERACTIVE_PATTERNS` and `sshKeygenFlags` are the
    shared module's own (`strictEqual` on the module objects).

**detectInteractive (not gated -> null; `NOT_GATED_CASES`):**
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

**detectInteractive (gated -> hit with the right `label`, reason and `segment`; `GATED_CASES` holds items 13-17 plus
one plain invocation per pattern, and a test asserts every `INTERACTIVE_PATTERNS` label appears in some row and labels
are unique):**
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
17b. `matchInvocations` reports the skipped form: `gh auth login --with-token < t` -> `{ hit: null, skipped }` with
    `skipped.label` `gh auth login`; `ssh-keygen -lf key.pub` -> `skipped.label` `ssh-keygen`; a quoted mention ->
    `{ hit: null, skipped: null }`. (73-12's daemon keeps its "non-interactive form" rejection reason from this.)

**sshKeygenFlags (pure, `interactive-commands.test.cjs`):**
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

Shared matcher, `bin/lib/interactive-commands.cjs` (pseudocode; header names its two consumers: gate-interactive and,
from 73-12, the daemon allowlist):
```js
'use strict';
const path = require('path');
const shell = require('./shell-words.cjs');   // plain require: the HOOK's try/catch is the fail-open boundary

// CMD_POS: the old command-position prefix. Detection no longer uses it; it stays exported because the hook exported
// it and watcher-allowlist's deny list builds on it (73-12).
const CMD_POS = /(?:^\s*|[;&|\n(]\s*|&&\s*|\|\|\s*)/.source;

// Each pattern: { label, match, skipIf?, skipArgs?, reason, category }. `label` is the daemon's label for the same
// command (watcher-allowlist DEFAULT_PATTERNS today). `match` is anchored at the start of ONE simple command, e.g.
// /^ssh-keygen\b/, /^gh\s+auth\s+login\b/, /^passwd\b(?!\s*=)/,
// /^aws\s+configure\b(?!\s+(get|list|set|import|export|sso))/. `skipIf` (regex) is tested on the segment's RAW text;
// optional `skipArgs(args)` gets the unquoted words after the command name.
const INTERACTIVE_PATTERNS = Object.freeze([ /* the 23 entries moved from gate-interactive.js, re-anchored */ ]);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);

/** { hit, skipped }: the first gated call, else the first call a pattern matched but a skip rule exempted. */
function matchInvocations(cmd, depth = 0) {
  const parsed = shell.parseCommand(String(cmd || ''));
  if (!parsed.ok) return { hit: null, skipped: null };       // unterminated quote: fail open
  const many = parsed.segments.length > 1;
  let skipped = null;
  for (const seg of parsed.segments) {
    const masked = seg.words.map((w) => w.masked).join(' ');
    const raw = parsed.text.slice(seg.start, seg.end).trim();
    const args = seg.words.slice(1).map((w) => shell.unquoteWord(w.raw));
    for (const p of INTERACTIVE_PATTERNS) {
      if (!p.match.test(masked)) continue;
      if ((p.skipIf && p.skipIf.test(raw)) || (p.skipArgs && p.skipArgs(args))) {
        if (!skipped) skipped = { ...p, segment: raw };
        continue;
      }
      return { hit: { ...p, segment: raw, compound: many }, skipped };
    }
    // GOTCHA: a heredoc fed to a shell is code, not data (today's raw match gated it; keep that).
    const name = seg.words[0] && path.basename(shell.unquoteWord(seg.words[0].raw));
    if (depth === 0 && SHELLS.has(name)) {
      for (const h of seg.heredocs) {
        const inner = matchInvocations(h.body, 1);
        if (inner.hit) return { hit: inner.hit, skipped };
        if (!skipped && inner.skipped) skipped = inner.skipped;
      }
    }
  }
  return { hit: null, skipped };
}

function detectInteractive(cmd) { return matchInvocations(cmd).hit; }

module.exports = { INTERACTIVE_PATTERNS, CMD_POS, sshKeygenFlags, matchInvocations, detectInteractive };
```
The hook loads it like gate-commits loads shell-words, and keeps its exported names:
```js
let matcher = null;
try { matcher = require(path.join(__dirname, '..', 'aoforge', 'bin', 'lib', 'interactive-commands.cjs')); }
catch { /* fail open: a stub plugin tree without the libs gates nothing (test 6b) */ }
const detectInteractive = matcher ? matcher.detectInteractive : () => null;   // the lib's own function (test 21)
const INTERACTIVE_PATTERNS = matcher ? matcher.INTERACTIVE_PATTERNS : [];
const CMD_POS = matcher ? matcher.CMD_POS : /(?:^\s*|[;&|\n(]\s*|&&\s*|\|\|\s*)/.source;
const sshKeygenFlags = matcher ? matcher.sshKeygenFlags : () => new Set();
```
ssh-keygen flags (in `interactive-commands.cjs`), getopt style (an option letter that takes an argument consumes the
rest of its cluster or the next word):
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
- Do not keep a second copy of the patterns in the hook, and do not touch `watcher-allowlist.cjs` or its test here:
  73-11 (wave 2) edits its comments and 73-12 (wave 3) switches its `validateCommand` to `interactive-commands.cjs`.
  Do not touch compat, planning-mode or `home-dot-dir-fixtures.cjs` either (73-09 owns them in this wave).
- Do not let the shared module throw at the hook on a parse problem: `matchInvocations` returns `{ hit: null,
  skipped: null }` on `!parsed.ok`, and only a load failure is caught by the hook's try/catch.
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
- The pattern-count test (line 49) expects 23 patterns with a tty/shell-flow split: keep one ssh-keygen entry. It reads
  `INTERACTIVE_PATTERNS` through the hook, so the re-export keeps it working unchanged.
- Test 6b copies only the hook file. Its top-of-file compat require already tolerates MODULE_NOT_FOUND; the matcher and
  (Task 3) watcher-state loads must tolerate it too, or the copy crashes instead of failing open.
- In `gate-interactive.test.js`, require `interactive-commands.cjs` inside test 21's body, not at the top of the file,
  so the RED run (module not yet written) still runs every other test in the file.
- Line 84-88 of the test file say heredoc bodies trigger the hook as a known limitation: rewrite that comment.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED, the shared case table and invocation-aware detection tests</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/interactive-command-cases.cjs, plugins/aoforge/aoforge/bin/lib/interactive-commands.test.cjs, plugins/aoforge/hooks/gate-interactive.test.js</files>
  <action>
Create `interactive-command-cases.cjs` by hand (header in the `bash-write-cases.cjs` style: purpose, consumers
gate-interactive.test.js, interactive-commands.test.cjs and 73-12's watcher-allowlist.test.cjs, "hand-built, never
generated"; frozen tables): `GATED_CASES` = items 13-17 plus one plain invocation per pattern label (e.g.
`{ cmd: 'nvm use 18', label: 'nvm use', segment: 'nvm use 18' }`), `NOT_GATED_CASES` = items 7-10 plus the skip forms
(`echo hi && gh auth login --with-token < t`, `doctl auth init --access-token x`). Then, one test at a time:
`interactive-commands.test.cjs` items 7-10, 13-17b and 18 (row loops plus the label-coverage test), and in
`gate-interactive.test.js` items 1-3, 6, 6b, 19-21 in new describe blocks named after the gaps (`G3: quoted text and
heredoc bodies are data`, `G1: read-only key forms`, `G2: flags and reasons per call`, `fail open without the libs`).
Keep every existing test. Run both files: `interactive-commands.test.cjs` fails at load (the module does not exist yet:
expected RED, record it); in `gate-interactive.test.js` items 1, 3, 6b, 20 and 21 fail (21 on the quoted `|`
mentions, the heredoc data, the read-only key forms, `-y -N` and the per-call rows, and on the module identity),
existing tests pass. Commit the tests and the table alone: `test(73-10): pin invocation-aware detection in
gate-interactive`.
  </action>
  <verify>node --test plugins/aoforge/hooks/gate-interactive.test.js plugins/aoforge/aoforge/bin/lib/interactive-commands.test.cjs exits non-zero; the hook failures are the G1, G2, G3 and fail-open cases listed above, the lib file fails on the missing module, and the existing tests still pass</verify>
  <done>G1, G2 and G3 and the missing fail-open are reproduced by tests that fail against the current hook; the case table every consumer shares exists; RED output captured.</done>
  <recovery>If a G3 case passes on the old code, it is not a false positive today (for example a mention with no separator before it): keep it as a regression pin and add the `rg "a|..."` shape, which the verifier reproduced.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN, the shared matcher on parseCommand segments</name>
  <files>plugins/aoforge/aoforge/bin/lib/interactive-commands.cjs, plugins/aoforge/hooks/gate-interactive.js</files>
  <action>
Create `interactive-commands.cjs` per the pseudocode: move the 23 patterns out of the hook, give each its `label`
(the daemon's label for the same command), re-anchor every `match` at the start of a simple command, add `skipArgs`,
`sshKeygenFlags`, `matchInvocations` (per-segment match, raw-text `skipIf`, `skipArgs`, shell heredoc at depth 1,
`segment`/`compound` on the hit, the first skipped call) and `detectInteractive`. Header: what is matched, the two
consumers, and that the daemon allowlist must accept exactly what this module gates (73-12 pins it). In the hook,
replace the pattern list and `detectInteractive` with the fail-open load and the re-exports from codebase_examples
(no second copy of any pattern), and change `buildDenyReason`'s parenthesis for compound hits only. Update the hook
header (lines 26-37): detection is invocation-aware and lives in `interactive-commands.cjs` (quoted text and heredoc
bodies are data, a heredoc fed to a shell is read as commands), flags are read per call, read-only key forms pass, a
missing lib fails open. Make items 1-3, 6-21 pass one at a time, then run the hook's neighbours. Commit
`fix(73-10): gate only real invocations of interactive commands`.
  </action>
  <verify>node --test plugins/aoforge/hooks/gate-interactive.test.js plugins/aoforge/aoforge/bin/lib/interactive-commands.test.cjs plugins/aoforge/hooks/hook-coexistence.test.js plugins/aoforge/aoforge/bin/lib/handoff.test.cjs plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs plugins/aoforge/aoforge/bin/lib/watcher-allowlist.test.cjs exits 0 (the allowlist is untouched and must stay green: it still uses its own regexes until 73-12)</verify>
  <done>Quoted mentions and heredoc data are never gated, real invocations still are, flags and reasons are per call, read-only key forms pass, `-y` without `-P` is gated; single-call wording unchanged.</done>
  <recovery>If the neighbours fail on a command that was a quoted mention, follow error_recovery (fix the test's command, never the hook). If too much changes at once, revert with `git checkout -- plugins/aoforge/hooks/gate-interactive.js`, delete the new module, and move and re-anchor one pattern group at a time.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: the daemon is read through watcher-state</name>
  <files>plugins/aoforge/hooks/gate-interactive.js, plugins/aoforge/hooks/gate-interactive.test.js, plugins/aoforge/hooks/planning-writes.audit.test.js</files>
  <action>
Write test list items 4 and 5 first. Item 4 fails today only if the hook's private path differs from
watcher-state's; if it passes, keep it (it pins the wiring 73-12 relies on) and add a unit assertion that
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
<test>node --test plugins/aoforge/hooks/gate-interactive.test.js plugins/aoforge/aoforge/bin/lib/interactive-commands.test.cjs plugins/aoforge/hooks/hook-coexistence.test.js plugins/aoforge/aoforge/bin/lib/handoff.test.cjs   (scoped)</test>
<test>npm test   (full suite before the last commit; if micro.test.cjs hangs on commit signing, use node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs')</test>
<lint>not_available</lint>
<build>not_available</build>
</validation_gates>

<verification>
- `rg -n "parseCommand|sshKeygenFlags|matchInvocations|label:" plugins/aoforge/aoforge/bin/lib/interactive-commands.cjs` finds the detection, the flag parser and the labelled patterns.
- `rg -n "interactive-commands\.cjs|watcher-state" plugins/aoforge/hooks/gate-interactive.js` finds the fail-open matcher load and the daemon read; `rg -n "match: " plugins/aoforge/hooks/gate-interactive.js` finds nothing (no second copy of the patterns).
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
