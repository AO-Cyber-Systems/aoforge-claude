'use strict';

/**
 * Tests for lib/gh-pr-cli.cjs (TRD 49-09): `df-tools gh pr start | sync | status <objective>`.
 *
 * Same hermetic shape as gh-pr.test.cjs: a git clone with a store-shaped `.planning/` cache, a local bare origin, the
 * in-memory fake GitHub through gh-client's seam, a clock that never sleeps. `cmdGhPr` runs in-process under capture()
 * (process.exit and stdout/stderr stubbed); the dispatch tests spawn df-tools against a project with the store off,
 * so no gh is needed. Never the real ~/.claude, a real remote or port 8080.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const path = require('path');

const cli = require('./gh-pr-cli.cjs');
const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const mappingLib = require('./gh-mapping.cjs');
const trdLib = require('./gh-trd.cjs');
const bodyLib = require('./gh-body.cjs');
const { COMMANDS: HELP_COMMANDS } = require('./help.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv, STORE_FIXTURE } = require('./__fixtures__/gh-store-fixtures.cjs');
const { makeGitRemote, gitAvailable } = require('./__fixtures__/git-remote.cjs');

const GIT = gitAvailable();
const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const BRANCH = 'df/objective-07-store-demo';
const DF_TOOLS = path.resolve(__dirname, '..', 'df-tools.cjs');

/** Run fn with process.exit / stdout / stderr captured. The first exit code wins; exit does not throw. */
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

let S = null;

function syncRefs() {
  let out = '';
  try {
    out = S.g.git(S.g.origin, ['for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/heads']);
  } catch (_) {
    return;
  }
  for (const line of out.split('\n')) {
    const [name, sha] = line.trim().split(' ');
    if (name && sha) S.fake.pushRef(name, sha);
  }
}

/** A git clone holding the store cache, a fake GitHub on its `main`, the objective and TRDs 7-01, 7-02 issued and mapped. */
function setup({ store = true } = {}) {
  const envh = hermeticEnv();
  const g = makeGitRemote();
  const project = makeStoreProject({ store, hasWiki: false });
  fs.cpSync(path.join(project.root, '.planning'), path.join(g.work, '.planning'), { recursive: true });
  project.cleanup();
  const root = g.work;
  fs.rmSync(path.join(root, '.planning', 'objectives', '07-store-demo', '07-03-gamma-TRD.md'));

  const c0 = g.git(root, ['rev-parse', 'HEAD']);
  const fake = createFakeGitHub({ repo: 'o/r', hasWiki: false, refs: { main: c0 }, onCreateBranch: (name) => g.createRemoteBranch(name) });
  const clock = { t: T0 };
  client._setNow(() => clock.t);
  client._setSleep((ms) => { clock.t += ms; });
  S = { envh, g, root, fake, c0, objN: null, trdN: {} };
  client._setRunGh((args, opts) => {
    syncRefs();
    return fake.runGh(args, opts);
  });

  const body = bodyLib.mergeManaged('', { summary: 'Mine', criteria: '- [ ] one', trds: '_None yet._', footer: 'Footer' }, '7').body;
  S.objN = fake.seedIssue({ title: '[Objective 7] Store demo', body, labels: ['devflow:objective'] });
  const mapping = mappingLib.readMappingV3(root);
  mappingLib.setEntry(mapping, '7', { issue_id: S.objN });
  for (const [id, file] of [['7-01', '07-01-alpha-TRD.md'], ['7-02', '07-02-beta-TRD.md']]) {
    const n = fake.seedIssue({ title: `[TRD ${id}] ${file}`, body: trdLib.encodeTrdBody({ id, file, text: STORE_FIXTURE.trds[file] }), labels: ['devflow:trd'] });
    mappingLib.setTrd(mapping, id, { issue_number: n, rest_id: 1_000_000 + n });
    S.trdN[id] = n;
  }
  assert.ok(mappingLib.writeMappingV3(root, mapping).ok);
  return S;
}

afterEach(() => {
  if (!S) return;
  client._resetClient();
  S.g.cleanup();
  S.envh.restore();
  S = null;
});

const pr = (args, raw = true) => capture(() => cli.cmdGhPr(S.root, args, raw));
const json = (r) => JSON.parse(r.stdout);
const branchNow = () => S.g.git(S.root, ['branch', '--show-current']);
const prRecords = () => S.fake.issues.filter((i) => i.pr);

describe('49-09 gh pr CLI', { skip: GIT ? false : 'git is not available' }, () => {
  test('12a. start --raw: exit 0, the JSON names the branch, the flush and the PR', () => {
    setup();
    const r = pr(['start', '7']);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    const j = json(r);
    assert.equal(j.ok, true);
    assert.equal(j.branch, BRANCH);
    assert.equal(j.flush.status, 'flushed');
    assert.equal(j.pr.number, prRecords()[0].number);
    assert.equal(branchNow(), BRANCH);
  });

  test('12b. start in prose: says the branch, the start commit and the draft PR', () => {
    setup();
    const r = pr(['start', '7'], false);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.match(r.stdout, new RegExp(BRANCH));
    assert.match(r.stdout, /start commit/i);
    assert.match(r.stdout, /draft/i);
    assert.match(r.stdout, new RegExp(`#${prRecords()[0].number}`));
  });

  test('12c. start --no-flush: exit 0, the PR is queued and not created', () => {
    setup();
    const r = pr(['start', '7', '--no-flush']);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.equal(json(r).flush, null);
    assert.equal(prRecords().length, 0);
    assert.equal(outbox.readJournal(S.root).journal.ops.filter((o) => o.kind === 'upsert-pr' && o.status === 'pending').length, 1);
  });

  test('12d. start --name <branch> creates that branch; the flag value is not mistaken for the objective', () => {
    setup();
    const r = pr(['start', '--name', 'df/obj-seven', '7']);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.equal(json(r).branch, 'df/obj-seven');
    assert.equal(branchNow(), 'df/obj-seven');
  });

  test('12e. start failures are exit 1 with the reason on stderr: a dirty tree, an unmapped objective', () => {
    setup();
    fs.writeFileSync(path.join(S.root, 'README.md'), '# changed\n');
    const dirty = pr(['start', '7'], false);
    assert.equal(exitOf(dirty), 1);
    assert.match(dirty.stderr, /uncommitted/);
    S.g.git(S.root, ['checkout', '--', 'README.md']);
    const unmapped = pr(['start', '99'], false);
    assert.equal(exitOf(unmapped), 1);
    assert.match(unmapped.stderr, /run df-tools gh sync 99 first/);
  });

  test('12f. start offline exits 1 and queues nothing', () => {
    setup();
    S.fake.setOffline(true);
    const r = pr(['start', '7'], false);
    assert.equal(exitOf(r), 1);
    assert.equal(outbox.readJournal(S.root).journal.ops.length, 0);
    assert.equal(branchNow(), 'main');
  });

  test('12g. usage: no objective, no verb and an unknown verb are exit 1 and list start, sync and status', () => {
    setup();
    for (const args of [['start'], ['sync'], ['status'], [], ['nope', '7']]) {
      const r = pr(args, false);
      assert.equal(exitOf(r), 1, args.join(' '));
      for (const v of ['start', 'sync', 'status']) assert.match(r.stderr, new RegExp(v), `${args.join(' ')}: ${v}`);
    }
    assert.deepEqual(S.fake.calls(), [], 'a usage error makes no gh call');
  });

  test('12h. --help prints the usage and exits 0', () => {
    setup();
    const r = pr(['--help'], false);
    assert.equal(exitOf(r), 0);
    assert.match(r.stdout, /gh pr start <objective>/);
  });

  test('12i. sync after a commit: exit 0, the prose says what was pushed and the summary line', () => {
    setup();
    assert.equal(exitOf(pr(['start', '7'])), 0);
    S.g.commitFile(S.root, 'a.txt', 'one\n', 'feat(7-01): first wave');
    const r = pr(['sync', '7'], false);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.match(r.stdout, /TRDs complete 1\/2/);
    assert.equal(S.g.git(S.g.origin, ['rev-parse', `refs/heads/${BRANCH}`]), S.g.git(S.root, ['rev-parse', 'HEAD']));
  });

  test('12j. sync offline: exit 3, the push failure is reported and the op stays queued', () => {
    setup();
    assert.equal(exitOf(pr(['start', '7'])), 0);
    S.g.git(S.root, ['remote', 'set-url', 'origin', path.join(S.g.root, 'gone.git')]);
    S.fake.setOffline(true);
    const r = pr(['sync', '7'], false);
    assert.equal(exitOf(r), 3, r.stdout + r.stderr);
    assert.match(r.stdout, /push/i);
    assert.equal(outbox.readJournal(S.root).journal.ops.filter((o) => o.kind === 'upsert-pr' && o.status === 'pending').length, 1);
  });

  test('12k. sync with GitHub reachable but the push failing is still exit 3 (the branch is not published)', () => {
    setup();
    assert.equal(exitOf(pr(['start', '7'])), 0);
    S.g.git(S.root, ['remote', 'set-url', 'origin', path.join(S.g.root, 'gone.git')]);
    const r = pr(['sync', '7']);
    assert.equal(exitOf(r), 3);
    assert.equal(json(r).push.ok, false);
  });

  test('12l. sync before start is exit 1', () => {
    setup();
    const r = pr(['sync', '7'], false);
    assert.equal(exitOf(r), 1);
    assert.match(r.stderr, /gh pr start 7/);
  });

  test('12m. status --raw is the JSON of prStatus; prose shows branch, PR, verification, closes and pending scopes; zero writes', () => {
    setup();
    assert.equal(exitOf(pr(['start', '7'])), 0);
    const writes = S.fake.writes().length;
    const raw = pr(['status', '7']);
    assert.equal(exitOf(raw), 0);
    const j = json(raw);
    assert.equal(j.branch, BRANCH);
    assert.equal(j.pr.draft, true);
    assert.deepEqual(j.closes, [S.objN, S.trdN['7-01'], S.trdN['7-02']]);
    const prose = pr(['status', '7'], false);
    assert.equal(exitOf(prose), 0);
    assert.match(prose.stdout, new RegExp(BRANCH));
    assert.match(prose.stdout, /draft/i);
    assert.match(prose.stdout, /verification/i);
    assert.match(prose.stdout, new RegExp(`#${S.objN}`));
    assert.equal(S.fake.writes().length, writes);
  });

  test('12n. status when GitHub cannot be read is exit 1', () => {
    setup();
    assert.equal(exitOf(pr(['start', '7'])), 0);
    S.fake.setOffline(true);
    assert.equal(exitOf(pr(['status', '7'], false)), 1);
  });

  test('12o. local mode: start, sync and status are exit 0 skipped, with zero gh calls and the branch unchanged', () => {
    setup({ store: false });
    for (const verb of ['start', 'sync', 'status']) {
      const r = pr([verb, '7']);
      assert.equal(exitOf(r), 0, `${verb}: ${r.stdout}${r.stderr}`);
      assert.equal(json(r).skipped, true, verb);
    }
    assert.deepEqual(S.fake.calls(), []);
    assert.equal(branchNow(), 'main');
    assert.equal(S.g.git(S.root, ['rev-parse', 'HEAD']), S.c0);
  });
});

describe('49-09 df-tools dispatch for gh pr', () => {
  function withProject(fn) {
    const envh = hermeticEnv();
    const project = makeStoreProject({ store: false });
    try {
      fn(project, envh);
    } finally {
      project.cleanup();
      envh.restore();
    }
  }

  const dfTools = (project, envh, ...args) => {
    const r = spawnSync(process.execPath, [DF_TOOLS, ...args], {
      cwd: project.root, env: { ...process.env, ...envh.env }, encoding: 'utf8', timeout: 60000,
    });
    return { code: r.status, stdout: r.stdout, stderr: r.stderr };
  };

  test('13a. gh pr start | sync | status reach cmdGhPr (skipped, exit 0, with the store off)', () => {
    withProject((project, envh) => {
      for (const verb of ['start', 'sync', 'status']) {
        const r = dfTools(project, envh, 'gh', 'pr', verb, '7', '--raw');
        assert.equal(r.code, 0, `${verb}: ${r.stdout}${r.stderr}`);
        assert.equal(JSON.parse(r.stdout).skipped, true, verb);
      }
    });
  });

  test('13b. an unknown gh pr verb errors and lists start, sync and status', () => {
    withProject((project, envh) => {
      const r = dfTools(project, envh, 'gh', 'pr', 'nope', '7');
      assert.equal(r.code, 1);
      for (const v of ['start', 'sync', 'status']) assert.match(r.stderr, new RegExp(v));
    });
  });

  test('13c. an unknown gh subcommand lists pr among the available ones', () => {
    withProject((project, envh) => {
      const r = dfTools(project, envh, 'gh', 'nope');
      assert.equal(r.code, 1);
      assert.match(r.stderr, /\bpr\b/);
    });
  });

  test('13d. the gh usage string names pr <start|sync|status> <objective>', () => {
    assert.ok(HELP_COMMANDS.gh.usage.includes('pr <start|sync|status> <objective>'), HELP_COMMANDS.gh.usage);
  });
});
