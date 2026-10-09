'use strict';

// TRD 54-01 — lib/text-escape.cjs: the dependency-free escapes shared by lib modules and hooks
// (objective 54, CodeQL groups A and B). Pure functions, hand-built cases only.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { escapeRegExp, objectiveNumPattern, boldLabelPattern, mdCell, milestoneHeadingPattern } = require('./text-escape.cjs');

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

  // TRD 56-02 (ONUM-03): a ROADMAP heading may spell the number with or without the directory's leading zero.
  test('TE-18 objectiveNumPattern: 04 and 4 each match Objective 4: and Objective 04:, and 4 matches 004:', () => {
    const padded = rx('04');
    assert.ok(padded.test('Objective 4:'));
    assert.ok(padded.test('Objective 04:'));
    const bare = rx('4');
    assert.ok(bare.test('Objective 04:'));
    assert.ok(bare.test('Objective 004:'));
  });

  test('TE-19 objectiveNumPattern: 04.1 matches 4.1: and 04.1:, never 4.10, 41 or 4.1.2', () => {
    const re = rx('04.1');
    assert.ok(re.test('Objective 4.1:'));
    assert.ok(re.test('Objective 04.1:'));
    assert.equal(re.test('Objective 4.10'), false);
    assert.equal(re.test('Objective 41'), false);
    assert.equal(re.test('Objective 4.1.2'), false);
  });

  test('TE-20 objectiveNumPattern: 4 and 04 never match 14, 40, 041 or 4.1, in a heading or a table row', () => {
    for (const n of ['4', '04']) {
      const heading = rx(n);
      for (const text of ['Objective 14:', 'Objective 40', 'Objective 041:', 'Objective 4.1']) {
        assert.equal(heading.test(text), false, `${n} must not match "${text}"`);
      }
      const row = new RegExp('\\|\\s*' + objectiveNumPattern(n));
      for (const text of ['| 14. x', '| 40. x', '| 041. x', '| 4.1. x']) {
        assert.equal(row.test(text), false, `${n} must not match table row "${text}"`);
      }
      assert.ok(row.test('| 4. x'));
      assert.ok(row.test('| 04. x'));
    }
  });

  test('TE-21 objectiveNumPattern: 0 matches 0: and 00:, never 05: or 10:', () => {
    const re = rx('0');
    assert.ok(re.test('Objective 0:'));
    assert.ok(re.test('Objective 00:'));
    assert.equal(re.test('Objective 05:'), false);
    assert.equal(re.test('Objective 10:'), false);
  });

  test('TE-22 objectiveNumPattern: a non-numeric id stays literal, with no zero prefix', () => {
    assert.equal(objectiveNumPattern('a('), escapeRegExp('a(') + '(?!\\.?\\d)');
  });
});

describe('boldLabelPattern', () => {
  const capture = (label) => new RegExp(boldLabelPattern(label) + '\\s*([^\\n]+)');

  test('TE-23 boldLabelPattern: **Goal:** and **Goal**: both capture the value; near-misses do not match', () => {
    const re = capture('Goal');
    assert.equal(re.exec('**Goal:** X')[1], 'X');
    assert.equal(re.exec('**Goal**: X')[1], 'X');
    assert.equal(re.test('**Goals:** X'), false);
    assert.equal(re.test('**Goal** X'), false);
    assert.equal(re.test('Goal: X'), false);
  });

  test('TE-24 boldLabelPattern: a multi-word label matches, and the label is escaped', () => {
    assert.ok(new RegExp(boldLabelPattern('Depends on')).test('**Depends on**: Objective 4'));
    const re = new RegExp(boldLabelPattern('a(b'));
    assert.ok(re.test('**a(b:** y'));
    assert.equal(re.test('**ab:** y'), false);
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

describe('milestoneHeadingPattern', () => {
  const heading = (version) => new RegExp(milestoneHeadingPattern(version), 'm');

  test('TE-25 milestoneHeadingPattern: v1.0 matches the headings that name v1.0', () => {
    const re = heading('v1.0');
    assert.ok(re.test('## v1.0 Now'), 'the heading milestone complete and milestone put write');
    assert.ok(re.test('## 1.0 Old'), 'a legacy heading without the v prefix');
    assert.ok(re.test('## v1.0'), 'a heading that ends right after the version');
    assert.ok(re.test('##  v1.0 X'), 'extra spaces after the hashes');
    assert.ok(re.test('# Milestones\n\n## v1.0 Now (Shipped: 2026-01-01)\n\n---\n'), 'a heading in the middle of the file');
  });

  test('TE-26 milestoneHeadingPattern: v1.0 does not match another version or another heading level', () => {
    const re = heading('v1.0');
    assert.ok(!re.test('## v1.0.1 X'), 'a patch release is a different version');
    assert.ok(!re.test('## v1.00'), 'trailing digits make a different version');
    assert.ok(!re.test('### v1.0'), 'a level-3 heading is not an entry');
    assert.ok(!re.test('## v10.0'), 'leading digits make a different version');
    assert.ok(!re.test('## v1x0'), 'the dot is a literal dot, not any character');
    assert.ok(!re.test('text ## v1.0 X'), 'the heading starts the line');
  });

  test('TE-27 milestoneHeadingPattern: 1.0 and v1.0 name the same milestone', () => {
    assert.equal(milestoneHeadingPattern('1.0'), milestoneHeadingPattern('v1.0'));
    assert.equal(milestoneHeadingPattern('V1.0'), milestoneHeadingPattern('v1.0'));
    assert.ok(heading('1.0').test('## v1.0 Now'));
    assert.ok(!heading('1.0').test('## v1.0.1 X'));
  });
});
