'use strict';

// gh-pr-cli.cjs (TRD 49-09) — the human-facing commands for the objective's branch and pull request:
//
//   gh pr start  <objective> [--name <branch>] [--no-flush] [--no-wait]
//   gh pr sync   <objective> [--no-flush] [--no-wait]
//   gh pr status <objective>
//   gh pr merge  <objective> [--no-flush] [--no-wait]
//   gh pr reconcile <objective> [--no-flush] [--no-wait]
//
// Thin wrappers: parse the arguments, call ONE library function (gh-pr), format the answer, exit. No business logic
// lives here, and this module reaches neither GitHub nor git itself (guarded and NO_DIRECT_WRITE, seam test 23b).
//
// Exit codes follow gh-store-cli: 0 ok (or skipped: the store is off), 1 error, 2 halted for a human, 3 pending (offline, a
// failed push, an op GitHub could not take yet). `--raw` prints the JSON payload on stdout; prose errors go to stderr.
// process.exit is stubbed by the tests, so every handler RETURNS its result and `emit` runs exactly once.
//
// result/emit/positionals are small copies of gh-store-cli's private helpers (that module is not exported for them):
// the shape is the contract, and `flushResult` and `EXIT` are imported, so the flush exit mapping is not duplicated.

const prLib = require('./gh-pr.cjs');
const storeCli = require('./gh-store-cli.cjs');

const { EXIT, flushResult } = storeCli;

// ─── Results and output ──────────────────────────────────────────────────────

/** @returns {{code:number, payload:object, prose:string, warn?:string}} */
const result = (code, payload, prose) => ({ code, payload, prose: prose.endsWith('\n') ? prose : `${prose}\n` });
const failure = (message, extra = {}) => result(EXIT.ERROR, { ok: false, error: message, ...extra }, message);
const usageError = (usage) => failure(usage, { usage: true });
const skipped = (reason) => result(EXIT.OK, { ok: false, skipped: true, reason }, reason);

/** Print a result and exit (code 0 does not call process.exit). Errors go to stderr in prose mode; raw mode always prints JSON. */
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

// ─── Arguments ───────────────────────────────────────────────────────────────

const FLAGS = new Set(['--raw', '--help', '--no-wait', '--no-flush']);

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

/** `--name <branch>` or `--name=<branch>` -> the value, `undefined` when absent, `null` when given without one. */
function parseName(args) {
  const i = args.findIndex((a) => a === '--name' || a.startsWith('--name='));
  if (i < 0) return undefined;
  const value = args[i] === '--name' ? args[i + 1] : args[i].slice('--name='.length);
  return typeof value === 'string' && value.trim() !== '' && !value.startsWith('--') ? value.trim() : null;
}

const wantsHelp = (args) => args.includes('--help') || args[0] === 'help';

const PR_USAGE = [
  'Usage:',
  '  aof-tools gh pr start <objective> [--name <branch>] [--no-flush] [--no-wait]   (store mode, online) put the checkout on the objective\'s linked branch and open its draft PR',
  '  aof-tools gh pr sync <objective> [--no-flush] [--no-wait]                      push the objective branch and refresh the PR',
  '  aof-tools gh pr status <objective>                                             branch, PR, verification status, closes, pending scopes (reads only)',
  '  aof-tools gh pr merge <objective> [--no-flush] [--no-wait]                     (store mode, online) merge a verified PR (merge queue where the repo has one), then reconcile',
  '  aof-tools gh pr reconcile <objective> [--no-flush] [--no-wait]                 after the merge: close every leftover issue, Project Done, delete the branches, pull the cache',
  'start creates (or reuses) the objective\'s linked branch, makes one empty start commit, pushes, opens the one draft PR that closes the objective and',
  'every TRD, and freezes every TRD. Re-running it changes nothing. merge refuses a draft PR, one without a success aoforge/verification status, or a',
  'linked branch with unpushed commits (run gh pr sync); it uses github.pr.merge_method (default squash), and exits 3 when the PR was only added to a',
  'merge queue: run reconcile after the queue merges it. reconcile exits 3 while the PR is open, 1 if it was closed unmerged, and is idempotent. With',
  'the store off every verb is skipped (exit 0, no gh call, no git change).',
  'Flags: --raw prints JSON. Exit codes: 0 ok, 1 error, 2 halted for a human, 3 pending (offline, a failed push, or a PR that cannot be created yet).',
].join('\n');

const PR_AVAILABLE = 'start <objective> [--name <branch>], sync <objective>, status <objective>, merge <objective>, reconcile <objective>';

// ─── Prose ───────────────────────────────────────────────────────────────────

/** A queue that stopped because the world is not ready (no commits to open a PR from yet): the reason, not just "run it again". */
function pendingNote(flush) {
  if (flush && flush.status === 'pending' && flush.reason === 'pending' && flush.detail) {
    return `Waiting: ${String(flush.detail).trim()}; push a commit and run the verb again.`;
  }
  return null;
}

/** Turn a library answer into a CLI result: skipped, failed, queued only, or the flush's own exit code. */
function fromLibrary(cwd, r, headline, { extraPending = false } = {}) {
  if (r.skipped) return skipped(r.reason);
  if (!r.ok) return failure(r.error);
  const lines = [...headline];
  const note = pendingNote(r.flush);
  const warn = Array.isArray(r.warnings) && r.warnings.length > 0 ? r.warnings.map((w) => `Warning: ${w}`).join('\n') : undefined;
  let res;
  if (r.flush === null) {
    lines.push('Queued only (--no-flush); run `aof-tools gh outbox flush` to write it.');
    res = result(extraPending ? EXIT.PENDING : EXIT.OK, { ...r, ok: true }, lines.join('\n'));
  } else {
    const flushed = flushResult(cwd, r.flush);
    if (note) lines.push(note);
    lines.push(flushed.prose.trimEnd());
    const code = flushed.code === EXIT.OK && extraPending ? EXIT.PENDING : flushed.code;
    res = result(code, { ...r, ok: flushed.payload.ok }, lines.join('\n'));
  }
  if (warn) res.warn = warn;
  return res;
}

function startHeadline(r) {
  const lines = [`Objective ${r.objective} is on branch ${r.branch} (${r.created_branch ? 'created and linked to' : 'already linked to'} issue #${r.issue}).`];
  lines.push(r.start_commit
    ? `Start commit ${r.start_commit.slice(0, 8)} made and pushed.`
    : 'No start commit: the branch already has commits of its own.');
  if (r.pr) lines.push(`Pull request #${r.pr.number} (draft)${r.pr.url ? `: ${r.pr.url}` : ''}.`);
  else lines.push('The draft pull request is queued and not created yet.');
  if (r.frozen.length > 0) lines.push(`Frozen TRDs: ${r.frozen.join(', ')}.`);
  if (r.already_frozen.length > 0) lines.push(`Already frozen: ${r.already_frozen.join(', ')}.`);
  return lines;
}

function syncHeadline(r) {
  const lines = [r.push.ok
    ? `Pushed ${r.branch}.`
    : `Push of ${r.branch} failed: ${String(r.push.error).trim().split('\n')[0]}. The pull request refresh is queued; fix the remote and run \`aof-tools gh pr sync ${r.objective}\` again.`];
  if (r.summary) lines.push(`Summary: ${r.summary}.`);
  if (r.pr) lines.push(`Pull request #${r.pr.number}${r.pr.url ? `: ${r.pr.url}` : ''}.`);
  return lines;
}

/** What a reconcile (alone or at the end of a merge) did, one line per fact. */
function reconcileLines(r) {
  const lines = [];
  if (r.already_reconciled) {
    lines.push(`Pull request #${r.pr.number} is merged and objective ${r.objective} was already reconciled: nothing to do.`);
    return lines;
  }
  lines.push(`Pull request #${r.pr.number} is merged${r.pr.merged_at ? ` (${r.pr.merged_at})` : ''}.`);
  lines.push(r.closed.length > 0
    ? `Closed ${r.closed.length} issue(s) the merge left open: ${r.closed.map((n) => `#${n}`).join(', ')}.`
    : 'Every issue the PR closes was already closed.');
  if (r.branch) lines.push(`Remote branch ${r.branch}: ${r.remote_branch}.`);
  lines.push(`Project: ${r.project}.`);
  if (r.local === 'done') {
    lines.push(`Checkout: on ${r.default_branch}.`);
    if (r.deleted_local.length > 0) lines.push(`Deleted local branch(es): ${r.deleted_local.join(', ')}.`);
    if (r.kept.length > 0) lines.push(`Kept local branch(es): ${r.kept.map((k) => `${k.branch} (${k.reason})`).join(', ')}.`);
    lines.push(r.pulled ? 'Cache refreshed (gh pull --all).' : 'Cache not refreshed.');
  } else {
    lines.push(`Checkout: ${r.local}.`);
  }
  lines.push(r.reconciled
    ? `Objective ${r.objective} is reconciled.`
    : `Not fully reconciled yet: run \`aof-tools gh pr reconcile ${r.objective}\` again.`);
  return lines;
}

function mergeHeadline(r) {
  if (r.merged) {
    const how = r.method ? `Pull request #${r.pr.number} merged (${r.method}); reconciling.` : null;
    return how ? [how, ...reconcileLines(r)] : reconcileLines(r);
  }
  return [`Merge requested for pull request #${r.pr.number} (${r.method}).`, r.reason];
}

function statusProse(r) {
  const lines = [];
  if (!r.started) {
    lines.push(`Objective ${r.objective} has no objective branch yet: run aof-tools gh pr start ${r.objective}.`);
  } else {
    lines.push(`Objective ${r.objective}: branch ${r.branch} (base ${r.base || 'unknown'}).`);
  }
  const p = r.pr;
  if (p.number !== null) {
    const queue = p.in_merge_queue ? ', in the merge queue' : '';
    lines.push(`Pull request: #${p.number} ${p.state}${queue}${p.url ? ` (${p.url})` : ''}.`);
  } else if (p.state === 'queued') {
    lines.push('Pull request: queued, not created yet (run `aof-tools gh outbox flush`).');
  } else {
    lines.push('Pull request: none yet.');
  }
  lines.push(r.verification
    ? `Verification (aoforge/verification): ${r.verification.state}${r.verification.description ? ` - ${r.verification.description}` : ''}.`
    : 'Verification (aoforge/verification): no status posted yet.');
  lines.push(r.closes.length > 0 ? `Closes: ${r.closes.map((n) => `#${n}`).join(', ')}.` : 'Closes: nothing is mapped yet.');
  if (r.closes_missing.length > 0) {
    lines.push(`Missing from the PR body: ${r.closes_missing.map((n) => `#${n}`).join(', ')} (run \`aof-tools gh pr sync ${r.objective}\`).`);
  }
  const pending = Object.entries(r.pending_scopes);
  if (pending.length === 0) {
    lines.push('Pending scope changes: none.');
  } else {
    lines.push('Pending scope changes (not part of a spec until an objective assignee confirms them):');
    for (const [tid, scopes] of pending) {
      for (const s of scopes) lines.push(`  ${tid} n=${s.n} by ${s.author || 'an unknown author'}  ->  aof-tools gh trd confirm-scope ${tid} ${s.n}`);
    }
  }
  if (r.queued_ops > 0) lines.push(`Queued ops for this objective: ${r.queued_ops} (run \`aof-tools gh outbox status\`).`);
  for (const e of r.errors) lines.push(`Warning: ${e}`);
  return lines.join('\n');
}

// ─── The verbs ───────────────────────────────────────────────────────────────

function prStart(cwd, args, objective) {
  const name = parseName(args);
  if (name === null) return usageError('Usage: aof-tools gh pr start <objective> [--name <branch>]  (--name needs a branch name)');
  const r = prLib.startObjectivePr(cwd, objective, {
    ...(name !== undefined ? { name } : {}),
    flush: !args.includes('--no-flush'),
    wait: !args.includes('--no-wait'),
  });
  return r.skipped || !r.ok ? fromLibrary(cwd, r, []) : fromLibrary(cwd, r, startHeadline(r));
}

function prSync(cwd, args, objective) {
  const r = prLib.syncObjectivePr(cwd, objective, { flush: !args.includes('--no-flush'), wait: !args.includes('--no-wait') });
  return r.skipped || !r.ok ? fromLibrary(cwd, r, []) : fromLibrary(cwd, r, syncHeadline(r), { extraPending: r.pending });
}

function prStatusVerb(cwd, objective) {
  const r = prLib.prStatus(cwd, objective);
  if (r.skipped) return skipped(r.reason);
  if (!r.ok) return failure(r.error);
  return result(EXIT.OK, r, statusProse(r));
}

function prMerge(cwd, args, objective) {
  const r = prLib.mergeObjectivePr(cwd, objective, { flush: !args.includes('--no-flush'), wait: !args.includes('--no-wait') });
  if (r.skipped || !r.ok) return fromLibrary(cwd, r, []);
  return fromLibrary(cwd, r, mergeHeadline(r), { extraPending: r.pending === true });
}

function prReconcile(cwd, args, objective) {
  const r = prLib.reconcileObjectivePr(cwd, objective, { flush: !args.includes('--no-flush'), wait: !args.includes('--no-wait') });
  if (r.skipped || !r.ok) return fromLibrary(cwd, r, []);
  if (r.pending) return result(EXIT.PENDING, r, r.reason);
  return fromLibrary(cwd, r, reconcileLines(r));
}

/** `gh pr start|sync|status|merge|reconcile <objective>`. */
function cmdGhPr(cwd, args, raw) {
  const verb = args[0];
  let res;
  if (wantsHelp(args)) {
    res = result(EXIT.OK, { ok: true, usage: PR_USAGE }, PR_USAGE);
  } else if (!['start', 'sync', 'status', 'merge', 'reconcile'].includes(verb)) {
    const what = verb === undefined ? 'Missing gh pr subcommand.' : `Unknown gh pr subcommand: ${verb}.`;
    res = usageError(`${what} Available: ${PR_AVAILABLE}\n${PR_USAGE}`);
  } else {
    const objective = positionals(args.slice(1), ['--name'])[0];
    if (objective === undefined) {
      res = usageError(`Usage: aof-tools gh pr ${verb} <objective>\n${PR_USAGE}`);
    } else if (verb === 'start') {
      res = prStart(cwd, args.slice(1), objective);
    } else if (verb === 'sync') {
      res = prSync(cwd, args.slice(1), objective);
    } else if (verb === 'merge') {
      res = prMerge(cwd, args.slice(1), objective);
    } else if (verb === 'reconcile') {
      res = prReconcile(cwd, args.slice(1), objective);
    } else {
      res = prStatusVerb(cwd, objective);
    }
  }
  emit(res, raw);
}

module.exports = { PR_USAGE, cmdGhPr };
