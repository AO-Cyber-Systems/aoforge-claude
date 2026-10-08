'use strict';

// adopt-report.test.cjs — `aof-tools adopt report` (objective 37, TRD 08, ADP-03).
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
// 13. commit_message === `chore(aoforge): adopt repository (AOForge v<checkout plugin version>)`.
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

const TOOLS_PATH = path.join(__dirname, '..', 'aof-tools.cjs');
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

/**
 * cellsOf(row) -> the trimmed cells of one markdown table row, split on pipes that are NOT
 * escaped. On a backslash the next character is skipped (it is escaped); on a pipe a cell closes.
 * The empty leading and trailing cells (the row's outer pipes) are dropped.
 */
function cellsOf(row) {
  const cells = [];
  let current = '';
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '\\' && i + 1 < row.length) {
      current += ch + row[i + 1];
      i += 1;
    } else if (ch === '|') {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.slice(1, -1).map((c) => c.trim());
}

/** The first table row (a line starting with a pipe) that contains `needle`. */
function rowWith(text, needle) {
  const line = text.split('\n').find((l) => l.startsWith('|') && l.includes(needle));
  assert.ok(line, `no table row contains ${JSON.stringify(needle)}:\n${text}`);
  return line;
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

  // TRD 42-07 test 17: one low row per draft note; the missing-evidence rows only for keys that
  // are neither resolved nor inherited (and have no evidence at all).
  test('17. draft notes become low rows; resolved and inherited keys get no missing-evidence row', () => {
    const root = scaffoldedFixture('go-service');
    const marker = readMarkerFile(root);
    marker.scaffold.stack = {
      action: 'written',
      ok: true,
      errors: [],
      evidence_keys: ['test'],
      resolved_keys: ['lint'],
      inherited_keys: [],
      notes: [
        { area: '', key: 'test', candidate: 'ginkgo -r -p', status: 'binary_missing', detail: 'ginkgo not found on PATH', source: 'ci' },
        { area: 'portal/', key: null, candidate: null, status: 'info', detail: 'unsupported area (node)', source: null },
      ],
    };
    adopt.writeMarker(root, gitEnv(fakeHome), marker);

    const result = runAdopt(root, 'report');
    assert.strictEqual(result.status, 0, result.out);
    const rows = result.report.needs_review;
    const noteRow = rows.find((r) => r.item === 'test: ginkgo -r -p — binary_missing');
    assert.ok(noteRow, JSON.stringify(rows));
    assert.strictEqual(noteRow.confidence, 'low');
    assert.ok(rows.some((r) => r.confidence === 'low' && r.item === 'stack: unsupported area (node) — info'), JSON.stringify(rows));
    assert.ok(!rows.some((r) => r.item === "no command evidence for 'lint'"), 'lint is resolved');
    assert.ok(!rows.some((r) => r.item === "no command evidence for 'test'"), 'test has evidence (and a note)');
    assert.ok(rows.some((r) => r.item === "no command evidence for 'build'"), 'build: no evidence, not resolved, not inherited');

    // Inherited keys are covered too.
    marker.scaffold.stack.inherited_keys = ['build'];
    adopt.writeMarker(root, gitEnv(fakeHome), marker);
    fs.rmSync(path.join(root, '.planning', 'ADOPT-REPORT.md'), { force: true });
    const again = runAdopt(root, 'report');
    assert.strictEqual(again.status, 0, again.out);
    assert.ok(!again.report.needs_review.some((r) => r.item === "no command evidence for 'build'"), JSON.stringify(again.report.needs_review));
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
    assert.ok(block, 'expected an AOFORGE block to already exist after scaffold');
    const withInsideSecret =
      claudeText.slice(0, block.start) +
      claudeText.slice(block.start, block.end).replace('<!-- AOFORGE:END -->', `Inside note: ${SECRET}\n<!-- AOFORGE:END -->`) +
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
    // `adopt report` runs as a spawned CLI with `--cwd <root>`, which chdir's before dispatch;
    // process.cwd() then returns the OS's physical (symlink-resolved) path, so match production's
    // view of the target rather than the logical mkdtemp path (macOS: /var -> /private/var).
    const physicalRoot = fs.realpathSync(root);
    const expectedScratch = isScratchDir(physicalRoot, { userHome: fakeHome });

    const result = runAdopt(root, 'report');
    assert.strictEqual(result.status, 0, result.out);
    const hasScratchRow = result.report.needs_review.some((r) => r.item.toLowerCase().includes('scratch'));
    assert.strictEqual(hasScratchRow, expectedScratch, 'scratch row presence must match isScratchDir(realpath(root))');
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
    assert.strictEqual(result.report.commit_message, `chore(aoforge): adopt repository (AOForge v${pluginJson.version})`);
  });

  // TRD 42-08 test 13: the stack report is written when absent (never overwritten), linked from
  // ADOPT-REPORT.md, and every `gap` finding becomes one medium row.
  test('42-08/13. writes STACK-REPORT.md when absent, never overwrites it, links it, and adds one medium row per gap', () => {
    const root = scaffoldedFixture('go-service');
    const stackReportPath = path.join(root, '.planning', 'STACK-REPORT.md');
    assert.ok(!fs.existsSync(stackReportPath), 'scaffold does not write the stack report');

    const result = runAdopt(root, 'report');
    assert.strictEqual(result.status, 0, result.out);
    assert.ok(fs.existsSync(stackReportPath), 'STACK-REPORT.md written');
    const written = fs.readFileSync(stackReportPath, 'utf-8');
    assert.match(written, /^---\ngenerated: /);
    assert.match(written, /^# Stack Report: /m);

    const text = readReport(root);
    assert.ok(text.includes('See .planning/STACK-REPORT.md for CI/CD and local-testing recommendations (proposals only).'), text);

    const { buildReport } = require('./stack-report.cjs');
    const gaps = buildReport({ projectRoot: root, userHome: fakeHome }).findings.filter((f) => f.severity === 'gap');
    assert.ok(gaps.length > 0, 'the go-service fixture has at least one CI gap');
    const gapRows = result.report.needs_review.filter((r) => r.evidence === 'STACK-REPORT.md');
    assert.strictEqual(gapRows.length, gaps.length, JSON.stringify(gapRows));
    for (const r of gapRows) assert.strictEqual(r.confidence, 'medium');
    for (const g of gaps) assert.ok(gapRows.some((r) => r.item.startsWith(`${g.id}: `)), `missing a row for ${g.id}`);
    assert.ok(result.report.commit_files.includes('.planning/STACK-REPORT.md'), 'owned path, so adopt commits it');

    // Present: never overwritten; the rows still come from a fresh computation.
    fs.writeFileSync(stackReportPath, 'hand-edited stack report\n', 'utf-8');
    const again = runAdopt(root, 'report');
    assert.strictEqual(again.status, 0, again.out);
    assert.strictEqual(fs.readFileSync(stackReportPath, 'utf-8'), 'hand-edited stack report\n');
    assert.strictEqual(again.report.needs_review.filter((r) => r.evidence === 'STACK-REPORT.md').length, gaps.length);
  });

  // TRD 54-08 (CodeQL js/incomplete-sanitization): every table cell is escaped once, at render,
  // backslash first, so no value can add or remove a column.
  test('54-08/1. an inference with a pipe and a trailing backslash renders as exactly five cells', () => {
    const root = scaffoldedFixture('go-service', {
      inferences: [{ field: 'kind', value: 'api|cli', confidence: 'low', evidence: 'C:\\tmp\\' }],
    });
    const result = runAdopt(root, 'report');
    assert.strictEqual(result.status, 0, result.out);

    const text = readReport(root);
    const cells = cellsOf(rowWith(text, '| kind |'));
    assert.strictEqual(cells.length, 5, JSON.stringify(cells));
    assert.strictEqual(cells[2], 'api\\|cli');
    assert.strictEqual(cells[4], 'C:\\\\tmp\\\\');

    // The JSON payload keeps the raw values; only the markdown is escaped.
    const row = result.report.needs_review.find((r) => r.item === 'kind');
    assert.strictEqual(row.inferred, 'api|cli');
    assert.strictEqual(row.evidence, 'C:\\tmp\\');
  });

  test('54-08/2. the malformed-confidence row ("expected confidence: high|medium|low") is exactly five cells', () => {
    const root = scaffoldedFixture('go-service', {
      inferences: [{ field: 'default_work', value: 'feature', confidence: 'maybe', evidence: 'ambiguous' }],
    });
    const result = runAdopt(root, 'report');
    assert.strictEqual(result.status, 0, result.out);

    const cells = cellsOf(rowWith(readReport(root), 'malformed inference'));
    assert.strictEqual(cells.length, 5, JSON.stringify(cells));
    assert.strictEqual(cells[4], 'expected confidence: high\\|medium\\|low');
  });

  test('54-08/3. a stack draft note ending in backslash-pipe renders as exactly five cells', () => {
    const root = scaffoldedFixture('go-service');
    const marker = readMarkerFile(root);
    marker.scaffold.stack = {
      action: 'written',
      ok: true,
      errors: [],
      evidence_keys: ['test'],
      resolved_keys: ['lint', 'build'],
      inherited_keys: [],
      notes: [{ area: '', key: 'test', candidate: 'go test ./...', status: 'note', detail: 'path C:\\x\\| y', source: 'ci' }],
    };
    adopt.writeMarker(root, gitEnv(fakeHome), marker);

    const result = runAdopt(root, 'report');
    assert.strictEqual(result.status, 0, result.out);

    const cells = cellsOf(rowWith(readReport(root), 'test: go test ./... — note'));
    assert.strictEqual(cells.length, 5, JSON.stringify(cells));
    // backslash doubled, then the pipe escaped: no bare pipe survives inside the Evidence cell
    assert.strictEqual(cells[4], 'path C:\\\\x\\\\\\| y');
    assert.strictEqual(result.report.needs_review.find((r) => r.item === 'test: go test ./... — note').evidence, 'path C:\\x\\| y');
  });

  test('54-08/4. a high-confidence value with a pipe is exactly three cells, under a three-column delimiter', () => {
    const root = scaffoldedFixture('go-service', {
      inferences: [{ field: 'framework', value: 'a|b', confidence: 'high', evidence: 'go.mod' }],
    });
    const result = runAdopt(root, 'report');
    assert.strictEqual(result.status, 0, result.out);

    const text = readReport(root);
    const cells = cellsOf(rowWith(text, '| framework |'));
    assert.strictEqual(cells.length, 3, JSON.stringify(cells));
    assert.strictEqual(cells[1], 'a\\|b');

    const lines = text.split('\n');
    const header = lines.indexOf('| Item | Value | Evidence |');
    assert.ok(header >= 0, 'high-confidence table header present');
    assert.strictEqual(lines[header + 1], '|---|---|---|');
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
