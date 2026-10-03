'use strict';

// stack-verify-run-guard.test.cjs — the `--run` effect guard, against a REAL spawn (TRD 43-02, SDR-03).
//
// Objective 42's rollout found that the "safe" lint key ran `flutter analyze --fatal-infos`, which
// rewrote analysis_options.yaml and ran an implicit `pub get` that bumped pubspec.lock. The key allow
// list cannot see that, so `runOne` now snapshots the git work tree around each spawn (porcelain
// listing plus a content hash per listed path) and restores whatever the command changed.
//
// Every test here uses the real `child_process.spawnSync` and a stub `flutter` (a `#!/bin/sh` script
// in a temp dir) that really writes files into a scratch git repo. Nothing touches a real repository
// under ~/dev. The whole file is skipped without git on PATH.
//
//  1. Pre-dirty analysis_options.yaml + stub that appends to it and rewrites pubspec.lock:
//     both paths reported `modified`, restored byte-exact, the user's own edit survives,
//     `--no-pub` is appended, and the second flutter item is halted `side-effect-unsafe`
//     without the stub being invoked a second time.
//  2. A stub that creates an untracked file: `added`, removed afterwards.
//  3. A stub that deletes a tracked file: `deleted`, restored afterwards.
//  4. A stub that changes nothing: no `mutated` key, no halt, the next flutter item runs.
//  5. A non-flutter mutating command: reported and restored too (tool-agnostic), but only
//     Dart/Flutter items are halted afterwards.
//  6. A write to a gitignored path is not reported.
//  7. Cases content comparison exists for: a command that reverts the user's pre-dirty edit,
//     one that stages a new file (the index is restored too), a pre-dirty file over 1 MB that cannot
//     be restored from memory (`restored: false`, path listed), and a failing after-snapshot
//     (`mutated_unknown`, root halted).
// 12. CLI: `df-tools stack verify --run` shows `mutated` and the halt skip, and `git status
//     --porcelain` is identical before and after.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const fx = require('./__fixtures__/stack-verify-fixtures.cjs');
const profileFx = require('./__fixtures__/stack-profile-fixtures.cjs');
const { runCommands } = require('./stack-verify.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const SKIP = fx.gitAvailable() ? false : 'git is not on PATH';

const dirs = [];
const track = (dir) => { dirs.push(dir); return dir; };
afterEach(() => { while (dirs.length) fx.cleanup(dirs.pop()); });

const item = (key, command, extra = {}) => ({ component: null, key, command, cwd: '', ...extra });
const envWith = (bin) => ({ ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` });
const read = (root, rel) => fs.readFileSync(path.join(root, rel));
const porcelain = (root) => fx.gitIn(root, ['status', '--porcelain=v1', '-uall']);
const byPath = (a, b) => (a.path < b.path ? -1 : 1);

/** The two files `flutter analyze` rewrote in objective 42's rollout. */
const ANALYZE_MUTATION = [
  "printf 'analyzer:\\n  exclude: [build/**]\\n' >> analysis_options.yaml",
  "printf '# rewritten by an implicit pub get\\npackages: {x: 1}\\n' > pubspec.lock",
].join('\n');

/** A scratch repo, a stub flutter on PATH, and the spawn options runCommands needs. */
function setup({ preDirty = false, files = {}, body = ':' } = {}) {
  const root = track(fx.gitDartRepo({ preDirty, files }));
  const bin = track(fx.mutatingToolBin('flutter', body));
  return { root, bin, opts: { root, spawn: spawnSync, env: envWith(bin) } };
}

describe('--run effect guard: real spawn, stub flutter, scratch git repo', { skip: SKIP }, () => {
  test('1. a pre-dirty file and a clean file are both changed: reported, restored byte-exact, root halted', () => {
    const { root, bin, opts } = setup({ preDirty: true, body: ANALYZE_MUTATION });
    const optionsBefore = read(root, 'analysis_options.yaml');
    const lockBefore = read(root, 'pubspec.lock');
    const statusBefore = porcelain(root);
    assert.match(optionsBefore.toString(), /my own uncommitted edit/);

    const out = runCommands([
      item('lint', 'flutter analyze --fatal-infos'),
      item('format', 'flutter analyze --no-fatal-infos'),
    ], opts);

    assert.equal(out[0].run.exit_code, 0);
    assert.deepEqual([...out[0].run.mutated].sort(byPath), [
      { path: 'analysis_options.yaml', change: 'modified' },
      { path: 'pubspec.lock', change: 'modified' },
    ]);
    assert.equal(out[0].run.restored, true);

    assert.ok(read(root, 'analysis_options.yaml').equals(optionsBefore), 'analysis_options.yaml is byte-equal to its pre-run bytes');
    assert.match(read(root, 'analysis_options.yaml').toString(), /my own uncommitted edit/);
    assert.ok(read(root, 'pubspec.lock').equals(lockBefore));
    assert.equal(porcelain(root), statusBefore);

    assert.equal(out[1].skipped, 'side-effect-unsafe');
    assert.equal(out[1].run.skipped, 'side-effect-unsafe');
    assert.match(out[1].run.detail, /earlier command in this root/);
    assert.equal(fx.stubCalls(bin, 'flutter').length, 1, 'the stub ran once, not twice');
  });

  test('1b. `--no-pub` is appended to the executed text only, and recorded as run.rewritten', () => {
    const { bin, opts } = setup({ body: ':' });
    const out = runCommands([item('lint', 'flutter analyze --fatal-infos')], opts);
    assert.equal(out[0].run.rewritten, 'flutter analyze --fatal-infos --no-pub');
    assert.equal(out[0].command, 'flutter analyze --fatal-infos', 'the stored command is never rewritten');
    assert.deepEqual(fx.stubCalls(bin, 'flutter'), ['analyze --fatal-infos --no-pub']);
  });

  test('1c. `make lint` is not rewritten, and the guard still catches what its flutter body does', () => {
    const root = track(fx.gitDartRepo({ files: { Makefile: 'lint:\n\tflutter analyze\n' } }));
    // The stub `make` stands in for the target body: it does what `flutter analyze` did in objective 42.
    const bin = track(fx.mutatingToolBin('make', ANALYZE_MUTATION));
    const lockBefore = read(root, 'pubspec.lock');
    const [r] = runCommands([item('lint', 'make lint')], { root, spawn: spawnSync, env: envWith(bin) });
    assert.equal('rewritten' in r.run, false);
    assert.deepEqual(fx.stubCalls(bin, 'make'), ['lint']);
    assert.deepEqual([...r.run.mutated].sort(byPath), [
      { path: 'analysis_options.yaml', change: 'modified' },
      { path: 'pubspec.lock', change: 'modified' },
    ]);
    assert.equal(r.run.restored, true);
    assert.ok(read(root, 'pubspec.lock').equals(lockBefore));
  });

  test('2. a command that creates an untracked file: reported `added`, the file is removed', () => {
    const { root, opts } = setup({ body: 'mkdir -p lib\nprintf "// generated\\n" > lib/generated.g.dart' });
    const statusBefore = porcelain(root);
    const [r] = runCommands([item('lint', 'flutter analyze')], opts);
    assert.deepEqual(r.run.mutated, [{ path: 'lib/generated.g.dart', change: 'added' }]);
    assert.equal(r.run.restored, true);
    assert.equal(fs.existsSync(path.join(root, 'lib', 'generated.g.dart')), false);
    assert.equal(porcelain(root), statusBefore);
  });

  test('3. a command that deletes a tracked file: reported `deleted`, the file is restored', () => {
    const { root, opts } = setup({ body: 'rm lib/main.dart' });
    const before = read(root, 'lib/main.dart');
    const [r] = runCommands([item('lint', 'flutter analyze')], opts);
    assert.deepEqual(r.run.mutated, [{ path: 'lib/main.dart', change: 'deleted' }]);
    assert.equal(r.run.restored, true);
    assert.ok(read(root, 'lib/main.dart').equals(before));
    assert.equal(porcelain(root), '');
  });

  test('4. a command that changes nothing: no `mutated` key, no halt, the next flutter item runs', () => {
    const { bin, opts } = setup({ preDirty: true, body: ':' });
    const out = runCommands([item('lint', 'flutter analyze'), item('format', 'flutter analyze --no-fatal-infos')], opts);
    for (const r of out) {
      assert.equal(r.run.exit_code, 0);
      assert.equal('mutated' in r.run, false);
      assert.equal('mutated_unknown' in r.run, false);
      assert.equal(r.skipped, undefined);
    }
    assert.equal(fx.stubCalls(bin, 'flutter').length, 2);
  });

  test('5. a non-flutter mutating command is reported and restored too, but only Dart/Flutter items are halted', () => {
    const { root, bin, opts } = setup({ body: ':' });
    const readme = read(root, 'README.md');
    const out = runCommands([
      item('build', "sh -c 'echo x >> README.md'"),
      item('lint', 'flutter analyze'),
      item('typecheck', "sh -c ':'"),
    ], opts);
    assert.deepEqual(out[0].run.mutated, [{ path: 'README.md', change: 'modified' }]);
    assert.equal(out[0].run.restored, true);
    assert.ok(read(root, 'README.md').equals(readme));
    assert.equal(out[1].skipped, 'side-effect-unsafe');
    assert.equal(out[2].run.exit_code, 0, 'a non-Dart item still runs after the halt');
    assert.deepEqual(fx.stubCalls(bin, 'flutter'), []);
  });

  test('6. a gitignored path written by the command is not reported', () => {
    const { root, opts } = setup({ body: 'mkdir -p build\necho x > build/out.txt\necho y >> .dart_tool/package_config.json' });
    const out = runCommands([item('lint', 'flutter analyze'), item('format', 'flutter analyze --no-fatal-infos')], opts);
    assert.equal('mutated' in out[0].run, false);
    assert.equal(out[1].run.exit_code, 0, 'no mutation, no halt');
    assert.equal(fs.existsSync(path.join(root, 'build', 'out.txt')), true, 'ignored output is left alone');
  });

  test('the deny set does not catch `dart analyze`, `dart format` or `flutter analyze` inside a work tree', () => {
    const { root, opts } = setup({ body: ':' });
    const dartBin = track(fx.mutatingToolBin('dart', ':'));
    const env = { ...opts.env, PATH: `${dartBin}${path.delimiter}${opts.env.PATH}` };
    const out = runCommands([
      item('lint', 'dart analyze'),
      item('format', 'dart format --set-exit-if-changed .'),
      item('typecheck', 'flutter analyze'),
    ], { ...opts, env });
    for (const r of out) {
      assert.equal(r.skipped, undefined, `${r.command} was refused: ${r.skipped}`);
      assert.equal(r.run.exit_code, 0, r.command);
    }
    assert.equal(fx.stubCalls(dartBin, 'dart').length, 2);
  });

  test('7a. a command that reverts the user\'s pre-dirty edit is a mutation: the edit is put back', () => {
    const { root, opts } = setup({ preDirty: true, body: 'git checkout -- analysis_options.yaml' });
    const before = read(root, 'analysis_options.yaml');
    const statusBefore = porcelain(root);
    const [r] = runCommands([item('lint', 'flutter analyze')], opts);
    assert.deepEqual(r.run.mutated, [{ path: 'analysis_options.yaml', change: 'modified' }]);
    assert.equal(r.run.restored, true);
    assert.ok(read(root, 'analysis_options.yaml').equals(before));
    assert.equal(porcelain(root), statusBefore);
  });

  test('7b. a command that stages a new file: the file is removed and the index is restored', () => {
    const { root, opts } = setup({ body: 'echo x > lib/staged.dart\ngit add lib/staged.dart' });
    const [r] = runCommands([item('lint', 'flutter analyze')], opts);
    assert.deepEqual(r.run.mutated, [{ path: 'lib/staged.dart', change: 'added' }]);
    assert.equal(r.run.restored, true);
    assert.equal(fs.existsSync(path.join(root, 'lib', 'staged.dart')), false);
    assert.equal(porcelain(root), '');
  });

  test('7c. a pre-dirty file over 1 MB cannot be restored from memory: restored false, path listed', () => {
    const { root, opts } = setup({ body: 'echo more >> big.bin' });
    fs.writeFileSync(path.join(root, 'big.bin'), Buffer.alloc(1024 * 1024 + 16, 7));
    const sizeBefore = fs.statSync(path.join(root, 'big.bin')).size;
    const [r] = runCommands([item('lint', 'flutter analyze')], opts);
    assert.deepEqual(r.run.mutated, [{ path: 'big.bin', change: 'modified' }]);
    assert.equal(r.run.restored, false);
    assert.deepEqual(r.run.unrestored, ['big.bin']);
    assert.ok(fs.statSync(path.join(root, 'big.bin')).size > sizeBefore, 'the file is left as the command wrote it');
  });

  test('7d. a failing after-snapshot is `mutated_unknown` and halts the root', () => {
    const { bin, opts } = setup({ body: ANALYZE_MUTATION });
    let statusCalls = 0;
    const git = (cmd, args, o) => {
      if (args.includes('status') && ++statusCalls === 2) {
        return { status: 128, stdout: '', stderr: 'fatal: Unable to create index.lock: File exists.', error: null };
      }
      return spawnSync(cmd, args, o);
    };
    const out = runCommands([item('lint', 'flutter analyze --fatal-infos'), item('format', 'flutter analyze --no-fatal-infos')], { ...opts, git });
    assert.equal(out[0].run.mutated_unknown, true);
    assert.equal('mutated' in out[0].run, false);
    assert.equal(out[1].skipped, 'side-effect-unsafe');
    assert.match(out[1].run.detail, /unverifiable/);
    assert.equal(fx.stubCalls(bin, 'flutter').length, 1);
  });
});

describe('CLI: stack verify --run with the effect guard (test 12)', { skip: SKIP }, () => {
  test('the JSON shows `mutated` and the halt skip, and the work tree is unchanged', () => {
    const yaml = ['schema: 1', 'extends: general', 'commands:',
      '  lint: { run: "flutter analyze --fatal-infos" }',
      '  format: { run: "flutter analyze --no-fatal-infos" }'].join('\n');
    const root = track(fx.gitDartRepo({
      preDirty: true,
      files: { '.planning/STACK.md': profileFx.profileMd({ yaml }) },
    }));
    const bin = track(fx.mutatingToolBin('flutter', ANALYZE_MUTATION));
    const home = track(fx.fakeHome({}));
    const optionsBefore = read(root, 'analysis_options.yaml');
    const statusBefore = porcelain(root);

    const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', root, 'stack', 'verify', '--run'], {
      encoding: 'utf-8',
      env: { ...envWith(bin), HOME: home },
      timeout: 60000,
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const json = JSON.parse(r.stdout);
    const lint = json.results.find((x) => x.key === 'lint');
    const format = json.results.find((x) => x.key === 'format');
    assert.deepEqual([...lint.run.mutated].sort(byPath), [
      { path: 'analysis_options.yaml', change: 'modified' },
      { path: 'pubspec.lock', change: 'modified' },
    ]);
    assert.equal(lint.run.restored, true);
    assert.equal(format.run.skipped, 'side-effect-unsafe');
    assert.equal(porcelain(root), statusBefore);
    assert.ok(read(root, 'analysis_options.yaml').equals(optionsBefore));
  });
});
