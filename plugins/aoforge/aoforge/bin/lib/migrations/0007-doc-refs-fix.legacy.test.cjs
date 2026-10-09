'use strict';

// Test list (TRD 72-13, objective 72-install-and-naming-cleanup, INST-01/INST-04): migration 0007 fixes the legacy
// command forms in a project. 0007 itself is unchanged; the new forms reach it through doc-refs.rewriteText.
//
// 10. A `.aoforge/` project whose CLAUDE.md AOFORGE block holds `/devflow:quick`, `/devflow:progress` and the removed
//     `/devflow:update`, and whose STATE.md names `/df:quick` above the Session Log and `/devflow:quick` inside it:
//     after `upgrade.apply --only 0007` the block reads `/aoforge:quick` and `/aoforge:status`, the removed command is
//     left as written (and reported in removed_left), the prose outside the block is byte-identical, STATE.md above
//     the log is rewritten, the Session Log keeps its line byte for byte (0007 appends its one note after it), and
//     `changed_files` lists CLAUDE.md and the STATE.md path. A second detect finds nothing to do.
// 10b. The same project on the legacy planning layout: STATE.md is fixed where it is, and `changed_files` names the
//     legacy path.
//
// Hand-built fixtures: __fixtures__/legacy-command-fixtures.cjs (legacyCommandProject). Nothing touches the real
// home directory: every home is the fixture's temp directory.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const upgrade = require('../upgrade.cjs');
const managedBlock = require('../managed-block.cjs');
const { legacyCommandProject } = require('../__fixtures__/legacy-command-fixtures.cjs');

const PLUGIN_VERSION = '2.11.0';
const LOG_NOTE_RE = /^- \d{4}-\d{2}-\d{2}: upgrade 0007 updated 1 command reference\(s\) to current \/aoforge: names$/;

const cleanup = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()();
});

function project(opts) {
  const p = legacyCommandProject(opts);
  cleanup.push(p.cleanup);
  return p;
}

function m0007() {
  return require('./0007-doc-refs-fix.cjs');
}

/** Run only 0007 through the real upgrade runner, the way `aof-tools upgrade --apply --only 0007` does. */
function applyOnly0007(p) {
  return upgrade.apply({ projectRoot: p.root, userHome: p.home, pluginVersion: PLUGIN_VERSION, only: ['0007'] });
}

function expectFixed(p, report) {
  assert.equal(report.failed.length, 0, JSON.stringify(report.failed));
  assert.ok(report.applied.some((a) => a.id === '0007'), `0007 must apply: ${JSON.stringify(report)}`);
  assert.ok(report.changed_files.includes('CLAUDE.md'), `changed_files: ${JSON.stringify(report.changed_files)}`);
  assert.ok(report.changed_files.includes(p.stateRel), `changed_files: ${JSON.stringify(report.changed_files)}`);

  // CLAUDE.md: the block is rewritten, the removed command and every byte outside the block are not.
  const claude = fs.readFileSync(p.claudePath, 'utf-8');
  const expectedBody = p.parts.blockBody
    .replace('- Small task: /devflow:quick', '- Small task: /aoforge:quick')
    .replace('- Where am I: /devflow:progress', '- Where am I: /aoforge:status');
  assert.equal(claude, p.parts.claudeBefore + managedBlock.render(expectedBody, { v: '2', src: 'claude-md' }) + p.parts.claudeAfter);
  assert.ok(claude.includes('- Never: /devflow:update'), 'a removed command is left as written');
  assert.ok(claude.startsWith('# Project notes\n\nOur own habit, kept as written: /devflow:quick'), 'prose outside the block untouched');

  // STATE.md: rewritten above the Session Log; the log line is byte-identical and 0007 adds one note after it.
  const state = fs.readFileSync(p.statePath, 'utf-8');
  const fixedBefore = p.parts.stateBeforeLog.replace('Next: run /df:quick', 'Next: run /aoforge:quick');
  assert.ok(state.startsWith(fixedBefore + p.parts.stateLog), `STATE.md:\n${state}`);
  const tail = state.slice((fixedBefore + p.parts.stateLog).length).split('\n').filter(Boolean);
  assert.equal(tail.length, 1, `exactly one appended log note, got ${JSON.stringify(tail)}`);
  assert.match(tail[0], LOG_NOTE_RE);
  assert.ok(state.includes('- 2026-10-01: ran /devflow:quick for the first fix\n'), 'Session Log line byte-identical');

  const notes = report.applied.find((a) => a.id === '0007').notes || {};
  if (notes.removed_left) assert.ok(notes.removed_left.includes('update'), JSON.stringify(notes));
}

describe('migration 0007 and the legacy command forms (TRD 72-13)', () => {
  test('10. block and pre-log STATE.md rewritten, removed command and Session Log kept, changed_files lists both', () => {
    const p = project();
    const report = applyOnly0007(p);
    expectFixed(p, report);

    const ctx = { projectRoot: p.root, userHome: p.home, pluginVersion: PLUGIN_VERSION, dryRun: true, options: {} };
    const again = m0007().detect(ctx);
    assert.equal(again.applies, false, again.reason);

    // Called directly, the migration reports the removed command it left in place.
    const direct = legacyCommandProject();
    cleanup.push(direct.cleanup);
    const res = m0007().apply({ projectRoot: direct.root, userHome: direct.home, pluginVersion: PLUGIN_VERSION, dryRun: false, options: {} });
    assert.deepEqual(res.changed.sort(), ['CLAUDE.md', direct.stateRel].sort());
    assert.ok(res.notes.removed_left.includes('update'), JSON.stringify(res.notes));
  });

  test('10b. the legacy planning layout: STATE.md is fixed in place and changed_files names its legacy path', () => {
    const p = project({ layout: 'legacy' });
    assert.ok(!p.stateRel.startsWith('.aoforge/'), p.stateRel);
    const report = applyOnly0007(p);
    expectFixed(p, report);
    assert.ok(!fs.existsSync(path.join(p.root, '.aoforge', 'STATE.md')), 'no second planning directory');
  });
});
