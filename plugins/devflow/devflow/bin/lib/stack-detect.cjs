'use strict';

// stack-detect.cjs — codebase area detection for the stack drafter (TRD 42-05, SDR-01).
//
// `detectAreas(root)` walks a repository to a bounded depth and reports its LANGUAGE AREAS: the
// directories holding a language manifest (go.mod, pubspec.yaml, package.json, ...), each with
// the tier-2 profile it would extend. Non-language markers (a Helm chart, a Dockerfile, buf,
// sqlc, golangci, Maestro flows, integration_test/, build_runner, `//go:generate`, generated-code
// headers) never become areas of their own: they are FLAGS on the nearest enclosing language
// area, or on the root when no language area encloses them.
//
// This module MAY name languages. Like the three existing detectors (project-state.cjs, init.cjs,
// brownfield-detector.cjs) it is detection data, which is exactly what stack-profile.cjs and
// stack-render.cjs must stay free of (P11 / C14). Its consumers are the drafter (42-07: areas
// become `components`) and the recommendations report (42-08: checks apply per area).
//
// Pure Dart vs Flutter reuses flutter-ui-scope's `detectPubspecFlutter` — the one shared test for
// "this pubspec depends on the Flutter SDK". There is deliberately no second pubspec regex here.

const fs = require('fs');
const path = require('path');
const { detectPubspecFlutter } = require('./flutter-ui-scope.cjs');

// ─── marker data ──────────────────────────────────────────────────────────

const AREA_MARKERS = Object.freeze({
  // A language area is a directory holding one of these files. `tier` is the bundled tier-2
  // profile id the area extends; `null` means no tier-2 profile exists for that language (locked
  // decision Q6), so the area is reported `unsupported`. A pubspec.yaml is `dart` unless
  // detectPubspecFlutter fires on it, in which case it is `flutter` (see `refine`).
  languages: [
    { kind: 'go', files: ['go.mod', 'go.work'], tier: 'go' },
    { kind: 'dart', files: ['pubspec.yaml'], tier: 'dart', refine: 'pubspec' },
    { kind: 'flutter', files: [], tier: 'flutter' },
    { kind: 'node', files: ['package.json'], tier: null },
    { kind: 'rust', files: ['Cargo.toml'], tier: null },
    { kind: 'python', files: ['pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile'], tier: null },
  ],
  // Non-language markers: a file (exact name or `pattern`) or a directory entry.
  flags: [
    { flag: 'helm', files: ['Chart.yaml'] },
    { flag: 'docker', pattern: /^Dockerfile(\..+)?$|\.Dockerfile$/ },
    { flag: 'buf', files: ['buf.yaml', 'buf.gen.yaml', 'buf.work.yaml'] },
    { flag: 'sqlc', files: ['sqlc.yaml', 'sqlc.yml', 'sqlc.json'] },
    { flag: 'golangci', files: ['.golangci.yml', '.golangci.yaml', '.golangci.toml', '.golangci.json'] },
    { flag: 'analysis_options', files: ['analysis_options.yaml'] },
    { flag: 'maestro', dirs: ['.maestro'] },
    { flag: 'integration_test', dirs: ['integration_test'] },
  ],
  // `package.json` + `src-tauri/Cargo.toml` in the same directory is one Tauri app, not a node
  // area plus a rust area.
  tauri: { dir: 'src-tauri', file: 'Cargo.toml' },
  // A repo with NO language area but C/C++ build files or sources gets a root `cpp` note.
  cpp: {
    files: ['CMakeLists.txt', 'meson.build', 'configure.ac'],
    exts: ['.c', '.cc', '.cpp', '.cxx', '.hpp', '.hh'],
  },
  // Which name an unsupported area reports when it carries several tier-less kinds.
  unsupportedOrder: ['python', 'rust', 'node'],
  // Generated code. Go's header is the standard `// Code generated ... DO NOT EDIT.` line and is
  // looked for only in a file's first 5 lines; Dart codegen is recognised by file suffix.
  generated: {
    goHeader: /^\/\/ Code generated .* DO NOT EDIT\.$/,
    headerLines: 5,
    dartSuffixes: ['.g.dart', '.freezed.dart', '.gr.dart', '.mocks.dart'],
  },
  goGenerate: /^\/\/go:generate\s/m,
});

// Directories the walk never enters. Every other dot-directory is skipped as well (a `.maestro/`
// is still SEEN as an entry of its parent; it is just never descended into).
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.dart_tool', 'build', 'vendor', 'third_party', '.worktrees', '.planning',
  'example', 'test_support', 'android', 'ios', 'macos', 'linux', 'windows', 'web',
]);

const KIND_ORDER = AREA_MARKERS.languages.map((l) => l.kind);
const TIER_BY_KIND = Object.fromEntries(AREA_MARKERS.languages.map((l) => [l.kind, l.tier]));

// Bounds for the second, deeper pass that looks inside source files.
const MAX_GO_FILES = 200;
const MAX_DEEP_DIRS = 4000;
const MAX_DEEP_DEPTH = 8;
const MAX_READ_BYTES = 256 * 1024;
const MAX_CPP_EVIDENCE = 5;

// ─── helpers ──────────────────────────────────────────────────────────────

function readDirSafe(abs) {
  try {
    return fs.readdirSync(abs, { withFileTypes: true });
  } catch (_) {
    return null;
  }
}

function readTextSafe(abs, maxBytes = MAX_READ_BYTES) {
  let fd = null;
  try {
    fd = fs.openSync(abs, 'r');
    const size = Math.min(fs.fstatSync(fd).size, maxBytes);
    const buf = Buffer.alloc(size);
    const n = size > 0 ? fs.readSync(fd, buf, 0, size, 0) : 0;
    return buf.subarray(0, n).toString('utf-8');
  } catch (_) {
    return null;
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch (_) { /* already closed */ }
    }
  }
}

// True when the walk may enter `name` under `parentAbs`: not on the skip list, not a
// dot-directory, and not a nested checkout (a `.git` FILE marks a worktree, a `.git` DIRECTORY a
// nested repository — either way it is somebody else's tree).
function mayDescend(parentAbs, name) {
  if (SKIP_DIRS.has(name) || name.startsWith('.')) return false;
  return !fs.existsSync(path.join(parentAbs, name, '.git'));
}

// `build_runner` listed under the pubspec's `dev_dependencies:` block. A line scan, not a YAML
// parse: the block runs until the next unindented line.
function hasBuildRunnerDevDep(pubspec) {
  const lines = String(pubspec).split(/\r?\n/);
  let inDev = false;
  for (const line of lines) {
    if (/^dev_dependencies\s*:/.test(line)) { inDev = true; continue; }
    if (inDev && /^\S/.test(line)) inDev = false;
    if (inDev && /^\s+build_runner\s*:/.test(line)) return true;
  }
  return false;
}

// ─── detectAreas ──────────────────────────────────────────────────────────

/**
 * detectAreas(root, { maxDepth = 3 }) -> [{ dir, kinds, tier, evidence, flags, unsupported? }]
 *
 * - `dir` is `''` for the repo root, else a repo-relative path with a TRAILING SLASH (`svc/`,
 *   `product/go/`) — stack-profile's `matchComponent` is a prefix match, so `go/` must never be
 *   written as `go` (which would also match `gopher/x`).
 * - `kinds` lists the area's languages in AREA_MARKERS order (`go`, `dart`, `flutter`, `node`,
 *   `rust`, `python`); `[]` for a root entry that only carries flags or a `cpp` note.
 * - `tier` is the tier-2 profile id (`go` | `dart` | `flutter`) or null.
 * - `evidence` lists the repo-relative files that produced the kinds and flags.
 * - `flags` is sorted; an area with no tier also carries the `unsupported` flag and an
 *   `unsupported` field naming what it is (`python` | `rust` | `node` | `tauri` | `cpp`).
 *
 * The walk reads directories at depth < maxDepth (root = 0), so a manifest at path depth 3
 * (`product/go/go.mod`) is found and one at depth 4 is not. Returns entries sorted by `dir`;
 * `[]` for an empty, docs-only, missing or unreadable root. Never throws on an unreadable dir.
 */
function detectAreas(root, { maxDepth = 3 } = {}) {
  const records = new Map();
  const recordFor = (dir) => {
    if (!records.has(dir)) {
      records.set(dir, { dir, kinds: new Set(), evidence: [], flags: new Set(), tauri: false, unsupported: null });
    }
    return records.get(dir);
  };
  const flagHits = [];
  const cppHits = [];

  // ── pass 1: the bounded walk over manifests and marker entries ──
  const walk = (abs, rel, depth) => {
    const entries = readDirSafe(abs);
    if (!entries) return;
    const files = new Set(entries.filter((e) => !e.isDirectory()).map((e) => e.name));
    const dirs = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
    const noDescend = new Set();

    for (const lang of AREA_MARKERS.languages) {
      for (const file of lang.files) {
        if (!files.has(file)) continue;
        let kind = lang.kind;
        if (lang.refine === 'pubspec') {
          const content = readTextSafe(path.join(abs, file)) || '';
          if (detectPubspecFlutter(content).fired) kind = 'flutter';
          if (hasBuildRunnerDevDep(content)) flagHits.push({ at: rel, flag: 'build_runner', file: rel + file });
        }
        const rec = recordFor(rel);
        rec.kinds.add(kind);
        rec.evidence.push(rel + file);
      }
    }

    const { tauri } = AREA_MARKERS;
    if (files.has('package.json') && dirs.has(tauri.dir) && fs.existsSync(path.join(abs, tauri.dir, tauri.file))) {
      const rec = recordFor(rel);
      rec.kinds.add('rust');
      rec.evidence.push(`${rel}${tauri.dir}/${tauri.file}`);
      rec.tauri = true;
      noDescend.add(tauri.dir);
    }

    for (const marker of AREA_MARKERS.flags) {
      for (const name of files) {
        const hit = (marker.files && marker.files.includes(name)) || (marker.pattern && marker.pattern.test(name));
        if (hit) flagHits.push({ at: rel, flag: marker.flag, file: rel + name });
      }
      for (const name of marker.dirs || []) {
        if (dirs.has(name)) flagHits.push({ at: rel, flag: marker.flag, file: `${rel}${name}/` });
      }
    }

    for (const name of files) {
      const isCpp = AREA_MARKERS.cpp.files.includes(name) || AREA_MARKERS.cpp.exts.includes(path.extname(name));
      if (isCpp) cppHits.push(rel + name);
    }

    if (depth + 1 >= maxDepth) return;
    for (const name of [...dirs].sort()) {
      if (noDescend.has(name) || !mayDescend(abs, name)) continue;
      walk(path.join(abs, name), `${rel}${name}/`, depth + 1);
    }
  };
  walk(root, '', 0);

  // The language areas, longest dir first, so the first prefix match is the nearest enclosing one.
  const languageDirs = () => [...records.values()]
    .filter((r) => r.kinds.size > 0)
    .map((r) => r.dir)
    .sort((a, b) => b.length - a.length);
  const nearest = (rel, accept = () => true) => {
    for (const dir of languageDirs()) {
      if (rel.startsWith(dir) && accept(records.get(dir))) return dir;
    }
    return null;
  };

  for (const hit of flagHits) {
    const dir = nearest(hit.at);
    const rec = recordFor(dir === null ? '' : dir);
    rec.flags.add(hit.flag);
    rec.evidence.push(hit.file);
  }

  // ── pass 2: a deeper, bounded look inside sources for codegen ──
  const hasKind = (...kinds) => (rec) => kinds.some((k) => rec.kinds.has(k));
  if ([...records.values()].some(hasKind('go', 'dart', 'flutter'))) {
    scanSources(root, {
      onGo: (rel, text) => {
        const dir = nearest(rel, hasKind('go'));
        if (dir === null) return;
        const rec = records.get(dir);
        const head = text.split(/\r?\n/, AREA_MARKERS.generated.headerLines);
        if (!rec.flags.has('generated') && head.some((l) => AREA_MARKERS.generated.goHeader.test(l))) {
          rec.flags.add('generated');
          rec.evidence.push(rel);
        }
        if (!rec.flags.has('go_generate') && AREA_MARKERS.goGenerate.test(text)) {
          rec.flags.add('go_generate');
          rec.evidence.push(rel);
        }
      },
      onDartGenerated: (rel) => {
        const dir = nearest(rel, hasKind('dart', 'flutter'));
        if (dir === null) return;
        const rec = records.get(dir);
        if (!rec.flags.has('generated')) {
          rec.flags.add('generated');
          rec.evidence.push(rel);
        }
      },
    });
  }

  // ── tiers and unsupported notes ──
  for (const rec of records.values()) {
    if (rec.kinds.size === 0) continue;
    const kinds = KIND_ORDER.filter((k) => rec.kinds.has(k));
    const tiered = kinds.find((k) => TIER_BY_KIND[k]);
    if (tiered) continue;
    rec.unsupported = rec.tauri ? 'tauri' : AREA_MARKERS.unsupportedOrder.find((k) => rec.kinds.has(k)) || kinds[0];
    rec.flags.add('unsupported');
  }

  const anyLanguage = [...records.values()].some((r) => r.kinds.size > 0);
  if (!anyLanguage && cppHits.length) {
    const rec = recordFor('');
    rec.unsupported = 'cpp';
    rec.flags.add('unsupported');
    const buildFirst = cppHits
      .slice()
      .sort((a, b) => Number(!AREA_MARKERS.cpp.files.includes(path.basename(a))) - Number(!AREA_MARKERS.cpp.files.includes(path.basename(b))));
    rec.evidence.push(...buildFirst.slice(0, MAX_CPP_EVIDENCE));
  }

  return [...records.values()]
    .filter((r) => r.kinds.size > 0 || r.flags.size > 0 || r.unsupported)
    .map((r) => {
      const kinds = KIND_ORDER.filter((k) => r.kinds.has(k));
      const tieredKind = kinds.find((k) => TIER_BY_KIND[k]);
      const area = {
        dir: r.dir,
        kinds,
        tier: tieredKind ? TIER_BY_KIND[tieredKind] : null,
        evidence: [...new Set(r.evidence)],
        flags: [...r.flags].sort(),
      };
      if (r.unsupported) area.unsupported = r.unsupported;
      return area;
    })
    .sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

// Breadth-first over the repo (same skip rules as pass 1, deeper), handing each `.go` file's text
// (at most MAX_GO_FILES of them) and each Dart codegen file's path to the callbacks. Shallow files
// come first, so the budget is spent where the module roots are.
function scanSources(root, { onGo, onDartGenerated }) {
  const queue = [{ abs: root, rel: '', depth: 0 }];
  let goRead = 0;
  let dirsSeen = 0;
  const { dartSuffixes } = AREA_MARKERS.generated;

  while (queue.length && dirsSeen < MAX_DEEP_DIRS) {
    const { abs, rel, depth } = queue.shift();
    dirsSeen += 1;
    const entries = readDirSafe(abs);
    if (!entries) continue;
    for (const e of entries.slice().sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.isDirectory()) {
        if (depth + 1 <= MAX_DEEP_DEPTH && mayDescend(abs, e.name)) {
          queue.push({ abs: path.join(abs, e.name), rel: `${rel}${e.name}/`, depth: depth + 1 });
        }
        continue;
      }
      if (e.name.endsWith('.go') && goRead < MAX_GO_FILES) {
        goRead += 1;
        const text = readTextSafe(path.join(abs, e.name));
        if (text !== null) onGo(rel + e.name, text);
      } else if (dartSuffixes.some((s) => e.name.endsWith(s))) {
        onDartGenerated(rel + e.name);
      }
    }
  }
}

module.exports = {
  detectAreas,
  AREA_MARKERS,
  SKIP_DIRS,
};
