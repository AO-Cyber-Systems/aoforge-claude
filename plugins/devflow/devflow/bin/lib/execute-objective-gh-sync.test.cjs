'use strict';

/**
 * The post-execute GitHub push in workflows/execute-objective.md (TRD 46-10, GSF-03, defect 3).
 *
 * The step used to call `gh sync "${OBJECTIVE_NUMBER}"` behind a `github_issue` grep gate and with
 * `2>/dev/null`, so a failure was invisible and an objective with no issue yet was never pushed.
 * These tests read the step as written, run its bash against a fixture project with the `gh` PATH
 * shim (no real GitHub, no real ~/.claude), and run `df-tools gh sync <dir>` as a real process.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { installGhShim } = require('./__fixtures__/gh-shim.cjs');

const BIN_DIR = path.resolve(__dirname, '..');
const DF_TOOLS = path.join(BIN_DIR, 'df-tools.cjs');
const WORKFLOW = path.resolve(BIN_DIR, '..', 'workflows', 'execute-objective.md');

// ─── Step extraction ─────────────────────────────────────────────────────────

/** The first ```bash fence after the "Auto-push to GitHub" heading in execute-objective.md. */
function extractSyncStep() {
  const text = fs.readFileSync(WORKFLOW, 'utf-8');
  const at = text.indexOf('**Auto-push to GitHub');
  assert.notEqual(at, -1, 'execute-objective.md has no "**Auto-push to GitHub" heading');
  const rest = text.slice(at);
  const m = /```bash\n([\s\S]*?)\n```/.exec(rest);
  assert.ok(m, 'no ```bash fence follows the "Auto-push to GitHub" heading');
  return m[1];
}

// ─── Fixture ─────────────────────────────────────────────────────────────────

const ROADMAP = [
  '# Roadmap',
  '',
  '## Milestones',
  '',
  '- **v1.4 Sync** - Objectives 2-2 (in progress)',
  '',
  '## Objectives',
  '',
  '### Objective 2: a',
  '**Goal:** Build a',
  '',
].join('\n');

const OBJECTIVE_MD = ['---', 'objective: 2', 'milestone: v1.4', '---', '', '# Objective 2: a', ''].join('\n');

/** What a clean first push of objective 02-a asks the gh CLI, answered with success. */
const SUCCESS_TABLE = {
  '--version': { code: 0, stdout: 'gh version 2.60.0 (2026-01-01)\n' },
  'auth status': { code: 0, stdout: "github.com\n  ✓ Logged in to github.com account dev\n  - Token scopes: 'repo'\n" },
  'issue list': { code: 0, stdout: '[]' },
  'label create': { code: 0, stdout: '' },
  'api repos/o/r/milestones': { code: 0, stdout: '{"number":1}' },
  'issue create': { code: 0, stdout: 'https://github.com/o/r/issues/1\n' },
  'api --paginate --slurp repos/o/r/issues/1/comments': { code: 0, stdout: '[[]]' },
  'api repos/o/r/issues/1/comments': { code: 0, stdout: '{"id":5}' },
  'issue view 1': { code: 0, stdout: '{"updatedAt":"2026-09-30T12:00:00Z"}' },
};

const NOT_LOGGED_IN = 'You are not logged into any GitHub hosts. To log in, run: gh auth login\n';

let root;
let shim;

/** `<root>` is a fixture project; `enabled` is the github.enabled value written to config.json. */
function makeProject(enabled) {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'eo-gh-sync-'));
  const planning = path.join(root, '.planning');
  fs.mkdirSync(path.join(planning, 'objectives', '02-a'), { recursive: true });
  fs.writeFileSync(
    path.join(planning, 'config.json'),
    JSON.stringify({ github: { enabled, repo: 'o/r' } }, null, 2) + '\n',
  );
  fs.writeFileSync(path.join(planning, 'ROADMAP.md'), ROADMAP);
  fs.writeFileSync(path.join(planning, 'objectives', '02-a', 'OBJECTIVE.md'), OBJECTIVE_MD);
}

/** The shim's HOME gets `.claude/devflow/bin` -> the repo's bin, so `~/.claude/devflow/bin/df-tools.cjs` resolves. */
function installShim(table) {
  shim = installGhShim({ table });
  const home = shim.env().HOME;
  fs.mkdirSync(path.join(home, '.claude', 'devflow'), { recursive: true });
  fs.symlinkSync(BIN_DIR, path.join(home, '.claude', 'devflow', 'bin'), 'dir');
}

function runStep(extraEnv = {}) {
  return spawnSync('bash', ['-c', extractSyncStep()], {
    cwd: root,
    env: shim.env({ OBJECTIVE_DIR: '02-a', ...extraEnv }),
    encoding: 'utf-8',
  });
}

function runCli(args) {
  return spawnSync(process.execPath, [DF_TOOLS, '--cwd', root, ...args], {
    env: shim.env(),
    encoding: 'utf-8',
  });
}

beforeEach(() => {
  root = undefined;
  shim = undefined;
});

afterEach(() => {
  if (shim) shim.cleanup();
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

// ─── Static checks ───────────────────────────────────────────────────────────

describe('execute-objective.md "Auto-push to GitHub" step (static)', () => {
  it('1. passes the objective directory, not the objective number', () => {
    const block = extractSyncStep();
    assert.ok(block.includes('gh sync "${OBJECTIVE_DIR}"'), `block does not call gh sync "\${OBJECTIVE_DIR}":\n${block}`);
    assert.ok(!block.includes('OBJECTIVE_NUMBER'), 'block still uses OBJECTIVE_NUMBER');
  });

  it('2. does not discard stderr and has no github_issue gate', () => {
    const block = extractSyncStep();
    const syncLines = block.split('\n').filter((l) => l.includes('gh sync'));
    assert.ok(syncLines.length > 0, 'no line of the block runs gh sync');
    for (const line of syncLines) assert.ok(!line.includes('2>/dev/null'), `gh sync line discards stderr: ${line}`);
    assert.ok(!/grep -qE '\^github_issue:'/.test(block), 'block still gates on a github_issue grep');
    assert.ok(!/\|\|\s*true/.test(block), 'block hides failure with || true');
  });

  it('3. prints a WARNING with the captured output and a retry command on failure', () => {
    const block = extractSyncStep();
    assert.match(block, /WARNING/);
    assert.match(block, /SYNC_OUT/, 'block does not capture the command output');
    assert.match(block, /Retry:/);
    assert.match(block, /printf '%s\\n' "\$SYNC_OUT"/, 'block does not print the captured output');
  });
});

// ─── Run the extracted step ──────────────────────────────────────────────────

describe('execute-objective.md "Auto-push to GitHub" step (run against the gh shim)', () => {
  it('4. github.enabled false: exit 0, no WARNING, gh never called', () => {
    makeProject(false);
    installShim({});
    const r = runStep();
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout + r.stderr, /WARNING/);
    assert.deepEqual(shim.readCalls(), []);
  });

  it('5. enabled but not logged in: prints WARNING, the gh output and the retry command; the step still exits 0', () => {
    makeProject(true);
    installShim({
      '--version': SUCCESS_TABLE['--version'],
      'auth status': { code: 1, stderr: NOT_LOGGED_IN },
    });
    const r = runStep();
    assert.equal(r.status, 0, 'a sync failure must not abort completion');
    assert.match(r.stdout, /WARNING: GitHub sync failed for objective 02-a/);
    // The command's own rendering of the auth failure (error + remediation), not gh's raw stderr.
    assert.match(r.stdout, /GitHub CLI is not authenticated/);
    assert.match(r.stdout, /gh auth login/);
    assert.match(r.stdout, /Retry: node ~\/\.claude\/devflow\/bin\/df-tools\.cjs gh sync 02-a/);
  });

  it('6. enabled and authenticated: quiet success, and github_issue is written to OBJECTIVE.md', () => {
    makeProject(true);
    installShim(SUCCESS_TABLE);
    const r = runStep();
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout + r.stderr, /WARNING/, `unexpected output:\n${r.stdout}\n${r.stderr}`);
    const md = fs.readFileSync(path.join(root, '.planning', 'objectives', '02-a', 'OBJECTIVE.md'), 'utf-8');
    assert.match(md, /^github_issue: o\/r#1$/m);
  });

  it('6b. works when OBJECTIVE_DIR is the path init reports (.planning/objectives/02-a)', () => {
    makeProject(true);
    installShim(SUCCESS_TABLE);
    const r = runStep({ OBJECTIVE_DIR: '.planning/objectives/02-a' });
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout + r.stderr, /WARNING/, `unexpected output:\n${r.stdout}\n${r.stderr}`);
    const md = fs.readFileSync(path.join(root, '.planning', 'objectives', '02-a', 'OBJECTIVE.md'), 'utf-8');
    assert.match(md, /^github_issue: o\/r#1$/m);
  });
});

// ─── df-tools gh sync as a real process ──────────────────────────────────────

describe('df-tools gh sync <dir> (real process)', () => {
  it('7. success: exit 0 and the created issue is reported', () => {
    makeProject(true);
    installShim(SUCCESS_TABLE);
    const r = runCli(['gh', 'sync', '02-a']);
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.ok, true);
    assert.equal(out.issue_number, 1);
    assert.equal(out.created, true);
  });

  it('8. failing auth: exit 1 with a JSON error on stderr', () => {
    makeProject(true);
    installShim({
      '--version': SUCCESS_TABLE['--version'],
      'auth status': { code: 1, stderr: NOT_LOGGED_IN },
    });
    const r = runCli(['gh', 'sync', '02-a']);
    assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
    const err = JSON.parse(r.stderr);
    assert.ok(err.error, `stderr JSON has no error field: ${r.stderr}`);
  });

  it('9. disabled: exit 0 with skipped true and no gh calls', () => {
    makeProject(false);
    installShim({});
    const r = runCli(['gh', 'sync', '02-a']);
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.skipped, true);
    assert.deepEqual(shim.readCalls(), []);
  });
});
