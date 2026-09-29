'use strict';

// stack-detect.test.cjs — TRD 42-05, Task 1 (SDR-01).
//
// detectAreas(root, { maxDepth = 3 }) finds the language areas of a repo and the non-language
// flags that sit on them. Shapes are hand-built and invented (__fixtures__/stack-detect-fixtures.cjs).
//
// Test list:
// 1. Multi-area: svc/ go (+golangci), admin/ flutter (+maestro), portal/ flutter, chart/app/Chart.yaml,
//    sdk/python/pyproject.toml, no root manifest -> areas svc/ (go), admin/ (flutter, maestro),
//    portal/ (flutter), sdk/python/ (python, tier null, unsupported); the helm flag sits on root ''.
// 2. Pure-Dart sibling: api-dart/pubspec.yaml without `sdk: flutter` is kind dart, tier dart.
// 3. Depth 3: product/go/go.mod and ai/flutter/pubspec.yaml are found; a depth-4 go.mod is not
//    (and maxDepth widens the walk).
// 4. Skip list: node_modules/, .worktrees/, vendor/, a Flutter example/, a platform dir,
//    third_party/, .dart_tool/, build/, and a subdir holding a `.git` FILE or DIR are all ignored.
// 5. Single root area: go.mod + buf.yaml + sqlc.yaml + a `//go:generate` file -> one area '' with
//    flags buf, go_generate, sqlc. 5b: a generated-code header counts only in the first 5 lines.
// 6. Unsupported: Tauri (package.json + src-tauri/Cargo.toml) -> one root area, tier null,
//    unsupported tauri; C/C++ only -> no language area, a root `unsupported: cpp` note; empty and
//    docs-only repos -> []; a missing root or an unreadable dir never throws.
// 7. Flutter extras: integration_test/ -> flag integration_test; build_runner in dev_dependencies
//    -> flag build_runner; .maestro/ -> flag maestro; platform dirs never become areas.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sd = require('./stack-detect.cjs');
const fx = require('./__fixtures__/stack-detect-fixtures.cjs');

function withShape(build, fn) {
  const root = build();
  try {
    return fn(root);
  } finally {
    fx.cleanup(root);
  }
}

const dirsOf = (areas) => areas.map((a) => a.dir);
const areaAt = (areas, dir) => areas.find((a) => a.dir === dir);

describe('detectAreas: multi-area repo (1)', () => {
  test('1: svc/ go, admin/ + portal/ flutter, sdk/python/ unsupported python, helm flag on root', () => {
    withShape(fx.multiAreaShape, (root) => {
      const areas = sd.detectAreas(root);
      assert.deepEqual(dirsOf(areas), ['', 'admin/', 'portal/', 'sdk/python/', 'svc/']);

      const rootArea = areaAt(areas, '');
      assert.deepEqual(rootArea.kinds, []);
      assert.equal(rootArea.tier, null);
      assert.deepEqual(rootArea.flags, ['helm']);
      assert.ok(rootArea.evidence.includes('chart/app/Chart.yaml'));
      assert.equal('unsupported' in rootArea, false);

      const svc = areaAt(areas, 'svc/');
      assert.deepEqual(svc.kinds, ['go']);
      assert.equal(svc.tier, 'go');
      assert.deepEqual(svc.flags, ['golangci']);
      assert.ok(svc.evidence.includes('svc/go.mod'));
      assert.ok(svc.evidence.includes('svc/.golangci.yml'));

      const admin = areaAt(areas, 'admin/');
      assert.deepEqual(admin.kinds, ['flutter']);
      assert.equal(admin.tier, 'flutter');
      assert.deepEqual(admin.flags, ['maestro']);
      assert.ok(admin.evidence.includes('admin/pubspec.yaml'));

      const portal = areaAt(areas, 'portal/');
      assert.deepEqual(portal.kinds, ['flutter']);
      assert.equal(portal.tier, 'flutter');
      assert.deepEqual(portal.flags, []);

      const py = areaAt(areas, 'sdk/python/');
      assert.deepEqual(py.kinds, ['python']);
      assert.equal(py.tier, null);
      assert.equal(py.unsupported, 'python');
      assert.deepEqual(py.flags, ['unsupported']);

      // No chart/ area: helm is a flag, never a component.
      assert.equal(areas.some((a) => a.dir.startsWith('chart/')), false);
    });
  });

  test('1b: every area has the documented shape; dirs carry a trailing slash', () => {
    withShape(fx.multiAreaShape, (root) => {
      for (const a of sd.detectAreas(root)) {
        assert.equal(typeof a.dir, 'string');
        assert.ok(a.dir === '' || a.dir.endsWith('/'), `dir ${a.dir}`);
        assert.ok(Array.isArray(a.kinds));
        assert.ok(Array.isArray(a.evidence));
        assert.ok(Array.isArray(a.flags));
        assert.ok(a.tier === null || ['go', 'dart', 'flutter'].includes(a.tier));
      }
    });
  });
});

describe('detectAreas: Dart vs Flutter (2)', () => {
  test('2: a pubspec without `sdk: flutter` is dart; with it is flutter', () => {
    withShape(fx.pureDartSiblingShape, (root) => {
      const areas = sd.detectAreas(root);
      assert.deepEqual(dirsOf(areas), ['api-dart/', 'app/', 'server/']);
      const api = areaAt(areas, 'api-dart/');
      assert.deepEqual(api.kinds, ['dart']);
      assert.equal(api.tier, 'dart');
      const app = areaAt(areas, 'app/');
      assert.deepEqual(app.kinds, ['flutter']);
      assert.equal(app.tier, 'flutter');
      assert.equal(areaAt(areas, 'server/').tier, 'go');
    });
  });
});

describe('detectAreas: depth (3)', () => {
  test('3: markers at path depth 3 are found; depth 4 is not', () => {
    withShape(fx.deepNestedShape, (root) => {
      const areas = sd.detectAreas(root);
      assert.deepEqual(dirsOf(areas), ['ai/flutter/', 'product/go/']);
      assert.equal(areaAt(areas, 'product/go/').tier, 'go');
      assert.equal(areaAt(areas, 'ai/flutter/').tier, 'flutter');
    });
  });

  test('3b: maxDepth widens (or narrows) the walk', () => {
    withShape(fx.deepNestedShape, (root) => {
      assert.ok(dirsOf(sd.detectAreas(root, { maxDepth: 4 })).includes('too/deep/down/'));
      assert.deepEqual(sd.detectAreas(root, { maxDepth: 1 }), []);
    });
  });
});

describe('detectAreas: skip list (4)', () => {
  test('4: caches, vendored code, worktrees, examples, platform dirs and nested checkouts are skipped', () => {
    withShape(fx.skipListShape, (root) => {
      const areas = sd.detectAreas(root);
      assert.deepEqual(dirsOf(areas), ['', 'flutter_app/']);
      assert.equal(areaAt(areas, '').tier, 'go');
      assert.equal(areaAt(areas, 'flutter_app/').tier, 'flutter');
      // The skipped ios/Cargo.toml never leaks a rust kind onto the Flutter area.
      assert.deepEqual(areaAt(areas, 'flutter_app/').kinds, ['flutter']);
    });
  });
});

describe('detectAreas: single root area (5)', () => {
  test('5: root go.mod + buf.yaml + sqlc.yaml + a //go:generate file -> one area with flags buf, go_generate, sqlc', () => {
    withShape(fx.singleRootGoShape, (root) => {
      const areas = sd.detectAreas(root);
      assert.equal(areas.length, 1);
      const a = areas[0];
      assert.equal(a.dir, '');
      assert.deepEqual(a.kinds, ['go']);
      assert.equal(a.tier, 'go');
      assert.deepEqual(a.flags, ['buf', 'go_generate', 'sqlc']);
      assert.ok(a.evidence.includes('go.mod'));
      assert.ok(a.evidence.includes('internal/spec/spec.go'));
    });
  });

  test('5b: a generated-code header counts only within the first 5 lines', () => {
    withShape(() => fx.generatedGoShape({ headerLine: 1 }), (root) => {
      assert.ok(sd.detectAreas(root)[0].flags.includes('generated'));
    });
    withShape(() => fx.generatedGoShape({ headerLine: 7 }), (root) => {
      assert.equal(sd.detectAreas(root)[0].flags.includes('generated'), false);
    });
  });
});

describe('detectAreas: unsupported and empty shapes (6)', () => {
  test('6a: Tauri -> one root area, tier null, unsupported tauri; src-tauri/ is not its own area', () => {
    withShape(fx.tauriShape, (root) => {
      const areas = sd.detectAreas(root);
      assert.deepEqual(dirsOf(areas), ['']);
      const a = areas[0];
      assert.deepEqual(a.kinds, ['node', 'rust']);
      assert.equal(a.tier, null);
      assert.equal(a.unsupported, 'tauri');
      assert.ok(a.flags.includes('unsupported'));
      assert.ok(a.evidence.includes('package.json'));
      assert.ok(a.evidence.includes('src-tauri/Cargo.toml'));
    });
  });

  test('6b: C/C++ only -> zero language areas plus a root `unsupported: cpp` note', () => {
    withShape(fx.cppOnlyShape, (root) => {
      const areas = sd.detectAreas(root);
      assert.equal(areas.filter((a) => a.kinds.length > 0).length, 0);
      assert.deepEqual(dirsOf(areas), ['']);
      assert.equal(areas[0].tier, null);
      assert.equal(areas[0].unsupported, 'cpp');
      assert.ok(areas[0].flags.includes('unsupported'));
      assert.ok(areas[0].evidence.includes('CMakeLists.txt'));
    });
  });

  test('6c: an empty repo and a docs-only repo give [] without throwing', () => {
    withShape(fx.emptyShape, (root) => assert.deepEqual(sd.detectAreas(root), []));
    withShape(fx.docsOnlyShape, (root) => assert.deepEqual(sd.detectAreas(root), []));
  });

  test('6d: a missing root gives []; an unreadable subdir is skipped, never thrown', () => {
    assert.deepEqual(sd.detectAreas(path.join(fs.realpathSync(require('os').tmpdir()), 'df-no-such-dir-42-05')), []);
    withShape(fx.pureDartSiblingShape, (root) => {
      const locked = path.join(root, 'api-dart');
      fs.chmodSync(locked, 0o000);
      try {
        const areas = sd.detectAreas(root);
        assert.ok(dirsOf(areas).includes('app/'));
        assert.ok(dirsOf(areas).includes('server/'));
      } finally {
        fs.chmodSync(locked, 0o755);
      }
    });
  });
});

describe('detectAreas: Flutter extras (7)', () => {
  test('7a: integration_test/ -> flag integration_test; .maestro/ -> flag maestro', () => {
    withShape(() => fx.flutterAppShape({ maestro: true, integration: true }), (root) => {
      const areas = sd.detectAreas(root);
      assert.deepEqual(dirsOf(areas), ['']);
      assert.equal(areas[0].tier, 'flutter');
      assert.ok(areas[0].flags.includes('integration_test'));
      assert.ok(areas[0].flags.includes('maestro'));
      assert.equal(areas[0].flags.includes('build_runner'), false);
    });
  });

  test('7b: build_runner in dev_dependencies -> flag build_runner (and *.g.dart -> generated)', () => {
    withShape(() => fx.flutterAppShape({ buildRunner: true }), (root) => {
      const [a] = sd.detectAreas(root);
      assert.ok(a.flags.includes('build_runner'));
      assert.ok(a.flags.includes('generated'));
      assert.equal(a.flags.includes('integration_test'), false);
      assert.equal(a.flags.includes('maestro'), false);
    });
  });

  test('7c: a plain Flutter app has no extra flags, and android/ios/web never become areas', () => {
    withShape(() => fx.flutterAppShape({}), (root) => {
      const areas = sd.detectAreas(root);
      assert.deepEqual(dirsOf(areas), ['']);
      assert.deepEqual(areas[0].flags, []);
    });
  });
});

describe('AREA_MARKERS is data', () => {
  test('languages map to a tier only for go/dart/flutter; node/rust/python stay null', () => {
    const tiers = Object.fromEntries(sd.AREA_MARKERS.languages.map((l) => [l.kind, l.tier]));
    assert.equal(tiers.go, 'go');
    assert.equal(tiers.dart, 'dart');
    assert.equal(tiers.node, null);
    assert.equal(tiers.rust, null);
    assert.equal(tiers.python, null);
  });
});
