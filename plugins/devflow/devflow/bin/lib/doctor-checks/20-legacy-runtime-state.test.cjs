'use strict';

// Tests for doctor check 20-legacy-runtime-state (TRD 45-06, tests 4-9b; DOC-05 + DOC-06).
//
// no_llm_test_data: every project is a hand-built fixture under the OS temp dir. `userHome` is a
// fake home from the fixtures, so backups land under <fake home>/.claude/devflow/backups and never
// in the real ~/.claude. Every git call the test makes goes through gitEnv(home).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const legacy = require('./20-legacy-runtime-state.cjs');
const doctor = require('../doctor.cjs');
const upgrade = require('../upgrade.cjs');
const { makeDoctorProject, makeDoctorHome } = require('../__fixtures__/doctor-fixtures.cjs');
const {
  gitEnv, makeTrackedRuntimeStateProject, snapshot, diffSnapshots,
} = require('../__fixtures__/upgrade-fixtures.cjs');

const NOW = new Date('2026-09-30T12:00:00.000Z');
const COMMIT_CMD = 'node ~/.claude/devflow/bin/df-tools.cjs commit "chore: untrack DevFlow runtime state" --files';

function git(root, home, ...args) {
  return execFileSync('git', ['-C', root, ...args], {
    env: gitEnv(home),
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function lines(text) {
  return text.split('\n').filter(Boolean);
}

function lsFiles(root, home) {
  return lines(git(root, home, 'ls-files'));
}

function staged(root, home) {
  return lines(git(root, home, 'diff', '--cached', '--name-only'));
}

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

function ctxFor(root, home) {
  return doctor.buildContext({ projectRoot: root, userHome: home, env: gitEnv(home), now: NOW });
}

function backupsDir(home) {
  return path.join(home, '.claude', 'devflow', 'backups');
}

function stageUnrelated(root, home) {
  write(root, 'src/app.txt', 'unrelated user work\n');
  git(root, home, 'add', '--', 'src/app.txt');
}

/** The aodex shape: two tracked progress-guard files (root + nested) and an unignored awareness cache. */
function aodexFixture() {
  const home = makeDoctorHome();
  const { root } = makeTrackedRuntimeStateProject({
    home,
    tracked: ['.planning/.progress-guard.json', 'flutter/.planning/.progress-guard.json'],
    untrackedPresent: ['.planning/.awareness-cache.json'],
  });
  return { root, home };
}

const AODEX_PATHS = [
  '.planning/.awareness-cache.json',
  '.planning/.progress-guard.json',
  'flutter/.planning/.progress-guard.json',
];

describe('legacy-runtime-state: contract', () => {
  test('is a project check with a fix, in the 20-29 range', () => {
    assert.equal(legacy.id, 'legacy-runtime-state');
    assert.equal(legacy.scope, 'project');
    assert.equal(typeof legacy.title, 'string');
    assert.equal(typeof legacy.run, 'function');
    assert.equal(typeof legacy.fix, 'function');
    assert.deepEqual(doctor.contractIssues(legacy), []);
  });

  test('no project root → ok', () => {
    const home = makeDoctorHome();
    const ctx = doctor.buildContext({ projectRoot: null, userHome: home, env: gitEnv(home), now: NOW });
    assert.equal(legacy.run(ctx).severity, 'ok');
  });

  test('a clean stamped project → ok, not fixable', () => {
    const { root, home } = makeDoctorProject();
    const r = legacy.run(ctxFor(root, home));
    assert.equal(r.severity, 'ok');
    assert.equal(r.fixable, false);
  });

  test('.devflow-notices.json is a legitimate in-tree file and is never flagged', () => {
    const { root, home } = makeDoctorProject();
    write(root, '.planning/.devflow-notices.json', '{\n  "notices": []\n}\n');
    const r = legacy.run(ctxFor(root, home));
    assert.equal(r.severity, 'ok');
  });
});

describe('legacy-runtime-state: tracked runtime state (tests 4-5)', () => {
  test('4. aodex shape → error naming all three paths, fixable', () => {
    const { root, home } = aodexFixture();
    const r = legacy.run(ctxFor(root, home));
    assert.equal(r.severity, 'error');
    assert.equal(r.fixable, true);
    for (const p of AODEX_PATHS) assert.ok(r.finding.includes(p), `finding names ${p}: ${r.finding}`);
    assert.deepEqual(r.details.tracked, ['.planning/.progress-guard.json', 'flutter/.planning/.progress-guard.json']);
    assert.deepEqual(r.details.unignored, ['.planning/.awareness-cache.json']);
  });

  test('4. through the engine the result stays fixable (the module exports fix)', () => {
    const { root, home } = aodexFixture();
    const report = doctor.runDoctor({ projectRoot: root, userHome: home, env: gitEnv(home), now: NOW, checks: [legacy] });
    assert.equal(report.checks[0].id, 'legacy-runtime-state');
    assert.equal(report.checks[0].severity, 'error');
    assert.equal(report.checks[0].fixable, true);
  });

  test('5. the fix untracks + ignores all three, deletes the working copies, backs up, prints the commit command', () => {
    const { root, home } = aodexFixture();
    const nestedBefore = fs.readFileSync(path.join(root, 'flutter/.planning/.progress-guard.json'), 'utf-8');
    const ctx = ctxFor(root, home);
    const result = legacy.run(ctx);
    const res = legacy.fix(ctx, result);

    assert.equal(res.applied, true, JSON.stringify(res));
    // Untracked (index only) and ignored.
    const tracked = lsFiles(root, home);
    for (const p of AODEX_PATHS) assert.ok(!tracked.includes(p), `${p} no longer tracked`);
    const ignored = lines(git(root, home, '-c', `core.excludesFile=${os.devNull}`, 'check-ignore', '--no-index', '--', ...AODEX_PATHS));
    assert.deepEqual(ignored.sort(), AODEX_PATHS);
    // Working copies gone.
    for (const p of AODEX_PATHS) assert.equal(exists(root, p), false, `${p} deleted`);
    // The index holds only the doctor's own staged removals.
    assert.deepEqual(staged(root, home), ['.planning/.progress-guard.json', 'flutter/.planning/.progress-guard.json']);

    // Backup under <home>/.claude/devflow/backups/<repo-key>/ with root .planning/ and the nested copy.
    const keyDir = path.join(backupsDir(home), upgrade.repoKey(root));
    assert.ok(res.backup.startsWith(keyDir + path.sep), `${res.backup} under ${keyDir}`);
    assert.equal(fs.existsSync(path.join(res.backup, '.planning', '.progress-guard.json')), true);
    assert.equal(fs.existsSync(path.join(res.backup, '.planning', '.awareness-cache.json')), true);
    assert.equal(fs.existsSync(path.join(res.backup, '.planning', 'ROADMAP.md')), true);
    assert.equal(
      fs.readFileSync(path.join(res.backup, 'nested', 'flutter', '.planning', '.progress-guard.json'), 'utf-8'),
      nestedBefore,
    );

    // changed + the exact follow-up commit command.
    assert.deepEqual(res.changed, ['.gitignore', ...AODEX_PATHS]);
    assert.ok(
      res.notes.includes(`${COMMIT_CMD} .gitignore .planning/.progress-guard.json flutter/.planning/.progress-guard.json`),
      res.notes,
    );

    // Re-run → ok.
    const again = legacy.run(ctxFor(root, home));
    assert.equal(again.severity, 'ok', again.finding);
    assert.equal(again.fixable, false);
  });
});

describe('legacy-runtime-state: DOC-06 staged-changes guard (tests 6-7)', () => {
  test('6. SC5: an unrelated staged file → not fixable, fix refused, nothing changes', () => {
    const { root, home } = aodexFixture();
    stageUnrelated(root, home);
    const before = snapshot(root);
    const ctx = ctxFor(root, home);

    const r = legacy.run(ctx);
    assert.equal(r.severity, 'error');
    assert.equal(r.fixable, false);
    assert.equal(typeof r.fix_command, 'string');
    assert.match(r.fix_command, /doctor --fix/);
    assert.match(r.finding, /staged changes present: src\/app\.txt/);

    const res = legacy.fix(ctx, r);
    assert.equal(res.applied, false);
    assert.match(res.refused, /staged changes/);

    const tracked = lsFiles(root, home);
    assert.ok(tracked.includes('.planning/.progress-guard.json'));
    assert.ok(tracked.includes('flutter/.planning/.progress-guard.json'));
    assert.deepEqual(staged(root, home), ['src/app.txt']);
    assert.deepEqual(diffSnapshots(before, snapshot(root)), []);
    assert.equal(fs.existsSync(backupsDir(home)), false, 'a refused fix makes no backup');
  });

  test('7. .gitignore with unstaged user edits → refused the same way', () => {
    const home = makeDoctorHome();
    const { root } = makeTrackedRuntimeStateProject({
      home,
      tracked: ['.planning/.progress-guard.json'],
      untrackedPresent: ['.planning/.awareness-cache.json'],
      gitignore: 'node_modules/\n',
    });
    fs.appendFileSync(path.join(root, '.gitignore'), 'dist/\n', 'utf-8');
    const before = snapshot(root);
    const ctx = ctxFor(root, home);

    const r = legacy.run(ctx);
    assert.equal(r.fixable, false);
    assert.equal(typeof r.fix_command, 'string');

    const res = legacy.fix(ctx, r);
    assert.equal(res.applied, false);
    assert.match(res.refused, /\.gitignore/);
    assert.deepEqual(diffSnapshots(before, snapshot(root)), []);
    assert.ok(lsFiles(root, home).includes('.planning/.progress-guard.json'));
    assert.deepEqual(staged(root, home), []);
  });
});

describe('legacy-runtime-state: dead files (tests 8-9)', () => {
  test('8. ignored + untracked but present → warn, fixable even with staged work; fix deletes it', () => {
    const home = makeDoctorHome();
    const { root } = makeTrackedRuntimeStateProject({
      home,
      tracked: [],
      untrackedPresent: ['.planning/.progress-guard.json'],
      gitignore: '.planning/.progress-guard.json\n',
    });
    stageUnrelated(root, home); // no index change is needed, so the guard is not consulted
    const gitignoreBefore = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8');
    const ctx = ctxFor(root, home);

    const r = legacy.run(ctx);
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, true);
    assert.ok(r.finding.includes('.planning/.progress-guard.json'));

    const res = legacy.fix(ctx, r);
    assert.equal(res.applied, true);
    assert.equal(exists(root, '.planning/.progress-guard.json'), false);
    assert.deepEqual(res.changed, ['.planning/.progress-guard.json']);
    assert.equal(fs.readFileSync(path.join(root, '.gitignore'), 'utf-8'), gitignoreBefore);
    assert.deepEqual(staged(root, home), ['src/app.txt']);
    assert.doesNotMatch(res.notes, /df-tools\.cjs commit/, 'nothing to commit → no commit command');

    assert.equal(legacy.run(ctxFor(root, home)).severity, 'ok');
  });

  test('9. not a git repo, dead file present → warn; the fix deletes it', () => {
    const { root, home } = makeDoctorProject({ git: false });
    write(root, '.planning/.awareness-cache.json', '{\n  "branches": []\n}\n');
    const ctx = ctxFor(root, home);

    const r = legacy.run(ctx);
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, true);

    const res = legacy.fix(ctx, r);
    assert.equal(res.applied, true);
    assert.equal(exists(root, '.planning/.awareness-cache.json'), false);
    assert.equal(fs.existsSync(path.join(res.backup, '.planning', '.awareness-cache.json')), true);
    assert.equal(legacy.run(ctxFor(root, home)).severity, 'ok');
  });
});

describe('legacy-runtime-state: in-tree autonomous hook markers (tests 9a-9b)', () => {
  test('9a. untracked leftover retry/resume markers → warn naming both; fix backs up, deletes; re-run ok', () => {
    const home = makeDoctorHome();
    const { root } = makeTrackedRuntimeStateProject({ home, tracked: [] });
    write(root, '.planning/.autonomous-retry-agent1', '1\n');
    write(root, 'flutter/.planning/.autonomous-resume-10', '2\n');
    const ctx = ctxFor(root, home);

    const r = legacy.run(ctx);
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, true);
    assert.ok(r.finding.includes('.planning/.autonomous-retry-agent1'), r.finding);
    assert.ok(r.finding.includes('flutter/.planning/.autonomous-resume-10'), r.finding);

    const res = legacy.fix(ctx, r);
    assert.equal(res.applied, true);
    assert.equal(fs.readFileSync(path.join(res.backup, '.planning', '.autonomous-retry-agent1'), 'utf-8'), '1\n');
    assert.equal(
      fs.readFileSync(path.join(res.backup, 'nested', 'flutter', '.planning', '.autonomous-resume-10'), 'utf-8'),
      '2\n',
    );
    assert.equal(exists(root, '.planning/.autonomous-retry-agent1'), false);
    assert.equal(exists(root, 'flutter/.planning/.autonomous-resume-10'), false);
    assert.equal(exists(root, '.gitignore'), false, 'markers need no ignore rule; 0008 is not involved');
    assert.equal(legacy.run(ctxFor(root, home)).severity, 'ok');
  });

  test('9b. a tracked resume marker → error; the fix untracks (index only) and deletes it', () => {
    const home = makeDoctorHome();
    const { root } = makeTrackedRuntimeStateProject({ home, tracked: ['.planning/.autonomous-resume-10'] });
    const ctx = ctxFor(root, home);

    const r = legacy.run(ctx);
    assert.equal(r.severity, 'error');
    assert.equal(r.fixable, true);
    assert.ok(r.finding.includes('.planning/.autonomous-resume-10'));

    const res = legacy.fix(ctx, r);
    assert.equal(res.applied, true);
    assert.ok(!lsFiles(root, home).includes('.planning/.autonomous-resume-10'));
    assert.deepEqual(staged(root, home), ['.planning/.autonomous-resume-10']);
    assert.equal(exists(root, '.planning/.autonomous-resume-10'), false);
    assert.ok(res.notes.includes(`${COMMIT_CMD} .planning/.autonomous-resume-10`), res.notes);
    assert.ok(res.changed.includes('.planning/.autonomous-resume-10'));
    assert.equal(legacy.run(ctxFor(root, home)).severity, 'ok');
  });

  test('9b. with an unrelated staged file the marker fix is refused and nothing changes', () => {
    const home = makeDoctorHome();
    const { root } = makeTrackedRuntimeStateProject({ home, tracked: ['.planning/.autonomous-resume-10'] });
    stageUnrelated(root, home);
    const before = snapshot(root);
    const ctx = ctxFor(root, home);

    const r = legacy.run(ctx);
    assert.equal(r.fixable, false);
    const res = legacy.fix(ctx, r);
    assert.equal(res.applied, false);
    assert.match(res.refused, /staged changes/);
    assert.ok(lsFiles(root, home).includes('.planning/.autonomous-resume-10'));
    assert.deepEqual(staged(root, home), ['src/app.txt']);
    assert.deepEqual(diffSnapshots(before, snapshot(root)), []);
  });
});
