'use strict';

// The `/aoforge:todo` session-task-list contract (TRD 63-04, objective 63, BLTN-04 part 4).
//
// WHAT IT PINS. `/aoforge:todo` keeps the session task list as the in-session store of a todo and the
// todo files (or GitHub issues in store mode) as the durable archive. Two other modules read what the
// skill's prose writes into the session:
//   - todo-session.cjs (63-01) replays a transcript and finds a todo by its subject `Todo: <title>`,
//     its metadata key `aoforge_todo`, or its TodoWrite suffix `[todo:<stem>]`.
//   - todo-sync.cjs (63-02) merges those items into the archive (`aof-tools todo sync`), and the
//     todo-sync Stop hook (63-03) runs it when a turn ends.
// If the flow wording drifts from those three forms the sync silently stops seeing the todos, so this
// test holds the prose to them: the skill declares the tools, the add flow puts the session item in
// before the archive write, the list flow syncs first and treats "Work on it now" as in_progress, and
// no progress task anywhere borrows the `Todo: ` subject.
//
// Test list (outermost first):
//  1. skillCoverage for `todo` reports no missing and no forbidden built-in, and the SKILL.md
//     allowed-tools lists TaskCreate, TaskUpdate, TaskList and TodoWrite.
//  2. The SKILL.md <context> carries `Session: ${CLAUDE_SESSION_ID}`; neither workflow holds the
//     literal placeholder (a workflow the skill @-includes may not be substituted).
//  3. add-todo.md: the first TaskCreate( and the first TodoWrite( both come before the `todo add
//     --from` line; the TaskCreate call carries `subject="Todo: ` and `aoforge_todo`; the TodoWrite
//     call carries `[todo:`; the step says what happens with neither tool.
//  4. check-todos.md: `todo sync --session` comes before `init todos`; an `aof-tools.cjs commit`
//     naming `pending_commit` follows the sync; TaskList( appears; Work on it now has a TaskUpdate(
//     with status="in_progress", a TodoWrite( form, and keeps `todo complete` for the no-task-tools
//     case.
//  5. No skill or active workflow other than add-todo.md and check-todos.md has a TaskCreate( whose
//     subject starts with `Todo: `.
//  6. references/built-ins.md has a `## 5. Todo store` section naming `Todo: `, `aoforge_todo`,
//     `[todo:`, `todo sync` and the todo-sync Stop hook.
//
// Runtime model: read-only. The repo root is five levels up from bin/lib; a mirror install (no
// README.md there) skips the whole file.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { skillCoverage, scanSet, splitFrontmatter, parseToolList } = require('./builtin-audit.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_AOFORGE_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));
const SKILLS_DIR = path.join(REPO_ROOT, 'plugins', 'aoforge', 'skills');
const WORKFLOWS_DIR = path.join(REPO_ROOT, 'plugins', 'aoforge', 'aoforge', 'workflows');
const SKILL_PATH = path.join(SKILLS_DIR, 'todo', 'SKILL.md');
const ADD_PATH = path.join(WORKFLOWS_DIR, 'add-todo.md');
const CHECK_PATH = path.join(WORKFLOWS_DIR, 'check-todos.md');
const BUILTINS_PATH = path.join(REPO_ROOT, 'plugins', 'aoforge', 'aoforge', 'references', 'built-ins.md');

const PLACEHOLDER = '${CLAUDE_SESSION_ID}';
const TODO_SUBJECT_CALL_RE = /\bTaskCreate\(\s*subject\s*[:=]\s*["'`]Todo: /;

const read = (p) => fs.readFileSync(p, 'utf-8');
const linesOf = (text) => text.split(/\r?\n/);
const lineIndex = (lines, re) => lines.findIndex((l) => re.test(l));

/** The text of the first call of `tool` in `text`: from `Tool(` to its matching `)` (400 characters at most). */
function callAt(text, tool) {
  const open = text.search(new RegExp(String.raw`\b${tool}\(`));
  if (open === -1) return null;
  const start = open + tool.length;
  let depth = 0;
  for (let i = start; i < Math.min(text.length, start + 600); i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open, Math.min(text.length, start + 600));
}

/** The body of the `<step name="name">` element, or null. */
function stepBody(text, name) {
  const m = text.match(new RegExp(String.raw`<step name="${name}">([\s\S]*?)</step>`));
  return m ? m[1] : null;
}

describe('todo skill contract (63-04)', { skip: !IS_AOFORGE_CHECKOUT && 'mirror install: no README.md at the repo root' }, () => {
  test('1. skillCoverage reports no missing or forbidden built-in, and the skill declares the four session-list tools', () => {
    const cov = skillCoverage({ skillsDir: SKILLS_DIR, workflowsDir: WORKFLOWS_DIR, name: 'todo' });
    assert.deepEqual(cov.missing, [], `todo uses built-ins it does not declare: ${cov.missing.join(', ')}`);
    assert.deepEqual(cov.forbidden, []);
    const declared = parseToolList(splitFrontmatter(read(SKILL_PATH)).frontmatter, 'allowed-tools');
    for (const tool of ['TaskCreate', 'TaskUpdate', 'TaskList', 'TodoWrite']) {
      assert.ok(declared.includes(tool), `SKILL.md allowed-tools lacks ${tool} (declared: ${declared.join(', ')})`);
    }
    // The existing declarations stay.
    for (const tool of ['Read', 'Write', 'Bash', 'AskUserQuestion']) {
      assert.ok(declared.includes(tool), `SKILL.md allowed-tools lost ${tool}`);
    }
  });

  test('2. the skill context carries the session id line, and the workflows never hold the placeholder', () => {
    const skill = read(SKILL_PATH);
    const context = skill.match(/<context>([\s\S]*?)<\/context>/);
    assert.ok(context, 'SKILL.md has no <context> block');
    assert.ok(context[1].includes(`Session: ${PLACEHOLDER}`), 'the <context> block lacks `Session: ${CLAUDE_SESSION_ID}`');
    for (const p of [ADD_PATH, CHECK_PATH]) {
      assert.ok(!read(p).includes(PLACEHOLDER), `${path.basename(p)} contains the literal ${PLACEHOLDER}`);
    }
  });

  test('3. add-todo.md puts the session item in before the archive write, in both task-list forms', () => {
    const text = read(ADD_PATH);
    const lines = linesOf(text);
    const archive = lineIndex(lines, /todo add --from/);
    assert.ok(archive >= 0, 'add-todo.md has no `todo add --from` line');
    const taskCreate = lineIndex(lines, /\bTaskCreate\(/);
    const todoWrite = lineIndex(lines, /\bTodoWrite\(/);
    assert.ok(taskCreate >= 0, 'add-todo.md has no TaskCreate( call');
    assert.ok(todoWrite >= 0, 'add-todo.md has no TodoWrite( call');
    assert.ok(taskCreate < archive, `the first TaskCreate( (line ${taskCreate + 1}) is not before todo add --from (line ${archive + 1})`);
    assert.ok(todoWrite < archive, `the first TodoWrite( (line ${todoWrite + 1}) is not before todo add --from (line ${archive + 1})`);

    const create = callAt(text, 'TaskCreate');
    assert.ok(create.includes('subject="Todo: '), `the TaskCreate call has no subject="Todo: : ${create}`);
    assert.ok(create.includes('aoforge_todo'), `the TaskCreate call has no aoforge_todo metadata: ${create}`);
    const write = callAt(text, 'TodoWrite');
    assert.ok(write.includes('[todo:'), `the TodoWrite call has no [todo: suffix: ${write}`);

    const step = stepBody(text, 'session_item');
    assert.ok(step, 'add-todo.md has no <step name="session_item">');
    assert.match(step, /\bneither\b/i, 'the session_item step does not say what happens with neither tool');
  });

  test('4. check-todos.md syncs before it reads, shows the session status, and keeps the archive-only completion', () => {
    const text = read(CHECK_PATH);
    const lines = linesOf(text);
    const sync = lineIndex(lines, /todo sync --session/);
    const init = lineIndex(lines, /init todos/);
    assert.ok(sync >= 0, 'check-todos.md has no `todo sync --session` line');
    assert.ok(init >= 0, 'check-todos.md has no `init todos` line');
    assert.ok(sync < init, `todo sync --session (line ${sync + 1}) is not before init todos (line ${init + 1})`);

    const commit = lines.findIndex((l, i) => i > sync && /aof-tools\.cjs commit\b/.test(l) && /pending_commit/.test(lines.slice(i - 3, i + 4).join('\n')));
    assert.ok(commit > sync, 'no `aof-tools.cjs commit` naming pending_commit follows the sync');

    assert.ok(/\bTaskList\(/.test(text), 'check-todos.md has no TaskList( call');

    const action = stepBody(text, 'execute_action');
    assert.ok(action, 'check-todos.md has no <step name="execute_action">');
    const update = callAt(action, 'TaskUpdate');
    assert.ok(update && /status="in_progress"/.test(update), `Work on it now has no TaskUpdate with status="in_progress": ${update}`);
    assert.ok(/\bTodoWrite\(/.test(action) || /\bTodoWrite\b[\s\S]*in_progress/.test(action), 'Work on it now has no TodoWrite form');
    assert.ok(/todo complete/.test(action), 'Work on it now lost `todo complete` for the no-task-tools case');
  });

  test('5. no other skill or workflow creates a task with a `Todo: ` subject', () => {
    const owners = new Set([ADD_PATH, CHECK_PATH].map((p) => path.relative(REPO_ROOT, p).split(path.sep).join('/')));
    const offenders = scanSet(REPO_ROOT)
      .filter((f) => !owners.has(f.rel))
      .filter((f) => TODO_SUBJECT_CALL_RE.test(f.text))
      .map((f) => f.rel);
    assert.deepEqual(offenders, [], `progress tasks must not use a Todo: subject: ${offenders.join(', ')}`);
  });

  test('6. references/built-ins.md states the todo-store convention', () => {
    const text = read(BUILTINS_PATH);
    const m = text.match(/^## 5\. Todo store\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m);
    assert.ok(m, 'built-ins.md has no `## 5. Todo store` section');
    for (const needle of ['Todo: ', 'aoforge_todo', '[todo:', 'todo sync', 'todo-sync Stop hook']) {
      assert.ok(m[1].includes(needle), `the Todo store section does not name ${needle}`);
    }
    assert.ok(linesOf(text).length < 140, `built-ins.md is ${linesOf(text).length} lines, the limit is 140`);
  });
});
