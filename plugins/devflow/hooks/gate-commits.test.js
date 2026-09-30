'use strict';

/**
 * Tests for gate-commits.js PreToolUse hook
 *
 * TDD suite for TRD 23-02 (gate-commits initialization fix):
 * - Bare .planning/ (no ROADMAP.md, no objectives/, no STATE.md) → pass through
 * - .planning/ROADMAP.md present, STATE.md absent → DENY (bypass fix)
 * - .planning/objectives/ dir present, no ROADMAP.md, no STATE.md → DENY
 * - DevFlow-initialized project + DEVFLOW_ALLOW_RAW_COMMIT=1 → pass through
 * - DevFlow-initialized project + df-tools wrapper command → pass through
 * - DevFlow-initialized project + non-commit command → pass through
 * - tool_name !== "Bash" → pass through
 * - No .planning/ anywhere up the tree → pass through
 *
 * Harness: subprocess spawn with JSON piped to stdin, tmp project dirs hand-built.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'gate-commits.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkTmpProject(setup) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gate-commits-')));
  if (setup) setup(root);
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function runHook(payload, cwd, extraEnv = {}) {
  const env = { ...process.env };
  // TRD 44-03 — a developer's shell exporting DEVFLOW_ALLOW_RAW_COMMIT=1 must
  // never mask a RED: the hook only sees it when a test passes it explicitly.
  delete env.DEVFLOW_ALLOW_RAW_COMMIT;
  Object.assign(env, extraEnv);
  // Remove undefined entries (to actually unset)
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete env[k];
  }
  return spawnSync(process.execPath, [HOOK_PATH], {
    cwd,
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    env,
  });
}

const GIT_COMMIT_PAYLOAD = {
  tool_name: 'Bash',
  tool_input: { command: 'git commit -m "x"' },
};

function isDeny(stdout) {
  if (!stdout || stdout.trim() === '') return false;
  try {
    const parsed = JSON.parse(stdout);
    return parsed.hookSpecificOutput &&
      parsed.hookSpecificOutput.permissionDecision === 'deny';
  } catch {
    return false;
  }
}

function isPassThrough(stdout) {
  return !stdout || stdout.trim() === '';
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe('gate-commits — initialization gating', () => {

  // Case 1: Bare .planning/ — no ROADMAP.md, no objectives/, no STATE.md → pass through
  test('case 1: bare .planning/ (no ROADMAP.md, no objectives/, no STATE.md) → pass through', () => {
    const { root, cleanup } = mkTmpProject(root => {
      fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
    });
    try {
      const result = runHook(GIT_COMMIT_PAYLOAD, root);
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.ok(isPassThrough(result.stdout),
        `expected pass-through (empty stdout), got: ${result.stdout}`);
    } finally {
      cleanup();
    }
  });

  // Case 2: .planning/ROADMAP.md present, STATE.md absent → DENY (this was the bypass bug)
  test('case 2: .planning/ROADMAP.md present, no STATE.md → deny (bypass fix)', () => {
    const { root, cleanup } = mkTmpProject(root => {
      fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), '# Roadmap\n');
    });
    try {
      const result = runHook(GIT_COMMIT_PAYLOAD, root);
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.ok(isDeny(result.stdout),
        `expected deny JSON, got: ${result.stdout || '(empty)'}`);
    } finally {
      cleanup();
    }
  });

  // Case 3: .planning/objectives/ dir present, no ROADMAP.md, no STATE.md → DENY
  test('case 3: .planning/objectives/ dir present, no ROADMAP.md, no STATE.md → deny', () => {
    const { root, cleanup } = mkTmpProject(root => {
      fs.mkdirSync(path.join(root, '.planning', 'objectives'), { recursive: true });
    });
    try {
      const result = runHook(GIT_COMMIT_PAYLOAD, root);
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.ok(isDeny(result.stdout),
        `expected deny JSON, got: ${result.stdout || '(empty)'}`);
    } finally {
      cleanup();
    }
  });

  // Case 4: DevFlow-initialized project + DEVFLOW_ALLOW_RAW_COMMIT=1 → pass through
  test('case 4: DevFlow-initialized project + DEVFLOW_ALLOW_RAW_COMMIT=1 → pass through', () => {
    const { root, cleanup } = mkTmpProject(root => {
      fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), '# Roadmap\n');
      fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), '# State\n');
    });
    try {
      const result = runHook(GIT_COMMIT_PAYLOAD, root, { DEVFLOW_ALLOW_RAW_COMMIT: '1' });
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.ok(isPassThrough(result.stdout),
        `expected pass-through with escape hatch, got: ${result.stdout}`);
    } finally {
      cleanup();
    }
  });

  // Case 5: DevFlow-initialized project + df-tools wrapper command → pass through
  test('case 5: DevFlow-initialized project + df-tools.cjs commit command → pass through', () => {
    const { root, cleanup } = mkTmpProject(root => {
      fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), '# Roadmap\n');
      fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), '# State\n');
    });
    try {
      const payload = {
        tool_name: 'Bash',
        tool_input: { command: 'node ~/.claude/devflow/bin/df-tools.cjs commit "test(23-02): example"' },
      };
      const result = runHook(payload, root);
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.ok(isPassThrough(result.stdout),
        `expected pass-through for df-tools wrapper, got: ${result.stdout}`);
    } finally {
      cleanup();
    }
  });

  // Case 6: DevFlow-initialized project + non-commit command → pass through
  test('case 6: DevFlow-initialized project + git status → pass through', () => {
    const { root, cleanup } = mkTmpProject(root => {
      fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), '# Roadmap\n');
      fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), '# State\n');
    });
    try {
      const payload = {
        tool_name: 'Bash',
        tool_input: { command: 'git status' },
      };
      const result = runHook(payload, root);
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.ok(isPassThrough(result.stdout),
        `expected pass-through for non-commit command, got: ${result.stdout}`);
    } finally {
      cleanup();
    }
  });

  // Case 7: tool_name !== "Bash" → pass through
  test('case 7: tool_name !== "Bash" → pass through', () => {
    const { root, cleanup } = mkTmpProject(root => {
      fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), '# Roadmap\n');
      fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), '# State\n');
    });
    try {
      const payload = {
        tool_name: 'Edit',
        tool_input: { command: 'git commit -m "x"' },
      };
      const result = runHook(payload, root);
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.ok(isPassThrough(result.stdout),
        `expected pass-through for non-Bash tool, got: ${result.stdout}`);
    } finally {
      cleanup();
    }
  });

  // Case 8: No .planning/ anywhere up the tree → pass through
  test('case 8: no .planning/ anywhere up the tree → pass through', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gate-commits-noplan-')));
    try {
      const result = runHook(GIT_COMMIT_PAYLOAD, root);
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.ok(isPassThrough(result.stdout),
        `expected pass-through when no .planning/ exists, got: ${result.stdout}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

});

// ---------------------------------------------------------------------------
// TRD 27-04 — invocation-aware matching (was a substring test)
//
// Regression guard for the Autonomy Blocker Audit (2026-08-18): the gate fired
// on any command whose text merely contained the raw-commit phrase. Reproduced
// live — writing an analysis script that held the phrase as a regex literal was
// refused, and the script had to be rewritten to concatenate the token.
// ---------------------------------------------------------------------------

const { invokesGitCommit, stripHeredocs, stripQuoted } = require('./gate-commits.js');

describe('TRD 27-04 — invokesGitCommit()', () => {
  const GATED = [
    'git commit',
    'git commit -m "msg"',
    'git -C /repo commit -m x',
    'git --no-pager commit',
    'git -c user.name=x commit -m y',
    'ls && git commit -m x',
    'cd /repo; git commit --amend',
  ];
  for (const cmd of GATED) {
    test(`gates a real invocation: ${cmd}`, () => {
      assert.equal(invokesGitCommit(cmd), true);
    });
  }

  const PASSED = [
    'git status',
    'git log --oneline',
    'git commit-tree abc123',
    'node ~/.claude/devflow/bin/df-tools.cjs commit "test: x"',
    'echo "remember to git commit later"',
    "grep -rn 'git commit' plugins/",
  ];
  for (const cmd of PASSED) {
    test(`passes through a mention: ${cmd}`, () => {
      assert.equal(invokesGitCommit(cmd), false);
    });
  }

  test('heredoc body mentioning the phrase is NOT an invocation (the live repro)', () => {
    const cmd = [
      "cat > scan.cjs <<'SCANEOF'",
      "const RULES = [",
      "  ['devflow-commit-gate', /Raw `?git commit`? is blocked/i],",
      "];",
      'SCANEOF',
    ].join('\n');
    assert.equal(invokesGitCommit(cmd), false);
  });

  test('unquoted heredoc body is stripped too', () => {
    const cmd = 'cat > f.sh <<EOF\ngit commit -m nope\nEOF';
    assert.equal(invokesGitCommit(cmd), false);
  });

  test('a real invocation AFTER a heredoc is still gated', () => {
    const cmd = "cat > f.txt <<'EOF'\nsome text\nEOF\ngit commit -m real";
    assert.equal(invokesGitCommit(cmd), true);
  });

  test('stripHeredocs / stripQuoted are exported and pure', () => {
    assert.equal(stripHeredocs("a <<'E'\nbody\nE\nb").includes('body'), false);
    assert.equal(stripQuoted(`echo 'git commit'`).includes('git commit'), false);
    assert.equal(stripQuoted('echo "git commit"').includes('git commit'), false);
  });
});

// ---------------------------------------------------------------------------
// TRD 44-03 (AUT-04) — the commit gate stops blocking what df-tools can't do
// and stops teaching an escape that can't work (44-EVIDENCE §2.1):
//   DF-02(b) 32 cases: merge/rebase completions (`git commit --no-edit`) refused.
//   DF-02(c) 23 cases: the deny text suggested `export DEVFLOW_ALLOW_RAW_COMMIT=1`,
//            which a PreToolUse hook can never see.
//
// Git state is hand-built by __fixtures__/gate-fixtures.js — no real git runs.
// ---------------------------------------------------------------------------

const fx = require('./__fixtures__/gate-fixtures.js');
const gateCommits = require('./gate-commits.js');

function bash(command, cwd) {
  return fx.preToolUsePayload({ tool: 'Bash', command, cwd });
}

function mkRoot(prefix = 'gate-commits-44-') {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

/** Initialized DevFlow project with a hand-made .git in `state`. */
function mkRepo(state = 'none') {
  return mkTmpProject(root => {
    fx.makeDevflowProject(root);
    fx.makeGitDir(root, { state });
  });
}

function assertPass(result, label) {
  assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
  assert.ok(isPassThrough(result.stdout), `${label}: expected pass-through, got: ${result.stdout}`);
}

function assertDeny(result, label) {
  assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
  assert.ok(isDeny(result.stdout), `${label}: expected deny JSON, got: ${result.stdout || '(empty)'}`);
}

// A bare REBASE_HEAD ('rebase-head') is NOT an operation in progress — TRD 44-10.
const OP_STATES = ['merge', 'rebase-merge', 'rebase-apply', 'cherry-pick'];

describe('TRD 44-03 — git operation in progress is allowed (subprocess e2e)', () => {
  for (const state of OP_STATES) {
    test(`test 5: .git has ${fx.GIT_STATE_MARKERS[state].name} → git commit --no-edit allowed`, () => {
      const { root, cleanup } = mkRepo(state);
      try {
        assertPass(runHook(bash('git commit --no-edit', root), root), state);
      } finally {
        cleanup();
      }
    });
  }

  // TRD 44-10 (44-VERIFICATION gap, AUT-04): git leaves REBASE_HEAD behind after
  // a rebase finishes. Counting it made a stale marker a standing bypass of the
  // gate (the main checkout had one from 2026-09-26 with no rebase running).
  test('stale REBASE_HEAD (no rebase-merge/, no rebase-apply/) → raw git commit denied', () => {
    const { root, cleanup } = mkRepo('rebase-head');
    try {
      assertDeny(runHook(bash('git commit -m "x"', root), root), 'stale REBASE_HEAD, -m');
      assertDeny(runHook(bash('git commit --no-edit', root), root), 'stale REBASE_HEAD, --no-edit');
    } finally {
      cleanup();
    }
  });

  for (const dirState of ['rebase-merge', 'rebase-apply']) {
    test(`REBASE_HEAD together with ${dirState}/ → a real rebase, git commit --no-edit allowed`, () => {
      const { root, cleanup } = mkRepo('rebase-head');
      try {
        fx.applyGitState(path.join(root, '.git'), dirState);
        assertPass(runHook(bash('git commit --no-edit', root), root), `REBASE_HEAD + ${dirState}`);
      } finally {
        cleanup();
      }
    });
  }

  test('stale REBASE_HEAD in a linked worktree\'s git dir → denied', () => {
    const base = mkRoot();
    try {
      const mainRoot = path.join(base, 'main');
      const wtRoot = path.join(base, 'wt');
      fx.makeGitDir(mainRoot, { state: 'none' });
      fx.makeWorktree(mainRoot, wtRoot, 'wt1', { state: 'rebase-head' });
      fx.makeDevflowProject(wtRoot);
      assertDeny(runHook(bash('git commit --no-edit', wtRoot), wtRoot), 'worktree stale REBASE_HEAD');
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test('test 5: resolved from a subdirectory of the repo too', () => {
    const { root, cleanup } = mkRepo('merge');
    try {
      const sub = path.join(root, 'src', 'deep');
      fs.mkdirSync(sub, { recursive: true });
      assertPass(runHook(bash('git commit --no-edit', sub), sub), 'subdir');
    } finally {
      cleanup();
    }
  });

  test('test 5 control: no operation in progress → still denied', () => {
    const { root, cleanup } = mkRepo('none');
    try {
      assertDeny(runHook(bash('git commit --no-edit', root), root), 'none');
    } finally {
      cleanup();
    }
  });

  test('test 6: worktree — MERGE_HEAD in the per-worktree git dir → allowed', () => {
    const base = mkRoot();
    try {
      const mainRoot = path.join(base, 'main');
      const wtRoot = path.join(base, 'wt');
      fx.makeGitDir(mainRoot, { state: 'none' });
      fx.makeWorktree(mainRoot, wtRoot, 'wt1', { state: 'merge' });
      fx.makeDevflowProject(wtRoot);
      assertPass(runHook(bash('git commit --no-edit', wtRoot), wtRoot), 'worktree merge');
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test('test 6: worktree — a relative `gitdir:` resolves against the .git file\'s dir', () => {
    const base = mkRoot();
    try {
      const mainRoot = path.join(base, 'main');
      const wtRoot = path.join(base, 'wt');
      fx.makeGitDir(mainRoot, { state: 'none' });
      fx.makeWorktree(mainRoot, wtRoot, 'wt1', { state: 'rebase-merge', relative: true });
      fx.makeDevflowProject(wtRoot);
      assert.ok(!path.isAbsolute(fs.readFileSync(path.join(wtRoot, '.git'), 'utf8').replace(/^gitdir:\s*/, '').trim()));
      assertPass(runHook(bash('git commit --no-edit', wtRoot), wtRoot), 'relative gitdir');
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test('test 6: worktree — MERGE_HEAD only in the MAIN .git → denied', () => {
    const base = mkRoot();
    try {
      const mainRoot = path.join(base, 'main');
      const wtRoot = path.join(base, 'wt');
      fx.makeGitDir(mainRoot, { state: 'merge' });
      fx.makeWorktree(mainRoot, wtRoot, 'wt1', { state: 'none' });
      fx.makeDevflowProject(wtRoot);
      assertDeny(runHook(bash('git commit --no-edit', wtRoot), wtRoot), 'main-only merge');
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test('test 7: `git -C <otherRepo> commit`, otherRepo merging, cwd not → allowed', () => {
    const cwdRepo = mkRepo('none');
    const other = mkRepo('merge');
    try {
      assertPass(runHook(bash(`git -C ${other.root} commit -m x`, cwdRepo.root), cwdRepo.root), '-C merging');
    } finally {
      cwdRepo.cleanup();
      other.cleanup();
    }
  });

  test('test 7: reverse — cwd merging, `-C` target not → denied', () => {
    const cwdRepo = mkRepo('merge');
    const other = mkRepo('none');
    try {
      assertDeny(runHook(bash(`git -C ${other.root} commit -m x`, cwdRepo.root), cwdRepo.root), '-C not merging');
    } finally {
      cwdRepo.cleanup();
      other.cleanup();
    }
  });

  test('test 7: a relative `-C` resolves against cwd', () => {
    const base = mkRoot();
    try {
      const here = path.join(base, 'here');
      const there = path.join(base, 'there');
      fx.makeDevflowProject(here);
      fx.makeGitDir(here, { state: 'none' });
      fx.makeGitDir(there, { state: 'cherry-pick' });
      assertPass(runHook(bash('git -C ../there commit --no-edit', here), here), 'relative -C');
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test('test 7: a `-C` path that does not exist is "no op in progress" → denied (never allow on failure)', () => {
    const { root, cleanup } = mkRepo('merge');
    try {
      const missing = path.join(root, 'does-not-exist');
      assertDeny(runHook(bash(`git -C ${missing} commit --no-edit`, root), root), 'missing -C');
    } finally {
      cleanup();
    }
  });

  test('every commit invocation must target an in-progress operation', () => {
    const cwdRepo = mkRepo('none');
    const other = mkRepo('merge');
    try {
      const cmd = `git -C ${other.root} commit --no-edit && git commit -m sneaky`;
      assertDeny(runHook(bash(cmd, cwdRepo.root), cwdRepo.root), 'mixed targets');
    } finally {
      cwdRepo.cleanup();
      other.cleanup();
    }
  });
});

describe('TRD 44-03 — inline DEVFLOW_ALLOW_RAW_COMMIT=1 prefix (subprocess e2e)', () => {
  const ALLOWED = [
    'DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m "x"',
    'env DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m x',
    'FOO=1 DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m x',
    'DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m a && DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m b',
    'git add -A && DEVFLOW_ALLOW_RAW_COMMIT=1 git commit --no-edit',
  ];
  for (const cmd of ALLOWED) {
    test(`test 8: allowed: ${cmd}`, () => {
      const { root, cleanup } = mkRepo('none');
      try {
        assertPass(runHook(bash(cmd, root), root), cmd);
      } finally {
        cleanup();
      }
    });
  }

  const DENIED = [
    'export DEVFLOW_ALLOW_RAW_COMMIT=1; git commit -m x',
    'export DEVFLOW_ALLOW_RAW_COMMIT=1 && git commit -m x',
    'DEVFLOW_ALLOW_RAW_COMMIT=1; git commit -m x',
    'DEVFLOW_ALLOW_RAW_COMMIT=0 git commit -m x',
    'DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m a && git commit -m b',
    'echo DEVFLOW_ALLOW_RAW_COMMIT=1 && git commit -m x',
    'sudo DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m x',
    'DEVFLOW_ALLOW_RAW_COMMIT=1 DEVFLOW_ALLOW_RAW_COMMIT=0 git commit -m x',
  ];
  for (const cmd of DENIED) {
    test(`test 9: denied: ${cmd}`, () => {
      const { root, cleanup } = mkRepo('none');
      try {
        assertDeny(runHook(bash(cmd, root), root), cmd);
      } finally {
        cleanup();
      }
    });
  }
});

describe('TRD 44-03 — honest deny message (subprocess e2e)', () => {
  test('test 10: names the inline prefix as the ONLY in-command form, mentions merge/rebase, never `export`', () => {
    const { root, cleanup } = mkRepo('none');
    try {
      const result = runHook(bash('git commit -m x', root), root);
      assertDeny(result, 'plain commit');
      const reason = JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
      assert.ok(reason.includes('DEVFLOW_ALLOW_RAW_COMMIT=1 git commit'), reason);
      assert.match(reason, /\bonly\b/);
      assert.match(reason, /merge|rebase/i);
      assert.doesNotMatch(reason, /\bexport\b/);
      assert.equal(reason, gateCommits.DENY_MESSAGE, 'DENY_MESSAGE export is the emitted text');
    } finally {
      cleanup();
    }
  });
});

describe('TRD 44-03 — hook-env escape hatch is unchanged', () => {
  test('test 11: hook env DEVFLOW_ALLOW_RAW_COMMIT=1 still passes through', () => {
    const { root, cleanup } = mkRepo('none');
    try {
      assertPass(runHook(bash('git commit -m x', root), root, { DEVFLOW_ALLOW_RAW_COMMIT: '1' }), 'hook env');
    } finally {
      cleanup();
    }
  });

  test('test 11: runHook scrubs an inherited DEVFLOW_ALLOW_RAW_COMMIT so it cannot mask a RED', () => {
    const { root, cleanup } = mkRepo('none');
    const prev = process.env.DEVFLOW_ALLOW_RAW_COMMIT;
    process.env.DEVFLOW_ALLOW_RAW_COMMIT = '1';
    try {
      assertDeny(runHook(bash('git commit -m x', root), root), 'inherited env');
    } finally {
      if (prev === undefined) delete process.env.DEVFLOW_ALLOW_RAW_COMMIT;
      else process.env.DEVFLOW_ALLOW_RAW_COMMIT = prev;
      cleanup();
    }
  });
});

describe('TRD 44-03 — hasInlineAllowPrefix (unit)', () => {
  // [command, expected] — one row pair per shell operator (recovery note).
  const TABLE = [
    // ;
    ['DEVFLOW_ALLOW_RAW_COMMIT=1; git commit -m x', false],
    ['true; DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m x', true],
    // &&
    ['DEVFLOW_ALLOW_RAW_COMMIT=1 && git commit -m x', false],
    ['true && DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m x', true],
    // ||
    ['DEVFLOW_ALLOW_RAW_COMMIT=1 || git commit -m x', false],
    ['false || DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m x', true],
    // |
    ['echo DEVFLOW_ALLOW_RAW_COMMIT=1 | git commit -F -', false],
    ['echo msg | DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -F -', true],
    // &
    ['DEVFLOW_ALLOW_RAW_COMMIT=1 & git commit -m x', false],
    // newline
    ['DEVFLOW_ALLOW_RAW_COMMIT=1\ngit commit -m x', false],
    ['cd sub\nDEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m x', true],
    // ( subshell / $( )
    ['(DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m x)', true],
    ['DEVFLOW_ALLOW_RAW_COMMIT=1 $(git commit -m x)', false],
    // backslash-newline continuation keeps one simple command
    ['DEVFLOW_ALLOW_RAW_COMMIT=1 \\\n  git commit -m x', true],
    // git global flags between git and commit
    ['DEVFLOW_ALLOW_RAW_COMMIT=1 git -C /repo commit --no-edit', true],
    // not an invocation at all
    ['DEVFLOW_ALLOW_RAW_COMMIT=1 git status', false],
    ['', false],
  ];
  for (const [cmd, expected] of TABLE) {
    test(`${JSON.stringify(cmd)} → ${expected}`, () => {
      assert.equal(gateCommits.hasInlineAllowPrefix(cmd), expected);
    });
  }

  test('test 12: a heredoc body holding a prefixed commit is not an invocation (27-04 preserved)', () => {
    const bodyOnly = "cat > f.sh <<'EOF'\nDEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m x\nEOF";
    assert.equal(invokesGitCommit(bodyOnly), false);
    assert.equal(gateCommits.hasInlineAllowPrefix(bodyOnly), false);

    const bodyThenReal = "cat > f.sh <<'EOF'\nDEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m x\nEOF\ngit commit -m real";
    assert.equal(invokesGitCommit(bodyThenReal), true);
    assert.equal(gateCommits.hasInlineAllowPrefix(bodyThenReal), false);
  });

  test('test 12: quoted text holding the prefix does not count', () => {
    assert.equal(
      gateCommits.hasInlineAllowPrefix('echo "DEVFLOW_ALLOW_RAW_COMMIT=1 git commit" && git commit -m x'),
      false
    );
    assert.equal(
      gateCommits.hasInlineAllowPrefix(`DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m 'a; git commit b'`),
      true
    );
  });
});

describe('TRD 44-03 — resolveGitDir / gitOpInProgress / gitCPath (unit)', () => {
  test('resolveGitDir: a .git directory, found by walking up', () => {
    const root = mkRoot();
    try {
      const gitDir = fx.makeGitDir(root);
      const sub = path.join(root, 'a', 'b');
      fs.mkdirSync(sub, { recursive: true });
      assert.equal(gateCommits.resolveGitDir(root), gitDir);
      assert.equal(gateCommits.resolveGitDir(sub), gitDir);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('resolveGitDir: a worktree .git FILE → the per-worktree git dir (absolute and relative gitdir:)', () => {
    const base = mkRoot();
    try {
      const mainRoot = path.join(base, 'main');
      fx.makeGitDir(mainRoot);
      const abs = fx.makeWorktree(mainRoot, path.join(base, 'wt-abs'), 'abs');
      const rel = fx.makeWorktree(mainRoot, path.join(base, 'wt-rel'), 'rel', { relative: true });
      assert.equal(gateCommits.resolveGitDir(path.join(base, 'wt-abs')), abs);
      assert.equal(gateCommits.resolveGitDir(path.join(base, 'wt-rel')), rel);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test('resolveGitDir: null for a missing path, a repo-less tree, or a malformed .git file', () => {
    const base = mkRoot();
    try {
      assert.equal(gateCommits.resolveGitDir(path.join(base, 'nope')), null);
      assert.equal(gateCommits.resolveGitDir(base), null);
      const bad = path.join(base, 'bad');
      fs.mkdirSync(bad);
      fs.writeFileSync(path.join(bad, '.git'), 'not a gitdir line\n');
      assert.equal(gateCommits.resolveGitDir(bad), null);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test('gitOpInProgress: maps each marker to its operation, else null', () => {
    const expected = {
      merge: 'merge',
      // TRD 44-10: a bare REBASE_HEAD is a leftover, not a rebase in progress.
      'rebase-head': null,
      'rebase-merge': 'rebase',
      'rebase-apply': 'rebase',
      'cherry-pick': 'cherry-pick',
      none: null,
    };
    for (const [state, op] of Object.entries(expected)) {
      const root = mkRoot();
      try {
        const gitDir = fx.makeGitDir(root, { state });
        assert.equal(gateCommits.gitOpInProgress(gitDir), op, state);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
    assert.equal(gateCommits.gitOpInProgress(null), null);
    assert.equal(gateCommits.gitOpInProgress('/definitely/not/a/git/dir'), null);
  });

  test('gitOpInProgress: REBASE_HEAD plus rebase-merge/ or rebase-apply/ → rebase (TRD 44-10)', () => {
    for (const dirState of ['rebase-merge', 'rebase-apply']) {
      const root = mkRoot();
      try {
        const gitDir = fx.makeGitDir(root, { state: 'rebase-head' });
        assert.equal(gateCommits.gitOpInProgress(gitDir), null, `${dirState}: bare REBASE_HEAD first`);
        fx.applyGitState(gitDir, dirState);
        assert.equal(gateCommits.gitOpInProgress(gitDir), 'rebase', dirState);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  test('gitCPath: the commit invocation\'s -C operand, resolved against cwd', () => {
    const cwd = '/work/here';
    assert.equal(gateCommits.gitCPath('git commit -m x', cwd), null);
    assert.equal(gateCommits.gitCPath('git -C /repo commit -m x', cwd), '/repo');
    assert.equal(gateCommits.gitCPath('git -C ../there commit', cwd), '/work/there');
    assert.equal(gateCommits.gitCPath('git -C "/path with space" commit', cwd), '/path with space');
    assert.equal(gateCommits.gitCPath('git -C /a status && git -C /b commit', cwd), '/b');
    assert.equal(gateCommits.gitCPath('git -C /a -C b commit', cwd), '/a/b');
  });
});
