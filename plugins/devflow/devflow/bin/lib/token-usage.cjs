'use strict';

/**
 * token-usage.cjs (TRD 57-01, EST-06 / EST-07) — how many tokens did the executor for TRD `NN-MM` of this repo spend,
 * read from Claude Code session transcripts.
 *
 * The forward stamp (57-03) and the historical backfill (57-04) both call this module, so they agree by construction.
 *
 * Counting rule: Claude Code writes one transcript record per content block, and every record of one API message
 * repeats the same `message.usage` (only the last carries the final output_tokens). A per-record sum double or triple
 * counts, so usage is keyed by `message.id` and each API message counts once. Transcripts are parsed through
 * context-audit.forEachRecord, the same reader `df-tools context` uses.
 *
 * Finding the executor: subagent transcripts live at `<root>/<project-key>/<session>/subagents/agent-<id>.jsonl` with a
 * sibling `agent-<id>.meta.json` (`agentType`, `description`). The index reads meta.json first and, only for executors,
 * the FIRST user record of the jsonl. Transcript bodies are read only by tokensForTrd, for the transcripts it kept.
 * Ids repeat across repositories and within one (three `10-*` objectives here), so every match is scoped to a repo
 * (REPO_ROOT line, else first-record cwd in the repo or one of its `.df-worktrees`, else a `<repo>/.planning/` path)
 * and, for a shared objective number, to the
 * objective directory the prompt names.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { forEachRecord } = require('./context-audit.cjs');
const trdIdentify = require('./trd-identify.cjs');
const { normalizeObjectiveName, objectiveDirMatches } = require('./helpers.cjs');
const { setFrontmatterField } = require('./frontmatter.cjs');

const SYNTHETIC_MODEL = '<synthetic>';

/** A non-negative finite token count, else 0. */
function count(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

const TOTAL_KEYS = ['messages', 'input', 'cache_creation', 'cache_read', 'output'];

function zeroTotals() {
  return { messages: 0, input: 0, cache_creation: 0, cache_read: 0, output: 0 };
}

function addUsage(totals, usage) {
  totals.messages += 1;
  totals.input += count(usage.input_tokens);
  totals.cache_creation += count(usage.cache_creation_input_tokens);
  totals.cache_read += count(usage.cache_read_input_tokens);
  totals.output += count(usage.output_tokens);
}

/**
 * Usage of one transcript, each API message counted once.
 *
 * Only `type:'assistant'` rows with an object `message.usage` and a model other than `<synthetic>` count. The dedupe key
 * is `message.id`, else the row's `uuid` (a row with neither counts on its own). Per key the record with the largest
 * output_tokens wins; on a tie the first one seen stays.
 *
 * @param {string} file  a transcript .jsonl path
 * @returns {{readable: boolean, messages: number, input: number, cache_creation: number, cache_read: number,
 *   output: number, by_model: Object<string, {messages, input, cache_creation, cache_read, output}>}}
 */
function sumUsage(file) {
  const perMessage = new Map(); // key -> { model, usage }
  let anonymous = 0;
  const readable = forEachRecord(file, (row) => {
    if (!row || typeof row !== 'object' || row.type !== 'assistant') return;
    const msg = row.message;
    if (!msg || typeof msg !== 'object') return;
    const usage = msg.usage;
    if (!usage || typeof usage !== 'object') return;
    const model = typeof msg.model === 'string' && msg.model ? msg.model : 'unknown';
    if (model === SYNTHETIC_MODEL) return;

    let k;
    if (typeof msg.id === 'string' && msg.id) k = `id:${msg.id}`;
    else if (typeof row.uuid === 'string' && row.uuid) k = `uuid:${row.uuid}`;
    else k = `row:${anonymous++}`;

    const prev = perMessage.get(k);
    if (!prev || count(usage.output_tokens) > count(prev.usage.output_tokens)) perMessage.set(k, { model, usage });
  });

  const out = { readable, ...zeroTotals(), by_model: {} };
  for (const { model, usage } of perMessage.values()) {
    addUsage(out, usage);
    if (!out.by_model[model]) out.by_model[model] = zeroTotals();
    addUsage(out.by_model[model], usage);
  }
  return out;
}

/**
 * The raw model id with the largest output total; a tie picks the lexicographically smaller id. Null when empty.
 * Model ids are NOT normalised here (`claude-opus-5[1m]` stays as written); 57-02 owns the pricing normaliser.
 *
 * @param {Object<string, {output: number}>} byModel
 * @returns {string|null}
 */
function pickModel(byModel) {
  let best = null;
  let bestOut = -1;
  for (const model of Object.keys(byModel || {}).sort()) {
    const out = count(byModel[model] && byModel[model].output);
    if (out > bestOut) { best = model; bestOut = out; }
  }
  return best;
}

// ─── TRD ids ──────────────────────────────────────────────────────────────────

const ID = String.raw`\d+(?:\.\d+)?-\d+`;
const NORM_ID_RE = /^(\d+(?:\.\d+)?)-(\d+)$/;

/**
 * `NN-MM` with the objective padded as the directories are (normalizeObjectiveName) and the TRD number to two digits:
 * `4-1` → `04-01`, `4.1-2` → `04.1-02`. Anything else (`10-04a`, `x`) → null.
 *
 * @param {string} id
 * @returns {string|null}
 */
function normTrdId(id) {
  if (typeof id !== 'string') return null;
  const m = NORM_ID_RE.exec(id);
  if (!m) return null;
  return `${normalizeObjectiveName(m[1])}-${m[2].padStart(2, '0')}`;
}

/** The objective part of a normalised id: `04.1-02` → `04.1`. */
function objectiveOf(normId) {
  return normId.slice(0, normId.lastIndexOf('-'));
}

// ─── Executor identification ──────────────────────────────────────────────────

const OPT_BACKTICK = '`?';
// Tier 2: `Execute plan <id>` / `Execute TRD <id>`, and an `objectives/<dir>/<id>[-<slug>]-TRD.md` path.
const EXECUTE_RE = new RegExp(String.raw`\bExecute\s+(?:plan|TRD)\s+` + OPT_BACKTICK + `(${ID})` + OPT_BACKTICK + String.raw`(?![\w-])`, 'g');
const OBJECTIVE_TRD_PATH_RE = new RegExp(String.raw`objectives\/[^\/\s]+\/(${ID})(?:-[^\/\s]*)?-TRD\.md`, 'g');
// Tier 3: the meta.json description, e.g. `Execute TRD 48-01` or `Execute TRD 43-15 to checkpoint`.
const DESCRIPTION_RE = new RegExp(String.raw`^Execute\s+(?:TRD|plan)\s+` + OPT_BACKTICK + `(${ID})` + OPT_BACKTICK + String.raw`(?![\w-])`, 'i');
// Directory evidence: `objectives/<dir>/` path segments and `objective <NN-slug>` phrases.
const OBJECTIVE_DIR_SEGMENT_RE = /objectives\/([^/\s]+)\//g;
const OBJECTIVE_PHRASE_RE = /\bobjective\s+`?(\d+(?:\.\d+)?-[A-Za-z0-9][A-Za-z0-9-]*)/gi;
// "objective 48-01" names a TRD, not a directory.
const LOOKS_LIKE_TRD_ID = new RegExp(`^${ID}$`);

function capturesOf(re, text) {
  const out = [];
  for (const m of text.matchAll(re)) out.push(m[1]);
  return out;
}

/**
 * Objective directories a prompt names, kept only when their objective number is `objective` (prompts often cite
 * other objectives' paths, e.g. "read the 47-02 SUMMARY"). Sorted, unique.
 */
function dirEvidence(text, objective) {
  const out = new Set();
  for (const re of [OBJECTIVE_DIR_SEGMENT_RE, OBJECTIVE_PHRASE_RE]) {
    for (const dir of capturesOf(re, text)) {
      if (LOOKS_LIKE_TRD_ID.test(dir)) continue;
      if (normalizeObjectiveName(dir) === objective) out.add(dir);
    }
  }
  return [...out].sort();
}

/**
 * Which TRD an executor ran, from its first user prompt and its meta.json description.
 *
 * Tiers, strongest first; the first tier that yields any id decides:
 *   1. trd-identify.identifyTrd (PLAN_ID / exec-context --id, `NN-MM-TRD.md`, embedded frontmatter) — the hook's
 *      conservative identifier, unchanged;
 *   2. `Execute plan|TRD <id>` and `objectives/<dir>/<id>-<slug>-TRD.md` in the prompt (older prompt shapes);
 *   3. the description `Execute TRD <id>` (case-insensitive).
 * One distinct normalised id → `{id, dirs}`; more than one → `{ambiguous: true}`; none in any tier → null.
 *
 * @param {{prompt?: string, description?: string}} input
 * @returns {{id: string, dirs: string[]}|{ambiguous: true}|null}
 */
function identifyExecutorTrd({ prompt = '', description = '' } = {}) {
  const text = typeof prompt === 'string' ? prompt : '';
  const desc = typeof description === 'string' ? description.trim() : '';

  const strict = trdIdentify.identifyTrd(text);
  const descMatch = DESCRIPTION_RE.exec(desc);
  const tiers = [
    strict ? [strict.id] : [],
    [...capturesOf(EXECUTE_RE, text), ...capturesOf(OBJECTIVE_TRD_PATH_RE, text)],
    descMatch ? [descMatch[1]] : [],
  ];

  for (const ids of tiers) {
    const norm = [...new Set(ids.map(normTrdId).filter(Boolean))];
    if (norm.length === 0) continue;
    if (norm.length > 1) return { ambiguous: true };
    return { id: norm[0], dirs: dirEvidence(text, objectiveOf(norm[0])) };
  }
  return null;
}

// ─── Transcript index ─────────────────────────────────────────────────────────

/** `~/.claude/projects`, resolved when called (never at module load: HOME-isolated tests depend on it). */
function defaultTranscriptRoot() {
  return path.join(os.homedir(), '.claude', 'projects');
}

function realOrResolved(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

/** Sorted names of the directories (or files) directly in `dir`; [] when it cannot be read. */
function sortedNames(dir, directories) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => (directories ? e.isDirectory() : e.isFile()))
    .map((e) => e.name)
    .sort();
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** True when `p` is `base` or inside it. */
function within(p, base) {
  return p === base || p.startsWith(base + path.sep);
}

/** Path comparisons against one repository (the MAIN checkout), realpath'd on both sides. */
function repoMatcher(repoRoot) {
  const given = path.resolve(repoRoot);
  const real = realOrResolved(given);
  const cache = new Map();
  const canon = (p) => {
    if (!cache.has(p)) cache.set(p, realOrResolved(p));
    return cache.get(p);
  };
  // exec-context provisions every executor worktree at <dirname(repo)>/.df-worktrees/<basename(repo)>/<id>.
  const worktreeBases = [...new Set([given, real])].map((r) => path.join(path.dirname(r), '.df-worktrees', path.basename(r)));
  return {
    isRepo: (p) => canon(p) === real,
    contains: (p) => within(canon(p), real),
    // a deleted worktree no longer realpaths; canon() then falls back to path.resolve, which still compares
    inWorktree: (p) => {
      const c = canon(p);
      return worktreeBases.some((b) => c.startsWith(b + path.sep));
    },
    planningPrefixes: [...new Set([given, real])].map((r) => `${r}/.planning/`),
  };
}

/**
 * How an executor transcript belongs to the repo, or null (foreign). A REPO_ROOT line decides on its own; without
 * one, the first record's cwd (equal to or inside the repo: 'cwd'; inside one of its DevFlow worktrees: 'worktree'),
 * else a `<repo>/.planning/` path in the prompt ('path').
 */
function repoMatch(prompt, cwd, repo) {
  const declared = trdIdentify.repoRootOf(prompt);
  if (declared) return repo.isRepo(declared) ? 'repo_root' : null;
  if (typeof cwd === 'string' && path.isAbsolute(cwd)) {
    if (repo.contains(cwd)) return 'cwd';
    if (repo.inWorktree(cwd)) return 'worktree';
  }
  if (repo.planningPrefixes.some((p) => prompt.includes(p))) return 'path';
  return null;
}

const META_RE = /^agent-(.+)\.meta\.json$/;

/**
 * Every executor transcript of `repoRoot` under a Claude Code projects root, identified.
 *
 * Reads exactly `<root>/<key>/<session>/subagents/agent-*.meta.json` (sorted at each level; no deeper walk). Only
 * when meta.json's agentType ends in `executor` does it read the sibling jsonl, and then only its first user record.
 *
 * counts partition `executor_transcripts`: `unidentified` (no TRD id, or no readable first record), `ambiguous`
 * (several ids), `foreign` (identified, another repository) and `identified` (identified and this repo: the entries).
 *
 * @param {{root?: string, repoRoot: string}} opts  repoRoot is the MAIN checkout (executors in worktrees name it)
 * @returns {{entries: Array<{file, session, agent_id, id, dirs, match}>,
 *   counts: {executor_transcripts, identified, unidentified, ambiguous, foreign}}}
 */
function indexExecutorTranscripts({ root = defaultTranscriptRoot(), repoRoot } = {}) {
  if (typeof repoRoot !== 'string' || !repoRoot) {
    throw new Error('indexExecutorTranscripts: repoRoot (the main checkout path) is required');
  }
  const repo = repoMatcher(repoRoot);
  const counts = { executor_transcripts: 0, identified: 0, unidentified: 0, ambiguous: 0, foreign: 0 };
  const entries = [];

  for (const key of sortedNames(root, true)) {
    for (const session of sortedNames(path.join(root, key), true)) {
      const subagents = path.join(root, key, session, 'subagents');
      for (const name of sortedNames(subagents, false)) {
        const m = META_RE.exec(name);
        if (!m) continue;
        const meta = readJson(path.join(subagents, name));
        if (!meta || typeof meta.agentType !== 'string' || !meta.agentType.endsWith('executor')) continue;
        counts.executor_transcripts++;

        const agentId = m[1];
        const file = path.join(subagents, `agent-${agentId}.jsonl`);
        const rec = trdIdentify.readFirstUserRecord(file);
        if (!rec) { counts.unidentified++; continue; }
        const prompt = trdIdentify.textOfContent(rec.message && rec.message.content);

        const trd = identifyExecutorTrd({ prompt, description: meta.description });
        if (!trd) { counts.unidentified++; continue; }
        if (trd.ambiguous) { counts.ambiguous++; continue; }

        const match = repoMatch(prompt, rec.cwd, repo);
        if (!match) { counts.foreign++; continue; }

        counts.identified++;
        entries.push({ file, session, agent_id: agentId, id: trd.id, dirs: trd.dirs, match });
      }
    }
  }
  return { entries, counts };
}

// ─── Per-TRD totals ───────────────────────────────────────────────────────────

function unrecovered(reason, transcripts = []) {
  return { status: 'unrecovered', reason, transcripts, totals: null };
}

/**
 * The executor token totals of one TRD from an index.
 *
 * Candidates are the entries for `normTrdId(id)`. `dir: null` keeps every candidate (no directory filter). Otherwise a
 * candidate counts when its prompt named `dir`, or named no directory at all while the objective number is not
 * shared. With a shared number, a candidate without directory evidence could belong to any of the directories: when
 * nothing is kept and such a candidate exists the result is `ambiguous_objective`, never a guess.
 *
 * @param {{entries: Array}} index  from indexExecutorTranscripts
 * @param {{id: string, dir?: string|null, sharedNumber?: boolean}} trd
 * @returns {{status: 'recovered', transcripts: Array<{file, session, agent_id}>,
 *   totals: {tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, token_model}}
 *   | {status: 'unrecovered', reason: 'invalid_id'|'no_transcript'|'ambiguous_objective'|'zero_usage',
 *   transcripts: Array, totals: null}}
 */
function tokensForTrd(index, { id, dir = null, sharedNumber = false } = {}) {
  const want = normTrdId(id);
  if (!want) return unrecovered('invalid_id');
  const candidates = ((index && index.entries) || []).filter((e) => e.id === want);

  let kept = candidates;
  if (dir != null) {
    kept = candidates.filter((e) => e.dirs.includes(dir) || (!sharedNumber && e.dirs.length === 0));
    if (kept.length === 0) {
      const withoutEvidence = candidates.some((e) => e.dirs.length === 0);
      return unrecovered(sharedNumber && withoutEvidence ? 'ambiguous_objective' : 'no_transcript');
    }
  }
  if (kept.length === 0) return unrecovered('no_transcript');

  const transcripts = kept.map(({ file, session, agent_id }) => ({ file, session, agent_id }));
  const sum = zeroTotals();
  const byModel = {};
  for (const entry of kept) {
    const u = sumUsage(entry.file);
    for (const k of TOTAL_KEYS) sum[k] += u[k];
    for (const [model, t] of Object.entries(u.by_model)) {
      if (!byModel[model]) byModel[model] = zeroTotals();
      for (const k of TOTAL_KEYS) byModel[model][k] += t[k];
    }
  }
  if (sum.input + sum.cache_creation + sum.cache_read + sum.output === 0) return unrecovered('zero_usage', transcripts);

  return {
    status: 'recovered',
    transcripts,
    totals: {
      tokens_input: sum.input + sum.cache_creation + sum.cache_read,
      tokens_output: sum.output,
      tokens_cache_read: sum.cache_read,
      tokens_cache_write: sum.cache_creation,
      token_model: pickModel(byModel),
    },
  };
}

/**
 * The objective directories in `<checkoutRoot>/.planning/objectives` for the objective number of `id`, sorted.
 * More than one means the number is shared (`10-alpha`, `10-beta`). [] when the directory is absent.
 *
 * @param {string} checkoutRoot
 * @param {string} id  `NN-MM`
 * @returns {string[]}
 */
function objectiveDirsFor(checkoutRoot, id) {
  const m = /^(\d+(?:\.\d+)?)-/.exec(typeof id === 'string' ? id : '');
  if (!m) return [];
  const normalized = normalizeObjectiveName(m[1]);
  return sortedNames(path.join(checkoutRoot, '.planning', 'objectives'), true)
    .filter((d) => objectiveDirMatches(d, normalized));
}

// ─── SUMMARY frontmatter stamp ────────────────────────────────────────────────

const TOKEN_FIELDS = Object.freeze([
  'tokens_input', 'tokens_output', 'tokens_cache_read', 'tokens_cache_write', 'token_model', 'tokens_source',
]);

function intText(v) {
  return String(typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
}

/**
 * The six SUMMARY frontmatter fields as `[[key, serialisedValue], ...]` in TOKEN_FIELDS order: integers bare,
 * `token_model` and `tokens_source` JSON-quoted.
 *
 * @param {{tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, token_model}} totals
 * @param {string} source  e.g. 'live' (forward stamp) or a backfill marker
 * @returns {Array<[string, string]>}
 */
function tokenFrontmatterFields(totals, source) {
  const t = totals || {};
  const values = {
    tokens_input: intText(t.tokens_input),
    tokens_output: intText(t.tokens_output),
    tokens_cache_read: intText(t.tokens_cache_read),
    tokens_cache_write: intText(t.tokens_cache_write),
    token_model: JSON.stringify(t.token_model == null ? '' : String(t.token_model)),
    tokens_source: JSON.stringify(source == null ? '' : String(source)),
  };
  return TOKEN_FIELDS.map((k) => [k, values[k]]);
}

/**
 * Write the token fields into the first frontmatter block of `filePath` through the comment-preserving scalar setter:
 * a missing key is appended at the block end, nothing else changes, and an identical stamp writes nothing.
 * Without `force`, a different existing value is left alone and reported in `conflicts`.
 *
 * @param {string} filePath
 * @param {Array<[string, string]>} fields  from tokenFrontmatterFields
 * @param {{force?: boolean}} [opts]
 * @returns {{ok: boolean, changed: boolean, conflicts: string[], error?: string}}
 */
function stampTokenFields(filePath, fields, { force = false } = {}) {
  let changed = false;
  const conflicts = [];
  for (const [key, value] of fields) {
    const r = setFrontmatterField(filePath, key, value, { ifAbsentOrEqual: !force });
    if (!r.ok) return { ok: false, changed, conflicts, error: r.error };
    if (r.warning) return { ok: false, changed, conflicts, error: r.warning };
    if (r.conflict) conflicts.push(key);
    if (r.changed) changed = true;
  }
  return { ok: true, changed, conflicts };
}

module.exports = {
  normTrdId,
  sumUsage,
  pickModel,
  identifyExecutorTrd,
  indexExecutorTranscripts,
  repoMatcher,
  repoMatch,
  tokensForTrd,
  objectiveDirsFor,
  TOKEN_FIELDS,
  tokenFrontmatterFields,
  stampTokenFields,
  defaultTranscriptRoot,
};
