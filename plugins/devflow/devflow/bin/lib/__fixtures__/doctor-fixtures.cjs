'use strict';

// Hand-built fixture builders shared by every objective-45 doctor test (TRD 45-04).
//
// no_llm_test_data: every builder writes literal, hand-written content into an `fs.mkdtemp`-ed
// directory under the OS temp dir. Nothing here ever reads or writes the real `~/.claude` — a
// "home" is always an explicit, disposable temp directory returned by `makeDoctorHome`, and every
// git call goes through upgrade-fixtures' `initGitFixture`/`gitEnv(home)`, so the operator's
// global git config (signing, hooks) is never consulted.
//
// Ownership: the core TRD (45-04) creates this file. The check TRDs (45-05/06/07/08) import it and
// keep check-specific helpers in their own test files, so parallel waves never edit it.

const fs = require('fs');
const os = require('os');
const path = require('path');

const { makeFakeHome, makeStampedProject, initGitFixture } = require('./upgrade-fixtures.cjs');

// plugins/devflow/ in THIS repo: __fixtures__ → lib → bin → devflow → plugins/devflow.
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const PLUGIN_KEY = 'devflow@aocyber';

// ─── Literal content ──────────────────────────────────────────────────────────

// Minimal valid hooks.json: one SessionStart registration, the same shape the shipped file uses.
const HOOKS_JSON = {
  hooks: {
    SessionStart: [
      {
        hooks: [
          { type: 'command', command: 'node ${CLAUDE_PLUGIN_ROOT}/hooks/sync-runtime.js' },
        ],
      },
    ],
  },
};

// A literal model-profiles.json with the real file's shape: tier → model id, agent → tier per profile.
const MODEL_PROFILES_JSON = {
  models: {
    opus: 'claude-opus-5',
    sonnet: 'claude-sonnet-5',
    haiku: 'claude-haiku-4-5',
  },
  agents: {
    planner: { quality: 'opus', balanced: 'opus', budget: 'sonnet' },
    executor: { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
    verifier: { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  },
};

const DF_TOOLS_STUB =
  "'use strict';\n" +
  '// Fixture stub of df-tools.cjs (doctor-fixtures). Never a real engine.\n' +
  "process.stdout.write('df-tools fixture stub\\n');\n";

const WORKFLOW_MD =
  '---\n' +
  'status: active\n' +
  '---\n\n' +
  '# Workflow A\n\n' +
  'Fixture workflow body.\n';

// ─── Small helpers ────────────────────────────────────────────────────────────

function writeRel(root, relPath, content) {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

function writeJson(root, relPath, value) {
  return writeRel(root, relPath, JSON.stringify(value, null, 2) + '\n');
}

function claudeDir(home) {
  return path.join(home, '.claude');
}

function pluginCacheRoot(home) {
  return path.join(claudeDir(home), 'plugins', 'cache', 'aocyber', 'devflow');
}

function installedPluginsPath(home) {
  return path.join(claudeDir(home), 'plugins', 'installed_plugins.json');
}

function assertTempHome(home) {
  if (typeof home !== 'string' || !path.isAbsolute(home)) {
    throw new Error(`doctor-fixtures: home must be an absolute path (got ${JSON.stringify(home)})`);
  }
  const tmp = fs.realpathSync(os.tmpdir());
  const real = fs.realpathSync(home);
  if (!real.startsWith(tmp + path.sep)) {
    throw new Error(`doctor-fixtures: refusing to write outside the OS temp dir (home ${home})`);
  }
}

// ─── Builders ─────────────────────────────────────────────────────────────────

/**
 * makeDoctorHome() -> absolute fake home under the OS temp dir.
 *
 * A `makeFakeHome()` home with `.claude/devflow/` created (the mirror dir exists but is empty:
 * no `.plugin-version`, no `bin/`). Use `makeMirror` to populate it.
 */
function makeDoctorHome() {
  const home = makeFakeHome();
  fs.mkdirSync(path.join(claudeDir(home), 'devflow'), { recursive: true });
  return home;
}

/**
 * makeInstalledPlugin(home, { version = '2.11.0', files = {} }) -> { installPath }
 *
 * Creates `<home>/.claude/plugins/cache/aocyber/devflow/<version>/` shaped like a plugin-manager
 * install: `.claude-plugin/plugin.json` {name, version}, `hooks/hooks.json`,
 * `devflow/bin/df-tools.cjs` (stub), `devflow/workflows/a.md`, and
 * `devflow/references/model-profiles.json`. `files` maps extra/override relative paths (posix,
 * relative to installPath) to literal string content.
 *
 * Also writes or MERGES `<home>/.claude/plugins/installed_plugins.json`: other plugins' entries are
 * kept; the `devflow@aocyber` entry is replaced by one `{scope:'user', installPath, version}`.
 */
function makeInstalledPlugin(home, { version = '2.11.0', files = {} } = {}) {
  assertTempHome(home);
  const installPath = path.join(pluginCacheRoot(home), version);

  writeJson(installPath, '.claude-plugin/plugin.json', { name: 'devflow', version });
  writeJson(installPath, 'hooks/hooks.json', HOOKS_JSON);
  writeRel(installPath, 'devflow/bin/df-tools.cjs', DF_TOOLS_STUB);
  writeRel(installPath, 'devflow/workflows/a.md', WORKFLOW_MD);
  writeJson(installPath, 'devflow/references/model-profiles.json', MODEL_PROFILES_JSON);
  for (const [rel, content] of Object.entries(files)) writeRel(installPath, rel, content);

  const registryPath = installedPluginsPath(home);
  let registry = { version: 2, plugins: {} };
  if (fs.existsSync(registryPath)) {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    if (!registry.plugins || typeof registry.plugins !== 'object') registry.plugins = {};
  }
  registry.plugins[PLUGIN_KEY] = [{ scope: 'user', installPath, version }];
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf-8');

  return { installPath };
}

/**
 * copyRealRuntimeFiles(installPath, rels) -> absolute destination paths
 *
 * Copies the named REAL files from this repo's `plugins/devflow/` into the fixture install, at the
 * same relative path (e.g. `hooks/sync-runtime.js`, `devflow/bin/lib/runtime-digest.cjs`). A named
 * file that does not exist in the repo throws — a silently skipped copy would test nothing.
 */
function copyRealRuntimeFiles(installPath, rels) {
  const out = [];
  for (const rel of rels) {
    const src = path.join(PLUGIN_ROOT, rel);
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
      throw new Error(`copyRealRuntimeFiles: ${rel} is not a file under ${PLUGIN_ROOT}`);
    }
    const dest = path.join(installPath, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    out.push(dest);
  }
  return out;
}

/**
 * makeMirror(home, { version, files = {}, digest = null }) -> { mirrorDir }
 *
 * Populates `<home>/.claude/devflow/` like sync-runtime leaves it: `.plugin-version` (the bare
 * version string, no newline — what sync-runtime writes), `bin/df-tools.cjs` (stub), the given
 * `files` (relative path → literal content), and `.plugin-digest` only when `digest` is given.
 */
function makeMirror(home, { version, files = {}, digest = null } = {}) {
  assertTempHome(home);
  if (typeof version !== 'string' || !version) {
    throw new Error('makeMirror: version is required');
  }
  const mirrorDir = path.join(claudeDir(home), 'devflow');
  fs.mkdirSync(mirrorDir, { recursive: true });
  fs.writeFileSync(path.join(mirrorDir, '.plugin-version'), version, 'utf-8');
  writeRel(mirrorDir, 'bin/df-tools.cjs', DF_TOOLS_STUB);
  for (const [rel, content] of Object.entries(files)) writeRel(mirrorDir, rel, content);
  if (digest !== null) fs.writeFileSync(path.join(mirrorDir, '.plugin-digest'), digest, 'utf-8');
  return { mirrorDir };
}

/**
 * makePluginCacheDirs(home, versions) -> absolute version dirs, in the order given
 *
 * For each version, `<home>/.claude/plugins/cache/aocyber/devflow/<ver>/.claude-plugin/plugin.json`
 * with `{name:'devflow', version}` and nothing else. Does not touch installed_plugins.json.
 */
function makePluginCacheDirs(home, versions) {
  assertTempHome(home);
  const dirs = [];
  for (const version of versions) {
    const dir = path.join(pluginCacheRoot(home), version);
    writeJson(dir, '.claude-plugin/plugin.json', { name: 'devflow', version });
    dirs.push(dir);
  }
  return dirs;
}

/**
 * makeDoctorProject({ home, git = true, version = '2.0.0' }) -> { root, home }
 *
 * A stamped, current-shape DevFlow project (`makeStampedProject(version)`). With `git`, it is also
 * a git repo with one `init` commit (`initGitFixture(root, home)` — local identity, no signing).
 * `home` defaults to a fresh `makeDoctorHome()`; it is only used for the git environment.
 */
function makeDoctorProject({ home = null, git = true, version = '2.0.0' } = {}) {
  const fakeHome = home || makeDoctorHome();
  const root = makeStampedProject(version);
  if (git) initGitFixture(root, fakeHome);
  return { root, home: fakeHome };
}

/**
 * writeStubCheck(dir, { file, id, title, scope, runBody, fixBody }) -> absolute module path
 *
 * Writes a literal doctor check module to `<dir>/<file>` (dir is created). `runBody` / `fixBody`
 * are FUNCTION-BODY strings: `run(ctx) { <runBody> }`, `fix(ctx, result) { <fixBody> }`. `fs` and
 * `path` are in scope for both. Any field passed as `undefined` is omitted from the export, so a
 * contract-violation stub can drop one (e.g. no `run`); `fixBody` omitted means no `fix`.
 * `file` defaults to `10-<id>.cjs`.
 */
function writeStubCheck(dir, { file, id, title = 'Stub check', scope = 'global', runBody, fixBody } = {}) {
  const name = file || `10-${id}.cjs`;
  const lines = [
    "'use strict';",
    '// Stub doctor check written by doctor-fixtures.writeStubCheck (test only).',
    "const fs = require('fs');",
    "const path = require('path');",
    'module.exports = {',
  ];
  if (id !== undefined) lines.push(`  id: ${JSON.stringify(id)},`);
  if (title !== undefined) lines.push(`  title: ${JSON.stringify(title)},`);
  if (scope !== undefined) lines.push(`  scope: ${JSON.stringify(scope)},`);
  if (runBody !== undefined) lines.push(`  run(ctx) {\n${runBody}\n  },`);
  if (fixBody !== undefined) lines.push(`  fix(ctx, result) {\n${fixBody}\n  },`);
  lines.push('};');
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, name);
  fs.writeFileSync(abs, lines.join('\n') + '\n', 'utf-8');
  return abs;
}

/**
 * makeChecksDir() -> an empty absolute temp dir to hold stub checks.
 */
function makeChecksDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'df-doctor-checks-'));
}

module.exports = {
  makeDoctorHome,
  makeInstalledPlugin,
  copyRealRuntimeFiles,
  makeMirror,
  makePluginCacheDirs,
  makeDoctorProject,
  writeStubCheck,
  makeChecksDir,
  // Literal content and locations, exported so tests assert against the same bytes/paths.
  PLUGIN_ROOT,
  PLUGIN_KEY,
  HOOKS_JSON,
  MODEL_PROFILES_JSON,
  DF_TOOLS_STUB,
  pluginCacheRoot,
  installedPluginsPath,
};
