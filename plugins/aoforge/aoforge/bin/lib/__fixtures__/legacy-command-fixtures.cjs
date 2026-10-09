'use strict';

/**
 * legacy-command-fixtures.cjs (objective 72, TRD 72-13) — text and a project that carry the legacy command forms
 * (the `/devflow:` and `/df:` colon forms and the `/df-` dash form), for the doc-refs resolver, the repo gate and
 * migration 0007.
 *
 *   const t = legacyCommandText();    // the hand-typed sample strings of doc-refs.legacy.test.cjs (tests 4, 5)
 *                                     // and doc-refs.repo.test.cjs (test 15, the sensitivity sample)
 *   const p = legacyCommandProject(); // a `.aoforge/` project: CLAUDE.md with an AOFORGE block of legacy
 *   p.root; p.claudePath; p.cleanup(); // command forms, STATE.md with legacy forms above and inside its Session Log
 *
 * Every string below is typed out, never built from legacy-names.cjs: a mistake in the name map must not be able
 * to hide inside the fixture that tests it. Legacy names may be spelled here: this is one of the
 * `__fixtures__/legacy-*` files the rename codemod and the rename guard leave alone.
 */

const fs = require('fs');
const path = require('path');

const managedBlock = require('../managed-block.cjs');
const { planningProject } = require('./legacy-layout-fixtures.cjs');

// ─── text ─────────────────────────────────────────────────────────────────────

const TEXT = Object.freeze({
  // Test 4: one dash-form finding (`/df-quick`, prefix at column 1). `/df-tools.cjs` names a file whose stem is not a
  // command, and `~/bin/df-plan` is a path (the slash follows an identifier), so neither is a finding.
  dashMix: '/df-quick and /df-tools.cjs and ~/bin/df-plan',
  dashMixFindingCol: 1,
  // Test 4: a dash form of a renamed command, and one of a name that is no command at all.
  dashRenamed: '/df-progress',
  dashUnknown: '/df-nope',
  // Test 5: every legacy form in one line; the removed command stays exactly as written.
  rewriteInput: '/devflow:quick /df:health /df-quick /devflow:update',
  rewriteOutput: '/aoforge:quick /aoforge:status check /aoforge:quick /devflow:update',
  // Repo gate test 15 (objective 38's sensitivity sample, extended with the legacy namespaces). `status` is a live
  // skill, so it resolves to ok and is filtered out of the findings.
  sensitivity: '/df:quick /devflow:health /aoforge:update /aoforge:nope /aoforge:status /devflow:quick',
  sensitivityKinds: Object.freeze(['prefix', 'renamed', 'removed', 'unknown', 'prefix']),
});

/** The hand-typed sample strings (a frozen object; see TEXT above). */
function legacyCommandText() {
  return TEXT;
}

// ─── project ──────────────────────────────────────────────────────────────────

const BLOCK_META = Object.freeze({ v: '2', src: 'claude-md' });

// Hand-written prose OUTSIDE the managed block. It names a legacy command too: 0007 must never touch it.
const CLAUDE_BEFORE = '# Project notes\n\nOur own habit, kept as written: /devflow:quick for small fixes.\n\n';
const CLAUDE_AFTER = '\n\n## After\n\nMore hand-written prose.\n';

// The managed block body: two legacy forms 0007 rewrites and one removed command it leaves alone.
const BLOCK_BODY = [
  '',
  '## Commands',
  '',
  '- Small task: /devflow:quick',
  '- Where am I: /devflow:progress',
  '- Never: /devflow:update',
].join('\n');

const STATE_BEFORE_LOG = [
  '# Project State',
  '',
  '## Current Position',
  '',
  '**Status:** Ready to execute',
  'Next: run /df:quick for the hotfix.',
  '',
  '',
].join('\n');

const STATE_LOG = '## Session Log\n\n- 2026-10-01: ran /devflow:quick for the first fix\n';

/**
 * A temp project (legacy-layout-fixtures' planningProject, layout `aoforge` by default, no git) whose CLAUDE.md
 * holds an AOFORGE managed block of legacy command forms and whose STATE.md names one above its Session Log and one
 * inside it.
 *
 * @param {object} [opts]
 * @param {'aoforge'|'legacy'} [opts.layout='aoforge']
 * @returns {{ root: string, home: string, dir: string, layout: string,
 *             claudePath: string, statePath: string, stateRel: string,
 *             claudeText: string, stateText: string,
 *             parts: { claudeBefore: string, claudeAfter: string, blockBody: string,
 *                      stateBeforeLog: string, stateLog: string },
 *             cleanup: function(): void }}
 */
function legacyCommandProject({ layout = 'aoforge' } = {}) {
  if (layout !== 'aoforge' && layout !== 'legacy') {
    throw new Error(`legacyCommandProject: unknown layout ${JSON.stringify(layout)} (expected aoforge or legacy)`);
  }
  const stateText = STATE_BEFORE_LOG + STATE_LOG;
  const p = planningProject({ layout, git: false, files: { 'STATE.md': stateText } });

  const claudeText = CLAUDE_BEFORE + managedBlock.render(BLOCK_BODY, BLOCK_META) + CLAUDE_AFTER;
  const claudePath = path.join(p.root, 'CLAUDE.md');
  fs.writeFileSync(claudePath, claudeText);

  const statePath = path.join(p.dir, 'STATE.md');
  return {
    root: p.root,
    home: p.home,
    dir: p.dir,
    layout,
    claudePath,
    statePath,
    stateRel: path.relative(p.root, statePath).split(path.sep).join('/'),
    claudeText,
    stateText,
    parts: Object.freeze({
      claudeBefore: CLAUDE_BEFORE,
      claudeAfter: CLAUDE_AFTER,
      blockBody: BLOCK_BODY,
      stateBeforeLog: STATE_BEFORE_LOG,
      stateLog: STATE_LOG,
    }),
    cleanup: p.cleanup,
  };
}

module.exports = { legacyCommandText, legacyCommandProject };
