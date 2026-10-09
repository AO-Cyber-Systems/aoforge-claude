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

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.join(__dirname, 'coexistence-guard.js');
const LIB = path.join(__dirname, '..', 'aoforge', 'bin', 'lib');
const { pluginHome } = require(path.join(LIB, '__fixtures__', 'legacy-plugin-fixtures.cjs'));
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
