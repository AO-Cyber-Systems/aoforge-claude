'use strict';

// doctor.e2e.test.cjs — TRD 45-08 (objective 45 SC4 + SC5; DOC-04, DOC-05, DOC-06).
//
// End-to-end proof through the REAL CLI: every test spawns
// `node plugins/aoforge/aoforge/bin/aof-tools.cjs doctor … --json` with HOME pointed at a fake home
// and cwd at a fixture project built by `makeAodexLikeState()` (the 2026-09-29 aodex/runtime
// reproduction), then asserts on the `--json` report fields only — never on the human text.
//
//   SC4  report → --fix → report converges: every DOC-05 problem is detected, every fixable one is
//        applied, and the only thing left is the report-only plugin-cache warn.
//   SC5  with unrelated work staged, the index-changing fixes (legacy-runtime-state, and
//        pending-migrations while 0008 is pending) refuse, and the staged work is untouched.
//
// Isolation: each test builds its own fixture and removes it in afterEach. The child env is
// gitEnv(home) (fake HOME, fake XDG config, no system git config, no GIT_DIR-style redirects) with
// every inherited AOFORGE_* variable dropped and only the fixture's own overrides added. The last
// test compares a read-only listing of the real ~/.claude/aoforge/{state,backups} taken when this
// file loaded against one taken at the end.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const fixtures = require('./__fixtures__/doctor-fixtures.cjs');
const { gitEnv, snapshot } = require('./__fixtures__/upgrade-fixtures.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'aof-tools.cjs');
const DOCTOR_TIMEOUT_MS = 120000;

// ─── Real-home canary (test 8): taken before any fixture exists ──────────────

const REAL_HOME = os.homedir();
const CANARY_DIRS = [
  path.join(REAL_HOME, '.claude', 'aoforge', 'state'),
  path.join(REAL_HOME, '.claude', 'aoforge', 'backups'),
];

/** Read-only: names two levels deep (`entry/` for a dir, `entry/child` below it). null when absent. */
function canaryListing() {
  const out = {};
  for (const dir of CANARY_DIRS) {
    let top;
    try {
      top = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      out[dir] = null;
      continue;
    }
    const names = [];
    for (const entry of top) {
      if (!entry.isDirectory()) {
        names.push(entry.name);
        continue;
      }
      names.push(`${entry.name}/`);
      try {
        for (const child of fs.readdirSync(path.join(dir, entry.name))) names.push(`${entry.name}/${child}`);
      } catch {
        names.push(`${entry.name}/<unreadable>`);
      }
    }
    out[dir] = names.sort();
  }
  return out;
}

const CANARY_BEFORE = canaryListing();

// ─── Expectations ─────────────────────────────────────────────────────────────

// The engine version the doctor reports, read at test time (never baked in).
const ENGINE_VERSION = JSON.parse(
  fs.readFileSync(path.join(fixtures.PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf-8')
).version;

const DOC05_IDS = [
  'runtime-mirror',
  'plugin-cache',
  'legacy-runtime-state',
  'pending-migrations',
  'skill-markers',
  'guard-state',
  'awareness-state',
  'backups',
];
const ALSO_PRESENT_IDS = ['validate-health', 'model-profiles', 'hooks-registry'];

const EXPECTED_SEVERITY = {
  'runtime-mirror': 'error',
  'legacy-runtime-state': 'error',
  'plugin-cache': 'warn',
  'pending-migrations': 'warn',
  'skill-markers': 'warn',
  'guard-state': 'warn',
  'awareness-state': 'warn',
  'backups': 'warn',
};

const FIXABLE_IDS = [
  'runtime-mirror',
  'legacy-runtime-state',
  'pending-migrations',
  'skill-markers',
  'guard-state',
  'awareness-state',
  'backups',
];

const GLOBAL_IDS = [
  'runtime-mirror',
  'plugin-cache',
  'hooks-registry',
  'model-profiles',
  'skill-requires',
  'guard-state',
  'awareness-state',
  'backups',
];
const PROJECT_IDS = ['legacy-runtime-state', 'pending-migrations', 'validate-health', 'skill-markers'];

const RUNTIME_PATHS = [...fixtures.AODEX_TRACKED_RUNTIME, ...fixtures.AODEX_UNTRACKED_RUNTIME];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function childEnv(state) {
  const env = { ...gitEnv(state.home), USERPROFILE: state.home };
  for (const key of Object.keys(env)) if (key.startsWith('AOFORGE_')) delete env[key];
  return { ...env, ...state.env };
}

/** Spawn the real dispatcher: `aof-tools doctor <args> --json`, cwd = fixture project. */
function doctor(state, args) {
  const r = spawnSync(process.execPath, [TOOLS_PATH, 'doctor', ...args, '--json'], {
    cwd: state.root,
    env: childEnv(state),
    encoding: 'utf-8',
    timeout: DOCTOR_TIMEOUT_MS,
  });
  assert.equal(r.status, 0, `doctor ${args.join(' ')} exited ${r.status}: ${r.stderr || (r.error && r.error.message)}`);
  let text = String(r.stdout || '').trim();
  if (text.startsWith('@file:')) {
    const file = text.slice('@file:'.length);
    text = fs.readFileSync(file, 'utf-8');
    fs.rmSync(file, { force: true });
  }
  return JSON.parse(text);
}

function git(state, ...args) {
  return execFileSync('git', ['-C', state.root, ...args], {
    env: gitEnv(state.home),
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
  });
}

function gitStatus(state, ...args) {
  return spawnSync('git', ['-C', state.root, ...args], {
    env: gitEnv(state.home),
    encoding: 'utf-8',
  }).status;
}

function lines(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

function byId(list) {
  const out = {};
  for (const item of list || []) out[item.id] = item;
  return out;
}

function nonOk(report) {
  return report.checks.filter((c) => c.severity !== 'ok').map((c) => `${c.id}:${c.severity}`);
}

function assertConverged(report, label) {
  assert.equal(report.summary.fixable, 0, `${label}: fixable should be 0 (${nonOk(report).join(', ')})`);
  assert.equal(report.summary.error, 0, `${label}: error should be 0 (${nonOk(report).join(', ')})`);
  assert.deepEqual(nonOk(report), ['plugin-cache:warn'], `${label}: only the report-only plugin-cache warn may remain`);
  const pc = byId(report.checks)['plugin-cache'];
  assert.equal(pc.fixable, false);
  assert.deepEqual(pc.details.stale.map((s) => s.version), fixtures.AODEX_STALE_CACHE_VERSIONS);
}

// ─── SC4: report → fix → report ───────────────────────────────────────────────

describe('doctor e2e: aodex-like state (SC4)', () => {
  let state = null;
  afterEach(() => {
    if (state) state.cleanup();
    state = null;
  });

  test('1. the report flags every DOC-05 problem', () => {
    state = fixtures.makeAodexLikeState();
    const report = doctor(state, []);

    assert.equal(report.schema_version, 1);
    assert.equal(report.mode, 'report');
    assert.equal(report.engine_version, ENGINE_VERSION);
    assert.equal(report.scope.project, state.root);
    assert.deepEqual(report.fixes, []);

    const checks = byId(report.checks);
    for (const id of [...DOC05_IDS, ...ALSO_PRESENT_IDS]) assert.ok(checks[id], `check ${id} missing from the report`);
    for (const [id, severity] of Object.entries(EXPECTED_SEVERITY)) {
      assert.equal(checks[id].severity, severity, `${id}: ${checks[id].finding}`);
    }
    for (const id of FIXABLE_IDS) assert.equal(checks[id].fixable, true, `${id} should be fixable: ${checks[id].finding}`);
    assert.equal(checks['plugin-cache'].fixable, false, 'plugin-cache is report-only');
    assert.ok(report.summary.fixable >= 7, `summary.fixable ${report.summary.fixable}`);
    assert.equal(report.status, 'broken');

    // The evidence the findings rest on, field by field.
    assert.equal(checks['runtime-mirror'].details.installed, fixtures.AODEX_INSTALLED_VERSION);
    assert.equal(checks['runtime-mirror'].details.mirror, fixtures.AODEX_MIRROR_VERSION);
    assert.deepEqual(checks['plugin-cache'].details.stale.map((s) => s.version), fixtures.AODEX_STALE_CACHE_VERSIONS);
    assert.deepEqual(checks['legacy-runtime-state'].details.tracked, [...fixtures.AODEX_TRACKED_RUNTIME].sort());
    assert.deepEqual(checks['legacy-runtime-state'].details.unignored, fixtures.AODEX_UNTRACKED_RUNTIME);
    assert.equal(checks['pending-migrations'].details.from, fixtures.AODEX_PROJECT_STAMP);
    assert.equal(checks['pending-migrations'].details.to, ENGINE_VERSION);
    assert.ok(checks['pending-migrations'].details.pending.includes('0008'));
    assert.deepEqual(checks['skill-markers'].details.stale.map((s) => s.file), ['.aoforge/.skill-active']);
    assert.equal(checks['guard-state'].details.stale.length, 2);
    assert.deepEqual(
      checks['awareness-state'].details.entries.map((e) => e.reasons.join('+')).sort(),
      ['orphaned', 'oversized']
    );
    assert.equal(checks['backups'].details.removable.length, 2);
    for (const id of ALSO_PRESENT_IDS) assert.equal(checks[id].severity, 'ok', `${id}: ${checks[id].finding}`);
  });

  test('2. the report is read-only: fixture home + project are byte-identical afterwards', () => {
    state = fixtures.makeAodexLikeState();
    const homeBefore = snapshot(state.home);
    const rootBefore = snapshot(state.root);
    const statusBefore = git(state, 'status', '--porcelain', '--untracked-files=all');
    const indexBefore = git(state, 'ls-files', '--stage');

    doctor(state, []);

    assert.deepEqual(snapshot(state.home), homeBefore, 'fake home changed during a report run');
    assert.deepEqual(snapshot(state.root), rootBefore, 'fixture project changed during a report run');
    assert.equal(git(state, 'status', '--porcelain', '--untracked-files=all'), statusBefore);
    assert.equal(git(state, 'ls-files', '--stage'), indexBefore);
  });

  test('3. --fix applies every fixable result', () => {
    state = fixtures.makeAodexLikeState();
    const report = doctor(state, ['--fix']);

    assert.equal(report.mode, 'fix');
    const fixes = byId(report.fixes);
    assert.deepEqual(report.fixes.map((f) => f.id).sort(), [...FIXABLE_IDS].sort(), 'exactly the fixable checks were attempted');
    for (const id of FIXABLE_IDS) {
      assert.equal(fixes[id].applied, true, `${id} not applied: ${fixes[id].refused || fixes[id].notes}`);
    }

    const legacy = fixes['legacy-runtime-state'];
    assert.match(legacy.notes, /aof-tools\.cjs commit "[^"]+" --files \.gitignore /);
    for (const rel of fixtures.AODEX_TRACKED_RUNTIME) assert.ok(legacy.notes.includes(rel), `commit command names ${rel}`);
    assert.ok(legacy.backup && fs.existsSync(legacy.backup), 'legacy fix backed up first');
    assert.ok(
      fs.realpathSync(legacy.backup).startsWith(fs.realpathSync(state.home) + path.sep),
      'backup is inside the fake home'
    );

    assert.ok(fixes['pending-migrations'].notes.includes(`stamped v${ENGINE_VERSION}`),
      `pending-migrations notes name the stamped version; got: ${fixes['pending-migrations'].notes}`);
    assert.deepEqual(fixes['skill-markers'].changed, ['.aoforge/.skill-active']);
    assert.equal(fixes['guard-state'].changed.length, 2);
    assert.equal(fixes['awareness-state'].changed.length, 2);
    assert.ok(fixes['backups'].changed.length >= 2);

    // The report's checks are the post-fix results: already converged.
    assertConverged(report, 'post-fix checks');
  });

  test('4. a second report after --fix has nothing fixable and no error; plugin-cache warn remains', () => {
    state = fixtures.makeAodexLikeState();
    doctor(state, ['--fix']);
    const report = doctor(state, []);

    assert.equal(report.mode, 'report');
    assertConverged(report, 'second report');
    assert.equal(report.status, 'degraded');
    const checks = byId(report.checks);
    assert.equal(checks['runtime-mirror'].details.mirror, fixtures.AODEX_INSTALLED_VERSION);
    assert.equal(checks['pending-migrations'].details.from, ENGINE_VERSION);
    assert.equal(checks['validate-health'].severity, 'ok');
  });

  test('5. after --fix the runtime state is untracked, ignored, and the only staged changes are its removals', () => {
    state = fixtures.makeAodexLikeState();
    doctor(state, ['--fix']);

    const tracked = lines(git(state, 'ls-files'));
    for (const rel of RUNTIME_PATHS) assert.ok(!tracked.includes(rel), `${rel} is still tracked`);
    for (const rel of RUNTIME_PATHS) {
      assert.equal(gitStatus(state, 'check-ignore', '-q', '--no-index', '--', rel), 0, `${rel} is not ignored`);
      assert.equal(fs.existsSync(path.join(state.root, ...rel.split('/'))), false, `${rel} still on disk`);
    }

    const staged = lines(git(state, 'diff', '--cached', '--name-status'));
    assert.deepEqual(
      staged,
      [...fixtures.AODEX_TRACKED_RUNTIME].sort().map((rel) => `D\t${rel}`),
      'only the runtime-state removals are staged'
    );
  });
});

// ─── SC5: unrelated staged work blocks the index-changing fixes ──────────────

describe('doctor e2e: staged-changes refusal (SC5)', () => {
  let state = null;
  afterEach(() => {
    if (state) state.cleanup();
    state = null;
  });

  test('6. with src/unrelated.txt staged, --fix leaves the index alone and still applies the rest', () => {
    state = fixtures.makeAodexLikeState();
    fs.mkdirSync(path.join(state.root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(state.root, 'src', 'unrelated.txt'), 'work in progress\n', 'utf-8');
    git(state, 'add', '--', 'src/unrelated.txt');

    const report = doctor(state, ['--fix']);
    const fixes = byId(report.fixes);
    const checks = byId(report.checks);

    // legacy-runtime-state: refused (a fixes entry with `refused`) or never attempted (fixable:false).
    const legacyFix = fixes['legacy-runtime-state'];
    if (legacyFix) {
      assert.equal(legacyFix.applied, false);
      assert.ok(legacyFix.refused, 'a refused legacy fix says why');
    }
    assert.equal(checks['legacy-runtime-state'].severity, 'error');
    assert.equal(checks['legacy-runtime-state'].fixable, false);
    assert.match(checks['legacy-runtime-state'].finding, /src\/unrelated\.txt/);
    assert.ok(checks['legacy-runtime-state'].fix_command, 'refusal carries the manual command');

    // pending-migrations: 0008 is still pending behind the same guard.
    const pendingFix = fixes['pending-migrations'];
    if (pendingFix) assert.equal(pendingFix.applied, false);
    assert.equal(checks['pending-migrations'].fixable, false);
    assert.ok(checks['pending-migrations'].details.pending.includes('0008'));
    assert.equal(checks['pending-migrations'].details.from, fixtures.AODEX_PROJECT_STAMP);

    // Everything that does not touch the index still applies.
    for (const id of ['runtime-mirror', 'skill-markers', 'guard-state', 'awareness-state', 'backups']) {
      assert.ok(fixes[id], `${id} was not attempted`);
      assert.equal(fixes[id].applied, true, `${id} not applied: ${fixes[id].refused || fixes[id].notes}`);
    }

    assert.deepEqual(lines(git(state, 'diff', '--cached', '--name-only')), ['src/unrelated.txt']);
    assert.deepEqual(
      lines(git(state, 'ls-files', '--', ...fixtures.AODEX_TRACKED_RUNTIME)),
      [...fixtures.AODEX_TRACKED_RUNTIME].sort(),
      'both guard files are still tracked'
    );
    for (const rel of RUNTIME_PATHS) {
      assert.ok(fs.existsSync(path.join(state.root, ...rel.split('/'))), `${rel} must not be deleted behind a refusal`);
    }
    assert.equal(fs.existsSync(path.join(state.root, '.gitignore')), false, 'no ignore rule written behind a refusal');
  });
});

// ─── Scope ────────────────────────────────────────────────────────────────────

describe('doctor e2e: --global scope', () => {
  let state = null;
  afterEach(() => {
    if (state) state.cleanup();
    state = null;
  });

  test('7. --global runs only the global checks, even from inside a project', () => {
    state = fixtures.makeAodexLikeState();
    const report = doctor(state, ['--global']);

    assert.equal(report.scope.project, null);
    const ids = report.checks.map((c) => c.id);
    for (const id of PROJECT_IDS) assert.ok(!ids.includes(id), `project check ${id} ran under --global`);
    assert.deepEqual([...ids].sort(), [...GLOBAL_IDS].sort());
  });
});

// ─── Real-home canary (runs last) ─────────────────────────────────────────────

test('8. the real ~/.claude/aoforge/state and ~/.claude/aoforge/backups are unchanged by the suite', () => {
  assert.deepEqual(canaryListing(), CANARY_BEFORE);
});
