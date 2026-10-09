'use strict';

/**
 * tokens-cli.cjs — TRD 57-03 (EST-06)
 *
 * Thin CLI front end for the forward token stamp, over lib/token-usage.cjs (TRD 57-01):
 *
 *   aof-tools tokens trd <trd-id> [--objective-dir <dir>] [--repo <path>] [--root <dir>]
 *       Read-only. The executor token totals of one TRD from Claude Code transcripts.
 *   aof-tools tokens stamp <trd-id> --draft <path> [--objective-dir <dir>] [--repo <path>] [--root <dir>]
 *       Writes tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, token_model and
 *       tokens_source: "live" into the frontmatter of a SUMMARY DRAFT. The executor runs it right before
 *       `summary post`, so the store-aware verb publishes the fields. A draft inside .aoforge/ is refused:
 *       every planning write still goes through `summary post` (D-01).
 *
 *   aof-tools tokens backfill [--write] [--force] [--repo <path>] [--root <dir>]
 *       TRD 57-06 (EST-07). Recovers executor token usage for every historical SUMMARY of the checkout from the transcripts
 *       that survive (lib/token-backfill.cjs). A DRY RUN unless --write: it prints recovered and unrecovered counts (by
 *       reason) and changes no file. --write stamps each recovered SUMMARY through `summary post` (tokens_source:
 *       "backfill"); --force also restamps a SUMMARY that already carries token values. Transcripts are matched against
 *       the main checkout (--repo, default resolveMainRoot(cwd)); SUMMARYs are read and written in the checkout holding
 *       cwd. Unrecoverable history (retention deleted the transcript) is the normal outcome: exit 0.
 *
 *   aof-tools tokens coverage [--milestone <v> | --objective <N>] [--repo <path>] [--root <dir>]
 *       TRD 66-01 (EST-09). Read-only. Forward-stamp coverage: of the TRD SUMMARYs in a scope, how many carry tokens stamped
 *       at write time (tokens_source "live"), as live / counted with an exact fraction, a decimal floored at 6 places and an
 *       integer check against the 95% target (lib/token-coverage.cjs). The scope is the current milestone of ROADMAP.md,
 *       else --milestone <v> or --objective <N> (not both). Every SUMMARY is one of live, backfill, unlabeled, missing (no
 *       token fields, whether or not it has a Self-Check) or in_progress (a Progress checkpoint only; listed, not counted);
 *       each missing one carries a reason (stamp_skipped when an executor transcript of the TRD exists, else why none).
 *       SUMMARYs are read in the checkout holding cwd (the main checkout in store mode), transcripts for --repo (default
 *       the main checkout). It writes no file. A report exits 0 whatever the coverage; exit 1 only for a usage error, an
 *       unknown milestone, a missing ROADMAP.md or an objective with no directory.
 *
 * Never blocks publication: no matching transcript (retention, an older runtime, another harness) is
 * `stamped:false` with exit 0 and the draft untouched. Only usage errors and a `.aoforge/` draft exit 1.
 *
 * Same shape as audit-cli.cjs: `runTokens` is pure and returns `{ok, result, text, exit}` or `{ok:false, message}`;
 * the dispatcher's `case 'tokens'` maps that onto output()/error().
 */

const fs = require('fs');
const path = require('path');
const planningMode = require('./planning-mode.cjs');
const tokenUsage = require('./token-usage.cjs');
const tokenBackfill = require('./token-backfill.cjs');
const tokenCoverage = require('./token-coverage.cjs');
const { selectMilestoneObjectives } = require('./milestone-scope.cjs');
const { getArchivedObjectiveDirs } = require('./objective.cjs');
const { normalizeObjectiveName, objectiveDirMatches } = require('./helpers.cjs');
const { planningRoot, planningRel } = require('./compat.cjs');

const USAGE =
  'aof-tools tokens <trd <trd-id> | stamp <trd-id> --draft <path> | backfill [--write] [--force] | coverage [--milestone <v> | --objective <N>]> [--objective-dir <dir>] [--repo <path>] [--root <dir>] [--raw]';

const VALUE_FLAGS = {
  trd: ['objective-dir', 'repo', 'root'],
  stamp: ['draft', 'objective-dir', 'repo', 'root'],
  backfill: ['repo', 'root'],
  coverage: ['milestone', 'objective', 'repo', 'root'],
};

/** Boolean flags per subcommand. `--write` and `--force` exist for `backfill` only. */
const BOOL_FLAGS = {
  trd: [],
  stamp: [],
  backfill: ['write', 'force'],
  coverage: [],
};
const BACKFILL_ONLY = ['write', 'force'];

function usageError(message) {
  return { ok: false, message: `${message}\nUsage: ${USAGE}` };
}

/**
 * `argv` is everything after `tokens`. A value flag needs a value that is not itself a flag; unknown flags and stray
 * positionals are usage errors. `--raw` is stripped by the dispatcher before this runs; it is tolerated here.
 *
 * `backfill` takes no TRD id: `id` is null there, and `--write` / `--force` arrive as `flags.write` / `flags.force` = true.
 *
 * @returns {{ok:true, sub: string, id: string|null, flags: Object<string,string|boolean>} | {ok:false, message:string}}
 */
function parseArgs(argv) {
  const sub = argv[0];
  if (sub === undefined) return usageError('tokens needs a subcommand: trd, stamp, backfill or coverage');
  if (!Object.prototype.hasOwnProperty.call(VALUE_FLAGS, sub)) {
    return usageError(`unknown tokens subcommand ${JSON.stringify(sub)}; expected trd, stamp, backfill or coverage`);
  }
  const allowed = VALUE_FLAGS[sub];
  const bools = BOOL_FLAGS[sub];
  const flags = {};
  const positionals = [];
  for (let i = 1; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === '--raw') continue;
    if (!tok.startsWith('--')) { positionals.push(tok); continue; }
    const name = tok.slice(2);
    if (bools.includes(name)) { flags[name] = true; continue; }
    if (BACKFILL_ONLY.includes(name)) return usageError(`${tok} is only valid for tokens backfill`);
    if (!allowed.includes(name)) return usageError(`unknown flag ${tok} for tokens ${sub}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) return usageError(`${tok} needs a value`);
    flags[name] = value;
    i++;
  }
  if (sub === 'backfill') {
    if (positionals.length > 0) {
      return usageError(`tokens backfill takes no TRD id or argument, got ${JSON.stringify(positionals[0])}; it covers every SUMMARY`);
    }
    return { ok: true, sub, id: null, flags };
  }
  if (sub === 'coverage') {
    if (positionals.length > 0) {
      return usageError(`tokens coverage takes no TRD id; use --objective <N> or --milestone <v> (got ${JSON.stringify(positionals[0])})`);
    }
    if (flags.milestone !== undefined && flags.objective !== undefined) {
      return usageError('tokens coverage takes either --milestone <v> or --objective <N>, not both');
    }
    if (flags.objective !== undefined && !/^\d+(?:\.\d+)?$/.test(flags.objective)) {
      return usageError(`--objective needs an objective number such as 65 or 4.1, got ${JSON.stringify(flags.objective)}`);
    }
    return { ok: true, sub, id: null, flags };
  }
  if (positionals.length === 0) return usageError(`tokens ${sub} needs a TRD id (for example 57-03)`);
  if (positionals.length > 1) return usageError(`tokens ${sub} takes one TRD id, got ${positionals.length}`);
  const id = tokenUsage.normTrdId(positionals[0]);
  if (!id) return usageError(`invalid TRD id ${JSON.stringify(positionals[0])} (expected <objective>-<NN>, for example 57-03)`);
  if (sub === 'stamp' && !flags.draft) return usageError('tokens stamp needs --draft <path> (a SUMMARY draft outside .aoforge/)');
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
 * `tokens backfill`: plan (always), apply (`--write`), report. The repository is `--repo`, else the main checkout of cwd;
 * the checkout whose SUMMARYs are read and written is the one holding cwd, else the repository. No project and no
 * `--repo` is a usage error. Exit 1 only when a write failed; unrecovered history is exit 0.
 *
 * @returns {{ok: true, result: object, text: string, exit: number} | {ok: false, message: string}}
 */
function runBackfill({ flags, cwd, root }) {
  const base = path.resolve(cwd);
  const main = planningMode.resolveMainRoot(base);
  if (!flags.repo && !main) {
    return usageError(`no AOForge project at ${base}; run tokens backfill inside one or pass --repo <path>`);
  }
  const repoRoot = flags.repo ? realOrResolved(path.resolve(base, flags.repo)) : main;
  const checkoutRoot = planningMode.resolveCheckoutRoot(base) || repoRoot;
  const transcriptRoot = flags.root ? path.resolve(base, flags.root) : (root || tokenUsage.defaultTranscriptRoot());
  const force = flags.force === true;

  let plan;
  let applied = null;
  try {
    plan = tokenBackfill.planBackfill({ checkoutRoot, repoRoot, root: transcriptRoot, force });
    if (flags.write === true) applied = tokenBackfill.applyBackfill(plan, { checkoutRoot, force });
  } catch (err) {
    return { ok: false, message: `tokens backfill failed: ${err.message}` };
  }

  const result = {
    checkout: plan.checkout,
    repo: plan.repo,
    transcripts_root: plan.transcripts_root,
    counts: plan.counts,
    index_counts: plan.index_counts,
    recovered: plan.entries.filter((e) => e.status === 'recovered').map((e) => e.id),
    unrecovered: plan.entries
      .filter((e) => e.status === 'unrecovered')
      .map((e) => ({ id: e.id, objective_dir: e.objective_dir, reason: e.reason })),
  };
  if (applied) result.applied = applied;
  const exit = applied && applied.write_failed.length > 0 ? 1 : 0;
  return { ok: true, result, text: tokenBackfill.formatBackfillReport(plan, applied), exit };
}

/**
 * The tree whose SUMMARYs `tokens coverage` reads: the main checkout in store mode (its `.aoforge/` is the cache), else
 * the checkout holding cwd (a local-mode worktree reads its own SUMMARYs), else the main checkout. Same rule as
 * planning-verbs.summaryWriteRoot, so coverage reads where `summary post` writes.
 *
 * @param {{mode: string, main: string, checkout?: string|null}} where
 * @returns {string}
 */
function readRootFor({ mode, main, checkout }) {
  if (mode === planningMode.STORE) return main;
  return checkout || main;
}

/** An objective number as the ROADMAP.md names it: no leading zeros on the integer part (`04` is `4`, `4.1` stays). */
function canonicalNumber(text) {
  const [int, dec] = String(text).split('.');
  return dec === undefined ? String(parseInt(int, 10)) : `${parseInt(int, 10)}.${dec}`;
}

/** `[{number, dir}]` of the current and archived directories of objective `number` under `readRoot` (`dir` relative, forward slashes). */
function objectiveScopeDirs(readRoot, number) {
  const want = normalizeObjectiveName(number);
  const out = [];
  let names = [];
  try {
    names = fs.readdirSync(path.join(planningRoot(readRoot), 'objectives'), { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    names = [];
  }
  for (const name of names) {
    if (objectiveDirMatches(name, want)) out.push({ number, dir: planningRel(readRoot, 'objectives', name) });
  }
  for (const a of getArchivedObjectiveDirs(readRoot)) {
    if (objectiveDirMatches(a.name, want)) out.push({ number, dir: path.join(a.basePath, a.name).split(path.sep).join('/') });
  }
  return out;
}

/**
 * `tokens coverage`: forward-stamp coverage of a milestone (default: the current one) or of one objective. Read-only. A
 * report always exits 0; only a usage error, an unknown milestone, a missing ROADMAP.md or an objective with no directory
 * is `{ok:false}`.
 *
 * @returns {{ok: true, result: object, text: string, exit: number} | {ok: false, message: string}}
 */
function runCoverage({ flags, cwd, root }) {
  const base = path.resolve(cwd);
  const found = planningMode.resolveMainRoot(base);
  if (!flags.repo && !found) {
    return usageError(`no AOForge project at ${base}; run tokens coverage inside one or pass --repo <path>`);
  }
  const repoRoot = flags.repo ? realOrResolved(path.resolve(base, flags.repo)) : found;
  const main = found || repoRoot;
  const checkout = planningMode.resolveCheckoutRoot(base) || repoRoot;
  const readRoot = readRootFor({ mode: planningMode.planningMode(main).mode, main, checkout });
  const transcriptRoot = flags.root ? path.resolve(base, flags.root) : (root || tokenUsage.defaultTranscriptRoot());

  let scope;
  if (flags.objective !== undefined) {
    const number = canonicalNumber(flags.objective);
    const dirs = objectiveScopeDirs(readRoot, number);
    if (dirs.length === 0) return usageError(`no objective directory for objective ${number} under ${readRoot}`);
    scope = { kind: 'objective', objective: number, dirs };
  } else {
    let selected;
    try {
      selected = selectMilestoneObjectives(readRoot, flags.milestone === undefined ? {} : { version: flags.milestone });
    } catch (err) {
      return usageError(err.message);
    }
    scope = {
      kind: 'milestone',
      version: selected.version,
      dirs: selected.objectives.filter((o) => o.dir).map((o) => ({ number: o.number, dir: o.dir })),
    };
  }

  let report;
  try {
    report = tokenCoverage.buildCoverage({
      readRoot,
      scope,
      indexFactory: () => tokenUsage.indexExecutorTranscripts({ root: transcriptRoot, repoRoot }),
    });
  } catch (err) {
    return { ok: false, message: `tokens coverage failed: ${err.message}` };
  }
  const result = { ...report, repo: repoRoot, transcripts_root: transcriptRoot };
  return { ok: true, result, text: tokenCoverage.formatCoverage(report), exit: 0 };
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
  if (sub === 'backfill') return runBackfill({ flags, cwd, root });
  if (sub === 'coverage') return runCoverage({ flags, cwd, root });

  const base = path.resolve(cwd);
  const repo = flags.repo
    ? realOrResolved(path.resolve(base, flags.repo))
    : (planningMode.resolveMainRoot(base) || realOrResolved(base));
  const checkout = planningMode.resolveCheckoutRoot(base) || repo;
  const transcriptRoot = flags.root ? path.resolve(base, flags.root) : (root || tokenUsage.defaultTranscriptRoot());

  let draft = null;
  if (sub === 'stamp') {
    draft = path.resolve(base, flags.draft);
    const planningDirs = [...new Set([checkout, repo])].map((r) => planningRoot(r));
    const guarded = [...new Set(planningDirs.flatMap((d) => [d, realOrResolved(d)]))];
    const candidates = [draft, realOrResolved(draft)];
    if (candidates.some((c) => guarded.some((d) => within(c, d)))) {
      return {
        ok: false,
        message:
          `refusing --draft ${flags.draft}: it is inside ${planningRel(checkout)}/. tokens stamp never writes planning files. `
          + 'Draft the SUMMARY with `aof-tools planning draft <rel>`, stamp that file, then publish it with `aof-tools summary post`.',
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

module.exports = { runTokens, parseArgs, readRootFor, USAGE };
