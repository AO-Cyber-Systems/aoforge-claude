#!/usr/bin/env node
'use strict';

/**
 * ci-visual-judge: the CI proof that the live visual judge really looked (TRD 74-01, OPS-01).
 *
 * `verify flutter-ui-eval <manifest> --judge live --raw` cannot be trusted on its own exit code.
 * A credential-less live run still reports `gate: "binding"` and exits 0: every state's call
 * throws, the state drops to `verdict: review` with an error and no evidence, and an
 * `expect: fail` state counts as `known_failing`. Run alone in CI it would be green without the
 * secret. This script refuses to start without a credential, runs the judge, and then asserts on
 * the rollup that the live model judged every state and agreed with its labels.
 *
 * NEVER prints a credential: only presence is checked, and every printed string is redacted of
 * the credential values (a failed curl inside the engine echoes its own command line, header
 * included, into the rollup) and cut to a readable length.
 *
 * Usage:  node scripts/ci-visual-judge.cjs <manifest>
 * Exits 0 only when the live rollup passes assertLiveRollup.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const AOF_TOOLS = path.join(__dirname, '..', 'plugins', 'aoforge', 'aoforge', 'bin', 'aof-tools.cjs');

const NO_CREDENTIAL =
  'ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL) is not available to this run: ' +
  'set it as a repository secret';

/** PURE: does the live rollup prove the model judged every state and agreed with its labels? */
function assertLiveRollup(rollup, manifest) {
  const failures = [];
  const warnings = [];

  // The run's standing. A labels run (gate advisory, judge offline-label-echo, network false)
  // can reproduce every other field of a passing rollup, so it is ruled out first.
  if (rollup.gate !== 'binding' || rollup.judge !== 'live-vision' || rollup.network !== true) {
    failures.push(
      `not a live run: gate=${rollup.gate} judge=${rollup.judge} network=${rollup.network} ` +
      '(expected gate=binding judge=live-vision network=true)');
  }

  const states = Array.isArray(rollup.states) ? rollup.states : [];
  const byId = new Map(states.map((s) => [s.state_id, s]));
  const manifestStates = (manifest && Array.isArray(manifest.states)) ? manifest.states : [];
  if (states.length !== manifestStates.length) {
    failures.push(`the rollup has ${states.length} state(s), the manifest has ${manifestStates.length}`);
  }

  for (const s of manifestStates) {
    const id = s.state_id;
    const r = byId.get(id);
    if (!r) {
      failures.push(`${id}: missing from the rollup`);
      continue;
    }

    // A state whose live call threw carries errors and no evidence. That is the shape a
    // credential-less run takes while still reporting gate binding, so it is never a pass.
    const errors = Array.isArray(r.errors) ? r.errors : [];
    if (errors.length > 0 || r.evidence !== 'vision') {
      failures.push(`${id}: not judged by the live model: ${errors.length > 0 ? errors[0] : `evidence=${r.evidence}`}`);
      continue;
    }

    const expect = s.expect || 'pass';
    const fails = Array.isArray(rollup.fails) ? rollup.fails : [];
    if (expect === 'pass') {
      if (fails.includes(id)) {
        failures.push(`${id}: judged broken with a HIGH defect but expected to pass${describeDefect(r)}`);
      } else if (r.known_broken === true) {
        // HIGH-only blocking: a broken majority with only medium/low defects passes by policy,
        // never anonymously.
        warnings.push(`${id}: judged broken below HIGH (${r.max_severity}); passes by policy${describeDefect(r)}`);
      } else if (r.verdict === 'review' && r.flake === true) {
        const v = r.votes || { broken: 0, ok: 0 };
        warnings.push(`${id}: the samples split (${v.broken}/${v.broken + v.ok} broken); within the flake budget`);
      }
    } else if (r.is_broken !== true) {
      // expect fail: the fixture carries an injected defect. A majority that did not call it
      // broken means the model did not see what any reviewer would, so the run proves nothing.
      const v = r.votes || { broken: 0, ok: 0 };
      failures.push(
        `${id}: the judge missed the known defect (is_broken=${r.is_broken}, ` +
        `${v.broken}/${v.broken + v.ok} samples called it broken)`);
    }
  }

  const unjudged = Array.isArray(rollup.unjudged) ? rollup.unjudged : [];
  if (unjudged.length > 0) {
    failures.push(`unjudged states: ${unjudged.join(', ')} (nothing examined them)`);
  }

  // Six vision calls cost tokens. A run that spent none did not call the model.
  const inputTokens = rollup.usage && rollup.usage.input_tokens;
  if (!(typeof inputTokens === 'number' && inputTokens > 0)) {
    failures.push(`no tokens were spent (usage.input_tokens=${inputTokens}): the live model was not called`);
  }

  // Backstop: never be greener than the engine. Reviews over the flake budget fail the run
  // without naming any single state above.
  if (rollup.verdict === 'fail' && failures.length === 0) {
    const list = (a) => (Array.isArray(a) && a.length > 0 ? a.join(', ') : 'none');
    failures.push(`the judge's own verdict is fail (fails: ${list(rollup.fails)}; reviews: ${list(rollup.reviews)})`);
  }

  return { ok: failures.length === 0, failures, warnings };
}

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };

/** The most severe defect of a state, or null. */
function worstDefect(defects) {
  let worst = null;
  for (const d of Array.isArray(defects) ? defects : []) {
    if (!d) continue;
    if (!worst || (SEVERITY_RANK[d.severity] || 0) > (SEVERITY_RANK[worst.severity] || 0)) worst = d;
  }
  return worst;
}

/** " (<severity> <type>: <rationale>)" for a state's worst defect, or "". */
function describeDefect(r) {
  const d = worstDefect(r && r.defects);
  if (!d) return '';
  return ` (${d.severity} ${d.type}${d.rationale ? `: ${d.rationale}` : ''})`;
}

/** PURE: the human-readable result, one header, one line per state, tokens, findings, verdict. */
function renderSummary(rollup, result, manifest) {
  const expectById = new Map();
  for (const s of (manifest && Array.isArray(manifest.states)) ? manifest.states : []) {
    expectById.set(s.state_id, s.expect || 'pass');
  }
  const lines = [];
  lines.push(`live visual judge: gate=${rollup.gate} judge=${rollup.judge} model=${rollup.model} samples=${rollup.samples}`);
  for (const s of Array.isArray(rollup.states) ? rollup.states : []) {
    const votes = s.votes ? `${s.votes.broken}/${s.votes.broken + s.votes.ok}` : '-';
    const worst = worstDefect(s.defects);
    const defect = worst ? ` (${worst.severity} ${worst.type})` : '';
    lines.push(
      `${s.state_id} expect=${expectById.get(s.state_id) || 'pass'} verdict=${s.verdict} ` +
      `is_broken=${s.is_broken} votes=${votes} evidence=${s.evidence || 'none'}${defect}`);
  }
  const usage = rollup.usage || {};
  lines.push(`tokens: input=${usage.input_tokens} output=${usage.output_tokens}`);
  for (const w of result.warnings) lines.push(`WARN ${w}`);
  for (const f of result.failures) lines.push(`FAIL ${f}`);
  lines.push(result.ok
    ? 'PASS: the live model judged every state and agreed with its labels'
    : `FAIL: ${result.failures.length} problem(s); the live visual judge did not pass`);
  return lines.join('\n') + '\n';
}

const MAX_PRINTED = 1000;

/** Replace every occurrence of each secret value with ***. */
function redact(text, secrets) {
  let s = String(text);
  for (const v of secrets) s = s.split(v).join('***');
  return s;
}

/** Cut a string to `max` characters, saying how much went. */
function cut(text, max = MAX_PRINTED) {
  const s = String(text);
  return s.length > max ? `${s.slice(0, max)}... (${s.length - max} characters cut)` : s;
}

/**
 * Every string in the rollup, redacted and then cut (in that order, so a cut never leaves part
 * of a secret behind). A failed curl inside the engine reaches the rollup as Node's
 * "Command failed: curl ... -H x-api-key: <key> -d <base64 image>" message, which this removes
 * before anything is printed or asserted on.
 */
function scrub(value, secrets) {
  if (typeof value === 'string') return cut(redact(value, secrets));
  if (Array.isArray(value)) return value.map((v) => scrub(v, secrets));
  if (value && typeof value === 'object') {
    const outObj = {};
    for (const [k, v] of Object.entries(value)) outObj[k] = scrub(v, secrets);
    return outObj;
  }
  return value;
}

/**
 * The rollup out of the judge's spawn result. The CLI exits 1 on `verdict: fail` with the rollup
 * still on stdout, so the exit status is ignored; a spawn error, empty stdout or anything that
 * is not a JSON object is a failure. Output above 50 KB arrives as `@file:<path>`.
 */
function readRollup(child, readFile) {
  if (!child) return { error: 'the judge was not started' };
  if (child.error) return { error: `the judge could not run: ${child.error.message}` };
  let text = String(child.stdout || '').trim();
  if (!text) return { error: `the judge printed nothing (exit status ${child.status})` };
  if (text.startsWith('@file:')) {
    try {
      text = String(readFile(text.slice('@file:'.length).trim(), 'utf-8'));
    } catch (e) {
      return { error: `could not read ${text}: ${e.message}` };
    }
  }
  let rollup;
  try {
    rollup = JSON.parse(text);
  } catch (e) {
    return { error: `not JSON (${e.message}); exit status ${child.status}` };
  }
  if (rollup === null || typeof rollup !== 'object' || Array.isArray(rollup)) {
    return { error: 'the output is JSON but not a rollup object' };
  }
  return { rollup };
}

function main(argv = process.argv.slice(2), deps = {}) {
  const env = deps.env || process.env;
  const spawn = deps.spawn || spawnSync;
  const readFile = deps.readFile || fs.readFileSync;
  // Presence is all this script ever reads of a credential. The values are kept only to be
  // redacted out of everything it prints.
  const secrets = [env.ANTHROPIC_API_KEY, env.ANTHROPIC_AUTH_TOKEN].filter((v) => typeof v === 'string' && v.length > 0);
  const rawOut = deps.out || ((s) => process.stdout.write(s));
  const rawErr = deps.err || ((s) => process.stderr.write(s));
  const out = (s) => rawOut(redact(s, secrets));
  const err = (s) => rawErr(redact(s, secrets));

  const manifestArg = (argv || []).find((a) => a && !a.startsWith('-'));
  if (!manifestArg) {
    err('usage: node scripts/ci-visual-judge.cjs <manifest>\n');
    return 1;
  }
  const manifestPath = path.resolve(manifestArg);

  const hasCredential = Boolean(env.ANTHROPIC_API_KEY) || Boolean(env.ANTHROPIC_AUTH_TOKEN);
  if (!hasCredential) {
    err(NO_CREDENTIAL + '\n');
    return 1;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFile(manifestPath, 'utf-8'));
  } catch (e) {
    err(`could not read the manifest ${manifestPath}: ${e.message}\n`);
    return 1;
  }

  const child = spawn(
    process.execPath,
    [AOF_TOOLS, 'verify', 'flutter-ui-eval', manifestPath, '--judge', 'live', '--raw'],
    { encoding: 'utf-8', env, maxBuffer: 64 * 1024 * 1024 });

  const parsed = readRollup(child, readFile);
  if (parsed.error) {
    err(`could not parse the judge's output: ${parsed.error}\n`);
    const childErr = redact(String((child && child.stderr) || ''), secrets).trim();
    if (childErr) err(`judge stderr (last 2000 characters):\n${childErr.slice(-2000)}\n`);
    return 1;
  }
  const rollup = scrub(parsed.rollup, secrets);
  const result = assertLiveRollup(rollup, manifest);
  out('::group::rollup\n' + JSON.stringify(rollup, null, 2) + '\n::endgroup::\n');
  out(renderSummary(rollup, result, manifest));
  return result.ok ? 0 : 1;
}

module.exports = { AOF_TOOLS, assertLiveRollup, renderSummary, main };

if (require.main === module) {
  process.exitCode = main();
}
