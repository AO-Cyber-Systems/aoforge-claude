'use strict';

/**
 * shell-words.test.cjs — TRD 60-01
 *
 * Pure tests (no I/O) for the shell-text primitives the commit gate, the
 * session audit and the Bash write detector share. Named cases only.
 *
 * The moved primitives (test 2 and 3) keep the behaviour they had inside
 * hooks/gate-commits.js and session-audit.cjs. The new ones (extractHeredocs,
 * scanShell, parseCommand) are pinned by tests 4-10.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const shellWords = require('./shell-words.cjs');

const {
  stripHeredocs, stripQuoted, maskQuoted, unquoteWord, resolvePathWord,
  stripHeredocBodies, extractHeredocs, scanShell, maskTests, parseCommand,
} = shellWords;

/** The masked words of every segment, as strings, for compact assertions. */
const segWords = (cmd) => parseCommand(cmd).segments.map((s) => s.words.map((w) => w.masked).join(' '));

describe('1. identity: one definition, re-exported', () => {
  test('gate-commits re-exports the shell-words functions', () => {
    const gate = require('../../../hooks/gate-commits.js');
    assert.equal(gate.stripHeredocs, shellWords.stripHeredocs);
    assert.equal(gate.stripQuoted, shellWords.stripQuoted);
  });

  test('session-audit re-exports stripHeredocBodies', () => {
    const audit = require('./session-audit.cjs');
    assert.equal(audit.stripHeredocBodies, shellWords.stripHeredocBodies);
  });
});

describe('2. moved primitives keep their behaviour', () => {
  test('stripHeredocs drops the body and terminator', () => {
    assert.equal(stripHeredocs("cat > f <<'EOF'\nx\nEOF"), 'cat > f  <<HEREDOC ');
  });

  test('stripQuoted blanks quoted contents', () => {
    assert.equal(stripQuoted('a "b" \'c\''), 'a "" \'\'');
  });

  test('maskQuoted keeps the length and the quote characters', () => {
    const masked = maskQuoted('x "ab" y');
    assert.equal(masked, 'x "__" y');
    assert.equal(masked.length, 'x "ab" y'.length);
  });

  test('unquoteWord removes one level of shell quoting', () => {
    assert.equal(unquoteWord('\'a\'"b"\\c'), 'abc');
  });

  test('resolvePathWord: expansion is unresolvable', () => {
    assert.equal(resolvePathWord('"$X/a"', '/r'), null);
  });

  test('resolvePathWord: relative path resolves against the base', () => {
    assert.equal(resolvePathWord('src/a', '/r'), '/r/src/a');
  });

  test('resolvePathWord: ~/ resolves under the home directory', () => {
    assert.equal(resolvePathWord('~/n', '/r'), path.join(os.homedir(), 'n'));
  });
});

describe('3. stripHeredocBodies keeps the opener line', () => {
  test('the redirect on the opener line survives, the body does not', () => {
    assert.equal(
      stripHeredocBodies("cat <<'EOF' > src/a.go\nbody > x\nEOF"),
      "cat <<'EOF' > src/a.go"
    );
  });
});

describe('4. extractHeredocs', () => {
  test('two heredocs come back in order with delimiter, quoted, body and opener', () => {
    const cmd = "cat <<'A' > x\nbody a\nA\ncat <<\"B\"\nline1\nline2\nB";
    const { text, heredocs } = extractHeredocs(cmd);
    assert.equal(text, "cat <<'A' > x\ncat <<\"B\"");
    assert.equal(heredocs.length, 2);

    assert.equal(heredocs[0].delimiter, 'A');
    assert.equal(heredocs[0].quoted, true);
    assert.equal(heredocs[0].body, 'body a');
    assert.equal(heredocs[0].opener, text.indexOf("<<'A'"));

    assert.equal(heredocs[1].delimiter, 'B');
    assert.equal(heredocs[1].quoted, true);
    assert.equal(heredocs[1].body, 'line1\nline2');
    assert.equal(heredocs[1].opener, text.indexOf('<<"B"'));
    assert.equal(text.slice(heredocs[1].opener, heredocs[1].opener + 2), '<<');
  });

  test('an unquoted delimiter is quoted: false', () => {
    const { heredocs } = extractHeredocs('cat <<EOF\nx\nEOF');
    assert.equal(heredocs.length, 1);
    assert.equal(heredocs[0].quoted, false);
    assert.equal(heredocs[0].body, 'x');
  });

  test('<<-EOF with a tab-indented terminator is recognised', () => {
    const { text, heredocs } = extractHeredocs('cat <<-EOF\n\tbody\n\tEOF');
    assert.equal(text, 'cat <<-EOF');
    assert.equal(heredocs.length, 1);
    assert.equal(heredocs[0].delimiter, 'EOF');
    assert.equal(heredocs[0].body, '\tbody');
  });

  test('an unterminated heredoc is left in the text', () => {
    const cmd = "cat <<'EOF'\nbody never closed";
    const { text, heredocs } = extractHeredocs(cmd);
    assert.equal(text, cmd);
    assert.deepEqual(heredocs, []);
  });

  test('text agrees with stripHeredocBodies', () => {
    const cmd = "cat <<'EOF' > src/a.go\nbody > x\nEOF\necho done";
    assert.equal(extractHeredocs(cmd).text, stripHeredocBodies(cmd));
  });
});

describe('5. scanShell quotes', () => {
  test('quoted contents are masked and nothing moves', () => {
    const src = 'echo "a > b" \'c > d\'';
    const { ok, masked } = scanShell(src);
    assert.equal(ok, true);
    assert.equal(masked, 'echo "_____" \'_____\'');
    assert.equal(masked.length, src.length);
  });

  test('an escaped double quote does not close the string', () => {
    const { ok, masked } = scanShell('echo "a \\" b" c');
    assert.equal(ok, true);
    assert.equal(masked, 'echo "______" c');
  });

  test('an escaped single quote outside quotes opens nothing', () => {
    const { ok, masked } = scanShell("echo it\\'s 'q'");
    assert.equal(ok, true);
    assert.equal(masked, "echo it\\'s '_'");
  });

  test("$'it\\'s' is one quoted word", () => {
    const { ok, masked } = scanShell("echo $'it\\'s' x");
    assert.equal(ok, true);
    assert.equal(masked, "echo $'_____' x");
  });

  test('an unterminated quote is ok: false', () => {
    assert.equal(scanShell('echo "open').ok, false);
    assert.equal(scanShell("echo 'open").ok, false);
  });

  test('the empty string scans clean', () => {
    assert.deepEqual(scanShell(''), { ok: true, masked: '' });
  });
});

describe('6. scanShell comments', () => {
  test('a comment is blanked from # to the end of the line', () => {
    const { ok, masked } = scanShell('ls # x > y');
    assert.equal(ok, true);
    assert.equal(masked, 'ls ' + ' '.repeat(7));
  });

  test('a#b, $# and ${#x} are not comments', () => {
    const src = 'echo a#b $# ${#x}';
    assert.equal(scanShell(src).masked, src);
  });

  test('a quoted # is not a comment', () => {
    assert.equal(scanShell('echo "# not"').masked, 'echo "_____"');
  });

  test('# opens a comment after a separator too', () => {
    assert.equal(scanShell('ls;# gone').masked, 'ls;' + ' '.repeat(6));
  });

  test("an apostrophe inside a comment opens no quote", () => {
    const { ok, masked } = scanShell("# don't\nls 'q'");
    assert.equal(ok, true);
    assert.equal(masked, ' '.repeat(7) + "\nls '_'");
  });
});

describe('7. scanShell operators that are not writes', () => {
  test('$(( 3 > 2 )) masks its contents', () => {
    const src = 'echo $(( 3 > 2 ))';
    const { ok, masked } = scanShell(src);
    assert.equal(ok, true);
    assert.equal(masked, 'echo $((' + '_'.repeat(' 3 > 2 '.length) + '))');
    assert.equal(masked.length, src.length);
  });

  test('(( i > 0 )) masks its contents', () => {
    const { masked } = scanShell('(( i > 0 )) && echo yes');
    assert.equal(masked, '((' + '_'.repeat(' i > 0 '.length) + ')) && echo yes');
  });

  test('nested parentheses inside arithmetic are matched by depth', () => {
    const src = '$(( (1 + 2) * 3 ))';
    assert.equal(scanShell(src).masked, '$((' + '_'.repeat(' (1 + 2) * 3 '.length) + '))');
  });

  test('a subshell that starts with ( ( is not arithmetic', () => {
    const src = '((cd a && ls) | wc)';
    assert.equal(scanShell(src).masked, src);
  });

  test('[[ "$a" > "$b" ]] masks the contents between [[ and ]]', () => {
    const src = '[[ "$a" > "$b" ]] && echo yes';
    const { ok, masked } = scanShell(src);
    assert.equal(ok, true);
    assert.equal(masked, '[[' + '_'.repeat(' "$a" > "$b" '.length) + ']] && echo yes');
    assert.equal(masked.length, src.length);
  });

  test('maskTests is idempotent on scanShell output', () => {
    const { masked } = scanShell('echo $(( 3 > 2 )) && [[ a > b ]]');
    assert.equal(maskTests(masked), masked);
  });
});

describe('8. parseCommand segmentation', () => {
  test('&& || ; | & split into six segments', () => {
    const r = parseCommand('a && b || c; d | e & f');
    assert.equal(r.ok, true);
    assert.equal(r.segments.length, 6);
    assert.deepEqual(segWords('a && b || c; d | e & f'), ['a', 'b', 'c', 'd', 'e', 'f']);
  });

  test('segments are numbered in order', () => {
    const r = parseCommand('a && b; c');
    assert.deepEqual(r.segments.map((s) => s.index), [0, 1, 2]);
  });

  test('2>&1 is a redirection, not a separator', () => {
    const r = parseCommand('cmd 2>&1 | tail');
    assert.equal(r.segments.length, 2);
    assert.deepEqual(r.segments[0].words.map((w) => w.masked), ['cmd', '2>&1']);
  });

  test('>&2 and <&0 are redirections', () => {
    assert.equal(parseCommand('echo x >&2').segments.length, 1);
    assert.equal(parseCommand('cat <&0').segments.length, 1);
  });

  test('&> and &>> stay one segment', () => {
    assert.equal(parseCommand('make &> log').segments.length, 1);
    assert.equal(parseCommand('make &>> log').segments.length, 1);
  });

  test('>| stays one segment', () => {
    const r = parseCommand('echo x >| f');
    assert.equal(r.segments.length, 1);
    assert.deepEqual(r.segments[0].words.map((w) => w.masked), ['echo', 'x', '>|', 'f']);
  });

  test('a backslash-newline continuation stays one segment', () => {
    const r = parseCommand('a \\\n b');
    assert.equal(r.segments.length, 1);
    assert.deepEqual(r.segments[0].words.map((w) => w.masked), ['a', 'b']);
  });

  test('a newline splits', () => {
    assert.deepEqual(segWords('a\nb'), ['a', 'b']);
  });

  test('(cd x && y) gives cd x and y, and empty segments are dropped', () => {
    assert.deepEqual(segWords('(cd x && y)'), ['cd x', 'y']);
  });

  test('a separator inside quotes never splits', () => {
    assert.equal(parseCommand('echo "a && b; c" | d').segments.length, 2);
  });

  test('an escaped ; is part of a word, not a separator', () => {
    const r = parseCommand('find . -name x -exec rm {} \\; -print');
    assert.equal(r.segments.length, 1);
    assert.equal(r.segments[0].words.map((w) => w.masked).includes('\\;'), true);
  });

  test('an escaped space keeps a word whole', () => {
    const r = parseCommand('cp a\\ b dest');
    assert.deepEqual(r.segments[0].words.map((w) => w.raw), ['cp', 'a\\ b', 'dest']);
  });

  test('every word carries masked, raw and its offset', () => {
    const cmd = 'echo "a b"';
    const r = parseCommand(cmd);
    const w = r.segments[0].words[1];
    assert.equal(w.masked, '"___"');
    assert.equal(w.raw, '"a b"');
    assert.equal(r.text.slice(w.start, w.start + w.raw.length), '"a b"');
  });

  test('segment start/end bound its words', () => {
    const r = parseCommand('ab && cd');
    for (const s of r.segments) {
      for (const w of s.words) {
        assert.ok(w.start >= s.start && w.start + w.raw.length <= s.end);
      }
    }
  });

  test('a comment is not a segment', () => {
    assert.deepEqual(segWords('# regenerate\necho x > src/a.js'), ['echo x > src/a.js']);
  });
});

describe('9. parseCommand heredoc ownership', () => {
  test('the body belongs to the python3 segment, not to cd sub', () => {
    const r = parseCommand("cd sub && python3 - <<'EOF'\nprint(1)\nEOF");
    assert.equal(r.ok, true);
    assert.equal(r.segments.length, 2);
    assert.deepEqual(r.segments[0].heredocs, []);
    assert.equal(r.segments[1].index, 1);
    assert.equal(r.segments[1].heredocs.length, 1);
    assert.equal(r.segments[1].heredocs[0].body, 'print(1)');
    assert.equal(r.segments[1].words[0].masked, 'python3');
  });

  test('the redirect after the opener stays in the same segment', () => {
    const r = parseCommand("cat <<'EOF' > f\nx\nEOF");
    assert.equal(r.segments.length, 1);
    const masked = r.segments[0].words.map((w) => w.masked);
    assert.ok(masked.includes('>'));
    assert.ok(masked.includes('f'));
    assert.equal(r.segments[0].heredocs[0].body, 'x');
  });

  test('text in a heredoc body is not parsed as commands', () => {
    const r = parseCommand("cat <<'EOF'\nsed -i 's/a/b/' src/a.js\necho x > src/a.js\nEOF");
    assert.equal(r.segments.length, 1);
    assert.deepEqual(r.segments[0].words.map((w) => w.masked), ['cat', "<<'___'"]);
  });
});

describe('10. parseCommand on unbalanced input', () => {
  test('an unterminated quote is ok: false with no segments', () => {
    const r = parseCommand('echo "open > x');
    assert.equal(r.ok, false);
    assert.deepEqual(r.segments, []);
  });

  test('empty and non-string input give no segments', () => {
    assert.deepEqual(parseCommand('').segments, []);
    assert.deepEqual(parseCommand(null).segments, []);
    assert.equal(parseCommand(undefined).ok, true);
  });
});
