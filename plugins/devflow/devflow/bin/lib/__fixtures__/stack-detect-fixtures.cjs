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

module.exports = {
  makeTree,
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
