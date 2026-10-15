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

  test('mergeStatus orders error > missing > fail > pass', () => {
    assert.equal(packCli.mergeStatus(['pass', 'fail']), 'fail');
    assert.equal(packCli.mergeStatus(['fail', 'missing']), 'missing');
    assert.equal(packCli.mergeStatus(['missing', 'error', 'pass']), 'error');
    assert.equal(packCli.mergeStatus([]), 'pass');
  });
});
