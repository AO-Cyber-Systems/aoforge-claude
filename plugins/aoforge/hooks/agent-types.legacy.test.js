'use strict';

// Test list (TRD 72-10, objective 72, INST-03): the gates treat the pre-rename agent types as their own for one
// release. Each hook is spawned with the payload shapes its own suite sends (legacy-plugin-fixtures.cjs types them
// out), in a hand-built temp project; nothing here touches this repository or the real ~/.claude.
//
// 10. gate-edits: an ambient Write by 'devflow:executor' is allowed (no output), exactly as by 'aoforge:executor';
//     isAoforgeAgent accepts both namespaces and still rejects an empty agent name in either.
// 11. gate-bash-writes: 'devflow:planner' writing a tracked source file is allowed, as 'aoforge:planner' is.
// 12. verify-commits, autonomous retry-once path: 'devflow:executor' gets the same top-level block and the same
//     retry marker as 'aoforge:executor'.
// 13. gate-executor-stop: 'devflow:executor' stopping with no SUMMARY gets one top-level block naming the TRD, as
//     'aoforge:executor' does; with stop_hook_active it is let through.
// 14. A type that is not ours ('Explore') is unchanged: gate-edits and gate-bash-writes deny, verify-commits and
//     gate-executor-stop say nothing.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const LIB = path.join(__dirname, '..', 'aoforge', 'bin', 'lib');
const { preToolUsePayload, subagentStopPayload } = require(path.join(LIB, '__fixtures__', 'legacy-plugin-fixtures.cjs'));
const { makeTrackedRepo } = require(path.join(LIB, '__fixtures__', 'tracked-repo.cjs'));
const { gitAvailable } = require(path.join(LIB, '__fixtures__', 'wiki-remote.cjs'));
const store = require(path.join(LIB, 'hook-marker-store.cjs'));
const SF = require('./__fixtures__/subagent-stop-fixtures.js');

const hasGit = gitAvailable();

const GIT_REDIRECT_VARS = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_NAMESPACE',
];

/** `base` with every AOForge or legacy escape hatch and every git redirect removed, then `extra` on top. */
function cleanEnv(base, extra = {}) {
  const env = { ...base };
  for (const key of Object.keys(env)) {
    if (key.startsWith('AOFORGE_') || key.startsWith('DEVFLOW_')) delete env[key];
  }
  for (const key of GIT_REDIRECT_VARS) delete env[key];
  return { ...env, ...extra };
}

function spawnHook(name, payload, { cwd, env }) {
  const r = spawnSync(process.execPath, [path.join(__dirname, name)], {
    cwd,
    input: JSON.stringify(payload),
    env,
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(r.status, 0, `${name} exits 0 (stderr: ${r.stderr})`);
  return r;
}

/** 'none' when the hook printed nothing, else hookSpecificOutput.permissionDecision. */
function permission(r) {
  if (r.stdout.trim() === '') return 'none';
  return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
}

const tmpDirs = [];
function mkTmp(prefix) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  tmpDirs.push(d);
  return d;
}
after(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

// ─── 10. gate-edits ───────────────────────────────────────────────────────────

describe('10. gate-edits trusts both agent-type namespaces', () => {
  let root;
  before(() => {
    root = mkTmp('aof-legacy-edits-');
    fs.mkdirSync(path.join(root, '.aoforge', 'objectives'), { recursive: true });
    fs.writeFileSync(path.join(root, '.aoforge', 'ROADMAP.md'), '# Roadmap\n');
  });

  const write = (agentType) => spawnHook(
    'gate-edits.js',
    preToolUsePayload({ tool: 'Write', filePath: path.join(root, 'src', 'a.js'), agentType, agentId: 'a-legacy', cwd: root }),
    { cwd: root, env: cleanEnv(process.env) }
  );

  test('10: devflow:executor ambient Write is allowed, as aoforge:executor is', () => {
    assert.equal(permission(write('aoforge:executor')), 'none', 'control: the new namespace');
    assert.equal(permission(write('devflow:executor')), 'none', 'the legacy namespace');
  });

  test('10: isAoforgeAgent accepts both namespaces and rejects an empty name in either', () => {
    const { isAoforgeAgent } = require('./gate-edits.js');
    assert.equal(isAoforgeAgent('devflow:executor'), true);
    assert.equal(isAoforgeAgent('aoforge:executor'), true);
    for (const t of ['devflow:', 'aoforge:', 'DEVFLOW:executor', 'xdevflow:a', 'x:devflow:a', 'Explore', '', null]) {
      assert.equal(isAoforgeAgent(t), false, JSON.stringify(t));
    }
  });

  test('14: Explore is still denied', () => {
    assert.equal(permission(write('Explore')), 'deny');
  });
});

// ─── 11. gate-bash-writes ─────────────────────────────────────────────────────

describe('11. gate-bash-writes trusts both agent-type namespaces', { skip: !hasGit && 'git is not available' }, () => {
  let repo;
  before(() => {
    repo = makeTrackedRepo({ files: { 'src/a.js': 'a\n' } });
    fs.writeFileSync(path.join(repo.root, '.aoforge', 'config.json'), JSON.stringify({ gates: { bashEditGate: 'strict' } }));
  });
  after(() => repo.cleanup());

  const bash = (agentType) => spawnHook(
    'gate-bash-writes.js',
    preToolUsePayload({ tool: 'Bash', command: 'echo x > src/a.js', agentType, cwd: repo.root }),
    { cwd: repo.root, env: cleanEnv(repo.env) }
  );

  test('11: devflow:planner writing a tracked file is allowed, as aoforge:planner is', () => {
    assert.equal(permission(bash('aoforge:planner')), 'none', 'control: the new namespace');
    assert.equal(permission(bash('devflow:planner')), 'none', 'the legacy namespace');
  });

  test('14: Explore is still denied', () => {
    assert.equal(permission(bash('Explore')), 'deny');
  });
});

// ─── 12. verify-commits ───────────────────────────────────────────────────────

describe('12. verify-commits blocks the legacy executor once, as the new one', { skip: !hasGit && 'git is not available' }, () => {
  /** An autonomous, mid-execution project with a git repo and no commits; markers in a sibling dir. */
  function project() {
    const root = mkTmp('aof-legacy-vc-');
    fs.mkdirSync(path.join(root, '.aoforge'), { recursive: true });
    fs.writeFileSync(path.join(root, '.aoforge', 'config.json'), JSON.stringify({ mode: 'autonomous' }));
    fs.writeFileSync(path.join(root, '.aoforge', 'STATE.md'), '# State\n\nStatus: Executing objective 10\n');
    const r = spawnSync('git', ['init', '-q'], { cwd: root, env: cleanEnv(process.env), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const markers = mkTmp('aof-legacy-vc-markers-');
    return { root, env: cleanEnv(process.env, { AOFORGE_HOOK_MARKER_DIR: markers }), markers };
  }

  function stop(agentType, agentId) {
    const p = project();
    const r = spawnHook('verify-commits.js', subagentStopPayload({ agent_type: agentType, agent_id: agentId, cwd: p.root }), {
      cwd: p.root,
      env: p.env,
    });
    const marker = store.markerFile(p.root, `autonomous-retry-${agentId}`, { env: { AOFORGE_HOOK_MARKER_DIR: p.markers } });
    return { r, marker };
  }

  test('12: devflow:executor gets the same top-level block and retry marker as aoforge:executor', () => {
    const current = stop('aoforge:executor', 'agent-new');
    const legacy = stop('devflow:executor', 'agent-old');
    for (const [label, { r, marker }] of [['aoforge', current], ['devflow', legacy]]) {
      assert.notEqual(r.stdout, '', `${label}: expected a block`);
      const out = JSON.parse(r.stdout);
      assert.deepEqual(Object.keys(out).sort(), ['decision', 'reason'], `${label}: top-level shape`);
      assert.equal(out.decision, 'block', label);
      assert.ok(fs.existsSync(marker), `${label}: retry marker written`);
    }
    assert.equal(JSON.parse(legacy.r.stdout).reason, JSON.parse(current.r.stdout).reason);
  });

  test('14: Explore is not blocked and leaves no marker', () => {
    const { r, marker } = stop('Explore', 'agent-explore');
    assert.equal(r.stdout, '');
    assert.equal(fs.existsSync(marker), false);
  });
});

// ─── 13. gate-executor-stop ───────────────────────────────────────────────────

describe('13. gate-executor-stop blocks the legacy executor with no SUMMARY', () => {
  function scenario(label) {
    const root = mkTmp(`aof-legacy-ges-${label}-`);
    SF.makePlanningRepo(root);
    const prompt = SF.executorPrompt({ planId: '77-02', repoRoot: root });
    const transcript = SF.writeAgentTranscript(path.join(root, 'transcripts'), prompt);
    return { root, transcript };
  }

  function stop(agentType, extra = {}) {
    const { root, transcript } = scenario(agentType.replace(/\W/g, '-'));
    const payload = subagentStopPayload({ cwd: root, agent_transcript_path: transcript, agent_type: agentType, ...extra });
    return spawnHook('gate-executor-stop.js', payload, { cwd: root, env: cleanEnv(process.env) });
  }

  test('13: devflow:executor gets one top-level block naming the TRD, as aoforge:executor does', () => {
    for (const agentType of ['aoforge:executor', 'devflow:executor']) {
      const r = stop(agentType);
      assert.notEqual(r.stdout, '', `${agentType}: expected a block`);
      const out = JSON.parse(r.stdout);
      assert.deepEqual(Object.keys(out).sort(), ['decision', 'reason'], agentType);
      assert.equal(out.decision, 'block', agentType);
      assert.match(out.reason, /77-02/, agentType);
    }
  });

  test('13: stop_hook_active lets the legacy executor through (the once-guard)', () => {
    assert.equal(stop('devflow:executor', { stop_hook_active: true }).stdout, '');
  });

  test('14: a legacy non-executor and Explore say nothing', () => {
    assert.equal(stop('devflow:verifier').stdout, '');
    assert.equal(stop('Explore').stdout, '');
  });
});
