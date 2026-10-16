'use strict';

// Stack pack contract (docs/PROPOSAL-stack-packs.md §5A, objective 77).
//
// A stack pack is a Claude Code plugin (aoforge-stack-<name>) that ships an `aoforge-stack.json`
// manifest, tier-2 stack profiles, per-agent fragments, its own agents and skills, and a CLI.
// Core cannot read another plugin's files, so each pack's SessionStart hook mirrors the pack to
// `~/.claude/aoforge/stacks/<name>/` (lib/pack-mirror.cjs). This module is the core side:
//
//   discoverPacks  every mirrored pack, its manifest validated, and whether its plugin is enabled
//   activePacks    the enabled packs a project selects: config stacks.enabled, or a profile id the
//                  project's resolved extends chain names. Detection only PROPOSES a pack.
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

/**
 * activePacks({ projectRoot, userHome, resolved }) -> [{ ...pack, reason }]
 * Selected by intent, never by detection: config `stacks.enabled`, an extends chain naming one of
 * the pack's profile ids, or a `select.runtime` matching the profile's verification.runtime.
 * `stacks.disabled` wins over all three.
 */
function activePacks({ projectRoot, userHome = require('os').homedir(), resolved = null } = {}) {
  const cfg = readStacksConfig(projectRoot);
  const ids = chainIds(resolved);
  const out = [];
  for (const pack of discoverPacks({ userHome })) {
    if (!pack.enabled || cfg.disabled.includes(pack.name)) continue;
    let reason = null;
    if (cfg.enabled.includes(pack.name)) reason = 'config stacks.enabled';
    else {
      const hit = Object.keys(pack.profiles).find((id) => ids.has(id));
      if (hit) reason = `profile extends ${hit}`;
      const runtime = resolved && resolved.frontmatter && resolved.frontmatter.verification
        ? resolved.frontmatter.verification.runtime : null;
      const sel = (pack.manifest && pack.manifest.select) || {};
      if (!reason && runtime && (sel.runtime || []).includes(runtime)) reason = `verification.runtime ${runtime}`;
    }
    if (reason) out.push({ ...pack, reason });
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
  activePacks,
  proposedPacks,
  agentExtras,
  renderExtras,
  packAgentTiers,
  packCli,
};
