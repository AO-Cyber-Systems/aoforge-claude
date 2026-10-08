'use strict';

/**
 * Regression coverage for `df-tools state update-progress` (TRD 70-01, TOOL-07).
 *
 * Root cause under test: cmdStateUpdateProgress only matched a bold `**Progress:**`
 * field. The bundled template writes a plain `Progress: [░░░░░░░░░░] 0%` line, and
 * this repository's STATE.md has no Progress line at all, so the command printed
 * `{updated: false}` and exited 0: a success that changed nothing.
 *
 * Test list (spawned CLI is the outermost layer; one in-process table for the
 * pure helper). Every project has objective `07-x` with 2 TRDs and 1 SUMMARY, so
 * the bar is `[█████░░░░░] 50%`:
 *   1. Plain template line inside `## Current Position` becomes the bar; exit 0;
 *      JSON {updated, percent, completed, total, bar}; only that line changes;
 *      state.json progress_pct 50.
 *   2. A plain `Progress:` line under `## Session Continuity` only is untouched;
 *      a bold line is inserted in Current Position.
 *   3. No Progress line: `**Progress:** <bar>` is inserted directly after the last
 *      non-blank line of Current Position, before the blank line and `## Next`;
 *      JSON has `inserted: true`.
 *   4. A `### Blockers` subheading inside Current Position: the insertion lands
 *      before it.
 *   5. Running twice after an insertion leaves exactly one Progress line and the
 *      second JSON has no `inserted`.
 *   6. `--raw` on an insertion prints the bar only.
 *   7. No Progress line and no `## Current Position`: exit 1, stderr `Error:` and
 *      names `## Current Position`; STATE.md identical; state.json not created
 *      (and unchanged when it existed).
 *   8. Local mode without STATE.md: exit 1, stderr `STATE.md not found`, no
 *      state.json written.
 *   9. In-process setProgressLine table: bold, plain, inserted, empty section,
 *      no section (null).
 *
 * Fixtures are hand-built in __fixtures__/cli-defects-fixtures.cjs; every project
 * lives in mkdtemp and df-tools runs under a fake HOME.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { stateMd, makeProject, trdText, runDfTools, cleanupAll } = require('./__fixtures__/cli-defects-fixtures.cjs');
const { setProgressLine } = require('./state.cjs');

const BAR = '[█████░░░░░] 50%';
const ZERO_BAR = '[░░░░░░░░░░] 0%';

afterEach(cleanupAll);

// Objective 07-x: 2 TRDs, 1 SUMMARY -> 50%.
function halfDone() {
  return {
    '07-x': {
      '07-01-TRD.md': trdText({ objective: '07-x', trd: '01' }),
      '07-02-TRD.md': trdText({ objective: '07-x', trd: '02' }),
      '07-01-SUMMARY.md': '# Summary\n',
    },
  };
}

function projectWith(stateText, extra = {}) {
  return makeProject({ stateMd: stateText, objectives: halfDone(), ...extra });
}

function readState(dir) {
  return fs.readFileSync(path.join(dir, '.planning', 'STATE.md'), 'utf-8');
}

function stateJsonPath(dir) {
  return path.join(dir, '.planning', 'state.json');
}

describe('state update-progress (TRD 70-01)', () => {
  test('1. plain template line in Current Position is rewritten, nothing else changes', () => {
    const input = stateMd('plain');
    const dir = projectWith(input);
    const r = runDfTools(['state', 'update-progress'], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.json, { updated: true, percent: 50, completed: 1, total: 2, bar: BAR });
    assert.equal(readState(dir), input.replace(`Progress: ${ZERO_BAR}`, `Progress: ${BAR}`));
    assert.equal(JSON.parse(fs.readFileSync(stateJsonPath(dir), 'utf-8')).progress_pct, 50);
  });

  test('2. a Progress line outside Current Position is never rewritten; a bold line is inserted', () => {
    const input = stateMd('plain-elsewhere');
    const dir = projectWith(input);
    const r = runDfTools(['state', 'update-progress'], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.updated, true);
    assert.equal(r.json.inserted, true);
    const after = readState(dir);
    assert.ok(after.includes('## Session Continuity\n\nProgress: elsewhere\n'), 'Session Continuity line untouched');
    assert.ok(after.includes(`**Last Activity:** 2026-01-01\n**Progress:** ${BAR}\n`), after);
  });

  test('3. no Progress line: a bold line is inserted after the last non-blank line of the section', () => {
    const input = stateMd('bold-no-field');
    const dir = projectWith(input);
    const r = runDfTools(['state', 'update-progress'], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.json, { updated: true, inserted: true, percent: 50, completed: 1, total: 2, bar: BAR });
    assert.equal(
      readState(dir),
      input.replace('**Last Activity:** 2026-01-01\n\n## Next', `**Last Activity:** 2026-01-01\n**Progress:** ${BAR}\n\n## Next`)
    );
    assert.equal(JSON.parse(fs.readFileSync(stateJsonPath(dir), 'utf-8')).progress_pct, 50);
  });

  test('4. the insertion lands before a subheading inside Current Position', () => {
    const input = stateMd('subheading');
    const dir = projectWith(input);
    const r = runDfTools(['state', 'update-progress'], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.inserted, true);
    assert.equal(
      readState(dir),
      input.replace('**Last Activity:** 2026-01-01\n\n### Blockers', `**Last Activity:** 2026-01-01\n**Progress:** ${BAR}\n\n### Blockers`)
    );
  });

  test('5. a second run updates the inserted line in place', () => {
    const dir = projectWith(stateMd('bold-no-field'));
    const first = runDfTools(['state', 'update-progress'], dir);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.json.inserted, true);
    const second = runDfTools(['state', 'update-progress'], dir);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.json.updated, true);
    assert.equal('inserted' in second.json, false);
    const hits = readState(dir).split('\n').filter(l => /Progress:/.test(l));
    assert.deepEqual(hits, [`**Progress:** ${BAR}`]);
  });

  test('6. --raw on an insertion prints the bar only', () => {
    const dir = projectWith(stateMd('bold-no-field'));
    const r = runDfTools(['state', 'update-progress', '--raw'], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, BAR);
  });

  test('7. no Progress line and no Current Position: exit 1 and nothing is written', () => {
    const input = stateMd('no-position');
    const dir = projectWith(input);
    const r = runDfTools(['state', 'update-progress'], dir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.startsWith('Error:'), r.stderr);
    assert.ok(r.stderr.includes('## Current Position'), r.stderr);
    assert.equal(readState(dir), input);
    assert.equal(fs.existsSync(stateJsonPath(dir)), false);
  });

  test('7b. an existing state.json is unchanged by the failed run', () => {
    const input = stateMd('no-position');
    const dir = projectWith(input, { stateJson: { progress_pct: 12, status: 'kept' } });
    const before = fs.readFileSync(stateJsonPath(dir), 'utf-8');
    const r = runDfTools(['state', 'update-progress'], dir);
    assert.equal(r.status, 1);
    assert.equal(readState(dir), input);
    assert.equal(fs.readFileSync(stateJsonPath(dir), 'utf-8'), before);
  });

  test('8. local mode without STATE.md: exit 1 and no state.json', () => {
    const dir = makeProject({ objectives: halfDone() });
    const r = runDfTools(['state', 'update-progress'], dir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('STATE.md not found'), r.stderr);
    assert.equal(fs.existsSync(stateJsonPath(dir)), false);
  });
});

describe('setProgressLine (TRD 70-01)', () => {
  test('9a. a bold field is replaced: how bold', () => {
    const content = `# S\n\n## Current Position\n\n**Progress:** ${ZERO_BAR}\n\n## Next\n`;
    const r = setProgressLine(content, BAR);
    assert.equal(r.how, 'bold');
    assert.equal(r.content, content.replace(ZERO_BAR, BAR));
  });

  test('9b. a plain line in Current Position is replaced: how plain, label kept', () => {
    const content = `# S\n\n## Current Position\n\nprogress: ${ZERO_BAR}\n\n## Next\n`;
    const r = setProgressLine(content, BAR);
    assert.equal(r.how, 'plain');
    assert.equal(r.content, content.replace(ZERO_BAR, BAR));
  });

  test('9c. a missing line is inserted: how inserted', () => {
    const content = '# S\n\n## Current Position\n\n**Status:** Planning\n\n## Next\n';
    const r = setProgressLine(content, BAR);
    assert.equal(r.how, 'inserted');
    assert.equal(r.content, `# S\n\n## Current Position\n\n**Status:** Planning\n**Progress:** ${BAR}\n\n## Next\n`);
  });

  test('9d. an empty section gets the line after the heading with a blank line', () => {
    const content = '# S\n\n## Current Position\n## Next\n\nText.\n';
    const r = setProgressLine(content, BAR);
    assert.equal(r.how, 'inserted');
    assert.equal(r.content, `# S\n\n## Current Position\n\n**Progress:** ${BAR}\n\n## Next\n\nText.\n`);
  });

  test('9e. Current Position at end of file with no trailing newline', () => {
    const content = '# S\n\n## Current Position\n\n**Status:** Planning';
    const r = setProgressLine(content, BAR);
    assert.equal(r.how, 'inserted');
    assert.equal(r.content, `# S\n\n## Current Position\n\n**Status:** Planning\n**Progress:** ${BAR}\n`);
  });

  test('9f. no Current Position heading and no Progress line: null', () => {
    assert.equal(setProgressLine(stateMd('no-position'), BAR), null);
  });
});
