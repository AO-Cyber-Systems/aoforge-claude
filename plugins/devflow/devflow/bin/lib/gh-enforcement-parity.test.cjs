'use strict';

/**
 * gh-enforcement-parity.test.cjs (TRD 50-12): D-01 for objective 50. With `github.store` off nothing new happens and no `gh`
 * is called, except the explicit `gh setup` command, which is a GitHub command by design (its disabled case is test 9).
 *
 * The baseline is the pre-objective-46 shape: the same project with no `github` block at all. Each store-off variant (github
 * enabled with no `store` key, and with `store: false`) is run through the same commands and must produce the same
 * observable results as the baseline, and every one of them runs behind a recording `gh` PATH shim that must stay empty.
 *
 *   8a  `df-tools commit` on the default branch and on an unlinked branch lands exactly as the baseline: result keys
 *       `committed/hash/reason` only, a message with no `Refs`, and no `.override-log.jsonl`
 *   8b  the gh-flush hook (PostToolUse after a commit, and Stop) is silent and spawns nothing, even over a journal left behind
 *       by an earlier store-mode life of the project (the hook never reads it)
 *   8c  `validate health` reports the baseline's codes: none of W057-W061, and nothing a `github` block adds
 *   8d  doctor check 25 (`gh-store-sync`) is ok, "not a store-mode project"
 *   8e  nothing store-shaped appears on disk: no outbox, no mapping, no override log
 *   9   `gh setup` with `github.enabled` false (or no github block): skipped, exit 0, zero gh calls, no file written
 *
 * Children are the real `df-tools.cjs` and `gh-flush.js`. Every repo is a disposable `git init -b main` under the OS temp dir
 * with a fake HOME, GIT_CONFIG_GLOBAL=/dev/null and temp outbox / gh cache / hook-marker directories. Nothing here touches this
 * repository, the real ~/.claude, the network or any port.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const outbox = require('./gh-outbox.cjs');
const fx = require('./__fixtures__/upgrade-fixtures.cjs');
const { installGhShim } = require('./__fixtures__/gh-shim.cjs');
const { makeStoreProject } = require('./__fixtures__/gh-store-fixtures.cjs');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const TOOLS = path.join(PLUGIN_ROOT, 'devflow', 'bin', 'df-tools.cjs');
const HOOK = path.join(PLUGIN_ROOT, 'hooks', 'gh-flush.js');
const HAS_GIT = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;

const SRC = 'src/keep.cjs';

/** The store-off shapes that must all behave like a project that never heard of GitHub. */
const BASELINE = { name: 'baseline (no github block)', github: null };
const VARIANTS = [
  { name: 'github enabled, no store key', github: { enabled: true, repo: 'o/r' } },
  { name: 'github enabled, store false', github: { enabled: true, repo: 'o/r', store: false } },
];

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Harness ─────────────────────────────────────────────────────────────────

function tmpDir(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  cleanup.push(dir);
  return dir;
}

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

function git(p, ...args) {
  return execFileSync('git', ['-C', p.root, ...args], {
    env: fx.gitEnv(p.home), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * A local-mode git repo on `main`: the makeStoreProject fixture (objective 7 and its TRDs) with `commit_docs` on, the
 * `github` block replaced by `github` (null removes it), one tracked source file and NO store gitignore block, so `.planning/`
 * is tracked as it is today. A recording `gh` shim (every call fails) sits first on PATH.
 */
function localRepo(github) {
  const base = tmpDir('df-parity-e2e-');
  const proj = makeStoreProject({ store: false });
  cleanup.push(proj.root);
  const root = fs.realpathSync(proj.root);
  const home = fx.makeFakeHome();
  cleanup.push(home);

  const config = { commit_docs: true };
  if (github) config.github = github;
  write(root, '.planning/config.json', `${JSON.stringify(config)}\n`);
  write(root, SRC, 'module.exports = 0;\n');
  fx.initGitFixture(root, home);

  const shim = installGhShim({ dir: path.join(base, 'shim'), table: {}, defaultCode: 1 });
  return { root, home, shim, base, outbox: path.join(base, 'outbox'), markers: path.join(base, 'markers') };
}

function childEnv(p, extra = {}) {
  const gitEnv = fx.gitEnv(p.home);
  const env = p.shim.env({
    HOME: p.home,
    XDG_CONFIG_HOME: gitEnv.XDG_CONFIG_HOME,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    DEVFLOW_OUTBOX_DIR: p.outbox,
    DEVFLOW_HOOK_MARKER_DIR: p.markers,
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    ...extra,
  });
  for (const key of [
    'DEVFLOW_ALLOW_RAW_COMMIT', 'DEVFLOW_SKIP_GH_GATE', 'DEVFLOW_SKIP_GH_GATE_REASON',
    'DEVFLOW_SKIP_GH_FLUSH_HOOK', 'DEVFLOW_GH_FLUSH_TIMEOUT_MS',
  ]) {
    if (!(key in extra)) delete env[key];
  }
  return env;
}

function df(p, args) {
  const r = spawnSync(process.execPath, [TOOLS, '--cwd', p.root, ...args], {
    cwd: p.root, env: childEnv(p), encoding: 'utf-8', timeout: 120000,
  });
  const out = (r.stdout || '').trim();
  let json = null;
  try { json = JSON.parse(out); } catch { /* not JSON */ }
  return { status: r.status, out, err: (r.stderr || '').trim(), json };
}

function hook(p, payload) {
  return spawnSync(process.execPath, [HOOK], {
    cwd: p.root, env: childEnv(p), input: JSON.stringify(payload), encoding: 'utf-8', timeout: 120000,
  });
}

const postCommit = (p) => ({
  hook_event_name: 'PostToolUse',
  tool_name: 'Bash',
  tool_input: { command: `node ${TOOLS} --cwd ${p.root} commit "feat(50-12): parity" --files ${SRC}` },
  cwd: p.root,
  session_id: 'gh-enforcement-parity',
});
const stopEvent = (p) => ({ hook_event_name: 'Stop', cwd: p.root, session_id: 'gh-enforcement-parity', stop_hook_active: false });

const headMessage = (p) => execFileSync('git', ['-C', p.root, 'log', '-1', '--format=%B'], {
  env: fx.gitEnv(p.home), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
}).replace(/\n+$/, '');

/** `df-tools commit` of SRC on the current branch, with the hash (which differs per repo) reduced to "a hash". */
function commitOn(p, branch, n) {
  if (branch !== 'main') git(p, 'checkout', '-q', '-b', branch);
  write(p.root, SRC, `module.exports = ${n};\n`);
  const r = df(p, ['commit', `feat(50-12): parity ${n}`, '--files', SRC]);
  assert.equal(r.status, 0, `${r.out} ${r.err}`);
  assert.ok(r.json, r.out);
  return { status: r.status, result: { ...r.json, hash: typeof r.json.hash }, message: headMessage(p) };
}

/** validate health, as a comparable value: the project's path normalised away. */
function healthOf(p) {
  const r = df(p, ['validate', 'health', '--raw']);
  assert.ok(r.json, `validate health printed JSON: ${r.out} ${r.err}`);
  const clean = (items) => items.map((i) => ({ ...i, message: String(i.message).split(p.root).join('<root>') }));
  return { status: r.json.status, errors: clean(r.json.errors), warnings: clean(r.json.warnings), info: clean(r.json.info) };
}

const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);

// ─── 8: store off, every new behaviour is inert ──────────────────────────────

describe('D-01 parity: store off, objective 50 changes nothing (test 8)', () => {
  /** Everything observable about one project after the same script. */
  function run(variant) {
    const p = localRepo(variant.github);
    const snapshot = {
      commitOnMain: commitOn(p, 'main', 1),
      commitOnUnlinked: commitOn(p, 'feat/x', 2),
      hookAfterCommit: null,
      hookOnStop: null,
      health: healthOf(p),
    };
    const post = hook(p, postCommit(p));
    const stop = hook(p, stopEvent(p));
    snapshot.hookAfterCommit = { status: post.status, stdout: post.stdout };
    snapshot.hookOnStop = { status: stop.status, stdout: stop.stdout };
    return { p, snapshot };
  }

  test('8a. commit on the default branch and on an unlinked branch lands exactly as without a github block', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const base = run(BASELINE);
    assert.deepEqual(Object.keys(base.snapshot.commitOnMain.result).sort(), ['committed', 'hash', 'reason'], 'today\'s result keys');
    assert.equal(base.snapshot.commitOnMain.result.committed, true);
    assert.equal(base.snapshot.commitOnMain.result.reason, 'committed');
    assert.equal(base.snapshot.commitOnMain.message, 'feat(50-12): parity 1', 'no Refs paragraph');
    assert.equal(base.snapshot.commitOnUnlinked.message, 'feat(50-12): parity 2');

    for (const variant of VARIANTS) {
      const got = run(variant);
      assert.deepEqual(got.snapshot.commitOnMain, base.snapshot.commitOnMain, `${variant.name}: commit on main`);
      assert.deepEqual(got.snapshot.commitOnUnlinked, base.snapshot.commitOnUnlinked, `${variant.name}: commit on feat/x`);
      assert.ok(!fs.existsSync(path.join(got.p.root, '.planning', '.override-log.jsonl')), `${variant.name}: no override log`);
      assert.deepEqual(got.p.shim.readCalls(), [], `${variant.name}: zero gh calls`);
    }
    assert.deepEqual(base.p.shim.readCalls(), [], 'baseline: zero gh calls');
  });

  test('8b. the gh-flush hook is silent on PostToolUse and Stop, and spawns no gh', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    for (const variant of [BASELINE, ...VARIANTS]) {
      const { p, snapshot } = run(variant);
      for (const [event, r] of [['PostToolUse', snapshot.hookAfterCommit], ['Stop', snapshot.hookOnStop]]) {
        assert.equal(r.status, 0, `${variant.name}: ${event} exits 0`);
        assert.equal(r.stdout, '', `${variant.name}: ${event} is silent`);
      }
      assert.deepEqual(p.shim.readCalls(), [], `${variant.name}: zero gh calls`);
    }
  });

  test('8b2. a journal left behind by an earlier store-mode life is neither read nor flushed by the hook', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = localRepo({ enabled: true, repo: 'o/r', store: false });
    const queued = outbox.enqueue(p.root, [{
      kind: 'upsert-comment',
      target: { id: '7-01', kind: 'summary' },
      payload: { mode: 'replace', text: 'left over' },
    }], { env: childEnv(p) });
    assert.equal(queued.ok, true, JSON.stringify(queued));
    const journalBefore = files(p.outbox).map((f) => [f, fs.readFileSync(path.join(p.outbox, f), 'utf-8')]);
    assert.equal(journalBefore.length, 1, 'there is something to flush');

    for (const payload of [postCommit(p), stopEvent(p)]) {
      const r = hook(p, payload);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, '', `${payload.hook_event_name} is silent`);
    }
    assert.deepEqual(files(p.outbox).map((f) => [f, fs.readFileSync(path.join(p.outbox, f), 'utf-8')]), journalBefore, 'the journal is untouched');
    assert.deepEqual(p.shim.readCalls(), [], 'zero gh calls');
  });

  test('8c. validate health reports what the baseline reports: no W057-W061 and nothing a github block adds', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const base = healthOf(localRepo(BASELINE.github));
    const all = [...base.errors, ...base.warnings, ...base.info];
    assert.ok(all.length > 0, 'the fixture is imperfect enough that the comparison compares something');
    assert.deepEqual(all.filter((i) => ['W057', 'W058', 'W059', 'W060', 'W061'].includes(i.code)), []);

    // TRD 51-06: migration 0011 (the GitHub backfill, confirm-only) applies to a github-enabled local project, so
    // Check 13's W040 counts one more migration needing confirmation. That count is the one thing a github block adds.
    const confirmCount = (h) => {
      const w = h.warnings.find((i) => i.code === 'W040');
      const m = w && /(\d+) need confirmation/.exec(w.message);
      return m ? Number(m[1]) : 0;
    };
    const sansCount = (h) => ({
      ...h,
      warnings: h.warnings.map((i) => (i.code === 'W040' ? { ...i, message: i.message.replace(/\d+ need confirmation/, 'N need confirmation') } : i)),
    });
    for (const variant of VARIANTS) {
      const p = localRepo(variant.github);
      const health = healthOf(p);
      assert.equal(confirmCount(health), confirmCount(base) + 1, `${variant.name}: 0011 needs confirmation`);
      assert.deepEqual(sansCount(health), sansCount(base), `${variant.name}: same findings as the baseline`);
      assert.deepEqual(p.shim.readCalls(), [], `${variant.name}: zero gh calls`);
      assert.deepEqual(files(p.outbox), [], `${variant.name}: validate health created no outbox`);
    }
  });

  test('8d. doctor check 25 (gh-store-sync) is ok, "not a store-mode project"', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    for (const variant of [BASELINE, ...VARIANTS]) {
      const p = localRepo(variant.github);
      const r = df(p, ['doctor', '--json', '--path', p.root]);
      assert.ok(r.json, `${variant.name}: doctor printed JSON: ${r.out} ${r.err}`);
      const check = r.json.checks.find((c) => c.id === 'gh-store-sync');
      assert.ok(check, `${variant.name}: the check ran`);
      assert.equal(check.severity, 'ok', variant.name);
      assert.equal(check.finding, 'not a store-mode project', variant.name);
      assert.equal(check.fixable, false);
      assert.deepEqual(check.details.codes, []);
      assert.deepEqual(p.shim.readCalls(), [], `${variant.name}: zero gh calls`);
    }
  });

  test('8e. nothing store-shaped appears on disk after the whole script', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    for (const variant of VARIANTS) {
      const { p } = run(variant);
      assert.deepEqual(files(p.outbox), [], `${variant.name}: no outbox journal`);
      for (const name of ['.gh-mapping.json', '.override-log.jsonl', '.gh-sync-state.json']) {
        assert.ok(!fs.existsSync(path.join(p.root, '.planning', name)), `${variant.name}: no ${name}`);
      }
      assert.equal(git(p, 'status', '--porcelain', '--', '.planning/'), '', `${variant.name}: .planning/ stays tracked and clean`);
    }
  });
});

// ─── 9: gh setup, disabled ───────────────────────────────────────────────────

describe('gh setup is the one explicit GitHub command, and it is inert when disabled (test 9)', () => {
  const DISABLED = [
    { name: 'github.enabled false', github: { enabled: false, repo: 'o/r' } },
    { name: 'no github block', github: null },
  ];

  test('9. skipped, exit 0, zero gh calls and no file written, with and without --apply', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    for (const variant of DISABLED) {
      const p = localRepo(variant.github);
      for (const args of [[], ['--apply'], ['--refresh', '--require-wiki']]) {
        const r = df(p, ['gh', 'setup', ...args]);
        assert.equal(r.status, 0, `${variant.name} ${args.join(' ')}: ${r.out} ${r.err}`);
        assert.match(r.out, /github\.enabled is not true/, `${variant.name} ${args.join(' ')}`);
      }
      const raw = df(p, ['gh', 'setup', '--apply', '--raw']);
      assert.equal(raw.status, 0, `${raw.out} ${raw.err}`);
      assert.equal(raw.json.skipped, true, raw.out);
      assert.equal(raw.json.ok, false, raw.out);
      assert.deepEqual(p.shim.readCalls(), [], `${variant.name}: zero gh calls`);
      assert.ok(!fs.existsSync(path.join(p.root, '.github')), `${variant.name}: no workflow or template written`);
      assert.equal(git(p, 'status', '--porcelain'), '', `${variant.name}: the working tree is untouched`);
    }
  });
});
