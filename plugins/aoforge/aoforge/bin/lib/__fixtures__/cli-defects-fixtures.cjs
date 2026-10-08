'use strict';

// TRD 70-01, hand-built; nothing generated.
// Builders for the three CLI defect tests: `state update-progress`, `verify trd-pre`
// and `objective-job-index`. STATE.md variants are literal strings.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DF_TOOLS = path.join(__dirname, '..', '..', 'aof-tools.cjs');

const created = [];

function track(dir) {
  created.push(dir);
  return dir;
}

// ─── stateMd ──────────────────────────────────────────────────────────────────

const STATE_VARIANTS = {
  // The bundled template shape (aoforge/templates/state.md): a plain Progress line.
  plain: [
    '# Project State',
    '',
    '## Current Position',
    '',
    'Objective: 7 of 9',
    'Status: Planning',
    '',
    'Progress: [░░░░░░░░░░] 0%',
    '',
    '## Accumulated Context',
    '',
    'Nothing yet.',
    '',
  ].join('\n'),

  // This repository's shape: bold fields, no Progress line at all.
  'bold-no-field': [
    '# Project State',
    '',
    '## Current Position',
    '',
    '**Status:** Planning',
    '**Last Activity:** 2026-01-01',
    '',
    '## Next',
    '',
    'Plan objective 7.',
    '',
  ].join('\n'),

  // A subheading inside Current Position: the insertion must land before it.
  subheading: [
    '# Project State',
    '',
    '## Current Position',
    '',
    '**Status:** Planning',
    '**Last Activity:** 2026-01-01',
    '',
    '### Blockers',
    '',
    '- waiting on review',
    '',
    '## Next',
    '',
    'Plan objective 7.',
    '',
  ].join('\n'),

  // A plain Progress line only under Session Continuity: it must never be rewritten.
  'plain-elsewhere': [
    '# Project State',
    '',
    '## Current Position',
    '',
    '**Status:** Planning',
    '**Last Activity:** 2026-01-01',
    '',
    '## Session Continuity',
    '',
    'Progress: elsewhere',
    'Stopped at: nowhere',
    '',
  ].join('\n'),

  // No Current Position heading and no Progress line.
  'no-position': [
    '# Project State',
    '',
    '## Notes',
    '',
    'Free text only.',
    '',
  ].join('\n'),

  // Current Position straight into the next heading.
  'empty-position': [
    '# Project State',
    '',
    '## Current Position',
    '## Next',
    '',
    'Plan objective 7.',
    '',
  ].join('\n'),
};

/**
 * Literal STATE.md text for a named variant.
 * @param {'plain'|'bold-no-field'|'subheading'|'plain-elsewhere'|'no-position'|'empty-position'} variant
 * @returns {string}
 */
function stateMd(variant) {
  if (!Object.prototype.hasOwnProperty.call(STATE_VARIANTS, variant)) {
    throw new Error(`unknown STATE.md variant: ${variant}`);
  }
  return STATE_VARIANTS[variant];
}

// ─── trdText ──────────────────────────────────────────────────────────────────

const DEFAULT_TRD_BODY = [
  '<tasks>',
  '',
  '<task type="auto">',
  '  <name>Task 1: do the thing</name>',
  '  <action>Do the thing.</action>',
  '  <verify>echo ok</verify>',
  '  <done>Done.</done>',
  '</task>',
  '',
  '</tasks>',
  '',
].join('\n');

/**
 * TRD markdown: `---`, one `key: value` line per entry (arrays as `[a, b]`), `---`, body.
 * @param {Record<string, string|number|boolean|string[]>} frontmatter
 * @param {string} [body]
 * @returns {string}
 */
function trdText(frontmatter, body = DEFAULT_TRD_BODY) {
  const lines = Object.entries(frontmatter || {}).map(([key, value]) => {
    const v = Array.isArray(value) ? `[${value.join(', ')}]` : String(value);
    return `${key}: ${v}`;
  });
  return ['---', ...lines, '---', '', body].join('\n');
}

// ─── makeProject ──────────────────────────────────────────────────────────────

/**
 * A mkdtemp project with a `.planning/` tree.
 * @param {object} [opts]
 * @param {string} [opts.stateMd] - written to .planning/STATE.md when a string
 * @param {object} [opts.stateJson] - written to .planning/state.json when given
 * @param {Record<string, Record<string, string>>} [opts.objectives] - { '07-x': { '07-01-a-TRD.md': '<text>' } }
 * @param {object} [opts.config] - written to .planning/config.json when given
 * @returns {string} absolute project root
 */
function makeProject({ stateMd: stateText, stateJson, objectives, config } = {}) {
  const dir = track(fs.mkdtempSync(path.join(os.tmpdir(), 'df-cli-defects-')));
  const planning = path.join(dir, '.planning');
  fs.mkdirSync(planning, { recursive: true });
  if (typeof stateText === 'string') {
    fs.writeFileSync(path.join(planning, 'STATE.md'), stateText, 'utf-8');
  }
  if (stateJson !== undefined) {
    fs.writeFileSync(path.join(planning, 'state.json'), JSON.stringify(stateJson, null, 2), 'utf-8');
  }
  if (config !== undefined) {
    fs.writeFileSync(path.join(planning, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
  }
  for (const [objectiveName, files] of Object.entries(objectives || {})) {
    const objectiveDir = path.join(planning, 'objectives', objectiveName);
    fs.mkdirSync(objectiveDir, { recursive: true });
    for (const [fileName, text] of Object.entries(files)) {
      fs.writeFileSync(path.join(objectiveDir, fileName), text, 'utf-8');
    }
  }
  return dir;
}

// ─── runDfTools ───────────────────────────────────────────────────────────────

/**
 * Spawn bin/aof-tools.cjs with `cwd` under a mkdtemp fake HOME (never the real ~/.claude).
 * @param {string[]} args
 * @param {string} cwd
 * @returns {{status: number|null, stdout: string, stderr: string, json: any}}
 */
function runDfTools(args, cwd) {
  const home = track(fs.mkdtempSync(path.join(os.tmpdir(), 'df-cli-defects-home-')));
  const r = spawnSync(process.execPath, [DF_TOOLS, ...args], {
    cwd,
    env: Object.assign({}, process.env, { HOME: home }),
    encoding: 'utf-8',
    timeout: 30000,
  });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* not JSON */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

// ─── cleanupAll ───────────────────────────────────────────────────────────────

function cleanupAll() {
  while (created.length) {
    const dir = created.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { stateMd, makeProject, trdText, runDfTools, cleanupAll };
