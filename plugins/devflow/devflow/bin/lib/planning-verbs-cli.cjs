'use strict';

/**
 * planning-verbs-cli.cjs (TRD 48-15) — the df-tools commands over the planning verbs (48-11 planning-verbs,
 * 48-12 planning-entity-verbs / planning-import) and the store routing of today's `todo complete`,
 * `milestone complete` and `objective set-status ... complete`.
 *
 *   df-tools plan put-trd <objective> <file-name> --from <path|-> [--no-push] [--no-flush]
 *   df-tools plan push <objective> [--no-flush]
 *   df-tools objective put <id> --from <path|->
 *   df-tools objective set-status <id> <planned|in_progress|verifying|complete|cancelled|reopened>
 *   df-tools summary post <trd-id> --from <path|-> [--file <name>]
 *   df-tools summary checkpoint <trd-id> --from <path|->
 *   df-tools verification post <objective> --from <path|-> [--file <name>]
 *   df-tools doc put <rel-under-.planning> --from <path|-> [--message <text>]
 *   df-tools decision open <trd-id> --question <text|@path>
 *   df-tools decision answer <trd-id>-d<k> --from <path|-> | --text <t>      (local ids are DECISION-NNN)
 *   df-tools todo add --from <path|-> [--stem <stem>]
 *   df-tools todo complete <stem|filename>
 *   df-tools todo sync (--transcript <path>... | --session <id>) [--projects-root <dir>] [--dry-run] [--no-flush] [--no-wait]
 *   df-tools debug put <slug> --from <path|->          df-tools debug resolve <slug>
 *   df-tools quick put <N> <slug> --from <path|->      df-tools quick summary <N> --from <path|->
 *   df-tools milestone put <version> --from <path|->
 *   df-tools milestone complete <version> [--name ...] [--archive-objectives]
 *   df-tools planning draft <rel>    df-tools planning import [--dry-run]    df-tools planning mode
 *
 * One shape for every verb: content comes from `--from <path>` (relative to the cwd) or `--from -` (stdin); prose by
 * default, the verb's result object as JSON with `--raw`; the exit code is the result's `exit` (local 0/1; store
 * 0 ok, 1 error, 2 halted for a human, 3 ops still pending: gh-store-cli EXIT). Store-mode verbs take `--no-flush`
 * and `--no-wait` (no-ops locally).
 *
 * This module never calls process.exit: it sets process.exitCode and returns the code, so tests call it in-process
 * and the dispatcher's process ends with that code. The exception is a LOCAL delegate, which runs today's command
 * unchanged (it prints and exits exactly as it always has): `todo complete`, `milestone complete`, and
 * `objective set-status <id> complete` (after the frontmatter write).
 *
 * No business logic: parse, read the input, call ONE library verb, print. No gh, no git, no spawn here.
 */

const fs = require('fs');
const path = require('path');

const verbs = require('./planning-verbs.cjs');
const drafts = require('./planning-drafts.cjs');
const entity = require('./planning-entity-verbs.cjs');
const planningImport = require('./planning-import.cjs');
const backfill = require('./gh-backfill.cjs');
const planningMode = require('./planning-mode.cjs');
const { EXIT } = require('./gh-store-cli.cjs');
const { mdCell } = require('./text-escape.cjs');

// ─── Arguments ───────────────────────────────────────────────────────────────

const VALUE_FLAGS = ['--from', '--file', '--message', '--question', '--text', '--stem', '--name'];
const BOOL_FLAGS = new Set(['--raw', '--help', '--no-push', '--no-flush', '--no-wait', '--dry-run', '--archive-objectives']);

/** The value of `--flag v` or `--flag=v`; '' when the flag ends the argv; undefined when absent. */
function flagValue(args, flag) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) return i + 1 < args.length ? args[i + 1] : '';
    if (args[i].startsWith(`${flag}=`)) return args[i].slice(flag.length + 1);
  }
  return undefined;
}

/** Every value of a repeated `--flag v` or `--flag=v`, in order; an empty value is dropped. */
function flagValues(args, flag) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) {
      if (i + 1 < args.length && args[i + 1] !== '') out.push(args[i + 1]);
      i += 1;
    } else if (args[i].startsWith(`${flag}=`) && args[i].length > flag.length + 1) {
      out.push(args[i].slice(flag.length + 1));
    }
  }
  return out;
}

const has = (args, flag) => args.includes(flag);

/** Positional arguments: not a known flag and not the value of a value-taking flag. */
function positionals(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (VALUE_FLAGS.includes(a)) { i += 1; continue; }
    if (VALUE_FLAGS.some((f) => a.startsWith(`${f}=`)) || BOOL_FLAGS.has(a)) continue;
    out.push(a);
  }
  return out;
}

const flushOpts = (args) => ({ noFlush: has(args, '--no-flush'), noWait: has(args, '--no-wait') });

const FROM_USAGE =
  'missing --from <path|->: pass the content as a file (--from <path>) or on stdin (--from -). ' +
  'To change an existing planning file, `df-tools planning draft <rel>` prints a draft path seeded with it ' +
  '(reseeded when the live file has changed since); edit the draft, then pass it with --from.';

/**
 * readFrom(args, {cwd?, stdin?}) — the verb's input: `--from <path>` (resolved against cwd) or `--from -` (stdin;
 * `io.stdin` may inject a string or a function for tests). -> {text, from} | {error, usage?}
 */
function readFrom(args, io = {}) {
  const src = flagValue(args, '--from');
  if (src === undefined || src === '') return { error: FROM_USAGE, usage: true };
  if (src === '-') {
    try {
      let text;
      if (typeof io.stdin === 'function') text = io.stdin();
      else if (typeof io.stdin === 'string') text = io.stdin;
      else text = fs.readFileSync(0, 'utf8');
      return { text: String(text), from: '-' };
    } catch (e) {
      return { error: `could not read stdin (--from -): ${e.message}` };
    }
  }
  const file = path.resolve(io.cwd || process.cwd(), src);
  try {
    return { text: fs.readFileSync(file, 'utf8'), from: file };
  } catch (e) {
    return { error: `could not read --from ${src}: ${e.message}` };
  }
}

// ─── Output ──────────────────────────────────────────────────────────────────

const line = (stream, text) => {
  if (text) process[stream].write(text.endsWith('\n') ? text : `${text}\n`);
};

function finish(code) {
  process.exitCode = code;
  return code;
}

const usageResult = (message) => ({ ok: false, error: message, usage: true, exit: EXIT.ERROR });

function exitOf(res) {
  if (Number.isInteger(res.exit)) return res.exit;
  return res.ok === false ? EXIT.ERROR : EXIT.OK;
}

function headline(verb, res) {
  if (res.refused === 'budget') {
    const chars = Number.isInteger(res.chars) ? ` (${res.chars} encoded chars; the limit is 60,000)` : '';
    return `${verb}: refused: the TRD is over the store budget${chars}. Nothing was written.`;
  }
  if (res.refused) return `${verb}: refused (${res.refused}). Nothing was written.`;
  if (res.ok === false) return null;
  if (res.dry_run === true && res.prose) return null; // a dry run's prose opens with its own DRY RUN banner
  if (res.skipped) return `${verb}: nothing to do (${res.skipped}).`;
  let what = 'done';
  if (res.from && res.rel) what = `moved .planning/${res.from} -> .planning/${res.rel}`;
  else if (res.rel) what = `wrote .planning/${res.rel}`;
  const id = res.id ? `, id ${res.id}` : '';
  return `${verb}: ${what}${id} (${res.mode || 'local'} mode).`;
}

/**
 * Print a verb result and set the exit code. --raw: the result as JSON on stdout. Prose: the headline (stdout), the
 * error and warnings (stderr), the queued-only note and the flush report (stdout).
 */
function report(verb, res, raw, extraProse = null) {
  const code = exitOf(res);
  if (raw) {
    process.stdout.write(`${JSON.stringify(res, null, 2)}\n`);
    return finish(code);
  }
  line(res.ok === false ? 'stderr' : 'stdout', headline(verb, res));
  if (res.ok === false || code === EXIT.ERROR) line('stderr', `Error: ${res.error || `${verb} failed`}`);
  for (const w of res.warnings || []) line('stderr', `Warning: ${w}`);
  if (extraProse) line('stdout', extraProse);
  if (res.note) line('stdout', `Note: ${res.note}`);
  if (res.prose) line('stdout', res.prose);
  return finish(code);
}

function unknown(group, sub, available, raw) {
  return report(group, usageResult(`Unknown ${group} subcommand${sub ? `: ${sub}` : ''}. Available: ${available}`), raw);
}

/** Read `--from` and run `fn(text, from)` (`from`: the absolute path read, or '-'), or report the usage error. */
function withInput(verb, cwd, args, raw, io, fn) {
  const input = readFrom(args, { cwd, ...io });
  if (input.error) return report(verb, usageResult(input.error), raw);
  return report(verb, fn(input.text, input.from), raw);
}

function needs(verb, raw, usage) {
  return report(verb, usageResult(`usage: df-tools ${usage}`), raw);
}

// ─── plan ────────────────────────────────────────────────────────────────────

function cmdPlan(cwd, args, raw, io = {}) {
  const [sub, ...rest] = args;
  const pos = positionals(rest);
  if (sub === 'put-trd') {
    if (pos.length < 2) return needs('plan put-trd', raw, 'plan put-trd <objective> <file-name> --from <path|-> [--no-push] [--no-flush]');
    return withInput('plan put-trd', cwd, rest, raw, io, (text) =>
      verbs.putTrd(cwd, { objective: pos[0], file: pos[1], text, noPush: has(rest, '--no-push'), ...flushOpts(rest) }));
  }
  if (sub === 'push') {
    if (pos.length < 1) return needs('plan push', raw, 'plan push <objective> [--no-flush]');
    return report('plan push', verbs.planPush(cwd, pos[0], flushOpts(rest)), raw);
  }
  return unknown('plan', sub, 'put-trd, push', raw);
}

// ─── objective put / set-status ──────────────────────────────────────────────

function cmdObjectiveVerb(cwd, args, raw, io = {}) {
  const [sub, ...rest] = args;
  const pos = positionals(rest);
  if (sub === 'put') {
    if (pos.length < 1) return needs('objective put', raw, 'objective put <id> --from <path|->');
    return withInput('objective put', cwd, rest, raw, io, (text) => verbs.objectivePut(cwd, { id: pos[0], text, ...flushOpts(rest) }));
  }
  if (sub === 'set-status') {
    if (pos.length < 2) return needs('objective set-status', raw, `objective set-status <id> <${verbs.STATUSES.join('|')}>`);
    const res = verbs.objectiveSetStatus(cwd, { id: pos[0], status: pos[1], ...flushOpts(rest) });
    if (res.ok && res.delegate === 'objective complete') {
      // Local mode: OBJECTIVE.md now says `status: complete`; today's `objective complete` does the rest and owns
      // stdout and the exit code exactly as it always has.
      if (!raw) line('stderr', headline('objective set-status', res));
      return require('./objective.cjs').cmdObjectiveComplete(cwd, pos[0], raw);
    }
    return report('objective set-status', res, raw);
  }
  return unknown('objective', sub, 'next-decimal, add, insert, remove, complete, put, set-status', raw);
}

// ─── summary / verification / doc ────────────────────────────────────────────

function cmdSummary(cwd, args, raw, io = {}) {
  const [sub, ...rest] = args;
  const pos = positionals(rest);
  const file = flagValue(rest, '--file');
  if (sub === 'post' || sub === 'checkpoint') {
    const verb = `summary ${sub}`;
    if (pos.length < 1) return needs(verb, raw, `${verb} <trd-id> --from <path|->${sub === 'post' ? ' [--file <name>]' : ''}`);
    const fn = sub === 'post' ? verbs.summaryPost : verbs.summaryCheckpoint;
    return withInput(verb, cwd, rest, raw, io, (text) => fn(cwd, { trd: pos[0], text, file, ...flushOpts(rest) }));
  }
  return unknown('summary', sub, 'post, checkpoint', raw);
}

function cmdVerification(cwd, args, raw, io = {}) {
  const [sub, ...rest] = args;
  const pos = positionals(rest);
  if (sub === 'post') {
    if (pos.length < 1) return needs('verification post', raw, 'verification post <objective> --from <path|-> [--file <name>]');
    return withInput('verification post', cwd, rest, raw, io, (text) =>
      verbs.verificationPost(cwd, { objective: pos[0], text, file: flagValue(rest, '--file'), ...flushOpts(rest) }));
  }
  return unknown('verification', sub, 'post', raw);
}

function cmdDoc(cwd, args, raw, io = {}) {
  const [sub, ...rest] = args;
  const pos = positionals(rest);
  if (sub === 'put') {
    if (pos.length < 1) return needs('doc put', raw, 'doc put <rel-under-.planning> --from <path|-> [--message <text>]');
    return withInput('doc put', cwd, rest, raw, io, (text, from) =>
      verbs.docPut(cwd, { rel: pos[0], text, from, message: flagValue(rest, '--message'), ...flushOpts(rest) }));
  }
  return unknown('doc', sub, 'put', raw);
}

// ─── decision ────────────────────────────────────────────────────────────────

/** `--question <text|@path>`: the text, or the file's contents for `@path`. -> {text} | {error} */
function questionOf(cwd, args) {
  const q = flagValue(args, '--question');
  if (q === undefined || q.trim() === '') return { error: 'decision open needs --question <text|@path>' };
  if (!q.startsWith('@')) return { text: q };
  try {
    return { text: fs.readFileSync(path.resolve(cwd, q.slice(1)), 'utf8') };
  } catch (e) {
    return { error: `could not read --question ${q}: ${e.message}` };
  }
}

function cmdDecision(cwd, args, raw, io = {}) {
  const [sub, ...rest] = args;
  const pos = positionals(rest);
  if (sub === 'open') {
    const q = questionOf(cwd, rest);
    if (q.error) return report('decision open', usageResult(`${q.error}; usage: df-tools decision open <trd-id> --question <text|@path>`), raw);
    return report('decision open', entity.decisionOpen(cwd, { trd: pos[0], question: q.text, ...flushOpts(rest) }), raw);
  }
  if (sub === 'answer') {
    if (pos.length < 1) return needs('decision answer', raw, 'decision answer <trd-id>-d<k> --from <path|-> | --text <t>');
    const t = flagValue(rest, '--text');
    if (t !== undefined && t !== '') return report('decision answer', entity.decisionAnswer(cwd, { id: pos[0], text: t, ...flushOpts(rest) }), raw);
    return withInput('decision answer', cwd, rest, raw, io, (text) => entity.decisionAnswer(cwd, { id: pos[0], text, ...flushOpts(rest) }));
  }
  return unknown('decision', sub, 'open, answer', raw);
}

// ─── todo ────────────────────────────────────────────────────────────────────

/** Local `todo complete` takes today's file name; a bare stem whose `<stem>.md` is pending is accepted too. */
function localTodoFile(cwd, arg) {
  if (typeof arg !== 'string' || arg.endsWith('.md')) return arg;
  const pending = path.join(cwd, '.planning', 'todos', 'pending');
  if (!fs.existsSync(path.join(pending, arg)) && fs.existsSync(path.join(pending, `${arg}.md`))) return `${arg}.md`;
  return arg;
}

function cmdTodoVerb(cwd, args, raw, io = {}) {
  const [sub, ...rest] = args;
  if (sub === 'add') {
    return withInput('todo add', cwd, rest, raw, io, (text) =>
      entity.todoAdd(cwd, { text, stem: flagValue(rest, '--stem'), ...flushOpts(rest) }));
  }
  if (sub === 'complete') {
    // args[1] exactly as the old dispatcher's args[2], so the local form is byte-identical.
    if (planningMode.isStoreMode(cwd)) return report('todo complete', entity.todoComplete(cwd, { stem: args[1], ...flushOpts(rest) }), raw);
    return require('./misc.cjs').cmdTodoComplete(cwd, localTodoFile(cwd, args[1]), raw);
  }
  if (sub === 'sync') return cmdTodoSync(cwd, rest, raw);
  return unknown('todo', sub, 'add, complete, sync', raw);
}

const TODO_SYNC_USAGE =
  'usage: df-tools todo sync (--transcript <path>... | --session <id>) [--projects-root <dir>] [--dry-run] [--no-flush] [--no-wait]';

/**
 * `todo sync`: merge a session's task-list todos into the archive (63-02). --raw prints the result as JSON; otherwise one
 * headline, `added N, completed M` and the paths left to commit (the planning import report does the same: the generic
 * headline would read the result's `skipped` list as a skip).
 */
function cmdTodoSync(cwd, args, raw) {
  const todoSync = require('./todo-sync.cjs'); // loaded here so `todo add` / `todo complete` load nothing new
  const transcripts = flagValues(args, '--transcript');
  const sessionId = flagValue(args, '--session');
  if (sessionId !== undefined) {
    const found = todoSync.resolveSessionTranscript(sessionId, { projectsRoot: flagValue(args, '--projects-root') });
    if (found.error) return report('todo sync', usageResult(found.error), raw);
    transcripts.push(found.path);
  }
  if (transcripts.length === 0) return report('todo sync', usageResult(TODO_SYNC_USAGE), raw);

  const res = todoSync.syncTodos(cwd, { transcripts, sessionId, dryRun: has(args, '--dry-run'), ...flushOpts(args) });
  if (raw || !Array.isArray(res.added)) return report('todo sync', res, raw);

  const n = res.todo_items;
  const label = `todo sync${res.dry_run ? ' (dry run)' : ''}`;
  if (typeof res.skipped === 'string') line('stdout', `${label}: nothing to do (${res.skipped}).`);
  else line('stdout', `${label}: ${n} session todo${n === 1 ? '' : 's'} from ${res.transcripts} transcript${res.transcripts === 1 ? '' : 's'} (${res.mode} mode).`);
  if (res.ok === false) line('stderr', `Error: ${res.error || 'todo sync failed'}`);
  for (const w of res.warnings || []) line('stderr', `Warning: ${w}`);
  if (res.prose) line('stdout', res.prose);
  return finish(exitOf(res));
}

// ─── debug / quick ───────────────────────────────────────────────────────────

function cmdDebug(cwd, args, raw, io = {}) {
  const [sub, ...rest] = args;
  const pos = positionals(rest);
  if (sub === 'put') {
    if (pos.length < 1) return needs('debug put', raw, 'debug put <slug> --from <path|->');
    return withInput('debug put', cwd, rest, raw, io, (text) => entity.debugPut(cwd, { slug: pos[0], text, ...flushOpts(rest) }));
  }
  if (sub === 'resolve') {
    if (pos.length < 1) return needs('debug resolve', raw, 'debug resolve <slug>');
    return report('debug resolve', entity.debugResolve(cwd, { slug: pos[0], ...flushOpts(rest) }), raw);
  }
  return unknown('debug', sub, 'put, resolve', raw);
}

function cmdQuick(cwd, args, raw, io = {}) {
  const [sub, ...rest] = args;
  const pos = positionals(rest);
  if (sub === 'put') {
    if (pos.length < 2) return needs('quick put', raw, 'quick put <N> <slug> --from <path|->');
    return withInput('quick put', cwd, rest, raw, io, (text) => entity.quickPut(cwd, { n: pos[0], slug: pos[1], text, ...flushOpts(rest) }));
  }
  if (sub === 'summary') {
    if (pos.length < 1) return needs('quick summary', raw, 'quick summary <N> --from <path|->');
    return withInput('quick summary', cwd, rest, raw, io, (text) => entity.quickSummary(cwd, { n: pos[0], text, ...flushOpts(rest) }));
  }
  return unknown('quick', sub, 'put, summary', raw);
}

// ─── milestone ───────────────────────────────────────────────────────────────

/** `--name` takes every word up to the next flag (today's dispatcher parse, kept for byte-identical output). */
function milestoneName(args) {
  const i = args.indexOf('--name');
  if (i === -1) return null;
  const words = [];
  for (let j = i + 1; j < args.length; j++) {
    if (args[j].startsWith('--')) break;
    words.push(args[j]);
  }
  return words.join(' ') || null;
}

function cmdMilestoneVerb(cwd, args, raw, io = {}) {
  const [sub, ...rest] = args;
  if (sub === 'put') {
    const pos = positionals(rest);
    if (pos.length < 1) return needs('milestone put', raw, 'milestone put <version> --from <path|->');
    return withInput('milestone put', cwd, rest, raw, io, (text) => entity.milestonePut(cwd, { version: pos[0], text, ...flushOpts(rest) }));
  }
  if (sub === 'complete') {
    if (planningMode.isStoreMode(cwd)) {
      return report('milestone complete', entity.milestoneComplete(cwd, { version: args[1], dryRun: has(rest, '--dry-run'), ...flushOpts(rest) }), raw);
    }
    const options = { name: milestoneName(args), archiveObjectives: has(args, '--archive-objectives'), dryRun: has(args, '--dry-run') };
    return require('./roadmap.cjs').cmdMilestoneComplete(cwd, args[1], options, raw);
  }
  return unknown('milestone', sub, 'complete, put', raw);
}

// ─── planning draft / import / mode ──────────────────────────────────────────

const describeItem = (x) => {
  if (typeof x === 'string') return x;
  if (x && typeof x === 'object' && x.rel) return `${x.rel}${x.reason ? `: ${x.reason}` : ''}${x.hint ? ` (${x.hint})` : ''}`;
  return JSON.stringify(x);
};

/** The `will stay local:` table (51-05, OQ5): every refused TRD and every kept-local file, one row each. */
function stayLocalTable(res) {
  const rows = [];
  for (const x of Array.isArray(res.refused) ? res.refused : []) {
    const chars = Number.isFinite(x.chars) ? `${x.chars.toLocaleString('en-US')} chars, ` : '';
    rows.push([x.rel, `refused: ${chars}over the TRD budget${x.hint ? ` (${x.hint})` : ''}`]);
  }
  for (const x of Array.isArray(res.kept_local) ? res.kept_local : []) rows.push([x.rel, x.reason || '']);
  if (rows.length === 0) return ['will stay local: nothing.'];
  return ['will stay local:', '  | file | why |', '  |---|---|', ...rows.map(([rel, why]) => `  | ${mdCell(rel)} | ${mdCell(why)} |`)];
}

/**
 * The prose of `planning import`: the preview banner (store off), the per-kind counts, the one-line request estimate,
 * the history closes, the will-stay-local table, then anything skipped.
 */
function importProse(res) {
  const counts = Object.entries(res.queued || {}).filter(([, n]) => Number(n) > 0).map(([k, n]) => `${n} ${k}`);
  const lines = [];
  if (res.preview) lines.push('preview (store is off): this is what the GitHub backfill would queue.');
  lines.push(`planning import${res.dry_run ? ' (dry run)' : ''}: ${counts.length ? `queued ${counts.join(', ')}` : 'nothing to queue'}.`);
  if (res.estimate) lines.push(`estimate: ${backfill.renderEstimate(res.estimate)}`);
  if (res.history) {
    lines.push(`history: ${res.history.closed_completed} closed (completed), ${res.history.closed_not_planned} closed (not planned)`);
  }
  lines.push(...stayLocalTable(res));
  if (Array.isArray(res.skipped) && res.skipped.length > 0) {
    lines.push('Skipped:');
    for (const x of res.skipped) lines.push(`  - ${describeItem(x)}`);
  }
  return lines.join('\n');
}

function cmdPlanningVerb(cwd, args, raw) {
  const [sub, ...rest] = args;
  const pos = positionals(rest);
  if (sub === 'mode') {
    const m = planningMode.planningMode(cwd);
    if (raw) process.stdout.write(`${JSON.stringify({ mode: m.mode, reason: m.reason, root: m.root }, null, 2)}\n`);
    else process.stdout.write(`${m.mode}\n`);
    return finish(EXIT.OK);
  }
  if (sub === 'draft') {
    if (pos.length < 1) return needs('planning draft', raw, 'planning draft <rel-under-.planning>');
    let res;
    try {
      res = drafts.prepareDraft(cwd, pos[0]);
    } catch (e) {
      return report('planning draft', usageResult(e.message), raw);
    }
    if (raw) {
      const { path: file, seeded, reseeded, stale_copy } = res;
      process.stdout.write(`${JSON.stringify({ ok: true, rel: pos[0], path: file, seeded, reseeded, stale_copy }, null, 2)}\n`);
    } else {
      // stdout is only the path: callers capture it with DRAFT=$(df-tools planning draft <rel>).
      process.stdout.write(`${res.path}\n`);
      if (res.reseeded) {
        line(
          'stderr',
          `planning draft: reseeded ${res.path} from .planning/${pos[0]}: the live file changed after the draft was ` +
            `seeded. Your previous draft is at ${res.stale_copy}.`,
        );
      }
    }
    return finish(EXIT.OK);
  }
  if (sub === 'import') {
    const res = planningImport.planImport(cwd, { dryRun: has(rest, '--dry-run') });
    if (raw) return report('planning import', res, raw);
    if (res.ok === false) return report('planning import', { ...res, refused: undefined }, raw);
    // The import prose is the whole report: report()'s generic headline would read the `skipped` ARRAY as a skip.
    for (const w of res.warnings || []) line('stderr', `Warning: ${w}`);
    line('stdout', importProse(res));
    if (res.prose) line('stdout', res.prose);
    return finish(exitOf(res));
  }
  return unknown('planning', sub, 'sibling-trd-scan, draft, import, mode', raw);
}

module.exports = {
  readFrom,
  positionals,
  flagValue,
  report,
  cmdPlan,
  cmdObjectiveVerb,
  cmdSummary,
  cmdVerification,
  cmdDoc,
  cmdDecision,
  cmdTodoVerb,
  cmdDebug,
  cmdQuick,
  cmdMilestoneVerb,
  cmdPlanningVerb,
  stayLocalTable,
};
