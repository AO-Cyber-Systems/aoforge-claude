'use strict';

// Clean, deterministic inputs for `df-tools calibrate` (TRD 57-02, EST-01): model dollar rates, readers for the planning
// history that carries duration and token samples, and the task classifier Objective 58's estimator shares.
//
// Every list returned from this module is explicitly sorted. 57-05 builds a byte-identical calibration.json from it.

const fs = require('fs');
const path = require('path');
const { parseTrdTasks, resolveEffectiveTddFlag } = require('./trd-tdd.cjs');

// ─── Model rates ──────────────────────────────────────────────────────────────

const RATES_PATH = path.join(__dirname, '..', '..', 'references', 'model-rates.json');

const RATE_FIELDS = ['input', 'output', 'cache_read', 'cache_write_5m', 'cache_write_1h'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validateModel(id, model) {
  if (!isPlainObject(model)) return `model ${id}: entry is not an object`;
  for (const field of RATE_FIELDS) {
    if (typeof model[field] !== 'number' || !Number.isFinite(model[field]) || model[field] < 0) {
      return `model ${id}: ${field} must be a non-negative number`;
    }
  }
  if (typeof model.source !== 'string' || !/^https:\/\//.test(model.source)) {
    return `model ${id}: source must be an https URL`;
  }
  if (typeof model.as_of !== 'string' || !DATE_RE.test(model.as_of)) {
    return `model ${id}: as_of must be a YYYY-MM-DD date`;
  }
  return null;
}

/**
 * Load and validate the model rates file.
 * @returns {{ok:true, models:object, aliases:object, currency:string|null, unit:string|null, as_of:string|null}
 *          |{ok:false, error:string}}
 */
function loadRates(file = RATES_PATH) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    return { ok: false, error: `cannot read model rates ${file}: ${err.message}` };
  }
  if (!isPlainObject(raw) || !isPlainObject(raw.models)) {
    return { ok: false, error: `model rates ${file}: "models" must be an object` };
  }
  const aliasesIn = raw.aliases === undefined ? {} : raw.aliases;
  if (!isPlainObject(aliasesIn)) return { ok: false, error: `model rates ${file}: "aliases" must be an object` };

  const models = {};
  let asOf = null;
  for (const id of Object.keys(raw.models).sort()) {
    const problem = validateModel(id, raw.models[id]);
    if (problem) return { ok: false, error: problem };
    const m = raw.models[id];
    models[id] = {
      input: m.input, output: m.output, cache_read: m.cache_read,
      cache_write_5m: m.cache_write_5m, cache_write_1h: m.cache_write_1h,
      source: m.source, as_of: m.as_of,
    };
    if (asOf === null || m.as_of > asOf) asOf = m.as_of;
  }
  const aliases = {};
  for (const alias of Object.keys(aliasesIn).sort()) {
    const target = aliasesIn[alias];
    if (typeof target !== 'string' || !hasOwn(models, target)) {
      return { ok: false, error: `alias ${alias} points at missing model ${target}` };
    }
    aliases[alias] = target;
  }
  return {
    ok: true,
    models,
    aliases,
    currency: typeof raw.currency === 'string' ? raw.currency : null,
    unit: typeof raw.unit === 'string' ? raw.unit : null,
    as_of: asOf,
  };
}

/** Trim, strip a trailing `[...]` context suffix; `<synthetic>`-style and empty ids are null. */
function normalizeModelId(id) {
  if (typeof id !== 'string') return null;
  const stripped = id.trim().replace(/\[[^\]]*\]$/, '').trim();
  if (stripped === '' || /^<.*>$/.test(stripped)) return null;
  return stripped;
}

/**
 * The rate row for a transcript model id: direct, then alias, then the same two without a trailing `-YYYYMMDD`.
 * @returns {{id:string, input:number, output:number, cache_read:number, cache_write_5m:number, cache_write_1h:number}|null}
 */
function rateFor(rates, id) {
  const norm = normalizeModelId(id);
  if (!norm || !rates || !isPlainObject(rates.models)) return null;
  const aliases = isPlainObject(rates.aliases) ? rates.aliases : {};
  const resolve = (key) => {
    if (hasOwn(rates.models, key)) return key;
    if (hasOwn(aliases, key) && hasOwn(rates.models, aliases[key])) return aliases[key];
    return null;
  };
  let key = resolve(norm);
  if (key === null) {
    const undated = norm.replace(/-\d{8}$/, '');
    if (undated !== norm) key = resolve(undated);
  }
  if (key === null) return null;
  const m = rates.models[key];
  return {
    id: key,
    input: m.input,
    output: m.output,
    cache_read: m.cache_read,
    cache_write_5m: m.cache_write_5m,
    cache_write_1h: m.cache_write_1h,
  };
}

// ─── Durations and the Performance Metrics table ──────────────────────────────

const NUM = '(\\d+(?:\\.\\d+)?)';
const DURATION_HOURS_RE = new RegExp(`^${NUM}\\s*h(?:ours?|rs?)?(?:\\s*${NUM}\\s*m(?:in(?:s|utes?)?)?)?$`);
const DURATION_MINUTES_RE = new RegExp(`^${NUM}\\s*m(?:in(?:s|utes?)?)?$`);
const DURATION_SECONDS_RE = new RegExp(`^${NUM}\\s*s(?:ecs?|econds?)?$`);

/**
 * Minutes from a free-text duration: `8min`, `~45min`, `about 50 min`, `1h 15m`, `90s`. Text without a unit
 * (`6`, `360`, `one session`) is null: old `record-metric` rows mix seconds and minutes, so a bare number is unknowable.
 */
function parseDurationMinutes(text) {
  if (typeof text !== 'string') return null;
  const s = text.trim().toLowerCase().replace(/^(?:~|about\s+)\s*/, '');
  let m = DURATION_HOURS_RE.exec(s);
  if (m) return Number(m[1]) * 60 + (m[2] === undefined ? 0 : Number(m[2]));
  m = DURATION_MINUTES_RE.exec(s);
  if (m) return Number(m[1]);
  m = DURATION_SECONDS_RE.exec(s);
  if (m) return Number(m[1]) / 60;
  return null;
}

const METRIC_ROW_RE = /^\|\s*Objective\s+([^\s|]+)\s+P([^\s|]+)\s*\|([^|]*)\|\s*(-|\d+)\s+tasks?\s*\|\s*(-|\d+)\s+files?\s*\|\s*$/;

function countOrNull(token) {
  return token === '-' || token === undefined || token === null || token === '' ? null : Number(token);
}

/**
 * Rows of the `## Performance Metrics` table that `state record-metric` writes:
 * `| Objective <obj> P<trd> | <duration> | <n|-> tasks | <n|-> files |`. Document order.
 * @returns {Array<{objective:string, trdToken:string, duration_raw:string, minutes:number|null, tasks:number|null, files:number|null}>}
 */
function parseMetricsTable(markdown) {
  if (typeof markdown !== 'string') return [];
  const rows = [];
  let inSection = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^#{1,6}\s/.test(line)) {
      inSection = /^##\s+Performance Metrics\b/i.test(line);
      continue;
    }
    if (!inSection) continue;
    const m = METRIC_ROW_RE.exec(line);
    if (!m) continue;
    const durationRaw = m[3].trim();
    rows.push({
      objective: m[1],
      trdToken: m[2],
      duration_raw: durationRaw,
      minutes: parseDurationMinutes(durationRaw),
      tasks: countOrNull(m[4]),
      files: countOrNull(m[5]),
    });
  }
  return rows;
}

// ─── TRD tasks ────────────────────────────────────────────────────────────────

// The identical task regex trd-tdd.parseTrdTasks uses, so the two lists zip by index.
function taskRegex() {
  return /<(?:TASK-EX|task)\s+([^>]+?)>([\s\S]*?)<\/(?:TASK-EX|task)>/gi;
}

// Split on commas and newlines that sit outside `{...}`, so `skills/{a,b}/` stays one piece.
function splitFilePieces(raw) {
  const pieces = [];
  let depth = 0;
  let current = '';
  for (const ch of raw) {
    if (ch === '{') depth += 1;
    else if (ch === '}') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === '\n') && depth === 0) {
      pieces.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  pieces.push(current);
  return pieces;
}

// `a/{b,c}/d` -> `a/b/d`, `a/c/d`. An unbalanced or empty group is left as written.
function expandBraces(token) {
  const m = /^([^{]*)\{([^{}]+)\}(.*)$/.exec(token);
  if (!m) return [token];
  return m[2].split(',').flatMap((alt) => expandBraces(`${m[1]}${alt.trim()}${m[3]}`));
}

/**
 * Bare paths from a `<files>` body. Parenthesised notes (` (new, 40 lines)`, a leading `(none; ...)`) are dropped
 * first, so a comma inside one cannot start a piece. A path containing parentheses (`src/app/(auth)/page.tsx`) is
 * safe: only a group at the start or after whitespace is a note. Then it splits on commas and newlines, drops a leading
 * `- ` or `* `, backticks and quotes, keeps the first whitespace-delimited token (drops `<- CREATE`) and expands
 * `{a,b}`. Document order, de-duplicated.
 */
function parseFilesList(raw) {
  const seen = new Set();
  const files = [];
  for (const piece of splitFilePieces(String(raw).replace(/(^|\s)\([^)]*\)/g, '$1'))) {
    const token = piece.trim().replace(/^[-*]\s+/, '').trim().split(/\s+/)[0] || '';
    const cleaned = token.replace(/[`'"]/g, '');
    if (!cleaned || cleaned.startsWith('(')) continue;
    for (const file of expandBraces(cleaned)) {
      if (file && !seen.has(file)) {
        seen.add(file);
        files.push(file);
      }
    }
  }
  return files;
}

/**
 * A TRD's frontmatter and tasks with their `<files>` and effective TDD flag.
 * @returns {{frontmatter:object, tasks:Array<{name:string,type:string,tdd:boolean,files:string[]}>, task_files_misaligned:boolean}}
 */
function readTrdTasks(text) {
  const src = typeof text === 'string' ? text : '';
  const parsed = parseTrdTasks(src);
  const frontmatter = parsed.frontmatter || {};
  const fileLists = [];
  const re = taskRegex();
  let m;
  while ((m = re.exec(src)) !== null) {
    const files = /<files>([\s\S]*?)<\/files>/i.exec(m[2]);
    fileLists.push(files ? parseFilesList(files[1]) : []);
  }
  const misaligned = fileLists.length !== parsed.tasks.length;
  const tasks = parsed.tasks.map((t, i) => ({
    name: t.name,
    type: t.type,
    tdd: resolveEffectiveTddFlag(frontmatter.type, t.tdd_attr),
    files: misaligned ? [] : fileLists[i],
  }));
  return { frontmatter, tasks, task_files_misaligned: misaligned };
}

// ─── Task classifier ──────────────────────────────────────────────────────────

// Objective 58's `estimate task` calls classifyTask too, so a change to any rule below bumps CLASSIFIER_VERSION.
const CLASSIFIER_VERSION = 1;

const SCHEMA_RE = /(^|\/)(migrations?|schema)(\/|\.)|\.sql$|\.prisma$/i;
const TEST_RE = /\.(test|spec)\.|_test\.(go|dart|py)$|(^|\/)test_[^/]*\.py$|(^|\/)(__tests__|__fixtures__|tests?|integration_test)\//;
const UI_RE = /\.(tsx|jsx|vue|svelte|css|scss|html)$/i;
const DART_RE = /\.dart$/i;
const CODE_RE = /\.(c?js|mjs|ts|go|dart|py|rs|rb|java|kt|swift|sh)$/i;
const PROMPT_RE = /(^|\/)(skills\/[^/]+\/SKILL\.md|(agents|workflows|references|templates)\/[^/]+\.md)$/;
const DOC_RE = /\.(md|mdx|txt|rst)$/i;
const CONFIG_RE = /\.(json|ya?ml|toml|ini)$|(^|\/)(Dockerfile|Makefile)$/;

// Highest precedence first: a task's kind is the highest-precedence kind among its files.
const KIND_PRECEDENCE = ['schema', 'ui', 'code', 'prompt', 'test', 'doc', 'config', 'other'];

const TASK_CLASSES = Object.freeze(
  ['checkpoint', ...KIND_PRECEDENCE.flatMap((kind) => [kind, `${kind}_tdd`])].sort(),
);

function fileKind(file, trdType) {
  if (SCHEMA_RE.test(file)) return 'schema';
  if (TEST_RE.test(file)) return 'test';
  if (UI_RE.test(file) || (trdType === 'ui' && DART_RE.test(file))) return 'ui';
  if (CODE_RE.test(file)) return 'code';
  if (PROMPT_RE.test(file)) return 'prompt';
  if (DOC_RE.test(file)) return 'doc';
  if (CONFIG_RE.test(file)) return 'config';
  return 'other';
}

/**
 * One class from TASK_CLASSES: the highest-precedence file kind plus `_tdd` when the effective TDD flag is set, or
 * `checkpoint` for a `checkpoint:*` task.
 * @param {{files?:string[], tdd?:boolean, type?:string, trdType?:string}} task
 */
function classifyTask(task) {
  const t = task || {};
  if (typeof t.type === 'string' && t.type.startsWith('checkpoint')) return 'checkpoint';
  const files = Array.isArray(t.files) ? t.files : [];
  const kinds = new Set(files.map((file) => fileKind(String(file), t.trdType)));
  const kind = KIND_PRECEDENCE.find((k) => kinds.has(k)) || 'other';
  return t.tdd === true ? `${kind}_tdd` : kind;
}

module.exports = {
  RATES_PATH,
  loadRates,
  normalizeModelId,
  rateFor,
  parseDurationMinutes,
  parseMetricsTable,
  readTrdTasks,
  classifyTask,
  TASK_CLASSES,
  CLASSIFIER_VERSION,
};
