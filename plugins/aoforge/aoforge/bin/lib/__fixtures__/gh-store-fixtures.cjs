'use strict';

// gh-store-fixtures.cjs (TRD 47-02) — the hand-built, store-shaped project every objective-47 test reuses.
//
// One objective (`07-store-demo`), three TRDs in two waves, the planning docs around them and a github
// config, all written LITERALLY below: no generated or model-written data, so a failing test can be read
// against the exact text that went in. Pair it with `__fixtures__/gh-fake.cjs`:
//
//     const project = makeStoreProject({ store: true });
//     const fake = createFakeGitHub(project.fakeOptions);
//     require('../gh-client.cjs')._setRunGh(fake.runGh);
//
// Exports:
//   STORE_FIXTURE      the literal file contents and the constants that describe them
//   makeStoreProject   writes the project under os.tmpdir(), returns { root, objectiveDir, trdFiles, ... }
//   oversizedTrdText   a TRD whose encoded issue body is exactly n characters (budget boundaries)
//   hermeticEnv        temp HOME / outbox / cache dirs and git isolation, with an exact restore()
//
// Nothing here touches the real ~/.claude or the network, and nothing is written outside os.tmpdir().

const fs = require('fs');
const os = require('os');
const path = require('path');
const { NAMES } = require('../legacy-names.cjs');

// The planning-directory name the project builders write (TRD 72-05). The todo-sync hook resolves only the legacy name
// until 72-06 moves it onto the resolver, so its tests call setPlanningDir(LEGACY.planningDir) once at load; 72-06
// drops those calls. node --test runs each file in its own process, so the switch never leaks.
let PLANNING = NAMES.planningDir;
function setPlanningDir(name) {
  PLANNING = name;
}

const doc = (lines, { trailingNewline = true } = {}) => lines.join('\n') + (trailingNewline ? '\n' : '');

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const TRD_ALPHA = doc([
  '---',
  'objective: 07-store-demo',
  'trd: "01"',
  'type: tdd',
  'wave: 1',
  'depends_on: []',
  'files_modified:',
  '  - src/key.cjs',
  '  - src/key.test.cjs',
  'autonomous: true',
  'requirements: [STO-01]',
  'must_haves:',
  '  truths:',
  '    - "parseKey(\'07-01\') returns {objective: 7, trd: 1}"',
  '---',
  '',
  '# TRD 07-01: Alpha, the store key parser',
  '',
  '<objective>',
  'Parse a store key such as `07-01` into its objective and TRD numbers.',
  '</objective>',
  '',
  '<tasks>',
  '',
  '<task type="auto" tdd="true">',
  '  <name>Task 1: parseKey</name>',
  '  <files>src/key.cjs, src/key.test.cjs</files>',
  '  <action>RED: assert parseKey(\'07-01\') deep-equals {objective: 7, trd: 1} and that a malformed key throws. GREEN: split on the dash and parse both parts as integers.</action>',
  '  <verify>node --test src/key.test.cjs</verify>',
  '  <done>parseKey handles every well-formed key and rejects the rest.</done>',
  '</task>',
  '',
  '</tasks>',
  '',
  '<success_criteria>',
  '`parseKey` and `formatKey` round-trip every key.',
  '</success_criteria>',
]);

const TRD_BETA = doc([
  '---',
  'objective: 07-store-demo',
  'trd: "02"',
  'type: standard',
  'wave: 1',
  'depends_on: []',
  'files_modified:',
  '  - src/format.cjs',
  '  - src/format.test.cjs',
  'autonomous: true',
  'requirements: [STO-01]',
  'must_haves:',
  '  truths:',
  '    - "formatKey(7, 2) returns \'07-02\'"',
  '---',
  '',
  '# TRD 07-02: Beta — the store key formatter',
  '',
  '<objective>',
  'Format an objective number and a TRD number as a zero-padded store key. Proof of a non-ASCII round trip: café, naïve, → and —.',
  '</objective>',
  '',
  '<tasks>',
  '',
  '<task type="auto">',
  '  <name>Task 1: formatKey</name>',
  '  <files>src/format.cjs, src/format.test.cjs</files>',
  '  <action>Pad both numbers to two digits and join them with a dash. Add a test per padding case.</action>',
  '  <verify>node --test src/format.test.cjs</verify>',
  '  <done>formatKey(7, 2) returns 07-02 and formatKey(12, 10) returns 12-10.</done>',
  '</task>',
  '',
  '</tasks>',
  '',
  '<success_criteria>',
  'Both padding cases are covered by a passing test.',
  '</success_criteria>',
]);

// No trailing newline: the codec must round-trip a file exactly as written.
const TRD_GAMMA = doc([
  '---',
  'objective: 07-store-demo',
  'trd: "03"',
  'type: standard',
  'wave: 2',
  'depends_on: ["07-01"]',
  'files_modified:',
  '  - src/list.cjs',
  '  - src/list.test.cjs',
  'autonomous: true',
  'requirements: [STO-02]',
  'must_haves:',
  '  truths:',
  '    - "listTrds orders TRDs by wave, then by number"',
  '---',
  '',
  '# TRD 07-03: Gamma, the wave-ordered listing',
  '',
  '<objective>',
  'List the TRDs of an objective in wave order. Needs parseKey from 07-01, so it runs in wave 2.',
  '</objective>',
  '',
  '<tasks>',
  '',
  '<task type="auto">',
  '  <name>Task 1: listTrds</name>',
  '  <files>src/list.cjs, src/list.test.cjs</files>',
  '  <action>Sort by wave, then by the TRD number that parseKey returns. Cover two TRDs in one wave and one in the next.</action>',
  '  <verify>node --test src/list.test.cjs</verify>',
  '  <done>listTrds returns 07-01, 07-02, 07-03 for the demo objective.</done>',
  '</task>',
  '',
  '</tasks>',
  '',
  '<success_criteria>',
  'The listing is stable across runs.',
  '</success_criteria>',
], { trailingNewline: false });

const STORE_FIXTURE = deepFreeze({
  repo: 'o/r',
  milestone: { version: 'v9.9', name: 'Store Demo', title: 'v9.9 Store Demo' },
  objectiveNumber: 7,
  objectiveDir: '07-store-demo',
  trdFiles: ['07-01-alpha-TRD.md', '07-02-beta-TRD.md', '07-03-gamma-TRD.md'],
  summaryFile: '07-01-alpha-SUMMARY.md',

  roadmap: doc([
    '# Roadmap: Store Demo',
    '',
    '## Milestones',
    '',
    '- 🚧 **v9.9 Store Demo** - Objective 7 (in progress)',
    '',
    '## Objectives',
    '',
    '### Objective 7: Store demo',
    '**Goal:** Round-trip a demo objective through the GitHub authoritative store',
    '**Requirements:** STO-01, STO-02',
    '',
    '**Success Criteria** (what must be TRUE):',
    '  1. The demo objective pushes to GitHub as one issue with three TRD sub-issues',
    '  2. The local cache rebuilds from GitHub alone, byte for byte',
    '',
    '**Plans:** 3 TRDs in 2 waves',
    '',
    'TRDs:',
    '- [x] 07-01-alpha-TRD.md — (W1, tdd) store key parser (STO-01)',
    '- [ ] 07-02-beta-TRD.md — (W1) store key formatter (STO-01)',
    '- [ ] 07-03-gamma-TRD.md — (W2) wave-ordered listing (STO-02)',
  ]),

  project: doc([
    '---',
    'kind: plugin',
    'default_work: feature',
    '---',
    '',
    '# Store Demo',
    '',
    '## What This Is',
    '',
    'A demo project that exists only to exercise the GitHub authoritative store: one objective, three TRDs in two waves.',
  ]),

  requirements: doc([
    '# Requirements: Store Demo',
    '',
    '## v9.9 Requirements',
    '',
    '- [ ] **STO-01** A store key such as `07-01` parses into its objective and TRD numbers and formats back',
    '- [ ] **STO-02** The TRDs of an objective list in wave order',
  ]),

  objective: doc([
    '---',
    'objective: 07-store-demo',
    'work: feature',
    'status: planned',
    'milestone: v9.9',
    'depends_on: Objective 6',
    '---',
    '',
    '# Objective 7 — Store demo',
    '',
    '## Goal',
    '',
    'Round-trip a demo objective through the GitHub authoritative store.',
    '',
    '## Requirements',
    '',
    '- **STO-01** A store key parses and formats',
    '- **STO-02** TRDs list in wave order',
    '',
    '## Success Criteria',
    '',
    '1. The demo objective pushes to GitHub as one issue with three TRD sub-issues',
    '2. The local cache rebuilds from GitHub alone, byte for byte',
  ]),

  context: doc([
    '# Objective 7: Store demo - Context',
    '',
    '## Decisions',
    '',
    '- Keys are two zero-padded numbers joined by a dash.',
    '- Waves come from `depends_on`, never from file order.',
    '',
    '## Deferred',
    '',
    '- Decimal objective numbers.',
  ]),

  research: doc([
    '# Objective 7: Store demo - Research',
    '',
    '## Findings',
    '',
    '- A key is at most five characters, so a plain `split(\'-\')` is enough.',
    '- Sorting by wave then number is stable on every supported Node version.',
    '',
    '## Open questions',
    '',
    '- None.',
  ]),

  trds: {
    '07-01-alpha-TRD.md': TRD_ALPHA,
    '07-02-beta-TRD.md': TRD_BETA,
    '07-03-gamma-TRD.md': TRD_GAMMA,
  },

  summary: doc([
    '---',
    'objective: 07-store-demo',
    'trd: "01"',
    'subsystem: demo',
    'key-files:',
    '  created: [src/key.cjs, src/key.test.cjs]',
    'duration: 12min',
    'completed: 2026-01-02',
    '---',
    '',
    '# Objective 7 TRD 01: Alpha Summary',
    '',
    '**parseKey splits a store key into integer objective and TRD numbers**',
    '',
    '## Task Evidence',
    '',
    '| Task | Verify Command | Exit Code | Status |',
    '|---|---|---|---|',
    '| 1: parseKey | `node --test src/key.test.cjs` | 0 | PASS |',
    '',
    '## Self-Check: PASSED',
  ]),
});

/**
 * Write a store-shaped project under os.tmpdir().
 *
 * `ownerType` and `hasWiki` are NOT written to disk: they describe the fake GitHub, so they are only
 * carried in `fakeOptions` (hand that to `createFakeGitHub`). `enabled` is `github.enabled`; `store: true`
 * adds `github.store: true` (the strict-boolean opt-in of 47-12, absent otherwise).
 *
 * @returns {{root:string, objectiveDir:string, trdFiles:string[], summaryFile:string,
 *   fakeOptions:{repo:string, ownerType:string, hasWiki:boolean}, cleanup:()=>void}}
 */
function makeStoreProject({ ownerType = 'Organization', hasWiki = true, enabled = true, store = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-store-'));
  const planning = path.join(root, PLANNING);
  const objective = path.join(planning, 'objectives', STORE_FIXTURE.objectiveDir);
  fs.mkdirSync(objective, { recursive: true });

  const github = { enabled, repo: STORE_FIXTURE.repo };
  if (store) github.store = true;
  fs.writeFileSync(path.join(planning, 'config.json'), `${JSON.stringify({ github }, null, 2)}\n`);

  fs.writeFileSync(path.join(planning, 'ROADMAP.md'), STORE_FIXTURE.roadmap);
  fs.writeFileSync(path.join(planning, 'PROJECT.md'), STORE_FIXTURE.project);
  fs.writeFileSync(path.join(planning, 'REQUIREMENTS.md'), STORE_FIXTURE.requirements);
  fs.writeFileSync(path.join(objective, 'OBJECTIVE.md'), STORE_FIXTURE.objective);
  fs.writeFileSync(path.join(objective, '07-CONTEXT.md'), STORE_FIXTURE.context);
  fs.writeFileSync(path.join(objective, '07-RESEARCH.md'), STORE_FIXTURE.research);
  for (const [file, text] of Object.entries(STORE_FIXTURE.trds)) fs.writeFileSync(path.join(objective, file), text);
  fs.writeFileSync(path.join(objective, STORE_FIXTURE.summaryFile), STORE_FIXTURE.summary);

  return {
    root,
    objectiveDir: STORE_FIXTURE.objectiveDir,
    trdFiles: [...STORE_FIXTURE.trdFiles],
    summaryFile: STORE_FIXTURE.summaryFile,
    fakeOptions: { repo: STORE_FIXTURE.repo, ownerType, hasWiki },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/**
 * TRD text whose ENCODED issue body is exactly `n` characters. Per D-01 the body is two header lines
 * followed by the file verbatim, so `header.length + text.length === n`. The header is computed here
 * rather than imported from 47-01, which keeps this fixture independent of the codec it is used to test
 * (47-09 re-asserts the same lengths against the real `encodeTrdBody`). Lengths are JS `.length` (D-05).
 *
 * The text is a TRD-shaped skeleton (frontmatter + one task) padded with `x` lines of 100 characters.
 *
 * @param {number} n target encoded length
 * @param {{id:string, file:string}} meta the `aoforge:id` and `aoforge:file` header values
 */
function oversizedTrdText(n, { id, file } = {}) {
  if (typeof id !== 'string' || !id || typeof file !== 'string' || !file) {
    throw new TypeError('oversizedTrdText needs both id and file ({ id, file }) for the D-01 header');
  }
  const header = `<!-- aoforge:id=${id} -->\n<!-- aoforge:file=${file} -->\n`;
  const trdNumber = id.slice(id.lastIndexOf('-') + 1);
  const skeleton = doc([
    '---',
    'objective: 07-store-demo',
    `trd: "${trdNumber}"`,
    'type: standard',
    'wave: 1',
    'depends_on: []',
    '---',
    '',
    `# TRD ${id}: padded to an exact size`,
    '',
    '<task type="auto">',
    '  <name>Task 1: padding</name>',
    '</task>',
    '',
  ]);
  const floor = header.length + skeleton.length;
  if (!Number.isInteger(n) || n < floor) {
    throw new RangeError(`oversizedTrdText: n must be an integer >= ${floor} to hold the header and skeleton (got ${n})`);
  }
  let left = n - floor;
  let padding = '';
  while (left > 100) {
    padding += `${'x'.repeat(99)}\n`;
    left -= 100;
  }
  if (left > 0) padding += `${'x'.repeat(left - 1)}\n`;
  return skeleton + padding;
}

const HERMETIC_GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'AOForge Test',
  GIT_AUTHOR_EMAIL: 'aoforge-test@example.invalid',
  GIT_COMMITTER_NAME: 'AOForge Test',
  GIT_COMMITTER_EMAIL: 'aoforge-test@example.invalid',
};

/**
 * Point every location a store test could write to at a fresh temp root, and isolate git from the
 * machine's config. Mutates `process.env`; `restore()` puts every variable back exactly, deleting the
 * ones that were unset, and removes the temp root (idempotent). Nested calls restore in reverse order.
 *
 * The outbox and cache directories are NOT created: "the journal is absent" is a state tests assert.
 * Git identity is set because `GIT_CONFIG_GLOBAL=/dev/null` leaves a wiki commit with no author.
 *
 * @returns {{env:Record<string,string>, root:string, restore:()=>void}}
 */
function hermeticEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-store-env-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(home);
  const env = {
    HOME: home,
    AOFORGE_OUTBOX_DIR: path.join(root, 'outbox'),
    AOFORGE_GH_CACHE_DIR: path.join(root, 'gh-cache'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    ...HERMETIC_GIT_IDENTITY,
  };

  const saved = {};
  for (const key of Object.keys(env)) {
    const had = Object.prototype.hasOwnProperty.call(process.env, key);
    saved[key] = { had, value: had ? process.env[key] : undefined };
  }
  Object.assign(process.env, env);

  let restored = false;
  function restore() {
    if (restored) return;
    restored = true;
    for (const [key, { had, value }] of Object.entries(saved)) {
      if (had) process.env[key] = value;
      else delete process.env[key];
    }
    fs.rmSync(root, { recursive: true, force: true });
  }

  return { env: { ...env }, root, restore };
}

module.exports = {
  setPlanningDir, STORE_FIXTURE, makeStoreProject, oversizedTrdText, hermeticEnv };
