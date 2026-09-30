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
//
// TRD 42-12 (gap G1: a gitignored `dist/<scaffold>/` tree was drafted as a go component). The
// TRD's numbering:
// T1. git fixture, `.gitignore: dist/`, a go.mod at dist/scaffoldapp/ (force-tracked), a root go.mod
//     and a Flutter app/ -> areas '' and app/ only. T1b: the same with a NON-fallback rule
//     (`bundle/`) proves git did the pruning; the index-aware check would have missed it.
// T4. An injected isIgnored returning gen/: no area under gen/, the walk never reads inside it,
//     and the candidates of one level arrive in ONE batched call.
// T5. Static fallback without git: dist/, out/, target/, coverage/, *scaffold*/ are excluded, src/
//     is kept; also when git is missing from PATH, and even when an injected filter ignores nothing.
// T6. Both rule spellings (`x` and `x/`) exclude; a negated rule keeps what git keeps (`gen/*` +
//     `!gen/keep/`); the static fallback still wins for dist/.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

// ─── TRD 42-12: ignore-aware detection ────────────────────────────────────

const GIT = fx.hasGit();
const NO_GIT = GIT ? false : 'git is not on PATH';

describe('detectAreas: gitignored dirs never become areas (42-12 T1)', () => {
  test('T1: `.gitignore: dist/` + a force-tracked dist/scaffoldapp/go.mod -> areas "" and app/ only', { skip: NO_GIT }, () => {
    withShape(() => fx.gitIgnoredScaffoldShape(), (root) => {
      const areas = sd.detectAreas(root);
      assert.deepEqual(dirsOf(areas), ['', 'app/']);
      assert.equal(areaAt(areas, 'app/').tier, 'flutter');
      assert.equal(areas.ignore_source, 'git');
      assert.equal(areas.some((a) => a.dir.startsWith('dist/')), false);
    });
  });

  test('T1b: a non-fallback rule (bundle/) is pruned by git alone; the index-aware check would miss it', { skip: NO_GIT }, () => {
    withShape(() => fx.gitIgnoredScaffoldShape({ ruleSpelling: 'bundle/', child: 'svcapp' }), (root) => {
      assert.deepEqual(dirsOf(sd.detectAreas(root)), ['', 'app/']);
      // Control: with the git filter switched off, the static list alone keeps bundle/svcapp/ —
      // so it was git, not the fallback, that pruned it.
      const staticOnly = sd.detectAreas(root, { isIgnored: null });
      assert.ok(dirsOf(staticOnly).includes('bundle/svcapp/'), JSON.stringify(dirsOf(staticOnly)));
      assert.equal(staticOnly.ignore_source, 'static');
      // Why --no-index: the dir holds a tracked file, so the default (index-aware) check says
      // "not ignored" (exit 1) — the same miss as the `.planning` dir check.
      assert.equal(spawnSync('git', ['-C', root, 'check-ignore', '-q', 'bundle/svcapp']).status, 1);
      assert.equal(spawnSync('git', ['-C', root, 'check-ignore', '-q', '--no-index', 'bundle/svcapp']).status, 0);
    });
  });

  test('T1c: defaultIsIgnored is null outside a work tree and a batch filter inside one', { skip: NO_GIT }, () => {
    withShape(fx.staticFallbackShape, (root) => assert.equal(sd.defaultIsIgnored(root), null));
    withShape(() => fx.gitIgnoredScaffoldShape({ ruleSpelling: 'bundle', child: 'svcapp' }), (root) => {
      const isIgnored = sd.defaultIsIgnored(root);
      assert.equal(typeof isIgnored, 'function');
      assert.deepEqual([...isIgnored(['app/', 'bundle/', 'bundle/svcapp/'])].sort(), ['bundle/', 'bundle/svcapp/']);
      assert.deepEqual([...isIgnored([])], []);
    });
  });
});

describe('detectAreas: injected isIgnored prunes before descending (42-12 T4)', () => {
  test('T4: isIgnored -> gen/: no area under gen/, no readdir inside it, one batched call per level', (t) => {
    const root = fx.makeTree({
      'go.mod': fx.goMod('root'),
      'svc/go.mod': fx.goMod('svc'),
      'gen/go.mod': fx.goMod('gen'),
      'gen/deep/types.go': '// Code generated by invented-gen. DO NOT EDIT.\npackage deep\n',
      'gen/deep/more/x.go': 'package more\n\n//go:generate invented-gen\n',
    });
    try {
      const calls = [];
      const isIgnored = (rels) => {
        calls.push([...rels]);
        return rels.filter((r) => r === 'gen/');
      };
      const readdir = t.mock.method(fs, 'readdirSync');
      const areas = sd.detectAreas(root, { isIgnored });
      const read = readdir.mock.calls.map((c) => String(c.arguments[0]));
      readdir.mock.restore();

      assert.deepEqual(dirsOf(areas), ['', 'svc/']);
      assert.equal(areas.ignore_source, 'custom');
      // Pruned BEFORE the walk went deeper: nothing inside gen/ was ever listed.
      const genAbs = path.join(root, 'gen');
      assert.deepEqual(read.filter((p) => p === genAbs || p.startsWith(genAbs + path.sep)), []);
      // ...so its codegen markers never reach the root area.
      assert.deepEqual(areaAt(areas, '').flags, []);
      // One batched call per level: the first carries every level-1 candidate together, and no
      // dir is ever asked about twice.
      assert.deepEqual(calls[0], ['gen/', 'svc/']);
      const asked = calls.flat();
      assert.equal(new Set(asked).size, asked.length, JSON.stringify(calls));
      assert.ok(calls.every((c) => c.length > 0), 'never called with an empty batch');
    } finally {
      fx.cleanup(root);
    }
  });

  test('T4b: an isIgnored that throws falls back to the static list and never throws itself', () => {
    withShape(fx.pureDartSiblingShape, (root) => {
      const areas = sd.detectAreas(root, { isIgnored: () => { throw new Error('spawn failed'); } });
      assert.deepEqual(dirsOf(areas), ['api-dart/', 'app/', 'server/']);
      assert.equal(areas.ignore_source, 'static');
    });
  });
});

describe('detectAreas: static fallback (42-12 T5)', () => {
  test('T5: outside a git work tree dist/, out/, target/, coverage/ and *scaffold*/ are excluded; src/ is kept', () => {
    withShape(fx.staticFallbackShape, (root) => {
      const areas = sd.detectAreas(root);
      assert.deepEqual(dirsOf(areas), ['src/']);
      assert.equal(areas.ignore_source, 'static');
    });
  });

  test('T5b: the static list applies even when an injected filter ignores nothing', () => {
    withShape(fx.staticFallbackShape, (root) => {
      assert.deepEqual(dirsOf(sd.detectAreas(root, { isIgnored: () => [] })), ['src/']);
    });
  });

  test('T5c: git missing from PATH -> static only, no throw', () => {
    withShape(() => fx.gitIgnoredScaffoldShape({ ruleSpelling: 'bundle/', child: 'svcapp' }), (root) => {
      const saved = process.env.PATH;
      process.env.PATH = '';
      let areas;
      try {
        areas = sd.detectAreas(root);
      } finally {
        process.env.PATH = saved;
      }
      assert.equal(areas.ignore_source, 'static');
      assert.ok(dirsOf(areas).includes('bundle/svcapp/'));
    });
  });

  test('T5d: IGNORED_DIR_FALLBACK is the documented list', () => {
    assert.deepEqual([...sd.IGNORED_DIR_FALLBACK].sort(), ['.dart_tool', 'build', 'coverage', 'dist', 'node_modules', 'out', 'target', 'vendor']);
  });
});

describe('detectAreas: rule spellings and negation (42-12 T6)', () => {
  for (const ruleSpelling of ['dist', 'dist/', 'bundle', 'bundle/']) {
    test(`T6: the rule "${ruleSpelling}" excludes its tree`, { skip: NO_GIT }, () => {
      const child = ruleSpelling.startsWith('dist') ? 'scaffoldapp' : 'svcapp';
      withShape(() => fx.gitIgnoredScaffoldShape({ ruleSpelling, child }), (root) => {
        assert.deepEqual(dirsOf(sd.detectAreas(root)), ['', 'app/']);
      });
    });
  }

  test('T6b: `gen/*` + `!gen/keep/` keeps gen/keep/ and drops gen/drop/ (git decides)', { skip: NO_GIT }, () => {
    withShape(() => fx.negatedRuleShape(), (root) => {
      assert.deepEqual(dirsOf(sd.detectAreas(root)), ['', 'gen/keep/']);
    });
  });

  test('T6c: the static fallback still wins over a negation under dist/', { skip: NO_GIT }, () => {
    withShape(() => fx.negatedRuleShape({ dir: 'dist' }), (root) => {
      assert.deepEqual(dirsOf(sd.detectAreas(root)), ['']);
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

// ─── TRD 42-14 test 7: cwdHygiene, and the D4 nested-repo regression ─────────
//
// Invented names only: `.snapshot/api` (an ignored dir), `scratch/` (holds no tracked file),
// `vendored-sdk/` (its own `.git`, as a dir or as a worktree/submodule FILE).

const GO_MAIN_SRC = 'package main\n\nfunc main() {}\n';

function hygieneTree(extra = {}) {
  return {
    'go.mod': fx.goMod('ledger'),
    'main.go': GO_MAIN_SRC,
    'svc/main.go': GO_MAIN_SRC,
    '.snapshot/api/main.go': GO_MAIN_SRC,
    'scratch/notes.txt': 'scratch\n',
    'vendored-sdk/go.mod': fx.goMod('vendoredsdk'),
    'vendored-sdk/pkg/a.go': 'package pkg\n',
    ...extra,
  };
}

describe('cwdHygiene (TRD 42-14 test 7)', () => {
  test('injected filters: ok / ignored / untracked / nested_repo / missing, ONE batch each', () => {
    const root = fx.makeTree(hygieneTree({ 'vendored-sdk/.git/HEAD': 'ref: refs/heads/main\n' }));
    try {
      const ignCalls = [];
      const lsCalls = [];
      const isIgnored = (rels) => { ignCalls.push([...rels]); return rels.filter((r) => r === '.snapshot' || r.startsWith('.snapshot/')); };
      const lsFiles = (dirs) => { lsCalls.push([...dirs]); return ['go.mod', 'main.go', 'svc/main.go']; };
      const h = sd.cwdHygiene(root, { isIgnored, lsFiles });
      h.prime(['svc', '.snapshot/api', 'scratch', 'vendored-sdk', 'vendored-sdk/pkg', 'nope', null, '']);
      assert.equal(h(null), 'ok');
      assert.equal(h(''), 'ok');
      assert.equal(h('.'), 'ok');
      assert.equal(h('svc'), 'ok');
      assert.equal(h('./svc/'), 'ok');
      assert.equal(h('.snapshot/api'), 'ignored');
      assert.equal(h('scratch'), 'untracked');
      assert.equal(h('vendored-sdk'), 'nested_repo');
      assert.equal(h('vendored-sdk/pkg'), 'nested_repo');
      assert.equal(h('nope'), 'missing');
      assert.equal(h('main.go'), 'missing', 'a FILE is not a directory');
      assert.equal(ignCalls.length, 1, JSON.stringify(ignCalls));
      assert.equal(lsCalls.length, 1, JSON.stringify(lsCalls));
      // Missing and nested-repo cwds are decided on disk and never reach git.
      assert.equal(ignCalls[0].some((r) => r.startsWith('vendored-sdk') || r === 'nope'), false, JSON.stringify(ignCalls));
      assert.equal(lsCalls[0].some((r) => r.startsWith('vendored-sdk') || r === 'nope'), false, JSON.stringify(lsCalls));
    } finally {
      fx.cleanup(root);
    }
  });

  test('an unprimed cwd is batched on demand and memoised; a repo tracking nothing never says untracked', () => {
    const root = fx.makeTree(hygieneTree());
    try {
      let lsN = 0;
      const h = sd.cwdHygiene(root, { isIgnored: () => [], lsFiles: () => { lsN += 1; return []; } });
      assert.equal(h('scratch'), 'ok', 'nothing tracked at all: untracked carries no information');
      assert.equal(h('scratch'), 'ok');
      assert.equal(lsN, 1);
    } finally {
      fx.cleanup(root);
    }
  });

  test('no git (null filters): existence + static ignore list + .git presence; untracked is not computed', () => {
    const root = fx.makeTree(hygieneTree({ 'dist/app/main.go': GO_MAIN_SRC, 'vendored-sdk/.git': 'gitdir: ../.git/modules/vendored-sdk\n' }));
    try {
      const h = sd.cwdHygiene(root, { isIgnored: null, lsFiles: null });
      assert.equal(h('dist/app'), 'ignored');
      assert.equal(h('scratch'), 'ok');
      assert.equal(h('.snapshot/api'), 'ok', 'no git: only the static list decides ignored');
      assert.equal(h('vendored-sdk/pkg'), 'nested_repo', 'a `.git` FILE marks a nested checkout too');
      assert.equal(h('nope'), 'missing');
      assert.equal(h('../elsewhere'), 'external', 'a cwd that escapes the root is not this repo');
    } finally {
      fx.cleanup(root);
    }
  });

  test('git-backed: the real defaults answer every status with one check-ignore and one ls-files spawn (spy)', { skip: NO_GIT }, () => {
    const root = fx.makeGitTree(
      hygieneTree({ '.gitignore': '.snapshot/\n', 'vendored-sdk/.git': 'gitdir: /nonexistent/modules/vendored-sdk\n' }),
      { track: ['.gitignore', 'go.mod', 'main.go', 'svc/main.go'] },
    );
    try {
      const realIgn = sd.defaultIsIgnored(root);
      const realLs = sd.defaultLsFiles(root);
      assert.equal(typeof realIgn, 'function');
      assert.equal(typeof realLs, 'function');
      let ignN = 0;
      let lsN = 0;
      const h = sd.cwdHygiene(root, {
        isIgnored: (rels) => { ignN += 1; return realIgn(rels); },
        lsFiles: (dirs) => { lsN += 1; return realLs(dirs); },
      });
      h.prime(['svc', '.snapshot/api', 'scratch', 'vendored-sdk/pkg', 'nope']);
      assert.deepEqual(
        ['svc', '.snapshot/api', 'scratch', 'vendored-sdk/pkg', 'nope', null].map((c) => h(c)),
        ['ok', 'ignored', 'untracked', 'nested_repo', 'missing', 'ok'],
      );
      assert.equal(ignN, 1);
      assert.equal(lsN, 1);
    } finally {
      fx.cleanup(root);
    }
  });
});

describe('detectAreas never returns a nested repository (D4 regression, TRD 42-14 test 7)', () => {
  for (const [name, gitEntry] of [
    ['.git directory', { 'vendored-sdk/.git/HEAD': 'ref: refs/heads/main\n' }],
    ['.git file', { 'vendored-sdk/.git': 'gitdir: ../.git/modules/vendored-sdk\n' }],
  ]) {
    test(`vendored-sdk/ with a ${name} is not an area`, () => {
      const root = fx.makeTree(hygieneTree(gitEntry));
      try {
        const dirs = sd.detectAreas(root, { isIgnored: null }).map((a) => a.dir);
        assert.equal(dirs.includes(''), true, JSON.stringify(dirs));
        assert.equal(dirs.some((d) => d.startsWith('vendored-sdk')), false, JSON.stringify(dirs));
      } finally {
        fx.cleanup(root);
      }
    });
  }

  test('control: without its .git, vendored-sdk/ IS an area (the fixture would otherwise be detected)', () => {
    const root = fx.makeTree(hygieneTree());
    try {
      const dirs = sd.detectAreas(root, { isIgnored: null }).map((a) => a.dir);
      assert.equal(dirs.includes('vendored-sdk/'), true, JSON.stringify(dirs));
    } finally {
      fx.cleanup(root);
    }
  });
});
