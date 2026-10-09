/**
 * Tests for route-results.js — UserPromptSubmit hook that injects watcher
 * results into Claude's next turn.
 */

const { test, describe, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'route-results.js');
const {
  findHandoffDir, selectUnconsumed, renderRecord, renderResults,
  markConsumed, truncate, isStale, DEFAULT_TTL_MS,
} = require('./route-results.js');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'route-results-'));
}

function rmTmp(d) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
}

function seedDoneRecord(tmp, id, overrides = {}) {
  const dir = path.join(tmp, '.aoforge-handoff', 'done');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${id}.json`);
  // Default to "just now" so records aren't stale-filtered by the default
  // 1h TTL. Tests that want stale records pass an explicit completed_at.
  const now = new Date().toISOString();
  const rec = {
    id,
    cmd: 'gh auth login',
    cwd: tmp,
    status: 'done',
    exit_code: 0,
    stdout: '',
    stderr: '',
    started_at: now,
    completed_at: now,
    consumed: false,
    ...overrides,
  };
  fs.writeFileSync(filePath, JSON.stringify(rec, null, 2) + '\n');
  return filePath;
}

// ---------------------------------------------------------------------------
// pure functions
// ---------------------------------------------------------------------------

describe('findHandoffDir', () => {
  test('returns null when no .aoforge-handoff/ ancestor', () => {
    const tmp = mkTmp();
    try {
      assert.equal(findHandoffDir(tmp), null);
    } finally { rmTmp(tmp); }
  });

  test('finds .aoforge-handoff/ in ancestor', () => {
    const tmp = mkTmp();
    fs.mkdirSync(path.join(tmp, '.aoforge-handoff'));
    const child = path.join(tmp, 'a', 'b');
    fs.mkdirSync(child, { recursive: true });
    try {
      assert.equal(findHandoffDir(child), path.join(tmp, '.aoforge-handoff'));
    } finally { rmTmp(tmp); }
  });
});

describe('selectUnconsumed', () => {
  let tmp;
  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => rmTmp(tmp));

  test('empty when no done dir', () => {
    assert.deepEqual(selectUnconsumed(path.join(tmp, '.aoforge-handoff', 'done')), []);
  });

  test('filters consumed records', () => {
    seedDoneRecord(tmp, 'h-1', { consumed: false });
    seedDoneRecord(tmp, 'h-2', { consumed: true });
    const recs = selectUnconsumed(path.join(tmp, '.aoforge-handoff', 'done'));
    assert.equal(recs.length, 1);
    assert.equal(recs[0].id, 'h-1');
  });

  test('filters records older than TTL', () => {
    const oldTime = new Date(Date.now() - 2 * DEFAULT_TTL_MS).toISOString();
    seedDoneRecord(tmp, 'h-old', { completed_at: oldTime });
    seedDoneRecord(tmp, 'h-new', { completed_at: new Date().toISOString() });
    const recs = selectUnconsumed(path.join(tmp, '.aoforge-handoff', 'done'));
    assert.equal(recs.length, 1);
    assert.equal(recs[0].id, 'h-new');
  });

  test('skips malformed records', () => {
    fs.mkdirSync(path.join(tmp, '.aoforge-handoff', 'done'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.aoforge-handoff', 'done', 'h-bad.json'), 'not json');
    seedDoneRecord(tmp, 'h-good');
    const recs = selectUnconsumed(path.join(tmp, '.aoforge-handoff', 'done'));
    assert.equal(recs.length, 1);
    assert.equal(recs[0].id, 'h-good');
  });

  test('sorts chronologically by completed_at', () => {
    const now = Date.now();
    seedDoneRecord(tmp, 'h-late', { completed_at: new Date(now - 1000).toISOString() });
    seedDoneRecord(tmp, 'h-early', { completed_at: new Date(now - 5000).toISOString() });
    const recs = selectUnconsumed(path.join(tmp, '.aoforge-handoff', 'done'));
    assert.equal(recs[0].id, 'h-early');
    assert.equal(recs[1].id, 'h-late');
  });
});

describe('renderRecord', () => {
  test('rendered success has cmd, exit_code, stdout', () => {
    const out = renderRecord({
      id: 'h-1', cmd: 'gh auth login', exit_code: 0, status: 'done',
      stdout: 'logged in', stderr: '',
      completed_at: '2026-04-29T10:00:00Z',
    });
    assert.match(out, /h-1/);
    assert.match(out, /gh auth login/);
    assert.match(out, /✓ exit 0/);
    assert.match(out, /logged in/);
  });

  test('rejected status produces "Do NOT retry" guidance', () => {
    const out = renderRecord({
      id: 'h-2', cmd: 'rm -rf /', exit_code: -2, status: 'rejected',
      stderr: 'denied by guard',
    });
    assert.match(out, /rejected by daemon/);
    assert.match(out, /Do NOT retry/);
  });

  test('timeout status produces timeout guidance', () => {
    const out = renderRecord({
      id: 'h-3', cmd: 'sleep 9999', exit_code: -1, status: 'timeout',
    });
    assert.match(out, /✗ timeout/);
    assert.match(out, /exceeded the daemon timeout/);
  });

  test('error status surfaces dispatch error', () => {
    const out = renderRecord({
      id: 'h-4', cmd: 'mise use', exit_code: -3, status: 'error',
      stderr: 'boom',
    });
    assert.match(out, /daemon error/);
    assert.match(out, /boom/);
  });

  test('no output case', () => {
    const out = renderRecord({
      id: 'h-5', cmd: 'true', exit_code: 0, status: 'done', stdout: '', stderr: '',
    });
    assert.match(out, /no output captured/);
  });

  test('non-zero exit becomes ✗ exit N', () => {
    const out = renderRecord({
      id: 'h-6', cmd: 'false', exit_code: 1, status: 'failed', stderr: '',
    });
    assert.match(out, /✗ exit 1/);
  });
});

describe('isStale', () => {
  test('returns false when completed_at missing', () => {
    assert.equal(isStale({}, Date.now(), 1000), false);
  });
  test('returns true when older than TTL', () => {
    assert.equal(isStale({ completed_at: '2020-01-01T00:00:00Z' }, Date.now(), 1000), true);
  });
  test('returns false when newer than TTL', () => {
    assert.equal(isStale({ completed_at: new Date().toISOString() }, Date.now(), 60000), false);
  });
});

describe('truncate', () => {
  test('returns short input unchanged', () => {
    assert.equal(truncate('hi', 100), 'hi');
  });
  test('truncates with marker', () => {
    const out = truncate('a'.repeat(20), 5);
    assert.match(out, /^a{5}/);
    assert.match(out, /15 more chars/);
  });
});

// ---------------------------------------------------------------------------
// subprocess integration
// ---------------------------------------------------------------------------

// route-results also drains the GLOBAL notices file under $HOME (TRD 36-05), so every spawn gets
// a disposable HOME — a test must never read or consume the real ~/.claude notices.
const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'route-results-home-'));
after(() => rmTmp(FAKE_HOME));

function runHook(cwd, env = {}) {
  const base = { ...process.env, HOME: FAKE_HOME };
  delete base.AOFORGE_SKIP_NOTICES;
  delete base.AOFORGE_SKIP_HANDOFF_RESULTS;
  return spawnSync('node', [HOOK_PATH], {
    cwd,
    encoding: 'utf-8',
    input: '',
    env: { ...base, ...env },
  });
}

describe('hook subprocess', () => {
  let tmp;
  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => rmTmp(tmp));

  test('emits nothing when no .aoforge-handoff/', () => {
    const r = runHook(tmp);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  test('emits nothing when done/ has only consumed records', () => {
    seedDoneRecord(tmp, 'h-c', { consumed: true });
    const r = runHook(tmp);
    assert.equal(r.stdout, '');
  });

  test('emits additionalContext for unconsumed records and marks them consumed', () => {
    const filePath = seedDoneRecord(tmp, 'h-1', {
      cmd: 'gh auth login', exit_code: 0, status: 'done',
      stdout: 'logged in', completed_at: new Date().toISOString(),
    });
    const r = runHook(tmp);
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(out.hookSpecificOutput.additionalContext, /gh auth login/);
    assert.match(out.hookSpecificOutput.additionalContext, /logged in/);

    const after = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(after.consumed, true);

    const r2 = runHook(tmp);
    assert.equal(r2.stdout, '', 'consumed record should not re-inject');
  });

  test('rejected record produces "Do NOT retry" guidance', () => {
    seedDoneRecord(tmp, 'h-r', {
      cmd: 'rm -rf /', exit_code: -2, status: 'rejected',
      stderr: 'denied by guard: rm -rf /',
      completed_at: new Date().toISOString(),
    });
    const r = runHook(tmp);
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /Do NOT retry/);
  });

  test('AOFORGE_SKIP_HANDOFF_RESULTS=1 bypasses', () => {
    seedDoneRecord(tmp, 'h-1', { completed_at: new Date().toISOString() });
    const r = runHook(tmp, { AOFORGE_SKIP_HANDOFF_RESULTS: '1' });
    assert.equal(r.stdout, '');
  });

  test('finds .aoforge-handoff/ in ancestor (not just cwd)', () => {
    const child = path.join(tmp, 'src', 'sub');
    fs.mkdirSync(child, { recursive: true });
    seedDoneRecord(tmp, 'h-1', { completed_at: new Date().toISOString() });
    const r = runHook(child);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.length > 0);
  });
});

// ---------------------------------------------------------------------------
// exactly-once delivery and the catch-all (TRD 73-02)
// ---------------------------------------------------------------------------

// Hold every child at the starting line: a preload script spins until a start file appears, so the two hook
// copies begin reading the handoff directory together instead of one finishing before the other has started.
function startGate(dir) {
  const gate = path.join(dir, 'start-gate.cjs');
  fs.writeFileSync(gate, [
    "const fs = require('fs');",
    'const nap = new Int32Array(new SharedArrayBuffer(4));',
    'while (!fs.existsSync(process.env.ROUTE_RESULTS_TEST_START)) Atomics.wait(nap, 0, 0, 2);',
  ].join('\n'));
  return gate;
}

function spawnGated(cwd, gate, startFile) {
  const { spawn } = require('child_process');
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['-r', gate, HOOK_PATH], {
      cwd,
      env: { ...process.env, HOME: FAKE_HOME, ROUTE_RESULTS_TEST_START: startFile, AOFORGE_SKIP_NOTICES: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

describe('exactly-once delivery and the catch-all', () => {
  let tmp;
  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => rmTmp(tmp));

  test('2: two copies started together emit a record once between them', async () => {
    const filePath = seedDoneRecord(tmp, 'h-race', { stdout: 'raced output' });
    const gate = startGate(tmp);
    const startFile = path.join(tmp, 'start');
    const copies = [spawnGated(tmp, gate, startFile), spawnGated(tmp, gate, startFile)];
    await new Promise((r) => setTimeout(r, 400)); // both children are now blocked on the start file
    fs.writeFileSync(startFile, 'go');
    const results = await Promise.all(copies);

    for (const r of results) assert.equal(r.status, 0, r.stderr);
    const emitted = results.filter((r) => r.stdout.includes('h-race'));
    assert.equal(emitted.length, 1, `emitted by ${emitted.length} copies`);
    assert.equal(JSON.parse(fs.readFileSync(filePath, 'utf8')).consumed, true);
    assert.ok(fs.existsSync(path.join(tmp, '.aoforge-handoff', 'done', 'h-race.claim')), 'the claim file exists');
  });

  test('3: a record addressed to another session and agent is still delivered, and marked by route-results', () => {
    const filePath = seedDoneRecord(tmp, 'h-addr', {
      session_id: 'other-session', agent_id: 'a-9', stdout: 'addressed elsewhere',
    });
    const r = runHook(tmp);
    assert.equal(r.status, 0, r.stderr);
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /addressed elsewhere/);
    const after = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(after.consumed, true);
    assert.equal(after.consumed_by, 'route-results');
  });

  test('4: a record that has a claim but is not marked consumed (a crash in between) is not delivered', () => {
    seedDoneRecord(tmp, 'h-claimed', { stdout: 'must not be shown twice' });
    fs.writeFileSync(path.join(tmp, '.aoforge-handoff', 'done', 'h-claimed.claim'), '{}');
    const r = runHook(tmp);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
  });
});

// ---------------------------------------------------------------------------
// upgrade notices (TRD 36-05)
// ---------------------------------------------------------------------------

const notices = require('../aoforge/bin/lib/notices.cjs');

describe('upgrade notices', () => {
  let tmp;
  let home;
  beforeEach(() => { tmp = mkTmp(); home = mkTmp(); });
  afterEach(() => { rmTmp(tmp); rmTmp(home); });

  test('20: a global notice (no .aoforge in cwd) is emitted exactly once', () => {
    const file = notices.globalNoticesPath(home);
    notices.appendNotice(file, { source: 'global-upgrade', level: 'info', message: 'global notice G1' });
    const r1 = runHook(tmp, { HOME: home });
    assert.equal(r1.status, 0, r1.stderr);
    const ctx = JSON.parse(r1.stdout).hookSpecificOutput.additionalContext;
    assert.match(ctx, /## AOForge notices/);
    assert.match(ctx, /global notice G1/);
    assert.doesNotMatch(ctx, /Deferred command results/);
    const r2 = runHook(tmp, { HOME: home });
    assert.equal(r2.stdout, '', 'a consumed notice is not emitted again');
  });

  test('21: handoff results and a project notice share ONE additionalContext', () => {
    fs.mkdirSync(path.join(tmp, '.aoforge'), { recursive: true });
    notices.appendNotice(notices.projectNoticesPath(tmp),
      { source: 'upgrade-project', level: 'warn', message: 'project notice P1' });
    seedDoneRecord(tmp, 'h-21', { stdout: 'handoff output H1' });
    const r = runHook(tmp, { HOME: home });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    const ctx = out.hookSpecificOutput.additionalContext;
    assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(ctx, /handoff output H1/);
    assert.match(ctx, /project notice P1/);
    assert.ok(ctx.indexOf('Deferred command results') < ctx.indexOf('AOForge notices'));
  });

  test('21b: a project notice is found from a subdirectory of the project', () => {
    fs.mkdirSync(path.join(tmp, '.aoforge'), { recursive: true });
    notices.appendNotice(notices.projectNoticesPath(tmp),
      { source: 'upgrade-project', level: 'info', message: 'project notice P2' });
    const child = path.join(tmp, 'src', 'deep');
    fs.mkdirSync(child, { recursive: true });
    const r = runHook(child, { HOME: home });
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /project notice P2/);
  });

  test('22: AOFORGE_SKIP_NOTICES=1 suppresses (and keeps) notices; handoff results still emitted', () => {
    fs.mkdirSync(path.join(tmp, '.aoforge'), { recursive: true });
    const file = notices.projectNoticesPath(tmp);
    notices.appendNotice(file, { source: 'upgrade-project', level: 'warn', message: 'project notice P3' });
    seedDoneRecord(tmp, 'h-22', { stdout: 'handoff output H3' });
    const r = runHook(tmp, { HOME: home, AOFORGE_SKIP_NOTICES: '1' });
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    assert.match(ctx, /handoff output H3/);
    assert.doesNotMatch(ctx, /project notice P3/);
    assert.equal(notices.readNotices(file)[0].consumed, false, 'not consumed while suppressed');

    const r2 = runHook(tmp, { HOME: home });
    assert.match(JSON.parse(r2.stdout).hookSpecificOutput.additionalContext, /project notice P3/);
  });

  test('handoff-only output is byte-identical to renderResults (no notices)', () => {
    seedDoneRecord(tmp, 'h-bytes', { stdout: 'same bytes' });
    const expected = renderResults(selectUnconsumed(path.join(tmp, '.aoforge-handoff', 'done')));
    const r = runHook(tmp, { HOME: home });
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, expected);
  });
});
