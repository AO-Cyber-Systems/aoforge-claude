'use strict';

// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation;
// TRD 40-05, objective 40-tooling-correctness, requirement TOOL-03). This is a CI gate: in
// ripgrep `-E` is `--encoding`, not extended regex, so an rg invocation that folds `E` into
// a single-dash short-flag cluster (the `-nE` cluster, or a bare `-E`) is a broken command.
// Objective 38's planner prose shipped exactly that. This file keeps it out of live plugin prose.
//
// 1. Detector hits (each gives >= 1 finding): the `-nE` cluster with an alternation pattern,
//    a bare `-E utf-8`, the `-inE` cluster, and the `-nE` cluster after a pipe.
// 2. Detector no-hits: `-n -e 'a|b'`, `-nP 'a'`, grep/egrep with `-E`, `--encoding utf-8`,
//    `-n -e 'foo -E'` (a quoted pattern token), and prose that mentions ripgrep and `-E`
//    without an rg command word.
// 3. Scan set: > 50 files, and it includes plugins/devflow/agents/planner.md and
//    plugins/devflow/devflow/references/trd-spec.md. No path starts with `.planning/`.
// 4. Main gate: zero findings across the scan set. The failure message lists `file:line: text`.
// 5. Guidance present: trd-spec.md and verification-patterns.md each match /-E.*--encoding/
//    and contain `rg -n -e`.
//
// Scope (binding, TRD 40-05): live plugin prose only — agents, skills, workflows, references,
// templates. Not scanned: `.planning/**` (historical records stay as written), CHANGELOG.md,
// and `bin/**` — this file's own fixtures contain the bad form on purpose. The sensitivity
// fixtures are inline strings below, never files in the scanned tree.
//
// Runtime model: read-only over the repo. Repo root is path.resolve(__dirname, '..', '..',
// '..', '..', '..'); a mirror install (no README.md there) skips the repo cases (3-5).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { walkFiles } = require('./doc-refs.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_DEVFLOW_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));

// Same glob strings doc-refs.repo.test.cjs uses for the plugin prose trees.
const SCAN_INCLUDE = [
  'plugins/devflow/agents/**',
  'plugins/devflow/skills/**',
  'plugins/devflow/devflow/workflows/**',
  'plugins/devflow/devflow/references/**',
  'plugins/devflow/devflow/templates/**',
];

// ─── Detector ──────────────────────────────────────────────────────────────────────

// RED stub — replaced by the real detector in the GREEN commit.
const findRgFlagMisuse = () => [];

// ─── 1-2: sensitivity controls (inline fixtures) ───────────────────────────────────

describe('rg flag detector — sensitivity', () => {
  const HITS = [
    { text: "rg -nE 'a|b' src", token: '-nE' },
    { text: 'rg -E utf-8 x', token: '-E' },
    { text: 'rg -inE foo', token: '-inE' },
    { text: 'x | rg -nE y', token: '-nE' },
  ];

  for (const { text, token } of HITS) {
    test(`1: hit — ${text}`, () => {
      const findings = findRgFlagMisuse(text);
      assert.ok(findings.length >= 1, `expected >= 1 finding for: ${text}`);
      assert.equal(findings[0].token, token);
      assert.equal(findings[0].line, 1);
    });
  }

  test('1: hit — reports the 1-based line number inside multi-line text', () => {
    const findings = findRgFlagMisuse("clean line\nrun `rg -nE 'x|y' lib` here\n");
    assert.equal(findings.length, 1);
    assert.equal(findings[0].line, 2);
    assert.equal(findings[0].token, '-nE');
  });

  const NO_HITS = [
    "rg -n -e 'a|b'",
    "rg -nP 'a'",
    "grep -nE 'a|b'",
    'egrep -E x',
    'rg --encoding utf-8 x',
    "rg -n -e 'foo -E'",
    'ripgrep docs mention -E',
  ];

  for (const text of NO_HITS) {
    test(`2: no hit — ${text}`, () => {
      assert.deepEqual(findRgFlagMisuse(text), []);
    });
  }
});

// ─── 3-5: the repo gate ────────────────────────────────────────────────────────────

describe(
  'rg flag guard — live plugin prose',
  { skip: IS_DEVFLOW_CHECKOUT ? false : 'not a devflow-claude checkout' },
  () => {
    const scanSet = () => walkFiles(REPO_ROOT, { include: SCAN_INCLUDE });

    test('3: scan set is non-empty, includes planner.md and trd-spec.md, excludes .planning', () => {
      const files = scanSet();
      assert.ok(files.length > 50, `scan set too small: ${files.length}`);
      assert.ok(files.includes('plugins/devflow/agents/planner.md'), 'planner.md not scanned');
      assert.ok(
        files.includes('plugins/devflow/devflow/references/trd-spec.md'),
        'trd-spec.md not scanned',
      );
      const planning = files.filter((f) => f.startsWith('.planning/'));
      assert.deepEqual(planning, [], '.planning must never be scanned');
    });

    test('4: zero rg invocations with E in a short-flag cluster across the scan set', () => {
      const findings = [];
      for (const rel of scanSet()) {
        const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
        for (const f of findRgFlagMisuse(text)) findings.push(`${rel}:${f.line}: ${f.text}`);
      }
      assert.deepEqual(
        findings,
        [],
        'In ripgrep -E is --encoding, not extended regex. Use `rg -n -e PATTERN` (repeat -e ' +
          'for alternatives) or `rg -nP PATTERN`. Offending lines:\n' +
          findings.join('\n'),
      );
    });

    for (const rel of [
      'plugins/devflow/devflow/references/trd-spec.md',
      'plugins/devflow/devflow/references/verification-patterns.md',
    ]) {
      test(`5: guidance present — ${path.basename(rel)} states the ripgrep -E rule`, () => {
        const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
        assert.ok(/-E.*--encoding/.test(text), `${rel} does not state that -E is --encoding`);
        assert.ok(text.includes('rg -n -e'), `${rel} does not show the rg -n -e form`);
      });
    }
  },
);
