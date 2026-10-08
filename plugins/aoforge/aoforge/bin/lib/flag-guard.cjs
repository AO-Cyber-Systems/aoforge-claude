'use strict';

/**
 * The unknown-flag checker (TRD 68-03, TOOL-01). Pure: it reads an argv and a spec and returns a verdict. It does no
 * I/O and never exits; the dispatcher (`aof-tools.cjs` `main()`) prints the verdict and exits 1.
 *
 * Why this is structural. Most commands that write used to ignore a flag they did not know and carry on writing:
 * `aof-tools milestone complete v1.0 --dry-runn` archived the milestone. Fixing that per command leaves the next command
 * added unguarded, which is exactly how `--help` was taken as a commit message before issue #87. So, as for `--help`, it
 * is answered ONCE, in the dispatcher, before any subcommand runs: a declarative spec (`flag-spec.cjs` `FLAG_SPEC`) lists
 * what each writing command accepts, this module walks argv and stops at the first `--flag` the spec does not accept,
 * and nothing has run by then, so nothing was written.
 *
 * Spec shape: `command -> rule` or `command -> { subcommands: { name -> rule }, default?: rule }`.
 *
 * A rule is `{ values?, bools?, anyFlags?, ownParser?, tailFrom?, reason? }`:
 *   values     flags that take the next token (or `=value`); that token is consumed, even if it looks like a flag;
 *   bools      flags that take no value;
 *   anyFlags   every `--x` is accepted; needs a `reason` (e.g. `state patch --<field> <value>` names arbitrary fields);
 *   ownParser  the command's own parser already rejects unknown flags; needs a `reason`;
 *   tailFrom   the argv index from which tokens are carried to something else, not read here; needs a `reason`.
 * `anyFlags`, `ownParser` and `tailFrom` switch the check off (in whole or in part), so each states why. This module does
 * not enforce the `reason`; the repo test that keeps the spec complete does (TRD 68-05).
 *
 * What is checked. Only tokens that start with `--` are flags: positionals, words and single-dash tokens (`-h`, `-5`) are
 * never checked. A literal `--` ends the check. `--raw`, `--help` and `--cwd` are accepted everywhere (`--cwd` takes a
 * value). A subcommand the spec does not list is not reported, so the dispatcher's own "Unknown ... subcommand" error stays
 * in charge. A flag where the subcommand would go (`milestone --zz`) is checked against the command's `default` rule.
 */

const GLOBAL_FLAGS = new Set(['--raw', '--help', '--cwd']);

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/** The rule that governs `args`, its label and the argv index at which flags start; null when the spec is silent. */
function resolveRule(args, spec) {
  const command = args[0];
  if (typeof command !== 'string' || !hasOwn(spec, command)) return null;
  const entry = spec[command];
  if (!entry.subcommands) return { rule: entry, label: command, start: 1 };

  const sub = args[1];
  if (sub === undefined || (typeof sub === 'string' && sub.startsWith('--'))) {
    return { rule: entry.default || {}, label: command, start: 1 };
  }
  if (typeof sub !== 'string' || !hasOwn(entry.subcommands, sub)) return null;
  return { rule: entry.subcommands[sub], label: `${command} ${sub}`, start: 2 };
}

/**
 * checkFlags(args, spec) -> null | { flag, label, accepted }
 *
 * `args` is the dispatcher's argv after `--raw` and `--cwd` were taken out (`args[0]` is the command). Returns null when
 * every flag is accepted (or the spec says nothing about this command), else the FIRST unknown flag with the label of the
 * command or subcommand it was found under and the sorted list of flags that entry accepts.
 */
function checkFlags(args, spec) {
  const found = resolveRule(args, spec);
  if (!found) return null;
  const { rule, label, start } = found;
  if (rule.anyFlags || rule.ownParser) return null;

  const values = rule.values || [];
  const bools = rule.bools || [];
  const end = Number.isInteger(rule.tailFrom) ? Math.min(rule.tailFrom, args.length) : args.length;

  for (let i = start; i < end; i++) {
    const token = args[i];
    if (typeof token !== 'string') continue;
    if (token === '--') break;
    if (!token.startsWith('--')) continue;

    const eq = token.indexOf('=');
    const inline = eq !== -1;
    const name = inline ? token.slice(0, eq) : token;

    if (GLOBAL_FLAGS.has(name)) {
      if (name === '--cwd' && !inline) i += 1;
      continue;
    }
    if (values.includes(name)) {
      if (!inline) i += 1;
      continue;
    }
    if (bools.includes(name)) continue;

    return { flag: name, label, accepted: [...new Set([...values, ...bools])].sort() };
  }
  return null;
}

/** The error message for a checkFlags verdict (the dispatcher prefixes `Error: `). */
function formatUnknownFlag(result) {
  const accepted = result.accepted.length > 0
    ? `(accepted: ${result.accepted.join(', ')})`
    : '(it takes no flags)';
  return `unknown flag ${result.flag} for \`${result.label}\`; nothing was written ${accepted}`;
}

module.exports = { checkFlags, formatUnknownFlag };
