#!/usr/bin/env node
'use strict';

/**
 * pointer-notice: the one hook of the final devflow@aocyber release (TRD 72-14, INST-05).
 *
 * DevFlow is now AOForge. This release of the old plugin ships no gates, no agents and no
 * runtime: a forwarding skill per command and this SessionStart notice, which tells the user to
 * install aoforge@aocyber and tells Claude to route /devflow: requests to /aoforge:.
 *
 * It goes quiet once AOForge is present: AOForge's runtime mirror writes
 * ~/.claude/aoforge/.plugin-version, and with that marker this hook prints nothing (AOForge's own
 * coexistence notice then tells the user to disable this plugin). It fails open: when it cannot
 * tell whether the marker exists (an unreadable home, any error), it prints nothing and exits 0.
 *
 * Plain Node with no requires outside this file, so it runs from the plugin cache on its own.
 * The pointer plugin is removed in the release after 3.0.0.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const INSTALL = '/plugin install aoforge@aocyber';
const DISABLE = 'claude plugin disable devflow@aocyber';

const SYSTEM_MESSAGE =
  'DevFlow is now AOForge. This devflow@aocyber release is only a pointer, removed in the release after 3.0.0. ' +
  `Install AOForge: run \`${INSTALL}\`, restart Claude Code, then run \`${DISABLE}\`. ` +
  'Your /devflow: commands forward to /aoforge: once AOForge is installed.';

const ADDITIONAL_CONTEXT =
  'DevFlow has been renamed AOForge. The devflow plugin in this session is its final pointer release: ' +
  'it has no gates and no agents, and each /devflow:<name> skill only forwards to /aoforge:<name>. ' +
  'AOForge (aoforge@aocyber) is not installed yet. Route every /devflow: request to the matching /aoforge: command. ' +
  `Until AOForge is installed, tell the user to install it with \`${INSTALL}\`, restart Claude Code, ` +
  `and disable the pointer with \`${DISABLE}\`.`;

/** true: the AOForge runtime marker exists; false: it does not; null: cannot tell. */
function aoforgePresent(home) {
  try {
    fs.statSync(path.join(home, '.claude', 'aoforge', '.plugin-version'));
    return true;
  } catch (err) {
    return err && err.code === 'ENOENT' ? false : null;
  }
}

/** The SessionStart output, or null when the hook should print nothing. */
function notice(home) {
  if (!home || aoforgePresent(home) !== false) return null;
  return {
    systemMessage: SYSTEM_MESSAGE,
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ADDITIONAL_CONTEXT },
  };
}

function main() {
  let home = '';
  try {
    home = os.homedir();
  } catch {
    return;
  }
  const out = notice(home);
  if (out) process.stdout.write(JSON.stringify(out));
}

if (require.main === module) {
  try {
    main();
  } catch {
    // fail open: a notice is never worth breaking session start
  }
  process.exitCode = 0;
}

module.exports = { notice, aoforgePresent };
