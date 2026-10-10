'use strict';

/**
 * Tests for interactive-commands.cjs — TRD 73-10
 *
 * The one per-invocation matcher behind hooks/gate-interactive.js (and, from TRD
 * 73-12, the watch daemon's allowlist). Quoted text and heredoc bodies are data;
 * each simple command is matched on its own, with its own flags.
 *
 * Test list (TRD 73-10 items):
 *   7-10, 13-17  rows of the shared case table (__fixtures__/interactive-command-cases.cjs)
 *   17b          matchInvocations reports the skipped form
 *   18           sshKeygenFlags, getopt style
 *   labels       every pattern label appears in some GATED row, and labels are unique
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');

const {
  INTERACTIVE_PATTERNS,
  CMD_POS,
  sshKeygenFlags,
  matchInvocations,
  detectInteractive,
} = require('./interactive-commands.cjs');
const { GATED_CASES, NOT_GATED_CASES } = require('./__fixtures__/interactive-command-cases.cjs');

const show = (cmd) => JSON.stringify(cmd);

describe('interactive-commands — NOT_GATED_CASES are never gated (items 7-10)', () => {
  for (const row of NOT_GATED_CASES) {
    test(`null: ${show(row.cmd)} (${row.why})`, () => {
      assert.strictEqual(detectInteractive(row.cmd), null);
    });
  }
});

describe('interactive-commands — GATED_CASES are gated, with the right label and segment (items 12-17)', () => {
  for (const row of GATED_CASES) {
    test(`gated: ${show(row.cmd)} -> ${row.label}`, () => {
      const hit = detectInteractive(row.cmd);
      assert.ok(hit, `expected a hit for ${show(row.cmd)}`);
      assert.equal(hit.label, row.label);
      assert.equal(hit.segment, row.segment);
      assert.equal(typeof hit.reason, 'string');
      assert.ok(hit.category === 'tty' || hit.category === 'shell-flow', `category: ${hit.category}`);
    });
  }
});

describe('interactive-commands — specific shapes', () => {
  test('13. a new key with no -N is gated and the segment is the call', () => {
    const hit = detectInteractive('ssh-keygen -t ed25519 -f k');
    assert.ok(hit);
    assert.equal(hit.segment, 'ssh-keygen -t ed25519 -f k');
    assert.equal(hit.compound, false, 'one call: not compound');
  });

  test('14. -y without -P is gated, -N does not cover -y, -P does', () => {
    assert.ok(detectInteractive('ssh-keygen -y -f k'));
    assert.ok(detectInteractive('ssh-keygen -y -N "" -f k'));
    assert.strictEqual(detectInteractive('ssh-keygen -y -f k -P ""'), null);
  });

  test('14. the ssh-keygen reason names -N and, for -y, -P', () => {
    const hit = detectInteractive('ssh-keygen -y -f k');
    assert.match(hit.reason, /-N/);
    assert.match(hit.reason, /-y/);
    assert.match(hit.reason, /-P/);
  });

  test('15. -N in one call never exempts another; the hit names the second call and is compound', () => {
    const hit = detectInteractive('ssh-keygen -t ed25519 -f a -N ""; ssh-keygen -t ed25519 -f b');
    assert.ok(hit);
    assert.equal(hit.segment, 'ssh-keygen -t ed25519 -f b');
    assert.equal(hit.compound, true);
  });

  test('15. a skip flag in another call never exempts the gated call', () => {
    const hit = detectInteractive('gh auth login; echo --with-token');
    assert.ok(hit);
    assert.equal(hit.segment, 'gh auth login');
  });

  test('15. a skip flag in the gated call exempts it', () => {
    assert.strictEqual(detectInteractive('echo hi && gh auth login --with-token < t'), null);
  });

  test('16. a heredoc fed to bash, sh or zsh is read as commands; one fed to cat is not', () => {
    for (const sh of ['bash', 'sh', 'zsh', '/bin/bash']) {
      const hit = detectInteractive(`${sh} <<'EOF'\nnpm login\nEOF`);
      assert.ok(hit, `${sh} heredoc`);
      assert.equal(hit.label, 'npm login');
      assert.equal(hit.segment, 'npm login');
    }
    assert.strictEqual(detectInteractive("cat <<'EOF'\nnpm login\nEOF"), null);
  });

  test('16. a shell heredoc is read one level deep only', () => {
    const nested = "bash <<'OUTER'\nbash <<'INNER'\nnpm login\nINNER\nOUTER";
    // The outer body is `bash <<'INNER' ... INNER`; reading it as commands finds a bash call whose own heredoc
    // is data at depth 1. Nothing at depth 1 invokes the command, so nothing is gated.
    assert.strictEqual(detectInteractive(nested), null);
  });

  test('17. an unquoted $( ) is its own call', () => {
    const hit = detectInteractive('echo $(gh auth login)');
    assert.ok(hit);
    assert.equal(hit.segment, 'gh auth login');
  });

  test('an unterminated quote fails open', () => {
    assert.deepStrictEqual(matchInvocations('echo "npm login'), { hit: null, skipped: null });
  });

  test('non-string input is not gated and never throws', () => {
    assert.strictEqual(detectInteractive(undefined), null);
    assert.strictEqual(detectInteractive(null), null);
    assert.strictEqual(detectInteractive(''), null);
  });
});

describe('interactive-commands — matchInvocations reports the skipped form (item 17b)', () => {
  test('a skip flag: { hit: null, skipped } with the pattern label and the call', () => {
    const r = matchInvocations('gh auth login --with-token < t');
    assert.strictEqual(r.hit, null);
    assert.ok(r.skipped);
    assert.equal(r.skipped.label, 'gh auth login');
    assert.equal(r.skipped.segment, 'gh auth login --with-token < t');
  });

  test('a read-only key form: skipped.label is ssh-keygen', () => {
    const r = matchInvocations('ssh-keygen -lf key.pub');
    assert.strictEqual(r.hit, null);
    assert.ok(r.skipped);
    assert.equal(r.skipped.label, 'ssh-keygen');
  });

  test('a quoted mention: nothing matched, nothing skipped', () => {
    assert.deepStrictEqual(matchInvocations('grep -n "ssh-keygen" notes.md'), { hit: null, skipped: null });
  });

  test('a gated call after a skipped one: hit, and the skipped call is still reported', () => {
    const r = matchInvocations('ssh-keygen -lf key.pub; ssh-keygen -t ed25519 -f b');
    assert.ok(r.hit);
    assert.equal(r.hit.segment, 'ssh-keygen -t ed25519 -f b');
    assert.ok(r.skipped);
    assert.equal(r.skipped.segment, 'ssh-keygen -lf key.pub');
  });
});

describe('interactive-commands — sshKeygenFlags (item 18)', () => {
  const flags = (args) => [...sshKeygenFlags(args)].sort();

  test("['-lf', 'key.pub'] -> l and f, not N", () => {
    const f = sshKeygenFlags(['-lf', 'key.pub']);
    assert.ok(f.has('l'));
    assert.ok(f.has('f'));
    assert.ok(!f.has('N'));
  });

  test("['-f', '-l'] -> f only (-l is -f's argument)", () => {
    assert.deepStrictEqual(flags(['-f', '-l']), ['f']);
  });

  test("['-N', '', '-t', 'rsa'] -> N and t", () => {
    assert.deepStrictEqual(flags(['-N', '', '-t', 'rsa']), ['N', 't']);
  });

  test("['-qN', '', '-f', 'k'] -> q, N and f", () => {
    assert.deepStrictEqual(flags(['-qN', '', '-f', 'k']), ['N', 'f', 'q']);
  });

  test("['--', '-l'] -> empty", () => {
    assert.deepStrictEqual(flags(['--', '-l']), []);
  });

  test('an option argument glued to its letter consumes the rest of the cluster', () => {
    // -Esha256: E takes an argument, so `sha256` is its value, not the flags s, h, a.
    assert.deepStrictEqual(flags(['-Esha256', '-l']), ['E', 'l']);
  });
});

describe('interactive-commands — patterns and labels', () => {
  test('23 patterns: 10 tty and 13 shell-flow, frozen', () => {
    assert.equal(INTERACTIVE_PATTERNS.length, 23);
    assert.equal(INTERACTIVE_PATTERNS.filter((p) => p.category === 'tty').length, 10);
    assert.equal(INTERACTIVE_PATTERNS.filter((p) => p.category === 'shell-flow').length, 13);
    assert.ok(Object.isFrozen(INTERACTIVE_PATTERNS));
  });

  test('every pattern has a unique label', () => {
    const labels = INTERACTIVE_PATTERNS.map((p) => p.label);
    for (const label of labels) assert.equal(typeof label, 'string');
    assert.equal(new Set(labels).size, labels.length, `duplicate label in ${labels.join(', ')}`);
  });

  test('every pattern label appears in some GATED_CASES row', () => {
    const covered = new Set(GATED_CASES.map((row) => row.label));
    const missing = INTERACTIVE_PATTERNS.map((p) => p.label).filter((l) => !covered.has(l));
    assert.deepStrictEqual(missing, []);
  });

  test('every GATED_CASES label is a pattern label', () => {
    const labels = new Set(INTERACTIVE_PATTERNS.map((p) => p.label));
    const unknown = GATED_CASES.map((row) => row.label).filter((l) => !labels.has(l));
    assert.deepStrictEqual(unknown, []);
  });

  test('CMD_POS is still exported as the old command-position prefix source', () => {
    assert.equal(typeof CMD_POS, 'string');
    assert.ok(new RegExp(`${CMD_POS}x`).test('a && x'));
  });
});
