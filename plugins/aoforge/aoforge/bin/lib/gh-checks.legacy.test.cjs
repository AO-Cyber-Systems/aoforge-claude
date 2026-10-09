'use strict';

// Test list (TRD 72-11, objective 72, INST-03): the required checks of a repository set up before the rename keep
// passing, and its managed caller workflow is read but never re-pinned in place.
//
// 9.  postStatus posts every status twice: the AOForge context first, then the legacy one, same state, description and
//     target URL (a ruleset made before 3.0.0 requires the legacy context). 9a planning-consistency, 9b linked-issue.
// 10. A PR body opening with the legacy PR marker is an objective PR: 10a the pure planningConsistency verdict is not
//     "not an AOForge objective PR"; 10b the runner finds the objective issue under the legacy objective label (and the
//     legacy planning directory's config.json) and names it as not closed.
// 11. Reconcile on a PR that already carries a legacy reconcile comment closes what is still open and edits that one
//     comment in place (AOForge marker, the earlier list kept, the new one appended); it never posts a second.
// 12. checks-pin reads the legacy caller (legacy slug, reusable-workflow file and ref input) like a new one:
//     `{ managed: true, uses_ref: <sha>, legacy: true }` with the same pin fields; a new caller is `legacy: false`. A
//     release pin is compared like a new caller's; collectPinFindings reads the legacy caller file when the new one is
//     absent and its W062 fix never says `gh setup --apply` (that would add a second caller).
//
// Hermetic: the fake GitHub through the gh-client seam, event payloads written to a temp dir, hermeticEnv() for HOME
// and the outbox, temp project roots. No network, no real ~/.claude, no port.

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cli = require('./gh-check-cli.cjs');
const check = require('./gh-check.cjs');
const checksPin = require('./checks-pin.cjs');
const client = require('./gh-client.cjs');
const { LEGACY } = require('./legacy-names.cjs');
const F = require('./__fixtures__/legacy-gh-fixtures.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');

const OLD = 'devflow';
const EVENTS = path.join(__dirname, '__fixtures__', 'gh-events');
const HEAD = '1'.repeat(40); // pull_request-closes head sha

let envh;
let tmp;
let fake;
let seq = 0;

function fixture(name, edit) {
  const payload = JSON.parse(fs.readFileSync(path.join(EVENTS, `${name}.json`), 'utf-8'));
  if (edit) edit(payload);
  return payload;
}

function run(name, payload) {
  const eventPath = path.join(tmp, `event-${++seq}.json`);
  fs.writeFileSync(eventPath, JSON.stringify(payload));
  return cli.main({
    argv: [name],
    env: {
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_REPOSITORY: 'o/r',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_RUN_ID: '777',
    },
  });
}

const prEvent = (body) => fixture('pull_request-closes', (p) => { p.pull_request.body = body; });

/** The statuses posted on `sha` in the order they were POSTed (the fake keeps them newest first, as GitHub lists them). */
const postedInOrder = (sha) => [...(fake.statuses[sha] || [])].reverse();

beforeEach(() => {
  envh = hermeticEnv();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-checks-legacy-'));
  fake = createFakeGitHub({ repo: 'o/r' });
  client._setNow(() => 0);
  client._setSleep(() => {});
  client._setRunGh(fake.runGh);
});

afterEach(() => {
  client._resetClient();
  envh.restore();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ─── 9. Both status contexts ─────────────────────────────────────────────────

describe('9. every status is posted under the AOForge context, then the legacy one', () => {
  test('9a. planning-consistency', () => {
    const r = run('planning-consistency', prEvent('Closes #1'));
    assert.equal(r.code, 0);
    const posted = postedInOrder(HEAD);
    assert.deepEqual(posted.map((s) => s.context), ['aoforge/planning-consistency', `${OLD}/planning-consistency`]);
    assert.equal(posted[0].context, check.CONTEXTS.planningConsistency);
    assert.equal(posted[1].state, posted[0].state);
    assert.equal(posted[1].description, posted[0].description);
    assert.equal(posted[1].target_url, posted[0].target_url);
    assert.match(posted[0].description, /store mode off/);
  });

  test('9b. linked-issue', () => {
    fake.seedIssue({ title: 'issue 1' });
    const r = run('linked-issue', prEvent('Closes #1'));
    assert.equal(r.code, 0);
    const posted = postedInOrder(HEAD);
    assert.deepEqual(posted.map((s) => [s.context, s.state]), [['aoforge/linked-issue', 'success'], [`${OLD}/linked-issue`, 'success']]);
  });
});

// ─── 10. Legacy PR marker ────────────────────────────────────────────────────

describe('10. a legacy PR marker is an AOForge objective PR', () => {
  test('10a. planningConsistency treats it as an objective PR', () => {
    const pr = { number: 9, body: F.legacyPrBody({ objective: '49', closes: [100] }), base: { ref: 'main' } };
    const v = check.planningConsistency({
      pr, repo: 'o/r', defaultBranch: 'main', config: { github: { store: true } }, issues: new Map(), linked: [],
    });
    assert.notEqual(v.description, 'not an AOForge objective PR');
    assert.equal(v.state, 'failure');
    assert.match(v.description, /objective issue \(aoforge:id=49\) not found/);
  });

  test('10b. the runner finds the objective under the legacy label and names it as not closed', () => {
    fake.files[HEAD] = { [`${LEGACY.planningDir}/config.json`]: JSON.stringify({ github: { enabled: true, store: true } }) };
    fake.seedIssue({ title: 'objective 50', body: F.legacyIssueBody({ id: '50' }), labels: [`${OLD}:objective`] });
    fake.seedIssue({ title: 'TRD 50-01', body: F.legacyTrdBody({ id: '50-01', file: '50-01-a-TRD.md' }) });
    fake.seedIssue({ title: 'TRD 50-02', body: F.legacyTrdBody({ id: '50-02', file: '50-02-b-TRD.md' }) });
    fake.issues[0].subIssues.push(2, 3);
    fake.issues[1].parent = 1;
    fake.issues[2].parent = 1;

    const r = run('planning-consistency', prEvent(F.legacyPrBody({ objective: '50', closes: [2, 3] })));
    assert.equal(r.state, 'failure');
    assert.ok(r.details.some((d) => /objective issue #1 \(aoforge:id=50\) is not closed by this pull request/.test(d)), r.details.join('\n'));
    assert.deepEqual(fake.statuses[HEAD].map((s) => s.state), ['failure', 'failure']);
  });
});

// ─── 11. Reconcile comment ───────────────────────────────────────────────────

describe('11. reconcile edits an existing legacy reconcile comment instead of posting a second one', () => {
  test('11. one comment on the PR, in the AOForge form, with the earlier list kept', () => {
    fake.seedIssue({ title: 'objective 50', body: F.legacyIssueBody({ id: '50' }), labels: [`${OLD}:objective`], state: 'CLOSED' });
    fake.seedIssue({ title: 'TRD 50-01', body: F.legacyTrdBody({ id: '50-01', file: '50-01-a-TRD.md' }) });
    fake.seedIssue({ title: 'TRD 50-02', body: F.legacyTrdBody({ id: '50-02', file: '50-02-b-TRD.md' }), state: 'CLOSED' });
    fake.issues[0].subIssues.push(2, 3);
    fake.issues[1].parent = 1;
    fake.issues[2].parent = 1;
    fake.pushRef('feat-4', '4'.repeat(40));
    const opened = fake.runGh(['api', '--method', 'POST', 'repos/o/r/pulls', '--input', '-'], {
      input: JSON.stringify({ title: 'objective 50', head: 'feat-4', base: 'main', body: F.legacyPrBody({ objective: '50', closes: [1, 3] }) }),
    });
    assert.equal(opened.ok, true, opened.stderr);
    const pr = JSON.parse(opened.stdout).number;
    fake.seedComment(pr, F.legacyReconcileComment({ closed: [3] }));

    const payload = fixture('pull_request-merged', (p) => {
      p.pull_request.number = pr;
      p.pull_request.body = F.legacyPrBody({ objective: '50', closes: [1, 3] });
    });
    const r = run('reconcile', payload);
    assert.equal(r.code, 0, JSON.stringify(r));
    assert.equal(fake.issues[1].state, 'CLOSED', 'the linked TRD still open is closed');

    const comments = fake.comments.filter((c) => c.issue_number === pr);
    assert.equal(comments.length, 1, 'no second reconcile comment');
    const body = comments[0].body;
    assert.ok(body.startsWith('<!-- aoforge:reconcile -->\n'), body);
    assert.ok(!body.includes(`${OLD}:reconcile`), body);
    assert.match(body, /- #3/, 'the earlier list is kept');
    assert.match(body, /- #2/, 'the new close is recorded');
    assert.equal(fake.writes().filter((a) => a.includes('POST') && a.join(' ').includes(`issues/${pr}/comments`)).length, 0);
  });
});

// ─── 12. Caller pin ──────────────────────────────────────────────────────────

/** templates/github/aoforge.yml rendered the way gh setup renders it, pinned to `ref`. */
function newCaller(ref) {
  const template = fs.readFileSync(path.join(__dirname, '..', '..', 'templates', 'github', 'aoforge.yml'), 'utf-8');
  return template
    .replace('{{checks_workflow}}', `${checksPin.DEFAULT_CHECKS_WORKFLOW}@${ref}`)
    .replace('{{aoforge_ref}}', ref);
}

describe('12. checks-pin and the legacy caller', () => {
  const SHA = '0123456789abcdef0123456789abcdef01234567';

  test('12a. a legacy caller parses like a new one and is marked legacy', () => {
    const pins = checksPin.parseWorkflowPins(F.legacyCaller({ sha: SHA }));
    assert.equal(pins.managed, true);
    assert.equal(pins.uses_ref, SHA);
    assert.equal(pins.legacy, true);
    assert.equal(pins.aoforge_ref, SHA, 'the legacy ref input is read as the runner ref');
    assert.equal(pins.uses_path, `AO-Cyber-Systems/${OLD}-claude/.github/workflows/${OLD}-checks.yml`);

    const fresh = checksPin.parseWorkflowPins(newCaller(SHA));
    assert.equal(fresh.legacy, false);
    assert.deepEqual(Object.keys(pins).sort(), Object.keys(fresh).sort(), 'the same pin fields');
    assert.equal(fresh.uses_ref, pins.uses_ref);
    assert.equal(fresh.aoforge_ref, pins.aoforge_ref);
  });

  test('12b. a legacy release pin is compared like a new caller\'s', () => {
    const legacy = checksPin.pinStatus(checksPin.parseWorkflowPins(F.legacyCaller({ sha: 'v2.13.1' })), '3.0.0');
    const fresh = checksPin.pinStatus(checksPin.parseWorkflowPins(newCaller('v2.13.1')), '3.0.0');
    assert.equal(legacy.state, 'stale');
    assert.deepEqual(legacy, fresh);
    assert.equal(checksPin.pinStatus(checksPin.parseWorkflowPins(F.legacyCaller({ sha: SHA })), '3.0.0').state, 'not-comparable');
  });

  test('12c. collectPinFindings reads the legacy caller file when the new one is absent; its fix is never gh setup', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'checks-pin-legacy-'));
    try {
      const rel = `.github/workflows/${OLD}.yml`;
      fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
      fs.writeFileSync(path.join(root, rel), F.legacyCaller({ sha: 'v2.13.1' }));
      const r = checksPin.collectPinFindings({ projectRoot: root, installedVersion: '3.0.0' });
      assert.equal(r.applicable, true);
      assert.equal(r.legacy, true);
      assert.equal(r.path, rel);
      assert.equal(r.state, 'stale');
      assert.equal(r.findings.length, 1);
      assert.ok(r.findings[0].message.includes(rel), r.findings[0].message);
      assert.ok(!/gh setup --apply/.test(r.findings[0].fix), r.findings[0].fix);
      assert.match(r.findings[0].fix, /gh rebrand/);

      fs.writeFileSync(path.join(root, checksPin.WORKFLOW_PATH), newCaller('v3.0.0'));
      const both = checksPin.collectPinFindings({ projectRoot: root, installedVersion: '3.0.0' });
      assert.equal(both.path, checksPin.WORKFLOW_PATH, 'the AOForge caller wins when both exist');
      assert.equal(both.legacy, false);
      assert.equal(both.state, 'current');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
