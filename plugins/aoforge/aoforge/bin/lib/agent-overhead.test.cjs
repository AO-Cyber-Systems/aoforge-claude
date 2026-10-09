'use strict';

// agent-overhead.test.cjs (TRD 58-02, EST-03) — the planner / plan-checker / verifier / researcher / integration-checker /
// roadmapper spawns of a repository, read from Claude Code subagent transcripts: wall minutes and tokens per spawn.
//
// Fixtures are hand-built by __fixtures__/transcript-fixtures.cjs with literal numbers and real timestamps. Every
// projects root is a realpath'd mkdtemp dir; nothing here reads the real ~/.claude.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const fx = require('./__fixtures__/transcript-fixtures.cjs');
const tu = require('./token-usage.cjs');
const ao = require('./agent-overhead.cjs');

const BARE_TOKENS = { tokens_input: null, tokens_output: null, tokens_cache_read: null, tokens_cache_write: null, by_model: {} };

describe('58-02 overhead spawn samples', () => {
  let root;
  let repo;
  let key;

  before(() => {
    root = fx.makeProjectsRoot();
    repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-overhead-repo-')));
    fs.mkdirSync(path.join(repo, '.aoforge', 'objectives'), { recursive: true });
    key = fx.projectKeyFor(repo);
  });

  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  });

  const writeSpawn = (agentId, spawn) => fx.writeOverheadTranscript(root, { projectKey: key, session: 's1', agentId, spawn, cwd: repo });

  test('1: agent types normalise to the six overhead agents; everything else is null', () => {
    assert.equal(ao.normalizeAgentType('aoforge:planner'), 'planner');
    assert.equal(ao.normalizeAgentType('df-verifier'), 'verifier');
    assert.equal(ao.normalizeAgentType('aoforge:job-checker'), 'job-checker');
    assert.equal(ao.normalizeAgentType('aoforge:executor'), null);
    assert.equal(ao.normalizeAgentType('aoforge:debugger'), null);
    assert.equal(ao.normalizeAgentType('general-purpose'), null);
    assert.equal(ao.normalizeAgentType(undefined), null);

    assert.deepEqual([...ao.OVERHEAD_AGENTS], [
      'integration-checker', 'job-checker', 'objective-researcher', 'planner', 'roadmapper', 'verifier',
    ]);
    assert.ok(Object.isFrozen(ao.OVERHEAD_AGENTS));

    assert.equal(ao.isQuickSpawn({ description: 'Quick plan: x' }), true);
    assert.equal(ao.isQuickSpawn({ description: 'Plan Objective 80' }), false);
    assert.equal(ao.isQuickSpawn({}), false);
  });

  test('2: the span runs from the first to the last parseable timestamp, in minutes', () => {
    const p1 = writeSpawn('p1', fx.PLANNER_SPAWN);
    assert.equal(ao.transcriptSpanMinutes(p1), 6);

    const userOnly = fx.writeSubagentTranscript(root, {
      projectKey: key, session: 's1', agentId: 'u1', agentType: 'aoforge:planner', cwd: repo, timestamp: '2026-10-01T09:00:00.000Z',
    });
    assert.equal(ao.transcriptSpanMinutes(userOnly), null);

    // Records whose timestamp does not parse (text, missing, a number) are skipped, as is a malformed line.
    const noisy = fx.writeSubagentTranscript(root, {
      projectKey: key, session: 's1', agentId: 'n1', agentType: 'aoforge:planner', cwd: repo, timestamp: '2026-10-01T09:00:00.000Z',
      extraLines: [
        JSON.stringify({ type: 'assistant', timestamp: 'not a date' }),
        JSON.stringify({ type: 'assistant' }),
        JSON.stringify({ type: 'assistant', timestamp: 12 }),
        '{not json',
        JSON.stringify({ type: 'assistant', timestamp: '2026-10-01T09:05:30.000Z' }),
      ],
    });
    assert.equal(ao.transcriptSpanMinutes(noisy), 5.5);

    const oneValid = fx.writeSubagentTranscript(root, {
      projectKey: key, session: 's1', agentId: 'n2', agentType: 'aoforge:planner', cwd: repo, timestamp: '2026-10-01T09:00:00.000Z',
      extraLines: [JSON.stringify({ type: 'assistant', timestamp: 'not a date' })],
    });
    assert.equal(ao.transcriptSpanMinutes(oneValid), null);
    assert.equal(ao.transcriptSpanMinutes(path.join(root, 'missing.jsonl')), null);
  });

  test('3: a spawn sample counts each API message once and splits tokens by model', () => {
    assert.equal(typeof tu.repoMatcher, 'function');
    assert.equal(typeof tu.repoMatch, 'function');

    const p1 = writeSpawn('p1', fx.PLANNER_SPAWN);
    assert.deepEqual(ao.spawnSample(p1), {
      minutes: 6,
      tokens_input: 111015,
      tokens_output: 6000,
      tokens_cache_read: 110000,
      tokens_cache_write: 1000,
      by_model: {
        'claude-opus-5-5': { tokens_input: 111015, tokens_output: 6000, tokens_cache_read: 110000, tokens_cache_write: 1000 },
      },
    });

    const v1 = ao.spawnSample(writeSpawn('v1', fx.VERIFIER_SPAWN));
    assert.equal(v1.minutes, 4);
    assert.equal(v1.tokens_input, 20503);
    assert.equal(v1.tokens_output, 1500);

    // No assistant usage: not a token sample, but the wall time is kept.
    const quiet = fx.writeSubagentTranscript(root, {
      projectKey: key, session: 's1', agentId: 'q0', agentType: 'aoforge:planner', cwd: repo, timestamp: '2026-10-01T09:00:00.000Z',
      extraLines: [JSON.stringify({ type: 'assistant', timestamp: '2026-10-01T09:05:00.000Z', message: { role: 'assistant', model: 'claude-opus-5-5', id: 'msg_none', content: [] } })],
    });
    assert.deepEqual(ao.spawnSample(quiet), { minutes: 5, ...BARE_TOKENS });

    // Two models: the per-model split sums to the totals.
    const twoModels = writeSpawn('m2', {
      agentType: 'aoforge:planner',
      description: 'Plan Objective 82',
      start: '2026-10-01T11:00:00.000Z',
      messages: [
        { id: 'msg_M1', model: 'claude-opus-5-5', input: 1, cacheWrite: 100, cacheRead: 1000, output: 50, blocks: 1, at: '2026-10-01T11:02:00.000Z' },
        { id: 'msg_M2', model: 'claude-sonnet-5-5', input: 2, cacheWrite: 200, cacheRead: 2000, output: 70, blocks: 2, at: '2026-10-01T11:07:00.000Z' },
      ],
    });
    assert.deepEqual(ao.spawnSample(twoModels), {
      minutes: 7,
      tokens_input: 3303,
      tokens_output: 120,
      tokens_cache_read: 3000,
      tokens_cache_write: 300,
      by_model: {
        'claude-opus-5-5': { tokens_input: 1101, tokens_output: 50, tokens_cache_read: 1000, tokens_cache_write: 100 },
        'claude-sonnet-5-5': { tokens_input: 2202, tokens_output: 70, tokens_cache_read: 2000, tokens_cache_write: 200 },
      },
    });
  });
});

describe('58-02 overhead spawns of a repository', () => {
  let root;   // stands in for ~/.claude/projects
  let R;      // the repository whose overhead is measured
  let F;      // another repository sharing the projects root
  let projectsR;

  const realTmp = (prefix) => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
    fs.mkdirSync(path.join(dir, '.aoforge', 'objectives'), { recursive: true });
    return dir;
  };

  const CHECKER_SPAWN = {
    agentType: 'aoforge:job-checker',
    description: 'Verify Objective 80 plans',
    start: '2026-10-01T10:20:00.000Z',
    messages: [
      { id: 'msg_C1', model: 'claude-sonnet-5-5', input: 2, cacheWrite: 300, cacheRead: 10000, output: 800, blocks: 1, at: '2026-10-01T10:22:00.000Z' },
    ],
  };
  const QUICK_SPAWN = {
    agentType: 'aoforge:planner',
    description: 'Quick plan: fix X',
    start: '2026-10-01T10:30:00.000Z',
    messages: [
      { id: 'msg_Q1', model: 'claude-opus-5-5', input: 1, cacheWrite: 100, cacheRead: 1000, output: 100, blocks: 1, at: '2026-10-01T10:31:00.000Z' },
    ],
  };
  const FOREIGN_SPAWN = { ...fx.VERIFIER_SPAWN, description: 'Verify objective 9' };
  const LEGACY_SPAWN = { ...fx.VERIFIER_SPAWN, agentType: 'df-verifier', description: 'Verify objective 79' };

  before(() => {
    root = fx.makeProjectsRoot();
    R = realTmp('df-overhead-r-');
    F = realTmp('df-overhead-f-');
    projectsR = [{ root: R, label: 'repo-r' }];
    const keyR = fx.projectKeyFor(R);
    const keyF = fx.projectKeyFor(F);

    const spawn = (projectKey, session, agentId, s, cwd) => fx.writeOverheadTranscript(root, { projectKey, session, agentId, spawn: s, cwd });
    spawn(keyR, 's1', 'p1', fx.PLANNER_SPAWN, R);
    spawn(keyR, 's1', 'v1', fx.VERIFIER_SPAWN, R);
    spawn(keyR, 's1', 'c1', CHECKER_SPAWN, R);
    spawn(keyR, 's2', 'q1', QUICK_SPAWN, R);
    fx.writeSubagentTranscript(root, {
      projectKey: keyR, session: 's2', agentId: 'e1', agentType: 'aoforge:executor', description: 'Execute TRD 80-01',
      prompt: 'Execute TRD 80-01', cwd: R, records: fx.THREE_MESSAGES,
    });
    fx.writeSubagentTranscript(root, {
      projectKey: keyR, session: 's2', agentId: 'g1', agentType: 'general-purpose', description: 'Explore',
      prompt: 'Explore the repo', cwd: R, records: fx.THREE_MESSAGES,
    });
    spawn(keyF, 's3', 'f1', FOREIGN_SPAWN, F);
    // x1: the meta.json is there, the transcript is not.
    const dir = path.join(root, keyR, 's3', 'subagents');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'agent-x1.meta.json'), JSON.stringify({ agentType: 'aoforge:planner', description: 'Plan Objective 81' }));
    spawn(keyR, 's3', 'l1', LEGACY_SPAWN, R);
  });

  after(() => {
    for (const d of [root, R, F]) fs.rmSync(d, { recursive: true, force: true });
  });

  const brief = (e) => ({ agent: e.agent, project: e.project, session: e.session, agent_id: e.agent_id });

  test('4: the index keeps this repository\'s overhead spawns and counts every other outcome', () => {
    const { entries, counts } = ao.indexOverheadTranscripts({ root, projects: projectsR });
    assert.deepEqual(counts, {
      spawns: 7, matched: 4, foreign: 1, quick: 1, unreadable: 1,
      by_agent: { 'job-checker': 1, planner: 1, verifier: 2 },
    });
    assert.deepEqual(entries.map(brief).sort((a, b) => a.agent_id.localeCompare(b.agent_id)), [
      { agent: 'job-checker', project: 'repo-r', session: 's1', agent_id: 'c1' },
      { agent: 'verifier', project: 'repo-r', session: 's3', agent_id: 'l1' },
      { agent: 'planner', project: 'repo-r', session: 's1', agent_id: 'p1' },
      { agent: 'verifier', project: 'repo-r', session: 's1', agent_id: 'v1' },
    ]);
    for (const e of entries) {
      assert.ok(path.isAbsolute(e.file) && e.file.endsWith(`agent-${e.agent_id}.jsonl`), e.file);
      assert.ok(fs.existsSync(e.file), e.file);
    }

    // With the other repository in `projects`, its verifier belongs to it instead of being foreign.
    const both = ao.indexOverheadTranscripts({
      root, projects: [{ root: R, label: 'repo-r' }, { root: F, label: 'repo-f' }],
    });
    assert.deepEqual(both.counts, {
      spawns: 7, matched: 5, foreign: 0, quick: 1, unreadable: 1,
      by_agent: { 'job-checker': 1, planner: 1, verifier: 3 },
    });
    assert.deepEqual(brief(both.entries.find((e) => e.agent_id === 'f1')), {
      agent: 'verifier', project: 'repo-f', session: 's3', agent_id: 'f1',
    });
  });

  test('5: collectOverhead returns sorted, path-free samples deterministically and demands a root', () => {
    const first = ao.collectOverhead({ root, projects: projectsR });
    const second = ao.collectOverhead({ root, projects: projectsR });
    assert.deepEqual(first, second);

    assert.deepEqual(first.counts, ao.indexOverheadTranscripts({ root, projects: projectsR }).counts);
    assert.deepEqual(first.samples.map((s) => `${s.agent}/${s.session}/${s.agent_id}`), [
      'job-checker/s1/c1', 'planner/s1/p1', 'verifier/s1/v1', 'verifier/s3/l1',
    ]);
    for (const s of first.samples) {
      assert.equal(s.project, 'repo-r');
      assert.equal('file' in s, false);
    }
    assert.deepEqual(first.samples[1], {
      agent: 'planner', project: 'repo-r', session: 's1', agent_id: 'p1',
      minutes: 6, tokens_input: 111015, tokens_output: 6000, tokens_cache_read: 110000, tokens_cache_write: 1000,
      by_model: {
        'claude-opus-5-5': { tokens_input: 111015, tokens_output: 6000, tokens_cache_read: 110000, tokens_cache_write: 1000 },
      },
    });

    assert.throws(() => ao.indexOverheadTranscripts({ projects: projectsR }), /indexOverheadTranscripts: root is required/);
    assert.throws(() => ao.collectOverhead({ projects: projectsR }), /collectOverhead: root is required/);
    assert.throws(() => ao.collectOverhead(), /root is required/);
  });
});
