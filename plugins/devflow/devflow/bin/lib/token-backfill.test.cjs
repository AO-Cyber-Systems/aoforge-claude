'use strict';

// token-backfill.test.cjs (TRD 57-04, EST-07) — recover token usage for historical TRDs from the transcripts that survive.
//
// Every repo is a literal, hand-written fixture in an fs.mkdtemp directory (realpath'd) and every transcript comes from
// __fixtures__/transcript-fixtures.cjs under a fake projects root. Nothing reads the real ~/.claude or this repository's
// .planning/. The fixture repo `R` holds six SUMMARYs:
//
//   10-alpha/10-01-SUMMARY.md   shared objective number; the one 10-01 transcript names no directory
//   10-beta/10-01-SUMMARY.md    shared objective number
//   97-x/notes-SUMMARY.md       no NN-MM key (unkeyed)
//   98-old/98-01-SUMMARY.md     no transcript (retention deleted it)
//   99-demo/99-01-demo-SUMMARY.md   one executor transcript (THREE_MESSAGES: tokens_input 140747, tokens_output 1370)
//   99-demo/99-02-SUMMARY.md    already carries tokens_input 5 / tokens_output 6

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const fx = require('./__fixtures__/transcript-fixtures.cjs');
const ufx = require('./__fixtures__/upgrade-fixtures.cjs');
const ghMapping = require('./gh-mapping.cjs');
const backfill = require('./token-backfill.cjs');

const HAS_GIT = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Fixture ──────────────────────────────────────────────────────────────────

/** A SUMMARY with a frontmatter block; `extra` is whole frontmatter lines (each ending in "\n"). */
const summaryText = (objective, trd, extra = '') =>
  `---\nobjective: ${objective}\ntrd: "${trd}"\n${extra}---\n\n# Summary ${objective} ${trd}\n\nHand-written body.\n`;

const PLAIN_TEXT = '# Summary 96-01\n\nNo frontmatter in this one.\n';

const SUMMARIES = {
  '10-alpha/10-01-SUMMARY.md': summaryText('10-alpha', '01'),
  '10-beta/10-01-SUMMARY.md': summaryText('10-beta', '01'),
  '97-x/notes-SUMMARY.md': summaryText('97-x', 'notes'),
  '98-old/98-01-SUMMARY.md': summaryText('98-old', '01'),
  '99-demo/99-01-demo-SUMMARY.md': summaryText('99-demo', '01'),
  '99-demo/99-02-SUMMARY.md': summaryText('99-demo', '02', 'tokens_input: 5\ntokens_output: 6\n'),
};

const TRDS = [
  '10-alpha/10-01-alpha-TRD.md', '10-beta/10-01-beta-TRD.md', '97-x/97-01-x-TRD.md',
  '98-old/98-01-old-TRD.md', '99-demo/99-01-demo-TRD.md', '99-demo/99-02-more-TRD.md',
];

function writeAt(root, rel, text) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
}

/**
 * The fixture repo and its fake projects root. `transcripts: false` leaves the projects root empty. `tenOne` picks the
 * 10-01 transcript: 'bare' (no directory evidence, identified from the meta.json description) or '10-beta' (the prompt
 * names .planning/objectives/10-beta/).
 */
function buildBackfillRepo({ transcripts = true, tenOne = 'bare' } = {}) {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-backfill-repo-')));
  const root = fx.makeProjectsRoot();
  cleanup.push(repo, root);

  writeAt(repo, '.planning/config.json', '{}\n');
  for (const [rel, text] of Object.entries(SUMMARIES)) writeAt(repo, `.planning/objectives/${rel}`, text);
  for (const rel of TRDS) writeAt(repo, `.planning/objectives/${rel}`, `# TRD ${path.basename(rel)}\n`);

  const key = fx.projectKeyFor(repo);
  const addTranscript = ({
    id, objectiveDir = null, style = 'plan_id', session, agentId, description = '', records = fx.THREE_MESSAGES,
  }) => fx.writeSubagentTranscript(root, {
    projectKey: key,
    session,
    agentId,
    description,
    prompt: fx.executorPrompt(style, { id, objectiveDir, repoRoot: repo }),
    cwd: repo,
    records,
  });

  if (transcripts) {
    addTranscript({ id: '99-01', objectiveDir: '99-demo', session: 'sess-99-01', agentId: 'a9901', description: 'Execute TRD 99-01' });
    if (tenOne === 'bare') {
      addTranscript({ id: '10-01', style: 'bare', session: 'sess-10-01', agentId: 'a1001', description: 'Execute TRD 10-01 to checkpoint' });
    } else {
      addTranscript({ id: '10-01', objectiveDir: tenOne, session: 'sess-10-01', agentId: 'a1001', description: 'Execute TRD 10-01' });
    }
  }
  return { repo, root, key, addTranscript };
}

/** `{relativePath: [bytes, mtimeMs]}` for every file under `dir`. */
function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) { walk(abs); continue; }
      out[path.relative(dir, abs)] = [fs.readFileSync(abs).toString('base64'), fs.statSync(abs).mtimeMs];
    }
  };
  walk(dir);
  return out;
}

const summed = (entry) => [entry.objective_dir, entry.file, entry.status, entry.reason || null];

describe('57-04 planBackfill: a dry run that classifies every historical SUMMARY', () => {
  test('1. counts, sorted entries, and the recovered fields of 99-01', () => {
    const { repo, root } = buildBackfillRepo();
    const plan = backfill.planBackfill({ checkoutRoot: repo, repoRoot: repo, root });

    assert.deepEqual(plan.counts, {
      summaries: 6,
      already_stamped: 1,
      recovered: 1,
      unrecovered: 4,
      by_reason: { ambiguous_objective: 2, no_transcript: 1, unkeyed: 1 },
    });
    assert.deepEqual(plan.entries.map(summed), [
      ['10-alpha', '10-01-SUMMARY.md', 'unrecovered', 'ambiguous_objective'],
      ['10-beta', '10-01-SUMMARY.md', 'unrecovered', 'ambiguous_objective'],
      ['97-x', 'notes-SUMMARY.md', 'unrecovered', 'unkeyed'],
      ['98-old', '98-01-SUMMARY.md', 'unrecovered', 'no_transcript'],
      ['99-demo', '99-01-demo-SUMMARY.md', 'recovered', null],
      ['99-demo', '99-02-SUMMARY.md', 'already_stamped', null],
    ]);

    const recovered = plan.entries.find((e) => e.status === 'recovered');
    assert.equal(recovered.id, '99-01');
    assert.deepEqual(Object.fromEntries(recovered.fields), {
      tokens_input: '140747',
      tokens_output: '1370',
      tokens_cache_read: '121144',
      tokens_cache_write: '19596',
      token_model: '"claude-opus-5-5"',
      tokens_source: '"backfill"',
    });

    assert.equal(plan.checkout, repo);
    assert.equal(plan.repo, repo);
    assert.equal(plan.transcripts_root, root);
    assert.deepEqual(plan.index_counts, { executor_transcripts: 2, identified: 2, unidentified: 0, ambiguous: 0, foreign: 0 });
  });

  test('2. planBackfill writes nothing: every file keeps its bytes and mtime', () => {
    const { repo, root } = buildBackfillRepo();
    const beforeRepo = snapshot(repo);
    const beforeRoot = snapshot(root);
    const plan = backfill.planBackfill({ checkoutRoot: repo, repoRoot: repo, root });
    assert.equal(plan.counts.recovered, 1, 'the plan found something to recover, so the no-write check is not vacuous');
    assert.deepEqual(snapshot(repo), beforeRepo);
    assert.deepEqual(snapshot(root), beforeRoot);
  });

  test('6. a transcript with no usage records is unrecovered / zero_usage', () => {
    const { repo, root, addTranscript } = buildBackfillRepo();
    writeAt(repo, '.planning/objectives/99-demo/99-03-SUMMARY.md', summaryText('99-demo', '03'));
    addTranscript({ id: '99-03', objectiveDir: '99-demo', session: 'sess-99-03', agentId: 'a9903', description: 'Execute TRD 99-03', records: [] });

    const plan = backfill.planBackfill({ checkoutRoot: repo, repoRoot: repo, root });
    const entry = plan.entries.find((e) => e.file === '99-03-SUMMARY.md');
    assert.deepEqual(summed(entry), ['99-demo', '99-03-SUMMARY.md', 'unrecovered', 'zero_usage']);
    assert.equal(plan.counts.by_reason.zero_usage, 1);
    assert.equal(plan.counts.recovered, 1, '99-01 is still the only recovered SUMMARY');
  });

  test('9. no transcripts at all: every unstamped keyed SUMMARY is no_transcript, nothing throws', () => {
    const { repo, root } = buildBackfillRepo({ transcripts: false });
    const plan = backfill.planBackfill({ checkoutRoot: repo, repoRoot: repo, root });
    assert.deepEqual(plan.counts, {
      summaries: 6,
      already_stamped: 1,
      recovered: 0,
      unrecovered: 5,
      by_reason: { no_transcript: 4, unkeyed: 1 },
    });
    assert.deepEqual(plan.index_counts, { executor_transcripts: 0, identified: 0, unidentified: 0, ambiguous: 0, foreign: 0 });
  });

  test('11. a recoverable SUMMARY without a frontmatter block is unrecovered / no_frontmatter; without a transcript it stays no_transcript', () => {
    const { repo, root, addTranscript } = buildBackfillRepo();
    writeAt(repo, '.planning/objectives/96-plain/96-01-SUMMARY.md', PLAIN_TEXT);
    writeAt(repo, '.planning/objectives/96-plain/96-02-SUMMARY.md', PLAIN_TEXT);
    addTranscript({ id: '96-01', objectiveDir: '96-plain', session: 'sess-96-01', agentId: 'a9601', description: 'Execute TRD 96-01' });

    const plan = backfill.planBackfill({ checkoutRoot: repo, repoRoot: repo, root });
    const byFile = (file) => plan.entries.find((e) => e.objective_dir === '96-plain' && e.file === file);
    assert.deepEqual(summed(byFile('96-01-SUMMARY.md')), ['96-plain', '96-01-SUMMARY.md', 'unrecovered', 'no_frontmatter']);
    assert.deepEqual(summed(byFile('96-02-SUMMARY.md')), ['96-plain', '96-02-SUMMARY.md', 'unrecovered', 'no_transcript']);
    assert.equal(plan.counts.recovered, 1, 'only 99-01 can be stamped');
  });
});

describe('57-04 formatBackfillReport', () => {
  test('10. two lines from a plan, three with applied; reasons in sorted key order, zero counts omitted', () => {
    const { repo, root } = buildBackfillRepo();
    const plan = backfill.planBackfill({ checkoutRoot: repo, repoRoot: repo, root });

    const two = backfill.formatBackfillReport(plan);
    assert.equal(
      two,
      'summaries 6 · already stamped 1 · recovered 1 · unrecovered 4 (ambiguous_objective 2, no_transcript 1, unkeyed 1)\n'
      + 'executor transcripts 2 (identified 2, unidentified 0, ambiguous 0, foreign 0)',
    );
    assert.equal(two.split('\n').length, 2);

    const three = backfill.formatBackfillReport(plan, { written: ['99-01'], unchanged: [], skipped: [], write_failed: [] });
    assert.equal(three.split('\n').length, 3);
    assert.equal(three.split('\n')[2], 'written 1 · unchanged 0 · skipped 0 · failed 0');
    assert.equal(three.split('\n').slice(0, 2).join('\n'), two);

    // Unsorted by_reason with a zero entry; no unrecovered at all gives no parenthesis.
    const synthetic = {
      counts: { summaries: 9, already_stamped: 2, recovered: 4, unrecovered: 3, by_reason: { unkeyed: 1, zero_usage: 0, no_transcript: 2 } },
      index_counts: { executor_transcripts: 7, identified: 4, unidentified: 1, ambiguous: 1, foreign: 1 },
    };
    assert.equal(
      backfill.formatBackfillReport(synthetic, { written: ['a', 'b'], unchanged: ['c'], skipped: [{ id: 'd' }], write_failed: [] }),
      'summaries 9 · already stamped 2 · recovered 4 · unrecovered 3 (no_transcript 2, unkeyed 1)\n'
      + 'executor transcripts 7 (identified 4, unidentified 1, ambiguous 1, foreign 1)\n'
      + 'written 2 · unchanged 1 · skipped 1 · failed 0',
    );
    const clean = { ...synthetic, counts: { summaries: 2, already_stamped: 0, recovered: 2, unrecovered: 0, by_reason: {} } };
    assert.equal(backfill.formatBackfillReport(clean).split('\n')[0], 'summaries 2 · already stamped 0 · recovered 2 · unrecovered 0');
  });
});

// ─── applyBackfill ────────────────────────────────────────────────────────────

const REL_99_01 = '.planning/objectives/99-demo/99-01-demo-SUMMARY.md';
const REL_99_02 = '.planning/objectives/99-demo/99-02-SUMMARY.md';
const OLD_99_01 = SUMMARIES['99-demo/99-01-demo-SUMMARY.md'];

/** 99-01 as backfill must leave it: the six token lines directly before the closing `---`, nothing else changed. */
const STAMPED_99_01 = '---\nobjective: 99-demo\ntrd: "01"\n'
  + 'tokens_input: 140747\ntokens_output: 1370\ntokens_cache_read: 121144\ntokens_cache_write: 19596\n'
  + 'token_model: "claude-opus-5-5"\ntokens_source: "backfill"\n'
  + '---\n\n# Summary 99-demo 01\n\nHand-written body.\n';

/** 99-02 after a forced backfill: 5 and 6 replaced in place, the other four fields appended. */
const FORCED_99_02 = '---\nobjective: 99-demo\ntrd: "02"\n'
  + 'tokens_input: 140747\ntokens_output: 1370\n'
  + 'tokens_cache_read: 121144\ntokens_cache_write: 19596\ntoken_model: "claude-opus-5-5"\ntokens_source: "backfill"\n'
  + '---\n\n# Summary 99-demo 02\n\nHand-written body.\n';

const readAt = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');

/** `snapshot(dir)` without one relative path. */
function snapshotWithout(dir, rel) {
  const snap = snapshot(dir);
  delete snap[rel];
  return snap;
}

describe('57-04 applyBackfill: writes only through the summary post verb', () => {
  test('3. stamps the recovered SUMMARY in place (no second SUMMARY), every other file unchanged', () => {
    const { repo, root } = buildBackfillRepo();
    const plan = backfill.planBackfill({ checkoutRoot: repo, repoRoot: repo, root });
    const othersBefore = snapshotWithout(repo, REL_99_01);

    const applied = backfill.applyBackfill(plan, { checkoutRoot: repo });
    assert.deepEqual(applied, { written: ['99-01'], unchanged: [], skipped: [], write_failed: [] });

    assert.equal(readAt(repo, REL_99_01), STAMPED_99_01);
    assert.notEqual(STAMPED_99_01, OLD_99_01);
    assert.equal(STAMPED_99_01.replace(/tokens_[a-z_]+: [^\n]+\n|token_model: [^\n]+\n/g, ''), OLD_99_01, 'only the six lines were added');
    assert.deepEqual(fs.readdirSync(path.join(repo, '.planning/objectives/99-demo')).sort(), [
      '99-01-demo-SUMMARY.md', '99-01-demo-TRD.md', '99-02-SUMMARY.md', '99-02-more-TRD.md',
    ]);
    assert.deepEqual(snapshotWithout(repo, REL_99_01), othersBefore);
  });

  test('4. idempotent: a second plan recovers nothing and its apply writes nothing', () => {
    const { repo, root } = buildBackfillRepo();
    backfill.applyBackfill(backfill.planBackfill({ checkoutRoot: repo, repoRoot: repo, root }), { checkoutRoot: repo });

    const again = backfill.planBackfill({ checkoutRoot: repo, repoRoot: repo, root });
    assert.equal(again.counts.recovered, 0);
    assert.equal(again.counts.already_stamped, 2);
    const before = snapshot(repo);
    assert.deepEqual(backfill.applyBackfill(again, { checkoutRoot: repo }), { written: [], unchanged: [], skipped: [], write_failed: [] });
    assert.deepEqual(snapshot(repo), before);
  });

  test('5. force: an already stamped SUMMARY is untouched without force and recomputed with it', () => {
    const { repo, root, addTranscript } = buildBackfillRepo();
    addTranscript({ id: '99-02', objectiveDir: '99-demo', session: 'sess-99-02', agentId: 'a9902', description: 'Execute TRD 99-02' });
    const before99_02 = readAt(repo, REL_99_02);

    const plain = backfill.planBackfill({ checkoutRoot: repo, repoRoot: repo, root });
    assert.equal(plain.entries.find((e) => e.file === '99-02-SUMMARY.md').status, 'already_stamped');
    backfill.applyBackfill(plain, { checkoutRoot: repo });
    assert.equal(readAt(repo, REL_99_02), before99_02, 'without force the 5 / 6 stay');

    // Reset 99-01 so the forced plan has two recoverable SUMMARIES.
    fs.writeFileSync(path.join(repo, REL_99_01), OLD_99_01);
    const forced = backfill.planBackfill({ checkoutRoot: repo, repoRoot: repo, root, force: true });
    assert.equal(forced.entries.find((e) => e.file === '99-02-SUMMARY.md').status, 'recovered');
    assert.equal(forced.counts.recovered, 2);
    assert.deepEqual(backfill.applyBackfill(forced, { checkoutRoot: repo, force: true }),
      { written: ['99-01', '99-02'], unchanged: [], skipped: [], write_failed: [] });
    assert.equal(readAt(repo, REL_99_02), FORCED_99_02);
  });

  test('5b. a conflicting existing value is never overwritten without force; unchanged is reported on a re-apply', () => {
    const { repo, root, addTranscript } = buildBackfillRepo();
    const half = summaryText('99-demo', '04', 'tokens_input: 5\n');
    writeAt(repo, '.planning/objectives/99-demo/99-04-SUMMARY.md', half);
    addTranscript({ id: '99-04', objectiveDir: '99-demo', session: 'sess-99-04', agentId: 'a9904', description: 'Execute TRD 99-04' });

    const plan = backfill.planBackfill({ checkoutRoot: repo, repoRoot: repo, root });
    assert.equal(plan.entries.find((e) => e.file === '99-04-SUMMARY.md').status, 'recovered', 'tokens_output is missing, so it is not stamped');

    const first = backfill.applyBackfill(plan, { checkoutRoot: repo });
    assert.deepEqual(first, {
      written: ['99-01'],
      unchanged: [],
      skipped: [{ id: '99-04', file: '99-04-SUMMARY.md', objective_dir: '99-demo', reason: 'token_conflict' }],
      write_failed: [],
    });
    assert.equal(readAt(repo, '.planning/objectives/99-demo/99-04-SUMMARY.md'), half, 'the 5 was not overwritten and nothing was half-written');

    const second = backfill.applyBackfill(plan, { checkoutRoot: repo, force: true });
    assert.deepEqual(second, { written: ['99-04'], unchanged: ['99-01'], skipped: [], write_failed: [] });
    assert.equal(
      readAt(repo, '.planning/objectives/99-demo/99-04-SUMMARY.md'),
      '---\nobjective: 99-demo\ntrd: "04"\ntokens_input: 140747\n'
        + 'tokens_output: 1370\ntokens_cache_read: 121144\ntokens_cache_write: 19596\ntoken_model: "claude-opus-5-5"\ntokens_source: "backfill"\n'
        + '---\n\n# Summary 99-demo 04\n\nHand-written body.\n',
    );
  });

  test('7. directory guard: a shared objective number is written only when summary post resolves to that directory', () => {
    const { repo, root } = buildBackfillRepo({ tenOne: '10-beta' });
    const plan = backfill.planBackfill({ checkoutRoot: repo, repoRoot: repo, root });
    assert.deepEqual(summed(plan.entries.find((e) => e.objective_dir === '10-beta')), ['10-beta', '10-01-SUMMARY.md', 'recovered', null]);
    assert.deepEqual(summed(plan.entries.find((e) => e.objective_dir === '10-alpha')), ['10-alpha', '10-01-SUMMARY.md', 'unrecovered', 'no_transcript']);

    const alphaRel = '.planning/objectives/10-alpha/10-01-SUMMARY.md';
    const betaRel = '.planning/objectives/10-beta/10-01-SUMMARY.md';
    const alphaBefore = readAt(repo, alphaRel);
    const betaBefore = readAt(repo, betaRel);

    const resolved = ghMapping.resolveObjective(repo, '10').dir;
    const applied = backfill.applyBackfill(plan, { checkoutRoot: repo });
    if (resolved === '10-beta') {
      assert.deepEqual(applied, { written: ['10-01', '99-01'], unchanged: [], skipped: [], write_failed: [] });
      assert.notEqual(readAt(repo, betaRel), betaBefore);
    } else {
      assert.deepEqual(applied, {
        written: ['99-01'],
        unchanged: [],
        skipped: [{ id: '10-01', file: '10-01-SUMMARY.md', objective_dir: '10-beta', reason: 'ambiguous_objective_dir' }],
        write_failed: [],
      });
      assert.equal(readAt(repo, betaRel), betaBefore, 'the skipped file is unchanged');
    }
    assert.equal(readAt(repo, alphaRel), alphaBefore, '10-alpha is untouched either way');
  });

  test('8. worktree: transcripts match the main checkout, the SUMMARY is read from and written to the worktree', { skip: !HAS_GIT && 'git not available' }, () => {
    const { repo, root } = buildBackfillRepo();
    const home = ufx.makeFakeHome();
    const holder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-backfill-wt-')));
    cleanup.push(home, holder);
    ufx.initGitFixture(repo, home);
    const env = ufx.gitEnv(home);
    const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

    git(repo, 'worktree', 'add', '-q', '-b', 'df/exec-99-01', path.join(holder, 'wt'));
    const wt = fs.realpathSync(path.join(holder, 'wt'));

    const plan = backfill.planBackfill({ checkoutRoot: wt, repoRoot: repo, root });
    assert.equal(plan.checkout, wt);
    assert.equal(plan.repo, repo);
    assert.equal(plan.entries.find((e) => e.file === '99-01-demo-SUMMARY.md').status, 'recovered', 'transcripts name the main checkout');

    const applied = backfill.applyBackfill(plan, { checkoutRoot: wt });
    assert.deepEqual(applied, { written: ['99-01'], unchanged: [], skipped: [], write_failed: [] });
    assert.equal(readAt(wt, REL_99_01), STAMPED_99_01, 'the worktree copy is stamped');
    assert.equal(readAt(repo, REL_99_01), OLD_99_01, 'the main checkout copy is byte-identical');
    assert.equal(git(repo, 'status', '--porcelain'), '', 'main has no change');
    assert.equal(git(wt, 'status', '--porcelain'), ` M ${REL_99_01}`, 'the worktree has exactly the one stamped SUMMARY');
  });
});
