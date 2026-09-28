'use strict';

// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation;
// TRD 38-09, objective 38-doc-auto-correction). This is the CI gate: it walks the repo's own
// live text and fails when a stale or unknown /devflow:/df: command reference ships.
//
// 1. The scan set (before EXEMPT) is non-empty (> 150 files) and includes README.md,
//    plugins/devflow/devflow/bin/lib/validate.cjs and plugins/devflow/hooks/statusline.js.
//    [Task 2]
// 2. The main gate: zero findings across the scan set minus EXEMPT minus legacy workflows.
//    The failure message lists every finding and the EXEMPT table. [Task 2]
// 3. Every EXEMPT entry has a reason of >= 20 chars and matches >= 1 existing path. [Task 1]
// 4. ignore-start markers appear only in help.md — exactly one region, properly closed. [Task 1]
// 5. The help.md fenced rename table deep-equals DEPRECATION_MAP. [Task 1]
// 6. Sensitivity (a): route-intent.test.js and intent-fixtures.cjs each produce >= 1 finding
//    when scanned directly (bypassing EXEMPT) — proves the exemption is doing real work. [Task 1]
// 7. Sensitivity (b): the sample string
//    "/df:quick /devflow:health /devflow:update /devflow:nope /devflow:status" ->
//    kinds [prefix, renamed, removed, unknown] (status is a live skill -> ok -> filtered). [Task 1]
// 8. The legacy-workflow exemption is derived from frontmatter: insert-objective.md
//    (status: legacy) is exempt; add-objective.md (status: active) is scanned. [Task 1]
// 9. plugins/devflow/devflow/references/command-renames.json does not exist. [Task 1]
// 10. templates/claude-md.md and templates/global-claude-md.md produce zero findings. [Task 1]
//
// Runtime model (binding, TRD 38-09): this test is read-only — it never writes to the repo.
// Repo root is path.resolve(__dirname, '..', '..', '..', '..', '..'); a mirror install (no
// README.md there) skips the whole file rather than failing on paths that can't exist.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { scanText, liveSkillNames, walkFiles } = require('./doc-refs.cjs');
const { DEPRECATION_MAP } = require('./skill-route.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_DEVFLOW_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));

// ─── Scan set (must_haves truth 1) ─────────────────────────────────────────────────

const SCAN_INCLUDE = [
  'plugins/devflow/agents/**',
  'plugins/devflow/skills/**',
  'plugins/devflow/devflow/workflows/**',
  'plugins/devflow/devflow/references/**',
  'plugins/devflow/devflow/templates/**',
  'plugins/devflow/devflow/bin/**/*.cjs',
  'plugins/devflow/hooks/**/*.js',
  'README.md',
  'CLAUDE.md',
  'docs/USER-GUIDE.md',
  'site/content/**',
  '.github/**',
  'assets/**/*.svg',
];

// Not scanned by design (outside SCAN_INCLUDE — documented here, not enforced by a test):
// CHANGELOG.md, .planning/**, docs/ other than USER-GUIDE (dated PROPOSAL/IMPLEMENTATION-PLAN/
// CODEX-PORT records), site/public (gitignored build output), and the sibling plugins under
// plugins/ (their /<name>: commands are namespaced by their own plugin, not devflow/df).

// ─── EXEMPT (must_haves truth 2-5) ─────────────────────────────────────────────────
// Every entry: a reason of >= 20 chars, and a pattern that matches >= 1 real path (test 3) —
// a dead exemption is a bug, so it fails the gate rather than sitting there silently.

const EXEMPT = [
  {
    pattern: '**/*.test.cjs',
    reason:
      'tests feed old command names as deliberate input fixtures (classifier.test.cjs, ' +
      'gh-pull.test.cjs and this file\'s own doc-refs.test.cjs suite)',
  },
  {
    pattern: '**/*.test.js',
    reason:
      'tests feed old command names as deliberate input: route-intent prefix exclusion ' +
      '(route-intent.test.js:209-210) and the statusline text assertions',
  },
  {
    pattern: 'plugins/devflow/devflow/bin/lib/__fixtures__/**',
    reason:
      'frozen fixtures — intent-fixtures.cjs realCLAUDEMd is a faithful copy of an old ' +
      'CLAUDE.md kept for the B1 round-trip test',
  },
  {
    pattern: 'plugins/devflow/devflow/bin/lib/skill-route.cjs',
    reason:
      'declares DEPRECATION_MAP and REMOVED_COMMANDS themselves — the rename map, not a ' +
      'reference to it',
  },
  {
    pattern: 'plugins/devflow/devflow/bin/lib/doc-refs.cjs',
    reason:
      'declares the doc-refs:ignore-start/-end marker strings and the /df: prefix rule this ' +
      'very gate depends on',
  },
];

// ─── shared plumbing ────────────────────────────────────────────────────────────────

/** Frontmatter `status:` value, or null when the file has no --- frontmatter block. */
function _frontmatterStatus(text) {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const m = fm[1].match(/^status:\s*(\S+)/m);
  return m ? m[1] : null;
}

/** Raw scan set: SCAN_INCLUDE only, no EXEMPT and no legacy-workflow filter applied. */
function rawScanSet() {
  return walkFiles(REPO_ROOT, { include: SCAN_INCLUDE });
}

/**
 * Effective scan set: SCAN_INCLUDE minus every EXEMPT pattern minus workflows whose
 * frontmatter is status: legacy (must_haves truth 6 — computed from frontmatter, not
 * hard-coded as a path in EXEMPT).
 */
function effectiveScanSet() {
  const files = walkFiles(REPO_ROOT, {
    include: SCAN_INCLUDE,
    exclude: EXEMPT.map((e) => e.pattern),
  });
  const WORKFLOWS_DIR = 'plugins/devflow/devflow/workflows/';
  return files.filter((rel) => {
    if (!rel.startsWith(WORKFLOWS_DIR)) return true;
    const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
    return _frontmatterStatus(text) !== 'legacy';
  });
}

function findAllFindings() {
  const liveSkills = liveSkillNames(path.join(REPO_ROOT, 'plugins/devflow/skills'));
  const findings = [];
  for (const rel of effectiveScanSet()) {
    const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
    for (const r of scanText(text, { liveSkills })) {
      findings.push({ file: rel, line: r.line, token: r.token, kind: r.kind, replacement: r.replacement });
    }
  }
  return findings;
}

function formatFailureMessage(findings) {
  const findingLines = findings.map(
    (f) => `  ${f.file}:${f.line}  ${f.token} → ${f.replacement || f.kind}`,
  );
  const exemptLines = EXEMPT.map((e) => `  ${e.pattern} — ${e.reason}`);
  return [
    'stale command references (fix the text, or — only if it is a record, not a live doc — add a justified EXEMPT entry):',
    ...findingLines,
    '',
    'EXEMPT:',
    ...exemptLines,
  ].join('\n');
}

/** Rows of a `| \`/devflow:<old>\` | \`/devflow:<new>\` ... |` table: {old: new}. */
function parseRenameTable(text) {
  const rowRe = /^\|\s*`\/devflow:([a-z][a-z0-9-]*)`\s*\|\s*`\/devflow:([a-z][a-z0-9 -]*)`/gm;
  const map = {};
  let m;
  while ((m = rowRe.exec(text)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

// ─── tests ──────────────────────────────────────────────────────────────────────────

describe('doc-refs.repo.test.cjs', { skip: IS_DEVFLOW_CHECKOUT ? false : 'not a devflow-claude checkout' }, () => {
  describe('EXEMPT sanity', () => {
    test('3: every EXEMPT entry has a reason >= 20 chars and matches >= 1 real path', () => {
      for (const entry of EXEMPT) {
        assert.ok(
          entry.reason.length >= 20,
          `EXEMPT reason too short (${entry.reason.length} chars): ${entry.pattern}`,
        );
        const matches = walkFiles(REPO_ROOT, { include: [entry.pattern] });
        assert.ok(matches.length >= 1, `EXEMPT pattern matches no existing path: ${entry.pattern}`);
      }
    });
  });

  describe('IGNORE: ignore-region discipline', () => {
    const HELP_REL = 'plugins/devflow/devflow/workflows/help.md';

    test('4: ignore-start markers appear only in help.md — exactly one region, properly closed', () => {
      const hits = [];
      for (const rel of effectiveScanSet()) {
        const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
        const startCount = (text.match(/doc-refs:ignore-start/g) || []).length;
        const endCount = (text.match(/doc-refs:ignore-end/g) || []).length;
        if (startCount > 0 || endCount > 0) hits.push({ rel, startCount, endCount });
      }
      assert.deepStrictEqual(
        hits.map((h) => h.rel),
        [HELP_REL],
        `ignore-region markers found outside help.md: ${JSON.stringify(hits)}`,
      );
      assert.strictEqual(hits[0].startCount, 1, 'help.md must contain exactly one ignore-start');
      assert.strictEqual(hits[0].endCount, 1, 'help.md must contain exactly one ignore-end');
      // "properly closed": scanText must not throw DocRefsError on help.md's own text.
      const helpText = fs.readFileSync(path.join(REPO_ROOT, HELP_REL), 'utf-8');
      assert.doesNotThrow(() => scanText(helpText));
    });

    test('5: help.md fenced rename table deep-equals DEPRECATION_MAP', () => {
      const text = fs.readFileSync(path.join(REPO_ROOT, HELP_REL), 'utf-8');
      const region = text.match(/doc-refs:ignore-start[\s\S]*?doc-refs:ignore-end/);
      assert.ok(region, 'help.md must contain a doc-refs:ignore-start/-end region');
      const table = parseRenameTable(region[0]);
      assert.deepStrictEqual(table, DEPRECATION_MAP);
    });
  });

  describe('SENSITIVITY', () => {
    test('6: (a) route-intent.test.js and intent-fixtures.cjs each produce >= 1 finding scanned directly', () => {
      const files = [
        'plugins/devflow/hooks/route-intent.test.js',
        'plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs',
      ];
      for (const rel of files) {
        const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
        const results = scanText(text);
        assert.ok(
          results.length >= 1,
          `${rel} must produce >= 1 finding when scanned directly (proves EXEMPT is doing real work)`,
        );
      }
    });

    test('7: (b) one token of every kind in a hand-built sample string', () => {
      const liveSkills = liveSkillNames(path.join(REPO_ROOT, 'plugins/devflow/skills'));
      const sample = '/df:quick /devflow:health /devflow:update /devflow:nope /devflow:status';
      const results = scanText(sample, { liveSkills });
      assert.deepStrictEqual(results.map((r) => r.kind), ['prefix', 'renamed', 'removed', 'unknown']);
    });
  });

  describe('LEGACY: frontmatter-derived workflow exemption', () => {
    test('8: insert-objective.md (legacy) is exempt; add-objective.md (active) is scanned', () => {
      const insertRel = 'plugins/devflow/devflow/workflows/insert-objective.md';
      const addRel = 'plugins/devflow/devflow/workflows/add-objective.md';
      const insertText = fs.readFileSync(path.join(REPO_ROOT, insertRel), 'utf-8');
      const addText = fs.readFileSync(path.join(REPO_ROOT, addRel), 'utf-8');
      assert.strictEqual(_frontmatterStatus(insertText), 'legacy');
      assert.strictEqual(_frontmatterStatus(addText), 'active');

      const scanned = effectiveScanSet();
      assert.ok(!scanned.includes(insertRel), 'status: legacy workflow must not be in the effective scan set');
      assert.ok(scanned.includes(addRel), 'status: active workflow must be in the effective scan set');
    });
  });

  describe('SINGLE SOURCE', () => {
    test('9: references/command-renames.json does not exist', () => {
      const p = path.join(REPO_ROOT, 'plugins/devflow/devflow/references/command-renames.json');
      assert.strictEqual(
        fs.existsSync(p),
        false,
        'command-renames.json must not exist — DEPRECATION_MAP is the only rename source (DOC-01)',
      );
    });
  });

  describe('MIGRATION TARGETS', () => {
    test('10: templates/claude-md.md and templates/global-claude-md.md produce zero findings', () => {
      const liveSkills = liveSkillNames(path.join(REPO_ROOT, 'plugins/devflow/skills'));
      for (const rel of [
        'plugins/devflow/devflow/templates/claude-md.md',
        'plugins/devflow/devflow/templates/global-claude-md.md',
      ]) {
        const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
        const results = scanText(text, { liveSkills });
        assert.deepStrictEqual(results, [], `${rel} has stale references: ${JSON.stringify(results)}`);
      }
    });
  });
});

// ─── Task 2 will add tests 1 (raw scan set) and 2 (the main gate) below this line. ───
