'use strict';

/**
 * upgrade-project.js and the pre-rename layout (objective 78, TRD 78-07, SC-4). Migrations 0012 (planning-dir move)
 * and 0013 (config-key rename) are retired: the SessionStart hook no longer converts anything. A project that still
 * has only the pre-rename planning directory gets ONE global notice carrying planning-layout.legacyLayoutMessage, and
 * nothing else happens: no migration, no commit, no `.aoforge/`.
 *
 * Test list (TRD 78-07 numbering)
 *  1. A legacy-only git project, the hook started at its root and then in a subdirectory of it: one global notice in
 *     <HOME>/.claude/aoforge/.aoforge-notices.json, key `legacy-layout:<realpath of the root>`, level action,
 *     message === legacyLayoutMessage(root); no `.aoforge/` anywhere under the project; the project tree, its
 *     `git status --porcelain` and info/exclude are unchanged; no backup, no project notice; stdout empty, exit 0.
 *     The second run leaves exactly one unconsumed notice with that key.
 *  1b. legacyRootFor (exported) holds before and after TRD 78-11: a finder that returns the legacy root (compat
 *      still resolving the pre-rename directory) and a finder that returns null both yield the legacy root; a finder
 *      that returns an `.aoforge/` project yields null; AOFORGE_SKIP_UPGRADE=1 queues nothing.
 *  2. An `.aoforge/` project whose config.json has only the pre-rename stamp key: the normal upgrade runs, writes an
 *     `aoforge` stamp with the bundled version and leaves the pre-rename key byte-identical; no legacy notice.
 *
 * Every spawn: cwd = the fixture (or a directory in it), HOME = the fixture's fake home, CLAUDE_PLUGIN_ROOT = this
 * repository's plugin directory (only read). A detached commit child is awaited with a bounded poll.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { NAMES, LEGACY } = require('../aoforge/bin/lib/legacy-names.cjs');
const { legacyLayoutMessage } = require('../aoforge/bin/lib/planning-layout.cjs');
const notices = require('../aoforge/bin/lib/notices.cjs');
const { planningProject, nestedProject, STAMP } = require('../aoforge/bin/lib/__fixtures__/legacy-layout-fixtures.cjs');

const HOOK = path.join(__dirname, 'upgrade-project.js');
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const BUNDLED = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf-8')).version;
const NEW = NAMES.planningDir;
const OLD = LEGACY.planningDir;

function hookEnv(p, extra = {}) {
  return {
    ...p.env,
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    [`${NAMES.envPrefix}SKIP_PRUNE`]: '1',
    [`${NAMES.envPrefix}SKIP_TRANSCRIPT_EXPORT`]: '1',
    ...extra,
  };
}

function runHook(p, cwd = p.root, extra = {}) {
  const r = spawnSync(process.execPath, [HOOK], {
    cwd, env: hookEnv(p, extra), encoding: 'utf-8', input: '{}', timeout: 60000,
  });
  assert.equal(r.status, 0, `hook must exit 0 (stderr: ${r.stderr})`);
  assert.equal(r.stdout, '', 'SessionStart stdout stays empty');
  return r;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function pollUntil(fn, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v || Date.now() >= end) return v;
    sleep(200);
  }
}

const globalNotices = (p) => notices.readNotices(notices.globalNoticesPath(p.home));
const projectNotices = (p, dir) => notices.readNotices(path.join(p.root, dir, NAMES.notices));
const backupsDir = (p) => path.join(p.home, '.claude', NAMES.runtimeDir, 'backups');

/** Every directory named `.aoforge` under `dir` (`.git` skipped). */
function newDirsUnder(dir) {
  const found = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === '.git') continue;
      const abs = path.join(d, e.name);
      if (e.name === NEW) found.push(abs);
      walk(abs);
    }
  };
  walk(dir);
  return found;
}

/** Every file under `dir` (`.git` skipped), relative path -> content. */
function snapshotTree(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else out[path.relative(dir, abs)] = fs.readFileSync(abs, 'utf-8');
    }
  };
  walk(dir);
  return out;
}

const readExclude = (p) => {
  const file = path.join(p.root, '.git', 'info', 'exclude');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
};

// ─── 1. a legacy-only project ─────────────────────────────────────────────────

describe('1. a legacy-only project gets one global notice and nothing else', () => {
  test('1. from the root, then from a subdirectory: one notice keyed by the realpath, no tree change', () => {
    const p = planningProject({ layout: 'legacy', configKey: 'legacy', git: true });
    try {
      const root = fs.realpathSync(p.root);
      const key = `legacy-layout:${root}`;
      const sub = path.join(p.root, 'src', 'deep');
      fs.mkdirSync(sub, { recursive: true });
      const treeBefore = snapshotTree(p.root);
      const statusBefore = p.git(['status', '--porcelain']);
      const excludeBefore = readExclude(p);
      const head = p.git(['rev-parse', 'HEAD']).trim();

      runHook(p);
      const first = globalNotices(p).filter((n) => n.key === key);
      assert.equal(first.length, 1, JSON.stringify(globalNotices(p)));
      assert.equal(first[0].source, 'upgrade-project');
      assert.equal(first[0].level, 'action');
      assert.equal(first[0].message, legacyLayoutMessage(root));
      assert.equal(first[0].consumed, false);

      runHook(p, sub);
      sleep(300);
      const all = globalNotices(p);
      assert.equal(all.filter((n) => n.key === key && n.consumed !== true).length, 1, JSON.stringify(all));
      assert.equal(all.length, 1, 'no other global notice');

      assert.deepEqual(newDirsUnder(p.root), [], `no ${NEW}/ anywhere under the project`);
      assert.deepEqual(snapshotTree(p.root), treeBefore, 'the project tree is byte-identical');
      assert.equal(p.git(['status', '--porcelain']), statusBefore);
      assert.equal(readExclude(p), excludeBefore, 'info/exclude untouched');
      assert.equal(p.git(['rev-parse', 'HEAD']).trim(), head, 'no commit');
      assert.deepEqual(projectNotices(p, OLD), [], 'no project notice in the legacy directory');
      assert.equal(fs.existsSync(backupsDir(p)), false, 'no migration ran: no backup');
    } finally {
      p.cleanup();
    }
  });

  test('1. AOFORGE_SKIP_UPGRADE=1 queues nothing', () => {
    const p = planningProject({ layout: 'legacy', git: true });
    try {
      runHook(p, p.root, { [`${NAMES.envPrefix}SKIP_UPGRADE`]: '1' });
      assert.deepEqual(globalNotices(p), []);
      assert.deepEqual(newDirsUnder(p.root), []);
    } finally {
      p.cleanup();
    }
  });
});

describe('1b. legacyRootFor holds before and after compat drops the pre-rename directory (TRD 78-11)', () => {
  const hook = () => require('./upgrade-project.js');

  test('1b. a finder returning the legacy root, or null, yields the legacy root', () => {
    const p = planningProject({ layout: 'legacy', git: false });
    try {
      const sub = path.join(p.root, 'src');
      fs.mkdirSync(sub);
      const { legacyRootFor } = hook();
      assert.equal(typeof legacyRootFor, 'function', 'upgrade-project.js exports legacyRootFor');
      assert.equal(legacyRootFor(sub, { find: () => p.root }), p.root, 'compat still resolves the legacy directory');
      assert.equal(legacyRootFor(sub, { find: () => null }), p.root, 'compat no longer resolves it');
    } finally {
      p.cleanup();
    }
  });

  test('1b. an .aoforge/ project (nested below a legacy one, or alone) yields null', () => {
    const p = planningProject({ layout: 'legacy', git: false });
    const a = planningProject({ layout: 'aoforge', git: false });
    try {
      const inner = nestedProject(p.root, 'inner', { layout: 'aoforge' });
      const { legacyRootFor } = hook();
      assert.equal(legacyRootFor(inner, { find: () => inner }), null);
      assert.equal(legacyRootFor(a.root, { find: () => a.root }), null);
      assert.equal(legacyRootFor(a.root, { find: () => null }), null);
    } finally {
      p.cleanup();
      a.cleanup();
    }
  });
});

// ─── 2. an .aoforge/ project with only the pre-rename stamp key ───────────────

describe('2. a pre-rename stamp key in .aoforge/config.json', () => {
  test('2. the normal upgrade stamps the aoforge key and leaves the pre-rename key in place', () => {
    const p = planningProject({ layout: 'aoforge', configKey: 'legacy', git: true });
    try {
      const configFile = path.join(p.root, NEW, 'config.json');
      const oldText = JSON.stringify(JSON.parse(fs.readFileSync(configFile, 'utf-8'))[LEGACY.configKey], null, 2);
      const before = Number(p.git(['rev-list', '--count', 'HEAD']).trim());

      runHook(p);
      // The hook's own notice is written before it exits; wait for the detached commit child so cleanup never races it.
      const landed = pollUntil(() => Number(p.git(['rev-list', '--count', 'HEAD']).trim()) > before);
      assert.ok(landed, `the background commit landed (notices: ${JSON.stringify(projectNotices(p, NEW))})`);
      pollUntil(() => projectNotices(p, NEW).some((n) => n.source === 'upgrade-commit'));

      const cfg = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      assert.equal(cfg[NAMES.configKey] && cfg[NAMES.configKey].version, BUNDLED, JSON.stringify(cfg));
      assert.equal(JSON.stringify(cfg[LEGACY.configKey], null, 2), oldText, 'the pre-rename key is byte-identical');
      assert.deepEqual(cfg[LEGACY.configKey], { ...STAMP });
      assert.equal(globalNotices(p).some((n) => String(n.key).startsWith('legacy-layout:')), false);
      assert.ok(
        projectNotices(p, NEW).some((n) => n.source === 'upgrade-project' && /upgraded this project/.test(n.message)),
        JSON.stringify(projectNotices(p, NEW)),
      );
      assert.equal(fs.existsSync(path.join(p.root, OLD)), false, `${OLD}/ is never created`);
    } finally {
      p.cleanup();
    }
  });
});
