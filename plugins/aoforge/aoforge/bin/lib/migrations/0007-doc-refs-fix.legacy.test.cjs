'use strict';

// Test list (TRD 78-02, objective 78-remove-the-rename-shims, SC-2; replaces the TRD 72-13 list): migration 0007 and
// the pre-rename command forms. 0007 itself is unchanged; since doc-refs reads only `/aoforge:<name>`, the legacy
// forms are no longer stale references, so 0007 leaves them exactly as written. Converting pre-rename text is
// AOForge 3.0.x's job.
//
// 10. A `.aoforge/` project whose CLAUDE.md AOFORGE block holds only legacy forms (`/devflow:quick`,
//     `/devflow:progress`, the removed `/devflow:update`) and whose STATE.md names `/df:quick` above the Session Log
//     and `/devflow:quick` inside it: 0007 detects nothing to do, `upgrade.apply --only 0007` does not apply it, and
//     CLAUDE.md and STATE.md are byte-identical.
// 11. The same project with one renamed `/aoforge:` command in the block (`/aoforge:health`) and one above the
//     Session Log (`/aoforge:progress`): 0007 applies, rewrites exactly those two to `/aoforge:status check` and
//     `/aoforge:status`, leaves every legacy form (inside and outside the block, above and inside the Session Log)
//     byte-identical, appends one log note, and `changed_files` lists CLAUDE.md and the STATE.md path. A second
//     detect finds nothing to do.
//
// Hand-built fixtures: __fixtures__/legacy-command-fixtures.cjs (legacyCommandProject). Nothing touches the real
// home directory: every home is the fixture's temp directory.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

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

function detectCtx(p) {
  return { projectRoot: p.root, userHome: p.home, pluginVersion: PLUGIN_VERSION, dryRun: true, options: {} };
}

/** Run only 0007 through the real upgrade runner, the way `aof-tools upgrade --apply --only 0007` does. */
function applyOnly0007(p) {
  return upgrade.apply({ projectRoot: p.root, userHome: p.home, pluginVersion: PLUGIN_VERSION, only: ['0007'] });
}

describe('migration 0007 leaves the pre-rename command forms alone (TRD 78-02)', () => {
  test('10. only legacy forms: 0007 does not apply and both files are byte-identical', () => {
    const p = project();
    const detected = m0007().detect(detectCtx(p));
    assert.equal(detected.applies, false, `0007 must not apply to legacy forms alone: ${detected.reason}`);

    const report = applyOnly0007(p);
    assert.equal(report.failed.length, 0, JSON.stringify(report.failed));
    assert.ok(!report.applied.some((a) => a.id === '0007'), `0007 must not apply: ${JSON.stringify(report.applied)}`);
    assert.equal(fs.readFileSync(p.claudePath, 'utf-8'), p.claudeText, 'CLAUDE.md byte-identical');
    assert.equal(fs.readFileSync(p.statePath, 'utf-8'), p.stateText, 'STATE.md byte-identical');
  });

  test('11. a renamed /aoforge: command beside them: only it is rewritten; every legacy form is kept', () => {
    const p = project({ withCurrent: true });
    const report = applyOnly0007(p);
    assert.equal(report.failed.length, 0, JSON.stringify(report.failed));
    assert.ok(report.applied.some((a) => a.id === '0007'), `0007 must apply: ${JSON.stringify(report)}`);
    assert.ok(report.changed_files.includes('CLAUDE.md'), `changed_files: ${JSON.stringify(report.changed_files)}`);
    assert.ok(report.changed_files.includes(p.stateRel), `changed_files: ${JSON.stringify(report.changed_files)}`);

    // CLAUDE.md: only the renamed /aoforge: command in the block changes; the legacy forms and the prose do not.
    const claude = fs.readFileSync(p.claudePath, 'utf-8');
    const expectedBody = p.parts.blockBody.replace('- Health: /aoforge:health', '- Health: /aoforge:status check');
    assert.equal(claude, p.parts.claudeBefore + managedBlock.render(expectedBody, { v: '2', src: 'claude-md' }) + p.parts.claudeAfter);
    for (const kept of ['- Small task: /devflow:quick', '- Where am I: /devflow:progress', '- Never: /devflow:update']) {
      assert.ok(claude.includes(kept), `legacy form kept as written: ${kept}`);
    }

    // STATE.md: above the log only the /aoforge: command changes; the log keeps its line; 0007 adds one note.
    const state = fs.readFileSync(p.statePath, 'utf-8');
    const fixedBefore = p.parts.stateBeforeLog.replace('Then: /aoforge:progress', 'Then: /aoforge:status');
    assert.ok(fixedBefore.includes('Next: run /df:quick for the hotfix.'), 'legacy form above the log kept');
    assert.ok(state.startsWith(fixedBefore + p.parts.stateLog), `STATE.md:\n${state}`);
    const tail = state.slice((fixedBefore + p.parts.stateLog).length).split('\n').filter(Boolean);
    assert.equal(tail.length, 1, `exactly one appended log note, got ${JSON.stringify(tail)}`);
    assert.match(tail[0], LOG_NOTE_RE);

    const again = m0007().detect(detectCtx(p));
    assert.equal(again.applies, false, again.reason);
  });
});
