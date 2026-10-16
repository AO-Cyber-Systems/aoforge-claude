'use strict';

// `aof-tools trd finalize <objective>-<trd>` (TRD 76-04): the executor's post-SUMMARY bookkeeping
// in one call. The executor used to run seven-plus state, roadmap and requirements commands by hand
// after each TRD, deriving their arguments (task count, file count, decisions, requirement ids) from
// the TRD and SUMMARY itself. That is mechanical work; this runs the same commands, in the same
// order, with the arguments read from the files, and reports each step.
//
// It composes the existing verbs as subprocesses rather than re-implementing them: each verb keeps
// its own store-mode handling, and `output()` exits, so in-process calls could not continue.
//
// A safe retry (quick 36): the verbs are idempotent (record-metric replaces the row for the same
// objective and job, an identical add-decision is a no-op), so re-running after a failure or a
// success leaves one copy of each decision and metric. A decision `Summary: rationale` passes both
// parts; a checkpoint SUMMARY (## Progress, no ## Self-Check) is refused; `01-1` is `01-01`.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { output, error, trdKey } = require('./helpers.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { findObjectiveInternal } = require('./objective.cjs');
const { isCheckpointOnlySummary } = require('./misc.cjs');

const AOF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');

/**
 * `76-04` -> { objective: '76', trd: '04' }; decimal objectives (`72.1-03`) keep their dot. The TRD
 * number is zero-padded to at least two digits (`01-1` and `1-1` -> trd '01'; `01-100` stays '100').
 */
function parseTrdId(id) {
  const m = String(id || '').match(/^(\d+(?:\.\d+)?)-(\d+)$/);
  return m ? { objective: m[1], trd: m[2].padStart(2, '0') } : null;
}

/**
 * A SUMMARY key-decision -> { summary, rationale? }. `Summary: rationale` splits at the first colon
 * followed by whitespace, so `Use https://example.com docs` stays whole. No such colon: all summary.
 */
function splitDecision(text) {
  const s = String(text);
  const m = /^(.+?):\s+(\S[\s\S]*)$/.exec(s);
  if (!m) return { summary: s.trim() };
  return { summary: m[1].trim(), rationale: m[2].trim() };
}

/** `--flag v` or `--flag=v` (planning-verbs-cli.cjs rule): '' for a flag with nothing after it. */
function flagValue(args, flag) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) return i + 1 < args.length ? args[i + 1] : '';
    if (args[i].startsWith(`${flag}=`)) return args[i].slice(flag.length + 1);
  }
  return undefined;
}

function countList(v) {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') return Object.values(v).reduce((n, x) => n + countList(x), 0);
  return 0;
}

function asList(v) {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return v.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

/**
 * plan(cwd, id) -> { objective, trd, trd_path, summary_path, steps: [{ step, argv }], skipped: [...] }
 * Reads the TRD and its posted SUMMARY; throws when either is missing.
 */
function plan(cwd, id, { duration } = {}) {
  const parsed = parseTrdId(id);
  if (!parsed) throw new Error(`trd finalize needs <objective>-<trd> (e.g. 76-04), got "${id}"`);
  const obj = findObjectiveInternal(cwd, parsed.objective);
  if (!obj || !obj.found) throw new Error(`objective ${parsed.objective} not found`);
  const dir = path.join(cwd, obj.directory);
  const files = fs.readdirSync(dir);
  const key = `${obj.objective_number}-${parsed.trd}`;
  const trdFile = files.find((f) => /-TRD\.md$/.test(f) && trdKey(f) === key);
  const summaryFile = files.find((f) => /-SUMMARY\.md$/.test(f) && trdKey(f) === key);
  if (!trdFile) throw new Error(`no TRD for ${key} in ${obj.directory}`);
  if (!summaryFile) throw new Error(`no SUMMARY for ${key} in ${obj.directory}: post it with \`summary post\` first`);

  const trdText = fs.readFileSync(path.join(dir, trdFile), 'utf-8');
  const summaryText = fs.readFileSync(path.join(dir, summaryFile), 'utf-8');
  if (isCheckpointOnlySummary(summaryText)) {
    throw new Error(`SUMMARY for ${key} is a mid-run checkpoint (## Progress, no ## Self-Check): finish the TRD and post the final SUMMARY with \`summary post\` first`);
  }
  const trdFm = extractFrontmatter(trdText);
  const sumFm = extractFrontmatter(summaryText);
  const tasks = (trdText.match(/<task(?:\s[^>]*)?>/g) || []).length;
  const fileCount = countList(sumFm['key-files']);
  const decisions = asList(sumFm['key-decisions']).map(splitDecision);
  const requirements = asList(trdFm.requirements);
  const dur = duration || (sumFm.duration ? String(sumFm.duration) : null);
  const N = obj.objective_number;

  const steps = [
    { step: 'advance-job', argv: ['state', 'advance-job', '--objective', N] },
    { step: 'update-progress', argv: ['state', 'update-progress'] },
  ];
  const skipped = [];
  if (dur) {
    steps.push({ step: 'record-metric', argv: ['state', 'record-metric', '--objective', N, '--job', parsed.trd, '--duration', dur, '--tasks', String(tasks), '--files', String(fileCount)] });
  } else {
    skipped.push({ step: 'record-metric', reason: 'no --duration and no SUMMARY duration' });
  }
  for (const d of decisions) {
    const argv = ['state', 'add-decision', '--objective', N, '--summary', d.summary];
    if (d.rationale) argv.push('--rationale', d.rationale);
    steps.push({ step: 'add-decision', argv });
  }
  steps.push({ step: 'record-session', argv: ['state', 'record-session', '--stopped-at', `Completed ${trdFile}`] });
  steps.push({ step: 'roadmap-progress', argv: ['roadmap', 'update-job-progress', N] });
  if (requirements.length) steps.push({ step: 'requirements', argv: ['requirements', 'mark-complete', ...requirements] });
  else skipped.push({ step: 'requirements', reason: 'the TRD names no requirements' });

  return {
    id: key,
    objective: N,
    trd: parsed.trd,
    trd_path: path.join(obj.directory, trdFile),
    summary_path: path.join(obj.directory, summaryFile),
    tasks,
    files: fileCount,
    decisions: decisions.length,
    requirements,
    steps,
    skipped,
  };
}

/** Run each planned step against `cwd`; stops at the first failure (later steps read its result). */
function run(cwd, planned) {
  const results = [];
  for (const s of planned.steps) {
    const r = spawnSync(process.execPath, [AOF_TOOLS, '--cwd', cwd, ...s.argv], { encoding: 'utf-8' });
    const ok = r.status === 0;
    results.push({ step: s.step, ok, exit: r.status, detail: ok ? undefined : (r.stderr || r.stdout || '').trim().slice(0, 400) });
    if (!ok) break;
  }
  return results;
}

function cmdTrdFinalize(cwd, args, raw) {
  const id = args[2];
  // Checked before plan(), so a bad value runs nothing, not even a dry run. The flag guard consumes
  // the token after `--duration` even when it is a flag, hence the `-` check.
  const duration = flagValue(args, '--duration');
  if (duration !== undefined && (duration === '' || duration.startsWith('-'))) {
    error('trd finalize: --duration needs a value (e.g. --duration 12min)');
  }
  const dryRun = args.includes('--dry-run');
  let planned;
  try {
    planned = plan(cwd, id, { duration });
  } catch (e) {
    error(e.message);
  }
  const steps = dryRun
    ? planned.steps.map((s) => ({ step: s.step, argv: s.argv }))
    : run(cwd, planned);
  const ok = dryRun || (steps.length === planned.steps.length && steps.every((s) => s.ok));
  const { steps: _omit, ...rest } = planned;
  const result = { ...rest, dry_run: dryRun, ok, steps };
  const text = steps.map((s) => `${s.ok === false ? 'FAIL' : dryRun ? 'plan' : 'ok  '} ${s.step}${s.detail ? `: ${s.detail}` : ''}`)
    .concat(planned.skipped.map((s) => `skip ${s.step}: ${s.reason}`)).join('\n');
  if (!ok) {
    process.stdout.write(raw ? `${text}\n` : `${JSON.stringify(result, null, 2)}\n`);
    process.exit(1);
  }
  output(result, raw, text);
}

module.exports = { parseTrdId, plan, run, cmdTrdFinalize, splitDecision };
