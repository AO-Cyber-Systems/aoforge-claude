'use strict';

// stack-cli.test.cjs — L-group CLI tests for `aof-tools stack resolve|context|validate|command`
// (TRD 35-03). Every run spawns the checkout's OWN aof-tools.cjs via spawnSync with a sandboxed
// HOME, per the objective's runtime model — never the real ~/.claude, and non-zero exits are
// asserted directly rather than caught.
//
// - L1  no STACK.md: `stack resolve --provenance` -> every provenance value `bundled` (DoD).
// - L2  `stack resolve --raw` prints `general`.
// - L3  `stack context executor --raw` starts with the Principles section header.
// - L4  `stack context nobody` -> exit 1, stderr lists `planner`.
// - L5  `extends: golike` + fake HOME: `stack command test --packages ./pkg --raw` ->
//       `go test -race ./pkg` (DoD).
// - L6  `stack command nosuch` -> exit 1; `stack command build` on general -> exit 0, empty raw,
//       JSON status `discover`.
// - L7  `stack validate` on cycle/unresolved/undefined-gate-key fixtures -> STK003/STK002/STK005,
//       each its own code (DoD).
// - L8  `stack validate` valid -> exit 0, `ok: true`.
// - L9  `stack` alone and `stack bogus` -> exit 1 naming the available subcommands.
// - L10 `stack --help` prints `Usage: aof-tools stack`.
// - L11 (TRD 42-01, SDR-07) `stack validate path/x.md` -> exit 1, stderr names `--profile` (it
//       used to validate .aoforge/STACK.md silently); `stack validate --profile path/x.md` still
//       validates that file.
// - L12 (TRD 42-01) `stack frobnicate` -> the error lists all eight subcommands, including the
//       lazily-dispatched extensions verify, report, mcp.
// - L13 (TRD 42-01) STACK_EXTENSIONS / loadStackExtension: an absent module -> null and a clean
//       "stack verify is not available in this build"; a stub exporting `cli` is called with
//       (cwd, args.slice(1), raw, { userHome }); a module without `cli` is "not available"; a
//       syntax error inside an existing module surfaces. Every case uses a temp libDir, so none
//       depends on whether a real stack-verify.cjs has shipped yet.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const fx = require('./__fixtures__/stack-profile-fixtures.cjs');
const sp = require('./stack-profile.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'aof-tools.cjs');

function run(args, { cwd, home }) {
  const r = spawnSync('node', [TOOLS_PATH, ...args], { cwd, encoding: 'utf-8', env: { ...process.env, HOME: home } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('aof-tools stack CLI (L group)', () => {
  test('L1: no STACK.md -> stack resolve --provenance reports every value bundled', () => {
    const root = fx.makeProject({});
    const home = fx.makeHome({});
    try {
      const r = run(['stack', 'resolve', '--provenance'], { cwd: root, home });
      assert.equal(r.code, 0);
      const parsed = JSON.parse(r.stdout);
      const values = Object.values(parsed.provenance);
      assert.ok(values.length > 0);
      for (const v of values) assert.equal(v, 'bundled');
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('L2: stack resolve --raw prints general', () => {
    const root = fx.makeProject({});
    const home = fx.makeHome({});
    try {
      const r = run(['stack', 'resolve', '--raw'], { cwd: root, home });
      assert.equal(r.code, 0);
      assert.equal(r.stdout, 'general');
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('L3: stack context executor --raw starts with the Principles section header', () => {
    const root = fx.makeProject({});
    const home = fx.makeHome({});
    try {
      const r = run(['stack', 'context', 'executor', '--raw'], { cwd: root, home });
      assert.equal(r.code, 0);
      assert.match(r.stdout, /^## Principles/);
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('L4: stack context nobody -> exit 1, stderr lists planner', () => {
    const root = fx.makeProject({});
    const home = fx.makeHome({});
    try {
      const r = run(['stack', 'context', 'nobody'], { cwd: root, home });
      assert.equal(r.code, 1);
      assert.match(r.stderr, /planner/);
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('L5: stack command test --packages ./pkg --raw -> go test -race ./pkg', () => {
    // Inline org fixture (not the shared orgProfileGoLike(), whose test.scoped is
    // "buildtool test -race {packages}") so the raw output matches the DoD's literal text.
    const golike = fx.profileMd({
      yaml: [
        'schema: 1',
        'id: golike',
        'extends: general',
        'commands:',
        '  test: { run: "go test ./...", scoped: "go test -race {packages}" }',
      ].join('\n'),
    });
    const home = fx.makeHome({ stacks: { golike } });
    const stackMd = fx.profileMd({ yaml: ['schema: 1', 'extends: golike'].join('\n') });
    const root = fx.makeProject({ stackMd });
    try {
      const r = run(['stack', 'command', 'test', '--packages', './pkg', '--raw'], { cwd: root, home });
      assert.equal(r.code, 0);
      assert.equal(r.stdout, 'go test -race ./pkg');
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('L6: undefined command key exits 1; a discover-status command exits 0 with empty raw output', () => {
    const root = fx.makeProject({});
    const home = fx.makeHome({});
    try {
      const bad = run(['stack', 'command', 'nosuch'], { cwd: root, home });
      assert.equal(bad.code, 1);

      const good = run(['stack', 'command', 'build'], { cwd: root, home });
      assert.equal(good.code, 0);
      assert.equal(JSON.parse(good.stdout).status, 'discover');

      const goodRaw = run(['stack', 'command', 'build', '--raw'], { cwd: root, home });
      assert.equal(goodRaw.code, 0);
      assert.equal(goodRaw.stdout, '');
    } finally {
      fx.cleanup(root, home);
    }
  });

  describe('L7: each stack validate rejection carries its own STK code', () => {
    test('extends cycle -> STK003', () => {
      const home = fx.cycleHome();
      const stackMd = fx.profileMd({ yaml: ['schema: 1', 'extends: a'].join('\n') });
      const root = fx.makeProject({ stackMd });
      try {
        const r = run(['stack', 'validate'], { cwd: root, home });
        assert.equal(r.code, 1);
        const parsed = JSON.parse(r.stdout);
        assert.ok(parsed.errors.some((e) => e.code === 'STK003'));
      } finally {
        fx.cleanup(root, home);
      }
    });

    test('unresolved extends -> STK002', () => {
      const home = fx.makeHome({});
      const stackMd = fx.profileMd({ yaml: ['schema: 1', 'extends: missing'].join('\n') });
      const root = fx.makeProject({ stackMd });
      try {
        const r = run(['stack', 'validate'], { cwd: root, home });
        assert.equal(r.code, 1);
        const parsed = JSON.parse(r.stdout);
        assert.ok(parsed.errors.some((e) => e.code === 'STK002'));
      } finally {
        fx.cleanup(root, home);
      }
    });

    test('undefined gate key -> STK005', () => {
      const home = fx.makeHome({});
      const stackMd = fx.profileMd({ yaml: ['schema: 1', 'gates:', '  task: [nosuch]'].join('\n') });
      const root = fx.makeProject({ stackMd });
      try {
        const r = run(['stack', 'validate'], { cwd: root, home });
        assert.equal(r.code, 1);
        const parsed = JSON.parse(r.stdout);
        assert.ok(parsed.errors.some((e) => e.code === 'STK005'));
      } finally {
        fx.cleanup(root, home);
      }
    });
  });

  test('L8: stack validate on a valid profile exits 0 with ok: true', () => {
    const home = fx.makeHome({});
    const stackMd = fx.profileMd({ yaml: ['schema: 1', 'loop: [test]'].join('\n') });
    const root = fx.makeProject({ stackMd });
    try {
      const r = run(['stack', 'validate'], { cwd: root, home });
      assert.equal(r.code, 0);
      assert.equal(JSON.parse(r.stdout).ok, true);
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('L9: stack alone and stack bogus both exit 1 naming the available subcommands', () => {
    const root = fx.makeProject({});
    const home = fx.makeHome({});
    try {
      const alone = run(['stack'], { cwd: root, home });
      assert.equal(alone.code, 1);
      assert.match(alone.stderr, /resolve, context, validate, command/);

      const bogus = run(['stack', 'bogus'], { cwd: root, home });
      assert.equal(bogus.code, 1);
      assert.match(bogus.stderr, /resolve, context, validate, command/);
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('L10: stack --help prints Usage: aof-tools stack', () => {
    const root = fx.makeProject({});
    const home = fx.makeHome({});
    try {
      const r = run(['stack', '--help'], { cwd: root, home });
      assert.equal(r.code, 0);
      assert.match(r.stdout, /^Usage: aof-tools stack/);
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('L11: stack validate rejects a positional path; --profile <path> still validates that file', () => {
    // A VALID .aoforge/STACK.md beside an INVALID path/x.md: before the fix, the positional form
    // validated STACK.md and exited 0 — a green result for a file it never read.
    const home = fx.makeHome({});
    const root = fx.makeProject({
      stackMd: fx.profileMd({ yaml: 'schema: 1' }),
      files: {
        'path/x.md': fx.profileMd({ yaml: 'schema: 2' }),
        'path/ok.md': fx.profileMd({ yaml: 'schema: 1' }),
      },
    });
    try {
      const positional = run(['stack', 'validate', 'path/x.md'], { cwd: root, home });
      assert.equal(positional.code, 1, positional.stdout);
      assert.match(positional.stderr, /stack validate takes --profile <path>, not a positional path/);
      assert.equal(positional.stdout, '', 'a rejected positional must not also print a validation result');

      const flagged = run(['stack', 'validate', '--profile', 'path/x.md'], { cwd: root, home });
      assert.equal(flagged.code, 1);
      const parsed = JSON.parse(flagged.stdout);
      // Suffix match: the child's cwd is the realpath (/private/var/... on macOS), not `root`.
      assert.ok(parsed.errors.some((e) => e.code === 'STK001' && e.file.endsWith(path.join('path', 'x.md'))), flagged.stdout);

      const flaggedOk = run(['stack', 'validate', '--profile', 'path/ok.md'], { cwd: root, home });
      assert.equal(flaggedOk.code, 0, flaggedOk.stderr);
      assert.equal(JSON.parse(flaggedOk.stdout).ok, true);

      const bare = run(['stack', 'validate', '--raw'], { cwd: root, home });
      assert.equal(bare.code, 0, bare.stderr);
      assert.equal(bare.stdout, 'ok');
    } finally {
      fx.cleanup(root, home);
    }
  });
});

// ─── L12-L13: lazy stack-extension dispatch (TRD 42-01) ──────────────────────

function makeLibDir(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-stack-ext-'));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body, 'utf-8');
  return dir;
}

// cmdStack ends in helpers `error()` -> process.exit(1). Trap both so the test process survives.
function runInProcess(fn) {
  const stderr = [];
  const origErr = process.stderr.write.bind(process.stderr);
  const origExit = process.exit.bind(process);
  let exitCode = null;
  let returned;
  process.stderr.write = (chunk) => { stderr.push(String(chunk)); return true; };
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };
  try {
    returned = fn();
  } catch (e) {
    if (!String(e.message).startsWith('process.exit')) throw e;
  } finally {
    process.stderr.write = origErr;
    process.exit = origExit;
  }
  return { exitCode, stderr: stderr.join(''), returned };
}

describe('aof-tools stack extensions (L12-L13)', () => {
  test('L12: stack frobnicate -> the error lists all eight subcommands', () => {
    const root = fx.makeProject({});
    const home = fx.makeHome({});
    try {
      const r = run(['stack', 'frobnicate'], { cwd: root, home });
      assert.equal(r.code, 1);
      assert.match(r.stderr, /resolve, context, validate, command, init, verify, report, mcp/);
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('L13a: STACK_EXTENSIONS maps verify/report/mcp to their sibling module files', () => {
    assert.deepEqual(sp.STACK_EXTENSIONS, { verify: 'stack-verify.cjs', report: 'stack-report.cjs', mcp: 'stack-mcp.cjs' });
  });

  test('L13b: an absent module -> loadStackExtension returns null; cmdStack fails cleanly with "not available in this build"', () => {
    const libDir = makeLibDir();
    try {
      assert.equal(sp.loadStackExtension('verify', { libDir }), null);
      const r = runInProcess(() => sp.cmdStack(libDir, ['verify'], false, { libDir }));
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr, /stack verify is not available in this build/);
    } finally {
      fs.rmSync(libDir, { recursive: true, force: true });
    }
  });

  test('L13c: a stub exporting cli is called with (cwd, args.slice(1), raw, { userHome })', () => {
    const stub = [
      "'use strict';",
      'module.exports = {',
      '  cli(cwd, args, raw, ctx) {',
      '    globalThis.__dfStackExtCall = { cwd, args, raw, ctx };',
      "    return 'stub-result';",
      '  },',
      '};',
    ].join('\n');
    const libDir = makeLibDir({ 'stack-report.cjs': stub });
    try {
      const mod = sp.loadStackExtension('report', { libDir });
      assert.equal(typeof mod.cli, 'function');

      const r = runInProcess(() => sp.cmdStack('/some/project', ['report', '--json', 'x'], true, { libDir }));
      assert.equal(r.exitCode, null, r.stderr);
      assert.equal(r.returned, 'stub-result');
      assert.deepEqual(globalThis.__dfStackExtCall, {
        cwd: '/some/project',
        args: ['--json', 'x'],
        raw: true,
        ctx: { userHome: os.homedir() },
      });
    } finally {
      delete globalThis.__dfStackExtCall;
      fs.rmSync(libDir, { recursive: true, force: true });
    }
  });

  test('L13d: a module without a cli function is "not available in this build"', () => {
    const libDir = makeLibDir({ 'stack-mcp.cjs': "'use strict';\nmodule.exports = { notCli: true };\n" });
    try {
      const r = runInProcess(() => sp.cmdStack(libDir, ['mcp'], false, { libDir }));
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr, /stack mcp is not available in this build/);
    } finally {
      fs.rmSync(libDir, { recursive: true, force: true });
    }
  });

  test('L13e: a syntax error inside an existing module surfaces instead of reading as "absent"', () => {
    const libDir = makeLibDir({ 'stack-verify.cjs': 'module.exports = { cli( {\n' });
    try {
      assert.throws(() => sp.loadStackExtension('verify', { libDir }), SyntaxError);
    } finally {
      fs.rmSync(libDir, { recursive: true, force: true });
    }
  });

  test('L13f: a non-extension name is never loaded', () => {
    const libDir = makeLibDir({ 'stack-resolve.cjs': "module.exports = { cli() { return 'no'; } };\n" });
    try {
      assert.equal(sp.loadStackExtension('resolve', { libDir }), null);
      assert.equal(sp.loadStackExtension('__proto__', { libDir }), null);
    } finally {
      fs.rmSync(libDir, { recursive: true, force: true });
    }
  });
});
