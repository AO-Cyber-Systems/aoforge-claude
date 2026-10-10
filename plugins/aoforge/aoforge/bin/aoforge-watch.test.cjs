'use strict';

/**
 * Integration tests for aoforge-watch CLI.
 *
 * Each test sandboxes HOME so PID files / logs land in a temp dir.
 * Tests are limited to ~6 (status, logs, stop idempotency, start/stop
 * foreground, stale-PID-cleanup) per the TRD note. Loop-level coverage
 * lives in watcher-daemon.test.cjs.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const { watchStateDir, runtimeHome } = require('./lib/compat.cjs');

const CLI = path.join(__dirname, 'aoforge-watch.cjs');

// The daemon keeps its pid file and log in the watch state directory (TRD 73-12).
const PID_NAME = 'aoforge-watch.pid';
const LOG_NAME = 'aoforge-watch.log';
function watchPidFile(home) { return path.join(watchStateDir(home), PID_NAME); }
function watchLogFile(home) { return path.join(watchStateDir(home), LOG_NAME); }
// Where AOForge 3.0.0 kept them: read (the pid file also cleared) for one release, removed with the shims after 3.0.0.
function interimFile(home, name) { return path.join(home, '.aoforge', name); }

function writePidRecord(file, record) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    version: '0.0.0', shell: 'bash', watching: [], started_at: new Date().toISOString(), ...record,
  }));
  return file;
}

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dfw-cli-'));
}

function rmTmp(d) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
}

function runCli(args, env = {}, opts = {}) {
  try {
    const out = execFileSync('node', [CLI, ...args], {
      encoding: 'utf-8',
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
      ...opts,
    });
    return { ok: true, stdout: out, stderr: '', code: 0 };
  } catch (e) {
    return {
      ok: false,
      stdout: e.stdout?.toString() || '',
      stderr: e.stderr?.toString() || e.message,
      code: e.status,
    };
  }
}

async function spawnForegroundDaemon(home, projectRoot) {
  const child = spawn('node', [CLI, 'start', '--project', projectRoot, '--foreground', '--shell', 'bash'], {
    env: { ...process.env, HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Wait for PID file to record THIS child's pid (not a stale pid that was
  // already in the file when we started).
  const pidFile = watchPidFile(home);
  const start = Date.now();
  while (Date.now() - start < 3000) {
    try {
      if (fs.existsSync(pidFile)) {
        const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
        if (info && info.pid === child.pid) break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 25));
  }
  return { child, pidFile };
}

/** Write `count` lines `<prefix>-1` .. `<prefix>-<count>` to a log file. */
function writeLogLines(file, prefix, count) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Array.from({ length: count }, (_, i) => `${prefix}-${i + 1}`).join('\n') + '\n');
  return file;
}

/**
 * A live process the test owns, standing in for a daemon AOForge 3.0.0 started. Never the test runner's own pid:
 * `stop` signals the pid it reads.
 */
function spawnSleeper() {
  return spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
}

async function stopSleeper(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const gone = new Promise((resolve) => child.once('exit', resolve));
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
  await gone;
}

/**
 * The CLI without blocking this process's event loop, so a child of this process that the CLI signals is reaped
 * (a zombie still answers kill(pid, 0), which would read as a live daemon).
 */
function runCliAsync(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 15000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

/** Wait for a child to exit; true when it did within `ms`. */
function waitForChildExit(child, ms) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), ms);
    child.once('exit', () => { clearTimeout(t); resolve(true); });
  });
}

/** SIGTERM a daemon this test spawned, SIGKILL it if it outlives the stop budget. Never leaks it. */
async function endDaemon(child) {
  try { child.kill('SIGTERM'); } catch { /* gone */ }
  if (!(await waitForChildExit(child, 6000))) {
    try { child.kill('SIGKILL'); } catch { /* gone */ }
    await waitForChildExit(child, 2000);
  }
}

// ---------------------------------------------------------------------------
// status — fast, no daemon spawn
// ---------------------------------------------------------------------------

describe('aoforge-watch status', () => {
  let home;
  beforeEach(() => { home = mkTmp(); });
  afterEach(() => rmTmp(home));

  test('reports running:false when no PID file exists', () => {
    const r = runCli(['status'], { HOME: home });
    assert.ok(r.ok, `failed: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.running, false);
    assert.equal(out.pid, null);
    assert.ok(typeof out.allowlist_size === 'number' && out.allowlist_size > 0);
  });

  test('reports running:false + stale_pid_file when PID file points to dead pid', () => {
    writePidRecord(watchPidFile(home), { pid: 999999 });
    const r = runCli(['status'], { HOME: home });
    assert.ok(r.ok);
    const out = JSON.parse(r.stdout);
    assert.equal(out.running, false);
    assert.equal(out.stale_pid_file, true);
  });
});

// ---------------------------------------------------------------------------
// stop — idempotency
// ---------------------------------------------------------------------------

describe('aoforge-watch stop', () => {
  let home;
  beforeEach(() => { home = mkTmp(); });
  afterEach(() => rmTmp(home));

  test('idempotent: prints "not running" exit 0 when no daemon', () => {
    const r = runCli(['stop'], { HOME: home });
    assert.ok(r.ok, `failed: ${r.stderr}`);
    assert.match(r.stdout, /not running/);
  });

  test('cleans up stale PID file', () => {
    const pidFile = writePidRecord(watchPidFile(home), { pid: 999999 });
    const r = runCli(['stop'], { HOME: home });
    assert.ok(r.ok);
    assert.match(r.stdout, /stale/);
    assert.ok(!fs.existsSync(pidFile));
  });
});

// ---------------------------------------------------------------------------
// start — foreground lifecycle (slow: spawns real daemon)
// ---------------------------------------------------------------------------

describe('aoforge-watch start (foreground) + stop', () => {
  let home, project;
  beforeEach(() => {
    home = mkTmp();
    project = mkTmp();
    fs.mkdirSync(path.join(project, '.aoforge-handoff', 'pending'), { recursive: true });
  });
  afterEach(() => { rmTmp(home); rmTmp(project); });

  test('foreground daemon writes PID file, status reports running, stop kills it', async () => {
    const { child, pidFile } = await spawnForegroundDaemon(home, project);
    try {
      assert.ok(fs.existsSync(pidFile), 'PID file should be created');
      const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
      assert.equal(info.pid, child.pid);
      assert.equal(info.shell, 'bash');
      assert.deepEqual(info.watching, [project]);

      // status reports running
      const status = runCli(['status'], { HOME: home });
      const out = JSON.parse(status.stdout);
      assert.equal(out.running, true);
      assert.equal(out.pid, child.pid);

      // stop ends it cleanly
      const stop = runCli(['stop'], { HOME: home });
      assert.ok(stop.ok, `stop failed: ${stop.stderr}`);
      assert.match(stop.stdout, /stopped/);
      assert.ok(!fs.existsSync(pidFile), 'PID file should be removed by daemon shutdown');

      // child should exit shortly after SIGTERM
      const exited = await new Promise((resolve) => {
        const t = setTimeout(() => resolve(false), 3000);
        child.on('exit', () => { clearTimeout(t); resolve(true); });
      });
      assert.ok(exited, 'daemon should exit after SIGTERM');
    } finally {
      try { child.kill('SIGKILL'); } catch {}
    }
  });

  test('start refuses when daemon already running', async () => {
    const { child } = await spawnForegroundDaemon(home, project);
    try {
      const r = runCli(['start', '--project', project, '--foreground'], { HOME: home });
      assert.equal(r.ok, false);
      assert.match(r.stderr, /already running/);
      assert.equal(r.code, 2);
    } finally {
      try { child.kill('SIGTERM'); } catch {}
      // brief wait for cleanup
      await new Promise(r => setTimeout(r, 200));
    }
  });

  test('start cleans up stale PID file and starts fresh', async () => {
    // Pre-write a stale PID file pointing at a dead pid
    writePidRecord(watchPidFile(home), { pid: 999999 });

    const { child, pidFile } = await spawnForegroundDaemon(home, project);
    try {
      assert.ok(fs.existsSync(pidFile));
      const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
      assert.equal(info.pid, child.pid, 'new daemon should overwrite stale pid');
    } finally {
      try { child.kill('SIGTERM'); } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
  });
});

// ---------------------------------------------------------------------------
// logs
// ---------------------------------------------------------------------------

describe('aoforge-watch logs', () => {
  let home;
  beforeEach(() => { home = mkTmp(); });
  afterEach(() => rmTmp(home));

  test('reports "no log file yet" when nothing has run', () => {
    const r = runCli(['logs'], { HOME: home });
    assert.ok(r.ok);
    assert.match(r.stdout, /no log file/);
  });

  test('--tail N returns the last N lines', () => {
    writeLogLines(watchLogFile(home), 'line', 20);
    const r = runCli(['logs', '--tail', '5'], { HOME: home });
    assert.ok(r.ok);
    const out = r.stdout.split('\n').filter(Boolean);
    assert.equal(out.length, 5);
    assert.equal(out[0], 'line-16');
    assert.equal(out[4], 'line-20');
  });
});

// ===========================================================================
// TRD 73-12 — the daemon's files live in the watch state directory
//
// Test list items 1-5. The daemon writes its pid file and log under
// compat.watchStateDir(home) and never creates <home>/.aoforge. A daemon AOForge
// 3.0.0 started keeps its pid file at <home>/.aoforge/aoforge-watch.pid: for one
// release that record is the same AOForge daemon (not legacy), so status, stop,
// start and add/remove-project see it, and stop/start clear it.
// ===========================================================================

describe('aoforge-watch files in the watch state directory (TRD 73-12)', () => {
  let home, project;
  beforeEach(() => {
    home = mkTmp();
    project = mkTmp();
    fs.mkdirSync(path.join(project, '.aoforge-handoff', 'pending'), { recursive: true });
  });
  afterEach(() => { rmTmp(home); rmTmp(project); });

  test('1. start --foreground keeps its pid file and log in the watch state directory and never creates <home>/.aoforge', async () => {
    const { child } = await spawnForegroundDaemon(home, project);
    try {
      assert.ok(fs.existsSync(watchPidFile(home)), 'the pid file is in the watch state directory while running');
      assert.equal(JSON.parse(fs.readFileSync(watchPidFile(home), 'utf8')).pid, child.pid);
      assert.ok(fs.existsSync(watchLogFile(home)), 'the log is in the watch state directory');

      child.kill('SIGTERM');
      assert.ok(await waitForChildExit(child, 8000), 'the daemon exits on SIGTERM');
      assert.equal(fs.existsSync(watchPidFile(home)), false, 'the daemon removes its pid file on exit');
      assert.equal(fs.existsSync(path.join(home, '.aoforge')), false, 'no <home>/.aoforge is ever created');
    } finally {
      try { child.kill('SIGKILL'); } catch { /* gone */ }
    }
  });

  test('2. logs reads the watch-directory log, or for one release the 3.0.0 log when the new one does not exist', () => {
    writeLogLines(interimFile(home, LOG_NAME), 'old', 12);
    const onlyOld = runCli(['logs', '--tail', '3'], { HOME: home });
    assert.ok(onlyOld.ok, onlyOld.stderr);
    assert.deepEqual(onlyOld.stdout.split('\n').filter(Boolean), ['old-10', 'old-11', 'old-12']);

    writeLogLines(watchLogFile(home), 'new', 8);
    const both = runCli(['logs', '--tail', '3'], { HOME: home });
    assert.ok(both.ok, both.stderr);
    assert.deepEqual(both.stdout.split('\n').filter(Boolean), ['new-6', 'new-7', 'new-8'], 'the new log wins');
  });

  test('3. a live 3.0.0 daemon: status reports it, start refuses, and stop ends it and clears its pid file', async () => {
    const sleeper = spawnSleeper();
    try {
      const interim = writePidRecord(interimFile(home, PID_NAME), { pid: sleeper.pid, version: '3.0.0', watching: [project] });

      const status = JSON.parse(runCli(['status'], { HOME: home }).stdout);
      assert.equal(status.running, true);
      assert.equal(status.pid, sleeper.pid);
      assert.deepEqual(status.projects, [project]);

      const start = runCli(['start', '--project', project, '--foreground'], { HOME: home });
      assert.equal(start.code, 2, `start should refuse: ${start.stdout}${start.stderr}`);
      assert.match(start.stderr, /already running/);
      assert.equal(fs.existsSync(watchPidFile(home)), false, 'the refused start wrote no pid file');

      const stop = await runCliAsync(['stop'], { HOME: home });
      assert.ok(stop.ok, `stop failed: ${stop.stdout}${stop.stderr}`);
      assert.match(stop.stdout, /stopped/);
      assert.ok(await waitForChildExit(sleeper, 5000), 'stop signalled the 3.0.0 daemon');
      assert.equal(fs.existsSync(interim), false, 'stop clears the 3.0.0 pid file');
    } finally {
      await stopSleeper(sleeper);
    }
  });

  test('4. a stale 3.0.0 pid file: stop removes it, and start removes it and starts', async () => {
    const interim = writePidRecord(interimFile(home, PID_NAME), { pid: 999999, version: '3.0.0' });
    const stop = runCli(['stop'], { HOME: home });
    assert.ok(stop.ok, stop.stderr);
    assert.match(stop.stdout, /stale|not running/);
    assert.equal(fs.existsSync(interim), false, 'stop clears the stale 3.0.0 record');

    writePidRecord(interim, { pid: 999999, version: '3.0.0' });
    const { child } = await spawnForegroundDaemon(home, project);
    try {
      assert.equal(fs.existsSync(interim), false, 'start clears the stale 3.0.0 record');
      assert.ok(fs.existsSync(watchPidFile(home)), 'and writes its own in the watch state directory');
      assert.equal(JSON.parse(fs.readFileSync(watchPidFile(home), 'utf8')).pid, child.pid);
    } finally {
      await endDaemon(child);
    }
  });

  test('5. add-project / remove-project with a live 3.0.0 daemon rewrite its own pid file', async () => {
    const sleeper = spawnSleeper();
    const other = mkTmp();
    try {
      const interim = writePidRecord(interimFile(home, PID_NAME), { pid: sleeper.pid, version: '3.0.0', watching: [project] });

      const add = runCli(['add-project', other], { HOME: home });
      assert.ok(add.ok, `add-project failed: ${add.stderr}`);
      assert.deepEqual(JSON.parse(fs.readFileSync(interim, 'utf8')).watching, [project, other],
        'the running 3.0.0 daemon rereads its own file, so that file is rewritten');

      const remove = runCli(['remove-project', project], { HOME: home });
      assert.ok(remove.ok, `remove-project failed: ${remove.stderr}`);
      assert.deepEqual(JSON.parse(fs.readFileSync(interim, 'utf8')).watching, [other]);
      assert.equal(fs.existsSync(watchPidFile(home)), false, 'no new-location pid file is created');
    } finally {
      await stopSleeper(sleeper);
      rmTmp(other);
    }
  });
});

// ===========================================================================
// TRD 20-02 Group C — install-service / uninstall-service CLI subcommands
// ===========================================================================

const fxBin = require('./lib/__fixtures__/daemon-polish-fixtures.cjs');

describe('aoforge-watch install-service / uninstall-service (TRD 20-02)', () => {
  let home, tmp, shimEnv;
  beforeEach(() => {
    home = mkTmp();
    tmp = mkTmp();
    // Set up launchctl + systemctl shims on PATH so install-service doesn't
    // hit real system tools. Fixture overrides PATH; we pass that through to
    // the subprocess via env.
    shimEnv = {
      launchctl: fxBin.buildLaunchctlShimEnv(tmp),
      systemctl: fxBin.buildSystemctlShimEnv(tmp),
    };
  });
  afterEach(() => {
    if (shimEnv) {
      shimEnv.launchctl.cleanup();
      shimEnv.systemctl.cleanup();
    }
    rmTmp(home);
    rmTmp(tmp);
  });

  // Helper: build env for spawned CLI that includes shim PATH + tmp HOME
  function shimCliEnv() {
    return {
      HOME: home,
      PATH: process.env.PATH,
      LAUNCHCTL_SHIM_MARKER_FILE: shimEnv.launchctl.markerFile,
      SYSTEMCTL_SHIM_MARKER_FILE: shimEnv.systemctl.markerFile,
    };
  }

  test('C-1 install-service invokes installer with current platform + cwd', () => {
    if (process.platform !== 'darwin' && process.platform !== 'linux') {
      // Skip on win32 — covered by C-5
      return;
    }
    const r = runCli(['install-service', '--project', home], shimCliEnv());
    assert.ok(r.ok, `failed: ${r.stderr}`);
    assert.match(r.stdout, /service installed/i);
    // Verify shim was called
    const markerFile = process.platform === 'darwin'
      ? shimEnv.launchctl.markerFile
      : shimEnv.systemctl.markerFile;
    const calls = fxBin.readShimCalls(markerFile);
    assert.ok(calls.length > 0, `${process.platform} shim should have been called`);
  });

  test('C-2 uninstall-service invokes installer.uninstallService', () => {
    if (process.platform !== 'darwin' && process.platform !== 'linux') return;
    // Pre-install via direct module call so uninstall has something to remove
    const r = runCli(['uninstall-service'], shimCliEnv());
    // Uninstall is idempotent — should succeed even when nothing installed
    assert.ok(r.ok || r.code === 0, `uninstall-service failed: ${r.stderr}`);
  });

  test('C-5 install-service on unsupported platform exits 1 with clear message', () => {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      // We can't easily simulate win32 from an actual macOS/linux runtime.
      // The CLI's platform check is `process.platform`. Skip gracefully.
      return;
    }
    const r = runCli(['install-service'], shimCliEnv());
    assert.equal(r.ok, false);
    assert.match(r.stderr, /unsupported platform/i);
    assert.equal(r.code, 1);
  });

  test('C-6 install-service --project /custom/path passes /custom/path to installer', () => {
    if (process.platform !== 'darwin' && process.platform !== 'linux') return;
    const customProject = mkTmp();
    try {
      const r = runCli(['install-service', '--project', customProject], shimCliEnv());
      assert.ok(r.ok, `failed: ${r.stderr}`);
      // Verify the service file content references customProject
      let serviceFile;
      if (process.platform === 'darwin') {
        serviceFile = path.join(home, 'Library', 'LaunchAgents', 'com.aocyber.aoforge-watch.plist');
      } else {
        serviceFile = path.join(home, '.config', 'systemd', 'user', 'aoforge-watch.service');
      }
      assert.ok(fs.existsSync(serviceFile));
      const content = fs.readFileSync(serviceFile, 'utf8');
      assert.ok(content.includes(customProject), 'service file references --project value');
    } finally {
      rmTmp(customProject);
    }
  });

  test('C-7 help / no args lists install-service / uninstall-service', () => {
    const r = runCli([], { HOME: home });
    assert.equal(r.ok, false);
    assert.match(r.stderr, /install-service/);
    assert.match(r.stderr, /uninstall-service/);
  });
});

// ===========================================================================
// TRD 20-03 Group C — multi-project CLI subcommands
// ===========================================================================

describe('aoforge-watch multi-project CLI (TRD 20-03)', () => {
  let home;
  beforeEach(() => { home = mkTmp(); });
  afterEach(() => rmTmp(home));

  test('C-2 start --project /p (single) writes watching:[/p] (back-compat)', async () => {
    const project = mkTmp();
    let child = null;
    try {
      child = spawn('node', [CLI, 'start', '--project', project, '--foreground', '--shell', 'bash'], {
        env: { ...process.env, HOME: home },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const pidFile = watchPidFile(home);
      const start = Date.now();
      while (Date.now() - start < 3000) {
        try {
          if (fs.existsSync(pidFile)) {
            const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
            if (info && info.pid === child.pid) break;
          }
        } catch {}
        await new Promise(r => setTimeout(r, 25));
      }
      const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
      assert.deepEqual(info.watching, [project], 'single-project back-compat preserved');
      try { child.kill('SIGTERM'); } catch {}
      await new Promise(r => setTimeout(r, 200));
    } finally {
      // A failed assertion above must not leak the daemon: its pipes would keep this test file alive.
      if (child) await endDaemon(child);
      rmTmp(project);
    }
  });

  test('C-1 start --project /p1,/p2 writes watching:[/p1, /p2]', async () => {
    const p1 = mkTmp();
    const p2 = mkTmp();
    let child = null;
    try {
      child = spawn('node', [CLI, 'start', '--project', `${p1},${p2}`, '--foreground', '--shell', 'bash'], {
        env: { ...process.env, HOME: home },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const pidFile = watchPidFile(home);
      const start = Date.now();
      while (Date.now() - start < 3000) {
        try {
          if (fs.existsSync(pidFile)) {
            const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
            if (info && info.pid === child.pid && info.watching && info.watching.length === 2) break;
          }
        } catch {}
        await new Promise(r => setTimeout(r, 25));
      }
      const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
      assert.equal(info.watching.length, 2, 'two projects in watching array');
      assert.ok(info.watching.includes(p1));
      assert.ok(info.watching.includes(p2));
      try { child.kill('SIGTERM'); } catch {}
      await new Promise(r => setTimeout(r, 200));
    } finally {
      if (child) await endDaemon(child);
      rmTmp(p1);
      rmTmp(p2);
    }
  });

  test('C-4 add-project when daemon dead exits 2 + clear message', () => {
    const r = runCli(['add-project', '/some/path'], { HOME: home });
    assert.equal(r.ok, false);
    assert.match(r.stderr, /not running|daemon.*not.*running/i);
    assert.equal(r.code, 2);
  });

  test('C-6 remove-project when /p not watched exits 0 (idempotent — no PID file)', () => {
    const r = runCli(['remove-project', '/some/path'], { HOME: home });
    // Idempotent: success exit code even when daemon not running
    assert.ok(r.ok, `expected idempotent success: ${r.stderr}`);
  });

  test('C-7 status JSON contains projects:[...] (plural) AND project (singular)', async () => {
    // Pre-write a PID file simulating a dead daemon with multi-project
    const pidDir = watchStateDir(home);
    fs.mkdirSync(pidDir, { recursive: true });
    const p1 = mkTmp();
    const p2 = mkTmp();
    try {
      fs.writeFileSync(
        path.join(pidDir, 'aoforge-watch.pid'),
        JSON.stringify({ pid: 999999, version: '0.1.0', shell: 'bash', watching: [p1, p2], started_at: new Date().toISOString() }),
      );
      const r = runCli(['status'], { HOME: home });
      assert.ok(r.ok, `failed: ${r.stderr}`);
      const out = JSON.parse(r.stdout);
      assert.ok(Array.isArray(out.projects), 'projects key is array');
      assert.equal(out.projects.length, 2);
      assert.equal(out.project, p1, 'project (singular) = first watching entry');
    } finally {
      rmTmp(p1);
      rmTmp(p2);
    }
  });

  test('C-8 status JSON contains pending_counts per-project map', async () => {
    const pidDir = watchStateDir(home);
    fs.mkdirSync(pidDir, { recursive: true });
    const p1 = mkTmp();
    const p2 = mkTmp();
    try {
      fs.mkdirSync(path.join(p1, '.aoforge-handoff', 'pending'), { recursive: true });
      fs.writeFileSync(path.join(p1, '.aoforge-handoff', 'pending', 'h-x.json'), '{"id":"h-x","cmd":"echo"}');
      fs.writeFileSync(
        path.join(pidDir, 'aoforge-watch.pid'),
        JSON.stringify({ pid: 999999, version: '0.1.0', shell: 'bash', watching: [p1, p2], started_at: new Date().toISOString() }),
      );
      const r = runCli(['status'], { HOME: home });
      assert.ok(r.ok);
      const out = JSON.parse(r.stdout);
      assert.equal(typeof out.pending_counts, 'object');
      assert.equal(out.pending_counts[p1], 1);
      assert.equal(out.pending_counts[p2], 0);
    } finally {
      rmTmp(p1);
      rmTmp(p2);
    }
  });

  test('C-9 status JSON contains pending_count (sum) for back-compat', async () => {
    const pidDir = watchStateDir(home);
    fs.mkdirSync(pidDir, { recursive: true });
    const p1 = mkTmp();
    try {
      fs.mkdirSync(path.join(p1, '.aoforge-handoff', 'pending'), { recursive: true });
      fs.writeFileSync(path.join(p1, '.aoforge-handoff', 'pending', 'h-x.json'), '{"id":"h-x"}');
      fs.writeFileSync(path.join(p1, '.aoforge-handoff', 'pending', 'h-y.json'), '{"id":"h-y"}');
      fs.writeFileSync(
        path.join(pidDir, 'aoforge-watch.pid'),
        JSON.stringify({ pid: 999999, version: '0.1.0', shell: 'bash', watching: [p1], started_at: new Date().toISOString() }),
      );
      const r = runCli(['status'], { HOME: home });
      assert.ok(r.ok);
      const out = JSON.parse(r.stdout);
      assert.equal(out.pending_count, 2, 'sum across projects');
    } finally {
      rmTmp(p1);
    }
  });

  test('C-11 help / usage line lists add-project / remove-project', () => {
    const r = runCli([], { HOME: home });
    assert.equal(r.ok, false);
    assert.match(r.stderr, /add-project/);
    assert.match(r.stderr, /remove-project/);
  });
});

// ===========================================================================
// TRD 73-05 — the attended foreground terminal (HND-03)
//
// `aoforge-watch start --foreground` in a real terminal mirrors a queued
// command's live output to that terminal and forwards the keys typed there to
// the command, so the USER answers the prompt. The tests below play the user:
// they run the daemon under a node-pty terminal, read what the daemon prints
// there, and type into it. AOForge injects nothing (no inputs.secrets).
//
// Each daemon is torn down by signalling its process group and then PROVING the
// pid is gone (the same discipline as handoff-e2e.test.cjs stopDaemon, issue
// #93): a leaked daemon is a hung test file, which is worse than a red one.
// ===========================================================================

const ATTEND_PTY_AVAILABLE = (() => { try { require('node-pty'); return true; } catch { return false; } })();
const attendPtySkip = ATTEND_PTY_AVAILABLE ? undefined : { skip: 'node-pty unavailable' };
// One options object: node:test takes (name, options, fn), so skip and timeout travel together.
const attendOpts = { ...(attendPtySkip || {}), timeout: 60000 };

const ATTEND_ALLOW_JSON = JSON.stringify({
  commands: [{ pattern: '^bash\\s+-c\\s+', label: 'test:bash-c' }],
});

// The user allowlist lives in the runtime home (TRD 73-11).
function writeAttendAllowFile(home) {
  const dir = runtimeHome(home);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'aoforge-watch-allow.json'), ATTEND_ALLOW_JSON);
}

function writeAttendPending(projectRoot, id, cmd) {
  const dir = path.join(projectRoot, '.aoforge-handoff', 'pending');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({
    id,
    cmd,
    cwd: projectRoot,
    status: 'pending',
    source: 'hook',
    created_at: new Date().toISOString(),
  }, null, 2) + '\n');
}

async function waitForAttendDone(projectRoot, id, timeoutMs = 20000) {
  const file = path.join(projectRoot, '.aoforge-handoff', 'done', `${id}.json`);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(file)) {
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* half-written */ }
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`done record ${id} did not appear within ${timeoutMs}ms`);
}

/** Poll a function until it returns something matching rx; report the tail on failure. */
async function waitForScreen(read, rx, timeoutMs, what) {
  const start = Date.now();
  let last = '';
  while (Date.now() - start < timeoutMs) {
    last = read();
    if (rx.test(last)) return last;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`${what} within ${timeoutMs}ms (terminal tail: ${JSON.stringify(last.slice(-600))})`);
}

/**
 * Run `aoforge-watch start --foreground` under a pseudo-terminal, as a user's
 * shell would. `screen()` is everything the daemon has printed there.
 */
function spawnDaemonInTerminal({ home, project, args = [], env = {} }) {
  const pty = require('node-pty');
  const childEnv = { ...process.env, HOME: home, ...env };
  if (!('AOFORGE_WATCH_UNATTENDED' in env)) delete childEnv.AOFORGE_WATCH_UNATTENDED;
  const term = pty.spawn(process.execPath, [
    CLI, 'start', '--foreground', '--project', project, '--shell', 'bash', ...args,
  ], { name: 'xterm-256color', cols: 120, rows: 30, cwd: project, env: childEnv });
  const d = { term, exited: false, text: '' };
  term.onData((chunk) => { d.text += chunk; });
  term.onExit(() => { d.exited = true; });
  d.screen = () => d.text;
  // What the daemon printed for the command that is running NOW: everything after
  // the second line of the dispatch frame. The frame's own start line quotes the
  // command text, so a prompt must be looked for after it, never before.
  d.afterFrame = () => {
    const i = d.text.lastIndexOf('Ctrl+C interrupts the command');
    return i < 0 ? '' : d.text.slice(i);
  };
  return d;
}

/** Signal the daemon's group, escalate, and PROVE the pid is gone. Returns a message or null. */
async function stopTerminalDaemon(d) {
  const pid = d.term.pid;
  const signal = (sig) => {
    try { process.kill(-pid, sig); } catch { /* group already gone */ }
    try { process.kill(pid, sig); } catch { /* process already gone */ }
  };
  const settle = async (ms) => {
    const start = Date.now();
    while (!d.exited && Date.now() - start < ms) await new Promise((r) => setTimeout(r, 50));
  };
  if (!d.exited) {
    signal('SIGTERM');
    await settle(5000);
    if (!d.exited) { signal('SIGKILL'); await settle(5000); }
  }
  try { d.term.destroy(); } catch { /* already closed */ }
  if (!d.exited) return `daemon pid ${pid} survived SIGTERM and SIGKILL`;
  try {
    process.kill(pid, 0);
    return `daemon pid ${pid} reported exit but is still addressable`;
  } catch (e) {
    return e.code === 'EPERM' ? `daemon pid ${pid} still exists and is not ours to signal` : null;
  }
}

async function withTerminalDaemon(opts, fn) {
  const d = spawnDaemonInTerminal(opts);
  let primary = null;
  try {
    await fn(d);
  } catch (e) {
    primary = e;
  }
  const leak = await stopTerminalDaemon(d);
  if (primary) throw primary;
  if (leak) throw new Error(`${leak}\n--- daemon terminal (tail) ---\n${d.screen().slice(-2000)}`);
}

describe('aoforge-watch attended terminal (TRD 73-05)', () => {
  let home, project;
  beforeEach(() => {
    home = mkTmp();
    project = mkTmp();
    fs.mkdirSync(path.join(project, '.aoforge-handoff', 'pending'), { recursive: true });
    writeAttendAllowFile(home);
  });
  afterEach(() => { rmTmp(home); rmTmp(project); });

  // Test list items 1 and 2.
  test('AT-E2E-1: the user answers the prompt in the daemon terminal and the answer reaches the command', attendOpts, async () => {
    await withTerminalDaemon({ home, project }, async (d) => {
      await waitForScreen(d.screen, /aoforge-watch: attended:/, 15000, 'the attended startup line');
      assert.match(d.screen(), /aoforge-watch: started \(pid \d+, projects /, 'the started line is unchanged');

      writeAttendPending(project, 'att-1', `bash -c 'printf "Your name: " > /dev/tty; read N; echo "hello $N"'`);
      await waitForScreen(d.afterFrame, /Your name:/, 20000, 'the command prompt mirrored into the daemon terminal');

      d.term.write('ada\r'); // the user types

      const done = await waitForAttendDone(project, 'att-1');
      assert.equal(done.status, 'done');
      assert.equal(done.exit_code, 0);
      assert.match(done.stdout, /hello ada/);

      const screen = await waitForScreen(d.screen, /att-1 finished: done \(exit 0\)/, 5000, 'the end line');
      assert.match(screen, /att-1/, 'the start line names the handoff id');
      assert.ok(screen.includes('\x07'), 'the start line rings the terminal bell');

      // Item 2: the log keeps its dispatch and completion lines and never the keys.
      const log = fs.readFileSync(watchLogFile(home), 'utf8');
      assert.match(log, /dispatching att-1:/);
      assert.match(log, /completed att-1 status=done exit=0/);
      assert.ok(!/\bada\b/.test(log), `the log must not hold the typed keys:\n${log}`);
    });
  });

  // Test list item 3.
  test('AT-E2E-2: Ctrl+C during a dispatch interrupts the command (exit 130) and the daemon keeps serving', attendOpts, async () => {
    await withTerminalDaemon({ home, project }, async (d) => {
      await waitForScreen(d.screen, /aoforge-watch: attended:/, 15000, 'the attended startup line');

      writeAttendPending(project, 'att-2', `bash -c 'echo started-73; exec sleep 30'`);
      await waitForScreen(d.afterFrame, /started-73/, 20000, 'the command output mirrored into the daemon terminal');

      const typedAt = Date.now();
      d.term.write('\x03');
      const done = await waitForAttendDone(project, 'att-2', 5000);
      assert.equal(done.exit_code, 130);
      assert.ok(Date.now() - typedAt < 5000, 'the interrupt ends the dispatch promptly');

      assert.equal(d.exited, false, 'the daemon is still running');
      assert.doesNotThrow(() => process.kill(d.term.pid, 0), 'the daemon pid is alive');

      writeAttendPending(project, 'att-3', `bash -c 'echo again-73'`);
      const again = await waitForAttendDone(project, 'att-3');
      assert.equal(again.status, 'done');
      assert.match(again.stdout, /again-73/);
    });
  });

  // Test list item 5.
  test('AT-CLI-3: --no-attend under a terminal runs unattended and the dispatch is not framed', attendOpts, async () => {
    await withTerminalDaemon({ home, project, args: ['--no-attend'] }, async (d) => {
      await waitForScreen(d.screen, /aoforge-watch: unattended:/, 15000, 'the unattended startup line');
      assert.ok(!/aoforge-watch: attended:/.test(d.screen()));

      writeAttendPending(project, 'unatt-1', `bash -c 'echo plain-73'`);
      const done = await waitForAttendDone(project, 'unatt-1');
      assert.equal(done.status, 'done');
      assert.match(done.stdout, /plain-73/);
      assert.ok(!/finished:/.test(d.screen()), 'an unattended daemon prints no dispatch frame');
      assert.ok(!d.screen().includes('\x07'), 'and rings no bell');
    });
  });

  test('AT-CLI-4: AOFORGE_WATCH_UNATTENDED=1 under a terminal runs unattended', attendOpts, async () => {
    await withTerminalDaemon({ home, project, env: { AOFORGE_WATCH_UNATTENDED: '1' } }, async (d) => {
      await waitForScreen(d.screen, /aoforge-watch: unattended:/, 15000, 'the unattended startup line');
      assert.ok(!/aoforge-watch: attended:/.test(d.screen()));
    });
  });

  // Test list item 4: no terminal at all (the detached start, launchd, systemd, CI).
  test('AT-CLI-1: start --foreground with piped stdio is unattended, and the started line is unchanged', async () => {
    const child = spawn(process.execPath, [CLI, 'start', '--foreground', '--project', project, '--shell', 'bash'], {
      env: { ...process.env, HOME: home, AOFORGE_WATCH_UNATTENDED: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.resume();
    let exited = false;
    child.on('exit', () => { exited = true; });
    try {
      await waitForScreen(() => out, /unattended/, 15000, 'the unattended startup line');
      const lines = out.split('\n').filter(Boolean);
      assert.match(lines[0], /^aoforge-watch: started \(pid \d+, projects .+\)$/);
      assert.match(lines[1], /^aoforge-watch: unattended: /);
      assert.ok(!/aoforge-watch: attended:/.test(out));
    } finally {
      try { child.kill('SIGTERM'); } catch { /* gone */ }
      const start = Date.now();
      while (!exited && Date.now() - start < 5000) await new Promise((r) => setTimeout(r, 50));
      if (!exited) { try { child.kill('SIGKILL'); } catch { /* gone */ } }
      for (const s of [child.stdout, child.stderr]) { try { s.destroy(); } catch { /* closed */ } }
    }
  });

  test('AT-CLI-2: the start usage in the header documents --no-attend', () => {
    const src = fs.readFileSync(CLI, 'utf8');
    const header = src.slice(0, src.indexOf('const fs = require')); // the usage comment block
    const startEntry = header.slice(header.indexOf(' *   start ['), header.indexOf(' *   stop'));
    assert.match(startEntry, /--no-attend/, 'documented under the start entry');
  });
});
