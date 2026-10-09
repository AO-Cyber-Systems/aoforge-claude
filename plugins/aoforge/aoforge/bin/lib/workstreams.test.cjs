'use strict';

/**
 * Regression coverage for objective-number matching in lib/workstreams.cjs (objective 54, TRD 54-06).
 *
 * `workstreams analyze` reads each objective's completion from its ROADMAP checklist line. The checkbox
 * pattern interpolated the objective number with no trailing boundary (and escaped only the first dot),
 * so `Objective 1` matched `Objective 12` and `Objective 4.1` matched `Objective 4.10`: a checked later
 * objective made an earlier, unchecked one read as complete.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');

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

function tmpProject() {
  const dir = track(fs.mkdtempSync(path.join(os.tmpdir(), 'df-workstreams-')));
  fs.mkdirSync(path.join(dir, '.aoforge', 'objectives'), { recursive: true });
  return dir;
}

function run(args, cwd) {
  const home = track(fs.mkdtempSync(path.join(os.tmpdir(), 'df-workstreams-home-')));
  const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', cwd, ...args], {
    env: Object.assign({}, process.env, { HOME: home }),
    encoding: 'utf-8',
    timeout: 30000,
  });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* not JSON */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

function writeRoadmap(project, body) {
  fs.writeFileSync(path.join(project, '.aoforge', 'ROADMAP.md'), body, 'utf-8');
}

describe('workstreams analyze: checklist checkbox matching', () => {
  // Item 8. RED before the fix (workstreams.cjs:48, no trailing boundary).
  test('8: a checked "Objective 12" line above an unchecked "Objective 1" does not complete objective 1', () => {
    const project = tmpProject();
    writeRoadmap(project, `# Roadmap

## Objectives

- [x] Objective 12: Done
- [ ] Objective 1: Todo

## Objective Details

### Objective 1: Todo
**Goal**: First
**Depends on**: Nothing

### Objective 12: Done
**Goal**: Twelfth
**Depends on**: Nothing
`);

    const r = run(['workstreams', 'analyze', '--raw'], project);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.json.completed_objectives, ['12'], 'only objective 12 is checked');
  });

  // Item 9. First-dot escaping plus no boundary let `4.1` match `4.10`.
  test('9: a checked "Objective 4.10" line above an unchecked "Objective 4.1" does not complete objective 4.1', () => {
    const project = tmpProject();
    writeRoadmap(project, `# Roadmap

## Objectives

- [x] Objective 4.10: Ten
- [ ] Objective 4.1: One

## Objective Details

### Objective 4.1: One
**Goal**: First
**Depends on**: Nothing

### Objective 4.10: Ten
**Goal**: Tenth
**Depends on**: Nothing
`);

    const r = run(['workstreams', 'analyze', '--raw'], project);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.json.completed_objectives, ['4.10'], 'only objective 4.10 is checked');
  });
});
