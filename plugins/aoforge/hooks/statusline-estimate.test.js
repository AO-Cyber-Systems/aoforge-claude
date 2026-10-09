/**
 * Tests for the statusline estimate segment (objective 58, TRD 58-04, EST-05).
 *
 * Pattern (same as statusline.test.js): spawn statusline.js as a subprocess, pipe a
 * Claude-style JSON object to stdin, assert against ANSI-stripped stdout.
 *
 * The fake HOME holds copies of estimate-run-store.cjs and upgrade.cjs under
 * <HOME>/.claude/aoforge/bin/lib/, which is where the synced runtime puts them. The run
 * state is written through the store module from the repo source, into
 * AOFORGE_ESTIMATE_STATE_DIR under the fake HOME, so nothing here touches the real ~/.claude.
 * Times are relative to the real clock because the status line reads Date.now().
 *
 *   1. live run: `⏱ 58 W2/3 ~22m|23m left`
 *   2. no state file: no segment, the rest of the line renders
 *   3. lib not installed: no segment, the rest of the line renders
 *   4. malformed state: no segment, empty stderr
 *   5. finished_at set: no segment
 *   6. current_dir below the project root: the segment still shows
 *   + colour, placement, over P90, stale run, no estimate, read-only
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const fixtures = require('../aoforge/bin/lib/__fixtures__/daemon-polish-fixtures.cjs');

const LIB_DIR = path.join(__dirname, '..', 'aoforge', 'bin', 'lib');
const store = require(path.join(LIB_DIR, 'estimate-run-store.cjs'));

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const iso = (ms) => new Date(ms).toISOString();

/** A fake HOME + project + state dir, cleaned up when the test ends. */
function world(t, { installLib = true } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-est-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const home = path.join(tmp, 'home');
  const project = path.join(tmp, 'proj');
  const stateDir = path.join(home, 'est');
  fs.mkdirSync(path.join(project, '.aoforge'), { recursive: true });
  const libDir = path.join(home, '.claude', 'aoforge', 'bin', 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  if (installLib) {
    fs.copyFileSync(path.join(LIB_DIR, 'estimate-run-store.cjs'), path.join(libDir, 'estimate-run-store.cjs'));
    fs.copyFileSync(path.join(LIB_DIR, 'upgrade.cjs'), path.join(libDir, 'upgrade.cjs'));
    // both resolve the planning directory through compat.cjs (TRD 72-05), which reads legacy-names.cjs
    fs.copyFileSync(path.join(LIB_DIR, 'compat.cjs'), path.join(libDir, 'compat.cjs'));
    fs.copyFileSync(path.join(LIB_DIR, 'legacy-names.cjs'), path.join(libDir, 'legacy-names.cjs'));
  }
  const env = { ...process.env, HOME: home, AOFORGE_ESTIMATE_STATE_DIR: stateDir };
  delete env.AOFORGE_HANDOFF_PID_FILE;
  return { tmp, home, project, stateDir, env, opts: { env: { AOFORGE_ESTIMATE_STATE_DIR: stateDir } } };
}

/** Wave 1 done, wave 2 (p50 20, p90 50) started `waveMinutesAgo` ago, wave 3 (p50 8) pending. */
function liveState({ waveMinutesAgo = 5, updatedAt = Date.now(), p3 = 8 } = {}) {
  const now = Date.now();
  return {
    version: 1,
    objective: '58',
    started_at: iso(now - 40 * MIN),
    updated_at: iso(updatedAt),
    finished_at: null,
    estimate: { line: 'Objective 58 estimate: ...', wall_minutes: { p50: 40, p90: 106 }, confidence: 'medium' },
    waves: [
      { wave: 1, trds: ['58-01'], p50: 12, p90: 36, started_at: iso(now - 40 * MIN), finished_at: iso(now - waveMinutesAgo * MIN), actual_minutes: 14 },
      { wave: 2, trds: ['58-03'], p50: 20, p90: 50, started_at: iso(now - waveMinutesAgo * MIN), finished_at: null, actual_minutes: null },
      { wave: 3, trds: ['58-04'], p50: p3, p90: 20, started_at: null, finished_at: null, actual_minutes: null },
    ],
  };
}

function render(w, { dir } = {}) {
  const input = fixtures.buildStatuslineInput({ workspace_dir: dir || w.project });
  const result = fixtures.runStatuslineSubprocess({ input, env: w.env });
  return { ...result, out: fixtures.stripAnsi(result.stdout) };
}

test('1. a live run shows ⏱ <objective> W<current>/<total> ~<time> left', (t) => {
  const w = world(t);
  store.writeRunState(w.project, liveState(), w.opts);
  const r = render(w);
  assert.equal(r.status, 0, r.stderr);
  // wave 2: 20 - 5 = 15 left, plus wave 3's 8 = 23 (22 if a minute boundary was crossed)
  assert.match(r.out, /⏱ 58 W2\/3 ~2[23]m left/);
  assert.equal(r.stderr, '');
});

test('2. no state file: no segment, model and directory still render', (t) => {
  const w = world(t);
  const r = render(w);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.out, /⏱/);
  assert.match(r.out, /Sonnet 4\.5/);
  assert.match(r.out, /proj/);
});

test('3. lib not installed: no segment, the rest of the line renders, exit 0', (t) => {
  const w = world(t, { installLib: false });
  store.writeRunState(w.project, liveState(), w.opts);
  const r = render(w);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.out, /⏱/);
  assert.match(r.out, /Sonnet 4\.5/);
  assert.match(r.out, /proj/);
  assert.equal(r.stderr, '');
});

test('4. malformed state JSON: no segment, empty stderr, exit 0', (t) => {
  const w = world(t);
  fs.mkdirSync(w.stateDir, { recursive: true });
  fs.writeFileSync(store.statePath(w.project, w.opts), '{"version": 1, "objective": "58", "wav');
  const r = render(w);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.out, /⏱/);
  assert.match(r.out, /Sonnet 4\.5/);
  assert.equal(r.stderr, '');
});

test('5. finished_at set: no segment', (t) => {
  const w = world(t);
  store.writeRunState(w.project, { ...liveState(), finished_at: iso(Date.now() - MIN) }, w.opts);
  const r = render(w);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.out, /⏱/);
});

test('6. current_dir below the project root: the project root is found upward', (t) => {
  const w = world(t);
  store.writeRunState(w.project, liveState(), w.opts);
  const deep = path.join(w.project, 'sub', 'dir');
  fs.mkdirSync(deep, { recursive: true });
  const r = render(w, { dir: deep });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.out, /⏱ 58 W2\/3 ~2[23]m left/);
});

test('7. gold for a normal segment, red for over P90', (t) => {
  const w = world(t);
  store.writeRunState(w.project, liveState(), w.opts);
  // eslint-disable-next-line no-control-regex
  assert.match(render(w).stdout, /\x1b\[38;5;178m⏱ 58 W2\/3 ~2[23]m left\x1b\[0m/);

  // wave 2 started an hour ago against a P90 of 50
  store.writeRunState(w.project, liveState({ waveMinutesAgo: 60 }), w.opts);
  // eslint-disable-next-line no-control-regex
  assert.match(render(w).stdout, /\x1b\[31m⏱ 58 W2\/3 over P90\x1b\[0m/);
});

test('8. no estimate for a wave: the segment carries no time', (t) => {
  const w = world(t);
  store.writeRunState(w.project, liveState({ p3: null }), w.opts);
  const r = render(w);
  assert.match(r.out, /⏱ 58 W2\/3(?! ~)/);
  assert.doesNotMatch(r.out, /left|over P90/);
});

test('9. a run not updated for more than 12 hours shows nothing', (t) => {
  const w = world(t);
  store.writeRunState(w.project, liveState({ updatedAt: Date.now() - 13 * HOUR }), w.opts);
  const r = render(w);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.out, /⏱/);
});

test('10. placement: after the watcher block, before the context bar', (t) => {
  const w = world(t);
  // Re-use the watcher fixture: a live daemon with 2 pending items and status_line on.
  const wenv = fixtures.buildStatuslineEnv({
    tmpHome: w.home,
    projectDir: w.project,
    daemonAlive: true,
    watching: [w.project],
    pendingByProject: { [w.project]: 2 },
    configContent: { daemon: { status_line: true } },
  });
  w.env = { ...wenv.env, AOFORGE_ESTIMATE_STATE_DIR: w.stateDir };
  store.writeRunState(w.project, liveState(), w.opts);
  const r = render(w);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.out, /proj │ ⏸ 2 pending │ ⏱ 58 W2\/3 ~2[23]m left █+░* \d+%$/);
});

test('11. the status line only reads: the state file and the project are left untouched', (t) => {
  const w = world(t);
  const { path: file } = store.writeRunState(w.project, liveState(), w.opts);
  const before = fs.readFileSync(file, 'utf8');
  const stateBefore = fs.readdirSync(w.stateDir).sort();
  const projectBefore = fs.readdirSync(w.project).sort();
  const r = render(w);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.deepEqual(fs.readdirSync(w.stateDir).sort(), stateBefore);
  assert.deepEqual(fs.readdirSync(w.project).sort(), projectBefore);
  assert.deepEqual(fs.readdirSync(path.join(w.project, '.aoforge')), []);
});

test('12. the hook source reads no transcript or project history', () => {
  const src = fs.readFileSync(path.join(__dirname, 'statusline.js'), 'utf8');
  assert.doesNotMatch(src, /\.jsonl|projects/);
});
