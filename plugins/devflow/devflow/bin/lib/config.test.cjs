'use strict';

const { describe, test, afterEach, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { loadConfig, documentedDefault, resolveConfigValue } = require('./config.cjs');
const { buildPlanningDirWithConfig } = require('./__fixtures__/autonomous-fixtures.cjs');

let tmpdir;

afterEach(() => {
  if (tmpdir && fs.existsSync(tmpdir)) {
    fs.rmSync(tmpdir, { recursive: true, force: true });
    tmpdir = null;
  }
});

describe('loadConfig', () => {

  // Case 1: mode "autonomous" → autonomous:true + derived workflow flags true
  test('1. mode autonomous → autonomous:true, verifier_checkpoints:true, decision_queue:true', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, { mode: 'autonomous' });
    const cfg = loadConfig(tmpdir);
    assert.strictEqual(cfg.mode, 'autonomous');
    assert.strictEqual(cfg.autonomous, true);
    assert.strictEqual(cfg.verifier_checkpoints, true);
    assert.strictEqual(cfg.decision_queue, true);
  });

  // Case 2: mode "yolo" → autonomous:false + workflow flags false
  test('2. mode yolo → autonomous:false, verifier_checkpoints:false, decision_queue:false', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, { mode: 'yolo' });
    const cfg = loadConfig(tmpdir);
    assert.strictEqual(cfg.mode, 'yolo');
    assert.strictEqual(cfg.autonomous, false);
    assert.strictEqual(cfg.verifier_checkpoints, false);
    assert.strictEqual(cfg.decision_queue, false);
  });

  // Case 3: mode "interactive" → autonomous:false
  test('3. mode interactive → autonomous:false', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, { mode: 'interactive' });
    const cfg = loadConfig(tmpdir);
    assert.strictEqual(cfg.mode, 'interactive');
    assert.strictEqual(cfg.autonomous, false);
  });

  // Case 4: missing config.json → defaults (mode yolo, autonomous false)
  test('4. missing config.json → defaults (mode:yolo, autonomous:false)', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, null);
    const cfg = loadConfig(tmpdir);
    assert.strictEqual(cfg.mode, 'yolo');
    assert.strictEqual(cfg.autonomous, false);
    assert.strictEqual(cfg.verifier_checkpoints, false);
    assert.strictEqual(cfg.decision_queue, false);
  });

  // Case 5: nested form { workflow: { mode: "autonomous" } } → autonomous:true
  test('5. nested workflow.mode autonomous → autonomous:true', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, { workflow: { mode: 'autonomous' } });
    const cfg = loadConfig(tmpdir);
    assert.strictEqual(cfg.mode, 'autonomous');
    assert.strictEqual(cfg.autonomous, true);
    assert.strictEqual(cfg.verifier_checkpoints, true);
    assert.strictEqual(cfg.decision_queue, true);
  });

  // Case 6: explicit override: mode autonomous + workflow.verifier_checkpoints:false → false
  test('6. autonomous mode with explicit verifier_checkpoints:false → verifier_checkpoints:false', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, {
      mode: 'autonomous',
      workflow: { verifier_checkpoints: false },
    });
    const cfg = loadConfig(tmpdir);
    assert.strictEqual(cfg.autonomous, true);
    assert.strictEqual(cfg.verifier_checkpoints, false);
    assert.strictEqual(cfg.decision_queue, true);
  });

  // Case 7: explicit opt-in outside autonomous: mode yolo + workflow.decision_queue:true → true
  test('7. yolo mode with explicit decision_queue:true → decision_queue:true', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, {
      mode: 'yolo',
      workflow: { decision_queue: true },
    });
    const cfg = loadConfig(tmpdir);
    assert.strictEqual(cfg.autonomous, false);
    assert.strictEqual(cfg.decision_queue, true);
  });

  // Case 8: malformed JSON → defaults returned, no throw
  test('8. malformed JSON config → defaults returned, no throw', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, '{ this is not json }');
    let cfg;
    assert.doesNotThrow(() => { cfg = loadConfig(tmpdir); });
    assert.strictEqual(cfg.mode, 'yolo');
    assert.strictEqual(cfg.autonomous, false);
    assert.strictEqual(cfg.verifier_checkpoints, false);
    assert.strictEqual(cfg.decision_queue, false);
  });

  // Case 9: back-compat — all pre-existing loadConfig keys still present and unchanged for yolo config
  test('9. back-compat: all pre-existing keys present for yolo config', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, {
      mode: 'yolo',
      auto_advance: true,
      model_profile: 'quality',
      commit_docs: false,
      search_gitignored: true,
      branching_strategy: 'none',
      parallelization: true,
      brave_search: false,
    });
    const cfg = loadConfig(tmpdir);
    // New keys present
    assert.strictEqual(cfg.autonomous, false);
    assert.strictEqual(cfg.verifier_checkpoints, false);
    assert.strictEqual(cfg.decision_queue, false);
    // All pre-existing keys intact
    assert.strictEqual(cfg.mode, 'yolo');
    assert.strictEqual(cfg.auto_advance, true);
    assert.strictEqual(cfg.model_profile, 'quality');
    assert.strictEqual(cfg.commit_docs, false);
    assert.strictEqual(cfg.search_gitignored, true);
    assert.strictEqual(cfg.branching_strategy, 'none');
    assert.strictEqual(cfg.parallelization, true);
    assert.strictEqual(cfg.brave_search, false);
    // Shape completeness — keys not absent
    assert.ok('research' in cfg);
    assert.ok('job_checker' in cfg);
    assert.ok('verifier' in cfg);
    // Dead keys must NOT appear in return value
    assert.ok(!('require_verification' in cfg), 'require_verification must not be in return value');
    assert.ok(!('require_tests' in cfg), 'require_tests must not be in return value');
  });

});

describe('dead gates removed', () => {

  afterEach(() => {
    if (tmpdir && fs.existsSync(tmpdir)) {
      fs.rmSync(tmpdir, { recursive: true, force: true });
      tmpdir = null;
    }
  });

  // TRD 10-08 Test 1: loadConfig return has NO require_verification or require_tests keys
  test('10. loadConfig return has no require_verification or require_tests keys', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, { mode: 'yolo' });
    const cfg = loadConfig(tmpdir);
    assert.strictEqual('require_verification' in cfg, false, 'require_verification must not be in return');
    assert.strictEqual('require_tests' in cfg, false, 'require_tests must not be in return');
  });

  // TRD 10-08 Test 2: legacy config with gates.require_verification/require_tests → loads without crash; dead keys absent from return; live keys correct
  test('11. legacy config with gates.require_verification/require_tests loads fine; dead keys absent from return', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, {
      mode: 'yolo',
      gates: {
        require_verification: true,
        require_tests: true,
        confirm_project: true,
        confirm_objectives: true,
      },
    });
    let cfg;
    assert.doesNotThrow(() => { cfg = loadConfig(tmpdir); });
    // Dead keys must not appear in return
    assert.strictEqual('require_verification' in cfg, false, 'require_verification must not be in return');
    assert.strictEqual('require_tests' in cfg, false, 'require_tests must not be in return');
    // Live keys correct
    assert.strictEqual(cfg.mode, 'yolo');
    assert.strictEqual(cfg.autonomous, false);
  });

  // TRD 10-08 Test 3: legacy flat-form config with top-level require_tests: false → ignored silently
  test('12. legacy flat-form top-level require_tests: false is ignored silently', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, {
      mode: 'yolo',
      require_tests: false,
    });
    let cfg;
    assert.doesNotThrow(() => { cfg = loadConfig(tmpdir); });
    assert.strictEqual('require_tests' in cfg, false, 'require_tests must not be in return');
    assert.strictEqual(cfg.mode, 'yolo');
  });

  // TRD 10-08 Test 4: defaults path (missing config) → no dead keys in defaults shape
  test('13. defaults path (missing config.json) has no dead keys', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, null); // no config file
    const cfg = loadConfig(tmpdir);
    assert.strictEqual('require_verification' in cfg, false, 'require_verification must not be in defaults');
    assert.strictEqual('require_tests' in cfg, false, 'require_tests must not be in defaults');
  });

});

// ─── TRD 44-07: config-get answers known-but-unset keys with the documented default ──
//
// The real df-tools is spawned with `--cwd <tmp>`, so no case ever reads this repo's own
// .planning/config.json. The documented defaults live in templates/config.json — the tests read
// that same file for their expectations rather than restating its values.

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const TEMPLATE_CONFIG = path.join(__dirname, '..', '..', 'templates', 'config.json');

function runConfigGet(dir, args) {
  const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', dir, 'config-get', ...args], {
    encoding: 'utf-8',
  });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}

/** Every leaf dot-path of an object (arrays and null are leaves; plain objects are sections). */
function leafPaths(obj, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) out.push(...leafPaths(value, p));
    else out.push(p);
  }
  return out;
}

describe('config-get documented defaults', () => {
  const made = [];

  function projectWith(configObj) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-get-'));
    made.push(dir);
    buildPlanningDirWithConfig(dir, configObj);
    return dir;
  }

  afterEach(() => {
    while (made.length) fs.rmSync(made.pop(), { recursive: true, force: true });
  });

  test('1. known keys unset in config.json answer with the documented default, exit 0 (--raw)', () => {
    const dir = projectWith({ mode: 'yolo' });
    for (const [key, expected] of [
      ['workflow.auto_advance', 'true'],
      ['workflow.parallelization', 'true'],
      ['gates.editGate', 'strict'],
      ['parallelization.max_concurrent_agents', '3'],
    ]) {
      const r = runConfigGet(dir, [key, '--raw']);
      assert.strictEqual(r.status, 0, `${key}: expected exit 0, stderr=${r.stderr}`);
      assert.strictEqual(r.stdout, expected, key);
      assert.strictEqual(r.stderr, '', `${key}: expected no error text`);
    }
  });

  test('2. a set key returns its configured value, not the default', () => {
    const dir = projectWith({ workflow: { auto_advance: false } });
    const r = runConfigGet(dir, ['workflow.auto_advance', '--raw']);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stdout, 'false');
  });

  test('3. unknown keys, sections and prototype names still fail with Key not found', () => {
    const dir = projectWith({ mode: 'yolo' });
    for (const key of ['workflow.nope', 'totally.unknown.key', 'workflow', 'constructor', 'toString']) {
      const r = runConfigGet(dir, [key, '--raw']);
      assert.strictEqual(r.status, 1, `${key}: expected exit 1, stdout=${r.stdout}`);
      assert.strictEqual(r.stdout, '', `${key}: expected no stdout`);
      assert.ok(r.stderr.includes(`Key not found: ${key}`), `${key}: stderr=${r.stderr}`);
    }
  });

  test('4. a missing config.json keeps the existing error', () => {
    const dir = projectWith(null);
    const r = runConfigGet(dir, ['workflow.auto_advance', '--raw']);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /No config\.json found/);
  });

  test('5. a default prints exactly what the same value set in config.json prints (JSON and --raw)', () => {
    const unset = projectWith({ mode: 'yolo' });
    const set = projectWith(JSON.parse(fs.readFileSync(TEMPLATE_CONFIG, 'utf-8')));
    for (const key of [
      'workflow.auto_advance',
      'gates.editGate',
      'parallelization.max_concurrent_agents',
      'awareness.branch_patterns', // array leaf
      'awareness.eden_libs_path', // null leaf
    ]) {
      for (const flags of [[], ['--raw']]) {
        const fromDefault = runConfigGet(unset, [key, ...flags]);
        const fromSet = runConfigGet(set, [key, ...flags]);
        assert.strictEqual(fromSet.status, 0, `${key} ${flags}: set-value control failed: ${fromSet.stderr}`);
        assert.strictEqual(fromDefault.status, 0, `${key} ${flags}: stderr=${fromDefault.stderr}`);
        assert.strictEqual(fromDefault.stdout, fromSet.stdout, `${key} ${flags}`);
      }
    }
  });

  test('6. documentedDefault answers only for leaf keys and documented aliases', () => {
    const template = JSON.parse(fs.readFileSync(TEMPLATE_CONFIG, 'utf-8'));
    assert.deepStrictEqual(documentedDefault('workflow.auto_advance'), { known: true, value: true });
    assert.deepStrictEqual(documentedDefault('workflow.parallelization'), { known: true, value: true });
    assert.deepStrictEqual(documentedDefault('workflow.mode'), { known: true, value: template.mode });
    const patterns = documentedDefault('awareness.branch_patterns');
    assert.strictEqual(patterns.known, true);
    assert.ok(Array.isArray(patterns.value));
    assert.deepStrictEqual(patterns.value, template.awareness.branch_patterns);
    assert.deepStrictEqual(documentedDefault('awareness.eden_libs_path'), { known: true, value: null });
    assert.deepStrictEqual(documentedDefault('workflow'), { known: false });
    assert.deepStrictEqual(documentedDefault('github.labels'), { known: false });
    assert.deepStrictEqual(documentedDefault('nope'), { known: false });
    assert.deepStrictEqual(documentedDefault('constructor'), { known: false });
    assert.deepStrictEqual(documentedDefault('workflow.auto_advance.x'), { known: false });
    assert.deepStrictEqual(documentedDefault('awareness.branch_patterns.0'), { known: false });
  });

  test('7. every leaf of templates/config.json is a known key with the template value (single source)', () => {
    const template = JSON.parse(fs.readFileSync(TEMPLATE_CONFIG, 'utf-8'));
    const leaves = leafPaths(template);
    assert.ok(leaves.length > 40, `expected the full template, got ${leaves.length} leaves`);
    for (const leaf of leaves) {
      const expected = leaf.split('.').reduce((node, k) => node[k], template);
      assert.deepStrictEqual(documentedDefault(leaf), { known: true, value: expected }, leaf);
    }
  });

  test('8. an unreadable or malformed template falls back to unknown (today\'s Key not found)', () => {
    const dir = projectWith(null);
    const broken = path.join(dir, 'broken-config.json');
    fs.writeFileSync(broken, '{ not json');
    assert.deepStrictEqual(documentedDefault('workflow.auto_advance', path.join(dir, 'absent.json')), { known: false });
    assert.deepStrictEqual(documentedDefault('workflow.auto_advance', broken), { known: false });
  });

  // A default must never contradict a value the user DID set in a form loadConfig reads:
  // `"parallelization": true|false` (the shape new-project and config-ensure-section write),
  // flat `commit_docs`/`auto_advance`, `workflow.mode`, and the mode-derived
  // verifier_checkpoints/decision_queue.
  test('9. an alias or legacy form the user set wins over the template default (CLI)', () => {
    for (const [config, key, expected] of [
      [{ parallelization: { enabled: false } }, 'workflow.parallelization', 'false'],
      [{ parallelization: false }, 'workflow.parallelization', 'false'],
      [{ parallelization: false }, 'parallelization.enabled', 'false'],
      [{ parallelization: false }, 'parallelization.max_concurrent_agents', '3'],
      [{ mode: 'autonomous' }, 'workflow.mode', 'autonomous'],
      [{ workflow: { mode: 'autonomous' } }, 'mode', 'autonomous'],
      [{ auto_advance: false }, 'workflow.auto_advance', 'false'],
      [{ commit_docs: false }, 'planning.commit_docs', 'false'],
      [{ mode: 'autonomous' }, 'workflow.decision_queue', 'true'],
    ]) {
      const r = runConfigGet(projectWith(config), [key, '--raw']);
      assert.strictEqual(r.status, 0, `${JSON.stringify(config)} ${key}: stderr=${r.stderr}`);
      assert.strictEqual(r.stdout, expected, `${JSON.stringify(config)} ${key}`);
    }
  });

  test('10. resolveConfigValue agrees with loadConfig on every field loadConfig resolves', () => {
    const PAIRS = [
      ['mode', 'mode'],
      ['auto_advance', 'workflow.auto_advance'],
      ['commit_docs', 'planning.commit_docs'],
      ['search_gitignored', 'planning.search_gitignored'],
      ['research', 'workflow.research'],
      ['job_checker', 'workflow.job_check'],
      ['verifier', 'workflow.verifier'],
      ['parallelization', 'workflow.parallelization'],
      ['parallelization', 'parallelization.enabled'],
      ['verifier_checkpoints', 'workflow.verifier_checkpoints'],
      ['decision_queue', 'workflow.decision_queue'],
    ];
    const SHAPES = [
      {},
      { mode: 'autonomous' },
      { workflow: { mode: 'autonomous' } },
      { parallelization: false },
      { parallelization: null },
      { parallelization: { enabled: false, job_level: true } },
      { parallelization: { job_level: true } },
      {
        auto_advance: false, commit_docs: false, search_gitignored: true, research: false,
        job_checker: false, verifier: false, verifier_checkpoints: true, decision_queue: true,
      },
      {
        mode: 'autonomous',
        workflow: { auto_advance: false, research: false, job_check: false, verifier: false, verifier_checkpoints: false },
        planning: { commit_docs: false, search_gitignored: true },
      },
    ];
    for (const shape of SHAPES) {
      const cfg = loadConfig(projectWith(shape));
      for (const [field, key] of PAIRS) {
        const r = resolveConfigValue(shape, key);
        assert.strictEqual(r.found, true, `${JSON.stringify(shape)} ${key}`);
        assert.deepStrictEqual(r.value, cfg[field], `${JSON.stringify(shape)} ${key} vs loadConfig().${field}`);
      }
    }
    assert.deepStrictEqual(resolveConfigValue({}, 'workflow.nope'), { found: false });
  });

});
