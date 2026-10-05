'use strict';

/**
 * exec-context.test.cjs — issue #86.
 *
 * `devflow:executor` carried `isolation: worktree` in its frontmatter. The
 * harness resolved that isolation implicitly, and got both halves wrong:
 *
 *   - the REPO came from the controller session's cwd, not from the directory
 *     the dispatch named. Executing aodex objective 571 from
 *     /Users/markemerson/Source/aodex-w1c, the first spawn landed in
 *     devflow-claude — a different repository. Every path it was given pointed
 *     somewhere it could not see, silently.
 *   - the BASE was the default branch, not the parent's HEAD. Wave 2 of a
 *     sequential objective therefore started from `main` and could not see
 *     wave 1's commits.
 *
 * The replacement is explicit: the orchestrator states the repo and the base,
 * and `df-tools exec-context` proves both before any work happens — loudly,
 * with a non-zero exit, rather than silently.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawnSync } = require('child_process');

const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');

function run(argv, cwd, env) {
  const r = spawnSync(process.execPath, [TOOLS_PATH, ...argv], {
    cwd,
    encoding: 'utf-8',
    env: env ? { ...process.env, ...env } : process.env,
  });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function git(dir, cmd) {
  return execSync(`git ${cmd}`, { cwd: dir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

// ── Fixture generators ───────────────────────────────────────────────────────
// Hand-built, not sampled: each repo has a named default branch and a feature
// branch carrying one commit that exists ONLY on the feature branch. That one
// commit is the whole point — it stands in for "wave 1's output", and a spawn
// based on the default branch cannot see it.

let tmpRoots = [];

function makeRepo(name, { defaultBranch = 'main' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `df-exec-${name}-`));
  tmpRoots.push(dir);
  git(dir, 'init -q .');
  git(dir, `symbolic-ref HEAD refs/heads/${defaultBranch}`);
  git(dir, 'config user.email "test@test.com"');
  git(dir, 'config user.name "Test User"');
  git(dir, 'config commit.gpgsign false');
  fs.writeFileSync(path.join(dir, 'README.md'), `# ${name}\n`);
  git(dir, 'add -A');
  git(dir, 'commit -q -m "chore: init"');
  return dir;
}

/** Branch off, land "wave 1", and return that commit's sha. */
function landWaveOne(repo, branch = 'df/objective-571') {
  git(repo, `checkout -q -b ${branch}`);
  fs.writeFileSync(path.join(repo, 'wave1.txt'), 'wave 1 output\n');
  git(repo, 'add -A');
  git(repo, 'commit -q -m "feat(571-01): wave 1"');
  return git(repo, 'rev-parse HEAD');
}

/**
 * Provision a worktree for `id` through the REAL `exec-context worktree` command
 * (59-03): the guard under test keys on the branch that command creates, so a
 * hand-built `git worktree add` would only test the fixture. Returns the parsed
 * JSON and registers the worktree for cleanup.
 */
function provisionWorktree(repo, id, base) {
  const argv = ['exec-context', 'worktree', '--repo', repo, '--id', id];
  if (base) argv.push('--base', base);
  const r = run(argv, repo);
  assert.strictEqual(r.status, 0, `worktree provisioning for ${id} failed; stderr: ${r.stderr}`);
  const json = JSON.parse(r.stdout);
  tmpRoots.push(json.worktree_path);
  return json;
}

function cleanupAll() {
  for (const d of tmpRoots) {
    try { execSync(`git -C "${d}" worktree prune`, { stdio: 'pipe' }); } catch { /* not a repo */ }
    fs.rmSync(d, { recursive: true, force: true });
  }
  tmpRoots = [];
}

describe('exec-context check — repo identity (issue #86)', () => {
  afterEach(cleanupAll);

  test('cwd inside the named repo passes', () => {
    const repo = makeRepo('target');
    const r = run(['exec-context', 'check', '--repo', repo], repo);
    assert.strictEqual(r.status, 0, `expected pass; stderr: ${r.stderr}`);
    const json = JSON.parse(r.stdout);
    assert.strictEqual(json.ok, true);
    assert.strictEqual(fs.realpathSync(json.repo_root), fs.realpathSync(repo));
  });

  test('cwd in a DIFFERENT repo fails loudly and names both repos', () => {
    const target = makeRepo('target');
    const other = makeRepo('other');
    // This is the #86 incident: the dispatch named `target`, the spawn landed in `other`.
    const r = run(['exec-context', 'check', '--repo', target], other);
    assert.strictEqual(r.status, 1, `wrong-repo spawn must exit 1; stdout: ${r.stdout}`);
    const said = r.stdout + r.stderr;
    assert.ok(said.includes(path.basename(target)), `must name the expected repo; got: ${said}`);
    assert.ok(said.includes(path.basename(other)), `must name the repo it is actually in; got: ${said}`);
  });

  test('a linked worktree OF the named repo passes — worktrees are not wrong repos', () => {
    const repo = makeRepo('target');
    const wt = path.join(path.dirname(repo), `${path.basename(repo)}-wt`);
    tmpRoots.push(wt);
    git(repo, `worktree add -q -b side "${wt}"`);
    const r = run(['exec-context', 'check', '--repo', repo], wt);
    assert.strictEqual(r.status, 0, `a worktree of the target must pass; stderr: ${r.stderr}`);
    const json = JSON.parse(r.stdout);
    assert.strictEqual(json.ok, true);
    assert.strictEqual(json.is_worktree, true);
  });

  test('--repo that is not a git repository fails loudly', () => {
    const repo = makeRepo('target');
    const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'df-exec-notrepo-'));
    tmpRoots.push(notRepo);
    const r = run(['exec-context', 'check', '--repo', notRepo], repo);
    assert.strictEqual(r.status, 1);
    assert.match(r.stdout + r.stderr, /not a git repository|does not exist/i);
  });

  test('--repo is required', () => {
    const repo = makeRepo('target');
    const r = run(['exec-context', 'check'], repo);
    assert.strictEqual(r.status, 1);
    assert.match(r.stdout + r.stderr, /--repo/);
  });
});

describe('exec-context check — explicit base (issue #86)', () => {
  afterEach(cleanupAll);

  test('ACCEPTANCE: a sequential wave sees the previous wave\'s commits', () => {
    const repo = makeRepo('target');
    const waveOne = landWaveOne(repo);
    // Wave 2 is dispatched with the base the orchestrator actually means: the
    // branch tip that wave 1 produced.
    const r = run(['exec-context', 'check', '--repo', repo, '--base', waveOne], repo);
    assert.strictEqual(r.status, 0, `wave 2 must see wave 1; stderr: ${r.stderr}`);
    const json = JSON.parse(r.stdout);
    assert.strictEqual(json.ok, true);
    assert.strictEqual(json.base_visible, true);
    assert.strictEqual(json.base_sha, waveOne);
  });

  test('a spawn based on the default branch does NOT see the previous wave — and says so', () => {
    const repo = makeRepo('target');
    const waveOne = landWaveOne(repo);
    // Exactly what forced isolation did: branch from the default branch.
    const starved = path.join(path.dirname(repo), `${path.basename(repo)}-starved`);
    tmpRoots.push(starved);
    git(repo, `worktree add -q -b agent-starved "${starved}" main`);

    const r = run(['exec-context', 'check', '--repo', repo, '--base', waveOne], starved);
    assert.strictEqual(r.status, 1, `a starved spawn must exit 1; stdout: ${r.stdout}`);
    assert.match(r.stdout + r.stderr, /base/i);
    assert.ok((r.stdout + r.stderr).includes(waveOne.slice(0, 7)),
      'the failure must name the base commit that is missing');
  });

  test('--base accepts a ref, not only a sha', () => {
    const repo = makeRepo('target');
    landWaveOne(repo);
    const r = run(['exec-context', 'check', '--repo', repo, '--base', 'df/objective-571'], repo);
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.strictEqual(JSON.parse(r.stdout).base_visible, true);
  });

  test('an unresolvable --base fails loudly rather than being ignored', () => {
    const repo = makeRepo('target');
    const r = run(['exec-context', 'check', '--repo', repo, '--base', 'no-such-ref'], repo);
    assert.strictEqual(r.status, 1);
    assert.match(r.stdout + r.stderr, /no-such-ref/);
  });
});

describe('exec-context worktree — explicit repo and base (issue #86)', () => {
  afterEach(cleanupAll);

  test('ACCEPTANCE: the provisioned worktree contains the previous wave\'s commit', () => {
    const repo = makeRepo('target');
    const waveOne = landWaveOne(repo);
    const r = run(['exec-context', 'worktree', '--repo', repo, '--id', '571-02'], repo);
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const json = JSON.parse(r.stdout);
    tmpRoots.push(json.worktree_path);

    // The base defaults to the repo's CURRENT HEAD — never the default branch.
    assert.strictEqual(json.base_sha, waveOne);
    assert.strictEqual(git(json.worktree_path, 'rev-parse HEAD'), waveOne);
    assert.ok(fs.existsSync(path.join(json.worktree_path, 'wave1.txt')),
      'wave 1 output must be visible in the wave 2 worktree');
  });

  test('the worktree is created in the NAMED repo even when cwd is a different repo', () => {
    const target = makeRepo('target');
    const waveOne = landWaveOne(target);
    const other = makeRepo('other');

    // The #86 incident, inverted: run from the wrong repo, land in the right one.
    const r = run(['exec-context', 'worktree', '--repo', target, '--id', '571-03'], other);
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const json = JSON.parse(r.stdout);
    tmpRoots.push(json.worktree_path);

    assert.strictEqual(git(json.worktree_path, 'rev-parse HEAD'), waveOne);
    const wtCommon = git(json.worktree_path, 'rev-parse --git-common-dir');
    assert.ok(fs.realpathSync(path.resolve(json.worktree_path, wtCommon))
      .startsWith(fs.realpathSync(target)), 'worktree must belong to the named repo');
    // And nothing was created in the repo the command happened to run from.
    assert.strictEqual(git(other, 'worktree list').split('\n').length, 1);
  });

  test('an explicit --base is honoured over the repo HEAD', () => {
    const repo = makeRepo('target');
    const mainSha = git(repo, 'rev-parse main');
    landWaveOne(repo);
    const r = run(['exec-context', 'worktree', '--repo', repo, '--id', '571-04', '--base', 'main'], repo);
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const json = JSON.parse(r.stdout);
    tmpRoots.push(json.worktree_path);
    assert.strictEqual(json.base_sha, mainSha);
  });

  test('a second worktree for the same id fails loudly rather than reusing a stale tree', () => {
    const repo = makeRepo('target');
    landWaveOne(repo);
    const first = run(['exec-context', 'worktree', '--repo', repo, '--id', '571-05'], repo);
    assert.strictEqual(first.status, 0, `stderr: ${first.stderr}`);
    tmpRoots.push(JSON.parse(first.stdout).worktree_path);

    const second = run(['exec-context', 'worktree', '--repo', repo, '--id', '571-05'], repo);
    assert.strictEqual(second.status, 1, `duplicate id must exit 1; stdout: ${second.stdout}`);
    assert.match(second.stdout + second.stderr, /exists/i);
  });

  test('--id is required', () => {
    const repo = makeRepo('target');
    const r = run(['exec-context', 'worktree', '--repo', repo], repo);
    assert.strictEqual(r.status, 1);
    assert.match(r.stdout + r.stderr, /--id/);
  });
});

/**
 * Issue #100 Group B — the guard's own blind spots. Each of these passed the
 * #86 acceptance tests and was still wrong in the scenario #86 exists for.
 */
describe('exec-context — the guard must not certify itself (issue #100)', () => {
  afterEach(cleanupAll);

  test('finding 1: in a linked worktree, `checkout` is where work goes, not `repo_root`', () => {
    const repo = makeRepo('target');
    const wt = path.join(path.dirname(repo), `${path.basename(repo)}-wt`);
    tmpRoots.push(wt);
    git(repo, `worktree add -q -b wave2 "${wt}"`);

    const r = run(['exec-context', 'check', '--repo', repo], wt);
    assert.strictEqual(r.status, 0, r.stderr);
    const json = JSON.parse(r.stdout);

    // `repo_root` is the REPOSITORY's main checkout — for a linked worktree that
    // is the SHARED tree every other wave is using. An executor told to write
    // "absolute from repo_root" writes into it, which is precisely the collision
    // explicit provisioning exists to prevent.
    assert.strictEqual(fs.realpathSync(json.checkout), fs.realpathSync(wt),
      '`checkout` must be the tree this spawn is actually standing in');
    assert.notStrictEqual(fs.realpathSync(json.repo_root), fs.realpathSync(wt),
      'fixture sanity: repo_root and checkout must differ for a linked worktree');
    assert.strictEqual(json.is_worktree, true);
  });

  test('finding 3: a relative --repo is refused — it would compare cwd with itself', () => {
    const target = makeRepo('target');
    const other = makeRepo('other');
    // `--repo .` resolves against the SPAWN's own cwd, so the guard compares the
    // repo it is in with the repo it is in and can never fail. Run from the
    // WRONG repo, which a working guard must reject.
    const r = run(['exec-context', 'check', '--repo', '.'], other);
    assert.strictEqual(r.status, 1,
      `a cwd-relative --repo must be refused, not silently self-certified; stdout: ${r.stdout}`);
    assert.match(r.stdout + r.stderr, /absolute/i,
      'the refusal must say the path has to be absolute');
    // And the absolute form still works from the right repo.
    assert.strictEqual(run(['exec-context', 'check', '--repo', target], target).status, 0);
  });

  test('finding 8: a repository with no commits is not green', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'df-exec-unborn-'));
    tmpRoots.push(empty);
    git(empty, 'init -q .');
    // `git rev-parse HEAD` on an unborn HEAD prints the literal string "HEAD"
    // and exits 128. Taking .stdout without the exit code produced
    // {"ok":true,"branch":"HEAD","head_sha":"HEAD"} — a green check on a repo
    // that cannot hold a commit yet.
    const r = run(['exec-context', 'check', '--repo', empty], empty);
    assert.strictEqual(r.status, 1, `an unborn HEAD must exit 1; stdout: ${r.stdout}`);
    assert.doesNotMatch(r.stdout, /"head_sha": "HEAD"/,
      'the literal string "HEAD" must never be reported as a sha');
    assert.match(r.stdout + r.stderr, /no commits|unborn/i,
      'the message must name the real cause, not blame the base');
  });

  test('finding 8: with --base, an unborn HEAD is not reported as BASE NOT VISIBLE', () => {
    // A repo WITH commits, checked out on an orphan branch: `main` resolves, so
    // the check reaches the ancestry test with head_sha = the literal "HEAD".
    // It then blamed the base — "BASE NOT VISIBLE" — for an unborn checkout.
    const repo = makeRepo('orphan');
    git(repo, 'checkout -q --orphan fresh');
    const r = run(['exec-context', 'check', '--repo', repo, '--base', 'main'], repo);
    assert.strictEqual(r.status, 1);
    assert.doesNotMatch(r.stdout + r.stderr, /BASE NOT VISIBLE/,
      'naming the base is naming the wrong cause when HEAD is unborn');
    assert.match(r.stdout + r.stderr, /no commits|unborn/i,
      'the message must name the unborn HEAD');
  });

  test('finding 2: merge_back targets the checkout the orchestrator is standing in', () => {
    // #86's own scenario: the orchestrator dispatches FROM a linked worktree, on
    // the objective branch. `git -C <mainRoot> merge` would merge the wave into
    // whatever the main checkout happens to have out — usually `main`.
    const repo = makeRepo('target');
    const wt = path.join(path.dirname(repo), `${path.basename(repo)}-orch`);
    tmpRoots.push(wt);
    git(repo, `worktree add -q -b df/objective-571 "${wt}"`);

    const r = run(['exec-context', 'worktree', '--repo', repo, '--id', '571-06'], wt);
    assert.strictEqual(r.status, 0, r.stderr);
    const json = JSON.parse(r.stdout);
    tmpRoots.push(json.worktree_path);

    assert.ok(!json.merge_back.includes(`-C ${repo} merge`),
      `merge_back must not merge into the main checkout's current branch: ${json.merge_back}`);
    assert.match(json.merge_back, new RegExp(`merge --no-ff ${json.branch.replace('/', '\\/')}$`),
      `merge_back must still merge the wave branch: ${json.merge_back}`);
    assert.ok(json.merge_back.includes(fs.realpathSync(wt)) || !json.merge_back.includes(' -C '),
      `merge_back must target the orchestrator's own checkout: ${json.merge_back}`);
  });

  test('finding 2 (adjacent): a bare --base resolves in the orchestrator\'s own checkout', () => {
    // Same root cause as the merge_back defect. `HEAD` resolved in
    // `repo.mainRoot` is the MAIN checkout's HEAD — usually the default branch.
    // Dispatching from a worktree on the objective branch therefore defaulted
    // the base to `main` and starved the wave: #86's own failure, re-created by
    // the replacement's default.
    const repo = makeRepo('target');
    const mainSha = git(repo, 'rev-parse main');
    const wt = path.join(path.dirname(repo), `${path.basename(repo)}-orch2`);
    tmpRoots.push(wt);
    git(repo, `worktree add -q -b df/objective-572 "${wt}"`);
    fs.writeFileSync(path.join(wt, 'wave1.txt'), 'wave 1 output\n');
    git(wt, 'add -A');
    git(wt, 'commit -q -m "feat(572-01): wave 1"');
    const waveOne = git(wt, 'rev-parse HEAD');
    assert.notStrictEqual(waveOne, mainSha, 'fixture sanity');

    const r = run(['exec-context', 'worktree', '--repo', repo, '--id', '572-02'], wt);
    assert.strictEqual(r.status, 0, r.stderr);
    const json = JSON.parse(r.stdout);
    tmpRoots.push(json.worktree_path);
    assert.strictEqual(json.base_sha, waveOne,
      'a bare --base must be the tip the orchestrator is standing on, not main');
    assert.ok(fs.existsSync(path.join(json.worktree_path, 'wave1.txt')),
      'the provisioned worktree must contain the previous wave\'s output');
  });

  test('finding 2: from an unrelated cwd, merge_back still targets the named repo', () => {
    const target = makeRepo('target');
    const other = makeRepo('other');
    const r = run(['exec-context', 'worktree', '--repo', target, '--id', '571-07'], other);
    assert.strictEqual(r.status, 0, r.stderr);
    const json = JSON.parse(r.stdout);
    tmpRoots.push(json.worktree_path);
    assert.ok(json.merge_back.includes(fs.realpathSync(target)),
      `merge_back must fall back to the named repo when cwd is elsewhere: ${json.merge_back}`);
    assert.ok(!json.merge_back.includes(fs.realpathSync(other)),
      `merge_back must never target an unrelated repo: ${json.merge_back}`);
  });
});

/**
 * Issue #98 — after #86 removed forced isolation, parallel executors of one
 * wave must each be provisioned by `exec-context worktree`. If the orchestrator
 * skips that, siblings share ONE checkout and race on ONE git index: commits
 * interleave and land under the wrong TRD. `check --id <plan> --base <sha>`
 * takes an exclusive claim on (checkout, base); a second, different id on the
 * same claim is refused with SHARED INDEX.
 */
describe('exec-context check — shared-index claim (issue #98)', () => {
  let repo;
  let base;

  beforeEach(() => {
    repo = makeRepo('claim');
    base = landWaveOne(repo);
  });
  afterEach(cleanupAll);

  function claimsDir(dir) {
    const common = git(dir, 'rev-parse --git-common-dir');
    return path.join(fs.realpathSync(path.resolve(dir, common)), 'devflow-exec-claims');
  }

  function check(id, b = base, cwd = repo, env) {
    const argv = ['exec-context', 'check', '--repo', repo, '--base', b];
    if (id) argv.push('--id', id);
    return run(argv, cwd, env);
  }

  test('(a) a second plan id on the same checkout and base is refused with SHARED INDEX', () => {
    const first = check('98-01');
    assert.strictEqual(first.status, 0, `first claim must pass; stderr: ${first.stderr}`);

    const second = check('98-02');
    assert.strictEqual(second.status, 1,
      `a parallel sibling sharing this index must exit 1; stdout: ${second.stdout}`);
    const said = second.stderr;
    assert.match(said, /^(?:Error: )?SHARED INDEX —/m, `headline must be SHARED INDEX; got: ${said}`);
    assert.ok(said.includes('98-01'), `must name the other executor's id; got: ${said}`);
    assert.ok(said.includes(fs.realpathSync(repo)), `must name the checkout; got: ${said}`);
    assert.ok(said.includes(base), `must name the base sha; got: ${said}`);
    assert.ok(said.includes('exec-context worktree'), `must give the worktree fix; got: ${said}`);
    assert.ok(said.includes('--id 98-02'), `the fix must be for THIS id; got: ${said}`);
    assert.ok(said.includes('exec-context release'), `must say how to clear a stale claim; got: ${said}`);
  });

  test('(b) the same id re-running check is a retry, not a collision', () => {
    assert.strictEqual(check('98-01').status, 0);
    const again = check('98-01');
    assert.strictEqual(again.status, 0, `retry must pass; stderr: ${again.stderr}`);
    assert.strictEqual(JSON.parse(again.stdout).claim.id, '98-01');
  });

  test('(c) a later sequential wave (different base) in the same checkout passes', () => {
    assert.strictEqual(check('98-01').status, 0);
    fs.writeFileSync(path.join(repo, 'wave2.txt'), 'wave 2 output\n');
    git(repo, 'add -A');
    git(repo, 'commit -q -m "feat(98-01): wave 2 tip"');
    const tip = git(repo, 'rev-parse HEAD');
    const next = check('98-02', tip);
    assert.strictEqual(next.status, 0, `a sequential wave must not collide; stderr: ${next.stderr}`);
    assert.strictEqual(JSON.parse(next.stdout).claim.id, '98-02');
  });

  test('(d) siblings in separately provisioned worktrees with the same base both pass', () => {
    const paths = [];
    for (const id of ['98-01', '98-02']) {
      const w = run(['exec-context', 'worktree', '--repo', repo, '--id', id, '--base', base], repo);
      assert.strictEqual(w.status, 0, `stderr: ${w.stderr}`);
      const wt = JSON.parse(w.stdout).worktree_path;
      tmpRoots.push(wt);
      paths.push([id, wt]);
    }
    for (const [id, wt] of paths) {
      const r = check(id, base, wt);
      assert.strictEqual(r.status, 0, `isolated sibling ${id} must pass; stderr: ${r.stderr}`);
      assert.strictEqual(JSON.parse(r.stdout).claim.id, id);
    }
  });

  test('(h) a claim file created but not yet written is HELD, not treated as dead', () => {
    // Sibling A has won openSync('wx') and not yet written its record. Sibling B
    // must not read the empty file as "unreadable, holder gone" and overwrite it.
    assert.strictEqual(check('98-01').status, 0);
    const [name] = fs.readdirSync(claimsDir(repo));
    fs.writeFileSync(path.join(claimsDir(repo), name), '');
    const r = check('98-02');
    assert.strictEqual(r.status, 1, `a fresh half-written claim must block; stdout: ${r.stdout}`);
    assert.match(r.stderr, /SHARED INDEX/);
  });

  test('(e) an expired claim is replaced', () => {
    assert.strictEqual(check('98-01').status, 0);
    const t0 = Date.now();
    while (Date.now() - t0 < 15) { /* let the 1ms TTL lapse */ }
    const r = check('98-02', base, repo, { DEVFLOW_EXEC_CLAIM_TTL_MS: '1' });
    assert.strictEqual(r.status, 0, `an expired claim must not block; stderr: ${r.stderr}`);
    assert.strictEqual(JSON.parse(r.stdout).claim.id, '98-02');
  });

  test('(f) without --id (or without --base) no claim is taken — back-compat', () => {
    const noId = check(null);
    assert.strictEqual(noId.status, 0, noId.stderr);
    const json = JSON.parse(noId.stdout);
    assert.ok(Object.prototype.hasOwnProperty.call(json, 'claim'), 'result must carry a `claim` key');
    assert.strictEqual(json.claim, null);
    const dir = claimsDir(repo);
    assert.ok(!fs.existsSync(dir) || fs.readdirSync(dir).length === 0,
      'a check without --id must not create a claim');

    const noBase = run(['exec-context', 'check', '--repo', repo, '--id', '98-01'], repo);
    assert.strictEqual(noBase.status, 0, noBase.stderr);
    assert.strictEqual(JSON.parse(noBase.stdout).claim, null);
  });

  test('(g) release clears claims; a non-matching --id leaves them', () => {
    assert.strictEqual(check('98-01').status, 0);

    const miss = run(['exec-context', 'release', '--repo', repo, '--id', '98-99'], repo);
    assert.strictEqual(miss.status, 0, miss.stderr);
    assert.deepStrictEqual(JSON.parse(miss.stdout).released, []);
    assert.strictEqual(check('98-02').status, 1, 'a non-matching release must leave 98-01\'s claim');

    const rel = run(['exec-context', 'release', '--repo', repo], repo);
    assert.strictEqual(rel.status, 0, rel.stderr);
    assert.deepStrictEqual(JSON.parse(rel.stdout).released, ['98-01']);
    const after = check('98-02');
    assert.strictEqual(after.status, 0, `after release a new id must pass; stderr: ${after.stderr}`);
  });
});

/**
 * 59-03 (PLMB-03) — every Bash call an executor makes starts in the SESSION's
 * directory, which for a parallel wave is the main checkout, not the worktree the
 * orchestrator provisioned. A preflight without `--cwd` therefore inspects the
 * main checkout: it takes a stray claim there and, when a sibling got there
 * first, reports a false SHARED INDEX. `check --id X` now refuses
 * (WRONG CHECKOUT) when a worktree was provisioned for X and the check is not
 * running in it, takes no claim, and prints the `--cwd` command to run instead.
 */
describe('exec-context — the preflight runs against the plan\'s own worktree (59-03)', () => {
  let repo;
  let base;

  beforeEach(() => {
    repo = makeRepo('wrongco');
    base = landWaveOne(repo);
  });
  afterEach(cleanupAll);

  function claimsDir(dir) {
    const common = git(dir, 'rev-parse --git-common-dir');
    return path.join(fs.realpathSync(path.resolve(dir, common)), 'devflow-exec-claims');
  }

  function claimFilesFor(checkout) {
    const key = crypto.createHash('sha1').update(fs.realpathSync(checkout)).digest('hex').slice(0, 12);
    const dir = claimsDir(repo);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((n) => n.startsWith(`${key}-`));
  }

  function check(id, { cwd = repo, withBase = true } = {}) {
    const argv = ['exec-context', 'check', '--repo', repo];
    if (withBase) argv.push('--base', base);
    if (id) argv.push('--id', id);
    return run(argv, cwd);
  }

  test('(1) `exec-context worktree` prints the exact --cwd preflight command for that worktree', () => {
    const wt = provisionWorktree(repo, '59-03', base);
    assert.strictEqual(
      wt.preflight,
      `node ~/.claude/devflow/bin/df-tools.cjs --cwd ${wt.worktree_path} exec-context check ` +
      `--repo ${wt.repo_root} --base ${wt.base_sha} --id 59-03`);
    assert.strictEqual(wt.base_sha, base);
  });

  test('(2) a check outside the provisioned worktree fails WRONG CHECKOUT, names the fix, takes no claim', () => {
    const wt = provisionWorktree(repo, '59-03', base);
    const r = check('59-03');
    assert.strictEqual(r.status, 1, `must refuse; stdout: ${r.stdout}`);
    assert.match(r.stderr, /^(?:Error: )?WRONG CHECKOUT —/m, `headline must be WRONG CHECKOUT; got: ${r.stderr}`);
    assert.ok(r.stderr.includes(wt.worktree_path), `must name the worktree; got: ${r.stderr}`);
    assert.ok(r.stderr.includes(`--cwd ${wt.worktree_path} exec-context check`),
      `must print the --cwd re-run command; got: ${r.stderr}`);
    assert.ok(r.stderr.includes(`--repo ${wt.repo_root}`), `the command must carry --repo; got: ${r.stderr}`);
    assert.ok(r.stderr.includes(`--base ${base}`), `the command must carry --base; got: ${r.stderr}`);
    assert.ok(r.stderr.includes('--id 59-03'), `the command must carry --id; got: ${r.stderr}`);
    assert.deepStrictEqual(claimFilesFor(repo), [],
      'the refused check must not leave a claim on the main checkout');
  });

  test('(2b) the printed command omits --base when the check was given none, and it runs', () => {
    const wt = provisionWorktree(repo, '59-03', base);
    const r = check('59-03', { withBase: false });
    assert.strictEqual(r.status, 1, `must refuse; stdout: ${r.stdout}`);
    assert.ok(!/--base/.test(r.stderr.split('\n').filter((l) => l.includes('exec-context check')).join('\n')),
      `the command must not invent a --base; got: ${r.stderr}`);
    // The printed command is runnable: swap the installed-mirror path for this repo's df-tools.
    const line = r.stderr.split('\n').find((l) => l.includes('df-tools.cjs --cwd '));
    assert.ok(line, `must print a runnable df-tools line; got: ${r.stderr}`);
    const argv = line.trim().split('df-tools.cjs ')[1].split(' ');
    const rerun = run(argv, repo);
    assert.strictEqual(rerun.status, 0, `the printed command must pass; stderr: ${rerun.stderr}`);
    assert.strictEqual(JSON.parse(rerun.stdout).checkout, fs.realpathSync(wt.worktree_path));
  });

  test('(3) the same check through the global --cwd flag reports the worktree and claims it', () => {
    const wt = provisionWorktree(repo, '59-03', base);
    const r = run(['--cwd', wt.worktree_path, 'exec-context', 'check', '--repo', repo, '--base', base, '--id', '59-03'], repo);
    assert.strictEqual(r.status, 0, `the --cwd preflight must pass; stderr: ${r.stderr}`);
    const json = JSON.parse(r.stdout);
    assert.strictEqual(json.checkout, fs.realpathSync(wt.worktree_path));
    assert.strictEqual(json.is_worktree, true);
    assert.strictEqual(json.claim.id, '59-03');
    assert.strictEqual(claimFilesFor(wt.worktree_path).length, 1, 'the worktree must hold the claim');
    assert.deepStrictEqual(claimFilesFor(repo), [], 'the main checkout must hold none');
  });

  test('(4) sequential control: with no provisioned worktree the main checkout passes as before', () => {
    const r = check('59-03');
    assert.strictEqual(r.status, 0, `no df/exec-59-03 branch, so nothing to refuse; stderr: ${r.stderr}`);
    const json = JSON.parse(r.stdout);
    assert.strictEqual(json.is_worktree, false);
    assert.strictEqual(json.claim.id, '59-03');
  });

  test('(5) the guard slugifies the id exactly as provisioning does', () => {
    for (const [id, branch] of [['59-03', 'df/exec-59-03'], ['A-1', 'df/exec-a-1'], ['Plan 7', 'df/exec-plan-7']]) {
      const wt = provisionWorktree(repo, id, base);
      assert.strictEqual(wt.branch, branch, 'fixture sanity: the provisioned branch');
      const r = check(id);
      assert.strictEqual(r.status, 1, `${id}: a check outside its worktree must refuse; stdout: ${r.stdout}`);
      assert.match(r.stderr, /WRONG CHECKOUT/, `${id}: ${r.stderr}`);
      assert.ok(r.stderr.includes(`--id ${id}`), `${id}: the command carries the id AS GIVEN; got: ${r.stderr}`);
    }
  });

  test('(6) a sibling\'s worktree does not trip another id\'s check in the main checkout', () => {
    provisionWorktree(repo, '59-04', base);
    const r = check('59-03');
    assert.strictEqual(r.status, 0, `59-04's worktree is not 59-03's; stderr: ${r.stderr}`);
    assert.strictEqual(JSON.parse(r.stdout).claim.id, '59-03');
  });

  test('(6b) checking from inside a sibling\'s worktree is still WRONG CHECKOUT for this id', () => {
    const mine = provisionWorktree(repo, '59-03', base);
    const theirs = provisionWorktree(repo, '59-04', base);
    const r = check('59-03', { cwd: theirs.worktree_path });
    assert.strictEqual(r.status, 1, `must refuse; stdout: ${r.stdout}`);
    assert.ok(r.stderr.includes(`--cwd ${mine.worktree_path} exec-context check`), r.stderr);
    assert.deepStrictEqual(claimFilesFor(theirs.worktree_path), [], 'no stray claim in the sibling\'s tree');
  });

  test('(7) a pruned worktree (directory gone, still listed) does not count as the owner', () => {
    const wt = provisionWorktree(repo, '59-03', base);
    fs.rmSync(wt.worktree_path, { recursive: true, force: true });
    const r = check('59-03');
    assert.strictEqual(r.status, 0, `a vanished worktree owns nothing; stderr: ${r.stderr}`);
    assert.strictEqual(JSON.parse(r.stdout).claim.id, '59-03');
  });
});
