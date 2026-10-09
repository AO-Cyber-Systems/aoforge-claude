'use strict';

/**
 * legacy-layout-fixtures.cjs (objective 72, TRD 72-05) — a minimal, valid planning tree in each layout.
 *
 *   const p = planningProject({ layout: 'legacy' });   // only the legacy `.planning/`
 *   p.run(['state', 'load', '--raw']);                  // spawn aof-tools --cwd <root>, hermetic env
 *   p.cleanup();
 *
 *   const w = worktreePair({ layout: 'legacy', marker: 'main' });  // TRD 72-06: main checkout + worktree,
 *   w.worktree; w.markerPath; w.cleanup();                         // live skill marker where asked
 *
 * Layouts:
 *   aoforge   only `.aoforge/` (the new default)
 *   legacy    only `.planning/` (the one-release fallback)
 *   both      both directories (an unfinished migration). The legacy copy differs in one line, STATE.md
 *             `**Status:** Legacy copy`, so a test can tell which tree a read came from.
 *   none      no planning directory (a repository AOForge has not touched yet)
 *
 * Legacy directory names may be spelled in this file: it is one of the `__fixtures__/legacy-*` files the
 * rename codemod and the rename guard leave alone. The names still come from legacy-names.cjs, so the
 * fixture follows the map if it ever changes.
 *
 * Hermetic: the fake HOME is a fresh temp directory, git runs with no system or global config, a local
 * identity and commit signing off, and the spawned tools see neither environment prefix (new or legacy)
 * from the caller.
 *
 * Every file below is a hand-written literal. No generated data.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { NAMES, LEGACY } = require('../legacy-names.cjs');

const AOF_TOOLS = path.join(__dirname, '..', '..', 'aof-tools.cjs');

const LAYOUTS = Object.freeze(['aoforge', 'legacy', 'both', 'none']);

// Variables that would point git at the repository the test runner itself is inside.
const GIT_REDIRECT_VARS = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_NAMESPACE',
];

const doc = (lines) => `${lines.join('\n')}\n`;

const PROJECT_MD = doc([
  '---',
  'kind: plugin',
  'default_work: feature',
  '---',
  '',
  '# Layout Demo',
  '',
  '## What This Is',
  '',
  'A fixture project for the planning-directory layout contract.',
  '',
  '## Core Value',
  '',
  'Every verb finds its planning tree.',
  '',
  '## Requirements',
  '',
  '- [ ] T-01: Every verb finds the planning tree',
]);

const ROADMAP_MD = doc([
  '# Roadmap: Layout Demo',
  '',
  '## Milestones',
  '',
  '- 🚧 **v1.0 First** - Objective 1 (in progress)',
  '',
  '## Objectives',
  '',
  '- [ ] **Objective 1: First** - Prove the layout resolver',
  '',
  '## Objective Details',
  '',
  '### Objective 1: First',
  '**Goal**: Every verb finds the planning tree',
  '**Depends on**: Nothing (first objective)',
  '**Requirements**: T-01',
  '**Success Criteria** (what must be TRUE):',
  '  1. Every verb reads and writes the resolved planning directory',
  '**Plans**: 1 TRD',
  '',
  'TRDs:',
  '- [ ] 01-01: X',
  '',
  '## Progress',
  '',
  '| Objective | TRDs Complete | Status | Completed |',
  '|-----------|---------------|--------|-----------|',
  '| 1. First | 0/1 | Not started | - |',
]);

const REQUIREMENTS_MD = doc([
  '# Requirements: Layout Demo',
  '',
  '## v1 Requirements',
  '',
  '- [ ] **T-01**: Every verb finds the planning tree',
  '',
  '## Traceability',
  '',
  '| Requirement | Objective | Status |',
  '|-------------|-----------|--------|',
  '| T-01 | Objective 1 | Pending |',
]);

const stateMd = (status) => doc([
  '# Project State',
  '',
  '## Current Position',
  '',
  '**Current Objective:** 1',
  '**Current Objective Name:** First',
  '**Current TRD:** 1',
  '**Total TRDs in Objective:** 1',
  `**Status:** ${status}`,
  '**Last Activity:** 2026-10-08',
  '**Last Activity Description:** Objective 1 planned',
  '',
  'Progress: [░░░░░░░░░░] 0%',
  '',
  '## Blockers',
  '',
  'None.',
]);

// workflow.auto_advance is false (the default is true), so a read that reached this file is visible.
const CONFIG_JSON = `${JSON.stringify({ mode: 'yolo', github: { enabled: false }, workflow: { auto_advance: false } }, null, 2)}\n`;

const OBJECTIVE_MD = doc([
  '---',
  'objective: 01-first',
  'work: feature',
  '---',
  '',
  '# Objective 1: First',
  '',
  '## Goal',
  '',
  'Every verb finds the planning tree.',
]);

const TRD_MD = doc([
  '---',
  'objective: 01-first',
  'trd: "01"',
  'type: standard',
  'wave: 1',
  'depends_on: []',
  'autonomous: true',
  'requirements: [T-01]',
  '---',
  '',
  '# TRD 01-01: X',
  '',
  '<task type="auto">',
  '  <name>Task 1: write x.txt</name>',
  '  <verify>test -f x.txt</verify>',
  '</task>',
]);

/** The minimal tree, relative to a planning directory. */
function tree(status) {
  return {
    'PROJECT.md': PROJECT_MD,
    'ROADMAP.md': ROADMAP_MD,
    'REQUIREMENTS.md': REQUIREMENTS_MD,
    'STATE.md': stateMd(status),
    'config.json': CONFIG_JSON,
    'objectives/01-first/OBJECTIVE.md': OBJECTIVE_MD,
    'objectives/01-first/01-01-x-TRD.md': TRD_MD,
  };
}

const CURRENT_STATUS = 'Ready to execute';
const LEGACY_COPY_STATUS = 'Legacy copy';

function writeTree(dir, files) {
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  }
}

/**
 * The environment for every git call and every spawned aof-tools: hermetic, no product env prefix, and a
 * TMPDIR inside the fixture (planning drafts live under os.tmpdir(), so cleanup removes them too).
 */
function hermeticEnv(home, tmp) {
  const env = { ...process.env };
  for (const key of GIT_REDIRECT_VARS) delete env[key];
  for (const key of Object.keys(env)) {
    if (key.startsWith(NAMES.envPrefix) || key.startsWith(LEGACY.envPrefix)) delete env[key];
  }
  env.HOME = home;
  env.XDG_CONFIG_HOME = path.join(home, '.config');
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_CONFIG_GLOBAL = path.join(home, '.gitconfig');
  env.TMPDIR = tmp;
  return env;
}

function git(root, env, args) {
  const r = spawnSync('git', ['-C', root, ...args], { env, encoding: 'utf-8' });
  if (r.error) throw new Error(`git ${args.join(' ')}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed (${r.status}): ${(r.stderr || '').trim()}`);
  return r.stdout;
}

/**
 * A temp project with a minimal, valid planning tree in `layout`.
 *
 * @param {object} [opts]
 * @param {'aoforge'|'legacy'|'both'|'none'} [opts.layout='aoforge']
 * @param {boolean} [opts.git=true]   git init with a local identity and one commit of everything
 * @param {Object<string,string>} [opts.files={}]  extra files, relative to each planning directory
 *        present (to the root for layout `none`), written before the commit
 * @returns {{ root: string, home: string, dir: string|null, layout: string, env: object,
 *             run: function(string[], object=): {status: number, stdout: string, stderr: string, out: string},
 *             git: function(string[]): string, cleanup: function(): void }}
 *   `dir` is the absolute planning directory the tools should use: `.aoforge/` for layouts aoforge and both,
 *   `.planning/` for legacy, null for none.
 */
function planningProject({ layout = 'aoforge', git: withGit = true, files = {} } = {}) {
  if (!LAYOUTS.includes(layout)) {
    throw new Error(`planningProject: unknown layout ${JSON.stringify(layout)} (expected one of ${LAYOUTS.join(', ')})`);
  }
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aof-layout-')));
  const root = path.join(base, 'repo');
  const home = path.join(base, 'home');
  const tmp = path.join(base, 'tmp');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.mkdirSync(tmp, { recursive: true });

  const newDir = path.join(root, NAMES.planningDir);
  const oldDir = path.join(root, LEGACY.planningDir);

  if (layout === 'aoforge' || layout === 'both') writeTree(newDir, { ...tree(CURRENT_STATUS), ...files });
  if (layout === 'legacy') writeTree(oldDir, { ...tree(CURRENT_STATUS), ...files });
  if (layout === 'both') writeTree(oldDir, { ...tree(LEGACY_COPY_STATUS), ...files });
  if (layout === 'none') {
    writeTree(root, { 'README.md': '# Layout Demo\n', ...files });
  }

  const env = hermeticEnv(home, tmp);
  if (withGit) {
    git(root, env, ['init', '-q', '-b', 'main']);
    git(root, env, ['config', 'user.name', 'Layout Fixture']);
    git(root, env, ['config', 'user.email', 'layout@example.invalid']);
    git(root, env, ['config', 'commit.gpgsign', 'false']);
    git(root, env, ['config', 'tag.gpgsign', 'false']);
    git(root, env, ['add', '-A']);
    git(root, env, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init']);
  }

  const dir = layout === 'legacy' ? oldDir : layout === 'none' ? null : newDir;

  /** Spawn aof-tools with `--cwd <root>` from a neutral directory, so only `--cwd` can find the project. */
  const run = (args, { cwd = base, extraEnv = {} } = {}) => {
    const r = spawnSync(process.execPath, [AOF_TOOLS, '--cwd', root, ...args], {
      cwd, env: { ...env, ...extraEnv }, encoding: 'utf-8', timeout: 60000,
    });
    const stdout = r.stdout || '';
    const stderr = r.stderr || '';
    return { status: r.status, stdout, stderr, out: stdout + stderr };
  };

  return {
    root,
    home,
    tmp,
    dir,
    layout,
    env,
    run,
    git: (args) => git(root, env, args),
    cleanup: () => fs.rmSync(base, { recursive: true, force: true }),
  };
}

// ─── worktreePair (TRD 72-06) ─────────────────────────────────────────────────

const MARKER_PLACES = Object.freeze(['main', 'local', 'none']);
const MARKER_FILE = '.skill-active';
const MARKER_TTL_MS = 8 * 60 * 60 * 1000;

/** The marker payload, in the shape `aof-tools skill-active --start` writes (skill-active.cjs startSkill). */
function markerText(nowMs = Date.now()) {
  const payload = {
    skill: 'execute-objective',
    started_at: new Date(nowMs).toISOString(),
    pid: process.pid,
    expires_at: new Date(nowMs + MARKER_TTL_MS).toISOString(),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/**
 * The planning directory a tree resolves to, by name only (no compat import: the fixture spells the map
 * itself, so a resolver bug cannot hide in the fixture): the new one when present, else the legacy one.
 */
function resolvedPlanningDir(root) {
  for (const name of [NAMES.planningDir, LEGACY.planningDir]) {
    const p = path.join(root, name);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
  }
  return null;
}

/**
 * A main checkout in `layout` (a git planningProject) plus a linked worktree of it on a new branch, with a
 * live skill marker in the main checkout's planning directory (`main`), the worktree's (`local`), or nowhere
 * (`none`).
 *
 * The marker file is listed in the repository's `info/exclude` (shared by every worktree), the way the
 * upgrade hook excludes its runtime notices file, so neither checkout reports it as untracked. A worktree
 * checks out the tracked planning files only: the marker in the main checkout is invisible from the
 * worktree's own planning directory, exactly as with the real gitignored marker.
 *
 * @param {object} [opts]
 * @param {'aoforge'|'legacy'|'both'|'none'} [opts.layout='aoforge']
 * @param {'main'|'local'|'none'} [opts.marker='main']
 * @returns {{ main: string, worktree: string, home: string, env: object, layout: string, marker: string,
 *             markerPath: string|null, mainDir: string|null, worktreeDir: string|null, cleanup: function(): void }}
 */
function worktreePair({ layout = 'aoforge', marker = 'main' } = {}) {
  if (!MARKER_PLACES.includes(marker)) {
    throw new Error(`worktreePair: unknown marker ${JSON.stringify(marker)} (expected one of ${MARKER_PLACES.join(', ')})`);
  }
  if (layout === 'none' && marker !== 'none') {
    throw new Error('worktreePair: layout none has no planning directory to hold a marker');
  }
  const project = planningProject({ layout, git: true });
  const base = path.dirname(project.root);
  const main = project.root;
  const worktree = path.join(base, 'wt');
  try {
    project.git(['worktree', 'add', '-q', '-b', 'wt-branch', worktree]);

    const mainDir = resolvedPlanningDir(main);
    const worktreeDir = resolvedPlanningDir(worktree);

    let markerPath = null;
    if (marker !== 'none') {
      const dir = marker === 'main' ? mainDir : worktreeDir;
      const excludeRel = project.git(['rev-parse', '--git-common-dir']).trim();
      const exclude = path.resolve(main, excludeRel, 'info', 'exclude');
      fs.mkdirSync(path.dirname(exclude), { recursive: true });
      const line = `/${path.basename(dir)}/${MARKER_FILE}\n`;
      const prior = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf-8') : '';
      fs.writeFileSync(exclude, prior + (prior && !prior.endsWith('\n') ? '\n' : '') + line);
      markerPath = path.join(dir, MARKER_FILE);
      fs.writeFileSync(markerPath, markerText());
    }

    return {
      main,
      worktree,
      home: project.home,
      tmp: project.tmp,
      env: project.env,
      layout,
      marker,
      markerPath,
      mainDir,
      worktreeDir,
      git: (cwd, args) => git(cwd, project.env, args),
      cleanup: project.cleanup,
    };
  } catch (e) {
    project.cleanup();
    throw e;
  }
}

module.exports = {
  LAYOUTS,
  MARKER_PLACES,
  CURRENT_STATUS,
  LEGACY_COPY_STATUS,
  planningProject,
  worktreePair,
  markerText,
};
