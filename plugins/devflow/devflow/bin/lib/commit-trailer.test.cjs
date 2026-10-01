'use strict';

/**
 * commit-trailer.test.cjs — TRD 49-07 tests 1-3 (GPR-02): the `Refs #N` trailer on DevFlow commits.
 *
 *   1  parseScope     the conventional-commit scope of a subject line, or null
 *   2  refsFor        scope -> mapping entry -> issue number, read from the MAIN checkout's mapping, store mode only
 *   3  applyRefs      append `\n\nRefs #N` once; idempotent; an existing `Refs #N` paragraph wins
 *
 * no_llm_test_data: every project is a disposable directory under the OS temp dir. No git, no gh, no network.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseScope, refsFor, applyRefs } = require('./commit-trailer.cjs');
const gm = require('./gh-mapping.cjs');

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** A temp project: store-mode config (unless `store` is false) and a v3 mapping (unless `mapping` is false). */
function project({ store = true, mapping = true } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-trailer-')));
  cleanup.push(root);
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.planning', 'config.json'),
    `${JSON.stringify({ github: { enabled: true, store } })}\n`,
    'utf-8',
  );
  if (mapping) {
    const m = gm.emptyMapping();
    gm.setEntry(m, '49', { issue_id: 490 });
    gm.setEntry(m, '7.1', { issue_id: 71 });
    gm.setTrd(m, '49-02', { issue_number: 102, rest_id: 9102 });
    gm.setTrd(m, '49-02-d1', { issue_number: 103, rest_id: 9103 });
    const w = gm.writeMappingV3(root, m);
    assert.equal(w.ok, true, w.error);
  }
  return root;
}

describe('49-07 parseScope (test 1)', () => {
  test('1a. a TRD scope', () => {
    assert.equal(parseScope('feat(49-02): add x'), '49-02');
  });

  test('1b. an objective scope', () => {
    assert.equal(parseScope('docs(49): wave 1'), '49');
  });

  test('1c. no scope is null', () => {
    assert.equal(parseScope('fix: y'), null);
  });

  test('1d. a breaking-change bang after the scope', () => {
    assert.equal(parseScope('feat(49-02)!: z'), '49-02');
  });

  test('1e. only the subject line counts, never a scope-looking line in the body', () => {
    assert.equal(parseScope('fix: y\n\nfeat(49-02): in the body'), null);
    assert.equal(parseScope('docs(49): wave 1\n\nfix(99): body'), '49');
  });

  test('1f. things that are not conventional subjects are null', () => {
    assert.equal(parseScope('Merge branch df/exec-49-07 into x'), null);
    assert.equal(parseScope('feat(): empty scope'), null);
    assert.equal(parseScope('Feat(49-02): uppercase type'), null);
    assert.equal(parseScope(''), null);
    assert.equal(parseScope(undefined), null);
    assert.equal(parseScope(null), null);
  });

  test('1g. a decimal objective and a decision scope are returned verbatim', () => {
    assert.equal(parseScope('docs(07.1): x'), '07.1');
    assert.equal(parseScope('docs(49-02-d1): x'), '49-02-d1');
  });
});

describe('49-07 refsFor (test 2)', () => {
  test('2a. a TRD scope resolves to the TRD issue', () => {
    const root = project();
    assert.deepEqual(refsFor(root, 'feat(49-02): x'), { issue: 102, id: '49-02' });
  });

  test('2b. an objective scope resolves to the objective issue', () => {
    const root = project();
    assert.deepEqual(refsFor(root, 'docs(49): wave 1'), { issue: 490, id: '49' });
  });

  test('2c. a decimal objective scope resolves to the objective issue', () => {
    const root = project();
    assert.deepEqual(refsFor(root, 'docs(07.1): x'), { issue: 71, id: '7.1' });
  });

  test('2d. a Decision scope resolves like a TRD', () => {
    const root = project();
    assert.deepEqual(refsFor(root, 'docs(49-02-d1): x'), { issue: 103, id: '49-02-d1' });
  });

  test('2e. padded ids resolve to the same entry', () => {
    const root = project();
    assert.equal(refsFor(root, 'feat(049-02): x').issue, 102);
    assert.equal(refsFor(root, 'docs(049): x').issue, 490);
  });

  test('2f. an id the mapping does not know has no issue, with a reason', () => {
    const root = project();
    const r = refsFor(root, 'feat(49-99): x');
    assert.equal(r.issue, null);
    assert.equal(r.reason, 'no mapping entry');
    assert.equal(refsFor(root, 'docs(50): x').issue, null);
  });

  test('2g. no scope has no issue, with a reason', () => {
    const root = project();
    const r = refsFor(root, 'fix: y');
    assert.equal(r.issue, null);
    assert.equal(r.reason, 'no scope');
  });

  test('2h. a scope that is not an id has no issue, with a reason', () => {
    const root = project();
    for (const msg of ['feat(auth): x', 'feat(49-demo): x', 'feat(49-02-store-demo): x']) {
      const r = refsFor(root, msg);
      assert.equal(r.issue, null, msg);
      assert.equal(r.reason, 'unrecognised scope', msg);
    }
  });

  test('2i. a project with no mapping file has no issue, and is not an error', () => {
    const root = project({ mapping: false });
    const r = refsFor(root, 'feat(49-02): x');
    assert.equal(r.issue, null);
    assert.equal(r.reason, 'no mapping entry');
  });

  test('2j. local mode never reads the mapping: even a matching entry gives no issue', () => {
    const root = project({ store: false });
    const r = refsFor(root, 'feat(49-02): x');
    assert.equal(r.issue, null);
    assert.equal(r.reason, 'not store mode');
  });

  test('2k. a mapping written by a newer DevFlow is reported, not guessed at', () => {
    const root = project({ mapping: false });
    fs.writeFileSync(path.join(root, '.planning', '.gh-mapping.json'), '{"version": 99}\n', 'utf-8');
    const r = refsFor(root, 'feat(49-02): x');
    assert.equal(r.issue, null);
    assert.equal(r.reason, 'mapping unreadable');
  });
});

describe('49-07 applyRefs (test 3)', () => {
  test('3a. appends a final Refs paragraph after the body', () => {
    const out = applyRefs('feat(49-02): x\n\nbody', 102);
    assert.ok(out.endsWith('\n\nRefs #102'), out);
    assert.equal(out, 'feat(49-02): x\n\nbody\n\nRefs #102');
  });

  test('3b. a subject-only message gets a blank line then the trailer', () => {
    assert.equal(applyRefs('feat(49-02): x', 102), 'feat(49-02): x\n\nRefs #102');
  });

  test('3c. applying twice yields the same string', () => {
    const once = applyRefs('feat(49-02): x\n\nbody', 102);
    assert.equal(applyRefs(once, 102), once);
  });

  test('3d. a message that already has a Refs paragraph is unchanged, even for another issue', () => {
    const m = 'feat(49-02): x\n\nRefs #102';
    assert.equal(applyRefs(m, 102), m);
    assert.equal(applyRefs(m, 999), m);
  });

  test('3e. trailing newlines are normalised away, not doubled', () => {
    assert.equal(applyRefs('feat(49-02): x\n', 102), 'feat(49-02): x\n\nRefs #102');
    assert.equal(applyRefs('feat(49-02): x\n\n\n', 102), 'feat(49-02): x\n\nRefs #102');
  });

  test('3f. no issue leaves the message byte-identical', () => {
    for (const issue of [null, undefined, 0, -3, 1.5, 'x']) {
      assert.equal(applyRefs('feat(49-02): x\n', issue), 'feat(49-02): x\n');
    }
  });

  test('3g. a Refs-looking phrase inside a sentence is not an existing trailer', () => {
    const out = applyRefs('feat(49-02): x\n\nsee Refs #5 in the doc', 102);
    assert.ok(out.endsWith('\n\nRefs #102'), out);
  });
});
