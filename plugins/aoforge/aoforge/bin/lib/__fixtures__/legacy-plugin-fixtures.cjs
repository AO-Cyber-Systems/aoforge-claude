'use strict';

/**
 * legacy-plugin-fixtures.cjs (objective 72, TRD 72-10) — fake user homes with the old and the new plugin installed,
 * and the hook payloads the legacy agent-type tests send.
 *
 *   const h = pluginHome({ devflow: { version: '2.15.0' } });   // installed, no enabledPlugins entry -> enabled
 *   h.home; h.paths.installed; h.paths.settings; h.cleanup();
 *
 *   pluginHome({ devflow: { version: '2.15.0', enabled: false } })   // explicitly disabled in settings.json
 *   pluginHome({ devflow: { version: '2.15.0', enabled: false, settingsFile: 'settings.local.json' } })
 *   pluginHome({ devflow: { version: '3.0.0', enabled: true } })     // the pointer release, explicitly enabled
 *   pluginHome({ corrupt: true })                                    // installed_plugins.json is not JSON
 *   pluginHome({ devflow: null, aoforge: null })                     // no plugin state at all (no plugins/ dir)
 *
 * Options:
 *   devflow   null (not installed) | { version, enabled, settingsFile }. `enabled`: true or false writes that value
 *             under enabledPlugins["devflow@aocyber"]; undefined writes no entry (Claude Code's default for an
 *             installed plugin is enabled). `settingsFile` is 'settings.json' (default) or 'settings.local.json'.
 *   aoforge   null | { version } (default { version: '3.0.0' }): an installed_plugins.json entry, an
 *             enabledPlugins true entry and `<home>/.claude/aoforge/.plugin-version` (the runtime marker the old
 *             plugin's pointer release looks for).
 *   corrupt   true writes `{ not json` as installed_plugins.json (the plugin options are then ignored for it).
 *
 * installed_plugins.json is written in the real version-2 shape:
 *   { "version": 2, "plugins": { "<id>": [ { scope, installPath, version, installedAt, lastUpdated, gitCommitSha } ] } }
 * Only the key set is taken from a real file; every value here is invented and every path is under the fake home.
 *
 * seedEnabledLegacyPlugin(home) writes the most common coexistence state into an existing home (the old plugin
 * 2.15.0 installed beside AOForge, no enabledPlugins entry), so a fixture that may not spell the old name (the hook
 * coexistence suite) can build it.
 *
 * subagentStopPayload / preToolUsePayload are typed out from the shapes the existing hook suites send
 * (hooks/__fixtures__/subagent-stop-fixtures.js and hooks/__fixtures__/gate-fixtures.js).
 *
 * Legacy names may be spelled here: this is one of the `__fixtures__/legacy-*` files the rename codemod and the
 * rename guard leave alone. Ids still come from legacy-names.cjs. Every value is a hand-written literal.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { NAMES, LEGACY } = require('../legacy-names.cjs');

const SETTINGS_FILES = Object.freeze(['settings.json', 'settings.local.json']);

const FIXED_TS = '2026-09-30T12:00:00.000Z';
const FIXED_SHA = '0123456789abcdef0123456789abcdef01234567';

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** One installed_plugins.json entry for `id` at `version`, every path under `home`. */
function installEntry(home, id, version) {
  const [name, marketplace] = id.split('@');
  return {
    scope: 'user',
    installPath: path.join(home, '.claude', 'plugins', 'cache', marketplace, name, version),
    version,
    installedAt: FIXED_TS,
    lastUpdated: FIXED_TS,
    gitCommitSha: FIXED_SHA,
  };
}

/**
 * Write the plugin state into an existing home. Returns the paths it wrote (absent ones are null).
 *
 * @param {string} home
 * @param {{devflow?: null|{version: string, enabled?: boolean, settingsFile?: string},
 *          aoforge?: null|{version: string}, corrupt?: boolean}} [opts]
 */
function writePluginState(home, { devflow = null, aoforge = { version: '3.0.0' }, corrupt = false } = {}) {
  const claude = path.join(home, '.claude');
  const installed = path.join(claude, 'plugins', 'installed_plugins.json');
  const paths = { installed: null, settings: null, settingsLocal: null, pluginVersion: null };

  const plugins = {};
  if (devflow) plugins[LEGACY.plugin] = [installEntry(home, LEGACY.plugin, devflow.version)];
  if (aoforge) plugins[NAMES.plugin] = [installEntry(home, NAMES.plugin, aoforge.version)];

  if (corrupt) {
    fs.mkdirSync(path.dirname(installed), { recursive: true });
    fs.writeFileSync(installed, '{ not json');
    paths.installed = installed;
  } else if (Object.keys(plugins).length > 0) {
    writeJson(installed, { version: 2, plugins });
    paths.installed = installed;
  }

  // enabledPlugins, per settings file. The user's settings.json always gets the AOForge entry when it is installed.
  const enabledBy = { 'settings.json': {}, 'settings.local.json': {} };
  if (aoforge) enabledBy['settings.json'][NAMES.plugin] = true;
  if (devflow && typeof devflow.enabled === 'boolean') {
    const file = devflow.settingsFile || 'settings.json';
    if (!SETTINGS_FILES.includes(file)) throw new Error(`legacy-plugin-fixtures: unknown settings file ${file}`);
    enabledBy[file][LEGACY.plugin] = devflow.enabled;
  }
  for (const file of SETTINGS_FILES) {
    const entries = enabledBy[file];
    if (Object.keys(entries).length === 0) continue;
    const p = path.join(claude, file);
    writeJson(p, { enabledPlugins: entries });
    if (file === 'settings.json') paths.settings = p;
    else paths.settingsLocal = p;
  }

  if (aoforge) {
    const marker = path.join(claude, NAMES.runtimeDir, '.plugin-version');
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, `${aoforge.version}\n`);
    paths.pluginVersion = marker;
  }
  return paths;
}

/**
 * A fresh fake home holding the plugin state `opts` describes.
 *
 * @returns {{home: string, paths: object, cleanup: () => void}}
 */
function pluginHome(opts = {}) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aof-plugin-home-')));
  const paths = writePluginState(home, opts);
  return {
    home,
    paths,
    cleanup() {
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

/** The common coexistence state, for a fixture that may not spell the old name: 2.15.0 installed, no settings entry. */
function seedEnabledLegacyPlugin(home) {
  return writePluginState(home, { devflow: { version: '2.15.0' } });
}

/**
 * A SubagentStop payload with the field set Claude Code sends. An override whose value is `undefined` removes
 * that key.
 */
function subagentStopPayload(overrides = {}) {
  const payload = {
    session_id: 'sess-legacy-0001',
    transcript_path: '/fixture/home/.claude/projects/-fixture-repo/sess-legacy-0001.jsonl',
    cwd: '/fixture/repo',
    prompt_id: 'prompt-legacy-0001',
    permission_mode: 'bypassPermissions',
    agent_id: 'legacy-a1',
    agent_type: 'devflow:executor',
    hook_event_name: 'SubagentStop',
    stop_hook_active: false,
    agent_transcript_path: '/fixture/home/.claude/projects/-fixture-repo/sess-legacy-0001/subagents/agent-legacy-a1.jsonl',
    last_assistant_message: 'Task 2 committed. Stopping here.',
    background_tasks: [],
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete payload[key];
    else payload[key] = value;
  }
  return payload;
}

/** A PreToolUse payload: `filePath` for Edit/Write/MultiEdit, `command` for Bash. Omitted fields stay absent. */
function preToolUsePayload({ tool = 'Bash', filePath, command, agentType, agentId, cwd } = {}) {
  const toolInput = {};
  if (filePath !== undefined) toolInput.file_path = filePath;
  if (command !== undefined) toolInput.command = command;
  const payload = {
    hook_event_name: 'PreToolUse',
    tool_name: tool,
    tool_input: toolInput,
    session_id: 's-legacy-fixture',
    cwd: cwd !== undefined ? cwd : process.cwd(),
  };
  if (agentId !== undefined) payload.agent_id = agentId;
  if (agentType !== undefined) payload.agent_type = agentType;
  return payload;
}

module.exports = {
  pluginHome,
  writePluginState,
  seedEnabledLegacyPlugin,
  subagentStopPayload,
  preToolUsePayload,
  SETTINGS_FILES,
};
