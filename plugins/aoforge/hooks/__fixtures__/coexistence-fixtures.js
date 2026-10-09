'use strict';

/**
 * Fixtures for hook-coexistence.test.js (objective 63, TRD 63-05, BLTN-05).
 *
 * Three things live here, all hand-built and deterministic:
 *
 *   1. An AOForge "world": a temp git repo stamped with the plugin version (so
 *      upgrade-project takes its fast path), a fake HOME and a hermetic env
 *      (`hookEnv`) that points every AOForge store at the temp tree. Nothing
 *      here touches the real ~/.claude.
 *   2. Per-event payload builders, shaped from what each hook parses. They
 *      mirror planning-writes.audit.test.js on purpose (copied, not imported:
 *      the audit file is a test file and owns its own table).
 *   3. USER_HOOKS: nine hand-written stand-ins for the hooks a user keeps in
 *      ~/.claude/settings.json. Claude Code runs those in parallel with the
 *      plugin's hooks on the same event. The real guard-kube-context.py on this
 *      machine is deliberately neither copied nor run.
 *
 * Not a test file: no `*.test.js` glob picks it up.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HOOKS_DIR = path.resolve(__dirname, '..');
const PLUGIN_ROOT = path.resolve(HOOKS_DIR, '..');
const PLUGIN_VERSION = JSON.parse(
  fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
).version;

// ─── The world ───────────────────────────────────────────────────────────────

const PLANNING_DIRS = ['.aoforge', path.join('flutter', '.aoforge')];

function planningDirsOf(root) {
  return PLANNING_DIRS.map((rel) => path.join(root, rel));
}

function writeProjectPlanning(dir) {
  fs.mkdirSync(path.join(dir, 'objectives', '63-coexistence-demo'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify({ mode: 'autonomous', aoforge: { version: PLUGIN_VERSION } }, null, 2)
  );
  fs.writeFileSync(
    path.join(dir, 'STATE.md'),
    '# AOForge State\n\n## Current Position\n\nObjective: 63\nStatus: Executing\n'
  );
  fs.writeFileSync(
    path.join(dir, 'objectives', '63-coexistence-demo', '63-05-TRD.md'),
    '---\nobjective: 63-coexistence-demo\ntrd: "05"\n---\n\n# TRD 63-05\n'
  );
}

let templateBase = null;

/**
 * One git repo, built once and copied per run: an autonomous, mid-execution
 * project whose only commit is 20 minutes old (so verify-commits sees no recent
 * commits), with a nested flutter/.aoforge/ and a tracked src/x.js.
 */
function ensureTemplate() {
  if (templateBase) return templateBase;
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'coexist-tpl-')));
  const root = path.join(base, 'project');
  fs.mkdirSync(path.join(root, 'flutter'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'x.js'), 'module.exports = 1;\n');
  for (const dir of planningDirsOf(root)) writeProjectPlanning(dir);

  const date = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const env = { PATH: process.env.PATH, HOME: base, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  const git = (...args) => execFileSync('git', args, { cwd: root, env, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'coexist@test.invalid');
  git('config', 'user.name', 'Coexist');
  git('config', 'commit.gpgsign', 'false');
  // No auto maintenance. `git commit` runs `git maintenance run --auto --detach`,
  // and since git 2.55 the detached child keeps .git/objects/maintenance.lock
  // after `git commit` has returned (daemonize() hands it the tempfile; before
  // 2.55 the exiting parent removed it). The cpSync in makeWorld then lists the
  // lock and loses it before copying it: "ENOENT ... project/.git/objects" on
  // ubuntu-latest (git 2.55) under load, or a stale lock copied into the world.
  // Off in the repo config, so every copied world inherits it too and no hook's
  // git call leaves a daemon behind.
  git('config', 'maintenance.auto', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'seed');
  templateBase = base;
  process.on('exit', () => {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* best effort */ }
  });
  return base;
}

/**
 * A fresh copy of the template plus its own fake home.
 *
 * opts: skillActive (a live .skill-active marker), routeRecommendation,
 * notices (a pending upgrade notice), editOverride (an armed .edit-override),
 * legacyPlugin (the pre-rename plugin installed and enabled in the fake home),
 * sharedHomeFrom (another world: reuse its HOME, so a warmed runtime mirror is
 * hit on the fast path; that world's dispose then also owns the home).
 *
 * @returns {{base: string, root: string, home: string, tmp: string, ownsHome: boolean}}
 */
function makeWorld(opts = {}) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'coexist-')));
  fs.cpSync(ensureTemplate(), base, { recursive: true });
  const root = path.join(base, 'project');
  const tmp = path.join(base, 'tmp');
  fs.mkdirSync(tmp, { recursive: true });

  let home;
  let ownsHome = true;
  if (opts.sharedHomeFrom) {
    home = opts.sharedHomeFrom.home;
    ownsHome = false;
  } else {
    home = path.join(base, 'home');
    fs.mkdirSync(home, { recursive: true });
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
      fs.writeFileSync(path.join(dir, '.edit-override'), JSON.stringify({ created_at: new Date().toISOString() }));
    }
    if (opts.routeRecommendation) fs.writeFileSync(path.join(dir, '.route-recommendation'), '/aoforge:build');
  }
  if (opts.changelog) {
    // A tracked-tree CHANGELOG.md with no entry for the tag the payload asks for (changelog-on-tag denies).
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## [1.0.0]\n\n- seed\n');
  }
  if (opts.stuckGuard) {
    // Four identical prior calls in this session, so the hook's own call is the fifth: guard-no-progress asks.
    const lib = path.join(PLUGIN_ROOT, 'aoforge', 'bin', 'lib');
    const guard = require(path.join(lib, 'progress-guard.cjs'));
    const store = require(path.join(lib, 'progress-guard-store.cjs'));
    let state = null;
    for (let i = 0; i < 4; i++) state = guard.record(state, opts.stuckGuard).state;
    const dir = store.stateDir({ AOFORGE_PROGRESS_GUARD_DIR: path.join(home, 'progress-guard') });
    store.writeSession(store.sessionFile(dir, 'coexist-session'), {
      guard: state,
      updated: Date.now(),
      project: fs.realpathSync(root),
    });
  }
  if (opts.legacyPlugin) {
    // TRD 72-10: the pre-rename plugin installed and enabled beside AOForge, so coexistence-guard queues its notice.
    const legacyPlugins = require(path.join(PLUGIN_ROOT, 'aoforge', 'bin', 'lib', '__fixtures__', 'legacy-plugin-fixtures.cjs'));
    legacyPlugins.seedEnabledLegacyPlugin(home);
  }
  if (opts.notices) {
    const notices = require(path.join(PLUGIN_ROOT, 'aoforge', 'bin', 'lib', 'notices.cjs'));
    for (const rel of ['.', 'flutter']) {
      notices.appendNotice(notices.projectNoticesPath(path.join(root, rel)), {
        source: 'hook-coexistence',
        level: 'info',
        key: 'coexist-seed',
        message: 'seeded by the coexistence suite',
      });
    }
  }
  return { base, root, home, tmp, ownsHome };
}

function disposeWorld(world) {
  if (!world) return;
  fs.rmSync(world.base, { recursive: true, force: true });
}

/**
 * A minimal env: nothing inherited, so a developer's AOFORGE_SKIP_* can never
 * mask a behaviour. Two skips ARE set, on purpose: upgrade-project's detached
 * transcript export and backup prune are side jobs with nothing to compose, and
 * they would outlive the test. No other AOFORGE_SKIP_* is ever set.
 */
function hookEnv(world) {
  return {
    PATH: process.env.PATH,
    HOME: world.home,
    TMPDIR: world.tmp,
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    AOFORGE_HOOK_MARKER_DIR: path.join(world.home, 'hook-markers'),
    AOFORGE_PROGRESS_GUARD_DIR: path.join(world.home, 'progress-guard'),
    AOFORGE_AWARENESS_DIR: path.join(world.home, 'awareness'),
    AOFORGE_AUDIT_LOG_PATH: path.join(world.home, 'audit.log'),
    AOFORGE_HANDOFF_PID_FILE: path.join(world.home, 'aoforge-watch.pid'),
    AOFORGE_OUTBOX_DIR: path.join(world.home, 'outbox'),
    AOFORGE_SKIP_TRANSCRIPT_EXPORT: '1',
    AOFORGE_SKIP_PRUNE: '1',
  };
}

// ─── Payload builders ────────────────────────────────────────────────────────

/** ctx is `{world, cwd}`; every builder returns a plain object, as Claude Code sends on stdin. */
function envelope(event, ctx, extra = {}) {
  return {
    session_id: 'coexist-session',
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
    prompt: 'build the coexistence fixture',
    tools_used: ['Skill'],
    ...extra,
  });

const subagentStop = (extra = {}) => (ctx) =>
  envelope('SubagentStop', ctx, {
    stop_hook_active: false,
    agent_id: `coexist-agent-${path.basename(ctx.cwd)}`,
    agent_type: 'aoforge:executor',
    last_assistant_message: 'I stopped early.',
    ...extra,
  });

const prompt = (text) => (ctx) => envelope('UserPromptSubmit', ctx, { prompt: text });

const expansion = (commandName, commandArgs = '') => (ctx) =>
  envelope('UserPromptExpansion', ctx, {
    expansion_type: 'slash_command',
    command_name: commandName,
    command_args: commandArgs,
    command_source: 'plugin',
    prompt: `/${commandName} ${commandArgs}`.trim(),
  });

const preTool = (tool, input, extra = {}) => (ctx) =>
  envelope('PreToolUse', ctx, { tool_name: tool, tool_input: input, ...extra });

const postTool = (tool, input, extra = {}) => (ctx) =>
  envelope('PostToolUse', ctx, { tool_name: tool, tool_input: input, tool_response: {}, ...extra });

/**
 * The executor transcript gate-executor-stop reads: its first user record names
 * TRD 63-05. Written into the world's home; returns the path.
 */
function executorTranscript(world) {
  const file = path.join(world.home, 'agent-transcript.jsonl');
  const text = [
    'Execute plan 63-05 of objective 63-coexistence-demo.',
    `REPO_ROOT: ${world.root}`,
    'PLAN_ID: 63-05',
    `node aof-tools.cjs exec-context check --repo ${world.root} --base abc1234 --id 63-05`,
  ].join('\n');
  fs.writeFileSync(file, `${JSON.stringify({ type: 'user', message: { role: 'user', content: text } })}\n`);
  return file;
}

// ─── The user's own hooks ────────────────────────────────────────────────────

/**
 * Nine behaviours a hook in ~/.claude/settings.json can have beside AOForge's.
 * Each value is Node source; each reads its stdin JSON (except user-no-stdin)
 * and branches on `hook_event_name`.
 */
const READ_PAYLOAD = `
const fs = require('fs');
let p = {};
try { p = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { /* an unreadable payload is treated as empty */ }
const event = (p && p.hook_event_name) || '';
`;

const CONTEXT_OUTPUT = `
const out = { systemMessage: 'user: ' + event };
if (['SessionStart', 'UserPromptSubmit', 'PostToolUse'].includes(event)) {
  out.hookSpecificOutput = { hookEventName: event, additionalContext: 'user context' };
}
process.stdout.write(JSON.stringify(out));
`;

const USER_HOOKS = {
  // Adds context and a system message; allows nothing, blocks nothing.
  'user-context': `${READ_PAYLOAD}${CONTEXT_OUTPUT}`,

  // Allows the tool call (PreToolUse); silent on every other event.
  'user-allow': `${READ_PAYLOAD}
if (event === 'PreToolUse') {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: 'user allow' },
  }));
}
`,

  // Shaped like a kube-context guard: denies a tool call, blocks a stop or a prompt.
  'user-deny': `${READ_PAYLOAD}
if (event === 'PreToolUse') {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'user deny' },
  }));
} else if (['Stop', 'SubagentStop', 'UserPromptSubmit', 'UserPromptExpansion'].includes(event)) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason: 'user deny' }));
}
`,

  // Plain text on stdout.
  'user-plain': `${READ_PAYLOAD}
process.stdout.write('user plain text');
`,

  // A crash: exit 1 with a message on stderr (non-blocking in Claude Code).
  'user-fail': `${READ_PAYLOAD}
process.stderr.write('user hook failed');
process.exit(1);
`,

  // A deliberate block: exit 2 with a message on stderr.
  'user-exit2': `${READ_PAYLOAD}
process.stderr.write('user hook blocked');
process.exit(2);
`,

  // Starts like JSON and ends like JSON, but is neither.
  'user-garbage': `${READ_PAYLOAD}
process.stdout.write('{not json}');
`,

  // Slow: waits 1500 ms, then does what user-context does. The suite gives it a shorter timeout.
  'user-slow': `${READ_PAYLOAD}
setTimeout(() => {
${CONTEXT_OUTPUT}
}, 1500);
`,

  // Never reads stdin and exits at once (the writer then meets EPIPE).
  'user-no-stdin': 'process.exit(0);\n',
};

/**
 * Write every stub as `<dir>/<name>.js`.
 * @returns {Object<string,string>} name -> absolute path
 */
function writeUserHooks(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const out = {};
  for (const [name, source] of Object.entries(USER_HOOKS)) {
    const file = path.join(dir, `${name}.js`);
    fs.writeFileSync(file, `'use strict';\n${source}`);
    out[name] = file;
  }
  return out;
}

module.exports = {
  HOOKS_DIR,
  PLUGIN_ROOT,
  PLUGIN_VERSION,
  ensureTemplate,
  makeWorld,
  disposeWorld,
  hookEnv,
  envelope,
  sessionStart,
  stop,
  subagentStop,
  prompt,
  expansion,
  preTool,
  postTool,
  executorTranscript,
  USER_HOOKS,
  writeUserHooks,
};
