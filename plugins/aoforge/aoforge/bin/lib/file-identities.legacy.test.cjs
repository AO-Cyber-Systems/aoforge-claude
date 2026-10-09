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
