'use strict';

/**
 * Hand-built fixture builders for the gate hooks' tests (TRD 44-03).
 *
 * No generated data and no real git: git state is simulated by writing marker
 * files/dirs inside a hand-made `.git` dir — MERGE_HEAD and CHERRY_PICK_HEAD,
 * plus `rebase-merge/` or `rebase-apply/`, which are the only rebase markers
 * that count as in progress (TRD 44-10). The `rebase-head` state writes a lone
 * REBASE_HEAD: it models a STALE marker git can leave behind after a rebase,
 * which must NOT read as a rebase in progress. A linked worktree is simulated
 * by a `.git` FILE carrying `gitdir: <main>/.git/worktrees/<name>`.
 *
 * Not a test file — no `*.test.js` glob picks it up.
 */

const fs = require('fs');
const path = require('path');

/** A fixed, hand-written object id — the content git writes into *_HEAD files. */
const FAKE_SHA = '0123456789abcdef0123456789abcdef01234567';

/**
 * In-progress git operation → the marker git leaves in the (per-worktree) git dir.
 * `kind: 'file'` markers hold a sha line; `kind: 'dir'` markers are empty dirs.
 */
const GIT_STATE_MARKERS = Object.freeze({
  merge: { name: 'MERGE_HEAD', kind: 'file' },
  'rebase-head': { name: 'REBASE_HEAD', kind: 'file' },
  'rebase-merge': { name: 'rebase-merge', kind: 'dir' },
  'rebase-apply': { name: 'rebase-apply', kind: 'dir' },
  'cherry-pick': { name: 'CHERRY_PICK_HEAD', kind: 'file' },
  none: null,
});

/**
 * The exact PreToolUse hook payload shape. `agent_id` / `agent_type` are only
 * present inside a subagent, so they are omitted (not set to undefined) when
 * not given. `tool_input` carries `file_path` for edit tools and `command` for
 * Bash — whichever was supplied.
 *
 * @param {object} [opts]
 * @param {string} [opts.tool='Bash']
 * @param {string} [opts.filePath]
 * @param {string} [opts.command]
 * @param {string} [opts.agentType]
 * @param {string} [opts.agentId]
 * @param {string} [opts.cwd]
 * @returns {object}
 */
function preToolUsePayload({ tool = 'Bash', filePath, command, agentType, agentId, cwd } = {}) {
  const toolInput = {};
  if (filePath !== undefined) toolInput.file_path = filePath;
  if (command !== undefined) toolInput.command = command;

  const payload = {
    hook_event_name: 'PreToolUse',
    tool_name: tool,
    tool_input: toolInput,
    session_id: 's-fixture',
    cwd: cwd !== undefined ? cwd : process.cwd(),
  };
  if (agentId !== undefined) payload.agent_id = agentId;
  if (agentType !== undefined) payload.agent_type = agentType;
  return payload;
}

/**
 * The initialized DevFlow shape gate-commits requires: `.planning/ROADMAP.md`
 * plus `.planning/objectives/`.
 *
 * @param {string} root
 * @returns {string} the `.planning` dir
 */
function makeDevflowProject(root) {
  const planningDir = path.join(root, '.planning');
  fs.mkdirSync(path.join(planningDir, 'objectives'), { recursive: true });
  fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap\n');
  return planningDir;
}

/**
 * Write the marker for `state` into an existing git dir.
 *
 * @param {string} gitDir
 * @param {keyof GIT_STATE_MARKERS} state
 */
function applyGitState(gitDir, state) {
  if (!Object.prototype.hasOwnProperty.call(GIT_STATE_MARKERS, state)) {
    throw new Error(`gate-fixtures: unknown git state "${state}"`);
  }
  const marker = GIT_STATE_MARKERS[state];
  if (!marker) return;
  const p = path.join(gitDir, marker.name);
  if (marker.kind === 'dir') {
    fs.mkdirSync(p, { recursive: true });
  } else {
    fs.writeFileSync(p, `${FAKE_SHA}\n`);
  }
}

/**
 * A hand-made `.git` directory at `root/.git` with the marker for `state`.
 *
 * @param {string} root
 * @param {object} [opts]
 * @param {'merge'|'rebase-head'|'rebase-merge'|'rebase-apply'|'cherry-pick'|'none'} [opts.state='none']
 * @returns {string} the git dir
 */
function makeGitDir(root, { state = 'none' } = {}) {
  const gitDir = path.join(root, '.git');
  fs.mkdirSync(gitDir, { recursive: true });
  fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
  applyGitState(gitDir, state);
  return gitDir;
}

/**
 * A linked-worktree fixture: `mainRoot/.git/worktrees/<name>/` (the
 * per-worktree git dir, holding the marker for `state`) and `wtRoot/.git` as a
 * FILE pointing at it.
 *
 * @param {string} mainRoot
 * @param {string} wtRoot
 * @param {string} name
 * @param {object} [opts]
 * @param {string} [opts.state='none']
 * @param {boolean} [opts.relative=false] - write a `gitdir:` relative to wtRoot
 * @returns {string} the per-worktree git dir
 */
function makeWorktree(mainRoot, wtRoot, name, { state = 'none', relative = false } = {}) {
  const wtGitDir = path.join(mainRoot, '.git', 'worktrees', name);
  fs.mkdirSync(wtGitDir, { recursive: true });
  fs.writeFileSync(path.join(wtGitDir, 'HEAD'), `${FAKE_SHA}\n`);
  fs.writeFileSync(path.join(wtGitDir, 'commondir'), '../..\n');
  applyGitState(wtGitDir, state);

  fs.mkdirSync(wtRoot, { recursive: true });
  const target = relative ? path.relative(wtRoot, wtGitDir) : wtGitDir;
  fs.writeFileSync(path.join(wtRoot, '.git'), `gitdir: ${target}\n`);
  return wtGitDir;
}

module.exports = {
  FAKE_SHA,
  GIT_STATE_MARKERS,
  preToolUsePayload,
  makeDevflowProject,
  makeGitDir,
  makeWorktree,
  applyGitState,
};
