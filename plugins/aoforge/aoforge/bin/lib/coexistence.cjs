'use strict';

// What the rename left in the user's home, detected and never used (objective 72, TRD 72-10, INST-05; objective 78,
// TRD 78-06, SC-3/SC-4). This is the one module for global pre-rename detection. The SessionStart coexistence-guard
// hook turns legacyNotices() into one notice per session, and doctor check 16 reports the same findings. Nothing here
// edits settings, uninstalls, moves or migrates anything, and nothing here makes an old name work: a variable, a
// directory or a file is only checked for presence (the migration marker for its presence too), never read for a value.
//
//   plugin-enabled        the old plugin installed and enabled beside AOForge (detectLegacyPlugin, below)
//   legacy-env            variables with the old prefix are set; AOForge 3.1 no longer reads them (legacyEnvVariables)
//   runtime-not-migrated  the old runtime home (~/.claude/<old runtime dir>/) exists and no 3.0.x session migrated it:
//                         its marker LEGACY_STATE_MARKER is missing from the new home. 3.1 carries no migration, so the
//                         path is AOForge SHIM_RELEASE or the manual copy. A migrated old home stays quiet here; doctor
//                         check 16 reports the leftover.
//   user-dot-dir          files AOForge 3.0.0 itself wrote in ~/.aoforge/ (TO_RUNTIME, TO_WATCH). 3.1 no longer reads
//                         them there; doctor check 17's fix moves them.
//
// The old plugin
//
// The user installs AOForge while the old plugin is still enabled at least once. Both plugins then register their
// hooks, so the same gate can run twice. An un-updated old plugin cannot be changed from here; the notice names the
// disable command.
//
// Inputs, all under <userHome>/.claude:
//   plugins/installed_plugins.json   { version: 2, plugins: { "<id>": [ { scope, version, ... } ] } }
//                                    (a version-1 file keyed the id to a single object; both are read)
//   settings.json, settings.local.json   enabledPlugins["<id>"]: an explicit false disables the plugin. The local
//                                    file wins when both name it. Absent everywhere means enabled: that is Claude
//                                    Code's default for an installed plugin.
//
// The old plugin's final release (POINTER_MAJOR and up) only forwards to the AOForge commands and no-ops its hooks
// while the AOForge runtime marker exists, so a pointer never gates anything twice; it is still worth disabling.
//
// Pure apart from reads through the injected fsImpl. Every old name comes from legacy-names.cjs (none is spelled here).

const fs = require('fs');
const path = require('path');
const { NAMES, LEGACY, SHIM_RELEASE } = require('./legacy-names.cjs');

/** The major version of the old plugin's pointer release (72-14). */
const POINTER_MAJOR = 3;

/** The release that stopped reading the old names (the env alias, the interim readers, the runtime migration). */
const REMOVED_IN = '3.1.0';

/** The marker a 3.0.x runtime-state migration (TRD 72-07) wrote under the new runtime home. Detected, never written. */
const LEGACY_STATE_MARKER = '.legacy-state-migrated.json';

/** What AOForge 3.0.0's watch daemon and its service wrote in ~/.aoforge/: they belong in the watch state directory. */
const TO_WATCH = Object.freeze([
  `${NAMES.watch}.pid`, `${NAMES.watch}.log`, 'launchd-stdout.log', 'launchd-stderr.log',
  'systemd-stdout.log', 'systemd-stderr.log',
]);

/** The user's own files AOForge 3.0.0 kept in ~/.aoforge/: they belong in the runtime home. */
const TO_RUNTIME = Object.freeze(['defaults.json', 'brave_api_key', `${NAMES.watch}-allow.json`]);

const MIGRATION_GUIDE = 'docs/MIGRATING-TO-AOFORGE.md';
const DOCTOR_FIX = `${NAMES.cli} doctor --global --fix`;

const SETTINGS_FILES = Object.freeze(['settings.json', 'settings.local.json']);

const NOT_INSTALLED = Object.freeze({ installed: false, enabled: false, version: null, pointer: false });

function readJsonOrNull(file, fsImpl) {
  try {
    return JSON.parse(String(fsImpl.readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The installed version of `id` from a parsed installed_plugins.json, or null. A user-scope entry wins over any
 * other scope; an entry without a string version does not count.
 */
function installedVersion(data, id) {
  if (!isObject(data) || !isObject(data.plugins)) return null;
  const raw = data.plugins[id];
  const entries = (Array.isArray(raw) ? raw : [raw]).filter((e) => isObject(e) && typeof e.version === 'string' && e.version);
  if (entries.length === 0) return null;
  const user = entries.find((e) => e.scope === 'user');
  return (user || entries[0]).version;
}

/** The explicit enabledPlugins value for `id` (true/false), the local settings file winning; null when unset. */
function explicitEnabled(claudeDir, id, fsImpl) {
  let value = null;
  for (const file of SETTINGS_FILES) {
    const settings = readJsonOrNull(path.join(claudeDir, file), fsImpl);
    if (!isObject(settings) || !isObject(settings.enabledPlugins)) continue;
    const v = settings.enabledPlugins[id];
    if (typeof v === 'boolean') value = v;
  }
  return value;
}

function majorOf(version) {
  const m = /^(\d+)\./.exec(String(version));
  return m ? Number(m[1]) : null;
}

/**
 * Detect the old plugin in a user home.
 *
 * @param {{userHome: string, fsImpl?: object}} opts  userHome is required: there is no default to the real home
 * @returns {{installed: boolean, enabled: boolean, version: string|null, pointer: boolean}}
 */
function detectLegacyPlugin({ userHome, fsImpl = fs } = {}) {
  if (!userHome) throw new TypeError('detectLegacyPlugin: userHome is required (no default to os.homedir())');
  const claudeDir = path.join(userHome, '.claude');
  const installed = readJsonOrNull(path.join(claudeDir, 'plugins', 'installed_plugins.json'), fsImpl);
  const version = installedVersion(installed, LEGACY.plugin);
  if (version === null) return { ...NOT_INSTALLED };

  const explicit = explicitEnabled(claudeDir, LEGACY.plugin, fsImpl);
  const major = majorOf(version);
  return {
    installed: true,
    enabled: explicit !== false,
    version,
    pointer: major !== null && major >= POINTER_MAJOR,
  };
}

/**
 * The one-line notice for a detection result, or null when the old plugin is not enabled.
 *
 * @param {{installed: boolean, enabled: boolean, version: string|null, pointer: boolean}|null} result
 * @returns {string|null}
 */
function coexistenceMessage(result) {
  if (!result || !result.installed || !result.enabled) return null;
  const disable = `claude plugin disable ${LEGACY.plugin}`;
  const which = `${LEGACY.plugin} v${result.version}`;
  if (result.pointer) {
    return (
      `The ${LEGACY.product} pointer plugin (${which}) is still enabled beside ${NAMES.product}. ` +
      `It only forwards to the ${NAMES.commandNs} commands; disable it: ${disable}`
    );
  }
  return (
    `The ${LEGACY.product} plugin (${which}) is still enabled beside ${NAMES.product}, so its hooks and gates may ` +
    `run twice. Disable it: ${disable}`
  );
}

// ─── the rest of the home ───────────────────────────────────────────────────────

function assertHome(userHome, fn) {
  if (typeof userHome !== 'string' || !path.isAbsolute(userHome)) {
    throw new TypeError(`${fn}: userHome must be an absolute path (got ${JSON.stringify(userHome)}; no default to os.homedir())`);
  }
}

/** stat/lstat that reports any failure as absence: a detector never throws on an unreadable path. */
function statOrNull(p, fsImpl, follow) {
  try {
    return follow ? fsImpl.statSync(p) : fsImpl.lstatSync(p);
  } catch {
    return null;
  }
}

/**
 * Variables with the old prefix in `env`, sorted, each with its AOForge form. The bare prefix and undefined values are
 * not variables. Only the names are looked at; `env` is never changed.
 *
 * @returns {{name: string, aoforge: string}[]}
 */
function legacyEnvVariables(env) {
  const source = env && typeof env === 'object' ? env : {};
  return Object.keys(source)
    .filter((k) => k.startsWith(LEGACY.envPrefix) && k.length > LEGACY.envPrefix.length && source[k] !== undefined)
    .sort()
    .map((name) => ({ name, aoforge: NAMES.envPrefix + name.slice(LEGACY.envPrefix.length) }));
}

/** The pre-rename runtime home: <home>/.claude/<LEGACY.runtimeDir>. */
function legacyRuntimeHome(home) {
  return path.join(home, '.claude', LEGACY.runtimeDir);
}

/**
 * Is the pre-rename runtime home there (a directory, a symlinked one included), and did a 3.0.x session migrate it
 * (LEGACY_STATE_MARKER under the new runtime home)? Presence only: nothing in either home is read.
 *
 * @returns {{present: boolean, migrated: boolean}}
 */
function legacyRuntimeState(userHome, { fsImpl = fs } = {}) {
  assertHome(userHome, 'legacyRuntimeState');
  const st = statOrNull(legacyRuntimeHome(userHome), fsImpl, true);
  const marker = path.join(userHome, '.claude', NAMES.runtimeDir, LEGACY_STATE_MARKER);
  return { present: Boolean(st && st.isDirectory()), migrated: statOrNull(marker, fsImpl, false) !== null };
}

/**
 * The TO_RUNTIME and TO_WATCH names that are regular files in ~/.aoforge/ (a symlinked directory is followed, as
 * doctor check 17 does), sorted. Planning files and unknown names are not 3.0.0's and are not listed.
 *
 * @returns {string[]}
 */
function interimUserFiles(userHome, { fsImpl = fs } = {}) {
  assertHome(userHome, 'interimUserFiles');
  const dir = path.join(userHome, NAMES.userDotDir);
  const st = statOrNull(dir, fsImpl, true);
  if (!st || !st.isDirectory()) return [];
  return [...TO_RUNTIME, ...TO_WATCH]
    .filter((name) => {
      const entry = statOrNull(path.join(dir, name), fsImpl, false);
      return Boolean(entry && entry.isFile());
    })
    .sort();
}

function envText(variables) {
  const names = variables.map((v) => v.name);
  const renames = variables.map((v) => `${v.name} to ${v.aoforge}`);
  const list = (items) => (items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
  const one = variables.length === 1;
  return `The ${LEGACY.envPrefix}* variable${one ? '' : 's'} ${list(names)} ${one ? 'is' : 'are'} no longer read `
    + `since ${NAMES.product} ${REMOVED_IN}; rename ${list(renames)} where you set ${one ? 'it' : 'them'} `
    + '(shell profile or launch environment)';
}

function runtimeText() {
  return `The ${LEGACY.product} runtime home ~/.claude/${LEGACY.runtimeDir}/ was never migrated to `
    + `~/.claude/${NAMES.runtimeDir}/ (calibration, estimates, backups and the GitHub outbox), and ${NAMES.product} `
    + `no longer migrates it: run ${NAMES.product} ${SHIM_RELEASE} once (one session migrates it), or copy it by hand `
    + `(see ${MIGRATION_GUIDE})`;
}

function dotDirText(files) {
  return `~/${NAMES.userDotDir}/ still holds files ${NAMES.product} 3.0.0 wrote (${files.join(', ')}); `
    + `${NAMES.product} no longer reads them there: \`${DOCTOR_FIX}\` moves them`;
}

/**
 * Every global leftover, one entry per kind in a fixed order (plugin-enabled, legacy-env, runtime-not-migrated,
 * user-dot-dir), each a one-line sentence naming its fix. Level: 'info' for the pointer plugin, else 'action'.
 *
 * @param {{env?: object, userHome: string, detect?: Function, fsImpl?: object}} opts  detect defaults to
 *   detectLegacyPlugin and is called as detect({ userHome })
 * @returns {{kind: string, level: 'info'|'action', text: string}[]}
 */
function legacyNotices({ env = {}, userHome, detect, fsImpl = fs } = {}) {
  assertHome(userHome, 'legacyNotices');
  const found = [];

  const plugin = (detect || ((o) => detectLegacyPlugin({ ...o, fsImpl })))({ userHome });
  const pluginText = coexistenceMessage(plugin);
  if (pluginText) found.push({ kind: 'plugin-enabled', level: plugin.pointer ? 'info' : 'action', text: pluginText });

  const variables = legacyEnvVariables(env);
  if (variables.length > 0) found.push({ kind: 'legacy-env', level: 'action', text: envText(variables) });

  const runtime = legacyRuntimeState(userHome, { fsImpl });
  if (runtime.present && !runtime.migrated) found.push({ kind: 'runtime-not-migrated', level: 'action', text: runtimeText() });

  const files = interimUserFiles(userHome, { fsImpl });
  if (files.length > 0) found.push({ kind: 'user-dot-dir', level: 'action', text: dotDirText(files) });

  return found;
}

module.exports = {
  installedVersion,
  explicitEnabled,
  readJsonOrNull,
  detectLegacyPlugin,
  coexistenceMessage,
  legacyEnvVariables,
  legacyRuntimeHome,
  legacyRuntimeState,
  interimUserFiles,
  legacyNotices,
  TO_RUNTIME,
  TO_WATCH,
  LEGACY_STATE_MARKER,
  REMOVED_IN,
  MIGRATION_GUIDE,
  POINTER_MAJOR,
};
