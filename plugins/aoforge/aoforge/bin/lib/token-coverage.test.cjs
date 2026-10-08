'use strict';

// token-coverage.test.cjs (TRD 66-01, EST-09) — lib/token-coverage.cjs, the forward-stamp coverage report behind
// `aof-tools tokens coverage`.
//
// Test list (TRD 66-01 tests 8-14; 1-7 are the end-to-end tests in tokens-cli.test.cjs):
//   8  classifySummary: live, backfill, unlabeled, in_progress, missing (final, orchestrator shape, input only, template
//      comments, no frontmatter)
//   9  coverageOf: the floored decimal and the integer target check (0 counted, 38/40, 37/39, 5/7, 2/4, 4/4)
//   10 in_progress is listed but not counted; backfill and unlabeled count in the denominator, never the numerator
//   11 collectSummaries: pairing by trdKey, unkeyed and duplicate files skipped, missing directory, unreadable file
//   12 explainMissing: reason on missing entries only, one lazy transcript index per run
//   13 formatCoverage: the report text
//   14 buildCoverage: entry order (objective number numerically, then TRD number)
//
// Hermetic: every project is an fs.mkdtemp directory from __fixtures__/token-coverage-fixtures.cjs, transcripts come from
// __fixtures__/transcript-fixtures.cjs, and all SUMMARY text is literal. Nothing reads the real ~/.claude.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const coverage = require('./token-coverage.cjs');
const tokenUsage = require('./token-usage.cjs');
const {
  SUMMARY_KINDS, summaryText, makeCoverageProject, hashTree,
} = require('./__fixtures__/token-coverage-fixtures.cjs');
const {
  projectKeyFor, executorPrompt, writeSubagentTranscript, THREE_MESSAGES,
} = require('./__fixtures__/transcript-fixtures.cjs');

const { classifySummary, collectSummaries, coverageOf, explainMissing, formatCoverage, buildCoverage } = coverage;

/** A summary text of `kind` for a throwaway id. */
const text = (kind) => summaryText(kind, { id: '65-01', objectiveDir: '65-release' });

/** `n` synthetic entries of one class. */
const many = (cls, n) => Array.from({ length: n }, (_, i) => ({ id: `70-${String(i + 1).padStart(2, '0')}`, class: cls }));

describe('66-01 token-coverage: classifySummary', () => {
  test('8. both token fields filled: live, backfill or unlabeled by tokens_source', () => {
    assert.deepEqual(classifySummary(text('live')), { class: 'live', source: 'live' });
    assert.deepEqual(classifySummary(text('backfill')), { class: 'backfill', source: 'backfill' });
    assert.deepEqual(classifySummary(text('unlabeled')), { class: 'unlabeled', source: null });

    const other = text('live').replace('tokens_source: "live"', 'tokens_source: "manual"');
    assert.deepEqual(classifySummary(other), { class: 'unlabeled', source: 'manual' }, 'another source value is unlabeled');

    const bare = text('live').replace('tokens_source: "live"', 'tokens_source: live');
    assert.equal(classifySummary(bare).class, 'live', 'an unquoted live is still live');

    const single = text('live').replace('tokens_source: "live"', "tokens_source: 'live'");
    assert.equal(classifySummary(single).class, 'live', 'one pair of single quotes is stripped');

    const upper = text('live').replace('tokens_source: "live"', 'tokens_source: "LIVE"');
    assert.equal(classifySummary(upper).class, 'unlabeled', 'the marker is compared exactly');
  });

  test('8. no token fields: in_progress only for a Progress checkpoint without Self-Check, missing otherwise', () => {
    assert.equal(classifySummary(text('in_progress')).class, 'in_progress');
    assert.equal(classifySummary(text('missing_final')).class, 'missing', 'a final SUMMARY with Self-Check is missing');
    assert.equal(
      classifySummary(text('missing_orchestrator')).class,
      'missing',
      'the orchestrator shape (neither Progress nor Self-Check) is missing, never excluded',
    );

    const both = `${text('in_progress')}\n## Self-Check: PASSED\n`;
    assert.equal(classifySummary(both).class, 'missing', 'Progress plus Self-Check is a finished SUMMARY');
  });

  test('8. one token field, commented template lines and no frontmatter are missing', () => {
    assert.equal(classifySummary(text('input_only')).class, 'missing', 'tokens_input alone is not a stamp');
    assert.equal(classifySummary(text('template_comments')).class, 'missing', '# tokens_input: N is a comment');

    const noFrontmatter = '# Objective 65 TRD 01\n\n## Self-Check: PASSED\n';
    assert.equal(classifySummary(noFrontmatter).class, 'missing');
    assert.equal(classifySummary('').class, 'missing');
  });

  test('8. every fixture kind classifies to the class its name says', () => {
    const want = {
      live: 'live',
      backfill: 'backfill',
      unlabeled: 'unlabeled',
      missing_final: 'missing',
      missing_orchestrator: 'missing',
      in_progress: 'in_progress',
      template_comments: 'missing',
      input_only: 'missing',
    };
    assert.deepEqual([...SUMMARY_KINDS].sort(), Object.keys(want).sort());
    for (const kind of SUMMARY_KINDS) assert.equal(classifySummary(text(kind)).class, want[kind], kind);
  });
});

describe('66-01 token-coverage: coverageOf', () => {
  test('9. nothing counted: a null ratio and an undecided target', () => {
    const r = coverageOf([]);
    assert.equal(r.counts.counted, 0);
    assert.equal(r.forward.numerator, 0);
    assert.equal(r.forward.denominator, 0);
    assert.equal(r.forward.ratio, null);
    assert.equal(r.forward.ratio_text, null);
    assert.equal(r.forward.met, null);
    assert.equal(r.forward.target_percent, 95);
  });

  test('9. 38 live of 40 counted meets the target at the integer boundary and prints 0.95', () => {
    const r = coverageOf([...many('live', 38), ...many('missing', 2)]);
    assert.equal(r.forward.numerator, 38);
    assert.equal(r.forward.denominator, 40);
    assert.equal(r.forward.met, true, '3800 >= 3800');
    assert.equal(r.forward.ratio_text, '0.95');
  });

  test('9. 37 of 39 is not met and its decimal is floored: 0.948717, never the rounded 0.948718', () => {
    const r = coverageOf([...many('live', 37), ...many('missing', 2)]);
    assert.equal(r.forward.met, false);
    assert.equal(r.forward.ratio_text, '0.948717');
  });

  test('9. 5 of 7 floors to 0.714285, not 0.714286', () => {
    const r = coverageOf([...many('live', 5), ...many('missing', 2)]);
    assert.equal(r.forward.ratio_text, '0.714285');
  });

  test('9. trailing zeros are trimmed: 2/4 is 0.5 and 4/4 is 1', () => {
    assert.equal(coverageOf([...many('live', 2), ...many('missing', 2)]).forward.ratio_text, '0.5');
    const all = coverageOf(many('live', 4));
    assert.equal(all.forward.ratio_text, '1');
    assert.equal(all.forward.met, true);
  });

  test('9. the raw ratio is live / counted for the JSON, and 0 live is 0 with a text of 0', () => {
    assert.equal(coverageOf([...many('live', 1), ...many('missing', 3)]).forward.ratio, 0.25);
    const none = coverageOf(many('missing', 3));
    assert.equal(none.forward.ratio_text, '0');
    assert.equal(none.forward.met, false);
  });
});

describe('66-01 token-coverage: counted versus listed', () => {
  test('10. in_progress is listed but not counted; backfill and unlabeled count and are never forward', () => {
    const entries = [
      ...many('live', 1), ...many('backfill', 1), ...many('unlabeled', 1), ...many('missing', 1), ...many('in_progress', 3),
    ];
    const r = coverageOf(entries);
    assert.deepEqual(r.counts, {
      summaries: 7, counted: 4, live: 1, backfill: 1, unlabeled: 1, missing: 1, in_progress: 3,
    });
    assert.equal(r.forward.numerator, 1, 'only live is forward');
    assert.equal(r.forward.denominator, 4, 'in_progress is outside the denominator');
    assert.equal(r.forward.ratio_text, '0.25');
    assert.equal(r.forward.met, false);
  });

  test('10. a scope of only in-progress SUMMARIES has nothing counted', () => {
    const r = coverageOf(many('in_progress', 2));
    assert.equal(r.counts.counted, 0);
    assert.equal(r.counts.in_progress, 2);
    assert.equal(r.forward.ratio_text, null);
    assert.equal(r.forward.met, null);
  });
});

describe('66-01 token-coverage: collectSummaries', () => {
  test('11. pairs a bare and a slugged SUMMARY name to the same NN-MM id, classifying each', () => {
    const p = makeCoverageProject({
      objectives: {
        '65-a': [{ id: '65-01', kind: 'live' }],
        '65-b': [{ id: '65-04', kind: 'missing_final' }],
      },
    });
    try {
      fs.writeFileSync(
        path.join(p.repo, '.planning', 'objectives', '65-a', '65-02-push-branch-SUMMARY.md'),
        summaryText('backfill', { id: '65-02', objectiveDir: '65-a' }),
      );
      const { entries, skipped } = collectSummaries(p.repo, [
        { number: '65', dir: '.planning/objectives/65-a' },
        { number: '65', dir: '.planning/objectives/65-b' },
      ]);
      assert.deepEqual(entries.map((e) => [e.id, e.file, e.class, e.objective_dir, e.objective]), [
        ['65-01', '65-01-SUMMARY.md', 'live', '65-a', '65'],
        ['65-02', '65-02-push-branch-SUMMARY.md', 'backfill', '65-a', '65'],
        ['65-04', '65-04-SUMMARY.md', 'missing', '65-b', '65'],
      ]);
      assert.equal(entries[0].path, '.planning/objectives/65-a/65-01-SUMMARY.md');
      assert.equal(entries[0].source, 'live');
      assert.deepEqual(skipped, []);
    } finally {
      p.cleanup();
    }
  });

  test('11. an unkeyed file is skipped as unkeyed and a second file for the same id is skipped as duplicate', () => {
    const p = makeCoverageProject({ objectives: { '65-a': [{ id: '65-02', kind: 'live' }] } });
    try {
      const dir = path.join(p.repo, '.planning', 'objectives', '65-a');
      fs.writeFileSync(path.join(dir, 'SUMMARY.md'), text('live'));
      fs.writeFileSync(path.join(dir, 'notes-SUMMARY.md'), text('live'));
      fs.writeFileSync(path.join(dir, '65-02-push-branch-SUMMARY.md'), summaryText('missing_final', { id: '65-02', objectiveDir: '65-a' }));

      const { entries, skipped } = collectSummaries(p.repo, [{ number: '65', dir: '.planning/objectives/65-a' }]);
      assert.deepEqual(entries.map((e) => [e.id, e.file, e.class]), [['65-02', '65-02-SUMMARY.md', 'live']],
        'the first in sorted order wins and counts once');
      assert.deepEqual(skipped, [
        { objective_dir: '65-a', file: '65-02-push-branch-SUMMARY.md', reason: 'duplicate' },
        { objective_dir: '65-a', file: 'SUMMARY.md', reason: 'unkeyed' },
        { objective_dir: '65-a', file: 'notes-SUMMARY.md', reason: 'unkeyed' },
      ]);
    } finally {
      p.cleanup();
    }
  });

  test('11. a missing directory contributes nothing and does not throw; non-SUMMARY files are ignored', () => {
    const p = makeCoverageProject({ objectives: { '65-a': [{ id: '65-01', kind: null }] } });
    try {
      const out = collectSummaries(p.repo, [
        { number: '65', dir: '.planning/objectives/65-a' },
        { number: '70', dir: '.planning/objectives/70-gone' },
      ]);
      assert.deepEqual(out, { entries: [], skipped: [] }, 'the TRD alone is not a SUMMARY');
    } finally {
      p.cleanup();
    }
  });

  test('11. a SUMMARY that cannot be read is missing with reason unreadable and the scan goes on', () => {
    const p = makeCoverageProject({ objectives: { '65-a': [{ id: '65-01', kind: 'live' }] } });
    try {
      fs.mkdirSync(path.join(p.repo, '.planning', 'objectives', '65-a', '65-05-SUMMARY.md'));
      const { entries } = collectSummaries(p.repo, [{ number: '65', dir: '.planning/objectives/65-a' }]);
      assert.deepEqual(entries.map((e) => [e.id, e.class, e.reason || null]), [
        ['65-01', 'live', null],
        ['65-05', 'missing', 'unreadable'],
      ]);
    } finally {
      p.cleanup();
    }
  });
});

describe('66-01 token-coverage: explainMissing', () => {
  /** 65-01 live, 65-02 and 65-03 missing; only 65-03 has an executor transcript. */
  function project() {
    const p = makeCoverageProject({
      objectives: {
        '65-release': [
          { id: '65-01', kind: 'live' },
          { id: '65-02', kind: 'missing_orchestrator' },
          { id: '65-03', kind: 'missing_final' },
        ],
      },
    });
    p.transcript('65-03', '65-release');
    const { entries } = collectSummaries(p.repo, [{ number: '65', dir: '.planning/objectives/65-release' }]);
    const index = tokenUsage.indexExecutorTranscripts({ root: p.projectsRoot, repoRoot: p.repo });
    return { p, entries, index };
  }

  test('12. adds a reason to missing entries only: stamp_skipped when a transcript recovers, no_transcript otherwise', () => {
    const { p, entries, index } = project();
    try {
      const frozen = JSON.stringify(entries);
      const out = explainMissing(entries, { indexFactory: () => index, readRoot: p.repo });
      assert.equal(JSON.stringify(entries), frozen, 'the input entries are not mutated');
      assert.deepEqual(out.map((e) => [e.id, e.class, e.reason || null]), [
        ['65-01', 'live', null],
        ['65-02', 'missing', 'no_transcript'],
        ['65-03', 'missing', 'stamp_skipped'],
      ]);
    } finally {
      p.cleanup();
    }
  });

  test('12. the transcript index is built once for several missing entries and never when none is missing', () => {
    const { p, entries, index } = project();
    try {
      let calls = 0;
      const factory = () => { calls++; return index; };
      explainMissing(entries, { indexFactory: factory, readRoot: p.repo });
      assert.equal(calls, 1, 'two missing entries share one index');

      calls = 0;
      const live = entries.filter((e) => e.class === 'live');
      const out = explainMissing(live, { indexFactory: factory, readRoot: p.repo });
      assert.equal(calls, 0, 'nothing missing means no scan');
      assert.deepEqual(out, live);
    } finally {
      p.cleanup();
    }
  });

  test('12. a factory that throws gives every missing entry transcripts_unreadable; an unreadable SUMMARY keeps its reason', () => {
    const { p, entries } = project();
    try {
      const withUnreadable = [...entries, { id: '65-05', class: 'missing', reason: 'unreadable', objective_dir: '65-release' }];
      const out = explainMissing(withUnreadable, {
        indexFactory: () => { throw new Error('projects root unreadable'); },
        readRoot: p.repo,
      });
      assert.deepEqual(out.map((e) => e.reason || null), [null, 'transcripts_unreadable', 'transcripts_unreadable', 'unreadable']);
    } finally {
      p.cleanup();
    }
  });

  test('12. two directories sharing an objective number, and a transcript naming neither, are ambiguous_objective', () => {
    const p = makeCoverageProject({
      objectives: {
        '65-a': [{ id: '65-02', kind: 'missing_final' }],
        '65-b': [{ id: '65-02', kind: 'missing_final' }],
      },
    });
    try {
      writeSubagentTranscript(p.projectsRoot, {
        projectKey: projectKeyFor(p.repo),
        session: 's1',
        agentId: 'agent-bare',
        description: 'Execute TRD 65-02',
        prompt: executorPrompt('bare'),
        cwd: p.repo,
        records: THREE_MESSAGES,
      });
      const { entries } = collectSummaries(p.repo, [
        { number: '65', dir: '.planning/objectives/65-a' },
        { number: '65', dir: '.planning/objectives/65-b' },
      ]);
      const index = tokenUsage.indexExecutorTranscripts({ root: p.projectsRoot, repoRoot: p.repo });
      assert.equal(index.entries.length, 1, 'the directory-less transcript is identified');
      assert.deepEqual(index.entries[0].dirs, []);
      const out = explainMissing(entries, { indexFactory: () => index, readRoot: p.repo });
      assert.deepEqual(out.map((e) => e.reason), ['ambiguous_objective', 'ambiguous_objective']);
    } finally {
      p.cleanup();
    }
  });
});

describe('66-01 token-coverage: formatCoverage', () => {
  const entry = (id, cls, extra = {}) => ({ id, class: cls, ...extra });

  test('13. a milestone report: one summary line, then one line per non-live entry in order', () => {
    const entries = [
      entry('65-01', 'live'),
      entry('65-02', 'missing', { reason: 'no_transcript' }),
      entry('65-03', 'missing', { reason: 'no_transcript' }),
      entry('65-04', 'live'),
      entry('66-01', 'backfill'),
      entry('66-02', 'unlabeled'),
      entry('66-03', 'in_progress'),
    ];
    const report = { scope: { kind: 'milestone', version: 'v1.6' }, ...coverageOf(entries), entries, skipped: [] };
    assert.equal(formatCoverage(report), [
      'v1.6 forward-stamped 2/6 = 0.333333 (target 95%: not met) · live 2 · backfill 1 · unlabeled 1 · missing 2 · in progress 1 (not counted)',
      '  65-02 missing (no_transcript)',
      '  65-03 missing (no_transcript)',
      '  66-01 backfill',
      '  66-02 unlabeled',
      '  66-03 in progress',
    ].join('\n'));
  });

  test('13. an objective report names the objective and prints a met target', () => {
    const entries = [entry('65-01', 'live'), entry('65-02', 'live')];
    const report = { scope: { kind: 'objective', objective: '65' }, ...coverageOf(entries), entries, skipped: [] };
    assert.equal(
      formatCoverage(report),
      'objective 65 forward-stamped 2/2 = 1 (target 95%: met) · live 2 · backfill 0 · unlabeled 0 · missing 0 · in progress 0 (not counted)',
    );

    const half = [entry('65-01', 'live'), entry('65-02', 'live'), entry('65-03', 'missing', { reason: 'stamp_skipped' }), entry('65-04', 'missing')];
    const text4 = formatCoverage({ scope: { kind: 'objective', objective: '65' }, ...coverageOf(half), entries: half, skipped: [] });
    assert.equal(text4.split('\n')[0], 'objective 65 forward-stamped 2/4 = 0.5 (target 95%: not met) · live 2 · backfill 0 · unlabeled 0 · missing 2 · in progress 0 (not counted)');
    assert.deepEqual(text4.split('\n').slice(1), ['  65-03 missing (stamp_skipped)', '  65-04 missing']);
  });

  test('13. nothing counted prints the empty-scope line', () => {
    const report = { scope: { kind: 'objective', objective: '70' }, ...coverageOf([]), entries: [], skipped: [] };
    assert.equal(formatCoverage(report), 'objective 70 forward-stamped 0/0 (no executed TRDs in scope) · in progress 0 (not counted)');
  });

  test('13. skipped files are listed after the entries', () => {
    const entries = [entry('65-01', 'backfill')];
    const skipped = [{ objective_dir: '65-a', file: 'notes-SUMMARY.md', reason: 'unkeyed' }];
    const report = { scope: { kind: 'milestone', version: 'v1.6' }, ...coverageOf(entries), entries, skipped };
    assert.deepEqual(formatCoverage(report).split('\n').slice(1), ['  65-01 backfill', '  skipped 65-a/notes-SUMMARY.md (unkeyed)']);
  });
});

describe('66-01 token-coverage: buildCoverage', () => {
  test('14. entries come back by objective number (numeric, 4.1 after 4 before 10), then TRD number', () => {
    const p = makeCoverageProject({
      objectives: {
        '10-late': [{ id: '10-01', kind: 'live' }],
        '04.1-hotfix': [{ id: '04.1-01', kind: 'live' }],
        '04-early': [{ id: '04-02', kind: 'live' }, { id: '04-01', kind: 'live' }],
      },
    });
    try {
      const dirs = [
        { number: '10', dir: '.planning/objectives/10-late' },
        { number: '4.1', dir: '.planning/objectives/04.1-hotfix' },
        { number: '4', dir: '.planning/objectives/04-early' },
      ];
      const report = buildCoverage({
        readRoot: p.repo,
        scope: { kind: 'milestone', version: 'v9.9', dirs },
        indexFactory: () => { throw new Error('nothing is missing, so the index is never built'); },
      });
      assert.deepEqual(report.entries.map((e) => e.id), ['04-01', '04-02', '04.1-01', '10-01']);
      assert.equal(report.read_root, p.repo);
      assert.deepEqual(report.scope, { kind: 'milestone', version: 'v9.9', objectives: dirs });
      assert.equal(report.counts.live, 4);
      assert.equal(report.forward.ratio_text, '1');
      assert.deepEqual(report.skipped, []);
    } finally {
      p.cleanup();
    }
  });

  test('14. an objective scope carries the objective number, and explanations ride along on missing entries', () => {
    const p = makeCoverageProject({
      objectives: { '65-release': [{ id: '65-01', kind: 'live' }, { id: '65-02', kind: 'missing_orchestrator' }] },
    });
    try {
      let calls = 0;
      const dirs = [{ number: '65', dir: '.planning/objectives/65-release' }];
      const before = hashTree(p.repo);
      const report = buildCoverage({
        readRoot: p.repo,
        scope: { kind: 'objective', objective: '65', dirs },
        indexFactory: () => { calls++; return tokenUsage.indexExecutorTranscripts({ root: p.projectsRoot, repoRoot: p.repo }); },
      });
      assert.equal(calls, 1);
      assert.equal(report.scope.kind, 'objective');
      assert.equal(report.scope.objective, '65');
      assert.equal(report.scope.version, undefined);
      assert.deepEqual(report.entries.map((e) => [e.id, e.class, e.reason || null]), [
        ['65-01', 'live', null],
        ['65-02', 'missing', 'no_transcript'],
      ]);
      assert.equal(report.forward.ratio_text, '0.5');
      assert.deepEqual(hashTree(p.repo), before, 'building a report writes nothing');
    } finally {
      p.cleanup();
    }
  });
});
