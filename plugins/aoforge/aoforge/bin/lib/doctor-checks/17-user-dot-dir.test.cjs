'use strict';

// Tests for doctor check 17-user-dot-dir (objective 73, TRD 73-13, gap G5): test list items 5-14.
//
// G5: AOForge 3.0.0 kept the watch daemon's files and the user's own files in ~/.aoforge/, which has the planning
// directory's name. 73-09 stops $HOME from ever being a project and 73-11/73-12 moved those files to the runtime home.
// 3.1 no longer reads the old copies (78-05, 78-11), so this check keeps its fix (TRD 78-06): it reports a leftover
// ~/.aoforge/ and, on --fix, moves what AOForge put there to its new home. It never deletes and never overwrites.
// Test 9 (TRD 78-06): the finding says AOForge no longer reads the files there; the lists come from coexistence.cjs.
//
// Branches pinned here:
//   absent                                    -> ok, not fixable                                    (5)
//   known files                               -> warn, fixable; the fix moves them                  (6, 7)
//   destination exists / stale pid file       -> moved into backups/aoforge-dot-dir-<ts>/ instead   (8, 9)
//   live pid / an installed service logs there -> warn, report-only, names the command to run first  (10, 11)
//   planning files                            -> warn, report-only: $HOME is never a project         (12)
//   unknown files                             -> listed and left in place; the directory stays       (13)
//   through the CLI                                                                                   (14)
//   plus: an empty directory, a service already logging to the runtime home, a symlinked directory and
//   a backup slot that is already taken (never overwritten).
//
// no_llm_test_data: hand-built fake homes from home-dot-dir-fixtures.cjs (mkdtemp under os.tmpdir()) with
// hand-written file contents. The real home is never read or written: the check gets ctx.userHome, and the CLI
// case runs with HOME and USERPROFILE pointed at the fake home and no product environment variable set. No
// launchctl or systemctl runs, and no daemon is signalled: the live pid is this test process's own, probed with
// signal 0 only.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const check = require('./17-user-dot-dir.cjs');
const doctor = require('../doctor.cjs');
const { NAMES, LEGACY } = require('../legacy-names.cjs');
const F = require('../__fixtures__/home-dot-dir-fixtures.cjs');

const AOF_TOOLS = path.join(__dirname, '..', '..', 'aof-tools.cjs');
const FIXED_NOW = new Date('2026-10-09T03:00:00.000Z');
const PLUGIN_VERSION = '3.0.0';
const BACKUP_NAME = 'aoforge-dot-dir-2026-10-09T03-00-00-000Z';
const PID = `${NAMES.watch}.pid`;
const LOG = `${NAMES.watch}.log`;
const DEAD_PID = 999999;

const homes = [];
afterEach(() => {
  F.rmHome(...homes.splice(0));
});

/** A fake home; `files` (when given) are written into its dot directory with F.withDotDirFiles. */
function fakeHome(files) {
  const { home } = F.mkHome({ prefix: 'aof-dotdir-check-' });
  homes.push(home);
  if (files) F.withDotDirFiles(home, files);
  return home;
}

function ctxFor(home) {
  return doctor.buildContext({ userHome: home, env: {}, now: FIXED_NOW, pluginVersion: PLUGIN_VERSION });
}

/** The engine's --fix run with this check alone: the attempted fix (or undefined) and the post-fix result. */
function runFix(home) {
  const report = doctor.runDoctor({
    userHome: home,
    env: {},
    now: FIXED_NOW,
    pluginVersion: PLUGIN_VERSION,
    scope: 'global',
    fix: true,
    checks: [check],
  });
  return {
    fix: report.fixes.find((f) => f.id === check.id),
    after: report.checks.find((c) => c.id === check.id),
  };
}

const dotDir = (home) => path.join(home, NAMES.userDotDir);
const watchDir = (home) => F.userFileDir(home, 'watch');
const runtimeDir = (home) => F.userFileDir(home, 'current');
const backupDir = (home) => path.join(runtimeDir(home), 'backups', BACKUP_NAME);

/** The dot directory's entries, for assertion messages. */
function listing(dir) {
  try {
    return fs.readdirSync(dir).sort().join(', ') || '(empty)';
  } catch {
    return '(absent)';
  }
}

/** Every entry under `dir` (files with their bytes, directories, symlinks with their targets), sorted. */
function snapshot(dir) {
  const out = [];
  (function walk(cur, rel) {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const abs = path.join(cur, entry.name);
      if (entry.isSymbolicLink()) out.push(`${childRel} -> ${fs.readlinkSync(abs)}`);
      else if (entry.isDirectory()) {
        out.push(`${childRel}/`);
        walk(abs, childRel);
      } else out.push(`${childRel}: ${fs.readFileSync(abs, 'utf-8')}`);
    }
  })(dir, '');
  return out.sort();
}

/** A launchd plist as AOForge 3.0.0 rendered it: logs in `<logDir>`, watching `project`. */
function plistText(logDir, project) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<plist version="1.0">',
    '<dict>',
    `    <key>Label</key>`,
    `    <string>com.aocyber.${NAMES.watch}</string>`,
    '    <key>ProgramArguments</key>',
    '    <array>',
    '        <string>/usr/bin/env</string>',
    '        <string>node</string>',
    `        <string>/opt/runtime/bin/${NAMES.watch}.cjs</string>`,
    '        <string>start</string>',
    '        <string>--foreground</string>',
    '        <string>--project</string>',
    `        <string>${project}</string>`,
    '    </array>',
    '    <key>StandardOutPath</key>',
    `    <string>${logDir}/launchd-stdout.log</string>`,
    '    <key>StandardErrorPath</key>',
    `    <string>${logDir}/launchd-stderr.log</string>`,
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

/** A systemd user unit as AOForge 3.0.0 rendered it (`%h/<dot dir>/` logs), watching `project`. */
function unitText(project) {
  return [
    '[Service]',
    `ExecStart=/usr/bin/env node /opt/runtime/bin/${NAMES.watch}.cjs start --foreground --project ${project}`,
    `StandardOutput=append:%h/${NAMES.userDotDir}/systemd-stdout.log`,
    `StandardError=append:%h/${NAMES.userDotDir}/systemd-stderr.log`,
    '',
  ].join('\n');
}

// ─── contract ────────────────────────────────────────────────────────────────

describe('user-dot-dir: contract', () => {
  test('a global check with a fix; reads the home only through ctx; names come from NAMES', () => {
    assert.equal(check.id, 'user-dot-dir');
    assert.equal(check.scope, 'global');
    assert.deepEqual(doctor.contractIssues(check), []);
    assert.equal(typeof check.fix, 'function');
    const src = fs.readFileSync(require.resolve('./17-user-dot-dir.cjs'), 'utf-8');
    assert.equal(/os\.homedir|process\.env/.test(src), false, 'never reads os.homedir() or process.env');
    assert.equal(src.includes(`'${NAMES.userDotDir}'`), false, 'the dot directory name comes from NAMES');
  });

  test('loaded from the checks directory by the engine', () => {
    const ids = doctor.loadChecks().filter((e) => e.mod).map((e) => e.mod.id);
    assert.ok(ids.includes('user-dot-dir'), ids.join(', '));
  });

  test('9. one list of 3.0.0\'s files: TO_RUNTIME and TO_WATCH come from coexistence.cjs (TRD 78-06)', () => {
    const src = fs.readFileSync(require.resolve('./17-user-dot-dir.cjs'), 'utf-8');
    assert.match(src, /require\('\.\.\/coexistence\.cjs'\)/);
    assert.equal(/const TO_(WATCH|RUNTIME) = \[/.test(src), false, 'no second copy of the lists');
    assert.equal(/for one release/i.test(src), false, '3.1 reads nothing there any more');
  });
});

// ─── 9. 3.1 no longer reads the files there ──────────────────────────────────

describe('user-dot-dir: the finding says AOForge no longer reads them there (test 9, TRD 78-06)', () => {
  test('9. known files -> "no longer reads them there"; the fix still moves them', () => {
    const home = fakeHome({ 'defaults.json': '{"model_profile":"balanced"}\n', brave_api_key: 'k\n' });
    const r = check.run(ctxFor(home));
    assert.equal(r.fixable, true, r.finding);
    assert.match(r.finding, /AOForge no longer reads them there/);
    const { fix, after } = runFix(home);
    assert.equal(fix.applied, true, fix.refused || fix.notes);
    assert.equal(after.severity, 'ok', after.finding);
    assert.equal(fs.readFileSync(path.join(runtimeDir(home), 'brave_api_key'), 'utf-8'), 'k\n');
  });

  test('9. a live daemon blocks the fix; the finding still says AOForge no longer reads them there', () => {
    const home = fakeHome({ [PID]: F.watchPidText(process.pid), [LOG]: 'log\n' });
    const r = check.run(ctxFor(home));
    assert.equal(r.fixable, false, r.finding);
    assert.match(r.finding, /AOForge no longer reads them there/);
  });
});

// ─── 5. absent ───────────────────────────────────────────────────────────────

describe('user-dot-dir: absent (test 5)', () => {
  test('5. no ~/.aoforge -> ok, not fixable, and --fix attempts nothing', () => {
    const home = fakeHome();
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'ok', r.finding);
    assert.equal(r.fixable, false);
    const { fix, after } = runFix(home);
    assert.equal(fix, undefined, 'no fix attempted');
    assert.equal(after.severity, 'ok');
  });
});

// ─── 6-7. known files ────────────────────────────────────────────────────────

describe('user-dot-dir: known files (tests 6, 7)', () => {
  const files = () => ({ [LOG]: '[t] INFO dispatching h-1\n', 'defaults.json': '{"model_profile":"balanced"}\n' });

  test('6. the watch log and defaults.json -> warn, fixable, the finding names both files and their new homes', () => {
    const home = fakeHome(files());
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, true);
    assert.ok(r.finding.includes(`${LOG} -> ~/.claude/aoforge/state/watch/`), r.finding);
    assert.ok(r.finding.includes('defaults.json -> ~/.claude/aoforge/'), r.finding);
    assert.ok(!r.finding.includes('defaults.json -> ~/.claude/aoforge/state'), r.finding);
    assert.match(r.fix_command, /doctor --global --fix/);
  });

  test('7. the fix moves each file to its new home, removes ~/.aoforge, lists the new paths; re-run is ok', () => {
    const home = fakeHome(files());
    const { fix, after } = runFix(home);
    assert.ok(fix, 'a fix was attempted');
    assert.equal(fix.applied, true, fix.refused || fix.notes);
    const newLog = path.join(watchDir(home), LOG);
    const newDefaults = path.join(runtimeDir(home), 'defaults.json');
    assert.equal(fs.readFileSync(newLog, 'utf-8'), '[t] INFO dispatching h-1\n');
    assert.equal(fs.readFileSync(newDefaults, 'utf-8'), '{"model_profile":"balanced"}\n');
    assert.equal(fs.existsSync(dotDir(home)), false, `~/.aoforge left behind: ${listing(dotDir(home))}`);
    assert.deepEqual([...fix.changed].sort(), [newLog, newDefaults].sort());
    assert.equal(fix.backup, undefined, 'no backup needed');
    assert.equal(after.severity, 'ok', after.finding);
    assert.equal(check.run(ctxFor(home)).severity, 'ok');
  });
});

// ─── 8-9. into the backup directory ──────────────────────────────────────────

describe('user-dot-dir: backups, never overwrite (tests 8, 9)', () => {
  test('8. the destination exists -> the ~/.aoforge copy goes to the backup; the existing file is byte-identical', () => {
    const home = fakeHome({ 'defaults.json': '{"from":"dot-dir"}\n' });
    const existing = F.writeUserFile(home, 'current', 'defaults.json', '{"from":"runtime-home"}\n');
    const before = fs.readFileSync(existing);
    const { fix, after } = runFix(home);
    assert.equal(fix.applied, true, fix.refused || fix.notes);
    assert.ok(fs.readFileSync(existing).equals(before), 'the existing file is untouched');
    const backedUp = path.join(backupDir(home), 'defaults.json');
    assert.equal(fs.readFileSync(backedUp, 'utf-8'), '{"from":"dot-dir"}\n');
    assert.equal(fix.backup, backupDir(home));
    assert.deepEqual(fix.changed, [backedUp]);
    assert.equal(fs.existsSync(dotDir(home)), false, `~/.aoforge left behind: ${listing(dotDir(home))}`);
    assert.equal(after.severity, 'ok', after.finding);
  });

  test('8b. a backup slot already taken is never overwritten: that file stays in ~/.aoforge, and so does the directory', () => {
    const home = fakeHome({ 'defaults.json': '{"from":"dot-dir"}\n' });
    F.writeUserFile(home, 'current', 'defaults.json', '{"from":"runtime-home"}\n');
    const taken = path.join(backupDir(home), 'defaults.json');
    fs.mkdirSync(path.dirname(taken), { recursive: true });
    fs.writeFileSync(taken, '{"from":"earlier-backup"}\n');
    const { fix } = runFix(home);
    assert.equal(fix.applied, false);
    assert.equal(fs.readFileSync(taken, 'utf-8'), '{"from":"earlier-backup"}\n', 'backup not overwritten');
    assert.equal(fs.readFileSync(path.join(dotDir(home), 'defaults.json'), 'utf-8'), '{"from":"dot-dir"}\n');
    assert.ok(fix.notes && fix.notes.includes('defaults.json'), fix.notes);
  });

  test('9. a stale pid file goes to the backup directory, not to the watch directory', () => {
    assert.throws(() => process.kill(DEAD_PID, 0), `precondition: pid ${DEAD_PID} must not be running`);
    const home = fakeHome({ [PID]: F.watchPidText(DEAD_PID), [LOG]: 'log\n' });
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, true, r.finding);
    const { fix, after } = runFix(home);
    assert.equal(fix.applied, true, fix.refused || fix.notes);
    assert.equal(fs.existsSync(path.join(watchDir(home), PID)), false, 'stale pid not moved into the watch directory');
    assert.equal(fs.readFileSync(path.join(backupDir(home), PID), 'utf-8'), F.watchPidText(DEAD_PID));
    assert.equal(fs.readFileSync(path.join(watchDir(home), LOG), 'utf-8'), 'log\n');
    assert.equal(fix.backup, backupDir(home));
    assert.equal(after.severity, 'ok', after.finding);
  });
});

// ─── 10-11. refused while something still uses ~/.aoforge ────────────────────

describe('user-dot-dir: report-only while the daemon or a service uses it (tests 10, 11)', () => {
  test('10. a live pid -> warn, not fixable, fix_command names aoforge-watch stop; nothing moves', () => {
    const home = fakeHome({ [PID]: F.watchPidText(process.pid), [LOG]: 'log\n' });
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, false);
    assert.match(r.fix_command, new RegExp(`${NAMES.watch}(\\.cjs)? stop`));
    assert.ok(r.finding.includes(String(process.pid)), r.finding);
    const before = snapshot(home);
    const { fix } = runFix(home);
    assert.equal(fix, undefined, 'no fix attempted');
    assert.deepEqual(snapshot(home), before, 'nothing moved');
  });

  test('11. an installed launchd plist that logs into ~/.aoforge -> not fixable, names the reinstall; nothing moves', () => {
    const home = fakeHome({ 'launchd-stdout.log': 'out\n', 'defaults.json': '{}\n' });
    F.writeServiceFile(home, 'launchd', plistText(dotDir(home), '/work/proj'));
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, false);
    assert.ok(r.finding.includes('uninstall-service'), r.finding);
    assert.ok(r.finding.includes('install-service'), r.finding);
    const uninstallAt = r.fix_command.indexOf('uninstall-service');
    const installAt = r.fix_command.indexOf(' install-service');
    assert.ok(uninstallAt >= 0 && installAt > uninstallAt, `uninstall, then install: ${r.fix_command}`);
    assert.ok(r.fix_command.includes('--project /work/proj'), `the service's own project: ${r.fix_command}`);
    const before = snapshot(home);
    assert.equal(runFix(home).fix, undefined, 'no fix attempted');
    assert.deepEqual(snapshot(home), before, 'nothing moved');
  });

  test('11b. an installed systemd unit that logs into %h/.aoforge -> not fixable, names the reinstall', () => {
    const home = fakeHome({ 'systemd-stdout.log': 'out\n' });
    F.writeServiceFile(home, 'systemd', unitText('/work/proj'));
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, false);
    assert.ok(r.fix_command.includes('uninstall-service'), r.fix_command);
    assert.ok(r.fix_command.includes('--project /work/proj'), r.fix_command);
  });

  test('11c. a service already logging into the runtime home does not block the fix', () => {
    const home = fakeHome({ 'launchd-stdout.log': 'old out\n' });
    F.writeServiceFile(home, 'launchd', plistText(watchDir(home), '/work/proj'));
    const r = check.run(ctxFor(home));
    assert.equal(r.fixable, true, r.finding);
    const { fix, after } = runFix(home);
    assert.equal(fix.applied, true, fix.refused || fix.notes);
    assert.equal(fs.readFileSync(path.join(watchDir(home), 'launchd-stdout.log'), 'utf-8'), 'old out\n');
    assert.equal(after.severity, 'ok', after.finding);
  });
});

// ─── 12. planning files ──────────────────────────────────────────────────────

describe('user-dot-dir: planning files (test 12)', () => {
  test('12. STATE.md and objectives/ -> warn, report-only, $HOME is never an AOForge project; nothing moves', () => {
    const home = fakeHome({ 'STATE.md': '# State\n', 'objectives/': '', [LOG]: 'log\n' });
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, false);
    assert.match(r.finding, /\$HOME is never an AOForge project/);
    assert.ok(r.finding.includes('STATE.md'), r.finding);
    assert.ok(r.finding.includes('objectives'), r.finding);
    const before = snapshot(home);
    assert.equal(runFix(home).fix, undefined, 'no fix attempted');
    assert.deepEqual(snapshot(home), before, 'nothing moved');
  });
});

// ─── 13. unknown files ───────────────────────────────────────────────────────

describe('user-dot-dir: unknown files (test 13)', () => {
  test('13. notes.txt beside defaults.json: the fix moves defaults.json, leaves notes.txt and the directory', () => {
    const home = fakeHome({ 'notes.txt': 'mine\n', 'defaults.json': '{}\n' });
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, true);
    assert.ok(r.finding.includes('notes.txt'), r.finding);
    const { fix, after } = runFix(home);
    assert.equal(fix.applied, true, fix.refused || fix.notes);
    assert.equal(fs.readFileSync(path.join(runtimeDir(home), 'defaults.json'), 'utf-8'), '{}\n');
    assert.equal(fs.readFileSync(path.join(dotDir(home), 'notes.txt'), 'utf-8'), 'mine\n');
    assert.deepEqual(fs.readdirSync(dotDir(home)), ['notes.txt']);
    assert.ok(fix.notes.includes('notes.txt'), fix.notes);
    assert.equal(after.severity, 'warn', after.finding);
    assert.equal(after.fixable, false);
    assert.ok(after.finding.includes('notes.txt'), after.finding);
  });
});

// ─── edge cases ──────────────────────────────────────────────────────────────

describe('user-dot-dir: an empty or symlinked directory', () => {
  test('an empty ~/.aoforge -> warn, fixable; the fix removes the empty directory', () => {
    const home = fakeHome({});
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, true);
    const { fix, after } = runFix(home);
    assert.equal(fix.applied, true, fix.refused || fix.notes);
    assert.equal(fs.existsSync(dotDir(home)), false);
    assert.equal(after.severity, 'ok', after.finding);
  });

  test('a symlinked ~/.aoforge: its files move, the link and its target stay', () => {
    const home = fakeHome();
    const target = path.join(home, 'dotfiles', 'aoforge-dot');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'defaults.json'), '{}\n');
    fs.symlinkSync(target, dotDir(home), 'dir');
    const { fix, after } = runFix(home);
    assert.equal(fix.applied, true, fix.refused || fix.notes);
    assert.equal(fs.readFileSync(path.join(runtimeDir(home), 'defaults.json'), 'utf-8'), '{}\n');
    assert.ok(fs.lstatSync(dotDir(home)).isSymbolicLink(), 'the link stays');
    assert.ok(fs.statSync(target).isDirectory(), 'its target stays');
    assert.equal(after.fixable, false, after.finding);
    assert.ok(after.finding.includes('symlink'), after.finding);
  });
});

// ─── 14. through the CLI ─────────────────────────────────────────────────────

describe('user-dot-dir: CLI (test 14)', () => {
  function cli(home, args) {
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(NAMES.envPrefix) || key.startsWith(LEGACY.envPrefix)) continue;
      env[key] = value;
    }
    env.HOME = home;
    env.USERPROFILE = home;
    const r = spawnSync(process.execPath, [AOF_TOOLS, 'doctor', ...args], {
      cwd: home, env, encoding: 'utf-8', timeout: 120000,
    });
    assert.equal(r.status, 0, r.stderr);
    let text = String(r.stdout || '').trim();
    if (text.startsWith('@file:')) {
      const file = text.slice('@file:'.length);
      text = fs.readFileSync(file, 'utf-8');
      fs.rmSync(file, { force: true });
    }
    const report = JSON.parse(text);
    const found = report.checks.find((c) => c.id === 'user-dot-dir');
    assert.ok(found, `user-dot-dir missing: ${report.checks.map((c) => c.id).join(', ')}`);
    return found;
  }

  test('14. doctor --global --json reports user-dot-dir as warn; --fix then reports it ok', () => {
    const home = fakeHome({ [LOG]: 'log\n', 'defaults.json': '{}\n' });
    const reported = cli(home, ['--global', '--json']);
    assert.equal(reported.severity, 'warn', reported.finding);
    assert.equal(reported.fixable, true);
    assert.ok(fs.existsSync(path.join(dotDir(home), 'defaults.json')), 'report mode moves nothing');
    const fixed = cli(home, ['--global', '--fix', '--json']);
    assert.equal(fixed.severity, 'ok', fixed.finding);
    assert.equal(fs.existsSync(dotDir(home)), false, `~/.aoforge left behind: ${listing(dotDir(home))}`);
    assert.equal(fs.readFileSync(path.join(runtimeDir(home), 'defaults.json'), 'utf-8'), '{}\n');
    assert.equal(fs.readFileSync(path.join(watchDir(home), LOG), 'utf-8'), 'log\n');
  });
});
