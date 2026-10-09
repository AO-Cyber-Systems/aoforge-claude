'use strict';

// stack-mcp.cjs — `aof-tools stack mcp [--write]` (objective 42, TRD 09, SDR-05).
//
// Derives the AOForge-managed `.mcp.json` servers from the resolved stack profile's
// `agent_tooling.mcp` (the root view plus each component's view, deduped by name) and, only under
// `--write`, merges them into `<cwd>/.mcp.json`.
//
// Locked decisions:
//   Q4 — `.mcp.json` is opt-in per repo. This command is the ONLY writer: no upgrade migration and
//        no `stack init` flag writes it (the SessionStart upgrade hook auto-applies migrations and
//        background-commits them, so a migration would write `.mcp.json` fleet-wide).
//   Q5 — no telemetry env claims. A managed entry's env is exactly the ownership marker
//        `{ AOFORGE_MANAGED: 'stack' }`; any `env` a profile entry carries is ignored.
//
// Ownership: an entry is AOForge's iff `env.AOFORGE_MANAGED === 'stack'`, or, for one release
// (objective 72, INST-03; removed in SHIM_REMOVAL), the legacy prefix's `..._MANAGED === 'stack'` that
// earlier versions wrote. Only those are ever replaced or removed: a rewritten entry carries the
// AOForge key alone, so the legacy key is dropped. Every other entry is carried over untouched, in its
// original position.
//
// Deterministic and offline: no MCP server is started or called here. Confirming a draft through
// the gopls/dart MCP tools is agent-side workflow text (`confirm_stack_profile`).

const nodeFs = require('fs');
const os = require('os');
const path = require('path');

const { resolveBinary } = require('./stack-verify.cjs');
const { NAMES, LEGACY } = require('./legacy-names.cjs');

const MANAGED_VALUE = 'stack';
// The key a managed entry is written with, and every key that marks an entry as owned (the legacy
// one read for one release only).
const MANAGED_KEY = `${NAMES.envPrefix}MANAGED`;
const OWNED_KEYS = Object.freeze([MANAGED_KEY, `${LEGACY.envPrefix}MANAGED`]);
const MCP_FILE = '.mcp.json';
// The probe file a component view is resolved at (the same idiom stack-verify uses): any path
// under the component prefix selects the component's layer.
const PROBE_FILE = '__probe__';
// `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>` and
// `~/.claude/plugins/marketplaces/<marketplace>/plugins/<plugin>` sit at depth 4; 5 leaves margin.
const PLUGIN_SCAN_DEPTH = 5;
const SKIP_DIRS = new Set(['node_modules', '.git']);

/** True when a `.mcp.json` server entry is owned by `stack mcp` (under the AOForge key or the legacy one). */
function isManaged(entry) {
  return Boolean(entry && typeof entry === 'object' && entry.env && typeof entry.env === 'object'
    && OWNED_KEYS.some((key) => entry.env[key] === MANAGED_VALUE));
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ─── Plugin scan ──────────────────────────────────────────────────────────────

function readJson(fs, file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (_) {
    return null;
  }
}

/** `{ mcpServers: {...} }` or a bare `{ name: server }` map -> the server map (or null). */
function serverMapOf(doc) {
  if (!isPlainObject(doc)) return null;
  if (isPlainObject(doc.mcpServers)) return doc.mcpServers;
  return doc;
}

function pushServers(out, map, file) {
  if (!isPlainObject(map)) return;
  for (const [name, entry] of Object.entries(map)) {
    if (!isPlainObject(entry) || typeof entry.command !== 'string') continue;
    out.push({ name, command: entry.command, args: Array.isArray(entry.args) ? entry.args.map(String) : [], file });
  }
}

/**
 * findPluginServers(userHome, { fs, maxDepth }) -> [{ name, command, args, file }]
 *
 * Every MCP server a Claude plugin under `<userHome>/.claude/plugins` declares: the `mcpServers`
 * object in `.claude-plugin/plugin.json`, a `mcpServers` string naming a JSON file relative to the
 * plugin root, and a `.mcp.json` at the plugin root. Directories are walked to `maxDepth` below
 * the plugins dir; symlinks, `node_modules` and `.git` are not followed. Unreadable or malformed
 * files are ignored — the scan only ever narrows what gets written.
 */
function findPluginServers(userHome, { fs = nodeFs, maxDepth = PLUGIN_SCAN_DEPTH } = {}) {
  if (!userHome) return [];
  const root = path.join(String(userHome), '.claude', 'plugins');
  const out = [];

  const visit = (dir, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    const manifest = path.join(dir, '.claude-plugin', 'plugin.json');
    if (entries.some((e) => e.name === '.claude-plugin' && e.isDirectory()) && fs.existsSync(manifest)) {
      const doc = readJson(fs, manifest);
      if (isPlainObject(doc)) {
        if (isPlainObject(doc.mcpServers)) {
          pushServers(out, doc.mcpServers, manifest);
        } else if (typeof doc.mcpServers === 'string') {
          const ref = path.resolve(dir, doc.mcpServers);
          pushServers(out, serverMapOf(readJson(fs, ref)), ref);
        }
      }
      const rootMcp = path.join(dir, MCP_FILE);
      if (fs.existsSync(rootMcp)) pushServers(out, serverMapOf(readJson(fs, rootMcp)), rootMcp);
    }
    if (depth >= maxDepth) return;
    for (const e of entries) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name === '.claude-plugin') continue;
      visit(path.join(dir, e.name), depth + 1);
    }
  };

  visit(root, 0);
  return out;
}

/** Same server when the command basename and the first argument agree (`dart mcp-server`). */
function sameServer(a, b) {
  return path.basename(String(a.command)) === path.basename(String(b.command))
    && String((a.args && a.args[0]) || '') === String((b.args && b.args[0]) || '');
}

// ─── Building the managed servers ─────────────────────────────────────────────

/** The values a server's args switch off: each one following a `--disable` token, or `--disable=value`. */
function disabledSet(args) {
  const out = new Set();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--disable' && i + 1 < args.length) out.add(args[i + 1]);
    else if (args[i].startsWith('--disable=')) out.add(args[i].slice('--disable='.length));
  }
  return out;
}

/** True when every member of `a` is in `b` and `b` has at least one more. */
function isStrictSubset(a, b) {
  if (a.size >= b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function mcpEntriesOf(view) {
  const tooling = view && view.frontmatter && view.frontmatter.agent_tooling;
  return tooling && Array.isArray(tooling.mcp) ? tooling.mcp : [];
}

/**
 * buildServers(views, { which, env, userHome, fs }) -> { servers, skipped }
 *
 * `views` are resolved profile views in precedence order (root first, then each component); a
 * later view's entry replaces an earlier one of the same name, so a component's args win over the
 * root's. The one exception: an earlier entry whose `--disable` set is a strict subset of the later
 * one's is kept, because it enables more (see the comment in the loop). Each surviving entry becomes `{ command, args, env: { AOFORGE_MANAGED: 'stack' } }` —
 * args verbatim from the profile, env the ownership marker only (Q5).
 *
 * Skipped (never written), each `{ name, reason, note }`:
 *   invalid_entry       the profile entry has no string `name`/`command`
 *   declared_by_plugin  a Claude plugin under `<userHome>/.claude/plugins` already declares the
 *                       same command + first argument (a second copy would run twice)
 *   binary_missing      `which(command)` finds nothing (default: stack-verify.resolveBinary)
 */
function buildServers(views, { which = null, env = process.env, userHome = null, fs = nodeFs } = {}) {
  const lookup = which || ((name) => resolveBinary(name, { env, home: userHome || os.homedir(), fs }));

  const chosen = new Map();
  const skipped = [];
  for (const view of Array.isArray(views) ? views : []) {
    for (const entry of mcpEntriesOf(view)) {
      if (!isPlainObject(entry) || typeof entry.name !== 'string' || !entry.name
        || typeof entry.command !== 'string' || !entry.command) {
        skipped.push({
          name: isPlainObject(entry) && typeof entry.name === 'string' ? entry.name : null,
          reason: 'invalid_entry',
          note: 'agent_tooling.mcp[] needs a string name and command',
        });
        continue;
      }
      const incoming = {
        command: entry.command,
        args: Array.isArray(entry.args) ? entry.args.map(String) : [],
      };
      // Two profiles can declare one server name with different feature flags (a Flutter
      // profile and a pure-Dart one both ship `dart mcp-server`). The later view normally
      // wins, but then a pure-Dart package listed after a Flutter app would switch the
      // app's tools off for the whole repo. So when the earlier entry disables a strict
      // subset of what the later one does, it enables more and is kept. Equal or
      // incomparable sets fall through to "later wins". Decided by the args alone, never
      // by a stack's name, so the loader stays stack-neutral.
      const earlier = chosen.get(entry.name);
      if (earlier && isStrictSubset(disabledSet(earlier.args), disabledSet(incoming.args))) continue;
      chosen.delete(entry.name); // re-insert so a later view's position and args both win
      chosen.set(entry.name, incoming);
    }
  }

  const pluginServers = chosen.size > 0 ? findPluginServers(userHome, { fs }) : [];
  const servers = {};
  for (const [name, spec] of chosen) {
    const dup = pluginServers.find((p) => sameServer(p, spec));
    if (dup) {
      const where = userHome ? path.relative(String(userHome), dup.file) : dup.file;
      skipped.push({
        name,
        reason: 'declared_by_plugin',
        note: `already declared as '${dup.name}' by ${where} (${[path.basename(dup.command), ...dup.args.slice(0, 1)].join(' ')})`,
      });
      continue;
    }
    if (!lookup(spec.command)) {
      skipped.push({ name, reason: 'binary_missing', note: `${spec.command} not found on PATH or in the well-known tool dirs` });
      continue;
    }
    servers[name] = { command: spec.command, args: spec.args, env: { [MANAGED_KEY]: MANAGED_VALUE } };
  }
  return { servers, skipped };
}

// ─── Merging into .mcp.json ───────────────────────────────────────────────────

/**
 * mergeMcpJson(existing, servers) -> the new `.mcp.json` object (the input is never mutated).
 *
 * Top-level keys keep their order. Inside `mcpServers`, walking the existing entries in order:
 * a managed entry is replaced in place by the server of the same name, or dropped when the
 * profile no longer names it; every other entry is copied as-is. New servers are appended in
 * `servers` order — except one whose name a foreign entry already holds, which is left alone.
 */
function mergeMcpJson(existing, servers) {
  const base = isPlainObject(existing) ? existing : {};
  const oldServers = isPlainObject(base.mcpServers) ? base.mcpServers : {};
  const merged = {};
  for (const [name, entry] of Object.entries(oldServers)) {
    if (!isManaged(entry)) {
      merged[name] = entry;
    } else if (Object.prototype.hasOwnProperty.call(servers, name)) {
      merged[name] = servers[name];
    }
  }
  for (const [name, entry] of Object.entries(servers)) {
    if (!Object.prototype.hasOwnProperty.call(merged, name)) merged[name] = entry;
  }

  const out = {};
  let placed = false;
  for (const [key, value] of Object.entries(base)) {
    if (key === 'mcpServers') {
      out.mcpServers = merged;
      placed = true;
    } else {
      out[key] = value;
    }
  }
  if (!placed) out.mcpServers = merged;
  return JSON.parse(JSON.stringify(out));
}

/** Names in `servers` that an existing FOREIGN entry already holds (so they are not written). */
function foreignClashes(existing, servers) {
  const old = isPlainObject(existing) && isPlainObject(existing.mcpServers) ? existing.mcpServers : {};
  return Object.keys(servers).filter((name) => Object.prototype.hasOwnProperty.call(old, name) && !isManaged(old[name]));
}

// ─── Resolving the views ──────────────────────────────────────────────────────

/** The root view plus one view per component, in declared order. */
function collectViews(projectRoot, userHome) {
  const sp = require('./stack-profile.cjs'); // lazy: stack-profile loads this module lazily too
  const rootView = sp.resolveProfile({ projectRoot, userHome, file: null });
  const views = [rootView];
  const components = Array.isArray(rootView.frontmatter && rootView.frontmatter.components) ? rootView.frontmatter.components : [];
  for (const comp of components) {
    if (!comp || typeof comp.path !== 'string') continue;
    views.push(sp.resolveProfile({ projectRoot, userHome, file: path.posix.join(comp.path, PROBE_FILE) }));
  }
  return views;
}

class McpUsageError extends Error {}
class McpFileError extends Error {}

function parseMcpArgs(args) {
  const opts = { write: false };
  for (const a of args || []) {
    if (a === '--write') opts.write = true;
    else if (a === '--raw') continue;
    else throw new McpUsageError(`unknown argument '${a}'; usage: stack mcp [--write] [--raw]`);
  }
  return opts;
}

function writeAtomic(fs, file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf-8');
  fs.renameSync(tmp, file);
}

/**
 * stackMcp({ projectRoot, userHome, write, env, which, fs })
 *   -> { servers, skipped, action: 'preview'|'written'|'unchanged', path }
 *
 * Preview (the default) reads only the profile and writes nothing. `--write` reads `.mcp.json`,
 * refuses (McpFileError, file untouched) when it is not a JSON object, and writes only when the
 * merged result differs from what is on disk. No servers and no file -> nothing is created.
 */
function stackMcp({ projectRoot, userHome = null, write = false, env = process.env, which = null, fs = nodeFs } = {}) {
  const root = path.resolve(String(projectRoot));
  const file = path.join(root, MCP_FILE);
  const { servers, skipped } = buildServers(collectViews(root, userHome), { which, env, userHome, fs });

  if (!write) return { servers, skipped, action: 'preview', path: file };

  let existing = null;
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, 'utf-8');
    try {
      existing = JSON.parse(text);
    } catch (err) {
      throw new McpFileError(`${file} is not valid JSON (${err.message}); fix or remove it — refusing to write`);
    }
    if (!isPlainObject(existing)) {
      throw new McpFileError(`${file} is not a JSON object; fix or remove it — refusing to write`);
    }
  }

  for (const name of foreignClashes(existing, servers)) {
    skipped.push({ name, reason: 'foreign_entry', note: `${MCP_FILE} already has a '${name}' server AOForge does not own; left as-is` });
    delete servers[name];
  }

  if (existing === null && Object.keys(servers).length === 0) {
    return { servers, skipped, action: 'unchanged', path: file };
  }
  const next = mergeMcpJson(existing, servers);
  if (existing !== null && JSON.stringify(next) === JSON.stringify(existing)) {
    return { servers, skipped, action: 'unchanged', path: file };
  }
  writeAtomic(fs, file, `${JSON.stringify(next, null, 2)}\n`);
  return { servers, skipped, action: 'written', path: file };
}

/**
 * cli(cwd, args, raw, { userHome }) — `aof-tools stack mcp [--write]`. `args` excludes the `mcp`
 * token (the STACK_EXTENSIONS contract). Prints the result as JSON in both modes; exit 1 only on
 * a usage error, an unreadable profile, or an unparseable `.mcp.json` under `--write`.
 */
function cli(cwd, args, raw, { userHome = null } = {}) {
  const { output, error } = require('./helpers.cjs');
  let result;
  try {
    const opts = parseMcpArgs(args);
    result = stackMcp({ projectRoot: cwd, userHome: userHome || os.homedir(), write: opts.write });
  } catch (err) {
    error(err instanceof McpUsageError ? `stack mcp: ${err.message}` : err.message);
    return;
  }
  output(result, raw);
}

module.exports = {
  MANAGED_VALUE,
  MANAGED_KEY,
  isManaged,
  findPluginServers,
  buildServers,
  mergeMcpJson,
  foreignClashes,
  collectViews,
  stackMcp,
  parseMcpArgs,
  cli,
};
