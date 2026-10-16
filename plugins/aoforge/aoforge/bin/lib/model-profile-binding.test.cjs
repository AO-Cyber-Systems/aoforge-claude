'use strict';
// TRD 76-01 — the profile an agent resolves to is the one the project asked for.
//
// resolve-model used to read only config.model_profile, so an OBJECTIVE.md
// `overrides: model_profile` and the (kind, work) defaults table never reached a
// spawn. These tests pin the precedence documented on resolveProfile in init.cjs.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const AOF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');

function makeProject({ config, objectives = {} }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mpb-'));
  const plan = path.join(root, '.aoforge');
  fs.mkdirSync(path.join(plan, 'objectives'), { recursive: true });
  fs.writeFileSync(path.join(plan, 'PROJECT.md'), '---\nkind: library\n---\n\n# P\n');
  fs.writeFileSync(path.join(plan, 'config.json'), JSON.stringify(config || {}));
  for (const [dir, fm] of Object.entries(objectives)) {
    fs.mkdirSync(path.join(plan, 'objectives', dir));
    fs.writeFileSync(path.join(plan, 'objectives', dir, 'OBJECTIVE.md'), `---\n${fm}\n---\n\n# O\n`);
  }
  return root;
}

function resolve(root, agent, objective) {
  const args = [AOF_TOOLS, 'resolve-model', agent];
  if (objective) args.push('--objective', objective);
  const r = spawnSync(process.execPath, args, {
    cwd: root, encoding: 'utf8', env: { ...process.env, HOME: root },
  });
  return JSON.parse(r.stdout);
}

describe('TRD 76-01 — model profile precedence', () => {
  const objectives = {
    '01-feat': 'work: feature',
    '02-spike': 'work: spike',
    '03-pinned': 'work: feature\noverrides:\n  model_profile: budget',
  };

  test('unset config stays balanced even for a feature objective (no silent raise)', () => {
    const root = makeProject({ objectives });
    const r = resolve(root, 'executor', '1');
    assert.equal(r.profile, 'balanced');
    assert.equal(r.profile_source, 'default');
  });

  test('an explicit config profile applies to every objective', () => {
    const root = makeProject({ config: { model_profile: 'budget' }, objectives });
    assert.equal(resolve(root, 'executor', '1').profile, 'budget');
    assert.equal(resolve(root, 'executor', '1').profile_source, 'config');
  });

  test('"auto" takes the (kind, work) defaults-table cell per objective', () => {
    const root = makeProject({ config: { model_profile: 'auto' }, objectives });
    const feat = resolve(root, 'executor', '1');
    assert.equal(feat.profile, 'quality');
    assert.equal(feat.profile_source, 'defaults_table');
    assert.equal(feat.tier, 'opus');
    assert.equal(resolve(root, 'executor', '2').profile, 'budget');
  });

  test('"auto" with no objective falls back to balanced', () => {
    const root = makeProject({ config: { model_profile: 'auto' }, objectives });
    const r = resolve(root, 'executor');
    assert.equal(r.profile, 'balanced');
    assert.equal(r.profile_source, 'default');
  });

  test('an OBJECTIVE.md override beats the config profile', () => {
    const root = makeProject({ config: { model_profile: 'quality' }, objectives });
    const r = resolve(root, 'executor', '3');
    assert.equal(r.profile, 'budget');
    assert.equal(r.profile_source, 'objective_override');
  });

  test('init execute-objective binds the objective profile into its model fields', () => {
    const root = makeProject({ config: { model_profile: 'auto' }, objectives });
    const r = spawnSync(process.execPath, [AOF_TOOLS, 'init', 'execute-objective', '1'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, HOME: root },
    });
    const init = JSON.parse(r.stdout);
    assert.equal(init.executor_model, 'inherit', 'feature objective on auto → quality → opus → inherit');
  });
});
