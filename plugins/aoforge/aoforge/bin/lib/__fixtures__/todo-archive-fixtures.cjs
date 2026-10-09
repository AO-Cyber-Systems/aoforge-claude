'use strict';

// todo-archive-fixtures.cjs (TRD 63-02) — hand-built local-mode projects holding a todo archive in today's exact file
// shapes, plus a transcript directory for `todo sync`. Literal values only: no generated data.
//
//   pending todo     .aoforge/todos/pending/<stem>.md      `---` frontmatter on line 1 (what `todo add` writes)
//   completed todo   .aoforge/todos/completed/<stem>.md    `completed: <YYYY-MM-DD>` on the line BEFORE `---`
//                                                           (what `todo complete` prepends); `done/` is the old spelling
// Transcript text comes from todo-transcript-fixtures.cjs (63-01); this file builds no transcript records.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { NAMES } = require('../legacy-names.cjs');

// The planning-directory name the project builders write (TRD 72-05). The todo-sync hook resolves only the legacy name
// until 72-06 moves it onto the resolver, so its tests call setPlanningDir(LEGACY.planningDir) once at load; 72-06
// drops those calls. node --test runs each file in its own process, so the switch never leaks.
let PLANNING = NAMES.planningDir;
function setPlanningDir(name) {
  PLANNING = name;
}

/** Today's `todo add` file text for a todo. */
function todoFileText({ title, created = '2026-10-05T10:00:00.000Z', area = 'general', problem = 'P', solution = 'TBD' }) {
  return [
    '---',
    `created: ${created}`,
    `title: ${title}`,
    `area: ${area}`,
    'files: []',
    '---',
    '',
    '## Problem',
    '',
    problem,
    '',
    '## Solution',
    '',
    solution,
    '',
  ].join('\n');
}

const STATE_DIRS = { pending: 'pending', completed: 'completed', done: 'done' };

function git(dir, ...args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}

/**
 * A local-mode project in a fresh temp dir (realpath'd, so path comparisons hold on macOS).
 *   todos: [{ stem, title, state: 'pending'|'completed'|'done', body?, created? }]   `body` replaces the file text
 *   git:   init, identity, no signing, add and commit everything
 * -> { root, cleanup }
 */
function makeTodoProject({ commitDocs = true, git: withGit = false, todos = [] } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'todo-archive-')));
  const planning = path.join(root, PLANNING);
  fs.mkdirSync(planning, { recursive: true });
  fs.writeFileSync(path.join(planning, 'config.json'), `${JSON.stringify({ commit_docs: commitDocs }, null, 2)}\n`);
  fs.writeFileSync(path.join(planning, 'STATE.md'), '# Project State\n\nStub for the todo archive tests.\n');

  for (const todo of todos) {
    const state = todo.state || 'pending';
    if (!STATE_DIRS[state]) throw new Error(`unknown todo state: ${state}`);
    const dir = path.join(planning, 'todos', STATE_DIRS[state]);
    fs.mkdirSync(dir, { recursive: true });
    const text = typeof todo.body === 'string' ? todo.body : todoFileText({ title: todo.title, created: todo.created });
    const withDate = state === 'pending' ? text : `completed: 2026-10-05\n${text}`;
    fs.writeFileSync(path.join(dir, `${todo.stem}.md`), withDate);
  }

  if (withGit) {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'fixture@example.invalid');
    git(root, 'config', 'user.name', 'Fixture');
    git(root, 'config', 'commit.gpgsign', 'false');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'fixture: initial archive');
  }

  return {
    root,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/** Write `text` (a JSONL transcript) as `<dir>/<name>`; -> the absolute path. */
function writeTranscript(dir, name, text) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  return file;
}

/** A Claude Code projects root holding one session: `<root>/-tmp-scratch-project/<sessionId>.jsonl`. -> { root, transcript, cleanup } */
function makeProjectsRoot(sessionId, text) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'todo-projects-')));
  const transcript = writeTranscript(path.join(root, '-tmp-scratch-project'), `${sessionId}.jsonl`, text);
  return {
    root,
    transcript,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

module.exports = {
  setPlanningDir, todoFileText, makeTodoProject, writeTranscript, makeProjectsRoot };
