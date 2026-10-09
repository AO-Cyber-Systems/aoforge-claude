'use strict';

/**
 * doctor.test.cjs — TRD 45-04 (DOC-04): the doctor engine.
 *
 * The engine owns no check logic, so every test drives it with STUB check modules written into a
 * temp `checksDir` by `writeStubCheck` (doctor-fixtures). Real checks (45-05..07) are never loaded.
 * Every `userHome` is a `makeDoctorHome()` temp dir; the real `~/.claude` is never read or written.
 *
 * Spies are files, not globals: a stub's fix() appends its id to a log file, so "was fix() called,
 * and in what order" is read back from disk.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const doctor = require('./doctor.cjs');
const { LEGACY } = require('./legacy-names.cjs');
const {
  makeDoctorHome, makeChecksDir, writeStubCheck,
} = require('./__fixtures__/doctor-fixtures.cjs');

// ─── Stub bodies (literal) ────────────────────────────────────────────────────

const OK_RUN = "return { severity: 'ok', finding: 'all good', fixable: false };";
const WARN_RUN = "return { severity: 'warn', finding: 'needs attention', fixable: false };";
const ERROR_RUN = "return { severity: 'error', finding: 'broken thing', fixable: false };";

/** A run() that is `warn, fixable` until `marker` exists, then `ok`. */
function flipRun(marker) {
  return `if (fs.existsSync(${JSON.stringify(marker)})) return { severity: 'ok', finding: 'fixed', fixable: false };\n` +
    "    return { severity: 'warn', finding: 'stale thing', fixable: true, fix_command: 'aof-tools doctor --fix' };";
}

/** A fix() that appends `id` to `log` and creates `marker` (when given). */
function spyFix(log, id, marker) {
  let body = `fs.appendFileSync(${JSON.stringify(log)}, ${JSON.stringify(id + '\n')});\n`;
  if (marker) body += `    fs.writeFileSync(${JSON.stringify(marker)}, 'done');\n`;
  body += `    return { applied: true, changed: [${JSON.stringify('.aoforge/' + id + '.json')}] };`;
  return body;
}

function readLog(log) {
  return fs.existsSync(log) ? fs.readFileSync(log, 'utf-8').split('\n').filter(Boolean) : [];
}

function tmpFile(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'df-doctor-spy-')), name);
}

function tmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-doctor-proj-'));
  fs.mkdirSync(path.join(root, '.aoforge'));
  return root;
}

function baseOpts(checksDir, extra = {}) {
  return {
    projectRoot: null,
    userHome: makeDoctorHome(),
    env: {},
    now: new Date('2026-09-30T12:00:00.000Z'),
    pluginVersion: '9.9.9',
    checksDir,
    ...extra,
  };
}

function ids(report) {
  return report.checks.map((c) => c.id);
}

// ─── 1. Registry ──────────────────────────────────────────────────────────────

describe('loadChecks (registry)', () => {
  test('1: sorted by filename; skips *.test.cjs, README.md and non-matching names', () => {
    const dir = makeChecksDir();
    writeStubCheck(dir, { file: '20-b.cjs', id: 'b', runBody: OK_RUN });
    writeStubCheck(dir, { file: '10-a.cjs', id: 'a', runBody: OK_RUN });
    writeStubCheck(dir, { file: '30-c.cjs', id: 'c', runBody: OK_RUN });
    writeStubCheck(dir, { file: '10-a.test.cjs', id: 'a-test', runBody: OK_RUN });
    writeStubCheck(dir, { file: 'x-bad.cjs', id: 'x', runBody: OK_RUN });
    writeStubCheck(dir, { file: '1-short.cjs', id: 'short', runBody: OK_RUN });
    writeStubCheck(dir, { file: '40-Upper.cjs', id: 'upper', runBody: OK_RUN });
    writeStubCheck(dir, { file: '50-notjs.js', id: 'notjs', runBody: OK_RUN });
    fs.writeFileSync(path.join(dir, 'README.md'), '# contract\n');

    const loaded = doctor.loadChecks({ checksDir: dir });
    assert.deepStrictEqual(loaded.map((c) => c.file), ['10-a.cjs', '20-b.cjs', '30-c.cjs']);
    for (const entry of loaded) {
      assert.ok(entry.mod, `${entry.file} should load as a valid module`);
      assert.strictEqual(entry.invalid, undefined);
    }
    assert.deepStrictEqual(loaded.map((c) => c.mod.id), ['a', 'b', 'c']);
  });

  test('1: a missing checks dir is an empty registry', () => {
    const dir = path.join(makeChecksDir(), 'does-not-exist');
    assert.deepStrictEqual(doctor.loadChecks({ checksDir: dir }), []);
  });

  test('1: CHECK_FILE_RE excludes .test.cjs by construction', () => {
    assert.ok(doctor.CHECK_FILE_RE.test('10-mirror-fresh.cjs'));
    assert.ok(!doctor.CHECK_FILE_RE.test('10-mirror-fresh.test.cjs'));
    assert.ok(!doctor.CHECK_FILE_RE.test('README.md'));
  });

  test('1: DEFAULT_CHECKS_DIR is lib/doctor-checks', () => {
    assert.strictEqual(doctor.DEFAULT_CHECKS_DIR, path.join(__dirname, 'doctor-checks'));
  });
});

// ─── 2. Contract violations ───────────────────────────────────────────────────

describe('contract violations never crash the run', () => {
  test('2: missing run / bad scope / load failure / duplicate id each become ONE error result', () => {
    const dir = makeChecksDir();
    writeStubCheck(dir, { file: '10-good.cjs', id: 'good', runBody: OK_RUN });
    writeStubCheck(dir, { file: '20-norun.cjs', id: 'norun' });
    writeStubCheck(dir, { file: '30-badscope.cjs', id: 'badscope', scope: 'machine', runBody: OK_RUN });
    fs.writeFileSync(path.join(dir, '40-explodes.cjs'), "'use strict';\nthrow new Error('load kaboom');\n");
    writeStubCheck(dir, { file: '50-dupe.cjs', id: 'good', runBody: OK_RUN });
    writeStubCheck(dir, { file: '60-after.cjs', id: 'after', runBody: WARN_RUN });

    const report = doctor.runDoctor(baseOpts(dir));
    assert.deepStrictEqual(ids(report), ['good', 'norun', 'badscope', 'explodes', 'dupe', 'after']);

    const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
    assert.strictEqual(byId.good.severity, 'ok');
    assert.strictEqual(byId.after.severity, 'warn', 'a later valid check still runs');

    for (const bad of ['norun', 'badscope', 'explodes', 'dupe']) {
      assert.strictEqual(byId[bad].severity, 'error', `${bad} must be an error result`);
      assert.match(byId[bad].finding, /^invalid doctor check: /, bad);
      assert.strictEqual(byId[bad].fixable, false, bad);
    }
    assert.match(byId.norun.finding, /run/);
    assert.match(byId.badscope.finding, /scope/);
    assert.match(byId.explodes.finding, /load kaboom/);
    assert.match(byId.dupe.finding, /duplicate id/);
  });

  test('2: loadChecks marks the bad module {file, invalid} instead of throwing', () => {
    const dir = makeChecksDir();
    writeStubCheck(dir, { file: '10-notitle.cjs', id: 'notitle', title: undefined, runBody: OK_RUN });
    const loaded = doctor.loadChecks({ checksDir: dir });
    assert.strictEqual(loaded.length, 1);
    assert.strictEqual(loaded[0].file, '10-notitle.cjs');
    assert.strictEqual(loaded[0].mod, undefined);
    assert.match(loaded[0].invalid, /title/);
  });

  test('2: preloaded bare modules passed as opts.checks are validated like loaded ones', () => {
    const report = doctor.runDoctor({
      ...baseOpts(undefined),
      checks: [
        { id: 'inline', title: 'Inline', scope: 'global', run: () => ({ severity: 'ok', finding: 'fine', fixable: false }) },
        { id: 'inline-bad', title: 'Inline bad', scope: 'global' },
      ],
    });
    assert.deepStrictEqual(ids(report), ['inline', 'inline-bad']);
    assert.strictEqual(report.checks[0].severity, 'ok');
    assert.strictEqual(report.checks[1].severity, 'error');
    assert.match(report.checks[1].finding, /^invalid doctor check: /);
  });
});

// ─── 3. Report mode is read-only ──────────────────────────────────────────────

describe('report mode', () => {
  test('3: fix() is never called, even for fixable results; fixes is []', () => {
    const dir = makeChecksDir();
    const log = tmpFile('fix.log');
    const marker = tmpFile('marker');
    writeStubCheck(dir, { file: '10-a.cjs', id: 'a', runBody: flipRun(marker), fixBody: spyFix(log, 'a', marker) });

    const report = doctor.runDoctor(baseOpts(dir));
    assert.strictEqual(report.mode, 'report');
    assert.deepStrictEqual(report.fixes, []);
    assert.deepStrictEqual(readLog(log), [], 'fix() must not be called in report mode');
    assert.strictEqual(fs.existsSync(marker), false);
    assert.strictEqual(report.checks[0].fixable, true);
    assert.strictEqual(report.checks[0].fix_command, 'aof-tools doctor --fix');
    assert.strictEqual(report.schema_version, 1);
    assert.strictEqual(report.engine_version, '9.9.9');
  });
});

// ─── 4. Fix mode ──────────────────────────────────────────────────────────────

describe('fix mode', () => {
  test('4: fix() only for fixable results, in registry order; checks are re-run post-fix', () => {
    const dir = makeChecksDir();
    const log = tmpFile('fix.log');
    const markerA = tmpFile('marker-a');
    const markerC = tmpFile('marker-c');
    writeStubCheck(dir, { file: '30-c.cjs', id: 'c', runBody: flipRun(markerC), fixBody: spyFix(log, 'c', markerC) });
    writeStubCheck(dir, { file: '10-a.cjs', id: 'a', runBody: flipRun(markerA), fixBody: spyFix(log, 'a', markerA) });
    // Not fixable, but HAS a fix(): must never be called.
    writeStubCheck(dir, { file: '20-b.cjs', id: 'b', runBody: WARN_RUN, fixBody: spyFix(log, 'b') });
    // Claims fixable but has no fix(): coerced to fixable:false, nothing to call.
    writeStubCheck(dir, {
      file: '40-d.cjs', id: 'd',
      runBody: "return { severity: 'warn', finding: 'no fixer', fixable: true, fix_command: 'do-it-by-hand' };",
    });

    const report = doctor.runDoctor(baseOpts(dir, { fix: true }));
    assert.strictEqual(report.mode, 'fix');
    assert.deepStrictEqual(readLog(log), ['a', 'c'], 'fix order must follow the registry, fixable only');
    assert.deepStrictEqual(report.fixes.map((f) => f.id), ['a', 'c']);
    for (const f of report.fixes) {
      assert.strictEqual(f.applied, true);
      assert.deepStrictEqual(f.changed, [`.aoforge/${f.id}.json`]);
    }

    const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
    assert.strictEqual(byId.a.severity, 'ok', 'checks must reflect the post-fix re-run');
    assert.strictEqual(byId.a.finding, 'fixed');
    assert.strictEqual(byId.c.severity, 'ok');
    assert.strictEqual(byId.b.severity, 'warn');
    assert.strictEqual(byId.d.fixable, false, 'fixable without fix() is coerced to false');
    assert.deepStrictEqual(ids(report), ['a', 'b', 'c', 'd']);
    assert.strictEqual(report.status, 'degraded');
  });

  test('4: a fix that reports refused is recorded with applied:false and its fields kept', () => {
    const dir = makeChecksDir();
    writeStubCheck(dir, {
      file: '10-r.cjs', id: 'r',
      runBody: "return { severity: 'warn', finding: 'staged work', fixable: true, fix_command: 'git rm --cached x' };",
      fixBody: "return { applied: false, refused: 'unrelated changes are staged', notes: 'n', backup: '/b' };",
    });
    const report = doctor.runDoctor(baseOpts(dir, { fix: true }));
    assert.deepStrictEqual(report.fixes, [
      { id: 'r', applied: false, refused: 'unrelated changes are staged', backup: '/b', notes: 'n' },
    ]);
  });
});

// ─── 5. Throwing run()/fix() ──────────────────────────────────────────────────

describe('throwing checks', () => {
  test('5: run() that throws → error result naming the exception; later checks run', () => {
    const dir = makeChecksDir();
    writeStubCheck(dir, { file: '10-boom.cjs', id: 'boom', runBody: "throw new Error('boom-run');" });
    writeStubCheck(dir, { file: '20-next.cjs', id: 'next', runBody: OK_RUN });

    const report = doctor.runDoctor(baseOpts(dir));
    assert.deepStrictEqual(ids(report), ['boom', 'next']);
    assert.strictEqual(report.checks[0].severity, 'error');
    assert.match(report.checks[0].finding, /boom-run/);
    assert.strictEqual(report.checks[0].fixable, false);
    assert.strictEqual(report.checks[0].title, 'Stub check');
    assert.strictEqual(report.checks[1].severity, 'ok');
  });

  test('5: fix() that throws → {applied:false, refused:"fix threw: …"}; later fixes still run', () => {
    const dir = makeChecksDir();
    const log = tmpFile('fix.log');
    const marker = tmpFile('marker');
    writeStubCheck(dir, {
      file: '10-bad.cjs', id: 'bad',
      runBody: "return { severity: 'warn', finding: 'x', fixable: true };",
      fixBody: "throw new Error('boom-fix');",
    });
    writeStubCheck(dir, { file: '20-good.cjs', id: 'good', runBody: flipRun(marker), fixBody: spyFix(log, 'good', marker) });

    const report = doctor.runDoctor(baseOpts(dir, { fix: true }));
    assert.strictEqual(report.fixes.length, 2);
    assert.deepStrictEqual(report.fixes[0], { id: 'bad', applied: false, refused: 'fix threw: boom-fix' });
    assert.strictEqual(report.fixes[1].id, 'good');
    assert.strictEqual(report.fixes[1].applied, true);
    assert.deepStrictEqual(readLog(log), ['good']);
  });

  test('5: an unknown severity is coerced to error with a note; a non-object result is an error', () => {
    const dir = makeChecksDir();
    writeStubCheck(dir, { file: '10-odd.cjs', id: 'odd', runBody: "return { severity: 'fatal', finding: 'odd', fixable: false };" });
    writeStubCheck(dir, { file: '20-empty.cjs', id: 'empty', runBody: 'return undefined;' });
    const report = doctor.runDoctor(baseOpts(dir));
    assert.strictEqual(report.checks[0].severity, 'error');
    assert.match(report.checks[0].finding, /odd/);
    assert.match(report.checks[0].finding, /fatal/);
    assert.strictEqual(report.checks[1].severity, 'error');
    assert.strictEqual(report.checks[1].fixable, false);
  });
});

// ─── 6. Scope ─────────────────────────────────────────────────────────────────

describe('scope', () => {
  function scopedDir() {
    const dir = makeChecksDir();
    writeStubCheck(dir, { file: '10-g.cjs', id: 'g', scope: 'global', runBody: OK_RUN });
    writeStubCheck(dir, { file: '20-p.cjs', id: 'p', scope: 'project', runBody: "return { severity: 'warn', finding: ctx.projectRoot, fixable: false };" });
    return dir;
  }

  test("6: scope:'global' runs only global checks, even with a project", () => {
    const report = doctor.runDoctor(baseOpts(scopedDir(), { projectRoot: tmpProject(), scope: 'global' }));
    assert.deepStrictEqual(ids(report), ['g']);
    assert.deepStrictEqual(report.scope, { project: null, global: true });
  });

  test('6: projectRoot:null skips project checks — absent and counted nowhere', () => {
    const report = doctor.runDoctor(baseOpts(scopedDir(), { projectRoot: null }));
    assert.deepStrictEqual(ids(report), ['g']);
    assert.deepStrictEqual(report.summary, { ok: 1, warn: 0, error: 0, fixable: 0 });
    assert.strictEqual(report.status, 'healthy');
  });

  test('6: with a project, global and project checks both run; ctx.projectRoot is the realpath', () => {
    const root = tmpProject();
    const report = doctor.runDoctor(baseOpts(scopedDir(), { projectRoot: root }));
    assert.deepStrictEqual(ids(report), ['g', 'p']);
    const real = fs.realpathSync(root);
    assert.strictEqual(report.checks[1].finding, real);
    assert.deepStrictEqual(report.scope, { project: real, global: true });
  });

  test('6: every result carries id/title/scope/severity/finding/fixable', () => {
    const report = doctor.runDoctor(baseOpts(scopedDir(), { projectRoot: tmpProject() }));
    for (const r of report.checks) {
      assert.deepStrictEqual(Object.keys(r).slice(0, 6), ['id', 'title', 'scope', 'severity', 'finding', 'fixable']);
    }
    assert.strictEqual(report.checks[0].scope, 'global');
    assert.strictEqual(report.checks[1].scope, 'project');
  });
});

// ─── 7. Roll-up ───────────────────────────────────────────────────────────────

describe('summarize (status roll-up)', () => {
  const r = (severity, fixable = false) => ({ id: severity, title: 't', scope: 'global', severity, finding: 'f', fixable });

  test('7: error → broken, warn → degraded, else healthy; fixable counted', () => {
    assert.deepStrictEqual(doctor.summarize([]),
      { status: 'healthy', summary: { ok: 0, warn: 0, error: 0, fixable: 0 } });
    assert.deepStrictEqual(doctor.summarize([r('ok'), r('ok')]),
      { status: 'healthy', summary: { ok: 2, warn: 0, error: 0, fixable: 0 } });
    assert.deepStrictEqual(doctor.summarize([r('ok'), r('warn', true)]),
      { status: 'degraded', summary: { ok: 1, warn: 1, error: 0, fixable: 1 } });
    assert.deepStrictEqual(doctor.summarize([r('warn', true), r('error', true), r('ok')]),
      { status: 'broken', summary: { ok: 1, warn: 1, error: 1, fixable: 2 } });
  });

  test('7: runDoctor stamps status and summary from its checks', () => {
    const dir = makeChecksDir();
    writeStubCheck(dir, { file: '10-a.cjs', id: 'a', runBody: OK_RUN });
    writeStubCheck(dir, { file: '20-b.cjs', id: 'b', runBody: ERROR_RUN });
    const report = doctor.runDoctor(baseOpts(dir));
    assert.strictEqual(report.status, 'broken');
    assert.deepStrictEqual(report.summary, { ok: 1, warn: 0, error: 1, fixable: 0 });
  });

  test('7: an empty checks dir is healthy with checks:[]', () => {
    const report = doctor.runDoctor(baseOpts(makeChecksDir()));
    assert.strictEqual(report.status, 'healthy');
    assert.deepStrictEqual(report.checks, []);
    assert.deepStrictEqual(report.fixes, []);
  });
});

// ─── 8a. changedThisRun ───────────────────────────────────────────────────────

describe('changedThisRun', () => {
  test("8a: a later fix() sees the earlier applied fix's project-relative changed paths", () => {
    const dir = makeChecksDir();
    const seen = tmpFile('seen.json');
    writeStubCheck(dir, {
      file: '10-first.cjs', id: 'first',
      runBody: "return { severity: 'warn', finding: 'x', fixable: true };",
      fixBody: "return { applied: true, changed: ['.aoforge/.progress-guard.json', '/abs/outside/file', '.gitignore'] };",
    });
    writeStubCheck(dir, {
      file: '15-refused.cjs', id: 'refused',
      runBody: "return { severity: 'warn', finding: 'x', fixable: true };",
      fixBody: "return { applied: false, refused: 'no', changed: ['.aoforge/not-applied.json'] };",
    });
    writeStubCheck(dir, {
      file: '20-second.cjs', id: 'second',
      runBody: "return { severity: 'warn', finding: 'y', fixable: true };",
      fixBody: `fs.writeFileSync(${JSON.stringify(seen)}, JSON.stringify([...ctx.changedThisRun].sort()));\n` +
        '    return { applied: true };',
    });

    doctor.runDoctor(baseOpts(dir, { fix: true, projectRoot: tmpProject() }));
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(seen, 'utf-8')),
      ['.aoforge/.progress-guard.json', '.gitignore']); // sorted: `.a` before `.g`
  });

  test('8a: the first fix sees an empty set', () => {
    const dir = makeChecksDir();
    const seen = tmpFile('seen.json');
    writeStubCheck(dir, {
      file: '10-only.cjs', id: 'only',
      runBody: "return { severity: 'warn', finding: 'x', fixable: true };",
      fixBody: `fs.writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ isSet: ctx.changedThisRun instanceof Set, size: ctx.changedThisRun.size }));\n` +
        '    return { applied: true };',
    });
    doctor.runDoctor(baseOpts(dir, { fix: true }));
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(seen, 'utf-8')), { isSet: true, size: 0 });
  });
});

// ─── 8. buildContext ──────────────────────────────────────────────────────────

describe('buildContext', () => {
  test('8: every ctx.paths entry derives from userHome', () => {
    const home = makeDoctorHome();
    const ctx = doctor.buildContext({ projectRoot: null, userHome: home, env: {}, now: new Date(0), pluginVersion: '1.2.3' });
    const claude = path.join(home, '.claude');
    const mirror = path.join(claude, 'aoforge');
    assert.deepStrictEqual(ctx.paths, {
      claudeDir: claude,
      mirrorDir: mirror,
      // the pre-rename runtime home (TRD 72-15): the legacy runtime check looks there
      legacyMirrorDir: path.join(claude, LEGACY.runtimeDir),
      installedPluginsJson: path.join(claude, 'plugins', 'installed_plugins.json'),
      pluginCacheRoot: path.join(claude, 'plugins', 'cache', 'aocyber', 'aoforge'),
      progressGuardDir: path.join(mirror, 'state', 'progress-guard'),
      awarenessDir: path.join(mirror, 'state', 'awareness'),
      backupsDir: path.join(mirror, 'backups'),
    });
    assert.strictEqual(ctx.userHome, home);
    assert.strictEqual(ctx.projectRoot, null);
    assert.strictEqual(ctx.pluginVersion, '1.2.3');
    assert.ok(ctx.now instanceof Date);
    assert.ok(ctx.changedThisRun instanceof Set);
    assert.strictEqual(ctx.changedThisRun.size, 0);
    assert.ok(path.isAbsolute(ctx.dfToolsPath));
    assert.ok(ctx.dfToolsPath.endsWith(path.join('bin', 'aof-tools.cjs')));
    assert.ok(fs.existsSync(ctx.dfToolsPath));
  });

  test('8: AOFORGE_PROGRESS_GUARD_DIR / AOFORGE_AWARENESS_DIR override their paths', () => {
    const home = makeDoctorHome();
    const env = { AOFORGE_PROGRESS_GUARD_DIR: '/x/guard', AOFORGE_AWARENESS_DIR: '/y/aware' };
    const ctx = doctor.buildContext({ projectRoot: null, userHome: home, env });
    assert.strictEqual(ctx.paths.progressGuardDir, '/x/guard');
    assert.strictEqual(ctx.paths.awarenessDir, '/y/aware');
    assert.strictEqual(ctx.paths.backupsDir, path.join(home, '.claude', 'aoforge', 'backups'));
    assert.strictEqual(ctx.env, env);
  });

  test('8: a missing or relative userHome is refused', () => {
    assert.throws(() => doctor.buildContext({ userHome: 'relative/home', env: {} }), /userHome/);
    assert.throws(() => doctor.buildContext({ env: {} }), /userHome/);
  });

  test('8: projectRoot is resolved to its realpath', () => {
    const root = tmpProject();
    const ctx = doctor.buildContext({ projectRoot: root, userHome: makeDoctorHome(), env: {} });
    assert.strictEqual(ctx.projectRoot, fs.realpathSync(root));
  });
});
