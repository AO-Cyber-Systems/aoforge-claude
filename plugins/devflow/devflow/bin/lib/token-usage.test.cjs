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
      fs.mkdirSync(path.join(repo, '.planning', 'objectives', d), { recursive: true });
    }
    key = fx.projectKeyFor(repo);
  });

  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
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
  });
});
