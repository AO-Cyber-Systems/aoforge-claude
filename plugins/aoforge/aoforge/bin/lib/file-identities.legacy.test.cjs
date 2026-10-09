'use strict';

// file-identities.legacy.test.cjs — legacy identities that live in users' files (objective 72, TRD 72-12, INST-03).
//
// After 72-04 the code looks only for the AOForge names, so each of these would silently stop being recognised.
// For one release (SHIM_REMOVAL) both forms are read and only the new one is written. Fixtures come from
// __fixtures__/legacy-identity-fixtures.cjs; every home and repo is a temp dir, never the real ~/.claude,
// ~/.aoforge or ~/.devflow (the last also holds the devflowops product's files).
//
// Test list (written before the implementation; one at a time):
//
//  1. `.mcp.json` with a server whose env has the legacy ownership key = 'stack': `stackMcp({ write: true })`
//     rewrites it as an AOForge-owned entry (AOForge key, legacy key dropped), drops a stale legacy-owned entry,
//     and leaves a foreign entry byte-identical.
//  2. A server with neither key is untouched (also when it holds a name the profile wants, and when the legacy
//     key has another value); a server with the AOForge key is handled as today.
//  3. A transcript with a TaskCreate whose metadata carries the legacy todo key: todo-session extracts the todo
//     with its stem, the same as for the AOForge key; the AOForge key wins when both are set; the Stop hook
//     archives a todo identified by the legacy key alone.
//  4. config-ensure-section with only ~/.devflow/defaults.json -> its defaults apply; with both -> ~/.aoforge/ wins.
//  5. Brave key: only the legacy file -> found; `init new-project` reports it present.
//  6. Watch allowlist and pid: legacy-only files are read; a write goes to ~/.aoforge/.
//  7. Nothing under the legacy dot dir is moved, renamed or deleted by any of the above (listing before/after).
//  8. `adopt preflight` on a repo with the legacy adopt branch and its in-progress marker -> route `resume`,
//     branch = the legacy one; on a fresh repo -> aoforge/adopt; with both branches -> refuse naming both.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { NAMES, LEGACY } = require('./legacy-names.cjs');
const fx = require('./__fixtures__/legacy-identity-fixtures.cjs');
const profileFx = require('./__fixtures__/stack-profile-fixtures.cjs');
const verifyFx = require('./__fixtures__/stack-verify-fixtures.cjs');
const todoArchiveFx = require('./__fixtures__/todo-archive-fixtures.cjs');
const { _resetCache } = require('./stack-profile.cjs');

const NEW_OWNER_KEY = `${NAMES.envPrefix}MANAGED`;
const OLD_OWNER_KEY = `${LEGACY.envPrefix}MANAGED`;
const NEW_TODO_KEY = `${NAMES.slug}_todo`;
const OLD_TODO_KEY = `${LEGACY.slug}_todo`;

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const TODO_HOOK = path.join(PLUGIN_ROOT, 'hooks', 'todo-sync.js');

const cleanups = [];
function track(dir) {
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function later(fn) {
  cleanups.push(fn);
}
afterEach(() => {
  while (cleanups.length) {
    try { cleanups.pop()(); } catch { /* best effort */ }
  }
  _resetCache();
});

function scratch(prefix) {
  return track(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix))));
}

// ─── 1-2: .mcp.json ownership ─────────────────────────────────────────────────

const mcp = () => require('./stack-mcp.cjs');
const whichOf = (...present) => (name) => (present.includes(name) ? `/fake/bin/${name}` : null);

/** A go project (gopls is its one MCP server) whose `.mcp.json` is `doc`. */
function goProjectWith(doc) {
  const root = track(profileFx.makeProject({ stackMd: profileFx.profileMd({ yaml: 'schema: 1\nextends: go' }) }));
  const file = path.join(root, '.mcp.json');
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf-8');
  return { root, file };
}

function writeMcp(root) {
  return mcp().stackMcp({ projectRoot: root, userHome: track(verifyFx.fakeHome({})), write: true, which: whichOf('gopls') });
}

const GOPLS = { command: 'gopls', args: ['mcp'] };
const PLAYWRIGHT = { command: 'npx', args: ['@playwright/mcp@latest'], env: { FOO: 'bar' } };

describe('72-12 .mcp.json ownership under the legacy key', () => {
  test('1. a legacy-owned entry is rewritten with the AOForge key, a stale one dropped, a foreign one kept', () => {
    const legacyDoc = fx.legacyMcpJson({
      owned: { gopls: GOPLS, oldtool: { command: 'oldtool', args: ['serve'] } },
      foreign: { playwright: PLAYWRIGHT },
    });
    assert.equal(legacyDoc.mcpServers.gopls.env[OLD_OWNER_KEY], 'stack', 'fixture carries the legacy key');
    const { root, file } = goProjectWith(legacyDoc);

    const r = writeMcp(root);

    assert.equal(r.action, 'written');
    assert.deepEqual(r.skipped, [], 'a legacy-owned gopls is ours, never a foreign clash');
    const text = fs.readFileSync(file, 'utf-8');
    const expected = fx.legacyMcpJson({ owned: { gopls: GOPLS }, foreign: { playwright: PLAYWRIGHT }, ownerKey: NEW_OWNER_KEY });
    assert.equal(text, `${JSON.stringify(expected, null, 2)}\n`, 'same file with the key swapped and the stale entry gone');
    assert.equal(text.includes(OLD_OWNER_KEY), false, 'the legacy key is never written');
  });

  test('1b. isManaged recognises either key at the value stack, and nothing else', () => {
    const { isManaged } = mcp();
    assert.equal(isManaged({ command: 'x', env: { [OLD_OWNER_KEY]: 'stack' } }), true);
    assert.equal(isManaged({ command: 'x', env: { [NEW_OWNER_KEY]: 'stack' } }), true);
    assert.equal(isManaged({ command: 'x', env: { [OLD_OWNER_KEY]: 'manual' } }), false);
    assert.equal(isManaged({ command: 'x', env: { OTHER_MANAGED: 'stack' } }), false);
    assert.equal(isManaged({ command: 'x' }), false);
  });

  test('2. an entry with neither key is untouched, even under a name the profile wants', () => {
    const doc = {
      mcpServers: {
        gopls: { command: '/opt/custom/gopls', args: ['mcp', '-rpc.trace'], env: { OTHER_MANAGED: 'stack' } },
        handmade: { command: 'srv', args: [], env: { [OLD_OWNER_KEY]: 'manual' } },
      },
    };
    const { root, file } = goProjectWith(doc);
    const before = fs.readFileSync(file, 'utf-8');

    const r = writeMcp(root);

    assert.equal(r.action, 'unchanged');
    assert.deepEqual(r.skipped.map((s) => [s.name, s.reason]), [['gopls', 'foreign_entry']]);
    assert.equal(fs.readFileSync(file, 'utf-8'), before, 'byte-identical');
  });

  test('2b. an AOForge-owned entry is handled as today: replaced in place, a stale one removed', () => {
    const doc = fx.legacyMcpJson({
      owned: { gopls: { command: 'gopls', args: ['old-args'] }, oldtool: { command: 'oldtool', args: [] } },
      foreign: { playwright: PLAYWRIGHT },
      ownerKey: NEW_OWNER_KEY,
    });
    const { root, file } = goProjectWith(doc);

    const r = writeMcp(root);

    assert.equal(r.action, 'written');
    const expected = fx.legacyMcpJson({ owned: { gopls: GOPLS }, foreign: { playwright: PLAYWRIGHT }, ownerKey: NEW_OWNER_KEY });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf-8')), expected);
  });
});

// ─── 3: todo metadata ─────────────────────────────────────────────────────────

const STEM = '2026-10-05-carried-from-the-old-session';
const TITLE = 'Carry the old todo';

describe('72-12 session todos under the legacy metadata key', () => {
  const { replayTranscript } = require('./todo-session.cjs');

  test('3. a TaskCreate carrying the legacy key yields the todo with its stem, as the AOForge key does', () => {
    const legacy = replayTranscript(fx.legacyTodoTranscript({ stem: STEM, title: TITLE }));
    const current = replayTranscript(fx.legacyTodoTranscript({ stem: STEM, title: TITLE, metadataKey: NEW_TODO_KEY }));

    assert.equal(legacy.items.length, 1, JSON.stringify(legacy));
    assert.equal(legacy.items[0].stem, STEM);
    assert.equal(legacy.items[0].stem_source, 'metadata');
    assert.equal(legacy.items[0].title, TITLE);
    assert.deepEqual(legacy.items, current.items, 'identical to the AOForge-key replay');
  });

  test('3b. the legacy key alone identifies a todo whose subject lacks the Todo: prefix', () => {
    const r = replayTranscript(fx.legacyTodoTranscript({ stem: STEM, subject: 'Plain subject' }));
    assert.equal(r.items.length, 1, JSON.stringify(r));
    assert.equal(r.items[0].stem, STEM);
    assert.equal(r.items[0].title, 'Plain subject');
  });

  test('3c. the AOForge key wins when a TaskCreate carries both', () => {
    const text = fx.legacyTodoTranscript({ stem: STEM, title: TITLE })
      .replace(`"${OLD_TODO_KEY}":"${STEM}"`, `"${OLD_TODO_KEY}":"${STEM}","${NEW_TODO_KEY}":"2026-10-07-the-new-key-wins"`);
    assert.ok(text.includes(NEW_TODO_KEY), 'the transcript carries both keys');
    const r = replayTranscript(text);
    assert.equal(r.items[0].stem, '2026-10-07-the-new-key-wins');
  });

  test('3d. the Stop hook archives a todo identified by the legacy key alone', () => {
    const proj = todoArchiveFx.makeTodoProject({ git: true });
    later(proj.cleanup);
    const transcript = todoArchiveFx.writeTranscript(scratch('legacy-todo-transcript-'), 'sess-legacy.jsonl',
      fx.legacyTodoTranscript({ stem: STEM, subject: 'Plain subject' }));
    const payload = { session_id: 'sess-legacy', transcript_path: transcript, cwd: proj.root, hook_event_name: 'Stop', stop_hook_active: false };

    const r = spawnSync(process.execPath, [TODO_HOOK], {
      cwd: proj.root,
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: scratch('legacy-todo-home-'), CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
      timeout: 60000,
    });

    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /archived 1 todo\(s\)/, `stdout: ${r.stdout}`);
    assert.ok(fs.existsSync(path.join(proj.root, NAMES.planningDir, 'todos', 'pending', `${STEM}.md`)), 'archived under its stem');
  });
});

// ─── 4-7: user files under the legacy dot directory ───────────────────────────

const AOF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');

const NEW_PID = `${NAMES.watch}.pid`;
const OLD_PID = `${LEGACY.watch}.pid`;
const NEW_ALLOW = `${NAMES.watch}-allow.json`;
const OLD_ALLOW = `${LEGACY.watch}-allow.json`;

const LEGACY_DEFAULTS = `${JSON.stringify({ model_profile: 'quality', workflow: { research: false } }, null, 2)}\n`;
const NEW_DEFAULTS = `${JSON.stringify({ model_profile: 'budget' }, null, 2)}\n`;
const LEGACY_ALLOW = `${JSON.stringify({ commands: [{ label: 'legacy-extra', pattern: '^legacy-cmd\\b' }] }, null, 2)}\n`;
const NEW_ALLOW_TEXT = `${JSON.stringify({ commands: [{ label: 'new-extra', pattern: '^new-cmd\\b' }] }, null, 2)}\n`;
// A pid file left by the legacy daemon, which is still running (this test process stands in for it).
const LEGACY_PID_TEXT = `${JSON.stringify({
  pid: process.pid, version: '2.15.0', shell: null, watching: ['/tmp/legacy-watched-project'], started_at: '2026-10-06T12:00:00.000Z',
}, null, 2)}\n`;

function dotHome(opts) {
  const h = fx.legacyDotHome(opts);
  later(h.cleanup);
  return h;
}

/** `aof-tools --cwd <cwd> ...args` with a hermetic env: the fake HOME, no Brave key, no overrides. */
function tools(cwd, home, args) {
  const r = spawnSync(process.execPath, [AOF_TOOLS, '--cwd', cwd, ...args], {
    encoding: 'utf-8',
    env: { PATH: process.env.PATH, HOME: home, GIT_CONFIG_NOSYSTEM: '1' },
    timeout: 60000,
  });
  return { ...r, out: `${r.stdout || ''}${r.stderr || ''}` };
}

/** config-ensure-section in a fresh directory -> the config.json it wrote. */
function ensureConfig(home) {
  const dir = scratch('legacy-dot-project-');
  const r = tools(dir, home, ['config-ensure-section', '--raw']);
  assert.equal(r.status, 0, r.out);
  return JSON.parse(fs.readFileSync(path.join(dir, NAMES.planningDir, 'config.json'), 'utf-8'));
}

/** Run `fn` with HOME = `home` and the path overrides unset, restoring all of them after. */
function withHome(home, fn) {
  const keys = ['HOME', `${NAMES.envPrefix}HANDOFF_PID_FILE`, `${NAMES.envPrefix}WATCH_ALLOW_FILE`];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.HOME = home;
  for (const k of keys.slice(1)) delete process.env[k];
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe('72-12 user files under the legacy dot directory', () => {
  test('4. config-ensure-section applies a legacy-only defaults.json; the new one wins when both exist', () => {
    const legacyOnly = dotHome({ files: { 'defaults.json': LEGACY_DEFAULTS } });
    const cfg = ensureConfig(legacyOnly.home);
    assert.equal(cfg.model_profile, 'quality', 'the legacy defaults apply');
    assert.equal(cfg.workflow.research, false);

    const both = dotHome({ files: { 'defaults.json': LEGACY_DEFAULTS }, newFiles: { 'defaults.json': NEW_DEFAULTS } });
    const cfg2 = ensureConfig(both.home);
    assert.equal(cfg2.model_profile, 'budget', 'the new defaults win');
    assert.equal(cfg2.workflow.research, true, 'nothing is merged in from the legacy file');
  });

  test('5. a legacy-only Brave key file is found by config-ensure-section and init new-project', () => {
    const none = dotHome({});
    assert.equal(ensureConfig(none.home).brave_search, false, 'control: no key anywhere');

    const h = dotHome({ files: { brave_api_key: 'BSA-fixture-key\n' } });
    assert.equal(ensureConfig(h.home).brave_search, true);

    const dir = scratch('legacy-dot-init-');
    const r = tools(dir, h.home, ['init', 'new-project', '--raw']);
    assert.equal(r.status, 0, r.out);
    assert.equal(JSON.parse(r.stdout).brave_search_available, true);
  });

  test('6. the watch allowlist is read from the legacy file when the new one is missing; the new one wins', () => {
    const allow = () => require('./watcher-allowlist.cjs').loadAllowlist();

    const legacyOnly = dotHome({ files: { [OLD_ALLOW]: LEGACY_ALLOW } });
    const r1 = withHome(legacyOnly.home, allow);
    assert.equal(r1.userPatterns, 1);
    assert.ok(r1.allowlist.some((p) => p.label === 'legacy-extra'), 'the legacy pattern is loaded');

    const both = dotHome({ files: { [OLD_ALLOW]: LEGACY_ALLOW }, newFiles: { [NEW_ALLOW]: NEW_ALLOW_TEXT } });
    const r2 = withHome(both.home, allow);
    assert.equal(r2.userPatterns, 1);
    assert.deepEqual(r2.allowlist.filter((p) => /-extra$/.test(p.label)).map((p) => p.label), ['new-extra']);
  });

  test('6b. the daemon pid is read from the legacy file; writes and removals touch ~/.aoforge/ only', () => {
    const state = require('./watcher-state.cjs');
    const h = dotHome({ files: { [OLD_PID]: LEGACY_PID_TEXT } });
    const newPid = path.join(h.newDir, NEW_PID);
    const oldPid = path.join(h.legacyDir, OLD_PID);

    withHome(h.home, () => {
      assert.equal(state.pidFilePath(), newPid, 'the write target is the new file');

      const legacy = state.readPidFile();
      assert.ok(legacy, 'the legacy pid file is read');
      assert.equal(legacy.version, '2.15.0');
      assert.equal(legacy.legacy, true, 'a record read from the legacy file says so');
      assert.equal(state.isWatcherLive(), true, 'the legacy daemon is seen as running');

      assert.throws(() => state.addWatchedProject('/tmp/another-project'), (e) => e.code === 'ELEGACYDAEMON',
        'the legacy daemon watches its own directories: never adopt its pid file');
      assert.equal(fs.existsSync(newPid), false, 'nothing was written for the refused add');

      state.writePidFile({ pid: process.pid, version: '3.0.0', watching: [] });
      assert.ok(fs.existsSync(newPid), 'the write lands under ~/.aoforge/');
      const current = state.readPidFile();
      assert.equal(current.version, '3.0.0', 'the new file wins once it exists');
      assert.equal(current.legacy, undefined);

      state.addWatchedProject('/tmp/another-project');
      assert.deepEqual(JSON.parse(fs.readFileSync(newPid, 'utf-8')).watching, [path.resolve('/tmp/another-project')]);

      state.removePidFile();
      assert.equal(fs.existsSync(newPid), false);
    });
    assert.equal(fs.readFileSync(oldPid, 'utf-8'), LEGACY_PID_TEXT, 'the legacy pid file is never written or removed');
  });

  test('6c. flutter-ui setup never dispatches installs to a legacy daemon (it does not watch the new handoff dir)', () => {
    const h = dotHome({ files: { [OLD_PID]: LEGACY_PID_TEXT } });
    const project = scratch('legacy-dot-flutter-');
    fs.mkdirSync(path.join(project, 'lib'));
    fs.writeFileSync(path.join(project, 'pubspec.yaml'),
      'name: x\nenvironment:\n  sdk: ">=3.2.0 <4.0.0"\n  flutter: ">=3.16.0"\ndependencies:\n  flutter:\n    sdk: flutter\n');
    const emptyPath = scratch('legacy-dot-path-');

    const r = spawnSync(process.execPath, [AOF_TOOLS, 'flutter-ui', 'setup', '--raw'], {
      cwd: project,
      encoding: 'utf-8',
      env: { PATH: emptyPath, HOME: h.home },
      timeout: 30000,
    });

    assert.equal(r.status, 1, `${r.stdout}${r.stderr}`);
    assert.equal(JSON.parse(r.stdout).status, 'no-daemon');
    assert.equal(fs.existsSync(path.join(project, `.${NAMES.slug}-handoff`)), false, 'no handoff record written');
  });

  test('7. nothing under the legacy dot directory is moved, renamed or deleted', () => {
    const h = dotHome({
      files: {
        'defaults.json': LEGACY_DEFAULTS,
        brave_api_key: 'BSA-fixture-key\n',
        [OLD_ALLOW]: LEGACY_ALLOW,
        [OLD_PID]: LEGACY_PID_TEXT,
      },
    });
    const before = h.listLegacy();
    assert.ok(before.some((l) => l.startsWith(`${LEGACY.slug}.sqlite `)), 'the devflowops sentinel is there');
    assert.ok(before.some((l) => l.startsWith('sessions.json ')));

    ensureConfig(h.home);
    const dir = scratch('legacy-dot-init-');
    assert.equal(tools(dir, h.home, ['init', 'new-project', '--raw']).status, 0);
    withHome(h.home, () => {
      const state = require('./watcher-state.cjs');
      require('./watcher-allowlist.cjs').loadAllowlist();
      state.readPidFile();
      state.isWatcherLive();
      try { state.addWatchedProject('/tmp/x'); } catch { /* refused: the legacy daemon */ }
      try { state.removeWatchedProject('/tmp/x'); } catch { /* refused: the legacy daemon */ }
      state.removePidFile();
      state.writePidFile({ pid: process.pid, version: '3.0.0', watching: [] });
      state.removePidFile();
    });

    assert.deepEqual(h.listLegacy(), before);
  });
});

// ─── 8: the legacy adopt branch ───────────────────────────────────────────────

describe('72-12 an adopt begun on the legacy branch', () => {
  const adopt = () => require('./adopt.cjs');
  const { gitEnv, makeFixture, makeFakeHome } = require('./__fixtures__/adopt-fixtures.cjs');

  function legacyRepo(opts) {
    const r = fx.legacyAdoptRepo(opts);
    later(r.cleanup);
    return r;
  }

  const gitIn = (r, args) => spawnSync('git', ['-C', r.root, ...args], { env: gitEnv(r.home), encoding: 'utf-8' }).stdout.trim();
  const branches = (r) => gitIn(r, ['branch', '--list', '--format=%(refname:short)']).split('\n').filter(Boolean).sort();

  test('8. preflight resumes on the legacy branch from its marker; begin creates no second branch', () => {
    const r = legacyRepo();
    const opts = { env: gitEnv(r.home), userHome: r.home };

    const pf = adopt().preflight(r.root, opts);
    assert.equal(pf.route, 'resume', JSON.stringify(pf));
    assert.equal(pf.git.branch, LEGACY.adoptBranch);
    assert.equal(pf.adopt.branch, LEGACY.adoptBranch, 'the adopt branch is the legacy one');
    assert.equal(pf.adopt.marker.branch, LEGACY.adoptBranch);
    assert.equal(pf.adopt.steps.mapped, true, 'the mapped docs are read from the legacy planning directory');

    const b = adopt().begin(r.root, opts);
    assert.equal(b.route, 'resume');
    assert.equal(b.created_branch, false);
    assert.deepEqual(branches(r), [LEGACY.adoptBranch, 'main'].sort(), 'no aoforge/adopt branch was created');
    assert.equal(gitIn(r, ['branch', '--show-current']), LEGACY.adoptBranch, 'the user branch is not renamed');
  });

  test('8b. a fresh repo adopts on aoforge/adopt', () => {
    const parent = scratch('legacy-adopt-fresh-');
    const home = track(makeFakeHome());
    const root = makeFixture('go-service', { parent, home });
    const opts = { env: gitEnv(home), userHome: home };

    const pf = adopt().preflight(root, opts);
    assert.equal(pf.route, 'adopt');
    assert.equal(pf.adopt.branch, NAMES.adoptBranch);

    const b = adopt().begin(root, opts);
    assert.equal(b.created_branch, true);
    assert.equal(b.adopt.marker.branch, NAMES.adoptBranch);
    const current = spawnSync('git', ['-C', root, 'branch', '--show-current'], { env: gitEnv(home), encoding: 'utf-8' }).stdout.trim();
    assert.equal(current, NAMES.adoptBranch);
  });

  test('8c. both adopt branches -> refuse, naming both, and change nothing', () => {
    const r = legacyRepo({ withNewBranch: true });
    const before = branches(r);

    const pf = adopt().preflight(r.root, { env: gitEnv(r.home), userHome: r.home });

    assert.equal(pf.route, 'refuse');
    assert.equal(pf.reason, 'adopt-branch-conflict');
    assert.ok(pf.message.includes(NAMES.adoptBranch) && pf.message.includes(LEGACY.adoptBranch), pf.message);
    assert.deepEqual(branches(r), before);
  });

  test('8d. a stale legacy adopt branch with no marker refuses instead of starting a second branch', () => {
    const parent = scratch('legacy-adopt-stale-');
    const home = track(makeFakeHome());
    const root = makeFixture('go-service', { parent, home });
    spawnSync('git', ['-C', root, 'branch', LEGACY.adoptBranch], { env: gitEnv(home) });

    const pf = adopt().preflight(root, { env: gitEnv(home), userHome: home });

    assert.equal(pf.route, 'refuse');
    assert.equal(pf.reason, 'adopt-branch-exists');
    assert.ok(pf.message.includes(LEGACY.adoptBranch), pf.message);
  });

  test('8e. the marker is read from the legacy file and written to the new one only', () => {
    const r = legacyRepo();
    const env = gitEnv(r.home);
    const legacyBytes = fs.readFileSync(r.markerPath, 'utf-8');

    const read = adopt().readMarker(r.root, env);
    assert.equal(read.marker.branch, LEGACY.adoptBranch);

    const written = adopt().writeMarker(r.root, env, { ...read.marker, steps: { scaffolded: true } });
    assert.equal(path.basename(written), adopt().MARKER_NAME);
    assert.equal(adopt().readMarker(r.root, env).marker.steps.scaffolded, true, 'the new marker is read first');
    assert.equal(fs.readFileSync(r.markerPath, 'utf-8'), legacyBytes, 'the legacy marker is never rewritten');
  });

  test('8f. the adopt report names the branch the adopt is on', () => {
    const text = adopt().renderReport({
      name: 'Orders', date: '2026-10-08', version: '3.0.0', baseBranch: 'main', baseSha7: 'abc1234',
      docsCount: 8, claudeVerb: 'inserted the', claudeVersion: '3', backupPath: null, registryKey: 'k',
      needsReviewRows: [], highRows: [], stackReportLinked: false, branch: LEGACY.adoptBranch,
    });
    assert.ok(text.includes(`git merge ${LEGACY.adoptBranch}`), text);
    assert.equal(text.includes(NAMES.adoptBranch), false);
  });
});
