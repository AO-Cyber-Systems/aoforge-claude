'use strict';

// pre-bash-equivalence.test.js — TRD 79-03 (SC-3)
//
// pre-bash.js runs the five PreToolUse(Bash) hooks' main() in ONE process. This file proves, case by case over a
// hand-built corpus (__fixtures__/bash-corpus.js), that the one process decides exactly what the five hooks decide
// when Claude Code runs each as its own process, on the merged tree (objective 73's gate-interactive, objective 78's
// single-name compat).
//
// Both sides are spawned, never run in this process: an in-process runHook would share module state across cases
// and hide exactly the divergence this test exists to find.
//   dispatcher side  spawn `node hooks/pre-bash.js` once
//   chain side       spawn each hook of DISPATCHED_HOOKS with the same stdin (in parallel, as Claude Code runs the
//                    hooks of an event), then merge their results with pre-bash's own merge()
// Each side gets its own fixture project, scratch HOME and progress-guard dir (handoff queue files and repeat
// counters would otherwise cross-talk). The child env is process.env minus every AOFORGE_* and GIT_* variable.
//
// Compared, after normalising: exit code, permissionDecision, the set of reasons (permissionDecisionReason split on
// blank lines), additionalContext, plain stdout text, stderr lines (trimmed, blank lines dropped), and three side
// effects: the handoff records gate-interactive queued under <P>/.aoforge-handoff/pending/ (created_at dropped), the
// progress guard's session state (streak and the tools it counted, so a call is counted once in both modes), and
// whether the single-turn .edit-override marker is still there.
// Normalised (bash-corpus.normalize): project root and its realpath -> <P>, scratch home -> <H>, guard dir -> <G>,
// the mktemp base -> <B>, a handoff id `h-` + 8 hex -> <ID>. Nothing else is rewritten.
//
// Test list
//  1. registration: hooks.json registers pre-bash.js once for PreToolUse `Bash`; none of the five dispatched hooks
//     is registered directly on a matcher that fires for Bash; guard-no-progress's matcher fires on every tool but
//     Bash (Claude Code's matcher rule, __fixtures__/claude-matcher.js)
//  1b. no hook command fires twice for one event and tool (hooks.json has no duplicate registration), with a
//      synthetic doubled registration as the sensitivity control
//  2. equivalence, one test per CORPUS entry: dispatcher vs chain give equal
//     {exit, decision, reasons (set), context, text, stderr lines, handoffs, guard, overrideLeft}, the decision is the
//     one the corpus entry expects (and the reason count, where given), and the guard counted the call once
//  3. equivalence over a sequence: the same command five times in one session, compared step by step (the progress
//     guard warns on stderr at 3 and asks at 5 identically in both modes)
//  4. sanity anchors, so equivalence is not two equally broken sides: a raw `git commit` in the fixture project is
//     denied; `ls -la` is silent with exit 0; `gh auth login` is denied with a `! gh auth login` hint (`ssh host`,
//     which the TRD named, is not an interactive pattern on the merged tree and is silent); `git tag -a v9.9.9 -m x`
//     without the CHANGELOG section is denied
//  5. mutation: a scratch copy of the hooks tree whose pre-bash drops gate-interactive from DISPATCHED_HOOKS makes
//     every interactive case that gate-interactive gates diverge, reported by id, while non-interactive cases stay
//     equal (the copy is otherwise sound)

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const HOOKS_DIR = __dirname;
const pre = require('./pre-bash.js'); // DISPATCHED_HOOKS and merge() only; runHook is never called here
const corpus = require('./__fixtures__/bash-corpus.js');
const { matcherFires } = require('./__fixtures__/claude-matcher.js');

const CONCURRENCY = Math.max(2, Math.min(8, (os.availableParallelism ? os.availableParallelism() : os.cpus().length) - 1));
const SPAWN_TIMEOUT_MS = 30000;

/** Spawn one hook file as Claude Code does: stdin in, stdout/stderr/exit code out. */
function spawnHook(file, { stdin, cwd, env }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d) => { stdout += d; });
    child.stderr.setEncoding('utf8').on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), SPAWN_TIMEOUT_MS);
    child.on('error', (e) => { clearTimeout(timer); resolve({ stdout, stderr: `${stderr}spawn error: ${e.message}`, code: -1 }); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code === null ? `signal ${signal}` : code });
    });
    child.stdin.on('error', () => { /* EPIPE: a hook may exit before reading stdin */ });
    child.stdin.end(stdin);
  });
}

/** One process: hooks/pre-bash.js from `hooksDir` (the real tree, or the mutation's copy). */
async function dispatcherSide(input, project, hooksDir = HOOKS_DIR) {
  return spawnHook(path.join(hooksDir, 'pre-bash.js'), { ...input, cwd: project.root });
}

/** Five processes, one per dispatched hook of the REAL tree, merged with pre-bash's own merge(). */
async function chainSide(input, project) {
  const results = await Promise.all(pre.DISPATCHED_HOOKS.map(async (file) => {
    const r = await spawnHook(path.join(HOOKS_DIR, file), { ...input, cwd: project.root });
    return { file, stdout: r.stdout, stderr: r.stderr, code: r.code, error: null };
  }));
  return pre.merge(results);
}

/** The handoff records gate-interactive queued in this project, normalised, created_at dropped, sorted. */
function handoffs(project) {
  const dir = path.join(project.root, '.aoforge-handoff', 'pending');
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')); } catch { return []; }
  return names.map((n) => {
    const rec = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
    delete rec.created_at;
    return corpus.normalize(JSON.stringify(rec), project);
  }).sort();
}

/**
 * The progress guard's per-session state after the call: how many identical calls in a row, which tools it has
 * counted, and the project it keyed them to. The signature hashes are left out: they hash the command, which names
 * the project path in a `git -C <P>` case.
 */
function guardState(project) {
  let names = [];
  try { names = fs.readdirSync(project.guardDir).filter((n) => n.endsWith('.json')).sort(); } catch { return []; }
  return names.map((n) => {
    const s = JSON.parse(fs.readFileSync(path.join(project.guardDir, n), 'utf8'));
    const g = s.guard || {};
    return {
      session: n,
      streak: g.streak,
      counted: Array.isArray(g.recent) ? g.recent.map((r) => r.tool) : [],
      project: corpus.normalize(s.project, project),
    };
  });
}

/** What Claude Code would act on, and the side effects the hooks leave, normalised across two projects. */
function observe(side, project) {
  const norm = (t) => corpus.normalize(t, project);
  const out = String(side.stdout || '').trim();
  let json = null;
  if (out.startsWith('{')) { try { json = JSON.parse(out); } catch { json = null; } }
  const h = (json && json.hookSpecificOutput) || {};
  return {
    exit: side.code,
    decision: h.permissionDecision || null,
    reasons: h.permissionDecisionReason ? norm(h.permissionDecisionReason).split('\n\n').sort() : [],
    context: h.additionalContext ? norm(h.additionalContext) : null,
    text: json ? null : (norm(out) || null),
    stderr: norm(side.stderr).split('\n').map((l) => l.trim()).filter(Boolean),
    handoffs: handoffs(project),
    guard: guardState(project),
    overrideLeft: fs.existsSync(path.join(project.root, '.aoforge', '.edit-override')),
  };
}

/**
 * Run one corpus case on both sides, each in its own fresh project.
 * -> {id, equal, dispatcher, chain}  (dispatcher and chain are observe() results)
 */
async function compareCase(c, { dispatcherHooksDir = HOOKS_DIR } = {}) {
  const a = corpus.makeProject(c.project || {});
  const b = corpus.makeProject(c.project || {});
  try {
    if (c.setup) { c.setup(a); c.setup(b); }
    const [d, ch] = await Promise.all([
      dispatcherSide(corpus.caseInput(c, a), a, dispatcherHooksDir),
      chainSide(corpus.caseInput(c, b), b),
    ]);
    const dispatcher = observe(d, a);
    const chain = observe(ch, b);
    let equal = true;
    try { assert.deepEqual(dispatcher, chain); } catch { equal = false; }
    return { id: c.id, equal, dispatcher, chain };
  } finally {
    corpus.cleanup(a);
    corpus.cleanup(b);
  }
}

// Tool events match on the tool name; the others fire every group they list.
const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest']);
const PROBE_TOOLS = ['Bash', 'BashOutput', 'Read', 'Edit', 'Write', 'MultiEdit', 'Skill', 'Task', 'mcp__gopls__x'];

/** `<event>(<tool>): <command>` for every command that would run twice for one event (and tool). */
function duplicateRegistrations(hooks) {
  const dups = [];
  for (const [event, groups] of Object.entries(hooks)) {
    for (const tool of TOOL_EVENTS.has(event) ? PROBE_TOOLS : [null]) {
      const seen = new Set();
      for (const g of groups) {
        if (tool !== null && !matcherFires(g.matcher, tool)) continue;
        for (const h of g.hooks || []) {
          if (seen.has(h.command)) dups.push(`${event}${tool ? `(${tool})` : ''}: ${h.command}`);
          seen.add(h.command);
        }
      }
    }
  }
  return [...new Set(dups)];
}

function divergence(r) {
  return `${r.id}: dispatcher ${JSON.stringify(r.dispatcher, null, 2)}\nchain ${JSON.stringify(r.chain, null, 2)}`;
}

describe('pre-bash equivalence: registration', () => {
  test('1. pre-bash.js is the one Bash registration; guard-no-progress fires on every tool but Bash', () => {
    const hooks = JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, 'hooks.json'), 'utf8')).hooks;
    const firingForBash = hooks.PreToolUse
      .filter((g) => matcherFires(g.matcher, 'Bash'))
      .flatMap((g) => g.hooks.map((h) => h.command));
    assert.deepEqual(firingForBash, ['node ${CLAUDE_PLUGIN_ROOT}/hooks/pre-bash.js'],
      'exactly one PreToolUse hook fires for Bash, and it is the dispatcher');

    for (const file of pre.DISPATCHED_HOOKS) {
      const direct = Object.entries(hooks).flatMap(([event, groups]) => groups
        .filter((g) => g.hooks.some((h) => h.command.endsWith(`/hooks/${file}`)))
        .map((g) => ({ event, matcher: g.matcher })));
      for (const reg of direct) {
        assert.ok(!(reg.event === 'PreToolUse' && matcherFires(reg.matcher, 'Bash')),
          `${file} is registered directly on PreToolUse ${JSON.stringify(reg.matcher)}, which fires for Bash`);
      }
      if (file !== 'guard-no-progress.js') assert.deepEqual(direct, [], `${file} runs only through pre-bash.js`);
    }

    const guard = hooks.PreToolUse.filter((g) => g.hooks.some((h) => h.command.endsWith('/hooks/guard-no-progress.js')));
    assert.equal(guard.length, 1, 'guard-no-progress has one direct registration');
    assert.ok(!matcherFires(guard[0].matcher, 'Bash'), 'its matcher excludes Bash');
    const others = ['Read', 'Edit', 'Write', 'BashOutput', 'Monitor', 'Task', 'Skill', 'mcp__gopls__x'];
    assert.deepEqual(others.filter((t) => !matcherFires(guard[0].matcher, t)), [], 'and only Bash');
  });

  test('1b. no hook command fires twice for one event and tool (hooks.json has no duplicate registration)', () => {
    const hooks = JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, 'hooks.json'), 'utf8')).hooks;
    assert.deepEqual(duplicateRegistrations(hooks), []);
    // Sensitivity control: the check finds a doubled tool registration and a doubled plain one.
    assert.deepEqual(duplicateRegistrations({
      PreToolUse: [{ matcher: 'Bash', hooks: [{ command: 'a' }] }, { matcher: '*', hooks: [{ command: 'a' }] }],
      Stop: [{ hooks: [{ command: 'x' }, { command: 'x' }] }],
    }), ['PreToolUse(Bash): a', 'Stop: x']);
  });
});

describe('pre-bash equivalence: corpus (one process vs five)', { concurrency: CONCURRENCY }, () => {
  for (const c of corpus.CORPUS) {
    test(`2. [${c.category}] ${c.id}: ${c.why}`, async () => {
      const r = await compareCase(c);
      assert.ok(r.equal, `diverged: ${divergence(r)}`);
      assert.equal(r.dispatcher.decision, c.expect, `${c.id}: decision ${r.dispatcher.decision}, the corpus expects ${c.expect}`);
      if (c.reasons !== undefined) assert.equal(r.dispatcher.reasons.length, c.reasons, `${c.id}: reasons kept`);
      if (c.stdin === undefined) {
        // A Bash (or other tool) payload in an AOForge project is counted by the guard exactly once, in both modes.
        const counted = r.dispatcher.guard.reduce((n, g) => n + g.counted.length, 0);
        assert.equal(counted, c.project && c.project.aoforge === false ? 0 : 1, `${c.id}: guard-no-progress counted the call once`);
      }
    });
  }
});

describe('pre-bash equivalence: sequences', { concurrency: CONCURRENCY }, () => {
  for (const s of corpus.SEQUENCES) {
    test(`3. ${s.id}: ${s.why}`, async () => {
      const a = corpus.makeProject({});
      const b = corpus.makeProject({});
      try {
        const c = { command: s.command };
        for (let step = 1; step <= s.calls; step++) {
          const [d, ch] = await Promise.all([
            dispatcherSide(corpus.caseInput(c, a, `seq-${s.id}`), a),
            chainSide(corpus.caseInput(c, b, `seq-${s.id}`), b),
          ]);
          const od = observe(d, a);
          const oc = observe(ch, b);
          assert.deepEqual(od, oc, `${s.id} step ${step} diverged`);
          assert.equal(od.decision, s.expect[step - 1], `${s.id} step ${step}: decision`);
          assert.equal(od.guard.length === 1 && od.guard[0].streak, step, `${s.id} step ${step}: one call counted per step`);
          const warned = od.stderr.some((l) => /No-progress guard: `Bash` has now been called 3 times/.test(l));
          assert.equal(warned, step === s.warnAt, `${s.id} step ${step}: the guard warning is on stderr only at step ${s.warnAt}`);
          if (step === 5) {
            const stuck = od.reasons.some((r) => /No-progress guard: `Bash` has been called 5 times/.test(r));
            assert.equal(stuck, s.expect[4] === 'ask', `${s.id} step 5: the guard's ask reason is kept only when ask wins`);
          }
        }
      } finally {
        corpus.cleanup(a);
        corpus.cleanup(b);
      }
    });
  }
});

describe('pre-bash equivalence: sanity anchors (dispatcher side)', () => {
  const byId = (id) => corpus.CORPUS.find((c) => c.id === id);

  test('4a. a raw git commit in the fixture project is denied by the commit gate', async () => {
    const r = await compareCase(byId('commit-raw'));
    assert.equal(r.dispatcher.decision, 'deny');
    assert.ok(r.dispatcher.reasons.some((x) => /Raw `git commit` is blocked/.test(x)), r.dispatcher.reasons.join('\n'));
  });

  test('4b. ls -la is silent with exit 0', async () => {
    const r = await compareCase(byId('benign-ls'));
    const { exit, decision, reasons, context, text, stderr, handoffs: queued } = r.dispatcher;
    assert.deepEqual({ exit, decision, reasons, context, text, stderr, queued },
      { exit: 0, decision: null, reasons: [], context: null, text: null, stderr: [], queued: [] });
  });

  test('4c. gh auth login is denied with a `! gh auth login` hint and one queued record; ssh host is silent', async () => {
    const r = await compareCase(byId('int-gh-auth'));
    assert.equal(r.dispatcher.decision, 'deny');
    assert.ok(r.dispatcher.reasons.some((x) => x.includes('`! gh auth login`')), r.dispatcher.reasons.join('\n'));
    assert.equal(r.dispatcher.handoffs.length, 1);
    const rec = JSON.parse(r.dispatcher.handoffs[0]);
    assert.equal(rec.cmd, 'gh auth login');
    assert.equal(rec.session_id, 'corpus');
    assert.equal(rec.cwd, '<P>');
    const ssh = await compareCase(byId('int-ssh-host'));
    assert.equal(ssh.dispatcher.decision, null, 'ssh is not an interactive pattern on the merged tree');
  });

  test('4d. git tag -a v9.9.9 -m x without the CHANGELOG section is denied', async () => {
    const r = await compareCase(byId('tag-missing-section'));
    assert.equal(r.dispatcher.decision, 'deny');
    assert.ok(r.dispatcher.reasons.some((x) => /CHANGELOG\.md has no entry for v9\.9\.9/.test(x)), r.dispatcher.reasons.join('\n'));
  });
});

describe('pre-bash equivalence: mutation', () => {
  let scratch = null;
  after(() => { if (scratch) fs.rmSync(scratch, { recursive: true, force: true }); });

  test('5. a dispatcher without gate-interactive diverges on exactly the gated interactive cases, by id', async () => {
    // Keep the relative layout pre-bash and the hooks require: <scratch>/hooks and <scratch>/aoforge/bin.
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-bash-mutant-'));
    fs.cpSync(HOOKS_DIR, path.join(scratch, 'hooks'), { recursive: true });
    fs.cpSync(path.join(HOOKS_DIR, '..', 'aoforge', 'bin'), path.join(scratch, 'aoforge', 'bin'), { recursive: true });
    const file = path.join(scratch, 'hooks', 'pre-bash.js');
    const src = fs.readFileSync(file, 'utf8');
    const mutated = src.replace(/^[ \t]*'gate-interactive\.js',[ \t]*\r?\n/m, '');
    assert.notEqual(mutated, src, 'the mutation applied');
    assert.ok(!mutated.includes("'gate-interactive.js'"), 'the copy no longer dispatches gate-interactive');
    fs.writeFileSync(file, mutated);
    const mutantHooks = path.join(scratch, 'hooks');

    const interactive = corpus.CORPUS.filter((c) => c.category === 'interactive');
    const gated = interactive.filter((c) => c.expect === 'deny').map((c) => c.id).sort();
    assert.ok(gated.length >= 5, 'the corpus has gated interactive cases to bite on');
    const controls = ['benign-ls', 'commit-raw', 'tag-missing-section', 'write-redirect-tracked']
      .map((id) => corpus.CORPUS.find((c) => c.id === id));

    const results = [];
    for (let i = 0; i < interactive.length; i += CONCURRENCY) {
      const batch = interactive.slice(i, i + CONCURRENCY);
      results.push(...await Promise.all(batch.map((c) => compareCase(c, { dispatcherHooksDir: mutantHooks }))));
    }
    const diverged = results.filter((r) => !r.equal).map((r) => r.id).sort();
    assert.deepEqual(diverged, gated, 'the mutant diverges on every interactive case gate-interactive gates, and only those');
    for (const r of results.filter((x) => !x.equal)) {
      assert.equal(r.dispatcher.decision, null, `${r.id}: the mutant lets it through`);
      assert.equal(r.chain.decision, 'deny', `${r.id}: the real chain denies it`);
    }

    const controlResults = await Promise.all(controls.map((c) => compareCase(c, { dispatcherHooksDir: mutantHooks })));
    assert.deepEqual(controlResults.filter((r) => !r.equal).map(divergence), [], 'non-interactive cases stay equal on the copy');
  });
});
