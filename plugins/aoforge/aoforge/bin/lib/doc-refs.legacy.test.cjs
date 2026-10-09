'use strict';

// Test list (TRD 72-13, objective 72-install-and-naming-cleanup, INST-01): the legacy command forms in the
// doc-refs resolver. Written before the implementation.
//
// 1. resolveToken('devflow', 'quick') -> prefix /aoforge:quick; ('df', 'quick') -> prefix /aoforge:quick.
// 2. resolveToken('devflow', 'progress') -> renamed /aoforge:status; ('devflow', 'update') -> removed.
// 3. resolveToken('aoforge', 'quick') -> ok; ('aoforge', 'nope', { liveSkills }) -> unknown. (Controls: today's
//    behaviour for the current namespace is unchanged.)
// 4. scanText('/df-quick and /df-tools.cjs and ~/bin/df-plan') -> one finding (`/df-quick`, prefix, column 1);
//    '/df-progress' -> renamed /aoforge:status; '/df-nope' -> no finding.
//    4b. With an explicit liveSkills set, the dash form is a finding only for a name in that set, a DEPRECATION_MAP
//        key or a removed command.
//    4c. The dash form never matches a path: a slash after an identifier character, `.`, `/` or `~` is no command.
//    4d. The colon forms of both legacy namespaces are matched by scanText, with 1-based line/col.
// 5. rewriteText turns '/devflow:quick /df:health /df-quick /devflow:update' into
//    '/aoforge:quick /aoforge:status check /aoforge:quick /devflow:update' (the removed command is left as written
//    and listed under `removed`); a second pass changes nothing.
// 6. NAMESPACE_RENAMES is frozen, its keys are derived from LEGACY (`devflow`, `df`) and every value is `aoforge`.
//    6b. Single source: doc-refs.cjs requires NAMESPACE_RENAMES from skill-route.cjs and declares no namespace
//        literal of its own.
//
// Hand-built fixtures: every sample string comes from __fixtures__/legacy-command-fixtures.cjs, typed out there.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { resolveToken, scanText, rewriteText } = require('./doc-refs.cjs');
const skillRoute = require('./skill-route.cjs');
const { NAMES, LEGACY } = require('./legacy-names.cjs');
const { legacyCommandText } = require('./__fixtures__/legacy-command-fixtures.cjs');

const T = legacyCommandText();

describe('doc-refs legacy command forms (TRD 72-13)', () => {
  test('1. both legacy namespaces resolve a live command to the /aoforge: form (prefix)', () => {
    assert.deepStrictEqual(resolveToken('devflow', 'quick'), { kind: 'prefix', replacement: '/aoforge:quick' });
    assert.deepStrictEqual(resolveToken('df', 'quick'), { kind: 'prefix', replacement: '/aoforge:quick' });
  });

  test('2. a renamed command under the legacy namespace is renamed; a removed one is removed', () => {
    assert.deepStrictEqual(resolveToken('devflow', 'progress'), { kind: 'renamed', replacement: '/aoforge:status' });
    assert.deepStrictEqual(resolveToken('devflow', 'update'), { kind: 'removed', replacement: null });
  });

  test('3. controls: the current namespace is ok, and unknown only against liveSkills', () => {
    assert.deepStrictEqual(resolveToken('aoforge', 'quick'), { kind: 'ok', replacement: null });
    const liveSkills = new Set(['quick', 'status']);
    assert.deepStrictEqual(resolveToken('aoforge', 'nope', { liveSkills }), { kind: 'unknown', replacement: null });
  });

  test('4. the dash form: only a known command is a finding; files and paths never are', () => {
    assert.deepStrictEqual(scanText(T.dashMix), [
      { line: 1, col: T.dashMixFindingCol, token: 'quick', kind: 'prefix', replacement: '/aoforge:quick' },
    ]);
    assert.deepStrictEqual(scanText(T.dashRenamed), [
      { line: 1, col: 1, token: 'progress', kind: 'renamed', replacement: '/aoforge:status' },
    ]);
    assert.deepStrictEqual(scanText(T.dashUnknown), []);
  });

  test('4b. with liveSkills given, the dash form is known through that set, DEPRECATION_MAP or REMOVED_COMMANDS', () => {
    const liveSkills = new Set(['plan-objective']);
    // `quick` is not in this set and is neither renamed nor removed: no finding.
    assert.deepStrictEqual(scanText('/df-quick', { liveSkills }), []);
    assert.deepStrictEqual(scanText('see /df-plan-objective', { liveSkills }), [
      { line: 1, col: 5, token: 'plan-objective', kind: 'prefix', replacement: '/aoforge:plan-objective' },
    ]);
    // A DEPRECATION_MAP key and a removed command are known whatever the live set says.
    assert.deepStrictEqual(scanText('/df-health /df-update', { liveSkills }).map((r) => [r.token, r.kind]), [
      ['health', 'renamed'],
      ['update', 'removed'],
    ]);
  });

  test('4c. the dash form never matches inside a path', () => {
    for (const text of ['bin/df-quick', './df-quick', '~/df-quick', 'a//df-quick', '~/bin/df-plan', '$HOME/df-quick']) {
      assert.deepStrictEqual(scanText(text), [], `must not match: ${text}`);
    }
    // ...while a command at the start of a line, after a space, a backtick or a parenthesis does.
    for (const text of ['/df-quick', 'run /df-quick', '`/df-quick`', '(/df-quick)']) {
      assert.equal(scanText(text).length, 1, `must match once: ${text}`);
    }
  });

  test('4d. scanText matches the colon forms of both legacy namespaces', () => {
    const text = 'one\nrun /devflow:quick then /df:quick';
    assert.deepStrictEqual(scanText(text), [
      { line: 2, col: 5, token: 'quick', kind: 'prefix', replacement: '/aoforge:quick' },
      { line: 2, col: 25, token: 'quick', kind: 'prefix', replacement: '/aoforge:quick' },
    ]);
  });

  test('5. rewriteText rewrites every legacy form and leaves a removed command as written', () => {
    const r = rewriteText(T.rewriteInput);
    assert.equal(r.text, T.rewriteOutput);
    assert.deepStrictEqual(r.changes, [
      { from: '/devflow:quick', to: '/aoforge:quick', line: 1 },
      { from: '/df:health', to: '/aoforge:status check', line: 1 },
      { from: '/df-quick', to: '/aoforge:quick', line: 1 },
    ]);
    assert.deepStrictEqual(r.removed, [{ token: 'update', line: 1 }]);

    const again = rewriteText(r.text);
    assert.equal(again.text, r.text, 'idempotent');
    assert.deepStrictEqual(again.changes, []);
  });

  test('6. NAMESPACE_RENAMES: frozen, keys derived from LEGACY, every value the current namespace', () => {
    const { NAMESPACE_RENAMES } = skillRoute;
    assert.ok(NAMESPACE_RENAMES, 'skill-route.cjs must export NAMESPACE_RENAMES');
    assert.ok(Object.isFrozen(NAMESPACE_RENAMES), 'NAMESPACE_RENAMES must be frozen');
    assert.deepStrictEqual(Object.keys(NAMESPACE_RENAMES), ['devflow', 'df']);
    assert.deepStrictEqual(Object.keys(NAMESPACE_RENAMES), [
      LEGACY.slug,
      LEGACY.commandNsShort.slice(1, -1),
    ]);
    for (const value of Object.values(NAMESPACE_RENAMES)) {
      assert.equal(value, 'aoforge');
      assert.equal(value, NAMES.slug);
    }
  });

  test('6b. single source: doc-refs.cjs takes the namespaces from skill-route.cjs and spells none itself', () => {
    const src = fs.readFileSync(path.join(__dirname, 'doc-refs.cjs'), 'utf-8');
    assert.match(src, /NAMESPACE_RENAMES/, 'doc-refs.cjs must read NAMESPACE_RENAMES');
    assert.match(src, /require\('\.\/skill-route\.cjs'\)/);
    for (const literal of ["'df'", '"df"', "'devflow'", '"devflow"', "'aoforge'", '"aoforge"']) {
      assert.ok(!src.includes(literal), `doc-refs.cjs must not declare the namespace literal ${literal}`);
    }
  });
});
