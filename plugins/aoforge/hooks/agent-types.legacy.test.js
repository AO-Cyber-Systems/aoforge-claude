'use strict';

// Test list (TRD 72-10, objective 72, INST-03; inverted by TRD 78-11, objective 78, SC-1): AOForge 3.0.x treated the
// pre-rename agent types as its own for one release. Since 3.1 (compat.isOwnAgentType / isOwnExecutor accept the
// `aoforge:` namespace only) the gates treat a pre-rename agent type like any other agent that is not ours. Each hook
// is spawned with the payload shapes its own suite sends (legacy-plugin-fixtures.cjs types them out), in a hand-built
// temp project; nothing here touches this repository or the real ~/.claude.
//
// 10. gate-edits: an ambient Write by 'devflow:executor' is denied, as by 'Explore'; 'aoforge:executor' is allowed (no
//     output); isAoforgeAgent accepts the aoforge namespace only and still rejects an empty agent name.
// 11. gate-bash-writes: 'devflow:planner' writing a tracked source file is denied; 'aoforge:planner' is allowed.
// 12. verify-commits, autonomous retry-once path: 'aoforge:executor' gets the top-level block and the retry marker;
//     'devflow:executor' gets neither.
// 13. gate-executor-stop: 'aoforge:executor' stopping with no SUMMARY gets one top-level block naming the TRD;
//     'devflow:executor' gets nothing (also with stop_hook_active).
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

describe('10. gate-edits trusts the aoforge namespace only (TRD 78-11)', () => {
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

  test('10: devflow:executor ambient Write is denied; aoforge:executor is allowed', () => {
    assert.equal(permission(write('aoforge:executor')), 'none', 'control: the aoforge namespace');
    assert.equal(permission(write('devflow:executor')), 'deny', 'the pre-rename namespace is not trusted');
  });

  test('10: isAoforgeAgent accepts the aoforge namespace only and rejects an empty name', () => {
    const { isAoforgeAgent } = require('./gate-edits.js');
    assert.equal(isAoforgeAgent('aoforge:executor'), true);
    for (const t of ['devflow:executor', 'devflow:planner', 'devflow:', 'aoforge:', 'DEVFLOW:executor', 'xdevflow:a',
      'x:devflow:a', 'Explore', '', null]) {
      assert.equal(isAoforgeAgent(t), false, JSON.stringify(t));
    }
  });

  test('14: Explore is still denied', () => {
    assert.equal(permission(write('Explore')), 'deny');
  });
});

// ─── 11. gate-bash-writes ─────────────────────────────────────────────────────

describe('11. gate-bash-writes trusts the aoforge namespace only (TRD 78-11)', { skip: !hasGit && 'git is not available' }, () => {
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

  test('11: devflow:planner writing a tracked file is denied; aoforge:planner is allowed', () => {
    assert.equal(permission(bash('aoforge:planner')), 'none', 'control: the aoforge namespace');
    assert.equal(permission(bash('devflow:planner')), 'deny', 'the pre-rename namespace is not trusted');
  });

  test('14: Explore is still denied', () => {
    assert.equal(permission(bash('Explore')), 'deny');
  });
});

// ─── 12. verify-commits ───────────────────────────────────────────────────────

describe('12. verify-commits blocks aoforge:executor only (TRD 78-11)', { skip: !hasGit && 'git is not available' }, () => {
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

  test('12: aoforge:executor gets the top-level block and retry marker; devflow:executor gets neither', () => {
    const current = stop('aoforge:executor', 'agent-new');
    assert.notEqual(current.r.stdout, '', 'aoforge: expected a block');
    const out = JSON.parse(current.r.stdout);
    assert.deepEqual(Object.keys(out).sort(), ['decision', 'reason'], 'aoforge: top-level shape');
    assert.equal(out.decision, 'block');
    assert.ok(fs.existsSync(current.marker), 'aoforge: retry marker written');

    const legacy = stop('devflow:executor', 'agent-old');
    assert.equal(legacy.r.stdout, '', 'devflow: no block');
    assert.equal(fs.existsSync(legacy.marker), false, 'devflow: no retry marker');
  });

  test('14: Explore is not blocked and leaves no marker', () => {
    const { r, marker } = stop('Explore', 'agent-explore');
    assert.equal(r.stdout, '');
    assert.equal(fs.existsSync(marker), false);
  });
});

// ─── 13. gate-executor-stop ───────────────────────────────────────────────────

describe('13. gate-executor-stop blocks aoforge:executor only (TRD 78-11)', () => {
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

  test('13: aoforge:executor gets one top-level block naming the TRD; devflow:executor gets nothing', () => {
    const r = stop('aoforge:executor');
    assert.notEqual(r.stdout, '', 'aoforge:executor: expected a block');
    const out = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(out).sort(), ['decision', 'reason']);
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /77-02/);

    assert.equal(stop('devflow:executor').stdout, '', 'the pre-rename executor is not ours');
    assert.equal(stop('devflow:executor', { stop_hook_active: true }).stdout, '');
  });

  test('14: a legacy non-executor and Explore say nothing', () => {
    assert.equal(stop('devflow:verifier').stdout, '');
    assert.equal(stop('Explore').stdout, '');
  });
});
