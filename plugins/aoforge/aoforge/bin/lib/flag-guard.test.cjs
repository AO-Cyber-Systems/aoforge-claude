'use strict';

// Test list (TRD 68-03 task 2, TOOL-01): the pure unknown-flag checker, tested against a small unit-only spec so the
// checker is exercised apart from the FLAG_SPEC data (flag-guard-cli.test.cjs covers the real table).
//
//   1. A known value flag consumes its value.
//   2. `--flag=value` is accepted for a value flag; the name before `=` is what is checked.
//   3. A known bool flag.
//   4. An unknown flag is reported with its label and the sorted accepted list.
//   5. The first unknown flag is reported when there are two.
//   6. Multi-value tails: `commit m --files a b --amend`, `milestone complete v1 --name Store Demo --dry-run`.
//   7. A value that looks like a flag is consumed as the value.
//   8. A literal `--` stops checking.
//   9. `anyFlags`, `ownParser` and `tailFrom` rules are honoured.
//  10. An unknown subcommand, or a command with no spec entry, is not this checker's business.
//  11. A flag where the subcommand goes is reported against the command (default rule).
//  12. Globals: --raw, --help, -h, --cwd x, a single-dash token.
//  13. formatUnknownFlag wording; and the module is pure.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { checkFlags, formatUnknownFlag } = require('./flag-guard.cjs');

const SPEC = {
  milestone: {
    subcommands: {
      put: { values: ['--from'], bools: ['--no-flush', '--no-wait'] },
      complete: { values: ['--name'], bools: ['--archive-objectives', '--dry-run', '--no-flush', '--no-wait'] },
    },
  },
  objective: {
    subcommands: {
      add: {},
      remove: { bools: ['--force', '--confirm'] },
    },
  },
  commit: { values: ['--files'], bools: ['--amend'] },
  frontmatter: { subcommands: { set: { values: ['--field', '--value'] } } },
  doc: { subcommands: { put: { values: ['--from', '--message'] } } },
  state: {
    subcommands: {
      load: {},
      patch: { anyFlags: true, reason: 'unit test: --<field> <value> pairs name arbitrary fields' },
    },
    default: {},
  },
  parsed: { ownParser: true, reason: 'unit test: the command rejects unknown flags itself' },
  carry: { values: ['--x'], tailFrom: 2, reason: 'unit test: everything from argv index 2 is carried, not read' },
};

describe('checkFlags', () => {
  test('1. a known value flag consumes its value', () => {
    assert.equal(checkFlags(['milestone', 'complete', 'v1', '--name', 'X'], SPEC), null);
  });

  test('2. --flag=value is accepted for a value flag, and the name before = is what is checked', () => {
    assert.equal(checkFlags(['milestone', 'put', 'v1', '--from=-'], SPEC), null);
    const r = checkFlags(['milestone', 'put', 'v1', '--from=x', '--zz=1'], SPEC);
    assert.equal(r.flag, '--zz');
  });

  test('3. a known bool flag', () => {
    assert.equal(checkFlags(['objective', 'remove', '2', '--confirm', '--force'], SPEC), null);
  });

  test('4. an unknown flag is reported with its label and the sorted accepted list', () => {
    assert.deepEqual(checkFlags(['milestone', 'complete', 'v1', '--zz'], SPEC), {
      flag: '--zz',
      label: 'milestone complete',
      accepted: ['--archive-objectives', '--dry-run', '--name', '--no-flush', '--no-wait'],
    });
  });

  test('5. the first unknown flag is reported when there are two', () => {
    const r = checkFlags(['milestone', 'complete', 'v1', '--aa', '--bb'], SPEC);
    assert.equal(r.flag, '--aa');
  });

  test('6. multi-value tails: the words after a value flag are positionals, not flags', () => {
    assert.equal(checkFlags(['commit', 'm', '--files', 'a', 'b', '--amend'], SPEC), null);
    assert.equal(checkFlags(['milestone', 'complete', 'v1', '--name', 'Store', 'Demo', '--dry-run'], SPEC), null);
  });

  test('7. a value that looks like a flag is consumed as the value', () => {
    assert.equal(checkFlags(['frontmatter', 'set', 'f', '--field', 'k', '--value', '--x'], SPEC), null);
  });

  test('8. a literal -- stops checking', () => {
    assert.equal(checkFlags(['doc', 'put', 'x', '--from', 'f', '--', '--zz'], SPEC), null);
  });

  test('9. anyFlags, ownParser and tailFrom are honoured', () => {
    assert.equal(checkFlags(['state', 'patch', '--Status', 'x'], SPEC), null);
    assert.equal(checkFlags(['parsed', '--anything', '--goes'], SPEC), null);
    // tailFrom: 2 reads argv[1] only; argv[2..] is carried.
    assert.equal(checkFlags(['carry', 'a', '--zz-in-the-tail'], SPEC), null);
    assert.equal(checkFlags(['carry', '--x', 'v', '--zz-in-the-tail'], SPEC), null);
    assert.equal(checkFlags(['carry', '--zz'], SPEC).flag, '--zz');
  });

  test('10. an unknown subcommand or a command with no spec entry is not reported', () => {
    assert.equal(checkFlags(['milestone', 'frobnicate', '--zz'], SPEC), null);
    assert.equal(checkFlags(['nosuch', '--zz'], SPEC), null);
    // Inherited object keys are not spec entries.
    assert.equal(checkFlags(['constructor', '--zz'], SPEC), null);
    assert.equal(checkFlags(['milestone', 'constructor', '--zz'], SPEC), null);
    assert.equal(checkFlags(['milestone', 'toString', '--zz'], SPEC), null);
  });

  test('11. a flag where the subcommand goes is reported against the command', () => {
    const m = checkFlags(['milestone', '--zz'], SPEC);
    assert.equal(m.flag, '--zz');
    assert.equal(m.label, 'milestone');
    assert.deepEqual(m.accepted, []);
    const s = checkFlags(['state', '--zz'], SPEC);
    assert.equal(s.flag, '--zz');
    assert.equal(s.label, 'state');
    // No subcommand and no flag: nothing to report.
    assert.equal(checkFlags(['milestone'], SPEC), null);
    assert.equal(checkFlags(['state'], SPEC), null);
  });

  test('12. globals are accepted everywhere; a single-dash token is never checked', () => {
    assert.equal(checkFlags(['milestone', 'complete', 'v1', '--raw'], SPEC), null);
    assert.equal(checkFlags(['milestone', 'complete', 'v1', '--help'], SPEC), null);
    assert.equal(checkFlags(['milestone', 'complete', 'v1', '-h'], SPEC), null);
    assert.equal(checkFlags(['milestone', 'complete', 'v1', '--cwd', 'x'], SPEC), null);
    assert.equal(checkFlags(['milestone', 'complete', 'v1', '--cwd=x'], SPEC), null);
    assert.equal(checkFlags(['milestone', 'complete', 'v1', '-5'], SPEC), null);
    // --cwd x consumes x; the flag after it is still checked.
    assert.equal(checkFlags(['milestone', 'complete', 'v1', '--cwd', 'x', '--zz'], SPEC).flag, '--zz');
  });
});

describe('formatUnknownFlag', () => {
  test('13. names the flag and the command, says nothing was written and lists what is accepted', () => {
    const r = checkFlags(['milestone', 'complete', 'v1', '--zz'], SPEC);
    assert.equal(
      formatUnknownFlag(r),
      'unknown flag --zz for `milestone complete`; nothing was written ' +
        '(accepted: --archive-objectives, --dry-run, --name, --no-flush, --no-wait)'
    );
  });

  test('13. an entry with no accepted flags says it takes none', () => {
    const r = checkFlags(['state', 'load', '--zz'], SPEC);
    assert.equal(formatUnknownFlag(r), 'unknown flag --zz for `state load`; nothing was written (it takes no flags)');
  });

  test('13. the module is pure: no fs, no process.exit', () => {
    const src = fs.readFileSync(path.join(__dirname, 'flag-guard.cjs'), 'utf8');
    assert.doesNotMatch(src, /require\(['"](node:)?fs['"]\)/);
    assert.doesNotMatch(src, /process\.exit/);
  });
});
