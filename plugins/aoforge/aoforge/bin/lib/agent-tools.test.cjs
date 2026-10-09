'use strict';

/**
 * agent-tools.test.cjs — TRD 30-01
 *
 * Every tool an agent's instructions tell it to CALL must appear in that
 * agent's frontmatter `tools:` allowlist.
 *
 * The 2026-08-18 audit recorded 164 "No such tool available" results across 45
 * sessions — an agent being told to do something its allowlist forbids. The
 * failure is silent at authoring time and only shows up mid-run, so it needs a
 * mechanical guard rather than review.
 *
 * Scope is deliberately narrow: only an explicit `ToolName(` call in the body
 * counts. Prose like "read the file" is not evidence the Read tool is needed,
 * and treating it as such produced unusable noise.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..', '..', '..', 'agents');

const WORKFLOWS_DIR = path.join(__dirname, '..', '..', 'workflows');

// Tools whose call-form appears in AOForge agent prompts.
//
// Task / Agent (TRD 41-08, gap VER-30): spawning needs Task/Agent in tools:;
// subagents cannot spawn, so a subagent prompt that spawns is a defect, not a
// missing declaration. `\bTask\(` does not match `TaskCreate(`/`TaskUpdate(`.
const KNOWN_TOOLS = [
  'Read', 'Write', 'Edit', 'MultiEdit', 'Bash', 'Grep', 'Glob',
  'WebSearch', 'WebFetch', 'TaskCreate', 'TaskUpdate', 'AskUserQuestion',
  'Task', 'Agent',
];

const SPAWN_TOOLS = ['Task', 'Agent'];

function parseAgent(file) {
  const raw = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
  const parts = raw.split('---');
  const fm = parts[1] || '';
  const body = parts.slice(2).join('---');
  const m = /^tools:\s*(.+)$/m.exec(fm);
  const declared = m ? m[1].split(',').map(s => s.trim()) : [];
  return { declared, body };
}

const agentFiles = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'));

describe('TRD 30-01 — agent tool allowlists cover what the prompt calls', () => {
  for (const file of agentFiles) {
    test(`${file.replace(/\.md$/, '')}: every called tool is declared`, () => {
      const { declared, body } = parseAgent(file);
      // strip fenced code that is shell, not tool calls
      const called = KNOWN_TOOLS.filter(t => new RegExp(`\\b${t}\\(`).test(body));
      const missing = called.filter(t => !declared.includes(t));
      assert.deepEqual(
        missing, [],
        `${file} instructs ${missing.join(', ')} but does not declare ${missing.length > 1 ? 'them' : 'it'} in tools:`
      );
    });

    // TRD 41-08: `subagent_type=` is a spawn instruction even without a
    // literal `Task(` beside it.
    test(`${file.replace(/\.md$/, '')}: subagent_type= only in agents that can spawn`, () => {
      const { declared, body } = parseAgent(file);
      if (!/subagent_type\s*=/.test(body)) return;
      assert.ok(
        SPAWN_TOOLS.some(t => declared.includes(t)),
        `${file} passes subagent_type= but declares neither Task nor Agent in tools: ` +
        '(subagents cannot spawn; return a signal to the orchestrator instead)'
      );
    });
  }

  // TRD 41-08: the planner cannot spawn objective-researcher, so it returns
  // `## RESEARCH NEEDED` and the orchestrator runs the researcher. A return
  // header nobody handles would strand the run, so the contract is asserted.
  test('planner RESEARCH NEEDED return is handled by plan-objective and build', () => {
    const { body } = parseAgent('planner.md');
    if (!body.includes('## RESEARCH NEEDED')) return;
    const planObjective = fs.readFileSync(path.join(WORKFLOWS_DIR, 'plan-objective.md'), 'utf8');
    assert.ok(
      planObjective.includes('## RESEARCH NEEDED'),
      'planner.md returns ## RESEARCH NEEDED but plan-objective.md step 10 does not handle it'
    );
    const build = fs.readFileSync(path.join(WORKFLOWS_DIR, 'build.md'), 'utf8');
    assert.ok(
      build.includes('RESEARCH NEEDED'),
      'planner.md returns ## RESEARCH NEEDED but build.md does not route it to plan-objective step 10'
    );
  });

  test('every agent declares a non-empty tools list', () => {
    for (const file of agentFiles) {
      const { declared } = parseAgent(file);
      assert.ok(declared.length > 0, `${file} has no tools: line`);
    }
  });

  test('no agent declares a tool name with stray whitespace or an empty entry', () => {
    for (const file of agentFiles) {
      const { declared } = parseAgent(file);
      for (const d of declared) {
        assert.ok(d.length > 0, `${file}: empty entry in tools:`);
        assert.equal(d, d.trim(), `${file}: "${d}" has stray whitespace`);
      }
    }
  });
});
