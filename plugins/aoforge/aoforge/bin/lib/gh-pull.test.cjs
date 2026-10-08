'use strict';

// gh-pull.test.cjs — Test list (TRD 21-01)
//
// fetchGhIssue:
//   F1: returns parsed issue JSON when gh succeeds
//   F2: returns null when gh exits 1 with "Could not resolve to an Issue"
//   F3: returns error object when gh exits with other failure
//
// detectDrift (pure logic, no IO):
//   D1: GH unchanged (updatedAt matches last_sync) → { drift: false, fields: {} }
//   D2: GH state OPEN → CLOSED, disk unchanged → { drift: true, fields: { status } }
//   D3: GH labels added, disk unchanged → { drift: true, fields: { labels } }
//   D4: First-time pull (no last_sync entry) → { drift: true, first_sync: true }
//   D5: GH changed AND disk changed → { drift: true, conflict_suspected: false (deferred to TRD 21-03) }
//
// applyDrift (writes OBJECTIVE.md):
//   A1: writes new status to frontmatter, preserves other keys
//   A2: writes new labels array to frontmatter
//   A3: refuses to apply when conflict_suspected: true
//   A4: refuses to apply when no last_sync state and not first_sync
//
// cmdGhPull (CLI orchestrator):
//   C1: no objective → exits 1 with usage message
//   C2: objective has no mapping → exits 1 with hint to run `gh sync-objectives`
//   C3: GH unchanged → exits 0 with no-drift message
//   C4: GH changed, no --apply → prints diff, exits 0 (drift reported, not written)
//   C5: GH changed, --apply, no conflict → writes OBJECTIVE.md, exits 0
//   C6: GH issue not found (404) → exits 1
//   C7: --raw flag emits JSON output

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ghPull = require('./gh-pull.cjs');
const fx = require('./__fixtures__/gh-pull-fixtures.cjs');

beforeEach(() => { ghPull._setRunGh(null); });
afterEach(() => { ghPull._setRunGh(null); });

describe('fetchGhIssue', () => {
  test('F1: returns parsed issue JSON when gh succeeds', () => {
    const cassette = fx.loadCassette('objective-open-no-drift');
    const responses = new Map([[cassette.args.join(' '), cassette.response]]);
    ghPull._setRunGh(fx.buildMockRunGh(responses));

    const issue = ghPull.fetchGhIssue('AO-Cyber-Systems/aoforge-claude#10');
    assert.strictEqual(issue.state, 'OPEN');
    assert.deepStrictEqual(issue.labels, [{ name: 'aoforge:objective', color: '0e8a16' }]);
    assert.strictEqual(issue.updatedAt, '2026-05-01T00:00:00Z');
  });

  test('F2: returns null when gh exits 1 with "Could not resolve to an Issue"', () => {
    const cassette = fx.loadCassette('objective-not-found');
    const responses = new Map([[cassette.args.join(' '), cassette.response]]);
    ghPull._setRunGh(fx.buildMockRunGh(responses));

    const issue = ghPull.fetchGhIssue('AO-Cyber-Systems/aoforge-claude#99999');
    assert.strictEqual(issue, null);
  });

  test('F3: returns error object when gh exits with other failure', () => {
    const responses = new Map([
      ['issue view 50 --repo AO-Cyber-Systems/aoforge-claude --json state,labels,assignees,milestone,updatedAt',
        { ok: false, status: 1, stdout: '', stderr: 'rate limit exceeded' }],
    ]);
    ghPull._setRunGh(fx.buildMockRunGh(responses));

    const issue = ghPull.fetchGhIssue('AO-Cyber-Systems/aoforge-claude#50');
    assert.strictEqual(issue._ok, false);
    assert.match(issue.error, /rate limit/);
  });
});

describe('detectDrift', () => {
  test('D1: GH unchanged (updatedAt matches last_sync) → { drift: false, fields: {} }', () => {
    const ghCassette = fx.loadCassette('objective-open-no-drift');
    const ghIssue = JSON.parse(ghCassette.response.stdout);
    const disk_fm = fx.buildDiskFrontmatter({ status: 'open', labels: ['aoforge:objective'] });
    const last_sync_state = fx.buildLastSyncState({
      gh_updated_at: '2026-05-01T00:00:00Z', // SAME as cassette updatedAt
      label_set: ['aoforge:objective'],
    });

    const r = ghPull.detectDrift({ disk_fm, gh_state: ghIssue, last_sync_state });
    assert.strictEqual(r.drift, false);
    assert.deepStrictEqual(r.fields, {});
    assert.strictEqual(r.first_sync, false);
  });

  test('D2: GH state OPEN → CLOSED, disk unchanged → { drift: true, fields: { status } }', () => {
    const ghCassette = fx.loadCassette('objective-closed-on-gh');
    const ghIssue = JSON.parse(ghCassette.response.stdout);
    const disk_fm = fx.buildDiskFrontmatter({ status: 'in_progress', labels: ['aoforge:objective'] });
    const last_sync_state = fx.buildLastSyncState({
      gh_updated_at: '2026-05-01T00:00:00Z', // OLDER than cassette updatedAt
      label_set: ['aoforge:objective'],
    });

    const r = ghPull.detectDrift({ disk_fm, gh_state: ghIssue, last_sync_state });
    assert.strictEqual(r.drift, true);
    assert.ok(r.fields.status, 'status drift expected');
    assert.strictEqual(r.fields.status.gh, 'done');
  });

  test('D3: GH labels added, disk unchanged → { drift: true, fields: { labels } }', () => {
    const ghCassette = fx.loadCassette('objective-relabeled-on-gh');
    const ghIssue = JSON.parse(ghCassette.response.stdout);
    const disk_fm = fx.buildDiskFrontmatter({ status: 'open', labels: ['aoforge:objective'] });
    const last_sync_state = fx.buildLastSyncState({
      gh_updated_at: '2026-05-01T00:00:00Z', // OLDER than cassette
      label_set: ['aoforge:objective'],
    });

    const r = ghPull.detectDrift({ disk_fm, gh_state: ghIssue, last_sync_state });
    assert.strictEqual(r.drift, true);
    assert.ok(r.fields.labels, 'labels drift expected');
    assert.deepStrictEqual(r.fields.labels.gh.sort(), ['aoforge:in-progress', 'aoforge:objective']);
  });

  test('D4: First-time pull (no last_sync entry) → { drift: true, first_sync: true }', () => {
    const ghCassette = fx.loadCassette('objective-open-no-drift');
    const ghIssue = JSON.parse(ghCassette.response.stdout);
    const disk_fm = fx.buildDiskFrontmatter({ status: 'open', labels: ['aoforge:objective'] });

    const r = ghPull.detectDrift({ disk_fm, gh_state: ghIssue, last_sync_state: null });
    assert.strictEqual(r.drift, true);
    assert.strictEqual(r.first_sync, true);
  });

  test('D5: GH changed → conflict_suspected stays false (deferred to TRD 21-03)', () => {
    const ghCassette = fx.loadCassette('objective-closed-on-gh');
    const ghIssue = JSON.parse(ghCassette.response.stdout);
    const disk_fm = fx.buildDiskFrontmatter({ status: 'in_progress' });
    const last_sync_state = fx.buildLastSyncState({
      gh_updated_at: '2026-05-01T00:00:00Z',
    });

    const r = ghPull.detectDrift({ disk_fm, gh_state: ghIssue, last_sync_state });
    assert.strictEqual(r.conflict_suspected, false);
  });
});

describe('applyDrift', () => {
  test('A1: writes new status to frontmatter, preserves other keys', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'in_progress', kind: 'plugin', work: 'feature', labels: ['aoforge:objective'] },
    });
    try {
      const ghCassette = fx.loadCassette('objective-closed-on-gh');
      const ghIssue = JSON.parse(ghCassette.response.stdout);
      const drift = {
        drift: true,
        first_sync: false,
        conflict_suspected: false,
        fields: { status: { disk: 'in_progress', gh: 'done' } },
      };

      const r = ghPull.applyDrift({
        projectRoot: project.root,
        objectiveId: project.objectiveId,
        drift,
        ghIssue,
        hasLastSync: true,
      });

      assert.strictEqual(r.ok, true);
      assert.deepStrictEqual(r.applied, { status: 'done' });
      // Verify file content updated + other keys preserved
      const content = fs.readFileSync(path.join(project.root, '.planning', 'objectives', project.objectiveId, 'OBJECTIVE.md'), 'utf-8');
      assert.match(content, /status: done/);
      assert.match(content, /kind: plugin/);
      assert.match(content, /work: feature/);
    } finally { project.cleanup(); }
  });

  test('A2: writes new labels array to frontmatter', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'open', labels: ['aoforge:objective'] },
    });
    try {
      const ghCassette = fx.loadCassette('objective-relabeled-on-gh');
      const ghIssue = JSON.parse(ghCassette.response.stdout);
      const drift = {
        drift: true, first_sync: false, conflict_suspected: false,
        fields: { labels: { disk: ['aoforge:objective'], gh: ['aoforge:objective', 'aoforge:in-progress'] } },
      };

      const r = ghPull.applyDrift({
        projectRoot: project.root,
        objectiveId: project.objectiveId,
        drift,
        ghIssue,
        hasLastSync: true,
      });

      assert.strictEqual(r.ok, true);
      const content = fs.readFileSync(path.join(project.root, '.planning', 'objectives', project.objectiveId, 'OBJECTIVE.md'), 'utf-8');
      assert.match(content, /aoforge:in-progress/);
    } finally { project.cleanup(); }
  });

  test('A3: refuses to apply when conflict_suspected: true', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'in_progress' },
    });
    try {
      const ghCassette = fx.loadCassette('objective-closed-on-gh');
      const ghIssue = JSON.parse(ghCassette.response.stdout);
      const drift = {
        drift: true, first_sync: false, conflict_suspected: true,
        fields: { status: { disk: 'in_progress', gh: 'done' } },
      };

      const r = ghPull.applyDrift({
        projectRoot: project.root,
        objectiveId: project.objectiveId,
        drift,
        ghIssue,
        hasLastSync: true,
      });

      assert.strictEqual(r.ok, false);
      assert.match(r.error, /Conflict suspected/);
    } finally { project.cleanup(); }
  });

  test('A4: refuses to apply when no last_sync state and not first_sync', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'in_progress' },
    });
    try {
      const ghCassette = fx.loadCassette('objective-closed-on-gh');
      const ghIssue = JSON.parse(ghCassette.response.stdout);
      const drift = {
        drift: true, first_sync: false, conflict_suspected: false,
        fields: { status: { disk: 'in_progress', gh: 'done' } },
      };

      const r = ghPull.applyDrift({
        projectRoot: project.root,
        objectiveId: project.objectiveId,
        drift,
        ghIssue,
        hasLastSync: false,
      });

      assert.strictEqual(r.ok, false);
      assert.match(r.error, /No prior sync state/);
    } finally { project.cleanup(); }
  });
});

describe('cmdGhPull (CLI orchestrator)', () => {
  // Capture stdout/stderr + process.exit for CLI tests
  function captureRun(fn) {
    const origStdout = process.stdout.write.bind(process.stdout);
    const origStderr = process.stderr.write.bind(process.stderr);
    const origExit = process.exit;
    let stdout = '', stderr = '', exitCode = null;
    process.stdout.write = (chunk) => { stdout += chunk; return true; };
    process.stderr.write = (chunk) => { stderr += chunk; return true; };
    process.exit = (code) => { exitCode = code; throw new Error('__exit__'); };
    try {
      try { fn(); } catch (e) { if (e.message !== '__exit__') throw e; }
    } finally {
      process.stdout.write = origStdout;
      process.stderr.write = origStderr;
      process.exit = origExit;
    }
    return { stdout, stderr, exitCode };
  }

  test('C1: no objective → exits 1 with usage message', () => {
    const project = fx.buildTempProject({ objectiveId: '01-foo' });
    try {
      const r = captureRun(() => ghPull.cmdGhPull(project.root, [], false));
      assert.strictEqual(r.exitCode, 1);
      assert.match(r.stderr, /Usage:/);
    } finally { project.cleanup(); }
  });

  test('C2: objective has no mapping → exits 1 with hint to run gh sync <id>', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'open' },
      mapping: { milestone_id: 0, objectives: {} }, // no entry for this objective
      projectFm: { github_repo: 'AO-Cyber-Systems/aoforge-claude' },
    });
    try {
      // Stub _runGh so requireGhAuth passes
      ghPull._setRunGh((args) => {
        if (args[0] === 'auth' && args[1] === 'status') {
          return { ok: true, status: 0, stdout: "github.com\n  - Logged in to github.com as fake-user\n  - Token scopes: 'repo'", stderr: '' };
        }
        return { ok: false, status: 1, stdout: '', stderr: 'unexpected' };
      });
      const r = captureRun(() => ghPull.cmdGhPull(project.root, ['21-bidirectional-gh-sync'], false));
      assert.strictEqual(r.exitCode, 1);
      assert.match(r.stdout + r.stderr, /no GitHub issue/i);
    } finally { project.cleanup(); }
  });

  test('C3: GH unchanged → exits 0 with no-drift message', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'open', labels: ['aoforge:objective'] },
      mapping: { milestone_id: 0, objectives: { '21-bidirectional-gh-sync': { issue_id: 10, state_comment_id: null } } },
      projectFm: { github_repo: 'AO-Cyber-Systems/aoforge-claude' },
    });
    try {
      // Write a sync-state baseline matching the cassette's updatedAt
      const syncState = { version: 1, objectives: { '21-bidirectional-gh-sync': { gh_updated_at: '2026-05-01T00:00:00Z', label_set: ['aoforge:objective'] } } };
      fs.writeFileSync(path.join(project.root, '.planning', '.gh-sync-state.json'), JSON.stringify(syncState), 'utf-8');

      const cassette = fx.loadCassette('objective-open-no-drift');
      ghPull._setRunGh((args) => {
        if (args[0] === 'auth' && args[1] === 'status') {
          return { ok: true, status: 0, stdout: "  - Token scopes: 'repo'", stderr: '' };
        }
        if (args[0] === 'issue' && args[1] === 'view') return cassette.response;
        return { ok: false, status: 1, stdout: '', stderr: 'unexpected' };
      });

      const r = captureRun(() => ghPull.cmdGhPull(project.root, ['21-bidirectional-gh-sync'], false));
      assert.strictEqual(r.exitCode, null, 'exit not called for no-drift');
      assert.match(r.stdout, /No drift/i);
    } finally { project.cleanup(); }
  });

  test('C4: GH changed, no --apply → reports drift, exits 0 (does NOT write)', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'in_progress', labels: ['aoforge:objective'] },
      mapping: { milestone_id: 0, objectives: { '21-bidirectional-gh-sync': { issue_id: 11, state_comment_id: null } } },
      projectFm: { github_repo: 'AO-Cyber-Systems/aoforge-claude' },
    });
    try {
      const syncState = { version: 1, objectives: { '21-bidirectional-gh-sync': { gh_updated_at: '2026-05-01T00:00:00Z', label_set: ['aoforge:objective'] } } };
      fs.writeFileSync(path.join(project.root, '.planning', '.gh-sync-state.json'), JSON.stringify(syncState), 'utf-8');

      const cassette = fx.loadCassette('objective-closed-on-gh');
      ghPull._setRunGh((args) => {
        if (args[0] === 'auth' && args[1] === 'status') return { ok: true, status: 0, stdout: "  - Token scopes: 'repo'", stderr: '' };
        if (args[0] === 'issue' && args[1] === 'view') return cassette.response;
        return { ok: false, status: 1, stdout: '', stderr: 'unexpected' };
      });

      const before = fs.readFileSync(path.join(project.root, '.planning', 'objectives', project.objectiveId, 'OBJECTIVE.md'), 'utf-8');
      const r = captureRun(() => ghPull.cmdGhPull(project.root, ['21-bidirectional-gh-sync'], false));
      assert.strictEqual(r.exitCode, null);
      assert.match(r.stdout, /Drift detected|drift/i);
      // OBJECTIVE.md NOT modified
      const after = fs.readFileSync(path.join(project.root, '.planning', 'objectives', project.objectiveId, 'OBJECTIVE.md'), 'utf-8');
      assert.strictEqual(before, after);
    } finally { project.cleanup(); }
  });

  test('C5: GH changed, --apply, no conflict → writes OBJECTIVE.md', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'in_progress', labels: ['aoforge:objective'] },
      mapping: { milestone_id: 0, objectives: { '21-bidirectional-gh-sync': { issue_id: 11, state_comment_id: null } } },
      projectFm: { github_repo: 'AO-Cyber-Systems/aoforge-claude' },
    });
    try {
      const syncState = { version: 1, objectives: { '21-bidirectional-gh-sync': { gh_updated_at: '2026-05-01T00:00:00Z', label_set: ['aoforge:objective'] } } };
      fs.writeFileSync(path.join(project.root, '.planning', '.gh-sync-state.json'), JSON.stringify(syncState), 'utf-8');

      const cassette = fx.loadCassette('objective-closed-on-gh');
      ghPull._setRunGh((args) => {
        if (args[0] === 'auth' && args[1] === 'status') return { ok: true, status: 0, stdout: "  - Token scopes: 'repo'", stderr: '' };
        if (args[0] === 'issue' && args[1] === 'view') return cassette.response;
        return { ok: false, status: 1, stdout: '', stderr: 'unexpected' };
      });

      const r = captureRun(() => ghPull.cmdGhPull(project.root, ['21-bidirectional-gh-sync', '--apply'], false));
      assert.strictEqual(r.exitCode, null);
      const after = fs.readFileSync(path.join(project.root, '.planning', 'objectives', project.objectiveId, 'OBJECTIVE.md'), 'utf-8');
      assert.match(after, /status: done/);
    } finally { project.cleanup(); }
  });

  test('C6: GH issue not found (404) → exits 1', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'open' },
      mapping: { milestone_id: 0, objectives: { '21-bidirectional-gh-sync': { issue_id: 99999, state_comment_id: null } } },
      projectFm: { github_repo: 'AO-Cyber-Systems/aoforge-claude' },
    });
    try {
      const cassette = fx.loadCassette('objective-not-found');
      ghPull._setRunGh((args) => {
        if (args[0] === 'auth' && args[1] === 'status') return { ok: true, status: 0, stdout: "  - Token scopes: 'repo'", stderr: '' };
        if (args[0] === 'issue' && args[1] === 'view') return cassette.response;
        return { ok: false, status: 1, stdout: '', stderr: 'unexpected' };
      });

      const r = captureRun(() => ghPull.cmdGhPull(project.root, ['21-bidirectional-gh-sync'], false));
      assert.strictEqual(r.exitCode, 1);
      assert.match(r.stdout + r.stderr, /not found/i);
    } finally { project.cleanup(); }
  });

  test('C7: --raw flag emits JSON output', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'open', labels: ['aoforge:objective'] },
      mapping: { milestone_id: 0, objectives: { '21-bidirectional-gh-sync': { issue_id: 10, state_comment_id: null } } },
      projectFm: { github_repo: 'AO-Cyber-Systems/aoforge-claude' },
    });
    try {
      const syncState = { version: 1, objectives: { '21-bidirectional-gh-sync': { gh_updated_at: '2026-05-01T00:00:00Z', label_set: ['aoforge:objective'] } } };
      fs.writeFileSync(path.join(project.root, '.planning', '.gh-sync-state.json'), JSON.stringify(syncState), 'utf-8');

      const cassette = fx.loadCassette('objective-open-no-drift');
      ghPull._setRunGh((args) => {
        if (args[0] === 'auth' && args[1] === 'status') return { ok: true, status: 0, stdout: "  - Token scopes: 'repo'", stderr: '' };
        if (args[0] === 'issue' && args[1] === 'view') return cassette.response;
        return { ok: false, status: 1, stdout: '', stderr: 'unexpected' };
      });

      const r = captureRun(() => ghPull.cmdGhPull(project.root, ['21-bidirectional-gh-sync'], true));
      // --raw should produce JSON-parseable stdout
      const trimmed = r.stdout.trim();
      assert.ok(trimmed.startsWith('{'), `expected JSON, got: ${trimmed}`);
      const parsed = JSON.parse(trimmed);
      assert.strictEqual(parsed.ok, true);
    } finally { project.cleanup(); }
  });
});

// ─── TRD 46-06: one objective id, mapping v3, resolveRepo, enabled gate, client seam ─────────────────

describe('cmdGhPull on objective ids (46-06, tests 5-12)', () => {
  const ghClient = require('./gh-client.cjs');
  const { extractFrontmatter } = require('./frontmatter.cjs');
  const ss = require('./sync-state.cjs');

  function captureRun(fn) {
    const origStdout = process.stdout.write.bind(process.stdout);
    const origStderr = process.stderr.write.bind(process.stderr);
    const origExit = process.exit;
    let stdout = '', stderr = '', exitCode = null;
    process.stdout.write = (chunk) => { stdout += chunk; return true; };
    process.stderr.write = (chunk) => { stderr += chunk; return true; };
    process.exit = (code) => { exitCode = code; throw new Error('__exit__'); };
    try {
      try { fn(); } catch (e) { if (e.message !== '__exit__') throw e; }
    } finally {
      process.stdout.write = origStdout;
      process.stderr.write = origStderr;
      process.exit = origExit;
    }
    return { stdout, stderr, exitCode };
  }

  // Records every gh invocation; answers auth and `issue view` from a cassette.
  function recordingGh(cassetteName = 'objective-open-no-drift') {
    const cassette = fx.loadCassette(cassetteName);
    const log = [];
    const fn = (args) => {
      log.push(args.slice());
      if (args[0] === 'auth' && args[1] === 'status') {
        return { ok: true, status: 0, stdout: "  - Token scopes: 'repo'", stderr: '' };
      }
      if (args[0] === 'issue' && args[1] === 'view') return cassette.response;
      return { ok: false, status: 1, stdout: '', stderr: `[mock] unexpected ${args.join(' ')}` };
    };
    return { fn, calls: () => log, views: () => log.filter((a) => a[0] === 'issue' && a[1] === 'view') };
  }

  const repoOf = (view) => view[view.indexOf('--repo') + 1];
  const objPathOf = (project, dir) => path.join(project.root, '.planning', 'objectives', dir, 'OBJECTIVE.md');

  test('5: pull 02-a, 2 and 002 each read issue 7 from o/r with a v2 mapping; no [object Object] reaches gh', () => {
    for (const arg of ['02-a', '2', '002']) {
      const project = fx.buildTempProject({
        objectiveId: '02-a',
        frontmatter: { status: 'open', labels: ['aoforge:objective'] },
        mapping: { objectives: { '2': { issue_id: 7, state_comment_id: null } } },
      });
      try {
        const gh = recordingGh();
        ghPull._setRunGh(gh.fn);
        const r = captureRun(() => ghPull.cmdGhPull(project.root, [arg], true));
        assert.strictEqual(r.exitCode, null, `pull ${arg}: ${r.stdout}${r.stderr}`);
        const views = gh.views();
        assert.strictEqual(views.length, 1, `pull ${arg} made one issue view`);
        assert.strictEqual(views[0][2], '7', `pull ${arg} reads issue 7`);
        assert.strictEqual(repoOf(views[0]), 'o/r');
        for (const call of gh.calls()) {
          for (const a of call) assert.ok(!String(a).includes('[object Object]'), `argv leaked [object Object]: ${call.join(' ')}`);
        }
      } finally { project.cleanup(); }
    }
  });

  test('6: a v1 mapping ({"objectives":{"2":7}}) resolves the same way', () => {
    const project = fx.buildTempProject({
      objectiveId: '02-a',
      frontmatter: { status: 'open', labels: ['aoforge:objective'] },
      mapping: { objectives: { '2': 7 } },
    });
    try {
      const gh = recordingGh();
      ghPull._setRunGh(gh.fn);
      const r = captureRun(() => ghPull.cmdGhPull(project.root, ['02-a'], true));
      assert.strictEqual(r.exitCode, null, r.stdout + r.stderr);
      assert.strictEqual(gh.views().length, 1);
      assert.strictEqual(gh.views()[0][2], '7');
      for (const call of gh.calls()) for (const a of call) assert.ok(!String(a).includes('[object Object]'));
    } finally { project.cleanup(); }
  });

  test('6b: pull is read-only for the mapping (a v1 file is not rewritten)', () => {
    const project = fx.buildTempProject({
      objectiveId: '02-a',
      frontmatter: { status: 'open', labels: ['aoforge:objective'] },
      mapping: { objectives: { '2': 7 } },
    });
    try {
      const mp = path.join(project.root, '.planning', '.gh-mapping.json');
      const before = fs.readFileSync(mp, 'utf-8');
      ghPull._setRunGh(recordingGh().fn);
      captureRun(() => ghPull.cmdGhPull(project.root, ['02-a'], true));
      assert.strictEqual(fs.readFileSync(mp, 'utf-8'), before);
    } finally { project.cleanup(); }
  });

  test("7: a push-style baseline recorded under the id key '2' is found by `pull 02-a` (no first_sync)", () => {
    const project = fx.buildTempProject({
      objectiveId: '02-a',
      frontmatter: { status: 'open', labels: ['aoforge:objective'] },
      mapping: { objectives: { '2': { issue_id: 7, state_comment_id: null } } },
    });
    try {
      ss.recordSync(project.root, '2', {
        issue_ref: 'o/r#7', etag: null, gh_updated_at: '2026-05-01T00:00:00Z', label_set: ['aoforge:objective'],
        assignees: [], milestone: null, status: 'open', last_synced_at: '2026-05-01T00:00:00Z', last_synced_disk_hash: 'sha256:x',
      });
      ghPull._setRunGh(recordingGh().fn);
      const r = captureRun(() => ghPull.cmdGhPull(project.root, ['02-a'], true));
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.ok, true);
      assert.strictEqual(parsed.drift, false, 'baseline found -> GH unchanged -> no drift');
      assert.strictEqual(parsed.first_sync, undefined);
    } finally { project.cleanup(); }
  });

  test('8: repo comes from config github.repo; PROJECT.md github_repo is the fallback; config wins over PROJECT.md', () => {
    const mapping = { objectives: { '2': { issue_id: 7, state_comment_id: null } } };
    const cases = [
      { label: 'config only', repo: 'cfg/repo', projectFm: null, expected: 'cfg/repo' },
      { label: 'PROJECT.md fallback', repo: null, projectFm: { github_repo: 'proj/repo' }, expected: 'proj/repo' },
      { label: 'config wins', repo: 'cfg/repo', projectFm: { github_repo: 'proj/repo' }, expected: 'cfg/repo' },
    ];
    for (const c of cases) {
      const project = fx.buildTempProject({
        objectiveId: '02-a', frontmatter: { status: 'open', labels: ['aoforge:objective'] },
        mapping, repo: c.repo, projectFm: c.projectFm,
      });
      try {
        const gh = recordingGh();
        ghPull._setRunGh(gh.fn);
        captureRun(() => ghPull.cmdGhPull(project.root, ['02-a'], true));
        assert.strictEqual(gh.views().length, 1, c.label);
        assert.strictEqual(repoOf(gh.views()[0]), c.expected, c.label);
      } finally { project.cleanup(); }
    }
  });

  test('9: github.enabled:false -> {skipped:true}, exit 0, zero gh calls', () => {
    const project = fx.buildTempProject({
      objectiveId: '02-a', frontmatter: { status: 'open' },
      mapping: { objectives: { '2': { issue_id: 7, state_comment_id: null } } },
      githubEnabled: false,
    });
    try {
      const gh = recordingGh();
      ghPull._setRunGh(gh.fn);
      const r = captureRun(() => ghPull.cmdGhPull(project.root, ['02-a'], true));
      assert.ok(r.exitCode === null || r.exitCode === 0, `exit code ${r.exitCode}`);
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.skipped, true);
      assert.ok(parsed.reason);
      assert.strictEqual(gh.calls().length, 0, 'no gh calls at all, not even auth');

      const prose = captureRun(() => ghPull.cmdGhPull(project.root, ['02-a'], false));
      assert.match(prose.stdout, /github\.enabled/);
      assert.strictEqual(gh.calls().length, 0);
    } finally { project.cleanup(); }
  });

  test('10: unknown objective -> exit 1 (objective not found); missing mapping entry -> exit 1 pointing at `gh sync`', () => {
    const project = fx.buildTempProject({
      objectiveId: '02-a', frontmatter: { status: 'open' },
      mapping: { objectives: {} },
    });
    try {
      ghPull._setRunGh(recordingGh().fn);
      const unknown = captureRun(() => ghPull.cmdGhPull(project.root, ['99-nope'], true));
      assert.strictEqual(unknown.exitCode, 1);
      assert.match(JSON.parse(unknown.stdout).error, /objective not found: 99-nope/);

      const unmapped = captureRun(() => ghPull.cmdGhPull(project.root, ['2'], false));
      assert.strictEqual(unmapped.exitCode, 1);
      assert.match(unmapped.stdout, /gh sync/);
      assert.doesNotMatch(unmapped.stdout, /sync-objectives/);
    } finally { project.cleanup(); }
  });

  test('11: --apply on an OBJECTIVE.md with # OPTIONAL comments updates the drifted field and keeps every comment byte', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-comments',
      frontmatter: { status: 'in_progress' },
      mapping: { objectives: { '21': { issue_id: 11, state_comment_id: null } } },
    });
    try {
      const objPath = objPathOf(project, '21-comments');
      const original = [
        '---',
        '# OPTIONAL: set manually',
        'status: in_progress',
        'labels: ["aoforge:objective"]',
        'assignees: []',
        '# github_issue: owner/repo#NN',
        'kind: plugin',
        '---',
        '',
        '# Body',
        '',
      ].join('\n');
      fs.writeFileSync(objPath, original, 'utf-8');
      ss.recordSync(project.root, '21', {
        issue_ref: 'o/r#11', etag: null, gh_updated_at: '2026-05-01T00:00:00Z', label_set: ['aoforge:objective'],
        assignees: [], milestone: null, status: 'in_progress', last_synced_at: '2026-05-01T00:00:00Z',
        last_synced_disk_hash: ss.hashFrontmatter(extractFrontmatter(original)),
      });
      ghPull._setRunGh(recordingGh('objective-closed-on-gh').fn);
      const r = captureRun(() => ghPull.cmdGhPull(project.root, ['21', '--apply'], true));
      assert.strictEqual(r.exitCode, null, r.stdout + r.stderr);
      assert.strictEqual(fs.readFileSync(objPath, 'utf-8'), original.replace('status: in_progress', 'status: done'));
      assert.strictEqual(ss.getLastSync(project.root, '21').status, 'done');
    } finally { project.cleanup(); }
  });

  test('12: gh-pull._setRunGh(fake) installs fake on the gh-client seam', () => {
    // A guard runner first: if gh-pull does NOT forward to the client, the call lands here, never on real gh.
    const leaked = [];
    ghClient._setRunGh((args) => { leaked.push(args.slice()); return { ok: true, status: 0, stdout: 'client-guard', stderr: '' }; });
    try {
      const seen = [];
      ghPull._setRunGh((args) => { seen.push(args.slice()); return { ok: true, status: 0, stdout: 'via-fake', stderr: '' }; });
      const r = ghClient.ghRead(['api', 'rate_limit']);
      assert.strictEqual(r.stdout, 'via-fake');
      assert.deepStrictEqual(seen, [['api', 'rate_limit']]);
      assert.strictEqual(leaked.length, 0);

      // _setRunGh(null) restores the default on the client too (the guard is gone, not the fake).
      ghPull._setRunGh(null);
      ghClient._setRunGh((args) => { leaked.push(args.slice()); return { ok: true, status: 0, stdout: 'client-guard', stderr: '' }; });
      assert.strictEqual(ghClient.ghRead(['api', 'x']).stdout, 'client-guard');
      assert.strictEqual(seen.length, 1, 'the old fake is no longer installed');
    } finally {
      ghClient._setRunGh(null);
    }
  });
});

// ─── TRD 47-10: `gh pull --all` (tests 14-15) ────────────────────────────────

describe('cmdGhPull --all (47-10, tests 14-15)', () => {
  const ghClient = require('./gh-client.cjs');
  const ghTrd = require('./gh-trd.cjs');
  const ghBody = require('./gh-body.cjs');
  const ghWiki = require('./gh-wiki.cjs');
  const os = require('os');
  const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
  const { STORE_FIXTURE: F, hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');

  const DIR = F.objectiveDir;
  const VERIFICATION_TEXT = '# Objective 7 verification\n\nAll success criteria met.\n';

  /** Same harness as gh-e2e.test.cjs: a stubbed exit, captured stdout/stderr. */
  function capture(fn) {
    const out = { stdout: '', stderr: '', code: null };
    const saved = { exit: process.exit, out: process.stdout.write, err: process.stderr.write };
    process.exit = (c) => { if (out.code === null) out.code = c === undefined ? 0 : c; };
    process.stdout.write = (chunk) => { out.stdout += chunk; return true; };
    process.stderr.write = (chunk) => { out.stderr += chunk; return true; };
    try {
      fn();
    } finally {
      process.exit = saved.exit;
      process.stdout.write = saved.out;
      process.stderr.write = saved.err;
    }
    return out;
  }
  const exitOf = (r) => (r.code === null ? 0 : r.code);
  const pullAll = (root, args = ['--all']) => capture(() => ghPull.cmdGhPull(root, args, true));

  let h;
  let root;
  let fake;

  function writeConfig(enabled) {
    fs.writeFileSync(path.join(root, '.planning', 'config.json'), `${JSON.stringify({ github: { enabled, repo: 'o/r' } }, null, 2)}\n`);
  }

  /** A repo whose wiki is disabled (docs mode: no git needed) with one directed objective and its TRDs on GitHub. */
  function seedGithub() {
    fake = createFakeGitHub({ repo: 'o/r', hasWiki: false, ownerType: 'User' });
    ghClient._setRunGh(fake.runGh);
    fake.seedMilestone('v9.9 Store Demo');
    const page = ghWiki.objectivePage(DIR);
    const wiki = ghBody.buildWikiSection({ dir: DIR, page, url: `https://github.com/o/r/wiki/${page}/abc1234`, sha: 'abc1234' });
    fake.seedIssue({
      title: '[Objective 7] Store demo',
      body: `<!-- aoforge:id=7 -->\n<!-- aoforge:begin wiki -->\n${wiki}\n<!-- aoforge:end wiki -->\n`,
      labels: ['aoforge:objective'],
      milestone: 'v9.9 Store Demo',
    });
    F.trdFiles.forEach((file, i) => {
      fake.seedIssue({
        title: `[TRD ${file.slice(0, 5)}] ${file}`,
        body: ghTrd.encodeTrdBody({ id: `7-0${i + 1}`, file, text: F.trds[file] }),
        labels: ['aoforge:trd'],
        state: i === 0 ? 'CLOSED' : 'OPEN',
      });
    });
    const marker = ghBody.commentMarker('7', 'verification');
    fake.seedComment(1, `${marker}\n${ghTrd.fileLine('07-VERIFICATION.md')}\n${VERIFICATION_TEXT}`);
    const docs = path.join(root, 'docs', 'aoforge');
    fs.mkdirSync(docs, { recursive: true });
    fs.writeFileSync(path.join(docs, 'Project.md'), F.project);
  }

  beforeEach(() => {
    h = hermeticEnv();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-pull-all-'));
    fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
    writeConfig(true);
    fake = null;
  });

  afterEach(() => {
    ghClient._setRunGh(null);
    ghClient._resetClient();
    fs.rmSync(root, { recursive: true, force: true });
    h.restore();
  });

  const rd = (rel) => fs.readFileSync(path.join(root, '.planning', rel), 'utf-8');

  test('14: --all prints {ok, written, skipped, local_modified, orphans} as JSON and exits 0', () => {
    seedGithub();
    const r = pullAll(root);
    assert.strictEqual(exitOf(r), 0, r.stdout + r.stderr);
    const body = JSON.parse(r.stdout);
    assert.strictEqual(body.ok, true);
    assert.deepStrictEqual(body.local_modified, []);
    assert.deepStrictEqual(body.orphans, []);
    assert.deepStrictEqual(body.skipped, []);
    assert.ok(body.written.includes('PROJECT.md'));
    assert.ok(body.written.includes(`objectives/${DIR}/07-01-alpha-TRD.md`));
    assert.ok(body.written.includes('ROADMAP.md') && body.written.includes('STATE.md'));
    assert.strictEqual(rd('PROJECT.md'), F.project);
    assert.strictEqual(rd(`objectives/${DIR}/07-03-gamma-TRD.md`), F.trds['07-03-gamma-TRD.md']);
    assert.strictEqual(rd(`objectives/${DIR}/07-VERIFICATION.md`), VERIFICATION_TEXT);
  });

  test('14: a second --all writes nothing', () => {
    seedGithub();
    pullAll(root);
    const second = JSON.parse(pullAll(root).stdout);
    assert.deepStrictEqual(second.written, []);
    assert.ok(second.skipped.length >= 7);
  });

  test('14: a locally modified cache file makes --all exit 2, and --force takes GitHub with exit 0', () => {
    seedGithub();
    pullAll(root);
    fs.writeFileSync(path.join(root, '.planning', 'PROJECT.md'), 'my own edits\n');
    const r = pullAll(root);
    assert.strictEqual(exitOf(r), 2, r.stdout + r.stderr);
    const body = JSON.parse(r.stdout);
    assert.strictEqual(body.ok, true);
    assert.deepStrictEqual(body.local_modified, ['PROJECT.md']);
    assert.strictEqual(rd('PROJECT.md'), 'my own edits\n');

    const forced = pullAll(root, ['--all', '--force']);
    assert.strictEqual(exitOf(forced), 0, forced.stdout + forced.stderr);
    assert.deepStrictEqual(JSON.parse(forced.stdout).written, ['PROJECT.md']);
    assert.strictEqual(rd('PROJECT.md'), F.project);
  });

  test('14: a hand-kept ROADMAP.md or an orphan also asks for a look (exit 2)', () => {
    seedGithub();
    fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), '# Roadmap: by hand\n');
    const r = pullAll(root);
    assert.strictEqual(exitOf(r), 2);
    assert.deepStrictEqual(JSON.parse(r.stdout).hand_maintained, ['ROADMAP.md']);
    assert.strictEqual(rd('ROADMAP.md'), '# Roadmap: by hand\n');
  });

  test('14: prose output (no --raw) summarises the pull and names what needs a look', () => {
    seedGithub();
    fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), '# Roadmap: by hand\n');
    const r = capture(() => ghPull.cmdGhPull(root, ['--all'], false));
    assert.strictEqual(exitOf(r), 2);
    assert.match(r.stdout, /written/i);
    assert.match(r.stdout, /ROADMAP\.md/);
    assert.match(r.stdout, /hand/i);
  });

  test('14: github.enabled false is skipped with zero gh calls and exit 0', () => {
    seedGithub();
    writeConfig(false);
    const r = pullAll(root);
    assert.strictEqual(exitOf(r), 0);
    const body = JSON.parse(r.stdout);
    assert.strictEqual(body.skipped, true);
    assert.strictEqual(body.ok, false);
    assert.deepStrictEqual(fake.calls(), []);
    assert.ok(!fs.existsSync(path.join(root, '.planning', 'PROJECT.md')));
  });

  test('14: an unreachable GitHub is exit 1 with the error in the payload and nothing written', () => {
    seedGithub();
    fake.setOffline(true);
    const r = pullAll(root);
    assert.strictEqual(exitOf(r), 1);
    const body = JSON.parse(r.stdout);
    assert.strictEqual(body.ok, false);
    assert.match(body.error, /./);
    assert.ok(!fs.existsSync(path.join(root, '.planning', 'ROADMAP.md')));
  });

  test('14: the usage message names --all [--force]', () => {
    const r = capture(() => ghPull.cmdGhPull(root, [], true));
    assert.strictEqual(exitOf(r), 1);
    assert.match(r.stderr, /Usage:/);
    assert.match(r.stderr, /--all \[--force\]/);
  });

  test('15: the per-objective path is unchanged: pull 2 reads one issue and never lists the repo', () => {
    const project = fx.buildTempProject({
      objectiveId: '02-a',
      frontmatter: { status: 'open', labels: ['aoforge:objective'] },
      mapping: { objectives: { 2: { issue_id: 7, state_comment_id: null } } },
    });
    try {
      const cassette = fx.loadCassette('objective-open-no-drift');
      const log = [];
      ghPull._setRunGh((args) => {
        log.push(args.slice());
        if (args[0] === 'auth' && args[1] === 'status') return { ok: true, status: 0, stdout: "  - Token scopes: 'repo'", stderr: '' };
        if (args[0] === 'issue' && args[1] === 'view') return cassette.response;
        return { ok: false, status: 1, stdout: '', stderr: `[mock] unexpected ${args.join(' ')}` };
      });
      const r = capture(() => ghPull.cmdGhPull(project.root, ['2'], true));
      assert.strictEqual(exitOf(r), 0, r.stdout + r.stderr);
      const views = log.filter((a) => a[0] === 'issue' && a[1] === 'view');
      assert.strictEqual(views.length, 1);
      assert.strictEqual(views[0][2], '7');
      assert.ok(!log.some((a) => a.join(' ').includes('labels=')), 'no list-and-scan read on the per-objective path');
      assert.ok(!fs.existsSync(path.join(project.root, '.planning', 'ROADMAP.md')), 'no generated view');
    } finally { project.cleanup(); }
  });
});
