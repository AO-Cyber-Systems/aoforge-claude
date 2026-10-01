/**
 * SC1 audit — objective 45, TRD 45-10.
 *
 * Success criterion 1 of the devflow-doctor objective: no DevFlow hook writes a
 * file under a project's `.planning/` per call or per session, except planning
 * artifacts. Claude Code's file watcher attaches every changed in-tree file to
 * the next tool result, and a runtime dotfile that changes per call is pure
 * context cost plus a dirty working tree (quick-25 moved .progress-guard.json,
 * 45-01 moves .awareness-cache.json, this TRD moves the two autonomous markers).
 *
 * This file is the guard that keeps it that way. It is two audits:
 *
 *   BEHAVIORAL (test 10)
 *     Runs every hook registered in hooks/hooks.json, plus plugin.json's
 *     statusLine, against a hand-built autonomous, mid-execution fixture project
 *     (a git repo with no recent commits, a nested flutter/.planning/, a fake HOME
 *     and every store env override). Snapshots every dotfile under every
 *     `.planning/` before and after each run and asserts that new or changed
 *     dotfiles are a subset of ALLOWED_WRITES. Each hook runs its real path: no
 *     DEVFLOW_SKIP_* escape hatch is set. The one hook that is not spawned is
 *     awareness-cache-populate, whose real path forks a detached df-tools scan that
 *     would outlive the test; it is called in-process with a stubbed spawn.
 *
 *   STATIC (tests 11 and 12)
 *     Lexically scans every non-test hooks/*.js and hooks/lib/*.js, blanks
 *     comments, and requires every dotfile-shaped string literal to be classified
 *     in a table with a reason. An unknown literal fails, naming file and line, so
 *     a new runtime dotfile cannot slip in on a code path the behavioral fixture
 *     does not reach. The allowlist is pinned: changing it means editing this file.
 *
 * Nothing here touches the real ~/.claude: HOME, TMPDIR and every store dir point
 * into a per-run temp tree.
 */

'use strict';

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const HOOKS_DIR = __dirname;
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const PLUGIN_VERSION = JSON.parse(
  fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
).version;

// ─── The decisions this file exists to keep reviewed ─────────────────────────

/**
 * Dotfiles a hook (or a skill flow a hook takes part in) MAY create or modify
 * inside a `.planning/`. Exactly three, and test 12 pins the set.
 */
const ALLOWED_WRITES = {
  '.skill-active':
    'skill-run marker: written at skill start and removed at its end (event-driven, once per skill run); gate-edits, auto-continue and route-intent read it',
  '.edit-override':
    'single-turn edit-gate override: route-intent writes it only when the user prompt carries an override phrase; gate-edits consumes and deletes it',
  '.devflow-notices.json':
    'upgrade notice hand-off: upgrade-project writes it only when an upgrade produces a notice, route-results marks it consumed on emission; event-driven, not per-call or per-session churn (documented exception)',
};

/** `.planning`-relative dotfiles a hook only READS (or reads and removes). */
const READ_ONLY = {
  '.route-recommendation':
    'verify-completion reads and unlinks it; no hook writes it any more',
  '.devflow-init-declined':
    'classify-session reads it; the /devflow:init decline flow creates it, not a hook',
  '.awareness-cache.json':
    'awareness-cache-populate only READS it; the detached df-tools scan child writes it (lib/awareness.cjs), and TRD 45-01 moves that write, and this literal, out of the repo',
};

/** Dotfile-shaped literals that are not under `.planning/` at all. */
const NOT_UNDER_PLANNING = {
  '.planning': 'the directory itself: the marker every hook walks up looking for',
  '.git': 'repository metadata, read to find the repo or worktree root',
  '.claude': "the user's ~/.claude config dir",
  '.claude-plugin': 'the plugin manifest directory',
  '.devflow': "the watcher's ~/.devflow pid directory",
  '.devflow-handoff': 'the handoff queue at the PROJECT ROOT, not inside .planning/',
  '.plugin-version': 'runtime-mirror marker under ~/.claude/devflow',
  '.plugin-digest': 'runtime-mirror content digest marker under ~/.claude/devflow (45-03)',
};

/** Bare file-name suffixes, not dotfiles. */
const EXTENSIONS = {
  '.json': 'file-name suffix',
  '.md': 'file-name suffix',
  '.tmp': 'file-name suffix for an atomic-rename temp file, beside its target',
};

const ALLOWLIST = new Set(Object.keys(ALLOWED_WRITES));

// ─── Registered hooks ────────────────────────────────────────────────────────

/** @returns {Array<{script: string, event: string}>} every registered hook script, once. */
function registeredHooks() {
  const out = [];
  const seen = new Set();
  const add = (command, event) => {
    const m = /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/([\w.-]+\.js)/.exec(String(command || ''));
    if (!m || seen.has(m[1])) return;
    seen.add(m[1]);
    out.push({ script: m[1], event });
  };
  const hooksJson = JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, 'hooks.json'), 'utf8'));
  for (const [event, groups] of Object.entries(hooksJson.hooks || {})) {
    for (const group of groups) for (const h of group.hooks || []) add(h.command, event);
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
  );
  if (manifest.statusLine) add(manifest.statusLine.command, 'statusLine');
  return out;
}

// ─── Fixture world ───────────────────────────────────────────────────────────

const OLD_COMMIT_DATE = () => new Date(Date.now() - 20 * 60 * 1000).toISOString();
const PLANNING_DIRS = ['.planning', path.join('flutter', '.planning')];

function planningDirsOf(root) {
  return PLANNING_DIRS.map((rel) => path.join(root, rel));
}

function writeProjectPlanning(dir, { stamped }) {
  fs.mkdirSync(path.join(dir, 'objectives', '45-audit-demo'), { recursive: true });
  const config = { mode: 'autonomous' };
  if (stamped) config.devflow = { version: PLUGIN_VERSION };
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config, null, 2));
  fs.writeFileSync(
    path.join(dir, 'STATE.md'),
    '# DevFlow State\n\n## Current Position\n\nObjective: 45\nStatus: Executing\n'
  );
  fs.writeFileSync(
    path.join(dir, 'objectives', '45-audit-demo', '45-10-TRD.md'),
    '---\nobjective: 45-audit-demo\ntrd: "10"\n---\n\n# TRD 45-10\n'
  );
}

let templateBase = null;

/**
 * One git repo, built once and copied per run: an autonomous, mid-execution
 * project whose only commit is 20 minutes old (so verify-commits sees no recent
 * commits), with a nested flutter/.planning/.
 */
function ensureTemplate() {
  if (templateBase) return templateBase;
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pw-audit-tpl-')));
  const root = path.join(base, 'project');
  fs.mkdirSync(path.join(root, 'flutter'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'x.js'), 'module.exports = 1;\n');
  for (const rel of PLANNING_DIRS) writeProjectPlanning(path.join(root, rel), { stamped: true });

  const date = OLD_COMMIT_DATE();
  const env = {
    PATH: process.env.PATH,
    HOME: base,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  };
  const git = (...args) => execFileSync('git', args, { cwd: root, env, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'audit@test.invalid');
  git('config', 'user.name', 'Audit');
  git('config', 'commit.gpgsign', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'seed');
  templateBase = base;
  return base;
}

/**
 * A fresh copy of the template plus its own fake home. `opts` shapes the state
 * the hook meets: behind (unstamped + a merge in progress, so upgrade-project
 * applies its migrations but never forks a commit child), skillActive,
 * editOverride, routeRecommendation, notices.
 */
function makeWorld(opts = {}) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pw-audit-')));
  fs.cpSync(ensureTemplate(), base, { recursive: true });
  const root = path.join(base, 'project');
  const home = path.join(base, 'home');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(path.join(base, 'tmp'), { recursive: true });

  if (opts.behind) {
    for (const dir of planningDirsOf(root)) writeProjectPlanning(dir, { stamped: false });
    const head = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      env: { PATH: process.env.PATH, HOME: base },
      encoding: 'utf8',
    }).trim();
    fs.writeFileSync(path.join(root, '.git', 'MERGE_HEAD'), `${head}\n`);
  }
  for (const dir of planningDirsOf(root)) {
    if (opts.skillActive) {
      const now = Date.now();
      fs.writeFileSync(
        path.join(dir, '.skill-active'),
        JSON.stringify({
          skill: 'execute-objective',
          started_at: new Date(now).toISOString(),
          expires_at: new Date(now + 8 * 60 * 60 * 1000).toISOString(),
        })
      );
    }
    if (opts.editOverride) {
      fs.writeFileSync(
        path.join(dir, '.edit-override'),
        JSON.stringify({ created_at: new Date().toISOString() })
      );
    }
    if (opts.routeRecommendation) fs.writeFileSync(path.join(dir, '.route-recommendation'), '/devflow:build');
  }
  if (opts.notices) {
    const notices = require(path.join(PLUGIN_ROOT, 'devflow', 'bin', 'lib', 'notices.cjs'));
    for (const rel of ['.', 'flutter']) {
      notices.appendNotice(notices.projectNoticesPath(path.join(root, rel)), {
        source: 'planning-writes-audit',
        level: 'info',
        key: 'audit-seed',
        message: 'seeded by the SC1 audit',
      });
    }
  }
  return { base, root, home };
}

function disposeWorld(world) {
  fs.rmSync(world.base, { recursive: true, force: true });
}

/** A minimal env: nothing inherited, so a developer's DEVFLOW_SKIP_* can never mask a write. */
function hookEnv(world) {
  return {
    PATH: process.env.PATH,
    HOME: world.home,
    TMPDIR: path.join(world.base, 'tmp'),
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    DEVFLOW_HOOK_MARKER_DIR: path.join(world.home, 'hook-markers'),
    DEVFLOW_PROGRESS_GUARD_DIR: path.join(world.home, 'progress-guard'),
    DEVFLOW_AWARENESS_DIR: path.join(world.home, 'awareness'),
    DEVFLOW_AUDIT_LOG_PATH: path.join(world.home, 'audit.log'),
    DEVFLOW_HANDOFF_PID_FILE: path.join(world.home, 'devflow-watch.pid'),
  };
}

// ─── Snapshot / diff ─────────────────────────────────────────────────────────

/**
 * path (relative to root) -> {size, mtimeMs, sha1} for every dotfile that sits
 * anywhere under a `.planning/` directory in the fixture.
 */
function snapshotPlanningDotfiles(root) {
  const snap = new Map();
  const walk = (dir, insidePlanning) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === '.git' || e.name === 'node_modules') continue;
        walk(full, insidePlanning || e.name === '.planning');
      } else if (insidePlanning && e.name.startsWith('.')) {
        const st = fs.lstatSync(full);
        const sha1 = crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex');
        snap.set(path.relative(root, full), { size: st.size, mtimeMs: st.mtimeMs, sha1 });
      }
    }
  };
  walk(root, false);
  return snap;
}

/** Relative paths that are new, or whose size, mtime or content differ. Deletions are not writes. */
function changedDotfiles(before, after) {
  const changed = [];
  for (const [rel, a] of after) {
    const b = before.get(rel);
    if (!b || b.size !== a.size || b.mtimeMs !== a.mtimeMs || b.sha1 !== a.sha1) changed.push(rel);
  }
  return changed.sort();
}

// ─── Payloads, built by hand from the shapes each hook parses ────────────────

function envelope(event, ctx, extra = {}) {
  return {
    session_id: 'audit-session',
    transcript_path: path.join(ctx.world.home, 'transcript.jsonl'),
    cwd: ctx.cwd,
    hook_event_name: event,
    permission_mode: 'default',
    ...extra,
  };
}

const sessionStart = (ctx) => envelope('SessionStart', ctx, { source: 'startup' });

const stop = (extra = {}) => (ctx) =>
  envelope('Stop', ctx, {
    stop_hook_active: false,
    last_assistant_message: 'The change is in.',
    background_tasks: [],
    session_crons: [],
    prompt: 'build the audit fixture',
    tools_used: ['Skill'],
    ...extra,
  });

const subagentStop = (extra = {}) => (ctx) =>
  envelope('SubagentStop', ctx, {
    stop_hook_active: false,
    agent_id: `audit-agent-${path.basename(ctx.cwd)}`,
    agent_type: 'devflow:executor',
    last_assistant_message: 'I stopped early.',
    ...extra,
  });

const prompt = (text) => (ctx) => envelope('UserPromptSubmit', ctx, { prompt: text });

const preTool = (tool, input, extra = {}) => (ctx) =>
  envelope('PreToolUse', ctx, { tool_name: tool, tool_input: input, ...extra });

const postTool = (tool, input, extra = {}) => (ctx) =>
  envelope('PostToolUse', ctx, { tool_name: tool, tool_input: input, tool_response: {}, ...extra });

/** An executor transcript whose first user record names TRD 45-10 (gate-executor-stop reads it). */
function executorStopPayload(ctx) {
  const file = path.join(ctx.world.home, 'agent-transcript.jsonl');
  const text = [
    'Execute plan 45-10 of objective 45-audit-demo.',
    `REPO_ROOT: ${ctx.world.root}`,
    'PLAN_ID: 45-10',
    `node df-tools.cjs exec-context check --repo ${ctx.world.root} --base abc1234 --id 45-10`,
  ].join('\n');
  fs.writeFileSync(file, `${JSON.stringify({ type: 'user', message: { role: 'user', content: text } })}\n`);
  return subagentStop({ agent_transcript_path: file })(ctx);
}

// ─── One entry per registered hook script ────────────────────────────────────
//
// `expect: 'block'` marks a variant that MUST reach its decision branch, so the
// audit cannot pass vacuously on a fixture that never triggers the hook.
// `expectChanged` lists allowlisted dotfiles the variant is known to write: it
// proves the snapshot diff really sees a write, and that the allowlist is used.
// A hook that is registered but missing from this table fails test 10a.

const RUNS = {
  'sync-runtime.js': [
    { label: 'fresh runtime mirror', payload: sessionStart, cwds: ['.'] },
  ],
  'upgrade-project.js': [
    { label: 'fast path (project already stamped)', payload: sessionStart, cwds: ['.'] },
    {
      label: 'apply path (behind; merge in progress so no commit child is forked)',
      world: { behind: true },
      payload: sessionStart,
      cwds: ['.'],
      expectChanged: ['.devflow-notices.json'],
    },
  ],
  'awareness-cache-populate.js': [
    { label: 'no cache, spawn stubbed', inProcess: 'awareness-populate', payload: sessionStart },
  ],
  'classify-session.js': [{ label: 'session start', payload: sessionStart }],
  'verify-completion.js': [
    { label: 'autonomous, mid-execution', payload: stop(), expect: 'block' },
    {
      label: 'route recommendation consumed',
      world: { routeRecommendation: true },
      payload: stop(),
      expect: 'block',
    },
  ],
  'auto-continue.js': [
    {
      label: 'live skill marker, announced next step',
      world: { skillActive: true },
      payload: stop({ last_assistant_message: 'Tests are green.\n\nWriting the predicate.' }),
      expect: 'block',
    },
  ],
  'verify-commits.js': [
    { label: 'autonomous, mid-execution, no recent commits', payload: subagentStop(), expect: 'block' },
  ],
  'gate-executor-stop.js': [
    { label: 'executor stops without a SUMMARY', payload: executorStopPayload, expect: 'block' },
  ],
  'route-intent.js': [
    {
      label: 'override phrase',
      payload: prompt('just edit the file, skip devflow'),
      expectChanged: ['.edit-override'],
    },
    { label: 'intent match', payload: prompt('build a login page for the app') },
    { label: 'plain question', payload: prompt('what does this function do?') },
  ],
  'route-results.js': [
    {
      label: 'pending upgrade notice',
      world: { notices: true },
      payload: prompt('continue'),
      expectChanged: ['.devflow-notices.json'],
    },
  ],
  'gate-commits.js': [
    {
      label: 'raw git commit',
      payload: preTool('Bash', { command: 'git commit -m "wip"' }),
    },
  ],
  'changelog-on-tag.js': [
    {
      label: 'annotated release tag',
      payload: preTool('Bash', { command: 'git tag -a v9.9.9 -m "release"' }),
    },
  ],
  'gate-interactive.js': [
    { label: 'TTY-only command', payload: preTool('Bash', { command: 'npm login' }) },
  ],
  'gate-edits.js': [
    {
      label: 'ambient edit, no marker',
      payload: (ctx) => preTool('Edit', { file_path: path.join(ctx.world.root, 'src', 'x.js') })(ctx),
    },
    {
      label: 'edit override armed and consumed',
      world: { editOverride: true },
      payload: (ctx) => preTool('Edit', { file_path: path.join(ctx.world.root, 'src', 'x.js') })(ctx),
    },
  ],
  'guard-no-progress.js': [
    { label: 'repeated read', payload: preTool('Read', { file_path: '/nonexistent/file' }) },
  ],
  // gh-flush.js (TRD 50-05): store mode only. The audit world is a local-mode project, so both events must be
  // silent here; the hook keeps no state at all, which is what this entry pins.
  'gh-flush.js': [
    {
      label: 'df-tools commit just ran',
      payload: postTool('Bash', { command: 'node ~/.claude/devflow/bin/df-tools.cjs commit "feat(50-05): x" --files a.js' }),
    },
    { label: 'session stop', payload: stop() },
  ],
  'statusline.js': [
    {
      label: 'status render',
      payload: (ctx) => ({
        session_id: 'audit-session',
        model: { display_name: 'Audit' },
        workspace: { current_dir: ctx.cwd },
        context_window: { remaining_percentage: 55 },
      }),
    },
  ],
};

const DEFAULT_CWDS = ['.', 'flutter'];

function decisionOf(stdout) {
  try {
    const out = JSON.parse(stdout);
    if (out.decision) return out.decision;
    const h = out.hookSpecificOutput || {};
    return h.decision || h.permissionDecision || null;
  } catch {
    return null;
  }
}

/** The awareness populate hook, called in-process so its detached child is never forked. */
function runAwarenessInProcess(ctx) {
  const hook = require(path.join(HOOKS_DIR, 'awareness-cache-populate.js'));
  const spawned = [];
  hook._main({
    cwd: ctx.cwd,
    env: hookEnv(ctx.world),
    _spawn: (cmd, args) => {
      spawned.push({ cmd, args });
      return { unref() {} };
    },
  });
  return { status: 0, stdout: '', stderr: '', spawned };
}

function runHookOnce(script, run, cwdRel) {
  const world = makeWorld(run.world);
  try {
    const cwd = cwdRel === '.' ? world.root : path.join(world.root, cwdRel);
    const ctx = { world, cwd };
    const payload = run.payload(ctx);
    const before = snapshotPlanningDotfiles(world.root);

    let result;
    if (run.inProcess === 'awareness-populate') {
      result = runAwarenessInProcess(ctx);
    } else {
      result = spawnSync(process.execPath, [path.join(HOOKS_DIR, script)], {
        cwd,
        input: JSON.stringify(payload),
        env: hookEnv(world),
        encoding: 'utf8',
        timeout: 60000,
      });
    }

    const after = snapshotPlanningDotfiles(world.root);
    return { result, changed: changedDotfiles(before, after) };
  } finally {
    disposeWorld(world);
  }
}

// ─── Test 10: behavioral audit ───────────────────────────────────────────────

describe('SC1 behavioral audit: no hook writes a runtime dotfile into .planning/', () => {
  const hooks = registeredHooks();

  test('10a. every registered hook and the statusLine has an audit entry, and none is stale', () => {
    const registered = hooks.map((h) => h.script).sort();
    const audited = Object.keys(RUNS).sort();
    assert.deepEqual(
      registered.filter((s) => !audited.includes(s)),
      [],
      'registered in hooks.json / plugin.json but not audited: add a RUNS entry for it'
    );
    assert.deepEqual(
      audited.filter((s) => !registered.includes(s)),
      [],
      'audited but no longer registered: remove the RUNS entry'
    );
  });

  before(() => { ensureTemplate(); });

  for (const { script } of hooks) {
    for (const run of RUNS[script] || []) {
      for (const cwdRel of run.cwds || DEFAULT_CWDS) {
        test(`10. ${script} [${run.label}] cwd=${cwdRel === '.' ? 'project root' : cwdRel}`, () => {
          const { result, changed } = runHookOnce(script, run, cwdRel);

          assert.ok(!result.error, `${script} could not run: ${result.error && result.error.message}`);

          // Non-vacuous: variants that promise a decision must actually reach it.
          if (run.expect === 'block') {
            assert.equal(
              decisionOf(result.stdout),
              'block',
              `${script} [${run.label}] did not reach its block branch, so this audit proves nothing for it.\n` +
                `stdout: ${result.stdout}\nstderr: ${result.stderr}`
            );
          }
          if (run.inProcess === 'awareness-populate') {
            assert.equal(result.spawned.length, 1, 'the populate hook should have reached its (stubbed) spawn');
          }

          for (const name of run.expectChanged || []) {
            assert.ok(
              changed.some((rel) => path.basename(rel) === name),
              `${script} [${run.label}] was expected to write ${name} (proving the audit sees writes) but changed: ${JSON.stringify(changed)}`
            );
          }

          const offenders = changed.filter((rel) => !ALLOWLIST.has(path.basename(rel)));
          assert.deepEqual(
            offenders,
            [],
            `hook ${script} [${run.label}, cwd ${cwdRel}] wrote ${offenders.join(', ')} under .planning/. ` +
              `Runtime state belongs in ~/.claude/devflow/state/, not the repo. ` +
              `Allowed dotfiles: ${[...ALLOWLIST].join(', ')}.`
          );
        });
      }
    }
  }
});

// ─── Static scan: dotfile-shaped string literals ─────────────────────────────

const REGEX_PREV = '(,=:[!&|?{};+-*%<>~^';
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'else', 'do']);

/**
 * Lexical scan of a JS source string. Returns every string, template and
 * `${}`-nested string literal as {text, line}, with comments skipped and regex
 * literals stepped over (so a quote inside a regex cannot open a phantom string).
 * A template's `${...}` expressions appear in its text as the placeholder `${}`.
 * Not a parser: it only has to be right about which characters are string
 * contents, and the self-tests below pin the cases that matter here.
 */
function scanLiterals(src) {
  const lits = [];
  let i = 0;
  let line = 1;

  function readQuoted(quote) {
    const startLine = line;
    let text = '';
    i++;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '\\') {
        text += ch + (src[i + 1] || '');
        if (src[i + 1] === '\n') line++;
        i += 2;
        continue;
      }
      if (ch === quote) { i++; break; }
      if (ch === '\n') {
        line++;
        if (quote !== '`') break; // an unterminated ' or " ends at the line
      }
      if (quote === '`' && ch === '$' && src[i + 1] === '{') {
        i += 2;
        text += '${}';
        scanCode(true);
        continue;
      }
      text += ch;
      i++;
    }
    lits.push({ text, line: startLine });
  }

  function skipRegex() {
    i++; // the opening slash
    let inClass = false;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '\n') return; // not a regex after all; bail without consuming the newline
      if (ch === '\\') { i += 2; continue; }
      if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      else if (ch === '/' && !inClass) {
        i++;
        while (i < src.length && /[a-z]/.test(src[i])) i++;
        return;
      }
      i++;
    }
  }

  function scanCode(untilBrace) {
    let depth = 0;
    let prev = '';
    let prevWord = '';
    while (i < src.length) {
      const ch = src[i];
      const nx = src[i + 1];
      if (ch === '\n') { line++; i++; continue; }
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '/' && nx === '/') {
        while (i < src.length && src[i] !== '\n') i++;
        continue;
      }
      if (ch === '/' && nx === '*') {
        i += 2;
        while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
          if (src[i] === '\n') line++;
          i++;
        }
        i += 2;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        readQuoted(ch);
        prev = ch;
        continue;
      }
      if (/[A-Za-z_$]/.test(ch)) {
        let j = i;
        while (j < src.length && /[\w$]/.test(src[j])) j++;
        prevWord = src.slice(i, j);
        prev = 'a';
        i = j;
        continue;
      }
      if (/[0-9]/.test(ch)) {
        while (i < src.length && /[\w.]/.test(src[i])) i++;
        prev = '0';
        continue;
      }
      if (ch === '/' && (prev === '' || REGEX_PREV.includes(prev) || (prev === 'a' && REGEX_KEYWORDS.has(prevWord)))) {
        skipRegex();
        prev = '/';
        continue;
      }
      if (untilBrace) {
        if (ch === '{') depth++;
        else if (ch === '}') {
          if (depth === 0) { i++; return; }
          depth--;
        }
      }
      prev = ch;
      i++;
    }
  }

  scanCode(false);
  return lits;
}

/** Dotfile-shaped tokens in one literal: at the start, or right after a `/`. */
function dotfileTokens(text) {
  const tokens = [];
  const re = /(?:^|\/)(\.[A-Za-z][\w-]*(?:\.[\w-]+)*)/g;
  let m;
  while ((m = re.exec(text)) !== null) tokens.push(m[1]);
  return tokens;
}

function hookSourceFiles() {
  const list = [];
  for (const dir of [HOOKS_DIR, path.join(HOOKS_DIR, 'lib')]) {
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.js') && !name.endsWith('.test.js')) list.push(path.join(dir, name));
    }
  }
  return list.sort();
}

function classify(token) {
  if (Object.hasOwn(ALLOWED_WRITES, token)) return 'allowed-write';
  if (Object.hasOwn(READ_ONLY, token)) return 'read-only';
  if (Object.hasOwn(NOT_UNDER_PLANNING, token)) return 'not-under-planning';
  if (Object.hasOwn(EXTENSIONS, token)) return 'extension';
  return null;
}

describe('SC1 static audit: every dotfile literal in the hooks is classified', () => {
  test('scanner self-check: comments are ignored, strings, templates and joins are seen', () => {
    const src = [
      "// a comment naming '.ignored-in-comment' and .planning/.also-ignored",
      '/* block',
      "   '.ignored-in-block' */",
      "const a = path.join(dir, '.skill-active');",
      'const b = `.autonomous-resume-${key}`;',
      "const c = path.join('.planning', '.awareness-cache.json');",
      "const d = '.planning/.devflow-notices.json';",
      "const r = /['\"`]/; const e = '.after-regex';",
      'const f = `${path.join(x, \'.nested-in-template\')}`;',
    ].join('\n');
    const tokens = scanLiterals(src).flatMap((l) => dotfileTokens(l.text));
    assert.deepEqual(tokens.sort(), [
      '.after-regex',
      '.autonomous-resume-',
      '.awareness-cache.json',
      '.devflow-notices.json',
      '.nested-in-template',
      '.planning',
      '.planning',
      '.skill-active',
    ]);
  });

  test('scanner self-check: it finds the known literals in the real hooks', () => {
    const gate = fs.readFileSync(path.join(HOOKS_DIR, 'gate-edits.js'), 'utf8');
    const tokens = scanLiterals(gate).flatMap((l) => dotfileTokens(l.text));
    assert.ok(tokens.includes('.skill-active'), 'gate-edits.js reads .skill-active');
    assert.ok(tokens.includes('.planning'));
  });

  test('11. an unclassified dotfile literal fails, naming file and line', () => {
    const unknown = [];
    for (const file of hookSourceFiles()) {
      for (const lit of scanLiterals(fs.readFileSync(file, 'utf8'))) {
        for (const token of dotfileTokens(lit.text)) {
          if (classify(token) === null) {
            unknown.push(`${path.relative(PLUGIN_ROOT, file)}:${lit.line}  '${token}'`);
          }
        }
      }
    }
    assert.deepEqual(
      unknown,
      [],
      'these dotfile literals are not classified. A file the hook WRITES under .planning/ must not be added ' +
        'to ALLOWED_WRITES without review; put runtime state under ~/.claude/devflow/state/ instead. ' +
        'Classify a read-only or non-.planning literal in READ_ONLY / NOT_UNDER_PLANNING with a reason:\n' +
        unknown.join('\n')
    );
  });

  test('11b. the four classification tables do not overlap', () => {
    const tables = { ALLOWED_WRITES, READ_ONLY, NOT_UNDER_PLANNING, EXTENSIONS };
    const owner = new Map();
    const clashes = [];
    for (const [name, table] of Object.entries(tables)) {
      for (const key of Object.keys(table)) {
        if (owner.has(key)) clashes.push(`${key} is in ${owner.get(key)} and ${name}`);
        owner.set(key, name);
        assert.ok(String(table[key]).length > 10, `${name}[${key}] needs a one-line reason`);
      }
    }
    assert.deepEqual(clashes, []);
  });

  test('12. the allowlist is exactly {.skill-active, .edit-override, .devflow-notices.json}', () => {
    assert.deepEqual([...ALLOWLIST].sort(), ['.devflow-notices.json', '.edit-override', '.skill-active']);
  });
});
