'use strict';

/**
 * End-to-end integration tests for the seamless handoff pipeline.
 *
 * Spawns aoforge-watch as a real subprocess, writes pending records that
 * exercise the full daemon → shell dispatch → done record → route-results
 * hook injection path, and asserts the visible behavior at each stage.
 *
 * Slow tests (real subprocess + real shell session). Limited to the
 * pipeline integration; component-level coverage lives in:
 *   - watcher-state.test.cjs
 *   - watcher-allowlist.test.cjs
 *   - watcher-shell.test.cjs
 *   - watcher-daemon.test.cjs
 *   - aoforge-watch.test.cjs
 *   - route-results.test.js
 *   - gate-interactive.test.js
 */

const { test, describe, beforeEach, after, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const { watchStateDir, runtimeHome } = require('./lib/compat.cjs');

const CLI = path.join(__dirname, 'aoforge-watch.cjs');
const ROUTE_RESULTS_HOOK = path.join(__dirname, '..', '..', 'hooks', 'route-results.js');

// The daemon keeps its pid file and log in the watch state directory (TRD 73-12); the user allowlist lives in the
// runtime home (TRD 73-11).
function watchPidFile(home) { return path.join(watchStateDir(home), 'aoforge-watch.pid'); }
function watchLogFile(home) { return path.join(watchStateDir(home), 'aoforge-watch.log'); }

// A test allowlist that lets the daemon run benign shell builtins
// so we can validate the pipeline without requiring real interactive auth.
const TEST_ALLOW_JSON = JSON.stringify({
  commands: [
    { pattern: '^echo\\b', label: 'test:echo' },
    { pattern: '^printf\\b', label: 'test:printf' },
    { pattern: '^true\\b', label: 'test:true' },
    // Issue #93: a command that outlives the daemon's shutdown deadline by two
    // orders of magnitude, so "the daemon exits on SIGTERM" can be asserted
    // with a dispatch genuinely in flight rather than against an idle process.
    { pattern: '^sleep\\b', label: 'test:sleep' },
  ],
});

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dfw-e2e-'));
}

function rmTmp(d) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
}

function writeAllowFile(home) {
  const dir = runtimeHome(home);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'aoforge-watch-allow.json');
  fs.writeFileSync(file, TEST_ALLOW_JSON);
  return file;
}

function writePending(projectRoot, id, cmd) {
  const dir = path.join(projectRoot, '.aoforge-handoff', 'pending');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify({
    id,
    cmd,
    cwd: projectRoot,
    status: 'pending',
    source: 'hook',
    created_at: new Date().toISOString(),
  }, null, 2) + '\n');
  return filePath;
}

const DAEMON_TERM_GRACE_MS = 5000;
const DAEMON_KILL_GRACE_MS = 5000;

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForExit(child, ms) {
  return new Promise((resolve) => {
    if (hasExited(child)) return resolve(true);
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve(false); } }, ms);
    child.once('exit', () => { if (!done) { done = true; clearTimeout(t); resolve(true); } });
  });
}

/**
 * Kill a daemon and PROVE it is gone (issue #93).
 *
 * The old teardown sent SIGTERM and waited 3s. That is not a guarantee: the
 * daemon's own SIGTERM handler awaits its in-flight dispatch, and a dispatch
 * that never sees its END sentinel runs to DEFAULT_DISPATCH_TIMEOUT_MS — ten
 * minutes. So the daemon outlived the test holding the write end of the pipes
 * this process is reading, node could never exit the file, and `npm test` did
 * not fail, it never RETURNED. A hang in CI is an unattributable job timeout
 * rather than a named failure, which is strictly worse than a red.
 *
 * Escalates SIGTERM → SIGKILL, signals the whole process GROUP so the shell
 * the daemon spawned dies with it, releases our ends of the pipes, and returns
 * a message (never throws) if the process is still addressable at the end.
 *
 * @returns {Promise<string|null>} null when reaped, else why not
 */
async function stopDaemon(child) {
  const pid = child.pid;
  const signal = (sig) => {
    // Negative pid = process group. The daemon was spawned detached, so it
    // leads its own group and anything it spawned is signalled with it.
    try { process.kill(-pid, sig); } catch {}
    try { child.kill(sig); } catch {}
  };

  if (!hasExited(child)) {
    signal('SIGTERM');
    if (!(await waitForExit(child, DAEMON_TERM_GRACE_MS))) {
      signal('SIGKILL');
      await waitForExit(child, DAEMON_KILL_GRACE_MS);
    }
  }

  // Our ends of the pipes keep this file's event loop alive even once the
  // process is gone.
  for (const s of [child.stdout, child.stderr]) {
    try { s.destroy(); } catch {}
  }

  if (!hasExited(child)) {
    return `daemon pid ${pid} survived SIGTERM and SIGKILL — it is leaking into the rest of the run`;
  }
  // SIGKILL is not instantaneous for a process blocked in the kernel; confirm
  // the pid is genuinely unaddressable rather than trusting the signal.
  try {
    process.kill(pid, 0);
    return `daemon pid ${pid} reported exit but is still addressable — not reaped`;
  } catch (e) {
    if (e.code === 'ESRCH') return null;
    if (e.code === 'EPERM') return `daemon pid ${pid} still exists and is not ours to signal`;
    return null;
  }
}

async function withDaemon({ home, project, shell }, fn) {
  // Use bash with interactive=false-equivalent at the daemon level.
  // The daemon's ShellSession defaults to interactive:true; the test allow
  // file routes harmless commands through it.
  const child = spawn('node', [CLI, 'start',
    '--project', project,
    '--shell', shell || 'bash',
    '--foreground',
  ], {
    env: { ...process.env, HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own process group, so teardown can signal the daemon AND the shell
    // session it spawned in one go instead of orphaning the grandchild.
    detached: true,
  });

  // Drain both pipes unconditionally. Nothing read them before, so a chatty
  // daemon could fill the 64KB pipe buffer and block on its own write —
  // wedged in a syscall, with its SIGTERM handler queued behind it. The tail
  // is kept only to make a teardown failure diagnosable.
  let log = '';
  const keep = (c) => { log = (log + c).slice(-4096); };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  child.on('error', () => {});

  // Wait for PID file with our child's pid
  const pidFile = watchPidFile(home);
  const start = Date.now();
  while (Date.now() - start < 5000) {
    try {
      if (fs.existsSync(pidFile)) {
        const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
        if (info && info.pid === child.pid) break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 50));
  }

  // Teardown is UNCONDITIONAL and must not mask the body's failure: a throw
  // inside `finally` replaces the original error, and the original error is
  // the one worth reading. Capture, tear down, then rethrow in priority order.
  let primary = null;
  try {
    await fn(child);
  } catch (e) {
    primary = e;
  }
  const leak = await stopDaemon(child);
  if (primary) throw primary;
  if (leak) throw new Error(`${leak}\n--- daemon output (tail) ---\n${log}`);
}

/**
 * Poll a file until its contents match — a readiness SIGNAL, not a sleep.
 * Used to observe the daemon reaching a state (PID written, dispatch started)
 * instead of guessing how long it takes to get there.
 */
async function waitForFileMatch(file, rx, timeoutMs, what) {
  const start = Date.now();
  let last = '';
  while (Date.now() - start < timeoutMs) {
    try {
      last = fs.readFileSync(file, 'utf8');
      if (rx.test(last)) return last;
    } catch {}
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error(`${what} within ${timeoutMs}ms (last contents: ${JSON.stringify(last.slice(-500))})`);
}

async function waitForDoneRecord(projectRoot, id, timeoutMs = 10000) {
  const filePath = path.join(projectRoot, '.aoforge-handoff', 'done', `${id}.json`);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(filePath)) {
      try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch {}
    }
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`done record ${id} did not appear within ${timeoutMs}ms`);
}

function runRouteResults(projectRoot) {
  const result = spawnSync('node', [ROUTE_RESULTS_HOOK], {
    cwd: projectRoot,
    encoding: 'utf-8',
    input: '',
  });
  return result;
}

// ---------------------------------------------------------------------------

describe('handoff pipeline — end-to-end', () => {
  let home, project;
  beforeEach(() => {
    home = mkTmp();
    project = mkTmp();
    fs.mkdirSync(path.join(project, '.aoforge-handoff', 'pending'), { recursive: true });
    writeAllowFile(home);
  });
  afterEach(() => { rmTmp(home); rmTmp(project); });

  test('write pending → daemon executes → route-results emits result with stdout', { timeout: 30000 }, async () => {
    await withDaemon({ home, project }, async () => {
      writePending(project, 'h-001', 'echo hello-world');
      const done = await waitForDoneRecord(project, 'h-001');
      assert.equal(done.status, 'done');
      assert.equal(done.exit_code, 0);
      assert.match(done.stdout, /hello-world/);

      const r = runRouteResults(project);
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout);
      assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
      assert.match(out.hookSpecificOutput.additionalContext, /h-001/);
      assert.match(out.hookSpecificOutput.additionalContext, /hello-world/);
    });
  });

  test('disallowed command produces rejected done record + "Do NOT retry" guidance', { timeout: 30000 }, async () => {
    await withDaemon({ home, project }, async () => {
      writePending(project, 'h-002', 'rm -rf /tmp/whatever');
      const done = await waitForDoneRecord(project, 'h-002');
      assert.equal(done.status, 'rejected');
      assert.equal(done.exit_code, -2);

      const r = runRouteResults(project);
      const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
      assert.match(ctx, /rejected by daemon/);
      assert.match(ctx, /Do NOT retry/);
    });
  });

  test('idempotency: route-results emits once, silence on second invocation', { timeout: 30000 }, async () => {
    await withDaemon({ home, project }, async () => {
      writePending(project, 'h-003', 'echo idempotent');
      await waitForDoneRecord(project, 'h-003');

      const r1 = runRouteResults(project);
      assert.ok(r1.stdout.length > 0, 'first invocation should emit');

      const r2 = runRouteResults(project);
      assert.equal(r2.stdout, '', 'second invocation should be silent (consumed flag)');
    });
  });

  test('multi-record: 3 queued commands appear in a single injection', { timeout: 30000 }, async () => {
    await withDaemon({ home, project }, async () => {
      writePending(project, 'h-004', 'echo first');
      writePending(project, 'h-005', 'echo second');
      writePending(project, 'h-006', 'echo third');

      await waitForDoneRecord(project, 'h-004');
      await waitForDoneRecord(project, 'h-005');
      await waitForDoneRecord(project, 'h-006');

      const r = runRouteResults(project);
      const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
      // All three should be in a single additionalContext (3 commands the watcher ran)
      assert.match(ctx, /3 commands the watcher ran/);
      assert.match(ctx, /h-004/);
      assert.match(ctx, /h-005/);
      assert.match(ctx, /h-006/);
      assert.match(ctx, /first/);
      assert.match(ctx, /second/);
      assert.match(ctx, /third/);
    });
  });

  // ─── Issue #93: a daemon must not outlive the test that started it ───────
  //
  // These two are the file's own guard rails. Before them, a leaked daemon did
  // not make this file FAIL — it made `npm test` never return, which is worse,
  // because a hang in CI is an unattributable job timeout with nothing to read.

  test('LK-1: teardown reaps the daemon — no aoforge-watch outlives withDaemon',
    { timeout: 30000 }, async () => {
      let pid = null;
      await withDaemon({ home, project }, async (child) => {
        pid = child.pid;
        assert.ok(pid, 'daemon spawned');
        // Prove it is running before we claim teardown killed it: an assertion
        // that a dead process is dead proves nothing.
        assert.doesNotThrow(() => process.kill(pid, 0), 'daemon should be alive inside the body');
      });
      assert.throws(
        () => process.kill(pid, 0),
        (e) => e.code === 'ESRCH',
        `aoforge-watch pid ${pid} is still addressable after teardown`
      );
    });

  test('LK-2: SIGTERM kills the daemon within its deadline even with a dispatch in flight',
    { timeout: 60000 }, async () => {
      // THE mechanism from #93. The daemon's SIGTERM handler awaits
      // loop.stop(), which awaits the in-flight dispatch, which runs to
      // DEFAULT_DISPATCH_TIMEOUT_MS (600_000). Before the shutdown deadline
      // landed, this test hit its own 60s timeout; in the wild it presented as
      // daemons alive 8+ minutes after their tests ended.
      const child = spawn('node', [CLI, 'start',
        '--project', project, '--shell', 'bash', '--foreground',
      ], {
        env: { ...process.env, HOME: home },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });
      child.stdout.resume();
      child.stderr.resume();
      child.on('error', () => {});
      try {
        const logFile = watchLogFile(home);
        const pidFile = watchPidFile(home);
        await waitForFileMatch(pidFile, new RegExp(`"pid":\\s*${child.pid}\\b`), 15000,
          'daemon never wrote its PID file');

        writePending(project, 'h-hang', 'sleep 300');
        // Wait for PROOF the dispatch started — the daemon logs the command it
        // is dispatching — rather than sleeping for a poll interval.
        await waitForFileMatch(logFile, /dispatching h-hang/, 15000,
          'daemon never started the hanging dispatch');

        const t0 = Date.now();
        process.kill(-child.pid, 'SIGTERM');
        const exited = await waitForExit(child, 30000);
        const elapsed = Date.now() - t0;
        assert.ok(exited, `daemon did not exit within 30s of SIGTERM (waited ${elapsed}ms)`);
        assert.ok(elapsed < 20000,
          `daemon took ${elapsed}ms to honour SIGTERM; the shutdown deadline is ${5000}ms`);
      } finally {
        const leak = await stopDaemon(child);
        assert.equal(leak, null, leak || '');
      }
    });
});

// ---------------------------------------------------------------------------
// TRD 19-05: PTY-path mock auth e2e tests
//
// Validates that the PTY-backed daemon (TRD 19-01) + token-passing wire
// format (TRD 19-02) correctly drive real `gh auth login` and `doctl auth
// init` commands against LOCAL MOCK HTTP SERVERS — no real credentials,
// no real network, no real GH/DO API. CI runs replay-only.
//
// Behavior list (must be in a comment block at the top of the describe):
//   MA-1:      gating — when ptyAvailable() OR ghAvailable()/doctlAvailable()
//              returns false, MA-* tests skip cleanly via t.skip(). A missing
//              tool is the ONLY reason an MA-* test skips (objective 73).
//   MA-2:      mockGhServer responds to POST /login/device/code with cassette
//   MA-3:      mockGhServer responds to POST /login/oauth/access_token with cassette
//   MA-4:      mockDoctlServer responds to GET /v2/account with cassette
//   MA-2b:     mock unknown path returns 404 with diagnostic body (negative path)
//   MA-6:      end-to-end — doctl auth init via PTY with inputs.secrets[env]
//              pointing at DIGITALOCEAN_TOKEN against mockDoctl. doctl draws its
//              TUI on the PTY (no "unknown terminal"), the detector answers its
//              prompt, and a done record arrives with the token redacted. Does
//              NOT assert status:done: doctl rejects the fake token, and the
//              observed outcome is recorded as a diagnostic (see the test).
//   MA-6-synth: end-to-end — synthetic prompt-emitting bash command exercises
//              the SAME pipeline (TEST_ALLOW_JSON, inputs.secrets[env], prompt
//              detector, redaction-at-end) without doctl's own behaviour in the
//              way. Asserts status:done, exit 0, the command consumed the
//              injected secret (`got=` line) and the token is redacted.
//   MA-7:      failure case — DIGITALOCEAN_TOKEN unset → daemon emits
//              status:'failed' (never 'timeout') promptly, with stderr
//              containing "secret resolution failed" and DIGITALOCEAN_TOKEN.
//   MA-5:      NOT IMPLEMENTED — gh auth login via mock device flow. No test.
//   MA-8:      NOT IMPLEMENTED — mock 401 returns non-zero exit; covered
//              implicitly by MA-7.
//
// CLOSED IN OBJECTIVE 73. TRD 19-05 parked three gaps here, each as a skip:
//   gap 1  the dispatch wrapper redirected the command's stdout/stderr to temp
//          files, so isatty() was false and doctl's TUI quit with "unknown
//          terminal";
//   gap 2  the wrapper wrote every line to the PTY up front, so a command that
//          read stdin consumed a wrapper line as its answer;
//   gap 3  the prompt detector scanned the replay of captured stderr after the
//          command had exited, so error text containing "access token" was
//          taken for a prompt (Ctrl+C, or the secret typed into the shell).
// TRD 73-01 closed gaps 1 and 2 (bash/zsh PTY dispatch runs from a private
// script, in band, as one input line). TRD 73-03 closed gap 3 (the detector
// listens to the live window only). Their regression tests live in
// watcher-shell.test.cjs and watcher-daemon.test.cjs; this suite proves the same
// path through the real daemon.
//
// Cassette pattern (matches obj 1 TRD 01-06): JSON in __fixtures__/handoff-cassettes/,
// hand-built minimal until live re-record is convenient. Replay-only in CI.
// ---------------------------------------------------------------------------

describe('handoff pipeline — PTY-path mock auth (TRD 19-05)', () => {
  // Behavior list — see header block above for MA-1 through MA-8.

  function ptyAvailable() {
    try { require('node-pty'); return true; } catch { return false; }
  }
  function ghAvailable() {
    try {
      const r = spawnSync('gh', ['--version'], { stdio: 'ignore' });
      return r.status === 0;
    } catch { return false; }
  }
  function doctlAvailable() {
    try {
      const r = spawnSync('doctl', ['version'], { stdio: 'ignore' });
      return r.status === 0;
    } catch { return false; }
  }

  // Test allowlist that includes the new gh + doctl auth patterns plus
  // the benign builtins from the v1.1 baseline + a synth bash entry for the
  // MA-6-synth wiring test.
  const MOCK_AUTH_ALLOW_JSON = JSON.stringify({
    commands: [
      { pattern: '^echo\\b', label: 'test:echo' },
      { pattern: '^printf\\b', label: 'test:printf' },
      { pattern: '^true\\b', label: 'test:true' },
      { pattern: '^gh\\s+auth\\s+login\\b', label: 'test:gh-auth-login' },
      { pattern: '^doctl\\s+auth\\s+init\\b', label: 'test:doctl-auth-init' },
      { pattern: '^bash\\s+-c\\s+', label: 'test:bash-c-synth' },
    ],
  });

  function writeMockAllowFile(home) {
    const dir = runtimeHome(home);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'aoforge-watch-allow.json');
    fs.writeFileSync(file, MOCK_AUTH_ALLOW_JSON);
    return file;
  }

  async function withDaemonAndMocks(spawnOpts, fn) {
    const { home, project, mockGhPort, mockDoctlPort, doToken } = spawnOpts;
    const env = {
      ...process.env,
      HOME: home,
      // Redirect gh + doctl at the mock servers. gh respects GH_HOST;
      // doctl respects DIGITALOCEAN_API_URL. TLS is NOT required for
      // local mocks (both tools accept HTTP when the env vars carry
      // an http:// URL or a bare host:port without scheme).
      GH_HOST: `127.0.0.1:${mockGhPort}`,
      DIGITALOCEAN_API_URL: `http://127.0.0.1:${mockDoctlPort}/`,
      DIGITALOCEAN_TOKEN: doToken == null ? '' : doToken,
    };
    // Hermetic: doctl reads DIGITALOCEAN_ACCESS_TOKEN from the environment and, when it is set, `doctl auth init`
    // finishes without prompting (exit 0). A developer shell that exports it turned MA-7's "no token" case into a
    // success. The mocks carry their own token via DIGITALOCEAN_TOKEN, so the ambient one is never wanted here.
    delete env.DIGITALOCEAN_ACCESS_TOKEN;
    const child = spawn('node', [CLI, 'start',
      '--project', project,
      '--shell', 'bash',
      '--foreground',
    ], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    // These are the tests that used to leave a dispatch hanging (MA-6-synth and
    // MA-7 gave up on a gap while the daemon was still waiting for a sentinel
    // that never came), so they are the ones whose daemons actually leaked.
    // Same teardown contract as withDaemon — issue #93.
    let log = '';
    const keep = (c) => { log = (log + c).slice(-4096); };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('error', () => {});

    // Wait for PID file with our child's pid (mirrors withDaemon)
    const pidFile = watchPidFile(home);
    const start = Date.now();
    while (Date.now() - start < 5000) {
      try {
        if (fs.existsSync(pidFile)) {
          const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
          if (info && info.pid === child.pid) break;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 50));
    }

    let primary = null;
    try {
      await fn(child);
    } catch (e) {
      primary = e;
    }
    const leak = await stopDaemon(child);
    if (primary) throw primary;
    if (leak) throw new Error(`${leak}\n--- daemon output (tail) ---\n${log}`);
  }

  // THE OTHER HALF OF #93's WEDGE, and the same blindness that produced it.
  //
  // afterEach below closes the mock servers — and on node 22 it NEVER RUNS for
  // a test that calls t.skip() at runtime. Three of this suite's tests did
  // exactly that when this was written (MA-6-synth on a gap that is now closed;
  // MA-7 and MA-6 when doctl is absent, which is the case on ubuntu-latest), so
  // six HTTP servers were left listening and the file could not exit: 27s of
  // tests, then 153s
  // of nothing, then 'test timed out after 180000ms'. Measured on node 22 in a
  // container: beforeEach ran 7 times, afterEach 4.
  //
  // node 25 — what a developer here actually runs — does run the hook, so the
  // file exits locally and the wedge is Linux/node-22-only, exactly like the
  // bracketed-paste bug in the same PR.
  //
  // Two changes, because relying on the hook is what failed:
  //   1. unref() every fixture server. A mock that exists to answer requests
  //      during one test must never be the reason node cannot exit, on any
  //      runner and under any hook semantics.
  //   2. Track them and close whatever survives in a suite-level after(),
  //      which runs once and does not depend on per-test hook behaviour.
  const liveServers = new Set();

  async function closeServer(server) {
    if (!server) return;
    liveServers.delete(server);
    if (!server.listening) return;
    // closeAllConnections first: close() alone waits for keep-alive sockets,
    // and a mock whose client went away with a socket open would hang here.
    try { server.closeAllConnections(); } catch {}
    await new Promise((r) => { try { server.close(() => r()); } catch { r(); } });
  }

  let home, project, mockGh, mockDoctl, mockGhPort, mockDoctlPort;
  beforeEach(async () => {
    home = mkTmp();
    project = mkTmp();
    fs.mkdirSync(path.join(project, '.aoforge-handoff', 'pending'), { recursive: true });
    if (!ptyAvailable()) return;

    const { mockGhServer, mockDoctlServer } = require('./__fixtures__/mock-auth-servers.cjs');
    mockGh = mockGhServer();
    mockDoctl = mockDoctlServer();
    await new Promise((r, rej) => {
      mockGh.once('error', rej);
      mockGh.listen(0, '127.0.0.1', () => r());
    });
    await new Promise((r, rej) => {
      mockDoctl.once('error', rej);
      mockDoctl.listen(0, '127.0.0.1', () => r());
    });
    mockGh.unref();
    mockDoctl.unref();
    liveServers.add(mockGh);
    liveServers.add(mockDoctl);
    mockGhPort = mockGh.address().port;
    mockDoctlPort = mockDoctl.address().port;
  });
  afterEach(async () => {
    await closeServer(mockGh);
    await closeServer(mockDoctl);
    mockGh = null; mockDoctl = null; mockGhPort = null; mockDoctlPort = null;
    rmTmp(home); rmTmp(project);
  });
  after(async () => {
    // Whatever afterEach did not get to — i.e. every skipped test's pair.
    for (const s of Array.from(liveServers)) await closeServer(s);
  });

  test('MA-2 mockGhServer responds to POST /login/device/code with cassette', { timeout: 10000 }, async (t) => {
    if (!ptyAvailable()) return t.skip('node-pty unavailable');

    const body = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port: mockGhPort,
        method: 'POST', path: '/login/device/code',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }, (res) => {
        let buf = '';
        res.on('data', (c) => { buf += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: buf }));
      });
      req.on('error', reject);
      req.end('client_id=fake&scope=repo');
    });

    assert.equal(body.status, 200, 'POST /login/device/code should return 200');
    const json = JSON.parse(body.body);
    assert.ok(json.device_code, 'response should include device_code');
    assert.ok(json.user_code, 'response should include user_code');
    assert.ok(json.verification_uri, 'response should include verification_uri');
  });

  test('MA-3 mockGhServer responds to POST /login/oauth/access_token with cassette', { timeout: 10000 }, async (t) => {
    if (!ptyAvailable()) return t.skip('node-pty unavailable');

    const body = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port: mockGhPort,
        method: 'POST', path: '/login/oauth/access_token',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }, (res) => {
        let buf = '';
        res.on('data', (c) => { buf += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: buf }));
      });
      req.on('error', reject);
      req.end('device_code=x&grant_type=urn:ietf:params:oauth:grant-type:device_code');
    });

    assert.equal(body.status, 200);
    const json = JSON.parse(body.body);
    assert.ok(json.access_token, 'response should include access_token');
    assert.ok(json.token_type, 'response should include token_type');
  });

  test('MA-4 mockDoctlServer responds to GET /v2/account with cassette', { timeout: 10000 }, async (t) => {
    if (!ptyAvailable()) return t.skip('node-pty unavailable');

    const body = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port: mockDoctlPort,
        method: 'GET', path: '/v2/account',
        headers: { 'Authorization': 'Bearer fake-token' },
      }, (res) => {
        let buf = '';
        res.on('data', (c) => { buf += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: buf }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.equal(body.status, 200);
    const json = JSON.parse(body.body);
    assert.ok(json.account, 'response should include account object');
    assert.ok(json.account.uuid, 'account should include uuid');
  });

  test('MA-2b mock unknown path returns 404 with diagnostic body', { timeout: 5000 }, async (t) => {
    if (!ptyAvailable()) return t.skip('node-pty unavailable');

    const body = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port: mockGhPort,
        method: 'GET', path: '/this/path/does/not/exist',
      }, (res) => {
        let buf = '';
        res.on('data', (c) => { buf += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: buf }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.equal(body.status, 404);
    const json = JSON.parse(body.body);
    assert.match(json.error, /no cassette match/i);
  });

  test('MA-6-synth synthetic prompt cmd via PTY with inputs.secrets[env] — done, secret consumed and redacted', { timeout: 25000 }, async (t) => {
    if (!ptyAvailable()) return t.skip('node-pty unavailable');

    writeMockAllowFile(home);
    const fakeToken = 'synth-token-abcdefghij1234567890';  // > MIN_REDACT_LEN=8

    // Synthetic command: writes its prompt to /dev/tty, reads the answer from
    // stdin and echoes it to stdout. It exercises the SAME e2e pipeline
    // doctl/gh use: TEST_ALLOW_JSON entry, inputs.secrets[env] resolution,
    // prompt detector, injectInput, in-band capture, redaction-at-end.
    const synthCmd = `bash -c 'printf "Enter your access token: " > /dev/tty; read TOK; echo "got=$TOK"'`;

    await withDaemonAndMocks({ home, project, mockGhPort, mockDoctlPort, doToken: fakeToken }, async () => {
      const pendingPath = path.join(project, '.aoforge-handoff', 'pending', 'h-synth-ok.json');
      fs.writeFileSync(pendingPath, JSON.stringify({
        id: 'h-synth-ok',
        cmd: synthCmd,
        cwd: project,
        status: 'pending',
        source: 'hook',
        created_at: new Date().toISOString(),
        inputs: {
          secrets: [
            { prompt_match: 'access token', value_source: 'env', value_ref: 'DIGITALOCEAN_TOKEN' },
          ],
        },
      }, null, 2) + '\n');

      const done = await waitForDoneRecord(project, 'h-synth-ok', 15000);

      assert.equal(done.status, 'done', `expected status=done, got ${done.status} (stderr: ${(done.stderr || '').slice(0, 300)})`);
      assert.equal(done.exit_code, 0);
      const tokenRx = new RegExp(fakeToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      assert.doesNotMatch(done.stdout || '', tokenRx, `fake token must be redacted from stdout (raw stdout: ${JSON.stringify(done.stdout)})`);
      assert.doesNotMatch(done.stderr || '', tokenRx, 'fake token must be redacted from stderr');
      // `got=<redacted>` proves the command read the injected value, not a wrapper line.
      assert.match(done.stdout || '', /got=\*\*\*REDACTED\*\*\*/, `stdout was ${JSON.stringify(done.stdout)}`);
    });
  });

  test('MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — fails promptly with the secret-resolution message', { timeout: 30000 }, async (t) => {
    if (!ptyAvailable()) return t.skip('node-pty unavailable');
    if (!doctlAvailable()) return t.skip('doctl unavailable');

    writeMockAllowFile(home);

    await withDaemonAndMocks({ home, project, mockGhPort, mockDoctlPort, doToken: '' }, async () => {
      const pendingPath = path.join(project, '.aoforge-handoff', 'pending', 'h-do-secfail.json');
      fs.writeFileSync(pendingPath, JSON.stringify({
        id: 'h-do-secfail',
        cmd: 'doctl auth init',
        cwd: project,
        status: 'pending',
        source: 'hook',
        created_at: new Date().toISOString(),
        inputs: {
          secrets: [
            { prompt_match: 'access token', value_source: 'env', value_ref: 'DIGITALOCEAN_TOKEN' },
          ],
        },
      }, null, 2) + '\n');

      // waitForDoneRecord throws on timeout: a dispatch that hangs fails here
      // instead of being waved through.
      const done = await waitForDoneRecord(project, 'h-do-secfail', 20000);

      const detail = JSON.stringify({ status: done.status, exit_code: done.exit_code, stderr: (done.stderr || '').slice(0, 400) });
      assert.notEqual(done.status, 'timeout', `the dispatch must not time out; got ${detail}`);
      assert.equal(done.status, 'failed', `expected status=failed; got ${detail}`);
      assert.match(done.stderr || '', /secret resolution failed/, `got ${detail}`);
      assert.match(done.stderr || '', /DIGITALOCEAN_TOKEN/, `got ${detail}`);
    });
  });

  test('MA-6 doctl auth init via PTY against mockDoctl — doctl gets a terminal, the prompt is answered once, the token is redacted', { timeout: 45000 }, async (t) => {
    if (!ptyAvailable()) return t.skip('node-pty unavailable');
    if (!doctlAvailable()) return t.skip('doctl unavailable');

    writeMockAllowFile(home);
    const fakeToken = 'do-test-token-1234567890abcdefghij';  // > MIN_REDACT_LEN=8

    await withDaemonAndMocks({ home, project, mockGhPort, mockDoctlPort, doToken: fakeToken }, async () => {
      const pendingPath = path.join(project, '.aoforge-handoff', 'pending', 'h-do-ok.json');
      fs.writeFileSync(pendingPath, JSON.stringify({
        id: 'h-do-ok',
        cmd: 'doctl auth init',
        cwd: project,
        status: 'pending',
        source: 'hook',
        created_at: new Date().toISOString(),
        inputs: {
          secrets: [
            { prompt_match: 'access token', value_source: 'env', value_ref: 'DIGITALOCEAN_TOKEN' },
          ],
        },
      }, null, 2) + '\n');

      const done = await waitForDoneRecord(project, 'h-do-ok', 40000);

      // Not asserted: status 'done'. doctl's bubble-tea input rejects a token that is not
      // in its expected shape, keeps the prompt on screen and redraws it on every cursor
      // blink, and the duplicate-prompt guard (correctly) reads that as a rejected value
      // and sends Ctrl+C. A well-formed token passes the input and doctl then validates it
      // against cloud.digitalocean.com, not against DIGITALOCEAN_API_URL, so the mock never
      // sees the request. Neither is one of the three gaps, and neither is widened away
      // here (TRD 73-03 error_recovery). What holds, and is asserted:
      const combined = `${done.stdout || ''}${done.stderr || ''}`;
      assert.doesNotMatch(combined, /unknown terminal/i, 'gap 1 stays closed: doctl has a terminal on fd 1 and fd 2');
      assert.notEqual(done.status, 'timeout', 'the detector\'s Ctrl+C reaches doctl, so the dispatch ends instead of hanging');
      const tokenRx = new RegExp(fakeToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      assert.doesNotMatch(done.stdout || '', tokenRx, 'fake token must be redacted from stdout');
      assert.doesNotMatch(done.stderr || '', tokenRx, 'fake token must be redacted from stderr');
      // The observed outcome, so a future change in doctl or in the guard shows up in the run.
      t.diagnostic(`MA-6 observed: status=${done.status} exit_code=${done.exit_code} stderr=${JSON.stringify((done.stderr || '').slice(0, 200))}`);
    });
  });
});
