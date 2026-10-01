'use strict';

// gh-backfill-fixtures.cjs (TRD 51-02) — a realistic PRE-STORE project for the GitHub store backfill (GMD-01), its
// estimate (GMD-02) and SC1/SC2: one call yields a git-initialised, local-mode DevFlow project with twenty objectives of
// history (shipped, in progress, cancelled, planned), the entities `planning import` moves, and an optional legacy-named
// or oversize TRD for the refusal paths.
//
//   const p = makeBackfillProject();          // 20 objectives x 5 TRDs, github {enabled, repo:'o/r'}, store OFF
//   p.root, p.home, p.shape, p.files, p.paths, p.cleanup()
//   BACKFILL_SHAPE                            // the default build's expected counts (frozen)
//   const env = useBackfillEnv(t, opts);      // the project + fake GitHub + fake clock + wiki remote, hermetic,
//   if (!env) return;                         // torn down by t.after; null (skipped) without git
//
// Content is hand-built (constraint `no_llm_test_data`): fixed strings and simple loops, no randomness, no clock, so
// two builds with the same options are byte-identical. Each TRD body is ~1 KB: the backfill is measured by how many
// operations it queues, not by body size.
//
// Shape of the default build (objective n, TRD m, T = trdsPerObjective = 5):
//   n 1-15   status complete     every TRD has a SUMMARY except the last TRD of objective 3 (03-05, deferred);
//                                odd n also carry NN-VERIFICATION.md (status: passed)
//   n 16-18  status in_progress  SUMMARYs for TRDs 01-02 only
//   n 19     status cancelled    no SUMMARY
//   n 20+    status planned      no SUMMARY
//   milestones v0.1 (1-8) and v0.2 (9-15) shipped, in MILESTONES.md and the ROADMAP list; v0.3 (16+) in progress,
//   ROADMAP list only. TRD waves are ceil(m/2) (1,1,2,2,3) with `depends_on: []`, so waveEdges yields blocked-by edges.
//
// The derived counts come from the same loops that write the files, never from re-reading the tree: tests compare the
// tree against that intent.

const fs = require('fs');
const os = require('os');
const path = require('path');

const { makeFakeHome, initGitFixture, FIXTURE_STAMP_TIME } = require('./upgrade-fixtures.cjs');
const { oversizedTrdText, hermeticEnv } = require('./gh-store-fixtures.cjs');
const { createWikiRemote, gitAvailable, gitTestEnv, applyGitTestEnv } = require('./wiki-remote.cjs');
const { createFakeGitHub } = require('./gh-fake.cjs');
const client = require('../gh-client.cjs');
const gh = require('../gh.cjs');

const doc = (lines) => `${lines.join('\n')}\n`;
const pad = (n) => String(n).padStart(2, '0');

const REPO = 'o/r';
const STAMP_VERSION = '2.12.0';
const MIGRATIONS_THROUGH_0009 = Object.freeze(['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009']);

const SHIPPED_THROUGH = 15;
const IN_PROGRESS_THROUGH = 18;
const CANCELLED_OBJECTIVE = 19;
const IN_PROGRESS_SUMMARIES = 2;
const DEFERRED_OBJECTIVE = 3;
const DECISION_OBJECTIVE = 16;
const DECISION_TRD = 3;
const OVERSIZE_CHARS = 61000;

/** Milestones by objective range. `shipped` milestones get a MILESTONES.md section; the open one is ROADMAP-only. */
const MILESTONE_PLAN = Object.freeze([
  Object.freeze({ version: 'v0.1', name: 'Foundations', from: 1, to: 8 }),
  Object.freeze({ version: 'v0.2', name: 'Expansion', from: 9, to: SHIPPED_THROUGH }),
  Object.freeze({ version: 'v0.3', name: 'Backfill', from: SHIPPED_THROUGH + 1, to: Infinity }),
]);

// ─── Naming ───────────────────────────────────────────────────────────────────

const objectiveDirName = (n) => `${pad(n)}-objective-${pad(n)}`;
const trdFileName = (n, m) => `${pad(n)}-${pad(m)}-step-${pad(m)}-TRD.md`;
const summaryFileName = (n, m) => `${pad(n)}-${pad(m)}-SUMMARY.md`;
const verificationFileName = (n) => `${pad(n)}-VERIFICATION.md`;
/** The store's TRD id: unpadded objective number, padded TRD number (`16-03`). */
const trdId = (n, m) => `${n}-${pad(m)}`;
const waveOf = (m) => Math.ceil(m / 2);

/** A fixed calendar: objective n completes (or last moved) on 2026-01-01 + (n - 1) days. */
function dateOf(n) {
  return new Date(Date.UTC(2026, 0, n)).toISOString().slice(0, 10);
}

function objectiveStatus(n) {
  if (n <= SHIPPED_THROUGH) return 'complete';
  if (n <= IN_PROGRESS_THROUGH) return 'in_progress';
  if (n === CANCELLED_OBJECTIVE) return 'cancelled';
  return 'planned';
}

const PROGRESS_WORD = Object.freeze({ complete: 'Complete', in_progress: 'In progress', cancelled: 'Cancelled', planned: 'Registered' });

function milestoneOf(n) {
  return MILESTONE_PLAN.find((ms) => n >= ms.from && n <= ms.to);
}

/** The milestones that hold at least one of objectives 1..N, with their range clipped to N. */
function milestonesFor(N) {
  return MILESTONE_PLAN
    .filter((ms) => ms.from <= N)
    .map((ms) => {
      const to = Math.min(ms.to, N);
      return { ...ms, to, shipped: to <= SHIPPED_THROUGH };
    });
}

const rangeText = (from, to) => (from === to ? `Objective ${from}` : `Objectives ${from}-${to}`);

function isDeferred(n, m, T) {
  return n === DEFERRED_OBJECTIVE && m === T;
}

function hasSummary(n, m, T) {
  const status = objectiveStatus(n);
  if (status === 'complete') return !isDeferred(n, m, T);
  if (status === 'in_progress') return m <= IN_PROGRESS_SUMMARIES;
  return false;
}

function hasVerification(n) {
  return objectiveStatus(n) === 'complete' && n % 2 === 1;
}

// ─── Bodies ───────────────────────────────────────────────────────────────────

const CONFIG_TEMPLATE_PATH = path.join(__dirname, '..', '..', '..', 'templates', 'config.json');

/**
 * The nested template shape (so migration 0001 has nothing to do), github ON with `repo: 'o/r'` and NO `store` key
 * (store is off by absence; the migration under test flips it), stamped through 0009.
 */
function configJson() {
  const config = JSON.parse(fs.readFileSync(CONFIG_TEMPLATE_PATH, 'utf-8'));
  const github = { ...(config.github || {}), enabled: true, repo: REPO };
  delete github.store;
  config.github = github;
  config.devflow = { version: STAMP_VERSION, migrations_applied: [...MIGRATIONS_THROUGH_0009], upgraded_at: FIXTURE_STAMP_TIME };
  return `${JSON.stringify(config, null, 2)}\n`;
}

function projectMd(N) {
  return doc([
    '---',
    'kind: plugin',
    'default_work: feature',
    '---',
    '',
    '# Backfill Fixture',
    '',
    '## What This Is',
    '',
    `A local-mode DevFlow project with ${N} objectives of history, built to exercise the GitHub store backfill.`,
    '',
    '## Core Value',
    '',
    'Every objective, TRD and summary written before the store existed reaches GitHub exactly once.',
  ]);
}

function requirementsMd(N) {
  const lines = ['# Requirements: Backfill Fixture', '', '## Requirements', ''];
  for (let n = 1; n <= N; n++) {
    const done = objectiveStatus(n) === 'complete' ? 'x' : ' ';
    lines.push(`- [${done}] **BF-${pad(n)}** Objective ${pad(n)} delivers its steps`);
  }
  return doc(lines);
}

function objectiveMd(n, T) {
  const dir = objectiveDirName(n);
  const status = objectiveStatus(n);
  const lines = [
    '---',
    `objective: ${dir}`,
    'work: feature',
    `status: ${status}`,
    `milestone: ${milestoneOf(n).version}`,
    '---',
    '',
    `# Objective ${n} — Objective ${pad(n)}`,
    '',
    '## Goal',
    '',
    `Deliver the ${T} steps of objective ${pad(n)}.`,
    '',
    '## Requirements',
    '',
    `- **BF-${pad(n)}** Objective ${pad(n)} delivers its steps`,
  ];
  if (n === DEFERRED_OBJECTIVE && status === 'complete') {
    lines.push('', '## Deferred', '', `- ${pad(n)}-${pad(T)}: moved out of scope at verification; it never shipped.`);
  }
  if (status === 'cancelled') {
    lines.push('', '## Cancelled', '', 'Superseded before any TRD started.');
  }
  return doc(lines);
}

function trdMd(n, m) {
  const step = `step ${pad(m)} of objective ${pad(n)}`;
  const src = `src/objective-${pad(n)}/step-${pad(m)}`;
  return doc([
    '---',
    `objective: ${objectiveDirName(n)}`,
    `trd: "${pad(m)}"`,
    'type: standard',
    `wave: ${waveOf(m)}`,
    'depends_on: []',
    'autonomous: true',
    `requirements: [BF-${pad(n)}]`,
    '---',
    '',
    `# TRD ${pad(n)}-${pad(m)}: Step ${pad(m)}`,
    '',
    '<objective>',
    `Deliver ${step}. The body is fixed, hand-written text: the backfill is measured by the number of`,
    'operations it queues, not by the size of each issue body.',
    '</objective>',
    '',
    '<tasks>',
    '',
    '<task type="auto">',
    `  <name>Task 1: step ${pad(m)}</name>`,
    `  <files>${src}.cjs, ${src}.test.cjs</files>`,
    `  <action>Write ${step} and its test. Keep the change small and self-contained.</action>`,
    `  <verify>node --test ${src}.test.cjs</verify>`,
    `  <done>The ${step} is implemented and its test passes.</done>`,
    '</task>',
    '',
    '</tasks>',
    '',
    '<success_criteria>',
    `The ${step} ships with a passing test.`,
    '</success_criteria>',
  ]);
}

function summaryMd(n, m) {
  const src = `src/objective-${pad(n)}/step-${pad(m)}`;
  return doc([
    '---',
    `objective: ${objectiveDirName(n)}`,
    `trd: "${pad(m)}"`,
    `subsystem: objective-${pad(n)}`,
    'duration: 10min',
    `completed: ${dateOf(n)}`,
    '---',
    '',
    `# Objective ${pad(n)} TRD ${pad(m)}: Step ${pad(m)} Summary`,
    '',
    `**Step ${pad(m)} of objective ${pad(n)} shipped with a passing test**`,
    '',
    '## Task Evidence',
    '',
    '| Task | Verify Command | Exit Code | Status |',
    '|---|---|---|---|',
    `| 1: step ${pad(m)} | \`node --test ${src}.test.cjs\` | 0 | PASS |`,
    '',
    '## Self-Check: PASSED',
  ]);
}

function verificationMd(n, T, shippedTrds) {
  const lines = [
    '---',
    `objective: ${objectiveDirName(n)}`,
    'status: passed',
    `score: ${shippedTrds}/${shippedTrds}`,
    `verified: ${dateOf(n)}`,
    '---',
    '',
    `# Objective ${pad(n)}: Objective ${pad(n)} Verification`,
    '',
    '**Status:** passed',
    '',
    `${shippedTrds} of ${T} TRDs shipped and met their must-haves.`,
  ];
  if (shippedTrds < T) lines.push('', `The remaining TRD was deferred and is not part of this verification.`);
  return doc(lines);
}

function roadmapMd(N, T) {
  const lines = ['# Roadmap: Backfill Fixture', '', '## Milestones', ''];
  for (const ms of milestonesFor(N)) {
    const mark = ms.shipped ? '✅' : '🚧';
    const tail = ms.shipped ? `(shipped ${dateOf(ms.to)})` : '(in progress)';
    lines.push(`- ${mark} **${ms.version} ${ms.name}** - ${rangeText(ms.from, ms.to)} ${tail}`);
  }
  lines.push('', '## Objectives', '');
  for (let n = 1; n <= N; n++) {
    lines.push(
      `### Objective ${n}: Objective ${pad(n)}`,
      `**Goal:** Deliver the ${T} steps of objective ${pad(n)}`,
      `**Requirements:** BF-${pad(n)}`,
      `**Plans:** ${T} TRDs in ${waveOf(T)} waves`,
      '',
      'TRDs:',
    );
    for (let m = 1; m <= T; m++) {
      const box = hasSummary(n, m, T) ? 'x' : ' ';
      const note = isDeferred(n, m, T) && objectiveStatus(n) === 'complete' ? ' (deferred)' : '';
      lines.push(`- [${box}] ${trdFileName(n, m)} — (W${waveOf(m)}) step ${pad(m)}${note}`);
    }
    lines.push('');
  }
  lines.push('## Progress', '', '| Objective | Milestone | TRDs Complete | Status | Completed |', '|---|---|---|---|---|');
  for (let n = 1; n <= N; n++) {
    let done = 0;
    for (let m = 1; m <= T; m++) if (hasSummary(n, m, T)) done += 1;
    const status = objectiveStatus(n);
    const completed = status === 'complete' ? dateOf(n) : '-';
    lines.push(`| ${n}. Objective ${pad(n)} | ${milestoneOf(n).version} | ${done}/${T} | ${PROGRESS_WORD[status]} | ${completed} |`);
  }
  return doc(lines);
}

/** The first objective that is not shipped (the last one when every objective shipped). */
function currentObjective(N) {
  for (let n = 1; n <= N; n++) if (objectiveStatus(n) !== 'complete') return n;
  return N;
}

/** The sidecar migration 0003 would seed from STATE.md, written up front so 0003 has nothing to do. */
function stateJson(N) {
  const current = currentObjective(N);
  const state = {
    current_objective: pad(current),
    current_job: 0,
    total_jobs: 0,
    progress_pct: 0,
    status: 'In progress',
    last_activity: dateOf(current),
    metrics: { jobs_completed: 0, jobs_failed: 0, sessions: 0 },
    decisions: [],
    blockers: [],
    session_log: [],
  };
  return `${JSON.stringify(state, null, 2)}\n`;
}

function stateMd(N) {
  const current = currentObjective(N);
  return doc([
    '# Project State',
    '',
    '## Current Position',
    '',
    `**Current Objective:** ${pad(current)}`,
    '**Status:** In progress',
    `**Last Activity:** ${dateOf(current)}`,
    '',
    '## Blockers',
    '',
    'None.',
  ]);
}

function milestonesMd(N) {
  const sections = milestonesFor(N)
    .filter((ms) => ms.shipped)
    .map((ms) => [
      `## ${ms.version} ${ms.name} (Shipped: ${dateOf(ms.to)})`,
      '',
      `${rangeText(ms.from, ms.to)} shipped.`,
    ].join('\n'));
  return `# Milestones\n\n${sections.join('\n\n---\n\n')}\n`;
}

const RESEARCH_A = doc(['# Research A', '', 'Notes on how the history should be ordered when it is pushed.']);

const TODOS = Object.freeze([
  Object.freeze({
    rel: 'todos/pending/2026-01-20-tidy-log-output.md',
    text: doc(['---', 'created: 2026-01-20T10:00:00.000Z', 'title: Tidy the log output', 'area: tooling', '---', '',
      '## Problem', '', 'The log output repeats the objective id on every line.']),
  }),
  Object.freeze({
    rel: 'todos/pending/2026-01-21-document-wave-rules.md',
    text: doc(['---', 'created: 2026-01-21T10:00:00.000Z', 'title: Document the wave rules', 'area: docs', '---', '',
      '## Problem', '', 'Nobody wrote down why a TRD in wave 2 waits for every TRD in wave 1.']),
  }),
  Object.freeze({
    rel: 'todos/completed/2026-01-10-pin-node-version.md',
    text: doc(['---', 'created: 2026-01-10T10:00:00.000Z', 'title: Pin the Node version', 'area: tooling', '---', '',
      '## Problem', '', 'CI and laptops ran different Node majors.', '', '## Resolution', '', 'Pinned in package.json engines.']),
  }),
]);

const DEBUG_SESSION = Object.freeze({
  rel: 'debug/flaky-summary-write.md',
  text: doc(['---', 'status: investigating', '---', '', '# Debug: flaky summary write', '',
    'hypothesis: the summary write races the commit of the same file']),
});

const QUICK_FILES = Object.freeze([
  Object.freeze({
    rel: 'quick/1-fix-readme-typo/1-JOB.md',
    text: doc(['# Quick 1: fix the README typo', '', '<task type="auto"><name>Fix the README typo</name></task>']),
  }),
  Object.freeze({
    rel: 'quick/1-fix-readme-typo/1-SUMMARY.md',
    text: doc(['# Quick 1 Summary', '', 'Fixed the README typo.']),
  }),
]);

function decisionWithTrd(id) {
  return doc(['---', 'id: DECISION-002', `trd: ${id}`, 'status: pending', '---', '',
    '# Cache the TRD list or re-read it on every call?', '',
    'A: cache it for the process. B: re-read it, so a concurrent edit is never missed.']);
}

const DECISION_WITHOUT_TRD = doc(['---', 'id: DECISION-001', 'status: resolved', 'resolution: B', '---', '',
  '# Zero-pad objective numbers in directory names?', '', 'A: never. B: always, to two digits.']);

function legacyTrdMd(n, m) {
  return doc([
    '---',
    `objective: ${objectiveDirName(n)}`,
    `trd: "${pad(m)}"`,
    'type: standard',
    `wave: ${waveOf(m)}`,
    'depends_on: []',
    '---',
    '',
    `# TRD ${pad(n)}-${pad(m)}: a legacy-named plan`,
    '',
    'Named before the `NN-MM-<slug>-TRD.md` convention, so no planning verb owns it.',
  ]);
}

/** A TRD whose encoded issue body is exactly OVERSIZE_CHARS (reuses oversizedTrdText, then names its objective). */
function oversizeTrdMd(n, m, file) {
  const dir = objectiveDirName(n);
  const stock = 'objective: 07-store-demo';
  const own = `objective: ${dir}`;
  const text = oversizedTrdText(OVERSIZE_CHARS - (own.length - stock.length), { id: trdId(n, m), file });
  return text.replace(stock, own);
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function positiveInt(name, value, max) {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new RangeError(`makeBackfillProject: ${name} must be an integer from 1 to ${max} (got ${JSON.stringify(value)})`);
  }
  return value;
}

/**
 * The full, ordered list of `[relToPlanning, text]` a build writes, plus the counts and named paths derived by the same
 * loops. Pure: no I/O, so BACKFILL_SHAPE is computed from it at load time.
 */
function layout({ objectives = 20, trdsPerObjective = 5, legacyTrd = false, oversizeTrd = false } = {}) {
  const N = positiveInt('objectives', objectives, 99);
  const T = positiveInt('trdsPerObjective', trdsPerObjective, 98);
  const entries = [];
  const add = (rel, text) => entries.push([rel, text]);
  const counts = {
    objectives: 0, trdsPerObjective: T, trds: 0, summaries: 0, verifications: 0,
    shipped: 0, inProgress: 0, cancelled: 0, planned: 0,
    todos: 0, debug: 0, quick: 0, decisionsWithTrd: 0, decisionsWithoutTrd: 0, milestones: 0,
    legacyTrds: 0, oversizeTrds: 0, files: 0,
  };
  const paths = { deferredTrd: null, decisionTrd: null, legacyTrd: null, oversizeTrd: null };

  add('config.json', configJson());
  add('PROJECT.md', projectMd(N));
  add('REQUIREMENTS.md', requirementsMd(N));
  add('ROADMAP.md', roadmapMd(N, T));
  add('STATE.md', stateMd(N));
  add('state.json', stateJson(N));
  add('MILESTONES.md', milestonesMd(N));
  counts.milestones = milestonesFor(N).filter((ms) => ms.shipped).length;
  add('research/a.md', RESEARCH_A);

  for (let n = 1; n <= N; n++) {
    const dir = `objectives/${objectiveDirName(n)}`;
    const status = objectiveStatus(n);
    counts.objectives += 1;
    if (status === 'complete') counts.shipped += 1;
    else if (status === 'in_progress') counts.inProgress += 1;
    else if (status === 'cancelled') counts.cancelled += 1;
    else counts.planned += 1;

    add(`${dir}/OBJECTIVE.md`, objectiveMd(n, T));
    let shippedTrds = 0;
    for (let m = 1; m <= T; m++) {
      add(`${dir}/${trdFileName(n, m)}`, trdMd(n, m));
      counts.trds += 1;
      if (isDeferred(n, m, T) && status === 'complete') paths.deferredTrd = `${dir}/${trdFileName(n, m)}`;
      if (hasSummary(n, m, T)) {
        add(`${dir}/${summaryFileName(n, m)}`, summaryMd(n, m));
        counts.summaries += 1;
        shippedTrds += 1;
      }
    }
    if (hasVerification(n)) {
      add(`${dir}/${verificationFileName(n)}`, verificationMd(n, T, shippedTrds));
      counts.verifications += 1;
    }
  }

  for (const todo of TODOS) {
    add(todo.rel, todo.text);
    counts.todos += 1;
  }
  add(DEBUG_SESSION.rel, DEBUG_SESSION.text);
  counts.debug += 1;
  for (const q of QUICK_FILES) add(q.rel, q.text);
  counts.quick += 1;

  // The decision with `trd:` blocks the next TRD of the first in-progress objective; a smaller build points it at the
  // last objective so the TRD it names always exists.
  const decisionN = N >= DECISION_OBJECTIVE ? DECISION_OBJECTIVE : N;
  const decisionM = Math.min(DECISION_TRD, T);
  paths.decisionTrd = `objectives/${objectiveDirName(decisionN)}/${trdFileName(decisionN, decisionM)}`;
  add('decisions/pending/DECISION-002.md', decisionWithTrd(trdId(decisionN, decisionM)));
  counts.decisionsWithTrd += 1;
  add('decisions/resolved/DECISION-001.md', DECISION_WITHOUT_TRD);
  counts.decisionsWithoutTrd += 1;

  // Variants: an extra, (T+1)-numbered file in the last objective, so the default TRDs are untouched.
  if (legacyTrd) {
    const rel = `objectives/${objectiveDirName(N)}/${pad(N)}-${pad(T + 1)}-TRD-legacy-step.md`;
    add(rel, legacyTrdMd(N, T + 1));
    paths.legacyTrd = rel;
    counts.legacyTrds += 1;
  }
  if (oversizeTrd) {
    const file = `${pad(N)}-${pad(T + 1)}-big-step-TRD.md`;
    const rel = `objectives/${objectiveDirName(N)}/${file}`;
    add(rel, oversizeTrdMd(N, T + 1, file));
    paths.oversizeTrd = rel;
    counts.oversizeTrds += 1;
    counts.trds += 1;
  }

  counts.files = entries.length;
  return { entries, shape: Object.freeze(counts), paths: Object.freeze(paths) };
}

/** The default build's counts: 20 objectives, 100 TRDs, 80 SUMMARYs, 8 VERIFICATIONs, 15 shipped, 2 shipped milestones. */
const BACKFILL_SHAPE = layout().shape;

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * makeBackfillProject(opts) -> {root, home, shape, files, paths, cleanup}
 *
 *   objectives        20     number of objectives (statuses are by objective number, so a smaller build is all shipped)
 *   trdsPerObjective  5      TRDs per objective
 *   git               true   `initGitFixture`: git init + one commit of everything, so 0010 has tracked files to untrack
 *   legacyTrd         false  add `NN-MM-TRD-legacy-step.md` (a LEGACY_TRD_RE name) to the last objective
 *   oversizeTrd       false  add a 61,000-char `NN-MM-big-step-TRD.md` to the last objective
 *   home              null   the fake home git runs with; a fresh `makeFakeHome()` when omitted (removed by cleanup)
 *
 * `files` lists every written path relative to `.planning/` in write order; `paths` names the deferred TRD, the TRD the
 * decision blocks, and the variant files (null when absent). `cleanup()` removes the project (and a home it created).
 */
function makeBackfillProject({
  objectives = 20, trdsPerObjective = 5, git = true, legacyTrd = false, oversizeTrd = false, home = null,
} = {}) {
  const { entries, shape, paths } = layout({ objectives, trdsPerObjective, legacyTrd, oversizeTrd });
  const ownHome = home === null || home === undefined;
  const projectHome = ownHome ? makeFakeHome() : home;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-backfill-'));
  try {
    for (const [rel, text] of entries) {
      const full = path.join(root, '.planning', ...rel.split('/'));
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, text, 'utf-8');
    }
    if (git) initGitFixture(root, projectHome);
  } catch (err) {
    fs.rmSync(root, { recursive: true, force: true });
    if (ownHome) fs.rmSync(projectHome, { recursive: true, force: true });
    throw err;
  }

  return {
    root,
    home: projectHome,
    shape,
    files: entries.map(([rel]) => rel),
    paths,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
      if (ownHome) fs.rmSync(projectHome, { recursive: true, force: true });
    },
  };
}

// ─── Test harness ─────────────────────────────────────────────────────────────

/** The fake clock's start (2026-10-01T12:00:00Z, the same instant planning-import.test.cjs uses). */
const BACKFILL_T0 = Date.UTC(2026, 9, 1, 12, 0, 0);

/**
 * useBackfillEnv(t, opts) -> {root, home, shape, files, paths, fake, clock, wiki, env} | null
 *
 * Everything a backfill test needs, set up inside ONE test and torn down by `t.after` (the `useProject` pattern of
 * planning-import.test.cjs, per test rather than per describe):
 *   - hermeticEnv(): HOME, DEVFLOW_OUTBOX_DIR, DEVFLOW_GH_CACHE_DIR and git isolation on process.env;
 *   - applyGitTestEnv(home), so git spawned by the code under test is isolated too;
 *   - makeBackfillProject({...opts, home, git: true}), with the hermetic home as its git home;
 *   - createFakeGitHub({hasWiki: true, ...opts.fake}) installed through gh._setRunGh;
 *   - createWikiRemote({seed: opts.wikiSeed}) (default first page `Home.md`) as DEVFLOW_WIKI_REMOTE;
 *   - a fake clock: client._setNow(() => clock.t), client._setSleep((ms) => { clock.t += ms; }).
 *
 * `opts` takes the builder's options (objectives, trdsPerObjective, legacyTrd, oversizeTrd) plus `fake` and `wikiSeed`.
 * `env` is the overlay a child process needs (hermetic env + git isolation + DEVFLOW_WIKI_REMOTE).
 *
 * Returns null after `t.skip(...)` when git is unavailable (the project is a git repo and the wiki is a bare repo), so
 * callers write `const env = useBackfillEnv(t); if (!env) return;`. Teardown restores the real runner and clock,
 * every env var it touched, and removes every temp dir it made.
 */
function useBackfillEnv(t, opts = {}) {
  if (!gitAvailable()) {
    t.skip('git is not available: the backfill fixture is a git repository and the wiki remote is a bare repo');
    return null;
  }
  const { fake: fakeOptions = {}, wikiSeed, home: _ignoredHome, git: _ignoredGit, ...builderOptions } = opts || {};

  const teardown = [];
  t.after(() => {
    for (const undo of teardown.reverse()) undo();
  });

  const envh = hermeticEnv();
  teardown.push(() => envh.restore());
  const home = envh.env.HOME;
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });

  const restoreGit = applyGitTestEnv(home);
  teardown.push(restoreGit);

  const project = makeBackfillProject({ ...builderOptions, home, git: true });
  teardown.push(() => project.cleanup());

  const wiki = createWikiRemote(wikiSeed ? { seed: wikiSeed } : {});
  teardown.push(() => wiki.cleanup());
  const hadRemote = Object.prototype.hasOwnProperty.call(process.env, 'DEVFLOW_WIKI_REMOTE');
  const savedRemote = process.env.DEVFLOW_WIKI_REMOTE;
  process.env.DEVFLOW_WIKI_REMOTE = wiki.remoteUrl;
  teardown.push(() => {
    if (hadRemote) process.env.DEVFLOW_WIKI_REMOTE = savedRemote;
    else delete process.env.DEVFLOW_WIKI_REMOTE;
  });

  const fake = createFakeGitHub({ hasWiki: true, ...fakeOptions });
  const clock = { t: BACKFILL_T0 };
  client._resetClient();
  client._setNow(() => clock.t);
  client._setSleep((ms) => { clock.t += ms; });
  gh._setRunGh(fake.runGh);
  gh._resetCache();
  teardown.push(() => {
    client._resetClient();
    gh._setRunGh(null);
    gh._resetCache();
  });

  return {
    root: project.root,
    home,
    shape: project.shape,
    files: project.files,
    paths: project.paths,
    fake,
    clock,
    wiki,
    env: { ...envh.env, ...gitTestEnv(home), DEVFLOW_WIKI_REMOTE: wiki.remoteUrl },
  };
}

module.exports = {
  makeBackfillProject,
  BACKFILL_SHAPE,
  MILESTONE_PLAN,
  useBackfillEnv,
  BACKFILL_T0,
};
