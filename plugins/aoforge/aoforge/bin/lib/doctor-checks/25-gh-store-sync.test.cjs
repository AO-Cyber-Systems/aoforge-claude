'use strict';

// Tests for doctor check 25-gh-store-sync and check 22's deferral of W057-W061 (TRD 50-07, GEN-03, tests 5-7).
//
// no_llm_test_data: every project is a hand-built fixture under the OS temp dir (gh-store-fixtures + doctor-fixtures'
// fake HOME), the outbox and gh cache live in temp dirs (hermeticEnv), and a gh seam throws on any call. The check
// composes gh-health.collectStoreHealth, so this file proves the doctor rendering; the findings themselves are proved
// in gh-health.test.cjs. Nothing here touches the real ~/.claude, GitHub, the network or any port.

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const check = require('./25-gh-store-sync.cjs');
const validateHealthCheck = require('./22-validate-health.cjs');
const doctor = require('../doctor.cjs');
const health = require('../gh-health.cjs');
const client = require('../gh-client.cjs');
const ghMapping = require('../gh-mapping.cjs');
const ghTrd = require('../gh-trd.cjs');
const outbox = require('../gh-outbox.cjs');
const flush = require('../gh-outbox-flush.cjs');
const { makeDoctorHome } = require('../__fixtures__/doctor-fixtures.cjs');
const { makeStoreProject, hermeticEnv } = require('../__fixtures__/gh-store-fixtures.cjs');

const NOW = new Date('2026-10-01T12:00:00.000Z');
const STATUS_COMMAND = 'aof-tools gh outbox status';
const realCollect = health.collectStoreHealth;

let env = null;
let proj = null;
let home = null;
let ghCalls = [];

beforeEach(() => {
  env = hermeticEnv();
  home = makeDoctorHome();
  ghCalls = [];
  client._setRunGh((...args) => {
    ghCalls.push(args);
    throw new Error('gh must never be called by doctor');
  });
});

afterEach(() => {
  health.collectStoreHealth = realCollect;
  client._setRunGh(null);
  if (proj) proj.cleanup();
  proj = null;
  if (home) fs.rmSync(home, { recursive: true, force: true });
  home = null;
  if (env) env.restore();
  env = null;
});

// ─── fixtures ────────────────────────────────────────────────────────────────

/** A v3 mapping that agrees with the fixture project: objective 7 and its three TRDs. */
function consistentMapping() {
  const m = ghMapping.emptyMapping();
  ghMapping.setEntry(m, 7, { issue_id: 7000 });
  for (const n of [1, 2, 3]) ghMapping.setTrd(m, `7-0${n}`, { issue_number: 700 + n, rest_id: 7000 + n });
  return m;
}

function storeProject({ store = true, mapping = consistentMapping() } = {}) {
  proj = makeStoreProject({ store });
  if (store && mapping) {
    const r = ghMapping.writeMappingV3(proj.root, mapping);
    assert.equal(r.ok, true, r.error);
  }
  return proj.root;
}

function ctxFor(root) {
  return doctor.buildContext({ projectRoot: root, userHome: home, env: { ...env.env }, now: NOW });
}

const halt = (root) => {
  const r = outbox.setHalted(root, { reason: 'remote-edit', seq: 4, target: { id: '7-01' }, detail: 'TRD 7-01 was edited on GitHub' });
  assert.equal(r.ok, true, r.error);
};

const queue = (root) => {
  const r = outbox.enqueue(root, [
    { kind: 'patch-issue', target: { id: '7-01' }, payload: { state: 'closed' } },
    { kind: 'patch-issue', target: { id: '7-02' }, payload: { state: 'closed' } },
  ]);
  assert.equal(r.ok, true, r.error);
};

/** Freeze TRD 7-02 at its current text, then edit it: one W060. */
function driftFrozen(root) {
  const file = '07-02-beta-TRD.md';
  const trdPath = path.join(root, '.planning', 'objectives', proj.objectiveDir, file);
  const original = fs.readFileSync(trdPath, 'utf8');
  const body = ghTrd.encodeTrdBody({ id: '7-02', file, text: original });
  const base = flush.baseFromIssue({ number: 702, id: 7002, body, updated_at: '2026-10-01T00:00:00Z' }, null);
  assert.equal(outbox.setBase(root, '7-02', { ...base, frozen: true }).ok, true);
  fs.writeFileSync(trdPath, `${original}\nEdited after the freeze.\n`);
}

/** Every file under the temp outbox dir, with its bytes, so a run can be proved read-only. */
function outboxSnapshot() {
  const dir = env.env.AOFORGE_OUTBOX_DIR;
  if (!fs.existsSync(dir)) return null;
  return Object.fromEntries(fs.readdirSync(dir).sort().map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
}

// ─── the contract ────────────────────────────────────────────────────────────

describe('gh-store-sync: contract', () => {
  test('a project check in the 20-29 range, report-only (no fix)', () => {
    assert.equal(check.id, 'gh-store-sync');
    assert.equal(check.scope, 'project');
    assert.equal(typeof check.title, 'string');
    assert.equal(typeof check.run, 'function');
    assert.equal(check.fix, undefined, 'never fixable by doctor --fix');
    assert.deepEqual(doctor.contractIssues(check), []);
  });
});

// ─── 5. the check ────────────────────────────────────────────────────────────

describe('gh-store-sync: test 5', () => {
  test('5a. not a store-mode project -> ok, says so, reads no outbox state, no gh call', () => {
    const root = storeProject({ store: false });

    const r = check.run(ctxFor(root));

    assert.equal(r.severity, 'ok');
    assert.equal(r.fixable, false);
    assert.match(r.finding, /not a store-mode project/);
    assert.equal(r.fix_command, undefined);
    assert.equal(outboxSnapshot(), null, 'local mode reads and writes no outbox state');
    assert.equal(ghCalls.length, 0);
  });

  test('5b. a halted outbox -> warn, fix_command `aof-tools gh outbox status`, report-only', () => {
    const root = storeProject();
    halt(root);

    const r = check.run(ctxFor(root));

    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, false);
    assert.equal(r.fix_command, STATUS_COMMAND);
    assert.match(r.finding, /W057/);
    assert.match(r.finding, /halted/);
    assert.deepEqual(r.details.codes, ['W057']);
    assert.equal(r.details.findings.length, 1);
    assert.equal(r.details.findings[0].code, 'W057');
    assert.equal(ghCalls.length, 0);

    const report = doctor.runDoctor({ projectRoot: root, userHome: home, env: { ...env.env }, now: NOW, checks: [check] });
    assert.equal(report.checks[0].id, 'gh-store-sync');
    assert.equal(report.checks[0].severity, 'warn');
    assert.equal(report.checks[0].fixable, false);
    assert.equal(report.checks[0].fix_command, STATUS_COMMAND);
  });

  test('5c. a clean store project -> ok, no fix_command', () => {
    const root = storeProject();

    const r = check.run(ctxFor(root));

    assert.equal(r.severity, 'ok');
    assert.equal(r.fixable, false);
    assert.match(r.finding, /no store sync problems/);
    assert.equal(r.fix_command, undefined);
    assert.deepEqual(r.details.findings, []);
    assert.equal(ghCalls.length, 0);
  });

  test('5d. several problems -> one warn; fix_command is the most urgent (halt > unsynced > frozen > links > orphans)', () => {
    const m = consistentMapping();
    ghMapping.setTrd(m, '7-09', { issue_number: 709, rest_id: 7009 }); // an orphan
    const root = storeProject({ mapping: m });
    queue(root);
    halt(root);
    driftFrozen(root);

    const r = check.run(ctxFor(root));

    assert.equal(r.severity, 'warn');
    assert.equal(r.fix_command, STATUS_COMMAND, 'the halt outranks everything else');
    assert.deepEqual(r.details.codes, ['W057', 'W059', 'W060']);
    assert.equal(r.details.findings.length, 4, JSON.stringify(r.details.findings)); // pending + halt + orphan + drift
    assert.deepEqual(r.details.fix_commands, {
      W057: STATUS_COMMAND,
      W059: 'aof-tools gh orphans 7',
      W060: 'aof-tools gh trd scope 7-02',
    });
  });

  test('5e. the fix_command follows the urgency order when the higher problems are absent', () => {
    // unsynced (not halted) outranks a frozen drift
    let root = storeProject();
    queue(root);
    driftFrozen(root);
    assert.equal(check.run(ctxFor(root)).fix_command, 'aof-tools gh outbox flush');
    proj.cleanup();

    // a frozen drift outranks missing links
    root = storeProject({ mapping: null });
    driftFrozen(root);
    const r = check.run(ctxFor(root));
    assert.deepEqual(r.details.codes, ['W058', 'W060']);
    assert.equal(r.fix_command, 'aof-tools gh trd scope 7-02');
    proj.cleanup();

    // links outrank orphans: TRDs mapped but their objective is not (W058), plus a mapped TRD with no file (W059)
    const m = ghMapping.emptyMapping();
    for (const id of ['7-01', '7-02', '7-03', '7-09']) ghMapping.setTrd(m, id, { issue_number: 700, rest_id: 7000 });
    root = storeProject({ mapping: m });
    const links = check.run(ctxFor(root));
    assert.deepEqual(links.details.codes, ['W058', 'W059']);
    assert.equal(links.fix_command, 'aof-tools gh sync 7');
  });

  test('5f. run() never writes: the outbox is byte-identical after a run on a problem project', () => {
    const root = storeProject();
    queue(root);
    halt(root);
    const before = outboxSnapshot();
    assert.ok(before && Object.keys(before).length > 0, 'precondition: the outbox has state');

    check.run(ctxFor(root));
    check.run(ctxFor(root));

    assert.deepEqual(outboxSnapshot(), before);
  });

  test('5g. a collector that throws is a warn naming the failure, never a crash', () => {
    const root = storeProject();
    health.collectStoreHealth = () => { throw new Error('collector blew up'); };

    const r = check.run(ctxFor(root));

    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, false);
    assert.match(r.finding, /collector blew up/);
    assert.equal(r.fix_command, 'aof-tools validate health --raw');
  });

  test('5h. no project -> ok', () => {
    const r = check.run({ projectRoot: null });
    assert.equal(r.severity, 'ok');
    assert.equal(r.fixable, false);
  });
});

// ─── 6. check 22 defers W057-W061 ────────────────────────────────────────────

describe('validate-health check defers the store codes (test 6)', () => {
  const STORE_CODES = ['W057', 'W058', 'W059', 'W060', 'W061'];
  const issue = (code) => ({ code, message: `${code} message`, fix: 'fix it', repairable: false });
  const report = (warnings) => ({ status: 'degraded', errors: [], warnings, info: [], repairable_count: 0 });

  /** check 22's run() with its spawned `validate health` replaced by a stub that prints `json`. */
  function runWith(json) {
    const ctx = ctxFor(home);
    ctx.exec = () => ({ status: 0, stdout: JSON.stringify(json), stderr: '' });
    return validateHealthCheck.run(ctx);
  }

  test('6a. DEFERRED lists every store code beside the existing three', () => {
    for (const code of STORE_CODES) assert.ok(validateHealthCheck.DEFERRED.includes(code), `${code} is deferred`);
    for (const code of ['E020', 'I022', 'W040']) assert.ok(validateHealthCheck.DEFERRED.includes(code), `${code} still deferred`);
  });

  test('6b. a report whose only warning is W057 -> ok, W057 listed in details.deferred, severity not raised', () => {
    const r = runWith(report([issue('W057')]));

    assert.equal(r.severity, 'ok');
    assert.deepEqual(r.details.deferred, ['W057']);
    assert.deepEqual(r.details.codes, []);
    assert.match(r.finding, /deferred to other checks: W057/);
  });

  test('6c. every store code is deferred, and a non-store warning beside them still warns on its own', () => {
    const r = runWith(report([...STORE_CODES.map(issue), issue('W001')]));

    assert.equal(r.severity, 'warn');
    assert.deepEqual(r.details.deferred, STORE_CODES);
    assert.deepEqual(r.details.codes, ['W001']);
    assert.doesNotMatch(r.finding, /W05[7-9]|W06[01]/, 'a deferred code never appears in the finding');
  });
});

// ─── 7. the README ───────────────────────────────────────────────────────────

describe('doctor-checks README (test 7)', () => {
  test('7. the numbering table lists 25-gh-store-sync', () => {
    const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
    const row = readme.split('\n').find((line) => line.startsWith('|') && line.includes('25-gh-store-sync'));
    assert.ok(row, 'a table row names 25-gh-store-sync');
    assert.match(row, /20-29/, 'the row is the 20-29 project range');
  });
});
