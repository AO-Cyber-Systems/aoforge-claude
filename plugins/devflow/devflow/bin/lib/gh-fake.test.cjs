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

  it('48-05 13. PATCH milestones/<n> edits title/description/state/due_on by NUMBER; GET returns one; unknown is 404', () => {
    const fake = createFakeGitHub();
    const n = fake.seedMilestone('v1.3', 'old');
    fake.seedMilestone('v1.4', 'other');

    const got = fake.runGh(['api', `repos/o/r/milestones/${n}`]);
    assert.equal(got.ok, true);
    assert.equal(json(got).title, 'v1.3');
    assert.equal(json(got).description, 'old');
    assert.equal(json(got).state, 'open');

    // -f fields (the gh form) on a PATCH
    const edited = fake.runGh(['api', '--method', 'PATCH', `repos/o/r/milestones/${n}`, '-f', 'description=new text', '-f', 'due_on=2026-12-31T00:00:00Z']);
    assert.equal(edited.ok, true);
    assert.equal(json(edited).description, 'new text');
    assert.equal(json(edited).due_on, '2026-12-31T00:00:00Z');
    assert.equal(json(edited).closed_at, null);

    // --input body; closing stamps closed_at
    const closed = fake.runGh(['api', '--method', 'PATCH', `repos/o/r/milestones/${n}`, '--input', '-'],
      { input: JSON.stringify({ state: 'closed', title: 'v1.3.0' }) });
    assert.equal(closed.ok, true);
    assert.equal(json(closed).state, 'closed');
    assert.equal(json(closed).title, 'v1.3.0');
    assert.match(json(closed).closed_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    assert.equal(fake.milestones.find((m) => m.number === n).state, 'closed');
    assert.equal(fake.milestones.find((m) => m.number === n).description, 'new text', 'fields not sent are kept');
    // the other milestone is untouched
    assert.equal(fake.milestones.find((m) => m.title === 'v1.4').description, 'other');

    // reopening clears closed_at
    const reopened = fake.runGh(['api', '-X', 'PATCH', `repos/o/r/milestones/${n}`, '-f', 'state=open']);
    assert.equal(json(reopened).state, 'open');
    assert.equal(json(reopened).closed_at, null);

    // an invalid state is a 422, the milestone is unchanged
    const bad = fake.runGh(['api', '-X', 'PATCH', `repos/o/r/milestones/${n}`, '-f', 'state=done']);
    assert.equal(bad.ok, false);
    assert.match(`${bad.stderr}\n${bad.stdout}`, /422/);
    assert.equal(fake.milestones.find((m) => m.number === n).state, 'open');

    // unknown number, other repo: 404
    const missing = fake.runGh(['api', '--method', 'PATCH', 'repos/o/r/milestones/99', '-f', 'state=closed']);
    assert.equal(missing.ok, false);
    assert.match(missing.stderr, /404/);
    assert.match(fake.runGh(['api', 'repos/o/r/milestones/99']).stderr, /404/);
    assert.match(fake.runGh(['api', 'repos/x/y/milestones/1']).stderr, /404/);

    // the writes are recorded (GET is not)
    const writes = fake.writes().filter((a) => a.some((t) => /milestones\/\d+$/.test(t)));
    assert.equal(writes.length, 5, 'four PATCHes plus the 404 PATCH are writes; the GETs are not');
    for (const w of writes) assert.equal(isWriteArgs(w), true);

    // the list reflects the edit
    const list = json(fake.runGh(['api', '--paginate', '--slurp', 'repos/o/r/milestones?state=all'])).flat();
    assert.equal(list.find((m) => m.number === n).description, 'new text');
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

// ─── 47 store REST shapes (TRD 47-02, Task 1) ────────────────────────────────

/** `gh api --method <m> <path> --input -` with a JSON body, the way the authoritative store writes. */
function restCall(fake, method, apiPath, body) {
  return fake.runGh(['api', '--method', method, apiPath, '--input', '-'], { input: JSON.stringify(body) });
}
const restGet = (fake, apiPath) => fake.runGh(['api', apiPath]);

describe('47 store REST shapes', () => {
  it('1. POST repos/o/r/issues --input - creates an issue whose id is never its number', () => {
    const fake = createFakeGitHub();
    fake.seedMilestone('v9.9');
    const r = restCall(fake, 'POST', 'repos/o/r/issues',
      { title: 't', body: 'b', labels: ['devflow:trd'], milestone: 1, type: 'TRD' });
    assert.equal(r.ok, true, r.stderr);
    const issue = json(r);
    assert.equal(issue.number, 1);
    assert.equal(issue.id, 1_000_000 + issue.number);
    assert.notEqual(issue.id, issue.number, 'Pitfall 1: id must never equal number');
    assert.equal(issue.node_id, `I_${issue.id}`);
    assert.equal(issue.html_url, 'https://github.com/o/r/issues/1');
    assert.equal(issue.title, 't');
    assert.equal(issue.body, 'b');
    assert.equal(issue.state, 'open');
    assert.deepEqual(issue.labels.map((l) => l.name), ['devflow:trd']);
    assert.equal(issue.milestone.number, 1);
    assert.equal(issue.milestone.title, 'v9.9');
    assert.equal(issue.type.name, 'TRD');
    assert.equal(issue.sub_issues_summary.total, 0);
    assert.equal(issue.sub_issues_summary.completed, 0);
    assert.equal(issue.issue_dependencies_summary.blocked_by, 0);
    assert.equal(issue.issue_dependencies_summary.blocking, 0);
    assert.match(issue.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

    // The stored issue (live array) carries the same id, and seed / gh create assign ids too.
    assert.equal(fake.issues[0].id, 1_000_001);
    const seeded = fake.seedIssue({ title: 's', body: '' });
    assert.equal(fake.issues[seeded - 1].id, 1_000_000 + seeded);
    fake.runGh(['issue', 'create', ...R, '--title', 'c', '--body', '']);
    assert.equal(fake.issues[2].id, 1_000_003);
  });

  it('1b. the type is null when the repo has no enabled type of that name; create refuses an unknown milestone', () => {
    const noTrd = createFakeGitHub({ types: [{ id: 1, name: 'Objective', is_enabled: true }] });
    assert.equal(json(restCall(noTrd, 'POST', 'repos/o/r/issues', { title: 't', type: 'TRD' })).type, null);

    const disabled = createFakeGitHub({ types: [{ id: 2, name: 'TRD', is_enabled: false }] });
    assert.equal(json(restCall(disabled, 'POST', 'repos/o/r/issues', { title: 't', type: 'TRD' })).type, null);

    const untyped = createFakeGitHub();
    assert.equal(json(restCall(untyped, 'POST', 'repos/o/r/issues', { title: 't' })).type, null);

    const bad = restCall(untyped, 'POST', 'repos/o/r/issues', { title: 't', milestone: 7 });
    assert.equal(bad.ok, false);
    assert.match(bad.stderr, /422/);
    assert.equal(untyped.issues.length, 1, 'a refused create stores nothing');

    const noTitle = restCall(untyped, 'POST', 'repos/o/r/issues', { body: 'b' });
    assert.equal(noTitle.ok, false);
    assert.match(noTitle.stderr, /422/);
  });

  it('1c. a REST create registers its labels (GitHub creates them implicitly); other repos are 404', () => {
    const fake = createFakeGitHub();
    restCall(fake, 'POST', 'repos/o/r/issues', { title: 't', labels: ['devflow:trd', { name: 'x' }] });
    assert.deepEqual(fake.labels, ['devflow:trd', 'x']);
    const r = restCall(fake, 'POST', 'repos/o/other/issues', { title: 't' });
    assert.equal(r.ok, false);
    assert.match(r.stderr, /404/);
  });

  it('2. --input - without opts.input fails; an unknown flag, --search and a file --input stay unsupported', () => {
    const fake = createFakeGitHub();
    const noBody = fake.runGh(['api', '--method', 'POST', 'repos/o/r/issues', '--input', '-']);
    assert.equal(noBody.ok, false);
    assert.match(noBody.stderr, /opts\.input/);
    assert.equal(fake.issues.length, 0);

    const garbage = fake.runGh(['api', '--method', 'POST', 'repos/o/r/issues', '--input', '-'], { input: '{not json' });
    assert.equal(garbage.ok, false);
    assert.match(garbage.stderr, /JSON/);

    for (const argv of [
      ['api', '--bogus', 'repos/o/r/issues'],
      ['api', 'repos/o/r/issues', '--search', 'devflow:id'],
      ['api', '--method', 'POST', 'repos/o/r/issues', '--input', 'body.json'],
    ]) {
      const r = fake.runGh(argv, { input: '{}' });
      assert.equal(r.ok, false, argv.join(' '));
      assert.match(r.stderr, /^\[gh-fake\] unsupported/, argv.join(' '));
    }
  });

  it('2b. a call with --input - counts as a write, and runGh still logs args only', () => {
    const fake = createFakeGitHub();
    restCall(fake, 'POST', 'repos/o/r/issues', { title: 't' });
    assert.equal(fake.calls().length, 1);
    assert.deepEqual(fake.calls()[0], ['api', '--method', 'POST', 'repos/o/r/issues', '--input', '-']);
    assert.equal(fake.writes().length, 1);
  });

  it('3. PATCH repos/o/r/issues/{n} updates title/body/state/state_reason/type/labels and advances updated_at; GET returns it', () => {
    const fake = createFakeGitHub();
    const created = json(restCall(fake, 'POST', 'repos/o/r/issues', { title: 't', body: 'b', labels: ['devflow:trd'] }));

    const r = restCall(fake, 'PATCH', 'repos/o/r/issues/1', {
      title: 't2', body: 'b2', state: 'closed', state_reason: 'not_planned', type: 'Decision', labels: ['devflow:decision'],
    });
    assert.equal(r.ok, true, r.stderr);
    const patched = json(r);
    assert.equal(patched.title, 't2');
    assert.equal(patched.body, 'b2');
    assert.equal(patched.state, 'closed');
    assert.equal(patched.state_reason, 'not_planned');
    assert.equal(patched.type.name, 'Decision');
    assert.deepEqual(patched.labels.map((l) => l.name), ['devflow:decision']);
    assert.ok(patched.updated_at > created.updated_at, 'a PATCH advances updated_at');
    assert.equal(patched.closed_at, patched.updated_at);

    const got = json(restGet(fake, 'repos/o/r/issues/1'));
    assert.equal(got.title, 't2');
    assert.equal(got.state, 'closed');
    assert.equal(got.updated_at, patched.updated_at);
    assert.equal(fake.issues[0].state, 'CLOSED', 'internal state stays gh-shaped');

    // Reopen, then clear the type; a no-op PATCH leaves updated_at alone.
    const reopened = json(restCall(fake, 'PATCH', 'repos/o/r/issues/1', { state: 'open', type: null }));
    assert.equal(reopened.state, 'open');
    assert.equal(reopened.state_reason, 'reopened');
    assert.equal(reopened.type, null);
    assert.equal(reopened.closed_at, null);
    const same = json(restCall(fake, 'PATCH', 'repos/o/r/issues/1', { title: 't2' }));
    assert.equal(same.updated_at, reopened.updated_at);

    assert.equal(restCall(fake, 'PATCH', 'repos/o/r/issues/99', { title: 'x' }).ok, false);
    assert.equal(restGet(fake, 'repos/o/r/issues/99').ok, false);
    assert.match(restCall(fake, 'PATCH', 'repos/o/r/issues/1', { state: 'weird' }).stderr, /422/);
  });

  it('3b. PATCH sets and clears the milestone by number and keeps gh --json milestone/updatedAt in step', () => {
    const fake = createFakeGitHub();
    fake.seedMilestone('v1');
    fake.seedMilestone('v2');
    restCall(fake, 'POST', 'repos/o/r/issues', { title: 't', milestone: 1 });
    assert.equal(fake.issues[0].milestone, 'v1');

    const moved = json(restCall(fake, 'PATCH', 'repos/o/r/issues/1', { milestone: 2 }));
    assert.equal(moved.milestone.number, 2);
    assert.equal(moved.milestone.title, 'v2');

    const gh = json(fake.runGh(['issue', 'view', '1', ...R, '--json', 'milestone,updatedAt']));
    assert.equal(gh.milestone.title, 'v2');
    assert.equal(gh.updatedAt, moved.updated_at, 'one internal field feeds gh --json updatedAt and REST updated_at');

    assert.equal(json(restCall(fake, 'PATCH', 'repos/o/r/issues/1', { milestone: null })).milestone, null);
    assert.match(restCall(fake, 'PATCH', 'repos/o/r/issues/1', { milestone: 9 }).stderr, /422/);
  });

  it('4. GET repos/o/r/issues?labels=&state= with --paginate --slurp lists only matching issues', () => {
    const fake = createFakeGitHub();
    fake.seedIssue({ title: 'a', labels: ['devflow:trd'] });
    fake.seedIssue({ title: 'b', labels: ['devflow:decision'] });
    fake.seedIssue({ title: 'c', labels: ['devflow:trd'], state: 'CLOSED' });
    fake.seedIssue({ title: 'd' });

    const all = json(fake.runGh(['api', '--paginate', '--slurp', 'repos/o/r/issues?labels=devflow:trd&state=all'])).flat();
    assert.deepEqual(all.map((i) => i.title), ['c', 'a'], 'newest first, only the labelled issues');

    const open = json(fake.runGh(['api', '--paginate', '--slurp', 'repos/o/r/issues?labels=devflow:trd'])).flat();
    assert.deepEqual(open.map((i) => i.title), ['a'], 'state defaults to open');

    const none = json(fake.runGh(['api', '--paginate', '--slurp', 'repos/o/r/issues?labels=devflow:nope&state=all']));
    assert.deepEqual(none, [[]]);

    const paged = json(fake.runGh(['api', '--paginate', '--slurp', 'repos/o/r/issues?labels=devflow:trd&state=all&per_page=1']));
    assert.equal(paged.length, 2, 'per_page is honoured');

    const asc = json(fake.runGh(['api', 'repos/o/r/issues?state=all&direction=asc']));
    assert.deepEqual(asc.map((i) => i.title), ['a', 'b', 'c', 'd']);
  });

  it('5. POST .../sub_issues links a child by id; GET sub_issues and GET parent show it; the parent updated_at advances', () => {
    const fake = createFakeGitHub();
    fake.seedIssue({ title: 'parent', body: 'unchanged body' });
    fake.seedIssue({ title: 'child' });
    fake.seedIssue({ title: 'second child' });
    const [parent, child, second] = fake.issues;
    const before = parent.updatedAt;

    const r = fake.runGh(['api', '--method', 'POST', 'repos/o/r/issues/1/sub_issues', '-F', `sub_issue_id=${child.id}`]);
    assert.equal(r.ok, true, r.stderr);
    assert.equal(json(r).number, 1, 'the response is the parent issue');
    assert.ok(parent.updatedAt > before, 'a link bumps the parent updated_at (Pitfall 2)');
    assert.equal(parent.body, 'unchanged body', 'the body did not change, so updated_at alone is not a remote-edit signal');

    // The same link through a typed --input body works as well.
    assert.equal(restCall(fake, 'POST', 'repos/o/r/issues/1/sub_issues', { sub_issue_id: second.id }).ok, true);

    const list = json(restGet(fake, 'repos/o/r/issues/1/sub_issues'));
    assert.deepEqual(list.map((i) => i.number), [2, 3], 'children in link order');
    assert.equal(list[0].parent_issue_url, 'https://api.github.com/repos/o/r/issues/1');

    const up = restGet(fake, 'repos/o/r/issues/2/parent');
    assert.equal(up.ok, true);
    assert.equal(json(up).number, 1);
    assert.equal(json(up).sub_issues_summary.total, 2);
    assert.equal(json(up).sub_issues_summary.completed, 0);
    assert.equal(parent.subIssues.length, 2);
    assert.equal(child.parent, 1);

    // A closed child counts as completed.
    restCall(fake, 'PATCH', 'repos/o/r/issues/2', { state: 'closed' });
    assert.equal(json(restGet(fake, 'repos/o/r/issues/1')).sub_issues_summary.completed, 1);
  });

  it('6. sub-issue rules: number-as-id is 404; duplicate, second parent, 101st child, other owner, self and cycle are 422', () => {
    const fake = createFakeGitHub();
    fake.seedIssue({ title: 'p1' });
    fake.seedIssue({ title: 'p2' });
    fake.seedIssue({ title: 'child' });
    const [p1, p2, child] = fake.issues;
    const link = (parentNumber, childId, extra = []) =>
      fake.runGh(['api', '--method', 'POST', `repos/o/r/issues/${parentNumber}/sub_issues`, '-F', `sub_issue_id=${childId}`, ...extra]);

    // Pitfall 1: the NUMBER is not an id.
    const byNumber = link(1, child.number);
    assert.equal(byNumber.ok, false);
    assert.match(byNumber.stderr, /404/);
    assert.equal(child.parent, null, 'nothing was linked');
    assert.equal(link(99, child.id).ok, false, 'unknown parent');

    assert.equal(link(1, child.id).ok, true);
    const dup = link(1, child.id);
    assert.equal(dup.ok, false);
    assert.match(dup.stderr, /422/);
    assert.equal(p1.subIssues.length, 1, 'a duplicate link adds nothing');

    const second = link(2, child.id);
    assert.equal(second.ok, false, 'one parent only');
    assert.match(second.stderr, /422/);
    assert.equal(child.parent, 1);

    const moved = link(2, child.id, ['-F', 'replace_parent=true']);
    assert.equal(moved.ok, true, moved.stderr);
    assert.equal(child.parent, 2);
    assert.deepEqual(p1.subIssues, []);
    assert.deepEqual(p2.subIssues, [3]);
    assert.equal(restGet(fake, 'repos/o/r/issues/3/parent').ok, true);

    assert.match(link(3, p2.id).stderr, /422/, 'a cycle (an ancestor as a child) is refused');
    assert.match(link(1, p1.id).stderr, /422/, 'an issue cannot be its own sub-issue');
    assert.match(link(1, undefined).stderr, /422/, 'sub_issue_id is required');

    fake.seedIssue({ title: 'elsewhere', owner: 'someone-else' });
    const foreign = link(1, fake.issues[fake.issues.length - 1].id);
    assert.equal(foreign.ok, false, 'the child must have the same repo owner');
    assert.match(foreign.stderr, /422/);
  });

  it('6b. a parent holds 100 children; the 101st link is 422', () => {
    const fake = createFakeGitHub();
    fake.seedIssue({ title: 'parent' });
    for (let i = 1; i <= 101; i++) fake.seedIssue({ title: `child ${i}` });
    const link = (n) => fake.runGh(['api', '--method', 'POST', 'repos/o/r/issues/1/sub_issues', '-F', `sub_issue_id=${fake.issues[n].id}`]);
    for (let n = 1; n <= 100; n++) assert.equal(link(n).ok, true, `child ${n}`);
    const over = link(101);
    assert.equal(over.ok, false);
    assert.match(over.stderr, /422/);
    assert.equal(fake.issues[0].subIssues.length, 100);
    assert.equal(fake.issues[101].parent, null);
  });

  it('7. DELETE .../sub_issue unlinks by id; GET parent is 404 afterwards', () => {
    const fake = createFakeGitHub();
    fake.seedIssue({ title: 'parent' });
    fake.seedIssue({ title: 'child' });
    fake.seedIssue({ title: 'stranger' });
    const [parent, child, stranger] = fake.issues;
    fake.runGh(['api', '--method', 'POST', 'repos/o/r/issues/1/sub_issues', '-F', `sub_issue_id=${child.id}`]);
    const linked = parent.updatedAt;

    const del = fake.runGh(['api', '--method', 'DELETE', 'repos/o/r/issues/1/sub_issue', '-F', `sub_issue_id=${child.id}`]);
    assert.equal(del.ok, true, del.stderr);
    assert.equal(json(del).number, 1);
    assert.ok(parent.updatedAt > linked, 'an unlink bumps the parent updated_at');
    assert.deepEqual(json(restGet(fake, 'repos/o/r/issues/1/sub_issues')), []);

    const up = restGet(fake, 'repos/o/r/issues/2/parent');
    assert.equal(up.ok, false);
    assert.match(up.stderr, /404/);
    assert.equal(restGet(fake, 'repos/o/r/issues/3/parent').ok, false, 'an issue that never had a parent is 404 too, not null');

    const notChild = fake.runGh(['api', '--method', 'DELETE', 'repos/o/r/issues/1/sub_issue', '-F', `sub_issue_id=${stranger.id}`]);
    assert.equal(notChild.ok, false);
    assert.match(notChild.stderr, /404/);
    const byNumber = fake.runGh(['api', '--method', 'DELETE', 'repos/o/r/issues/1/sub_issue', '-F', 'sub_issue_id=2']);
    assert.equal(byNumber.ok, false, 'the number is not an id');
  });

  it('8. dependencies: blocked_by add/list, blocking list, duplicate 422, number-as-id 404, DELETE removes', () => {
    const fake = createFakeGitHub();
    fake.seedIssue({ title: 'a' });
    fake.seedIssue({ title: 'b' });
    const [a, b] = fake.issues;
    const before = b.updatedAt;

    const add = fake.runGh(['api', '--method', 'POST', 'repos/o/r/issues/2/dependencies/blocked_by', '-F', `issue_id=${a.id}`]);
    assert.equal(add.ok, true, add.stderr);
    assert.equal(json(add).number, 2, 'n is the blocked issue');
    assert.equal(json(add).issue_dependencies_summary.blocked_by, 1);
    assert.ok(b.updatedAt > before, 'a dependency bumps the blocked issue updated_at (Pitfall 2)');

    assert.deepEqual(json(restGet(fake, 'repos/o/r/issues/2/dependencies/blocked_by')).map((i) => i.number), [1]);
    const blocking = json(restGet(fake, 'repos/o/r/issues/1/dependencies/blocking'));
    assert.deepEqual(blocking.map((i) => i.number), [2]);
    assert.equal(json(restGet(fake, 'repos/o/r/issues/1')).issue_dependencies_summary.blocking, 1);

    const dup = fake.runGh(['api', '--method', 'POST', 'repos/o/r/issues/2/dependencies/blocked_by', '-F', `issue_id=${a.id}`]);
    assert.equal(dup.ok, false);
    assert.match(dup.stderr, /422/);

    const byNumber = fake.runGh(['api', '--method', 'POST', 'repos/o/r/issues/2/dependencies/blocked_by', '-F', 'issue_id=1']);
    assert.equal(byNumber.ok, false);
    assert.match(byNumber.stderr, /404/);
    assert.match(fake.runGh(['api', '--method', 'POST', 'repos/o/r/issues/2/dependencies/blocked_by', '-F', `issue_id=${b.id}`]).stderr, /422/, 'self');

    assert.equal(fake.runGh(['api', '--method', 'DELETE', 'repos/o/r/issues/2/dependencies/blocked_by/1']).ok, false, 'number-as-id');
    const del = fake.runGh(['api', '--method', 'DELETE', `repos/o/r/issues/2/dependencies/blocked_by/${a.id}`]);
    assert.equal(del.ok, true, del.stderr);
    assert.deepEqual(json(restGet(fake, 'repos/o/r/issues/2/dependencies/blocked_by')), []);
    assert.deepEqual(json(restGet(fake, 'repos/o/r/issues/1/dependencies/blocking')), []);
    assert.equal(fake.runGh(['api', '--method', 'DELETE', `repos/o/r/issues/2/dependencies/blocked_by/${a.id}`]).ok, false, 'already removed');
  });

  it('8b. DevFlow comment and label writes bump updated_at exactly as GitHub does', () => {
    const fake = createFakeGitHub();
    fake.seedIssue({ title: 'a', body: 'body' });
    const t0 = fake.issues[0].updatedAt;
    fake.runGh(['api', '-X', 'POST', 'repos/o/r/issues/1/comments', '-f', 'body=hello']);
    const t1 = fake.issues[0].updatedAt;
    assert.ok(t1 > t0);
    restCall(fake, 'PATCH', 'repos/o/r/issues/1', { labels: ['devflow:trd'] });
    const t2 = fake.issues[0].updatedAt;
    assert.ok(t2 > t1);
    assert.equal(fake.issues[0].body, 'body', 'the body never changed through any of those writes');
  });
});

// ─── 47 capability variants, offline, human comment edit (TRD 47-02, Task 2) ─

describe('47 capability variants and controls', () => {
  it('9. GET repos/o/r answers repo meta from the options', () => {
    const def = json(restGet(createFakeGitHub(), 'repos/o/r'));
    assert.equal(def.full_name, 'o/r');
    assert.equal(def.name, 'r');
    assert.equal(def.owner.login, 'o');
    assert.equal(def.owner.type, 'Organization');
    assert.equal(def.has_wiki, true);
    assert.equal(def.permissions.push, true);
    assert.equal(def.private, false);

    const user = json(restGet(createFakeGitHub({ ownerType: 'User', hasWiki: false, push: false, isPrivate: true }), 'repos/o/r'));
    assert.equal(user.owner.type, 'User');
    assert.equal(user.has_wiki, false);
    assert.equal(user.permissions.push, false);
    assert.equal(user.private, true);

    const other = restGet(createFakeGitHub(), 'repos/o/elsewhere');
    assert.equal(other.ok, false);
    assert.match(other.stderr, /404/);
  });

  it('10. GET orgs/o/issue-types lists the configured types for an Organization and is 404 for a User', () => {
    const org = createFakeGitHub();
    const list = json(restGet(org, 'orgs/o/issue-types'));
    assert.deepEqual(list.map((t) => t.name), ['Objective', 'TRD', 'Decision']);
    assert.ok(list.every((t) => t.is_enabled === true && Number.isInteger(t.id)));
    assert.equal(json(org.runGh(['api', '--paginate', '--slurp', 'orgs/o/issue-types'])).flat().length, 3);

    const custom = createFakeGitHub({ types: [{ id: 9, name: 'TRD', is_enabled: false }] });
    assert.deepEqual(json(restGet(custom, 'orgs/o/issue-types')), [{ id: 9, name: 'TRD', is_enabled: false }]);

    const user = restGet(createFakeGitHub({ ownerType: 'User' }), 'orgs/o/issue-types');
    assert.equal(user.ok, false);
    assert.match(user.stderr, /404/);
    assert.match(restGet(createFakeGitHub(), 'orgs/not-the-owner/issue-types').stderr, /404/);
  });

  it('10b. an issue type is silently dropped (type null) for a User owner, without push, or when not enabled (D-08)', () => {
    const create = (opts) => json(restCall(createFakeGitHub(opts), 'POST', 'repos/o/r/issues', { title: 't', type: 'TRD' }));
    assert.equal(create({}).type.name, 'TRD');
    assert.equal(create({ ownerType: 'User' }).type, null);
    assert.equal(create({ push: false }).type, null);
    assert.equal(create({ types: [{ id: 2, name: 'TRD', is_enabled: false }] }).type, null);

    // PATCH drops it the same way, leaving the issue untouched; the issue is still created.
    const user = createFakeGitHub({ ownerType: 'User' });
    restCall(user, 'POST', 'repos/o/r/issues', { title: 't' });
    const patched = json(restCall(user, 'PATCH', 'repos/o/r/issues/1', { type: 'Decision' }));
    assert.equal(patched.type, null);
    assert.equal(user.issues.length, 1);
  });

  it('11. GET orgs/o/issue-fields lists the definitions; issue-field-values GET / POST merge / PUT replace', () => {
    const fake = createFakeGitHub();
    fake.seedIssue({ title: 'a' });
    const defs = json(restGet(fake, 'orgs/o/issue-fields'));
    assert.deepEqual(defs, [
      { id: 11, name: 'work', data_type: 'single_select' },
      { id: 12, name: 'kind', data_type: 'single_select' },
    ]);

    const path = 'repos/o/r/issues/1/issue-field-values';
    assert.deepEqual(json(restGet(fake, path)), []);

    const before = fake.issues[0].updatedAt;
    const first = restCall(fake, 'POST', path, { issue_field_values: [{ field_id: 11, value: 'feature' }] });
    assert.equal(first.ok, true, first.stderr);
    assert.deepEqual(json(first), [{ field_id: 11, value: 'feature' }]);
    assert.ok(fake.issues[0].updatedAt > before, 'a field write bumps updated_at');

    const merged = json(restCall(fake, 'POST', path, { issue_field_values: [{ field_id: 12, value: 'plugin' }, { field_id: 11, value: 'port' }] }));
    assert.deepEqual(merged, [{ field_id: 11, value: 'port' }, { field_id: 12, value: 'plugin' }], 'POST merges by field_id');
    assert.deepEqual(json(restGet(fake, path)), merged);

    const replaced = json(restCall(fake, 'PUT', path, { issue_field_values: [{ field_id: 12, value: 'api' }] }));
    assert.deepEqual(replaced, [{ field_id: 12, value: 'api' }], 'PUT replaces the whole set');
    assert.deepEqual(json(restGet(fake, path)), replaced);

    const unknown = restCall(fake, 'POST', path, { issue_field_values: [{ field_id: 999, value: 'x' }] });
    assert.equal(unknown.ok, false);
    assert.match(unknown.stderr, /422/);
    assert.match(restCall(fake, 'POST', path, {}).stderr, /422/, 'issue_field_values is required');
    assert.match(restGet(fake, 'repos/o/r/issues/9/issue-field-values').stderr, /404/);
  });

  it('11b. issue fields and their values are 404 for a User owner; a custom field list is served as given', () => {
    const user = createFakeGitHub({ ownerType: 'User' });
    user.seedIssue({ title: 'a' });
    assert.match(restGet(user, 'orgs/o/issue-fields').stderr, /404/);
    assert.match(restGet(user, 'repos/o/r/issues/1/issue-field-values').stderr, /404/);
    assert.match(restCall(user, 'POST', 'repos/o/r/issues/1/issue-field-values', { issue_field_values: [{ field_id: 11, value: 'x' }] }).stderr, /404/);
    assert.match(restCall(user, 'PUT', 'repos/o/r/issues/1/issue-field-values', { issue_field_values: [] }).stderr, /404/);

    const custom = createFakeGitHub({ fields: [{ id: 5, name: 'size', data_type: 'text' }] });
    assert.deepEqual(json(restGet(custom, 'orgs/o/issue-fields')), [{ id: 5, name: 'size', data_type: 'text' }]);
    const none = createFakeGitHub({ fields: [] });
    assert.deepEqual(json(restGet(none, 'orgs/o/issue-fields')), []);
  });

  it('12. subIssuesApi:false answers 404 on every sub-issue and parent route; dependencies and issues still work', () => {
    const fake = createFakeGitHub({ subIssuesApi: false });
    fake.seedIssue({ title: 'parent' });
    fake.seedIssue({ title: 'child' });
    const child = fake.issues[1];

    for (const argv of [
      ['api', 'repos/o/r/issues/1/sub_issues'],
      ['api', '--method', 'POST', 'repos/o/r/issues/1/sub_issues', '-F', `sub_issue_id=${child.id}`],
      ['api', '--method', 'DELETE', 'repos/o/r/issues/1/sub_issue', '-F', `sub_issue_id=${child.id}`],
      ['api', 'repos/o/r/issues/2/parent'],
    ]) {
      const r = fake.runGh(argv);
      assert.equal(r.ok, false, argv.join(' '));
      assert.match(r.stderr, /404/, argv.join(' '));
    }
    assert.equal(child.parent, null, 'nothing was linked');

    assert.equal(restGet(fake, 'repos/o/r/issues/1').ok, true);
    assert.equal(fake.runGh(['api', '--method', 'POST', 'repos/o/r/issues/2/dependencies/blocked_by', '-F', `issue_id=${fake.issues[0].id}`]).ok, true);
    assert.equal(fake.subIssuesApi, false);
    assert.equal(createFakeGitHub().subIssuesApi, true);
  });

  it('13. setOffline(true) fails every call like an outage (reads, writes, auth) yet still logs them; setOffline(false) restores', () => {
    const fake = createFakeGitHub();
    fake.seedIssue({ title: 'a' });
    const calls = [
      ['api', 'repos/o/r'],
      ['issue', 'create', ...R, '--title', 't', '--body', 'b'],
      ['api', '--method', 'POST', 'repos/o/r/issues', '--input', '-'],
      ['auth', 'status'],
    ];

    fake.setOffline(true);
    for (const argv of calls) {
      const r = fake.runGh(argv, { input: JSON.stringify({ title: 'x' }) });
      assert.equal(r.ok, false, argv.join(' '));
      assert.equal(r.status, null, 'an outage has no exit status');
      assert.equal(r.stdout, '');
      assert.match(r.stderr, /could not resolve host/i);
    }
    assert.equal(fake.calls().length, calls.length, 'offline calls are still logged');
    assert.equal(fake.writes().length, 2, 'and still classified as writes');
    assert.equal(fake.issues.length, 1, 'nothing was created while offline');

    // An offline call does not consume a queued failure; that fires once the network is back.
    fake.failNext('api repos/o/r', { stderr: 'queued' });
    fake.runGh(['api', 'repos/o/r']);
    fake.setOffline(false);
    assert.equal(fake.runGh(['api', 'repos/o/r']).stderr, 'queued');
    assert.equal(fake.runGh(['api', 'repos/o/r']).ok, true);
    assert.equal(restCall(fake, 'POST', 'repos/o/r/issues', { title: 'back online' }).ok, true);
    assert.equal(fake.issues.length, 2);
  });

  it('14. humanEditComment changes the body and updated_at without recording a call', () => {
    const fake = createFakeGitHub();
    fake.seedIssue({ title: 'a' });
    const id = fake.seedComment(1, 'original');
    const before = fake.comments[0].updated_at;
    const callsBefore = fake.calls().length;

    fake.humanEditComment(id, 'edited by a human');
    assert.equal(fake.comments[0].body, 'edited by a human');
    assert.ok(fake.comments[0].updated_at > before);
    assert.equal(fake.calls().length, callsBefore, 'no DevFlow call is recorded');
    assert.equal(json(restGet(fake, `repos/o/r/issues/comments/${id}`)).body, 'edited by a human');

    assert.throws(() => fake.humanEditComment(4242, 'x'), /no comment #4242/);
  });

  it('14b. ownerType and subIssuesApi are exposed read-only', () => {
    const fake = createFakeGitHub({ ownerType: 'User' });
    assert.equal(fake.ownerType, 'User');
    assert.throws(() => { fake.ownerType = 'Organization'; }, TypeError);
    assert.throws(() => { fake.subIssuesApi = false; }, TypeError);
    assert.equal(createFakeGitHub().ownerType, 'Organization');
  });
});
