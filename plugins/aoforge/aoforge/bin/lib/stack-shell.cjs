'use strict';

// stack-shell.cjs — shell text -> logical invocations (TRD 42-03, SDR-02).
//
// A CI `run:` block, a Makefile recipe or a justfile body is SHELL, not a list of commands. The
// old scraper treated every physical line as a command, which produced every defect the fleet
// dry-runs found: a dangling `\`, a `-fmt sarif ./...` flag fragment, `# run the tests` as `test`,
// `echo` as `build`, `test -f x || {` as `test`. This module reads shell the way a shell does:
//
//   1. join `\` continuations (an ODD number of trailing backslashes; `\\` is a literal),
//   2. skip heredoc bodies, and any command that consumes one,
//   3. split at TOP LEVEL on newline, `&&` and `;` — outside quotes, `$( )`, backticks, `${ }`
//      and GitHub `${{ }}` expressions. A pipe (`|`, `||`) is part of ONE invocation and never splits,
//   4. peel prefixes: `VAR=val` -> env, `sudo` / `time` / `env` vanish, control words (`if`, `then`,
//      `do`, `else`, `{`, `!`) fall away so the command they introduce is still seen,
//   5. consume a `cd <dir>` into `cwd` for the commands that follow it,
//   6. apply the drop rules, and
//   7. emit `{ text, tool, argv, cwd, env }`.
//
// PURE: no fs, no child_process, no network. It names tools (`echo`, `curl`, `gh`, `doctl`) because
// it is data about shell, not the profile loader; stack-profile.cjs / stack-render.cjs stay neutral.

const path = require('path');

// ─── Drop rules (data) ────────────────────────────────────────────────────────

// A command whose FIRST word is one of these is plumbing, not a gate. `test`, `[` and `[[` are
// here too, but a conditional that RUNS a tool (`test -z "$(gofmt -l .)"`) is a real format gate
// and is kept — see shouldDrop().
const DROP_TOOLS = new Set([
  // output / shell state
  'echo', 'printf', 'cat', 'set', 'unset', 'export', 'local', 'declare', 'readonly', 'alias',
  'cd', 'pushd', 'popd', 'source', '.', ':', 'true', 'false', 'exit', 'return', 'break', 'continue',
  'shift', 'trap', 'read', 'wait', 'sleep', 'command', 'type', 'which', 'pwd', 'ls',
  // filesystem plumbing
  'mkdir', 'chmod', 'chown', 'touch', 'rm', 'cp', 'mv', 'ln',
  // network / release plumbing
  'curl', 'wget', 'gh', 'doctl',
  // conditionals and control keywords
  'test', '[', '[[', 'fi', 'done', 'esac', 'case', 'for', 'select', 'function',
]);

// Tools that are only plumbing for SOME subcommands (`git diff --exit-code` is a real check).
const DROP_SUBCOMMANDS = {
  git: new Set([
    'config', 'remote', 'fetch', 'pull', 'clone', 'init', 'checkout', 'switch', 'add', 'commit',
    'push', 'tag', 'submodule', 'reset', 'stash', 'branch',
  ]),
  docker: new Set(['login', 'logout']),
};

// Words that introduce a command but are not part of it: `if cmd`, `then cmd`, `do cmd`, `! cmd`.
const CONTROL_PREFIX = new Set(['if', 'elif', 'while', 'until', 'then', 'do', 'else', '!', '{', '}']);

const ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;

// ─── Quote-aware scanning primitives ──────────────────────────────────────────
//
// Every skip* takes the index of the OPENING character and returns the index just past the
// construct (or the end of the text when it is unterminated — never throws, never loops forever).

function skipSingle(s, i) {
  const j = s.indexOf("'", i + 1);
  return j === -1 ? s.length : j + 1;
}

function skipBacktick(s, i) {
  let k = i + 1;
  while (k < s.length) {
    if (s[k] === '\\') { k += 2; continue; }
    if (s[k] === '`') return k + 1;
    k++;
  }
  return s.length;
}

// `${{ ... }}` — a GitHub expression. It contains spaces and can contain `&&` / `||`.
function skipExpr(s, i) {
  const j = s.indexOf('}}', i + 3);
  return j === -1 ? s.length : j + 2;
}

// `${ ... }` parameter expansion.
function skipBrace(s, i) {
  const j = s.indexOf('}', i + 2);
  return j === -1 ? s.length : j + 1;
}

function skipDouble(s, i) {
  let k = i + 1;
  while (k < s.length) {
    const c = s[k];
    if (c === '\\') { k += 2; continue; }
    if (c === '"') return k + 1;
    if (c === '`') { k = skipBacktick(s, k); continue; }
    if (c === '$' && s[k + 1] === '(') { k = skipParen(s, k + 1); continue; }
    if (c === '$' && s[k + 1] === '{' && s[k + 2] === '{') { k = skipExpr(s, k); continue; }
    k++;
  }
  return s.length;
}

// `( ... )` — balanced, honouring quotes and nesting. `i` indexes the `(`.
function skipParen(s, i) {
  let depth = 0;
  let k = i;
  while (k < s.length) {
    const c = s[k];
    if (c === '\\') { k += 2; continue; }
    if (c === "'") { k = skipSingle(s, k); continue; }
    if (c === '"') { k = skipDouble(s, k); continue; }
    if (c === '`') { k = skipBacktick(s, k); continue; }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return k + 1;
    }
    k++;
  }
  return s.length;
}

/** After a `$`, skip an expansion that starts there. Returns the new index, or -1 for a bare `$`. */
function skipDollar(s, i) {
  const n = s[i + 1];
  if (n === '(') return skipParen(s, i + 1);
  if (n === '{') return s[i + 2] === '{' ? skipExpr(s, i) : skipBrace(s, i);
  return -1;
}

const asText = (t) => (t == null ? '' : String(t));
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

// ─── splitTopLevel ────────────────────────────────────────────────────────────

/**
 * splitTopLevel(text) -> string[]
 *
 * Splits on newline, `;` and `&&` — and ONLY at top level: never inside single/double quotes,
 * `$( )`, backticks, `${ }` or `${{ }}`, and never after a backslash. A single `|`, a `||` and a
 * lone `&` do not split. A `#` that starts a word comments out the rest of its line. Segments are
 * trimmed and empty ones removed.
 */
function splitTopLevel(text) {
  const s = asText(text);
  const out = [];
  let cur = '';
  const flush = () => {
    const t = cur.trim();
    if (t) out.push(t);
    cur = '';
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      if (s[i + 1] === '\n') { cur += ' '; i += 2; continue; } // an un-joined continuation
      cur += s.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === "'") { const j = skipSingle(s, i); cur += s.slice(i, j); i = j; continue; }
    if (c === '"') { const j = skipDouble(s, i); cur += s.slice(i, j); i = j; continue; }
    if (c === '`') { const j = skipBacktick(s, i); cur += s.slice(i, j); i = j; continue; }
    if (c === '$') {
      const j = skipDollar(s, i);
      if (j !== -1) { cur += s.slice(i, j); i = j; continue; }
    }
    if (c === '#' && (i === 0 || isSpace(s[i - 1]) || s[i - 1] === ';' || s[i - 1] === '&' || s[i - 1] === '(')) {
      while (i < s.length && s[i] !== '\n') i++; // drop the comment; the newline flushes next turn
      continue;
    }
    if (c === '\n' || c === ';') { flush(); i++; continue; }
    if (c === '&' && s[i + 1] === '&') { flush(); i += 2; continue; }
    cur += c;
    i++;
  }
  flush();
  return out;
}

// ─── Word splitting ───────────────────────────────────────────────────────────

/**
 * tokenize(text) -> [{ word, start, end }]
 *
 * Shell-ish word split. `word` has its quotes and escapes removed; `start`/`end` index the ORIGINAL
 * text, so the unmodified remainder of a command can be recovered after peeling a prefix.
 */
function tokenize(text) {
  const s = asText(text);
  const toks = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && isSpace(s[i])) i++;
    if (i >= s.length) break;
    const start = i;
    let word = '';
    while (i < s.length && !isSpace(s[i])) {
      const c = s[i];
      if (c === '\\') {
        if (i + 1 < s.length) word += s[i + 1];
        i += 2;
        continue;
      }
      if (c === "'") {
        const j = s.indexOf("'", i + 1);
        if (j === -1) { word += s.slice(i + 1); i = s.length; } else { word += s.slice(i + 1, j); i = j + 1; }
        continue;
      }
      if (c === '"') {
        const j = skipDouble(s, i);
        const closed = j - 1 > i && s[j - 1] === '"';
        const inner = s.slice(i + 1, closed ? j - 1 : j);
        word += inner.replace(/\\(["\\$`])/g, '$1');
        i = j;
        continue;
      }
      if (c === '`') { const j = skipBacktick(s, i); word += s.slice(i, j); i = j; continue; }
      if (c === '$') {
        const j = skipDollar(s, i);
        if (j !== -1) { word += s.slice(i, j); i = j; continue; }
      }
      word += c;
      i++;
    }
    toks.push({ word, start, end: Math.min(i, s.length) });
  }
  return toks;
}

/** splitWords(text) -> string[] — the argv of a command line (quotes removed). */
function splitWords(text) {
  return tokenize(text).map((t) => t.word);
}

// ─── Fragments ────────────────────────────────────────────────────────────────

/**
 * isFragment(text) -> boolean
 *
 * True for text that is not a command: empty, a comment, a bare flag (`-x`, `--x`), a leading
 * `$` token (`$VAR`, `$( )`, `${{ }}`), or an orphaned operator (`||`, `|`, `&`, `;`, `)`). These
 * are what is left when a continuation join was missed; they are dropped, never classified.
 */
function isFragment(text) {
  const t = asText(text).trim();
  if (!t) return true;
  if (t.startsWith('#')) return true;
  if (t.startsWith('-')) return true;
  if (t.startsWith('$')) return true;
  if (/^(\|\|?|&|;|\))/.test(t)) return true;
  return false;
}

// ─── Heredocs ─────────────────────────────────────────────────────────────────

/**
 * findHeredocs(line) -> [{ term, strip }]
 *
 * The heredoc operators on one logical line, in order. `<<<` (here-string) and `<<` inside quotes
 * or `$( )` are not heredocs. `strip` is true for `<<-` (leading tabs on the terminator ignored).
 */
function findHeredocs(line) {
  const s = asText(line);
  const found = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') { i += 2; continue; }
    if (c === "'") { i = skipSingle(s, i); continue; }
    if (c === '"') { i = skipDouble(s, i); continue; }
    if (c === '`') { i = skipBacktick(s, i); continue; }
    if (c === '$') {
      const j = skipDollar(s, i);
      if (j !== -1) { i = j; continue; }
    }
    if (c === '#' && (i === 0 || isSpace(s[i - 1]))) break;
    if (c === '<' && s[i + 1] === '<' && s[i + 2] !== '<' && s[i - 1] !== '<') {
      let k = i + 2;
      const strip = s[k] === '-';
      if (strip) k++;
      while (k < s.length && (s[k] === ' ' || s[k] === '\t')) k++;
      const m = /^(?:'([^']*)'|"([^"]*)"|\\?([A-Za-z_][A-Za-z0-9_]*))/.exec(s.slice(k));
      if (m) {
        const term = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3];
        if (term) found.push({ term, strip });
        i = k + m[0].length;
        continue;
      }
      i = k;
      continue;
    }
    i++;
  }
  return found;
}

// ─── Logical lines: continuations + heredocs ──────────────────────────────────

// An ODD number of trailing backslashes continues the line; an even number is a literal `\`.
// Trailing whitespace after the backslash is forgiven — editors strip it, and people meant it.
function continues(line) {
  const m = /(\\+)$/.exec(line.replace(/\s+$/, ''));
  return !!m && m[1].length % 2 === 1;
}

function toLogicalLines(input) {
  const raw = (Array.isArray(input) ? input : asText(input).split('\n')).map((l) => asText(l).replace(/\r$/, ''));
  const out = [];
  let i = 0;
  while (i < raw.length) {
    let line = raw[i++];
    const isComment = /^\s*#/.test(line);
    if (!isComment) {
      while (continues(line)) {
        const head = line.replace(/\s+$/, '').slice(0, -1).replace(/\s+$/, '');
        if (i >= raw.length) { line = head; break; }
        line = `${head} ${raw[i++].trim()}`;
      }
    }
    out.push(line);
    if (isComment) continue;
    // Skip the body of every heredoc this line opens, up to and including its terminator.
    for (const { term } of findHeredocs(line)) {
      while (i < raw.length) {
        const body = raw[i++];
        if (body.trim() === term) break;
      }
    }
  }
  return out;
}

// ─── Prefix peeling ───────────────────────────────────────────────────────────

const SUDO_ARG_FLAGS = new Set(['-u', '-g', '-h', '-p', '-C', '-D', '-R', '-T', '-U', '-r', '-t']);
const ENV_ARG_FLAGS = new Set(['-u', '-C', '-S']);

/** Consume `flags` after a wrapper word (`sudo -E -u root`); `argFlags` take one value. */
function skipFlags(rest, argFlags) {
  let r = rest;
  for (;;) {
    const toks = tokenize(r);
    if (!toks.length || !toks[0].word.startsWith('-') || toks[0].word === '--') {
      if (toks.length && toks[0].word === '--') r = r.slice(toks[0].end).trimStart();
      return r;
    }
    const takesArg = argFlags.has(toks[0].word) && toks.length > 1;
    const eat = takesArg ? toks[1].end : toks[0].end;
    r = r.slice(eat).trimStart();
  }
}

/**
 * peelPrefixes(segment) -> { text, env, subshell }
 *
 * Removes, repeatedly and in any order: grouping punctuation (`(` `{` `}`), control words that
 * introduce a command (`if`, `then`, `do`, `else`, `!`), `VAR=val` assignments (into `env`), and the
 * wrappers `sudo`, `time`, `env`, `nohup`, `exec`. What is left is the command proper.
 */
function peelPrefixes(segment) {
  let rest = asText(segment).trim();
  const env = {};
  let subshell = false;
  for (let guard = 0; guard < 64 && rest; guard++) {
    if (rest[0] === '(') { subshell = true; rest = rest.slice(1).trimStart(); continue; }
    const toks = tokenize(rest);
    if (!toks.length) { rest = ''; break; }
    const first = toks[0];
    const w = first.word;
    if (CONTROL_PREFIX.has(w)) { rest = rest.slice(first.end).trimStart(); continue; }
    if (ENV_ASSIGN.test(w)) {
      const eq = w.indexOf('=');
      env[w.slice(0, eq)] = w.slice(eq + 1);
      rest = rest.slice(first.end).trimStart();
      continue;
    }
    if (w === 'sudo') { rest = skipFlags(rest.slice(first.end).trimStart(), SUDO_ARG_FLAGS); continue; }
    if (w === 'time') { rest = skipFlags(rest.slice(first.end).trimStart(), new Set()); continue; }
    if (w === 'env') { rest = skipFlags(rest.slice(first.end).trimStart(), ENV_ARG_FLAGS); continue; }
    if (w === 'nohup' || w === 'exec') { rest = rest.slice(first.end).trimStart(); continue; }
    break;
  }
  // A subshell / group closer left on the tail: `( cd x && go vet )` splits into `go vet )`.
  let opens = 0;
  let closes = 0;
  for (const c of rest) { if (c === '(') opens++; else if (c === ')') closes++; }
  while (closes > opens && rest.endsWith(')')) { rest = rest.slice(0, -1).trimEnd(); closes--; }
  return { text: rest, env, subshell };
}

// ─── cd ───────────────────────────────────────────────────────────────────────

const WORKSPACE_PREFIX = /^(?:\$\{?GITHUB_WORKSPACE\}?|\$\{\{\s*github\.workspace\s*\}\})(?:\/|$)/;

/**
 * resolveCd(argv, cwd) -> string | null | undefined
 *
 * The cwd after `cd <dir>`: a repo-relative path, `null` for the repo root, or `undefined` when the
 * target cannot be resolved statically (`cd "$HOME"`, `cd -`, a bare `cd`) — the cwd is then left as is.
 */
function resolveCd(argv, cwd) {
  let dir = null;
  for (let k = 1; k < argv.length; k++) {
    const a = argv[k];
    if (a === '||' || a === '&&' || a === '|') break;
    if (a === '--' || (a.startsWith('-') && a !== '-')) continue;
    dir = a;
    break;
  }
  if (dir === null) return undefined;
  const ws = WORKSPACE_PREFIX.exec(dir);
  if (ws) dir = dir.slice(ws[0].length);
  if (dir === '') return null;
  if (dir === '-' || /^[~$]/.test(dir)) return undefined;
  if (dir.startsWith('/')) return dir;
  const joined = path.posix.normalize(cwd ? path.posix.join(cwd, dir) : dir).replace(/\/+$/, '');
  return joined === '.' || joined === '' ? null : joined;
}

// ─── Drop decision ────────────────────────────────────────────────────────────

function shouldDrop(tool, argv, text) {
  if (isFragment(text)) return true;
  if ((tool === 'test' || tool === '[' || tool === '[[') && /\$\(|`/.test(text)) return false;
  if (DROP_TOOLS.has(tool)) return true;
  const subs = DROP_SUBCOMMANDS[tool];
  if (subs && subs.has(argv[1])) return true;
  return false;
}

// ─── normalizeScript ──────────────────────────────────────────────────────────

/**
 * normalizeScript(input, { cwd = null } = {}) -> [{ text, tool, argv, cwd, env }]
 *
 * `input` is a string or an array of lines. `text` is the invocation with its prefixes stripped and
 * its quotes intact; `argv` is its shell word split with quotes removed (`argv[0]` is the tool);
 * `cwd` is the working directory after any `cd` (the `cwd` option seeds it; `null` = repo root);
 * `env` holds leading `VAR=val` assignments. A `cd` persists for the rest of the script, except
 * inside a `( ... )` subshell line, where it does not leak.
 */
function normalizeScript(input, { cwd = null } = {}) {
  const results = [];
  let curCwd = cwd == null || cwd === '' ? null : cwd;
  for (const line of toLogicalLines(input)) {
    if (/^\s*#/.test(line)) continue;
    let lineCwd = curCwd;
    let leaks = true;
    for (const segment of splitTopLevel(line)) {
      if (findHeredocs(segment).length) continue;
      const peeled = peelPrefixes(segment);
      if (peeled.subshell) leaks = false;
      const text = peeled.text.trim();
      if (!text) continue;
      const argv = splitWords(text);
      if (!argv.length) continue;
      const tool = argv[0];
      if (tool === 'cd' || tool === 'pushd') {
        const next = resolveCd(argv, lineCwd);
        if (next !== undefined) lineCwd = next;
        continue;
      }
      if (shouldDrop(tool, argv, text)) continue;
      results.push({ text, tool, argv, cwd: lineCwd, env: peeled.env });
    }
    if (leaks) curCwd = lineCwd;
  }
  return results;
}

module.exports = {
  normalizeScript,
  splitTopLevel,
  splitWords,
  isFragment,
  findHeredocs,
  DROP_TOOLS,
  DROP_SUBCOMMANDS,
};
