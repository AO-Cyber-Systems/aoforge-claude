'use strict';

/**
 * TRD 73-05: tests for watcher-attend.cjs, the attended-terminal pieces of the
 * foreground daemon:
 *
 *   createSessionHandle({ makeSession, log })
 *     A facade over a ShellSession that respawns a dead shell before the next
 *     dispatch (a dispatch timeout kills the shell, and before this TRD every
 *     later record then failed with ShellSessionClosed). It forwards every other
 *     method, with all its arguments, to the current shell.
 *
 *   attachTerminal(handle, { input, output, log })
 *     For the length of each dispatch, mirrors the command's live output to the
 *     user's terminal and forwards the keys typed there to the command. Outside
 *     a dispatch the terminal is left alone. The daemon never logs, stores or
 *     echoes the forwarded keys.
 *
 * Everything here runs in-process on fakes written out by hand. The fakes only
 * record what they are called with; they have no logic of their own beyond
 * "a dead session rejects a dispatch", which is what the real ShellSession does.
 * The end-to-end test under a real PTY lives in aoforge-watch.test.cjs.
 *
 * The module is required lazily so that, before it exists, every test fails on
 * its own "Cannot find module" rather than the whole file failing to load.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

const attend = () => require('./watcher-attend.cjs');

// ---------------------------------------------------------------------------
// Hand-built fakes
// ---------------------------------------------------------------------------

/**
 * A ShellSession stand-in. `calls` is the ordered record of every method call
 * and its arguments. `alive` is flipped by the test to model a dead shell.
 */
function fakeSession({ alive = true, onDispatch, failSpawn = false } = {}) {
  const s = {
    calls: [],
    alive,
    listeners: [],
    async spawn() {
      s.calls.push(['spawn']);
      if (failSpawn) throw new Error('spawn failed');
    },
    isAlive() { return s.alive; },
    async dispatch(id, cmd, opts) {
      s.calls.push(['dispatch', id, cmd, opts]);
      if (!s.alive) throw new Error('shell session closed');
      if (onDispatch) return onDispatch(s, id, cmd, opts);
      return { stdout: '', stderr: '', exit_code: 0, status: 'done' };
    },
    async kill() {
      s.calls.push(['kill']);
      s.alive = false;
    },
    attachDataListener(fn, opts) {
      s.calls.push(['attachDataListener', fn, opts]);
      s.listeners.push({ fn, opts });
    },
    detachDataListener(fn) {
      s.calls.push(['detachDataListener', fn]);
      s.listeners = s.listeners.filter((l) => l.fn !== fn);
    },
    injectInput(str) {
      s.calls.push(['injectInput', str]);
    },
    probe(...args) {
      s.calls.push(['probe', ...args]);
      return 'probed';
    },
    // What the real session does while the command runs: hands chunks of the
    // command's live window to every live-only listener.
    emitLive(chunk) {
      for (const l of s.listeners) if (l.opts && l.opts.liveOnly) l.fn(chunk);
    },
    callsTo(name) { return s.calls.filter((c) => c[0] === name); },
  };
  return s;
}

/** makeSession that hands out the given sessions in order and counts them. */
function factoryOf(...sessions) {
  const made = [];
  const queue = sessions.slice();
  return {
    made,
    makeSession() {
      const next = queue.shift();
      if (!next) throw new Error('makeSession called more often than the test planned');
      made.push(next);
      return next;
    },
  };
}

function fakeInput({ isTTY = true, throwOnRaw = false } = {}) {
  const e = new EventEmitter();
  e.isTTY = isTTY;
  e.rawModes = [];
  e.pauses = 0;
  e.resumes = 0;
  e.setRawMode = (on) => {
    if (throwOnRaw) throw new Error('setRawMode failed');
    e.rawModes.push(on);
  };
  e.pause = () => { e.pauses += 1; };
  e.resume = () => { e.resumes += 1; };
  return e;
}

function fakeOutput({ throwOnWrite = false } = {}) {
  const o = {
    writes: [],
    write(chunk) {
      if (throwOnWrite) throw new Error('EPIPE');
      o.writes.push(String(chunk));
      return true;
    },
    text() { return o.writes.join(''); },
  };
  return o;
}

function fakeLog() {
  const calls = [];
  const fn = (level, msg) => { calls.push({ level, msg: String(msg) }); };
  fn.calls = calls;
  fn.text = () => calls.map((c) => `${c.level} ${c.msg}`).join('\n');
  return fn;
}

// ---------------------------------------------------------------------------
// createSessionHandle (TRD test items 6 and 7)
// ---------------------------------------------------------------------------

describe('73-05 createSessionHandle: respawn', () => {
  test('SH-1: spawn() makes and spawns exactly one session; dispatch delegates', async () => {
    const inner = fakeSession();
    const f = factoryOf(inner);
    const handle = attend().createSessionHandle({ makeSession: f.makeSession, log: fakeLog() });

    await handle.spawn();
    assert.equal(f.made.length, 1);
    assert.deepEqual(inner.callsTo('spawn'), [['spawn']]);

    const result = await handle.dispatch('h-1', 'echo hi', { timeout_ms: 1234 });
    assert.deepEqual(result, { stdout: '', stderr: '', exit_code: 0, status: 'done' });
    assert.deepEqual(inner.callsTo('dispatch'), [['dispatch', 'h-1', 'echo hi', { timeout_ms: 1234 }]]);
    assert.equal(f.made.length, 1, 'a live shell is not replaced');
  });

  test('SH-2: a dead shell is replaced before the next dispatch, and the log says "respawned shell"', async () => {
    const first = fakeSession();
    const second = fakeSession();
    const f = factoryOf(first, second);
    const log = fakeLog();
    const handle = attend().createSessionHandle({ makeSession: f.makeSession, log });

    await handle.spawn();
    first.alive = false; // what a dispatch timeout does to the real session

    const result = await handle.dispatch('h-2', 'echo again', {});
    assert.equal(result.status, 'done');
    assert.equal(f.made.length, 2);
    assert.deepEqual(second.callsTo('spawn'), [['spawn']], 'the replacement is spawned');
    assert.equal(second.callsTo('dispatch').length, 1, 'the dispatch ran on the replacement');
    assert.equal(first.callsTo('dispatch').length, 0, 'and not on the dead shell');
    assert.deepEqual(first.callsTo('kill'), [['kill']], 'the dead session is cleaned up (its script directory)');
    assert.ok(
      log.calls.some((c) => /respawned shell/.test(c.msg)),
      `expected a "respawned shell" log line, got: ${log.text()}`,
    );
  });

  test('SH-3: a live shell is never replaced and nothing is logged about it', async () => {
    const inner = fakeSession();
    const f = factoryOf(inner);
    const log = fakeLog();
    const handle = attend().createSessionHandle({ makeSession: f.makeSession, log });
    await handle.spawn();
    await handle.dispatch('a', 'echo 1', {});
    await handle.dispatch('b', 'echo 2', {});
    assert.equal(f.made.length, 1);
    assert.equal(log.calls.length, 0);
  });

  test('SH-4: after kill() no new session is ever made, even for a dead shell', async () => {
    const inner = fakeSession();
    const f = factoryOf(inner); // a second makeSession() call would throw
    const handle = attend().createSessionHandle({ makeSession: f.makeSession, log: fakeLog() });
    await handle.spawn();

    await handle.kill();
    assert.deepEqual(inner.callsTo('kill'), [['kill']]);
    assert.equal(inner.alive, false);

    await assert.rejects(() => handle.dispatch('late', 'echo late', {}), /closed/);
    assert.equal(f.made.length, 1, 'shutdown must not respawn a shell');
  });

  test('SH-5: a failed respawn rejects that dispatch, leaves the dead shell in place and retries on the next one', async () => {
    const first = fakeSession();
    const broken = fakeSession({ failSpawn: true });
    const third = fakeSession();
    const f = factoryOf(first, broken, third);
    const handle = attend().createSessionHandle({ makeSession: f.makeSession, log: fakeLog() });
    await handle.spawn();
    first.alive = false;

    await assert.rejects(() => handle.dispatch('x', 'echo x', {}), /spawn failed/);
    assert.equal(f.made.length, 2);

    const result = await handle.dispatch('y', 'echo y', {});
    assert.equal(result.status, 'done');
    assert.equal(f.made.length, 3, 'the next dispatch tries again');
    assert.equal(third.callsTo('dispatch').length, 1);
  });

  test('SH-6: a dispatch before spawn() makes the first session without logging a respawn', async () => {
    const inner = fakeSession();
    const f = factoryOf(inner);
    const log = fakeLog();
    const handle = attend().createSessionHandle({ makeSession: f.makeSession, log });
    const result = await handle.dispatch('first', 'echo first', {});
    assert.equal(result.status, 'done');
    assert.equal(f.made.length, 1);
    assert.equal(log.calls.filter((c) => /respawned/.test(c.msg)).length, 0);
  });
});

describe('73-05 createSessionHandle: forwarding', () => {
  test('FW-1: attachDataListener(fn, { liveOnly: true }) reaches the session with both arguments', async () => {
    const inner = fakeSession();
    const f = factoryOf(inner);
    const handle = attend().createSessionHandle({ makeSession: f.makeSession, log: fakeLog() });
    await handle.spawn();

    const fn = () => {};
    handle.attachDataListener(fn, { liveOnly: true });
    assert.deepEqual(inner.callsTo('attachDataListener'), [['attachDataListener', fn, { liveOnly: true }]]);

    handle.detachDataListener(fn);
    assert.deepEqual(inner.callsTo('detachDataListener'), [['detachDataListener', fn]]);
  });

  test('FW-2: an unknown method is forwarded with every argument and its return value', async () => {
    const inner = fakeSession();
    const f = factoryOf(inner);
    const handle = attend().createSessionHandle({ makeSession: f.makeSession, log: fakeLog() });
    await handle.spawn();

    assert.equal(handle.probe(1, 'two', { three: 3 }), 'probed');
    assert.deepEqual(inner.callsTo('probe'), [['probe', 1, 'two', { three: 3 }]]);
    assert.equal(typeof handle.attachDataListener, 'function');
    assert.equal(typeof handle.injectInput, 'function');
  });

  test('FW-3: injectInput reaches the CURRENT session, including after a respawn', async () => {
    const first = fakeSession();
    const second = fakeSession();
    const f = factoryOf(first, second);
    const handle = attend().createSessionHandle({ makeSession: f.makeSession, log: fakeLog() });
    await handle.spawn();

    handle.injectInput('x');
    assert.deepEqual(first.callsTo('injectInput'), [['injectInput', 'x']]);

    first.alive = false;
    await handle.dispatch('r', 'echo r', {});
    handle.injectInput('y');
    assert.deepEqual(second.callsTo('injectInput'), [['injectInput', 'y']]);
    assert.deepEqual(first.callsTo('injectInput'), [['injectInput', 'x']], 'nothing more for the dead shell');
  });

  test('FW-4: listeners attached before a respawn follow the handle to the new shell', async () => {
    // processOnce attaches its prompt detector BEFORE it calls dispatch. If the
    // dispatch then respawns, a detector left on the dead session would never
    // see a byte of the command that needs it.
    const first = fakeSession();
    const second = fakeSession();
    const f = factoryOf(first, second);
    const handle = attend().createSessionHandle({ makeSession: f.makeSession, log: fakeLog() });
    await handle.spawn();

    const keep = () => {};
    const dropped = () => {};
    handle.attachDataListener(keep, { liveOnly: true });
    handle.attachDataListener(dropped);
    handle.detachDataListener(dropped);
    first.alive = false;

    await handle.dispatch('m', 'echo m', {});
    assert.deepEqual(
      second.callsTo('attachDataListener'),
      [['attachDataListener', keep, { liveOnly: true }]],
      'the still-attached listener is re-attached with its options; the detached one is not',
    );
  });

  test('FW-5: the handle is not a thenable, so awaiting it cannot swallow it', () => {
    const f = factoryOf(fakeSession());
    const handle = attend().createSessionHandle({ makeSession: f.makeSession, log: fakeLog() });
    assert.equal(handle.then, undefined);
  });
});

// ---------------------------------------------------------------------------
// attachTerminal (TRD test items 8 to 11)
// ---------------------------------------------------------------------------

async function attended({ input, output, log, onDispatch } = {}) {
  const inner = fakeSession({ onDispatch });
  const f = factoryOf(inner);
  const handle = attend().createSessionHandle({ makeSession: f.makeSession, log: log || fakeLog() });
  await handle.spawn();
  const detach = attend().attachTerminal(handle, {
    input: input || fakeInput(),
    output: output || fakeOutput(),
    log: log || fakeLog(),
  });
  return { inner, handle, detach };
}

describe('73-05 attachTerminal: one dispatch', () => {
  test('AT-1: frames the dispatch, mirrors live output verbatim, forwards keys, and restores everything', async () => {
    const input = fakeInput();
    const output = fakeOutput();
    const seen = {};
    const { inner, handle } = await attended({
      input,
      output,
      onDispatch: async (s) => {
        // Mid-dispatch state: this is what the user's terminal looks like while
        // the command runs.
        seen.rawModes = input.rawModes.slice();
        seen.dataListeners = input.listenerCount('data');
        seen.attach = s.callsTo('attachDataListener');
        s.emitLive('Your name: ');
        s.emitLive('\x1b[1mbold\x1b[0m\r\n');
        input.emit('data', Buffer.from('ada\r'));
        seen.output = output.text();
        return { stdout: 'hello ada\n', stderr: '', exit_code: 0, status: 'done' };
      },
    });

    const result = await handle.dispatch('h-8', "bash -c 'read N'", {});
    assert.equal(result.status, 'done');

    // start line: id, command, terminal bell
    const text = output.text();
    assert.match(text, /h-8/);
    assert.ok(text.includes("bash -c 'read N'"), 'the start line names the command');
    assert.ok(text.includes('\x07'), 'the start line rings the terminal bell');
    assert.ok(text.indexOf('\x07') < text.indexOf('Your name: '), 'the start line comes before the output');

    // during the dispatch
    assert.deepEqual(seen.rawModes, [true], 'raw mode is on while the command runs');
    assert.equal(seen.dataListeners, 1, 'one data listener on the input');
    assert.equal(seen.attach.length, 1);
    assert.equal(typeof seen.attach[0][1], 'function');
    assert.deepEqual(seen.attach[0][2], { liveOnly: true }, 'the mirror asks for the live window only');
    assert.ok(seen.output.includes('Your name: '), 'the live chunk was mirrored');
    assert.ok(
      seen.output.includes('\x1b[1mbold\x1b[0m\r\n'),
      'live chunks are written to the terminal verbatim',
    );
    assert.deepEqual(inner.callsTo('injectInput'), [['injectInput', 'ada\r']], 'the typed key reached the command');

    // after the dispatch
    assert.deepEqual(input.rawModes, [true, false], 'raw mode is switched off again');
    assert.equal(input.listenerCount('data'), 0, 'the key forwarder is removed');
    assert.equal(inner.listeners.length, 0, 'the mirror listener is detached');
    assert.match(text, /h-8 finished: done \(exit 0\)/, 'the end line names status and exit code');

    // after the end, typing reaches nothing
    input.emit('data', Buffer.from('late\r'));
    assert.equal(inner.callsTo('injectInput').length, 1, 'no key is forwarded outside a dispatch');
  });

  test('AT-2: the terminal is left alone outside a dispatch', async () => {
    const input = fakeInput();
    const output = fakeOutput();
    const { inner } = await attended({ input, output });
    assert.deepEqual(input.rawModes, []);
    assert.equal(input.listenerCount('data'), 0);
    assert.equal(output.writes.length, 0);
    input.emit('data', Buffer.from('idle'));
    assert.equal(inner.callsTo('injectInput').length, 0);
  });

  test('AT-3: a dispatch that rejects still restores raw mode and removes the listeners', async () => {
    const input = fakeInput();
    const output = fakeOutput();
    const { inner, handle } = await attended({
      input,
      output,
      onDispatch: async () => { throw new Error('dispatch exploded'); },
    });

    await assert.rejects(() => handle.dispatch('h-9', 'echo boom', {}), /dispatch exploded/);
    assert.deepEqual(input.rawModes, [true, false]);
    assert.equal(input.listenerCount('data'), 0);
    assert.equal(inner.listeners.length, 0);
    assert.match(output.text(), /h-9 finished: error/, 'the end line still appears, with a status');
  });

  test('AT-4: keys typed during a dispatch never appear in a log call or in the output', async () => {
    const SECRETISH = 'hunter2-not-a-secret';
    const input = fakeInput();
    const output = fakeOutput();
    const log = fakeLog();
    const { inner, handle } = await attended({
      input,
      output,
      log,
      onDispatch: async (s) => {
        input.emit('data', Buffer.from(`${SECRETISH}\r`));
        return { stdout: '', stderr: '', exit_code: 0, status: 'done' };
      },
    });

    await handle.dispatch('h-10', 'echo ok', {});
    assert.deepEqual(inner.callsTo('injectInput'), [['injectInput', `${SECRETISH}\r`]], 'they were forwarded');
    assert.ok(!log.text().includes(SECRETISH), `the log must not hold the keys: ${log.text()}`);
    assert.ok(!output.text().includes(SECRETISH), 'and the daemon does not echo them');
  });

  test('AT-5: an output that throws on write never fails the dispatch', async () => {
    const input = fakeInput();
    const output = fakeOutput({ throwOnWrite: true });
    const { handle } = await attended({
      input,
      output,
      onDispatch: async (s) => {
        s.emitLive('prompt: '); // the mirror's write throws; the session must not see it
        return { stdout: 'ok\n', stderr: '', exit_code: 0, status: 'done' };
      },
    });
    const result = await handle.dispatch('h-11', 'echo ok', {});
    assert.equal(result.status, 'done');
    assert.deepEqual(input.rawModes, [true, false]);
  });

  test('AT-6: an input whose setRawMode throws never fails the dispatch', async () => {
    const input = fakeInput({ throwOnRaw: true });
    const output = fakeOutput();
    const log = fakeLog();
    const { inner, handle } = await attended({
      input,
      output,
      log,
      onDispatch: async () => {
        input.emit('data', Buffer.from('y'));
        return { stdout: '', stderr: '', exit_code: 0, status: 'done' };
      },
    });
    const result = await handle.dispatch('h-12', 'echo ok', {});
    assert.equal(result.status, 'done');
    assert.equal(input.listenerCount('data'), 0, 'listeners are still removed');
    assert.deepEqual(inner.callsTo('injectInput'), [['injectInput', 'y']], 'keys are still forwarded');
  });

  test('AT-7: a non-TTY input is not put into raw mode', async () => {
    const input = fakeInput({ isTTY: false });
    const output = fakeOutput();
    const { handle } = await attended({ input, output });
    await handle.dispatch('h-13', 'echo ok', {});
    assert.deepEqual(input.rawModes, []);
  });

  test('AT-8: a multi-byte character split across two chunks is forwarded whole', async () => {
    const input = fakeInput();
    const { inner, handle } = await attended({
      input,
      onDispatch: async () => {
        const bytes = Buffer.from('é', 'utf8'); // 0xC3 0xA9
        input.emit('data', bytes.subarray(0, 1));
        input.emit('data', bytes.subarray(1));
        return { stdout: '', stderr: '', exit_code: 0, status: 'done' };
      },
    });
    await handle.dispatch('h-14', 'echo ok', {});
    const sent = inner.callsTo('injectInput').map((c) => c[1]).join('');
    assert.equal(sent, 'é');
  });

  test('AT-9: control characters in the command never reach the terminal as control characters', async () => {
    const output = fakeOutput();
    const { handle } = await attended({ output });
    await handle.dispatch('h-15', "echo \x1b[2J\x1b]0;pwned\x07 done\nsecond", {});
    const text = output.text();
    // The only escape-class bytes in the start/end framing are the bell we ring
    // on purpose and the CR/LF we frame with.
    const stripped = text.replace(/\x07/, '').replace(/\r\n/g, '');
    assert.ok(!/[\x00-\x1f\x7f-\x9f]/.test(stripped), `framing leaked a control character: ${JSON.stringify(text)}`);
    assert.equal(text.split('\x07').length - 1, 1, 'exactly one bell');
  });

  test('AT-10: the returned detach function removes the terminal for later dispatches', async () => {
    const input = fakeInput();
    const output = fakeOutput();
    const { handle, detach } = await attended({ input, output });
    detach();
    await handle.dispatch('h-16', 'echo ok', {});
    assert.deepEqual(input.rawModes, []);
    assert.equal(output.writes.length, 0);
  });

  test('AT-11: two dispatches in a row each get their own frame and a clean terminal', async () => {
    const input = fakeInput();
    const output = fakeOutput();
    const { inner, handle } = await attended({ input, output });
    await handle.dispatch('one', 'echo 1', {});
    await handle.dispatch('two', 'echo 2', {});
    assert.deepEqual(input.rawModes, [true, false, true, false]);
    assert.equal(input.listenerCount('data'), 0);
    assert.equal(inner.listeners.length, 0);
    const text = output.text();
    assert.match(text, /one finished: done \(exit 0\)/);
    assert.match(text, /two finished: done \(exit 0\)/);
  });

  test('AT-12: the mirror follows a respawn: the second shell gets the live-only listener too', async () => {
    const first = fakeSession();
    const second = fakeSession({
      onDispatch: async (s) => {
        s.emitLive('from the new shell');
        return { stdout: '', stderr: '', exit_code: 0, status: 'done' };
      },
    });
    const f = factoryOf(first, second);
    const handle = attend().createSessionHandle({ makeSession: f.makeSession, log: fakeLog() });
    await handle.spawn();
    const output = fakeOutput();
    attend().attachTerminal(handle, { input: fakeInput(), output, log: fakeLog() });
    first.alive = false;

    await handle.dispatch('h-17', 'echo ok', {});
    assert.ok(output.text().includes('from the new shell'));
    assert.equal(second.listeners.length, 0, 'and it is detached again afterwards');
  });
});
