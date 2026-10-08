'use strict';

/**
 * gh-backfill.e2e.test.cjs (TRD 51-08, GMD-02): the backfill through the entry points a user runs, in child processes.
 *
 *   7a  `aof-tools upgrade --check` lists 0011 as needing confirmation, its reason the plan (with the write count)
 *   7b  `aof-tools planning import --dry-run` prints the request estimate
 *   7c  `aof-tools upgrade --apply --only 0011 --confirm` with GitHub going offline mid-drain exits non-zero and prints
 *       the resume command; nothing is stamped
 *   7d  back online, the same command exits 0: only `.planning/config.json` stays tracked and the printed follow-up
 *       carries the store-mode commit steps (`AOFORGE_SKIP_GH_GATE=1`)
 *
 * GitHub is a stateful `gh` PATH shim (a stub table cannot answer a backfill): each `gh` call is a node process that
 * rebuilds the fake GitHub (__fixtures__/gh-fake.cjs) by replaying the successful writes recorded so far, answers the
 * call, and records it when it is a successful write. A shim config flag turns it into an unreachable GitHub once N
 * writes are recorded. The project is the 51-02 fixture with ONE objective: the CLI paces writes on the real clock
 * (>= 1 s apart; no fake clock crosses a process boundary), so the run is ~50 writes, well inside one hourly budget.
 *
 * Hermetic: useBackfillEnv supplies HOME, AOFORGE_OUTBOX_DIR, AOFORGE_GH_CACHE_DIR (temp dirs), git isolation and a
 * local bare wiki remote (AOFORGE_WIKI_REMOTE); the shim sits first on PATH so a real `gh` is never reached. Nothing
 * here touches this repository, the real ~/.claude, GitHub, the network or any port.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { useBackfillEnv } = require('./__fixtures__/gh-backfill-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const GH_FAKE = path.join(__dirname, '__fixtures__', 'gh-fake.cjs');
const GH_CLIENT = path.join(__dirname, 'gh-client.cjs');
const OFFLINE_STDERR = 'error connecting to api.github.com\ndial tcp: lookup api.github.com: no such host\n';

/** The shim's `gh` program. Self-contained apart from the two absolute requires it is generated with. */
function shimSource(dir) {
  return `#!${process.execPath}
'use strict';
const fs = require('fs');
const path = require('path');
const { createFakeGitHub } = require(${JSON.stringify(GH_FAKE)});
const { isWriteArgs } = require(${JSON.stringify(GH_CLIENT)});
const DIR = ${JSON.stringify(dir)};
const args = process.argv.slice(2);
const at = args.indexOf('--input');
const input = at >= 0 && args[at + 1] === '-' ? fs.readFileSync(0, 'utf-8') : undefined;
fs.appendFileSync(path.join(DIR, 'calls.jsonl'), JSON.stringify(args) + '\\n');
const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf-8'));
const logFile = path.join(DIR, 'writes.jsonl');
const done = fs.existsSync(logFile)
  ? fs.readFileSync(logFile, 'utf-8').split('\\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
if (Number.isInteger(cfg.offlineAfterWrites) && done.length >= cfg.offlineAfterWrites) {
  process.stderr.write(${JSON.stringify(OFFLINE_STDERR)});
  process.exit(1);
}
const fake = createFakeGitHub({ hasWiki: true });
for (const w of done) fake.runGh(w.args, w.input === null ? {} : { input: w.input });
const r = fake.runGh(args, input === undefined ? {} : { input });
if (isWriteArgs(args) && r.ok) fs.appendFileSync(logFile, JSON.stringify({ args, input: input === undefined ? null : input }) + '\\n');
if (r.stdout) process.stdout.write(r.stdout.endsWith('\\n') ? r.stdout : r.stdout + '\\n');
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.ok ? 0 : (Number.isInteger(r.status) && r.status > 0 ? r.status : 1));
`;
}

function installStatefulShim(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-backfill-shim-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'bin'));
  const gh = path.join(dir, 'bin', 'gh');
  fs.writeFileSync(gh, shimSource(dir));
  fs.chmodSync(gh, 0o755);
  const shim = {
    dir,
    bin: path.join(dir, 'bin'),
    configure(cfg) { fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(cfg)); },
    writes() {
      const f = path.join(dir, 'writes.jsonl');
      return fs.existsSync(f) ? fs.readFileSync(f, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    },
    /** The fake GitHub as the shim holds it now (replayed in this process). */
    fake() {
      const { createFakeGitHub } = require(GH_FAKE);
      const fake = createFakeGitHub({ hasWiki: true });
      for (const w of shim.writes()) fake.runGh(w.args, w.input === null ? {} : { input: w.input });
      return fake;
    },
  };
  shim.configure({});
  return shim;
}

/** `node aof-tools.cjs --cwd <root> ...args` with the hermetic env and the shim first on PATH. */
function df(env, shim, args) {
  const childEnv = { ...process.env, ...env.env, PATH: `${shim.bin}${path.delimiter}${process.env.PATH}` };
  for (const k of ['AOFORGE_SKIP_GH_GATE', 'AOFORGE_ALLOW_RAW_COMMIT', 'GITHUB_TOKEN', 'GH_TOKEN']) delete childEnv[k];
  const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', env.root, ...args], {
    env: childEnv, encoding: 'utf-8', timeout: 540000, maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', out: `${r.stdout || ''}\n${r.stderr || ''}`, error: r.error };
}

function trackedPlanning(env) {
  const r = spawnSync('git', ['ls-files', '--', '.planning'], { cwd: env.root, env: { ...process.env, ...env.env }, encoding: 'utf-8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.split('\n').filter(Boolean).sort();
}

const stamped = (env) => {
  const cfg = JSON.parse(fs.readFileSync(path.join(env.root, '.planning', 'config.json'), 'utf-8'));
  return cfg.aoforge && Array.isArray(cfg.aoforge.migrations_applied) ? cfg.aoforge.migrations_applied : [];
};

/** The JSON document `upgrade` printed without --raw (over 50 KB aof-tools prints `@file:<path>` instead). */
function json(r) {
  try {
    const out = r.stdout.trim();
    return JSON.parse(out.startsWith('@file:') ? fs.readFileSync(out.slice(6), 'utf-8') : out);
  } catch (e) {
    assert.fail(`not JSON (${e.message}): ${r.out.slice(0, 2000)}`);
  }
  return null;
}

describe('backfill through the aof-tools CLI (test 7)', () => {
  test('7: check, dry run, an offline stop that names the resume, then completion', { timeout: 600000 }, (t) => {
    const env = useBackfillEnv(t, { objectives: 1 });
    if (!env) return;
    const shim = installStatefulShim(t);

    // 7a. upgrade --check: 0011 needs confirmation, and its reason is the plan with the write count. (For `upgrade`,
    // no flag prints the JSON report and `--raw` the one-line summary.)
    const check = df(env, shim, ['upgrade', '--check']);
    assert.equal(check.status, 0, check.out);
    const report = json(check);
    const pending = (report.pending_confirm || []).find((x) => x.id === '0011');
    assert.ok(pending, `0011 needs confirmation: ${JSON.stringify(report.pending_confirm)}`);
    assert.match(pending.reason, /writes/, pending.reason);
    assert.match(pending.reason, /--only 0011 --confirm/);
    const checkRaw = df(env, shim, ['upgrade', '--check', '--raw']);
    assert.equal(checkRaw.status, 0, checkRaw.out);
    assert.match(checkRaw.stdout, /need(s)? confirmation \([^)]*0011/, checkRaw.out);
    assert.deepEqual(shim.writes(), [], 'check wrote nothing to GitHub');

    // 7b. planning import --dry-run prints the estimate (prose; `--raw` would print the JSON report).
    const dry = df(env, shim, ['planning', 'import', '--dry-run']);
    assert.equal(dry.status, 0, dry.out);
    assert.match(dry.stdout, /estimate:/, dry.out);
    assert.deepEqual(shim.writes(), [], 'the dry run wrote nothing to GitHub');

    // 7c. GitHub goes away 20 writes in: the apply stops resumably, exits non-zero and names the resume command.
    shim.configure({ offlineAfterWrites: 20 });
    const stopped = df(env, shim, ['upgrade', '--apply', '--only', '0011', '--confirm', '--raw']);
    assert.notEqual(stopped.status, 0, stopped.out);
    assert.match(stopped.out, /0011 stopped \(pending\): not an error: \d+ of \d+ ops remain \(GitHub could not be reached\)/);
    assert.match(stopped.out, /run `aof-tools upgrade --apply --only 0011 --confirm` again/, 'the resume command');
    assert.equal(shim.writes().length, 20);
    assert.equal(stamped(env).includes('0011'), false, 'nothing stamped');

    // 7d. Online again: the same command completes.
    shim.configure({});
    const done = df(env, shim, ['upgrade', '--apply', '--only', '0011', '--confirm']);
    assert.equal(done.status, 0, done.out.slice(0, 4000));
    const applied = json(done);
    assert.deepEqual(applied.failed, [], JSON.stringify(applied.failed));
    const a = applied.applied.find((x) => x.id === '0011');
    assert.ok(a, JSON.stringify(applied.applied.map((x) => x.id)));
    assert.match(a.notes, /AOFORGE_SKIP_GH_GATE=1/, 'the printed follow-up carries the store-mode commit steps');
    assert.match(a.notes, /not re-imported \(resume\)/);
    assert.deepEqual(trackedPlanning(env), ['.planning/config.json'], 'only config.json stays tracked');
    assert.ok(stamped(env).includes('0011') && stamped(env).includes('0010'), JSON.stringify(stamped(env)));

    // GitHub holds the objective and its five TRDs, each once.
    const fake = shim.fake();
    const ids = fake.issues.map((i) => `${i.type}:${(/<!-- aoforge:id=([^ ]+) -->/.exec(i.body || '') || [])[1]}`);
    assert.deepEqual(ids.filter((x) => x.startsWith('TRD:')).sort(), ['TRD:1-01', 'TRD:1-02', 'TRD:1-03', 'TRD:1-04', 'TRD:1-05']);
    assert.deepEqual(ids.filter((x) => x.startsWith('Objective:')), ['Objective:1']);
    assert.equal(new Set(ids).size, ids.length, 'no issue created twice');

    // And a second run is a no-op.
    const again = df(env, shim, ['upgrade', '--check']);
    assert.equal(again.status, 0, again.out);
    assert.equal((json(again).pending_confirm || []).some((x) => x.id === '0011'), false);
  });
});
