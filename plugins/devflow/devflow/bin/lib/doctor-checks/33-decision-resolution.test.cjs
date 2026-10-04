'use strict';

// Tests for doctor check 33-decision-resolution (TRD 53-06 tests 1-3, item 53-8).
//
// no_llm_test_data: every project is a hand-built fixture under the OS temp dir (doctor-fixtures / upgrade-fixtures:
// local git identity, signing off, fake HOME), and every decision file is a literal built from the exact pre-52
// on-disk shapes. The check and its fix touch nothing but that temp project and its fake home: never this
// repository, the real ~/.claude, GitHub, the network or any port.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const check = require('./33-decision-resolution.cjs');
const doctor = require('../doctor.cjs');
const { extractFrontmatter } = require('../frontmatter.cjs');
const { makeDoctorProject } = require('../__fixtures__/doctor-fixtures.cjs');
const { gitEnv } = require('../__fixtures__/upgrade-fixtures.cjs');

const NOW = new Date('2026-10-04T12:00:00.000Z');
const RESOLVED_DIR = '.planning/decisions/resolved';
const PENDING_DIR = '.planning/decisions/pending';
const REPAIRABLE_REL = `${RESOLVED_DIR}/DECISION-007.md`;
const INTACT_REL = `${RESOLVED_DIR}/DECISION-002.md`;
const UNRECOVERABLE_REL = `${RESOLVED_DIR}/DECISION-008.md`;
const ANSWER = 'Option B.\nReason: second line with colon\n---\nthird line';

const BODY = '\n\n## Decision: Pick an option\n\n**Context:** Which one?\n\n---\n\n## To Resolve\n\nReply: `/decide`\n';

function head(id) {
  return [
    '---',
    `id: ${id}`,
    'objective: 52',
    'type: "checkpoint:decision"',
    'created: "2026-10-04T13:40:00.000Z"',
    'status: resolved',
    'blocks: []',
    'independent: []',
    'recommendation:',
  ];
}

// The 52-05 reproduction written by the pre-52 serializer: quoted because the answer holds `:`.
const REPAIRABLE =
  [
    ...head('DECISION-007'),
    'resolution: "Option B.',
    'Reason: second line with colon',
    '---',
    'third line',
    '"',
    'resolved_at: "2026-10-04T13:49:05.343Z"',
    '---',
  ].join('\n') + BODY;

// DECISION-002's shape: one line, then the writer's blank line, then resolved_at.
const INTACT =
  [...head('DECISION-002'), 'resolution: Kill. Not re-based.', '', 'resolved_at: "2026-10-01T20:12:24.575Z"', '---'].join('\n') +
  BODY;

// Re-serialized after mangling: the closing resolved_at went with the parse.
const UNRECOVERABLE =
  [...head('DECISION-008'), 'resolution: "Option B.', 'Reason: second line with colon', '---'].join('\n') +
  '\nthird line\n"\n\n## Decision: Pick an option\n';

const PENDING = [...head('DECISION-009').filter((l) => l !== 'status: resolved'), 'status: pending', '---'].join('\n') + BODY;

function ctxFor(root, home) {
  return doctor.buildContext({ projectRoot: root, userHome: home, env: gitEnv(home), now: NOW });
}

function put(root, rel, content) {
  const abs = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
  return abs;
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf-8');
}

function setStore(root) {
  const file = path.join(root, '.planning', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(file, 'utf-8'));
  cfg.github = { enabled: true, store: true };
  fs.writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`, 'utf-8');
}

function git(root, home, ...args) {
  return execFileSync('git', ['-C', root, ...args], { env: gitEnv(home), encoding: 'utf-8' });
}

function commitAll(root, home, message) {
  git(root, home, 'add', '-A');
  git(root, home, 'commit', '-q', '-m', message);
}

function stateOf(result, id) {
  const hit = (result.details && result.details.decisions ? result.details.decisions : []).find((d) => d.id === id);
  return hit ? hit.state : undefined;
}

describe('decision-resolution: contract', () => {
  test('a project check in the 30-39 range with a fix', () => {
    assert.equal(check.id, 'decision-resolution');
    assert.equal(check.scope, 'project');
    assert.equal(typeof check.title, 'string');
    assert.ok(check.title.length > 0);
    assert.equal(typeof check.run, 'function');
    assert.equal(typeof check.fix, 'function');
    assert.deepEqual(doctor.contractIssues(check), []);
  });
});

describe('decision-resolution: test 1, local mode end to end', () => {
  function fixture() {
    const { root, home } = makeDoctorProject();
    put(root, REPAIRABLE_REL, REPAIRABLE);
    put(root, INTACT_REL, INTACT);
    return { root, home };
  }

  test('run() warns, is fixable and names only the repairable decision', () => {
    const { root, home } = fixture();
    const r = check.run(ctxFor(root, home));
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, true);
    assert.match(r.finding, /DECISION-007/);
    assert.doesNotMatch(r.finding, /DECISION-002/);
    assert.equal(stateOf(r, 'DECISION-007'), 'repairable');
  });

  test('run() is read-only', () => {
    const { root, home } = fixture();
    check.run(ctxFor(root, home));
    assert.equal(read(root, REPAIRABLE_REL), REPAIRABLE);
    assert.equal(read(root, INTACT_REL), INTACT);
  });

  test('fix() rewrites the repairable file, reports it project-relative, and backs up under the fake home first', () => {
    const { root, home } = fixture();
    const ctx = ctxFor(root, home);
    const result = check.run(ctx);
    const out = check.fix(ctx, result);

    assert.equal(out.applied, true, JSON.stringify(out));
    assert.deepEqual(out.changed, [REPAIRABLE_REL]);
    assert.equal(typeof out.backup, 'string');
    assert.ok(!path.relative(home, out.backup).startsWith('..'), `backup ${out.backup} is under the fake home`);
    assert.equal(
      fs.readFileSync(path.join(out.backup, ...REPAIRABLE_REL.split('/')), 'utf-8'),
      REPAIRABLE,
      'the backup holds the file as it was before the fix'
    );

    const repaired = read(root, REPAIRABLE_REL);
    const fm = extractFrontmatter(repaired);
    assert.equal(fm.resolution, ANSWER);
    assert.equal(fm.resolved_at, '2026-10-04T13:49:05.343Z');
    assert.ok(repaired.includes('resolution: |-\n  Option B.\n'));
    assert.equal(repaired.slice(repaired.indexOf('## Decision')), REPAIRABLE.slice(REPAIRABLE.indexOf('## Decision')));
  });

  test('after the fix a re-run is ok and the intact file is byte-identical', () => {
    const { root, home } = fixture();
    const ctx = ctxFor(root, home);
    check.fix(ctx, check.run(ctx));

    const again = check.run(ctxFor(root, home));
    assert.equal(again.severity, 'ok');
    assert.equal(again.fixable, false);
    assert.equal(read(root, INTACT_REL), INTACT);
  });

  test('through the engine: --fix repairs once and the post-fix report is ok', () => {
    const { root, home } = fixture();
    const report = doctor.runDoctor({ projectRoot: root, userHome: home, env: gitEnv(home), now: NOW, checks: [check], fix: true });
    assert.equal(report.fixes.length, 1);
    assert.equal(report.fixes[0].id, 'decision-resolution');
    assert.equal(report.fixes[0].applied, true);
    assert.deepEqual(report.fixes[0].changed, [REPAIRABLE_REL]);
    assert.equal(report.checks[0].severity, 'ok');
  });

  test('fix() never commits and never changes the index: a tracked file is left modified in the working tree', () => {
    const { root, home } = fixture();
    commitAll(root, home, 'add decisions');
    const headBefore = git(root, home, 'rev-parse', 'HEAD');

    const ctx = ctxFor(root, home);
    const out = check.fix(ctx, check.run(ctx));
    assert.equal(out.applied, true);

    assert.equal(git(root, home, 'rev-parse', 'HEAD'), headBefore, 'no commit');
    assert.equal(git(root, home, 'diff', '--cached', '--name-only').trim(), '', 'nothing staged');
    assert.equal(git(root, home, 'diff', '--name-only').trim(), REPAIRABLE_REL, 'a plain working-tree edit');
  });

  test('the write is atomic: no temp file is left beside the decisions', () => {
    const { root, home } = fixture();
    const ctx = ctxFor(root, home);
    check.fix(ctx, check.run(ctx));
    assert.deepEqual(fs.readdirSync(path.join(root, ...RESOLVED_DIR.split('/'))).sort(), ['DECISION-002.md', 'DECISION-007.md']);
  });

  test('fix() re-scans: with nothing repairable it applies nothing and takes no backup', () => {
    const { root, home } = makeDoctorProject();
    put(root, INTACT_REL, INTACT);
    const ctx = ctxFor(root, home);
    const out = check.fix(ctx, { severity: 'warn', fixable: true });
    assert.equal(out.applied, false);
    assert.equal(out.backup, undefined);
    assert.equal(read(root, INTACT_REL), INTACT);
    assert.equal(fs.existsSync(ctx.paths.backupsDir), false, 'no backup directory was created');
  });
});

describe('decision-resolution: unrecoverable files are reported, never rewritten', () => {
  test('unrecoverable only: warn, not fixable, with the hand-fix instruction and the reason', () => {
    const { root, home } = makeDoctorProject();
    put(root, UNRECOVERABLE_REL, UNRECOVERABLE);
    const r = check.run(ctxFor(root, home));
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, false);
    assert.match(r.finding, /DECISION-008/);
    assert.match(r.finding, /resolution: \|-/);
    assert.match(r.finding, /two spaces/);
    assert.equal(stateOf(r, 'DECISION-008'), 'unrecoverable');
    const entry = r.details.decisions.find((d) => d.id === 'DECISION-008');
    assert.equal(typeof entry.reason, 'string');
    assert.ok(entry.reason.length > 0);
  });

  test('mixed: fixable for the repairable one, the unrecoverable one is untouched and still reported', () => {
    const { root, home } = makeDoctorProject();
    put(root, REPAIRABLE_REL, REPAIRABLE);
    put(root, UNRECOVERABLE_REL, UNRECOVERABLE);
    const ctx = ctxFor(root, home);
    const r = check.run(ctx);
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, true);
    assert.match(r.finding, /DECISION-007/);
    assert.match(r.finding, /DECISION-008/);

    const out = check.fix(ctx, r);
    assert.equal(out.applied, true);
    assert.deepEqual(out.changed, [REPAIRABLE_REL]);
    assert.equal(read(root, UNRECOVERABLE_REL), UNRECOVERABLE);

    const again = check.run(ctxFor(root, home));
    assert.equal(again.severity, 'warn');
    assert.equal(again.fixable, false);
    assert.match(again.finding, /DECISION-008/);
    assert.doesNotMatch(again.finding, /DECISION-007/);
  });
});

describe('decision-resolution: test 2, store mode is report-only', () => {
  function storeFixture() {
    const { root, home } = makeDoctorProject();
    put(root, REPAIRABLE_REL, REPAIRABLE);
    put(root, INTACT_REL, INTACT);
    setStore(root);
    return { root, home };
  }

  test('run() warns, is not fixable, and says the repair is a hand fix in store mode', () => {
    const { root, home } = storeFixture();
    const r = check.run(ctxFor(root, home));
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, false);
    assert.match(r.finding, /DECISION-007/);
    assert.match(r.finding, /hand fix/i);
    assert.match(r.finding, /store mode/i);
    assert.match(r.finding, /GitHub/);
    assert.equal(stateOf(r, 'DECISION-007'), 'repairable');
  });

  test('the engine never calls fix() in store mode', () => {
    const { root, home } = storeFixture();
    const report = doctor.runDoctor({ projectRoot: root, userHome: home, env: gitEnv(home), now: NOW, checks: [check], fix: true });
    assert.deepEqual(report.fixes, []);
    assert.equal(report.checks[0].severity, 'warn');
    assert.equal(report.checks[0].fixable, false);
    assert.equal(read(root, REPAIRABLE_REL), REPAIRABLE);
  });

  test('fix() called directly in store mode refuses and leaves the cache file alone', () => {
    const { root, home } = storeFixture();
    const ctx = ctxFor(root, home);
    const out = check.fix(ctx, { severity: 'warn', fixable: true });
    assert.equal(out.applied, false);
    assert.equal(typeof out.refused, 'string');
    assert.match(out.refused, /store mode/i);
    assert.equal(read(root, REPAIRABLE_REL), REPAIRABLE);
    assert.equal(fs.existsSync(ctx.paths.backupsDir), false, 'no backup directory was created');
  });

  test('github.store false (mirror mode) is local mode: fixable', () => {
    const { root, home } = makeDoctorProject();
    put(root, REPAIRABLE_REL, REPAIRABLE);
    const file = path.join(root, '.planning', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(file, 'utf-8'));
    cfg.github = { enabled: true, store: false };
    fs.writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`, 'utf-8');
    assert.equal(check.run(ctxFor(root, home)).fixable, true);
  });
});

describe('decision-resolution: test 3, nothing to report', () => {
  test('no decisions directory: ok, not fixable', () => {
    const { root, home } = makeDoctorProject();
    const r = check.run(ctxFor(root, home));
    assert.equal(r.severity, 'ok');
    assert.equal(r.fixable, false);
  });

  test('only pending decisions (no resolution to check): ok, not fixable', () => {
    const { root, home } = makeDoctorProject();
    put(root, `${PENDING_DIR}/DECISION-009.md`, PENDING);
    const r = check.run(ctxFor(root, home));
    assert.equal(r.severity, 'ok');
    assert.equal(r.fixable, false);
  });

  test('an empty resolved directory, and non-decision files in it, are ok', () => {
    const { root, home } = makeDoctorProject();
    fs.mkdirSync(path.join(root, ...RESOLVED_DIR.split('/')), { recursive: true });
    assert.equal(check.run(ctxFor(root, home)).severity, 'ok');
    put(root, `${RESOLVED_DIR}/README.md`, 'resolution: "not\na decision\n');
    put(root, `${RESOLVED_DIR}/.gitkeep`, '');
    assert.equal(check.run(ctxFor(root, home)).severity, 'ok');
  });

  test('only intact decisions: ok, and the finding says how many were checked', () => {
    const { root, home } = makeDoctorProject();
    put(root, INTACT_REL, INTACT);
    const r = check.run(ctxFor(root, home));
    assert.equal(r.severity, 'ok');
    assert.equal(r.fixable, false);
    assert.match(r.finding, /1/);
  });

  test('a store-mode project with only intact decisions is ok too', () => {
    const { root, home } = makeDoctorProject();
    put(root, INTACT_REL, INTACT);
    setStore(root);
    const r = check.run(ctxFor(root, home));
    assert.equal(r.severity, 'ok');
    assert.equal(r.fixable, false);
  });
});
