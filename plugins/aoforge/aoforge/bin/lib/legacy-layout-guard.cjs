'use strict';

// legacy-layout-guard.cjs — which aof-tools commands refuse in a legacy-only project (objective 78, TRD 78-07, SC-4).
//
// A legacy-only project has only the pre-rename planning directory (planning-layout.isLegacyPlanning) at the cwd or
// an ancestor below $HOME, with no `.aoforge/` project nearer (planning-layout.findLegacyLayoutRoot). AOForge no
// longer reads that directory, and a command that resolved the planning root there would either work on the old
// tree (while compat still falls back to it, until TRD 78-11) or start a second, empty `.aoforge/` tree beside it.
// Either way the user is better served by the one message naming the fix, so aof-tools main() asks this module once,
// after `--cwd` and the unknown-flag check, before dispatch:
//
//   refused  every command help.cjs marks `mutates: true`, and `init` (read-only, but every skill calls it first),
//            unless it is in EXEMPT_COMMANDS; `upgrade` too, unless it carries --global, --prune or --register
//            (those touch only the user's runtime state)
//   run      every other command (read-only commands never create a planning tree), any help flag (help is a
//            question, never an instruction: issue #87), and every EXEMPT_COMMANDS entry
//
// An exemption is granted only with evidence that the command never writes the planning tree: its library holds no
// planningRoot / planningRel / findProjectRoot write path (grep), or the command reports the layout itself. The
// reason for each is kept beside it. A new mutating command is refused by default, the safe direction.

const path = require('path');
const { findLegacyLayoutRoot, legacyLayoutMessage } = require('./planning-layout.cjs');
const { hasTopLevelHelpFlag } = require('./help.cjs');

/** command -> why it runs in a legacy-only project. */
const EXEMPT_COMMANDS = Object.freeze({
  doctor: 'reports the layout itself: no project is resolved for a legacy-only root and the note carries the message (TRD 78-01)',
  validate: 'reports the layout itself: `validate health` returns the one broken W066 and writes nothing, --repair included (TRD 78-01)',
  'transcript-export': 'reads Claude Code transcripts and appends ~/.claude/aoforge/transcript-index.jsonl only',
  calibrate: 'writes ~/.claude/aoforge/calibration.json (or --out) only; planning trees are read to measure, never written',
  estimate: 'writes run state under ~/.claude/aoforge/state/estimates only; the roadmap is read, never written',
  handoff: 'the handoff queue in <cwd>/.aoforge-handoff/, never the planning tree',
  'merge-driver': 'git config and the repository\'s info/attributes only; `resolve` merges the path git hands it',
  'global-config': 'the user config under ~/.claude/aoforge only',
  changelog: 'CHANGELOG.md at the cwd only',
  'exec-context': 'claims under the git common dir and worktrees beside the repository; exec-context.cjs never resolves the planning root',
  'project-decline': '~/.claude/aoforge/declined-projects.json only (decline-tracker.cjs never resolves the planning root)',
  'project-accept': '~/.claude/aoforge/declined-projects.json only (decline-tracker.cjs never resolves the planning root)',
});

/** `upgrade` flags whose runs touch only ~/.claude/aoforge (the global upgrade, the backup pruner, its registry). */
const RUNTIME_ONLY_UPGRADE_FLAGS = Object.freeze(['--global', '--prune', '--register']);

/**
 * The refusal for `command` in `cwd`, or null when it may run.
 *
 * @param {object} opts
 * @param {string} opts.command   the aof-tools command name (args[0])
 * @param {string[]} [opts.args]  the argv after `--cwd` and `--raw` were taken out, command first
 * @param {string} opts.cwd       the directory the command runs in (after `--cwd`)
 * @param {object} opts.commands  help.cjs COMMANDS (name -> { mutates? })
 * @param {string} [opts.home]    $HOME for the walk's stop (default: findLegacyLayoutRoot's own)
 * @returns {{root: string, message: string}|null}
 */
function legacyLayoutGuard({ command, args = [], cwd, commands, home } = {}) {
  if (typeof command !== 'string' || !command || !commands || !Object.prototype.hasOwnProperty.call(commands, command)) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(EXEMPT_COMMANDS, command)) return null;
  if (!(commands[command] && commands[command].mutates === true) && command !== 'init') return null;
  if (command === 'upgrade' && args.some((a) => RUNTIME_ONLY_UPGRADE_FLAGS.includes(a))) return null;
  if (hasTopLevelHelpFlag(args)) return null;

  const root = findLegacyLayoutRoot(path.resolve(cwd || '.'), home === undefined ? undefined : { home });
  if (!root) return null;
  return { root, message: legacyLayoutMessage(root) };
}

module.exports = { legacyLayoutGuard, EXEMPT_COMMANDS };
