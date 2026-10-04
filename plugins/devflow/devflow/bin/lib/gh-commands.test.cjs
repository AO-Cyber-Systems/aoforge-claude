'use strict';

// gh-commands.test.cjs (TRD 46-08) — the `df-tools gh` command surface on one seam.
//
// `gh sync [--all|<objective>]`, the deprecated `sync-objectives` alias, and `comment`,
// `close-issue`, `sync-release`, `resolve`, `status` on gh-client + mapping v3 + comment markers,
// the enabled gate and the exit-code rule. Every test runs against the stateful gh-fake installed
// through gh._setRunGh, with a fake clock so write pacing never really sleeps. HOME and
// DEVFLOW_GH_CACHE_DIR point at temp dirs. No real GitHub, no network.

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const gh = require('./gh.cjs');
const client = require('./gh-client.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');

const MAPPING = (root) => path.join(root, '.planning', '.gh-mapping.json');

const ROADMAP = [
  '# Roadmap',
  '',
  '## Objectives',
  '',
  '### Objective 2: a',
  '**Goal:** Build a',
  '',
  '### Objective 2.1: b',
  '**Goal:** Build b',
  '',
  '### Objective 3: c',
  '**Goal:** Build c',
  '',
].join('\n');

function buildProject({ enabled = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-cmds-'));
  const planning = path.join(root, '.planning');
  for (const [dir, n] of [['02-a', '2'], ['02.1-b', '2.1'], ['03-c', '3']]) {
    fs.mkdirSync(path.join(planning, 'objectives', dir), { recursive: true });
    fs.writeFileSync(path.join(planning, 'objectives', dir, 'OBJECTIVE.md'),
      `---\nobjective: ${dir}\n---\n\n# Objective ${n}\n`);
  }
  fs.writeFileSync(path.join(planning, 'config.json'), JSON.stringify({ github: { enabled, repo: 'o/r' } }, null, 2));
  fs.writeFileSync(path.join(planning, 'ROADMAP.md'), ROADMAP);
  fs.writeFileSync(path.join(planning, 'PROJECT.md'), '# Demo\n');
  return root;
}

let clock;
let tmpHome;
let savedEnv;
let fake;
let root;

function install(opts = {}) {
  fake = createFakeGitHub(opts);
  gh._setRunGh(fake.runGh);
  return fake;
}

/** Run fn with process.exit/stdout/stderr captured. The first exit code wins; exit does not throw. */
function capture(fn) {
  const out = { stdout: '', stderr: '', code: null };
  const saved = { exit: process.exit, out: process.stdout.write, err: process.stderr.write };
  process.exit = (c) => { if (out.code === null) out.code = c === undefined ? 0 : c; };
  process.stdout.write = (chunk) => { out.stdout += chunk; return true; };
  process.stderr.write = (chunk) => { out.stderr += chunk; return true; };
  try {
    fn();
  } finally {
    process.exit = saved.exit;
    process.stdout.write = saved.out;
    process.stderr.write = saved.err;
  }
  return out;
}

const json = (s) => JSON.parse(s);
const callsOf = (f, a0, a1) => f.calls().filter((a) => a[0] === a0 && (a1 === undefined || a[1] === a1));

beforeEach(() => {
  clock = Date.UTC(2026, 8, 30, 12, 0, 0);
  client._resetClient();
  client._setNow(() => clock);
  client._setSleep((ms) => { clock += ms; });
  gh._resetCache();
  savedEnv = { HOME: process.env.HOME, DEVFLOW_GH_CACHE_DIR: process.env.DEVFLOW_GH_CACHE_DIR };
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-cmds-home-'));
  process.env.HOME = tmpHome;
  process.env.DEVFLOW_GH_CACHE_DIR = path.join(tmpHome, 'gh-cache');
  root = buildProject();
});

afterEach(() => {
  if (fake) {
    for (const argv of fake.calls()) {
      for (const a of argv) assert.ok(!String(a).includes('[object Object]'), `argv carries [object Object]: ${argv.join(' ')}`);
    }
  }
  fake = null;
  gh._setRunGh(null);
  client._resetClient();
  client._setNow(null);
  client._setSleep(null);
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

// ─── sync / alias (tests 1-6) ────────────────────────────────────────────────

describe('gh sync [--all|<objective>]', () => {
  test('1: sync --all syncs every objective with one issue list and one label create; exit 0', () => {
    install();
    const r = capture(() => gh.cmdGhSync(root, ['--all'], false));
    assert.strictEqual(r.code, 0, r.stderr);
    const res = json(r.stdout);
    assert.strictEqual(res.ok, true);
    assert.deepStrictEqual(res.results.map((x) => x.id), ['2', '2.1', '3']);
    assert.ok(res.results.every((x) => x.ok === true && Number.isInteger(x.issue_number)), JSON.stringify(res.results));
    assert.strictEqual(res.failed, 0);
    assert.strictEqual(callsOf(fake, 'issue', 'list').length, 1, 'one marker scan per run');
    assert.strictEqual(callsOf(fake, 'label', 'create').length, 1, 'one label bootstrap per run');
    const mapping = json(fs.readFileSync(MAPPING(root), 'utf-8'));
    assert.deepStrictEqual(Object.keys(mapping.objectives).sort(), ['2', '2.1', '3']);
  });

  test('2: bare gh sync behaves like --all', () => {
    install();
    const r = capture(() => gh.cmdGhSync(root, [], false));
    assert.strictEqual(r.code, 0, r.stderr);
    const res = json(r.stdout);
    assert.deepStrictEqual(res.results.map((x) => x.id), ['2', '2.1', '3']);
    assert.strictEqual(callsOf(fake, 'issue', 'list').length, 1);
  });

  test('3: one failing objective does not stop the rest; the failure is listed and the exit is 1', () => {
    install();
    fake.failNext((a) => a[0] === 'issue' && a[1] === 'create' && a.join(' ').includes('devflow:id=3 '),
      { stderr: 'HTTP 500: something broke' });
    const r = capture(() => gh.cmdGhSync(root, ['--all'], false));
    assert.strictEqual(r.code, 1);
    const res = json(r.stdout);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.failed, 1);
    const byId = Object.fromEntries(res.results.map((x) => [x.id, x]));
    assert.strictEqual(byId['2'].ok, true);
    assert.strictEqual(byId['2.1'].ok, true);
    assert.strictEqual(byId['3'].ok, false);
    assert.ok(byId['3'].error, 'the failure carries its error');
  });

  test('4: sync-objectives is a deprecated alias of sync --all and says so on stderr', () => {
    install();
    const r = capture(() => gh.cmdGhSyncObjectives(root, false));
    assert.strictEqual(r.code, 0, r.stderr);
    assert.match(r.stderr, /deprecated.*gh sync --all/);
    assert.strictEqual(r.stderr.trim().split('\n').length, 1, 'exactly one deprecation line');
    const res = json(r.stdout);
    assert.deepStrictEqual(res.results.map((x) => x.id), ['2', '2.1', '3']);
    assert.strictEqual(callsOf(fake, 'issue', 'list').length, 1);
  });

  test('6: gh sync --help prints usage on stdout, exits 0 and makes no gh calls', () => {
    install();
    const r = capture(() => gh.cmdGhSync(root, ['2', '--help'], false));
    assert.strictEqual(r.code, 0);
    assert.match(r.stdout, /gh sync \[<objective>\|--all\]/);
    assert.deepStrictEqual(fake.calls(), []);
  });
});

// ─── comment / close-issue (tests 7-13) ──────────────────────────────────────

function syncAllQuietly() {
  const r = capture(() => gh.cmdGhSync(root, ['--all'], false));
  assert.strictEqual(r.code, 0, r.stderr);
  return json(fs.readFileSync(MAPPING(root), 'utf-8'));
}

const commentCalls = (f) => callsOf(f, 'issue', 'comment');
const bodyOf = (argv) => argv[argv.indexOf('--body') + 1];

describe('gh comment / close-issue on mapping v3 + markers', () => {
  test('7: 2, 02-a and 02 all comment on the same issue, each body opening with the kind=comment marker', () => {
    install();
    const mapping = syncAllQuietly();
    const n = String(mapping.objectives['2'].issue_id);
    for (const target of ['2', '02-a', '02']) {
      const r = capture(() => gh.cmdGhComment(root, [target, 'hi'], false));
      assert.strictEqual(r.code, 0, `${target}: ${r.stdout}${r.stderr}`);
      const res = json(r.stdout);
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.marker, true);
    }
    const posted = commentCalls(fake);
    assert.strictEqual(posted.length, 3);
    for (const argv of posted) {
      assert.strictEqual(argv[2], n);
      assert.deepStrictEqual(argv.slice(3, 5), ['--repo', 'o/r']);
      assert.ok(bodyOf(argv).startsWith('<!-- devflow:id=2 kind=comment -->'), bodyOf(argv));
    }
  });

  test('8: 2.1 comments on its own issue, not objective 2\'s', () => {
    install();
    const mapping = syncAllQuietly();
    const r = capture(() => gh.cmdGhComment(root, ['2.1', 'x'], false));
    assert.strictEqual(r.code, 0, r.stdout + r.stderr);
    const [argv] = commentCalls(fake);
    assert.strictEqual(argv[2], String(mapping.objectives['2.1'].issue_id));
    assert.notStrictEqual(argv[2], String(mapping.objectives['2'].issue_id));
    assert.ok(bodyOf(argv).startsWith('<!-- devflow:id=2.1 kind=comment -->'));
  });

  test('9: #7 posts to issue 7 raw, without a marker', () => {
    install();
    for (let i = 0; i < 7; i++) fake.seedIssue({ title: `seed ${i + 1}` });
    const r = capture(() => gh.cmdGhComment(root, ['#7', 'x'], false));
    assert.strictEqual(r.code, 0, r.stdout + r.stderr);
    const res = json(r.stdout);
    assert.strictEqual(res.issue, 7);
    assert.strictEqual(res.marker, false);
    const [argv] = commentCalls(fake);
    assert.strictEqual(argv[2], '7');
    assert.strictEqual(bodyOf(argv), 'x');
  });

  test('10: @file: body with --kind verification is the file content under a kind=verification marker', () => {
    install();
    syncAllQuietly();
    const file = path.join(root, 'V.md');
    fs.writeFileSync(file, '# Verification\n\nall green\n');
    const r = capture(() => gh.cmdGhComment(root, ['2', `@file:${file}`, '--kind', 'verification'], false));
    assert.strictEqual(r.code, 0, r.stdout + r.stderr);
    const [argv] = commentCalls(fake);
    assert.strictEqual(bodyOf(argv), '<!-- devflow:id=2 kind=verification -->\n# Verification\n\nall green\n');
  });

  test('11: close-issue 2 "Verified" closes with a kind=close marked comment', () => {
    install();
    const mapping = syncAllQuietly();
    const n = String(mapping.objectives['2'].issue_id);
    const r = capture(() => gh.cmdGhCloseIssue(root, '2', 'Verified', false));
    assert.strictEqual(r.code, 0, r.stdout + r.stderr);
    const closes = callsOf(fake, 'issue', 'close');
    assert.deepStrictEqual(closes, [['issue', 'close', n, '--repo', 'o/r', '--comment', '<!-- devflow:id=2 kind=close -->\nVerified']]);
  });

  for (const [label, legacy] of [
    ['v1', { objectives: { 2: 1 } }],
    ['v2', { objectives: { 2: { issue_id: 1, state_comment_id: null } } }],
  ]) {
    test(`12 (${label}): a legacy mapping resolves comment 2 and close-issue 2 to issue 1`, () => {
      install();
      fake.seedIssue({ title: '[Objective 2] a' });
      fs.writeFileSync(MAPPING(root), JSON.stringify(legacy));
      const c = capture(() => gh.cmdGhComment(root, ['2', 'x'], false));
      assert.strictEqual(c.code, 0, c.stdout + c.stderr);
      const k = capture(() => gh.cmdGhCloseIssue(root, '2', null, false));
      assert.strictEqual(k.code, 0, k.stdout + k.stderr);
      assert.strictEqual(commentCalls(fake)[0][2], '1');
      assert.strictEqual(callsOf(fake, 'issue', 'close')[0][2], '1');
    });
  }

  test('13: a failed comment exits 1; an unknown objective with no numeric fallback exits 1', () => {
    install();
    syncAllQuietly();
    fake.failNext((a) => a[0] === 'issue' && a[1] === 'comment', { stderr: 'HTTP 500' });
    const r = capture(() => gh.cmdGhComment(root, ['2', 'x'], false));
    assert.strictEqual(r.code, 1);
    assert.strictEqual(json(r.stdout).ok, false);
    const u = capture(() => gh.cmdGhComment(root, ['nope', 'x'], false));
    assert.strictEqual(u.code, 1);
    const c = capture(() => gh.cmdGhCloseIssue(root, 'nope', null, false));
    assert.strictEqual(c.code, 1);
  });
});

// ─── enabled gate / exit codes / status (tests 14-15) ────────────────────────

describe('enabled gate, exit codes and status', () => {
  test('14: github.enabled false -> every subcommand but status is skipped, exits 0, makes zero gh calls', () => {
    fs.rmSync(root, { recursive: true, force: true });
    root = buildProject({ enabled: false });
    install();
    const { cmdGhPull } = require('./gh-pull.cjs');
    const runs = {
      'sync 2': () => gh.cmdGhSync(root, ['2'], false),
      'sync --all': () => gh.cmdGhSync(root, ['--all'], false),
      'sync-objectives': () => gh.cmdGhSyncObjectives(root, false),
      'comment': () => gh.cmdGhComment(root, ['2', 'x'], false),
      'close-issue': () => gh.cmdGhCloseIssue(root, '2', 'x', false),
      'sync-release v1': () => gh.cmdGhSyncRelease(root, 'v1', false),
      'resolve 2': () => gh.cmdGhResolve(root, '2', false, ['2']),
      // gh-pull prints prose unless --raw (its 46-06 contract) and exits 0 by returning.
      'pull 2': () => cmdGhPull(root, ['2'], true),
    };
    for (const [name, run] of Object.entries(runs)) {
      const r = capture(run);
      const code = r.code === null ? 0 : r.code;
      assert.strictEqual(code, 0, `${name}: exit ${r.code} ${r.stdout}${r.stderr}`);
      assert.strictEqual(json(r.stdout).skipped, true, `${name}: ${r.stdout}`);
    }
    assert.deepStrictEqual(fake.calls(), []);
    const s = capture(() => gh.cmdGhStatus(root, false));
    assert.strictEqual(json(s.stdout).enabled, false);
  });

  test('14b: sync-release with no tag is a usage error (exit 1); with a tag it goes through the seam', () => {
    install();
    const u = capture(() => gh.cmdGhSyncRelease(root, undefined, false));
    assert.strictEqual(u.code, 1);
    fake.failNext((a) => a[0] === 'release' && a[1] === 'view', { stderr: 'release not found' });
    fake.failNext((a) => a[0] === 'release' && a[1] === 'create', { ok: true, stdout: 'https://github.com/o/r/releases/tag/v1' });
    const r = capture(() => gh.cmdGhSyncRelease(root, 'v1', false));
    assert.strictEqual(r.code, 0, r.stdout + r.stderr);
    const res = json(r.stdout);
    assert.strictEqual(res.action, 'created');
    const [create] = callsOf(fake, 'release', 'create');
    assert.deepStrictEqual(create.slice(0, 5), ['release', 'create', 'v1', '--repo', 'o/r']);
  });

  test('15: ghStatus checks gh through the seam (--version), not `which`', () => {
    install();
    const okStatus = gh.ghStatus(root);
    assert.strictEqual(okStatus.enabled, true, JSON.stringify(okStatus));
    assert.ok(fake.calls().some((a) => a.length === 1 && a[0] === '--version'), 'gh --version via the seam');
    fake.failNext((a) => a[0] === '--version', { status: null, stderr: 'spawnSync gh ENOENT' });
    const missing = gh.ghStatus(root);
    assert.strictEqual(missing.enabled, false);
    assert.match(missing.reason, /gh CLI not installed/);
  });
});
