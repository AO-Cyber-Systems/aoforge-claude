'use strict';

/**
 * TRD 53-04 — the merge sequence DevFlow documents must pass gate-commits.
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
 * Hand-built fixtures only. Real git, skipped when git is missing. The hook reads
 * process.cwd(), so it is always spawned with cwd = the scratch repo, and
 * DEVFLOW_ALLOW_RAW_COMMIT is deleted from its env so an inherited escape cannot
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
const WORKFLOWS = path.join(__dirname, '..', 'devflow', 'workflows');

const HAVE_GIT = spawnSync('git', ['--version']).status === 0;
const SKIP_GIT = HAVE_GIT ? false : 'git is not installed';

const PLANNING_ONLY = ['.planning/STATE.md', '.planning/ROADMAP.md', '.planning/REQUIREMENTS.md'];

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------

function gitEnv() {
  const env = { ...process.env };
  delete env.DEVFLOW_ALLOW_RAW_COMMIT;
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX']) delete env[k];
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_EDITOR = 'true';
  env.GIT_MERGE_AUTOEDIT = 'no';
  return env;
}

/** Run a plain command line the way the harness would (one command per call). */
function sh(cmd, cwd) {
  return spawnSync('sh', ['-c', cmd], { cwd, env: gitEnv(), encoding: 'utf8' });
}

/** Run git, asserting success. */
function g(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, env: gitEnv(), encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function runHook(command, cwd) {
  const env = { ...process.env };
  delete env.DEVFLOW_ALLOW_RAW_COMMIT;
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
// Scratch DevFlow repo: main and branch df/exec-07-01 diverge from one base
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
 * that has the DevFlow markers (.planning/ROADMAP.md) plus STATE.md and src/a.js.
 * Ends checked out on main, clean.
 */
function mkScratch({ branch = {}, main = {} } = {}) {
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
  ['complete', /^git commit --no-edit$/],
  ['abort', /^git merge --abort$/],
  ['df-tools', /^node ~\/\.claude\/devflow\/bin\/df-tools\.cjs /],
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
 * `df-tools` commands are hook-checked only: the merge is what gate-commits guards,
 * and df-tools is the sanctioned commit path itself.
 */
function replay(root, documented, planId = '07-01') {
  const cmds = documented.map((c) => c.split('{plan_id}').join(planId));
  const unknown = cmds.filter((c) => classify(c) === null);
  assert.deepEqual(unknown, [], 'the documented merge sequence holds a command this replay does not know');
  const by = (cat) => cmds.filter((c) => classify(c) === cat);

  const step = (cmd, { run = true } = {}) => {
    const verdict = runHook(cmd, root);
    assert.equal(verdict.denied, false, `gate-commits denied a documented command: ${cmd}\n${verdict.reason}`);
    return run ? sh(cmd, root) : null;
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

    if (conflicted.every((p) => PLANNING_ONLY.includes(p))) {
      taken = 'planning-conflict';
      const [ours] = by('ours');
      const [add] = by('add');
      const [complete] = by('complete');
      assert.ok(ours, 'no documented `git checkout --ours -- <planning_path>`');
      assert.ok(add, 'no documented `git add <planning_path>`');
      assert.ok(complete, 'no documented `git commit --no-edit` completion');
      for (const p of conflicted) {
        step(ours.split('<planning_path>').join(p));
        step(add.split('<planning_path>').join(p));
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

  for (const c of by('df-tools')) step(c, { run: false });
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

  test('the documented order is merge, list, then ours/add per path, then the completion commit', () => {
    const cmds = documentedSequence();
    const idx = (cat) => cmds.findIndex((c) => classify(c) === cat);
    assert.ok(idx('merge') >= 0, 'merge documented');
    assert.ok(idx('list') > idx('merge'), 'list the conflicted paths after the merge');
    assert.ok(idx('ours') > idx('list'), 'take ours after listing');
    assert.ok(idx('add') > idx('ours'), 'git add after checkout --ours');
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

    test(`${file}: a git commit completing a squash merge carries the inline DEVFLOW_ALLOW_RAW_COMMIT=1 prefix`, () => {
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
      assert.match(text, /DEVFLOW_ALLOW_RAW_COMMIT=1 git commit/);
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
