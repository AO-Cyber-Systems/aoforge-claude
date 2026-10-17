'use strict';

// legacy-layout-guard.legacy.test.cjs (objective 78, TRD 78-07, SC-4). In a legacy-only project (only the
// pre-rename planning directory, at the cwd or an ancestor below $HOME, no `.aoforge/` nearer), every aof-tools
// command that reads or writes the project's planning tree exits 1 with planning-layout.legacyLayoutMessage(root)
// and creates no `.aoforge/`. doctor and validate report the layout instead; commands that touch only
// ~/.claude/aoforge, git config or files outside the planning tree run.
//
// Test list (outermost first; TRD 78-07 numbering):
//   5. Legacy-only cwd (the root, and a subdirectory through --cwd): `state load`, `init plan-objective 1`,
//      `roadmap analyze`, `objective add "X"`, `config-set workflow.x true`, `todo add "x"`, `upgrade --apply`,
//      `planning mode` and `commit "x" --files a` each exit 1 with stderr carrying legacyLayoutMessage(root); no
//      `.aoforge/` appears and the legacy directory is byte-identical.
//   6. Same cwd: `doctor --raw` (exit 0, the note) and `validate health --raw` (exit 0, status broken, W066) report;
//      `resolve-model executor`, `current-timestamp`, `generate-slug "a b"`, `upgrade --global --check` and
//      `state load --help` run (exit 0); `config-get workflow.auto_advance` is not guarded either, but since TRD 78-11
//      it reads `.aoforge/config.json` only, so it exits 1 with its own "No config.json found" error (never the legacy
//      config); still no `.aoforge/`.
//   7. An `.aoforge/` project nested below a legacy one: commands run there (the nearer real project wins) and the
//      outer legacy directory is untouched. A both-layout project: commands run (W066 both is advisory).
//   8. legacyLayoutGuard, table-driven over every command in help.cjs COMMANDS: the exempt set equals
//      EXEMPT_COMMANDS (pinned below, each with a non-empty reason); every other `mutates` command and `init` is
//      refused in a legacy-only root; every remaining command passes; nothing is refused outside a legacy root;
//      `upgrade --global|--prune|--register` and any help flag pass; an unknown command passes.
//
// Fixtures: legacy-layout-fixtures.planningProject / nestedProject (hand-built trees, fake HOME, hermetic env).

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { NAMES, LEGACY } = require('./legacy-names.cjs');
const { legacyLayoutMessage } = require('./planning-layout.cjs');
const { COMMANDS } = require('./help.cjs');
const { planningProject, nestedProject } = require('./__fixtures__/legacy-layout-fixtures.cjs');

const AOF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const NEW = NAMES.planningDir;
const OLD = LEGACY.planningDir;

/** The commands the guard lets through in a legacy-only project, decided with grep evidence (see the module). */
const EXPECTED_EXEMPT = [
  'calibrate', 'changelog', 'doctor', 'estimate', 'exec-context', 'global-config', 'handoff', 'merge-driver',
  'project-accept', 'project-decline', 'transcript-export', 'validate',
];

const REFUSED = [
  ['state', 'load'],
  ['init', 'plan-objective', '1'],
  ['roadmap', 'analyze'],
  ['objective', 'add', 'X'],
  ['config-set', 'workflow.x', 'true'],
  ['todo', 'add', 'x'],
  ['upgrade', '--apply'],
  ['planning', 'mode'],
  ['commit', 'x', '--files', 'a'],
];

const RUN_NORMALLY = [
  ['resolve-model', 'executor'],
  ['current-timestamp'],
  ['generate-slug', 'a b'],
  ['upgrade', '--global', '--check'],
  ['state', 'load', '--help'],
];

/** Every file under `dir`, relative path -> content. */
function snapshotTree(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else out[path.relative(dir, abs)] = fs.readFileSync(abs, 'utf-8');
    }
  };
  walk(dir);
  return out;
}

/** Every directory named `.aoforge` under `dir` (`.git` skipped). */
function newDirsUnder(dir) {
  const found = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === '.git') continue;
      const abs = path.join(d, e.name);
      if (e.name === NEW) found.push(abs);
      walk(abs);
    }
  };
  walk(dir);
  return found;
}

/** aof-tools with `--cwd <dir>` from the fixture's neutral base directory, in the fixture's hermetic env. */
function runAt(p, dir, args) {
  const r = spawnSync(process.execPath, [AOF_TOOLS, '--cwd', dir, ...args], {
    cwd: path.dirname(p.root), env: p.env, encoding: 'utf-8', timeout: 60000,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', out: `${r.stdout || ''}${r.stderr || ''}` };
}

const guardModule = () => require('./legacy-layout-guard.cjs');

// ─── 5. refusals ──────────────────────────────────────────────────────────────

describe('5. a legacy-only project: planning-tree commands refuse with the one message', () => {
  let p;
  let message;
  let legacyBefore;
  before(() => {
    p = planningProject({ layout: 'legacy', git: true });
    fs.mkdirSync(path.join(p.root, 'src', 'deep'), { recursive: true });
    message = legacyLayoutMessage(p.root);
    legacyBefore = snapshotTree(path.join(p.root, OLD));
  });
  after(() => p.cleanup());

  for (const args of REFUSED) {
    test(`5. ${args.join(' ')}: exit 1 with the legacy-layout message, at the root and from a subdirectory`, () => {
      for (const dir of [p.root, path.join(p.root, 'src', 'deep')]) {
        const r = runAt(p, dir, args);
        assert.equal(r.status, 1, `${args.join(' ')} in ${dir}\n${r.out}`);
        assert.ok(r.stderr.includes(message), `stderr lacks the message:\n${r.out}`);
      }
    });
  }

  test(`5. no ${NEW}/ appears and the legacy directory is byte-identical`, () => {
    assert.deepEqual(newDirsUnder(p.root), []);
    assert.deepEqual(snapshotTree(path.join(p.root, OLD)), legacyBefore);
  });
});

// ─── 6. reporters and commands that never touch the planning tree ─────────────

describe('6. a legacy-only project: doctor and validate report, global commands run', () => {
  let p;
  before(() => { p = planningProject({ layout: 'legacy', git: true }); });
  after(() => p.cleanup());

  test('6. doctor --raw: exit 0 and the note carries the legacy-layout message', () => {
    const r = runAt(p, p.root, ['doctor', '--raw']);
    assert.equal(r.status, 0, r.out);
    assert.ok(r.stdout.includes(legacyLayoutMessage(p.root)), r.out);
  });

  test('6. validate health --raw: exit 0, status broken, one W066 error', () => {
    const r = runAt(p, p.root, ['validate', 'health', '--raw']);
    assert.equal(r.status, 0, r.out);
    const j = JSON.parse(r.stdout);
    assert.equal(j.status, 'broken');
    assert.deepEqual(j.errors.map((i) => i.code), ['W066']);
  });

  for (const args of RUN_NORMALLY) {
    test(`6. ${args.join(' ')} runs (exit 0)`, () => {
      const r = runAt(p, p.root, args);
      assert.equal(r.status, 0, r.out);
      assert.equal(r.stderr.includes(legacyLayoutMessage(p.root)), false, r.out);
    });
  }

  test('6. config-get workflow.auto_advance is not guarded: no .aoforge/config.json, so its own error (TRD 78-11)', () => {
    const r = runAt(p, p.root, ['config-get', 'workflow.auto_advance']);
    assert.equal(r.status, 1, r.out);
    assert.ok(r.stderr.includes(`No config.json found at ${path.join(p.root, NEW, 'config.json')}`), r.out);
    assert.equal(r.stderr.includes(legacyLayoutMessage(p.root)), false, r.out);
  });

  test(`6. still no ${NEW}/`, () => {
    assert.deepEqual(newDirsUnder(p.root), []);
  });
});

// ─── 7. the nearest real project wins ─────────────────────────────────────────

describe('7. nested and both-layout projects run normally', () => {
  test('7. an .aoforge/ project nested below a legacy one: commands run there; the outer legacy tree is untouched', () => {
    const p = planningProject({ layout: 'legacy', git: true });
    try {
      const inner = nestedProject(p.root, 'inner', { layout: 'aoforge' });
      const outerBefore = snapshotTree(path.join(p.root, OLD));
      const load = runAt(p, inner, ['state', 'load', '--raw']);
      assert.equal(load.status, 0, load.out);
      assert.ok(load.stdout.includes('state_exists=true'), load.out);
      const add = runAt(p, inner, ['objective', 'add', 'Second']);
      assert.equal(add.status, 0, add.out);
      assert.ok(fs.existsSync(path.join(inner, NEW, 'objectives', '02-second')), add.out);
      assert.deepEqual(snapshotTree(path.join(p.root, OLD)), outerBefore);
      assert.deepEqual(newDirsUnder(p.root), [path.join(inner, NEW)]);
    } finally {
      p.cleanup();
    }
  });

  test('7. a both-layout project: state load and objective add run', () => {
    const p = planningProject({ layout: 'both', git: true });
    try {
      assert.equal(runAt(p, p.root, ['state', 'load', '--raw']).status, 0);
      const add = runAt(p, p.root, ['objective', 'add', 'Second']);
      assert.equal(add.status, 0, add.out);
      assert.ok(fs.existsSync(path.join(p.root, NEW, 'objectives', '02-second')));
    } finally {
      p.cleanup();
    }
  });
});

// ─── 8. the classification table ──────────────────────────────────────────────

describe('8. legacyLayoutGuard over every command in help.cjs COMMANDS', () => {
  let legacy;
  let current;
  before(() => {
    legacy = planningProject({ layout: 'legacy', git: false });
    current = planningProject({ layout: 'aoforge', git: false });
  });
  after(() => { legacy.cleanup(); current.cleanup(); });

  const guard = (cwd, args, home) => guardModule().legacyLayoutGuard({
    command: args[0], args, cwd, commands: COMMANDS, home,
  });

  test('8. EXEMPT_COMMANDS is frozen, equals the pinned list, and every entry is a mutating command with a reason', () => {
    const { EXEMPT_COMMANDS } = guardModule();
    assert.ok(Object.isFrozen(EXEMPT_COMMANDS));
    assert.deepEqual(Object.keys(EXEMPT_COMMANDS).sort(), EXPECTED_EXEMPT);
    for (const [name, reason] of Object.entries(EXEMPT_COMMANDS)) {
      assert.ok(COMMANDS[name], `${name} is a command`);
      assert.equal(COMMANDS[name].mutates, true, `${name}: only a mutating command needs an exemption`);
      assert.equal(typeof reason, 'string', name);
      assert.ok(reason.trim().length > 0, `${name} has a reason`);
    }
  });

  test('8. every command: refused when it mutates (or is init) and is not exempt; otherwise null', () => {
    const { EXEMPT_COMMANDS } = guardModule();
    const message = legacyLayoutMessage(legacy.root);
    const refused = [];
    for (const name of Object.keys(COMMANDS).sort()) {
      const expectRefusal = (COMMANDS[name].mutates === true || name === 'init') && !(name in EXEMPT_COMMANDS);
      const got = guard(legacy.root, [name], legacy.home);
      if (expectRefusal) {
        assert.deepEqual(got, { root: legacy.root, message }, name);
        refused.push(name);
      } else {
        assert.equal(got, null, name);
      }
      assert.equal(guard(current.root, [name], current.home), null, `${name} outside a legacy root`);
    }
    for (const name of ['init', 'state', 'commit', 'upgrade', 'tokens', 'skill-active', 'adopt']) {
      assert.ok(refused.includes(name), `${name} is refused`);
    }
  });

  test('8. upgrade --global, --prune and --register pass; --apply and --check refuse', () => {
    for (const args of [['upgrade', '--global', '--check'], ['upgrade', '--prune', '--dry-run'], ['upgrade', '--register']]) {
      assert.equal(guard(legacy.root, args, legacy.home), null, args.join(' '));
    }
    for (const args of [['upgrade', '--apply'], ['upgrade', '--check'], ['upgrade']]) {
      assert.notEqual(guard(legacy.root, args, legacy.home), null, args.join(' '));
    }
  });

  test('8. a help flag, an unknown command and a missing command pass', () => {
    assert.equal(guard(legacy.root, ['state', 'load', '--help'], legacy.home), null);
    assert.equal(guard(legacy.root, ['init', '-h'], legacy.home), null);
    assert.equal(guard(legacy.root, ['no-such-command'], legacy.home), null);
    assert.equal(guard(legacy.root, [], legacy.home), null);
  });

  test('8. a subdirectory of the legacy root is covered; $HOME holding the layout is not', () => {
    const sub = path.join(legacy.root, 'a', 'b');
    fs.mkdirSync(sub, { recursive: true });
    assert.deepEqual(guard(sub, ['state'], legacy.home), { root: legacy.root, message: legacyLayoutMessage(legacy.root) });
    assert.equal(guard(sub, ['state'], legacy.root), null, 'the walk never returns $HOME');
  });
});
