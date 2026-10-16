'use strict';
// The Flutter pack's org-awareness hook. Group PD moved here from core org-awareness.test.cjs when the
// Dart extractor moved into the pack (objective 77 follow-up); a shared-library scan test is added.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const aw = require('./awareness.cjs');
const oa = { _parseExports: aw.parseExports };

// ─── Group PD — Dart symbol extraction (post-v1.1 dogfood fix) ───────────────

test('PD1 — Dart class FooBar extracted', () => {
  const src = 'class ApprovalCard extends StatefulWidget { ... }';
  const names = oa._parseExports(src);
  assert.ok(names.includes('ApprovalCard'), `expected ApprovalCard, got: ${JSON.stringify(names)}`);
});

test('PD2 — Dart abstract / sealed / final class modifiers extracted', () => {
  const src = `
    abstract class BaseCard {}
    sealed class State {}
    final class FooBar {}
  `;
  const names = oa._parseExports(src);
  assert.ok(names.includes('BaseCard'));
  assert.ok(names.includes('State'));
  assert.ok(names.includes('FooBar'));
});

test('PD3 — Dart enum + mixin + typedef + extension extracted', () => {
  const src = `
    enum Direction { up, down }
    mixin Resizable {}
    typedef CardBuilder = Widget Function();
    extension StringX on String {}
  `;
  const names = oa._parseExports(src);
  for (const n of ['Direction', 'Resizable', 'CardBuilder', 'StringX']) {
    assert.ok(names.includes(n), `expected ${n}, got: ${JSON.stringify(names)}`);
  }
});

test('PD4 — Dart library-private (leading _) names skipped', () => {
  const src = 'class _PrivateCard {} class PublicCard {}';
  const names = oa._parseExports(src);
  assert.ok(names.includes('PublicCard'));
  assert.ok(!names.includes('_PrivateCard'));
});

test('PD5 — Dart top-level final/const/var declarations extracted', () => {
  const src = `
    final defaultTheme = EdenTheme();
    const maxRows = 100;
    var globalCounter = 0;
  `;
  const names = oa._parseExports(src);
  assert.ok(names.includes('defaultTheme'));
  assert.ok(names.includes('maxRows'));
  assert.ok(names.includes('globalCounter'));
});


test('PD6 — entrypoints: lib/ .dart files of a pubspec package, generated and private files skipped', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-dart-'));
  fs.writeFileSync(path.join(root, 'pubspec.yaml'), 'name: x\n');
  fs.mkdirSync(path.join(root, 'lib', 'src'), { recursive: true });
  for (const f of ['a.dart', 'a.g.dart', 'a.freezed.dart', '_p.dart', 'src/b.dart']) fs.writeFileSync(path.join(root, 'lib', f), '');
  const got = aw.entrypoints(root, fs).map((p) => path.relative(root, p)).sort();
  assert.deepStrictEqual(got, ['lib/a.dart', 'lib/src/b.dart']);
  assert.deepStrictEqual(aw.entrypoints(fs.mkdtempSync(path.join(os.tmpdir(), 'aw-none-')), fs), []);
});

test('PD7 — core scanLibs reads a Dart library through this pack hook', () => {
  const core = path.join(__dirname, '..', '..', 'aoforge', 'aoforge', 'bin', 'lib');
  require(path.join(core, '__fixtures__', 'stack-pack-env.cjs')).useRepoPacks();
  const scan = require(path.join(core, 'org-awareness.cjs')).scanLibs;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-lib-'));
  fs.writeFileSync(path.join(root, 'pubspec.yaml'), 'name: lib\n');
  fs.mkdirSync(path.join(root, 'lib'));
  fs.writeFileSync(path.join(root, 'lib', 'card.dart'), 'class ApprovalCard {}\n');
  const r = scan({ path: root, current_tokens: new Set(['approval']) });
  assert.ok(r.candidates.some((c) => c.symbol === 'ApprovalCard'), JSON.stringify(r));
});
