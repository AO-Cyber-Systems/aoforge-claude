'use strict';

// gh-setup-cli.cjs (TRD 50-11) — `df-tools gh setup [--apply] [--refresh] [--require-wiki] [--raw]` (GEN-04).
//
// A thin command over gh-setup: read the repository (gh reads only), render the two local templates, plan, then either
// print the plan (the default: a dry-run, nothing changes) or apply it (`--apply`). No business logic lives here, and
// this module reaches neither GitHub nor git itself (guarded and NO_DIRECT_WRITE, seam test): every write is
// `gh-setup.applySetup`, through gh-client.
//
// Enablement is `github.enabled` + `github.repo`, NOT store mode: a repository can be set up before the store is turned
// on. With github disabled the command prints skipped, exits 0 and makes no gh call, like every other gh verb.
//
// Exit codes: 0 a dry-run, or an apply that finished (degradations and advisories included); 1 an error, a failed
// repo-level action, a local file that is a `conflict` (never touched), or `--require-wiki` while the wiki is not
// ready. `--raw` prints the JSON payload on stdout; prose for a failing run goes to stderr, as `gh pr` does.
// process.exit is stubbed by the tests, so every handler RETURNS its result and `emit` runs exactly once.
//
// result/emit are small copies of gh-pr-cli's private helpers (the shape is the contract); `EXIT` is imported.

const setupLib = require('./gh-setup.cjs');
const helpers = require('./helpers.cjs');
const { EXIT } = require('./gh-store-cli.cjs');

// ─── Results and output ──────────────────────────────────────────────────────

/** @returns {{code:number, payload:object, prose:string}} */
const result = (code, payload, prose) => ({ code, payload, prose: prose.endsWith('\n') ? prose : `${prose}\n` });
const failure = (message, extra = {}) => result(EXIT.ERROR, { ok: false, error: message, ...extra }, message);
const skipped = (reason) => result(EXIT.OK, { ok: false, skipped: true, reason }, reason);

/** Print a result and exit (code 0 does not call process.exit). Errors go to stderr in prose mode; raw mode always prints JSON. */
function emit(res, raw) {
  if (raw) process.stdout.write(`${JSON.stringify(res.payload, null, 2)}\n`);
  else if (res.code === EXIT.ERROR) process.stderr.write(res.prose);
  else process.stdout.write(res.prose);
  if (res.code !== EXIT.OK) process.exit(res.code);
}

// ─── Arguments ───────────────────────────────────────────────────────────────

const FLAGS = new Set(['--apply', '--refresh', '--require-wiki', '--raw']);

const SETUP_USAGE = [
  'Usage: df-tools gh setup [--apply] [--refresh] [--require-wiki] [--raw]',
  '  Show (and with --apply, make) everything a repository needs for DevFlow enforcement: the default-branch ruleset (with a',
  '  merge queue where the plan allows it), the DevFlow labels, issue types and issue fields, the wiki and branch-cleanup',
  '  settings, and the checks workflow and pull request template written into the working tree.',
  '  With no flag it is a dry-run: it prints every action with its exact payload and changes nothing. It needs github.enabled',
  '  and github.repo, not store mode. --apply is idempotent: a second run makes no GitHub write and changes no file.',
  '  A merge queue the plan refuses, issue-field options GitHub does not accept and org endpoints without owner rights are',
  '  degradations, not failures. The workflow and pull request template are written but never committed.',
  '  --refresh forgets what an earlier run learned (a refused merge queue) and tries again. --require-wiki exits 1 while the',
  '  wiki has no first page (wiki pushes are blocked until it does).',
  'Flags: --raw prints JSON. Exit codes: 0 dry-run or applied, 1 an error, a failed action, a conflicting local file or an unready wiki.',
].join('\n');

/** @returns {{apply:boolean, refresh:boolean, requireWiki:boolean}|{error:string}} */
function parseArgs(args) {
  const unknown = args.filter((a) => !FLAGS.has(a));
  if (unknown.length > 0) return { error: `Unknown gh setup argument${unknown.length === 1 ? '' : 's'}: ${unknown.join(' ')}\n${SETUP_USAGE}` };
  return { apply: args.includes('--apply'), refresh: args.includes('--refresh'), requireWiki: args.includes('--require-wiki') };
}

// ─── Prose ───────────────────────────────────────────────────────────────────

const APPLIED = new Set(['created', 'updated']);
const detail = (o) => (o.error || o.note ? ` - ${o.error || o.note}` : '');
const outcomeLine = (o) => `[${o.status}] ${o.kind} ${o.target}${detail(o)}`;

/** The wiki is ready when the plan (or the apply) found its first page. */
const wikiReady = (entries) => entries.some((e) => e.kind === 'wiki' && (e.status === 'exists'));

function wikiNote(entries) {
  const w = entries.find((e) => e.kind === 'wiki');
  const why = w ? (w.note || w.desc || '') : '';
  return `The wiki is not ready${why ? `: ${why}` : '.'}`;
}

/** The count line: how many outcomes of each status, in a fixed order. */
function countLine(outcomes) {
  const order = ['created', 'updated', 'exists', 'skipped', 'manual', 'advisory', 'conflict', 'failed'];
  const parts = order
    .map((s) => [s, outcomes.filter((o) => o.status === s).length])
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s === 'exists' ? 'already in place' : s}`);
  return `Applied ${outcomes.length} action${outcomes.length === 1 ? '' : 's'}: ${parts.join(', ')}.`;
}

/** What to do with the files apply wrote, and why the order of the merge matters. */
function filesLines(files, outcomes) {
  const lines = ['', `Written to the working tree, not committed: ${files.join(', ')}.`,
    `Commit them on a branch and open a pull request: df-tools commit "chore: add the DevFlow checks workflow and pull request template" --files ${files.join(' ')}`];
  const ruleset = outcomes.find((o) => o.kind === 'ruleset');
  if (ruleset && ['created', 'updated', 'exists'].includes(ruleset.status)) {
    lines.push('The ruleset requires devflow/linked-issue and devflow/planning-consistency, and those checks exist only once the workflow is on the default branch.',
      'Merge the workflow pull request first: until it is merged nothing can merge into the default branch, so an admin may need to bypass the ruleset once for that pull request.');
  }
  return lines;
}

// ─── The command ─────────────────────────────────────────────────────────────

function dryRun(state, actions, requireWiki) {
  const conflicts = actions.filter((a) => a.status === 'conflict');
  const ready = wikiReady(actions);
  const problems = [];
  if (conflicts.length > 0) problems.push(`${conflicts.length} local file conflict${conflicts.length === 1 ? '' : 's'}: apply would leave ${conflicts.length === 1 ? 'it' : 'them'} alone and exit 1.`);
  if (requireWiki && !ready) problems.push(wikiNote(actions));
  const lines = [setupLib.renderPlan(actions).trimEnd(), '',
    `Dry run for ${state.repo}: nothing was changed. Run \`df-tools gh setup --apply\` to apply this plan.`, ...problems];
  const payload = { ok: problems.length === 0, apply: false, repo: state.repo, actions, wiki_ready: ready };
  return result(problems.length === 0 ? EXIT.OK : EXIT.ERROR, payload, lines.join('\n'));
}

function applied(state, applyResult, requireWiki) {
  const { outcomes } = applyResult;
  const files = outcomes.filter((o) => (o.kind === 'workflow' || o.kind === 'pr-template') && APPLIED.has(o.status)).map((o) => o.target);
  const changed = outcomes.some((o) => APPLIED.has(o.status) || o.status === 'failed');
  const failed = outcomes.filter((o) => o.status === 'failed');
  const conflicts = outcomes.filter((o) => o.status === 'conflict');
  const ready = wikiReady(outcomes);
  const degraded = outcomes.filter((o) => o.degraded).map((o) => ({ kind: o.kind, target: o.target, note: o.note }));

  const lines = [`DevFlow repository setup: ${state.repo}`, '', ...outcomes.map(outcomeLine), '', countLine(outcomes)];
  if (!changed) lines.push('Nothing to change: everything is already in place.');
  if (files.length > 0) lines.push(...filesLines(files, outcomes));
  if (failed.length > 0) lines.push('', `${failed.length} action${failed.length === 1 ? '' : 's'} failed; the rest were still applied. Fix the cause and run \`df-tools gh setup --apply\` again: it only does what is still missing.`);
  if (conflicts.length > 0) lines.push('', `${conflicts.length} local file${conflicts.length === 1 ? ' is' : 's are'} in conflict and was left untouched: merge the DevFlow content into ${conflicts.length === 1 ? 'it' : 'them'} by hand, or remove ${conflicts.length === 1 ? 'it' : 'them'} and run again.`);
  const wikiBlocked = requireWiki && !ready;
  if (wikiBlocked) lines.push('', wikiNote(outcomes));

  const ok = applyResult.ok && !wikiBlocked;
  const payload = { ok, apply: true, repo: state.repo, outcomes, files, degraded, wiki_ready: ready };
  return result(ok ? EXIT.OK : EXIT.ERROR, payload, lines.join('\n'));
}

/** `gh setup [--apply] [--refresh] [--require-wiki]`. */
function runSetup(cwd, args) {
  if (args.includes('--help') || args[0] === 'help') return result(EXIT.OK, { ok: true, usage: SETUP_USAGE }, SETUP_USAGE);
  const parsed = parseArgs(args);
  if (parsed.error) return failure(parsed.error, { usage: true });

  const read = setupLib.readSetupState(cwd, { refresh: parsed.refresh });
  if (read.skipped) return skipped(read.reason);
  if (!read.ok) return failure(read.error);

  let actions;
  try {
    const templates = setupLib.renderTemplates(read.state.github, helpers.pluginVersion());
    actions = setupLib.planSetup({ ...read.state, templates });
  } catch (e) {
    return failure(`could not plan the setup: ${e.message}`);
  }
  if (!parsed.apply) return dryRun(read.state, actions, parsed.requireWiki);

  const outcome = setupLib.applySetup(cwd, actions, { repo: read.state.repo, refresh: parsed.refresh });
  return applied(read.state, outcome, parsed.requireWiki);
}

function cmdGhSetup(cwd, args, raw) {
  emit(runSetup(cwd, args), raw);
}

module.exports = { SETUP_USAGE, cmdGhSetup };
