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

/**
 * The statuses posted on `sha` under the AOForge contexts, newest first. Each verdict is also posted under its legacy
 * twin for one release (TRD 72-11; gh-checks.legacy.test.cjs covers that); these tests judge the AOForge one.
 */
const own = (s) => (fake.statuses[s] || []).filter((x) => x.context.startsWith('aoforge/'));

const HEAD_CLOSES = sha('1');
const HEAD_NO_CLOSES = sha('2');
const GROUP_HEAD = sha('3');
const queueRef = (n) => `refs/heads/gh-readonly-queue/main/pr-${n}-${GROUP_HEAD}`;

const prEvent = (body, over = {}) => fixture('pull_request-closes', (p) => {
  p.pull_request.body = body;
  Object.assign(p.pull_request, over);
});

// ─── aoforge/linked-issue (Task 1) ───────────────────────────────────────────

describe('linked-issue: pull_request events', () => {
  test('1. no closing reference: posts aoforge/linked-issue = failure on the head sha and exits 1 (SC3)', () => {
    const r = run('linked-issue', fixture('pull_request-no-closes'), { GITHUB_EVENT_NAME: 'pull_request' });
    assert.equal(r.code, 1);
    assert.equal(r.state, 'failure');

    const posted = own(HEAD_NO_CLOSES);
    assert.equal(posted.length, 1);
    assert.equal(posted[0].state, 'failure');
    assert.equal(posted[0].context, 'aoforge/linked-issue');
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
    const posted = own(HEAD_CLOSES);
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
    const posted = own(HEAD_CLOSES)[0];
    assert.equal(posted.state, 'failure');
    assert.match(posted.description, /#5/);
    assert.match(posted.description, /pull request/);
  });

  test('3b. `Closes #99` where no such issue exists: failure naming it (404 is a finding, not an error)', () => {
    seedUntil(2);
    const r = run('linked-issue', prEvent('Closes #99'));
    assert.equal(r.code, 1);
    assert.equal(r.state, 'failure');
    const posted = own(HEAD_CLOSES)[0];
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
    assert.equal(own(HEAD_CLOSES)[0].state, 'success');
    assert.equal(own(HEAD_CLOSES)[0].target_url, 'https://github.com/acme/widgets/actions/runs/777');
  });

  test('3e. no target_url when the run id is unknown, and the repo default branch is looked up when the event lacks it', () => {
    seedUntil(1);
    const payload = prEvent('Closes #1');
    delete payload.repository.default_branch;
    const r = run('linked-issue', payload, { GITHUB_RUN_ID: undefined });
    assert.equal(r.code, 0);
    assert.equal(own(HEAD_CLOSES)[0].target_url, null);
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
    const posted = own(GROUP_HEAD)[0];
    assert.equal(posted.context, 'aoforge/linked-issue');
    assert.equal(posted.state, 'success');
  });

  test('4b. evaluated against PR #7\'s body: no closing reference there is a failure on the group sha', () => {
    seedUntil(6);
    assert.equal(seedPr({ body: 'just a refactor' }), 7);
    const r = run('linked-issue', groupEvent(7), { GITHUB_EVENT_NAME: 'merge_group' });
    assert.equal(r.code, 1);
    const posted = own(GROUP_HEAD)[0];
    assert.equal(posted.state, 'failure');
    assert.equal(posted.context, CONTEXTS.linkedIssue);
  });

  test('4c. a queue ref that names no pull request is an error status on the group sha, exit 1', () => {
    const r = run('linked-issue', fixture('merge_group', (p) => { p.merge_group.head_ref = 'refs/heads/some-branch'; }), {
      GITHUB_EVENT_NAME: 'merge_group',
    });
    assert.equal(r.code, 1);
    assert.equal(r.state, 'error');
    const posted = own(GROUP_HEAD)[0];
    assert.equal(posted.state, 'error');
    assert.match(posted.description, /some-branch/);
  });

  test('4d. the queue names a PR that is gone (404): error status on the group sha, exit 1', () => {
    const r = run('linked-issue', groupEvent(40), { GITHUB_EVENT_NAME: 'merge_group' });
    assert.equal(r.code, 1);
    assert.equal(own(GROUP_HEAD)[0].state, 'error');
    assert.match(own(GROUP_HEAD)[0].description, /#40|40/);
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
    const posted = own(HEAD_CLOSES)[0];
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

// ─── aoforge/planning-consistency and reconcile (Task 2) ─────────────────────

const OBJECTIVE_BODY = '<!-- aoforge:id=50 -->\n\nObjective 50';
const TRD_BODY = (n) => `<!-- aoforge:id=50-0${n} -->\n\nTRD ${n}`;
const OBJECTIVE_LABEL = 'aoforge:objective';

/** Seed `.aoforge/config.json` at a ref the way the contents API serves it (`text` is used verbatim). */
function seedConfig(ref, config) {
  fake.files[ref] = { ...(fake.files[ref] || {}), '.aoforge/config.json': typeof config === 'string' ? config : JSON.stringify(config) };
}

/** #1 = the objective, #2 and #3 = TRDs linked under it as sub-issues. */
function seedObjectiveGraph({ states = {} } = {}) {
  fake.seedIssue({ title: 'objective 50', body: OBJECTIVE_BODY, labels: [OBJECTIVE_LABEL], state: states[1] || 'OPEN' });
  fake.seedIssue({ title: 'TRD 50-01', body: TRD_BODY(1), state: states[2] || 'OPEN' });
  fake.seedIssue({ title: 'TRD 50-02', body: TRD_BODY(2), state: states[3] || 'OPEN' });
  fake.issues[0].subIssues.push(2, 3);
  fake.issues[1].parent = 1;
  fake.issues[2].parent = 1;
}

const objectivePrBody = (...closes) => `<!-- aoforge:pr=50 -->\n<!-- aoforge:begin closes -->\n${closes.map((n) => `Closes #${n}`).join('\n')}\n<!-- aoforge:end closes -->\n`;

describe('planning-consistency', () => {
  test('5. config absent at the PR head: success "store mode off" under aoforge/planning-consistency', () => {
    const r = run('planning-consistency', prEvent('Closes #1'), { GITHUB_EVENT_NAME: 'pull_request' });
    assert.equal(r.code, 0);
    assert.equal(r.state, 'success');
    const posted = own(HEAD_CLOSES);
    assert.equal(posted.length, 1);
    assert.equal(posted[0].context, 'aoforge/planning-consistency');
    assert.equal(posted[0].context, CONTEXTS.planningConsistency);
    assert.equal(posted[0].state, 'success');
    assert.match(posted[0].description, /store mode off/);
    assert.ok(fake.calls().some((a) => a.join(' ').includes(`contents/.aoforge/config.json?ref=${HEAD_CLOSES}`)), 'the config is read at the PR head through the contents API');
  });

  test('5b. a config that is not store mode, or that does not parse, is also "store mode off"', () => {
    seedConfig(HEAD_CLOSES, { github: { enabled: true, store: false } });
    assert.match(run('planning-consistency', prEvent('Closes #1')).description, /store mode off/);
    seedConfig(HEAD_CLOSES, '{ not json');
    const r = run('planning-consistency', prEvent('Closes #1'));
    assert.equal(r.code, 0);
    assert.match(r.description, /store mode off/);
  });

  test('5c. store mode on but no aoforge:pr marker: success "not an AOForge objective PR"', () => {
    seedConfig(HEAD_CLOSES, { github: { enabled: true, store: true } });
    const r = run('planning-consistency', prEvent('Closes #1'));
    assert.equal(r.code, 0);
    assert.match(r.description, /not an AOForge objective PR/);
  });

  test('6. objective PR closing the objective and one TRD while another is a sub-issue too: failure naming it', () => {
    seedConfig(HEAD_CLOSES, { github: { enabled: true, store: true } });
    seedObjectiveGraph();
    const r = run('planning-consistency', prEvent(objectivePrBody(1, 2)), { GITHUB_EVENT_NAME: 'pull_request' });
    assert.equal(r.code, 1);
    assert.equal(r.state, 'failure');
    const posted = own(HEAD_CLOSES)[0];
    assert.equal(posted.state, 'failure');
    assert.equal(posted.context, CONTEXTS.planningConsistency);
    assert.match(posted.description, /#3/);
  });

  test('6b. closing the objective and every linked TRD passes', () => {
    seedConfig(HEAD_CLOSES, { github: { enabled: true, store: true } });
    seedObjectiveGraph();
    const r = run('planning-consistency', prEvent(objectivePrBody(1, 2, 3)));
    assert.equal(r.code, 0);
    assert.equal(r.state, 'success');
    assert.equal(own(HEAD_CLOSES)[0].state, 'success');
  });

  test('6c. a PR that forgets to close the objective issue names it (found by its label and marker)', () => {
    seedConfig(HEAD_CLOSES, { github: { enabled: true, store: true } });
    seedObjectiveGraph();
    const r = run('planning-consistency', prEvent(objectivePrBody(2, 3)));
    assert.equal(r.code, 1);
    assert.match(own(HEAD_CLOSES)[0].description, /#1/);
    assert.match(own(HEAD_CLOSES)[0].description, /not closed/);
  });

  test('6d. without the sub-issues API the linked TRDs come from the objective\'s `trds` task list', () => {
    install({ subIssuesApi: false });
    seedConfig(HEAD_CLOSES, { github: { enabled: true, store: true } });
    fake.seedIssue({ title: 'objective 50', body: `${OBJECTIVE_BODY}\n<!-- aoforge:begin trds -->\n- [ ] #2\n- [ ] #3\n<!-- aoforge:end trds -->\n`, labels: [OBJECTIVE_LABEL] });
    fake.seedIssue({ title: 'TRD 50-01', body: TRD_BODY(1) });
    fake.seedIssue({ title: 'TRD 50-02', body: TRD_BODY(2) });
    const r = run('planning-consistency', prEvent(objectivePrBody(1, 2)));
    assert.equal(r.code, 1);
    assert.match(own(HEAD_CLOSES)[0].description, /#3/);
  });

  test('6e. a merge_group event reads the PR named by the queue ref and posts on the group head sha', () => {
    seedObjectiveGraph();
    const n = seedPr({ body: objectivePrBody(1, 2, 3) });
    assert.equal(n, 4);
    const prHead = JSON.parse(fake.runGh(['api', 'repos/o/r/pulls/4']).stdout).head.sha;
    seedConfig(prHead, { github: { enabled: true, store: true } });
    const payload = fixture('merge_group', (p) => { p.merge_group.head_ref = queueRef(4); });
    const r = run('planning-consistency', payload, { GITHUB_EVENT_NAME: 'merge_group' });
    assert.equal(r.code, 0);
    assert.deepEqual(Object.keys(fake.statuses), [GROUP_HEAD]);
    assert.equal(own(GROUP_HEAD)[0].context, CONTEXTS.planningConsistency);
    assert.equal(own(GROUP_HEAD)[0].state, 'success');
  });

  test('6f. a failed sub-issue read is an `error` status, not a verdict', () => {
    seedConfig(HEAD_CLOSES, { github: { enabled: true, store: true } });
    seedObjectiveGraph();
    fake.failNext('issues/1/sub_issues', { stderr: 'gh: Server Error (HTTP 500)', status: 1 });
    const r = run('planning-consistency', prEvent(objectivePrBody(1, 2, 3)));
    assert.equal(r.code, 1);
    assert.equal(r.state, 'error');
    assert.equal(own(HEAD_CLOSES)[0].state, 'error');
    assert.match(own(HEAD_CLOSES)[0].description, /sub-issues/);
  });

  test('6g. a closed pull_request posts nothing', () => {
    const payload = prEvent(objectivePrBody(1));
    payload.action = 'closed';
    const r = run('planning-consistency', payload);
    assert.equal(r.code, 0);
    assert.equal(r.state, 'skipped');
    assert.deepEqual(fake.calls(), []);
  });
});

describe('reconcile', () => {
  /** A merged objective PR into main: the fixture with its number, body and (optionally) base edited. */
  const mergedEvent = (number, body, base = 'main') => fixture('pull_request-merged', (p) => {
    p.pull_request.number = number;
    p.pull_request.body = body;
    p.pull_request.base.ref = base;
  });
  const patches = () => fake.writes().filter((a) => a.includes('PATCH'));
  // seeding a PR is itself a gh write in the fake, so the runner's own calls are what comes after this mark
  let mark = { calls: 0, writes: 0 };
  const setupDone = () => { mark = { calls: fake.calls().length, writes: fake.writes().length }; };
  const callsSince = () => fake.calls().slice(mark.calls);
  const writesSince = () => fake.writes().slice(mark.writes);
  const prComments = (n) => fake.comments.filter((c) => c.issue_number === n);

  test('7. merged PR: still-open closing targets and linked TRDs are closed as completed, one marker comment', () => {
    seedObjectiveGraph({ states: { 1: 'CLOSED' } }); // GitHub closed the objective; #2 and #3 are stragglers
    assert.equal(seedPr({ body: objectivePrBody(1, 2) }), 4);
    setupDone();
    const r = run('reconcile', mergedEvent(4, objectivePrBody(1, 2)), { GITHUB_EVENT_NAME: 'pull_request' });
    assert.equal(r.code, 0);
    assert.equal(r.state, 'success');

    assert.equal(fake.issues[1].state, 'CLOSED');
    assert.equal(fake.issues[1].stateReason, 'completed');
    assert.equal(fake.issues[2].state, 'CLOSED', 'the linked TRD the PR did not name is closed too');
    assert.equal(fake.issues[2].stateReason, 'completed');
    assert.equal(patches().length, 2, 'the already-closed objective is not touched');

    const comments = prComments(4);
    assert.equal(comments.length, 1, 'one comment on the PR');
    assert.ok(comments[0].body.includes('<!-- aoforge:reconcile -->'));
    assert.match(comments[0].body, /#2/);
    assert.match(comments[0].body, /#3/);
    assert.ok(!/#1\b/.test(comments[0].body), 'the issue that was already closed is not listed');
    assert.equal(writesSince().length, 3, 'two closes and one comment, nothing else');
    assert.deepEqual(fake.statuses, {}, 'reconcile posts no commit status');
  });

  test('7a. running it again finds nothing open: no writes, no second comment', () => {
    seedObjectiveGraph({ states: { 1: 'CLOSED' } });
    seedPr({ body: objectivePrBody(1, 2) });
    run('reconcile', mergedEvent(4, objectivePrBody(1, 2)));
    const before = fake.writes().length;
    const again = run('reconcile', mergedEvent(4, objectivePrBody(1, 2)));
    assert.equal(again.code, 0);
    assert.equal(fake.writes().length, before);
    assert.equal(prComments(4).length, 1);
  });

  test('7b. an unmerged closed PR: no writes (and no gh call)', () => {
    seedObjectiveGraph();
    seedPr({ body: objectivePrBody(1, 2) });
    setupDone();
    const payload = mergedEvent(4, objectivePrBody(1, 2));
    payload.pull_request.merged = false;
    const r = run('reconcile', payload);
    assert.equal(r.code, 0);
    assert.equal(r.state, 'skipped');
    assert.deepEqual(callsSince(), [], 'not even a read');
  });

  test('7c. a PR still open (any non-closed action) is not reconciled', () => {
    const payload = prEvent('Closes #1');
    const r = run('reconcile', payload);
    assert.equal(r.code, 0);
    assert.equal(r.state, 'skipped');
    assert.deepEqual(fake.calls(), []);
  });

  test('7d. merged into a branch other than the default: closing keywords never acted, nothing is closed', () => {
    seedObjectiveGraph();
    seedPr({ body: objectivePrBody(1, 2) });
    setupDone();
    const r = run('reconcile', mergedEvent(4, objectivePrBody(1, 2), 'develop'));
    assert.equal(r.code, 0);
    assert.equal(r.state, 'skipped');
    assert.deepEqual(writesSince(), []);
  });

  test('7e. a plain `Closes #N` PR (no objective) has its open target closed too', () => {
    seedUntil(2);
    seedPr({ body: 'Closes #1' }); // PR #3
    const r = run('reconcile', mergedEvent(3, 'Closes #1'));
    assert.equal(r.code, 0);
    assert.equal(fake.issues[0].state, 'CLOSED');
    assert.equal(fake.issues[0].stateReason, 'completed');
    assert.equal(fake.issues[1].state, 'OPEN', 'only what the PR named');
  });

  test('7f. a close that fails is listed, the rest still close, and the exit is 1', () => {
    seedObjectiveGraph({ states: { 1: 'CLOSED' } });
    seedPr({ body: objectivePrBody(1, 2) });
    fake.failNext((a) => a.includes('PATCH') && a.join(' ').includes('issues/3'), { stderr: 'gh: Forbidden (HTTP 403)', status: 1 });
    const r = run('reconcile', mergedEvent(4, objectivePrBody(1, 2)));
    assert.equal(r.code, 1);
    assert.equal(r.state, 'failure');
    assert.match(r.description, /#3/);
    assert.equal(fake.issues[1].state, 'CLOSED');
    assert.equal(fake.issues[2].state, 'OPEN');
    const comments = prComments(4);
    assert.equal(comments.length, 1);
    assert.match(comments[0].body, /#2/);
    assert.match(comments[0].body, /#3/);
    assert.match(comments[0].body, /403|could not/i);
  });

  test('7g. a read failure is an error result (no status exists to post), exit 1, no throw', () => {
    seedObjectiveGraph({ states: { 1: 'CLOSED' } });
    fake.setOffline(true);
    let r;
    assert.doesNotThrow(() => { r = run('reconcile', mergedEvent(4, objectivePrBody(1, 2))); });
    assert.equal(r.code, 1);
    assert.equal(r.state, 'error');
    assert.deepEqual(fake.statuses, {});
  });
});
