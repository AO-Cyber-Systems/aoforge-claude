'use strict';

/**
 * legacy-command-fixtures.cjs (objective 72, TRD 72-13; trimmed by TRD 78-02) — text and a project that carry the
 * pre-rename command forms (the `/devflow:` and `/df:` colon forms and the `/df-` dash form). Since TRD 78-02 these
 * are no longer command references: doc-refs reads only `/aoforge:<name>`, so the resolver, the repo gate and
 * migration 0007 must all leave them exactly as written.
 *
 *   const t = legacyCommandText();    // the hand-typed sample strings of doc-refs.legacy.test.cjs and
 *                                     // doc-refs.repo.test.cjs (test 15)
 *   const p = legacyCommandProject(); // a `.aoforge/` project: CLAUDE.md with an AOFORGE block of legacy
 *   p.root; p.claudePath; p.cleanup(); // command forms, STATE.md with legacy forms above and inside its Session Log
 *   legacyCommandProject({ withCurrent: true }) // the same, plus one renamed `/aoforge:` command in the block and one
 *                                     // above the Session Log (0007 still rewrites those)
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
  // One live command in each pre-rename form: the legacy plugin namespace, the short namespace and the dash form.
  legacyForms: Object.freeze(['/devflow:plan-objective', '/df:plan-objective', '/df-plan-objective']),
  // Every legacy form on one line, with a live, a renamed and a removed command name: no finding, no rewrite.
  legacyLine: '/devflow:quick /df:health /df-quick /devflow:update /df-progress /devflow:nope',
  // The control: the same kinds of name under the current namespace. With the live skills, `quick` is ok and the
  // rest are [renamed, removed, unknown].
  currentLine: '/aoforge:quick /aoforge:health /aoforge:update /aoforge:nope',
  currentKinds: Object.freeze(['renamed', 'removed', 'unknown']),
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

// The managed block body: legacy forms of a live, a renamed and a removed command (all left as written).
const BLOCK_LINES = ['', '## Commands', '', '- Small task: /devflow:quick', '- Where am I: /devflow:progress', '- Never: /devflow:update'];
// withCurrent: a renamed command under the current namespace, which 0007 rewrites to `/aoforge:status check`.
const BLOCK_CURRENT_LINE = '- Health: /aoforge:health';

const STATE_HEAD = ['# Project State', '', '## Current Position', '', '**Status:** Ready to execute', 'Next: run /df:quick for the hotfix.'];
// withCurrent: a renamed command under the current namespace, which 0007 rewrites to `/aoforge:status`.
const STATE_CURRENT_LINE = 'Then: /aoforge:progress';

const STATE_LOG = '## Session Log\n\n- 2026-10-01: ran /devflow:quick for the first fix\n';

/**
 * A temp project (legacy-layout-fixtures' planningProject on the `.aoforge/` layout, no git) whose CLAUDE.md holds an
 * AOFORGE managed block of legacy command forms and whose STATE.md names one above its Session Log and one inside it.
 * With `withCurrent`, the block and the text above the Session Log each also hold one renamed `/aoforge:` command.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.withCurrent=false]
 * @returns {{ root: string, home: string, dir: string,
 *             claudePath: string, statePath: string, stateRel: string,
 *             claudeText: string, stateText: string,
 *             parts: { claudeBefore: string, claudeAfter: string, blockBody: string,
 *                      stateBeforeLog: string, stateLog: string },
 *             cleanup: function(): void }}
 */
function legacyCommandProject({ withCurrent = false } = {}) {
  const blockBody = (withCurrent ? [...BLOCK_LINES, BLOCK_CURRENT_LINE] : BLOCK_LINES).join('\n');
  const stateBeforeLog = [...STATE_HEAD, ...(withCurrent ? [STATE_CURRENT_LINE] : []), '', ''].join('\n');
  const stateText = stateBeforeLog + STATE_LOG;
  const p = planningProject({ git: false, files: { 'STATE.md': stateText } });

  const claudeText = CLAUDE_BEFORE + managedBlock.render(blockBody, BLOCK_META) + CLAUDE_AFTER;
  const claudePath = path.join(p.root, 'CLAUDE.md');
  fs.writeFileSync(claudePath, claudeText);

  const statePath = path.join(p.dir, 'STATE.md');
  return {
    root: p.root,
    home: p.home,
    dir: p.dir,
    claudePath,
    statePath,
    stateRel: path.relative(p.root, statePath).split(path.sep).join('/'),
    claudeText,
    stateText,
    parts: Object.freeze({
      claudeBefore: CLAUDE_BEFORE,
      claudeAfter: CLAUDE_AFTER,
      blockBody,
      stateBeforeLog,
      stateLog: STATE_LOG,
    }),
    cleanup: p.cleanup,
  };
}

module.exports = { legacyCommandText, legacyCommandProject };
