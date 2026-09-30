'use strict';

// gh-project.test.cjs — Test list (TRD 46-04, GSF-07)
//
// discoverProjectFields (GraphQL, dependency-injected `run`):
//   D1: single page -> model { project_id, fetched_at, fields } built from the cassette shape
//   D2: two pages follow pageInfo (second call carries cursor=c1); runaway loop stops at 20 pages
//   D3: iteration field -> kind 'iteration', iterations { title: id }
//   D4: GraphQL errors / gh failure / unparseable / null node / throwing run -> { ok:false }, never throws
//
// cache + getProjectFields:
//   G1: miss -> one discovery + cache file under DEVFLOW_GH_CACHE_DIR; fresh hit -> zero run calls
//   G2: expired cache rediscovers; ttlMinutes overrides the 360 default
//   G3: corrupt cache JSON, or a cache for a different project id, is a miss and is overwritten
//   G4: refresh:true forces discovery; an unwritable cache dir is a warning, not a failure
//
// resolveFieldValue / refresh-once / updateItemFields:
//   R1 (7):  resolveFieldValue present -> { fieldId, value:{ singleSelectOptionId } }; absent -> null
//   R2 (8):  wanted option missing from a fresh cache -> exactly one refresh; still missing -> warning
//   U1 (9):  add-item first, then one mutation per resolvable field; unknown option -> warning
//   U2 (10): iteration field mutation uses iterationId
//   U3 (11): unknown field -> warning `unknown field: <name>`, no mutation
//
// repo guard:
//   X1 (12): gh-project.cjs itself never mentions the fixtures directory; the repo-wide check is a
//            todo until 46-07 removes the cassette read from gh.cjs

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const gp = require('./gh-project.cjs');

// The cassette is test data only: the tests use it to build a mocked GraphQL response,
// the module under test never reads it.
const cassette = JSON.parse(
  fs.readFileSync(path.join(__dirname, '__fixtures__', 'gh-cassettes', 'product-roadmap-fields.json'), 'utf-8'),
);

const T0 = Date.UTC(2026, 8, 30, 12, 0, 0);
const MIN = 60 * 1000;

function cassetteNodes(extra = {}) {
  return cassette.fields.map((f) => {
    const node = {
      __typename: f.type,
      id: f.id,
      name: f.name,
      ...(f.options ? { options: f.options.slice() } : {}),
    };
    if (extra[f.name]) node.options = node.options.concat(extra[f.name]);
    return node;
  });
}

function gqlPage(nodes, { hasNextPage = false, endCursor = null } = {}) {
  return JSON.stringify({ data: { node: { fields: { pageInfo: { hasNextPage, endCursor }, nodes } } } });
}

// Recorded fake gh. handler(args, callNumber) returns either a stdout string or a full result object.
function fakeRun(handler) {
  const calls = [];
  const run = (args) => {
    calls.push(args);
    const out = handler(args, calls.length);
    if (out && typeof out === 'object') return out;
    return { ok: true, status: 0, stdout: out, stderr: '' };
  };
  run.calls = calls;
  return run;
}

function singlePageRun(extra) {
  return fakeRun(() => gqlPage(cassetteNodes(extra)));
}

let cacheRoot;
let env;

beforeEach(() => {
  cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-project-test-'));
  env = { DEVFLOW_GH_CACHE_DIR: cacheRoot };
});

afterEach(() => {
  fs.rmSync(cacheRoot, { recursive: true, force: true });
});

describe('discoverProjectFields', () => {
  test('D1: single page builds the field model', () => {
    const run = singlePageRun();
    const r = gp.discoverProjectFields('PVT_x', { run, now: () => T0 });

    assert.equal(r.ok, true);
    assert.equal(r.model.project_id, 'PVT_x');
    assert.equal(r.model.fetched_at, new Date(T0).toISOString());
    assert.equal(Object.keys(r.model.fields).length, cassette.fields.length);
    assert.deepEqual(r.model.fields.Status, {
      id: 'PVTSSF_lADODwqLrc4BRsOPzg_cgIo',
      kind: 'single_select',
      options: { Todo: 'f75ad846', 'In Progress': '47fc9ee4', Done: '98236657' },
    });
    assert.deepEqual(r.model.fields.Title, { id: 'PVTF_lADODwqLrc4BRsOPzg_cgIg', kind: 'field' });
    assert.equal(r.model.fields.Quarter.options['Q1 2026'], '1337a094');

    // one request, addressed by node id, with no cursor on the first page
    assert.equal(run.calls.length, 1);
    const args = run.calls[0];
    assert.deepEqual(args.slice(0, 3), ['api', 'graphql', '-f']);
    assert.ok(args[3].startsWith('query='));
    assert.ok(args.includes('id=PVT_x'));
    assert.ok(!args.some((a) => a.startsWith('cursor=')));
  });

  test('D1b: the query only asks for verified schema fields', () => {
    const run = singlePageRun();
    gp.discoverProjectFields('PVT_x', { run, now: () => T0 });
    const query = run.calls[0][3];
    for (const banned of ['dataType', 'duration', 'completedIterations']) {
      assert.ok(!query.includes(banned), `query must not request ${banned}`);
    }
    assert.ok(query.includes('pageInfo'));
    assert.ok(query.includes('ProjectV2IterationField'));
  });

  test('D2: follows pageInfo across two pages', () => {
    const all = cassetteNodes();
    const run = fakeRun((args, n) => (n === 1
      ? gqlPage(all.slice(0, 5), { hasNextPage: true, endCursor: 'c1' })
      : gqlPage(all.slice(5), { hasNextPage: false, endCursor: null })));
    const r = gp.discoverProjectFields('PVT_x', { run, now: () => T0 });

    assert.equal(r.ok, true);
    assert.equal(run.calls.length, 2);
    assert.ok(!run.calls[0].some((a) => a.startsWith('cursor=')));
    assert.ok(run.calls[1].includes('cursor=c1'));
    assert.equal(Object.keys(r.model.fields).length, cassette.fields.length);
    assert.ok(r.model.fields.Title, 'field from page one');
    assert.ok(r.model.fields.Quarter, 'field from page two');
  });

  test('D2b: a runaway hasNextPage loop stops at 20 pages without caching a partial model', () => {
    const run = fakeRun((args, n) => gqlPage([], { hasNextPage: true, endCursor: `c${n}` }));
    const r = gp.discoverProjectFields('PVT_x', { run, now: () => T0 });

    assert.equal(r.ok, false);
    assert.equal(run.calls.length, 20);
    assert.match(r.error, /20 pages/);
  });

  test('D3: iteration field resolves titles to ids', () => {
    const run = fakeRun(() => gqlPage([
      {
        __typename: 'ProjectV2IterationField',
        id: 'PVTIF_sprint',
        name: 'Sprint',
        configuration: { iterations: [
          { id: 'it_5', title: 'Sprint 5', startDate: '2026-09-01' },
          { id: 'it_6', title: 'Sprint 6', startDate: '2026-09-15' },
        ] },
      },
    ]));
    const r = gp.discoverProjectFields('PVT_x', { run, now: () => T0 });

    assert.equal(r.ok, true);
    assert.deepEqual(r.model.fields.Sprint, {
      id: 'PVTIF_sprint',
      kind: 'iteration',
      iterations: { 'Sprint 5': 'it_5', 'Sprint 6': 'it_6' },
    });
  });

  test('D4: GraphQL errors and gh failures are { ok:false }, never a throw', () => {
    const cases = {
      'errors payload': () => JSON.stringify({ errors: [{ type: 'NOT_FOUND', message: 'Could not resolve to a node' }] }),
      'gh exit non-zero': () => ({ ok: false, status: 1, stdout: '', stderr: 'HTTP 401: Bad credentials' }),
      'unparseable stdout': () => 'not json at all',
      'null node': () => JSON.stringify({ data: { node: null } }),
      'throwing run': () => { throw new Error('spawn gh ENOENT'); },
    };
    for (const [label, handler] of Object.entries(cases)) {
      const r = gp.discoverProjectFields('PVT_x', { run: fakeRun(handler), now: () => T0 });
      assert.equal(r.ok, false, label);
      assert.equal(typeof r.error, 'string', label);
      assert.ok(r.error.length > 0, label);
    }
    const scoped = gp.discoverProjectFields('PVT_x', {
      run: fakeRun(() => JSON.stringify({ errors: [{ message: 'Could not resolve to a node' }] })),
      now: () => T0,
    });
    assert.match(scoped.error, /Could not resolve to a node/);
  });
});

describe('cache location', () => {
  test('cacheDir honours DEVFLOW_GH_CACHE_DIR and defaults out of the repo', () => {
    assert.equal(gp.cacheDir({ DEVFLOW_GH_CACHE_DIR: '/somewhere/else' }), '/somewhere/else');
    const def = gp.cacheDir({});
    assert.equal(def, path.join(os.homedir(), '.claude', 'devflow', 'state', 'gh-project'));
    assert.ok(!def.includes('.planning'));
    assert.equal(gp.DEFAULT_TTL_MINUTES, 360);
  });

  test('writeCache sanitises the project id into the file name and readCache round-trips', () => {
    const model = { project_id: 'PVT_a/b:c', fetched_at: new Date(T0).toISOString(), fields: {} };
    const w = gp.writeCache('PVT_a/b:c', model, { env });
    assert.equal(w.ok, true);
    assert.equal(path.basename(w.file), 'PVT_a_b_c.json');
    assert.equal(path.dirname(w.file), cacheRoot);
    assert.deepEqual(gp.readCache('PVT_a/b:c', { env }), model);
    assert.equal(gp.readCache('PVT_never', { env }), null);
  });
});

describe('getProjectFields', () => {
  test('G1: a miss discovers once and caches; a fresh hit makes zero gh calls', () => {
    const run = singlePageRun();
    const first = gp.getProjectFields('PVT_x', { run, env, now: () => T0 });

    assert.equal(first.ok, true);
    assert.equal(first.source, 'github');
    assert.deepEqual(first.warnings, []);
    assert.equal(run.calls.length, 1);

    const file = path.join(cacheRoot, 'PVT_x.json');
    assert.ok(fs.existsSync(file), 'cache file written under DEVFLOW_GH_CACHE_DIR');
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf-8')).project_id, 'PVT_x');

    const second = gp.getProjectFields('PVT_x', { run, env, now: () => T0 + 5 * MIN });
    assert.equal(second.ok, true);
    assert.equal(second.source, 'cache');
    assert.equal(run.calls.length, 1, 'fresh cache must not call gh');
    assert.deepEqual(second.model, first.model);
  });

  test('G2: an expired cache rediscovers', () => {
    const run = singlePageRun();
    gp.getProjectFields('PVT_x', { run, env, now: () => T0 });
    assert.equal(run.calls.length, 1);

    // exactly at the TTL boundary is still fresh
    gp.getProjectFields('PVT_x', { run, env, now: () => T0 + 360 * MIN });
    assert.equal(run.calls.length, 1);

    const stale = gp.getProjectFields('PVT_x', { run, env, now: () => T0 + 361 * MIN });
    assert.equal(stale.source, 'github');
    assert.equal(run.calls.length, 2);
  });

  test('G2b: ttlMinutes overrides the default in both directions', () => {
    const run = singlePageRun();
    gp.getProjectFields('PVT_x', { run, env, now: () => T0 });

    gp.getProjectFields('PVT_x', { run, env, now: () => T0 + 361 * MIN, ttlMinutes: 1000 });
    assert.equal(run.calls.length, 1, 'still fresh under a 1000 minute TTL');

    gp.getProjectFields('PVT_x', { run, env, now: () => T0 + 11 * MIN, ttlMinutes: 10 });
    assert.equal(run.calls.length, 2, 'expired under a 10 minute TTL');
  });

  test('G3: a corrupt cache file is a miss and is overwritten', () => {
    fs.writeFileSync(path.join(cacheRoot, 'PVT_x.json'), '{ this is not json');
    const run = singlePageRun();
    const r = gp.getProjectFields('PVT_x', { run, env, now: () => T0 });

    assert.equal(r.ok, true);
    assert.equal(r.source, 'github');
    assert.equal(run.calls.length, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(cacheRoot, 'PVT_x.json'), 'utf-8')).project_id, 'PVT_x');
  });

  test('G3b: a cache file that belongs to another project id is a miss', () => {
    // 'PVT_a.b' and 'PVT_a_b' sanitise to the same file name
    gp.writeCache('PVT_a.b', { project_id: 'PVT_a.b', fetched_at: new Date(T0).toISOString(), fields: {} }, { env });
    assert.equal(gp.readCache('PVT_a_b', { env }), null);
  });

  test('G4: refresh:true forces discovery even on a fresh cache', () => {
    const run = singlePageRun();
    gp.getProjectFields('PVT_x', { run, env, now: () => T0 });
    const r = gp.getProjectFields('PVT_x', { run, env, now: () => T0 + MIN, refresh: true });
    assert.equal(r.source, 'github');
    assert.equal(run.calls.length, 2);
  });

  test('G4b: an unwritable cache dir is a warning, not a failure', () => {
    const blocker = path.join(cacheRoot, 'is-a-file');
    fs.writeFileSync(blocker, 'x');
    const badEnv = { DEVFLOW_GH_CACHE_DIR: path.join(blocker, 'sub') };
    const r = gp.getProjectFields('PVT_x', { run: singlePageRun(), env: badEnv, now: () => T0 });

    assert.equal(r.ok, true);
    assert.ok(r.model.fields.Status);
    assert.ok(r.warnings.some((w) => /cache write failed/.test(w)), JSON.stringify(r.warnings));
  });

  test('G5: a discovery failure is { ok:false, warnings }, not a throw, and writes no cache', () => {
    const run = fakeRun(() => ({ ok: false, status: 1, stdout: '', stderr: 'missing required scopes [read:project]' }));
    const r = gp.getProjectFields('PVT_x', { run, env, now: () => T0 });

    assert.equal(r.ok, false);
    assert.match(r.error, /read:project/);
    assert.ok(Array.isArray(r.warnings));
    assert.equal(fs.existsSync(path.join(cacheRoot, 'PVT_x.json')), false);
  });
});

describe('repo guard (test 12)', () => {
  const libDir = __dirname;

  function nonTestSources(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__fixtures__' || entry.name === 'node_modules') continue;
        out.push(...nonTestSources(full));
      } else if (entry.name.endsWith('.cjs') && !entry.name.endsWith('.test.cjs')) {
        out.push(full);
      }
    }
    return out;
  }

  test('X1: gh-project.cjs never reads the fixtures directory or hardcodes a project id', () => {
    const src = fs.readFileSync(path.join(libDir, 'gh-project.cjs'), 'utf-8');
    assert.ok(!src.includes('__fixtures__'), 'module must not reference __fixtures__');
    assert.ok(!src.includes('PVT_kwDODwqLrc4BRsOP'), 'module must not hardcode a project node id');
    assert.ok(!src.includes('.planning'), 'cache must not live under .planning/');
  });

  test('X2: no lib/ module outside tests reads __fixtures__', { todo: 'enabled by 46-07' }, () => {
    const offenders = nonTestSources(libDir)
      .filter((file) => fs.readFileSync(file, 'utf-8').includes('__fixtures__'))
      .map((file) => path.relative(libDir, file));
    assert.deepEqual(offenders, []);
  });
});
