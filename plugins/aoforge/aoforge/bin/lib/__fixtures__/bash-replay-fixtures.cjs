'use strict';

// Hand-built transcript pieces for the Bash write gate replay (TRD 60-05). No generated data and no real
// transcript content: every string below is written out by hand.
//
// Real row shape, as Claude Code writes it. An assistant row that calls Bash carries
//   { type: 'assistant', timestamp, cwd, isSidechain, attributionSkill?, message: { role, content: [tool_use] } }
// `cwd` is the directory the session was in when the row was written, `timestamp` is ISO-8601 UTC, and
// `attributionSkill` ('aoforge:quick', ...) is present only on rows written while a skill was active, from
// 2026-07 onward. It is omitted here when undefined, exactly as in real rows.
//
// Real subagent layout. A main session is `<project>/<session>.jsonl`. Its subagents live in
// `<project>/<session>/subagents/<agent-id>.jsonl`, with a sibling `<agent-id>.meta.json` such as
// `{"agentType":"aoforge:planner","description":"...","spawnDepth":1}`. The replay reads `agentType` from it.
//
//   bashRow({ id, command, ts, cwd, attributionSkill, isSidechain }) -> assistant row, one Bash tool_use
//   skillToolRow({ id, skill, ts, cwd })                              -> assistant row, one Skill tool_use
//   gateDenialRow({ toolUseId, text, ts })                            -> user row, one failed tool_result
//   writeTranscriptTree(root, { project, sessions, subagents })       -> root
//   REPLAY_HISTORY                                                    -> dated history for makeTrackedRepo

const fs = require('fs');
const path = require('path');

function bashRow({ id, command, ts, cwd, attributionSkill, isSidechain = false }) {
  const row = {
    type: 'assistant',
    isSidechain,
    timestamp: ts,
    cwd,
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] },
  };
  if (attributionSkill !== undefined) row.attributionSkill = attributionSkill;
  return row;
}

function skillToolRow({ id, skill, ts, cwd }) {
  return {
    type: 'assistant',
    isSidechain: false,
    timestamp: ts,
    cwd,
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Skill', input: { skill } }] },
  };
}

function gateDenialRow({ toolUseId, text, ts }) {
  return {
    type: 'user',
    timestamp: ts,
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, is_error: true, content: text }],
    },
  };
}

const toJsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');

/**
 * Write a transcript tree under `<root>/<project>`.
 *
 * @param {string} root
 * @param {{
 *   project?: string,
 *   sessions?: Record<string, object[]>,
 *   subagents?: Record<string, Array<{ id: string, agentType?: string, rows?: object[] }>>,
 * }} [spec]
 * @returns {string} root
 */
function writeTranscriptTree(root, { project = 'proj', sessions = {}, subagents = {} } = {}) {
  const dir = path.join(root, project);
  fs.mkdirSync(dir, { recursive: true });
  for (const [sid, rows] of Object.entries(sessions)) {
    fs.writeFileSync(path.join(dir, `${sid}.jsonl`), toJsonl(rows), 'utf8');
  }
  for (const [sid, agents] of Object.entries(subagents)) {
    const agentDir = path.join(dir, sid, 'subagents');
    fs.mkdirSync(agentDir, { recursive: true });
    for (const a of agents) {
      fs.writeFileSync(path.join(agentDir, `${a.id}.jsonl`), toJsonl(a.rows || []), 'utf8');
      if (a.agentType) {
        const meta = { agentType: a.agentType, description: 'fixture', spawnDepth: 1 };
        fs.writeFileSync(path.join(agentDir, `${a.id}.meta.json`), JSON.stringify(meta), 'utf8');
      }
    }
  }
  return root;
}

// What `makeTrackedRepo({ history })` commits, in order:
//   src/a.js     added 2026-09-01, still tracked
//   src/gone.js  added 2026-09-01, removed 2026-09-15
//   src/late.js  added 2026-09-10, still tracked
const REPLAY_HISTORY = [
  { at: '2026-09-01T00:00:00Z', add: { 'src/a.js': 'a\n', 'src/gone.js': 'gone\n' } },
  { at: '2026-09-10T00:00:00Z', add: { 'src/late.js': 'late\n' } },
  { at: '2026-09-15T00:00:00Z', remove: ['src/gone.js'] },
];

module.exports = { bashRow, skillToolRow, gateDenialRow, writeTranscriptTree, REPLAY_HISTORY };
