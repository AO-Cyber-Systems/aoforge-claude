'use strict';

// transcript-fixtures.cjs (TRD 57-01) — a hand-built Claude Code projects tree for the token reader tests.
//
// Layout reproduced literally from the real one (observed 2026-10-05):
//   <projectsRoot>/<project-key>/<session>/subagents/agent-<id>.jsonl
//   <projectsRoot>/<project-key>/<session>/subagents/agent-<id>.meta.json
// The first jsonl line is the user record carrying the prompt (a string), `cwd` and `sessionId`. Every assistant
// content block is its own record, and all records of one API message repeat the same `message.usage`; only the last
// one carries the final output_tokens. Literal prompt text and literal usage numbers only: no generated data.
//
// Every root is an fs.mkdtemp directory, realpath'd (macOS /var vs /private/var). Nothing here touches the real ~/.claude.

const fs = require('fs');
const os = require('os');
const path = require('path');

const FIXED_TIMESTAMP = '2026-10-01T00:00:00.000Z';

/** A realpath'd temp dir standing in for `~/.claude/projects`. */
function makeProjectsRoot() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-transcripts-')));
}

/** A realpath'd fake HOME with an empty `.claude/projects` under it. */
function makeFakeHome() {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-home-')));
  const projectsRoot = path.join(home, '.claude', 'projects');
  fs.mkdirSync(projectsRoot, { recursive: true });
  return { home, projectsRoot };
}

/** Claude Code's project key: the absolute session cwd with every non [A-Za-z0-9] char replaced by '-'. */
function projectKeyFor(absPath) {
  return absPath.replace(/[^A-Za-z0-9]/g, '-');
}

/** The content block kinds of a `blocks`-record message, in transcript order (the last one is the tool call). */
function blockKinds(blocks) {
  if (blocks <= 1) return ['tool_use'];
  if (blocks === 2) return ['text', 'tool_use'];
  return ['thinking', ...Array(blocks - 2).fill('text'), 'tool_use'];
}

function contentBlock(kind, msgId, i) {
  if (kind === 'thinking') return { type: 'thinking', thinking: 'Reading the TRD first.', signature: `sig-${msgId}-${i}` };
  if (kind === 'text') return { type: 'text', text: 'Running the scoped tests.' };
  return { type: 'tool_use', id: `toolu_${msgId}_${i}`, name: 'Bash', input: { command: 'npm test' } };
}

/**
 * The records of ONE API message: `blocks` records sharing `message.id`, each repeating the same input/cache usage.
 * Earlier records carry output_tokens 8; the last carries `output` and stop_reason 'tool_use'.
 */
function assistantRecords({ id, model = 'claude-opus-5-5', input, cacheWrite, cacheRead, output, blocks }) {
  const kinds = blockKinds(blocks);
  return kinds.map((kind, i) => {
    const last = i === kinds.length - 1;
    return {
      parentUuid: null,
      isSidechain: true,
      type: 'assistant',
      uuid: `${id}-rec-${i}`,
      timestamp: FIXED_TIMESTAMP,
      message: {
        model,
        id,
        type: 'message',
        role: 'assistant',
        content: [contentBlock(kind, id, i)],
        stop_reason: last ? 'tool_use' : null,
        usage: {
          input_tokens: input,
          cache_creation_input_tokens: cacheWrite,
          cache_read_input_tokens: cacheRead,
          output_tokens: last ? output : 8,
        },
      },
    };
  });
}

/**
 * The executor prompt shapes seen in history:
 *   plan_id        current orchestrator: objective tag, TRD path, REPO_ROOT / WAVE_BASE / PLAN_ID block
 *   objective_tag  older: `Execute plan <id> of objective <dir>.` only
 *   trd_path       `Execute TRD <repoRoot>/.planning/objectives/<dir>/<id>-<slug>-TRD.md`
 *   bare           no id at all; only the meta.json description names the TRD
 */
function executorPrompt(style, { id, objectiveDir, slug = 'demo', repoRoot } = {}) {
  const trdRel = `.planning/objectives/${objectiveDir}/${id}-${slug}-TRD.md`;
  switch (style) {
    case 'plan_id':
      return [
        '<objective>',
        `Execute plan ${id} of objective ${objectiveDir}.`,
        'Commit each task atomically.',
        '</objective>',
        '',
        '<plan_content>',
        'The TRD is committed and present in your worktree. Read it first, in full:',
        trdRel,
        '</plan_content>',
        '',
        '<repo_and_base>',
        `REPO_ROOT:  ${repoRoot}`,
        'WAVE_BASE:  baad3946',
        `PLAN_ID:    ${id}`,
        '</repo_and_base>',
      ].join('\n');
    case 'objective_tag':
      return [
        '<objective>',
        `Execute plan ${id} of objective ${objectiveDir}.`,
        'Commit each task atomically.',
        '</objective>',
      ].join('\n');
    case 'trd_path':
      return `Execute TRD ${repoRoot}/${trdRel}`;
    case 'bare':
      return 'Execute ONE TRD to completion. Everything you need is inlined below.';
    default:
      throw new Error(`executorPrompt: unknown style ${style}`);
  }
}

/**
 * Write `agent-<agentId>.jsonl` (user record, then `records`, then the raw `extraLines`) and its
 * `agent-<agentId>.meta.json` under `<projectsRoot>/<projectKey>/<session>/subagents/`. Returns the jsonl path.
 */
function writeSubagentTranscript(projectsRoot, {
  projectKey,
  session,
  agentId,
  agentType = 'devflow:executor',
  description = '',
  prompt = '',
  cwd,
  records = [],
  extraLines = [],
}) {
  const dir = path.join(projectsRoot, projectKey, session, 'subagents');
  fs.mkdirSync(dir, { recursive: true });
  const user = {
    parentUuid: null,
    isSidechain: true,
    agentId,
    type: 'user',
    message: { role: 'user', content: prompt },
    uuid: `${agentId}-user-0`,
    timestamp: FIXED_TIMESTAMP,
    userType: 'external',
    cwd,
    sessionId: session,
  };
  const lines = [JSON.stringify(user), ...records.map((r) => JSON.stringify(r)), ...extraLines];
  const file = path.join(dir, `agent-${agentId}.jsonl`);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  const meta = { agentType, description, toolUseId: `toolu_${agentId}`, spawnDepth: 1 };
  fs.writeFileSync(path.join(dir, `agent-${agentId}.meta.json`), JSON.stringify(meta));
  return file;
}

// The msg_A/B/C table of TRD 57-01 (model claude-opus-5-5). Deduped totals: input 7, cache_creation 19596,
// cache_read 121144, output 1370 → tokens_input 140747. A naive per-record sum gives a different number.
const THREE_MESSAGES = Object.freeze([
  ...assistantRecords({ id: 'msg_A', input: 2, cacheWrite: 17701, cacheRead: 27949, output: 225, blocks: 3 }),
  ...assistantRecords({ id: 'msg_B', input: 2, cacheWrite: 1895, cacheRead: 45650, output: 222, blocks: 2 }),
  ...assistantRecords({ id: 'msg_C', input: 3, cacheWrite: 0, cacheRead: 47545, output: 923, blocks: 3 }),
]);

module.exports = {
  FIXED_TIMESTAMP,
  makeProjectsRoot,
  makeFakeHome,
  projectKeyFor,
  assistantRecords,
  executorPrompt,
  writeSubagentTranscript,
  THREE_MESSAGES,
};
