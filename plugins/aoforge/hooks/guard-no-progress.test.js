'use strict';

/**
 * guard-no-progress.test.js — TRD 28-04, reworked in quick task 25
 *
 * Subprocess tests: the hook is only useful if it behaves correctly when the
 * harness runs it, so these drive the real binary with real payloads.
 *
 * State no longer lives in <project>/.aoforge/. It is one file per session under
 * AOFORGE_PROGRESS_GUARD_DIR (default ~/.claude/aoforge/state/progress-guard/).
 * Every test points that override at a temp dir — run() refuses to spawn the hook
 * without it, so no test can ever write to the real ~/.claude.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.join(__dirname, 'guard-no-progress.js');
const { IGNORED_TOOLS, SESSION_TTL_MS } = require('./guard-no-progress.js');

const HOUR = 60 * 60 * 1000;

/**
 * A scratch world: <root>/proj is an AOForge project (has .aoforge/), and
 * <root>/state/pg is where the hook is told to keep its state.
 * `env` is what every run() must pass.
 */
function mkWorld() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'npg-'));
  const project = path.join(root, 'proj');
  fs.mkdirSync(path.join(project, '.aoforge'), { recursive: true });
  const stateDir = path.join(root, 'state', 'pg');
  return {
    root,
    project,
    stateDir,
    env: { AOFORGE_PROGRESS_GUARD_DIR: stateDir },
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); },
  };
}

function payload({ tool = 'Bash', input = { command: 'go test ./...' }, session = 's1', cwd }) {
  return JSON.stringify({
    session_id: session,
    hook_event_name: 'PreToolUse',
    cwd,
    tool_name: tool,
    tool_input: input,
  });
}

function run(cwd, body, env) {
  assert.ok(
    env && env.AOFORGE_PROGRESS_GUARD_DIR,
    'every test must pass AOFORGE_PROGRESS_GUARD_DIR — tests must never touch the real ~/.claude'
  );
  const r = spawnSync(process.execPath, [HOOK], {
    cwd, input: body, encoding: 'utf8', env: { ...process.env, ...env },
  });
  let decision = null;
  if (r.stdout && r.stdout.trim()) {
    try { decision = JSON.parse(r.stdout).hookSpecificOutput.permissionDecision; } catch { /* ignore */ }
  }
  return { decision, stderr: r.stderr.trim(), stdout: r.stdout.trim(), status: r.status };
}

function ageFile(file, ms) {
  const t = new Date(Date.now() - ms);
  fs.utimesSync(file, t, t);
}

function listDir(dir) {
  try { return fs.readdirSync(dir).sort(); } catch { return []; }
}

describe('guard-no-progress — escalation ladder', () => {
  test('1. warns on the 3rd identical call and asks on the 5th', () => {
    const w = mkWorld();
    try {
      const seen = [];
      for (let i = 0; i < 6; i++) seen.push(run(w.project, payload({ cwd: w.project }), w.env));
      assert.equal(seen[0].decision, null, 'call 1 must be silent');
      assert.equal(seen[1].decision, null, 'call 2 must be silent');
      assert.ok(seen[2].stderr.length > 0, 'call 3 must warn on stderr');
      assert.equal(seen[2].decision, null, 'call 3 must NOT block');
      assert.equal(seen[4].decision, 'ask', 'call 5 must escalate to the human');
      assert.equal(seen[5].decision, null, 'call 6 must not re-fire — one prompt per threshold');
    } finally { w.cleanup(); }
  });

  test('a different command resets the streak', () => {
    const w = mkWorld();
    try {
      for (let i = 0; i < 4; i++) run(w.project, payload({ cwd: w.project }), w.env);
      const varied = run(w.project, payload({ cwd: w.project, input: { command: 'npm test' } }), w.env);
      assert.equal(varied.decision, null);
      assert.equal(varied.stderr, '', 'varying the approach is progress, not a loop');
      // and the counter really restarted
      const next = run(w.project, payload({ cwd: w.project, input: { command: 'npm test' } }), w.env);
      assert.equal(next.decision, null);
    } finally { w.cleanup(); }
  });

  test('separate sessions do not contaminate each other', () => {
    const w = mkWorld();
    try {
      for (let i = 0; i < 4; i++) run(w.project, payload({ cwd: w.project, session: 'A' }), w.env);
      const other = run(w.project, payload({ cwd: w.project, session: 'B' }), w.env);
      assert.equal(other.decision, null);
      assert.equal(other.stderr, '', 'session B is on its first call');
    } finally { w.cleanup(); }
  });

  test('4. two interleaved sessions each trip at their own 3rd and 5th call', () => {
    const w = mkWorld();
    try {
      const seen = { s1: [], s2: [] };
      for (let i = 0; i < 5; i++) {
        for (const session of ['s1', 's2']) {
          seen[session].push(run(w.project, payload({ cwd: w.project, session }), w.env));
        }
      }
      for (const session of ['s1', 's2']) {
        const calls = seen[session];
        assert.equal(calls[0].stderr, '', `${session} call 1 silent`);
        assert.equal(calls[1].stderr, '', `${session} call 2 silent`);
        assert.ok(calls[2].stderr.length > 0, `${session} call 3 must warn`);
        assert.equal(calls[2].decision, null, `${session} call 3 must not block`);
        assert.equal(calls[4].decision, 'ask', `${session} call 5 must ask`);
      }
    } finally { w.cleanup(); }
  });
});

describe('guard-no-progress — state lives outside the repo', () => {
  test('2. never writes .aoforge/.progress-guard.json; writes <stateDir>/s1.json', () => {
    const w = mkWorld();
    try {
      run(w.project, payload({ cwd: w.project }), w.env);
      assert.equal(
        fs.existsSync(path.join(w.project, '.aoforge', '.progress-guard.json')), false,
        'the legacy in-repo file must not be created'
      );
      assert.deepEqual(listDir(path.join(w.project, '.aoforge')), [], '.aoforge/ must stay untouched');
      const file = path.join(w.stateDir, 's1.json');
      assert.ok(fs.existsSync(file), 'state must land in the state dir');
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.deepEqual(Object.keys(parsed).sort(), ['guard', 'project', 'updated']);
      assert.equal(typeof parsed.updated, 'number');
      assert.equal(parsed.project, fs.realpathSync(w.project));
      assert.equal(typeof parsed.guard.streak, 'number');
    } finally { w.cleanup(); }
  });

  test('never modifies a pre-existing legacy .aoforge/.progress-guard.json', () => {
    const w = mkWorld();
    try {
      const legacy = path.join(w.project, '.aoforge', '.progress-guard.json');
      fs.writeFileSync(legacy, '{"old":"data"}');
      const before = fs.statSync(legacy).mtimeMs;
      for (let i = 0; i < 3; i++) run(w.project, payload({ cwd: w.project }), w.env);
      assert.equal(fs.readFileSync(legacy, 'utf8'), '{"old":"data"}');
      assert.equal(fs.statSync(legacy).mtimeMs, before);
    } finally { w.cleanup(); }
  });

  test('3. two sessions produce two files and neither holds the other\'s data', () => {
    const w = mkWorld();
    try {
      run(w.project, payload({ cwd: w.project, session: 's1', tool: 'Bash', input: { command: 'only-in-s1' } }), w.env);
      run(w.project, payload({ cwd: w.project, session: 's2', tool: 'Grep', input: { pattern: 'only-in-s2' } }), w.env);
      assert.deepEqual(listDir(w.stateDir), ['s1.json', 's2.json']);

      const raw1 = fs.readFileSync(path.join(w.stateDir, 's1.json'), 'utf8');
      const raw2 = fs.readFileSync(path.join(w.stateDir, 's2.json'), 'utf8');
      const sig1 = JSON.parse(raw1).guard.last;
      const sig2 = JSON.parse(raw2).guard.last;
      assert.notEqual(sig1, sig2);
      assert.ok(!raw1.includes(sig2), 's1.json must not contain s2\'s signature');
      assert.ok(!raw1.includes('Grep'), 's1.json must not contain s2\'s tool');
      assert.ok(!raw2.includes(sig1), 's2.json must not contain s1\'s signature');
    } finally { w.cleanup(); }
  });

  test('5. an unsafe session id maps to a safe filename inside the state dir', () => {
    const w = mkWorld();
    try {
      fs.mkdirSync(w.stateDir, { recursive: true });
      const r = run(w.project, payload({ cwd: w.project, session: '../evil/x y' }), w.env);
      assert.equal(r.status, 0);

      const written = listDir(w.stateDir);
      assert.equal(written.length, 1, `expected exactly one file in the state dir, got ${JSON.stringify(written)}`);
      assert.match(written[0], /^[A-Za-z0-9_-]+\.json$/);

      // nothing escaped: the parents hold only what the fixture created
      assert.deepEqual(listDir(path.dirname(w.stateDir)), ['pg']);
      assert.deepEqual(listDir(w.root), ['proj', 'state']);
      assert.deepEqual(listDir(w.project), ['.aoforge']);
      assert.deepEqual(listDir(path.join(w.project, '.aoforge')), []);
      assert.equal(fs.existsSync(path.join(w.root, 'evil')), false);
    } finally { w.cleanup(); }
  });

  test('a missing session id is recorded as "unknown"', () => {
    const w = mkWorld();
    try {
      const body = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'x' } });
      run(w.project, body, w.env);
      assert.deepEqual(listDir(w.stateDir), ['unknown.json']);
    } finally { w.cleanup(); }
  });
});

describe('guard-no-progress — stale sibling pruning', () => {
  test('6. the first call of a new session removes stale .json siblings and keeps the rest', () => {
    const w = mkWorld();
    try {
      fs.mkdirSync(w.stateDir, { recursive: true });
      const old = path.join(w.stateDir, 'old.json');
      const fresh = path.join(w.stateDir, 'fresh.json');
      const note = path.join(w.stateDir, 'note.txt');
      fs.writeFileSync(old, '{}');
      fs.writeFileSync(fresh, '{}');
      fs.writeFileSync(note, 'keep');
      ageFile(old, 25 * HOUR);
      ageFile(note, 25 * HOUR);

      run(w.project, payload({ cwd: w.project, session: 'brand-new' }), w.env);

      assert.equal(fs.existsSync(old), false, 'stale session file must be pruned');
      assert.equal(fs.existsSync(fresh), true, 'fresh session file must survive');
      assert.equal(fs.existsSync(note), true, 'non-json files are never pruned');
      assert.equal(fs.existsSync(path.join(w.stateDir, 'brand-new.json')), true);
    } finally { w.cleanup(); }
  });

  test('pruning runs once per session — a later call does not sweep again', () => {
    const w = mkWorld();
    try {
      run(w.project, payload({ cwd: w.project, session: 'S' }), w.env); // first call: sweeps
      const late = path.join(w.stateDir, 'late-stale.json');
      fs.writeFileSync(late, '{}');
      ageFile(late, 25 * HOUR);

      run(w.project, payload({ cwd: w.project, session: 'S' }), w.env); // not the first call
      assert.equal(fs.existsSync(late), true, 'only a session\'s first write may prune');

      run(w.project, payload({ cwd: w.project, session: 'T' }), w.env); // T's first call
      assert.equal(fs.existsSync(late), false, 'a new session\'s first call prunes');
    } finally { w.cleanup(); }
  });

  test('the TTL constant is 24h', () => {
    assert.equal(SESSION_TTL_MS, 24 * HOUR);
  });
});

describe('guard-no-progress — fails open', () => {
  test('no .aoforge/ anywhere -> silent no-op, nothing written', () => {
    const w = mkWorld();
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'npg-noplan-'));
    try {
      for (let i = 0; i < 6; i++) {
        const r = run(bare, payload({ cwd: bare }), w.env);
        assert.equal(r.decision, null, 'must never gate outside an AOForge project');
      }
      assert.deepEqual(listDir(w.stateDir), [], 'no state for a non-AOForge directory');
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
      w.cleanup();
    }
  });

  test('malformed stdin -> silent no-op, exit 0, nothing written', () => {
    const w = mkWorld();
    try {
      const r = run(w.project, 'not json at all', w.env);
      assert.equal(r.decision, null);
      assert.equal(r.status, 0);
      assert.deepEqual(listDir(w.stateDir), []);
    } finally { w.cleanup(); }
  });

  test('7. state dir is a regular file -> exit 0, no decision, nothing on stderr', () => {
    const w = mkWorld();
    try {
      const blocker = path.join(w.root, 'i-am-a-file');
      fs.writeFileSync(blocker, 'not a directory');
      const env = { AOFORGE_PROGRESS_GUARD_DIR: blocker };
      for (let i = 0; i < 3; i++) {
        const r = run(w.project, payload({ cwd: w.project }), env);
        assert.equal(r.status, 0);
        assert.equal(r.decision, null);
        assert.equal(r.stderr, '', `must not throw or warn on stderr; got: ${r.stderr}`);
      }
      assert.equal(fs.readFileSync(blocker, 'utf8'), 'not a directory', 'the blocking file is left alone');
    } finally { w.cleanup(); }
  });

  test('8. a corrupt session file is recovered from, not fatal', () => {
    const w = mkWorld();
    try {
      fs.mkdirSync(w.stateDir, { recursive: true });
      const file = path.join(w.stateDir, 's1.json');
      fs.writeFileSync(file, '{{{ broken');
      const r = run(w.project, payload({ cwd: w.project }), w.env);
      assert.equal(r.status, 0);
      assert.equal(r.decision, null);
      assert.equal(r.stderr, '');
      assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, 'utf8')), 'the file is rewritten as valid JSON');
    } finally { w.cleanup(); }
  });

  test('9. AOFORGE_SKIP_PROGRESS_GUARD=1 disables it entirely and writes nothing', () => {
    const w = mkWorld();
    try {
      for (let i = 0; i < 6; i++) {
        const r = run(w.project, payload({ cwd: w.project }), { ...w.env, AOFORGE_SKIP_PROGRESS_GUARD: '1' });
        assert.equal(r.decision, null);
        assert.equal(r.stderr, '');
      }
      assert.deepEqual(listDir(w.stateDir), []);
    } finally { w.cleanup(); }
  });

  test('9. bookkeeping tools are ignored and write nothing', () => {
    const w = mkWorld();
    try {
      for (const tool of IGNORED_TOOLS) {
        for (let i = 0; i < 6; i++) {
          const r = run(w.project, payload({ cwd: w.project, tool, input: { x: 1 } }), w.env);
          assert.equal(r.decision, null, `${tool} must never trip the guard`);
        }
      }
      assert.deepEqual(listDir(w.stateDir), []);
    } finally { w.cleanup(); }
  });
});

describe('guard-no-progress — exports', () => {
  test('exposes findPlanningDir, IGNORED_TOOLS and SESSION_TTL_MS, and no object-prune', () => {
    const mod = require('./guard-no-progress.js');
    assert.equal(typeof mod.findPlanningDir, 'function');
    assert.ok(mod.IGNORED_TOOLS instanceof Set);
    assert.equal(typeof mod.SESSION_TTL_MS, 'number');
    assert.equal(mod.prune, undefined, 'the object-prune is gone with the shared file');
  });
});
