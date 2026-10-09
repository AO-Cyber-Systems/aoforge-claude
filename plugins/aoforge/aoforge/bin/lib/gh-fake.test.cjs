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
  assert.equal(fake.runGh(['label', 'create', 'aoforge:objective', ...R, '--color', '0e8a16']).ok, true);
  assert.equal(fake.runGh(['api', 'repos/o/r/milestones', '-f', 'title=v1.4']).ok, true);
  return fake;
}

// ─── Tests 1-4: issues ───────────────────────────────────────────────────────

describe('issue create / view / list / edit / comment / close', () => {
  it('1. issue create returns the issue URL and stores the issue; numbers increment from 1', () => {
    const fake = fakeWithLabelAndMilestone();

    const a = fake.runGh(['issue', 'create', ...R, '--title', '[Objective 2] a', '--body', 'body A',
      '--label', 'aoforge:objective', '--milestone', 'v1.4']);
    assert.equal(a.ok, true);
    assert.equal(a.stdout, 'https://github.com/o/r/issues/1');

    const b = fake.runGh(['issue', 'create', ...R, '--title', 'second', '--body', 'body B']);
    assert.equal(b.stdout, 'https://github.com/o/r/issues/2');

    assert.equal(fake.issues.length, 2);
    const first = fake.issues[0];
    assert.equal(first.number, 1);
    assert.equal(first.title, '[Objective 2] a');
    assert.equal(first.body, 'body A');
    assert.deepEqual(first.labels, ['aoforge:objective']);
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
    fake.runGh(['issue', 'create', ...R, '--title', 'T', '--body', 'B', '--label', 'aoforge:objective', '--milestone', 'v1.4']);

    const r = fake.runGh(['issue', 'view', '1', ...R, '--json', 'number,title,body,state,updatedAt,labels,assignees,milestone']);
    assert.equal(r.ok, true);
    const got = json(r);
    assert.deepEqual(Object.keys(got).sort(), ['assignees', 'body', 'labels', 'milestone', 'number', 'state', 'title', 'updatedAt']);
    assert.equal(got.number, 1);
    assert.deepEqual(got.labels, [{ name: 'aoforge:objective' }]);
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
    fake.seedIssue({ title: 'one', body: 'b1', labels: ['aoforge:objective'] });
    fake.seedIssue({ title: 'two', body: 'b2', labels: ['other'] });
    fake.seedIssue({ title: 'three', body: 'b3', labels: ['aoforge:objective'], state: 'CLOSED' });

    const all = json(fake.runGh(['issue', 'list', ...R, '--label', 'aoforge:objective', '--state', 'all', '--limit', '1000', '--json', 'number,title,body']));
    assert.deepEqual(all.map((i) => i.number).sort(), [1, 3]);
    assert.deepEqual(Object.keys(all[0]).sort(), ['body', 'number', 'title']);

    const open = json(fake.runGh(['issue', 'list', ...R, '--label', 'aoforge:objective', '--json', 'number']));
    assert.deepEqual(open.map((i) => i.number), [1], 'default state is open');

    const limited = json(fake.runGh(['issue', 'list', ...R, '--state', 'all', '--limit', '2', '--json', 'number']));
    assert.equal(limited.length, 2);
  });

  it('3b. issue list refuses --search: AOForge must list-and-scan, never search', () => {
    const fake = createFakeGitHub();
    const r = fake.runGh(['issue', 'list', ...R, '--search', 'aoforge:id', '--json', 'number']);
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
    const created = fake.runGh(['api', 'repos/o/r/milestones', '-f', 'title=v1.4', '-f', 'description=AOForge milestone for p']);
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
    assert.equal(fake.runGh(['label', 'create', 'aoforge:objective', ...R, '--color', '0e8a16', '--description', 'd']).ok, true);
    const again = fake.runGh(['label', 'create', 'aoforge:objective', ...R, '--color', '0e8a16']);
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

  it('8d. humanEditBody changes the body and updatedAt without recording an AOForge call', () => {
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
    fake.seedIssue({ title: 't', body: 'b', labels: ['aoforge:objective'] });
    const r = fake.runGh(['label', 'create', 'aoforge:objective', ...R]);
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
      { title: 't', body: 'b', labels: ['aoforge:trd'], milestone: 1, type: 'TRD' });
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
    assert.deepEqual(issue.labels.map((l) => l.name), ['aoforge:trd']);
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
    restCall(fake, 'POST', 'repos/o/r/issues', { title: 't', labels: ['aoforge:trd', { name: 'x' }] });
    assert.deepEqual(fake.labels, ['aoforge:trd', 'x']);
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
      ['api', 'repos/o/r/issues', '--search', 'aoforge:id'],
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
    const created = json(restCall(fake, 'POST', 'repos/o/r/issues', { title: 't', body: 'b', labels: ['aoforge:trd'] }));

    const r = restCall(fake, 'PATCH', 'repos/o/r/issues/1', {
      title: 't2', body: 'b2', state: 'closed', state_reason: 'not_planned', type: 'Decision', labels: ['aoforge:decision'],
    });
    assert.equal(r.ok, true, r.stderr);
    const patched = json(r);
    assert.equal(patched.title, 't2');
    assert.equal(patched.body, 'b2');
    assert.equal(patched.state, 'closed');
    assert.equal(patched.state_reason, 'not_planned');
    assert.equal(patched.type.name, 'Decision');
    assert.deepEqual(patched.labels.map((l) => l.name), ['aoforge:decision']);
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
    fake.seedIssue({ title: 'a', labels: ['aoforge:trd'] });
    fake.seedIssue({ title: 'b', labels: ['aoforge:decision'] });
    fake.seedIssue({ title: 'c', labels: ['aoforge:trd'], state: 'CLOSED' });
    fake.seedIssue({ title: 'd' });

    const all = json(fake.runGh(['api', '--paginate', '--slurp', 'repos/o/r/issues?labels=aoforge:trd&state=all'])).flat();
    assert.deepEqual(all.map((i) => i.title), ['c', 'a'], 'newest first, only the labelled issues');

    const open = json(fake.runGh(['api', '--paginate', '--slurp', 'repos/o/r/issues?labels=aoforge:trd'])).flat();
    assert.deepEqual(open.map((i) => i.title), ['a'], 'state defaults to open');

    const none = json(fake.runGh(['api', '--paginate', '--slurp', 'repos/o/r/issues?labels=aoforge:nope&state=all']));
    assert.deepEqual(none, [[]]);

    const paged = json(fake.runGh(['api', '--paginate', '--slurp', 'repos/o/r/issues?labels=aoforge:trd&state=all&per_page=1']));
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

  it('8b. AOForge comment and label writes bump updated_at exactly as GitHub does', () => {
    const fake = createFakeGitHub();
    fake.seedIssue({ title: 'a', body: 'body' });
    const t0 = fake.issues[0].updatedAt;
    fake.runGh(['api', '-X', 'POST', 'repos/o/r/issues/1/comments', '-f', 'body=hello']);
    const t1 = fake.issues[0].updatedAt;
    assert.ok(t1 > t0);
    restCall(fake, 'PATCH', 'repos/o/r/issues/1', { labels: ['aoforge:trd'] });
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
    assert.equal(fake.calls().length, callsBefore, 'no AOForge call is recorded');
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

// ─── 49-01 pull requests, viewer, comment authors (TRD 49-01, Task 1) ────────

const BRANCH = 'df/objective-49-x';
const BASE_SHA = `base${'0'.repeat(36)}`;

/** `POST repos/o/r/pulls` the way the flusher sends it: a JSON body on stdin. */
const openPr = (fake, head, extra = {}) => restCall(fake, 'POST', 'repos/o/r/pulls',
  { title: 'T', head, base: 'main', body: 'B', ...extra });

describe('49-01 pull requests', () => {
  it('1. a PR is an issue record on the SAME counter: numbers 1 and 2, REST issues lists both, gh issue list only the issue', () => {
    const fake = createFakeGitHub();
    const made = fake.runGh(['issue', 'create', ...R, '--title', 'an issue', '--body', 'b']);
    assert.equal(made.stdout, 'https://github.com/o/r/issues/1');

    fake.pushRef(BRANCH, 'c1');
    const pr = openPr(fake, BRANCH, { draft: true });
    assert.equal(pr.ok, true, pr.stderr);
    assert.equal(json(pr).number, 2, 'an issue and a PR never share a number');
    assert.equal(fake.issues.length, 2);
    assert.equal(fake.issues[1].number, 2);

    const rows = json(fake.runGh(['api', '--paginate', '--slurp', 'repos/o/r/issues?state=all'])).flat();
    assert.deepEqual(rows.map((r) => r.number).sort(), [1, 2]);
    assert.equal(rows.find((r) => r.number === 1).pull_request, undefined);
    assert.ok(rows.find((r) => r.number === 2).pull_request, 'the PR carries pull_request');
    assert.equal(rows.find((r) => r.number === 2).node_id, 'PR_2');

    // gh issue list never shows pull requests; a label-filtered REST list shows one only when labelled.
    const cli = json(fake.runGh(['issue', 'list', ...R, '--state', 'all', '--json', 'number']));
    assert.deepEqual(cli.map((r) => r.number), [1]);
    restCall(fake, 'PATCH', 'repos/o/r/issues/2', { labels: ['aoforge:trd'] });
    const labelled = json(fake.runGh(['api', '--paginate', '--slurp', 'repos/o/r/issues?labels=aoforge:trd'])).flat();
    assert.deepEqual(labelled.map((r) => r.number), [2]);
  });

  it('2. GET repos/o/r answers default_branch and node_id; GET user answers the viewer login', () => {
    const repo = json(restGet(createFakeGitHub(), 'repos/o/r'));
    assert.equal(repo.default_branch, 'main');
    assert.equal(repo.node_id, 'R_1');
    assert.equal(json(restGet(createFakeGitHub({ defaultBranch: 'trunk' }), 'repos/o/r')).default_branch, 'trunk');

    assert.equal(json(restGet(createFakeGitHub(), 'user')).login, 'aoforge-bot');
    assert.equal(json(restGet(createFakeGitHub({ viewer: 'alice' }), 'user')).login, 'alice');
  });

  it('3. POST pulls opens a draft PR from a pushed branch; GET pulls filters by head and state; PATCH pulls/{n} edits it', () => {
    const fake = createFakeGitHub();
    fake.pushRef(BRANCH, 'c1');

    const r = openPr(fake, BRANCH, { draft: true, body: 'Closes #1' });
    assert.equal(r.ok, true, r.stderr);
    const pr = json(r);
    assert.equal(pr.number, 1);
    assert.equal(pr.node_id, 'PR_1');
    assert.equal(pr.draft, true);
    assert.equal(pr.state, 'open');
    assert.equal(pr.merged, false);
    assert.equal(pr.merged_at, null);
    assert.equal(pr.head.ref, BRANCH);
    assert.equal(pr.head.sha, 'c1');
    assert.equal(pr.base.ref, 'main');
    assert.equal(pr.user.login, 'aoforge-bot');
    assert.equal(pr.body, 'Closes #1');
    assert.equal(pr.html_url, 'https://github.com/o/r/pull/1');

    const found = json(restGet(fake, `repos/o/r/pulls?head=o:${BRANCH}&state=all`));
    assert.deepEqual(found.map((p) => p.number), [1]);
    assert.deepEqual(json(restGet(fake, 'repos/o/r/pulls?head=o:df/other&state=all')), []);
    assert.deepEqual(json(restGet(fake, 'repos/o/r/pulls?head=elsewhere:df/objective-49-x&state=all')), [], 'the head owner must match');
    assert.equal(json(restGet(fake, 'repos/o/r/pulls')).length, 1, 'state defaults to open');

    const patched = restCall(fake, 'PATCH', 'repos/o/r/pulls/1', { body: 'Closes #1\nCloses #2', title: 'T2' });
    assert.equal(patched.ok, true, patched.stderr);
    assert.equal(json(patched).body, 'Closes #1\nCloses #2');
    assert.equal(json(restGet(fake, 'repos/o/r/pulls/1')).title, 'T2');
    assert.equal(json(restGet(fake, 'repos/o/r/issues/1')).body, 'Closes #1\nCloses #2', 'the issues view of a PR is the same record');

    const closed = json(restCall(fake, 'PATCH', 'repos/o/r/pulls/1', { state: 'closed' }));
    assert.equal(closed.state, 'closed');
    assert.equal(closed.merged, false);
    assert.deepEqual(json(restGet(fake, 'repos/o/r/pulls')), [], 'a closed PR leaves the default (open) list');
    assert.equal(json(restGet(fake, 'repos/o/r/pulls?state=closed')).length, 1);

    assert.match(restGet(fake, 'repos/o/r/pulls/9').stderr, /404/);
    assert.match(restCall(fake, 'PATCH', 'repos/o/r/pulls/9', { title: 'x' }).stderr, /404/);
    assert.equal(fake.runGh(['api', 'repos/o/r/pulls', '--paginate', '--slurp']).ok, true);
  });

  it('3b. POST pulls refuses a missing title, an unknown head or base, and a second open PR for the same head', () => {
    const fake = createFakeGitHub();
    fake.pushRef(BRANCH, 'c1');
    assert.match(openPr(fake, BRANCH, { title: '' }).stderr, /422/);
    const noHead = openPr(fake, 'df/never-pushed');
    assert.equal(noHead.ok, false);
    assert.match(noHead.stderr, /422/);
    assert.match(openPr(fake, BRANCH, { base: 'release' }).stderr, /422/);
    assert.equal(fake.issues.length, 0, 'a refused create stores nothing');

    assert.equal(openPr(fake, BRANCH).ok, true);
    const dup = openPr(fake, BRANCH);
    assert.equal(dup.ok, false);
    assert.match(dup.stderr, /422/);
    assert.match(dup.stderr, /already exists/);
    assert.equal(fake.issues.length, 1);

    // a head given as owner:branch is the same head
    fake.pushRef('df/two', 'c2');
    assert.equal(openPr(fake, 'o:df/two').ok, true);
  });

  it('4. POST pulls whose head tip equals the base tip is 422 "No commits between <base> and <head>"', () => {
    const fake = createFakeGitHub();
    assert.equal(fake.refs.main, BASE_SHA);
    fake.pushRef(BRANCH, fake.refs.main); // linked branch created at the base tip, no commit yet

    const r = openPr(fake, BRANCH, { draft: true });
    assert.equal(r.ok, false);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, new RegExp(`No commits between main and ${BRANCH}`));
    assert.match(r.stderr, /422/);
    assert.equal(fake.issues.length, 0);

    fake.pushRef(BRANCH, 'c1'); // a commit lands
    assert.equal(openPr(fake, BRANCH, { draft: true }).ok, true);
  });

  it('9. PUT pulls/{n}/merge merges and closes a ready PR; a draft PR is 405 "Pull Request is still a draft"', () => {
    const fake = createFakeGitHub();
    fake.pushRef('df/draft', 'c1');
    fake.pushRef('df/ready', 'c2');
    openPr(fake, 'df/draft', { draft: true });
    openPr(fake, 'df/ready', { draft: false });

    const blocked = restCall(fake, 'PUT', 'repos/o/r/pulls/1/merge', { merge_method: 'squash' });
    assert.equal(blocked.ok, false);
    assert.match(blocked.stderr, /405/);
    assert.match(blocked.stderr, /Pull Request is still a draft/);
    assert.equal(json(restGet(fake, 'repos/o/r/pulls/1')).state, 'open');

    const merged = restCall(fake, 'PUT', 'repos/o/r/pulls/2/merge', { merge_method: 'squash' });
    assert.equal(merged.ok, true, merged.stderr);
    assert.equal(json(merged).merged, true);
    assert.equal(typeof json(merged).sha, 'string');
    const after = json(restGet(fake, 'repos/o/r/pulls/2'));
    assert.equal(after.state, 'closed');
    assert.equal(after.merged, true);
    assert.match(after.merged_at, /^\d{4}-\d{2}-\d{2}T/);

    const again = restCall(fake, 'PUT', 'repos/o/r/pulls/2/merge', { merge_method: 'squash' });
    assert.equal(again.ok, false);
    assert.match(again.stderr, /405/);
    assert.match(restCall(fake, 'PUT', 'repos/o/r/pulls/9/merge', {}).stderr, /404/);
  });

  it('9b. an unknown merge_method is 422; the method AOForge asked for is recorded on the PR record', () => {
    const fake = createFakeGitHub();
    fake.pushRef('df/ready', 'c2');
    openPr(fake, 'df/ready', { draft: false });
    const bad = restCall(fake, 'PUT', 'repos/o/r/pulls/1/merge', { merge_method: 'fast-forward' });
    assert.equal(bad.ok, false);
    assert.match(bad.stderr, /422/);
    assert.equal(json(restGet(fake, 'repos/o/r/pulls/1')).merged, false);

    assert.equal(restCall(fake, 'PUT', 'repos/o/r/pulls/1/merge', { merge_method: 'rebase' }).ok, true);
    assert.equal(fake.issues[0].pr.mergeMethod, 'rebase');
  });

  it('12. comments carry an author: the viewer for API posts, a seeded login otherwise; seeded assignees show on the issue', () => {
    const fake = createFakeGitHub();
    fake.seedIssue({ title: 'a', assignees: ['alice'] });
    restCall(fake, 'POST', 'repos/o/r/issues/1/comments', { body: 'from aoforge' });
    fake.runGh(['issue', 'comment', '1', ...R, '--body', 'via the cli']);
    const seeded = fake.seedComment(1, 'from a stranger', { login: 'mallory' });
    const plain = fake.seedComment(1, 'no login given');

    const list = json(fake.runGh(['api', '--paginate', '--slurp', 'repos/o/r/issues/1/comments'])).flat();
    assert.deepEqual(list.map((c) => c.user.login), ['aoforge-bot', 'aoforge-bot', 'mallory', 'aoforge-bot']);
    assert.equal(fake.comments.find((c) => c.id === seeded).user.login, 'mallory');
    assert.equal(fake.comments.find((c) => c.id === plain).user.login, 'aoforge-bot');

    assert.deepEqual(json(restGet(fake, 'repos/o/r/issues/1')).assignees, [{ login: 'alice' }]);

    const alice = createFakeGitHub({ viewer: 'alice' });
    alice.seedIssue({ title: 'a' });
    restCall(alice, 'POST', 'repos/o/r/issues/1/comments', { body: 'mine' });
    alice.seedComment(1, 'seeded as the viewer');
    assert.deepEqual(alice.comments.map((c) => c.user.login), ['alice', 'alice']);
    assert.match(alice.runGh(['auth', 'status']).stdout, /account alice/);
    assert.match(createFakeGitHub().runGh(['auth', 'status']).stdout, /account aoforge-bot/);
  });

  it('12b. the viewer and a seeded ref set leave every default unchanged; refs are live and seedable', () => {
    const plain = createFakeGitHub();
    assert.deepEqual(plain.refs, { main: BASE_SHA });
    const custom = createFakeGitHub({ defaultBranch: 'trunk', refs: { 'df/seeded': 's1' } });
    assert.deepEqual(custom.refs, { trunk: BASE_SHA, 'df/seeded': 's1' });
    custom.pushRef('df/seeded', 's2');
    assert.equal(custom.refs['df/seeded'], 's2', 'pushRef advances a ref and records no gh call');
    assert.equal(custom.calls().length, 0);
  });
});

// ─── 49-01 linked branches, ready, merge queue, statuses, refs, human merge (TRD 49-01, Task 2) ───

const Q_CREATE_BRANCH = 'mutation($issueId: ID!, $oid: GitObjectID!, $name: String!, $repositoryId: ID!) {'
  + ' createLinkedBranch(input:{issueId:$issueId, oid:$oid, name:$name, repositoryId:$repositoryId})'
  + ' { linkedBranch { id ref { name target { oid } } } } }';
const Q_LINKED_BRANCHES = 'query($owner:String!,$name:String!,$n:Int!){ repository(owner:$owner,name:$name){'
  + ' issue(number:$n){ id linkedBranches(first:10){ nodes { ref { name } } } } } }';
const Q_READY = 'mutation($id: ID!){ markPullRequestReadyForReview(input:{pullRequestId:$id}){ pullRequest { isDraft } } }';
const Q_MERGE_QUEUE = 'query($o:String!,$n:String!,$b:String!){ repository(owner:$o,name:$n){ mergeQueue(branch:$b){ id } } }';
const Q_ENQUEUE = 'mutation($id: ID!){ enqueuePullRequest(input:{pullRequestId:$id}){ mergeQueueEntry { id } } }';

/** `gh api graphql -f query=... -f k=v` (numbers go as -F, which gh types as Int). */
const gql = (query, vars = {}) => ['api', 'graphql', '-f', `query=${query}`,
  ...Object.entries(vars).flatMap(([k, v]) => [typeof v === 'number' ? '-F' : '-f', `${k}=${v}`])];

/** A fake with objective issue #1, ready to hang a linked branch off. */
function fakeWithObjectiveIssue(opts = {}) {
  const fake = createFakeGitHub(opts);
  fake.seedIssue({ title: '[Objective 49] lifecycle' });
  const issueId = json(restGet(fake, 'repos/o/r/issues/1')).node_id;
  const repositoryId = json(restGet(fake, 'repos/o/r')).node_id;
  return { fake, issueId, repositoryId };
}

describe('49-01 branches, statuses and merge', () => {
  it('5. linkedBranches reads empty; createLinkedBranch adds the ref at oid and calls onCreateBranch once; a second read lists it', () => {
    const mirrored = [];
    const { fake, issueId, repositoryId } = fakeWithObjectiveIssue({ onCreateBranch: (name, oid) => mirrored.push([name, oid]) });
    assert.equal(issueId, 'I_1000001', 'the node id, never the number');
    const setupCalls = fake.calls().length; // the helper read the issue and repo node ids
    const setupWrites = fake.writes().length;

    const none = fake.runGh(gql(Q_LINKED_BRANCHES, { owner: 'o', name: 'r', n: 1 }));
    assert.equal(none.ok, true, none.stderr);
    assert.equal(json(none).data.repository.issue.id, issueId);
    assert.deepEqual(json(none).data.repository.issue.linkedBranches.nodes, []);

    const made = fake.runGh(gql(Q_CREATE_BRANCH, { issueId, oid: fake.refs.main, name: BRANCH, repositoryId }));
    assert.equal(made.ok, true, made.stderr);
    const lb = json(made).data.createLinkedBranch.linkedBranch;
    assert.equal(lb.ref.name, BRANCH);
    assert.equal(lb.ref.target.oid, BASE_SHA);
    assert.deepEqual(mirrored, [[BRANCH, BASE_SHA]], 'onCreateBranch runs once, on success');
    assert.equal(fake.refs[BRANCH], BASE_SHA, 'the ref now exists at oid');

    const again = fake.runGh(gql(Q_LINKED_BRANCHES, { owner: 'o', name: 'r', n: 1 }));
    assert.deepEqual(json(again).data.repository.issue.linkedBranches.nodes.map((n) => n.ref.name), [BRANCH]);
    assert.equal(mirrored.length, 1, 'a read never creates a branch');

    // A mutation is a recorded write, a query is not (gh-client isWriteArgs classification).
    assert.equal(fake.calls().length - setupCalls, 3);
    assert.equal(fake.writes().length - setupWrites, 1);
    assert.ok(isWriteArgs(fake.writes()[0]));
    assert.match(fake.writes()[0].join(' '), /createLinkedBranch/);
  });

  it('5b. createLinkedBranch refuses a number for the issue id, an unknown repository id and a missing oid', () => {
    const { fake, issueId, repositoryId } = fakeWithObjectiveIssue();
    const before = { ...fake.refs };
    assert.equal(fake.runGh(gql(Q_CREATE_BRANCH, { issueId: 1, oid: BASE_SHA, name: BRANCH, repositoryId })).ok, false, 'number as id');
    assert.equal(fake.runGh(gql(Q_CREATE_BRANCH, { issueId: 1_000_001, oid: BASE_SHA, name: BRANCH, repositoryId })).ok, false, 'REST id as node id');
    assert.equal(fake.runGh(gql(Q_CREATE_BRANCH, { issueId, oid: BASE_SHA, name: BRANCH, repositoryId: 'R_99' })).ok, false, 'wrong repository');
    assert.equal(fake.runGh(gql(Q_CREATE_BRANCH, { issueId, name: BRANCH, repositoryId })).ok, false, 'oid is required');
    assert.deepEqual(fake.refs, before, 'a refused mutation changes nothing');

    const missing = fake.runGh(gql(Q_LINKED_BRANCHES, { owner: 'o', name: 'r', n: 99 }));
    assert.equal(missing.ok, false);
    assert.match(missing.stderr, /Could not resolve to an Issue/);
  });

  it('6. createLinkedBranch on a name that already exists returns linkedBranch null: no callback, refs unchanged', () => {
    const mirrored = [];
    const { fake, issueId, repositoryId } = fakeWithObjectiveIssue({
      refs: { [BRANCH]: 'someone-elses' }, onCreateBranch: (name, oid) => mirrored.push([name, oid]),
    });
    const before = { ...fake.refs };

    const r = fake.runGh(gql(Q_CREATE_BRANCH, { issueId, oid: BASE_SHA, name: BRANCH, repositoryId }));
    assert.equal(r.ok, true, 'the real API answers 200 with a null, not an error (Pitfall 2)');
    assert.deepEqual(json(r), { data: { createLinkedBranch: { linkedBranch: null } } });
    assert.deepEqual(mirrored, []);
    assert.deepEqual(fake.refs, before);
    const nodes = json(fake.runGh(gql(Q_LINKED_BRANCHES, { owner: 'o', name: 'r', n: 1 }))).data.repository.issue.linkedBranches.nodes;
    assert.deepEqual(nodes, [], 'the existing branch was not linked');
  });

  it('7. markPullRequestReadyForReview clears isDraft; on a ready PR it stays ready without an error', () => {
    const fake = createFakeGitHub();
    fake.pushRef(BRANCH, 'c1');
    const pr = json(openPr(fake, BRANCH, { draft: true }));
    assert.equal(pr.node_id, 'PR_1');

    const r = fake.runGh(gql(Q_READY, { id: pr.node_id }));
    assert.equal(r.ok, true, r.stderr);
    assert.equal(json(r).data.markPullRequestReadyForReview.pullRequest.isDraft, false);
    assert.equal(json(restGet(fake, 'repos/o/r/pulls/1')).draft, false);

    const again = fake.runGh(gql(Q_READY, { id: pr.node_id }));
    assert.equal(again.ok, true, again.stderr);
    assert.equal(json(again).data.markPullRequestReadyForReview.pullRequest.isDraft, false);

    const unknown = fake.runGh(gql(Q_READY, { id: 'PR_77' }));
    assert.equal(unknown.ok, false);
    assert.match(unknown.stderr, /Could not resolve to a node/);
    assert.equal(fake.writes().length, 4, 'the PR create and the three ready mutations are writes');
  });

  it('8. mergeQueue is null by default and {id} with the option; enqueuePullRequest queues without merging', () => {
    const plain = createFakeGitHub();
    const probe = plain.runGh(gql(Q_MERGE_QUEUE, { o: 'o', n: 'r', b: 'main' }));
    assert.equal(probe.ok, true, probe.stderr);
    assert.deepEqual(json(probe), { data: { repository: { mergeQueue: null } } });
    assert.equal(plain.writes().length, 0, 'the probe is a read');

    const fake = createFakeGitHub({ mergeQueue: true, refs: { release: 'r1' } });
    assert.deepEqual(json(fake.runGh(gql(Q_MERGE_QUEUE, { o: 'o', n: 'r', b: 'main' }))).data.repository.mergeQueue, { id: 'MQ_1' });
    assert.equal(json(fake.runGh(gql(Q_MERGE_QUEUE, { o: 'o', n: 'r', b: 'release' }))).data.repository.mergeQueue, null, 'only the default branch has a queue');

    fake.pushRef('df/draft', 'c1');
    fake.pushRef('df/ready', 'c2');
    openPr(fake, 'df/draft', { draft: true });
    openPr(fake, 'df/ready', { draft: false });
    assert.equal(fake.runGh(gql(Q_ENQUEUE, { id: 'PR_1' })).ok, false, 'a draft cannot be queued');

    const q = fake.runGh(gql(Q_ENQUEUE, { id: 'PR_2' }));
    assert.equal(q.ok, true, q.stderr);
    assert.ok(json(q).data.enqueuePullRequest.mergeQueueEntry.id);
    const after = json(restGet(fake, 'repos/o/r/pulls/2'));
    assert.equal(after.state, 'open', 'queued is not merged');
    assert.equal(after.merged, false);
    assert.equal(after.queued, true);
    assert.equal(json(restGet(fake, 'repos/o/r/pulls/1')).queued, false);

    plain.pushRef('df/ready', 'c2');
    openPr(plain, 'df/ready', { draft: false });
    const noQueue = plain.runGh(gql(Q_ENQUEUE, { id: 'PR_1' }));
    assert.equal(noQueue.ok, false, 'without a queue there is nothing to enqueue into');
    assert.match(noQueue.stderr, /merge queue/i);
    assert.equal(json(restGet(plain, 'repos/o/r/pulls/1')).queued, false);
  });

  it('10. POST statuses/{sha} then GET commits/{sha}/status: one entry per context, latest wins, combined state', () => {
    const fake = createFakeGitHub();
    const none = json(restGet(fake, 'repos/o/r/commits/c1/status'));
    assert.equal(none.state, 'pending', 'no statuses is pending');
    assert.equal(none.total_count, 0);
    assert.deepEqual(none.statuses, []);

    const first = restCall(fake, 'POST', 'repos/o/r/statuses/c1',
      { state: 'success', context: 'aoforge/verification', description: 'Objective 49 verified (12/12 must-haves)' });
    assert.equal(first.ok, true, first.stderr);
    assert.equal(json(first).state, 'success');
    assert.equal(json(first).context, 'aoforge/verification');
    assert.equal(json(first).creator.login, 'aoforge-bot');

    const one = json(restGet(fake, 'repos/o/r/commits/c1/status'));
    assert.equal(one.state, 'success');
    assert.equal(one.sha, 'c1');
    assert.equal(one.statuses.length, 1);
    assert.equal(one.statuses[0].context, 'aoforge/verification');
    assert.equal(one.statuses[0].description, 'Objective 49 verified (12/12 must-haves)');

    restCall(fake, 'POST', 'repos/o/r/statuses/c1', { state: 'failure', context: 'aoforge/verification', description: 'gaps found' });
    const two = json(restGet(fake, 'repos/o/r/commits/c1/status'));
    assert.equal(two.state, 'failure');
    assert.equal(two.statuses.length, 1, 'still one entry for the context');
    assert.equal(two.statuses[0].description, 'gaps found');
    assert.equal(fake.statuses.c1.length, 2, 'the history keeps both, newest first');
    assert.equal(fake.statuses.c1[0].state, 'failure');

    restCall(fake, 'POST', 'repos/o/r/statuses/c1', { state: 'success', context: 'ci/other' });
    const three = json(restGet(fake, 'repos/o/r/commits/c1/status'));
    assert.equal(three.statuses.length, 2);
    assert.equal(three.state, 'failure', 'any failing context fails the commit');
    restCall(fake, 'POST', 'repos/o/r/statuses/c1', { state: 'success', context: 'aoforge/verification' });
    assert.equal(json(restGet(fake, 'repos/o/r/commits/c1/status')).state, 'success');
    restCall(fake, 'POST', 'repos/o/r/statuses/c1', { state: 'pending', context: 'ci/other' });
    assert.equal(json(restGet(fake, 'repos/o/r/commits/c1/status')).state, 'pending');

    assert.deepEqual(json(restGet(fake, 'repos/o/r/commits/other-sha/status')).statuses, [], 'statuses are per sha');
    const bad = restCall(fake, 'POST', 'repos/o/r/statuses/c1', { state: 'great', context: 'x' });
    assert.equal(bad.ok, false);
    assert.match(bad.stderr, /422/);
  });

  it('11. DELETE git/refs/heads/<b> removes the ref (a second delete is 422); GET git/ref/heads/<b> answers the sha or 404', () => {
    const fake = createFakeGitHub();
    fake.pushRef(BRANCH, 'c1');

    const got = json(restGet(fake, `repos/o/r/git/ref/heads/${BRANCH}`));
    assert.equal(got.ref, `refs/heads/${BRANCH}`);
    assert.equal(got.object.sha, 'c1');
    assert.equal(json(restGet(fake, 'repos/o/r/git/ref/heads/main')).object.sha, BASE_SHA);
    assert.match(restGet(fake, 'repos/o/r/git/ref/heads/df/missing').stderr, /404/);

    const del = fake.runGh(['api', '--method', 'DELETE', `repos/o/r/git/refs/heads/${BRANCH}`]);
    assert.equal(del.ok, true, del.stderr);
    assert.equal(del.stdout, '', 'a 204 prints nothing');
    assert.equal(fake.refs[BRANCH], undefined);
    assert.match(restGet(fake, `repos/o/r/git/ref/heads/${BRANCH}`).stderr, /404/);

    const second = fake.runGh(['api', '--method', 'DELETE', `repos/o/r/git/refs/heads/${BRANCH}`]);
    assert.equal(second.ok, false);
    assert.match(second.stderr, /422/);
    assert.match(second.stderr, /Reference does not exist/);
    assert.equal(fake.writes().length, 2, 'both deletes are writes; the reads are not');
  });

  it('11b. deleting a branch drops its issue link, so the name can be linked again', () => {
    const { fake, issueId, repositoryId } = fakeWithObjectiveIssue();
    fake.runGh(gql(Q_CREATE_BRANCH, { issueId, oid: BASE_SHA, name: BRANCH, repositoryId }));
    fake.runGh(['api', '--method', 'DELETE', `repos/o/r/git/refs/heads/${BRANCH}`]);
    const nodes = json(fake.runGh(gql(Q_LINKED_BRANCHES, { owner: 'o', name: 'r', n: 1 }))).data.repository.issue.linkedBranches.nodes;
    assert.deepEqual(nodes, []);
    const again = fake.runGh(gql(Q_CREATE_BRANCH, { issueId, oid: BASE_SHA, name: BRANCH, repositoryId }));
    assert.notEqual(json(again).data.createLinkedBranch.linkedBranch, null);
  });

  it('13. humanMergePr merges a PR and closes each Closes #N issue only for the default branch, honouring closeKeywordCap', () => {
    function scenario(opts, base = 'main') {
      const fake = createFakeGitHub({ refs: { release: 'r1' }, ...opts });
      fake.seedIssue({ title: 'objective' });
      fake.seedIssue({ title: 'trd' });
      fake.pushRef(BRANCH, 'c1');
      openPr(fake, BRANCH, { base, draft: false, body: 'Closes #1\nCloses #2' });
      const calls = fake.calls().length;
      fake.humanMergePr(3);
      assert.equal(fake.calls().length, calls, 'a human merge records no AOForge call');
      return fake;
    }
    const state = (fake) => fake.issues.slice(0, 2).map((i) => i.state);

    const all = scenario({});
    assert.deepEqual(state(all), ['CLOSED', 'CLOSED']);
    assert.ok(all.issues.slice(0, 2).every((i) => i.stateReason === 'completed'));
    const merged = json(restGet(all, 'repos/o/r/pulls/3'));
    assert.equal(merged.merged, true);
    assert.equal(merged.state, 'closed');
    assert.match(merged.merged_at, /^\d{4}-\d{2}-\d{2}T/);

    assert.deepEqual(state(scenario({}, 'release')), ['OPEN', 'OPEN'], 'a merge into a non-default branch closes nothing');
    assert.deepEqual(state(scenario({ closeKeywordCap: 1 })), ['CLOSED', 'OPEN'], 'only the first link is honoured under a cap of 1');
    assert.deepEqual(state(scenario({ defaultBranch: 'trunk', refs: { main: 'm1' } }, 'main')), ['OPEN', 'OPEN'], 'main is not the default branch here');
  });

  it('13b. the closing-keyword grammar: closes/fixes/resolves, any case, a colon, dedup; PRs and closed issues are skipped', () => {
    const fake = createFakeGitHub();
    for (const t of ['a', 'b', 'c', 'd', 'e']) fake.seedIssue({ title: t });
    fake.issues[4].state = 'CLOSED';
    const closedAt = fake.issues[4].updatedAt;
    fake.pushRef(BRANCH, 'c1');
    openPr(fake, BRANCH, { draft: false, body: 'closes #1, Fixes: #2\nRESOLVED #3\nCloses #1\nRefs #4\nCloses #5\nCloses #6' });
    fake.humanMergePr(6, { method: 'squash' });
    assert.deepEqual(fake.issues.slice(0, 5).map((i) => i.state), ['CLOSED', 'CLOSED', 'CLOSED', 'OPEN', 'CLOSED']);
    assert.equal(fake.issues[4].updatedAt, closedAt, 'an already closed issue is left alone');
    assert.equal(fake.issues[5].pr.mergeMethod, 'squash');
    assert.equal(fake.issues[5].state, 'CLOSED');
  });

  it('13c. a REST merge closes the keyword issues too; humanMergePr completes a queued PR; misuse throws', () => {
    const fake = createFakeGitHub({ mergeQueue: true });
    fake.seedIssue({ title: 'objective' });
    fake.pushRef('df/a', 'c1');
    fake.pushRef('df/b', 'c2');
    openPr(fake, 'df/a', { draft: false, body: 'Closes #1' });
    openPr(fake, 'df/b', { draft: false, body: 'nothing' });

    assert.equal(restCall(fake, 'PUT', 'repos/o/r/pulls/2/merge', { merge_method: 'squash' }).ok, true);
    assert.equal(fake.issues[0].state, 'CLOSED', 'GitHub closes keyword issues on any merge to the default branch');

    fake.runGh(gql(Q_ENQUEUE, { id: 'PR_3' }));
    assert.equal(json(restGet(fake, 'repos/o/r/pulls/3')).queued, true);
    fake.humanMergePr(3);
    const done = json(restGet(fake, 'repos/o/r/pulls/3'));
    assert.equal(done.merged, true);
    assert.equal(done.queued, false, 'the queue entry is consumed by the merge');

    assert.throws(() => fake.humanMergePr(3), /already merged/);
    assert.throws(() => fake.humanMergePr(1), /no pull request #1/, 'an issue is not a PR');
    assert.throws(() => fake.humanMergePr(99), /no pull request #99/);
    assert.throws(() => fake.humanMergePr(2, { method: 'fast-forward' }), /merge method/);
  });

  it('15. a caller graphql handler still answers every query the built-ins do not; the built-ins win for theirs', () => {
    const seen = [];
    const fake = createFakeGitHub({
      graphql: (argv) => { seen.push(argv); return JSON.stringify({ data: { custom: true } }); },
    });
    const custom = fake.runGh(gql('query($x:Int!){ something(x:$x){ id } }', { x: 1 }));
    assert.deepEqual(json(custom), { data: { custom: true } });
    assert.equal(seen.length, 1);

    const probe = fake.runGh(gql(Q_MERGE_QUEUE, { o: 'o', n: 'r', b: 'main' }));
    assert.deepEqual(json(probe), { data: { repository: { mergeQueue: null } } });
    assert.equal(seen.length, 1, 'a built-in query never reaches the caller');

    const bare = createFakeGitHub();
    const unsupported = bare.runGh(gql('query{ viewer { login } }'));
    assert.equal(unsupported.ok, false);
    assert.match(unsupported.stderr, /unsupported/);
  });

  it('16. a PR can be opened off a linked branch only once a commit lands on it (Pitfall 1, end to end)', () => {
    const { fake, issueId, repositoryId } = fakeWithObjectiveIssue();
    fake.runGh(gql(Q_CREATE_BRANCH, { issueId, oid: fake.refs.main, name: BRANCH, repositoryId }));
    const early = openPr(fake, BRANCH, { draft: true });
    assert.equal(early.ok, false);
    assert.match(early.stderr, /No commits between main and df\/objective-49-x/);

    fake.pushRef(BRANCH, 'c1');
    const pr = openPr(fake, BRANCH, { draft: true, body: 'Closes #1' });
    assert.equal(pr.ok, true, pr.stderr);
    assert.equal(json(pr).head.sha, 'c1');
    fake.pushRef(BRANCH, 'c2');
    assert.equal(json(restGet(fake, 'repos/o/r/pulls/2')).head.sha, 'c2', 'an open PR follows its branch');
  });
});

// ─── 50-01 setup and check routes (TRD 50-01) ────────────────────────────────

const MERGE_QUEUE_RULE = {
  type: 'merge_queue',
  parameters: {
    check_response_timeout_minutes: 60, grouping_strategy: 'ALLGREEN', max_entries_to_build: 5,
    max_entries_to_merge: 5, merge_method: 'SQUASH', min_entries_to_merge: 1, min_entries_to_merge_wait_minutes: 5,
  },
};

/** The body setup POSTs for the default-branch ruleset (50-RESEARCH), without the merge queue rule. */
const RULESET_BODY = {
  name: 'aoforge: default branch',
  target: 'branch',
  enforcement: 'active',
  conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
  bypass_actors: [],
  rules: [
    { type: 'non_fast_forward' },
    { type: 'deletion' },
    { type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'aoforge/linked-issue' }], strict_required_status_checks_policy: false } },
  ],
};

describe('50-01 setup routes', () => {
  it('1. rulesets: POST then list shows the summary, GET by id the stored body, PUT replaces rules, every write is recorded', () => {
    const fake = createFakeGitHub();
    assert.deepEqual(json(restGet(fake, 'repos/o/r/rulesets')), []);

    const made = restCall(fake, 'POST', 'repos/o/r/rulesets', RULESET_BODY);
    assert.equal(made.ok, true, made.stderr);
    assert.equal(json(made).id, 9001, 'ruleset ids start at 9001');

    assert.deepEqual(json(restGet(fake, 'repos/o/r/rulesets')),
      [{ id: 9001, name: 'aoforge: default branch', target: 'branch', enforcement: 'active' }],
      'the list carries summaries only, like GitHub');
    // The full object carries GitHub's computed per-viewer field (55-01): no admin bypass is listed, so `never`.
    assert.deepEqual(json(restGet(fake, 'repos/o/r/rulesets/9001')), { id: 9001, ...RULESET_BODY, current_user_can_bypass: 'never' });
    assert.equal('current_user_can_bypass' in fake.rulesets[0], false, 'the computed field is never stored');

    const put = restCall(fake, 'PUT', 'repos/o/r/rulesets/9001', { rules: [{ type: 'deletion' }] });
    assert.equal(put.ok, true, put.stderr);
    assert.deepEqual(json(put).rules, [{ type: 'deletion' }]);
    const after = json(restGet(fake, 'repos/o/r/rulesets/9001'));
    assert.deepEqual(after.rules, [{ type: 'deletion' }], 'PUT replaces rules');
    assert.equal(after.name, RULESET_BODY.name, 'a field the PUT leaves out is kept');
    assert.deepEqual(after.conditions, RULESET_BODY.conditions);

    const second = json(restCall(fake, 'POST', 'repos/o/r/rulesets', { name: 'other', enforcement: 'disabled' }));
    assert.equal(second.id, 9002);
    assert.equal(second.target, 'branch', 'target defaults to branch');
    assert.deepEqual(second.rules, []);
    assert.deepEqual(second.bypass_actors, []);
    assert.deepEqual(fake.rulesets.map((r) => r.id), [9001, 9002], 'the live store is readable');

    const slurped = json(fake.runGh(['api', '--paginate', '--slurp', 'repos/o/r/rulesets'])).flat();
    assert.deepEqual(slurped.map((r) => r.id), [9001, 9002]);

    assert.equal(fake.writes().length, 3);
    assert.ok(fake.writes().every((a) => isWriteArgs(a)));
    assert.deepEqual(fake.writes().map((a) => a[2]), ['POST', 'PUT', 'POST']);
  });

  it('1b. rulesets: seeded through the option, refused when invalid, 404 for an unknown id or another repo', () => {
    const fake = createFakeGitHub({ rulesets: [{ name: 'seeded', target: 'branch', enforcement: 'active', rules: [{ type: 'deletion' }] }] });
    assert.deepEqual(json(restGet(fake, 'repos/o/r/rulesets')).map((r) => [r.id, r.name]), [[9001, 'seeded']]);
    assert.equal(json(restCall(fake, 'POST', 'repos/o/r/rulesets', { name: 'next', enforcement: 'active' })).id, 9002);

    const dup = restCall(fake, 'POST', 'repos/o/r/rulesets', { name: 'seeded', enforcement: 'active' });
    assert.equal(dup.ok, false);
    assert.match(dup.stderr, /HTTP 422/);
    const noName = restCall(fake, 'POST', 'repos/o/r/rulesets', { enforcement: 'active' });
    assert.match(noName.stderr, /HTTP 422/);
    const noEnforcement = restCall(fake, 'POST', 'repos/o/r/rulesets', { name: 'x' });
    assert.match(noEnforcement.stderr, /HTTP 422/);
    const badEnforcement = restCall(fake, 'POST', 'repos/o/r/rulesets', { name: 'x', enforcement: 'loud' });
    assert.match(badEnforcement.stderr, /HTTP 422/);
    assert.equal(fake.rulesets.length, 2, 'a refused body stores nothing');

    assert.match(restGet(fake, 'repos/o/r/rulesets/12345').stderr, /HTTP 404/);
    assert.match(restCall(fake, 'PUT', 'repos/o/r/rulesets/12345', { rules: [] }).stderr, /HTTP 404/);
    assert.match(restGet(fake, 'repos/o/elsewhere/rulesets').stderr, /HTTP 404/);
    assert.match(restCall(fake, 'POST', 'repos/o/elsewhere/rulesets', RULESET_BODY).stderr, /HTTP 404/);

    const rename = restCall(fake, 'PUT', 'repos/o/r/rulesets/9002', { name: 'seeded' });
    assert.match(rename.stderr, /HTTP 422/, 'a rename onto an existing name is refused');
  });

  it('2. merge queue: mergeQueueAllowed:false refuses a merge_queue rule with 422 and stores nothing; the same body without it is stored', () => {
    const fake = createFakeGitHub({ mergeQueueAllowed: false });
    const refused = restCall(fake, 'POST', 'repos/o/r/rulesets', { ...RULESET_BODY, rules: [...RULESET_BODY.rules, MERGE_QUEUE_RULE] });
    assert.equal(refused.ok, false);
    assert.equal(refused.status, 1);
    assert.equal(refused.stderr, 'gh: Validation Failed (HTTP 422)');
    assert.equal(fake.rulesets.length, 0, 'nothing stored on a refusal');

    const stored = restCall(fake, 'POST', 'repos/o/r/rulesets', RULESET_BODY);
    assert.equal(stored.ok, true, stored.stderr);
    assert.equal(fake.rulesets.length, 1);

    const upgrade = restCall(fake, 'PUT', 'repos/o/r/rulesets/9001', { rules: [...RULESET_BODY.rules, MERGE_QUEUE_RULE] });
    assert.equal(upgrade.ok, false);
    assert.equal(upgrade.stderr, 'gh: Validation Failed (HTTP 422)');
    assert.deepEqual(fake.rulesets[0].rules, RULESET_BODY.rules, 'a refused PUT leaves the ruleset as it was');

    const allowed = createFakeGitHub();
    const withQueue = restCall(allowed, 'POST', 'repos/o/r/rulesets', { ...RULESET_BODY, rules: [...RULESET_BODY.rules, MERGE_QUEUE_RULE] });
    assert.equal(withQueue.ok, true, 'mergeQueueAllowed defaults to true');
    assert.ok(allowed.rulesets[0].rules.some((r) => r.type === 'merge_queue'));
  });

  it('3. isAdmin:false: ruleset writes and PATCH repos/o/r are 403, reads still work', () => {
    const fake = createFakeGitHub({ isAdmin: false, rulesets: [{ name: 'seeded', enforcement: 'active' }] });

    const post = restCall(fake, 'POST', 'repos/o/r/rulesets', RULESET_BODY);
    assert.equal(post.ok, false);
    assert.match(post.stderr, /HTTP 403/);
    assert.doesNotMatch(post.stderr, /rate limit/i, 'a bare 403 is a permission error, never a rate limit');
    assert.match(restCall(fake, 'PUT', 'repos/o/r/rulesets/9001', { rules: [] }).stderr, /HTTP 403/);
    assert.match(restCall(fake, 'PATCH', 'repos/o/r', { has_wiki: true }).stderr, /HTTP 403/);
    assert.equal(fake.rulesets.length, 1);

    assert.equal(restGet(fake, 'repos/o/r/rulesets').ok, true);
    assert.equal(restGet(fake, 'repos/o/r/rulesets/9001').ok, true);
    const repo = json(restGet(fake, 'repos/o/r'));
    assert.equal(repo.has_wiki, true, 'the refused PATCH changed nothing');
    assert.equal(repo.permissions.admin, false, 'a non-admin token does not see admin permission');
    assert.equal(json(restGet(createFakeGitHub(), 'repos/o/r')).permissions.admin, true);
  });

  it('4. PATCH repos/o/r sets has_wiki and delete_branch_on_merge, and GET repos/o/r reflects both', () => {
    const fake = createFakeGitHub({ hasWiki: false });
    const before = json(restGet(fake, 'repos/o/r'));
    assert.equal(before.has_wiki, false);
    assert.equal(before.delete_branch_on_merge, false);

    const patched = restCall(fake, 'PATCH', 'repos/o/r', { has_wiki: true, delete_branch_on_merge: true });
    assert.equal(patched.ok, true, patched.stderr);
    assert.equal(json(patched).has_wiki, true);
    assert.equal(json(patched).delete_branch_on_merge, true);

    const after = json(restGet(fake, 'repos/o/r'));
    assert.equal(after.has_wiki, true);
    assert.equal(after.delete_branch_on_merge, true);
    assert.equal(after.full_name, 'o/r', 'the rest of the repo meta is unchanged');

    restCall(fake, 'PATCH', 'repos/o/r', { delete_branch_on_merge: false });
    const partial = json(restGet(fake, 'repos/o/r'));
    assert.equal(partial.has_wiki, true, 'a PATCH touches only the fields it names');
    assert.equal(partial.delete_branch_on_merge, false);

    assert.equal(json(restGet(createFakeGitHub({ deleteBranchOnMerge: true }), 'repos/o/r')).delete_branch_on_merge, true,
      'the option seeds it');

    assert.deepEqual(fake.writes().map((a) => a[2]), ['PATCH', 'PATCH']);
    assert.match(restCall(fake, 'PATCH', 'repos/o/elsewhere', { has_wiki: true }).stderr, /HTTP 404/);
  });

  it('5. GET repos/o/r/labels lists the labels gh label create made, with their colour and description', () => {
    const fake = createFakeGitHub();
    assert.deepEqual(json(restGet(fake, 'repos/o/r/labels')), []);
    assert.equal(fake.runGh(['label', 'create', 'aoforge:objective', ...R, '--color', '0e8a16', '--description', 'An objective']).ok, true);
    assert.equal(fake.runGh(['label', 'create', 'aoforge:trd', ...R]).ok, true);

    const rows = json(restGet(fake, 'repos/o/r/labels'));
    assert.deepEqual(rows.map((l) => l.name), ['aoforge:objective', 'aoforge:trd']);
    assert.equal(rows[0].color, '0e8a16');
    assert.equal(rows[0].description, 'An objective');
    assert.equal(rows[1].description, null, 'no description is null, like GitHub');
    assert.match(rows[1].color, /^[0-9a-f]{6}$/);
    assert.ok(rows.every((l) => Number.isInteger(l.id)));

    const paged = json(fake.runGh(['api', '--paginate', '--slurp', 'repos/o/r/labels'])).flat();
    assert.equal(paged.length, 2);
    assert.match(restGet(fake, 'repos/o/elsewhere/labels').stderr, /HTTP 404/);
  });

  it('6. issue types: POST adds an enabled type, PUT enables a disabled seeded one; a User owner is 404 and orgAdmin:false is 403', () => {
    const fake = createFakeGitHub();
    const made = restCall(fake, 'POST', 'orgs/o/issue-types', { name: 'Bug', description: 'A defect', color: 'red', is_enabled: true });
    assert.equal(made.ok, true, made.stderr);
    const bug = json(made);
    assert.equal(bug.id, 'IT_1');
    assert.equal(bug.name, 'Bug');
    assert.equal(bug.is_enabled, true);
    assert.equal(bug.description, 'A defect');
    assert.equal(bug.color, 'red');
    assert.deepEqual(json(restGet(fake, 'orgs/o/issue-types')).map((t) => t.name), ['Objective', 'TRD', 'Decision', 'Bug']);
    const issue = json(restCall(fake, 'POST', 'repos/o/r/issues', { title: 't', type: 'Bug' }));
    assert.equal(issue.type.name, 'Bug', 'a created type is the one issue.type resolves against');
    assert.equal(json(restCall(fake, 'POST', 'orgs/o/issue-types', { name: 'Spike', is_enabled: true })).id, 'IT_2');

    const patched = restCall(fake, 'PUT', 'orgs/o/issue-types/IT_1', { description: 'Broken', color: 'orange' });
    assert.equal(patched.ok, true, patched.stderr);
    assert.equal(json(patched).description, 'Broken');
    assert.equal(json(patched).name, 'Bug', 'a PUT touches only the fields it names');
    assert.equal(json(patched).is_enabled, true);

    const seed = [{ id: 9, name: 'TRD', is_enabled: false }];
    const disabled = createFakeGitHub({ types: seed });
    assert.equal(json(restCall(disabled, 'POST', 'repos/o/r/issues', { title: 't', type: 'TRD' })).type, null);
    const enabled = restCall(disabled, 'PUT', 'orgs/o/issue-types/9', { is_enabled: true });
    assert.equal(enabled.ok, true, enabled.stderr);
    assert.deepEqual(json(enabled), { id: 9, name: 'TRD', is_enabled: true });
    assert.deepEqual(json(restGet(disabled, 'orgs/o/issue-types')), [{ id: 9, name: 'TRD', is_enabled: true }]);
    assert.equal(json(restCall(disabled, 'POST', 'repos/o/r/issues', { title: 'u', type: 'TRD' })).type.name, 'TRD');
    assert.equal(seed[0].is_enabled, false, 'a write never mutates an options array the test owns');

    assert.match(restCall(fake, 'PUT', 'orgs/o/issue-types/IT_99', { is_enabled: true }).stderr, /HTTP 404/);
    assert.match(restCall(fake, 'POST', 'orgs/o/issue-types', { name: 'Bug', is_enabled: true }).stderr, /HTTP 422/, 'a duplicate name');
    assert.match(restCall(fake, 'POST', 'orgs/o/issue-types', { is_enabled: true }).stderr, /HTTP 422/, 'name is required');
    assert.match(restCall(fake, 'POST', 'orgs/o/issue-types', { name: 'Chore' }).stderr, /HTTP 422/, 'is_enabled is required');
    assert.equal(json(restGet(fake, 'orgs/o/issue-types')).length, 5, 'refused bodies store nothing');

    const user = createFakeGitHub({ ownerType: 'User' });
    assert.match(restCall(user, 'POST', 'orgs/o/issue-types', { name: 'Bug', is_enabled: true }).stderr, /HTTP 404/);
    assert.match(restCall(user, 'PUT', 'orgs/o/issue-types/1', { is_enabled: false }).stderr, /HTTP 404/);
    assert.match(restCall(fake, 'POST', 'orgs/elsewhere/issue-types', { name: 'Bug2', is_enabled: true }).stderr, /HTTP 404/);

    const nonAdmin = createFakeGitHub({ orgAdmin: false });
    const denied = restCall(nonAdmin, 'POST', 'orgs/o/issue-types', { name: 'Bug', is_enabled: true });
    assert.match(denied.stderr, /HTTP 403/);
    assert.doesNotMatch(denied.stderr, /rate limit/i);
    assert.match(restCall(nonAdmin, 'PUT', 'orgs/o/issue-types/1', { is_enabled: false }).stderr, /HTTP 403/);
    assert.equal(json(restGet(nonAdmin, 'orgs/o/issue-types')).length, 3, 'reads still work and nothing was written');
    assert.equal(json(restGet(nonAdmin, 'repos/o/r')).permissions.admin, true, 'orgAdmin gates the org routes only');
    assert.equal(restCall(nonAdmin, 'POST', 'repos/o/r/rulesets', RULESET_BODY).ok, true, 'a repo admin without org admin can still write rulesets');

    const orgWrites = fake.writes().filter((a) => a[3].startsWith('orgs/'));
    assert.deepEqual(orgWrites.slice(0, 3).map((a) => `${a[2]} ${a[3]}`),
      ['POST orgs/o/issue-types', 'POST orgs/o/issue-types', 'PUT orgs/o/issue-types/IT_1'], 'org writes are recorded');
  });

  it('7. issue fields: POST needs the 2026-03-10 api-version header (400 without), stores and lists the field, 422 for options when refused', () => {
    const fake = createFakeGitHub();
    const body = { name: 'priority', data_type: 'text', description: 'How urgent', visibility: 'organization_members_only' };
    const post = (b, ...headers) => fake.runGh(
      ['api', '--method', 'POST', 'orgs/o/issue-fields', ...headers.flatMap((h) => ['-H', h]), '--input', '-'], { input: JSON.stringify(b) });

    const bare = post(body);
    assert.equal(bare.ok, false);
    assert.match(bare.stderr, /HTTP 400/);
    assert.match(post(body, 'X-GitHub-Api-Version: 2022-11-28').stderr, /HTTP 400/, 'only 2026-03-10 counts');
    assert.match(post(body, 'Accept: application/vnd.github+json').stderr, /HTTP 400/, 'another header is not the version header');
    assert.equal(json(restGet(fake, 'orgs/o/issue-fields')).length, 2, 'a refused create stores nothing');

    const made = post(body, 'X-GitHub-Api-Version: 2026-03-10');
    assert.equal(made.ok, true, made.stderr);
    const field = json(made);
    assert.ok(Number.isInteger(field.id) && ![11, 12].includes(field.id), 'an integer id, distinct from the seeded fields');
    assert.deepEqual([field.name, field.data_type, field.description, field.visibility],
      ['priority', 'text', 'How urgent', 'organization_members_only']);
    const listed = json(restGet(fake, 'orgs/o/issue-fields'));
    assert.deepEqual(listed.map((f) => f.name), ['work', 'kind', 'priority']);
    assert.deepEqual(listed[2], field);

    // The new definition is a real field: issue-field-values accepts its id (the list detectCapabilities reads).
    fake.seedIssue({ title: 'a' });
    const values = restCall(fake, 'POST', 'repos/o/r/issues/1/issue-field-values', { issue_field_values: [{ field_id: field.id, value: 'high' }] });
    assert.equal(values.ok, true, values.stderr);

    const lower = fake.runGh(['api', '-X', 'POST', 'orgs/o/issue-fields', '--header', 'x-github-api-version: 2026-03-10', '--input', '-'],
      { input: JSON.stringify({ name: 'size', data_type: 'number' }) });
    assert.equal(lower.ok, true, 'the header name is case-insensitive and --header is accepted');

    const withOptions = post({ name: 'work2', data_type: 'single_select', options: [{ name: 'feature' }, { name: 'bug' }] }, 'X-GitHub-Api-Version: 2026-03-10');
    assert.equal(withOptions.ok, true, withOptions.stderr);
    assert.deepEqual(json(withOptions).options, [{ name: 'feature' }, { name: 'bug' }], 'options are stored as sent when accepted');

    assert.match(post({ data_type: 'text' }, 'X-GitHub-Api-Version: 2026-03-10').stderr, /HTTP 422/, 'name is required');
    assert.match(post({ name: 'x', data_type: 'blob' }, 'X-GitHub-Api-Version: 2026-03-10').stderr, /HTTP 422/, 'data_type must be a known type');
    assert.match(post({ name: 'work', data_type: 'text' }, 'X-GitHub-Api-Version: 2026-03-10').stderr, /HTTP 422/, 'a duplicate name');

    const noOptions = createFakeGitHub({ fieldOptionsAccepted: false });
    const refused = noOptions.runGh(['api', '--method', 'POST', 'orgs/o/issue-fields', '-H', 'X-GitHub-Api-Version: 2026-03-10', '--input', '-'],
      { input: JSON.stringify({ name: 'work2', data_type: 'single_select', options: [{ name: 'feature' }] }) });
    assert.equal(refused.ok, false);
    assert.match(refused.stderr, /HTTP 422/);
    assert.equal(json(restGet(noOptions, 'orgs/o/issue-fields')).length, 2, 'a refused create stores nothing');
    const plain = noOptions.runGh(['api', '--method', 'POST', 'orgs/o/issue-fields', '-H', 'X-GitHub-Api-Version: 2026-03-10', '--input', '-'],
      { input: JSON.stringify({ name: 'work2', data_type: 'single_select' }) });
    assert.equal(plain.ok, true, 'a field without options is fine when options are refused');

    const hdr = ['-H', 'X-GitHub-Api-Version: 2026-03-10', '--input', '-'];
    const user = createFakeGitHub({ ownerType: 'User' });
    assert.match(user.runGh(['api', '--method', 'POST', 'orgs/o/issue-fields', ...hdr], { input: JSON.stringify(body) }).stderr, /HTTP 404/);
    const nonAdmin = createFakeGitHub({ orgAdmin: false });
    assert.match(nonAdmin.runGh(['api', '--method', 'POST', 'orgs/o/issue-fields', ...hdr], { input: JSON.stringify(body) }).stderr, /HTTP 403/);
    assert.equal(json(restGet(nonAdmin, 'orgs/o/issue-fields')).length, 2);
  });

  it('8. PR commits and file contents return the seeded data; an unseeded path or ref is 404', () => {
    const files = {
      abc123: {
        '.github/workflows/aoforge-checks.yml': 'name: aoforge\non: pull_request\n',
        'docs/my file.md': 'hello\n',
        'long.txt': 'x'.repeat(200),
      },
      main: { 'README.md': 'on main\n' },
    };
    const fake = createFakeGitHub({ files, prCommits: { 1: ['feat(50-01): a', 'fix: b\n\nCloses #3'] } });
    fake.pushRef('df/feature', 'c1');
    assert.equal(openPr(fake, 'df/feature').ok, true);

    const commits = json(restGet(fake, 'repos/o/r/pulls/1/commits'));
    assert.deepEqual(commits.map((c) => c.commit.message), ['feat(50-01): a', 'fix: b\n\nCloses #3']);
    assert.ok(commits.every((c) => /^[0-9a-f]{40}$/.test(c.sha)));
    assert.notEqual(commits[0].sha, commits[1].sha);
    assert.deepEqual(json(restGet(fake, 'repos/o/r/pulls/1/commits')), commits, 'the shas are stable');

    const paged = json(fake.runGh(['api', '--paginate', '--slurp', 'repos/o/r/pulls/1/commits?per_page=1']));
    assert.equal(paged.length, 2, 'two pages of one');
    assert.deepEqual(paged.flat(), commits);

    const none = createFakeGitHub();
    none.pushRef('df/feature', 'c1');
    openPr(none, 'df/feature');
    assert.deepEqual(json(restGet(none, 'repos/o/r/pulls/1/commits')), [], 'a PR with no seeded commits has none');
    none.prCommits[1] = ['seeded later'];
    assert.deepEqual(json(restGet(none, 'repos/o/r/pulls/1/commits')).map((c) => c.commit.message), ['seeded later'], 'prCommits is live');
    assert.match(restGet(fake, 'repos/o/r/pulls/99/commits').stderr, /HTTP 404/);
    assert.match(restGet(fake, 'repos/o/elsewhere/pulls/1/commits').stderr, /HTTP 404/);
    assert.match(restCall(fake, 'POST', 'repos/o/r/pulls/1/commits', {}).stderr, /\[gh-fake\] unsupported/);

    const file = restGet(fake, 'repos/o/r/contents/.github/workflows/aoforge-checks.yml?ref=abc123');
    assert.equal(file.ok, true, file.stderr);
    const got = json(file);
    assert.equal(got.type, 'file');
    assert.equal(got.encoding, 'base64');
    assert.equal(got.path, '.github/workflows/aoforge-checks.yml');
    assert.equal(got.name, 'aoforge-checks.yml');
    assert.equal(Buffer.from(got.content, 'base64').toString('utf8'), 'name: aoforge\non: pull_request\n');
    assert.equal(got.size, 31);

    const hello = json(restGet(fake, 'repos/o/r/contents/docs/my%20file.md?ref=abc123'));
    assert.equal(hello.sha, 'ce013625030ba8dba906f756967f9e9ca394464a', 'sha is the git blob id of the text');
    assert.equal(Buffer.from(hello.content, 'base64').toString('utf8'), 'hello\n');

    const long = json(restGet(fake, 'repos/o/r/contents/long.txt?ref=abc123'));
    assert.ok(long.content.endsWith('\n'));
    assert.ok(long.content.split('\n').every((line) => line.length <= 60), 'base64 is wrapped at 60 columns, as GitHub does');
    assert.equal(Buffer.from(long.content, 'base64').toString('utf8'), 'x'.repeat(200));

    assert.equal(Buffer.from(json(restGet(fake, 'repos/o/r/contents/README.md')).content, 'base64').toString(), 'on main\n',
      'no ref reads the default branch');
    assert.match(restGet(fake, 'repos/o/r/contents/README.md?ref=abc123').stderr, /HTTP 404/, 'unseeded path');
    assert.match(restGet(fake, 'repos/o/r/contents/.github/workflows/aoforge-checks.yml?ref=nope').stderr, /HTTP 404/, 'unseeded ref');
    assert.match(restGet(fake, 'repos/o/r/contents/docs?ref=abc123').stderr, /HTTP 404/, 'a directory is not a file');
    assert.match(restGet(fake, 'repos/o/elsewhere/contents/README.md?ref=main').stderr, /HTTP 404/);
    fake.files.abc123['new.txt'] = 'live';
    assert.equal(restGet(fake, 'repos/o/r/contents/new.txt?ref=abc123').ok, true, 'files is live');
    assert.match(restCall(fake, 'PUT', 'repos/o/r/contents/new.txt', { message: 'm', content: 'eA==' }).stderr, /\[gh-fake\] unsupported/,
      'writing a file is not modelled');
  });

  it('9. an argv the fake does not know still yields [gh-fake] unsupported', () => {
    const fake = createFakeGitHub();
    restCall(fake, 'POST', 'repos/o/r/rulesets', RULESET_BODY);
    const gaps = [
      ['api', 'repos/o/r/rulesets/9001/history'],
      ['api', '--method', 'DELETE', 'repos/o/r/rulesets/9001'],
      ['api', 'repos/o/r/hooks'],
      ['api', '--method', 'DELETE', 'repos/o/r'],
      ['api', '--method', 'PUT', 'repos/o/r/labels'],
      ['api', '--method', 'DELETE', 'orgs/o/issue-types/1'],
      ['api', '--method', 'PUT', 'orgs/o/issue-types'],
      ['api', '--method', 'POST', 'orgs/o/issue-types/1'],
      ['api', '--method', 'PUT', 'orgs/o/issue-fields/11'],
      ['api', 'orgs/o/issue-types/1'],
    ];
    for (const argv of gaps) {
      const r = fake.runGh(argv);
      assert.equal(r.ok, false, argv.join(' '));
      assert.match(r.stderr, /\[gh-fake\] unsupported/, argv.join(' '));
    }
    const field = restCall(fake, 'PATCH', 'repos/o/r', { allow_squash_merge: true });
    assert.equal(field.ok, false, 'a repo field the fake does not model is a loud gap, never a quiet success');
    assert.match(field.stderr, /\[gh-fake\] unsupported/);
    assert.equal(fake.rulesets.length, 1, 'the unknown routes changed nothing');
  });
});
