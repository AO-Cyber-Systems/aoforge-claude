'use strict';

/**
 * Tests for lib/wrappers/bash.cjs (TRD 20-05).
 *
 * Group BW: bash wrapper byte-identical to current watcher-shell.cjs logic.
 * Group EX-2: export surface lock.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');

const bash = require('./bash.cjs');

describe('wrappers/bash.cjs — Group BW', () => {
  test('BW-1 wrapCommand starts with __DFW_OUT=$(mktemp ...) line', () => {
    const lines = bash.wrapCommand('echo hello', 'h-1');
    assert.match(lines[0], /^__DFW_OUT=\$\(mktemp 2>\/dev\/null\)/);
  });

  test('BW-2 wrapCommand contains { echo hello ; } > $__DFW_OUT 2> $__DFW_ERR', () => {
    const lines = bash.wrapCommand('echo hello', 'h-1');
    assert.ok(lines.some((l) => l.includes('{ echo hello ; } > $__DFW_OUT 2> $__DFW_ERR')));
  });

  test('BW-3 wrapCommand contains __DFW_RC=$?', () => {
    const lines = bash.wrapCommand('echo x', 'h-1');
    assert.ok(lines.some((l) => l === '__DFW_RC=$?'));
  });

  test('BW-4 wrapCommand contains BEGIN/DELIM/END echo lines with id', () => {
    const lines = bash.wrapCommand('echo x', 'h-1');
    assert.ok(lines.some((l) => l === 'echo __DFW_BEGIN_h-1__'));
    assert.ok(lines.some((l) => l === 'echo __DFW_DELIM_h-1__'));
    assert.ok(lines.some((l) => l === 'echo __DFW_END_h-1__:$__DFW_RC'));
  });

  test('BW-5 initLines("pty") starts with stty -echo', () => {
    const init = bash.initLines('pty');
    assert.equal(init[0], 'stty -echo 2>/dev/null');
  });

  test('BW-6 initLines("pipe") does NOT include stty -echo', () => {
    const init = bash.initLines('pipe');
    assert.ok(!init.some((l) => l.includes('stty -echo')), 'pipe mode skips stty');
  });

  // Issue #95. `stty -echo` silences the tty driver and nothing readline writes
  // itself; readline >= 8.1 brackets every line it reads in ESC[?2004h /
  // ESC[?2004l, which lands inside the sentinel-fenced capture region on every
  // current Linux bash. The mode has to be turned off at the source, and this
  // asserts the directive is actually issued — the capture-side strip in
  // watcher-shell.cjs would otherwise hide its absence.
  test('BW-5b initLines("pty") disables readline bracketed-paste (bash)', () => {
    const init = bash.initLines('pty');
    assert.ok(
      init.some((l) => /bind\s+'set enable-bracketed-paste off'/.test(l)),
      'pty init must turn readline bracketed-paste off'
    );
  });

  test('BW-5c initLines("pty") also disables zsh bracketed-paste (zsh routes here)', () => {
    const init = bash.initLines('pty');
    assert.ok(
      init.some((l) => /unset zle_bracketed_paste/.test(l)),
      'pty init must unset zle_bracketed_paste for the zsh callers of this wrapper'
    );
  });

  test('BW-5d bracketed-paste directives run BEFORE the prompt/monitor lines', () => {
    // They must take effect before anything else is read, or the lines that
    // follow are themselves bracketed.
    const init = bash.initLines('pty');
    const bindAt = init.findIndex((l) => l.includes('enable-bracketed-paste'));
    const ps1At = init.findIndex((l) => l.startsWith("PS1="));
    assert.ok(bindAt >= 0 && ps1At >= 0);
    assert.ok(bindAt < ps1At, 'bracketed-paste must be disabled before later init lines are read');
  });

  test('BW-6b initLines("pipe") does NOT touch bracketed-paste (no TTY, no readline)', () => {
    const init = bash.initLines('pipe');
    assert.ok(!init.some((l) => l.includes('bracketed-paste')), 'pipe mode has no line editor');
    assert.ok(!init.some((l) => l.includes('zle_bracketed_paste')), 'pipe mode has no zle');
  });

  test('BW-7 shellArgs(true) returns ["-i"]; shellArgs(false) returns []', () => {
    assert.deepEqual(bash.shellArgs(true), ['-i']);
    assert.deepEqual(bash.shellArgs(false), []);
  });

  test('BW-8 lineSep is "\\n"', () => {
    assert.equal(bash.lineSep, '\n');
  });

  test('BW-9 wrapCommand byte-identical to current watcher-shell.cjs:354-374 logic', () => {
    // Hardcoded expected array — derived from watcher-shell.cjs:354-374
    // BEFORE the wrapper extraction. If the bash extraction is correct, this
    // assertion is the regression guard for v1.1+obj19 byte-identical
    // behavior.
    const id = 'h-byteid';
    const cmd = 'gh auth login';
    const begin = `__DFW_BEGIN_${id}__`;
    const delim = `__DFW_DELIM_${id}__`;
    const end = `__DFW_END_${id}__`;
    const expected = [
      '__DFW_OUT=$(mktemp 2>/dev/null) __DFW_ERR=$(mktemp 2>/dev/null)',
      `{ ${cmd} ; } > $__DFW_OUT 2> $__DFW_ERR`,
      '__DFW_RC=$?',
      `echo ${begin}`,
      'cat $__DFW_OUT 2>/dev/null',
      `echo ${delim}`,
      'cat $__DFW_ERR 2>/dev/null',
      `echo ${end}:$__DFW_RC`,
      'rm -f $__DFW_OUT $__DFW_ERR',
      '',
    ];
    const actual = bash.wrapCommand(cmd, id);
    assert.deepStrictEqual(actual, expected, 'byte-identical to v1.1+obj19 wrappedLines');
  });
});

// Objective 73, TRD 73-01: the PTY script protocol (gaps 1 and 2, Ctrl+C).
// Hand-built markers, no id plumbing: ptyScript only sees the three sentinel
// names the session hands it.
describe('wrappers/bash.cjs — objective 73 PTY script', () => {
  const markers = {
    begin: '__DFW_BEGIN_t-73__',
    delim: '__DFW_DELIM_t-73__',
    end: '__DFW_END_t-73__',
  };

  test('73-W-1 ptyScript lays out trap, BEGIN, the command on its own line, the fence, the restore and END', () => {
    const text = bash.ptyScript('doctl auth init', markers, { scriptPath: '/tmp/d/t-73.sh' });
    const lines = text.split('\n');
    const at = (needle, from = 0) => {
      const i = lines.findIndex((l, n) => n >= from && l === needle);
      assert.ok(i >= from, `expected line ${JSON.stringify(needle)} in ${JSON.stringify(lines)}`);
      return i;
    };
    const trap = at("trap ':' INT");
    const begin = at('echo __DFW_BEGIN_t-73__', trap);
    const open = at('{', begin);
    const cmd = at('doctl auth init', open);
    const close = at('}', cmd);
    const rc = at('__DFW_RC=$?', close);
    const restore = lines.findIndex((l, n) => n > rc && /^stty sane\b.*;\s*stty -echo\b/.test(l));
    assert.ok(restore > rc, 'expected the terminal restore (stty sane; stty -echo) after the RC capture');
    const delim = at('echo __DFW_DELIM_t-73__', restore);
    const end = at('echo __DFW_END_t-73__:$__DFW_RC', delim);
    at('trap - INT', end);
    assert.ok(open === begin + 1 && cmd === open + 1 && close === cmd + 1, 'the command sits alone between { and }');
  });

  test('73-W-2 ptyScript exports its own path as AOFW_SCRIPT, before anything runs', () => {
    const text = bash.ptyScript('true', markers, { scriptPath: '/tmp/a b/t-73.sh' });
    const lines = text.split('\n');
    assert.equal(lines[0], "AOFW_SCRIPT='/tmp/a b/t-73.sh'");
  });

  test('73-W-3 ptyScript keeps a trailing comment and an embedded newline on the command\'s own lines', () => {
    const text = bash.ptyScript('echo a # note\necho b', markers, { scriptPath: '/tmp/d/t.sh' });
    const lines = text.split('\n');
    const open = lines.indexOf('{');
    assert.deepStrictEqual(lines.slice(open + 1, open + 4), ['echo a # note', 'echo b', '}']);
  });

  test('73-W-4 sourceLine quotes the path: . \'<path>\'', () => {
    assert.equal(bash.sourceLine('/tmp/a b/x.sh'), ". '/tmp/a b/x.sh'");
  });

  test('73-W-5 sourceLine escapes a single quote in the path as \'\\\'\'', () => {
    assert.equal(bash.sourceLine("/tmp/it's/x.sh"), ". '/tmp/it'\\''s/x.sh'");
  });

  test('73-W-6 initLines("pty") never persists history; initLines("pipe") is unchanged', () => {
    const pty = bash.initLines('pty');
    assert.ok(pty.includes('unset HISTFILE 2>/dev/null'), 'pty init must unset HISTFILE');
    assert.ok(pty.includes('set +o history 2>/dev/null'), 'pty init must turn history off');
    assert.deepStrictEqual(bash.initLines('pipe'), [
      'set +o monitor 2>/dev/null',
      "PS1=''",
      "PS2=''",
      "PROMPT_COMMAND=''",
      'unset PROMPT_DIRTRIM',
    ]);
  });
});

describe('wrappers/bash.cjs — Group EX', () => {
  test('EX-2 module.exports keys are exactly the locked surface', () => {
    const keys = Object.keys(bash).sort();
    // ptyScript / sourceLine are the optional PTY-script pair (objective 73, TRD 73-01).
    assert.deepStrictEqual(keys, ['initLines', 'lineSep', 'ptyScript', 'shellArgs', 'shellName', 'sourceLine', 'wrapCommand']);
  });
});
