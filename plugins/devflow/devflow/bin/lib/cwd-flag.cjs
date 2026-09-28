'use strict';

// cwd-flag.cjs — global `--cwd <dir>` flag for df-tools (TRD 37-02).
//
// One flag, parsed once before dispatch: `df-tools --cwd <dir> <command> ...`
// runs exactly as if df-tools had been started in <dir>. Every subcommand gets
// it for free — the point is one global flag, not per-subcommand `--cwd`
// parsing.
//
// Flag region: the same "part of argv df-tools actually reads" that
// `hasTopLevelHelpFlag` uses (`help.cjs`'s `helpScanLimit`) — a forwarded tail
// (`handoff create <command...>`) and anything after a literal `--` are never
// scanned for a TRAILING `--cwd`. A LEADING `--cwd` (args[0]) is always read:
// it precedes the command name, so it can never be data belonging to it.
//
// `dup-detect` already parses its own `--cwd` (`dup-detect-cli.cjs:109,204`).
// A leading `--cwd` still applies to it (nothing else could own position 0
// ahead of the command name), but a trailing one is left untouched for
// dup-detect's own parser — hence OWN_CWD only suppresses the TRAILING scan.

const fs = require('fs');
const path = require('path');
const { helpScanLimit } = require('./help.cjs');

const OWN_CWD = new Set(['dup-detect']);

function isCwdToken(tok) {
  return tok === '--cwd' || (typeof tok === 'string' && tok.startsWith('--cwd='));
}

// `tok` is already known to be a --cwd token (isCwdToken(tok) === true).
function tokenValue(tok, next) {
  if (tok === '--cwd') return { value: next, consumed: 2 };
  return { value: tok.slice('--cwd='.length), consumed: 1 };
}

function resolveDir(rawValue, originalCwd) {
  if (!rawValue) return { error: '--cwd requires a directory' };
  const resolved = path.resolve(originalCwd, rawValue);
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return { error: `--cwd: not a directory: ${resolved}` };
  }
  if (!stat.isDirectory()) return { error: `--cwd: not a directory: ${resolved}` };
  return { dir: resolved };
}

/**
 * extractCwdFlag(args, {originalCwd}) -> {args, dir, error}
 *
 * Never mutates `args`. `dir` is the resolved absolute target directory (or
 * `null` when no `--cwd` was found in the region df-tools reads). `error` is a
 * short message with no "Error:" prefix — the caller decides how to report it
 * — or `null`.
 *
 * Duplicate detection (a leading AND a trailing occurrence) is checked before
 * either value is resolved/validated, so `--cwd a state --cwd b` reports
 * "given twice" rather than failing on whichever value happens to not exist.
 */
function extractCwdFlag(args, { originalCwd } = {}) {
  const orig = originalCwd || process.cwd();

  const hasLeading = isCwdToken(args[0]);
  let leadingRawValue;
  let afterLeading = args;
  if (hasLeading) {
    const { value, consumed } = tokenValue(args[0], args[1]);
    leadingRawValue = value;
    afterLeading = args.slice(consumed);
  }

  // Trailing scan is bounded by the same flag-region rule the help scan uses,
  // and is skipped entirely for a command that owns --cwd itself.
  let trailingIndex = -1;
  if (!OWN_CWD.has(afterLeading[0])) {
    const limit = helpScanLimit(afterLeading);
    for (let i = 1; i < limit; i++) {
      if (isCwdToken(afterLeading[i])) {
        trailingIndex = i;
        break;
      }
    }
  }

  if (hasLeading && trailingIndex !== -1) {
    return { args: args.slice(), dir: null, error: '--cwd given twice' };
  }

  if (!hasLeading && trailingIndex === -1) {
    return { args: args.slice(), dir: null, error: null };
  }

  let rawValue;
  let finalArgs;
  if (hasLeading) {
    rawValue = leadingRawValue;
    finalArgs = afterLeading;
  } else {
    const { value, consumed } = tokenValue(afterLeading[trailingIndex], afterLeading[trailingIndex + 1]);
    rawValue = value;
    finalArgs = [
      ...afterLeading.slice(0, trailingIndex),
      ...afterLeading.slice(trailingIndex + consumed),
    ];
  }

  const resolved = resolveDir(rawValue, orig);
  if (resolved.error) return { args: args.slice(), dir: null, error: resolved.error };

  return { args: finalArgs, dir: resolved.dir, error: null };
}

module.exports = { extractCwdFlag, OWN_CWD };
