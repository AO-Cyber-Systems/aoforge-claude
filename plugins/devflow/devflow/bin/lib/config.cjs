'use strict';

const fs = require('fs');
const path = require('path');
const { output, error } = require('./helpers.cjs');

function loadConfig(cwd) {
  const configPath = path.join(cwd, '.planning', 'config.json');
  const defaults = {
    mode: 'yolo',
    autonomous: false,
    auto_advance: true,
    model_profile: 'balanced',
    commit_docs: true,
    search_gitignored: false,
    branching_strategy: 'none',
    objective_branch_template: 'df/objective-{objective}-{slug}',
    milestone_branch_template: 'df/{milestone}-{slug}',
    research: true,
    job_checker: true,
    verifier: true,
    parallelization: true,
    brave_search: false,
    verifier_checkpoints: false,
    decision_queue: false,
  };

  try {
    const rawContent = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(rawContent);

    const get = (key, nested) => {
      if (parsed[key] !== undefined) return parsed[key];
      if (nested && parsed[nested.section] && parsed[nested.section][nested.field] !== undefined) {
        return parsed[nested.section][nested.field];
      }
      return undefined;
    };

    const parallelization = (() => {
      const val = get('parallelization');
      if (typeof val === 'boolean') return val;
      if (typeof val === 'object' && val !== null && 'enabled' in val) return val.enabled;
      return defaults.parallelization;
    })();

    const mode = get('mode', { section: 'workflow', field: 'mode' }) ?? defaults.mode;
    const autonomous = mode === 'autonomous';

    return {
      mode,
      autonomous,
      auto_advance: get('auto_advance', { section: 'workflow', field: 'auto_advance' }) ?? defaults.auto_advance,
      model_profile: get('model_profile') ?? defaults.model_profile,
      commit_docs: get('commit_docs', { section: 'planning', field: 'commit_docs' }) ?? defaults.commit_docs,
      search_gitignored: get('search_gitignored', { section: 'planning', field: 'search_gitignored' }) ?? defaults.search_gitignored,
      branching_strategy: get('branching_strategy', { section: 'git', field: 'branching_strategy' }) ?? defaults.branching_strategy,
      objective_branch_template: get('objective_branch_template', { section: 'git', field: 'objective_branch_template' }) ?? defaults.objective_branch_template,
      milestone_branch_template: get('milestone_branch_template', { section: 'git', field: 'milestone_branch_template' }) ?? defaults.milestone_branch_template,
      research: get('research', { section: 'workflow', field: 'research' }) ?? defaults.research,
      job_checker: get('job_checker', { section: 'workflow', field: 'job_check' }) ?? defaults.job_checker,
      verifier: get('verifier', { section: 'workflow', field: 'verifier' }) ?? defaults.verifier,
      parallelization,
      brave_search: get('brave_search') ?? defaults.brave_search,
      verifier_checkpoints: get('verifier_checkpoints', { section: 'workflow', field: 'verifier_checkpoints' }) ?? autonomous,
      decision_queue: get('decision_queue', { section: 'workflow', field: 'decision_queue' }) ?? autonomous,
    };
  } catch {
    return defaults;
  }
}

function cmdConfigEnsureSection(cwd, raw) {
  const configPath = path.join(cwd, '.planning', 'config.json');
  const planningDir = path.join(cwd, '.planning');

  // Ensure .planning directory exists
  try {
    if (!fs.existsSync(planningDir)) {
      fs.mkdirSync(planningDir, { recursive: true });
    }
  } catch (err) {
    error('Failed to create .planning directory: ' + err.message);
  }

  // Check if config already exists
  if (fs.existsSync(configPath)) {
    const result = { created: false, reason: 'already_exists' };
    output(result, raw, 'exists');
    return;
  }

  // Detect Brave Search API key availability
  const homedir = require('os').homedir();
  const braveKeyFile = path.join(homedir, '.devflow', 'brave_api_key');
  const hasBraveSearch = !!(process.env.BRAVE_API_KEY || fs.existsSync(braveKeyFile));

  // Load user-level defaults from ~/.devflow/defaults.json if available
  const globalDefaultsPath = path.join(homedir, '.devflow', 'defaults.json');
  let userDefaults = {};
  try {
    if (fs.existsSync(globalDefaultsPath)) {
      userDefaults = JSON.parse(fs.readFileSync(globalDefaultsPath, 'utf-8'));
    }
  } catch (err) {
    // Ignore malformed global defaults, fall back to hardcoded
  }

  // Create default config (user-level defaults override hardcoded defaults)
  const hardcoded = {
    model_profile: 'balanced',
    commit_docs: true,
    search_gitignored: false,
    branching_strategy: 'none',
    objective_branch_template: 'df/objective-{objective}-{slug}',
    milestone_branch_template: 'df/{milestone}-{slug}',
    workflow: {
      research: true,
      job_check: true,
      verifier: true,
    },
    parallelization: true,
    brave_search: hasBraveSearch,
  };
  const defaults = {
    ...hardcoded,
    ...userDefaults,
    workflow: { ...hardcoded.workflow, ...(userDefaults.workflow || {}) },
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8');
    const result = { created: true, path: '.planning/config.json' };
    output(result, raw, 'created');
  } catch (err) {
    error('Failed to create config.json: ' + err.message);
  }
}

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// Dot segments that name an object's own machinery, not a config key. A path through any of them
// would assign into Object.prototype (or a constructor's prototype) instead of into config.json
// (CodeQL js/prototype-pollution-utility). Only the exact names are reserved: `prototype_x` is a key.
const RESERVED_KEY_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function cmdConfigSet(cwd, keyPath, value, raw) {
  const configPath = path.join(cwd, '.planning', 'config.json');

  if (!keyPath) {
    error('Usage: config-set <key.path> <value>');
  }

  // Refuse before touching config.json: the user sees the error and the file stays as it was.
  const keys = keyPath.split('.');
  const bad = keys.find((k) => RESERVED_KEY_SEGMENTS.has(k));
  if (bad !== undefined) {
    error(`config-set: refusing key segment "${bad}" in "${keyPath}" (reserved object property)`);
  }

  // Parse value (handle booleans and numbers)
  let parsedValue = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (!isNaN(value) && value !== '') parsedValue = Number(value);

  // Load existing config or start with empty object
  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (err) {
    error('Failed to read config.json: ' + err.message);
  }

  // Set nested value using dot notation (e.g., "workflow.research"). The walk follows OWN
  // properties only, so an inherited name is never treated as an existing section.
  // The reserved-name checks repeat the refusal above at each assignment, where CodeQL's
  // prototype-pollution query looks for them (alert #89); they never fire after that refusal.
  let current = config;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      error(`config-set: refusing key segment "${key}" in "${keyPath}" (reserved object property)`);
    }
    if (!hasOwn(current, key) || current[key] === null || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  const leaf = keys[keys.length - 1];
  if (leaf === '__proto__' || leaf === 'constructor' || leaf === 'prototype') {
    error(`config-set: refusing key segment "${leaf}" in "${keyPath}" (reserved object property)`);
  }
  current[leaf] = parsedValue;

  // Write back
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    const result = { updated: true, key: keyPath, value: parsedValue };
    output(result, raw, `${keyPath}=${parsedValue}`);
  } catch (err) {
    error('Failed to write config.json: ' + err.message);
  }
}

// ─── Documented defaults (TRD 44-07) ──────────────────────────────────────────
//
// `config-get` answers a KNOWN key that config.json does not set with its documented default, so
// a project whose config.json predates a key (44-EVIDENCE DF-07) gets an answer rather than
// `Key not found`. Unknown keys still error, so a typo stays loud.
//
// The defaults ARE templates/config.json, read at call time. The path resolves the same way in
// the repo and in the ~/.claude/devflow mirror. Nothing below restates a default value: the
// tables hold key-path pointers only, so they cannot drift from the template.

const TEMPLATE_CONFIG_PATH = path.join(__dirname, '..', '..', 'templates', 'config.json');

// Keys agents ask for that are not template leaves -> the template leaf that answers them.
const ALIAS_DEFAULTS = {
  'workflow.parallelization': 'parallelization.enabled',
  'workflow.mode': 'mode',
};

// The other places loadConfig reads a documented key from. A value the user set in one of these
// must beat the template default, or config-get would contradict loadConfig — most commonly
// `"parallelization": true|false`, the shape new-project and config-ensure-section write.
const LEGACY_FORMS = {
  'mode': ['workflow.mode'],
  'workflow.auto_advance': ['auto_advance'],
  'workflow.research': ['research'],
  'workflow.job_check': ['job_checker'],
  'workflow.verifier': ['verifier'],
  'workflow.verifier_checkpoints': ['verifier_checkpoints'],
  'workflow.decision_queue': ['decision_queue'],
  'planning.commit_docs': ['commit_docs'],
  'planning.search_gitignored': ['search_gitignored'],
  'parallelization.enabled': ['parallelization'],
};

// Unset, these follow the mode rather than a fixed template value (loadConfig: `?? autonomous`).
const MODE_DERIVED = new Set(['workflow.verifier_checkpoints', 'workflow.decision_queue']);

/**
 * Walk a dot path through OWN properties only, so `constructor` or `toString` is never "found".
 * Returns undefined when a segment is missing or blocked by a non-object. With
 * `intoArrays: false` an array ends the walk: an array is a leaf, not a section.
 */
function getPath(obj, keyPath, { intoArrays = true } = {}) {
  let current = obj;
  for (const key of keyPath.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    if (!intoArrays && Array.isArray(current)) return undefined;
    if (!hasOwn(current, key)) return undefined;
    current = current[key];
  }
  return current;
}

function isLeaf(value) {
  return value === null || typeof value !== 'object' || Array.isArray(value);
}

/**
 * documentedDefault(keyPath, templatePath?) -> {known: true, value} | {known: false}
 *
 * Known = a leaf of templates/config.json (primitive, null or array), or an ALIAS_DEFAULTS key,
 * which answers with its target leaf. A section (`workflow`) is not a default. An unreadable or
 * malformed template (a broken install) makes every key unknown: today's `Key not found`.
 */
function documentedDefault(keyPath, templatePath = TEMPLATE_CONFIG_PATH) {
  let template;
  try {
    template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
  } catch {
    return { known: false };
  }
  const target = hasOwn(ALIAS_DEFAULTS, keyPath) ? ALIAS_DEFAULTS[keyPath] : keyPath;
  const value = getPath(template, target, { intoArrays: false });
  if (value === undefined || !isLeaf(value)) return { known: false };
  return { known: true, value };
}

/**
 * resolveConfigValue(config, keyPath) -> {found: true, value} | {found: false}
 *
 * What `config-get` answers for keyPath against a parsed config.json, in order:
 *   1. the value at keyPath, when set (unchanged from before 44-07);
 *   2. a value the user set at the alias target or a LEGACY_FORMS location;
 *   3. for MODE_DERIVED keys, `mode === 'autonomous'` (the mode itself resolved the same way);
 *   4. the documented default.
 * An unknown key is not found.
 */
function resolveConfigValue(config, keyPath) {
  const direct = getPath(config, keyPath);
  if (direct !== undefined) return { found: true, value: direct };

  const canonical = hasOwn(ALIAS_DEFAULTS, keyPath) ? ALIAS_DEFAULTS[keyPath] : keyPath;
  const forms = [canonical, ...(hasOwn(LEGACY_FORMS, canonical) ? LEGACY_FORMS[canonical] : [])];
  for (const form of forms) {
    if (form === keyPath) continue;
    const value = getPath(config, form);
    // loadConfig reads these with `??`, so null means unset; a section is not a value.
    if (value !== undefined && value !== null && typeof value !== 'object') {
      return { found: true, value };
    }
  }

  if (MODE_DERIVED.has(canonical)) {
    const mode = resolveConfigValue(config, 'mode');
    if (mode.found) return { found: true, value: mode.value === 'autonomous' };
  }

  const fallback = documentedDefault(keyPath);
  return fallback.known ? { found: true, value: fallback.value } : { found: false };
}

function cmdConfigGet(cwd, keyPath, raw) {
  const configPath = path.join(cwd, '.planning', 'config.json');

  if (!keyPath) {
    error('Usage: config-get <key.path>');
  }

  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } else {
      error('No config.json found at ' + configPath);
    }
  } catch (err) {
    if (err.message.startsWith('No config.json')) throw err;
    error('Failed to read config.json: ' + err.message);
  }

  // Dot-notation path (e.g. "workflow.auto_advance"): the configured value, else the documented
  // default for a known key. The same output() call serves both, so a default prints exactly what
  // the same value set in config.json would.
  const result = resolveConfigValue(config, keyPath);
  if (!result.found) {
    error(`Key not found: ${keyPath}`);
  }

  output(result.value, raw, String(result.value));
}

module.exports = {
  loadConfig,
  cmdConfigEnsureSection,
  cmdConfigSet,
  cmdConfigGet,
  documentedDefault,
  resolveConfigValue,
};
