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
