'use strict';

// planning-verbs.e2e.test.cjs (TRD 48-22) — one objective, run twice through the df-tools planning verbs.
//
// With GitHub as the store (SC3): plan -> execute -> verify driven only through the verbs leaves git seeing nothing
// but the code, and GitHub holding everything. With the store off (D-01): the same script is today's DevFlow — the
// same .planning/ files with the same bytes, zero gh calls, no outbox, .planning/ tracked.
//
// Test list -> criterion:
//   store mode (fake GitHub, local file:// wiki remote, migration 0010 applied)
//     1. setup: only config.json + STACK.md tracked under .planning/; .gitignore has the 0010 block     (SC3 setup)
//     2. the scenario: git status is empty after every verb, apart from the in-flight src/t<N>.cjs      (SC3)
//     3. GitHub holds the objective, 3 TRD sub-issues + blocked-by, summaries, verification, pages,
//        the todo and the closed quick issue                                                          (SC3, GWP-04)
//     4. delete the cache, gh pull --all -> byte-identical; a second pull writes nothing                (SC3)
//     5. validate health (spawned) -> no W055 after the scenario                                       (GWP-03)
//     6. negative: a Bash-style write to a cached TRD -> W055 naming the file and `plan put-trd`        (GWP-03)
//     7. negative: offline plan put-trd -> exit 3, journal + ledger; online gh outbox flush -> exit 0   (GWP-04)
//   store off (parity, D-01)
//     8. every verb writes exactly its draft's bytes; objective complete effects equal the pre-48 command on a twin;
//        zero gh calls; no outbox or ledger files
//     9. .planning/ is dirty after the verbs and clean after `df-tools commit --files .planning/` (still tracked)
//
// Driver: the 48-15 planning-verbs-cli `cmd*` functions in-process (so the fake GitHub is injectable through the
// gh-client seam); `df-tools commit`, `upgrade --apply --only 0010 --confirm`, `validate health` and the twin's
// `objective complete` are spawned (git/local only; a spawned child gets an offline gh shim that records calls).
//
// Hermetic: hermeticEnv() (temp HOME/outbox/gh-cache), applyGitTestEnv(), createWikiRemote() (file://), a fake clock.
// No network, never the real ~/.claude, never port 8080.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const gh = require('./gh.cjs');
const client = require('./gh-client.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');
const { createWikiRemote, gitAvailable, applyGitTestEnv } = require('./__fixtures__/wiki-remote.cjs');
const { makeE2eRepo, OBJECTIVE_DIR, REPO } = require('./__fixtures__/planning-e2e-fixtures.cjs');

const cli = require('./planning-verbs-cli.cjs');

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const D = `objectives/${OBJECTIVE_DIR}`;
const STORE_BLOCK_START = '# >>> devflow store (0010) >>>';
const STORE_BLOCK_END = '# <<< devflow store (0010) <<<';

// ─── Harness ─────────────────────────────────────────────────────────────────

/** Run fn with process.exit / stdout / stderr / exitCode captured; `code` is the exit code the CLI asked for. */
function capture(fn) {
  const out = { stdout: '', stderr: '', code: null };
  const saved = { exit: process.exit, out: process.stdout.write, err: process.stderr.write, exitCode: process.exitCode };
  process.exitCode = 0;
  process.exit = (c) => { if (out.code === null) out.code = c === undefined ? 0 : c; };
  process.stdout.write = (chunk) => { out.stdout += chunk; return true; };
  process.stderr.write = (chunk) => { out.stderr += chunk; return true; };
  try {
    out.ret = fn();
  } finally {
    if (out.code === null) out.code = process.exitCode || 0;
    process.exit = saved.exit;
    process.stdout.write = saved.out;
    process.stderr.write = saved.err;
    process.exitCode = saved.exitCode === undefined ? 0 : saved.exitCode;
  }
  return out;
}

/** The command group of a verb line -> its 48-15 CLI function. */
const GROUPS = {
  plan: (cwd, a, raw) => cli.cmdPlan(cwd, a, raw),
  objective: (cwd, a, raw) => cli.cmdObjectiveVerb(cwd, a, raw),
  summary: (cwd, a, raw) => cli.cmdSummary(cwd, a, raw),
  verification: (cwd, a, raw) => cli.cmdVerification(cwd, a, raw),
  doc: (cwd, a, raw) => cli.cmdDoc(cwd, a, raw),
  todo: (cwd, a, raw) => cli.cmdTodoVerb(cwd, a, raw),
  quick: (cwd, a, raw) => cli.cmdQuick(cwd, a, raw),
};

/**
 * One verb line, in-process, with --raw: `{code, out, stdout, stderr}`. `out` is the parsed JSON result, or the raw
 * text when the command printed something else (a delegate to today's command keeps today's raw output).
 */
function verb(root, argv) {
  const [group, ...rest] = argv;
  const r = capture(() => GROUPS[group](root, rest, true));
  let out = r.stdout;
  try { out = JSON.parse(r.stdout); } catch { /* today's raw form */ }
  return { code: r.code, out, stdout: r.stdout, stderr: r.stderr };
}

/** Spawned df-tools (via the repo fixture), asserting the exit code. */
function df(R, args, expected = 0) {
  const r = R.run(args);
  assert.equal(r.status, expected, `df-tools ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return r;
}

/** Install the fake GitHub, the fake clock and a local wiki remote on top of hermeticEnv(). */
function installStoreWorld() {
  const envh = hermeticEnv();
  const restoreGit = applyGitTestEnv(path.join(envh.root, 'home'));
  const remote = createWikiRemote();
  const savedRemote = process.env.DEVFLOW_WIKI_REMOTE;
  process.env.DEVFLOW_WIKI_REMOTE = remote.remoteUrl;
  const savedNotifier = process.env.NOTIFIER_DISABLE;
  process.env.NOTIFIER_DISABLE = '1';
  const fake = createFakeGitHub({ repo: REPO, ownerType: 'Organization', hasWiki: true });
  const clock = { t: T0 };
  client._resetClient();
  client._setNow(() => clock.t);
  client._setSleep((ms) => { clock.t += ms; });
  gh._setRunGh(fake.runGh);
  gh._resetCache();
  return {
    envh,
    fake,
    remote,
    restore() {
      client._resetClient();
      gh._resetCache();
      remote.cleanup();
      if (savedRemote === undefined) delete process.env.DEVFLOW_WIKI_REMOTE;
      else process.env.DEVFLOW_WIKI_REMOTE = savedRemote;
      if (savedNotifier === undefined) delete process.env.NOTIFIER_DISABLE;
      else process.env.NOTIFIER_DISABLE = savedNotifier;
      restoreGit();
      envh.restore();
    },
  };
}

// ─── Store mode (SC3) ────────────────────────────────────────────────────────

describe('store mode: plan -> execute -> verify through the verbs', { skip: gitAvailable() ? false : 'git is not available' }, () => {
  let W;
  let R;

  before(() => {
    W = installStoreWorld();
    R = makeE2eRepo({ store: true });
    // Setup order (TRD 48-22): config + STACK.md committed by the fixture; apply 0010 (an empty cache: no import
    // needed, the preconditions pass trivially); commit what it changed.
    df(R, ['upgrade', '--apply', '--only', '0010', '--confirm']);
    const changed = R.gitStatus().map((l) => l.slice(3));
    assert.ok(changed.includes('.gitignore'), `0010 writes .gitignore: ${changed.join(', ')}`);
    df(R, ['commit', 'chore: devflow store gitignore', '--files', ...changed]);
  });

  after(() => {
    if (R) R.cleanup();
    if (W) W.restore();
  });

  test('1. after setup only config.json and STACK.md are tracked under .planning/; .gitignore holds the 0010 block', () => {
    assert.deepEqual(R.lsFiles('.planning'), ['.planning/STACK.md', '.planning/config.json']);
    const ignore = fs.readFileSync(path.join(R.root, '.gitignore'), 'utf8').split('\n');
    const start = ignore.indexOf(STORE_BLOCK_START);
    const end = ignore.indexOf(STORE_BLOCK_END);
    assert.ok(start >= 0 && end > start, ignore.join('\n'));
    assert.deepEqual(R.gitStatus(), [], 'the setup leaves the tree clean');
    assert.deepEqual(JSON.parse(R.read('config.json')).github.store, true);
  });
});
