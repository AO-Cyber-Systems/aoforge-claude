'use strict';

// requirements-agreement.test.cjs (TRD 69-03, TOOL-10) — a requirement an objective's VERIFICATION marks SATISFIED must
// appear in some SUMMARY's requirements-completed in that objective. Hand-built projects (__fixtures__/
// requirements-fixtures.cjs) mirror the real shapes.
//
// Test list:
//  1. 58-shaped project (EST-02..05; SUMMARYs list only EST-03 and EST-05) -> findings for EST-02 and EST-04 only.
//  2. The same project once the SUMMARYs match their TRDs -> no findings, checked {1, 4}.
//  3. IDs defined in no REQUIREMENTS document (SC-1, AC-2, STK-02a) are skipped, never findings; an archived
//     milestones/*-REQUIREMENTS.md ID is checked like a current one.
//  4. No REQUIREMENTS document -> no findings, every satisfied ID skipped.
//  5. parseSatisfied: only Requirements Coverage rows, only SATISFIED, first-cell ID forms, section ends at next heading.
//  6. parseCompleted: inline, empty, quoted free text, block list, trailing comment, absent key, wrong key.
//  7. knownRequirementIds: checkbox definitions in REQUIREMENTS.md and milestones/*-REQUIREMENTS.md, not table rows.
//  8. scan({ objective }) scopes by number (5 -> 05-*, never 58-*); an objective without VERIFICATION is not counted.
//  9. Several VERIFICATIONs are unioned; a SUMMARY of another objective does not satisfy this one.
// 10. findingMessage / findingFix texts.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ra = require('./requirements-agreement.cjs');
const {
  makeRequirementsProject,
  verificationText,
  summaryText,
  trdText,
  fiftyEightShape,
} = require('./__fixtures__/requirements-fixtures.cjs');

/** A project for `t` that is removed when the test ends. */
function project(t, args) {
  const p = makeRequirementsProject(args);
  t.after(() => p.cleanup());
  return p;
}

const COVERAGE_HEADER = '| Requirement | Status | Blocking Issue |';

/** One objective whose VERIFICATION marks `ids` SATISFIED and whose SUMMARYs list `listed`. */
function simpleObjective(dir, { ids, listed = [], trds = {} }) {
  const n = dir.split('-')[0];
  return {
    dir,
    verifications: {
      [`${n}-VERIFICATION.md`]: verificationText({ coverage: ids.map(id => `| ${id}: text | ✓ SATISFIED | - |`) }),
    },
    summaries: { [`${n}-01-SUMMARY.md`]: summaryText(`requirements-completed: [${listed.join(', ')}]`) },
    trds,
  };
}

describe('scan', () => {
  test('1. flags the satisfied requirements no SUMMARY lists (the objective 58 shape)', t => {
    const p = project(t, fiftyEightShape());
    const result = ra.scan(p.planningDir);
    assert.deepEqual(result.findings, [
      {
        objective: '58-est',
        number: '58',
        requirement: 'EST-02',
        verification: '58-VERIFICATION.md',
        candidates: ['58-05', '58-08', '58-10'],
      },
      {
        objective: '58-est',
        number: '58',
        requirement: 'EST-04',
        verification: '58-VERIFICATION.md',
        candidates: ['58-09', '58-10'],
      },
    ]);
  });

  test('1b. findings are sorted by objective, then requirement', t => {
    const p = project(t, {
      requirements: ['AAA-01', 'BBB-01', 'CCC-01'],
      objectives: [
        simpleObjective('20-late', { ids: ['CCC-01', 'AAA-01'] }),
        simpleObjective('03-early', { ids: ['BBB-01'] }),
      ],
    });
    const { findings } = ra.scan(p.planningDir);
    assert.deepEqual(findings.map(f => `${f.objective} ${f.requirement}`), [
      '03-early BBB-01',
      '20-late AAA-01',
      '20-late CCC-01',
    ]);
  });

  test('2. no findings once the SUMMARYs match their TRDs', t => {
    const p = project(t, fiftyEightShape({ corrected: true }));
    const result = ra.scan(p.planningDir);
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.checked, { objectives: 1, requirements: 4 });
    assert.deepEqual(result.skipped, []);
  });

  test('3. IDs no REQUIREMENTS document defines are skipped; an archived milestone ID is checked', t => {
    const p = project(t, {
      requirements: ['EST-02'],
      archived: { 'v1.5': ['OLD-01'] },
      objectives: [
        {
          dir: '07-old',
          verifications: {
            '07-VERIFICATION.md': verificationText({
              coverage: [
                '| SC-1 | ✓ SATISFIED | - |',
                '| OLD-01: archived requirement | ✓ SATISFIED | - |',
                '| AC-2 | ✓ SATISFIED | - |',
                '| EST-02 | ✓ SATISFIED | - |',
                '| STK-02a | ✓ SATISFIED | - |',
              ],
            }),
          },
          summaries: { '07-01-SUMMARY.md': summaryText('requirements-completed: [EST-02]') },
          trds: { '07-01-thing-TRD.md': trdText('[OLD-01]') },
        },
      ],
    });
    const result = ra.scan(p.planningDir);
    assert.deepEqual(result.findings, [
      { objective: '07-old', number: '07', requirement: 'OLD-01', verification: '07-VERIFICATION.md', candidates: ['07-01'] },
    ]);
    assert.deepEqual(result.skipped, [{ objective: '07-old', ids: ['SC-1', 'AC-2', 'STK-02a'] }]);
    assert.deepEqual(result.checked, { objectives: 1, requirements: 2 });
  });

  test('4. with no REQUIREMENTS document nothing is checked and every satisfied ID is skipped', t => {
    const p = project(t, { objectives: [simpleObjective('58-est', { ids: ['EST-02', 'EST-03'] })] });
    const result = ra.scan(p.planningDir);
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.skipped, [{ objective: '58-est', ids: ['EST-02', 'EST-03'] }]);
    assert.deepEqual(result.checked, { objectives: 1, requirements: 0 });
  });

  test('4b. a project with no objectives directory scans clean', t => {
    const p = project(t, { requirements: ['EST-02'] });
    assert.deepEqual(ra.scan(p.planningDir), { checked: { objectives: 0, requirements: 0 }, findings: [], skipped: [] });
  });

  test('8. { objective } scopes the scan by number; an objective without VERIFICATION is not counted', t => {
    const p = project(t, {
      requirements: ['EST-02', 'EST-03'],
      objectives: [
        simpleObjective('05-early', { ids: ['EST-03'] }),
        simpleObjective('58-est', { ids: ['EST-02'] }),
        { dir: '06-noverify', summaries: { '06-01-SUMMARY.md': summaryText('requirements-completed: [EST-02]') } },
      ],
    });
    p.write('objectives/.gitkeep', '');
    p.write('objectives/v1.2-objectives/stray.md', 'not an objective');

    assert.deepEqual(ra.scan(p.planningDir).checked, { objectives: 2, requirements: 2 });

    const only58 = ra.scan(p.planningDir, { objective: '58' });
    assert.deepEqual(only58.findings.map(f => f.objective), ['58-est']);
    assert.deepEqual(only58.checked, { objectives: 1, requirements: 1 });

    const only5 = ra.scan(p.planningDir, { objective: '5' });
    assert.deepEqual(only5.findings.map(f => f.objective), ['05-early']);
    assert.deepEqual(only5.checked, { objectives: 1, requirements: 1 });

    assert.deepEqual(ra.scan(p.planningDir, { objective: '06' }).checked, { objectives: 0, requirements: 0 });
  });

  test('8b. scanObjective is null for an objective with no VERIFICATION', t => {
    const p = project(t, {
      requirements: ['EST-02'],
      objectives: [{ dir: '06-noverify', summaries: { '06-01-SUMMARY.md': summaryText('requirements-completed: []') } }],
    });
    assert.equal(ra.scanObjective(path.join(p.planningDir, 'objectives', '06-noverify'), new Set(['EST-02'])), null);
  });

  test('9. VERIFICATIONs are unioned; a SUMMARY of another objective does not satisfy this one', t => {
    const p = project(t, {
      requirements: ['EST-02', 'EST-03'],
      objectives: [
        {
          dir: '10-a',
          verifications: {
            '10-VERIFICATION.md': verificationText({ coverage: ['| EST-02 | ✓ SATISFIED | - |'] }),
            '10-gaps-VERIFICATION.md': verificationText({ coverage: ['| EST-03 | ✓ SATISFIED | - |'] }),
          },
          summaries: { '10-01-SUMMARY.md': summaryText('requirements-completed: []') },
        },
        {
          dir: '11-b',
          summaries: { '11-01-SUMMARY.md': summaryText('requirements-completed: [EST-02, EST-03]') },
        },
      ],
    });
    const { findings } = ra.scan(p.planningDir);
    assert.deepEqual(
      findings.map(f => [f.objective, f.requirement, f.verification]),
      [
        ['10-a', 'EST-02', '10-VERIFICATION.md'],
        ['10-a', 'EST-03', '10-gaps-VERIFICATION.md'],
      ],
    );
  });

  test('9b. SUMMARYs of one objective are unioned', t => {
    const p = project(t, {
      requirements: ['EST-02', 'EST-03'],
      objectives: [
        {
          dir: '10-a',
          verifications: {
            '10-VERIFICATION.md': verificationText({
              coverage: ['| EST-02 | ✓ SATISFIED | - |', '| EST-03 | ✓ SATISFIED | - |'],
            }),
          },
          summaries: {
            '10-01-SUMMARY.md': summaryText('requirements-completed: [EST-02]'),
            '10-02-SUMMARY.md': summaryText('requirements-completed:\n  - EST-03'),
          },
        },
      ],
    });
    assert.deepEqual(ra.scan(p.planningDir).findings, []);
  });

  test('9c. candidates come from the TRD file name (letter suffix) and a commented inline list', t => {
    const p = project(t, {
      requirements: ['EST-02', 'EST-05'],
      objectives: [
        simpleObjective('07-x', {
          ids: ['EST-02', 'EST-05'],
          trds: {
            '07-02a-thing-TRD.md': trdText('[EST-02, EST-05]  # EST-05 closes with 07-03'),
            '07-03-other-TRD.md': trdText('[EST-05]'),
            '07-04-unrelated-TRD.md': trdText('[]'),
          },
        }),
      ],
    });
    const { findings } = ra.scan(p.planningDir);
    assert.deepEqual(
      findings.map(f => [f.requirement, f.candidates]),
      [
        ['EST-02', ['07-02a']],
        ['EST-05', ['07-02a', '07-03']],
      ],
    );
  });
});

describe('parseSatisfied', () => {
  const text = [
    '# Verification',
    '',
    '## Observable Truths',
    '',
    '| # | Truth | Status |',
    '|---|---|---|',
    '| EST-09 | a truth whose first cell is an ID | ✓ VERIFIED |',
    '| EST-10 | another | SATISFIED |',
    '',
    '## Requirements Coverage',
    '',
    COVERAGE_HEADER,
    '|---|---|---|',
    '| EST-01: first requirement | ✓ SATISFIED | - |',
    '| **EST-02** | SATISFIED (checkbox deliberately left for orchestrator) | - |',
    '| `EST-03` | ✓ SATISFIED | |',
    '| EST-04: not there yet | NOT SATISFIED | missing |',
    '| EST-05 | PARTIALLY SATISFIED | one part |',
    '| EST-06 | ✗ BLOCKED | dependency |',
    '| EST-07 | ? NEEDS HUMAN | |',
    '| EST-01: first requirement | ✓ SATISFIED | listed twice |',
    '',
    '## Anti-Patterns Found',
    '',
    '| EST-08 | SATISFIED | after the section |',
  ].join('\n');

  test('5. reads only the coverage rows marked SATISFIED, in order, once each', () => {
    assert.deepEqual(ra.parseSatisfied(text), ['EST-01', 'EST-02', 'EST-03']);
  });

  test('5b. the heading may be any level and any case, and a table without a coverage heading yields nothing', () => {
    const lower = ['### requirements coverage', '', COVERAGE_HEADER, '|---|---|---|', '| EST-01 | SATISFIED | |'].join('\n');
    assert.deepEqual(ra.parseSatisfied(lower), ['EST-01']);
    assert.deepEqual(ra.parseSatisfied('# V\n\n| EST-01 | SATISFIED | |\n'), []);
    assert.deepEqual(ra.parseSatisfied(''), []);
  });
});

describe('parseCompleted', () => {
  test('6. inline list', () => {
    assert.deepEqual(ra.parseCompleted(summaryText('requirements-completed: [EST-03]')), ['EST-03']);
    assert.deepEqual(ra.parseCompleted(summaryText('requirements-completed: [EST-02, EST-03, EST-05]')), [
      'EST-02',
      'EST-03',
      'EST-05',
    ]);
  });

  test('6. empty list, absent key and the wrong key are all empty', () => {
    assert.deepEqual(ra.parseCompleted(summaryText('requirements-completed: []')), []);
    assert.deepEqual(ra.parseCompleted(summaryText('')), []);
    assert.deepEqual(ra.parseCompleted(summaryText('requirements: [AUT-06]')), []);
    assert.deepEqual(ra.parseCompleted(summaryText('requirements-completed:')), []);
    assert.deepEqual(ra.parseCompleted('no frontmatter at all'), []);
  });

  test('6. quoted free text keeps its leading ID', () => {
    assert.deepEqual(ra.parseCompleted(summaryText('requirements-completed: ["STK-02 (part b)"]')), ['STK-02']);
    assert.deepEqual(ra.parseCompleted(summaryText('requirements-completed: [STK-02a]')), ['STK-02a']);
  });

  test('6. a block list whose entry is a long quoted sentence with ": " inside', () => {
    const block = [
      'requirements-completed:',
      '  - "STK-02 (part a): a loader parses stack profiles and resolves them through bundled general → org/pack (extends chain) → project → component tiers, with per-field provenance."',
    ].join('\n');
    assert.deepEqual(ra.parseCompleted(summaryText(block)), ['STK-02']);
    assert.deepEqual(ra.parseCompleted(summaryText('requirements-completed:\n  - EST-02\n  - EST-04')), ['EST-02', 'EST-04']);
  });

  test("6. an inline list followed by a '# comment' still parses", () => {
    const line =
      "requirements-completed: [AUT-03, AUT-07]  # This TRD's share only: AUT-03 closes with 44-01 (execute-objective.md:818) + 44-08 (CI guard)";
    assert.deepEqual(ra.parseCompleted(summaryText(line)), ['AUT-03', 'AUT-07']);
  });

  test('6. an unbracketed comma list parses', () => {
    assert.deepEqual(ra.parseCompleted(summaryText('requirements-completed: EST-03, EST-04')), ['EST-03', 'EST-04']);
  });
});

describe('knownRequirementIds', () => {
  test('7. reads checkbox definitions from REQUIREMENTS.md and milestones/*-REQUIREMENTS.md, not table rows or prose', t => {
    const p = project(t, {
      requirements: ['EST-02', { id: 'EST-03', checked: false }],
      archived: { 'v1.5': ['OLD-01'], 'v2.0': ['OLD-07'] },
    });
    p.write('REQUIREMENTS.md', `${fs.readFileSync(path.join(p.planningDir, 'REQUIREMENTS.md'), 'utf8')}
- [X] **EST-06**: capital X is a checked box too
| GHOST-01 | Objective 9 | Pending |
See GHOST-02 for details, and **GHOST-03** in bold prose.
`);
    const known = ra.knownRequirementIds(p.planningDir);
    assert.ok(known instanceof Set);
    assert.deepEqual([...known].sort(), ['EST-02', 'EST-03', 'EST-06', 'OLD-01', 'OLD-07']);
  });

  test('7. no REQUIREMENTS document at all is an empty set', t => {
    const p = project(t, {});
    assert.deepEqual([...ra.knownRequirementIds(p.planningDir)], []);
  });
});

describe('findingMessage and findingFix', () => {
  const finding = {
    objective: '58-est',
    number: '58',
    requirement: 'EST-02',
    verification: '58-VERIFICATION.md',
    candidates: ['58-05', '58-08', '58-10'],
  };

  test('10. the message names the objective, VERIFICATION and requirement', () => {
    assert.equal(
      ra.findingMessage(finding),
      'requirements-unlisted: objective 58 (58-VERIFICATION.md) marks EST-02 satisfied, but no SUMMARY in 58-est lists it in requirements-completed',
    );
  });

  test('10. the fix names the candidate TRDs and the planning draft + summary post commands', () => {
    const fix = ra.findingFix(finding);
    for (const trd of ['58-05', '58-08', '58-10']) assert.ok(fix.includes(trd), `names ${trd}: ${fix}`);
    assert.ok(fix.includes('df-tools planning draft objectives/58-est/58-05-SUMMARY.md'), fix);
    assert.ok(fix.includes('df-tools summary post 58-05 --from'), fix);
    assert.ok(fix.includes('EST-02'), fix);
  });

  test('10. with no candidates the fix says the SUMMARY of the TRD that completed it', () => {
    const fix = ra.findingFix({ ...finding, candidates: [] });
    assert.ok(fix.includes('the SUMMARY of the TRD that completed it'), fix);
    assert.ok(fix.includes('planning draft'), fix);
    assert.ok(fix.includes('summary post'), fix);
  });
});
