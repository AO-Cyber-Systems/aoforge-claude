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
 * It deliberately carries no "latest model" table: ids are reported structurally, so the check
 * cannot go stale the way a hard-coded list would. No fix(): the ids live in the plugin source and
 * change only with a release.
 */

const fs = require('fs');
const path = require('path');

const helpers = require('../helpers.cjs');

const MODEL_ID_RE = /^claude-[a-z]+-\d+(-\d+)*(\[1m\])?$/;
const REL = path.join('references', 'model-profiles.json');
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
