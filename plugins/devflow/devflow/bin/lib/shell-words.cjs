'use strict';

/**
 * shell-words.cjs — TRD 60-01
 *
 * Shell-text primitives, pure and I/O-free. Heredoc bodies and quoted
 * arguments are DATA, not invocations: that is the rule that keeps an analyser
 * of command text from firing on a command that merely mentions a phrase.
 *
 * Three groups:
 *
 *   Moved verbatim (the commit gate and the session audit used to hold these,
 *   and nothing under devflow/bin/lib/ can require a file in hooks/, because the
 *   ~/.claude/devflow mirror carries devflow/ only):
 *     stripHeredocs, stripQuoted, maskQuoted, unquoteWord, resolvePathWord,
 *     stripHeredocBodies
 *
 *   New (TRD 60-01):
 *     extractHeredocs  heredoc bodies as well as the stripped text
 *     scanShell        one left-to-right scan that masks quotes, comments,
 *                      arithmetic `(( ))` and `[[ ]]` tests
 *     maskTests        the arithmetic / `[[ ]]` masker scanShell finishes with
 *     parseCommand     simple commands with masked and raw words and their heredocs
 *
 * Contract for every masking function: the result has EXACTLY the length of the
 * input, so a word found in the masked text is read back from the raw text by
 * the same offsets. Nothing here ever moves an offset.
 *
 * Known limits (all in the fail-open direction, or inherited from gate-commits):
 *   - A quote inside `$( ... )` inside double quotes is not tracked separately.
 *   - A `<<WORD` that sits inside a quoted string still opens a heredoc.
 *   - `cat <<< word` followed by a line that is exactly `word` reads as a heredoc.
 */

const os = require('os');
const path = require('path');

// ---------------------------------------------------------------------------
// Moved from hooks/gate-commits.js (TRD 27-04, objective 44 AUT-04)
// ---------------------------------------------------------------------------

/**
 * Remove heredoc BODIES from a command string (TRD 27-04).
 *
 * `cat > f <<'EOF' ... EOF` bodies are file content, not commands. Leaving them
 * in meant any script, doc, or test fixture whose text merely mentioned the raw
 * commit phrase was refused — reproduced live while writing the 2026-08-18
 * audit, where an analysis script containing it as a regex literal was blocked.
 */
function stripHeredocs(cmd) {
  return cmd.replace(
    /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$/gm,
    ' <<HEREDOC '
  );
}

/**
 * Blank out quoted string contents so a mention inside an argument (echo,
 * grep pattern, commit message body) is not read as an invocation.
 */
function stripQuoted(cmd) {
  return cmd
    .replace(/'[^']*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

/**
 * Blank quoted-string CONTENTS without moving anything: the quote characters
 * stay and every character between them becomes `_`. Offsets into the result
 * are offsets into the input, so a word can be located in the masked text
 * (where quoting can neither fake a separator nor an invocation, exactly as
 * with stripQuoted) and then read back verbatim from the unmasked text.
 */
function maskQuoted(cmd) {
  return cmd.replace(
    /'[^']*'|"(?:[^"\\]|\\[\s\S])*"/g,
    (m) => m[0] + '_'.repeat(m.length - 2) + m[m.length - 1]
  );
}

/** Remove one level of shell quoting from a single word (best effort). */
function unquoteWord(word) {
  let out = '';
  for (let i = 0; i < word.length; i++) {
    const c = word[i];
    if (c === "'") {
      const j = word.indexOf("'", i + 1);
      const end = j === -1 ? word.length : j;
      out += word.slice(i + 1, end);
      i = end;
    } else if (c === '"') {
      let j = i + 1;
      while (j < word.length && word[j] !== '"') {
        if (word[j] === '\\' && '$`"\\'.includes(word[j + 1] || '')) j++;
        out += word[j];
        j++;
      }
      i = j;
    } else if (c === '\\' && i + 1 < word.length) {
      out += word[++i];
    } else {
      out += c;
    }
  }
  return out;
}

/**
 * Resolve a raw (still-quoted) path word against `base`. Returns null when the
 * word can't be resolved statically — any `$` or backtick expansion — so the
 * caller treats the target as unknown rather than guessing.
 */
function resolvePathWord(raw, base) {
  if (typeof raw !== 'string' || /[$`]/.test(raw)) return null;
  let p = unquoteWord(raw);
  if (p === '') return null;
  if (raw === '~' || raw.startsWith('~/')) p = path.join(os.homedir(), p.slice(1));
  return path.resolve(base, p);
}

// ---------------------------------------------------------------------------
// Moved from lib/session-audit.cjs (quick 31)
// ---------------------------------------------------------------------------

/**
 * Heredoc body + terminator. Adapted from hooks/gate-commits.js stripHeredocs,
 * but it keeps the OPENER LINE (`$1` is `<<'EOF'`, `$4` is the rest of that
 * line), so `cat <<'EOF' > src/a.go` still exposes `> src/a.go`. Only the body
 * and the terminator are dropped, which is what keeps `see > src/a.go` inside a
 * heredoc body from reading as a write.
 */
const HEREDOC_BODY_RE = /(<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2)([^\n]*)\n[\s\S]*?^[ \t]*\3[ \t]*$/gm;
const stripHeredocBodies = cmd => String(cmd).replace(HEREDOC_BODY_RE, '$1$4');

// ---------------------------------------------------------------------------
// New (TRD 60-01)
// ---------------------------------------------------------------------------

/**
 * Like stripHeredocBodies, but returns the bodies too, so an interpreter's
 * heredoc (`python3 - <<'EOF'`) can be read as code while every other heredoc
 * stays data.
 *
 * @param {string} cmd
 * @returns {{text: string, heredocs: Array<{delimiter: string, quoted: boolean, body: string, opener: number}>}}
 *   text     — the command with every body and terminator removed (equal to
 *              stripHeredocBodies(cmd)); opener lines, redirects included, stay
 *   delimiter— the terminator word
 *   quoted   — true for `<<'EOF'` / `<<"EOF"`
 *   body     — the lines between the opener line and the terminator, without
 *              the terminator and without the trailing newline
 *   opener   — offset of the `<<` in the returned `text`
 *
 * An unterminated heredoc is not matched: it stays in `text` and is not listed.
 */
function extractHeredocs(cmd) {
  const src = String(cmd == null ? '' : cmd);
  const heredocs = [];
  let removed = 0;
  const text = src.replace(HEREDOC_BODY_RE, (m, opener, quote, delimiter, rest, offset) => {
    const kept = opener + rest;
    const tail = m.slice(kept.length + 1);
    const nl = tail.lastIndexOf('\n');
    heredocs.push({
      delimiter,
      quoted: quote !== '',
      body: nl === -1 ? '' : tail.slice(0, nl),
      opener: offset - removed,
    });
    removed += m.length - kept.length;
    return kept;
  });
  return { text, heredocs };
}

/** Write `_` over a quoted run. Returns the closing quote's index, or -1 if unterminated. */
function maskUntil(src, out, from, quote, escapes) {
  let j = from;
  while (j < src.length) {
    if (escapes && src[j] === '\\') {
      out[j] = '_';
      if (j + 1 < src.length) out[j + 1] = '_';
      j += 2;
      continue;
    }
    if (src[j] === quote) return j;
    out[j] = '_';
    j++;
  }
  return -1;
}

/**
 * One left-to-right scan over shell text.
 *
 * States: normal, single quote, double quote, ANSI `$'...'` (where `\'` escapes)
 * and comment. Quoted contents become `_` and comments become spaces; the quote
 * characters themselves stay. A backslash outside quotes escapes the next
 * character, so `\'` opens nothing and `\"` opens nothing. A `#` starts a
 * comment only at the start of a word: at text start or after whitespace or one
 * of `;&|()`, so `a#b`, `$#` and `${#x}` are not comments. A comment ends at the
 * newline, which is kept. Because comments are blanked in the same pass, an
 * apostrophe inside one cannot open a quote.
 *
 * The scan finishes with maskTests, so the arithmetic `(( ))` and `$(( ))`
 * contents and the `[[ ]]` contents are masked too (`>` inside them is a
 * comparison, not a redirect).
 *
 * @param {string} text
 * @returns {{ok: boolean, masked: string}} `masked` has exactly the input's
 *   length. `ok` is false on an unterminated quote.
 */
function scanShell(text) {
  const src = String(text == null ? '' : text);
  const out = src.split('');
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '\\') {
      i += 2;
    } else if (c === '#' && (i === 0 || /[\s;&|()]/.test(src[i - 1]))) {
      while (i < n && src[i] !== '\n') {
        out[i] = ' ';
        i++;
      }
    } else if (c === "'" || c === '"') {
      const close = maskUntil(src, out, i + 1, c, c === '"');
      if (close === -1) return { ok: false, masked: out.join('') };
      i = close + 1;
    } else if (c === '$' && src[i + 1] === "'") {
      const close = maskUntil(src, out, i + 2, "'", true);
      if (close === -1) return { ok: false, masked: out.join('') };
      i = close + 1;
    } else {
      i++;
    }
  }
  return { ok: true, masked: maskTests(out.join('')) };
}

/**
 * Index of the first `)` of the `))` that closes an arithmetic expression whose
 * `((` ended just before `from`, or -1 when this is not arithmetic. Parentheses
 * inside are matched by depth. `((cd a && ls) | wc)` is a subshell: a lone `)`
 * at depth 2 means it is not arithmetic.
 */
function arithClose(s, from) {
  let depth = 2;
  for (let j = from; j < s.length; j++) {
    const c = s[j];
    if (c === '(') {
      depth++;
    } else if (c === ')') {
      if (depth === 2) return s[j + 1] === ')' ? j : -1;
      depth--;
    }
  }
  return -1;
}

const atWordStart = (s, i) => i === 0 || /[\s;&|()]/.test(s[i - 1]);

/**
 * Mask the contents of `$(( ))`, `(( ))` and `[[ ]]` with `_`, keeping the
 * delimiters. Meant for text whose quotes are already masked. Length-preserving
 * and idempotent. An unclosed `((` or `[[` is left alone.
 *
 * @param {string} masked
 * @returns {string}
 */
function maskTests(masked) {
  const s = String(masked);
  const out = s.split('');
  const n = s.length;
  let i = 0;
  while (i < n) {
    let close = -1;
    if (s[i] === '(' && s[i + 1] === '(') {
      close = arithClose(s, i + 2);
    } else if (s[i] === '[' && s[i + 1] === '[' && atWordStart(s, i) && /\s/.test(s[i + 2] || '')) {
      close = s.indexOf(']]', i + 2);
    }
    if (close === -1) {
      i++;
      continue;
    }
    for (let k = i + 2; k < close; k++) out[k] = '_';
    i = close + 2;
  }
  return out.join('');
}

/**
 * [start, end) of every piece of `masked` between separators.
 *
 * Separators: `&&`, `||`, `;`, `|`, `&`, `(`, `)` and newline. A redirection
 * operator is never split: `|` directly after `>` (`>|`), and `&` directly before
 * `>` (`&>`, `&>>`) or directly after `>` or `<` (`>&2`, `2>&1`, `<&0`). A
 * backslash escapes the next character, so `\;` is part of a word. Quoted
 * separators are already masked by scanShell.
 */
function splitBounds(masked) {
  const bounds = [];
  let start = 0;
  const cut = (end, next) => {
    bounds.push([start, end]);
    start = next;
  };
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    const next = masked[i + 1];
    const prev = i > 0 ? masked[i - 1] : '';
    if (c === '\\') {
      i++;
    } else if (c === '&') {
      if (next === '&') {
        cut(i, i + 2);
        i++;
      } else if (next !== '>' && prev !== '>' && prev !== '<') {
        cut(i, i + 1);
      }
    } else if (c === '|') {
      if (prev === '>') continue;
      if (next === '|') {
        cut(i, i + 2);
        i++;
      } else {
        cut(i, i + 1);
      }
    } else if (c === ';' || c === '(' || c === ')' || c === '\n') {
      cut(i, i + 1);
    }
  }
  bounds.push([start, masked.length]);
  return bounds;
}

/** A word is a run of non-space characters, where a backslash keeps the next one (`a\ b`). */
const WORD_RE = /(?:\\[\s\S]|\S)+/g;

/**
 * Split a command into simple commands.
 *
 * Order: extractHeredocs, join backslash-newline continuations to two spaces
 * (so offsets stay put), scanShell, split on the separators of splitBounds, then
 * words. Segments that are blank (the empty piece between `&&` and `(`, a
 * comment-only line) are dropped. Each heredoc is attached to the segment whose
 * [start, end) contains its opener, so `cd sub && python3 - <<'EOF'` gives the
 * body to the python3 segment, not to `cd sub`.
 *
 * `ok: false` (an unterminated quote) returns no segments. Callers treat that as
 * "no writes", which is the fail-open direction.
 *
 * @param {string} cmd
 * @returns {{ok: boolean, text: string, segments: Array<{
 *   index: number, start: number, end: number,
 *   words: Array<{masked: string, raw: string, start: number}>,
 *   heredocs: Array<{delimiter: string, quoted: boolean, body: string, opener: number}>
 * }>}}
 *   text — the command after heredoc removal and continuation joining; every
 *          offset in a result indexes into it
 */
function parseCommand(cmd) {
  const { text, heredocs } = extractHeredocs(String(cmd == null ? '' : cmd));
  const joined = text.replace(/\\\n/g, '  ');
  const { ok, masked } = scanShell(joined);
  if (!ok) return { ok: false, text: joined, segments: [] };

  const segments = [];
  for (const [start, end] of splitBounds(masked)) {
    const seg = masked.slice(start, end);
    if (!/\S/.test(seg)) continue;
    const words = [];
    for (const m of seg.matchAll(WORD_RE)) {
      const at = start + m.index;
      words.push({ masked: m[0], raw: joined.slice(at, at + m[0].length), start: at });
    }
    segments.push({
      index: segments.length,
      start,
      end,
      words,
      heredocs: heredocs.filter((h) => h.opener >= start && h.opener < end),
    });
  }
  return { ok: true, text: joined, segments };
}

module.exports = {
  stripHeredocs,
  stripQuoted,
  maskQuoted,
  unquoteWord,
  resolvePathWord,
  stripHeredocBodies,
  extractHeredocs,
  scanShell,
  maskTests,
  parseCommand,
};
