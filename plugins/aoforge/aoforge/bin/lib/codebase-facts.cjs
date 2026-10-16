'use strict';
// TRD 76-04 — `aof-tools codebase facts [--focus tech|arch|quality|concerns|all] [--root <dir>]`.
//
// The mechanical half of codebase mapping, done in code so the four mapper spawns spend their
// tokens on reading and describing: manifests, config and env-file names, languages, directory
// shape, entry points, tests, TODO-style markers, the largest source files, external imports and
// stub returns. Language-neutral: the manifest and extension tables come from repo-state.cjs and
// a small per-language import table below. Env files are reported by NAME only; their contents
// are never read.

const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');
const { EXCLUDE, EXTS, MANIFEST_LANG } = require('./repo-state.cjs');
const { output, error } = require('./helpers.cjs');

const FOCI = Object.freeze(['tech', 'arch', 'quality', 'concerns', 'all']);

const BASE_SECTIONS = {
  tech: ['manifests', 'languages', 'config_files', 'env_files', 'imports'],
  arch: ['top_dirs', 'entry_points', 'languages'],
  quality: ['tests', 'languages', 'largest_source_files'],
  concerns: ['markers', 'stub_returns', 'largest_source_files', 'env_files'],
};
const SECTIONS = Object.freeze({ ...BASE_SECTIONS, all: [...new Set(Object.values(BASE_SECTIONS).flat())] });

const CAPS = Object.freeze({
  files: 20000, // walk ceiling: a huge tree still answers, deterministically truncated
  manifests: 40,
  languages: 30,
  top_dirs: 40,
  config_files: 60,
  env_files: 30,
  entry_points: 30,
  test_dirs: 30,
  marker_files: 20,
  largest: 20,
  imports: 40,
  stubs: 30,
});
const MAX_BYTES = 1024 * 1024;

const SKIP_DIRS = new Set([...EXCLUDE, 'vendor', 'target', '__pycache__', 'venv', 'Pods', 'bower_components']);

// Manifests beyond repo-state's language table (which carries the first-match detector order).
const EXTRA_MANIFESTS = [
  'requirements.txt', 'setup.py', 'setup.cfg', 'Pipfile', 'composer.json', 'mix.exs',
  'CMakeLists.txt', 'deno.json', 'build.sbt', 'Project.toml', 'stack.yaml', 'cabal.project',
];
const MANIFEST_NAMES = new Set([...MANIFEST_LANG.map(([f]) => f), ...EXTRA_MANIFESTS]);

const SOURCE_EXTS = new Set([
  ...EXTS,
  '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.php', '.scala', '.ex', '.exs', '.lua',
  '.m', '.mm', '.hs', '.clj', '.erl', '.sh', '.vue', '.svelte',
]);

const LOCK_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'Cargo.lock', 'go.sum',
  'poetry.lock', 'Pipfile.lock', 'Gemfile.lock', 'composer.lock', 'mix.lock', 'Podfile.lock',
  'uv.lock', 'npm-shrinkwrap.json',
]);
const GENERATED_RE = /(\.min\.(js|css)$)|(\.lock$)|(\.pb\.go$)|(_pb2\.py$)|(\.g\.[a-z]+$)|(\.freezed\.[a-z]+$)|(\.generated\.[a-z]+$)|(\.d\.ts$)|(\.map$)/;

const CONFIG_RES = [
  /\.config\.[a-z]+$/, /^tsconfig.*\.json$/, /^jsconfig\.json$/, /^\.nvmrc$/, /^\.node-version$/,
  /^\.python-version$/, /^\.ruby-version$/, /^\.tool-versions$/, /^\.eslintrc/, /^\.prettierrc/,
  /^biome\.jsonc?$/, /^\.editorconfig$/, /^tox\.ini$/, /^pytest\.ini$/, /^mypy\.ini$/, /^\.flake8$/,
  /^ruff\.toml$/, /^\.golangci\./, /^rustfmt\.toml$/, /^\.rustfmt\.toml$/, /^clippy\.toml$/,
  /^rust-toolchain(\.toml)?$/, /^Makefile$/, /^justfile$/i, /^Taskfile\.ya?ml$/, /^Dockerfile/,
  /^docker-compose.*\.ya?ml$/, /^compose\.ya?ml$/, /^\.gitlab-ci\.yml$/, /^analysis_options\.yaml$/,
  /^\.rubocop\.yml$/, /^\.babelrc/, /^\.swcrc$/, /^\.stylelintrc/, /^Procfile$/,
  /^gradle\.properties$/, /^\.dockerignore$/,
];

const MARKERS = ['TODO', 'FIXME', 'HACK', 'XXX'];
const MARKER_RE = /\b(TODO|FIXME|HACK|XXX)\b/g;

const STUB_RES = [
  /^\s*return\s+(null|undefined|None)\s*;?\s*$/,
  /^\s*return\s+\[\s*\]\s*;?\s*$/,
  /^\s*return\s+\{\s*\}\s*;?\s*$/,
  /\{\s*return\s+(null|undefined|\[\s*\]|\{\s*\})\s*;?\s*\}/,
  /^\s*pass\s*$/,
  /\bunimplemented!\s*\(/,
  /\btodo!\s*\(/,
  /\braise\s+NotImplementedError\b/,
  /\bthrow\s+new\s+(Error|NotImplementedException)\s*\(\s*['"`]?(not\s+implemented|todo)/i,
  /\bthrow\s+UnimplementedError\b/,
  /\bpanic\(\s*"(not implemented|todo|unimplemented)/i,
  /\bNotImplementedError\b|\bTODO\(\)/,
];

const ENTRY_BASES = new Set(['main', 'index', 'app', 'server', 'cli', '__main__', 'manage', 'wsgi', 'asgi', 'lib', 'mod', 'program']);

// fixture and sample trees: kept for counts, left out of import and stub evidence
function isFixture(rel) {
  return rel.split('/').slice(0, -1).some((p) => ['__fixtures__', 'fixtures', 'testdata', '__mocks__', 'examples'].includes(p));
}

function isTestFile(rel) {
  const base = path.posix.basename(rel);
  if (/\.(test|spec)\.[a-z]+$/i.test(base)) return true;
  if (/_(test|spec)\.[a-z]+$/i.test(base)) return true;
  if (/^test_.*\.py$/.test(base)) return true;
  if (/(Test|Tests|Spec)\.(java|kt|kts|swift|cs|scala)$/.test(base)) return true;
  const parts = rel.split('/').slice(0, -1);
  return parts.some((p) => ['test', 'tests', '__tests__', 'spec', 'specs', 'integration_test'].includes(p));
}

// ─── Imports ──────────────────────────────────────────────────────────────────

const NODE_BUILTINS = new Set(builtinModules);

const NPM_NAME_RE = /^(@[a-z0-9~-][\w.~-]*\/)?[a-z0-9~-][\w.~-]*$/i;

function jsRoot(spec) {
  if (!spec || spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) return null;
  const root = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  if (!NPM_NAME_RE.test(root) || NODE_BUILTINS.has(root)) return null;
  // a bare file name (`helpers.cjs`, `data.json`) is a string in a source file, not a package
  const ext = path.extname(root).toLowerCase();
  if (ext && (SOURCE_EXTS.has(ext) || ext === '.json')) return null;
  return root;
}

function goRoot(spec) {
  const segs = spec.split('/');
  if (!segs[0].includes('.')) return null; // standard library
  return segs.slice(0, segs[0] === 'github.com' || segs[0] === 'gitlab.com' ? 3 : 2).join('/');
}

const PY_STDLIB = new Set([
  '__future__', 'abc', 'argparse', 'array', 'ast', 'asyncio', 'base64', 'bisect', 'collections',
  'concurrent', 'contextlib', 'copy', 'csv', 'dataclasses', 'datetime', 'decimal', 'enum', 'errno',
  'functools', 'glob', 'gzip', 'hashlib', 'heapq', 'hmac', 'html', 'http', 'importlib', 'inspect',
  'io', 'itertools', 'json', 'logging', 'math', 'multiprocessing', 'operator', 'os', 'pathlib',
  'pickle', 'platform', 'pprint', 'queue', 'random', 're', 'secrets', 'shutil', 'signal', 'socket',
  'sqlite3', 'string', 'struct', 'subprocess', 'sys', 'tempfile', 'textwrap', 'threading', 'time',
  'traceback', 'types', 'typing', 'unittest', 'urllib', 'uuid', 'warnings', 'weakref', 'xml', 'zipfile',
]);

const RB_STDLIB = new Set([
  'base64', 'benchmark', 'csv', 'date', 'digest', 'erb', 'fileutils', 'find', 'json', 'logger', 'net',
  'open3', 'openssl', 'optparse', 'ostruct', 'pathname', 'pp', 'securerandom', 'set', 'shellwords',
  'socket', 'stringio', 'tempfile', 'time', 'timeout', 'tmpdir', 'uri', 'yaml', 'zlib',
]);

const RUST_LOCAL = new Set(['crate', 'self', 'super', 'std', 'core', 'alloc']);

const IMPORT_RULES = [
  {
    exts: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte'],
    res: [/\bimport\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g, /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g, /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g],
    root: jsRoot,
  },
  {
    exts: ['.py'],
    res: [/^\s*from\s+([A-Za-z_][\w.]*)\s+import\b/gm, /^\s*import\s+([A-Za-z_][\w.]*)/gm],
    root: (s) => { const r = s.split('.')[0]; return PY_STDLIB.has(r) ? null : r; },
  },
  {
    exts: ['.go'],
    res: [/^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/gm, /^\s*(?:[\w.]+\s+)?"([^"]+)"\s*$/gm],
    root: goRoot,
    block: true,
  },
  {
    exts: ['.rs'],
    res: [/^\s*(?:pub\s+)?use\s+([A-Za-z_]\w*)::/gm, /^\s*extern\s+crate\s+([A-Za-z_]\w*)/gm],
    root: (s) => (RUST_LOCAL.has(s) ? null : s),
  },
  {
    exts: ['.rb'],
    res: [/^\s*require\s+['"]([^'"]+)['"]/gm],
    root: (s) => { const r = s.split('/')[0]; return s.startsWith('.') || RB_STDLIB.has(r) ? null : r; },
  },
  {
    exts: ['.java', '.kt', '.kts', '.scala'],
    res: [/^\s*import\s+(?:static\s+)?([\w.]+)/gm],
    root: (s) => (/^(java|javax|kotlin)\./.test(s) ? null : s.split('.').slice(0, 2).join('.')),
  },
  {
    exts: ['.swift'],
    res: [/^\s*import\s+(\w+)/gm],
    root: (s) => (['Foundation', 'Swift', 'UIKit', 'SwiftUI', 'Darwin'].includes(s) ? null : s),
  },
  {
    exts: ['.cs'],
    res: [/^\s*using\s+([\w.]+)\s*;/gm],
    root: (s) => (/^System\b/.test(s) ? null : s.split('.').slice(0, 2).join('.')),
  },
  {
    exts: ['.php'],
    res: [/^\s*use\s+([\w\\]+)/gm],
    root: (s) => s.split('\\').slice(0, 2).join('\\'),
  },
  {
    exts: ['.ex', '.exs'],
    res: [/^\s*(?:alias|import|use)\s+([A-Z][\w.]*)/gm],
    root: (s) => s.split('.')[0],
  },
];
const IMPORT_BY_EXT = new Map();
for (const rule of IMPORT_RULES) for (const e of rule.exts) IMPORT_BY_EXT.set(e, rule);
// Any repo-state source extension without a rule above gets the `import 'package:<name>/...'`
// form (the remaining language in that table uses it).
const PACKAGE_RULE = { exts: [], res: [/^\s*import\s+['"]package:([^/'"]+)\//gm], root: (s) => s };
for (const e of EXTS) if (!IMPORT_BY_EXT.has(e)) { PACKAGE_RULE.exts.push(e); IMPORT_BY_EXT.set(e, PACKAGE_RULE); }

function importsOf(ext, text, localNames) {
  const rule = IMPORT_BY_EXT.get(ext);
  if (!rule) return [];
  let body = text;
  if (rule.block) {
    // Go: only scan import declarations (single lines and parenthesized blocks)
    const parts = [];
    for (const m of text.matchAll(/^\s*import\s*\(([\s\S]*?)\)/gm)) parts.push(m[1]);
    for (const m of text.matchAll(/^\s*import\s+(?:[\w.]+\s+)?"[^"]+"/gm)) parts.push(m[0]);
    body = parts.join('\n');
  }
  const found = new Set();
  for (const re of rule.res) {
    for (const m of body.matchAll(re)) {
      const r = rule.root(m[1]);
      if (r && !localNames.has(r)) found.add(r);
    }
  }
  return [...found];
}

// ─── Walk ─────────────────────────────────────────────────────────────────────

function walkTree(root) {
  const files = []; // { rel, ext, size }
  const envFiles = [];
  let truncated = false;
  function walk(abs, rel) {
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      if (files.length >= CAPS.files) { truncated = true; return; }
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        if (e.name.startsWith('.') && !(rel === '' && e.name === '.github')) continue;
        walk(path.join(abs, e.name), r);
      } else if (e.isFile()) {
        if (/^\.env($|\.)/.test(e.name) || e.name.endsWith('.env')) { envFiles.push(r); continue; }
        if (LOCK_FILES.has(e.name) || GENERATED_RE.test(e.name)) continue;
        let size = 0;
        try { size = fs.statSync(path.join(abs, e.name)).size; } catch { continue; }
        if (size > MAX_BYTES) continue;
        files.push({ rel: r, ext: path.extname(e.name).toLowerCase(), size });
      }
    }
  }
  walk(root, '');
  return { files, envFiles, truncated };
}

function byCountThenName(key, countKey) {
  return (a, b) => b[countKey] - a[countKey] || (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
}

// ─── facts ────────────────────────────────────────────────────────────────────

function facts({ root, focus = 'all' } = {}) {
  if (!FOCI.includes(focus)) {
    throw new Error(`unknown focus "${focus}"; valid foci: ${FOCI.join(', ')}`);
  }
  if (!root) throw new Error('facts: root is required');
  const absRoot = path.resolve(root);
  if (!fs.existsSync(absRoot) || !fs.statSync(absRoot).isDirectory()) {
    throw new Error(`root is not a directory: ${absRoot}`);
  }
  const want = new Set(SECTIONS[focus]);
  const { files, envFiles, truncated } = walkTree(absRoot);
  const out = { root: absRoot, focus };
  if (truncated) out.truncated = true;

  const source = files.filter((f) => SOURCE_EXTS.has(f.ext));
  const needsText = ['markers', 'stub_returns', 'largest_source_files', 'imports'].some((s) => want.has(s));
  const texts = new Map();
  if (needsText) {
    for (const f of source) {
      try { texts.set(f.rel, fs.readFileSync(path.join(absRoot, f.rel), 'utf8')); } catch { /* unreadable: skip */ }
    }
  }

  if (want.has('manifests')) {
    out.manifests = files
      .filter((f) => MANIFEST_NAMES.has(path.posix.basename(f.rel)) && f.rel.split('/').length <= 3)
      .map((f) => f.rel)
      .sort((a, b) => a.split('/').length - b.split('/').length || (a < b ? -1 : 1))
      .slice(0, CAPS.manifests);
  }

  if (want.has('languages')) {
    const counts = new Map();
    for (const f of source) counts.set(f.ext, (counts.get(f.ext) || 0) + 1);
    out.languages = [...counts].map(([ext, n]) => ({ ext, files: n }))
      .sort(byCountThenName('ext', 'files')).slice(0, CAPS.languages);
  }

  if (want.has('top_dirs')) {
    const counts = new Map();
    for (const f of files) {
      const parts = f.rel.split('/');
      if (parts.length === 1) { counts.set('.', (counts.get('.') || 0) + 1); continue; }
      counts.set(parts[0], (counts.get(parts[0]) || 0) + 1);
      if (parts.length > 2) {
        const d2 = `${parts[0]}/${parts[1]}`;
        counts.set(d2, (counts.get(d2) || 0) + 1);
      }
    }
    out.top_dirs = [...counts].map(([dir, n]) => ({ dir, files: n }))
      .sort(byCountThenName('dir', 'files')).slice(0, CAPS.top_dirs);
  }

  if (want.has('config_files')) {
    out.config_files = files
      .filter((f) => {
        const parts = f.rel.split('/');
        if (parts.length === 1) return CONFIG_RES.some((re) => re.test(parts[0]));
        return /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f.rel);
      })
      .map((f) => f.rel).sort().slice(0, CAPS.config_files);
  }

  if (want.has('env_files')) out.env_files = envFiles.slice().sort().slice(0, CAPS.env_files);

  if (want.has('entry_points')) {
    out.entry_points = source
      .filter((f) => {
        const parts = f.rel.split('/');
        const stem = path.posix.basename(f.rel, f.ext);
        if (isTestFile(f.rel)) return false;
        if (parts[0] === 'cmd' && parts.length === 3 && stem === 'main') return true;
        if (parts[0] === 'bin' && parts.length === 2) return true;
        return ENTRY_BASES.has(stem) && parts.length <= 3;
      })
      .map((f) => f.rel)
      .sort((a, b) => a.split('/').length - b.split('/').length || (a < b ? -1 : 1))
      .slice(0, CAPS.entry_points);
  }

  if (want.has('tests')) {
    const testFiles = files.filter((f) => SOURCE_EXTS.has(f.ext) && isTestFile(f.rel));
    const dirs = new Map();
    for (const f of testFiles) {
      const d = path.posix.dirname(f.rel);
      dirs.set(d, (dirs.get(d) || 0) + 1);
    }
    out.tests = {
      files: testFiles.length,
      dirs: [...dirs].map(([dir, n]) => ({ dir, files: n }))
        .sort(byCountThenName('dir', 'files')).slice(0, CAPS.test_dirs),
    };
  }

  if (want.has('markers')) {
    const totals = Object.fromEntries(MARKERS.map((m) => [m, 0]));
    const perFile = [];
    for (const [file, text] of texts) {
      let n = 0;
      for (const m of text.matchAll(MARKER_RE)) { totals[m[1]]++; n++; }
      if (n) perFile.push({ file, count: n });
    }
    out.markers = { ...totals, top_files: perFile.sort(byCountThenName('file', 'count')).slice(0, CAPS.marker_files) };
  }

  if (want.has('largest_source_files')) {
    const sized = [];
    for (const [file, text] of texts) {
      if (!text) continue;
      sized.push({ file, lines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0) });
    }
    out.largest_source_files = sized.sort(byCountThenName('file', 'lines')).slice(0, CAPS.largest);
  }

  if (want.has('imports')) {
    // a top-level dir or file stem is the project's own package, not an external import
    const localNames = new Set();
    for (const f of files) {
      const first = f.rel.split('/')[0];
      localNames.add(first.includes('.') ? first.slice(0, first.lastIndexOf('.')) : first);
    }
    for (const f of files) if (f.rel.split('/')[0] === 'src' && f.rel.split('/').length > 2) localNames.add(f.rel.split('/')[1]);
    const counts = new Map();
    for (const f of source) {
      const text = texts.get(f.rel);
      if (!text || isFixture(f.rel)) continue;
      for (const mod of importsOf(f.ext, text, localNames)) counts.set(mod, (counts.get(mod) || 0) + 1);
    }
    out.imports = [...counts].map(([module, n]) => ({ module, files: n }))
      .sort(byCountThenName('module', 'files')).slice(0, CAPS.imports);
  }

  if (want.has('stub_returns')) {
    const stubs = [];
    // non-test, non-fixture source only: a stub in a test double is the point of the double
    const ordered = [...texts.keys()].filter((f) => !isTestFile(f) && !isFixture(f)).sort();
    outer: for (const file of ordered) {
      const lines = texts.get(file).split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (STUB_RES.some((re) => re.test(lines[i]))) {
          stubs.push({ file, line: i + 1, text: lines[i].trim().slice(0, 120) });
          if (stubs.length >= CAPS.stubs) break outer;
        }
      }
    }
    out.stub_returns = stubs;
  }

  return out;
}

// ─── Raw summary ──────────────────────────────────────────────────────────────

function counted(list, key, countKey) {
  return list.map((x) => `${x[key]} (${x[countKey]})`).join(', ') || '(none)';
}

function rawSummary(r) {
  const lines = [`codebase facts: ${r.root} [focus ${r.focus}]${r.truncated ? ' (walk truncated)' : ''}`];
  if (r.manifests) lines.push(`manifests: ${r.manifests.join(', ') || '(none)'}`);
  if (r.languages) lines.push(`languages: ${counted(r.languages, 'ext', 'files')}`);
  if (r.config_files) lines.push(`config: ${r.config_files.join(', ') || '(none)'}`);
  if (r.env_files) lines.push(`env files (names only, never read): ${r.env_files.join(', ') || '(none)'}`);
  if (r.imports) lines.push(`imports: ${counted(r.imports, 'module', 'files')}`);
  if (r.top_dirs) lines.push(`dirs: ${counted(r.top_dirs, 'dir', 'files')}`);
  if (r.entry_points) lines.push(`entry points: ${r.entry_points.join(', ') || '(none)'}`);
  if (r.tests) lines.push(`tests: ${r.tests.files} files; dirs ${counted(r.tests.dirs, 'dir', 'files')}`);
  if (r.markers) {
    const m = r.markers;
    lines.push(`markers: TODO ${m.TODO}, FIXME ${m.FIXME}, HACK ${m.HACK}, XXX ${m.XXX}; top ${counted(m.top_files, 'file', 'count')}`);
  }
  if (r.largest_source_files) lines.push(`largest: ${counted(r.largest_source_files, 'file', 'lines')}`);
  if (r.stub_returns) {
    lines.push(`stubs (${r.stub_returns.length}):`);
    for (const s of r.stub_returns) lines.push(`  ${s.file}:${s.line}: ${s.text}`);
  }
  return lines.join('\n') + '\n';
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function cmdCodebaseFacts(cwd, args, raw) {
  let focus = 'all';
  let root = cwd;
  for (let i = 2; i < args.length; i++) {
    const a = args[i];
    if (a === '--focus') {
      focus = args[++i];
      if (!focus) error(`--focus needs a value: ${FOCI.join(' | ')}`);
    } else if (a === '--root') {
      const v = args[++i];
      if (!v) error('--root needs a directory');
      root = path.resolve(cwd, v);
    } else if (a === '--raw') {
      // handled by the dispatcher
    } else {
      error(`codebase facts: unknown argument "${a}" (usage: codebase facts [--focus ${FOCI.join('|')}] [--root <dir>])`);
    }
  }
  let result;
  try {
    result = facts({ root, focus });
  } catch (e) {
    error(e.message);
  }
  output(result, raw, rawSummary(result));
}

module.exports = { FOCI, facts, cmdCodebaseFacts, rawSummary };
