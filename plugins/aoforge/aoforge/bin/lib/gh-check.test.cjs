'use strict';

// Unit tests for lib/gh-check.cjs — the pure logic behind the two required checks
// (`aoforge/linked-issue`, `aoforge/planning-consistency`) and the merge-time reconcile plan.
//
// gh-check.cjs is pure: no gh calls, no git, no fs. Every test here uses hand-written PR bodies and
// issue objects; the event fixtures under __fixtures__/gh-events/ are hand-written JSON trimmed to the
// fields the functions read. No gh mock is needed because nothing in the module can reach GitHub.

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ghCheck = require('./gh-check.cjs');

const { CONTEXTS, parseClosingRefs, prNumberFromQueueRef, linkedIssue, planningConsistency, reconcilePlan } = ghCheck;

const EVENTS_DIR = path.join(__dirname, '__fixtures__', 'gh-events');

function loadEvent(name) {
  return JSON.parse(fs.readFileSync(path.join(EVENTS_DIR, name), 'utf8'));
}

// ─── Shared builders ─────────────────────────────────────────────────────────

const REPO = 'o/r';

function pr(over) {
  return Object.assign(
    { number: 5, body: 'Closes #12', base: { ref: 'main' }, head: { sha: 'abc1234' }, merged: false },
    over
  );
}

function issueMap(entries) {
  return new Map(entries);
}

function runLinked(over) {
  return linkedIssue(
    Object.assign(
      {
        pr: pr(),
        repo: REPO,
        defaultBranch: 'main',
        issues: issueMap([[12, { number: 12, state: 'open', body: 'an issue' }]]),
        commits: [],
      },
      over
    )
  );
}

// ─── CONTEXTS ────────────────────────────────────────────────────────────────

describe('CONTEXTS', () => {
  test('names the two required status contexts exactly', () => {
    assert.deepStrictEqual(CONTEXTS, {
      linkedIssue: 'aoforge/linked-issue',
      planningConsistency: 'aoforge/planning-consistency',
    });
  });

  test('is frozen so no caller can retarget the ruleset', () => {
    assert.ok(Object.isFrozen(CONTEXTS));
  });
});

// ─── parseClosingRefs (test 1) ───────────────────────────────────────────────

describe('parseClosingRefs', () => {
  test('counts Closes / fixes: / Resolved of this repo, in order of appearance', () => {
    const r = parseClosingRefs('Closes #12\nfixes: #13\nResolved o/r#14', REPO);
    assert.deepStrictEqual(r.counted, [12, 13, 14]);
    assert.deepStrictEqual(r.foreign, []);
  });

  test('every keyword and tense GitHub documents is recognised, case-insensitively', () => {
    const body = ['close #1', 'CLOSES #2', 'Closed #3', 'fix #4', 'Fixes #5', 'fixed #6', 'resolve #7', 'RESOLVES #8', 'resolved #9'].join('\n');
    assert.deepStrictEqual(parseClosingRefs(body, REPO).counted, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test('a reference to another repository is reported as foreign, not counted', () => {
    const r = parseClosingRefs('Fixes x/y#5\nCloses #6', REPO);
    assert.deepStrictEqual(r.counted, [6]);
    assert.deepStrictEqual(r.foreign, ['x/y#5']);
  });

  test('full issue URLs count for this repo and are foreign for another', () => {
    const r = parseClosingRefs(
      'Closes https://github.com/o/r/issues/7\nFixes https://github.com/x/y/issues/8',
      REPO
    );
    assert.deepStrictEqual(r.counted, [7]);
    assert.deepStrictEqual(r.foreign, ['x/y#8']);
  });

  test('the repository name is compared case-insensitively', () => {
    assert.deepStrictEqual(parseClosingRefs('Closes O/R#3', REPO).counted, [3]);
  });

  test('text inside a fenced code block is ignored', () => {
    const body = 'Intro\n```\nCloses #20\n```\nCloses #21\n~~~md\nFixes #22\n~~~\n';
    assert.deepStrictEqual(parseClosingRefs(body, REPO).counted, [21]);
  });

  test('text inside an HTML comment is ignored, inline or multi-line', () => {
    const body = 'a <!-- Closes #30 --> b\n<!--\nFixes #31\n-->\nResolves #32';
    assert.deepStrictEqual(parseClosingRefs(body, REPO).counted, [32]);
  });

  test('the PR marker comment does not disturb the references around it', () => {
    const body = '<!-- aoforge:pr=50 -->\nCloses #100\nCloses #101';
    assert.deepStrictEqual(parseClosingRefs(body, REPO).counted, [100, 101]);
  });

  test('a Refs paragraph is not a closing reference', () => {
    const r = parseClosingRefs('Refs #9', REPO);
    assert.deepStrictEqual(r.counted, []);
    assert.deepStrictEqual(r.foreign, []);
  });

  test('a keyword that is only the tail of another word does not count', () => {
    assert.deepStrictEqual(parseClosingRefs('this prefixes #3 and unclosed #4', REPO).counted, []);
  });

  test('a number glued to letters is not a reference', () => {
    assert.deepStrictEqual(parseClosingRefs('Closes #12abc', REPO).counted, []);
  });

  test('a repeated reference is counted once', () => {
    assert.deepStrictEqual(parseClosingRefs('Closes #12\nFixes #12', REPO).counted, [12]);
  });

  test('a missing body yields no references', () => {
    assert.deepStrictEqual(parseClosingRefs(null, REPO), { counted: [], foreign: [] });
    assert.deepStrictEqual(parseClosingRefs(undefined, REPO), { counted: [], foreign: [] });
    assert.deepStrictEqual(parseClosingRefs('', REPO), { counted: [], foreign: [] });
  });

  test('CRLF bodies (what GitHub stores for web-typed text) parse the same', () => {
    assert.deepStrictEqual(parseClosingRefs('Closes #1\r\nFixes #2\r\n', REPO).counted, [1, 2]);
  });
});

// ─── linkedIssue (tests 2, 3) ────────────────────────────────────────────────

describe('linkedIssue', () => {
  test('passes a body with Closes #N where #N is an issue', () => {
    const r = runLinked();
    assert.strictEqual(r.state, 'success');
    assert.deepStrictEqual(r.closing, [12]);
    assert.ok(r.description.includes('#12'));
    assert.ok(r.description.length <= 140);
  });

  test('result shape: state, description (<= 140), details[]', () => {
    for (const r of [runLinked(), runLinked({ pr: pr({ body: 'nothing' }) })]) {
      assert.ok(['success', 'failure'].includes(r.state));
      assert.strictEqual(typeof r.description, 'string');
      assert.ok(r.description.length > 0 && r.description.length <= 140);
      assert.ok(Array.isArray(r.details));
    }
  });

  test('fails a body with no closing reference', () => {
    const r = runLinked({ pr: pr({ body: 'Just some words.' }) });
    assert.strictEqual(r.state, 'failure');
    assert.ok(/no closing reference/i.test(r.description));
    assert.ok(r.details.some((d) => /no closing reference/i.test(d)));
  });

  test('fails an empty or missing body', () => {
    assert.strictEqual(runLinked({ pr: pr({ body: null }) }).state, 'failure');
    assert.strictEqual(runLinked({ pr: pr({ body: '' }) }).state, 'failure');
  });

  test('fails a PR whose base is not the default branch and names both', () => {
    const r = runLinked({ pr: pr({ base: { ref: 'dev' } }) });
    assert.strictEqual(r.state, 'failure');
    const text = r.details.join('\n');
    assert.ok(text.includes('dev'));
    assert.ok(text.includes('main'));
    assert.ok(r.description.includes('dev'));
  });

  test('fails when the default branch is unknown rather than passing blind', () => {
    const r = runLinked({ defaultBranch: undefined });
    assert.strictEqual(r.state, 'failure');
    assert.ok(r.details.some((d) => /default branch/i.test(d)));
  });

  test('fails when the referenced number is a pull request, naming it', () => {
    const r = runLinked({
      issues: issueMap([[12, { number: 12, state: 'open', pull_request: { url: 'https://api.github.com/repos/o/r/pulls/12' } }]]),
    });
    assert.strictEqual(r.state, 'failure');
    assert.ok(r.details.some((d) => d.includes('#12') && /pull request/i.test(d)));
  });

  test('fails when the referenced issue does not exist (null = 404), naming it', () => {
    const r = runLinked({ issues: issueMap([[12, null]]) });
    assert.strictEqual(r.state, 'failure');
    assert.ok(r.details.some((d) => d.includes('#12') && /does not exist|not found/i.test(d)));
  });

  test('fails when the runner never resolved the number at all', () => {
    const r = runLinked({ issues: issueMap([]) });
    assert.strictEqual(r.state, 'failure');
    assert.ok(r.details.some((d) => d.includes('#12')));
  });

  test('one dead reference fails the check even beside a good one, and is named', () => {
    const r = runLinked({
      pr: pr({ body: 'Closes #12\nCloses #99' }),
      issues: issueMap([
        [12, { number: 12, state: 'open' }],
        [99, null],
      ]),
    });
    assert.strictEqual(r.state, 'failure');
    assert.ok(r.details.some((d) => d.includes('#99')));
  });

  test('a closing keyword aimed at another repository does not satisfy the check', () => {
    const r = runLinked({ pr: pr({ body: 'Closes x/y#5' }) });
    assert.strictEqual(r.state, 'failure');
    assert.ok(r.details.some((d) => d.includes('x/y#5')));
  });

  test('a closing keyword inside a code fence does not satisfy the check', () => {
    const r = runLinked({ pr: pr({ body: '```\nCloses #12\n```' }) });
    assert.strictEqual(r.state, 'failure');
  });

  test('an objective PR with many closing references passes when all resolve', () => {
    const body = '<!-- aoforge:pr=50 -->\nCloses #100\nCloses #101\nCloses #102';
    const r = runLinked({
      pr: pr({ body }),
      issues: issueMap([
        [100, { number: 100, state: 'open' }],
        [101, { number: 101, state: 'open' }],
        [102, { number: 102, state: 'open' }],
      ]),
    });
    assert.strictEqual(r.state, 'success');
    assert.deepStrictEqual(r.closing, [100, 101, 102]);
  });

  test('the description never exceeds 140 characters, however many problems there are', () => {
    const body = Array.from({ length: 40 }, (_, i) => `Closes #${1000 + i}`).join('\n');
    const r = runLinked({ pr: pr({ body, base: { ref: 'a-very-long-branch-name/that/goes/on' } }), issues: issueMap([]) });
    assert.strictEqual(r.state, 'failure');
    assert.ok(r.description.length <= 140);
  });

  test('reports refs_seen from commit messages ending in a Refs #N paragraph', () => {
    const r = runLinked({
      commits: [
        'feat(50-03): add check\n\nbody\n\nRefs #12',
        'chore: no trailer',
        { message: 'fix(50-03): other\n\nRefs #13' },
        { commit: { message: 'docs: nested\n\nRefs #14' } },
      ],
    });
    assert.strictEqual(r.state, 'success');
    assert.deepStrictEqual(r.refs_seen, [12, 13, 14]);
  });

  test('passes without any Refs trailer: a human PR has none', () => {
    const r = runLinked({ commits: ['fix: a human commit', 'wip'] });
    assert.strictEqual(r.state, 'success');
    assert.deepStrictEqual(r.refs_seen, []);
  });

  test('"see Refs #5 in the doc" mid-sentence is not a trailer', () => {
    const r = runLinked({ commits: ['docs: tweak\n\nsee Refs #5 in the doc'] });
    assert.deepStrictEqual(r.refs_seen, []);
  });

  test('refs_seen are deduplicated and ascending', () => {
    const r = runLinked({ commits: ['a\n\nRefs #14', 'b\n\nRefs #12', 'c\n\nRefs #14'] });
    assert.deepStrictEqual(r.refs_seen, [12, 14]);
  });
});

// ─── prNumberFromQueueRef (test 7) ───────────────────────────────────────────

describe('prNumberFromQueueRef', () => {
  test('extracts the PR number from a merge-queue ref', () => {
    assert.strictEqual(prNumberFromQueueRef('refs/heads/gh-readonly-queue/main/pr-123-abcdef'), 123);
    assert.strictEqual(prNumberFromQueueRef('refs/heads/gh-readonly-queue/main/pr-123-abc'), 123);
  });

  test('a base branch containing slashes still resolves', () => {
    assert.strictEqual(prNumberFromQueueRef('refs/heads/gh-readonly-queue/release/1.x/pr-77-0f1e2d'), 77);
  });

  test('the refs/heads/ prefix is optional', () => {
    assert.strictEqual(prNumberFromQueueRef('gh-readonly-queue/main/pr-9-abc'), 9);
  });

  test('a plain branch, a malformed ref and non-strings give null', () => {
    assert.strictEqual(prNumberFromQueueRef('refs/heads/main'), null);
    assert.strictEqual(prNumberFromQueueRef('refs/heads/feature/pr-123-abc'), null);
    assert.strictEqual(prNumberFromQueueRef('refs/heads/gh-readonly-queue/main/pr-x-abc'), null);
    assert.strictEqual(prNumberFromQueueRef(''), null);
    assert.strictEqual(prNumberFromQueueRef(null), null);
    assert.strictEqual(prNumberFromQueueRef(undefined), null);
    assert.strictEqual(prNumberFromQueueRef(123), null);
  });
});

// ─── planningConsistency (tests 4, 5) ────────────────────────────────────────

const STORE_ON = { github: { enabled: true, store: true } };

// The objective issue (#100) and two TRD issues (#101, #102) of objective 50, as the runner resolves them.
function objectiveIssues(over) {
  const map = new Map([
    [100, { number: 100, state: 'open', body: '<!-- aoforge:id=50 -->\nObjective 50' }],
    [101, { number: 101, state: 'open', body: '<!-- aoforge:id=50-01 -->\nTRD 50-01' }],
    [102, { number: 102, state: 'open', body: '<!-- aoforge:id=50-02 -->\nTRD 50-02' }],
  ]);
  for (const [n, patch] of Object.entries(over || {})) {
    map.set(Number(n), patch === null ? null : Object.assign({}, map.get(Number(n)), patch));
  }
  return map;
}

const OBJECTIVE_BODY = '<!-- aoforge:pr=50 -->\nCloses #100\nCloses #101\nCloses #102\n';

function runPlanning(over) {
  return planningConsistency(
    Object.assign(
      {
        pr: pr({ number: 130, body: OBJECTIVE_BODY }),
        repo: REPO,
        defaultBranch: 'main',
        config: STORE_ON,
        issues: objectiveIssues(),
        linked: [101, 102],
      },
      over
    )
  );
}

describe('planningConsistency: when there is nothing to check', () => {
  test('store mode off (no config): success, and says why', () => {
    const r = runPlanning({ config: null });
    assert.strictEqual(r.state, 'success');
    assert.ok(/store mode off/i.test(r.description));
    assert.ok(r.description.length <= 140);
  });

  test('github.store false, github absent, or not literally true: store mode is off', () => {
    for (const config of [{ github: { store: false } }, {}, { github: {} }, { github: { store: 'true' } }, undefined]) {
      const r = runPlanning({ config });
      assert.strictEqual(r.state, 'success', JSON.stringify(config));
      assert.ok(/store mode off/i.test(r.description), JSON.stringify(config));
    }
  });

  test('store mode off passes even for a PR that would fail the objective rules', () => {
    const r = runPlanning({ config: { github: { store: false } }, pr: pr({ body: '<!-- aoforge:pr=50 -->\n' }) });
    assert.strictEqual(r.state, 'success');
  });

  test('store mode on but no aoforge:pr marker: not an AOForge objective PR, success', () => {
    const r = runPlanning({ pr: pr({ body: 'Closes #12' }) });
    assert.strictEqual(r.state, 'success');
    assert.ok(/not an AOForge objective PR/i.test(r.description));
  });

  test('a missing body is not an objective PR either', () => {
    const r = runPlanning({ pr: pr({ body: null }) });
    assert.strictEqual(r.state, 'success');
    assert.ok(/not an AOForge objective PR/i.test(r.description));
  });

  test('result shape: state, description (<= 140), details[]', () => {
    for (const r of [runPlanning(), runPlanning({ config: null }), runPlanning({ linked: [101, 102, 103] })]) {
      assert.ok(['success', 'failure'].includes(r.state));
      assert.ok(r.description.length > 0 && r.description.length <= 140);
      assert.ok(Array.isArray(r.details));
    }
  });
});

describe('planningConsistency: an objective PR in store mode', () => {
  test('passes when the PR closes the objective issue and every linked TRD issue', () => {
    const r = runPlanning();
    assert.strictEqual(r.state, 'success');
    assert.ok(r.description.includes('#100'));
    assert.ok(r.description.length <= 140);
  });

  test('fails naming a linked TRD issue the PR does not close', () => {
    const r = runPlanning({ pr: pr({ body: '<!-- aoforge:pr=50 -->\nCloses #100\nCloses #101\n' }) });
    assert.strictEqual(r.state, 'failure');
    assert.ok(r.details.some((d) => d.includes('#102')));
    assert.ok(r.description.includes('#102'));
  });

  test('fails when the objective issue is known but not closed by the PR, naming it', () => {
    const r = runPlanning({ pr: pr({ body: '<!-- aoforge:pr=50 -->\nCloses #101\nCloses #102\n' }) });
    assert.strictEqual(r.state, 'failure');
    assert.ok(r.details.some((d) => d.includes('#100') && /objective/i.test(d)));
  });

  test('fails when no closing target carries the objective marker at all', () => {
    const r = runPlanning({
      pr: pr({ body: '<!-- aoforge:pr=50 -->\nCloses #101\nCloses #102\n' }),
      issues: new Map([
        [101, { number: 101, state: 'open', body: '<!-- aoforge:id=50-01 -->' }],
        [102, { number: 102, state: 'open', body: '<!-- aoforge:id=50-02 -->' }],
      ]),
    });
    assert.strictEqual(r.state, 'failure');
    assert.ok(r.details.some((d) => /objective issue/i.test(d) && d.includes('50')));
  });

  test('a TRD marker (50-01) is never mistaken for the objective marker (50)', () => {
    const r = runPlanning({
      pr: pr({ body: '<!-- aoforge:pr=50 -->\nCloses #101\n' }),
      issues: new Map([[101, { number: 101, state: 'open', body: '<!-- aoforge:id=50-01 -->' }]]),
      linked: [],
    });
    assert.strictEqual(r.state, 'failure');
    assert.ok(r.details.some((d) => /objective issue/i.test(d)));
  });

  test('a comment-kind marker in a body does not stand in for the objective issue marker', () => {
    const r = runPlanning({ issues: objectiveIssues({ 100: { body: '<!-- aoforge:id=50 kind=state -->\nsticky' } }) });
    assert.strictEqual(r.state, 'failure');
    assert.ok(r.details.some((d) => /objective issue/i.test(d)));
  });

  test('fails when a closing target was closed as not planned, naming it', () => {
    const r = runPlanning({ issues: objectiveIssues({ 101: { state: 'closed', state_reason: 'not_planned' } }) });
    assert.strictEqual(r.state, 'failure');
    assert.ok(r.details.some((d) => d.includes('#101') && /not.planned/i.test(d)));
  });

  test('fails when the objective issue itself was closed as not planned', () => {
    const r = runPlanning({ issues: objectiveIssues({ 100: { state: 'closed', state_reason: 'not_planned' } }) });
    assert.strictEqual(r.state, 'failure');
    assert.ok(r.details.some((d) => d.includes('#100') && /not.planned/i.test(d)));
  });

  test('a target closed as completed is not a violation', () => {
    const r = runPlanning({ issues: objectiveIssues({ 101: { state: 'closed', state_reason: 'completed' } }) });
    assert.strictEqual(r.state, 'success');
  });

  test('fails when the base is not the default branch, naming both', () => {
    const r = runPlanning({ pr: pr({ number: 130, body: OBJECTIVE_BODY, base: { ref: 'dev' } }) });
    assert.strictEqual(r.state, 'failure');
    const text = r.details.join('\n');
    assert.ok(text.includes('dev') && text.includes('main'));
  });

  test('a Closes line inside a code fence does not count as closing the TRD', () => {
    const r = runPlanning({ pr: pr({ body: '<!-- aoforge:pr=50 -->\nCloses #100\nCloses #101\n```\nCloses #102\n```\n' }) });
    assert.strictEqual(r.state, 'failure');
    assert.ok(r.details.some((d) => d.includes('#102')));
  });

  test('every violation gets its own line', () => {
    const r = runPlanning({
      pr: pr({ number: 130, body: '<!-- aoforge:pr=50 -->\nCloses #101\n', base: { ref: 'dev' } }),
      issues: objectiveIssues({ 101: { state: 'closed', state_reason: 'not_planned' } }),
    });
    assert.strictEqual(r.state, 'failure');
    const failures = r.details.filter((d) => /#100|#102|#101|dev/.test(d));
    assert.ok(failures.length >= 4, `expected one line per violation, got:\n${r.details.join('\n')}`);
  });

  test('linked may be a Set, a list of numbers or a list of issue objects', () => {
    assert.strictEqual(runPlanning({ linked: new Set([101, 102]) }).state, 'success');
    assert.strictEqual(runPlanning({ linked: [{ number: 101 }, { number: 102 }] }).state, 'success');
    const r = runPlanning({ linked: new Set([101, 102, 103]) });
    assert.strictEqual(r.state, 'failure');
    assert.ok(r.details.some((d) => d.includes('#103')));
  });

  test('an objective with no linked TRDs only needs the objective issue closed', () => {
    const r = runPlanning({ pr: pr({ body: '<!-- aoforge:pr=50 -->\nCloses #100\n' }), linked: undefined });
    assert.strictEqual(r.state, 'success');
  });

  test('the description stays within 140 characters with many violations', () => {
    const linked = Array.from({ length: 60 }, (_, i) => 1000 + i);
    const r = runPlanning({ linked, pr: pr({ body: '<!-- aoforge:pr=50 -->\nCloses #100\n', base: { ref: 'x'.repeat(80) } }) });
    assert.strictEqual(r.state, 'failure');
    assert.ok(r.description.length <= 140);
  });

  test('the module is pure: its only require is gh-body, so it cannot read .aoforge/ or spawn gh/git', () => {
    const source = fs.readFileSync(path.join(__dirname, 'gh-check.cjs'), 'utf8');
    const required = Array.from(source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)).map((m) => m[1]);
    assert.deepStrictEqual(required, ['./gh-body.cjs']);
    assert.ok(!/process\.env|process\.cwd|child_process|execSync|spawn/.test(source.replace(/\/\*[\s\S]*?\*\//g, '')));
  });
});

// ─── reconcilePlan (test 6) ──────────────────────────────────────────────────

describe('reconcilePlan', () => {
  const merged = { number: 130, merged: true };

  test('a merged PR returns the still-open targets plus the objective\'s open linked TRDs', () => {
    const targets = [
      { number: 100, state: 'closed' },
      { number: 101, state: 'open' },
    ];
    const linked = [
      { number: 101, state: 'open' },
      { number: 102, state: 'open' },
    ];
    assert.deepStrictEqual(reconcilePlan({ pr: merged, targets, linked }), [101, 102]);
  });

  test('an unmerged PR returns nothing, whatever is open', () => {
    const open = [{ number: 100, state: 'open' }];
    assert.deepStrictEqual(reconcilePlan({ pr: { number: 130, merged: false }, targets: open, linked: open }), []);
    assert.deepStrictEqual(reconcilePlan({ pr: { number: 130 }, targets: open, linked: open }), []);
    assert.deepStrictEqual(reconcilePlan({ pr: null, targets: open, linked: open }), []);
  });

  test('merged must be literally true', () => {
    const open = [{ number: 100, state: 'open' }];
    assert.deepStrictEqual(reconcilePlan({ pr: { merged: 'true' }, targets: open, linked: open }), []);
  });

  test('nothing open means nothing to do', () => {
    const closed = [{ number: 100, state: 'closed' }];
    assert.deepStrictEqual(reconcilePlan({ pr: merged, targets: closed, linked: closed }), []);
  });

  test('numbers are de-duplicated and ascending', () => {
    const targets = [
      { number: 105, state: 'open' },
      { number: 101, state: 'open' },
    ];
    const linked = [
      { number: 103, state: 'open' },
      { number: 101, state: 'open' },
    ];
    assert.deepStrictEqual(reconcilePlan({ pr: merged, targets, linked }), [101, 103, 105]);
  });

  test('Maps and null entries (a 404) are accepted; the state is case-insensitive', () => {
    const targets = new Map([
      [100, { number: 100, state: 'OPEN' }],
      [101, null],
    ]);
    assert.deepStrictEqual(reconcilePlan({ pr: merged, targets, linked: [null, { number: 102, state: 'Open' }] }), [100, 102]);
  });

  test('missing targets or linked are treated as empty', () => {
    assert.deepStrictEqual(reconcilePlan({ pr: merged }), []);
    assert.deepStrictEqual(reconcilePlan({ pr: merged, targets: [{ number: 7, state: 'open' }] }), [7]);
  });
});

// ─── fixture event files (test 8) ────────────────────────────────────────────

describe('gh-events fixtures', () => {
  test('exactly the four hand-written event files exist and each parses', () => {
    const names = fs.readdirSync(EVENTS_DIR).sort();
    assert.deepStrictEqual(names, [
      'merge_group.json',
      'pull_request-closes.json',
      'pull_request-merged.json',
      'pull_request-no-closes.json',
    ]);
    for (const name of names) assert.doesNotThrow(() => loadEvent(name), name);
  });

  test('pull_request-closes: linked-issue accepts the event shape and passes', () => {
    const ev = loadEvent('pull_request-closes.json');
    const r = linkedIssue({
      pr: ev.pull_request,
      repo: ev.repository.full_name,
      defaultBranch: ev.repository.default_branch,
      issues: new Map([[12, { number: 12, state: 'open' }]]),
      commits: [],
    });
    assert.strictEqual(r.state, 'success');
    assert.deepStrictEqual(r.closing, [12]);
  });

  test('pull_request-no-closes: linked-issue fails, and a Refs mention is not a closing reference', () => {
    const ev = loadEvent('pull_request-no-closes.json');
    const r = linkedIssue({
      pr: ev.pull_request,
      repo: ev.repository.full_name,
      defaultBranch: ev.repository.default_branch,
      issues: new Map(),
      commits: [],
    });
    assert.strictEqual(r.state, 'failure');
    assert.ok(/no closing reference/i.test(r.description));
  });

  test('pull_request-merged: an objective PR; planning-consistency passes, reconcile lists what is still open', () => {
    const ev = loadEvent('pull_request-merged.json');
    assert.strictEqual(ev.pull_request.merged, true);
    const issues = objectiveIssues();
    const consistency = planningConsistency({
      pr: ev.pull_request,
      repo: ev.repository.full_name,
      defaultBranch: ev.repository.default_branch,
      config: STORE_ON,
      issues,
      linked: [101, 102],
    });
    assert.strictEqual(consistency.state, 'success');
    const open = Array.from(issues.values());
    assert.deepStrictEqual(reconcilePlan({ pr: ev.pull_request, targets: open, linked: open.slice(1) }), [100, 101, 102]);
  });

  test('merge_group: the queue ref names the PR the closes fixture describes', () => {
    const ev = loadEvent('merge_group.json');
    assert.strictEqual(ev.repository.default_branch, 'main');
    assert.strictEqual(ev.merge_group.base_ref, 'refs/heads/main');
    assert.strictEqual(prNumberFromQueueRef(ev.merge_group.head_ref), loadEvent('pull_request-closes.json').pull_request.number);
  });
});
