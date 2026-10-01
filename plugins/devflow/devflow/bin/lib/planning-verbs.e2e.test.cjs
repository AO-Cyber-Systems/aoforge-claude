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
const { spawnSync } = require('node:child_process');

const gh = require('./gh.cjs');
const ghPull = require('./gh-pull.cjs');
const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const storeCli = require('./gh-store-cli.cjs');
const ledgerLib = require('./planning-ledger.cjs');
const planningPaths = require('./planning-paths.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');
const { createWikiRemote, gitAvailable, applyGitTestEnv } = require('./__fixtures__/wiki-remote.cjs');
const { makeE2eRepo, OBJECTIVE_DIR, REPO, TODO_STEM, ROADMAP_MD, STATE_MD } = require('./__fixtures__/planning-e2e-fixtures.cjs');

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

/**
 * The objective, driven only through the verbs (TRD 48-22 "Scenario"). `onStep({kind, argv, res, n})` runs after
 * every verb and around every code commit (`kind` 'code-written' before the commit, 'code-committed' after it).
 * @returns {Array<{argv:string[], code:number, out:any, stderr:string}>}
 */
function runScenario(R, onStep = () => {}) {
  const results = [];
  const run = (argv) => {
    const res = verb(R.root, argv);
    results.push({ argv, ...res });
    onStep({ kind: 'verb', argv, res });
    return res;
  };
  const trds = ['07-01-alpha-TRD.md', '07-02-beta-TRD.md', '07-03-gamma-TRD.md'];

  run(['objective', 'put', '7', '--from', R.draft('OBJECTIVE.md')]);
  for (const f of trds) run(['plan', 'put-trd', '7', f, '--from', R.draft(f), '--no-push']);
  run(['plan', 'push', '7']);
  run(['doc', 'put', `${D}/07-CONTEXT.md`, '--from', R.draft('07-CONTEXT.md')]);
  run(['doc', 'put', `${D}/07-RESEARCH.md`, '--from', R.draft('07-RESEARCH.md')]);
  for (const n of [1, 2, 3]) {
    const rel = R.writeCode(n);
    onStep({ kind: 'code-written', n, rel });
    df(R, ['commit', `feat(07-0${n}): t${n}`, '--files', rel]);
    onStep({ kind: 'code-committed', n, rel });
    run(['summary', 'checkpoint', `7-0${n}`, '--from', R.draft(`checkpoint-0${n}.md`)]);
    run(['summary', 'post', `7-0${n}`, '--from', R.draft(`07-0${n}-SUMMARY.md`)]);
  }
  run(['todo', 'add', '--from', R.draft('todo.md'), '--stem', TODO_STEM]);
  run(['quick', 'put', '1', 'x', '--from', R.draft('quick-job.md')]);
  run(['quick', 'summary', '1', '--from', R.draft('quick-summary.md')]);
  run(['verification', 'post', '7', '--from', R.draft('07-VERIFICATION.md')]);
  run(['objective', 'set-status', '7', 'complete']);
  return results;
}

/** `{rel: Buffer}` of every file under `.planning/` (sorted walk) whose rel passes `keep`. */
function snapshotPlanning(R, keep = () => true) {
  const out = {};
  const walk = (dir, rel) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (keep(r)) out[r] = fs.readFileSync(path.join(dir, e.name));
    }
  };
  walk(path.join(R.root, '.planning'), '');
  return out;
}

/**
 * True for a `.planning/` rel the store owns in the cache (a verb writes it; gh pull rebuilds it). `wiki/**` is the
 * local clone of the wiki repository that gh pull reads the pages from, not a cache file (gh-cache.listOwnedLocal
 * drops it the same way), so it is kept like the runtime files.
 */
const isCache = (rel) => !rel.startsWith('wiki/') && planningPaths.classify(rel).class === 'cache';

/** The W055 issues of a spawned `validate health --raw`. */
function w055(R) {
  const r = R.run(['validate', 'health', '--raw']);
  let payload;
  try { payload = JSON.parse(r.stdout); } catch { assert.fail(`validate health --raw printed no JSON:\n${r.stdout}\n${r.stderr}`); }
  const all = [...(payload.errors || []), ...(payload.warnings || []), ...(payload.info || [])];
  return { payload, drift: all.filter((i) => i && i.code === 'W055') };
}

const GATE_HOOK = path.join(__dirname, '..', '..', '..', 'hooks', 'gate-edits.js');

/**
 * The edit gate's answer to a devflow executor's Edit of `.planning/<rel>` (the real hook, spawned in the repo):
 * `{denied, out}`. A devflow agent passes the ambient gate, so only the store-mode cache deny can refuse it.
 */
function gateEdit(R, rel) {
  const env = R.childEnv();
  delete env.DEVFLOW_SKIP_EDIT_GATE;
  const payload = {
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: R.planning(rel), old_string: 'Alpha', new_string: 'Alpha!' },
    cwd: R.root,
    agent_type: 'devflow:executor',
  };
  const r = spawnSync(process.execPath, [GATE_HOOK], { cwd: R.root, input: JSON.stringify(payload), encoding: 'utf8', env });
  const out = `${r.stdout}\n${r.stderr}`;
  return { denied: /"permissionDecision"\s*:\s*"deny"/.test(r.stdout) || r.status === 2, out, status: r.status };
}

/** The wiki pages at the remote's master: `{name: text}`. */
function wikiPages(remote) {
  const ls = spawnSync('git', ['ls-tree', '--name-only', 'master'], { cwd: remote.bareDir, encoding: 'utf-8' });
  const out = {};
  for (const f of ls.stdout.split('\n').filter((n) => n.endsWith('.md'))) out[f.slice(0, -3)] = remote.readRemotePage(f.slice(0, -3));
  return out;
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

  test('2. SC3: after every verb git status is empty, apart from the in-flight src/t<N>.cjs before its commit', () => {
    const seen = [];
    runScenario(R, (step) => {
      const status = R.gitStatus();
      if (step.kind === 'verb') {
        seen.push(step.argv.slice(0, 2).join(' '));
        assert.equal(step.res.code, 0, `${step.argv.join(' ')} exits 0\n${step.stdout}\n${step.stderr}`);
        assert.deepEqual(status, [], `git sees nothing after ${step.argv.join(' ')}`);
      } else if (step.kind === 'code-written') {
        assert.deepEqual(status, [`?? ${step.rel}`], 'only the code file, before its commit');
      } else {
        assert.deepEqual(status, [], `clean after committing ${step.rel}`);
      }
    });
    assert.equal(seen.length, 18, seen.join('\n'));
    assert.deepEqual(R.gitStatus(), [], 'clean at the end');
    assert.deepEqual(R.lsFiles('.planning'), ['.planning/STACK.md', '.planning/config.json'], 'nothing new tracked under .planning/');
    assert.deepEqual(R.lsFiles('src'), ['src/t1.cjs', 'src/t2.cjs', 'src/t3.cjs']);
    // The cache holds every file the verbs wrote, with the draft bytes.
    for (const f of ['07-01-alpha-TRD.md', '07-02-beta-TRD.md', '07-03-gamma-TRD.md', '07-CONTEXT.md', '07-RESEARCH.md']) {
      assert.equal(R.read(`${D}/${f}`), R.draftText(f), f);
    }
    assert.equal(R.read(`${D}/07-01-SUMMARY.md`), R.draftText('07-01-SUMMARY.md'));
    assert.equal(R.read(`${D}/07-VERIFICATION.md`), R.draftText('07-VERIFICATION.md'));
  });

  test('3. GitHub holds the objective (closed), 3 TRD sub-issues with the wave edge, summaries, verification, pages, todo, quick', () => {
    const { fake, remote } = W;
    const byId = (id) => fake.issues.filter((i) => i.body.includes(`devflow:id=${id} `) || i.body.includes(`devflow:id=${id}-->`) || i.body.includes(`devflow:id=${id} -->`));
    const trdIssues = ['7-01', '7-02', '7-03'].map((id) => {
      const hits = byId(id);
      assert.equal(hits.length, 1, `one issue for TRD ${id}`);
      return hits[0];
    });
    const objective = fake.issues.find((i) => i.number === trdIssues[0].parent);
    assert.ok(objective, 'the TRD issues hang under the objective issue');
    assert.deepEqual([...objective.subIssues].sort(), trdIssues.map((i) => i.number).sort(), 'the 3 TRDs are its sub-issues');
    for (const i of trdIssues) assert.equal(i.parent, objective.number);
    assert.deepEqual(trdIssues[2].blockedBy, [trdIssues[0].number], '07-03 (wave 2) is blocked by 07-01');
    assert.deepEqual(trdIssues[0].blockedBy, []);
    assert.deepEqual(trdIssues[1].blockedBy, []);
    assert.equal(objective.state, 'CLOSED', 'objective set-status complete closes the objective');
    assert.equal(String(objective.stateReason).toLowerCase(), 'completed');

    const commentsOn = (n, kind) => fake.comments.filter((c) => c.issue_number === n && c.body.includes(`kind=${kind}`));
    trdIssues.forEach((i, k) => {
      const s = commentsOn(i.number, 'summary');
      assert.equal(s.length, 1, `one devflow:summary comment on TRD 7-0${k + 1}`);
      assert.ok(s[0].body.includes(R.draftText(`07-0${k + 1}-SUMMARY.md`).trimEnd()), 'the comment carries the final SUMMARY');
    });
    const verification = commentsOn(objective.number, 'verification');
    assert.equal(verification.length, 1, 'one sticky verification comment');
    assert.ok(verification[0].body.includes('GitHub holds every planning file'));

    const pages = Object.values(wikiPages(remote));
    assert.ok(pages.some((t) => t && t.includes(R.draftText('07-CONTEXT.md').trimEnd())), 'the Context wiki page');
    assert.ok(pages.some((t) => t && t.includes(R.draftText('07-RESEARCH.md').trimEnd())), 'the Research wiki page');

    const todos = fake.issues.filter((i) => i.labels.includes('devflow:todo'));
    assert.equal(todos.length, 1, 'one devflow:todo issue');
    assert.equal(todos[0].state, 'OPEN');
    const quicks = fake.issues.filter((i) => i.body.includes('devflow:id=quick-1'));
    assert.equal(quicks.length, 1, 'one quick issue');
    assert.equal(quicks[0].state, 'CLOSED', 'quick summary closes the quick issue');
    assert.equal(commentsOn(quicks[0].number, 'summary').length, 1, 'with its summary comment');
  });

  test('4. delete the cache, gh pull --all rebuilds every file byte-identically; a second pull writes nothing', () => {
    const before = snapshotPlanning(R, isCache);
    assert.ok(Object.keys(before).length >= 12, Object.keys(before).join('\n'));
    for (const rel of Object.keys(before)) fs.rmSync(R.planning(rel));
    const writes = W.fake.writes().length;

    const first = capture(() => ghPull.cmdGhPull(R.root, ['--all'], true));
    assert.equal(first.code, 0, first.stdout + first.stderr);
    const rebuilt = snapshotPlanning(R, isCache);
    assert.deepEqual(Object.keys(rebuilt).sort(), Object.keys(before).sort(), 'the same cache files');
    for (const rel of Object.keys(before)) assert.ok(before[rel].equals(rebuilt[rel]), `${rel} is byte-identical after the pull`);

    const all = snapshotPlanning(R, (rel) => !rel.split('/').some((s) => s.startsWith('.')));
    const second = capture(() => ghPull.cmdGhPull(R.root, ['--all'], true));
    assert.equal(second.code, 0, second.stdout + second.stderr);
    const again = snapshotPlanning(R, (rel) => !rel.split('/').some((s) => s.startsWith('.')));
    assert.deepEqual(Object.keys(again).sort(), Object.keys(all).sort());
    for (const rel of Object.keys(all)) assert.ok(all[rel].equals(again[rel]), `${rel} unchanged by the second pull`);
    assert.equal(W.fake.writes().length, writes, 'a pull never writes to GitHub');
    assert.deepEqual(R.gitStatus(), [], 'the pulled cache is ignored by git');
  });

  test('5. validate health (spawned, same HOME/outbox) reports no W055 after the scenario', () => {
    const { drift } = w055(R);
    assert.deepEqual(drift, []);
  });

  test('6. negative: a Bash-style write to a cached TRD -> W055 naming the file and `plan put-trd`', () => {
    const rel = `${D}/07-01-alpha-TRD.md`;
    const original = R.read(rel);
    fs.writeFileSync(R.planning(rel), `${original}\nEdited behind the verbs' back.\n`);
    try {
      const { drift } = w055(R);
      assert.equal(drift.length, 1, JSON.stringify(drift, null, 2));
      const text = `${drift[0].message}\n${drift[0].fix || ''}`;
      assert.ok(text.includes('07-01-alpha-TRD.md'), text);
      assert.match(text, /plan put-trd/);
    } finally {
      fs.writeFileSync(R.planning(rel), original);
    }
    assert.deepEqual(w055(R).drift, [], 'restoring the bytes clears it');
    // The Edit tool never gets that far: the edit gate's store-mode cache deny names the verb (48-08).
    const gate = gateEdit(R, rel);
    assert.equal(gate.denied, true, gate.out);
    assert.match(gate.out, /plan put-trd/);
  });

  test('7. negative: offline plan put-trd queues (exit 3); the next online gh outbox flush exits 0 and settles the ledger', () => {
    const rel = `${D}/07-04-delta-TRD.md`;
    W.fake.setOffline(true);
    let queued;
    try {
      queued = verb(R.root, ['plan', 'put-trd', '7', '07-04-delta-TRD.md', '--from', R.draft('07-04-delta-TRD.md')]);
    } finally {
      W.fake.setOffline(false);
    }
    assert.equal(queued.code, 3, queued.stdout + queued.stderr);
    assert.equal(R.read(rel), R.draftText('07-04-delta-TRD.md'), 'the cache file is written');
    assert.ok(outbox.readJournal(R.root).journal.ops.some((op) => op.status !== 'done'), 'the journal holds the op');
    assert.ok(ledgerLib.readLedger(R.root).entries[rel], 'the write is in the ledger');

    const flush = capture(() => storeCli.cmdGhOutbox(R.root, ['flush'], true));
    assert.equal(flush.code, 0, flush.stdout + flush.stderr);
    assert.deepEqual(outbox.readJournal(R.root).journal.ops.filter((op) => op.status !== 'done'), [], 'drained');
    assert.equal(ledgerLib.readLedger(R.root).entries[rel], undefined, 'the ledger entry is settled');
    assert.ok(W.fake.issues.some((i) => i.body.includes('devflow:id=7-04')), 'the TRD issue exists after the flush');
    assert.deepEqual(R.gitStatus(), []);
    assert.deepEqual(w055(R).drift, []);
  });
});

// ─── Store off: parity (D-01) ────────────────────────────────────────────────

/** Where today's DevFlow keeps each file the scenario writes: `.planning/` rel -> draft name. */
const LOCAL_WRITES = {
  [`${D}/OBJECTIVE.md`]: 'OBJECTIVE.md',
  [`${D}/07-01-alpha-TRD.md`]: '07-01-alpha-TRD.md',
  [`${D}/07-02-beta-TRD.md`]: '07-02-beta-TRD.md',
  [`${D}/07-03-gamma-TRD.md`]: '07-03-gamma-TRD.md',
  [`${D}/07-CONTEXT.md`]: '07-CONTEXT.md',
  [`${D}/07-RESEARCH.md`]: '07-RESEARCH.md',
  [`${D}/07-01-SUMMARY.md`]: '07-01-SUMMARY.md',
  [`${D}/07-02-SUMMARY.md`]: '07-02-SUMMARY.md',
  [`${D}/07-03-SUMMARY.md`]: '07-03-SUMMARY.md',
  [`${D}/07-VERIFICATION.md`]: '07-VERIFICATION.md',
  [`todos/pending/${TODO_STEM}.md`]: 'todo.md',
  'quick/1-x/1-JOB.md': 'quick-job.md',
  'quick/1-x/1-SUMMARY.md': 'quick-summary.md',
};

/** Every file under `dir` (recursive), [] when it does not exist. */
function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.join(e.parentPath || e.path, e.name));
}

describe('store off: the same script is today\'s DevFlow (D-01 parity)', { skip: gitAvailable() ? false : 'git is not available' }, () => {
  let W;
  let A; // driven through the verbs
  let B; // the twin, driven the pre-48 way: drafts written in place, today's `objective complete`
  let results;
  let twin;

  before(() => {
    W = installStoreWorld();
    A = makeE2eRepo({ store: false });
    B = makeE2eRepo({ store: false });
    results = runScenario(A);

    for (const [rel, name] of Object.entries(LOCAL_WRITES)) B.write(rel, B.draftText(name));
    for (const n of [1, 2, 3]) {
      const rel = B.writeCode(n);
      df(B, ['commit', `feat(07-0${n}): t${n}`, '--files', rel]);
    }
    twin = df(B, ['objective', 'complete', '7', '--raw']);
  });

  after(() => {
    if (A) A.cleanup();
    if (B) B.cleanup();
    if (W) W.restore();
  });

  test('8. every verb writes its draft bytes; objective complete effects equal the pre-48 command; zero gh calls; no outbox', () => {
    for (const r of results) assert.equal(r.code, 0, `${r.argv.join(' ')}\n${r.stdout}\n${r.stderr}`);
    for (const r of results) {
      if (r.out && typeof r.out === 'object' && r.out.mode) assert.equal(r.out.mode, 'local', r.argv.join(' '));
    }
    assert.equal(results.find((r) => r.argv[0] === 'plan' && r.argv[1] === 'push').out.skipped, 'local mode');

    const objectiveRel = `${D}/OBJECTIVE.md`;
    for (const [rel, name] of Object.entries(LOCAL_WRITES)) {
      if (rel !== objectiveRel) assert.equal(A.read(rel), A.draftText(name), `${rel} holds exactly the draft bytes`);
    }
    assert.equal(
      A.read(objectiveRel),
      A.draftText('OBJECTIVE.md').replace(/^status: planned$/m, 'status: complete'),
      'OBJECTIVE.md is the draft with status: complete',
    );

    // Every other .planning/ file — ROADMAP.md and STATE.md included — is byte-identical to the twin's, and no
    // file exists on one side only (no journal, ledger, mapping or draft in .planning/).
    const notObjective = (rel) => rel !== objectiveRel;
    const a = snapshotPlanning(A, notObjective);
    const b = snapshotPlanning(B, notObjective);
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
    for (const rel of Object.keys(b)) assert.ok(a[rel].equals(b[rel]), `${rel} matches the pre-48 twin`);
    assert.notEqual(A.read('STATE.md'), STATE_MD, 'objective complete advanced STATE.md');
    assert.notEqual(A.read('ROADMAP.md'), ROADMAP_MD, 'objective complete updated ROADMAP.md');
    assert.match(A.read('ROADMAP.md'), /\[x\] \*\*Objective 7/, 'objective complete ticked the roadmap');

    // `objective set-status 7 complete` prints exactly what `objective complete 7` prints.
    const setStatus = results[results.length - 1];
    assert.deepEqual(setStatus.argv, ['objective', 'set-status', '7', 'complete']);
    assert.equal(setStatus.stdout, twin.stdout);

    assert.equal(W.fake.calls().length, 0, 'zero gh calls in-process');
    assert.deepEqual(A.shim.readCalls(), [], 'zero gh calls from the spawned commits');
    assert.deepEqual(filesUnder(process.env.DEVFLOW_OUTBOX_DIR), [], 'no outbox, journal or ledger files');
    assert.equal(fs.existsSync(ledgerLib.ledgerPath(A.root)), false);
  });

  test('9. .planning/ is dirty after the verbs and clean after df-tools commit; it stays tracked; no cache deny', () => {
    const expected = [
      ...Object.keys(LOCAL_WRITES).map((rel) => `?? .planning/${rel}`),
      ' M .planning/ROADMAP.md',
      ' M .planning/STATE.md',
    ].sort();
    assert.deepEqual([...A.gitStatus()].sort(), expected);

    df(A, ['commit', 'docs(07): objective 7 planning files', '--files', '.planning/']);
    assert.deepEqual(A.gitStatus(), [], 'clean after the commit');
    const tracked = A.lsFiles('.planning');
    for (const rel of Object.keys(LOCAL_WRITES)) assert.ok(tracked.includes(`.planning/${rel}`), `${rel} is tracked`);
    assert.ok(!fs.existsSync(path.join(A.root, '.gitignore')), 'no store .gitignore block');

    const gate = gateEdit(A, `${D}/07-01-alpha-TRD.md`);
    assert.equal(gate.denied, false, `the store-mode cache deny is inactive with the store off\n${gate.out}`);
  });
});
