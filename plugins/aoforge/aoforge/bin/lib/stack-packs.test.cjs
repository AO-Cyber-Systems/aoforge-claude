'use strict';
// Objective 77 — the stack pack contract: manifest, discovery, selection, the pack profile tier,
// `stack context` fragments, `stack verify --changed|--all`, resolve-model's pack fallback, and
// the vendored mirror hook.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const packs = require('./stack-packs.cjs');
const packCli = require('./stack-packs-cli.cjs');
const { mirrorPack } = require('./pack-mirror.cjs');
const { packRoots } = require('./__fixtures__/stack-pack-env.cjs');

const AOF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const MIRROR_SRC = path.join(__dirname, 'pack-mirror.cjs');

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

/** A minimal pack tree on disk; returns its root. */
function makePack(manifest, files = {}) {
  const root = tmp('pack-src-');
  writeJson(path.join(root, 'aoforge-stack.json'), { schema: 1, contract: 1, ...manifest });
  writeJson(path.join(root, '.claude-plugin', 'plugin.json'), { name: manifest.plugin, version: '1.2.3' });
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}

function makeProject({ stack = null, config = {} } = {}) {
  const root = tmp('pack-proj-');
  fs.mkdirSync(path.join(root, '.aoforge'), { recursive: true });
  writeJson(path.join(root, '.aoforge', 'config.json'), config);
  if (stack) fs.writeFileSync(path.join(root, '.aoforge', 'STACK.md'), `---\n${stack}\n---\n`);
  return root;
}

/**
 * A fresh stacks dir holding only the named in-repo packs (`repoStacks('flutter', 'web')`). Never useRepoPacks()
 * here: it sets AOFORGE_STACKS_DIR for the whole process.
 */
function repoStacks(...names) {
  const dir = tmp('pack-repo-stacks-');
  for (const root of packRoots()) {
    if (names.includes(path.basename(root).replace(/^aoforge-stack-/, ''))) mirrorPack({ packRoot: root, stacksDir: dir });
  }
  return dir;
}

/** `<proj>/.aoforge/objectives/<objDir>/<id>-TRD.md` with the given frontmatter text. */
function writeTrd(proj, objDir, id, fmText) {
  const file = path.join(proj, '.aoforge', 'objectives', objDir, `${id}-TRD.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\n${fmText}\n---\n\n# TRD\n`);
  return file;
}

function withStacksDir(dir, fn) {
  const prev = process.env.AOFORGE_STACKS_DIR;
  process.env.AOFORGE_STACKS_DIR = dir;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.AOFORGE_STACKS_DIR; else process.env.AOFORGE_STACKS_DIR = prev;
  }
}

function run(args, { cwd, stacksDir, home }) {
  const env = { ...process.env, HOME: home || tmp('pack-home-') };
  if (stacksDir) env.AOFORGE_STACKS_DIR = stacksDir; else delete env.AOFORGE_STACKS_DIR;
  const r = spawnSync(process.execPath, [AOF_TOOLS, ...args], { cwd, env, encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* text output */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

describe('shipped packs', () => {
  for (const root of packRoots()) {
    const name = path.basename(root);
    test(`${name}: manifest validates and every path it names exists`, () => {
      const m = JSON.parse(fs.readFileSync(path.join(root, 'aoforge-stack.json'), 'utf8'));
      assert.deepEqual(packs.validateManifest(m), []);
      assert.equal(m.plugin, name);
      const rels = [...(m.profiles || []), ...Object.values(m.fragments || {}), ...(m.cli ? [m.cli] : [])];
      for (const rel of rels) assert.ok(fs.existsSync(path.join(root, rel)), `${name}: ${rel} is missing`);
      for (const list of Object.values(m.subagents || {})) {
        for (const s of list) assert.ok(fs.existsSync(path.join(root, 'agents', `${s.agent}.md`)), `${name}: agent ${s.agent} is missing`);
      }
    });

    test(`${name}: depends on aoforge and vendors the mirror hook byte for byte`, () => {
      const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
      assert.ok((plugin.dependencies || []).some((d) => (d.name || d) === 'aoforge'), 'declares the aoforge dependency');
      assert.equal(fs.readFileSync(path.join(root, 'hooks', 'sync-pack.cjs'), 'utf8'), fs.readFileSync(MIRROR_SRC, 'utf8'),
        'hooks/sync-pack.cjs must be an exact copy of core lib/pack-mirror.cjs');
      const hooks = JSON.parse(fs.readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf8'));
      assert.match(JSON.stringify(hooks.hooks.SessionStart), /sync-pack\.cjs/);
    });

    test(`${name}: listed in the marketplace at its plugin version`, () => {
      const market = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', '.claude-plugin', 'marketplace.json'), 'utf8'));
      const entry = market.plugins.find((p) => p.name === name);
      const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
      assert.ok(entry, `${name} has a marketplace entry`);
      assert.equal(entry.source, `./plugins/${name}`);
      assert.equal(entry.version, plugin.version);
    });
  }
});

// Quick 34: the packs depend on `aoforge >=3.1.0`. A core that says less makes Claude Code disable
// every pack (`dependency-version-unsatisfied`), so the release files, the packs' range and the
// CHANGELOG heading are checked together here.
describe('core version against the packs (quick 34)', () => {
  const REPO = path.join(__dirname, '..', '..', '..', '..', '..');
  const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8'));
  const semver = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
    assert.ok(m, `not a plain X.Y.Z version: ${v}`);
    return m.slice(1).map(Number);
  };
  const atLeast = (a, b) => {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return true;
  };

  test('core version: the sync files agree, satisfy every pack\'s aoforge range, and have a CHANGELOG heading', () => {
    const pkg = readJson('package.json');
    const lock = readJson('package-lock.json');
    const plugin = readJson('plugins/aoforge/.claude-plugin/plugin.json');
    const market = readJson('.claude-plugin/marketplace.json');
    const entry = market.plugins.find((p) => p.name === 'aoforge');
    const core = pkg.version;
    assert.deepEqual(
      { lock: lock.version, lockRoot: lock.packages[''].version, plugin: plugin.version, market: market.version, entry: entry && entry.version },
      { lock: core, lockRoot: core, plugin: core, market: core, entry: core },
      'package.json, package-lock.json (root and packages[""]), plugins/aoforge plugin.json and marketplace.json (top level and the aoforge entry) must agree');

    const roots = packRoots();
    assert.ok(roots.length > 0, 'no in-repo pack found');
    for (const root of roots) {
      const name = path.basename(root);
      const pj = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
      const dep = (pj.dependencies || []).find((d) => (d && d.name ? d.name : d) === 'aoforge');
      assert.ok(dep, `${name}: no aoforge dependency`);
      const range = typeof dep === 'object' ? dep.version : undefined;
      const m = /^>=(\d+)\.(\d+)\.(\d+)$/.exec(range || '');
      assert.ok(m, `${name}: unsupported range ${JSON.stringify(range)} for aoforge (this test reads only >=X.Y.Z)`);
      assert.ok(atLeast(semver(core), m.slice(1).map(Number)),
        `${name} needs aoforge ${range}, but core is ${core}: Claude Code disables the pack (dependency-version-unsatisfied)`);
    }

    const changelog = fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8');
    assert.match(changelog, new RegExp(`^## \\[${core.replace(/\./g, '\\.')}\\]`, 'm'), `CHANGELOG.md has no ## [${core}] heading`);
  });

  test('stack-pack-hints covers exactly the profiles the in-repo packs ship', () => {
    const { PACK_PROFILES, packInstallHint } = require('./stack-pack-hints.cjs');
    assert.ok(Object.isFrozen(PACK_PROFILES), 'PACK_PROFILES is frozen');
    const shipped = {};
    for (const root of packRoots()) {
      const m = JSON.parse(fs.readFileSync(path.join(root, 'aoforge-stack.json'), 'utf8'));
      for (const rel of m.profiles || []) shipped[path.basename(rel, '.md')] = m.plugin;
    }
    assert.ok(Object.keys(shipped).length > 0, 'the in-repo packs ship no profile');
    assert.deepEqual({ ...PACK_PROFILES }, shipped, 'every pack-shipped profile id maps to its pack, and nothing else is listed');
    const market = readJson('.claude-plugin/marketplace.json');
    for (const [id, plugin] of Object.entries(PACK_PROFILES)) {
      assert.ok(fs.existsSync(path.join(REPO, 'plugins', plugin, 'profiles', `${id}.md`)), `${plugin} does not ship profiles/${id}.md`);
      assert.ok(market.plugins.some((p) => p.name === plugin), `${plugin} is not in the marketplace`);
      const hint = packInstallHint(id);
      assert.ok(hint.includes(`/plugin install ${plugin}@${market.name}`), hint);
    }
    assert.equal(packInstallHint('go'), null);
    assert.equal(packInstallHint('nosuch'), null);
  });
});

describe('validateManifest', () => {
  test('rejects an unknown key, a bad name and an unsupported contract', () => {
    assert.ok(packs.validateManifest({ schema: 1, name: 'x', plugin: 'p', contract: 1, bogus: 1 }).length > 0);
    assert.ok(packs.validateManifest({ schema: 1, name: 'X Y', plugin: 'p', contract: 1 }).length > 0);
    assert.ok(packs.validateManifest({ schema: 1, name: 'x', plugin: 'p', contract: 9 }).some((i) => /contract/.test(i)));
  });
});

describe('pack-mirror', () => {
  test('copies runtime files, skips hooks/tests/fixtures, then reports current until the content changes', () => {
    const src = makePack({ name: 'demo', plugin: 'aoforge-stack-demo' }, {
      'fragments/executor.md': 'do it',
      'lib/x.cjs': 'module.exports = 1;',
      'lib/x.test.cjs': 'test',
      'lib/__fixtures__/f.txt': 'f',
      'hooks/hooks.json': '{}',
    });
    const stacks = tmp('pack-stacks-');
    assert.equal(mirrorPack({ packRoot: src, stacksDir: stacks }).action, 'copied');
    const dest = path.join(stacks, 'demo');
    assert.ok(fs.existsSync(path.join(dest, 'fragments', 'executor.md')));
    assert.ok(fs.existsSync(path.join(dest, 'lib', 'x.cjs')));
    for (const skipped of ['lib/x.test.cjs', 'lib/__fixtures__/f.txt', 'hooks/hooks.json', '.claude-plugin/plugin.json']) {
      assert.ok(!fs.existsSync(path.join(dest, skipped)), `${skipped} is not mirrored`);
    }
    assert.equal(fs.readFileSync(path.join(dest, '.pack-version'), 'utf8').trim(), '1.2.3');
    assert.equal(mirrorPack({ packRoot: src, stacksDir: stacks }).action, 'current');
    fs.writeFileSync(path.join(src, 'fragments', 'executor.md'), 'do it differently');
    assert.equal(mirrorPack({ packRoot: src, stacksDir: stacks }).action, 'copied');
    assert.equal(fs.readFileSync(path.join(dest, 'fragments', 'executor.md'), 'utf8'), 'do it differently');
  });

  test('the hook entry fails open: a broken pack root is one stderr line and exit 0', () => {
    const r = spawnSync(process.execPath, [MIRROR_SRC], {
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: tmp('pack-empty-'), AOFORGE_STACKS_DIR: tmp('pack-stacks-') },
      encoding: 'utf8',
    });
    assert.equal(r.status, 0);
    assert.match(r.stderr, /stack pack mirror skipped/);
  });
});

describe('discovery and enablement', () => {
  function homeWithPack(registry, settings) {
    const home = tmp('pack-home-');
    const stacks = path.join(home, '.claude', 'aoforge', 'stacks');
    mirrorPack({ packRoot: makePack({ name: 'demo', plugin: 'aoforge-stack-demo' }), stacksDir: stacks });
    if (registry) writeJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), registry);
    if (settings) writeJson(path.join(home, '.claude', 'settings.json'), settings);
    return home;
  }

  function discovered(home) {
    const prev = process.env.AOFORGE_STACKS_DIR;
    delete process.env.AOFORGE_STACKS_DIR;
    try { return packs.discoverPacks({ userHome: home }); } finally {
      if (prev !== undefined) process.env.AOFORGE_STACKS_DIR = prev;
    }
  }

  test('no registry at all: the mirror counts as enabled', () => {
    assert.equal(discovered(homeWithPack(null))[0].enabled, true);
  });

  test('a registry without the plugin: the stale mirror is ignored', () => {
    assert.equal(discovered(homeWithPack({ version: 2, plugins: { 'other@aocyber': [{ scope: 'user', version: '1' }] } }))[0].enabled, false);
  });

  test('installed but disabled in settings: ignored', () => {
    const reg = { version: 2, plugins: { 'aoforge-stack-demo@aocyber': [{ scope: 'user', version: '1.2.3' }] } };
    assert.equal(discovered(homeWithPack(reg))[0].enabled, true);
    assert.equal(discovered(homeWithPack(reg, { enabledPlugins: { 'aoforge-stack-demo@aocyber': false } }))[0].enabled, false);
  });

  test('a mirror whose manifest name differs from its directory is broken, never enabled', () => {
    const stacks = tmp('pack-stacks-');
    mirrorPack({ packRoot: makePack({ name: 'demo', plugin: 'aoforge-stack-demo' }), stacksDir: stacks });
    fs.renameSync(path.join(stacks, 'demo'), path.join(stacks, 'other'));
    const [p] = withStacksDir(stacks, () => packs.discoverPacks({}));
    assert.equal(p.enabled, false);
    assert.ok(p.issues.some((i) => /does not match/.test(i)));
  });
});

describe('selection, proposal and the pack profile tier', () => {
  const stacks = tmp('pack-stacks-');
  mirrorPack({
    packRoot: makePack({
      name: 'demo', plugin: 'aoforge-stack-demo', profiles: ['profiles/demo.md'],
      detect: { files: ['demo.lock'] }, select: { runtime: ['web'] },
      fragments: { executor: 'fragments/executor.md' },
      subagents: { verifier: [{ agent: 'demo-verifier', when: 'a demo runs' }] },
      models: { 'demo-verifier': { quality: 'opus', balanced: 'sonnet', budget: 'haiku' } },
    }, {
      'profiles/demo.md': '---\nschema: 1\nid: demo\n---\n\n## Idioms\n\nDemo idiom.\n',
      'fragments/executor.md': 'demo steps',
      'agents/demo-verifier.md': '---\nname: demo-verifier\n---\n',
    }),
    stacksDir: stacks,
  });

  test('extends <pack profile> activates the pack, and the profile resolves from the pack tier', () => {
    const proj = makeProject({ stack: 'schema: 1\nextends: demo' });
    const r = run(['stack', 'discover'], { cwd: proj, stacksDir: stacks });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.json.active.map((a) => a.name), ['demo']);
    const resolved = run(['stack', 'resolve'], { cwd: proj, stacksDir: stacks });
    assert.ok(resolved.json.chain.some((l) => l.id === 'demo' && l.source === 'pack'), JSON.stringify(resolved.json.chain));
  });

  test('detection only proposes; config stacks.enabled activates; stacks.disabled wins', () => {
    const proj = makeProject({});
    fs.writeFileSync(path.join(proj, 'demo.lock'), '');
    let r = run(['stack', 'discover'], { cwd: proj, stacksDir: stacks });
    assert.deepEqual(r.json.active, []);
    assert.deepEqual(r.json.proposed.map((p) => p.name), ['demo']);

    writeJson(path.join(proj, '.aoforge', 'config.json'), { stacks: { enabled: ['demo'] } });
    r = run(['stack', 'discover'], { cwd: proj, stacksDir: stacks });
    assert.deepEqual(r.json.active.map((a) => a.reason), ['config stacks.enabled']);

    writeJson(path.join(proj, '.aoforge', 'config.json'), { stacks: { enabled: ['demo'], disabled: ['demo'] } });
    r = run(['stack', 'discover'], { cwd: proj, stacksDir: stacks });
    assert.deepEqual(r.json.active, []);
  });

  test('select.runtime matches verification.runtime', () => {
    const proj = makeProject({ stack: 'schema: 1\nverification:\n  runtime: web' });
    const r = run(['stack', 'discover'], { cwd: proj, stacksDir: stacks });
    assert.deepEqual(r.json.active.map((a) => a.reason), ['verification.runtime web']);
  });

  test('stack context lists the agent\'s fragment and sub-agents; a repo with no pack gets nothing', () => {
    const proj = makeProject({ stack: 'schema: 1\nextends: demo' });
    let r = run(['stack', 'context', 'executor', '--raw'], { cwd: proj, stacksDir: stacks });
    assert.match(r.stdout, /## Stack packs/);
    assert.match(r.stdout, /demo: Read `.*fragments\/executor\.md`/);
    r = run(['stack', 'context', 'verifier'], { cwd: proj, stacksDir: stacks });
    assert.deepEqual(r.json.packs.subagents, [{ pack: 'demo', agent: 'aoforge-stack-demo:demo-verifier', when: 'a demo runs' }]);

    const plain = makeProject({});
    r = run(['stack', 'context', 'executor', '--raw'], { cwd: plain, stacksDir: stacks });
    assert.doesNotMatch(r.stdout, /Stack packs/);
  });

  test('resolve-model takes a pack agent\'s tiers from its manifest', () => {
    const proj = makeProject({ config: { model_profile: 'budget' } });
    const r = run(['resolve-model', 'aoforge-stack-demo:demo-verifier'], { cwd: proj, stacksDir: stacks });
    assert.equal(r.json.tier, 'haiku');
    assert.equal(r.json.unknown_agent, undefined);
  });
});

describe('stack verify --changed|--all', () => {
  function packWithVerify(script) {
    const stacks = tmp('pack-stacks-');
    mirrorPack({
      packRoot: makePack({
        name: 'v', plugin: 'aoforge-stack-v',
        verify: { command: [process.execPath, '${PACK_ROOT}/bin/verify.cjs'], changed_flag: '--changed', all_flag: '--all' },
        install_hint: 'install v',
      }, { 'bin/verify.cjs': script }),
      stacksDir: stacks,
    });
    return stacks;
  }

  test('merges a pack result and writes the task record', () => {
    const stacks = packWithVerify(`process.stdout.write(JSON.stringify({ status: 'fail', scope: process.argv[2] === '--all' ? 'all' : 'changed', findings: [{ severity: 'error', message: 'bad' }] })); process.exit(1);`);
    const proj = makeProject({ config: { stacks: { enabled: ['v'] } } });
    const r = run(['stack', 'verify', '--all', '--task', '77-01-1'], { cwd: proj, stacksDir: stacks });
    assert.equal(r.status, 1);
    assert.equal(r.json.status, 'fail');
    assert.equal(r.json.packs[0].scope, 'all');
    assert.ok(fs.existsSync(path.join(proj, '.aoforge', 'verify', '77-01-1.json')));
  });

  test('unparseable output is error and a missing binary is missing: neither passes', () => {
    let stacks = packWithVerify(`process.stdout.write('not json');`);
    const proj = makeProject({ config: { stacks: { enabled: ['v'] } } });
    let r = run(['stack', 'verify', '--changed'], { cwd: proj, stacksDir: stacks });
    assert.equal(r.status, 2);
    assert.equal(r.json.status, 'error');

    stacks = tmp('pack-stacks-');
    mirrorPack({ packRoot: makePack({ name: 'v', plugin: 'aoforge-stack-v', verify: { command: ['definitely-not-a-binary-77'] }, install_hint: 'install v' }), stacksDir: stacks });
    r = run(['stack', 'verify', '--changed'], { cwd: proj, stacksDir: stacks });
    assert.equal(r.status, 2);
    assert.equal(r.json.packs[0].status, 'missing');
    assert.equal(r.json.packs[0].install_hint, 'install v');
  });

  test('no active pack with a verify command passes and runs nothing', () => {
    const r = run(['stack', 'verify', '--changed'], { cwd: makeProject({}), stacksDir: tmp('pack-stacks-') });
    assert.equal(r.status, 0);
    assert.deepEqual(r.json.packs, []);
  });

  // quick 35 (D4): a --task id names a file under <planning dir>/verify/, so it must not carry a path.
  const PASS = `process.stdout.write(JSON.stringify({ status: 'pass', scope: 'all', findings: [] }));`;
  function filesNamed(dir, name) {
    const hits = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
      if (e.name === name) hits.push(path.join(e.parentPath || e.path, e.name));
    }
    return hits;
  }

  test('--task ../../escaped exits 1, runs nothing and writes no file outside (or inside) the verify dir', () => {
    const stacks = packWithVerify(PASS);
    const base = tmp('pack-esc-');
    const proj = path.join(base, 'proj');
    fs.mkdirSync(path.join(proj, '.aoforge'), { recursive: true });
    writeJson(path.join(proj, '.aoforge', 'config.json'), { stacks: { enabled: ['v'] } });
    const r = run(['stack', 'verify', '--all', '--task', '../../escaped'], { cwd: proj, stacksDir: stacks });
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stderr, /--task needs a task id \(letters, digits, "\.", "_", "-"; no path separators or "\.\."\)/);
    assert.deepEqual(filesNamed(base, 'escaped.json'), []);
    assert.equal(fs.existsSync(path.join(proj, '.aoforge', 'verify')), false);
  });

  test('a path, "..", a dot file, a missing value or a flag as the --task value is a usage error', () => {
    const stacks = packWithVerify(PASS);
    const cases = [
      ['--all', '--task', 'a/b'],
      ['--all', '--task', '..'],
      ['--all', '--task', '.hidden'],
      ['--all', '--task'],
      ['--task', '--all'],
    ];
    for (const args of cases) {
      const proj = makeProject({ config: { stacks: { enabled: ['v'] } } });
      const r = run(['stack', 'verify', ...args], { cwd: proj, stacksDir: stacks });
      assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}`);
      assert.equal(fs.existsSync(path.join(proj, '.aoforge', 'verify')), false, `${args.join(' ')} wrote .aoforge/verify/`);
    }
  });

  test('a dotted task id still writes its record', () => {
    const stacks = packWithVerify(PASS);
    const proj = makeProject({ config: { stacks: { enabled: ['v'] } } });
    const r = run(['stack', 'verify', '--all', '--task', 'quick-35.1'], { cwd: proj, stacksDir: stacks });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(fs.existsSync(path.join(proj, '.aoforge', 'verify', 'quick-35.1.json')));
  });

  test('mergeStatus orders error > missing > fail > pass', () => {
    assert.equal(packCli.mergeStatus(['pass', 'fail']), 'fail');
    assert.equal(packCli.mergeStatus(['fail', 'missing']), 'missing');
    assert.equal(packCli.mergeStatus(['missing', 'error', 'pass']), 'error');
    assert.equal(packCli.mergeStatus([]), 'pass');
  });
});

// quick 35 (D5): a pack the project names in config stacks.enabled but that cannot run (not mirrored, broken manifest,
// plugin not enabled) used to vanish from activePacks, so `stack verify` printed `pass` and `stack doctor` printed
// `No active stack packs.`, both with exit 0. "A pack that is expected but cannot run blocks."
describe('selected packs that cannot run block stack verify and stack doctor (quick 35)', () => {
  function brokenStacks() {
    const stacks = tmp('pack-stacks-');
    mirrorPack({ packRoot: makePack({ name: 'demo', plugin: 'aoforge-stack-demo' }), stacksDir: stacks });
    fs.renameSync(path.join(stacks, 'demo'), path.join(stacks, 'other'));
    return stacks;
  }
  /** A HOME whose stacks dir mirrors `demo`, with a plugin registry that does not list its plugin. */
  function homeWithoutPlugin() {
    const home = tmp('pack-home-');
    mirrorPack({ packRoot: makePack({ name: 'demo', plugin: 'aoforge-stack-demo' }), stacksDir: path.join(home, '.claude', 'aoforge', 'stacks') });
    writeJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), { version: 2, plugins: { 'other@aocyber': [{ scope: 'user', version: '1' }] } });
    return home;
  }
  function withoutStacksEnv(fn) {
    const prev = process.env.AOFORGE_STACKS_DIR;
    delete process.env.AOFORGE_STACKS_DIR;
    try { return fn(); } finally {
      if (prev !== undefined) process.env.AOFORGE_STACKS_DIR = prev;
    }
  }

  test('4. a selected pack with no mirror: verify exits 2 (missing, hint names stacks.enabled); doctor exits 1', () => {
    const proj = makeProject({ config: { stacks: { enabled: ['ghost'] } } });
    const stacks = tmp('pack-stacks-');
    const r = run(['stack', 'verify', '--all'], { cwd: proj, stacksDir: stacks });
    assert.equal(r.status, 2, r.stdout);
    assert.equal(r.json.status, 'missing');
    assert.equal(r.json.packs[0].pack, 'ghost');
    assert.equal(r.json.packs[0].status, 'missing');
    assert.match(r.json.packs[0].install_hint, /stacks\.enabled/);
    const d = run(['stack', 'doctor', '--raw'], { cwd: proj, stacksDir: stacks });
    assert.equal(d.status, 1, d.stdout);
    assert.match(d.stdout, /ghost/);
    assert.doesNotMatch(d.stdout, /No active stack packs/);
  });

  test('5. a selected pack with a broken manifest: verify error, exit 2; doctor exits 1', () => {
    const stacks = brokenStacks();
    const proj = makeProject({ config: { stacks: { enabled: ['other'] } } });
    const r = run(['stack', 'verify', '--all'], { cwd: proj, stacksDir: stacks });
    assert.equal(r.status, 2, r.stdout);
    assert.deepEqual([r.json.packs[0].pack, r.json.packs[0].status], ['other', 'error']);
    const d = run(['stack', 'doctor'], { cwd: proj, stacksDir: stacks });
    assert.equal(d.status, 1, d.stdout);
    assert.equal(d.json.packs[0].reason, 'broken');
  });

  test('6. a selected pack whose plugin the registry does not list: verify missing, exit 2', () => {
    const home = homeWithoutPlugin();
    const proj = makeProject({ config: { stacks: { enabled: ['demo'] } } });
    const r = run(['stack', 'verify', '--all'], { cwd: proj, home });
    assert.equal(r.status, 2, r.stdout);
    assert.deepEqual([r.json.packs[0].pack, r.json.packs[0].status], ['demo', 'missing']);
    assert.match(r.json.packs[0].install_hint, /aoforge-stack-demo/);
  });

  test('7. the same name in stacks.enabled and stacks.disabled: nothing reported, exit 0 (disabled wins)', () => {
    const proj = makeProject({ config: { stacks: { enabled: ['ghost'], disabled: ['ghost'] } } });
    const stacks = tmp('pack-stacks-');
    const r = run(['stack', 'verify', '--all'], { cwd: proj, stacksDir: stacks });
    assert.equal(r.status, 0, r.stdout);
    assert.deepEqual(r.json.packs, []);
    assert.equal(run(['stack', 'doctor'], { cwd: proj, stacksDir: stacks }).status, 0);
  });

  test('8. unavailableSelectedPacks gives the reason for each case and [] when everything selected is active', () => {
    assert.equal(typeof packs.unavailableSelectedPacks, 'function');
    const ghost = makeProject({ config: { stacks: { enabled: ['ghost'] } } });
    const [g] = withStacksDir(tmp('pack-stacks-'), () => packs.unavailableSelectedPacks({ projectRoot: ghost }));
    assert.deepEqual([g.name, g.reason], ['ghost', 'not_installed']);

    const broken = makeProject({ config: { stacks: { enabled: ['other'] } } });
    const [b] = withStacksDir(brokenStacks(), () => packs.unavailableSelectedPacks({ projectRoot: broken }));
    assert.deepEqual([b.name, b.reason], ['other', 'broken']);
    assert.ok(b.issues.some((i) => /does not match/.test(i)));

    const off = makeProject({ config: { stacks: { enabled: ['demo'] } } });
    const [o] = withoutStacksEnv(() => packs.unavailableSelectedPacks({ projectRoot: off, userHome: homeWithoutPlugin() }));
    assert.deepEqual([o.name, o.reason, o.plugin], ['demo', 'plugin_not_enabled', 'aoforge-stack-demo']);

    const stacks = tmp('pack-stacks-');
    mirrorPack({ packRoot: makePack({ name: 'demo', plugin: 'aoforge-stack-demo' }), stacksDir: stacks });
    const fine = makeProject({ config: { stacks: { enabled: ['demo'] } } });
    assert.deepEqual(withStacksDir(stacks, () => packs.unavailableSelectedPacks({ projectRoot: fine })), []);
  });
});

// quick 38: a Flutter project (profile runtime mobile) never selected the web pack, so the Flutter verifier fragment's
// "web pack's Playwright check" never ran and Flutter web coverage fell silently to human verification. A pack now
// declares `soft_depends: [{ pack, platforms }]`; core reads that manifest data and names no pack.
describe('soft dependencies: Flutter web selects the web pack (quick 38)', () => {
  const FLUTTER = 'schema: 1\nextends: flutter';
  const WEB_TRD = 'objective: 01\ntrd: 01\ntype: ui\nstack: flutter\nplatform: [mobile, web]';
  const WEB_REASON = 'soft dependency of flutter for platform web';

  test('1. extends: flutter + a TRD with platform [mobile, web]: the verifier gets the web pack and web-ui-verifier', () => {
    const stacks = repoStacks('flutter', 'web');
    const proj = makeProject({ stack: FLUTTER });
    writeTrd(proj, '01-ui', '01-01', WEB_TRD);
    let r = run(['stack', 'context', 'verifier'], { cwd: proj, stacksDir: stacks });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.json.packs.active, ['flutter', 'web']);
    assert.ok(r.json.packs.subagents.some((s) => s.pack === 'web' && s.agent === 'aoforge-stack-web:web-ui-verifier'),
      JSON.stringify(r.json.packs.subagents));
    r = run(['stack', 'context', 'verifier', '--raw'], { cwd: proj, stacksDir: stacks });
    assert.match(r.stdout, /web-ui-verifier/);
    r = run(['stack', 'discover'], { cwd: proj, stacksDir: stacks });
    assert.equal(r.status, 0, r.stderr);
    const web = r.json.active.find((a) => a.name === 'web');
    assert.ok(web, JSON.stringify(r.json.active));
    assert.equal(web.reason, WEB_REASON);
    assert.equal(r.json.active.find((a) => a.name === 'flutter').reason, 'profile extends flutter');
  });

  test('2. a TRD whose only platform is must_haves.platform: web selects the web pack too', () => {
    const stacks = repoStacks('flutter', 'web');
    const proj = makeProject({ stack: FLUTTER });
    writeTrd(proj, '02-ui', '02-01', 'objective: 02\ntrd: 01\nmust_haves:\n  platform: web');
    const r = run(['stack', 'discover'], { cwd: proj, stacksDir: stacks });
    assert.deepEqual(r.json.active.map((a) => [a.name, a.reason]), [['flutter', 'profile extends flutter'], ['web', WEB_REASON]]);
  });

  test('3. extends: flutter with verification.runtime web and no TRDs: pass 1 selects web, reason unchanged', () => {
    const stacks = repoStacks('flutter', 'web');
    const proj = makeProject({ stack: `${FLUTTER}\nverification:\n  runtime: web` });
    const r = run(['stack', 'discover'], { cwd: proj, stacksDir: stacks });
    assert.deepEqual(r.json.active.map((a) => [a.name, a.reason]), [['flutter', 'profile extends flutter'], ['web', 'verification.runtime web']]);
  });

  test('4. mobile-only Flutter (platform [mobile], and a TRD with no platform): only flutter is active', () => {
    const stacks = repoStacks('flutter', 'web');
    const proj = makeProject({ stack: FLUTTER });
    writeTrd(proj, '01-ui', '01-01', 'objective: 01\ntrd: 01\ntype: ui\nstack: flutter\nplatform: [mobile]');
    writeTrd(proj, '01-ui', '01-02', 'objective: 01\ntrd: 02\ntype: ui\nstack: flutter');
    let r = run(['stack', 'context', 'verifier'], { cwd: proj, stacksDir: stacks });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.json.packs.active, ['flutter']);
    assert.deepEqual(r.json.packs.fragments.map((f) => f.pack), ['flutter']);
    assert.ok(!r.json.packs.subagents.some((s) => /web-ui-verifier/.test(s.agent)), JSON.stringify(r.json.packs.subagents));
    r = run(['stack', 'context', 'verifier', '--raw'], { cwd: proj, stacksDir: stacks });
    assert.doesNotMatch(r.stdout, /web-ui-verifier/);
  });

  test('5. stacks.disabled ["web"] keeps the web pack out, and doctor warns about nothing', () => {
    const stacks = repoStacks('flutter', 'web');
    const proj = makeProject({ stack: FLUTTER, config: { stacks: { disabled: ['web'] } } });
    writeTrd(proj, '01-ui', '01-01', WEB_TRD);
    const r = run(['stack', 'context', 'verifier'], { cwd: proj, stacksDir: stacks });
    assert.deepEqual(r.json.packs.active, ['flutter']);
    const d = run(['stack', 'doctor'], { cwd: proj, stacksDir: stacks });
    assert.ok(d.json, d.stdout + d.stderr);
    assert.deepEqual(d.json.warnings, []);
  });

  test('6. unchanged: extends go with a web TRD; runtime web with no extends; no STACK.md with a web TRD', () => {
    const stacks = repoStacks('flutter', 'web');
    // (a) a profile with no pack declaring soft_depends: the TRD platform selects nothing.
    const go = makeProject({ stack: 'schema: 1\nextends: go' });
    writeTrd(go, '01-ui', '01-01', WEB_TRD);
    let r = run(['stack', 'context', 'verifier'], { cwd: go, stacksDir: stacks });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.json.packs.active, []);
    r = run(['stack', 'context', 'verifier', '--raw'], { cwd: go, stacksDir: stacks });
    assert.doesNotMatch(r.stdout, /## Stack packs/);
    // (b) select.runtime, no extends.
    const node = makeProject({ stack: 'schema: 1\nverification:\n  runtime: web' });
    r = run(['stack', 'context', 'verifier'], { cwd: node, stacksDir: stacks });
    assert.deepEqual(r.json.packs.active, ['web']);
    r = run(['stack', 'discover'], { cwd: node, stacksDir: stacks });
    assert.deepEqual(r.json.active.map((a) => a.reason), ['verification.runtime web']);
    // (c) no STACK.md at all.
    const bare = makeProject({});
    writeTrd(bare, '01-ui', '01-01', WEB_TRD);
    r = run(['stack', 'context', 'verifier'], { cwd: bare, stacksDir: stacks });
    assert.deepEqual(r.json.packs.active, []);
    r = run(['stack', 'context', 'verifier', '--raw'], { cwd: bare, stacksDir: stacks });
    assert.doesNotMatch(r.stdout, /## Stack packs/);
  });

  test('7. web pack not installed: doctor carries one warning and a `warn:` line, and lists no web pack', () => {
    const stacks = repoStacks('flutter');
    const proj = makeProject({ stack: FLUTTER });
    writeTrd(proj, '01-ui', '01-01', WEB_TRD);
    // No exit-code assertion: the real flutter pack's requires_tool makes `ok` depend on flutter being on PATH.
    const d = run(['stack', 'doctor'], { cwd: proj, stacksDir: stacks });
    assert.ok(d.json, d.stdout + d.stderr);
    assert.equal((d.json.warnings || []).length, 1, JSON.stringify(d.json));
    const [w] = d.json.warnings;
    assert.deepEqual([w.pack, w.wants, w.platform, w.reason], ['flutter', 'web', 'web', 'not_installed']);
    assert.match(w.install_hint, /aoforge-stack-web@aocyber/);
    assert.ok(!d.json.packs.some((p) => p.pack === 'web'), JSON.stringify(d.json.packs));
    const raw = run(['stack', 'doctor', '--raw'], { cwd: proj, stacksDir: stacks });
    assert.match(raw.stdout, /^warn: flutter soft-depends on web for platform web/m);
  });

  test('8. a synthetic host: warnings never change ok or the exit code; selection is one level only', () => {
    function hostStacks(...extra) {
      const stacks = tmp('pack-stacks-');
      mirrorPack({
        packRoot: makePack(
          { name: 'h', plugin: 'aoforge-stack-h', profiles: ['profiles/h.md'], soft_depends: [{ pack: 'w', platforms: ['web'] }] },
          { 'profiles/h.md': '---\nschema: 1\nid: h\n---\n\n## Idioms\n\nH idiom.\n' }),
        stacksDir: stacks,
      });
      for (const m of extra) mirrorPack({ packRoot: makePack(m), stacksDir: stacks });
      return stacks;
    }
    function hostProject(platformLine) {
      const proj = makeProject({ stack: 'schema: 1\nextends: h' });
      writeTrd(proj, '01-x', '01-01', `objective: 01\ntrd: 01\n${platformLine}`);
      return proj;
    }

    // `w` not mirrored.
    let d = run(['stack', 'doctor'], { cwd: hostProject('platform: [mobile, web]'), stacksDir: hostStacks() });
    assert.equal(d.status, 0, d.stdout + d.stderr);
    assert.equal(d.json.ok, true);
    assert.deepEqual((d.json.warnings || []).map((w) => [w.pack, w.wants, w.platform, w.reason]), [['h', 'w', 'web', 'not_installed']]);

    // `w` mirrored with a contract core does not support: broken, still exit 0.
    d = run(['stack', 'doctor'], {
      cwd: hostProject('platform: [mobile, web]'),
      stacksDir: hostStacks({ name: 'w', plugin: 'aoforge-stack-w', contract: 2 }),
    });
    assert.equal(d.status, 0, d.stdout + d.stderr);
    assert.equal(d.json.ok, true);
    assert.deepEqual((d.json.warnings || []).map((w) => w.reason), ['broken']);

    // A TRD with platform [mobile] only: nothing wanted, nothing warned.
    d = run(['stack', 'doctor'], { cwd: hostProject('platform: [mobile]'), stacksDir: hostStacks() });
    assert.equal(d.status, 0, d.stdout + d.stderr);
    assert.deepEqual(d.json.warnings, []);

    // `w` mirrored and valid: selected through h; w's own soft dependency on `x` is not followed, and not warned.
    const chain = hostStacks(
      { name: 'w', plugin: 'aoforge-stack-w', soft_depends: [{ pack: 'x', platforms: ['web'] }] },
      { name: 'x', plugin: 'aoforge-stack-x' });
    const proj = hostProject('platform: [mobile, web]');
    const r = run(['stack', 'discover'], { cwd: proj, stacksDir: chain });
    assert.deepEqual(r.json.active.map((a) => [a.name, a.reason]), [['h', 'profile extends h'], ['w', 'soft dependency of h for platform web']]);
    d = run(['stack', 'doctor'], { cwd: proj, stacksDir: chain });
    assert.equal(d.status, 0, d.stdout + d.stderr);
    assert.deepEqual(d.json.warnings, []);
  });

  test('9. schema: soft_depends entries need pack and platforms and take no other key; the shipped data is in-repo', () => {
    const base = { schema: 1, name: 'x', plugin: 'p', contract: 1 };
    assert.deepEqual(packs.validateManifest({ ...base, soft_depends: [{ pack: 'web', platforms: ['web'] }] }), []);
    const missing = packs.validateManifest({ ...base, soft_depends: [{ pack: 'web' }] });
    assert.ok(missing.some((i) => /platforms/.test(i)), missing.join('\n'));
    assert.ok(packs.validateManifest({ ...base, soft_depends: [{ pack: 'web', platforms: ['web'], extra: 1 }] }).length > 0);

    const roots = packRoots();
    const inRepo = roots.map((r) => path.basename(r).replace(/^aoforge-stack-/, ''));
    const manifests = Object.fromEntries(roots.map((r) => [path.basename(r), JSON.parse(fs.readFileSync(path.join(r, 'aoforge-stack.json'), 'utf8'))]));
    assert.deepEqual(manifests['aoforge-stack-flutter'].soft_depends, [{ pack: 'web', platforms: ['web'] }]);
    for (const [name, m] of Object.entries(manifests)) {
      for (const dep of m.soft_depends || []) assert.ok(inRepo.includes(dep.pack), `${name} soft-depends on ${dep.pack}, which is not an in-repo pack`);
    }
  });

  test('10. projectPlatforms: the runtime plus every TRD platform and must_haves.platform, sorted and unique', () => {
    assert.equal(typeof packs.projectPlatforms, 'function');
    const proj = makeProject({});
    writeTrd(proj, '01-a', '01-01', 'platform: [mobile, web]');
    writeTrd(proj, '01-a', '01-02', 'platform: desktop');
    writeTrd(proj, '02-b', '02-01', 'must_haves:\n  platform: web');
    fs.writeFileSync(path.join(proj, '.aoforge', 'objectives', '01-a', 'notes.md'), '---\nplatform: tv\n---\n');
    fs.writeFileSync(path.join(proj, '.aoforge', 'objectives', '02-b', '02-02-TRD.md'), '# A TRD with no frontmatter\n');
    const resolved = { frontmatter: { verification: { runtime: 'mobile' } } };
    assert.deepEqual(packs.projectPlatforms({ projectRoot: proj, resolved }), ['desktop', 'mobile', 'web']);
    assert.deepEqual(packs.projectPlatforms({ projectRoot: makeProject({}), resolved: null }), []);
  });
});
