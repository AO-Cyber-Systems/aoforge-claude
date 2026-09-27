'use strict';

// Upgrade runner (objective 36). Migrations live in ./migrations/NNNN-<slug>.cjs and export
//   { id, title, since, safety: 'auto'|'confirm', detect(ctx) -> {applies, reason},
//     apply(ctx) -> {changed: [relative posix paths], notes} }.
// ctx = { projectRoot, userHome, pluginVersion, dryRun, options }.
//
// Migrations are detection-based and idempotent: `detect` reads the files and decides; the
// config.json `devflow` stamp is only a record of what ran.
//
// `userHome` is always injected by the caller (CLI, hook, tests). This module never resolves the
// operator's home directory itself, so a test can never touch the real one.

const fs = require('fs');
const path = require('path');

const DEFAULT_REGISTRY_DIR = path.join(__dirname, 'migrations');

const MIGRATION_FILE_RE = /^(\d{4})-[a-z0-9-]+\.cjs$/;
const ID_RE = /^\d{4}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const SAFETY_VALUES = ['auto', 'confirm'];

class RegistryError extends Error {
  constructor(problems) {
    const list = (Array.isArray(problems) ? problems : [problems]).map(String);
    super(`upgrade registry invalid:\n- ${list.join('\n- ')}`);
    this.name = 'RegistryError';
    this.problems = list;
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

function contractIssues(mod, fileId) {
  if (!mod || typeof mod !== 'object') return ['does not export an object'];
  const issues = [];
  if (mod.id === undefined) {
    issues.push('missing id');
  } else if (typeof mod.id !== 'string' || !ID_RE.test(mod.id)) {
    issues.push(`id must be a 4-digit string (got ${JSON.stringify(mod.id)})`);
  } else if (mod.id !== fileId) {
    issues.push(`id ${mod.id} does not match filename id ${fileId} (id/filename mismatch)`);
  }
  if (typeof mod.title !== 'string' || !mod.title.trim()) {
    issues.push('missing title (must be a non-empty string)');
  }
  if (typeof mod.since !== 'string' || !SEMVER_RE.test(mod.since)) {
    issues.push(`since must be X.Y.Z (got ${JSON.stringify(mod.since)})`);
  }
  if (!SAFETY_VALUES.includes(mod.safety)) {
    issues.push(`safety must be one of ${SAFETY_VALUES.join('|')} (got ${JSON.stringify(mod.safety)})`);
  }
  if (typeof mod.detect !== 'function') issues.push('missing detect (must be a function)');
  if (typeof mod.apply !== 'function') issues.push('missing apply (must be a function)');
  return issues;
}

/**
 * loadRegistry({ registryDir }) -> migrations sorted by numeric id.
 *
 * Only `NNNN-<slug>.cjs` files are loaded; `*.test.cjs` and anything else is ignored. A missing
 * dir is an empty registry. Every contract violation, load failure and duplicate id is collected
 * and thrown as ONE RegistryError with one `problems` entry per bad file.
 */
function loadRegistry({ registryDir = DEFAULT_REGISTRY_DIR } = {}) {
  if (!fs.existsSync(registryDir) || !fs.statSync(registryDir).isDirectory()) return [];

  const files = fs.readdirSync(registryDir)
    .filter((name) => !name.endsWith('.test.cjs') && MIGRATION_FILE_RE.test(name))
    .sort();

  const issuesByFile = new Map();
  const addIssue = (file, issue) => {
    if (!issuesByFile.has(file)) issuesByFile.set(file, []);
    issuesByFile.get(file).push(issue);
  };

  const loaded = [];
  for (const file of files) {
    const abs = path.join(registryDir, file);
    if (!fs.statSync(abs).isFile()) continue;
    const fileId = MIGRATION_FILE_RE.exec(file)[1];
    let mod;
    try {
      delete require.cache[require.resolve(abs)];
      mod = require(abs);
    } catch (e) {
      addIssue(file, `failed to load: ${e.message.split('\n')[0]}`);
      continue;
    }
    const issues = contractIssues(mod, fileId);
    if (issues.length) {
      for (const issue of issues) addIssue(file, issue);
      continue;
    }
    loaded.push({
      id: mod.id,
      title: mod.title,
      since: mod.since,
      safety: mod.safety,
      detect: mod.detect,
      apply: mod.apply,
      file: abs,
    });
  }

  const byId = new Map();
  for (const m of loaded) {
    if (!byId.has(m.id)) byId.set(m.id, []);
    byId.get(m.id).push(path.basename(m.file));
  }
  for (const [id, owners] of byId) {
    if (owners.length < 2) continue;
    for (const file of owners) {
      const others = owners.filter((f) => f !== file).join(', ');
      addIssue(file, `duplicate id ${id} (also in ${others})`);
    }
  }

  if (issuesByFile.size) {
    const problems = [...issuesByFile.keys()].sort()
      .map((file) => `${file}: ${issuesByFile.get(file).join('; ')}`);
    throw new RegistryError(problems);
  }

  return loaded.sort((a, b) => Number(a.id) - Number(b.id));
}

module.exports = {
  loadRegistry,
  RegistryError,
  DEFAULT_REGISTRY_DIR,
};
