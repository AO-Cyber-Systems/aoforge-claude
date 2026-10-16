'use strict';

// Test list (TRD 78-02, objective 78-remove-the-rename-shims, SC-2; replaces the TRD 72-13 list): the pre-rename
// command forms are no longer command references. TRD 72-13 made doc-refs read the legacy plugin namespace, the
// short namespace and the short dash form for one release; the release after 3.0.0 drops them, so doc-refs reads
// `/aoforge:<name>` only. Written before the implementation.
//
// 1. scanText: a live command in each legacy form (`/devflow:`, `/df:`, `/df-`) yields no finding, with or without
//    an explicit liveSkills set; the same command under `/aoforge:` yields none either (it is live).
// 2. scanText: one line holding every legacy form with a live, a renamed, a removed and an unknown name yields no
//    finding; the current-namespace control line still yields [renamed, removed, unknown].
// 3. resolveToken: a legacy namespace is never classified (`ok`, no replacement), whatever the name; under the
//    current namespace DEPRECATION_MAP and REMOVED_COMMANDS behave as before (`renamed` with its successor,
//    `removed`), and `unknown` only against liveSkills.
// 4. rewriteText leaves every legacy form byte-identical (no changes, nothing listed as removed) and still rewrites
//    a renamed `/aoforge:` command on the same line.
// 5. doc-refs knows one namespace: NAMESPACES is [NAMES.slug], no DASH_RE is exported, and its source reads
//    neither NAMESPACE_RENAMES nor LEGACY.
//
// Hand-built fixtures: every legacy sample string comes from __fixtures__/legacy-command-fixtures.cjs, typed out there.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const docRefs = require('./doc-refs.cjs');
const { NAMES, LEGACY } = require('./legacy-names.cjs');
const { legacyCommandText } = require('./__fixtures__/legacy-command-fixtures.cjs');

const { resolveToken, scanText, rewriteText } = docRefs;
const T = legacyCommandText();

// A hand-built live-skill set: the names the samples use as live commands.
const LIVE = new Set(['plan-objective', 'quick', 'status']);

describe('doc-refs and the pre-rename command forms (TRD 78-02)', () => {
  test('1. a live command in each legacy form is no finding; under /aoforge: it is live', () => {
    for (const text of T.legacyForms) {
      assert.deepStrictEqual(scanText(text), [], `default liveSkills: ${text}`);
      assert.deepStrictEqual(scanText(text, { liveSkills: LIVE }), [], `explicit liveSkills: ${text}`);
      assert.deepStrictEqual(scanText(`see ${text} first`), [], `mid-line: ${text}`);
    }
    assert.deepStrictEqual(scanText(`${NAMES.commandNs}plan-objective`, { liveSkills: LIVE }), []);
  });

  test('2. every legacy form on one line is no finding; the current-namespace control still is', () => {
    assert.deepStrictEqual(scanText(T.legacyLine), []);
    assert.deepStrictEqual(scanText(T.legacyLine, { liveSkills: LIVE }), []);
    assert.deepStrictEqual(
      scanText(T.currentLine, { liveSkills: LIVE }).map((r) => r.kind),
      [...T.currentKinds],
    );
  });

  test('3. resolveToken classifies only the current namespace', () => {
    const shortNs = LEGACY.commandNsShort.slice(1, -1);
    for (const ns of [LEGACY.slug, shortNs]) {
      for (const name of ['quick', 'health', 'update', 'nope']) {
        assert.deepStrictEqual(
          resolveToken(ns, name, { liveSkills: LIVE }),
          { kind: 'ok', replacement: null },
          `${ns}:${name}`,
        );
      }
    }
    assert.deepStrictEqual(resolveToken(NAMES.slug, 'health'), { kind: 'renamed', replacement: `${NAMES.commandNs}status check` });
    assert.deepStrictEqual(resolveToken(NAMES.slug, 'progress'), { kind: 'renamed', replacement: `${NAMES.commandNs}status` });
    assert.deepStrictEqual(resolveToken(NAMES.slug, 'update'), { kind: 'removed', replacement: null });
    assert.deepStrictEqual(resolveToken(NAMES.slug, 'quick'), { kind: 'ok', replacement: null });
    assert.deepStrictEqual(resolveToken(NAMES.slug, 'nope', { liveSkills: LIVE }), { kind: 'unknown', replacement: null });
  });

  test('4. rewriteText leaves the legacy forms as written and still rewrites a renamed /aoforge: command', () => {
    const r = rewriteText(T.legacyLine);
    assert.equal(r.text, T.legacyLine);
    assert.deepStrictEqual(r.changes, []);
    assert.deepStrictEqual(r.removed, []);

    const mixed = `${T.legacyLine} ${NAMES.commandNs}health`;
    const m = rewriteText(mixed);
    assert.equal(m.text, `${T.legacyLine} ${NAMES.commandNs}status check`);
    assert.deepStrictEqual(m.changes, [{ from: `${NAMES.commandNs}health`, to: `${NAMES.commandNs}status check`, line: 1 }]);
  });

  test('5. doc-refs knows one namespace and reads no legacy name', () => {
    assert.deepStrictEqual([...docRefs.NAMESPACES], [NAMES.slug]);
    assert.equal(Object.prototype.hasOwnProperty.call(docRefs, 'DASH_RE'), false, 'DASH_RE must not be exported');
    const src = fs.readFileSync(path.join(__dirname, 'doc-refs.cjs'), 'utf-8');
    assert.doesNotMatch(src, /NAMESPACE_RENAMES/, 'doc-refs.cjs must not read NAMESPACE_RENAMES');
    assert.doesNotMatch(src, /\bLEGACY\b/, 'doc-refs.cjs must not read LEGACY');
  });
});
