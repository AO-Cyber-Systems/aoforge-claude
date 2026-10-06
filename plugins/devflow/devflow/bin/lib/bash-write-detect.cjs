'use strict';

/**
 * bash-write-detect.cjs — TRD 60-02
 *
 * Reads a Bash command and says which files it writes. Pure: no fs, no child
 * process, no environment beyond `os.homedir()` as a default for `home`.
 *
 *   detectBashWrites(cmd, { cwd, home = os.homedir(), depth = 0 })
 *     -> [{ form, path, raw, segment, sources?, into? }]
 *
 *   form     redirect | tee | sed-i | perl-i | cp | mv | python | node
 *   path     an absolute path, or null when it cannot be resolved statically
 *            ($VAR, backticks, an unknown working directory)
 *   raw      the target as written in the command
 *   segment  index of the simple command in parseCommand(cmd).segments
 *   sources  cp and mv only: the absolute source operands
 *   into     cp and mv only: true when `path` is a directory the sources land in
 *
 * It decides nothing about policy. Whether a write is gated (tracked, inside
 * the project, not markdown, not .planning/) belongs to the edit gate.
 *
 * Contract:
 *   - Mentions are data. Heredoc bodies, quoted arguments, comments, `>` inside
 *     `[[ ]]` or `(( ))` and echo to stdout never match. Every shell operator is
 *     read from the MASKED words of shell-words.parseCommand, so text inside
 *     quotes or a heredoc body cannot be mistaken for syntax.
 *   - Executed text is not a mention. The program text of an interpreter is
 *     parsed: the operand of `bash -c`, a heredoc fed to a shell, and (python and
 *     node, TRD 60-02 Task 2) the `-c` / `-e` code or a heredoc on stdin. Shell
 *     recursion stops at depth 3.
 *   - Nothing is guessed. A target that cannot be resolved statically is
 *     reported with `path: null`; an ambiguous form is reported as no write.
 *
 * Accepted false negatives (this is a routing nudge, not a sandbox): a `>` in
 * the middle of a word (`a>b`), git operations (`git mv`, `git checkout -- f`,
 * `git apply`), `patch`, `rm`, `dd`, `install`, and writes made by awk, xargs or
 * `find -exec`. A `tee` or `cp` operand that is a glob is reported as written.
 *
 * Working directory: `cd` and `pushd` change the base for LATER simple commands
 * of the same command string. Subshell scoping `(cd x; ...)` is not modelled,
 * so a `cd` inside parentheses leaks to what follows. The error direction is a
 * wrong path, which the gate's tracked-file check absorbs. `popd`, `cd -` and a
 * `cd` argument that does not resolve make the base unknown (null).
 */

const os = require('os');
const path = require('path');
const { parseCommand, unquoteWord, resolvePathWord } = require('./shell-words.cjs');

const MAX_DEPTH = 3;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Resolve a raw (still-quoted) word to an absolute path, or null. `~` and `~/`
 * expand against the injected `home`; `~user` is unknown. A relative word with
 * an unknown base is null, and `path.resolve(null, ...)` is never reached.
 */
function resolveWord(raw, base, home) {
  if (typeof raw !== 'string' || /[$`]/.test(raw)) return null;
  if (raw === '~' || raw.startsWith('~/')) {
    if (typeof home !== 'string' || !path.isAbsolute(home)) return null;
    return path.resolve(home, '.' + unquoteWord(raw).slice(1));
  }
  if (raw.startsWith('~')) return null;
  const word = unquoteWord(raw);
  if (word === '') return null;
  if (!path.isAbsolute(word) && base == null) return null;
  return resolvePathWord(raw, base == null ? path.sep : base);
}

const DEVICE_RE = /^\/dev\//;

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

const ASSIGN_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** An option word: starts with `-` and is longer than `-` (a quoted `'-i'` is masked, so it is not one). */
const isOption = (w) => w.masked.length > 1 && w.masked[0] === '-';

/** The command name a word invokes, without directory or quoting. */
const commandName = (w) => path.posix.basename(unquoteWord(w.raw));

/**
 * Redirections of one simple command, read from masked words only.
 *
 * An output operator is a word that STARTS with an optional fd number or `&`
 * followed by `>`, `>>` or `>|`. The target is the rest of that word or the raw
 * text of the next word. `2>&1`, `>&2` and a `>` with no target are skipped.
 * Words starting with `<` (input, heredoc openers, here-strings) are never
 * writes, and a separate target word after them is consumed so it is not
 * mistaken for an operand.
 *
 * @returns {{redirects: Array<{raw: string}>, consumed: Set<number>}}
 *   consumed — indices of the operator and target words
 */
function scanRedirects(words) {
  const redirects = [];
  const consumed = new Set();
  for (let i = 0; i < words.length; i++) {
    const m = words[i].masked;
    if (/^\d*(?:<|<<|<<<|<<-)$/.test(m)) {
      consumed.add(i);
      if (i + 1 < words.length) consumed.add(++i);
      continue;
    }
    if (/^\d*</.test(m)) {
      consumed.add(i);
      continue;
    }
    const r = /^(\d+|&)?(>>|>\||>)([\s\S]*)$/.exec(m);
    if (!r) continue;
    const rest = r[3];
    if (rest === '') {
      consumed.add(i);
      if (i + 1 < words.length) {
        consumed.add(i + 1);
        redirects.push({ raw: words[i + 1].raw });
        i++;
      }
    } else if (rest[0] === '&' || rest[0] === '(') {
      consumed.add(i);
    } else {
      consumed.add(i);
      redirects.push({ raw: words[i].raw.slice(m.length - rest.length) });
    }
  }
  return { redirects, consumed };
}

/** Flags that take a separate value, per wrapper. */
const ENV_VALUE_FLAGS = new Set(['-u', '-C', '-S']);
const SUDO_VALUE_FLAGS = new Set(['-u', '-g', '-h', '-p', '-C', '-r', '-t', '-U', '-D', '-R', '-T']);

/**
 * Index of the command word, or -1. Leading `NAME=value` words are skipped, then
 * the wrappers env, command, sudo, nohup and time with their own flags. `command
 * -v NAME` only looks a command up, so it has no command word.
 */
function commandIndex(words, skip) {
  let i = 0;
  const live = () => {
    while (i < words.length && skip.has(i)) i++;
    return i < words.length;
  };
  while (live()) {
    const w = words[i];
    if (ASSIGN_RE.test(w.masked)) {
      i++;
      continue;
    }
    const name = commandName(w);
    if (name !== 'env' && name !== 'command' && name !== 'sudo' && name !== 'nohup' && name !== 'time') {
      return i;
    }
    i++;
    while (live()) {
      const f = words[i];
      if (ASSIGN_RE.test(f.masked) && (name === 'env' || name === 'sudo')) {
        i++;
      } else if (isOption(f)) {
        if (name === 'command' && (f.masked === '-v' || f.masked === '-V')) return -1;
        const takesValue =
          (name === 'env' && ENV_VALUE_FLAGS.has(f.masked)) ||
          (name === 'sudo' && SUDO_VALUE_FLAGS.has(f.masked));
        i += takesValue ? 2 : 1;
      } else {
        break;
      }
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// cd / pushd / popd
// ---------------------------------------------------------------------------

/** The base after a `cd` or `pushd` with these operands. */
function nextBase(name, args, base, home) {
  const operands = [];
  let opts = true;
  for (const w of args) {
    if (opts && w.masked === '--') {
      opts = false;
      continue;
    }
    if (opts && isOption(w) && !/^-\d+$/.test(w.masked)) continue;
    operands.push(w);
  }
  if (operands.length === 0) return name === 'cd' ? home : null;
  const arg = operands[0];
  if (arg.masked === '-') return null;
  if (name === 'pushd' && /^[+-]\d+$/.test(arg.masked)) return null;
  return resolveWord(arg.raw, base, home);
}

// ---------------------------------------------------------------------------
// tee, sed -i, perl -i
// ---------------------------------------------------------------------------

function teeTargets(args) {
  const out = [];
  let opts = true;
  for (const w of args) {
    if (opts && w.masked === '--') {
      opts = false;
      continue;
    }
    if (opts && isOption(w)) continue;
    if (w.masked === '-') continue;
    out.push(w);
  }
  return out;
}

/**
 * Files edited in place by `sed`/`gsed`, or [] when it is not in place.
 *
 * In place is a `-i` cluster (`-i`, `-i.bak`, `-ni`), `--in-place` or
 * `--in-place=SUFFIX`. A bare `-i` followed by an empty word (macOS) consumes it
 * as the suffix. `-e X`, `-f X` and their long forms give the script; without
 * one, the first operand is the script. Every remaining operand is a file.
 */
function sedInPlaceFiles(args) {
  let inPlace = false;
  let script = false;
  let opts = true;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const m = args[i].masked;
    if (opts) {
      if (m === '--') {
        opts = false;
        continue;
      }
      if (m === '--in-place' || m.startsWith('--in-place=')) {
        inPlace = true;
        continue;
      }
      if (m === '-i') {
        inPlace = true;
        if (i + 1 < args.length && /^(?:''|"")$/.test(args[i + 1].raw)) i++;
        continue;
      }
      if (/^-[nEsruz]*i/.test(m)) {
        inPlace = true;
        continue;
      }
      if (m === '-e' || m === '-f' || m === '--expression' || m === '--file') {
        script = true;
        i++;
        continue;
      }
      if (/^--(?:expression|file)=/.test(m)) {
        script = true;
        continue;
      }
      if (m === '-l' || m === '--line-length') {
        i++;
        continue;
      }
      if (isOption(args[i])) continue;
    }
    if (!script) {
      script = true;
      continue;
    }
    files.push(args[i]);
  }
  return inPlace ? files : [];
}

/**
 * Files edited in place by `perl -i`, or [] when it is not in place. In place is
 * a flag cluster that ends in `i` or `i.SUFFIX` (`-pi`, `-i.bak`), so `-Mstrict`
 * is not one. `-e X` and `-E X` consume their code. Without one, the first
 * operand is the program file.
 */
function perlInPlaceFiles(args) {
  let inPlace = false;
  let program = false;
  let opts = true;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const m = args[i].masked;
    if (opts) {
      if (m === '--') {
        opts = false;
        continue;
      }
      if (/^-[A-Za-z]*i(?:\.\S+)?$/.test(m)) {
        inPlace = true;
        continue;
      }
      if (/^-(?![MmIdDVxC])[A-Za-z]*[eE]$/.test(m)) {
        program = true;
        i++;
        continue;
      }
      if (isOption(args[i])) continue;
    }
    if (!program) {
      program = true;
      continue;
    }
    files.push(args[i]);
  }
  return inPlace ? files : [];
}

// ---------------------------------------------------------------------------
// cp / mv
// ---------------------------------------------------------------------------

/** True when a destination word is certainly a directory: a trailing slash, `.` or `..`. */
function looksLikeDirectory(raw) {
  const u = unquoteWord(raw);
  return u.endsWith('/') || u === '.' || u === '..' || /\/\.\.?$/.test(u);
}

/**
 * The write of one `cp` or `mv`, or null.
 *
 * `-t DIR`, `-DIRt` clusters and `--target-directory` make DIR the destination
 * and every operand a source. Otherwise the last operand is the destination.
 * `--` ends the options.
 */
function cpMvWrite(args, base, home) {
  const operands = [];
  let target = null;
  let opts = true;
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    const m = w.masked;
    if (opts && m === '--') {
      opts = false;
      continue;
    }
    if (opts && isOption(w)) {
      if (m === '--target-directory' || /^-[A-Za-z]*t$/.test(m)) {
        if (i + 1 >= args.length) return null;
        target = args[++i].raw;
      } else if (m.startsWith('--target-directory=')) {
        target = w.raw.slice('--target-directory='.length);
      } else if (m === '-S' || m === '--suffix') {
        i++;
      }
      continue;
    }
    operands.push(w);
  }
  const resolve = (w) => resolveWord(w.raw, base, home);
  if (target !== null) {
    if (operands.length === 0) return null;
    return { path: resolveWord(target, base, home), raw: target, sources: operands.map(resolve), into: true };
  }
  if (operands.length < 2) return null;
  const dest = operands[operands.length - 1];
  return {
    path: resolve(dest),
    raw: dest.raw,
    sources: operands.slice(0, -1).map(resolve),
    into: looksLikeDirectory(dest.raw),
  };
}

// ---------------------------------------------------------------------------
// Shells and interpreters
// ---------------------------------------------------------------------------

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash']);
const INTERPRETER_RE = /^(python(\d+(\.\d+)?)?|node)$/;

/** The body of the heredoc a segment owns (the last wins, as in the shell), or null. */
const heredocBody = (seg) => (seg.heredocs.length ? seg.heredocs[seg.heredocs.length - 1].body : null);

/**
 * The text a shell invocation executes: the operand of `-c` (including `-lc`),
 * or, when there is no script operand, the body of the heredoc on stdin. A
 * script operand (`bash run.sh <<EOF`) means the heredoc is that script's stdin,
 * which is data.
 */
function shellProgram(args, seg) {
  for (let i = 0; i < args.length; i++) {
    const m = args[i].masked;
    if (m === '--') return null;
    if (m === '-' || m === '-s') continue;
    if (/^-[A-Za-z]*c$/.test(m)) return i + 1 < args.length ? unquoteWord(args[i + 1].raw) : null;
    if (m === '-o' || m === '+o' || m === '-O' || m === '+O' || m === '--rcfile' || m === '--init-file') {
      i++;
      continue;
    }
    if (m[0] === '-' || m[0] === '+') continue;
    return null;
  }
  return heredocBody(seg);
}

/** inlineWrites is filled in by Task 2: the stub keeps the export stable. */
function inlineWrites() {
  return [];
}

// ---------------------------------------------------------------------------
// detectBashWrites
// ---------------------------------------------------------------------------

/**
 * @param {string} cmd
 * @param {{cwd?: string, home?: string, depth?: number}} [opts]
 * @returns {Array<{form: string, path: string|null, raw: string, segment: number,
 *   sources?: Array<string|null>, into?: boolean}>}
 */
function detectBashWrites(cmd, opts) {
  const { cwd, home = os.homedir(), depth = 0 } = opts || {};
  if (depth >= MAX_DEPTH) return [];
  if (typeof cmd !== 'string' || cmd === '') return [];
  const parsed = parseCommand(cmd);
  if (!parsed.ok) return [];

  let base = typeof cwd === 'string' && path.isAbsolute(cwd) ? path.resolve(cwd) : null;
  const out = [];

  for (const seg of parsed.segments) {
    const { redirects, consumed } = scanRedirects(seg.words);
    for (const r of redirects) {
      const p = resolveWord(r.raw, base, home);
      if (p !== null && DEVICE_RE.test(p)) continue;
      out.push({ form: 'redirect', path: p, raw: r.raw, segment: seg.index });
    }

    const k = commandIndex(seg.words, consumed);
    if (k < 0) continue;
    const name = commandName(seg.words[k]);
    const args = seg.words.slice(k + 1).filter((_, j) => !consumed.has(k + 1 + j));
    const emit = (form, p, raw, extra) =>
      out.push({ form, path: p, raw, segment: seg.index, ...extra });

    if (name === 'cd' || name === 'pushd') {
      base = nextBase(name, args, base, home);
    } else if (name === 'popd') {
      base = null;
    } else if (name === 'tee') {
      for (const w of teeTargets(args)) {
        const p = resolveWord(w.raw, base, home);
        if (p === null || !DEVICE_RE.test(p)) emit('tee', p, w.raw);
      }
    } else if (name === 'sed' || name === 'gsed') {
      for (const w of sedInPlaceFiles(args)) emit('sed-i', resolveWord(w.raw, base, home), w.raw);
    } else if (name === 'perl') {
      for (const w of perlInPlaceFiles(args)) emit('perl-i', resolveWord(w.raw, base, home), w.raw);
    } else if (name === 'cp' || name === 'mv') {
      const w = cpMvWrite(args, base, home);
      if (w) emit(name, w.path, w.raw, { sources: w.sources, into: w.into });
    } else if (SHELLS.has(name)) {
      const program = shellProgram(args, seg);
      if (program !== null) {
        for (const r of detectBashWrites(program, { cwd: base, home, depth: depth + 1 })) {
          out.push({ ...r, segment: seg.index });
        }
      }
    } else if (INTERPRETER_RE.test(name)) {
      // Inline python and node code: TRD 60-02 Task 2.
    }
  }
  return out;
}

/**
 * Cheap superset test for a hook: can this command possibly write? A false
 * `true` only costs a parse.
 */
function mayWrite(cmd) {
  return /[>]|\btee\b|\b(?:g?sed|perl|cp|mv|node)\b|\bpython|\b(?:ba|z|da)?sh\b/.test(String(cmd));
}

module.exports = { detectBashWrites, mayWrite, inlineWrites };
