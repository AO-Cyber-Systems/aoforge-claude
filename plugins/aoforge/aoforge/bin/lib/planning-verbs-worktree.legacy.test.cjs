'use strict';

/**
 * planning-verbs-worktree.legacy.test.cjs — quick 36's worktree cases that build the pre-rename layout, on objective
 * 78's single-name compat (objective 79, TRD 79-04).
 *
 * Quick 36 proved its resolver (planning-mode.resolveVerbRoot) with a worktree whose branch moved `.aoforge/` back to
 * the pre-rename directory. Objective 78 removed the legacy fallback from compat and made the CLI refuse a legacy-only
 * tree before dispatch (legacy-layout-guard.cjs, TRD 78-07, SC-4): every mutating command and `init` exit 1 with
 * planning-layout.legacyLayoutMessage(root). The guard walks up from the cwd and stops at the first directory holding
 * `.aoforge/`, so the two layouts part ways:
 *
 *   32  the worktree's branch moved `.aoforge/` to the pre-rename directory: `quick put` exits 1 with
 *       legacyLayoutMessage(<wt>); the worktree's legacy directory and main's `.aoforge/` are byte-identical
 *       before and after, and the worktree gains no `.aoforge/` (no second planning tree)
 *   33  the same worktree: `planning draft PROJECT.md` and `doc put PROJECT.md` refuse the same way, and no draft file
 *       appears under the test TMPDIR
 *   30  reverse layout: main tracks the pre-rename directory, the worktree moved it to `.aoforge/`; the walk stops at the
 *       worktree, so `quick put` runs and writes the worktree; main's directory is byte-identical and main gains no
 *       `.aoforge/`
 *
 * The pre-rename directory is named only through LEGACY.planningDir (legacy-names.cjs), per objective 78's convention.
 *
 * no_llm_test_data: see __fixtures__/worktree-verb-fixtures.cjs (disposable repos, fake HOME, per-test TMPDIR).
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  HAS_GIT, NEW, JOB_REL, JOB_TEXT, WT_PROJECT, MAIN_PROJECT, exists, read, snapshot, createWorktreeFixtures,
} = require('./__fixtures__/worktree-verb-fixtures.cjs');
const { LEGACY } = require('./legacy-names.cjs');
const { legacyLayoutMessage } = require('./planning-layout.cjs');

const OLD = LEGACY.planningDir;

const wf = createWorktreeFixtures();
afterEach(() => wf.cleanup());

/** Main tracks `.aoforge/`; the worktree branch moves it to the pre-rename directory and commits the move. */
function legacyWorktree(opts = {}) {
  const p = wf.project(opts);
  const wt = wf.addWorktree(p, { from: NEW, renameTo: OLD });
  assert.equal(exists(wt, NEW), false, 'fixture: the worktree has no .aoforge/');
  assert.equal(exists(wt, OLD), true, 'fixture: the worktree has the pre-rename planning dir');
  return { p, wt };
}

/** Every byte the refusal must leave alone: the worktree's legacy dir, main's `.aoforge/`, and the test TMPDIR. */
function trees(p, wt) {
  return {
    wtLegacy: snapshot(path.join(wt, OLD)),
    wtNew: snapshot(path.join(wt, NEW)),
    mainNew: snapshot(path.join(p.main, NEW)),
    mainLegacy: snapshot(path.join(p.main, OLD)),
    tmp: snapshot(p.tmp),
  };
}

function assertRefused(r, wt, label) {
  assert.equal(r.status, 1, `${label}: exit 1 (got ${r.status}); stdout=${r.out} stderr=${r.err}`);
  assert.ok(r.err.includes(legacyLayoutMessage(wt)), `${label}: stderr carries the legacy-layout message: ${r.err}`);
}

describe('planning verbs in a pre-rename worktree are refused (objective 78 SC-4 meets quick 36)',
  { skip: !HAS_GIT && 'git not available' }, () => {
    test('32. quick put exits 1 with the legacy-layout message; nothing is written in the worktree or main', () => {
      const { p, wt } = legacyWorktree();
      const before = trees(p, wt);
      const r = wf.aof(p, wt, ['quick', 'put', '34', 'demo', '--from', '-'], JOB_TEXT);
      assertRefused(r, wt, 'quick put');
      assert.deepEqual(trees(p, wt), before, 'every tree is byte-identical after the refusal');
      assert.equal(exists(wt, NEW), false, 'the worktree gained no .aoforge/');
      assert.equal(exists(wt, `${OLD}/quick`), false, 'the worktree legacy dir gained no quick/');
      assert.equal(exists(p.main, `${NEW}/quick`), false, 'main gained no quick/');

      const raw = wf.aof(p, wt, ['quick', 'put', '34', 'demo', '--from', '-', '--raw'], JOB_TEXT);
      assertRefused(raw, wt, 'quick put --raw');
      assert.deepEqual(trees(p, wt), before, 'every tree is still byte-identical');
    });

    test('33. planning draft and doc put refuse the same way; no draft file is created', () => {
      const { p, wt } = legacyWorktree();
      const before = trees(p, wt);

      const draft = wf.aof(p, wt, ['planning', 'draft', 'PROJECT.md']);
      assertRefused(draft, wt, 'planning draft');
      assert.equal(draft.out, '', 'planning draft printed no draft path');
      assert.deepEqual(trees(p, wt).tmp, before.tmp, 'no draft file under the test TMPDIR');

      const put = wf.aof(p, wt, ['doc', 'put', 'PROJECT.md', '--from', '-', '--raw'], WT_PROJECT);
      assertRefused(put, wt, 'doc put');
      assert.deepEqual(trees(p, wt), before, 'every tree is byte-identical after both refusals');
      assert.equal(read(wt, `${OLD}/PROJECT.md`), MAIN_PROJECT, "the worktree's PROJECT.md is unchanged");
      assert.equal(read(p.main, `${NEW}/PROJECT.md`), MAIN_PROJECT, "main's PROJECT.md is unchanged");
      assert.equal(exists(wt, NEW), false, 'the worktree gained no .aoforge/');
    });

    test('30. reverse layout: main on the pre-rename dir, the worktree on .aoforge/; quick put writes the worktree', () => {
      const p = wf.project({ planningDir: OLD });
      const wt = wf.addWorktree(p, { from: OLD, renameTo: NEW });
      const mainBefore = snapshot(path.join(p.main, OLD));
      const r = wf.aof(p, wt, ['quick', 'put', '34', 'demo', '--from', '-'], JOB_TEXT);
      assert.equal(r.status, 0, r.err || r.out);
      assert.equal(read(wt, `${NEW}/${JOB_REL}`), JOB_TEXT, 'the JOB lands in the worktree');
      assert.ok(r.out.includes(`wrote ${NEW}/${JOB_REL}`), r.out);
      assert.deepEqual(snapshot(path.join(p.main, OLD)), mainBefore, "main's pre-rename dir is byte-identical");
      assert.equal(exists(p.main, NEW), false, 'main gained no .aoforge/');
      assert.equal(exists(wt, OLD), false, 'the worktree gained no pre-rename dir');
    });
  });
