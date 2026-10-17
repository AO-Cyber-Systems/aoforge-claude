'use strict';

// Test list (TRD 72-10, objective 72, INST-05): the coexistence-guard SessionStart hook.
//
// Every spawn gets a fake HOME (legacy-plugin-fixtures.cjs pluginHome) and a hermetic env: PATH and HOME only, so a
// developer's AOFORGE_* or DEVFLOW_* variables never reach the hook. The real ~/.claude is never read or written.
//
// 6. The old plugin installed and enabled -> exactly one global notice queued (read back through notices.cjs):
//    source coexistence-guard, a coexistence key, level action, the message names the version and
//    `claude plugin disable devflow@aocyber`. stdout empty, stderr empty, exit 0.
//    6b. One notice per session: a second SessionStart of the same session (resume, compact) queues nothing,
//        even after the first notice was consumed; a new session queues one again, but never a second pending one.
//    6c. The pointer release enabled -> one notice, level info, no "twice".
// 7. Disabled (enabledPlugins false) or absent -> no notice file, exit 0, stdout empty.
// 8. Corrupt installed_plugins.json -> no notice, exit 0, stdout empty.
// 9. AOFORGE_SKIP_COEXISTENCE=1 -> nothing read, nothing written (in process: the detector is never called; spawned:
//    no notice file). The legacy-prefixed variable skips too (the env alias runs first).
// 9b. Malformed or empty stdin still queues the notice (the session id is only a dedupe key); a notices file the
//    hook cannot parse is left byte for byte as it was.
//
// Test list (TRD 78-06, objective 78, SC-3/SC-4): one SessionStart notice for every global leftover. Homes from
// legacy-doctor-fixtures.cjs (leftoverHome), same hermetic spawn as above.
//
// 1. DEVFLOW_SKIP_EDIT_GATE=1 and nothing else -> one global notice naming DEVFLOW_SKIP_EDIT_GATE and
//    AOFORGE_SKIP_EDIT_GATE and saying it is no longer read; stdout empty, exit 0. A second SessionStart of the same
//    session queues nothing.
// 2. The pre-rename runtime home present without the migration marker -> the notice names it and the 3.0.x path;
//    present WITH the marker -> no notice.
// 3. ~/.aoforge/defaults.json present -> the notice names `aof-tools doctor --global --fix`.
// 4. Nothing at all -> no notice file (the plugin cases are 6-9 above).
// 5. Several findings at once -> exactly one notice: `message` one line, `detail` one line per finding; level action.
//    In process: run() reports status 'nothing' / 'queued'.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.join(__dirname, 'coexistence-guard.js');
const LIB = path.join(__dirname, '..', 'aoforge', 'bin', 'lib');
const { pluginHome } = require(path.join(LIB, '__fixtures__', 'legacy-plugin-fixtures.cjs'));
const { leftoverHome } = require(path.join(LIB, '__fixtures__', 'legacy-doctor-fixtures.cjs'));
const notices = require(path.join(LIB, 'notices.cjs'));

const ENABLED = { devflow: { version: '2.15.0' } };

function sessionStart(home, sessionId = 'sess-coexist-1', source = 'startup') {
  return {
    session_id: sessionId,
    transcript_path: path.join(home, '.claude', 'projects', '-fixture', `${sessionId}.jsonl`),
    cwd: home,
    hook_event_name: 'SessionStart',
    source,
  };
}

function spawnGuard(home, { payload, input, env = {} } = {}) {
  const r = spawnSync(process.execPath, [HOOK], {
    cwd: home,
    input: input !== undefined ? input : JSON.stringify(payload || sessionStart(home)),
    env: { PATH: process.env.PATH, HOME: home, ...env },
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(r.status, 0, `exit 0 on every path (stderr: ${r.stderr})`);
  assert.equal(r.stdout, '', 'SessionStart stdout stays empty');
  return r;
}

const globalFile = (home) => notices.globalNoticesPath(home);
const queued = (home) => notices.readNotices(globalFile(home));

function withHome(opts, fn) {
  const h = pluginHome(opts);
  try {
    return fn(h);
  } finally {
    h.cleanup();
  }
}

describe('coexistence-guard hook', () => {
  it('6. enabled old plugin -> one global notice naming the version and the disable command', () => {
    withHome(ENABLED, ({ home }) => {
      const r = spawnGuard(home);
      assert.equal(r.stderr, '');
      const list = queued(home);
      assert.equal(list.length, 1, JSON.stringify(list));
      const [n] = list;
      assert.equal(n.source, 'coexistence-guard');
      assert.match(n.key, /^coexistence:/);
      assert.equal(n.level, 'action');
      assert.equal(n.consumed, false);
      assert.match(n.message, /2\.15\.0/);
      assert.match(n.message, /twice/);
      assert.ok(n.message.includes('claude plugin disable devflow@aocyber'), n.message);
    });
  });

  it('6b. one notice per session, never two pending', () => {
    withHome(ENABLED, ({ home }) => {
      spawnGuard(home, { payload: sessionStart(home, 'sess-a') });
      spawnGuard(home, { payload: sessionStart(home, 'sess-a', 'compact') });
      assert.equal(queued(home).length, 1, 'same session, unconsumed: still one');

      // route-results takes it on the next prompt; the same session's next SessionStart stays quiet.
      assert.equal(notices.takeUnconsumed([globalFile(home)]).length, 1);
      spawnGuard(home, { payload: sessionStart(home, 'sess-a', 'resume') });
      assert.equal(queued(home).filter((n) => !n.consumed).length, 0, 'same session after consumption: nothing new');

      // A new session is told again.
      spawnGuard(home, { payload: sessionStart(home, 'sess-b') });
      assert.equal(queued(home).filter((n) => !n.consumed).length, 1, 'new session: one');
      // Another new session before anyone read it: no second pending notice.
      spawnGuard(home, { payload: sessionStart(home, 'sess-c') });
      assert.equal(queued(home).filter((n) => !n.consumed).length, 1, 'never two pending');
    });
  });

  it('6c. the pointer release enabled -> one info notice without the double-gate warning', () => {
    withHome({ devflow: { version: '3.0.0', enabled: true } }, ({ home }) => {
      spawnGuard(home);
      const list = queued(home);
      assert.equal(list.length, 1);
      assert.equal(list[0].level, 'info');
      assert.match(list[0].message, /3\.0\.0/);
      assert.doesNotMatch(list[0].message, /twice/);
      assert.ok(list[0].message.includes('claude plugin disable devflow@aocyber'));
    });
  });

  it('7. disabled or absent -> no notice', () => {
    for (const opts of [{ devflow: { version: '2.15.0', enabled: false } }, {}, { aoforge: null }]) {
      withHome(opts, ({ home }) => {
        spawnGuard(home);
        assert.equal(fs.existsSync(globalFile(home)), false, JSON.stringify(opts));
      });
    }
  });

  it('8. corrupt installed_plugins.json -> no notice, exit 0', () => {
    withHome({ corrupt: true, devflow: { version: '2.15.0' } }, ({ home }) => {
      spawnGuard(home);
      assert.equal(fs.existsSync(globalFile(home)), false);
    });
  });

  it('9. AOFORGE_SKIP_COEXISTENCE=1 (or the legacy prefix) -> nothing written', () => {
    for (const env of [{ AOFORGE_SKIP_COEXISTENCE: '1' }, { DEVFLOW_SKIP_COEXISTENCE: '1' }]) {
      withHome(ENABLED, ({ home }) => {
        spawnGuard(home, { env });
        assert.equal(fs.existsSync(globalFile(home)), false, JSON.stringify(env));
      });
    }
  });

  it('9. in process: the skip returns before the detector is called', () => {
    const guard = require('./coexistence-guard.js');
    let calls = 0;
    const detect = () => {
      calls += 1;
      throw new Error('the detector must not run when skipped');
    };
    const result = guard.run({ env: { AOFORGE_SKIP_COEXISTENCE: '1' }, home: '/nonexistent-home', payload: {}, detect });
    assert.equal(result.status, 'skip');
    assert.equal(calls, 0);

    const legacy = guard.run({ env: { DEVFLOW_SKIP_COEXISTENCE: '1' }, home: '/nonexistent-home', payload: {}, detect });
    assert.equal(legacy.status, 'skip');
    assert.equal(calls, 0);
  });

  it('9b. malformed stdin still queues; an unparseable notices file is left alone', () => {
    withHome(ENABLED, ({ home }) => {
      spawnGuard(home, { input: 'not json' });
      assert.equal(queued(home).length, 1);
    });
    withHome(ENABLED, ({ home }) => {
      spawnGuard(home, { input: '' });
      assert.equal(queued(home).length, 1);
    });
    withHome(ENABLED, ({ home }) => {
      const file = globalFile(home);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '{ broken');
      spawnGuard(home);
      assert.equal(fs.readFileSync(file, 'utf8'), '{ broken');
    });
  });
});

function withLeftover(opts, fn) {
  const h = leftoverHome(opts);
  try {
    return fn(h);
  } finally {
    h.cleanup();
  }
}

describe('coexistence-guard: every global leftover in one notice (TRD 78-06)', () => {
  it('1. a DEVFLOW_* variable alone -> one notice naming it, its AOFORGE_* form and "no longer read"; once per session', () => {
    withLeftover({}, ({ home }) => {
      const env = { DEVFLOW_SKIP_EDIT_GATE: '1' };
      const r = spawnGuard(home, { payload: sessionStart(home, 'sess-env'), env });
      assert.equal(r.stderr, '');
      const list = queued(home);
      assert.equal(list.length, 1, JSON.stringify(list));
      const [n] = list;
      assert.equal(n.source, 'coexistence-guard');
      assert.equal(n.key, 'coexistence:sess-env');
      assert.equal(n.level, 'action');
      assert.ok(n.message.includes('DEVFLOW_SKIP_EDIT_GATE'), n.message);
      assert.ok(n.message.includes('AOFORGE_SKIP_EDIT_GATE'), n.message);
      assert.match(n.message, /no longer read/);
      assert.equal(n.message.includes('\n'), false, 'one line');
      assert.equal(n.detail, null, 'one finding: the message says it all');

      spawnGuard(home, { payload: sessionStart(home, 'sess-env', 'resume'), env });
      assert.equal(queued(home).length, 1, 'the same session queues nothing more');
    });
  });

  it('2. the pre-rename runtime home without the marker -> named with the 3.0.x path; with the marker -> no notice', () => {
    withLeftover({ legacyRuntime: true }, ({ home }) => {
      spawnGuard(home);
      const list = queued(home);
      assert.equal(list.length, 1, JSON.stringify(list));
      assert.ok(list[0].message.includes('~/.claude/devflow/'), list[0].message);
      assert.ok(list[0].message.includes('AOForge 3.0.x'), list[0].message);
      assert.match(list[0].message, /no longer migrates it/);
      assert.equal(list[0].level, 'action');
    });
    withLeftover({ legacyRuntime: true, migrated: true }, ({ home }) => {
      spawnGuard(home);
      assert.equal(fs.existsSync(globalFile(home)), false, 'migrated under 3.0.x: quiet (doctor check 16 reports the leftover)');
    });
  });

  it('3. ~/.aoforge/defaults.json -> the notice names the doctor fix', () => {
    withLeftover({ interimFiles: ['defaults.json'] }, ({ home }) => {
      spawnGuard(home);
      const list = queued(home);
      assert.equal(list.length, 1, JSON.stringify(list));
      assert.ok(list[0].message.includes('defaults.json'), list[0].message);
      assert.ok(list[0].message.includes('aof-tools doctor --global --fix'), list[0].message);
      assert.match(list[0].message, /no longer reads them there/);
    });
  });

  it('4. nothing at all -> no notice', () => {
    withLeftover({}, ({ home }) => {
      spawnGuard(home);
      assert.equal(fs.existsSync(globalFile(home)), false);
    });
    withLeftover({ interimFiles: ['notes.txt', 'STATE.md'] }, ({ home }) => {
      spawnGuard(home);
      assert.equal(fs.existsSync(globalFile(home)), false, 'only files AOForge 3.0.0 wrote count');
    });
  });

  it('5. several findings -> exactly one notice: a one-line message and one detail line per finding', () => {
    withLeftover({ devflowEnabled: true, legacyRuntime: true, interimFiles: ['defaults.json'] }, ({ home }) => {
      spawnGuard(home, { env: { DEVFLOW_SKIP_UPGRADE: '1' } });
      const list = queued(home);
      assert.equal(list.length, 1, JSON.stringify(list));
      const [n] = list;
      assert.equal(n.level, 'action');
      assert.equal(n.message.includes('\n'), false, 'one line');
      assert.match(n.message, /4 leftovers/);
      const lines = String(n.detail).split('\n');
      assert.equal(lines.length, 4, n.detail);
      assert.ok(lines[0].includes('claude plugin disable devflow@aocyber'), lines[0]);
      assert.ok(lines[1].includes('DEVFLOW_SKIP_UPGRADE') && lines[1].includes('AOFORGE_SKIP_UPGRADE'), lines[1]);
      assert.ok(lines[2].includes('~/.claude/devflow/'), lines[2]);
      assert.ok(lines[3].includes('aof-tools doctor --global --fix'), lines[3]);

      const rendered = notices.renderNotices(list);
      assert.ok(rendered.includes('DEVFLOW_SKIP_UPGRADE'), 'route-results shows the detail lines');
    });
  });

  it('5. the pointer plugin beside a DEVFLOW_* variable -> level action (info only when the pointer is the sole finding)', () => {
    withLeftover({}, ({ home }) => {
      const guard = require('./coexistence-guard.js');
      const detect = () => ({ installed: true, enabled: true, version: '3.0.0', pointer: true });
      const r = guard.run({ env: { DEVFLOW_SKIP_UPGRADE: '1' }, home, payload: { session_id: 's-ptr' }, detect });
      assert.equal(r.status, 'queued');
      assert.equal(r.notice.level, 'action');
      assert.equal(String(r.notice.detail).split('\n').length, 2);
    });
  });

  it('5. in process: nothing found -> status nothing, no file', () => {
    withLeftover({}, ({ home }) => {
      const guard = require('./coexistence-guard.js');
      const r = guard.run({ env: { PATH: '/usr/bin' }, home, payload: { session_id: 's-none' } });
      assert.equal(r.status, 'nothing');
      assert.equal(fs.existsSync(globalFile(home)), false);
    });
  });
});
