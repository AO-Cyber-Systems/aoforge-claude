'use strict';

/**
 * commit-steps.test.cjs — TRD 52-01 (objective 52, item 52-1): every printed `aof-tools commit` follow-up runs as printed.
 *
 *   1  store mode on `main`: the printed `git switch -c` line, then the escaped commit line → committed on the new
 *      branch, `gate_escaped`, and one `gate: "gh"` override-log entry carrying the printed AOFORGE_SKIP_GH_GATE_REASON
 *   2  store mode on the linked branch: the same full sequence also lands (a new, unlinked branch plus the escape)
 *   3  store mode on the linked branch: the command from the `gh pr start` line, run alone → committed, no escape, no log
 *   4  mirror mode (`github.enabled: true`, `store: false`) on `main`: the plain form lands on the new branch and carries
 *      no AOFORGE_SKIP_GH_GATE
 *   5  the fixture makes zero `gh` calls: the failing shim is first on PATH (proved here) and its log stays empty
 *   6  branchCommitSteps: the store form's lines 1-4 are the 51-04 text of migration 0010 and doctor check 20 with the
 *      branch, reason and command substituted; line 5 is `gh pr create --head <branch> --fill` (61-06, STOR-01); line 6
 *      names `aof-tools gh pr start <objective>` and ends with the bare command; the plain form; the TypeErrors
 *   9  both forms: `gh pr create` appears once, after the `git push` line (61-06)
 *   7  commitCommand('m', ['a', 'b']) is exactly `node ~/.claude/aoforge/bin/aof-tools.cjs commit "m" --files a b`
 *  11  the four real emitters (migration 0010 STORE_COMMIT_STEPS, doctor 20 and 21 commitNote, gh setup filesLines),
 *      each run as printed in a fresh store-mode fixture from `main` (scenario 1) and on the linked branch (scenario 3)
 *
 * "As printed" means the emitted text is executed: each runnable line goes through `sh -c` with only the literal prefix
 * `node ~/.claude/aoforge/bin/aof-tools.cjs` replaced by this checkout's aof-tools. `git push` and the pull-request line are
 * skipped (the fixture has no remote). Nothing here rebuilds the command from its parts.
 *
 * no_llm_test_data: every repo is a disposable `git init -b main` under the OS temp dir with a fake HOME (fx.gitEnv), a
 * fresh one per scenario. A `gh` shim first on PATH logs every call and fails. AOFORGE_ALLOW_RAW_COMMIT,
 * AOFORGE_SKIP_GH_GATE and AOFORGE_SKIP_GH_GATE_REASON start unset. Nothing touches this repository, the real ~/.claude,
 * the network or any port.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const fx = require('./__fixtures__/upgrade-fixtures.cjs');
const gm = require('./gh-mapping.cjs');

// Loaded per test, so a missing or broken module fails each test on its own rather than the whole file.
const load = () => require('./commit-steps.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'aof-tools.cjs');
const HAS_GIT = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;
const SRC = 'src/x.js';
const LINKED = '50-enforce';
const BRANCH = 'aoforge-follow-up';
const REASON = 'as printed follow-up';
const MESSAGE = 'chore: commit the printed follow-up';
const GATE_KEYS = ['AOFORGE_ALLOW_RAW_COMMIT', 'AOFORGE_SKIP_GH_GATE', 'AOFORGE_SKIP_GH_GATE_REASON'];

// The printed aof-tools prefix, and what replaces it when a printed line is executed here.
const PRINTED_PREFIX = 'node ~/.claude/aoforge/bin/aof-tools.cjs';
const LOCAL_PREFIX = `"${process.execPath}" "${TOOLS_PATH}"`;
const LINKED_LINE = "or, on an objective's linked branch";
const LINKED_MARK = 'commit there with: ';

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
 * A git repo on `main` shaped like a GitHub project (misc-commit-gate.test.cjs `storeRepo`): a tracked `src/x.js`,
 * config.json with `commit_docs` and `github.enabled`, `github.store` = `store`, the U-1 `.gitignore` block in store
 * mode, and — written AFTER the init commit — the v3 mapping whose PR entry links branch `50-enforce` to objective 50.
 */
function storeRepo({ store = true } = {}) {
  const home = fx.makeFakeHome();
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-commit-steps-')));
  const shim = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-commit-steps-gh-')));
  cleanup.push(root, home, shim);
  const ghLog = path.join(shim, 'gh-calls.log');
  fs.writeFileSync(path.join(shim, 'gh'), `#!/bin/sh\necho "$@" >> "${ghLog}"\nexit 1\n`, { mode: 0o755 });

  write(root, SRC, 'module.exports = 0;\n');
  write(root, '.aoforge/config.json', `${JSON.stringify({ commit_docs: true, github: { enabled: true, store } })}\n`);
  if (store) write(root, '.gitignore', U1_BLOCK);
  fx.initGitFixture(root, home);

  const m = gm.emptyMapping();
  gm.setEntry(m, '50', { issue_id: 500 });
  gm.setPr(m, '50', { branch: LINKED });
  const w = gm.writeMappingV3(root, m);
  assert.equal(w.ok, true, w.error);
  return { root, home, shim, ghLog };
}

/** The shell environment for a printed line: fake HOME, the gh shim first on PATH, every gate variable unset. */
function shellEnv(p) {
  const env = { ...fx.gitEnv(p.home), PATH: `${p.shim}${path.delimiter}${process.env.PATH}` };
  for (const key of GATE_KEYS) delete env[key];
  return env;
}

/** Run one printed line through `sh -c` in the fixture, with only the aof-tools prefix substituted. */
function sh(p, line) {
  const r = spawnSync('sh', ['-c', line.split(PRINTED_PREFIX).join(LOCAL_PREFIX)], {
    cwd: p.root, env: shellEnv(p), encoding: 'utf-8',
  });
  const out = (r.stdout || '').trim();
  let json = null;
  try { json = JSON.parse(out); } catch { /* not an aof-tools line */ }
  return { line, status: r.status, out, err: (r.stderr || '').trim(), json };
}

/**
 * Execute printed follow-up text as printed.
 *   route 'branch': in order, every line starting with `git switch -c`, `AOFORGE_SKIP_GH_GATE=1` or the aof-tools prefix
 *                   (the new-branch sequence); stops at the first line that fails.
 *   route 'linked': only the command after `commit there with: ` on the `gh pr start` line.
 * `git push`, the pull-request line and prose lines are never run. Returns every run.
 */
function runAsPrinted(p, text, route) {
  const runs = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    let cmd = null;
    if (route === 'branch') {
      if (line.startsWith('git switch -c ') || line.startsWith('AOFORGE_SKIP_GH_GATE=1 ') ||
        line.startsWith(`${PRINTED_PREFIX} `)) cmd = line;
    } else if (route === 'linked') {
      if (line.startsWith(LINKED_LINE) && line.includes(LINKED_MARK)) cmd = line.slice(line.indexOf(LINKED_MARK) + LINKED_MARK.length);
    } else {
      throw new Error(`unknown route ${route}`);
    }
    if (cmd === null) continue;
    const r = sh(p, cmd);
    runs.push(r);
    if (r.status !== 0) break;
  }
  return runs;
}

const describeRuns = (runs) => runs.map((r) => `$ ${r.line}\n  exit ${r.status}\n  ${r.out}\n  ${r.err}`).join('\n');

function currentBranch(p) {
  return git(p, 'rev-parse', '--abbrev-ref', 'HEAD');
}

function headFiles(p) {
  return git(p, 'show', '--name-only', '--no-renames', '--format=', 'HEAD').split('\n').filter(Boolean).sort();
}

function overrideLog(root) {
  const file = path.join(root, '.aoforge', '.override-log.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function ghCalls(p) {
  return fs.existsSync(p.ghLog) ? fs.readFileSync(p.ghLog, 'utf-8').split('\n').filter(Boolean) : [];
}

/** Scenario 1/2: the new-branch sequence ran (switch + escaped commit), landed on `branch`, and logged `reason`. */
function assertEscapedOnNewBranch(p, runs, { branch, reason, before, files }) {
  assert.deepEqual(runs.map((r) => r.status), [0, 0], describeRuns(runs));
  assert.match(runs[0].line, new RegExp(`^git switch -c ${branch}$`));
  const r = runs[1];
  assert.ok(r.json, `the commit line printed aof-tools JSON: ${describeRuns(runs)}`);
  assert.equal(r.json.committed, true, r.out);
  assert.equal(r.json.gate_escaped, true, r.out);
  assert.equal(currentBranch(p), branch);
  assert.equal(git(p, 'rev-parse', 'HEAD~1'), before, 'one commit on top of where the sequence started');
  assert.deepEqual(headFiles(p), [...files].sort());
  const log = overrideLog(p.root);
  assert.equal(log.length, 1, JSON.stringify(log));
  assert.equal(log[0].gate, 'gh');
  assert.equal(log[0].reason, reason, 'the logged reason is the printed AOFORGE_SKIP_GH_GATE_REASON');
  assert.deepEqual(ghCalls(p), [], 'the printed sequence needs no gh call');
}

/** Scenario 3: the `gh pr start` line's command alone landed on the linked branch with no escape. */
function assertLinkedCommit(p, runs, { before, files }) {
  assert.equal(runs.length, 1, `exactly the gh pr start line's command ran: ${describeRuns(runs)}`);
  const r = runs[0];
  assert.equal(r.status, 0, describeRuns(runs));
  assert.doesNotMatch(r.line, /AOFORGE_SKIP_GH_GATE/, 'the linked-branch command carries no escape');
  assert.ok(r.json, r.out);
  assert.equal(r.json.committed, true, r.out);
  assert.ok(!('gate_escaped' in r.json), 'a linked-branch commit is not an escape');
  assert.equal(currentBranch(p), LINKED);
  assert.equal(git(p, 'rev-parse', 'HEAD~1'), before);
  assert.deepEqual(headFiles(p), [...files].sort());
  assert.deepEqual(overrideLog(p.root), [], 'no override is logged');
  assert.deepEqual(ghCalls(p), []);
}

describe('52-01 the store form runs as printed (tests 1-3)', () => {
  test('1. on main: git switch -c, then the escaped commit → committed on the new branch, gate_escaped, gate:gh logged', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const { branchCommitSteps, commitCommand } = load();
    const p = storeRepo();
    write(p.root, SRC, 'module.exports = 1;\n');
    const before = git(p, 'rev-parse', 'HEAD');
    const text = branchCommitSteps({ branch: BRANCH, reason: REASON, command: commitCommand(MESSAGE, [SRC]) });

    const runs = runAsPrinted(p, text, 'branch');
    assertEscapedOnNewBranch(p, runs, { branch: BRANCH, reason: REASON, before, files: [SRC] });
  });

  test('2. on the linked branch: the same full sequence also lands (a new branch plus the escape)', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const { branchCommitSteps, commitCommand } = load();
    const p = storeRepo();
    git(p, 'switch', '-q', '-c', LINKED);
    write(p.root, SRC, 'module.exports = 2;\n');
    const before = git(p, 'rev-parse', 'HEAD');
    const text = branchCommitSteps({ branch: BRANCH, reason: REASON, command: commitCommand(MESSAGE, [SRC]) });

    const runs = runAsPrinted(p, text, 'branch');
    assertEscapedOnNewBranch(p, runs, { branch: BRANCH, reason: REASON, before, files: [SRC] });
  });

  test('3. on the linked branch: the gh pr start line\'s command, run alone, lands with no escape and no log entry', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const { branchCommitSteps, commitCommand } = load();
    const p = storeRepo();
    git(p, 'switch', '-q', '-c', LINKED);
    write(p.root, SRC, 'module.exports = 3;\n');
    const before = git(p, 'rev-parse', 'HEAD');
    const text = branchCommitSteps({ branch: BRANCH, reason: REASON, command: commitCommand(MESSAGE, [SRC]) });

    const runs = runAsPrinted(p, text, 'linked');
    assertLinkedCommit(p, runs, { before, files: [SRC] });
  });
});

describe('52-01 the plain form and the gh shim (tests 4-5)', () => {
  test('4. mirror mode on main: the plain form lands on the new branch and carries no AOFORGE_SKIP_GH_GATE', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const { branchCommitSteps, commitCommand } = load();
    const p = storeRepo({ store: false });
    write(p.root, SRC, 'module.exports = 4;\n');
    const before = git(p, 'rev-parse', 'HEAD');
    const text = branchCommitSteps({ branch: BRANCH, reason: null, command: commitCommand(MESSAGE, [SRC]) });
    assert.doesNotMatch(text, /AOFORGE_SKIP_GH_GATE/);

    const runs = runAsPrinted(p, text, 'branch');
    assert.deepEqual(runs.map((r) => r.status), [0, 0], describeRuns(runs));
    const r = runs[1];
    assert.equal(r.json.committed, true, r.out);
    assert.ok(!('gate_escaped' in r.json), 'mirror mode has no gate to escape');
    assert.equal(currentBranch(p), BRANCH);
    assert.equal(git(p, 'rev-parse', 'HEAD~1'), before);
    assert.deepEqual(headFiles(p), [SRC]);
    assert.deepEqual(overrideLog(p.root), []);
    assert.deepEqual(ghCalls(p), []);
  });

  test('5. the failing gh shim is first on PATH, so an empty call log means zero gh calls', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    const r = sh(p, 'gh auth status');
    assert.equal(r.status, 1, 'the shim fails every call');
    assert.deepEqual(ghCalls(p), ['auth status'], 'and records it');
  });
});

describe('52-01 the builder (tests 6-7)', () => {
  // The first four lines of the 51-04 store-mode text, copied from migration 0010 and doctor check 20 as they were
  // before 52-01. Line 5 was prose (an instruction to open a pull request, with no command) until 61-06 (STOR-01) made
  // it a command, so only lines 1-4 are historical; line 5 is asserted on its own below.
  const HISTORICAL_0010_LINES_1_TO_4 = [
    'commit on a new branch with the logged escape (gate gh; store mode refuses the default branch and unlinked ' +
      'branches), then merge it through a pull request:',
    '  git switch -c aoforge-store-cache',
    '  AOFORGE_SKIP_GH_GATE=1 AOFORGE_SKIP_GH_GATE_REASON="store migration" node ~/.claude/aoforge/bin/aof-tools.cjs ' +
      'commit "chore: gitignore the planning cache (store mode)" --files .gitignore .aoforge/',
    '  git push -u origin aoforge-store-cache',
  ].join('\n');
  const DOCTOR20_COMMAND =
    'node ~/.claude/aoforge/bin/aof-tools.cjs commit "chore: untrack AOForge runtime state" --files .gitignore .aoforge/.progress-guard.json';
  const HISTORICAL_DOCTOR20_LINES_1_TO_4 = [
    'commit on a new branch with the logged escape (gate gh; store mode refuses the default branch and unlinked ' +
      'branches), then merge it through a pull request:',
    '  git switch -c aoforge-untrack-runtime-state',
    `  AOFORGE_SKIP_GH_GATE=1 AOFORGE_SKIP_GH_GATE_REASON="untrack AOForge runtime state" ${DOCTOR20_COMMAND}`,
    '  git push -u origin aoforge-untrack-runtime-state',
  ].join('\n');
  // 0010-store-gitignore.test.cjs ESCAPED_COMMIT_RE: the escaped line must stay the only one it matches.
  const ESCAPED_LINE_RE = /^\s*AOFORGE_SKIP_GH_GATE=1 /gm;

  test('6a. store form: lines 1-4 are the 51-04 0010 text; line 5 is gh pr create; line 6 names gh pr start and ends with the bare command', () => {
    const { branchCommitSteps, commitCommand } = load();
    const command = commitCommand('chore: gitignore the planning cache (store mode)', ['.gitignore', '.aoforge/']);
    const out = branchCommitSteps({ branch: 'aoforge-store-cache', reason: 'store migration', command });
    const lines = out.split('\n');
    assert.equal(lines.length, 6, out);
    assert.equal(lines.slice(0, 4).join('\n'), HISTORICAL_0010_LINES_1_TO_4);
    assert.equal(lines[4], '  gh pr create --head aoforge-store-cache --fill');
    assert.equal(lines[5],
      "  or, on an objective's linked branch (`aof-tools gh pr start <objective>`), commit there with: " +
      'node ~/.claude/aoforge/bin/aof-tools.cjs commit "chore: gitignore the planning cache (store mode)" --files .gitignore .aoforge/');
    assert.ok(lines[5].includes('aof-tools gh pr start <objective>'));
    assert.ok(lines[5].endsWith(command));
    assert.equal(out.match(ESCAPED_LINE_RE).length, 1, 'only line 3 starts with the escape');
  });

  test('6b. store form: lines 1-4 are the 51-04 doctor-20 text for its branch, reason and command; line 5 is gh pr create', () => {
    const { branchCommitSteps } = load();
    const out = branchCommitSteps({
      branch: 'aoforge-untrack-runtime-state', reason: 'untrack AOForge runtime state', command: DOCTOR20_COMMAND,
    });
    const lines = out.split('\n');
    assert.equal(lines.length, 6, out);
    assert.equal(lines.slice(0, 4).join('\n'), HISTORICAL_DOCTOR20_LINES_1_TO_4);
    assert.equal(lines[4], '  gh pr create --head aoforge-untrack-runtime-state --fill');
    assert.ok(lines[5].includes('`aof-tools gh pr start <objective>`'));
    assert.ok(lines[5].endsWith(`commit there with: ${DOCTOR20_COMMAND}`));
  });

  test('6c. plain form (reason null or undefined): new branch, bare command, push, gh pr create; no escape, no gh pr start', () => {
    const { branchCommitSteps } = load();
    const expected = [
      'commit on a new branch, then merge it through a pull request:',
      '  git switch -c aoforge-setup',
      '  node ~/.claude/aoforge/bin/aof-tools.cjs commit "m" --files a b',
      '  git push -u origin aoforge-setup',
      '  gh pr create --head aoforge-setup --fill',
    ].join('\n');
    const command = 'node ~/.claude/aoforge/bin/aof-tools.cjs commit "m" --files a b';
    const plain = branchCommitSteps({ branch: 'aoforge-setup', command, reason: null });
    assert.equal(plain, expected);
    assert.equal(plain.split('\n').length, 5);
    assert.equal(branchCommitSteps({ branch: 'aoforge-setup', command }), expected);
  });

  test('9. in both forms `gh pr create` appears exactly once, after the push line, and the old prose is gone', () => {
    const { branchCommitSteps } = load();
    const command = 'node ~/.claude/aoforge/bin/aof-tools.cjs commit "m" --files a b';
    for (const reason of [null, 'store migration']) {
      const out = branchCommitSteps({ branch: 'aoforge-setup', command, reason });
      const lines = out.split('\n');
      const pr = lines.filter((l) => l.includes('gh pr create'));
      assert.deepEqual(pr, ['  gh pr create --head aoforge-setup --fill'], `reason ${reason}: ${out}`);
      assert.ok(lines.indexOf(pr[0]) > lines.indexOf('  git push -u origin aoforge-setup'), `after the push, reason ${reason}`);
      assert.ok(!out.includes('then open a pull request'), out);
    }
  });

  test('6d. a missing or non-string branch or command, or an unusable reason, is a TypeError', () => {
    const { branchCommitSteps } = load();
    const command = 'node ~/.claude/aoforge/bin/aof-tools.cjs commit "m" --files a';
    assert.throws(() => branchCommitSteps(), TypeError);
    assert.throws(() => branchCommitSteps({ command }), TypeError);
    assert.throws(() => branchCommitSteps({ branch: '', command }), TypeError);
    assert.throws(() => branchCommitSteps({ branch: 5, command }), TypeError);
    assert.throws(() => branchCommitSteps({ branch: 'b' }), TypeError);
    assert.throws(() => branchCommitSteps({ branch: 'b', command: '' }), TypeError);
    assert.throws(() => branchCommitSteps({ branch: 'b', command, reason: '' }), TypeError);
    assert.throws(() => branchCommitSteps({ branch: 'b', command, reason: 'say "why"' }), TypeError,
      'a double quote would break the printed AOFORGE_SKIP_GH_GATE_REASON="..."');
  });

  test('7. commitCommand: the exact aof-tools commit line; DF_TOOLS_CMD is the printed prefix', () => {
    const { commitCommand, DF_TOOLS_CMD } = load();
    assert.equal(DF_TOOLS_CMD, 'node ~/.claude/aoforge/bin/aof-tools.cjs');
    assert.equal(commitCommand('m', ['a', 'b']), 'node ~/.claude/aoforge/bin/aof-tools.cjs commit "m" --files a b');
    assert.throws(() => commitCommand('', ['a']), TypeError);
    assert.throws(() => commitCommand('m', []), TypeError);
    assert.throws(() => commitCommand('m', 'a'), TypeError);
    assert.throws(() => commitCommand('say "hi"', ['a']), TypeError, 'the message is printed inside double quotes');
  });
});

describe('52-01 all four emitters run as printed (test 11)', () => {
  const WORKFLOW = '.github/workflows/aoforge.yml';
  const PR_TEMPLATE = '.github/pull_request_template.md';

  /** Track a runtime file, then untrack it the way doctor 20's fix does: ignore rule, `git rm --cached`, delete. */
  function untrackRuntimeState(p) {
    const rel = '.aoforge/.progress-guard.json';
    write(p.root, rel, '{\n  "count": 1\n}\n');
    git(p, 'add', '-f', '--', rel);
    git(p, 'commit', '-q', '-m', 'track a runtime file');
    fs.appendFileSync(path.join(p.root, '.gitignore'), `${rel}\n`, 'utf-8');
    git(p, 'rm', '-q', '--cached', '--', rel);
    fs.rmSync(path.join(p.root, rel));
    return ['.gitignore', rel];
  }

  // Each emitter's REAL store-mode output for a fixture, the files its printed command names (created or modified
  // first), and the branch and reason it prints. Modules load inside the test, so one broken emitter fails alone.
  const EMITTERS = [
    {
      name: 'migration 0010 STORE_COMMIT_STEPS',
      branch: 'aoforge-store-cache',
      reason: 'store migration',
      // `.aoforge/` paths are ignored and skipped by design; the `.gitignore` change is what lands.
      prepare: (p) => {
        fs.appendFileSync(path.join(p.root, '.gitignore'), 'node_modules/\n', 'utf-8');
        return ['.gitignore'];
      },
      text: () => require('./migrations/0010-store-gitignore.cjs').STORE_COMMIT_STEPS,
    },
    {
      name: 'doctor check 20 commitNote',
      branch: 'aoforge-untrack-runtime-state',
      reason: 'untrack AOForge runtime state',
      prepare: untrackRuntimeState,
      text: (p, files) => require('./doctor-checks/20-legacy-runtime-state.cjs').commitNote(p.root, files),
    },
    {
      name: 'doctor check 21 commitNote',
      branch: 'aoforge-upgrade',
      reason: 'AOForge upgrade',
      prepare: (p) => {
        write(p.root, '.aoforge/config.json',
          `${JSON.stringify({ commit_docs: true, github: { enabled: true, store: true }, aoforge: { version: '9.9.9' } })}\n`);
        write(p.root, 'CLAUDE.md', '# Project\n');
        return ['.aoforge/config.json', 'CLAUDE.md'];
      },
      text: (p, files) => require('./doctor-checks/21-pending-migrations.cjs').commitNote(p.root, '9.9.9', files),
    },
    {
      name: 'gh setup filesLines',
      branch: 'aoforge-setup',
      reason: 'gh setup workflow',
      prepare: (p) => {
        write(p.root, WORKFLOW, 'name: aoforge\n');
        write(p.root, PR_TEMPLATE, '## Linked issue\n');
        return [WORKFLOW, PR_TEMPLATE];
      },
      text: (p, files) => require('./gh-setup-cli.cjs').filesLines(p.root, files, []).join('\n'),
    },
  ];

  for (const e of EMITTERS) {
    test(`11. ${e.name}, from main: the printed new-branch sequence lands with the logged escape`, (t) => {
      if (!HAS_GIT) return t.skip('git not installed');
      const p = storeRepo();
      const files = e.prepare(p);
      const before = git(p, 'rev-parse', 'HEAD');
      const text = e.text(p, files);
      assert.match(text, /`aof-tools gh pr start <objective>`/, `${e.name} names gh pr start: ${text}`);

      const runs = runAsPrinted(p, text, 'branch');
      assertEscapedOnNewBranch(p, runs, { branch: e.branch, reason: e.reason, before, files });
    });

    test(`11. ${e.name}, on the linked branch: the printed gh pr start command lands with no escape`, (t) => {
      if (!HAS_GIT) return t.skip('git not installed');
      const p = storeRepo();
      git(p, 'switch', '-q', '-c', LINKED);
      const files = e.prepare(p);
      const before = git(p, 'rev-parse', 'HEAD');
      const text = e.text(p, files);

      const runs = runAsPrinted(p, text, 'linked');
      assertLinkedCommit(p, runs, { before, files });
    });
  }
});
