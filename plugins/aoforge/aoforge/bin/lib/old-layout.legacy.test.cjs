'use strict';

// old-layout.legacy.test.cjs — SC-4 end to end (objective 78, TRD 78-12).
//
// AOForge 3.1.0 removed the one-release shims of the rename. A project still on the pre-rename layout must get a clear
// message naming the 3.0.x path, never silent breakage, and nothing may convert or create anything for it. This file
// walks one such project through every surface that meets it: the two SessionStart hooks, the next prompt, the CLI,
// the reporters and the retired migrations.
//
// Fixture: legacy-layout-fixtures.planningProject({ layout: 'legacy', configKey: 'legacy' }), a git project whose only
// planning directory is the pre-rename one and whose config.json carries the pre-rename stamp; a scratch HOME (the
// fixture's); and an environment holding one pre-rename variable, `<legacy prefix>SKIP_UPGRADE=1`. That variable is
// chosen on purpose: while the env alias existed it would have made upgrade-project skip, so (a) also proves the
// alias is gone.
//
// Test list (TRD 78-12 test-list case 1):
//  a. upgrade-project (SessionStart) -> exactly one global notice from it, carrying legacyLayoutMessage(root).
//  b. coexistence-guard (SessionStart) -> exactly one notice, naming the variable and its AOFORGE_* form.
//  c. route-results on the next prompt emits both notices once; a second prompt emits nothing.
//  d. `aof-tools state update-progress` and `aof-tools init plan-objective 1` -> exit 1 with the layout message.
//  e. `aof-tools validate health --raw` -> broken, the one error W066 with its fix; `aof-tools doctor --json` -> no
//     project resolved, the note is the layout message.
//  f. `aof-tools upgrade --apply --only 0012|0013|0014` in an `.aoforge/` scratch project -> the retired message,
//     exit 1, nothing written.
//  g. after a-f no `.aoforge/` exists under the legacy project, its legacy directory is byte-identical and git
//     status is unchanged.
//
// The real ~/.claude is never read or written: every spawn gets the fixture's HOME and a hermetic environment.

const { describe, test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { NAMES, LEGACY, SHIM_RELEASE } = require('./legacy-names.cjs');
const { legacyLayoutMessage } = require('./planning-layout.cjs');
const notices = require('./notices.cjs');
const upgrade = require('./upgrade.cjs');
const { planningProject } = require('./__fixtures__/legacy-layout-fixtures.cjs');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOKS = path.join(PLUGIN_ROOT, 'hooks');
const LEGACY_VAR = `${LEGACY.envPrefix}SKIP_UPGRADE`;
const NEW_VAR = `${NAMES.envPrefix}SKIP_UPGRADE`;
const SESSION = 'sess-old-layout-78-12';

/** Every file under `dir`, relative path -> content (the `.git` directory skipped). */
function snapshotTree(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else out[path.relative(dir, abs)] = fs.readFileSync(abs, 'utf-8');
    }
  };
  walk(dir);
  return out;
}

/** Every directory named like the AOForge planning directory under `dir` (`.git` skipped). */
function aoforgeDirsUnder(dir) {
  const found = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === '.git') continue;
      const abs = path.join(d, e.name);
      if (e.name === NAMES.planningDir) found.push(abs);
      walk(abs);
    }
  };
  walk(dir);
  return found;
}

/** The hook environment: the fixture's hermetic env, this repository's plugin, the one pre-rename variable. */
function hookEnv(p) {
  return {
    ...p.env,
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    [`${NAMES.envPrefix}SKIP_PRUNE`]: '1',
    [`${NAMES.envPrefix}SKIP_TRANSCRIPT_EXPORT`]: '1',
    [LEGACY_VAR]: '1',
  };
}

/** Spawn a hook at the project root with a JSON payload on stdin. */
function runHook(p, name, payload) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, name)], {
    cwd: p.root, env: hookEnv(p), encoding: 'utf-8', input: JSON.stringify(payload), timeout: 60000,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

const sessionStart = (p) => ({
  session_id: SESSION, cwd: p.root, hook_event_name: 'SessionStart', source: 'startup',
  transcript_path: path.join(p.home, '.claude', 'projects', '-fixture', `${SESSION}.jsonl`),
});
const promptSubmit = (p) => ({
  session_id: SESSION, cwd: p.root, hook_event_name: 'UserPromptSubmit', prompt: 'continue',
});

const globalNotices = (p) => notices.readNotices(notices.globalNoticesPath(p.home));

/** stdout as JSON, following an `@file:` spill. */
function jsonOf(r) {
  let text = r.stdout.trim();
  if (text.startsWith('@file:')) text = fs.readFileSync(text.slice('@file:'.length), 'utf-8');
  return JSON.parse(text);
}

// One legacy project for a-e and g, built once: the cases run in order and g checks what a-f left behind.
const legacy = planningProject({ layout: 'legacy', configKey: 'legacy', git: true });
const scratch = [];
after(() => {
  legacy.cleanup();
  for (const p of scratch) p.cleanup();
});

const ROOT = legacy.root;
const MESSAGE = legacyLayoutMessage(ROOT);
const legacyDirBefore = snapshotTree(path.join(ROOT, LEGACY.planningDir));
const statusBefore = legacy.git(['status', '--porcelain']);

describe('SC-4: a project still on the pre-rename layout, end to end (TRD 78-12)', () => {
  test('a. upgrade-project queues exactly one global notice carrying the layout message', () => {
    const r = runHook(legacy, 'upgrade-project.js', sessionStart(legacy));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '', 'SessionStart stdout stays empty');
    const mine = globalNotices(legacy).filter((n) => n.source === 'upgrade-project');
    assert.equal(mine.length, 1, JSON.stringify(globalNotices(legacy)));
    assert.equal(mine[0].key, `legacy-layout:${ROOT}`);
    assert.equal(mine[0].level, 'action');
    assert.equal(mine[0].message, MESSAGE);
    assert.equal(mine[0].consumed, false);
  });

  test('b. coexistence-guard queues exactly one notice naming the variable and its AOFORGE_* form', () => {
    const r = runHook(legacy, 'coexistence-guard.js', sessionStart(legacy));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '', 'SessionStart stdout stays empty');
    const mine = globalNotices(legacy).filter((n) => n.source === 'coexistence-guard');
    assert.equal(mine.length, 1, JSON.stringify(globalNotices(legacy)));
    const text = `${mine[0].message}\n${mine[0].detail || ''}`;
    assert.ok(text.includes(LEGACY_VAR), text);
    assert.ok(text.includes(NEW_VAR), text);
    assert.equal(globalNotices(legacy).length, 2, 'the two hooks queued one notice each and nothing else');
  });

  test('c. route-results emits both notices on the next prompt, and nothing on the one after', () => {
    const first = runHook(legacy, 'route-results.js', promptSubmit(legacy));
    assert.equal(first.status, 0, first.stderr);
    const context = JSON.parse(first.stdout).hookSpecificOutput.additionalContext;
    assert.equal(context.split(MESSAGE).length - 1, 1, context);
    assert.equal(context.split(LEGACY_VAR).length > 1, true, context);
    assert.ok(context.includes(NEW_VAR), context);
    assert.ok(globalNotices(legacy).every((n) => n.consumed === true), JSON.stringify(globalNotices(legacy)));

    const second = runHook(legacy, 'route-results.js', promptSubmit(legacy));
    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.stdout, '', 'a second prompt emits nothing');
  });

  test('d. state update-progress and init plan-objective refuse with the layout message', () => {
    for (const args of [['state', 'update-progress'], ['init', 'plan-objective', '1']]) {
      const r = legacy.run(args);
      assert.equal(r.status, 1, `${args.join(' ')}: ${r.out}`);
      assert.ok(r.stderr.includes(MESSAGE), `${args.join(' ')}: ${r.stderr}`);
    }
  });

  test('e. validate health is broken with the one W066 and its fix; doctor resolves no project and notes it', () => {
    const health = jsonOf(legacy.run(['validate', 'health', '--raw']));
    assert.equal(health.status, 'broken', JSON.stringify(health));
    assert.deepEqual(health.errors.map((i) => i.code), ['W066'], JSON.stringify(health.errors));
    const fix = String(health.errors[0].fix || '');
    assert.ok(fix.includes(SHIM_RELEASE), fix);
    assert.ok(fix.includes('git mv'), fix);

    const doctor = jsonOf(legacy.run(['doctor', '--json']));
    assert.equal(doctor.scope.project, null, JSON.stringify(doctor.scope));
    assert.ok(doctor.notes.includes(MESSAGE), JSON.stringify(doctor.notes));
  });

  test('f. upgrade --apply --only 0012|0013|0014 in an .aoforge/ project gives the retired message', () => {
    const p = planningProject({ layout: 'aoforge', configKey: 'aoforge', git: true });
    scratch.push(p);
    const before = snapshotTree(p.root);
    for (const id of ['0012', '0013', '0014']) {
      const r = p.run(['upgrade', '--apply', '--only', id, '--raw']);
      assert.equal(r.status, 1, `${id}: ${r.out}`);
      assert.ok(r.out.includes(`migration ${id} (${upgrade.RETIRED_MIGRATIONS[id]}) was retired`), `${id}: ${r.out}`);
      assert.ok(r.out.includes(SHIM_RELEASE), `${id}: ${r.out}`);
      assert.ok(r.out.includes('Upgrading from 2.x'), `${id}: ${r.out}`);
      assert.equal(/unknown migration id/.test(r.out), false, `${id}: ${r.out}`);
    }
    assert.deepEqual(snapshotTree(p.root), before, 'nothing written');
  });

  test('g. nothing converted or created: no .aoforge/, the legacy directory and git status unchanged', () => {
    assert.deepEqual(aoforgeDirsUnder(ROOT), []);
    assert.deepEqual(snapshotTree(path.join(ROOT, LEGACY.planningDir)), legacyDirBefore);
    assert.equal(legacy.git(['status', '--porcelain']), statusBefore);
  });
});
