'use strict';

/**
 * Tests for lib/gh-check-cli.cjs (TRD 50-08): the script the Actions workflow runs. It reads the event,
 * fetches what the pure checks (gh-check.cjs) need through gh-client, posts the verdict as a commit status
 * under the exact required context, and runs the merge-time reconcile.
 *
 * Hermetic: `main({argv, env})` runs in-process against the fake GitHub (installed through the client seam),
 * GITHUB_EVENT_PATH points at copies of the 50-03 event fixtures written to a temp dir, and HOME / outbox /
 * cache dirs are temp dirs from `hermeticEnv()`. No network, no real ~/.claude, no port.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const cli = require('./gh-check-cli.cjs');
const { CONTEXTS } = require('./gh-check.cjs');
const client = require('./gh-client.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');

const EVENTS = path.join(__dirname, '__fixtures__', 'gh-events');
const sha = (c) => c.repeat(40);

let envh;
let tmp;
let fake;
let seq = 0;

/** A fresh fake installed through the seam; every write is un-paced (no real sleeping). */
function install(opts = {}) {
  fake = createFakeGitHub({ repo: 'o/r', ...opts });
  client._setRunGh(fake.runGh);
  return fake;
}

beforeEach(() => {
  envh = hermeticEnv();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-check-cli-'));
  client._setSleep(() => {});
  client._setNow(() => 0);
  install();
});

afterEach(() => {
  client._resetClient();
  envh.restore();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A copy of a 50-03 event fixture, edited in place by `edit`. */
function fixture(name, edit) {
  const payload = JSON.parse(fs.readFileSync(path.join(EVENTS, `${name}.json`), 'utf-8'));
  if (edit) edit(payload);
  return payload;
}

/** Run one check in-process. `env` keys may be set to undefined to remove them. */
function run(check, payload, env = {}) {
  const eventPath = path.join(tmp, `event-${++seq}.json`);
  fs.writeFileSync(eventPath, JSON.stringify(payload));
  return cli.main({
    argv: [check],
    env: {
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: 'o/r',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_RUN_ID: '777',
      ...env,
    },
  });
}

/** Seed plain issues until #n exists. */
function seedUntil(n, extra = {}) {
  while (fake.issues.length < n) {
    const i = fake.issues.length + 1;
    fake.seedIssue({ title: `issue ${i}`, ...(extra[i] || {}) });
  }
}

/** Open a PR in the fake (the next number) on its own branch; returns its number. */
function seedPr({ body = '' } = {}) {
  const branch = `feat-${fake.issues.length + 1}`;
  fake.pushRef(branch, sha(String(fake.issues.length % 10)));
  const r = fake.runGh(['api', '--method', 'POST', 'repos/o/r/pulls', '--input', '-'], {
    input: JSON.stringify({ title: 'a pull request', head: branch, base: 'main', body }),
  });
  assert.equal(r.ok, true, r.stderr);
  return JSON.parse(r.stdout).number;
}

const HEAD_CLOSES = sha('1');
const HEAD_NO_CLOSES = sha('2');
const GROUP_HEAD = sha('3');
const queueRef = (n) => `refs/heads/gh-readonly-queue/main/pr-${n}-${GROUP_HEAD}`;

const prEvent = (body, over = {}) => fixture('pull_request-closes', (p) => {
  p.pull_request.body = body;
  Object.assign(p.pull_request, over);
});

// ─── devflow/linked-issue (Task 1) ───────────────────────────────────────────

describe('linked-issue: pull_request events', () => {
  test('1. no closing reference: posts devflow/linked-issue = failure on the head sha and exits 1 (SC3)', () => {
    const r = run('linked-issue', fixture('pull_request-no-closes'), { GITHUB_EVENT_NAME: 'pull_request' });
    assert.equal(r.code, 1);
    assert.equal(r.state, 'failure');

    const posted = fake.statuses[HEAD_NO_CLOSES];
    assert.equal(posted.length, 1);
    assert.equal(posted[0].state, 'failure');
    assert.equal(posted[0].context, 'devflow/linked-issue');
    assert.equal(posted[0].context, CONTEXTS.linkedIssue);
    assert.match(posted[0].description, /closing reference/);
    assert.equal(posted[0].target_url, 'https://github.com/o/r/actions/runs/777');
    assert.deepEqual(Object.keys(fake.statuses), [HEAD_NO_CLOSES], 'nothing is posted on any other sha');
  });

  test('2. `Closes #5` to an existing issue: success and exit 0', () => {
    seedUntil(5);
    const r = run('linked-issue', prEvent('Closes #5'), { GITHUB_EVENT_NAME: 'pull_request' });
    assert.equal(r.code, 0);
    assert.equal(r.state, 'success');
    const posted = fake.statuses[HEAD_CLOSES];
    assert.equal(posted.length, 1);
    assert.equal(posted[0].state, 'success');
    assert.equal(posted[0].context, CONTEXTS.linkedIssue);
    assert.equal(posted[0].description, 'Closes #5');
  });

  test('3. `Closes #5` where #5 is a pull request: failure naming it', () => {
    seedUntil(4);
    assert.equal(seedPr(), 5);
    const r = run('linked-issue', prEvent('Closes #5'));
    assert.equal(r.code, 1);
    const posted = fake.statuses[HEAD_CLOSES][0];
    assert.equal(posted.state, 'failure');
    assert.match(posted.description, /#5/);
    assert.match(posted.description, /pull request/);
  });

  test('3b. `Closes #99` where no such issue exists: failure naming it (404 is a finding, not an error)', () => {
    seedUntil(2);
    const r = run('linked-issue', prEvent('Closes #99'));
    assert.equal(r.code, 1);
    assert.equal(r.state, 'failure');
    const posted = fake.statuses[HEAD_CLOSES][0];
    assert.equal(posted.state, 'failure');
    assert.match(posted.description, /#99/);
  });

  test('3c. the PR commits are read: a `Refs #N` paragraph shows up in the details', () => {
    seedUntil(2);
    const n = seedPr();
    fake.prCommits[n] = ['Add the thing\n\nRefs #2'];
    const r = run('linked-issue', prEvent('Closes #1', { number: n }));
    assert.equal(r.code, 0);
    assert.ok(r.details.some((d) => /#2/.test(d) && /Refs/.test(d)), `details: ${JSON.stringify(r.details)}`);
  });

  test('3d. the repository is the event\'s own when GITHUB_REPOSITORY is unset (the unmodified 50-03 fixture)', () => {
    install({ repo: 'acme/widgets' });
    seedUntil(12);
    const r = run('linked-issue', fixture('pull_request-closes'), { GITHUB_REPOSITORY: undefined });
    assert.equal(r.code, 0);
    assert.equal(fake.statuses[HEAD_CLOSES][0].state, 'success');
    assert.equal(fake.statuses[HEAD_CLOSES][0].target_url, 'https://github.com/acme/widgets/actions/runs/777');
  });

  test('3e. no target_url when the run id is unknown, and the repo default branch is looked up when the event lacks it', () => {
    seedUntil(1);
    const payload = prEvent('Closes #1');
    delete payload.repository.default_branch;
    const r = run('linked-issue', payload, { GITHUB_RUN_ID: undefined });
    assert.equal(r.code, 0);
    assert.equal(fake.statuses[HEAD_CLOSES][0].target_url, null);
  });
});

describe('linked-issue: merge_group events', () => {
  const groupEvent = (n) => fixture('merge_group', (p) => { p.merge_group.head_ref = queueRef(n); });

  test('4. the PR named by the queue ref is evaluated and the status lands on merge_group.head_sha', () => {
    seedUntil(6);
    assert.equal(seedPr({ body: 'Closes #1' }), 7);
    const r = run('linked-issue', groupEvent(7), { GITHUB_EVENT_NAME: 'merge_group' });
    assert.equal(r.code, 0);
    assert.deepEqual(Object.keys(fake.statuses), [GROUP_HEAD], 'posted on the group head sha only');
    const posted = fake.statuses[GROUP_HEAD][0];
    assert.equal(posted.context, 'devflow/linked-issue');
    assert.equal(posted.state, 'success');
  });

  test('4b. evaluated against PR #7\'s body: no closing reference there is a failure on the group sha', () => {
    seedUntil(6);
    assert.equal(seedPr({ body: 'just a refactor' }), 7);
    const r = run('linked-issue', groupEvent(7), { GITHUB_EVENT_NAME: 'merge_group' });
    assert.equal(r.code, 1);
    const posted = fake.statuses[GROUP_HEAD][0];
    assert.equal(posted.state, 'failure');
    assert.equal(posted.context, CONTEXTS.linkedIssue);
  });

  test('4c. a queue ref that names no pull request is an error status on the group sha, exit 1', () => {
    const r = run('linked-issue', fixture('merge_group', (p) => { p.merge_group.head_ref = 'refs/heads/some-branch'; }), {
      GITHUB_EVENT_NAME: 'merge_group',
    });
    assert.equal(r.code, 1);
    assert.equal(r.state, 'error');
    const posted = fake.statuses[GROUP_HEAD][0];
    assert.equal(posted.state, 'error');
    assert.match(posted.description, /some-branch/);
  });

  test('4d. the queue names a PR that is gone (404): error status on the group sha, exit 1', () => {
    const r = run('linked-issue', groupEvent(40), { GITHUB_EVENT_NAME: 'merge_group' });
    assert.equal(r.code, 1);
    assert.equal(fake.statuses[GROUP_HEAD][0].state, 'error');
    assert.match(fake.statuses[GROUP_HEAD][0].description, /#40|40/);
  });
});

describe('linked-issue: failures never throw', () => {
  test('8. an outage while reading: exit 1, an error result, no throw, nothing posted', () => {
    seedUntil(5);
    fake.setOffline(true);
    let r;
    assert.doesNotThrow(() => { r = run('linked-issue', prEvent('Closes #5')); });
    assert.equal(r.code, 1);
    assert.equal(r.state, 'error');
    assert.deepEqual(fake.statuses, {});
  });

  test('8b. a failed read posts an `error` status carrying the message (best effort) and exits 1', () => {
    seedUntil(5);
    fake.failNext('repos/o/r/issues/5', { stderr: 'gh: Server Error (HTTP 500)', status: 1 });
    const r = run('linked-issue', prEvent('Closes #5'));
    assert.equal(r.code, 1);
    assert.equal(r.state, 'error');
    const posted = fake.statuses[HEAD_CLOSES][0];
    assert.equal(posted.state, 'error');
    assert.equal(posted.context, CONTEXTS.linkedIssue);
    assert.match(posted.description, /#5/);
    assert.ok(posted.description.length <= 140, 'a status description is at most 140 characters');
  });

  test('8c. even a throwing gh seam is contained: exit 1, no throw', () => {
    client._setRunGh(() => { throw new Error('boom'); });
    let r;
    assert.doesNotThrow(() => { r = run('linked-issue', prEvent('Closes #5')); });
    assert.equal(r.code, 1);
    assert.equal(r.state, 'error');
    assert.match(r.description, /boom/);
  });

  test('8d. a status the API refuses is reported, not thrown: exit 1', () => {
    seedUntil(1);
    fake.failNext('statuses', { stderr: 'gh: Resource not accessible by integration (HTTP 403)', status: 1 });
    let r;
    assert.doesNotThrow(() => { r = run('linked-issue', prEvent('Closes #1')); });
    assert.equal(r.code, 1);
    assert.equal(r.state, 'error');
    assert.match(r.description, /403|statuses|accessible/);
  });
});

describe('linked-issue: events with nothing to check', () => {
  test('9. a closed (unmerged) pull_request: exit 0 and no status, no gh call at all', () => {
    const payload = prEvent('no refs', { merged: false });
    payload.action = 'closed';
    const r = run('linked-issue', payload, { GITHUB_EVENT_NAME: 'pull_request' });
    assert.equal(r.code, 0);
    assert.equal(r.state, 'skipped');
    assert.deepEqual(fake.statuses, {});
    assert.deepEqual(fake.calls(), []);
  });

  test('9b. a merged pull_request is closed too: no check, no status', () => {
    const r = run('linked-issue', fixture('pull_request-merged'));
    assert.equal(r.code, 0);
    assert.deepEqual(fake.statuses, {});
    assert.deepEqual(fake.calls(), []);
  });

  test('9c. any other event is exit 0 with a notice and no gh call', () => {
    const r = run('linked-issue', { ref: 'refs/heads/main', repository: { full_name: 'o/r' } }, { GITHUB_EVENT_NAME: 'push' });
    assert.equal(r.code, 0);
    assert.equal(r.state, 'skipped');
    assert.match(r.description, /push/);
    assert.deepEqual(fake.calls(), []);
  });
});

describe('usage and the script entry', () => {
  test('10. an unknown check, no check, a missing or unreadable event are exit 1 without a throw or a gh call', () => {
    for (const argv of [[], ['nope']]) {
      const r = cli.main({ argv, env: {} });
      assert.equal(r.code, 1, JSON.stringify(argv));
      assert.match(r.description, /usage/i);
    }
    const missing = cli.main({ argv: ['linked-issue'], env: { GITHUB_REPOSITORY: 'o/r' } });
    assert.equal(missing.code, 1);
    assert.match(missing.description, /GITHUB_EVENT_PATH/);

    const bad = path.join(tmp, 'bad.json');
    fs.writeFileSync(bad, '{not json');
    const unreadable = cli.main({ argv: ['linked-issue'], env: { GITHUB_EVENT_PATH: bad, GITHUB_REPOSITORY: 'o/r' } });
    assert.equal(unreadable.code, 1);
    assert.equal(unreadable.state, 'error');
    assert.deepEqual(fake.calls(), []);
  });

  test('11. run as a script it exits with main\'s code (usage error, no gh touched)', () => {
    const script = path.join(__dirname, 'gh-check-cli.cjs');
    const r = spawnSync(process.execPath, [script], { encoding: 'utf-8', env: { PATH: process.env.PATH, HOME: tmp } });
    assert.equal(r.status, 1);
    assert.match(`${r.stdout}${r.stderr}`, /usage/i);
  });
});
