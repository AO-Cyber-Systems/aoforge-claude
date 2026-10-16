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

// Quick 36 (D1): coverage reads ROADMAP ids through requirement-ids.cjs roadmapRequirementIds, the parser
// `verify trd-pre` and `objective complete` use, one level-bounded objective section at a time.
describe('validate roadmap-coverage uses the shared requirement parser (quick 36)', () => {
  const cover = (reqs, road, ...flags) => run(
    project({ '.aoforge/REQUIREMENTS.md': reqs, '.aoforge/ROADMAP.md': road }), 'validate', 'roadmap-coverage', ...flags);
  const API_REQS = '# Requirements\n\n## v1 Requirements\n\n- [ ] **API-01**: list endpoints\n';

  test('1 a bulleted label line `- **Requirements**: API-01` maps its id', () => {
    const r = cover(API_REQS, '# Roadmap\n\n### Objective 1: Api\n- **Requirements**: API-01\n');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.json.coverage, '1/1');
    assert.deepEqual(r.json.orphans, []);
  });

  test('2 a label with no value reads the bullet lines below it', () => {
    const road = '# Roadmap\n\n### Objective 1: Auth\n**Requirements**:\n- AUTH-01\n- AUTH-02\n\n### Objective 2: Data\n**Requirements**: DATA-01\n';
    const r = cover(REQS, road);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.json.coverage, '3/3');
    assert.deepEqual(r.json.orphans, []);
  });

  test('3 `none (tech debt; AUTH-03 deferred)` maps nothing, so a v1 AUTH-03 is an orphan', () => {
    const reqs = REQS.replace('- [ ] **DATA-01**: list items\n', '- [ ] **DATA-01**: list items\n- [ ] **AUTH-03**: reset password\n');
    const road = `${roadmap('AUTH-01, AUTH-02', 'DATA-01')}\n### Objective 3: Cleanup\n**Requirements**: none (tech debt; AUTH-03 deferred)\n`;
    const r = cover(reqs, road);
    assert.equal(r.status, 1, r.stdout);
    assert.ok(r.json.orphans.includes('AUTH-03'), JSON.stringify(r.json));
  });

  test('4 a Requirements line under `## Progress` after the last objective is credited to no objective', () => {
    const road = '# Roadmap\n\n### Objective 1: Auth\n**Requirements**: AUTH-01, AUTH-02\n\n### Objective 2: Data\n**Goal**: lists\n\n## Progress\n\n| Objective | Status |\n|---|---|\n**Requirements**: DATA-01\n';
    const r = cover(REQS, road);
    assert.equal(r.status, 1, r.stdout);
    assert.deepEqual(r.json.orphans, ['DATA-01']);
    assert.deepEqual(r.json.duplicates, []);
  });

  test('5 a deeper heading inside an objective stays inside its section', () => {
    const road = '# Roadmap\n\n### Objective 1: Auth\n**Requirements**: AUTH-01, AUTH-02\n\n### Objective 2: Data\n#### Notes\nPagination later.\n**Requirements**: DATA-01\n';
    const r = cover(REQS, road);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.json.coverage, '3/3');
  });

  test('6 a section is out of v1 only when its heading starts with a later version or an out-of-scope word', () => {
    const reqs = [
      '# Requirements', '',
      '## v1 Requirements', '- [ ] **AUTH-01**: sign in', '',
      '## Integrations (OAuth v2)', '- [ ] **INT-01**: oauth login', '',
      '## v2 Requirements', '- [ ] **VTWO-01**: later thing', '',
      '## v10 Stretch', '- [ ] **VTEN-01**: far thing', '',
      '## Out of Scope', '- [ ] **OOS-01**: not doing', '',
      '## Traceability', '- [ ] **TRC-01**: table row', '',
      '## Future Requirements', '- [ ] **FUT-01**: someday', '',
      '## Deferred', '- [ ] **DEF-01**: parked', '',
    ].join('\n');
    const r = cover(reqs, '# Roadmap\n\n### Objective 1: Auth\n**Requirements**: AUTH-01\n');
    assert.equal(r.status, 1, r.stdout);
    assert.equal(r.json.v1_total, 2);
    assert.deepEqual(r.json.orphans, ['INT-01']);
  });

  test('7 a REQUIREMENTS.md with no v1 definitions fails with a reason, never `0/0 ✓`', () => {
    const reqs = '# Requirements\n\n## v1 Requirements\n\n(none yet)\n\n## v2 Requirements\n\n- [ ] **NOTF-01**: notifications\n';
    const road = '# Roadmap\n\n### Objective 1: Auth\n**Requirements**: none\n';
    const r = cover(reqs, road);
    assert.equal(r.status, 1, r.stdout);
    assert.equal(r.json.ok, false);
    assert.equal(r.json.v1_total, 0);
    assert.match(r.json.reason, /no v1 requirements/);
    const raw = cover(reqs, road, '--raw');
    assert.equal(raw.status, 1);
    assert.ok(!raw.stdout.includes('0/0 ✓'), raw.stdout);
    assert.match(raw.stdout, /no v1 requirements/);
  });

  test('8 an id with a lowercase suffix (AUTH-01a) is defined and mapped', () => {
    const reqs = '# Requirements\n\n## v1 Requirements\n\n- [ ] **AUTH-01a**: sign in with a code\n';
    const r = cover(reqs, '# Roadmap\n\n### Objective 1: Auth\n**Requirements**: AUTH-01a\n');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.json.coverage, '1/1');
  });

  test('9 raw success output ends with a newline', () => {
    const r = cover(API_REQS, '# Roadmap\n\n### Objective 1: Api\n**Requirements**: API-01\n', '--raw');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Coverage: 1\/1 v1 requirements mapped ✓\n$/);
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

// Quick 36 (D2): a mid-run SUMMARY (`## Progress` with an unticked task, no `## Self-Check`) is a checkpoint,
// not a finished TRD, in both objective-evidence and objective-completeness (misc.cjs isCheckpointOnlySummary).
const CHECKPOINT_SUMMARY = `---
duration: 5min
---
# Summary

## Progress
- [x] Task 1: one — abc1234
- [ ] Task 2: two — next step: add the sign-out handler to src/auth.js
`;

describe('checkpoint SUMMARYs are not done (quick 36)', () => {
  const files = {
    '.aoforge/objectives/01-auth/01-01-sign-in-TRD.md': TRD,
    '.aoforge/objectives/01-auth/01-01-SUMMARY.md': SUMMARY,
    '.aoforge/objectives/01-auth/01-02-sign-out-TRD.md': TRD,
    '.aoforge/objectives/01-auth/01-02-SUMMARY.md': CHECKPOINT_SUMMARY,
    'src/auth.js': 'module.exports = {};\n',
    'src/app.js': 'module.exports = {};\n',
  };

  test('12 objective-evidence counts final SUMMARYs only and names the checkpoint', () => {
    const r = run(project(files), 'verify', 'objective-evidence', '1');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.json.rollup.trds, 2);
    assert.equal(r.json.rollup.summaries, 1);
    assert.deepEqual(r.json.rollup.checkpoints, ['01-02']);
    assert.deepEqual(r.json.rollup.no_self_check, ['01-02']);
    assert.equal(r.json.trds[0].summary.checkpoint, false);
    assert.equal(r.json.trds[1].summary.checkpoint, true);
    assert.equal(r.json.completeness.complete, false);
    assert.ok(r.json.completeness.checkpoint_summaries.some((id) => id.startsWith('01-02')),
      JSON.stringify(r.json.completeness));
  });

  test('13 raw objective-evidence names the checkpoint and every SUMMARY without a Self-Check, newline-terminated', () => {
    const r = run(project(files), 'verify', 'objective-evidence', '1', '--raw');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^Objective 01: 1\/2 TRDs have a final SUMMARY$/m);
    assert.match(r.stdout, /^checkpoints: .*01-02/m);
    assert.match(r.stdout, /^no_self_check: .*01-02/m);
    assert.ok(r.stdout.endsWith('\n'), JSON.stringify(r.stdout));
  });

  test('14 objective-completeness: a plan with only a checkpoint SUMMARY is incomplete', () => {
    const r = run(project(files), 'verify', 'objective-completeness', '1');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.json.complete, false);
    assert.ok(r.json.incomplete_jobs.some((id) => id.startsWith('01-02')), JSON.stringify(r.json));
    assert.ok(!r.json.incomplete_jobs.some((id) => id.startsWith('01-01')), JSON.stringify(r.json));
    assert.ok(r.json.errors.some((e) => /checkpoint/i.test(e) && e.includes('01-02')), JSON.stringify(r.json.errors));
    assert.equal(r.json.summary_count, 2);
  });
});
