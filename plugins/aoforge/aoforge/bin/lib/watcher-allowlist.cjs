'use strict';

/**
 * Watcher allowlist — what the aoforge-watch daemon will execute.
 *
 * Default = the curated interactive + shell-flow patterns. Users may extend
 * via aoforge-watch-allow.json in the runtime home, ~/.claude/aoforge/ (override:
 * $AOFORGE_WATCH_ALLOW_FILE). Only that file is read (TRD 78-11): a copy in
 * ~/.aoforge/ (AOForge 3.0.0) or the pre-rename daemon's file is ignored;
 * doctor check 17 moves 3.0.0's file on request. The daemon NEVER runs anything
 * outside the combined allowlist; the deny-list is a belt-and-braces sanity
 * check.
 *
 * NOTE (TRD 73-12): the built-in entries are the same per-invocation matcher
 * gate-interactive uses (interactive-commands.cjs: shell-words segments, flags
 * read per call, quoted text and heredoc data never match), so the daemon
 * accepts exactly the commands the hook hands off; watcher-allowlist.test.cjs
 * pins that over the shared case table. A call a skip rule exempts (e.g.
 * `gh auth login --with-token`, already non-interactive) is refused: there is
 * nothing to hand off. User entries from the allowlist file are regexes tested
 * on the whole command.
 */

const fs = require('fs');
const os = require('os');

const { NAMES } = require('./legacy-names.cjs');
const { userDotFile } = require('./compat.cjs');
// The matcher gate-interactive uses. It ships beside this file in bin/lib, so a plain require: the daemon cannot
// validate a command without it.
const interactive = require('./interactive-commands.cjs');

const MAX_CMD_LEN = 4096;

// CMD_POS: the command-position prefix, from the shared module. Only the deny list uses it, and it matches on the
// WHOLE text: it can only refuse more, never run more.
const { CMD_POS } = interactive;

function rx(body) {
  return new RegExp(`${CMD_POS}${body}`);
}

// Curated allowlist: the shared matcher's own patterns (label, match), marked
// `builtin` so validateCommand never regex-tests them on the whole command:
// their `match` is anchored at the start of ONE simple command, and skip rules
// (skipIf, skipArgs) are applied per call by interactive.matchInvocations.
const DEFAULT_PATTERNS = Object.freeze(interactive.INTERACTIVE_PATTERNS.map((p) =>
  Object.freeze({ label: p.label, match: p.match, builtin: true })));

// Deny list — these are sanity-checked even if a user adds them to a custom
// allowlist. The combined allowlist is the primary defence; this is a final
// guard against obvious foot-guns.
const DENY_PATTERNS = [
  { label: 'sudo', match: rx('sudo\\b') },
  { label: 'su -', match: rx('su\\s+-') },
  { label: 'rm -rf /', match: /\brm\s+-rf\s+\/(?!\w)/ },
  { label: 'fork bomb', match: /:\(\)\s*\{\s*:/ },
  { label: 'curl|bash', match: /\bcurl\b[^|]*\|\s*bash\b/ },
  { label: 'curl|sh', match: /\bcurl\b[^|]*\|\s*sh\b/ },
  { label: 'wget|bash', match: /\bwget\b[^|]*\|\s*bash\b/ },
  { label: 'wget|sh', match: /\bwget\b[^|]*\|\s*sh\b/ },
];

function defaultAllowlist() {
  // Return a shallow copy so callers can extend without mutating the module (the entries themselves are frozen).
  return DEFAULT_PATTERNS.slice();
}

function denyHit(cmd) {
  for (const d of DENY_PATTERNS) {
    if (d.match.test(cmd)) return d;
  }
  return null;
}

/**
 * Validate a command against an allowlist.
 *
 * Built-in entries (`builtin: true`, from defaultAllowlist) are matched per
 * invocation by the shared matcher: the command is accepted when a call in it
 * is one the hook gates, and refused as a non-interactive form when a call
 * matched a built-in but a skip rule exempted it. Curated entries are checked
 * before user entries, as before. User entries are regexes (with an optional
 * skipIf) tested on the whole command.
 *
 * @returns {{ ok: true, matched: string } | { ok: false, reason: string }}
 */
function validateCommand(cmd, allowlist) {
  if (!cmd || !cmd.trim()) {
    return { ok: false, reason: 'empty command' };
  }
  if (cmd.length > MAX_CMD_LEN) {
    return { ok: false, reason: `command too long (length ${cmd.length} > ${MAX_CMD_LEN})` };
  }
  const denied = denyHit(cmd);
  if (denied) {
    return { ok: false, reason: `denied by guard: ${denied.label}` };
  }
  if (!Array.isArray(allowlist) || allowlist.length === 0) {
    return { ok: false, reason: 'allowlist empty' };
  }
  // Curated entries first, through the matcher gate-interactive uses.
  const builtins = new Set(allowlist.filter((p) => p && p.builtin).map((p) => p.label));
  if (builtins.size > 0) {
    const { hit, skipped } = interactive.matchInvocations(cmd);
    if (hit && builtins.has(hit.label)) return { ok: true, matched: hit.label };
    if (skipped && builtins.has(skipped.label)) {
      return { ok: false, reason: `non-interactive form not needed for handoff (matched skipIf for "${skipped.label}")` };
    }
  }
  // User entries: a regex and an optional skipIf on the whole command.
  for (const p of allowlist) {
    if (!p || p.builtin) continue;
    const m = p.match instanceof RegExp ? p.match : new RegExp(p.match);
    if (!m.test(cmd)) continue;
    if (p.skipIf && p.skipIf.test(cmd)) {
      return { ok: false, reason: `non-interactive form not needed for handoff (matched skipIf for "${p.label}")` };
    }
    return { ok: true, matched: p.label };
  }
  return { ok: false, reason: 'command does not match the daemon allowlist' };
}

/**
 * The user allowlist file (compat.userDotFile, TRD 73-11): the runtime home,
 * ~/.claude/aoforge/aoforge-watch-allow.json, with no fallback (TRD 78-11). Read
 * only; the daemon never writes it.
 */
function userAllowFilePath() {
  if (process.env.AOFORGE_WATCH_ALLOW_FILE) {
    return process.env.AOFORGE_WATCH_ALLOW_FILE;
  }
  const home = process.env.HOME || os.homedir();
  return userDotFile(home, `${NAMES.watch}-allow.json`);
}

/**
 * Load the combined allowlist (default + user).
 *
 * @returns {{ allowlist, userPatterns, degraded }}
 */
function loadAllowlist() {
  const allowlist = defaultAllowlist();
  const userFile = userAllowFilePath();
  if (!fs.existsSync(userFile)) {
    return { allowlist, userPatterns: 0, degraded: false };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(userFile, 'utf8'));
  } catch {
    return { allowlist, userPatterns: 0, degraded: true };
  }
  const commands = (parsed && Array.isArray(parsed.commands)) ? parsed.commands : [];
  let added = 0;
  for (const entry of commands) {
    if (!entry || typeof entry.pattern !== 'string') continue;
    let re;
    try { re = new RegExp(entry.pattern); } catch { continue; }
    allowlist.push({
      label: entry.label || entry.pattern,
      match: re,
      skipIf: entry.skipIf ? new RegExp(entry.skipIf) : null,
    });
    added += 1;
  }
  return { allowlist, userPatterns: added, degraded: false };
}

module.exports = {
  defaultAllowlist,
  loadAllowlist,
  validateCommand,
  CMD_POS,
  MAX_CMD_LEN,
  DENY_PATTERNS,
};
