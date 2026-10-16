'use strict';
// TRD 76-04: trd finalize, validate roadmap-coverage and verify objective-evidence, the mechanical
// work the executor, roadmapper and verifier used to do by hand. (codebase facts and security sweep
// have their own test files.)

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const DIRS = [];
after(() => { for (const d of DIRS) fs.rmSync(d, { recursive: true, force: true }); });

function project(files) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'mech-verbs-'));
  DIRS.push(root);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}
function run(root, ...argv) {
  const r = spawnSync(process.execPath, [TOOLS, '--cwd', root, ...argv], { encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* raw or error */ }
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr };
}

const REQS = `# Requirements

## v1 Requirements

- [ ] **AUTH-01**: sign in
- [ ] **AUTH-02**: sign out
- [ ] **DATA-01**: list items

## v2 Requirements

- [ ] **NOTF-01**: notifications
`;
const roadmap = (o1, o2) => `# Roadmap

### Objective 1: Auth
**Requirements**: ${o1}

### Objective 2: Data
**Requirements**: ${o2}  <!-- brackets optional -->
`;

describe('validate roadmap-coverage', () => {
  test('full coverage exits 0; v2 ids are out of scope', () => {
    const root = project({ '.aoforge/REQUIREMENTS.md': REQS, '.aoforge/ROADMAP.md': roadmap('[AUTH-01, AUTH-02]', 'DATA-01') });
    const r = run(root, 'validate', 'roadmap-coverage');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.json.coverage, '3/3');
    assert.deepEqual(r.json.orphans, []);
  });

  test('an orphan, a duplicate and an unknown id are reported, exit 1', () => {
    const root = project({ '.aoforge/REQUIREMENTS.md': REQS, '.aoforge/ROADMAP.md': roadmap('[AUTH-01, DATA-01]', 'DATA-01, ZZZ-09') });
    const r = run(root, 'validate', 'roadmap-coverage');
    assert.equal(r.status, 1);
    assert.deepEqual(r.json.orphans, ['AUTH-02']);
    assert.deepEqual(r.json.duplicates, [{ id: 'DATA-01', objectives: ['1', '2'] }]);
    assert.deepEqual(r.json.unknown, [{ id: 'ZZZ-09', objectives: ['2'] }]);
  });

  test('the label may carry its colon inside the bold, as objective add writes it', () => {
    const text = roadmap('[AUTH-01, AUTH-02]', 'DATA-01').replace('**Requirements**: DATA-01', '**Requirements:** DATA-01');
    const r = run(project({ '.aoforge/REQUIREMENTS.md': REQS, '.aoforge/ROADMAP.md': text }), 'validate', 'roadmap-coverage');
    assert.equal(r.status, 0, r.stdout);
    assert.equal(r.json.coverage, '3/3');
  });

  test('a missing file is named, not treated as coverage', () => {
    const r = run(project({ '.aoforge/ROADMAP.md': roadmap('', '') }), 'validate', 'roadmap-coverage');
    assert.equal(r.status, 1);
    assert.deepEqual(r.json.missing, ['REQUIREMENTS.md']);
  });
});

const TRD = `---
objective: 01-auth
requirements: [AUTH-01, AUTH-02]
must_haves:
  artifacts:
    - path: src/auth.js
      provides: sign in
---
<tasks>
<task type="auto"><name>one</name></task>
<task type="auto"><name>two</name></task>
</tasks>
`;
const SUMMARY = `---
duration: 12min
key-files:
  created: [src/auth.js]
  modified: [src/app.js]
key-decisions:
  - "Cookie sessions: simpler than JWT here"
  - "No refresh tokens"
---
# Summary

## Self-Check: PASSED
`;

describe('trd finalize', () => {
  const files = {
    '.aoforge/objectives/01-auth/01-01-sign-in-TRD.md': TRD,
    '.aoforge/objectives/01-auth/01-01-SUMMARY.md': SUMMARY,
    'src/auth.js': 'module.exports = {};\n',
  };

  test('--dry-run plans the bookkeeping from the TRD and SUMMARY', () => {
    const r = run(project(files), 'trd', 'finalize', '01-01', '--dry-run');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.json.tasks, 2);
    assert.equal(r.json.files, 2);
    assert.deepEqual(r.json.requirements, ['AUTH-01', 'AUTH-02']);
    const steps = r.json.steps.map((s) => s.step);
    assert.deepEqual(steps, ['advance-job', 'update-progress', 'record-metric', 'add-decision', 'add-decision', 'record-session', 'roadmap-progress', 'requirements']);
    const metric = r.json.steps.find((s) => s.step === 'record-metric').argv;
    assert.deepEqual(metric.slice(metric.indexOf('--duration'), metric.indexOf('--duration') + 2), ['--duration', '12min']);
    assert.equal(r.json.steps.find((s) => s.step === 'add-decision').argv.at(-1), 'Cookie sessions');
  });

  test('no SUMMARY yet is refused: post it first', () => {
    const { ['.aoforge/objectives/01-auth/01-01-SUMMARY.md']: _s, ...noSummary } = files;
    const r = run(project(noSummary), 'trd', 'finalize', '01-01', '--dry-run');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /summary post/);
  });

  test('a malformed id and an unknown flag are refused before anything runs', () => {
    const root = project(files);
    assert.equal(run(root, 'trd', 'finalize', 'nope', '--dry-run').status, 1);
    const flag = run(root, 'trd', 'finalize', '01-01', '--nope');
    assert.equal(flag.status, 1);
    assert.match(flag.stderr, /unknown flag/);
  });
});

describe('verify objective-evidence', () => {
  test('rolls up per-TRD evidence and missing key-files', () => {
    const root = project({
      '.aoforge/objectives/01-auth/01-01-sign-in-TRD.md': TRD,
      '.aoforge/objectives/01-auth/01-01-SUMMARY.md': SUMMARY,
      '.aoforge/objectives/01-auth/01-02-sign-out-TRD.md': TRD,
      'src/auth.js': 'module.exports = {};\n',
    });
    const r = run(root, 'verify', 'objective-evidence', '1');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.json.rollup.trds, 2);
    assert.equal(r.json.rollup.summaries, 1);
    assert.deepEqual(r.json.rollup.missing_key_files, ['01-01: src/app.js']);
    const first = r.json.trds[0];
    assert.equal(first.summary.self_check, 'PASSED');
    assert.equal(first.artifacts.all_passed, true);
    assert.equal(r.json.trds[1].summary.exists, false);
  });

  test('an unknown objective is an error', () => {
    const r = run(project({ '.aoforge/ROADMAP.md': '# r\n' }), 'verify', 'objective-evidence', '9');
    assert.equal(r.status, 1);
  });
});
