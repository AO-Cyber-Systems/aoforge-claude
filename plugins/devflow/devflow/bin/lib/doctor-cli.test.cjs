'use strict';

/**
 * doctor-cli.test.cjs — TRD 45-04 (DOC-04): `df-tools doctor` front-end, dispatch and help.
 *
 * `output()`/`error()` (lib/helpers.cjs) call `process.exit`, so doctor-cli.cjs keeps parsing,
 * project resolution and rendering pure (`runDoctorCli` returns `{ok, result, text}`), tested
 * in-process here. The spawn tests then exercise the real dispatcher arm end to end.
 *
 * Isolation: every spawn gets `HOME=<makeDoctorHome()>` and `DEVFLOW_DOCTOR_CHECKS_DIR=<temp stub
 * dir>` (the test-only checksDir override), so neither the real ~/.claude nor the real checks in
 * lib/doctor-checks/ are ever touched. `--cwd` targets the fixture project.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const cli = require('./doctor-cli.cjs');
const {
  makeDoctorHome, makeDoctorProject, makeChecksDir, writeStubCheck,
} = require('./__fixtures__/doctor-fixtures.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');

const OK_RUN = "return { severity: 'ok', finding: 'all good', fixable: false };";

function spawnTools(argv, { cwd, home, checksDir, extraEnv = {} }) {
  const env = { ...process.env, HOME: home, ...extraEnv };
  delete env.DEVFLOW_DOCTOR_CHECKS_DIR;
  if (checksDir) env.DEVFLOW_DOCTOR_CHECKS_DIR = checksDir;
  const args = cwd ? ['--cwd', cwd, ...argv] : argv;
  const r = spawnSync(process.execPath, [TOOLS_PATH, ...args], {
    cwd: os.tmpdir(), encoding: 'utf-8', timeout: 30000, env,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function plainDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'df-doctor-plain-'));
}

function projectDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-doctor-cliproj-'));
  fs.mkdirSync(path.join(root, '.planning'));
  return root;
}

// ─── 9. Argument parsing ──────────────────────────────────────────────────────

describe('parseDoctorArgs', () => {
  test('9: no flags → report mode defaults', () => {
    assert.deepStrictEqual(cli.parseDoctorArgs([], '/somewhere'),
      { ok: true, fix: false, json: false, global: false, path: null });
  });

  test('9: --fix, --json, --global are booleans', () => {
    assert.deepStrictEqual(cli.parseDoctorArgs(['--fix', '--json'], '/somewhere'),
      { ok: true, fix: true, json: true, global: false, path: null });
    assert.deepStrictEqual(cli.parseDoctorArgs(['--global'], '/somewhere'),
      { ok: true, fix: false, json: false, global: true, path: null });
  });

  test('9: --path <dir> resolves a relative dir against cwd; an absolute one is kept', () => {
    const base = plainDir();
    fs.mkdirSync(path.join(base, 'sub'));
    const rel = cli.parseDoctorArgs(['--path', 'sub'], base);
    assert.strictEqual(rel.ok, true);
    assert.strictEqual(rel.path, path.join(base, 'sub'));
    const abs = cli.parseDoctorArgs(['--path', base], '/elsewhere');
    assert.strictEqual(abs.path, base);
  });

  test('9: unknown flag, stray positional, and --path without a value are usage errors', () => {
    const unknown = cli.parseDoctorArgs(['--frobnicate'], '/x');
    assert.strictEqual(unknown.ok, false);
    assert.match(unknown.message, /--frobnicate/);

    const stray = cli.parseDoctorArgs(['extra'], '/x');
    assert.strictEqual(stray.ok, false);
    assert.match(stray.message, /extra/);

    const bare = cli.parseDoctorArgs(['--path'], '/x');
    assert.strictEqual(bare.ok, false);
    assert.match(bare.message, /--path requires a value/);

    const flagAsValue = cli.parseDoctorArgs(['--path', '--json'], '/x');
    assert.strictEqual(flagAsValue.ok, false);
    assert.match(flagAsValue.message, /--path requires a value/);
  });

  test('9: --path together with --global is a usage error', () => {
    const r = cli.parseDoctorArgs(['--global', '--path', '/tmp'], '/x');
    assert.strictEqual(r.ok, false);
    assert.match(r.message, /--global/);
  });
});

// ─── 10. Project resolution ───────────────────────────────────────────────────

describe('resolveProject', () => {
  test('10: --path at a dir without .planning/ → projectRoot null plus an info note', () => {
    const dir = plainDir();
    const r = cli.resolveProject('/unused', dir);
    assert.strictEqual(r.projectRoot, null);
    assert.match(r.note, /no \.planning\//);
    assert.ok(r.note.includes(dir), r.note);
  });

  test('10: --path at a project → its realpath, no note', () => {
    const root = projectDir();
    const r = cli.resolveProject('/unused', root);
    assert.strictEqual(r.projectRoot, fs.realpathSync(root));
    assert.strictEqual(r.note, undefined);
  });

  test('10: without --path, walks up from cwd to the nearest .planning/', () => {
    const root = projectDir();
    const deep = path.join(root, 'a', 'b', 'c');
    fs.mkdirSync(deep, { recursive: true });
    const r = cli.resolveProject(deep, null);
    assert.strictEqual(r.projectRoot, fs.realpathSync(root));
  });

  test('10: a .planning FILE is not a project marker', () => {
    const dir = plainDir();
    fs.writeFileSync(path.join(dir, '.planning'), 'not a dir');
    const r = cli.resolveProject(dir, dir);
    assert.strictEqual(r.projectRoot, null);
  });

  test('10: without --path and no .planning/ above cwd → null plus a note', () => {
    const dir = plainDir();
    const r = cli.resolveProject(dir, null);
    assert.strictEqual(r.projectRoot, null);
    assert.match(r.note, /no DevFlow project/);
  });

  test('10: runDoctorCli with --path at a missing dir is a usage error', () => {
    const r = cli.runDoctorCli({
      cwd: os.tmpdir(), argv: ['--path', path.join(plainDir(), 'missing')], env: {}, userHome: makeDoctorHome(),
    });
    assert.strictEqual(r.ok, false);
    assert.match(r.message, /does not exist/);
  });

  test('10: runDoctorCli carries the note into result.notes and the text', () => {
    const checksDir = makeChecksDir();
    const dir = plainDir();
    const r = cli.runDoctorCli({
      cwd: dir, argv: ['--path', dir], env: { DEVFLOW_DOCTOR_CHECKS_DIR: checksDir }, userHome: makeDoctorHome(),
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.result.scope.project, null);
    assert.strictEqual(r.result.notes.length, 1);
    assert.ok(r.text.includes(r.result.notes[0]));
  });
});

// ─── 11. Text rendering ───────────────────────────────────────────────────────

describe('renderText', () => {
  const report = {
    engine_version: '9.9.9',
    schema_version: 1,
    mode: 'report',
    scope: { project: '/p', global: true },
    status: 'broken',
    summary: { ok: 1, warn: 2, error: 1, fixable: 1 },
    checks: [
      { id: 'mirror', title: 'Mirror', scope: 'global', severity: 'ok', finding: 'mirror matches 2.11.0', fixable: false },
      { id: 'state', title: 'State', scope: 'project', severity: 'warn', finding: 'stale marker', fixable: true, fix_command: 'df-tools doctor --fix' },
      { id: 'cache', title: 'Cache', scope: 'global', severity: 'warn', finding: '3 old versions', fixable: false, fix_command: '/plugin update devflow@aocyber' },
      { id: 'hooks', title: 'Hooks', scope: 'global', severity: 'error', finding: 'hooks.json unreadable', fixable: false },
    ],
    fixes: [],
  };

  test('11: one line per check with severity tag, id and finding; fixable/run hints', () => {
    const text = cli.renderText(report);
    const lines = text.split('\n');
    const checkLines = lines.filter((l) => /^\[(ok|warn|error)\]/.test(l));
    assert.strictEqual(checkLines.length, 4);
    assert.match(checkLines[0], /^\[ok\]\s+mirror — mirror matches 2\.11\.0$/);
    assert.match(checkLines[1], /^\[warn\]\s+state — stale marker \(fixable\)$/);
    assert.match(checkLines[2], /^\[warn\]\s+cache — 3 old versions \(run: \/plugin update devflow@aocyber\)$/);
    assert.match(checkLines[3], /^\[error\]\s+hooks — hooks\.json unreadable$/);
    // Tags pad to one width so ids line up.
    const idCol = checkLines.map((l) => l.search(/[a-z]+ —/));
    assert.strictEqual(new Set(idCol).size, 1, `ids must align: ${JSON.stringify(checkLines)}`);
  });

  test('11: ends with the status line', () => {
    const text = cli.renderText(report).trimEnd();
    const last = text.split('\n').pop();
    assert.match(last, /^status: broken\b/);
  });

  test('11: fix mode lists each fix attempt before the status line', () => {
    const text = cli.renderText({
      ...report,
      mode: 'fix',
      fixes: [
        { id: 'state', applied: true, changed: ['.gitignore', '.planning/x.json'], backup: '/b/1' },
        { id: 'legacy', applied: false, refused: 'unrelated changes are staged' },
      ],
    });
    const fixesAt = text.indexOf('fixes:');
    const statusAt = text.indexOf('status:');
    assert.ok(fixesAt !== -1 && fixesAt < statusAt, text);
    assert.match(text, /applied\]\s+state — changed: \.gitignore, \.planning\/x\.json; backup: \/b\/1/);
    assert.match(text, /refused\]\s+legacy — unrelated changes are staged/);
  });

  test('11: an empty report renders the status line only after a no-checks note', () => {
    const text = cli.renderText({ ...report, status: 'healthy', summary: { ok: 0, warn: 0, error: 0, fixable: 0 }, checks: [] });
    assert.match(text, /no checks ran/);
    assert.match(text, /status: healthy/);
  });
});

// ─── 12. Spawned end to end ───────────────────────────────────────────────────

describe('df-tools doctor (spawned)', () => {
  test('12: --json on a fixture project exits 0 with schema_version 1', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, git: false });
    const checksDir = makeChecksDir();
    writeStubCheck(checksDir, { file: '10-g.cjs', id: 'g', scope: 'global', runBody: OK_RUN });
    writeStubCheck(checksDir, {
      file: '20-p.cjs', id: 'p', scope: 'project',
      runBody: "return { severity: 'warn', finding: 'home=' + ctx.userHome, fixable: false };",
    });

    const r = spawnTools(['doctor', '--json'], { cwd: root, home, checksDir });
    assert.strictEqual(r.status, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.strictEqual(report.schema_version, 1);
    assert.strictEqual(report.mode, 'report');
    assert.strictEqual(report.scope.project, fs.realpathSync(root));
    assert.deepStrictEqual(report.checks.map((c) => c.id), ['g', 'p']);
    assert.strictEqual(report.checks[1].finding, `home=${home}`, 'userHome must come from HOME');
    assert.strictEqual(report.status, 'degraded');
    assert.strictEqual(typeof report.engine_version, 'string');
  });

  test('12: an empty checks dir → healthy, checks:[]', () => {
    const home = makeDoctorHome();
    const r = spawnTools(['doctor', '--json'], { cwd: plainDir(), home, checksDir: makeChecksDir() });
    assert.strictEqual(r.status, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.strictEqual(report.status, 'healthy');
    assert.deepStrictEqual(report.checks, []);
    assert.deepStrictEqual(report.fixes, []);
  });

  test('12: --global skips project checks even inside a project', () => {
    const home = makeDoctorHome();
    const checksDir = makeChecksDir();
    writeStubCheck(checksDir, { file: '10-g.cjs', id: 'g', scope: 'global', runBody: OK_RUN });
    writeStubCheck(checksDir, { file: '20-p.cjs', id: 'p', scope: 'project', runBody: OK_RUN });
    const r = spawnTools(['doctor', '--json', '--global'], { cwd: projectDir(), home, checksDir });
    assert.strictEqual(r.status, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.deepStrictEqual(report.checks.map((c) => c.id), ['g']);
    assert.strictEqual(report.scope.project, null);
  });

  test('12: --fix --json applies the fixable stub and reports the post-fix state', () => {
    const home = makeDoctorHome();
    const checksDir = makeChecksDir();
    const marker = path.join(plainDir(), 'fixed');
    writeStubCheck(checksDir, {
      file: '10-flip.cjs', id: 'flip',
      runBody: `if (fs.existsSync(${JSON.stringify(marker)})) return { severity: 'ok', finding: 'fixed', fixable: false };\n` +
        "    return { severity: 'warn', finding: 'stale', fixable: true };",
      fixBody: `fs.writeFileSync(${JSON.stringify(marker)}, 'x');\n    return { applied: true };`,
    });
    const r = spawnTools(['doctor', '--fix', '--json'], { cwd: plainDir(), home, checksDir });
    assert.strictEqual(r.status, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.strictEqual(report.mode, 'fix');
    assert.deepStrictEqual(report.fixes, [{ id: 'flip', applied: true }]);
    assert.strictEqual(report.checks[0].severity, 'ok');
    assert.strictEqual(report.status, 'healthy');
  });

  test('12: without --json the text report prints and exits 0 even when broken', () => {
    const home = makeDoctorHome();
    const checksDir = makeChecksDir();
    writeStubCheck(checksDir, { file: '10-e.cjs', id: 'e', runBody: "return { severity: 'error', finding: 'bad', fixable: false };" });
    const r = spawnTools(['doctor'], { cwd: plainDir(), home, checksDir });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /^\[error\]\s+e — bad$/m);
    assert.match(r.stdout, /^status: broken/m);
  });

  test('12: a usage error exits 1 and names the flag', () => {
    const r = spawnTools(['doctor', '--bogus'], { cwd: plainDir(), home: makeDoctorHome(), checksDir: makeChecksDir() });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--bogus/);
  });
});

// ─── 13. Help ─────────────────────────────────────────────────────────────────

describe('doctor help', () => {
  test('13: doctor --help / -h print the usage, exit 0 and run nothing', () => {
    const home = makeDoctorHome();
    const checksDir = makeChecksDir();
    const ran = path.join(plainDir(), 'ran');
    writeStubCheck(checksDir, {
      file: '10-spy.cjs', id: 'spy',
      runBody: `fs.writeFileSync(${JSON.stringify(ran)}, 'x');\n    return { severity: 'ok', finding: 'x', fixable: false };`,
    });
    for (const flag of ['--help', '-h']) {
      const r = spawnTools(['doctor', flag], { cwd: plainDir(), home, checksDir });
      assert.strictEqual(r.status, 0, r.stderr);
      assert.match(r.stdout, /^Usage: df-tools doctor \[--fix\] \[--json\] \[--path <dir>\] \[--global\]$/m);
      assert.match(r.stdout, /Read-only by default\./);
      assert.doesNotMatch(r.stdout, /^R\ne\na\nd/m, 'details must render as a paragraph, not one char per line');
    }
    assert.strictEqual(fs.existsSync(ran), false, '--help must not run any check');
  });

  test('13: the top-level listing includes doctor, marked as writing', () => {
    const r = spawnTools(['--help'], { home: makeDoctorHome() });
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /\n {2}doctor\s+\*\s+Diagnose/);
  });

  test('13: help.cjs has the doctor entry', () => {
    const { COMMANDS, commandUsage } = require('./help.cjs');
    assert.ok(COMMANDS.doctor, 'help.cjs must have a doctor entry');
    assert.strictEqual(COMMANDS.doctor.usage, 'df-tools doctor [--fix] [--json] [--path <dir>] [--global]');
    assert.strictEqual(COMMANDS.doctor.mutates, true);
    const text = commandUsage('doctor');
    assert.ok(text.includes(COMMANDS.doctor.details), 'a string details must render verbatim');
  });
});
