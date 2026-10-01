'use strict';

// gh-backfill-fixtures.test.cjs (TRD 51-02) — the 20-objective backfill fixture is the shared ground truth for the
// GitHub store backfill (GMD-01), its estimate (GMD-02) and SC1/SC2, so its shape is pinned here: the tree the
// builder writes is compared against literal expectations AND against the counts the builder's own loops derive.
//
//   1  default build: 20 objective dirs, 100 TRDs, SUMMARY / VERIFICATION / entity counts equal BACKFILL_SHAPE
//   2  objective statuses (1-15 complete, 16-18 in_progress, 19 cancelled, 20 planned); 03-05 deferred, no SUMMARY
//   3  `planning mode` is local; config.json has github.enabled true and no `store` key
//   4  every written file is tracked and the tree is clean
//   5  {legacyTrd} adds one LEGACY_TRD_RE name, {oversizeTrd} one TRD over 60,000 chars; the default has neither
//   6  two builds with the same options are byte-identical
//
// Hermetic: temp dirs only, a fake home for git, no gh call of any kind.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { makeBackfillProject, BACKFILL_SHAPE } = require('./__fixtures__/gh-backfill-fixtures.cjs');
const { snapshot, gitEnv } = require('./__fixtures__/upgrade-fixtures.cjs');
const { gitAvailable } = require('./__fixtures__/wiki-remote.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { planningMode } = require('./planning-mode.cjs');
const { milestoneSections } = require('./planning-import.cjs');
const planningPaths = require('./planning-paths.cjs');

// planning-import.cjs keeps LEGACY_TRD_RE private; this is the same literal (planning-import.cjs L64). If the two ever
// drift, test 5 below still proves the legacy file is NOT a TRD by the class table, which is what import relies on.
const LEGACY_TRD_RE = /^objectives\/([^/]+)\/(\d+(?:\.\d+)?-\d+)-TRD-(.+)\.md$/;

const pad = (n) => String(n).padStart(2, '0');

/** Every file under `<root>/.planning`, as sorted rels relative to `.planning/` (posix). */
function planningFiles(root) {
  const base = path.join(root, '.planning');
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), relPath);
      else if (entry.isFile()) out.push(relPath);
    }
  };
  walk(base, '');
  return out.sort();
}

/** Counts read back from the tree, independent of the builder. */
function treeCounts(root) {
  const files = planningFiles(root);
  const inObjective = (re) => files.filter((rel) => /^objectives\/[^/]+\/[^/]+$/.test(rel) && re.test(path.posix.basename(rel)));
  const objectiveDirs = fs.readdirSync(path.join(root, '.planning', 'objectives'), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name);
  const decisions = files.filter((rel) => rel.startsWith('decisions/'));
  const withTrd = decisions.filter((rel) => extractFrontmatter(fs.readFileSync(path.join(root, '.planning', rel), 'utf8')).trd);
  const quickDirs = new Set(files.filter((rel) => rel.startsWith('quick/')).map((rel) => rel.split('/')[1]));
  return {
    objectives: objectiveDirs.length,
    trds: inObjective(/-TRD\.md$/).length,
    summaries: inObjective(/-SUMMARY\.md$/).length,
    verifications: inObjective(/-VERIFICATION\.md$/).length,
    todos: files.filter((rel) => rel.startsWith('todos/')).length,
    debug: files.filter((rel) => rel.startsWith('debug/')).length,
    quick: quickDirs.size,
    decisionsWithTrd: withTrd.length,
    decisionsWithoutTrd: decisions.length - withTrd.length,
    milestones: milestoneSections(fs.readFileSync(path.join(root, '.planning', 'MILESTONES.md'), 'utf8')).length,
    files: files.length,
  };
}

function objectiveDirOf(n) {
  return `${pad(n)}-objective-${pad(n)}`;
}

function readPlanning(root, rel) {
  return fs.readFileSync(path.join(root, '.planning', ...rel.split('/')), 'utf8');
}

const HAS_GIT = gitAvailable();

describe('51-02 makeBackfillProject (default build)', () => {
  let built;

  before(() => {
    built = makeBackfillProject({ git: HAS_GIT });
  });

  after(() => {
    if (built) built.cleanup();
  });

  test('1: 20 objective dirs, 100 TRDs; SUMMARY/VERIFICATION and entity counts equal BACKFILL_SHAPE', () => {
    assert.ok(Object.isFrozen(BACKFILL_SHAPE), 'BACKFILL_SHAPE is frozen');
    // The intent, pinned literally so a loop bug in the builder cannot hide behind its own derived counts.
    assert.equal(BACKFILL_SHAPE.objectives, 20);
    assert.equal(BACKFILL_SHAPE.trds, 100);
    assert.equal(BACKFILL_SHAPE.summaries, 80, '15 x 5 shipped minus the deferred 03-05, plus 2 each for 16-18');
    assert.equal(BACKFILL_SHAPE.verifications, 8, 'odd shipped objectives 1, 3, ... 15');
    assert.equal(BACKFILL_SHAPE.shipped, 15);
    assert.equal(BACKFILL_SHAPE.cancelled, 1);
    assert.equal(BACKFILL_SHAPE.todos, 3);
    assert.equal(BACKFILL_SHAPE.debug, 1);
    assert.equal(BACKFILL_SHAPE.quick, 1);
    assert.equal(BACKFILL_SHAPE.decisionsWithTrd, 1);
    assert.equal(BACKFILL_SHAPE.decisionsWithoutTrd, 1);
    assert.equal(BACKFILL_SHAPE.milestones, 2);

    // The tree, read back, matches the intent.
    const counts = treeCounts(built.root);
    for (const [key, value] of Object.entries(counts)) {
      assert.equal(value, BACKFILL_SHAPE[key], `tree ${key} = ${value}, BACKFILL_SHAPE.${key} = ${BACKFILL_SHAPE[key]}`);
    }
    assert.deepEqual(built.shape, BACKFILL_SHAPE, 'the default build reports the default shape');
    assert.equal(built.files.length, BACKFILL_SHAPE.files, 'the builder lists every file it wrote');
    assert.deepEqual([...built.files].sort(), planningFiles(built.root), 'and lists exactly the files in the tree');

    for (const rel of ['PROJECT.md', 'REQUIREMENTS.md', 'ROADMAP.md', 'MILESTONES.md', 'research/a.md', 'config.json']) {
      assert.ok(fs.existsSync(path.join(built.root, '.planning', rel)), `${rel} exists`);
    }
    assert.deepEqual(milestoneSections(readPlanning(built.root, 'MILESTONES.md')).map((s) => s.version), ['v0.1', 'v0.2']);

    for (let n = 1; n <= 20; n++) {
      const dir = objectiveDirOf(n);
      assert.ok(fs.existsSync(path.join(built.root, '.planning', 'objectives', dir, 'OBJECTIVE.md')), `${dir}/OBJECTIVE.md`);
      for (let m = 1; m <= 5; m++) {
        const file = `${pad(n)}-${pad(m)}-step-${pad(m)}-TRD.md`;
        const text = readPlanning(built.root, `objectives/${dir}/${file}`);
        const fm = extractFrontmatter(text);
        assert.equal(fm.objective, dir, `${file} objective`);
        assert.equal(String(fm.trd), pad(m), `${file} trd`);
        assert.equal(Number(fm.wave), Math.ceil(m / 2), `${file} wave (1,1,2,2,3)`);
        assert.ok(Object.hasOwn(fm, 'depends_on'), `${file} declares depends_on`);
        assert.ok(text.length < 2000, `${file} stays small (~1 KB), got ${text.length}`);
      }
    }

    // The ROADMAP resolves every objective by header (gh-mapping.cjs resolver regex).
    const roadmap = readPlanning(built.root, 'ROADMAP.md');
    const headers = [...roadmap.matchAll(/^#{2,4}[ \t]*Objective[ \t]+([\d.]+):/gim)].map((m) => Number(m[1]));
    assert.deepEqual(headers, Array.from({ length: 20 }, (_, i) => i + 1));
    assert.match(roadmap, /^## Milestones$/m);
    assert.match(roadmap, /^- ✅ \*\*v0\.1 [^*]+\*\* - Objectives 1-8 \(shipped /m);
    assert.match(roadmap, /^- ✅ \*\*v0\.2 [^*]+\*\* - Objectives 9-15 \(shipped /m);

    // One decision names a TRD that exists; the other names none.
    const decisions = built.files.filter((rel) => rel.startsWith('decisions/'));
    const trdOf = decisions.map((rel) => extractFrontmatter(readPlanning(built.root, rel)).trd).filter(Boolean);
    assert.deepEqual(trdOf.map(String), ['16-03']);
    assert.ok(fs.existsSync(path.join(built.root, '.planning', 'objectives', objectiveDirOf(16), '16-03-step-03-TRD.md')));
  });

  test('2: objective statuses, progress rows, SUMMARY placement; 03-05 is deferred with no SUMMARY', () => {
    const expected = (n) => (n <= 15 ? 'complete' : n <= 18 ? 'in_progress' : n === 19 ? 'cancelled' : 'planned');
    const progressWord = { complete: 'Complete', in_progress: 'In progress', cancelled: 'Cancelled', planned: 'Registered' };
    const roadmap = readPlanning(built.root, 'ROADMAP.md');

    for (let n = 1; n <= 20; n++) {
      const dir = objectiveDirOf(n);
      const fm = extractFrontmatter(readPlanning(built.root, `objectives/${dir}/OBJECTIVE.md`));
      assert.equal(fm.status, expected(n), `objective ${n} status`);
      assert.equal(fm.objective, dir);
      const row = new RegExp(`^\\| ${n}\\. [^|]+\\| [^|]+\\| [^|]+\\| ${progressWord[expected(n)]} \\|`, 'm');
      assert.match(roadmap, row, `progress row for objective ${n} reads ${progressWord[expected(n)]}`);

      for (let m = 1; m <= 5; m++) {
        const summary = path.join(built.root, '.planning', 'objectives', dir, `${pad(n)}-${pad(m)}-SUMMARY.md`);
        let want;
        if (n <= 15) want = !(n === 3 && m === 5);
        else if (n <= 18) want = m <= 2;
        else want = false;
        assert.equal(fs.existsSync(summary), want, `${pad(n)}-${pad(m)} SUMMARY ${want ? 'present' : 'absent'}`);
      }
      const verification = path.join(built.root, '.planning', 'objectives', dir, `${pad(n)}-VERIFICATION.md`);
      const wantVerification = n <= 15 && n % 2 === 1;
      assert.equal(fs.existsSync(verification), wantVerification, `${pad(n)} VERIFICATION`);
      if (wantVerification) assert.equal(extractFrontmatter(fs.readFileSync(verification, 'utf8')).status, 'passed');
    }

    assert.ok(fs.existsSync(path.join(built.root, '.planning', 'objectives', objectiveDirOf(3), '03-05-step-05-TRD.md')),
      'the deferred TRD itself exists');
    assert.equal(built.paths.deferredTrd, 'objectives/03-objective-03/03-05-step-05-TRD.md');
    assert.match(roadmap, /^- \[ \] 03-05-step-05-TRD\.md .*deferred/m, 'ROADMAP marks 03-05 deferred');
  });

  test('3: planning mode is local; github.enabled true, repo o/r, no store key; devflow stamp through 0009', () => {
    assert.equal(planningMode(built.root).mode, 'local');
    const config = JSON.parse(readPlanning(built.root, 'config.json'));
    assert.equal(config.github.enabled, true);
    assert.equal(config.github.repo, 'o/r');
    assert.equal(Object.hasOwn(config.github, 'store'), false, 'store is OFF by absence (the migration flips it)');
    assert.equal(config.devflow.version, '2.12.0');
    assert.deepEqual(config.devflow.migrations_applied, ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009']);
  });

  test('4: every written file is tracked under .planning and the tree is clean', (t) => {
    if (!HAS_GIT) {
      t.skip('git is not available');
      return;
    }
    const git = (...args) => execFileSync('git', ['-C', built.root, ...args], { env: gitEnv(built.home), encoding: 'utf8' });
    const tracked = git('ls-files', '.planning').split('\n').filter(Boolean);
    assert.equal(tracked.length, built.files.length, 'git ls-files .planning | wc -l equals the files written');
    assert.equal(tracked.length, BACKFILL_SHAPE.files);
    assert.deepEqual(tracked.map((rel) => rel.replace(/^\.planning\//, '')).sort(), [...built.files].sort());
    assert.equal(git('status', '--porcelain'), '', 'clean tree');
    assert.equal(git('rev-list', '--count', 'HEAD').trim(), '1', 'one commit');
  });

  test('5: {legacyTrd} adds one legacy-named TRD, {oversizeTrd} one TRD over 60,000 chars; the default has neither', () => {
    const base = new Set(built.files);
    for (const rel of built.files) {
      assert.equal(LEGACY_TRD_RE.test(rel), false, `default has no legacy TRD name (${rel})`);
      assert.ok(readPlanning(built.root, rel).length <= 60000, `default has no oversize file (${rel})`);
    }
    assert.equal(built.paths.legacyTrd, null);
    assert.equal(built.paths.oversizeTrd, null);

    const legacy = makeBackfillProject({ git: false, legacyTrd: true });
    try {
      const extra = planningFiles(legacy.root).filter((rel) => !base.has(rel));
      assert.equal(extra.length, 1, `exactly one extra file: ${JSON.stringify(extra)}`);
      assert.match(extra[0], LEGACY_TRD_RE);
      assert.equal(extra[0], legacy.paths.legacyTrd);
      assert.equal(planningPaths.classify(extra[0]).class, 'runtime', 'no verb owns a legacy TRD name');
      assert.equal(legacy.shape.trds, BACKFILL_SHAPE.trds, 'a legacy name is not counted as a TRD');
      assert.equal(legacy.shape.files, BACKFILL_SHAPE.files + 1);
      assert.equal(treeCounts(legacy.root).trds, BACKFILL_SHAPE.trds);
    } finally {
      legacy.cleanup();
    }

    const big = makeBackfillProject({ git: false, oversizeTrd: true });
    try {
      const extra = planningFiles(big.root).filter((rel) => !base.has(rel));
      assert.equal(extra.length, 1, `exactly one extra file: ${JSON.stringify(extra)}`);
      assert.match(extra[0], /^objectives\/[^/]+\/\d+-\d+-[^/]+-TRD\.md$/);
      assert.equal(extra[0], big.paths.oversizeTrd);
      assert.ok(readPlanning(big.root, extra[0]).length > 60000, 'over the 60,000-char issue-body budget');
      assert.equal(planningPaths.classify(extra[0]).verb, 'plan put-trd', 'it is a real TRD by name');
      assert.equal(big.shape.trds, BACKFILL_SHAPE.trds + 1);
      assert.equal(treeCounts(big.root).trds, BACKFILL_SHAPE.trds + 1);
      assert.equal(big.shape.files, BACKFILL_SHAPE.files + 1);
    } finally {
      big.cleanup();
    }
  });

  test('6: two builds with the same options produce byte-identical trees', () => {
    const a = makeBackfillProject({ git: false });
    const b = makeBackfillProject({ git: false });
    const c = makeBackfillProject({ git: false, legacyTrd: true, oversizeTrd: true });
    const d = makeBackfillProject({ git: false, legacyTrd: true, oversizeTrd: true });
    try {
      assert.notEqual(a.root, b.root, 'separate temp roots');
      assert.deepEqual(snapshot(a.root), snapshot(b.root));
      assert.deepEqual(snapshot(c.root), snapshot(d.root));
      assert.deepEqual(snapshot(a.root), snapshot(built.root), 'git or not, the working tree bytes are the same');
      assert.deepEqual(a.shape, b.shape);
    } finally {
      for (const p of [a, b, c, d]) p.cleanup();
    }
  });
});
