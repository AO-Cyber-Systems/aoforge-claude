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
const { execFileSync } = require('child_process');

const {
  makeFakeHome, makeStampedProject, initGitFixture, makeTrackedRuntimeStateProject, gitEnv,
} = require('./upgrade-fixtures.cjs');
const { repoKey } = require('../upgrade.cjs');

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
 * `path` are in scope for both. `title` defaults to 'Stub check' and `scope` to 'global' only when
 * the key is ABSENT; a key passed EXPLICITLY as `undefined` is omitted from the export, so a
 * contract-violation stub can drop any field (e.g. `{title: undefined}`, or no `runBody` → no
 * `run`); `fixBody` omitted means no `fix`. `file` defaults to `10-<id>.cjs`.
 */
function writeStubCheck(dir, spec = {}) {
  const has = (key) => Object.prototype.hasOwnProperty.call(spec, key);
  const { file, id, runBody, fixBody } = spec;
  const title = has('title') ? spec.title : 'Stub check';
  const scope = has('scope') ? spec.scope : 'global';
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

// ─── The 2026-09-29 aodex/runtime reproduction (TRD 45-08) ────────────────────

// Literal shape of the evidence, reproduced from these literals only (never from ~/dev/aodex).
const AODEX_INSTALLED_VERSION = '2.11.0';
const AODEX_MIRROR_VERSION = '2.10.1';
const AODEX_STALE_CACHE_VERSIONS = ['2.7.1', '2.10.1'];
const AODEX_TRACKED_RUNTIME = [
  '.planning/.progress-guard.json',
  'flutter/.planning/.progress-guard.json',
];
const AODEX_UNTRACKED_RUNTIME = ['.planning/.awareness-cache.json'];
const AODEX_PROJECT_STAMP = '2.0.0';

// A pre-27-01-era marker that expired long ago: it holds the edit gate open until removed.
const EXPIRED_SKILL_ACTIVE = {
  skill: 'devflow:execute-objective',
  started_at: '2025-12-31T16:00:00.000Z',
  pid: 4242,
  expires_at: '2026-01-01T00:00:00.000Z',
};

// Two guard session files, as guard-no-progress.js leaves them, aged past its 24h TTL.
const AODEX_GUARD_SESSIONS = {
  '6b1f0c2e-aodex-session-a.json': '{\n  "last": "Bash:9f2c1e",\n  "count": 3\n}\n',
  '9d4e7a10-aodex-session-b.json': '{\n  "last": "Read:41ab07",\n  "count": 1\n}\n',
};
const GUARD_SESSION_AGE_MS = 2 * 24 * 60 * 60 * 1000;

// An awareness entry for a project that no longer exists.
const AODEX_ORPHAN_AWARENESS_FILE = 'aodex-0a1b2c3d.json';
const AODEX_ORPHAN_PROJECT = '/nonexistent/aodex';
const OVERSIZED_AWARENESS_BYTES = 2 * 1024 * 1024;

// Upgrade backups in backup-prune's `<ts>` format, all far past the 14-day default retention.
// Seven entries against the default keep_min of 5: the two oldest are past retention.
const AODEX_BACKUP_STAMPS = [
  '2026-01-01T09-00-00-000Z',
  '2026-01-02T09-00-00-000Z',
  '2026-01-03T09-00-00-000Z',
  '2026-01-04T09-00-00-000Z',
  '2026-01-05T09-00-00-000Z',
  '2026-01-06T09-00-00-000Z',
  '2026-01-07T09-00-00-000Z',
];

// validate health raises W001 on a PROJECT.md without this section (45-06 SUMMARY); the aodex
// PROJECT.md has one, so the reproduction does too.
const REQUIREMENTS_SECTION =
  '\n## Requirements\n\n' +
  '- [ ] Upgrading must never lose a line the user wrote.\n';

function fixtureGit(root, home, ...args) {
  return execFileSync('git', ['-C', root, ...args], {
    env: gitEnv(home),
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
  });
}

/**
 * makeAodexLikeState() -> { home, root, installPath, guardDir, awarenessDir, env, cleanup() }
 *
 * The full 2026-09-29 reproduction, composed from the builders above:
 *
 *   install      devflow@aocyber 2.11.0 registered, with the REAL hooks/sync-runtime.js and
 *                devflow/bin/lib/runtime-digest.cjs, so the runtime-mirror fix can really run. Its
 *                hooks.json names only sync-runtime.js, so hooks-registry stays ok.
 *   mirror       ~/.claude/devflow at 2.10.1 (behind the install)
 *   cache        stale 2.7.1 and 2.10.1 plugin cache dirs beside the installed 2.11.0
 *   project      a git repo stamped 2.0.0 (always behind), TRACKING `.planning/.progress-guard.json`
 *                and `flutter/.planning/.progress-guard.json`, with an untracked, unignored
 *                `.planning/.awareness-cache.json`; PROJECT.md carries `## Requirements`
 *   marker       an expired `.planning/.skill-active`, listed in `.git/info/exclude` so it never
 *                dirties `.planning/` for the worktree guards
 *   guard dir    two session files aged 2 days (DEVFLOW_PROGRESS_GUARD_DIR)
 *   awareness    one orphan entry (`/nonexistent/aodex`) and one 2 MiB entry for the fixture root
 *                (DEVFLOW_AWARENESS_DIR)
 *   backups      seven `<repoKey(root)>/<ts>/` dirs from January 2026 (default keep_min 5)
 *
 * `root` is a realpath (what the doctor resolves). The guard and awareness dirs live inside the
 * fake home, so `cleanup()` removing home + root removes everything the fixture made.
 */
function makeAodexLikeState() {
  const home = makeDoctorHome();

  const { installPath } = makeInstalledPlugin(home, { version: AODEX_INSTALLED_VERSION });
  copyRealRuntimeFiles(installPath, ['hooks/sync-runtime.js', 'devflow/bin/lib/runtime-digest.cjs']);
  makeMirror(home, { version: AODEX_MIRROR_VERSION });
  makePluginCacheDirs(home, AODEX_STALE_CACHE_VERSIONS);

  const made = makeTrackedRuntimeStateProject({
    tracked: AODEX_TRACKED_RUNTIME,
    untrackedPresent: AODEX_UNTRACKED_RUNTIME,
    version: AODEX_PROJECT_STAMP,
    home,
  });
  const root = fs.realpathSync(made.root);

  fs.appendFileSync(path.join(root, '.planning', 'PROJECT.md'), REQUIREMENTS_SECTION, 'utf-8');
  fixtureGit(root, home, 'add', '--', '.planning/PROJECT.md');
  fixtureGit(root, home, 'commit', '-q', '-m', 'project requirements');

  writeJson(root, '.planning/.skill-active', EXPIRED_SKILL_ACTIVE);
  fs.appendFileSync(path.join(root, '.git', 'info', 'exclude'), '.planning/.skill-active\n', 'utf-8');

  const guardDir = path.join(home, 'df-state', 'progress-guard');
  const agedSec = (Date.now() - GUARD_SESSION_AGE_MS) / 1000;
  for (const [name, content] of Object.entries(AODEX_GUARD_SESSIONS)) {
    const file = writeRel(guardDir, name, content);
    fs.utimesSync(file, agedSec, agedSec);
  }

  const awarenessDir = path.join(home, 'df-state', 'awareness');
  writeJson(awarenessDir, AODEX_ORPHAN_AWARENESS_FILE, {
    project: AODEX_ORPHAN_PROJECT,
    updated: '2026-09-29T08:00:00.000Z',
  });
  const oversized = JSON.stringify({
    project: root,
    updated: '2026-09-29T08:00:00.000Z',
    peer: { branches: [], padding: 'x'.repeat(OVERSIZED_AWARENESS_BYTES) },
  });
  writeRel(awarenessDir, `${repoKey(root)}.json`, oversized + '\n');

  const backupsRepoDir = path.join(claudeDir(home), 'devflow', 'backups', repoKey(root));
  for (const stamp of AODEX_BACKUP_STAMPS) {
    writeJson(path.join(backupsRepoDir, stamp), '.planning/config.json', { devflow: { version: '2.0.0' } });
  }

  const env = {
    DEVFLOW_PROGRESS_GUARD_DIR: guardDir,
    DEVFLOW_AWARENESS_DIR: awarenessDir,
    DEVFLOW_SKIP_GLOBAL_UPGRADE: '1',
  };

  const cleanup = () => {
    for (const dir of [home, root, made.root]) fs.rmSync(dir, { recursive: true, force: true });
  };

  return { home, root, installPath, guardDir, awarenessDir, env, cleanup };
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
  makeAodexLikeState,
  // Literal content and locations, exported so tests assert against the same bytes/paths.
  AODEX_INSTALLED_VERSION,
  AODEX_MIRROR_VERSION,
  AODEX_STALE_CACHE_VERSIONS,
  AODEX_TRACKED_RUNTIME,
  AODEX_UNTRACKED_RUNTIME,
  AODEX_PROJECT_STAMP,
  AODEX_BACKUP_STAMPS,
  PLUGIN_ROOT,
  PLUGIN_KEY,
  HOOKS_JSON,
  MODEL_PROFILES_JSON,
  DF_TOOLS_STUB,
  pluginCacheRoot,
  installedPluginsPath,
};
