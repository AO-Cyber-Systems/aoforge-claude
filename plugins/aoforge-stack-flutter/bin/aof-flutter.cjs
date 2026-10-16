#!/usr/bin/env node
'use strict';

// aof-flutter: the Flutter stack pack's CLI (objective 77). The commands moved here from core
// aof-tools unchanged in shape, so the old `aof-tools verify flutter-ui-eval x` is now
// `aof-flutter verify flutter-ui-eval x`. Run it through the pack mirror:
//
//   node ~/.claude/aoforge/stacks/flutter/bin/aof-flutter.cjs <command> [args] [--raw]
//
//   verify flutter-ui-bootstrap <project-dir>    Flutter UI test infra check
//   verify flutter-state-coverage <trd-path>     state coverage of a TRD's UI artifacts
//   verify flutter-ui-eval <manifest|capture>    the visual-eval judge
//   flutter-ui setup [--print-only] [--auto]             install plan for the UI eval tools
//   flutter-ui eval <manifest|capture>                   alias of verify flutter-ui-eval
//   flutter-ui bootstrap [project-dir]                   scaffold the UI eval manifest
//   flutter-ui design-review <manifest> [--live]         the design critic
//   detect flutter-ui-scope <objective>          does an objective touch a Flutter UI
//   generate uat <objective>                     the objective's UAT checklist
//
// Global `--cwd <dir>` chdirs first, like aof-tools.

const path = require('path');
const lib = path.join(__dirname, '..', 'lib');
const { error } = require(path.join(lib, 'core.cjs'))('helpers.cjs');

const USAGE = 'Usage: aof-flutter <verify flutter-ui-bootstrap|flutter-state-coverage|flutter-ui-eval | flutter-ui setup|eval|bootstrap|design-review | detect flutter-ui-scope | generate uat> [args] [--raw]';

function main() {
  const args = process.argv.slice(2);
  const rawIndex = args.indexOf('--raw');
  const raw = rawIndex !== -1;
  if (raw) args.splice(rawIndex, 1);
  const cwdIndex = args.indexOf('--cwd');
  if (cwdIndex !== -1) {
    const dir = args[cwdIndex + 1];
    if (!dir) error('--cwd needs a directory');
    process.chdir(path.resolve(dir));
    args.splice(cwdIndex, 2);
  }
  const cwd = process.cwd();
  const [command, sub] = args;
  const mod = (name) => require(path.join(lib, name));

  if (command === 'verify' && sub === 'flutter-ui-bootstrap') return mod('flutter-ui-bootstrap.cjs').cmdVerifyFlutterUIBootstrap(cwd, args[2], raw);
  if (command === 'verify' && sub === 'flutter-state-coverage') return mod('flutter-state-coverage.cjs').cmdVerifyFlutterStateCoverage(cwd, args[2], raw);
  if (command === 'verify' && sub === 'flutter-ui-eval') return mod('flutter-ui-eval.cjs').cmdVerifyFlutterUIEval(cwd, args.slice(2), raw);
  if (command === 'flutter-ui' && sub === 'setup') return mod('flutter-ui-setup.cjs').cmdFlutterUISetup(cwd, args.slice(2), raw);
  if (command === 'flutter-ui' && sub === 'eval') return mod('flutter-ui-eval.cjs').cmdVerifyFlutterUIEval(cwd, args.slice(2), raw);
  if (command === 'flutter-ui' && sub === 'bootstrap') return mod('flutter-ui-eval-bootstrap.cjs').cmdFlutterUIEvalBootstrap(cwd, args[2], raw, args.slice(2));
  if (command === 'flutter-ui' && sub === 'design-review') return mod('flutter-ui-design-review.cjs').cmdDesignReview(cwd, args.slice(2), raw);
  if (command === 'detect' && sub === 'flutter-ui-scope') return mod('flutter-ui-scope.cjs').cmdDetectFlutterUIScope(cwd, args[2], raw);
  if (command === 'generate' && sub === 'uat') return mod('uat-generator.cjs').cmdGenerateUAT(cwd, args[2], raw);
  if (command === '--help' || command === 'help' || !command) {
    process.stdout.write(USAGE + '\n');
    return;
  }
  error(`Unknown command: ${args.join(' ')}\n${USAGE}`);
}

main();
