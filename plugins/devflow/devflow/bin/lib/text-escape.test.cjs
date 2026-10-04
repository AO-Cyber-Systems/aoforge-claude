'use strict';

// TRD 54-01 — lib/text-escape.cjs: the dependency-free escapes shared by lib modules and hooks
// (objective 54, CodeQL groups A and B). Pure functions, hand-built cases only.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { escapeRegExp, objectiveNumPattern, mdCell } = require('./text-escape.cjs');

// Splits a rendered GFM table row on pipes that are NOT escaped: a backslash skips the next char, so
// an even run of backslashes before a pipe leaves the pipe live and an odd run protects it.
function splitRow(row) {
  const cells = [];
  let cur = '';
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '\\') {
      cur += ch + (row[i + 1] === undefined ? '' : row[i + 1]);
      i++;
    } else if (ch === '|') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  // A leading and trailing pipe produce empty edge segments; drop them.
  return cells.slice(1, -1).map((c) => c.trim());
}

describe('escapeRegExp', () => {
  test('TE-1 escapeRegExp: every metacharacter matches literally', () => {
    const metas = ['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\'];
    for (const c of metas) {
      assert.ok(new RegExp('^' + escapeRegExp(c) + '$').test(c), `metacharacter ${JSON.stringify(c)} must match itself`);
    }
  });

  test('TE-2 escapeRegExp: 4.1 does not match 401', () => {
    const re = new RegExp('^' + escapeRegExp('4.1') + '$');
    assert.ok(re.test('4.1'));
    assert.equal(re.test('401'), false);
  });

  test('TE-3 escapeRegExp: 1.0.0+build.1 matches itself and not 1.0.00build.1', () => {
    const re = new RegExp('^' + escapeRegExp('1.0.0+build.1') + '$');
    assert.ok(re.test('1.0.0+build.1'));
    assert.equal(re.test('1.0.00build.1'), false);
  });

  test('TE-4 escapeRegExp: 1.0.0-rc.1 matches itself', () => {
    const re = new RegExp('^' + escapeRegExp('1.0.0-rc.1') + '$');
    assert.ok(re.test('1.0.0-rc.1'));
  });

  test('TE-5 escapeRegExp: ( and [ do not throw when compiled', () => {
    assert.doesNotThrow(() => new RegExp(escapeRegExp('(')));
    assert.doesNotThrow(() => new RegExp(escapeRegExp('[')));
    assert.doesNotThrow(() => new RegExp(escapeRegExp('a(b[c')));
  });

  test('TE-6 escapeRegExp: a non-string is coerced', () => {
    assert.equal(escapeRegExp(12), '12');
  });
});

describe('objectiveNumPattern', () => {
  const rx = (n) => new RegExp('Objective\\s+' + objectiveNumPattern(n));

  test('TE-7 objectiveNumPattern: 4.1 matches a colon, a space and a sentence-ending period', () => {
    const re = rx('4.1');
    assert.ok(re.test('Objective 4.1:'));
    assert.ok(re.test('Objective 4.1 x'));
    assert.ok(re.test('see Objective 4.1.'));
  });

  test('TE-8 objectiveNumPattern: 4.1 does not match 4.10, 401 or 4.1.2', () => {
    const re = rx('4.1');
    assert.equal(re.test('Objective 4.10'), false);
    assert.equal(re.test('Objective 401'), false);
    assert.equal(re.test('Objective 4.1.2'), false);
  });

  test('TE-9 objectiveNumPattern: 4 does not match 4.1, 41 or 40; matches 4: and 4 followed by a space', () => {
    const re = rx('4');
    assert.equal(re.test('Objective 4.1'), false);
    assert.equal(re.test('Objective 41'), false);
    assert.equal(re.test('Objective 40'), false);
    assert.ok(re.test('Objective 4:'));
    assert.ok(re.test('Objective 4 '));
  });

  test('TE-10 objectiveNumPattern: 12 does not match 120 or 12.1; matches 12:', () => {
    const re = rx('12');
    assert.equal(re.test('Objective 120'), false);
    assert.equal(re.test('Objective 12.1'), false);
    assert.ok(re.test('Objective 12:'));
  });

  test('TE-11 objectiveNumPattern: a number argument behaves like its string', () => {
    assert.equal(objectiveNumPattern(4), objectiveNumPattern('4'));
    const re = rx(4);
    assert.equal(re.test('Objective 4.1'), false);
    assert.equal(re.test('Objective 41'), false);
    assert.ok(re.test('Objective 4:'));
  });
});

describe('mdCell', () => {
  test('TE-12 mdCell: a pipe is escaped', () => {
    assert.equal(mdCell('a|b'), 'a\\|b');
  });

  test('TE-13 mdCell: backslash is escaped before the pipe (a\\|b -> a\\\\\\|b)', () => {
    // Input is the 4 characters a, backslash, pipe, b. Output is a, two backslashes, backslash, pipe, b.
    assert.equal(mdCell('a\\|b'), 'a\\\\\\|b');
  });

  test('TE-14 mdCell: a lone backslash is doubled', () => {
    assert.equal(mdCell('C:\\tmp'), 'C:\\\\tmp');
  });

  test('TE-15 mdCell: LF and CRLF newlines become a single space', () => {
    assert.equal(mdCell('line1\nline2'), 'line1 line2');
    assert.equal(mdCell('line1\r\nline2'), 'line1 line2');
  });

  test('TE-16 mdCell: null and undefined become empty; 0 and false stringify', () => {
    assert.equal(mdCell(null), '');
    assert.equal(mdCell(undefined), '');
    assert.equal(mdCell(0), '0');
    assert.equal(mdCell(false), 'false');
  });

  test('TE-17 mdCell: round trip, an escaped backslash-pipe does not split the cell', () => {
    const row = `| ${mdCell('x\\|y')} | z |`;
    const cells = splitRow(row);
    assert.equal(cells.length, 2, `row ${row} must split into exactly two cells, got ${JSON.stringify(cells)}`);
    assert.equal(cells[1], 'z');
  });
});
