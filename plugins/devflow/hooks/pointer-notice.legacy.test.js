'use strict';

// Test list (TRD 72-14, objective 72-install-and-naming-cleanup, INST-05). The final
// devflow@aocyber release: a SessionStart notice that points at AOForge, the manifests, and the
// marketplace entry. The hook runs in a spawned node with a fake HOME.
//
// 5. No AOForge runtime marker (~/.claude/aoforge/.plugin-version): stdout is one JSON object,
//    valid under the SessionStart model in plugins/aoforge/hooks/__fixtures__/hook-output-schema.js,
//    with a systemMessage naming AOForge, aoforge@aocyber and the install command, and an
//    additionalContext telling Claude to route /devflow: requests to /aoforge:; exit 0.
//    5s The SessionStart model itself: the documented example passes; decision, an unknown key,
//       a wrong hookEventName, a non-string additionalContext and a non-array watchPaths fail.
// 6. Marker present: no stdout, exit 0.
// 7. Unreadable HOME (mode 000): no stdout, exit 0 (fail open: when in doubt, say nothing).
// 8. plugins/devflow/.claude-plugin/plugin.json is named devflow at version 3.0.0 (a pointer
//    major by coexistence.POINTER_MAJOR); hooks/hooks.json has exactly one hook (SessionStart ->
//    pointer-notice.js); the plugin holds only .claude-plugin, README.md, hooks and skills (no
//    agents, no runtime, no statusLine), and hooks/ holds only the notice and this test.
// 9. .claude-plugin/marketplace.json lists aoforge (./plugins/aoforge) and devflow
//    (./plugins/devflow, the plugin.json version); package.json `npm test` runs this plugin's tests.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PLUGIN_ROOT, '..', '..');
const HOOK = path.join(__dirname, 'pointer-notice.js');
const { sessionStartProblems } = require(path.join(REPO_ROOT, 'plugins', 'aoforge', 'hooks', '__fixtures__', 'hook-output-schema.js'));
const { POINTER_MAJOR } = require(path.join(REPO_ROOT, 'plugins', 'aoforge', 'aoforge', 'bin', 'lib', 'coexistence.cjs'));

const readJson = (...rel) => JSON.parse(fs.readFileSync(path.join(...rel), 'utf8'));

/** A fake HOME; `marker` writes the AOForge runtime marker into it. */
function fakeHome({ marker = false } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pointer-notice-'));
  if (marker) {
    fs.mkdirSync(path.join(home, '.claude', 'aoforge'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', 'aoforge', '.plugin-version'), '3.0.0\n');
  }
  return {
    home,
    cleanup: () => {
      fs.chmodSync(home, 0o700);
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

function runHook(home) {
  const payload = { session_id: 's-1', hook_event_name: 'SessionStart', source: 'startup', cwd: home };
  const r = spawnSync(process.execPath, [HOOK], {
    env: { ...process.env, HOME: home, USERPROFILE: home },
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 10000,
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, error: r.error };
}

describe('5: no AOForge runtime marker', () => {
  test('5: one valid SessionStart JSON object that points at AOForge; exit 0', () => {
    const h = fakeHome();
    try {
      const r = runHook(h.home);
      assert.equal(r.error, undefined);
      assert.equal(r.code, 0, r.stderr);
      assert.ok(r.stdout.trim().startsWith('{'), `stdout: ${r.stdout}`);
      const out = JSON.parse(r.stdout);
      assert.deepEqual(sessionStartProblems(out), []);

      assert.equal(typeof out.systemMessage, 'string');
      assert.match(out.systemMessage, /AOForge/);
      assert.match(out.systemMessage, /`\/plugin install aoforge@aocyber`/);
      assert.match(out.systemMessage, /`claude plugin disable devflow@aocyber`/);

      const ctx = out.hookSpecificOutput.additionalContext;
      assert.match(ctx, /[Rr]oute every \/devflow: request to the matching \/aoforge: command/);
      assert.match(ctx, /aoforge@aocyber/);
      for (const s of [out.systemMessage, ctx]) assert.ok(s.length < 10000, 'under the 10,000-character cap');
    } finally {
      h.cleanup();
    }
  });
});

describe('5s: the SessionStart output model', () => {
  const ok = { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'ctx', sessionTitle: 't' } };

  test('5s-a: the documented example and the universal fields pass', () => {
    assert.deepEqual(sessionStartProblems(ok), []);
    assert.deepEqual(sessionStartProblems({ systemMessage: 'hi', suppressOutput: true }), []);
    assert.deepEqual(
      sessionStartProblems({
        hookSpecificOutput: { hookEventName: 'SessionStart', watchPaths: ['/a'], reloadSkills: true, initialUserMessage: 'go' },
      }),
      [],
    );
  });

  test('5s-b: decision control, unknown keys and wrong types fail', () => {
    assert.ok(sessionStartProblems({ decision: 'block', reason: 'x' }).length >= 2);
    assert.ok(sessionStartProblems({ extra: 1 }).some((p) => /unknown top-level key "extra"/.test(p)));
    assert.ok(
      sessionStartProblems({ hookSpecificOutput: { hookEventName: 'Stop' } }).some((p) => /hookEventName/.test(p)),
    );
    assert.ok(
      sessionStartProblems({ hookSpecificOutput: { hookEventName: 'SessionStart', permissionDecision: 'allow' } }).some((p) =>
        /permissionDecision/.test(p),
      ),
    );
    assert.ok(
      sessionStartProblems({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 3 } }).some((p) =>
        /additionalContext/.test(p),
      ),
    );
    assert.ok(
      sessionStartProblems({ hookSpecificOutput: { hookEventName: 'SessionStart', watchPaths: '/a' } }).some((p) =>
        /watchPaths/.test(p),
      ),
    );
    assert.ok(sessionStartProblems({ systemMessage: 1 }).some((p) => /systemMessage/.test(p)));
    assert.deepEqual(sessionStartProblems('text'), ['output is not a JSON object']);
  });
});

test('6: with the AOForge runtime marker: no stdout, exit 0', () => {
  const h = fakeHome({ marker: true });
  try {
    const r = runHook(h.home);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, '');
  } finally {
    h.cleanup();
  }
});

test('7: unreadable HOME: no stdout, exit 0', { skip: process.getuid && process.getuid() === 0 ? 'root reads mode 000' : false }, () => {
  const h = fakeHome();
  try {
    fs.chmodSync(h.home, 0o000);
    const r = runHook(h.home);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, '');
  } finally {
    h.cleanup();
  }
});

describe('8: the pointer plugin manifests', () => {
  test('8a: plugin.json is devflow at 3.0.0, a pointer major, with no statusLine', () => {
    const p = readJson(PLUGIN_ROOT, '.claude-plugin', 'plugin.json');
    assert.equal(p.name, 'devflow');
    assert.equal(p.version, '3.0.0');
    assert.ok(Number(p.version.split('.')[0]) >= POINTER_MAJOR, 'coexistence reads it as the pointer');
    assert.match(p.description, /aoforge@aocyber/);
    assert.equal(p.license, 'MIT');
    assert.equal(p.repository, 'https://github.com/AO-Cyber-Systems/aoforge-claude');
    assert.equal(p.homepage, 'https://github.com/AO-Cyber-Systems/aoforge-claude');
    assert.equal('statusLine' in p, false);
  });

  test('8b: hooks.json registers exactly one hook: SessionStart -> pointer-notice.js', () => {
    const h = readJson(PLUGIN_ROOT, 'hooks', 'hooks.json');
    assert.deepEqual(Object.keys(h.hooks), ['SessionStart']);
    const commands = h.hooks.SessionStart.flatMap((g) => g.hooks.map((x) => `${x.type} ${x.command}`));
    assert.deepEqual(commands, ['command node ${CLAUDE_PLUGIN_ROOT}/hooks/pointer-notice.js']);
  });

  test('8c: the plugin ships no agents, no runtime and no other hook', () => {
    const top = fs.readdirSync(PLUGIN_ROOT).filter((n) => n !== '.DS_Store');
    assert.deepEqual(top.sort(), ['.claude-plugin', 'README.md', 'hooks', 'skills']);
    assert.equal(fs.existsSync(path.join(PLUGIN_ROOT, 'agents')), false);
    assert.deepEqual(fs.readdirSync(path.join(PLUGIN_ROOT, 'hooks')).sort(), [
      'hooks.json',
      'pointer-notice.js',
      'pointer-notice.legacy.test.js',
    ]);
  });
});

describe('9: marketplace and npm test', () => {
  test('9a: the marketplace lists aoforge and the devflow pointer with the right sources', () => {
    const m = readJson(REPO_ROOT, '.claude-plugin', 'marketplace.json');
    const byName = Object.fromEntries(m.plugins.map((p) => [p.name, p]));
    assert.equal(byName.aoforge.source, './plugins/aoforge');
    assert.equal(byName.devflow.source, './plugins/devflow');
    assert.equal(byName.devflow.version, readJson(PLUGIN_ROOT, '.claude-plugin', 'plugin.json').version);
  });

  test('9b: npm test runs the pointer tests', () => {
    const pkg = readJson(REPO_ROOT, 'package.json');
    assert.ok(pkg.scripts.test.includes("'plugins/devflow/**/*.test.js'"), pkg.scripts.test);
  });
});
