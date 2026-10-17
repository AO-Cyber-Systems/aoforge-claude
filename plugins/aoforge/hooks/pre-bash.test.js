'use strict';

// pre-bash.js — the PreToolUse(Bash) hooks in one process.
//
// Test list
//  1. merge: a deny outranks an ask and a warning; every reason of the winning decision is kept
//  2. merge: ask + plain context; no decision -> context only; nothing -> empty stdout, exit 0
//  3. merge: exit 2 from one hook blocks with its stderr; a throwing hook is skipped and named on stderr
//  4. runHook: stdin is served to fs.readFileSync(0), stdout/stderr are captured, process.exit becomes a code
//  5. dispatch over the real hooks: a benign command is silent; a raw git commit in an AOForge project is
//     denied by gate-commits; an unknown tool_name is silent
//  6. spawned as a process: the deny JSON reaches stdout, exit 0; the fail-open path never exits non-zero
//  7. every dispatched hook exports main() and carries the DISPATCHED-BY header; hooks.json registers the
//     dispatcher once on Bash and guard-no-progress on a matcher that excludes Bash
//  8. (quick 35) the shared matcher model (__fixtures__/claude-matcher.js) follows Claude Code's documented table
//  9. (quick 35) under that rule the guard-no-progress matcher fires on every tool but exactly Bash, MCP tools and
//     BashOutput included

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.join(__dirname, 'pre-bash.js');
const pre = require('./pre-bash.js');
const { matcherFires } = require('./__fixtures__/claude-matcher.js');

const json = (h) => JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...h } });
const res = (file, over = {}) => ({ file, stdout: '', stderr: '', code: 0, error: null, ...over });

describe('pre-bash: merge', () => {
  test('1. deny outranks ask and a warning; the reasons of the winning decision are kept', () => {
    const m = pre.merge([
      res('a.js', { stdout: json({ permissionDecision: 'ask', permissionDecisionReason: 'ask-reason' }) }),
      res('b.js', { stderr: 'warning line\n' }),
      res('c.js', { stdout: json({ permissionDecision: 'deny', permissionDecisionReason: 'deny-one' }) }),
      res('d.js', { stdout: json({ permissionDecision: 'deny', permissionDecisionReason: 'deny-two' }) }),
    ]);
    assert.equal(m.code, 0);
    const out = JSON.parse(m.stdout).hookSpecificOutput;
    assert.equal(out.permissionDecision, 'deny');
    assert.equal(out.permissionDecisionReason, 'deny-one\n\ndeny-two');
    assert.equal(m.stderr, 'warning line');
  });

  test('2. ask with context; context only; nothing', () => {
    const ask = pre.merge([
      res('a.js', { stdout: json({ permissionDecision: 'ask', permissionDecisionReason: 'r' }) }),
      res('b.js', { stdout: json({ additionalContext: 'ctx' }) }),
    ]);
    const out = JSON.parse(ask.stdout).hookSpecificOutput;
    assert.equal(out.permissionDecision, 'ask');
    assert.equal(out.additionalContext, 'ctx');

    const ctxOnly = pre.merge([res('b.js', { stdout: json({ additionalContext: 'ctx' }) })]);
    const o2 = JSON.parse(ctxOnly.stdout).hookSpecificOutput;
    assert.equal(o2.permissionDecision, undefined);
    assert.equal(o2.additionalContext, 'ctx');

    const nothing = pre.merge([res('a.js'), res('b.js')]);
    assert.deepEqual(nothing, { stdout: '', stderr: '', code: 0 });

    const plain = pre.merge([res('a.js', { stdout: 'free text' })]);
    assert.equal(plain.stdout, 'free text');
  });

  test('3. exit 2 blocks with that stderr; a throwing hook is skipped and named', () => {
    const block = pre.merge([
      res('a.js', { stdout: json({ permissionDecision: 'deny', permissionDecisionReason: 'ignored' }) }),
      res('b.js', { stderr: 'blocked by b\n', code: 2 }),
    ]);
    assert.deepEqual(block, { stdout: '', stderr: 'blocked by b', code: 2 });

    const skipped = pre.merge([
      res('a.js', { error: new Error('boom') }),
      res('b.js', { stdout: json({ permissionDecision: 'ask', permissionDecisionReason: 'r' }) }),
    ]);
    assert.equal(skipped.code, 0);
    assert.match(skipped.stderr, /a\.js skipped: boom/);
    assert.equal(JSON.parse(skipped.stdout).hookSpecificOutput.permissionDecision, 'ask');
  });
});

describe('pre-bash: runHook', () => {
  test('4. stdin, captured output and process.exit', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-bash-'));
    fs.writeFileSync(path.join(dir, 'echo.js'), [
      "const fs = require('fs');",
      'function main() {',
      "  const input = JSON.parse(fs.readFileSync(0, 'utf8'));",
      "  process.stderr.write('warn ' + input.tool_name + '\\n');",
      "  process.stdout.write(JSON.stringify({ hookSpecificOutput: { permissionDecision: 'ask', permissionDecisionReason: input.tool_input.command } }));",
      '  process.exit(0);',
      "  process.stdout.write('never');",
      '}',
      'module.exports = { main };',
    ].join('\n'));
    fs.writeFileSync(path.join(dir, 'nomain.js'), 'module.exports = {};');
    const r = pre.runHook('echo.js', JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } }), { dir });
    assert.equal(r.code, 0);
    assert.equal(r.stderr, 'warn Bash\n');
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, 'ls');
    assert.ok(!r.stdout.includes('never'), 'process.exit stops the hook');
    assert.equal(typeof fs.readFileSync, 'function');
    assert.equal(fs.readFileSync(path.join(dir, 'nomain.js'), 'utf8'), 'module.exports = {};', 'fs.readFileSync restored');
    const bad = pre.runHook('nomain.js', '{}', { dir });
    assert.match(bad.error.message, /does not export main/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

function aoforgeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-bash-proj-'));
  fs.mkdirSync(path.join(dir, '.aoforge', 'objectives'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aoforge', 'ROADMAP.md'), '# Roadmap\n');
  fs.writeFileSync(path.join(dir, '.aoforge', 'config.json'), '{"gates":{"editGate":"strict"}}\n');
  return dir;
}

function payload(cwd, command, tool = 'Bash') {
  return JSON.stringify({ session_id: 'pre-bash-test', cwd, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command } });
}

describe('pre-bash: dispatch over the real hooks', () => {
  test('5. benign is silent; a raw git commit in an AOForge project is denied; a non-Bash tool is silent', () => {
    const dir = aoforgeProject();
    const prevCwd = process.cwd();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-bash-home-'));
    const prevEnv = { ...process.env };
    process.env.HOME = home;
    process.env.AOFORGE_PROGRESS_GUARD_DIR = path.join(home, 'guard');
    process.env.AOFORGE_HOOK_MARKER_DIR = path.join(home, 'markers');
    try {
      process.chdir(dir);
      const benign = pre.dispatch(payload(dir, 'ls -la'));
      assert.equal(benign.code, 0);
      assert.equal(benign.stdout, '');

      const deny = pre.dispatch(payload(dir, 'git commit -m "wip"'));
      assert.equal(deny.code, 0);
      const out = JSON.parse(deny.stdout).hookSpecificOutput;
      assert.equal(out.permissionDecision, 'deny');
      assert.match(out.permissionDecisionReason, /Raw `git commit` is blocked/);

      const other = pre.dispatch(payload(dir, 'x', 'Read'));
      assert.equal(other.stdout, '');
    } finally {
      process.chdir(prevCwd);
      for (const k of Object.keys(process.env)) if (!(k in prevEnv)) delete process.env[k];
      Object.assign(process.env, prevEnv);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('pre-bash: as a process', () => {
  test('6. the deny reaches stdout with exit 0; garbage stdin fails open', () => {
    const dir = aoforgeProject();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-bash-home-'));
    const env = { ...process.env, HOME: home, AOFORGE_PROGRESS_GUARD_DIR: path.join(home, 'guard'), AOFORGE_HOOK_MARKER_DIR: path.join(home, 'markers') };
    try {
      const r = spawnSync(process.execPath, [HOOK], { cwd: dir, env, input: payload(dir, 'git commit -m "wip"'), encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');

      const g = spawnSync(process.execPath, [HOOK], { cwd: dir, env, input: 'not json', encoding: 'utf8' });
      assert.equal(g.status, 0);
      assert.equal(g.stdout, '');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('pre-bash: registration contract', () => {
  test('7. dispatched hooks export main() and carry the header; hooks.json registers the dispatcher once', () => {
    for (const file of pre.DISPATCHED_HOOKS) {
      const mod = require(path.join(__dirname, file));
      assert.equal(typeof mod.main, 'function', `${file} exports main()`);
      const head = fs.readFileSync(path.join(__dirname, file), 'utf8').split('\n').slice(0, 40);
      assert.ok(head.some((l) => /DISPATCHED-BY:\s*pre-bash\.js/.test(l)), `${file} carries the DISPATCHED-BY header`);
    }
    const hooks = JSON.parse(fs.readFileSync(path.join(__dirname, 'hooks.json'), 'utf8')).hooks;
    const bashGroups = hooks.PreToolUse.filter((g) => g.matcher === 'Bash');
    assert.equal(bashGroups.length, 1);
    assert.deepEqual(bashGroups[0].hooks.map((h) => h.command), ['node ${CLAUDE_PLUGIN_ROOT}/hooks/pre-bash.js']);
    const all = JSON.stringify(hooks);
    for (const file of pre.DISPATCHED_HOOKS.filter((f) => f !== 'guard-no-progress.js')) {
      assert.ok(!all.includes(`hooks/${file}`), `${file} is not registered directly`);
    }
    const guard = hooks.PreToolUse.find((g) => JSON.stringify(g).includes('guard-no-progress.js'));
    assert.ok(guard, 'guard-no-progress keeps a direct registration for the other tools');
    assert.ok(!matcherFires(guard.matcher, 'Bash'), 'its matcher does not match Bash (the dispatcher runs it there)');
  });

  test('8. the matcher model follows Claude Code\'s documented table', () => {
    for (const all of ['*', '', undefined]) {
      assert.ok(matcherFires(all, 'Bash') && matcherFires(all, 'mcp__gopls__x'), `${JSON.stringify(all)} matches every tool`);
    }
    assert.ok(matcherFires('Bash', 'Bash'));
    assert.ok(!matcherFires('Bash', 'BashOutput'), 'an exact name is not a prefix');
    for (const list of ['Edit|Write', 'Edit, Write']) {
      assert.ok(matcherFires(list, 'Edit') && matcherFires(list, 'Write'), list);
      assert.ok(!matcherFires(list, 'MultiEdit') && !matcherFires(list, 'Read'), `${list} names exact tools only`);
    }
    assert.ok(!matcherFires('mcp__', 'mcp__gopls__x'), 'mcp__ is an exact name, not a prefix');
    assert.ok(matcherFires('mcp__.*', 'mcp__gopls__x'));
    assert.ok(matcherFires('^Notebook', 'NotebookEdit'), 'a regex matcher is unanchored');
  });

  test('9. guard-no-progress fires on every tool but exactly Bash (the dispatcher counts Bash once)', () => {
    const hooks = JSON.parse(fs.readFileSync(path.join(__dirname, 'hooks.json'), 'utf8')).hooks;
    const guard = hooks.PreToolUse.find((g) => JSON.stringify(g).includes('guard-no-progress.js'));
    assert.ok(!matcherFires(guard.matcher, 'Bash'));
    const tools = ['Read', 'Edit', 'BashOutput', 'Monitor', 'ToolSearch', 'SendMessage', 'Task', 'mcp__gopls__x', 'mcp__plugin_p_s__t'];
    const missed = tools.filter((t) => !matcherFires(guard.matcher, t));
    assert.deepEqual(missed, [], `matcher ${JSON.stringify(guard.matcher)} gives these tools no guard`);
  });
});
