'use strict';

/**
 * Test suite for lib/helpers.cjs `pluginVersion()` — the two fallback
 * branches that were previously only reachable by manipulating __dirname
 * (untestable in practice, so untested): the mirror-marker fallback when
 * the plugin.json candidate is absent, and the final '0.0.0' fallback when
 * neither candidate exists. Wave-0 follow-up F4.
 *
 * `pluginVersion()` now accepts an optional `{ homeDir, manifestPath }`
 * options object so both candidates can be pointed at fixture paths without
 * touching __dirname; defaults are unchanged and no production caller
 * passes the object.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const helpers = require('./helpers.cjs');

const { pluginVersion } = helpers;

let tmpHome;

afterEach(() => {
  if (tmpHome && fs.existsSync(tmpHome)) fs.rmSync(tmpHome, { recursive: true, force: true });
  tmpHome = null;
});

describe('pluginVersion() — mirror-marker fallback', () => {
  test('returns the trimmed contents of <homeDir>/.claude/devflow/.plugin-version when the plugin.json candidate is absent', () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'df-pluginversion-'));
    const markerDir = path.join(tmpHome, '.claude', 'devflow');
    fs.mkdirSync(markerDir, { recursive: true });
    fs.writeFileSync(path.join(markerDir, '.plugin-version'), '  2.7.1\n', 'utf-8');

    const missingManifest = path.join(tmpHome, 'no-such-plugin.json');

    const version = pluginVersion({ homeDir: tmpHome, manifestPath: missingManifest });
    assert.strictEqual(version, '2.7.1', 'should return the trimmed marker contents');
  });
});

describe('pluginVersion() — final fallback', () => {
  test("returns '0.0.0' when neither the manifest candidate nor the mirror marker exist", () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'df-pluginversion-'));
    // Deliberately do NOT create <tmpHome>/.claude/devflow/.plugin-version.

    const missingManifest = path.join(tmpHome, 'no-such-plugin.json');

    const version = pluginVersion({ homeDir: tmpHome, manifestPath: missingManifest });
    assert.strictEqual(version, '0.0.0');
  });

  test("returns '0.0.0' when the mirror marker exists but is empty", () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'df-pluginversion-'));
    const markerDir = path.join(tmpHome, '.claude', 'devflow');
    fs.mkdirSync(markerDir, { recursive: true });
    fs.writeFileSync(path.join(markerDir, '.plugin-version'), '   \n', 'utf-8');

    const missingManifest = path.join(tmpHome, 'no-such-plugin.json');

    const version = pluginVersion({ homeDir: tmpHome, manifestPath: missingManifest });
    assert.strictEqual(version, '0.0.0', 'a whitespace-only marker trims to empty and should not be returned as a version');
  });
});

// ─── localDate() — TRD 42-01 (SDR-07) ─────────────────────────────────────────
//
// Every Date below is built with the LOCAL constructor (`new Date(y, m, d, h, min)`), never from an
// ISO string, so each assertion holds in every time zone. 23:30 local is the next UTC day west of
// Greenwich; 00:30 local is the previous UTC day east of it — between them, a UTC-based
// implementation fails in any non-UTC zone.

describe('localDate() — the local calendar date, never the UTC date', () => {
  test('is exported as a function', () => {
    assert.strictEqual(typeof helpers.localDate, 'function');
  });

  test("local 23:30 on 2026-09-28 -> '2026-09-28'", () => {
    assert.strictEqual(helpers.localDate(new Date(2026, 8, 28, 23, 30)), '2026-09-28');
  });

  test("local 00:30 on 2026-09-28 -> '2026-09-28'", () => {
    assert.strictEqual(helpers.localDate(new Date(2026, 8, 28, 0, 30)), '2026-09-28');
  });

  test('month and day are zero-padded', () => {
    assert.strictEqual(helpers.localDate(new Date(2026, 0, 5)), '2026-01-05');
    assert.strictEqual(helpers.localDate(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
  });

  test('defaults to now, read with the local getters', () => {
    const before = new Date();
    const got = helpers.localDate();
    const after = new Date();
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // A call straddling local midnight may legitimately return either side.
    assert.ok(got === fmt(before) || got === fmt(after), `got ${got}, expected ${fmt(before)} or ${fmt(after)}`);
  });
});

// ─── trdKey (TRD 53-02) ──────────────────────────────────────────────────────
// One pairing key for a TRD/JOB/SUMMARY file name: the `NN-MM` prefix, so
// `NN-MM-<slug>-TRD.md` pairs with `NN-MM-SUMMARY.md` and `NN-MM-<slug>-SUMMARY.md` alike.

describe('trdKey() — the NN-MM pairing key of a TRD/JOB/SUMMARY file name', () => {
  const { trdKey } = helpers;

  test('is exported as a function', () => {
    assert.strictEqual(typeof trdKey, 'function');
  });

  test('named TRD, short SUMMARY and named SUMMARY share one key', () => {
    assert.strictEqual(trdKey('07-01-alpha-TRD.md'), '07-01');
    assert.strictEqual(trdKey('07-01-SUMMARY.md'), '07-01');
    assert.strictEqual(trdKey('07-01-alpha-SUMMARY.md'), '07-01');
  });

  test('unnamed TRD pairs with unnamed SUMMARY', () => {
    assert.strictEqual(trdKey('07-04-TRD.md'), '07-04');
    assert.strictEqual(trdKey('07-04-SUMMARY.md'), '07-04');
  });

  test('legacy JOB files key the same way', () => {
    assert.strictEqual(trdKey('01-02-JOB.md'), '01-02');
  });

  test('decimal objectives keep their decimal part', () => {
    assert.strictEqual(trdKey('07.1-02-x-TRD.md'), '07.1-02');
    assert.strictEqual(trdKey('07.1-02-SUMMARY.md'), '07.1-02');
  });

  test('a multi-word slug does not confuse the key', () => {
    assert.strictEqual(trdKey('52-01-commit-follow-ups-TRD.md'), '52-01');
    assert.strictEqual(trdKey('07-01-2fa-setup-TRD.md'), '07-01');
  });

  test('bare TRD.md / JOB.md / SUMMARY.md key to the empty string (legacy strip)', () => {
    assert.strictEqual(trdKey('TRD.md'), '');
    assert.strictEqual(trdKey('JOB.md'), '');
    assert.strictEqual(trdKey('SUMMARY.md'), '');
  });

  test('a name without an NN-MM prefix falls back to the legacy suffix strip', () => {
    assert.strictEqual(trdKey('notes-SUMMARY.md'), 'notes');
    assert.strictEqual(trdKey('notes-TRD.md'), 'notes');
  });

  test('matches case-insensitively, like the verify.cjs readers', () => {
    assert.strictEqual(trdKey('07-01-alpha-trd.md'), '07-01');
    assert.strictEqual(trdKey('07-01-summary.md'), '07-01');
  });

  test('07-1 and 07-10 are different keys (no string-prefix pairing)', () => {
    assert.notStrictEqual(trdKey('07-1-x-TRD.md'), trdKey('07-10-SUMMARY.md'));
    assert.strictEqual(trdKey('07-1-x-TRD.md'), '07-1');
    assert.strictEqual(trdKey('07-10-SUMMARY.md'), '07-10');
    assert.strictEqual(trdKey('07-010-SUMMARY.md'), '07-010');
  });
});

// ─── parseObjectiveDirName / canonicalObjectiveNumber (TRD 68-02) ─────────────
// One parse of an objective directory's leading number, on the boundary objectiveDirMatches uses, plus the
// no-leading-zeros form used to compare numbers. milestone-scope.cjs resolves directories through them.

describe('parseObjectiveDirName() — the leading number and slug of an objective directory name', () => {
  const { parseObjectiveDirName, objectiveDirMatches, normalizeObjectiveName } = helpers;

  test('splits a padded name into its number and slug', () => {
    assert.deepStrictEqual(parseObjectiveDirName('04-d'), { number: '04', slug: 'd' });
    assert.deepStrictEqual(parseObjectiveDirName('04.1-one'), { number: '04.1', slug: 'one' });
    assert.deepStrictEqual(parseObjectiveDirName('04'), { number: '04', slug: null });
    assert.deepStrictEqual(parseObjectiveDirName('40-decoy'), { number: '40', slug: 'decoy' });
    assert.deepStrictEqual(parseObjectiveDirName('100-big'), { number: '100', slug: 'big' });
  });

  test('returns null for a name that is not an objective directory', () => {
    for (const name of ['notes', '04x', '.gitkeep', 'v1.2-objectives', '', '-04']) {
      assert.strictEqual(parseObjectiveDirName(name), null, `parseObjectiveDirName(${JSON.stringify(name)})`);
    }
  });

  test('agrees with objectiveDirMatches for padded names and documents why an unpadded name is not an objective directory', () => {
    for (const name of ['04-d', '04.1-one', '04', '40-decoy', '100-big']) {
      const r = parseObjectiveDirName(name);
      assert.ok(objectiveDirMatches(name, normalizeObjectiveName(r.number)), `${name} should match its own number`);
    }
    assert.strictEqual(parseObjectiveDirName('4-d').number, '4');
    assert.strictEqual(objectiveDirMatches('4-d', '04'), false);
  });
});

describe('canonicalObjectiveNumber() — a number without leading zeros on its integer part', () => {
  const { canonicalObjectiveNumber } = helpers;

  test('drops leading zeros from the integer part and keeps the decimal part as written', () => {
    assert.strictEqual(canonicalObjectiveNumber('04'), '4');
    assert.strictEqual(canonicalObjectiveNumber('4'), '4');
    assert.strictEqual(canonicalObjectiveNumber('040'), '40');
    assert.strictEqual(canonicalObjectiveNumber('04.1'), '4.1');
    assert.strictEqual(canonicalObjectiveNumber('4.10'), '4.10');
  });

  test('keeps a lone zero', () => {
    assert.strictEqual(canonicalObjectiveNumber('0'), '0');
    assert.strictEqual(canonicalObjectiveNumber('00'), '0');
  });
});
