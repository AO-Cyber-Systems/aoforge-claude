'use strict';

/**
 * Regression coverage for `df-tools state record-session` (TRD 40-04, TOOL-07).
 *
 * Root cause under test: cmdStateRecordSession only knew how to rewrite bold
 * legacy fields (`**Last session:**`, `**Stopped At:**`, `**Resume File:**`) via
 * stateReplaceField. The narrative STATE.md this repo (and new DevFlow projects
 * that copy it) actually uses keeps session continuity as PLAIN lines inside a
 * `## Session Continuity` section:
 *
 *   ## Session Continuity
 *
 *   Last session: 2026-09-28 — Objective 39 TRD 39-05 executed (final TRD, 5/5)
 *   Resume file: `.planning/SESSION_PICKUP.md`
 *   Stopped at: Completed 39-05-TRD.md (2026-09-28)
 *
 * so record-session was always a truthful no-op (`recorded: false`).
 *
 * Test list (spawned CLI `state record-session` is the outermost layer; one
 * unit case for the section-scoped helper):
 *   1. Narrative: `--stopped-at "halted at 40-04" --resume-file
 *      ".planning/SESSION_PICKUP.md"` gives `recorded: true`, `updated` =
 *      [Last session, Stopped At, Resume File]; `Last session:` holds an ISO
 *      timestamp, `Stopped at: halted at 40-04`, and
 *      ``Resume file: `.planning/SESSION_PICKUP.md` `` (backticks kept).
 *   2. Scoping: plain `Resume file:` / `Stopped at:` lines in a `## Notes`
 *      section BEFORE Session Continuity (and plain labels in a section AFTER
 *      it) are unchanged.
 *   3. Everything else byte-identical: removing the three target lines from
 *      before/after yields equal strings.
 *   4. Label case preserved: `Stopped at:` stays lowercase-`at`.
 *   5. Legacy bold: `**Last session:**` / `**Stopped At:**` / `**Resume File:**`
 *      are updated as before, and bold takes precedence over plain lines.
 *   6. No fields: no Session Continuity and no bold fields gives
 *      `recorded: false` with the unchanged reason; the file is not written.
 *   7. Missing `--resume-file`: `None` is written for the plain form too
 *      (``Resume file: `None` `` when previously backticked, else `None`).
 *   8. Unit: sessionReplacePlainField is `$`-safe (no replacement-pattern
 *      interpolation) and returns null outside / without the section.
 *
 * All fixtures are inline and every STATE.md lives in an mkdtemp project; df-tools
 * is spawned with that project as cwd under a fake HOME. The repo's own
 * .planning/STATE.md is never touched.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const state = require('./state.cjs');

const NO_FIELDS_REASON = 'No session fields found in STATE.md';
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function track(dir) {
  cleanup.push(dir);
  return dir;
}

function tmpProject(stateContent) {
  const dir = track(fs.mkdtempSync(path.join(os.tmpdir(), 'df-state-')));
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  if (stateContent !== undefined) {
    fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'), stateContent, 'utf-8');
  }
  return dir;
}

function fakeHomeEnv() {
  const home = track(fs.mkdtempSync(path.join(os.tmpdir(), 'df-state-home-')));
  return Object.assign({}, process.env, { HOME: home });
}

function run(args, cwd) {
  const r = spawnSync(process.execPath, [DF_TOOLS, ...args], {
    cwd,
    env: fakeHomeEnv(),
    encoding: 'utf-8',
    timeout: 30000,
  });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* not JSON */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

function readState(dir) {
  return fs.readFileSync(path.join(dir, '.planning', 'STATE.md'), 'utf-8');
}

// Text of `## Session Continuity` up to the next `## ` heading (or EOF).
function sessionSection(content) {
  const start = content.indexOf('## Session Continuity');
  assert.notEqual(start, -1, 'fixture must contain ## Session Continuity');
  const next = content.indexOf('\n## ', start + 1);
  return content.slice(start, next === -1 ? content.length : next + 1);
}

// Line indices of the three target lines inside Session Continuity.
function targetLineIndices(content) {
  const lines = content.split('\n');
  const heading = lines.indexOf('## Session Continuity');
  assert.notEqual(heading, -1, 'fixture must contain ## Session Continuity');
  const idx = [];
  for (let i = heading + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
    if (/^(Last session|Resume file|Stopped at):/i.test(lines[i])) idx.push(i);
  }
  return idx;
}

// Mirrors this repo's STATE.md shape: plain labels in Session Continuity, plus
// decoy plain labels in a section before AND a section after it.
const NARRATIVE = [
  '# Project State',
  '',
  '## Current Position',
  '',
  'Objective: 40 of 41 (tooling-correctness)',
  'Status: In progress',
  '',
  '## Notes',
  '',
  'Resume file: keep-me.md',
  'Stopped at: keep-me',
  '',
  '## Session Continuity',
  '',
  'Last session: 2026-09-28 — Objective 39 TRD 39-05 executed (final TRD, 5/5): re-ran `df-tools context --limit 150`',
  'Resume file: `.planning/SESSION_PICKUP.md`',
  'Stopped at: Completed 39-05-TRD.md (2026-09-28)',
  '',
  '## Appendix',
  '',
  'Last session: appendix-untouched',
  'Resume file: appendix-untouched.md',
  'Stopped at: appendix-untouched',
  '',
].join('\n');

const LEGACY_BOLD = [
  '# Project State',
  '',
  '## Current Position',
  '',
  '**Last session:** x',
  '**Stopped At:** y',
  '**Resume File:** z',
  '',
].join('\n');

describe('state record-session — narrative Session Continuity (TOOL-07)', () => {
  test('1. narrative plain lines are recorded (ISO timestamp, stopped-at, backticked resume file)', () => {
    const dir = tmpProject(NARRATIVE);
    const r = run(['state', 'record-session', '--stopped-at', 'halted at 40-04',
      '--resume-file', '.planning/SESSION_PICKUP.md'], dir);

    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.json, `expected JSON output, got: ${r.stdout}`);
    assert.equal(r.json.recorded, true, JSON.stringify(r.json));
    assert.deepEqual(r.json.updated, ['Last session', 'Stopped At', 'Resume File']);

    const section = sessionSection(readState(dir));
    const last = section.match(/^Last session: (.*)$/m);
    assert.ok(last, `no Last session line in:\n${section}`);
    assert.match(last[1], ISO_RE, 'Last session holds a bare ISO timestamp (old value fully replaced, not backticked)');
    assert.match(section, /^Stopped at: halted at 40-04$/m);
    assert.match(section, /^Resume file: `\.planning\/SESSION_PICKUP\.md`$/m);
  });

  test('2. plain labels outside Session Continuity (before and after) are untouched', () => {
    const dir = tmpProject(NARRATIVE);
    const r = run(['state', 'record-session', '--stopped-at', 'halted at 40-04',
      '--resume-file', '.planning/SESSION_PICKUP.md'], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json && r.json.recorded, true, r.stdout);

    const after = readState(dir);
    const scBefore = NARRATIVE.indexOf('## Session Continuity');
    const scAfter = after.indexOf('## Session Continuity');
    assert.equal(after.slice(0, scAfter), NARRATIVE.slice(0, scBefore),
      'everything before ## Session Continuity (incl. ## Notes decoys) is byte-identical');
    assert.match(after, /^Resume file: keep-me\.md$/m);
    assert.match(after, /^Stopped at: keep-me$/m);

    const apBefore = NARRATIVE.indexOf('## Appendix');
    const apAfter = after.indexOf('## Appendix');
    assert.notEqual(apAfter, -1);
    assert.equal(after.slice(apAfter), NARRATIVE.slice(apBefore),
      'everything from the next ## heading onward is byte-identical');
  });

  test('3. every line other than the three target lines is byte-identical', () => {
    const dir = tmpProject(NARRATIVE);
    const r = run(['state', 'record-session', '--stopped-at', 'halted at 40-04',
      '--resume-file', '.planning/SESSION_PICKUP.md'], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json && r.json.recorded, true, r.stdout);

    const after = readState(dir);
    const targets = targetLineIndices(NARRATIVE);
    assert.equal(targets.length, 3);
    assert.deepEqual(targetLineIndices(after), targets, 'target lines stay at the same positions');

    const strip = (text) => text.split('\n').filter((_, i) => !targets.includes(i)).join('\n');
    assert.equal(strip(after), strip(NARRATIVE));
    assert.notEqual(after, NARRATIVE, 'the target lines themselves changed');
  });

  test('4. the file\'s own label text/case is kept (Stopped at: stays lowercase-at)', () => {
    const dir = tmpProject(NARRATIVE);
    const r = run(['state', 'record-session', '--stopped-at', 'halted at 40-04',
      '--resume-file', '.planning/SESSION_PICKUP.md'], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json && r.json.recorded, true, r.stdout);

    const section = sessionSection(readState(dir));
    assert.match(section, /^Stopped at: halted at 40-04$/m);
    assert.match(section, /^Resume file: /m);
    assert.match(section, /^Last session: /m);
    assert.doesNotMatch(section, /Stopped At:/);
    assert.doesNotMatch(section, /Resume File:/);
    assert.doesNotMatch(section, /\*\*/, 'no bold markup is introduced');
  });
});

describe('state record-session — legacy bold fields and no-op', () => {
  test('5a. bold legacy fields are updated exactly as before', () => {
    const dir = tmpProject(LEGACY_BOLD);
    const r = run(['state', 'record-session', '--stopped-at', 'new stop',
      '--resume-file', 'next.md'], dir);

    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json && r.json.recorded, true, r.stdout);
    assert.deepEqual(r.json.updated, ['Last session', 'Stopped At', 'Resume File']);

    const after = readState(dir);
    const last = after.match(/^\*\*Last session:\*\* (.*)$/m);
    assert.ok(last, after);
    assert.match(last[1], ISO_RE);
    assert.match(after, /^\*\*Stopped At:\*\* new stop$/m);
    assert.match(after, /^\*\*Resume File:\*\* next\.md$/m);
  });

  test('5b. bold fields take precedence: plain Session Continuity lines are left alone', () => {
    const content = LEGACY_BOLD + '\n' + [
      '## Session Continuity',
      '',
      'Last session: plain-last',
      'Resume file: `plain-resume.md`',
      'Stopped at: plain-stop',
      '',
    ].join('\n');
    const dir = tmpProject(content);
    const r = run(['state', 'record-session', '--stopped-at', 'new stop',
      '--resume-file', 'next.md'], dir);

    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json && r.json.recorded, true, r.stdout);
    assert.deepEqual(r.json.updated, ['Last session', 'Stopped At', 'Resume File']);

    const after = readState(dir);
    assert.match(after, /^\*\*Stopped At:\*\* new stop$/m);
    assert.match(after, /^\*\*Resume File:\*\* next\.md$/m);
    assert.equal(sessionSection(after), sessionSection(content),
      'plain Session Continuity lines are byte-identical when bold fields exist');
  });

  test('6a. no Session Continuity and no bold fields: truthful no-op, file not written', () => {
    const content = [
      '# Project State',
      '',
      '## Notes',
      '',
      'Last session: keep',
      'Resume file: keep.md',
      'Stopped at: keep',
      '',
    ].join('\n');
    const dir = tmpProject(content);
    const statePath = path.join(dir, '.planning', 'STATE.md');
    const past = new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(statePath, past, past);

    const r = run(['state', 'record-session', '--stopped-at', 'x', '--resume-file', 'y.md'], dir);

    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.json, { recorded: false, reason: NO_FIELDS_REASON });
    assert.equal(readState(dir), content);
    assert.equal(fs.statSync(statePath).mtimeMs, past.getTime(), 'STATE.md was not rewritten');
  });

  test('6b. a Session Continuity section without the labels is still a truthful no-op', () => {
    const content = [
      '# Project State',
      '',
      '## Session Continuity',
      '',
      'No session recorded yet.',
      '',
    ].join('\n');
    const dir = tmpProject(content);
    const r = run(['state', 'record-session', '--stopped-at', 'x', '--resume-file', 'y.md'], dir);

    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.json, { recorded: false, reason: NO_FIELDS_REASON });
    assert.equal(readState(dir), content);
  });

  test('7a. missing --resume-file writes `None` (backticks kept when previously backticked)', () => {
    const dir = tmpProject(NARRATIVE);
    const r = run(['state', 'record-session', '--stopped-at', 'halted at 40-04'], dir);

    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json && r.json.recorded, true, r.stdout);
    assert.deepEqual(r.json.updated, ['Last session', 'Stopped At', 'Resume File']);
    assert.match(sessionSection(readState(dir)), /^Resume file: `None`$/m);
  });

  test('7b. missing --resume-file writes bare None when the old value was not backticked', () => {
    const content = [
      '# Project State',
      '',
      '## Session Continuity',
      '',
      'Last session: 2026-09-27',
      'Resume file: .planning/SESSION_PICKUP.md',
      'Stopped at: somewhere',
      '',
    ].join('\n');
    const dir = tmpProject(content);
    const r = run(['state', 'record-session', '--stopped-at', 'halted at 40-04'], dir);

    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json && r.json.recorded, true, r.stdout);
    const section = sessionSection(readState(dir));
    assert.match(section, /^Resume file: None$/m);
    assert.match(section, /^Stopped at: halted at 40-04$/m);
  });
});

describe('sessionReplacePlainField (unit)', () => {
  test('8. $-safe replacement, section-scoped, null when the section or label is absent', () => {
    assert.equal(typeof state.sessionReplacePlainField, 'function',
      'state.cjs exports sessionReplacePlainField');
    const fn = state.sessionReplacePlainField;

    // `$&`, `$1`, `$$` must land literally, not be interpolated as replacement patterns.
    const tricky = 'cost $& and $1 and $$';
    const out = fn(NARRATIVE, 'Stopped at', tricky);
    assert.ok(out);
    assert.ok(out.includes(`\nStopped at: ${tricky}\n`), out);
    assert.match(out, /^Stopped at: keep-me$/m, 'the ## Notes decoy is untouched');

    // Label present only outside the section → null (no out-of-section match).
    const outsideOnly = '# S\n\n## Notes\n\nStopped at: nope\n\n## Session Continuity\n\nLast session: x\n';
    assert.equal(fn(outsideOnly, 'Stopped at', 'z'), null);

    // No section at all → null.
    assert.equal(fn('# S\n\nStopped at: nope\n', 'Stopped at', 'z'), null);
  });
});
