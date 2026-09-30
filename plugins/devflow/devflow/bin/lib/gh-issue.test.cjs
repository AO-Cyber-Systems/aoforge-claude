'use strict';

/**
 * Tests for lib/gh-issue.cjs (TRD 46-05): finding or creating an objective's GitHub issue without
 * ever duplicating one, plus the once-per-run label and milestone bootstrap.
 *
 * Hermetic: a temp project, the stateful fake GitHub (__fixtures__/gh-fake.cjs) installed ONLY through
 * gh-client's `_setRunGh`, and a fake clock so write pacing never sleeps for real. Nothing here
 * reaches GitHub or the real ~/.claude.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const client = require('./gh-client.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const issueLib = require('./gh-issue.cjs');

const {
  createRunContext,
  ensureObjectiveLabel,
  ensureMilestone,
  ensureObjectiveMilestone,
  scanObjectiveIssues,
  verifyIssue,
  findOrCreateObjectiveIssue,
  parseIssueUrl,
} = issueLib;
const { markerLine } = require('./gh-body.cjs');

// ─── Harness ─────────────────────────────────────────────────────────────────

const ROADMAP = [
  '# Roadmap',
  '',
  '## Milestones',
  '',
  '- ✅ **v1.3 — Earlier** — Objectives 1-40 (shipped 2026-01-01)',
  '- 📋 **v1.4 — GitHub** — Objectives 46+ (planned)',
  '',
  '## Objectives',
  '',
  '### Objective 2: a',
  '',
  '### Objective 2.1: b',
  '',
].join('\n');

const tmpDirs = [];
let fake;

/** Install the fake through the client seam and a fake clock (pacing never sleeps for real). */
function installFake(opts) {
  const f = createFakeGitHub(opts);
  let t = 1_000_000;
  client._setNow(() => t);
  client._setSleep((ms) => { t += ms; });
  client._setRunGh(f.runGh);
  return f;
}

/**
 * A temp project: config `github:{enabled:true, repo:'o/r'}`, PROJECT.md, ROADMAP, and objectives
 * `02-a` (milestone v1.4) and `02.1-b` (no milestone: field).
 */
function makeProject({ github = { enabled: true, repo: 'o/r' }, roadmap = ROADMAP, mapping = null, objectives } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-issue-'));
  tmpDirs.push(cwd);
  const planning = path.join(cwd, '.planning');
  fs.mkdirSync(planning, { recursive: true });
  fs.writeFileSync(path.join(planning, 'config.json'), JSON.stringify({ github }));
  fs.writeFileSync(path.join(planning, 'PROJECT.md'), '# Demo Project\n\nA project.\n');
  if (roadmap !== null) fs.writeFileSync(path.join(planning, 'ROADMAP.md'), roadmap);
  const objs = objectives || {
    '02-a': '---\nobjective: a\nmilestone: v1.4\n---\n# a\n',
    '02.1-b': '---\nobjective: b\n---\n# b\n',
  };
  for (const [dir, text] of Object.entries(objs)) {
    fs.mkdirSync(path.join(planning, 'objectives', dir), { recursive: true });
    fs.writeFileSync(path.join(planning, 'objectives', dir, 'OBJECTIVE.md'), text);
  }
  if (mapping) fs.writeFileSync(path.join(planning, '.gh-mapping.json'), JSON.stringify(mapping));
  return cwd;
}

beforeEach(() => {
  fake = installFake();
});

afterEach(() => {
  client._resetClient();
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

const callsMatching = (prefix) => fake.calls().filter((a) => a.join(' ').startsWith(prefix));

// ─── createRunContext ────────────────────────────────────────────────────────

describe('createRunContext', () => {
  it('returns the skipped result unchanged, with zero gh calls, when github is not enabled', () => {
    const cwd = makeProject({ github: { enabled: false, repo: 'o/r' } });
    const ctx = createRunContext(cwd);
    assert.equal(ctx.skipped, true);
    assert.equal(ctx.ok, false);
    assert.equal(fake.calls().length, 0);
  });

  it('builds a run context from config, PROJECT.md and the v3 mapping without calling gh', () => {
    const cwd = makeProject({
      github: { enabled: true, repo: 'o/r', milestone_prefix: 'M-', labels: { objective: 'obj' } },
      mapping: { version: 3, milestones: { 'v1.4': 7 }, objectives: { 2: { issue_id: 5 } }, trds: {} },
    });
    const ctx = createRunContext(cwd);
    assert.equal(ctx.cwd, cwd);
    assert.equal(ctx.repo, 'o/r');
    assert.equal(ctx.label, 'obj');
    assert.equal(ctx.prefix, 'M-');
    assert.equal(ctx.projectName, 'Demo Project');
    assert.deepEqual(ctx.warnings, []);
    assert.equal(ctx.mapping.milestones['v1.4'], 7);
    assert.equal(ctx.mapping.objectives['2'].issue_id, 5);
    assert.deepEqual(ctx.conflicts, {});
    assert.equal(fake.calls().length, 0, 'building a context is pure local I/O');
  });

  it('defaults: label devflow:objective, prefix v, project name falls back to the repo name', () => {
    const cwd = makeProject();
    fs.rmSync(path.join(cwd, '.planning', 'PROJECT.md'));
    const ctx = createRunContext(cwd);
    assert.equal(ctx.label, 'devflow:objective');
    assert.equal(ctx.prefix, 'v');
    assert.equal(ctx.projectName, 'r');
    assert.deepEqual(ctx.mapping.objectives, {}, 'a missing mapping file is an empty v3 mapping');
  });

  it('exposes mapping conflicts so callers can stop for a human', () => {
    const cwd = makeProject({
      mapping: { version: 3, milestones: {}, objectives: {}, trds: {}, conflicts: { 2: [{ legacy_key: '2', issue_id: 1 }, { legacy_key: '02', issue_id: 4 }] } },
    });
    const ctx = createRunContext(cwd);
    assert.equal(ctx.conflicts['2'].length, 2);
    assert.strictEqual(ctx.conflicts, ctx.mapping.conflicts, 'one object: a conflict recorded later is persisted with the mapping');
  });

  it('refuses a mapping newer than this DevFlow reads, and warns about a mapping written for another repo', () => {
    const newer = makeProject({ mapping: { version: 9, objectives: {} } });
    const r = createRunContext(newer);
    assert.equal(r.ok, false);
    assert.match(r.error, /version/i);

    const other = makeProject({ mapping: { version: 3, repo: 'someone/else', milestones: {}, objectives: {}, trds: {} } });
    const ctx = createRunContext(other);
    assert.equal(ctx.ok, undefined, 'still usable');
    assert.match(ctx.warnings.join('\n'), /someone\/else/);
  });
});

// ─── ensureObjectiveLabel (test 19) ──────────────────────────────────────────

describe('ensureObjectiveLabel', () => {
  it('19. creates the label once per run, however many times it is asked', () => {
    const ctx = createRunContext(makeProject());
    assert.equal(ensureObjectiveLabel(ctx).ok, true);
    assert.equal(ensureObjectiveLabel(ctx).ok, true);
    assert.equal(ensureObjectiveLabel(ctx).ok, true);
    const creates = callsMatching('label create');
    assert.equal(creates.length, 1);
    assert.deepEqual(creates[0].slice(0, 6), ['label', 'create', 'devflow:objective', '--repo', 'o/r', '--color']);
    assert.ok(fake.labels.includes('devflow:objective'));
  });

  it('19b. "already exists" is success, and is not retried by the next call', () => {
    fake.seedIssue({ title: 'x', body: '', labels: ['devflow:objective'] }); // registers the label
    const ctx = createRunContext(makeProject());
    const r = ensureObjectiveLabel(ctx);
    assert.equal(r.ok, true);
    ensureObjectiveLabel(ctx);
    assert.equal(callsMatching('label create').length, 1);
  });

  it('19c. a real failure is reported, recorded as a warning, and is not treated as done', () => {
    const ctx = createRunContext(makeProject());
    fake.failNext('label create', { stderr: 'HTTP 403: Resource not accessible by integration' });
    const r = ensureObjectiveLabel(ctx);
    assert.equal(r.ok, false);
    assert.match(r.error, /Resource not accessible/);
    assert.match(ctx.warnings.join('\n'), /label/i);
    assert.equal(ensureObjectiveLabel(ctx).ok, true, 'the next call retries and succeeds');
  });

  it('19d. the configured label name is the one created', () => {
    const ctx = createRunContext(makeProject({ github: { enabled: true, repo: 'o/r', labels: { objective: 'team:obj' } } }));
    ensureObjectiveLabel(ctx);
    assert.deepEqual(fake.labels, ['team:obj']);
  });
});

// ─── ensureMilestone (test 20) ───────────────────────────────────────────────

describe('ensureMilestone', () => {
  it('20. an empty cache creates the milestone once and caches its number by title; a second call makes no calls', () => {
    const ctx = createRunContext(makeProject());
    assert.equal(ensureMilestone(ctx, 'v1.4'), 1);
    assert.equal(ctx.mapping.milestones['v1.4'], 1);
    assert.equal(fake.calls().length, 1);
    const [call] = fake.calls();
    assert.equal(call[0], 'api');
    assert.ok(call.includes('repos/o/r/milestones'));
    assert.ok(call.includes('title=v1.4'));
    assert.ok(call.includes('description=DevFlow milestone for Demo Project'));

    assert.equal(ensureMilestone(ctx, 'v1.4'), 1);
    assert.equal(fake.calls().length, 1, 'a cache hit makes zero gh calls');
  });

  it('20b. a 422 "already exists" is resolved by a paginated lookup by title', () => {
    fake.seedMilestone('v1.3');
    const wanted = fake.seedMilestone('v1.4');
    const ctx = createRunContext(makeProject());
    assert.equal(ensureMilestone(ctx, 'v1.4'), wanted);
    assert.equal(ctx.mapping.milestones['v1.4'], wanted);
    assert.equal(callsMatching('api --paginate --slurp repos/o/r/milestones?state=all').length, 1);
    assert.equal(fake.milestones.length, 2, 'the existing milestone is reused, not duplicated');
  });

  it('20c. a different title is a separate cache key', () => {
    const ctx = createRunContext(makeProject());
    const a = ensureMilestone(ctx, 'v1.4');
    const b = ensureMilestone(ctx, 'v1.5');
    assert.notEqual(a, b);
    assert.deepEqual(ctx.mapping.milestones, { 'v1.4': a, 'v1.5': b });
    assert.equal(fake.milestones.length, 2);
  });

  it('20d. a null title makes no calls and returns null', () => {
    const ctx = createRunContext(makeProject());
    assert.equal(ensureMilestone(ctx, null), null);
    assert.equal(fake.calls().length, 0);
  });

  it('20e. when neither create nor lookup can produce a number, returns null with a warning', () => {
    const ctx = createRunContext(makeProject());
    fake.failNext('milestones', { stderr: 'gh: Resource not accessible by integration (HTTP 403)' });
    fake.failNext('milestones', { stderr: 'gh: Resource not accessible by integration (HTTP 403)' });
    assert.equal(ensureMilestone(ctx, 'v1.4'), null);
    assert.match(ctx.warnings.join('\n'), /v1\.4/);
    assert.equal(ctx.mapping.milestones['v1.4'], undefined, 'nothing is cached for a milestone that does not exist');
  });

  it('20f. a cached number from a legacy mapping (a stale title key) is reused without a call', () => {
    const ctx = createRunContext(makeProject({ mapping: { version: 3, milestones: { 'v1.4': 9 }, objectives: {}, trds: {} } }));
    assert.equal(ensureMilestone(ctx, 'v1.4'), 9);
    assert.equal(fake.calls().length, 0);
  });
});

// ─── ensureObjectiveMilestone (test 21, resolution half) ─────────────────────

describe('ensureObjectiveMilestone', () => {
  it('uses the objective\'s own milestone: title from gh-milestone, number from the cache/create', () => {
    const ctx = createRunContext(makeProject());
    const r = ensureObjectiveMilestone(ctx, { id: '2', dir: '02-a', roadmapNumber: '2' });
    assert.equal(r.title, 'v1.4');
    assert.equal(r.number, 1);
    assert.equal(r.source, 'objective');
    assert.equal(ctx.mapping.milestones['v1.4'], 1);
  });

  it('a different milestone uses a different key (the cache no longer outlives the milestone)', () => {
    const ctx = createRunContext(makeProject());
    const a = ensureObjectiveMilestone(ctx, { id: '2', dir: '02-a', roadmapNumber: '2' });
    const b = ensureObjectiveMilestone(ctx, { id: '2.1', dir: '02.1-b', roadmapNumber: '2.1' });
    assert.equal(a.title, 'v1.4');
    assert.equal(b.title, 'v1.3', 'no milestone: field: the ROADMAP list answers');
    assert.notEqual(a.number, b.number);
    assert.deepEqual(Object.keys(ctx.mapping.milestones).sort(), ['v1.3', 'v1.4']);
  });

  it('21. no milestone resolved: title and number are null, a warning is recorded, never v1.0, no gh calls', () => {
    const cwd = makeProject({
      roadmap: '# Roadmap\n\nShipped as v1.1 once.\n\n### Objective 2: a\n',
      objectives: { '02-a': '---\nobjective: a\n---\n# a\n' },
    });
    const ctx = createRunContext(cwd);
    const r = ensureObjectiveMilestone(ctx, { id: '2', dir: '02-a', roadmapNumber: '2' });
    assert.equal(r.title, null);
    assert.equal(r.number, null);
    assert.equal(r.source, 'none');
    assert.match(ctx.warnings.join('\n'), /Objective 2.*no milestone/i);
    assert.equal(fake.calls().length, 0);
    assert.deepEqual(ctx.mapping.milestones, {});
  });

  it('honours milestone_prefix when building the title', () => {
    const ctx = createRunContext(makeProject({ github: { enabled: true, repo: 'o/r', milestone_prefix: 'M-' } }));
    const r = ensureObjectiveMilestone(ctx, { id: '2', dir: '02-a', roadmapNumber: '2' });
    assert.equal(r.title, 'M-1.4');
  });
});

// ─── Task 3: the resolution chain ────────────────────────────────────────────

const R2 = { id: '2', dir: '02-a', roadmapNumber: '2' };
const R21 = { id: '2.1', dir: '02.1-b', roadmapNumber: '2.1' };
const LABEL = 'devflow:objective';

/** The body a DevFlow-created issue carries: the marker line, then text. */
const createBodyFor = (id) => `${markerLine(id)}\nManaged by DevFlow.`;
const opts = (id, name) => ({ name, createBody: createBodyFor(id) });

/** Seed an issue that carries the `devflow:id` marker and the objective label. */
function seedMarked(id, title = `[Objective ${id}] seeded`, extra = 'human text') {
  return fake.seedIssue({ title, body: `${markerLine(id)}\n${extra}`, labels: [LABEL] });
}
/** Seed a pre-marker issue (title only). */
function seedUnmarked(title) {
  return fake.seedIssue({ title, body: 'old generated body', labels: [LABEL] });
}

const mappingOf = (objectives, extra = {}) => ({ version: 3, milestones: {}, objectives, trds: {}, ...extra });
const creates = () => fake.writes().filter((a) => a[0] === 'issue' && a[1] === 'create');
const viewCalls = () => callsMatching('issue view');
const listCalls = () => callsMatching('issue list');

describe('parseIssueUrl / verifyIssue / scanObjectiveIssues', () => {
  it('parseIssueUrl reads the number from the URL gh prints, and is null for anything else', () => {
    assert.equal(parseIssueUrl('https://github.com/o/r/issues/42'), 42);
    assert.equal(parseIssueUrl('\nhttps://github.com/o/r/issues/7\n'), 7);
    assert.equal(parseIssueUrl('Creating issue in o/r\n\nhttps://github.com/o/r/issues/9'), 9);
    assert.equal(parseIssueUrl('nothing here'), null);
    assert.equal(parseIssueUrl(''), null);
    assert.equal(parseIssueUrl(undefined), null);
  });

  it('verifyIssue distinguishes found, not found, and "could not ask"', () => {
    const ctx = createRunContext(makeProject());
    const n = seedMarked('2');
    const hit = verifyIssue(ctx, n);
    assert.equal(hit.ok, true);
    assert.equal(hit.issue.number, n);
    assert.deepEqual(Object.keys(hit.issue).sort(), ['body', 'number', 'state', 'title']);
    assert.deepEqual(viewCalls()[0], ['issue', 'view', String(n), '--repo', 'o/r', '--json', 'number,title,body,state']);

    const gone = verifyIssue(ctx, 99);
    assert.equal(gone.ok, false);
    assert.equal(gone.notFound, true);

    fake.failNext('issue view', { stderr: 'HTTP 502: Bad Gateway' });
    const down = verifyIssue(ctx, n);
    assert.equal(down.ok, false);
    assert.notEqual(down.notFound, true);
    assert.match(down.error, /502/);
  });

  it('scanObjectiveIssues lists once, caches, and indexes by marker, duplicate and unmarked', () => {
    const ctx = createRunContext(makeProject());
    const a = seedMarked('2');
    const b = seedUnmarked('[Objective 3] c');
    const d = seedMarked('4');
    const e = seedMarked('4');
    const scan = scanObjectiveIssues(ctx);
    assert.equal(scan.ok, true);
    assert.equal(scan.byId['2'], a);
    assert.deepEqual(scan.duplicates['4'], [d, e]);
    assert.deepEqual(scan.unmarked, [b]);
    assert.deepEqual(scan.titleById['3'], [b]);
    assert.strictEqual(scanObjectiveIssues(ctx), scan, 'the second call returns the cached scan');
    assert.equal(listCalls().length, 1);
    assert.deepEqual(listCalls()[0], ['issue', 'list', '--repo', 'o/r', '--label', LABEL, '--state', 'all', '--limit', '1000', '--json', 'number,title,body']);
  });

  it('scanObjectiveIssues reports a failed list instead of pretending nothing exists', () => {
    const ctx = createRunContext(makeProject());
    fake.failNext('issue list', { stderr: 'HTTP 502: Bad Gateway' });
    const scan = scanObjectiveIssues(ctx);
    assert.equal(scan.ok, false);
    assert.match(scan.error, /502/);
  });
});

describe('findOrCreateObjectiveIssue: the chain', () => {
  it('9. a mapping entry verified by one issue view is a hit; no list, no writes; entry fields kept', () => {
    const n = seedMarked('2');
    const cwd = makeProject({ mapping: mappingOf({ 2: { issue_id: n, state_comment_id: 55, verified_at: '2026-01-01T00:00:00Z' } }) });
    const ctx = createRunContext(cwd);
    const r = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    assert.equal(r.ok, true);
    assert.equal(r.source, 'mapping');
    assert.equal(r.issue_number, n);
    assert.equal(r.created, false);
    assert.equal(r.needs_marker, false);
    assert.match(r.body, /human text/);
    assert.match(r.title, /Objective 2/);
    assert.equal(viewCalls().length, 1);
    assert.equal(listCalls().length, 0);
    assert.equal(fake.writes().length, 0);
    assert.deepEqual(ctx.mapping.objectives['2'], { issue_id: n, state_comment_id: 55, verified_at: '2026-01-01T00:00:00Z' });
  });

  it('10. with no mapping, OBJECTIVE.md github_issue (same repo) is verified and used', () => {
    const n = seedMarked('2');
    const cwd = makeProject({ objectives: {
      '02-a': `---\nobjective: a\nmilestone: v1.4\ngithub_issue: o/r#${n}\n---\n# a\n`,
      '02.1-b': '---\nobjective: b\n---\n# b\n',
    } });
    const ctx = createRunContext(cwd);
    const r = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    assert.equal(r.ok, true);
    assert.equal(r.source, 'frontmatter');
    assert.equal(r.issue_number, n);
    assert.equal(listCalls().length, 0);
    assert.equal(fake.writes().length, 0);
    assert.equal(ctx.mapping.objectives['2'].issue_id, n);
  });

  it('10b. a github_issue of another repo is skipped with a warning, and the chain continues', () => {
    const n = seedMarked('2');
    const cwd = makeProject({ objectives: {
      '02-a': '---\nobjective: a\nmilestone: v1.4\ngithub_issue: x/y#9\n---\n# a\n',
      '02.1-b': '---\nobjective: b\n---\n# b\n',
    } });
    const ctx = createRunContext(cwd);
    const r = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    assert.equal(r.source, 'marker');
    assert.equal(r.issue_number, n);
    assert.match(r.warnings.join('\n'), /github_issue points at another repo/);
    assert.equal(viewCalls().length, 0, 'the foreign reference is never looked up');
  });

  it('10c. a github_issue that does not exist, or is marked for another objective, is ignored with a warning', () => {
    const other = seedMarked('7');
    const n = seedMarked('2');
    const gone = makeProject({ objectives: {
      '02-a': '---\nobjective: a\ngithub_issue: o/r#99\n---\n# a\n',
    } });
    const r1 = findOrCreateObjectiveIssue(createRunContext(gone), R2, opts('2', 'a'));
    assert.equal(r1.source, 'marker');
    assert.equal(r1.issue_number, n);
    assert.match(r1.warnings.join('\n'), /#99 not found/);

    const wrong = makeProject({ objectives: {
      '02-a': `---\nobjective: a\ngithub_issue: o/r#${other}\n---\n# a\n`,
    } });
    const r2 = findOrCreateObjectiveIssue(createRunContext(wrong), R2, opts('2', 'a'));
    assert.equal(r2.source, 'marker');
    assert.equal(r2.issue_number, n);
    assert.match(r2.warnings.join('\n'), new RegExp(`#${other}.*objective 7`));
  });

  it('11. with no mapping and no frontmatter, the marker scan finds the issue; one issue list serves every objective', () => {
    const a = seedMarked('2');
    const b = seedMarked('2.1');
    const ctx = createRunContext(makeProject());
    const r2 = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    const r21 = findOrCreateObjectiveIssue(ctx, R21, opts('2.1', 'b'));
    assert.equal(r2.source, 'marker');
    assert.equal(r2.issue_number, a);
    assert.equal(r2.needs_marker, false);
    assert.equal(r21.source, 'marker');
    assert.equal(r21.issue_number, b);
    assert.equal(listCalls().length, 1, 'the scan runs once per run');
  });

  it('12. an unmarked issue titled [Objective N] is found by title and flagged needs_marker', () => {
    const n = seedUnmarked('[Objective 2.1] b');
    const ctx = createRunContext(makeProject());
    const r = findOrCreateObjectiveIssue(ctx, R21, opts('2.1', 'b'));
    assert.equal(r.ok, true);
    assert.equal(r.source, 'title');
    assert.equal(r.issue_number, n);
    assert.equal(r.needs_marker, true);
    assert.equal(creates().length, 0);
    assert.equal(ctx.mapping.objectives['2.1'].issue_id, n);
  });

  it('12b. two unmarked issues with the same objective title stop resolution (duplicate_title)', () => {
    const a = seedUnmarked('[Objective 2] x');
    const b = seedUnmarked('[Objective 2] y');
    const ctx = createRunContext(makeProject());
    const r = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    assert.equal(r.ok, false);
    assert.equal(r.error, 'duplicate_title');
    assert.deepEqual(r.issues, [a, b]);
    assert.equal(fake.writes().length, 0);
  });

  it('12c. the title fallback only considers issues with NO marker', () => {
    seedMarked('7', '[Objective 2] but marked for seven');
    const ctx = createRunContext(makeProject());
    const r = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    assert.equal(r.source, 'created', 'a marked issue is never taken over by its title');
  });

  it('13. nothing matches: create with the title, label, milestone title and the caller\'s body', () => {
    const ctx = createRunContext(makeProject());
    const r = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    assert.equal(r.ok, true);
    assert.equal(r.source, 'created');
    assert.equal(r.created, true);
    assert.equal(r.issue_number, 1);

    const [create] = creates();
    assert.deepEqual(create, [
      'issue', 'create', '--repo', 'o/r', '--title', '[Objective 2] a',
      '--body', createBodyFor('2'), '--label', LABEL, '--milestone', 'v1.4',
    ]);
    assert.equal(fake.issues[0].milestone, 'v1.4');
    assert.deepEqual(fake.issues[0].labels, [LABEL]);
    assert.deepEqual(ctx.mapping.objectives['2'], { issue_id: 1, state_comment_id: null, verified_at: null });
    assert.equal(r.body, createBodyFor('2'));
  });

  it('13b. a second objective in the same run reuses the scan, the label and its own milestone key', () => {
    const ctx = createRunContext(makeProject());
    findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    const r21 = findOrCreateObjectiveIssue(ctx, R21, opts('2.1', 'b'));
    assert.equal(r21.created, true);
    assert.equal(fake.issues[1].title, '[Objective 2.1] b');
    assert.equal(fake.issues[1].milestone, 'v1.3', 'no milestone: field, so the ROADMAP list answers');
    assert.equal(listCalls().length, 1);
    assert.equal(callsMatching('label create').length, 1);
    assert.deepEqual(Object.keys(ctx.mapping.milestones).sort(), ['v1.3', 'v1.4']);
  });

  it('13c. resolving an objective again in the same run is a mapping hit, never a second create', () => {
    const ctx = createRunContext(makeProject());
    findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    const again = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    assert.equal(again.source, 'mapping');
    assert.equal(again.created, false);
    assert.equal(creates().length, 1);
    assert.equal(fake.issues.length, 1);
  });

  it('14. LOST MAPPING (success criterion 2): existing marked issues are found, zero issue create calls', () => {
    const a = seedMarked('2');
    const b = seedMarked('2.1');
    const ctx = createRunContext(makeProject()); // no .gh-mapping.json, no github_issue references
    const r2 = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    const r21 = findOrCreateObjectiveIssue(ctx, R21, opts('2.1', 'b'));
    assert.equal(r2.ok && r21.ok, true);
    assert.equal(creates().length, 0, 'no issue create');
    assert.equal(fake.writes().length, 0, 'no writes of any kind');
    assert.equal(fake.issues.length, 2);
    assert.equal(ctx.mapping.objectives['2'].issue_id, a);
    assert.equal(ctx.mapping.objectives['2.1'].issue_id, b);
  });

  it('15. two issues carrying the same devflow:id stop resolution with both numbers named', () => {
    const a = seedMarked('2');
    const other = seedMarked('2.1');
    const c = seedMarked('2');
    const ctx = createRunContext(makeProject());
    const r = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    assert.equal(r.ok, false);
    assert.equal(r.error, 'duplicate_marker');
    assert.deepEqual(r.issues, [a, c]);
    assert.match(r.message, new RegExp(`#${a}.*#${c}`));
    assert.equal(fake.writes().length, 0, 'nothing is picked, nothing is created');

    const fine = findOrCreateObjectiveIssue(ctx, R21, opts('2.1', 'b'));
    assert.equal(fine.ok, true, 'a duplicate for one id does not block another');
    assert.equal(fine.issue_number, other);
  });

  it('16. a mapping entry whose issue carries another id is re-keyed to that id, and resolution continues', () => {
    const real2 = seedMarked('2');
    const actually21 = seedMarked('2.1');
    const cwd = makeProject({ mapping: mappingOf({ 2: { issue_id: actually21, state_comment_id: 77, verified_at: null } }) });
    const ctx = createRunContext(cwd);
    const r = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    assert.equal(r.ok, true);
    assert.equal(r.source, 'marker');
    assert.equal(r.issue_number, real2);
    assert.deepEqual(ctx.mapping.objectives['2.1'], { issue_id: actually21, state_comment_id: 77, verified_at: null }, 'moved, state comment with it');
    assert.equal(ctx.mapping.objectives['2'].issue_id, real2);
    assert.match(r.warnings.join('\n'), /re-keyed/);
    assert.equal(creates().length, 0);
  });

  it('16b. when the marker\'s id is already taken by a different issue, the entry moves to conflicts', () => {
    const wrong = seedMarked('2.1');
    const taken = seedUnmarked('[Objective 2.1] b');
    const cwd = makeProject({ mapping: mappingOf({
      2: { issue_id: wrong, state_comment_id: null, verified_at: null },
      '2.1': { issue_id: taken, state_comment_id: null, verified_at: null },
    }) });
    const ctx = createRunContext(cwd);
    const r = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    assert.equal(ctx.mapping.objectives['2'] === undefined || ctx.mapping.objectives['2'].issue_id !== wrong, true);
    const listed = ctx.conflicts['2.1'].map((e) => e.issue_id).sort((x, y) => x - y);
    assert.deepEqual(listed, [wrong, taken].sort((x, y) => x - y));
    assert.equal(r.ok, true, 'resolution of the requested id continues');

    const blocked = findOrCreateObjectiveIssue(ctx, R21, opts('2.1', 'b'));
    assert.equal(blocked.ok, false);
    assert.equal(blocked.error, 'needs_human');
  });

  it('16c. re-keying onto an id that already names the same issue just drops the stale key', () => {
    const n = seedMarked('2.1');
    const cwd = makeProject({ mapping: mappingOf({
      2: { issue_id: n, state_comment_id: null, verified_at: null },
      '2.1': { issue_id: n, state_comment_id: 9, verified_at: null },
    }) });
    const ctx = createRunContext(cwd);
    findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    assert.deepEqual(ctx.conflicts, {});
    assert.equal(ctx.mapping.objectives['2.1'].issue_id, n);
    assert.equal(ctx.mapping.objectives['2.1'].state_comment_id, 9);
  });

  it('17. an id listed in conflicts returns needs_human and makes no gh calls', () => {
    const cwd = makeProject({ mapping: mappingOf({}, { conflicts: { 2: [{ legacy_key: '2', issue_id: 1 }, { legacy_key: '02', issue_id: 4 }] } }) });
    const ctx = createRunContext(cwd);
    const r = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    assert.equal(r.ok, false);
    assert.equal(r.error, 'needs_human');
    assert.equal(r.conflicts.length, 2);
    assert.equal(fake.calls().length, 0);
  });

  it('18. a mapped issue that no longer exists is dropped with a warning and the chain continues', () => {
    const cwd = makeProject({ mapping: mappingOf({ 2: { issue_id: 99, state_comment_id: 5, verified_at: null } }) });
    const ctx = createRunContext(cwd);
    const r = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    assert.equal(r.ok, true);
    assert.equal(r.source, 'created');
    assert.match(r.warnings.join('\n'), /mapped issue #99 not found/);
    assert.equal(ctx.mapping.objectives['2'].issue_id, r.issue_number);
    assert.equal(ctx.mapping.objectives['2'].state_comment_id, null, 'the old issue\'s state comment does not follow');
    assert.equal(viewCalls().length, 1);
  });

  it('18b. if the mapped issue cannot be checked (not "not found"), resolution stops: no create', () => {
    const n = seedMarked('2');
    const cwd = makeProject({ mapping: mappingOf({ 2: { issue_id: n, state_comment_id: null, verified_at: null } }) });
    const ctx = createRunContext(cwd);
    fake.failNext('issue view', { stderr: 'HTTP 502: Bad Gateway' });
    const r = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    assert.equal(r.ok, false);
    assert.equal(r.error, 'verify_failed');
    assert.equal(ctx.mapping.objectives['2'].issue_id, n, 'the entry is kept');
    assert.equal(creates().length, 0);
  });

  it('18c. a mapped issue with no marker and an unparseable title is accepted and flagged needs_marker', () => {
    const n = fake.seedIssue({ title: 'Some hand-made title', body: 'hand written', labels: [LABEL] });
    const cwd = makeProject({ mapping: mappingOf({ 2: { issue_id: n, state_comment_id: null, verified_at: null } }) });
    const r = findOrCreateObjectiveIssue(createRunContext(cwd), R2, opts('2', 'a'));
    assert.equal(r.ok, true);
    assert.equal(r.source, 'mapping');
    assert.equal(r.needs_marker, true);
    assert.equal(fake.writes().length, 0);
  });

  it('18d. a mapped issue with no marker whose title names another objective is re-keyed there', () => {
    const n = seedUnmarked('[Objective 3] c');
    const cwd = makeProject({ mapping: mappingOf({ 2: { issue_id: n, state_comment_id: null, verified_at: null } }) });
    const ctx = createRunContext(cwd);
    const r = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    assert.equal(ctx.mapping.objectives['3'].issue_id, n);
    assert.equal(r.source, 'created');
  });
});

describe('findOrCreateObjectiveIssue: create details', () => {
  it('21b. no milestone resolved: the issue is created without --milestone, with a warning, never v1.0', () => {
    const cwd = makeProject({
      roadmap: '# Roadmap\n\nShipped as v1.1 once.\n\n### Objective 2: a\n',
      objectives: { '02-a': '---\nobjective: a\n---\n# a\n' },
    });
    const ctx = createRunContext(cwd);
    const r = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    assert.equal(r.ok, true);
    const [create] = creates();
    assert.ok(!create.includes('--milestone'));
    assert.equal(fake.issues[0].milestone, null);
    assert.match(r.warnings.join('\n'), /no milestone/);
    assert.equal(callsMatching('api').length, 0, 'no milestone API call');
    assert.deepEqual(fake.milestones, []);
  });

  it('21c. a create that fails on a stale cached milestone re-ensures it once and retries once', () => {
    const cwd = makeProject({ mapping: mappingOf({}, { milestones: { 'v1.4': 9 } }) }); // #9 was deleted on GitHub
    const ctx = createRunContext(cwd);
    const r = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    assert.equal(r.ok, true);
    assert.equal(r.source, 'created');
    assert.equal(creates().length, 2, 'the failed create and its single retry');
    assert.equal(fake.issues.length, 1);
    assert.equal(fake.issues[0].milestone, 'v1.4');
    assert.equal(ctx.mapping.milestones['v1.4'], 1, 'the stale number was replaced');
  });

  it('21d. a create that fails for another reason is reported, not retried, and maps nothing', () => {
    const ctx = createRunContext(makeProject());
    fake.failNext('issue create', { stderr: 'HTTP 403: Resource not accessible by integration' });
    const r = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    assert.equal(r.ok, false);
    assert.equal(r.error, 'create_failed');
    assert.match(r.stderr, /Resource not accessible/);
    assert.equal(creates().length, 1);
    assert.equal(ctx.mapping.objectives['2'], undefined);
  });

  it('21e. the title falls back to the directory slug when the caller gives no name; the body to the marker line', () => {
    const ctx = createRunContext(makeProject());
    const r = findOrCreateObjectiveIssue(ctx, R2, {});
    assert.equal(r.ok, true);
    assert.equal(fake.issues[0].title, '[Objective 2] a');
    assert.equal(fake.issues[0].body, markerLine('2'));
  });

  it('a failed scan stops resolution: an unreadable list is never taken to mean "no issues"', () => {
    const ctx = createRunContext(makeProject());
    fake.failNext('issue list', { stderr: 'HTTP 502: Bad Gateway' });
    const r = findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    assert.equal(r.ok, false);
    assert.equal(r.error, 'scan_failed');
    assert.equal(creates().length, 0);
  });
});

describe('gh-client is the only path to gh', () => {
  it('22. a full create + find run reaches the fake only through gh-client, and gh-issue has no spawn or search', () => {
    const seen = [];
    client._setRunGh((args, o) => { seen.push(args); return fake.runGh(args, o); });
    const ctx = createRunContext(makeProject());
    findOrCreateObjectiveIssue(ctx, R2, opts('2', 'a'));
    findOrCreateObjectiveIssue(ctx, R21, opts('2.1', 'b'));
    assert.ok(seen.length > 0);
    assert.equal(seen.length, fake.calls().length, 'every fake call arrived through the gh-client seam');

    const src = fs.readFileSync(path.join(__dirname, 'gh-issue.cjs'), 'utf-8');
    assert.ok(!/child_process|spawnSync|execSync/.test(src), 'no direct process spawning');
    assert.ok(!/search/i.test(src), 'no GitHub search: list-and-scan only');
  });
});
