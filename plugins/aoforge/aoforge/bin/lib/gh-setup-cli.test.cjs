'use strict';

// TRD 50-11 — gh-setup-cli.cjs, `aof-tools gh setup [--apply] [--refresh] [--require-wiki] [--raw]` (GEN-04).
//
// `cmdGhSetup` runs in-process under capture() (process.exit and stdout/stderr stubbed) against the 50-01 fake GitHub
// through gh-client's `_setRunGh` seam, with a clock that never sleeps and the wiki's git seam stubbed. The dispatch
// and config tests spawn aof-tools against a temp project with `github.enabled` off, so they make no gh call at all.
// Nothing here touches the network, port 8080, or the real ~/.claude (`hermeticEnv`).

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cli = require('./gh-setup-cli.cjs');
const steps = require('./commit-steps.cjs');
const setup = require('./gh-setup.cjs');
const helpers = require('./helpers.cjs');
const { parseWorkflowPins } = require('./checks-pin.cjs');
const client = require('./gh-client.cjs');
const wiki = require('./gh-wiki.cjs');
const configLib = require('./config.cjs');
const { COMMANDS: HELP_COMMANDS } = require('./help.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');

const DF_TOOLS = path.resolve(__dirname, '..', 'aof-tools.cjs');
const GIT_OK = { ok: true, status: 0, stdout: 'abc123\tHEAD\n', stderr: '' };
const WORKFLOW = '.github/workflows/aoforge.yml';
const PR_TEMPLATE = '.github/pull_request_template.md';
const SETUP_MESSAGE = 'chore: add the AOForge checks workflow and pull request template';
// The printed follow-up must name the aof-tools commit of both files (52-01: the builder prints `aof-tools.cjs commit`).
const SETUP_COMMIT_RE = /aof-tools\.cjs commit .* --files .*\.github\/workflows\/aoforge\.yml .*\.github\/pull_request_template\.md/;

/** The builder's follow-up for the two setup files: store form with the logged escape, or the plain form (TRD 52-01). */
const setupSteps = (store) => steps.branchCommitSteps({
  branch: 'aoforge-setup',
  reason: store ? 'gh setup workflow' : null,
  command: steps.commitCommand(SETUP_MESSAGE, [WORKFLOW, PR_TEMPLATE]),
});

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

describe('gh setup command (tests 1, 2, 3, 4, 6, 7, 8)', () => {
  let hermetic;
  let root;
  let fake;
  let clock;

  beforeEach(() => {
    hermetic = hermeticEnv();
    wiki._setRunGit(() => ({ ...GIT_OK }));
    clock = { t: Date.UTC(2026, 9, 1, 12, 0, 0) };
    client._setNow(() => clock.t);
    client._setSleep((ms) => { clock.t += ms; });
  });

  afterEach(() => {
    client._resetClient();
    wiki._setRunGit(null);
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = null;
    hermetic.restore();
  });

  function project(github = {}, files = {}) {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-setup-cli-'));
    fs.mkdirSync(path.join(root, '.aoforge'), { recursive: true });
    fs.writeFileSync(path.join(root, '.aoforge', 'config.json'), `${JSON.stringify({ github: { enabled: true, repo: 'o/r', ...github } })}\n`);
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), body);
    }
    return root;
  }

  /** A bare Organization repository (no types or fields, wiki off) behind the gh seam. `github.store` is NOT set. */
  function install(opts = {}) {
    fake = createFakeGitHub({ types: [], fields: [], hasWiki: false, ...opts });
    client._setRunGh(fake.runGh);
    return fake;
  }

  const run = (args, raw = false) => capture(() => cli.cmdGhSetup(root, args, raw));
  const json = (r) => JSON.parse(r.stdout);
  const exists = (rel) => fs.existsSync(path.join(root, rel));

  test('1. a bare dry-run prints the plan with exact payloads, exits 0 and makes zero writes', () => {
    install();
    project();
    const r = run([]);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.match(r.stdout, /aoforge: default branch/);
    assert.match(r.stdout, /"type": "merge_queue"/, 'the ruleset JSON, merge queue included');
    assert.match(r.stdout, /"context": "aoforge\/linked-issue"/);
    for (const name of ['Objective', 'TRD', 'Decision', 'Debug', 'Quick']) assert.match(r.stdout, new RegExp(`\\[create\\] issue-type ${name}\\b`), name);
    for (const name of ['work', 'kind']) assert.match(r.stdout, new RegExp(`\\[create\\] issue-field ${name}\\b`), name);
    assert.match(r.stdout, /X-GitHub-Api-Version: 2026-03-10/, 'the header the field create will send is shown');
    assert.match(r.stdout, /Dry run/i);
    assert.match(r.stdout, /gh setup --apply/);
    assert.deepEqual(fake.writes(), [], 'zero GitHub writes');
    assert.ok(fake.calls().length > 0, 'the plan was read from GitHub');
    assert.equal(exists('.github'), false, 'a dry-run writes no local file either');
    assert.equal(fs.existsSync(setup.setupRecordPath('o/r')), false);
  });

  test('1b. --raw prints the JSON: apply false, the repository and the full action list', () => {
    install();
    project();
    const r = run([], true);
    assert.equal(exitOf(r), 0);
    const payload = json(r);
    assert.equal(payload.ok, true);
    assert.equal(payload.apply, false);
    assert.equal(payload.repo, 'o/r');
    assert.ok(Array.isArray(payload.actions) && payload.actions.length > 10);
    const ruleset = payload.actions.find((a) => a.kind === 'ruleset');
    assert.equal(ruleset.status, 'create');
    assert.equal(ruleset.request.args[0], 'api');
    assert.equal(JSON.parse(ruleset.request.input).name, 'aoforge: default branch', 'the request is the one apply sends');
    assert.deepEqual(fake.writes(), []);
  });

  test('2. --apply creates everything, writes the two files uncommitted and says how to merge them', () => {
    install();
    project();
    const r = run(['--apply']);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.match(r.stdout, /\[created\] ruleset aoforge: default branch/);
    assert.match(r.stdout, /\[created\] workflow/);
    assert.ok(exists(WORKFLOW) && exists(PR_TEMPLATE));
    assert.equal(fake.rulesets.length, 1);
    assert.equal(fake.labels.length, 6);
    assert.match(r.stdout, /not committed/i);
    assert.match(r.stdout, SETUP_COMMIT_RE);
    assert.match(r.stdout, /aoforge\/linked-issue/, 'the bootstrapping hazard is stated');
    assert.match(r.stdout, /merge .*workflow .*first/i);
    assert.equal(r.stderr, '');
    // 52-01 (store off): the plain branch sequence from the builder, runnable as printed, with no gate escape.
    assert.ok(r.stdout.includes(`Commit them through a pull request:\n${setupSteps(false)}\n`), r.stdout);
    assert.doesNotMatch(r.stdout, /AOFORGE_SKIP_GH_GATE/);
    assert.doesNotMatch(r.stdout, /Commit them on a branch and open a pull request: aof-tools commit/, 'the bare line is gone');
  });

  test('2s. --apply in store mode prints the builder\'s branch + logged-escape sequence and the gh pr start route (52-01)', () => {
    install();
    project({ store: true });
    const r = run(['--apply']);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.ok(exists(WORKFLOW) && exists(PR_TEMPLATE));
    assert.match(r.stdout, /not committed/i);
    assert.ok(r.stdout.includes(`Commit them through a pull request:\n${setupSteps(true)}\n`), r.stdout);
    assert.match(r.stdout, SETUP_COMMIT_RE);
    assert.match(r.stdout, /AOFORGE_SKIP_GH_GATE=1 AOFORGE_SKIP_GH_GATE_REASON="gh setup workflow" /);
    assert.match(r.stdout, /aof-tools gh pr start <objective>/);
    assert.doesNotMatch(r.stdout, /Commit them on a branch and open a pull request: aof-tools commit/, 'the bare line is gone');
    assert.match(r.stdout, /merge .*workflow .*first/i, 'the ruleset lines are unchanged');
    assert.equal(r.stderr, '');
  });

  // ─── 55-01: the printed merge step is runnable (the ruleset grants repository admins a bypass) ───

  /** The apply output's lines that tell the user how to merge the workflow pull request. */
  const guidance = (stdout) => stdout.split('\n').filter((l) => /repository-admin bypass|gh pr merge/.test(l));
  /** The status the apply output reports for `kind` (`[created] ruleset ...`), or null. */
  const outcomeOf = (stdout, kind) => {
    const m = new RegExp(`^\\[(\\w+)\\] ${kind} `, 'm').exec(stdout);
    return m ? m[1] : null;
  };

  test('55-01 test 5. an apply that created the ruleset names the repository-admin bypass and the gh pr merge --admin --squash command', () => {
    install();
    project();
    const r = run(['--apply']);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.equal(outcomeOf(r.stdout, 'ruleset'), 'created');
    assert.match(r.stdout, /repository-admin bypass/);
    assert.match(r.stdout, /gh pr merge <number> --admin --squash/);
    assert.match(r.stdout, /Merge the workflow pull request first/);
    assert.match(r.stdout, /aoforge\/linked-issue and aoforge\/planning-consistency/, 'the bootstrapping hazard is still stated');
    assert.doesNotMatch(r.stdout, /may need to bypass/, 'the impossible step is gone');
    assert.ok(guidance(r.stdout).length >= 1);
    assert.equal(fake.rulesets[0].bypass_actors.length, 1, 'and the ruleset really grants it');
  });

  test('55-01 test 5b. the guidance is printed when the ruleset already existed (exists) and files were written', () => {
    install({ rulesets: [{ ...setup.desiredRuleset({ mergeMethod: 'squash' }) }] });
    project();
    const r = run(['--apply']);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.equal(outcomeOf(r.stdout, 'ruleset'), 'exists');
    assert.match(r.stdout, /gh pr merge <number> --admin --squash/);
    assert.doesNotMatch(r.stdout, /may need to bypass/);
  });

  test('55-01 test 6. the merge command follows github.pr.merge_method: rebase and merge are named, an unknown method prints --squash', () => {
    for (const [method, flag] of [['rebase', '--rebase'], ['merge', '--merge'], ['squash', '--squash'], ['fast-forward', '--squash'], ['', '--squash']]) {
      install();
      project({ pr: { merge_method: method } });
      const r = run(['--apply']);
      assert.equal(exitOf(r), 0, `${method}: ${r.stdout}${r.stderr}`);
      assert.match(r.stdout, new RegExp(`gh pr merge <number> --admin ${flag}\\b`), `${method}: ${r.stdout}`);
      const others = ['--squash', '--rebase', '--merge'].filter((f) => f !== flag);
      for (const other of others) assert.doesNotMatch(r.stdout, new RegExp(`gh pr merge <number> --admin ${other}\\b`), `${method} must not print ${other}`);
      fs.rmSync(root, { recursive: true, force: true });
      root = null;
    }
  });

  test('55-01 test 6b. with no github.pr block at all the command is --squash', () => {
    install();
    project();
    const r = run(['--apply']);
    assert.match(r.stdout, /gh pr merge <number> --admin --squash\b/);
    assert.doesNotMatch(r.stdout, /--admin --(rebase|merge)\b/);
  });

  test('55-01 test 6c. nothing to merge, nothing printed: a second apply has no guidance and no bypass talk', () => {
    install();
    project();
    assert.equal(exitOf(run(['--apply'])), 0);
    const again = run(['--apply']);
    assert.equal(exitOf(again), 0);
    assert.doesNotMatch(again.stdout, /gh pr merge/);
    assert.doesNotMatch(again.stdout, /may need to bypass/);
  });

  test('3. a second --apply makes zero writes, reports nothing to do and leaves both files identical', () => {
    install();
    project();
    assert.equal(exitOf(run(['--apply'])), 0);
    const writes = fake.writes().length;
    const workflow = fs.readFileSync(path.join(root, WORKFLOW));
    const template = fs.readFileSync(path.join(root, PR_TEMPLATE));
    const r = run(['--apply'], true);
    assert.equal(exitOf(r), 0);
    assert.equal(fake.writes().length, writes);
    assert.deepEqual(fs.readFileSync(path.join(root, WORKFLOW)), workflow);
    assert.deepEqual(fs.readFileSync(path.join(root, PR_TEMPLATE)), template);
    const payload = json(r);
    assert.equal(payload.apply, true);
    assert.deepEqual(payload.outcomes.filter((o) => ['created', 'updated', 'failed'].includes(o.status)), []);
    assert.deepEqual(payload.files, [], 'no local file was written');
  });

  test('3b. the second --apply prose says nothing changed and does not repeat the commit instructions', () => {
    install();
    project();
    run(['--apply']);
    const r = run(['--apply']);
    assert.equal(exitOf(r), 0);
    assert.match(r.stdout, /nothing to change|already in place/i);
    assert.doesNotMatch(r.stdout, /not committed/i);
  });

  // ─── 61-06: the dry run shows the pins and previews the follow-up, ending in a runnable gh pr create ───

  const PR_CREATE = '  gh pr create --head aoforge-setup --fill';
  /** The two pin lines the workflow this checkout's version renders carries, read by the one pin reader. */
  const expectedPins = () => parseWorkflowPins(setup.renderTemplates({}, helpers.pluginVersion()).workflow).lines;

  test('61-06 test 10. a bare dry run prints the pins and previews the follow-up steps, still with zero writes', () => {
    install();
    project();
    const r = run([]);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    const pins = expectedPins();
    assert.equal(pins.length, 2, 'the rendered workflow carries a uses: and an aoforge-ref: line');
    for (const line of pins) assert.ok(r.stdout.includes(`    ${line}\n`), `${line}\n${r.stdout}`);
    assert.ok(pins[0].startsWith('uses: ') && pins[1].startsWith('aoforge-ref: '), 'uses: first, then aoforge-ref:');
    assert.ok(r.stdout.indexOf(pins[0]) < r.stdout.indexOf(pins[1]), 'printed in that order');
    assert.ok(r.stdout.includes('After --apply: it writes'), r.stdout);
    assert.ok(r.stdout.includes(`${WORKFLOW}, ${PR_TEMPLATE} to the working tree, not committed.`), r.stdout);
    assert.ok(r.stdout.includes('  git switch -c aoforge-setup'), r.stdout);
    assert.ok(r.stdout.includes(PR_CREATE), r.stdout);
    assert.match(r.stdout, SETUP_COMMIT_RE);
    assert.ok(r.stdout.indexOf('Dry run for o/r') < r.stdout.indexOf('After --apply'), 'the preview follows the Dry run line');
    // test 1 again: still read-only
    assert.deepEqual(fake.writes(), [], 'zero GitHub writes');
    assert.equal(exists('.github'), false, 'a dry run writes no local file');
    assert.equal(r.stderr, '');
  });

  test('61-06 test 11. a dry run with the workflow and the PR template already current has no preview block and no gh pr create', () => {
    install();
    project();
    assert.equal(exitOf(run(['--apply'])), 0);
    const writes = fake.writes().length;
    const r = run([]);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /After --apply/);
    assert.doesNotMatch(r.stdout, /gh pr create/);
    assert.doesNotMatch(r.stdout, /git switch -c/);
    for (const line of expectedPins()) assert.ok(r.stdout.includes(`    ${line}\n`), `an exists workflow still shows ${line}`);
    assert.equal(fake.writes().length, writes, 'the dry run wrote nothing');
  });

  test('61-06 test 12. --apply ends its commit steps with gh pr create and no longer says to open a pull request in prose', () => {
    install();
    project();
    const r = run(['--apply']);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.ok(r.stdout.includes(`  git push -u origin aoforge-setup\n${PR_CREATE}\n`), r.stdout);
    assert.doesNotMatch(r.stdout, /then open a pull request/);
  });

  test('61-06 test 13. a store-mode dry run previews the store form: the logged escape, then gh pr create, then the gh pr start route', () => {
    install();
    project({ store: true });
    const r = run([]);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    const escape = r.stdout.indexOf('AOFORGE_SKIP_GH_GATE=1 AOFORGE_SKIP_GH_GATE_REASON="gh setup workflow"');
    const create = r.stdout.indexOf(PR_CREATE);
    const start = r.stdout.indexOf('aof-tools gh pr start <objective>');
    assert.ok(escape > 0 && create > escape && start > create, `${escape} < ${create} < ${start}\n${r.stdout}`);
    assert.deepEqual(fake.writes(), []);
    assert.equal(exists('.github'), false);
  });

  test('61-06 test 14. --raw on a dry run carries the pins on the workflow action', () => {
    install();
    project();
    const r = run([], true);
    assert.equal(exitOf(r), 0);
    const workflow = json(r).actions.find((a) => a.kind === 'workflow');
    assert.equal(workflow.status, 'create');
    assert.deepEqual(workflow.pins, expectedPins());
    assert.equal(workflow.previous_pins, undefined);
    assert.deepEqual(fake.writes(), []);
  });

  test('4. merge queue unavailable: exit 0, the fact is reported, a second apply is write-free and --refresh tries again', () => {
    install({ mergeQueueAllowed: false });
    project();
    const first = run(['--apply']);
    assert.equal(exitOf(first), 0, first.stdout + first.stderr);
    assert.match(first.stdout, /merge queue unavailable on this plan/);
    assert.ok(!fake.rulesets[0].rules.some((x) => x.type === 'merge_queue'));
    assert.deepEqual(json(run(['--apply'], true)).outcomes.filter((o) => ['created', 'updated', 'failed'].includes(o.status)), []);

    const writes = fake.writes().length;
    const refreshed = run(['--refresh', '--apply']);
    assert.equal(exitOf(refreshed), 0);
    assert.ok(fake.writes().length > writes, '--refresh tried the merge queue again');
    assert.match(refreshed.stdout, /merge queue unavailable on this plan/);
  });

  test('4b. --refresh on a dry-run plans the merge queue again and deletes nothing', () => {
    install({ mergeQueueAllowed: false });
    project();
    run(['--apply']);
    const record = setup.setupRecordPath('o/r');
    assert.ok(fs.existsSync(record));
    const plain = json(run([], true));
    assert.equal(plain.actions.find((a) => a.kind === 'ruleset').status, 'exists');
    const refreshed = json(run(['--refresh'], true));
    assert.equal(refreshed.actions.find((a) => a.kind === 'ruleset').status, 'update', 'the record is ignored');
    assert.ok(fs.existsSync(record), 'a dry-run leaves the record alone');
  });

  test('5. an issue field whose options are rejected is created as text and reported, exit 0', () => {
    install({ fieldOptionsAccepted: false });
    project();
    const r = run(['--apply']);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.match(r.stdout, /field work created as text: single-select options were not accepted/);
  });

  test('6. orgAdmin:false skips types and fields with the note and exits 0; isAdmin:false fails the ruleset and exits 1', () => {
    install({ orgAdmin: false });
    project();
    const org = run(['--apply']);
    assert.equal(exitOf(org), 0, org.stdout + org.stderr);
    assert.match(org.stdout, /\[skipped\] issue-type Objective/);
    assert.match(org.stdout, /needs an organization owner; AOForge uses labels and body metadata/);
    client._resetClient();
    fs.rmSync(root, { recursive: true, force: true });

    client._setNow(() => clock.t);
    client._setSleep((ms) => { clock.t += ms; });
    install({ isAdmin: false });
    project();
    const denied = run(['--apply']);
    assert.equal(exitOf(denied), 1);
    assert.match(denied.stderr, /\[failed\] ruleset aoforge: default branch/);
    assert.match(denied.stderr, /403/);
    assert.equal(fake.labels.length, 6, 'labels were still attempted');
    assert.ok(exists(WORKFLOW), 'local files were still written');
    assert.equal(denied.stdout, '', 'a failing run reports on stderr, as gh pr does');
  });

  test('7. an unmanaged workflow file is a conflict: untouched and exit 1', () => {
    install();
    project({}, { [WORKFLOW]: 'name: mine\non: push\n' });
    const r = run(['--apply']);
    assert.equal(exitOf(r), 1);
    assert.match(r.stderr, /\[conflict\] workflow/);
    assert.equal(fs.readFileSync(path.join(root, WORKFLOW), 'utf-8'), 'name: mine\non: push\n');
    const dry = run([]);
    assert.equal(exitOf(dry), 1, 'a dry-run shows the same conflict as a failing plan');
  });

  test('7b. --require-wiki exits 1 while the wiki is not ready (dry-run or apply) and 0 once it is; without the flag it never does', () => {
    install({ hasWiki: false });
    project();
    assert.equal(exitOf(run([])), 0);
    const dry = run(['--require-wiki']);
    assert.equal(exitOf(dry), 1);
    assert.match(dry.stderr, /wiki/i);
    const applied = run(['--apply', '--require-wiki']);
    assert.equal(exitOf(applied), 1, 'the settings action enabled the wiki, but it has no first page yet');
    client._resetClient();
    fs.rmSync(root, { recursive: true, force: true });

    client._setNow(() => clock.t);
    client._setSleep((ms) => { clock.t += ms; });
    install({ hasWiki: true });
    project();
    assert.equal(exitOf(run(['--apply', '--require-wiki'])), 0);
  });

  test('8. github.enabled false: skipped, exit 0, zero gh calls, and github.store is not required', () => {
    let calls = 0;
    client._setRunGh(() => { calls += 1; throw new Error('gh must not run when github is disabled'); });
    project({ enabled: false });
    for (const args of [[], ['--apply'], ['--refresh', '--require-wiki']]) {
      const r = run(args);
      assert.equal(exitOf(r), 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
      assert.match(r.stdout, /github\.enabled is not true/);
    }
    const raw = json(run(['--apply'], true));
    assert.equal(raw.skipped, true);
    assert.equal(raw.ok, false);
    assert.equal(calls, 0);
    assert.equal(exists('.github'), false);
  });

  test('8b. no github.repo is skipped the same way', () => {
    client._setRunGh(() => { throw new Error('gh must not run without a repo'); });
    project({ repo: '' });
    const r = run(['--apply']);
    assert.equal(exitOf(r), 0);
    assert.match(r.stdout, /github\.repo is not set/);
  });

  test('11. an unreadable repository is an error, exit 1', () => {
    install();
    project({ repo: 'o/missing' });
    const r = run(['--apply']);
    assert.equal(exitOf(r), 1);
    assert.match(r.stderr, /o\/missing/);
  });

  test('12. unknown flags and stray arguments are a usage error; --help prints the usage', () => {
    install();
    project();
    const bad = run(['--appply']);
    assert.equal(exitOf(bad), 1);
    assert.match(bad.stderr, /Usage: aof-tools gh setup/);
    assert.equal(exitOf(run(['now'])), 1);
    const help = run(['--help']);
    assert.equal(exitOf(help), 0);
    assert.match(help.stdout, /aof-tools gh setup \[--apply\] \[--refresh\] \[--require-wiki\] \[--raw\]/);
    assert.deepEqual(fake.calls(), [], 'usage and help make no gh call');
  });
});

describe('gh setup dispatch, help and config (tests 9, 10)', () => {
  let hermetic;
  let root;

  beforeEach(() => {
    hermetic = hermeticEnv();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-setup-dispatch-'));
    fs.mkdirSync(path.join(root, '.aoforge'), { recursive: true });
    fs.writeFileSync(path.join(root, '.aoforge', 'config.json'), `${JSON.stringify({ github: { enabled: false } })}\n`);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    hermetic.restore();
  });

  const dfTools = (...args) => {
    const r = spawnSync(process.execPath, [DF_TOOLS, ...args], {
      cwd: root, env: { ...process.env, ...hermetic.env }, encoding: 'utf8', timeout: 60000,
    });
    return { code: r.status, stdout: r.stdout, stderr: r.stderr };
  };

  test('9a. `aof-tools gh nope` lists setup among the available subcommands', () => {
    const r = dfTools('gh', 'nope');
    assert.equal(r.code, 1);
    assert.match(r.stderr, /Unknown gh subcommand\. Available: .*\bsetup\b/);
  });

  test('9b. `aof-tools gh setup` is dispatched to cmdGhSetup (skipped with github off, exit 0, no gh call)', () => {
    for (const args of [['gh', 'setup', '--raw'], ['gh', 'setup', '--apply', '--raw']]) {
      const r = dfTools(...args);
      assert.equal(r.code, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
      const payload = JSON.parse(r.stdout);
      assert.equal(payload.skipped, true);
      assert.equal(payload.ok, false);
    }
    assert.equal(fs.existsSync(path.join(root, '.github')), false);
  });

  test('9c. the gh usage string names setup with its flags and exit codes', () => {
    const { usage } = HELP_COMMANDS.gh;
    assert.ok(usage.includes('setup [--apply] [--refresh] [--require-wiki]'), usage);
    assert.match(usage, /setup is a dry-run unless --apply/);
  });

  test('10. config-get github.app_id and github.checks_workflow return the empty-string defaults', () => {
    for (const key of ['app_id', 'checks_workflow']) {
      assert.deepEqual(configLib.resolveConfigValue({}, `github.${key}`), { found: true, value: '' }, key);
    }
    const r = dfTools('config-get', 'github.app_id');
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(JSON.parse(r.stdout), '');
  });
});
