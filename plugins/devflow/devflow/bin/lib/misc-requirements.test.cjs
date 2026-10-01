'use strict';

/**
 * `df-tools requirements mark-complete` (misc.cjs cmdRequirementsMarkComplete), TRD 48-14.
 *
 * Local mode (github.store off; github.enabled on here, which must not matter) is pinned byte for byte first. In
 * store mode REQUIREMENTS.md is a GitHub-backed cache file (a wiki page), so the edit is published with `doc put`.
 * Every spawned df-tools runs against the store-cli fixture: a `gh` shim that answers like an unreachable GitHub,
 * temp HOME / outbox / gh cache, and a wiki remote that does not exist. Nothing reaches GitHub or the real ~/.claude.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { storeCliProject } = require('./__fixtures__/store-cli-fixtures.cjs');
const { STORE_FIXTURE } = require('./__fixtures__/gh-store-fixtures.cjs');

function withProject(opts, fn) {
  const p = storeCliProject(opts);
  try {
    return fn(p);
  } finally {
    p.cleanup();
  }
}

const STO01_DONE = STORE_FIXTURE.requirements.replace('- [ ] **STO-01**', '- [x] **STO-01**');

describe('48-14 characterization: requirements mark-complete in local mode', () => {
  test('10: mark-complete STO-01 ticks the checkbox, exact bytes and output', () => {
    withProject({ store: false }, (p) => {
      const r = p.run(['requirements', 'mark-complete', 'STO-01']);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, JSON.stringify({ updated: true, marked_complete: ['STO-01'], not_found: [], total: 1 }, null, 2));
      assert.equal(p.read('REQUIREMENTS.md'), STO01_DONE);
      assert.notEqual(STO01_DONE, STORE_FIXTURE.requirements, 'fixture sanity: the replace changed the text');
      assert.deepEqual(p.ghCalls(), []);
      assert.deepEqual(p.journalOps(), []);
      assert.deepEqual(p.ledgerEntries(), {});
    });
  });

  test('10b: an unknown id writes nothing', () => {
    withProject({ store: false }, (p) => {
      const r = p.run(['requirements', 'mark-complete', 'NOPE-09']);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, JSON.stringify({ updated: false, marked_complete: [], not_found: ['NOPE-09'], total: 1 }, null, 2));
      assert.equal(p.read('REQUIREMENTS.md'), STORE_FIXTURE.requirements);
    });
  });
});

describe('48-14 store mode: requirements mark-complete publishes with doc put', () => {
  test('11: REQUIREMENTS.md updated in the cache, ledgered as doc put, wiki-push queued (exit 3 pending)', () => {
    withProject({ store: true }, (p) => {
      const r = p.run(['requirements', 'mark-complete', 'STO-01']);
      assert.equal(r.status, 3, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.updated, true);
      assert.deepEqual(out.marked_complete, ['STO-01']);
      assert.deepEqual(out.not_found, []);
      assert.equal(out.total, 1);
      assert.equal(out.verb.rel, 'REQUIREMENTS.md');
      assert.equal(out.verb.mode, 'store');
      assert.equal(out.verb.flush, 'pending');

      assert.equal(p.read('REQUIREMENTS.md'), STO01_DONE);
      const entry = p.ledgerEntries()['REQUIREMENTS.md'];
      assert.ok(entry, 'REQUIREMENTS.md is in the verb-write ledger');
      assert.equal(entry.verb, 'doc put');
      const wiki = p.journalOps().find((op) => op.kind === 'wiki-push');
      assert.ok(wiki, 'a wiki-push op is queued');
      assert.ok(wiki.payload.pages.includes('REQUIREMENTS.md'));
      assert.equal(wiki.payload.message, 'requirements: mark STO-01 complete');
    });
  });

  test('11b: nothing found -> nothing written, nothing queued, exit 0', () => {
    withProject({ store: true }, (p) => {
      const r = p.run(['requirements', 'mark-complete', 'NOPE-09']);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(JSON.parse(r.stdout).updated, false);
      assert.equal(p.read('REQUIREMENTS.md'), STORE_FIXTURE.requirements);
      assert.deepEqual(p.journalOps(), []);
      assert.deepEqual(p.ghCalls(), []);
    });
  });
});
