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
} = issueLib;

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
