'use strict';

// Is the pre-rename plugin still installed and enabled beside AOForge? (objective 72, TRD 72-10, INST-05)
//
// The user installs AOForge while the old plugin is still enabled at least once. Both plugins then register their
// hooks, so the same gate can run twice. An un-updated old plugin cannot be changed from here; the SessionStart
// coexistence-guard hook tells the user, through a global notice, and names the disable command. Nothing here edits
// settings or uninstalls anything.
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
// Pure apart from reads through the injected fsImpl. The plugin id comes from legacy-names.cjs (no old name here).

const fs = require('fs');
const path = require('path');
const { NAMES, LEGACY } = require('./legacy-names.cjs');

/** The major version of the old plugin's pointer release (72-14). */
const POINTER_MAJOR = 3;

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

module.exports = {
  detectLegacyPlugin,
  coexistenceMessage,
  POINTER_MAJOR,
};
