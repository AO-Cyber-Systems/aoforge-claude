'use strict';

/**
 * executor-isolation.test.cjs — issue #86, the prose half.
 *
 * The defect lived in one frontmatter line (`isolation: worktree` in
 * agents/executor.md) and in orchestrator prose that told the executor nothing
 * about which repository or which commit it was supposed to be standing on.
 * Fixing the tool without fixing the wiring would leave `df-tools exec-context`
 * as a command nobody runs — so these are mechanical checks on the prose, of
 * the same kind as agent-tools.test.cjs.
 *
 * Every executor in the UI Oracle Loop programme had to be dispatched as a
 * plain general-purpose subagent to work around the forced isolation. These
 * assertions are what "the workaround is no longer needed" looks like.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PLUGIN = path.join(__dirname, '..', '..', '..');
const EXECUTOR = path.join(PLUGIN, 'agents', 'executor.md');
const EXECUTE_OBJECTIVE = path.join(PLUGIN, 'devflow', 'workflows', 'execute-objective.md');
const QUICK = path.join(PLUGIN, 'devflow', 'workflows', 'quick.md');

function read(p) { return fs.readFileSync(p, 'utf8'); }
function frontmatter(p) { return read(p).split('---')[1] || ''; }

describe('executor isolation wiring (issue #86)', () => {
  test('executor.md does not force platform worktree isolation', () => {
    const fm = frontmatter(EXECUTOR);
    assert.ok(!/^isolation:/m.test(fm),
      'executor.md frontmatter still declares `isolation:` — the harness then resolves ' +
      'the repo from the controller session and the base from the default branch, which ' +
      'is exactly issue #86. Isolation must be provisioned explicitly by the orchestrator ' +
      '(`df-tools exec-context worktree`) instead.');
  });

  test('executor.md runs the repo/base preflight before doing any work', () => {
    const body = read(EXECUTOR);
    // 59-03: the command may carry the global `--cwd <dir>` ahead of the subcommand.
    assert.match(body, /df-tools\.cjs (?:--cwd \S+ )?exec-context check --repo/,
      'executor.md must run `exec-context check --repo ...` as its first step');
    assert.match(body, /exec-context check[^\n]*--base/,
      'the preflight must assert the base too, not only the repo');
    // The preflight is worthless if the agent is not told to stop on failure.
    assert.match(body, /exit(?:s)? 1|non-zero|STOP/i,
      'executor.md must say to stop when the preflight fails');
  });

  test('the preflight appears before the first commit instruction', () => {
    const body = read(EXECUTOR);
    const preflight = body.indexOf('exec-context check');
    const firstCommit = body.indexOf('df-tools.cjs commit');
    assert.ok(preflight !== -1 && firstCommit !== -1);
    assert.ok(preflight < firstCommit,
      'the repo/base preflight must come before any instruction that writes a commit');
  });

  test('execute-objective.md tells each executor which repo and which base', () => {
    const body = read(EXECUTE_OBJECTIVE);
    assert.match(body, /df-tools\.cjs (?:--cwd \S+ )?exec-context check --repo/,
      'the dispatch must carry the repo/base preflight into the executor prompt');
    assert.match(body, /exec-context worktree --repo/,
      'parallel waves must provision isolation explicitly, in the target repo');
    assert.match(body, /WAVE_BASE|wave base|--base/,
      'the wave base must be stated, not implied');
  });

  test('execute-objective.md no longer claims isolation branches from the default branch', () => {
    const body = read(EXECUTE_OBJECTIVE);
    assert.ok(!/branches from the DEFAULT branch/.test(body),
      'the stale caution about platform worktrees branching from the default branch must ' +
      'be replaced — that behaviour is what #86 removes, and leaving the note tells a ' +
      'reader the defect is still live');
  });

  // ── issue #100 Group B — the guard pointed at the wrong tree ───────────────

  test('#100 finding 1: the executor writes relative to `checkout`, not `repo_root`', () => {
    const body = read(EXECUTOR);
    // `check` reports repo_root = the REPOSITORY's main checkout, and checkout =
    // the tree this spawn is standing in. For a wave provisioned into
    // `.df-worktrees/<repo>/<id>` they are different directories, and repo_root
    // is the SHARED one. Telling the executor "every path you write is absolute
    // from repo_root" sends every parallel wave into the same tree.
    const preflight = body.slice(
      body.indexOf('<step name="repo_base_preflight"'),
      body.indexOf('<step name="load_project_state"'));
    assert.ok(preflight.length > 0, 'fixture sanity: the preflight step must be findable');
    assert.doesNotMatch(preflight, /Note `repo_root` down as a literal absolute path/,
      'executor.md must not tell the executor to write relative to `repo_root` — ' +
      'in a linked worktree that is the shared main checkout');
    assert.match(preflight, /`checkout`/,
      'executor.md must name the `checkout` field the preflight returns');
    assert.match(preflight, /is_worktree|main checkout|shared/i,
      'executor.md must say WHY repo_root is the wrong root in a linked worktree');
  });

  test('#100 finding 3: the no-REPO_ROOT fallback does not self-certify', () => {
    const body = read(EXECUTOR);
    // Running the guard against the spawn's OWN toplevel compares the repo with
    // itself, so it can never fail. A guard that cannot fail is not a guard.
    assert.doesNotMatch(body, /exec-context check --repo \$\(git rev-parse --show-toplevel\)/,
      'the fallback must not run the check against the session\'s own repo root');
    assert.match(body, /unproven|cannot be proven|not proven/i,
      'a dispatch with no REPO_ROOT must be reported as UNPROVEN, not quietly self-certified');
  });

  test('quick.md dispatches its executor with the same repo preflight', () => {
    const body = read(QUICK);
    assert.match(body, /exec-context check --repo/,
      'quick.md spawns the same executor and needs the same guarantee');
  });
});

/**
 * 59-03 (PLMB-03) — every Bash call an executor makes starts in the SESSION's
 * directory, which for a parallel wave is the main checkout. A preflight with no
 * `--cwd` therefore inspected the wrong tree (thirteen SUMMARYs recorded the
 * detour). The dispatch now names a CHECKOUT and the preflight passes it.
 */
describe('executor preflight names its checkout with --cwd (59-03)', () => {
  function executorPreflight() {
    const body = read(EXECUTOR);
    const step = body.slice(
      body.indexOf('<step name="repo_base_preflight"'),
      body.indexOf('<step name="load_project_state"'));
    assert.ok(step.length > 0, 'fixture sanity: the preflight step must be findable');
    return step;
  }

  function dispatchBlock() {
    const body = read(EXECUTE_OBJECTIVE);
    const start = body.indexOf('<repo_and_base>');
    const end = body.indexOf('</repo_and_base>');
    assert.ok(start !== -1 && end > start, 'fixture sanity: the spawn prompt must carry <repo_and_base>');
    return body.slice(start, end);
  }

  /** The runnable command lines: `node ~/.claude/.../df-tools.cjs ... exec-context check ...`. */
  function commandLines(text) {
    return text.split('\n').filter((l) =>
      /^\s*node ~\/\.claude\/devflow\/bin\/df-tools\.cjs\b.*exec-context check\b/.test(l));
  }

  test('9: executor.md runs the check with --cwd <CHECKOUT> and names WRONG CHECKOUT in its failure table', () => {
    const step = executorPreflight();
    assert.match(step,
      /df-tools\.cjs --cwd <CHECKOUT> exec-context check --repo <REPO_ROOT> --base <WAVE_BASE> --id <plan_id>/,
      'the first step must pass --cwd <CHECKOUT> to the preflight');
    assert.match(step, /\|\s*`WRONG CHECKOUT`\s*\|/, 'the failure table needs a WRONG CHECKOUT row');
    assert.match(step, /session's directory/,
      'it must say why: every Bash call starts in the session\'s directory, not in the worktree');
    assert.match(step, /dispatch names no `CHECKOUT`[^\n]*`REPO_ROOT`/,
      'with no CHECKOUT in the dispatch, REPO_ROOT is the checkout');
    assert.match(step, /--cwd <checkout>/, 'every later df-tools call must take --cwd <checkout>');
    assert.match(step, /git -C <checkout>/, 'every git call must take -C <checkout>');
    assert.doesNotMatch(step, /All three are hard stops/,
      'WRONG CHECKOUT is recoverable (nothing was written): only the first three are hard stops');
    assert.match(step, /first three are hard stops/i);
  });

  test('10: execute-objective.md carries CHECKOUT in the dispatch and in step 0', () => {
    const block = dispatchBlock();
    assert.match(block, /^\s*CHECKOUT:\s+\{CHECKOUT\}\s*$/m, '<repo_and_base> must have a CHECKOUT: line');
    assert.match(block,
      /df-tools\.cjs --cwd \{CHECKOUT\} exec-context check --repo \{REPO_ROOT\} --base \{WAVE_BASE\} --id \{plan_id\}/,
      'the spawn prompt\'s preflight must pass --cwd {CHECKOUT}');
    assert.match(block, /WRONG CHECKOUT/, 'the Exit 1 sentence must name the recoverable case');
    assert.match(block, /`--cwd \{CHECKOUT\}`/, 'the prompt must tell the executor to pass --cwd on every df-tools call');
    assert.match(block, /git -C \{CHECKOUT\}/, 'and -C on every git call');

    const body = read(EXECUTE_OBJECTIVE);
    const step0 = body.slice(body.indexOf('**Sequential wave'), body.indexOf('**Describe what'));
    assert.ok(step0.length > 0, 'fixture sanity: step 0 must be findable');
    assert.match(step0, /`worktree_path` as (?:that executor's )?`CHECKOUT`/,
      'a parallel wave\'s CHECKOUT is the provisioned worktree_path');
    assert.match(step0, /`CHECKOUT` is `REPO_ROOT`/, 'a sequential wave\'s CHECKOUT is REPO_ROOT');
    assert.match(step0, /`preflight`/, 'step 0 must say `exec-context worktree` prints a `preflight` command');
    assert.doesNotMatch(step0, /as that executor's working directory/,
      'the Task tool has no working-directory parameter, so that instruction never took effect');
  });

  test('12: neither preflight command line chains, pipes or cd\'s', () => {
    for (const [name, lines] of [
      ['executor.md', commandLines(executorPreflight())],
      ['execute-objective.md', commandLines(dispatchBlock())],
    ]) {
      assert.ok(lines.length >= 1, `${name}: fixture sanity: no preflight command line found`);
      for (const line of lines) {
        assert.doesNotMatch(line, /&&|;|\||\bcd\s|\$\(/,
          `${name}: the preflight must stay ONE plain command (the worktree guard refuses ` +
          `compound commands it cannot verify): ${line.trim()}`);
        assert.match(line, /--cwd (?:<CHECKOUT>|\{CHECKOUT\})/, `${name}: ${line.trim()}`);
        assert.doesNotMatch(line, /--repo \$|show-toplevel/, `${name}: the preflight must not self-certify`);
      }
    }
  });
});
