'use strict';

/**
 * model-profiles — doctor check (TRD 45-05, DOC-05). REPORT ONLY.
 *
 * `model-profiles.json` has two maps with different consumers (its own `_comment` says so):
 * `models{}` (tier -> concrete API model id, sent to the Messages API by the vision judge, so a stale
 * id is a real runtime defect) and `agents{}` (agent -> tier per profile). This check validates the
 * structure of the copy the running engine uses (the mirror, else the installed plugin's), and flags
 * a mirror whose ids differ from the installed plugin's.
 *
 * Since TRD 61-07 (OBS-01) it also flags a pinned id that is not current, and it still carries no
 * "latest model" table, because a hard-coded list goes stale itself. Currency comes from data:
 * `references/model-rates.json`, the priced table kept current from the pricing page, read from the
 * same copy as the profiles (else the installed plugin's, else the engine's own), through
 * model-currency.staleModelIds. A pin is superseded when that table prices a newer version of its
 * family, and unpriced when the table does not know it. Stale findings are appended after the
 * structural and drift ones. No fix(): the ids live in the plugin source and change only with a release.
 */

const fs = require('fs');
const path = require('path');

const helpers = require('../helpers.cjs');
const { loadRates, RATES_PATH } = require('../calibration-inputs.cjs');
const { staleModelIds } = require('../model-currency.cjs');

const MODEL_ID_RE = /^claude-[a-z]+-\d+(-\d+)*(\[1m\])?$/;
const REL = path.join('references', 'model-profiles.json');
const RATES_REL = path.join('references', 'model-rates.json');
const MAX_LISTED_ISSUES = 6;

const SOURCE_HINT = 'update models in plugins/devflow/devflow/references/model-profiles.json and release';
const DRIFT_HINT = 'run `df-tools doctor --fix` to re-mirror the runtime, or start a new Claude Code session';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/** Read one copy: `{state: 'ok', data}` | `{state: 'missing'}` | `{state: 'unparseable', error}`. */
function load(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf-8');
  } catch (e) {
    return e && e.code === 'ENOENT' ? { state: 'missing' } : { state: 'unparseable', error: e && e.message };
  }
  try {
    return { state: 'ok', data: JSON.parse(text) };
  } catch (e) {
    return { state: 'unparseable', error: e.message };
  }
}

/** Structural problems in one parsed document. Never throws, whatever the shape. */
function validate(doc) {
  const problems = [];
  if (!isPlainObject(doc)) return ['not a JSON object'];

  const modelsOk = isPlainObject(doc.models);
  if (!modelsOk) {
    problems.push('models{} is missing or not an object');
  } else {
    for (const [tier, id] of Object.entries(doc.models)) {
      if (typeof id !== 'string' || !MODEL_ID_RE.test(id)) {
        problems.push(`models.${tier} = ${JSON.stringify(id)} is not a claude model id`);
      }
    }
  }

  if (!isPlainObject(doc.agents)) {
    problems.push('agents{} is missing or not an object');
  } else {
    for (const [agent, tiers] of Object.entries(doc.agents)) {
      if (!isPlainObject(tiers)) {
        problems.push(`agents.${agent} is not an object`);
        continue;
      }
      if (!modelsOk) continue; // nothing to resolve the tier names against
      for (const [profile, key] of Object.entries(tiers)) {
        if (typeof key !== 'string' || !has(doc.models, key)) {
          problems.push(`agents.${agent}.${profile} names undefined model key ${JSON.stringify(key)}`);
        }
      }
    }
  }
  return problems;
}

function idList(models) {
  return Object.entries(models).map(([k, v]) => `${k}=${v}`).join(', ');
}

function sameModels(a, b) {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}

/**
 * The first rate table that loads, in order: `{ name, rates, errors }`. A copy without the file is
 * skipped silently; a copy whose file exists but does not load is an error, and the next one is tried.
 */
function resolveRates(candidates) {
  const errors = [];
  for (const [name, file] of candidates) {
    if (name !== 'engine' && !fs.existsSync(file)) continue;
    const rates = loadRates(file);
    if (rates.ok) return { name, rates, errors };
    errors.push(`${name} model-rates.json could not be read (${rates.error})`);
  }
  return { name: null, rates: null, errors };
}

function staleMessage(s) {
  return s.reason === 'superseded'
    ? `models.${s.tier} = ${s.id} is superseded by ${s.current} (model-rates.json)`
    : `models.${s.tier} = ${s.id} is not in model-rates.json, so its currency cannot be checked`;
}

module.exports = {
  id: 'model-profiles',
  title: 'model-profiles.json model ids are well-formed and current',
  scope: 'global',

  run(ctx) {
    const installed = helpers.installedPlugin({ homeDir: ctx.userHome });
    const mirror = load(path.join(ctx.paths.mirrorDir, REL));
    const inst = installed && installed.installPath
      ? load(path.join(installed.installPath, 'devflow', REL))
      : { state: 'missing' };

    const issues = [];
    let drift = false;

    for (const [name, src] of [['mirror', mirror], ['installed', inst]]) {
      if (src.state === 'unparseable') issues.push(`${name} model-profiles.json is not valid JSON (${src.error})`);
    }

    const preferred = mirror.state === 'ok'
      ? { name: 'mirror', doc: mirror.data }
      : inst.state === 'ok' ? { name: 'installed', doc: inst.data } : null;

    if (!preferred) {
      if (mirror.state === 'missing' && inst.state === 'missing') {
        issues.push('model-profiles.json not found in the runtime mirror or the installed plugin');
      }
      return {
        severity: 'warn',
        finding: issues.join('; '),
        fixable: false,
        fix_command: SOURCE_HINT,
      };
    }

    const models = isPlainObject(preferred.doc && preferred.doc.models) ? preferred.doc.models : undefined;
    const details = { models, source: preferred.name };
    if (preferred.name === 'mirror' && inst.state === 'ok' && isPlainObject(inst.data && inst.data.models)) {
      details.installed_models = inst.data.models;
    }

    const problems = validate(preferred.doc);
    for (const p of problems) issues.push(`${preferred.name} model-profiles.json: ${p}`);

    if (models && details.installed_models && !sameModels(models, details.installed_models)) {
      drift = true;
      issues.push(
        `mirror model ids differ from installed plugin (mirror: ${idList(models)}; installed: ${idList(details.installed_models)})`
      );
    }

    // Currency (TRD 61-07): the rate table beside the copy in use, else the installed plugin's, else the engine's.
    if (models) {
      const candidates = [];
      if (preferred.name === 'mirror') candidates.push(['mirror', path.join(ctx.paths.mirrorDir, RATES_REL)]);
      if (installed && installed.installPath) {
        candidates.push(['installed', path.join(installed.installPath, 'devflow', RATES_REL)]);
      }
      candidates.push(['engine', RATES_PATH]);
      const resolved = resolveRates(candidates);
      issues.push(...resolved.errors);
      details.rates_source = resolved.name;
      // A malformed id is already reported structurally above; judge only the well-formed ones.
      const wellFormed = {};
      for (const [tier, id] of Object.entries(models)) {
        if (typeof id === 'string' && MODEL_ID_RE.test(id)) wellFormed[tier] = id;
      }
      details.stale = resolved.rates ? staleModelIds(wellFormed, resolved.rates) : [];
      for (const s of details.stale) issues.push(`${preferred.name} model-profiles.json: ${staleMessage(s)}`);
    }

    if (issues.length === 0) {
      return {
        severity: 'ok',
        finding: `models: ${idList(models)}`,
        fixable: false,
        details,
      };
    }

    details.issues = issues;
    const listed = issues.slice(0, MAX_LISTED_ISSUES);
    const more = issues.length - listed.length;
    return {
      severity: 'warn',
      finding: listed.join('; ') + (more > 0 ? `; +${more} more` : ''),
      fixable: false,
      fix_command: drift && issues.length === 1 ? DRIFT_HINT : SOURCE_HINT,
      details,
    };
  },
};
