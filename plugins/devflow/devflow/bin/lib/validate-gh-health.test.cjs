'use strict';

/**
 * Tests for validate health Check 16: store sync health, W057-W061 (TRD 50-07, GEN-03).
 *
 * Check 16 only renders what gh-health.collectStoreHealth (TRD 50-04) returns, so these tests prove the rendering: store
 * mode reports each finding as a warning that is never repairable and never an error, a collector that throws is one
 * W061, and a local-mode project is byte-identical to a run with Check 16 switched off.
 *
 * Hermetic: every test installs a gh seam that throws on any call, points the outbox and gh cache at temp dirs through
 * hermeticEnv(), and passes a temp homeDir to validate health. Nothing here touches the real ~/.claude, the network or git.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { cmdValidateHealth } = require('./validate.cjs');
const health = require('./gh-health.cjs');
const client = require('./gh-client.cjs');
const ghMapping = require('./gh-mapping.cjs');
const ghTrd = require('./gh-trd.cjs');
const outbox = require('./gh-outbox.cjs');
const flush = require('./gh-outbox-flush.cjs');
const { makeStoreProject, hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');

const STORE_CODES = ['W057', 'W058', 'W059', 'W060', 'W061'];

let env = null;
let proj = null;
let home = null;
let ghCalls = [];
const realCollect = health.collectStoreHealth;

beforeEach(() => {
  env = hermeticEnv();
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-validate-gh-home-'));
  ghCalls = [];
  client._setRunGh((...args) => {
    ghCalls.push(args);
    throw new Error('gh must never be called by validate health');
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

function project({ store = true, mapping = consistentMapping() } = {}) {
  proj = makeStoreProject({ store });
  if (store && mapping) {
    const r = ghMapping.writeMappingV3(proj.root, mapping);
    assert.equal(r.ok, true, r.error);
  }
  return proj.root;
}

/** cmdValidateHealth ends in output(), which prints and exits: capture the JSON and swallow the exit. */
function runHealth(root) {
  const chunks = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { chunks.push(chunk); return true; };
  const origExit = process.exit.bind(process);
  process.exit = (code) => { throw new Error(`process.exit(${code})`); };
  try {
    cmdValidateHealth(root, { homeDir: home, mainVersionFn: () => null }, true);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.stdout.write = origWrite;
    process.exit = origExit;
  }
  return JSON.parse(chunks[chunks.length - 1]);
}

const storeIssues = (json) => [...json.errors, ...json.warnings, ...json.info].filter((i) => STORE_CODES.includes(i.code));
const byCode = (json, code) => json.warnings.filter((i) => i.code === code);

// ─── 1. unsynced writes are warnings, never repairable, never errors ─────────

describe('Check 16: W057 unsynced writes', () => {
  test('1. two pending ops -> one W057 warning, repairable false, errors and repairable_count unchanged', () => {
    const root = project();
    const before = runHealth(root);
    assert.deepEqual(storeIssues(before), [], 'a synced store project reports nothing from Check 16');

    const r = outbox.enqueue(root, [
      { kind: 'patch-issue', target: { id: '7-01' }, payload: { state: 'closed' } },
      { kind: 'patch-issue', target: { id: '7-02' }, payload: { state: 'closed' } },
    ]);
    assert.equal(r.ok, true, r.error);

    const after = runHealth(root);
    const w057 = byCode(after, 'W057');
    assert.equal(w057.length, 1, JSON.stringify(storeIssues(after)));
    assert.equal(w057[0].repairable, false);
    assert.match(w057[0].message, /2 queued changes/);
    assert.match(w057[0].fix, /df-tools gh outbox flush/);

    assert.deepEqual(storeIssues(after).map((i) => i.code), ['W057']);
    assert.deepEqual(after.errors, before.errors, 'a store finding never becomes an error');
    assert.equal(after.repairable_count, before.repairable_count, 'a store finding is never repairable');
    assert.equal(ghCalls.length, 0);
  });
});

// ─── 2. orphans and frozen drift ─────────────────────────────────────────────

describe('Check 16: W059 orphans and W060 frozen-body drift', () => {
  test('2. an orphan mapping entry and a frozen-drifted TRD are both reported, warnings only', () => {
    const m = consistentMapping();
    ghMapping.setTrd(m, '7-09', { issue_number: 709, rest_id: 7009 }); // mapped, no file
    const root = project({ mapping: m });

    const file = '07-02-beta-TRD.md';
    const trdPath = path.join(root, '.planning', 'objectives', proj.objectiveDir, file);
    const original = fs.readFileSync(trdPath, 'utf8');
    const body = ghTrd.encodeTrdBody({ id: '7-02', file, text: original });
    const base = flush.baseFromIssue({ number: 702, id: 7002, body, updated_at: '2026-10-01T00:00:00Z' }, null);
    assert.equal(outbox.setBase(root, '7-02', { ...base, frozen: true }).ok, true);
    fs.writeFileSync(trdPath, `${original}\nEdited after the freeze.\n`);

    const json = runHealth(root);

    const w059 = byCode(json, 'W059');
    const w060 = byCode(json, 'W060');
    assert.equal(w059.length, 1, JSON.stringify(storeIssues(json)));
    assert.match(w059[0].message, /7-09/);
    assert.match(w059[0].fix, /df-tools gh orphans 7/);
    assert.equal(w060.length, 1, JSON.stringify(storeIssues(json)));
    assert.match(w060[0].message, /7-02/);
    assert.match(w060[0].fix, /df-tools gh trd scope 7-02/);
    for (const i of [...w059, ...w060]) assert.equal(i.repairable, false);
    assert.equal(json.errors.filter((e) => STORE_CODES.includes(e.code)).length, 0);
    assert.equal(ghCalls.length, 0);
  });
});

// ─── 3. a collector that throws is one W061 ──────────────────────────────────

describe('Check 16: W061 the check itself failed', () => {
  test('3. collectStoreHealth throwing -> one W061 warning named gh-health-check-failed, never a crash', () => {
    const root = project();
    health.collectStoreHealth = () => { throw new Error('collector blew up'); };

    const json = runHealth(root);

    const w061 = byCode(json, 'W061');
    assert.equal(w061.length, 1, JSON.stringify(storeIssues(json)));
    assert.match(w061[0].message, /^gh-health-check-failed: collector blew up/);
    assert.equal(w061[0].repairable, false);
    assert.ok(w061[0].fix.length > 0);
    assert.equal(storeIssues(json).length, 1);
    assert.equal(json.errors.filter((e) => e.code === 'W061').length, 0);
  });
});

// ─── 4. D-01: local mode is unchanged ────────────────────────────────────────

describe('Check 16: local mode (D-01)', () => {
  test('4. a local project reports none of W057-W061, equals a run with Check 16 off, and reads no gh/outbox state', () => {
    const root = project({ store: false });
    const spy = [];
    health.collectStoreHealth = (...args) => { spy.push(args); return realCollect(...args); };

    const withCheck = runHealth(root);

    assert.deepEqual(storeIssues(withCheck), []);
    assert.equal(ghCalls.length, 0);
    assert.equal(fs.existsSync(env.env.DEVFLOW_OUTBOX_DIR), false, 'local mode reads and writes no outbox state');

    health.collectStoreHealth = () => ({ applicable: false, findings: [] }); // Check 16 disabled
    const without = runHealth(root);
    assert.deepEqual(withCheck, without, 'the report is identical with Check 16 switched off');
    assert.ok(spy.length >= 1, 'the collector was consulted, and answered not-applicable');
  });
});
