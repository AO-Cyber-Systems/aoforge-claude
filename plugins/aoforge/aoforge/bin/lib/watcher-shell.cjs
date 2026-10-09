'use strict';

/**
 * watcher-shell — long-lived dual-mode shell session for the aoforge-watch
 * daemon.
 *
 * Two transports, one protocol:
 *
 *   interactive: true  → PTY backend (node-pty). Real pseudo-terminal.
 *                        TTY-required commands (gh auth login, doctl auth init,
 *                        gpg --decrypt) work because they pass `isatty(stdin)`.
 *                        Used by the production daemon.
 *
 *   interactive: false → pipe backend (child_process.spawn). No TTY.
 *                        Faster, simpler, no native dep at module-load time.
 *                        Used by unit tests and any caller that doesn't need
 *                        a real terminal.
 *
 * Both transports fence a command's output with BEGIN / DELIM / END sentinels
 * (`sentinelMarkers(id)`); how the command is run differs.
 *
 * 1. Replay protocol — pipe mode, and fish / powershell in either mode. The
 *    dispatch wrapper writes a temp-file-redirected command and replays the
 *    captured streams between the markers:
 *
 *      __DFW_OUT=$(mktemp); __DFW_ERR=$(mktemp)
 *      { <cmd> ; } > $__DFW_OUT 2> $__DFW_ERR
 *      __DFW_RC=$?
 *      echo __DFW_BEGIN_<id>__
 *      cat $__DFW_OUT 2>/dev/null
 *      echo __DFW_DELIM_<id>__
 *      cat $__DFW_ERR 2>/dev/null
 *      echo __DFW_END_<id>__:$__DFW_RC
 *      rm -f $__DFW_OUT $__DFW_ERR
 *
 *    Why temp files instead of `1>&2` mirroring of a stderr sentinel: when
 *    bash's stderr is connected to a pipe (not a TTY), it block-buffers and the
 *    END sentinel may never arrive in time, leaving captured stderr empty.
 *    Routing through temp files + cat puts everything on the captured stream
 *    where the sentinel parser is reliable. stdout and stderr stay separate.
 *
 * 2. In-band script protocol — bash / zsh in PTY mode (objective 73, TRD
 *    73-01). On a PTY the replay protocol has three faults, all of which
 *    objective 19 found live (19-05-mock-auth-e2e-SUMMARY.md, "Architectural
 *    Findings"):
 *
 *      gap 1  the command's fds are regular files, so isatty() is false and a
 *             TUI such as doctl's quits with "unknown terminal";
 *      gap 2  every wrapper line is queued on the tty at once, so a command
 *             that reads stdin consumes the next wrapper line as its answer
 *             before the prompt detector can inject anything;
 *      Ctrl+C the tty driver flushes the queued lines on SIGINT, END is never
 *             printed and the dispatch runs to its 10-minute timeout.
 *
 *    So the wrapper (`ptyScript`) is written to a 0600 file in a 0700 directory
 *    private to the session, and the shell is sent ONE line: `. '<file>'` + CR.
 *    The script prints BEGIN, runs the command with stdout AND stderr still on
 *    the terminal, then prints DELIM and END:<rc>. The output is read in band
 *    between BEGIN and DELIM; the DELIM-END section is empty, so on this path
 *    stderr arrives WITH stdout and the parsed `stderr` is ''. An INT trap held
 *    for the whole script lets a Ctrl+C kill only the command. The file is
 *    removed when the dispatch settles; kill() removes the directory.
 *
 * On PTY mode the line separator is `\r` (carriage return — PTY input
 * convention). On pipe mode it stays `\n`. `splitDispatchOutput` is
 * transport-agnostic: it scans for BEGIN/DELIM/END from the buffer head, so
 * PTY input echo (which appears before BEGIN) is harmless prefix garbage.
 *
 * Per dispatch, a single Promise is created. The data listener accumulates a
 * buffer; after each chunk we check whether the END sentinel has arrived.
 * Once seen, we split the buffer by BEGIN/DELIM/END to recover stdout,
 * stderr, and exit code, then resolve.
 *
 * See 19-RESEARCH.md §2 "Sentinel protocol compatibility" for the full
 * design rationale.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

const { getWrapper, UnsupportedShell } = require('./wrappers/index.cjs');
const { escapeRegExp } = require('./text-escape.cjs');

let _ptyModule = null;
function _loadPTY() {
  if (_ptyModule) return _ptyModule;
  try {
    _ptyModule = require('node-pty');
    return _ptyModule;
  } catch (e) {
    throw new Error(
      'node-pty not installed — set interactive:false on ShellSession or run "npm install" to fetch the prebuilt binary. ' +
      `Underlying error: ${e.message}`
    );
  }
}

// Liveness ceiling for the PTY readiness handshake (issue #93). NOT a guess
// about how long the shell takes to start — that guess is what this replaced.
// It only bounds a shell that will never answer at all.
const READY_TIMEOUT_MS = 10000;

/**
 * The three sentinel names that fence one dispatch's output. One function names
 * them for dispatch(), for a wrapper's ptyScript and for anything that has to
 * recognise them in the stream.
 *
 * @param {string} id — handoff id (/[A-Za-z0-9-]+/)
 * @returns {{begin: string, delim: string, end: string}}
 */
function sentinelMarkers(id) {
  return {
    begin: `__DFW_BEGIN_${id}__`,
    delim: `__DFW_DELIM_${id}__`,
    end: `__DFW_END_${id}__`,
  };
}

class ShellSessionClosed extends Error {
  constructor(msg) {
    super(msg || 'shell session closed');
    this.name = 'ShellSessionClosed';
  }
}

class ShellSession extends EventEmitter {
  constructor({ shell, env, cwd, interactive } = {}) {
    super();
    this.shell = shell || process.env.SHELL || 'bash';
    // TRD 20-05: route shell to wrapper module. Throws UnsupportedShell for
    // unknown shells — callers (e.g. runForeground) can catch + emit guidance.
    this._wrapper = getWrapper(this.shell);
    this.env = env || process.env;
    this.cwd = cwd || process.cwd();
    // interactive=true (default) loads user rc files for the daemon's prod
    // use case (mise/nvm/conda/aliases) AND uses node-pty for TTY-required
    // commands. Tests pass interactive=false to avoid the native dep + hangs
    // on slow rc files in CI/test environments.
    this.interactive = interactive !== false;
    this.proc = null;
    this._isPTY = false;
    this._closed = false;
    this._stdoutBuf = '';
    this._stderrBuf = '';
    this._activeDispatch = null; // { id, beginRx, endRx, resolve, timeout }
    this._readyProbe = null;     // { token, resolve, abort, timer, settled } — PTY only
    // TRD 73-01: private 0700 directory holding the per-dispatch script files of
    // the in-band PTY protocol. Created on the first such dispatch, removed by
    // kill() / on shell death. The path is kept after removal (it is only a name).
    this._scriptDir = null;
    // TRD 19-02: external data listeners for token-passing prompt detection.
    // Daemon attaches a detector that scans the data stream for prompt
    // regexes and writes resolved secrets back to the shell. Both PTY mode
    // (single onData stream) and pipe mode (stdout + stderr) feed listeners.
    this._extDataListeners = [];
  }

  /**
   * Attach an external data listener — called for every chunk emitted by
   * the underlying proc (PTY mode: combined stream; pipe mode: stdout AND
   * stderr). Used by the daemon to detect interactive prompts in the
   * accumulated buffer and inject resolved secrets via injectInput().
   *
   * @param {(chunk: string) => void} fn
   */
  attachDataListener(fn) {
    if (typeof fn === 'function') this._extDataListeners.push(fn);
  }

  /**
   * Detach a previously-attached data listener. No-op if not present.
   *
   * @param {(chunk: string) => void} fn
   */
  detachDataListener(fn) {
    this._extDataListeners = this._extDataListeners.filter((x) => x !== fn);
  }

  /**
   * Inject input back into the shell session — used by the prompt detector
   * to write resolved secrets + carriage-return when a prompt regex matches.
   * Routes through PTY proc.write or pipe proc.stdin.write per active mode.
   *
   * Silently no-ops if the session is closed or not yet spawned. (Detector
   * may race ahead of close events; quiet failure is preferable to throw.)
   *
   * @param {string} s
   */
  injectInput(s) {
    if (this._closed || !this.proc) return;
    if (this._isPTY) this.proc.write(s);
    else this.proc.stdin.write(s);
  }

  _emitExtData(chunk) {
    if (this._extDataListeners.length === 0) return;
    // Snapshot listeners before iterating: a listener may detach itself.
    const listeners = this._extDataListeners.slice();
    for (const fn of listeners) {
      try { fn(chunk); } catch { /* listener errors must not break dispatch */ }
    }
  }

  async spawn() {
    if (this.proc) throw new Error('already spawned');

    // TRD 20-05: per-shell args + init lines from the wrapper module.
    const shellArgs = this._wrapper.shellArgs(this.interactive);

    if (this.interactive) {
      // PTY path — real pseudo-terminal via node-pty
      const pty = _loadPTY();
      try {
        this.proc = pty.spawn(this.shell, shellArgs, {
          name: 'xterm-color',
          cols: 80,
          rows: 24,
          cwd: this.cwd,
          env: this.env,
        });
      } catch (e) {
        throw new Error(`PTY spawn failed: ${e.message}`);
      }
      this._isPTY = true;
      // PTYs merge stdout+stderr at the OS layer. The replay protocol's temp-file
      // redirection separated them again; the bash/zsh in-band script protocol
      // (TRD 73-01) does not, and stderr then arrives with stdout.
      this.proc.onData((chunk) => {
        this._stdoutBuf += chunk;
        // TRD 19-02: feed external listeners (e.g. prompt detector) BEFORE
        // _tryComplete so the detector can inject a secret in time for the
        // running command to consume it before the END sentinel arrives.
        this._emitExtData(chunk);
        this._tryReady();
        this._tryComplete();
      });
      this.proc.onExit(() => this._onExit());
      // Quiet PS1 / job-control / PROMPT_COMMAND noise. PTY input terminator
      // is \r (carriage return), NOT \n.
      //
      // CRITICAL: `stty -echo` first (in bash/fish wrappers). PTYs in
      // cooked mode echo input back by default — without this, the dispatch
      // buffer contains every input line interleaved with shell output and
      // sentinel matching breaks. With echo disabled the buffer contains
      // only program output, identical-shape to pipe mode.
      const initLines = this._wrapper.initLines('pty');
      this._writeRaw(initLines.concat(['']).join('\r'));
      // Then WAIT FOR PROOF, not for a duration (issue #93). This used to be
      // `await sleep(100)` — a guess about how long `bash -i` takes to start
      // and apply `stty -echo`. When the guess lost (a loaded machine, a slow
      // runner, several agents building at once) the tty was still in cooked
      // mode when the first dispatch was written, so it echoed the wrapper's
      // own lines back into the buffer the sentinel scanner reads, and the
      // echo of `cat $__DFW_OUT` landed BETWEEN the BEGIN and DELIM sentinels.
      // The capture was then the command text instead of the command's output.
      // See _awaitShellReady: no timing assumption survives it.
      await this._awaitShellReady();
      // Drain the prelude (PS1 before it was cleared, login messages, the
      // readiness probe itself) so the first dispatch's buffer scan starts
      // clean.
      this._stdoutBuf = '';
      this._stderrBuf = '';
    } else {
      // Pipe path — existing v1.1 behavior, byte-identical to pre-PTY release
      this.proc = spawn(this.shell, shellArgs, {
        env: this.env,
        cwd: this.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this._isPTY = false;
      this.proc.stdout.setEncoding('utf8');
      this.proc.stderr.setEncoding('utf8');
      this.proc.stdout.on('data', (chunk) => {
        this._stdoutBuf += chunk;
        // TRD 19-02: feed external listeners (e.g. prompt detector) BEFORE
        // _tryComplete. Pipe-mode emits both streams; prompts CAN come on
        // stderr (e.g. `read -p prompt: var 1>&2`) so stderr listeners get
        // chunks too.
        this._emitExtData(chunk);
        this._tryComplete();
      });
      this.proc.stderr.on('data', (chunk) => {
        this._stderrBuf += chunk;
        this._emitExtData(chunk);
        this._tryComplete();
      });
      this.proc.on('exit', () => this._onExit());
      this.proc.on('error', () => this._onExit());
      // Quiet job-control noise on `bash -i` without a TTY (or equivalent
      // for fish/pwsh), AND clear the interactive prompt so PS1 doesn't
      // pollute captured stderr. Wrappers ship per-shell init lines.
      const initLines = this._wrapper.initLines('pipe');
      this._writeRaw(initLines.concat(['']).join(this._wrapper.lineSep));
    }
  }

  /**
   * Write raw text to the underlying proc, routing through the correct API
   * for the active transport.
   *  - PTY mode: proc.write (no .stdin)
   *  - pipe mode: proc.stdin.write
   */
  _writeRaw(s) {
    if (this._isPTY) this.proc.write(s);
    else this.proc.stdin.write(s);
  }

  /**
   * Block until the PTY shell has PROVED it is ready, rather than until a
   * duration has elapsed (issue #93).
   *
   * Writes `echo <token>` after the init lines and waits for a line that ENDS
   * with the token but is not the echo of that input — the echoed input line
   * ends with `echo <token>`, the shell's answer ends with the token alone.
   * That distinction is the whole trick: an echo can never be mistaken for the
   * answer, so seeing the answer proves the shell consumed every init line
   * before it and produced output, which means `stty -echo` has already run —
   * however long that took.
   *
   * Only the END of the line is matched, not the whole of it. Whatever the
   * shell printed before PS1 was cleared shares the physical line with the
   * answer: on macOS bash 3.2 the real buffer reads
   * `bash-3.2$ bash-3.2$ bash-3.2$ bash-3.2$ __DFW_READY_x__`. Requiring
   * whole-line equality there waits forever.
   *
   * The ceiling is a liveness bound, not a readiness assumption: a shell that
   * cannot echo a token in 10s is not one we can dispatch to, and failing
   * loudly here beats a session that silently captures the wrong bytes.
   */
  _awaitShellReady(timeoutMs = READY_TIMEOUT_MS) {
    const token = `__DFW_READY_${Math.random().toString(36).slice(2, 10)}__`;
    return new Promise((resolve, reject) => {
      const probe = { token, settled: false, timer: null };
      const settle = (fn, arg) => {
        if (probe.settled) return;
        probe.settled = true;
        clearTimeout(probe.timer);
        this._readyProbe = null;
        fn(arg);
      };
      probe.resolve = () => settle(resolve);
      // The shell dying during startup must not park spawn() on the ceiling.
      // Resolve rather than reject: the session is _closed by then, isAlive()
      // is false and dispatch() rejects with ShellSessionClosed, which is the
      // path every caller already handles.
      probe.abort = () => settle(resolve);
      probe.timer = setTimeout(() => settle(reject, new Error(
        `PTY shell did not become ready within ${timeoutMs}ms ` +
        `(readiness probe ${token} was never echoed back cleanly)`
      )), timeoutMs);
      this._readyProbe = probe;
      this._writeRaw(`echo ${token}\r`);
      this._tryReady(); // in case the answer already landed
    });
  }

  _tryReady() {
    const probe = this._readyProbe;
    if (!probe || probe.settled) return;
    for (const line of this._stdoutBuf.split('\n')) {
      const text = stripAnsi(line).replace(/\s+$/, '');
      if (!text.endsWith(probe.token)) continue;
      // Reject the echo of our own input: it reads `… echo <token>`.
      const before = text.slice(0, text.length - probe.token.length);
      if (/echo\s*$/.test(before)) continue;
      probe.resolve();
      return;
    }
  }

  _onExit() {
    this._closed = true;
    if (this._readyProbe && !this._readyProbe.settled) this._readyProbe.abort();
    if (this._activeDispatch && !this._activeDispatch.settled) {
      this._activeDispatch.settled = true;
      clearTimeout(this._activeDispatch.timer);
      this._cleanupScript(this._activeDispatch);
      this._activeDispatch.resolve({
        stdout: '',
        stderr: '',
        exit_code: -1,
        status: 'shell_died',
      });
      this._activeDispatch = null;
    }
    // The session cannot dispatch again, so its private script directory has no
    // further use whether or not anyone calls kill().
    this._removeScriptDir();
    this.emit('closed');
  }

  /**
   * Remove one dispatch's script file. Synchronous and never throws: it runs on
   * every settle path (done, failed, timeout, shell_died, killed), several of
   * them inside event callbacks.
   */
  _cleanupScript(d) {
    if (!d || !d.scriptFile) return;
    const file = d.scriptFile;
    d.scriptFile = null;
    try { fs.unlinkSync(file); } catch { /* already gone, or never written */ }
  }

  /** Remove the session's private script directory and anything left in it. Never throws. */
  _removeScriptDir() {
    if (!this._scriptDir) return;
    try { fs.rmSync(this._scriptDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }

  /** Create (once) the private 0700 directory for per-dispatch script files. */
  _ensureScriptDir() {
    if (this._scriptDir && fs.existsSync(this._scriptDir)) return this._scriptDir;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aoforge-watch-'));
    fs.chmodSync(dir, 0o700); // mkdtemp already creates 0700; be explicit, umask cannot widen it
    this._scriptDir = dir;
    return dir;
  }

  isAlive() {
    return !!(this.proc && !this._closed);
  }

  _tryComplete() {
    const d = this._activeDispatch;
    if (!d || d.settled) return;
    const endMatch = this._stdoutBuf.match(d.endRx);
    if (!endMatch) return;
    const rc = parseInt(endMatch[1], 10);
    // Split the stdout buffer into the three sections fenced by
    // BEGIN / DELIM / END sentinels.
    let { stdout, stderr } = splitDispatchOutput(this._stdoutBuf, d.begin, d.delim, d.end);
    // PTY mode normalization: drop readline's bracketed-paste artifacts (see
    // stripBracketedPaste — they carry their own CRLF, so this MUST run before
    // the \r\n collapse below or it leaves blank lines behind), then strip the
    // \r of the PTY's cooked-mode line endings so the result shape is
    // byte-identical to pipe-mode output. Pipe mode has neither, so neither
    // step exists there.
    if (this._isPTY) {
      stdout = stripBracketedPaste(stdout).replace(/\r\n/g, '\n');
      stderr = stripBracketedPaste(stderr).replace(/\r\n/g, '\n');
    }
    // Trim everything up through the END line.
    this._stdoutBuf = trimAfter(this._stdoutBuf, d.end);
    d.settled = true;
    clearTimeout(d.timer);
    this._activeDispatch = null;
    this._cleanupScript(d);
    d.resolve({
      stdout,
      stderr,
      exit_code: rc,
      status: rc === 0 ? 'done' : 'failed',
    });
  }

  /**
   * Dispatch a command. Returns { stdout, stderr, exit_code, status }.
   *
   * @param {string} id — handoff id (used as sentinel; must be /[A-Za-z0-9-]+/)
   * @param {string} cmd — the command
   * @param {object} opts — { timeout_ms }
   */
  dispatch(id, cmd, opts = {}) {
    if (!this.isAlive()) {
      return Promise.reject(new ShellSessionClosed());
    }
    if (this._activeDispatch) {
      return Promise.reject(new Error('dispatch in progress'));
    }
    const timeoutMs = typeof opts.timeout_ms === 'number' ? opts.timeout_ms : 600000;
    const { begin, delim, end } = sentinelMarkers(id);
    const endRx = new RegExp(`${escapeRegExp(end)}:(-?\\d+)`);

    return new Promise((resolve) => {
      // TRD 73-01: bash/zsh on a PTY run the command from a private script file
      // (in-band protocol, see the header). Prepare it BEFORE arming the timer
      // and registering the dispatch, so a failed write rejects this promise
      // and leaves no half-registered dispatch behind.
      const useScript = this._isPTY
        && typeof this._wrapper.ptyScript === 'function'
        && typeof this._wrapper.sourceLine === 'function';
      let scriptFile = null;
      if (useScript) {
        const dir = this._ensureScriptDir();
        // The id is documented as /[A-Za-z0-9-]+/; sanitize anyway so a stray
        // separator can never walk the file out of the private directory.
        scriptFile = path.join(dir, `${String(id).replace(/[^A-Za-z0-9._-]/g, '_')}.sh`);
        try {
          fs.writeFileSync(
            scriptFile,
            this._wrapper.ptyScript(cmd, { begin, delim, end }, { scriptPath: scriptFile }),
            { mode: 0o600 },
          );
          fs.chmodSync(scriptFile, 0o600); // umask can only narrow the mode above; be explicit
        } catch (e) {
          try { fs.unlinkSync(scriptFile); } catch { /* nothing was written */ }
          throw e; // rejects the dispatch promise
        }
      }

      const d = {
        id,
        begin,
        delim,
        end,
        endRx,
        resolve,
        settled: false,
        timer: null,
        scriptFile,
      };
      d.timer = setTimeout(() => {
        if (d.settled) return;
        d.settled = true;
        this._activeDispatch = null;
        // Kill the shell — the daemon will respawn for the next command.
        try { this.proc.kill('SIGTERM'); } catch {}
        // PTY procs need destroy() to release the underlying socket FD;
        // otherwise the host event loop stays alive. SIGTERM alone is not
        // enough — see node-pty UnixTerminal.destroy() upstream.
        if (this._isPTY) {
          try { this.proc.destroy(); } catch {}
        }
        this._closed = true;
        // The shell is gone for good: drop this dispatch's script and the
        // private directory with it.
        this._cleanupScript(d);
        this._removeScriptDir();
        resolve({ stdout: '', stderr: '', exit_code: -1, status: 'timeout' });
      }, timeoutMs);
      this._activeDispatch = d;

      if (useScript) {
        // ONE short line, so nothing the command reads from the tty can be a
        // wrapper line (gap 2) and a Ctrl+C has no queued input to flush.
        this._writeRaw(this._wrapper.sourceLine(scriptFile) + '\r');
      } else {
        // TRD 20-05: per-shell wrapper generates wrappedLines (sentinel-fenced
        // replay protocol; output shape is shell-agnostic). PTY input separator
        // is always \r (PTY input convention); pipe mode uses wrapper.lineSep.
        const wrappedLines = this._wrapper.wrapCommand(cmd, id);
        const sep = this._isPTY ? '\r' : this._wrapper.lineSep;
        this._writeRaw(wrappedLines.join(sep));
      }
      // In case markers already arrived (race-free).
      this._tryComplete();
    });
  }

  async kill() {
    if (!this.proc) return;
    if (this._closed) {
      // Already closed (timeout, shell exit): the shell is gone but a script
      // directory may still be on disk. kill() is idempotent, and so is this.
      this._removeScriptDir();
      return;
    }
    this._closed = true;
    if (this._isPTY) {
      // node-pty: kill signal + destroy() which closes the read stream and
      // releases the file descriptor. Without destroy() the socket holds
      // the event loop alive and the host process won't exit cleanly.
      try { this.proc.kill('SIGTERM'); } catch {}
      await new Promise((resolve) => {
        let done = false;
        const t = setTimeout(() => {
          if (done) return;
          done = true;
          try { this.proc.kill('SIGKILL'); } catch {}
          try { this.proc.destroy(); } catch {}
          resolve();
        }, 500);
        try {
          this.proc.onExit(() => {
            if (done) return;
            done = true;
            clearTimeout(t);
            try { this.proc.destroy(); } catch {}
            resolve();
          });
        } catch {
          // onExit may already have fired or the proc may be torn down.
          if (done) return;
          done = true;
          clearTimeout(t);
          try { this.proc.destroy(); } catch {}
          resolve();
        }
      });
    } else {
      // child_process: SIGTERM, wait for exit, fall back to SIGKILL.
      try { this.proc.kill('SIGTERM'); } catch {}
      await new Promise((resolve) => {
        let done = false;
        const t = setTimeout(() => {
          if (done) return;
          done = true;
          try { this.proc.kill('SIGKILL'); } catch {}
          resolve();
        }, 500);
        this.proc.once('exit', () => {
          if (done) return;
          done = true;
          clearTimeout(t);
          resolve();
        });
      });
    }
    if (this._activeDispatch && !this._activeDispatch.settled) {
      this._activeDispatch.settled = true;
      clearTimeout(this._activeDispatch.timer);
      this._cleanupScript(this._activeDispatch);
      this._activeDispatch.resolve({
        stdout: '',
        stderr: '',
        exit_code: -1,
        status: 'killed',
      });
      this._activeDispatch = null;
    }
    this._removeScriptDir();
  }
}

/**
 * readline's bracketed-paste artifacts, as they appear inside a PTY capture.
 *
 * Since readline 8.1 (every current Linux bash; NOT macOS's bash 3.2) the line
 * editor turns bracketed-paste mode on before reading a line and off when it
 * accepts one, and the accept is followed by the CRLF it writes itself. On the
 * wire, one line read looks like:
 *
 *   ESC[?2004h            enable, written before the read
 *   ESC[?2004l \r\r\n     disable + accept-line newline
 *
 * Both of those sit between the BEGIN and DELIM sentinels of the dispatch
 * wrapper, which is why captured stdout on Linux was
 * `ESC[?2004hESC[?2004l\r\r\nhello\r\n…` rather than `hello\n` (issue #95).
 *
 * The line terminator is consumed WITH the disable sequence and only there: it
 * is the artifact's own terminator, not output. Note the DOUBLE carriage
 * return — readline writes its own `\r` and the PTY's ONLCR then turns the `\n`
 * into `\r\n`. Captured verbatim from a bash 5.2 PTY; matching only `\r\n` here
 * leaves a stray newline behind and the capture is still wrong, so the pattern
 * allows any run of `\r`. A blank line produced by the command is a bare `\r\n`
 * with no escape in front of it and survives untouched.
 *
 * ESC[200~ / ESC[201~ are the paste delimiters the terminal injects around
 * pasted text when the mode is on; they are stripped for the same reason.
 *
 * This is the SECOND layer. The first is wrappers/bash.cjs initLines('pty'),
 * which turns the mode off at the source — a denylist cannot know about the
 * next readline feature, so it is defence in depth and not the fix.
 */
const BRACKETED_PASTE_RX = /\x1b\[\?2004[hl](?:\r*\n)?|\x1b\[20[01]~/g;

function stripBracketedPaste(s) {
  return s.indexOf('\x1b') === -1 ? s : s.replace(BRACKETED_PASTE_RX, '');
}

/**
 * Drop CSI / OSC escape sequences from a line so its *content* can be compared.
 * Used by the PTY readiness probe, which matches a line by equality and must
 * not be defeated by whatever the terminal decided to wrap it in.
 */
function stripAnsi(s) {
  return s
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/[\r\x00]/g, '');
}

/**
 * Split a stdout buffer fenced by BEGIN / DELIM / END sentinels into
 * { stdout, stderr } sections. Each section is the content of the lines
 * BETWEEN its bounding sentinels (exclusive of the sentinel lines).
 *
 * Transport-agnostic: pipe-mode buffers contain only the sentinel-fenced
 * content; PTY-mode buffers may have a prefix of echoed input before the
 * BEGIN sentinel — `buf.indexOf(begin)` skips it as harmless prefix.
 */
function splitDispatchOutput(buf, begin, delim, end) {
  const bIdx = buf.indexOf(begin);
  if (bIdx === -1) return { stdout: '', stderr: '' };
  const afterBegin = buf.indexOf('\n', bIdx);
  if (afterBegin === -1) return { stdout: '', stderr: '' };

  const dIdx = buf.indexOf(delim, afterBegin + 1);
  if (dIdx === -1) {
    // No delimiter yet — return what we have as stdout, no stderr.
    return { stdout: buf.slice(afterBegin + 1), stderr: '' };
  }
  // stdout = afterBegin+1 .. start of delim line
  const delimLineStart = buf.lastIndexOf('\n', dIdx) + 1;
  const stdout = buf.slice(afterBegin + 1, delimLineStart);

  const afterDelim = buf.indexOf('\n', dIdx);
  if (afterDelim === -1) return { stdout, stderr: '' };

  const eIdx = buf.indexOf(end, afterDelim + 1);
  if (eIdx === -1) return { stdout, stderr: buf.slice(afterDelim + 1) };
  const endLineStart = buf.lastIndexOf('\n', eIdx) + 1;
  const stderr = buf.slice(afterDelim + 1, endLineStart);

  return { stdout, stderr };
}

/**
 * Drop everything up to and including the line containing `end`.
 */
function trimAfter(buf, end) {
  const eIdx = buf.indexOf(end);
  if (eIdx === -1) return buf;
  const eol = buf.indexOf('\n', eIdx);
  if (eol === -1) return '';
  return buf.slice(eol + 1);
}

module.exports = {
  ShellSession,
  ShellSessionClosed,
  splitDispatchOutput,
  sentinelMarkers,
  stripBracketedPaste,
  stripAnsi,
  UnsupportedShell,
};
