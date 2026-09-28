'use strict';

// Migration 0001 — config-stamp (TRD 36-04a).
//
// Guarantees `.planning/config.json` exists and has the nested shape of templates/config.json,
// without changing a single effective setting: `loadConfig(before)` deep-equals `loadConfig(after)`
// for every config this migration rewrites. The runner (lib/upgrade.cjs) writes the `devflow{}`
// stamp itself; this migration only guarantees the file and its shape.
//
// `validate health --repair` (W003 / E005) writes `buildConfig(null)` — the template — so the
// config shape lives in exactly one place.

const fs = require('fs');
const path = require('path');

const CONFIG_REL = '.planning/config.json';
const TEMPLATE_PATH = path.join(__dirname, '..', '..', '..', 'templates', 'config.json');

// Mirrors lib/config.cjs loadConfig's `get(flatKey, { section, field })` pairs exactly. loadConfig
// reads the flat key first, so when both exist the flat value is the effective one and wins.
// Top-level only (left in place): mode, model_profile, brave_search, devflow, any unknown key.
// `parallelization: <boolean>` is handled separately (it becomes `{ ...template, enabled }`).
const FLAT_TO_NESTED = Object.freeze({
  commit_docs: Object.freeze(['planning', 'commit_docs']),
  search_gitignored: Object.freeze(['planning', 'search_gitignored']),
  auto_advance: Object.freeze(['workflow', 'auto_advance']),
  research: Object.freeze(['workflow', 'research']),
  job_checker: Object.freeze(['workflow', 'job_check']),
  verifier: Object.freeze(['workflow', 'verifier']),
  verifier_checkpoints: Object.freeze(['workflow', 'verifier_checkpoints']),
  decision_queue: Object.freeze(['workflow', 'decision_queue']),
  branching_strategy: Object.freeze(['git', 'branching_strategy']),
  objective_branch_template: Object.freeze(['git', 'objective_branch_template']),
  milestone_branch_template: Object.freeze(['git', 'milestone_branch_template']),
});

// loadConfig derives these from `mode === 'autonomous'` when absent. Filling them from the template
// (`false`) would switch an autonomous project's checkpoints and decision queue off, so the
// template never adds them to an existing config.
const NEVER_FILL = new Set(['workflow.verifier_checkpoints', 'workflow.decision_queue']);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function readTemplate() {
  return JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf-8'));
}

// Flat keys buildConfig will move. A flat key whose target section exists but is not an object is
// left where it is (moving it would mean discarding that section's value).
function flatKeysIn(cfg) {
  const keys = [];
  for (const [key, [section]] of Object.entries(FLAT_TO_NESTED)) {
    if (!has(cfg, key) || cfg[key] === undefined) continue;
    if (cfg[section] !== undefined && !isPlainObject(cfg[section])) continue;
    keys.push(key);
  }
  if (typeof cfg.parallelization === 'boolean') keys.push('parallelization');
  return keys;
}

function missingSections(cfg, tpl) {
  return Object.keys(tpl).filter((k) => isPlainObject(tpl[k]) && cfg[k] === undefined);
}

// Fill keys missing from `target` with the template's values. Never overwrites a present key.
function fillUnder(target, tpl, trail, skip) {
  for (const [k, v] of Object.entries(tpl)) {
    const keyPath = trail ? `${trail}.${k}` : k;
    if (skip.has(keyPath)) continue;
    if (target[k] === undefined) {
      target[k] = structuredClone(v);
    } else if (isPlainObject(target[k]) && isPlainObject(v)) {
      fillUnder(target[k], v, keyPath, skip);
    }
  }
}

/**
 * buildConfig(existing | null) -> the nested-shape config.
 *
 * null -> a fresh copy of templates/config.json (what `validate health --repair` writes).
 * An object -> flat v1 keys moved to their nested home (flat wins), a boolean `parallelization`
 * expanded, and the template filled in UNDER the result (missing keys only). Unknown keys and
 * `devflow` are kept as they are. Never mutates `existing`.
 */
function buildConfig(existing) {
  const tpl = readTemplate();
  if (existing === null || existing === undefined) return tpl;
  if (!isPlainObject(existing)) throw new TypeError('buildConfig expects a config object or null');

  const out = structuredClone(existing);
  for (const key of flatKeysIn(existing)) {
    if (key === 'parallelization') continue;
    const [section, field] = FLAT_TO_NESTED[key];
    if (!isPlainObject(out[section])) out[section] = {};
    out[section][field] = out[key];
    delete out[key];
  }
  if (typeof out.parallelization === 'boolean') {
    out.parallelization = { ...structuredClone(tpl.parallelization), enabled: out.parallelization };
  }

  const skip = new Set(NEVER_FILL);
  // A nested `workflow.mode` is read only when there is no top-level `mode`; adding the template's
  // top-level `mode` would shadow it.
  if (isPlainObject(out.workflow) && out.workflow.mode !== undefined) skip.add('mode');
  fillUnder(out, tpl, '', skip);

  // Template sections first, in template order; everything else after, in its original order.
  const ordered = {};
  for (const k of Object.keys(tpl)) if (has(out, k)) ordered[k] = out[k];
  for (const k of Object.keys(out)) if (!has(ordered, k)) ordered[k] = out[k];
  return ordered;
}

// -> { absent: true } | { error } | { config }
function readExisting(projectRoot) {
  const p = path.join(projectRoot, CONFIG_REL);
  if (!fs.existsSync(p)) return { absent: true };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    return { error: `${CONFIG_REL} is not valid JSON (${e.message.split('\n')[0]}); left untouched` };
  }
  if (!isPlainObject(parsed)) return { error: `${CONFIG_REL} is not a JSON object; left untouched` };
  return { config: parsed };
}

function detect(ctx) {
  const planningDir = path.join(ctx.projectRoot, '.planning');
  if (!fs.existsSync(planningDir) || !fs.statSync(planningDir).isDirectory()) {
    return { applies: false, reason: 'no .planning/ directory (not a DevFlow project)' };
  }
  const read = readExisting(ctx.projectRoot);
  if (read.absent) return { applies: true, reason: `${CONFIG_REL} is absent` };
  if (read.error) return { applies: false, reason: read.error };

  const flat = flatKeysIn(read.config);
  if (flat.length) return { applies: true, reason: `flat v1 keys to nest: ${flat.join(', ')}` };

  const missing = missingSections(read.config, readTemplate());
  if (missing.length) return { applies: true, reason: `missing template section(s): ${missing.join(', ')}` };

  return { applies: false, reason: `${CONFIG_REL} already has the nested template shape` };
}

function apply(ctx) {
  const read = readExisting(ctx.projectRoot);
  if (read.error) throw new Error(read.error);
  const existing = read.absent ? null : read.config;
  const next = buildConfig(existing);

  if (!ctx.dryRun) {
    const p = path.join(ctx.projectRoot, CONFIG_REL);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(next, null, 2) + '\n', 'utf-8');
  }

  const notes = existing === null
    ? { created: true }
    : { nested: flatKeysIn(existing), added_sections: missingSections(existing, readTemplate()) };
  return { changed: [CONFIG_REL], notes };
}

module.exports = {
  id: '0001',
  title: 'Normalise .planning/config.json to the nested template shape',
  since: '2.11.0',
  safety: 'auto',
  detect,
  apply,
  buildConfig,
  FLAT_TO_NESTED,
};
