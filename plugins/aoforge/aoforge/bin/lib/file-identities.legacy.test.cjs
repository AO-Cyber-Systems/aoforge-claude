'use strict';

// file-identities.legacy.test.cjs — legacy identities that live in users' files (objective 72, TRD 72-12, INST-03;
// objective 78, TRDs 78-04 and 78-05).
//
// 72-12 read both forms for one release (SHIM_REMOVAL). TRD 78-04 removed that for the `.mcp.json` owner key, the
// session-todo metadata key and the adopt branch/marker: each pre-rename identity is now ignored, and a stale
// `.mcp.json` entry is reported in one line instead of silently going unrefreshed. TRD 78-05 stopped reading the
// pre-rename daemon's pid file (6b, 6c). TRD 78-11 stopped reading the other user files (4, 5, 6) from the legacy dot
// directory and from ~/.aoforge/ (AOForge 3.0.0): only the runtime home, ~/.claude/aoforge/, counts; doctor check 17
// moves 3.0.0's files there. Fixtures come from
// __fixtures__/legacy-identity-fixtures.cjs; every home and repo is a temp dir, never the real ~/.claude,
// ~/.aoforge or ~/.devflow (the last also holds the devflowops product's files).
//
// Test list (written before the implementation; one at a time; TRD 78-04 test-list cases in brackets):
//
//  1. [1] `stack mcp --write` over a `.mcp.json` holding an entry owned through the pre-rename key, an AOForge-owned
//     entry and a foreign one: the pre-rename entry is byte-identical afterwards, the AOForge one is refreshed, and
//     the result carries exactly one warning naming the entry, the pre-rename key and AOFORGE_MANAGED. Also: under a
//     name the profile wants it is a foreign clash (kept, warned); a preview warns too; the detector by itself.
//     [2] isManaged is true only for AOFORGE_MANAGED === 'stack'.
//  2. A server with neither key is untouched (also when it holds a name the profile wants, and when the legacy
//     key has another value); a server with the AOForge key is handled as today; neither warns.
//  3. [4] TODO_META_KEYS is the AOForge key alone; replayTranscript ignores the pre-rename key (a plain subject
//     carrying it is not a todo; a `Todo: ` subject is, with a derived stem). [3] The Stop hook archives nothing
//     for the pre-rename key alone and archives the AOForge key as before.
//  4. [78-11 case 5] config-ensure-section: defaults.json only in ~/.devflow/, or only in ~/.aoforge/ -> not applied
//     (the hard-coded defaults); in ~/.claude/aoforge/ -> applied, whatever the other two hold.
//  5. [78-11 case 5] Brave key: only in ~/.devflow/ or only in ~/.aoforge/ -> not found by config-ensure-section or
//     `init new-project`; in ~/.claude/aoforge/ -> found by both.
//  6. [78-11 case 5] Watch allowlist: only ~/.claude/aoforge/aoforge-watch-allow.json is read; the pre-rename file
//     and the ~/.aoforge/ copy are ignored. [78-05] 6b: the pre-rename daemon's pid file is not read (no
//     record carries `legacy`, add says ENOPIDFILE) and a pid write goes to the watch state directory,
//     ~/.claude/aoforge/state/watch/ (TRD 73-12). 6c: flutter-ui setup has no special case for it.
//  7. Nothing under the legacy dot dir or ~/.aoforge/ is moved, renamed or deleted by any of the above.
//  8. [5] `adopt preflight` (CLI) in a repo on the pre-rename adopt branch with its marker -> a fresh adopt on
//     aoforge/adopt, no `legacy_branch_exists` in the JSON, nothing written to that branch. [6] `adopt begin` there
//     creates aoforge/adopt and leaves the old branch at its commit. The pre-rename marker is never read; a stale
//     pre-rename branch alone does not refuse; with aoforge/adopt also present only that branch is named.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { NAMES, LEGACY } = require('./legacy-names.cjs');
const { watchStateDir } = require('./compat.cjs');
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

function writeMcp(root, { write = true } = {}) {
  return mcp().stackMcp({ projectRoot: root, userHome: track(verifyFx.fakeHome({})), write, which: whichOf('gopls') });
}

/** `aof-tools --cwd <root> stack mcp ...args` with PATH = a stub dir holding only gopls and a scratch HOME. */
function stackMcpCli(root, args) {
  const env = { PATH: track(verifyFx.fakeBin(['gopls'])), HOME: track(verifyFx.fakeHome({})) };
  const r = spawnSync(process.execPath, [AOF_TOOLS, '--cwd', root, 'stack', 'mcp', ...args], { encoding: 'utf-8', env, timeout: 60000 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* leave null: the assertions name the stdout */ }
  return { ...r, json };
}

/** The lines `name: entry` occupies inside a 2-space-indented `mcpServers` object, byte for byte. */
function entryText(name, entry) {
  return JSON.stringify({ [name]: entry }, null, 2).split('\n').slice(1, -1).map((l) => `  ${l}`).join('\n');
}

const GOPLS = { command: 'gopls', args: ['mcp'] };
const OLDTOOL = { command: 'oldtool', args: ['serve'] };
const PLAYWRIGHT = { command: 'npx', args: ['@playwright/mcp@latest'], env: { FOO: 'bar' } };

const ownedBy = (ownerKey, owned) => fx.legacyMcpJson({ owned, foreign: {}, ownerKey }).mcpServers;

function assertOneWarningFor(warnings, name) {
  assert.ok(Array.isArray(warnings), `warnings is an array: ${JSON.stringify(warnings)}`);
  assert.equal(warnings.length, 1, JSON.stringify(warnings));
  const [line] = warnings;
  assert.equal(line.includes('\n'), false, 'one line');
  for (const part of ['.mcp.json', `"${name}"`, OLD_OWNER_KEY, NEW_OWNER_KEY]) {
    assert.ok(line.includes(part), `the warning names ${part}: ${line}`);
  }
}

describe('78-04 .mcp.json entries owned through the pre-rename key are left alone and reported', () => {
  test('1. stack mcp --write: the pre-rename entry stays byte-identical, the AOForge one is refreshed, one warning', () => {
    const doc = {
      mcpServers: {
        ...ownedBy(NEW_OWNER_KEY, { gopls: { command: 'gopls', args: ['old-args'] } }),
        ...ownedBy(OLD_OWNER_KEY, { oldtool: OLDTOOL }),
        playwright: PLAYWRIGHT,
      },
    };
    assert.equal(doc.mcpServers.oldtool.env[OLD_OWNER_KEY], 'stack', 'fixture carries the pre-rename key');
    const { root, file } = goProjectWith(doc);
    const legacyEntry = entryText('oldtool', doc.mcpServers.oldtool);
    assert.ok(fs.readFileSync(file, 'utf-8').includes(legacyEntry), 'precondition: the entry text is located');

    const r = stackMcpCli(root, ['--write']);

    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
    assert.ok(r.json, `stdout is JSON: ${r.stdout}`);
    assert.equal(r.json.action, 'written');
    assert.deepEqual(r.json.skipped, []);
    const text = fs.readFileSync(file, 'utf-8');
    const expected = {
      mcpServers: { ...ownedBy(NEW_OWNER_KEY, { gopls: GOPLS }), oldtool: doc.mcpServers.oldtool, playwright: PLAYWRIGHT },
    };
    assert.equal(text, `${JSON.stringify(expected, null, 2)}\n`, 'gopls refreshed in place; oldtool and playwright kept');
    assert.ok(text.includes(legacyEntry), 'the pre-rename entry is byte-identical');
    assertOneWarningFor(r.json.warnings, 'oldtool');
  });

  test('1b. isManaged is true only for AOFORGE_MANAGED === "stack"', () => {
    const { isManaged } = mcp();
    assert.equal(isManaged({ command: 'x', env: { [NEW_OWNER_KEY]: 'stack' } }), true);
    assert.equal(isManaged({ command: 'x', env: { [OLD_OWNER_KEY]: 'stack' } }), false, 'the pre-rename key owns nothing');
    assert.equal(isManaged({ command: 'x', env: { [NEW_OWNER_KEY]: 'manual' } }), false);
    assert.equal(isManaged({ command: 'x', env: { [OLD_OWNER_KEY]: 'manual' } }), false);
    assert.equal(isManaged({ command: 'x', env: { OTHER_MANAGED: 'stack' } }), false);
    assert.equal(isManaged({ command: 'x' }), false);
  });

  test('1c. under a name the profile wants, a pre-rename entry is a foreign clash: kept byte-identical, and warned', () => {
    const { root, file } = goProjectWith({ mcpServers: { ...ownedBy(OLD_OWNER_KEY, { gopls: GOPLS }), playwright: PLAYWRIGHT } });
    const before = fs.readFileSync(file, 'utf-8');

    const r = writeMcp(root);

    assert.equal(r.action, 'unchanged');
    assert.deepEqual(r.skipped.map((s) => [s.name, s.reason]), [['gopls', 'foreign_entry']]);
    assert.equal(fs.readFileSync(file, 'utf-8'), before, 'byte-identical');
    assertOneWarningFor(r.warnings, 'gopls');
  });

  test('1d. a preview reports the pre-rename entry too, and writes nothing', () => {
    const { root, file } = goProjectWith({ mcpServers: ownedBy(OLD_OWNER_KEY, { oldtool: OLDTOOL }) });
    const before = fs.readFileSync(file, 'utf-8');

    const r = writeMcp(root, { write: false });

    assert.equal(r.action, 'preview');
    assertOneWarningFor(r.warnings, 'oldtool');
    assert.equal(fs.readFileSync(file, 'utf-8'), before);
  });

  test('1e. legacyOwnedEntries names entries owned through the pre-rename key alone', () => {
    const { legacyOwnedEntries } = mcp();
    const doc = {
      mcpServers: {
        a: { command: 'a', env: { [OLD_OWNER_KEY]: 'stack' } },
        both: { command: 'b', env: { [OLD_OWNER_KEY]: 'stack', [NEW_OWNER_KEY]: 'stack' } },
        mine: { command: 'm', env: { [NEW_OWNER_KEY]: 'stack' } },
        other: { command: 'o', env: { [OLD_OWNER_KEY]: 'manual' } },
        bare: { command: 'x' },
        z: { command: 'z', env: { [OLD_OWNER_KEY]: 'stack' } },
      },
    };
    assert.deepEqual(legacyOwnedEntries(doc), ['a', 'z']);
    assert.deepEqual(legacyOwnedEntries(null), []);
    assert.deepEqual(legacyOwnedEntries({ mcpServers: [] }), []);
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
    assert.deepEqual(r.warnings, [], 'the pre-rename key at another value is not reported');
  });

  test('2b. an AOForge-owned entry is handled as today: replaced in place, a stale one removed, no warning', () => {
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
    assert.deepEqual(r.warnings, []);
  });
});

// ─── 3: todo metadata ─────────────────────────────────────────────────────────

const STEM = '2026-10-05-carried-from-the-old-session';
const TITLE = 'Carry the old todo';

describe('78-04 session todos: the pre-rename metadata key is not read', () => {
  const { replayTranscript, TODO_META_KEYS } = require('./todo-session.cjs');

  test('3. TODO_META_KEYS is the AOForge key alone', () => {
    assert.deepEqual([...TODO_META_KEYS], [NEW_TODO_KEY]);
    assert.ok(Object.isFrozen(TODO_META_KEYS));
  });

  test('3b. a plain-subject TaskCreate carrying only the pre-rename key is not a todo; the AOForge key makes it one', () => {
    const text = fx.legacyTodoTranscript({ stem: STEM, subject: 'Plain subject' });
    assert.ok(text.includes(`"${OLD_TODO_KEY}":"${STEM}"`), 'precondition: the transcript carries the pre-rename key');
    const legacy = replayTranscript(text);
    assert.deepEqual(legacy.items, [], JSON.stringify(legacy));

    const current = replayTranscript(fx.legacyTodoTranscript({ stem: STEM, subject: 'Plain subject', metadataKey: NEW_TODO_KEY }));
    assert.equal(current.items.length, 1, JSON.stringify(current));
    assert.equal(current.items[0].stem, STEM);
    assert.equal(current.items[0].stem_source, 'metadata');
  });

  test('3c. a Todo: subject is still a todo, but the pre-rename stem is ignored and the stem is derived', () => {
    const r = replayTranscript(fx.legacyTodoTranscript({ stem: STEM, title: TITLE }));
    assert.equal(r.items.length, 1, JSON.stringify(r));
    assert.equal(r.items[0].title, TITLE);
    assert.equal(r.items[0].stem_source, 'derived');
    assert.notEqual(r.items[0].stem, STEM);
  });

  test('3d. the Stop hook archives nothing for the pre-rename key alone, and the AOForge key as before', () => {
    const proj = todoArchiveFx.makeTodoProject({ git: true });
    later(proj.cleanup);
    const pending = path.join(proj.root, NAMES.planningDir, 'todos', 'pending');
    const runHook = (session, text) => {
      const transcript = todoArchiveFx.writeTranscript(scratch('legacy-todo-transcript-'), `${session}.jsonl`, text);
      const payload = { session_id: session, transcript_path: transcript, cwd: proj.root, hook_event_name: 'Stop', stop_hook_active: false };
      return spawnSync(process.execPath, [TODO_HOOK], {
        cwd: proj.root,
        input: JSON.stringify(payload),
        encoding: 'utf8',
        env: { PATH: process.env.PATH, HOME: scratch('legacy-todo-home-'), CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
        timeout: 60000,
      });
    };

    const legacy = runHook('sess-legacy', fx.legacyTodoTranscript({ stem: STEM, subject: 'Plain subject' }));
    assert.equal(legacy.status, 0, legacy.stderr);
    assert.doesNotMatch(legacy.stdout, /archived/, `stdout: ${legacy.stdout}`);
    assert.equal(fs.existsSync(path.join(pending, `${STEM}.md`)), false, 'nothing archived for the pre-rename key');

    const current = runHook('sess-current', fx.legacyTodoTranscript({ stem: STEM, subject: 'Plain subject', metadataKey: NEW_TODO_KEY }));
    assert.equal(current.status, 0, current.stderr);
    assert.match(current.stdout, /archived 1 todo\(s\)/, `stdout: ${current.stdout}`);
    assert.ok(fs.existsSync(path.join(pending, `${STEM}.md`)), 'archived under its stem');
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

/** Write `files` into the runtime home, <home>/.claude/aoforge/ (the only place 3.1 reads user files from). */
function writeRuntimeFiles(home, files) {
  const dir = path.join(home, '.claude', NAMES.runtimeDir);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

describe('78-11 user files come from the runtime home only', () => {
  test('4. config-ensure-section ignores defaults.json in ~/.devflow/ and ~/.aoforge/; the runtime-home one applies', () => {
    const legacyOnly = dotHome({ files: { 'defaults.json': LEGACY_DEFAULTS } });
    const cfg = ensureConfig(legacyOnly.home);
    assert.equal(cfg.model_profile, 'balanced', 'the pre-rename defaults are not read');
    assert.equal(cfg.workflow.research, true);

    const interimOnly = dotHome({ newFiles: { 'defaults.json': LEGACY_DEFAULTS } });
    const cfg2 = ensureConfig(interimOnly.home);
    assert.equal(cfg2.model_profile, 'balanced', 'the ~/.aoforge/ (3.0.0) defaults are not read');
    assert.equal(cfg2.workflow.research, true);

    const all = dotHome({ files: { 'defaults.json': LEGACY_DEFAULTS }, newFiles: { 'defaults.json': LEGACY_DEFAULTS } });
    writeRuntimeFiles(all.home, { 'defaults.json': NEW_DEFAULTS });
    const cfg3 = ensureConfig(all.home);
    assert.equal(cfg3.model_profile, 'budget', 'the runtime-home defaults apply');
    assert.equal(cfg3.workflow.research, true, 'nothing is merged in from the other files');
  });

  test('5. a Brave key file counts only in the runtime home', () => {
    const none = dotHome({});
    assert.equal(ensureConfig(none.home).brave_search, false, 'control: no key anywhere');

    for (const [label, opts] of [
      ['~/.devflow/', { files: { brave_api_key: 'BSA-fixture-key\n' } }],
      ['~/.aoforge/', { newFiles: { brave_api_key: 'BSA-fixture-key\n' } }],
    ]) {
      const h = dotHome(opts);
      assert.equal(ensureConfig(h.home).brave_search, false, `${label}: config-ensure-section does not see it`);
      const dir = scratch('legacy-dot-init-');
      const r = tools(dir, h.home, ['init', 'new-project', '--raw']);
      assert.equal(r.status, 0, r.out);
      assert.equal(JSON.parse(r.stdout).brave_search_available, false, `${label}: init new-project does not see it`);
    }

    const h = dotHome({});
    writeRuntimeFiles(h.home, { brave_api_key: 'BSA-fixture-key\n' });
    assert.equal(ensureConfig(h.home).brave_search, true, 'the runtime-home key is found');
    const dir = scratch('legacy-dot-init-');
    const r = tools(dir, h.home, ['init', 'new-project', '--raw']);
    assert.equal(r.status, 0, r.out);
    assert.equal(JSON.parse(r.stdout).brave_search_available, true);
  });

  test('6. the watch allowlist is read from ~/.claude/aoforge/aoforge-watch-allow.json only', () => {
    const allow = () => require('./watcher-allowlist.cjs').loadAllowlist();

    const legacyOnly = dotHome({ files: { [OLD_ALLOW]: LEGACY_ALLOW } });
    const r1 = withHome(legacyOnly.home, allow);
    assert.equal(r1.userPatterns, 0, 'the pre-rename allowlist is not read');
    assert.equal(r1.allowlist.some((p) => p.label === 'legacy-extra'), false);

    const interimOnly = dotHome({ newFiles: { [NEW_ALLOW]: NEW_ALLOW_TEXT } });
    const r2 = withHome(interimOnly.home, allow);
    assert.equal(r2.userPatterns, 0, 'the ~/.aoforge/ (3.0.0) allowlist is not read');

    const all = dotHome({ files: { [OLD_ALLOW]: LEGACY_ALLOW }, newFiles: { [NEW_ALLOW]: LEGACY_ALLOW } });
    writeRuntimeFiles(all.home, { [NEW_ALLOW]: NEW_ALLOW_TEXT });
    const r3 = withHome(all.home, allow);
    assert.equal(r3.userPatterns, 1);
    assert.deepEqual(r3.allowlist.filter((p) => /-extra$/.test(p.label)).map((p) => p.label), ['new-extra']);
  });

  test('6b. [78-05] the pre-rename daemon\'s pid file is not read; writes and removals land in the watch state directory', () => {
    const state = require('./watcher-state.cjs');
    const h = dotHome({ files: { [OLD_PID]: LEGACY_PID_TEXT } });
    const newPid = path.join(watchStateDir(h.home), NEW_PID);
    const oldPid = path.join(h.legacyDir, OLD_PID);

    withHome(h.home, () => {
      assert.equal(state.pidFilePath(), newPid, 'the write target is the watch state directory\'s file');

      assert.equal(state.readPidFile(), null, 'the pre-rename pid file is not read');
      assert.equal(state.isWatcherLive(), false, 'its (live) pid does not make a daemon');
      assert.equal(state.interimDaemon(), null, 'and it is not the 3.0.0 daemon the detector names');

      assert.throws(() => state.addWatchedProject('/tmp/another-project'), (e) => e.code === 'ENOPIDFILE',
        'no AOForge daemon to add to; ELEGACYDAEMON is gone');
      assert.equal(fs.existsSync(newPid), false, 'nothing was written for the refused add');

      state.writePidFile({ pid: process.pid, version: '3.1.0', watching: [] });
      assert.ok(fs.existsSync(newPid), 'the write lands in the watch state directory');
      const current = state.readPidFile();
      assert.equal(current.version, '3.1.0');
      assert.equal('legacy' in current, false, 'no record carries `legacy`');

      state.addWatchedProject('/tmp/another-project');
      assert.deepEqual(JSON.parse(fs.readFileSync(newPid, 'utf-8')).watching, [path.resolve('/tmp/another-project')]);

      state.removePidFile();
      assert.equal(fs.existsSync(newPid), false);
    });
    assert.equal(fs.existsSync(h.newDir), false, 'nothing is written under ~/.aoforge/');
    assert.equal(fs.readFileSync(oldPid, 'utf-8'), LEGACY_PID_TEXT, 'the legacy pid file is never written or removed');
  });

  test('6c. [78-05] flutter-ui setup: the pre-rename pid file is not read, so no daemon and no special advisory', () => {
    const h = dotHome({ files: { [OLD_PID]: LEGACY_PID_TEXT } });
    const project = scratch('legacy-dot-flutter-');
    fs.mkdirSync(path.join(project, 'lib'));
    fs.writeFileSync(path.join(project, 'pubspec.yaml'),
      'name: x\nenvironment:\n  sdk: ">=3.2.0 <4.0.0"\n  flutter: ">=3.16.0"\ndependencies:\n  flutter:\n    sdk: flutter\n');
    const emptyPath = scratch('legacy-dot-path-');

    // flutter-ui setup moved to the Flutter stack pack's CLI (objective 77).
    const AOF_FLUTTER = path.join(__dirname, '..', '..', '..', '..', 'aoforge-stack-flutter', 'bin', 'aof-flutter.cjs');
    const r = spawnSync(process.execPath, [AOF_FLUTTER, 'flutter-ui', 'setup', '--raw'], {
      cwd: project,
      encoding: 'utf-8',
      env: { PATH: emptyPath, HOME: h.home },
      timeout: 30000,
    });

    assert.equal(r.status, 1, `${r.stdout}${r.stderr}`);
    assert.equal(JSON.parse(r.stdout).status, 'no-daemon');
    assert.equal(fs.existsSync(path.join(project, `.${NAMES.slug}-handoff`)), false, 'no handoff record written');
    assert.doesNotMatch(r.stderr, /predates the rename/, 'no pre-rename-daemon advisory: that branch is gone');
    assert.doesNotMatch(r.stderr, /stale aoforge-watch PID file/, 'and the file is not a stale record either');
  });

  test('7. nothing under the legacy dot directory or ~/.aoforge/ is moved, renamed or deleted', () => {
    const h = dotHome({
      files: {
        'defaults.json': LEGACY_DEFAULTS,
        brave_api_key: 'BSA-fixture-key\n',
        [OLD_ALLOW]: LEGACY_ALLOW,
        [OLD_PID]: LEGACY_PID_TEXT,
      },
      newFiles: {
        'defaults.json': NEW_DEFAULTS,
        brave_api_key: 'BSA-fixture-key\n',
        [NEW_ALLOW]: NEW_ALLOW_TEXT,
      },
    });
    const interim = () => fs.readdirSync(h.newDir).sort().map((n) => `${n} ${fs.readFileSync(path.join(h.newDir, n), 'utf-8')}`);
    const interimBefore = interim();
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
      try { state.addWatchedProject('/tmp/x'); } catch { /* refused: no daemon record (78-05) */ }
      try { state.removeWatchedProject('/tmp/x'); } catch { /* refused: no daemon record (78-05) */ }
      state.removePidFile();
      state.writePidFile({ pid: process.pid, version: '3.0.0', watching: [] });
      state.removePidFile();
    });

    assert.deepEqual(h.listLegacy(), before);
    assert.deepEqual(interim(), interimBefore, '~/.aoforge/ is left as it was (doctor check 17 moves it, on request)');
  });
});

// ─── 8: the pre-rename adopt branch ───────────────────────────────────────────

describe('78-04 an adopt begun on the pre-rename branch is not resumed', () => {
  const adopt = () => require('./adopt.cjs');
  const { gitEnv, makeFixture, makeFakeHome } = require('./__fixtures__/adopt-fixtures.cjs');

  // No legacy planning directory: the branch and the marker alone are under test, so the repo's state comes from its
  // code (go-service: brownfield) rather than from a planning tree 78-07 refuses before adopt is reached.
  function legacyRepo(opts) {
    const r = fx.legacyAdoptRepo({ planning: false, ...opts });
    later(r.cleanup);
    return r;
  }

  const gitIn = (r, args) => spawnSync('git', ['-C', r.root, ...args], { env: gitEnv(r.home), encoding: 'utf-8' }).stdout.trim();
  const branches = (r) => gitIn(r, ['branch', '--list', '--format=%(refname:short)']).split('\n').filter(Boolean).sort();
  const tip = (r, branch) => gitIn(r, ['rev-parse', `refs/heads/${branch}`]);

  test('8. adopt preflight (CLI) on the pre-rename branch with its marker: a fresh adopt, no legacy fact, nothing written', () => {
    const r = legacyRepo();
    const markerBytes = fs.readFileSync(r.markerPath, 'utf-8');
    const before = branches(r);

    const res = spawnSync(process.execPath, [AOF_TOOLS, '--cwd', r.root, 'adopt', 'preflight'], {
      encoding: 'utf-8', env: gitEnv(r.home), timeout: 60000,
    });

    assert.equal(res.status, 0, `${res.stdout}${res.stderr}`);
    assert.equal(res.stdout.includes('legacy_branch_exists'), false, `no pre-rename fact in the JSON: ${res.stdout}`);
    const pf = JSON.parse(res.stdout);
    assert.equal(pf.route, 'adopt', JSON.stringify(pf));
    assert.equal(pf.reason, null);
    assert.equal(pf.adopt.branch, NAMES.adoptBranch, 'the adopt runs on aoforge/adopt');
    assert.equal(pf.adopt.marker, null, 'the pre-rename marker is not read');
    assert.equal(pf.adopt.steps, null);
    assert.equal(pf.git.branch, LEGACY.adoptBranch, 'preflight reports where HEAD is, nothing more');
    assert.deepEqual(branches(r), before, 'no branch created');
    assert.equal(tip(r, LEGACY.adoptBranch), r.baseSha, 'nothing committed to the pre-rename branch');
    assert.equal(fs.readFileSync(r.markerPath, 'utf-8'), markerBytes, 'the pre-rename marker is untouched');
  });

  test('8b. adopt begin there creates aoforge/adopt and leaves the pre-rename branch and marker as they were', () => {
    const r = legacyRepo();
    const env = gitEnv(r.home);
    const markerBytes = fs.readFileSync(r.markerPath, 'utf-8');

    const b = adopt().begin(r.root, { env, userHome: r.home });

    assert.equal(b.route, 'adopt', JSON.stringify(b));
    assert.equal(b.created_branch, true);
    assert.equal(b.adopt.marker.branch, NAMES.adoptBranch);
    assert.equal(gitIn(r, ['branch', '--show-current']), NAMES.adoptBranch);
    assert.deepEqual(branches(r), [NAMES.adoptBranch, LEGACY.adoptBranch, 'main'].sort());
    assert.equal(tip(r, LEGACY.adoptBranch), r.baseSha, 'the pre-rename branch stays at its commit');
    assert.equal(fs.readFileSync(r.markerPath, 'utf-8'), markerBytes, 'the pre-rename marker is never rewritten');
    assert.equal(adopt().readMarker(r.root, env).marker.branch, NAMES.adoptBranch, 'the new marker is the one read');
  });

  test('8c. readMarker does not read the pre-rename marker', () => {
    const r = legacyRepo();
    assert.ok(fs.existsSync(r.markerPath), 'precondition: the pre-rename marker exists');
    assert.deepEqual(adopt().readMarker(r.root, gitEnv(r.home)), { marker: null, warning: null });
  });

  test('8d. a stale pre-rename adopt branch with no marker does not refuse: adopt proceeds on aoforge/adopt', () => {
    const parent = scratch('legacy-adopt-stale-');
    const home = track(makeFakeHome());
    const root = makeFixture('go-service', { parent, home });
    spawnSync('git', ['-C', root, 'branch', LEGACY.adoptBranch], { env: gitEnv(home) });

    const pf = adopt().preflight(root, { env: gitEnv(home), userHome: home });

    assert.equal(pf.route, 'adopt', JSON.stringify(pf));
    assert.equal(pf.adopt.branch, NAMES.adoptBranch);
    assert.equal(Object.prototype.hasOwnProperty.call(pf.adopt, 'legacy_branch_exists'), false);
  });

  test('8e. with aoforge/adopt also present, only that branch is named (adopt-branch-exists), never the pre-rename one', () => {
    const r = legacyRepo({ withNewBranch: true });
    const before = branches(r);

    const pf = adopt().preflight(r.root, { env: gitEnv(r.home), userHome: r.home });

    assert.equal(pf.route, 'refuse', JSON.stringify(pf));
    assert.equal(pf.reason, 'adopt-branch-exists');
    assert.ok(pf.message.includes(NAMES.adoptBranch), pf.message);
    assert.equal(pf.message.includes(LEGACY.adoptBranch), false, pf.message);
    assert.equal(pf.next.includes(LEGACY.adoptBranch), false, pf.next);
    assert.deepEqual(branches(r), before);
  });

  test('8f. gitFacts reports the AOForge adopt branch only; MARKER_NAME is the AOForge marker', () => {
    const r = legacyRepo({ withNewBranch: true });
    const facts = adopt().gitFacts(r.root, { env: gitEnv(r.home) });
    assert.equal(facts.branch_exists, true);
    assert.equal(Object.prototype.hasOwnProperty.call(facts, 'legacy_branch_exists'), false, JSON.stringify(facts));
    assert.equal(adopt().MARKER_NAME, `${NAMES.slug}-adopt.json`);
  });
});
