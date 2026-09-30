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
