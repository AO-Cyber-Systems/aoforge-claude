'use strict';

/**
 * Tests for __fixtures__/gh-fake.cjs (TRD 46-05, Task 1): the stateful fake GitHub every later
 * test in objective 46 relies on. These keep the fake honest before anything else trusts it:
 * each test drives `fake.runGh(argv)` directly and asserts what a real `gh` would answer.
 *
 * Hermetic: no network, no real `gh`, no ~/.claude.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { isWriteArgs } = require('./gh-client.cjs');

const R = ['--repo', 'o/r'];
const json = (r) => JSON.parse(r.stdout);

/** A fake that already has the objective label and the v1.4 milestone. */
function fakeWithLabelAndMilestone() {
  const fake = createFakeGitHub();
  assert.equal(fake.runGh(['label', 'create', 'devflow:objective', ...R, '--color', '0e8a16']).ok, true);
  assert.equal(fake.runGh(['api', 'repos/o/r/milestones', '-f', 'title=v1.4']).ok, true);
  return fake;
}

// ─── Tests 1-4: issues ───────────────────────────────────────────────────────

describe('issue create / view / list / edit / comment / close', () => {
  it('1. issue create returns the issue URL and stores the issue; numbers increment from 1', () => {
    const fake = fakeWithLabelAndMilestone();

    const a = fake.runGh(['issue', 'create', ...R, '--title', '[Objective 2] a', '--body', 'body A',
      '--label', 'devflow:objective', '--milestone', 'v1.4']);
    assert.equal(a.ok, true);
    assert.equal(a.stdout, 'https://github.com/o/r/issues/1');

    const b = fake.runGh(['issue', 'create', ...R, '--title', 'second', '--body', 'body B']);
    assert.equal(b.stdout, 'https://github.com/o/r/issues/2');

    assert.equal(fake.issues.length, 2);
    const first = fake.issues[0];
    assert.equal(first.number, 1);
    assert.equal(first.title, '[Objective 2] a');
    assert.equal(first.body, 'body A');
    assert.deepEqual(first.labels, ['devflow:objective']);
    assert.equal(first.milestone, 'v1.4');
    assert.equal(first.state, 'OPEN');
    assert.match(first.updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('1b. issue create refuses a label or milestone that does not exist, as gh does', () => {
    const fake = createFakeGitHub();
    const noLabel = fake.runGh(['issue', 'create', ...R, '--title', 't', '--body', 'b', '--label', 'nope']);
    assert.equal(noLabel.ok, false);
    assert.match(noLabel.stderr, /label/i);

    fake.runGh(['label', 'create', 'l', ...R]);
    const noMilestone = fake.runGh(['issue', 'create', ...R, '--title', 't', '--body', 'b', '--label', 'l', '--milestone', 'v9.9']);
    assert.equal(noMilestone.ok, false);
    assert.match(noMilestone.stderr, /milestone/i);
    assert.equal(fake.issues.length, 0, 'a refused create stores nothing');
  });

  it('2. issue view returns only the requested JSON keys, in gh shape', () => {
    const fake = fakeWithLabelAndMilestone();
    fake.runGh(['issue', 'create', ...R, '--title', 'T', '--body', 'B', '--label', 'devflow:objective', '--milestone', 'v1.4']);

    const r = fake.runGh(['issue', 'view', '1', ...R, '--json', 'number,title,body,state,updatedAt,labels,assignees,milestone']);
    assert.equal(r.ok, true);
    const got = json(r);
    assert.deepEqual(Object.keys(got).sort(), ['assignees', 'body', 'labels', 'milestone', 'number', 'state', 'title', 'updatedAt']);
    assert.equal(got.number, 1);
    assert.deepEqual(got.labels, [{ name: 'devflow:objective' }]);
    assert.deepEqual(got.milestone, { number: 1, title: 'v1.4' });
    assert.deepEqual(got.assignees, []);

    const subset = json(fake.runGh(['issue', 'view', '1', ...R, '--json', 'number,body']));
    assert.deepEqual(Object.keys(subset).sort(), ['body', 'number']);
  });

  it('2b. issue view of an unknown number fails with "Could not resolve to an issue"; an unknown JSON field is refused', () => {
    const fake = createFakeGitHub();
    const r = fake.runGh(['issue', 'view', '99', ...R, '--json', 'number']);
    assert.equal(r.ok, false);
    assert.match(r.stderr, /Could not resolve to an issue/i);

    fake.runGh(['issue', 'create', ...R, '--title', 't', '--body', 'b']);
    const bad = fake.runGh(['issue', 'view', '1', ...R, '--json', 'nonsense']);
    assert.equal(bad.ok, false);
    assert.match(bad.stderr, /nonsense/);
  });

  it('3. issue list filters by label and state and honours --limit', () => {
    const fake = createFakeGitHub();
    fake.seedIssue({ title: 'one', body: 'b1', labels: ['devflow:objective'] });
    fake.seedIssue({ title: 'two', body: 'b2', labels: ['other'] });
    fake.seedIssue({ title: 'three', body: 'b3', labels: ['devflow:objective'], state: 'CLOSED' });

    const all = json(fake.runGh(['issue', 'list', ...R, '--label', 'devflow:objective', '--state', 'all', '--limit', '1000', '--json', 'number,title,body']));
    assert.deepEqual(all.map((i) => i.number).sort(), [1, 3]);
    assert.deepEqual(Object.keys(all[0]).sort(), ['body', 'number', 'title']);

    const open = json(fake.runGh(['issue', 'list', ...R, '--label', 'devflow:objective', '--json', 'number']));
    assert.deepEqual(open.map((i) => i.number), [1], 'default state is open');

    const limited = json(fake.runGh(['issue', 'list', ...R, '--state', 'all', '--limit', '2', '--json', 'number']));
    assert.equal(limited.length, 2);
  });

  it('3b. issue list refuses --search: DevFlow must list-and-scan, never search', () => {
    const fake = createFakeGitHub();
    const r = fake.runGh(['issue', 'list', ...R, '--search', 'devflow:id', '--json', 'number']);
    assert.equal(r.ok, false);
    assert.match(r.stderr, /\[gh-fake\] unsupported/);
  });

  it('4. issue edit --body mutates the body and advances updatedAt; comment and close are recorded', () => {
    const fake = createFakeGitHub();
    fake.runGh(['issue', 'create', ...R, '--title', 't', '--body', 'old']);
    const before = fake.issues[0].updatedAt;

    const edit = fake.runGh(['issue', 'edit', '1', ...R, '--body', 'new body']);
    assert.equal(edit.ok, true);
    assert.equal(fake.issues[0].body, 'new body');
    assert.ok(fake.issues[0].updatedAt > before, 'updatedAt advances on an edit');

    const c = fake.runGh(['issue', 'comment', '1', ...R, '--body', 'hi there']);
    assert.equal(c.ok, true);
    assert.equal(fake.comments.length, 1);
    assert.equal(fake.comments[0].body, 'hi there');
    assert.equal(fake.comments[0].issue_number, 1);

    const close = fake.runGh(['issue', 'close', '1', ...R, '--comment', 'done']);
    assert.equal(close.ok, true);
    assert.equal(fake.issues[0].state, 'CLOSED');
    assert.equal(fake.comments.length, 2, 'close --comment leaves a comment');
    assert.equal(fake.comments[1].body, 'done');

    const noIssue = fake.runGh(['issue', 'edit', '42', ...R, '--body', 'x']);
    assert.equal(noIssue.ok, false);
    assert.match(noIssue.stderr, /Could not resolve to an issue/i);
  });

  it('4b. a command aimed at a different repo fails like a missing repository', () => {
    const fake = createFakeGitHub();
    const r = fake.runGh(['issue', 'view', '1', '--repo', 'x/y', '--json', 'number']);
    assert.equal(r.ok, false);
    assert.match(r.stderr, /Could not resolve to a Repository/i);
  });
});

// ─── Test 5: comments API ────────────────────────────────────────────────────

describe('api comments', () => {
  it('5. --paginate --slurp pages comments at 30 per page; POST creates; PATCH edits', () => {
    const fake = createFakeGitHub();
    fake.seedIssue({ title: 't', body: 'b' });
    for (let i = 1; i <= 35; i++) fake.seedComment(1, `comment ${i}`);

    const slurped = json(fake.runGh(['api', '--paginate', '--slurp', 'repos/o/r/issues/1/comments']));
    assert.equal(slurped.length, 2, 'two pages');
    assert.equal(slurped[0].length, 30);
    assert.equal(slurped[1].length, 5);
    assert.equal(slurped[1][4].body, 'comment 35', 'the last comment is on page 2');

    const created = fake.runGh(['api', 'repos/o/r/issues/1/comments', '-f', 'body=brand new']);
    assert.equal(created.ok, true);
    const made = json(created);
    assert.equal(made.body, 'brand new');
    assert.ok(Number.isInteger(made.id));

    const patched = fake.runGh(['api', '-X', 'PATCH', `repos/o/r/issues/comments/${made.id}`, '-f', 'body=edited']);
    assert.equal(patched.ok, true);
    assert.equal(json(patched).body, 'edited');
    assert.equal(fake.comments.find((c) => c.id === made.id).body, 'edited');
  });

  it('5b. --paginate without --slurp concatenates pages the way gh does; --slurp alone is refused', () => {
    const fake = createFakeGitHub({ commentPageSize: 2 });
    fake.seedIssue({ title: 't', body: 'b' });
    for (let i = 1; i <= 3; i++) fake.seedComment(1, `c${i}`);

    const cat = fake.runGh(['api', '--paginate', 'repos/o/r/issues/1/comments']);
    assert.equal(cat.ok, true);
    assert.throws(() => JSON.parse(cat.stdout), 'concatenated arrays are not one JSON document');
    assert.match(cat.stdout, /\]\[/);

    const slurpOnly = fake.runGh(['api', '--slurp', 'repos/o/r/issues/1/comments']);
    assert.equal(slurpOnly.ok, false);
  });

  it('5c. an unpaginated read returns one page; per_page/page select it; an empty list slurps to [[]]', () => {
    const fake = createFakeGitHub();
    fake.seedIssue({ title: 't', body: 'b' });
    assert.deepEqual(json(fake.runGh(['api', '--paginate', '--slurp', 'repos/o/r/issues/1/comments'])), [[]]);

    for (let i = 1; i <= 35; i++) fake.seedComment(1, `c${i}`);
    assert.equal(json(fake.runGh(['api', 'repos/o/r/issues/1/comments'])).length, 30);
    assert.equal(json(fake.runGh(['api', 'repos/o/r/issues/1/comments?per_page=100&page=1'])).length, 35);
    assert.equal(json(fake.runGh(['api', 'repos/o/r/issues/1/comments?per_page=10&page=4'])).length, 5);
  });

  it('5d. PATCH of an unknown comment is a 404', () => {
    const fake = createFakeGitHub();
    const r = fake.runGh(['api', '-X', 'PATCH', 'repos/o/r/issues/comments/777', '-f', 'body=x']);
    assert.equal(r.ok, false);
    assert.match(r.stderr, /404/);
  });
});

// ─── Test 6: milestones API ──────────────────────────────────────────────────

describe('api milestones', () => {
  it('6. POST creates a milestone; a duplicate title is a 422 already_exists; a slurped list returns them', () => {
    const fake = createFakeGitHub();
    const created = fake.runGh(['api', 'repos/o/r/milestones', '-f', 'title=v1.4', '-f', 'description=DevFlow milestone for p']);
    assert.equal(created.ok, true);
    assert.equal(json(created).number, 1);
    assert.equal(json(created).title, 'v1.4');

    const dup = fake.runGh(['api', 'repos/o/r/milestones', '-f', 'title=v1.4']);
    assert.equal(dup.ok, false);
    assert.match(`${dup.stderr}\n${dup.stdout}`, /422/);
    assert.match(`${dup.stderr}\n${dup.stdout}`, /already_exists/);

    fake.runGh(['api', 'repos/o/r/milestones', '-f', 'title=v1.5']);
    const list = json(fake.runGh(['api', '--paginate', '--slurp', 'repos/o/r/milestones?state=all']));
    assert.deepEqual(list.flat().map((m) => m.title), ['v1.4', 'v1.5']);
    assert.deepEqual(list.flat().map((m) => m.number), [1, 2]);
  });
});

// ─── Test 7: labels, auth, version ───────────────────────────────────────────

describe('label / auth / version', () => {
  it('7. label create succeeds once and fails "already exists" the second time', () => {
    const fake = createFakeGitHub();
    assert.equal(fake.runGh(['label', 'create', 'devflow:objective', ...R, '--color', '0e8a16', '--description', 'd']).ok, true);
    const again = fake.runGh(['label', 'create', 'devflow:objective', ...R, '--color', '0e8a16']);
    assert.equal(again.ok, false);
    assert.equal(again.status, 1);
    assert.match(again.stderr, /already exists/i);
  });

  it('7b. auth status reports the token scopes (default and custom); --version answers', () => {
    const def = createFakeGitHub().runGh(['auth', 'status']);
    assert.equal(def.ok, true);
    assert.match(def.stdout, /Token scopes: 'repo', 'project', 'read:project'/);

    const custom = createFakeGitHub({ scopes: ['repo'] }).runGh(['auth', 'status']);
    assert.match(custom.stdout, /Token scopes: 'repo'$/m);
    assert.doesNotMatch(custom.stdout, /project/);

    const v = createFakeGitHub().runGh(['--version']);
    assert.equal(v.ok, true);
    assert.match(v.stdout, /^gh version \d+\.\d+\.\d+/);
  });
});

// ─── Test 8: test controls ───────────────────────────────────────────────────

describe('test controls', () => {
  it('8. failNext makes exactly the next matching call fail once; other calls are untouched', () => {
    const fake = createFakeGitHub();
    fake.seedIssue({ title: 't', body: 'b' });
    fake.failNext((args) => args[0] === 'issue' && args[1] === 'edit',
      { ok: false, status: 1, stderr: 'HTTP 403: You have exceeded a secondary rate limit', stdout: 'retry-after: 3' });

    assert.equal(fake.runGh(['issue', 'view', '1', ...R, '--json', 'number']).ok, true, 'a non-matching call passes');
    const first = fake.runGh(['issue', 'edit', '1', ...R, '--body', 'x']);
    assert.equal(first.ok, false);
    assert.match(first.stderr, /secondary rate limit/);
    assert.equal(fake.issues[0].body, 'b', 'the failed edit changed nothing');

    const second = fake.runGh(['issue', 'edit', '1', ...R, '--body', 'x']);
    assert.equal(second.ok, true, 'the failure fires once');
    assert.equal(fake.issues[0].body, 'x');
  });

  it('8b. failNext accepts a string or a RegExp against the joined argv', () => {
    const fake = createFakeGitHub();
    fake.failNext('issue create', { stderr: 'boom' });
    const r = fake.runGh(['issue', 'create', ...R, '--title', 't', '--body', 'b']);
    assert.equal(r.ok, false);
    assert.equal(r.stderr, 'boom');
    assert.equal(r.status, 1, 'status defaults to 1');

    fake.failNext(/^label create/, { stderr: 'nope' });
    assert.equal(fake.runGh(['label', 'create', 'x', ...R]).stderr, 'nope');
  });

  it('8c. calls() lists every argv; writes() lists only mutating ones (via gh-client isWriteArgs)', () => {
    const fake = createFakeGitHub();
    fake.runGh(['label', 'create', 'l', ...R]);
    fake.runGh(['issue', 'create', ...R, '--title', 't', '--body', 'b', '--label', 'l']);
    fake.runGh(['issue', 'view', '1', ...R, '--json', 'number']);
    fake.runGh(['api', '--paginate', '--slurp', 'repos/o/r/issues/1/comments']);

    assert.equal(fake.calls().length, 4);
    const writes = fake.writes();
    assert.deepEqual(writes.map((a) => `${a[0]} ${a[1]}`), ['label create', 'issue create']);
    for (const w of writes) assert.equal(isWriteArgs(w), true);
    assert.ok(Array.isArray(fake.calls()[0]));
  });

  it('8d. humanEditBody changes the body and updatedAt without recording a DevFlow call', () => {
    const fake = createFakeGitHub();
    fake.seedIssue({ title: 't', body: 'b' });
    const before = fake.issues[0].updatedAt;
    const callsBefore = fake.calls().length;

    fake.humanEditBody(1, 'edited by a human');
    assert.equal(fake.issues[0].body, 'edited by a human');
    assert.ok(fake.issues[0].updatedAt > before);
    assert.equal(fake.calls().length, callsBefore);

    assert.throws(() => fake.humanEditBody(99, 'x'), /no issue #99/);
  });

  it('8e. an argv shape the fake does not implement fails loudly, never quietly succeeds', () => {
    const fake = createFakeGitHub();
    const r = fake.runGh(['release', 'view', 'v1']);
    assert.equal(r.ok, false);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^\[gh-fake\] unsupported: release view v1/);
  });

  it('8g. with a `now` option, writeTimes() stamps every mutating call (and only those) with the caller\'s clock', () => {
    let clock = 5000;
    const fake = createFakeGitHub({ now: () => clock });
    fake.seedIssue({ title: 't', body: 'b' });

    fake.runGh(['issue', 'view', '1', ...R, '--json', 'number']); // read: not a write
    clock = 6000;
    fake.runGh(['issue', 'comment', '1', ...R, '--body', 'hi']);
    clock = 9500;
    fake.runGh(['issue', 'edit', '1', ...R, '--body', 'new']);

    assert.deepEqual(fake.writeTimes(), [6000, 9500]);
    assert.equal(fake.writes().length, 2, 'writeTimes() lines up with writes()');

    // Without a clock the stamps are simply absent, never a crash.
    const plain = createFakeGitHub();
    plain.seedIssue({ title: 't', body: 'b' });
    plain.runGh(['issue', 'comment', '1', ...R, '--body', 'hi']);
    assert.deepEqual(plain.writeTimes(), [null]);
  });

  it('8f. seedIssue registers its labels, so a later label create reports "already exists"', () => {
    const fake = createFakeGitHub();
    fake.seedIssue({ title: 't', body: 'b', labels: ['devflow:objective'] });
    const r = fake.runGh(['label', 'create', 'devflow:objective', ...R]);
    assert.equal(r.ok, false);
    assert.match(r.stderr, /already exists/i);
  });
});
