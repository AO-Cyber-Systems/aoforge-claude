'use strict';

// Stack pack contract (docs/PROPOSAL-stack-packs.md §5A, objective 77).
//
// A stack pack is a Claude Code plugin (aoforge-stack-<name>) that ships an `aoforge-stack.json`
// manifest, tier-2 stack profiles, per-agent fragments, its own agents and skills, and a CLI.
// Core cannot read another plugin's files, so each pack's SessionStart hook mirrors the pack to
// `~/.claude/aoforge/stacks/<name>/` (lib/pack-mirror.cjs). This module is the core side:
//
//   discoverPacks  every mirrored pack, its manifest validated, and whether its plugin is enabled
//   activePacks    the enabled packs a project selects: config stacks.enabled, a profile id the
//                  project's resolved extends chain names, a select.runtime match, or another active
//                  pack's soft_depends platform rule. Detection only PROPOSES a pack.
//   packProfilePath  the pack tier of profile lookup (user tier, then packs, then bundled)
//
// Core names no stack here. Neutral by construction: everything stack-specific is pack data.

const fs = require('fs');
const path = require('path');
const { validate: schemaValidate } = require('./json-schema-lite.cjs');
const { installedVersion, explicitEnabled, readJsonOrNull } = require('./coexistence.cjs');

const MANIFEST = 'aoforge-stack.json';
const CONTRACT_VERSIONS = Object.freeze([1]);
const SCHEMA_PATH = path.join(__dirname, '..', '..', 'schemas', 'stack-pack.schema.json');
const MARKETPLACE = 'aocyber';

let _schema = null;
function schema() {
  if (!_schema) _schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  return _schema;
}

/** `<home>/.claude/aoforge/stacks`, overridable for tests and dev with AOFORGE_STACKS_DIR. */
function stacksDir(userHome) {
  if (process.env.AOFORGE_STACKS_DIR) return process.env.AOFORGE_STACKS_DIR;
  return path.join(userHome || require('os').homedir(), '.claude', 'aoforge', 'stacks');
}

function validateManifest(manifest) {
  const issues = schemaValidate(manifest, schema()).map((e) => `${e.path || '(root)'}: ${e.msg}`);
  if (manifest && typeof manifest.contract === 'number' && !CONTRACT_VERSIONS.includes(manifest.contract)) {
    issues.push(`contract ${manifest.contract} is not supported (core supports ${CONTRACT_VERSIONS.join(', ')})`);
  }
  return issues;
}

/**
 * Whether the pack's plugin is enabled. The registry is the truth: a mirror whose plugin is no
 * longer installed, or is explicitly disabled, is ignored. With no installed_plugins.json at all
 * (a `--plugin-dir` dev session, a test), nothing contradicts the mirror, so it counts.
 */
function pluginEnabled(userHome, plugin, fsImpl = fs) {
  // An explicit AOFORGE_STACKS_DIR is a dev or test tree named on purpose: its packs count as
  // enabled without a registry entry.
  if (process.env.AOFORGE_STACKS_DIR) return true;
  const claudeDir = path.join(userHome, '.claude');
  const registry = readJsonOrNull(path.join(claudeDir, 'plugins', 'installed_plugins.json'), fsImpl);
  const ids = [`${plugin}@${MARKETPLACE}`];
  if (registry && registry.plugins && typeof registry.plugins === 'object') {
    for (const id of Object.keys(registry.plugins)) {
      if (id.startsWith(`${plugin}@`) && !ids.includes(id)) ids.push(id);
    }
  }
  for (const id of ids) {
    if (explicitEnabled(claudeDir, id, fsImpl) === false) return false;
  }
  if (!registry) return true;
  return ids.some((id) => installedVersion(registry, id) !== null);
}

/**
 * discoverPacks({ userHome }) -> [{ name, plugin, root, manifest, enabled, issues, profiles }]
 * `profiles` maps each shipped profile id to its absolute path. A pack with a broken manifest is
 * listed with its issues and never activated.
 */
function discoverPacks({ userHome = require('os').homedir(), fsImpl = fs } = {}) {
  const dir = stacksDir(userHome);
  let entries = [];
  try {
    entries = fsImpl.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch {
    return [];
  }
  const packs = [];
  for (const name of entries) {
    const root = path.join(dir, name);
    const manifestPath = path.join(root, MANIFEST);
    if (!fsImpl.existsSync(manifestPath)) continue;
    let manifest = null;
    let issues = [];
    try {
      manifest = JSON.parse(String(fsImpl.readFileSync(manifestPath, 'utf8')));
      issues = validateManifest(manifest);
    } catch (e) {
      issues = [`${MANIFEST} is not valid JSON: ${e.message}`];
    }
    if (manifest && manifest.name && manifest.name !== name) {
      issues.push(`manifest name "${manifest.name}" does not match its mirror directory "${name}"`);
    }
    const profiles = {};
    for (const rel of (manifest && manifest.profiles) || []) {
      profiles[path.basename(rel, '.md')] = path.join(root, rel);
    }
    const plugin = (manifest && manifest.plugin) || null;
    packs.push({
      name,
      plugin,
      root,
      manifest,
      issues,
      profiles,
      enabled: issues.length === 0 && plugin ? pluginEnabled(userHome, plugin, fsImpl) : false,
    });
  }
  return packs;
}

/** The pack tier of profile lookup: the first enabled pack shipping `id`, or null. */
function packProfilePath(id, { userHome } = {}) {
  if (!userHome && !process.env.AOFORGE_STACKS_DIR) return null;
  for (const pack of discoverPacks({ userHome: userHome || require('os').homedir() })) {
    if (pack.enabled && pack.profiles[id] && fs.existsSync(pack.profiles[id])) {
      return { path: pack.profiles[id], tier: 'pack', pack: pack.name };
    }
  }
  return null;
}

function readStacksConfig(projectRoot) {
  try {
    const { planningRoot } = require('./compat.cjs');
    const cfg = JSON.parse(fs.readFileSync(path.join(planningRoot(projectRoot), 'config.json'), 'utf8'));
    const s = cfg.stacks || {};
    return {
      enabled: Array.isArray(s.enabled) ? s.enabled : [],
      disabled: Array.isArray(s.disabled) ? s.disabled : [],
    };
  } catch {
    return { enabled: [], disabled: [] };
  }
}

/** The profile ids a resolved profile's chain passed through (its extends tiers). */
function chainIds(resolved) {
  const ids = new Set();
  for (const link of (resolved && resolved.chain) || []) {
    if (link && link.id) ids.add(link.id);
    if (typeof link === 'string') ids.add(link);
  }
  if (resolved && resolved.id) ids.add(resolved.id);
  return ids;
}

/** The resolved profile's verification.runtime, or null. A scalar: `stack validate` rejects a list (STK001). */
function resolvedRuntime(resolved) {
  const v = resolved && resolved.frontmatter && resolved.frontmatter.verification;
  return v && typeof v.runtime === 'string' && v.runtime ? v.runtime : null;
}

/** A manifest's soft dependencies: [{ pack, platforms }], or []. */
function softDepends(pack) {
  const list = pack && pack.manifest && pack.manifest.soft_depends;
  return Array.isArray(list) ? list : [];
}

/**
 * projectPlatforms({ projectRoot, resolved }) -> string[] (sorted, unique)
 * The platforms a project declares: the resolved verification.runtime, then every string (or string item) of
 * `platform` and `must_haves.platform` in each `<planning dir>/objectives/<dir>/*-TRD.md`. Explicit values only: a TRD
 * with no `platform` adds nothing, because core does not know any stack's default. A TRD that cannot be read or has
 * no frontmatter is skipped; with no objectives directory the result is the runtime alone.
 */
function projectPlatforms({ projectRoot, resolved = null } = {}) {
  const out = new Set();
  const runtime = resolvedRuntime(resolved);
  if (runtime) out.add(runtime);
  const add = (v) => {
    if (typeof v === 'string' && v.trim()) out.add(v.trim());
    else if (Array.isArray(v)) for (const item of v) if (typeof item === 'string' && item.trim()) out.add(item.trim());
  };
  if (projectRoot) {
    const { planningRoot } = require('./compat.cjs');
    const { extractFrontmatter } = require('./frontmatter.cjs');
    const objectives = path.join(planningRoot(projectRoot), 'objectives');
    let dirs = [];
    try {
      dirs = fs.readdirSync(objectives, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch { /* no objectives directory: the runtime alone */ }
    for (const dir of dirs) {
      let names = [];
      try { names = fs.readdirSync(path.join(objectives, dir)).filter((n) => n.endsWith('-TRD.md')); } catch { continue; }
      for (const name of names) {
        let fm;
        try { fm = extractFrontmatter(fs.readFileSync(path.join(objectives, dir, name), 'utf8')); } catch { continue; }
        if (!fm || typeof fm !== 'object') continue;
        add(fm.platform);
        if (fm.must_haves && typeof fm.must_haves === 'object') add(fm.must_haves.platform);
      }
    }
  }
  return [...out].sort();
}

/**
 * activePacks({ projectRoot, userHome, resolved }) -> [{ ...pack, reason, soft_dependency_of? }]
 * Selected by intent, never by detection, in two passes over one discoverPacks call:
 *   1. config `stacks.enabled`, an extends chain naming one of the pack's profile ids, or a `select.runtime`
 *      matching the profile's verification.runtime.
 *   2. for each pack pass 1 selected, each `soft_depends` entry whose platforms meet projectPlatforms() selects
 *      the named enabled pack (`soft_dependency_of` names the host). One level only: a pack selected here does not
 *      bring in its own soft dependencies. The platform scan runs only when a pass-1 pack declares soft_depends.
 * `stacks.disabled` wins over every rule. The result is in discoverPacks order (by name), not selection order.
 */
function activePacks({ projectRoot, userHome = require('os').homedir(), resolved = null } = {}) {
  const cfg = readStacksConfig(projectRoot);
  const ids = chainIds(resolved);
  const runtime = resolvedRuntime(resolved);
  const discovered = discoverPacks({ userHome });
  const selected = new Map();
  for (const pack of discovered) {
    if (!pack.enabled || cfg.disabled.includes(pack.name)) continue;
    let reason = null;
    if (cfg.enabled.includes(pack.name)) reason = 'config stacks.enabled';
    else {
      const hit = Object.keys(pack.profiles).find((id) => ids.has(id));
      if (hit) reason = `profile extends ${hit}`;
      const sel = (pack.manifest && pack.manifest.select) || {};
      if (!reason && runtime && (sel.runtime || []).includes(runtime)) reason = `verification.runtime ${runtime}`;
    }
    if (reason) selected.set(pack.name, { reason });
  }
  // Pass 2 reads the pass-1 hosts captured here, so a pack it selects never becomes a host itself.
  const hosts = discovered.filter((p) => selected.has(p.name));
  let platforms = null;
  for (const host of hosts) {
    for (const dep of softDepends(host)) {
      if (selected.has(dep.pack) || cfg.disabled.includes(dep.pack)) continue;
      if (platforms === null) platforms = projectPlatforms({ projectRoot, resolved });
      const hit = (dep.platforms || []).find((p) => platforms.includes(p));
      if (!hit) continue;
      // Not installed, broken or not enabled: softDependencyWarnings reports it; selection skips it.
      if (!discovered.some((p) => p.name === dep.pack && p.enabled)) continue;
      selected.set(dep.pack, { reason: `soft dependency of ${host.name} for platform ${hit}`, host: host.name });
    }
  }
  return discovered.filter((p) => selected.has(p.name)).map((p) => {
    const s = selected.get(p.name);
    return s.host ? { ...p, reason: s.reason, soft_dependency_of: s.host } : { ...p, reason: s.reason };
  });
}

/**
 * Why the pack `name` cannot run, as { name, reason, plugin, issues, install_hint }, or null when it is enabled.
 * `remedy` ends the not-installed hint: the config change that stops asking for the pack.
 *   not_installed       no mirror under the stacks dir
 *   broken              the mirror's manifest has issues
 *   plugin_not_enabled  the mirror is valid but its plugin is not installed or is disabled
 */
function unavailableEntry(name, discovered, userHome, remedy) {
  const pack = discovered.find((p) => p.name === name);
  if (!pack) {
    return {
      name,
      reason: 'not_installed',
      plugin: null,
      issues: [],
      install_hint: `no stack pack "${name}" is mirrored under ${stacksDir(userHome)}: install and enable its plugin ` +
        `(for AOForge's packs: /plugin install aoforge-stack-${name}@${MARKETPLACE}), or ${remedy}`,
    };
  }
  if (pack.issues.length) {
    return { name, reason: 'broken', plugin: pack.plugin, issues: pack.issues, install_hint: pack.issues.join('; ') };
  }
  if (pack.enabled) return null;
  const extra = pack.manifest && pack.manifest.install_hint ? `; ${pack.manifest.install_hint}` : '';
  return {
    name,
    reason: 'plugin_not_enabled',
    plugin: pack.plugin,
    issues: [],
    install_hint: `enable the ${pack.plugin} plugin${extra}`,
  };
}

/**
 * unavailableSelectedPacks({ projectRoot, userHome, active }) -> [{ name, reason, plugin, issues, install_hint }]
 * The packs a project names in config `stacks.enabled` (and not in `stacks.disabled`: disabled wins) that are not
 * active, so they cannot run (quick 35). Without this they silently dropped out of activePacks and `stack verify`
 * passed. A pack selected only through an extends chain or `select.runtime` is out of scope: profile resolution
 * reports those, and an absent soft dependency is a softDependencyWarnings warning. `active` (activePacks' result)
 * may be passed to skip recomputing it. Reasons as unavailableEntry gives them.
 */
function unavailableSelectedPacks({ projectRoot, userHome = require('os').homedir(), active = null } = {}) {
  const cfg = readStacksConfig(projectRoot);
  const wanted = [...new Set(cfg.enabled)].filter((name) => !cfg.disabled.includes(name));
  if (!wanted.length) return [];
  // A config selection does not depend on the resolved profile, so none is needed to tell whether it is active.
  const activeNames = new Set((active || activePacks({ projectRoot, userHome })).map((p) => p.name));
  const discovered = discoverPacks({ userHome });
  const out = [];
  for (const name of wanted) {
    if (activeNames.has(name)) continue;
    const entry = unavailableEntry(name, discovered, userHome, `remove "${name}" from config.json stacks.enabled`);
    if (entry) out.push(entry);
  }
  return out;
}

/**
 * softDependencyWarnings({ projectRoot, userHome, resolved, active }) -> [{ pack, wants, platform, reason, install_hint }]
 * For each pack pass 1 of activePacks selected, each `soft_depends` entry that meets the project's platforms and
 * names a pack that is neither active nor in config `stacks.disabled`: that pack is not installed, broken or not
 * enabled (`reason` as unavailableEntry gives it). A warning, never a failure: `stack doctor` lists it and its `ok`
 * and exit code ignore it. `active` (activePacks' result) may be passed to skip recomputing it.
 */
function softDependencyWarnings({ projectRoot, userHome = require('os').homedir(), resolved = null, active = null } = {}) {
  const act = active || activePacks({ projectRoot, userHome, resolved });
  const hosts = act.filter((p) => !p.soft_dependency_of && softDepends(p).length);
  if (!hosts.length) return [];
  const cfg = readStacksConfig(projectRoot);
  const activeNames = new Set(act.map((p) => p.name));
  const platforms = projectPlatforms({ projectRoot, resolved });
  let discovered = null;
  const out = [];
  for (const host of hosts) {
    for (const dep of softDepends(host)) {
      if (activeNames.has(dep.pack) || cfg.disabled.includes(dep.pack)) continue;
      const hit = (dep.platforms || []).find((p) => platforms.includes(p));
      if (!hit) continue;
      if (discovered === null) discovered = discoverPacks({ userHome });
      const entry = unavailableEntry(dep.pack, discovered, userHome, `add "${dep.pack}" to config.json stacks.disabled`);
      if (entry) out.push({ pack: host.name, wants: dep.pack, platform: hit, reason: entry.reason, install_hint: entry.install_hint });
    }
  }
  return out;
}

/** Packs whose detect files exist in the repo but that the project has not selected. */
function proposedPacks({ projectRoot, userHome = require('os').homedir(), active = [] } = {}) {
  const activeNames = new Set(active.map((p) => p.name));
  const out = [];
  for (const pack of discoverPacks({ userHome })) {
    if (activeNames.has(pack.name) || !pack.manifest || !pack.manifest.detect) continue;
    const files = (pack.manifest.detect.files || []).filter((f) => fs.existsSync(path.join(projectRoot, f)));
    if (files.length) out.push({ name: pack.name, plugin: pack.plugin, enabled: pack.enabled, evidence: files });
  }
  return out;
}

/** Fragment pointers and sub-agents for one core agent across the active packs. */
function agentExtras(packs, agent) {
  const fragments = [];
  const subagents = [];
  for (const pack of packs) {
    const m = pack.manifest || {};
    const rel = m.fragments && m.fragments[agent];
    if (rel) fragments.push({ pack: pack.name, path: path.join(pack.root, rel) });
    for (const s of (m.subagents && m.subagents[agent]) || []) {
      subagents.push({ pack: pack.name, agent: `${pack.plugin}:${s.agent}`, when: s.when || null });
    }
  }
  return { fragments, subagents };
}

/** The text block `stack context` appends: one Read pointer per fragment, one line per sub-agent. */
function renderExtras({ fragments, subagents }) {
  if (!fragments.length && !subagents.length) return '';
  const lines = ['## Stack packs', ''];
  for (const f of fragments) {
    lines.push(`- ${f.pack}: Read \`${f.path}\` and follow it where its gates say it applies.`);
  }
  for (const s of subagents) {
    lines.push(`- ${s.pack}: delegate to the \`${s.agent}\` agent${s.when ? ` when ${s.when}` : ''}.`);
  }
  return lines.join('\n');
}

/** A pack agent's tier map from the manifests of every enabled pack, or null. */
function packAgentTiers(agent, { userHome = require('os').homedir() } = {}) {
  const bare = String(agent).includes(':') ? String(agent).split(':').pop() : String(agent);
  for (const pack of discoverPacks({ userHome })) {
    if (!pack.enabled) continue;
    const models = (pack.manifest && pack.manifest.models) || {};
    if (models[bare]) return { tiers: models[bare], pack: pack.name };
  }
  return null;
}

/** The absolute path of a pack's CLI entry, or null. */
function packCli(pack) {
  return pack && pack.manifest && pack.manifest.cli ? path.join(pack.root, pack.manifest.cli) : null;
}

module.exports = {
  MANIFEST,
  CONTRACT_VERSIONS,
  stacksDir,
  validateManifest,
  pluginEnabled,
  discoverPacks,
  packProfilePath,
  readStacksConfig,
  projectPlatforms,
  activePacks,
  unavailableSelectedPacks,
  softDependencyWarnings,
  proposedPacks,
  agentExtras,
  renderExtras,
  packAgentTiers,
  packCli,
};
