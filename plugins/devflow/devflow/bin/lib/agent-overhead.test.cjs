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
    fs.mkdirSync(path.join(repo, '.planning', 'objectives'), { recursive: true });
    key = fx.projectKeyFor(repo);
  });

  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  });

  const writeSpawn = (agentId, spawn) => fx.writeOverheadTranscript(root, { projectKey: key, session: 's1', agentId, spawn, cwd: repo });

  test('1: agent types normalise to the six overhead agents; everything else is null', () => {
    assert.equal(ao.normalizeAgentType('devflow:planner'), 'planner');
    assert.equal(ao.normalizeAgentType('df-verifier'), 'verifier');
    assert.equal(ao.normalizeAgentType('devflow:job-checker'), 'job-checker');
    assert.equal(ao.normalizeAgentType('devflow:executor'), null);
    assert.equal(ao.normalizeAgentType('devflow:debugger'), null);
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
      projectKey: key, session: 's1', agentId: 'u1', agentType: 'devflow:planner', cwd: repo, timestamp: '2026-10-01T09:00:00.000Z',
    });
    assert.equal(ao.transcriptSpanMinutes(userOnly), null);

    // Records whose timestamp does not parse (text, missing, a number) are skipped, as is a malformed line.
    const noisy = fx.writeSubagentTranscript(root, {
      projectKey: key, session: 's1', agentId: 'n1', agentType: 'devflow:planner', cwd: repo, timestamp: '2026-10-01T09:00:00.000Z',
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
      projectKey: key, session: 's1', agentId: 'n2', agentType: 'devflow:planner', cwd: repo, timestamp: '2026-10-01T09:00:00.000Z',
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
      projectKey: key, session: 's1', agentId: 'q0', agentType: 'devflow:planner', cwd: repo, timestamp: '2026-10-01T09:00:00.000Z',
      extraLines: [JSON.stringify({ type: 'assistant', timestamp: '2026-10-01T09:05:00.000Z', message: { role: 'assistant', model: 'claude-opus-5-5', id: 'msg_none', content: [] } })],
    });
    assert.deepEqual(ao.spawnSample(quiet), { minutes: 5, ...BARE_TOKENS });

    // Two models: the per-model split sums to the totals.
    const twoModels = writeSpawn('m2', {
      agentType: 'devflow:planner',
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
