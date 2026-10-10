#!/usr/bin/env node

/**
 * AOForge Interactive Command Gate (PreToolUse, Bash)
 *
 * Two modes, switched on whether the aoforge-watch daemon is running:
 *
 *   Daemon LIVE (Approach B):
 *     Detects an interactive or shell-flow command, writes a pending handoff
 *     record, denies the Bash tool with reason "queued for daemon — continue
 *     with other work." The pending record carries the payload's session_id
 *     and agent_id (null for the main loop). The daemon picks up the record,
 *     runs it in the user's aoforge-watch terminal (the user answers any
 *     prompt there), writes a done record that carries the same address, and
 *     inject-handoff-results.js delivers the result to the context that asked:
 *     after Claude's next tool call (PostToolUse) or when the turn ends (Stop,
 *     which waits briefly for a command still running). route-results.js stays
 *     the catch-all on the user's next prompt. The deny reason tells Claude
 *     this, and to tell the user in one line where the command is waiting.
 *     Claude never instructs the user to paste anything.
 *
 *   Daemon ABSENT (Approach A — fallback):
 *     Same detection + pending record, but the deny reason instructs Claude
 *     to surface `! cmd` for the user to paste. Original behaviour preserved
 *     so the hook is useful even without the watcher running.
 *
 * Detection is invocation-aware (TRD 73-10) and lives in the shared module
 * aoforge/bin/lib/interactive-commands.cjs, which the watch daemon's allowlist
 * uses too (TRD 73-12), so the two agree on what is handed off. It reads the
 * command's simple commands (shell-words.parseCommand):
 *   - quoted text and heredoc bodies are data, so a grep, a note or a commit
 *     message that mentions a command is not intercepted; a heredoc fed to a
 *     shell (`bash <<'EOF'`) is read as commands;
 *   - every call is matched on its own and its skip flags are read from its own
 *     words; when the command has more than one call, the reason names the call
 *     that matched;
 *   - read-only key forms (fingerprint, find, remove) pass.
 * Two categories:
 *   1. TTY-interactive: doctl auth init, gh auth login, gcloud auth login,
 *      aws configure, aws sso login, op signin, npm login, vault login,
 *      passwd, ssh-keygen
 *   2. Shell-flow (need user's interactive shell env, aliases, sourced rc):
 *      nvm use/install, pyenv shell/install, conda activate, direnv exec/allow,
 *      mise use/install/run, asdf shell/install, rbenv shell
 * If the shared module (or shell-words, which it requires) cannot load, the
 * hook gates nothing (fail open, like gate-commits).
 *
 * Escape hatch: AOFORGE_SKIP_INTERACTIVE_GATE=1
 * Test override: AOFORGE_HANDOFF_PID_FILE=<path>
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// Objective 72: honour the legacy env prefix for one release. A stub plugin tree without the libs fails open.
try { require('../aoforge/bin/lib/compat.cjs').aliasLegacyEnv(); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }

// The shared per-invocation matcher (TRD 73-10). Fail open: if it (or shell-words, which it requires) cannot load,
// nothing is gated. The plugin always ships aoforge/ beside hooks/, so this only happens on a broken install or a stub
// plugin tree. The exports below are the module's own objects, so the hook and the daemon allowlist share one matcher.
let matcher = null;
try { matcher = require(path.join(__dirname, '..', 'aoforge', 'bin', 'lib', 'interactive-commands.cjs')); } catch { /* fail open */ }
const detectInteractive = matcher ? matcher.detectInteractive : () => null;
const INTERACTIVE_PATTERNS = matcher ? matcher.INTERACTIVE_PATTERNS : Object.freeze([]);
const CMD_POS = matcher ? matcher.CMD_POS : /(?:^\s*|[;&|\n(]\s*|&&\s*|\|\|\s*)/.source;
const sshKeygenFlags = matcher ? matcher.sshKeygenFlags : () => new Set();

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

// The watch daemon is read through watcher-state (TRD 73-10): the pid file's location, the AOFORGE_HANDOFF_PID_FILE
// override and the record are that module's, so a move of the pid file reaches this hook with no edit here. Without
// it (a stub plugin tree), there is no daemon: the hook gives the paste instruction.
let watcherState = null;
try { watcherState = require(path.join(__dirname, '..', 'aoforge', 'bin', 'lib', 'watcher-state.cjs')); }
catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }

/** The AOForge daemon's pid file, as watcher-state resolves it; null without watcher-state. */
function pidFilePath() {
  return watcherState ? watcherState.pidFilePath() : null;
}

/** The daemon's pid record, or null. A pre-rename daemon's record never serves this hook's handoffs. */
function readWatcherInfo() {
  const info = watcherState ? watcherState.readPidFile() : null;
  return info && !info.legacy ? info : null;
}

function isWatcherLive() {
  const info = readWatcherInfo();
  if (!info || typeof info.pid !== 'number') return false;
  try {
    process.kill(info.pid, 0);
    return true;
  } catch {
    return false;
  }
}

function writePendingRecord(cmd, cwd, reason, opts = {}) {
  const id = 'h-' + crypto.randomBytes(4).toString('hex');
  const dir = path.join(cwd, '.aoforge-handoff', 'pending');
  try {
    fs.mkdirSync(dir, { recursive: true });
    const record = {
      id,
      cmd,
      cwd,
      reason,
      source: 'hook',
      shell: opts.shell || null,
      timeout_ms: typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 600000,
      created_at: new Date().toISOString(),
      status: 'pending',
      // The address of the hook payload that queued this command (null: the main loop). The daemon's done record
      // spreads this record, so inject-handoff-results.js can deliver the result to the context that asked for it.
      session_id: typeof opts.sessionId === 'string' && opts.sessionId ? opts.sessionId : null,
      agent_id: typeof opts.agentId === 'string' && opts.agentId ? opts.agentId : null,
    };
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(record, null, 2));
    return id;
  } catch {
    return id;
  }
}

function deny(reason) {
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

function buildDenyReason({ id, cmd, hit, watcherLive, watcherInfo }) {
  // A command with more than one call names the call that matched (TRD 73-10); a single call keeps today's wording.
  const named = hit.compound && hit.segment && hit.segment !== String(cmd).trim();
  const what = named ? `\`${hit.segment}\`: ${hit.reason}` : hit.reason;
  if (watcherLive) {
    return [
      `This command needs the user's shell (${what}; category: ${hit.category}).`,
      `It has been queued to the aoforge-watch PTY-backed daemon (pid ${watcherInfo && watcherInfo.pid}). Continue with other work — the daemon will run it via a real PTY in the user's aoforge-watch terminal, and if it prompts, the user answers there. Tell the user in one line that \`${cmd}\` is waiting in their aoforge-watch terminal. Its result is delivered into your context automatically after your next tool call, or when you end your turn (the Stop hook waits briefly for it). Do NOT instruct the user to paste anything; do NOT retry the Bash tool.`,
      `(handoff id: ${id} — record at .aoforge-handoff/pending/${id}.json)`,
      'Escape hatch: set AOFORGE_SKIP_INTERACTIVE_GATE=1 if this is a false positive.',
    ].join(' ');
  }
  return [
    `This command requires the user's shell (${what}; category: ${hit.category}).`,
    'The Claude Code harness cannot run it directly, and the aoforge-watch daemon is not running.',
    `Tell the user verbatim to paste this in the prompt: \`! ${cmd}\``,
    'The `!` prefix runs the command in their shell so the output returns inline.',
    'Do NOT retry the Bash tool. Wait for the user\'s next message containing the output, then continue.',
    `(handoff id: ${id} — record at .aoforge-handoff/pending/${id}.json. ` +
      'Tip: run `aoforge-watch start` in another terminal to skip the paste step in future.)',
    'Escape hatch: set AOFORGE_SKIP_INTERACTIVE_GATE=1 if this is a false positive.',
  ].join(' ');
}

function main() {
  if (process.env.AOFORGE_SKIP_INTERACTIVE_GATE === '1') return;

  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }
  // `null`, an array or a string parses fine but is not a payload (TRD 63-05): exit 0 and say nothing.
  if (!input || typeof input !== 'object' || Array.isArray(input)) return;
  if (input.tool_name !== 'Bash') return;

  const cmd = (input.tool_input && input.tool_input.command) || '';
  if (!cmd) return;

  const hit = detectInteractive(cmd);
  if (!hit) return;

  const watcherInfo = readWatcherInfo();
  const watcherLive = isWatcherLive();
  const id = writePendingRecord(cmd, process.cwd(), hit.reason, {
    shell: watcherInfo && watcherInfo.shell,
    sessionId: input.session_id,
    agentId: input.agent_id,
  });

  deny(buildDenyReason({ id, cmd, hit, watcherLive, watcherInfo }));
}

if (require.main === module) {
  main();
}

module.exports = {
  detectInteractive,
  INTERACTIVE_PATTERNS,
  CMD_POS,
  sshKeygenFlags,
  isWatcherLive,
  readWatcherInfo,
  pidFilePath,
  buildDenyReason,
};
