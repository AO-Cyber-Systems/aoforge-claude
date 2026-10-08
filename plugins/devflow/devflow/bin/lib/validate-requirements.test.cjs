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

const { cmdValidateHealth } = require('./validate.cjs');
const { makeRequirementsProject, fiftyEightShape } = require('./__fixtures__/requirements-fixtures.cjs');

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
