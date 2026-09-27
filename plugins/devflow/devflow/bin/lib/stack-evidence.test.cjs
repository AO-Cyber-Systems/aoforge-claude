'use strict';

// stack-evidence.test.cjs — Test list (TRD 35-04, E group)
//
// - E1 CI `run: make test` → {key:'test', command:'make test', source:'.github/workflows/ci.yml'}.
// - E2 `run: |` block → each indented line considered.
// - E3 Makefile targets → `make <t>`; `.PHONY:` and `X := y` ignored.
// - E4 justfile recipes → `just <r>`.
// - E5 package.json scripts: test → `npm test`, lint → `npm run lint`; malformed JSON → no
//   evidence, no throw.
// - E6 codebase/STACK.md Commands table beats CI for the same key.
// - E7 `from:'research'` reads `.planning/research/STACK.md`, not codebase.
// - E8 same key in CI, Makefile, package.json → CI wins; all three present in the list.
// - E9 `echo hi` → unclassified, dropped.
// - E10 empty repo → [].
//
// Fixtures are hand-built (`makeRepo` below), never generated — per `no_llm_test_data`.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { STANDARD_KEYS, classifyCommand, collectEvidence } = require('./stack-evidence.cjs');

/** makeRepo({ files }) -> absolute repo root, writing each `relPath: content` under it. */
function makeRepo(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-stack-evidence-'));
  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(root, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  }
  return root;
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* best effort */ }
}

describe('stack-evidence classifyCommand', () => {
  test('classifies by hint first, then by command tokens', () => {
    assert.equal(classifyCommand('anything', 'test'), 'test');
    assert.equal(classifyCommand('go vet ./...', null), null);
    assert.equal(classifyCommand('run the lint suite', null), 'lint');
  });

  test('STANDARD_KEYS carries the documented eight keys', () => {
    assert.deepStrictEqual(STANDARD_KEYS, [
      'build', 'test', 'lint', 'format', 'fix', 'typecheck', 'audit', 'codegen', 'deps',
    ]);
  });
});

describe('stack-evidence collectEvidence (E group)', () => {
  test('E1: CI `run: make test` classifies as test, keeps the raw command and relative source', () => {
    const root = makeRepo({
      '.github/workflows/ci.yml': [
        'jobs:',
        '  t:',
        '    steps:',
        '      - run: make test',
      ].join('\n'),
    });
    try {
      const evidence = collectEvidence(root, { from: 'codebase' });
      assert.deepStrictEqual(
        evidence.find((e) => e.key === 'test'),
        { key: 'test', command: 'make test', source: '.github/workflows/ci.yml' }
      );
    } finally {
      cleanup(root);
    }
  });

  test('E2: `run: |` block considers every indented line', () => {
    const root = makeRepo({
      '.github/workflows/ci.yml': [
        'jobs:',
        '  t:',
        '    steps:',
        '      - name: checks',
        '        run: |',
        '          make lint',
        '          make test',
      ].join('\n'),
    });
    try {
      const evidence = collectEvidence(root, { from: 'codebase' });
      assert.ok(evidence.some((e) => e.key === 'lint' && e.command === 'make lint'));
      assert.ok(evidence.some((e) => e.key === 'test' && e.command === 'make test'));
    } finally {
      cleanup(root);
    }
  });

  test('E3: Makefile targets become `make <t>`; .PHONY and `X := y` are ignored', () => {
    const root = makeRepo({
      Makefile: [
        '.PHONY: test lint',
        'X := y',
        'test:',
        '\tgo test ./...',
        'lint:',
        '\tgo vet ./...',
      ].join('\n'),
    });
    try {
      const evidence = collectEvidence(root, { from: 'codebase' });
      assert.ok(evidence.some((e) => e.key === 'test' && e.command === 'make test'));
      assert.ok(evidence.some((e) => e.key === 'lint' && e.command === 'make lint'));
      assert.ok(!evidence.some((e) => e.command.includes('.PHONY')));
      assert.ok(!evidence.some((e) => e.command.includes('X')));
    } finally {
      cleanup(root);
    }
  });

  test('E4: justfile recipes become `just <r>`', () => {
    const root = makeRepo({
      justfile: [
        'test:',
        '    go test ./...',
        'fmt:',
        '    go fmt ./...',
      ].join('\n'),
    });
    try {
      const evidence = collectEvidence(root, { from: 'codebase' });
      assert.ok(evidence.some((e) => e.key === 'test' && e.command === 'just test'));
      assert.ok(evidence.some((e) => e.key === 'format' && e.command === 'just fmt'));
    } finally {
      cleanup(root);
    }
  });

  test('E5: package.json scripts — test -> npm test, lint -> npm run lint; malformed JSON is silent', () => {
    const root = makeRepo({
      'package.json': JSON.stringify({
        scripts: { test: 'jest', lint: 'eslint .', irrelevant: 'echo hi' },
      }),
    });
    try {
      const evidence = collectEvidence(root, { from: 'codebase' });
      assert.ok(evidence.some((e) => e.key === 'test' && e.command === 'npm test'));
      assert.ok(evidence.some((e) => e.key === 'lint' && e.command === 'npm run lint'));
    } finally {
      cleanup(root);
    }

    const badRoot = makeRepo({ 'package.json': '{ not valid json' });
    try {
      assert.doesNotThrow(() => collectEvidence(badRoot, { from: 'codebase' }));
      assert.deepStrictEqual(collectEvidence(badRoot, { from: 'codebase' }), []);
    } finally {
      cleanup(badRoot);
    }
  });

  test('E6: codebase/STACK.md Commands table beats CI for the same key', () => {
    const root = makeRepo({
      '.planning/codebase/STACK.md': [
        '# Technology Stack',
        '',
        '## Commands',
        '',
        '| Key | Command | Evidence |',
        '|-----|---------|----------|',
        '| test | `go test -race ./...` | Makefile |',
      ].join('\n'),
      '.github/workflows/ci.yml': [
        'jobs:',
        '  t:',
        '    steps:',
        '      - run: go test ./...',
      ].join('\n'),
    });
    try {
      const evidence = collectEvidence(root, { from: 'codebase' });
      const testEntries = evidence.filter((e) => e.key === 'test');
      assert.equal(testEntries.length, 2);
      assert.equal(testEntries[0].command, 'go test -race ./...');
      assert.equal(testEntries[0].source, '.planning/codebase/STACK.md');
    } finally {
      cleanup(root);
    }
  });

  test('E7: from:"research" reads .planning/research/STACK.md, not codebase', () => {
    const root = makeRepo({
      '.planning/codebase/STACK.md': [
        '## Commands',
        '',
        '| Key | Command | Evidence |',
        '|-----|---------|----------|',
        '| test | `codebase test` | x |',
      ].join('\n'),
      '.planning/research/STACK.md': [
        '## Commands',
        '',
        '| Key | Command | Evidence |',
        '|-----|---------|----------|',
        '| test | `research test` | x |',
      ].join('\n'),
    });
    try {
      const evidence = collectEvidence(root, { from: 'research' });
      const testEntries = evidence.filter((e) => e.key === 'test');
      assert.equal(testEntries.length, 1);
      assert.equal(testEntries[0].command, 'research test');
      assert.equal(testEntries[0].source, '.planning/research/STACK.md');
    } finally {
      cleanup(root);
    }
  });

  test('E8: same key in CI, Makefile and package.json — CI wins, all three present', () => {
    const root = makeRepo({
      '.github/workflows/ci.yml': [
        'jobs:',
        '  t:',
        '    steps:',
        '      - run: ci test',
      ].join('\n'),
      Makefile: ['test:', '\tmaketool test'].join('\n'),
      'package.json': JSON.stringify({ scripts: { test: 'jest' } }),
    });
    try {
      const evidence = collectEvidence(root, { from: 'codebase' });
      const testEntries = evidence.filter((e) => e.key === 'test');
      assert.equal(testEntries.length, 3);
      assert.equal(testEntries[0].command, 'ci test');
      assert.ok(testEntries.some((e) => e.command === 'make test'));
      assert.ok(testEntries.some((e) => e.command === 'npm test'));
    } finally {
      cleanup(root);
    }
  });

  test('E9: an unclassifiable command is dropped', () => {
    const root = makeRepo({
      '.github/workflows/ci.yml': [
        'jobs:',
        '  t:',
        '    steps:',
        '      - run: echo hi',
      ].join('\n'),
    });
    try {
      const evidence = collectEvidence(root, { from: 'codebase' });
      assert.deepStrictEqual(evidence, []);
    } finally {
      cleanup(root);
    }
  });

  test('E10: an empty repo yields no evidence', () => {
    const root = makeRepo({});
    try {
      assert.deepStrictEqual(collectEvidence(root, { from: 'codebase' }), []);
    } finally {
      cleanup(root);
    }
  });
});
