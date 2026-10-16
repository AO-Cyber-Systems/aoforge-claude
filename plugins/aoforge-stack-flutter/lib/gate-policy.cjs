'use strict';

// The Flutter pack's gate policy for `aof-tools stack verify --run` (objective 77 follow-up).
//
// Core's run guard snapshots the work tree around every gate and restores what a gate changed. A pack
// adds what is specific to its tools: which tools are GUARDED (once any gate in a root has changed
// files, guarded gates are skipped, and outside a git work tree they are refused), extra denials, the
// tool directories to search, and a rewrite that prevents an effect before it happens. Loaded by core
// lib/stack-verify.cjs through the manifest's `gate_policy` field.
//
// Moved verbatim from core (objective 42 rollout lessons): `flutter analyze|test` runs an implicit
// `pub get` that bumps pubspec.lock, so a single direct invocation runs with --no-pub, which needs a
// resolved package config that the guard never creates.

const path = require('path');
const core = require('./core.cjs');

// Tools whose gates rewrite the work tree behind the command's back (`pub get`, lockfiles, analyzer
// options). fvm/puro/melos/very_good/dcm are launchers or Dart-ecosystem drivers for the same tools.
const guardedTools = Object.freeze(['dart', 'flutter', 'fvm', 'puro', 'melos', 'very_good', 'dcm']);

const deny = Object.freeze([
  { re: /\b(?:dart|flutter)\b[^|;&\n]*?\bpub\b[^|;&\n]*?\bpublish\b/, reason: 'pub-publish' },
  { re: /\bflutter\b[^|;&\n]*?\b(?:run|attach)\b/, reason: 'flutter-run' },
]);

/** Home-relative tool directories searched after PATH. */
const binDirs = Object.freeze(['.maestro/bin']);

// A single direct `flutter analyze|test`, optionally behind `VAR=value ` assignments and a path to the binary.
const DIRECT_FLUTTER_GATE = /^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:\S*\/)?flutter\s+(?:analyze|test)(?:\s|$)/;
const SHELL_CONTROL_WORD = /^(?:\|\|?|&&?|;)$/;

/**
 * noPubRewrite(command) -> the command with ` --no-pub` appended, or null when it must run as written.
 * Only a SINGLE DIRECT invocation is rewritten: `flutter analyze` or `flutter test`, optional leading env
 * assignments, no `&&` `;` `|` `&`, no subshell or comment, and no `--pub` / `--no-pub` already (the
 * author's choice stands). A wrapper (`make lint`, `fvm flutter analyze`, `sh -c`) is not rewritten:
 * appending a flag to the wrapper would not reach flutter. `dart analyze|test|format` have no pub flag.
 */
function noPubRewrite(command) {
  const { normalizeScript, splitTopLevel } = core('stack-shell.cjs');
  const text = String(command).trim();
  if (/\n/.test(text) || /(?:^|\s)#/.test(text) || /\\$/.test(text)) return null;
  if (!DIRECT_FLUTTER_GATE.test(text) || splitTopLevel(text).length !== 1) return null;
  const invocations = normalizeScript(text);
  if (invocations.length !== 1) return null;
  const { argv } = invocations[0];
  if (argv.some((w) => w === '--pub' || w === '--no-pub' || w === '--' || SHELL_CONTROL_WORD.test(w))) return null;
  return `${text} --no-pub`;
}

/**
 * Is there a resolved package config for a command run in `cwdAbs`? It sits next to the package's
 * pubspec; a pub-workspace member (`resolution: workspace`, Dart 3.6+) resolves through the workspace
 * root's, so those climb to the repo root.
 */
function packageConfigPresent({ fs, root }, cwdAbs) {
  const has = (dir) => fs.existsSync(path.join(dir, '.dart_tool', 'package_config.json'));
  if (has(cwdAbs)) return true;
  let member = false;
  try { member = /^resolution:\s*workspace\b/m.test(fs.readFileSync(path.join(cwdAbs, 'pubspec.yaml'), 'utf-8')); } catch (_) { /* no pubspec: not a member */ }
  if (!member) return false;
  for (let dir = cwdAbs; dir !== root && dir !== path.dirname(dir);) {
    dir = path.dirname(dir);
    if (has(dir)) return true;
  }
  return false;
}

/**
 * rewrite(command, { cwdAbs, root, fs }) -> null (run as written) | { command } | { skip: { reason, detail } }
 */
function rewrite(command, ctx) {
  const rewritten = noPubRewrite(command);
  if (rewritten === null) return null;
  if (!packageConfigPresent(ctx, ctx.cwdAbs)) {
    return { skip: { reason: 'needs-pub-get', detail: 'flutter --no-pub needs a resolved package config (.dart_tool/package_config.json); run pub get yourself first' } };
  }
  return { command: rewritten };
}

module.exports = { guardedTools, deny, binDirs, rewrite, noPubRewrite, packageConfigPresent };
