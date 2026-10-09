'use strict';

/**
 * legacy-doctor-fixtures.cjs (objective 72, TRD 72-15) — fake user homes and projects carrying what the rename left
 * behind, for the doctor's legacy checks (15 legacy-df-install, 16 legacy-plugin-runtime, 27 legacy-planning-layout).
 *
 *   const h = leftoverHome({ dfSkills: ['df-quick'], dfAgents: ['df-planner'] });
 *   h.home; h.claudeDir; h.skillsDir; h.agentsDir; h.legacyHome; h.runtimeHome; h.cleanup();
 *
 *   leftoverHome({ legacyRuntime: true })                          // old runtime home, no migration marker
 *   leftoverHome({ legacyRuntime: true, migrated: true })          // old runtime home left after the migration
 *   leftoverHome({ devflowEnabled: true })                         // the old plugin installed and enabled
 *   leftoverHome({ devflowEnabled: false })                        // installed, disabled in settings.json
 *
 *   const p = leftoverProject({ layout: 'legacy', configKey: 'legacy' });   // W066 + W067
 *   p.root; p.home; p.cleanup();
 *
 *   const ctx = doctorCtx({ home: h.home, env: { DEVFLOW_SKIP_EDIT_GATE: '1' }, projectRoot: p.root });
 *
 * leftoverHome options:
 *   dfSkills        names of legacy skill directories under `<home>/.claude/skills/` (each gets a SKILL.md)
 *   dfAgents        names of legacy agent files under `<home>/.claude/agents/` (`<name>.md`)
 *   otherSkills     non-legacy skill directories under `<home>/.claude/skills/` (default `['synced']`, the one this
 *                   machine has), which must never be reported or moved
 *   legacyRuntime   true: the old runtime home `<home>/.claude/devflow/`, populated by 72-07's legacyRuntimeHome
 *   migrated        true (needs legacyRuntime): run 72-07's migration once, so the new home holds its marker
 *   devflowEnabled  null (default): the old plugin is not installed. true: installed 2.15.0 with no enabledPlugins
 *                   entry (Claude Code's default for an installed plugin is enabled). false: installed 2.15.0 and
 *                   disabled in settings.json. AOForge 3.0.0 is installed and enabled in every case (72-10's
 *                   writePluginState), which also writes `<home>/.claude/aoforge/.plugin-version`.
 *
 * leftoverProject options (built on 72-05's planningProject):
 *   layout          'aoforge' | 'legacy' | 'both' (the planning directories present)
 *   configKey       'aoforge' | 'legacy' | 'both' | 'none': which key config.json records its upgrades under
 *   git             false (default) or true (a committed repository)
 *
 * doctorCtx builds the context the way `doctor.cjs` does (doctor.buildContext) with a fixed `now` and plugin version,
 * so a check's run()/fix() can be called directly. `env` defaults to `{}`: a check never sees the caller's variables.
 *
 * Legacy names may be spelled here: this is one of the `__fixtures__/legacy-*` files the rename codemod and the
 * rename guard leave alone. Directory and plugin ids still come from legacy-names.cjs. Every file content is a short
 * hand-written literal; nothing reads or writes the real home.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const doctor = require('../doctor.cjs');
const { NAMES, LEGACY } = require('../legacy-names.cjs');
const { legacyRuntimeHome } = require('./legacy-runtime-fixtures.cjs');
const { writePluginState } = require('./legacy-plugin-fixtures.cjs');
const { planningProject } = require('./legacy-layout-fixtures.cjs');
const { migrateLegacyRuntime } = require('../runtime-state-migrate.cjs');

const FIXED_NOW = new Date('2026-10-09T03:00:00.000Z');
const PLUGIN_VERSION = '3.0.0';
const LEGACY_PLUGIN_VERSION = '2.15.0';

const CONFIG_KEYS = Object.freeze(['aoforge', 'legacy', 'both', 'none']);
const LAYOUTS = Object.freeze(['aoforge', 'legacy', 'both']);

/** A legacy skill's SKILL.md, as the pre-plugin installer copied it. */
function legacySkillMd(name) {
  return `---\nname: ${name}\ndescription: Legacy ${LEGACY.product} skill left by the pre-plugin installer\n---\n\n# ${name}\n`;
}

/** A legacy agent file. */
function legacyAgentMd(name) {
  return `---\nname: ${name}\ndescription: Legacy ${LEGACY.product} agent left by the pre-plugin installer\n---\n\n<role>${name}</role>\n`;
}

/** A user's own skill that is not a legacy install. */
function ownSkillMd(name) {
  return `---\nname: ${name}\ndescription: The user's own skill\n---\n\n# ${name}\n`;
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function pluginStateFor(devflowEnabled) {
  if (devflowEnabled === null || devflowEnabled === undefined) return { devflow: null };
  if (devflowEnabled === true) return { devflow: { version: LEGACY_PLUGIN_VERSION } };
  if (devflowEnabled === false) return { devflow: { version: LEGACY_PLUGIN_VERSION, enabled: false } };
  throw new Error(`leftoverHome: devflowEnabled must be null, true or false (got ${JSON.stringify(devflowEnabled)})`);
}

/**
 * A fresh fake home with the leftovers `opts` describes. See the header for the options.
 *
 * @returns {{home: string, claudeDir: string, skillsDir: string, agentsDir: string, legacyHome: string,
 *            runtimeHome: string, files: Record<string, string>, migration: object|null, cleanup: () => void}}
 */
function leftoverHome({
  dfSkills = [],
  dfAgents = [],
  otherSkills = ['synced'],
  legacyRuntime = false,
  migrated = false,
  devflowEnabled = null,
} = {}) {
  if (migrated && !legacyRuntime) throw new Error('leftoverHome: migrated needs legacyRuntime');

  let runtime = null;
  let home;
  if (legacyRuntime) {
    runtime = legacyRuntimeHome();
    home = runtime.home;
  } else {
    home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aof-leftover-home-')));
  }

  const claudeDir = path.join(home, '.claude');
  const skillsDir = path.join(claudeDir, 'skills');
  const agentsDir = path.join(claudeDir, 'agents');
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });

  // Relative to `.claude`, posix separators: the same form global-upgrade.findLegacy reports.
  const files = {};
  for (const name of dfSkills) {
    if (!name.startsWith(LEGACY.installPrefix)) throw new Error(`leftoverHome: ${name} is not a legacy skill name`);
    files[`skills/${name}/SKILL.md`] = legacySkillMd(name);
  }
  for (const name of dfAgents) {
    if (!name.startsWith(LEGACY.installPrefix)) throw new Error(`leftoverHome: ${name} is not a legacy agent name`);
    files[`agents/${name}.md`] = legacyAgentMd(name);
  }
  for (const name of otherSkills) {
    if (name.startsWith(LEGACY.installPrefix)) throw new Error(`leftoverHome: ${name} is a legacy name, not the user's own`);
    files[`skills/${name}/SKILL.md`] = ownSkillMd(name);
  }
  for (const [rel, content] of Object.entries(files)) writeFile(path.join(claudeDir, ...rel.split('/')), content);

  writePluginState(home, { ...pluginStateFor(devflowEnabled), aoforge: { version: PLUGIN_VERSION } });

  const migration = migrated ? migrateLegacyRuntime({ userHome: home, now: FIXED_NOW }) : null;

  return {
    home,
    claudeDir,
    skillsDir,
    agentsDir,
    legacyHome: path.join(claudeDir, LEGACY.runtimeDir),
    runtimeHome: path.join(claudeDir, NAMES.runtimeDir),
    files,
    migration,
    cleanup() {
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

/** config.json text whose upgrade stamp sits under `configKey` (see the header). */
function configWithKey(configKey) {
  const stamp = { version: LEGACY_PLUGIN_VERSION, migrations_applied: ['0001', '0003', '0005'], upgraded_at: '2026-10-01T00:00:00.000Z' };
  const config = { mode: 'yolo', github: { enabled: false }, workflow: { auto_advance: false } };
  if (configKey === 'aoforge' || configKey === 'both') config[NAMES.configKey] = { ...stamp, version: PLUGIN_VERSION };
  if (configKey === 'legacy' || configKey === 'both') config[LEGACY.configKey] = stamp;
  return `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * A temp project in `layout` whose config.json records its upgrades under `configKey`.
 *
 * @returns {{root: string, home: string, layout: string, configKey: string, env: object, cleanup: () => void}}
 */
function leftoverProject({ layout = 'aoforge', configKey = 'aoforge', git = false } = {}) {
  if (!LAYOUTS.includes(layout)) throw new Error(`leftoverProject: unknown layout ${JSON.stringify(layout)}`);
  if (!CONFIG_KEYS.includes(configKey)) throw new Error(`leftoverProject: unknown configKey ${JSON.stringify(configKey)}`);
  const p = planningProject({ layout, git, files: { 'config.json': configWithKey(configKey) } });
  return { root: fs.realpathSync(p.root), home: p.home, layout, configKey, env: p.env, cleanup: p.cleanup };
}

/**
 * The doctor context for a fake home (and optionally a project), built by doctor.buildContext like the engine does.
 *
 * @param {{home: string, env?: object, projectRoot?: string|null, now?: Date, pluginVersion?: string}} opts
 */
function doctorCtx({ home, env = {}, projectRoot = null, now = FIXED_NOW, pluginVersion = PLUGIN_VERSION } = {}) {
  return doctor.buildContext({ projectRoot, userHome: home, env, now, pluginVersion });
}

module.exports = {
  leftoverHome,
  leftoverProject,
  doctorCtx,
  configWithKey,
  FIXED_NOW,
  PLUGIN_VERSION,
  LEGACY_PLUGIN_VERSION,
  CONFIG_KEYS,
  LAYOUTS,
};
