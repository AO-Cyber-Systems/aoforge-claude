'use strict';

// Hand-built repo-shape builders for stack-detect.cjs tests (TRD 42-05).
// Per TDD playbook habit 4 (`no_llm_test_data`): factory functions, not generated test data.
//
// Every shape is INVENTED. The layouts echo the survey in 42-RESEARCH section 6.1/6.2 (a
// multi-area service + admin + portal + chart + python SDK repo, a depth-3 product tree, a Tauri
// app, a C/C++ fork, a docs-only repo, an empty repo), but no directory name, module path or file
// body is copied from a real repository. Each builder writes into its own `fs.mkdtemp` directory
// and returns that absolute root; `cleanup(...roots)` removes them.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

/**
 * makeTree(files) -> absolute root
 *
 * `files` maps a repo-relative path to its content. A key ending in `/` creates an empty
 * directory instead of a file. Parent directories are created as needed.
 */
function makeTree(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-stack-detect-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    if (rel.endsWith('/')) {
      fs.mkdirSync(full, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  }
  return root;
}

function cleanup(...roots) {
  for (const root of roots) {
    if (!root) continue;
    try {
      fs.chmodSync(root, 0o755);
    } catch (_) {
      // best effort
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ─── manifest bodies ──────────────────────────────────────────────────────

function goMod(module) {
  return `module example.invalid/${module}\n\ngo 1.23\n`;
}

// A Flutter package: the `flutter:` dependency carries `sdk: flutter`.
function flutterPubspec(name, { buildRunner = false } = {}) {
  const lines = [
    `name: ${name}`,
    'publish_to: none',
    'environment:',
    '  sdk: ^3.5.0',
    '  flutter: ">=3.24.0"',
    '',
    'dependencies:',
    '  flutter:',
    '    sdk: flutter',
    '  collection: ^1.18.0',
    '',
    'dev_dependencies:',
    '  flutter_test:',
    '    sdk: flutter',
  ];
  if (buildRunner) lines.push('  build_runner: ^2.4.0');
  lines.push('');
  return lines.join('\n');
}

// A pure Dart package: an SDK constraint, no `flutter:` dependency anywhere.
function dartPubspec(name, { buildRunner = false } = {}) {
  const lines = [
    `name: ${name}`,
    'environment:',
    '  sdk: ^3.5.0',
    '',
    'dependencies:',
    '  meta: ^1.15.0',
    '',
    'dev_dependencies:',
    '  test: ^1.25.0',
  ];
  if (buildRunner) lines.push('  build_runner: ^2.4.0');
  lines.push('');
  return lines.join('\n');
}

const PYPROJECT = '[project]\nname = "invented-sdk"\nversion = "0.1.0"\n';
const CARGO = '[package]\nname = "invented-shell"\nversion = "0.1.0"\nedition = "2021"\n';
const PACKAGE_JSON = '{ "name": "invented-desk", "private": true, "scripts": { "build": "vite build" } }\n';
const CHART = 'apiVersion: v2\nname: invented-app\nversion: 0.1.0\n';

// ─── shapes ───────────────────────────────────────────────────────────────

/**
 * multiAreaShape() — a service + two Flutter apps + a chart + a python SDK, no root manifest.
 * Expected areas: '' (kinds [], flag helm), admin/ (flutter, flag maestro), portal/ (flutter),
 * sdk/python/ (python, unsupported), svc/ (go, flag golangci).
 */
function multiAreaShape() {
  return makeTree({
    'README.md': '# invented monorepo\n',
    'svc/go.mod': goMod('svc'),
    'svc/.golangci.yml': 'linters:\n  enable: [govet]\n',
    'svc/cmd/server/main.go': 'package main\n\nfunc main() {}\n',
    'admin/pubspec.yaml': flutterPubspec('invented_admin'),
    'admin/lib/main.dart': 'void main() {}\n',
    'admin/.maestro/login.yaml': 'appId: invented.admin\n---\n- launchApp\n',
    'portal/pubspec.yaml': flutterPubspec('invented_portal'),
    'portal/lib/main.dart': 'void main() {}\n',
    'chart/app/Chart.yaml': CHART,
    'chart/app/templates/deploy.yaml': 'kind: Deployment\n',
    'sdk/python/pyproject.toml': PYPROJECT,
  });
}

/**
 * pureDartSiblingShape() — a Go service, a Flutter app and a pure Dart API client side by side.
 * `api-dart/` must be kind dart, tier dart — never flutter.
 */
function pureDartSiblingShape() {
  return makeTree({
    'server/go.mod': goMod('server'),
    'app/pubspec.yaml': flutterPubspec('invented_app'),
    'api-dart/pubspec.yaml': dartPubspec('invented_api'),
    'api-dart/lib/api.dart': 'library;\n',
  });
}

/**
 * deepNestedShape() — products nested two levels down (marker at path depth 3), plus one
 * marker at path depth 4 that the default walk must NOT reach.
 */
function deepNestedShape() {
  return makeTree({
    'product/go/go.mod': goMod('product'),
    'ai/flutter/pubspec.yaml': flutterPubspec('invented_ai'),
    'too/deep/down/go.mod': goMod('too-deep'),
  });
}

/**
 * skipListShape() — a root Go module and a Flutter app, surrounded by manifests that live only in
 * directories the walk must skip: dependency caches, vendored code, worktrees, a Flutter
 * `example/` package, a platform dir, third-party code, and a nested checkout (a `.git` FILE).
 * Expected areas: '' (go) and flutter_app/ (flutter) — nothing else.
 */
function skipListShape() {
  return makeTree({
    'go.mod': goMod('root'),
    'node_modules/x/go.mod': goMod('nm'),
    'node_modules/y/package.json': PACKAGE_JSON,
    '.worktrees/b/go.mod': goMod('wt'),
    'vendor/example.invalid/dep/go.mod': goMod('vendored'),
    'flutter_app/pubspec.yaml': flutterPubspec('invented_flutter_app'),
    'flutter_app/example/pubspec.yaml': flutterPubspec('invented_example'),
    'flutter_app/ios/Cargo.toml': CARGO,
    'flutter_app/.dart_tool/pkg/pubspec.yaml': dartPubspec('cached'),
    'third_party/lib/go.mod': goMod('tp'),
    'build/pubspec.yaml': dartPubspec('built'),
    'checkout/.git': 'gitdir: /nonexistent/worktrees/checkout\n',
    'checkout/go.mod': goMod('checkout'),
    'nested/.git/HEAD': 'ref: refs/heads/main\n',
    'nested/pyproject.toml': PYPROJECT,
  });
}

/**
 * singleRootGoShape() — one Go module at the root with buf, sqlc and a `//go:generate` directive
 * two directories down. Expected: one area '' with flags buf, go_generate, sqlc.
 */
function singleRootGoShape() {
  return makeTree({
    'go.mod': goMod('single'),
    'buf.yaml': 'version: v2\n',
    'sqlc.yaml': 'version: "2"\n',
    'main.go': 'package main\n\nfunc main() {}\n',
    'internal/spec/spec.go': 'package spec\n\n//go:generate go run ./gen\n',
  });
}

/**
 * generatedGoShape({ headerLine }) — a root Go module with one file carrying the standard
 * generated-code header on line `headerLine` (1-based). The detector reads only the first 5 lines
 * for the header, so line 7 must not count.
 */
function generatedGoShape({ headerLine = 1 } = {}) {
  const lines = [];
  for (let i = 1; i < headerLine; i++) lines.push('// preamble');
  lines.push('// Code generated by invented-gen. DO NOT EDIT.');
  lines.push('package gen');
  return makeTree({
    'go.mod': goMod('gen'),
    'gen/types.go': `${lines.join('\n')}\n`,
  });
}

/** tauriShape() — a desktop shell: package.json + src-tauri/Cargo.toml. Unsupported `tauri`. */
function tauriShape() {
  return makeTree({
    'package.json': PACKAGE_JSON,
    'src/main.ts': 'console.log("hi");\n',
    'src-tauri/Cargo.toml': CARGO,
    'src-tauri/src/main.rs': 'fn main() {}\n',
  });
}

/** cppOnlyShape() — CMake + C++ sources, no language manifest at all. */
function cppOnlyShape() {
  return makeTree({
    'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.20)\nproject(invented CXX)\n',
    'src/main.cpp': 'int main() { return 0; }\n',
    'include/invented.hpp': '#pragma once\n',
  });
}

/** emptyShape() — nothing but an ignore file. */
function emptyShape() {
  return makeTree({ '.gitignore': '*.log\n' });
}

/** docsOnlyShape() — prose only, no manifest, no source. */
function docsOnlyShape() {
  return makeTree({
    'README.md': '# invented research\n',
    'docs/research/notes.md': '# notes\n',
    'docs/poc/sketch.md': '# sketch\n',
  });
}

/**
 * flutterAppShape({ maestro, integration, buildRunner }) — a root Flutter app with its platform
 * dirs (skipped), optionally a `.maestro/` flow dir, an `integration_test/` dir, and build_runner
 * in dev_dependencies.
 */
function flutterAppShape({ maestro = false, integration = false, buildRunner = false } = {}) {
  const files = {
    'pubspec.yaml': flutterPubspec('invented_mobile', { buildRunner }),
    'lib/main.dart': 'void main() {}\n',
    'android/app/build.gradle': '// platform\n',
    'ios/Runner/Info.plist': '<plist/>\n',
    'web/index.html': '<html></html>\n',
    'test/widget_test.dart': 'void main() {}\n',
  };
  if (maestro) files['.maestro/smoke.yaml'] = 'appId: invented.mobile\n---\n- launchApp\n';
  if (integration) files['integration_test/app_test.dart'] = 'void main() {}\n';
  if (buildRunner) files['lib/model.g.dart'] = '// GENERATED CODE - DO NOT MODIFY BY HAND\n';
  return makeTree(files);
}

// ─── git-backed shapes (TRD 42-12) ────────────────────────────────────────
//
// The 42-11 dry run drafted a go component inside a gitignored `dist/<scaffold>/` tree and the
// dir-level `.planning` ignore check missed a rule because the dir held a tracked file. These
// builders reproduce both SHAPES with invented names: `git init -q` in the mkdtemp root, a
// `.gitignore`, and optionally `git add -f` of a file under the ignored dir ("tracked under
// ignored"). Tests that use them skip when `hasGit()` is false.

/** True when a working `git` binary is on PATH. */
function hasGit() {
  const r = spawnSync('git', ['--version'], { stdio: 'ignore' });
  return !r.error && r.status === 0;
}

function git(root, args) {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' });
}

/**
 * makeGitTree(files, { track }) -> absolute root. `makeTree(files)`, then `git init -q`, then
 * `git add -f -- <rel>` for every path in `track` (so it is tracked even under an ignore rule).
 */
function makeGitTree(files = {}, { track = [] } = {}) {
  const root = makeTree(files);
  git(root, ['init', '-q']);
  for (const rel of track) git(root, ['add', '-f', '--', rel]);
  return root;
}

/**
 * gitIgnoredScaffoldShape({ ruleSpelling, trackUnderIgnored, child }) — a root Go module and a
 * Flutter `app/`, plus a Go module at `<dir>/<child>/` where `<dir>` is what `.gitignore`'s one
 * rule (`ruleSpelling`, e.g. `dist/` or `dist`) names. With `trackUnderIgnored` one file under it
 * is force-added. Expected areas: '' (go) and app/ (flutter) — never `<dir>/<child>/`.
 *
 * The default `dist/` + `scaffoldapp` is ALSO caught by the static fallback (both names are on
 * it), so a test that must prove git did the pruning passes a non-fallback rule (`bundle/`) and a
 * non-scaffold child (`svcapp`).
 */
function gitIgnoredScaffoldShape({ ruleSpelling = 'dist/', trackUnderIgnored = true, child = 'scaffoldapp' } = {}) {
  const dir = ruleSpelling.replace(/^\/+/, '').replace(/\/+$/, '');
  const under = `${dir}/${child}`;
  return makeGitTree({
    '.gitignore': `${ruleSpelling}\n`,
    'go.mod': goMod('root'),
    'main.go': 'package main\n\nfunc main() {}\n',
    'app/pubspec.yaml': flutterPubspec('invented_client'),
    'app/lib/main.dart': 'void main() {}\n',
    [`${under}/go.mod`]: goMod(child),
    [`${under}/main.go`]: 'package main\n\nfunc main() {}\n',
  }, { track: trackUnderIgnored ? [`${under}/go.mod`] : [] });
}

/**
 * staticFallbackShape() — NOT a git repo. Go modules in dist/, out/, target/, coverage/,
 * foo-scaffold/ and AppScaffold/ (the name rule is case-insensitive) must all be excluded by the
 * static fallback alone; src/ is kept. Expected areas: ['src/'].
 */
function staticFallbackShape() {
  return makeTree({
    'README.md': '# invented build outputs\n',
    'src/go.mod': goMod('src'),
    'dist/go.mod': goMod('dist'),
    'out/go.mod': goMod('out'),
    'target/go.mod': goMod('target'),
    'coverage/go.mod': goMod('coverage'),
    'foo-scaffold/go.mod': goMod('foo-scaffold'),
    'AppScaffold/pubspec.yaml': flutterPubspec('invented_scaffold'),
  });
}

/**
 * negatedRuleShape({ dir }) — a git repo whose `.gitignore` is `<dir>/*` + `!<dir>/keep/`, a root
 * Go module, and Go modules at `<dir>/keep/` and `<dir>/drop/`. Git keeps `<dir>/` itself and
 * `<dir>/keep/` and ignores `<dir>/drop/`. With the default `gen` expected areas are '' and
 * gen/keep/; with `dir: 'dist'` the static fallback wins and neither dist/ child is an area.
 */
function negatedRuleShape({ dir = 'gen' } = {}) {
  return makeGitTree({
    '.gitignore': `${dir}/*\n!${dir}/keep/\n`,
    'go.mod': goMod('root'),
    [`${dir}/keep/go.mod`]: goMod('keep'),
    [`${dir}/drop/go.mod`]: goMod('drop'),
  });
}

module.exports = {
  makeTree,
  makeGitTree,
  hasGit,
  gitIgnoredScaffoldShape,
  staticFallbackShape,
  negatedRuleShape,
  cleanup,
  goMod,
  flutterPubspec,
  dartPubspec,
  multiAreaShape,
  pureDartSiblingShape,
  deepNestedShape,
  skipListShape,
  singleRootGoShape,
  generatedGoShape,
  tauriShape,
  cppOnlyShape,
  emptyShape,
  docsOnlyShape,
  flutterAppShape,
};
