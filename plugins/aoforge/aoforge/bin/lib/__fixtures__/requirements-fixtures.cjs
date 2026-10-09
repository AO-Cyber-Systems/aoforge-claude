'use strict';

// requirements-fixtures.cjs (TRD 69-03) — hand-built projects for requirements-agreement.cjs. Literal text only: every
// builder mirrors a file shape copied from this repository on 2026-10-08, no generated data.
//
//   REQUIREMENTS.md     `- [x] **EST-02**: text` definition lines, a traceability table repeating the IDs (a row is NOT a
//                       definition) and a prose line mentioning one (neither counts); archived copies sit at
//                       .aoforge/milestones/<version>-REQUIREMENTS.md
//   VERIFICATION        `## Observable Truths` table, then `## Requirements Coverage` with `| Req | Plans | Status |` rows
//                       (58-VERIFICATION.md) or `| Requirement | Status | Blocking Issue |` (verification-report.md)
//   SUMMARY             frontmatter `objective`, `trd`, then the raw requirements-completed YAML, then a `verification:` block
//   TRD                 frontmatter `requirements: [..]`, a one-line body

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** The separator row for a header row: `| a | b | c |` -> `|---|---|---|`. */
function separatorFor(header) {
  const cells = header.split('|').slice(1, -1);
  return `|${cells.map(() => '---').join('|')}|`;
}

/** REQUIREMENTS.md text: one checkbox definition line per ID, a traceability table repeating them, and a prose mention. */
function requirementsDocText(entries) {
  const defs = entries.map(e => {
    const { id, checked } = typeof e === 'string' ? { id: e, checked: true } : { checked: true, ...e };
    return `- [${checked ? 'x' : ' '}] **${id}**: ${id} requirement text`;
  });
  const rows = entries.map(e => `| ${typeof e === 'string' ? e : e.id} | Objective 1 | Complete |`);
  const first = entries.length ? (typeof entries[0] === 'string' ? entries[0] : entries[0].id) : 'NONE-00';
  return [
    '# Requirements',
    '',
    '## v1 Requirements',
    '',
    ...defs,
    '',
    '## Traceability',
    '',
    '| Requirement | Objective | Status |',
    '|---|---|---|',
    ...rows,
    '',
    `Note: ${first} is mentioned in prose here and is not a definition.`,
    '',
  ].join('\n');
}

/**
 * An AOForge-shaped temp project (realpath'd, so path comparisons hold on macOS).
 *   requirements  [id | { id, checked }]            -> .aoforge/REQUIREMENTS.md (omitted when empty)
 *   archived      { '<version>': [id | {id,..}] }   -> .aoforge/milestones/<version>-REQUIREMENTS.md
 *   objectives    [{ dir, verifications, summaries, trds }]  each a { fileName: text } map, written under
 *                 .aoforge/objectives/<dir>/
 * -> { root, planningDir, write(rel, text), cleanup() }   `rel` is relative to .aoforge/
 */
function makeRequirementsProject({ requirements = [], archived = {}, objectives = [] } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-reqagree-')));
  const planningDir = path.join(root, '.aoforge');
  fs.mkdirSync(planningDir, { recursive: true });

  function write(rel, text) {
    const file = path.join(planningDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }

  if (requirements.length) write('REQUIREMENTS.md', requirementsDocText(requirements));
  for (const [version, entries] of Object.entries(archived)) {
    write(path.join('milestones', `${version}-REQUIREMENTS.md`), requirementsDocText(entries));
  }
  for (const o of objectives) {
    fs.mkdirSync(path.join(planningDir, 'objectives', o.dir), { recursive: true });
    for (const group of [o.verifications, o.summaries, o.trds]) {
      for (const [name, text] of Object.entries(group || {})) write(path.join('objectives', o.dir, name), text);
    }
  }

  return { root, planningDir, write, cleanup() { fs.rmSync(root, { recursive: true, force: true }); } };
}

/**
 * A VERIFICATION.md: frontmatter, an Observable Truths table (`truths` rows verbatim), the coverage section (`heading`,
 * `header`, a separator derived from it, `coverage` rows verbatim), then Anti-Patterns Found.
 */
function verificationText({
  coverage = [],
  truths = [],
  heading = '## Requirements Coverage',
  header = '| Requirement | Status | Blocking Issue |',
} = {}) {
  return [
    '---',
    'status: passed',
    '---',
    '',
    '# Objective Verification',
    '',
    '## Observable Truths',
    '',
    '| # | Truth | Status | Evidence |',
    '|---|-------|--------|----------|',
    ...truths,
    '',
    heading,
    '',
    header,
    separatorFor(header),
    ...coverage,
    '',
    'No orphaned requirements.',
    '',
    '## Anti-Patterns Found',
    '',
    'None.',
    '',
  ].join('\n');
}

/**
 * A SUMMARY.md. `rcBlock` is the raw requirements-completed YAML, verbatim: an inline line, a block list, a commented
 * line, a wrong-key line, or '' for absent.
 */
function summaryText(rcBlock = '', { objective = '58-est', trd = '01' } = {}) {
  return [
    '---',
    `objective: ${objective}`,
    `trd: "${trd}"`,
    ...(rcBlock === '' ? [] : [rcBlock]),
    'verification:',
    '  gates_defined: 2',
    '  gates_passed: 2',
    '---',
    '',
    `# Objective ${objective} TRD ${trd} Summary`,
    '',
    'One-liner.',
    '',
  ].join('\n');
}

/** A TRD.md whose frontmatter carries `requirements: <requirementsLine>` (the raw value, e.g. `[EST-02, EST-03]`). */
function trdText(requirementsLine, { objective = '58-est', trd = '01' } = {}) {
  return [
    '---',
    `objective: ${objective}`,
    `trd: "${trd}"`,
    'type: standard',
    `requirements: ${requirementsLine}`,
    '---',
    '',
    `# TRD ${trd}`,
    '',
    'One-line body.',
    '',
  ].join('\n');
}

// The ten objective 58 TRDs: slug and `requirements` field as on the 58-NN-*-TRD.md files (the correction table of
// TRD 69-03). `listed` is what the SUMMARY's requirements-completed held before the correction.
const FIFTY_EIGHT = [
  { nn: '01', slug: 'composition-math', requirements: ['EST-03'], listed: ['EST-03'] },
  { nn: '02', slug: 'agent-overhead-reader', requirements: ['EST-03'], listed: [] },
  { nn: '03', slug: 'calibration-v2', requirements: ['EST-03'], listed: [] },
  { nn: '04', slug: 'run-state-and-statusline', requirements: ['EST-05'], listed: ['EST-05'] },
  { nn: '05', slug: 'task-and-trd-estimates', requirements: ['EST-02', 'EST-03'], listed: [] },
  { nn: '06', slug: 'objective-rollup', requirements: ['EST-03'], listed: [] },
  { nn: '07', slug: 'milestone-rollup', requirements: ['EST-03'], listed: [] },
  { nn: '08', slug: 'estimate-cli', requirements: ['EST-02', 'EST-03', 'EST-05'], listed: [] },
  { nn: '09', slug: 'planning-and-build-surfacing', requirements: ['EST-04', 'EST-05'], listed: [] },
  { nn: '10', slug: 'dogfood-and-docs', requirements: ['EST-02', 'EST-03', 'EST-04', 'EST-05'], listed: [] },
];

const inline = ids => `[${ids.join(', ')}]`;

/**
 * The arguments for makeRequirementsProject that reproduce objective 58 as it stood before TRD 69-03: EST-02..05 defined,
 * VERIFICATION marks all four SATISFIED (the rows of 58-VERIFICATION.md), SUMMARYs list only EST-03 (58-01) and EST-05
 * (58-04), every TRD lists its share. `corrected: true` gives every SUMMARY its TRD's list (the state after the fix).
 * 10 TRDs + 10 SUMMARYs + 1 VERIFICATION = 21 files in `58-est`.
 */
function fiftyEightShape({ corrected = false } = {}) {
  const summaries = {};
  const trds = {};
  for (const t of FIFTY_EIGHT) {
    const ids = corrected ? t.requirements : t.listed;
    summaries[`58-${t.nn}-SUMMARY.md`] = summaryText(`requirements-completed: ${inline(ids)}`, { trd: t.nn });
    trds[`58-${t.nn}-${t.slug}-TRD.md`] = trdText(inline(t.requirements), { trd: t.nn });
  }
  return {
    requirements: ['EST-02', 'EST-03', 'EST-04', 'EST-05'],
    objectives: [
      {
        dir: '58-est',
        verifications: {
          '58-VERIFICATION.md': verificationText({
            header: '| Req | Plans | Status |',
            truths: ['| 1 | Estimates compose across TRDs | ✓ VERIFIED | estimate-math.test.cjs |'],
            coverage: [
              '| EST-02 | 58-05, 58-08, 58-10 | SATISFIED (checkbox deliberately left for orchestrator) |',
              '| EST-03 | 58-01,02,03,05,06,07,08,10 | SATISFIED |',
              '| EST-04 | 58-09, 58-10 | SATISFIED |',
              '| EST-05 | 58-04, 58-08, 58-09, 58-10 | SATISFIED |',
            ],
          }),
        },
        summaries,
        trds,
      },
    ],
  };
}

module.exports = {
  makeRequirementsProject,
  verificationText,
  summaryText,
  trdText,
  fiftyEightShape,
};
