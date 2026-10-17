'use strict';

/**
 * planning-verbs-worktree.test.cjs — quick 36 (D4): in local mode a planning verb run from a linked worktree that has its
 * own planning directory reads and writes THAT worktree, and its printed `wrote <dir>/<rel>` names the directory it
 * actually wrote.
 *
 * Why: every planning verb resolved the MAIN checkout (planning-mode.resolveMainRoot), which prefers main whenever main
 * has a planning dir. `quick put 34 <slug>` run from a worktree wrote the main checkout's
 * `.aoforge/quick/34-.../34-JOB.md`. Only `summary post|checkpoint` used the checkout holding the caller (TRD 53-01),
 * and even they found the TRD in main. One resolver, planning-mode.resolveVerbRoot, now decides the root for every verb.
 *
 * Objective 79 (TRD 79-04): quick 36 proved this with a cross-layout worktree (main on `.aoforge/`, the worktree branch
 * on the pre-rename directory). On objective 78's single-name compat that worktree is refused by the CLI's
 * legacy-layout guard, by design, so the cases here use the layout 3.1 supports: both checkouts on `.aoforge/`, the
 * worktree diverged by a commit on its own branch. The pre-rename worktree (refused, nothing written) and the reverse
 * layout live in planning-verbs-worktree.legacy.test.cjs.
 *
 *   25  `quick put` from the worktree writes `<wt>/.aoforge/quick/34-demo/34-JOB.md`, main gains no `quick/`, prose
 *       says `wrote .aoforge/quick/...`, and the `--raw` path is under the worktree
 *   26  `quick summary` finds the task dir in the worktree and writes its SUMMARY there
 *   27  `summary checkpoint 08-01` for an objective only the worktree has exits 0 and writes the worktree
 *   28  `doc put PROJECT.md` writes the worktree; main's PROJECT.md is unchanged
 *   29  `planning draft` seeds the draft from the worktree's file, under the MAIN repo key
 *   31  guard: the planning dir is gitignored, so the worktree has none; `quick put` falls back to main
 *   s1  guard: store config in main, the worktree's own config says store false; `summary checkpoint` from the worktree
 *       still writes MAIN's `.trd-progress/` and leaves the worktree's planning dir untouched (D-14)
 *
 * no_llm_test_data: see __fixtures__/worktree-verb-fixtures.cjs (disposable repos, fake HOME, per-test TMPDIR).
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  HAS_GIT, NEW, JOB_REL, JOB_TEXT, QSUM_TEXT, CHECKPOINT_TEXT, MAIN_PROJECT, WT_PROJECT, WT_ONLY_TRD,
  write, exists, read, under, snapshot, createWorktreeFixtures,
} = require('./__fixtures__/worktree-verb-fixtures.cjs');
const { repoKey } = require('./gh-outbox.cjs');

const wf = createWorktreeFixtures();
afterEach(() => wf.cleanup());

/**
 * The supported layout: main tracks `.aoforge/`, so a plain worktree checks out its own copy; the worktree branch then
 * commits the 08-01 TRD that main never sees (the divergence the verbs must follow).
 */
function sameLayout(opts = {}) {
  const p = wf.project(opts);
  const wt = wf.addWorktree(p);
  wf.commitInWorktree(p, wt, NEW, WT_ONLY_TRD, '# TRD 08-01\n');
  assert.equal(exists(wt, NEW), true, 'fixture: the worktree has its own .aoforge/');
  assert.equal(exists(p.main, `${NEW}/${WT_ONLY_TRD}`), false, 'fixture: main has no 08-01 TRD');
  return { p, wt };
}

describe('planning verbs in a linked worktree, local mode (quick 36)', { skip: !HAS_GIT && 'git not available' }, () => {
  test('25. quick put writes the worktree\'s .aoforge/ and says so; main gains nothing', () => {
    const { p, wt } = sameLayout();
    const prose = wf.aof(p, wt, ['quick', 'put', '34', 'demo', '--from', '-'], JOB_TEXT);
    assert.equal(prose.status, 0, prose.err || prose.out);
    assert.equal(read(wt, `${NEW}/${JOB_REL}`), JOB_TEXT, 'the JOB lands in the worktree');
    assert.equal(exists(p.main, `${NEW}/quick`), false, 'main has no quick/ dir');
    assert.ok(prose.out.includes(`wrote ${NEW}/${JOB_REL}`), prose.out);

    const raw = wf.aof(p, wt, ['quick', 'put', '34', 'demo', '--from', '-', '--raw'], JOB_TEXT);
    assert.equal(raw.status, 0, raw.err || raw.out);
    assert.ok(under(fs.realpathSync(raw.json.path), wt), `raw path ${raw.json.path} is under the worktree`);
    assert.equal(fs.realpathSync(raw.json.path), fs.realpathSync(path.join(wt, NEW, JOB_REL)));
    assert.equal(exists(p.main, `${NEW}/quick`), false, 'main still has no quick/ dir');
  });

  test('26. quick summary finds the task in the worktree and writes its SUMMARY there', () => {
    const { p, wt } = sameLayout();
    assert.equal(wf.aof(p, wt, ['quick', 'put', '34', 'demo', '--from', '-'], JOB_TEXT).status, 0);
    const r = wf.aof(p, wt, ['quick', 'summary', '34', '--from', '-', '--raw'], QSUM_TEXT);
    assert.equal(r.status, 0, r.err || r.out);
    assert.equal(read(wt, `${NEW}/quick/34-demo/34-SUMMARY.md`), QSUM_TEXT);
    assert.equal(exists(p.main, `${NEW}/quick`), false, 'main has no quick/ dir');
  });

  test('27. summary checkpoint for an objective only the worktree has writes the worktree', () => {
    const { p, wt } = sameLayout();
    const r = wf.aof(p, wt, ['summary', 'checkpoint', '08-01', '--from', '-', '--raw'], CHECKPOINT_TEXT);
    assert.equal(r.status, 0, r.err || r.out);
    assert.equal(read(wt, `${NEW}/objectives/08-wt-only/08-01-SUMMARY.md`), CHECKPOINT_TEXT);
    assert.equal(exists(p.main, `${NEW}/objectives/08-wt-only`), false, 'nothing in main');
  });

  test('28. doc put PROJECT.md writes the worktree; main\'s PROJECT.md is unchanged', () => {
    const { p, wt } = sameLayout();
    const r = wf.aof(p, wt, ['doc', 'put', 'PROJECT.md', '--from', '-', '--raw'], WT_PROJECT);
    assert.equal(r.status, 0, r.err || r.out);
    assert.equal(read(wt, `${NEW}/PROJECT.md`), WT_PROJECT);
    assert.equal(read(p.main, `${NEW}/PROJECT.md`), MAIN_PROJECT);
  });

  test('29. planning draft seeds from the worktree\'s file; the draft stays under the MAIN repo key', () => {
    const { p, wt } = sameLayout();
    assert.equal(wf.aof(p, wt, ['quick', 'put', '34', 'demo', '--from', '-'], JOB_TEXT).status, 0);
    // A different copy at the same rel in main: the draft must not be seeded from it.
    write(p.main, `${NEW}/${JOB_REL}`, '# Quick 34: demo\n\nStale main copy.\n');
    const r = wf.aof(p, wt, ['planning', 'draft', JOB_REL]);
    assert.equal(r.status, 0, r.err || r.out);
    const draft = r.out.split('\n')[0];
    assert.equal(fs.readFileSync(draft, 'utf-8'), JOB_TEXT, 'the draft holds the worktree text');
    assert.ok(under(draft, p.tmp), `the draft ${draft} is under the test TMPDIR`);
    assert.ok(draft.split(path.sep).includes(repoKey(p.main)), `the draft ${draft} is keyed on main (${repoKey(p.main)})`);
    assert.ok(!draft.split(path.sep).includes(repoKey(wt)), `the draft ${draft} is not keyed on the worktree`);
  });
});

describe('planning verbs in a linked worktree, guards (quick 36)', { skip: !HAS_GIT && 'git not available' }, () => {
  test('31. a worktree with no planning dir (gitignored) falls back to main', () => {
    const p = wf.project({ ignorePlanning: true });
    const wt = wf.addWorktree(p);
    assert.equal(exists(wt, NEW), false, 'fixture: the worktree has no .aoforge/');
    const r = wf.aof(p, wt, ['quick', 'put', '34', 'demo', '--from', '-'], JOB_TEXT);
    assert.equal(r.status, 0, r.err || r.out);
    assert.equal(read(p.main, `${NEW}/${JOB_REL}`), JOB_TEXT, 'main took the write');
    assert.equal(exists(wt, NEW), false, 'the worktree gained no .aoforge/');
    assert.deepEqual(fs.readdirSync(wt).filter((n) => n !== '.git').sort(), ['.gitignore', 'src'],
      'the worktree gained no planning dir of any name');
  });

  test('s1. store config in main: summary checkpoint from the worktree writes MAIN\'s .trd-progress (D-14)', () => {
    const { p, wt } = sameLayout({ config: { github: { enabled: true, store: true } } });
    // The worktree's own config says store false: the mode is read from MAIN's config, never the worktree's.
    write(wt, `${NEW}/config.json`, `${JSON.stringify({ github: { enabled: true, store: false } })}\n`);
    const before = snapshot(path.join(wt, NEW));
    const r = wf.aof(p, wt, ['summary', 'checkpoint', '07-01', '--from', '-', '--raw'], CHECKPOINT_TEXT);
    assert.equal(r.status, 0, r.err || r.out);
    assert.equal(r.json.mode, 'store');
    assert.equal(read(p.main, `${NEW}/.trd-progress/7-01.md`), CHECKPOINT_TEXT, "main's progress file holds it");
    assert.deepEqual(snapshot(path.join(wt, NEW)), before, "the worktree's planning dir is untouched");
  });
});
