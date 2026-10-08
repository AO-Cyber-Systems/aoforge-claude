'use strict';

/**
 * Hand-built inputs for the AOForge rename codemod (scripts/aoforge-rename.cjs).
 *
 * Nothing here is generated: every sample is typed out so a reader can see
 * exactly which rule it exercises. The samples are laid out like this
 * repository (plugins/devflow/devflow/bin/lib, plugins/devflow/hooks,
 * .planning, docs, site) so the codemod's path rules, preserves and skips run
 * against realistic paths.
 *
 * This file spells the legacy names on purpose: it is the codemod's fixture,
 * and `__fixtures__/legacy-*` is on the allow-list for legacy spellings.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// Mode applied to the one executable sample, mirroring the agent-shell stubs.
const EXEC_STUB = 'plugins/devflow/devflow/bin/lib/__fixtures__/agent-shell/bin/df-tools';

/** @returns {Record<string, string>} relPath -> file content. */
function sampleFiles() {
  return {
    // ── runtime entry point: names + one planning shape + an env var ─────────
    'plugins/devflow/devflow/bin/df-tools.cjs': [
      '#!/usr/bin/env node',
      "'use strict';",
      "const path = require('path');",
      "const sample = require('./lib/sample.cjs');",
      '',
      'const gate = process.env.DEVFLOW_X;',
      'const cwd = process.cwd();',
      "const cfg = path.join(cwd, '.planning', 'config.json');",
      "console.log('df-tools', sample, gate, cfg);",
      '',
    ].join('\n'),

    // ── a lib: every planning shape the codemod must handle ──────────────────
    'plugins/devflow/devflow/bin/lib/sample.cjs': [
      "'use strict';",
      "const fs = require('fs');",
      "const path = require('path');",
      '',
      '// Where DevFlow keeps its state: .planning/STATE.md',
      'function statePath(cwd) {',
      "  return path.join(cwd, '.planning', 'STATE.md');",
      '}',
      '',
      'function planningDir(cwd) {',
      "  return path.join(cwd, '.planning');",
      '}',
      '',
      'function objectivesDir(ctx) {',
      "  return path.resolve(ctx.root, '.planning', 'objectives');",
      '}',
      '',
      "const CONFIG = '.planning/config.json';",
      'const PLANNING_RE = /\\/\\.planning\\//;',
      '',
      'module.exports = { fs, statePath, planningDir, objectivesDir, CONFIG, PLANNING_RE };',
      '',
    ].join('\n'),

    // ── stub of the 72-02 resolver; it spells no legacy name ─────────────────
    'plugins/devflow/devflow/bin/lib/compat.cjs': [
      "'use strict';",
      "const path = require('path');",
      '',
      '/** Stub of the 72-02 resolver: joins the project directory name. */',
      'function planningRoot(root) {',
      "  return path.join(root, 'project-dir');",
      '}',
      '',
      'module.exports = { planningRoot };',
      '',
    ].join('\n'),

    // ── a hook reaches the runtime through ../devflow/bin/lib ────────────────
    'plugins/devflow/hooks/a.js': [
      "'use strict';",
      "const path = require('path');",
      "const store = require('../devflow/bin/lib/hook-marker-store.cjs');",
      '',
      'const cwd = process.cwd();',
      "const marker = path.join(cwd, '.planning', '.skill-active');",
      "console.log(store, marker, 'devflow:executor');",
      '',
    ].join('\n'),

    // ── a skill: prose with command, banner, mirror path and planning file ──
    'plugins/devflow/skills/quick/SKILL.md': [
      '---',
      'name: quick',
      'description: Run /devflow:quick for a small task',
      '---',
      '',
      '# DF ► QUICK',
      '',
      'Run `node ~/.claude/devflow/bin/df-tools.cjs state load`.',
      'DevFlow builds the plan. Read @~/.claude/devflow/references/checkpoints.md',
      'and .planning/STATE.md. Set DEVFLOW_SKIP_EDIT_GATE=1 to bypass.',
      '',
    ].join('\n'),

    // ── file-scoped preserve: fleet repo names are data ──────────────────────
    'plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs': [
      "'use strict';",
      '// Fleet rows: the repository names are data, not the product name.',
      'const FLEET = [',
      "  { repo: 'devflow', gates: 'test' },",
      "  { repo: 'devflow-test', gates: 'none' },",
      '];',
      "const HELP = 'Run /devflow:quick to start';",
      'module.exports = { FLEET, HELP };',
      '',
    ].join('\n'),

    // ── manual: a sibling plugin lists directories to skip ───────────────────
    'plugins/monorepo-standards/skills/monorepo-doctor/lib/doctor.js': [
      "'use strict';",
      "const SKIP_DIRS = new Set(['node_modules', '.git', '.devflow', '.planning']);",
      'module.exports = { SKIP_DIRS };',
      '',
    ].join('\n'),

    // ── a watch daemon and a CI workflow: basename moves ─────────────────────
    'plugins/devflow/devflow/bin/devflow-watch.cjs': [
      "'use strict';",
      "console.log('devflow-watch started');",
      '',
    ].join('\n'),

    '.github/workflows/devflow-checks.yml': [
      'name: devflow-checks',
      'on: [push]',
      'jobs:',
      '  checks:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: node plugins/devflow/devflow/bin/df-tools.cjs validate health',
      '',
    ].join('\n'),

    // ── global preserves: the domain and the other product ───────────────────
    'site/hugo.toml': [
      "baseURL = 'https://devflow.cloud/'",
      "title = 'DevFlow'",
      '',
    ].join('\n'),

    'README.md': [
      '# DevFlow',
      '',
      'Source: https://github.com/AO-Cyber-Systems/devflow-claude',
      'Not to be confused with devflowops, a different product.',
      '',
    ].join('\n'),

    // ── skipped content: history and the project planning tree ───────────────
    'CHANGELOG.md': [
      '## [1.0.0]',
      '- DevFlow first release; /devflow:quick; .planning/STATE.md',
      '',
    ].join('\n'),

    'docs/PROPOSAL-x.md': [
      '# Proposal',
      'DevFlow proposal that reads .planning/ROADMAP.md through df-tools.',
      '',
    ].join('\n'),

    // ── the one docs file that is rewritten ──────────────────────────────────
    'docs/USER-GUIDE.md': [
      '# User guide',
      'Run /devflow:quick then check .planning/STATE.md.',
      '',
    ].join('\n'),

    '.planning/STATE.md': [
      '# State',
      'DevFlow state lives at .planning/STATE.md.',
      '',
    ].join('\n'),

    // ── skipped by name: legacy spellings are allowed here ───────────────────
    'plugins/devflow/devflow/bin/lib/legacy-names.cjs': [
      "'use strict';",
      "const LEGACY = { product: 'DevFlow', cli: 'df-tools', planningDir: '.planning' };",
      'module.exports = { LEGACY };',
      '',
    ].join('\n'),

    'plugins/devflow/devflow/bin/lib/x.legacy.test.cjs': [
      "'use strict';",
      "const legacyCommand = '/devflow:quick';",
      "const legacyDir = '.planning';",
      'module.exports = { legacyCommand, legacyDir };',
      '',
    ].join('\n'),

    // ── binary: a NUL byte means the file is never rewritten ────────────────
    'assets/x.bin': 'devflow\u0000DevFlow df-tools .planning',

    // ── executable stub: git mv must keep the mode ───────────────────────────
    [EXEC_STUB]: [
      '#!/bin/sh',
      'echo "df-tools stub"',
      '',
    ].join('\n'),
  };
}

/** Scratch repo environment: nothing inherited that could redirect git. */
function cleanEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k.startsWith('GIT_')) delete env[k];
  }
  return env;
}

/** Run git in `cwd`; throws with stderr on a non-zero exit. */
function git(cwd, args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', ...args], {
    cwd,
    env: cleanEnv(),
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed (${r.status}): ${r.stderr}`);
  }
  return r.stdout;
}

/**
 * A clean git repository containing every sample, committed once.
 * @param {Record<string,string>} [extra] additional files written before the commit
 * @returns {{ root: string, cleanup: () => void, git: (...args: string[]) => string }}
 */
function scratchRepo(extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aof-rename-'));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'rename@example.invalid']);
  git(root, ['config', 'user.name', 'Rename Fixture']);
  git(root, ['config', 'commit.gpgsign', 'false']);

  const files = { ...sampleFiles(), ...extra };
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  fs.chmodSync(path.join(root, EXEC_STUB), 0o755);

  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'fixture: sample tree']);

  return {
    root,
    git: (...args) => git(root, args),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

module.exports = { sampleFiles, scratchRepo, EXEC_STUB };
