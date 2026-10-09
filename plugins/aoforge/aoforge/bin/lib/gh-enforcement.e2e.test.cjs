'use strict';

/**
 * gh-enforcement.e2e.test.cjs (TRD 50-12): objective 50's success criteria, through the entry points a user and CI reach.
 *
 *   1  SC1  store repo on `main` -> `aof-tools commit` exits 1 `default_branch`, nothing staged, HEAD unchanged
 *   2  SC1  store repo on `feat/x` (no PR entry names it) -> exit 1 `unlinked_branch`
 *   3  SC1  `AOFORGE_SKIP_GH_GATE=1` on `main` -> exit 0, committed, and `aof-tools override --list` shows a `gh` entry
 *   4  SC1  `prs[<objective>].branch` = the current branch -> committed, an unscoped message gets `Refs #<objective issue>`
 *   5  SC2  `gh setup` prints the ruleset, issue types and fields with zero writes; `--apply` twice -> zero writes the second time
 *   6  SC3  the check runner: no closing reference -> `aoforge/linked-issue` failure, exit 1; `Closes #N` -> success, exit 0
 *   7  GEN-02/03  a queued write is flushed by the gh-flush hook (spawned) after a store commit; `validate health` loses W057
 *  10      the script the reusable workflow runs exists, accepts every subcommand the workflow names, and needs nothing
 *          outside `plugins/aoforge/aoforge/bin` (the workflow sparse-checks-out only that directory)
 *
 * (Tests 8-9, store-off parity, live in gh-enforcement-parity.test.cjs.)
 *
 * Child processes (1-4, 7, the exit code of 6) run the real `aof-tools.cjs` / `gh-flush.js` / `gh-check-cli.cjs` with the
 * `gh` PATH shim first on PATH: it records every call and answers from a table, so an unanticipated call fails loudly and
 * nothing reaches GitHub. The in-process halves (5, the statuses of 6) use the fake GitHub through gh-client's seam, since a
 * stub does not cross a process boundary. Every repo is a disposable `git init -b main` under the OS temp dir with a fake
 * HOME, GIT_CONFIG_GLOBAL=/dev/null and the outbox, gh cache and hook-marker directories pointed at temp dirs. Nothing here
 * touches this repository, the real ~/.claude, the network or any port.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const client = require('./gh-client.cjs');
const wiki = require('./gh-wiki.cjs');
const setup = require('./gh-setup.cjs');
const setupCli = require('./gh-setup-cli.cjs');
const checkCli = require('./gh-check-cli.cjs');
const gm = require('./gh-mapping.cjs');
const { CONTEXTS } = require('./gh-check.cjs');
const fx = require('./__fixtures__/upgrade-fixtures.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { installGhShim } = require('./__fixtures__/gh-shim.cjs');
const { offlineTable } = require('./__fixtures__/store-cli-fixtures.cjs');
const { makeStoreProject, hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const PLUGIN_ROOT = path.join(REPO_ROOT, 'plugins', 'aoforge');
const TOOLS = path.join(PLUGIN_ROOT, 'aoforge', 'bin', 'aof-tools.cjs');
const HOOK = path.join(PLUGIN_ROOT, 'hooks', 'gh-flush.js');
const CHECK_CLI = path.join(__dirname, 'gh-check-cli.cjs');
const WORKFLOW = path.join(REPO_ROOT, '.github', 'workflows', 'aoforge-checks.yml');
const EVENTS = path.join(__dirname, '__fixtures__', 'gh-events');
const HAS_GIT = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;

const SRC = 'src/keep.cjs';
const OBJECTIVE = 7; // the makeStoreProject fixture's objective (dir 07-store-demo, TRDs 7-01..7-03)
const OBJECTIVE_ISSUE = 700;
const LINKED = 'df/objective-07-store-demo';
const U1_BLOCK = [
  '# >>> aoforge store (0010) >>>',
  '.aoforge/*',
  '!.aoforge/config.json',
  '!.aoforge/STACK.md',
  '# <<< aoforge store (0010) <<<',
  '',
].join('\n');

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
 * A store-mode git repo on `main`: the makeStoreProject fixture (objective 7, TRDs 7-01..7-03, `github.enabled` +
 * `github.store`), `commit_docs` on, the 0010 gitignore block (so `.aoforge/` is not tracked but config.json is) and one
 * tracked source file. The v3 mapping is written AFTER the init commit: objective 7 is issue #700, its TRDs #701-#703, and
 * `link` (when given) is the PR entry that links a branch to the objective. A recording `gh` shim sits first on PATH.
 */
function storeRepo({ store = true, link = null } = {}) {
  const base = tmpDir('df-enforce-e2e-');
  const proj = makeStoreProject({ store });
  cleanup.push(proj.root);
  const root = fs.realpathSync(proj.root);
  const home = fx.makeFakeHome();
  cleanup.push(home);

  const config = JSON.parse(fs.readFileSync(path.join(root, '.aoforge', 'config.json'), 'utf-8'));
  write(root, '.aoforge/config.json', `${JSON.stringify({ commit_docs: true, ...config })}\n`);
  if (store) write(root, '.gitignore', U1_BLOCK);
  write(root, SRC, 'module.exports = 0;\n');
  fx.initGitFixture(root, home);

  const m = gm.emptyMapping();
  gm.setEntry(m, OBJECTIVE, { issue_id: OBJECTIVE_ISSUE });
  for (const n of [1, 2, 3]) gm.setTrd(m, `7-0${n}`, { issue_number: OBJECTIVE_ISSUE + n, rest_id: 7000 + n });
  if (link) gm.setPr(m, OBJECTIVE, link);
  const w = gm.writeMappingV3(root, m);
  assert.equal(w.ok, true, w.error);

  const shim = installGhShim({ dir: path.join(base, 'shim'), table: offlineTable(), defaultCode: 1 });
  return {
    root,
    home,
    shim,
    outbox: path.join(base, 'outbox'),
    markers: path.join(base, 'markers'),
  };
}

/** The environment of every child: the shim first on PATH, a fake HOME, temp outbox / cache / marker dirs, no gate escapes. */
function childEnv(p, extra = {}) {
  const gitEnv = fx.gitEnv(p.home);
  const env = p.shim.env({
    HOME: p.home,
    XDG_CONFIG_HOME: gitEnv.XDG_CONFIG_HOME,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    AOFORGE_OUTBOX_DIR: p.outbox,
    AOFORGE_HOOK_MARKER_DIR: p.markers,
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    ...extra,
  });
  for (const key of [
    'AOFORGE_ALLOW_RAW_COMMIT', 'AOFORGE_SKIP_GH_GATE', 'AOFORGE_SKIP_GH_GATE_REASON',
    'AOFORGE_SKIP_GH_FLUSH_HOOK', 'AOFORGE_GH_FLUSH_TIMEOUT_MS',
  ]) {
    if (!(key in extra)) delete env[key];
  }
  return env;
}

/** `aof-tools --cwd <dir> <args...>` as a child process: the real dispatch, env reading and exit code. */
function df(p, args, { dir = p.root, env = {}, input } = {}) {
  const r = spawnSync(process.execPath, [TOOLS, '--cwd', dir, ...args], {
    cwd: dir, env: childEnv(p, env), encoding: 'utf-8', input, timeout: 120000,
  });
  const out = (r.stdout || '').trim();
  let json = null;
  try { json = JSON.parse(out); } catch { /* not JSON */ }
  return { status: r.status, out, err: (r.stderr || '').trim(), json };
}

const dfCommit = (p, message, files, opts) => df(p, ['commit', message, '--files', ...files], opts);

const head = (p) => git(p, 'rev-parse', 'HEAD');
const staged = (p) => git(p, 'diff', '--cached', '--name-only');
const headMessage = (p) => execFileSync('git', ['-C', p.root, 'log', '-1', '--format=%B'], {
  env: fx.gitEnv(p.home), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
}).replace(/\n+$/, '');

const ghCalls = (p) => p.shim.readCalls();

/** A refused commit left no trace: exit 1, not committed, nothing staged, HEAD and the working change intact. */
function assertRefused(p, r, before, reason) {
  assert.equal(r.status, 1, `${r.out} ${r.err}`);
  assert.equal(r.json.committed, false, r.out);
  assert.equal(r.json.hash, null);
  assert.equal(r.json.reason, reason, r.out);
  assert.equal(typeof r.json.error, 'string');
  assert.equal(staged(p), '', 'a refused commit stages nothing');
  assert.equal(head(p), before, 'HEAD is unchanged');
  assert.equal(git(p, 'diff', '--name-only', '--', SRC), SRC, 'the change is still an unstaged edit');
  assert.deepEqual(ghCalls(p), [], 'the gate is offline');
}

// ─── SC1: the commit gate ────────────────────────────────────────────────────

describe('SC1: aof-tools commit in a store-mode repo (tests 1-4)', () => {
  test('1. on the default branch -> exit 1, default_branch, nothing staged', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    write(p.root, SRC, 'module.exports = 1;\n');
    const before = head(p);

    const r = dfCommit(p, 'feat(50-12): x', [SRC]);
    assertRefused(p, r, before, 'default_branch');
    assert.equal(r.json.branch, 'main');
    assert.match(r.json.error, /AOFORGE_SKIP_GH_GATE=1/, 'the refusal names the escape');
  });

  test('2. on an unlinked branch -> exit 1, unlinked_branch, nothing staged', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    git(p, 'checkout', '-q', '-b', 'feat/x');
    write(p.root, SRC, 'module.exports = 2;\n');
    const before = head(p);

    const r = dfCommit(p, 'feat(50-12): x', [SRC]);
    assertRefused(p, r, before, 'unlinked_branch');
    assert.equal(r.json.branch, 'feat/x');
    assert.match(r.json.error, /gh pr start/);
  });

  test('3. AOFORGE_SKIP_GH_GATE=1 on the default branch -> committed, and `override --list` shows the gh entry', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    write(p.root, SRC, 'module.exports = 3;\n');
    const before = head(p);

    const r = dfCommit(p, 'feat(50-12): escaped', [SRC], { env: { AOFORGE_SKIP_GH_GATE: '1' } });
    assert.equal(r.status, 0, `${r.out} ${r.err}`);
    assert.equal(r.json.committed, true, r.out);
    assert.equal(r.json.gate_escaped, true);
    assert.notEqual(head(p), before);
    assert.equal(staged(p), '');

    const listed = df(p, ['override', '--list', '--raw']);
    assert.equal(listed.status, 0, `${listed.out} ${listed.err}`);
    const line = listed.out.split('\n').find((l) => /\sgh\s/.test(l));
    assert.ok(line, `override --list shows a gh entry: ${listed.out}`);
    assert.match(line, /AOFORGE_SKIP_GH_GATE=1/);
    assert.match(line, /default_branch/);

    const log = fs.readFileSync(path.join(p.root, '.aoforge', '.override-log.jsonl'), 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(log.map((e) => e.gate), ['gh']);
    assert.deepEqual(ghCalls(p), [], 'the escape is local too');
  });

  test('4. on the branch an unmerged PR entry names -> committed, an unscoped message gets Refs #<objective issue>', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo({ link: { branch: LINKED } });
    git(p, 'checkout', '-q', '-b', LINKED);
    write(p.root, SRC, 'module.exports = 4;\n');
    const before = head(p);

    const r = dfCommit(p, 'wip: notes', [SRC]);
    assert.equal(r.status, 0, `${r.out} ${r.err}`);
    assert.equal(r.json.committed, true, r.out);
    assert.ok(!('gate_escaped' in r.json), 'an allowed commit is not an escape');
    assert.notEqual(head(p), before);
    assert.equal(headMessage(p), `wip: notes\n\nRefs #${OBJECTIVE_ISSUE}`);
    assert.deepEqual(ghCalls(p), []);
    assert.ok(!fs.existsSync(path.join(p.root, '.aoforge', '.override-log.jsonl')), 'no override is logged for an allowed commit');
  });
});

// ─── SC2: gh setup ───────────────────────────────────────────────────────────

/** Run fn with process.exit / stdout / stderr captured. The first exit code wins; exit does not throw. */
function capture(fn) {
  const out = { stdout: '', stderr: '', code: null };
  const saved = { exit: process.exit, out: process.stdout.write, err: process.stderr.write };
  process.exit = (c) => { if (out.code === null) out.code = c === undefined ? 0 : c; };
  process.stdout.write = (chunk) => { out.stdout += chunk; return true; };
  process.stderr.write = (chunk) => { out.stderr += chunk; return true; };
  try {
    fn();
  } finally {
    process.exit = saved.exit;
    process.stdout.write = saved.out;
    process.stderr.write = saved.err;
  }
  return out;
}
const exitOf = (r) => (r.code === null ? 0 : r.code);

describe('SC2: aof-tools gh setup (test 5)', () => {
  let envh;
  let fake;
  let root;

  beforeEach(() => {
    envh = hermeticEnv();
    wiki._setRunGit(() => ({ ok: true, status: 0, stdout: 'abc123\tHEAD\n', stderr: '' }));
    const clock = { t: Date.UTC(2026, 9, 1, 12, 0, 0) };
    client._setNow(() => clock.t);
    client._setSleep((ms) => { clock.t += ms; });
    // An organization repository with no issue types or fields yet and the wiki off: the bare case setup exists for.
    fake = createFakeGitHub({ types: [], fields: [], hasWiki: false });
    client._setRunGh(fake.runGh);
    root = tmpDir('df-enforce-setup-');
    write(root, '.aoforge/config.json', `${JSON.stringify({ github: { enabled: true, repo: 'o/r' } })}\n`);
  });

  afterEach(() => {
    client._resetClient();
    wiki._setRunGit(null);
    envh.restore();
  });

  const run = (args, raw = false) => capture(() => setupCli.cmdGhSetup(root, args, raw));

  test('5. the dry-run prints the payloads and writes nothing; --apply then --apply writes nothing the second time', () => {
    const dry = run([]);
    assert.equal(exitOf(dry), 0, dry.stdout + dry.stderr);
    for (const needle of ['aoforge: default branch', 'aoforge/linked-issue', 'aoforge/planning-consistency']) {
      assert.ok(dry.stdout.includes(needle), `the dry-run lists ${needle}`);
    }
    for (const name of ['Objective', 'TRD']) assert.match(dry.stdout, new RegExp(`issue-type ${name}\\b`), name);
    for (const name of ['work', 'kind']) assert.match(dry.stdout, new RegExp(`issue-field ${name}\\b`), name);
    assert.match(dry.stdout, /Dry run/i);
    assert.deepEqual(fake.writes(), [], 'zero GitHub writes');
    assert.equal(fs.existsSync(path.join(root, '.github')), false, 'a dry-run writes no local file');
    assert.equal(fs.existsSync(setup.setupRecordPath('o/r')), false, 'and keeps no record');

    const first = run(['--apply']);
    assert.equal(exitOf(first), 0, first.stdout + first.stderr);
    assert.ok(fake.writes().length > 0, 'the first apply wrote');
    assert.equal(fake.rulesets.length, 1);
    assert.ok(fs.existsSync(path.join(root, '.github', 'workflows', 'aoforge.yml')));
    const writes = fake.writes().length;

    const second = run(['--apply'], true);
    assert.equal(exitOf(second), 0, second.stdout + second.stderr);
    assert.equal(fake.writes().length, writes, 'the second apply makes zero GitHub writes');
    const payload = JSON.parse(second.stdout);
    assert.deepEqual(payload.outcomes.filter((o) => ['created', 'updated', 'failed'].includes(o.status)), []);
    assert.deepEqual(payload.files, [], 'and writes no local file');
  });
});

// ─── SC3: the check runner ───────────────────────────────────────────────────

describe('SC3: the check runner on a pull_request event (test 6)', () => {
  let envh;
  let fake;
  let dir;

  beforeEach(() => {
    envh = hermeticEnv();
    client._setSleep(() => {});
    client._setNow(() => 0);
    fake = createFakeGitHub({ repo: 'o/r' });
    client._setRunGh(fake.runGh);
    dir = tmpDir('df-enforce-checks-');
  });

  afterEach(() => {
    client._resetClient();
    envh.restore();
  });

  const eventFile = (name) => {
    const file = path.join(dir, `${name}.json`);
    fs.copyFileSync(path.join(EVENTS, `${name}.json`), file);
    return file;
  };
  const runnerEnv = (file) => ({
    GITHUB_EVENT_PATH: file,
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_REPOSITORY: 'o/r',
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_RUN_ID: '777',
  });

  test('6a. no closing reference -> aoforge/linked-issue failure on the head sha, exit 1', () => {
    const r = checkCli.main({ argv: ['linked-issue'], env: runnerEnv(eventFile('pull_request-no-closes')) });
    assert.equal(r.code, 1);
    assert.equal(r.state, 'failure');
    const posted = fake.statuses['2'.repeat(40)];
    assert.equal(posted.length, 1);
    assert.equal(posted[0].state, 'failure');
    assert.equal(posted[0].context, 'aoforge/linked-issue');
    assert.equal(posted[0].context, CONTEXTS.linkedIssue);
    assert.match(posted[0].description, /closing reference/);
  });

  test('6b. Closes #12 to an issue that exists -> aoforge/linked-issue success, exit 0', () => {
    while (fake.issues.length < 12) fake.seedIssue({ title: `issue ${fake.issues.length + 1}` });
    const r = checkCli.main({ argv: ['linked-issue'], env: runnerEnv(eventFile('pull_request-closes')) });
    assert.equal(r.code, 0, r.description);
    assert.equal(r.state, 'success');
    const posted = fake.statuses['1'.repeat(40)];
    assert.equal(posted.length, 1);
    assert.equal(posted[0].state, 'success');
    assert.equal(posted[0].context, 'aoforge/linked-issue');
  });

  test('6c. run as the script Actions runs, the exit code is the verdict (gh answered by the PATH shim)', () => {
    const shim = installGhShim({ dir: path.join(dir, 'shim'), defaultCode: 1 });
    // The reads and the one status POST a "no closing reference" PR makes; the shim does not read stdin.
    shim.setTable({
      'api --paginate --slurp repos/o/r/pulls/124/commits': { code: 0, stdout: '[[]]' },
      'api --method POST repos/o/r/statuses/': { code: 0, stdout: '{}' },
    });
    const env = shim.env({ ...runnerEnv(eventFile('pull_request-no-closes')) });
    const r = spawnSync(process.execPath, [CHECK_CLI, 'linked-issue'], { env, encoding: 'utf-8', timeout: 60000 });
    assert.equal(r.status, 1, `${r.stdout} ${r.stderr}`);
    assert.match(r.stderr, /failure: /, 'a failure is reported on stderr');

    const posts = shim.readCalls().filter((c) => c.includes('POST'));
    assert.equal(posts.length, 1, 'exactly one status was posted');
    assert.equal(posts[0][posts[0].indexOf('POST') + 1], `repos/o/r/statuses/${'2'.repeat(40)}`);
  });
});

// ─── GEN-02 + GEN-03 in one flow ─────────────────────────────────────────────

describe('GEN-02/03: a queued write, the flush hook, validate health (test 7)', () => {
  const EVENT_COMMIT = (p) => ({
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: `node ${TOOLS} --cwd ${p.root} commit "wip: notes" --files ${SRC}` },
    cwd: p.root,
    session_id: 'gh-enforcement-e2e',
  });

  function w057(p) {
    const r = df(p, ['validate', 'health', '--raw']);
    assert.ok(r.json, `validate health printed JSON: ${r.out} ${r.err}`);
    return r.json.warnings.filter((i) => i.code === 'W057');
  }

  test('7. commit on the linked branch, verification post queues offline, the hook flushes it, W057 is gone', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo({ link: { branch: LINKED, number: 70 } });
    git(p, 'checkout', '-q', '-b', LINKED);
    write(p.root, SRC, 'module.exports = 7;\n');

    // 1. a store-mode commit lands on the linked branch (the hook's trigger)
    const committed = dfCommit(p, 'wip: notes', [SRC]);
    assert.equal(committed.status, 0, `${committed.out} ${committed.err}`);
    assert.equal(committed.json.committed, true);

    // 2. a planning write queues in the outbox; GitHub is unreachable, so the verb's own flush leaves it pending (exit 3).
    //    `verification post` queues one sticky comment on the objective issue and nothing else here: with no `status:` in
    //    the file no commit status is queued, so the flush needs no capability reads (`summary post` also queues a label
    //    change, whose flush reads the repository's capabilities first).
    const verificationFile = path.join(p.root, 'verification-input.md');
    fs.writeFileSync(verificationFile, '# Objective 7 verification\n\nNo frontmatter on purpose.\n');
    const posted = df(p, ['verification', 'post', '7', '--from', verificationFile]);
    assert.equal(posted.status, 3, `${posted.out} ${posted.err}`);
    const before = w057(p);
    assert.equal(before.length, 1, 'validate health reports the unsynced writes');
    assert.match(before[0].message, /queued/);
    assert.match(before[0].fix, /aof-tools gh outbox flush/);

    // 3. GitHub is reachable again; the hook after the next commit flushes what was queued
    p.shim.setTable({
      'api repos/o/r/issues/700': { code: 0, stdout: JSON.stringify({ id: 1000700, number: 700, state: 'open' }) },
      'api --paginate --slurp repos/o/r/issues/700/comments': { code: 0, stdout: '[[]]' },
      'api --method POST repos/o/r/issues/700/comments': {
        code: 0, stdout: JSON.stringify({ id: 9001, body: 'posted', updated_at: '2026-10-01T00:00:00Z' }),
      },
    });
    const hook = spawnSync(process.execPath, [HOOK], {
      cwd: p.root, env: childEnv(p), input: JSON.stringify(EVENT_COMMIT(p)), encoding: 'utf-8', timeout: 120000,
    });
    assert.equal(hook.status, 0, hook.stderr);
    const output = JSON.parse(hook.stdout);
    assert.equal(output.decision, undefined, 'the hook never blocks');
    assert.match(output.hookSpecificOutput.additionalContext, /synced \d+ GitHub write/);

    // 4. the queue is drained and the health report no longer carries W057
    const status = df(p, ['gh', 'outbox', 'status', '--raw']);
    assert.equal(status.status, 0, `${status.out} ${status.err}`);
    assert.equal(status.json.pending, 0, status.out);
    assert.deepEqual(w057(p), []);
  });
});

// ─── The workflow's script ───────────────────────────────────────────────────

describe('the reusable workflow runs a script that exists (test 10)', () => {
  const text = fs.readFileSync(WORKFLOW, 'utf-8');
  const invocations = [...text.matchAll(/node\s+(\S*gh-check-cli\.cjs)\s+([\w-]+)/g)].map((m) => ({ script: m[1], name: m[2] }));

  test('10a. every invocation points at gh-check-cli.cjs inside the AOForge checkout, and that file exists in the repo', () => {
    assert.ok(invocations.length >= 3, `the workflow runs the runner for each check: ${JSON.stringify(invocations)}`);
    for (const { script } of invocations) {
      assert.match(script, /^\.aoforge\//, 'it runs from the AOForge repository checkout (path: .aoforge)');
      const inRepo = path.join(REPO_ROOT, script.replace(/^\.aoforge\//, ''));
      assert.ok(fs.existsSync(inRepo), `${script} exists as ${inRepo}`);
      assert.equal(inRepo, CHECK_CLI);
    }
  });

  test('10b. every subcommand the workflow names is one the runner accepts (an unrelated event is a clean skip, exit 0)', () => {
    const envh = hermeticEnv();
    client._setRunGh(() => { throw new Error('gh must not be called for an event that is not a pull request'); });
    try {
      const dir = tmpDir('df-enforce-workflow-');
      const event = path.join(dir, 'push.json');
      fs.writeFileSync(event, JSON.stringify({ ref: 'refs/heads/main', repository: { full_name: 'o/r' } }));
      const names = [...new Set(invocations.map((i) => i.name))].sort();
      assert.deepEqual(names, ['linked-issue', 'planning-consistency', 'reconcile']);
      for (const name of names) {
        assert.ok(checkCli.CHECKS.includes(name), `the runner knows ${name}`);
        const r = checkCli.main({ argv: [name], env: { GITHUB_EVENT_PATH: event, GITHUB_EVENT_NAME: 'push', GITHUB_REPOSITORY: 'o/r' } });
        assert.equal(r.code, 0, `${name}: ${r.description}`);
        assert.equal(r.state, 'skipped', name);
        assert.doesNotMatch(r.description, /unknown check|usage/i, name);
      }
    } finally {
      client._resetClient();
      envh.restore();
    }
  });

  test('10c. no JS module the runner loads lies outside plugins/aoforge/aoforge/bin (the workflow also checks out references/ for model-profiles.json)', () => {
    // helpers.cjs reads references/model-profiles.json at load (data, not a module), so the sparse checkout lists
    // `references` beside `bin`. The full copy-and-run proof is in aoforge-workflows.repo.test.cjs (55-02).
    assert.match(text, /sparse-checkout:\s*\|\s*\n\s+plugins\/aoforge\/aoforge\/bin\s*\n\s+plugins\/aoforge\/aoforge\/references\s*\n/);
    const probe = 'console.log(JSON.stringify(Object.keys(require.cache)));';
    const r = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(CHECK_CLI)}); ${probe}`], { encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stderr);
    const loaded = JSON.parse(r.stdout);
    const bin = path.join(PLUGIN_ROOT, 'aoforge', 'bin') + path.sep;
    const outside = loaded.filter((f) => f.startsWith(REPO_ROOT + path.sep) && !f.startsWith(bin));
    assert.deepEqual(outside, [], 'every module the runner loads is under plugins/aoforge/aoforge/bin');
    assert.ok(loaded.includes(CHECK_CLI));
  });
});
