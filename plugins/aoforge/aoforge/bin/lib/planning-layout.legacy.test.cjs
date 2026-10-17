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
// Layout `legacy` (only the legacy directory; TRD 78-07 turned the 3.0 fallback of cases 3-4 into refusals)
//   3. Read verbs: `state load`, `roadmap analyze`, `init plan-objective 1`, `init execute-objective 1`,
//      `init progress`, `planning mode`, `stack resolve` exit 1 with legacyLayoutMessage(root) on stderr (the CLI
//      guard, legacy-layout-guard.cjs); `config-get workflow.auto_advance` (read-only, not guarded) reads
//      `.aoforge/config.json` only since TRD 78-11, so it exits 1 with its own "No config.json found" error (the
//      legacy config is never read); the new directory is never created. (Layout `aoforge` reads its own directory,
//      as before.)
//   4. Write verbs: `objective add "Second"`, `planning draft PROJECT.md`, `doc put PROJECT.md --from <file>`,
//      `summary post 01-01 --from <file>`, `state update-progress`, `config-set workflow.x true` and
//      `commit "docs: x" --files <legacy>/STATE.md` exit 1 with the same message; the legacy directory is
//      byte-identical and the new directory is never created. (The same verbs write under <new>/ in layout
//      `aoforge`.)
//   5. (TRD 78-01, its case 1) `validate health --raw` returns status broken with ONE error, W066
//      `legacy-planning-dir`, naming the legacy directory, AOForge 3.0.x, `git mv` and the migration guide, and no
//      `--only`; no other check ran; `--repair` creates no new directory either.
//   6. `init plan-objective 1` (and `init execute-objective 1`) refuse (TRD 78-07; before it, their JSON carried the
//      W066 advisory): exit 1, stderr names the legacy directory, AOForge 3.0.x, `git mv` and the guide, no `--only`.
//
// Layout `both`
//   7. Verbs read and write <new>/ and leave the legacy directory byte-identical; `validate health` W066 says
//      both exist and the legacy one is ignored (TRD 78-01 case 2: a warning, never an error).
//
// Layout `aoforge`, no regression
//   8. `validate health --raw` has no W066.
//
// TRD 78-01 (cases 3-4 of its test list), layout `aoforge`
//   9. `.aoforge/config.json` with only the pre-rename stamp key -> W067 whose fix renames the key; both keys ->
//      W067 whose fix deletes the pre-rename key; only the new key -> no W067. No fix names `--only`.
//  10. CLAUDE.md holding a managed block under the pre-rename markers -> W069 `legacy-claude-md-block` warning;
//      an AOFORGE block -> none; no CLAUDE.md -> none.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { NAMES, LEGACY } = require('./legacy-names.cjs');
const { legacyLayoutMessage } = require('./planning-layout.cjs');
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

// ─── Case 3: read verbs ──────────────────────────────────────────────────────
// Layout aoforge reads its own directory; layout legacy refuses (TRD 78-07, the CLI guard). Both hold before and
// after TRD 78-11 (compat stops resolving the legacy directory): the guard reads the filesystem itself.

for (const layout of ['aoforge']) {
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

/** A refusal by the legacy-layout guard: exit 1, the one message on stderr. */
function refused(p, r, what) {
  assert.equal(r.status, 1, `${what} exited ${r.status}\n${r.out}`);
  assert.ok(r.stderr.includes(legacyLayoutMessage(p.root)), `${what}: stderr lacks the legacy-layout message\n${r.out}`);
  return r;
}

/**
 * config-get is read-only and not guarded: it reads `.aoforge/config.json` (compat, single-name since TRD 78-11), which
 * a legacy-only project does not have, so it fails with its own missing-config error, never reading the legacy config.
 */
const UNGUARDED_READS = new Set(['config-get']);

/** An unguarded read in a legacy-only project: exit 1 with the missing-config error, not the guard's message. */
function missingConfig(p, r, what) {
  assert.equal(r.status, 1, `${what} exited ${r.status}\n${r.out}`);
  assert.ok(r.stderr.includes(`No config.json found at ${path.join(p.root, NEW, 'config.json')}`), `${what}\n${r.out}`);
  assert.equal(r.stderr.includes(legacyLayoutMessage(p.root)), false, `${what}: the guard does not cover it\n${r.out}`);
  return r;
}

describe('3. layout legacy: read verbs refuse with the legacy-layout message', () => {
  let p;
  let legacyBefore;
  before(() => {
    p = planningProject({ layout: 'legacy', files: { 'STACK.md': STACK_MD } });
    legacyBefore = snapshotTree(path.join(p.root, OLD));
  });
  after(() => p.cleanup());

  for (const args of READ_VERBS) {
    test(args.join(' '), () => {
      const r = p.run(args);
      if (UNGUARDED_READS.has(args[0])) missingConfig(p, r, args.join(' '));
      else refused(p, r, args.join(' '));
    });
  }

  test(`no ${NEW} appears and ${OLD} is byte-identical after the reads`, () => {
    for (const args of READ_VERBS) p.run(args);
    assert.equal(exists(p.root, NEW), false, `${NEW} was created`);
    assert.deepEqual(snapshotTree(path.join(p.root, OLD)), legacyBefore);
  });
});

// ─── Case 4: write verbs ─────────────────────────────────────────────────────

describe('4. layout legacy: write verbs refuse and write nothing', () => {
  let p;
  let legacyBefore;
  before(() => {
    p = planningProject({ layout: 'legacy' });
    legacyBefore = snapshotTree(path.join(p.root, OLD));
  });
  after(() => p.cleanup());

  test('objective add, planning draft, doc put, summary post, state update-progress, config-set and commit refuse', () => {
    const file = path.join(p.tmp, 'summary.md');
    fs.writeFileSync(file, SUMMARY_MD);
    const head = p.git(['rev-parse', 'HEAD']).trim();
    for (const args of [
      ['objective', 'add', 'Second'],
      ['planning', 'draft', 'PROJECT.md'],
      ['doc', 'put', 'PROJECT.md', '--from', file],
      ['summary', 'post', '01-01', '--from', file],
      ['state', 'update-progress'],
      ['config-set', 'workflow.x', 'true'],
      ['commit', 'docs: x', '--files', `${OLD}/STATE.md`],
    ]) {
      refused(p, p.run(args), args.join(' '));
    }
    assert.equal(p.git(['rev-parse', 'HEAD']).trim(), head, 'no commit');
  });

  test(`${OLD} is byte-identical and ${NEW} is never created`, () => {
    assert.deepEqual(snapshotTree(path.join(p.root, OLD)), legacyBefore);
    assert.equal(exists(p.root, NEW), false, `${NEW} was created`);
  });
});

for (const layout of ['aoforge']) {
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
    assert.ok(j.state_digest.includes(CURRENT_STATUS), j.state_digest);
    assert.equal(j.state_digest.includes(LEGACY_COPY_STATUS), false, 'read the legacy copy');
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

// ─── Cases 5, 6, 7 (W066), 8, 9 (W067) and 10 (W069): the 3.1 reports (TRD 78-01) ──

/** The fix every legacy-layout report names: AOForge 3.0.x, the manual move and the migration guide. */
const LAYOUT_FIX_PARTS = ['3.0.x', `git mv ${OLD} ${NEW}`, 'MIGRATING-TO-AOFORGE'];
const RETIRED = /--only 001[23]|for one release/;

/** validate health's JSON (following an `@file:` spill). */
function health(p, extra = []) {
  const r = p.run(['validate', 'health', ...extra, '--raw']);
  let text = r.stdout.trim();
  if (text.startsWith('@file:')) text = fs.readFileSync(text.slice('@file:'.length), 'utf-8');
  try {
    return JSON.parse(text);
  } catch (e) {
    assert.fail(`validate health did not print JSON: ${e.message}\n${r.out}`);
  }
  return null;
}

function w066(p) {
  return health(p).warnings.filter((w) => w.code === 'W066');
}

const issuesOf = (j, code) => [...j.errors, ...j.warnings, ...j.info].filter((i) => i.code === code);

describe('5-6. layout legacy: W066 is the one broken result, naming 3.0.x and the manual move', () => {
  let p;
  before(() => { p = planningProject({ layout: 'legacy' }); });
  after(() => p.cleanup());

  test('5. validate health --raw: status broken, one error W066, no other check ran', () => {
    const j = health(p);
    assert.equal(j.status, 'broken', JSON.stringify(j));
    assert.deepEqual(j.errors.map((i) => i.code), ['W066'], JSON.stringify(j.errors));
    assert.deepEqual(j.warnings, [], 'no other check ran');
    assert.deepEqual(j.info, [], 'no other check ran');
    assert.equal(j.repairable_count, 0);
    const [issue] = j.errors;
    assert.match(issue.message, /^legacy-planning-dir: /);
    assert.ok(issue.message.includes(`${OLD}/`), issue.message);
    for (const part of LAYOUT_FIX_PARTS) assert.ok(issue.fix.includes(part), `fix misses ${part}: ${issue.fix}`);
    assert.equal(RETIRED.test(`${issue.message} ${issue.fix}`), false, issue.fix);
    assert.equal(issue.repairable, false);
  });

  test('5b. validate health --repair --raw is the same report and repairs nothing', () => {
    const j = health(p, ['--repair']);
    assert.equal(j.status, 'broken');
    assert.deepEqual(j.errors.map((i) => i.code), ['W066']);
    assert.equal(j.repairs_performed, undefined);
  });

  test('6. init plan-objective 1 and init execute-objective 1 refuse with the same fix (TRD 78-07)', () => {
    for (const verb of ['plan-objective', 'execute-objective']) {
      const r = refused(p, p.run(['init', verb, '1']), `init ${verb}`);
      assert.ok(r.stderr.includes(`${OLD}/`), r.stderr);
      for (const part of LAYOUT_FIX_PARTS) assert.ok(r.stderr.includes(part), `stderr misses ${part}: ${r.stderr}`);
      assert.equal(RETIRED.test(r.stderr), false, r.stderr);
    }
  });

  test('6b. a read that reports W066 still creates no new directory', () => {
    assert.equal(exists(p.root, NEW), false, `${NEW} was created`);
  });
});

describe('7. layout both: W066 says the legacy directory is ignored', () => {
  let p;
  before(() => { p = planningProject({ layout: 'both' }); });
  after(() => p.cleanup());

  test('7. validate health --raw reports W066: both exist and the legacy one is ignored', () => {
    const found = w066(p);
    assert.equal(found.length, 1, JSON.stringify(found));
    assert.match(found[0].message, /^legacy-planning-dir: /);
    assert.ok(found[0].message.includes(`${NEW}/`) && found[0].message.includes(`${OLD}/`), found[0].message);
    assert.match(found[0].message, /both exist/);
    assert.match(found[0].message, /ignored/);
    assert.ok(found[0].fix.includes(`${NEW}/`), found[0].fix);
  });

  test('7b. a warning, never an error: W066 alone does not make the report broken', () => {
    const j = health(p);
    assert.equal(j.errors.some((i) => i.code === 'W066'), false, JSON.stringify(j.errors));
    assert.notEqual(j.status, 'broken', JSON.stringify(j.errors));
  });
});

describe('9. layout aoforge: W067 names the rename or the deletion', () => {
  const cases = [
    ['legacy', `rename the key to "${NAMES.configKey}"`],
    ['both', 'delete the pre-rename key'],
  ];
  for (const [configKey, fix] of cases) {
    test(`9. config key ${configKey} -> one W067 warning whose fix says "${fix}"`, () => {
      const p = planningProject({ layout: 'aoforge', configKey, git: false });
      try {
        const j = health(p);
        const found = issuesOf(j, 'W067');
        assert.equal(found.length, 1, JSON.stringify(found));
        assert.ok(j.warnings.includes(found[0]), 'a warning');
        assert.match(found[0].message, /^legacy-config-key: /);
        assert.ok(found[0].message.includes(`"${LEGACY.configKey}"`), found[0].message);
        assert.ok(found[0].fix.includes(fix), found[0].fix);
        assert.equal(RETIRED.test(`${found[0].message} ${found[0].fix}`), false, found[0].fix);
        assert.equal(found[0].repairable, false);
      } finally {
        p.cleanup();
      }
    });
  }

  test('9. only the new key -> no W067', () => {
    const p = planningProject({ layout: 'aoforge', configKey: 'aoforge', git: false });
    try {
      assert.deepEqual(issuesOf(health(p), 'W067'), []);
    } finally {
      p.cleanup();
    }
  });
});

describe('10. layout aoforge: W069 reports a CLAUDE.md block under the pre-rename markers', () => {
  test('10. a pre-rename block -> one W069 warning naming the marker rename and 3.0.x', () => {
    const p = planningProject({ layout: 'aoforge', claudeMd: 'legacy-block', git: false });
    try {
      const j = health(p);
      const found = issuesOf(j, 'W069');
      assert.equal(found.length, 1, JSON.stringify(found));
      assert.ok(j.warnings.includes(found[0]), 'a warning');
      assert.match(found[0].message, /^legacy-claude-md-block: CLAUDE\.md /);
      assert.ok(found[0].fix.includes(`<!-- ${LEGACY.blockTag}:START`) && found[0].fix.includes(NAMES.blockTag), found[0].fix);
      assert.ok(found[0].fix.includes('3.0.x'), found[0].fix);
      assert.equal(found[0].repairable, false);
    } finally {
      p.cleanup();
    }
  });

  test('10. an AOFORGE block or no CLAUDE.md -> no W069', () => {
    for (const claudeMd of ['aoforge-block', null]) {
      const p = planningProject({ layout: 'aoforge', claudeMd, git: false });
      try {
        assert.deepEqual(issuesOf(health(p), 'W069'), [], String(claudeMd));
      } finally {
        p.cleanup();
      }
    }
  });
});

describe('8. layout aoforge: no W066', () => {
  let p;
  before(() => { p = planningProject({ layout: 'aoforge' }); });
  after(() => p.cleanup());

  test('8. validate health --raw has no W066 and init plan-objective carries no W066 line', () => {
    assert.deepEqual(w066(p), []);
    const j = json(p.run(['init', 'plan-objective', '1']), 'init plan-objective');
    assert.deepEqual(j.advisories_warnings.filter((l) => l.startsWith('W066 ')), []);
  });
});
