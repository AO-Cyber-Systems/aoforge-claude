'use strict';

// TRD 36-04a — migration 0001 config-stamp (test list items 1-10).
//
// no_llm_test_data: every config below is hand-written. Projects and homes are mkdtemp dirs; the
// real ~/.claude is never read or written.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const upgrade = require('../upgrade.cjs');
const { loadConfig } = require('../config.cjs');
const fx = require('../__fixtures__/upgrade-fixtures.cjs');

const MIGRATION_PATH = path.join(__dirname, '0001-config-stamp.cjs');
const TEMPLATE_PATH = path.join(__dirname, '..', '..', '..', 'templates', 'config.json');
const CONFIG_REL = '.planning/config.json';

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function m0001() {
  return require(MIGRATION_PATH);
}

function track(dir) {
  cleanup.push(dir);
  return dir;
}

// A project with `.planning/` and, optionally, a config.json. `config` is an object (written as
// JSON), a string (written verbatim) or null (no config.json at all).
function makeConfigProject(config) {
  const root = track(fs.mkdtempSync(path.join(os.tmpdir(), 'df-m0001-project-')));
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  if (config !== null) {
    const body = typeof config === 'string' ? config : JSON.stringify(config, null, 2) + '\n';
    fs.writeFileSync(path.join(root, CONFIG_REL), body, 'utf-8');
  }
  return root;
}

function ctxFor(root, { dryRun = false } = {}) {
  const home = track(fx.makeFakeHome());
  return { projectRoot: root, userHome: home, pluginVersion: '2.11.0', dryRun, options: {} };
}

function readConfigJson(root) {
  return JSON.parse(fs.readFileSync(path.join(root, CONFIG_REL), 'utf-8'));
}

function template() {
  return JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf-8'));
}

describe('migration 0001 config-stamp', () => {
  test('1. contract: id 0001, safety auto, semver since; loadRegistry() (default dir) includes it', () => {
    const m = m0001();
    assert.equal(m.id, '0001');
    assert.equal(m.safety, 'auto');
    assert.match(m.since, /^\d+\.\d+\.\d+$/);
    assert.equal(typeof m.title, 'string');
    assert.ok(m.title.trim().length > 0);
    assert.equal(typeof m.detect, 'function');
    assert.equal(typeof m.apply, 'function');
    assert.equal(typeof m.buildConfig, 'function');
    assert.equal(typeof m.FLAT_TO_NESTED, 'object');

    const registry = upgrade.loadRegistry();
    const entry = registry.find((r) => r.id === '0001');
    assert.ok(entry, 'registry includes 0001');
    assert.equal(entry.safety, 'auto');
  });

  test('2. no config.json -> detect applies (absent); apply writes the template shape', () => {
    const m = m0001();
    const root = makeConfigProject(null);
    const ctx = ctxFor(root);

    const det = m.detect(ctx);
    assert.equal(det.applies, true);
    assert.match(det.reason, /absent/);

    const res = m.apply(ctx);
    assert.deepEqual(res.changed, [CONFIG_REL]);
    const written = readConfigJson(root);
    for (const section of ['workflow', 'planning', 'parallelization', 'gates']) {
      assert.equal(typeof written[section], 'object', `has ${section}`);
      assert.ok(written[section] !== null && !Array.isArray(written[section]));
    }

    // A directory that is not a DevFlow project (no .planning/) is never given one.
    const bare = track(fs.mkdtempSync(path.join(os.tmpdir(), 'df-m0001-bare-')));
    const bareDet = m.detect(ctxFor(bare));
    assert.equal(bareDet.applies, false);
    assert.equal(fs.existsSync(path.join(bare, '.planning')), false);
  });

  test('3. v1 flat config -> detect names the flat keys; apply nests them', () => {
    const m = m0001();
    const root = track(fx.makeV1Project());
    const ctx = ctxFor(root);

    const det = m.detect(ctx);
    assert.equal(det.applies, true);
    for (const key of ['commit_docs', 'research', 'job_checker', 'verifier', 'branching_strategy', 'parallelization']) {
      assert.ok(det.reason.includes(key), `reason names ${key}: ${det.reason}`);
    }

    m.apply(ctx);
    const after = readConfigJson(root);
    for (const key of ['commit_docs', 'research', 'job_checker', 'verifier', 'branching_strategy']) {
      assert.equal(Object.prototype.hasOwnProperty.call(after, key), false, `top-level ${key} removed`);
    }
    assert.equal(after.workflow.job_check, false);
    assert.equal(after.workflow.research, false);
    assert.equal(after.workflow.verifier, true);
    assert.equal(after.planning.commit_docs, true);
    assert.equal(after.parallelization.enabled, false);
    assert.equal(after.git.branching_strategy, 'none');
    assert.equal(after.model_profile, 'quality');
  });

  describe('4. semantic equivalence: loadConfig(before) deep-equals loadConfig(after)', () => {
    const cases = {
      'a) v1 flat': () => ({ ...fx.V1_FLAT_CONFIG }),
      'b) current nested template': () => template(),
      'c) conflict: flat research:false AND nested workflow.research:true': () => ({
        research: false,
        workflow: { research: true, job_check: true },
      }),
      'd) mode autonomous, no verifier_checkpoints/decision_queue': () => ({
        mode: 'autonomous',
        workflow: { research: true },
      }),
      'e) parallelization:false': () => ({ parallelization: false }),
      'f) empty object': () => ({}),
    };

    for (const [name, build] of Object.entries(cases)) {
      test(name, () => {
        const m = m0001();
        const root = makeConfigProject(build());
        const before = loadConfig(root);
        m.apply(ctxFor(root));
        const after = loadConfig(root);
        assert.deepEqual(after, before);
      });
    }
  });

  test('5. unknown keys, github and an existing devflow stamp survive apply unchanged', () => {
    const m = m0001();
    const github = {
      enabled: true,
      repo: 'acme/app',
      milestone_prefix: 'rel-',
      labels: { objective: 'acme:objective', in_progress: 'acme:wip', gaps: 'acme:gaps' },
    };
    const root = makeConfigProject({
      ...fx.V1_FLAT_CONFIG,
      my_custom: 1,
      github,
      devflow: { version: '2.0.0' },
    });
    m.apply(ctxFor(root));
    const after = readConfigJson(root);
    assert.equal(after.my_custom, 1);
    // Every user github value survives; the only keys added are documented template defaults
    // (TRD 46-08 added github.project_cache_ttl_minutes to the template).
    const templateGithub = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'templates', 'config.json'), 'utf-8')).github;
    // Recursive: a user object (github.labels) keeps every key it set; keys it did not set are template defaults
    // (TRD 47-12 added github.labels.trd / .decision, which the migration's deep merge fills in).
    const survives = (user, got, template, at) => {
      for (const [k, v] of Object.entries(user)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) survives(v, got[k], (template && template[k]) || {}, `${at}.${k}`);
        else assert.deepEqual(got[k], v, `${at}.${k}`);
      }
      for (const k of Object.keys(got).filter((key) => !(key in user))) {
        assert.deepEqual(got[k], template ? template[k] : undefined, `${at}.${k} is a template default`);
      }
    };
    survives(github, after.github, templateGithub, 'github');
    assert.deepEqual(after.devflow, { version: '2.0.0' });
  });

  test('6. current nested template config -> detect does not apply', () => {
    const m = m0001();
    const root = makeConfigProject(template());
    const det = m.detect(ctxFor(root));
    assert.equal(det.applies, false);
  });

  test('7. unparseable config.json -> not applicable, and a runner apply() leaves its bytes alone', () => {
    const m = m0001();
    const raw = '{ "mode": "yolo", \n';
    const root = makeConfigProject(raw);
    const ctx = ctxFor(root);

    const det = m.detect(ctx);
    assert.equal(det.applies, false);
    assert.match(det.reason, /not valid JSON/);

    const report = upgrade.apply({ projectRoot: root, userHome: ctx.userHome, pluginVersion: '2.11.0' });
    assert.ok(!report.applied.some((a) => a.id === '0001'), '0001 not applied');
    assert.equal(fs.readFileSync(path.join(root, CONFIG_REL), 'utf-8'), raw);
  });

  test('8. dryRun returns changed and writes nothing', () => {
    const m = m0001();
    for (const root of [track(fx.makeV1Project()), makeConfigProject(null)]) {
      const before = fx.snapshot(root);
      const res = m.apply(ctxFor(root, { dryRun: true }));
      assert.deepEqual(res.changed, [CONFIG_REL]);
      assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(root)), []);
    }
  });

  test('9. second apply is a no-op: detect false after the first apply', () => {
    const m = m0001();
    for (const root of [track(fx.makeV1Project()), makeConfigProject(null), makeConfigProject({ mode: 'autonomous' })]) {
      const ctx = ctxFor(root);
      assert.equal(m.detect(ctx).applies, true);
      m.apply(ctx);
      const once = fs.readFileSync(path.join(root, CONFIG_REL), 'utf-8');
      assert.equal(m.detect(ctx).applies, false);
      assert.deepEqual(m.buildConfig(JSON.parse(once)), JSON.parse(once));
    }
  });

  test('10. buildConfig(null) equals the parsed template exactly', () => {
    const m = m0001();
    assert.deepEqual(m.buildConfig(null), template());
    // It is a fresh object each time — callers may mutate it.
    const a = m.buildConfig(null);
    a.workflow.research = false;
    assert.equal(m.buildConfig(null).workflow.research, true);
  });
});
