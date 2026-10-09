/**
 * Tests for runtime-digest.cjs (TRD 45-03, DOC-03).
 *
 * The digest is the content half of the sync-runtime marker: `sha256:<hex>` over the
 * mirrored set (SUBDIRS minus the mirror exclusions), sorted posix relative paths and
 * file bytes. Every tree here is hand-built under a tmpdir; nothing reads or writes the
 * real ~/.claude.
 *
 * Cases (per TRD 45-03 ## Test list):
 *   1. sha256:<64 hex>, deterministic across calls
 *   2. one byte changed / a rename changes the digest
 *   3. *.test.cjs, *.test.js and __fixtures__/ do not change it
 *   4. top-level .plugin-version, .plugin-digest, state/, stacks/, backups/ do not change it
 *   5. a missing subdir counts as empty; a missing root is the digest of the empty set
 *   6. shouldExclude keeps today's hook behavior (regression table)
 *   7. readMarkerDigest returns the trimmed marker content or null
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const rd = require('./runtime-digest.cjs');

/** Build a small bundle-shaped tree and return its root. Caller cleans up via t.after. */
function makeTree(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-digest-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const spec = files || {
    'bin/x.cjs': '// x',
    'bin/lib/y.cjs': '// y',
    'workflows/w.md': '# w',
    'references/r.md': '# r',
    'templates/t.md': '# t',
  };
  for (const [rel, body] of Object.entries(spec)) put(root, rel, body);
  return root;
}

function put(root, rel, body) {
  const abs = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

const EMPTY_DIGEST = 'sha256:' + crypto.createHash('sha256').digest('hex');

describe('runtime-digest: exports', () => {
  test('exposes the shared constants the hook and doctor both consume', () => {
    assert.deepEqual(
      rd.SUBDIRS,
      ['workflows', 'references', 'templates', 'bin', 'schemas', 'stack-profiles']
    );
    assert.equal(rd.DIGEST_FILE, '.plugin-digest');
    assert.ok(Array.isArray(rd.MIRROR_EXCLUDE));
    assert.equal(rd.MIRROR_EXCLUDE.length, 3);
    for (const fn of ['digestTree', 'shouldExclude', 'readMarkerDigest']) {
      assert.equal(typeof rd[fn], 'function', `${fn} not exported`);
    }
  });
});

describe('runtime-digest: 1 — shape and determinism', () => {
  test('returns sha256:<64 hex> and is stable across two calls', (t) => {
    const root = makeTree(t);
    const a = rd.digestTree(root);
    const b = rd.digestTree(root);
    assert.match(a, /^sha256:[0-9a-f]{64}$/);
    assert.equal(a, b);
  });

  test('two independently built identical trees digest equally', (t) => {
    const a = makeTree(t);
    const b = makeTree(t);
    assert.equal(rd.digestTree(a), rd.digestTree(b));
  });
});

describe('runtime-digest: 2 — content and names matter', () => {
  test('changing one byte of bin/x.cjs changes the digest', (t) => {
    const root = makeTree(t);
    const before = rd.digestTree(root);
    put(root, 'bin/x.cjs', '// y');
    assert.notEqual(rd.digestTree(root), before);
  });

  test('renaming a file changes the digest', (t) => {
    const root = makeTree(t);
    const before = rd.digestTree(root);
    fs.renameSync(path.join(root, 'bin', 'x.cjs'), path.join(root, 'bin', 'x2.cjs'));
    assert.notEqual(rd.digestTree(root), before);
  });

  test('moving the same bytes to a different subdir changes the digest', (t) => {
    const root = makeTree(t);
    const before = rd.digestTree(root);
    fs.renameSync(path.join(root, 'workflows', 'w.md'), path.join(root, 'references', 'w.md'));
    assert.notEqual(rd.digestTree(root), before);
  });

  test('path and bytes are delimited: shifting a byte across the boundary changes the digest', (t) => {
    const a = makeTree(t, { 'bin/ab': 'c' });
    const b = makeTree(t, { 'bin/a': 'bc' });
    assert.notEqual(rd.digestTree(a), rd.digestTree(b));
  });
});

describe('runtime-digest: 3 — mirror exclusions do not count', () => {
  test('*.test.cjs, *.test.js and __fixtures__/ leave the digest unchanged', (t) => {
    const root = makeTree(t);
    const before = rd.digestTree(root);
    put(root, 'bin/lib/a.test.cjs', '// test');
    put(root, 'workflows/b.test.js', '// test');
    put(root, 'bin/lib/__fixtures__/f.json', '{"f":1}');
    put(root, 'templates/__fixtures__/deep/g.json', '{"g":1}');
    assert.equal(rd.digestTree(root), before);
  });

  test('a non-excluded file whose name merely resembles an excluded one still counts', (t) => {
    const root = makeTree(t);
    const before = rd.digestTree(root);
    put(root, 'references/design-tests.md', '# not a test file');
    assert.notEqual(rd.digestTree(root), before);
  });
});

describe('runtime-digest: 4 — only SUBDIRS count', () => {
  test('top-level markers and user dirs do not change the digest', (t) => {
    const root = makeTree(t);
    const before = rd.digestTree(root);
    put(root, '.plugin-version', '9.9.9');
    put(root, '.plugin-digest', 'sha256:deadbeef');
    put(root, 'state/current.json', '{}');
    put(root, 'stacks/custom.md', '# user profile');
    put(root, 'backups/legacy-1/skills/x.md', '# backup');
    put(root, 'loose-top-level-file.md', '# loose');
    assert.equal(rd.digestTree(root), before);
  });

  test('a faithful mirror (extras added, exclusions dropped) digests like the bundle', (t) => {
    const bundle = makeTree(t, {
      'bin/aof-tools.cjs': '// cli',
      'bin/lib/helper.cjs': '// helper',
      'bin/lib/helper.test.cjs': '// test',
      'bin/lib/__fixtures__/sample.json': '{}',
      'workflows/wf.md': '# wf',
      'schemas/s.json': '{"v":1}',
      'stack-profiles/go.md': '# go',
    });
    const mirror = makeTree(t, {
      'bin/aof-tools.cjs': '// cli',
      'bin/lib/helper.cjs': '// helper',
      'workflows/wf.md': '# wf',
      'schemas/s.json': '{"v":1}',
      'stack-profiles/go.md': '# go',
      '.plugin-version': '1.2.3',
      '.plugin-digest': 'sha256:whatever',
      'state/x.json': '{}',
      'stacks/mine.md': '# mine',
      'backups/b/c.md': '# c',
    });
    assert.equal(rd.digestTree(mirror), rd.digestTree(bundle));
  });
});

describe('runtime-digest: 5 — missing pieces', () => {
  test('a missing subdir is treated as empty and does not throw', (t) => {
    const root = makeTree(t, { 'bin/x.cjs': '// x' });
    assert.doesNotThrow(() => rd.digestTree(root));
    assert.match(rd.digestTree(root), /^sha256:[0-9a-f]{64}$/);
  });

  test('a missing root returns the digest of the empty set', () => {
    const missing = path.join(os.tmpdir(), 'rt-digest-definitely-not-here-' + process.pid);
    assert.equal(rd.digestTree(missing), EMPTY_DIGEST);
  });

  test('an existing root with no SUBDIRS is the empty-set digest too', (t) => {
    const root = makeTree(t, { 'stacks/only-user-stuff.md': '# x' });
    assert.equal(rd.digestTree(root), EMPTY_DIGEST);
  });
});

describe('runtime-digest: 6 — shouldExclude regression table (matches the hook today)', () => {
  const table = [
    // [entryName, relPath, excluded]
    ['helper.test.cjs', 'helper.test.cjs', true],
    ['helper.test.cjs', 'lib/helper.test.cjs', true],
    ['b.test.js', 'b.test.js', true],
    ['b.test.js', 'deep/er/b.test.js', true],
    ['__fixtures__', '__fixtures__', true],
    ['__fixtures__', 'lib/__fixtures__', true],
    ['sample.json', '__fixtures__/sample.json', true],
    ['sample.json', 'lib/__fixtures__/sample.json', true],
    ['sample.json', 'lib/__fixtures__/deep/sample.json', true],
    ['helper.cjs', 'lib/helper.cjs', false],
    ['aof-tools.cjs', 'aof-tools.cjs', false],
    ['test.cjs', 'test.cjs', false],
    ['contest.cjs', 'contest.cjs', false],
    ['design-tests.md', 'design-tests.md', false],
    ['fixtures.md', 'fixtures.md', false],
    ['__fixtures__x', '__fixtures__x', false],
    ['my__fixtures__', 'my__fixtures__', false],
    ['thing.test.md', 'thing.test.md', false],
    ['thing.test.cjs.bak', 'thing.test.cjs.bak', false],
  ];
  for (const [name, rel, excluded] of table) {
    test(`shouldExclude(${JSON.stringify(name)}, ${JSON.stringify(rel)}) === ${excluded}`, () => {
      assert.equal(rd.shouldExclude(name, rel), excluded);
    });
  }
});

describe('runtime-digest: 7 — readMarkerDigest', () => {
  test('returns the trimmed .plugin-digest content', (t) => {
    const dir = makeTree(t, { '.plugin-digest': '  sha256:abc123\n' });
    assert.equal(rd.readMarkerDigest(dir), 'sha256:abc123');
  });

  test('returns null when the marker file is absent', (t) => {
    const dir = makeTree(t, { 'bin/x.cjs': '// x' });
    assert.equal(rd.readMarkerDigest(dir), null);
  });

  test('returns null when the target dir itself does not exist', () => {
    const missing = path.join(os.tmpdir(), 'rt-digest-no-target-' + process.pid);
    assert.equal(rd.readMarkerDigest(missing), null);
  });

  test('returns null for an empty marker file', (t) => {
    const dir = makeTree(t, { '.plugin-digest': '   \n' });
    assert.equal(rd.readMarkerDigest(dir), null);
  });
});
