'use strict';

// stack-cli.test.cjs — L-group CLI tests for `df-tools stack resolve|context|validate|command`
// (TRD 35-03). Every run spawns the checkout's OWN df-tools.cjs via spawnSync with a sandboxed
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
// - L10 `stack --help` prints `Usage: df-tools stack`.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const fx = require('./__fixtures__/stack-profile-fixtures.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');

function run(args, { cwd, home }) {
  const r = spawnSync('node', [TOOLS_PATH, ...args], { cwd, encoding: 'utf-8', env: { ...process.env, HOME: home } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('df-tools stack CLI (L group)', () => {
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

  test('L10: stack --help prints Usage: df-tools stack', () => {
    const root = fx.makeProject({});
    const home = fx.makeHome({});
    try {
      const r = run(['stack', '--help'], { cwd: root, home });
      assert.equal(r.code, 0);
      assert.match(r.stdout, /^Usage: df-tools stack/);
    } finally {
      fx.cleanup(root, home);
    }
  });
});
