'use strict';

/**
 * Tests for the requirements-agreement wiring (TRD 69-05, TOOL-10): `validate health` Check 20 (W065) and the read-only
 * `validate requirements [--objective <N>]` command.
 *
 * Check 20 and the command render what requirements-agreement.scan returns. W065 `requirements-unlisted` is a warning
 * that is never repairable (which SUMMARY should list a requirement is a judgement, made through `summary post`), and a
 * check that cannot run reports as W065 `requirements-check-failed` instead of going silent.
 *
 * Hermetic: every project is a temp directory built by requirements-fixtures.cjs (the objective 58 shape), a temp homeDir,
 * and mainVersionFn / installedPluginFn stubs so Check 11 does no git fetch. Only test 9 reads this repository, read-only.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { cmdValidateHealth } = require('./validate.cjs');
const {
  makeRequirementsProject,
  fiftyEightShape,
  verificationText,
  summaryText,
  trdText,
} = require('./__fixtures__/requirements-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const INSTALLED = () => ({ version: '2.14.0', installPath: '/fake' });
const created = [];
const homes = [];

function project(opts) {
  const p = makeRequirementsProject(opts);
  created.push(p);
  return p;
}

afterEach(() => {
  while (created.length) created.pop().cleanup();
  while (homes.length) fs.rmSync(homes.pop(), { recursive: true, force: true });
});

/** cmdValidateHealth ends in output(), which prints and exits: capture the JSON and swallow the exit. */
function runHealth(p, extra = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-validate-reqs-home-'));
  homes.push(home);
  const chunks = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  const origExit = process.exit.bind(process);
  process.stdout.write = (chunk) => { chunks.push(chunk); return true; };
  process.exit = (code) => { throw new Error(`process.exit(${code})`); };
  try {
    cmdValidateHealth(p.root, { homeDir: home, mainVersionFn: () => null, installedPluginFn: INSTALLED, ...extra }, true);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.stdout.write = origWrite;
    process.exit = origExit;
  }
  return JSON.parse(chunks[chunks.length - 1]);
}

const w065 = (json) => [...json.errors, ...json.warnings, ...json.info].filter((i) => i.code === 'W065');
const repairable = (json) => [...json.errors, ...json.warnings].filter((i) => i.repairable).length;

describe('Check 20: W065 requirements-completed agrees with VERIFICATION', () => {
  test('6. the 58-shaped gap -> two W065 warnings (EST-02, EST-04), fixes name the candidate TRDs, never repairable', () => {
    const gap = runHealth(project(fiftyEightShape()));
    const found = w065(gap);
    assert.equal(found.length, 2, JSON.stringify(found));
    assert.equal(gap.warnings.filter((i) => i.code === 'W065').length, 2, 'reported as warnings, not errors or info');

    const [est02, est04] = found;
    assert.match(est02.message, /^requirements-unlisted: objective 58 \(58-VERIFICATION\.md\) marks EST-02 satisfied/);
    assert.match(est02.fix, /58-05, 58-08 or 58-10/);
    assert.match(est02.fix, /summary post/);
    assert.match(est04.message, /^requirements-unlisted: objective 58 \(58-VERIFICATION\.md\) marks EST-04 satisfied/);
    assert.match(est04.fix, /58-09 or 58-10/);
    assert.match(est04.fix, /summary post/);
    assert.deepEqual(found.map((i) => i.repairable), [false, false]);

    // Neither finding counts as repairable: the same project with the gap closed reports the same repairable_count.
    const closed = runHealth(project(fiftyEightShape({ corrected: true })));
    assert.deepEqual(w065(closed), [], 'the corrected shape has no W065');
    assert.equal(gap.repairable_count, repairable(gap));
    assert.equal(gap.repairable_count, closed.repairable_count);
  });

  test('7. a scan that throws is reported as W065 requirements-check-failed, never silent', () => {
    const json = runHealth(project(fiftyEightShape()), {
      requirementsAgreement: { scan() { throw new Error('boom'); } },
    });
    const found = w065(json);
    assert.equal(found.length, 1, JSON.stringify(found));
    assert.equal(found[0].message, 'requirements-check-failed: boom');
    assert.equal(found[0].repairable, false);
    assert.match(found[0].fix, /validate requirements/);
    assert.equal(json.warnings.filter((i) => i.code === 'W065').length, 1);
  });
});

/** The real CLI: `aof-tools --cwd <root> validate requirements <args>`. */
function runCli(root, args = []) {
  return spawnSync(process.execPath, [DF_TOOLS, '--cwd', root, 'validate', 'requirements', ...args], { encoding: 'utf8' });
}

/** The 58-shaped gap plus a clean objective 57 (one requirement, listed by its only SUMMARY). */
function gapAndCleanFiftySeven() {
  const shape = fiftyEightShape();
  return {
    requirements: ['EST-01', ...shape.requirements],
    objectives: [
      {
        dir: '57-pre',
        verifications: {
          '57-VERIFICATION.md': verificationText({
            header: '| Req | Plans | Status |',
            coverage: ['| EST-01 | 57-01 | SATISFIED |'],
          }),
        },
        summaries: { '57-01-SUMMARY.md': summaryText('requirements-completed: [EST-01]', { objective: '57-pre' }) },
        trds: { '57-01-groundwork-TRD.md': trdText('[EST-01]', { objective: '57-pre' }) },
      },
      ...shape.objectives,
    ],
  };
}

describe('validate requirements: the read-only form for one objective or all', () => {
  test('1. spawned on the 58-shaped gap -> exit 0 and JSON findings for EST-02 and EST-04 with message and fix', () => {
    const p = project(fiftyEightShape());
    const r = runCli(p.root);
    assert.equal(r.status, 0, r.stderr);
    const json = JSON.parse(r.stdout);

    assert.deepEqual(json.findings.map((f) => f.requirement), ['EST-02', 'EST-04']);
    const [est02, est04] = json.findings;
    assert.deepEqual(est02.candidates, ['58-05', '58-08', '58-10']);
    assert.deepEqual(est04.candidates, ['58-09', '58-10']);
    for (const f of json.findings) {
      assert.equal(f.objective, '58-est');
      assert.equal(f.number, '58');
      assert.equal(f.verification, '58-VERIFICATION.md');
      assert.match(f.message, /^requirements-unlisted: /);
      assert.match(f.fix, /summary post/);
    }
    assert.deepEqual(json.checked, { objectives: 1, requirements: 4 });
    assert.deepEqual(json.skipped, []);
  });

  test('2. --raw prints a W065 line and an indented fix line per finding', () => {
    const p = project(fiftyEightShape());
    const r = runCli(p.root, ['--raw']);
    assert.equal(r.status, 0, r.stderr);
    const lines = r.stdout.trimEnd().split('\n');
    assert.equal(lines.length, 4, r.stdout);
    assert.match(lines[0], /^W065 requirements-unlisted: objective 58 \(58-VERIFICATION\.md\) marks EST-02 satisfied/);
    assert.match(lines[1], /^ {2}fix: Add EST-02 to requirements-completed in the SUMMARY of 58-05, 58-08 or 58-10/);
    assert.match(lines[2], /^W065 requirements-unlisted: objective 58 \(58-VERIFICATION\.md\) marks EST-04 satisfied/);
    assert.match(lines[3], /^ {2}fix: Add EST-04 to requirements-completed in the SUMMARY of 58-09 or 58-10/);
  });

  test('3. once the SUMMARYs list EST-02 and EST-04, --raw says the two sources agree', () => {
    const p = project(fiftyEightShape());
    p.write(path.join('objectives', '58-est', '58-05-SUMMARY.md'), summaryText('requirements-completed: [EST-02, EST-03]', { trd: '05' }));
    p.write(path.join('objectives', '58-est', '58-09-SUMMARY.md'), summaryText('requirements-completed: [EST-04, EST-05]', { trd: '09' }));
    const r = runCli(p.root, ['--raw']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trimEnd(), 'requirements-completed agrees with VERIFICATION (1 objective, 4 requirements checked)');
    assert.deepEqual(JSON.parse(runCli(p.root).stdout).findings, []);
  });

  test('4. --objective 57 (clean) finds nothing, --objective=58 finds the two; the filter counts only that objective', () => {
    const p = project(gapAndCleanFiftySeven());

    const clean = runCli(p.root, ['--objective', '57', '--raw']);
    assert.equal(clean.status, 0, clean.stderr);
    assert.equal(clean.stdout.trimEnd(), 'requirements-completed agrees with VERIFICATION (1 objective, 1 requirement checked)');

    const gap = JSON.parse(runCli(p.root, ['--objective=58']).stdout);
    assert.deepEqual(gap.findings.map((f) => f.requirement), ['EST-02', 'EST-04']);
    assert.deepEqual(gap.checked, { objectives: 1, requirements: 4 });

    const all = JSON.parse(runCli(p.root).stdout);
    assert.deepEqual(all.findings.map((f) => f.requirement), ['EST-02', 'EST-04']);
    assert.deepEqual(all.checked, { objectives: 2, requirements: 5 });
  });

  test('5. no .planning/ -> a note, exit 0, in JSON and in --raw', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-validate-reqs-empty-')));
    homes.push(root);
    const json = runCli(root);
    assert.equal(json.status, 0, json.stderr);
    assert.deepEqual(JSON.parse(json.stdout), { findings: [], checked: {}, note: 'no .planning/' });
    const raw = runCli(root, ['--raw']);
    assert.equal(raw.status, 0, raw.stderr);
    assert.equal(raw.stdout.trimEnd(), 'no .planning/');
  });

  test('9. this repository (read-only): validate requirements finds nothing', {
    skip: !fs.existsSync(path.join(REPO_ROOT, '.planning', 'objectives')) && 'not an AOForge checkout',
  }, () => {
    const r = runCli(REPO_ROOT);
    assert.equal(r.status, 0, r.stderr);
    const json = JSON.parse(r.stdout);
    assert.deepEqual(json.findings.map((f) => `${f.objective}:${f.requirement}`), []);
    assert.ok(json.checked.objectives > 0, 'the repository has objectives with a VERIFICATION');
  });
});
