'use strict';

// stack-detectors.test.cjs — Test list (TRD 35-09)
//
// - D1 detectMarkers({userHome:null}) -> [].
// - D2 fake home with a profile detect: [weird.lock, "*.zz"], languages: [zlang] -> two
//   entries with profile id and languages.
// - D3 Dart-only repo (pubspec.yaml, lib/main.dart, lib/a.dart) -> detectManifest =
//   {has_manifest:true, primary_lang:'dart'}.
// - D4 same repo -> project-state countSourceFiles == 2 and brownfield countSourceFiles == 2.
// - D5 same repo, CLI `init new-project` (spawnSync, cwd=repo, HOME=fake) -> JSON
//   has_existing_code:true, is_brownfield:true.               [Task 2]
// - D6 same repo, CLI `init security-audit` -> stack includes dart.  [Task 2]
// - D7 Kotlin repo (build.gradle.kts, src/A.kt) -> primary_lang kotlin; Swift repo
//   (Package.swift, Sources/a.swift) -> swift.
// - D8 back-compat: package.json + pubspec.yaml -> still javascript (first-match order
//   preserved); go.mod -> go.
// - D9 org-only marker: repo with just weird.lock + fake home profile from D2 ->
//   detectManifest(root,{userHome}) -> {has_manifest:true, primary_lang:'zlang'}; without
//   userHome -> has_manifest:false.
// - D10 brownfield extra ext: *.zz marker -> .zz files counted when the CLI runs with
//   HOME=fake.                                                 [Task 2]
// - D11 the EXTS sets in project-state.cjs and brownfield-detector.cjs are equal.
//
// D5, D6, D10 are added in Task 2 (they exercise init.cjs and the brownfield CLI, which
// Task 1 does not touch).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { detectMarkers } = require('./stack-profile.cjs');
const { detectManifest, countSourceFiles: psCountSourceFiles } = require('./project-state.cjs');
const { countSourceFiles: bfCountSourceFiles } = require('./brownfield-detector.cjs');
const { makeHome, profileMd } = require('./__fixtures__/stack-profile-fixtures.cjs');

// ─── Helpers ────────────────────────────────────────────────────────────────

function mkdtemp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs) {
  for (const dir of dirs) {
    if (!dir) continue;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
  }
}

function writeFiles(root, files) {
  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(root, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  }
}

function dartRepo() {
  const root = mkdtemp('df-dart-repo-');
  writeFiles(root, {
    'pubspec.yaml': 'name: example\n',
    'lib/main.dart': 'void main() {}\n',
    'lib/a.dart': '// a\n',
  });
  return root;
}

// A fake org home whose one profile (`zlang`) declares two `detect` markers — a literal
// filename (`weird.lock`) and a `*.ext` glob (`*.zz`) — with `languages: [zlang]`. Shared by
// D2, D9 and (Task 2) D10, which all exercise this exact profile from different call sites.
function zlangHome() {
  return makeHome({
    stacks: {
      zlang: profileMd({
        yaml: ['schema: 1', 'id: zlang', 'detect: [weird.lock, "*.zz"]', 'languages: [zlang]'].join('\n'),
      }),
    },
  });
}

// ─── D1 ──────────────────────────────────────────────────────────────────────

test('D1: detectMarkers({userHome:null}) -> []', () => {
  assert.deepEqual(detectMarkers({ userHome: null }), []);
});

// ─── D2 ──────────────────────────────────────────────────────────────────────

test('D2: fake-home profile detect markers become {marker, profile, languages} entries', () => {
  const home = zlangHome();
  try {
    const markers = detectMarkers({ userHome: home });
    assert.deepEqual(markers, [
      { marker: 'weird.lock', profile: 'zlang', languages: ['zlang'] },
      { marker: '*.zz', profile: 'zlang', languages: ['zlang'] },
    ]);
  } finally {
    cleanup(home);
  }
});

// ─── D3 ──────────────────────────────────────────────────────────────────────

test('D3: Dart-only repo -> detectManifest has_manifest:true, primary_lang:dart', () => {
  const root = dartRepo();
  try {
    assert.deepEqual(detectManifest(root), { has_manifest: true, primary_lang: 'dart' });
  } finally {
    cleanup(root);
  }
});

// ─── D4 ──────────────────────────────────────────────────────────────────────

test('D4: Dart-only repo -> project-state and brownfield countSourceFiles both == 2', () => {
  const root = dartRepo();
  try {
    assert.equal(psCountSourceFiles(root), 2);
    assert.equal(bfCountSourceFiles(root), 2);
  } finally {
    cleanup(root);
  }
});

// ─── D7 ──────────────────────────────────────────────────────────────────────

test('D7: Kotlin repo -> primary_lang kotlin; Swift repo -> primary_lang swift', () => {
  const kotlinRoot = mkdtemp('df-kotlin-repo-');
  const swiftRoot = mkdtemp('df-swift-repo-');
  try {
    writeFiles(kotlinRoot, { 'build.gradle.kts': '', 'src/A.kt': 'class A\n' });
    writeFiles(swiftRoot, { 'Package.swift': '', 'Sources/a.swift': '// a\n' });
    assert.deepEqual(detectManifest(kotlinRoot), { has_manifest: true, primary_lang: 'kotlin' });
    assert.deepEqual(detectManifest(swiftRoot), { has_manifest: true, primary_lang: 'swift' });
  } finally {
    cleanup(kotlinRoot, swiftRoot);
  }
});

// ─── D8 ──────────────────────────────────────────────────────────────────────

test('D8: back-compat — package.json + pubspec.yaml stays javascript; go.mod stays go', () => {
  const jsRoot = mkdtemp('df-js-plus-dart-');
  const goRoot = mkdtemp('df-go-repo-');
  try {
    writeFiles(jsRoot, { 'package.json': '{}', 'pubspec.yaml': 'name: x\n' });
    writeFiles(goRoot, { 'go.mod': 'module x\n' });
    assert.deepEqual(detectManifest(jsRoot), { has_manifest: true, primary_lang: 'javascript' });
    assert.deepEqual(detectManifest(goRoot), { has_manifest: true, primary_lang: 'go' });
  } finally {
    cleanup(jsRoot, goRoot);
  }
});

// ─── D9 ──────────────────────────────────────────────────────────────────────

test('D9: org-only marker — weird.lock + fake home -> zlang; without userHome -> no manifest', () => {
  const root = mkdtemp('df-org-only-');
  const home = zlangHome();
  try {
    writeFiles(root, { 'weird.lock': '' });
    assert.deepEqual(detectManifest(root, { userHome: home }), { has_manifest: true, primary_lang: 'zlang' });
    assert.deepEqual(detectManifest(root), { has_manifest: false, primary_lang: null });
  } finally {
    cleanup(root, home);
  }
});

// ─── D11 ─────────────────────────────────────────────────────────────────────

test('D11: project-state and brownfield-detector EXTS sets stay identical', () => {
  const psSrc = fs.readFileSync(path.join(__dirname, 'project-state.cjs'), 'utf-8');
  const bfSrc = fs.readFileSync(path.join(__dirname, 'brownfield-detector.cjs'), 'utf-8');
  const extract = (src) => {
    const m = src.match(/const EXTS = new Set\(\[([\s\S]*?)\]\);/);
    assert.ok(m, 'EXTS set not found');
    return m[1].split(',').map((s) => s.trim()).filter(Boolean).sort();
  };
  assert.deepEqual(extract(psSrc), extract(bfSrc));
});
