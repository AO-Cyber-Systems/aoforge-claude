'use strict';

/**
 * TRD 53-04 — the merge sequence AOForge documents must pass gate-commits.
 *
 * gate-commits decides BEFORE a command runs, when MERGE_HEAD does not exist yet,
 * so `git merge X && git commit --no-edit` in one Bash call is (rightly) denied.
 * The fix is prose, not a new allowance: every merge step is its own call, and a
 * completion commit on its own is allowed once the merge has stopped (MERGE_HEAD).
 *
 * This file keeps the prose and the gate from drifting apart:
 *
 *   1. Replay. The commands in execute-objective.md's "Branch merge protocol" are
 *      extracted from the markdown and run, in order, in a real scratch repo. Each
 *      one is fed to gate-commits.js (spawned with cwd = the scratch repo) and must
 *      not be denied; then it is run for real. The clean merge, the planning-file
 *      conflict and the abort paths are all covered.
 *   2. Prose guard. No bash fence in the documenting workflows chains a merge-like
 *      git operation with a git commit. It uses the hook's own chainsGitOpAndCommit,
 *      so the guard and the gate parse alike.
 *
 * TRD 59-06 extends the replay: a conflict on `.planning/state.json` or
 * `.planning/STATE_ARCHIVE.md` is resolved by `aof-tools merge-driver resolve <path>`
 * (run for real, through THIS repository's aof-tools: the home mirror has no
 * `merge-driver` until release), and with the driver installed in the scratch
 * repository those two files never conflict at all.
 *
 * Hand-built fixtures only. Real git, skipped when git is missing. The hook reads
 * process.cwd(), so it is always spawned with cwd = the scratch repo, and
 * AOFORGE_ALLOW_RAW_COMMIT is deleted from its env so an inherited escape cannot
 * mask a deny.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const gate = require('./gate-commits.js');

const HOOK_PATH = path.join(__dirname, 'gate-commits.js');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const REPO_BIN = path.join(__dirname, '..', 'aoforge', 'bin', 'aof-tools.cjs');
const WORKFLOWS = path.join(__dirname, '..', 'aoforge', 'workflows');

const HAVE_GIT = spawnSync('git', ['--version']).status === 0;
const SKIP_GIT = HAVE_GIT ? false : 'git is not installed';

// A conflicted planning path is either taken from the integration branch (regenerated afterwards) or
// merged by `aof-tools merge-driver resolve`. Anything else in the conflict list aborts the merge.
const TAKE_OURS = ['.planning/STATE.md', '.planning/ROADMAP.md', '.planning/REQUIREMENTS.md'];
const RESOLVE = ['.planning/state.json', '.planning/STATE_ARCHIVE.md'];

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------

function gitEnv() {
  const env = { ...process.env };
  delete env.AOFORGE_ALLOW_RAW_COMMIT;
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX']) delete env[k];
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_EDITOR = 'true';
  env.GIT_MERGE_AUTOEDIT = 'no';
  // A merge driver runs through `sh -c` with git's own environment: keep the node running this test on
  // PATH so an installed driver really runs instead of silently degrading to `git merge-file`.
  env.PATH = path.dirname(process.execPath) + path.delimiter + (env.PATH || '');
  return env;
}

// A runnable documented line is plain words (CATEGORIES admits nothing else), so splitting on whitespace and spawning
// with no shell runs the same command `sh -c` would. Anything a shell would interpret fails here instead of running
// differently. (CodeQL js/shell-command-constructed-from-input; same approach as 54-04 Case V1.)
const SAFE_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/;

function argvOf(cmd) {
  const argv = cmd.trim().split(/\s+/);
  const bad = argv.filter((w) => !SAFE_WORD.test(w));
  assert.deepEqual(bad, [], `documented command needs a shell to run: ${cmd}`);
  assert.ok(!argv[0].includes('='), `documented command starts with an env assignment: ${cmd}`);
  return argv;
}

/** Run one command as argv, no shell (one command per call, as the harness does). */
function runArgv(argv, cwd) {
  return spawnSync(argv[0], argv.slice(1), { cwd, env: gitEnv(), encoding: 'utf8' });
}

/** Run git, asserting success. */
function g(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, env: gitEnv(), encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function runHook(command, cwd) {
  const env = { ...process.env };
  delete env.AOFORGE_ALLOW_RAW_COMMIT;
  const r = spawnSync(process.execPath, [HOOK_PATH], {
    cwd,
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd }),
    encoding: 'utf8',
    env,
  });
  assert.equal(r.status, 0, `hook exited non-zero: ${r.stderr}`);
  const out = (r.stdout || '').trim();
  if (!out) return { denied: false, reason: '' };
  const hso = JSON.parse(out).hookSpecificOutput;
  return { denied: hso.permissionDecision === 'deny', reason: hso.permissionDecisionReason || '' };
}

// ---------------------------------------------------------------------------
// Scratch AOForge repo: main and branch df/exec-07-01 diverge from one base
// ---------------------------------------------------------------------------

function writeFiles(root, files) {
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  }
}

/**
 * `branch` and `main` are `{relPath: content}` maps applied on top of a common base
 * that has the AOForge markers (.planning/ROADMAP.md) plus STATE.md and src/a.js.
 * `base` adds to (or overrides) that common base, so a file both sides later change
 * (state.json, STATE_ARCHIVE.md) exists in the base instead of being ADDED by both.
 * Ends checked out on main, clean.
 */
function mkScratch({ base = {}, branch = {}, main = {} } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gate-merge-seq-')));
  g(root, 'init', '-q', '-b', 'main');
  g(root, 'config', 'user.name', 'Fixture');
  g(root, 'config', 'user.email', 'fixture@example.com');
  g(root, 'config', 'commit.gpgsign', 'false');
  writeFiles(root, {
    '.planning/ROADMAP.md': '# Roadmap\nbase\n',
    '.planning/STATE.md': 'state: base\n',
    '.planning/REQUIREMENTS.md': '- [ ] R1\n',
    'src/a.js': 'module.exports = 1;\n',
    ...base,
  });
  g(root, 'add', '-A');
  g(root, 'commit', '-q', '-m', 'base');

  g(root, 'checkout', '-q', '-b', 'df/exec-07-01');
  writeFiles(root, branch);
  g(root, 'add', '-A');
  g(root, 'commit', '-q', '--allow-empty', '-m', 'executor work');

  g(root, 'checkout', '-q', 'main');
  writeFiles(root, main);
  g(root, 'add', '-A');
  g(root, 'commit', '-q', '--allow-empty', '-m', 'main moved on');

  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

/** A state.json holding `decisions`, in the bytes writeStateJson writes (JSON.stringify(x, null, 2), no newline). */
function stateJsonWith(decisions = []) {
  return JSON.stringify(
    {
      current_objective: '07',
      current_job: 0,
      total_jobs: 2,
      progress_pct: 0,
      status: 'Ready to execute',
      last_activity: '2026-10-05',
      metrics: { jobs_completed: 0, jobs_failed: 0, sessions: 0 },
      decisions,
      blockers: [],
      session_log: [],
    },
    null,
    2
  );
}

function decisionOf(summary) {
  return { objective: '07', summary, rationale: null };
}

/** STATE_ARCHIVE.md in the ARCHIVE_SEED shape, with `rows` appended to the metrics table. */
function archiveWith(rows = []) {
  return [
    '# State Archive',
    '',
    'Append-only log. Written by aof-tools `add-decision` and `record-metric`.',
    'STATE.md stays lean; this file grows over time.',
    '',
    '## Decisions',
    '',
    '- *(none yet)*',
    '',
    '## Performance Metrics',
    '',
    '| Objective | Duration | Tasks | Files |',
    '|-----------|----------|-------|-------|',
    ...rows,
    '',
  ].join('\n');
}

/** The same two-sided append the parallel waves make: main and branch each record one decision and one row. */
function bothSidesAppended() {
  return {
    base: { '.planning/state.json': stateJsonWith([]), '.planning/STATE_ARCHIVE.md': archiveWith([]) },
    main: {
      '.planning/state.json': stateJsonWith([decisionOf('decision from main')]),
      '.planning/STATE_ARCHIVE.md': archiveWith(['| Objective 7 P1 | 5min | 2 tasks | 3 files |']),
    },
    branch: {
      'src/a.js': 'module.exports = 2;\n',
      '.planning/state.json': stateJsonWith([decisionOf('decision from branch')]),
      '.planning/STATE_ARCHIVE.md': archiveWith(['| Objective 7 P2 | 7min | 3 tasks | 4 files |']),
    },
  };
}

function readJson(root, rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

// ---------------------------------------------------------------------------
// Markdown extraction
// ---------------------------------------------------------------------------

function readWorkflow(name) {
  return fs.readFileSync(path.join(WORKFLOWS, name), 'utf8');
}

/** Fenced code blocks, in order: `{lang, body, line}` (line = 1-based fence open). */
function fences(text) {
  const out = [];
  let cur = null;
  text.split('\n').forEach((ln, i) => {
    const m = /^\s*```(\S*)\s*$/.exec(ln);
    if (!m) {
      if (cur) cur.lines.push(ln);
      return;
    }
    if (cur) {
      out.push({ lang: cur.lang, body: cur.lines.join('\n'), line: cur.line });
      cur = null;
    } else {
      cur = { lang: m[1], lines: [], line: i + 1 };
    }
  });
  return out;
}

const SHELL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', '']);

/**
 * The text of execute-objective's "Branch merge protocol" section: from that
 * marker up to `<!-- merge-sequence:end -->`, or the next bold paragraph.
 */
function mergeProtocolSection(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.includes('**Branch merge protocol**'));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/<!--\s*merge-sequence:end\s*-->/.test(lines[i]) || /^\s*\*\*[^*\n]+\*\*/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** One command per non-blank, non-comment line of every shell fence in `section`. */
function commandsOf(section) {
  const cmds = [];
  for (const f of fences(section)) {
    if (!SHELL_LANGS.has(f.lang)) continue;
    for (const raw of f.body.split('\n')) {
      const line = raw.trim();
      if (line && !line.startsWith('#')) cmds.push(line);
    }
  }
  return cmds;
}

const CATEGORIES = [
  ['merge', /^git merge --no-ff df\/exec-\S+$/],
  ['list', /^git diff --name-only --diff-filter=U$/],
  ['ours', /^git checkout --ours -- <planning_path>$/],
  ['add', /^git add <planning_path>$/],
  ['resolve', /^node ~\/\.claude\/aoforge\/bin\/aof-tools\.cjs merge-driver resolve <planning_path>$/],
  ['complete', /^git commit --no-edit$/],
  ['abort', /^git merge --abort$/],
  ['aof-tools', /^node ~\/\.claude\/aoforge\/bin\/aof-tools\.cjs /],
];

function classify(cmd) {
  const hit = CATEGORIES.find(([, re]) => re.test(cmd));
  return hit ? hit[0] : null;
}

// ---------------------------------------------------------------------------
// Replay driver
// ---------------------------------------------------------------------------

/**
 * Walk the documented commands through the hook and a real repo. Returns which
 * path the merge took. Every command that runs is first required to pass the hook.
 * `merge-driver resolve` runs for real (through the repo's aof-tools). Every other
 * `aof-tools` command is hook-checked only: the merge is what gate-commits guards,
 * and aof-tools is the sanctioned commit path itself.
 */
function replay(root, documented, planId = '07-01') {
  const cmds = documented.map((c) => c.split('{plan_id}').join(planId));
  const unknown = cmds.filter((c) => classify(c) === null);
  assert.deepEqual(unknown, [], 'the documented merge sequence holds a command this replay does not know');
  const by = (cat) => cmds.filter((c) => classify(c) === cat);

  const step = (cmd, { run = true, argv = null } = {}) => {
    const verdict = runHook(cmd, root);
    assert.equal(verdict.denied, false, `gate-commits denied a documented command: ${cmd}\n${verdict.reason}`);
    return run ? runArgv(argv || argvOf(cmd), root) : null;
  };

  const merges = by('merge');
  assert.equal(merges.length, 1, 'exactly one documented merge command per plan');
  const merged = step(merges[0]);

  let taken = 'clean';
  if (merged.status !== 0) {
    const [list] = by('list');
    assert.ok(list, 'no documented command lists the conflicted paths');
    const conflicted = step(list).stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    assert.ok(conflicted.length > 0, 'the merge failed but git reports no unmerged path');

    if (conflicted.every((p) => TAKE_OURS.includes(p) || RESOLVE.includes(p))) {
      taken = 'planning-conflict';
      const [ours] = by('ours');
      const [add] = by('add');
      const [resolve] = by('resolve');
      const [complete] = by('complete');
      assert.ok(ours, 'no documented `git checkout --ours -- <planning_path>`');
      assert.ok(add, 'no documented `git add <planning_path>`');
      assert.ok(complete, 'no documented `git commit --no-edit` completion');
      for (const p of conflicted) {
        if (TAKE_OURS.includes(p)) {
          step(ours.split('<planning_path>').join(p));
          step(add.split('<planning_path>').join(p));
          continue;
        }
        assert.ok(resolve, `no documented \`node ~/.claude/aoforge/bin/aof-tools.cjs merge-driver resolve <planning_path>\` for ${p}`);
        // The hook sees the documented line; the run goes through this repository's aof-tools, because the
        // home mirror has no `merge-driver` until release. `resolve` stages the file itself.
        const documentedLine = resolve.split('<planning_path>').join(p);
        const resolved = step(documentedLine, { argv: [process.execPath, REPO_BIN, 'merge-driver', 'resolve', p] });
        assert.equal(resolved.status, 0, `merge-driver resolve ${p} failed: ${resolved.stderr}${resolved.stdout}`);
      }
      const done = step(complete);
      assert.equal(done.status, 0, `git commit --no-edit failed: ${done.stderr}`);
    } else {
      taken = 'abort';
      const [abort] = by('abort');
      assert.ok(abort, 'no documented `git merge --abort`');
      const aborted = step(abort);
      assert.equal(aborted.status, 0, `git merge --abort failed: ${aborted.stderr}`);
    }
  }

  for (const c of by('aof-tools')) step(c, { run: false });
  return taken;
}

function parentsOfHead(root) {
  return g(root, 'rev-list', '--parents', '-n', '1', 'HEAD').split(/\s+/).length - 1;
}

function documentedSequence() {
  const section = mergeProtocolSection(readWorkflow('execute-objective.md'));
  assert.ok(section, 'execute-objective.md has no "**Branch merge protocol**" section');
  return commandsOf(section);
}

// ---------------------------------------------------------------------------
// 1. Replay of the documented execute-objective merge sequence
// ---------------------------------------------------------------------------

describe('TRD 53-04 — execute-objective merge sequence replayed through gate-commits', { skip: SKIP_GIT }, () => {
  test('clean merge: no conflict, one merge commit with two parents', () => {
    const { root, cleanup } = mkScratch({
      branch: { 'src/a.js': 'module.exports = 2;\n' },
      main: { '.planning/STATE.md': 'state: main\n' },
    });
    try {
      assert.equal(replay(root, documentedSequence()), 'clean');
      assert.equal(parentsOfHead(root), 2, '--no-ff leaves a merge commit');
      assert.equal(g(root, 'status', '--porcelain'), '');
      assert.equal(fs.readFileSync(path.join(root, 'src/a.js'), 'utf8'), 'module.exports = 2;\n');
    } finally {
      cleanup();
    }
  });

  test('planning-file conflict (STATE.md): take ours, add, `git commit --no-edit` as its own call; the merge completes', () => {
    const { root, cleanup } = mkScratch({
      branch: { 'src/a.js': 'module.exports = 2;\n', '.planning/STATE.md': 'state: branch\n' },
      main: { '.planning/STATE.md': 'state: main\n' },
    });
    try {
      assert.equal(replay(root, documentedSequence()), 'planning-conflict');
      assert.equal(parentsOfHead(root), 2, 'HEAD is a merge commit');
      assert.equal(g(root, 'status', '--porcelain'), '');
      assert.equal(fs.existsSync(path.join(root, '.git', 'MERGE_HEAD')), false);
      assert.equal(fs.readFileSync(path.join(root, '.planning/STATE.md'), 'utf8'), 'state: main\n', 'ours kept');
      assert.equal(fs.readFileSync(path.join(root, 'src/a.js'), 'utf8'), 'module.exports = 2;\n', 'the plan\'s code arrived');
    } finally {
      cleanup();
    }
  });

  test('planning-file conflict on every planning file at once (STATE, ROADMAP, REQUIREMENTS)', () => {
    const { root, cleanup } = mkScratch({
      branch: {
        'src/a.js': 'module.exports = 2;\n',
        '.planning/STATE.md': 'state: branch\n',
        '.planning/ROADMAP.md': '# Roadmap\nbranch\n',
        '.planning/REQUIREMENTS.md': '- [x] R1\n',
      },
      main: {
        '.planning/STATE.md': 'state: main\n',
        '.planning/ROADMAP.md': '# Roadmap\nmain\n',
        '.planning/REQUIREMENTS.md': '- [ ] R1\n- [ ] R2\n',
      },
    });
    try {
      assert.equal(replay(root, documentedSequence()), 'planning-conflict');
      assert.equal(parentsOfHead(root), 2);
      assert.equal(g(root, 'status', '--porcelain'), '');
      assert.equal(fs.readFileSync(path.join(root, '.planning/ROADMAP.md'), 'utf8'), '# Roadmap\nmain\n');
      assert.equal(fs.readFileSync(path.join(root, '.planning/REQUIREMENTS.md'), 'utf8'), '- [ ] R1\n- [ ] R2\n');
    } finally {
      cleanup();
    }
  });

  test('abort path: a conflict on src/a.js is a planning error; `git merge --abort` passes the hook and restores main', () => {
    const { root, cleanup } = mkScratch({
      branch: { 'src/a.js': 'module.exports = "branch";\n' },
      main: { 'src/a.js': 'module.exports = "main";\n' },
    });
    try {
      const before = g(root, 'rev-parse', 'HEAD');
      assert.equal(replay(root, documentedSequence()), 'abort');
      assert.equal(g(root, 'rev-parse', 'HEAD'), before);
      assert.equal(g(root, 'status', '--porcelain'), '');
      assert.equal(fs.existsSync(path.join(root, '.git', 'MERGE_HEAD')), false);
    } finally {
      cleanup();
    }
  });

  test('abort path: a planning file AND a code file in conflict is still a planning error, nothing is resolved', () => {
    const { root, cleanup } = mkScratch({
      branch: { 'src/a.js': 'module.exports = "branch";\n', '.planning/STATE.md': 'state: branch\n' },
      main: { 'src/a.js': 'module.exports = "main";\n', '.planning/STATE.md': 'state: main\n' },
    });
    try {
      const before = g(root, 'rev-parse', 'HEAD');
      assert.equal(replay(root, documentedSequence()), 'abort');
      assert.equal(g(root, 'rev-parse', 'HEAD'), before);
      assert.equal(g(root, 'status', '--porcelain'), '');
    } finally {
      cleanup();
    }
  });

  test('state.json conflict (driver not installed): `merge-driver resolve` merges it, `git commit --no-edit` completes, both decisions survive', () => {
    const { base, main, branch } = bothSidesAppended();
    const { root, cleanup } = mkScratch({
      base: { '.planning/state.json': base['.planning/state.json'] },
      main: { '.planning/state.json': main['.planning/state.json'] },
      branch: { 'src/a.js': branch['src/a.js'], '.planning/state.json': branch['.planning/state.json'] },
    });
    try {
      assert.equal(replay(root, documentedSequence()), 'planning-conflict');
      assert.equal(parentsOfHead(root), 2, 'HEAD is a merge commit');
      assert.equal(g(root, 'status', '--porcelain'), '');
      assert.equal(fs.existsSync(path.join(root, '.git', 'MERGE_HEAD')), false);
      const summaries = readJson(root, '.planning/state.json').decisions.map((d) => d.summary).sort();
      assert.deepEqual(summaries, ['decision from branch', 'decision from main']);
      assert.equal(fs.readFileSync(path.join(root, 'src/a.js'), 'utf8'), 'module.exports = 2;\n', 'the plan\'s code arrived');
    } finally {
      cleanup();
    }
  });

  test('STATE_ARCHIVE.md conflict (driver not installed): resolved by the union strategy, both appended rows present', () => {
    const { base, main, branch } = bothSidesAppended();
    const { root, cleanup } = mkScratch({
      base: { '.planning/STATE_ARCHIVE.md': base['.planning/STATE_ARCHIVE.md'] },
      main: { '.planning/STATE_ARCHIVE.md': main['.planning/STATE_ARCHIVE.md'] },
      branch: { 'src/a.js': branch['src/a.js'], '.planning/STATE_ARCHIVE.md': branch['.planning/STATE_ARCHIVE.md'] },
    });
    try {
      assert.equal(replay(root, documentedSequence()), 'planning-conflict');
      assert.equal(parentsOfHead(root), 2);
      assert.equal(g(root, 'status', '--porcelain'), '');
      const archive = fs.readFileSync(path.join(root, '.planning/STATE_ARCHIVE.md'), 'utf8');
      assert.match(archive, /\| Objective 7 P1 \| 5min \|/);
      assert.match(archive, /\| Objective 7 P2 \| 7min \|/);
      assert.doesNotMatch(archive, /^(<{7}|={7}|>{7})/m, 'no conflict markers left behind');
    } finally {
      cleanup();
    }
  });

  test('STATE.md + state.json + STATE_ARCHIVE.md conflicting together: STATE.md takes ours, the other two resolve, the merge completes', () => {
    const { base, main, branch } = bothSidesAppended();
    const { root, cleanup } = mkScratch({
      base,
      main: { ...main, '.planning/STATE.md': 'state: main\n' },
      branch: { ...branch, '.planning/STATE.md': 'state: branch\n' },
    });
    try {
      assert.equal(replay(root, documentedSequence()), 'planning-conflict');
      assert.equal(parentsOfHead(root), 2);
      assert.equal(g(root, 'status', '--porcelain'), '');
      assert.equal(fs.readFileSync(path.join(root, '.planning/STATE.md'), 'utf8'), 'state: main\n', 'ours kept');
      assert.equal(readJson(root, '.planning/state.json').decisions.length, 2);
      assert.match(fs.readFileSync(path.join(root, '.planning/STATE_ARCHIVE.md'), 'utf8'), /Objective 7 P2/);
    } finally {
      cleanup();
    }
  });

  test('abort path: state.json AND src/a.js in conflict resolves nothing and leaves HEAD unchanged', () => {
    const { root, cleanup } = mkScratch({
      base: { '.planning/state.json': stateJsonWith([]) },
      main: { '.planning/state.json': stateJsonWith([decisionOf('decision from main')]), 'src/a.js': 'module.exports = "main";\n' },
      branch: { '.planning/state.json': stateJsonWith([decisionOf('decision from branch')]), 'src/a.js': 'module.exports = "branch";\n' },
    });
    try {
      const before = g(root, 'rev-parse', 'HEAD');
      assert.equal(replay(root, documentedSequence()), 'abort');
      assert.equal(g(root, 'rev-parse', 'HEAD'), before);
      assert.equal(g(root, 'status', '--porcelain'), '');
      assert.equal(fs.existsSync(path.join(root, '.git', 'MERGE_HEAD')), false);
      assert.deepEqual(readJson(root, '.planning/state.json').decisions.map((d) => d.summary), ['decision from main']);
    } finally {
      cleanup();
    }
  });

  test('driver installed first (`merge-driver install` in the scratch repo): the same appends take the clean path with no conflict', () => {
    const { root, cleanup } = mkScratch(bothSidesAppended());
    try {
      // Never touch this repository's own git configuration: the install runs in the scratch repo only.
      assert.notEqual(root, REPO_ROOT);
      assert.ok(root.startsWith(fs.realpathSync(os.tmpdir())), 'the scratch repo lives under the temp dir');
      const installed = spawnSync(process.execPath, [REPO_BIN, 'merge-driver', 'install'], {
        cwd: root,
        env: gitEnv(),
        encoding: 'utf8',
      });
      assert.equal(installed.status, 0, `merge-driver install failed: ${installed.stderr}${installed.stdout}`);
      assert.match(g(root, 'check-attr', 'merge', '--', '.planning/state.json'), /aoforge-state-json/);
      assert.match(g(root, 'check-attr', 'merge', '--', '.planning/STATE_ARCHIVE.md'), /union/);

      // The install happened after the commits, so the merge below is the first one that can use the driver.
      assert.equal(replay(root, documentedSequence()), 'clean');
      assert.equal(parentsOfHead(root), 2);
      assert.equal(g(root, 'status', '--porcelain'), '');
      const summaries = readJson(root, '.planning/state.json').decisions.map((d) => d.summary).sort();
      assert.deepEqual(summaries, ['decision from branch', 'decision from main']);
      const archive = fs.readFileSync(path.join(root, '.planning/STATE_ARCHIVE.md'), 'utf8');
      assert.match(archive, /Objective 7 P1/);
      assert.match(archive, /Objective 7 P2/);
    } finally {
      cleanup();
    }
  });

  test('the documented order is merge, list, then ours/add or resolve per path, then the completion commit', () => {
    const cmds = documentedSequence();
    const idx = (cat) => cmds.findIndex((c) => classify(c) === cat);
    assert.ok(idx('merge') >= 0, 'merge documented');
    assert.ok(idx('list') > idx('merge'), 'list the conflicted paths after the merge');
    assert.ok(idx('ours') > idx('list'), 'take ours after listing');
    assert.ok(idx('add') > idx('ours'), 'git add after checkout --ours');
    assert.ok(idx('resolve') > idx('list'), '`merge-driver resolve` comes after listing the conflicted paths');
    assert.ok(idx('complete') > idx('resolve'), 'complete after the resolve');
    assert.ok(idx('complete') > idx('add'), 'complete after the add');
    assert.ok(idx('abort') >= 0, 'the abort path stays documented');
    for (const c of cmds) {
      assert.ok(!/&&|;|\|\||\|/.test(c), `one command per call, no chaining: ${c}`);
    }
  });

  test('control: the improvised chained forms stay denied, and the reason names the separate-call form', () => {
    const { root, cleanup } = mkScratch({ main: { '.planning/STATE.md': 'state: main\n' } });
    try {
      const chained = runHook('git merge --no-ff df/exec-07-01 && git commit --no-edit', root);
      assert.equal(chained.denied, true);
      assert.ok(chained.reason.startsWith(gate.DENY_MESSAGE));
      assert.match(chained.reason, /separate/i);

      const oneCall = runHook(
        'git merge df/exec-07-01; git checkout --theirs .planning/STATE.md && git add .planning/STATE.md && git commit --no-edit',
        root
      );
      assert.equal(oneCall.denied, true);

      // Before any merge has stopped there is no MERGE_HEAD, so the completion alone is also refused.
      const early = runHook('git commit --no-edit', root);
      assert.equal(early.denied, true);
      assert.doesNotMatch(early.reason, /separate/i);
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Prose guard
// ---------------------------------------------------------------------------

const PROSE_FILES = ['execute-objective.md', 'complete-milestone.md', 'workstreams-merge.md'];

const SQUASH_RE = /\bgit\s+(?:-\S+\s+)*merge\b[^\n]*--squash\b/;
const MERGE_RE = /\bgit\s+(?:-\S+\s+)*merge\b/;

function shellFences(file) {
  return fences(readWorkflow(file)).filter((f) => SHELL_LANGS.has(f.lang));
}

describe('TRD 53-04 — workflows never document a merge chained with a commit', () => {
  for (const file of PROSE_FILES) {
    test(`${file}: no shell fence runs a merge-like git operation and a git commit together`, () => {
      const bad = [];
      for (const f of shellFences(file)) {
        if (gate.chainsGitOpAndCommit(f.body)) bad.push(`${file}:${f.line}`);
      }
      assert.deepEqual(bad, [], 'a fence chains a merge-like git operation with a git commit, which gate-commits denies');
    });

    test(`${file}: a git commit completing a squash merge carries the inline AOFORGE_ALLOW_RAW_COMMIT=1 prefix`, () => {
      // A squash leaves no MERGE_HEAD (only SQUASH_MSG), so the gate cannot see the merge and a bare
      // `git commit` is denied. A commit after any other merge stops in the stopped merge's MERGE_HEAD
      // and is allowed on its own; a commit with no merge before it at all has nothing to complete.
      const bad = [];
      let lastMerge = null;
      for (const f of shellFences(file)) {
        if (SQUASH_RE.test(f.body)) lastMerge = 'squash';
        else if (MERGE_RE.test(f.body)) lastMerge = 'other';
        if (!gate.invokesGitCommit(f.body)) continue;
        if (gate.hasInlineAllowPrefix(f.body)) continue;
        if (lastMerge === 'other') continue;
        bad.push(`${file}:${f.line} (${lastMerge === 'squash' ? 'bare commit after a squash merge' : 'bare commit with no merge before it'})`);
      }
      assert.deepEqual(bad, []);
    });
  }

  for (const file of ['complete-milestone.md', 'workstreams-merge.md']) {
    test(`${file}: says why a squash completion needs the inline prefix (no MERGE_HEAD)`, () => {
      const text = readWorkflow(file);
      assert.ok(SQUASH_RE.test(text), `${file} documents a squash merge`);
      assert.match(text, /MERGE_HEAD/, 'names the reason: a squash leaves no MERGE_HEAD, so the gate cannot see the merge');
      assert.match(text, /AOFORGE_ALLOW_RAW_COMMIT=1 git commit/);
    });
  }

  test('complete-milestone.md: a no-commit merge is completed by a plain `git commit`, as its own call', () => {
    const fs_ = shellFences('complete-milestone.md');
    const idx = fs_.findIndex((f) => /\bgit\s+merge\b[^\n]*--no-commit\b/.test(f.body));
    assert.ok(idx >= 0, 'the merge-with-history path documents `git merge --no-ff --no-commit`');
    const after = fs_.slice(idx + 1).find((f) => gate.invokesGitCommit(f.body));
    assert.ok(after, 'a git commit completes it');
    assert.equal(gate.hasInlineAllowPrefix(after.body), false, 'no escape prefix: MERGE_HEAD exists after --no-commit');
    assert.equal(gate.chainsGitOpAndCommit(after.body), false);
  });
});
