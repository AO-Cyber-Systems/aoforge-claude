'use strict';

// stack-mcp.test.cjs (objective 42, TRD 09, SDR-05)
//
// `aof-tools stack mcp [--write]` — the deterministic generator for AOForge-managed `.mcp.json`
// entries. Every "binary" is a stub in a temp dir on a fake PATH (stack-verify-fixtures fakeBin),
// every home is a temp dir, and every `.mcp.json` lives in a temp project: nothing here reads the
// real `~/.claude/plugins` or writes a real `.mcp.json`.
//
// Test list (outermost first):
//
//  1. CLI `stack mcp --raw` on a repo extending bundled `go`, gopls on the fake PATH: JSON
//     `{ servers: { gopls }, skipped: [] }`, action `preview`, and no `.mcp.json` written.
//  2. CLI `stack mcp --write` with no `.mcp.json` creates one holding only the managed entries.
//  3. `--write` over a foreign `playwright` + a stale managed `oldtool`: playwright byte-identical,
//     oldtool removed, gopls added; key order stable; 2-space JSON + trailing newline.
//  4. `--write` on an unparseable `.mcp.json` exits 1 and leaves the file byte-identical.
//  5. Components: root `go` + component `app/` = flutter -> gopls and dart, deduped by name;
//     flutter's args win for `dart` (root `dart` + component flutter).
//  6. dart absent from the fake PATH -> skipped `{ name: 'dart', reason: 'binary_missing' }`.
//  7. A plugin under the fake home already declaring `dart mcp-server` -> dart skipped with
//     reason `declared_by_plugin`.
//  8. No generated entry carries any env key other than AOFORGE_MANAGED (locked Q5).
//  +  mergeMcpJson / foreign-name clash / idempotent re-write / `stack init --write` never
//     creates `.mcp.json` (locked Q4).

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const verifyFx = require('./__fixtures__/stack-verify-fixtures.cjs');
const profileFx = require('./__fixtures__/stack-profile-fixtures.cjs');
const { _resetCache } = require('./stack-profile.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const MANAGED_ENV = Object.freeze({ AOFORGE_MANAGED: 'stack' });

const dirs = [];
function track(dir) { dirs.push(dir); return dir; }
afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    fs.rmSync(d, { recursive: true, force: true });
  }
  _resetCache();
});

function mcp() { return require('./stack-mcp.cjs'); }

function project(yamlLines, files = {}) {
  return track(profileFx.makeProject({ stackMd: profileFx.profileMd({ yaml: yamlLines.join('\n') }), files }));
}

function emptyHome() { return track(verifyFx.fakeHome({})); }

/**
 * pluginHome(rel, pluginJson, extraFiles) -> a fake home with ONE hand-written plugin at
 * `~/.claude/plugins/<rel>/.claude-plugin/plugin.json`.
 */
function pluginHome(rel, pluginJson, extraFiles = {}) {
  const home = emptyHome();
  const root = path.join(home, '.claude', 'plugins', rel);
  fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-plugin', 'plugin.json'), JSON.stringify(pluginJson, null, 2), 'utf-8');
  for (const [name, text] of Object.entries(extraFiles)) {
    fs.writeFileSync(path.join(root, name), text, 'utf-8');
  }
  return home;
}

/** runMcp(repo, args, { bin, home }) — THIS checkout's aof-tools with PATH = the stub dir only. */
function runMcp(repo, args, { bin, home }) {
  const env = { PATH: bin, HOME: home };
  const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', repo, 'stack', 'mcp', ...args], { encoding: 'utf-8', env, timeout: 60000 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) { /* leave null; assertions fail loudly */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

const mcpPath = (repo) => path.join(repo, '.mcp.json');

// ─── CLI ──────────────────────────────────────────────────────────────────────

describe('stack mcp (CLI)', () => {
  test('1. preview on a go repo prints the gopls entry and writes nothing', () => {
    const repo = project(['schema: 1', 'extends: go']);
    const bin = track(verifyFx.fakeBin(['gopls']));
    const r = runMcp(repo, ['--raw'], { bin, home: emptyHome() });

    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.json, `stdout must be JSON: ${r.stdout}`);
    assert.deepEqual(r.json.servers, { gopls: { command: 'gopls', args: ['mcp'], env: { AOFORGE_MANAGED: 'stack' } } });
    assert.deepEqual(r.json.skipped, []);
    assert.equal(r.json.action, 'preview');
    assert.equal(path.basename(r.json.path), '.mcp.json');
    assert.equal(fs.realpathSync(path.dirname(r.json.path)), fs.realpathSync(repo));
    assert.equal(fs.existsSync(mcpPath(repo)), false, 'preview must never write .mcp.json');
  });

  test('2. --write with no .mcp.json creates one with only the managed entries', () => {
    const repo = project(['schema: 1', 'extends: go']);
    const bin = track(verifyFx.fakeBin(['gopls']));
    const r = runMcp(repo, ['--write'], { bin, home: emptyHome() });

    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.action, 'written');
    const text = fs.readFileSync(mcpPath(repo), 'utf-8');
    assert.deepEqual(JSON.parse(text), {
      mcpServers: { gopls: { command: 'gopls', args: ['mcp'], env: { AOFORGE_MANAGED: 'stack' } } },
    });
    assert.ok(text.endsWith('}\n'), 'trailing newline');
  });

  test('3. --write keeps a foreign entry byte-identical, drops a stale managed one, adds gopls', () => {
    const repo = project(['schema: 1', 'extends: go']);
    const bin = track(verifyFx.fakeBin(['gopls']));
    const existing = {
      mcpServers: {
        playwright: { command: 'npx', args: ['@playwright/mcp@latest'], env: { FOO: 'bar' } },
        oldtool: { command: 'oldtool', args: ['serve'], env: { AOFORGE_MANAGED: 'stack' } },
      },
      otherTopLevel: { keep: true },
    };
    fs.writeFileSync(mcpPath(repo), `${JSON.stringify(existing, null, 2)}\n`, 'utf-8');
    const playwrightText = JSON.stringify({ playwright: existing.mcpServers.playwright }, null, 2)
      .split('\n').slice(1, -1).map((l) => `  ${l}`).join('\n');

    const r = runMcp(repo, ['--write'], { bin, home: emptyHome() });

    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.action, 'written');
    const text = fs.readFileSync(mcpPath(repo), 'utf-8');
    const obj = JSON.parse(text);
    assert.deepEqual(Object.keys(obj), ['mcpServers', 'otherTopLevel'], 'top-level key order stable');
    assert.deepEqual(Object.keys(obj.mcpServers), ['playwright', 'gopls'], 'foreign first, managed appended, stale gone');
    assert.deepEqual(obj.mcpServers.playwright, existing.mcpServers.playwright);
    assert.ok(text.includes(playwrightText), `playwright entry must be byte-identical:\n${text}`);
    assert.deepEqual(obj.otherTopLevel, { keep: true });
    assert.equal(text, `${JSON.stringify(obj, null, 2)}\n`, '2-space indent + trailing newline');
  });

  test('3b. a second --write with nothing changed reports unchanged and does not rewrite the file', () => {
    const repo = project(['schema: 1', 'extends: go']);
    const bin = track(verifyFx.fakeBin(['gopls']));
    const home = emptyHome();
    assert.equal(runMcp(repo, ['--write'], { bin, home }).json.action, 'written');
    const before = fs.statSync(mcpPath(repo)).mtimeMs;
    const r = runMcp(repo, ['--write'], { bin, home });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.action, 'unchanged');
    assert.equal(fs.statSync(mcpPath(repo)).mtimeMs, before);
  });

  test('3c. --write with no managed servers and no .mcp.json creates nothing', () => {
    const repo = project(['schema: 1']);
    const bin = track(verifyFx.fakeBin([]));
    const r = runMcp(repo, ['--write'], { bin, home: emptyHome() });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.json.servers, {});
    assert.equal(r.json.action, 'unchanged');
    assert.equal(fs.existsSync(mcpPath(repo)), false);
  });

  test('4. --write on an unparseable .mcp.json exits 1 and leaves the file untouched', () => {
    const repo = project(['schema: 1', 'extends: go']);
    const bin = track(verifyFx.fakeBin(['gopls']));
    const broken = '{ "mcpServers": { "x": ';
    fs.writeFileSync(mcpPath(repo), broken, 'utf-8');

    const r = runMcp(repo, ['--write'], { bin, home: emptyHome() });

    assert.equal(r.status, 1);
    assert.match(r.stderr, /\.mcp\.json/);
    assert.match(r.stderr, /not valid JSON/);
    assert.equal(fs.readFileSync(mcpPath(repo), 'utf-8'), broken);
  });

  test('4b. an unknown flag is a usage error', () => {
    const repo = project(['schema: 1', 'extends: go']);
    const bin = track(verifyFx.fakeBin(['gopls']));
    const r = runMcp(repo, ['--bogus'], { bin, home: emptyHome() });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /stack mcp/);
  });

  test('5. components: root go + app/ flutter -> gopls and dart; flutter args', () => {
    const repo = project(['schema: 1', 'extends: go', 'components:', '  - { path: "app/", profile: flutter }']);
    const bin = track(verifyFx.fakeBin(['gopls', 'dart']));
    const r = runMcp(repo, [], { bin, home: emptyHome() });

    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(Object.keys(r.json.servers), ['gopls', 'dart']);
    assert.deepEqual(r.json.servers.dart.args, ['mcp-server', '--enable', 'cli', '--disable', 'pub_dev_search']);
    assert.deepEqual(r.json.skipped, []);
  });

  test('5b. root dart + component flutter -> one dart entry, the component (flutter) args win', () => {
    const repo = project(['schema: 1', 'extends: dart', 'components:', '  - { path: "app/", profile: flutter }']);
    const bin = track(verifyFx.fakeBin(['dart']));
    const r = runMcp(repo, [], { bin, home: emptyHome() });

    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(Object.keys(r.json.servers), ['dart']);
    assert.deepEqual(r.json.servers.dart.args, ['mcp-server', '--enable', 'cli', '--disable', 'pub_dev_search']);
  });

  test('6. a missing binary is skipped with reason binary_missing', () => {
    const repo = project(['schema: 1', 'extends: go', 'components:', '  - { path: "app/", profile: flutter }']);
    const bin = track(verifyFx.fakeBin(['gopls']));
    const r = runMcp(repo, [], { bin, home: emptyHome() });

    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(Object.keys(r.json.servers), ['gopls']);
    assert.equal(r.json.skipped.length, 1);
    assert.equal(r.json.skipped[0].name, 'dart');
    assert.equal(r.json.skipped[0].reason, 'binary_missing');
    assert.match(r.json.skipped[0].note, /dart/);
  });

  test('7. a plugin already declaring `dart mcp-server` -> dart skipped as declared_by_plugin', () => {
    const repo = project(['schema: 1', 'extends: flutter']);
    const bin = track(verifyFx.fakeBin(['dart']));
    const home = pluginHome(path.join('cache', 'x', 'dart-flutter'), {
      name: 'dart-flutter',
      mcpServers: { 'dart-mcp-server': { command: 'dart', args: ['mcp-server'] } },
    });
    const r = runMcp(repo, ['--write'], { bin, home });

    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.json.servers, {});
    assert.equal(r.json.skipped.length, 1);
    assert.equal(r.json.skipped[0].name, 'dart');
    assert.equal(r.json.skipped[0].reason, 'declared_by_plugin');
    assert.match(r.json.skipped[0].note, /dart-flutter/);
    assert.equal(fs.existsSync(mcpPath(repo)), false, 'nothing to write -> no file');
  });

  test('stack init --write never creates .mcp.json (locked Q4: opt-in per repo)', () => {
    const repo = track(profileFx.makeProject({ files: profileFx.goShapedRepo() }));
    const env = { PATH: track(verifyFx.fakeBin(['gopls'])), HOME: emptyHome() };
    const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', repo, 'stack', 'init', '--write'], { encoding: 'utf-8', env, timeout: 60000 });
    assert.ok(fs.existsSync(path.join(repo, '.aoforge', 'STACK.md')), `stack init --write must write STACK.md: ${r.stderr}`);
    assert.equal(fs.existsSync(mcpPath(repo)), false);
  });
});

// ─── buildServers / mergeMcpJson / findPluginServers ─────────────────────────

const view = (mcpList) => ({ frontmatter: { agent_tooling: { mcp: mcpList } } });
const whichOf = (...present) => (name) => (present.includes(name) ? `/fake/bin/${name}` : null);

// ─── 5c: a name conflict keeps the server that enables more (TRD 43-03, D9) ───
//
// The flutter and dart profiles both declare the server `dart`, with different args:
//   flutter  mcp-server --enable cli --disable pub_dev_search                 (hot_reload etc. ON)
//   dart     mcp-server --disable flutter --enable cli --disable pub_dev_search (Flutter tools OFF)
// "Later view wins" let a pure-Dart package listed after a Flutter app switch the Flutter
// tools off for the whole repo.

describe('5c mixed flutter + pure-dart components', () => {
  const FLUTTER_ARGS = ['mcp-server', '--enable', 'cli', '--disable', 'pub_dev_search'];
  const COMPONENTS = {
    app: '  - { path: "app/", profile: flutter }',
    svc: '  - { path: "svc/", profile: go }',
    core: '  - { path: "packages/core/", profile: dart }',
  };
  const disablesFlutter = (args) => args.some((a, i) => (a === '--disable' && args[i + 1] === 'flutter') || a === '--disable=flutter');

  function dartArgsFor(order) {
    const repo = project(['schema: 1', 'extends: general', 'components:', ...order.map((k) => COMPONENTS[k])]);
    const bin = track(verifyFx.fakeBin(['gopls', 'dart']));
    const r = runMcp(repo, [], { bin, home: emptyHome() });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.json.servers.dart, `dart server present for order ${order.join(',')}: ${r.stdout}`);
    return r.json.servers.dart.args;
  }

  test('8. root general + app/ flutter + svc/ go + packages/core/ dart: flutter tools stay enabled', () => {
    const args = dartArgsFor(['app', 'svc', 'core']);
    assert.equal(disablesFlutter(args), false, `args were ${JSON.stringify(args)}`);
    assert.deepEqual(args, FLUTTER_ARGS);
  });

  test('9. the same holds in every component order (dart before and after flutter)', () => {
    const orders = [['app', 'svc', 'core'], ['app', 'core', 'svc'], ['core', 'app', 'svc'],
      ['core', 'svc', 'app'], ['svc', 'core', 'app'], ['svc', 'app', 'core']];
    for (const order of orders) {
      const args = dartArgsFor(order);
      assert.equal(disablesFlutter(args), false, `order ${order.join(',')}: args were ${JSON.stringify(args)}`);
      assert.deepEqual(args, FLUTTER_ARGS, `order ${order.join(',')}`);
    }
  });

  test('a repo with only a pure-dart component still disables the Flutter tools', () => {
    const args = dartArgsFor(['svc', 'core']);
    assert.equal(disablesFlutter(args), true, `args were ${JSON.stringify(args)}`);
  });

  test('11. incomparable disabled sets: the last one still wins', () => {
    const { servers } = mcp().buildServers([
      view([{ name: 'dart', command: 'dart', args: ['mcp-server', '--disable', 'x'] }]),
      view([{ name: 'dart', command: 'dart', args: ['mcp-server', '--disable', 'y'] }]),
    ], { which: whichOf('dart'), userHome: emptyHome() });
    assert.deepEqual(servers.dart.args, ['mcp-server', '--disable', 'y']);
  });

  test('a strict subset of the later entry keeps the earlier one, whatever the stack is called', () => {
    const wide = { name: 'srv', command: 'srv', args: ['--enable', 'cli', '--disable', 'b'] };
    const narrow = { name: 'srv', command: 'srv', args: ['--disable', 'a', '--disable', 'b'] };
    const opts = { which: whichOf('srv'), userHome: emptyHome() };
    assert.deepEqual(mcp().buildServers([view([wide]), view([narrow])], opts).servers.srv.args, wide.args);
    // The reverse order: the earlier entry disables MORE, so it is not a subset; later wins.
    assert.deepEqual(mcp().buildServers([view([narrow]), view([wide])], opts).servers.srv.args, wide.args);
  });

  test('--disable=value is read like --disable value', () => {
    const wide = { name: 'srv', command: 'srv', args: ['--disable=b'] };
    const narrow = { name: 'srv', command: 'srv', args: ['--disable', 'a', '--disable=b'] };
    const { servers } = mcp().buildServers([view([wide]), view([narrow])], { which: whichOf('srv'), userHome: emptyHome() });
    assert.deepEqual(servers.srv.args, wide.args);
  });

  test('10. equal disabled sets: the later view still wins', () => {
    const { servers } = mcp().buildServers([
      view([{ name: 'dart', command: 'dart', args: ['a', '--disable', 'x'] }]),
      view([{ name: 'dart', command: 'dart', args: ['b', '--disable', 'x'] }]),
    ], { which: whichOf('dart'), userHome: emptyHome() });
    assert.deepEqual(servers.dart.args, ['b', '--disable', 'x']);
  });
});

describe('buildServers', () => {
  test('8. env is exactly { AOFORGE_MANAGED: "stack" } even when the profile entry carries env', () => {
    const { servers } = mcp().buildServers([
      view([{ name: 'dart', command: 'dart', args: ['mcp-server'], env: { DART_SUPPRESS_ANALYTICS: 'true' }, required: false }]),
      view([{ name: 'gopls', command: 'gopls', args: ['mcp'], env: { GOTELEMETRY: 'off' } }]),
    ], { which: whichOf('dart', 'gopls'), userHome: emptyHome() });

    for (const [name, entry] of Object.entries(servers)) {
      assert.deepEqual(entry.env, MANAGED_ENV, `${name} env`);
      assert.deepEqual(Object.keys(entry).sort(), ['args', 'command', 'env'], `${name} keys`);
    }
  });

  test('args come verbatim from the profile and are copied, not shared', () => {
    const args = ['mcp-server', '--enable', 'cli'];
    const { servers } = mcp().buildServers([view([{ name: 'dart', command: 'dart', args }])], { which: whichOf('dart'), userHome: emptyHome() });
    assert.deepEqual(servers.dart.args, args);
    assert.notEqual(servers.dart.args, args);
  });

  test('a view with no agent_tooling contributes nothing; an entry without name/command is skipped as invalid', () => {
    const { servers, skipped } = mcp().buildServers([
      { frontmatter: {} },
      view([{ command: 'x' }]),
    ], { which: whichOf('x'), userHome: emptyHome() });
    assert.deepEqual(servers, {});
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0].reason, 'invalid_entry');
  });

  test('a later view overrides an earlier one by name (component beats root)', () => {
    const { servers } = mcp().buildServers([
      view([{ name: 'dart', command: 'dart', args: ['a'] }]),
      view([{ name: 'dart', command: 'dart', args: ['b'] }]),
    ], { which: whichOf('dart'), userHome: emptyHome() });
    assert.deepEqual(servers.dart.args, ['b']);
  });

  test('the plugin scan honours a plugin-root .mcp.json and a string mcpServers path', () => {
    const home = pluginHome(path.join('marketplaces', 'm', 'plugins', 'golang'), { name: 'golang', mcpServers: './servers.json' }, {
      'servers.json': JSON.stringify({ mcpServers: { go: { command: '/usr/local/bin/gopls', args: ['mcp', '-v'] } } }),
      '.mcp.json': JSON.stringify({ mcpServers: { dartish: { command: 'dart', args: ['mcp-server'] } } }),
    });
    const found = mcp().findPluginServers(home);
    const names = found.map((f) => f.name).sort();
    assert.deepEqual(names, ['dartish', 'go']);

    const { servers, skipped } = mcp().buildServers([
      view([{ name: 'gopls', command: 'gopls', args: ['mcp'] }, { name: 'dart', command: 'dart', args: ['mcp-server', '--enable', 'cli'] }]),
    ], { which: whichOf('gopls', 'dart'), userHome: home });
    assert.deepEqual(servers, {});
    assert.deepEqual(skipped.map((s) => [s.name, s.reason]), [['gopls', 'declared_by_plugin'], ['dart', 'declared_by_plugin']]);
  });

  test('the plugin scan stops at depth 5 and tolerates a malformed plugin.json', () => {
    const deep = pluginHome(path.join('a', 'b', 'c', 'd', 'e', 'f'), { mcpServers: { d: { command: 'dart', args: ['mcp-server'] } } });
    assert.deepEqual(mcp().findPluginServers(deep), []);
    const bad = emptyHome();
    const dir = path.join(bad, '.claude', 'plugins', 'cache', 'p', '.claude-plugin');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'plugin.json'), '{nope', 'utf-8');
    assert.deepEqual(mcp().findPluginServers(bad), []);
    assert.deepEqual(mcp().findPluginServers(null), []);
  });
});

describe('mergeMcpJson', () => {
  const gopls = { command: 'gopls', args: ['mcp'], env: { ...MANAGED_ENV } };

  test('null existing -> { mcpServers: servers }', () => {
    assert.deepEqual(mcp().mergeMcpJson(null, { gopls }), { mcpServers: { gopls } });
  });

  test('a managed entry is replaced in place; a foreign entry of the same name is never touched', () => {
    const existing = {
      mcpServers: {
        gopls: { command: 'gopls', args: ['old'], env: { AOFORGE_MANAGED: 'stack' } },
        dart: { command: 'dart', args: ['mine'] },
        z: { command: 'z' },
      },
    };
    const snapshot = JSON.parse(JSON.stringify(existing));
    const out = mcp().mergeMcpJson(existing, { gopls, dart: { command: 'dart', args: ['mcp-server'], env: { ...MANAGED_ENV } } });
    assert.deepEqual(Object.keys(out.mcpServers), ['gopls', 'dart', 'z']);
    assert.deepEqual(out.mcpServers.gopls, gopls);
    assert.deepEqual(out.mcpServers.dart, { command: 'dart', args: ['mine'] }, 'foreign same-name entry kept');
    assert.deepEqual(existing, snapshot, 'input not mutated');
  });

  test('an entry whose env.AOFORGE_MANAGED is anything but "stack" is foreign', () => {
    const existing = { mcpServers: { a: { command: 'a', env: { AOFORGE_MANAGED: 'other' } } } };
    assert.deepEqual(mcp().mergeMcpJson(existing, {}), existing);
  });

  test('foreignClashes names servers that a foreign entry already holds', () => {
    const existing = { mcpServers: { dart: { command: 'dart' }, gopls: { command: 'gopls', env: { AOFORGE_MANAGED: 'stack' } } } };
    assert.deepEqual(mcp().foreignClashes(existing, { dart: {}, gopls: {} }), ['dart']);
    assert.deepEqual(mcp().foreignClashes(null, { dart: {} }), []);
  });
});
