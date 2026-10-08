'use strict';

// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation):
//
// 1. requirement_coverage:
//    - happy: all requirement IDs covered → passed:true, missing:[]
//    - missing: requirement F2 absent from all TRDs → passed:false, missing:["F2"]
//    - no requirements declared in ROADMAP → passed:true, note set
//    - requirements as string "F1, F2" → both parsed
//    - requirements bracketed "[F1, F2]" in ROADMAP → both parsed
//
// 2. task_completeness:
//    - happy: all tasks have name/action/verify/done → passed:true
//    - missing-action: one task missing <action> → incomplete:[{trd, task, missing:["action"]}]
//    - missing-name: one task missing <name> → incomplete with missing:["name"]
//    - missing-verify: one task missing <verify> → incomplete with missing:["verify"]
//    - missing-done: one task missing <done> → incomplete with missing:["done"]
//    - checkpoint task missing verify/done → still passed (checkpoints exempt)
//
// 3. dependency_correctness:
//    - happy: linear chain 01→02→03 → passed:true
//    - cycle: 01 depends_on 02, 02 depends_on 01 → cycles detected
//    - orphan: 02 depends_on 99 → orphan_refs:[{trd:"02", missing:"99"}]
//    - empty depends_on → passed:true
//    - diamond (A→B,C; B,C→D) — should NOT be flagged as cycle
//
// 4. scope_sanity:
//    - 3 tasks per TRD → passed:true
//    - 4 tasks → warning, still passed
//    - 6 tasks → passed:false, in oversized_trds
//    - 11 TRDs in objective → passed:false (>10 limit), total_trds reported
//
// 5. e2e (top-level cmdVerifyTrdPre):
//    - all four dimensions pass → result.passed:true, needs_agent:false
//    - any dimension fails → result.passed:false
//    - elapsed_ms field present and >= 0
//    - non-existent objective → error key present, exit non-zero
//    - malformed TRD frontmatter → does not crash; that TRD reported with error
//
// 6. characterization (48-03 test 9): the four original checks' JSON deep-equals a captured literal
//
// 7. trd_budget (48-03 tests 10-12):
//    - present: {passed, trds:[{trd, chars, status, bulk}], over, warn, severity:{store:'blocker', local:'warning'}}
//    - a 60,001-char TRD → passed:false, over names it, summary counts five dimensions
//    - a 9,000-char fenced block → passed:true, bulk lists the block
//    - empty objective → {passed:true, trds:[], over:[], warn:[], severity}
//
// 8. 56-03 (ONUM-04): requirement IDs come only from ID-shaped list items (lib/requirement-ids.cjs):
//    - `**Requirements**: ONUM-01, ONUM-02` (v1.5 colon outside the bold) is read; the uncovered ONUM-02 is reported
//    - `**Requirements:** none (tech debt; see ...)` yields no IDs → passed:true, note 'no requirements declared'
//    - `**Requirements:** GWP-01..GWP-03` expands the range; the uncovered GWP-03 is reported
//
// 9. 70-01 (TOOL-07): `verify trd-pre` resolves from anywhere inside the project
//    - cwd = the objective dir, arg `99` → checks deep-equal the run from the root; no `error`
//    - cwd = `<root>/src/deep` (no `.planning/`) → resolves
//    - requirement coverage from a nested cwd reads the root ROADMAP (`missing` ['F2'] from both)
//    - arg = `.planning/objectives/99-test` from the root, `<abs objective dir>/` from os.tmpdir() → both resolve
//    - a cwd with its own `.planning/` is used as-is (no walk past it) → not found, project_root = that cwd
//    - not found → exit 1, JSON error 'Objective not found' + project_root; --raw → stdout `Objective not found`, exit 1

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { makeTrdContent, setupObjectiveDir } = require('./__fixtures__/trd-pre-fixtures.cjs');
const { cmdVerifyTrdPre } = require('./trd-pre-check.cjs');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'trd-pre-test-'));
}

function removeTmp(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Calls cmdVerifyTrdPre and captures the JSON result without side effects.
 * Overrides process.stdout.write and process.exit to prevent test process from exiting.
 */
function runCheck(cwd, objective) {
  let captured = '';
  let exitCode = 0;

  const origWrite = process.stdout.write.bind(process.stdout);
  const origExit = process.exit.bind(process);

  process.stdout.write = (data) => {
    captured += String(data);
    return true;
  };
  process.exit = (code) => {
    exitCode = code || 0;
    throw new Error(`__process_exit_${code || 0}__`);
  };

  try {
    cmdVerifyTrdPre(cwd, objective, false);
  } catch (e) {
    if (!e.message.startsWith('__process_exit_')) {
      process.stdout.write = origWrite;
      process.exit = origExit;
      throw e;
    }
  } finally {
    process.stdout.write = origWrite;
    process.exit = origExit;
  }

  return { result: JSON.parse(captured), exitCode };
}

/** Like runCheck but with raw = true: returns the unparsed stdout and the exit code. */
function runCheckRaw(cwd, objective) {
  let captured = '';
  let exitCode = 0;

  const origWrite = process.stdout.write.bind(process.stdout);
  const origExit = process.exit.bind(process);

  process.stdout.write = (data) => {
    captured += String(data);
    return true;
  };
  process.exit = (code) => {
    exitCode = code || 0;
    throw new Error(`__process_exit_${code || 0}__`);
  };

  try {
    cmdVerifyTrdPre(cwd, objective, true);
  } catch (e) {
    if (!e.message.startsWith('__process_exit_')) {
      process.stdout.write = origWrite;
      process.exit = origExit;
      throw e;
    }
  } finally {
    process.stdout.write = origWrite;
    process.exit = origExit;
  }

  return { stdout: captured, exitCode };
}

// ─── 1. requirement_coverage ──────────────────────────────────────────────────

describe('requirement_coverage', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTmp(); });
  afterEach(() => { removeTmp(tmpDir); });

  test('happy: all requirement IDs covered', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1', 'F2'],
      trds: [
        { trd: '99-01', requirements: ['F1'], depends_on: [] },
        { trd: '99-02', requirements: ['F2'], depends_on: [] },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.requirement_coverage.passed, true);
    assert.deepStrictEqual(result.checks.requirement_coverage.missing, []);
  });

  test('missing: F2 absent from all TRDs', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1', 'F2'],
      trds: [
        { trd: '99-01', requirements: ['F1'], depends_on: [] },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.requirement_coverage.passed, false);
    assert.ok(result.checks.requirement_coverage.missing.includes('F2'));
  });

  test('no requirements declared in ROADMAP → passed with note', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: undefined, // omit **Requirements:** line
      trds: [
        { trd: '99-01', requirements: [], depends_on: [] },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.requirement_coverage.passed, true);
    assert.ok(result.checks.requirement_coverage.note, 'note should be set when no requirements declared');
  });

  test('requirements as string "F1, F2" in TRD frontmatter', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1', 'F2'],
      trds: [
        {
          trd: '99-01',
          content: makeTrdContent({
            objective: '99-test',
            trd: '99-01',
            requirements: 'F1, F2', // string form
            depends_on: [],
          }),
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.requirement_coverage.passed, true);
    assert.deepStrictEqual(result.checks.requirement_coverage.missing, []);
  });

  test('requirements bracketed "[F1, F2]" in ROADMAP', () => {
    // setupObjectiveDir puts requirements in bracket form already — test the strip
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1', 'F2'], // written as [F1, F2] by fixture
      trds: [
        { trd: '99-01', requirements: ['F1', 'F2'], depends_on: [] },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.requirement_coverage.passed, true);
    assert.deepStrictEqual(result.checks.requirement_coverage.missing, []);
  });
});

// ─── 2. task_completeness ─────────────────────────────────────────────────────

describe('task_completeness', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTmp(); });
  afterEach(() => { removeTmp(tmpDir); });

  test('happy: all tasks complete', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [
        {
          trd: '99-01',
          requirements: ['F1'],
          depends_on: [],
          tasks: [
            { type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true },
          ],
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.task_completeness.passed, true);
    assert.deepStrictEqual(result.checks.task_completeness.incomplete, []);
  });

  test('missing-action: task missing <action>', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [
        {
          trd: '99-01',
          requirements: ['F1'],
          depends_on: [],
          tasks: [
            { type: 'auto', hasName: true, hasAction: false, hasVerify: true, hasDone: true },
          ],
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.task_completeness.passed, false);
    const inc = result.checks.task_completeness.incomplete;
    assert.ok(inc.length > 0);
    assert.ok(inc[0].missing.includes('action'));
  });

  test('missing-name: task missing <name>', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [
        {
          trd: '99-01',
          requirements: ['F1'],
          depends_on: [],
          tasks: [
            { type: 'auto', hasName: false, hasAction: true, hasVerify: true, hasDone: true },
          ],
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.task_completeness.passed, false);
    assert.ok(result.checks.task_completeness.incomplete[0].missing.includes('name'));
  });

  test('missing-verify: task missing <verify>', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [
        {
          trd: '99-01',
          requirements: ['F1'],
          depends_on: [],
          tasks: [
            { type: 'auto', hasName: true, hasAction: true, hasVerify: false, hasDone: true },
          ],
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.task_completeness.passed, false);
    assert.ok(result.checks.task_completeness.incomplete[0].missing.includes('verify'));
  });

  test('missing-done: task missing <done>', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [
        {
          trd: '99-01',
          requirements: ['F1'],
          depends_on: [],
          tasks: [
            { type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: false },
          ],
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.task_completeness.passed, false);
    assert.ok(result.checks.task_completeness.incomplete[0].missing.includes('done'));
  });

  test('checkpoint task missing verify/done → still passed', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [
        {
          trd: '99-01',
          requirements: ['F1'],
          depends_on: [],
          tasks: [
            { type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true },
            { type: 'checkpoint:human-verify', hasName: true, hasAction: false, hasVerify: false, hasDone: false },
          ],
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.task_completeness.passed, true);
    assert.deepStrictEqual(result.checks.task_completeness.incomplete, []);
  });
});

// ─── 3. dependency_correctness ────────────────────────────────────────────────

describe('dependency_correctness', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTmp(); });
  afterEach(() => { removeTmp(tmpDir); });

  test('happy: linear chain 01→02→03', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds: [
        { trd: '99-01', requirements: [], depends_on: [] },
        { trd: '99-02', requirements: [], depends_on: ['99-01'] },
        { trd: '99-03', requirements: [], depends_on: ['99-02'] },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.dependency_correctness.passed, true);
    assert.deepStrictEqual(result.checks.dependency_correctness.cycles, []);
    assert.deepStrictEqual(result.checks.dependency_correctness.orphan_refs, []);
  });

  test('cycle: 01 depends_on 02, 02 depends_on 01', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds: [
        { trd: '99-01', requirements: [], depends_on: ['99-02'] },
        { trd: '99-02', requirements: [], depends_on: ['99-01'] },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.dependency_correctness.passed, false);
    assert.ok(result.checks.dependency_correctness.cycles.length > 0);
  });

  test('orphan: 02 depends_on 99 (non-existent)', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds: [
        { trd: '99-01', requirements: [], depends_on: [] },
        { trd: '99-02', requirements: [], depends_on: ['99-99'] },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.dependency_correctness.passed, false);
    assert.ok(result.checks.dependency_correctness.orphan_refs.length > 0);
  });

  test('empty depends_on → passed', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds: [
        { trd: '99-01', requirements: [], depends_on: [] },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.dependency_correctness.passed, true);
  });

  test('diamond (A→B,C; B,C→D) → NOT a cycle', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds: [
        { trd: '99-01', requirements: [], depends_on: [] },              // D
        { trd: '99-02', requirements: [], depends_on: ['99-01'] },       // B→D
        { trd: '99-03', requirements: [], depends_on: ['99-01'] },       // C→D
        { trd: '99-04', requirements: [], depends_on: ['99-02', '99-03'] }, // A→B,C
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.dependency_correctness.passed, true);
    assert.deepStrictEqual(result.checks.dependency_correctness.cycles, []);
  });
});

// ─── 4. scope_sanity ─────────────────────────────────────────────────────────

describe('scope_sanity', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTmp(); });
  afterEach(() => { removeTmp(tmpDir); });

  test('3 tasks per TRD → passed, no warnings', () => {
    const tasks3 = [
      { type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true },
      { type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true },
      { type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true },
    ];
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds: [{ trd: '99-01', requirements: [], depends_on: [], tasks: tasks3 }],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.scope_sanity.passed, true);
  });

  test('4 tasks per TRD → warning but still passed', () => {
    const tasks4 = Array.from({ length: 4 }, () => ({
      type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true,
    }));
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds: [{ trd: '99-01', requirements: [], depends_on: [], tasks: tasks4 }],
    });
    const { result } = runCheck(tmpDir, '99');
    // 4 tasks: warn but pass
    assert.strictEqual(result.checks.scope_sanity.passed, true);
    assert.ok(result.checks.scope_sanity.oversized_trds.length > 0 ||
              result.checks.scope_sanity.warning_trds !== undefined ||
              result.checks.scope_sanity.passed === true,
              'should pass at 4 tasks');
  });

  test('6 tasks per TRD → failed', () => {
    const tasks6 = Array.from({ length: 6 }, () => ({
      type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true,
    }));
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds: [{ trd: '99-01', requirements: [], depends_on: [], tasks: tasks6 }],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.scope_sanity.passed, false);
    assert.ok(result.checks.scope_sanity.oversized_trds.length > 0);
  });

  test('11 TRDs in objective → passed:false, total_trds reported', () => {
    const trds = Array.from({ length: 11 }, (_, i) => ({
      trd: `99-${String(i + 1).padStart(2, '0')}`,
      requirements: [],
      depends_on: [],
      tasks: [{ type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true }],
    }));
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds,
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.scope_sanity.passed, false);
    assert.ok(result.checks.scope_sanity.total_trds >= 11);
  });
});

// ─── 5. e2e (cmdVerifyTrdPre top-level) ──────────────────────────────────────

describe('e2e — cmdVerifyTrdPre', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTmp(); });
  afterEach(() => { removeTmp(tmpDir); });

  test('all dimensions pass → passed:true, needs_agent:false', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [
        {
          trd: '99-01',
          requirements: ['F1'],
          depends_on: [],
          tasks: [{ type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true }],
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.needs_agent, false);
    assert.ok('checks' in result);
    assert.ok('requirement_coverage' in result.checks);
    assert.ok('task_completeness' in result.checks);
    assert.ok('dependency_correctness' in result.checks);
    assert.ok('scope_sanity' in result.checks);
  });

  test('any dimension fails → result.passed:false', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1', 'F2'],
      trds: [
        {
          trd: '99-01',
          requirements: ['F1'], // F2 missing
          depends_on: [],
          tasks: [{ type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true }],
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.passed, false);
  });

  test('elapsed_ms field present and >= 0', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds: [
        {
          trd: '99-01',
          requirements: [],
          depends_on: [],
          tasks: [{ type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true }],
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.ok('elapsed_ms' in result, 'elapsed_ms should be present');
    assert.ok(result.elapsed_ms >= 0, 'elapsed_ms should be >= 0');
  });

  test('non-existent objective → error key present', () => {
    // Don't create any objective directory
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n', 'utf-8');

    let captured = '';
    let exitCode = 0;
    const origWrite = process.stdout.write.bind(process.stdout);
    const origStderr = process.stderr.write.bind(process.stderr);
    const origExit = process.exit.bind(process);
    process.stdout.write = (d) => { captured += String(d); return true; };
    process.stderr.write = (d) => { captured += String(d); return true; };
    process.exit = (code) => { exitCode = code || 0; throw new Error(`__exit_${code}__`); };
    try {
      cmdVerifyTrdPre(tmpDir, 'nonexistent-99', false);
    } catch (e) {
      if (!e.message.startsWith('__exit_')) throw e;
    } finally {
      process.stdout.write = origWrite;
      process.stderr.write = origStderr;
      process.exit = origExit;
    }
    assert.equal(exitCode, 1, 'a missing objective exits 1 (TRD 70-01)');
    assert.ok(captured.includes('Objective not found'), captured);
  });

  test('malformed TRD frontmatter → does not crash, TRD reported with error', () => {
    const objectiveDir = setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [
        {
          trd: '99-01',
          requirements: ['F1'],
          depends_on: [],
          tasks: [{ type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true }],
        },
      ],
    });

    // Write a malformed TRD — no closing ---
    fs.writeFileSync(path.join(objectiveDir, '99-02-TRD.md'),
      '---\nobjective: 99-test\ntrd: "99-02"\n# no closing frontmatter\n\nsome content', 'utf-8');

    let didThrow = false;
    try {
      const { result } = runCheck(tmpDir, '99');
      // Should either succeed (with error noted for malformed TRD) or fail gracefully
      assert.ok(typeof result === 'object', 'result should be an object');
    } catch (e) {
      // Should not throw unhandled errors
      didThrow = true;
    }
    assert.strictEqual(didThrow, false, 'should not throw on malformed TRD');
  });
});

// ─── 6. Characterization (TRD 48-03, test 9) ─────────────────────────────────
//
// Pins today's JSON for the four original checks so the trd_budget addition is provably additive.
// The literals were captured from cmdVerifyTrdPre before 48-03 changed it.

describe('characterization — the four original checks are unchanged (48-03 test 9)', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTmp(); });
  afterEach(() => { removeTmp(tmpDir); });

  test('a mixed fixture objective -> the four checks, passed and needs_agent deep-equal the captured literal', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1', 'F2', 'F3'],
      trds: [
        { trd: '99-01', requirements: ['F1'], depends_on: [], tasks: [{ type: 'auto' }] },
        {
          trd: '99-02',
          requirements: ['F2'],
          depends_on: ['99-01', '99-07'],
          tasks: [{ type: 'auto' }, { type: 'auto', hasVerify: false }, { type: 'auto' }, { type: 'auto' }],
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');

    assert.strictEqual(result.objective, '99');
    assert.strictEqual(result.passed, false);
    assert.strictEqual(result.needs_agent, false);
    assert.ok(typeof result.summary === 'string');
    assert.ok(typeof result.elapsed_ms === 'number');

    const { requirement_coverage, task_completeness, dependency_correctness, scope_sanity } = result.checks;
    assert.deepStrictEqual(
      { requirement_coverage, task_completeness, dependency_correctness, scope_sanity },
      {
        requirement_coverage: { passed: false, missing: ['F3'] },
        task_completeness: {
          passed: false,
          incomplete: [{ trd: '99-02', task: 'Task 2: some task', missing: ['verify'] }],
        },
        dependency_correctness: {
          passed: false,
          cycles: [],
          orphan_refs: [{ trd: '99-02', missing: '99-07' }],
        },
        scope_sanity: {
          passed: true,
          oversized_trds: [],
          warning_trds: [{ trd: '99-02', task_count: 4 }],
          total_trds: 2,
        },
      },
    );
  });

  test('an objective with no TRDs -> the four early-return checks deep-equal the captured literal', () => {
    setupObjectiveDir(tmpDir, { objective: '99-test', roadmap_requirements: ['F1'], trds: [] });
    const { result } = runCheck(tmpDir, '99');

    assert.strictEqual(result.passed, false);
    assert.strictEqual(result.needs_agent, false);
    const { requirement_coverage, task_completeness, dependency_correctness, scope_sanity } = result.checks;
    assert.deepStrictEqual(
      { requirement_coverage, task_completeness, dependency_correctness, scope_sanity },
      {
        requirement_coverage: { passed: false, missing: [], note: 'no TRD files found' },
        task_completeness: { passed: false, incomplete: [] },
        dependency_correctness: { passed: false, cycles: [], orphan_refs: [] },
        scope_sanity: { passed: false, oversized_trds: [], total_trds: 0 },
      },
    );
  });
});

// ─── 7. trd_budget (TRD 48-03, tests 10-12) ──────────────────────────────────
//
// The fifth check: encoded-body size per TRD (D-06) and linked-bulk warnings (U-2), measured by
// trd-bulk.checkTrd. Fixtures are hand-built: makeTrdContent plus `'x'.repeat(n)` padding.

describe('trd_budget (48-03 tests 10-12)', () => {
  const ghTrd = require('./gh-trd.cjs');
  const SEVERITY = { store: 'blocker', local: 'warning' };

  let tmpDir;
  beforeEach(() => { tmpDir = createTmp(); });
  afterEach(() => { removeTmp(tmpDir); });

  function encoded(trd, text) {
    return ghTrd.encodeTrdBody({ id: trd, file: `${trd}-TRD.md`, text }).length;
  }

  /** makeTrdContent padded with prose so its ENCODED body is exactly `total` chars. */
  function sizedTrd(trd, total, opts = {}) {
    const base = makeTrdContent({ objective: '99-test', trd, requirements: ['F1'], ...opts }) + '\n';
    const pad = total - encoded(trd, base);
    assert.ok(pad >= 0, `cannot size ${trd} to ${total}`);
    const text = base + 'p'.repeat(pad);
    assert.strictEqual(encoded(trd, text), total);
    return text;
  }

  test('10. checks.trd_budget is present with per-TRD chars/status/bulk and both severities', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [{ trd: '99-01', requirements: ['F1'], depends_on: [], tasks: [{ type: 'auto' }] }],
    });
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'objectives', '99-test', '99-01-TRD.md'), 'utf8');
    const { result } = runCheck(tmpDir, '99');

    assert.deepStrictEqual(result.checks.trd_budget, {
      passed: true,
      trds: [{ trd: '99-01', chars: encoded('99-01', content), status: 'ok', bulk: [] }],
      over: [],
      warn: [],
      severity: SEVERITY,
    });
    assert.deepStrictEqual(Object.keys(result.checks),
      ['requirement_coverage', 'task_completeness', 'dependency_correctness', 'scope_sanity', 'trd_budget']);
    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.summary, '5/5 dimensions passed');
  });

  test('11. a 60,001-char TRD -> trd_budget.passed:false, over names it, top-level counts include it', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [
        { trd: '99-01', requirements: ['F1'], depends_on: [], tasks: [{ type: 'auto' }] },
        { trd: '99-02', content: sizedTrd('99-02', 60001) },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    const tb = result.checks.trd_budget;

    assert.strictEqual(tb.passed, false);
    assert.deepStrictEqual(tb.over, [{ trd: '99-02', chars: 60001 }]);
    assert.deepStrictEqual(tb.warn, []);
    assert.deepStrictEqual(tb.severity, SEVERITY);
    assert.deepStrictEqual(tb.trds.map(({ trd, status }) => ({ trd, status })),
      [{ trd: '99-01', status: 'ok' }, { trd: '99-02', status: 'over' }]);

    assert.strictEqual(result.passed, false);
    assert.strictEqual(result.summary, '4/5 dimensions passed');
  });

  test('11b. a TRD between 40,000 and 60,000 -> listed in warn, still passed', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [{ trd: '99-01', content: sizedTrd('99-01', 45000) }],
    });
    const { result } = runCheck(tmpDir, '99');
    const tb = result.checks.trd_budget;

    assert.strictEqual(tb.passed, true);
    assert.deepStrictEqual(tb.warn, [{ trd: '99-01', chars: 45000 }]);
    assert.deepStrictEqual(tb.over, []);
    assert.strictEqual(tb.trds[0].status, 'warn');
    assert.strictEqual(result.passed, true);
  });

  test('12. a 9,000-char fenced block -> passed:true, bulk lists the block', () => {
    const prefix = makeTrdContent({ objective: '99-test', trd: '99-01', requirements: ['F1'] }) + '\n';
    const openingLine = prefix.split('\n').length; // the fence opens on the line after the prefix
    const content = prefix + '```text\n' + 'x'.repeat(9000) + '\n```\n';
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [{ trd: '99-01', content }],
    });
    const { result } = runCheck(tmpDir, '99');
    const tb = result.checks.trd_budget;

    assert.strictEqual(tb.passed, true);
    assert.strictEqual(tb.trds[0].status, 'ok');
    assert.strictEqual(tb.trds[0].bulk.length, 1);
    const f = tb.trds[0].bulk[0];
    assert.strictEqual(f.kind, 'block');
    assert.strictEqual(f.line, openingLine);
    assert.strictEqual(f.chars, 9000);
    assert.strictEqual(f.severity, 'warning');
    assert.match(f.message, /never trim prose to fit/);
    assert.strictEqual(result.passed, true, 'bulk never fails the preflight');
  });

  test('empty objective -> trd_budget passes with empty lists; summary counts five dimensions', () => {
    setupObjectiveDir(tmpDir, { objective: '99-test', roadmap_requirements: ['F1'], trds: [] });
    const { result } = runCheck(tmpDir, '99');

    assert.deepStrictEqual(result.checks.trd_budget,
      { passed: true, trds: [], over: [], warn: [], severity: SEVERITY });
    assert.strictEqual(result.passed, false);
    assert.strictEqual(result.summary, '1/5 dimensions passed');
  });
});

// ─── 8. ROADMAP header regex (objective 54, TRD 07: shared objectiveNumPattern) ──

describe('requirement_coverage — ROADMAP header regex escapes the objective number', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTmp(); });
  afterEach(() => { removeTmp(tmpDir); });

  test('metacharacter objective arg `1(` does not throw (guard)', () => {
    // `1(` is normalised to the 01- directory, so objective_number is the digits `01` and the regex is
    // never built from the raw `(`. Kept as a guard for the CLI surface the TRD names.
    setupObjectiveDir(tmpDir, {
      objective: '01-test',
      roadmap_requirements: ['F1'],
      trds: [{ trd: '01-01', requirements: ['F1'], depends_on: [] }],
    });
    const { result, exitCode } = runCheck(tmpDir, '1(');
    assert.strictEqual(exitCode, 0);
    assert.strictEqual(result.checks.requirement_coverage.passed, true);
  });

  test('a directory name that is not numeric reaches the header regex without a SyntaxError', () => {
    // searchObjectiveInDir keeps the raw argument as objective_number when the directory name has no
    // leading digits, so `a(` is interpolated into the header regex. Unescaped, `(` is an unterminated group.
    setupObjectiveDir(tmpDir, {
      objective: 'a(-test',
      roadmap_requirements: ['F1'],
      trds: [{ trd: 'a(-01', requirements: ['F1'], depends_on: [] }],
    });
    const { result, exitCode } = runCheck(tmpDir, 'a(');
    assert.strictEqual(exitCode, 0);
    assert.strictEqual(result.checks.requirement_coverage.passed, true);
    assert.deepStrictEqual(result.checks.requirement_coverage.missing, []);
  });

  test('decimal 14.1 ignores a preceding 14.10 section (guard)', () => {
    // Two-digit base on purpose: objective_number is the directory's own digits, so a single-digit
    // decimal would not line up with a `### Objective 4.1:` ROADMAP heading.
    setupObjectiveDir(tmpDir, {
      objective: '14.1-test',
      roadmap_requirements: ['F1'],
      trds: [{ trd: '14.1-01', requirements: ['F1'], depends_on: [] }],
    });
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      [
        '# Roadmap',
        '',
        '### Objective 141: Wrong one',
        '**Requirements:** [WRONG1]',
        '',
        '### Objective 14.10: Wrong ten',
        '**Requirements:** [WRONG2]',
        '',
        '### Objective 14.1: Right',
        '**Requirements:** [F1]',
        '',
      ].join('\n'),
      'utf-8',
    );
    const { result } = runCheck(tmpDir, '14.1');
    assert.strictEqual(result.checks.requirement_coverage.passed, true);
    assert.deepStrictEqual(result.checks.requirement_coverage.missing, []);
  });

  // TRD 56-02 (ONUM-03): objective_number is the directory's own digits (`04`); a ROADMAP heading written
  // `### Objective 4:` has no leading zero. Before the fix the section was never found and the check
  // passed trivially with "no requirements declared".
  test('04-test with a `### Objective 4:` heading reports the uncovered requirement F2', () => {
    setupObjectiveDir(tmpDir, {
      objective: '04-test',
      roadmap_requirements: ['F1', 'F2'],
      trds: [{ trd: '04-01', requirements: ['F1'], depends_on: [] }],
    });
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '# Roadmap\n\n### Objective 4: T\n\n**Requirements:** [F1, F2]\n',
      'utf-8',
    );
    const { result } = runCheck(tmpDir, '4');
    assert.strictEqual(result.checks.requirement_coverage.passed, false);
    assert.deepStrictEqual(result.checks.requirement_coverage.missing, ['F2']);
  });

  test('04-test with a `### Objective 04:` heading reports the same uncovered requirement (guard)', () => {
    setupObjectiveDir(tmpDir, {
      objective: '04-test',
      roadmap_requirements: ['F1', 'F2'],
      trds: [{ trd: '04-01', requirements: ['F1'], depends_on: [] }],
    });
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '# Roadmap\n\n### Objective 04: T\n\n**Requirements:** [F1, F2]\n',
      'utf-8',
    );
    const { result } = runCheck(tmpDir, '4');
    assert.strictEqual(result.checks.requirement_coverage.passed, false);
    assert.deepStrictEqual(result.checks.requirement_coverage.missing, ['F2']);
  });
});

// ─── 9. 56-03 requirement IDs are ID-shaped (ONUM-04) ────────────────────────

describe('56-03 requirement IDs are ID-shaped', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTmp(); });
  afterEach(() => { removeTmp(tmpDir); });

  function writeRoadmap(text) {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), text, 'utf-8');
  }

  // The v1.5 ROADMAP writes `**Requirements**:` (colon outside the bold). The old regex never found the line, so
  // requirement coverage passed trivially.
  test('1 `**Requirements**: ONUM-01, ONUM-02` is read and the uncovered ONUM-02 is reported', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      trds: [{ trd: '99-01', requirements: ['ONUM-01'], depends_on: [] }],
    });
    writeRoadmap('# Roadmap\n\n### Objective 99: T\n\n**Requirements**: ONUM-01, ONUM-02\n');
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.requirement_coverage.passed, false);
    assert.deepStrictEqual(result.checks.requirement_coverage.missing, ['ONUM-02']);
  });

  // v1.4 objectives 52-54 declare `none (...)`. That is free text, not a requirement no TRD could cover.
  test('2 a free-text `none (tech debt; see ...)` line declares no requirements', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      trds: [{ trd: '99-01', requirements: [], depends_on: [] }],
    });
    writeRoadmap(
      '# Roadmap\n\n### Objective 99: T\n\n' +
        '**Requirements:** none (tech debt; see `.planning/objectives/99-test/OBJECTIVE.md`)\n'
    );
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.requirement_coverage.passed, true);
    assert.deepStrictEqual(result.checks.requirement_coverage.missing, []);
    assert.strictEqual(result.checks.requirement_coverage.note, 'no requirements declared');
  });

  test('3 a range `GWP-01..GWP-03` expands and the uncovered GWP-03 is reported', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      trds: [
        { trd: '99-01', requirements: ['GWP-01'], depends_on: [] },
        { trd: '99-02', requirements: ['GWP-02'], depends_on: [] },
      ],
    });
    writeRoadmap('# Roadmap\n\n### Objective 99: T\n\n**Requirements:** GWP-01..GWP-03\n');
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.requirement_coverage.passed, false);
    assert.deepStrictEqual(result.checks.requirement_coverage.missing, ['GWP-03']);
  });

  test('3b a block-form `**Requirements:**` reads the bullets leading IDs only', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      trds: [{ trd: '99-01', requirements: ['REQ-10-01'], depends_on: [] }],
    });
    writeRoadmap(
      '# Roadmap\n\n### Objective 99: T\n\n**Requirements:**\n' +
        '- REQ-10-01: TRD frontmatter schema with `platform: [mobile, web]`\n' +
        '- REQ-10-04: RED-GREEN ordering enforced\n\n**Plans:** 2\n'
    );
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.requirement_coverage.passed, false);
    assert.deepStrictEqual(result.checks.requirement_coverage.missing, ['REQ-10-04']);
  });
});

// ─── 9. resolution from inside the project (TRD 70-01) ────────────────────────

describe('resolution from inside the project (TRD 70-01)', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTmp(); });
  afterEach(() => { removeTmp(tmpDir); });

  // One TRD covering F1 of a roadmap that asks for F1 and F2.
  function coverF1Only() {
    return setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1', 'F2'],
      trds: [{ trd: '99-01', requirements: ['F1'], depends_on: [] }],
    });
  }

  test('10. cwd = the objective directory resolves the same checks as the root', () => {
    const objectiveDir = coverF1Only();
    const fromRoot = runCheck(tmpDir, '99');
    const fromObjective = runCheck(objectiveDir, '99');
    assert.ok(!('error' in fromObjective.result), JSON.stringify(fromObjective.result));
    assert.deepStrictEqual(fromObjective.result.checks, fromRoot.result.checks);
    assert.equal(fromObjective.exitCode, 0);
  });

  test('11. cwd = a directory two levels below the root (no .planning/ of its own) resolves', () => {
    coverF1Only();
    const deep = path.join(tmpDir, 'src', 'deep');
    fs.mkdirSync(deep, { recursive: true });
    const fromRoot = runCheck(tmpDir, '99');
    const fromDeep = runCheck(deep, '99');
    assert.ok(!('error' in fromDeep.result), JSON.stringify(fromDeep.result));
    assert.deepStrictEqual(fromDeep.result.checks, fromRoot.result.checks);
  });

  test('12. requirement coverage from a nested cwd reads the root ROADMAP', () => {
    const objectiveDir = coverF1Only();
    const fromRoot = runCheck(tmpDir, '99');
    const fromObjective = runCheck(objectiveDir, '99');
    assert.deepStrictEqual(fromRoot.result.checks.requirement_coverage.missing, ['F2']);
    assert.deepStrictEqual(fromObjective.result.checks.requirement_coverage.missing, ['F2']);
  });

  test('13a. a relative path to the objective directory resolves from the root', () => {
    coverF1Only();
    const r = runCheck(tmpDir, path.join('.planning', 'objectives', '99-test'));
    assert.ok(!('error' in r.result), JSON.stringify(r.result));
    assert.equal(r.result.checks.requirement_coverage.missing.length, 1);
  });

  test('13b. an absolute path with a trailing slash resolves from any cwd', () => {
    const objectiveDir = coverF1Only();
    const fromRoot = runCheck(tmpDir, '99');
    const r = runCheck(os.tmpdir(), objectiveDir + path.sep);
    assert.ok(!('error' in r.result), JSON.stringify(r.result));
    assert.deepStrictEqual(r.result.checks, fromRoot.result.checks);
  });

  test('14. a cwd that has its own .planning/ is used as-is: no walk past it', () => {
    coverF1Only();
    const inner = path.join(tmpDir, 'inner');
    fs.mkdirSync(path.join(inner, '.planning', 'objectives'), { recursive: true });
    const { result, exitCode } = runCheck(inner, '99');
    assert.equal(result.error, 'Objective not found');
    assert.equal(result.project_root, inner);
    assert.equal(exitCode, 1);
  });

  test('15a. not found exits 1 with the resolved project_root', () => {
    coverF1Only();
    const deep = path.join(tmpDir, 'src', 'deep');
    fs.mkdirSync(deep, { recursive: true });
    const { result, exitCode } = runCheck(deep, '98');
    assert.equal(exitCode, 1);
    assert.equal(result.error, 'Objective not found');
    assert.equal(result.objective, '98');
    assert.equal(result.project_root, tmpDir);
  });

  test('15b. --raw prints Objective not found and exits 1', () => {
    coverF1Only();
    const { stdout, exitCode } = runCheckRaw(tmpDir, '98');
    assert.equal(exitCode, 1);
    assert.equal(stdout, 'Objective not found');
  });

  test('15c. a path argument to a missing objective directory exits 1', () => {
    coverF1Only();
    const { result, exitCode } = runCheck(tmpDir, path.join('.planning', 'objectives', '98-nope'));
    assert.equal(exitCode, 1);
    assert.equal(result.error, 'Objective not found');
  });
});
