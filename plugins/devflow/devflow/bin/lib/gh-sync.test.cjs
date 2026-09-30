'use strict';

// gh-sync.test.cjs (TRD 46-07) — `gh sync <objective>` rebuilt on the wave-1/2 foundations.
//
// Every test runs against the stateful gh-fake (46-05), installed through gh._setRunGh (which must
// also install it on the gh-client seam), with a fake clock so write pacing never really sleeps.
// HOME and DEVFLOW_GH_CACHE_DIR point at temp dirs: no real GitHub, no real ~/.claude.

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const gh = require('./gh.cjs');
const client = require('./gh-client.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { getLastSync } = require('./sync-state.cjs');

const MAPPING = (root) => path.join(root, '.planning', '.gh-mapping.json');
const OBJ_MD = (root, dir) => path.join(root, '.planning', 'objectives', dir, 'OBJECTIVE.md');

const ROADMAP = [
  '# Roadmap',
  '',
  '## Objectives',
  '',
  '### Objective 2: a',
  '**Goal:** Build a',
  '',
  '**Success Criteria** (what must be TRUE):',
  '  1. a works',
  '',
  '### Objective 2.1: b',
  '**Goal:** Build b',
  '',
].join('\n');

const OBJ_A = [
  '---',
  'objective: 02-a',
  'milestone: v1.4',
  '# a comment the setter must keep',
  '---',
  '',
  '# Objective 2: a',
  '',
].join('\n');

const OBJ_B = ['---', 'objective: 02.1-b', '---', '', '# Objective 2.1: b', ''].join('\n');

function buildProject({ enabled = true, orgProject = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-sync-'));
  const planning = path.join(root, '.planning');
  fs.mkdirSync(path.join(planning, 'objectives', '02-a'), { recursive: true });
  fs.mkdirSync(path.join(planning, 'objectives', '02.1-b'), { recursive: true });
  fs.writeFileSync(path.join(planning, 'config.json'), JSON.stringify({ github: { enabled, repo: 'o/r' } }, null, 2));
  fs.writeFileSync(path.join(planning, 'ROADMAP.md'), ROADMAP);
  const projectFm = orgProject ? `---\norg_project: ${orgProject}\n---\n\n` : '';
  fs.writeFileSync(path.join(planning, 'PROJECT.md'), `${projectFm}# Demo\n`);
  const a = path.join(planning, 'objectives', '02-a');
  fs.writeFileSync(path.join(a, 'OBJECTIVE.md'), OBJ_A);
  fs.writeFileSync(path.join(a, '02-01-first-TRD.md'), '---\nwave: 1\n---\n# first\n');
  fs.writeFileSync(path.join(a, '02-02-second-TRD.md'), '---\nwave: 2\n---\n# second\n');
  fs.writeFileSync(path.join(a, '02-01-SUMMARY.md'), '# first summary\n');
  fs.writeFileSync(OBJ_MD(root, '02.1-b'), OBJ_B);
  return root;
}

// Fake clock: sleep advances now, so pacing is observable without waiting.
let clock;
let tmpHome;
let savedEnv;
let fake;
let root;

function install(opts = {}) {
  fake = createFakeGitHub(opts);
  gh._setRunGh(fake.runGh);
  return fake;
}

beforeEach(() => {
  clock = Date.UTC(2026, 8, 30, 12, 0, 0);
  client._resetClient();
  client._setNow(() => clock);
  client._setSleep((ms) => { clock += ms; });
  gh._resetCache();
  savedEnv = { HOME: process.env.HOME, DEVFLOW_GH_CACHE_DIR: process.env.DEVFLOW_GH_CACHE_DIR };
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-sync-home-'));
  process.env.HOME = tmpHome;
  process.env.DEVFLOW_GH_CACHE_DIR = path.join(tmpHome, 'gh-cache');
  root = buildProject();
});

afterEach(() => {
  // Test 12: no argv element anywhere is a stringified object.
  if (fake) {
    for (const argv of fake.calls()) {
      for (const a of argv) assert.ok(!String(a).includes('[object Object]'), `argv carries [object Object]: ${argv.join(' ')}`);
    }
  }
  fake = null;
  gh._setRunGh(null);
  client._resetClient();
  client._setNow(null);
  client._setSleep(null);
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const writesOf = (f, verb) => f.writes().filter((a) => a[0] === 'issue' && a[1] === verb);
const commentPatches = (f) => f.writes().filter((a) => a[0] === 'api' && /issues\/comments\/\d+$/.test(a[1]) && a.includes('PATCH'));
const readMapping = (r) => JSON.parse(fs.readFileSync(MAPPING(r), 'utf-8'));
const issue = (n) => fake.issues.find((i) => i.number === n);

describe('syncObjective (46-07)', () => {
  test('1: github.enabled:false → skipped:true with zero gh calls', () => {
    const r0 = buildProject({ enabled: false });
    install();
    const r = gh.syncObjective('2', r0);
    assert.equal(r.skipped, true);
    assert.equal(r.ok, false);
    assert.deepEqual(fake.calls(), []);
  });

  test('2: first sync creates one issue carrying the marker and all four managed sections', () => {
    install();
    const r = gh.syncObjective('02-a', root);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.created, true);
    assert.equal(r.issue_number, 1);
    assert.equal(r.issue_source, 'created');
    const creates = writesOf(fake, 'create');
    assert.equal(creates.length, 1);
    const argv = creates[0];
    const body = argv[argv.indexOf('--body') + 1];
    assert.ok(body.startsWith('<!-- devflow:id=2 -->'), body);
    for (const name of ['summary', 'criteria', 'trds', 'footer']) {
      assert.ok(body.includes(`<!-- devflow:begin ${name} -->`), `missing section ${name}`);
      assert.ok(body.includes(`<!-- devflow:end ${name} -->`), `missing section end ${name}`);
    }
    assert.equal(argv[argv.indexOf('--title') + 1], '[Objective 2] a');
    assert.equal(argv[argv.indexOf('--milestone') + 1], 'v1.4');
    assert.equal(writesOf(fake, 'edit').length, 0, 'a created issue needs no edit');
  });

  test('3: write-back, v3 mapping keyed by id with verified_at, sync-state under the same id', () => {
    install();
    const before = fs.readFileSync(OBJ_MD(root, '02-a'), 'utf-8');
    const r = gh.syncObjective('2', root);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.frontmatter_written, true);
    assert.equal(r.mapping_written, true);
    const after = fs.readFileSync(OBJ_MD(root, '02-a'), 'utf-8');
    assert.match(after, /^github_issue: o\/r#1$/m);
    // Every other line survives byte for byte.
    assert.equal(after.split('\n').filter((l) => !l.startsWith('github_issue:')).join('\n'), before);

    const m = readMapping(root);
    assert.equal(m.version, 3);
    const e = m.objectives['2'];
    assert.equal(e.issue_id, 1);
    assert.ok(Number.isInteger(e.state_comment_id) && e.state_comment_id > 0, JSON.stringify(e));
    assert.equal(e.state_comment_id, r.comment_id);
    assert.match(e.verified_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(Number.isInteger(m.milestones['v1.4']));
    assert.equal(Object.keys(m.objectives).length, 1);
    assert.ok(getLastSync(root, '2'), 'sync-state recorded under id 2');
    const comment = fake.comments.find((c) => c.id === e.state_comment_id);
    assert.ok(comment.body.startsWith('<!-- devflow:id=2 kind=state -->'), comment.body);
  });

  test('4: every spelling of objective 2 updates #1; 2.1 creates #2 and never touches #1', () => {
    install();
    assert.equal(gh.syncObjective('2', root).issue_number, 1);
    for (const spelling of ['2', '02', '02-a']) {
      const r = gh.syncObjective(spelling, root);
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.equal(r.issue_number, 1, spelling);
      assert.equal(r.created, false, spelling);
    }
    const mark = fake.calls().length;
    const b = gh.syncObjective('2.1', root);
    assert.equal(b.ok, true, JSON.stringify(b));
    assert.equal(b.issue_number, 2);
    assert.equal(b.created, true);
    const later = fake.writes().filter((argv) => fake.calls().indexOf(argv) >= mark);
    for (const argv of later) {
      const joined = argv.join(' ');
      assert.ok(!/issue (edit|comment|close) 1 /.test(joined) && !/issues\/1\//.test(joined), `touched #1: ${joined}`);
    }
    assert.equal(issue(1).title, '[Objective 2] a');
    assert.equal(issue(2).title, '[Objective 2.1] b');
    assert.equal(fake.issues.length, 2);
  });

  test('5: a second sync with no state change performs no writes', () => {
    install();
    gh.syncObjective('2', root);
    const before = fake.writes().length;
    const r = gh.syncObjective('2', root);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.issue_updated, false);
    assert.equal(r.comment_action, 'unchanged');
    assert.deepEqual(fake.writes().slice(before), []);
    assert.equal(commentPatches(fake).length, 0);
  });

  test('6 (SC3): human text outside managed sections survives; a no-change resync does not edit', () => {
    install();
    gh.syncObjective('2', root);
    const orig = issue(1).body;
    const human = orig
      .replace('<!-- devflow:begin summary -->', 'HUMAN ABOVE\n\n<!-- devflow:begin summary -->')
      .replace('<!-- devflow:end criteria -->', '<!-- devflow:end criteria -->\n\nHUMAN BETWEEN')
      .concat('\n\nHUMAN BELOW\n');
    fake.humanEditBody(1, human);
    fs.writeFileSync(path.join(root, '.planning', 'objectives', '02-a', '02-02-SUMMARY.md'), '# second summary\n');

    const r1 = gh.syncObjective('2', root);
    assert.equal(r1.ok, true, JSON.stringify(r1));
    assert.equal(r1.issue_updated, true);
    const body = issue(1).body;
    assert.ok(body.includes('HUMAN ABOVE\n\n<!-- devflow:begin summary -->'));
    assert.ok(body.includes('<!-- devflow:end criteria -->\n\nHUMAN BETWEEN'));
    assert.ok(body.endsWith('\n\nHUMAN BELOW\n'), JSON.stringify(body.slice(-40)));
    assert.match(body, /- \[x\] 02-02-second-TRD\.md/);
    // Human text is byte-identical: strip the managed sections and compare.
    const strip = (b) => b.replace(/<!-- devflow:begin (\w+) -->[\s\S]*?<!-- devflow:end \1 -->/g, '§');
    assert.equal(strip(body), strip(human));

    const edits = writesOf(fake, 'edit').length;
    const r2 = gh.syncObjective('2', root);
    assert.equal(r2.ok, true);
    assert.equal(writesOf(fake, 'edit').length, edits, 'second sync must not edit');
  });

  test('7: a differing human github_issue is kept and reported as frontmatter_conflict', () => {
    install();
    gh.syncObjective('2', root);
    const file = OBJ_MD(root, '02-a');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace('github_issue: o/r#1', 'github_issue: o/r#9'));
    const r = gh.syncObjective('2', root);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.issue_number, 1);
    assert.equal(r.frontmatter_written, false);
    assert.ok(r.warnings.some((w) => /^frontmatter_conflict/.test(w)), JSON.stringify(r.warnings));
    assert.match(fs.readFileSync(file, 'utf-8'), /^github_issue: o\/r#9$/m);
  });

  test('8: legacy v2 mapping + unmarked body + legacy sticky on page 2 → marker added, comment PATCHed, v3 mapping', () => {
    install({ commentPageSize: 2 });
    const LEGACY = '## Objective 2: a\n\nOld generated body text.';
    const n = fake.seedIssue({ title: '[Objective 2] a', body: LEGACY, labels: ['devflow:objective'] });
    assert.equal(n, 1);
    fake.seedComment(1, 'first human comment');
    fake.seedComment(1, 'second human comment');
    const sticky = fake.seedComment(1, '<!-- df:state -->\n**DevFlow state — last synced 2020-01-01T00:00:00Z**');
    fs.writeFileSync(MAPPING(root), JSON.stringify({ objectives: { 2: { issue_id: 1, state_comment_id: sticky } } }));

    const r = gh.syncObjective('2', root);
    assert.equal(r.ok, true, JSON.stringify(r));
    const body = issue(1).body;
    assert.ok(body.startsWith('<!-- devflow:id=2 -->'), body);
    assert.ok(body.includes('Old generated body text.'), 'legacy text kept');
    assert.ok(body.indexOf('Old generated body text.') < body.indexOf('<!-- devflow:begin summary -->'), 'sections appended below');
    assert.equal(commentPatches(fake).length, 1);
    assert.ok(commentPatches(fake)[0][1].endsWith(`/comments/${sticky}`));
    assert.equal(fake.writes().filter((a) => a[0] === 'api' && /issues\/1\/comments$/.test(a[1])).length, 0, 'no new comment');
    assert.equal(fake.writes().filter((a) => a[0] === 'issue' && a[1] === 'comment').length, 0, 'no new comment');
    assert.equal(r.comment_id, sticky);
    const m = readMapping(root);
    assert.equal(m.version, 3);
    assert.equal(m.objectives['2'].issue_id, 1);
    assert.equal(m.objectives['2'].state_comment_id, sticky);
    assert.match(m.objectives['2'].verified_at, /^\d{4}-/);
  });

  test('9 (SC2): mapping file lost → found again by frontmatter/marker, zero creates', () => {
    install();
    gh.syncObjective('2', root);
    fs.unlinkSync(MAPPING(root));
    const creates = writesOf(fake, 'create').length;
    const r = gh.syncObjective('2', root);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.issue_number, 1);
    assert.equal(r.created, false);
    assert.equal(writesOf(fake, 'create').length, creates);
    assert.equal(fake.issues.length, 1);
    assert.equal(readMapping(root).objectives['2'].issue_id, 1);
  });

  test('9b: gh-issue errors (duplicate_marker) stop the sync and write nothing', () => {
    install();
    fake.seedIssue({ title: '[Objective 2] a', body: '<!-- devflow:id=2 -->\none', labels: ['devflow:objective'] });
    fake.seedIssue({ title: '[Objective 2] a', body: '<!-- devflow:id=2 -->\ntwo', labels: ['devflow:objective'] });
    const r = gh.syncObjective('2', root);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'duplicate_marker');
    assert.deepEqual(r.issues, [1, 2]);
    assert.equal(fs.existsSync(MAPPING(root)), false);
    assert.deepEqual(fake.writes(), []);
  });

  test('9c: unknown objective → not found error', () => {
    install();
    const r = gh.syncObjective('77', root);
    assert.equal(r.ok, false);
    assert.match(r.error, /objective not found: 77/);
  });
});

describe('readObjectiveState TRD/SUMMARY pairing (test 13)', () => {
  test('13: slugged TRD names pair with plain and slugged SUMMARY names by id prefix', () => {
    const dir = path.join(root, '.planning', 'objectives', '02-a');
    fs.writeFileSync(path.join(dir, '02-03-third-TRD.md'), '# third\n');
    fs.writeFileSync(path.join(dir, '02-03-third-SUMMARY.md'), '# third summary\n');
    const s = gh.readObjectiveState('02-a', root);
    assert.equal(s.trd_total, 3);
    assert.equal(s.trd_done, 2);
    assert.deepEqual(s.trds.map((t) => [t.name, t.done]), [
      ['02-01-first-TRD.md', true],
      ['02-02-second-TRD.md', false],
      ['02-03-third-TRD.md', true],
    ]);
    assert.equal(s.number, '2');
    assert.equal(s.name, 'a');
  });

  test('13b: a decimal objective reads its own ROADMAP entry, not the integer one', () => {
    const s = gh.readObjectiveState('02.1-b', root);
    assert.equal(s.number, '2.1');
    assert.equal(s.name, 'b');
  });
});

describe('gh seam (test 14)', () => {
  test('14: gh._setRunGh installs on gh-client; gh-pull no longer bridges', () => {
    const seen = [];
    gh._setRunGh((argv) => { seen.push(argv); return { ok: true, status: 0, stdout: 'fake', stderr: '' }; });
    const r = client.ghRead(['--version']);
    assert.equal(r.stdout, 'fake');
    assert.deepEqual(seen, [['--version']]);
    const pullSrc = fs.readFileSync(path.join(__dirname, 'gh-pull.cjs'), 'utf-8');
    assert.ok(!/ghSetRunGh|runGhBridge|_setRunGh: /.test(pullSrc), 'gh-pull must not bridge gh.cjs');
  });

  test('14b: gh._runGh forwards to gh-client', () => {
    install();
    const r = gh._runGh(['--version']);
    assert.match(r.stdout, /gh version/);
  });
});

// ─── Task 2: Project fields from discovery, pacing, no fixture reads (tests 10, 11, 15, 16) ──────

const CASSETTE = JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__', 'gh-cassettes', 'product-roadmap-fields.json'), 'utf-8'));
const optionId = (field, name) => CASSETTE.fields.find((f) => f.name === field).options.find((o) => o.name === name).id;
const queryOf = (argv) => (argv.find((a) => String(a).startsWith('query=')) || '').slice('query='.length);

// A whole mocked board, answered through the fake's graphql handler; the cassette is test data only.
function boardGraphql() {
  return (argv) => {
    const q = queryOf(argv);
    if (q.includes('addProjectV2ItemById')) return JSON.stringify({ data: { addProjectV2ItemById: { item: { id: 'item_1' } } } });
    if (q.includes('updateProjectV2ItemFieldValue')) return JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'item_1' } } } });
    if (q.includes('projectItems')) return JSON.stringify({ data: { repository: { issue: { projectItems: { nodes: [] } } } } });
    if (q.includes('repository(')) return JSON.stringify({ data: { repository: { issue: { id: 'I_1' } } } });
    const nodes = CASSETTE.fields.map((f) => ({ __typename: f.type, id: f.id, name: f.name, ...(f.options ? { options: f.options.slice() } : {}) }));
    return JSON.stringify({ data: { node: { fields: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } } });
  };
}
const graphqlCalls = (f) => f.calls().filter((a) => a[0] === 'api' && a[1] === 'graphql');
const isDiscovery = (argv) => {
  const q = queryOf(argv);
  return !/addProjectV2ItemById|updateProjectV2ItemFieldValue|projectItems|repository\(/.test(q);
};

describe('project fields (test 10)', () => {
  test('10a: org_project → fields from live discovery (cached out of repo), Status In Progress applied', () => {
    root = buildProject({ orgProject: 'PVT_x' });
    install({ graphql: boardGraphql() });
    const r = gh.syncObjective('2', root);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.project_fields_updated, ['Status']);
    assert.ok(graphqlCalls(fake).some(isDiscovery), 'a discovery query ran');
    const update = graphqlCalls(fake).find((a) => queryOf(a).includes('updateProjectV2ItemFieldValue'));
    assert.ok(update.includes(`optionId=${optionId('Status', 'In Progress')}`), update.join(' '));
    assert.ok(fs.existsSync(path.join(process.env.DEVFLOW_GH_CACHE_DIR, 'PVT_x.json')), 'discovery cached under DEVFLOW_GH_CACHE_DIR');
  });

  test('10b: org_project without project scopes → GhAuthError naming the missing scopes', () => {
    root = buildProject({ orgProject: 'PVT_x' });
    install({ scopes: ['repo'], graphql: boardGraphql() });
    assert.throws(() => gh.syncObjective('2', root), (e) => e.name === 'GhAuthError' && e.scopes_missing.includes('project'));
    assert.deepEqual(fake.writes(), []);
  });

  test('10c: no org_project → only repo scope required, zero GraphQL calls', () => {
    install({ scopes: ['repo'] });
    const r = gh.syncObjective('2', root);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.project_fields_updated, []);
    assert.deepEqual(graphqlCalls(fake), []);
  });

  test('10d: an unknown Quarter option is a warning, not a failure', () => {
    install({ graphql: boardGraphql() });
    const r = gh.updateProjectFields('o/r#1', 'PVT_x', { Status: 'Done', Quarter: 'Q9 2099' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.fields_updated, ['Status']);
    assert.ok((r.warnings || []).some((w) => w.includes('Q9 2099')), JSON.stringify(r.warnings));
    assert.ok(graphqlCalls(fake).some(isDiscovery), 'options come from discovery');
  });

  test('10e: a project-field failure leaves the sync ok:true with a warning', () => {
    root = buildProject({ orgProject: 'PVT_x' });
    install({ graphql: () => ({ ok: false, status: 1, stdout: '', stderr: 'HTTP 502' }) });
    const r = gh.syncObjective('2', root);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.project_fields_updated, []);
    assert.ok(r.warnings.some((w) => /project fields not updated/.test(w)), JSON.stringify(r.warnings));
  });
});

describe('write pacing (test 11)', () => {
  test('11: every write reaches gh ≥ 1000 ms after the previous one on the fake clock', () => {
    const f = createFakeGitHub();
    fake = f;
    const stamps = [];
    gh._setRunGh((argv) => {
      if (client.isWriteArgs(argv)) stamps.push(clock);
      return f.runGh(argv);
    });
    gh.syncObjective('2', root);
    fs.writeFileSync(path.join(root, '.planning', 'objectives', '02-a', '02-02-SUMMARY.md'), '# second\n');
    gh.syncObjective('2', root);
    gh.syncObjective('2.1', root);
    assert.ok(stamps.length >= 8, `expected label/milestone/create/comment + edit/PATCH + create writes, got ${stamps.length}`);
    for (let i = 1; i < stamps.length; i++) {
      assert.ok(stamps[i] - stamps[i - 1] >= client.MIN_WRITE_INTERVAL_MS, `write ${i} only ${stamps[i] - stamps[i - 1]} ms after the previous`);
    }
  });
});

describe('no fixture reads at runtime (test 15)', () => {
  test('15: gh.cjs has no __fixtures__ path and no hardcoded board id; PRODUCT_ROADMAP_FIELDS is a frozen stub', () => {
    const src = fs.readFileSync(path.join(__dirname, 'gh.cjs'), 'utf-8');
    assert.ok(!src.includes('__fixtures__'), 'gh.cjs must not reference __fixtures__');
    assert.ok(!src.includes('PVT_kwDODwqLrc4BRsOP'), 'gh.cjs must not hardcode a project node id');
    assert.equal(gh.PRODUCT_ROADMAP_FIELDS._captured, false);
    assert.ok(Object.isFrozen(gh.PRODUCT_ROADMAP_FIELDS));
    assert.equal(gh.PRODUCT_ROADMAP_FIELDS._project_id, undefined);
  });
});
