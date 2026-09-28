'use strict';

// roadmap-progress.test.cjs — Test list (quick-22, js/regex-injection)
//
// `updateProgressTableRow` (roadmap-progress.cjs:81) and `updateJobsLine` (:169) both build
// `objEscaped = objectiveNum.replace('.', '\\.')` and interpolate it straight into `new
// RegExp(...)`. Only the literal `.` is escaped (and only its first occurrence); every other
// regex metacharacter in `objectiveNum` — `+ ( ) * ? ^ $ { } | [ ] \` — reaches the RegExp
// constructor unescaped. An objectiveNum is normally a plan-controlled string (a CLI arg or a
// TRD/OBJECTIVE.md id), not attacker input, but the injection is real: a metacharacter changes
// what the pattern matches (silently touching the wrong objective's row/section) or makes the
// pattern outright invalid (throwing instead of reporting `updated: false`).
//
// RX/JX group — both functions, same three probes:
// - "1+" (unescaped `+` = "one or more '1's"): must not match objective 1's row/header, nor
//   objective 11's (a greedy `1+` matches either).
// - "(" (an unterminated group): must not throw — the string can only ever fail to match, never
//   crash the RegExp constructor.
// - "4.1" (the one case the current single-dot escape already gets right): must still match only
//   `4.1`, not `401` — a regression guard so the escapeRegExp fix does not accidentally loosen
//   the one thing that already worked.

const { test, describe } = require('node:test');
const assert = require('node:assert');

const { updateProgressTableRow, updateJobsLine } = require('./roadmap-progress.cjs');

const PROGRESS_CONTENT_OBJ1 = [
  '## Progress',
  '',
  '| Objective | Plans | Status | Completed |',
  '|---|---|---|---|',
  '| 1. Foundation | 0/3 | Not started | - |',
  '',
].join('\n');

const PROGRESS_CONTENT_OBJ11 = [
  '## Progress',
  '',
  '| Objective | Plans | Status | Completed |',
  '|---|---|---|---|',
  '| 11. Later objective | 0/2 | Not started | - |',
  '',
].join('\n');

const PROGRESS_CONTENT_DECIMAL = [
  '## Progress',
  '',
  '| Objective | Plans | Status | Completed |',
  '|---|---|---|---|',
  '| 4.1. Sub feature | 0/1 | Not started | - |',
  '| 401. Decoy | 0/1 | Not started | - |',
  '',
].join('\n');

describe('updateProgressTableRow — regex-injection guard (RX group)', () => {
  test('RX1: "1+" does not match objective 1\'s row', () => {
    const r = updateProgressTableRow(PROGRESS_CONTENT_OBJ1, '1+', { status: 'Active' });
    assert.strictEqual(r.updated, false);
    assert.strictEqual(r.content, PROGRESS_CONTENT_OBJ1);
  });

  test('RX2: "1+" does not match objective 11\'s row', () => {
    const r = updateProgressTableRow(PROGRESS_CONTENT_OBJ11, '1+', { status: 'Active' });
    assert.strictEqual(r.updated, false);
    assert.strictEqual(r.content, PROGRESS_CONTENT_OBJ11);
  });

  test('RX3: "(" does not throw and does not match', () => {
    const r = updateProgressTableRow(PROGRESS_CONTENT_OBJ1, '(', { status: 'Active' });
    assert.strictEqual(r.updated, false);
    assert.strictEqual(r.content, PROGRESS_CONTENT_OBJ1);
  });

  test('RX4: "4.1" matches only the 4.1 row, not 401', () => {
    const r = updateProgressTableRow(PROGRESS_CONTENT_DECIMAL, '4.1', { status: 'Active' });
    assert.strictEqual(r.updated, true);
    const lines = r.content.split('\n');
    const row41 = lines.find((l) => l.trim().startsWith('| 4.1.'));
    const row401 = lines.find((l) => l.trim().startsWith('| 401.'));
    assert.ok(row41 && row41.includes('Active'), 'the 4.1 row must be updated');
    assert.ok(row401 && row401.includes('Not started') && !row401.includes('Active'), 'the 401 row must be untouched');
  });
});

const JOBS_CONTENT_OBJ1 = ['### Objective 1: Foundation', '', '**Jobs:** 0/3 complete', ''].join('\n');
const JOBS_CONTENT_OBJ11 = ['### Objective 11: Later objective', '', '**Jobs:** 0/2 complete', ''].join('\n');
const JOBS_CONTENT_DECIMAL = [
  '### Objective 4.1: Sub feature',
  '',
  '**Jobs:** 0/1 complete',
  '',
  '### Objective 401: Decoy',
  '',
  '**Jobs:** 0/1 complete',
  '',
].join('\n');

describe('updateJobsLine — regex-injection guard (JX group)', () => {
  test('JX1: "1+" does not match objective 1\'s header', () => {
    const r = updateJobsLine(JOBS_CONTENT_OBJ1, '1+', '2/3 complete');
    assert.strictEqual(r.updated, false);
    assert.strictEqual(r.content, JOBS_CONTENT_OBJ1);
  });

  test('JX2: "1+" does not match objective 11\'s header', () => {
    const r = updateJobsLine(JOBS_CONTENT_OBJ11, '1+', '2/2 complete');
    assert.strictEqual(r.updated, false);
    assert.strictEqual(r.content, JOBS_CONTENT_OBJ11);
  });

  test('JX3: "(" does not throw and does not match', () => {
    const r = updateJobsLine(JOBS_CONTENT_OBJ1, '(', '2/3 complete');
    assert.strictEqual(r.updated, false);
    assert.strictEqual(r.content, JOBS_CONTENT_OBJ1);
  });

  test('JX4: "4.1" matches only the 4.1 section, not 401', () => {
    const r = updateJobsLine(JOBS_CONTENT_DECIMAL, '4.1', '5/5 complete');
    assert.strictEqual(r.updated, true);
    assert.ok(r.content.includes('### Objective 4.1: Sub feature\n\n**Jobs:** 5/5 complete'));
    assert.ok(r.content.includes('### Objective 401: Decoy\n\n**Jobs:** 0/1 complete'));
  });
});
