'use strict';

// trd-identify.test.cjs (TRD 57-01) — executor TRD identification lives in lib, and the SubagentStop hook re-exports it.
//
// The runtime mirror (~/.claude/aoforge/) does not ship hooks/, so aof-tools cannot require the hook. Identification
// moved to lib/trd-identify.cjs; hooks/gate-executor-stop.js requires it from there. One source, same function objects.
// The hook's own suite (hooks/gate-executor-stop.test.js) pins identifyTrd / readFirstUserPrompt behaviour.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const fx = require('./__fixtures__/transcript-fixtures.cjs');
const lib = require('./trd-identify.cjs');

const HOOK_PATH = path.join(__dirname, '..', '..', '..', 'hooks', 'gate-executor-stop.js');

describe('57-01 TRD identification is a lib module', () => {
  test('14: the hook re-exports the very same identifyTrd and readFirstUserPrompt function objects', () => {
    const hook = require(HOOK_PATH);
    assert.equal(typeof lib.identifyTrd, 'function');
    assert.equal(typeof lib.readFirstUserPrompt, 'function');
    assert.equal(hook.identifyTrd, lib.identifyTrd);
    assert.equal(hook.readFirstUserPrompt, lib.readFirstUserPrompt);
  });
});

describe('57-01 readFirstUserRecord / readFirstUserPrompt / repoRootOf', () => {
  let root;
  const repo = '/Users/someone/dev/demo-repo';
  const key = fx.projectKeyFor(repo);

  before(() => { root = fx.makeProjectsRoot(); });
  after(() => fs.rmSync(root, { recursive: true, force: true }));

  test('15a: readFirstUserRecord returns the parsed first user record, cwd included; readFirstUserPrompt its text', () => {
    const prompt = fx.executorPrompt('plan_id', { id: '99-01', objectiveDir: '99-demo', repoRoot: repo });
    const file = fx.writeSubagentTranscript(root, {
      projectKey: key,
      session: 'sess-first',
      agentId: 'a-first',
      description: 'Execute TRD 99-01',
      prompt,
      cwd: repo,
      records: fx.THREE_MESSAGES,
    });
    const rec = lib.readFirstUserRecord(file);
    assert.equal(rec.type, 'user');
    assert.equal(rec.cwd, repo);
    assert.equal(rec.sessionId, 'sess-first');
    assert.equal(rec.timestamp, '2026-10-01T00:00:00.000Z');
    assert.equal(rec.message.content, prompt);
    assert.equal(lib.readFirstUserPrompt(file), prompt);
  });

  test('15b: garbage and non-user lines before the user record are skipped; a missing file gives null', () => {
    const dir = path.join(root, 'raw');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'agent-raw.jsonl');
    fs.writeFileSync(file, [
      '{not json',
      JSON.stringify({ type: 'attachment', cwd: '/nowhere' }),
      JSON.stringify({ type: 'user', cwd: repo, message: { role: 'user', content: [{ type: 'text', text: 'PLAN_ID: 12-03' }] } }),
      JSON.stringify({ type: 'user', cwd: '/later', message: { role: 'user', content: 'later' } }),
    ].join('\n') + '\n');
    assert.equal(lib.readFirstUserRecord(file).cwd, repo);
    assert.equal(lib.readFirstUserPrompt(file), 'PLAN_ID: 12-03');
    assert.equal(lib.readFirstUserRecord(path.join(dir, 'missing.jsonl')), null);
    assert.equal(lib.readFirstUserPrompt(path.join(dir, 'missing.jsonl')), null);
  });

  test('15c: a first user record with empty content gives prompt null, while the record itself is still returned', () => {
    const file = fx.writeSubagentTranscript(root, {
      projectKey: key,
      session: 'sess-empty',
      agentId: 'a-empty',
      description: 'Execute TRD 99-01',
      prompt: '',
      cwd: repo,
    });
    assert.equal(lib.readFirstUserPrompt(file), null);
    const rec = lib.readFirstUserRecord(file);
    assert.equal(rec.type, 'user');
    assert.equal(rec.cwd, repo);
  });

  test('15d: repoRootOf reads an absolute REPO_ROOT line; a relative or missing one gives null', () => {
    assert.equal(lib.repoRootOf('REPO_ROOT:  /a/b\n'), '/a/b');
    assert.equal(lib.repoRootOf('<repo_and_base>\n  REPO_ROOT:\t/x/y/z\nPLAN_ID: 1-2\n'), '/x/y/z');
    assert.equal(lib.repoRootOf('REPO_ROOT:  relative/repo\n'), null);
    assert.equal(lib.repoRootOf('no root here'), null);
    assert.equal(lib.repoRootOf(''), null);
    assert.equal(lib.repoRootOf(null), null);
  });
});

describe('59-03 identification survives a --cwd preflight', () => {
  const preflight =
    'node ~/.claude/aoforge/bin/aof-tools.cjs --cwd /x/wt exec-context check --repo /x/r --base abc --id 59-03';

  test('8: a preflight line that carries --cwd before `exec-context check` still names the plan', () => {
    assert.deepEqual(lib.identifyTrd(preflight), { id: '59-03', repoRoot: null });
  });

  test('8b: the full dispatch block (CHECKOUT line, --cwd preflight) identifies the plan and its REPO_ROOT', () => {
    const prompt = [
      '<repo_and_base>',
      'REPO_ROOT:  /x/r',
      'WAVE_BASE:  abc',
      'PLAN_ID:    59-03',
      'CHECKOUT:   /x/wt',
      '',
      `  ${preflight}`,
      '</repo_and_base>',
    ].join('\n');
    assert.deepEqual(lib.identifyTrd(prompt), { id: '59-03', repoRoot: '/x/r' });
  });

  test('8c: a --cwd preflight naming a different id than PLAN_ID is still a contradiction (ambiguous -> null)', () => {
    const prompt = `PLAN_ID: 59-03\n${preflight.replace('--id 59-03', '--id 59-04')}\n`;
    assert.equal(lib.identifyTrd(prompt), null);
  });
});
