'use strict';

// token-usage.test.cjs (TRD 57-01, EST-06 / EST-07) — per-TRD executor token totals from Claude Code transcripts.
//
// Claude Code writes one transcript record per content block, and every record of one API message repeats the same
// message.usage. The exact totals below (input 7, cache_creation 19596, cache_read 121144, output 1370 →
// tokens_input 140747) only come out when each API message is counted once. Fixtures are hand-built by
// __fixtures__/transcript-fixtures.cjs; every projects root is a realpath'd mkdtemp dir, never the real ~/.claude.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const fx = require('./__fixtures__/transcript-fixtures.cjs');
const tu = require('./token-usage.cjs');

describe('57-01 executor token totals', () => {
  let root;   // stands in for ~/.claude/projects
  let repo;   // the fixture repository (main checkout)
  let key;    // its project key

  before(() => {
    root = fx.makeProjectsRoot();
    repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-token-repo-')));
    for (const d of ['99-demo', '10-alpha', '10-beta']) {
      fs.mkdirSync(path.join(repo, '.aoforge', 'objectives', d), { recursive: true });
    }
    key = fx.projectKeyFor(repo);
  });

  // Index tests each get their own projects root, so one test's transcripts never reach another's totals.
  const extraRoots = [];
  function freshRoot() {
    const r = fx.makeProjectsRoot();
    extraRoots.push(r);
    return r;
  }

  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
    for (const r of extraRoots) fs.rmSync(r, { recursive: true, force: true });
  });

  /** An executor transcript in the fixture repo's project key; THREE_MESSAGES unless `records` says otherwise. */
  function writeExecutor(projectsRoot, { session, agentId, prompt, description = '', cwd = repo, records = fx.THREE_MESSAGES, agentType }) {
    return fx.writeSubagentTranscript(projectsRoot, {
      projectKey: key, session, agentId, agentType, description, prompt, cwd, records,
    });
  }

  const planIdPrompt = (id, objectiveDir, repoRoot = repo) => fx.executorPrompt('plan_id', { id, objectiveDir, repoRoot });
  const ZERO_COUNTS = { executor_transcripts: 0, identified: 0, unidentified: 0, ambiguous: 0, foreign: 0 };
  const THREE_TOTALS = {
    tokens_input: 140747, tokens_output: 1370, tokens_cache_read: 121144, tokens_cache_write: 19596, token_model: 'claude-opus-5-5',
  };

  test('1: tokensForTrd returns the deduped totals of the one executor transcript for 99-01', () => {
    const r = freshRoot();
    const file = writeExecutor(r, {
      session: 'sess-1', agentId: 'a1', description: 'Execute TRD 99-01', prompt: planIdPrompt('99-01', '99-demo'),
    });
    const index = tu.indexExecutorTranscripts({ root: r, repoRoot: repo });
    assert.deepStrictEqual(index.counts, { ...ZERO_COUNTS, executor_transcripts: 1, identified: 1 });
    assert.deepStrictEqual(index.entries, [
      { file, session: 'sess-1', agent_id: 'a1', id: '99-01', dirs: ['99-demo'], match: 'repo_root' },
    ]);
    const res = tu.tokensForTrd(index, { id: '99-01', dir: '99-demo', sharedNumber: false });
    assert.equal(res.status, 'recovered');
    assert.equal(res.transcripts.length, 1);
    assert.deepStrictEqual(res.transcripts, [{ file, session: 'sess-1', agent_id: 'a1' }]);
    assert.deepStrictEqual(res.totals, THREE_TOTALS);
  });

  test('2: two executor transcripts for 99-01 in two sessions are summed', () => {
    const r = freshRoot();
    const f1 = writeExecutor(r, { session: 'sess-1', agentId: 'a1', prompt: planIdPrompt('99-01', '99-demo') });
    const f2 = writeExecutor(r, { session: 'sess-2', agentId: 'a2', prompt: planIdPrompt('99-01', '99-demo') });
    const res = tu.tokensForTrd(tu.indexExecutorTranscripts({ root: r, repoRoot: repo }), {
      id: '99-01', dir: '99-demo', sharedNumber: false,
    });
    assert.equal(res.status, 'recovered');
    assert.equal(res.transcripts.length, 2);
    assert.deepStrictEqual(res.transcripts.map((t) => t.file), [f1, f2]);
    assert.deepStrictEqual(res.totals, {
      tokens_input: 281494, tokens_output: 2740, tokens_cache_read: 242288, tokens_cache_write: 39192, token_model: 'claude-opus-5-5',
    });
  });

  test('3: planner and verifier transcripts whose prompt names the same TRD are not indexed', () => {
    const r = freshRoot();
    writeExecutor(r, { session: 'sess-1', agentId: 'a-plan', agentType: 'aoforge:planner', prompt: planIdPrompt('99-01', '99-demo') });
    writeExecutor(r, { session: 'sess-1', agentId: 'a-ver', agentType: 'aoforge:verifier', prompt: planIdPrompt('99-01', '99-demo') });
    writeExecutor(r, { session: 'sess-1', agentId: 'a-exec', prompt: planIdPrompt('99-01', '99-demo') });
    const index = tu.indexExecutorTranscripts({ root: r, repoRoot: repo });
    assert.deepStrictEqual(index.entries.map((e) => e.agent_id), ['a-exec']);
    assert.deepStrictEqual(index.counts, { ...ZERO_COUNTS, executor_transcripts: 1, identified: 1 });
    const res = tu.tokensForTrd(index, { id: '99-01', dir: '99-demo', sharedNumber: false });
    assert.equal(res.transcripts.length, 1);
    assert.deepStrictEqual(res.totals, THREE_TOTALS);
  });

  test('4: REPO_ROOT naming another repository is counted foreign and never matches, whatever the cwd', () => {
    const r = freshRoot();
    writeExecutor(r, { session: 'sess-1', agentId: 'a-foreign', cwd: repo, prompt: planIdPrompt('99-01', '99-demo', '/elsewhere/repo') });
    const index = tu.indexExecutorTranscripts({ root: r, repoRoot: repo });
    assert.deepStrictEqual(index.entries, []);
    assert.deepStrictEqual(index.counts, { ...ZERO_COUNTS, executor_transcripts: 1, foreign: 1 });
    assert.deepStrictEqual(tu.tokensForTrd(index, { id: '99-01', dir: '99-demo', sharedNumber: false }), {
      status: 'unrecovered', reason: 'no_transcript', transcripts: [], totals: null,
    });
  });

  test('5: with no REPO_ROOT line, the first record cwd (equal or inside) or a <repo>/.aoforge/ path decides', () => {
    const r = freshRoot();
    const tag = (id) => fx.executorPrompt('objective_tag', { id, objectiveDir: '99-demo' });
    writeExecutor(r, { session: 's', agentId: 'a-cwd', cwd: repo, prompt: tag('99-05') });
    writeExecutor(r, { session: 's', agentId: 'a-inside', cwd: path.join(repo, 'plugins', 'aoforge'), prompt: tag('99-06') });
    writeExecutor(r, { session: 's', agentId: 'a-away', cwd: '/elsewhere/repo', prompt: tag('99-07') });
    writeExecutor(r, {
      session: 's',
      agentId: 'a-path',
      cwd: '/elsewhere/repo',
      prompt: fx.executorPrompt('trd_path', { id: '99-08', objectiveDir: '99-demo', slug: 'demo', repoRoot: repo }),
    });
    // a sibling directory that merely shares the repo path as a prefix is not inside it
    writeExecutor(r, { session: 's', agentId: 'a-sibling', cwd: `${repo}-other`, prompt: tag('99-09') });
    const index = tu.indexExecutorTranscripts({ root: r, repoRoot: repo });
    assert.deepStrictEqual(Object.fromEntries(index.entries.map((e) => [e.id, e.match])), {
      '99-05': 'cwd', '99-06': 'cwd', '99-08': 'path',
    });
    assert.deepStrictEqual(index.counts, { ...ZERO_COUNTS, executor_transcripts: 5, identified: 3, foreign: 2 });
  });

  // Observed 2026-10-05: gap-closure executors 42-13/14/15 ran with cwd = /Users/justin/dev/.df-worktrees/aoforge-claude/42-12
  // and no REPO_ROOT line. exec-context provisions every worktree at <dirname(repo)>/.df-worktrees/<basename(repo)>/<id>,
  // so a cwd there is this repository's, not another's.
  test('5b: with no REPO_ROOT line, a cwd under this repo\'s AOForge worktree directory counts as the repo', () => {
    const r = freshRoot();
    const tag = (id) => fx.executorPrompt('objective_tag', { id, objectiveDir: '99-demo' });
    const worktrees = path.join(path.dirname(repo), '.df-worktrees', path.basename(repo));
    writeExecutor(r, { session: 's', agentId: 'a-wt', cwd: path.join(worktrees, '42-12'), prompt: tag('99-10') });
    // the same layout for another repository is not this repo
    writeExecutor(r, {
      session: 's',
      agentId: 'a-wt-other',
      cwd: path.join(path.dirname(repo), '.df-worktrees', `${path.basename(repo)}-other`, '42-12'),
      prompt: tag('99-11'),
    });
    // a REPO_ROOT line still decides on its own: a worktree cwd never overrides a foreign REPO_ROOT
    writeExecutor(r, {
      session: 's', agentId: 'a-wt-foreign', cwd: path.join(worktrees, '42-12'), prompt: planIdPrompt('99-12', '99-demo', '/elsewhere/repo'),
    });
    const index = tu.indexExecutorTranscripts({ root: r, repoRoot: repo });
    assert.deepStrictEqual(Object.fromEntries(index.entries.map((e) => [e.id, e.match])), { '99-10': 'worktree' });
    assert.deepStrictEqual(index.counts, { ...ZERO_COUNTS, executor_transcripts: 3, identified: 1, foreign: 2 });
  });

  test('6: a shared objective number counts a transcript only for the directory its prompt names', () => {
    const r = freshRoot();
    const beta = writeExecutor(r, { session: 's', agentId: 'a-beta', prompt: planIdPrompt('10-01', '10-beta') });
    const betaOnly = tu.indexExecutorTranscripts({ root: r, repoRoot: repo });
    assert.equal(tu.tokensForTrd(betaOnly, { id: '10-01', dir: '10-beta', sharedNumber: true }).status, 'recovered');
    assert.deepStrictEqual(tu.tokensForTrd(betaOnly, { id: '10-01', dir: '10-alpha', sharedNumber: true }), {
      status: 'unrecovered', reason: 'no_transcript', transcripts: [], totals: null,
    });

    // a second 10-01 transcript with no directory evidence at all
    const none = writeExecutor(r, { session: 's', agentId: 'a-none', prompt: `PLAN_ID:    10-01\nREPO_ROOT:  ${repo}\n` });
    const both = tu.indexExecutorTranscripts({ root: r, repoRoot: repo });
    assert.deepStrictEqual(both.entries.map((e) => [e.agent_id, e.dirs]), [['a-beta', ['10-beta']], ['a-none', []]]);
    const forBeta = tu.tokensForTrd(both, { id: '10-01', dir: '10-beta', sharedNumber: true });
    assert.equal(forBeta.status, 'recovered');
    assert.deepStrictEqual(forBeta.transcripts.map((t) => t.file), [beta]);
    assert.deepStrictEqual(tu.tokensForTrd(both, { id: '10-01', dir: '10-alpha', sharedNumber: true }), {
      status: 'unrecovered', reason: 'ambiguous_objective', transcripts: [], totals: null,
    });
    // no directory filter: both 10-01 transcripts count
    const unfiltered = tu.tokensForTrd(both, { id: '10-01', dir: null, sharedNumber: true });
    assert.equal(unfiltered.status, 'recovered');
    assert.deepStrictEqual(unfiltered.transcripts.map((t) => t.file), [beta, none]);
    assert.equal(unfiltered.totals.tokens_output, 2740);

    // only the evidence-free transcript: ambiguous for both directories while the number is shared
    const r2 = freshRoot();
    writeExecutor(r2, { session: 's', agentId: 'a-none', prompt: `PLAN_ID:    10-01\nREPO_ROOT:  ${repo}\n` });
    const noneOnly = tu.indexExecutorTranscripts({ root: r2, repoRoot: repo });
    for (const dir of ['10-alpha', '10-beta']) {
      assert.deepStrictEqual(tu.tokensForTrd(noneOnly, { id: '10-01', dir, sharedNumber: true }), {
        status: 'unrecovered', reason: 'ambiguous_objective', transcripts: [], totals: null,
      });
    }
    // an unshared number needs no directory evidence
    assert.equal(tu.tokensForTrd(noneOnly, { id: '10-01', dir: '10-alpha', sharedNumber: false }).status, 'recovered');
  });

  test('7: identifyExecutorTrd — PLAN_ID, Execute plan / TRD path, description; ambiguity and no id', () => {
    assert.deepStrictEqual(tu.identifyExecutorTrd({ prompt: 'PLAN_ID: 48-01' }), { id: '48-01', dirs: [] });
    assert.deepStrictEqual(
      tu.identifyExecutorTrd({ prompt: fx.executorPrompt('objective_tag', { id: '48-01', objectiveDir: '48-planning-write-path-migration' }) }),
      { id: '48-01', dirs: ['48-planning-write-path-migration'] },
    );
    assert.deepStrictEqual(
      tu.identifyExecutorTrd({
        prompt: fx.executorPrompt('trd_path', { id: '48-01', objectiveDir: '48-x', slug: 'ledger', repoRoot: '/Users/justin/dev/aoforge-claude' }),
      }),
      { id: '48-01', dirs: ['48-x'] },
    );
    assert.deepStrictEqual(
      tu.identifyExecutorTrd({ prompt: fx.executorPrompt('bare'), description: 'Execute TRD 48-01' }),
      { id: '48-01', dirs: [] },
    );
    assert.deepStrictEqual(
      tu.identifyExecutorTrd({
        prompt: 'Read .aoforge/objectives/48-x/48-01-ledger-TRD.md and .aoforge/objectives/48-x/48-02-other-TRD.md first.',
      }),
      { ambiguous: true },
    );
    assert.equal(tu.identifyExecutorTrd({ prompt: fx.executorPrompt('bare'), description: '' }), null);
    assert.equal(tu.identifyExecutorTrd({ prompt: '', description: 'Plan objective 48' }), null);

    // directory evidence for another objective (a cited SUMMARY) is dropped; the id is normalised
    assert.deepStrictEqual(
      tu.identifyExecutorTrd({
        prompt: 'PLAN_ID: 48-01\nRead .aoforge/objectives/47-prev/47-02-SUMMARY.md, then .aoforge/objectives/48-x/48-01-ledger-TRD.md',
      }),
      { id: '48-01', dirs: ['48-x'] },
    );
    assert.deepStrictEqual(
      tu.identifyExecutorTrd({ prompt: fx.executorPrompt('bare'), description: 'execute plan 4-1 to checkpoint' }),
      { id: '04-01', dirs: [] },
    );
  });

  test('10: zero usage, no transcript, a missing root, and the default root read at call time', () => {
    const r = freshRoot();
    const empty = writeExecutor(r, { session: 's', agentId: 'a-empty', records: [], prompt: planIdPrompt('99-01', '99-demo') });
    const index = tu.indexExecutorTranscripts({ root: r, repoRoot: repo });
    assert.deepStrictEqual(tu.tokensForTrd(index, { id: '99-01', dir: '99-demo', sharedNumber: false }), {
      status: 'unrecovered', reason: 'zero_usage', transcripts: [{ file: empty, session: 's', agent_id: 'a-empty' }], totals: null,
    });
    assert.deepStrictEqual(tu.tokensForTrd(index, { id: '99-77', dir: '99-demo', sharedNumber: false }), {
      status: 'unrecovered', reason: 'no_transcript', transcripts: [], totals: null,
    });
    assert.deepStrictEqual(tu.indexExecutorTranscripts({ root: path.join(r, 'does-not-exist'), repoRoot: repo }), {
      entries: [], counts: ZERO_COUNTS,
    });

    // defaultTranscriptRoot() reads HOME when called, not when the module loaded
    const { home, projectsRoot } = fx.makeFakeHome();
    extraRoots.push(home);
    const saved = process.env.HOME;
    process.env.HOME = home;
    try {
      assert.equal(tu.defaultTranscriptRoot(), projectsRoot);
      writeExecutor(projectsRoot, { session: 's', agentId: 'a-home', prompt: planIdPrompt('99-01', '99-demo') });
      const res = tu.tokensForTrd(tu.indexExecutorTranscripts({ repoRoot: repo }), { id: '99-01', dir: '99-demo', sharedNumber: false });
      assert.equal(res.status, 'recovered');
      assert.deepStrictEqual(res.totals, THREE_TOTALS);
    } finally {
      if (saved === undefined) delete process.env.HOME;
      else process.env.HOME = saved;
    }
  });

  test('11: normTrdId pads objective and TRD numbers; anything else is null', () => {
    assert.equal(tu.normTrdId('4-1'), '04-01');
    assert.equal(tu.normTrdId('48-01'), '48-01');
    assert.equal(tu.normTrdId('4.1-2'), '04.1-02');
    assert.equal(tu.normTrdId('10-04a'), null);
    assert.equal(tu.normTrdId('x'), null);
    assert.equal(tu.normTrdId(''), null);
    assert.equal(tu.normTrdId(null), null);
    // an id normTrdId rejects is never looked up
    assert.deepStrictEqual(tu.tokensForTrd({ entries: [], counts: ZERO_COUNTS }, { id: '10-04a', dir: null, sharedNumber: false }), {
      status: 'unrecovered', reason: 'invalid_id', transcripts: [], totals: null,
    });
  });

  test('12: tokenFrontmatterFields + stampTokenFields append six lines and touch no other byte', () => {
    assert.deepStrictEqual(tu.TOKEN_FIELDS, [
      'tokens_input', 'tokens_output', 'tokens_cache_read', 'tokens_cache_write', 'token_model', 'tokens_source',
    ]);
    const fields = tu.tokenFrontmatterFields(THREE_TOTALS, 'live');
    assert.deepStrictEqual(fields, [
      ['tokens_input', '140747'],
      ['tokens_output', '1370'],
      ['tokens_cache_read', '121144'],
      ['tokens_cache_write', '19596'],
      ['token_model', '"claude-opus-5-5"'],
      ['tokens_source', '"live"'],
    ]);

    const dir = freshRoot();
    const file = path.join(dir, '99-01-SUMMARY.md');
    const before = [
      '---',
      'objective: 99-demo',
      'trd: "01"',
      '# token fields are stamped by aof-tools, never by hand',
      'subsystem: tooling',
      '---',
      '',
      '# Objective 99 TRD 01: Demo Summary',
      '',
      'Body text: tokens_input: 5 is prose, not frontmatter.',
      '',
    ].join('\n');
    fs.writeFileSync(file, before);

    assert.deepStrictEqual(tu.stampTokenFields(file, fields, { force: false }), { ok: true, changed: true, conflicts: [] });
    const stamped = [
      '---',
      'objective: 99-demo',
      'trd: "01"',
      '# token fields are stamped by aof-tools, never by hand',
      'subsystem: tooling',
      'tokens_input: 140747',
      'tokens_output: 1370',
      'tokens_cache_read: 121144',
      'tokens_cache_write: 19596',
      'token_model: "claude-opus-5-5"',
      'tokens_source: "live"',
      '---',
      '',
      '# Objective 99 TRD 01: Demo Summary',
      '',
      'Body text: tokens_input: 5 is prose, not frontmatter.',
      '',
    ].join('\n');
    assert.equal(fs.readFileSync(file, 'utf8'), stamped);

    // the same stamp again changes nothing
    assert.deepStrictEqual(tu.stampTokenFields(file, fields, { force: false }), { ok: true, changed: false, conflicts: [] });
    assert.equal(fs.readFileSync(file, 'utf8'), stamped);

    // an existing different value is a conflict and stays; force replaces it in place
    const conflicting = stamped.replace('tokens_input: 140747', 'tokens_input: 999');
    fs.writeFileSync(file, conflicting);
    assert.deepStrictEqual(tu.stampTokenFields(file, fields, { force: false }), { ok: true, changed: false, conflicts: ['tokens_input'] });
    assert.equal(fs.readFileSync(file, 'utf8'), conflicting);
    assert.deepStrictEqual(tu.stampTokenFields(file, fields, { force: true }), { ok: true, changed: true, conflicts: [] });
    assert.equal(fs.readFileSync(file, 'utf8'), stamped);

    // no frontmatter block: nothing is written and the stamp reports it
    const bare = path.join(dir, 'no-frontmatter.md');
    fs.writeFileSync(bare, '# Just a body\n');
    const res = tu.stampTokenFields(bare, fields, { force: false });
    assert.equal(res.ok, false);
    assert.equal(res.changed, false);
    assert.match(res.error, /no frontmatter block/);
    assert.equal(fs.readFileSync(bare, 'utf8'), '# Just a body\n');
  });

  test('13: objectiveDirsFor lists the directories of an objective number, sorted', () => {
    assert.deepStrictEqual(tu.objectiveDirsFor(repo, '10-01'), ['10-alpha', '10-beta']);
    assert.deepStrictEqual(tu.objectiveDirsFor(repo, '99-01'), ['99-demo']);
    assert.deepStrictEqual(tu.objectiveDirsFor(repo, '7-01'), []);
    assert.deepStrictEqual(tu.objectiveDirsFor(freshRoot(), '10-01'), []);
  });

  test('1a: sumUsage counts each API message once (dedupe by message.id, the largest output wins)', () => {
    const file = fx.writeSubagentTranscript(root, {
      projectKey: key,
      session: 'sess-sum',
      agentId: 'a-sum',
      description: 'Execute TRD 99-01',
      prompt: fx.executorPrompt('plan_id', { id: '99-01', objectiveDir: '99-demo', repoRoot: repo }),
      cwd: repo,
      records: fx.THREE_MESSAGES,
    });
    const u = tu.sumUsage(file);
    assert.equal(u.readable, true);
    assert.equal(u.messages, 3);
    assert.equal(u.input, 7);
    assert.equal(u.cache_creation, 19596);
    assert.equal(u.cache_read, 121144);
    assert.equal(u.output, 1370);
    assert.equal(u.input + u.cache_creation + u.cache_read, 140747);
    assert.deepStrictEqual(u.by_model, {
      'claude-opus-5-5': { messages: 3, input: 7, cache_creation: 19596, cache_read: 121144, output: 1370 },
    });

    // The naive per-record sum is a different number: that is what the dedupe is for.
    const naiveOutput = fx.THREE_MESSAGES.reduce((s, r) => s + r.message.usage.output_tokens, 0);
    const naiveRead = fx.THREE_MESSAGES.reduce((s, r) => s + r.message.usage.cache_read_input_tokens, 0);
    assert.equal(naiveOutput, 1410);
    assert.equal(naiveRead, 317782);
    assert.notEqual(naiveOutput, u.output);
  });

  test('8: malformed JSONL lines, records without message.usage, user rows and <synthetic> records are ignored', () => {
    const file = fx.writeSubagentTranscript(root, {
      projectKey: key,
      session: 'sess-noise',
      agentId: 'a-noise',
      description: 'Execute TRD 99-01',
      prompt: fx.executorPrompt('plan_id', { id: '99-01', objectiveDir: '99-demo', repoRoot: repo }),
      cwd: repo,
      records: fx.THREE_MESSAGES,
      extraLines: [
        '{"type":"assistant","message":{"id":"msg_cut","usage":{"input_tokens":9',
        '',
        'not json at all',
        JSON.stringify({
          type: 'assistant',
          uuid: 'no-usage-1',
          message: { model: 'claude-opus-5-5', id: 'msg_D', content: [{ type: 'text', text: 'Done.' }] },
        }),
        JSON.stringify({
          type: 'assistant',
          uuid: 'synthetic-1',
          message: {
            model: '<synthetic>',
            id: 'msg_E',
            content: [{ type: 'text', text: 'No response requested.' }],
            usage: { input_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 50 },
          },
        }),
        JSON.stringify({
          type: 'user',
          uuid: 'user-with-usage-1',
          message: {
            role: 'user',
            content: 'tool output',
            usage: { input_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 50 },
          },
        }),
      ],
    });
    const u = tu.sumUsage(file);
    assert.equal(u.readable, true);
    assert.equal(u.messages, 3);
    assert.equal(u.input, 7);
    assert.equal(u.cache_creation, 19596);
    assert.equal(u.cache_read, 121144);
    assert.equal(u.output, 1370);
    assert.deepStrictEqual(Object.keys(u.by_model), ['claude-opus-5-5']);

    const missing = tu.sumUsage(path.join(root, 'no-such', 'agent-x.jsonl'));
    assert.deepStrictEqual(missing, {
      readable: false, messages: 0, input: 0, cache_creation: 0, cache_read: 0, output: 0, by_model: {},
    });
  });

  test('9: pickModel takes the raw model id with the largest output total; a tie picks the smaller id', () => {
    const file = fx.writeSubagentTranscript(root, {
      projectKey: key,
      session: 'sess-models',
      agentId: 'a-models',
      description: 'Execute TRD 99-02',
      prompt: fx.executorPrompt('plan_id', { id: '99-02', objectiveDir: '99-demo', repoRoot: repo }),
      cwd: repo,
      records: [
        ...fx.assistantRecords({ id: 'msg_M1', model: 'claude-opus-5[1m]', input: 1, cacheWrite: 0, cacheRead: 100, output: 500, blocks: 2 }),
        ...fx.assistantRecords({ id: 'msg_M2', model: 'claude-sonnet-5', input: 1, cacheWrite: 0, cacheRead: 100, output: 300, blocks: 1 }),
        ...fx.assistantRecords({ id: 'msg_M3', model: 'claude-sonnet-5', input: 1, cacheWrite: 0, cacheRead: 100, output: 150, blocks: 1 }),
      ],
    });
    const u = tu.sumUsage(file);
    assert.deepStrictEqual(Object.keys(u.by_model).sort(), ['claude-opus-5[1m]', 'claude-sonnet-5']);
    assert.equal(u.by_model['claude-opus-5[1m]'].output, 500);
    assert.equal(u.by_model['claude-sonnet-5'].output, 450);
    assert.equal(u.by_model['claude-sonnet-5'].messages, 2);
    // the raw id stays as written: no normalisation here (57-02 owns the pricing normaliser)
    assert.equal(tu.pickModel(u.by_model), 'claude-opus-5[1m]');

    const tie = fx.writeSubagentTranscript(root, {
      projectKey: key,
      session: 'sess-tie',
      agentId: 'a-tie',
      description: 'Execute TRD 99-03',
      prompt: fx.executorPrompt('plan_id', { id: '99-03', objectiveDir: '99-demo', repoRoot: repo }),
      cwd: repo,
      records: [
        ...fx.assistantRecords({ id: 'msg_T1', model: 'claude-b', input: 1, cacheWrite: 0, cacheRead: 10, output: 400, blocks: 1 }),
        ...fx.assistantRecords({ id: 'msg_T2', model: 'claude-a', input: 1, cacheWrite: 0, cacheRead: 10, output: 400, blocks: 1 }),
      ],
    });
    assert.equal(tu.pickModel(tu.sumUsage(tie).by_model), 'claude-a');
    assert.equal(tu.pickModel({}), null);

    // tokensForTrd reports the same raw id as token_model
    const index = tu.indexExecutorTranscripts({ root, repoRoot: repo });
    assert.equal(tu.tokensForTrd(index, { id: '99-02', dir: '99-demo', sharedNumber: false }).totals.token_model, 'claude-opus-5[1m]');
    assert.equal(tu.tokensForTrd(index, { id: '99-03', dir: '99-demo', sharedNumber: false }).totals.token_model, 'claude-a');
  });
});
