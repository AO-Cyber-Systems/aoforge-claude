'use strict';

// Test list (TRD 72-04, objective 72-install-and-naming-cleanup, INST-02). Every process that
// starts from the AOForge plugin copies the legacy environment prefix onto the new one before it
// reads the environment (compat.cjs aliasLegacyEnv), so a user who still exports the legacy
// variables keeps the same behaviour for one release. The new-prefix value wins when both are set.
//
// 7. aof-tools.cjs, aoforge-watch.cjs, every hooks/*.js named in hooks/hooks.json and the
//    plugin.json statusLine script contain `aliasLegacyEnv(` before their first `process.env`
//    read. Comment lines are not reads.
// 8. Behaviour: hooks/gate-edits.js, spawned in a scratch AOForge project (ambient, no skill
//    marker) on a Write to a tracked file, allows the write (no deny output) with only
//    { [LEGACY.envPrefix + 'SKIP_EDIT_GATE']: '1' } set, and denies it without that variable.
//
// Runtime model: read-only against the plugin tree; test 8 writes only to its own tmp dir and
// spawns the hook with an environment stripped of both prefixes. A mirror install (no
// hooks/ beside the runtime directory) skips the whole file.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { NAMES, LEGACY } = require('./legacy-names.cjs');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOKS_JSON = path.join(PLUGIN_ROOT, 'hooks', 'hooks.json');
const PLUGIN_JSON = path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json');
const IS_PLUGIN_CHECKOUT = fs.existsSync(HOOKS_JSON) && fs.existsSync(PLUGIN_JSON);

const HOOK_SCRIPT_RE = /hooks\/([A-Za-z0-9_.-]+\.js)/g;

/** Every hook script a command string names, as `hooks/<name>.js`. */
function scriptsIn(value, into) {
  for (const m of JSON.stringify(value).matchAll(HOOK_SCRIPT_RE)) into.add(`hooks/${m[1]}`);
  return into;
}

/** The plugin's entry points, relative to the plugin root. */
function entryPoints() {
  const hooks = scriptsIn(JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8')).hooks, new Set());
  scriptsIn(JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8')).statusLine, hooks);
  return [
    `${NAMES.runtimeDir}/bin/${NAMES.cli}.cjs`,
    `${NAMES.runtimeDir}/bin/${NAMES.watch}.cjs`,
    ...[...hooks].sort(),
  ];
}

/** Offset of the first `needle` on a line that is not a comment, or -1. */
function firstInCode(src, needle) {
  let offset = 0;
  let inBlock = false;
  for (const line of src.split('\n')) {
    const t = line.trim();
    const start = offset;
    offset += line.length + 1;
    if (inBlock) {
      if (t.includes('*/')) inBlock = false;
      continue;
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) inBlock = true;
      continue;
    }
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('#!')) continue;
    const i = line.indexOf(needle);
    if (i !== -1) return start + i;
  }
  return -1;
}

/** Copy of process.env without either prefix, so the spawned hook sees only what the test sets. */
function cleanEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith(NAMES.envPrefix) || k.startsWith(LEGACY.envPrefix)) continue;
    env[k] = v;
  }
  return { ...env, ...extra };
}

describe('compat-entry.repo.test.cjs', { skip: IS_PLUGIN_CHECKOUT ? false : 'not a plugin source checkout' }, () => {
  test('7: the entry point list holds the CLI, the watch daemon, every registered hook and the status line', () => {
    const list = entryPoints();
    assert.ok(list.includes(`${NAMES.runtimeDir}/bin/${NAMES.cli}.cjs`));
    assert.ok(list.includes('hooks/gate-edits.js'));
    assert.ok(list.includes('hooks/statusline.js'));
    assert.ok(list.length >= 20, `expected >= 20 entry points, got ${list.length}`);
    for (const rel of list) assert.ok(fs.existsSync(path.join(PLUGIN_ROOT, rel)), `${rel} does not exist`);
  });

  for (const rel of IS_PLUGIN_CHECKOUT ? entryPoints() : []) {
    test(`7: ${rel} calls aliasLegacyEnv() before it reads process.env`, () => {
      const src = fs.readFileSync(path.join(PLUGIN_ROOT, rel), 'utf8');
      const alias = firstInCode(src, 'aliasLegacyEnv(');
      const env = firstInCode(src, 'process.env');
      assert.ok(alias !== -1, `${rel} never calls aliasLegacyEnv()`);
      assert.ok(env === -1 || alias < env, `${rel} reads process.env before it calls aliasLegacyEnv()`);
    });
  }

  describe('8: a hook honours the legacy skip variable', () => {
    const HOOK = path.join(PLUGIN_ROOT, 'hooks', 'gate-edits.js');

    function run(extraEnv) {
      const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'compat-entry-')));
      try {
        const git = (...args) => {
          const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
          assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
        };
        git('init', '-q');
        // the legacy planning directory: the hooks resolve it today and, after 72-06, as the fallback
        fs.mkdirSync(path.join(root, LEGACY.planningDir));
        fs.mkdirSync(path.join(root, 'src'));
        fs.writeFileSync(path.join(root, 'src', 'app.js'), 'module.exports = 1;\n');
        git('add', '--', 'src/app.js');
        const payload = {
          hook_event_name: 'PreToolUse',
          tool_name: 'Write',
          tool_input: { file_path: path.join(root, 'src', 'app.js'), content: 'module.exports = 2;\n' },
          cwd: root,
        };
        return spawnSync(process.execPath, [HOOK], {
          cwd: root,
          input: JSON.stringify(payload),
          encoding: 'utf8',
          env: cleanEnv(extraEnv),
        });
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }

    test('8a: without any skip variable the ambient write is denied', () => {
      const r = run({});
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    });

    test('8b: with only the legacy skip variable the write is allowed (no output)', () => {
      const r = run({ [`${LEGACY.envPrefix}SKIP_EDIT_GATE`]: '1' });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, '', `expected no decision, got: ${r.stdout}`);
    });
  });
});
