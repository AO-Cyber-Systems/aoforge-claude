'use strict';

/**
 * gh-gate.test.cjs — TRD 50-02 (GEN-01): the commit gate decision.
 *
 *   1-9   evaluateGate   a pure function over branch names and the mapping's `prs` pairs
 *   10    readGateInputs  the offline reader, from a `git worktree add` checkout (added by Task 2)
 *   52-02 every refusal shape names both remedies: `gh pr start <objective>` and the logged, inline escape
 *
 * no_llm_test_data: plain inputs for the pure half; temp git repos only for the reader. No gh, no network.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { evaluateGate, readGateInputs } = require('./gh-gate.cjs');
const gm = require('./gh-mapping.cjs');
const ob = require('./objective-branch.cjs');
const { makeGitRemote, gitAvailable } = require('./__fixtures__/git-remote.cjs');

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
    assert.match(r.message, /AOFORGE_SKIP_GH_GATE=1/);
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
    const r = gate({ branch: 'main', mainBranch: 'main', env: { AOFORGE_SKIP_GH_GATE: '1' } });
    assert.equal(r.allow, true);
    assert.equal(r.escaped, true);
    assert.equal(r.reason, 'default_branch');
  });

  test('7b. the escape covers every refusal reason', () => {
    const env = { AOFORGE_SKIP_GH_GATE: '1' };
    assert.equal(gate({ env }).reason, 'unlinked_branch');
    assert.equal(gate({ branch: null, env }).reason, 'detached_head');
    for (const r of [gate({ env }), gate({ branch: null, env })]) {
      assert.equal(r.allow, true);
      assert.equal(r.escaped, true);
    }
  });

  test('7c. the escape on an allowed commit does not mark it escaped', () => {
    const r = gate({ branch: LINKED, mainBranch: LINKED, prs: prsWith(), env: { AOFORGE_SKIP_GH_GATE: '1' } });
    assert.deepEqual(r, { allow: true, objective: '50' });
    assert.equal('escaped' in r, false);
  });

  test('8. only the string "1" is the escape', () => {
    for (const value of ['true', 'yes', '0', '', ' 1', 1, true]) {
      const r = gate({ branch: 'main', mainBranch: 'main', env: { AOFORGE_SKIP_GH_GATE: value } });
      assert.equal(r.allow, false, `AOFORGE_SKIP_GH_GATE=${JSON.stringify(value)} must not escape`);
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

describe('52-02 every refusal names both remedies', () => {
  // The five refusal shapes. Each must tell the user both ways forward: start the objective's linked branch, or escape
  // (logged) with an inline prefix whose reason variable records why.
  const SHAPES = [
    { name: 'the default branch', reason: 'default_branch', input: { branch: 'main', mainBranch: 'main' } },
    { name: 'a never-linked branch', reason: 'unlinked_branch', input: { branch: 'feat/x', mainBranch: 'feat/x' } },
    {
      name: 'a merged objective branch',
      reason: 'unlinked_branch',
      input: {
        branch: '50-enforce',
        mainBranch: '50-enforce',
        prs: [['50', { branch: '50-enforce', merged_at: '2026-09-30T12:00:00Z' }]],
      },
    },
    { name: 'a detached HEAD', reason: 'detached_head', input: { branch: null, mainBranch: null } },
    {
      name: 'an executor branch whose main checkout is unlinked',
      reason: 'unlinked_branch',
      input: { branch: 'df/exec-1', mainBranch: 'main', prs: prsWith() },
    },
  ];

  for (const shape of SHAPES) {
    test(`${shape.name} (${shape.reason}) names gh pr start, the escape and its reason variable`, () => {
      const r = gate(shape.input);
      assert.equal(r.allow, false);
      assert.equal(r.reason, shape.reason);
      assert.match(r.message, /gh pr start <objective>/);
      assert.match(r.message, /AOFORGE_SKIP_GH_GATE=1/);
      assert.match(r.message, /AOFORGE_SKIP_GH_GATE_REASON/);
      assert.match(r.message, /prefix the commit with AOFORGE_SKIP_GH_GATE=1/, 'the escape is shown as an inline prefix');
      assert.doesNotMatch(r.message, /export AOFORGE_SKIP_GH_GATE/);
    });
  }

  test('the refusal result keys are unchanged: allow, reason, message', () => {
    for (const shape of SHAPES) {
      assert.deepEqual(Object.keys(gate(shape.input)).sort(), ['allow', 'message', 'reason'], shape.name);
    }
  });
});

describe('50-02 readGateInputs (test 10)', { skip: !gitAvailable() && 'git not installed' }, () => {
  const remotes = [];

  afterEach(() => {
    ob._resetRunGit();
    while (remotes.length) remotes.pop().cleanup();
  });

  /**
   * A temp main checkout on the linked branch, with a store-mode config and a mapping holding `prs` in `.planning/`
   * (untracked, as in store mode, so a linked worktree of it holds no mapping of its own).
   */
  function project({ mapping = 'valid' } = {}) {
    const g = makeGitRemote();
    remotes.push(g);
    const planning = path.join(g.work, '.planning');
    fs.mkdirSync(planning, { recursive: true });
    fs.writeFileSync(path.join(planning, 'config.json'), `${JSON.stringify({ github: { enabled: true, store: true } })}\n`, 'utf-8');
    if (mapping === 'valid') {
      const m = gm.emptyMapping();
      gm.setPr(m, '50', { branch: LINKED });
      const w = gm.writeMappingV3(g.work, m);
      assert.equal(w.ok, true, w.error);
    } else if (mapping === 'unparseable') {
      fs.writeFileSync(path.join(planning, '.gh-mapping.json'), '{ not json', 'utf-8');
    } else if (mapping === 'too-new') {
      fs.writeFileSync(path.join(planning, '.gh-mapping.json'), `${JSON.stringify({ version: 99 })}\n`, 'utf-8');
    }
    g.git(g.work, ['switch', '-q', '-c', LINKED]);
    return g;
  }

  test('10. from a git worktree: the mapping comes from the main checkout and both branches are reported', () => {
    const g = project();
    const wt = path.join(g.root, 'wt-50-03');
    g.git(g.work, ['worktree', 'add', '-q', '-b', 'df/exec-50-03', wt]);
    assert.equal(fs.existsSync(path.join(wt, '.planning')), false, 'control: the worktree holds no .planning/ of its own');

    const inputs = readGateInputs(wt);
    assert.equal(inputs.branch, 'df/exec-50-03');
    assert.equal(inputs.mainBranch, LINKED);
    assert.equal(inputs.defaultBranch, 'main');
    assert.deepEqual(inputs.prs, [['50', { branch: LINKED }]]);

    assert.deepEqual(evaluateGate({ ...inputs, env: {} }), { allow: true, objective: '50' }, 'the pieces compose into the gate');
  });

  test('10b. from the main checkout itself: branch and mainBranch are the same', () => {
    const g = project();
    const inputs = readGateInputs(g.work);
    assert.equal(inputs.branch, LINKED);
    assert.equal(inputs.mainBranch, LINKED);
    assert.equal(inputs.defaultBranch, 'main');
    assert.equal(inputs.prs.length, 1);
  });

  test('10c. a detached HEAD in the worktree reads as branch null; the main checkout branch is still reported', () => {
    const g = project();
    const wt = path.join(g.root, 'wt-detached');
    g.git(g.work, ['worktree', 'add', '-q', '--detach', wt]);
    const inputs = readGateInputs(wt);
    assert.equal(inputs.branch, null);
    assert.equal(inputs.mainBranch, LINKED);
    assert.equal(evaluateGate({ ...inputs, env: {} }).reason, 'detached_head');
  });

  test('10d. no mapping file reads as no PRs, so the gate refuses rather than crashes', () => {
    const g = project({ mapping: 'none' });
    const inputs = readGateInputs(g.work);
    assert.deepEqual(inputs.prs, []);
    assert.equal(evaluateGate({ ...inputs, env: {} }).reason, 'unlinked_branch');
  });

  test('10e. an unparseable or too-new mapping reads as no PRs', () => {
    for (const mapping of ['unparseable', 'too-new']) {
      const g = project({ mapping });
      assert.deepEqual(readGateInputs(g.work).prs, [], mapping);
    }
  });

  test('10f. a default branch the checkout cannot name is null, not an error', () => {
    const g = project();
    g.git(g.work, ['remote', 'remove', 'origin']);
    g.git(g.work, ['branch', '-m', 'main', 'trunk']);
    assert.equal(readGateInputs(g.work).defaultBranch, null);
  });

  test('10g. a directory that is not a repository reads as branch null and never throws', () => {
    const g = project();
    const outside = path.join(g.root, 'not-a-repo');
    fs.mkdirSync(outside);
    const inputs = readGateInputs(outside);
    assert.equal(inputs.branch, null);
    assert.deepEqual(inputs.prs, []);
  });

  test('10h. it makes no gh call and writes nothing: git is only ever asked to read', () => {
    const g = project();
    const argvs = [];
    ob._setRunGit((args, opts) => {
      argvs.push(args);
      return { ok: true, status: 0, stdout: args[0] === 'branch' ? `${LINKED}\n` : '', stderr: '' };
    });
    readGateInputs(g.work);
    const writes = argvs.filter((a) => !['branch', 'symbolic-ref', 'rev-parse'].includes(a[0]));
    assert.deepEqual(writes, [], 'only read-only git subcommands');
    assert.equal(argvs.some((a) => a[0] === 'fetch'), false);
  });
});
