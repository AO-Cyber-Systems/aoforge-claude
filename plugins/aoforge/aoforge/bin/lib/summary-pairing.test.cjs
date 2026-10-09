'use strict';

/**
 * TRD 53-02: one rule for which TRDs have a summary.
 *
 * Executors and `summary post` write `NN-MM-SUMMARY.md`; planners name TRDs
 * `NN-MM-<slug>-TRD.md`. Every reader must pair the two on the `NN-MM` key and
 * agree with roadmap-reconcile (the reference rule) on what counts as complete.
 *
 * One hand-built fixture, six readers:
 *   validate health (I001), objective-job-index, find-objective (incomplete_jobs),
 *   verify objective-completeness, roadmap-reconcile _checkSummaryExists,
 *   gate-executor-stop summaryExists.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
// Every reader is compared on the legacy planning directory: gate-executor-stop (a hook) resolves only that name until
// 72-06 moves it onto the resolver, and the library readers reach it through the fallback (TRD 72-05).
const PLANNING = require('./legacy-names.cjs').LEGACY.planningDir;

const DF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const { findObjectiveInternal } = require('./objective.cjs');
const { _checkSummaryExists } = require('./roadmap-reconcile.cjs');
const { summaryExists } = require(path.join(__dirname, '..', '..', '..', 'hooks', 'gate-executor-stop.js'));

const TRD_BODY = (n) => `---\nobjective: 07-demo\ntrd: "0${n}"\nwave: 1\nautonomous: true\n---\n\n# TRD 07-0${n}\n\n<task type="auto"><name>t</name></task>\n`;
const PASSED = '# Summary\n\n## Progress\n- [x] Task 1: x\n\n## Self-Check: PASSED\n';
const CHECKPOINT_ONLY = '# Summary\n\n## Progress\n- [x] Task 1: x — (this commit)\n- [ ] Task 2: y — next step: edit z\n';

let tmpDirs = [];

function mkTmp(prefix) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  tmpDirs.push(d);
  return d;
}

after(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  tmpDirs = [];
});

/** Hand-built project: ROADMAP listing the TRDs plus the objective dir with the given files. */
function makeProject(files, trdIds = ['01', '02', '03', '04']) {
  const root = mkTmp('df-pairing-');
  const dir = path.join(root, PLANNING, 'objectives', '07-demo');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  const lines = trdIds.map((n) => `- [ ] 07-${n}-x-TRD.md — x`).join('\n');
  fs.writeFileSync(
    path.join(root, PLANNING, 'ROADMAP.md'),
    `# Roadmap\n\n### Objective 07: demo\n\n${lines}\n`,
  );
  return { root, dir };
}

/** Spawn the repo aof-tools with cwd = fixture and a hermetic HOME; return parsed JSON stdout. */
function cli(cwd, args, home) {
  const r = spawnSync(process.execPath, [DF_TOOLS, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, HOME: home, AOFORGE_SKIP_UPGRADE: '1' },
  });
  try {
    return JSON.parse(r.stdout);
  } catch {
    assert.fail(`aof-tools ${args.join(' ')} did not print JSON (exit ${r.status}):\n${r.stdout}\n${r.stderr}`);
  }
}

const ALL = ['07-01', '07-02', '07-03', '07-04'];
const WITH_SUMMARY = ['07-01', '07-02', '07-04'];

describe('TRD 53-02: six readers agree on which TRDs have a summary', () => {
  let root;
  let dir;
  let home;

  before(() => {
    ({ root, dir } = makeProject({
      '07-01-alpha-TRD.md': TRD_BODY(1),
      '07-01-SUMMARY.md': PASSED, // short name: what executors and `summary post` write
      '07-02-beta-TRD.md': TRD_BODY(2),
      '07-02-beta-SUMMARY.md': PASSED, // long name
      '07-03-gamma-TRD.md': TRD_BODY(3), // no summary
      '07-04-TRD.md': TRD_BODY(4),
      '07-04-SUMMARY.md': PASSED, // unnamed
    }));
    home = mkTmp('df-pairing-home-');
  });

  const keyOf = (id) => id.slice(0, 5);

  test('validate health: I001 only for 07-03-gamma-TRD.md', () => {
    const json = cli(root, ['validate', 'health'], home);
    const i001 = json.info.filter((i) => i.code === 'I001').map((i) => i.message);
    assert.deepStrictEqual(i001, ['07-demo/07-03-gamma-TRD.md has no SUMMARY.md']);
  });

  test('objective-job-index 07: has_summary true for 01, 02, 04 and false for 03', () => {
    const json = cli(root, ['objective-job-index', '07'], home);
    const got = Object.fromEntries(json.jobs.map((j) => [keyOf(j.id), j.has_summary]));
    assert.deepStrictEqual(got, { '07-01': true, '07-02': true, '07-03': false, '07-04': true });
    assert.deepStrictEqual(json.incomplete.map(keyOf), ['07-03']);
  });

  test('objective-job-index keeps the job id shape (stripPlanSuffix of the TRD name)', () => {
    const json = cli(root, ['objective-job-index', '07'], home);
    assert.deepStrictEqual(json.jobs.map((j) => j.id), ['07-01-alpha', '07-02-beta', '07-03-gamma', '07-04']);
  });

  test('find-objective (findObjectiveInternal): incomplete_jobs is exactly 07-03-gamma-TRD.md', () => {
    const info = findObjectiveInternal(root, '07');
    assert.strictEqual(info.found, true);
    assert.deepStrictEqual(info.incomplete_jobs, ['07-03-gamma-TRD.md']);
  });

  test('verify objective-completeness 07: only 07-03 is missing a summary, no orphan summaries', () => {
    const json = cli(root, ['verify', 'objective-completeness', '07'], home);
    assert.deepStrictEqual(json.incomplete_jobs.map(keyOf), ['07-03']);
    assert.deepStrictEqual(json.orphan_summaries, []);
    assert.ok(!json.warnings.some((w) => /Summaries without plans/.test(w)), JSON.stringify(json.warnings));
    assert.strictEqual(json.complete, false);
  });

  test('validate consistency: no orphan-summary warning for the short and long summary names', () => {
    const json = cli(root, ['validate', 'consistency'], home);
    const orphans = json.warnings.filter((w) => /has no matching TRD\.md or JOB\.md/.test(w));
    assert.deepStrictEqual(orphans, []);
  });

  test('roadmap-reconcile _checkSummaryExists agrees', () => {
    const got = ALL.filter((id) => _checkSummaryExists(dir, id));
    assert.deepStrictEqual(got, WITH_SUMMARY);
  });

  test('gate-executor-stop summaryExists agrees', () => {
    const got = ALL.filter((id) => summaryExists(id, [root]));
    assert.deepStrictEqual(got, WITH_SUMMARY);
  });

  test('all six readers produce the same set of TRDs with a summary', () => {
    const health = cli(root, ['validate', 'health'], home);
    const missing = new Set(health.info.filter((i) => i.code === 'I001').map((i) => i.message.match(/(07-0\d)/)[1]));
    const fromHealth = ALL.filter((id) => !missing.has(id));

    const index = cli(root, ['objective-job-index', '07'], home);
    const fromIndex = index.jobs.filter((j) => j.has_summary).map((j) => keyOf(j.id));

    const incompleteNames = findObjectiveInternal(root, '07').incomplete_jobs.map(keyOf);
    const fromFind = ALL.filter((id) => !incompleteNames.includes(id));

    const completeness = cli(root, ['verify', 'objective-completeness', '07'], home);
    const fromCompleteness = ALL.filter((id) => !completeness.incomplete_jobs.map(keyOf).includes(id));

    const fromReconcile = ALL.filter((id) => _checkSummaryExists(dir, id));
    const fromHook = ALL.filter((id) => summaryExists(id, [root]));

    for (const [name, got] of Object.entries({ fromHealth, fromIndex, fromFind, fromCompleteness, fromReconcile, fromHook })) {
      assert.deepStrictEqual(got, WITH_SUMMARY, name);
    }
  });
});

describe('TRD 53-02: job-index keeps the checkpoint rule for short-name summaries', () => {
  test('a short-name SUMMARY with ## Progress and no ## Self-Check is has_summary: false', () => {
    const { root } = makeProject(
      {
        '07-01-alpha-TRD.md': TRD_BODY(1),
        '07-01-SUMMARY.md': CHECKPOINT_ONLY,
        '07-02-beta-TRD.md': TRD_BODY(2),
        '07-02-SUMMARY.md': PASSED,
      },
      ['01', '02'],
    );
    const home = mkTmp('df-pairing-home-');
    const json = cli(root, ['objective-job-index', '07'], home);
    const got = Object.fromEntries(json.jobs.map((j) => [keyOf(j.id), j.has_summary]));
    assert.deepStrictEqual(got, { '07-01': false, '07-02': true });
    assert.deepStrictEqual(json.incomplete.map(keyOf), ['07-01']);
  });

  function keyOf(id) { return id.slice(0, 5); }
});

describe('TRD 53-02: legacy shapes still pair across the readers', () => {
  const SHAPES = [
    ['NN-MM-TRD.md / NN-MM-SUMMARY.md', { '07-01-TRD.md': TRD_BODY(1), '07-01-SUMMARY.md': PASSED }],
    ['NN-MM-JOB.md / NN-MM-SUMMARY.md', { '07-01-JOB.md': TRD_BODY(1), '07-01-SUMMARY.md': PASSED }],
    ['bare TRD.md / SUMMARY.md', { 'TRD.md': TRD_BODY(1), 'SUMMARY.md': PASSED }],
  ];

  for (const [name, files] of SHAPES) {
    test(`job-index and find-objective: ${name}`, () => {
      const { root } = makeProject(files, ['01']);
      const home = mkTmp('df-pairing-home-');
      const json = cli(root, ['objective-job-index', '07'], home);
      assert.deepStrictEqual(json.jobs.map((j) => j.has_summary), [true], JSON.stringify(json.jobs));
      assert.deepStrictEqual(findObjectiveInternal(root, '07').incomplete_jobs, []);
    });
  }

  test('decimal objective: 07.1-02-x-TRD.md pairs with 07.1-02-SUMMARY.md', () => {
    const root = mkTmp('df-pairing-dec-');
    const dir = path.join(root, PLANNING, 'objectives', '07.1-urgent');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '07.1-02-x-TRD.md'), TRD_BODY(2));
    fs.writeFileSync(path.join(dir, '07.1-02-SUMMARY.md'), PASSED);
    fs.writeFileSync(path.join(root, PLANNING, 'ROADMAP.md'), '# Roadmap\n\n### Objective 07.1: urgent\n');
    const home = mkTmp('df-pairing-home-');
    const json = cli(root, ['objective-job-index', '07.1'], home);
    assert.deepStrictEqual(json.jobs.map((j) => j.has_summary), [true], JSON.stringify(json.jobs));
    assert.deepStrictEqual(findObjectiveInternal(root, '07.1').incomplete_jobs, []);
    assert.strictEqual(summaryExists('07.1-02', [root]), true);
    assert.strictEqual(_checkSummaryExists(dir, '07.1-02'), true);
  });
});
