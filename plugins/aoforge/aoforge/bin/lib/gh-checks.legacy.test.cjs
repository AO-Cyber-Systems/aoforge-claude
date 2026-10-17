'use strict';

// Test list (TRD 78-03, objective 78, SC-2): 3.1.0's required checks speak the AOForge namespace only. A ruleset that
// still requires the pre-rename contexts waits until `aof-tools gh rebrand --apply` rewrites it (72-16, kept); the
// managed caller detector stays (W062 `legacy: true`, fix `gh rebrand`).
//
// 9.  postStatus posts every status once, under `aoforge/<check>` only. 9a planning-consistency, 9b linked-issue.
// 10. A PR body opening with the legacy PR marker is not an AOForge objective PR: 10a the pure planningConsistency
//     verdict is "not an AOForge objective PR"; 10b the runner, in store mode, posts that one success and never looks
//     an objective issue up.
// 11. Reconcile: 11a a legacy reconcile comment is not "the reconcile comment": it is left as it is and a new one is
//     posted under the AOForge marker; 11b an AOForge reconcile comment is still edited in place (earlier list kept).
// 12. checks-pin reads the legacy caller (legacy slug, reusable-workflow file and ref input) like a new one:
//     `{ managed: true, uses_ref: <sha>, legacy: true }` with the same pin fields; a new caller is `legacy: false`. A
//     release pin is compared like a new caller's; collectPinFindings reads the legacy caller file when the new one is
//     absent and its W062 fix never says `gh setup --apply` (that would add a second caller).
// 13. (TRD 78-09) planning-consistency finds an objective the PR forgot to close by the AOForge objective label alone:
//     13a the pre-rename label still exists -> an `error` status that fits 140 characters and names
//     `aof-tools gh rebrand --apply` (the full refusal in the details), nothing listed; 13b it is absent (404) -> one
//     list of `aoforge:objective` finds the objective, as before.
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
const { NAMES } = require('./legacy-names.cjs');
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

// ─── 9. One status context ───────────────────────────────────────────────────

describe('9. every status is posted once, under the AOForge context only', () => {
  test('9a. planning-consistency', () => {
    const r = run('planning-consistency', prEvent('Closes #1'));
    assert.equal(r.code, 0);
    const posted = postedInOrder(HEAD);
    assert.deepEqual(posted.map((s) => s.context), ['aoforge/planning-consistency']);
    assert.equal(posted[0].context, check.CONTEXTS.planningConsistency);
    assert.match(posted[0].description, /store mode off/);
    assert.ok(!posted.some((s) => s.context.startsWith(`${OLD}/`)));
  });

  test('9b. linked-issue', () => {
    fake.seedIssue({ title: 'issue 1' });
    const r = run('linked-issue', prEvent('Closes #1'));
    assert.equal(r.code, 0);
    const posted = postedInOrder(HEAD);
    assert.deepEqual(posted.map((s) => [s.context, s.state]), [['aoforge/linked-issue', 'success']]);
  });
});

// ─── 10. Legacy PR marker ────────────────────────────────────────────────────

describe('10. a legacy PR marker is not an AOForge objective PR', () => {
  test('10a. planningConsistency: "not an AOForge objective PR"', () => {
    const pr = { number: 9, body: F.legacyPrBody({ objective: '49', closes: [100] }), base: { ref: 'main' } };
    const v = check.planningConsistency({
      pr, repo: 'o/r', defaultBranch: 'main', config: { github: { store: true } }, issues: new Map(), linked: [],
    });
    assert.deepEqual(v, { state: 'success', description: 'not an AOForge objective PR', details: [] });
  });

  test('10b. the runner in store mode posts that one success and never looks an objective issue up', () => {
    fake.files[HEAD] = { [`${NAMES.planningDir}/config.json`]: JSON.stringify({ github: { enabled: true, store: true } }) };
    fake.seedIssue({ title: 'objective 50', body: F.legacyIssueBody({ id: '50' }), labels: [`${OLD}:objective`] });

    const r = run('planning-consistency', prEvent(F.legacyPrBody({ objective: '50', closes: [1] })));
    assert.equal(r.code, 0, JSON.stringify(r));
    assert.equal(r.state, 'success');
    const posted = postedInOrder(HEAD);
    assert.deepEqual(posted.map((s) => [s.context, s.state, s.description]),
      [['aoforge/planning-consistency', 'success', 'not an AOForge objective PR']]);
    assert.ok(!fake.calls().some((args) => /issues\?labels=/.test(args.join(' '))), 'no objective label listed');
  });
});

// ─── 11. Reconcile comment ───────────────────────────────────────────────────

/** A merged PR (`Closes #1`) whose issue #1 is still open, with `comment` already on it. Returns the PR number. */
function mergedPrWith(comment) {
  fake.seedIssue({ title: 'issue 1' });
  fake.pushRef('feat-4', '4'.repeat(40));
  const opened = fake.runGh(['api', '--method', 'POST', 'repos/o/r/pulls', '--input', '-'], {
    input: JSON.stringify({ title: 'fix it', head: 'feat-4', base: 'main', body: 'Closes #1' }),
  });
  assert.equal(opened.ok, true, opened.stderr);
  const pr = JSON.parse(opened.stdout).number;
  fake.seedComment(pr, comment);
  return pr;
}

const reconcileEvent = (pr) => fixture('pull_request-merged', (p) => {
  p.pull_request.number = pr;
  p.pull_request.body = 'Closes #1';
});

describe('11. reconcile and an earlier reconcile comment', () => {
  test('11a. a legacy reconcile comment is left as it is; a new AOForge one is posted', () => {
    const legacy = F.legacyReconcileComment({ closed: [3] });
    const pr = mergedPrWith(legacy);
    const r = run('reconcile', reconcileEvent(pr));
    assert.equal(r.code, 0, JSON.stringify(r));
    assert.equal(fake.issues[0].state, 'CLOSED', 'the target still open is closed');

    const comments = fake.comments.filter((c) => c.issue_number === pr);
    assert.equal(comments.length, 2, 'the legacy comment is not the reconcile comment');
    assert.equal(comments[0].body, legacy, 'the legacy comment is untouched');
    assert.ok(comments[1].body.startsWith('<!-- aoforge:reconcile -->\n'), comments[1].body);
    assert.match(comments[1].body, /- #1/);
    assert.doesNotMatch(comments[1].body, /- #3/, 'the legacy list is not carried over');
    assert.equal(fake.writes().filter((a) => a.includes('PATCH') && a.join(' ').includes('issues/comments/')).length, 0);
  });

  test('11b. an AOForge reconcile comment is still edited in place, its earlier list kept', () => {
    const pr = mergedPrWith('<!-- aoforge:reconcile -->\nClosed after the merge (they were still open):\n\n- #3\n');
    const r = run('reconcile', reconcileEvent(pr));
    assert.equal(r.code, 0, JSON.stringify(r));

    const comments = fake.comments.filter((c) => c.issue_number === pr);
    assert.equal(comments.length, 1, 'no second reconcile comment');
    assert.ok(comments[0].body.startsWith('<!-- aoforge:reconcile -->\n'), comments[0].body);
    assert.match(comments[0].body, /- #3/, 'the earlier list is kept');
    assert.match(comments[0].body, /- #1/, 'the new close is recorded');
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

// ─── 13. The objective lookup by label (TRD 78-09) ───────────────────────────

describe('13. planning-consistency looks the objective up by the AOForge label alone', () => {
  // An objective PR (#3 closes TRD #2 only, so the objective issue #1 is found by its label and marker).
  const prBody = '<!-- aoforge:pr=50 -->\n<!-- aoforge:begin closes -->\nCloses #2\n<!-- aoforge:end closes -->\n';
  const labelLists = () => fake.calls().filter((a) => /issues\?labels=/.test(a.join(' '))).map((a) => decodeURIComponent(/labels=([^&]+)/.exec(a.join(' '))[1]));
  const twinGets = () => fake.calls().filter((a) => a[0] === 'api' && /^repos\/o\/r\/labels\/[^/]+$/.test(a[1] || '')).map((a) => decodeURIComponent(a[1].split('/').pop()));

  function seedGraph(objectiveLabel) {
    fake.files[HEAD] = { [`${NAMES.planningDir}/config.json`]: JSON.stringify({ github: { enabled: true, store: true } }) };
    fake.seedIssue({ title: 'objective 50', body: '<!-- aoforge:id=50 -->\n\nObjective 50', labels: [objectiveLabel] });
    fake.seedIssue({ title: 'TRD 50-01', body: '<!-- aoforge:id=50-01 -->\n\nTRD 1' });
    fake.issues[0].subIssues.push(2);
    fake.issues[1].parent = 1;
  }

  test('13a. the pre-rename objective label still exists: an error naming gh rebrand --apply, nothing listed', () => {
    seedGraph(`${OLD}:objective`);
    const r = run('planning-consistency', prEvent(prBody));
    assert.equal(r.code, 1, JSON.stringify(r));
    assert.equal(r.state, 'error');
    const posted = postedInOrder(HEAD);
    assert.equal(posted.length, 1);
    assert.equal(posted[0].context, 'aoforge/planning-consistency');
    assert.equal(posted[0].state, 'error');
    assert.equal(posted[0].description, `o/r still has the label "${OLD}:objective": run \`aof-tools gh rebrand --apply\`, then re-run this check`);
    assert.ok(posted[0].description.length <= 140, 'the fix fits a status description');
    assert.deepEqual(r.details, [
      `o/r still has the pre-rename label "${OLD}:objective", which AOForge no longer reads, so it will not look issues up `
      + 'by "aoforge:objective" alone: run `aof-tools gh rebrand --apply` (docs/MIGRATING-TO-AOFORGE.md, "Repositories '
      + 'with GitHub integration"), then retry',
    ]);
    assert.deepEqual(labelLists(), [], 'neither label is listed');
    assert.deepEqual(twinGets(), [`${OLD}:objective`]);
  });

  test('13b. the twin absent (404): the objective is found under aoforge:objective after one list', () => {
    seedGraph('aoforge:objective');
    const r = run('planning-consistency', prEvent(prBody));
    assert.equal(r.state, 'failure', JSON.stringify(r));
    assert.match(postedInOrder(HEAD)[0].description, /#1.*not closed|not closed.*#1/, 'the objective the PR forgot to close is named');
    assert.deepEqual(labelLists(), ['aoforge:objective']);
    assert.deepEqual(twinGets(), [`${OLD}:objective`]);
  });
});
