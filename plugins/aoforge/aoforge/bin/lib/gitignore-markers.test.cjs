'use strict';

// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation;
// TRD 40-05, objective 40-tooling-correctness, requirement TOOL-08). This is a CI gate:
// every file-backed gate marker that override.cjs writes under `.aoforge/` must have a
// matching `.aoforge/<name>` line in the repo `.gitignore`, so a marker can never be
// committed by accident. A new file-backed entry in GATES is checked automatically.
//
// 6. missingMarkers(gitignoreText, markers) returns ['.edit-override'] for a sample text
//    that contains only `.aoforge/.skill-active` (sensitivity: the helper really reports
//    a missing line).
//    6b. fileBackedMarkers keeps non-null GATES values plus a bare LOG_FILE name, and drops
//        null gates and a LOG_FILE that is not a bare filename.
// 7. Repo gate: missingMarkers(read('.gitignore'), fileBackedMarkers(GATES, LOG_FILE))
//    deep-equals [].
//
// Runtime model: read-only over the repo. Repo root is path.resolve(__dirname, '..', '..',
// '..', '..', '..'); a mirror install (no README.md there) skips the repo gate (7).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { GATES, LOG_FILE } = require('./override.cjs');
const { planningDirName } = require('./compat.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_AOFORGE_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));

// ─── Helpers ───────────────────────────────────────────────────────────────────────

/**
 * The marker filenames override.cjs writes inside `.aoforge/`: every non-null GATES value
 * (the hook-consumed override markers) plus LOG_FILE when it is a bare filename — override.cjs
 * joins it onto the planning dir, so a bare name always lands at `.aoforge/<name>`.
 */
function fileBackedMarkers(gates, logFile) {
  const out = Object.values(gates).filter((v) => typeof v === 'string' && v.length > 0);
  if (typeof logFile === 'string' && logFile.length > 0 && path.basename(logFile) === logFile) {
    out.push(logFile);
  }
  return [...new Set(out)];
}

/**
 * Markers with no exact `<dir>/<name>` (or `/<dir>/<name>`) line in the gitignore text, `dir` the planning
 * directory (default `.aoforge`). Comments, blank lines and negations never count as coverage.
 */
function missingMarkers(gitignoreText, markers, dir = '.aoforge') {
  const lines = new Set(
    gitignoreText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && !l.startsWith('!')),
  );
  return markers.filter(
    (m) => !lines.has(`${dir}/${m}`) && !lines.has(`/${dir}/${m}`),
  );
}

// ─── 6: sensitivity (inline fixtures) ──────────────────────────────────────────────

describe('gitignore marker helpers — sensitivity', () => {
  test('6: missingMarkers reports .edit-override missing from a sample gitignore', () => {
    const sample = '# AOForge ephemeral skill marker\n.aoforge/.skill-active\n';
    assert.deepEqual(missingMarkers(sample, ['.skill-active', '.edit-override']), [
      '.edit-override',
    ]);
  });

  test('6: a commented-out or negated line does not count as coverage', () => {
    const sample = '# .aoforge/.edit-override\n!.aoforge/.edit-override\n';
    assert.deepEqual(missingMarkers(sample, ['.edit-override']), ['.edit-override']);
  });

  test('6b: fileBackedMarkers keeps non-null gates and a bare LOG_FILE only', () => {
    assert.deepEqual(
      fileBackedMarkers({ edits: '.edit-override', commits: null }, '.override-log.jsonl'),
      ['.edit-override', '.override-log.jsonl'],
    );
    assert.deepEqual(fileBackedMarkers({ commits: null }, 'logs/override.jsonl'), []);
  });

  test('6b: the live override.cjs exports yield .edit-override', () => {
    assert.ok(fileBackedMarkers(GATES, LOG_FILE).includes('.edit-override'));
  });
});

// ─── 7: the repo gate ──────────────────────────────────────────────────────────────

describe(
  'gitignore marker guard — repo .gitignore',
  { skip: IS_AOFORGE_CHECKOUT ? false : 'not an aoforge-claude checkout' },
  () => {
    test('7: every file-backed override marker has a <planning dir>/<name> line in .gitignore', () => {
      const text = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
      // this repository's planning directory, wherever it is (`.planning/` until 72-21, `.aoforge/` after)
      const missing = missingMarkers(text, fileBackedMarkers(GATES, LOG_FILE), planningDirName(REPO_ROOT));
      assert.deepEqual(
        missing,
        [],
        'override.cjs writes these markers under .aoforge/ but .gitignore does not ignore ' +
          'them — add a `.aoforge/<name>` line in the ephemeral-marker block: ' +
          missing.join(', '),
      );
    });
  },
);
