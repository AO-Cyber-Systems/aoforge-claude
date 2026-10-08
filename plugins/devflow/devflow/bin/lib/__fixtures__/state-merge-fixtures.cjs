'use strict';

// Hand-built fixtures for the state.json / STATE_ARCHIVE.md merge (TRD 59-01). No generated data.
//
//   stateDoc(overrides)          a full state.json object, key order and defaults copied literally from
//                                lib/state.cjs STATE_JSON_DEFAULTS (not required from there, so this
//                                fixture pins the shape the merge must preserve); `metrics` merges one level
//   decision(obj, summary, why)  one `decisions` entry exactly as `state add-decision` writes it
//   stateText(obj)               the bytes writeStateJson writes: JSON.stringify(obj, null, 2), no newline
//   archiveText({decisions, metrics})
//                                STATE_ARCHIVE.md in the ARCHIVE_SEED shape; decisions become the bullets
//                                cmdStateAddDecision writes, metrics become the rows cmdStateRecordMetric writes
//   makeWaveRepo({state, archive})
//                                a hermetic temp repository holding .planning/state.json and
//                                .planning/STATE_ARCHIVE.md in one base commit on `main`, plus helpers to
//                                branch, commit and run git
//
// Every git call goes through `gitTestEnv(home)` (GIT_CONFIG_GLOBAL=/dev/null, temp HOME, explicit identity)
// plus a repository-local `commit.gpgsign false`. Nothing outside os.tmpdir() is written, and this
// repository's git configuration is never touched.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { gitTestEnv } = require('./wiki-remote.cjs');

// Variables that would point git at the repository the test runner is itself inside.
const LEAKY = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_NAMESPACE',
];

function stateDoc(overrides = {}) {
  const doc = {
    current_objective: null,
    current_job: 0,
    total_jobs: 0,
    progress_pct: 0,
    status: null,
    last_activity: null,
    metrics: { jobs_completed: 0, jobs_failed: 0, sessions: 0 },
    decisions: [],
    blockers: [],
    session_log: [],
  };
  for (const key of Object.keys(overrides)) {
    if (key === 'metrics') doc.metrics = Object.assign({}, doc.metrics, overrides.metrics);
    else doc[key] = overrides[key];
  }
  return doc;
}

function decision(objective, summary, rationale = null) {
  return { objective, summary, rationale };
}

function stateText(obj) {
  return JSON.stringify(obj, null, 2);
}

function archiveText({ decisions = [], metrics = [] } = {}) {
  const bullets = decisions.length === 0
    ? '- *(none yet)*'
    : decisions
      .map((d) => `- [Objective ${d.objective || '?'}]: ${d.summary}${d.rationale ? ` — ${d.rationale}` : ''}`)
      .join('\n');
  const rows = metrics
    .map((m) => `| Objective ${m.objective} P${m.job} | ${m.duration} | ${m.tasks || '-'} tasks | ${m.files || '-'} files |`)
    .join('\n');
  return [
    '# State Archive',
    '',
    'Append-only log. Written by df-tools `add-decision` and `record-metric`.',
    'STATE.md stays lean; this file grows over time.',
    '',
    '## Decisions',
    '',
    bullets,
    '',
    '## Performance Metrics',
    '',
    '| Objective | Duration | Tasks | Files |',
    '|-----------|----------|-------|-------|',
    ...(rows ? [rows] : []),
    '',
  ].join('\n');
}

function makeWaveRepo({ state, archive }) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-wave-')));
  const home = path.join(base, 'home');
  const root = path.join(base, 'repo');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(root, { recursive: true });

  const env = { ...process.env, ...gitTestEnv(home) };
  for (const key of LEAKY) delete env[key];
  // A merge driver runs through `sh -c` with git's own environment: put the node that runs the tests
  // first on PATH so the driver really runs instead of silently falling back to `git merge-file`.
  env.PATH = path.dirname(process.execPath) + path.delimiter + (env.PATH || '');

  function run(args, opts = {}) {
    return spawnSync('git', args, { cwd: opts.cwd || root, env, encoding: 'utf-8' });
  }

  function git(args, opts = {}) {
    const r = run(args, opts);
    if (r.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed (${r.status}): ${(r.stderr || '').trim()}`);
    }
    return (r.stdout || '').trim();
  }

  function writeFiles(files) {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(root, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, 'utf-8');
    }
  }

  const init = run(['init', '-b', 'main']);
  if (init.status !== 0) {
    git(['init']);
    git(['symbolic-ref', 'HEAD', 'refs/heads/main']);
  }
  git(['config', 'user.name', 'Test Author']);
  git(['config', 'user.email', 'author@example.invalid']);
  git(['config', 'commit.gpgsign', 'false']);

  writeFiles({
    '.planning/state.json': stateText(state),
    '.planning/STATE_ARCHIVE.md': archive,
  });
  git(['add', '-A']);
  git(['commit', '-m', 'base']);

  function branchWith(name, files) {
    git(['checkout', '-b', name, 'main']);
    writeFiles(files);
    git(['add', '-A']);
    git(['commit', '-m', `branch ${name}`]);
    git(['checkout', 'main']);
  }

  function cleanup() {
    fs.rmSync(base, { recursive: true, force: true });
  }

  return { root, env, git, run, branchWith, cleanup };
}

module.exports = { stateDoc, decision, stateText, archiveText, makeWaveRepo };
