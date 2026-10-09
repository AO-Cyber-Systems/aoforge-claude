'use strict';

// stack-render.test.cjs — Test list (TRD 35-02b)
//
// renderCommand (R group):
//   C1  `renderCommand(p,'build')` with run `make build` -> {status:'ok', form:'run', command:'make build'}.
//        (plus: passes through timeout_s/cwd from the command object when present)
//   C2  packages + scoped with `{packages}` -> scoped form filled, space-joined.
//   C3  files -> `{files}` filled; a path containing a space is single-quoted.
//   C4  scoped needs `{packages}` but only files are given -> packages derived as unique
//       `./<dirname>` (`.` for root files).
//   C5  `run: discover` -> {status:'discover', command:null}; `run: none` -> {status:'none', command:null}.
//   C6  unknown key -> {status:'undefined', command:null}.
//   C7  `apply:true` uses `apply` with placeholders; no `apply` -> falls back to `run` (form `run`).
//
// contextFor (X group):
//   C8  `contextFor(p,'executor')` on a general-shaped profile (Principles, Avoid, Testing,
//       Dependencies) includes Principles, Commands, Avoid, Dependencies and excludes Testing.
//   C9  verifier -> Principles, Commands, Avoid, Testing, Security (only those present); excludes
//       Idioms and Layout & architecture.
//   C10 mapper -> Principles, Layout & architecture, Dependencies; no Commands block.
//   C11 `UI` only when `{ui:true}`, and only for planner/executor/verifier.
//   C12 budget 300 -> truncated:true, tokens <= 300, omitted non-empty, and text still starts
//       with the Principles section.
//   C13 unknown agent throws UNKNOWN_AGENT naming `planner`; each alias resolves.
//   C14 neutrality: stack-render.cjs source does not match
//       /golang|gofmt|\bdart\b|flutter|pubspec|\bnpm\b|cargo|pytest|rails|gradle|swift|kotlin/i.
//
// Additional (beyond the TRD's C-list, covering the hard-cut fallback the gotchas require):
//   extra-1: when even Principles (+Commands) alone exceed the budget, hard-cut at
//            `budget*4 - 16` chars and append the truncation suffix.

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const stackRender = require('./stack-render.cjs');

function makeResolved(overrides = {}) {
  const fm = overrides.frontmatter || {};
  return {
    id: overrides.id || 'general',
    frontmatter: {
      commands: fm.commands || {},
      loop: fm.loop || [],
      gates: fm.gates || { task: [], objective: [] },
      generated: fm.generated || { globs: [], markers: [] },
      verification: fm.verification || { runtime: 'unknown' },
    },
    sections: overrides.sections || {},
    provenance: overrides.provenance || {},
    chain: overrides.chain || [],
    component: overrides.component !== undefined ? overrides.component : null,
    issues: overrides.issues || [],
  };
}

describe('renderCommand', () => {
  test('C1: basic run form', () => {
    const p = makeResolved({ frontmatter: { commands: { build: { run: 'make build' } } } });
    assert.deepStrictEqual(stackRender.renderCommand(p, 'build'), {
      key: 'build',
      status: 'ok',
      form: 'run',
      command: 'make build',
    });
  });

  test('C1b: passes through timeout_s and cwd when present on the command object', () => {
    const p = makeResolved({
      frontmatter: { commands: { build: { run: 'make build', timeout_s: 120, cwd: 'app/' } } },
    });
    const result = stackRender.renderCommand(p, 'build');
    assert.strictEqual(result.timeout_s, 120);
    assert.strictEqual(result.cwd, 'app/');
  });

  // TRD 42-05: renderCommand is the ONE place a component's path joins the command cwd.
  test('C1c: a resolved component joins its path onto the command cwd', () => {
    const svc = { path: 'svc/', profile: '.aoforge/stacks/svc.md' };
    const bare = makeResolved({ component: svc, frontmatter: { commands: { test: { run: 'unit-run' } } } });
    assert.strictEqual(stackRender.renderCommand(bare, 'test').cwd, 'svc');
    const nested = makeResolved({ component: svc, frontmatter: { commands: { test: { run: 'unit-run', cwd: 'internal' } } } });
    assert.strictEqual(stackRender.renderCommand(nested, 'test').cwd, 'svc/internal');
    const noSlash = makeResolved({ component: { path: 'svc' }, frontmatter: { commands: { test: { run: 'unit-run' } } } });
    assert.strictEqual(stackRender.renderCommand(noSlash, 'test').cwd, 'svc');
    const sentinel = makeResolved({ component: svc, frontmatter: { commands: { build: { run: 'discover' } } } });
    assert.strictEqual(stackRender.renderCommand(sentinel, 'build').cwd, 'svc');
  });

  test('C1d: no component, or a root-shaped component path, leaves cwd unchanged', () => {
    const none = makeResolved({ frontmatter: { commands: { test: { run: 'unit-run' } } } });
    assert.strictEqual('cwd' in stackRender.renderCommand(none, 'test'), false);
    const own = makeResolved({ frontmatter: { commands: { test: { run: 'unit-run', cwd: 'app/' } } } });
    assert.strictEqual(stackRender.renderCommand(own, 'test').cwd, 'app/');
    for (const p of ['', './']) {
      const rootish = makeResolved({ component: { path: p }, frontmatter: { commands: { test: { run: 'unit-run', cwd: 'x' } } } });
      assert.strictEqual(stackRender.renderCommand(rootish, 'test').cwd, 'x', `component path '${p}'`);
    }
  });

  test('C2: scoped form fills {packages}, space-joined', () => {
    const p = makeResolved({
      frontmatter: { commands: { test: { run: 'run-tests ./...', scoped: 'run-tests {packages}' } } },
    });
    const result = stackRender.renderCommand(p, 'test', { packages: ['./pkg1', './pkg2'] });
    assert.deepStrictEqual(result, {
      key: 'test',
      status: 'ok',
      form: 'scoped',
      command: 'run-tests ./pkg1 ./pkg2',
    });
  });

  test('C3: scoped form fills {files}, quoting a path containing a space', () => {
    const p = makeResolved({
      frontmatter: { commands: { lint: { run: 'lint-all', scoped: 'lint {files}' } } },
    });
    const result = stackRender.renderCommand(p, 'lint', { files: ['a.js', 'b c.js'] });
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.form, 'scoped');
    assert.strictEqual(result.command, "lint a.js 'b c.js'");
  });

  test('C4: derives packages from files as unique ./<dirname> when scoped needs {packages}', () => {
    const p = makeResolved({
      frontmatter: { commands: { test: { run: 'run-tests ./...', scoped: 'run-tests {packages}' } } },
    });
    const result = stackRender.renderCommand(p, 'test', {
      files: ['src/foo.x', 'src/bar.x', 'top.x'],
    });
    assert.strictEqual(result.command, 'run-tests ./src .');
  });

  test('C5: run:discover and run:none are sentinel statuses, never a fake command', () => {
    const p = makeResolved({
      frontmatter: { commands: { fmt: { run: 'discover' }, sec: { run: 'none' } } },
    });
    assert.deepStrictEqual(stackRender.renderCommand(p, 'fmt'), {
      key: 'fmt',
      status: 'discover',
      form: null,
      command: null,
    });
    assert.deepStrictEqual(stackRender.renderCommand(p, 'sec'), {
      key: 'sec',
      status: 'none',
      form: null,
      command: null,
    });
  });

  test('C6: unknown key returns status undefined, never a fake command', () => {
    const p = makeResolved({ frontmatter: { commands: { build: { run: 'make build' } } } });
    assert.deepStrictEqual(stackRender.renderCommand(p, 'nonexistent'), {
      key: 'nonexistent',
      status: 'undefined',
      form: null,
      command: null,
    });
  });

  test('C7: apply:true uses apply with placeholders; missing apply falls back to run', () => {
    const p = makeResolved({
      frontmatter: {
        commands: {
          fix: { run: 'lint --check', apply: 'lint --fix {files}' },
          build: { run: 'make build' },
        },
      },
    });
    const applied = stackRender.renderCommand(p, 'fix', { apply: true, files: ['a.js'] });
    assert.deepStrictEqual(applied, {
      key: 'fix',
      status: 'ok',
      form: 'apply',
      command: 'lint --fix a.js',
    });

    const fallback = stackRender.renderCommand(p, 'build', { apply: true });
    assert.deepStrictEqual(fallback, {
      key: 'build',
      status: 'ok',
      form: 'run',
      command: 'make build',
    });
  });
});

// A general-shaped profile: only Principles, Avoid, Testing, Dependencies exist. Used to prove
// that a section present in the profile is still excluded when the agent's slice doesn't cover it.
function makeGeneralProfile() {
  return makeResolved({
    id: 'general',
    frontmatter: {
      commands: { test: { run: 'run-tests' } },
      loop: ['format', 'test'],
      gates: { task: ['format', 'test'], objective: ['build', 'test'] },
      generated: { globs: [] },
      verification: { runtime: 'cli' },
    },
    sections: {
      Principles: { text: 'Keep it simple.', sources: [] },
      Avoid: { text: 'Avoid globals.', sources: [] },
      Testing: { text: 'Write unit tests.', sources: [] },
      Dependencies: { text: 'Pin versions.', sources: [] },
    },
  });
}

// A fully-shaped profile: every §5.3 row is present. Used to prove that an agent's slice
// excludes a section even though it exists on the profile.
function makeFullProfile() {
  return makeResolved({
    id: 'full',
    frontmatter: {
      commands: { test: { run: 'run-tests' } },
      loop: ['format', 'test'],
      gates: { task: ['format', 'test'], objective: ['build', 'test'] },
      generated: { globs: ['**/*.gen.x'], regenerate: 'codegen' },
      verification: { runtime: 'cli', runtime_check: 'tool --version' },
    },
    sections: {
      Principles: { text: 'Keep it simple.', sources: [] },
      Idioms: { text: 'Use the modern form.', sources: [] },
      Avoid: { text: 'Avoid globals.', sources: [] },
      'Layout & architecture': { text: 'Organize by feature.', sources: [] },
      Testing: { text: 'Write unit tests.', sources: [] },
      Dependencies: { text: 'Pin versions.', sources: [] },
      'Generated code': { text: 'Do not hand-edit generated files.', sources: [] },
      Security: { text: 'Validate all input.', sources: [] },
      UI: { text: 'Follow the design system.', sources: [] },
    },
  });
}

describe('contextFor', () => {
  test('C8: executor on a general-shaped profile includes Principles, Commands, Avoid, Dependencies; excludes Testing', () => {
    const p = makeGeneralProfile();
    const result = stackRender.contextFor(p, 'executor');
    assert.deepStrictEqual(result.included, ['Principles', 'Commands', 'Avoid', 'Dependencies']);
    assert.deepStrictEqual(result.omitted, []);
    assert.strictEqual(result.truncated, false);
    assert.ok(result.text.includes('## Avoid'));
    assert.ok(result.text.includes('## Commands'));
    assert.ok(!result.text.includes('## Testing'));
  });

  test('C9: verifier excludes Idioms and Layout & architecture even though both are present', () => {
    const p = makeFullProfile();
    const result = stackRender.contextFor(p, 'verifier');
    assert.deepStrictEqual(result.included, ['Principles', 'Commands', 'Avoid', 'Testing', 'Security']);
    assert.ok(!result.included.includes('Idioms'));
    assert.ok(!result.included.includes('Layout & architecture'));
    assert.ok(!result.text.includes('## Idioms'));
    assert.ok(!result.text.includes('## Layout & architecture'));
  });

  test('C10: mapper includes Principles, Layout & architecture, Dependencies; no Commands block', () => {
    const p = makeFullProfile();
    const result = stackRender.contextFor(p, 'mapper');
    assert.deepStrictEqual(result.included, ['Principles', 'Layout & architecture', 'Dependencies']);
    assert.ok(!result.text.includes('## Commands'));
  });

  test('C11: UI only included when {ui:true}, and only for planner/executor/verifier', () => {
    const p = makeFullProfile();

    assert.ok(!stackRender.contextFor(p, 'planner').included.includes('UI'));
    assert.ok(stackRender.contextFor(p, 'planner', { ui: true }).included.includes('UI'));
    assert.ok(stackRender.contextFor(p, 'executor', { ui: true }).included.includes('UI'));
    assert.ok(stackRender.contextFor(p, 'verifier', { ui: true }).included.includes('UI'));
    assert.ok(!stackRender.contextFor(p, 'mapper', { ui: true }).included.includes('UI'));
    assert.ok(!stackRender.contextFor(p, 'debugger', { ui: true }).included.includes('UI'));
  });

  test('C12: budget 300 truncates, staying under budget, with Principles first', () => {
    const filler = 'x'.repeat(400);
    const p = makeResolved({
      id: 'full',
      frontmatter: {
        commands: { test: { run: 'run-tests' } },
        loop: [],
        gates: { task: [], objective: [] },
        generated: { globs: [] },
        verification: { runtime: 'cli' },
      },
      sections: {
        Principles: { text: 'Keep it simple.', sources: [] },
        Idioms: { text: filler, sources: [] },
        Avoid: { text: filler, sources: [] },
        'Layout & architecture': { text: filler, sources: [] },
        Dependencies: { text: filler, sources: [] },
        'Generated code': { text: filler, sources: [] },
        Security: { text: filler, sources: [] },
      },
    });
    const result = stackRender.contextFor(p, 'executor', { budget: 300 });
    assert.strictEqual(result.truncated, true);
    assert.ok(result.tokens <= 300, `tokens ${result.tokens} should be <= 300`);
    assert.ok(result.omitted.length > 0);
    assert.ok(result.text.startsWith('## Principles'));
  });

  test('extra-1: hard-cuts when even Principles (+Commands) alone exceed the budget', () => {
    const p = makeResolved({
      id: 'mini',
      sections: { Principles: { text: 'p'.repeat(2000), sources: [] } },
    });
    const result = stackRender.contextFor(p, 'mapper', { budget: 50 });
    assert.strictEqual(result.truncated, true);
    assert.strictEqual(result.tokens, 50);
    assert.ok(result.text.endsWith('\n…[truncated]'));
  });

  test('C13: unknown agent throws UNKNOWN_AGENT naming planner; each alias resolves', () => {
    const p = makeFullProfile();
    assert.throws(
      () => stackRender.contextFor(p, 'wizard'),
      (err) => {
        assert.strictEqual(err.code, 'UNKNOWN_AGENT');
        assert.match(err.message, /planner/);
        return true;
      }
    );

    for (const [alias, canonical] of Object.entries(stackRender.AGENT_ALIASES)) {
      const result = stackRender.contextFor(p, alias);
      assert.strictEqual(result.agent, canonical);
    }
  });

  test('C14: neutrality — stack-render.cjs source names no specific stack', () => {
    const src = fs.readFileSync(path.join(__dirname, 'stack-render.cjs'), 'utf-8');
    assert.doesNotMatch(
      src,
      /golang|gofmt|\bdart\b|flutter|pubspec|\bnpm\b|cargo|pytest|rails|gradle|swift|kotlin/i
    );
  });
});
