'use strict';

// planning-layout.legacy.test.cjs — the planning-directory layout contract (objective 72, TRD 72-05, INST-02/INST-03).
//
// Outside-in: every case spawns `node aof-tools.cjs --cwd <root> ...` with a fake HOME and a fixture from
// __fixtures__/legacy-layout-fixtures.cjs. The new directory is NAMES.planningDir, the legacy one
// LEGACY.planningDir. This file may spell legacy names (`*.legacy.test.*`), but builds them from the map.
//
// Test list (written before the implementation; one at a time):
//
// Layout `aoforge` (only the new directory)
//   1. `state load --raw`, `roadmap analyze --raw`, `init plan-objective 1` succeed; `objective add "Second"`
//      creates <new>/objectives/02-second/; the legacy directory does not exist afterwards.
//   2. In an empty git repo, `init new-project` reports no planning directory and creates none, and
//      `config-ensure-section` (the verb that creates the first config) writes <new>/config.json; `adopt
//      scaffold` in an adopt-ready repo writes <new>/ and never the legacy directory.
//
// Layout `legacy` (only the legacy directory)
//   3. Read verbs: `state load`, `roadmap analyze`, `init plan-objective 1`, `init execute-objective 1`,
//      `init progress`, `planning mode`, `config-get workflow.auto_advance`, `stack resolve` (STACK.md in the
//      legacy directory) succeed, and give the same output as layout `aoforge` once paths are normalised.
//   4. Write verbs: `objective add "Second"`, `planning draft PROJECT.md` + `doc put PROJECT.md --from <draft>`,
//      `summary post 01-01 --from <file>`, `state update-progress`, `config-set workflow.x true` and
//      `commit "docs: x" --files <legacy>/STATE.md` all write under the legacy directory; the new directory is
//      never created. (The same verbs write under <new>/ in layout `aoforge`.)
//   5. `validate health --raw` includes W066 `legacy-planning-dir` with the fix `aof-tools upgrade --apply --only 0012`.
//   6. `init plan-objective 1` (and `init execute-objective 1`) JSON `advisories_warnings` carries the W066 line.
//
// Layout `both`
//   7. Verbs read and write <new>/ and leave the legacy directory byte-identical; `validate health` W066 says
//      both exist and the legacy one is ignored.
//
// Layout `aoforge`, no regression
//   8. `validate health --raw` has no W066.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { NAMES, LEGACY } = require('./legacy-names.cjs');
const {
  planningProject,
  CURRENT_STATUS,
  LEGACY_COPY_STATUS,
} = require('./__fixtures__/legacy-layout-fixtures.cjs');
const {
  makeFixture,
  makeFakeHome,
  gitEnv,
  writeMappedDocs,
  writeProjectMd,
} = require('./__fixtures__/adopt-fixtures.cjs');

const { spawnSync } = require('child_process');

const AOF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');

const NEW = NAMES.planningDir;
const OLD = LEGACY.planningDir;
const DIR_OF = { aoforge: NEW, legacy: OLD, both: NEW };
const OTHER_OF = { aoforge: OLD, legacy: NEW };

const STACK_MD = '---\nextends: go\n---\n\n# Stack\n\nThe project tier of the layout fixture.\n';

const SUMMARY_MD = [
  '---',
  'objective: 01-first',
  'trd: "01"',
  '---',
  '',
  '# Objective 1 TRD 01: X Summary',
  '',
  'Wrote x.txt.',
  '',
  '## Self-Check: PASSED',
  '',
].join('\n');

const exists = (root, rel) => fs.existsSync(path.join(root, rel));

function ok(r, what) {
  assert.equal(r.status, 0, `${what} exited ${r.status}\n${r.out}`);
  return r;
}

function json(r, what) {
  ok(r, what);
  try {
    return JSON.parse(r.stdout);
  } catch (e) {
    assert.fail(`${what} did not print JSON: ${e.message}\n${r.out}`);
  }
  return null;
}

/** Every file under `dir`, relative path -> content, for byte-identity checks. */
function snapshotTree(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else out[path.relative(dir, abs)] = fs.readFileSync(abs, 'utf-8');
    }
  };
  walk(dir);
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Output of a verb with everything that legitimately differs between two fixtures replaced: the temp
 * directories, the repository key derived from the root path, and the planning directory's name.
 */
function normalise(p, text) {
  let t = text;
  for (const [abs, label] of [[p.root, '<root>'], [p.home, '<home>'], [p.tmp, '<tmp>']]) {
    t = t.replace(new RegExp(escapeRe(abs), 'g'), label);
  }
  t = t.replace(/\brepo-[0-9a-f]{8}\b/g, 'repo-<key>');
  t = t.replace(new RegExp(`${escapeRe(NEW)}|${escapeRe(OLD)}`, 'g'), '<dir>');
  return t;
}

/** Parsed JSON with the layout advisory (Task 3 adds W066 to legacy only) and volatile keys removed. */
function comparable(p, r) {
  const text = normalise(p, r.stdout);
  try {
    const v = JSON.parse(text);
    if (v && typeof v === 'object') delete v.advisories_warnings;
    return v;
  } catch {
    return text;
  }
}

const READ_VERBS = [
  ['state', 'load', '--raw'],
  ['roadmap', 'analyze', '--raw'],
  ['init', 'plan-objective', '1'],
  ['init', 'execute-objective', '1'],
  ['init', 'progress'],
  ['planning', 'mode'],
  ['config-get', 'workflow.auto_advance'],
  ['stack', 'resolve', '--raw'],
];

// ─── Case 1: layout aoforge ──────────────────────────────────────────────────

describe('1. layout aoforge: reads and objective add use the new directory', () => {
  let p;
  before(() => { p = planningProject({ layout: 'aoforge' }); });
  after(() => p.cleanup());

  test('state load --raw finds config, roadmap and state', () => {
    const r = ok(p.run(['state', 'load', '--raw']), 'state load');
    for (const k of ['config_exists=true', 'roadmap_exists=true', 'state_exists=true']) {
      assert.ok(r.stdout.includes(k), `missing ${k}\n${r.out}`);
    }
  });

  test('roadmap analyze --raw lists objective 1', () => {
    const j = json(p.run(['roadmap', 'analyze', '--raw']), 'roadmap analyze');
    assert.equal(j.error, undefined, JSON.stringify(j));
    assert.deepEqual(j.objectives.map((o) => o.name), ['First']);
  });

  test('init plan-objective 1 finds the objective under the new directory', () => {
    const j = json(p.run(['init', 'plan-objective', '1']), 'init plan-objective');
    assert.equal(j.objective_found, true);
    assert.equal(j.objective_dir, `${NEW}/objectives/01-first`);
  });

  test('objective add "Second" creates <new>/objectives/02-second/ and no legacy directory', () => {
    const j = json(p.run(['objective', 'add', 'Second']), 'objective add');
    assert.equal(j.directory, `${NEW}/objectives/02-second`);
    assert.ok(exists(p.root, `${NEW}/objectives/02-second`));
    assert.equal(exists(p.root, OLD), false, `${OLD} was created`);
  });
});

// ─── Case 2: new projects get the new directory ──────────────────────────────

describe('2. a new project gets the new directory', () => {
  test('init new-project creates nothing; config-ensure-section writes <new>/config.json', () => {
    const p = planningProject({ layout: 'none' });
    try {
      const j = json(p.run(['init', 'new-project']), 'init new-project');
      assert.equal(j.planning_exists, false);
      assert.equal(j.project_exists, false);
      assert.equal(exists(p.root, NEW), false);
      assert.equal(exists(p.root, OLD), false);

      ok(p.run(['config-ensure-section']), 'config-ensure-section');
      assert.ok(exists(p.root, `${NEW}/config.json`), `${NEW}/config.json missing`);
      assert.equal(exists(p.root, OLD), false, `${OLD} was created`);
    } finally {
      p.cleanup();
    }
  });

  test('adopt scaffold in an adopt-ready repo writes <new>/ and never the legacy directory', () => {
    const home = makeFakeHome();
    const parent = fs.realpathSync(fs.mkdtempSync(path.join(require('os').tmpdir(), 'aof-layout-adopt-')));
    try {
      const root = makeFixture('go-service', { parent, home });
      const runAdopt = (sub) => spawnSync(process.execPath, [AOF_TOOLS, '--cwd', root, 'adopt', sub], {
        cwd: parent, env: gitEnv(home), encoding: 'utf-8', timeout: 60000,
      });
      const begin = runAdopt('begin');
      assert.equal(begin.status, 0, `${begin.stdout}${begin.stderr}`);
      writeMappedDocs(root);
      writeProjectMd(root, { name: 'Orders Service', kind: 'api', defaultWork: 'feature' });
      const r = runAdopt('scaffold');
      assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
      for (const f of ['STATE.md', 'ROADMAP.md', 'config.json', 'PROJECT.md']) {
        assert.ok(exists(root, `${NEW}/${f}`), `${NEW}/${f} missing`);
      }
      assert.equal(exists(root, OLD), false, `${OLD} was created`);
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

// ─── Case 3: read verbs, both single-directory layouts ───────────────────────

for (const layout of ['aoforge', 'legacy']) {
  describe(`3. layout ${layout}: read verbs reach ${DIR_OF[layout]}`, () => {
    const dir = DIR_OF[layout];
    let p;
    before(() => { p = planningProject({ layout, files: { 'STACK.md': STACK_MD } }); });
    after(() => p.cleanup());

    test('state load --raw finds config, roadmap and state', () => {
      const r = ok(p.run(['state', 'load', '--raw']), 'state load');
      for (const k of ['config_exists=true', 'roadmap_exists=true', 'state_exists=true']) {
        assert.ok(r.stdout.includes(k), `missing ${k}\n${r.out}`);
      }
    });

    test('roadmap analyze --raw lists objective 1', () => {
      const j = json(p.run(['roadmap', 'analyze', '--raw']), 'roadmap analyze');
      assert.equal(j.error, undefined, JSON.stringify(j));
      assert.deepEqual(j.objectives.map((o) => o.name), ['First']);
    });

    test('init plan-objective 1 and init execute-objective 1 find the objective', () => {
      const plan = json(p.run(['init', 'plan-objective', '1']), 'init plan-objective');
      assert.equal(plan.objective_found, true);
      assert.equal(plan.objective_dir, `${dir}/objectives/01-first`);
      const exec = json(p.run(['init', 'execute-objective', '1']), 'init execute-objective');
      assert.equal(exec.objective_found, true);
      assert.deepEqual(exec.jobs, ['01-01-x-TRD.md']);
    });

    test('init progress lists the objective directory', () => {
      const j = json(p.run(['init', 'progress']), 'init progress');
      assert.deepEqual(j.objectives.map((o) => o.directory), [`${dir}/objectives/01-first`]);
    });

    test('planning mode, config-get and stack resolve read the planning directory', () => {
      assert.equal(ok(p.run(['planning', 'mode']), 'planning mode').stdout.trim(), 'local');
      // the fixture sets workflow.auto_advance false; the default is true
      assert.equal(ok(p.run(['config-get', 'workflow.auto_advance']), 'config-get').stdout.trim(), 'false');
      // STACK.md extends go: the id is go only when the project tier was read
      assert.equal(ok(p.run(['stack', 'resolve', '--raw']), 'stack resolve').stdout.trim(), 'go');
    });

    test(`no ${OTHER_OF[layout]} appears after the reads`, () => {
      for (const args of READ_VERBS) p.run(args);
      assert.equal(exists(p.root, OTHER_OF[layout]), false, `${OTHER_OF[layout]} was created`);
    });
  });
}

describe('3. parity: legacy read verbs print what layout aoforge prints, paths aside', () => {
  let a;
  let l;
  before(() => {
    a = planningProject({ layout: 'aoforge', files: { 'STACK.md': STACK_MD } });
    l = planningProject({ layout: 'legacy', files: { 'STACK.md': STACK_MD } });
  });
  after(() => { a.cleanup(); l.cleanup(); });

  for (const args of READ_VERBS) {
    test(args.join(' '), () => {
      const ra = ok(a.run(args), `aoforge ${args.join(' ')}`);
      const rl = ok(l.run(args), `legacy ${args.join(' ')}`);
      assert.deepEqual(comparable(l, rl), comparable(a, ra));
    });
  }
});

// ─── Case 4: write verbs, both single-directory layouts ──────────────────────

for (const layout of ['aoforge', 'legacy']) {
  describe(`4. layout ${layout}: write verbs write under ${DIR_OF[layout]}`, () => {
    const dir = DIR_OF[layout];
    const other = OTHER_OF[layout];
    let p;
    before(() => { p = planningProject({ layout }); });
    after(() => p.cleanup());

    test('objective add "Second"', () => {
      const j = json(p.run(['objective', 'add', 'Second']), 'objective add');
      assert.equal(j.directory, `${dir}/objectives/02-second`);
      assert.ok(exists(p.root, `${dir}/objectives/02-second`));
    });

    test('planning draft PROJECT.md + doc put PROJECT.md --from <draft>', () => {
      const draft = ok(p.run(['planning', 'draft', 'PROJECT.md']), 'planning draft').stdout.trim();
      assert.ok(fs.existsSync(draft), `draft ${draft} missing`);
      fs.appendFileSync(draft, '\nEdited through a draft.\n');
      ok(p.run(['doc', 'put', 'PROJECT.md', '--from', draft]), 'doc put');
      assert.ok(fs.readFileSync(path.join(p.root, dir, 'PROJECT.md'), 'utf-8').includes('Edited through a draft.'));
    });

    test('summary post 01-01 --from <file>', () => {
      const file = path.join(p.tmp, 'summary.md');
      fs.writeFileSync(file, SUMMARY_MD);
      ok(p.run(['summary', 'post', '01-01', '--from', file]), 'summary post');
      assert.equal(
        fs.readFileSync(path.join(p.root, dir, 'objectives/01-first/01-01-SUMMARY.md'), 'utf-8'),
        SUMMARY_MD,
      );
    });

    test('state update-progress', () => {
      const j = json(p.run(['state', 'update-progress']), 'state update-progress');
      assert.equal(j.updated, true);
      assert.ok(fs.readFileSync(path.join(p.root, dir, 'STATE.md'), 'utf-8').includes(j.bar));
    });

    test('config-set workflow.x true', () => {
      ok(p.run(['config-set', 'workflow.x', 'true']), 'config-set');
      const cfg = JSON.parse(fs.readFileSync(path.join(p.root, dir, 'config.json'), 'utf-8'));
      assert.equal(cfg.workflow.x, true);
    });

    test(`commit "docs: x" --files ${dir}/STATE.md`, () => {
      const j = json(p.run(['commit', 'docs: x', '--files', `${dir}/STATE.md`]), 'commit');
      assert.equal(j.committed, true, JSON.stringify(j));
      assert.deepEqual(p.git(['show', '--name-only', '--format=', 'HEAD']).trim().split('\n'), [`${dir}/STATE.md`]);
    });

    test(`${other} is never created`, () => {
      assert.equal(exists(p.root, other), false, `${other} was created`);
    });
  });
}

// ─── Case 7: both directories ────────────────────────────────────────────────

describe('7. layout both: the new directory wins and the legacy one is left alone', () => {
  let p;
  let legacyBefore;
  before(() => {
    p = planningProject({ layout: 'both' });
    legacyBefore = snapshotTree(path.join(p.root, OLD));
  });
  after(() => p.cleanup());

  test('state load reads <new>/STATE.md', () => {
    const j = json(p.run(['state', 'load']), 'state load');
    assert.ok(j.state_raw.includes(CURRENT_STATUS), j.state_raw);
    assert.equal(j.state_raw.includes(LEGACY_COPY_STATUS), false, 'read the legacy copy');
  });

  test('init plan-objective 1 resolves under the new directory', () => {
    const j = json(p.run(['init', 'plan-objective', '1']), 'init plan-objective');
    assert.equal(j.objective_dir, `${NEW}/objectives/01-first`);
  });

  test('objective add and state update-progress write the new directory only', () => {
    const j = json(p.run(['objective', 'add', 'Second']), 'objective add');
    assert.equal(j.directory, `${NEW}/objectives/02-second`);
    assert.ok(exists(p.root, `${NEW}/objectives/02-second`));
    ok(p.run(['state', 'update-progress']), 'state update-progress');
    assert.deepEqual(snapshotTree(path.join(p.root, OLD)), legacyBefore);
  });
});
