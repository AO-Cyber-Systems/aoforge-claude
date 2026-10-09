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
//
// Ignored directories (TRD 42-12, gap G1). A gitignored build output such as `dist/<scaffold>/`
// once became a drafted component. Two filters now keep such trees out, and both PRUNE — an
// ignored dir is never listed, so a huge ignored `dist/` is never walked:
//   - a static fallback, always applied: IGNORED_DIR_FALLBACK names plus any dir whose name
//     contains `scaffold` (case-insensitive). Outside a git work tree, or when git is missing or
//     fails, it is the only filter.
//   - in a git work tree, `git check-ignore --no-index --stdin -z`, ONE spawn per breadth-first
//     level carrying every candidate dir of that level. `--no-index` because the default,
//     index-aware check calls a dir "not ignored" as soon as it holds a tracked file (the
//     `.aoforge` miss). Dirs are queried BARE (`dist/app`, no trailing slash): git lstat()s the
//     path, so a dir-only rule (`dist/`) still matches, while a trailing slash makes `x/*` match
//     `x/` itself and would wrongly prune `x/keep/` under `x/*` + `!x/keep/`.
// Pass 1 is therefore planned breadth-first (one batch per level), then processed depth-first
// over the cached listings exactly as before; pass 2 (codegen) is breadth-first already and
// batches per level too. Decisions are cached per call, so no dir is ever asked about twice.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { detectPubspecFlutter } = require('./flutter-ui-scope.cjs');
const { PLANNING_DIR_NAMES } = require('./compat.cjs');

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
  'node_modules', '.git', '.dart_tool', 'build', 'vendor', 'third_party', '.worktrees', ...PLANNING_DIR_NAMES,
  'example', 'test_support', 'android', 'ios', 'macos', 'linux', 'windows', 'web',
]);

// Build outputs, caches and scaffolding that are ignored in practice whether or not a
// `.gitignore` says so (TRD 42-12). Always applied; the only filter outside a git work tree.
const IGNORED_DIR_FALLBACK = Object.freeze(['dist', 'build', 'out', 'vendor', 'node_modules', '.dart_tool', 'target', 'coverage']);
const IGNORED_FALLBACK_SET = new Set(IGNORED_DIR_FALLBACK);
const SCAFFOLD_NAME = /scaffold/i;

// Bounds for the git ignore filter: a stuck git must never hang detection.
const GIT_TIMEOUT_MS = 15000;
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

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

// True when the walk may enter `name` under `parentAbs`: not on the skip list or the static
// ignore fallback, not a scaffold dir, not a dot-directory, and not a nested checkout (a `.git`
// FILE marks a worktree, a `.git` DIRECTORY a nested repository — either way it is somebody
// else's tree). The git ignore filter is applied on top of this, per level (see makeDirFilter).
function mayDescend(parentAbs, name) {
  if (SKIP_DIRS.has(name) || IGNORED_FALLBACK_SET.has(name) || SCAFFOLD_NAME.test(name) || name.startsWith('.')) return false;
  return !fs.existsSync(path.join(parentAbs, name, '.git'));
}

// The Tauri shell dir (`src-tauri`) of a dir holding package.json + src-tauri/Cargo.toml, else
// null. Pass 1 folds it into the parent's area and never descends into it.
function tauriDirOf(abs, entries) {
  const { tauri } = AREA_MARKERS;
  const hasPackage = entries.some((e) => !e.isDirectory() && e.name === 'package.json');
  const hasShell = entries.some((e) => e.isDirectory() && e.name === tauri.dir);
  return hasPackage && hasShell && fs.existsSync(path.join(abs, tauri.dir, tauri.file)) ? tauri.dir : null;
}

// ─── ignore filter ────────────────────────────────────────────────────────

// Per-root memo of "is this root inside a git work tree" — the probe is the only spawn that is
// not a check-ignore batch, and a draft calls detectAreas several times for one root.
const WORK_TREE_CACHE = new Map();

/**
 * defaultIsIgnored(root) -> ((rels: string[]) => string[]) | null
 *
 * null when `root` is not inside a git work tree or git cannot run. Otherwise a BATCH filter:
 * given repo-relative dirs (`svc/`, `dist/app/`) it returns the subset git ignores, from ONE
 * `git -C root check-ignore --no-index --stdin -z` spawn (exit 1 = none ignored, not an error).
 * Throws on a spawn failure or any other exit; detectAreas catches that and falls back to static.
 */
function defaultIsIgnored(root) {
  const key = path.resolve(String(root));
  let inside = WORK_TREE_CACHE.get(key);
  if (inside === undefined) {
    const probe = spawnSync('git', ['-C', key, 'rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: GIT_TIMEOUT_MS,
    });
    inside = !probe.error && probe.status === 0 && String(probe.stdout).trim() === 'true';
    WORK_TREE_CACHE.set(key, inside);
  }
  if (!inside) return null;

  const isIgnored = (rels) => {
    const list = [...(rels || [])].map(String);
    if (!list.length) return [];
    // Bare paths: git lstat()s each one, so dir-only rules still match (see the header).
    const bare = list.map((r) => r.replace(/\/+$/, ''));
    const r = spawnSync('git', ['-C', key, 'check-ignore', '--no-index', '--stdin', '-z'], {
      input: `${bare.join('\0')}\0`, stdio: ['pipe', 'pipe', 'ignore'], timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER,
    });
    if (r.error || (r.status !== 0 && r.status !== 1)) {
      throw new Error(`git check-ignore failed (${r.error ? r.error.code || r.error.message : `exit ${r.status}`})`);
    }
    const hits = new Set(String(r.stdout).split('\0').filter(Boolean));
    return list.filter((_, i) => hits.has(bare[i]));
  };
  isIgnored.ignoreSource = 'git';
  return isIgnored;
}

// Wraps a batch `isIgnored` (or null) into `admit(rels) -> Set<kept rel>`, remembering every
// decision so a dir is asked about at most once per detectAreas call and an empty batch never
// spawns. The static fallback is NOT applied here — callers only offer dirs mayDescend accepted.
// A throwing filter is dropped for the rest of the call (static only from then on).
function makeDirFilter(isIgnored, source) {
  const ignored = new Map();
  let fn = typeof isIgnored === 'function' ? isIgnored : null;
  let src = fn ? source : 'static';
  return {
    admit(rels) {
      const unknown = rels.filter((r) => !ignored.has(r));
      if (fn && unknown.length) {
        let hits = null;
        try {
          hits = new Set(fn(unknown) || []);
        } catch (_) {
          fn = null;
          src = 'static';
        }
        if (hits) for (const r of unknown) ignored.set(r, hits.has(r));
      }
      return new Set(rels.filter((r) => !ignored.get(r)));
    },
    get source() {
      return src;
    },
  };
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
 * detectAreas(root, { maxDepth = 3, isIgnored }) -> [{ dir, kinds, tier, evidence, flags, unsupported? }]
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
 *
 * `isIgnored` (TRD 42-12) is a batch filter `(rels: string[]) -> Iterable<rel>` returning the
 * ignored subset. Omitted: defaultIsIgnored(root) (git in a work tree, else static only); `null`:
 * static fallback only; a function: used as given. It is called at most once per level with that
 * level's candidates, and an ignored dir is pruned before anything inside it is read. The array
 * carries a NON-enumerable `ignore_source`: 'git' | 'static' | 'custom' (debugging only; the
 * return shape is unchanged for JSON and deepEqual).
 */
function detectAreas(root, { maxDepth = 3, isIgnored } = {}) {
  let filterFn = null;
  let filterSource = 'static';
  if (isIgnored === undefined) {
    try {
      filterFn = defaultIsIgnored(root);
    } catch (_) {
      filterFn = null;
    }
    if (filterFn) filterSource = 'git';
  } else if (typeof isIgnored === 'function') {
    filterFn = isIgnored;
    filterSource = isIgnored.ignoreSource || 'custom';
  }
  const filter = makeDirFilter(filterFn, filterSource);

  // ── pass 0: plan the bounded walk breadth-first, one ignore batch per level ──
  // `listing` holds the entries of every dir pass 1 may visit; a pruned dir is never listed.
  const listing = new Map();
  let level = [{ abs: root, rel: '' }];
  for (let depth = 0; level.length; depth += 1) {
    const next = [];
    for (const node of level) {
      const entries = readDirSafe(node.abs);
      listing.set(node.rel, entries);
      if (!entries || depth + 1 >= maxDepth) continue;
      const shell = tauriDirOf(node.abs, entries);
      const names = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
      for (const name of names) {
        if (name === shell || !mayDescend(node.abs, name)) continue;
        next.push({ abs: path.join(node.abs, name), rel: `${node.rel}${name}/` });
      }
    }
    const kept = filter.admit(next.map((n) => n.rel));
    level = next.filter((n) => kept.has(n.rel));
  }

  const records = new Map();
  const recordFor = (dir) => {
    if (!records.has(dir)) {
      records.set(dir, { dir, kinds: new Set(), evidence: [], flags: new Set(), tauri: false, unsupported: null });
    }
    return records.get(dir);
  };
  const flagHits = [];
  const cppHits = [];

  // ── pass 1: the bounded walk over manifests and marker entries (planned dirs only) ──
  const walk = (abs, rel, depth) => {
    const entries = listing.get(rel);
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
      const childRel = `${rel}${name}/`;
      if (noDescend.has(name) || !listing.has(childRel)) continue;
      walk(path.join(abs, name), childRel, depth + 1);
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
      admit: (rels) => filter.admit(rels),
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

  const result = [...records.values()]
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
  Object.defineProperty(result, 'ignore_source', { value: filter.source, enumerable: false });
  return result;
}

// Breadth-first over the repo (same skip rules as pass 1, deeper), handing each `.go` file's text
// (at most MAX_GO_FILES of them) and each Dart codegen file's path to the callbacks. Shallow files
// come first, so the budget is spent where the module roots are. Each level's candidate dirs go
// through ONE `admit` batch (the ignore filter) before any of them is read.
function scanSources(root, { onGo, onDartGenerated, admit = (rels) => new Set(rels) }) {
  let level = [{ abs: root, rel: '', depth: 0 }];
  let goRead = 0;
  let dirsSeen = 0;
  const { dartSuffixes } = AREA_MARKERS.generated;

  while (level.length && dirsSeen < MAX_DEEP_DIRS) {
    const next = [];
    for (const { abs, rel, depth } of level) {
      if (dirsSeen >= MAX_DEEP_DIRS) break;
      dirsSeen += 1;
      const entries = readDirSafe(abs);
      if (!entries) continue;
      for (const e of entries.slice().sort((a, b) => (a.name < b.name ? -1 : 1))) {
        if (e.isDirectory()) {
          if (depth + 1 <= MAX_DEEP_DEPTH && mayDescend(abs, e.name)) {
            next.push({ abs: path.join(abs, e.name), rel: `${rel}${e.name}/`, depth: depth + 1 });
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
    if (dirsSeen >= MAX_DEEP_DIRS) break;
    const kept = admit(next.map((n) => n.rel));
    level = next.filter((n) => kept.has(n.rel));
  }
}

// ─── command cwd hygiene (TRD 42-14, D2 + D4) ─────────────────────────────

/**
 * defaultLsFiles(root) -> ((dirs: string[]) => string[]) | null
 *
 * null outside a git work tree. Otherwise ONE `git -C root ls-files -z -- ':(glob)*' <dirs>`
 * spawn: the tracked files under the given dirs PLUS the tracked top-level files (the `:(glob)*`
 * pathspec never crosses a `/`), so the caller can tell "this dir holds no tracked file" from "this
 * repo tracks nothing yet". Dirs are `:(literal)` pathspecs. Throws on a spawn failure.
 */
function defaultLsFiles(root) {
  const key = path.resolve(String(root));
  if (!defaultIsIgnored(key)) return null; // not a work tree (the probe is memoised there)
  return (dirs) => {
    const specs = [':(glob)*', ...[...(dirs || [])].map((d) => `:(literal)${String(d).replace(/\/+$/, '')}`)];
    const r = spawnSync('git', ['-C', key, 'ls-files', '-z', '--', ...specs], {
      stdio: ['ignore', 'pipe', 'ignore'], timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER,
    });
    if (r.error || r.status !== 0) {
      throw new Error(`git ls-files failed (${r.error ? r.error.code || r.error.message : `exit ${r.status}`})`);
    }
    return String(r.stdout).split('\0').filter(Boolean);
  };
}

/** A clean repo-relative posix dir; '' for the root; null when it escapes the root or is absolute. */
function cleanCwd(cwd) {
  if (cwd === null || cwd === undefined) return '';
  const raw = String(cwd).replace(/\\/g, '/').trim();
  if (raw === '') return '';
  if (raw.startsWith('/')) return null;
  const n = path.posix.normalize(raw).replace(/\/+$/, '');
  if (n === '.' || n === '') return '';
  if (n === '..' || n.startsWith('../')) return null;
  return n;
}

/**
 * cwdHygiene(root, { isIgnored, lsFiles }) -> status(cwd) with `status.prime(cwds)`
 *
 * Whether a command's repo-relative cwd is a real, tracked, non-ignored directory of THIS repo:
 *   ok          the root, or a directory that passes every check below
 *   external    absolute, or escapes the root (`../x`) — not this repo
 *   missing     not a directory under the root
 *   nested_repo some path segment from the root down to the cwd holds a `.git` (dir or file)
 *   ignored     git ignores the cwd or an ancestor (`check-ignore --no-index`, 42-12's filter);
 *               with no git, the static IGNORED_DIR_FALLBACK / scaffold-name list instead
 *   untracked   git tracks no file under it — only computed when the repo tracks SOMETHING among
 *               the queried dirs and its top-level files (a fresh `git init` says nothing)
 * `missing` and `nested_repo` are decided on disk and never reach git. `isIgnored` / `lsFiles`
 * are injectable (undefined = the git defaults, null = none); `prime(cwds)` asks git about every
 * unknown cwd in ONE batch each, and an unprimed cwd is batched on demand. Answers are memoised.
 * A throwing filter falls back to the no-git behaviour for the rest of the call. Never throws.
 */
function cwdHygiene(root, { isIgnored, lsFiles } = {}) {
  const rootAbs = path.resolve(String(root));
  let ignFn = null;
  let lsFn = null;
  try {
    ignFn = isIgnored === undefined ? defaultIsIgnored(rootAbs) : (typeof isIgnored === 'function' ? isIgnored : null);
  } catch (_) {
    ignFn = null;
  }
  try {
    lsFn = lsFiles === undefined ? defaultLsFiles(rootAbs) : (typeof lsFiles === 'function' ? lsFiles : null);
  } catch (_) {
    lsFn = null;
  }
  let staticIgnore = !ignFn;
  const memo = new Map();

  // Disk-only verdict: a status, or null when git (or the static list) must decide.
  const onDisk = (rel) => {
    if (rel === '') return 'ok';
    if (rel === null) return 'external';
    let st = null;
    try {
      st = fs.statSync(path.join(rootAbs, rel));
    } catch (_) {
      st = null;
    }
    if (!st || !st.isDirectory()) return 'missing';
    const segs = rel.split('/');
    for (let i = 1; i <= segs.length; i += 1) {
      if (fs.existsSync(path.join(rootAbs, ...segs.slice(0, i), '.git'))) return 'nested_repo';
    }
    return null;
  };
  const ancestors = (rel) => {
    const segs = rel.split('/');
    return segs.map((_, i) => segs.slice(0, i + 1).join('/'));
  };
  const staticIgnored = (rel) => rel.split('/').some((s) => IGNORED_FALLBACK_SET.has(s) || SCAFFOLD_NAME.test(s));

  function prime(cwds) {
    const pending = [];
    for (const c of cwds || []) {
      const rel = cleanCwd(c);
      const k = rel === null ? `\u0000${c}` : rel;
      if (memo.has(k)) continue;
      const disk = onDisk(rel);
      if (disk) memo.set(k, disk);
      else if (!pending.includes(rel)) pending.push(rel);
    }
    if (!pending.length) return;

    let ignored = null;
    if (ignFn) {
      const asked = [];
      for (const rel of pending) for (const a of ancestors(rel)) if (!asked.includes(a)) asked.push(a);
      try {
        ignored = new Set(ignFn(asked) || []);
      } catch (_) {
        ignFn = null;
        staticIgnore = true;
        ignored = null;
      }
    }
    const isIgn = (rel) => (ignored
      ? ancestors(rel).some((a) => ignored.has(a))
      : staticIgnore && staticIgnored(rel));

    const toList = pending.filter((rel) => !isIgn(rel));
    let tracked = null;
    if (lsFn && toList.length) {
      try {
        tracked = (lsFn(toList) || []).map(String);
      } catch (_) {
        lsFn = null;
        tracked = null;
      }
    }
    for (const rel of pending) {
      let status = 'ok';
      if (isIgn(rel)) status = 'ignored';
      else if (tracked && tracked.length && !tracked.some((f) => f.startsWith(`${rel}/`))) status = 'untracked';
      memo.set(rel, status);
    }
  }

  function status(cwd) {
    const rel = cleanCwd(cwd);
    const k = rel === null ? `\u0000${cwd}` : rel;
    if (!memo.has(k)) prime([cwd]);
    return memo.get(k) || 'ok';
  }
  status.prime = (cwds) => {
    try {
      prime(cwds);
    } catch (_) {
      // never throws: an unanswered cwd is decided on demand
    }
  };
  return status;
}

module.exports = {
  detectAreas,
  defaultIsIgnored,
  defaultLsFiles,
  cwdHygiene,
  AREA_MARKERS,
  SKIP_DIRS,
  IGNORED_DIR_FALLBACK,
};
