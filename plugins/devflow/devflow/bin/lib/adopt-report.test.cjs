'use strict';

// adopt-report.test.cjs — `df-tools adopt report` (objective 37, TRD 08, ADP-03).
//
// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation):
//
// Local helper `scaffoldedFixture(kind, {inferences})` = readyFixture(kind) (37-07's pattern:
// makeFixture -> `adopt begin` -> writeMappedDocs -> writeProjectMd) -> optionally
// writeInferences -> `adopt scaffold`. All spawns: `[DF_TOOLS, '--cwd', root, ...]`, env
// `gitEnv(fakeHome)`.
//
//  1. go, mixed-confidence inferences -> exit 0; report has `## Needs review` with default_work
//     and `validated:List orders`, `## Inferred with high confidence` with kind.
//  2. Ordering: a redaction row and a STACK.md-invalid row precede low rows, which precede
//     medium rows.
//  3. No inference file -> a low row containing "no inference record".
//  4. `confidence: 'maybe'` entry -> a row naming the malformed entry; the other entries still
//     listed.
//  5. Marker `scaffold.stack.ok: false` -> first row mentions `.planning/STACK.md`.
//  6. Missing loop evidence: whichever of test/lint/build has no command evidence (computed
//     dynamically via stackProfile.draftProfile, not hard-coded) gets a low row.
//  7. A `.planning/codebase/STACK.md` with 3 lines -> a medium row naming it.
//  8. Redaction: AKIAABCDEFGHIJKLMNOP in ARCHITECTURE.md and inside the CLAUDE.md block, and
//     also in CLAUDE.md user text outside the block -> the first two become [REDACTED], the
//     outside copy is byte-identical; redactions: 2; rows show file + line + aws-access-key,
//     never the key.
//  9. Fixture in a scratch state -> a row noting the scratch location (checked dynamically
//     against repo-state.isScratchDir, not assumed).
// 10. A health warning (missing `## Core Value`) -> a row with the W-code.
// 11. Inference file deleted after the run; marker.inferences holds them; re-run -> byte-
//     identical ADOPT-REPORT.md.
// 12. commit_files sorted, includes the owned .planning files + CLAUDE.md, excludes
//     `.planning/.skill-active` and `.planning/.adopt-inferences.json`.
// 13. commit_message === `chore(devflow): adopt repository (DevFlow v<checkout plugin version>)`.
// 14. Guards: on main (never begun) -> exit 3; resume state but not scaffolded -> exit 1
//     `run adopt scaffold first`.

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  makeFixture,
  makeFakeHome,
  gitEnv,
  writeMappedDocs,
  writeProjectMd,
  writeInferences,
} = require('./__fixtures__/adopt-fixtures.cjs');

const adopt = require('./adopt.cjs');
const managedBlock = require('./managed-block.cjs');
const stackProfile = require('./stack-profile.cjs');
const { isScratchDir } = require('./repo-state.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');
const PLUGIN_JSON_PATH = path.join(__dirname, '..', '..', '..', '.claude-plugin', 'plugin.json');

// ─── Helpers ────────────────────────────────────────────────────────────────

let spawnedTmpRoots = [];
function mkdtemp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  spawnedTmpRoots.push(dir);
  return dir;
}

let fakeHome;

function run(argv, cwd, env) {
  const r = spawnSync(process.execPath, [TOOLS_PATH, ...argv], {
    cwd, encoding: 'utf-8', timeout: 30000, env,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', out: (r.stdout || '') + (r.stderr || '') };
}

function runAdopt(fixture, sub, extraArgs = []) {
  const r = run(['--cwd', fixture, 'adopt', sub, ...extraArgs], mkdtemp('df-adopt-report-spawn-'), gitEnv(fakeHome));
  let report = null;
  try { report = JSON.parse(r.stdout); } catch { /* left null on parse failure */ }
  return { ...r, report };
}

const KIND_FOR = { 'go-service': 'api', 'flutter-app': 'app', 'node-cli': 'cli' };
const NAME_FOR = { 'go-service': 'Orders Service', 'flutter-app': 'Habit Tracker', 'node-cli': 'Todo CLI' };

/** readyFixture(kind) -> makeFixture -> `adopt begin` -> writeMappedDocs -> writeProjectMd. */
function readyFixture(kind) {
  const root = makeFixture(kind, { parent: mkdtemp('df-report-parent-'), home: fakeHome });
  const beginResult = runAdopt(root, 'begin');
  assert.strictEqual(beginResult.status, 0, beginResult.out);
  writeMappedDocs(root);
  writeProjectMd(root, { name: NAME_FOR[kind], kind: KIND_FOR[kind], defaultWork: 'feature' });
  return root;
}

/** scaffoldedFixture(kind, {inferences}) -> readyFixture(kind) [+ writeInferences] -> `adopt scaffold`. */
function scaffoldedFixture(kind, { inferences } = {}) {
  const root = readyFixture(kind);
  if (inferences) writeInferences(root, inferences);
  const scaffoldResult = runAdopt(root, 'scaffold');
  assert.strictEqual(scaffoldResult.status, 0, scaffoldResult.out);
  return root;
}

function readReport(root) {
  return fs.readFileSync(path.join(root, '.planning', 'ADOPT-REPORT.md'), 'utf-8');
}

function readMarkerFile(root) {
  return adopt.readMarker(root, gitEnv(fakeHome)).marker;
}

beforeEach(() => {
  spawnedTmpRoots = [];
  fakeHome = makeFakeHome();
});

afterEach(() => {
  for (const dir of spawnedTmpRoots) fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(fakeHome, { recursive: true, force: true });
});

describe('adopt report', () => {
  test('1. go fixture, mixed-confidence inferences -> needs-review + high-confidence tables', () => {
    const root = scaffoldedFixture('go-service', {
      inferences: [
        { field: 'kind', value: 'api', confidence: 'high', evidence: 'go.mod; net/http server in main.go' },
        { field: 'default_work', value: 'feature', confidence: 'low', evidence: 'no roadmap history' },
        { field: 'validated:List orders', value: 'GET /orders', confidence: 'medium', evidence: 'internal/orders/handler.go' },
      ],
    });

    const result = runAdopt(root, 'report');
    assert.strictEqual(result.status, 0, result.out);
    assert.strictEqual(result.report.route, 'report');

    const text = readReport(root);
    assert.match(text, /## Needs review/);
    assert.match(text, /default_work/);
    assert.match(text, /validated:List orders/);
    assert.match(text, /## Inferred with high confidence/);
    assert.match(text, /\| kind \|/);

    assert.ok(result.report.needs_review.some((r) => r.item === 'default_work' && r.confidence === 'low'));
    assert.ok(result.report.needs_review.some((r) => r.item === 'validated:List orders' && r.confidence === 'medium'));
    assert.ok(result.report.high.some((r) => r.item === 'kind' && r.value === 'api'));
  });

  test('2. ordering: redaction and STACK.md-invalid rows precede low rows, which precede medium rows', () => {
    const root = scaffoldedFixture('node-cli', {
      inferences: [
        { field: 'default_work', value: 'feature', confidence: 'low', evidence: 'no history' },
        { field: 'validated:Add todo', value: 'CLI add', confidence: 'medium', evidence: 'bin/todo.js' },
      ],
    });

    const archPath = path.join(root, '.planning', 'codebase', 'ARCHITECTURE.md');
    fs.appendFileSync(archPath, '\nLeaked key: AKIAABCDEFGHIJKLMNOP\n', 'utf-8');

    const marker = readMarkerFile(root);
    marker.scaffold.stack.ok = false;
    adopt.writeMarker(root, gitEnv(fakeHome), marker);

    const result = runAdopt(root, 'report');
    assert.strictEqual(result.status, 0, result.out);

    const rank = { priority: 0, low: 1, medium: 2 };
    const categories = result.report.needs_review.map((r) => r.confidence);
    for (let i = 1; i < categories.length; i++) {
      assert.ok(rank[categories[i]] >= rank[categories[i - 1]], `row ${i} (${categories[i]}) out of order after ${categories[i - 1]}`);
    }
    assert.ok(categories.filter((c) => c === 'priority').length >= 2, 'expected at least a redaction row and the STACK.md-invalid row');
    assert.ok(categories.includes('low'));
    assert.ok(categories.includes('medium'));
  });

  test('3. no inference file -> a low row containing "no inference record"', () => {
    const root = scaffoldedFixture('go-service');
    const result = runAdopt(root, 'report');
    assert.strictEqual(result.status, 0, result.out);
    const row = result.report.needs_review.find((r) => r.item.includes('no inference record'));
    assert.ok(row, 'expected a "no inference record" row');
    assert.strictEqual(row.confidence, 'low');
  });

  test('4. a malformed confidence value names the entry; the other entries still listed', () => {
    const root = scaffoldedFixture('go-service', {
      inferences: [
        { field: 'default_work', value: 'feature', confidence: 'maybe', evidence: 'ambiguous' },
        { field: 'validated:List orders', value: 'GET /orders', confidence: 'low', evidence: 'handler.go' },
      ],
    });

    const result = runAdopt(root, 'report');
    assert.strictEqual(result.status, 0, result.out);
    const rows = result.report.needs_review;
    assert.ok(
      rows.some((r) => r.item.includes('malformed') && r.inferred.includes('default_work')),
      'expected a row naming the malformed entry'
    );
    assert.ok(rows.some((r) => r.item === 'validated:List orders'), 'the valid entry must still be listed');
  });

  test('5. marker scaffold.stack.ok:false -> first needs-review row mentions .planning/STACK.md', () => {
    const root = scaffoldedFixture('flutter-app');
    const marker = readMarkerFile(root);
    marker.scaffold.stack.ok = false;
    marker.scaffold.stack.errors = ['missing frontmatter'];
    adopt.writeMarker(root, gitEnv(fakeHome), marker);

    const result = runAdopt(root, 'report');
    assert.strictEqual(result.status, 0, result.out);
    assert.ok(result.report.needs_review.length > 0);
    assert.match(result.report.needs_review[0].item, /\.planning\/STACK\.md/);
  });

  test('6. missing loop-command evidence gets a low row, computed dynamically', () => {
    const root = scaffoldedFixture('node-cli');
    const draft = stackProfile.draftProfile({ projectRoot: root, userHome: fakeHome, from: 'codebase' });
    const evidenceKeys = new Set((draft.evidence || []).map((e) => e.key));
    const missing = ['test', 'lint', 'build'].filter((k) => !evidenceKeys.has(k));
    assert.ok(missing.length > 0, 'fixture setup expects at least one missing loop-command key (node-cli has no build script)');

    const result = runAdopt(root, 'report');
    assert.strictEqual(result.status, 0, result.out);
    for (const key of missing) {
      assert.ok(
        result.report.needs_review.some((r) => r.confidence === 'low' && r.item.includes(`'${key}'`)),
        `expected a low row for missing '${key}' evidence`
      );
    }
    for (const key of ['test', 'lint', 'build'].filter((k) => !missing.includes(k))) {
      assert.ok(
        !result.report.needs_review.some((r) => r.item.includes(`no command evidence for '${key}'`)),
        `did not expect a missing-evidence row for '${key}'`
      );
    }
  });

  test('7. a codebase doc under 20 lines gets a medium row naming it', () => {
    const root = scaffoldedFixture('go-service');
    fs.writeFileSync(path.join(root, '.planning', 'codebase', 'STACK.md'), '# STACK\n\nShort.\n', 'utf-8');

    const result = runAdopt(root, 'report');
    assert.strictEqual(result.status, 0, result.out);
    assert.ok(
      result.report.needs_review.some((r) => r.confidence === 'medium' && r.item.includes('.planning/codebase/STACK.md')),
      'expected a medium row naming the short STACK.md doc'
    );
  });

  test('8. redacts a secret in ARCHITECTURE.md and inside the CLAUDE.md block; leaves the copy outside untouched', () => {
    const root = scaffoldedFixture('go-service');
    const SECRET = 'AKIAABCDEFGHIJKLMNOP';

    const archPath = path.join(root, '.planning', 'codebase', 'ARCHITECTURE.md');
    fs.appendFileSync(archPath, `\nLeaked key: ${SECRET}\n`, 'utf-8');

    const claudePath = path.join(root, 'CLAUDE.md');
    const claudeText = fs.readFileSync(claudePath, 'utf-8');
    const block = managedBlock.read(claudeText);
    assert.ok(block, 'expected a DEVFLOW block to already exist after scaffold');
    const withInsideSecret =
      claudeText.slice(0, block.start) +
      claudeText.slice(block.start, block.end).replace('<!-- DEVFLOW:END -->', `Inside note: ${SECRET}\n<!-- DEVFLOW:END -->`) +
      claudeText.slice(block.end) +
      `\n\nOutside note (kept verbatim): ${SECRET}\n`;
    fs.writeFileSync(claudePath, withInsideSecret, 'utf-8');

    const result = runAdopt(root, 'report');
    assert.strictEqual(result.status, 0, result.out);
    assert.strictEqual(result.report.redactions, 2);

    const archAfter = fs.readFileSync(archPath, 'utf-8');
    assert.ok(!archAfter.includes(SECRET));
    assert.ok(archAfter.includes('[REDACTED]'));

    const claudeAfter = fs.readFileSync(claudePath, 'utf-8');
    assert.ok(claudeAfter.includes(`Outside note (kept verbatim): ${SECRET}`), 'text outside the block must be byte-identical');
    const blockAfter = managedBlock.read(claudeAfter);
    assert.ok(!blockAfter.content.includes(SECRET));
    assert.ok(blockAfter.content.includes('[REDACTED]'));

    const reportText = readReport(root);
    assert.ok(!reportText.includes(SECRET), 'the report itself must never quote the secret');
    const secretRows = result.report.needs_review.filter((r) => r.confidence === 'priority' && r.evidence.includes('aws-access-key'));
    assert.strictEqual(secretRows.length, 2, 'expected two aws-access-key priority rows (file + line, never the key)');
    for (const r of secretRows) assert.ok(!r.evidence.includes(SECRET) && !r.item.includes(SECRET) && !r.inferred.includes(SECRET));
  });

  test('9. a fixture in a scratch/tmp location gets a row noting it', () => {
    const root = scaffoldedFixture('go-service');
    const expectedScratch = isScratchDir(root, { userHome: fakeHome });

    const result = runAdopt(root, 'report');
    assert.strictEqual(result.status, 0, result.out);
    const hasScratchRow = result.report.needs_review.some((r) => r.item.toLowerCase().includes('scratch'));
    assert.strictEqual(hasScratchRow, expectedScratch, 'scratch row presence must match isScratchDir(root)');
  });

  test('10. a validate-health warning appears with its W-code', () => {
    const root = scaffoldedFixture('flutter-app');
    const projectMdPath = path.join(root, '.planning', 'PROJECT.md');
    let text = fs.readFileSync(projectMdPath, 'utf-8');
    text = text.replace(/## Core Value\n\n[^\n]*\n\n/, '');
    fs.writeFileSync(projectMdPath, text, 'utf-8');

    const result = runAdopt(root, 'report');
    assert.strictEqual(result.status, 0, result.out);
    assert.ok(
      result.report.needs_review.some((r) => r.item.includes('W001')),
      'expected a row naming the W001 warning code'
    );
  });

  test('11. inference file is consumed into the marker and deleted; a re-run renders a byte-identical report', () => {
    const root = scaffoldedFixture('node-cli', {
      inferences: [
        { field: 'default_work', value: 'feature', confidence: 'low', evidence: 'no history' },
      ],
    });
    const inferencesPath = path.join(root, '.planning', '.adopt-inferences.json');
    assert.ok(fs.existsSync(inferencesPath));

    const first = runAdopt(root, 'report');
    assert.strictEqual(first.status, 0, first.out);
    assert.ok(!fs.existsSync(inferencesPath), 'inference file must be deleted after the run');
    const markerAfterFirst = readMarkerFile(root);
    assert.ok(Array.isArray(markerAfterFirst.inferences) && markerAfterFirst.inferences.length === 1);
    const firstText = readReport(root);

    const second = runAdopt(root, 'report');
    assert.strictEqual(second.status, 0, second.out);
    const secondText = readReport(root);
    assert.strictEqual(secondText, firstText, 'a re-run must render a byte-identical report');
  });

  test('12. commit_files is sorted, includes owned .planning files + CLAUDE.md, excludes transient files', () => {
    const root = scaffoldedFixture('go-service');
    fs.writeFileSync(path.join(root, '.planning', '.skill-active'), '{}', 'utf-8');

    const result = runAdopt(root, 'report');
    assert.strictEqual(result.status, 0, result.out);
    const files = result.report.commit_files;
    assert.deepStrictEqual(files, [...files].sort(), 'commit_files must be sorted');

    const expectedIncluded = [
      '.planning/ADOPT-REPORT.md', '.planning/PROJECT.md', '.planning/STATE.md',
      '.planning/ROADMAP.md', '.planning/STACK.md', '.planning/config.json', '.planning/state.json',
      'CLAUDE.md',
      '.planning/codebase/STACK.md', '.planning/codebase/INTEGRATIONS.md', '.planning/codebase/ARCHITECTURE.md',
      '.planning/codebase/STRUCTURE.md', '.planning/codebase/CONVENTIONS.md', '.planning/codebase/TESTING.md',
      '.planning/codebase/PATTERNS.md', '.planning/codebase/CONCERNS.md',
    ];
    for (const f of expectedIncluded) assert.ok(files.includes(f), `expected commit_files to include ${f}`);
    assert.ok(!files.includes('.planning/.skill-active'), 'commit_files must exclude .skill-active');
    assert.ok(!files.includes('.planning/.adopt-inferences.json'), 'commit_files must exclude the (deleted) inference file');
  });

  test('13. commit_message names the checkout plugin version', () => {
    const root = scaffoldedFixture('go-service');
    const pluginJson = JSON.parse(fs.readFileSync(PLUGIN_JSON_PATH, 'utf-8'));
    const result = runAdopt(root, 'report');
    assert.strictEqual(result.status, 0, result.out);
    assert.strictEqual(result.report.commit_message, `chore(devflow): adopt repository (DevFlow v${pluginJson.version})`);
  });

  test('14. guards: on main (never begun) exits 3; resume-but-not-scaffolded exits 1', () => {
    const rootMain = makeFixture('go-service', { parent: mkdtemp('df-report-guard-main-'), home: fakeHome });
    const onMain = runAdopt(rootMain, 'report');
    assert.strictEqual(onMain.status, 3, onMain.out);

    const rootBegun = readyFixture('go-service'); // begin() ran, but scaffold never did
    const notScaffolded = runAdopt(rootBegun, 'report');
    assert.strictEqual(notScaffolded.status, 1, notScaffolded.out);
    assert.match(notScaffolded.stderr, /run adopt scaffold first/);
  });
});
