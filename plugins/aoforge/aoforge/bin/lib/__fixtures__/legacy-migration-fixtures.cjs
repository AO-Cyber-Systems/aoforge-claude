'use strict';

/**
 * legacy-migration-fixtures.cjs (objective 72, TRD 72-08) — a project a DevFlow 2.15.0 install left behind, in
 * each state migration 0012 (planning-dir move) and 0013 (config-key rename) must handle.
 *
 *   const p = legacyProject({ state: 'clean' });          // committed legacy tree, clean work tree
 *   p.root; p.home; p.env; p.git(['status']); p.cleanup();
 *
 * States:
 *   clean   every tracked file committed, `git status --porcelain` empty
 *   dirty   clean, then `.planning/STATE.md` modified (a tracked file with an unstaged edit)
 *   merge   clean, then a `MERGE_HEAD` in the git dir (a merge in progress)
 *   nogit   the same files, no repository at all
 *
 * Every state has:
 *   - the legacy planning tree from legacy-layout-fixtures.cjs `planningProject({ layout: 'legacy' })`
 *     (PROJECT, ROADMAP, REQUIREMENTS, STATE, one objective with one TRD) plus `state.json` and `STACK.md`;
 *   - `config.json` in the full nested template shape with the LEGACY stamp key
 *     (`devflow: { version: <stamp>, migrations_applied, upgraded_at }`), so 0001 has nothing to normalise;
 *     `stamp: null` writes no stamp key at all;
 *   - `.gitignore` with one legacy runtime line under the header 2.15.0's migration 0008 wrote;
 *   - an untracked `.planning/.skill-active`, excluded through `.git/info/exclude` (git states only).
 *
 * `store: true` (git states only) makes it a GitHub store-mode project as DevFlow's migration 0010 left it:
 * config `github.enabled` and `github.store` true, the legacy-marker 0010 block in `.gitignore` covering the cache,
 * and every planning file except config.json and STACK.md removed from the index (`git rm --cached`, committed),
 * so the cache is on disk, untracked and ignored.
 *
 * Legacy names may be spelled here: this is one of the `__fixtures__/legacy-*` files the rename codemod and the
 * rename guard leave alone. The bytes below are what a 2.15.0 install wrote, typed out by hand.
 *
 * Hermetic: the environment, fake HOME and git identity come from planningProject (no system or global git
 * config, commit signing off, neither product env prefix).
 */

const fs = require('fs');
const path = require('path');

const { planningProject } = require('./legacy-layout-fixtures.cjs');
const { LEGACY } = require('../legacy-names.cjs');

const STATES = Object.freeze(['clean', 'dirty', 'merge', 'nogit']);

const LEGACY_DIR = '.planning';
if (LEGACY.planningDir !== LEGACY_DIR) {
  throw new Error(`legacy-migration-fixtures: the legacy planning directory is no longer ${LEGACY_DIR}`);
}

// The 0008 header and one of its runtime lines, as DevFlow 2.15.0 wrote them.
const GITIGNORE = [
  'node_modules/',
  '',
  '# DevFlow runtime state (migration 0008)',
  '.planning/.progress-guard.json',
  '',
].join('\n');

// The 0010 store block, as DevFlow 2.15.0 wrote it (legacy markers, legacy directory).
const LEGACY_STORE_BLOCK = [
  '# >>> devflow store (0010) >>>',
  '.planning/*',
  '!.planning/config.json',
  '!.planning/STACK.md',
  '# <<< devflow store (0010) <<<',
].join('\n');

// The line the user's skill marker gets in .git/info/exclude.
const INFO_EXCLUDE_LINE = '.planning/.skill-active';

const MIGRATIONS_APPLIED = ['0001', '0003', '0005', '0008', '0009'];

/** A full-template-shape config.json with the legacy stamp key. Hand-typed; mirrors templates/config.json. */
function legacyConfig({ stamp, store }) {
  const config = {
    mode: 'yolo',
    depth: 'standard',
    job_checker_enabled: true,
    workflow: {
      research: true,
      job_check: true,
      verifier: true,
      auto_advance: false,
      verifier_checkpoints: false,
      decision_queue: false,
    },
    planning: { commit_docs: true, search_gitignored: false },
    parallelization: {
      enabled: true,
      job_level: true,
      task_level: false,
      skip_checkpoints: true,
      max_concurrent_agents: 3,
      min_jobs_for_parallel: 2,
    },
    gates: {
      confirm_project: true,
      confirm_objectives: true,
      confirm_roadmap: true,
      confirm_breakdown: true,
      confirm_job: true,
      execute_next_job: true,
      issues_review: true,
      confirm_transition: true,
      editGate: 'strict',
    },
    safety: { always_confirm_destructive: true, always_confirm_external_services: true },
    workstreams: { worktree_prefix: '../{project}-ws-', branch_prefix: 'df/ws-', merge_strategy: 'squash' },
    github: {
      enabled: !!store,
      store: !!store,
      mirror_only: false,
      repo: store ? 'example/legacy-demo' : '',
      milestone_prefix: 'v',
      project_cache_ttl_minutes: 360,
      app_login: '',
      app_id: '',
      checks_workflow: '',
      labels: {
        objective: 'devflow:objective',
        in_progress: 'devflow:in-progress',
        gaps: 'devflow:gaps',
        trd: 'devflow:trd',
        decision: 'devflow:decision',
      },
      wiki: { remote: '' },
      pr: { merge_method: 'squash' },
    },
    awareness: {
      cache_ttl_minutes: 10,
      peer_stale_days: 30,
      branch_patterns: ['feature/*', 'df/*', 'fix/*', 'proposal/*'],
      sibling_repos: [],
      eden_libs_path: null,
    },
    daemon: {
      notifications: false,
      notify_on_start: true,
      notify_on_complete: true,
      auto_launch: false,
      multi_project: false,
      cross_shell: [],
      status_line: false,
    },
  };
  if (stamp !== null && stamp !== undefined) {
    config.devflow = {
      version: stamp,
      migrations_applied: [...MIGRATIONS_APPLIED],
      upgraded_at: '2026-09-30T12:00:00.000Z',
    };
  }
  return `${JSON.stringify(config, null, 2)}\n`;
}

// state.json in state.cjs's shape for the layout fixture's STATE.md (so 0003 has nothing to seed).
const STATE_JSON = `${JSON.stringify({
  current_objective: '1',
  current_job: 1,
  total_jobs: 1,
  progress_pct: 0,
  status: 'Ready to execute',
  last_activity: '2026-10-08',
  metrics: { jobs_completed: 0, jobs_failed: 0, sessions: 0 },
  decisions: [],
  blockers: [],
  session_log: [],
}, null, 2)}\n`;

const STACK_MD = '# Stack\n\nNo commands yet.\n';

/**
 * A legacy project in `state`.
 *
 * @param {object} [opts]
 * @param {'clean'|'dirty'|'merge'|'nogit'} [opts.state='clean']
 * @param {boolean} [opts.store=false]  GitHub store mode with the legacy 0010 block (git states only)
 * @param {string|null} [opts.stamp='2.15.0']  the legacy stamp's version; null writes no stamp key
 * @returns {{ root: string, home: string, tmp: string, dir: string, env: object, state: string, store: boolean,
 *             git: function(string[]): string, run: function, cleanup: function(): void }}
 *   `dir` is the absolute legacy planning directory.
 */
function legacyProject({ state = 'clean', store = false, stamp = '2.15.0' } = {}) {
  if (!STATES.includes(state)) {
    throw new Error(`legacyProject: unknown state ${JSON.stringify(state)} (expected one of ${STATES.join(', ')})`);
  }
  if (store && state === 'nogit') throw new Error('legacyProject: store mode needs a git repository');

  const p = planningProject({
    layout: 'legacy',
    git: false,
    files: {
      'config.json': legacyConfig({ stamp, store }),
      'state.json': STATE_JSON,
      'STACK.md': STACK_MD,
    },
  });
  try {
    const root = p.root;
    const dir = path.join(root, LEGACY_DIR);
    fs.writeFileSync(path.join(root, '.gitignore'), GITIGNORE);
    fs.writeFileSync(path.join(dir, '.skill-active'), '{"skill":"execute-objective"}\n');

    if (state !== 'nogit') {
      p.git(['init', '-q', '-b', 'main']);
      p.git(['config', 'user.name', 'Legacy Fixture']);
      p.git(['config', 'user.email', 'legacy@example.invalid']);
      p.git(['config', 'commit.gpgsign', 'false']);
      p.git(['config', 'tag.gpgsign', 'false']);
      const exclude = path.join(root, '.git', 'info', 'exclude');
      fs.mkdirSync(path.dirname(exclude), { recursive: true });
      fs.writeFileSync(exclude, `# git ls-files --others --exclude-from=.git/info/exclude\n${INFO_EXCLUDE_LINE}\n`);

      p.git(['add', '-A']);
      p.git(['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init']);

      if (store) {
        // As 0010 left it: the block appended to .gitignore, then everything but config.json and STACK.md removed
        // from the index, both in one commit.
        fs.appendFileSync(path.join(root, '.gitignore'), `\n${LEGACY_STORE_BLOCK}\n`);
        const tracked = p.git(['ls-files', '-z', '--', LEGACY_DIR]).split('\0').filter(Boolean);
        const keep = new Set([`${LEGACY_DIR}/config.json`, `${LEGACY_DIR}/STACK.md`]);
        const untrack = tracked.filter((f) => !keep.has(f));
        p.git(['rm', '--cached', '--quiet', '--', ...untrack]);
        p.git(['add', '--', '.gitignore']);
        p.git(['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'chore: gitignore the planning cache (store mode)']);
      }

      if (state === 'dirty') {
        fs.appendFileSync(path.join(dir, 'STATE.md'), '\nAn edit the user has not committed.\n');
      }
      if (state === 'merge') {
        const head = p.git(['rev-parse', 'HEAD']).trim();
        fs.writeFileSync(path.join(root, '.git', 'MERGE_HEAD'), `${head}\n`);
      }
    }

    return {
      root,
      home: p.home,
      tmp: p.tmp,
      dir,
      env: p.env,
      state,
      store: !!store,
      git: p.git,
      run: p.run,
      cleanup: p.cleanup,
    };
  } catch (e) {
    p.cleanup();
    throw e;
  }
}

module.exports = {
  STATES,
  GITIGNORE,
  LEGACY_STORE_BLOCK,
  INFO_EXCLUDE_LINE,
  MIGRATIONS_APPLIED,
  legacyConfig,
  legacyProject,
};
