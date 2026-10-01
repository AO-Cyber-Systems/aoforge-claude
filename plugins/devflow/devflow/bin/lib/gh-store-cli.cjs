'use strict';

// gh-store-cli.cjs (TRD 47-11) — the human-facing commands for the GitHub-authoritative store:
//
//   gh outbox status | flush [--no-wait] | resolve <seq> --accept-remote|--overwrite
//
// Thin wrappers: parse the arguments, call ONE library function (gh-outbox, gh-outbox-flush,
// gh-capability), format the answer, exit. No business logic lives here.
//
// Exit codes (D-21) for `gh outbox flush`:
//   0  everything flushed (or there was nothing to do, or another flusher is already running)
//   1  an error: bad usage, an unusable config, a flush that could not run at all
//   2  halted for a human: a remote edit, or an op GitHub refused (see `gh outbox status`)
//   3  ops remain pending: offline, rate limited, over the write budget (nothing is wrong; run it again)
//
// `--raw` prints the JSON payload on stdout; without it the output is prose (errors go to stderr).
// helpers.output() always exits 0, so this module emits its own codes and calls process.exit itself.
// process.exit is stubbed by the tests, so every handler RETURNS its result and `emit` runs exactly once.

const fs = require('fs');
const path = require('path');

const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const flushLib = require('./gh-outbox-flush.cjs');
const mappingLib = require('./gh-mapping.cjs');
const capability = require('./gh-capability.cjs');
const comments = require('./gh-comments.cjs');
const hierarchy = require('./gh-hierarchy.cjs');

const EXIT = Object.freeze({ OK: 0, ERROR: 1, HALTED: 2, PENDING: 3 });

// A planning-verb write that was NOT queued (`plan put-trd --no-push`, or an enqueue that failed) is recorded in the
// verb-write ledger with this suffix on its verb (48-11). GitHub does not hold those bytes yet, so a drained flush must
// never baseline them; the next verb that queues the file clears the mark.
const UNQUEUED_MARK = ' (not queued)';

// ─── Results and output ──────────────────────────────────────────────────────

/** @returns {{code:number, payload:object, prose:string}} */
const result = (code, payload, prose) => ({ code, payload, prose: prose.endsWith('\n') ? prose : `${prose}\n` });

const failure = (message, extra = {}) => result(EXIT.ERROR, { ok: false, error: message, ...extra }, message);
const usageError = (usage) => failure(usage, { usage: true });
const skipped = (reason) => result(EXIT.OK, { ok: false, skipped: true, reason }, reason);

/**
 * Print a result and exit. Errors (code 1) go to stderr in prose mode; raw mode always prints JSON to stdout.
 * `res.warn` (optional) is side information for a human, printed to stderr in prose mode so stdout stays pipeable.
 */
function emit(res, raw) {
  if (raw) {
    process.stdout.write(`${JSON.stringify(res.payload, null, 2)}\n`);
  } else {
    if (res.code === EXIT.ERROR) process.stderr.write(res.prose);
    else process.stdout.write(res.prose);
    if (res.warn) process.stderr.write(res.warn.endsWith('\n') ? res.warn : `${res.warn}\n`);
  }
  if (res.code !== EXIT.OK) process.exit(res.code);
}

/**
 * The enabled gate, with ZERO gh calls. A project with github off is `skipped` (exit 0). A project that turned
 * github on but cannot be used (no resolvable repo) is an error: the user asked for GitHub and gets none.
 * @returns {{repo:string}|{result:object}}
 */
function gate(cwd) {
  const g = client.requireEnabled(cwd);
  if (!g.skipped) return { repo: g.repo };
  return { result: outbox.isEnabled(cwd) ? failure(g.reason) : skipped(g.reason) };
}

// ─── Argument parsing ────────────────────────────────────────────────────────

// Only these tokens are flags. Anything else (including text that happens to start with "--") is a positional.
const FLAGS = new Set(['--raw', '--help', '--no-wait', '--no-flush', '--force', '--accept-remote', '--overwrite']);

/** Positional arguments: not a known flag and not the value of a value-taking flag. */
function positionals(args, valueFlags = []) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (valueFlags.includes(a)) { i += 1; continue; }
    if (valueFlags.some((f) => a.startsWith(`${f}=`)) || FLAGS.has(a)) continue;
    out.push(a);
  }
  return out;
}

const wantsHelp = (args) => args.includes('--help') || args[0] === 'help';

// ─── gh outbox ───────────────────────────────────────────────────────────────

const OUTBOX_USAGE = [
  'Usage:',
  '  df-tools gh outbox status                                      pending/blocked/done, the halt, degraded capabilities',
  '  df-tools gh outbox flush [--no-wait]                           write the queued changes to GitHub (--no-wait: hook mode, never sleeps)',
  '  df-tools gh outbox resolve <seq> --accept-remote|--overwrite   clear a halt: keep GitHub\'s version, or keep DevFlow\'s',
  'Flags: --raw prints JSON.',
  'Exit codes (flush): 0 flushed, 1 error, 2 halted for a human, 3 ops still pending (offline or rate limited).',
].join('\n');

const OUTBOX_AVAILABLE = 'status, flush [--no-wait], resolve <seq> --accept-remote|--overwrite';

/** The issue a halt is about: a number already on it, else the mapping, else the `#N` in its detail. */
function haltIssueNumber(cwd, halted) {
  if (Number.isInteger(halted.issue_number)) return halted.issue_number;
  const id = halted.target && typeof halted.target.id === 'string' ? halted.target.id : null;
  if (id !== null) {
    const map = mappingLib.readMappingV3(cwd);
    const asTrd = id.includes('-') ? mappingLib.getTrd(map, id) : null;
    if (asTrd && Number.isInteger(asTrd.issue_number)) return asTrd.issue_number;
    const asObjective = id.includes('-') ? null : mappingLib.getEntry(map, id);
    if (asObjective && Number.isInteger(asObjective.issue_id)) return asObjective.issue_id;
  }
  const m = /#(\d+)\b/.exec(typeof halted.detail === 'string' ? halted.detail : '');
  return m ? Number(m[1]) : null;
}

/** The halt as prose: what stopped, which issue, and the two ways out. */
function haltLines(cwd, halted) {
  const seq = halted.seq === null || halted.seq === undefined ? '<seq>' : halted.seq;
  const target = halted.target && halted.target.id ? ` (${halted.target.id})` : '';
  const issue = haltIssueNumber(cwd, halted);
  const lines = [`Halted (${halted.reason}) on op ${seq}${target}: a human has to look at this before the outbox can continue.`];
  if (halted.detail) lines.push(`  ${String(halted.detail).trim()}`);
  if (issue !== null) lines.push(`  Issue: #${issue}`);
  lines.push('Resolve it with one of:');
  lines.push(`  df-tools gh outbox resolve ${seq} --accept-remote   keep what GitHub has; drop the queued change`);
  lines.push(`  df-tools gh outbox resolve ${seq} --overwrite       keep DevFlow's change and retry it on the next flush`);
  return { lines, issue };
}

function outboxStatus(cwd) {
  const g = gate(cwd);
  if (g.result) return g.result;

  const st = outbox.status(cwd);
  const caps = capability.readCachedCapabilities(g.repo);
  const degraded = caps ? capability.describeDegraded(caps) : [];
  const halted = st.halted ? { ...st.halted, issue_number: haltIssueNumber(cwd, st.halted) } : null;

  const payload = {
    ok: true,
    repo: st.repo || g.repo,
    pending: st.pending,
    blocked: st.blocked,
    done: st.done,
    halted,
    journal: st.path,
    writes: st.writes,
    degraded,
    capabilities_cached: caps !== null,
    recovered: st.recovered || null,
    queue: st.queue,
  };

  const lines = [
    `Outbox for ${payload.repo}: ${st.pending} pending, ${st.blocked} blocked, ${st.done} done.`,
    `Journal: ${st.path}`,
  ];
  if (halted) lines.push(...haltLines(cwd, halted).lines);
  for (const op of st.queue.slice(0, 10)) {
    const id = op.target && op.target.id ? ` ${op.target.id}` : '';
    const err = op.last_error ? ` - ${String(op.last_error).split('\n')[0]}` : '';
    lines.push(`  op ${op.seq}: ${op.kind}${id} [${op.status}, ${op.attempts} attempt(s)]${err}`);
  }
  if (st.queue.length > 10) lines.push(`  ... and ${st.queue.length - 10} more`);
  if (st.recovered) lines.push(`Note: the journal was unreadable and was recovered; the damaged copy is kept (${typeof st.recovered === 'string' ? st.recovered : 'see the journal directory'}).`);
  if (caps === null) lines.push('Capabilities: not detected yet (the first flush detects and caches them).');
  else if (degraded.length === 0) lines.push('Capabilities: all native, nothing degraded.');
  else {
    lines.push('Degraded capabilities:');
    for (const s of degraded) lines.push(`  - ${s}`);
  }
  return result(EXIT.OK, payload, lines.join('\n'));
}

function pendingWhy(res) {
  const at = Number.isFinite(res.retry_after) ? ` until ${new Date(res.retry_after).toISOString()}` : '';
  switch (res.reason) {
    case 'offline': return 'GitHub is unreachable; run `df-tools gh outbox flush` again when you are online';
    case 'rate_limited': return `GitHub rate limited the writes${at}; run it again later`;
    case 'budget': return `the ${res.budget || 'write'} write budget is spent; run it again later`;
    case 'retry_after': return 'an earlier failure asked for a delay that has not passed yet';
    case 'max_ops': return 'the per-run op limit was reached; run it again';
    default: return 'run it again';
  }
}

/** Map a flush result (47-07) to the D-21 exit code. */
function flushExit(res) {
  if (res.status === 'halted') return EXIT.HALTED;
  if (res.status === 'pending') return EXIT.PENDING;
  if (res.status === 'error') return EXIT.ERROR;
  return EXIT.OK; // flushed, skipped, running
}

/** The flush result as a CLI result: payload is the flush result, prose says what to do next. */
function flushResult(cwd, res) {
  const lines = [];
  switch (res.status) {
    case 'flushed':
      lines.push(`Outbox flushed: ${res.done.length} op(s) written to GitHub, nothing pending.`);
      break;
    case 'running':
      lines.push('flush already running: another process holds the outbox lock, so nothing was done here.');
      break;
    case 'skipped':
      lines.push(res.reason || 'The outbox is not enabled for this project.');
      break;
    case 'error':
      lines.push(`Flush failed: ${res.error || 'unknown error'}`);
      break;
    case 'pending':
      lines.push(`Outbox pending: ${res.pending} op(s) still queued, ${res.done.length} written this run (${pendingWhy(res)}).`);
      break;
    case 'halted':
      lines.push(`${res.done.length} op(s) written this run before the queue stopped.`);
      lines.push(...haltLines(cwd, res.halted || { reason: 'blocked', seq: null, detail: res.error }).lines);
      break;
    default:
      lines.push(`Flush ended with status ${res.status}.`);
  }
  for (const w of res.warnings || []) lines.push(`Warning (op ${w.seq}, ${w.kind}): ${w.message}`);
  return result(flushExit(res), { ok: res.status !== 'error', ...res }, lines.join('\n'));
}

function outboxFlush(cwd, args) {
  const g = gate(cwd);
  if (g.result) return g.result;
  return flushResult(cwd, flushLib.flush(cwd, { wait: !args.includes('--no-wait') }));
}

function outboxResolve(cwd, args) {
  const usage = 'Usage: df-tools gh outbox resolve <seq> --accept-remote|--overwrite (exactly one of the two flags)';
  const seqArg = positionals(args)[0];
  const accept = args.includes('--accept-remote');
  const overwrite = args.includes('--overwrite');
  if (seqArg === undefined || !/^\d+$/.test(seqArg) || accept === overwrite) return usageError(usage);

  const g = gate(cwd);
  if (g.result) return g.result;

  const choice = accept ? 'accept-remote' : 'overwrite';
  const res = flushLib.resolveHalt(cwd, Number(seqArg), choice);
  if (!res.ok) return failure(res.error);
  const what = accept
    ? `Accepted GitHub's version: op ${res.seq} was dropped and the halt is cleared.`
    : `Kept DevFlow's change: op ${res.seq} stays queued and the halt is cleared.`;
  return result(EXIT.OK, res, `${what} Run \`df-tools gh outbox flush\` to continue.`);
}

/** `gh outbox status|flush|resolve`. */
function cmdGhOutbox(cwd, args, raw) {
  const sub = args[0];
  let res;
  if (wantsHelp(args)) {
    res = result(EXIT.OK, { ok: true, usage: OUTBOX_USAGE }, OUTBOX_USAGE);
  } else if (sub === 'status') {
    res = outboxStatus(cwd);
  } else if (sub === 'flush') {
    res = outboxFlush(cwd, args.slice(1));
  } else if (sub === 'resolve') {
    res = outboxResolve(cwd, args.slice(1));
  } else {
    const what = sub === undefined ? 'Missing gh outbox subcommand.' : `Unknown gh outbox subcommand: ${sub}.`;
    res = usageError(`${what} Available: ${OUTBOX_AVAILABLE}\n${OUTBOX_USAGE}`);
  }
  emit(res, raw);
}

// ─── gh trd ──────────────────────────────────────────────────────────────────

const TRD_USAGE = [
  'Usage:',
  '  df-tools gh trd spec <trd>                                   print the effective spec (body + scope comments)',
  '  df-tools gh trd freeze <trd> [--no-flush] [--no-wait]        log a freeze: from now on changes are scope comments',
  '  df-tools gh trd fold <trd> [--force] [--no-flush] [--no-wait]  fold the scope comments into a CLOSED TRD\'s body',
  '  df-tools gh trd scope <trd> <body|@file:path> [--n K] [--no-flush] [--no-wait]   post a scope change',
  '<trd> accepts any spelling: 07-01, 7-01, 07-01-alpha. freeze, fold and scope flush the outbox unless --no-flush.',
  'Flags: --raw prints JSON. Exit codes (when flushing): 0 done, 1 error, 2 halted for a human, 3 ops still pending.',
].join('\n');

const TRD_AVAILABLE = 'spec <trd>, freeze <trd>, fold <trd> [--force], scope <trd> <body|@file:path> [--n K]';

/** `--n K` or `--n=K` -> `{n: K}` (K a positive integer), `{n: undefined}` when absent, `{invalid: true}` otherwise. */
function parseScopeN(args) {
  const i = args.findIndex((a) => a === '--n' || a.startsWith('--n='));
  if (i < 0) return { n: undefined };
  const value = args[i] === '--n' ? args[i + 1] : args[i].slice('--n='.length);
  if (typeof value !== 'string' || !/^[1-9]\d{0,8}$/.test(value)) return { invalid: true };
  return { n: Number(value) };
}

/** The scope body: the argument itself, or the contents of `@file:<path>` (relative to the project). */
function readScopeBody(cwd, body) {
  if (!body.startsWith('@file:')) return { text: body };
  const file = path.resolve(cwd, body.slice('@file:'.length));
  try {
    return { text: fs.readFileSync(file, 'utf8') };
  } catch (e) {
    return { error: `could not read the scope file ${file}: ${e.message}` };
  }
}

/**
 * The verb queued something: unless `--no-flush`, write it to GitHub now. The result carries the exit code of
 * the flush (0 done, 2 halted, 3 pending, 1 error); `--no-flush` leaves it queued and exits 0.
 */
function queuedResult(cwd, args, queued, headline) {
  if (args.includes('--no-flush')) {
    return result(EXIT.OK, { ...queued, ok: true }, `${headline}\nQueued only (--no-flush); run \`df-tools gh outbox flush\` to write it.`);
  }
  const flushed = flushResult(cwd, flushLib.flush(cwd, { wait: !args.includes('--no-wait') }));
  return result(flushed.code, { ...queued, ok: flushed.payload.ok, flush: flushed.payload }, `${headline}\n${flushed.prose}`);
}

function trdSpec(cwd, trdId) {
  const spec = comments.readEffectiveSpec(cwd, trdId);
  if (!spec.ok) return spec.skipped ? skipped(spec.reason) : failure(spec.error);
  const res = result(EXIT.OK, spec, spec.text);
  const notes = [...(spec.errors || [])];
  if (spec.overflow) notes.push(`the effective spec is ${spec.chars} chars, over the issue-body limit; the overflow becomes a new TRD`);
  if (notes.length > 0) res.warn = notes.map((n) => `Warning: ${n}`).join('\n');
  return res;
}

function trdFreeze(cwd, args, trdId) {
  const r = comments.freezeTrd(cwd, trdId);
  if (!r.ok) return failure(r.error);
  if (r.noop) {
    const drifted = r.drift && r.drift.drift === true;
    const note = drifted
      ? ` Warning: the body has changed since the freeze (${r.drift.expected} -> ${r.drift.actual}); record changes as scope comments.`
      : '';
    return result(EXIT.OK, r, `TRD ${r.id} is already frozen; nothing to do.${note}`);
  }
  return queuedResult(cwd, args, r, `Freeze of TRD ${r.id} recorded (body hash ${r.hash}, ${r.chars} chars).`);
}

function trdFold(cwd, args, trdId) {
  const r = comments.foldTrd(cwd, trdId, { force: args.includes('--force') });
  if (!r.ok) {
    return failure(r.reason === 'open' ? r.error.replace('(pass force ', '(pass --force ') : r.error, r.reason ? { reason: r.reason } : {});
  }
  if (r.noop) return result(EXIT.OK, r, `Nothing to fold: no scope comment of TRD ${r.id} is waiting to be folded into the body.`);
  if (!r.fits) return result(EXIT.OK, r, `Not folded: ${r.message}.`);
  return queuedResult(cwd, args, r, `Fold of TRD ${r.id} queued (folded through scope ${r.folded_through}).`);
}

function trdScope(cwd, args, trdId, body, n) {
  const read = readScopeBody(cwd, body);
  if (read.error) return failure(read.error);
  const r = comments.enqueueScope(cwd, { trdId, n, text: read.text });
  if (r.overflow) {
    const message = /becomes a new TRD/.test(r.message || '')
      ? r.message
      : `${r.message || r.error}; this change becomes a new TRD (it cannot be a scope comment)`;
    return failure(message, { overflow: true, chars: r.chars, max: r.max });
  }
  if (!r.ok) return failure(r.error);
  if (r.noop) return result(EXIT.OK, r, `Scope n=${r.n} of TRD ${r.id} is already recorded with this text; nothing to do.`);
  return queuedResult(cwd, args, r, `Scope change n=${r.n} for TRD ${r.id} queued (effective spec ${r.chars} chars).`);
}

/** `gh trd spec|freeze|fold|scope <trd> ...`. */
function cmdGhTrd(cwd, args, raw) {
  const verb = args[0];
  let res;
  if (wantsHelp(args)) {
    res = result(EXIT.OK, { ok: true, usage: TRD_USAGE }, TRD_USAGE);
  } else if (!['spec', 'freeze', 'fold', 'scope'].includes(verb)) {
    const what = verb === undefined ? 'Missing gh trd subcommand.' : `Unknown gh trd subcommand: ${verb}.`;
    res = usageError(`${what} Available: ${TRD_AVAILABLE}\n${TRD_USAGE}`);
  } else {
    res = trdVerb(cwd, verb, args.slice(1));
  }
  emit(res, raw);
}

function trdVerb(cwd, verb, args) {
  const pos = positionals(args, ['--n']);
  const trdId = pos[0];
  if (trdId === undefined) return usageError(`Usage: df-tools gh trd ${verb} <trd>${verb === 'scope' ? ' <body|@file:path> [--n K]' : ''}`);

  let body;
  let n;
  if (verb === 'scope') {
    body = pos[1];
    const parsed = parseScopeN(args);
    if (body === undefined || parsed.invalid) {
      return usageError('Usage: df-tools gh trd scope <trd> <body|@file:path> [--n K]  (K is a positive integer)');
    }
    n = parsed.n;
  }

  const g = gate(cwd);
  if (g.result) return g.result;

  if (verb === 'spec') return trdSpec(cwd, trdId);
  if (verb === 'freeze') return trdFreeze(cwd, args, trdId);
  if (verb === 'fold') return trdFold(cwd, args, trdId);
  return trdScope(cwd, args, trdId, body, n);
}

// ─── gh orphans ──────────────────────────────────────────────────────────────

const ORPHANS_USAGE = [
  'Usage: df-tools gh orphans <objective>',
  '  Lists TRD issues that are not linked under the objective issue, and linked TRDs that have no local file.',
  '  A report only: nothing is deleted, unlinked or rewritten. Flags: --raw prints JSON.',
].join('\n');

function orphansReport(cwd, objectiveArg) {
  const g = gate(cwd);
  if (g.result) return g.result;
  const r = hierarchy.reportOrphans(cwd, objectiveArg);
  if (r.skipped) return skipped(r.reason);
  if (!r.ok) return failure(r.error);

  const lines = [];
  if (r.unlinked.length === 0 && r.missing_local.length === 0) {
    lines.push(`No orphans for objective ${r.objective}: every TRD issue is linked and has a local file.`);
  } else {
    if (r.unlinked.length > 0) {
      lines.push('TRD issues not linked under the objective issue:');
      for (const o of r.unlinked) lines.push(`  ${o.id}  #${o.number}`);
    }
    if (r.missing_local.length > 0) {
      lines.push('Linked TRD issues with no local TRD file:');
      for (const o of r.missing_local) lines.push(`  ${o.id}  #${o.number}`);
    }
    lines.push('Nothing was deleted or changed; this is a report. Decide per issue whether to link it, pull it, or close it.');
  }
  return result(EXIT.OK, r, lines.join('\n'));
}

/** `gh orphans <objective>`. */
function cmdGhOrphans(cwd, args, raw) {
  let res;
  if (wantsHelp(args)) {
    res = result(EXIT.OK, { ok: true, usage: ORPHANS_USAGE }, ORPHANS_USAGE);
  } else {
    const objectiveArg = positionals(args)[0];
    res = objectiveArg === undefined ? usageError(ORPHANS_USAGE) : orphansReport(cwd, objectiveArg);
  }
  emit(res, raw);
}

module.exports = {
  EXIT,
  UNQUEUED_MARK,
  // The enqueue-then-flush helpers, also used by the planning verbs (48-11) so a verb and a `gh` command report a
  // flush with the same exit codes and prose.
  queuedResult,
  flushResult,
  cmdGhOutbox,
  cmdGhTrd,
  cmdGhOrphans,
};
