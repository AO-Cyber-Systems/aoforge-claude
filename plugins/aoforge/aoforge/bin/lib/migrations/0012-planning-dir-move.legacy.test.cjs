'use strict';

// Migration 0012 — planning-dir move (objective 72, TRD 72-08, INST-04). In-process: ctx comes from the fixture.
//
// Test list
//  6. detect: legacy only -> applies; `.aoforge` only -> not; both -> not, the reason names W066; not a git
//     repository -> applies; no planning directory -> not.
//  7. apply on a clean repository: the backup holds the old tree and ignore files; `.planning/.skill-active`
//     (untracked, excluded) ends up at `.aoforge/.skill-active`; `.gitignore` keeps its legacy line and gains the
//     AOForge line right after it; `.git/info/exclude` likewise; changed = ['.aoforge', '.gitignore', '.planning'];
//     the index holds only exact renames; detect is then not applicable.
//     7b. dry run: the same changed list, nothing written, no backup.
//     7c. tracked-dirty tree -> deferred 'dirty', nothing written, no backup.
//     7d. MERGE_HEAD -> deferred 'merge'; a rebase-merge directory -> deferred 'rebase'.
//     7e. `.aoforge/` already exists -> deferred 'exists', both trees untouched.
//     7f. a tracked file an EARLIER migration of this run changed (ctx.changedSoFar) is not the user's edit: no
//         deferral, and the change moves with the directory.
//     7g. an untracked file elsewhere in the repository is not dirt: the move happens and the file stays.
//  8. apply outside git: an fs rename; changed = ['.aoforge', '.planning']; ignore files untouched.
//  9. store mode: the cache is under `.aoforge/` and still ignored; config.json and STACK.md move as tracked renames;
//     the 0010 block has AOForge markers and both directory names; exactly one 0010 block; nothing shows untracked.
//     9b. 0010 recognises the legacy-marker block before the move: detect does not offer a second block.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { NAMES, LEGACY } = require('../legacy-names.cjs');
const { legacyProject, INFO_EXCLUDE_LINE } = require('../__fixtures__/legacy-migration-fixtures.cjs');
const { planningProject } = require('../__fixtures__/legacy-layout-fixtures.cjs');

const M_PATH = path.join(__dirname, '0012-planning-dir-move.cjs');
const NEW = NAMES.planningDir;
const OLD = LEGACY.planningDir;

function m0012() {
  return require(M_PATH);
}

function ctxFor(p, extra = {}) {
  return { projectRoot: p.root, userHome: p.home, pluginVersion: '3.0.0', dryRun: false, options: {}, ...extra };
}

function withLegacy(opts, fn) {
  const p = legacyProject(opts);
  try {
    return fn(p);
  } finally {
    p.cleanup();
  }
}

function withLayout(opts, fn) {
  const p = planningProject(opts);
  try {
    return fn(p);
  } finally {
    p.cleanup();
  }
}

function gitRaw(p, args) {
  return spawnSync('git', ['-C', p.root, ...args], { env: p.env, encoding: 'utf-8' });
}

function read(p, rel) {
  return fs.readFileSync(path.join(p.root, ...rel.split('/')), 'utf-8');
}

function lines(text) {
  return text.split('\n');
}

function backupsUnder(home) {
  const base = path.join(home, '.claude', NAMES.runtimeDir, 'backups');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base).flatMap((key) => fs.readdirSync(path.join(base, key)).map((ts) => path.join(base, key, ts)));
}

/** Every file under `dir`, relative posix, sorted. */
function walk(dir) {
  const out = [];
  const rec = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) rec(path.join(abs, e.name), r);
      else out.push(r);
    }
  };
  if (fs.existsSync(dir)) rec(dir, '');
  return out.sort();
}

/** `{rel: content}` of every file under `dir`. */
function snapshot(dir) {
  return Object.fromEntries(walk(dir).map((rel) => [rel, fs.readFileSync(path.join(dir, ...rel.split('/')), 'utf-8')]));
}

// ─── 6. detect ──────────────────────────────────────────────────────────────────

describe('6. detect', () => {
  test('6a. legacy only -> applies', () => {
    withLegacy({ state: 'clean' }, (p) => {
      const det = m0012().detect(ctxFor(p));
      assert.equal(det.applies, true, JSON.stringify(det));
      assert.match(det.reason, new RegExp(`${OLD.replace('.', '\\.')}/`));
    });
  });

  test('6b. .aoforge only -> not applicable', () => {
    withLayout({ layout: 'aoforge' }, (p) => {
      const det = m0012().detect(ctxFor(p));
      assert.equal(det.applies, false, JSON.stringify(det));
    });
  });

  test('6c. both directories -> not applicable, the reason names W066', () => {
    withLayout({ layout: 'both' }, (p) => {
      const det = m0012().detect(ctxFor(p));
      assert.equal(det.applies, false, JSON.stringify(det));
      assert.match(det.reason, /W066/);
    });
  });

  test('6d. not a git repository -> applies', () => {
    withLegacy({ state: 'nogit' }, (p) => {
      const det = m0012().detect(ctxFor(p));
      assert.equal(det.applies, true, JSON.stringify(det));
    });
  });

  test('6e. no planning directory -> not applicable', () => {
    withLayout({ layout: 'none' }, (p) => {
      const det = m0012().detect(ctxFor(p));
      assert.equal(det.applies, false, JSON.stringify(det));
    });
  });

  test('6f. the module meets the runner contract: auto, since 3.0.0', () => {
    const m = m0012();
    assert.equal(m.id, '0012');
    assert.equal(m.safety, 'auto');
    assert.equal(m.since, '3.0.0');
    assert.equal(typeof m.title, 'string');
  });
});

// ─── 7. apply in a clean repository ─────────────────────────────────────────────

describe('7. apply on a clean repository', () => {
  test('7. moves the tree with git mv, backs up first, adds AOForge ignore lines after the legacy ones', () => {
    withLegacy({ state: 'clean' }, (p) => {
      const before = snapshot(p.dir);
      const gitignoreBefore = read(p, '.gitignore');
      const trackedBefore = p.git(['ls-files']).trim().split('\n').filter((f) => f.startsWith(`${OLD}/`)).sort();

      const res = m0012().apply(ctxFor(p));

      assert.equal(res.deferred, undefined, `not deferred: ${JSON.stringify(res)}`);
      assert.deepEqual(res.changed, ['.aoforge', '.gitignore', '.planning']);

      // the backup holds the old tree and the ignore files as they were
      assert.ok(res.backup && fs.existsSync(res.backup), `backup dir exists: ${res.backup}`);
      assert.ok(res.backup.startsWith(path.join(p.home, '.claude', NAMES.runtimeDir, 'backups')), res.backup);
      assert.deepEqual(snapshot(path.join(res.backup, OLD)), before, 'the backup is the whole legacy tree');
      assert.equal(fs.readFileSync(path.join(res.backup, '0012-gitignore.before'), 'utf-8'), gitignoreBefore);
      assert.match(fs.readFileSync(path.join(res.backup, '0012-info-exclude.before'), 'utf-8'), /\.planning\/\.skill-active/);

      // the tree moved, untracked and ignored files included
      assert.equal(fs.existsSync(p.dir), false, 'the legacy directory is gone');
      assert.deepEqual(snapshot(path.join(p.root, NEW)), before, 'every file moved, byte for byte');
      assert.ok(fs.existsSync(path.join(p.root, NEW, '.skill-active')), '.skill-active moved with the directory');

      // .gitignore: the legacy line kept, the AOForge line right after it
      const gi = lines(read(p, '.gitignore'));
      const at = gi.indexOf('.planning/.progress-guard.json');
      assert.ok(at >= 0, `legacy line kept: ${gi.join('|')}`);
      assert.equal(gi[at + 1], '.aoforge/.progress-guard.json', gi.join('|'));
      assert.equal(gi.filter((l) => l === '.aoforge/.progress-guard.json').length, 1);

      // .git/info/exclude likewise
      const ex = lines(fs.readFileSync(path.join(p.root, '.git', 'info', 'exclude'), 'utf-8'));
      const ei = ex.indexOf(INFO_EXCLUDE_LINE);
      assert.ok(ei >= 0, `legacy exclude line kept: ${ex.join('|')}`);
      assert.equal(ex[ei + 1], '.aoforge/.skill-active', ex.join('|'));

      // the index holds exact renames of every tracked planning file, and nothing shows untracked
      const ns = p.git(['diff', '--cached', '--name-status', '-M', 'HEAD']).trim().split('\n');
      const renames = ns.filter((l) => l.startsWith('R'));
      assert.deepEqual(renames.map((l) => l.split('\t')[0]), renames.map(() => 'R100'), ns.join('\n'));
      assert.deepEqual(renames.map((l) => l.split('\t')[1]).sort(), trackedBefore);
      assert.deepEqual(ns.filter((l) => !l.startsWith('R')), [], `only renames staged: ${ns.join('\n')}`);
      const untracked = p.git(['status', '--porcelain']).split('\n').filter((l) => l.startsWith('??'));
      assert.deepEqual(untracked, [], `nothing untracked: ${untracked.join('|')}`);
      assert.equal(gitRaw(p, ['check-ignore', '-q', '.aoforge/.skill-active']).status, 0, 'the moved marker is ignored');

      // idempotent: nothing left to do
      const det = m0012().detect(ctxFor(p));
      assert.equal(det.applies, false, JSON.stringify(det));
    });
  });

  test('7b. dry run: the same changed list, nothing written, no backup', () => {
    withLegacy({ state: 'clean' }, (p) => {
      const before = snapshot(p.root);
      const res = m0012().apply(ctxFor(p, { dryRun: true }));
      assert.deepEqual(res.changed, ['.aoforge', '.gitignore', '.planning']);
      assert.deepEqual(snapshot(p.root), before, 'nothing written');
      assert.deepEqual(backupsUnder(p.home), [], 'no backup');
    });
  });

  test('7c. a tracked-dirty tree -> deferred "dirty", nothing written, no backup', () => {
    withLegacy({ state: 'dirty' }, (p) => {
      const before = snapshot(p.root);
      const res = m0012().apply(ctxFor(p));
      assert.equal(res.deferred, 'dirty', JSON.stringify(res));
      assert.deepEqual(res.changed, []);
      assert.match(String(res.notes), /\.planning\/STATE\.md/, 'the notes name the dirty file');
      assert.deepEqual(snapshot(p.root), before, 'nothing written');
      assert.deepEqual(backupsUnder(p.home), [], 'no backup');
    });
  });

  test('7d. a merge in progress -> deferred "merge"; a rebase -> deferred "rebase"', () => {
    withLegacy({ state: 'merge' }, (p) => {
      const before = snapshot(p.root);
      const res = m0012().apply(ctxFor(p));
      assert.equal(res.deferred, 'merge', JSON.stringify(res));
      assert.deepEqual(res.changed, []);
      assert.deepEqual(snapshot(p.root), before, 'nothing written');
    });
    withLegacy({ state: 'clean' }, (p) => {
      fs.mkdirSync(path.join(p.root, '.git', 'rebase-merge'));
      const res = m0012().apply(ctxFor(p));
      assert.equal(res.deferred, 'rebase', JSON.stringify(res));
      assert.ok(fs.existsSync(p.dir), 'not moved');
    });
  });

  test('7e. .aoforge/ already exists -> deferred "exists", both trees untouched', () => {
    withLayout({ layout: 'both' }, (p) => {
      const before = snapshot(p.root);
      const res = m0012().apply(ctxFor(p));
      assert.equal(res.deferred, 'exists', JSON.stringify(res));
      assert.match(String(res.notes), /W066/);
      assert.deepEqual(snapshot(p.root), before);
    });
  });

  test('7f. a tracked file an earlier migration of this run changed does not defer the move', () => {
    withLegacy({ state: 'clean' }, (p) => {
      fs.appendFileSync(path.join(p.dir, 'config.json'), '\n');
      const res = m0012().apply(ctxFor(p, { changedSoFar: ['.planning/config.json'] }));
      assert.equal(res.deferred, undefined, JSON.stringify(res));
      assert.equal(fs.existsSync(p.dir), false);
      assert.ok(read(p, '.aoforge/config.json').endsWith('}\n\n'), 'the earlier change moved with the file');
    });
  });

  test('7g. an untracked file outside the planning directory is not dirt and is not touched', () => {
    withLegacy({ state: 'clean' }, (p) => {
      fs.writeFileSync(path.join(p.root, 'scratch.txt'), 'mine\n');
      const res = m0012().apply(ctxFor(p));
      assert.equal(res.deferred, undefined, JSON.stringify(res));
      assert.equal(read(p, 'scratch.txt'), 'mine\n');
      assert.ok(fs.existsSync(path.join(p.root, NEW)));
    });
  });
});

// ─── 8. apply outside git ───────────────────────────────────────────────────────

describe('8. apply outside git', () => {
  test('8. an fs rename; changed names the two directories; ignore files untouched', () => {
    withLegacy({ state: 'nogit' }, (p) => {
      const before = snapshot(p.dir);
      const gitignore = read(p, '.gitignore');
      const res = m0012().apply(ctxFor(p));
      assert.equal(res.deferred, undefined, JSON.stringify(res));
      assert.deepEqual(res.changed, ['.aoforge', '.planning']);
      assert.equal(fs.existsSync(p.dir), false);
      assert.deepEqual(snapshot(path.join(p.root, NEW)), before);
      assert.equal(read(p, '.gitignore'), gitignore);
      assert.ok(res.backup && fs.existsSync(path.join(res.backup, OLD, 'STATE.md')), 'backed up');
    });
  });
});

// ─── 9. store mode ──────────────────────────────────────────────────────────────

function blockStarts(text) {
  return lines(text).filter((l) => /^# >>> \S+ store \(0010\) >>>$/.test(l));
}

describe('9. store mode', () => {
  test('9. the moved cache stays ignored; the 0010 block is AOForge-marked, names both directories, and is the only one', () => {
    withLegacy({ state: 'clean', store: true }, (p) => {
      const cacheBefore = snapshot(p.dir);
      const res = m0012().apply(ctxFor(p));
      assert.equal(res.deferred, undefined, JSON.stringify(res));
      assert.deepEqual(res.changed, ['.aoforge', '.gitignore', '.planning']);

      assert.deepEqual(snapshot(path.join(p.root, NEW)), cacheBefore, 'the whole cache moved');
      for (const rel of ['.aoforge/STATE.md', '.aoforge/PROJECT.md', '.aoforge/objectives/01-first/OBJECTIVE.md']) {
        assert.equal(gitRaw(p, ['check-ignore', '-q', rel]).status, 0, `${rel} is ignored`);
      }
      for (const rel of ['.aoforge/config.json', '.aoforge/STACK.md']) {
        assert.equal(gitRaw(p, ['check-ignore', '-q', rel]).status, 1, `${rel} is not ignored`);
      }

      const gi = read(p, '.gitignore');
      const starts = blockStarts(gi);
      assert.deepEqual(starts, ['# >>> aoforge store (0010) >>>'], `exactly one, AOForge-marked block:\n${gi}`);
      assert.ok(!gi.includes('# >>> devflow store'), 'no legacy start marker left');
      assert.ok(!gi.includes('# <<< devflow store'), 'no legacy end marker left');
      const inner = lines(gi.slice(gi.indexOf(starts[0]), gi.indexOf('# <<< aoforge store (0010) <<<')));
      for (const dir of [NEW, OLD]) {
        assert.ok(inner.includes(`${dir}/*`), `the block covers ${dir}/: ${inner.join('|')}`);
        assert.ok(inner.includes(`!${dir}/config.json`), `the block re-includes ${dir}/config.json`);
      }

      const status = p.git(['status', '--porcelain']).split('\n').filter(Boolean);
      assert.deepEqual(status.filter((l) => l.startsWith('??')), [], `nothing untracked: ${status.join('|')}`);
      const ns = p.git(['diff', '--cached', '--name-status', '-M', 'HEAD']).trim().split('\n');
      assert.deepEqual(ns.sort(), [
        'R100\t.planning/STACK.md\t.aoforge/STACK.md',
        'R100\t.planning/config.json\t.aoforge/config.json',
      ]);
    });
  });

  test('9b. 0010 recognises the legacy-marker block before the move (no second block offered)', () => {
    withLegacy({ state: 'clean', store: true }, (p) => {
      const m0010 = require('./0010-store-gitignore.cjs');
      const det = m0010.detect(ctxFor(p));
      assert.equal(det.applies, false, `0010 sees its block: ${JSON.stringify(det)}`);
      const found = m0010.discover(ctxFor(p));
      assert.equal(found.block.present, true);
      assert.equal(found.block.error, null);
    });
  });
});
