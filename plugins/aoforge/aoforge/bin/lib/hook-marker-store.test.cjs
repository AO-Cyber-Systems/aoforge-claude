'use strict';

/**
 * hook-marker-store.test.cjs — objective 45, TRD 45-10
 *
 * Location and hygiene primitives for the autonomous-mode hook markers
 * (verify-commits retry marker, verify-completion resume counter). They used to
 * live in <project>/.planning/ and now live under
 * ~/.claude/aoforge/state/hook-markers/<repo-key>/.
 *
 * Every test builds its own directories under os.tmpdir(); nothing here touches
 * the real ~/.claude.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('./hook-marker-store.cjs');
const upgrade = require('./upgrade.cjs');

const HOUR = 60 * 60 * 1000;

let root; // a fake project root
let markers; // a marker root, outside the project
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-root-'));
  markers = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-markers-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(markers, { recursive: true, force: true });
});

function ageFile(file, ms) {
  const t = new Date(Date.now() - ms);
  fs.utimesSync(file, t, t);
}

function isInside(child, parent) {
  const rel = path.relative(fs.realpathSync(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

describe('markerRoot()', () => {
  test('1a. honours AOFORGE_HOOK_MARKER_DIR', () => {
    assert.equal(store.markerRoot({ AOFORGE_HOOK_MARKER_DIR: '/x' }), '/x');
  });

  test('1b. defaults to <home>/.claude/aoforge/state/hook-markers', () => {
    assert.equal(
      store.markerRoot({}, '/h'),
      path.join('/h', '.claude', 'aoforge', 'state', 'hook-markers')
    );
  });

  test('1c. an empty override falls back to the default', () => {
    assert.equal(
      store.markerRoot({ AOFORGE_HOOK_MARKER_DIR: '' }, '/h'),
      path.join('/h', '.claude', 'aoforge', 'state', 'hook-markers')
    );
  });

  test('1d. with no home given, the default sits under os.homedir()', () => {
    assert.equal(
      store.markerRoot({}),
      path.join(os.homedir(), '.claude', 'aoforge', 'state', 'hook-markers')
    );
  });
});

describe('markerDir()', () => {
  test('2a. is <markerRoot>/<upgrade.repoKey(root)>', () => {
    const env = { AOFORGE_HOOK_MARKER_DIR: markers };
    assert.equal(store.markerDir(root, { env }), path.join(markers, upgrade.repoKey(root)));
  });

  test('2b. is never inside the project root', () => {
    const env = { AOFORGE_HOOK_MARKER_DIR: markers };
    assert.equal(isInside(store.markerDir(root, { env }), root), false);
  });

  test('2c. the default location comes from the injected home, not the project', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-home-'));
    try {
      const dir = store.markerDir(root, { env: {}, home });
      assert.equal(
        dir,
        path.join(home, '.claude', 'aoforge', 'state', 'hook-markers', upgrade.repoKey(root))
      );
      assert.equal(isInside(dir, root), false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('2d. two different projects never share a directory', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-other-'));
    try {
      const env = { AOFORGE_HOOK_MARKER_DIR: markers };
      assert.notEqual(store.markerDir(root, { env }), store.markerDir(other, { env }));
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  test('2e. fails open: a root that does not exist still yields a directory under the marker root', () => {
    const env = { AOFORGE_HOOK_MARKER_DIR: markers };
    const dir = store.markerDir(path.join(root, 'gone', 'project'), { env });
    assert.equal(path.dirname(dir), markers);
    assert.equal(path.basename(dir), 'project');
  });
});

describe('sanitize()', () => {
  test('a safe name is unchanged', () => {
    assert.equal(store.sanitize('autonomous-retry-agent_1'), 'autonomous-retry-agent_1');
  });

  test('path separators and dots are neutralised', () => {
    const out = store.sanitize('a/../b.c');
    assert.match(out, /^[A-Za-z0-9_-]+$/);
  });

  test('empty, null and undefined map to "unknown"', () => {
    assert.equal(store.sanitize(''), 'unknown');
    assert.equal(store.sanitize(null), 'unknown');
    assert.equal(store.sanitize(undefined), 'unknown');
  });

  test('a very long name is capped so it stays a legal file name', () => {
    assert.ok(store.sanitize('a'.repeat(500)).length <= 200);
  });
});

describe('markerFile()', () => {
  test('3a. a hostile name cannot escape the marker directory', () => {
    const env = { AOFORGE_HOOK_MARKER_DIR: markers };
    const file = store.markerFile(root, 'autonomous-retry-../../x', { env });
    assert.equal(path.dirname(file), store.markerDir(root, { env }));
    assert.match(path.basename(file), /^[A-Za-z0-9_-]+$/);
    assert.ok(path.basename(file).startsWith('autonomous-retry-'));
  });

  test('3b. a plain name maps to <markerDir>/<name>', () => {
    const env = { AOFORGE_HOOK_MARKER_DIR: markers };
    assert.equal(
      store.markerFile(root, 'autonomous-resume-45', { env }),
      path.join(store.markerDir(root, { env }), 'autonomous-resume-45')
    );
  });

  test('3c. the file is never inside the project root', () => {
    const env = { AOFORGE_HOOK_MARKER_DIR: markers };
    assert.equal(isInside(store.markerFile(root, 'autonomous-retry-a', { env }), root), false);
  });
});

describe('cleanStale()', () => {
  test('4a. removes only matching files older than the ttl', () => {
    const dir = path.join(markers, 'repo');
    fs.mkdirSync(dir, { recursive: true });
    const oldMatch = path.join(dir, 'autonomous-retry-old');
    const freshMatch = path.join(dir, 'autonomous-retry-fresh');
    const oldOther = path.join(dir, 'autonomous-resume-old');
    for (const f of [oldMatch, freshMatch, oldOther]) fs.writeFileSync(f, '1');
    ageFile(oldMatch, 2 * HOUR);
    ageFile(oldOther, 2 * HOUR);

    const removed = store.cleanStale(dir, Date.now(), HOUR, 'autonomous-retry-');

    assert.equal(removed, 1);
    assert.equal(fs.existsSync(oldMatch), false, 'stale matching file is removed');
    assert.equal(fs.existsSync(freshMatch), true, 'fresh matching file is kept');
    assert.equal(fs.existsSync(oldOther), true, 'a stale file with another prefix is kept');
  });

  test('4b. a missing directory returns 0 and does not throw', () => {
    assert.equal(store.cleanStale(path.join(markers, 'nope'), Date.now(), HOUR, 'x-'), 0);
  });

  test('4c. never touches a subdirectory that carries the prefix', () => {
    const dir = path.join(markers, 'repo');
    const sub = path.join(dir, 'autonomous-retry-dir');
    fs.mkdirSync(sub, { recursive: true });
    ageFile(sub, 2 * HOUR);
    assert.equal(store.cleanStale(dir, Date.now(), HOUR, 'autonomous-retry-'), 0);
    assert.equal(fs.existsSync(sub), true);
  });
});
