'use strict';

/**
 * gh-gate.test.cjs — TRD 50-02 (GEN-01): the commit gate decision.
 *
 *   1-9   evaluateGate   a pure function over branch names and the mapping's `prs` pairs
 *   10    readGateInputs  the offline reader, from a `git worktree add` checkout (added by Task 2)
 *
 * no_llm_test_data: plain inputs for the pure half; temp git repos only for the reader. No gh, no network.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { evaluateGate } = require('./gh-gate.cjs');

const LINKED = '50-github-enforcement';
// `listPrs` output: [objectiveId, entry] pairs.
const prsWith = (entry = {}) => [['50', { branch: LINKED, ...entry }]];

/** evaluateGate with sensible defaults: on a feature branch, `main` is the default, nothing linked, no escape. */
function gate(overrides = {}) {
  return evaluateGate({
    branch: 'feat/x',
    mainBranch: 'feat/x',
    defaultBranch: 'main',
    prs: [],
    env: {},
    ...overrides,
  });
}

describe('50-02 evaluateGate (tests 1-9)', () => {
  test('1. the default branch is refused, and the message says how to get a linked branch', () => {
    const r = gate({ branch: 'main', mainBranch: 'main' });
    assert.equal(r.allow, false);
    assert.equal(r.reason, 'default_branch');
    assert.match(r.message, /gh pr start <objective>/);
    assert.match(r.message, /DEVFLOW_SKIP_GH_GATE=1/);
  });

  test('1b. the default branch is refused even when a PR entry names it', () => {
    const r = gate({ branch: 'main', mainBranch: 'main', prs: [['50', { branch: 'main' }]] });
    assert.equal(r.allow, false);
    assert.equal(r.reason, 'default_branch');
  });

  test('2. a branch no PR entry names is unlinked', () => {
    const r = gate({ branch: 'feat/x', prs: [] });
    assert.equal(r.allow, false);
    assert.equal(r.reason, 'unlinked_branch');
    assert.match(r.message, /feat\/x/);
    assert.match(r.message, /gh pr start <objective>/);
  });

  test('2b. a PR entry for a different branch does not link this one', () => {
    const r = gate({ branch: 'feat/x', prs: prsWith() });
    assert.equal(r.reason, 'unlinked_branch');
  });

  test('3. a branch named by an unmerged PR entry is allowed and returns its objective id', () => {
    const r = gate({ branch: LINKED, mainBranch: LINKED, prs: prsWith() });
    assert.deepEqual(r, { allow: true, objective: '50' });
  });

  test('3b. the objective id is canonical whatever the key spelling', () => {
    const r = gate({ branch: LINKED, mainBranch: LINKED, prs: [['050', { branch: LINKED }]] });
    assert.equal(r.objective, '50');
  });

  test('3c. a decimal objective keeps its decimal part', () => {
    const r = gate({ branch: 'df/ws-2.1', mainBranch: 'df/ws-2.1', prs: [['2.1', { branch: 'df/ws-2.1' }]] });
    assert.deepEqual(r, { allow: true, objective: '2.1' });
  });

  test('3d. a merged entry and a live entry on the same branch: the live one wins', () => {
    const prs = [['49', { branch: LINKED, merged_at: '2026-09-01T00:00:00Z' }], ['50', { branch: LINKED }]];
    const r = gate({ branch: LINKED, mainBranch: LINKED, prs });
    assert.deepEqual(r, { allow: true, objective: '50' });
  });

  test('4. a PR entry with merged_at is not a link, and the message says the PR is merged', () => {
    const r = gate({ branch: LINKED, mainBranch: LINKED, prs: prsWith({ merged_at: '2026-09-30T12:00:00Z' }) });
    assert.equal(r.allow, false);
    assert.equal(r.reason, 'unlinked_branch');
    assert.match(r.message, /merged/);
  });

  test('5. an executor branch inherits the objective of a linked main-checkout branch', () => {
    const r = gate({ branch: 'df/exec-50-03', mainBranch: LINKED, prs: prsWith() });
    assert.deepEqual(r, { allow: true, objective: '50' });
  });

  test('5b. an executor branch is refused when the main checkout is on the default branch, naming it', () => {
    const r = gate({ branch: 'df/exec-50-03', mainBranch: 'main', prs: prsWith() });
    assert.equal(r.allow, false);
    assert.equal(r.reason, 'unlinked_branch');
    assert.match(r.message, /main checkout/);
    assert.match(r.message, /main/);
  });

  test('5c. an executor branch is refused when the main checkout branch is unknown', () => {
    const r = gate({ branch: 'df/exec-50-03', mainBranch: null, prs: prsWith() });
    assert.equal(r.reason, 'unlinked_branch');
  });

  test('5d. an executor branch is refused when the main checkout branch is linked but merged', () => {
    const r = gate({ branch: 'df/exec-50-03', mainBranch: LINKED, prs: prsWith({ merged_at: '2026-09-30T12:00:00Z' }) });
    assert.equal(r.reason, 'unlinked_branch');
  });

  test('5e. a workstream branch gets no special case', () => {
    const r = gate({ branch: 'df/ws-50', mainBranch: LINKED, prs: prsWith() });
    assert.equal(r.reason, 'unlinked_branch');
  });

  test('6. a detached HEAD is refused', () => {
    for (const branch of [null, undefined, '']) {
      const r = gate({ branch });
      assert.equal(r.allow, false);
      assert.equal(r.reason, 'detached_head');
    }
  });

  test('7. the escape turns a refusal into an allow that carries the refusal it overrode', () => {
    const r = gate({ branch: 'main', mainBranch: 'main', env: { DEVFLOW_SKIP_GH_GATE: '1' } });
    assert.equal(r.allow, true);
    assert.equal(r.escaped, true);
    assert.equal(r.reason, 'default_branch');
  });

  test('7b. the escape covers every refusal reason', () => {
    const env = { DEVFLOW_SKIP_GH_GATE: '1' };
    assert.equal(gate({ env }).reason, 'unlinked_branch');
    assert.equal(gate({ branch: null, env }).reason, 'detached_head');
    for (const r of [gate({ env }), gate({ branch: null, env })]) {
      assert.equal(r.allow, true);
      assert.equal(r.escaped, true);
    }
  });

  test('7c. the escape on an allowed commit does not mark it escaped', () => {
    const r = gate({ branch: LINKED, mainBranch: LINKED, prs: prsWith(), env: { DEVFLOW_SKIP_GH_GATE: '1' } });
    assert.deepEqual(r, { allow: true, objective: '50' });
    assert.equal('escaped' in r, false);
  });

  test('8. only the string "1" is the escape', () => {
    for (const value of ['true', 'yes', '0', '', ' 1', 1, true]) {
      const r = gate({ branch: 'main', mainBranch: 'main', env: { DEVFLOW_SKIP_GH_GATE: value } });
      assert.equal(r.allow, false, `DEVFLOW_SKIP_GH_GATE=${JSON.stringify(value)} must not escape`);
      assert.equal(r.reason, 'default_branch');
    }
  });

  test('9. an unknown default branch leaves only the linked test', () => {
    const linked = gate({ branch: LINKED, mainBranch: LINKED, defaultBranch: null, prs: prsWith() });
    assert.deepEqual(linked, { allow: true, objective: '50' });
    const unlinked = gate({ branch: 'main', mainBranch: 'main', defaultBranch: null });
    assert.equal(unlinked.allow, false);
    assert.equal(unlinked.reason, 'unlinked_branch');
  });

  test('9b. missing env and prs are tolerated: the gate refuses rather than throws', () => {
    const r = evaluateGate({ branch: 'feat/x', mainBranch: 'feat/x', defaultBranch: 'main' });
    assert.equal(r.allow, false);
    assert.equal(r.reason, 'unlinked_branch');
  });

  test('9c. junk entries in prs are skipped', () => {
    const prs = [['50', null], ['51', 'nope'], ['52', { nobranch: true }], ['50', { branch: LINKED }]];
    const r = gate({ branch: LINKED, mainBranch: LINKED, prs });
    assert.deepEqual(r, { allow: true, objective: '50' });
  });

  test('9d. every refusal carries a non-empty message', () => {
    for (const r of [gate({ branch: 'main', mainBranch: 'main' }), gate(), gate({ branch: null })]) {
      assert.equal(typeof r.message, 'string');
      assert.ok(r.message.length > 0);
    }
  });
});
