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
