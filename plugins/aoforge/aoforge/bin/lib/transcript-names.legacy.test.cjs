'use strict';

// Test list (TRD 72-10, objective 72, INST-03): the transcript readers keep counting history written under the old
// names. Everything before objective 72 was recorded as the pre-rename agent types, skills, slash commands and gate
// texts; calibration (agent-overhead) and the session audit read that history, so the old names count exactly as the
// new ones do.
//
// 15. agent-overhead normalizeAgentType: 'devflow:planner', 'aoforge:planner' and 'df-planner' -> 'planner';
//     'Explore' -> null; 'devflow:executor' -> null (executors are not overhead); 'devflow:' -> null.
//     15b. indexOverheadTranscripts counts a 'devflow:verifier' spawn as a matched 'verifier' sample.
// 16. session-audit:
//     16a. classify maps each gate's legacy denial text and its new one to the same category id, including texts
//          that carry only the product-specific part (a truncated edit-gate line, the old CLI's commit advice, the
//          old changelog escape variable).
//     16b. A 'devflow:quick' Skill call after an edit-gate denial routes it, exactly as 'aoforge:quick' does.
//     16c. A typed '/devflow:' slash command and a legacy override phrase ('skip devflow') route it too.
//     16d. The Bash write gate replay excludes a 'devflow:executor' subagent transcript and a row attributed to a
//          'devflow:quick' skill, as it does for the new namespace.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ao = require('./agent-overhead.cjs');
const fx = require('./__fixtures__/transcript-fixtures.cjs');
const { classify, accumulate, summarize, newAccumulator, analyze } = require('./session-audit.cjs');
const { makeTrackedRepo } = require('./__fixtures__/tracked-repo.cjs');
const { applyGitTestEnv } = require('./__fixtures__/wiki-remote.cjs');
const { bashRow, skillToolRow, writeTranscriptTree, REPLAY_HISTORY } = require('./__fixtures__/bash-replay-fixtures.cjs');

// ─── 15. agent-overhead ─────────────────────────────────────────────────────

describe('15. agent-overhead normalizes both namespaces and the install prefix', () => {
  test('15: devflow:, aoforge: and df- planners are one agent; non-overhead and foreign types are null', () => {
    assert.equal(ao.normalizeAgentType('devflow:planner'), 'planner');
    assert.equal(ao.normalizeAgentType('aoforge:planner'), 'planner');
    assert.equal(ao.normalizeAgentType('df-planner'), 'planner');
    assert.equal(ao.normalizeAgentType('devflow:job-checker'), 'job-checker');
    assert.equal(ao.normalizeAgentType('Explore'), null);
    assert.equal(ao.normalizeAgentType('devflow:executor'), null);
    assert.equal(ao.normalizeAgentType('devflow:'), null);
    assert.equal(ao.normalizeAgentType('xdevflow:planner'), null);
  });

  describe('15b. a legacy-typed spawn is counted', () => {
    let root;
    let repo;
    before(() => {
      root = fx.makeProjectsRoot();
      repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aof-legacy-overhead-repo-')));
      fs.mkdirSync(path.join(repo, '.planning', 'objectives'), { recursive: true });
      fx.writeOverheadTranscript(root, {
        projectKey: fx.projectKeyFor(repo),
        session: 's1',
        agentId: 'v1',
        spawn: { ...fx.VERIFIER_SPAWN, agentType: 'devflow:verifier' },
        cwd: repo,
      });
    });
    after(() => {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(repo, { recursive: true, force: true });
    });

    test('15b: devflow:verifier is a matched verifier sample', () => {
      const { entries, counts } = ao.indexOverheadTranscripts({ root, projects: [{ root: repo, label: 'legacy-repo' }] });
      assert.equal(counts.spawns, 1);
      assert.equal(counts.matched, 1);
      assert.deepEqual(counts.by_agent, { verifier: 1 });
      assert.equal(entries[0].agent, 'verifier');
    });
  });
});

// ─── 16. session-audit ──────────────────────────────────────────────────────

describe('16a. session-audit classify: legacy and new gate texts share a category', () => {
  const pairs = [
    [
      'edit gate, full line',
      'DevFlow ambient mode active — direct Edit/Write/MultiEdit denied.',
      'AOForge ambient mode active — direct Edit/Write/MultiEdit denied.',
      'aoforge-edit-gate',
    ],
    [
      'edit gate, only the product-specific part',
      'DevFlow ambient mode active',
      'AOForge ambient mode active',
      'aoforge-edit-gate',
    ],
    [
      'commit gate, only the CLI advice',
      'Use `node ~/.claude/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>` so the commit is scoped to the active task/plan.',
      'Use `node ~/.claude/aoforge/bin/aof-tools.cjs commit "<msg>" --files <paths>` so the commit is scoped to the active task/plan.',
      'aoforge-commit-gate',
    ],
    [
      'changelog gate, only the escape variable',
      'Escape hatch: DEVFLOW_SKIP_CHANGELOG_GATE=1',
      'Escape hatch: AOFORGE_SKIP_CHANGELOG_GATE=1',
      'aoforge-changelog-gate',
    ],
  ];
  for (const [label, legacy, current, id] of pairs) {
    test(`16a: ${label}`, () => {
      assert.equal(classify(current), id, `new text: ${current}`);
      assert.equal(classify(legacy), id, `legacy text: ${legacy}`);
    });
  }
});

const P = '/repo/src/a.go';
const LEGACY_GATE_TEXT = 'DevFlow ambient mode active — direct Edit/Write/MultiEdit denied. ' +
  'To proceed, invoke a DevFlow skill, or include "skip devflow" or "just edit" in your prompt.';
const T = (n) => `2026-06-30T10:00:${String(n).padStart(2, '0')}Z`;

const editUse = (id, ts) => ({
  type: 'assistant', timestamp: ts,
  message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Write', input: { file_path: P, content: 'x' } }] },
});
const denial = (id, ts) => ({
  type: 'user', timestamp: ts,
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: LEGACY_GATE_TEXT }] },
});
const skillUse = (id, skill, ts) => ({
  type: 'assistant', timestamp: ts,
  message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Skill', input: { skill } }] },
});
const userText = (text, ts) => ({ type: 'user', timestamp: ts, message: { role: 'user', content: text } });

function gate(rows) {
  const acc = newAccumulator();
  for (const r of rows) accumulate(acc, r, 's1');
  return summarize(acc).edit_gate_bypass;
}
const outcomes = (g) => ({ denials: g.denials, bypasses: g.bypasses, routed: g.routed, abandoned: g.abandoned });
const denied = () => [editUse('e1', T(1)), denial('e1', T(2))];

describe('16b-16c. session-audit edit-gate routing accepts the old namespace', () => {
  test('16b: a devflow:quick Skill call routes the denial, as aoforge:quick does', () => {
    for (const skill of ['devflow:quick', 'aoforge:quick']) {
      assert.deepEqual(
        outcomes(gate([...denied(), skillUse('k1', skill, T(3))])),
        { denials: 1, bypasses: 0, routed: 1, abandoned: 0 },
        skill
      );
    }
  });

  test('16b: a foreign skill does not route (control)', () => {
    assert.deepEqual(
      outcomes(gate([...denied(), skillUse('k1', 'superpowers:brainstorming', T(3))])),
      { denials: 1, bypasses: 0, routed: 0, abandoned: 1 }
    );
  });

  test('16c: a typed /devflow: command and the legacy override phrase route the denial', () => {
    assert.deepEqual(
      outcomes(gate([...denied(), userText('<command-name>/devflow:quick</command-name>', T(3))])),
      { denials: 1, bypasses: 0, routed: 1, abandoned: 0 }
    );
    assert.deepEqual(
      outcomes(gate([...denied(), userText('skip devflow and fix the typo', T(3))])),
      { denials: 1, bypasses: 0, routed: 1, abandoned: 0 }
    );
  });
});

describe('16d. the Bash write gate replay excludes the old namespace', () => {
  let repo;
  let restoreEnv;
  let gitHome;
  const tmpDirs = [];
  let seq = 0;

  before(() => {
    gitHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aof-legacy-replay-home-'));
    restoreEnv = applyGitTestEnv(gitHome);
    repo = makeTrackedRepo({ history: REPLAY_HISTORY });
  });
  after(() => {
    repo.cleanup();
    restoreEnv();
    for (const d of [gitHome, ...tmpDirs]) fs.rmSync(d, { recursive: true, force: true });
  });

  const WRITE_A = 'echo x > src/a.js';
  const AT = '2026-09-05T00:00:00Z';
  const br = (extra = {}) => bashRow({ id: `b${++seq}`, command: WRITE_A, ts: AT, cwd: repo.root, ...extra });
  const replay = (spec) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aof-legacy-replay-tree-'));
    tmpDirs.push(d);
    return analyze([writeTranscriptTree(d, spec)]).bash_edit_gate;
  };

  test('16d: a devflow:executor subagent transcript is an own agent', () => {
    const g = replay({
      sessions: { s1: [] },
      subagents: { s1: [{ id: 'agent-1', agentType: 'devflow:executor', rows: [br({ isSidechain: true })] }] },
    });
    assert.equal(g.excluded.aoforge_agent, 1);
    assert.equal(g.ambient_bash_calls, 0);
  });

  test('16d: a row attributed to a devflow:quick skill is an own skill', () => {
    const g = replay({ sessions: { s1: [br({ attributionSkill: 'devflow:quick' })] } });
    assert.equal(g.excluded.aoforge_skill, 1);
    assert.equal(g.ambient_bash_calls, 0);
  });

  test('16d: a devflow:quick Skill call opens the skill window for later rows', () => {
    const g = replay({ sessions: { s1: [skillToolRow({ id: 'k1', skill: 'devflow:quick', ts: AT, cwd: repo.root }), br()] } });
    assert.equal(g.excluded.aoforge_skill, 1);
    assert.equal(g.ambient_bash_calls, 0);
  });

  test('16d: a general-purpose subagent stays ambient (control)', () => {
    const g = replay({
      sessions: { s1: [] },
      subagents: { s1: [{ id: 'agent-1', agentType: 'general-purpose', rows: [br({ isSidechain: true })] }] },
    });
    assert.equal(g.excluded.aoforge_agent, 0);
    assert.equal(g.ambient_bash_calls, 1);
  });
});
