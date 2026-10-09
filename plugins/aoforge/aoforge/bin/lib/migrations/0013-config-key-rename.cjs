'use strict';

// Migration 0013 — config-key rename (objective 72, TRD 72-08, INST-03/04).
//
// The upgrade runner records what ran in config.json under NAMES.configKey (`aoforge`). A pre-rename install wrote the
// same object under LEGACY.configKey. For one release the runner reads either (upgrade.readStamp: the new key first);
// this auto migration renames the legacy key so the file carries only the new one:
//
//   only the legacy key   renamed in place: same value, same position, every other key in its order
//   both keys             one object, a shallow merge in which the new key's values win, at the new key's position;
//                         the legacy key is dropped (a non-object value on either side: the new key's value is kept)
//   no legacy key         not applicable
//
// It runs after 0012, so on a legacy project it edits the moved `.aoforge/config.json` (the runner resolves the
// planning directory afresh for every migration). Invalid JSON is left to the runner's stamp check (not applicable
// here). `validate health` W067 names this migration while the legacy key is the only one.
//
// One-release scope: removed with the other shims in SHIM_REMOVAL.

const fs = require('fs');
const path = require('path');

const { NAMES, LEGACY } = require('../legacy-names.cjs');
const { planningRoot, planningRel } = require('../compat.cjs');

const NEW_KEY = NAMES.configKey;
const OLD_KEY = LEGACY.configKey;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** -> `{ absent: true } | { error } | { config }` for the project's config.json. */
function readConfig(root) {
  const file = path.join(planningRoot(root), 'config.json');
  if (!fs.existsSync(file)) return { absent: true };
  try {
    const config = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!isPlainObject(config)) return { error: `${planningRel(root, 'config.json')} is not a JSON object` };
    return { config };
  } catch (e) {
    return { error: `${planningRel(root, 'config.json')} is not valid JSON (${e.message.split('\n')[0]})` };
  }
}

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * `config` with the legacy stamp key folded into the new one (see the header). Never mutates `config`.
 */
function renameStampKey(config) {
  const hasNew = has(config, NEW_KEY);
  const value = !hasNew
    ? config[OLD_KEY]
    : isPlainObject(config[NEW_KEY]) && isPlainObject(config[OLD_KEY])
      ? { ...config[OLD_KEY], ...config[NEW_KEY] }
      : config[NEW_KEY];
  const out = {};
  for (const key of Object.keys(config)) {
    if (key === OLD_KEY) {
      if (!hasNew) out[NEW_KEY] = value;
      continue;
    }
    out[key] = key === NEW_KEY ? value : config[key];
  }
  return out;
}

function detect(ctx) {
  const read = readConfig(ctx.projectRoot);
  const rel = planningRel(ctx.projectRoot, 'config.json');
  if (read.absent) return { applies: false, reason: `no ${rel}` };
  if (read.error) return { applies: false, reason: `${read.error}; left untouched` };
  if (!has(read.config, OLD_KEY)) return { applies: false, reason: `${rel} has no legacy "${OLD_KEY}" stamp key` };
  return {
    applies: true,
    reason: has(read.config, NEW_KEY)
      ? `${rel} has both "${NEW_KEY}" and the legacy "${OLD_KEY}"; they merge into "${NEW_KEY}"`
      : `${rel} records its upgrades under the legacy "${OLD_KEY}" key; it is renamed "${NEW_KEY}"`,
  };
}

function apply(ctx) {
  const read = readConfig(ctx.projectRoot);
  if (read.error) throw new Error(read.error);
  const rel = planningRel(ctx.projectRoot, 'config.json');
  if (read.absent || !has(read.config, OLD_KEY)) return { changed: [], notes: `nothing to rename in ${rel}` };
  const merged = has(read.config, NEW_KEY);
  if (!ctx.dryRun) {
    const next = renameStampKey(read.config);
    fs.writeFileSync(path.join(ctx.projectRoot, rel), `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  }
  return {
    changed: [rel],
    notes: merged ? `merged "${OLD_KEY}" into "${NEW_KEY}" (${NEW_KEY} values win)` : `renamed "${OLD_KEY}" to "${NEW_KEY}"`,
  };
}

module.exports = {
  id: '0013',
  title: `Rename the config.json upgrade stamp key to "${NEW_KEY}"`,
  since: '3.0.0',
  safety: 'auto',
  detect,
  apply,
  renameStampKey,
};
