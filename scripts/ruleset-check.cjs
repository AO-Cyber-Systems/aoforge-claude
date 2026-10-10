#!/usr/bin/env node
'use strict';

/**
 * ruleset-check — prove the `main` ruleset on GitHub is the text that was approved (TRD 74-03, OPS-02).
 *
 *   node scripts/ruleset-check.cjs compare --repo O/R --file .github/rulesets/main.json [--raw]
 *       Reads the ruleset applied to O/R back by name and exits 0 only when it matches the file.
 *       Server metadata and server-added defaults are reported, not counted as differences.
 *
 *   node scripts/ruleset-check.cjs checks --repo O/R --file .github/rulesets/main.json --prs 126,127,128 [--raw]
 *       Exits 0 only when every status check the file requires was reported, by the app it is pinned to, on
 *       every listed pull request. A required check that never reports on a pull request hangs its merge.
 *
 * Exit codes: 0 ok, 1 a mismatch or missing check, 2 a usage or gh error.
 * Read-only: every gh call is checked by assertReadOnly first, so the tool cannot change a setting.
 */

const fs = require('fs');
const { spawnSync } = require('child_process');

/** A stable string for any JSON value: object keys sorted, arrays kept in order. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const ruleMap = (rules) => new Map((rules || []).map((r) => [r.type, r]));

/** How one element of a list-valued field is named in a set comparison. */
function elementKey(path, item) {
  if (path.endsWith('.required_status_checks') && item && typeof item === 'object') {
    return `${item.context}@${item.integration_id}`;
  }
  return typeof item === 'string' ? item : canonical(item);
}

/**
 * Compare two lists as sets. Every element on only one side becomes a difference, named by its key
 * (approved side: the key where the file has it and the reply lacks it; applied side the other way round).
 */
function compareSets(path, want, have, differ) {
  const wantKeys = new Set((want || []).map((item) => elementKey(path, item)));
  const haveKeys = new Set((have || []).map((item) => elementKey(path, item)));
  for (const k of wantKeys) if (!haveKeys.has(k)) differ(path, k, null);
  for (const k of haveKeys) if (!wantKeys.has(k)) differ(path, null, k);
}

/**
 * Compare an applied ruleset (as GitHub returns it) with the approved file.
 * Returns { match, differences: [{ path, approved, applied }], serverDefaults: [path] }.
 *
 * Lists are sets: order never matters. Fields the server owns (id, node_id, source, _links, timestamps,
 * current_user_can_bypass) are never read. A parameter the reply carries and the file does not is a
 * server default: listed, not counted.
 */
function compareRuleset(applied, approved) {
  const differences = [];
  const serverDefaults = [];
  const differ = (path, a, b) => differences.push({ path, approved: a, applied: b });

  for (const field of ['name', 'target', 'enforcement']) {
    if (applied[field] !== approved[field]) differ(field, approved[field], applied[field]);
  }

  const refName = (ruleset) => (ruleset.conditions && ruleset.conditions.ref_name) || {};
  for (const list of ['include', 'exclude']) {
    compareSets(`conditions.ref_name.${list}`, refName(approved)[list], refName(applied)[list], differ);
  }

  // A bypass actor is its role or team and the mode it bypasses in; the mode is what is compared.
  const actors = (ruleset) => new Map((ruleset.bypass_actors || []).map((a) => [`${a.actor_type}:${a.actor_id}`, a.bypass_mode]));
  const wantActors = actors(approved);
  const haveActors = actors(applied);
  for (const [id, mode] of wantActors) {
    if (!haveActors.has(id)) differ(`bypass_actors[${id}]`, mode, null);
    else if (haveActors.get(id) !== mode) differ(`bypass_actors[${id}].bypass_mode`, mode, haveActors.get(id));
  }
  for (const [id, mode] of haveActors) {
    if (!wantActors.has(id)) differ(`bypass_actors[${id}]`, null, mode);
  }

  const approvedRules = ruleMap(approved.rules);
  const appliedRules = ruleMap(applied.rules);
  for (const [type, rule] of approvedRules) {
    const other = appliedRules.get(type);
    if (!other) {
      differ(`rules.${type}`, 'present', 'absent');
      continue;
    }
    const want = rule.parameters || {};
    const have = other.parameters || {};
    for (const key of Object.keys(want)) {
      const path = `rules.${type}.parameters.${key}`;
      if (Array.isArray(want[key]) && Array.isArray(have[key])) compareSets(path, want[key], have[key], differ);
      else if (canonical(want[key]) !== canonical(have[key])) differ(path, want[key], have[key]);
    }
    for (const key of Object.keys(have)) {
      if (!(key in want)) serverDefaults.push(`rules.${type}.parameters.${key}`);
    }
  }
  for (const type of appliedRules.keys()) {
    if (!approvedRules.has(type)) differ(`rules.${type}`, 'absent', 'present');
  }

  return { match: differences.length === 0, differences, serverDefaults };
}

/** The status checks a ruleset requires: [{ context, integration_id? }]. */
function requiredChecks(ruleset) {
  const rule = (ruleset.rules || []).find((r) => r.type === 'required_status_checks');
  return (rule && rule.parameters && rule.parameters.required_status_checks) || [];
}

/**
 * How one required check fared on one pull request. `runs` is [{ name, appId }].
 * A check is satisfied when a run carries its name and, if the ruleset pins an app, that app's id.
 */
function judgeCheck(required, runs) {
  const named = runs.filter((r) => r.name === required.context);
  const pinned = required.integration_id;
  const apps = [...new Set(named.map((r) => r.appId))];
  if (named.length === 0) return { ok: false, apps, reason: 'not reported' };
  if (pinned === undefined || pinned === null || apps.includes(pinned)) return { ok: true, apps, reason: 'reported' };
  return { ok: false, apps, reason: `reported by app ${apps.join(', ')}` };
}

/**
 * Every (pull request, required context) pair the ruleset requires and the runs do not satisfy.
 * prChecks: [{ pr, runs: [{ name, appId }] }]. Returns [{ pr, context, pinned, reason }].
 */
function missingContexts(ruleset, prChecks) {
  const missing = [];
  for (const { pr, runs } of prChecks) {
    for (const required of requiredChecks(ruleset)) {
      const verdict = judgeCheck(required, runs);
      if (!verdict.ok) {
        missing.push({ pr, context: required.context, pinned: required.integration_id, reason: verdict.reason });
      }
    }
  }
  return missing;
}

/**
 * Split text holding several JSON values back to back (what `gh api --paginate` prints, one object per page).
 */
function parseJsonStream(text) {
  const values = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        values.push(JSON.parse(text.slice(start, i + 1)));
        start = -1;
      }
    }
  }
  if (depth !== 0 || inString) throw new Error('truncated JSON in gh output');
  return values;
}

/**
 * Throw unless `args` (the argv of one gh call) can only read. This tool never changes a setting on GitHub:
 * `gh api` must be a GET without fields or a request body, and `gh pr` only views or lists.
 */
function assertReadOnly(args) {
  const refuse = (why) => {
    throw new Error(`read-only: refusing gh ${args.join(' ')} (${why})`);
  };
  if (args[0] === 'pr') {
    if (args[1] !== 'view' && args[1] !== 'list') refuse(`gh pr ${args[1] || ''}`.trim());
    return;
  }
  if (args[0] !== 'api') refuse(`gh ${args[0] || ''}`.trim());
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '-X' || a === '--method') {
      if (String(args[i + 1]).toUpperCase() !== 'GET') refuse(`${a} ${args[i + 1]}`);
    } else if (/^(-X|--method=)/.test(a)) {
      if (a.replace(/^(-X|--method=)/, '').toUpperCase() !== 'GET') refuse(a);
    } else if (['-f', '-F', '--field', '--raw-field', '--input'].includes(a) || /^--(field|raw-field|input)=/.test(a)) {
      refuse(`${a} sends a request body`);
    }
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function defaultGh(args) {
  const r = spawnSync('gh', args, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status === null ? 1 : r.status, stdout: r.stdout || '', stderr: r.stderr || (r.error ? r.error.message : '') };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = { command, raw: false };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === '--raw') opts.raw = true;
    else if (flag === '--repo' || flag === '--file' || flag === '--prs') opts[flag.slice(2)] = rest[++i];
    else throw new Error(`unknown argument: ${flag}`);
  }
  return opts;
}

function readJson(gh, args) {
  const r = gh(args);
  if (r.status !== 0) throw new Error(`gh ${args.join(' ')} failed (exit ${r.status}): ${(r.stderr || '').trim()}`);
  return JSON.parse(r.stdout);
}

function compareCommand(opts, deps) {
  const { gh, readFile, out, err } = deps;
  const approved = JSON.parse(readFile(opts.file));
  const summaries = readJson(gh, ['api', `repos/${opts.repo}/rulesets`]);
  const found = summaries.find((s) => s.name === approved.name && s.source_type === 'Repository');
  if (!found) {
    err(`no ruleset named '${approved.name}' on ${opts.repo}`);
    return 1;
  }
  const applied = readJson(gh, ['api', `repos/${opts.repo}/rulesets/${found.id}`]);
  const result = compareRuleset(applied, approved);
  if (opts.raw) {
    out(JSON.stringify({ id: found.id, ...result }, null, 2));
  } else if (result.match) {
    out(`ruleset '${approved.name}' (id ${found.id}) matches ${opts.file}`);
    if (result.serverDefaults.length) {
      out(`server defaults, not counted: ${result.serverDefaults.join(', ')}`);
    }
  } else {
    out(`ruleset '${approved.name}' (id ${found.id}) does NOT match ${opts.file}`);
    for (const d of result.differences) {
      out(`  - ${d.path}: approved ${canonical(d.approved)}, applied ${canonical(d.applied)}`);
    }
  }
  return result.match ? 0 : 1;
}

function parsePrNumbers(text) {
  const numbers = String(text || '').split(',').map((n) => n.trim());
  if (!numbers.length || !numbers.every((n) => /^[1-9][0-9]*$/.test(n))) {
    throw new Error('--prs takes pull request numbers, comma separated (for example 126,127,128)');
  }
  return numbers.map(Number);
}

/** What a missing context looks like in the report. */
function describeMissing(m) {
  return m.reason === 'not reported' ? 'not reported' : `pinned to ${m.pinned}, ${m.reason.replace(' app ', ' ')}`;
}

/** Sample one pull request: its head commit and the check runs reported on it, [{ name, appId }]. */
function samplePullRequest(gh, repo, pr) {
  const view = gh(['pr', 'view', String(pr), '--repo', repo, '--json', 'headRefOid', '--jq', '.headRefOid']);
  if (view.status !== 0) throw new Error(`gh pr view ${pr} failed (exit ${view.status}): ${(view.stderr || '').trim()}`);
  const head = view.stdout.trim();
  const api = gh(['api', `repos/${repo}/commits/${head}/check-runs`, '--paginate']);
  if (api.status !== 0) throw new Error(`gh api check-runs for #${pr} failed (exit ${api.status}): ${(api.stderr || '').trim()}`);
  const runs = parseJsonStream(api.stdout)
    .flatMap((page) => page.check_runs || [])
    .map((run) => ({ name: run.name, appId: run.app && run.app.id }));
  return { pr, head, runs };
}

function checksCommand(opts, deps) {
  const { gh, readFile, out } = deps;
  const approved = JSON.parse(readFile(opts.file));
  const required = requiredChecks(approved);
  const prChecks = parsePrNumbers(opts.prs).map((pr) => samplePullRequest(gh, opts.repo, pr));

  const missing = missingContexts(approved, prChecks);
  if (opts.raw) {
    out(JSON.stringify({ missing }, null, 2));
  } else {
    for (const { pr, head, runs } of prChecks) {
      for (const req of required) {
        const verdict = judgeCheck(req, runs);
        const detail = verdict.ok
          ? `reported by app ${verdict.apps.join(', ')}`
          : describeMissing({ reason: verdict.reason, pinned: req.integration_id });
        out(`#${pr}  ${head.slice(0, 7)}  ${verdict.ok ? 'ok     ' : 'MISSING'}  ${req.context}  (${detail})`);
      }
    }
    out(missing.length
      ? `${missing.length} required check(s) missing across ${prChecks.length} pull request(s)`
      : `every required check reported on ${prChecks.length} pull request(s)`);
  }
  return missing.length ? 1 : 0;
}

/**
 * Run the CLI. Returns the exit code; the caller sets process.exitCode, so tests never touch the real one.
 * deps: { gh(args) -> { status, stdout, stderr }, readFile(path) -> string, out(line), err(line) }.
 */
function main(argv, deps = {}) {
  const runner = deps.gh || defaultGh;
  const d = {
    // Every call goes through assertReadOnly: this tool must not be able to change a setting on GitHub.
    gh: (args) => {
      assertReadOnly(args);
      return runner(args);
    },
    readFile: deps.readFile || ((p) => fs.readFileSync(p, 'utf8')),
    out: deps.out || ((s) => console.log(s)),
    err: deps.err || ((s) => console.error(s)),
  };
  try {
    const opts = parseArgs(argv);
    if (opts.command !== 'compare' && opts.command !== 'checks') {
      throw new Error(`unknown command: ${opts.command || '(none)'} (compare | checks)`);
    }
    if (!opts.repo || !REPO_PATTERN.test(opts.repo)) throw new Error('--repo O/R is required');
    if (!opts.file) throw new Error('--file is required');
    return opts.command === 'compare' ? compareCommand(opts, d) : checksCommand(opts, d);
  } catch (e) {
    d.err(`[ruleset-check] ${e.message}`);
    return 2;
  }
}

module.exports = { compareRuleset, missingContexts, assertReadOnly, parseJsonStream, main };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
