'use strict';

/**
 * Tests for lib/gh-health.cjs — the offline store-mode health collector (TRD 50-04, GEN-03).
 *
 * Hermetic: every test installs a gh seam that throws on any call (the collector must never reach GitHub), points the
 * outbox and gh cache at temp dirs through hermeticEnv(), and builds its project with makeStoreProject(). Nothing here
 * touches the real ~/.claude, the network or git.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const health = require('./gh-health.cjs');
const client = require('./gh-client.cjs');
const ghMapping = require('./gh-mapping.cjs');
const outbox = require('./gh-outbox.cjs');
const { makeStoreProject, hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');

let env = null;
let proj = null;
let ghCalls = [];

beforeEach(() => {
  env = hermeticEnv();
  ghCalls = [];
  client._setRunGh((...args) => {
    ghCalls.push(args);
    throw new Error('gh must never be called by the health collector');
  });
});

afterEach(() => {
  client._setRunGh(null);
  if (proj) proj.cleanup();
  proj = null;
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

function saveMapping(root, mapping) {
  const r = ghMapping.writeMappingV3(root, mapping);
  assert.equal(r.ok, true, r.error);
}

function storeProject(mapping = consistentMapping()) {
  proj = makeStoreProject({ store: true });
  if (mapping) saveMapping(proj.root, mapping);
  return proj.root;
}

const queueTwo = (root) => {
  const r = outbox.enqueue(root, [
    { kind: 'patch-issue', target: { id: '7-01' }, payload: { state: 'closed' } },
    { kind: 'patch-issue', target: { id: '7-02' }, payload: { state: 'closed' } },
  ]);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.enqueued.length, 2);
};

const byCode = (result, code) => result.findings.filter((f) => f.code === code);

// ─── 1. local mode ───────────────────────────────────────────────────────────

describe('local mode (store off)', () => {
  test('1. returns {applicable:false, findings:[]} without reading the outbox, the mapping or gh', (t) => {
    proj = makeStoreProject({ store: false });
    saveMapping(proj.root, consistentMapping());

    const boom = (name) => () => { throw new Error(`${name} was read in local mode`); };
    const status = t.mock.method(outbox, 'status', boom('outbox.status'));
    const readBase = t.mock.method(outbox, 'readBase', boom('outbox.readBase'));
    const readMapping = t.mock.method(ghMapping, 'readMappingV3WithReport', boom('the mapping'));
    const index = t.mock.method(ghMapping, 'listObjectiveIndex', boom('the objective index'));

    const result = health.collectStoreHealth(proj.root);

    assert.deepEqual(result, { applicable: false, findings: [] });
    assert.equal(ghCalls.length, 0, 'gh seam must never be hit');
    assert.equal(status.mock.callCount(), 0);
    assert.equal(readBase.mock.callCount(), 0);
    assert.equal(readMapping.mock.callCount(), 0);
    assert.equal(index.mock.callCount(), 0);
    assert.equal(fs.existsSync(env.env.DEVFLOW_OUTBOX_DIR), false, 'the outbox dir must not be created or touched');
  });

  test('1b. github.enabled without github.store is still local', () => {
    proj = makeStoreProject({ store: false, enabled: true });
    assert.deepEqual(health.collectStoreHealth(proj.root), { applicable: false, findings: [] });
  });

  test('1c. a directory with no .planning/ at all is not applicable', () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-health-bare-'));
    try {
      assert.deepEqual(health.collectStoreHealth(bare), { applicable: false, findings: [] });
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });
});

// ─── 2. store mode, nothing wrong ────────────────────────────────────────────

describe('store mode, consistent', () => {
  test('2. empty outbox and a mapping that matches the files: applicable, no findings', () => {
    const root = storeProject();
    assert.deepEqual(health.collectStoreHealth(root), { applicable: true, findings: [] });
    assert.equal(ghCalls.length, 0);
  });

  test('2b. exposes the five codes', () => {
    assert.deepEqual({ ...health.CODES }, {
      UNSYNCED: 'W057', LINKS: 'W058', ORPHANS: 'W059', FROZEN_DRIFT: 'W060', FAILED: 'W061',
    });
  });
});

// ─── 3. unsynced writes (W057) ───────────────────────────────────────────────

describe('W057 unsynced writes', () => {
  test('3a. two pending ops are one W057 naming the count, fixed by a flush', () => {
    const root = storeProject();
    queueTwo(root);

    const result = health.collectStoreHealth(root);

    assert.equal(result.applicable, true);
    assert.equal(result.findings.length, 1);
    const [f] = result.findings;
    assert.equal(f.code, 'W057');
    assert.match(f.message, /2 pending/);
    assert.match(f.fix, /df-tools gh outbox flush/);
    assert.equal(ghCalls.length, 0);
  });

  test('3b. a halted journal is a W057 naming the reason and the resolve verb', () => {
    const root = storeProject();
    const r = outbox.setHalted(root, { reason: 'remote-edit', seq: 4, target: { id: '7-01' }, detail: 'TRD 7-01 was edited on GitHub' });
    assert.equal(r.ok, true);

    const result = health.collectStoreHealth(root);

    assert.equal(result.findings.length, 1);
    const [f] = result.findings;
    assert.equal(f.code, 'W057');
    assert.match(f.message, /halted/);
    assert.match(f.message, /remote-edit/);
    assert.match(f.message, /edited on GitHub/);
    assert.match(f.fix, /df-tools gh outbox resolve 4 --accept-remote/);
    assert.match(f.fix, /--overwrite/);
  });

  test('3c. a blocked op counts as unsynced and as a halt', () => {
    const root = storeProject();
    queueTwo(root);
    outbox.markBlocked(root, 1, 'GitHub refused the write (422)');

    const result = health.collectStoreHealth(root);
    const w057 = byCode(result, 'W057');

    assert.equal(w057.length, 2, JSON.stringify(result.findings));
    const counts = w057.find((f) => /pending/.test(f.message));
    assert.match(counts.message, /1 pending/);
    assert.match(counts.message, /1 blocked/);
    const halt = w057.find((f) => /halted/.test(f.message));
    assert.match(halt.message, /blocked/);
    assert.match(halt.message, /GitHub refused the write/);
    assert.match(halt.fix, /df-tools gh outbox resolve 1/);
  });

  test('3d. a .corrupt-* journal is a W057 naming the file', () => {
    const root = storeProject();
    const corrupt = `${outbox.journalPath(root)}.corrupt-1700000000000`;
    fs.mkdirSync(path.dirname(corrupt), { recursive: true });
    fs.writeFileSync(corrupt, 'not a journal');

    const result = health.collectStoreHealth(root);

    assert.equal(result.findings.length, 1);
    const [f] = result.findings;
    assert.equal(f.code, 'W057');
    assert.ok(f.message.includes('.corrupt-1700000000000'), f.message);
    assert.ok(fs.existsSync(corrupt), 'the collector never deletes the corrupt journal');
  });

  test('3e. an unreadable live journal is set aside by the outbox and reported as W057', () => {
    const root = storeProject();
    const journal = outbox.journalPath(root);
    fs.mkdirSync(path.dirname(journal), { recursive: true });
    fs.writeFileSync(journal, '{ this is not json');

    const result = health.collectStoreHealth(root);

    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].code, 'W057');
    assert.match(result.findings[0].message, /\.corrupt-/);
  });
});

// ─── 4. missing links (W058) ─────────────────────────────────────────────────

describe('W058 missing links', () => {
  test('4a. a TRD file with no mapped issue is a W058 naming the TRD', () => {
    const m = consistentMapping();
    delete m.trds['7-02'];
    const root = storeProject(m);

    const result = health.collectStoreHealth(root);

    assert.equal(result.findings.length, 1, JSON.stringify(result.findings));
    const [f] = result.findings;
    assert.equal(f.code, 'W058');
    assert.equal(f.id, '7-02');
    assert.equal(f.objective, '7');
    assert.match(f.message, /7-02/);
    assert.match(f.message, /07-02-beta-TRD\.md/);
    assert.match(f.fix, /df-tools gh sync 7/);
  });

  test('4b. an objective with TRDs and no objective issue is a W058 with no TRD id', () => {
    const m = consistentMapping();
    delete m.objectives['7'];
    const root = storeProject(m);

    const result = health.collectStoreHealth(root);

    assert.equal(result.findings.length, 1, JSON.stringify(result.findings));
    const [f] = result.findings;
    assert.equal(f.code, 'W058');
    assert.equal(f.objective, '7');
    assert.equal(f.id, undefined);
    assert.match(f.message, /objective 7/);
    assert.match(f.message, /3 TRD/);
    assert.match(f.fix, /df-tools gh sync 7/);
  });

  test('4c. a prs entry with no PR number is a W058', () => {
    const m = consistentMapping();
    ghMapping.setPr(m, 7, { branch: 'objective/07-store-demo' });
    const root = storeProject(m);

    const result = health.collectStoreHealth(root);

    assert.equal(result.findings.length, 1, JSON.stringify(result.findings));
    const [f] = result.findings;
    assert.equal(f.code, 'W058');
    assert.equal(f.objective, '7');
    assert.match(f.message, /pull request/);
    assert.match(f.message, /objective\/07-store-demo/);
    assert.match(f.fix, /df-tools gh pr sync 7/);
  });

  test('4d. a prs entry that has a number is clean', () => {
    const m = consistentMapping();
    ghMapping.setPr(m, 7, { branch: 'objective/07-store-demo', number: 31 });
    const root = storeProject(m);
    assert.deepEqual(health.collectStoreHealth(root), { applicable: true, findings: [] });
  });

  test('4e. a store project that was never synced reports its objective and every TRD', () => {
    const root = storeProject(null); // no mapping file at all

    const result = health.collectStoreHealth(root);
    const w058 = byCode(result, 'W058');

    assert.equal(w058.length, 4, JSON.stringify(result.findings)); // the objective + 3 TRDs
    assert.deepEqual(w058.filter((f) => f.id !== undefined).map((f) => f.id), ['7-01', '7-02', '7-03']);
    assert.equal(result.findings.length, 4);
  });

  test('4f. a decision entry in the mapping is not a missing TRD link', () => {
    const m = consistentMapping();
    ghMapping.setTrd(m, '7-01-d1', { issue_number: 770, rest_id: 7770 });
    const root = storeProject(m);
    assert.deepEqual(health.collectStoreHealth(root), { applicable: true, findings: [] });
  });
});

// ─── 7. never throws, always visible (W061) ──────────────────────────────────

describe('W061 the check itself failed', () => {
  test('7a. an unparseable mapping is one W061, no throw; checks that do not need it still run', () => {
    const root = storeProject(null);
    fs.writeFileSync(path.join(root, '.planning', '.gh-mapping.json'), '{ not json');
    queueTwo(root);

    let result;
    assert.doesNotThrow(() => { result = health.collectStoreHealth(root); });

    const w061 = byCode(result, 'W061');
    assert.equal(w061.length, 1, JSON.stringify(result.findings));
    assert.match(w061[0].message, /gh-mapping\.json/);
    assert.equal(byCode(result, 'W057').length, 1, 'the unsynced section does not need the mapping');
    for (const code of ['W058', 'W059', 'W060']) assert.equal(byCode(result, code).length, 0, code);
    assert.equal(result.findings.length, 2);
  });

  test('7b. a mapping from a newer DevFlow is a W061, never a crash', () => {
    const root = storeProject(null);
    fs.writeFileSync(path.join(root, '.planning', '.gh-mapping.json'), JSON.stringify({ version: 99, objectives: {} }));

    const result = health.collectStoreHealth(root);

    assert.equal(byCode(result, 'W061').length, 1, JSON.stringify(result.findings));
    assert.equal(byCode(result, 'W058').length, 0);
  });

  test('7c. a throwing outbox read is one W061 for that section; the other sections still run', (t) => {
    const m = consistentMapping();
    delete m.trds['7-03'];
    const root = storeProject(m);
    t.mock.method(outbox, 'status', () => { throw new Error('journal exploded'); });

    let result;
    assert.doesNotThrow(() => { result = health.collectStoreHealth(root); });

    const w061 = byCode(result, 'W061');
    assert.equal(w061.length, 1, JSON.stringify(result.findings));
    assert.match(w061[0].message, /journal exploded/);
    assert.equal(byCode(result, 'W058').length, 1, 'the links section is independent of the outbox');
  });

  test('7d. a failure outside every section (the mode lookup) is still a finding, not a throw', () => {
    const result = health.collectStoreHealth(undefined);
    assert.equal(typeof result.applicable, 'boolean');
    assert.ok(Array.isArray(result.findings));
  });

  test('7e. gh is never called, in any of the scenarios above', () => {
    const root = storeProject();
    queueTwo(root);
    health.collectStoreHealth(root);
    assert.equal(ghCalls.length, 0);
  });
});
