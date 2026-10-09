'use strict';

/**
 * watcher-attend — the attended-terminal pieces of the foreground watcher
 * (TRD 73-05, HND-03).
 *
 * The daemon runs a queued command in its OWN pseudo-terminal, and until now
 * nobody could see or answer that terminal. A command that is gated *because*
 * it prompts (ssh-keygen's passphrase, `doctl auth init`'s token, `gh auth
 * login`'s questions) waited on a prompt no one saw until the ten-minute
 * timeout, which then killed the daemon's shell for every later command too.
 *
 * `aoforge-watch start --foreground` runs in the user's own terminal. These two
 * functions attach that terminal to each dispatch, so the user runs the TTY
 * command and answers it themselves; AOForge never types or reads a secret:
 *
 *   createSessionHandle({ makeSession, log })
 *     A facade over a ShellSession. It is the `session` that runLoop and
 *     processOnce receive. It forwards every ShellSession method, with all its
 *     arguments, to the CURRENT shell, and it replaces a shell that died (a
 *     dispatch timeout kills it; it can also simply exit) before the next
 *     dispatch, so one dead shell no longer fails every later record with
 *     ShellSessionClosed. After kill() it never respawns: shutdown stays
 *     shutdown. Listeners attached through the handle follow it to the new shell,
 *     because processOnce attaches its prompt detector BEFORE it calls dispatch.
 *
 *   attachTerminal(handle, { input, output, log })
 *     Installs the handle's dispatch hooks. For the length of one dispatch it
 *       - frames the command: a start line (id, command, the terminal bell) and
 *         an end line (status and exit code), neither of which prints input;
 *       - mirrors the command's live output to `output`, through
 *         `attachDataListener(fn, { liveOnly: true })`, so the user sees exactly
 *         what the command prints and never a sentinel;
 *       - puts `input` in raw mode and forwards every key to the command, so a
 *         prompt is answered by the person at the keyboard. Ctrl+C is the byte
 *         \x03 in raw mode: it goes to the command (exit 130) and the daemon
 *         keeps running.
 *     Outside a dispatch the terminal is left in its normal mode, where Ctrl+C
 *     is a SIGINT that stops the daemon as before.
 *
 * What is never done: the forwarded keys are not logged, stored, buffered to
 * disk or echoed. They are forwarded and forgotten. The PTY keeps echo off, which
 * is why typed input never lands in a done record; a tool that wants echo turns it
 * on itself.
 *
 * Terminal I/O failures (a closed output, a raw mode that cannot be set) never
 * fail a dispatch: the user loses their view of the command, not the command.
 */

const { StringDecoder } = require('string_decoder');

/** Longest command text shown in the start line. */
const MAX_CMD_SHOWN = 200;

// Control characters (C0, DEL, C1) and the Unicode line/paragraph separators and
// bidirectional overrides. A command comes from a record on disk; it must never
// be able to move the cursor, retitle the window or reorder the text in the
// user's terminal through the framing lines.
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

function printable(value, max) {
  let s = String(value).replace(UNSAFE_TEXT, ' ');
  if (max && s.length > max) s = s.slice(0, max) + '...';
  return s;
}

// ---------------------------------------------------------------------------
// createSessionHandle
// ---------------------------------------------------------------------------

/**
 * @param {object}   opts
 * @param {() => object} opts.makeSession — builds a NEW, unspawned ShellSession
 * @param {(level: string, msg: string) => void} [opts.log]
 * @returns {object} a ShellSession-shaped facade (see the header)
 */
function createSessionHandle({ makeSession, log } = {}) {
  if (typeof makeSession !== 'function') {
    throw new TypeError('createSessionHandle: makeSession must be a function');
  }
  const logFn = typeof log === 'function' ? log : () => {};

  let current = null;     // the live (or last) inner session
  let stopping = false;   // set by kill(): no respawn from here on
  let replacing = null;   // promise of an in-flight make-and-spawn, if any
  let hooks = null;       // { onStart(id, cmd), onEnd(id, result) } from attachTerminal
  const registered = [];  // listeners attached through the handle: { fn, opts }

  /** Make a session, spawn it, and hand it every listener attached so far. */
  async function startSession() {
    const next = makeSession();
    try {
      await next.spawn();
    } catch (e) {
      // A half-spawned session may hold a script directory or a process.
      try { await next.kill(); } catch { /* best effort */ }
      throw e;
    }
    for (const l of registered) next.attachDataListener(l.fn, l.opts);
    return next;
  }

  /** Make sure a live shell exists, replacing a dead one. No-op once stopping. */
  async function ensureLive() {
    if (stopping) return;
    if (current && current.isAlive()) return;
    if (!replacing) {
      const old = current;
      replacing = (async () => {
        const next = await startSession(); // a failure leaves `current` as it was
        current = next;
        if (old) {
          logFn('info', 'respawned shell');
          // The dead shell may still own a script directory; kill() is idempotent.
          try { await old.kill(); } catch { /* best effort */ }
        }
      })().finally(() => { replacing = null; });
    }
    await replacing;
  }

  async function spawn() {
    if (current) throw new Error('already spawned');
    current = await startSession();
  }

  async function dispatch(id, cmd, opts) {
    await ensureLive();
    if (!current) throw new Error('shell session closed');
    const h = hooks; // the pair that starts this dispatch is the pair that ends it
    if (h) { try { h.onStart(id, cmd); } catch { /* terminal trouble never fails a dispatch */ } }
    let result;
    let failure = null;
    try {
      result = await current.dispatch(id, cmd, opts);
      return result;
    } catch (e) {
      failure = e;
      throw e;
    } finally {
      if (h) {
        try {
          h.onEnd(id, failure ? { status: 'error', exit_code: null, error: failure } : result);
        } catch { /* as above */ }
      }
    }
  }

  async function kill() {
    stopping = true;
    if (replacing) { try { await replacing; } catch { /* nothing to kill */ } }
    if (current) await current.kill();
  }

  function attachDataListener(fn, opts) {
    if (typeof fn !== 'function') return;
    registered.push({ fn, opts });
    if (current) current.attachDataListener(fn, opts);
  }

  function detachDataListener(fn) {
    for (let i = registered.length - 1; i >= 0; i--) {
      if (registered[i].fn === fn) registered.splice(i, 1);
    }
    if (current) current.detachDataListener(fn);
  }

  function setDispatchHooks(next) {
    hooks = next || null;
  }

  const own = {
    spawn, dispatch, kill, attachDataListener, detachDataListener, setDispatchHooks,
  };

  // Everything that is not overridden above is forwarded to whichever shell is
  // current AT CALL TIME, with every argument, so methods added to ShellSession
  // later reach the shell without a change here.
  return new Proxy(own, {
    get(target, prop) {
      if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
      if (typeof prop === 'symbol' || !current) return undefined;
      const value = current[prop];
      return typeof value === 'function' ? (...args) => current[prop](...args) : value;
    },
  });
}

// ---------------------------------------------------------------------------
// attachTerminal
// ---------------------------------------------------------------------------

/**
 * @param {object} handle — from createSessionHandle
 * @param {object} opts
 * @param {object} opts.input  — the user's keyboard (process.stdin)
 * @param {object} opts.output — the user's screen (process.stdout)
 * @param {(level: string, msg: string) => void} [opts.log]
 * @returns {() => void} detach: removes the terminal from later dispatches
 */
function attachTerminal(handle, { input, output, log } = {}) {
  if (!handle || typeof handle.setDispatchHooks !== 'function') {
    throw new TypeError('attachTerminal: handle must come from createSessionHandle');
  }
  const logFn = typeof log === 'function' ? log : () => {};

  // One warning per kind per attachment, so a closed pipe cannot flood the log.
  // Only the error's own message is logged: no chunk, no key, no command output.
  const warned = new Set();
  function warnOnce(what, e) {
    if (warned.has(what)) return;
    warned.add(what);
    logFn('warn', `attended terminal: ${what} failed: ${e && e.message ? e.message : String(e)}`);
  }

  function write(text) {
    try { output.write(text); } catch (e) { warnOnce('write', e); }
  }

  const canRaw = () => !!(input && input.isTTY && typeof input.setRawMode === 'function');

  let active = null; // the dispatch in progress: { mirror, forward }

  function restore(st) {
    // Order matters: stop forwarding first, so a key typed from here on reaches
    // nothing; then give the terminal back; then stop mirroring.
    try { input.removeListener('data', st.forward); } catch (e) { warnOnce('input', e); }
    if (canRaw()) {
      try { input.setRawMode(false); } catch (e) { warnOnce('raw mode', e); }
    }
    try { if (typeof input.pause === 'function') input.pause(); } catch (e) { warnOnce('input', e); }
    try { handle.detachDataListener(st.mirror); } catch (e) { warnOnce('mirror', e); }
  }

  function onStart(id, cmd) {
    if (active) { restore(active); active = null; } // a dispatch never nests; be safe

    write(
      `\r\n\x07[aoforge-watch] ${printable(id)}: ${printable(cmd, MAX_CMD_SHOWN)}\r\n`
      + '[aoforge-watch] answer any prompt here; Ctrl+C interrupts the command\r\n',
    );

    // The command's own bytes, verbatim: a prompt, a colour, a progress bar.
    const mirror = (chunk) => write(chunk);
    try {
      handle.attachDataListener(mirror, { liveOnly: true });
    } catch (e) {
      warnOnce('mirror', e);
    }

    // Keys go to the command and nowhere else. A multi-byte character can arrive
    // split across two reads; the decoder holds the first half until the second.
    const decoder = new StringDecoder('utf8');
    const forward = (chunk) => {
      const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
      if (!text) return;
      try { handle.injectInput(text); } catch (e) { warnOnce('forward', e); }
    };

    if (canRaw()) {
      try { input.setRawMode(true); } catch (e) { warnOnce('raw mode', e); }
    }
    try {
      input.on('data', forward);
      if (typeof input.resume === 'function') input.resume();
    } catch (e) {
      warnOnce('input', e);
    }
    active = { mirror, forward };
  }

  function onEnd(id, result) {
    if (active) { restore(active); active = null; }
    const status = result && result.status ? printable(result.status) : 'unknown';
    const code = result && typeof result.exit_code === 'number' ? ` (exit ${result.exit_code})` : '';
    write(`\r\n[aoforge-watch] ${printable(id)} finished: ${status}${code}\r\n`);
  }

  handle.setDispatchHooks({ onStart, onEnd });

  return function detach() {
    handle.setDispatchHooks(null);
    if (active) { restore(active); active = null; }
  };
}

module.exports = {
  createSessionHandle,
  attachTerminal,
};
