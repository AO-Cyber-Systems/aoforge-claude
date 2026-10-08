'use strict';

/**
 * planning-e2e-fixtures.cjs (TRD 48-22) — a real git repository for the planning-verbs end-to-end suite.
 *
 *   const R = makeE2eRepo({ store: true });   // git init, .planning/config.json + STACK.md, initial commit
 *   R.draft('07-01-alpha-TRD.md');            // absolute path of a hand-written draft (outside .planning/)
 *   R.run(['commit', 'x', '--files', 'a']);    // spawn aof-tools in the repo (offline gh shim, hermetic env)
 *   R.gitStatus();                            // `git status --porcelain --untracked-files=all` lines
 *   R.cleanup();
 *
 * `store` is the ONLY difference in .planning/config.json between the two modes (`github.store: true` or absent), so
 * the store-off parity run is the store run with the opt-in removed. The local repo also carries a hand-written
 * ROADMAP.md and STATE.md: those are what today's `objective complete` edits, and in store mode they are generated
 * views that only `gh pull` writes, so the store repo starts without them.
 *
 * Hermetic: git runs with gitTestEnv() (no global/system config, explicit identity, HOME under the temp root). Spawned
 * aof-tools children get a `gh` PATH shim that answers every call like an unreachable GitHub (and records the calls),
 * the loopback discard port as the wiki remote (127.0.0.1:9, nothing listens), and the caller's AOFORGE_OUTBOX_DIR /
 * AOFORGE_GH_CACHE_DIR / HOME as they are when `run` is called (set them with hermeticEnv() first).
 *
 * Every draft is a hand-written literal below. No generated data.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { gitTestEnv } = require('./wiki-remote.cjs');
const { installGhShim } = require('./gh-shim.cjs');
const { offlineTable } = require('./store-cli-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', '..', 'aof-tools.cjs');
const REPO = 'o/r';
const OBJECTIVE_DIR = '07-store-demo';
const OFFLINE_WIKI_REMOTE = 'http://127.0.0.1:9/o/r.wiki.git';

// Variables that would point git at the repository the test runner itself is inside.
const LEAKY = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_NAMESPACE',
];

const doc = (lines) => `${lines.join('\n')}\n`;

const trd = (nn, name, wave, dependsOn) => doc([
  '---',
  `objective: ${OBJECTIVE_DIR}`,
  `trd: "${nn}"`,
  'type: standard',
  `wave: ${wave}`,
  `depends_on: [${dependsOn.map((d) => `"${d}"`).join(', ')}]`,
  'autonomous: true',
  '---',
  '',
  `# TRD 7-${nn}: ${name}`,
  '',
  '<task type="auto">',
  `  <name>Task 1: write src/t${Number(nn)}.cjs</name>`,
  `  <verify>node -e "require('./src/t${Number(nn)}.cjs')"</verify>`,
  '</task>',
]);

const summary = (nn, name) => doc([
  '---',
  `objective: ${OBJECTIVE_DIR}`,
  `trd: "${nn}"`,
  '---',
  '',
  `# Objective 7 TRD ${nn}: ${name} Summary`,
  '',
  `**src/t${Number(nn)}.cjs exports the ${name.toLowerCase()} constant.**`,
  '',
  '## Task Evidence',
  '',
  '| Task | Verify Command | Exit Code | Status |',
  '|---|---|---|---|',
  `| 1 | \`node -e "require('./src/t${Number(nn)}.cjs')"\` | 0 | PASS |`,
  '',
  '## Self-Check: PASSED',
]);

/** The hand-written drafts the scenario publishes, by draft name. */
const DRAFTS = {
  'OBJECTIVE.md': doc([
    '---',
    `objective: ${OBJECTIVE_DIR}`,
    'title: Store demo',
    'status: planned',
    '---',
    '',
    '# Objective 7: Store demo',
    '',
    '## Goal',
    '',
    'Run one objective through the planning verbs with GitHub as the store.',
    '',
    '## Success Criteria',
    '',
    '1. Git sees only the code.',
    '2. GitHub holds every planning file.',
  ]),
  '07-01-alpha-TRD.md': trd('01', 'Alpha', 1, []),
  '07-02-beta-TRD.md': trd('02', 'Beta', 1, []),
  '07-03-gamma-TRD.md': trd('03', 'Gamma', 2, ['07-01']),
  '07-04-delta-TRD.md': trd('04', 'Delta', 2, ['07-02']),
  '07-CONTEXT.md': doc([
    '# Objective 7: Store demo - Context',
    '',
    '## Decisions',
    '',
    '- The three TRDs write one code file each.',
    '- 07-03 waits for 07-01.',
  ]),
  '07-RESEARCH.md': doc([
    '# Objective 7: Store demo - Research',
    '',
    '## Findings',
    '',
    '- A plain CommonJS module per TRD is enough for the demo.',
  ]),
  'checkpoint-01.md': doc(['# Objective 7 TRD 01: Alpha (in progress)', '', 'Task 1 of 1 running.']),
  'checkpoint-02.md': doc(['# Objective 7 TRD 02: Beta (in progress)', '', 'Task 1 of 1 running.']),
  'checkpoint-03.md': doc(['# Objective 7 TRD 03: Gamma (in progress)', '', 'Task 1 of 1 running.']),
  '07-01-SUMMARY.md': summary('01', 'Alpha'),
  '07-02-SUMMARY.md': summary('02', 'Beta'),
  '07-03-SUMMARY.md': summary('03', 'Gamma'),
  '07-VERIFICATION.md': doc([
    '---',
    `objective: ${OBJECTIVE_DIR}`,
    'status: passed',
    'score: 2/2',
    '---',
    '',
    '# Objective 7: Store demo - Verification',
    '',
    '| Truth | Status | Evidence |',
    '|---|---|---|',
    '| Git sees only the code | VERIFIED | git status is empty after each commit |',
    '| GitHub holds every planning file | VERIFIED | gh pull --all rebuilds the cache |',
  ]),
  'todo.md': doc([
    '---',
    'created: 2026-10-01T12:00',
    'title: Split the demo constants into one module',
    'area: planning',
    '---',
    '',
    '## Problem',
    '',
    'Three files hold one constant each.',
  ]),
  'quick-job.md': doc([
    '# Quick 1: x',
    '',
    'Rename the alpha constant.',
  ]),
  'quick-summary.md': doc([
    '# Quick 1: x - Summary',
    '',
    'Renamed the alpha constant.',
  ]),
};

/** The todo stem the scenario passes to `todo add --stem` (a fixed stem keeps the file name date-independent). */
const TODO_STEM = '2026-10-01-split-demo-constants';

/** Code file `src/t<N>.cjs` written by TRD N before its commit. */
const codeText = (n) => `'use strict';\nmodule.exports = { t${n}: ${n} };\n`;

const STACK_MD = doc([
  '---',
  'stack: node',
  '---',
  '',
  '# Stack',
  '',
  '| Key | Command |',
  '|---|---|',
  '| test | `node --test` |',
]);

/** Local-mode ROADMAP.md: the entry today's `objective complete` ticks. */
const ROADMAP_MD = doc([
  '# Roadmap: e2e demo',
  '',
  '## Objectives',
  '',
  '- [ ] **Objective 7: Store demo** - Run one objective through the planning verbs',
  '',
  '## Objective Details',
  '',
  '### Objective 7: Store demo',
  '**Goal:** Run one objective through the planning verbs with GitHub as the store',
  '**Depends on:** Nothing',
  '**Jobs:** 3 jobs',
  '',
  'Jobs:',
  '- [ ] 07-01-alpha-TRD.md - Alpha',
  '- [ ] 07-02-beta-TRD.md - Beta',
  '- [ ] 07-03-gamma-TRD.md - Gamma',
  '',
  '## Progress',
  '',
  '| Objective | Jobs Complete | Status | Completed |',
  '|-----------|----------------|--------|-----------|',
  '| 7. Store demo | 0/3 | Not started | - |',
]);

/** Local-mode STATE.md: the position today's `objective complete` advances. */
const STATE_MD = doc([
  '# Project State',
  '',
  '## Current Position',
  '',
  '**Current Objective:** 7',
  '**Current Objective Name:** Store demo',
  '**Current TRD:** 1',
  '**Total TRDs in Objective:** 3',
  '**Status:** Executing',
  '**Last Activity:** 2026-10-01',
  '**Last Activity Description:** Objective 7 started',
  '',
  'Progress: [░░░░░░░░░░] 0%',
]);

function git(cwd, env, args) {
  const r = spawnSync('git', args, { cwd, env, encoding: 'utf-8' });
  if (r.error) throw new Error(`git ${args.join(' ')}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed (${r.status}): ${(r.stderr || '').trim()}`);
  return r.stdout;
}

/**
 * A temp git repository shaped like a fresh AOForge project.
 *
 * Store: `.planning/config.json` (`github.enabled/repo/store`) + `.planning/STACK.md`, committed; nothing else.
 * Local: the same config without `store`, STACK.md, ROADMAP.md and STATE.md, all committed (today's tracked .planning/).
 * Both: an empty objective dir `07-store-demo` and the drafts under `<base>/drafts` (outside .planning/).
 *
 * @param {{store?: boolean}} [opts]
 */
function makeE2eRepo({ store = false } = {}) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-e2e-')));
  const root = path.join(base, 'repo');
  const drafts = path.join(base, 'drafts');
  const home = path.join(base, 'home');
  for (const d of [root, drafts, home]) fs.mkdirSync(d, { recursive: true });
  const shim = installGhShim({ dir: path.join(base, 'shim'), table: offlineTable(), defaultCode: 1 });

  const gitEnv = () => {
    const env = { ...process.env, ...gitTestEnv(home) };
    for (const k of LEAKY) delete env[k];
    return env;
  };
  const planning = (rel) => path.join(root, '.planning', ...rel.split('/'));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(planning(rel)), { recursive: true });
    fs.writeFileSync(planning(rel), text);
  };

  git(root, gitEnv(), ['init', '-q', '-b', 'main']);

  const github = { enabled: true, repo: REPO };
  if (store) github.store = true;
  write('config.json', `${JSON.stringify({ github }, null, 2)}\n`);
  write('STACK.md', STACK_MD);
  const tracked = ['.planning/config.json', '.planning/STACK.md'];
  if (!store) {
    write('ROADMAP.md', ROADMAP_MD);
    write('STATE.md', STATE_MD);
    tracked.push('.planning/ROADMAP.md', '.planning/STATE.md');
  }
  fs.mkdirSync(planning(`objectives/${OBJECTIVE_DIR}`), { recursive: true });
  git(root, gitEnv(), ['add', '--', ...tracked]);
  git(root, gitEnv(), ['commit', '-q', '-m', 'initial: aoforge config']);

  for (const [name, text] of Object.entries(DRAFTS)) fs.writeFileSync(path.join(drafts, name), text);

  /** The env of a spawned aof-tools child, read at call time so hermeticEnv() settings carry over. */
  const childEnv = (extra = {}) => {
    const env = shim.env({
      ...gitTestEnv(process.env.HOME || home),
      AOFORGE_GH_CACHE_DIR: process.env.AOFORGE_GH_CACHE_DIR || path.join(base, 'gh-cache'),
      AOFORGE_WIKI_REMOTE: OFFLINE_WIKI_REMOTE,
      NOTIFIER_DISABLE: '1',
      ...extra,
    });
    for (const k of LEAKY) delete env[k];
    return env;
  };

  return {
    base,
    root,
    drafts,
    home,
    shim,
    store,
    objectiveDir: OBJECTIVE_DIR,
    planning,
    write,
    read: (rel) => fs.readFileSync(planning(rel), 'utf8'),
    exists: (rel) => fs.existsSync(planning(rel)),
    draft: (name) => path.join(drafts, name),
    draftText: (name) => DRAFTS[name],
    childEnv,
    git: (args) => git(root, gitEnv(), args),
    /** `git status --porcelain --untracked-files=all`, one entry per line ([] when clean). */
    gitStatus: () => git(root, gitEnv(), ['status', '--porcelain', '--untracked-files=all']).split('\n').filter(Boolean),
    /** Tracked paths under `prefix`. */
    lsFiles: (prefix) => git(root, gitEnv(), ['ls-files', '--', prefix]).split('\n').filter(Boolean).sort(),
    /** Spawn aof-tools in the repo. */
    run(args, opts = {}) {
      return spawnSync(process.execPath, [DF_TOOLS, ...args], {
        cwd: opts.cwd || root,
        env: childEnv(opts.env),
        encoding: 'utf-8',
        timeout: 120000,
      });
    },
    /** Write `src/t<n>.cjs` (the code a TRD produces). Returns its repo-relative path. */
    writeCode(n) {
      const rel = `src/t${n}.cjs`;
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      fs.writeFileSync(path.join(root, rel), codeText(n));
      return rel;
    },
    cleanup() {
      fs.rmSync(base, { recursive: true, force: true });
    },
  };
}

module.exports = { makeE2eRepo, DRAFTS, TODO_STEM, OBJECTIVE_DIR, REPO, ROADMAP_MD, STATE_MD, STACK_MD, codeText, DF_TOOLS };
