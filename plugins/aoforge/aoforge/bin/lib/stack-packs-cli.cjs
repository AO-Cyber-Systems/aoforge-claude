'use strict';

// `aof-tools stack discover | doctor | verify --changed|--all` — the CLI half of the stack pack
// contract (objective 77; docs/PROPOSAL-stack-packs.md §5A.2-5A.4). lib/stack-packs.cjs owns
// discovery and selection; this module runs the packs' own commands and merges their results.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { output, error } = require('./helpers.cjs');
const { validate: schemaValidate } = require('./json-schema-lite.cjs');
const packs = require('./stack-packs.cjs');

const VERIFY_SCHEMA = path.join(__dirname, '..', '..', 'schemas', 'verify-result.schema.json');
// Worst first. `missing` never counts as `pass`: a pack that is expected but cannot run blocks.
const STATUS_RANK = Object.freeze({ error: 3, missing: 2, fail: 1, pass: 0 });

function resolveFor(projectRoot, userHome) {
  try {
    return require('./stack-profile.cjs').resolveProfile({ projectRoot, userHome });
  } catch {
    return null;
  }
}

function summarizePack(p) {
  return {
    name: p.name,
    plugin: p.plugin,
    enabled: p.enabled,
    root: p.root,
    profiles: Object.keys(p.profiles),
    fragments: Object.keys((p.manifest && p.manifest.fragments) || {}),
    issues: p.issues,
  };
}

function discover(projectRoot, { userHome }) {
  const resolved = resolveFor(projectRoot, userHome);
  const installed = packs.discoverPacks({ userHome });
  const active = packs.activePacks({ projectRoot, userHome, resolved });
  const proposed = packs.proposedPacks({ projectRoot, userHome, active });
  return {
    stacks_dir: packs.stacksDir(userHome),
    installed: installed.map(summarizePack),
    active: active.map((p) => ({ name: p.name, plugin: p.plugin, reason: p.reason })),
    proposed,
  };
}

function discoverText(r) {
  const lines = [];
  if (!r.installed.length) lines.push(`No stack packs mirrored under ${r.stacks_dir}.`);
  for (const p of r.installed) {
    const state = p.issues.length ? `broken: ${p.issues.join('; ')}` : (p.enabled ? 'enabled' : 'plugin not enabled');
    lines.push(`${p.name} (${p.plugin}): ${state}; profiles ${p.profiles.join(', ') || 'none'}`);
  }
  for (const a of r.active) lines.push(`active: ${a.name} (${a.reason})`);
  for (const p of r.proposed) {
    const how = p.enabled
      ? `set \`extends: <profile>\` in STACK.md or add "${p.name}" to config.json stacks.enabled`
      : `install and enable the ${p.plugin} plugin`;
    lines.push(`proposed: ${p.name} (found ${p.evidence.join(', ')}); ${how}`);
  }
  return lines.join('\n');
}

function onPath(tool) {
  const r = spawnSync('sh', ['-c', `command -v ${JSON.stringify(tool).slice(1, -1)}`], { encoding: 'utf8' });
  return r.status === 0;
}

function runArgv(argv, { cwd, timeoutMs = 600000 }) {
  const r = spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
  return r;
}

/** What a selected-but-unavailable reason means, for verify summaries and doctor text (quick 35). */
const UNAVAILABLE_TEXT = Object.freeze({
  not_installed: 'it has no mirror: its plugin is not installed',
  plugin_not_enabled: 'its plugin is not enabled',
  broken: 'its manifest is broken',
});

function doctor(projectRoot, { userHome }) {
  const resolved = resolveFor(projectRoot, userHome);
  const active = packs.activePacks({ projectRoot, userHome, resolved });
  const results = active.map((p) => {
    const m = p.manifest || {};
    const tools = Object.keys(m.requires_tool || {}).map((t) => ({ tool: t, found: onPath(t) }));
    let command = null;
    if (m.doctor && m.doctor.command) {
      const r = runArgv(m.doctor.command.map((a) => a.replace('${PACK_ROOT}', p.root)), { cwd: projectRoot });
      command = { status: r.status, stdout: (r.stdout || '').slice(0, 4000), error: r.error ? r.error.message : null };
    }
    const ok = tools.every((t) => t.found) && (!command || command.status === 0);
    return { pack: p.name, ok, tools, command, install_hint: ok ? null : m.install_hint || null };
  });
  // A pack the project selects but that cannot run is never "no active stack packs" (quick 35).
  for (const u of packs.unavailableSelectedPacks({ projectRoot, userHome, active })) {
    results.push({ pack: u.name, ok: false, reason: u.reason, issues: u.issues, tools: [], command: null, install_hint: u.install_hint });
  }
  return { ok: results.every((r) => r.ok), packs: results };
}

function mergeStatus(statuses) {
  if (!statuses.length) return 'pass';
  return statuses.reduce((worst, s) => (STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst), 'pass');
}

/**
 * verifyPacks(projectRoot, { scope, userHome }) -> merged result
 * Runs every active pack's registered verify command. A pack with no verify command adds nothing.
 * A binary that cannot start is `missing` (with the pack's install hint); unparseable output is
 * `error`. Neither ever reads as `pass`.
 */
function verifyPacks(projectRoot, { scope = 'changed', userHome } = {}) {
  const schema = JSON.parse(fs.readFileSync(VERIFY_SCHEMA, 'utf8'));
  const resolved = resolveFor(projectRoot, userHome);
  const active = packs.activePacks({ projectRoot, userHome, resolved });
  const results = [];
  for (const p of active) {
    const v = p.manifest && p.manifest.verify;
    if (!v || !v.command) continue;
    const flag = scope === 'all' ? v.all_flag : v.changed_flag;
    const argv = v.command.map((a) => a.replace('${PACK_ROOT}', p.root)).concat(flag ? [flag] : []);
    const r = runArgv(argv, { cwd: projectRoot });
    let result;
    if (r.error && r.error.code === 'ENOENT') {
      result = { status: 'missing', summary: `${argv[0]} is not installed`, install_hint: p.manifest.install_hint || undefined };
    } else {
      try {
        result = JSON.parse(r.stdout);
        const issues = schemaValidate(result, schema);
        if (issues.length) result = { status: 'error', summary: `invalid verify result: ${issues[0].path}: ${issues[0].msg}` };
      } catch {
        result = { status: 'error', summary: `verify printed no JSON (exit ${r.status})` };
      }
    }
    results.push({ pack: p.name, ...result });
  }
  // A pack selected in config stacks.enabled that cannot run blocks: missing, or error for a broken manifest (quick 35).
  const unavailable = packs.unavailableSelectedPacks({ projectRoot, userHome, active });
  for (const u of unavailable) {
    results.push({
      pack: u.name,
      status: u.reason === 'broken' ? 'error' : 'missing',
      summary: `selected in config stacks.enabled but ${UNAVAILABLE_TEXT[u.reason]}`,
      install_hint: u.install_hint,
    });
  }
  return {
    status: mergeStatus(results.map((r) => r.status)),
    scope,
    packs: results,
    active: active.map((p) => p.name),
    unavailable: unavailable.map((u) => u.name),
  };
}

function writeVerifyRecord(projectRoot, taskId, merged) {
  const { planningRoot } = require('./compat.cjs');
  const dir = path.join(planningRoot(projectRoot), 'verify');
  const file = path.join(dir, `${taskId}.json`);
  // Defense in depth behind the --task validation (quick 35): a record is a direct child of the verify dir.
  if (path.dirname(path.resolve(file)) !== path.resolve(dir)) {
    throw new Error(`refusing to write a verify record outside ${dir}: ${file}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(merged, null, 2) + '\n');
  return file;
}

// A --task id names <planning dir>/verify/<id>.json, so it carries no path separator and no `..` (quick 35, D4).
const TASK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** The --task value, or null when the flag is absent; exits 1 on a missing, flag-like or path-like value. */
function taskIdArg(args) {
  const i = args.indexOf('--task');
  if (i === -1) return null;
  const v = args[i + 1];
  if (v === undefined || v.startsWith('-') || !TASK_ID_RE.test(v) || v.includes('..')) {
    error(`stack verify --task needs a task id (letters, digits, ".", "_", "-"; no path separators or ".."); got "${v === undefined ? '' : v}"`);
  }
  return v;
}

function discoverCli(cwd, args, raw, { userHome }) {
  const unknown = args.filter((a) => a.startsWith('--') && a !== '--raw');
  if (unknown.length) return error(`stack discover takes no flags (got ${unknown.join(' ')})`);
  const r = discover(cwd, { userHome });
  output(r, raw, discoverText(r));
}

function doctorCli(cwd, args, raw, { userHome }) {
  const unknown = args.filter((a) => a.startsWith('--') && a !== '--raw');
  if (unknown.length) return error(`stack doctor takes no flags (got ${unknown.join(' ')})`);
  const r = doctor(cwd, { userHome });
  const line = (p) => {
    if (p.ok) return `${p.pack}: ok`;
    const why = p.reason ? `: selected in config stacks.enabled but ${UNAVAILABLE_TEXT[p.reason] || p.reason}` : '';
    return `${p.pack}: not ready${why}${p.install_hint ? ` (${p.install_hint})` : ''}`;
  };
  const text = r.packs.length ? r.packs.map(line).join('\n') : 'No active stack packs.';
  output(r, raw, text, r.ok ? 0 : 1);
}

/** `stack verify --changed|--all [--task <id>]`: the pack gate. Exit 0 pass, 1 fail, 2 missing/error. */
function verifyPacksCli(cwd, args, raw, { userHome }) {
  const scope = args.includes('--all') ? 'all' : 'changed';
  // Validated before any pack command runs or any file is written.
  const task = taskIdArg(args);
  const merged = verifyPacks(cwd, { scope, userHome });
  if (task) merged.record = writeVerifyRecord(cwd, task, merged);
  const text = merged.packs.length
    ? `${merged.status}: ${merged.packs.map((p) => `${p.pack} ${p.status}${p.summary ? ` (${p.summary})` : ''}`).join('; ')}`
    : 'pass: no active pack registers a verify command';
  const code = merged.status === 'pass' ? 0 : merged.status === 'fail' ? 1 : 2;
  output(merged, raw, text, code);
}

module.exports = {
  STATUS_RANK,
  discover,
  doctor,
  mergeStatus,
  verifyPacks,
  discoverCli,
  doctorCli,
  verifyPacksCli,
};
