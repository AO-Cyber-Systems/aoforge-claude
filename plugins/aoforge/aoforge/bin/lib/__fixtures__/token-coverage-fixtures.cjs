'use strict';

// token-coverage-fixtures.cjs (TRD 66-01, EST-09) — hand-built SUMMARY texts and a ROADMAP/objective project for the
// `tokens coverage` tests.
//
// Hand-built only, no generated data (constraint `no_llm_test_data`): every SUMMARY, TRD and ROADMAP line below is literal
// text. Nothing is randomised and nothing is derived from a model run. The only computed pieces are file names built from
// the ids a test passes in, and sha256 digests in hashTree.
//
// Used by:
//   token-coverage.test.cjs   (in-process tests 8-14): summaryText for each class, makeCoverageProject for the directory
//                              layout collectSummaries and buildCoverage read.
//   tokens-cli.test.cjs       (end to end tests 1-7, `66-01 tokens coverage`): V16_FIXTURE, run(), transcript(), hashTree().
//
// Every root is an fs.mkdtemp directory, realpath'd (macOS /var vs /private/var). The fake HOME keeps spawned runs away
// from the real ~/.claude.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  makeFakeHome, projectKeyFor, executorPrompt, writeSubagentTranscript, THREE_MESSAGES,
} = require('./transcript-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', '..', 'aof-tools.cjs');

/** The eight SUMMARY shapes the coverage classes are built from. */
const SUMMARY_KINDS = Object.freeze([
  'live',
  'backfill',
  'unlabeled',
  'missing_final',
  'missing_orchestrator',
  'in_progress',
  'template_comments',
  'input_only',
]);

/** Six token fields exactly as tokenFrontmatterFields serialises them: bare integers, JSON-quoted model and source. */
function tokenLines(source) {
  return [
    'tokens_input: 140747',
    'tokens_output: 1370',
    'tokens_cache_read: 121144',
    'tokens_cache_write: 19596',
    'token_model: "claude-opus-5-5"',
    `tokens_source: "${source}"`,
  ];
}

/**
 * Literal SUMMARY text of one kind for the TRD `id` (`NN-MM`) of `objectiveDir`.
 *
 * @param {string} kind  one of SUMMARY_KINDS
 * @param {{id: string, objectiveDir: string}} opts
 * @returns {string}
 */
function summaryText(kind, { id, objectiveDir }) {
  if (!SUMMARY_KINDS.includes(kind)) throw new Error(`summaryText: unknown kind ${JSON.stringify(kind)}`);
  const objective = id.slice(0, id.lastIndexOf('-'));
  const number = id.slice(id.lastIndexOf('-') + 1);

  const head = ['---', `objective: ${objectiveDir}`, `trd: "${number}"`, 'duration: 9min', 'completed: 2026-10-08'];
  let tokens = [];
  let body;

  switch (kind) {
    case 'live':
      tokens = tokenLines('live');
      body = ['## Task Evidence', '', '| Task | Status |', '|---|---|', '| 1 | PASS |', '', '## Self-Check: PASSED'];
      break;
    case 'backfill':
      tokens = tokenLines('backfill');
      body = ['## Task Evidence', '', '| Task | Status |', '|---|---|', '| 1 | PASS |', '', '## Self-Check: PASSED'];
      break;
    case 'unlabeled':
      tokens = ['tokens_input: 5000', 'tokens_output: 400'];
      body = ['## Task Evidence', '', '| Task | Status |', '|---|---|', '| 1 | PASS |', '', '## Self-Check: PASSED'];
      break;
    case 'missing_final':
      body = ['## Task Evidence', '', '| Task | Status |', '|---|---|', '| 1 | PASS |', '', '## Self-Check: PASSED'];
      break;
    case 'missing_orchestrator':
      // The orchestrator-written shape (objective 65, TRD 02): an Outcome section, no Progress and no Self-Check.
      body = ['## Outcome', '', 'Written by the orchestrator after the executor stopped.'];
      break;
    case 'in_progress':
      body = [
        '## Progress',
        `- [x] Task 1: Fixtures — abc1234`,
        `- [ ] Task 2: Library — next step: write the failing test in token-coverage.test.cjs`,
      ];
      break;
    case 'template_comments':
      tokens = ['# tokens_input: N', '# tokens_output: N'];
      body = ['## Task Evidence', '', '| Task | Status |', '|---|---|', '| 1 | PASS |', '', '## Self-Check: PASSED'];
      break;
    case 'input_only':
      tokens = ['tokens_input: 5000'];
      body = ['## Task Evidence', '', '| Task | Status |', '|---|---|', '| 1 | PASS |', '', '## Self-Check: PASSED'];
      break;
    default:
      throw new Error(`summaryText: unhandled kind ${kind}`);
  }

  return [
    ...head,
    ...tokens,
    '---',
    '',
    `# Objective ${objective} TRD ${number}: Demo Summary`,
    '',
    '**A literal fixture SUMMARY.**',
    '',
    ...body,
    '',
  ].join('\n');
}

/** Minimal literal TRD text for an id. */
function trdText({ id, objectiveDir }) {
  const number = id.slice(id.lastIndexOf('-') + 1);
  return ['---', `objective: ${objectiveDir}`, `trd: "${number}"`, 'type: standard', '---', '', `# TRD ${id}: Demo`, ''].join('\n');
}

/** The leading objective number of a directory name (`65-release` gives `65`, `04.1-x` gives `04.1`). */
function numberOfDir(dirName) {
  const m = /^(\d+(?:\.\d+)?)/.exec(dirName);
  return m ? m[1] : dirName;
}

/** The slug part of a directory name (`65-release` gives `release`). */
function slugOfDir(dirName) {
  const m = /^\d+(?:\.\d+)?-?(.*)$/.exec(dirName);
  return m && m[1] ? m[1] : 'objective';
}

/** Write `<root>/<dir>/` with a TRD per item and a SUMMARY named `<id>-SUMMARY.md` for each item whose kind is not null. */
function writeObjectiveDir(root, dirName, items) {
  const dir = path.join(root, dirName);
  fs.mkdirSync(dir, { recursive: true });
  for (const item of items) {
    const slug = item.slug || 'demo';
    fs.writeFileSync(path.join(dir, `${item.id}-${slug}-TRD.md`), trdText({ id: item.id, objectiveDir: dirName }));
    if (item.kind !== null && item.kind !== undefined) {
      fs.writeFileSync(path.join(dir, `${item.id}-SUMMARY.md`), summaryText(item.kind, { id: item.id, objectiveDir: dirName }));
    }
  }
}

/** `[[relPath, sha256], ...]` for every file under `dir`, sorted by path. A missing directory gives []. */
function hashTree(dir) {
  const out = [];
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else out.push([path.relative(dir, abs), crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex')]);
    }
  };
  walk(dir);
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/**
 * A realpath'd project with a ROADMAP.md, current and archived objective directories and a fake HOME.
 *
 * @param {{roadmap?: {milestones?: string[]}, objectives?: Object<string, Array<{id: string, kind: string|null, slug?: string}>>,
 *          archived?: Object<string, Object<string, Array<{id: string, kind: string|null, slug?: string}>>>}} spec
 *   roadmap.milestones: literal `## Milestones` bullet strings. objectives: `{dirName: items}` under `.planning/objectives`.
 *   archived: `{ 'v1.5': {dirName: items} }` under `.planning/milestones/<version>-objectives`. A ROADMAP.md is written
 *   only when `roadmap` is given; it holds one `### Objective N: Name` section per objective number found in the spec.
 * @returns {{tmp: string, repo: string, home: string, projectsRoot: string, run: Function, transcript: Function,
 *   hashTree: Function, cleanup: Function}}
 */
function makeCoverageProject({ roadmap, objectives = {}, archived = {} } = {}) {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-coverage-')));
  const repo = path.join(tmp, 'repo');
  const planning = path.join(repo, '.planning');
  fs.mkdirSync(planning, { recursive: true });

  const sectionDirs = [];
  for (const [dirName, items] of Object.entries(objectives)) {
    writeObjectiveDir(path.join(planning, 'objectives'), dirName, items);
    sectionDirs.push(dirName);
  }
  for (const [version, dirs] of Object.entries(archived)) {
    for (const [dirName, items] of Object.entries(dirs)) {
      writeObjectiveDir(path.join(planning, 'milestones', `${version}-objectives`), dirName, items);
      sectionDirs.push(dirName);
    }
  }

  if (roadmap) {
    const lines = ['# Roadmap', '', '## Milestones', '', ...(roadmap.milestones || []), '', '## Objectives', ''];
    for (const dirName of [...sectionDirs].sort()) {
      lines.push(`### Objective ${numberOfDir(dirName)}: ${slugOfDir(dirName)}`, '', `Goal of ${dirName}.`, '');
    }
    fs.writeFileSync(path.join(planning, 'ROADMAP.md'), lines.join('\n'));
  }

  const { home, projectsRoot } = makeFakeHome();
  const env = { ...process.env, HOME: home, TMPDIR: tmp, NOTIFIER_DISABLE: '1' };

  return {
    tmp,
    repo,
    home,
    projectsRoot,
    /** Spawn aof-tools with `--cwd <repo>` (HOME is the fake home). */
    run(args) {
      return spawnSync(process.execPath, [DF_TOOLS, '--cwd', repo, ...args], {
        cwd: tmp, env, encoding: 'utf-8', timeout: 60000,
      });
    },
    /** An executor transcript for `id` in `objectiveDir` whose executor ran in `repo`. */
    transcript(id, objectiveDir, { agentId = `agent-${id}`, session = 's1', records = THREE_MESSAGES } = {}) {
      return writeSubagentTranscript(projectsRoot, {
        projectKey: projectKeyFor(repo),
        session,
        agentId,
        description: `Execute TRD ${id}`,
        prompt: executorPrompt('plan_id', { id, objectiveDir, repoRoot: repo }),
        cwd: repo,
        records,
      });
    },
    hashTree,
    cleanup() {
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

/**
 * The scenario of tests 1-2: v1.5 (shipped, Objectives 55–64) and v1.6 (in progress, Objectives 65–75). Objective 64 is
 * archived with one live SUMMARY. Objective 65 holds 65-01 live, 65-02 in the orchestrator shape, 65-03 final with no
 * tokens, 65-04 live. Objective 66 holds 66-01 backfill, 66-02 unlabeled, 66-03 in progress.
 */
const V16_FIXTURE = Object.freeze({
  roadmap: {
    milestones: [
      '- ✅ **v1.5 — Gate & Plumbing** — Objectives 55–64 (completed)',
      '- 🚧 **v1.6 — Hardening & Release** — Objectives 65–75 (in progress)',
    ],
  },
  objectives: {
    '65-release': [
      { id: '65-01', kind: 'live' },
      { id: '65-02', kind: 'missing_orchestrator' },
      { id: '65-03', kind: 'missing_final' },
      { id: '65-04', kind: 'live' },
    ],
    '66-stamp': [
      { id: '66-01', kind: 'backfill' },
      { id: '66-02', kind: 'unlabeled' },
      { id: '66-03', kind: 'in_progress' },
    ],
  },
  archived: {
    'v1.5': {
      '64-old': [{ id: '64-01', kind: 'live' }],
    },
  },
});

module.exports = {
  SUMMARY_KINDS,
  summaryText,
  makeCoverageProject,
  hashTree,
  V16_FIXTURE,
};
