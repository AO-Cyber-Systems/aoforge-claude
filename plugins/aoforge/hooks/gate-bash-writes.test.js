/**
 * Tests for the gate-bash-writes PreToolUse(Bash) hook (TRD 60-04).
 *
 * Subprocess e2e against a real, hermetic git repository (makeTrackedRepo, 60-03): the hook is spawned
 * with `process.execPath`, the payload on stdin, exactly as the harness does. Hand-built fixtures only.
 *
 *   1. GATE-01  every write form to a tracked source file is denied, and the reason names the file
 *   2. shipped default (no bashEditGate key) is whatever BASH_EDIT_GATE_DEFAULT maps to
 *   3. GATE-02  commands that only mention a write produce no output
 *   4. GATE-03  .planning/, *.md, untracked files, tmp and other repos produce no output
 *   5. GATE-04  every escape, with a control that proves the escape is what let the write through
 *   6. the .edit-override marker is consumed only by a write that would be gated
 *   7. no-ops: no project, not Bash, malformed stdin, empty command
 *   8. the payload cwd wins over the process cwd
 *   9. fail open when the libs are missing
 *  10. run() in process: cheapest-first order, git only when a candidate exists
 *
 * Every spawn gets a hermetic git env with AOFORGE_SKIP_EDIT_GATE and AOFORGE_ALLOW_RAW_COMMIT removed.
 */

'use strict';

const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'gate-bash-writes.js');
const { run } = require('./gate-bash-writes.js');
const { findPlanningDir: realFindPlanningDir } = require('./gate-edits.js');
const { preToolUsePayload } = require('./__fixtures__/gate-fixtures.js');
const { writeEditOverrideMarker, editOverrideMarkerPath } = require('./lib/edit-override.js');

const LIB_DIR = path.join(__dirname, '..', 'aoforge', 'bin', 'lib');
const { makeTrackedRepo } = require(path.join(LIB_DIR, '__fixtures__', 'tracked-repo.cjs'));
const { gitAvailable } = require(path.join(LIB_DIR, '__fixtures__', 'wiki-remote.cjs'));
const {
  BASH_EDIT_GATE_DEFAULT,
  BASH_GATE_CLASSIFIER,
  gitTrackedSet: realGitTrackedSet,
} = require(path.join(LIB_DIR, 'bash-write-gate.cjs'));

const hasGit = gitAvailable();

const FILES = {
  'src/a.js': 'a\n',
  'src/a.go': 'package a\n',
  'package.json': '{}\n',
  'README.md': '# readme\n',
  '.planning/STATE.md': '# state\n',
};

const cleanups = [];

function scratch(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function setGates(root, gates) {
  fs.writeFileSync(path.join(root, '.planning', 'config.json'), JSON.stringify(gates ? { gates } : {}));
}

function planningOf(root) {
  return path.join(root, '.planning');
}

function skillMarker(root, expiresAtMs) {
  const file = path.join(planningOf(root), '.skill-active');
  fs.writeFileSync(file, JSON.stringify({ skill: 'test', expires_at: new Date(expiresAtMs).toISOString() }));
  return file;
}

/** The env a hook spawn gets: hermetic git, and no escape hatches unless the test sets one. */
function hookEnv(repo, extra = {}) {
  const env = { ...repo.env };
  delete env.AOFORGE_SKIP_EDIT_GATE;
  delete env.AOFORGE_ALLOW_RAW_COMMIT;
  return { ...env, ...extra };
}

/**
 * Spawn the hook. `payload` is JSON-encoded onto stdin unless `input` (a raw string) is given.
 * Every spawn is also held to the hook contract: exit 0, nothing on stderr.
 */
function spawnHook(repo, { payload, input, cwd, env, hook = HOOK_PATH }) {
  const r = spawnSync(process.execPath, [hook], {
    input: input !== undefined ? input : JSON.stringify(payload),
    cwd: cwd || repo.root,
    env: env || hookEnv(repo),
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `the hook exits 0 on every path (stderr: ${r.stderr})`);
  assert.equal(r.stderr, '', 'nothing on stderr');
  return r;
}

/** A Bash call in `repo` (the payload cwd is the repo root unless `cwd` is given). */
function bash(repo, command, { cwd, agentType, env, hook } = {}) {
  const payload = preToolUsePayload({ tool: 'Bash', command, cwd: cwd || repo.root, agentType });
  return spawnHook(repo, { payload, env, hook });
}

function decision(r) {
  assert.notEqual(r.stdout, '', 'expected a decision, got no output');
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  return out.hookSpecificOutput;
}

function assertAllowed(r, why) {
  assert.equal(r.stdout, '', why || 'no output');
}

describe('gate-bash-writes hook', { skip: !hasGit && 'git is not available' }, () => {
  let repo;
  let tmpSrc;

  before(() => {
    repo = makeTrackedRepo({ files: FILES });
    cleanups.push(repo.cleanup);
    tmpSrc = scratch('bash-gate-src-');
    fs.writeFileSync(path.join(tmpSrc, 'x.js'), 'x\n');
  });

  after(() => {
    for (const fn of cleanups.splice(0)) fn();
  });

  beforeEach(() => {
    setGates(repo.root, { bashEditGate: 'strict' });
    for (const name of ['.skill-active', '.edit-override']) {
      fs.rmSync(path.join(planningOf(repo.root), name), { force: true });
    }
  });

  describe('1. GATE-01: a write to a tracked source file is denied', () => {
    const cases = [
      ['redirect', 'echo x > src/a.js', 'src/a.js'],
      ['heredoc opener redirect', "cat > src/a.go <<'EOF'\npackage a\nEOF", 'src/a.go'],
      ['tee', 'printf x | tee src/a.js', 'src/a.js'],
      ['sed -i', "sed -i 's/a/b/' src/a.js", 'src/a.js'],
      ['cp', () => `cp ${path.join(tmpSrc, 'x.js')} src/a.js`, 'src/a.js'],
      ['mv', () => `mv ${path.join(tmpSrc, 'x.js')} src/a.js`, 'src/a.js'],
      ['inline python', `python3 -c "open('src/a.js','w').write('x')"`, 'src/a.js'],
      ['inline node', `node -e "require('fs').writeFileSync('package.json','{}')"`, 'package.json'],
      ['cd then redirect', 'cd src && echo x > a.js', 'src/a.js'],
    ];
    for (const [label, command, file] of cases) {
      test(label, () => {
        const cmd = typeof command === 'function' ? command() : command;
        const d = decision(bash(repo, cmd));
        assert.equal(d.permissionDecision, 'deny');
        assert.match(d.permissionDecisionReason, BASH_GATE_CLASSIFIER);
        assert.ok(d.permissionDecisionReason.includes(file), `the reason names ${file}: ${d.permissionDecisionReason}`);
      });
    }
  });

  describe('2. the shipped default', () => {
    test('with no bashEditGate key the decision is the one BASH_EDIT_GATE_DEFAULT maps to', () => {
      setGates(repo.root, null);
      const d = decision(bash(repo, 'echo x > src/a.js'));
      assert.equal(d.permissionDecision, BASH_EDIT_GATE_DEFAULT === 'strict' ? 'deny' : 'ask');
      assert.match(d.permissionDecisionReason, BASH_GATE_CLASSIFIER);
    });

    test('an unrecognised bashEditGate value is the default too', () => {
      setGates(repo.root, { bashEditGate: 'loud' });
      const d = decision(bash(repo, 'echo x > src/a.js'));
      assert.equal(d.permissionDecision, BASH_EDIT_GATE_DEFAULT === 'strict' ? 'deny' : 'ask');
    });
  });

  describe('3. GATE-02: a mention of a write is not a write', () => {
    const cases = [
      ['heredoc body', "cat <<'EOF'\nsed -i 's/a/b/' src/a.js\nEOF"],
      ['quoted pattern', 'grep -n "> src/a.js" README.md'],
      ['quoted echo', 'echo "writing src/a.js"'],
      ['fd duplication and a pipe', 'npm test 2>&1 | tail -5'],
      ['comment', 'ls # echo x > src/a.js'],
    ];
    for (const [label, command] of cases) {
      test(label, () => assertAllowed(bash(repo, command)));
    }
  });

  describe('4. GATE-03: paths the gate never covers', () => {
    test('.planning/', () => assertAllowed(bash(repo, 'echo x >> .planning/STATE.md')));
    test('markdown', () => assertAllowed(bash(repo, 'echo x >> README.md')));
    test('an untracked file', () => assertAllowed(bash(repo, 'echo x > src/new.js')));

    test('the system tmp dir', () => {
      const dir = scratch('bash-gate-tmp-');
      assertAllowed(bash(repo, `echo x > ${path.join(dir, 'out.txt')}`));
    });

    test('a scratch directory outside the repo', () => {
      const dir = scratch('bash-gate-scratch-');
      assertAllowed(bash(repo, `cp src/a.js ${path.join(dir, 'a.js')}`));
    });

    test('another repository with a tracked a.js', () => {
      const other = makeTrackedRepo({ files: { 'a.js': 'a\n' } });
      cleanups.push(other.cleanup);
      assertAllowed(bash(repo, `cd ${other.root} && echo x > a.js`));
    });
  });

  describe('5. GATE-04: the escapes', () => {
    const write = 'echo x > src/a.js';

    test('(a) a live skill marker; an expired one does not count', () => {
      skillMarker(repo.root, Date.now() - 60 * 60 * 1000);
      assert.equal(decision(bash(repo, write)).permissionDecision, 'deny');
      skillMarker(repo.root, Date.now() + 60 * 60 * 1000);
      assertAllowed(bash(repo, write));
    });

    test("(b) the main checkout's marker, with the payload cwd in a linked worktree", () => {
      const wt = path.join(scratch('bash-gate-wt-'), 'wt');
      repo.git(['worktree', 'add', wt, '-b', 'wt']);
      cleanups.push(() => repo.run(['worktree', 'remove', '--force', wt]));
      assert.ok(fs.existsSync(path.join(wt, 'src', 'a.js')), 'the worktree checks out src/a.js');
      setGates(wt, { bashEditGate: 'strict' });
      assert.ok(!fs.existsSync(path.join(planningOf(wt), '.skill-active')), 'the worktree has no marker of its own');

      assert.equal(decision(bash(repo, write, { cwd: wt })).permissionDecision, 'deny', 'control: no marker, denied');
      skillMarker(repo.root, Date.now() + 60 * 60 * 1000);
      assertAllowed(bash(repo, write, { cwd: wt }));
    });

    test('(c) an aoforge agent; another agent type is still gated', () => {
      assertAllowed(bash(repo, write, { agentType: 'aoforge:executor' }));
      assert.equal(decision(bash(repo, write, { agentType: 'general-purpose' })).permissionDecision, 'deny');
    });

    test('(c) an aoforge agent is allowed in warn mode too, never asked', () => {
      setGates(repo.root, { bashEditGate: 'warn' });
      assertAllowed(bash(repo, write, { agentType: 'aoforge:executor' }));
    });

    test('(d) a fresh .edit-override marker lets the write through and is consumed', () => {
      assert.ok(writeEditOverrideMarker(planningOf(repo.root)));
      assertAllowed(bash(repo, write));
      assert.ok(!fs.existsSync(editOverrideMarkerPath(planningOf(repo.root))), 'the marker is gone');
    });

    test('(e) AOFORGE_SKIP_EDIT_GATE=1', () => {
      assert.equal(decision(bash(repo, write)).permissionDecision, 'deny', 'control');
      assertAllowed(bash(repo, write, { env: hookEnv(repo, { AOFORGE_SKIP_EDIT_GATE: '1' }) }));
    });

    test('(f) gates.editGate off', () => {
      setGates(repo.root, { editGate: 'off', bashEditGate: 'strict' });
      assertAllowed(bash(repo, write));
    });

    test('(g) gates.bashEditGate off', () => {
      setGates(repo.root, { bashEditGate: 'off' });
      assertAllowed(bash(repo, write));
    });

    test('(h) gates.editGate warn turns a strict bashEditGate into ask', () => {
      setGates(repo.root, { editGate: 'warn', bashEditGate: 'strict' });
      const d = decision(bash(repo, write));
      assert.equal(d.permissionDecision, 'ask');
      assert.match(d.permissionDecisionReason, BASH_GATE_CLASSIFIER);
    });

    test('(i) gates.bashEditGate warn is ask', () => {
      setGates(repo.root, { bashEditGate: 'warn' });
      assert.equal(decision(bash(repo, write)).permissionDecision, 'ask');
    });
  });

  describe('6. the override marker is consumed only by a write that would be gated', () => {
    const marker = () => editOverrideMarkerPath(planningOf(repo.root));

    test('ls leaves it, the first gated write eats it, the second is denied', () => {
      assert.ok(writeEditOverrideMarker(planningOf(repo.root)));

      assertAllowed(bash(repo, 'ls -la'));
      assert.ok(fs.existsSync(marker()), 'ls left the marker for the next gated write');

      assertAllowed(bash(repo, 'echo x > src/a.js'));
      assert.ok(!fs.existsSync(marker()), 'the gated write consumed it');

      assert.equal(decision(bash(repo, 'echo x > src/a.js')).permissionDecision, 'deny');
    });

    test('a write that is not gated leaves it too', () => {
      assert.ok(writeEditOverrideMarker(planningOf(repo.root)));
      assertAllowed(bash(repo, 'echo x >> README.md'));
      assertAllowed(bash(repo, 'echo x > src/new.js'));
      assert.ok(fs.existsSync(marker()), 'markdown and untracked writes left the marker');
    });
  });

  describe('7. no-ops', () => {
    test('a directory with no project', () => {
      const dir = scratch('bash-gate-noplan-');
      assertAllowed(bash(repo, 'echo x > src/a.js', { cwd: dir }));
    });

    test('a tool that is not Bash', () => {
      const payload = preToolUsePayload({ tool: 'Edit', filePath: path.join(repo.root, 'src', 'a.js'), cwd: repo.root });
      assertAllowed(spawnHook(repo, { payload }));
    });

    test('malformed stdin', () => {
      assertAllowed(spawnHook(repo, { input: 'not json' }));
    });

    test('an empty command', () => {
      assertAllowed(bash(repo, ''));
    });

    test('a Bash call with no command', () => {
      const payload = preToolUsePayload({ tool: 'Bash', cwd: repo.root });
      assertAllowed(spawnHook(repo, { payload }));
    });
  });

  describe('8. the payload cwd wins over the process cwd', () => {
    test('spawned from the tmp dir, a relative target means the payload cwd', () => {
      const payload = preToolUsePayload({ tool: 'Bash', command: 'echo x > src/a.js', cwd: repo.root });
      const d = decision(spawnHook(repo, { payload, cwd: os.tmpdir() }));
      assert.equal(d.permissionDecision, 'deny');
      assert.ok(d.permissionDecisionReason.includes('src/a.js'));
    });
  });

  describe('9. fail open', () => {
    test('with the aoforge libs missing the hook allows everything and exits 0', () => {
      const dir = scratch('bash-gate-failopen-');
      const hooks = path.join(dir, 'hooks');
      fs.mkdirSync(path.join(hooks, 'lib'), { recursive: true });
      fs.copyFileSync(HOOK_PATH, path.join(hooks, 'gate-bash-writes.js'));
      fs.copyFileSync(path.join(__dirname, 'gate-edits.js'), path.join(hooks, 'gate-edits.js'));
      fs.copyFileSync(path.join(__dirname, 'lib', 'edit-override.js'), path.join(hooks, 'lib', 'edit-override.js'));
      assert.ok(!fs.existsSync(path.join(dir, 'aoforge')), 'no aoforge sibling');

      const copy = path.join(hooks, 'gate-bash-writes.js');
      assert.equal(decision(bash(repo, 'echo x > src/a.js')).permissionDecision, 'deny', 'control: the real hook denies');
      assertAllowed(bash(repo, 'echo x > src/a.js', { hook: copy }));
    });
  });

  describe('10. run() in process', () => {
    const quietEnv = () => hookEnv(repo);

    function spies() {
      const calls = { planning: [], tracked: [] };
      const deps = {
        findPlanningDir: (dir) => {
          calls.planning.push(dir);
          return realFindPlanningDir(dir);
        },
        gitTrackedSet: (root, abs) => {
          calls.tracked.push({ root, abs });
          return realGitTrackedSet(root, abs, { env: repo.env });
        },
      };
      return { calls, deps };
    }

    const input = (command, extra = {}) => ({
      tool_name: 'Bash',
      tool_input: { command },
      cwd: repo.root,
      ...extra,
    });

    test('ls -la returns null before the project or git is touched', () => {
      const { calls, deps } = spies();
      assert.equal(run(input('ls -la'), { cwd: os.tmpdir(), env: quietEnv(), deps }), null);
      assert.deepEqual(calls.planning, []);
      assert.deepEqual(calls.tracked, []);
    });

    test('a markdown write never asks git', () => {
      const { calls, deps } = spies();
      assert.equal(run(input('echo x > README.md'), { cwd: os.tmpdir(), env: quietEnv(), deps }), null);
      assert.equal(calls.planning.length, 1, 'the project was looked up');
      assert.deepEqual(calls.tracked, []);
    });

    test('an aoforge agent never asks git', () => {
      const { calls, deps } = spies();
      const out = run(input('echo x > src/a.js', { agent_type: 'aoforge:executor' }), {
        cwd: os.tmpdir(), env: quietEnv(), deps,
      });
      assert.equal(out, null);
      assert.deepEqual(calls.tracked, []);
    });

    test('control: a write to a tracked file asks git once and is denied', () => {
      const { calls, deps } = spies();
      const out = run(input('echo x > src/a.js'), { cwd: os.tmpdir(), env: quietEnv(), deps });
      assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
      assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
      assert.equal(calls.tracked.length, 1);
      assert.deepEqual(calls.tracked[0].abs, [path.join(repo.root, 'src', 'a.js')]);
    });

    test('AOFORGE_SKIP_EDIT_GATE in the env passed to run() skips everything', () => {
      const { calls, deps } = spies();
      const env = hookEnv(repo, { AOFORGE_SKIP_EDIT_GATE: '1' });
      assert.equal(run(input('echo x > src/a.js'), { cwd: os.tmpdir(), env, deps }), null);
      assert.deepEqual(calls.planning, []);
      assert.deepEqual(calls.tracked, []);
    });

    test('a relative payload cwd is ignored in favour of the process cwd', () => {
      const { deps } = spies();
      const out = run(input('echo x > src/a.js', { cwd: 'relative/dir' }), { cwd: repo.root, env: quietEnv(), deps });
      assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    });
  });
});
