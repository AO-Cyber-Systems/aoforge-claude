#!/usr/bin/env node
'use strict';

/**
 * ruleset-check — prove the `main` ruleset on GitHub is the text that was approved (TRD 74-03, OPS-02).
 *
 *   node scripts/ruleset-check.cjs compare --repo O/R --file .github/rulesets/main.json [--raw]
 *       Reads the ruleset applied to O/R back by name and exits 0 only when it matches the file.
 *       Server metadata and server-added defaults are reported, not counted as differences.
 *
 * Read-only: the only GitHub calls are GETs.
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

/**
 * Compare an applied ruleset (as GitHub returns it) with the approved file.
 * Returns { match, differences: [{ path, approved, applied }], serverDefaults: [path] }.
 */
function compareRuleset(applied, approved) {
  const differences = [];
  const serverDefaults = [];
  const differ = (path, a, b) => differences.push({ path, approved: a, applied: b });

  for (const field of ['name', 'target', 'enforcement']) {
    if (applied[field] !== approved[field]) differ(field, approved[field], applied[field]);
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
      if (canonical(want[key]) !== canonical(have[key])) {
        differ(`rules.${type}.parameters.${key}`, want[key], have[key]);
      }
    }
    for (const key of Object.keys(have)) {
      if (!(key in want)) serverDefaults.push(`rules.${type}.parameters.${key}`);
    }
  }

  return { match: differences.length === 0, differences, serverDefaults };
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
    else if (flag === '--repo' || flag === '--file') opts[flag.slice(2)] = rest[++i];
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

/**
 * Run the CLI. Returns the exit code; the caller sets process.exitCode, so tests never touch the real one.
 * deps: { gh(args) -> { status, stdout, stderr }, readFile(path) -> string, out(line), err(line) }.
 */
function main(argv, deps = {}) {
  const d = {
    gh: deps.gh || defaultGh,
    readFile: deps.readFile || ((p) => fs.readFileSync(p, 'utf8')),
    out: deps.out || ((s) => console.log(s)),
    err: deps.err || ((s) => console.error(s)),
  };
  try {
    const opts = parseArgs(argv);
    if (opts.command !== 'compare') throw new Error(`unknown command: ${opts.command || '(none)'}`);
    if (!opts.repo || !REPO_PATTERN.test(opts.repo)) throw new Error('--repo O/R is required');
    if (!opts.file) throw new Error('--file is required');
    return compareCommand(opts, d);
  } catch (e) {
    d.err(`[ruleset-check] ${e.message}`);
    return 2;
  }
}

module.exports = { compareRuleset, main };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
