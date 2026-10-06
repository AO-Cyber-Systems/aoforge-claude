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
//
// The commit follow-up for the written files comes from commit-steps.cjs (TRD 52-01): a branch sequence in every mode
// (the ruleset makes a pull request mandatory either way), with the logged gate escape and the `gh pr start` route
// added in store mode, where objective 50's gate refuses a bare `df-tools commit` on the default or an unlinked branch.
// The sequence ends in a runnable `gh pr create --head devflow-setup --fill` (61-06, STOR-01), and the dry run previews
// it (`After --apply: ...`) whenever the plan would write the workflow or the PR template.

const setupLib = require('./gh-setup.cjs');
const client = require('./gh-client.cjs');
const helpers = require('./helpers.cjs');
const planningMode = require('./planning-mode.cjs');
const { branchCommitSteps, commitCommand } = require('./commit-steps.cjs');
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

const SETUP_BRANCH = 'devflow-setup';
const SETUP_COMMIT_MESSAGE = 'chore: add the DevFlow checks workflow and pull request template';

/** `github.pr.merge_method` as `gh pr merge` spells it: merge | squash | rebase, squash when unset or unknown (as gh-pr.cjs reads it). */
function mergeMethodOf(cwd) {
  const pr = ((client.readConfig(cwd) || {}).github || {}).pr;
  return pr && ['merge', 'squash', 'rebase'].includes(pr.merge_method) ? pr.merge_method : 'squash';
}

/**
 * What to do with the files apply wrote, and why the order of the merge matters. The commit follow-up is the commit-steps
 * builder's sequence (TRD 52-01), runnable as printed: the store form (logged escape, `gh pr start` route) when `cwd` is
 * in store mode, the plain branch sequence otherwise.
 *
 * `{ preview: true }` (61-06) is the dry run's form: the same sequence, but its first line says what `--apply` WILL do
 * rather than what it did. Only that line differs, so the apply wording is byte-identical.
 */
function filesLines(cwd, files, outcomes, { preview = false } = {}) {
  const steps = branchCommitSteps({
    branch: SETUP_BRANCH,
    command: commitCommand(SETUP_COMMIT_MESSAGE, files),
    reason: planningMode.isStoreMode(cwd) ? 'gh setup workflow' : null,
  });
  const first = preview
    ? `After --apply: it writes ${files.join(', ')} to the working tree, not committed.`
    : `Written to the working tree, not committed: ${files.join(', ')}.`;
  const lines = ['', first, 'Commit them through a pull request:', steps];
  const ruleset = outcomes.find((o) => o.kind === 'ruleset');
  if (ruleset && ['created', 'updated', 'exists'].includes(ruleset.status)) {
    lines.push('The ruleset requires devflow/linked-issue and devflow/planning-consistency, and those checks exist only once the workflow is on the default branch.',
      'Merge the workflow pull request first. Its required checks cannot pass until the workflow is on the default branch, so merge it with '
        + `the repository-admin bypass the ruleset grants: gh pr merge <number> --admin --${mergeMethodOf(cwd)} `
        + '(or "Merge without waiting for requirements to be met" in the web UI). Every later pull request goes through the checks and the merge queue.');
  }
  return lines;
}

// ─── The command ─────────────────────────────────────────────────────────────

/** A plan action's status as the apply outcome it would become, so filesLines reads a plan the way it reads an apply. */
const PLANNED_OUTCOME = { create: 'created', update: 'updated' };

/**
 * The follow-up steps a dry run previews (61-06): what `--apply` would write to the working tree and how to get it
 * merged. Empty when the plan writes no local file, so a current workflow and PR template print nothing extra.
 */
function previewLines(cwd, actions) {
  const files = actions
    .filter((a) => (a.kind === 'workflow' || a.kind === 'pr-template') && (a.status === 'create' || a.status === 'update'))
    .map((a) => a.target);
  if (files.length === 0) return [];
  const outcomes = actions.map((a) => ({ kind: a.kind, target: a.target, status: PLANNED_OUTCOME[a.status] || a.status }));
  return filesLines(cwd, files, outcomes, { preview: true });
}

function dryRun(cwd, state, actions, requireWiki) {
  const conflicts = actions.filter((a) => a.status === 'conflict');
  const ready = wikiReady(actions);
  const problems = [];
  if (conflicts.length > 0) problems.push(`${conflicts.length} local file conflict${conflicts.length === 1 ? '' : 's'}: apply would leave ${conflicts.length === 1 ? 'it' : 'them'} alone and exit 1.`);
  if (requireWiki && !ready) problems.push(wikiNote(actions));
  const lines = [setupLib.renderPlan(actions).trimEnd(), '',
    `Dry run for ${state.repo}: nothing was changed. Run \`df-tools gh setup --apply\` to apply this plan.`,
    ...previewLines(cwd, actions), ...problems];
  const payload = { ok: problems.length === 0, apply: false, repo: state.repo, actions, wiki_ready: ready };
  return result(problems.length === 0 ? EXIT.OK : EXIT.ERROR, payload, lines.join('\n'));
}

function applied(cwd, state, applyResult, requireWiki) {
  const { outcomes } = applyResult;
  const files = outcomes.filter((o) => (o.kind === 'workflow' || o.kind === 'pr-template') && APPLIED.has(o.status)).map((o) => o.target);
  const changed = outcomes.some((o) => APPLIED.has(o.status) || o.status === 'failed');
  const failed = outcomes.filter((o) => o.status === 'failed');
  const conflicts = outcomes.filter((o) => o.status === 'conflict');
  const ready = wikiReady(outcomes);
  const degraded = outcomes.filter((o) => o.degraded).map((o) => ({ kind: o.kind, target: o.target, note: o.note }));

  const lines = [`DevFlow repository setup: ${state.repo}`, '', ...outcomes.map(outcomeLine), '', countLine(outcomes)];
  if (!changed) lines.push('Nothing to change: everything is already in place.');
  if (files.length > 0) lines.push(...filesLines(cwd, files, outcomes));
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
  if (!parsed.apply) return dryRun(cwd, read.state, actions, parsed.requireWiki);

  const outcome = setupLib.applySetup(cwd, actions, { repo: read.state.repo, refresh: parsed.refresh });
  return applied(cwd, read.state, outcome, parsed.requireWiki);
}

function cmdGhSetup(cwd, args, raw) {
  emit(runSetup(cwd, args), raw);
}

module.exports = { SETUP_USAGE, cmdGhSetup, filesLines };
