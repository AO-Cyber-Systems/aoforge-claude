'use strict';

// ─── Tests: templates.cjs — cmdTemplateSelect (Phase I4 canonicalized) ────────
//
// After TRD 12-06, cmdTemplateSelect ALWAYS returns 'templates/summary.md'.
// The heuristic-based minimal/standard/complex selection has been removed.
//
// Groups:
//   TS — cmdTemplateSelect canonicalized to single path
//   EX — export-lock

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { cmdTemplateSelect } = require('./templates.cjs');
const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

// ─── Helper: create a temp dir with a minimal TRD file ───────────────────────

function mkTmpWithTrd(content = '') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-templates-'));
  const trdPath = path.join(tmpDir, 'test-trd.md');
  fs.writeFileSync(trdPath, content || '# Test TRD\n', 'utf-8');
  return { tmpDir, trdPath: 'test-trd.md' };
}

// ─── Group TS: cmdTemplateSelect always returns canonical path ────────────────

test('TS1: small TRD (no tasks, no decisions, few files) → canonical template/summary.md', () => {
  const { tmpDir, trdPath } = mkTmpWithTrd('# Small TRD\nJust a tiny job.\n');

  // No --raw: output() emits full JSON object
  const r = spawnSync('node', [DF_TOOLS, 'template', 'select', trdPath], {
    encoding: 'utf-8',
    cwd: tmpDir,
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });

  assert.strictEqual(r.status, 0, `exit 0; stderr: ${r.stderr}`);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.template, 'templates/summary.md', 'canonical path returned for small TRD');
  // canonicalized_by field should be present
  assert.strictEqual(parsed.canonicalized_by, 'TRD 12-06', 'canonicalized_by marker present');
});

test('TS2: large TRD with decisions + many files → still returns templates/summary.md (no longer complex)', () => {
  const largeContent = [
    '# Large TRD',
    '### Task 1', '### Task 2', '### Task 3', '### Task 4', '### Task 5', '### Task 6',
    'decision decision decision decision decision',
    '`src/api/auth.ts`', '`src/api/users.ts`', '`src/api/orgs.ts`',
    '`src/lib/db.ts`', '`src/lib/cache.ts`', '`src/lib/mailer.ts`',
    '`src/lib/queue.ts`', '`src/lib/worker.ts`',
  ].join('\n');
  const { tmpDir, trdPath } = mkTmpWithTrd(largeContent);

  const r = spawnSync('node', [DF_TOOLS, 'template', 'select', trdPath], {
    encoding: 'utf-8',
    cwd: tmpDir,
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });

  assert.strictEqual(r.status, 0, `exit 0; stderr: ${r.stderr}`);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.template, 'templates/summary.md', 'canonical path — no complex variant anymore');
  assert.strictEqual(parsed.canonicalized_by, 'TRD 12-06');
});

test('TS3: missing TRD file → falls back to templates/summary.md with error field', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-templates-miss-'));

  const r = spawnSync('node', [DF_TOOLS, 'template', 'select', 'nonexistent-trd.md'], {
    encoding: 'utf-8',
    cwd: tmpDir,
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });

  // Exit 0 (fallback, not crash)
  assert.strictEqual(r.status, 0, `expected exit 0 with canonical fallback; stderr: ${r.stderr}`);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.template, 'templates/summary.md', 'fallback is canonical path');
  assert.ok(parsed.error, 'error field present for missing file');
});

test('TS4: type field is always "standard" for backward compat', () => {
  const { tmpDir, trdPath } = mkTmpWithTrd('# A TRD\n');

  const r = spawnSync('node', [DF_TOOLS, 'template', 'select', trdPath], {
    encoding: 'utf-8',
    cwd: tmpDir,
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });

  assert.strictEqual(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.type, 'standard', 'type field is "standard" for back-compat');
});

// ─── Group EX: export-lock ────────────────────────────────────────────────────

test('EX1: templates.cjs exports cmdTemplateSelect and cmdTemplateFill', () => {
  const mod = require('./templates.cjs');
  const keys = Object.keys(mod).sort();
  assert.ok(keys.includes('cmdTemplateSelect'), 'cmdTemplateSelect exported');
  assert.ok(keys.includes('cmdTemplateFill'), 'cmdTemplateFill exported');
  assert.strictEqual(keys.length, 2, 'exactly 2 exports');
});

// ─── TRD 48-14: template fill in local mode (characterization) and store mode ─

const strict = require('node:assert/strict');
const { storeCliProject } = require('./__fixtures__/store-cli-fixtures.cjs');

const TF_SUMMARY_REL = 'objectives/07-store-demo/07-02-SUMMARY.md';

function withTfProject(opts, fn) {
  const p = storeCliProject(opts);
  try {
    return fn(p);
  } finally {
    p.cleanup();
  }
}

/** Today's `template fill summary --objective 7 --job 02` output for the store fixture, byte for byte. */
const expectedSummary = (today) => [
  '---',
  'objective: 07-store-demo',
  'job: 02',
  'subsystem: "[primary category]"',
  'tags: []',
  'provides: []',
  'affects: []',
  'tech-stack:',
  '  added: []',
  '  patterns: []',
  'key-files:',
  '  created: []',
  '  modified: []',
  'key-decisions: []',
  'patterns-established: []',
  'duration: "[X]min"',
  `completed: ${today}`,
  '---',
  '',
  '# Objective 7: store-demo Summary',
  '',
  '**[Substantive one-liner describing outcome]**',
  '',
  '## Performance',
  '- **Duration:** [time]',
  '- **Tasks:** [count completed]',
  '- **Files modified:** [count]',
  '',
  '## Accomplishments',
  '- [Key outcome 1]',
  '- [Key outcome 2]',
  '',
  '## Task Commits',
  '1. **Task 1: [task name]** - `hash`',
  '',
  '## Files Created/Modified',
  '- `path/to/file.ts` - What it does',
  '',
  '## Decisions & Deviations',
  '[Key decisions or "None - followed plan as specified"]',
  '',
  '## Next Objective Readiness',
  "[What's ready for next objective]",
  '',
].join('\n');

test('48-14 char 8: local template fill summary writes today\'s draft, exact bytes and output', () => {
  withTfProject({ store: false }, (p) => {
    const r = p.run(['template', 'fill', 'summary', '--objective', '7', '--job', '02']);
    strict.equal(r.status, 0, r.stderr);
    strict.equal(r.stdout, JSON.stringify({ created: true, path: `.planning/${TF_SUMMARY_REL}`, template: 'summary' }, null, 2));
    strict.equal(p.read(TF_SUMMARY_REL), expectedSummary(new Date().toISOString().split('T')[0]));
    strict.deepEqual(p.ghCalls(), []);
    strict.deepEqual(p.ledgerEntries(), {});
  });
});

test('48-14 store 9: template fill writes the draft into the cache, records it in the ledger, names summary post', () => {
  withTfProject({ store: true }, (p) => {
    const r = p.run(['template', 'fill', 'summary', '--objective', '7', '--job', '02']);
    strict.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    strict.equal(out.created, true);
    strict.equal(out.path, `.planning/${TF_SUMMARY_REL}`);
    strict.equal(out.publish_with, 'summary post');
    const text = p.read(TF_SUMMARY_REL);
    strict.equal(text, expectedSummary(new Date().toISOString().split('T')[0]));
    const entry = p.ledgerEntries()[TF_SUMMARY_REL];
    strict.ok(entry, 'the draft is in the verb-write ledger');
    strict.equal(entry.hash, require('./gh-trd.cjs').contentHash(text));
    // GitHub does not hold the draft yet: it is marked not queued, so no flush ever baselines it.
    strict.equal(entry.verb, 'template fill (not queued)');
    strict.deepEqual(p.ghCalls(), []);
    strict.deepEqual(p.journalOps(), []);
  });
});

test('48-14 store 9b: template fill verification names verification post', () => {
  withTfProject({ store: true }, (p) => {
    const r = p.run(['template', 'fill', 'verification', '--objective', '7']);
    strict.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    strict.equal(out.publish_with, 'verification post');
    strict.ok(p.ledgerEntries()['objectives/07-store-demo/07-VERIFICATION.md']);
  });
});
