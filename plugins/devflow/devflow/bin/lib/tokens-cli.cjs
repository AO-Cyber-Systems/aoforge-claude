'use strict';

/**
 * tokens-cli.cjs — TRD 57-03 (EST-06)
 *
 * Thin CLI front end for the forward token stamp, over lib/token-usage.cjs (TRD 57-01):
 *
 *   df-tools tokens trd <trd-id> [--objective-dir <dir>] [--repo <path>] [--root <dir>]
 *       Read-only. The executor token totals of one TRD from Claude Code transcripts.
 *   df-tools tokens stamp <trd-id> --draft <path> [--objective-dir <dir>] [--repo <path>] [--root <dir>]
 *       Writes tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, token_model and
 *       tokens_source: "live" into the frontmatter of a SUMMARY DRAFT. The executor runs it right before
 *       `summary post`, so the store-aware verb publishes the fields. A draft inside .planning/ is refused:
 *       every planning write still goes through `summary post` (D-01).
 *
 * Never blocks publication: no matching transcript (retention, an older runtime, another harness) is
 * `stamped:false` with exit 0 and the draft untouched. Only usage errors and a `.planning/` draft exit 1.
 *
 * Same shape as audit-cli.cjs: `runTokens` is pure and returns `{ok, result, text, exit}` or `{ok:false, message}`;
 * the dispatcher's `case 'tokens'` maps that onto output()/error().
 */

const fs = require('fs');
const path = require('path');
const planningMode = require('./planning-mode.cjs');
const tokenUsage = require('./token-usage.cjs');

const USAGE =
  'df-tools tokens <trd <trd-id> | stamp <trd-id> --draft <path>> [--objective-dir <dir>] [--repo <path>] [--root <dir>] [--raw]';

const VALUE_FLAGS = {
  trd: ['objective-dir', 'repo', 'root'],
  stamp: ['draft', 'objective-dir', 'repo', 'root'],
};

function usageError(message) {
  return { ok: false, message: `${message}\nUsage: ${USAGE}` };
}

/**
 * `argv` is everything after `tokens`. A value flag needs a value that is not itself a flag; unknown flags and stray
 * positionals are usage errors. `--raw` is stripped by the dispatcher before this runs; it is tolerated here.
 *
 * @returns {{ok:true, sub: string, id: string, flags: Object<string,string>} | {ok:false, message:string}}
 */
function parseArgs(argv) {
  const sub = argv[0];
  if (sub === undefined) return usageError('tokens needs a subcommand: trd or stamp');
  if (!Object.prototype.hasOwnProperty.call(VALUE_FLAGS, sub)) {
    return usageError(`unknown tokens subcommand ${JSON.stringify(sub)}; expected trd or stamp`);
  }
  const allowed = VALUE_FLAGS[sub];
  const flags = {};
  const positionals = [];
  for (let i = 1; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === '--raw') continue;
    if (!tok.startsWith('--')) { positionals.push(tok); continue; }
    const name = tok.slice(2);
    if (!allowed.includes(name)) return usageError(`unknown flag ${tok} for tokens ${sub}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) return usageError(`${tok} needs a value`);
    flags[name] = value;
    i++;
  }
  if (positionals.length === 0) return usageError(`tokens ${sub} needs a TRD id (for example 57-03)`);
  if (positionals.length > 1) return usageError(`tokens ${sub} takes one TRD id, got ${positionals.length}`);
  const id = tokenUsage.normTrdId(positionals[0]);
  if (!id) return usageError(`invalid TRD id ${JSON.stringify(positionals[0])} (expected <objective>-<NN>, for example 57-03)`);
  if (sub === 'stamp' && !flags.draft) return usageError('tokens stamp needs --draft <path> (a SUMMARY draft outside .planning/)');
  return { ok: true, sub, id, flags };
}

function realOrResolved(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

function within(p, base) {
  return p === base || p.startsWith(base + path.sep);
}

/** The path segment after the last `/objectives/`, when something follows it besides the file name itself. */
function objectiveDirOfPath(file) {
  const parts = path.resolve(file).split(path.sep);
  for (let i = parts.length - 3; i >= 0; i--) {
    if (parts[i] === 'objectives' && parts[i + 1]) return parts[i + 1];
  }
  return null;
}

/**
 * The objective directory the TRD belongs to: `--objective-dir`, else the draft path's, else the single directory of
 * that objective number in the checkout. Several candidates and no evidence is `ambiguous`; none is `dir: null`.
 */
function resolveObjectiveDir({ flagDir, draft, candidates }) {
  if (flagDir) return { dir: flagDir };
  const fromPath = draft ? objectiveDirOfPath(draft) : null;
  if (fromPath) return { dir: fromPath };
  if (candidates.length === 1) return { dir: candidates[0] };
  if (candidates.length > 1) return { ambiguous: true };
  return { dir: null };
}

/** `{fields}` of a recovered result as plain values (numbers as numbers), plus the source marker. */
function fieldValues(totals, source) {
  return { ...totals, tokens_source: source };
}

function summaryLine(totals, count) {
  return `tokens_input=${totals.tokens_input} tokens_output=${totals.tokens_output} transcripts=${count}`;
}

/**
 * @param {{argv: string[], cwd?: string, root?: string}} opts
 *   argv: everything after `tokens`. cwd: the project cwd (default process.cwd()). root: the transcripts root
 *   (`--root` wins; default `os.homedir()/.claude/projects`, read at call time).
 * @returns {{ok: true, result: object, text: string, exit: number} | {ok: false, message: string}}
 */
function runTokens({ argv = [], cwd = process.cwd(), root } = {}) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) return parsed;
  const { sub, id, flags } = parsed;

  const base = path.resolve(cwd);
  const repo = flags.repo
    ? realOrResolved(path.resolve(base, flags.repo))
    : (planningMode.resolveMainRoot(base) || realOrResolved(base));
  const checkout = planningMode.resolveCheckoutRoot(base) || repo;
  const transcriptRoot = flags.root ? path.resolve(base, flags.root) : (root || tokenUsage.defaultTranscriptRoot());

  let draft = null;
  if (sub === 'stamp') {
    draft = path.resolve(base, flags.draft);
    const planningDirs = [...new Set([checkout, repo])].map((r) => path.join(r, '.planning'));
    const guarded = [...new Set(planningDirs.flatMap((d) => [d, realOrResolved(d)]))];
    const candidates = [draft, realOrResolved(draft)];
    if (candidates.some((c) => guarded.some((d) => within(c, d)))) {
      return {
        ok: false,
        message:
          `refusing --draft ${flags.draft}: it is inside .planning/. tokens stamp never writes planning files. `
          + 'Draft the SUMMARY with `df-tools planning draft <rel>`, stamp that file, then publish it with `df-tools summary post`.',
      };
    }
    let stat = null;
    try { stat = fs.statSync(draft); } catch { stat = null; }
    if (!stat || !stat.isFile()) return usageError(`--draft ${flags.draft} is not a file`);
  }

  const dirsHere = tokenUsage.objectiveDirsFor(checkout, id);
  const objectiveDirs = dirsHere.length > 0 || checkout === repo ? dirsHere : tokenUsage.objectiveDirsFor(repo, id);
  const picked = resolveObjectiveDir({ flagDir: flags['objective-dir'], draft, candidates: objectiveDirs });

  let outcome;
  if (picked.ambiguous) {
    outcome = { status: 'unrecovered', reason: 'ambiguous_objective', transcripts: [], totals: null };
  } else {
    const index = tokenUsage.indexExecutorTranscripts({ root: transcriptRoot, repoRoot: repo });
    outcome = tokenUsage.tokensForTrd(index, { id, dir: picked.dir, sharedNumber: objectiveDirs.length > 1 });
  }
  const objectiveDir = picked.ambiguous ? null : picked.dir;
  const recovered = outcome.status === 'recovered';

  if (sub === 'trd') {
    const result = { trd: id, objective_dir: objectiveDir, found: recovered, transcripts: outcome.transcripts };
    if (recovered) result.fields = fieldValues(outcome.totals, 'live');
    else result.reason = outcome.reason;
    const text = recovered ? summaryLine(outcome.totals, outcome.transcripts.length) : `not found: ${outcome.reason}`;
    return { ok: true, result, text, exit: 0 };
  }

  const result = { trd: id, draft, objective_dir: objectiveDir, stamped: false, fields: null, transcripts: outcome.transcripts };
  if (!recovered) {
    result.reason = outcome.reason;
    return { ok: true, result, text: `not stamped: ${outcome.reason}`, exit: 0 };
  }

  const original = fs.readFileSync(draft);
  const written = tokenUsage.stampTokenFields(draft, tokenUsage.tokenFrontmatterFields(outcome.totals, 'live'), { force: true });
  if (!written.ok) {
    fs.writeFileSync(draft, original);
    result.reason = 'stamp_failed';
    result.error = written.error;
    return { ok: true, result, text: `not stamped: ${written.error}`, exit: 0 };
  }
  result.stamped = true;
  result.fields = fieldValues(outcome.totals, 'live');
  return {
    ok: true,
    result,
    text: `stamped tokens_input=${outcome.totals.tokens_input} tokens_output=${outcome.totals.tokens_output} (${outcome.transcripts.length} transcripts)`,
    exit: 0,
  };
}

module.exports = { runTokens, parseArgs, USAGE };
