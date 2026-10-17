'use strict';

// Test list (TRD 78-10, objective 78-remove-the-rename-shims, SC-1). AOForge 3.0.0 copied the legacy environment
// prefix onto the new one in every process it started (compat.cjs aliasLegacyEnv, TRD 72-04). 3.1 reads only the
// AOForge prefix: a user who still exports a legacy variable is told so by coexistence-guard's SessionStart notice
// and doctor check 16, and the variable has no effect.
//
// 1. Repo contract: the entry points (aof-tools.cjs, aoforge-watch.cjs, every hooks/*.js named in hooks/hooks.json
//    and the plugin.json statusLine script; the list is derived from the manifests, so a new hook is covered
//    automatically) never mention `aliasLegacyEnv`, comments included.
// 2. Behaviour: hooks/gate-edits.js, spawned in a scratch AOForge project (ambient, no skill marker) on a Write to a
//    tracked file, denies the write with only { [LEGACY.envPrefix + 'SKIP_EDIT_GATE']: '1' } set, exactly as with no
//    variable; with { AOFORGE_SKIP_EDIT_GATE: '1' } it allows the write (no output).
// 3. Behaviour: aof-tools started with only { [LEGACY.envPrefix + 'CALIBRATION_PATH']: <file> } does not see its
//    AOForge twin: `estimate task --class code --raw` names the scratch HOME's default calibration file, never the
//    legacy-prefixed one; with AOFORGE_CALIBRATION_PATH it names that file (control).
//
// Runtime model: read-only against the plugin tree; tests 2-3 write only to their own tmp dirs and spawn with an
// environment stripped of both prefixes and a scratch HOME, never the real ~/.claude. A mirror install (no hooks/
// beside the runtime directory) skips the whole file.

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
const CLI = path.join(PLUGIN_ROOT, NAMES.runtimeDir, 'bin', `${NAMES.cli}.cjs`);

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

/** Copy of process.env without either prefix, so the spawned process sees only what the test sets. */
function cleanEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith(NAMES.envPrefix) || k.startsWith(LEGACY.envPrefix)) continue;
    env[k] = v;
  }
  return { ...env, ...extra };
}

/** A fresh, realpath'd temp directory. */
function tmpDir(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

describe('compat-entry.repo.test.cjs', { skip: IS_PLUGIN_CHECKOUT ? false : 'not a plugin source checkout' }, () => {
  test('1: the entry point list holds the CLI, the watch daemon, every registered hook and the status line', () => {
    const list = entryPoints();
    assert.ok(list.includes(`${NAMES.runtimeDir}/bin/${NAMES.cli}.cjs`));
    assert.ok(list.includes(`${NAMES.runtimeDir}/bin/${NAMES.watch}.cjs`));
    assert.ok(list.includes('hooks/gate-edits.js'));
    assert.ok(list.includes('hooks/statusline.js'));
    assert.ok(list.length >= 20, `expected >= 20 entry points, got ${list.length}`);
    for (const rel of list) assert.ok(fs.existsSync(path.join(PLUGIN_ROOT, rel)), `${rel} does not exist`);
  });

  for (const rel of IS_PLUGIN_CHECKOUT ? entryPoints() : []) {
    test(`1: ${rel} never aliases the legacy environment prefix`, () => {
      const src = fs.readFileSync(path.join(PLUGIN_ROOT, rel), 'utf8');
      const lines = src.split('\n').flatMap((line, i) => (line.includes('aliasLegacyEnv') ? [`${i + 1}: ${line.trim()}`] : []));
      assert.deepEqual(lines, [], `${rel} still mentions aliasLegacyEnv`);
    });
  }

  describe('2: a hook ignores the legacy skip variable', () => {
    const HOOK = path.join(PLUGIN_ROOT, 'hooks', 'gate-edits.js');

    function run(extraEnv) {
      const root = tmpDir('compat-entry-');
      const home = tmpDir('compat-entry-home-');
      try {
        const git = (...args) => {
          const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
          assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
        };
        git('init', '-q');
        fs.mkdirSync(path.join(root, NAMES.planningDir));
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
          env: cleanEnv({ HOME: home, ...extraEnv }),
        });
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(home, { recursive: true, force: true });
      }
    }

    function decision(r) {
      assert.equal(r.status, 0, r.stderr);
      return r.stdout === '' ? 'allow' : JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
    }

    test('2a: without any skip variable the ambient write is denied (control)', () => {
      assert.equal(decision(run({})), 'deny');
    });

    test('2b: with only the legacy skip variable the write is still denied', () => {
      assert.equal(decision(run({ [`${LEGACY.envPrefix}SKIP_EDIT_GATE`]: '1' })), 'deny');
    });

    test('2c: with the AOForge skip variable the write is allowed (no output)', () => {
      assert.equal(decision(run({ [`${NAMES.envPrefix}SKIP_EDIT_GATE`]: '1' })), 'allow');
    });
  });

  describe('3: the CLI ignores a legacy-prefixed variable', () => {
    function estimate(extraEnv) {
      const cwd = tmpDir('compat-entry-cli-');
      const home = tmpDir('compat-entry-home-');
      try {
        const r = spawnSync(process.execPath, [CLI, 'estimate', 'task', '--class', 'code', '--raw'], {
          cwd,
          encoding: 'utf8',
          env: cleanEnv({ HOME: home, ...extraEnv }),
        });
        assert.equal(r.status, 0, r.stderr);
        return { stdout: r.stdout, home };
      } finally {
        fs.rmSync(cwd, { recursive: true, force: true });
        fs.rmSync(home, { recursive: true, force: true });
      }
    }

    test('3a: only the legacy-prefixed calibration path set -> the scratch HOME default is named, not that path', () => {
      const legacyFile = path.join(os.tmpdir(), 'compat-entry-no-such-dir', 'legacy-prefix-calibration.json');
      const { stdout, home } = estimate({ [`${LEGACY.envPrefix}CALIBRATION_PATH`]: legacyFile });
      assert.ok(!stdout.includes(legacyFile), `the CLI read the legacy-prefixed variable: ${stdout}`);
      assert.ok(stdout.includes(path.join(home, '.claude', NAMES.runtimeDir, 'calibration.json')), stdout);
    });

    test('3b: AOFORGE_CALIBRATION_PATH set -> that file is named (control)', () => {
      const newFile = path.join(os.tmpdir(), 'compat-entry-no-such-dir', 'aoforge-prefix-calibration.json');
      const { stdout } = estimate({ [`${NAMES.envPrefix}CALIBRATION_PATH`]: newFile });
      assert.ok(stdout.includes(newFile), stdout);
    });
  });
});
